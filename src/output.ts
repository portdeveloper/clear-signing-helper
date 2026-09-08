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
    const rows = (fields: any[], indent = '  '): string[] => fields.flatMap(f => f.fields ? [`${indent}${f.label ?? 'Item'}`, ...rows(f.fields, indent + '  ')] : [`${indent}${f.separator ? f.separator + ': ' : ''}${f.label}: ${f.value}`, ...(f.rawAddress && f.rawAddress !== f.value ? [`${indent}  Address: ${f.rawAddress}`] : [])]);
    return [`${data.intent}${data.localBinding ? ' (local draft)' : ''}`, `Chain ${data.chainId} · ${data.to}`, `Native value: ${data.value} wei`, ...rows(data.fields), ...data.warnings.map((w:any)=>`Warning ${w.code}: ${w.message}`), '\nReference rendering; wallet presentation may differ.'].join('\n');
  }
  if (data.url) return `Preview: ${data.url}\nPress Ctrl+C to stop.\n\n${formatHumanOutput(data.rendering)}`;
  if (data.upgraded !== undefined) return data.note;
  if (data.reviewed) return `Review recorded for ${data.reviewed.length} contract(s).\n${data.note}`;
  if (data.exported) return [`Exported ${data.descriptors} descriptor(s) and ${data.fixtures} fixture(s) to ${data.exported}.`,...portability,'See portability.json. Wallet/deployment verification and registry publication have not been performed.'].join('\n');
  if (data.passed !== undefined) return `${data.passed} signing test(s) passed.${data.updated ? ` ${data.updated} expectation(s) updated.` : ''}`;
  if (data.created) {
    if (typeof data.created === 'string') return `Created ${data.created}\n${data.next}`;
    return [`${data.created.length} descriptor(s) created.`, ...data.contracts.map((c:any)=>`  ${c.id}\n    ${c.descriptor}`), '\nDrafts use raw values. Review the action, recipients, limits, units, and token relationships.', data.next].join('\n');
  }
  if (data.added) return [`Added ${data.added.length} format(s).`, ...data.added.map((s:string)=>`  ${s}`), ...data.diagnostics.map((d:any)=>`${d.code}: ${d.message}`), data.note].join('\n');
  if (data.review === 'current') return [`Local checks passed. Review is current.`, ...data.contracts.map((c:any)=>`  ${c.contract}: ${c.covered} covered, ${c.excluded.length} excluded${c.excluded.length ? '\n' + c.excluded.map((e:any)=>`    ${e.signature}: ${e.reason}`).join('\n') : ''}`),...portability].join('\n');
  return JSON.stringify(data, null, 2);
}
