import { getAddress, isAddress } from 'ethers';
import { fail, Failure } from './io.js';
import { namedImmutables, type NamedImmutable } from './immutables.js';

// The one place this tool talks to the network, and only when the user asks for a verified ABI by
// address or names an RPC endpoint. Sourcify first: a match there means the on-chain bytecode was
// compiled from the source behind the ABI. Etherscan V2 is the fallback when an API key is present.
export interface VerifiedContract {
  name: string; abi: any[]; userdoc?: any; devdoc?: any;
  source: 'sourcify' | 'etherscan'; url: string; match?: string; fetchedAt: string;
  chainId: number; address: string;
  proxy?: {type: string | null; implementation: {address: string; name?: string}};
  immutables?: NamedImmutable[];
}
const SOURCIFY = process.env.CLEAR_SIGNING_SOURCIFY_URL ?? 'https://sourcify.dev/server';
const ETHERSCAN = process.env.CLEAR_SIGNING_ETHERSCAN_URL ?? 'https://api.etherscan.io/v2/api';
async function getJson(url: string, timeoutMs = 30_000): Promise<{status: number; body: any}> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {accept: 'application/json'}});
    const text = await response.text();
    if (text.length > 16 * 1024 * 1024) fail('FETCH_TOO_LARGE', `${url} returned more than 16 MiB.`, 2);
    let body: any = null; try { body = JSON.parse(text); } catch { body = null; }
    return {status: response.status, body};
  } catch (e) { if (e instanceof Failure) throw e; if ((e as Error).name === 'AbortError') fail('FETCH_TIMEOUT', `${url} did not answer within ${timeoutMs / 1000}s.`, 2); fail('FETCH_FAILED', `${url}: ${(e as Error).message}`, 2); }
  finally { clearTimeout(timer); }
}
async function fromSourcify(chainId: number, address: string, depth = 0): Promise<VerifiedContract | undefined> {
  // The bytecode, source map and sources only name immutables (immutables.ts); a record too large to
  // fetch with them is fetched without, and the draft simply has no named constants.
  const base = `${SOURCIFY}/v2/contract/${chainId}/${address}?fields=abi,userdoc,devdoc,proxyResolution,compilation`;
  let url = `${base},runtimeBytecode,sources,stdJsonOutput`, response;
  try { response = await getJson(url); } catch (e) { if (!(e instanceof Failure && e.code === 'FETCH_TOO_LARGE')) throw e; url = base; response = await getJson(url); }
  const {status, body} = response;
  if (status === 404 || !body?.match) return undefined;
  if (status !== 200) fail('FETCH_FAILED', `Sourcify returned HTTP ${status} for ${chainId}:${address}.`, 2);
  const proxy = body.proxyResolution;
  if (proxy?.isProxy && depth === 0) {
    const impls = Array.isArray(proxy.implementations) ? proxy.implementations.filter((i: any) => isAddress(i?.address ?? '')) : [];
    if (impls.length !== 1) fail('PROXY_AMBIGUOUS', `${address} is a ${proxy.proxyType ?? 'proxy'} with ${impls.length} resolved implementation(s). Pass the implementation address explicitly and bind the proxy by hand.`, 2);
    const impl = await fromSourcify(chainId, getAddress(impls[0].address), 1);
    if (!impl) fail('IMPLEMENTATION_UNVERIFIED', `Implementation ${impls[0].address} behind proxy ${address} is not verified on Sourcify.`, 2);
    return {...impl, chainId, address, url, proxy: {type: proxy.proxyType ?? null, implementation: {address: getAddress(impls[0].address), name: impls[0].name ?? impl.name}}};
  }
  if (!Array.isArray(body.abi)) fail('FETCH_FAILED', `Sourcify match for ${address} has no ABI.`, 2);
  const immutables = namedImmutables(body, body.abi);
  return {name: body.compilation?.name ?? 'Contract', abi: body.abi, userdoc: body.userdoc, devdoc: body.devdoc, source: 'sourcify', url, match: body.match, fetchedAt: new Date().toISOString(), chainId, address, ...(immutables.length ? {immutables} : {})};
}
async function fromEtherscan(chainId: number, address: string, depth = 0): Promise<VerifiedContract | undefined> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return undefined;
  const url = `${ETHERSCAN}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${encodeURIComponent(key)}`;
  const {status, body} = await getJson(url);
  if (status !== 200 || body?.status !== '1' || !Array.isArray(body.result) || !body.result[0]) return undefined;
  const r = body.result[0];
  if (typeof r.ABI !== 'string' || !r.ABI.startsWith('[')) return undefined;
  if (depth === 0 && typeof r.Implementation === 'string' && isAddress(r.Implementation) && r.Implementation.toLowerCase() !== address.toLowerCase()) {
    const impl = await fromEtherscan(chainId, getAddress(r.Implementation), 1);
    if (!impl) fail('IMPLEMENTATION_UNVERIFIED', `Implementation ${r.Implementation} behind proxy ${address} is not verified on Etherscan.`, 2);
    return {...impl, chainId, address, url: url.replace(/apikey=[^&]*/, 'apikey=***'), proxy: {type: r.Proxy === '1' ? 'etherscan-proxy' : null, implementation: {address: getAddress(r.Implementation), name: impl.name}}};
  }
  let abi: any; try { abi = JSON.parse(r.ABI); } catch { return undefined; }
  return {name: r.ContractName || 'Contract', abi, source: 'etherscan', url: url.replace(/apikey=[^&]*/, 'apikey=***'), match: 'etherscan-verified', fetchedAt: new Date().toISOString(), chainId, address};
}
export async function fetchVerifiedContract(chainId: number, address: string): Promise<VerifiedContract> {
  if (!isAddress(address)) fail('INVALID_ADDRESS', `${address} is not a valid address.`, 2);
  const checksummed = getAddress(address);
  const found = await fromSourcify(chainId, checksummed) ?? await fromEtherscan(chainId, checksummed);
  if (!found) fail('SOURCE_UNVERIFIED', `${chainId}:${checksummed} is not verified on Sourcify${process.env.ETHERSCAN_API_KEY ? ' or Etherscan' : ', and ETHERSCAN_API_KEY is not set for the Etherscan fallback'}. Verify the contract on https://sourcify.dev or pass --abi <file> with the ABI you trust.`, 2);
  return found;
}

