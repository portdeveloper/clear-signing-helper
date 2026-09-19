import fs from 'node:fs';
import path from 'node:path';
import { getAddress, isAddress } from 'ethers';
import { readJson } from './io.js';

// A contract creation recorded by `forge script --broadcast`. This is the repository's own
// record of what it deployed, so it is proof-grade for deployment bindings.
export interface BroadcastDeployment {chainId: number; contractName: string; address: string; arguments: string[] | null; script: string; file: string}
// A transaction sent by a broadcast script to an existing contract: real calldata against a real deployment.
export interface BroadcastCall {hash: string; chainId: number; from?: string; to: string; data: string; value: string; function?: string; script: string; file: string}

// Reads broadcast/<Script>/<chainId>/run-latest.json for every script and chain. Dry runs are skipped.
export function readBroadcasts(root: string, dir = 'broadcast'): {deployments: BroadcastDeployment[]; calls: BroadcastCall[]} {
  const base = path.resolve(root, dir);
  const result: BroadcastDeployment[] = [], calls: BroadcastCall[] = [];
  if (!fs.existsSync(base)) return {deployments: result, calls};
  const seen = new Set<string>();
  for (const script of fs.readdirSync(base, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name).sort()) {
    const scriptDir = path.join(base, script);
    for (const chainDir of fs.readdirSync(scriptDir, {withFileTypes: true}).filter(e => e.isDirectory() && /^\d+$/.test(e.name)).map(e => e.name).sort()) {
      const file = path.join(scriptDir, chainDir, 'run-latest.json');
      if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) continue;
      let run: any;
      try { run = readJson(file); } catch { continue; }
      const chainId = Number.isSafeInteger(run?.chain) && run.chain > 0 ? run.chain : Number(chainDir);
      for (const tx of Array.isArray(run?.transactions) ? run.transactions : []) {
        if (tx?.transactionType === 'CALL') {
          const t = tx.transaction ?? {};
          if (typeof tx.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(tx.hash) && isAddress(t.to ?? '') && typeof t.input === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(t.input)) {
            let value = '0';
            try { value = BigInt(t.value ?? 0).toString(); } catch { continue; }
            calls.push({hash: tx.hash.toLowerCase(), chainId, ...(isAddress(t.from ?? '') ? {from: getAddress(t.from)} : {}), to: getAddress(t.to), data: t.input, value, ...(typeof tx.function === 'string' ? {function: tx.function} : {}), script, file: path.relative(root, file)});
          }
          continue;
        }
        if (!['CREATE', 'CREATE2'].includes(tx?.transactionType) || typeof tx.contractName !== 'string' || !isAddress(tx.contractAddress ?? '')) continue;
        const address = getAddress(tx.contractAddress);
        if (/^0x0{40}$/i.test(address)) continue;
        const key = `${chainId}:${address.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const args = Array.isArray(tx.arguments) && tx.arguments.every((a: unknown) => typeof a === 'string') ? tx.arguments as string[] : null;
        result.push({chainId, contractName: tx.contractName, address, arguments: args, script, file: path.relative(root, file)});
      }
    }
  }
  return {deployments: result, calls};
}
