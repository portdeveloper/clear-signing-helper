import { spawnSync } from 'node:child_process';

// The registry's own linter, pinned to the version its CI uses. Run through uvx so nothing is
// installed into the project. Absent uvx, the exact command is reported for the user to run.
export const ERC7730_TOOL_VERSION = '1.0.10';
export interface LintResult {ran: boolean; command: string; exitCode?: number; output?: string[]; warnings?: number; errors?: number; reason?: string}
export function lintCommand(files: string[]) { return ['uvx', '--from', `erc7730==${ERC7730_TOOL_VERSION}`, 'erc7730', 'lint', ...files]; }
export function runUpstreamLint(cwd: string, files: string[], timeoutMs = 300_000): LintResult {
  const [bin, ...args] = lintCommand(files);
  const command = [bin, ...args].join(' ');
  const probe = spawnSync(bin, ['--version'], {encoding: 'utf8', timeout: 20_000});
  if (probe.error || probe.status !== 0) return {ran: false, command, reason: 'uvx is not available; install uv (https://docs.astral.sh/uv/) or run the command yourself.'};
  const result = spawnSync(bin, args, {cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: {...process.env, COLUMNS: '200'}});
  if (result.error) return {ran: false, command, reason: `erc7730 lint could not run: ${result.error.message}`};
  // Lines, not one string: human output escapes control characters inside values.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l && !/^Installed \d+ packages? in /.test(l));
  const count = (marker: string) => output.filter(l => new RegExp(`\\b${marker}:`).test(l)).length;
  return {ran: true, command, exitCode: result.status ?? -1, output, warnings: count('warning'), errors: count('error')};
}

// The registry's format bot rewrites descriptors into erc7730's canonical style on every change to
// master. Formatting at export time keeps a pull request's diff to the descriptor itself.
export function runUpstreamFormat(cwd: string, files: string[], timeoutMs = 300_000): {ran: boolean; reason?: string} {
  const [bin, ...prefix] = ['uvx', '--from', `erc7730==${ERC7730_TOOL_VERSION}`, 'erc7730', 'format'];
  const probe = spawnSync(bin, ['--version'], {encoding: 'utf8', timeout: 20_000});
  if (probe.error || probe.status !== 0) return {ran: false, reason: 'uvx is not available'};
  const result = spawnSync(bin, [...prefix, ...files], {cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: {...process.env, COLUMNS: '200'}});
  if (result.error || result.status !== 0) return {ran: false, reason: `erc7730 format failed: ${(result.error?.message ?? (result.stderr || result.stdout)).trim().slice(-400)}`};
  return {ran: true};
}
