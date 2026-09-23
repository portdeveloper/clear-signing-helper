import { FunctionFragment, ParamType, isAddress } from 'ethers';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../schemas/erc7730-v2.schema.json' with {type: 'json'};
import { Contract } from './foundry.js';
import type { Evidence } from './evidence.js';
import { disagreements, priorsFor, summarizePrior } from './priors.js';
import { assertKeys, assertTreeBudget, Diagnostic, fail, Failure, hash } from './io.js';

export const SCHEMA_URL = 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json';
// The engine is what decides rendering and validation: renderer, schema and the validator subset. The tool
// version is not part of it, so a release that changes none of these keeps configs, reviews and expectations
// valid. Bump subset when validator semantics change.
export const ENGINE = {renderer: '@ethereum-sourcify/clear-signing@0.2.2+signed-int-fix.1', schema: hash(schema), subset: 3};
export type Field = {path?: string; value?: unknown; label?: string; format?: string; params?: Record<string, any>; separator?: string; visible?: unknown; $id?: string; $ref?: string};
export type Group = {path: string; label?: string; fields: (Field | Group)[]; iteration?: 'sequential'; $id?: string};
export type Descriptor = {
  $schema: string;
  context: {contract: {deployments: {chainId: number; address: string}[]; abi?: unknown[]}; $id?: string};
  metadata: {owner: string; contractName?: string; info?: {url?: string; deploymentDate?: string}; token?: {name: string; ticker: string; decimals: number}; constants?: Record<string, unknown>; enums?: Record<string, Record<string, string>>};
  display: {formats: Record<string, {intent?: string; interpolatedIntent?: string; fields: (Field | Group)[]; $id?: string}>; definitions?: Record<string, Field>};
};
// hidden: sighash -> normalized leaf path -> reason. Records a deliberate decision not to display an argument.
export interface Selection {id: string; descriptor: string; exclusions: Record<string, string>; hidden?: Record<string, Record<string, string>>}

// Formats the vendored renderer implements and this tool can exercise offline.
// calldata (nested descriptor resolution) and interoperableAddressName are implemented upstream but not exercised here.
export const SUPPORTED_FORMATS = ['raw', 'amount', 'tokenAmount', 'addressName', 'nftName', 'date', 'duration', 'unit', 'enum', 'tokenTicker', 'chainId'] as const;
const UNSUPPORTED_FORMAT_REASON: Record<string, string> = {
  calldata: 'nested calldata needs descriptor resolution for the callee, which this offline tool does not perform',
  interoperableAddressName: 'not exercised by this tool version'
};
const ADDRESS_FORMATS = new Set(['addressName', 'tokenTicker']);
const INTEGER_FORMATS = new Set(['amount', 'tokenAmount', 'date', 'duration', 'unit', 'nftName', 'chainId']);
const TRANSACTION_FIELDS: Record<string, string> = {'@.to': 'address', '@.from': 'address', '@.value': 'uint256'};
// Parameters whose string values are paths into the arguments (scoped inside groups).
export const PATH_PARAMS = new Set(['tokenPath', 'collectionPath', 'calleePath', 'amountPath', 'chainIdPath', 'nativeCurrencyAddress', 'threshold']);

