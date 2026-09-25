import fs from 'node:fs';
import path from 'node:path';
import { Interface, FunctionFragment, getAddress, isAddress } from 'ethers';
import { assertKeys, fail, hash, readJson, safePath, walk, writeJson } from './io.js';
import type { Contract, Project } from './foundry.js';
import type { BroadcastDeployment } from './broadcast.js';
import type { VerifiedContract } from './fetch.js';

// ABI mode: no Foundry build. Contracts are ABI files under clear-signing/abi/, each with a
// .source.json sidecar recording where the ABI came from. The fingerprint covers those files only.
export const ABI_DIR = 'clear-signing/abi';
export interface AbiSource {source: 'file' | 'sourcify' | 'etherscan'; importedAt: string; origin: string; chainId?: number; address?: string; match?: string; url?: string; proxy?: VerifiedContract['proxy']; userdoc?: any; devdoc?: any; immutables?: VerifiedContract['immutables']}
const nameOk = (name: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
export function abiContractId(name: string) { return `${ABI_DIR}/${name}.json:${name}`; }
// Relative paths resolve from the project root, like every other path the CLI accepts.
export function importAbiFile(root: string, file: string, name?: string) {
  const resolved = path.resolve(root, file);
  const abi = readJson(resolved);
  const contractName = name ?? path.basename(file).replace(/\.(abi\.)?json$/i, '');
  if (!nameOk(contractName)) fail('INVALID_NAME', `Contract name "${contractName}" must be a Solidity identifier. Pass --name.`, 2);
  return storeAbi(root, contractName, Array.isArray(abi) ? abi : abi?.abi, {source: 'file', importedAt: new Date().toISOString(), origin: path.relative(root, resolved) || file});
}
export function importVerified(root: string, v: VerifiedContract, name?: string) {
  const contractName = name ?? v.name;
  if (!nameOk(contractName)) fail('INVALID_NAME', `Contract name "${contractName}" must be a Solidity identifier. Pass --name.`, 2);
  return storeAbi(root, contractName, v.abi, {source: v.source, importedAt: v.fetchedAt, origin: v.url, chainId: v.chainId, address: v.address, match: v.match, url: v.url, ...(v.proxy ? {proxy: v.proxy} : {}), ...(v.userdoc ? {userdoc: v.userdoc} : {}), ...(v.devdoc ? {devdoc: v.devdoc} : {}), ...(v.immutables ? {immutables: v.immutables} : {})});
}
function storeAbi(root: string, name: string, abi: unknown, source: AbiSource) {
  if (!Array.isArray(abi) || !abi.length) fail('INVALID_ABI', `ABI for ${name} must be a nonempty JSON array (or an object with an "abi" array).`, 2);
  try { new Interface(abi); } catch (e) { fail('INVALID_ABI', `ABI for ${name} does not parse: ${(e as Error).message}`, 2); }
  const file = safePath(root, `${ABI_DIR}/${name}.json`), sidecar = safePath(root, `${ABI_DIR}/${name}.source.json`);
  if (fs.existsSync(file)) fail('FILE_EXISTS', `Refusing to overwrite ${path.relative(root, file)}. Remove it to re-import, or pass --name.`, 2);
  writeJson(file, abi); writeJson(sidecar, source);
  return {id: abiContractId(name), file: path.relative(root, file), sidecar: path.relative(root, sidecar), source};
}
export function loadAbiProject(root: string): Project {
  const dir = safePath(root, ABI_DIR);
  const contracts: Contract[] = [], deployments: BroadcastDeployment[] = [], files: [string, string][] = [];
  for (const file of walk(dir, '.json')) {
    const rel = path.relative(root, file);
    files.push([rel, hash(fs.readFileSync(file, 'utf8'))]);
    if (file.endsWith('.source.json')) continue;
    const name = path.basename(file, '.json');
    if (!nameOk(name)) fail('INVALID_NAME', `${rel}: file name must be a Solidity identifier.`, 2);
    const abi = readJson(file);
    if (!Array.isArray(abi)) fail('INVALID_ABI', `${rel} must contain a JSON ABI array.`, 2);
    const sidecarFile = file.replace(/\.json$/, '.source.json');
    const source: AbiSource | undefined = fs.existsSync(sidecarFile) ? readJson(sidecarFile) : undefined;
    if (source) assertKeys(source, ['source', 'importedAt', 'origin', 'chainId', 'address', 'match', 'url', 'proxy', 'userdoc', 'devdoc', 'immutables'], `${path.relative(root, sidecarFile)}`);
    const iface = new Interface(abi);
    const functions = iface.fragments.filter((f): f is FunctionFragment => f.type === 'function' && !['view', 'pure'].includes((f as FunctionFragment).stateMutability));
    contracts.push({id: abiContractId(name), name, source: `${ABI_DIR}/${name}.json`, artifact: file, abi, functions: functions.sort((a, b) => a.format().localeCompare(b.format())), special: abi.filter((x: any) => ['fallback', 'receive'].includes(x.type)).map((x: any) => `${x.type}()`), metadata: {}, immutables: source?.immutables, userdoc: source?.userdoc, devdoc: source?.devdoc});
    // A verified-source import binds the address it was fetched for; the proxy address when there is one.
    if (source?.chainId && source.address && isAddress(source.address)) deployments.push({chainId: source.chainId, contractName: name, address: getAddress(source.address), arguments: null, script: source.source, file: path.relative(root, sidecarFile)});
  }
  if (!contracts.length) fail('NO_CONTRACTS', `No ABI files under ${ABI_DIR}/. Run init --abi <file> or init --address <addr> --chain-id <id>.`, 2);
  contracts.sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = hash({mode: 'abi', files: files.sort()});
  return {root, profile: 'abi', config: {}, forgeVersion: 'none (ABI mode)', contracts, fingerprint, deployments, calls: []};
}
