import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {FunctionFragment,Interface,Transaction} from 'ethers';
import {scaffold,validateDescriptor,errorsOf} from '../src/descriptors.js';
import {renderFixture,blockingWarnings} from '../src/fixtures.js';
import {init,loadState,createFixture,preview} from '../src/app.js';
import {getContract} from '../src/foundry.js';
import {Failure} from '../src/io.js';
import {corpus,registryContract,sample,rawValues,renderedValues,harness,weiChain} from './registry-helpers.js';

await test('every registry calldata descriptor can generate a basic draft and render every parameter',async()=>{
  let functions=0;
  for(const entry of corpus.descriptors) {
    const c=registryContract(entry),d=scaffold(c,entry.owner),iface=new Interface(c.abi);
    assert.deepEqual(errorsOf(validateDescriptor(d,c,{id:c.id,descriptor:entry.file,exclusions:{}})),[],entry.file);
    assert.equal(Object.keys(d.display.formats).length,entry.signatures.length);
    for(const f of c.functions) {
      const args=f.inputs.map(sample),data=iface.encodeFunctionData(f,args);
      const r=await renderFixture({contract:c.id,chainId:1,to:'0x0000000000000000000000000000000000000001',data,value:'0',localBinding:true},d,c);
      assert.deepEqual(blockingWarnings(r),[],`${entry.file} ${f.format()}`);
      const expected=f.inputs.flatMap((p,i)=>rawValues(p,args[i]));
      assert.deepEqual(renderedValues(r.fields),expected,`${entry.file} ${f.format()}: every leaf must appear in order`);
      functions++;
    }
  }
  assert.equal(corpus.descriptors.length,278);assert.equal(functions,1435);
});

await test('replay all registry transactions without hiding ABI suffixes',async()=>{
  let rendered=0,rejectedSuffix=0;
  for(const entry of corpus.descriptors) {
    // Registry format signatures omit stateMutability. This shape harness uses
    // payable so we can replay the provided value; verified ABIs are tested below.
    const c=registryContract(entry,true),d=scaffold(c,entry.owner),iface=new Interface(c.abi);
    d.context.contract.deployments=entry.deployments;
    for(const example of entry.tests) {
      const tx=Transaction.from(example.rawTx);assert.equal(tx.data,example.data);
      const f=iface.getFunction(tx.data.slice(0,10))!;assert.ok(f,`${entry.file}: selector absent`);
      const args=iface.decodeFunctionData(f,tx.data),encoded=iface.encodeFunctionData(f,args);
      const fixture={contract:c.id,chainId:Number(tx.chainId),to:tx.to!,data:tx.data,value:tx.value.toString(),...(example.from?{from:example.from}:{}),localBinding:!entry.deployments.length,chain:weiChain};
      if(encoded.toLowerCase()!==tx.data.toLowerCase()) {
        assert.ok(tx.data.toLowerCase().startsWith(encoded.toLowerCase()),'known incompatibility must be an appended suffix, not a decoding defect');
        await assert.rejects(()=>renderFixture(fixture,d,c),(e:any)=>e instanceof Failure && e.code==='NONCANONICAL_CALLDATA');
        rejectedSuffix++;continue;
      }
      const r=await renderFixture(fixture,d,c);
      assert.deepEqual(blockingWarnings(r),[],`${entry.file}: ${example.description}`);
      assert.deepEqual(renderedValues(r.fields),[...f.inputs.flatMap((p,i)=>rawValues(p,args[i])),`${tx.value} wei`],`${entry.file}: decoded args and native value must all be visible`);
      rendered++;
    }
  }
  assert.equal(rendered,574);assert.equal(rejectedSuffix,31);
});

