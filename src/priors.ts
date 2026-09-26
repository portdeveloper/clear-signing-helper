import fs from 'node:fs';
import path from 'node:path';
import { FunctionFragment, ParamType } from 'ethers';
import { fail } from './io.js';
import priors from './data/registry-priors.json' with {type: 'json'};
import { leaves, parseSignature, resolveFields, type Field, type Group, type ResolvedField } from './descriptors.js';

// What other registry descriptors do with the same function selector. Advisory only: it never
// changes a draft, it pre-fills suggestions and warns when a draft disagrees in kind with every prior.
export interface Prior {entity: string; file: string; key: string; intent?: string; interpolatedIntent?: string; fields: any[]}
export const PRIORS_META = {repository: priors.repository, commit: priors.commit, generatedAt: priors.generatedAt, selectors: priors.selectors};
// The bundled snapshot, unless a command read the user's registry clone (init --registry).
let active = priors.bySelector as Record<string, Prior[]>;
export function usePriorsIndex(bySelector: Record<string, Prior[]>) { active = bySelector; descriptorSelectors = undefined; }
export function priorsFor(selector: string): Prior[] { return active[selector.toLowerCase()] ?? []; }
// hidden: the leaf is not displayed. raw: shown without formatting. typed: shown with a semantic format.
export type LeafKind = 'hidden' | 'raw' | 'typed';
export interface LeafView {path: string; kind: LeafKind; format?: string; params?: Record<string, unknown>}
// Leaves in ABI order, so two descriptors of the same selector align by index even when their parameter names differ.
export function leafViews(key: string, fields: (Field | Group)[], definitions: Record<string, Field> = {}): LeafView[] | undefined {
  let fn: FunctionFragment;
  try { fn = parseSignature(key); } catch { return undefined; }
  const shown = new Map<string, Field>();
  // Priors carry no display definitions (the snapshot resolves them); a draft passes its own. A malformed tree yields no view.
  let resolved: ResolvedField[]; try { resolved = resolveFields(Array.isArray(fields) ? fields : [], definitions); } catch { return undefined; }
  for (const r of resolved) if (r.key && !r.key.startsWith('@.') && !r.hidden) shown.set(r.key, r.field);
  return leaves(fn.inputs).map(leaf => {
    const f = shown.get(leaf.path);
    if (!f) return {path: leaf.path, kind: 'hidden'};
    return {path: leaf.path, kind: !f.format || f.format === 'raw' ? 'raw' : 'typed', format: f.format ?? 'raw', ...(f.params ? {params: f.params} : {})};
  });
}
export function summarizePrior(p: Prior): string {
  const views = leafViews(p.key, p.fields);
  const parts = views ? views.map(v => `${v.path.split('.').pop()}=${v.kind === 'hidden' ? 'hidden' : v.format}${v.params && 'tokenPath' in v.params ? `(${v.params.tokenPath})` : v.params && 'token' in v.params ? '(fixed token)' : ''}`) : [];
  return `${p.entity}: intent "${p.intent ?? ''}"${parts.length ? `; ${parts.join(', ')}` : ''}`;
}
export const MIN_PRIOR_ENTITIES = 2;
// Where every prior, from at least MIN_PRIOR_ENTITIES entities, agrees on a leaf's kind and the draft differs, report it. Returns one line per disagreeing leaf.
export function disagreements(key: string, fields: (Field | Group)[], definitions: Record<string, Field> = {}): {path: string; ours: LeafKind; prior: LeafKind; among: number; entities: number}[] {
  let selector: string; try { selector = parseSignature(key).selector.toLowerCase(); } catch { return []; }
  const ours = leafViews(key, fields, definitions); if (!ours) return [];
  const aligned = priorsFor(selector).map(p => ({entity: p.entity, views: leafViews(p.key, p.fields)})).filter((p): p is {entity: string; views: LeafView[]} => !!p.views && p.views.length === ours.length);
  // One entity is one project's choice for its own contract, often an unrelated function that shares the
  // selector; it stays a hint in init and decisions, and only agreement across projects is worth a warning.
  if (new Set(aligned.map(p => p.entity)).size < MIN_PRIOR_ENTITIES) return [];
  const priorViews = aligned.map(p => p.views);
  return ours.flatMap((view, i) => {
    const kinds = new Set(priorViews.map(v => v[i].kind));
    if (kinds.size !== 1) return [];
    const [prior] = [...kinds];
    return prior !== view.kind ? [{path: view.path, ours: view.kind, prior, among: priorViews.length, entities: new Set(aligned.map(p => p.entity)).size}] : [];
  });
}
export type { ParamType };
// Registry descriptors that describe this contract: every function the file describes exists here (so
// registry add-deployment's selector proof would pass), or the file covers at least half of this contract's
// functions (a fork that renamed or added a few). Either way it is the same protocol on another chain, or a
// fork whose file belongs to another owner: a suggestion only, nothing is bound or skipped on it. Selectors
// described by GENERIC_ENTITIES or more entities (ERC-20, ERC-4626, ERC-721, Ownable, multicall) identify an
// interface, not a protocol; they count toward containment but not toward the MIN_SHARED overlap.
export const GENERIC_ENTITIES = 3, MIN_SHARED = 2;
export interface RegistryMatch {file: string; entity: string; shared: string[]; distinctive: number; described: number; contained: boolean}
let descriptorSelectors: Map<string, {entity: string; selectors: Set<string>}> | undefined;
export function registryMatches(selectors: string[]): RegistryMatch[] {
  const bySelector = active;
  if (!descriptorSelectors) {
    descriptorSelectors = new Map();
    for (const [s, list] of Object.entries(bySelector)) for (const p of list) {
      const d = descriptorSelectors.get(p.file) ?? descriptorSelectors.set(p.file, {entity: p.entity, selectors: new Set()}).get(p.file)!;
      d.selectors.add(s);
    }
  }
  const ours = new Set(selectors.map(s => s.toLowerCase()));
  const generic = (s: string) => new Set((bySelector[s] ?? []).map(p => p.entity)).size >= GENERIC_ENTITIES;
  const distinctive = [...ours].filter(s => !generic(s));
  return [...descriptorSelectors].map(([file, d]) => ({file, entity: d.entity, shared: distinctive.filter(s => d.selectors.has(s)), distinctive: distinctive.length, described: d.selectors.size, contained: [...d.selectors].every(s => ours.has(s))}))
    .filter(m => m.shared.length >= MIN_SHARED && (m.contained || m.shared.length * 2 >= m.distinctive))
    .sort((a, b) => Number(b.contained) - Number(a.contained) || b.shared.length - a.shared.length || a.file.localeCompare(b.file)).slice(0, 3);
}

