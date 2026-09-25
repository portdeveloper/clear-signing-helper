import { getAddress, isAddress } from 'ethers';
import type { Contract, Project } from './foundry.js';
import { deployedContracts } from './foundry.js';
import { indexAsts, findContract, findFunction, enumLeaves, constructorBindings, addressConstants, type EnumLeaf } from './ast.js';

// Everything the repository itself states or proves about a contract, gathered once per init/sync.
// Nothing here is guessed: NatSpec is author text, enums and immutables come from the AST, and
// constants come from constructor arguments recorded in broadcast files.
export interface Evidence {
  notices: Record<string, string>;                 // sighash -> @notice
  paramDocs: Record<string, Record<string, string>>; // sighash -> param name -> @param text
  enums: Record<string, EnumLeaf[]>;               // sighash -> enum-typed leaves
  constants: Record<string, {value: string; source: string; kind?: 'ast' | 'broadcast' | 'verified'}>; // state variable -> address
  conventions: {erc20: boolean; weth: boolean};
}
const has = (c: Contract, sig: string, mutability?: string[]) => c.abi.some((f: any) => f.type === 'function' && `${f.name}(${(f.inputs ?? []).map((i: any) => i.type).join(',')})` === sig && (!mutability || mutability.includes(f.stateMutability)));
export function gatherEvidence(project: Project, c: Contract): Evidence {
  const notices: Evidence['notices'] = {}, paramDocs: Evidence['paramDocs'] = {}, enums: Evidence['enums'] = {}, constants: Evidence['constants'] = {};
  for (const [sig, doc] of Object.entries<any>(c.userdoc?.methods ?? {})) if (typeof doc?.notice === 'string' && doc.notice.trim()) notices[sig] = doc.notice.trim();
  for (const [sig, doc] of Object.entries<any>(c.devdoc?.methods ?? {})) {
    const params = Object.fromEntries(Object.entries<any>(doc?.params ?? {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, String(v).trim()]));
    if (Object.keys(params).length) paramDocs[sig] = params;
  }
  const index = indexAsts(project.contracts.map(x => x.ast).filter(Boolean));
  const node = findContract(index, c.source, c.name);
  if (node) {
    for (const f of c.functions) {
      const def = findFunction(index, node, f.selector);
      const leaves = def ? enumLeaves(index, def) : [];
      if (leaves.length) enums[f.format('sighash')] = leaves;
    }
    for (const k of addressConstants(index, node)) constants[k.name] = {value: getAddress(k.value), source: `constant in ${c.source}`, kind: 'ast'};
    const bindings = constructorBindings(index, node);
    const deployments = deployedContracts(project).filter(x => x.contracts.length === 1 && x.contracts[0].id === c.id).map(x => x.deployment);
    for (const b of bindings) {
      if (!/^(address|contract )/.test(b.typeString)) continue;
      const values = deployments.map(d => d.arguments?.[b.paramIndex]).filter((v): v is string => typeof v === 'string' && isAddress(v)).map(v => getAddress(v));
      // A constant must hold for every bound deployment; differing values stay a human decision.
      if (values.length && values.length === deployments.length && new Set(values.map(v => v.toLowerCase())).size === 1) constants[b.name] = {value: values[0], source: `constructor argument ${b.paramIndex} in ${deployments.map(d => d.file).join(', ')}`};
    }
  }
  // Address mode: immutables named from the verified record (see immutables.ts). They hold for every call to this deployment.
  for (const k of c.immutables ?? []) constants[k.name] ??= {value: getAddress(k.address), source: `immutable in the verified bytecode of ${c.source}`, kind: 'verified'};
  const erc20 = has(c, 'transfer(address,uint256)') && has(c, 'approve(address,uint256)') && has(c, 'transferFrom(address,address,uint256)') && has(c, 'balanceOf(address)', ['view']) && has(c, 'totalSupply()', ['view']) && has(c, 'decimals()', ['view', 'pure']);
  const weth = erc20 && has(c, 'deposit()', ['payable']) && has(c, 'withdraw(uint256)');
  return {notices, paramDocs, enums, constants, conventions: {erc20, weth}};
}
