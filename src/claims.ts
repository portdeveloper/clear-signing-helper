// The claims check (roadmap item 31): does what the screen says hold for what the transaction does, for any
// value of the arguments the screen does not explain? Every review finding on #3133 and #3135 was a screen
// that is false for some argument values, which no check on names or the ABI can see. This replays each
// real-transaction fixture on a local anvil fork at its parent block, reads what moved (ERC-20 Transfer logs,
// native balances, the sender's Approval logs), and compares it with each shown amount: exact, a maximum or
// a minimum, by the wording on screen. Then it varies what the screen leaves unexplained (hidden and raw
// arguments, the bytes after a packed path's last hop) and pushes shown limits to where the call starts to
// revert, and reports any run that still succeeds but makes a shown claim false. No model anywhere; the
// findings are evidence for a human, never a gate.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { FunctionFragment, Interface, ParamType, getAddress, isAddress } from 'ethers';
import { Descriptor, Field, parseSignature, resolveFields, stripRoot } from './descriptors.js';
import { expandNestedFields } from './expansion.js';
import { Contract } from './foundry.js';
import { Fixture, decodeCanonical } from './fixtures.js';
import { fetchTransaction, rpcBatch, redactUrl } from './fetch.js';
import { fail, Failure } from './io.js';
import { limitOf } from './limits.js';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
// WETH-style Deposit/Withdrawal: a contract that emits them in a run wraps the native currency, so its token
// and native amounts are one asset for that run (a router unwraps WETH and pays ETH).
const WRAP = new Set(['0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c', '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65']);
const NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const OTHER = '0x000000000000000000000000000000000000dead';
const RECIPIENT = /^_?(to|recipient|receiver|beneficiary|dst|destination)$/i;
const SAYS_MAX = /\bmax|at most|up to|\bcap\b|or less/i, SAYS_MIN = /\bmin|at least|or more|\+$/i;
// "Minimum Before Fees" bounds an amount the signer does not receive; nothing to compare it with.
const QUALIFIED = /before (fees?|tax)/i;

export type ClaimKind = 'exact' | 'maximum' | 'minimum';
export interface Claim {path: string; label: string; kind: ClaimKind; asset: string; amount: bigint; recipients: string[]}
// state: logs and the storage, balance and code writes of the run (prestateTracer diff), when asked for.
interface Effects {delta: Map<string, Map<string, bigint>>; wrapped: Set<string>; approvals: Map<string, bigint>; state?: string}
interface Run {ok: boolean; effects?: Effects; error?: string}
export interface ClaimFinding {fixture: string; signature: string; claim: string; kind: 'baseline' | 'argument' | 'limit' | 'exact' | 'path-tail' | 'retained' | 'ignored'; argument?: string; value?: string; message: string}

