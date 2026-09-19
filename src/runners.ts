import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fail, readJson } from './io.js';

// The two implementations the registry's CI runs against every testsv2 file. Pins mirror
// .github/actions/run-*-tests/action.yml in ethereum/clear-signing-erc7730-registry; pass a clone
// to read them from there instead. Building them is a one-time, opt-in, network-dependent step.
export interface RunnerPins {sourcify: {repo: string; ref: string}; rust: {repo: string; ref: string}}
export const DEFAULT_PINS: RunnerPins = {
  sourcify: {repo: 'https://github.com/sourcifyeth/clear-signing-test-runner.git', ref: 'dae3cdabd0eab26173d7f7a31a2ca7e75bf07daf'}, // registry CI @ 2026-08-06
  rust: {repo: 'https://github.com/llbartekll/clear-signing.git', ref: '10605ba78f3d6f3f13102e0f3a3ecbc44ac500dc'}               // registry CI @ 2026-08-13
};
export interface CaseResult {description: string; status: 'pass' | 'fail' | 'error' | 'skipped'; message?: string; rendered?: unknown}
export interface RunnerResult {name: 'sourcify' | 'rust'; ran: boolean; passed: boolean; implementation?: string; ref: string; cases: Record<string, number>; failures: CaseResult[]; resultsFile?: string; reason?: string; command?: string}

