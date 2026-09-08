import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Interface, getAddress} from 'ethers';
import {scaffold, validateDescriptor, type Descriptor} from '../src/descriptors.js';
import {blockingWarnings, renderFixture, validateFixture, type Fixture} from '../src/fixtures.js';
import {previewHtml} from '../src/preview.js';
import {expandNestedFields} from '../src/expansion.js';
import {Failure, assertTreeBudget} from '../src/io.js';
import {displayText, humanOutput} from '../src/output.js';
import type {Contract} from '../src/foundry.js';

const target = '0x0000000000000000000000000000000000000001';
const token = '0x0000000000000000000000000000000000000002';

function contract(signature: string): Contract {
  const iface = new Interface([`function ${signature}`]);
  return {id: 'src/Test.sol:Test', source: 'src/Test.sol', name: 'Test', artifact: '',
    abi: JSON.parse(iface.formatJson()), functions: iface.fragments.filter((f: any) => f.type === 'function') as any,
    special: [], metadata: {}};
}

function selection(c: Contract) { return {id: c.id, descriptor: 'descriptor.json', exclusions: {}}; }

function fixture(c: Contract, args: unknown[], value = '0'): Fixture {
  const iface = new Interface(c.abi);
  const fn = c.functions[0];
  return {contract: c.id, chainId: 31337, to: target, data: iface.encodeFunctionData(fn, args), value, localBinding: true};
}

test('payable formats cannot hide the native value from the signing view', () => {
  const c = contract('deposit(uint256 amount) payable');
  const d = scaffold(c, 'Example');
  const format = Object.values(d.display.formats)[0];
  format.fields = format.fields.filter((field: any) => field.path !== '@.value');
  const errors = validateDescriptor(d, c, selection(c));
  assert.ok(errors.some(e => e.code === 'UNDISPLAYED_NATIVE_VALUE'),
    `expected native value coverage diagnostic, got ${JSON.stringify(errors)}`);
});

test('calldata validation rejects truncation, odd hex, oversized input, and nonzero value on nonpayable calls', async () => {
  const c = contract('set(uint256 value)');
  const d = scaffold(c, 'Example');
  const good = fixture(c, [7]);
  await assert.rejects(() => renderFixture({...good, data: good.data.slice(0, -2)}, d, c), Failure);
  assert.throws(() => validateFixture({...good, data: `${good.data}0`}), Failure);
  assert.throws(() => validateFixture({...good, data: `${good.data}${'00'.repeat(65536)}`}), Failure);
  await assert.rejects(() => renderFixture({...good, value: '1'}, d, c), Failure);
  await assert.rejects(() => renderFixture({...good, value: '1'}, d, c), /cannot receive native value/);
});

test('binding is case insensitive and duplicate metadata addresses are rejected', () => {
  const c = contract('set(uint256 value)');
  const d = scaffold(c, 'Example');
  const f = fixture(c, [1]);
  f.tokens = {[token]: {name: 'T', symbol: 'T', decimals: 18}};
  f.addressNames = {[token]: 'same'};
  assert.throws(() => validateFixture({...f, tokens: {[token]: {name: 'T', symbol: 'T', decimals: 18}, [token.toUpperCase()]: {name: 'T2', symbol: 'T2', decimals: 18}}}), /duplicate/i);
  assert.throws(() => validateFixture({...f, tokens: {[target]: {name: '', symbol: 'T', decimals: 18}}}), /needs name/i);
  assert.throws(() => validateFixture({...f, tokens: null as any}), Failure);
  assert.throws(() => validateFixture({...f, addressNames: null as any}), Failure);
  const bound = structuredClone(d);
  const checksummed = getAddress('0x00000000000000000000000000000000000000ab');
  bound.context.contract.deployments = [{chainId: 31337, address: checksummed.toLowerCase()}];
  const mixed = {...f, localBinding: undefined, to: checksummed};
  return renderFixture(mixed, bound, c).then(r => assert.equal(r.localBinding, false));
});

test('nested expansion has deterministic node and field ceilings', () => {
  const c = contract('set(uint256[][] values)');
  const d = scaffold(c, 'Example');
  const args = [Array.from({length: 65}, () => Array.from({length: 65}, (_, i) => i))];
  const nested = d.display.formats[Object.keys(d.display.formats)[0]].fields;
  assert.throws(() => expandNestedFields(nested, c.functions[0], args), /RENDER_LIMIT|nodes|fields/i);
});

test('hostile labels and metadata remain inert in the reference rendering', async () => {
  const c = contract('set(string memo)');
  const d = scaffold(c, 'Example');
  const spec = d.display.formats[Object.keys(d.display.formats)[0]];
  spec.intent = '<img src=x onerror=alert(1)>';
  spec.fields[0].label = '" onmouseover="alert(1)';
  const r = await renderFixture({...fixture(c, ['<script>alert(1)</script>']), addressNames: {[target]: '<b>bad</b>'}}, d, c);
  assert.equal(blockingWarnings(r).length, 0);
  assert.ok(r.intent.includes('<img'));
  const html = previewHtml(r);
  assert.ok(html.includes('&lt;img') && !html.includes('<img src=x'));
});

