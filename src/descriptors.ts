import { FunctionFragment, ParamType, isAddress } from 'ethers';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../schemas/erc7730-v2.schema.json' with {type: 'json'};
import packageJson from '../package.json' with {type: 'json'};
import { Contract } from './foundry.js';
import { assertKeys, assertTreeBudget, Diagnostic, fail, Failure, hash } from './io.js';

export const SCHEMA_URL = 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json';
export const ENGINE = {tool: packageJson.version, renderer: '@ethereum-sourcify/clear-signing@0.2.2+signed-int-fix.1', schema: hash(schema), subset: 2};
export type Field = {path: string; label: string; format: string; params?: Record<string, any>; separator?: string};
export type Group = {path: string; label?: string; fields: (Field | Group)[]; iteration?: 'sequential'};
export type Descriptor = {$schema: string; context: {contract: {deployments: {chainId: number; address: string}[]}}; metadata: {owner: string; contractName?: string; info?: {url?: string; deploymentDate?: string}}; display: {formats: Record<string, {intent: string; fields: (Field | Group)[]}>}};
export interface Selection {id: string; descriptor: string; exclusions: Record<string, string>}
const ajv = new Ajv2020({allErrors: true, strict: false, validateFormats: true});
(addFormats as any)(ajv);
ajv.addFormat('eip55', {type: 'string', validate: isAddress});
ajv.addFormat('eip155', {type: 'number', validate: (v: number) => Number.isSafeInteger(v) && v > 0});
const schemaValidate = ajv.compile(schema);
const humanize = (name: string) => (name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()));
function namedParam(p: ParamType, i: number): string {
  if (p.baseType === 'array') return `${namedType(p)} ${p.name || `arg${i}`}`;
  if (p.baseType === 'tuple') return `(${p.components!.map(namedParam).join(',')}) ${p.name || `arg${i}`}`;
  return `${p.type} ${p.name || `arg${i}`}`;
}
function namedType(p: ParamType): string {
  if (p.baseType === 'array') return `${namedType(p.arrayChildren!)}[${p.arrayLength === -1 ? '' : p.arrayLength}]`;
  if (p.baseType === 'tuple') return `(${p.components!.map(namedParam).join(',')})`;
  return p.type;
}
export function signature(f: FunctionFragment) { return `${f.name}(${f.inputs.map(namedParam).join(',')})`; }
export function parseSignature(key: string) {
  try { return FunctionFragment.from(`function ${key}`); } catch { fail('INVALID_SIGNATURE', `Invalid function signature: ${key}`); }
}
export function leaves(params: readonly ParamType[], prefix = '', depth = 0): {path: string; type: string}[] {
  if (depth > 32) fail('UNSUPPORTED_TYPE', 'ABI nesting exceeds the supported depth of 32.');
  const expand = (p: ParamType, name: string, level: number): {path: string; type: string}[] => {
    if (level > 32) fail('UNSUPPORTED_TYPE', 'ABI nesting exceeds the supported depth of 32.');
    if (p.baseType === 'array') {
      return expand(p.arrayChildren!, `${name}.[]`, level + 1);
    }
    if (p.baseType === 'tuple') return leaves(p.components!, name + '.', level + 1);
    return [{path: name, type: p.type}];
  };
  return params.flatMap((p, i) => expand(p, prefix + (p.name || `arg${i}`), depth));
}
export function scaffoldFormat(f: FunctionFragment) {
  const parsed = parseSignature(signature(f));
  const field = (p: ParamType, name: string, label: string): (Field | Group)[] => {
    if (p.baseType === 'array') {
      const arrayPath = name ? `${name}.[]` : '[]';
      const child = p.arrayChildren!;
      if (child.baseType === 'tuple') return [{path:arrayPath,label,iteration:'sequential',fields:fields(child.components!)}];
      if (child.baseType === 'array') return [{path:arrayPath,label,iteration:'sequential',fields:field(child,'',label)}];
      return [{path:arrayPath,label,format:'raw',separator:`${label} {index}`}];
    }
    if (p.baseType === 'tuple') return fields(p.components!,name + '.');
    return [{path:name,label,format:'raw'}];
  };
  const fields = (params: readonly ParamType[], prefix = ''): (Field | Group)[] => params.flatMap((p, i) => field(p,prefix+(p.name || `arg${i}`),humanize(p.name || `arg${i}`)));
  leaves(parsed.inputs); // Bound nesting before constructing the descriptor.
  return {intent: humanize(f.name), fields: [...fields(parsed.inputs), ...(f.stateMutability === 'payable' ? [{path:'@.value',label:'Native value (wei)',format:'raw'}] : [])]};
}
export function scaffold(c: Contract, owner: string): Descriptor {
  const formats: Descriptor['display']['formats'] = {};
  for (const f of c.functions) formats[signature(f)] = scaffoldFormat(f);
  return {$schema: SCHEMA_URL, context: {contract: {deployments: []}}, metadata: {owner, contractName: c.name}, display: {formats}};
}
export function reviewQuestions(c: Contract) {
  return c.functions.map(f => ({signature: f.format('sighash'), questions: [
    'Does the action describe the actual operation?',
    'Are every recipient, spender, limit, and other relevant argument visible?',
    'Are raw values intentional? Verify units and token relationships before choosing formatters.'
  ]}));
}
export function validateDescriptor(d: Descriptor, c: Contract, selection: Selection): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const add = (code: string, message: string, sig?: string) => errors.push({code, message, file: selection.descriptor, signature: sig, remedy: 'Edit the descriptor or record an explicit exclusion in clear-signing.toml, then run check.'});
  try { assertTreeBudget(d); } catch (e) { if (e instanceof Failure) { add(e.code, e.message); return errors; } throw e; }
  if (!schemaValidate(d)) {
    for (const error of (schemaValidate.errors ?? []).slice(0, 12)) add('SCHEMA_INVALID', `${error.instancePath || '/'} ${error.message}`);
    return errors;
  }
  try {
    assertKeys(d, ['$schema', 'context', 'metadata', 'display'], 'descriptor');
    if (d.$schema !== SCHEMA_URL) fail('SCHEMA_VERSION', `Use the pinned schema ${SCHEMA_URL}.`);
    assertKeys(d.context, ['contract'], 'context');
    assertKeys(d.context.contract, ['deployments'], 'context.contract');
    if (!Array.isArray(d.context.contract.deployments)) fail('INVALID_BINDING', 'context.contract.deployments must be an array (empty for local drafts).');
    const bindings = new Set<string>();
    for (const dep of d.context.contract.deployments) {
      assertKeys(dep, ['chainId', 'address'], 'deployment');
      if (!Number.isSafeInteger(dep.chainId) || dep.chainId <= 0 || !isAddress(dep.address) || /^0x0{40}$/i.test(dep.address)) fail('INVALID_BINDING', 'Deployments require a positive safe chainId and nonzero address.');
      const key = `${dep.chainId}:${dep.address.toLowerCase()}`;
      if (bindings.has(key)) fail('INVALID_BINDING', `Duplicate deployment ${key}.`);
      bindings.add(key);
    }
    assertKeys(d.metadata, ['owner', 'contractName', 'info'], 'metadata');
    if (!d.metadata.owner?.trim()) fail('MISSING_METADATA', 'metadata.owner must name the project owner.');
    assertKeys(d.display, ['formats'], 'display');
    assertKeys(d.display.formats, Object.keys(d.display.formats ?? {}), 'display.formats');
    const available = new Map(c.functions.map(f => [f.format('sighash'), f]));
    const covered = new Set<string>();
    const selectors = new Map<string, string>();
    for (const f of c.functions) {
      const previous = selectors.get(f.selector);
      if (previous && previous !== f.format('sighash')) add('SELECTOR_COLLISION', `${previous} collides with ${f.format('sighash')}.`);
      selectors.set(f.selector, f.format('sighash'));
    }
    for (const [key, spec] of Object.entries(d.display.formats)) {
      try {
        const f = parseSignature(key), sig = f.format('sighash');
        if (!available.has(sig)) fail('OBSOLETE_FORMAT', `${sig} is not a write function in ${c.id}.`);
        const actual = available.get(sig)!;
        if (f.format('full') !== parseSignature(signature(actual)).format('full')) fail('SIGNATURE_NAMES', `${key} must use the compiler argument names: ${signature(actual)}.`);
        if (covered.has(sig)) fail('DUPLICATE_FORMAT', `More than one format describes ${sig}.`);
        covered.add(sig);
        assertKeys(spec, ['intent', 'fields'], `formats.${key}`);
        if (typeof spec.intent !== 'string' || !spec.intent.trim()) fail('MISSING_INTENT', `${sig} requires a nonempty intent.`);
        if (!Array.isArray(spec.fields)) fail('INVALID_FIELDS', `${sig} requires a fields array.`);
        const leafMap = new Map(leaves(f.inputs).map(x => [x.path, x.type]));
        const seen = new Set<string>();
        const flatten = (items: (Field | Group)[], prefix = '', depth = 0): Field[] => {
          if (depth > 32) fail('UNSUPPORTED_FEATURE', 'Field grouping exceeds the supported depth.');
          return items.flatMap(item => {
            if (!item || typeof item !== 'object') fail('INVALID_FIELDS', 'Fields must be objects.');
            if ('fields' in item) {
              assertKeys(item, ['path','label','fields','iteration'], `group in ${sig}`);
              if (typeof item.path !== 'string' || !item.path || !Array.isArray(item.fields)) fail('INVALID_PATH', 'Groups require a path and fields array.');
              if (item.iteration && item.iteration !== 'sequential') fail('UNSUPPORTED_FEATURE', 'Only sequential group iteration is supported.');
              return flatten(item.fields, prefix + item.path + '.', depth + 1);
            }
            return [{...item, path: item.path?.startsWith('@.') ? item.path : prefix + item.path}];
          });
        };
        for (const field of flatten(spec.fields)) {
          assertKeys(field, ['path', 'label', 'format', 'params', 'separator'], `field in ${sig}`);
          if (typeof field.path !== 'string') fail('INVALID_PATH', 'Every field requires a path.');
          const type = leafMap.get(field.path) ?? ({'@.to': 'address', '@.from': 'address', '@.value': 'uint256'} as Record<string,string>)[field.path];
          if (!type) fail('INVALID_PATH', `${field.path} is not a leaf argument or supported transaction field of ${sig}.`);
          if (seen.has(field.path)) fail('DUPLICATE_FIELD', `${field.path} is displayed more than once.`);
          seen.add(field.path);
          if (typeof field.label !== 'string' || !field.label.trim()) fail('MISSING_LABEL', `${field.path} requires a label.`);
          const params = field.params ?? {};
          const allowedParams: Record<string, string[]> = {raw: [], addressName: ['sources'], tokenAmount: ['token', 'tokenPath'], date: ['encoding']};
          if (!(field.format in allowedParams)) fail('UNSUPPORTED_FORMAT', `${field.format} is outside the v0.1 subset (raw, addressName, tokenAmount, date).`);
          assertKeys(params, allowedParams[field.format], `params for ${field.path}`);
          if (field.format === 'addressName') {
            if (type !== 'address') fail('FORMAT_TYPE', `${field.path} must be an address for addressName.`);
            if (params.sources && JSON.stringify(params.sources) !== '["local"]') fail('UNSUPPORTED_FEATURE', 'addressName only supports sources: ["local"].');
          }
          if (['tokenAmount', 'date'].includes(field.format) && !/^uint\d*$/.test(type)) fail('FORMAT_TYPE', `${field.format} requires an unsigned integer.`);
          if (field.format === 'date' && params.encoding && params.encoding !== 'timestamp') fail('UNSUPPORTED_FEATURE', 'Only timestamp dates are supported.');
          if (field.format === 'tokenAmount') {
            if (!!params.token === !!params.tokenPath) fail('TOKEN_MAPPING', 'tokenAmount requires exactly one of token or tokenPath.');
            if (params.token && !isAddress(params.token)) fail('TOKEN_MAPPING', 'token must be a literal address.');
            if (params.tokenPath && params.tokenPath !== '@.to' && leafMap.get(params.tokenPath) !== 'address') fail('TOKEN_MAPPING', `Invalid tokenPath ${params.tokenPath}.`);
            if (params.tokenPath?.includes('.[]')) fail('UNSUPPORTED_FEATURE', 'Array token references are deferred; use a fixed token address.');
          }
        }
        for (const leaf of leafMap.keys()) if (!seen.has(leaf)) fail('UNDISPLAYED_ARGUMENT', `${sig} omits ${leaf}. v0.1 requires all argument leaves to be visible.`);
        if (actual.stateMutability === 'payable' && !seen.has('@.value')) fail('UNDISPLAYED_NATIVE_VALUE', `${sig} can transfer native currency and must display @.value.`);
      } catch(e) { if (e instanceof Failure) add(e.code, e.message, key); else throw e; }
    }
    const inventory = new Set([...available.keys(), ...c.special]);
    for (const [sig, reason] of Object.entries(selection.exclusions)) {
      if (!inventory.has(sig)) add('STALE_EXCLUSION', `${sig} is no longer in the contract.`, sig);
      if (typeof reason !== 'string' || !reason.trim()) add('EXCLUSION_REASON', `${sig} needs an exclusion reason.`, sig);
      if (covered.has(sig)) add('EXCLUDED_AND_COVERED', `${sig} has both a format and an exclusion.`, sig);
    }
    for (const sig of inventory) if (!covered.has(sig) && !selection.exclusions[sig]) add(c.special.includes(sig) ? 'UNSUPPORTED_ENTRYPOINT' : 'MISSING_COVERAGE', `${sig} needs a descriptor or an explicit exclusion reason.`, sig);
  } catch(e) { if (e instanceof Failure) add(e.code, e.message); else throw e; }
  return errors;
}
