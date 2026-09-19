// Read-only offline extractor of registry display formats, indexed by function selector, for use as
// an advisory prior. Clone the registry separately, then pass its path. Output: src/data/registry-priors.json
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {FunctionFragment} from 'ethers';

const root=path.resolve(process.argv[2]??'');
if(!process.argv[2] || !fs.existsSync(path.join(root,'registry'))) throw Error('Usage: npx tsx scripts/snapshot-priors.ts /path/to/registry-checkout');
const commit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const cache=new Map<string,any>();
function resolve(file:string,stack:string[]=[]):any {
  if(!file.startsWith(root+path.sep)||stack.includes(file)) throw Error(`Invalid include ${file}`);
  if(cache.has(file))return cache.get(file);
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  const parent=d.includes?resolve(path.resolve(path.dirname(file),d.includes),[...stack,file]):{};
  const result={...parent,...d,metadata:{...parent.metadata,...d.metadata},display:{definitions:{...parent.display?.definitions,...d.display?.definitions},formats:{...parent.display?.formats,...d.display?.formats}}};
  cache.set(file,result);return result;
}
// Inline $ref definitions so a prior is self-contained; the field's own keys win.
function inline(fields:any[],definitions:Record<string,any>):any[] {
  return (fields??[]).map(f=>{
    if(f&&typeof f==='object'&&'fields' in f) return {...f,fields:inline(f.fields,definitions)};
    const ref=typeof f?.$ref==='string'?/^\$\.display\.definitions\.(.+)$/.exec(f.$ref)?.[1]:undefined;
    if(!ref) return f;
    const {$ref,...rest}=f; return {...(definitions[ref]??{}),...rest};
  });
}
const bySelector:Record<string,any[]>={};let descriptors=0,keys=0,unparsable=0;
for(const entity of fs.readdirSync(path.join(root,'registry')).sort()) {
  const dir=path.join(root,'registry',entity);
  for(const name of fs.readdirSync(dir).sort()) {
    if(!name.startsWith('calldata-')||!name.endsWith('.json'))continue;
    const d=resolve(path.join(dir,name));descriptors++;
    for(const [key,spec] of Object.entries<any>(d.display?.formats??{})) {
      keys++;
      let selector:string;
      try { selector=FunctionFragment.from(`function ${key}`).selector.toLowerCase(); } catch { unparsable++; continue; }
      (bySelector[selector]??=[]).push({entity,file:`registry/${entity}/${name}`,key,intent:spec.intent,...(spec.interpolatedIntent?{interpolatedIntent:spec.interpolatedIntent}:{}),fields:inline(spec.fields,d.display?.definitions??{})});
    }
  }
}
const output={repository:'https://github.com/ethereum/clear-signing-erc7730-registry',commit,generatedAt:new Date().toISOString().slice(0,10),license:'CC0-1.0',scope:'display.formats of every registry calldata descriptor, includes and $ref definitions resolved, indexed by function selector. Advisory prior only.',descriptors,formatKeys:keys,unparsableKeys:unparsable,selectors:Object.keys(bySelector).length,bySelector};
fs.writeFileSync(path.resolve('src/data/registry-priors.json'),JSON.stringify(output)+'\n');
console.log(`Priors ${commit.slice(0,8)}: ${descriptors} descriptors, ${keys} format keys (${unparsable} unparsable), ${Object.keys(bySelector).length} selectors.`);
