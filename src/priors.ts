import { FunctionFragment, ParamType } from 'ethers';
import priors from './data/registry-priors.json' with {type: 'json'};
import { leaves, parseSignature, resolveFields, type Field, type Group, type ResolvedField } from './descriptors.js';

// What other registry descriptors do with the same function selector. Advisory only: it never
// changes a draft, it pre-fills suggestions and warns when a draft disagrees in kind with every prior.
export interface Prior {entity: string; file: string; key: string; intent?: string; interpolatedIntent?: string; fields: any[]}
export const PRIORS_META = {repository: priors.repository, commit: priors.commit, generatedAt: priors.generatedAt, selectors: priors.selectors};
export function priorsFor(selector: string): Prior[] { return ((priors.bySelector as Record<string, Prior[]>)[selector.toLowerCase()] ?? []); }
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
