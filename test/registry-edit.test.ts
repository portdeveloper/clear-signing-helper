import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Interface, Transaction } from 'ethers';

// `registry add-deployment` edits a registry clone. The verified ABI comes from a mocked Sourcify
// so the suite stays offline; the descriptor and test file mirror registry conventions.
const repo=path.resolve(import.meta.dirname,'..');
const cli=path.join(repo,'dist/cli.js');
const tokenAbi=JSON.parse(fs.readFileSync(path.join(repo,'examples/standard/out/ClearToken.sol/ClearToken.json'),'utf8')).abi;
const mainnetToken='0x3333333333333333333333333333333333333333', monadToken='0x4444444444444444444444444444444444444444', other='0x5555555555555555555555555555555555555555', recipient='0x0000000000000000000000000000000000000002';
function runAsync(args:string[],expected=0,env:Record<string,string>={}):Promise<any> {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,'--json',...args],{env:{...process.env,...env}});
    let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    const timer=setTimeout(()=>{child.kill();reject(new Error(`timeout: ${args.join(' ')}`));},60_000);
    child.on('close',status=>{clearTimeout(timer);try{assert.equal(status,expected,`CLI ${args.join(' ')}\n${out}\n${err}`);resolve(JSON.parse(out));}catch(e){reject(e);}});
  });
}
const read=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8'));
function registryClone() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-registry-'));
  const dir=path.join(root,'registry/example');fs.mkdirSync(path.join(dir,'testsv2'),{recursive:true});
  const descriptor={$schema:'../../specs/erc7730-v2.schema.json',context:{contract:{deployments:[{chainId:1,address:mainnetToken}]}},metadata:{owner:'Example',contractName:'ClearToken'},
    display:{formats:{'transfer(address to,uint256 amount)':{intent:'Send',fields:[{path:'to',label:'To',format:'addressName',params:{types:['eoa','wallet']}},{path:'amount',label:'Amount',format:'tokenAmount',params:{tokenPath:'@.to'}}]}}}};
  // Four-space indentation, as many registry files use; the edit must keep it.
  fs.writeFileSync(path.join(dir,'calldata-ClearToken.json'),JSON.stringify(descriptor,null,4)+'\n');
  const data=new Interface(tokenAbi).encodeFunctionData('transfer',[recipient,2500000n]);
  const rawTx=Transaction.from({type:2,chainId:1,to:mainnetToken,data,value:0n,nonce:0,gasLimit:1_000_000n,maxFeePerGas:0,maxPriorityFeePerGas:0}).unsignedSerialized;
  const tests={$schema:'../../../specs/erc7730-tests-v2.schema.json',descriptor:'../calldata-ClearToken.json',dataProvider:{tokens:{[mainnetToken.toLowerCase()]:{name:'Clear Token',symbol:'CLR',decimals:6}},addressNames:{[recipient.toLowerCase()]:'Alice'}},
    tests:[{description:'Send - chain 1',rawTx,expected:{intent:'Send',owner:'Example',fields:[{label:'To',value:'Alice'},{label:'Amount',value:'2.5 CLR'}]}}]};
  fs.writeFileSync(path.join(dir,'testsv2/calldata-ClearToken.tests.json'),JSON.stringify(tests,null,4)+'\n');
  return root;
}

