import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FunctionFragment, Interface, Transaction, getAddress, isAddress } from 'ethers';
import { parseSignature } from './descriptors.js';
import { renderFixture, blockingWarnings, type Fixture } from './fixtures.js';
import { fetchVerifiedContract, type VerifiedContract } from './fetch.js';
import { testCase, validateRegistryTests } from './registry.js';
import { runUpstreamLint, lintCommand, type LintResult } from './lint.js';
import { setupRunners, runRegistryRunners, pinsFromRegistry, type RunnerResult } from './runners.js';
import { fail, readJson, readText, safePath, writeText, Failure } from './io.js';
import type { Contract } from './foundry.js';
import { appendToContainer, detectStep, scanJson, spanAt } from './json-edit.js';

// Add one deployment to a descriptor that already lives in a registry clone. The address is proven
// to be the same contract by requiring every selector the descriptor formats to exist in the
// verified ABI at that address. A matching test case is rendered, not copied. Nothing is committed.
export interface AddDeploymentOptions {
  registry: string; descriptor: string; chainId: number; address: string;
  abiFile?: string; tokens?: string[]; addressNames?: string[]; description?: string; test?: boolean; lint?: boolean; runners?: boolean; log?: (line: string) => void;
}
export async function addDeployment(o: AddDeploymentOptions) {
  const registry = fs.realpathSync(path.resolve(o.registry));
  const descriptorFile = safePath(registry, o.descriptor);
  if (!fs.existsSync(descriptorFile)) fail('DESCRIPTOR_NOT_FOUND', `${o.descriptor} does not exist under ${registry}.`, 2);
  if (!/^calldata-.*\.json$/.test(path.basename(descriptorFile))) fail('UNSUPPORTED_DESCRIPTOR', 'Only calldata-*.json descriptors are supported; EIP-712 descriptors have no deployments to add.', 2);
  const original = readText(descriptorFile);
  const d = JSON.parse(original);
  if (d.includes !== undefined || !d.display?.formats) fail('UNSUPPORTED_DESCRIPTOR', 'This descriptor includes another file or has no display.formats; edit it by hand.', 2);
  if (!Array.isArray(d.context?.contract?.deployments)) fail('UNSUPPORTED_DESCRIPTOR', 'Descriptor has no context.contract.deployments array.', 2);
  if (!Number.isSafeInteger(o.chainId) || o.chainId <= 0) fail('FIXTURE_ARGUMENTS', '--chain-id must be a positive integer.', 2);
  if (!isAddress(o.address)) fail('INVALID_ADDRESS', `${o.address} is not a valid address.`, 2);
  const address = getAddress(o.address);
  if (d.context.contract.deployments.some((x: any) => x.chainId === o.chainId && String(x.address).toLowerCase() === address.toLowerCase())) fail('DEPLOYMENT_EXISTS', `${o.chainId}:${address} is already listed in ${o.descriptor}.`, 2);

  // 1. Obtain the ABI at the new address, verified unless the user supplies one they trust.
  let abi: any[], verification: {source: string; match?: string; url?: string; proxy?: VerifiedContract['proxy']; name?: string};
  if (o.abiFile) {
    const raw = readJson(path.resolve(o.abiFile));
    abi = Array.isArray(raw) ? raw : raw?.abi;
    if (!Array.isArray(abi)) fail('INVALID_ABI', `${o.abiFile} must contain an ABI array.`, 2);
    verification = {source: 'local file (not verified against on-chain source)', url: o.abiFile};
  } else {
    const v = await fetchVerifiedContract(o.chainId, address);
    abi = v.abi; verification = {source: v.source, match: v.match, url: v.url, proxy: v.proxy, name: v.name};
  }
  const iface = new Interface(abi);
  const available = new Map<string, FunctionFragment>();
  for (const f of iface.fragments) if (f.type === 'function') available.set((f as FunctionFragment).selector.toLowerCase(), f as FunctionFragment);

  // 2. Prove: every function the descriptor describes must exist, by selector, at the new address.
  const formats = Object.keys(d.display.formats);
  const missing = formats.filter(key => { try { return !available.has(parseSignature(key).selector.toLowerCase()); } catch { return true; } });
  if (missing.length) fail('ABI_MISMATCH', `The verified ABI at ${o.chainId}:${address} lacks ${missing.length} of ${formats.length} functions the descriptor formats: ${missing.map(k => parseSignature(k).format('sighash')).join(', ')}. This is not the same contract; nothing was changed.`, 1);

  // 3. Render a test case for the new chain from an existing one, when a tests file exists.
  const entityDir = path.dirname(descriptorFile), name = path.basename(descriptorFile);
  const testsFile = path.join(entityDir, 'testsv2', name.replace(/\.json$/, '.tests.json'));
  const updated = structuredClone(d);
  updated.context.contract.deployments.push({chainId: o.chainId, address});
  let test: {file: string; description: string; template: string; expected: any} | undefined;
  const skippedTemplates: string[] = [];
  let testsOriginal: string | undefined, testsUpdated: any;
  if (o.test !== false && fs.existsSync(testsFile)) {
    testsOriginal = readText(testsFile);
    testsUpdated = JSON.parse(testsOriginal);
    const cases: any[] = Array.isArray(testsUpdated.tests) ? testsUpdated.tests : [];
    const knownTo = new Set(d.context.contract.deployments.map((x: any) => String(x.address).toLowerCase()));
    const decodable = cases.map(c => { try { const tx = Transaction.from(c.rawTx); return {c, tx}; } catch { return undefined; } }).filter((x): x is {c: any; tx: Transaction} => !!x && !!x.tx.to && typeof x.tx.data === 'string' && available.has(x.tx.data.slice(0, 10).toLowerCase()));
    // Prefer cases aimed at a known deployment; try each until one renders cleanly on the new chain.
    const candidates = [...decodable.filter(x => knownTo.has(x.tx.to!.toLowerCase())), ...decodable.filter(x => !knownTo.has(x.tx.to!.toLowerCase()))];
    if (!candidates.length) fail('NO_TEMPLATE_TEST', `${path.relative(registry, testsFile)} has no calldata test that decodes against the verified ABI; add the deployment with --no-test and write the test by hand.`, 1);
    const provider = testsUpdated.dataProvider ?? {};
    const parse = (list: string[] | undefined, what: string) => Object.fromEntries((list ?? []).map(entry => {
      const m = /^(0x[0-9a-fA-F]{40})=(.+)$/.exec(entry);
      if (!m) fail('FIXTURE_ARGUMENTS', `--${what} expects <address>=<value>, got ${entry}.`, 2);
      return [m[1], m[2]];
    }));
    const extraTokens = Object.fromEntries(Object.entries(parse(o.tokens, 'token')).map(([addr, spec]) => {
      const m = /^([^:]+):(\d{1,3})$/.exec(spec);
      if (!m) fail('FIXTURE_ARGUMENTS', `--token expects <address>=<SYMBOL>:<decimals>, got ${addr}=${spec}.`, 2);
      return [addr, {name: m[1], symbol: m[1], decimals: Number(m[2])}];
    }));
    const extraNames = parse(o.addressNames, 'address-name');
    const contract: Contract = {id: name, name: verification.name ?? name, source: name, artifact: '', abi, functions: [...available.values()].filter(f => !['view', 'pure'].includes(f.stateMutability)), special: abi.filter((x: any) => ['fallback', 'receive'].includes(x.type)).map((x: any) => `${x.type}()`), metadata: {}};
    const attempts: string[] = [];
    let template: {c: any; tx: Transaction} | undefined, fixture: Fixture | undefined, rendering: Awaited<ReturnType<typeof renderFixture>> | undefined;
    for (const candidate of candidates) {
      const f: Fixture = {contract: name, chainId: o.chainId, to: address, data: candidate.tx.data, value: candidate.tx.value.toString(), ...(candidate.c.from && isAddress(candidate.c.from) ? {from: getAddress(candidate.c.from)} : {}),
        tokens: {...(provider.tokens ?? {}), ...extraTokens}, addressNames: {...(provider.addressNames ?? {}), ...extraNames},
        ...(provider.ensNames ? {ensNames: provider.ensNames} : {}), ...(provider.nftCollectionNames ? {nftCollectionNames: provider.nftCollectionNames} : {}), ...(provider.blockTimestamps ? {blockTimestamps: provider.blockTimestamps} : {})};
      try {
        const r = await renderFixture(f, updated, contract);
        const blocking = blockingWarnings(r);
        if (blocking.length) { attempts.push(`"${candidate.c.description}": needs metadata for chain ${o.chainId} (${blocking.map(w => w.code).join(', ')})`); continue; }
        template = candidate; fixture = f; rendering = r; break;
      } catch (e) {
        if (!(e instanceof Failure)) throw e;
        attempts.push(`"${candidate.c.description}": ${e.code === 'NONCANONICAL_CALLDATA' ? 'its calldata carries bytes beyond the ABI encoding, which this tool never re-encodes' : e.message}`);
      }
    }
    if (!template || !fixture || !rendering) fail('NO_RENDERABLE_TEMPLATE', `No existing test case could be rendered for chain ${o.chainId}:\n  ${attempts.join('\n  ')}\nSupply chain metadata with --token <address>=<SYMBOL>:<decimals> or --address-name <address>=<Name> where that is the cause, or add the deployment alone with --no-test and write the test case by hand. Nothing was changed.`, 1);
    const description = o.description ?? (/ - chain \d+$/.test(template.c.description) ? template.c.description.replace(/ - chain \d+$/, ` - chain ${o.chainId}`) : `${template.c.description} - chain ${o.chainId}`);
    if (cases.some(c => c.description === description)) fail('DUPLICATE_TEST', `A test named "${description}" already exists; pass --description.`, 2);
    const entry = testCase(description, fixture, rendering, updated.metadata?.owner ?? '');
    if (attempts.length) skippedTemplates.push(...attempts);
    for (const [addr, meta] of Object.entries(extraTokens)) (testsUpdated.dataProvider ??= {}).tokens = {...(testsUpdated.dataProvider.tokens ?? {}), [addr.toLowerCase()]: meta};
    for (const [addr, label] of Object.entries(extraNames)) (testsUpdated.dataProvider ??= {}).addressNames = {...(testsUpdated.dataProvider.addressNames ?? {}), [addr.toLowerCase()]: label};
    testsUpdated.tests = [...cases, entry];
    validateRegistryTests(testsUpdated);
    test = {file: path.relative(registry, testsFile), description, template: template.c.description, expected: entry.expected};
  }

  // 4. Insert into the existing text so the diff is only the change, then run the registry's own checks.
  writeText(descriptorFile, insertDeployment(original, o.chainId, address));
  if (testsOriginal !== undefined) writeText(testsFile, insertTest(testsOriginal, testsUpdated));
  const relDescriptor = path.relative(registry, descriptorFile);
  const lint: LintResult = o.lint === false ? {ran: false, command: lintCommand([relDescriptor]).join(' '), reason: 'skipped with --no-lint'} : runUpstreamLint(registry, [relDescriptor]);
  // The registry's implementations, run in the clone itself with pins read from its CI definition.
  let runners: RunnerResult[] | null = null;
  if (o.runners && fs.existsSync(testsFile)) {
    const tc = setupRunners(pinsFromRegistry(registry), o.log);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-runners-'));
    runners = runRegistryRunners(tc, testsFile, registry, outDir);
    const failed = runners.filter(r => !r.passed);
    if (failed.length) fail('REGISTRY_RUNNER_FAILED', `${failed.map(r => `${r.name} (${r.implementation ?? r.ref.slice(0, 8)}): ${r.reason ?? JSON.stringify(r.cases)}${r.failures.length ? `; ${r.failures.map(f => `"${f.description}" ${f.status}${f.message ? ` (${f.message})` : ''}`).join('; ')}` : ''}`).join('\n')}\nRendered output is under ${outDir}. The files in the clone were changed; revert them with git if you do not want to keep the edit.`, 1);
  }
  const entity = path.basename(entityDir);
  const branch = `${entity}-chain-${o.chainId}`;
  const changed = [relDescriptor, ...(test ? [test.file] : [])];
  const next = [
    `git -C ${registry} checkout -b ${branch}`,
    `git -C ${registry} add ${changed.join(' ')}`,
    `git -C ${registry} commit -m "${entity}: add ${verification.name ?? name.replace(/^calldata-|\.json$/g, '')} deployment on chain ${o.chainId}"`,
    `gh pr create --repo ethereum/clear-signing-erc7730-registry --head ${branch} --title "${entity}: add chain ${o.chainId} deployment" --body "Adds ${o.chainId}:${address} to ${relDescriptor}${test ? ` with test case \\"${test.description}\\"` : ''}. ABI verified via ${verification.source}${verification.match ? ` (${verification.match})` : ''}."`
  ];
  return {descriptor: relDescriptor, deployment: {chainId: o.chainId, address}, verification, selectorsChecked: formats.length, test: test ?? null, skippedTemplates, lint, registryRunners: runners, changed, next, note: 'Files changed in the registry clone; nothing committed. Open the pull request from an account tied to the contract owner.'};
}
// The new deployment copies the formatting of the last existing entry.
function insertDeployment(original: string, chainId: number, address: string) {
  const list = spanAt(scanJson(original), ['context', 'contract', 'deployments'])!;
  const last = [...list.children.values()].pop();
  let entry = `{ "chainId": ${chainId}, "address": "${address}" }`;
  if (last) {
    const raw = original.slice(last.start, last.end);
    const swapped = raw.replace(/("chainId"\s*:\s*)\d+/, `$1${chainId}`).replace(/("address"\s*:\s*")0x[0-9a-fA-F]{40}(")/, `$10x${address.slice(2)}$2`);
    if (swapped !== raw && swapped.includes(String(chainId)) && swapped.includes(address)) entry = swapped;
  }
  const out = appendToContainer(original, ['context', 'contract', 'deployments'], entry);
  if (!out) fail('UNSUPPORTED_DESCRIPTOR', 'Could not locate context.contract.deployments in the file text.', 2);
  JSON.parse(out); // never write something that does not parse
  return out;
}
// New dataProvider entries and the new test case are appended in the file's own indentation.
function insertTest(original: string, updated: any) {
  const step = detectStep(original);
  const parsedOriginal = JSON.parse(original);
  let text = original;
  for (const map of ['tokens', 'addressNames'] as const) {
    for (const [addr, meta] of Object.entries(updated.dataProvider?.[map] ?? {})) {
      if (parsedOriginal.dataProvider?.[map]?.[addr] !== undefined) continue;
      const entry = `"${addr}": ${JSON.stringify(meta, null, step)}`;
      const out = appendToContainer(text, ['dataProvider', map], entry);
      if (!out) { text = JSON.stringify(updated, null, step) + (original.endsWith('\n') ? '\n' : ''); JSON.parse(text); return text; }
      text = out;
    }
  }
  const added = updated.tests[updated.tests.length - 1];
  const out = appendToContainer(text, ['tests'], JSON.stringify(added, null, step));
  if (!out) fail('UNSUPPORTED_DESCRIPTOR', 'Could not locate the tests array in the test file text.', 2);
  JSON.parse(out);
  return out;
}
