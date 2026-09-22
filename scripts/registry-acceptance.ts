// Acceptance metric: does the validator accept what the registry has merged? Usage: npx tsx scripts/registry-acceptance.ts <registry-clone>
import fs from 'node:fs'; import path from 'node:path';
import { FunctionFragment, Interface } from 'ethers';
import { validateDescriptor, errorsOf, warningsOf } from '../src/descriptors.js';
const root = process.argv[2];
const cache = new Map<string, any>();
function resolve(file: string): any {
  if (cache.has(file)) return cache.get(file);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const parent = d.includes ? resolve(path.resolve(path.dirname(file), d.includes)) : {};
  const definitions = {...parent.display?.definitions, ...d.display?.definitions};
  const formats = {...parent.display?.formats, ...d.display?.formats};
  const r = {...parent, ...d, metadata: {...parent.metadata, ...d.metadata}, context: {...parent.context, ...d.context}, display: {formats, ...(Object.keys(definitions).length ? {definitions} : {})}}; delete r.includes; cache.set(file, r); return r;
}
const errCodes = new Map<string, number>(), warnCodes = new Map<string, number>(), detail = new Map<string, number>(), perKeyExamples = new Map<string, string[]>(); let files = 0, clean = 0; const examples = new Map<string, string>();
for (const entity of fs.readdirSync(path.join(root, 'registry'))) for (const name of fs.readdirSync(path.join(root, 'registry', entity))) {
  if (!name.startsWith('calldata-') || !name.endsWith('.json')) continue;
  const d = resolve(path.join(root, 'registry', entity, name)); files++;
  const fns: FunctionFragment[] = []; for (const k of Object.keys(d.display.formats)) { try { fns.push(FunctionFragment.from(`function ${k}`)); } catch {} }
  const c = {id: `${entity}/${name}`, name, source: name, artifact: '', abi: JSON.parse(new Interface(fns).formatJson()), functions: fns, special: [], metadata: {}};
  d.$schema = 'https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json';
  const diags = validateDescriptor(d, c, {id: c.id, descriptor: name, exclusions: {}});
  const errs = errorsOf(diags); if (!errs.length) clean++;
  for (const e of errs) { errCodes.set(e.code, (errCodes.get(e.code) ?? 0) + 1); if (!examples.has(e.code)) examples.set(e.code, `${entity}/${name}: ${e.message.slice(0, 160)}`); 
    const key = e.code === 'UNSUPPORTED_FEATURE' ? 'UF ' + e.message.replace(/^(.*?)\.([^. ]+) is not supported.*$/, '$1.$2').replace(/formats\.[^.]*\([^)]*\)/, 'formats.<fn>').replace(/field in [^.]*\(.*?\)\./,'field.').replace(/group in [^.]*\(.*?\)\./,'group.') : e.code === 'SCHEMA_INVALID' ? 'SI ' + e.message.replace(/\/display\/formats\/[^/]+/, '/display/formats/<fn>').replace(/\/fields\/\d+/g, '/fields/N') : e.code === 'INVALID_PATH' ? 'IP ' + (/^(\S+) is not a leaf/.exec(e.message)?.[1] ?? e.message) : e.code === 'TOKEN_MAPPING' || e.code === 'FORMAT_TYPE' || e.code === 'INVALID_INTERPOLATION' ? e.code + ' ' + e.message.replace(/^\S+\(.*?\) /, '').replace(/0x[0-9a-fA-F]{40}/g, '<addr>').replace(/[#.\w\[\]-]+ (requires|must|for|references|is)/, '<path> $1').slice(0, 110) : null;
    if (key) { detail.set(key, (detail.get(key) ?? 0) + 1); const ex = perKeyExamples.get(key) ?? []; if (ex.length < 2) { ex.push(`${entity}/${name} :: ${e.signature ?? ''} :: ${e.message.slice(0, 200)}`); perKeyExamples.set(key, ex); } } }
  for (const w of warningsOf(diags)) warnCodes.set(w.code, (warnCodes.get(w.code) ?? 0) + 1);
}
console.log(`descriptors: ${files}, accepted without errors: ${clean}`);
console.log('error codes:', Object.fromEntries([...errCodes].sort((a, b) => b[1] - a[1])));
console.log('warning codes:', Object.fromEntries([...warnCodes].sort((a, b) => b[1] - a[1])));
for (const [code, ex] of examples) console.log(`  ${code} e.g. ${ex}`);
console.log('--- detail'); for (const [k, n] of [...detail].sort((a, b) => b[1] - a[1]).slice(0, 40)) { console.log(`  ${n}\t${k.slice(0, 150)}`); if (process.env.EXAMPLES) for (const ex of perKeyExamples.get(k) ?? []) console.log(`      ${ex}`); }
