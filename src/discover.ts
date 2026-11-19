import { fail, Failure } from './io.js';
import { hypersyncQuery, rpcBatch, redactUrl } from './fetch.js';

// Finds real transactions to turn into fixtures: successful calls sent directly to a deployment, by selector.
// Discovery only nominates; app.ts re-reads every nominee over the user's RPC and passes it through the
// same checks as fixture --tx, so neither the index nor the scan is ever the evidence.
// Sources, in order: Envio HyperSync when ENVIO_API_TOKEN is set (server-side filter by target, selector and
// status over the whole chain), else a bounded scan of recent blocks over the user's RPC.
export interface Nominee {hash: string; blockNumber: number}
// unread: blocks of the RPC scan the endpoint would not return (rate limit, node error), so they were not searched.
// logs: what the eth_getLogs pass did, or why it did nothing.
export interface Discovery {source: 'hypersync' | 'rpc-logs' | 'rpc-scan' | 'rpc-logs+scan'; searched: string; unread?: number; logs?: {available: boolean; note?: string}}
// wanted/take: the caller turns each nominee into a fixture as it is found (newest first within a source), so an
// interrupted or throttled search keeps what it already made. A selector is searched for while wanted() holds.
interface Options {chainId: number; addresses: string[]; selectors: string[]; rpcUrl: string; logRpcUrls?: string[]; token?: string; maxBlocks: number; logBlocks: number; deadline: number; log: (line: string) => void;
  wanted: (selector: string) => boolean; have: (selector: string) => number; take: (selector: string, nominee: Nominee) => Promise<void>}

const num = (v: unknown) => typeof v === 'number' ? v : Number(BigInt(String(v)));
// Nominees are handed over one at a time, in the order offered, whatever the concurrency of the search.
const offered = new WeakMap<Options, {queue: Promise<void>; seen: Set<string>}>();
function offering(o: Options) {
  if (!offered.has(o)) offered.set(o, {queue: Promise.resolve(), seen: new Set()});
  const state = offered.get(o)!;
  return {
    offer: (selector: string, found: Nominee[]) => {
      for (const n of [...found].sort((a, b) => b.blockNumber - a.blockNumber)) {
        if (state.seen.has(n.hash)) continue;
        state.seen.add(n.hash);
        state.queue = state.queue.then(() => o.wanted(selector) ? o.take(selector, n) : undefined);
      }
      return state.queue;
    },
    remaining: () => o.selectors.filter(s => o.wanted(s)),
    // Functions with no fixture yet: the wide and slow searches are for these, not for a second case of a function.
    lacking: () => o.selectors.filter(s => o.wanted(s) && !o.have(s)),
    fixtures: () => o.selectors.reduce((n, s) => n + o.have(s), 0),
    progress: () => `${o.selectors.filter(s => o.have(s)).length} of ${o.selectors.length} functions have a fixture`,
  };
}

