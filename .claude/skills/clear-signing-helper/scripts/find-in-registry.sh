#!/usr/bin/env bash
# Search a clone of the clear-signing registry for an existing descriptor,
# so you extend an existing file (one-line chain add) instead of authoring a new one.
#
# Usage: find-in-registry.sh <address-or-name> [registry-root]
#   <address-or-name>  a contract address (any case) or a protocol/owner name
#   [registry-root]    path to a clone of ethereum/clear-signing-erc7730-registry
#                      (defaults to the current directory)
#
# An address is looked up in descriptor deployments (calldata and EIP-712, includes followed).
# A mention anywhere else, such as a recipient inside test data, is listed separately and is
# not a reason to add a deployment. A name matches entity folders, file names, owners and
# contract names. Needs Node.js, which the clear-signing CLI requires anyway.
set -euo pipefail

QUERY="${1:?usage: find-in-registry.sh <address-or-name> [registry-root]}"
ROOT="${2:-.}"

if [ ! -d "$ROOT/registry" ]; then
  echo "No 'registry/' under '$ROOT'. Pass a clone of ethereum/clear-signing-erc7730-registry." >&2
  exit 1
fi

exec node - "$QUERY" "$ROOT" <<'EOF'
const fs = require('fs'), path = require('path');
const [query, root] = process.argv.slice(2);
const reg = path.join(root, 'registry');
const isAddress = /^0x[0-9a-fA-F]{40}$/.test(query), q = query.toLowerCase();
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
// A descriptor with its includes merged, enough to read deployments and metadata.
const resolve = (file, depth = 0) => {
  const d = read(file); if (!d || depth > 8) return d;
  if (typeof d.includes !== 'string') return d;
  const parent = resolve(path.resolve(path.dirname(file), d.includes), depth + 1) ?? {};
  return {...parent, ...d, context: {...parent.context, ...d.context}, metadata: {...parent.metadata, ...d.metadata}};
};
const descriptors = [], others = [];
for (const entity of fs.readdirSync(reg).sort()) {
  const dir = path.join(reg, entity); if (!fs.statSync(dir).isDirectory()) continue;
  const walk = (d, top) => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, false); else if (n.endsWith('.json')) (top && /^(calldata|eip712)-/.test(n) ? descriptors : others).push({entity, file: path.relative(root, p)}); } };
  walk(dir, true);
}
const deploymentsOf = d => [...(d?.context?.contract?.deployments ?? []), ...(d?.context?.eip712?.deployments ?? [])];
const hits = [];
for (const x of descriptors) {
  const d = resolve(path.join(root, x.file));
  if (isAddress) {
    const chains = deploymentsOf(d).filter(dep => String(dep.address).toLowerCase() === q).map(dep => dep.chainId);
    if (chains.length) hits.push(`${x.file}  (deployed on chain ${[...new Set(chains)].join(', ')})`);
  } else {
    const names = [x.entity, path.basename(x.file), d?.metadata?.owner, d?.metadata?.contractName, d?.context?.$id].filter(Boolean).map(String);
    if (names.some(n => n.toLowerCase().includes(q))) hits.push(`${x.file}  (owner: ${d?.metadata?.owner ?? '?'})`);
  }
}
console.log(isAddress ? `# Descriptors that deploy ${query}:` : `# Descriptors whose entity, file, owner or contract name contains '${query}':`);
console.log(hits.length ? hits.map(h => '  ' + h).join('\n') : '  (none)');
if (isAddress) {
  const mentions = others.filter(x => fs.readFileSync(path.join(root, x.file), 'utf8').toLowerCase().includes(q)).map(x => x.file);
  const inDescriptors = descriptors.filter(x => !hits.some(h => h.startsWith(x.file)) && fs.readFileSync(path.join(root, x.file), 'utf8').toLowerCase().includes(q)).map(x => x.file);
  const other = [...inDescriptors, ...mentions];
  if (other.length) {
    console.log(`\n# Other mentions (tests, attestations, constants): the address appears here but is not a deployment:`);
    console.log(other.map(f => '  ' + f).join('\n'));
  }
}
console.log('');
if (hits.length && isAddress) {
  console.log('This address is already deployed in the file(s) above. For another chain, run registry add-deployment on that file.');
} else if (hits.length) {
  console.log('If one of these files is your protocol and only your chain is missing, do not edit it by hand. Run:');
  console.log(`  clear-signing registry add-deployment --registry ${root} --descriptor <file> --chain-id <id> --address <addr>`);
  console.log('It proves the address is the same contract, adds the deployment and renders a test case (EIP-712 files also need --rpc-url).');
  console.log('A file owned by another project (a fork of yours, or you of theirs) is not yours to extend: author your own.');
} else {
  console.log(`No descriptor deploys or names '${query}'. You are likely authoring a new descriptor; init also checks by function selectors.`);
}
EOF
