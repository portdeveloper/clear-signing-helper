import {FunctionFragment, Interface, ParamType, getAddress} from 'ethers';
import fs from 'node:fs';
import type {Contract} from '../src/foundry.js';
export interface RegistryEntry {file:string;owner:string;signatures:string[];deployments:{chainId:number;address:string}[];tests:{description:string;rawTx:string;txHash?:string;from?:string;chainId:number;to:string;data:string;value:string}[]}
export const corpus=JSON.parse(fs.readFileSync(new URL('./fixtures/registry/corpus.json',import.meta.url),'utf8')) as {commit:string;eip712Descriptors:number;descriptors:RegistryEntry[]};
export function registryContract(entry:RegistryEntry,payable=false):Contract {
  const functions=entry.signatures.map(key=>FunctionFragment.from(`function ${key}${payable?' payable':''}`));
  return {id:'src/Registry.sol:Registry',name:'Registry',source:'src/Registry.sol',artifact:'',abi:JSON.parse(new Interface(functions).formatJson()),functions,special:[],metadata:{}};
}
export function sample(p:ParamType,i=0):any {
  if(p.baseType==='array')return Array.from({length:p.arrayLength===-1?2:p.arrayLength!},(_,j)=>sample(p.arrayChildren!,j+1));
  if(p.baseType==='tuple')return p.components!.map((c,j)=>sample(c,j));
  if(p.type==='address')return '0x'+(i+1).toString(16).padStart(40,'0');
  if(p.type==='bool')return i%2===0;
  if(p.type==='string')return 'registry sample';
  if(p.type==='bytes')return '0x1234';
  if(p.type.startsWith('bytes'))return '0x'+'01'.repeat(Number(p.type.slice(5)));
  return String(p.type.startsWith('int')?-(i+1):i+1);
}
export function rawValues(p:ParamType,v:any):string[] {
  if(p.baseType==='array')return Array.from(v as any[]).flatMap(x=>rawValues(p.arrayChildren!,x));
  if(p.baseType==='tuple')return p.components!.flatMap((c,i)=>rawValues(c,v[i]));
  return [p.type==='address'?getAddress(v):String(v)];
}
export function renderedValues(fields:any[]):string[] {return fields.flatMap(f=>f.fields?renderedValues(f.fields):[f.value]);}
// ABI-shape harnesses exercise real Forge artifacts without pretending that
// these no-op functions are the deployed protocol implementations.
export function harness(functions:FunctionFragment[],name:string) {
  const structs:string[]=[];let serial=0;
  const type=(p:ParamType):string=>{
    if(p.baseType==='array')return `${type(p.arrayChildren!)}[${p.arrayLength===-1?'':p.arrayLength}]`;
    if(p.baseType==='tuple') {const n=`Tuple${serial++}`;const fields=p.components!.map((c,i)=>`${type(c)} ${c.name||`arg${i}`};`).join('\n');structs.push(`struct ${n} { ${fields} }`);return n;}
    return p.type;
  };
  const methods=functions.map(f=>`function ${f.name}(${f.inputs.map((p,i)=>`${type(p)}${p.baseType==='array'||p.baseType==='tuple'||p.type==='bytes'||p.type==='string'?' calldata':''} ${p.name||`arg${i}`}`).join(',')}) external${f.stateMutability==='payable'?' payable':''} {}`);
  return `// SPDX-License-Identifier: CC0-1.0\npragma solidity 0.8.28;\n// ABI-shape validation harness, not protocol implementation.\ncontract ${name} {\n${structs.join('\n')}\n${methods.join('\n')}\n}\n`;
}
