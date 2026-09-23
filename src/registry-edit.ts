import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FunctionFragment, Interface, Transaction, TypedDataEncoder, getAddress, isAddress, keccak256, toUtf8Bytes } from 'ethers';
import { formatTypedData, mergeDescriptors, eip712, type Descriptor as RendererDescriptor } from '@ethereum-sourcify/clear-signing';
import { parseSignature } from './descriptors.js';
import { renderFixture, blockingWarnings, INFORMATIONAL_WARNINGS, type Fixture } from './fixtures.js';
import { fetchVerifiedContract, rpcCall, type VerifiedContract } from './fetch.js';
import { testCase, typedDataTestCase, validateRegistryTests } from './registry.js';
import { runUpstreamLint, skippedLint, lintPinFromRegistry, type LintResult } from './lint.js';
import { setupRunners, runRegistryRunners, pinsFromRegistry, type RunnerResult } from './runners.js';
import { KNOWN_CHAINS } from './chains.js';
import { runnerDivergence, type PortabilityFinding } from './portability.js';
import { fail, readJson, readText, safePath, walk, writeText, Failure } from './io.js';
import type { Contract } from './foundry.js';
import { appendToContainer, detectStep, insertIntoArray, scanJson, spanAt } from './json-edit.js';

// Add one deployment to a descriptor that already lives in a registry clone. A calldata address is
// proven to be the same contract by requiring every selector the descriptor formats to exist in the
// verified ABI at that address; an EIP-712 address by matching its live DOMAIN_SEPARATOR() against
// the descriptor's domain. A matching test case is rendered, not copied. Nothing is committed.
export interface AddDeploymentOptions {
  registry: string; descriptor: string; chainId: number; address: string;
  abiFile?: string; rpcUrl?: string; template?: string; set?: string[];
  tokens?: string[]; addressNames?: string[]; description?: string; test?: boolean; lint?: boolean; runners?: boolean; skipRegistryRunners?: string; log?: (line: string) => void;
}
export async function addDeployment(o: AddDeploymentOptions) {
  const registry = fs.realpathSync(path.resolve(o.registry));
  const descriptorFile = safePath(registry, o.descriptor);
  if (!fs.existsSync(descriptorFile)) fail('DESCRIPTOR_NOT_FOUND', `${o.descriptor} does not exist under ${registry}.`, 2);
  if (!Number.isSafeInteger(o.chainId) || o.chainId <= 0) fail('FIXTURE_ARGUMENTS', '--chain-id must be a positive integer.', 2);
  if (!isAddress(o.address)) fail('INVALID_ADDRESS', `${o.address} is not a valid address.`, 2);
  const address = getAddress(o.address);
  if (o.skipRegistryRunners !== undefined && !o.skipRegistryRunners.trim()) fail('USAGE_ERROR', '--skip-registry-runners needs a reason, which is recorded in the result.', 2);
  if (o.skipRegistryRunners !== undefined && o.runners) fail('USAGE_ERROR', '--runners and --skip-registry-runners exclude each other.', 2);
  if (/^eip712-.*\.json$/.test(path.basename(descriptorFile))) return addTypedDataDeployment(o, registry, descriptorFile, address);
  if (!/^calldata-.*\.json$/.test(path.basename(descriptorFile))) fail('UNSUPPORTED_DESCRIPTOR', 'Only calldata-*.json and eip712-*.json descriptors are supported.', 2);
  if (o.rpcUrl || o.set?.length || o.template) fail('USAGE_ERROR', '--rpc-url, --set and --template apply to EIP-712 descriptors; a calldata deployment is proven by its verified ABI.', 2);
  const original = readText(descriptorFile);
  const d = JSON.parse(original);
  if (d.includes !== undefined || !d.display?.formats) fail('UNSUPPORTED_DESCRIPTOR', 'This descriptor includes another file or has no display.formats; edit it by hand.', 2);
  if (!Array.isArray(d.context?.contract?.deployments)) fail('UNSUPPORTED_DESCRIPTOR', 'Descriptor has no context.contract.deployments array.', 2);
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
  const testsFile = testsFileFor(descriptorFile);
  const updated = structuredClone(d);
  updated.context.contract.deployments.push({chainId: o.chainId, address});
  let test: {file: string; description: string; template: string; expected: any} | undefined;
  const skippedTemplates: string[] = [];
  let testsOriginal: string | undefined, testsUpdated: any, divergence: PortabilityFinding[] = [];
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
    const {extraTokens, extraNames} = providerExtras(o);
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
    // The rendered expectation comes from this tool's renderer; where it can differ from the
    // registry's runners, the runners check it or the user records why not, before anything is written.
    divergence = runnerDivergence(name, updated, new Set([available.get(template.tx.data.slice(0, 10).toLowerCase())!.format('sighash')]));
    if (divergence.length && !o.runners && !o.skipRegistryRunners) fail('REGISTRY_RUNNERS_REQUIRED', `The new test case displays ${divergence.map(f => `${f.path} (${f.code})`).join(', ')}, a shape where this tool's renderer and the registry CI's can differ, so its expected values may fail registry CI. Rerun with --runners, or with --skip-registry-runners "<reason>" to record why not. Nothing was changed.`, 1);
    const description = newDescription(o, template.c.description, cases);
    const entry = testCase(description, fixture, rendering, updated.metadata?.owner ?? '');
    if (attempts.length) skippedTemplates.push(...attempts);
    addProviderExtras(testsUpdated, extraTokens, extraNames);
    testsUpdated.tests = [...cases, entry];
    validateRegistryTests(testsUpdated);
    test = {file: path.relative(registry, testsFile), description, template: template.c.description, expected: entry.expected};
  }

  // 4. Insert into the existing text so the diff is only the change, then run the registry's own checks.
  const relDescriptor = path.relative(registry, descriptorFile);
  const {lint, runners} = writeChecked(o, registry, [
    {file: descriptorFile, original, updated: insertDeployment(original, ['context', 'contract', 'deployments'], o.chainId, address)},
    ...(testsOriginal !== undefined ? [{file: testsFile, original: testsOriginal, updated: insertTest(testsOriginal, testsUpdated)}] : [])
  ], [relDescriptor], testsFile);
  const entity = path.basename(entityDir);
  const changed = [relDescriptor, ...(test ? [test.file] : [])];
  const next = nextCommands(registry, entity, o.chainId, changed, verification.name ?? name.replace(/^calldata-|\.json$/g, ''),
    `Adds ${o.chainId}:${address} to ${relDescriptor}${test ? ` with test case \\"${test.description}\\"` : ''}. ABI verified via ${verification.source}${verification.match ? ` (${verification.match})` : ''}.`);
  return {descriptor: relDescriptor, deployment: {chainId: o.chainId, address}, verification, selectorsChecked: formats.length, test: test ?? null, skippedTemplates, lint, registryRunners: runners,
    ...(o.skipRegistryRunners && divergence.length ? {registryRunnersSkipped: {reason: o.skipRegistryRunners.trim(), divergence}} : {}), changed, next, note: 'Files changed in the registry clone; nothing committed. Open the pull request from an account tied to the contract owner.'};
}