await test('registry add-deployment proves the ABI, appends the deployment, renders a test for the new chain, and keeps file style',async t=>{
  const root=registryClone();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const server=createServer((req,res)=>{
    const url=new URL(req.url!,'http://x');const send=(status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
    if(url.pathname===`/v2/contract/10143/${monadToken}`) return send(200,{match:'exact_match',chainId:'10143',address:monadToken,abi:tokenAbi,compilation:{name:'ClearToken'},proxyResolution:{isProxy:false,implementations:[]}});
    if(url.pathname===`/v2/contract/10143/${other}`) return send(200,{match:'match',chainId:'10143',address:other,abi:tokenAbi.filter((f:any)=>f.name!=='transfer'),compilation:{name:'NotTheToken'},proxyResolution:{isProxy:false,implementations:[]}});
    return send(404,{match:null});
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const env={CLEAR_SIGNING_SOURCIFY_URL:`http://127.0.0.1:${(server.address() as any).port}`,ETHERSCAN_API_KEY:''};
  const desc=path.join(root,'registry/example/calldata-ClearToken.json'),tests=path.join(root,'registry/example/testsv2/calldata-ClearToken.tests.json');
  const before=[fs.readFileSync(desc,'utf8'),fs.readFileSync(tests,'utf8')];
  // A different contract at the address: refused, nothing written.
  const mismatch=await runAsync(['registry','add-deployment','--registry',root,'--descriptor','registry/example/calldata-ClearToken.json','--chain-id','10143','--address',other,'--no-lint'],1,env);
  assert.equal(mismatch.diagnostics[0].code,'ABI_MISMATCH');assert.match(mismatch.diagnostics[0].message,/transfer\(address,uint256\)/);
  // Right contract but the test needs token metadata for the new chain: refused, nothing written.
  const missing=await runAsync(['registry','add-deployment','--registry',root,'--descriptor','registry/example/calldata-ClearToken.json','--chain-id','10143','--address',monadToken,'--no-lint'],1,env);
  assert.equal(missing.diagnostics[0].code,'NO_RENDERABLE_TEMPLATE');assert.match(missing.diagnostics[0].message,/UNKNOWN_TOKEN/);assert.match(missing.diagnostics[0].message,/--token/);
  assert.deepEqual([fs.readFileSync(desc,'utf8'),fs.readFileSync(tests,'utf8')],before,'failed attempts must not modify the clone');
  // Supplying the chain's token metadata: deployment appended, test rendered, style preserved.
  const r=(await runAsync(['registry','add-deployment','--registry',root,'--descriptor','registry/example/calldata-ClearToken.json','--chain-id','10143','--address',monadToken,'--token',`${monadToken}=mCLR:18`,'--no-lint'],0,env)).result;
  assert.deepEqual(r.deployment,{chainId:10143,address:monadToken});assert.equal(r.verification.source,'sourcify');assert.equal(r.selectorsChecked,1);
  assert.equal(r.test.description,'Send - chain 10143');assert.deepEqual(r.test.expected.fields,[{label:'To',value:'Alice'},{label:'Amount',value:'0.0000000000025 mCLR'}]);
  const d=read(desc);assert.deepEqual(d.context.contract.deployments,[{chainId:1,address:mainnetToken},{chainId:10143,address:monadToken}]);
  assert.ok(fs.readFileSync(desc,'utf8').includes('\n    "context"'),'four-space indentation preserved');assert.ok(fs.readFileSync(desc,'utf8').endsWith('\n'));
  const tf=read(tests);assert.equal(tf.tests.length,2);assert.equal(tf.dataProvider.tokens[monadToken.toLowerCase()].symbol,'mCLR');
  const tx=Transaction.from(tf.tests[1].rawTx);assert.equal(Number(tx.chainId),10143);assert.equal(tx.to,monadToken);assert.equal(tx.data,Transaction.from(tf.tests[0].rawTx).data);
  assert.deepEqual(r.changed,['registry/example/calldata-ClearToken.json','registry/example/testsv2/calldata-ClearToken.tests.json']);
  assert.ok(r.next.some((c:string)=>c.startsWith('gh pr create')));assert.equal(r.lint.ran,false);
  // Adding it again is refused.
  assert.equal((await runAsync(['registry','add-deployment','--registry',root,'--descriptor','registry/example/calldata-ClearToken.json','--chain-id','10143','--address',monadToken,'--no-lint'],2,env)).diagnostics[0].code,'DEPLOYMENT_EXISTS');
});

// EIP-712: the deployments live in a shared file two descriptors include; the address is proven by
// a mocked JSON-RPC endpoint's DOMAIN_SEPARATOR().
function typedRegistryClone() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-registry-'));
  const dir=path.join(root,'registry/vault');fs.mkdirSync(path.join(dir,'testsv2'),{recursive:true});
  const common={$schema:'../../specs/erc7730-v2.schema.json',context:{eip712:{domain:{name:'Vault'},deployments:[{chainId:1,address:vault},{chainId:8453,address:vault}]}},metadata:{owner:'Vault Labs'}};
  fs.writeFileSync(path.join(dir,'common-eip712-vault.json'),JSON.stringify(common,null,2)+'\n');
  const permit={$schema:'../../specs/erc7730-v2.schema.json',includes:'common-eip712-vault.json',display:{formats:{'Permit(address spender,address token,uint256 value)':{intent:'Approve spending',fields:[{path:'spender',label:'Spender',format:'raw'},{path:'value',label:'Amount',format:'tokenAmount',params:{tokenPath:'token'}}],required:['spender','value'],excluded:['token']}}}};
  fs.writeFileSync(path.join(dir,'eip712-vault-permit.json'),JSON.stringify(permit,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'eip712-vault-other.json'),JSON.stringify({...permit,display:{formats:{'Other(address spender)':{intent:'Other',fields:[{path:'spender',label:'Spender',format:'raw'}]}}}},null,2)+'\n');
  const data={types:{EIP712Domain:[{name:'name',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],Permit:[{name:'spender',type:'address'},{name:'token',type:'address'},{name:'value',type:'uint256'}]},
    primaryType:'Permit',domain:{name:'Vault',chainId:1,verifyingContract:vault},message:{spender:recipient,token:mainnetToken,value:'2500000'}};
  const tests={$schema:'../../../specs/erc7730-tests-v2.schema.json',descriptor:'../eip712-vault-permit.json',dataProvider:{tokens:{[mainnetToken.toLowerCase()]:{symbol:'CLR',decimals:6,name:'Clear Token'}}},
    tests:[{description:'Approve spending',data,expected:{intent:'Approve spending',owner:'Vault Labs',fields:[{label:'Spender',value:recipient},{label:'Amount',value:'2.5 CLR'}]}}]};
  fs.writeFileSync(path.join(dir,'testsv2/eip712-vault-permit.tests.json'),JSON.stringify(tests,null,2)+'\n');
  return root;
}
const vault='0x6666666666666666666666666666666666666666', imposter='0x7777777777777777777777777777777777777777', empty='0x8888888888888888888888888888888888888888', spender143='0x9999999999999999999999999999999999999999';

await test('registry add-deployment on an EIP-712 descriptor proves the domain, inserts in chain order in the shared file, and renders a retargeted test',async t=>{
  const {TypedDataEncoder}=await import('ethers');
  const root=typedRegistryClone();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const server=createServer((req,res)=>{
    let body='';req.on('data',d=>body+=d);req.on('end',()=>{
      const {method,params}=JSON.parse(body);const chainId=Number(/^\/chain(\d+)$/.exec(req.url??'')?.[1]??143);
      const reply=(result:unknown)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:1,...(result instanceof Error?{error:{code:-32000,message:result.message}}:{result})}));};
      if(method==='eth_chainId') return reply('0x'+chainId.toString(16));
      const to=String(method==='eth_call'?params[0].to:params[0]).toLowerCase();
      if(method==='eth_getCode') return reply(to===empty?'0x':'0x6080604052');
      if(to===imposter) return reply(TypedDataEncoder.hashDomain({name:'Imposter',chainId,verifyingContract:imposter}));
      return reply(TypedDataEncoder.hashDomain({name:'Vault',chainId,verifyingContract:vault}));
    });
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const rpc=`http://127.0.0.1:${(server.address() as any).port}`;
  const common=path.join(root,'registry/vault/common-eip712-vault.json'),tests=path.join(root,'registry/vault/testsv2/eip712-vault-permit.tests.json');
  const before=[fs.readFileSync(common,'utf8'),fs.readFileSync(tests,'utf8')];
  const base=['registry','add-deployment','--registry',root,'--descriptor','registry/vault/eip712-vault-permit.json','--chain-id','143','--no-lint'];
  const code=async(args:string[],exit:number)=>(await runAsync([...base,...args],exit)).diagnostics[0].code;
  assert.equal(await code(['--address',vault],2),'RPC_REQUIRED');
  assert.equal(await code(['--address',vault,'--rpc-url',`${rpc}/chain1`],2),'RPC_CHAIN_MISMATCH');
  assert.equal(await code(['--address',empty,'--rpc-url',rpc],1),'NO_CODE');
  assert.equal(await code(['--address',imposter,'--rpc-url',rpc],1),'DOMAIN_MISMATCH');
  assert.equal(await code(['--address',vault,'--rpc-url',rpc,'--abi','x.json'],2),'USAGE_ERROR');
  // Proven, but the retargeted test needs the new chain's token, and a --set path must exist.
  const noToken=(await runAsync([...base,'--address',vault,'--rpc-url',rpc,'--set',`token=${monadToken}`],1)).diagnostics[0];
  assert.equal(noToken.code,'NO_RENDERABLE_TEMPLATE');assert.match(noToken.message,/needs metadata for chain 143/);
  const typo=(await runAsync([...base,'--address',vault,'--rpc-url',rpc,'--set','spendr=0x01'],1)).diagnostics[0];
  assert.equal(typo.code,'NO_RENDERABLE_TEMPLATE');assert.match(typo.message,/no field spendr/);
  assert.deepEqual([fs.readFileSync(common,'utf8'),fs.readFileSync(tests,'utf8')],before,'failed attempts must not modify the clone');
  const r=(await runAsync([...base,'--address',vault,'--rpc-url',rpc,'--set',`token=${monadToken}`,'--set',`spender=${spender143}`,'--token',`${monadToken}=mCLR:6`],0)).result;
  assert.equal(r.deploymentsFile,'registry/vault/common-eip712-vault.json');assert.equal(r.verification.domainSource,'descriptor context.eip712.domain');
  assert.deepEqual(r.affectedDescriptors,['registry/vault/eip712-vault-other.json','registry/vault/eip712-vault-permit.json']);
  assert.deepEqual(r.test.expected,{intent:'Approve spending',owner:'Vault Labs',fields:[{label:'Spender',value:spender143},{label:'Amount',value:'2.5 mCLR'}]});
  // Inserted between chain 1 and 8453 with the neighbours' multi-line layout; nothing else moved.
  const text=fs.readFileSync(common,'utf8');
  assert.deepEqual(read(common).context.eip712.deployments.map((x:any)=>x.chainId),[1,143,8453]);
  const entry=(id:number)=>`        {\n          "chainId": ${id},\n          "address": "${vault}"\n        },\n`;
  assert.equal(text,before[0].replace(entry(8453).replace('},','}'),entry(143)+entry(8453).replace('},','}')));
  const tf=read(tests);assert.equal(tf.tests.length,2);assert.equal(tf.tests[1].description,'Approve spending - chain 143');
  assert.deepEqual(tf.tests[1].data.domain,{name:'Vault',chainId:143,verifyingContract:vault});assert.equal(tf.tests[1].data.message.spender,spender143);
  assert.deepEqual(Object.keys(tf.dataProvider.tokens[monadToken.toLowerCase()]),['symbol','decimals','name']);
  assert.deepEqual(r.changed,['registry/vault/common-eip712-vault.json','registry/vault/testsv2/eip712-vault-permit.tests.json']);
  assert.deepEqual(r.templateAddresses,[]);
  // A second run on another chain without --set keeps the template's addresses and says so.
  const kept=(await runAsync([...base.slice(0,6),'--chain-id','10','--no-lint','--address',vault,'--rpc-url',`${rpc}/chain10`],0)).result;
  assert.deepEqual(kept.templateAddresses,[`spender=${recipient}`,`token=${mainnetToken}`]);assert.match(kept.note,/--set <path>=<address>/);
  assert.deepEqual(read(common).context.eip712.deployments.map((x:any)=>x.chainId),[1,10,143,8453]);
  assert.equal(await code(['--address',vault,'--rpc-url',rpc],2),'DEPLOYMENT_EXISTS');
});

// Lint and the runners run on the edited files; when either rejects the edit, every file goes back.
await test('registry add-deployment restores the clone when upstream lint or a registry runner rejects the edit',async t=>{
  const root=registryClone();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const server=createServer((req,res)=>{
    const url=new URL(req.url!,'http://x');res.writeHead(url.pathname===`/v2/contract/10143/${monadToken}`?200:404,{'content-type':'application/json'});
    res.end(JSON.stringify(url.pathname===`/v2/contract/10143/${monadToken}`?{match:'exact_match',abi:tokenAbi,compilation:{name:'ClearToken'},proxyResolution:{isProxy:false,implementations:[]}}:{match:null}));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  // Stand-ins: a uvx whose lint reports an error or passes, and runners at the pins the clone's CI names.
  const bin=fs.mkdtempSync(path.join(os.tmpdir(),'csh-fake-uvx-'));t.after(()=>fs.rmSync(bin,{recursive:true,force:true}));
  const uvx=(exit:number)=>{fs.writeFileSync(path.join(bin,'uvx'),`#!/bin/sh\n[ "$1" = --version ] && exit 0\necho "registry/example/calldata-ClearToken.json: error: stubbed lint error"\nexit ${exit}\n`);fs.chmodSync(path.join(bin,'uvx'),0o755);};
  const runners=fs.mkdtempSync(path.join(os.tmpdir(),'csh-runner-stubs-'));t.after(()=>fs.rmSync(runners,{recursive:true,force:true}));
  const sref='dae3cdabd0eab26173d7f7a31a2ca7e75bf07daf',rref='10605ba78f3d6f3f13102e0f3a3ecbc44ac500dc';
  for(const [name,repository,ref] of [['run-sourcify-tests','sourcifyeth/clear-signing-test-runner',sref],['run-rust-tests','llbartekll/clear-signing',rref]]) {
    fs.mkdirSync(path.join(root,'.github/actions',name),{recursive:true});fs.writeFileSync(path.join(root,'.github/actions',name,'action.yml'),`uses: actions/checkout@v4\nwith:\n  repository: ${repository}\n  ref: ${ref}\n`);
  }
  const s=path.join(runners,`sourcify-${sref.slice(0,8)}/dist`),r=path.join(runners,`rust-${rref.slice(0,8)}/target/release`);fs.mkdirSync(s,{recursive:true});fs.mkdirSync(r,{recursive:true});
  fs.writeFileSync(path.join(s,'cli.js'),`const fs=require('fs');const [file,,out]=process.argv.slice(2);const t=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(out,JSON.stringify({implementation:'stub',cases:t.tests.map(c=>({description:c.description,status:'fail',message:'stubbed mismatch'}))}));`);
  fs.writeFileSync(path.join(r,'cs-test'),'#!/bin/sh\nexit 0\n');fs.chmodSync(path.join(r,'cs-test'),0o755);
  const env={CLEAR_SIGNING_SOURCIFY_URL:`http://127.0.0.1:${(server.address() as any).port}`,ETHERSCAN_API_KEY:'',PATH:`${bin}${path.delimiter}${process.env.PATH}`,CLEAR_SIGNING_RUNNERS_DIR:runners};
  const desc=path.join(root,'registry/example/calldata-ClearToken.json'),tests=path.join(root,'registry/example/testsv2/calldata-ClearToken.tests.json');
  const before=[fs.readFileSync(desc,'utf8'),fs.readFileSync(tests,'utf8')];
  const args=['registry','add-deployment','--registry',root,'--descriptor','registry/example/calldata-ClearToken.json','--chain-id','10143','--address',monadToken,'--token',`${monadToken}=mCLR:18`];
  uvx(1);
  const lint=(await runAsync(args,1,env)).diagnostics[0];
  assert.equal(lint.code,'UPSTREAM_LINT_FAILED');assert.match(lint.message,/stubbed lint error/);
  assert.deepEqual([fs.readFileSync(desc,'utf8'),fs.readFileSync(tests,'utf8')],before,'a lint error restores the clone');
  uvx(0);
  const runner=(await runAsync([...args,'--runners'],1,env)).diagnostics[0];
  assert.equal(runner.code,'REGISTRY_RUNNER_FAILED');assert.match(runner.message,/stubbed mismatch[\s\S]*Nothing was changed/);
  assert.deepEqual([fs.readFileSync(desc,'utf8'),fs.readFileSync(tests,'utf8')],before,'a runner failure restores the clone');
  // Both pass: the edit stays.
  fs.writeFileSync(path.join(s,'cli.js'),`const fs=require('fs');const [file,,out]=process.argv.slice(2);const t=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(out,JSON.stringify({implementation:'stub',cases:t.tests.map(c=>({description:c.description,status:'pass'}))}));`);
  fs.writeFileSync(path.join(r,'cs-test'),`#!/bin/sh\nnode -e "const fs=require('fs');const t=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));fs.writeFileSync(process.argv[2],JSON.stringify({implementation:'stub',cases:t.tests.map(c=>({description:c.description,status:'pass'}))}))" "$2" "$6"\n`);
  const ok=(await runAsync([...args,'--runners'],0,env)).result;
  assert.equal(ok.lint.exitCode,0);assert.deepEqual(ok.registryRunners.map((x:any)=>x.passed),[true,true]);
  assert.equal(read(desc).context.contract.deployments.length,2);
});

// A rendered test case that displays a signed integer is checked by the registry runners, or skipped with a recorded reason.
await test('registry add-deployment requires the runners, or a recorded reason, for a test that renders differently in registry CI',async t=>{
  const abi=[{type:'function',name:'adjust',stateMutability:'nonpayable',inputs:[{name:'delta',type:'int256'},{name:'account',type:'address'}],outputs:[]}];
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csh-registry-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=path.join(root,'registry/example');fs.mkdirSync(path.join(dir,'testsv2'),{recursive:true});
  const desc=path.join(dir,'calldata-Ledger.json'),tests=path.join(dir,'testsv2/calldata-Ledger.tests.json');
  fs.writeFileSync(desc,JSON.stringify({$schema:'../../specs/erc7730-v2.schema.json',context:{contract:{deployments:[{chainId:1,address:mainnetToken}]}},metadata:{owner:'Example'},
    display:{formats:{'adjust(int256 delta,address account)':{intent:'Adjust',fields:[{path:'delta',label:'Delta',format:'raw'},{path:'account',label:'Account',format:'raw'}]}}}},null,2)+'\n');
  const data=new Interface(abi).encodeFunctionData('adjust',[-5n,recipient]);
  const rawTx=Transaction.from({type:2,chainId:1,to:mainnetToken,data,value:0n,nonce:0,gasLimit:1_000_000n,maxFeePerGas:0,maxPriorityFeePerGas:0}).unsignedSerialized;
  fs.writeFileSync(tests,JSON.stringify({$schema:'../../../specs/erc7730-tests-v2.schema.json',descriptor:'../calldata-Ledger.json',tests:[{description:'Adjust - chain 1',rawTx,expected:{intent:'Adjust',owner:'Example',fields:[{label:'Delta',value:'-5'},{label:'Account',value:recipient}]}}]},null,2)+'\n');
  const server=createServer((req,res)=>{const ok=new URL(req.url!,'http://x').pathname===`/v2/contract/10143/${monadToken}`;res.writeHead(ok?200:404,{'content-type':'application/json'});res.end(JSON.stringify(ok?{match:'exact_match',abi,compilation:{name:'Ledger'},proxyResolution:{isProxy:false,implementations:[]}}:{match:null}));});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const env={CLEAR_SIGNING_SOURCIFY_URL:`http://127.0.0.1:${(server.address() as any).port}`,ETHERSCAN_API_KEY:''};
  const before=[fs.readFileSync(desc,'utf8'),fs.readFileSync(tests,'utf8')];
  const args=['registry','add-deployment','--registry',root,'--descriptor','registry/example/calldata-Ledger.json','--chain-id','10143','--address',monadToken,'--no-lint'];
  const blocked=(await runAsync(args,1,env)).diagnostics[0];
  assert.equal(blocked.code,'REGISTRY_RUNNERS_REQUIRED');assert.match(blocked.message,/delta \(SIGNED_INTEGER_PORTABILITY\)[\s\S]*Nothing was changed/);
  assert.deepEqual([fs.readFileSync(desc,'utf8'),fs.readFileSync(tests,'utf8')],before);
  const r=(await runAsync([...args,'--skip-registry-runners','runners not built here'],0,env)).result;
  assert.equal(r.registryRunnersSkipped.reason,'runners not built here');assert.equal(r.test.description,'Adjust - chain 10143');
  assert.deepEqual(r.test.expected.fields,[{label:'Delta',value:'-5'},{label:'Account',value:recipient}]);
});
