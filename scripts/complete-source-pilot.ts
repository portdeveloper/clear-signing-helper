import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import TOML from '@iarna/toml';
import {Interface, ParamType, FunctionFragment} from 'ethers';

const [projectRoot, contractId, deployedAddress, chainIdText, installedCLI, evidenceOut] = process.argv.slice(2);
if (!projectRoot || !contractId || !deployedAddress || !chainIdText || !installedCLI || !evidenceOut) {
  console.error('Usage: tsx scripts/complete-source-pilot.ts <projectRoot> <contractID> <deployedAddress> <chainID> <installedCLIPath> <evidenceOut>');
  process.exit(2);
}
const root = path.resolve(projectRoot), out = path.resolve(evidenceOut), chainId = Number(chainIdText);
if (!fs.existsSync(root) || !fs.existsSync(installedCLI)) throw Error('project root and installed CLI must exist');
if (fs.existsSync(out)) throw Error(`evidence directory already exists: ${out}`);
fs.mkdirSync(out, {recursive:true});
for (const file of ['foundry.toml','hardhat.config.js','hardhat.config.ts','package.json']) { const src=path.join(root,file); if (fs.existsSync(src)) fs.copyFileSync(src,path.join(out,`source-${file}`)); }
const depLines = spawnSync('git',['-C',root,'submodule','status','--recursive'],{encoding:'utf8'}).stdout ?? '';
fs.writeFileSync(path.join(out,'dependency-provenance.txt'), `root ${spawnSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).stdout ?? ''}${depLines}`);
const steps: {name:string;ms:number;exitCode:number}[] = [];
let reuseBuild = false;
let fixtureCount = 0;
process.on('exit', () => { try { fs.writeFileSync(path.join(out, 'timings.json'), JSON.stringify({projectRoot,contractId,deployedAddress,chainId,installedCLI,fixtureCount,steps}, null, 2)+'\n'); } catch {} });
function run(name:string, args:string[]) {
  const start = Date.now();
  const r = spawnSync(process.execPath, [installedCLI, '--root', root, '--json', ...(reuseBuild?['--no-build']:[]), ...args], {cwd:root, encoding:'utf8', timeout:660_000, maxBuffer:64*1024*1024});
  const ms = Date.now()-start, exitCode = r.status ?? 1;
  fs.writeFileSync(path.join(out, `${name}.log`), `${r.stdout ?? ''}${r.stderr ?? ''}`);
  steps.push({name, ms, exitCode});
  if (exitCode !== 0) throw Error(`${name} failed (${exitCode}); see ${name}.log`);
  return JSON.parse(r.stdout || '{}').result;
}
function findArtifact(): any {
  const walk=(d:string):string[]=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  const [sourceName, contractName] = contractId.split(':');
  const file = walk(path.join(root,'out')).find(f=>{ if (path.basename(f)!==`${contractName}.json`) return false; const a=JSON.parse(fs.readFileSync(f,'utf8')); const target=Object.entries(a.metadata?.settings?.compilationTarget??{})[0]; return !!a.abi && !!target && target[0]===sourceName && target[1]===contractName; });
  if (!file) throw Error(`artifact not found for ${contractId}`);
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function value(p:ParamType, depth=0):any {
  if (p.baseType==='array') { const n=p.arrayLength == null || p.arrayLength < 0 ? 2 : p.arrayLength; return Array.from({length:n},()=>value(p.arrayChildren!,depth+1)); }
  if (p.baseType==='tuple') return p.components!.map(c=>value(c,depth+1));
  if (p.type==='address') return '0x0000000000000000000000000000000000000001';
  if (p.type==='bool') return false;
  if (p.type==='string') return 'pilot';
  if (p.type==='bytes') return '0xabcd';
  if (p.type.startsWith('bytes')) return '0x'+'ab'.repeat(Number(p.type.slice(5)));
  if (p.type.startsWith('int')) return '-3';
  return '7';
}
const init = run('init', ['init','--contract',contractId,'--owner','Independent pilot']);
reuseBuild = true;
const configPath=path.join(root,'clear-signing.toml'), config:any=TOML.parse(fs.readFileSync(configPath,'utf8').toString());
const selected=config.contracts.find((c:any)=>c.id===contractId); if (!selected) throw Error('init did not select contract');
const descriptorPath=path.join(root,selected.descriptor), descriptor:any=JSON.parse(fs.readFileSync(descriptorPath,'utf8'));
descriptor.context.contract.deployments=[{chainId,address:deployedAddress}];
for (const [signature, format] of Object.entries<any>(descriptor.display.formats)) format.intent=`Pilot ${format.intent}`;
const abi=findArtifact().abi, iface=new Interface(abi);
const special=(abi as any[]).filter(x=>x.type==='receive'||x.type==='fallback').map(x=>`${x.type}()`);
selected.exclusions={...(selected.exclusions??{})}; for(const s of special) selected.exclusions[s]='Unsupported entrypoint excluded by independent pilot; no fixture or signing claim.';
if (contractId === 'contracts/SwapRouter.sol:SwapRouter') {
  const callback = 'uniswapV3SwapCallback(int256,int256,bytes)';
  selected.exclusions[callback] = 'Pool-invoked callback, outside this user-operation pilot; signed integers are excluded by the first-release portability policy.';
  for (const key of Object.keys(descriptor.display.formats)) if (FunctionFragment.from('function '+key).format('sighash') === callback) delete descriptor.display.formats[key];
}
fs.writeFileSync(descriptorPath, JSON.stringify(descriptor,null,2)+'\n'); fs.writeFileSync(configPath,TOML.stringify(config));
fs.writeFileSync(path.join(out,'edit.json'),JSON.stringify({descriptor:selected.descriptor,intentPrefix:'Pilot ',deployment:{chainId,address:deployedAddress},exclusions:selected.exclusions},null,2)+'\n');
const writeFns=iface.fragments.filter((f:any)=>f.type==='function'&&!['view','pure'].includes(f.stateMutability)&&!selected.exclusions[f.format('sighash')]);
for (const f of writeFns as any[]) {
  const args=f.inputs.map((p:ParamType)=>value(p));
  run(`fixture-${f.name}-${f.selector.slice(2)}`,['fixture','--name',`pilot-${f.name}-${f.selector.slice(2)}`,'--contract',contractId,'--function',f.format('sighash'),'--args',JSON.stringify(args),'--chain-id',String(chainId),'--to',deployedAddress]);
}
const fixtures=fs.readdirSync(path.join(root,'clear-signing/fixtures')).filter(f=>f.startsWith('pilot-')&&f.endsWith('.json'));
fixtureCount = fixtures.length;
for(const fixture of fixtures) run(`preview-${fixture.slice(0,-5)}`,['preview','--fixture',`clear-signing/fixtures/${fixture}`]);
run('review',['review','--accept']); run('test-update',['test','--update']); run('test',['test']); run('check-strict',['check','--strict-portability']); run('export-strict',['export','--strict-portability','--out','pilot-bundle']);
fs.writeFileSync(path.join(out,'timings.json'),JSON.stringify({projectRoot,contractId,deployedAddress,chainId,installedCLI,fixtureCount:fixtures.length,steps},null,2)+'\n');
console.log(JSON.stringify({ok:true,fixtureCount:fixtures.length,steps},null,2));
