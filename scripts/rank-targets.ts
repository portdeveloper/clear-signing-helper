// Top-contract targets (roadmap items 24 and 32): rank the busiest Ethereum mainnet contracts that the registry does
// not describe yet, by how many people sign for them. Maintainer script, not shipped.
// Usage: npx tsx scripts/rank-targets.ts [--registry <clone>] [--top 1000] [--window 7d] [--senders 40] [--show 60] [--json <file>]
// Without --registry, a shallow clone of master is made in a temporary directory. With ENVIO_API_TOKEN set, the
// --senders best survivors get distinct and one-time sender counts per function from HyperSync over the window.
// Keep/drop decisions a person made are read from the "Decisions" table in docs/TARGETS.md, with a judgment of how much
// a screen can say (full or partial). Kept contracts are ranked by usefulness: human-side activity (distinct senders when
// measured, else transactions outside bot functions) times 1 for a full screen and 0.5 for a partial one. Survivors
// without a decision are listed separately by activity and flagged NEW. Prints markdown to stdout.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { id } from 'ethers';
import { hypersyncQuery } from '../src/fetch.js';

const {values: args} = parseArgs({options: {registry: {type: 'string'}, top: {type: 'string', default: '1000'}, window: {type: 'string', default: '7d'},
  senders: {type: 'string', default: '40'}, show: {type: 'string', default: '60'}, json: {type: 'string'}}});
const repo = path.resolve(import.meta.dirname, '..');
const RANKING = 'https://erc7730.sourcify.dev/api/live/ranking';
const WINDOW_BLOCKS: Record<string, number> = {'1h': 300, '24h': 7_200, '7d': 50_400}; // 12-second slots
if (!(args.window! in WINDOW_BLOCKS)) { console.error(`--window must be one of ${Object.keys(WINDOW_BLOCKS).join(', ')} (all the API takes).`); process.exit(2); }

// Plain-token surface: ERC-20 and ERC-721 (#3130 Rule 2) plus the token-only extras (allowance helpers, ERC-2612,
// EIP-3009). Wallets build these screens from their trusted token lists.
const TOKEN = new Set([
  'transfer(address,uint256)', 'approve(address,uint256)', 'transferFrom(address,address,uint256)',
  'increaseAllowance(address,uint256)', 'decreaseAllowance(address,uint256)',
  'safeTransferFrom(address,address,uint256)', 'safeTransferFrom(address,address,uint256,bytes)', 'setApprovalForAll(address,bool)',
  'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
  'transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)',
  'transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)',
  'receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)',
].map(selector));
// Functions only bots, relayers, solvers, sequencers or oracles call. Exact signatures, so a human function that
// shares a name (a game's `settle(uint256)`) is not caught. Add to this list when a new one tops the ranking.
const BOT: Record<string, string> = Object.fromEntries([
  ['handleOps((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)[],address)', 'ERC-4337 v0.7 bundler'],
  ['handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes)[],address)', 'ERC-4337 v0.6 bundler'],
  ['execute((uint32,address,bytes,uint256,bytes)[])', 'LayerZero DVN'],
  ['execute302((address,(uint32,bytes32,uint64),bytes32,bytes,bytes,uint256))', 'LayerZero executor'],
  ['commitVerification(bytes,bytes32)', 'LayerZero ULN'],
  ['fillRelay((bytes32,bytes32,bytes32,bytes32,bytes32,uint256,uint256,uint256,uint256,uint32,uint32,bytes),uint256,bytes32)', 'Across relayer'],
  ['fillV3Relay((address,address,address,address,address,uint256,uint256,uint256,uint32,uint32,uint32,bytes),uint256)', 'Across relayer'],
  ['settle(address[],uint256[],(uint256,uint256,address,uint256,uint256,uint32,bytes32,uint256,uint256,uint256,bytes)[],(address,uint256,bytes)[][3])', 'CoW solver'],
  ['transferOut(address,address,uint256,string)', 'THORChain/Maya vault'],
  ['addSequencerL2BatchFromBlobs(uint256,uint256,address,uint256,uint256)', 'Arbitrum sequencer'],
  ['addSequencerL2BatchFromBlobsDelayProof(uint256,uint256,address,uint256,uint256,(bytes32,(uint8,address,uint64,uint64,uint256,uint256,bytes32)))', 'Arbitrum sequencer'],
  ['addSequencerL2BatchFromOrigin(uint256,bytes,uint256,address,uint256,uint256)', 'Arbitrum sequencer'],
  ['addSequencerL2BatchFromOriginDelayProof(uint256,bytes,uint256,address,uint256,uint256,(bytes32,(uint8,address,uint64,uint64,uint256,uint256,bytes32)))', 'Arbitrum sequencer'],
  ['commitBatchesSharedBridge(address,uint256,uint256,bytes)', 'ZK stack sequencer'],
  ['proveBatchesSharedBridge(address,uint256,uint256,bytes)', 'ZK stack prover'],
  ['updateDataFeedsValuesPartial(bytes32[])', 'RedStone oracle'],
  ['fulfillRandomWords((uint256[2],uint256[2],uint256,uint256,uint256,address,uint256[2],uint256[2],uint256),(uint64,uint256,uint32,uint32,address,bytes),bool)', 'Chainlink VRF'],
  ['report(address,bytes,bytes,bytes[])', 'Chainlink Keystone'],
].map(([sig, why]) => [selector(sig), why]));
const TOKEN_SHARE = 0.98, BOT_SHARE = 0.9;
function selector(sig: string) { return id(sig).slice(0, 10); }

