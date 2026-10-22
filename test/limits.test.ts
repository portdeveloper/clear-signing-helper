import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FunctionFragment, Interface} from 'ethers';
import {scaffold, validateDescriptor} from '../src/descriptors.js';
import {limitOf, sentenceSaysLimit} from '../src/limits.js';
import type {Contract} from '../src/foundry.js';

// A maximum or minimum shown as if it were the amount moved: LIMIT_WORDING (the #3133 AI review's catch).
function contract(signature:string):Contract {
  const iface=new Interface([`function ${signature}`]);
  return {id:'src/T.sol:T',source:'src/T.sol',name:'T',artifact:'',abi:JSON.parse(iface.formatJson()),functions:iface.fragments as FunctionFragment[],special:[],metadata:{}};
}
const limitWarnings=(c:Contract,d:any)=>validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}}).filter(e=>e.code==='LIMIT_WORDING').map(e=>e.message);

await test('names say maximum or minimum; a bare minAmount is left out of the warning',()=>{
  assert.deepEqual(['amountADesired','amountInMax','amountInMaximum','maxAmountIn','amountOutMin','amountOutMinimum','minOut','amountIn','admin','minter'].map(n=>limitOf(n,'uint256')),
    ['maximum','maximum','maximum','maximum','minimum','minimum','minimum',undefined,undefined,undefined]);
  assert.equal(limitOf('amountOutMin','address'),undefined,'only integers');
  const p=(name:string)=>new RegExp(`\\{${name}\\}`);
  assert.equal(sentenceSaysLimit('minimum','Remove {liquidity} for at least {amountAMin} and {amountBMin}',p('amountBMin')),true,'"at least" carries across "and"');
  assert.equal(sentenceSaysLimit('maximum','Add {amountADesired} and {amountBDesired} as liquidity',p('amountADesired')),false);
  assert.equal(sentenceSaysLimit('minimum','Redeem {quantity} for {minimumReceiveAmount}+',p('minimumReceiveAmount')),true,'"+" says "or more"');
  assert.equal(sentenceSaysLimit('maximum','Swap at most {amountInMax} for {amountOut}',p('amountInMax')),true);
  assert.equal(sentenceSaysLimit('maximum','Swap {amountIn}',p('amountInMax')),undefined,'not in the sentence');
});

await test('Uniswap V2 addLiquidity: "Amount to Add" warns, "Maximum to Add" with "up to" does not',()=>{
  const c=contract('addLiquidity(address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline)');
  const d=scaffold(c,'Example'), key=Object.keys(d.display.formats)[0];
  const amount=(path:string,label:string,token:string)=>({path,label,format:'tokenAmount',params:{tokenPath:token}});
  const format=(max:string,sentence:string)=>({intent:'Add Liquidity',interpolatedIntent:sentence,fields:[amount('amountADesired',max,'tokenA'),amount('amountBDesired',max,'tokenB'),
    amount('amountAMin','Minimum to Add','tokenA'),amount('amountBMin','Minimum to Add','tokenB'),{path:'to',label:'Recipient',format:'addressName'},{path:'deadline',label:'Deadline',format:'date',params:{encoding:'timestamp'}}]});
  d.display.formats[key]=format('Amount to Add','Add {amountADesired} and {amountBDesired} as liquidity') as any;
  const warned=limitWarnings(c,d);
  assert.equal(warned.length,2);assert.match(warned[0],/amountADesired, a maximum by its name, but labels it "Amount to Add" and names it in the sentence without saying so/);
  d.display.formats[key]=format('Maximum to Add','Add up to {amountADesired} and up to {amountBDesired} as liquidity') as any;
  assert.deepEqual(limitWarnings(c,d),[]);
  // A bare minAmount is ambiguous (LI.FI uses it for the amount bridged): no warning.
  const lifi=contract('bridge((address receiver,uint256 minAmount) data)'), l=scaffold(lifi,'Example'), lkey=Object.keys(l.display.formats)[0];
  l.display.formats[lkey]={intent:'Bridge',fields:[{path:'data.minAmount',label:'Amount to Bridge',format:'raw'},{path:'data.receiver',label:'Receiver',format:'raw'}]} as any;
  assert.deepEqual(limitWarnings(lifi,l),[]);
});
