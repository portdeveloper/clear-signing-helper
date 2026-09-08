import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Interface, FunctionFragment } from 'ethers';
import TOML from '@iarna/toml';

const repo=path.resolve(import.meta.dirname,'..');
const cli=path.join(repo,'dist/cli.js');
const vault='src/AssetVault.sol:AssetVault';
const token='src/ClearToken.sol:ClearToken';
const address='0x0000000000000000000000000000000000000001';
const receiver='0x0000000000000000000000000000000000000002';
const asset='0x0000000000000000000000000000000000000003';
function project(example='standard') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clear-signing-test-'));
  fs.cpSync(path.join(repo,'examples',example),root,{recursive:true,filter:src=>!['out','cache','artifacts','forge-cache','clear-signing','.clear-signing-cache','clear-signing.toml'].includes(path.basename(src))});
  return root;
}
function run(root:string,args:string[],expected=0) {
  const r=spawnSync(process.execPath,[cli,'--root',root,'--json',...args],{encoding:'utf8',timeout:30_000});
  assert.equal(r.status,expected,`CLI ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  try{return JSON.parse(r.stdout);}catch{assert.fail(`Invalid JSON: ${r.stdout} ${r.stderr}`);}
}
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file:string,data:unknown)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
function setup() {const root=project();run(root,['init','--contract',vault,'--owner','Example']);return root;}
function descriptor(root:string) {const dir=path.join(root,'clear-signing/descriptors');return path.join(dir,fs.readdirSync(dir)[0]);}
function fixture(root:string) {run(root,['fixture','--name','deposit','--contract',vault,'--function','deposit(uint256,address)','--args',JSON.stringify(['1000000',receiver]),'--chain-id','31337','--to',address,'--local']);return path.join(root,'clear-signing/fixtures/deposit.json');}
const codes=(result:any)=>result.diagnostics.map((d:any)=>d.code);

await test('portability gate catches a real tuple-array export before writing a bundle',t=>{
  const root=project();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const router='src/SwapRouter.sol:SwapRouter';
  run(root,['init','--contract',router]);
  const file=descriptor(root),d=read(file);
  const config=TOML.parse(fs.readFileSync(path.join(root,'clear-signing.toml'),'utf8')) as any;
  let selected='';
  for(const key of Object.keys(d.display.formats)) {
    const f=FunctionFragment.from('function '+key);
    if(f.name==='batchSwap')selected=f.format('sighash');
    else {delete d.display.formats[key];config.contracts[0].exclusions[f.format('sighash')]='Outside this portability integration fixture';}
  }
  d.context.contract.deployments=[{chainId:31337,address}];write(file,d);
  fs.writeFileSync(path.join(root,'clear-signing.toml'),TOML.stringify(config));
  run(root,['fixture','--name','batch','--contract',router,'--function',selected,'--args',JSON.stringify([[[address,receiver,'7','5'],[asset,address,'9','8']],receiver]),'--chain-id','31337','--to',address]);
  run(root,['review','--accept']);run(root,['test','--update']);
  const checked=run(root,['check']).result;
  assert.equal(checked.portability.walletVerification,'not performed');
  assert.ok(checked.portability.findings.some((f:any)=>f.code==='ARRAY_ORDER_PORTABILITY'));
  assert.ok(codes(run(root,['check','--strict-portability'],1)).includes('ARRAY_ORDER_PORTABILITY'));
  assert.ok(codes(run(root,['export','--out','strict-bundle','--strict-portability'],1)).includes('ARRAY_ORDER_PORTABILITY'));
  assert.equal(fs.existsSync(path.join(root,'strict-bundle')),false);
  run(root,['export','--out','draft-bundle']);
  const report=read(path.join(root,'draft-bundle/portability.json'));
  assert.deepEqual(report,checked.portability);
});

await test('real Foundry authoring, rendering, review, and CI regression workflow',async t=>{
  const root=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=descriptor(root), ffile=fixture(root);
  const d=read(file), deposit=d.display.formats['deposit(uint256 assets,address receiver)'];
  deposit.fields[0]={path:'assets',label:'Amount',format:'tokenAmount',params:{token:asset}};
  deposit.fields[1]={path:'receiver',label:'Receiver',format:'addressName',params:{sources:['local']}};
  write(file,d);
  const f=read(ffile);f.tokens={[asset]:{name:'USD Coin',symbol:'USDC',decimals:6}};f.addressNames={[receiver]:'Alice'};write(ffile,f);
  const rendered=run(root,['preview','--fixture','clear-signing/fixtures/deposit.json']).result;
  assert.equal(rendered.fields[0].value,'1 USDC');assert.equal(rendered.fields[1].value,'Alice');assert.equal(rendered.fields[1].rawAddress,receiver);
  assert.ok(codes(run(root,['check'],1)).includes('REVIEW_REQUIRED'));
  run(root,['review','--accept']);run(root,['check']);run(root,['check','--no-build']);
  assert.ok(codes(run(root,['test'],1)).includes('MISSING_EXPECTATION'));
  run(root,['test','--update']);run(root,['test','--no-build']);
  const expectation=path.join(root,'clear-signing/expectations/deposit.json');
  assert.deepEqual(read(expectation),rendered);
  const before=fs.readFileSync(file,'utf8');run(root,['init','--contract',vault]);run(root,['sync']);assert.equal(fs.readFileSync(file,'utf8'),before);
  d.display.formats['deposit(uint256 assets,address receiver)'].fields[0].label='Deposit amount';write(file,d);
  assert.ok(codes(run(root,['test'],1)).includes('SNAPSHOT_MISMATCH'));
  assert.equal(read(expectation).fields[0].label,'Amount','test must not silently update expectations');
  assert.ok(codes(run(root,['check'],1)).includes('REVIEW_REQUIRED'));
  const source=path.join(root,'src/AssetVault.sol');fs.appendFileSync(source,'\n// Same ABI, changed source requires renewed review.\n');
  assert.ok(codes(run(root,['check','--no-build'],2)).includes('STALE_BUILD'));
  assert.ok(codes(run(root,['check'],1)).includes('REVIEW_REQUIRED'));
});

await test('malformed and mismatched transactions cannot pass snapshots',t=>{
  const root=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=fixture(root), original=read(file);
  for(const [name,mutation,code] of [
    ['trailing bytes',{data:original.data+'00'},'NONCANONICAL_CALLDATA'],
    ['short selector',{data:'0x1234'},'INVALID_CALLDATA'],
    ['unknown selector',{data:'0x12345678'+original.data.slice(10)},'UNKNOWN_SELECTOR'],
    ['native value',{value:'1'},'NONPAYABLE_VALUE'],
    ['unsafe number',{chainId:Number.MAX_SAFE_INTEGER+1},'INVALID_FIXTURE'],
    ['missing context',{localBinding:false},'DEPLOYMENT_MISMATCH']
  ] as const) {
    write(file,{...original,...mutation});assert.ok(codes(run(root,['test','--update'],1)).includes(code),name);
  }
  write(file,original);
  const dfile=descriptor(root),d=read(dfile);d.context.contract.deployments=[{chainId:31337,address}];write(dfile,d);
  assert.ok(codes(run(root,['preview','--fixture','clear-signing/fixtures/deposit.json'],1)).includes('LOCAL_BINDING_CONFLICT'));
  write(file,{...original,localBinding:false,chainId:1});assert.ok(codes(run(root,['test'],1)).includes('DEPLOYMENT_MISMATCH'));
});

await test('descriptor validation rejects omitted fields, unknown features, and invalid formatter types',t=>{
  const root=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=descriptor(root), original=read(file);
  for(const [name,mutate,code] of [
    ['omission',(d:any)=>d.display.formats['deposit(uint256 assets,address receiver)'].fields.pop(),'UNDISPLAYED_ARGUMENT'],
    ['wrong path',(d:any)=>d.display.formats['deposit(uint256 assets,address receiver)'].fields[0].path='missing','INVALID_PATH'],
    ['wrong type',(d:any)=>d.display.formats['deposit(uint256 assets,address receiver)'].fields[0].format='addressName','FORMAT_TYPE'],
    ['includes',(d:any)=>d.includes='https://example.invalid/file.json','UNSUPPORTED_FEATURE'],
    ['missing function',(d:any)=>delete d.display.formats['deposit(uint256 assets,address receiver)'],'MISSING_COVERAGE']
  ] as const) {const d=structuredClone(original);mutate(d);write(file,d);assert.ok(codes(run(root,['check'],1)).includes(code),name);}
});

await test('missing token metadata stays visible and cannot be accepted',t=>{
  const root=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fixture(root);
  const file=descriptor(root),d=read(file);d.display.formats['deposit(uint256 assets,address receiver)'].fields[0].format='tokenAmount';d.display.formats['deposit(uint256 assets,address receiver)'].fields[0].params={token:asset};write(file,d);
  const r=run(root,['preview','--fixture','clear-signing/fixtures/deposit.json']).result;
  assert.ok(r.warnings.some((w:any)=>w.code==='UNKNOWN_TOKEN'));assert.ok(r.fields[0].value.includes('1000000'));
  assert.ok(codes(run(root,['test','--update'],1)).includes('UNRESOLVED_RENDERING'));
});

await test('production export is gated and produces valid registry test input',t=>{
  const root=project();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  run(root,['init','--contract',token,'--owner','Example']);
  const file=descriptor(root),d=read(file);
  const cfgPath=path.join(root,'clear-signing.toml'),cfg=TOML.parse(fs.readFileSync(cfgPath,'utf8')) as any;
  for(const key of Object.keys(d.display.formats))if(!key.startsWith('transfer(')) {cfg.contracts[0].exclusions[Interface.from([`function ${key}`]).fragments[0].format('sighash')]='Outside this test fixture scope';delete d.display.formats[key];}
  fs.writeFileSync(cfgPath,TOML.stringify(cfg));write(file,d);
  run(root,['fixture','--name','transfer','--contract',token,'--function','transfer','--args',JSON.stringify([receiver,'1']),'--chain-id','1','--to',address,'--local']);
  run(root,['review','--accept']);run(root,['test','--update']);
  assert.ok(codes(run(root,['export','--out','bundle'],1)).includes('LOCAL_BINDING_EXPORT'));
  d.context.contract.deployments=[{chainId:1,address}];write(file,d);
  const ff=path.join(root,'clear-signing/fixtures/transfer.json'),f=read(ff);delete f.localBinding;write(ff,f);
  run(root,['review','--accept']);run(root,['test','--update']);run(root,['export','--out','bundle']);
  const result=read(path.join(root,'bundle/validation.json'));assert.equal(result.deploymentVerification,'not performed');
  const testdir=path.join(root,'bundle/testsv2');const exported=read(path.join(testdir,fs.readdirSync(testdir)[0]));assert.match(exported.tests[0].rawTx,/^0x02/);assert.equal(exported.tests[0].expected.intent,'Transfer');
  assert.ok(codes(run(root,['export','--out','bundle'],2)).includes('OUTPUT_EXISTS'));
  assert.ok(codes(run(root,['export','--out','../outside'],1)).includes('UNSAFE_PATH'));
});

await test('safe file handling rejects symlink escapes',t=>{
  const root=setup(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'clear-signing-outside-'));t.after(()=>{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});});
  fs.symlinkSync(outside,path.join(root,'escape'));
  assert.ok(codes(run(root,['preview','--fixture','escape/secret.json'],1)).includes('UNSAFE_PATH'));
});

await test('duplicate names and custom profiles are discovered through actual Forge artifacts',t=>{
  for(const example of ['duplicate-contracts','custom-layout']) {
    const root=project(example);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const args=example==='custom-layout'?['--profile','ci']:[];
    const result=run(root,[...args,'init']).result;
    assert.ok(result.contracts.length>=2);
    assert.equal(new Set(result.contracts.map((s:any)=>s.descriptor)).size,result.contracts.length);
    if(example==='duplicate-contracts')assert.deepEqual(result.contracts.map((s:any)=>s.id),['src/alpha/Registry.sol:Registry','src/beta/Registry.sol:Registry']);
  }
});

await test('review survives a clean checkout while source and external dependency changes are detected',t=>{
  const root=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  run(root,['review','--accept']);
  const copied=fs.mkdtempSync(path.join(os.tmpdir(),'clear-signing-clean-'));t.after(()=>fs.rmSync(copied,{recursive:true,force:true}));
  fs.cpSync(root,copied,{recursive:true,filter:src=>!['out','cache','.clear-signing-cache'].includes(path.basename(src))});
  run(copied,['check']);
  const dep=fs.mkdtempSync(path.join(os.tmpdir(),'clear-signing-dependency-'));t.after(()=>fs.rmSync(dep,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dep,'Library.sol'),'pragma solidity 0.8.28; library Library { function value() internal pure returns(uint256) { return 1; } }');
  fs.appendFileSync(path.join(root,'foundry.toml'),`\n[profile.remapped]\nremappings = ["external/=${dep}/"]\n`);
  const source=path.join(root,'src/AssetVault.sol');let text=fs.readFileSync(source,'utf8');text=text.replace('import {AccessManaged}', 'import {Library} from "external/Library.sol";\n\nimport {AccessManaged}');text=text.replace('totalAssets += assets;', 'totalAssets += assets * Library.value();');fs.writeFileSync(source,text);
  run(root,['--profile','remapped','review','--accept']);run(root,['--profile','remapped','check','--no-build']);
  fs.writeFileSync(path.join(dep,'Library.sol'),'pragma solidity 0.8.28; library Library { function value() internal pure returns(uint256) { return 2; } }');
  assert.ok(codes(run(root,['--profile','remapped','check','--no-build'],2)).includes('STALE_BUILD'));
  fs.appendFileSync(path.join(root,'foundry.toml'),`\n[profile.allowed]\nallow_paths = ["${dep}"]\n`);
  fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('external/Library.sol',`${dep}/Library.sol`));
  run(root,['--profile','allowed','review','--accept']);
  run(root,['--profile','allowed','check','--no-build']);
});

await test('explicit engine upgrade preserves descriptors and invalidates prior review',t=>{
  const root=setup();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  run(root,['review','--accept']);const desc=descriptor(root),before=fs.readFileSync(desc,'utf8');
  const cfgfile=path.join(root,'clear-signing.toml'),cfg=TOML.parse(fs.readFileSync(cfgfile,'utf8')) as any;
  cfg.engine='earlier-engine';fs.writeFileSync(cfgfile,TOML.stringify(cfg));
  assert.ok(codes(run(root,['check'],2)).includes('CONFIG_VERSION'));
  run(root,['upgrade']);assert.equal(fs.readFileSync(desc,'utf8'),before);
  assert.ok(codes(run(root,['check'],1)).includes('REVIEW_REQUIRED'));
  run(root,['review','--accept']);run(root,['check']);
});
