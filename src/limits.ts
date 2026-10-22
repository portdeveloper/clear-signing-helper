// An amount that is a limit rather than the amount moved: a maximum the contract may not fully use
// (Uniswap V2's amountADesired, amountInMax) or a minimum it only guarantees (amountOutMin). Shown as
// "Amount to Add" or "Amount to Receive", a limit reads as the exact amount. Known by the argument's name
// only, so an amount that is a cap in code but named `amount` is not seen, and the check only warns.
export type LimitKind = 'maximum' | 'minimum';
// A limit word on a bare "amount" is too weak to warn on: LI.FI's BridgeData.minAmount is the amount bridged.
// Those names still get the decisions hint. Measured on registry 2c2ddeb: without this exception, 61 of 80
// warnings were LI.FI's minAmount.
export const weakLimitName = (name: string) => /^_?(min|max)Amount$/i.test(name);

export function limitOf(name: string, type: string): LimitKind | undefined {
  if (!/^u?int\d*$/.test(type)) return undefined;
  // A prefix must end at a capital or "_" ("minOut", "max_in"), so "minter" and "maximize" are not limits.
  if (/(Desired|Max|Maximum)$/.test(name) || /^_?[mM]ax(imum)?([A-Z_]|$)/.test(name)) return 'maximum';
  if (/(Min|Minimum)$/.test(name) || /^_?[mM]in(imum)?([A-Z_]|$)/.test(name)) return 'minimum';
  return undefined;
}
// Words that say a value is a limit, in a label and in a sentence.
const LABEL: Record<LimitKind, RegExp> = {maximum: /\bmax|limit|at most|up to|cap\b/i, minimum: /\bmin|limit|at least\b/i};
const SENTENCE: Record<LimitKind, RegExp> = {maximum: /\bup to|at most|max/i, minimum: /\bat least|min/i};
export const saysLimit = (kind: LimitKind, label: string) => LABEL[kind].test(label);
// The words before a placeholder in its clause, from the previous "for", "," or ";". Not "and": in
// "for at least {a} and {b}" the "at least" covers both.
export function sentenceSaysLimit(kind: LimitKind, sentence: string, placeholder: RegExp): boolean | undefined {
  const m = placeholder.exec(sentence);
  if (!m) return undefined;
  const before = sentence.slice(0, m.index), clause = before.split(/\bfor\b|[,;]/i).pop() ?? before;
  // "{x}+", "{x} or more" and "{x} or less" also say it.
  const after = sentence.slice(m.index + m[0].length);
  return SENTENCE[kind].test(clause) || (kind === 'minimum' ? /^\s*(\+|or more)/i : /^\s*or less/i).test(after);
}
export const LIMIT_HINT: Record<LimitKind, string> = {
  maximum: 'By its name this is a maximum the contract may not fully use: label it "Maximum …" and write "up to" or "at most" before it in the sentence.',
  minimum: 'By its name this is a minimum the contract guarantees, not the amount moved: label it "Minimum …" and write "at least" before it in the sentence.'
};
