import type {ParamType} from 'ethers';
import {parseSignature, type Descriptor} from './descriptors.js';

export interface PortabilityFinding {code:string;contract:string;signature:string;path:string;message:string}
export const PORTABILITY_REFERENCE = {
  testedOn:'2026-09-08',
  sourcifyRenderer:'0.2.2 (unpatched)',
  rustRunnerCommit:'10605ba78f3d6f3f13102e0f3a3ecbc44ac500dc',
  ledgerSdkCommit:'2e35ed527c1a9aee852809a39ed2eaf76a415af1',
  ledgerEthereumApp:'1.22.3',
  ledgerDevices:['flex','stax'],
  scope:'Conservative known-issue checks; an empty finding list does not certify any wallet or runtime.'
};
// Findings describe observed failure classes in pinned consumers, not universal
// ERC-7730 validity or a claim that other shapes are verified on every wallet.
export function portabilityFindings(contract:string, descriptor:Descriptor):PortabilityFinding[] {
  const findings:PortabilityFinding[]=[];
  for(const key of Object.keys(descriptor.display.formats)) {
    const fn=parseSignature(key),signature=fn.format('sighash');
    const add=(code:string,path:string,message:string)=>findings.push({code,contract,signature,path,message});
    const leafCount=(p:ParamType):number=>p.baseType==='array'?leafCount(p.arrayChildren!):p.baseType==='tuple'?p.components!.reduce((n,c)=>n+leafCount(c),0):1;
    const visit=(p:ParamType,path:string,arrayDepth=0)=>{
      if(p.baseType==='array') {
        if(arrayDepth===1)add('NESTED_ARRAY_PORTABILITY',path,'Nested arrays failed the pinned Sourcify and Rust registry runners. A successful local preview does not establish exported compatibility.');
        const child=p.arrayChildren!;
        if(child.baseType==='tuple' && leafCount(child)>1)add('ARRAY_ORDER_PORTABILITY',path,'Ledger Flex and Stax Ethereum 1.22.3 displayed tuple-array members by field, despite sequential grouping. Verify that each tuple stays paired on your target wallet.');
        visit(child,path+'.[]',arrayDepth+1);
      } else if(p.baseType==='tuple')p.components!.forEach((c,i)=>visit(c,path+'.'+(c.name||`arg${i}`),arrayDepth));
      else if(/^int\d+$/.test(p.type))add('SIGNED_INTEGER_PORTABILITY',path,'Unpatched Sourcify 0.2.2 misrendered the tested negative int128; the pinned Rust runner misrendered int128 and int256. The helper renderer fix does not travel with exported JSON.');
    };
    fn.inputs.forEach((p,i)=>visit(p,p.name||`arg${i}`));
  }
  return findings;
}
