import fs from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';
import { Interface } from 'ethers';
import { loadProject, defaultContracts, getContract, type Project } from './foundry.js';
import { ENGINE, scaffold, scaffoldFormat, signature, parseSignature, validateDescriptor, reviewQuestions, type Descriptor, type Selection } from './descriptors.js';
import {portabilityFindings, PORTABILITY_REFERENCE} from './portability.js';
import { canonical, hash, readJson, readText, safePath, writeJson, writeText, walk, assertKeys, fail, Failure, type Diagnostic } from './io.js';
import { renderFixture, validateFixture, blockingWarnings, type Fixture, type Rendering } from './fixtures.js';
import { registryTests } from './registry.js';

export interface Config {version: number; profile: string; engine: string; contracts: Selection[]}
export interface Options {root?: string; profile?: string; build?: boolean}
export interface State {project: Project; config: Config; descriptors: Map<string, Descriptor>; review: Record<string, {fingerprint: string; questions?: unknown}>}
const configName = 'clear-signing.toml';
const reviewName = 'clear-signing/review.json';
function saveConfig(project: Project, config: Config) { writeText(safePath(project.root, configName), TOML.stringify(config as any)); }
function configFrom(root: string, allowUpgrade = false): Config {
  let c: Config;
  try { c = TOML.parse(readText(safePath(root, configName))) as unknown as Config; } catch(e) { if (e instanceof Failure) throw e; fail('INVALID_CONFIG', `Invalid ${configName}: ${(e as Error).message}`, 2); }
  assertKeys(c, ['version','profile','engine','contracts'], 'config');
  if (c.version !== 1 || typeof c.profile !== 'string' || (!allowUpgrade && c.engine !== hash(ENGINE))) fail('CONFIG_VERSION', 'Configuration engine/profile is incompatible. Run upgrade to adopt this engine, then inspect changes and renew review.', 2);
  if (!Array.isArray(c.contracts) || !c.contracts.length) fail('INVALID_CONFIG', 'Select at least one contract with init.', 2);
  const ids = new Set<string>(), files = new Set<string>();
  for (const s of c.contracts) {
    assertKeys(s, ['id','descriptor','exclusions'], 'contract selection');
    if (typeof s.id !== 'string' || typeof s.descriptor !== 'string') fail('INVALID_CONFIG', 'Selections require id and descriptor strings.', 2);
    safePath(root, s.descriptor);
    if (ids.has(s.id) || files.has(path.resolve(root, s.descriptor))) fail('INVALID_CONFIG', 'Contract identities and descriptor paths must be unique.', 2);
    ids.add(s.id); files.add(path.resolve(root, s.descriptor));
    assertKeys(s.exclusions, Object.keys(s.exclusions ?? {}), 'exclusions');
  }
  return c;
}
export function upgrade(options: Options) {
  const root = findProjectRoot(options.root), config = configFrom(root, true);
  if (config.engine === hash(ENGINE)) return {upgraded:false, note:'Configuration already uses this engine.'};
  config.engine = hash(ENGINE);
  writeText(safePath(root, configName), TOML.stringify(config as any));
  writeJson(safePath(root, reviewName), {});
  return {upgraded:true, note:'Engine updated. Descriptors and expectations preserved; inspect previews, then run review --accept and test --update.'};
}
export function loadState(options: Options): State {
  // Resolve the persisted profile before loading artifacts.
  const root = findProjectRoot(options.root);
  const config = configFrom(root);
  const profile = options.profile ?? process.env.FOUNDRY_PROFILE ?? config.profile;
  const project = loadProject({...options, root, profile});
  const descriptors = new Map(config.contracts.map(s => [s.id, readJson<Descriptor>(safePath(root, s.descriptor))]));
  const reviewFile = safePath(root, reviewName);
  const review = fs.existsSync(reviewFile) ? readJson(reviewFile) : {};
  assertKeys(review, Object.keys(review ?? {}), 'review');
  return {project, config, descriptors, review};
}
import { findRoot as findProjectRoot } from './foundry.js';
export function init(options: Options & {contract?: string[]; owner?: string}) {
  const project = loadProject(options);
  const configFile = safePath(project.root, configName);
  const existing = fs.existsSync(configFile);
  const config: Config = existing ? configFrom(project.root) : {version: 1, profile: project.profile, engine: hash(ENGINE), contracts: []};
  const selected = options.contract?.length ? options.contract.map(id => getContract(project,id)) : defaultContracts(project);
  if (!selected.length) fail('NO_CONTRACTS', 'No production contracts found. Pass --contract path:Name after a successful forge build.', 2);
  const writes: {file: string; descriptor: Descriptor}[] = [];
  for (const c of selected) {
    if (config.contracts.some(s => s.id === c.id)) continue;
    const file = `clear-signing/descriptors/calldata-${c.name}-${hash(c.id).slice(0,8)}.json`;
    if (fs.existsSync(safePath(project.root, file))) fail('FILE_EXISTS', `Refusing to overwrite ${file}.`, 2);
    const descriptor = scaffold(c, options.owner ?? path.basename(project.root));
    config.contracts.push({id: c.id, descriptor: file, exclusions: {}});
    writes.push({file, descriptor});
  }
  for (const {file, descriptor} of writes) writeJson(safePath(project.root, file), descriptor);
  if (writes.length || !existing) saveConfig(project, config);
  const reviewFile = safePath(project.root, reviewName);
  if (!fs.existsSync(reviewFile)) writeJson(reviewFile, {});
  return {created: writes.map(w => w.file), contracts: config.contracts, next: 'Inspect action labels and field formats, create transaction fixtures with fixture, then run review --accept after inspecting them.', questions: selected.map(c => ({contract:c.id, functions:reviewQuestions(c)}))};
}
export function reviewFingerprint(state: State, selection: Selection) {
  return hash({engine: ENGINE, build: state.project.fingerprint, selection, descriptor: state.descriptors.get(selection.id)});
}
export function diagnostics(state: State, includeReview = true): Diagnostic[] {
  const errors: Diagnostic[] = [];
  for (const s of state.config.contracts) {
    try {
      const c = getContract(state.project, s.id);
      errors.push(...validateDescriptor(state.descriptors.get(s.id)!, c, s));
      if (includeReview && state.review[s.id]?.fingerprint !== reviewFingerprint(state,s)) errors.push({code: 'REVIEW_REQUIRED', message: `${s.id} has new or changed source, descriptors, exclusions, or build settings.`, file: reviewName, remedy: `Inspect the source and signing preview; then run review --contract '${s.id}' --accept.`});
    } catch(e) { if (e instanceof Failure) errors.push({code:e.code,message:e.message}); else throw e; }
  }
  return errors;
}
function throwDiagnostics(errors: Diagnostic[]) { if (errors.length) throw new Failure('CHECK_FAILED', `${errors.length} issue(s) require attention.`, 1, errors); }
export function check(state: State, strictPortability=false) {
  const errors = diagnostics(state);
  throwDiagnostics(errors);
  const findings=state.config.contracts.flatMap(s=>portabilityFindings(s.id,state.descriptors.get(s.id)!));
  if(strictPortability && findings.length)throw new Failure('PORTABILITY_REVIEW', 'Known consumer compatibility issues require target-wallet validation.',1,findings.map(f=>({code:f.code,signature:f.signature,message:`${f.contract} ${f.path}: ${f.message}`,remedy:'Inspect the compatibility report and validate the target wallet. Ordinary check/export remains available for authoring drafts.'})));
  return {contracts: state.config.contracts.map(s => ({contract:s.id, covered:Object.keys(state.descriptors.get(s.id)!.display.formats).length, excluded:Object.entries(s.exclusions).map(([signature,reason])=>({signature,reason}))})), review:'current', deploymentVerification:'not performed',portability:{walletVerification:'not performed',reference:PORTABILITY_REFERENCE,findings}};
}
export function review(state: State, ids: string[] | undefined, accept: boolean) {
  if (!accept) fail('ACKNOWLEDGEMENT_REQUIRED', 'Inspect descriptors, source changes, and previews first. Then pass --accept to record your review. This is not an audit or attestation.', 2);
  const selections = ids?.length ? ids.map(id => {const s=state.config.contracts.find(s=>s.id===id); if(!s) fail('CONTRACT_NOT_SELECTED', `${id} is not selected.`,2); return s;}) : state.config.contracts;
  const errors = selections.flatMap(s => validateDescriptor(state.descriptors.get(s.id)!, getContract(state.project,s.id), s));
  throwDiagnostics(errors);
  for (const s of selections) state.review[s.id] = {fingerprint:reviewFingerprint(state,s), questions:reviewQuestions(getContract(state.project,s.id))};
  writeJson(safePath(state.project.root, reviewName), state.review);
  return {reviewed:selections.map(s=>s.id), note:'Developer acknowledgement recorded. No deployment verification or external attestation performed.'};
}
export function sync(state: State) {
  const writes: {file:string; d:Descriptor}[] = [];
  const added: string[] = [];
  for (const s of state.config.contracts) {
    const c = getContract(state.project, s.id), d=state.descriptors.get(s.id)!;
    // Validate structure before mutation, but allow the coverage/obsolete-reference issues sync addresses.
    const structural = validateDescriptor(d,c,s).filter(e=>!['MISSING_COVERAGE','OBSOLETE_FORMAT','STALE_EXCLUSION','UNSUPPORTED_ENTRYPOINT'].includes(e.code));
    throwDiagnostics(structural);
    const formats = new Set(Object.keys(d.display.formats).map(k=>parseSignature(k).format('sighash')));
    let changed=false;
    for(const f of c.functions) if(!formats.has(f.format('sighash')) && !s.exclusions[f.format('sighash')]) {d.display.formats[signature(f)]=scaffoldFormat(f); added.push(`${s.id} ${f.format('sighash')}`); changed=true;}
    if(changed) writes.push({file:s.descriptor,d});
  }
  for(const w of writes) writeJson(safePath(state.project.root,w.file),w.d);
  return {added, diagnostics:diagnostics(state), note:'Existing fields preserved. Remove obsolete formats explicitly; inspect additions before review --accept.'};
}
export async function preview(state: State, fixturePath: string): Promise<Rendering> {
  const file=safePath(state.project.root,fixturePath), f=readJson<Fixture>(file);
  validateFixture(f);
  const selection=state.config.contracts.find(s=>s.id===f.contract);
  if(!selection) fail('CONTRACT_NOT_SELECTED', `${f.contract} is not selected.`,2);
  const c=getContract(state.project,f.contract), d=state.descriptors.get(f.contract)!;
  throwDiagnostics(validateDescriptor(d,c,selection));
  return renderFixture(f,d,c);
}
export function createFixture(state: State, options: {name:string; contract:string; function:string; args:string; chainId:string; to:string; value:string; from?:string; local:boolean}) {
  if(!/^[a-zA-Z0-9_-]+$/.test(options.name)) fail('INVALID_NAME','Fixture names may contain letters, digits, hyphens and underscores.',2);
  const c=getContract(state.project,options.contract);
  if(!state.config.contracts.some(s=>s.id===c.id)) fail('CONTRACT_NOT_SELECTED', 'Run init --contract for this contract first.',2);
  const iface=new Interface(c.abi);
  let data:string;
  try {const args=JSON.parse(options.args); if(!Array.isArray(args)) throw new Error('--args must be a JSON array'); data=iface.encodeFunctionData(options.function,args);} catch(e) {fail('FIXTURE_ARGUMENTS',`Could not encode arguments: ${(e as Error).message}`,2);}
  const fixture: Fixture={contract:c.id, chainId:Number(options.chainId), to:options.to, data, value:options.value, ...(options.from?{from:options.from}:{}), ...(options.local?{localBinding:true}:{}), tokens:{}, addressNames:{}};
  validateFixture(fixture);
  const file=`clear-signing/fixtures/${options.name}.json`;
  if(fs.existsSync(safePath(state.project.root,file))) fail('FILE_EXISTS',`Refusing to overwrite ${file}.`,2);
  writeJson(safePath(state.project.root,file),fixture);
  return {created:file, next:`Run preview --fixture ${file}. Add local token metadata and address names to the fixture as needed.`};
}
export function fixtureFiles(state: State) {
  return walk(safePath(state.project.root,'clear-signing/fixtures'),'.json').map(file=>path.relative(state.project.root,file));
}
export function expectationPath(fixture: string) {
  if(!fixture.startsWith('clear-signing/fixtures/')) fail('FIXTURE_LOCATION','Test fixtures must live under clear-signing/fixtures/.');
  return fixture.replace('clear-signing/fixtures/','clear-signing/expectations/');
}
export async function runTests(state: State, update=false) {
  const files=fixtureFiles(state);
  if(!files.length) fail('NO_FIXTURES','No fixtures found. Use fixture to create a sample transaction.');
  const errors:Diagnostic[]=[], renders:{file:string; rendering:Rendering}[]=[];
  const updates:{file:string;rendering:Rendering}[]=[];
  for(const file of files) {
    try {
      const r=await preview(state,file);
      const warnings=blockingWarnings(r);
      if(warnings.length) throw new Failure('UNRESOLVED_RENDERING',warnings.map(w=>`${w.code}: ${w.message}`).join('; '));
      const expected=expectationPath(file), target=safePath(state.project.root,expected);
      if(update) updates.push({file:target,rendering:r});
      else if(!fs.existsSync(target)) errors.push({code:'MISSING_EXPECTATION',message:`No expectation for ${file}. Inspect preview, then use test --update.`,file:expected});
      else {
        const before=readJson(target);
        if(canonical(before)!==canonical(r)) errors.push({code:'SNAPSHOT_MISMATCH',message:`Signing output changed.\nExpected:\n${JSON.stringify(before,null,2)}\nActual:\n${JSON.stringify(r,null,2)}`,file:expected,signature:r.signature,remedy:'Inspect the change before accepting it with test --update.'});
      }
      renders.push({file,rendering:r});
    } catch(e) {if(e instanceof Failure) errors.push(...(e.details.length?e.details:[{code:e.code,message:e.message,file}]));else throw e;}
  }
  // No partial acceptance when any fixture fails to render.
  throwDiagnostics(errors);
  for(const u of updates) writeJson(u.file,u.rendering);
  return {passed:renders.length, updated:updates.length, renders};
}
export async function exportBundle(state: State, out: string, strictPortability=false) {
  const {portability}=check(state,strictPortability);
  const tests=await runTests(state);
  const errors:Diagnostic[]=[];
  for(const s of state.config.contracts) {
    const d=state.descriptors.get(s.id)!;
    if(!d.context.contract.deployments.length) errors.push({code:'DEPLOYMENTS_REQUIRED',message:`${s.id} has no production bindings.`,file:s.descriptor});
    for(const key of Object.keys(d.display.formats)) {
      const sig=parseSignature(key).format('sighash');
      if(!tests.renders.some(r=>r.rendering.contract===s.id && r.rendering.signature===sig)) errors.push({code:'FIXTURE_COVERAGE',message:`${s.id} ${sig} needs a passing fixture.`,signature:sig});
    }
  }
  for(const r of tests.renders) if(r.rendering.localBinding) errors.push({code:'LOCAL_BINDING_EXPORT',message:'Local-only fixtures cannot be exported. Supply real descriptor bindings and remove localBinding.',file:r.file});
  throwDiagnostics(errors);
  const target=safePath(state.project.root,out);
  if(fs.existsSync(target)) fail('OUTPUT_EXISTS',`Refusing to overwrite ${out}. Choose a new output directory.`,2);
  const stage=safePath(state.project.root,`${out}.tmp-${process.pid}`);
  if(fs.existsSync(stage)) fail('OUTPUT_EXISTS',`Staging directory already exists: ${stage}`,2);
  fs.mkdirSync(stage,{recursive:true});
  try {
    const names=new Set<string>();
    for(const s of state.config.contracts) {
      const name=path.basename(s.descriptor);
      if(names.has(name)) fail('EXPORT_COLLISION',`Duplicate descriptor filename ${name}.`);
      names.add(name); writeJson(path.join(stage,name),state.descriptors.get(s.id));
      const fixtures = tests.renders.filter(r=>r.rendering.contract===s.id).map(r=>({name:r.file,fixture:readJson<Fixture>(safePath(state.project.root,r.file)),rendering:r.rendering}));
      if(fixtures.length) writeJson(path.join(stage,'testsv2',name.replace(/\.json$/,'.tests.json')),registryTests(name,state.descriptors.get(s.id)!,fixtures));
    }
    for(const r of tests.renders) {
      const name=path.relative('clear-signing/fixtures',r.file);
      writeJson(path.join(stage,'fixtures',name),readJson(safePath(state.project.root,r.file)));
      writeJson(path.join(stage,'renderings',name),r.rendering);
    }
    writeJson(path.join(stage,'validation.json'),{engine:ENGINE, contracts:state.config.contracts.map(s=>({id:s.id,descriptor:path.basename(s.descriptor),exclusions:s.exclusions})),fixtures:tests.passed, deploymentVerification:'not performed',publication:'not submitted'});
    writeJson(path.join(stage,'portability.json'),portability);
    writeText(path.join(stage,'README.md'),'# Clear-signing submission bundle\n\nDescriptors use the pinned ERC-7730 v2 schema. The testsv2 files contain unsigned sample transactions and expected signing output in the registry v2 test format, validated against its pinned schema. The fixtures and renderings directories retain the original local review examples. Read portability.json for known consumer limitations; a passing local test is not wallet certification. Copy descriptors and testsv2 into registry/<entity>/ when submitting.\n\nVerify deployed code and proxy mappings independently. Open a registry pull request with descriptors and examples: https://clearsigning.org/build/ . Registry review, attestations, and wallet availability are separate steps.\n');
    fs.renameSync(stage,target);
  } catch(e) {fs.rmSync(stage,{recursive:true,force:true});throw e;}
  return {exported:out,descriptors:state.config.contracts.length,fixtures:tests.passed, deploymentVerification:'not performed',publication:'not submitted',portability};
}
