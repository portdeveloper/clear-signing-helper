import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-signing-release-'));
const env = { ...process.env, npm_config_ignore_scripts: 'true' };
const run = (command, args, cwd = root, options = {}) => execFileSync(command, args, { cwd, env, stdio: 'inherit', ...options });
const capture = (command, args, cwd) => execFileSync(command, args, { cwd, env, encoding: 'utf8' });
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const copySource = destination => fs.cpSync(root, destination, {
  recursive: true,
  filter: source => {
    const relative = path.relative(root, source);
    return !['node_modules', 'dist', 'release', '.git'].includes(relative) && !relative.startsWith('node_modules' + path.sep) && !relative.startsWith('release' + path.sep) && !relative.endsWith('.tgz');
  },
});
const pack = (cwd, destination) => {
  fs.mkdirSync(destination, { recursive: true });
  const result = capture(npm, ['pack', '--ignore-scripts', '--pack-destination', destination, '--json'], cwd);
  return path.join(destination, JSON.parse(result)[0].filename);
};
const cli = (consumer, ...args) => run(process.execPath, [path.join(consumer, 'node_modules', 'clear-signing-helper', 'dist', 'cli.js'), ...args], consumer);

try {
  const copies = [path.join(temp, 'source-a'), path.join(temp, 'source with spaces')];
  const builds = copies.map(destination => {
    copySource(destination);
    run(npm, ['ci', '--ignore-scripts'], destination);
    run(npm, ['run', 'build'], destination);
    return destination;
  });
  const distDigests = builds.map(source => digest(path.join(source, 'dist', 'cli.js')));
  if (distDigests[0] !== distDigests[1]) throw new Error('independent clean builds differ');
  const tarballs = builds.map((source, i) => pack(source, path.join(temp, `pack-${i}`)));
  const tarDigests = tarballs.map(digest);
  if (tarDigests[0] !== tarDigests[1]) throw new Error('independent npm pack outputs differ');

  const extracted = path.join(temp, 'extracted');
  fs.mkdirSync(extracted);
  run('tar', ['-xzf', tarballs[0], '-C', extracted]);
  const packedRoot = path.join(extracted, 'package');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packedRoot, 'package.json'), 'utf8'));
  if (packageJson.license !== 'MIT') throw new Error('release must declare the approved MIT license');
  if (fs.readFileSync(path.join(packedRoot, 'LICENSE'), 'utf8') !== fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')) throw new Error('packed MIT license differs from the source');
  if (packageJson.scripts?.postinstall) throw new Error('release contains a postinstall mutation hook');
  for (const required of ['vendor/clear-signing/LICENSE', 'vendor/clear-signing/PROVENANCE.md', 'scripts/verify-renderer.mjs', 'docs/THIRD-PARTY-NOTICES.md']) {
    if (!fs.existsSync(path.join(packedRoot, required))) throw new Error(`release is missing ${required}`);
  }
  // The package carries code and what a user or a licence needs, never maintainer or agent notes (PRD,
  // release handoffs, validation write-ups, agent skills). Anything else fails the release.
  const shipped = (dir, prefix = '') => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? shipped(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
  const allowed = f => /^(dist|schemas)\//.test(f) || f.startsWith('vendor/clear-signing/') || ['package.json', 'README.md', 'LICENSE', 'docs/THIRD-PARTY-NOTICES.md', 'scripts/verify-renderer.mjs'].includes(f);
  const unexpected = shipped(packedRoot).filter(f => !allowed(f));
  if (unexpected.length) throw new Error(`release ships files outside the allowed set: ${unexpected.join(', ')}`);

  const consumer = path.join(temp, 'consumer');
  fs.mkdirSync(consumer);
  run(npm, ['init', '--yes'], consumer);
  run(npm, ['install', '--ignore-scripts', '--no-package-lock', tarballs[0]], consumer);
  const installed = path.join(consumer, 'node_modules', 'clear-signing-helper');
  if (!fs.existsSync(path.join(installed, 'dist', 'cli.js'))) throw new Error('clean package install did not contain dist/cli.js');
  const installedVersion = capture(process.execPath, [path.join(installed, 'dist', 'cli.js'), '--version'], consumer).trim();
  if (installedVersion !== packageJson.version) throw new Error('installed CLI version differs from package version');
  cli(consumer, '--help');

  const smoke = path.join(temp, 'foundry-smoke');
  fs.cpSync(path.join(root, 'examples', 'standard'), smoke, { recursive: true, filter: source => !['out', 'cache', 'clear-signing', '.clear-signing-cache', 'clear-signing.toml'].includes(path.basename(source)) });
  fs.writeFileSync(path.join(smoke, 'src/ReleaseSigned.sol'), '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.28; contract ReleaseSigned { function set(int24 amount) external {} }\n');
  run('forge', ['build', '--root', smoke]);
  cli(consumer, '--root', smoke, 'init', '--contract', 'src/AssetVault.sol:AssetVault', '--owner', 'Release verifier');
  cli(consumer, '--root', smoke, 'fixture', '--no-build', '--name', 'release', '--contract', 'src/AssetVault.sol:AssetVault', '--function', 'deposit(uint256,address)', '--args', '["1000000","0x0000000000000000000000000000000000000002"]', '--chain-id', '31337', '--to', '0x0000000000000000000000000000000000000001', '--local');
  cli(consumer, '--root', smoke, 'preview', '--no-build', '--fixture', 'clear-signing/fixtures/release.json');
  cli(consumer, '--root', smoke, 'init', '--no-build', '--contract', 'src/ReleaseSigned.sol:ReleaseSigned');
  cli(consumer, '--root', smoke, 'fixture', '--no-build', '--name', 'signed-release', '--contract', 'src/ReleaseSigned.sol:ReleaseSigned', '--function', 'set(int24)', '--args', '["-8388608"]', '--chain-id', '31337', '--to', '0x0000000000000000000000000000000000000001', '--local');
  const signedPreview = JSON.parse(capture(process.execPath, [path.join(installed, 'dist/cli.js'), '--root', smoke, '--no-build', '--json', 'preview', '--fixture', 'clear-signing/fixtures/signed-release.json'], consumer));
  if (!signedPreview.ok || signedPreview.result.fields[0]?.value !== '-8388608' || signedPreview.result.warnings.length) throw Error('Installed bundled CLI did not render int24 minimum exactly');
  const signedCheck = path.join(consumer, 'signed-check.mjs');
  fs.writeFileSync(signedCheck, `import { Interface } from 'ethers';\nimport { format } from '@ethereum-sourcify/clear-signing';\nconst to='0x0000000000000000000000000000000000000001';\nconst iface=new Interface(['function set(int24 value)']);\nconst data=iface.encodeFunctionData('set',[-1n]);\nconst descriptor={$schema:'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json',context:{contract:{deployments:[{chainId:31337,address:to}]}},metadata:{owner:'release',contractName:'Signed'},display:{formats:{'set(int24 value)':{intent:'Set',fields:[{path:'value',label:'Value',format:'raw'}]}}}};\nconst result=await format({chainId:31337,to,data,value:0n},{descriptorResolverOptions:{type:'custom',resolver:{index:{calldataIndex:{['eip155:31337:'+to]:'local.json'},typedDataIndex:{}},fetchDescriptor:async()=>descriptor}}});\nif(result.fields?.[0]?.value!=='-1') throw new Error('signed integer renderer check failed');\n`);
  run(process.execPath, [signedCheck], consumer);

  const rollbackMarker = path.join(consumer, 'consumer-data.txt');
  fs.writeFileSync(rollbackMarker, 'preserve consumer data\n');
  const previousTarball = path.join(root, 'clear-signing-helper-0.2.0.tgz');
  const hasPriorCandidate = fs.existsSync(previousTarball) && digest(previousTarball) !== tarDigests[0];
  if (hasPriorCandidate) {
    run(npm, ['install', '--ignore-scripts', '--no-package-lock', previousTarball], consumer);
    run(npm, ['install', '--ignore-scripts', '--no-package-lock', tarballs[0]], consumer);
    run(npm, ['install', '--ignore-scripts', '--no-package-lock', previousTarball], consumer);
  } else {
    run(npm, ['install', '--ignore-scripts', '--no-package-lock', tarballs[1]], consumer);
    run(npm, ['install', '--ignore-scripts', '--no-package-lock', tarballs[0]], consumer);
  }
  if (fs.readFileSync(rollbackMarker, 'utf8') !== 'preserve consumer data\n') throw new Error('upgrade/rollback removed consumer data');
  cli(consumer, '--help');

  const releaseDir = path.join(root, 'release');
  fs.mkdirSync(releaseDir, { recursive: true });
  const finalTarball = path.join(releaseDir, path.basename(tarballs[0]));
  fs.copyFileSync(tarballs[0], finalTarball);
  const evidence = {
    generatedAt: new Date().toISOString(),
    version: packageJson.version,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    forge: capture('forge', ['--version']).trim().split('\n')[0],
    cleanSources: copies.map(p => path.basename(p)),
    distSha256: distDigests[0],
    packageSha256: tarDigests[0],
    package: path.relative(root, finalTarball),
    priorPackageSha256: hasPriorCandidate ? digest(previousTarball) : null,
    checks: ['clean npm ci --ignore-scripts', 'independent build equality', 'independent npm pack equality', 'clean consumer install', 'installed CLI version matches package', 'Foundry fixture and preview', 'installed bundled CLI int24 minimum', 'signed int24 renderer', hasPriorCandidate ? 'upgrade and rollback between distinct local candidate builds; consumer data preserved' : 'same-build reinstall; no prior candidate provided'],
  };
  fs.writeFileSync(path.join(releaseDir, 'release-verification.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  fs.writeFileSync(finalTarball + '.sha256', `${tarDigests[0]}  ${path.basename(finalTarball)}\n`);
  console.log(`Release verified: ${finalTarball} (${tarDigests[0]})`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
