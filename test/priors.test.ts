import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interface, FunctionFragment } from 'ethers';
import { priorsFor, leafViews, disagreements, summarizePrior, PRIORS_META } from '../src/priors.js';
import { scaffold, validateDescriptor, warningsOf } from '../src/descriptors.js';
import type { Contract } from '../src/foundry.js';

function contract(signature:string):Contract {
  const iface=new Interface([`function ${signature}`]);
  return {id:'src/Test.sol:Test',source:'src/Test.sol',name:'Test',artifact:'',abi:JSON.parse(iface.formatJson()),functions:iface.fragments as FunctionFragment[],special:[],metadata:{}};
}
test('the registry prior knows ERC-20 approve and aligns leaves by ABI position',()=>{
  const approve=priorsFor('0x095ea7b3');
  assert.ok(approve.length>=5,`expected several approve priors, got ${approve.length}`);
  assert.ok(PRIORS_META.commit.length===40);
  const typed=approve.filter(p=>leafViews(p.key,p.fields)?.[1]?.kind==='typed');
  assert.ok(typed.length>approve.length/2,'most registry approve formats type the amount');
  assert.match(summarizePrior(typed[0]),/intent ".+"; \w+=\w+/);
});
test('a raw draft of a selector the registry types is a warning, not an error; a typed one is quiet',()=>{
  const c=contract('approve(address spender,uint256 amount)');
  const d=scaffold(c,'Example');
  const key='approve(address spender,uint256 amount)';
  const raw=disagreements(key,d.display.formats[key].fields);
  // Every registry approve format types the spender; the amount is not unanimous, so only the spender is flagged.
  assert.ok(raw.some(x=>x.path==='spender'&&x.ours==='raw'&&x.prior==='typed'),JSON.stringify(raw));
  const diagnostics=validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}});
  const w=warningsOf(diagnostics);
  assert.ok(w.some(x=>x.code==='CORPUS_DISAGREEMENT'&&/spender/.test(x.message)),JSON.stringify(w));
  assert.deepEqual(diagnostics.filter(x=>x.severity!=='warning'),[]);
  d.display.formats[key].fields=[{path:'spender',label:'Spender',format:'addressName',params:{types:['eoa','contract']}},{path:'amount',label:'Amount',format:'tokenAmount',params:{tokenPath:'@.to'}}];
  assert.deepEqual(disagreements(key,d.display.formats[key].fields),[]);
  assert.ok(!warningsOf(validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}})).some(x=>x.code==='CORPUS_DISAGREEMENT'));
});
test('a selector the registry has never described produces no prior and no warning',()=>{
  const c=contract('frobnicate(uint256 widgets,address who)');
  const d=scaffold(c,'Example');
  assert.deepEqual(disagreements('frobnicate(uint256 widgets,address who)',d.display.formats['frobnicate(uint256 widgets,address who)'].fields),[]);
});
