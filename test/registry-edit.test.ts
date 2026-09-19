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
