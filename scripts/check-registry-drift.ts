// Registry drift: do the tool's built-in pins and schemas still match the registry's CI? The registry renames
// workflows and bumps pins every few days, and each change silently turned the tool's green into something other
// than the registry's green until someone noticed. Usage: npx tsx scripts/check-registry-drift.ts [<registry-clone>]
// Without a clone, a shallow clone of master is made in a temporary directory. Exits 1 on any drift.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_LINT_PIN, lintPinFromRegistry, lintWorkflow } from '../src/lint.js';
import { DEFAULT_PINS, pinsFromRegistry } from '../src/runners.js';

const repo = path.resolve(import.meta.dirname, '..');
let clone = process.argv[2], temp: string | undefined;
if (!clone) {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-registry-drift-'));
  clone = path.join(temp, 'registry');
  const r = spawnSync('git', ['clone', '--quiet', '--depth', '1', 'https://github.com/ethereum/clear-signing-erc7730-registry.git', clone], {encoding: 'utf8'});
  if (r.status !== 0) { console.error(`git clone failed: ${r.stderr || r.error?.message}`); process.exit(2); }
}
const head = spawnSync('git', ['-C', clone, 'log', '-1', '--format=%h %cs'], {encoding: 'utf8'}).stdout.trim();
console.log(`registry ${clone}${head ? ` at ${head}` : ''}`);

interface Check {name: string; ok: boolean; tool: string; registry: string; fix: string}
const checks: Check[] = [];
const workflow = lintWorkflow(clone);
checks.push({name: 'lint workflow', ok: !!workflow, tool: 'a workflow that runs `erc7730 lint`', registry: workflow ? path.relative(clone, workflow) : 'none found',
  fix: 'find where registry CI now lints and teach lintWorkflow in src/lint.ts'});
const lint = lintPinFromRegistry(clone);
checks.push({name: 'lint requirement', ok: lint.requirement === DEFAULT_LINT_PIN.requirement, tool: DEFAULT_LINT_PIN.requirement, registry: lint.requirement,
  fix: 'update DEFAULT_LINT_PIN in src/lint.ts, re-lint #3003 and the descriptors #2611 affects'});
checks.push({name: 'lint flags', ok: lint.flags.join(' ') === DEFAULT_LINT_PIN.flags.join(' '), tool: DEFAULT_LINT_PIN.flags.join(' ') || '(none)', registry: lint.flags.join(' ') || '(none)',
  fix: 'update DEFAULT_LINT_PIN.flags in src/lint.ts'});
const pins = pinsFromRegistry(clone);
for (const name of ['sourcify', 'rust'] as const) {
  const tool = DEFAULT_PINS[name], reg = pins[name];
  checks.push({name: `${name} runner`, ok: tool.repo === reg.repo && tool.ref === reg.ref, tool: `${tool.repo}@${tool.ref}`, registry: `${reg.repo}@${reg.ref}`,
    fix: 'update DEFAULT_PINS in src/runners.ts, then `clear-signing registry setup-runners` and re-run a bundle through both runners'});
}
// Schemas: the registry's CI validates against its specs/ copies. A change here moves ENGINE.schema, so it is reported, never auto-fixed.
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as any)[k])])) : v;
for (const file of ['erc7730-v2.schema.json', 'erc7730-tests-v2.schema.json']) {
  const theirs = path.join(clone, 'specs', file), ours = path.join(repo, 'schemas', file);
  const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const ok = fs.existsSync(theirs) && JSON.stringify(canonical(read(ours))) === JSON.stringify(canonical(read(theirs)));
  const version = (f: string) => fs.existsSync(f) ? String(read(f).version ?? 'unversioned') : 'missing';
  checks.push({name: `schema ${file}`, ok, tool: `schemas/${file} (${version(ours)})`, registry: `specs/${file} (${version(theirs)})`,
    fix: 'review the diff; updating schemas/ changes the engine fingerprint (see CLAUDE.md working conventions) and needs a release'});
}

for (const c of checks) console.log(`${c.ok ? 'ok   ' : 'DRIFT'} ${c.name}${c.ok ? '' : `\n      tool:     ${c.tool}\n      registry: ${c.registry}\n      fix:      ${c.fix}`}`);
if (temp) fs.rmSync(temp, {recursive: true, force: true});
const drift = checks.filter(c => !c.ok).length;
console.log(drift ? `${drift} of ${checks.length} checks drifted.` : `All ${checks.length} checks match.`);
process.exit(drift ? 1 : 0);
