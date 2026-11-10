import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FunctionFragment, Interface} from 'ethers';
import {scaffold, validateDescriptor, errorsOf} from '../src/descriptors.js';
import type {Contract} from '../src/foundry.js';

// Shapes merged registry descriptors use that the validator once rejected (acceptance run at registry b021a8d,
// 2026-11-10). Each is something the registry accepts and no wallet screen depends on, or renders fine.
function contract(signature:string):Contract {
  const iface=new Interface([`function ${signature}`]);
  return {id:'src/T.sol:T',source:'src/T.sol',name:'T',artifact:'',abi:JSON.parse(iface.formatJson()),functions:iface.fragments as FunctionFragment[],special:[],metadata:{}};
}
const errors=(c:Contract,d:any)=>errorsOf(validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}})).map(e=>e.code);

await test('a top-level $comment and a factory context are accepted (Railnet Conduit)',()=>{
  const c=contract('deposit(uint256 amount)');
  const d:any=scaffold(c,'Example');
  d.context.contract.deployments=[{chainId:1,address:'0xE627A511c9aC2D9FD271F10c7A200779c833AC5A'}];
  d.$comment='Every Conduit is a BeaconProxy deployed by the factory.';
  d.context.contract.factory={deployEvent:'ConduitDeployed(address indexed deployer, address indexed conduit)',deployments:[{chainId:1,address:'0x1111111111111111111111111111111111111111'}]};
  assert.deepEqual(errors(c,d),[]);
  d.$note='unknown keys are still refused';
  assert.notDeepEqual(errors(c,d),[]);
});

await test('one leaf may be shown twice only when every appearance is conditional (Across destinationChainId)',()=>{
  const c=contract('deposit(uint256 amount,uint256 destinationChainId)');
  const d:any=scaffold(c,'Example'), key=Object.keys(d.display.formats)[0];
  const amount={path:'amount',label:'Amount',format:'raw'};
  const asChain=(visible?:unknown)=>({path:'destinationChainId',label:'Destination Chain',format:'chainId',...(visible?{visible}:{})});
  const asRaw=(visible?:unknown)=>({path:'destinationChainId',label:'Destination Chain',format:'raw',...(visible?{visible}:{})});
  const withFields=(fields:unknown[])=>{d.display.formats[key]={intent:'Deposit',fields};return errors(c,d);};
  // Complementary conditions: a wallet shows one or the other.
  assert.deepEqual(withFields([amount,asChain({ifNotIn:[130,143]}),asRaw({ifNotIn:[1,10]})]),[]);
  // An unconditional appearance next to another one is still a mistake, in either order.
  assert.deepEqual(withFields([amount,asChain(),asRaw()]),['DUPLICATE_FIELD']);
  assert.deepEqual(withFields([amount,asChain({ifNotIn:[130]}),asRaw()]),['DUPLICATE_FIELD']);
  assert.deepEqual(withFields([amount,asChain(),asRaw({ifNotIn:[1]})]),['DUPLICATE_FIELD']);
});
