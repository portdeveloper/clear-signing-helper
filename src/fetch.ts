import { getAddress, isAddress } from 'ethers';
import { fail } from './io.js';

// The one place this tool talks to the network, and only when the user asks for a verified ABI by
// address. Sourcify first: a match there means the on-chain bytecode was compiled from the source
// behind the ABI. Etherscan V2 is the fallback when an API key is present.
export interface VerifiedContract {
  name: string; abi: any[]; userdoc?: any; devdoc?: any;
  source: 'sourcify' | 'etherscan'; url: string; match?: string; fetchedAt: string;
  chainId: number; address: string;
  proxy?: {type: string | null; implementation: {address: string; name?: string}};
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
  } catch (e) { if ((e as Error).name === 'AbortError') fail('FETCH_TIMEOUT', `${url} did not answer within ${timeoutMs / 1000}s.`, 2); fail('FETCH_FAILED', `${url}: ${(e as Error).message}`, 2); }
  finally { clearTimeout(timer); }
}
async function fromSourcify(chainId: number, address: string, depth = 0): Promise<VerifiedContract | undefined> {
  const url = `${SOURCIFY}/v2/contract/${chainId}/${address}?fields=abi,userdoc,devdoc,proxyResolution,compilation`;
  const {status, body} = await getJson(url);
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
  return {name: body.compilation?.name ?? 'Contract', abi: body.abi, userdoc: body.userdoc, devdoc: body.devdoc, source: 'sourcify', url, match: body.match, fetchedAt: new Date().toISOString(), chainId, address};
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
