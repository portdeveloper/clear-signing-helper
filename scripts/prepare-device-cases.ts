// Portable, synthetic registry-shape fixtures for device compatibility probes.
// These bind known registry addresses for rendering only; they are never broadcast.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {FunctionFragment, Interface, Transaction} from 'ethers';
import {scaffold,validateDescriptor} from '../src/descriptors.js';
import {renderFixture,blockingWarnings} from '../src/fixtures.js';
import {registryTests} from '../src/registry.js';
import {corpus,registryContract,sample} from '../test/registry-helpers.js';
const target=path.resolve(process.argv[2]??'/tmp/csh-device-shape-cases');
assert.ok(!fs.existsSync(target),'Choose a fresh output directory');
fs.mkdirSync(target,{recursive:true});
const cases=[
  {name:'feral-nested-arrays',file:'registry/feral-file/calldata-feralfile-vault-0.json',index:0},
  {name:'bundler-tuple-array',file:'registry/morpho/calldata-MorphoBundlerV3.json',index:0},
  {name:'ekubo-signed-integers',file:'registry/ekubo/calldata-MEVCaptureRouter.json',index:0},
  {name:'weth-native-value',file:'registry/weth/calldata-weth.json',index:0},
  {name:'ekubo-positive-control',file:'registry/ekubo/calldata-MEVCaptureRouter.json',index:0},
  {name:'ekubo-negative-short-labels',file:'registry/ekubo/calldata-MEVCaptureRouter.json',index:0},
  {name:'ekubo-positive-short-labels',file:'registry/ekubo/calldata-MEVCaptureRouter.json',index:0},
];
const manifest=[];
for(const spec of cases) {
  const entry=corpus.descriptors.find(e=>e.file===spec.file)!;
  const contract=registryContract(entry);
  let fn=contract.functions[spec.index];
  if(spec.name==='weth-native-value')fn=FunctionFragment.from('function deposit() payable');
  contract.functions=[fn];contract.abi=JSON.parse(new Interface([fn]).formatJson());
  contract.name=spec.name;
  const descriptor=scaffold(contract,entry.owner);
  const deployment=entry.deployments.find(d=>d.chainId===1)!;
  descriptor.context.contract.deployments=[deployment];
  const args=fn.inputs.map(sample);
  if(spec.name.startsWith('ekubo-positive')) {args[2]='3';args[5]='6';}
  if(spec.name.endsWith('short-labels')) {
    for(const format of Object.values(descriptor.display.formats)) for(const field of format.fields) {
      if(!('fields' in field) && field.label==='Calculated Amount Threshold')field.label='Amount limit';
    }
  }
  if(spec.name==='feral-nested-arrays') {
    args[3][4]=['101','202'];
    args[3][5]=[
      [['0x0000000000000000000000000000000000000011','111']],
      [['0x0000000000000000000000000000000000000022','222']],
    ];
  }
  if(spec.name==='bundler-tuple-array') {
    args[0]=[
      ['0x0000000000000000000000000000000000000011','0xabcd','111',false,'0x'+'11'.repeat(32)],
      ['0x0000000000000000000000000000000000000022','0x1234','222',true,'0x'+'22'.repeat(32)],
    ];
  }
  const value=spec.name==='weth-native-value'?'123456789000000000':'0';
  const fixture={contract:contract.id,chainId:deployment.chainId,to:deployment.address,data:new Interface([fn]).encodeFunctionData(fn,args),value};
  assert.deepEqual(validateDescriptor(descriptor,contract,{id:contract.id,descriptor:spec.name,exclusions:{}}),[]);
  const rendering=await renderFixture(fixture,descriptor,contract);
  assert.deepEqual(blockingWarnings(rendering),[]);
  const dir=path.join(target,spec.name);fs.mkdirSync(path.join(dir,'testsv2'),{recursive:true});
  const file=`calldata-${spec.name}.json`;
  const tests=registryTests(file,descriptor,[{name:`synthetic-${spec.name}`,fixture,rendering}]);
  const expected=tests.tests[0].expected;
  const raw=[{description:`synthetic-${spec.name}`,rawTx:tests.tests[0].rawTx,expectedTexts:[expected.intent,expected.owner,...expected.fields.flatMap(f=>[f.label,f.value])]}];
  const write=(name:string,data:unknown)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2)+'\n');
  write(file,descriptor);write(`testsv2/calldata-${spec.name}.tests.json`,tests);write('raw.json',raw);write('expected.json',expected);write('rendering.json',rendering);
  assert.equal(Transaction.from(raw[0].rawTx).data,fixture.data);
  manifest.push({...spec,registryCommit:corpus.commit,descriptor:file,signature:fn.format('sighash'),args,
    value,fieldCount:expected.fields.length,kind:'Synthetic ABI-shape fixture; not executed against protocol',
    mutability:spec.name==='weth-native-value'?'Known deposit() payable':'Registry signatures omit mutability; zero value used'});
}
fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory:target,cases:manifest.map(c=>({name:c.name,fields:c.fieldCount}))},null,2));
