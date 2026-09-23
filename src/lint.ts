import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// The registry's own linter, run exactly as its CI runs it. The registry installs erc7730 from
// .github/requirements.txt (a Sourcify fork pinned by commit) for both lint and format, and lints with
// the flags in .github/workflows/pull_request.yml. Run through uvx so nothing is installed into the
// project. Absent uvx, the exact command is reported for the user to run.
export interface LintPin {requirement: string; flags: string[]; source: string}
// Registry CI as of ethereum/clear-signing-erc7730-registry#3038: Sourcify verification required.
export const DEFAULT_LINT_PIN: LintPin = {
  requirement: 'erc7730 @ git+https://github.com/sourcifyeth/python-erc7730@e823abc2f69b87db902464b8d204912831e8969e',
  flags: ['--require-verified'],
  source: 'built-in (registry CI after ethereum/clear-signing-erc7730-registry#3038, 2026-09-23)'
};
// A registry clone's own CI definition; a clone without it falls back to the built-in pin, and says so.
export function lintPinFromRegistry(clone: string): LintPin {
  const requirements = path.join(clone, '.github', 'requirements.txt'), workflow = path.join(clone, '.github', 'workflows', 'pull_request.yml');
  if (!fs.existsSync(requirements) || !fs.existsSync(workflow)) return {...DEFAULT_LINT_PIN, source: `${DEFAULT_LINT_PIN.source}; ${clone} has no .github/requirements.txt or pull_request.yml`};
  const requirement = /^\s*(erc7730\b[^#\r\n]*)/m.exec(fs.readFileSync(requirements, 'utf8'))?.[1].trim();
  const lintLine = /\berc7730 lint\b([^\r\n]*)/.exec(fs.readFileSync(workflow, 'utf8'))?.[1] ?? '';
  if (!requirement) return {...DEFAULT_LINT_PIN, source: `${DEFAULT_LINT_PIN.source}; no erc7730 requirement in ${requirements}`};
  // Flags that change the verdict; --gha only changes the output format.
  const flags = lintLine.split(/\s+/).filter(t => /^--[a-z][a-z0-9-]*$/.test(t) && t !== '--gha');
  return {requirement, flags, source: `${path.relative(clone, requirements)} and ${path.relative(clone, workflow)} in ${clone}`};
}
export interface LintResult {ran: boolean; command: string; requirement?: string; pinSource?: string; exitCode?: number; output?: string[]; warnings?: number; errors?: number; reason?: string}
const lintArgs = (files: string[], pin: LintPin) => ['--from', pin.requirement, 'erc7730', 'lint', ...pin.flags, ...files];
const quote = (arg: string) => /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
export function lintCommand(files: string[], pin: LintPin = DEFAULT_LINT_PIN) { return ['uvx', ...lintArgs(files, pin)].map(quote).join(' '); }
export function skippedLint(files: string[], pin: LintPin = DEFAULT_LINT_PIN): LintResult { return {ran: false, command: lintCommand(files, pin), requirement: pin.requirement, pinSource: pin.source, reason: 'skipped with --no-lint'}; }
const uvxAvailable = () => { const probe = spawnSync('uvx', ['--version'], {encoding: 'utf8', timeout: 20_000}); return !probe.error && probe.status === 0; };
export function runUpstreamLint(cwd: string, files: string[], pin: LintPin = DEFAULT_LINT_PIN, timeoutMs = 300_000): LintResult {
  const command = lintCommand(files, pin), recorded = {command, requirement: pin.requirement, pinSource: pin.source};
  if (!uvxAvailable()) return {ran: false, ...recorded, reason: 'uvx is not available; install uv (https://docs.astral.sh/uv/) or run the command yourself.'};
  // SOURCIFY_TOKEN, when set, passes through as it does in the registry's CI.
  const result = spawnSync('uvx', lintArgs(files, pin), {cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: {...process.env, COLUMNS: '200'}});
  if (result.error) return {ran: false, ...recorded, reason: `erc7730 lint could not run: ${result.error.message}`};
  // Lines, not one string: human output escapes control characters inside values. uvx's own install and build progress is dropped.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l && !/^\s*(Installed \d+ packages? in |(Updating|Updated|Building|Built) (https?:|erc7730 @))/.test(l));
  const count = (marker: string) => output.filter(l => new RegExp(`\\b${marker}:`).test(l)).length;
  return {ran: true, ...recorded, exitCode: result.status ?? -1, output, warnings: count('warning'), errors: count('error')};
}

// The registry's format bot rewrites descriptors into erc7730's canonical style on every change to
// master, with the same pinned package. Formatting at export time keeps a pull request's diff to the descriptor itself.
export function runUpstreamFormat(cwd: string, files: string[], pin: LintPin = DEFAULT_LINT_PIN, timeoutMs = 300_000): {ran: boolean; reason?: string} {
  if (!uvxAvailable()) return {ran: false, reason: 'uvx is not available'};
  const result = spawnSync('uvx', ['--from', pin.requirement, 'erc7730', 'format', ...files], {cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: {...process.env, COLUMNS: '200'}});
  if (result.error || result.status !== 0) return {ran: false, reason: `erc7730 format failed: ${(result.error?.message ?? (result.stderr || result.stdout)).trim().slice(-400)}`};
  return {ran: true};
}