// A read-only JSON-RPC call against an endpoint the user named. Never signs or sends.
type ReadMethod = 'eth_chainId' | 'eth_getCode' | 'eth_call' | 'eth_getTransactionByHash' | 'eth_getTransactionReceipt';
const redact = (url: string) => url.replace(/\/\/[^/]*@/, '//***@').replace(/([?&][^=]*key[^=]*=)[^&]*/gi, '$1***');
async function rpcRequest(url: string, method: ReadMethod, params: unknown[], timeoutMs = 30_000): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  const shown = redact(url);
  try {
    const response = await fetch(url, {method: 'POST', signal: controller.signal, headers: {'content-type': 'application/json', accept: 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
    const text = await response.text();
    if (text.length > 1024 * 1024) fail('FETCH_TOO_LARGE', `${shown} returned more than 1 MiB for ${method}.`, 2);
    let body: any = null; try { body = JSON.parse(text); } catch { body = null; }
    if (body?.error) fail('RPC_ERROR', `${method} on ${shown}: ${String(body.error.message ?? JSON.stringify(body.error)).slice(0, 300)}`, 1);
    if (response.status !== 200 || !body || !('result' in body)) fail('RPC_FAILED', `${method} on ${shown} returned HTTP ${response.status} without a result.`, 2);
    return body.result;
  } catch (e) {
    if ((e as Error).name === 'AbortError') fail('FETCH_TIMEOUT', `${shown} did not answer ${method} within ${timeoutMs / 1000}s.`, 2);
    if (e instanceof Failure) throw e;
    fail('FETCH_FAILED', `${shown}: ${(e as Error).message}`, 2);
  } finally { clearTimeout(timer); }
}
export async function rpcCall(url: string, method: 'eth_chainId' | 'eth_getCode' | 'eth_call', params: unknown[], timeoutMs = 30_000): Promise<string> {
  const result = await rpcRequest(url, method, params, timeoutMs);
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]*$/.test(result)) fail('RPC_FAILED', `${method} on ${redact(url)} returned no hex result.`, 2);
  return result;
}
// A mined, successful transaction as sent: the calldata is copied, never re-encoded. Only the top-level
// call is visible here, so a call that reached a contract through a router or multicall has another `to`.
export interface ChainTransaction {hash: string; chainId: number; from: string; to: string; data: string; value: string; blockNumber: number; rpc: string}
export async function fetchTransaction(url: string, hash: string): Promise<ChainTransaction> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) fail('FIXTURE_ARGUMENTS', '--tx must be a 32-byte transaction hash.', 2);
  const chainId = Number(BigInt(await rpcCall(url, 'eth_chainId', [])));
  const tx: any = await rpcRequest(url, 'eth_getTransactionByHash', [hash]);
  if (!tx) fail('TX_NOT_FOUND', `${redact(url)} (chain ${chainId}) has no transaction ${hash}. Check the hash and that the endpoint serves the chain it was sent on.`, 2);
  if (tx.blockNumber === null || tx.blockNumber === undefined) fail('TX_PENDING', `Transaction ${hash} is not mined yet.`, 2);
  if (!tx.to) fail('TX_CONTRACT_CREATION', `Transaction ${hash} deploys a contract; it calls no function.`, 2);
  if (tx.chainId !== undefined && tx.chainId !== null && Number(BigInt(tx.chainId)) !== chainId) fail('RPC_CHAIN_MISMATCH', `Transaction ${hash} is signed for chain ${Number(BigInt(tx.chainId))}, but ${redact(url)} serves chain ${chainId}.`, 2);
  const receipt: any = await rpcRequest(url, 'eth_getTransactionReceipt', [hash]);
  if (receipt?.status === '0x0') fail('TX_REVERTED', `Transaction ${hash} reverted; use a transaction that succeeded, so the test shows what the contract actually did.`, 2);
  const data = typeof tx.input === 'string' ? tx.input : tx.data;
  if (typeof data !== 'string' || !isAddress(tx.to) || !isAddress(tx.from ?? '')) fail('RPC_FAILED', `${redact(url)} returned an incomplete transaction for ${hash}.`, 2);
  return {hash: hash.toLowerCase(), chainId, from: getAddress(tx.from), to: getAddress(tx.to), data, value: BigInt(tx.value ?? '0x0').toString(), blockNumber: Number(BigInt(tx.blockNumber)), rpc: redact(url)};
}
