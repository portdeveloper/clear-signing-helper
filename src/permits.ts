// A permit inside calldata grants an approval as a side effect of the call: EIP-2612 style split signatures
// (v, r, s, as in Uniswap V2's removeLiquidityWithPermit), a signature as bytes, or a Permit2 struct
// (PermitSingle, PermitBatch, PermitTransferFrom). The signature bytes mean nothing to a signer; what the
// permit grants does (amount or unlimited flag, token, spender, expiry), and hiding it is how a descriptor
// can approve more than the screen admits. A signature's own deadline is not a grant: the permit is used in
// the same transaction. Permit2's `expiration` is, because the approval outlives the call. Detection is by
// argument names and types, so it is a heuristic that only ever warns. Measured on registry 2c2ddeb: it flags
// 7 fields in 3 files (Lido and Morpho permits hiding the approved value) and nothing that is not a permit.
export interface PermitGrant {path: string; what: string}
export interface PermitInfo {kind: 'split signature' | 'signature bytes' | 'Permit2'; signature: string[]; grants: PermitGrant[]}
type Leaf = {path: string; type: string};

const parentOf = (path: string) => path.includes('.') ? path.slice(0, path.lastIndexOf('.') + 1) : '';
const nameOf = (path: string) => path.slice(path.lastIndexOf('.') + 1);
const isUint = (type: string) => /^uint\d*$/.test(type);

// What a sibling of the signature grants, by name and type; undefined when it grants nothing.
function grantOf(leaf: Leaf): string | undefined {
  const name = nameOf(leaf.path);
  if (leaf.type === 'bool' && /max|unlimited|infinite/i.test(name)) return 'unlimited approval flag';
  if (isUint(leaf.type) && /^(value|amount|allowance)$/i.test(name)) return 'approved amount';
  if (leaf.type === 'address' && /spender/i.test(name)) return 'spender';
  if (leaf.type === 'address' && /^token$/i.test(name)) return 'token';
  return undefined;
}
// Permit2 struct members, by the names in the Permit2 interfaces.
const PERMIT2: Record<string, string> = {token: 'token', amount: 'approved amount', expiration: 'approval expiry', spender: 'spender', to: 'transfer recipient', requestedAmount: 'transferred amount'};

export function permitOf(leaves: Leaf[]): PermitInfo | undefined {
  const at = new Map(leaves.map(l => [l.path, l.type]));
  // Permit2: an argument named like a permit (or transferDetails) whose members carry token and amount.
  const top = (path: string) => path.split('.')[0];
  const permit2Roots = new Set(leaves.filter(l => /permit/i.test(top(l.path)) && /\.(details|permitted)\.(\[\]\.)?token$/.test(l.path)).map(l => top(l.path)));
  if (permit2Roots.size) {
    const roots = new Set([...permit2Roots, ...leaves.map(l => top(l.path)).filter(t => /^transferDetails$/i.test(t))]);
    const grants = leaves.filter(l => roots.has(top(l.path)) && PERMIT2[nameOf(l.path)]).map(l => ({path: l.path, what: PERMIT2[nameOf(l.path)]}));
    const signature = leaves.filter(l => l.type === 'bytes' && /sig/i.test(nameOf(l.path))).map(l => l.path);
    return {kind: 'Permit2', signature, grants};
  }
  // Split signature: v, r and s side by side; what it grants sits next to them.
  for (const l of leaves) {
    const p = parentOf(l.path);
    if (nameOf(l.path) === 'v' && l.type === 'uint8' && at.get(`${p}r`) === 'bytes32' && at.get(`${p}s`) === 'bytes32') {
      return {kind: 'split signature', signature: [`${p}v`, `${p}r`, `${p}s`], grants: siblings(leaves, p)};
    }
  }
  // A signature as bytes counts only with an amount, unlimited flag or spender beside it: signed quotes,
  // sessions and intents also carry a signature, and a token alone does not make one a permit.
  for (const l of leaves) {
    if (l.type !== 'bytes' || !/signature|^sig$|permitSig/i.test(nameOf(l.path))) continue;
    const grants = siblings(leaves, parentOf(l.path));
    if (grants.some(g => g.what !== 'token')) return {kind: 'signature bytes', signature: [l.path], grants};
  }
  return undefined;
}
function siblings(leaves: Leaf[], parent: string): PermitGrant[] {
  return leaves.filter(l => parentOf(l.path) === parent).flatMap(l => { const what = grantOf(l); return what ? [{path: l.path, what}] : []; });
}
