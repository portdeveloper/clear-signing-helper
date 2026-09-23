import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interface, FunctionFragment } from 'ethers';
import { priorsFor, leafViews, disagreements, summarizePrior, registryMatches, PRIORS_META } from '../src/priors.js';
import { scaffold, scaffoldFormatWithProvenance, validateDescriptor, warningsOf } from '../src/descriptors.js';
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
test('one entity\'s prior is a hint, not a warning: disagreement needs agreement across projects',()=>{
  // mint(address,uint256) is described by a single registry entity, for an unrelated contract.
  const mint=priorsFor('0x40c10f19');
  assert.ok(mint.length>=1&&new Set(mint.map(p=>p.entity)).size===1,JSON.stringify(mint.map(p=>p.entity)));
  const c=contract('mint(address to,uint256 amount)'),d=scaffold(c,'Example'),key='mint(address to,uint256 amount)';
  assert.deepEqual(disagreements(key,d.display.formats[key].fields),[]);
  assert.ok(!warningsOf(validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}})).some(x=>x.code==='CORPUS_DISAGREEMENT'));
});
test('ERC-20 conventions never scaffold an interpolatedIntent their own check flags as too long',()=>{
  const evidence={notices:{},paramDocs:{},enums:{},constants:{},conventions:{erc20:true,weth:false}};
  const draft=(sig:string):{format:any;provenance:{detail:string}[]}=>scaffoldFormatWithProvenance(FunctionFragment.from(`function ${sig}`),evidence);
  // The registry's phrasing when it fits, a shorter one when it does not, none when nothing fits.
  assert.equal(draft('approve(address guy,uint256 wad)').format.interpolatedIntent,'Allow {guy} to spend {wad}');
  assert.equal(draft('approve(address spender,uint256 value)').format.interpolatedIntent,'Let {spender} spend {value}');
  assert.equal(draft('transferFrom(address from,address to,uint256 value)').format.interpolatedIntent,'{from} sends {value} to {to}');
  const long=draft('transferFrom(address sender,address recipient,uint256 amount)');
  assert.equal(long.format.interpolatedIntent,undefined);
  assert.ok(long.provenance.some(p=>/interpolatedIntent not set/.test(p.detail)),JSON.stringify(long.provenance));
  for(const sig of ['approve(address spender,uint256 value)','transferFrom(address from,address to,uint256 value)','transfer(address to,uint256 value)']){
    const c=contract(sig),d=scaffold(c,'Example');d.display.formats={[sig]:draft(sig).format};
    assert.ok(!warningsOf(validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}})).some(x=>x.code==='INTENT_LENGTH'),sig);
  }
});
const selectorsOf=(...sigs:string[])=>sigs.map(s=>FunctionFragment.from(`function ${s}`).selector);
const V2_ROUTER=['addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)','addLiquidityETH(address,uint256,uint256,uint256,address,uint256)','removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)','removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)','removeLiquidityWithPermit(address,address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)','removeLiquidityETHWithPermit(address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)','removeLiquidityETHSupportingFeeOnTransferTokens(address,uint256,uint256,uint256,address,uint256)','removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(address,uint256,uint256,uint256,address,uint256,bool,uint8,bytes32,bytes32)','swapExactTokensForTokens(uint256,uint256,address[],address,uint256)','swapTokensForExactTokens(uint256,uint256,address[],address,uint256)','swapExactETHForTokens(uint256,address[],address,uint256)','swapTokensForExactETH(uint256,uint256,address[],address,uint256)','swapExactTokensForETH(uint256,uint256,address[],address,uint256)','swapETHForExactTokens(uint256,address[],address,uint256)','swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)','swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)','swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)'];
test('a Uniswap V2 router ABI finds the registry\'s V2 router descriptor, contained in the ABI',()=>{
  const [m,...rest]=registryMatches(selectorsOf(...V2_ROUTER));
  assert.equal(m.file,'registry/quickswap/calldata-QuickSwap.json');
  assert.deepEqual([m.shared.length,m.distinctive,m.contained],[15,17,true]);
  assert.deepEqual(rest,[]);
});
test('a contract with many more functions than the registry describes still matches when the file is contained in it',()=>{
  // SwapRouter02: the registry file describes six swaps; the contract also has permits, sweeps and multicalls.
  const extra=Array.from({length:24},(_,i)=>`extraFunction${i}(uint256)`);
  const [m]=registryMatches(selectorsOf('exactInput((bytes,address,uint256,uint256))','exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))','exactOutput((bytes,address,uint256,uint256))','exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))','swapExactTokensForTokens(uint256,uint256,address[],address)','swapTokensForExactTokens(uint256,uint256,address[],address)','multicall(bytes[])',...extra));
  assert.equal(m?.file,'registry/uniswap/calldata-UniswapV3Router02.json');
  assert.ok(m.contained&&m.shared.length===6);
  // Without containment, 6 of 30 distinctive functions is too little to suggest anything.
  assert.deepEqual(registryMatches(selectorsOf('exactInput((bytes,address,uint256,uint256))','exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))','exactOutput((bytes,address,uint256,uint256))',...extra)),[]);
});
test('standard interfaces and single coincidences suggest nothing',()=>{
  // ERC-20 and ERC-4626 functions are described by many entities; they name an interface, not a protocol.
  assert.deepEqual(registryMatches(selectorsOf('approve(address,uint256)','transfer(address,uint256)','transferFrom(address,address,uint256)','deposit()','withdraw(uint256)')),[]);
  assert.deepEqual(registryMatches(selectorsOf('deposit(uint256,address)','withdraw(uint256,address,address)','mint(uint256,address)','redeem(uint256,address,address)','approve(address,uint256)')),[]);
  // One shared distinctive function is a coincidence (StakingRewards shares withdraw(uint256) with one file).
  assert.deepEqual(registryMatches(selectorsOf('stake(uint256)','withdraw(uint256)','getReward()','exit()','notifyRewardAmount(uint256)')),[]);
});