interface Selector {selector: string; functionSig: string | null; txCount: number}
interface Row {toAddress: string; sourcifyName: string | null; entity: string | null; inRegistry: boolean; verified: boolean; txCount: number; distinctSelectors: number; topSelectors: Selector[]}
interface Senders {senders: number; oneTime: number; txs: number; partial: boolean; byFunction: Record<string, {senders: number; txs: number}>}
interface Target {address: string; name: string; tx: number; humanTx: number; botTx: number; tokenTx: number; functions: Selector[]; bots: string[]; eip712Only: boolean;
  decision?: Decision; senders?: Senders}
interface Decision {decision: 'keep' | 'drop'; screen?: 'full' | 'partial'; name: string; reason: string}
// How much of what matters a screen can state: full, or only what is paid in (the output is off-chain or opaque).
const SCREEN_WEIGHT = {full: 1, partial: 0.5};

// 1. The ranking: the API returns up to 1000 rows per request.
const top = Number(args.top);
const rows: Row[] = []; let window: any;
for (let offset = 0; offset < top; offset += 1000) {
  const url = `${RANKING}?window=${args.window}&limit=${Math.min(1000, top - offset)}&offset=${offset}`;
  const response = await fetch(url);
  if (!response.ok) { console.error(`${url}: HTTP ${response.status}`); process.exit(2); }
  const body: any = await response.json(); window = body.window;
  rows.push(...body.contracts);
  if (body.contracts.length < Math.min(1000, top - offset)) break;
}

// 2. Coverage: chain-1 deployments of registry descriptors. Test files name other contracts as recipients and
// spenders, so a grep of the whole tree overstates it (Relay Depository looked covered that way).
let clone = args.registry, temp: string | undefined;
if (!clone) {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-rank-targets-'));
  clone = path.join(temp, 'registry');
  const r = spawnSync('git', ['clone', '--quiet', '--depth', '1', 'https://github.com/ethereum/clear-signing-erc7730-registry.git', clone], {encoding: 'utf8'});
  if (r.status !== 0) { console.error(`git clone failed: ${r.stderr || r.error?.message}`); process.exit(2); }
}
const head = spawnSync('git', ['-C', clone, 'log', '-1', '--format=%h %cs'], {encoding: 'utf8'}).stdout.trim();
const calldata = new Map<string, string>(), eip712 = new Map<string, string>();
(function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!/^tests(v2)?$/.test(entry.name)) walk(file); continue; }
    if (!entry.name.endsWith('.json')) continue;
    let d: any; try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const rel = path.relative(clone!, file);
    for (const [deployments, into] of [[d?.context?.contract?.deployments, calldata], [d?.context?.eip712?.deployments, eip712]] as const)
      for (const dep of Array.isArray(deployments) ? deployments : []) if (Number(dep?.chainId) === 1 && typeof dep?.address === 'string') into.set(dep.address.toLowerCase(), rel);
  }
})(path.join(clone, 'registry'));
if (temp) fs.rmSync(temp, {recursive: true, force: true});

