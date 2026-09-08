// Replays pinned source pilots against an isolated, disposable Anvil only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {JsonRpcProvider, ContractFactory, keccak256} from 'ethers';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [prepared, evidencePath] = process.argv.slice(2);
if (!prepared || !evidencePath) throw Error('Usage: node scripts/run-source-pilots.mjs <prepared-source-parent> <new-evidence-directory>');
const out = path.resolve(evidencePath);
assert.ok(!fs.existsSync(out), 'Evidence directory must be new');
fs.mkdirSync(out, {recursive: true});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-complete-pilots-'));
const steps = [];
const run = (name, command, args, cwd = repo) => {
  const start = Date.now();
  try {
    const stdout = execFileSync(command, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 660000, maxBuffer: 64 * 1024 * 1024});
    fs.writeFileSync(path.join(out, `${name}.log`), stdout);
    steps.push({name, command, args, ms: Date.now() - start, exitCode: 0});
    return stdout;
  } catch (e) {
    fs.writeFileSync(path.join(out, `${name}.log`), String(e.stdout ?? '') + String(e.stderr ?? ''));
    steps.push({name, command, args, ms: Date.now() - start, exitCode: e.status});
    throw e;
  }
};
const plans = [
  {name: 'openzeppelin-contracts', commit: 'dbb6104ce834628e473d2173bbc9d47f81a9eec3', contract: 'contracts/mocks/token/ERC4626Mock.sol:ERC4626Mock'},
  {name: 'uniswap-v3-periphery', commit: '80f26c86c57b8a5e4b913f42844d4c8bd274d058', contract: 'contracts/SwapRouter.sol:SwapRouter'}
];
const provenance = {prepared, sourcePlans: plans, steps, transactionsBroadcast: 'local disposable Anvil only', pilots: []};
let anvil, provider;
try {
  run('helper-build', 'npm', ['run', 'build']);
  const packed = JSON.parse(run('package', 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp]))[0];
  const tarball = path.join(temp, packed.filename);
  provenance.packageSha256 = createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
  const consumer = path.join(temp, 'consumer');
  fs.mkdirSync(consumer);
  run('install', 'npm', ['install', '--prefix', consumer, '--ignore-scripts', '--no-package-lock', tarball]);
  const cli = path.join(consumer, 'node_modules/clear-signing-helper/dist/cli.js');
  for (const plan of plans) {
    const original = path.resolve(prepared, plan.name), project = path.join(temp, plan.name);
    run(`${plan.name}-clone`, 'git', ['clone', '--quiet', '--no-hardlinks', original, project]);
    run(`${plan.name}-checkout`, 'git', ['checkout', '--quiet', '--detach', plan.commit], project);
    assert.equal(run(`${plan.name}-commit`, 'git', ['rev-parse', 'HEAD'], project).trim(), plan.commit);
    assert.equal(run(`${plan.name}-initial-status`, 'git', ['status', '--porcelain'], project).trim(), '');
    if (fs.existsSync(path.join(project, '.gitmodules'))) run(`${plan.name}-submodules`, 'git', ['submodule', 'update', '--init', '--recursive'], project);
    else {
      plan.dependencies = [];
      for (const dependency of fs.readdirSync(path.join(original, 'lib')).sort()) {
        const from = path.join(original, 'lib', dependency), to = path.join(project, 'lib', dependency);
        const commit = run(`${plan.name}-${dependency}-pin`, 'git', ['rev-parse', 'HEAD'], from).trim();
        const remote = run(`${plan.name}-${dependency}-remote`, 'git', ['remote', 'get-url', 'origin'], from).trim();
        run(`${plan.name}-${dependency}-clone`, 'git', ['clone', '--quiet', '--no-hardlinks', from, to]);
        run(`${plan.name}-${dependency}-checkout`, 'git', ['checkout', '--quiet', '--detach', commit], to);
        plan.dependencies.push({dependency, commit, remote});
      }
    }
    fs.copyFileSync(path.join(original, 'foundry.toml'), path.join(project, 'foundry.toml'));
    // The exploratory adapter used an unrecognized `exclude` option. The full
    // source compiles, so remove that ineffective line without excluding code.
    fs.writeFileSync(path.join(project, 'foundry.toml'), fs.readFileSync(path.join(project, 'foundry.toml'), 'utf8').replace(/^exclude=.*\n?/gm, ''));
    fs.copyFileSync(path.join(project, 'foundry.toml'), path.join(out, `${plan.name}-foundry.toml`));
    const license = ['LICENSE', 'LICENSE.md'].find(name => fs.existsSync(path.join(project, name)));
    if (license) fs.copyFileSync(path.join(project, license), path.join(out, `${plan.name}-LICENSE`));
    run(`${plan.name}-build`, 'forge', ['build', '--offline', '--extra-output', 'metadata', 'devdoc', 'userdoc'], project);
    plan.project = project;
  }
  // Select an unused loopback port without touching existing development nodes.
  const net = await import('node:net');
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const fd = fs.openSync(path.join(out, 'anvil.log'), 'w');
  anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--silent'], {stdio: ['ignore', fd, fd]});
  fs.closeSync(fd);
  provider = new JsonRpcProvider(`http://127.0.0.1:${port}`, undefined, {pollingInterval: 50});
  for (let attempt = 0; ; attempt++) {
    try { assert.equal(await provider.send('eth_chainId', []), '0x7a69'); break; }
    catch (e) { if (attempt === 30 || anvil.exitCode !== null) throw e; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const signer = await provider.getSigner(0), sender = await signer.getAddress();
  const receipts = [];
  const deploy = async (project, filename, name, args = []) => {
    const artifactPath = path.join(project, 'out', filename, `${name}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const instance = await new ContractFactory(artifact.abi, artifact.bytecode.object, signer).deploy(...args);
    await instance.waitForDeployment();
    const receipt = await instance.deploymentTransaction().wait();
    assert.equal(receipt.status, 1);
    const address = await instance.getAddress(), code = await provider.getCode(address);
    assert.notEqual(code, '0x');
    receipts.push({name, address, chainId: 31337, transactionHash: receipt.hash, blockNumber: receipt.blockNumber,
      artifactSha256: createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex'), runtimeKeccak256: keccak256(code)});
    return instance;
  };
  const oz = plans[0].project, uni = plans[1].project;
  const token = await deploy(oz, 'ERC20Mock.sol', 'ERC20Mock');
  const vault = await deploy(oz, 'ERC4626Mock.sol', 'ERC4626Mock', [await token.getAddress()]);
  // Real router source, placeholder local dependencies: no claim of an executable swap.
  const router = await deploy(uni, 'SwapRouter.sol', 'SwapRouter', [sender, await token.getAddress()]);
  for (const tx of [await token.mint(sender, 1000000n), await token.approve(await vault.getAddress(), 1000000n), await vault.deposit(1000000n, sender)]) {
    const receipt = await tx.wait(); assert.equal(receipt.status, 1);
    receipts.push({transactionHash: receipt.hash, blockNumber: receipt.blockNumber, status: receipt.status, to: tx.to, data: tx.data});
  }
  assert.equal(await token.balanceOf(await vault.getAddress()), 1000000n);
  assert.equal(await vault.balanceOf(sender), 1000000n);
  assert.equal(await vault.totalAssets(), 1000000n);
  fs.writeFileSync(path.join(out, 'local-chain-evidence.json'), JSON.stringify({chainId: 31337, sender, receipts,
    depositedAssets: '1000000', receivedShares: '1000000', routerSwapExecution: 'not attempted; local placeholder dependencies'}, null, 2));
  for (const [index, instance] of [vault, router].entries()) {
    const plan = plans[index], address = await instance.getAddress();
    run(`${plan.name}-workflow`, process.execPath, [path.join(repo, 'node_modules/tsx/dist/cli.mjs'), path.join(repo, 'scripts/complete-source-pilot.ts'),
      plan.project, plan.contract, address, '31337', cli, path.join(out, plan.name)]);
    fs.cpSync(path.join(plan.project, 'pilot-bundle'), path.join(out, plan.name, 'bundle'), {recursive: true});
    fs.copyFileSync(path.join(plan.project, 'clear-signing.toml'), path.join(out, plan.name, 'clear-signing.toml'));
    provenance.pilots.push({name: plan.name, address, contract: plan.contract, result: 'strict check/test/export passed',
      fixtures: JSON.parse(fs.readFileSync(path.join(out, plan.name, 'timings.json'), 'utf8')).fixtureCount});
  }
  provenance.completed = true;
} finally {
  provider?.destroy();
  if (anvil && anvil.exitCode === null) { anvil.kill('SIGTERM'); await new Promise(resolve => anvil.once('exit', resolve)); }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(provenance, null, 2));
  fs.rmSync(temp, {recursive: true, force: true});
}
