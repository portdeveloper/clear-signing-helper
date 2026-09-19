import { FunctionFragment, ParamType } from 'ethers';
import priors from './data/registry-priors.json' with {type: 'json'};
import { leaves, parseSignature, normalizePath, type Field, type Group } from './descriptors.js';

// What other registry descriptors do with the same function selector. Advisory only: it never
// changes a draft, it pre-fills suggestions and warns when a draft disagrees in kind with every prior.
export interface Prior {entity: string; file: string; key: string; intent?: string; interpolatedIntent?: string; fields: any[]}
export const PRIORS_META = {repository: priors.repository, commit: priors.commit, generatedAt: priors.generatedAt, selectors: priors.selectors};
export function priorsFor(selector: string): Prior[] { return ((priors.bySelector as Record<string, Prior[]>)[selector.toLowerCase()] ?? []); }
// hidden: the leaf is not displayed. raw: shown without formatting. typed: shown with a semantic format.
export type LeafKind = 'hidden' | 'raw' | 'typed';
export interface LeafView {path: string; kind: LeafKind; format?: string; params?: Record<string, unknown>}
// Leaves in ABI order, so two descriptors of the same selector align by index even when their parameter names differ.
export function leafViews(key: string, fields: (Field | Group)[]): LeafView[] | undefined {
  let fn: FunctionFragment;
  try { fn = parseSignature(key); } catch { return undefined; }
  const shown = new Map<string, Field>();
  const walk = (items: any[], prefix = '') => { for (const item of items ?? []) {
    if (!item || typeof item !== 'object') continue;
    if ('fields' in item) { walk(item.fields, typeof item.path === 'string' ? prefix + item.path + '.' : prefix); continue; }
    if (typeof item.path !== 'string' || item.path.startsWith('@.')) continue;
    if (item.visible === 'never') continue;
    shown.set(normalizePath(prefix + item.path).replace(/^#\./, ''), item);
  } };
  walk(fields);
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
// Where every prior agrees on a leaf's kind and the draft differs, report it. Returns one line per disagreeing leaf.
export function disagreements(key: string, fields: (Field | Group)[]): {path: string; ours: LeafKind; prior: LeafKind; among: number}[] {
  let selector: string; try { selector = parseSignature(key).selector.toLowerCase(); } catch { return []; }
  const ours = leafViews(key, fields); if (!ours) return [];
  const priorViews = priorsFor(selector).map(p => leafViews(p.key, p.fields)).filter((v): v is LeafView[] => !!v && v.length === ours.length);
  if (!priorViews.length) return [];
  return ours.flatMap((view, i) => {
    const kinds = new Set(priorViews.map(v => v[i].kind));
    if (kinds.size !== 1) return [];
    const [prior] = [...kinds];
    return prior !== view.kind ? [{path: view.path, ours: view.kind, prior, among: priorViews.length}] : [];
  });
}
export type { ParamType };
