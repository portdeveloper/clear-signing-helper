import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export type Diagnostic = {code: string; message: string; file?: string; signature?: string; remedy?: string; severity?: 'warning'};
export class Failure extends Error {
  constructor(public code: string, message: string, public exitCode = 1, public details: Diagnostic[] = []) { super(message); }
}
export function fail(code: string, message: string, exitCode = 1): never { throw new Failure(code, message, exitCode); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
// Bound untrusted object trees before recursive schema validation or rendering.
export function assertTreeBudget(value: unknown, maxNodes = 32768, maxDepth = 96) {
  const pending: {value: unknown; depth: number}[] = [{value, depth: 0}];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > maxNodes || current.depth > maxDepth) fail('INPUT_LIMIT', `Input exceeds ${maxNodes} nodes or ${maxDepth} levels.`);
    if (current.value && typeof current.value === 'object') {
      const values = Object.values(current.value);
      if (nodes + pending.length + values.length > maxNodes) fail('INPUT_LIMIT', `Input exceeds ${maxNodes} nodes.`);
      for (const value of values) pending.push({value, depth: current.depth + 1});
    }
  }
}
export const readText = (file: string, maxBytes = 8 * 1024 * 1024) => {
  try {
    if (fs.statSync(file).size > maxBytes) fail('INPUT_TOO_LARGE', `${file} exceeds the ${Math.round(maxBytes / 1024 / 1024)} MiB input limit.`);
    return fs.readFileSync(file, 'utf8');
  } catch (e) { if (e instanceof Failure) throw e; fail('READ_FAILED', `Cannot read ${file}: ${(e as Error).message}`, 2); }
};
export function readJson<T = any>(file: string, maxBytes?: number): T {
  try { return JSON.parse(readText(file, maxBytes)); } catch (e) { if (e instanceof Failure) throw e; fail('INVALID_JSON', `Invalid JSON in ${file}: ${(e as Error).message}`); }
}
// Check existing ancestors too, so a symlink cannot redirect a future write outside the project.
export function safePath(root: string, relative: string): string {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) fail('UNSAFE_PATH', `Expected a relative project path: ${relative}`);
  const base = fs.realpathSync(root);
  const result = path.resolve(base, relative);
  const inside = (p: string) => p === base || p.startsWith(base + path.sep);
  if (!inside(result) || result === base) fail('UNSAFE_PATH', `Path escapes project: ${relative}`);
  let ancestor = result;
  while (!fs.existsSync(ancestor)) {
    // lstat sees dangling symlinks, unlike existsSync.
    try { if (fs.lstatSync(ancestor).isSymbolicLink()) fail('UNSAFE_PATH', `Dangling symlink: ${relative}`); } catch (e) { if (e instanceof Failure) throw e; }
    ancestor = path.dirname(ancestor);
  }
  if (!inside(fs.realpathSync(ancestor))) fail('UNSAFE_PATH', `Symlink escapes project: ${relative}`);
  return result;
}
export function writeJson(file: string, value: unknown) { writeText(file, JSON.stringify(value, null, 2) + '\n'); }
export function writeText(file: string, value: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, value, {flag: 'wx'});
  try { fs.renameSync(temp, file); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function walk(dir: string, suffix: string, skip = new Set<string>(), depth = 0): string[] {
  if (depth > 40) fail('INPUT_TOO_DEEP', `Directory nesting exceeds limit: ${dir}`);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const p = path.join(dir, entry.name);
    if (skip.has(entry.name) || entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return walk(p, suffix, skip, depth + 1);
    return entry.isFile() && entry.name.endsWith(suffix) ? [p] : [];
  });
}
export function assertKeys(value: any, keys: string[], location: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', `${location} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('UNSUPPORTED_FEATURE', `${location}.${key} is not supported by this tool version.`);
}
