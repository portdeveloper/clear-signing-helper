// Two screen rules from the AI reviews of registry #3149–#3156 (2026-10-27), both by the shape of the descriptor.
import {limitOf} from './limits.js';

// An argument amount mapped to the native currency while @.value is pinned to 0: ETH input cannot be
// clear-signed, so the mapping can only show an ETH amount nobody sends (Sushi's RedSnwapper snwap, registry
// #3156). A minimum is an output and may stay native. Without the pin the same mapping is the aggregator idiom
// (1inch, ParaSwap, OKX require msg.value == amount): 197 fields at registry b70998c, so that case is only a
// decisions hint, and claims tests it on a native-input fixture.
export function nativeAmountWithoutValue(path: string, format: string | undefined, params: Record<string, unknown>, valuePinnedToZero: boolean): boolean {
  if (!valuePinnedToZero || format !== 'tokenAmount' || path.startsWith('@.') || params.nativeCurrencyAddress === undefined) return false;
  return limitOf(path.split('.').pop() ?? path, 'uint256') !== 'minimum';
}
const isZero = (v: unknown) => { try { return (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') && BigInt(v) === 0n; } catch { return false; } };
export const pinnedToZero = (visible: unknown) => !!visible && typeof visible === 'object' && Array.isArray((visible as any).mustMatch) && (visible as any).mustMatch.length > 0 && (visible as any).mustMatch.every(isZero);
export const NATIVE_AMOUNT_HINT = 'A native-currency mapping here shows an ETH amount when the token argument is the native address. Read the native branch: THORChain and Sushi RedSnwapper ignore this argument for ETH and move msg.value, so the screen can show ETH the signer does not pay; 1inch and ParaSwap require msg.value to equal it. Map it to native only if the contract requires that, and never while @.value is pinned to 0.';

// A sentence that names the action but leaves out who receives it or how much: the reviewers' most common
// finding. Recipients are known by the argument's name, so a recipient named otherwise is not seen.
// A fee or referral recipient is paid by the protocol's terms, not the signer's beneficiary.
const FEE = /fee|referr/i;
const RECIPIENT = /^_?(to|recipient|receiver|beneficiary|owner|depositor|onBehalfOf|dst|destination)$|(Recipient|Receiver|Beneficiary)$|^_?minter/i;
export const isRecipientName = (name: string) => RECIPIENT.test(name) && !FEE.test(name);
// @.value is left out: owner-only payable functions show "Value Sent" as a field, and a sentence about 0 ETH
// is noise. An amount or recipient shown as a field but missing from the sentence is the case.
export function sentenceOmits(sentence: string, shown: {path: string; format?: string}[]): string[] {
  const named = new Set([...sentence.matchAll(/\{([^}]+)\}/g)].map(m => m[1].replace(/^#\./, '')));
  // An array element cannot be one value in a sentence.
  return shown.filter(f => !f.path.startsWith('@.') && !f.path.includes('[') && !named.has(f.path) && (
    f.format === 'tokenAmount' || f.format === 'amount' ||
    (f.format === 'addressName' && isRecipientName(f.path.split('.').pop() ?? f.path)))).map(f => f.path);
}
