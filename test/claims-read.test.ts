import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FunctionFragment } from 'ethers';
import { claimsOf } from '../src/claims.js';

// What the screen is taken to claim: fees, a value at its threshold and a zero placeholder claim nothing;
// the value sent is a ceiling; a native argument beside the shown value sent is a part of it.
test('claims: fees, thresholds and zero placeholders make no claim; the value sent is a maximum', () => {
  const fn = FunctionFragment.from('function send(uint256 amount, uint256 maxFee, uint256 all, uint256 assets, uint256 callValue) payable');
  const token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', max = (1n << 256n) - 1n;
  const d: any = {metadata: {constants: {max: '0x' + max.toString(16)}}, display: {formats: {[fn.format('full').replace(/^function /, '').replace(/ payable$/, '')]: {intent: 'Send', fields: [
    {path: 'amount', label: 'Amount', format: 'tokenAmount', params: {token}},
    {path: 'maxFee', label: 'Max fee', format: 'tokenAmount', params: {token}},
    {path: 'all', label: 'Amount to withdraw', format: 'tokenAmount', params: {token, threshold: '$.metadata.constants.max', message: 'All'}},
    {path: 'assets', label: 'Assets (0 if shares)', format: 'tokenAmount', params: {token}},
    {path: 'callValue', label: 'Amount on L2', format: 'amount'},
    {path: '@.value', label: 'ETH sent', format: 'amount'},
  ]}}}};
  const tx = {from: '0x' + '11'.repeat(20), to: '0x' + '22'.repeat(20), value: 105n};
  const claims = claimsOf(d, fn, {amount: 20n, maxFee: 0n, all: max, assets: 0n, callValue: 100n}, tx);
  assert.deepEqual(claims.map(c => [c.path, c.kind, c.total]), [['amount', 'exact', undefined], ['callValue', 'exact', 105n], ['@.value', 'maximum', undefined]]);
  // Below its threshold the number is what the wallet shows, so it is a claim again.
  assert.ok(claimsOf(d, fn, {amount: 20n, maxFee: 0n, all: 7n, assets: 0n, callValue: 100n}, tx).some(c => c.path === 'all' && c.amount === 7n));
});
