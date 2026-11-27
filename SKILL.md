---
name: erc7730-coverage
description: Write ERC-7730 v2 calldata descriptors for the most-used uncovered contracts on Ethereum mainnet and open one draft PR per protocol in ethereum/clear-signing-erc7730-registry. Use when asked to raise clear-signing coverage, to cover the top contracts of the Sourcify ranking, or to write a descriptor for a contract the user does not own.
---

# ERC-7730 coverage

Goal: raise the share of clear-signable transactions shown on https://erc7730.sourcify.dev by adding descriptors for the contracts that give the most coverage for the least work.

Spec: https://eips.ethereum.org/EIPS/eip-7730. Work in a clone of `ethereum/clear-signing-erc7730-registry`. Its `specs/`, its merged descriptors and its CI workflows are the reference for anything the spec leaves open. Tools used below: `git`, `gh`, `uvx`, Node, `cargo`, and `cast` from Foundry.

## 1. Pick the contracts

1. Fetch the ranking: `https://erc7730.sourcify.dev/api/live/ranking?window=24h&limit=25&offset=0&exclude=eth,token,unverified,infra` (raise `limit` and `offset` to go further down; `window=7d` shows whether traffic lasts). Each row in `contracts` has `toAddress`, `sharePct`, `topSelectors`, `proxy` and `callers`.
2. Drop a contract when any of these holds, and write down which:
   - **Already covered.** Its address is in `context.contract.deployments` of a registry descriptor. Search deployments, not the whole tree: test files name other contracts as recipients and spenders. The ranking's `inRegistry` can lag. This rule and the next are the ones to trust.
   - **Someone else's open PR.** `gh search prs --repo ethereum/clear-signing-erc7730-registry --state open <address>`, and also search by protocol name: an address inside a diff may not be found.
   - **Already triaged.** Listed in [ADDRESSED-CONTRACTS.md](ADDRESSED-CONTRACTS.md) with a reason. That file is a record from 2026-11-10 and is not kept current.
   - **Custom encoding.** The arguments that matter are packed bytes the format cannot decode (Universal Router commands, opaque aggregator payloads). The registry does not support this yet.
   - **Unverified code on the path.** The contract, or the implementation behind its proxy, has no verified source on Sourcify. A reviewer cannot check the descriptor, and the PR will be blocked.
   - **Paused or superseded.** Call `paused()` where it exists and check whether the protocol has moved to a new address.
   - **Only bots call it.** The row's `callers.verdict` and `oneShotPct` answer this; solver, relayer, keeper and oracle functions are not signed by people.
   - **Short-lived or unidentified.** A presale, airdrop claim or campaign whose traffic is a spike in the 24h window and small in the 7d window, or a project whose site cannot be tied to the address. A registry file lends a project legitimacy. Stop and ask the user before writing one.
3. Choose how far down the list to go: stop where the next contract's `sharePct` is small against the work it needs (many functions, nested structs, no real traffic to test with). Say where you stopped and why.

## 2. Write the descriptor

One file per contract, `registry/<entity>/calldata-<Name>.json`. Use the entity folder the protocol already has in the registry if there is one. `metadata.owner` is the protocol's name and `metadata.info.url` its site; leave the URL out if you cannot tie the site to the address.

