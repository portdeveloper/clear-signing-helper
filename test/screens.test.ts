import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FunctionFragment, Interface} from 'ethers';
import {scaffold, validateDescriptor} from '../src/descriptors.js';
import {isRecipientName, pinnedToZero} from '../src/screens.js';
import type {Contract} from '../src/foundry.js';

// Two rules from the AI reviews of #3149–#3156: a sentence that leaves out a shown amount or recipient
// (SENTENCE_OMITS), and an amount mapped to ETH while ETH input is pinned off (NATIVE_AMOUNT_UNPAID).
function contract(signature:string):Contract {
  const iface=new Interface([`function ${signature}`]);
  return {id:'src/T.sol:T',source:'src/T.sol',name:'T',artifact:'',abi:JSON.parse(iface.formatJson()),functions:iface.fragments as FunctionFragment[],special:[],metadata:{}};
}
const warnings=(c:Contract,d:any,code:string)=>validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}}).filter(e=>e.code===code).map(e=>e.message);

await test('recipient names; fee recipients and pins',()=>{
  assert.deepEqual(['to','recipient','receiver','owner','depositor','minterIfNotPayer','onBehalfOf','feeRecipient','referralFeeRecipient','spender','token'].map(isRecipientName),
    [true,true,true,true,true,true,true,false,false,false,false]);
  assert.equal(pinnedToZero({mustMatch:[0]}),true);assert.equal(pinnedToZero({mustMatch:['0']}),true);
  assert.equal(pinnedToZero({mustMatch:[0,1]}),false);assert.equal(pinnedToZero({mustMatch:[false]}),false);assert.equal(pinnedToZero('always'),false);
});

await test('Relay deposit: a sentence without the credited address warns; naming it does not',()=>{
  const c=contract('depositErc20(address depositor,address token,uint256 amount,bytes32 id)');
  const d=scaffold(c,'Example'), key=Object.keys(d.display.formats)[0];
  const format=(sentence:string)=>({intent:'Deposit to Relay',interpolatedIntent:sentence,fields:[{path:'amount',label:'Amount',format:'tokenAmount',params:{tokenPath:'token'}},
    {path:'depositor',label:'Credited To',format:'addressName'},{path:'id',label:'Order ID',format:'raw'},{path:'token',label:'Token',visible:'never'}]});
  d.display.formats[key]=format('Deposit {amount} to Relay') as any;
  assert.deepEqual(warnings(c,d,'SENTENCE_OMITS'),['depositErc20(address,address,uint256,bytes32) interpolatedIntent "Deposit {amount} to Relay" leaves out depositor, shown only as a field.']);
  d.display.formats[key]=format('Deposit {amount} for {depositor}') as any;
  assert.deepEqual(warnings(c,d,'SENTENCE_OMITS'),[]);
  // No sentence, no warning: the rule judges a sentence, not its absence.
  d.display.formats[key]={...format('x'),interpolatedIntent:undefined} as any; delete (d.display.formats[key] as any).interpolatedIntent;
  assert.deepEqual(warnings(c,d,'SENTENCE_OMITS'),[]);
});

await test('RedSnwapper: amountIn mapped to ETH with @.value pinned to 0 warns; the minimum may stay native',()=>{
  const c=contract('snwap(address tokenIn,uint256 amountIn,address recipient,address tokenOut,uint256 amountOutMin,address executor,bytes executorData) payable');
  const d=scaffold(c,'Example'), key=Object.keys(d.display.formats)[0], native={nativeCurrencyAddress:'0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'};
  const format=(inParams:any,value:any)=>({intent:'Swap',interpolatedIntent:'Swap {amountIn} for at least {amountOutMin} to {recipient}',fields:[
    {path:'amountIn',label:'Amount to Send',format:'tokenAmount',params:{tokenPath:'tokenIn',...inParams}},
    {path:'amountOutMin',label:'Minimum to Receive',format:'tokenAmount',params:{tokenPath:'tokenOut',...native}},
    {path:'recipient',label:'Recipient',format:'addressName'},{path:'@.value',label:'ETH Sent',format:'amount',visible:value},
    {path:'tokenIn',label:'Token In',visible:'never'},{path:'tokenOut',label:'Token Out',visible:'never'},{path:'executor',label:'Executor',visible:'never'},{path:'executorData',label:'Data',visible:'never'}]});
  d.display.formats[key]=format(native,{mustMatch:[0]}) as any;
  assert.deepEqual(warnings(c,d,'NATIVE_AMOUNT_UNPAID').length,1);
  assert.match(warnings(c,d,'NATIVE_AMOUNT_UNPAID')[0],/maps amountIn to the native currency, but @.value is pinned to 0/);
  d.display.formats[key]=format({},{mustMatch:[0]}) as any;
  assert.deepEqual(warnings(c,d,'NATIVE_AMOUNT_UNPAID'),[]);
  // Without the pin it is the aggregator idiom (msg.value == amount), left to the decisions hint and claims.
  d.display.formats[key]=format(native,'always') as any;
  assert.deepEqual(warnings(c,d,'NATIVE_AMOUNT_UNPAID'),[]);
});
