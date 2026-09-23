// Runs both registry test runners, at the pins the clone's CI names, on one testsv2 file.
import { setupRunners, runRegistryRunners, pinsFromRegistry } from '../../src/runners.ts';
const [tests, root, out, clone] = process.argv.slice(2);
const tc = setupRunners(pinsFromRegistry(clone));
for (const r of runRegistryRunners(tc, tests, root, out)) console.log(JSON.stringify({name: r.name, ran: r.ran, passed: r.passed, cases: r.cases, failures: r.failures.map(f => ({d: f.description, s: f.status, m: f.message?.slice(0, 400)}))}));
