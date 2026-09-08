import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FunctionFragment, Interface} from 'ethers';
import {scaffold,validateDescriptor, type Descriptor} from '../src/descriptors.js';
import {renderFixture} from '../src/fixtures.js';
import {previewHtml,servePreview} from '../src/preview.js';
import type {Contract} from '../src/foundry.js';
const address='0x0000000000000000000000000000000000000001';
const other='0x0000000000000000000000000000000000000002';
function contract(signature:string):Contract {
  const iface=new Interface([`function ${signature}`]);
  return {id:'src/Test.sol:Test',source:'src/Test.sol',name:'Test',artifact:'',abi:JSON.parse(iface.formatJson()),functions:iface.fragments as FunctionFragment[],special:[],metadata:{}};
}
await test('tuple array members stay paired in sequential groups',async()=>{
  const c=contract('send((uint256 amount,address recipient)[] items)');
  const d=scaffold(c,'Example');
  assert.deepEqual(validateDescriptor(d,c,{id:c.id,descriptor:'test.json',exclusions:{}}),[]);
  const iface=new Interface(c.abi);
  const r=await renderFixture({contract:c.id,chainId:31337,to:address,data:iface.encodeFunctionData('send',[[[1,address],[2,other]]]),value:'0',localBinding:true},d,c);
  const flatten=(fields:any[]):any[]=>fields.flatMap(f=>f.fields?flatten(f.fields):[f]);
  assert.deepEqual(flatten(r.fields).map(f=>f.value),['1',address,'2',other]);
});
await test('compiler names and full signature names must agree',()=>{
  const c=contract('send(uint256 amount)');
  const d=scaffold(c,'Example');d.display.formats={'send(uint256 junk)':{intent:'Send',fields:[{path:'junk',label:'Junk',format:'raw'}]}};
  assert.ok(validateDescriptor(d,c,{id:c.id,descriptor:'test.json',exclusions:{}}).some(e=>e.code==='SIGNATURE_NAMES'));
  d.display.formats={'send(uint256)':{intent:'Send',fields:[{path:'arg0',label:'Amount',format:'raw'}]}};
  assert.ok(validateDescriptor(d,c,{id:c.id,descriptor:'test.json',exclusions:{}}).some(e=>e.code==='SIGNATURE_NAMES'));
});
await test('token amounts preserve precision across decimals and uint256 boundaries',async()=>{
  const c=contract('send(uint256 amount)');const iface=new Interface(c.abi);
  for(const decimals of [0,6,18])for(const amount of [0n,1n,2n**256n-1n]) {
    const d=scaffold(c,'Example');d.display.formats['send(uint256 amount)'].fields=[{path:'amount',label:'Amount',format:'tokenAmount',params:{token:other}}];
    const r=await renderFixture({contract:c.id,chainId:31337,to:address,data:iface.encodeFunctionData('send',[amount]),value:'0',localBinding:true,tokens:{[other]:{name:'Test',symbol:'TEST',decimals}}},d,c);
    assert.deepEqual(r.warnings,[]);assert.ok(!/[eE][+-]\d/.test(r.fields[0].value));
    const rendered=r.fields[0].value.replace(/ TEST$/,'').replace(/,/g,'');
    const [whole,fraction='']=rendered.split('.');
    assert.equal(BigInt(whole+fraction.padEnd(decimals,'0')),amount);
  }
});
await test('browser preview escapes hostile metadata and serves only a tokenized loopback route',async()=>{
  const c=contract('send(string memo)'),d=scaffold(c,'Example');
  d.display.formats['send(string memo)'].intent='<script>alert(1)</script>';
  const r=await renderFixture({contract:c.id,chainId:31337,to:address,data:new Interface(c.abi).encodeFunctionData('send',['<img src=x onerror=alert(1)>']),value:'0',localBinding:true},d,c);
  const html=previewHtml(r);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img'));
  const server=await servePreview(r,false);
  try {const response=await fetch(server.url);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy')!,/default-src 'none'/);assert.equal((await fetch(new URL('/nope',server.url))).status,404);}finally{server.close();}
});

await test('signed integers retain their declared-width value after ABI sign extension',async()=>{
  for(let bits=8;bits<=256;bits+=8) {
    const c=contract(`set(int${bits} value)`),d=scaffold(c,'Example'),iface=new Interface(c.abi);
    for(const value of [-(2n**BigInt(bits-1)),-1n,0n,1n,2n**BigInt(bits-1)-1n]) {
      const r=await renderFixture({contract:c.id,chainId:31337,to:address,data:iface.encodeFunctionData('set',[value]),value:'0',localBinding:true},d,c);
      assert.equal(r.fields[0].value,value.toString(),`int${bits} ${value}`);assert.equal(r.fields[0].fieldType,'int');assert.deepEqual(r.warnings,[]);
    }
  }
});

await test('nested fixed/dynamic arrays preserve order, indices, and empty inner arrays',async()=>{
  const c=contract('set((int24[] amounts,address recipient)[][2] rows)'),d=scaffold(c,'Example');
  const args=[[[[[-3,4],address],[[],other]],[[[-9],other]]]];
  assert.deepEqual(validateDescriptor(d,c,{id:c.id,descriptor:'nested.json',exclusions:{}}),[]);
  const r=await renderFixture({contract:c.id,chainId:31337,to:address,data:new Interface(c.abi).encodeFunctionData('set',args),value:'0',localBinding:true},d,c);
  const flatten=(fields:any[]):any[]=>fields.flatMap(f=>f.fields?flatten(f.fields):[f]);
  assert.deepEqual(flatten(r.fields).map(f=>f.value),['-3','4',address,other,'-9',other]);
  assert.ok(r.fields.some((f:any)=>f.warning?.code==='EMPTY_ARRAY'));
  assert.ok(flatten(r.fields).some((f:any)=>f.separator==='rows.[1].[0].amounts.[0]'));
});
