// Read-only evidence check for this pinned production-readiness exercise.
// Input: Foundry artifact and Sourcify's `?fields=all` response saved locally.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {AbiCoder, Interface, id, keccak256} from 'ethers';
const [artifactPath,responsePath]=process.argv.slice(2);
if(!artifactPath||!responsePath)throw Error('Usage: npx tsx scripts/check-morpho-deployment.ts artifact.json sourcify-response.json');
const artifact=JSON.parse(fs.readFileSync(artifactPath,'utf8'));
const reference=JSON.parse(fs.readFileSync(responsePath,'utf8'));
const address='0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
assert.equal(reference.address.toLowerCase(),address.toLowerCase());
assert.equal(Number(reference.chainId),1);
assert.equal(reference.match,'exact_match');
assert.equal(artifact.metadata.compiler.version,reference.compilation.compilerVersion);
const signatures=(abi:any)=>new Interface(abi).fragments.filter(f=>f.type==='function').map(f=>f.format('full')).sort();
assert.deepEqual(signatures(artifact.abi),signatures(reference.abi));
function executable(hex:string) {
  const bytes=Buffer.from(hex.replace(/^0x/,''),'hex');
  const auxLength=bytes.readUInt16BE(bytes.length-2);
  assert.ok(auxLength>0&&auxLength+2<bytes.length);
  return bytes.subarray(0,bytes.length-auxLength-2);
}
const local=executable(artifact.deployedBytecode.object);
const recompiled=executable(reference.runtimeBytecode.recompiledBytecode);
assert.deepEqual(local,recompiled,'Executable instructions must match exactly, before immutable substitution');
const immutableRanges=(refs:any)=>Object.values(refs).flat().sort((a:any,b:any)=>a.start-b.start);
const ranges=immutableRanges(artifact.deployedBytecode.immutableReferences) as {start:number;length:number}[];
assert.deepEqual(ranges,immutableRanges(reference.runtimeBytecode.immutableReferences));
assert.equal(ranges.length,2);
const domain=keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256','address'],[id('EIP712Domain(uint256 chainId,address verifyingContract)'),1,address]));
const bound=Buffer.from(local);
for(const range of ranges) {
  assert.equal(range.length,32);
  assert.ok(range.start+range.length<=bound.length);
  Buffer.from(domain.slice(2),'hex').copy(bound,range.start);
}
assert.deepEqual(bound,executable(reference.runtimeBytecode.onchainBytecode),'Actual constructor-derived immutables must reproduce Sourcify stored on-chain runtime');
console.log(JSON.stringify({
  source:`https://sourcify.dev/server/v2/contract/1/${address}?fields=all`,
  chainId:1,address,compiler:reference.compilation.compilerVersion,match:reference.match,
  compiledFunctionAbiMatches:true,executableBytes:local.length,
  compiledRuntimeMatchesVerifiedRecompilation:true,
  constructorDomainSeparator:domain,immutableRanges:ranges,
  boundRuntimeMatchesSourcifyStoredOnchainRuntime:true,
  boundRuntimeKeccak256:keccak256(bound),
  deployment:reference.deployment,
  metadataExcluded:true,
  limitation:'Read-only comparison against Sourcify response; no independent live RPC verification, proxy discovery, or CLI deployment-verification feature.'
},null,2));
