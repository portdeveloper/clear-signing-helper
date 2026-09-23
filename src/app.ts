import fs from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';
import { Interface } from 'ethers';
import { loadProject, defaultContracts, deployedContracts, suggestedContracts, getContract, type Project, type Contract } from './foundry.js';
import { ENGINE, SUPPORTED_FORMATS, scaffoldWithProvenance, scaffoldFormatWithProvenance, enumKeysFor, enumMetadata, signature, parseSignature, leaves, resolveFields, mergeDefinition, joinPath, leafKey, coveredLeaves, validateDescriptor, reviewQuestions, errorsOf, warningsOf, type Descriptor, type Selection, type Provenance, type Field, type Group, type ResolvedField } from './descriptors.js';
import { priorsFor, summarizePrior } from './priors.js';
import { gatherEvidence } from './evidence.js';
import {portabilityFindings, runnerDivergence, PORTABILITY_REFERENCE} from './portability.js';
import { canonical, hash, readJson, readText, safePath, writeJson, writeText, walk, assertKeys, fail, Failure, type Diagnostic } from './io.js';
import { renderFixture, validateFixture, blockingWarnings, type Fixture, type Rendering } from './fixtures.js';
import { registryTests } from './registry.js';
import { runUpstreamLint, runUpstreamFormat, skippedLint, lintPinFromRegistry, DEFAULT_LINT_PIN, type LintResult } from './lint.js';
import { setupRunners, runRegistryRunners, pinsFromRegistry, DEFAULT_PINS, type RunnerResult } from './runners.js';
import { loadAbiProject, importAbiFile, importVerified, ABI_DIR } from './abi-project.js';
import { fetchVerifiedContract } from './fetch.js';
import packageJson from '../package.json' with {type: 'json'};

