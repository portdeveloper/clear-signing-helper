import type { FunctionFragment, ParamType } from 'ethers';
import type { Field, Group } from './descriptors.js';
import { fail } from './io.js';

// The upstream renderer only iterates one array level. Lower standard nested
// groups into concrete indexed paths for this transaction, keeping every leaf
// and index visible. The portable descriptor on disk remains unchanged.
export function expandNestedFields(fields: (Field | Group)[], fn: FunctionFragment, args: readonly unknown[]): (Field | Group)[] {
  const needsExpansion = (items: (Field | Group)[], grouped = false): boolean => items.some(item =>
    'fields' in item ? grouped || needsExpansion(item.fields, true) : (typeof item.path === 'string' ? (item.path.match(/\[\]/g)?.length ?? 0) : 0) > (grouped ? 0 : 1));
  if (!needsExpansion(fields)) return fields;
  const arrays = new Map<string, number>();
  let nodes = 0;
  const visit = (p: ParamType, value: any, name: string, depth: number) => {
    if (++nodes > 8192 || depth > 32) fail('RENDER_LIMIT', 'Nested transaction exceeds 8,192 nodes or 32 levels.');
    if (p.baseType === 'array') {
      arrays.set(name, value.length);
      for (let i = 0; i < value.length; i++) visit(p.arrayChildren!, value[i], `${name}.[${i}]`, depth + 1);
    } else if (p.baseType === 'tuple') p.components!.forEach((c, i) => visit(c, value[i], `${name}.${c.name || `arg${i}`}`, depth + 1));
  };
  fn.inputs.forEach((p, i) => visit(p, args[i], p.name || `arg${i}`, 0));
  const contexts = (fullPath: string): {path: string; empty?: boolean}[] => {
    const marker = fullPath.indexOf('.[]');
    if (marker === -1) return [{path:fullPath}];
    const base = fullPath.slice(0, marker), rest = fullPath.slice(marker + 3);
    const length = arrays.get(base);
    if (length === undefined) fail('INVALID_PATH', `Cannot iterate array at ${base}.`);
    if (length === 0) return [{path:`${base}.[]`,empty:true}];
    return Array.from({length}, (_, i) => contexts(`${base}.[${i}]${rest}`)).flat();
  };
  // Map each wildcard prefix of the field path to the concrete index chosen for this element,
  // so parameters such as tokenPath "swaps.[].token" follow the same element as the field.
  const indexSubstitutions = (wild: string, concrete: string): [string, string][] => {
    const subs: [string, string][] = [];
    let w = 0, c = 0, pw = '', pc = '';
    while (w < wild.length) {
      if (wild.startsWith('.[]', w)) {
        const m = /^\.\[\d+\]/.exec(concrete.slice(c));
        if (!m) break;
        subs.push([pw + '.[]', pc + m[0]]); pw += '.[]'; pc += m[0]; w += 3; c += m[0].length;
      } else { pw += wild[w]; pc += concrete[c]; w++; c++; }
    }
    return subs.sort((a, b) => b[0].length - a[0].length);
  };
  const substituteParams = (params: Record<string, any> | undefined, subs: [string, string][]) => {
    if (!params || !subs.length) return params;
    const rewrite = (v: unknown): unknown => {
      if (typeof v === 'string') { for (const [from, to] of subs) if (v.startsWith(from)) return to + v.slice(from.length); return v; }
      return Array.isArray(v) ? v.map(rewrite) : v;
    };
    return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, rewrite(v)]));
  };
  // prefix is the concrete path chosen so far; wild is the same prefix as written in the descriptor.
  const lower = (items: (Field | Group)[], prefix = '', wild = ''): (Field | Group)[] => items.flatMap(item => {
    const fullPath = item.path.startsWith('@.') ? item.path : prefix + item.path;
    const wildPath = item.path.startsWith('@.') ? item.path : wild + item.path;
    return contexts(fullPath).flatMap(context => {
      if (context.empty) return [{path:context.path,label:`${context.path}: empty`,fields:[]} as Group];
      if ('fields' in item) return lower(item.fields, context.path + '.', wildPath + '.');
      const params = substituteParams((item as Field).params, indexSubstitutions(wildPath, context.path));
      return [{...item,path:context.path, ...(params ? {params} : {}), ...(context.path.includes('.[') ? {separator:context.path} : {})} as Field];
    });
  });
  const result = lower(fields);
  if (result.length > 4096) fail('RENDER_LIMIT', 'Expanded signing output exceeds 4,096 fields.');
  return result;
}
