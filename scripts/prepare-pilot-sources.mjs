import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

if (!process.argv[2]) throw Error('Usage: node scripts/prepare-pilot-sources.mjs <new-source-parent>');
const out = path.resolve(process.argv[2]);
if (fs.existsSync(out)) throw Error(`Output directory must be new: ${out}`);
fs.mkdirSync(out, {recursive:true});
const run=(cmd,args,cwd)=>execFileSync(cmd,args,{cwd,stdio:'inherit'});
const checkout=(url,commit,target)=>{ run('git',['clone','--quiet',url,target]); run('git',['checkout','--quiet','--detach',commit],target); };
const oz=path.join(out,'openzeppelin-contracts');
checkout('https://github.com/OpenZeppelin/openzeppelin-contracts.git','dbb6104ce834628e473d2173bbc9d47f81a9eec3',oz);
const ozConfig=fs.readFileSync(new URL('../docs/evidence/pilots/luna-completed-2026-09-08/openzeppelin-contracts-foundry.toml',import.meta.url),'utf8');
fs.writeFileSync(path.join(oz,'foundry.toml'),ozConfig.replace('[profile.default]','[profile.default]\nsolc = \'0.8.33\''));
const uni=path.join(out,'uniswap-v3-periphery');
checkout('https://github.com/Uniswap/v3-periphery.git','80f26c86c57b8a5e4b913f42844d4c8bd274d058',uni);
const deps=[
  ['base64-sol','https://github.com/Brechtpd/base64.git','4d85607b18d981acff392d2e99ba654305552a97'],
  ['openzeppelin-contracts','https://github.com/OpenZeppelin/openzeppelin-contracts.git','8e0296096449d9b1cd7c5631e917330635244c37'],
  ['uniswap-lib','https://github.com/Uniswap/solidity-lib.git','c01640b0f0f1d8a85cba8de378cc48469fcfd9a6'],
  ['uniswap-solidity-lib','https://github.com/Uniswap/solidity-lib.git','4cdccd31c5c721d761a11eeacc595b3f8310ce5d'],
  ['v2-core','https://github.com/Uniswap/v2-core.git','816075049f811f1b061bca81d5d040b96f4c07eb'],
  ['v3-core','https://github.com/Uniswap/v3-core.git','e3589b192d0be27e100cd0daaf6c97204fdb1899'],
];
fs.mkdirSync(path.join(uni,'lib'));
for (const [name,url,commit] of deps) checkout(url,commit,path.join(uni,'lib',name));
const adapter=fs.readFileSync(new URL('../docs/evidence/pilots/luna-completed-2026-09-08/uniswap-v3-periphery-foundry.toml',import.meta.url),'utf8');
fs.writeFileSync(path.join(uni,'foundry.toml'),adapter.replace('[profile.default]','[profile.default]\nsolc = \'0.7.6\''));
for (const [project, expected] of [[oz,'0.8.33'],[uni,'0.7.6']]) {
  const config=JSON.parse(execFileSync('forge',['config','--json'],{cwd:project,encoding:'utf8'}));
  if (!String(config.solc).includes(expected)) throw Error(`forge config did not select solc ${expected} for ${project}: ${config.solc}`);
}
const provenance={openzeppelin:{repository:'https://github.com/OpenZeppelin/openzeppelin-contracts',commit:'dbb6104ce834628e473d2173bbc9d47f81a9eec3',solc:'0.8.33'},uniswap:{repository:'https://github.com/Uniswap/v3-periphery',commit:'80f26c86c57b8a5e4b913f42844d4c8bd274d058',solc:'0.7.6',dependencies:deps.map(([name,repository,commit])=>({name,repository,commit})),foundryAdaptation:'copied checked-in evidence adapter; original project is Hardhat'} };
fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({out,provenance},null,2));