// ---- calldata as a tree: tuples keyed by component name, so descriptor paths read and write it.
type Tree = any;
function toTree(type: ParamType, value: any): Tree {
  if (type.isTuple()) return Object.fromEntries(type.components.map((c, i) => [c.name || String(i), toTree(c, value[i])]));
  if (type.isArray()) return Array.from(value, (v: any) => toTree(type.arrayChildren, v));
  return value;
}
function fromTree(type: ParamType, value: Tree): any {
  if (type.isTuple()) return type.components.map((c, i) => fromTree(c, value[c.name || String(i)]));
  if (type.isArray()) return value.map((v: Tree) => fromTree(type.arrayChildren, v));
  return value;
}
const segments = (path: string) => stripRoot(path).split('.').filter(Boolean);
const bytesOf = (v: any): string => typeof v === 'bigint' ? v.toString(16).padStart(64, '0') : typeof v === 'string' && v.startsWith('0x') ? v.slice(2) : '';
function sliceBytes(hex: string, spec: string): string {
  const [a, b] = spec.split(':'), n = hex.length / 2;
  const at = (s: string | undefined, d: number) => s === undefined || s === '' ? d : Number(s) < 0 ? Math.max(0, n + Number(s)) : Math.min(n, Number(s));
  return hex.slice(at(a, 0) * 2, at(b, n) * 2);
}
function valueAt(root: Tree, path: string, tx: {from: string; to: string; value: bigint}): any {
  if (path === '@.value') return tx.value;
  if (path === '@.from') return tx.from;
  if (path === '@.to') return tx.to;
  let v: any = root;
  for (const s of segments(path)) {
    const index = /^\[(-?\d+)\]$/.exec(s), slice = /^\[(-?\d*:-?\d*)\]$/.exec(s);
    if (index) { if (!Array.isArray(v)) return undefined; const i = Number(index[1]); v = v[i < 0 ? v.length + i : i]; }
    else if (slice) { v = '0x' + sliceBytes(bytesOf(v), slice[1]); }
    else v = v?.[s];
    if (v === undefined) return undefined;
  }
  return v;
}
function setAt(root: Tree, path: string, value: any): Tree {
  const copy = structuredClone(root), parts = segments(path);
  let v: any = copy;
  for (const [i, s] of parts.entries()) {
    const index = /^\[(-?\d+)\]$/.exec(s), key: any = index ? (Number(index[1]) < 0 ? v.length + Number(index[1]) : Number(index[1])) : s;
    if (i === parts.length - 1) v[key] = value; else v = v[key];
  }
  return copy;
}
const asAddress = (v: any): string | undefined => {
  if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) return v.toLowerCase();
  if (typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v) && v.length === 42) return v.toLowerCase();
  return undefined;
};
function constantAt(d: Descriptor, ref: string): any {
  let v: any = d;
  for (const s of ref.replace(/^\$\./, '').split('.')) v = v?.[s];
  return v;
}

// ---- what the screen claims for one calldata
export function claimsOf(d: Descriptor, fn: FunctionFragment, root: Tree, tx: {from: string; to: string; value: bigint}): Claim[] {
  const key = Object.keys(d.display.formats).find(k => parseSignature(k).format('sighash') === fn.format('sighash'));
  if (!key) return [];
  const format = d.display.formats[key], sentence = typeof format.interpolatedIntent === 'string' ? format.interpolatedIntent : '';
  const decoded = fn.inputs.map(p => fromTree(p, root[p.name]));
  const fields = resolveFields(expandNestedFields(format.fields, fn, decoded as any), d.display.definitions ?? {}).filter(f => !f.hidden && typeof f.field.path === 'string');
  const recipients = fields.filter(f => f.field.format === 'addressName' && RECIPIENT.test(segments(f.field.path!).pop() ?? ''))
    .map(f => asAddress(valueAt(root, f.field.path!, tx))).filter((a): a is string => !!a);
  const claims: Claim[] = [];
  for (const {field} of fields) {
    if (field.format !== 'tokenAmount' && field.format !== 'amount') continue;
    const amount = valueAt(root, field.path!, tx);
    if (typeof amount !== 'bigint') continue;
    const asset = assetOf(d, field, root, tx);
    if (!asset) continue;
    const kind = kindOf(field, sentence);
    if (!kind) continue;
    claims.push({path: field.path!, label: field.label ?? field.path!, kind, asset, amount, recipients: recipients.length ? recipients : [tx.from.toLowerCase()]});
  }
  return claims;
}
function assetOf(d: Descriptor, field: Field, root: Tree, tx: {from: string; to: string; value: bigint}): string | undefined {
  if (field.format === 'amount') return 'native';
  const p = field.params ?? {};
  const natives = new Set([NATIVE_SENTINEL, ...[p.nativeCurrencyAddress].flat().filter(a => typeof a === 'string').map((a: string) => (a.startsWith('$.') ? constantAt(d, a) : a)?.toLowerCase())]);
  let token: string | undefined;
  if (typeof p.tokenPath === 'string') token = asAddress(valueAt(root, p.tokenPath, tx));
  else if (typeof p.token === 'string') token = asAddress(p.token.startsWith('$.') ? constantAt(d, p.token) : p.token);
  if (!token) return undefined;
  return natives.has(token) ? 'native' : token;
}
function kindOf(field: Field, sentence: string): ClaimKind | undefined {
  const label = field.label ?? '', path = stripRoot(field.path!);
  const at = sentence.search(new RegExp(`\\{(#\\.)?${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`));
  const clause = at < 0 ? '' : (sentence.slice(0, at).split(/\bfor\b|[,;]/i).pop() ?? '') + ' ' + (/^\S*\s*(or more|or less|\+)/i.exec(sentence.slice(at).replace(/^\{[^}]*\}/, ''))?.[0] ?? '');
  if (QUALIFIED.test(label) || QUALIFIED.test(clause)) return undefined;
  if (SAYS_MAX.test(label)) return 'maximum';
  if (SAYS_MIN.test(label)) return 'minimum';
  if (SAYS_MAX.test(clause)) return 'maximum';
  if (SAYS_MIN.test(clause)) return 'minimum';
  return 'exact';
}

