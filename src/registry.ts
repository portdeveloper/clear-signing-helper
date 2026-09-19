import { Ajv } from 'ajv';
import { Transaction } from 'ethers';
import testSchema from '../schemas/erc7730-tests-v2.schema.json' with {type:'json'};
import type { Fixture, Rendering } from './fixtures.js';
import type { Descriptor } from './descriptors.js';
import { canonical, fail } from './io.js';
const validate = new Ajv({strict:false, allErrors:true}).compile(testSchema);
export function registryTests(descriptorName: string, descriptor: Descriptor, fixtures: {name:string;fixture:Fixture;rendering:Rendering}[]) {
  const tokens: Record<string,unknown>={}, addressNames: Record<string,string>={}, ensNames: Record<string,string>={}, nftCollectionNames: Record<string,string>={}, blockTimestamps: Record<string,number>={};
  function merge(target: Record<string,unknown>, values: Record<string,unknown>) {
    for (const [key,value] of Object.entries(values)) {
      const address=key.toLowerCase();
      if(address in target && canonical(target[address])!==canonical(value)) fail('EXPORT_METADATA_CONFLICT', `Fixtures for ${descriptorName} disagree on local metadata for ${address}. Use consistent metadata or separate descriptors.`);
      target[address]=value;
    }
  }
  const fields=(list:any[]):{label:string;value:string}[]=>list.flatMap(f=>f.fields?fields(f.fields):[{label:f.label,value:f.value}]);
  const tests=fixtures.map(({name,fixture:f,rendering:r})=>{
    merge(tokens,f.tokens??{});merge(addressNames,f.addressNames??{});merge(ensNames,f.ensNames??{});merge(nftCollectionNames,f.nftCollectionNames??{});
    for (const [height,ts] of Object.entries(f.blockTimestamps??{})) { if (height in blockTimestamps && blockTimestamps[height]!==ts) fail('EXPORT_METADATA_CONFLICT', `Fixtures for ${descriptorName} disagree on block timestamp ${height}.`); blockTimestamps[height]=ts; }
    const tx=Transaction.from({type:2,chainId:f.chainId,to:f.to,data:f.data,value:BigInt(f.value),nonce:0,gasLimit:1_000_000n,maxFeePerGas:0,maxPriorityFeePerGas:0});
    // Registry convention: "<what> - chain <id>". Fixture names are unique within a project.
    const description=`${name.replace(/^clear-signing\/fixtures\//,'').replace(/\.json$/,'')} - chain ${f.chainId}`;
    return {description,rawTx:tx.unsignedSerialized,...(f.from?{from:f.from}:{}),expected:{intent:r.intent,owner:descriptor.metadata.owner,fields:fields(r.fields)}};
  });
  const result={$schema:'../../../specs/erc7730-tests-v2.schema.json',descriptor:`../${descriptorName}`,dataProvider:{tokens,addressNames,...(Object.keys(ensNames).length?{ensNames}:{}),...(Object.keys(nftCollectionNames).length?{nftCollectionNames}:{}),...(Object.keys(blockTimestamps).length?{blockTimestamps}:{})},tests};
  if(!validate(result)) fail('REGISTRY_TEST_SCHEMA', `Generated registry test does not satisfy pinned schema: ${JSON.stringify(validate.errors)}`);
  return result;
}