export interface Config {version: number; profile: string; engine: string; mode?: 'foundry' | 'abi'; contracts: Selection[]}
export interface Options {root?: string; profile?: string; build?: boolean}
export interface State {project: Project; config: Config; descriptors: Map<string, Descriptor>; review: Record<string, {fingerprint: string; questions?: unknown}>}
const configName = 'clear-signing.toml';
const reviewName = 'clear-signing/review.json';
const provenanceName = 'clear-signing/provenance.json';
// Provenance is kept per contract so a later reviewer can tell author text and proofs from conventions.
function recordProvenance(root: string, entries: (Provenance & {contract: string})[], replace: boolean) {
  const file = safePath(root, provenanceName);
  const current: Record<string, Provenance[]> = fs.existsSync(file) ? readJson(file) : {};
  assertKeys(current, Object.keys(current ?? {}), 'provenance');
  for (const {contract, ...p} of entries) { if (replace && !(contract in current)) current[contract] = []; (current[contract] ??= []).push(p); }
  if (replace) for (const id of new Set(entries.map(e => e.contract))) current[id] = entries.filter(e => e.contract === id).map(({contract, ...p}) => p);
  writeJson(file, current);
}
function saveConfig(project: Project, config: Config) { writeText(safePath(project.root, configName), TOML.stringify(config as any)); }
function configFrom(root: string, allowUpgrade = false): Config {
  let c: Config;
  try { c = TOML.parse(readText(safePath(root, configName))) as unknown as Config; } catch(e) { if (e instanceof Failure) throw e; fail('INVALID_CONFIG', `Invalid ${configName}: ${(e as Error).message}`, 2); }
  assertKeys(c, ['version','profile','engine','mode','contracts'], 'config');
  if (c.mode !== undefined && c.mode !== 'foundry' && c.mode !== 'abi') fail('INVALID_CONFIG', 'mode must be "foundry" or "abi".', 2);
  if (c.version !== 1 || typeof c.profile !== 'string' || (!allowUpgrade && c.engine !== hash(ENGINE))) fail('CONFIG_VERSION', 'Configuration engine/profile is incompatible. Run upgrade to adopt this engine, then inspect changes and renew review.', 2);
  if (!Array.isArray(c.contracts) || !c.contracts.length) fail('INVALID_CONFIG', 'Select at least one contract with init.', 2);
  const ids = new Set<string>(), files = new Set<string>();
  for (const s of c.contracts) {
    assertKeys(s, ['id','descriptor','exclusions','hidden'], 'contract selection');
    if (typeof s.id !== 'string' || typeof s.descriptor !== 'string') fail('INVALID_CONFIG', 'Selections require id and descriptor strings.', 2);
    safePath(root, s.descriptor);
    if (ids.has(s.id) || files.has(path.resolve(root, s.descriptor))) fail('INVALID_CONFIG', 'Contract identities and descriptor paths must be unique.', 2);
    ids.add(s.id); files.add(path.resolve(root, s.descriptor));
    assertKeys(s.exclusions, Object.keys(s.exclusions ?? {}), 'exclusions');
    if (s.hidden !== undefined) {
      assertKeys(s.hidden, Object.keys(s.hidden ?? {}), 'hidden');
      for (const [sig, paths] of Object.entries(s.hidden)) assertKeys(paths, Object.keys((paths as any) ?? {}), `hidden.${sig}`);
    }
  }
  return c;
}
// Project root: the nearest directory holding clear-signing.toml or foundry.toml.
export function findConfigRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, configName)) || fs.existsSync(path.join(dir, 'foundry.toml'))) return fs.realpathSync(dir);
    if (path.dirname(dir) === dir) fail('NO_PROJECT', `No ${configName} or foundry.toml found above ${start}. Use --root <project>, or init --abi / init --address in a new directory.`, 2);
    dir = path.dirname(dir);
  }
}
const loadFor = (config: Config, options: Options, root: string) => config.mode === 'abi' ? loadAbiProject(root) : loadProject({...options, root, profile: options.profile ?? process.env.FOUNDRY_PROFILE ?? config.profile});
export function upgrade(options: Options) {
  const root = findConfigRoot(options.root), config = configFrom(root, true);
  if (config.engine === hash(ENGINE)) return {upgraded:false, note:'Configuration already uses this engine.'};
  config.engine = hash(ENGINE);
  writeText(safePath(root, configName), TOML.stringify(config as any));
  writeJson(safePath(root, reviewName), {});
  return {upgraded:true, note:'Engine updated. Descriptors and expectations preserved; inspect previews, then run review --accept and test --update.'};
}
export function loadState(options: Options): State {
  // Resolve the persisted profile before loading artifacts.
  const root = findConfigRoot(options.root);
  const config = configFrom(root);
  const project = loadFor(config, options, root);
  const descriptors = new Map(config.contracts.map(s => [s.id, readJson<Descriptor>(safePath(root, s.descriptor))]));
  const reviewFile = safePath(root, reviewName);
  const review = fs.existsSync(reviewFile) ? readJson(reviewFile) : {};
  assertKeys(review, Object.keys(review ?? {}), 'review');
  return {project, config, descriptors, review};
}
export interface InitOptions extends Options {contract?: string[]; owner?: string; abi?: string[]; name?: string; address?: string; chainId?: string}
export async function init(options: InitOptions) {
  const abiMode = !!(options.abi?.length || options.address);
  // Mode is decided once, at the first init, and recorded in the config.
  let root: string, existingConfig: Config | undefined;
  if (abiMode) {
    root = options.root ? fs.realpathSync(path.resolve(options.root)) : (() => { try { return findConfigRoot(); } catch { return fs.realpathSync(process.cwd()); } })();
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail('NO_PROJECT', `${root} is not a directory.`, 2);
    existingConfig = fs.existsSync(path.join(root, configName)) ? configFrom(root) : undefined;
    if (existingConfig && existingConfig.mode !== 'abi') fail('MODE_CONFLICT', `${configName} at ${root} is a Foundry-mode project. ABI imports belong in a separate directory (use --root).`, 2);
    if (!existingConfig && fs.existsSync(path.join(root, 'foundry.toml'))) fail('MODE_CONFLICT', `${root} is a Foundry project; run init without --abi/--address to use its compiled artifacts, or pick another --root for ABI mode.`, 2);
  } else {
    root = findConfigRoot(options.root);
    existingConfig = fs.existsSync(path.join(root, configName)) ? configFrom(root) : undefined;
    if (!existingConfig && !fs.existsSync(path.join(root, 'foundry.toml'))) fail('NO_PROJECT', `${root} has no foundry.toml. For a non-Foundry project use init --abi <file> or init --address <addr> --chain-id <id>.`, 2);
  }
  const mode: Config['mode'] = existingConfig?.mode ?? (abiMode ? 'abi' : 'foundry');
  const imports: {id: string; file: string; sidecar: string; source: any}[] = [];
  if (abiMode) {
    if (mode !== 'abi') fail('MODE_CONFLICT', 'This project uses Foundry artifacts; --abi and --address are not available here.', 2);
    if (options.address) {
      const chainId = Number(options.chainId);
      if (!Number.isSafeInteger(chainId) || chainId <= 0) fail('FIXTURE_ARGUMENTS', '--address requires --chain-id <id>.', 2);
      imports.push(importVerified(root, await fetchVerifiedContract(chainId, options.address), options.name));
    }
    for (const file of options.abi ?? []) imports.push(importAbiFile(root, file, options.abi!.length === 1 ? options.name : undefined));
  }
  const project = mode === 'abi' ? loadAbiProject(root) : loadProject({...options, root});
  const configFile = safePath(project.root, configName);
  const existing = fs.existsSync(configFile);
  const config: Config = existing ? configFrom(project.root) : {version: 1, profile: project.profile, engine: hash(ENGINE), ...(mode === 'abi' ? {mode} : {}), contracts: []};
  const selected = imports.length ? imports.map(i => getContract(project, i.id)) : options.contract?.length ? options.contract.map(id => getContract(project,id)) : mode === 'abi' ? project.contracts : defaultContracts(project);
  if (!selected.length) fail('NO_CONTRACTS', mode === 'abi' ? `No ABI files under ${ABI_DIR}/.` : 'No production contracts found. Pass --contract path:Name after a successful forge build.', 2);
  const writes: {file: string; descriptor: Descriptor}[] = [];
  const bindings: {contract: string; chainId: number; address: string; source: string}[] = [];
  const provenance: (Provenance & {contract: string})[] = [];
  for (const c of selected) {
    if (config.contracts.some(s => s.id === c.id)) continue;
    const file = `clear-signing/descriptors/calldata-${c.name}-${hash(c.id).slice(0,8)}.json`;
    if (fs.existsSync(safePath(project.root, file))) fail('FILE_EXISTS', `Refusing to overwrite ${file}.`, 2);
    const scaffolded = scaffoldWithProvenance(c, options.owner ?? path.basename(project.root), gatherEvidence(project, c));
    const descriptor = scaffolded.descriptor;
    provenance.push(...scaffolded.provenance.map(p => ({contract: c.id, ...p})));
    // Deployment bindings come from the repository's own records (broadcasts, or the verified-source import), never guessed.
    for (const dep of broadcastBindings(project, c)) { descriptor.context.contract.deployments.push({chainId: dep.chainId, address: dep.address}); bindings.push({contract: c.id, chainId: dep.chainId, address: dep.address, source: dep.file}); }
    config.contracts.push({id: c.id, descriptor: file, exclusions: {}});
    writes.push({file, descriptor});
  }
  for (const {file, descriptor} of writes) writeJson(safePath(project.root, file), descriptor);
  if (writes.length) recordProvenance(project.root, provenance, true);
  if (writes.length || !existing) saveConfig(project, config);
  const reviewFile = safePath(project.root, reviewName);
  if (!fs.existsSync(reviewFile)) writeJson(reviewFile, {});
  const suggestions = suggestedContracts(project, selected);
  return {created: writes.map(w => w.file), mode, imports: imports.map(i => ({contract: i.id, file: i.file, sidecar: i.sidecar, source: i.source.source, origin: i.source.origin, match: i.source.match, proxy: i.source.proxy})), contracts: config.contracts, bindings, suggestions, provenance, broadcastCalls: project.calls.length, next: 'Inspect action labels and field formats, create transaction fixtures with fixture, then run review --accept after inspecting them.', questions: selected.map(c => ({contract:c.id, functions:reviewQuestions(c)}))};
}
// Broadcast creations that map to exactly this compiled contract. A name shared by several compiled
// contracts is ambiguous and yields nothing; the user binds it explicitly.
function broadcastBindings(project: Project, c: Contract) {
  return deployedContracts(project).filter(x => x.contracts.length === 1 && x.contracts[0].id === c.id).map(x => x.deployment);
}
export function selectContracts(state: State, ids?: string[]) {
  if (!ids?.length) return state.config.contracts;
  return ids.map(id => {const s=state.config.contracts.find(s=>s.id===id); if(!s) fail('CONTRACT_NOT_SELECTED', `${id} is not selected. Run init --contract '${id}' first.`,2); return s;});
}
export function reviewFingerprint(state: State, selection: Selection) {
  return hash({engine: ENGINE, build: state.project.fingerprint, selection, descriptor: state.descriptors.get(selection.id)});
}
export function diagnostics(state: State, includeReview = true, selections = state.config.contracts): Diagnostic[] {
  const errors: Diagnostic[] = [];
  for (const s of selections) {
    try {
      const c = getContract(state.project, s.id);
      errors.push(...validateDescriptor(state.descriptors.get(s.id)!, c, s));
      if (includeReview && state.review[s.id]?.fingerprint !== reviewFingerprint(state,s)) errors.push({code: 'REVIEW_REQUIRED', message: `${s.id} has new or changed source, descriptors, exclusions, or build settings.`, file: reviewName, remedy: `Inspect the source and signing preview; then run review --contract '${s.id}' --accept.`});
    } catch(e) { if (e instanceof Failure) errors.push({code:e.code,message:e.message}); else throw e; }
  }
  return errors;
}
function throwDiagnostics(errors: Diagnostic[]) { if (errors.length) throw new Failure('CHECK_FAILED', `${errors.length} issue(s) require attention.`, 1, errors); }
export function check(state: State, strictPortability=false, ids?: string[]) {
  const selections = selectContracts(state, ids);
  const all = diagnostics(state, true, selections);
  throwDiagnostics(errorsOf(all));
  const findings=selections.flatMap(s=>portabilityFindings(s.id,state.descriptors.get(s.id)!));
  if(strictPortability && findings.length)throw new Failure('PORTABILITY_REVIEW', 'Known consumer compatibility issues require target-wallet validation.',1,findings.map(f=>({code:f.code,signature:f.signature,message:`${f.contract} ${f.path}: ${f.message}`,remedy:'Inspect the compatibility report and validate the target wallet. Ordinary check/export remains available for authoring drafts.'})));
  return {contracts: selections.map(s => ({contract:s.id, covered:Object.keys(state.descriptors.get(s.id)!.display.formats).length, excluded:Object.entries(s.exclusions).map(([signature,reason])=>({signature,reason})), hidden:Object.entries(s.hidden??{}).flatMap(([signature,paths])=>Object.entries(paths).map(([path,reason])=>({signature,path,reason})))})), review:'current', warnings:warningsOf(all), deploymentVerification:'not performed',portability:{walletVerification:'not performed',reference:PORTABILITY_REFERENCE,findings}};
}
export function review(state: State, ids: string[] | undefined, accept: boolean) {
  if (!accept) fail('ACKNOWLEDGEMENT_REQUIRED', 'Inspect descriptors, source changes, and previews first. Then pass --accept to record your review. This is not an audit or attestation.', 2);
  const selections = selectContracts(state, ids);
  const errors = errorsOf(selections.flatMap(s => validateDescriptor(state.descriptors.get(s.id)!, getContract(state.project,s.id), s)));
  throwDiagnostics(errors);
  for (const s of selections) state.review[s.id] = {fingerprint:reviewFingerprint(state,s), questions:reviewQuestions(getContract(state.project,s.id))};
  writeJson(safePath(state.project.root, reviewName), state.review);
  return {reviewed:selections.map(s=>s.id), note:'Developer acknowledgement recorded. No deployment verification or external attestation performed.'};
}
export function sync(state: State) {
  const writes: {file:string; d:Descriptor}[] = [];
  const added: string[] = [], provenance: (Provenance & {contract: string})[] = [];
  for (const s of state.config.contracts) {
    const c = getContract(state.project, s.id), d=state.descriptors.get(s.id)!;
    // Validate structure before mutation, but allow the coverage/obsolete-reference issues sync addresses.
    const structural = errorsOf(validateDescriptor(d,c,s)).filter(e=>!['MISSING_COVERAGE','OBSOLETE_FORMAT','STALE_EXCLUSION','UNSUPPORTED_ENTRYPOINT'].includes(e.code));
    throwDiagnostics(structural);
    const formats = new Set(Object.keys(d.display.formats).map(k=>parseSignature(k).format('sighash')));
    const evidence = gatherEvidence(state.project, c), enumKeys = enumKeysFor(evidence);
    let changed=false;
    for(const f of c.functions) if(!formats.has(f.format('sighash')) && !s.exclusions[f.format('sighash')]) {
      const r=scaffoldFormatWithProvenance(f, evidence, enumKeys);
      d.display.formats[signature(f)]=r.format; added.push(`${s.id} ${f.format('sighash')}`); changed=true; provenance.push(...r.provenance.map(p=>({contract:s.id,...p})));
      // Only enums the new formats reference are added; existing metadata is never rewritten.
      for(const [key,members] of Object.entries(enumMetadata(evidence, enumKeys))) if(JSON.stringify(r.format).includes(`$.metadata.enums.${key}"`) && !d.metadata.enums?.[key]) d.metadata.enums={...(d.metadata.enums??{}),[key]:members};
    }
    if(changed) writes.push({file:s.descriptor,d});
  }
  for(const w of writes) writeJson(safePath(state.project.root,w.file),w.d);
  if(provenance.length) recordProvenance(state.project.root, provenance, false);
  return {added, provenance, diagnostics:errorsOf(diagnostics(state)), note:'Existing fields preserved. Remove obsolete formats explicitly; inspect additions before review --accept.'};
}
export async function preview(state: State, fixturePath: string): Promise<Rendering> {
  const file=safePath(state.project.root,fixturePath), f=readJson<Fixture>(file);
  validateFixture(f);
  const selection=state.config.contracts.find(s=>s.id===f.contract);
  if(!selection) fail('CONTRACT_NOT_SELECTED', `${f.contract} is not selected.`,2);
  const c=getContract(state.project,f.contract), d=state.descriptors.get(f.contract)!;
  throwDiagnostics(errorsOf(validateDescriptor(d,c,selection)));
  return renderFixture(f,d,c);
}
export function createFixture(state: State, options: {name:string; contract:string; function?:string; args:string; chainId?:string; to?:string; value:string; from?:string; local:boolean; chainName?:string; nativeCurrency?:string; broadcastTx?:string}) {
  if(!/^[a-zA-Z0-9_-]+$/.test(options.name)) fail('INVALID_NAME','Fixture names may contain letters, digits, hyphens and underscores.',2);
  const c=getContract(state.project,options.contract);
  if(!state.config.contracts.some(s=>s.id===c.id)) fail('CONTRACT_NOT_SELECTED', 'Run init --contract for this contract first.',2);
  const iface=new Interface(c.abi);
  let data:string, source:string|undefined;
  if(options.broadcastTx) {
    // A recorded broadcast transaction is real calldata against a real deployment; nothing is re-encoded.
    const call=state.project.calls.find(x=>x.hash===options.broadcastTx!.toLowerCase());
    if(!call) fail('BROADCAST_TX_NOT_FOUND',`No CALL with hash ${options.broadcastTx} in broadcast records. Available: ${state.project.calls.map(x=>`${x.hash} (${x.function??'?'} on ${x.chainId}:${x.to}, ${x.script})`).join('; ')||'none'}`,2);
    if(!c.functions.some(f=>f.selector.toLowerCase()===call.data.slice(0,10).toLowerCase())) fail('BROADCAST_TX_MISMATCH',`Transaction ${call.hash} calls selector ${call.data.slice(0,10)}, which is not a write function of ${c.id}.`,2);
    data=call.data; source=call.file;
    options={...options, chainId:String(call.chainId), to:call.to, value:call.value, from:options.from??call.from};
  } else {
    if(!options.function||!options.chainId||!options.to) fail('FIXTURE_ARGUMENTS','--function, --chain-id and --to are required unless --broadcast-tx is given.',2);
    try {const args=JSON.parse(options.args); if(!Array.isArray(args)) throw new Error('--args must be a JSON array'); data=iface.encodeFunctionData(options.function,args);} catch(e) {fail('FIXTURE_ARGUMENTS',`Could not encode arguments: ${(e as Error).message}`,2);}
  }
  let chain: Fixture['chain'];
  if (options.chainName || options.nativeCurrency) {
    const m=/^([A-Za-z0-9._-]+):(\d{1,3})$/.exec(options.nativeCurrency??'');
    if(!options.chainName || !m) fail('FIXTURE_ARGUMENTS','--chain-name and --native-currency SYMBOL:DECIMALS must be given together.',2);
    chain={name:options.chainName, nativeCurrency:{name:m[1], symbol:m[1], decimals:Number(m[2])}};
  }
  const fixture: Fixture={contract:c.id, chainId:Number(options.chainId), to:options.to!, data, value:options.value, ...(options.from?{from:options.from}:{}), ...(options.local?{localBinding:true}:{}), ...(chain?{chain}:{}), tokens:{}, addressNames:{}};
  validateFixture(fixture);
  const file=`clear-signing/fixtures/${options.name}.json`;
  if(fs.existsSync(safePath(state.project.root,file))) fail('FILE_EXISTS',`Refusing to overwrite ${file}.`,2);
  writeJson(safePath(state.project.root,file),fixture);
  return {created:file, ...(source?{source}:{}), next:`Run preview --fixture ${file}. Add local token metadata and address names to the fixture as needed.`};
}
export function fixtureFiles(state: State, ids?: string[]) {
  const files = walk(safePath(state.project.root,'clear-signing/fixtures'),'.json').map(file=>path.relative(state.project.root,file));
  if (!ids?.length) return files;
  const wanted = new Set(ids);
  return files.filter(file => { try { return wanted.has(readJson(safePath(state.project.root, file))?.contract); } catch { return false; } });
}
export function expectationPath(fixture: string) {
  if(!fixture.startsWith('clear-signing/fixtures/')) fail('FIXTURE_LOCATION','Test fixtures must live under clear-signing/fixtures/.');
  return fixture.replace('clear-signing/fixtures/','clear-signing/expectations/');
}
export async function runTests(state: State, update=false, ids?: string[]) {
  const files=fixtureFiles(state, ids);
  if(!files.length) fail('NO_FIXTURES',`No fixtures found${ids?.length ? ` for ${ids.join(', ')}` : ''}. Use fixture to create a sample transaction.`);
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
export interface ExportOptions {strictPortability?: boolean; ids?: string[]; entity?: string; inlineAbi?: boolean; lint?: boolean; registryRunners?: boolean; skipRegistryRunners?: string; ciPins?: string; log?: (line: string) => void}
// Registry entity folders are kebab-case slugs of the owner name, e.g. "Morpho DAO" -> "morpho-dao".
export const entitySlug = (owner: string) => owner.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const REGISTRY_SCHEMA = '../../specs/erc7730-v2.schema.json';
export async function exportBundle(state: State, out: string, strictPortability=false, ids?: string[], options: ExportOptions = {}) {
  const selections = selectContracts(state, ids);
  const skipReason = options.skipRegistryRunners?.trim();
  if (options.skipRegistryRunners !== undefined && !skipReason) fail('USAGE_ERROR', '--skip-registry-runners needs a reason, which is recorded in the bundle.', 2);
  if (skipReason && options.registryRunners) fail('USAGE_ERROR', '--registry-runners and --skip-registry-runners exclude each other.', 2);
  const {portability}=check(state,strictPortability,ids);
  const tests=await runTests(state,false,ids);
  const errors:Diagnostic[]=[];
  for(const s of selections) {
    const d=state.descriptors.get(s.id)!;
    if(!d.context.contract.deployments.length) errors.push({code:'DEPLOYMENTS_REQUIRED',message:`${s.id} has no production bindings.`,file:s.descriptor});
    for(const key of Object.keys(d.display.formats)) {
      const sig=parseSignature(key).format('sighash');
      if(!tests.renders.some(r=>r.rendering.contract===s.id && r.rendering.signature===sig)) errors.push({code:'FIXTURE_COVERAGE',message:`${s.id} ${sig} needs a passing fixture.`,signature:sig});
    }
  }
  for(const r of tests.renders) if(r.rendering.localBinding) errors.push({code:'LOCAL_BINDING_EXPORT',message:'Local-only fixtures cannot be exported. Supply real descriptor bindings and remove localBinding.',file:r.file});
  const owners=new Set(selections.map(s=>state.descriptors.get(s.id)!.metadata.owner));
  const entity=options.entity ?? entitySlug([...owners][0] ?? '');
  if(!options.entity && owners.size>1) errors.push({code:'ENTITY_AMBIGUOUS',message:`Selected descriptors name different owners (${[...owners].join(', ')}). Pass --entity <registry-folder> or export per contract.`});
  if(!/^[a-z0-9][a-z0-9-]*$/.test(entity)) errors.push({code:'ENTITY_INVALID',message:`Registry entity folder must be a kebab-case slug; got "${entity}". Pass --entity.`});
  // Where this tool's renderer and the registry's runners can differ, a local pass is not evidence
  // the registry's CI will pass; the runners must check the expected values, or the user records why not.
  const divergence=selections.flatMap(s=>runnerDivergence(s.id,state.descriptors.get(s.id)!));
  if(divergence.length && !options.registryRunners && !skipReason) errors.push(...divergence.map(f=>({code:'REGISTRY_RUNNERS_REQUIRED',signature:f.signature,message:`${f.contract} ${f.path}: ${f.message}`,remedy:'The testsv2 expected values come from this tool\'s renderer, which can differ from the registry CI\'s on this shape (negative signed integers, nested arrays). Export with --registry-runners so both registry implementations check them, or with --skip-registry-runners "<reason>" to export anyway and record why.'})));
  throwDiagnostics(errors);
  const target=safePath(state.project.root,out);
  if(fs.existsSync(target)) fail('OUTPUT_EXISTS',`Refusing to overwrite ${out}. Choose a new output directory.`,2);
  const stage=safePath(state.project.root,`${out}.tmp-${process.pid}`);
  if(fs.existsSync(stage)) fail('OUTPUT_EXISTS',`Staging directory already exists: ${stage}`,2);
  fs.mkdirSync(stage,{recursive:true});
  let lint: LintResult;
  const runnerResults:(RunnerResult&{testsFile:string})[]=[];
  const registryDir=path.join(stage,'registry',entity), descriptorFiles:string[]=[], testsFiles:string[]=[];
  try {
    const names=new Set<string>();
    for(const s of selections) {
      const c=getContract(state.project,s.id), source=state.descriptors.get(s.id)!;
      // Registry filenames carry the contract name only; the working copy keeps its identity hash.
      const name=`calldata-${c.name}.json`;
      if(names.has(name)) fail('EXPORT_COLLISION',`Two selected contracts are both named ${c.name}. Export them separately with --contract.`);
      names.add(name);
      const descriptor=structuredClone(source);
      descriptor.$schema=REGISTRY_SCHEMA;
      if(options.inlineAbi) descriptor.context.contract.abi=c.abi;
      writeJson(path.join(registryDir,name),descriptor); descriptorFiles.push(path.join('registry',entity,name));
      const fixtures = tests.renders.filter(r=>r.rendering.contract===s.id).map(r=>({name:r.file,fixture:readJson<Fixture>(safePath(state.project.root,r.file)),rendering:r.rendering}));
      if(fixtures.length) { const testsName=name.replace(/\.json$/,'.tests.json'); writeJson(path.join(registryDir,'testsv2',testsName),registryTests(name,source,fixtures)); testsFiles.push(path.join('registry',entity,'testsv2',testsName)); }
    }
    for(const r of tests.renders) {
      const name=path.relative('clear-signing/fixtures',r.file);
      writeJson(path.join(stage,'review','fixtures',name),readJson(safePath(state.project.root,r.file)));
      writeJson(path.join(stage,'review','renderings',name),r.rendering);
    }
    // Canonical registry formatting first, so lint and the runners see exactly what the PR will contain.
    // The registry CI's own erc7730 package and lint flags: from a clone with --ci-pins, else the built-in pin.
    const lintPin = options.ciPins ? lintPinFromRegistry(options.ciPins) : DEFAULT_LINT_PIN;
    // The format bot rewrites testsv2 files too, so they are formatted with the descriptors.
    const formatted = options.lint===false ? {ran:false, reason:'skipped with --no-lint'} : runUpstreamFormat(stage, [...descriptorFiles, ...testsFiles], lintPin);
    lint = options.lint===false ? skippedLint(descriptorFiles, lintPin) : runUpstreamLint(stage, descriptorFiles, lintPin);
    (lint as LintResult & {formatted?: typeof formatted}).formatted = formatted;
    if(lint.ran && lint.exitCode!==0) throw new Failure('UPSTREAM_LINT_FAILED',`erc7730 lint rejected the exported descriptor(s).`,1,[{code:'UPSTREAM_LINT_FAILED',message:(lint.output??[]).join(' | '),remedy:`Fix the descriptor and export again, or reproduce with: ${lint.command}`}]);
    // The registry's own implementations, when asked for. The bundle's registry/ directory is a registry root.
    if(options.registryRunners) {
      const tc=setupRunners(options.ciPins?pinsFromRegistry(options.ciPins):DEFAULT_PINS, options.log);
      const failures:Diagnostic[]=[];
      for(const file of fs.existsSync(path.join(registryDir,'testsv2'))?fs.readdirSync(path.join(registryDir,'testsv2')).filter(f=>f.endsWith('.tests.json')):[]) {
        const results=runRegistryRunners(tc,path.join(registryDir,'testsv2',file),stage,path.join(stage,'review','runners',file.replace(/\.tests\.json$/,'')));
        runnerResults.push(...results.map(r=>({testsFile:`registry/${entity}/testsv2/${file}`,...r,resultsFile:r.resultsFile?path.relative(stage,r.resultsFile):undefined})));
        for(const r of results) if(!r.passed) failures.push({code:'REGISTRY_RUNNER_FAILED',message:`${r.name} runner (${r.implementation??r.ref.slice(0,8)}) on ${file}: ${r.reason??JSON.stringify(r.cases)}${r.failures.length?`; ${r.failures.map(f=>`"${f.description}" ${f.status}${f.message?` (${f.message})`:''}`).join('; ')}`:''}`,file:`registry/${entity}/testsv2/${file}`,remedy:'The registry CI runs these same implementations. Inspect review/runners/*/ for rendered output, then fix the descriptor or expectations.'});
      }
      if(failures.length) throw new Failure('REGISTRY_RUNNER_FAILED',`${failures.length} registry runner check(s) failed.`,1,failures);
    }
    writeJson(path.join(stage,'review','validation.json'),{tool:packageJson.version, engine:ENGINE, entity, contracts:selections.map(s=>({id:s.id,descriptor:`registry/${entity}/calldata-${getContract(state.project,s.id).name}.json`,exclusions:s.exclusions,hidden:s.hidden??{}})),fixtures:tests.passed, upstreamLint:lint, registryRunners:options.registryRunners?runnerResults:'not run', ...(skipReason?{registryRunnersSkipped:{reason:skipReason,divergence}}:{}), deploymentVerification:'not performed',publication:'not submitted'});
    writeJson(path.join(stage,'review','portability.json'),portability);
    const provenanceFile=safePath(state.project.root,provenanceName);
    if(fs.existsSync(provenanceFile)) { const all=readJson<Record<string,unknown>>(provenanceFile); writeJson(path.join(stage,'review','provenance.json'),Object.fromEntries(selections.filter(s=>s.id in all).map(s=>[s.id,all[s.id]]))); }
    writeText(path.join(stage,'README.md'),[`# Clear-signing submission bundle for ${entity}`,'',
      `The \`registry/${entity}/\` directory is laid out exactly as the ERC-7730 registry expects: descriptors at the entity root and \`testsv2/*.tests.json\` beside them, with relative schema references. Copy it into a clone of https://github.com/ethereum/clear-signing-erc7730-registry :`,'',
      '```sh',`cp -r registry/${entity}/. <registry-clone>/registry/${entity}/`,'```','',
      `Upstream lint: ${lint.ran ? `ran (exit ${lint.exitCode}, ${lint.warnings} warning(s)). Output is recorded in review/validation.json.` : `not run (${lint.reason}). Run it yourself before opening a pull request:`}`,'',
      ...(lint.ran ? [] : ['```sh',lint.command,'```','']),
      ...(skipReason ? [`Registry runners: skipped (${skipReason}). ${divergence.length} displayed field(s) use a shape where this tool's renderer and the registry CI's can differ, so the testsv2 expected values may fail registry CI. Details in review/validation.json.`,''] : []),
      'The `review/` directory holds the original fixtures, normalized renderings, the validation record and the portability report. Read `review/portability.json` for known consumer limitations; a passing local test is not wallet certification.','',
      'Verify deployed code and proxy mappings independently. Open the pull request from an account tied to the contract owner; registry review, attestations and wallet availability are separate steps: https://clearsigning.org/build/',''].join('\n'));
    fs.renameSync(stage,target);
  } catch(e) {fs.rmSync(stage,{recursive:true,force:true});throw e;}
  return {exported:out,entity,registryPath:`${out}/registry/${entity}`,descriptors:selections.length,fixtures:tests.passed,lint,registryRunners:options.registryRunners?runnerResults:null,...(skipReason?{registryRunnersSkipped:{reason:skipReason,divergence}}:{}),deploymentVerification:'not performed',publication:'not submitted',portability};
}

// ---------------------------------------------------------------------------------------------
// Decisions: the judgment slots the scaffold cannot fill, as a file any agent or person can edit.
// `decisions` writes the template from the current descriptor plus every hint the tool has;
// `apply` writes the descriptor, exclusions, hidden reasons and provenance from a filled file.
export interface DecisionField {type: string; show: boolean; hideReason?: string | null; label: string; format: string; params?: Record<string, unknown> | null; author?: string | null; hints?: Record<string, unknown>}
export interface DecisionFunction {signature: string; decision: 'describe' | 'exclude'; excludeReason?: string | null; intent: string; interpolatedIntent?: string | null; author?: string | null; fields: Record<string, DecisionField>; hints?: Record<string, unknown>}
export interface Decisions {version: 1; contract: string; descriptor: string; author: string | null; generatedAt: string; owner: string; url: string | null; functions: Record<string, DecisionFunction>; guidance: string[]}
const decisionsDir = 'clear-signing/decisions';
// A leaf the descriptor itself hides with visible "never" is reported as hidden with this reason, and apply
// leaves such fields as written instead of moving the decision into clear-signing.toml.
const DESCRIPTOR_NEVER = 'visible "never" in the descriptor';
// Leaves hidden by a visible "never" field, including every leaf of a hidden struct or array.
const neverHidden = (resolved: ResolvedField[], leafKeys: string[]) => new Set(resolved.filter(r => r.hidden && r.key).flatMap(r => coveredLeaves(r.key!, leafKeys)));
// The decisions template for the current descriptor. apply compares a filled file against it, so only
// values someone changed are recorded as decided; unchanged values keep the provenance init gave them.
function buildDecisions(state: State, id: string): Decisions {
  const selection = selectContracts(state, [id])[0];
  const c = getContract(state.project, id), d = state.descriptors.get(id)!, evidence = gatherEvidence(state.project, c);
  const formats = new Map(Object.entries(d.display.formats).map(([k, v]) => [parseSignature(k).format('sighash'), {key: k, spec: v}]));
  const constants = Object.keys(d.metadata.constants ?? {});
  const functions: Record<string, DecisionFunction> = {};
  for (const f of c.functions) {
    const sig = f.format('sighash'), key = signature(f), existing = formats.get(sig);
    const leafList = leaves(f.inputs);
    // Displayed fields by leaf, merged with their definitions; the first displayed field wins for a leaf shown more than once.
    const resolved = existing ? resolveFields(existing.spec.fields, d.display.definitions ?? {}) : [];
    const flat = new Map<string, Field>();
    for (const r of resolved) if (r.key && !r.hidden && !flat.has(r.key)) flat.set(r.key, r.field);
    const never = neverHidden(resolved, leafList.map(l => l.path));
    const addressLeaves = leafList.filter(l => l.type === 'address').map(l => l.path);
    const fields: Record<string, DecisionField> = {};
    for (const leaf of leafList) {
      const cur = flat.get(leaf.path);
      const hidden = selection.hidden?.[sig]?.[leaf.path] ?? (!cur && never.has(leaf.path) ? DESCRIPTOR_NEVER : undefined);
      const humanized = (leaf.path.split('.').pop() ?? leaf.path).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim().replace(/^./, x => x.toUpperCase());
      const hints: Record<string, unknown> = {};
      if (/^u?int\d*$/.test(leaf.type)) hints.denominations = ['@.to (the contract itself is the token)', ...constants.map(k => `$.metadata.constants.${k}`), ...addressLeaves.map(a => `tokenPath ${a}`), 'token <literal address>'];
      if (evidence.paramDocs[sig]?.[leaf.path.split('.')[0]]) hints.natspec = evidence.paramDocs[sig][leaf.path.split('.')[0]];
      const formatsForType = leaf.type === 'address' ? ['addressName', 'tokenTicker', 'raw'] : /^u?int\d*$/.test(leaf.type) ? ['tokenAmount', 'amount', 'date', 'duration', 'unit', 'enum', 'chainId', 'raw'] : leaf.type === 'bool' ? ['enum', 'raw'] : ['raw'];
      hints.formatsForType = formatsForType;
      fields[leaf.path] = {type: leaf.type, show: !!cur || !hidden, ...(hidden && !cur ? {hideReason: hidden} : {}), label: cur?.label ?? humanized, format: cur?.format ?? 'raw', params: cur?.params ?? null, hints};
    }
    if (f.stateMutability === 'payable') { const cur = flat.get('@.value'); fields['@.value'] = {type: 'uint256', show: true, label: cur?.label ?? 'Native amount', format: cur?.format ?? 'amount', params: cur?.params ?? null, hints: {note: 'Payable: must stay shown.'}}; }
    const priors = priorsFor(f.selector);
    const priorInterpolations = priors.map(p => p.interpolatedIntent).filter((x): x is string => typeof x === 'string').slice(0, 5);
    functions[sig] = {signature: key, decision: existing ? 'describe' : selection.exclusions[sig] ? 'exclude' : 'describe', excludeReason: selection.exclusions[sig] ?? null,
      intent: existing?.spec.intent ?? (f.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, x => x.toUpperCase())), interpolatedIntent: existing?.spec.interpolatedIntent ?? null, fields,
      hints: {...(evidence.notices[sig] ? {natspec: evidence.notices[sig]} : {}), ...(priors.length ? {registryPriors: priors.slice(0, 5).map(summarizePrior), registryPriorCount: priors.length} : {}), ...(priorInterpolations.length ? {registryInterpolatedIntents: priorInterpolations} : {}), intentLimit: 30, interpolatedIntent: 'Optional sentence with {path} placeholders naming shown fields (e.g. "Stake {amount}", "Send {amount} to {to}"). Wallets prefer it; the registry recommends one on every format and warns when the template exceeds 30 characters.'}};
  }
  return {version: 1, contract: id, descriptor: selection.descriptor, author: null, generatedAt: new Date().toISOString().slice(0, 10), owner: d.metadata.owner, url: d.metadata.info?.url ?? null, functions,
    guidance: ['Set author to "human" or "llm:<model>" before apply; it is recorded in provenance for every value you change. Unchanged values keep their existing provenance.', 'A function or field may carry its own "author" that overrides the file author for that function (decision, intent, interpolatedIntent) or that field. Tag each value with whoever decided it.', 'decision: "describe" or "exclude" (with excludeReason). Excluded functions are removed from the descriptor and listed in clear-signing.toml.', 'Per field: show true/false (hideReason required when false), label, format (see hints.formatsForType), params (tokenAmount needs token or tokenPath; see hints.denominations).', 'Intents are what a signer reads; keep them under 30 characters and never vaguer than the function.', 'interpolatedIntent is optional but recommended by the registry: a sentence embedding shown field values with {path}; set null to omit.', 'hints are read-only context: NatSpec, registry priors for the same selector, candidate denominations. They are ignored by apply.']};
}
export function writeDecisions(state: State, id: string, out?: string) {
  const c = getContract(state.project, id), decisions = buildDecisions(state, id);
  const file = out ?? `${decisionsDir}/${c.name}.json`;
  writeJson(safePath(state.project.root, file), decisions);
  return {created: file, functions: Object.keys(decisions.functions).length, next: `Fill intents, formats, denominations and show/hide reasons in ${file}, set author, then run apply --decisions ${file}.`};
}
export function applyDecisions(state: State, file: string) {
  const dec = readJson<Decisions>(safePath(state.project.root, file));
  assertKeys(dec, ['version', 'contract', 'descriptor', 'author', 'generatedAt', 'owner', 'url', 'functions', 'guidance'], 'decisions');
  if (dec.version !== 1 || typeof dec.contract !== 'string' || !dec.functions || typeof dec.functions !== 'object') fail('INVALID_DECISIONS', 'decisions file must have version 1, a contract id and a functions map.', 2);
  if (typeof dec.author !== 'string' || !dec.author.trim()) fail('DECISIONS_AUTHOR', 'Set "author" to "human" or "llm:<model>" so provenance records who decided.', 2);
  const sourceOf = (author: string): Provenance['source'] => /^llm\b/i.test(author) ? 'llm' : 'human';
  const authorOf = (own: unknown, fallback: string, where: string) => {
    if (own === undefined || own === null) return fallback;
    if (typeof own !== 'string' || !own.trim()) fail('DECISIONS_AUTHOR', `${where}: "author" must be "human" or "llm:<model>" when present.`, 2);
    return own.trim();
  };
  for (const [sig, fd] of Object.entries(dec.functions)) { authorOf(fd?.author, '', sig); for (const [full, fl] of Object.entries(fd?.fields ?? {})) authorOf(fl?.author, '', `${sig} ${full}`); }
  const source = sourceOf(dec.author);
  const selection = selectContracts(state, [dec.contract])[0];
  // What the file said before anyone edited it: a value equal to this is not a decision.
  const baseline = buildDecisions(state, dec.contract).functions;
  const sameField = (a: DecisionField, b: DecisionField | undefined) => !!b && (a.show !== false) === b.show && (a.show === false
    ? (a.hideReason ?? '').trim() === (b.hideReason ?? '').trim()
    : (a.label ?? '').trim() === b.label && (a.format ?? 'raw') === b.format && canonical(a.params && Object.keys(a.params).length ? a.params : null) === canonical(b.params && Object.keys(b.params).length ? b.params : null));
  const c = getContract(state.project, dec.contract), current = state.descriptors.get(dec.contract)!;
  const d: Descriptor = structuredClone(current);
  if (typeof dec.owner === 'string' && dec.owner.trim()) d.metadata.owner = dec.owner.trim();
  if (typeof dec.url === 'string' && dec.url.trim()) d.metadata.info = {...(d.metadata.info ?? {}), url: dec.url.trim()};
  const exclusions: Record<string, string> = {...selection.exclusions}, hidden: Record<string, Record<string, string>> = structuredClone(selection.hidden ?? {});
  const provenance: (Provenance & {contract: string})[] = [];
  const byKey = new Map(Object.keys(d.display.formats).map(k => [parseSignature(k).format('sighash'), k]));
  for (const f of c.functions) {
    const sig = f.format('sighash'), fd = dec.functions[sig];
    if (!fd) continue;
    const key = byKey.get(sig) ?? signature(f), base = baseline[sig];
    const fnAuthor = authorOf(fd.author, dec.author.trim(), sig);
    const record = (author: string, entry: Omit<Provenance, 'source' | 'author'>) => provenance.push({contract: dec.contract, ...entry, source: sourceOf(author), author});
    // A function switched between describe and exclude is decided as a whole.
    const flipped = !base || base.decision !== fd.decision;
    if (fd.decision === 'exclude') {
      if (typeof fd.excludeReason !== 'string' || !fd.excludeReason.trim()) fail('DECISIONS_REASON', `${sig}: decision "exclude" needs an excludeReason.`, 2);
      delete d.display.formats[key]; exclusions[sig] = fd.excludeReason.trim(); delete hidden[sig];
      if (flipped || (base.excludeReason ?? '').trim() !== fd.excludeReason.trim()) record(fnAuthor, {signature: sig, detail: `excluded: ${fd.excludeReason.trim()}`});
      continue;
    }
    if (fd.decision !== 'describe') fail('INVALID_DECISIONS', `${sig}: decision must be "describe" or "exclude".`, 2);
    delete exclusions[sig];
    if (typeof fd.intent !== 'string' || !fd.intent.trim()) fail('DECISIONS_INTENT', `${sig}: intent is required.`, 2);
    const spec = d.display.formats[key] ?? scaffoldFormatWithProvenance(f).format;
    spec.intent = fd.intent.trim();
    if (flipped || base.intent !== spec.intent) record(fnAuthor, {signature: sig, detail: `intent: ${spec.intent}`});
    if (typeof fd.interpolatedIntent === 'string' && fd.interpolatedIntent.trim()) {
      spec.interpolatedIntent = fd.interpolatedIntent.trim();
      if (flipped || base.interpolatedIntent !== spec.interpolatedIntent) record(fnAuthor, {signature: sig, detail: `interpolatedIntent: ${spec.interpolatedIntent}`});
    }
    else delete spec.interpolatedIntent;
    // Edit leaves in place to keep existing grouping; drop hidden ones; append newly shown ones flat.
    // Paths resolve exactly as the validator reads them (resolveFields): group scope, $ref definitions, "#." roots.
    const definitions = d.display.definitions ?? {};
    const never = neverHidden(resolveFields(spec.fields, definitions), leaves(f.inputs).map(l => l.path));
    const hiddenHere: Record<string, string> = {};
    const present = new Set<string>();
    const edit = (items: (Field | Group)[], prefix = ''): (Field | Group)[] => items.flatMap((item): (Field | Group)[] => {
      if ('fields' in item) { const inner = edit(item.fields, joinPath(prefix, item.path) + '.'); return inner.length ? [{...item, fields: inner}] : []; }
      const merged = mergeDefinition(item, definitions);
      if (typeof merged.path !== 'string') return [item];
      const full = leafKey(joinPath(prefix, merged.path));
      const decision = fd.fields?.[full];
      if (!decision) return [item];
      present.add(full);
      if (decision.show === false) {
        if (full === '@.value') fail('DECISIONS_NATIVE_VALUE', `${sig}: @.value must stay shown.`, 2);
        if (!decision.hideReason?.trim()) fail('DECISIONS_REASON', `${sig} ${full}: show=false needs a hideReason.`, 2);
        // Already hidden by the descriptor: keep it as written.
        if (merged.visible === 'never') return [item];
        hiddenHere[full] = decision.hideReason!.trim(); return [];
      }
      const format = decision.format ?? 'raw';
      if (!(SUPPORTED_FORMATS as readonly string[]).includes(format)) fail('UNSUPPORTED_FORMAT', `${sig} ${full}: ${format} is not a supported format.`, 2);
      const label = decision.label?.trim() || merged.label;
      const params = decision.params && Object.keys(decision.params).length ? decision.params as Record<string, any> : undefined;
      // A $ref field may carry only path, $ref, params and visible. Unchanged, it stays as written; a
      // change the reference cannot express inlines the merged definition.
      if (typeof item.$ref === 'string' && label === merged.label && format === merged.format && canonical(params ?? null) === canonical(merged.params ?? null)) {
        if (item.visible !== 'never') return [item];
        const {visible: _, ...shown} = item; return [shown];
      }
      const {$ref: _ref, ...base} = typeof item.$ref === 'string' ? merged : item;
      const next: Field = {...base, label, format};
      if (next.visible === 'never') delete next.visible;
      if (params) next.params = params; else delete next.params;
      return [next];
    });
    spec.fields = edit(spec.fields);
    for (const [full, decision] of Object.entries(fd.fields ?? {})) {
      if (present.has(full)) continue;
      if (decision.show === false) {
        if (!decision.hideReason?.trim()) fail('DECISIONS_REASON', `${sig} ${full}: show=false needs a hideReason.`, 2);
        if (!never.has(full)) hiddenHere[full] = decision.hideReason!.trim();
        continue;
      }
      const format = decision.format ?? 'raw';
      if (!(SUPPORTED_FORMATS as readonly string[]).includes(format)) fail('UNSUPPORTED_FORMAT', `${sig} ${full}: ${format} is not a supported format.`, 2);
      spec.fields.push({path: full, label: decision.label?.trim() || full, format, ...(decision.params && Object.keys(decision.params).length ? {params: decision.params as Record<string, any>} : {})});
    }
    for (const [full, decision] of Object.entries(fd.fields ?? {})) {
      if (!flipped && sameField(decision, base.fields[full])) continue;
      const author = authorOf(decision.author, fnAuthor, `${sig} ${full}`);
      if (decision.show !== false) record(author, {signature: sig, path: full, detail: `${decision.format ?? 'raw'}${decision.params ? ` ${JSON.stringify(decision.params)}` : ''}, label "${decision.label}"`});
      else if (hiddenHere[full]) record(author, {signature: sig, path: full, detail: `hidden: ${hiddenHere[full]}`});
    }
    if (Object.keys(hiddenHere).length) hidden[sig] = hiddenHere; else delete hidden[sig];
    d.display.formats[key] = spec;
  }
  const nextSelection: Selection = {...selection, exclusions, ...(Object.keys(hidden).length ? {hidden} : {})};
  if (!Object.keys(hidden).length) delete (nextSelection as any).hidden;
  // Validate before writing anything.
  const diagnostics = validateDescriptor(d, c, nextSelection);
  const errors = errorsOf(diagnostics);
  if (errors.length) throw new Failure('APPLY_INVALID', `${errors.length} issue(s) in the decisions; nothing was written.`, 1, errors);
  writeJson(safePath(state.project.root, selection.descriptor), d);
  const config = configFrom(state.project.root);
  config.contracts = config.contracts.map(s => s.id === dec.contract ? nextSelection : s);
  saveConfig(state.project, config);
  recordProvenance(state.project.root, provenance, false);
  return {applied: selection.descriptor, author: dec.author, source, recorded: provenance.length, functions: Object.keys(dec.functions).length, excluded: Object.keys(exclusions).length, hidden: Object.values(hidden).reduce((n, h) => n + Object.keys(h).length, 0), warnings: warningsOf(diagnostics), next: 'Run preview on your fixtures, then review --accept and test --update after inspecting them.'};
}