await test('Sourcify-verified deployed ABIs generate valid complete basic descriptors',async()=>{
  const entries=JSON.parse(fs.readFileSync(new URL('./fixtures/registry/verified-abis.json',import.meta.url),'utf8'));
  assert.equal(entries.length,4);
  for(const entry of entries) {
    const iface=new Interface(entry.abi),functions=iface.fragments.filter((f):f is FunctionFragment=>f.type==='function'&&!['view','pure'].includes((f as FunctionFragment).stateMutability));
    const c={id:'src/Verified.sol:Verified',name:'Verified',source:'src/Verified.sol',artifact:'',abi:entry.abi,functions,special:[],metadata:{}};
    const d=scaffold(c,'Verified ABI reference');d.context.contract.deployments=[{chainId:entry.chainId,address:entry.address}];
    assert.deepEqual(errorsOf(validateDescriptor(d,c,{id:c.id,descriptor:entry.registryFile,exclusions:{}})),[],entry.registryFile);
    for(const f of functions) {
      const args=f.inputs.map(sample),value=f.stateMutability==='payable'?'1000000000000000':'0';
      const r=await renderFixture({contract:c.id,chainId:entry.chainId,to:entry.address,data:iface.encodeFunctionData(f,args),value,chain:weiChain},d,c);
      assert.deepEqual(blockingWarnings(r),[],`${entry.registryFile} ${f.format()}`);
      assert.deepEqual(renderedValues(r.fields),[...f.inputs.flatMap((p,i)=>rawValues(p,args[i])),...(f.stateMutability==='payable'?[`${value} wei`]:[])]);
    }
  }
});

await test('representative registry ABIs compile through real Forge and the authoring workflow', {timeout:120_000},async t=>{
  const files=[
    'registry/aave/calldata-lpv3.json',
    'registry/uniswap/calldata-UniswapV3Router02.json',
    'registry/morpho/calldata-MorphoBlue.json',
    'registry/morpho/calldata-MorphoBundlerV3.json',
    'registry/safe/calldata-Safe-1.4.1.json',
    'registry/lido/calldata-WithdrawalQueueERC721.json',
    'registry/ekubo/calldata-MEVCaptureRouter.json',
    'registry/flare/calldata-RewardManager-Flare.json',
    'registry/feral-file/calldata-feralfile-vault-0.json',
    'registry/okx/calldata-OkxDexRouterV1.0.8-suffix-compat.json',
    'registry/paraswap/calldata-AugustusSwapper-v5.json',
    'registry/weth/calldata-weth.json'
  ];
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-registry-foundry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'foundry.toml'),'[profile.default]\nsolc_version="0.8.28"\noptimizer=true\nvia_ir=true\n');
  const references=files.map((file,i)=>{
    const entry=corpus.descriptors.find(e=>e.file===file);assert.ok(entry,file);
    const c=registryContract(entry,true),name=`Registry${i}`;fs.writeFileSync(path.join(root,'src',`${name}.sol`),harness(c.functions,name));
    return {entry,functions:c.functions,id:`src/${name}.sol:${name}`};
  });
  init({root});const state=loadState({root,build:false});
  for(const [i,ref] of references.entries()) {
    const c=getContract(state.project,ref.id),d=state.descriptors.get(ref.id)!;
    assert.equal(c.functions.length,ref.functions.length);
    for(const f of ref.functions)assert.ok(c.functions.some(actual=>actual.format('sighash')===f.format('sighash')));
    assert.deepEqual(errorsOf(validateDescriptor(d,c,state.config.contracts.find(s=>s.id===ref.id)!)),[],ref.entry.file);
    // Pick the largest ABI shape to exercise nested tuple/array cases through
    // fixture creation and preview after a genuine Forge compilation.
    const f=[...c.functions].sort((a,b)=>b.format('full').length-a.format('full').length)[0];
    createFixture(state,{name:`registry-${i}`,contract:c.id,function:f.format('sighash'),args:JSON.stringify(f.inputs.map(sample)),chainId:'31337',to:'0x0000000000000000000000000000000000000001',value:'7',local:true,chainName:'Shape harness',nativeCurrency:'wei:0'});
    const r=await preview(state,`clear-signing/fixtures/registry-${i}.json`);
    assert.deepEqual(blockingWarnings(r),[],ref.entry.file);
    assert.deepEqual(renderedValues(r.fields),[...f.inputs.flatMap((p,j)=>rawValues(p,sample(p,j))),'7 wei'],ref.entry.file);
  }
});
