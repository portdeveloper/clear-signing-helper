import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { loadState, init, checkClaims } from '../src/app.js';
import { writeJson } from '../src/io.js';

// A mined StopSwap.buy on a local Anvil chain is the "real transaction"; the claims check forks that chain at
// the block before it. stopAt is the argument the screen does not explain: nonzero, the call succeeds and
// delivers less than "Amount to Receive", which is the sqrtPriceLimitX96 case of registry #3135.
await test('claims: a hidden argument that voids an exact amount is found, and mustMatch removes the finding', {timeout: 120_000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-signing-claims-'));
  fs.cpSync(path.resolve('examples/claims'), root, {recursive: true, filter: src => !['out', 'cache', 'clear-signing', 'clear-signing.toml'].includes(path.basename(src))});
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as {port: number}).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const anvil = spawn('anvil', ['--host', '127.0.0.1', '--port', String(port), '--silent'], {stdio: 'ignore'});
  t.after(() => anvil.kill('SIGTERM'));
  let launchError: Error | undefined; anvil.on('error', error => { launchError = error; });
  const url = `http://127.0.0.1:${port}`, rpc = new JsonRpcProvider(url, 31337, {staticNetwork: true}); rpc.pollingInterval = 50; t.after(() => rpc.destroy());
  for (let i = 0; i < 60; i++) { if (launchError) throw launchError; try { await rpc.getBlockNumber(); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); } }
  init({root, contract: ['src/StopSwap.sol:StopSwap'], owner: 'Claims reference'});
  const signer = await rpc.getSigner(0), recipient = await (await rpc.getSigner(1)).getAddress();
  const artifact = (name: string) => JSON.parse(fs.readFileSync(path.join(root, `out/StopSwap.sol/${name}.json`), 'utf8'));
  const deploy = async (name: string, ...args: unknown[]) => { const a = artifact(name), c: any = await new ContractFactory(a.abi, a.bytecode.object, signer).deploy(...args); await c.waitForDeployment(); return c; };
  const tokenIn = await deploy('PlainToken'), tokenOut = await deploy('PlainToken');
  const swap = await deploy('StopSwap', await tokenIn.getAddress(), await tokenOut.getAddress());
  await (await tokenIn.mint(await signer.getAddress(), 1000n)).wait();
  await (await tokenOut.mint(await swap.getAddress(), 1000n)).wait();
  await (await tokenIn.approve(await swap.getAddress(), 1000n)).wait();
  const receipt = await (await swap.buy(100n, 100n, 0n, recipient, 4_000_000_000n, 4_000_000_000n)).wait();
  const tx = (await rpc.getTransaction(receipt.hash))!;

  const write = (stopAt: Record<string, unknown>, expires: Record<string, unknown> = {format: 'date', params: {encoding: 'timestamp'}}) => {
    const state = loadState({root}), selection = state.config.contracts[0], d = state.descriptors.get(selection.id)!;
    d.context.contract.deployments = [{chainId: 31337, address: String(swap.target)}];
    const key = Object.keys(d.display.formats).find(k => k.startsWith('buy('))!;
    d.display.formats[key] = {intent: 'Buy', fields: [
      {path: 'amountOut', label: 'Amount to Receive', format: 'tokenAmount', params: {token: String(tokenOut.target)}},
      {path: 'amountInMaximum', label: 'Maximum to Pay', format: 'tokenAmount', params: {token: String(tokenIn.target)}},
      {path: 'stopAt', label: 'Stop At', ...stopAt},
      {path: 'recipient', label: 'Recipient', format: 'addressName', params: {sources: ['local']}},
      {path: 'deadline', label: 'Deadline', format: 'date', params: {encoding: 'timestamp'}},
      {path: 'expires', label: 'Expires', ...expires}]} as any;
    writeJson(path.join(root, selection.descriptor), d);
    return selection.id;
  };
  const id = write({format: 'raw', visible: 'never'});
  writeJson(path.join(root, 'clear-signing/fixtures/buy.json'), {contract: id, chainId: 31337, to: tx.to, data: tx.data, value: '0', from: tx.from, txHash: tx.hash});
  const lines: string[] = [];
  const hidden = await checkClaims(loadState({root}), {contract: id, rpcUrl: url, budget: 100, log: line => lines.push(line)});
  const r = hidden.results[0];
  assert.equal(r.status, 'checked');
  assert.match(r.claims.find(c => c.claim.startsWith('"Amount to Receive"'))!.baseline, /^holds/);
  const finding = hidden.findings.find(f => f.argument === 'stopAt');
  assert.ok(finding, `expected a stopAt finding, got ${JSON.stringify(hidden.findings)}`);
  assert.equal(finding.kind, 'argument');
  assert.match(finding.claim, /^"Amount to Receive"/);
  // The limit itself is a true maximum, so it never produces a finding.
  assert.ok(!hidden.findings.some(f => f.claim.startsWith('"Maximum to Pay"')));
  // A shown argument the contract ignores is found; a checked deadline (it reverts at 0) is not.
  assert.deepEqual(hidden.findings.filter(f => f.kind === 'ignored').map(f => f.argument), ['expires']);

  write({format: 'raw', visible: {mustMatch: [0]}}, {format: 'raw', visible: 'never'});
  const pinned = await checkClaims(loadState({root}), {contract: id, rpcUrl: url, budget: 100, log: () => {}});
  assert.deepEqual(pinned.findings, []);
});
