import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FunctionFragment, Interface} from 'ethers';
import {ENGINE,scaffold,validateDescriptor,WARNING_REMEDY, type Descriptor} from '../src/descriptors.js';
import {humanOutput} from '../src/output.js';
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
  // The route is read by tokenPath, which the registry linter counts as displayed; so no warning without the hidden entry.
  assert.deepEqual(validateDescriptor(d,c,{...selection,hidden:{}}),[]);
  // A true omission is a warning, never an error.
  const fields=d.display.formats[key].fields;
  d.display.formats[key].fields=fields.filter((f:any)=>f.path!=='deadline');
  const diagnostics=validateDescriptor(d,c,{...selection,hidden:{}});
  assert.deepEqual(diagnostics.map(x=>[x.code,x.severity,x.remedy]),[['UNDISPLAYED_ARGUMENT','warning','Display the argument, or record a reason under hidden in clear-signing.toml if leaving it out is deliberate.']]);
  d.display.formats[key].fields=fields;
  const iface=new Interface(c.abi);
  const r=await renderFixture({contract:c.id,chainId:10143,to:address,data:iface.encodeFunctionData('swapExactETHForTokens',[990000n,[address,other],'0x000000000000000000000000000000000000dEaD',1790000000n]),value:'2000000000000000000',localBinding:true,
    chain:{name:'Monad Testnet',nativeCurrency:{name:'Monad',symbol:'MON',decimals:18}},tokens:{[other]:{name:'USD Coin',symbol:'USDC',decimals:6}},ensNames:{'0x000000000000000000000000000000000000dEaD':'burn.eth'}},d,c);
  assert.deepEqual(r.warnings,[]);
  assert.deepEqual(r.fields.map((f:any)=>[f.label,f.value]),[['Send','2 MON'],['Receive at least','0.99 USDC'],['Recipient','burn.eth'],['Expires','2026-09-21 14:13:20Z']]);
});

