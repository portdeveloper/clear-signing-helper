import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

// ABI mode has no Foundry build. Verified-source fetches are exercised against a local mock of the
// Sourcify v2 API so the suite stays offline; the response shapes mirror sourcify.dev.
const repo=path.resolve(import.meta.dirname,'..');
const cli=path.join(repo,'dist/cli.js');
const tokenAbi=JSON.parse(fs.readFileSync(path.join(repo,'examples/standard/out/ClearToken.sol/ClearToken.json'),'utf8')).abi;
const vaultArtifact=JSON.parse(fs.readFileSync(path.join(repo,'examples/standard/out/AssetVault.sol/AssetVault.json'),'utf8'));
const proxy='0x1111111111111111111111111111111111111111', impl='0x2222222222222222222222222222222222222222', token='0x3333333333333333333333333333333333333333';
function run(root:string,args:string[],expected=0,env:Record<string,string>={}) {
  const r=spawnSync(process.execPath,[cli,'--root',root,'--json',...args],{encoding:'utf8',timeout:60_000,env:{...process.env,...env}});
  assert.equal(r.status,expected,`CLI ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  try{return JSON.parse(r.stdout);}catch{assert.fail(`Invalid JSON: ${r.stdout} ${r.stderr}`);}
}
// The mock server lives in this process, so CLI runs that hit it must not block the event loop.
function runAsync(root:string,args:string[],expected=0,env:Record<string,string>={}):Promise<any> {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,'--root',root,'--json',...args],{env:{...process.env,...env}});
    let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    const timer=setTimeout(()=>{child.kill();reject(new Error(`timeout: ${args.join(' ')}`));},60_000);
    child.on('close',status=>{clearTimeout(timer);try{assert.equal(status,expected,`CLI ${args.join(' ')}\n${out}\n${err}`);resolve(JSON.parse(out));}catch(e){reject(e);}});
  });
}
const read=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f:string,d:unknown)=>fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');

await test('ABI mode: import a local ABI, author, test and export without Foundry',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-abi-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'token.abi.json'),JSON.stringify(tokenAbi));
  const created=run(root,['init','--abi','token.abi.json','--name','ClearToken','--owner','Example']).result;
  assert.equal(created.mode,'abi');assert.equal(created.imports[0].source,'file');
  assert.ok(fs.existsSync(path.join(root,'clear-signing/abi/ClearToken.json')));assert.equal(read(path.join(root,'clear-signing/abi/ClearToken.source.json')).source,'file');
  assert.match(fs.readFileSync(path.join(root,'clear-signing.toml'),'utf8'),/mode = "abi"/);
  const id='clear-signing/abi/ClearToken.json:ClearToken';
  const dfile=path.join(root,created.contracts[0].descriptor),d=read(dfile);
  // ERC-20 conventions apply from the ABI alone.
  assert.equal(d.display.formats['approve(address spender,uint256 amount)'].fields[1].params.tokenPath,'@.to');
  d.context.contract.deployments=[{chainId:1,address:token}];
  for(const key of Object.keys(d.display.formats)) if(!key.startsWith('transfer(')) delete d.display.formats[key];
  write(dfile,d);
  let toml=fs.readFileSync(path.join(root,'clear-signing.toml'),'utf8');
  toml=toml.replace('exclusions = { }','[contracts.exclusions]\n"approve(address,uint256)" = "demo"\n"burn(uint256)" = "demo"\n"mint(address,uint256)" = "demo"\n"transferAdmin(address)" = "demo"\n"transferFrom(address,address,uint256)" = "demo"\n');
  fs.writeFileSync(path.join(root,'clear-signing.toml'),toml);
  run(root,['fixture','--name','send','--contract',id,'--function','transfer(address,uint256)','--args',JSON.stringify([proxy,'2500000']),'--chain-id','1','--to',token]);
  const ff=path.join(root,'clear-signing/fixtures/send.json'),f=read(ff);f.tokens={[token]:{name:'Clear Token',symbol:'CLR',decimals:6}};f.addressNames={[proxy]:'Treasury'};write(ff,f);
  const r=run(root,['preview','--fixture','clear-signing/fixtures/send.json']).result;
  assert.deepEqual(r.fields.map((x:any)=>[x.label,x.value]),[['To','Treasury'],['Amount','2.5 CLR']]);
  run(root,['review','--accept']);run(root,['test','--update']);run(root,['check','--strict-portability']);run(root,['test','--no-build']);
  const exported=run(root,['export','--out','bundle','--no-lint']).result;
  assert.equal(exported.registryPath,'bundle/registry/example');
  assert.ok(fs.existsSync(path.join(root,'bundle/registry/example/testsv2/calldata-ClearToken.tests.json')));
  // ABI edits invalidate review like source edits do.
  const abiFile=path.join(root,'clear-signing/abi/ClearToken.json'),abi=read(abiFile);abi.push({type:'function',name:'extra',inputs:[],outputs:[],stateMutability:'nonpayable'});write(abiFile,abi);
  const codes=run(root,['check'],1).diagnostics.map((x:any)=>x.code);assert.ok(codes.includes('REVIEW_REQUIRED'));assert.ok(codes.includes('MISSING_COVERAGE'));
});

await test('ABI mode: fetch a verified proxy from Sourcify, bind the proxy address, describe the implementation, keep NatSpec',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-abi-fetch-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const server=createServer((req,res)=>{
    const url=new URL(req.url!,'http://x');
    const send=(status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
    if(url.pathname===`/v2/contract/1/${proxy}`) return send(200,{match:'exact_match',chainId:'1',address:proxy,abi:[{type:'fallback',stateMutability:'payable'}],compilation:{name:'ERC1967Proxy'},proxyResolution:{isProxy:true,proxyType:'EIP1967Proxy',implementations:[{address:impl,name:'AssetVault'}]}});
    if(url.pathname===`/v2/contract/1/${impl}`) return send(200,{match:'match',chainId:'1',address:impl,abi:vaultArtifact.abi,compilation:{name:'AssetVault'},userdoc:{methods:{'deposit(uint256,address)':{notice:'Deposit assets for shares.'}}},devdoc:{methods:{'deposit(uint256,address)':{params:{assets:'Amount of the asset',receiver:'Share recipient'}}}},proxyResolution:{isProxy:false,implementations:[]}});
    return send(404,{match:null,chainId:'1',address:url.pathname.split('/').pop()});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const env={CLEAR_SIGNING_SOURCIFY_URL:base,ETHERSCAN_API_KEY:''};
  const missing=await runAsync(root,['init','--address','0x4444444444444444444444444444444444444444','--chain-id','1'],2,env);
  assert.equal(missing.diagnostics[0].code,'SOURCE_UNVERIFIED');
  const created=(await runAsync(root,['init','--address',proxy,'--chain-id','1','--owner','Example'],0,env)).result;
  const imp=created.imports[0];assert.equal(imp.source,'sourcify');assert.equal(imp.proxy.implementation.address,impl);assert.equal(imp.contract,'clear-signing/abi/AssetVault.json:AssetVault');
  const d=read(path.join(root,created.contracts[0].descriptor));
  assert.deepEqual(d.context.contract.deployments,[{chainId:1,address:proxy}],'the user-facing proxy address is bound');
  assert.deepEqual(created.bindings.map((b:any)=>b.source),['clear-signing/abi/AssetVault.source.json']);
  const dep=d.display.formats['deposit(uint256 assets,address receiver)'];
  assert.equal(dep.intent,'Deposit assets for shares');assert.deepEqual(dep.fields.map((f:any)=>f.label),['Amount of the asset','Share recipient']);
  const side=read(path.join(root,'clear-signing/abi/AssetVault.source.json'));assert.equal(side.address,proxy);assert.equal(side.proxy.implementation.address,impl);assert.ok(side.url.startsWith(base));
  // Second import of the same name is refused rather than overwritten.
  assert.equal((await runAsync(root,['init','--address',proxy,'--chain-id','1'],2,env)).diagnostics[0].code,'FILE_EXISTS');
  // Foundry-mode flags are rejected in an ABI project, and ABI flags in a Foundry project.
  assert.equal(run(path.join(repo,'examples/standard'),['init','--abi','x.json'],2).diagnostics[0].code,'MODE_CONFLICT');
});