**Source.** `https://sourcify.dev/server/v2/contract/1/<address>?fields=abi,sources,proxyResolution`. For a proxy, resolve the implementation on chain (`cast implementation <address>`; the ranking's `proxy` field can be stale), read that source, and bind the proxy's address in the descriptor.

**Deployments.** Include every deployment of the same code that people use. Look for siblings (a second claim contract, per-token gateways) before finishing.

For each function a person signs:

- **Read the code that enforces it** in the verified source. Do not copy a merged descriptor of a similar contract without reading this one.
- **The screen must be true for any argument value.** A dapp fills the arguments. If an argument can switch off a guarantee the screen states (a price limit, a fee-on-output flag, a mode byte), pin it with `visible: {"mustMatch": [...]}` or do not state the guarantee. If a zero address means "the sender", say so with `senderAddress`.
- **Sentence** (`interpolatedIntent`): name every amount that moves, including `{@.value}` on payable functions, and the recipient when it can differ from the sender. If a fee is taken from a shown amount, say "fee included" or show the fee.
- **A function with no arguments** moves what is in storage, so the screen cannot show an amount. Say what it moves in words ("Claim all your vested X") and state this in the PR.
- **Limits are worded as limits**: "at least", "at most", "Minimum", "Maximum".
- **Lengths**: `intent` at most 30 characters; every `label` at most 20 characters (a Ledger device cuts longer ones, and registry PR #3283 holds the AI review to the same limit). A cut label often loses exactly the qualifier that mattered, so put the qualifier first or in the sentence. The linter also warns when the sentence is over 30 characters; a complete sentence usually is, and the registry accepts that warning.
- **Match the protocol's web app** where it has one: use its words for the action and the fields, so the device screen and the dapp screen read alike.
- **Hide only noise** (signatures, opaque route bytes), never an amount or a recipient.
- Leave out admin and bot functions and list them in the PR. Each one gives a "Missing display format" lint warning, which is expected.

Format notes that cost time before:

- A `unit` `base` needs a leading space (`" gwei"`), or the value and unit run together.
- `tokenTicker` on a token the test does not know renders differently in the two registry runners; use `addressName` there.
- `nftName` needs `dataProvider.nftCollectionNames` in the test file.
- A `separator` is not part of the expected test output.

## 3. Write the tests

`registry/<entity>/testsv2/calldata-<Name>.tests.json`:

```json
{
  "$schema": "../../../specs/erc7730-tests-v2.schema.json",
  "descriptor": "../calldata-<Name>.json",
  "dataProvider": { "tokens": {}, "addressNames": {} },
  "tests": [
    { "description": "...", "rawTx": "0x02...", "from": "0x...", "txHash": "0x...", "expected": {} }
  ]
}
```

- `rawTx` is an unsigned type-2 transaction with the gas fields zeroed, as in the merged tests: `cast to-rlp '["0x01","0x","0x","0x","0x","<to>","<value or 0x>","<calldata>",[]]'`, then replace the leading `0x` with `0x02`. `from` is the real sender, EIP-55 checksummed (`cast to-check-sum-address`).
- Use real transactions with their `txHash`. One per function is the minimum; add one per branch that changes the screen: native against token input, each deployment, zero against non-zero recipient, a sentinel value such as max-uint.
- Find them by the contract's logs first. A function that emits no event from the contract will not appear; search the token's `Transfer` events from or to the contract, or WETH `Withdrawal`, before concluding it is never called.
- When no real call exists, encode one and say so in the description ("encoded; no direct call found in N transactions").
- Never write `expected` by hand: put a placeholder, run the Sourcify runner with `--output`, copy each case's rendered value, then read it as the signer would.

## 4. Check before pushing

Run what registry CI runs, at the versions the clone pins. The commands below are the ones in the clone's workflow files on 2026-11-27; read `.github/actions/run-*-tests/action.yml` if they fail.

- **Format and lint**, from the clone root:
  `uvx --from "$(cat .github/requirements.txt)" erc7730 format registry/<entity>`
  `uvx --from "$(cat .github/requirements.txt)" erc7730 lint --require-verified registry/<entity>/calldata-<Name>.json`
  0 errors. Read every warning; the two kinds named in step 2 are the accepted ones.
- **Sourcify runner**: clone `sourcifyeth/clear-signing-test-runner` at the `ref` in `run-sourcify-tests/action.yml`, `npm ci && npm run build`, then `node dist/cli.js <absolute test file> --output <results.json> --verbose`.
- **Rust runner**: clone `llbartekll/clear-signing` at the `ref` in `run-rust-tests/action.yml`, `cargo install --path crates/cs-test --locked` (a few minutes the first time), then `cs-test run <test file> --registry <clone>/registry --output <results.json>`.
- Both runners exit 0 even when a case fails. Read the pass and fail counts in the results; every case must pass in both.

Then re-read the diff against the PR text: every number, address and claim in the description must match the files.

## 5. Open the PR

- One draft PR per protocol, from a branch of a fork.
- First line of the body: the descriptor is not from the contract's owner, who wrote it, and how it was checked.
- List: functions described, functions left out and why, which test cases are real and which are encoded, anything stated on screen that rests on a contract property a reader should know (an ignored argument, a fee kept by the contract), and what was not verified.
- Before any later push, fetch the branch: maintainers merge master into PR branches. Rebase, never force-push.
- Answer each review note with what was taken, what was not, and the reason from the source or the chain.
