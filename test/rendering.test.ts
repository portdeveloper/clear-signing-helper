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

await test('registry-style swap descriptor: typed addressName, tokenPath into path array, hidden route, native amount',async()=>{
  const c=contract('swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable');
  const d=scaffold(c,'Example');
  const key='swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline)';
  d.display.formats[key]={intent:'Swap',fields:[
    {path:'@.value',label:'Send',format:'amount'},
    {path:'amountOutMin',label:'Receive at least',format:'tokenAmount',params:{tokenPath:'path.[-1]'}},
    {path:'to',label:'Recipient',format:'addressName',params:{types:['eoa','wallet'],sources:['local','ens']}},
    {path:'deadline',label:'Expires',format:'date',params:{encoding:'timestamp'}}]};
  const selection={id:c.id,descriptor:'swap.json',exclusions:{},hidden:{'swapExactETHForTokens(uint256,address[],address,uint256)':{'path.[]':'Route is implied by the amounts'}}};
  assert.deepEqual(validateDescriptor(d,c,selection),[]);
  // Without the hidden entry the omission is a warning, never an error.
  const diagnostics=validateDescriptor(d,c,{...selection,hidden:{}});
  assert.deepEqual(diagnostics.map(x=>[x.code,x.severity]),[['UNDISPLAYED_ARGUMENT','warning']]);
  const iface=new Interface(c.abi);
  const r=await renderFixture({contract:c.id,chainId:10143,to:address,data:iface.encodeFunctionData('swapExactETHForTokens',[990000n,[address,other],'0x000000000000000000000000000000000000dEaD',1790000000n]),value:'2000000000000000000',localBinding:true,
    chain:{name:'Monad Testnet',nativeCurrency:{name:'Monad',symbol:'MON',decimals:18}},tokens:{[other]:{name:'USD Coin',symbol:'USDC',decimals:6}},ensNames:{'0x000000000000000000000000000000000000dEaD':'burn.eth'}},d,c);
  assert.deepEqual(r.warnings,[]);
  assert.deepEqual(r.fields.map((f:any)=>[f.label,f.value]),[['Send','2 MON'],['Receive at least','0.99 USDC'],['Recipient','burn.eth'],['Expires','2026-09-21 14:13:20Z']]);
});

await test('tokenPath inside a tuple array follows the element it is expanded with',async()=>{
  const c=contract('batch((address token,uint256 amount)[][] rows)');
  const d=scaffold(c,'Example');
  const key=Object.keys(d.display.formats)[0];
  d.display.formats[key]={intent:'Batch',fields:[{path:'rows.[]',label:'Row',iteration:'sequential',fields:[{path:'[]',label:'Item',iteration:'sequential',fields:[{path:'token',label:'Token',format:'raw'},{path:'amount',label:'Amount',format:'tokenAmount',params:{tokenPath:'rows.[].[].token'}}]}]}]};
  assert.deepEqual(validateDescriptor(d,c,{id:c.id,descriptor:'b.json',exclusions:{}}),[]);
  const r=await renderFixture({contract:c.id,chainId:1,to:address,data:new Interface(c.abi).encodeFunctionData('batch',[[[[address,1000000n]],[[other,5n]]]]),value:'0',localBinding:true,
    tokens:{[address]:{name:'A',symbol:'AAA',decimals:6},[other]:{name:'B',symbol:'BBB',decimals:0}}},d,c);
  const flatten=(fields:any[]):any[]=>fields.flatMap(f=>f.fields?flatten(f.fields):[f]);
  assert.deepEqual(flatten(r.fields).filter(f=>f.format==='tokenAmount').map(f=>f.value),['1 AAA','5 BBB']);
});

await test('terminal preview prints unlabeled groups flat and does not repeat a label already in the separator',async()=>{
  const {humanOutput}=await import('../src/output.js');
  const c=contract('route(address[] path,(uint256 a,uint256 b)[] legs)');
  const d=scaffold(c,'Example');
  const r=await renderFixture({contract:c.id,chainId:31337,to:address,data:new Interface(c.abi).encodeFunctionData('route',[[address,other],[[1,2]]]),value:'0',localBinding:true},d,c);
  const text=humanOutput(r);
  assert.ok(!text.includes('Item'),text);
  assert.ok(text.includes('  Path 0: '+address),text);
  assert.ok(text.includes('  Legs\n    A: 1\n    B: 2')||text.includes('Legs'),text);
});