// Registry display formats indexed by selector, read from a registry checkout: the bundled snapshot
// (scripts/snapshot-priors.ts) and init --registry both build it this way. Read-only and offline; a file
// that does not parse, or an include that leaves the checkout, is skipped and counted.
export function buildPriorsIndex(checkout: string): {bySelector: Record<string, Prior[]>; descriptors: number; formatKeys: number; unparsableKeys: number; skippedFiles: number} {
  const root = path.resolve(checkout), registry = path.join(root, 'registry');
  if (!fs.existsSync(registry)) fail('REGISTRY_NOT_FOUND', `No registry/ under ${root}; pass a clone of ethereum/clear-signing-erc7730-registry.`, 2);
  const cache = new Map<string, any>();
  const resolve = (file: string, stack: string[] = []): any => {
    if (!file.startsWith(root + path.sep) || stack.includes(file)) throw Error(`Invalid include ${file}`);
    if (cache.has(file)) return cache.get(file);
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const parent = d.includes ? resolve(path.resolve(path.dirname(file), d.includes), [...stack, file]) : {};
    const result = {...parent, ...d, metadata: {...parent.metadata, ...d.metadata}, display: {definitions: {...parent.display?.definitions, ...d.display?.definitions}, formats: {...parent.display?.formats, ...d.display?.formats}}};
    cache.set(file, result); return result;
  };
  // Inline $ref definitions so a prior is self-contained; the field's own keys win.
  const inline = (fields: any[], definitions: Record<string, any>): any[] => (Array.isArray(fields) ? fields : []).map(f => {
    if (f && typeof f === 'object' && 'fields' in f) return {...f, fields: inline(f.fields, definitions)};
    const ref = typeof f?.$ref === 'string' ? /^\$\.display\.definitions\.(.+)$/.exec(f.$ref)?.[1] : undefined;
    if (!ref) return f;
    const {$ref, ...rest} = f; return {...(definitions[ref] ?? {}), ...rest};
  });
  const bySelector: Record<string, Prior[]> = {};
  let descriptors = 0, formatKeys = 0, unparsableKeys = 0, skippedFiles = 0;
  for (const entity of fs.readdirSync(registry).sort()) {
    const dir = path.join(registry, entity);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.startsWith('calldata-') || !name.endsWith('.json')) continue;
      let d: any; try { d = resolve(path.join(dir, name)); } catch { skippedFiles++; continue; }
      descriptors++;
      for (const [key, spec] of Object.entries<any>(d.display?.formats ?? {})) {
        formatKeys++;
        let selector: string;
        try { selector = FunctionFragment.from(`function ${key}`).selector.toLowerCase(); } catch { unparsableKeys++; continue; }
        (bySelector[selector] ??= []).push({entity, file: `registry/${entity}/${name}`, key, intent: spec?.intent, ...(spec?.interpolatedIntent ? {interpolatedIntent: spec.interpolatedIntent} : {}), fields: inline(spec?.fields, d.display?.definitions ?? {})});
      }
    }
  }
  return {bySelector, descriptors, formatKeys, unparsableKeys, skippedFiles};
}