// ---- what a run did, and whether a claim holds for it
const classOf = (asset: string, e: Effects) => asset === 'native' || e.wrapped.has(asset) ? ['native', ...e.wrapped] : [asset];
function net(e: Effects, asset: string, who: string): bigint {
  return classOf(asset, e).reduce((n, a) => n + (e.delta.get(a)?.get(who) ?? 0n), 0n);
}
type Verdict = {status: 'holds' | 'fails' | 'unmoved'; observed: string};
function judge(c: Claim, e: Effects, sender: string): Verdict {
  const out = -net(e, c.asset, sender), paid = out > 0n ? out : 0n;
  const received = c.recipients.map(r => { const n = net(e, c.asset, r); return n > 0n ? n : 0n; });
  const most = received.reduce((a, b) => a > b ? a : b, 0n);
  const observed = `sender paid ${paid}, ${c.recipients.length > 1 || c.recipients[0] !== sender ? 'recipient' : 'sender'} received ${most}`;
  if (paid === 0n && most === 0n) return {status: 'unmoved', observed};
  // A minimum can bound either side: what arrives (amountOutMin) or what is put in (addLiquidity's amountAMin).
  const holds = c.kind === 'exact' ? paid === c.amount || received.includes(c.amount) : c.kind === 'maximum' ? paid <= c.amount : most >= c.amount || paid >= c.amount;
  return {status: holds ? 'holds' : 'fails', observed};
}
const describe = (c: Claim) => `"${c.label}" (${c.path}) says ${c.kind === 'exact' ? '' : c.kind === 'maximum' ? 'at most ' : 'at least '}${c.amount} of ${c.asset}`;

// ---- anvil
interface Fork {url: string; process: ChildProcess}
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => { const s = createServer(); s.unref(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const port = (s.address() as AddressInfo).port; s.close(() => resolve(port)); }); });
}
let rpcId = 0;
async function rpc(url: string, method: string, params: unknown[] = []): Promise<any> {
  const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: ++rpcId, method, params})});
  const body: any = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}
