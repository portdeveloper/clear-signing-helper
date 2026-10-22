import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FunctionFragment, Interface} from 'ethers';
import {leaves, scaffold, validateDescriptor} from '../src/descriptors.js';
import {permitOf} from '../src/permits.js';
import type {Contract} from '../src/foundry.js';

// A permit inside calldata grants an approval; PERMIT_GRANT_HIDDEN warns when what it grants is hidden.
function contract(signature:string):Contract {
  const iface=new Interface([`function ${signature}`]);
  return {id:'src/T.sol:T',source:'src/T.sol',name:'T',artifact:'',abi:JSON.parse(iface.formatJson()),functions:iface.fragments as FunctionFragment[],special:[],metadata:{}};
}
const of=(signature:string)=>permitOf(leaves(FunctionFragment.from(`function ${signature}`).inputs));
const permitWarnings=(c:Contract,d:any)=>validateDescriptor(d,c,{id:c.id,descriptor:'t.json',exclusions:{}}).filter(e=>e.code==='PERMIT_GRANT_HIDDEN').map(e=>e.message);

await test('Uniswap V2 removeLiquidityWithPermit: hiding approveMax warns, hiding v, r, s does not',()=>{
  const sig='removeLiquidityWithPermit(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline,bool approveMax,uint8 v,bytes32 r,bytes32 s)';
  assert.deepEqual(of(sig),{kind:'split signature',signature:['v','r','s'],grants:[{path:'approveMax',what:'unlimited approval flag'}]});
  const c=contract(sig), d=scaffold(c,'Example'), key=Object.keys(d.display.formats)[0];
  const fields=d.display.formats[key].fields as any[];
  for(const f of fields) if(['v','r','s'].includes(f.path)) f.visible='never';
  assert.deepEqual(permitWarnings(c,d),[],'the signature may be hidden');
  fields.find(f=>f.path==='approveMax').visible='never';
  assert.equal(permitWarnings(c,d).length,1);assert.match(permitWarnings(c,d)[0],/hides approveMax, the unlimited approval flag/);
});

await test('Permit2 PermitSingle: the amount, spender and expiration are grants; sigDeadline, nonce and the signature are not',()=>{
  const sig='permitAndCall(((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permitSingle,bytes signature)';
  const p=of(sig)!;
  assert.equal(p.kind,'Permit2');assert.deepEqual(p.signature,['signature']);
  assert.deepEqual(p.grants.map(g=>g.path),['permitSingle.details.token','permitSingle.details.amount','permitSingle.details.expiration','permitSingle.spender']);
  const c=contract(sig), d=scaffold(c,'Example'), key=Object.keys(d.display.formats)[0];
  const field=(path:string,label:string,hidden=false)=>({path,label,format:'raw',...(hidden?{visible:'never'}:{})});
  d.display.formats[key]={intent:'Permit and call',fields:[field('permitSingle.details.token','Token'),field('permitSingle.details.amount','Amount'),
    field('permitSingle.details.expiration','Approval expires'),field('permitSingle.spender','Spender'),field('permitSingle.details.nonce','Nonce',true),
    field('permitSingle.sigDeadline','Signature deadline',true),field('signature','Signature',true)]} as any;
  assert.deepEqual(permitWarnings(c,d),[],'nonce, signature deadline and signature may be hidden');
  (d.display.formats[key].fields as any[])[1].visible='never';
  assert.equal(permitWarnings(c,d).length,1);assert.match(permitWarnings(c,d)[0],/hides permitSingle\.details\.amount, the approved amount/);
});

await test('signatures that are not token permits are left alone',()=>{
  // A signed quote with a deadline (LI.FI-style bridge data), a vote by signature, a session revocation.
  assert.equal(of('startBridge((address receiver,uint256 deadline,bytes signature) data)'),undefined);
  assert.equal(of('castVoteBySig(uint256 proposalId,uint8 support,uint8 v,bytes32 r,bytes32 s)')?.grants.length,0);
  assert.equal(of('revokeSessionBySig(address session,uint256 deadline,bytes signature)'),undefined);
  // A Lido-style permit struct: value is a grant, the signature's own deadline is not.
  assert.deepEqual(of('requestWithdrawalsWithPermit(uint256[] _amounts,address _owner,(uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s) _permit)')?.grants,[{path:'_permit.value',what:'approved amount'}]);
});
