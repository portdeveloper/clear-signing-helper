// Read-only verification for the pinned Morpho exercise. No keys or transaction methods.
import assert from 'node:assert/strict';
import {keccak256} from 'ethers';

const address = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
const expectedHash = '0x1a1be3a89d00dca7561fa7277a351dff77baf385083e80ae0cffe7d4cf21d169';
const supplied = process.argv.slice(2);
const endpoints = supplied.length ? supplied : ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'];
assert.ok(endpoints.length >= 2, 'Supply at least two Ethereum RPC endpoints');
let requestId = 0;
async function rpc(endpoint: string, method: string, params: unknown[]) {
  const response = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: ++requestId, method, params}), signal: AbortSignal.timeout(15000)});
  assert.equal(response.status, 200, `RPC HTTP ${response.status}`);
  const data = await response.json() as any;
  assert.equal(data.error, undefined, `RPC method ${method} failed`);
  assert.notEqual(data.result, undefined, `RPC method ${method} returned no result`);
  return data.result;
}
const finalized = await rpc(endpoints[0], 'eth_getBlockByNumber', ['finalized', false]);
assert.match(finalized.number, /^0x[0-9a-f]+$/i);
assert.match(finalized.hash, /^0x[0-9a-f]{64}$/i);
const results = [];
for (const [index, endpoint] of endpoints.entries()) {
  assert.equal(await rpc(endpoint, 'eth_chainId', []), '0x1', 'Must be Ethereum mainnet');
  const block = await rpc(endpoint, 'eth_getBlockByNumber', [finalized.number, false]);
  assert.equal(block.hash, finalized.hash, 'Providers must agree on the finalized block');
  const code = await rpc(endpoint, 'eth_getCode', [address, finalized.number]);
  assert.match(code, /^0x(?:[0-9a-f]{2})+$/i);
  const bytes = Buffer.from(code.slice(2), 'hex');
  assert.ok(bytes.length > 2);
  const metadataBytes = bytes.readUInt16BE(bytes.length - 2) + 2;
  assert.ok(metadataBytes > 2 && metadataBytes < bytes.length);
  const executable = bytes.subarray(0, bytes.length - metadataBytes);
  assert.equal(executable.length, 15570);
  assert.equal(keccak256(executable), expectedHash, 'Runtime must match the compiled, constructor-bound Morpho code');
  assert.equal((await rpc(endpoint, 'eth_getBlockByNumber', [finalized.number, false])).hash, finalized.hash);
  results.push({provider: supplied.length ? `provided-endpoint-${index + 1}` : endpoint, chainId: 1, address,
    blockNumber: Number(BigInt(finalized.number)), blockHash: finalized.hash, runtimeBytes: bytes.length,
    executableBytes: executable.length, executableKeccak256: keccak256(executable),
    fullRuntimeKeccak256: keccak256(code), runtimeCode: code, matchesCompiledBoundRuntime: true});
}
assert.equal(new Set(results.map(r => r.fullRuntimeKeccak256)).size, 1, 'Full bytecode must agree across endpoints');
console.log(JSON.stringify({checkedAt: new Date().toISOString(), sourceCommit: 'c3f327e49ddae623e2e3162f8468d58fbb79d1b8',
  expectedFrom: 'docs/evidence/morpho-submission/deployment-check.json', results,
  limitation: 'Read-only runtime evidence at the recorded finalized block; not proxy discovery, semantic approval, or a general CLI deployment-verification feature.'}, null, 2));