await test('a relative tokenPath inside a tuple array group follows the element it is expanded with',async()=>{
  const c=contract('batch((address token,uint256 amount)[][] rows)');
  const d=scaffold(c,'Example');
  const key=Object.keys(d.display.formats)[0];
  d.display.formats[key]={intent:'Batch',fields:[{path:'rows.[]',label:'Row',iteration:'sequential',fields:[{path:'[]',label:'Item',iteration:'sequential',fields:[{path:'token',label:'Token',format:'raw'},{path:'amount',label:'Amount',format:'tokenAmount',params:{tokenPath:'token'}}]}]}]};
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

await test('interpolated intents render, flow into registry expectations, and must reference shown fields',async()=>{
  const {testCase}=await import('../src/registry.js');
  const c=contract('stake(uint256 amount)');
  const d=scaffold(c,'Example');const key='stake(uint256 amount)';
  d.display.formats[key]={intent:'Stake LP tokens',interpolatedIntent:'Stake {amount}',fields:[{path:'amount',label:'Amount',format:'tokenAmount',params:{token:other}}]};
  const selection={id:c.id,descriptor:'s.json',exclusions:{}};
  assert.deepEqual(validateDescriptor(d,c,selection).filter(x=>x.severity!=='warning'),[]);
  const fixture={contract:c.id,chainId:1,to:address,data:new Interface(c.abi).encodeFunctionData('stake',[1500000n]),value:'0',localBinding:true,tokens:{[other]:{name:'LP',symbol:'UNI-V2',decimals:6}}};
  const r=await renderFixture(fixture,d,c);
  assert.equal(r.interpolatedIntent,'Stake 1.5 UNI-V2');assert.deepEqual(r.warnings,[]);
  assert.equal(testCase('stake - chain 1',fixture,r,'Example').expected.interpolatedIntent,'Stake 1.5 UNI-V2');
  d.display.formats[key].interpolatedIntent='Stake {amount} for {who}';
  assert.ok(validateDescriptor(d,c,selection).some(x=>x.code==='INVALID_INTERPOLATION'&&/who/.test(x.message)));
  // A hidden field cannot be interpolated either.
  d.display.formats[key]={intent:'Stake',interpolatedIntent:'Stake {amount}',fields:[]};
  assert.ok(validateDescriptor(d,c,{...selection,hidden:{'stake(uint256)':{amount:'test'}}}).some(x=>x.code==='INVALID_INTERPOLATION'));
});

await test('registry idioms validate and render: #. roots, $id, $ref definitions, constant values, visible never on a struct',async()=>{
  const c=contract('createSession(address delegate,uint48 validUntil,(address token,uint256 cap)[] limits) payable');
  const key='createSession(address delegate,uint48 validUntil,(address token,uint256 cap)[] limits)';
  const d:any=scaffold(c,'Example');
  d.context.$id='session-manager';
  d.metadata.constants={vaultTicker:'sMON'};
  d.display.definitions={who:{label:'Delegate',format:'addressName',params:{types:['eoa','wallet']}}};
  d.display.formats[key]={$id:'create',intent:'Create session',fields:[
    {$ref:'$.display.definitions.who',path:'#.delegate'},
    {path:'#.validUntil',label:'Valid until',format:'date',params:{encoding:'timestamp'},$id:'until'},
    {path:'#.limits.[]',label:'Limits',visible:'never'},
    {value:'$.metadata.constants.vaultTicker',label:'Share ticker',format:'raw'},
    {path:'@.value',label:'Deposit',format:'amount'}]};
  const diags=validateDescriptor(d,c,{id:c.id,descriptor:'s.json',exclusions:{}});
  assert.deepEqual(diags.filter(x=>x.severity!=='warning'),[],JSON.stringify(diags));
  assert.ok(!diags.some(x=>x.code==='UNDISPLAYED_ARGUMENT'),'a struct hidden with visible:never is a recorded decision, not a warning');
  const data=new Interface(c.abi).encodeFunctionData('createSession',[other,1790000000n,[[address,5n]]]);
  const r=await renderFixture({contract:c.id,chainId:1,to:address,data,value:'1000000000000000000',localBinding:true,addressNames:{[other]:'Alice'}},d,c);
  assert.deepEqual(r.fields.map((f:any)=>[f.label,f.value]),[['Delegate','Alice'],['Valid until','2026-09-21 14:13:20Z'],['Share ticker','sMON'],['Deposit','1 ETH']]);
  d.display.formats[key].fields[0]={$ref:'$.display.definitions.nope',path:'#.delegate'};
  assert.ok(validateDescriptor(d,c,{id:c.id,descriptor:'s.json',exclusions:{}}).some(x=>x.code==='UNKNOWN_DEFINITION'));
});

// The engine fingerprint gates configs, reviews and every expectation. A release that changes neither
// renderer, schema nor validator subset must keep all three valid, so the tool version stays out of it.
await test('the engine identity excludes the tool version',()=>{
  assert.deepEqual(Object.keys(ENGINE).sort(),['renderer','schema','subset']);
});

await test('check output groups warnings by descriptor and code, most signer-relevant first, each remedy once',()=>{
  const w=(file:string,code:string,message:string)=>({code,message,file,severity:'warning',remedy:WARNING_REMEDY[code]});
  const out=humanOutput({review:'current',contracts:[],warnings:[
    w('b.json','CORPUS_DISAGREEMENT','m1'),w('a.json','INTENT_LENGTH','i1'),w('a.json','UNDISPLAYED_ARGUMENT','u1'),w('a.json','INTENT_LENGTH','i2'),w('b.json','INTENT_LENGTH','i3')]});
  assert.equal(out,['Local checks passed. Review is current.','','5 warning(s), none blocking: 1 UNDISPLAYED_ARGUMENT, 3 INTENT_LENGTH, 1 CORPUS_DISAGREEMENT.',
    '  a.json',`    UNDISPLAYED_ARGUMENT (1): ${WARNING_REMEDY.UNDISPLAYED_ARGUMENT}`,'      u1',`    INTENT_LENGTH (2): ${WARNING_REMEDY.INTENT_LENGTH}`,'      i1','      i2',
    '  b.json',`    INTENT_LENGTH (1): ${WARNING_REMEDY.INTENT_LENGTH}`,'      i3',`    CORPUS_DISAGREEMENT (1): ${WARNING_REMEDY.CORPUS_DISAGREEMENT}`,'      m1'].join('\n'));
});
