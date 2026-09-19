import { Command, CommanderError } from 'commander';
import { init, loadState, check, review, sync, preview, createFixture, runTests, exportBundle, upgrade } from './app.js';
import { Failure } from './io.js';
import { servePreview } from './preview.js';
import { displayText, humanOutput } from './output.js';
import { addDeployment } from './registry-edit.js';
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
  .option('--contract <path:name>','Select a compiled contract (repeatable)',select,[])
  .option('--owner <name>','Project owner label')
  .option('--abi <file>','ABI mode: import an ABI JSON file instead of Foundry artifacts (repeatable)',select,[])
  .option('--address <address>','ABI mode: fetch the verified ABI for this deployment (Sourcify, then Etherscan with ETHERSCAN_API_KEY)')
  .option('--chain-id <number>','Chain ID for --address')
  .option('--name <ContractName>','Contract name for an imported ABI')
  .action(async options=>output(await init({...program.opts(),...options})));
program.command('upgrade').description('Adopt this engine version and invalidate prior review; descriptors are preserved').action(()=>output(upgrade(program.opts())));
program.command('sync').description('Add newly introduced functions while preserving existing formatting').action(()=>output(sync(state())));
program.command('check').description('Check schema, ABI coverage, and review freshness')
  .option('--contract <path:name>','Check only this selected contract (repeatable)',select,[])
  .option('--strict-portability','Fail on known consumer compatibility issues; does not certify wallet support')
  .action(options=>output(check(state(),options.strictPortability===true,options.contract)));
program.command('review').description('Record developer review of the current source and descriptors')
  .option('--contract <path:name>','Review a selected contract (repeatable)',select,[])
  .option('--accept','Acknowledge that you inspected source changes, labels, units and field visibility')
  .action(options=>output(review(state(),options.contract,options.accept===true)));
program.command('fixture').description('Encode an example transaction from the compiled ABI')
  .requiredOption('--name <name>','Fixture filename without .json')
  .requiredOption('--contract <path:name>','Selected contract identity')
  .option('--function <signature>','Function name or canonical signature')
  .option('--args <json>','JSON array of arguments; use strings for large integers','[]')
  .option('--chain-id <number>','Chain ID')
  .option('--to <address>','Target address')
  .option('--broadcast-tx <hash>','Take chain, target, calldata and value from a recorded broadcast transaction')
  .option('--value <wei>','Native transaction value in wei','0')
  .option('--from <address>','Sender for @.from fields')
  .option('--chain-name <name>','Chain display name for amount/chainId formats (with --native-currency)')
  .option('--native-currency <symbol:decimals>','Native currency for amount formats, e.g. MON:18')
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
  .option('--contract <path:name>','Test only fixtures of this selected contract (repeatable)',select,[])
  .option('--update','Explicitly accept current renderings as expectations')
  .action(async options=>{const r=await runTests(state(),options.update===true,options.contract);output({passed:r.passed,updated:r.updated});});
program.command('export').description('Validate and write a submission bundle; does not publish')
  .requiredOption('--out <directory>','New output directory inside the project')
  .option('--contract <path:name>','Export only this selected contract and its fixtures (repeatable)',select,[])
  .option('--strict-portability','Fail on known consumer compatibility issues before writing a bundle')
  .option('--entity <slug>','Registry folder name under registry/ (defaults to a slug of metadata.owner)')
  .option('--inline-abi','Embed the compiled ABI in context.contract.abi (deprecated by the schema; off by default)')
  .option('--no-lint','Skip running the pinned upstream erc7730 lint')
  .action(async options=>output(await exportBundle(state(),options.out,options.strictPortability===true,options.contract,{entity:options.entity,inlineAbi:options.inlineAbi===true,lint:options.lint!==false})));
const registry=program.command('registry').description('Edit an existing registry clone; never commits or opens pull requests');
registry.command('add-deployment').description('Add a verified deployment (and a rendered test case) to a descriptor already in the registry')
  .requiredOption('--registry <directory>','Path to a clone of ethereum/clear-signing-erc7730-registry')
  .requiredOption('--descriptor <path>','Descriptor path inside the clone, e.g. registry/uniswap/calldata-UniswapV3Router02.json')
  .requiredOption('--chain-id <number>','Chain ID of the new deployment')
  .requiredOption('--address <address>','Deployed address on that chain (a verified proxy is followed to its implementation)')
  .option('--abi <file>','Trust this ABI file instead of fetching the verified one (recorded as unverified)')
  .option('--token <address=SYMBOL:decimals>','Token metadata for the new chain, used by the rendered test (repeatable)',select,[])
  .option('--address-name <address=Name>','Local address name for the new chain, used by the rendered test (repeatable)',select,[])
  .option('--description <text>','Description for the new test case')
  .option('--no-test','Add the deployment only; do not touch testsv2')
  .option('--no-lint','Skip running the pinned upstream erc7730 lint')
  .action(async options=>output(await addDeployment({registry:options.registry,descriptor:options.descriptor,chainId:Number(options.chainId),address:options.address,abiFile:options.abi,tokens:options.token,addressNames:options.addressName,description:options.description,test:options.test!==false,lint:options.lint!==false})));
try {await program.parseAsync();} catch(e) {
  if(e instanceof CommanderError && e.exitCode===0) process.exitCode=0;
  else {
    const error=e instanceof Failure ? e : e instanceof CommanderError ? new Failure('USAGE_ERROR',e.message,2) : new Failure('UNEXPECTED_ERROR',(e as Error).message,2);
    if(program.opts().json||process.argv.includes('--json'))process.stdout.write(JSON.stringify({ok:false,diagnostics:error.details.length?error.details:[{code:error.code,message:error.message}]})+'\n');
    else {
      // Escape control characters per line so genuine line breaks in tool output stay readable.
      const lines=(text:string)=>String(text).split('\n').map(displayText).join('\n');
      process.stderr.write(`${error.code}: ${lines(error.message)}\n`);
      for(const d of error.details)process.stderr.write(`  ${d.code} ${displayText(d.file??'')}${d.signature?` (${displayText(d.signature)})`:''}: ${lines(d.message).replace(/\n/g,'\n    ')}${d.remedy?`\n    ${lines(d.remedy)}`:''}\n`);
    }
    process.exitCode=error.exitCode;
  }
}
