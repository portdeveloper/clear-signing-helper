import fs from 'node:fs';
import path from 'node:path';
import {Interface,FunctionFragment} from 'ethers';
import {scaffold} from '../src/descriptors.js';
import {corpus,registryContract} from '../test/registry-helpers.js';
const target=path.resolve('examples/registry-basic');fs.mkdirSync(target,{recursive:true});
const verified=JSON.parse(fs.readFileSync('test/fixtures/registry/verified-abis.json','utf8'));
for(const entry of verified) {
  const original=corpus.descriptors.find(d=>d.file===entry.registryFile)!;
  const functions=new Interface(entry.abi).fragments.filter((f):f is FunctionFragment=>f.type==='function'&&!['view','pure'].includes((f as FunctionFragment).stateMutability));
  const c={id:'verified-abi',name:path.basename(entry.registryFile,'.json').replace(/^calldata-/,''),source:'',artifact:'',abi:entry.abi,functions,special:[],metadata:{}};
  const descriptor=scaffold(c,original.owner);descriptor.context.contract.deployments=[{chainId:entry.chainId,address:entry.address}];
  fs.writeFileSync(path.join(target,path.basename(entry.registryFile)),JSON.stringify(descriptor,null,2)+'\n');
}
for(const file of ['registry/feral-file/calldata-feralfile-vault-0.json','registry/ekubo/calldata-MEVCaptureRouter.json','registry/okx/calldata-OkxDexRouterV1.0.8-suffix-compat.json','registry/paraswap/calldata-AugustusSwapper-v5.json']) {
  const original=corpus.descriptors.find(d=>d.file===file)!;
  const c=registryContract(original);c.name=path.basename(file,'.json').replace(/^calldata-/,'');
  fs.writeFileSync(path.join(target,path.basename(file)),JSON.stringify(scaffold(c,original.owner),null,2)+'\n');
}
console.log('Generated 4 verified-ABI basic descriptors and 4 unbound complex ABI-shape drafts. All require semantic review.');
