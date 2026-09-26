// Read-only offline extractor of registry display formats, indexed by function selector, for use as
// an advisory prior. Clone the registry separately, then pass its path. Output: src/data/registry-priors.json
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildPriorsIndex} from '../src/priors.js';

const root=path.resolve(process.argv[2]??'');
if(!process.argv[2] || !fs.existsSync(path.join(root,'registry'))) throw Error('Usage: npx tsx scripts/snapshot-priors.ts /path/to/registry-checkout');
const commit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const {bySelector,descriptors,formatKeys:keys,unparsableKeys:unparsable}=buildPriorsIndex(root);
const output={repository:'https://github.com/ethereum/clear-signing-erc7730-registry',commit,generatedAt:new Date().toISOString().slice(0,10),license:'CC0-1.0',scope:'display.formats of every registry calldata descriptor, includes and $ref definitions resolved, indexed by function selector. Advisory prior only.',descriptors,formatKeys:keys,unparsableKeys:unparsable,selectors:Object.keys(bySelector).length,bySelector};
fs.writeFileSync(path.resolve('src/data/registry-priors.json'),JSON.stringify(output)+'\n');
console.log(`Priors ${commit.slice(0,8)}: ${descriptors} descriptors, ${keys} format keys (${unparsable} unparsable), ${Object.keys(bySelector).length} selectors.`);