async function fromHypersync(o: Options & {token: string}): Promise<Discovery> {
  const to = o.addresses.map(a => a.toLowerCase());
  // archive_height comes back on any query; this one asks for almost nothing.
  const probe = await hypersyncQuery(o.chainId, o.token, {from_block: 0, to_block: 1, transactions: [{to}], field_selection: {transaction: ['hash']}, max_num_transactions: 1});
  const head = Number(probe?.archive_height);
  if (!Number.isFinite(head) || head <= 0) fail('FETCH_FAILED', `HyperSync for chain ${o.chainId} returned no archive height.`, 2);
  // Recent blocks first, then wider: a fixture from last week reads better than one from 2020.
  const windows = [[Math.max(0, head - 50_000), head + 1], [Math.max(0, head - 1_000_000), Math.max(0, head - 50_000)], [0, Math.max(0, head - 1_000_000)]].filter(([a, b]) => b > a);
  const {offer, remaining, lacking, progress} = offering(o);
  let lowest = head;
  for (const [i, [start, end]] of windows.entries()) {
    // Further cases of a function come from the recent window only; the older ones are for functions still without one.
    const asked = i ? lacking() : remaining();
    if (!asked.length) break;
    const found: Record<string, Nominee[]> = {};
    for (let from = start, pages = 0; from < end && pages < 40; pages++) {
      const body = await hypersyncQuery(o.chainId, o.token, {from_block: from, to_block: end, transactions: [{to, sighash: asked, status: 1}],
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
    for (const [selector, list] of Object.entries(found)) await offer(selector, list);
    lowest = start;
    o.log(`HyperSync blocks ${start}–${end - 1}: ${progress()}`);
  }
  return {source: 'hypersync', searched: `HyperSync, chain ${o.chainId}, blocks ${lowest}–${head}`};
}

// Transactions that left a log trace at the deployment: a log the contract emitted, or a token Transfer (or any
// event) whose first or second indexed argument is the contract. One eth_getLogs covers thousands of blocks, so
// this reaches months back where the block scan reaches hours. A call that leaves no such trace (a router that
// never holds the tokens) is invisible here; the block scan below still looks for it.
// Public endpoints differ: many refuse a log query without an address, cap the range or the result count, and
// throttle. So each filter is probed per endpoint, requests go one at a time, a throttled endpoint is left for
// the next one that serves logs, and transactions are looked up on the primary endpoint.
async function fromLogs(o: Options, head: number): Promise<{available: boolean; note?: string; searched?: string}> {
  const to = new Set(o.addresses.map(a => a.toLowerCase())), padded = [...to].map(a => '0x' + '0'.repeat(24) + a.slice(2));
  const all: object[] = [{address: [...to]}, {topics: [null, padded]}, {topics: [null, null, padded]}];
  const floor = Math.max(0, head - o.logBlocks + 1), {offer, remaining, fixtures, progress} = offering(o), hex = (n: number) => '0x' + n.toString(16);
  // STALL: transactions read since the last new fixture. Past it, what is still missing is not called directly
  // often enough to be worth the wait (a function nobody calls would otherwise use the whole time limit).
  const MIN = 50, MAX = 100_000, LOOKUPS = 10_000, STALL = 3000;
  const query = async (url: string, filter: object, lo: number, hi: number): Promise<any[] | 'narrow' | 'throttled'> => {
    try {
      const [r] = await rpcBatch(url, [{method: 'eth_getLogs', params: [{...filter, fromBlock: hex(lo), toBlock: hex(hi)}]}], 45_000, 1);
      return Array.isArray(r) ? r : 'narrow';
    } catch (e) { if (!(e instanceof Failure)) throw e; return /\b429\b/.test(e.message) || e.code === 'FETCH_TIMEOUT' ? 'throttled' : 'narrow'; }
  };
  // Which filters each endpoint serves, asked over the newest ten blocks.
  const endpoints: {url: string; filters: object[]}[] = [];
  for (const url of [...new Set([o.rpcUrl, ...(o.logRpcUrls ?? [])])]) {
    const filters: object[] = [];
    for (const f of all) if (Array.isArray(await query(url, f, Math.max(floor, head - 9), head))) filters.push(f);
    if (filters.length) endpoints.push({url, filters});
  }
  if (!endpoints.length) return {available: false, note: `No endpoint named answered eth_getLogs, so only the block scan ran; an endpoint that serves logs reaches much further back (name one with another --rpc-url).`};
  endpoints.sort((a, b) => b.filters.length - a.filters.length);
  const widest = endpoints[0].filters.length;
  let at = 0, hi = head, size = 2000, lookups = 0, strikes = 0, lowest = head + 1, stopped: string | undefined, last = 0, lastAt = 0;
  const stalled = () => { if (fixtures() !== last) { last = fixtures(); lastAt = lookups; } return lookups - lastAt >= STALL; };
  while (hi >= floor && remaining().length && lookups < LOOKUPS) {
    if (stalled()) { stopped = `The log search stopped at block ${lowest}: the last ${lookups - lastAt} transactions read gave no new fixture, so the functions still missing are rarely or never called directly. Pass --function to search for one of them alone, or set ENVIO_API_TOKEN to filter by function on the server.`; break; }
    if (Date.now() > o.deadline) { stopped = `The log search stopped at the time limit, at block ${lowest}; run discover again with a larger --time-limit to go further back.`; break; }
    const lo = Math.max(floor, hi - size + 1), {url, filters} = endpoints[at], logs: any[] = [];
    let problem: 'narrow' | 'throttled' | undefined;
    for (const f of filters) { const r = await query(url, f, lo, hi); if (!Array.isArray(r)) { problem = r; break; } logs.push(...r); }
    if (problem === 'throttled') {
      // Another endpoint that serves as many filters takes over; with none, wait once or twice, then stop.
      const others = endpoints.map((e, i) => i).filter(i => i !== at);
      if (others.length && strikes < 2 * endpoints.length) { strikes++; at = others[strikes % others.length]; o.log(`${redactUrl(url)} is throttling log queries; continuing on ${redactUrl(endpoints[at].url)}`); continue; }
      if (++strikes > 2 * endpoints.length + 2) { stopped = `${redactUrl(url)} kept throttling eth_getLogs, so the log search stopped at block ${lowest}; run discover again later or name another endpoint.`; break; }
      o.log(`${redactUrl(url)} is throttling log queries; waiting 20s`);
      await new Promise(r => setTimeout(r, 20_000));
      continue;
    }
    if (problem === 'narrow') {
      // Too wide a range or too many results: narrow it. A range of a few blocks that still fails ends the search here.
      if (size > MIN) { size = Math.max(MIN, size >> 2); continue; }
      // Another endpoint may keep older logs.
      if (endpoints.length > 1) { o.log(`${redactUrl(url)} does not answer eth_getLogs below block ${hi}; continuing on another endpoint`); endpoints.splice(at, 1); at = 0; size = 2000; continue; }
      stopped = `${redactUrl(url)} stopped answering eth_getLogs below block ${lowest} (public endpoints often keep logs only for recent blocks); older blocks were not searched by logs.`;
      break;
    }
    strikes = 0; lowest = lo;
    const byHash = new Map<string, number>();
    for (const log of logs) if (typeof log?.transactionHash === 'string' && log.blockNumber) byHash.set(log.transactionHash.toLowerCase(), Number(BigInt(log.blockNumber)));
    const hashes = [...byHash].sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < hashes.length && remaining().length && lookups < LOOKUPS && !stalled() && Date.now() <= o.deadline; i += 50) {
      const part = hashes.slice(i, i + 50);
      let txs: unknown[] = [];
      try { txs = await rpcBatch(o.rpcUrl, part.map(([hash]) => ({method: 'eth_getTransactionByHash' as const, params: [hash]}))); } catch (e) { if (!(e instanceof Failure)) throw e; }
      lookups += part.length;
      const want = remaining(), found: Record<string, Nominee[]> = {};
      (txs as any[]).forEach((tx, k) => {
        const selector = String(tx?.input ?? tx?.data ?? '').slice(0, 10).toLowerCase();
        if (tx?.to && to.has(String(tx.to).toLowerCase()) && want.includes(selector)) (found[selector] ??= []).push({hash: part[k][0], blockNumber: part[k][1]});
      });
      for (const [selector, list] of Object.entries(found)) await offer(selector, list);
    }
    o.log(`Logs of blocks ${lo}–${hi}: ${hashes.length} transaction(s); ${progress()}`);
    if (hashes.length < 500) size = Math.min(MAX, size * 2);
    hi = lo - 1;
  }
  const notes = [
    ...(stopped ? [stopped] : []),
    ...(lookups >= LOOKUPS && !stopped && remaining().length ? [`The log search stopped after reading ${lookups} transactions (down to block ${lowest}); the functions still missing are rare next to this contract's traffic. Set ENVIO_API_TOKEN to filter by function on the server.`] : []),
    ...(widest < all.length ? [`The endpoints named serve eth_getLogs only with an address filter, so the log search saw only transactions in which the contract itself emitted an event; name an endpoint without that limit with another --rpc-url.`] : [])];
  return {available: true, searched: `logs of blocks ${Math.min(lowest, head)}–${head} (${[...new Set(endpoints.map(e => redactUrl(e.url)))].join(', ')})`, ...(notes.length ? {note: notes.join(' ')} : {})};
}

async function fromRpcScan(o: Options): Promise<Discovery> {
  const to = new Set(o.addresses.map(a => a.toLowerCase()));
  const [headHex] = await rpcBatch(o.rpcUrl, [{method: 'eth_blockNumber', params: []}]);
  if (typeof headHex !== 'string') fail('RPC_FAILED', `${redactUrl(o.rpcUrl)} returned no block number.`, 2);
  const head = Number(BigInt(headHex)), floor = Math.max(0, head - o.maxBlocks + 1), per = 20;
  const {offer, lacking, progress} = offering(o);
  // Calls that leave a log trace first (cheap and deep), then a scan of recent blocks for the rest.
  const logs = await fromLogs(o, head);
  if (logs.available && !lacking().length) return {source: 'rpc-logs', searched: logs.searched!, logs};
  if (logs.available) o.log(`Still without a fixture after the log search: ${lacking().length} function(s); scanning the last ${head - floor + 1} blocks for calls that leave no log at the contract`);
  let next = head, scanned = 0, lowest = head, unread = 0;
  const worker = async () => {
    while (next >= floor && lacking().length && Date.now() <= o.deadline) {
      const top = next; next -= per;
      const numbers = Array.from({length: per}, (_, i) => top - i).filter(n => n >= floor);
      const read = (list: number[]) => rpcBatch(o.rpcUrl, list.map(n => ({method: 'eth_getBlockByNumber' as const, params: ['0x' + n.toString(16), true]})));
      const blocks = await read(numbers);
      // A mined block the node answers with null or an error (public endpoints throttle inside a batch) is asked
      // for once more; what is still missing is counted, so "not found" never hides "not read".
      const failed = numbers.map((n, i) => blocks[i] ? -1 : i).filter(i => i >= 0);
      if (failed.length) {
        await new Promise(r => setTimeout(r, 1500));
        const again = await read(failed.map(i => numbers[i]));
        failed.forEach((i, k) => { blocks[i] = again[k]; });
        unread += blocks.filter(b => !b).length;
      }
      const candidates: {selector: string; hash: string; blockNumber: number}[] = [];
      for (const block of blocks as any[]) for (const tx of block?.transactions ?? []) {
        const selector = String(tx.input ?? '').slice(0, 10).toLowerCase();
        if (tx.to && to.has(String(tx.to).toLowerCase()) && lacking().includes(selector)) candidates.push({selector, hash: String(tx.hash).toLowerCase(), blockNumber: Number(BigInt(tx.blockNumber))});
      }
      if (candidates.length) {
        const receiptsOf = (list: typeof candidates) => rpcBatch(o.rpcUrl, list.map(c => ({method: 'eth_getTransactionReceipt' as const, params: [c.hash]})));
        const receipts = await receiptsOf(candidates);
        // A mined transaction has a receipt, so a null one was not read: asked once more, then its block counts as unread.
        const lost = candidates.map((_, i) => receipts[i] ? -1 : i).filter(i => i >= 0);
        if (lost.length) {
          await new Promise(r => setTimeout(r, 1500));
          const again = await receiptsOf(lost.map(i => candidates[i]));
          lost.forEach((i, k) => { receipts[i] = again[k]; });
          unread += new Set(lost.filter(i => !receipts[i]).map(i => candidates[i].blockNumber)).size;
        }
        for (const [i, c] of candidates.entries()) if ((receipts[i] as any)?.status === '0x1') await offer(c.selector, [c]);
      }
      scanned += numbers.length; lowest = Math.min(lowest, numbers[numbers.length - 1] ?? lowest);
      if (scanned % 2000 < per) o.log(`Scanned ${scanned} blocks back from ${head}: ${progress()}`);
    }
  };
  await Promise.all(Array.from({length: 6}, worker));
  return {source: logs.available ? 'rpc-logs+scan' : 'rpc-scan', logs, searched: `${logs.available ? `${logs.searched}; ` : ''}RPC scan of blocks ${lowest}–${head} over ${redactUrl(o.rpcUrl)}${unread ? `, ${unread} of them unreadable` : ''}`, ...(unread ? {unread} : {})};
}

export function discoverCalls(o: Options): Promise<Discovery> {
  return o.token ? fromHypersync({...o, token: o.token}) : fromRpcScan(o);
}