export function runnersDir() { return process.env.CLEAR_SIGNING_RUNNERS_DIR ?? path.join(os.homedir(), '.cache', 'clear-signing-helper', 'runners'); }
export function pinsFromRegistry(clone: string): RunnerPins {
  const read = (name: string, repo: string) => {
    const file = path.join(clone, '.github', 'actions', name, 'action.yml');
    if (!fs.existsSync(file)) fail('RUNNER_PINS', `${file} not found; is ${clone} a registry clone?`, 2);
    const text = fs.readFileSync(file, 'utf8');
    const repository = /repository:\s*(\S+)/.exec(text)?.[1], ref = /ref:\s*([0-9a-f]{40})/.exec(text)?.[1];
    if (!repository || !ref) fail('RUNNER_PINS', `Could not read repository/ref from ${file}.`, 2);
    return {repo: `https://github.com/${repository}.git`, ref};
  };
  return {sourcify: read('run-sourcify-tests', 'sourcify'), rust: read('run-rust-tests', 'rust')};
}
const sh = (cmd: string, args: string[], cwd: string, timeout: number) => {
  const r = spawnSync(cmd, args, {cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024, env: {...process.env, CI: '1'}});
  if (r.error) fail('RUNNER_SETUP', `${cmd} ${args.join(' ')}: ${r.error.message}`, 2);
  if (r.status !== 0) fail('RUNNER_SETUP', `${cmd} ${args.join(' ')} failed in ${cwd}:\n${(r.stderr || r.stdout).slice(-2000)}`, 2);
  return r.stdout;
};
export interface Toolchain {sourcifyCli: string; rustBinary: string; pins: RunnerPins; dir: string}
// Clone at the pinned revision and build. Idempotent: a finished build is reused.
export function setupRunners(pins = DEFAULT_PINS, log: (line: string) => void = () => {}): Toolchain {
  const dir = runnersDir(); fs.mkdirSync(dir, {recursive: true});
  // Fast path: both artifacts for these pins already exist; no git or network needed.
  const built = {sourcifyCli: path.join(dir, `sourcify-${pins.sourcify.ref.slice(0, 8)}`, 'dist', 'cli.js'), rustBinary: path.join(dir, `rust-${pins.rust.ref.slice(0, 8)}`, 'target', 'release', 'cs-test')};
  if (fs.existsSync(built.sourcifyCli) && fs.existsSync(built.rustBinary)) return {...built, pins, dir};
  const need = (cmd: string, hint: string) => { if (spawnSync(cmd, ['--version'], {encoding: 'utf8'}).error) fail('RUNNER_TOOLCHAIN', `${cmd} is required to build the registry runners (${hint}).`, 2); };
  const checkout = (name: string, pin: {repo: string; ref: string}) => {
    const target = path.join(dir, `${name}-${pin.ref.slice(0, 8)}`);
    if (!fs.existsSync(path.join(target, '.git'))) { log(`Cloning ${pin.repo} at ${pin.ref.slice(0, 8)}`); need('git', 'https://git-scm.com'); sh('git', ['clone', '--quiet', pin.repo, target], dir, 600_000); }
    sh('git', ['checkout', '--quiet', pin.ref], target, 60_000);
    return target;
  };
  const s = checkout('sourcify', pins.sourcify), sourcifyCli = path.join(s, 'dist', 'cli.js');
  if (!fs.existsSync(sourcifyCli)) { need('npm', 'Node.js 22+'); log('Building the Sourcify runner (npm ci, npm run build)'); sh('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], s, 900_000); sh('npm', ['run', 'build'], s, 900_000); }
  const r = checkout('rust', pins.rust), rustBinary = path.join(r, 'target', 'release', 'cs-test');
  if (!fs.existsSync(rustBinary)) { need('cargo', 'https://rustup.rs'); log('Building the Rust runner (cargo build --release --locked -p cs-test); this can take several minutes'); sh('cargo', ['build', '--release', '--locked', '-p', 'cs-test'], r, 1_800_000); }
  return {sourcifyCli, rustBinary, pins, dir};
}
// Run both runners on one testsv2 file. registryRoot is the directory that contains registry/<entity>/.
export function runRegistryRunners(tc: Toolchain, testsFile: string, registryRoot: string, outDir: string): RunnerResult[] {
  fs.mkdirSync(outDir, {recursive: true});
  const expected = (() => { try { return (readJson(testsFile).tests ?? []).length as number; } catch { return 0; } })();
  const one = (name: 'sourcify' | 'rust', cmd: string, args: string[], cwd: string, ref: string): RunnerResult => {
    const resultsFile = path.join(outDir, `${name}.results.json`);
    const command = [cmd, ...args].join(' ');
    const r = spawnSync(cmd, args, {cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024});
    fs.writeFileSync(path.join(outDir, `${name}.log`), `${r.stdout ?? ''}${r.stderr ?? ''}`);
    if (r.error) return {name, ran: false, passed: false, ref, cases: {}, failures: [], reason: r.error.message, command};
    if (!fs.existsSync(resultsFile)) return {name, ran: true, passed: false, ref, cases: {}, failures: [], reason: `runner exited ${r.status} without writing results (see ${name}.log)`, command};
    let data: any; try { data = readJson(resultsFile); } catch (e) { return {name, ran: true, passed: false, ref, cases: {}, failures: [], reason: `unreadable results: ${(e as Error).message}`, command}; }
    const cases: CaseResult[] = Array.isArray(data.cases) ? data.cases : [];
    const counts: Record<string, number> = {};
    for (const c of cases) counts[c.status] = (counts[c.status] ?? 0) + 1;
    // A written report is not a pass: every case must be `pass` and the count must match the fixture.
    const passed = cases.length === expected && cases.every(c => c.status === 'pass');
    return {name, ran: true, passed, implementation: data.implementation, ref, cases: counts, failures: cases.filter(c => c.status !== 'pass').map(c => ({description: c.description, status: c.status, ...(c.message ? {message: c.message} : {}), ...(c.rendered !== undefined ? {rendered: c.rendered} : {})})), resultsFile, command};
  };
  return [
    one('sourcify', process.execPath, [tc.sourcifyCli, testsFile, '--output', path.join(outDir, 'sourcify.results.json'), '--verbose'], path.dirname(tc.sourcifyCli), tc.pins.sourcify.ref),
    one('rust', tc.rustBinary, ['run', testsFile, '--registry', path.join(registryRoot, 'registry'), '--output', path.join(outDir, 'rust.results.json')], registryRoot, tc.pins.rust.ref)
  ];
}