// 3. Decisions a person made, from docs/TARGETS.md: | `0x…` | keep/drop | full/partial/- | name | reason |
const decisions = new Map<string, Decision>();
const targetsDoc = path.join(repo, 'docs', 'TARGETS.md');
for (const line of fs.readFileSync(targetsDoc, 'utf8').split('\n')) {
  const m = /^\|\s*`(0x[0-9a-fA-F]{40})`\s*\|\s*(keep|drop)\s*\|\s*(full|partial|-)\s*\|([^|]*)\|([^|]*)\|/.exec(line);
  if (m) decisions.set(m[1].toLowerCase(), {decision: m[2] as 'keep' | 'drop', ...(m[3] !== '-' ? {screen: m[3] as 'full' | 'partial'} : {}), name: m[4].trim(), reason: m[5].trim()});
}

// 4. Automatic drops, then manual ones.
const dropped: Record<string, string[]> = {unverified: [], covered: [], 'plain token': [], 'bot traffic': [], 'decided drop': []};
const disagreements: string[] = [], targets: Target[] = [];
for (const r of rows) {
  const address = r.toAddress.toLowerCase(), name = r.sourcifyName ?? r.entity ?? '(unnamed)';
  const covered = calldata.has(address);
  if (covered !== r.inRegistry) disagreements.push(`\`${address}\` ${name}: dashboard says ${r.inRegistry ? 'in' : 'not in'} registry, deployments say ${covered ? `covered by ${calldata.get(address)}` : 'not covered'}`);
  if (covered) { dropped.covered.push(address); continue; }
  if (!r.verified) { dropped.unverified.push(address); continue; }
  const sum = (pick: (s: Selector) => boolean) => r.topSelectors.filter(pick).reduce((n, s) => n + s.txCount, 0);
  const tokenTx = sum(s => TOKEN.has(s.selector)), botTx = sum(s => s.selector in BOT);
  if (tokenTx >= TOKEN_SHARE * r.txCount) { dropped['plain token'].push(address); continue; }
  if (botTx >= BOT_SHARE * r.txCount) { dropped['bot traffic'].push(address); continue; }
  const decision = decisions.get(address);
  if (decision?.decision === 'drop') { dropped['decided drop'].push(address); continue; }
  targets.push({address, name, tx: r.txCount, humanTx: r.txCount - botTx, botTx, tokenTx, decision, eip712Only: eip712.has(address),
    functions: r.topSelectors.filter(s => !(s.selector in BOT)), bots: [...new Set(r.topSelectors.filter(s => s.selector in BOT).map(s => BOT[s.selector]))]});
}
targets.sort((a, b) => b.humanTx - a.humanTx);

// 5. Senders per function from HyperSync: distinct `from` over the window, and how many sent exactly one transaction.
// A contract most people use once is human-heavy; a few addresses sending thousands is a bot, whatever the function.
const token = process.env.ENVIO_API_TOKEN, measure = [...targets.filter(t => t.decision), ...targets.filter(t => !t.decision).slice(0, Number(args.senders))], sendersFor = measure.length;
let senderNote = token ? '' : 'ENVIO_API_TOKEN is not set, so no sender counts; ranked by transactions outside bot functions.';
if (token && sendersFor) {
  const probe = await hypersyncQuery(1, token, {from_block: 0, to_block: 1, transactions: [{to: [targets[0].address]}], field_selection: {transaction: ['hash']}, max_num_transactions: 1});
  const tip = Number(probe?.archive_height), from = Math.max(0, tip - WINDOW_BLOCKS[args.window!]);
  senderNote = `Senders from HyperSync, blocks ${from}–${tip} (successful transactions only), for the ${sendersFor} kept or most active undecided contracts.`;
  for (const t of measure) {
    const perSender = new Map<string, number>(), byFunction: Record<string, {senders: Set<string>; txs: number}> = {};
    let next = from, pages = 0, txs = 0;
    for (; next <= tip && pages < 50; pages++) {
      const body = await hypersyncQuery(1, token, {from_block: next, to_block: tip + 1, transactions: [{to: [t.address], status: 1}],
        field_selection: {transaction: ['from', 'input']}, max_num_transactions: 10_000});
      const batches = Array.isArray(body?.data) ? body.data : [body?.data ?? {}];
      for (const tx of batches.flatMap((b: any) => Array.isArray(b?.transactions) ? b.transactions : [])) {
        const sel = String(tx.input ?? '').slice(0, 10).toLowerCase(), sender = String(tx.from ?? '').toLowerCase();
        if (sel in BOT || !sender) continue;
        txs++; perSender.set(sender, (perSender.get(sender) ?? 0) + 1);
        const f = byFunction[sel] ??= {senders: new Set(), txs: 0}; f.senders.add(sender); f.txs++;
      }
      const n = Number(body?.next_block);
      if (!Number.isFinite(n) || n <= next) break;
      next = n;
    }
    t.senders = {senders: perSender.size, oneTime: [...perSender.values()].filter(n => n === 1).length, txs, partial: next <= tip,
      byFunction: Object.fromEntries(Object.entries(byFunction).map(([s, f]) => [s, {senders: f.senders.size, txs: f.txs}]))};
    console.error(`senders ${t.name} ${t.address}: ${t.senders.senders} distinct, ${t.senders.oneTime} one-time${t.senders.partial ? ' (partial: page limit)' : ''}`);
  }
}