test('terminal controls and bidi overrides are escaped only at human-output boundaries', () => {
  const hostile = 'Alice\u0007\u001b[31m\u202eFD';
  assert.equal(displayText(hostile), 'Alice\\u0007\\u001b[31m\\u202eFD');
  const rendering = {intent: hostile, localBinding: false, chainId: 1, to: target,
    value: '0', contract: 'src/Test.sol:Test', signature: 'set(uint256)', fields: [{label: hostile, value: hostile}], warnings: []};
  const text = humanOutput(rendering);
  assert.ok(text.includes('\\u0007') && text.includes('\\u001b') && text.includes('\\u202e'));
  assert.ok(!text.includes('\u0007') && !text.includes('\u001b') && !text.includes('\u202e'));
});

test('seeded ABI corpus preserves integer boundaries and rejects calldata mutations', async () => {
  let seed = 0x5eed1234;
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  for (const type of ['uint8', 'uint16', 'uint32', 'uint64', 'uint128', 'uint256', 'int8', 'int16', 'int32', 'int64', 'int128', 'int256']) {
    const c = contract(`set(${type} value)`), d = scaffold(c, 'Example'), iface = new Interface(c.abi);
    const bits = Number(type.replace(/\D/g, ''));
    const max = type.startsWith('uint') ? (1n << BigInt(bits)) - 1n : (1n << BigInt(bits - 1)) - 1n;
    const min = type.startsWith('uint') ? 0n : -(1n << BigInt(bits - 1));
    const values = [min, max, 0n, type.startsWith('uint') ? 1n : -1n,
      ...Array.from({length: 12}, () => (BigInt(next()) << 32n | BigInt(next())) & max)];
    for (const value of values) {
      const f = fixture(c, [value]);
      const r = await renderFixture(f, d, c);
      assert.equal(r.fields[0].value, value.toString(), `${type} boundary`);
      for (const data of [f.data.slice(0, -2), `${f.data}00`, `${f.data.slice(0, 10)}${f.data.slice(12)}`]) {
        try {
          const mutated = await renderFixture({...f, data}, d, c);
          const encoded = iface.encodeFunctionData(c.functions[0], [BigInt(mutated.fields[0].value)]);
          assert.equal(encoded.toLowerCase(), data.toLowerCase(), `${type} accepted mutation must roundtrip`);
        } catch (error) {
          assert.ok(error instanceof Failure, `${type} mutation threw an untyped error`);
        }
      }
    }
  }
});

test('nested dynamic and fixed array corpus preserves indexed order and rejects bad ABI offsets', async () => {
  const c = contract('set((uint256[] values,address who)[][2] rows)'), d = scaffold(c, 'Example');
  const iface = new Interface(c.abi);
  const cases: any[] = [
    [[[[1, 2], target], [[], target]], [[[3], target]]],
    [[[[], target]], []],
    [[], []],
  ];
  let seed = 0x1730;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let sample = 0; sample < 128; sample++) cases.push(Array.from({length: 2}, () =>
    Array.from({length: next() % 4}, () => [Array.from({length: next() % 5}, () => next()),
      `0x${next().toString(16).padStart(40, '0')}`])));
  for (const rows of cases) {
    const args = [rows];
    const f = fixture(c, args);
    const r = await renderFixture(f, d, c);
    const leaves = (xs: any[]): string[] => xs.flatMap(x => x.fields ? leaves(x.fields) : [x.value]);
    const expected: string[] = [];
    const walk = (x: any): void => { if (Array.isArray(x)) x.forEach(walk); else expected.push(typeof x === 'string' ? getAddress(x) : String(x)); };
    walk(args);
    assert.deepEqual(leaves(r.fields), expected, 'No missing, extra, or reordered leaf values');
    for (const data of [f.data.slice(0, 10) + 'ff'.repeat((f.data.length - 10) / 2), f.data.slice(0, 10) + '00'.repeat((f.data.length - 10) / 2)]) {
      await assert.rejects(() => renderFixture({...f, data}, d, c), (e: any) => e instanceof Failure && ['CALLDATA_DECODE', 'NONCANONICAL_CALLDATA'].includes(e.code));
    }
  }
});

test('schema and fixture preflight reject deep and oversized object trees with typed limits', () => {
  let deep: any = {};
  for (let i = 0; i < 100; i++) deep = {x: deep};
  assert.throws(() => assertTreeBudget(deep), (e: any) => e instanceof Failure && e.code === 'INPUT_LIMIT');
  const wide = Object.fromEntries(Array.from({length: 33000}, (_, i) => [`k${i}`, i]));
  assert.throws(() => assertTreeBudget(wide), (e: any) => e instanceof Failure && e.code === 'INPUT_LIMIT');
  const c = contract('set(uint256 value)'), d = scaffold(c, 'Example');
  (d as any).unexpected = deep;
  assert.deepEqual(validateDescriptor(d, c, selection(c)).map(e => e.code), ['INPUT_LIMIT']);
  const f = fixture(c, [1]);
  assert.throws(() => validateFixture({...f, tokens: wide as any}), (e: any) => e instanceof Failure && e.code === 'INPUT_LIMIT');
});