const ajv = new Ajv2020({allErrors: true, strict: false, validateFormats: true});
(addFormats as any)(ajv);
ajv.addFormat('eip55', {type: 'string', validate: isAddress});
ajv.addFormat('eip155', {type: 'number', validate: (v: number) => Number.isSafeInteger(v) && v > 0});
const schemaValidate = ajv.compile(schema);
const humanize = (name: string) => (name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim().replace(/^./, x => x.toUpperCase()));
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
// {path} placeholders of an interpolated intent; {{ and }} are literal braces.
export function placeholders(template: string): string[] {
  const out: string[] = [];
  for (const m of template.replace(/\{\{|\}\}/g, '').matchAll(/\{([^{}]*)\}/g)) { const k = m[1].trim(); if (k) out.push(k); }
  return out;
}
// Visibility rules the renderer evaluates: hide unless the value is in ifNotIn, or require a mustMatch value.
const isVisibilityRule = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && (Array.isArray((v as any).ifNotIn) || Array.isArray((v as any).mustMatch)) && Object.keys(v as object).every(k => ['ifNotIn', 'mustMatch'].includes(k));
// "#." names the structured root in ERC-7730 paths; the renderer strips it and so do we.
export const stripRoot = (p: string) => p.replace(/^#\./, '');
// Field over definition, key by key, params merged; mirrors the renderer's mergeDefinitions.
export function mergeDefinition(field: Field, definitions: Record<string, Field>): Field {
  if (typeof field.$ref !== 'string') return field;
  const name = /^\$\.display\.definitions\.(.+)$/.exec(field.$ref)?.[1];
  if (!name) fail('UNKNOWN_DEFINITION', `Unsupported display definition reference ${field.$ref}.`);
  const def = definitions[name];
  if (!def) fail('UNKNOWN_DEFINITION', `${field.$ref} is not defined under display.definitions.`);
  const {$ref, ...rest} = field;
  const out: Field = {...rest};
  for (const k of ['path', 'value', 'label', 'format', 'visible', 'separator'] as const) if (out[k] === undefined && def[k] !== undefined) (out as any)[k] = def[k];
  if (def.params || rest.params) out.params = {...(def.params ?? {}), ...(rest.params ?? {})};
  return out;
}
// A concrete index such as path.[0] or path.[-1] addresses the same ABI leaf as path.[].
export const normalizePath = (p: string) => p.replace(/\.\[-?\d+\]/g, '.[]');
// One reading of a display field tree, shared by validation, decisions, priors and the scaffold, so
// they cannot disagree on what a field displays. A group scopes its children's paths and path-valued
// parameters; $ref merges the display definition over the field; "#." roots are stripped; transaction
// fields (@.) are never scoped.
export const joinPath = (prefix: string, p: string) => p.startsWith('@.') ? p : prefix + stripRoot(p);
export function scopeParams(params: Record<string, any> | undefined, prefix: string) {
  if (!params || !prefix) return params;
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, PATH_PARAMS.has(k) && typeof v === 'string' && !v.startsWith('@.') && !v.startsWith('$.') && !isAddress(v) ? joinPath(prefix, v) : v]));
}
// The ABI leaf (or transaction field) a resolved path displays: concrete indices and a trailing byte
// slice such as .[-20:] address the same leaf.
export const leafKey = (p: string) => p.startsWith('@.') ? p : normalizePath(stripRoot(p).replace(/\.\[-?\d*:-?\d*\]$/, ''));
// field: merged with its definition, path and parameters scoped. source: the object as written, for
// callers that edit the tree in place. key: leafKey of the path. hidden: visible "never".
export interface ResolvedField {field: Field; source: Field; key?: string; hidden: boolean}
export function resolveFields(items: (Field | Group)[], definitions: Record<string, Field> = {}, onGroup?: (group: Group) => void, prefix = '', depth = 0): ResolvedField[] {
  if (depth > 32) fail('UNSUPPORTED_FEATURE', 'Field grouping exceeds the supported depth.');
  return items.flatMap(item => {
    if (!item || typeof item !== 'object') fail('INVALID_FIELDS', 'Fields must be objects.');
    if ('fields' in item) {
      onGroup?.(item);
      if (typeof item.path !== 'string' || !item.path || !Array.isArray(item.fields)) fail('INVALID_PATH', 'Groups require a path and fields array.');
      return resolveFields(item.fields, definitions, onGroup, joinPath(prefix, item.path) + '.', depth + 1);
    }
    const merged = mergeDefinition(item, definitions);
    const params = scopeParams(merged.params, prefix);
    const field: Field = {...merged, ...(params ? {params} : {}), ...(typeof merged.path === 'string' ? {path: joinPath(prefix, merged.path)} : {})};
    return [{field, source: item, ...(typeof field.path === 'string' ? {key: leafKey(field.path)} : {}), hidden: field.visible === 'never'}];
  });
}
// The leaves a path covers: itself, or every leaf of the struct or array it names.
export const coveredLeaves = (key: string, leafKeys: Iterable<string>) => [...leafKeys].filter(l => l === key || l.startsWith(key + '.'));
// Where a scaffolded value came from, so reviewers can tell author text and proofs from conventions.
// author: the decisions-file author string ("human", "llm:<model>") for human and llm entries.
export interface Provenance {signature: string; path?: string; source: 'natspec' | 'ast' | 'broadcast' | 'convention' | 'registry' | 'human' | 'llm'; author?: string; detail: string}
const firstSentence = (text: string) => text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '').trim();
// The registry linter warns above 30 characters because Ledger devices truncate longer intents.
export const MAX_INTENT = 30, MAX_LABEL = 32;
// interpolatedIntent lists phrasings in order of preference, the registry's own first; the scaffold takes the
// first that fits MAX_INTENT with the contract's parameter names, or none (see scaffoldFormatWithProvenance).
type Convention = (params: string[]) => {intent: string; interpolatedIntent: string[]; fields: Field[]};
const ERC20_CONVENTIONS: Record<string, Convention> = {
  'approve(address,uint256)': ([spender, amount]) => ({intent: 'Approve', interpolatedIntent: [`Allow {${spender}} to spend {${amount}}`, `Let {${spender}} spend {${amount}}`], fields: [
    {path: spender, label: 'Spender', format: 'addressName', params: {types: ['eoa', 'contract']}},
    {path: amount, label: 'Amount', format: 'tokenAmount', params: {tokenPath: '@.to', threshold: '0x8000000000000000000000000000000000000000000000000000000000000000', message: 'Unlimited'}}]}),
  'transfer(address,uint256)': ([to, amount]) => ({intent: 'Send', interpolatedIntent: [`Send {${amount}} to {${to}}`], fields: [
    {path: to, label: 'To', format: 'addressName', params: {types: ['eoa', 'wallet']}},
    {path: amount, label: 'Amount', format: 'tokenAmount', params: {tokenPath: '@.to'}}]}),
  'transferFrom(address,address,uint256)': ([from, to, amount]) => ({intent: 'Send from', interpolatedIntent: [`Send {${amount}} from {${from}} to {${to}}`, `{${from}} sends {${amount}} to {${to}}`], fields: [
    {path: from, label: 'From', format: 'addressName', params: {types: ['eoa', 'wallet']}},
    {path: to, label: 'To', format: 'addressName', params: {types: ['eoa', 'wallet']}},
    {path: amount, label: 'Amount', format: 'tokenAmount', params: {tokenPath: '@.to'}}]})
};
const WETH_CONVENTIONS: Record<string, Convention> = {
  'deposit()': () => ({intent: 'Wrap', interpolatedIntent: ['Wrap {@.value}'], fields: [{path: '@.value', label: 'Amount', format: 'amount'}]}),
  'withdraw(uint256)': ([amount]) => ({intent: 'Unwrap', interpolatedIntent: [`Unwrap {${amount}}`], fields: [{path: amount, label: 'Amount', format: 'tokenAmount', params: {tokenPath: '@.to'}}]})
};
export function scaffoldFormat(f: FunctionFragment, evidence?: Evidence, enumKeys?: Map<string, string>) {
  return scaffoldFormatWithProvenance(f, evidence, enumKeys).format;
}
export function scaffoldFormatWithProvenance(f: FunctionFragment, evidence?: Evidence, enumKeys = new Map<string, string>()) {
  const sig = f.format('sighash'), provenance: Provenance[] = [];
  const parsed = parseSignature(signature(f));
  const docs = evidence?.paramDocs[sig] ?? {};
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
  const labelFor = (p: ParamType, i: number, prefix: string) => {
    const name = p.name || `arg${i}`;
    const doc = !prefix && docs[name] ? firstSentence(docs[name]) : '';
    if (doc && doc.length <= MAX_LABEL) { provenance.push({signature: sig, path: name, source: 'natspec', detail: `label from @param: ${doc}`}); return doc; }
    if (doc) provenance.push({signature: sig, path: name, source: 'natspec', detail: `@param not used as label (longer than ${MAX_LABEL} characters): ${doc}`});
    return humanize(name);
  };
  const fields = (params: readonly ParamType[], prefix = ''): (Field | Group)[] => params.flatMap((p, i) => field(p,prefix+(p.name || `arg${i}`),labelFor(p, i, prefix)));
  leaves(parsed.inputs); // Bound nesting before constructing the descriptor.
  const paramNames = parsed.inputs.map((p, i) => p.name || `arg${i}`);
  const convention = evidence?.conventions.weth && WETH_CONVENTIONS[sig] ? {kind: 'WETH', make: WETH_CONVENTIONS[sig]} : evidence?.conventions.erc20 && ERC20_CONVENTIONS[sig] ? {kind: 'ERC-20', make: ERC20_CONVENTIONS[sig]} : undefined;
  if (convention) {
    const {interpolatedIntent: phrasings, ...rest} = convention.make(paramNames);
    const interpolatedIntent = phrasings.find(p => p.length <= MAX_INTENT);
    provenance.push({signature: sig, source: 'convention', detail: `${convention.kind} registry convention applied to intent and fields; the contract itself is the token`});
    if (!interpolatedIntent) provenance.push({signature: sig, source: 'convention', detail: `interpolatedIntent not set: every phrasing is longer than ${MAX_INTENT} characters with these parameter names (${phrasings.join('; ')})`});
    return {format: {...rest, ...(interpolatedIntent ? {interpolatedIntent} : {})}, provenance};
  }
  let intent = humanize(f.name);
  const notice = evidence?.notices[sig] ? firstSentence(evidence.notices[sig]) : '';
  if (notice && notice.length <= MAX_INTENT) { intent = notice; provenance.push({signature: sig, source: 'natspec', detail: `intent from @notice: ${notice}`}); }
  else if (notice) provenance.push({signature: sig, source: 'natspec', detail: `@notice not used as intent (longer than ${MAX_INTENT} characters): ${notice}`});
  const built = [...fields(parsed.inputs), ...(f.stateMutability === 'payable' ? [{path:'@.value',label:'Native amount',format:'amount'}] : [])];
  // Enum-typed leaves become enum formats referencing metadata.enums; the key is chosen by the caller.
  const enumsHere = new Map((evidence?.enums[sig] ?? []).map(e => [e.path, e]));
  for (const r of resolveFields(built)) {
    const e = r.key ? enumsHere.get(r.key) : undefined, key = e && enumKeys.get(e.canonicalName);
    if (e && key) { r.source.format = 'enum'; r.source.params = {$ref: `$.metadata.enums.${key}`}; provenance.push({signature: sig, path: r.key, source: 'ast', detail: `enum ${e.canonicalName} with members ${e.members.join(', ')}`}); }
  }
  // Advisory: what other registry descriptors do with this selector. Reported, never applied.
  const priors = priorsFor(f.selector);
  if (priors.length) provenance.push({signature: sig, source: 'registry', detail: `${priors.length} registry format(s) describe this selector; e.g. ${priors.slice(0, 2).map(summarizePrior).join(' | ')}`});
  return {format: {intent, fields: built}, provenance};
}
// Enum keys are the short enum name, qualified with its scope only when two enums share a name.
export function enumKeysFor(evidence: Evidence | undefined) {
  const keys = new Map<string, string>(), byShort = new Map<string, string[]>();
  for (const list of Object.values(evidence?.enums ?? {})) for (const e of list) {
    const short = e.canonicalName.split('.').pop()!;
    const group = byShort.get(short) ?? []; if (!group.includes(e.canonicalName)) group.push(e.canonicalName); byShort.set(short, group);
  }
  for (const [short, names] of byShort) for (const name of names) keys.set(name, names.length === 1 ? short : name.replace(/\./g, '_'));
  return keys;
}
export function enumMetadata(evidence: Evidence | undefined, enumKeys: Map<string, string>) {
  const enums: Record<string, Record<string, string>> = {};
  for (const list of Object.values(evidence?.enums ?? {})) for (const e of list) enums[enumKeys.get(e.canonicalName)!] = Object.fromEntries(e.members.map((m, i) => [String(i), m]));
  return enums;
}
export function scaffold(c: Contract, owner: string, evidence?: Evidence): Descriptor { return scaffoldWithProvenance(c, owner, evidence).descriptor; }
export function scaffoldWithProvenance(c: Contract, owner: string, evidence?: Evidence): {descriptor: Descriptor; provenance: Provenance[]} {
  const formats: Descriptor['display']['formats'] = {}, provenance: Provenance[] = [];
  const enumKeys = enumKeysFor(evidence);
  for (const f of c.functions) { const r = scaffoldFormatWithProvenance(f, evidence, enumKeys); formats[signature(f)] = r.format; provenance.push(...r.provenance); }
  const descriptor: Descriptor = {$schema: SCHEMA_URL, context: {contract: {deployments: []}}, metadata: {owner, contractName: c.name}, display: {formats}};
  const enums = enumMetadata(evidence, enumKeys);
  if (Object.keys(enums).length) descriptor.metadata.enums = enums;
  const constants = Object.entries(evidence?.constants ?? {});
  if (constants.length) {
    descriptor.metadata.constants = Object.fromEntries(constants.map(([k, v]) => [k, v.value]));
    for (const [k, v] of constants) provenance.push({signature: '*', source: 'broadcast', detail: `metadata.constants.${k} = ${v.value} (${v.source}); reference it as $.metadata.constants.${k} in token params`});
  }
  return {descriptor, provenance};
}
export function reviewQuestions(c: Contract) {
  return c.functions.map(f => ({signature: f.format('sighash'), questions: [
    'Does the action describe the actual operation?',
    'Are every recipient, spender, limit, and other relevant argument visible?',
    'Are raw values intentional? Verify units and token relationships before choosing formatters.'
  ]}));
}
export const errorsOf = (list: Diagnostic[]) => list.filter(d => d.severity !== 'warning');
// Warnings in the order check prints them: what the signer sees wrong first, then what registry lint
// reports, then advice. Each code carries its own remedy; a code missing here sorts last.
export const WARNING_REMEDY: Record<string, string> = {
  UNDISPLAYED_ARGUMENT: 'Display the argument, or record a reason under hidden in clear-signing.toml if leaving it out is deliberate.',
  TOKEN_MAPPING: 'Set token or tokenPath so the amount renders with its symbol and decimals.',
  FORMAT_TYPE: 'Use a format that matches the argument type, or raw.',
  INVALID_INTERPOLATION: 'Reference only displayed fields in interpolatedIntent.',
  MISSING_INTENT: 'Add an intent.',
  INTENT_LENGTH: `Shorten it to ${MAX_INTENT} characters or fewer; the registry linter warns above that and Ledger devices truncate.`,
  MISSING_METADATA: 'Set metadata.owner to the project owner.',
  INVALID_BINDING: 'Remove the duplicate deployment.',
  CORPUS_DISAGREEMENT: 'Compare with the registry priors init lists; keep the difference if it is deliberate.'
};
export const WARNING_RANK = Object.keys(WARNING_REMEDY);
export const warningsOf = (list: Diagnostic[]) => list.filter(d => d.severity === 'warning');
// Returns errors and warnings together; callers separate them with errorsOf/warningsOf.
export function validateDescriptor(d: Descriptor, c: Contract, selection: Selection): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const add = (code: string, message: string, sig?: string, severity?: 'warning') => errors.push({code, message, file: selection.descriptor, signature: sig, remedy: severity ? WARNING_REMEDY[code] ?? 'Review it; warnings do not block export.' : 'Edit the descriptor or record an explicit exclusion in clear-signing.toml, then run check.', ...(severity ? {severity} : {})});
  try { assertTreeBudget(d); } catch (e) { if (e instanceof Failure) { add(e.code, e.message); return errors; } throw e; }
  if (!schemaValidate(d)) {
    for (const error of (schemaValidate.errors ?? []).slice(0, 12)) add('SCHEMA_INVALID', `${error.instancePath || '/'} ${error.message}`);
    return errors;
  }
  try {
    assertKeys(d, ['$schema', 'context', 'metadata', 'display'], 'descriptor');
    if (d.$schema !== SCHEMA_URL) fail('SCHEMA_VERSION', `Use the pinned schema ${SCHEMA_URL}.`);
    assertKeys(d.context, ['contract', '$id'], 'context');
    assertKeys(d.context.contract, ['deployments', 'abi'], 'context.contract');
    if (!Array.isArray(d.context.contract.deployments)) fail('INVALID_BINDING', 'context.contract.deployments must be an array (empty for local drafts).');
    if (d.context.contract.abi !== undefined && !Array.isArray(d.context.contract.abi)) fail('INVALID_BINDING', 'context.contract.abi must be an ABI array when present.');
    const bindings = new Set<string>();
    for (const dep of d.context.contract.deployments) {
      assertKeys(dep, ['chainId', 'address'], 'deployment');
      if (!Number.isSafeInteger(dep.chainId) || dep.chainId <= 0 || !isAddress(dep.address) || /^0x0{40}$/i.test(dep.address)) fail('INVALID_BINDING', 'Deployments require a positive safe chainId and nonzero address.');
      const key = `${dep.chainId}:${dep.address.toLowerCase()}`;
      if (bindings.has(key)) add('INVALID_BINDING', `Duplicate deployment ${key}.`, undefined, 'warning');
      bindings.add(key);
    }
    assertKeys(d.metadata, ['owner', 'contractName', 'info', 'token', 'constants', 'enums'], 'metadata');
    if (!d.metadata.owner?.trim()) add('MISSING_METADATA', 'metadata.owner is empty; the registry expects the project owner here.', undefined, 'warning');
    assertKeys(d.display, ['formats', 'definitions'], 'display');
    const definitions: Record<string, Field> = d.display.definitions ?? {};
    assertKeys(d.display.formats, Object.keys(d.display.formats ?? {}), 'display.formats');
    const available = new Map(c.functions.map(f => [f.format('sighash'), f]));
    const covered = new Set<string>();
    const selectors = new Map<string, string>();
    for (const f of c.functions) {
      const previous = selectors.get(f.selector);
      if (previous && previous !== f.format('sighash')) add('SELECTOR_COLLISION', `${previous} collides with ${f.format('sighash')}.`);
      selectors.set(f.selector, f.format('sighash'));
    }
    const hidden = selection.hidden ?? {};
    for (const [key, spec] of Object.entries(d.display.formats)) {
      try {
        const f = parseSignature(key), sig = f.format('sighash');
        if (!available.has(sig)) fail('OBSOLETE_FORMAT', `${sig} is not a write function in ${c.id}.`);
        const actual = available.get(sig)!;
        if (f.format('full') !== parseSignature(signature(actual)).format('full')) fail('SIGNATURE_NAMES', `${key} must use the compiler argument names: ${signature(actual)}.`);
        if (covered.has(sig)) fail('DUPLICATE_FORMAT', `More than one format describes ${sig}.`);
        covered.add(sig);
        assertKeys(spec, ['intent', 'interpolatedIntent', 'fields', '$id'], `formats.${key}`);
        // The registry has merged formats without an intent; the renderer falls back to the function name.
        if (typeof spec.intent !== 'string' || !spec.intent.trim()) add('MISSING_INTENT', `${sig} has no intent; a signer would see the function name.`, key, 'warning');
        if (typeof spec.intent === 'string' && spec.intent.length > MAX_INTENT) add('INTENT_LENGTH', `${sig} intent "${spec.intent}" is ${spec.intent.length} characters; the registry linter warns above ${MAX_INTENT} because Ledger devices truncate it.`, key, 'warning');
        if (spec.fields === undefined) spec.fields = [];
        if (!Array.isArray(spec.fields)) fail('INVALID_FIELDS', `${sig} fields must be an array.`);
        const leafMap = new Map(leaves(f.inputs).map(x => [x.path, x.type]));
        // A trailing byte slice such as .[-20:] or .[0:4] addresses part of a leaf; the renderer slices the bytes.
        const typeOf = (p: string) => leafMap.get(leafKey(p)) ?? TRANSACTION_FIELDS[p];
        // referenced: leaves a displayed field reads through a parameter (the token of a tokenAmount, an NFT
        // collection, a chain id). The registry linter counts them as displayed; so does UNDISPLAYED_ARGUMENT.
        const seen = new Set<string>(), displayedLeaves = new Set<string>(), declaredHidden = new Set<string>(), referenced = new Set<string>();
        const resolved = resolveFields(spec.fields, definitions, group => {
          assertKeys(group, ['path','label','fields','iteration','$id'], `group in ${sig}`);
          if (group.iteration && group.iteration !== 'sequential') fail('UNSUPPORTED_FEATURE', 'Only sequential group iteration is supported.');
        });
        for (const {field, key: leaf} of resolved) {
          assertKeys(field, ['path', 'value', 'label', 'format', 'params', 'separator', 'visible', '$id', '$ref'], `field in ${sig}`);
          if (field.visible !== undefined && !['always', 'never', 'default', 'optional'].includes(String(field.visible)) && !isVisibilityRule(field.visible)) fail('UNSUPPORTED_FEATURE', `visible must be "always", "never", "optional", "default", or a rule object with ifNotIn or mustMatch.`);
          if (typeof field.label !== 'string' || !field.label.trim()) fail('MISSING_LABEL', `${field.path ?? field.value} requires a label.`);
          if (field.value !== undefined) {
            // Constant-value field: shown as-is, or resolved from metadata; it displays no argument.
            if (field.path !== undefined) fail('INVALID_FIELDS', `A field has both path and value in ${sig}.`);
            if (typeof field.value === 'string' && field.value.startsWith('$.metadata.')) { const ref = /^\$\.metadata\.constants\.([A-Za-z0-9_]+)$/.exec(field.value); if (!ref || d.metadata.constants?.[ref[1]] === undefined) fail('TOKEN_MAPPING', `${field.value} is not a defined metadata constant.`); }
            continue;
          }
          if (typeof field.path !== 'string') fail('INVALID_PATH', 'Every field requires a path or a value.');
          if (field.visible === 'never') {
            // Hidden in the descriptor itself. A whole struct or array may be hidden this way.
            const covered = coveredLeaves(leaf!, leafMap.keys());
            if (!covered.length && !TRANSACTION_FIELDS[field.path]) fail('INVALID_PATH', `${field.path} is not an argument of ${sig}.`);
            covered.forEach(l => declaredHidden.add(l));
            continue;
          }
          const type = typeOf(field.path);
          if (!type) fail('INVALID_PATH', `${field.path} is not a leaf argument or supported transaction field of ${sig}.`);
          if (seen.has(field.path)) fail('DUPLICATE_FIELD', `${field.path} is displayed more than once.`);
          seen.add(field.path); displayedLeaves.add(leaf!);
          if (field.format === undefined) fail('UNSUPPORTED_FORMAT', `${field.path} has no format; the pinned renderer needs one (use raw).`);
          const params = field.params ?? {};
          for (const k of ['token', 'tokenPath', 'collection', 'collectionPath', 'chainIdPath']) { const v = params[k]; if (typeof v === 'string' && !v.startsWith('@.') && !v.startsWith('$.') && !isAddress(v)) coveredLeaves(leafKey(v), leafMap.keys()).forEach(l => referenced.add(l)); }
          if (field.format in UNSUPPORTED_FORMAT_REASON) fail('UNSUPPORTED_FORMAT', `${field.format} on ${field.path}: ${UNSUPPORTED_FORMAT_REASON[field.format]}.`);
          if (!(SUPPORTED_FORMATS as readonly string[]).includes(field.format)) fail('UNSUPPORTED_FORMAT', `${field.format} is not a format the pinned renderer implements.`);
          // The renderer reads addresses out of address, bytes and integer values; other mismatches render raw with a warning.
          if (ADDRESS_FORMATS.has(field.format) && !/^(address|bytes\d*|u?int\d*)$/.test(type)) add('FORMAT_TYPE', `${field.format} on ${field.path} (${type}) cannot yield an address; it will render raw with a warning.`, key, 'warning');
          if (INTEGER_FORMATS.has(field.format) && !/^u?int\d*$/.test(type) && !/\.\[-?\d*:-?\d*\]$/.test(field.path)) add('FORMAT_TYPE', `${field.format} on ${field.path} (${type}) expects an integer; it will render raw with a warning.`, key, 'warning');
          if (field.format === 'enum') {
            if (!/^u?int\d*$|^bool$/.test(type) && !/\.\[-?\d*:-?\d*\]$/.test(field.path)) add('FORMAT_TYPE', `enum on ${field.path} (${type}) expects an integer or bool; it will render raw with a warning.`, key, 'warning');
            const ref = /^\$\.metadata\.enums\.([A-Za-z0-9_]+)$/.exec(String(params.$ref ?? ''));
            if (!ref || !d.metadata.enums?.[ref[1]]) fail('ENUM_REFERENCE', `${field.path} enum $ref must name an entry in metadata.enums.`);
          }
          const addressReference = (value: unknown, what: string) => {
            if (typeof value !== 'string') fail('TOKEN_MAPPING', `${what} for ${field.path} must be a string.`);
            if (isAddress(value)) return;
            if (value === '@.to' || value === '@.from') return;
            if (value === '$.metadata.token') { if (!d.metadata.token) fail('TOKEN_MAPPING', `${field.path} references $.metadata.token but metadata.token is absent.`); return; }
            const constant = /^\$\.metadata\.constants\.([A-Za-z0-9_]+)$/.exec(value);
            if (constant) { const v = d.metadata.constants?.[constant[1]]; if (typeof v !== 'string' || !isAddress(v)) fail('TOKEN_MAPPING', `${field.path} references ${value}, which is not an address in metadata.constants.`); return; }
            // Any argument leaf may serve: the renderer reads an address out of address, bytes and integer values, and out of byte slices.
            if (!typeOf(value)) fail('TOKEN_MAPPING', `Invalid ${what} ${value} for ${field.path}: it must be a literal address, @.to, a metadata reference, or a path to an argument such as path.[0].`);
          };
          if (field.format === 'tokenAmount') {
            if (params.token && params.tokenPath) fail('TOKEN_MAPPING', `tokenAmount on ${field.path} sets both token and tokenPath.`);
            // Without a token the renderer shows the raw integer and warns; the registry has merged such fields, so this is a warning here too.
            if (!params.token && !params.tokenPath) add('TOKEN_MAPPING', `tokenAmount on ${field.path} has neither token nor tokenPath; it will render as a raw integer with a warning.`, key, 'warning');
            else addressReference(params.token ?? params.tokenPath, params.token ? 'token' : 'tokenPath');
            if (params.nativeCurrencyAddress !== undefined) for (const v of Array.isArray(params.nativeCurrencyAddress) ? params.nativeCurrencyAddress : [params.nativeCurrencyAddress]) addressReference(v, 'nativeCurrencyAddress');
          }
          if (field.format === 'nftName') {
            if (!!params.collection === !!params.collectionPath) fail('TOKEN_MAPPING', `nftName on ${field.path} requires exactly one of collection or collectionPath.`);
            addressReference(params.collection ?? params.collectionPath, params.collection ? 'collection' : 'collectionPath');
          }
        }
        const hiddenHere = hidden[sig] ?? {};
        for (const [leaf, reason] of Object.entries(hiddenHere)) {
          if (!leafMap.has(leaf)) add('STALE_HIDDEN', `${sig} hidden path ${leaf} is not an argument of the function.`, key);
          else if (displayedLeaves.has(leaf)) add('HIDDEN_AND_DISPLAYED', `${sig} displays ${leaf} but also lists it under hidden.`, key);
          if (typeof reason !== 'string' || !reason.trim()) add('HIDDEN_REASON', `${sig} hidden path ${leaf} needs a reason.`, key);
        }
        for (const leaf of leafMap.keys()) if (!displayedLeaves.has(leaf) && !referenced.has(leaf) && !hiddenHere[leaf] && !declaredHidden.has(leaf)) add('UNDISPLAYED_ARGUMENT', `${sig} does not display ${leaf}. Signers will not see this argument.`, key, 'warning');
        if (spec.interpolatedIntent !== undefined) {
          if (typeof spec.interpolatedIntent !== 'string' || !spec.interpolatedIntent.trim()) fail('INVALID_INTERPOLATION', `${sig} interpolatedIntent must be a nonempty string.`);
          // The registry linter applies its 30-character rule to the template text as well.
          if (spec.interpolatedIntent.length > MAX_INTENT) add('INTENT_LENGTH', `${sig} interpolatedIntent "${spec.interpolatedIntent}" is ${spec.interpolatedIntent.length} characters; the registry linter warns above ${MAX_INTENT}.`, key, 'warning');
          // Every {placeholder} must name a displayed field, else the renderer falls back and warns.
          for (const ph of placeholders(spec.interpolatedIntent)) {
            const target = stripRoot(ph);
            if (!seen.has(target) && !seen.has(normalizePath(target)) && !TRANSACTION_FIELDS[target]) add('INVALID_INTERPOLATION', `${sig} interpolatedIntent references {${ph}}, which is not a displayed field; the renderer will fall back to the plain intent.`, key, 'warning');
          }
        }
        for (const dis of disagreements(key, spec.fields, definitions)) add('CORPUS_DISAGREEMENT', `${sig} shows ${dis.path} as ${dis.ours}, but all ${dis.among} registry format(s) for this selector, from ${dis.entities} entities, have it ${dis.prior}. See the priors listed by init, or accept the difference.`, key, 'warning');
        if (actual.stateMutability === 'payable' && !seen.has('@.value')) fail('UNDISPLAYED_NATIVE_VALUE', `${sig} can transfer native currency and must display @.value.`);
      } catch(e) { if (e instanceof Failure) add(e.code, e.message, key); else throw e; }
    }
    for (const sig of Object.keys(hidden)) if (!available.has(sig)) add('STALE_HIDDEN', `hidden entry ${sig} is not a write function in ${c.id}.`, sig);
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