async function startFork(rpcUrl: string, block: number): Promise<Fork> {
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  const child = spawn(process.env.CLEAR_SIGNING_ANVIL ?? 'anvil', ['--fork-url', rpcUrl, '--fork-block-number', String(block), '--port', String(port), '--block-base-fee-per-gas', '0', '--gas-price', '0', '--auto-impersonate', '--retries', '10', '--fork-retry-backoff', '1000', '--silent'], {stdio: ['ignore', 'ignore', 'pipe']});
  let stderr = '', spawnError: Error | undefined;
  child.stderr!.on('data', d => { stderr += d; });
  child.on('error', e => { spawnError = e; });
  for (let i = 0; i < 300; i++) {
    if (spawnError) fail('ANVIL_MISSING', `Cannot start anvil (${spawnError.message}). Install Foundry (https://getfoundry.sh) or set CLEAR_SIGNING_ANVIL to its path.`, 2);
    if (child.exitCode !== null) fail('ANVIL_FAILED', `anvil exited: ${stderr.trim().slice(0, 500)}`, 2);
    try { await rpc(url, 'eth_chainId'); return {url, process: child}; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  child.kill(); fail('ANVIL_FAILED', 'anvil did not answer within 30 s.', 2);
}
const hex = (n: bigint | number) => '0x' + n.toString(16);

async function execute(fork: Fork, tx: {from: string; to: string; data: string; value: bigint}, timestamp: number, watch: string[], traced = false): Promise<Run> {
  const snapshot = await rpc(fork.url, 'evm_snapshot');
  try {
    await rpc(fork.url, 'evm_setNextBlockTimestamp', [timestamp]);
    const before = await Promise.all(watch.map(a => rpc(fork.url, 'eth_getBalance', [a, 'latest'])));
    let hash: string;
    try { hash = await rpc(fork.url, 'eth_sendTransaction', [{from: tx.from, to: tx.to, data: tx.data, value: hex(tx.value), gas: hex(15_000_000), gasPrice: '0x0'}]); }
    catch (e) {
      // A revert is a result; a failure to read the forked chain is not, and counting it as a revert could hide a finding.
      const message = (e as Error).message;
      if (/rate.?limit|too many requests|429|fork|upstream|timed? ?out|connection/i.test(message) && !/revert/i.test(message)) fail('FORK_UNAVAILABLE', `The fork could not read state from the endpoint: ${message.slice(0, 300)}. Retry later or use another endpoint with historical state.`, 2);
      return {ok: false, error: message};
    }
    let receipt: any = null;
    for (let i = 0; i < 200 && !receipt; i++) { receipt = await rpc(fork.url, 'eth_getTransactionReceipt', [hash]); if (!receipt) await new Promise(r => setTimeout(r, 25)); }
    if (!receipt || receipt.status !== '0x1') return {ok: false, error: 'reverted'};
    const after = await Promise.all(watch.map(a => rpc(fork.url, 'eth_getBalance', [a, 'latest'])));
    const delta = new Map<string, Map<string, bigint>>(), wrapped = new Set<string>(), approvals = new Map<string, bigint>();
    const add = (asset: string, who: string, n: bigint) => { const m = delta.get(asset) ?? new Map(); m.set(who, (m.get(who) ?? 0n) + n); delta.set(asset, m); };
    watch.forEach((a, i) => { const n = BigInt(after[i]) - BigInt(before[i]); if (n) add('native', a, n); });
    for (const log of receipt.logs ?? []) {
      const token = String(log.address).toLowerCase(), topics: string[] = log.topics ?? [];
      if (WRAP.has(topics[0])) wrapped.add(token);
      // Three topics: ERC-20. ERC-721 Transfer indexes the id as a fourth topic and moves no amount.
      if (topics[0] === TRANSFER && topics.length === 3 && log.data?.length >= 66) {
        const n = BigInt(log.data.slice(0, 66)), from = '0x' + topics[1].slice(26), to = '0x' + topics[2].slice(26);
        add(token, from, -n); add(token, to, n);
      }
      if (topics[0] === APPROVAL && topics.length === 3 && '0x' + topics[1].slice(26) === tx.from.toLowerCase() && log.data?.length >= 66)
        approvals.set(`${token}:0x${topics[2].slice(26)}`, BigInt(log.data.slice(0, 66)));
    }
    let state: string | undefined;
    if (traced) {
      // Everything the call changed. The coinbase and the sender's nonce change the same way in every run.
      const diff = await rpc(fork.url, 'debug_traceTransaction', [hash, {tracer: 'prestateTracer', tracerConfig: {diffMode: true}}]);
      const strip = (side: Record<string, any> = {}) => Object.fromEntries(Object.entries(side).filter(([a]) => a !== receipt.from && !/^0x0{40}$/.test(a)).sort().map(([a, v]) => [a, {balance: v.balance, code: v.code, storage: v.storage}]));
      state = JSON.stringify({logs: (receipt.logs ?? []).map((l: any) => [l.address, l.topics, l.data]), pre: strip(diff?.pre), post: strip(diff?.post)});
    }
    return {ok: true, effects: {delta, wrapped, approvals, state}};
  } finally { await rpc(fork.url, 'evm_revert', [snapshot]); }
}

// ---- argument variations
interface Leaf {path: string; type: string}
function concreteLeaves(type: ParamType, value: Tree, path: string, out: Leaf[] = []): Leaf[] {
  if (type.isTuple()) type.components.forEach((c, i) => concreteLeaves(c, value?.[c.name || String(i)], `${path}.${c.name || i}`, out));
  else if (type.isArray()) (value ?? []).slice(0, 4).forEach((v: Tree, i: number) => concreteLeaves(type.arrayChildren, v, `${path}.[${i}]`, out));
  else out.push({path, type: type.type});
  return out;
}
const width = (type: string) => Number(/\d+$/.exec(type)?.[0] ?? 256);
function ladder(type: string, current: bigint): bigint[] {
  if (type.startsWith('int')) { const max = (1n << BigInt(width(type) - 1)) - 1n; return [0n, 1n, -1n, current * 2n, current / 2n, max, -max - 1n]; }
  const max = (1n << BigInt(width(type))) - 1n, values = new Set<bigint>([0n, 1n, max, current + 1n, current > 0n ? current - 1n : 0n, current * 2n, current / 2n]);
  for (let k = 8; k < width(type); k += 8) values.add((1n << BigInt(k)) - 1n);
  return [...values].filter(v => v >= 0n && v <= max).sort((a, b) => a < b ? -1 : 1);
}

export interface ClaimsOptions {rpcUrl: string; budget: number; log: (line: string) => void}
export async function checkFixtureClaims(file: string, f: Fixture, d: Descriptor, contract: Contract, o: ClaimsOptions) {
  const {fn} = decodeCanonical(contract, f.data), signature = fn.format('sighash'), iface = new Interface(contract.abi);
  const result = {fixture: file, signature, status: 'checked' as string, runs: 0, claims: [] as {claim: string; baseline: string}[], findings: [] as ClaimFinding[]};
  if (!f.txHash) return {...result, status: 'skipped: no real transaction (txHash) to replay'};
  const tx = await fetchTransaction(o.rpcUrl, f.txHash);
  if (tx.data.toLowerCase() !== f.data.toLowerCase() || tx.to.toLowerCase() !== f.to.toLowerCase()) return {...result, status: 'skipped: the fixture no longer matches its transaction'};
  const [block] = await rpcBatch(o.rpcUrl, [{method: 'eth_getBlockByNumber', params: [hex(tx.blockNumber), false]}]) as any[];
  const timestamp = Number(BigInt(block?.timestamp ?? 0));
  if (!timestamp) fail('RPC_FAILED', `${redactUrl(o.rpcUrl)} returned no block ${tx.blockNumber}.`, 2);
  const decoded = iface.decodeFunctionData(fn, f.data), root: Tree = Object.fromEntries(fn.inputs.map((p, i) => [p.name, toTree(p, decoded[i])]));
  const sender = tx.from.toLowerCase(), to = tx.to.toLowerCase(), value = BigInt(f.value);
  const ctx = (r: Tree, v = value) => ({from: sender, to, value: v, root: r});
  const encode = (r: Tree) => iface.encodeFunctionData(fn, fn.inputs.map(p => fromTree(p, r[p.name])));
  const leavesOf = (r: Tree) => fn.inputs.flatMap(p => concreteLeaves(p, r[p.name], p.name));
  const addressesIn = (r: Tree) => leavesOf(r).filter(l => l.type === 'address').map(l => asAddress(valueAt(r, l.path, ctx(r)))).filter((a): a is string => !!a);
  const fork = await startFork(o.rpcUrl, tx.blockNumber - 1);
  try {
    const run = async (r: Tree, v = value, traced = false) => {
      result.runs++;
      const watch = [...new Set([sender, to, ...addressesIn(r)])];
      return execute(fork, {from: sender, to, data: encode(r), value: v}, timestamp, watch, traced);
    };
    const base = await run(root);
    if (!base.ok) return {...result, status: `skipped: the transaction reverts when replayed at block ${tx.blockNumber - 1} (another transaction earlier in its block may set it up): ${base.error}`};
    const baseClaims = claimsOf(d, fn, root, ctx(root));
    const checkable = new Set<string>();
    for (const c of baseClaims) {
      const v = judge(c, base.effects!, sender);
      result.claims.push({claim: describe(c), baseline: `${v.status} (${v.observed})`});
      if (v.status === 'unmoved') continue;
      checkable.add(c.path);
      if (v.status === 'fails') result.findings.push({fixture: file, signature, claim: describe(c), kind: 'baseline', message: `False for the real transaction ${f.txHash}: ${v.observed}.`});
    }
    // A variation that succeeds and breaks a claim that held for the real transaction.
    const compare = (r: Tree, outcome: Run, kind: ClaimFinding['kind'], argument: string, shown: string): boolean => {
      if (!outcome.ok) return false;
      let found = false;
      const claims = claimsOf(d, fn, r, ctx(r));
      for (const c of claims) {
        if (!checkable.has(c.path) || result.findings.some(x => x.kind !== 'baseline' && x.argument === argument && x.claim.startsWith(`"${c.label}"`))) continue;
        // A minimum above a maximum (or exact amount) of the same asset on the same screen contradicts itself
        // visibly; Uniswap V2 leaves such a minimum unchecked, which is no news to a signer who reads it.
        if (c.kind === 'minimum' && claims.some(o => o !== c && o.kind !== 'minimum' && o.asset === c.asset && o.amount < c.amount)) continue;
        const v = judge(c, outcome.effects!, sender);
        if (v.status !== 'holds') { result.findings.push({fixture: file, signature, claim: describe(c), kind, argument, value: shown, message: `With ${argument} = ${shown} the call succeeds and ${v.observed}.`}); found = true; }
      }
      for (const [asset] of outcome.effects!.delta) {
        if (asset !== 'native' && outcome.effects!.wrapped.has(asset)) continue;
        const kept = net(outcome.effects!, asset, to), before = net(base.effects!, asset, to);
        if (kept > 0n && before <= 0n && !result.findings.some(x => x.kind === 'retained' && x.argument === argument)) {
          result.findings.push({fixture: file, signature, claim: `funds paid in stay with the contract`, kind: 'retained', argument, value: shown, message: `With ${argument} = ${shown} the call succeeds and ${to} keeps ${kept} of ${asset}, which the real transaction did not leave there; anyone who can sweep the contract can take it.`});
          found = true;
        }
      }
      return found;
    };
    const budgetLeft = () => result.runs < o.budget;

    // What the screen explains: shown fields that are not raw, and the leaves their token parameters read.
    const key = Object.keys(d.display.formats).find(k => parseSignature(k).format('sighash') === signature)!;
    const fields = resolveFields(expandNestedFields(d.display.formats[key].fields, fn, decoded as any), d.display.definitions ?? {});
    const explained = new Set<string>(), pinned = new Set<string>(), shown = new Set<string>();
    for (const {field, hidden} of fields) {
      if (typeof field.path !== 'string') continue;
      const p = stripRoot(field.path);
      if (field.visible && typeof field.visible === 'object' && Array.isArray((field.visible as any).mustMatch)) pinned.add(p);
      if (!hidden && field.format !== 'raw') explained.add(p);
      if (!hidden && !p.startsWith('@.')) shown.add(p);
      for (const ref of [field.params?.tokenPath, field.params?.collectionPath]) if (typeof ref === 'string' && !ref.startsWith('@.')) explained.add(stripRoot(ref).replace(/\.\[-?\d*:-?\d*\]$/, ''));
    }
    const leaves = leavesOf(root);
    // A one-level array field ("recipients.[]") is not expanded, so it covers each element leaf ("recipients.[0]").
    const covers = (set: Set<string>, p: string) => set.has(p) || set.has(p.replace(/\.\[\d+\]/g, '.[]'));

    // 1. Unexplained arguments (hidden, raw or not displayed; never one pinned with mustMatch).
    for (const leaf of leaves) {
      if (!budgetLeft()) break;
      if (covers(explained, leaf.path) || covers(pinned, leaf.path) || /^bytes\d+$/.test(leaf.type)) continue;
      const current = valueAt(root, leaf.path, ctx(root));
      if (leaf.type === 'bool') { const r = setAt(root, leaf.path, !current); compare(r, await run(r), 'argument', leaf.path, String(!current)); continue; }
      if (leaf.type === 'address') {
        for (const a of [OTHER, sender, to, '0x0000000000000000000000000000000000000000']) {
          if (!budgetLeft() || a === asAddress(current)) continue;
          const r = setAt(root, leaf.path, getAddress(a));
          if (compare(r, await run(r), 'argument', leaf.path, a)) break;
        }
        continue;
      }
      if (/^u?int\d*$/.test(leaf.type) && typeof current === 'bigint') {
        const tried: {v: bigint; ok: boolean}[] = [];
        let found = false;
        for (const v of ladder(leaf.type, current)) {
          if (!budgetLeft() || v === current) continue;
          const r = setAt(root, leaf.path, v), outcome = await run(r);
          tried.push({v, ok: outcome.ok});
          if (compare(r, outcome, 'argument', leaf.path, String(v))) { found = true; break; }
        }
        // Between a value that reverts and one that succeeds there is often a narrow band where the call
        // succeeds but stops early (a price limit just past the current price): bisect into it.
        if (!found) for (const [a, b] of tried.slice(1).map((t, i) => [tried[i], t])) {
          if (a.ok === b.ok || found) continue;
          let lo = a.v, hi = b.v, okIsHigh = b.ok;
          for (let i = 0; i < 160 && hi - lo > 1n && budgetLeft(); i++) {
            const mid = (lo + hi) / 2n, r = setAt(root, leaf.path, mid), outcome = await run(r);
            if (compare(r, outcome, 'argument', leaf.path, String(mid))) { found = true; break; }
            if (outcome.ok === okIsHigh) hi = mid; else lo = mid;
          }
        }
      }
    }
    // 2. Bytes after a packed path's last hop: a token read from the end shows whatever the caller appends.
    for (const {field, hidden} of fields) {
      const ref = field.params?.tokenPath;
      if (hidden || typeof ref !== 'string' || !/\.\[-\d*:-?\d*\]$|\.\[\d*:-\d+\]$/.test(ref) || !budgetLeft()) continue;
      const leaf = stripRoot(ref).replace(/\.\[-?\d*:-?\d*\]$/, ''), current = valueAt(root, leaf, ctx(root));
      if (typeof current !== 'string' || !current.startsWith('0x')) continue;
      const r = setAt(root, leaf, current + OTHER.slice(2));
      compare(r, await run(r), 'path-tail', leaf, `the route with ${OTHER} appended`);
    }
    // 3. Shown limits at their edge: the largest minimum (smallest maximum) the call still accepts.
    for (const c of baseClaims) {
      if (c.kind === 'exact' || c.path.startsWith('@.') || !checkable.has(c.path) || !budgetLeft()) continue;
      const leaf = stripRoot(c.path), type = leaves.find(l => l.path === leaf)?.type ?? 'uint256', max = (1n << BigInt(width(type))) - 1n;
      let good = c.amount, bad: bigint | undefined;
      for (let i = 0; i < 64 && budgetLeft(); i++) {
        const v = c.kind === 'minimum' ? (good === 0n ? 1n : good * 2n > max ? max : good * 2n) : good / 2n;
        if (v === good) break;
        if ((await run(setAt(root, leaf, v))).ok) good = v; else { bad = v; break; }
      }
      for (let i = 0; bad !== undefined && i < 256 && (bad > good ? bad - good : good - bad) > 1n && budgetLeft(); i++) {
        const mid = (good + bad) / 2n;
        if ((await run(setAt(root, leaf, mid))).ok) good = mid; else bad = mid;
      }
      if (good !== c.amount) { const r = setAt(root, leaf, good); compare(r, await run(r), 'limit', leaf, `${good} (the edge where the call starts to revert)`); }
    }
    // 4. Shown exact amounts at other values: the dapp picks them too. "Amount to Add" held for a real call that
    // sent the pool's exact ratio, and is false as soon as the ratio is off (Uniswap V2's amountADesired).
    for (const c of baseClaims) {
      if (c.kind !== 'exact' || c.path.startsWith('@.') || !checkable.has(c.path) || c.amount < 2n) continue;
      const leaf = stripRoot(c.path);
      for (const v of [c.amount * 2n, c.amount / 2n]) {
        if (!budgetLeft()) break;
        const r = setAt(root, leaf, v);
        if (compare(r, await run(r), 'exact', leaf, String(v))) break;
      }
    }
    // 5. Shown arguments the call ignores: every extreme value succeeds and changes exactly what the real
    // transaction changed (CoW EthFlow's invalidateOrder shows order.validTo, which the order hash leaves out,
    // registry #3154). A check-only argument such as a deadline or a minimum reverts at one extreme.
    // Limits are left to probe 3: Uniswap V2's addLiquidity checks amountAMin on one branch of the reserve ratio
    // and neither minimum on a new pool, so a replay that skips the branch made 3 false findings on Router02.
    const limits = new Set(baseClaims.filter(c => c.kind !== 'exact').map(c => stripRoot(c.path)));
    const reference = shown.size && budgetLeft() ? await run(root, value, true) : undefined;
    for (const leaf of reference?.ok ? leaves : []) {
      if (!covers(shown, leaf.path) || covers(pinned, leaf.path) || covers(limits, leaf.path) || limitOf(leaf.path.split('.').pop() ?? leaf.path, leaf.type) || !budgetLeft()) continue;
      const current = valueAt(root, leaf.path, ctx(root));
      const tries = leaf.type === 'bool' ? [!current] : leaf.type === 'address' ? [OTHER, sender, '0x0000000000000000000000000000000000000000'].filter(a => a !== asAddress(current)).map(a => getAddress(a))
        : /^u?int\d*$/.test(leaf.type) && typeof current === 'bigint' ? [...new Set(ladder(leaf.type, current).filter(v => v !== current))].filter((v, i, all) => i === 0 || i === all.length - 1 || v === 1n || v === current * 2n) : [];
      if (!tries.length) continue;
      let ignored = true;
      for (const v of tries) {
        if (!budgetLeft()) { ignored = false; break; }
        const outcome = await run(setAt(root, leaf.path, v as any), value, true);
        if (!outcome.ok || outcome.effects!.state !== reference!.effects!.state) { ignored = false; break; }
      }
      if (ignored) result.findings.push({fixture: file, signature, claim: `${leaf.path} is shown`, kind: 'ignored', argument: leaf.path, value: tries.map(String).join(', '), message: `With ${tries.map(String).join(', ')} the call succeeds and changes exactly what the real transaction changed: the contract ignores it, so the screen shows a value that does nothing. Hide it with that reason.`});
    }
    if (!budgetLeft()) result.status = `checked, stopped at the ${o.budget}-run budget`;
    return result;
  } catch (e) {
    if (e instanceof Failure) throw e;
    fail('CLAIMS_FAILED', `${file}: ${(e as Error).message}`, 2);
  } finally { fork.process.kill(); }
}
