import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Interface, FunctionFragment } from 'ethers';
import { fail, hash, readJson, safePath, walk, writeJson } from './io.js';
import { readBroadcasts, type BroadcastDeployment, type BroadcastCall } from './broadcast.js';

export interface Contract { id: string; name: string; source: string; artifact: string; abi: any[]; functions: FunctionFragment[]; special: string[]; metadata: any; userdoc?: any; devdoc?: any; ast?: any; immutables?: {name: string; address: string}[]; }
export interface Project { root: string; profile: string; config: any; forgeVersion: string; contracts: Contract[]; fingerprint: string; deployments: BroadcastDeployment[]; calls: BroadcastCall[]; }
export function findRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, 'foundry.toml'))) return fs.realpathSync(dir);
    if (path.dirname(dir) === dir) fail('NO_FOUNDRY_PROJECT', `No foundry.toml found above ${start}. Use --root <project>.`, 2);
    dir = path.dirname(dir);
  }
}
function forge(root: string, profile: string, args: string[]): string {
  // Real protocol repositories can spend several minutes optimizing their test
  // contracts. Keep short metadata commands bounded without truncating builds.
  const timeout = args[0] === 'build' ? 600_000 : 120_000;
  const result = spawnSync('forge', args, {cwd: root, env: {...process.env, FOUNDRY_PROFILE: profile}, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout});
  if (result.error && 'code' in result.error && result.error.code === 'ETIMEDOUT') fail('FORGE_TIMEOUT', `forge ${args[0]} exceeded ${timeout / 1000} seconds. Run the same build directly to diagnose compiler performance.`, 2);
  if (result.error) fail('FORGE_UNAVAILABLE', `Forge failed: ${result.error.message}. Install Foundry and verify forge --version.`, 2);
  const text = result.stderr || result.stdout || '';
  // --offline cannot download compilers; the fix is one ordinary build, so say so instead of dumping solc's complaint.
  if (result.status !== 0 && args.includes('--offline') && /no compiler versions? (?:are|is) available|No solc version installed|invalid solc version/i.test(text)) {
    const versions = [...new Set([...text.matchAll(/version requirement: (\S+)/g)].map(m => m[1]))];
    const which = versions.length ? `Solidity compiler${versions.length > 1 ? 's' : ''} ${versions.join(', ')}` : 'a Solidity compiler version that is not installed';
    fail('FORGE_COMPILER_MISSING', `The offline build needs ${which}. Run \`forge build\` once in ${root} so Foundry downloads it, then retry.`, 2);
  }
  if (result.status !== 0) fail('FORGE_FAILED', `forge ${args[0]} failed:\n${text}`, 2);
  return result.stdout;
}
const ignoredDirs = new Set(['.git', 'node_modules', 'out', 'cache', 'broadcast', '.clear-signing-cache']);
function remappings(config: any): {prefix:string; target:string}[] {
  return (config.remappings ?? []).map((value: string) => {
    const eq = value.indexOf('=');
    const left = value.slice(0, eq);
    return {prefix: left.slice(left.lastIndexOf(':') + 1), target: value.slice(eq + 1)};
  }).filter((r: {prefix:string;target:string}) => r.prefix && r.target).sort((a: {prefix:string}, b: {prefix:string}) => b.prefix.length - a.prefix.length);
}
function sourceRoots(root: string, config: any): string[] {
  return [root, config.src, config.test, config.script, ...(config.libs ?? []), ...(config.include_paths ?? []), ...(config.allow_paths ?? []), ...remappings(config).map(r => r.target)]
    .filter(Boolean).map(p => path.resolve(root,p)).filter(p => fs.existsSync(p)).map(p => fs.realpathSync(p));
}
function resolveSource(root: string, config: any, source: string): string {
  const candidates = [path.resolve(root, source), ...remappings(config).filter(r => source.startsWith(r.prefix)).map(r => path.resolve(root,r.target,source.slice(r.prefix.length)))];
  const allowed = sourceRoots(root,config);
  for (const file of candidates) if (fs.existsSync(file)) {
    const real = fs.realpathSync(file);
    if (!allowed.some(dir => real === dir || real.startsWith(dir + path.sep))) fail('EXTERNAL_SOURCE', `Source ${source} resolves outside the project and declared dependency roots. Add an explicit Foundry remapping or libs entry.`, 2);
    return real;
  }
  fail('MISSING_BUILD_SOURCE', `Cannot resolve compiler source ${source}. Restore dependencies and rebuild; stale sources cannot be fingerprinted.`, 2);
}
function sourceFingerprint(root: string, config: any, contracts: Contract[], version: string, profile: string) {
  const files = new Set<string>();
  // Enumerate entry points so adding/removing a source cannot reuse stale artifacts.
  for (const dir of [config.src, config.test, config.script, ...(config.libs ?? []), ...(config.include_paths ?? []), ...remappings(config).map(r=>r.target)].filter(Boolean)) {
    for (const file of walk(path.resolve(root, dir), '.sol', ignoredDirs)) files.add(file);
  }
  // Metadata enumerates the actual imported sources, including remapped dependencies.
  for (const contract of contracts) for (const source of Object.keys(contract.metadata?.sources ?? {})) {
    const file = resolveSource(root, config, source);
    files.add(file);
  }
  // RPC credentials, test verbosity and other runtime settings do not change compilation.
  const buildKeys = ['src','test','script','out','libs','remappings','libraries','include_paths','allow_paths','skip','evm_version','solc','auto_detect_solc','optimizer','optimizer_runs','optimizer_details','via_ir','bytecode_hash','cbor_metadata','use_literal_content','revert_strings','extra_output','extra_output_files','dynamic_test_linking','additional_compiler_profiles','compilation_restrictions'];
  const buildConfig = Object.fromEntries(buildKeys.map(key => [key, config[key]]));
  return hash({version, profile, config: buildConfig, sources: [...files].sort().map(file => [path.relative(root, file), fs.existsSync(file) ? hash(fs.readFileSync(file, 'utf8')) : 'missing']),
    artifacts: contracts.map(c => [c.id, hash(readJson(c.artifact, 64 * 1024 * 1024))])});
}
export function loadProject(options: {root?: string; profile?: string; build?: boolean}): Project {
  const root = findRoot(options.root);
  const profile = options.profile ?? process.env.FOUNDRY_PROFILE ?? 'default';
  const forgeVersion = forge(root, profile, ['--version']);
  let config: any;
  try { config = JSON.parse(forge(root, profile, ['config', '--json'])); } catch { fail('FORGE_CONFIG', 'Could not parse forge config --json.', 2); }
  // Build output must stay in this project, even when read-only dependencies are external.
  for (const dir of [config.out, config.cache_path, config.build_info_path].filter(Boolean)) safePath(root, path.relative(root,path.resolve(root,dir)));
  // AST and NatSpec are evidence inputs: enums, constructor immutables, author notices and parameter docs.
  if (options.build !== false) forge(root, profile, ['build', '--offline', '--ast', '--extra-output', 'metadata', 'devdoc', 'userdoc']);
  const out = safePath(root, path.relative(root,path.resolve(root,config.out)));
  const contracts: Contract[] = [];
  for (const file of walk(out, '.json')) {
    const a = readJson(file, 64 * 1024 * 1024);
    if (!Array.isArray(a.abi) || !a.bytecode?.object || a.bytecode.object === '0x') continue;
    let metadata = a.metadata ?? a.rawMetadata;
    if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { continue; } }
    const target = Object.entries(metadata?.settings?.compilationTarget ?? {})[0];
    if (!target) continue;
    const [source, name] = target as [string, string];
    // Exclude stale artifacts for deleted sources.
    if (!fs.existsSync(path.resolve(root, source))) continue;
    const iface = new Interface(a.abi);
    const functions = iface.fragments.filter((f): f is FunctionFragment => f.type === 'function' && !['view', 'pure'].includes((f as FunctionFragment).stateMutability));
    contracts.push({id: `${source}:${name}`, name, source, artifact: file, abi: a.abi, functions: functions.sort((a,b) => a.format().localeCompare(b.format())), special: a.abi.filter((x: any) => ['fallback', 'receive'].includes(x.type)).map((x: any) => `${x.type}()`), metadata, userdoc: a.userdoc, devdoc: a.devdoc, ast: a.ast});
  }
  contracts.sort((a,b) => a.id.localeCompare(b.id));
  const ids = new Set<string>();
  for (const c of contracts) { if (ids.has(c.id)) fail('AMBIGUOUS_ARTIFACT', `Multiple artifacts for ${c.id}. Run forge clean then build.`, 2); ids.add(c.id); }
  const fingerprint = sourceFingerprint(root, config, contracts, forgeVersion, profile);
  const cache = safePath(root, '.clear-signing-cache/build.json');
  if (options.build === false) {
    if (!fs.existsSync(cache) || readJson(cache).fingerprint !== fingerprint) fail('STALE_BUILD', 'Build inputs or artifacts changed. Run without --no-build to rebuild.', 2);
  } else writeJson(cache, {fingerprint});
  const {deployments, calls} = readBroadcasts(root, typeof config.broadcast === 'string' ? config.broadcast : 'broadcast');
  return {root, profile, config, forgeVersion, contracts, fingerprint, deployments, calls};
}
const under = (root: string, dir: string | undefined, source: string) => !!dir && path.resolve(root, source).startsWith(path.resolve(root, dir) + path.sep);
// Production contracts: under src, outside test/script directories, with at least one entry point to describe.
export function defaultContracts(project: Project) {
  const {root, config} = project;
  return project.contracts.filter(c => under(root, config.src, c.source) && !under(root, config.test, c.source) && !under(root, config.script, c.source)
    && !c.source.endsWith('.t.sol') && !c.source.endsWith('.s.sol') && (c.functions.length > 0 || c.special.length > 0));
}
// Broadcast creations for compiled contracts. Ambiguous when several compiled contracts share the recorded name.
export function deployedContracts(project: Project): {deployment: BroadcastDeployment; contracts: Contract[]}[] {
  return project.deployments.map(deployment => ({deployment, contracts: project.contracts.filter(c => c.name === deployment.contractName)})).filter(x => x.contracts.length);
}
// Deployed contracts outside the default selection, typically dependencies under lib/.
export function suggestedContracts(project: Project, selected: Contract[]) {
  const ids = new Set(selected.map(c => c.id));
  const suggestions = new Map<string, {id: string; deployments: {chainId: number; address: string; script: string}[]; ambiguous: boolean}>();
  for (const {deployment, contracts} of deployedContracts(project)) for (const c of contracts) {
    if (ids.has(c.id) || (!c.functions.length && !c.special.length)) continue;
    const entry = suggestions.get(c.id) ?? {id: c.id, deployments: [], ambiguous: contracts.length > 1};
    entry.deployments.push({chainId: deployment.chainId, address: deployment.address, script: deployment.script});
    suggestions.set(c.id, entry);
  }
  return [...suggestions.values()];
}
export function getContract(project: Project, id: string) {
  const contract = project.contracts.find(c => c.id === id);
  if (!contract) fail('CONTRACT_NOT_FOUND', `${id} is not a deployable compiled contract. Available: ${project.contracts.map(c => c.id).join(', ')}`, 2);
  return contract;
}
