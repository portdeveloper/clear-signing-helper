// Read-only offline extractor. Clone the registry separately, then pass its path.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Transaction} from 'ethers';

const root=path.resolve(process.argv[2]??'');
if(!process.argv[2] || !fs.existsSync(path.join(root,'index.calldata.json'))) throw Error('Usage: npx tsx scripts/snapshot-registry.ts /path/to/registry-checkout');
const commit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const cache=new Map<string,any>();
const sources=new Map<string,string>();
function resolve(file:string,stack:string[]=[]):any {
  if(!file.startsWith(root+path.sep)||stack.includes(file)) throw Error(`Invalid include ${file}`);
  if(cache.has(file))return cache.get(file);
  const contents=fs.readFileSync(file,'utf8'),d=JSON.parse(contents);
  sources.set(path.relative(root,file),createHash('sha256').update(contents).digest('hex'));
  const parent=d.includes?resolve(path.resolve(path.dirname(file),d.includes),[...stack,file]):{};
  // Only function declarations and deployment metadata are retained; descriptions
  // and field formatter rules are deliberately not used as generator input.
  const result={...parent,...d,metadata:{...parent.metadata,...d.metadata},display:{formats:{...parent.display?.formats,...d.display?.formats}}};cache.set(file,result);return result;
}
const descriptors:any[]=[];let eip712=0;
for(const entity of fs.readdirSync(path.join(root,'registry')).sort()) {
 const dir=path.join(root,'registry',entity);
 for(const name of fs.readdirSync(dir).sort()) {
  if(name.startsWith('eip712-')&&name.endsWith('.json'))eip712++;
  if(!name.startsWith('calldata-')||!name.endsWith('.json'))continue;
  const file=path.join(dir,name),d=resolve(file);
  const testFile=path.join(dir,'testsv2',name.replace(/\.json$/,'.tests.json'));
  let tests:any[]=[];
  if(fs.existsSync(testFile)) {
    const contents=fs.readFileSync(testFile,'utf8'),testData=JSON.parse(contents);
    sources.set(path.relative(root,testFile),createHash('sha256').update(contents).digest('hex'));
    if(path.resolve(path.dirname(testFile),testData.descriptor)!==file)throw Error(`Test descriptor mismatch: ${testFile}`);
    tests=testData.tests.map((test:any)=>{
      const tx=Transaction.from(test.rawTx);
      return {description:test.description,rawTx:test.rawTx,...(test.txHash?{txHash:test.txHash}:{}),...(test.from?{from:test.from}:{}),chainId:Number(tx.chainId),to:tx.to,data:tx.data,value:tx.value.toString()};
    });
  }
  descriptors.push({file:path.relative(root,file),owner:d.metadata?.owner??entity,signatures:Object.keys(d.display?.formats??{}),deployments:d.context?.contract?.deployments??[],tests});
 }
}
const corpus={repository:'https://github.com/ethereum/clear-signing-erc7730-registry',commit,license:'CC0-1.0',scope:'All top-level registry calldata descriptors; includes resolved offline. EIP-712 counted separately.',eip712Descriptors:eip712,sources:Object.fromEntries([...sources].sort(([a],[b])=>a.localeCompare(b))),descriptors};
const output=path.resolve('test/fixtures/registry/corpus.json');fs.writeFileSync(output,JSON.stringify(corpus,null,2)+'\n');
fs.copyFileSync(path.join(root,'LICENSE.md'),path.resolve('test/fixtures/registry/LICENSE.md'));
console.log(`Snapshot ${commit}: ${descriptors.length} calldata descriptors, ${descriptors.reduce((n,d)=>n+d.signatures.length,0)} function entries, ${descriptors.reduce((n,d)=>n+d.tests.length,0)} transactions; ${eip712} EIP-712 descriptors outside scope.`);
