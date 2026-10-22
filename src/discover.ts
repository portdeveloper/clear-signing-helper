import { fail } from './io.js';
import { hypersyncQuery, rpcBatch, redactUrl } from './fetch.js';

// Finds real transactions to turn into fixtures: successful calls sent directly to a deployment, by selector.
// Discovery only nominates; app.ts re-reads every nominee over the user's RPC and passes it through the
// same checks as fixture --tx, so neither the index nor the scan is ever the evidence.
// Sources, in order: Envio HyperSync when ENVIO_API_TOKEN is set (server-side filter by target, selector and
// status over the whole chain), else a bounded scan of recent blocks over the user's RPC.
export interface Nominee {hash: string; blockNumber: number}
export interface Discovery {source: 'hypersync' | 'rpc-scan'; searched: string; nominees: Record<string, Nominee[]>}
interface Options {chainId: number; addresses: string[]; selectors: string[]; target: number; rpcUrl: string; token?: string; maxBlocks: number; log: (line: string) => void}

// Newest first, at most `target` per selector, no duplicates.
function add(into: Record<string, Nominee[]>, selector: string, found: Nominee[], target: number) {
  const list = into[selector] ??= [], seen = new Set(list.map(n => n.hash));
  for (const n of [...found].sort((a, b) => b.blockNumber - a.blockNumber)) if (list.length < target && !seen.has(n.hash)) { list.push(n); seen.add(n.hash); }
}
const num = (v: unknown) => typeof v === 'number' ? v : Number(BigInt(String(v)));

async function fromHypersync(o: Options & {token: string}): Promise<Discovery> {
  const to = o.addresses.map(a => a.toLowerCase());
  // archive_height comes back on any query; this one asks for almost nothing.
  const probe = await hypersyncQuery(o.chainId, o.token, {from_block: 0, to_block: 1, transactions: [{to}], field_selection: {transaction: ['hash']}, max_num_transactions: 1});
  const head = Number(probe?.archive_height);
  if (!Number.isFinite(head) || head <= 0) fail('FETCH_FAILED', `HyperSync for chain ${o.chainId} returned no archive height.`, 2);
  // Recent blocks first, then wider: a fixture from last week reads better than one from 2020.
  const windows = [[Math.max(0, head - 50_000), head + 1], [Math.max(0, head - 1_000_000), Math.max(0, head - 50_000)], [0, Math.max(0, head - 1_000_000)]].filter(([a, b]) => b > a);
  const nominees: Record<string, Nominee[]> = {};
  const remaining = () => o.selectors.filter(s => (nominees[s]?.length ?? 0) < o.target);
  let lowest = head;
  for (const [start, end] of windows) {
    if (!remaining().length) break;
    const found: Record<string, Nominee[]> = {};
    for (let from = start, pages = 0; from < end && pages < 40; pages++) {
      const body = await hypersyncQuery(o.chainId, o.token, {from_block: from, to_block: end, transactions: [{to, sighash: remaining(), status: 1}],
        field_selection: {transaction: ['hash', 'block_number', 'to', 'input', 'status']}, max_num_transactions: 1000});
      const batches = Array.isArray(body?.data) ? body.data : [body?.data ?? {}];
      for (const tx of batches.flatMap((b: any) => Array.isArray(b?.transactions) ? b.transactions : [])) {
        const selector = String(tx.input ?? '').slice(0, 10).toLowerCase();
        if (!o.selectors.includes(selector) || !to.includes(String(tx.to ?? '').toLowerCase()) || (tx.status !== undefined && num(tx.status) !== 1)) continue;
        (found[selector] ??= []).push({hash: String(tx.hash).toLowerCase(), blockNumber: num(tx.block_number)});
      }
      const next = Number(body?.next_block);
      if (!Number.isFinite(next) || next <= from) break;
      from = next;
    }
    for (const [selector, list] of Object.entries(found)) add(nominees, selector, list, o.target);
    lowest = start;
    o.log(`HyperSync blocks ${start}–${end - 1}: ${o.selectors.length - remaining().length} of ${o.selectors.length} functions found`);
  }
  return {source: 'hypersync', searched: `HyperSync, chain ${o.chainId}, blocks ${lowest}–${head}`, nominees};
}

async function fromRpcScan(o: Options): Promise<Discovery> {
  const to = new Set(o.addresses.map(a => a.toLowerCase()));
  const [headHex] = await rpcBatch(o.rpcUrl, [{method: 'eth_blockNumber', params: []}]);
  if (typeof headHex !== 'string') fail('RPC_FAILED', `${redactUrl(o.rpcUrl)} returned no block number.`, 2);
  const head = Number(BigInt(headHex)), floor = Math.max(0, head - o.maxBlocks + 1), per = 20;
  const nominees: Record<string, Nominee[]> = {};
  const remaining = () => o.selectors.filter(s => (nominees[s]?.length ?? 0) < o.target);
  let next = head, scanned = 0, lowest = head;
  const worker = async () => {
    while (next >= floor && remaining().length) {
      const top = next; next -= per;
      const numbers = Array.from({length: per}, (_, i) => top - i).filter(n => n >= floor);
      const blocks = await rpcBatch(o.rpcUrl, numbers.map(n => ({method: 'eth_getBlockByNumber' as const, params: ['0x' + n.toString(16), true]})));
      const candidates: {selector: string; hash: string; blockNumber: number}[] = [];
      for (const block of blocks as any[]) for (const tx of block?.transactions ?? []) {
        const selector = String(tx.input ?? '').slice(0, 10).toLowerCase();
        if (tx.to && to.has(String(tx.to).toLowerCase()) && remaining().includes(selector)) candidates.push({selector, hash: String(tx.hash).toLowerCase(), blockNumber: Number(BigInt(tx.blockNumber))});
      }
      if (candidates.length) {
        const receipts = await rpcBatch(o.rpcUrl, candidates.map(c => ({method: 'eth_getTransactionReceipt' as const, params: [c.hash]})));
        candidates.forEach((c, i) => { if ((receipts[i] as any)?.status === '0x1') add(nominees, c.selector, [c], o.target); });
      }
      scanned += numbers.length; lowest = Math.min(lowest, numbers[numbers.length - 1] ?? lowest);
      if (scanned % 2000 < per) o.log(`Scanned ${scanned} blocks back from ${head}: ${o.selectors.length - remaining().length} of ${o.selectors.length} functions found`);
    }
  };
  await Promise.all(Array.from({length: 6}, worker));
  return {source: 'rpc-scan', searched: `RPC scan of blocks ${lowest}–${head} over ${redactUrl(o.rpcUrl)}`, nominees};
}

export function discoverCalls(o: Options): Promise<Discovery> {
  return o.token ? fromHypersync({...o, token: o.token}) : fromRpcScan(o);
}
