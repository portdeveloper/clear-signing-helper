import { Interface, isAddress } from 'ethers';
import { format, type Descriptor as RendererDescriptor } from '@ethereum-sourcify/clear-signing';
import { Descriptor, ENGINE, parseSignature } from './descriptors.js';
import { Contract } from './foundry.js';
import { expandNestedFields } from './expansion.js';
import { assertKeys, assertTreeBudget, fail } from './io.js';
import { KNOWN_CHAINS } from './chains.js';

export interface Fixture {
  contract: string; chainId: number; to: string; data: string; value: string; from?: string;
  localBinding?: boolean;
  // Local metadata only. Nothing is fetched. Keys are addresses; block heights are decimal strings.
  chain?: {name: string; nativeCurrency: {name: string; symbol: string; decimals: number}};
  tokens?: Record<string, {name: string; symbol: string; decimals: number}>;
  addressNames?: Record<string, string>;
  ensNames?: Record<string, string>;
  nftCollectionNames?: Record<string, string>;
  blockTimestamps?: Record<string, number>;
}
export interface Rendering {
  engine: typeof ENGINE; contract: string; signature: string; chainId: number; to: string; value: string; from?: string;
  localBinding: boolean; intent: string; fields: any[]; warnings: {code: string; message: string}[];
}
export function validateFixture(f: Fixture) {
  assertTreeBudget(f);
  assertKeys(f, ['contract', 'chainId', 'to', 'data', 'value', 'from', 'localBinding', 'chain', 'tokens', 'addressNames', 'ensNames', 'nftCollectionNames', 'blockTimestamps'], 'fixture');
  if (typeof f.contract !== 'string') fail('INVALID_FIXTURE', 'fixture.contract must be a source:contract identity.');
  if (!Number.isSafeInteger(f.chainId) || f.chainId <= 0) fail('INVALID_FIXTURE', 'chainId must be a positive safe integer.');
  if (typeof f.to !== 'string' || !isAddress(f.to) || (f.from !== undefined && !isAddress(f.from))) fail('INVALID_FIXTURE', 'to/from must be valid EVM addresses.');
  if (typeof f.data !== 'string' || !/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(f.data) || f.data.length > 131074) fail('INVALID_CALLDATA', 'data must be even-length hex containing a selector, at most 64 KiB.');
  if (typeof f.value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(f.value) || f.value.length > 78 || BigInt(f.value) >= 2n**256n) fail('INVALID_FIXTURE', 'value must be a decimal uint256 string in wei.');
  if (f.localBinding !== undefined && typeof f.localBinding !== 'boolean') fail('INVALID_FIXTURE', 'localBinding must be a boolean.');
  if (f.tokens !== undefined) {
    assertKeys(f.tokens, Object.keys(f.tokens ?? {}), 'tokens');
    const seen = new Set<string>();
    for (const [address, token] of Object.entries(f.tokens)) {
      if (!isAddress(address) || seen.has(address.toLowerCase())) fail('INVALID_METADATA', `Invalid or duplicate token address: ${address}`);
      seen.add(address.toLowerCase());
      assertKeys(token, ['name','symbol','decimals'], `tokens.${address}`);
      if (typeof token.name !== 'string' || !token.name.trim() || typeof token.symbol !== 'string' || !token.symbol.trim() || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) fail('INVALID_METADATA', `${address} needs name, symbol and integer decimals in [0,255].`);
    }
  }
  for (const key of ['addressNames', 'ensNames', 'nftCollectionNames'] as const) {
    const map = f[key];
    if (map === undefined) continue;
    assertKeys(map, Object.keys(map ?? {}), key);
    const seen = new Set<string>();
    for (const [address, name] of Object.entries(map)) {
      if (!isAddress(address) || typeof name !== 'string' || !name.trim() || seen.has(address.toLowerCase())) fail('INVALID_METADATA', `Invalid or duplicate ${key} entry: ${address}`);
      seen.add(address.toLowerCase());
    }
  }
  if (f.blockTimestamps !== undefined) {
    assertKeys(f.blockTimestamps, Object.keys(f.blockTimestamps ?? {}), 'blockTimestamps');
    for (const [height, ts] of Object.entries(f.blockTimestamps)) if (!/^(0|[1-9][0-9]*)$/.test(height) || !Number.isSafeInteger(ts) || ts < 0) fail('INVALID_METADATA', `blockTimestamps.${height} must map a decimal block height to a nonnegative integer timestamp.`);
  }
  if (f.chain !== undefined) {
    assertKeys(f.chain, ['name', 'nativeCurrency'], 'chain');
    assertKeys(f.chain.nativeCurrency, ['name', 'symbol', 'decimals'], 'chain.nativeCurrency');
    const n = f.chain.nativeCurrency;
    if (typeof f.chain.name !== 'string' || !f.chain.name.trim() || typeof n?.name !== 'string' || !n.name.trim() || typeof n.symbol !== 'string' || !n.symbol.trim() || !Number.isInteger(n.decimals) || n.decimals < 0 || n.decimals > 255) fail('INVALID_METADATA', 'chain requires a name and nativeCurrency {name, symbol, decimals in [0,255]}.');
  }
}
export async function renderFixture(f: Fixture, d: Descriptor, contract: Contract): Promise<Rendering> {
  validateFixture(f);
  if (f.contract !== contract.id) fail('FIXTURE_CONTRACT', `Fixture ${f.contract} does not match ${contract.id}.`);
  const matching = contract.functions.filter(fn => fn.selector.toLowerCase() === f.data.slice(0,10).toLowerCase());
  if (matching.length !== 1) fail('UNKNOWN_SELECTOR', 'Calldata must match exactly one selected contract write function.');
  const fn = matching[0];
  if (fn.stateMutability !== 'payable' && BigInt(f.value) !== 0n) fail('NONPAYABLE_VALUE', `${fn.format()} cannot receive native value.`);
  const iface = new Interface(contract.abi);
  let decoded: readonly unknown[];
  try {
    decoded = iface.decodeFunctionData(fn, f.data);
    const encoded = iface.encodeFunctionData(fn, decoded);
    if (encoded.toLowerCase() !== f.data.toLowerCase()) fail('NONCANONICAL_CALLDATA', 'Calldata contains trailing bytes or noncanonical ABI encoding.');
  } catch (e) { if ((e as any).code === 'NONCANONICAL_CALLDATA') throw e; fail('CALLDATA_DECODE', `Cannot decode calldata for ${fn.format()}: ${(e as Error).message}`); }
  // Apply limits to all ABI shapes, including flat arrays that need no lowering.
  assertTreeBudget(decoded!, 8192, 32);
  if (!Object.keys(d.display.formats).some(key => parseSignature(key).format('sighash') === fn.format('sighash'))) fail('MISSING_FORMAT', `${fn.format()} has no descriptor format.`);
  const descriptor = structuredClone(d);
  const formatKey = Object.keys(descriptor.display.formats).find(key => parseSignature(key).format('sighash') === fn.format('sighash'))!;
  descriptor.display.formats[formatKey].fields = expandNestedFields(descriptor.display.formats[formatKey].fields, fn, decoded!);
  if (f.localBinding) {
    if (d.context.contract.deployments.length) fail('LOCAL_BINDING_CONFLICT', 'localBinding is only allowed for descriptors with no production deployments.');
    descriptor.context.contract.deployments = [{chainId: f.chainId, address: f.to}];
  } else if (!d.context.contract.deployments.some(dep => dep.chainId === f.chainId && dep.address.toLowerCase() === f.to.toLowerCase())) {
    fail('DEPLOYMENT_MISMATCH', `No descriptor binding for ${f.chainId}:${f.to}. Use localBinding only for an undeployed draft.`);
  }
  const lower = <T,>(map: Record<string, T> | undefined) => Object.fromEntries(Object.entries(map ?? {}).map(([k,v]) => [k.toLowerCase(), v]));
  const tokens = lower(f.tokens), names = lower(f.addressNames), ens = lower(f.ensNames), collections = lower(f.nftCollectionNames);
  const result = await format({chainId: f.chainId, to: f.to, data: f.data, value: BigInt(f.value), from: f.from}, {
    descriptorResolverOptions: {type: 'custom', resolver: {
      index: {calldataIndex: {[`eip155:${f.chainId}:${f.to.toLowerCase()}`]: 'local.json'}, typedDataIndex: {}},
      fetchDescriptor: async p => { if (p !== 'local.json') fail('UNSAFE_REFERENCE', `Unexpected descriptor reference ${p}`); return descriptor as RendererDescriptor; }
    }},
    externalDataProvider: {
      resolveToken: async (chainId, address) => chainId === f.chainId ? tokens[address.toLowerCase()] ?? null : null,
      // Local fixtures cannot verify address types; a supplied name is trusted for the declared types.
      resolveLocalName: async address => names[address.toLowerCase()] ? {name: names[address.toLowerCase()], typeMatch: true} : null,
      resolveEnsName: async address => ens[address.toLowerCase()] ? {name: ens[address.toLowerCase()], typeMatch: true} : null,
      resolveNftCollectionName: async (chainId, address) => chainId === f.chainId && collections[address.toLowerCase()] ? {name: collections[address.toLowerCase()]} : null,
      resolveBlockTimestamp: async (chainId, height) => chainId === f.chainId && f.blockTimestamps?.[height.toString()] !== undefined ? {timestamp: f.blockTimestamps[height.toString()]} : null,
      resolveChainInfo: async chainId => chainId === f.chainId ? f.chain ?? KNOWN_CHAINS[chainId] ?? null : null
    }
  });
  assertTreeBudget(result.fields ?? [], 65536, 96);
  let displayed = 0;
  const countFields = (fields: any[]) => { for (const field of fields) { if (++displayed > 4096) fail('RENDER_LIMIT', 'Signing output exceeds 4,096 fields and groups.'); if (field.fields) countFields(field.fields); } };
  countFields(result.fields ?? []);
  const warnings = [...(result.warnings ?? [])];
  const collect = (fields: any[]) => { for (const field of fields) { if (field.warning) warnings.push(field.warning); if (field.fields) collect(field.fields); } };
  collect(result.fields ?? []);
  if (result.rawCalldataFallback || !result.intent) fail('RENDER_FAILED', `Descriptor could not render this transaction: ${warnings.map(w => `${w.code}: ${w.message}`).join('; ')}`);
  return {engine: ENGINE, contract: contract.id, signature: fn.format('sighash'), chainId: f.chainId, to: f.to.toLowerCase(), value: f.value, ...(f.from ? {from: f.from.toLowerCase()} : {}),
    localBinding: f.localBinding === true, intent: String(result.intent), fields: result.fields ?? [], warnings: [...new Map(warnings.map(w => [w.code + w.message, w])).values()]};
}
// An unnamed address renders as its checksummed value, which is what wallets show; that is not a defect.
export const INFORMATIONAL_WARNINGS = new Set(['EMPTY_ARRAY', 'UNKNOWN_ADDRESS']);
export function blockingWarnings(rendering: Rendering) { return rendering.warnings.filter(w => !INFORMATIONAL_WARNINGS.has(w.code)); }
