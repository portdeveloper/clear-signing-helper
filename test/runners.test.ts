import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// The registry runners are external toolchains. These tests stand in stub executables at the
// paths setupRunners expects, so result parsing and failure handling run offline.
const repo=path.resolve(import.meta.dirname,'..');
const cli=path.join(repo,'dist/cli.js');
const vault='src/AssetVault.sol:AssetVault', address='0x0000000000000000000000000000000000000001', receiver='0x0000000000000000000000000000000000000002', asset='0x0000000000000000000000000000000000000003';
function stubRunners(mode:'pass'|'fail') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'csh-runner-stubs-'));
  const s=path.join(dir,'sourcify-dae3cdab/dist'), r=path.join(dir,'rust-10605ba7/target/release');
  fs.mkdirSync(s,{recursive:true});fs.mkdirSync(r,{recursive:true});
  // Both stubs echo the fixture's cases back with the requested status.
  fs.writeFileSync(path.join(s,'cli.js'),`const fs=require('fs');const [file,,out]=process.argv.slice(2);const t=JSON.parse(fs.readFileSync(file,'utf8'));
fs.writeFileSync(out,JSON.stringify({runner:'@ethereum-sourcify/clear-signing-test-runner',implementation:'stub-sourcify@0',cases:t.tests.map(c=>({description:c.description,status:'${mode}',rendered:c.expected,...('${mode}'==='fail'?{message:'stubbed mismatch'}:{})}))}));`);
  fs.writeFileSync(path.join(r,'cs-test'),`#!/bin/sh\n# args: run <file> --registry <root> --output <out>\nnode -e "const fs=require('fs');const t=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));fs.writeFileSync(process.argv[2],JSON.stringify({runner:'cs-test',implementation:'stub-rust@0',cases:t.tests.map(c=>({description:c.description,status:'pass',rendered:c.expected}))}))" "$2" "$6"\n`);
  fs.chmodSync(path.join(r,'cs-test'),0o755);
  return dir;
}
function project() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-runners-'));
  fs.cpSync(path.join(repo,'examples/standard'),root,{recursive:true,filter:src=>!['clear-signing','.clear-signing-cache','clear-signing.toml'].includes(path.basename(src))});
  return root;
}
function run(root:string,args:string[],expected=0,env:Record<string,string>={}) {
  const r=spawnSync(process.execPath,[cli,'--root',root,'--json',...args],{encoding:'utf8',timeout:120_000,env:{...process.env,...env}});
  assert.equal(r.status,expected,`CLI ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}
const read=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f:string,d:unknown)=>fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');

await test('export --registry-runners runs both implementations on the bundle and fails the export when a case fails',t=>{
  const root=project();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  run(root,['init','--contract',vault,'--owner','Example']);
  const created=run(root,['check'],1);void created;
  const dfile=path.join(root,'clear-signing/descriptors',fs.readdirSync(path.join(root,'clear-signing/descriptors'))[0]),d=read(dfile);
  d.context.contract.deployments=[{chainId:1,address}];
  d.display.formats['deposit(uint256 assets,address receiver)'].fields[0]={path:'assets',label:'Amount',format:'tokenAmount',params:{token:asset}};
  for(const k of Object.keys(d.display.formats)) if(!k.startsWith('deposit(')) delete d.display.formats[k];
  write(dfile,d);
  let toml=fs.readFileSync(path.join(root,'clear-signing.toml'),'utf8').replace('exclusions = { }','[contracts.exclusions]\n"emergencyWithdraw(address,uint256)" = "t"\n"transferAdmin(address)" = "t"\n"withdraw(uint256,address,address)" = "t"\n');
  fs.writeFileSync(path.join(root,'clear-signing.toml'),toml);
  run(root,['fixture','--name','deposit','--contract',vault,'--function','deposit(uint256,address)','--args',JSON.stringify(['1000000',receiver]),'--chain-id','1','--to',address]);
  const ff=path.join(root,'clear-signing/fixtures/deposit.json'),f=read(ff);f.tokens={[asset]:{name:'USD Coin',symbol:'USDC',decimals:6}};write(ff,f);
  run(root,['review','--accept']);run(root,['test','--update']);
  const passing=stubRunners('pass');t.after(()=>fs.rmSync(passing,{recursive:true,force:true}));
  const ok=run(root,['export','--out','ok','--no-lint','--registry-runners'],0,{CLEAR_SIGNING_RUNNERS_DIR:passing}).result;
  assert.deepEqual(ok.registryRunners.map((r:any)=>[r.name,r.passed,r.cases]),[['sourcify',true,{pass:1}],['rust',true,{pass:1}]]);
  assert.ok(fs.existsSync(path.join(root,'ok/review/runners/calldata-AssetVault/sourcify.results.json')));
  assert.ok(fs.existsSync(path.join(root,'ok/review/runners/calldata-AssetVault/rust.log')));
  assert.equal(read(path.join(root,'ok/review/validation.json')).registryRunners.length,2);
  const failing=stubRunners('fail');t.after(()=>fs.rmSync(failing,{recursive:true,force:true}));
  const bad=run(root,['export','--out','bad','--no-lint','--registry-runners'],1,{CLEAR_SIGNING_RUNNERS_DIR:failing});
  assert.equal(bad.diagnostics[0].code,'REGISTRY_RUNNER_FAILED');assert.match(bad.diagnostics[0].message,/sourcify runner .*stubbed mismatch/);
  assert.equal(fs.existsSync(path.join(root,'bad')),false,'a failed runner leaves no bundle behind');
  // Without the flag nothing runs and the record says so.
  const plain=run(root,['export','--out','plain','--no-lint']).result;assert.equal(plain.registryRunners,null);assert.equal(read(path.join(root,'plain/review/validation.json')).registryRunners,'not run');
});
