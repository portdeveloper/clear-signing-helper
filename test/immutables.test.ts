import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { namedImmutables } from '../src/immutables.js';

// A trimmed real Sourcify record: PuddleSwap StakingRewards on Monad testnet, whose immutables are
// rewardsToken (WMON) and stakingToken (the USDC/WMON pair).
const record=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'fixtures/sourcify-staking-rewards.json'),'utf8'));
const copy=()=>JSON.parse(JSON.stringify(record));
test('the verified source map names each address immutable, and the value comes from the verified bytecode',()=>{
  assert.deepEqual(namedImmutables(record,record.abi),[
    {name:'rewardsToken',address:'0x97B3070F9Da6C002343862b35E68Bd8e22608943'},
    {name:'stakingToken',address:'0x1FBC7b6B54726D735fF1B47Df75535B4B9021902'}]);
});
test('an immutable is left unnamed unless every reference agrees, its value is an address, and the ABI has its getter',()=>{
  // References that map to different names: the source no longer matches the map, so nothing is guessed.
  const renamed=copy(),file=renamed.sources['src/StakingRewards.sol'];
  file.content=file.content.replace(/rewardsToken\.safeTransfer/,'rewardsTokeX.safeTransfer');
  assert.ok(file.content.includes('rewardsTokeX'),'fixture still reads rewardsToken in a function body');
  assert.deepEqual(namedImmutables(renamed,renamed.abi).map(x=>x.name),['stakingToken']);
  // Without the public getter a reviewer could not read the value back.
  assert.deepEqual(namedImmutables(record,record.abi.filter((f:any)=>f.name!=='stakingToken')).map(x=>x.name),['rewardsToken']);
  // No value for the id (Sourcify keys some values under other ids): skipped, not paired by position.
  const unkeyed=copy();const [id]=Object.keys(unkeyed.runtimeBytecode.immutableReferences);delete unkeyed.runtimeBytecode.transformationValues.immutables[id];
  assert.equal(namedImmutables(unkeyed,unkeyed.abi).length,1);
  // A value that is not an address.
  const wide=copy();for(const k of Object.keys(wide.runtimeBytecode.transformationValues.immutables)) wide.runtimeBytecode.transformationValues.immutables[k]='0x'+'ff'.repeat(32);
  assert.deepEqual(namedImmutables(wide,wide.abi),[]);
  // An Etherscan match or a partial record carries no source map.
  assert.deepEqual(namedImmutables({abi:record.abi},record.abi),[]);
  const nomap=copy();delete nomap.runtimeBytecode.sourceMap;assert.deepEqual(namedImmutables(nomap,nomap.abi),[]);
});
