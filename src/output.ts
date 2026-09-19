// Make terminal control sequences and bidirectional overrides visible as text.
// Keep the original values in JSON/expectations; this is presentation escaping.
export const displayText = (value: unknown): string => String(value).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
export function humanOutput(data: any): string {
  const sanitize = (value: any): any => typeof value === 'string' ? displayText(value) : Array.isArray(value) ? value.map(sanitize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)])) : value;
  return formatHumanOutput(sanitize(data));
}
function formatHumanOutput(data: any): string {
  const portability = (data.portability?.findings??[]).map((f:any)=>`Portability ${f.code} (${f.signature}, ${f.path}): ${f.message}`);
  if (data.intent !== undefined && Array.isArray(data.fields)) {
    // Groups print a header only when they carry a label. A separator is the per-element title a
    // device shows; when it already starts with the label, the label is not repeated.
    const leaf = (f: any, indent: string) => {
      const head = !f.separator ? `${f.label}` : String(f.separator).startsWith(String(f.label)) ? `${f.separator}` : `${f.separator}, ${f.label}`;
      return [`${indent}${head}: ${f.value}`, ...(f.rawAddress && f.rawAddress !== f.value ? [`${indent}  Address: ${f.rawAddress}`] : [])];
    };
    const rows = (fields: any[], indent = '  '): string[] => fields.flatMap(f => f.fields ? (f.label ? [`${indent}${f.label}`, ...rows(f.fields, indent + '  ')] : rows(f.fields, indent)) : leaf(f, indent));
    return [`${data.intent}${data.localBinding ? ' (local draft)' : ''}`, `Chain ${data.chainId} · ${data.to}`, `Native value: ${data.value} wei`, ...rows(data.fields), ...data.warnings.map((w:any)=>`Warning ${w.code}: ${w.message}`), '\nReference rendering; wallet presentation may differ.'].join('\n');
  }
  if (data.url) return `Preview: ${data.url}\nPress Ctrl+C to stop.\n\n${formatHumanOutput(data.rendering)}`;
  if (data.upgraded !== undefined) return data.note;
  if (data.runners && data.sourcify && data.rust) return `Registry runners ready under ${data.runners}\n  Sourcify: ${data.sourcify.cli} (${data.sourcify.ref.slice(0,8)})\n  Rust: ${data.rust.binary} (${data.rust.ref.slice(0,8)})`;
  if (data.deployment && data.next) return [
    `Added ${data.deployment.chainId}:${data.deployment.address} to ${data.descriptor}.`,
    `ABI verified via ${data.verification.source}${data.verification.match?` (${data.verification.match})`:''}; all ${data.selectorsChecked} described function(s) exist at that address.${data.verification.proxy?`\n  Proxy ${data.verification.proxy.type??''} -> implementation ${data.verification.proxy.implementation.address}`:''}`,
    data.test ? `Test case "${data.test.description}" rendered from "${data.test.template}" in ${data.test.file}:\n${data.test.expected.fields.map((f:any)=>`  ${f.label}: ${f.value}`).join('\n')}` : 'No test case added.',
    data.lint?.ran ? `Upstream erc7730 lint: exit ${data.lint.exitCode}, ${data.lint.warnings} warning(s).${data.lint.warnings ? '\n'+data.lint.output.map((l:string)=>`  ${l}`).join('\n') : ''}` : `Upstream erc7730 lint not run (${data.lint?.reason}). Run: ${data.lint?.command}`,
    ...(data.registryRunners?data.registryRunners.map((r:any)=>`Registry ${r.name} runner (${r.implementation??r.ref.slice(0,8)}): ${r.passed?'all cases pass':'FAILED'} ${JSON.stringify(r.cases)}`):[]),
    '', data.note, '', 'Next, after reviewing the diff:', ...data.next.map((c:string)=>`  ${c}`)].join('\n');
  if (data.reviewed) return `Review recorded for ${data.reviewed.length} contract(s).\n${data.note}`;
  if (data.exported) return [`Exported ${data.descriptors} descriptor(s) and ${data.fixtures} fixture(s) to ${data.exported}.`,
    `Registry-ready files: ${data.registryPath}/ (copy into <registry-clone>/registry/${data.entity}/).`,
    data.lint?.ran ? [`Upstream erc7730 lint: exit ${data.lint.exitCode}, ${data.lint.warnings} warning(s).`,...(data.lint.warnings ? data.lint.output.map((l:string)=>`  ${l}`) : [])].join('\n') : `Upstream erc7730 lint not run (${data.lint?.reason}). Run: ${data.lint?.command}`,
    ...(data.registryRunners?data.registryRunners.map((r:any)=>`Registry ${r.name} runner (${r.implementation??r.ref.slice(0,8)}) on ${r.testsFile}: ${r.passed?'all cases pass':'FAILED'} ${JSON.stringify(r.cases)}`):[]),
    ...portability,'See review/portability.json. Wallet/deployment verification and registry publication have not been performed.'].join('\n');
  if (data.passed !== undefined) return `${data.passed} signing test(s) passed.${data.updated ? ` ${data.updated} expectation(s) updated.` : ''}`;
  if (data.created) {
    if (typeof data.created === 'string') return `Created ${data.created}${data.source?` from ${data.source}`:''}\n${data.next}`;
    const imports=(data.imports??[]).map((i:any)=>`  ${i.contract} from ${i.source}${i.match?` (${i.match})`:''}: ${i.origin}${i.proxy?`\n    proxy ${i.proxy.type??''} -> implementation ${i.proxy.implementation.address}${i.proxy.implementation.name?` (${i.proxy.implementation.name})`:''}; the descriptor binds the proxy address`:''}`);
    const bindings=(data.bindings??[]).map((b:any)=>`  ${b.contract} bound to ${b.chainId}:${b.address} (from ${b.source})`);
    const label:Record<string,string>={natspec:'NatSpec',ast:'AST',broadcast:'broadcast',convention:'convention'};
    const evidence=(data.provenance??[]).map((p:any)=>`  [${label[p.source]??p.source}] ${p.contract} ${p.signature}${p.path?` ${p.path}`:''}: ${p.detail}`);
    const suggestions=(data.suggestions??[]).flatMap((s:any)=>[`  ${s.id}${s.ambiguous?' (name shared by several compiled contracts; bind manually)':''}`,...s.deployments.map((d:any)=>`    deployed at ${d.chainId}:${d.address} by ${d.script}`)]);
    return [`${data.created.length} descriptor(s) created.`, ...data.contracts.map((c:any)=>`  ${c.id}\n    ${c.descriptor}`),
      ...(imports.length?['\nImported ABIs (recorded in clear-signing/abi/*.source.json):',...imports]:[]),
      ...(bindings.length?['\nDeployment bindings taken from deployment records:',...bindings]:[]),
      ...(suggestions.length?['\nDeployed contracts not selected (add with init --contract <id>):',...suggestions]:[]),
      ...(evidence.length?['\nEvidence used in the drafts (NatSpec and AST are author facts, broadcast is the deployment record, convention is an editable registry default):',...evidence]:[]),
      ...(data.broadcastCalls?[`\n${data.broadcastCalls} recorded broadcast transaction(s) can seed fixtures with fixture --broadcast-tx <hash>.`]:[]),
      '\nDrafts use raw values. Review the action, recipients, limits, units, and token relationships.', data.next].join('\n');
  }
  if (data.added) return [`Added ${data.added.length} format(s).`, ...data.added.map((s:string)=>`  ${s}`), ...data.diagnostics.map((d:any)=>`${d.code}: ${d.message}`), data.note].join('\n');
  if (data.review === 'current') return [`Local checks passed. Review is current.`, ...data.contracts.map((c:any)=>`  ${c.contract}: ${c.covered} covered, ${c.excluded.length} excluded${c.excluded.length ? '\n' + c.excluded.map((e:any)=>`    ${e.signature}: ${e.reason}`).join('\n') : ''}`),...(data.warnings??[]).map((w:any)=>`Warning ${w.code}${w.signature ? ` (${w.signature})` : ''}: ${w.message}`),...portability].join('\n');
  return JSON.stringify(data, null, 2);
}
