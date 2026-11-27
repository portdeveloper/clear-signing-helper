# Replaying descriptors an agent wrote without the tool

Does an agent with clear-signing-helper write better descriptors than the same model with a plain prompt? We checked on 2026-11-23 by running the tool's checks over 37 descriptors a registry maintainer wrote with a plain prompt to Claude Fable 5.2, without this tool.

**Result.** The replay found no confirmed error in those files. Most of what it flagged was the tool being wrong. The files describe fewer functions than tool-driven runs did on the same contracts, but that is not evidence for the tool: their author's task named the functions to describe.

## What ran

- **Tool:** 0.6.0-preview.9.
- **Input:** 37 calldata descriptors for Ethereum mainnet contracts, with 297 tests, 281 of them carrying the hash of a real transaction. They pass registry lint and the Sourcify runner 37 of 37, and the Rust runner 35 of 37.
- **Loading:** each contract was imported with `init --address`, the descriptor under review replaced the scaffold, and each test's transaction was copied with `fixture --tx`. 258 of the 281 transactions became fixtures.
- **Checks:** `check`, then `claims --budget 60 --time-limit 240` on an anvil fork (the default budget is 100 runs per fixture, so this was a lighter pass than usual).
- **Replayed:** 31 of 37 files, 208 transactions. The other 6 were blocked by tool limits or tool crashes, listed below.
- **Adjusted to load:** 11 files needed a change before the tool accepted them: an ETH-sent field added to a payable function, a function with a nested `calldata` format dropped, or a signature key renamed to the compiler's argument names. Those 11 were not replayed exactly as written.

## What it found in the files

`claims` raised about 90 findings across 12 files. Every distinct one was read against the descriptor. None is a mistake in the descriptor:

- **Contract properties.** A deposit of ETH that ignores its `amount` argument; a router that keeps surplus output. Descriptors written with the tool for the same contracts get the same findings.
- **Refunds.** A call that sends more ETH than it uses and gets the rest back.
- **Tool false positives,** about 80 of the 90. `claims` read a fee field ("Fee from Escrow", "Max fee", "Max submission fee") as the amount paid, and ignored a `threshold` with a `message` that the descriptor sets correctly for a "withdraw everything" value.

The static checks gave 13 sentences that leave out a shown amount or recipient and one Permit2 function that hides the permitted amount. Those are review notes, not errors.

One known trap was checked by hand: the Uniswap V3 SwapRouter file pins `sqrtPriceLimitX96` with `mustMatch` in both single swaps, the fix a maintainer asked for on registry PR #3135.

## Function counts, and why they prove nothing

The 37 files describe 127 of the 561 state-changing functions in the verified ABIs. Their author's task came from a list of the most-used contracts that names the functions to cover, so the files describe those functions on purpose. The tool-driven runs below were asked to cover the whole contract. The two sets answer different tasks, and the difference in counts does not show that the tool finds more.

On four of the same contracts, blind runs of an agent with the tool gave more functions and more real-transaction tests, each passing registry lint and both runners:

| Contract | Functions (tool / plain) | Real-transaction tests (tool / plain) |
|---|---|---|
| TransitSwap RouterV5 | 14 / 3 | 22 / 10 |
| Maya router | 2 / 1 | 4 / 3 |
| Tycho Router V3 | 24 / 6 | 22 / 17 |
| Pendle LimitRouter | 12 / 2 | 13 / 7 |

No reviewer has scored either set for correctness. It is one run per contract, and the two sets were written from different prompts with different scopes. A fair coverage comparison would give both the same task.

## What it showed about the tool

- **`claims` was noisy.** It flagged fee fields, sentinel values and refunds, which would bury a real finding. Fixed the same day: on the 12 files that had findings, 83 became 14, all of them notes about an argument one call ignores or the deposit behaviour above.
- **Nested `calldata` is unsupported.** 7 of the 37 files use it and the tool refuses those functions. One more file uses `metadata.maps`, also refused.
- **The ETH-sent rule is stricter than the registry.** The tool hard-fails 6 files that pass registry lint, because a payable function does not show `@.value`. One was confirmed correct as written; the others were not read against the source.
- **Crashes.** `fixture --tx` failed on one contract's 17 transactions (`s.startsWith is not a function`), and `claims` failed on another (`incorrect data length`).
- **No import command.** Loading someone else's descriptor took a script.

## Limits

- The reading of the `claims` findings was done by the tool's maintainer, not by an independent reviewer.
- `claims` ran at a reduced budget, and it tests only the transactions the files already carry.
- 6 files were not replayed and 11 were adjusted first.
- The harness and its output were not kept in this repository.
