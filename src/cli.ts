import { Command, CommanderError } from 'commander';
import { init, loadState, check, review, sync, preview, createFixture, runTests, exportBundle, upgrade } from './app.js';
import { Failure } from './io.js';
import { servePreview } from './preview.js';
import { displayText, humanOutput } from './output.js';
import packageJson from '../package.json' with {type: 'json'};

const program=new Command();
program.name('clear-signing').description('Developer preview: author, preview, and test ERC-7730 descriptors in a Foundry repository.').version(packageJson.version)
  .option('--root <directory>','Foundry project root (searches upward by default)')
  .option('--profile <name>','Foundry profile (defaults to saved configuration)')
  .option('--no-build','Use fingerprint-verified artifacts from an earlier run')
  .option('--json','Emit machine-readable results and diagnostics');
program.exitOverride();
program.configureOutput({writeErr: text=>{if(!process.argv.includes('--json'))process.stderr.write(displayText(text)+'\n');}});
const output=(data:unknown)=>{if(program.opts().json)process.stdout.write(JSON.stringify({ok:true,result:data})+'\n');else process.stdout.write(humanOutput(data)+'\n');};
const select=(value:string,previous:string[])=>[...previous,value];
const state=()=>loadState(program.opts());
program.command('init').description('Discover contracts and create drafts without overwriting authoring')
  .option('--contract <path:name>','Select a contract (repeatable)',select,[])
  .option('--owner <name>','Project owner label')
  .action(options=>output(init({...program.opts(),...options})));
program.command('upgrade').description('Adopt this engine version and invalidate prior review; descriptors are preserved').action(()=>output(upgrade(program.opts())));
program.command('sync').description('Add newly introduced functions while preserving existing formatting').action(()=>output(sync(state())));
program.command('check').description('Check schema, ABI coverage, and review freshness')
  .option('--strict-portability','Fail on known consumer compatibility issues; does not certify wallet support')
  .action(options=>output(check(state(),options.strictPortability===true)));
program.command('review').description('Record developer review of the current source and descriptors')
  .option('--contract <path:name>','Review a selected contract (repeatable)',select,[])
  .option('--accept','Acknowledge that you inspected source changes, labels, units and field visibility')
  .action(options=>output(review(state(),options.contract,options.accept===true)));
program.command('fixture').description('Encode an example transaction from the compiled ABI')
  .requiredOption('--name <name>','Fixture filename without .json')
  .requiredOption('--contract <path:name>','Selected contract identity')
  .requiredOption('--function <signature>','Function name or canonical signature')
  .option('--args <json>','JSON array of arguments; use strings for large integers','[]')
  .requiredOption('--chain-id <number>','Chain ID')
  .requiredOption('--to <address>','Target address')
  .option('--value <wei>','Native transaction value in wei','0')
  .option('--from <address>','Sender for @.from fields')
  .option('--local','Use an explicit undeployed draft binding')
  .action(options=>output(createFixture(state(),{...options,local:options.local===true})));
program.command('preview').description('Render one transaction fixture locally')
  .requiredOption('--fixture <path>','Fixture path relative to the project root')
  .option('--open','Serve on loopback and open a browser')
  .option('--serve','Serve on loopback without opening a browser')
  .action(async options=>{
    const r=await preview(state(),options.fixture);
    if(options.open||options.serve) {const server=await servePreview(r,options.open===true);output({url:server.url,rendering:r});process.once('SIGINT',()=>{server.close();});process.once('SIGTERM',()=>{server.close();});}
    else output(r);
  });
program.command('test').description('Compare fixture renderings against checked-in expectations')
  .option('--update','Explicitly accept current renderings as expectations')
  .action(async options=>{const r=await runTests(state(),options.update===true);output({passed:r.passed,updated:r.updated});});
program.command('export').description('Validate and write a submission bundle; does not publish')
  .requiredOption('--out <directory>','New output directory inside the project')
  .option('--strict-portability','Fail on known consumer compatibility issues before writing a bundle')
  .action(async options=>output(await exportBundle(state(),options.out,options.strictPortability===true)));
try {await program.parseAsync();} catch(e) {
  if(e instanceof CommanderError && e.exitCode===0) process.exitCode=0;
  else {
    const error=e instanceof Failure ? e : e instanceof CommanderError ? new Failure('USAGE_ERROR',e.message,2) : new Failure('UNEXPECTED_ERROR',(e as Error).message,2);
    if(program.opts().json||process.argv.includes('--json'))process.stdout.write(JSON.stringify({ok:false,diagnostics:error.details.length?error.details:[{code:error.code,message:error.message}]})+'\n');
    else {process.stderr.write(`${error.code}: ${displayText(error.message)}\n`);for(const d of error.details)process.stderr.write(`  ${d.code} ${displayText(d.file??'')}${d.signature?` (${displayText(d.signature)})`:''}: ${displayText(d.message)}${d.remedy?`\n    ${displayText(d.remedy)}`:''}\n`);}
    process.exitCode=error.exitCode;
  }
}