// EIP-712: the deployments usually live in a shared file several descriptors include. The address is
// proven by the contract's own DOMAIN_SEPARATOR(), which binds the domain name, chain and address.
const ZERO = '0x0000000000000000000000000000000000000000';
async function addTypedDataDeployment(o: AddDeploymentOptions, registry: string, descriptorFile: string, address: string) {
  if (o.abiFile) fail('USAGE_ERROR', '--abi applies to calldata descriptors; an EIP-712 deployment is proven by its DOMAIN_SEPARATOR() through --rpc-url.', 2);
  if (!o.rpcUrl) fail('RPC_REQUIRED', `Proving an EIP-712 deployment reads DOMAIN_SEPARATOR() on chain ${o.chainId}; pass --rpc-url <endpoint for chain ${o.chainId}>. Nothing was changed.`, 2);
  const relDescriptor = path.relative(registry, descriptorFile);

  // 1. Follow includes to the file that lists the deployments; the merged view supplies domain, formats and owner.
  const chain = includeChain(registry, descriptorFile);
  const holder = chain.find(x => Array.isArray(x.json.context?.eip712?.deployments));
  if (!holder) fail('UNSUPPORTED_DESCRIPTOR', `Neither ${relDescriptor} nor its includes has a context.eip712.deployments array.`, 2);
  const merged: any = chain.slice(0, -1).reduceRight((acc: any, x) => mergeDescriptors(x.json, acc), chain[chain.length - 1].json);
  const deployments: any[] = merged.context?.eip712?.deployments ?? [];
  const domain = merged.context?.eip712?.domain ?? {};
  if (domain.chainId !== undefined || domain.verifyingContract !== undefined) fail('UNSUPPORTED_DESCRIPTOR', `The descriptor's domain pins chainId or verifyingContract, so it cannot describe another deployment; edit it by hand.`, 2);
  const formats = Object.keys(merged.display?.formats ?? {});
  if (!formats.length) fail('UNSUPPORTED_DESCRIPTOR', `${relDescriptor} has no display.formats.`, 2);
  if (deployments.some(x => x.chainId === o.chainId && String(x.address).toLowerCase() === address.toLowerCase())) fail('DEPLOYMENT_EXISTS', `${o.chainId}:${address} is already listed in ${path.relative(registry, holder.file)}.`, 2);
  const testsFile = testsFileFor(descriptorFile);
  const testsOriginal = fs.existsSync(testsFile) ? readText(testsFile) : undefined;
  const testsParsed = testsOriginal !== undefined ? JSON.parse(testsOriginal) : undefined;
  const typedCases: any[] = (Array.isArray(testsParsed?.tests) ? testsParsed.tests : []).filter((c: any) => c?.data && typeof c.data === 'object' && c.data.domain && c.data.types && c.data.primaryType);

  // 2. Prove: the endpoint serves this chain, there is code at the address, and its domain separator is
  // the descriptor's domain for this chain and address. Candidate domains come from the descriptor and
  // from the domains its existing tests sign against; nothing is taken from the user.
  const chainIdHex = await rpcCall(o.rpcUrl, 'eth_chainId', []);
  if (BigInt(chainIdHex) !== BigInt(o.chainId)) fail('RPC_CHAIN_MISMATCH', `--rpc-url serves chain ${BigInt(chainIdHex)}, not ${o.chainId}. Nothing was changed.`, 2);
  const code = await rpcCall(o.rpcUrl, 'eth_getCode', [address, 'latest']);
  if (code === '0x') fail('NO_CODE', `There is no contract code at ${address} on chain ${o.chainId}; a same-address-everywhere deployment may not exist there. Nothing was changed.`, 1);
  let separator: string;
  try { separator = await rpcCall(o.rpcUrl, 'eth_call', [{to: address, data: '0x3644e515'}, 'latest']); } // DOMAIN_SEPARATOR()
  catch (e) { if (e instanceof Failure && e.code === 'RPC_ERROR') fail('DOMAIN_UNVERIFIABLE', `${address} on chain ${o.chainId} has no callable DOMAIN_SEPARATOR(), so the tool cannot prove it is this descriptor's contract. Nothing was changed.`, 1); throw e; }
  if (!/^0x[0-9a-fA-F]{64}$/.test(separator)) fail('DOMAIN_UNVERIFIABLE', `DOMAIN_SEPARATOR() at ${o.chainId}:${address} returned ${separator.slice(0, 80)}, not a bytes32. Nothing was changed.`, 1);
  const bound = {chainId: o.chainId, verifyingContract: address};
  const candidates: {domain: Record<string, unknown>; source: string; hash: string}[] = [];
  const addCandidate = (source: string, compute: () => {domain: Record<string, unknown>; hash: string}) => { try { const c = compute(); if (!candidates.some(x => x.hash === c.hash)) candidates.push({...c, source}); } catch { /* a malformed test domain is not evidence */ } };
  const pick = (from: any, keys: string[]) => Object.fromEntries(keys.filter(k => from?.[k] !== undefined).map(k => [k, from[k]]));
  addCandidate('descriptor context.eip712.domain', () => { const d = {...pick(domain, ['name', 'version', 'salt']), ...bound}; return {domain: d, hash: TypedDataEncoder.hashDomain(d)}; });
  for (const c of typedCases) addCandidate(`test "${c.description}"`, () => {
    const type: {name: string; type: string}[] | undefined = c.data.types.EIP712Domain;
    // A shape that does not bind chain and address proves nothing about this deployment.
    if (type && !(type.some(f => f.name === 'chainId') && type.some(f => f.name === 'verifyingContract'))) throw new Error('unbound');
    const d = {...pick(c.data.domain, ['name', 'version', 'salt']), ...bound};
    return {domain: d, hash: type ? TypedDataEncoder.hashStruct('EIP712Domain', {EIP712Domain: type}, d) : TypedDataEncoder.hashDomain(d)};
  });
  addCandidate('chainId and verifyingContract only', () => ({domain: bound, hash: TypedDataEncoder.hashDomain(bound)}));
  const matched = candidates.find(c => c.hash.toLowerCase() === separator.toLowerCase());
  if (!matched) fail('DOMAIN_MISMATCH', `DOMAIN_SEPARATOR() at ${o.chainId}:${address} is ${separator}; none of the ${candidates.length} domains the descriptor and its tests describe produce it for this chain and address:\n  ${candidates.map(c => `${JSON.stringify(c.domain)} (${c.source}) -> ${c.hash}`).join('\n  ')}\nThis is not the descriptor's contract, or it signs under a domain the registry files do not record. Nothing was changed.`, 1);
  const verification = {source: 'DOMAIN_SEPARATOR() over JSON-RPC', domainSeparator: separator, domain: matched.domain, domainSource: matched.source, codeHash: keccak256(code), codeBytes: (code.length - 2) / 2,
    caveat: 'Proves the contract signs under this domain on this chain; it does not compare bytecode with the other deployments.'};

  // 3. Retarget an existing typed-data test to the new chain and address, apply --set overrides to its
  // message, and render it through the pinned renderer the way the registry's Sourcify runner does.
  const holderUpdated = insertDeployment(holder.text, ['context', 'eip712', 'deployments'], o.chainId, address);
  let test: {file: string; description: string; template: string; expected: any} | undefined;
  let testsUpdated: any;
  const skippedTemplates: string[] = [], templateAddresses: string[] = [];
  if (o.test !== false && testsParsed) {
    const known = new Set(deployments.map(x => `${x.chainId}:${String(x.address).toLowerCase()}`));
    const isKnown = (c: any) => known.has(`${Number(c.data.domain.chainId)}:${String(c.data.domain.verifyingContract ?? '').toLowerCase()}`);
    let pool = [...typedCases.filter(isKnown), ...typedCases.filter(c => !isKnown(c))];
    if (o.template !== undefined) { pool = pool.filter(c => c.description === o.template); if (!pool.length) fail('NO_TEMPLATE_TEST', `${path.relative(registry, testsFile)} has no EIP-712 test named "${o.template}".`, 2); }
    if (!pool.length) fail('NO_TEMPLATE_TEST', `${path.relative(registry, testsFile)} has no EIP-712 test case to retarget; add the deployment with --no-test and write the test by hand.`, 1);
    const sets = (o.set ?? []).map(entry => {
      const m = /^([^=]+)=(.*)$/s.exec(entry);
      if (!m) fail('FIXTURE_ARGUMENTS', `--set expects <message.path>=<value>, got ${entry}.`, 2);
      let value: unknown; try { value = JSON.parse(m[2]); } catch { value = m[2]; }
      return {keys: m[1].split('.'), value, raw: entry};
    });
    const {extraTokens, extraNames} = providerExtras(o);
    const provider = testsParsed.dataProvider ?? {};
    const lower = <T,>(map: Record<string, T> | undefined) => Object.fromEntries(Object.entries(map ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const tokens: Record<string, any> = lower({...(provider.tokens ?? {}), ...extraTokens}), names: Record<string, string> = lower({...(provider.addressNames ?? {}), ...extraNames}), ens: Record<string, string> = lower(provider.ensNames), collections: Record<string, string> = lower(provider.nftCollectionNames);
    const hashes: Record<string, string[]> = {};
    for (const key of formats) { const primary = eip712.extractPrimaryType(key); if (primary) (hashes[primary] ??= []).push(keccak256(toUtf8Bytes(key))); }
    const resolver = {
      index: {calldataIndex: {}, typedDataIndex: {[`eip155:${o.chainId}:${address.toLowerCase()}`]: Object.fromEntries(Object.entries(hashes).map(([primary, list]) => [primary, [{path: relDescriptor, encodeTypeHashes: list}]]))}},
      fetchDescriptor: async (p: string) => { const file = safePath(registry, p); return (file === holder.file ? JSON.parse(holderUpdated) : readJson(file)) as RendererDescriptor; }
    };
    const attempts: string[] = [];
    let chosen: {c: any; data: any; model: any} | undefined;
    for (const c of pool) {
      const data = structuredClone(c.data);
      data.domain.chainId = o.chainId; data.domain.verifyingContract = address;
      const unknown = sets.find(s => !setPath(data.message, s.keys, s.value));
      if (unknown) { attempts.push(`"${c.description}": its message has no field ${unknown.keys.join('.')}`); continue; }
      try { const {EIP712Domain: _, ...types} = data.types; TypedDataEncoder.hash(data.domain, types, data.message); }
      catch (e) { attempts.push(`"${c.description}": not valid typed data after overrides (${(e as Error).message.slice(0, 200)})`); continue; }
      const model = await formatTypedData({account: ZERO, ...data}, {
        descriptorResolverOptions: {type: 'custom', resolver},
        externalDataProvider: {
          resolveToken: async (chainId, a) => chainId === o.chainId ? tokens[a.toLowerCase()] ?? null : null,
          resolveLocalName: async a => names[a.toLowerCase()] ? {name: names[a.toLowerCase()], typeMatch: true} : null,
          resolveEnsName: async a => ens[a.toLowerCase()] ? {name: ens[a.toLowerCase()], typeMatch: true} : null,
          resolveNftCollectionName: async (chainId, a) => chainId === o.chainId && collections[a.toLowerCase()] ? {name: collections[a.toLowerCase()]} : null,
          resolveBlockTimestamp: async (chainId, height) => chainId === o.chainId && provider.blockTimestamps?.[height.toString()] !== undefined ? {timestamp: provider.blockTimestamps[height.toString()]} : null,
          resolveChainInfo: async chainId => chainId === o.chainId ? KNOWN_CHAINS[chainId] ?? null : null
        }
      });
      // The registry runner fails a case on any top-level warning; field warnings mean missing metadata.
      const warnings = [...(model.warnings ?? [])];
      const collect = (fields: any[]) => { for (const f of fields) { if (f.warning && !INFORMATIONAL_WARNINGS.has(f.warning.code)) warnings.push(f.warning); if (f.fields) collect(f.fields); } };
      collect(model.fields ?? []);
      if (warnings.length || typeof model.intent !== 'string') { attempts.push(`"${c.description}": ${warnings.length ? `needs metadata for chain ${o.chainId} (${[...new Set(warnings.map(w => w.code))].join(', ')})` : 'renders no string intent'}`); continue; }
      chosen = {c, data, model}; break;
    }
    if (!chosen) fail('NO_RENDERABLE_TEMPLATE', `No existing test case could be rendered for chain ${o.chainId}:\n  ${attempts.join('\n  ')}\nSupply chain metadata with --token <address>=<SYMBOL>:<decimals> or --address-name <address>=<Name>, point message addresses at this chain's contracts with --set <path>=<value>, or add the deployment alone with --no-test. Nothing was changed.`, 1);
    const cases: any[] = testsParsed.tests;
    const description = newDescription(o, chosen.c.description, cases);
    const entry = typedDataTestCase(description, chosen.data, chosen.model, chosen.model.metadata?.owner ?? merged.metadata?.owner ?? '');
    skippedTemplates.push(...attempts);
    testsUpdated = structuredClone(testsParsed);
    addProviderExtras(testsUpdated, extraTokens, extraNames);
    testsUpdated.tests = [...cases, entry];
    validateRegistryTests(testsUpdated);
    test = {file: path.relative(registry, testsFile), description, template: chosen.c.description, expected: entry.expected};
    // Token metadata in a test file is not keyed by chain, so an address copied from the template renders
    // on the new chain as it did on the old one. Name them; whether they exist there is for the user to say.
    const walkAddresses = (node: any, trail: string[]): string[] => node !== null && typeof node === 'object' ? Object.entries(node).flatMap(([k, v]) => walkAddresses(v, [...trail, k])) : typeof node === 'string' && isAddress(node) && node.toLowerCase() !== ZERO ? [`${trail.join('.')}=${node}`] : [];
    const overridden = new Set(sets.map(s => s.keys.join('.')));
    templateAddresses.push(...walkAddresses(chosen.data.message, []).filter(x => !overridden.has(x.slice(0, x.indexOf('=')))));
  }

  // 4. Write positionally, then lint every descriptor that includes the edited file: all of them now
  // resolve on the new chain.
  const affected = walk(path.join(registry, 'registry'), '.json').filter(f => /^(eip712|calldata)-/.test(path.basename(f)) && !f.split(path.sep).includes('tests') && !f.split(path.sep).includes('testsv2'))
    .filter(f => { try { return includeChain(registry, f).some(x => x.file === holder.file); } catch { return false; } }).map(f => path.relative(registry, f));
  const {lint, runners} = writeChecked(o, registry, [
    {file: holder.file, original: holder.text, updated: holderUpdated},
    ...(testsUpdated ? [{file: testsFile, original: testsOriginal!, updated: insertTest(testsOriginal!, testsUpdated)}] : [])
  ], affected, testsFile);
  const entity = path.basename(path.dirname(descriptorFile));
  const relHolder = path.relative(registry, holder.file);
  const changed = [relHolder, ...(test ? [test.file] : [])];
  const next = nextCommands(registry, entity, o.chainId, changed, relDescriptor.replace(/^.*\/eip712-|\.json$/g, ''),
    `Adds ${o.chainId}:${address} to ${relHolder}${test ? ` with test case \\"${test.description}\\"` : ''}. Address proven by DOMAIN_SEPARATOR() matching ${JSON.stringify(matched.domain).replace(/"/g, '')}.`);
  return {descriptor: relDescriptor, deploymentsFile: relHolder, deployment: {chainId: o.chainId, address}, verification, affectedDescriptors: affected, test: test ?? null, skippedTemplates, templateAddresses, lint, registryRunners: runners, changed, next,
    note: `Files changed in the registry clone; nothing committed.${affected.length > 1 ? ` ${relHolder} is shared: ${affected.length} descriptors now resolve on chain ${o.chainId}, and only ${relDescriptor} gained a test.` : ''}${templateAddresses.length ? ` The new test still uses message addresses from "${test!.template}" (${templateAddresses.join(', ')}); if those contracts differ on chain ${o.chainId}, rerun with --set <path>=<address> and --token.` : ''} Open the pull request from an account tied to the contract owner.`};
}

// The descriptor and every file it includes, outermost first, each read once and kept inside the clone.
function includeChain(registry: string, file: string) {
  const chain: {file: string; text: string; json: any}[] = [];
  let current = file;
  for (;;) {
    if (chain.some(x => x.file === current)) fail('UNSUPPORTED_DESCRIPTOR', `Cyclic includes at ${path.relative(registry, current)}.`, 2);
    if (chain.length > 8) fail('UNSUPPORTED_DESCRIPTOR', 'Include chain deeper than 8 files.', 2);
    const text = readText(current), json = JSON.parse(text);
    chain.push({file: current, text, json});
    if (typeof json.includes !== 'string') return chain;
    current = safePath(registry, path.relative(registry, path.resolve(path.dirname(current), json.includes)));
    if (!fs.existsSync(current)) fail('DESCRIPTOR_NOT_FOUND', `${path.relative(registry, file)} includes ${json.includes}, which does not exist.`, 2);
  }
}
// Set an existing leaf only; a path that does not exist in the message is a typo, never a new field.
function setPath(target: any, keys: string[], value: unknown): boolean {
  let node = target;
  for (const [n, key] of keys.entries()) {
    const k = Array.isArray(node) && /^\d+$/.test(key) ? Number(key) : key;
    if (node === null || typeof node !== 'object' || !(k in node)) return false;
    if (n === keys.length - 1) { if (node[k] !== null && typeof node[k] === 'object') return false; node[k] = value; return true; }
    node = node[k];
  }
  return false;
}
function testsFileFor(descriptorFile: string) { return path.join(path.dirname(descriptorFile), 'testsv2', path.basename(descriptorFile).replace(/\.json$/, '.tests.json')); }
function newDescription(o: AddDeploymentOptions, template: string, cases: any[]) {
  const description = o.description ?? (/ - chain \d+$/.test(template) ? template.replace(/ - chain \d+$/, ` - chain ${o.chainId}`) : `${template} - chain ${o.chainId}`);
  if (cases.some(c => c.description === description)) fail('DUPLICATE_TEST', `A test named "${description}" already exists; pass --description.`, 2);
  return description;
}
function providerExtras(o: AddDeploymentOptions) {
  const parse = (list: string[] | undefined, what: string) => Object.fromEntries((list ?? []).map(entry => {
    const m = /^(0x[0-9a-fA-F]{40})=(.+)$/.exec(entry);
    if (!m) fail('FIXTURE_ARGUMENTS', `--${what} expects <address>=<value>, got ${entry}.`, 2);
    return [m[1], m[2]];
  }));
  const extraTokens = Object.fromEntries(Object.entries(parse(o.tokens, 'token')).map(([addr, spec]) => {
    const m = /^([^:]+):(\d{1,3})$/.exec(spec);
    if (!m) fail('FIXTURE_ARGUMENTS', `--token expects <address>=<SYMBOL>:<decimals>, got ${addr}=${spec}.`, 2);
    // Key order follows the registry schema: symbol, decimals, name.
    return [addr, {symbol: m[1], decimals: Number(m[2]), name: m[1]}];
  }));
  return {extraTokens, extraNames: parse(o.addressNames, 'address-name')};
}
function addProviderExtras(tests: any, extraTokens: Record<string, unknown>, extraNames: Record<string, string>) {
  for (const [addr, meta] of Object.entries(extraTokens)) (tests.dataProvider ??= {}).tokens = {...(tests.dataProvider.tokens ?? {}), [addr.toLowerCase()]: meta};
  for (const [addr, label] of Object.entries(extraNames)) (tests.dataProvider ??= {}).addressNames = {...(tests.dataProvider.addressNames ?? {}), [addr.toLowerCase()]: label};
}
// Write the edits, then run the registry's own checks on them. A lint error or a runner failure puts
// every file back byte for byte, so a refusal never leaves the clone half-edited.
function writeChecked(o: AddDeploymentOptions, registry: string, writes: {file: string; original: string; updated: string}[], lintFiles: string[], testsFile: string): {lint: LintResult; runners: RunnerResult[] | null} {
  for (const w of writes) writeText(w.file, w.updated);
  try {
    // The clone's own CI definition decides the erc7730 package and flags, as it does for the runners.
    const pin = lintPinFromRegistry(registry);
    const lint: LintResult = o.lint === false ? skippedLint(lintFiles, pin) : runUpstreamLint(registry, lintFiles, pin);
    if (lint.ran && lint.exitCode !== 0) throw new Failure('UPSTREAM_LINT_FAILED', `erc7730 lint rejected ${lintFiles.join(', ')} after the edit. Nothing was changed.`, 1, [{code: 'UPSTREAM_LINT_FAILED', message: (lint.output ?? []).join(' | '), remedy: `Reproduce with the edit applied: ${lint.command}. An error in a descriptor this edit does not touch also blocks it; check the clone is at a clean upstream commit.`}]);
    return {lint, runners: runRunners(o, registry, testsFile)};
  } catch (e) {
    for (const w of writes) writeText(w.file, w.original);
    throw e;
  }
}
// The registry's implementations, run in the clone itself with pins read from its CI definition.
function runRunners(o: AddDeploymentOptions, registry: string, testsFile: string): RunnerResult[] | null {
  if (!o.runners || !fs.existsSync(testsFile)) return null;
  const tc = setupRunners(pinsFromRegistry(registry), o.log);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csh-runners-'));
  const runners = runRegistryRunners(tc, testsFile, registry, outDir);
  const failed = runners.filter(r => !r.passed);
  if (failed.length) fail('REGISTRY_RUNNER_FAILED', `${failed.map(r => `${r.name} (${r.implementation ?? r.ref.slice(0, 8)}): ${r.reason ?? JSON.stringify(r.cases)}${r.failures.length ? `; ${r.failures.map(f => `"${f.description}" ${f.status}${f.message ? ` (${f.message})` : ''}`).join('; ')}` : ''}`).join('\n')}\nRendered output is under ${outDir}. Nothing was changed.`, 1);
  return runners;
}
function nextCommands(registry: string, entity: string, chainId: number, changed: string[], what: string, body: string) {
  const branch = `${entity}-chain-${chainId}`;
  return [
    `git -C ${registry} checkout -b ${branch}`,
    `git -C ${registry} add ${changed.join(' ')}`,
    `git -C ${registry} commit -m "${entity}: add ${what} deployment on chain ${chainId}"`,
    `gh pr create --repo ethereum/clear-signing-erc7730-registry --head ${branch} --title "${entity}: add chain ${chainId} deployment" --body "${body}"`
  ];
}
// The new deployment copies the formatting of its neighbour. A list sorted by chain id stays sorted.
function insertDeployment(original: string, keys: string[], chainId: number, address: string) {
  const list = spanAt(scanJson(original), keys);
  if (!list || list.type !== 'array') fail('UNSUPPORTED_DESCRIPTOR', `Could not locate ${keys.join('.')} in the file text.`, 2);
  const parsed: any[] = keys.reduce((node: any, k) => node[k], JSON.parse(original));
  const sorted = parsed.every((x, i) => i === 0 || Number(parsed[i - 1].chainId) <= Number(x.chainId));
  const at = sorted ? parsed.findIndex(x => Number(x.chainId) > chainId) : -1;
  const neighbour = list.children.get(at >= 0 ? at : list.children.size - 1);
  let entry = `{ "chainId": ${chainId}, "address": "${address}" }`;
  if (neighbour) {
    const raw = original.slice(neighbour.start, neighbour.end);
    const swapped = raw.replace(/("chainId"\s*:\s*)\d+/, `$1${chainId}`).replace(/("address"\s*:\s*")0x[0-9a-fA-F]{40}(")/, `$10x${address.slice(2)}$2`);
    // Continuation lines carry the neighbour's absolute indentation; the insert re-applies it.
    const base = /[ \t]*$/.exec(original.slice(original.lastIndexOf('\n', neighbour.start) + 1, neighbour.start))![0];
    const relative = swapped.split('\n').map((line, n) => n > 0 && line.startsWith(base) ? line.slice(base.length) : line).join('\n');
    if (swapped !== raw && swapped.includes(String(chainId)) && swapped.includes(address)) entry = relative;
  }
  const out = at >= 0 ? insertIntoArray(original, keys, at, entry) : appendToContainer(original, keys, entry);
  if (!out) fail('UNSUPPORTED_DESCRIPTOR', `Could not locate ${keys.join('.')} in the file text.`, 2);
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
