import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { Interface, AbiCoder } from 'ethers';

// discover nominates real transactions (HyperSync with ENVIO_API_TOKEN, else an RPC block scan) and turns each
// into a fixture through the --tx path. HyperSync and the RPC are mocked over loopback so the suite stays offline.
const repo=path.resolve(import.meta.dirname,'..');
const cli=path.join(repo,'dist/cli.js');
const tokenAbi=JSON.parse(fs.readFileSync(path.join(repo,'examples/standard/out/ClearToken.sol/ClearToken.json'),'utf8')).abi;
const token='0x3333333333333333333333333333333333333333', other='0x4444444444444444444444444444444444444444', sender='0x5555555555555555555555555555555555555555';
const envioToken='11111111-2222-3333-4444-555555555555';
const read=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f:string,d:unknown)=>fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');
function run(root:string,args:string[],expected=0) {
  const r=spawnSync(process.execPath,[cli,'--root',root,'--json',...args],{encoding:'utf8',timeout:60_000});
  assert.equal(r.status,expected,`CLI ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}
function runAsync(root:string,args:string[],expected=0,env:Record<string,string|undefined>={}):Promise<any> {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,'--root',root,'--json',...args],{env:{...process.env,ENVIO_API_TOKEN:undefined,...env} as NodeJS.ProcessEnv});
    let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    const timer=setTimeout(()=>{child.kill();reject(new Error(`timeout: ${args.join(' ')}`));},60_000);
    child.on('close',status=>{clearTimeout(timer);try{assert.equal(status,expected,`CLI ${args.join(' ')}\n${out}\n${err}`);resolve(JSON.parse(out));}catch(e){reject(e);}});
  });
}
const iface=new Interface(tokenAbi);
const transfer=iface.encodeFunctionData('transfer',[other,2500000n]);
const h=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
// The chain: h(1) a good transfer (block 900), h(2) a newer transfer with a trailing byte (non-canonical),
// h(3) a reverted transfer, h(4) a transfer to another contract.
const txs:Record<string,{to:string;input:string;block:number;status:string}>={
  [h(1)]:{to:token,input:transfer,block:900,status:'0x1'}, [h(2)]:{to:token,input:transfer+'00',block:950,status:'0x1'},
  [h(3)]:{to:token,input:transfer,block:960,status:'0x0'}, [h(4)]:{to:other,input:transfer,block:970,status:'0x1'}};

function project() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-discover-'));
  fs.writeFileSync(path.join(root,'token.abi.json'),JSON.stringify(tokenAbi));
  const created=run(root,['init','--abi','token.abi.json','--name','ClearToken','--owner','Example']).result;
  const dfile=path.join(root,created.contracts[0].descriptor), d=read(dfile);
  d.context.contract.deployments=[{chainId:10143,address:token}];
  for(const key of Object.keys(d.display.formats)) if(!key.startsWith('transfer(')) delete d.display.formats[key];
  write(dfile,d);
  const toml=path.join(root,'clear-signing.toml');
  fs.writeFileSync(toml,fs.readFileSync(toml,'utf8').replace('exclusions = { }','[contracts.exclusions]\n"approve(address,uint256)" = "demo"\n"burn(uint256)" = "demo"\n"mint(address,uint256)" = "demo"\n"transferAdmin(address)" = "demo"\n"transferFrom(address,address,uint256)" = "demo"\n'));
  return {root,id:'clear-signing/abi/ClearToken.json:ClearToken'};
}
async function mockChain(t:any) {
  const seen={auth:[] as string[], hypersync:[] as any[], methods:[] as string[]};
  const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=c).on('end',()=>{
    const json=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    if(req.url==='/hs/query') {
      seen.auth.push(String(req.headers.authorization));
      if(req.headers.authorization!==`Bearer ${envioToken}`) return json(401,{error:'Your token is unknown or pending activation.'});
      const q=JSON.parse(body);seen.hypersync.push(q);
      const sel=q.transactions?.[0]?.sighash??[];
      // Server-side filtering by target and selector, as HyperSync does; status is left to the client check.
      const hits=Object.entries(txs).filter(([,x])=>x.block>=q.from_block&&x.block<q.to_block&&q.transactions[0].to.includes(x.to)&&(!sel.length||sel.includes(x.input.slice(0,10))))
        .map(([hash,x])=>({hash,block_number:x.block,to:x.to,input:x.input,status:Number(x.status)}));
      return json(200,{archive_height:1000,next_block:q.to_block,data:{transactions:hits}});
    }
    const one=(call:any)=>{
      const {method,params,id}=call;seen.methods.push(method);
      const ok=(result:unknown)=>({jsonrpc:'2.0',id,result});
      if(method==='eth_chainId') return ok('0x279f');
      if(method==='eth_blockNumber') return ok('0x3e8');
      if(method==='eth_getBlockByNumber') { const n=Number(BigInt(params[0])); return ok({number:params[0],transactions:Object.entries(txs).filter(([,x])=>x.block===n).map(([hash,x])=>({hash,to:x.to,input:x.input,blockNumber:params[0]}))}); }
      const x=txs[params?.[0]];
      if(method==='eth_getTransactionByHash') return ok(x?{hash:params[0],from:sender,to:x.to,input:x.input,value:'0x0',blockNumber:'0x'+x.block.toString(16),chainId:'0x279f'}:null);
      if(method==='eth_getTransactionReceipt') return ok(x?{status:x.status}:null);
      if(method==='eth_call'&&params[0].to.toLowerCase()===token) {
        const coder=AbiCoder.defaultAbiCoder(), s=params[0].data;
        if(s==='0x95d89b41') return ok(coder.encode(['string'],['CLR']));
        if(s==='0x313ce567') return ok(coder.encode(['uint8'],[6]));
        if(s==='0x06fdde03') return ok(coder.encode(['string'],['Clear Token']));
      }
      return {jsonrpc:'2.0',id,error:{message:`${method} not allowed`}};
    };
    const call=JSON.parse(body);
    return json(200,Array.isArray(call)?call.map(one):one(call));
  });});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  return {rpc:base,hypersync:`${base}/hs`,seen};
}

await test('discover with ENVIO_API_TOKEN: HyperSync nominates, the RPC re-checks, refusals fall through to the next nominee',async t=>{
  const {root,id}=project();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const {rpc,hypersync,seen}=await mockChain(t);
  const env={ENVIO_API_TOKEN:envioToken,CLEAR_SIGNING_HYPERSYNC_URL:hypersync};
  const r=(await runAsync(root,['discover','--contract',id,'--rpc-url',rpc],0,env)).result;
  assert.equal(r.source,'hypersync');
  // Newest first: h(2) is non-canonical and refused, the reverted h(3) is dropped by the status check, h(1) is taken.
  assert.deepEqual(r.refused.map((x:any)=>[x.txHash,x.code]),[[h(2),'NONCANONICAL_CALLDATA']]);
  assert.deepEqual(r.created.map((x:any)=>[x.file,x.txHash,x.blockNumber]),[['clear-signing/fixtures/transfer.json',h(1),900]]);
  const f=read(path.join(root,'clear-signing/fixtures/transfer.json'));
  assert.deepEqual([f.txHash,f.to.toLowerCase(),f.data,f.from.toLowerCase()],[h(1),token,transfer,sender]);
  assert.equal(Object.values<any>(f.tokens)[0].symbol,'CLR');
  assert.ok(seen.auth.every(a=>a===`Bearer ${envioToken}`),'the token travels only as a bearer header');
  assert.deepEqual(seen.hypersync[1].transactions,[{to:[token],sighash:['0xa9059cbb'],status:1}]);
  assert.deepEqual([...new Set(seen.methods)].sort(),['eth_call','eth_chainId','eth_getTransactionByHash','eth_getTransactionReceipt'],'reads only');
  // A covered function is left alone and nothing is searched.
  const again=(await runAsync(root,['discover','--contract',id,'--rpc-url',rpc],0,env)).result;
  assert.deepEqual([again.searched,again.created.length,again.alreadyCovered],[null,0,['transfer(address,uint256)']]);
  // --function searches again and does not overwrite the existing fixture.
  const more=(await runAsync(root,['discover','--contract',id,'--rpc-url',rpc,'--function','transfer'],0,env)).result;
  assert.deepEqual(more.created.map((x:any)=>x.file),['clear-signing/fixtures/transfer-2.json']);
  assert.equal((await runAsync(root,['discover','--contract',id,'--rpc-url',rpc,'--function','approve'],2,env)).diagnostics[0].code,'USAGE_ERROR');
  assert.equal((await runAsync(root,['discover','--contract',id,'--rpc-url',rpc,'--function','transfer'],2,{...env,ENVIO_API_TOKEN:'99999999-0000-0000-0000-000000000000'})).diagnostics[0].code,'ENVIO_TOKEN_REJECTED');
  // The fixtures test and export like hand-made ones, with the hash in the registry test case.
  run(root,['review','--accept']);run(root,['test','--update']);
  const exported=run(root,['export','--out','bundle','--no-lint']).result;
  assert.equal(read(path.join(root,exported.registryPath,'testsv2/calldata-ClearToken.tests.json')).tests[0].txHash,h(1));
});

await test('discover without a token scans recent blocks over the RPC and reports what it did not reach',async t=>{
  const {root,id}=project();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const {rpc,seen}=await mockChain(t);
  const r=(await runAsync(root,['discover','--contract',id,'--rpc-url',rpc,'--max-blocks','200'])).result;
  assert.equal(r.source,'rpc-scan');
  assert.match(r.searched,/blocks 801–1000/);
  assert.deepEqual(r.created.map((x:any)=>x.txHash),[h(1)]);
  assert.ok(!seen.methods.includes('eth_sendRawTransaction'));
  // Too shallow a scan finds nothing and says how to widen it.
  const {root:root2,id:id2}=project();t.after(()=>fs.rmSync(root2,{recursive:true,force:true}));
  const shallow=(await runAsync(root2,['discover','--contract',id2,'--rpc-url',rpc,'--max-blocks','20'])).result;
  assert.deepEqual([shallow.created.length,shallow.missing],[0,['transfer(address,uint256)']]);
  assert.match(shallow.next,/ENVIO_API_TOKEN/);
});