// 6. Report.
const k = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const fname = (s: Selector) => s.functionSig ? s.functionSig.slice(0, s.functionSig.indexOf('(')) : s.selector;
const out: string[] = [];
out.push(`# Target ranking, ${window.fromIso.slice(0, 10)} to ${window.toIso.slice(0, 10)}`, '');
out.push(`Source: ${RANKING}?window=${args.window}, top ${rows.length} Ethereum mainnet contracts by transactions. Registry ${head || clone}.`);
out.push(`Dropped: ${Object.entries(dropped).map(([why, list]) => `${list.length} ${why}`).join(', ')}. ${targets.length} left.`);
if (senderNote) out.push(senderNote);
const activity = (t: Target) => t.senders?.senders ?? t.humanTx;
const row = (t: Target, i: number, lead: string) => {
  const s = t.senders;
  const fns = t.functions.slice(0, 4).map(f => `${fname(f)} ${s ? `${k(s.byFunction[f.selector]?.senders ?? 0)}s` : k(f.txCount)}`).join(', ');
  const notes = [t.bots.length ? `bots: ${t.bots.join(', ')}` : '', t.tokenTx ? `${Math.round(100 * t.tokenTx / t.tx)}% token calls` : '', t.eip712Only ? 'EIP-712 file exists' : ''].filter(Boolean);
  return `| ${i + 1} | ${lead}${t.decision?.name || t.name} | \`${t.address}\` | ${k(t.tx)} | ${k(t.humanTx)} | ${s ? `${k(s.senders)}${s.partial ? '+' : ''}` : ''} | ${s && s.senders ? `${Math.round(100 * s.oneTime / s.senders)}%` : ''} | ${fns}${notes.length ? ` (${notes.join('; ')})` : ''} |`;
};
const head_ = '| # | Contract | Address | 7d tx | Human-side tx | Senders | One-time | Top functions (tx, or senders when measured) |';
const kept = targets.filter(t => t.decision).map(t => ({t, score: activity(t) * (t.decision!.screen ? SCREEN_WEIGHT[t.decision!.screen] : 1)})).sort((a, b) => b.score - a.score);
out.push('', `## Kept, by usefulness (${kept.length})`, '', `Score: ${token ? 'distinct human senders' : 'human-side transactions'} times 1 for a full screen, 0.5 for a partial one.`, '',
  '| # | Score | Screen | Contract | Address | 7d tx | Human-side tx | Senders | One-time | Top functions | Why |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...kept.map(({t, score}, i) => row(t, i, '').replace(/^\| (\d+) \| /, `| $1 | ${k(Math.round(score))} | ${t.decision!.screen ?? '?'} | `) + ` ${t.decision!.reason} |`));
const fresh = targets.filter(t => !t.decision).sort((a, b) => activity(b) - activity(a)), shown = fresh.slice(0, Number(args.show));
out.push('', `## Undecided, by activity (${shown.length} of ${fresh.length})`, '', head_, '|---|---|---|---|---|---|---|---|', ...shown.map((t, i) => row(t, i, '**NEW** ')));
out.push('', 'For each undecided contract you look at, add a row to the Decisions table in docs/TARGETS.md: keep or drop, and whether a screen can say everything that matters (full) or only what is paid in (partial).');
if (disagreements.length) out.push('', '## Dashboard and registry disagree', '', ...disagreements.map(d => `- ${d}`));
const unseen = [...decisions].filter(([a]) => !rows.some(r => r.toAddress.toLowerCase() === a));
if (unseen.length) out.push('', '## Decided, but not in this ranking', '', ...unseen.map(([a, d]) => `- \`${a}\` ${d.name} (${d.decision})`));
console.log(out.join('\n'));
if (args.json) fs.writeFileSync(args.json, JSON.stringify({window, registry: head, rows: rows.length, dropped, targets, disagreements}, null, 2) + '\n');
