// Which token candidates the decisions file offers for an integer argument. Hints only: apply takes any
// token reference the validator accepts, so a rule here can only hide a candidate, never refuse one.

const width = (type: string) => Number(type.replace(/^u?int/, '') || 256);
// Integers that by type or name are never a token amount: deadlines, nonces, ids, indexes, fees in basis
// points, price limits, signature v. Measured on registry 2c2ddeb (every format, includes resolved): of
// 1,435 integer leaves shown as tokenAmount or amount, none is narrower than 64 bits and none matches the
// names, while 971 of the 2,074 other integer leaves do.
const NOT_AMOUNT = /deadline|expir|timestamp|nonce|^_?v$|bips$|bps$|pct$|sqrtprice|sqrtratio|chainid|duration|period|seconds$|^_?salt$|index$|^ticks?$|tick(lower|upper)$|^valid(after|before|until)$|epoch/i;
// "Id" as its own word ("tokenId", "order_id"), so "amountPaid" is not an id.
const ID = /(^|_)id$|[a-z0-9]Id$|ID$/;
// A token address packed into a uint (below), not an amount.
const PACKED_TOKEN = /^_?(src|dst|from|to)?Token$/i;
export function maybeAmount(name: string, type: string): boolean {
  if (!/^u?int\d*$/.test(type)) return false;
  return width(type) >= 64 && !NOT_AMOUNT.test(name) && !ID.test(name) && !PACKED_TOKEN.test(name);
}

// Token references that need a byte slice, from the two idioms merged descriptors use:
// a packed route in bytes (Uniswap V3 `path`: token, fee, token, ...), whose first 20 bytes are a token,
// and a token address packed into the low 20 bytes of a uint256 with flags (1inch and OKX `srcToken`,
// `fromToken`).
export function slicedTokenCandidates(leaves: {path: string; type: string}[]): string[] {
  const out: string[] = [];
  for (const l of leaves) {
    const name = l.path.split('.').pop() ?? l.path;
    // Only the first token: the last one, [-20:], is whatever the caller appended (TAIL_SLICE_TOKEN).
    if (l.type === 'bytes' && /path/i.test(name)) out.push(`tokenPath ${l.path}.[0:20] (first token of a packed route: token, fee, token, ...; an exact-output route is often reversed, so check the source. Its last token cannot be read safely: the contract ignores bytes after the last hop, so [-20:] shows whatever the caller appended)`);
    else if (/^uint\d*$/.test(l.type) && width(l.type) >= 160 && PACKED_TOKEN.test(name)) out.push(`tokenPath ${l.path}.[-20:] (token address in the low 20 bytes of a uint)`);
  }
  return out;
}
