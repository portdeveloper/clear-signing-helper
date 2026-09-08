// Reproduce the local release-gate exercise against an actual Morpho checkout.
// This never broadcasts transactions or publishes a registry submission.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {FunctionFragment, Interface, Transaction} from 'ethers';
import {corpus, sample} from '../test/registry-helpers.js';

const checkout=process.argv[2];
if(!checkout)throw Error('Usage: npx tsx scripts/prepare-morpho-submission.ts /path/to/fresh/morpho-blue');
const project=fs.realpathSync(checkout);
const helper=fileURLToPath(new URL('../dist/cli.js',import.meta.url));
const protocolCommit='c3f327e49ddae623e2e3162f8468d58fbb79d1b8';
const git=(...args:string[])=>execFileSync('git',['-C',project,...args],{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),protocolCommit,'Use the recorded protocol commit');
assert.equal(git('diff','--stat'),'','Tracked protocol files must be unchanged');
assert.equal(fs.existsSync(path.join(project,'clear-signing.toml')),false,'Use a fresh authoring checkout');
const run=(build:boolean,...args:string[])=>{
  const result=execFileSync(process.execPath,[helper,'--root',project,'--json',...(build?[]:['--no-build']),...args],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:660_000});
  return JSON.parse(result).result;
};
const read=(file:string)=>JSON.parse(fs.readFileSync(path.join(project,file),'utf8'));
const write=(file:string,data:unknown)=>fs.writeFileSync(path.join(project,file),JSON.stringify(data,null,2)+'\n');
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contract='src/Morpho.sol:Morpho';
run(true,'init','--contract',contract,'--owner','Morpho');
const artifact=read('out/Morpho.sol/Morpho.json');
const abi=new Interface(artifact.abi);
const references=JSON.parse(fs.readFileSync(new URL('../test/fixtures/registry/verified-abis.json',import.meta.url),'utf8'));
const reference=references.find((e:any)=>e.registryFile==='registry/morpho/calldata-MorphoBlue.json');
const functions=(i:Interface)=>i.fragments.filter((f):f is FunctionFragment=>f.type==='function');
assert.deepEqual(functions(abi).map(f=>f.format('full')).sort(),functions(new Interface(reference.abi)).map(f=>f.format('full')).sort(),'Compiled function names, types, mutability and outputs must match the recorded Sourcify ABI');
const descriptorName=fs.readdirSync(path.join(project,'clear-signing/descriptors'))[0];
const descriptorPath=`clear-signing/descriptors/${descriptorName}`;
const descriptor=read(descriptorPath);
descriptor.context.contract.deployments=[{chainId:reference.chainId,address:reference.address}];
write(descriptorPath,descriptor);

const evidence:any[]=[];
for(const f of functions(abi).filter(f=>!['view','pure'].includes(f.stateMutability))) {
  const name=`synthetic-${f.name}-${f.selector.slice(2)}`;
  run(false,'fixture','--name',name,'--contract',contract,'--function',f.format('sighash'),'--args',JSON.stringify(f.inputs.map(sample)),
    '--chain-id',String(reference.chainId),'--to',reference.address);
  evidence.push({fixture:`${name}.json`,kind:'synthetic ABI coverage; not executed on chain',signature:f.format('sighash')});
}
const entry=corpus.descriptors.find(e=>e.file===reference.registryFile)!;
for(const [index,example] of entry.tests.entries()) {
  const tx=Transaction.from(example.rawTx);
  assert.equal(tx.to?.toLowerCase(),reference.address.toLowerCase());
  assert.equal(Number(tx.chainId),reference.chainId);
  const name=`registry-${index+1}`;
  write(`clear-signing/fixtures/${name}.json`,{contract,chainId:Number(tx.chainId),to:tx.to,data:tx.data,value:tx.value.toString(),...(example.from?{from:example.from}:{})});
  evidence.push({fixture:`${name}.json`,kind:'transaction example from pinned registry',description:example.description,txHash:example.txHash??null,originalRawTx:example.rawTx});
}
// Save the actual output for inspection before recording this internal raw-draft
// review. This is authoring acknowledgement, not protocol maintainer approval.
for(const fixture of evidence) {
  const preview=run(false,'preview','--fixture',`clear-signing/fixtures/${fixture.fixture}`);
  assert.deepEqual(preview.warnings,[]);
}
run(false,'review','--accept');
const tests=run(false,'test','--update');
run(false,'check');run(false,'test');
run(false,'export','--out','submission-bundle');
const manifest={
  protocol:{repository:'https://github.com/morpho-org/morpho-blue',commit:protocolCommit,contract,submodules:git('submodule','status','--recursive')},
  registry:{repository:'https://github.com/ethereum/clear-signing-erc7730-registry',commit:corpus.commit,descriptor:entry.file},
  deployment:{chainId:reference.chainId,address:reference.address,abiSource:reference.source,match:reference.match,
    compiledFunctionAbiMatches:true,compiledAbiSha256:sha(artifact.abi),deployedCodeVerifiedByHelper:false},
  descriptor:descriptorName,writeFunctions:Object.keys(descriptor.display.formats).length,fixtures:evidence,localTests:tests,
  review:'Internal generated raw-draft review only; no protocol maintainer approval',publication:'not submitted'
};
write('submission-bundle/provenance.json',manifest);
console.log(JSON.stringify({bundle:path.join(project,'submission-bundle'),writeFunctions:manifest.writeFunctions,registryExamples:entry.tests.length,syntheticExamples:evidence.length-entry.tests.length},null,2));
