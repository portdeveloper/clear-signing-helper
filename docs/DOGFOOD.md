# Dogfood: a real registry submission from the tool's output

Date: 2026-09-19. Project: [PuddleSwap](https://app.puddleswap.org), a Uniswap V2 fork on Monad testnet (chain 10143). Goal: take one contract from a deployed address to a registry pull request using only the CLI, and record what still needed a human.

## Deployer side: source verification

The tool refuses to bind an address whose source is not verified. Verification status before and after this exercise:

| Contract | Address | Before | After | Note |
| --- | --- | --- | --- | --- |
| StakingRewards | `0xe23B…97F1` | unverified | match | `forge verify-contract --verifier sourcify` from the repo build |
| WMON | `0x97B3…8943` | unverified | match | same |
| StableFaucet | `0x5095…6276` | unverified | match | same |
| TokenRegistry | `0x8228…461D` | unverified | unverified | bytecode length differs from current source; the source changed after deployment |
| UniswapV2Router02 | `0x430c…6660` | unverified | unverified | see below |

The router was deployed from this repository's own build (`forge inspect UniswapV2Router02 bytecode`, solc 0.6.6, 200 runs). Comparing on-chain code with the current artifact, every difference sits in the 54 immutable slots except one 32-byte constant: the pair init code hash in `lib/v2-periphery/contracts/libraries/UniswapV2Library.sol`. The repository carries Uniswap's upstream value `96e8ac42…8845f`; the deployed router embeds `354b5f81…126c96`, the hash of the pair bytecode as compiled in this repository. Setting that constant to the deployed value makes the source match and lets Sourcify verify it. That is a change to the deployer's repository and was not made here.

## Tool side: StakingRewards from address to bundle

```sh
clear-signing init --address 0xe23B3825F950637256e8DE1BF39743E8f29D97F1 --chain-id 10143 --owner PuddleSwap
# edit descriptor and clear-signing.toml (see below)
clear-signing fixture --name stake    --contract <id> --function 'stake(uint256)'    --args '["1000000000000000000"]' --chain-id 10143 --to 0xe23B…
clear-signing fixture --name withdraw --contract <id> --function 'withdraw(uint256)' --args '["500000000000000000"]'  --chain-id 10143 --to 0xe23B…
clear-signing fixture --name claim    --contract <id> --function 'getReward()' --chain-id 10143 --to 0xe23B…
clear-signing fixture --name exit     --contract <id> --function 'exit()'      --chain-id 10143 --to 0xe23B…
clear-signing preview --fixture clear-signing/fixtures/stake.json   # and the others
clear-signing review --accept && clear-signing test --update
clear-signing export --strict-portability --registry-runners --out bundle
```

What the tool derived: the ABI and NatSpec from the Sourcify match, the deployment binding, and every expected value in `testsv2`. Upstream `erc7730 format` and `lint` ran on the bundle (lint fetched the reference ABI from Sourcify and validated the fields; the six warnings are the intentionally excluded operator functions). Both registry implementations passed all four cases.

## What still needed a human

1. **Choosing the user-facing surface.** Ten write functions; four are user flows (`stake`, `withdraw`, `getReward`, `exit`). Six operator and role functions were excluded with a reason in `clear-signing.toml`.
2. **Intents.** NatSpec was present on four functions but only one notice fit the 30-character limit as an action ("Change the streaming window", an admin function). The user-facing intents were written by hand: "Stake LP tokens", "Withdraw LP tokens", "Claim rewards", "Withdraw and claim".
3. **Which token the amounts are in.** In ABI mode there is no AST or broadcast, so `metadata.constants` was not available. The LP token address came from `stakingToken()` on chain and from the deploy broadcast's constructor argument in the Foundry checkout; it was written as a literal `token` parameter.
4. **Fixture metadata.** The LP token's symbol and decimals (`UNI-V2`, 18) were read from chain with `cast` and typed into the fixtures.
5. **Verification itself.** Three `forge verify-contract` runs, plus the router diagnosis above.
6. **Registry conventions the tool did not yet cover.** `erc7730 format` rewrote the pretty-printed descriptor into the registry's compact style; export now runs it. The registry's advisory script recommends `interpolatedIntent` on every format; the tool does not author or validate interpolated intents.

## Replay through a decisions file (item 11)

After `decisions`/`apply` landed, the same descriptor was reproduced from `init --address` plus one filled decisions file, with no descriptor JSON edited by hand: intents for the four user flows, `tokenAmount` with the LP token for `stake`/`withdraw`, six exclusions with one reason. The result is identical to the file in PR #3003. Provenance records 12 human decisions, 4 NatSpec-derived values and 1 registry prior. The six human steps above collapse to: fill one file, run three verifications.

## Registry submission

- Branch `puddleswap-staking-rewards` on `portdeveloper/clear-signing-erc7730-registry`, one commit, two files under `registry/puddleswap/`. Registry-side checks run locally: index buildable, `erc7730 lint` clean apart from excluded-function warnings, both schemas, both runners.
- Pull request: [ethereum/clear-signing-erc7730-registry#3003](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3003), opened 2026-09-19 by the owner with the files exactly as exported. Registry CI on the first push, commit `0feb64b`: all 13 checks passed — schema, descriptor and file-name validation, index, attested-descriptor immutability, testsv2 presence and coverage, and the Sourcify and Rust test jobs for `puddleswap/calldata-StakingRewards`. No file was changed after export. Maintainer review pending; feedback to be recorded here.

**First registry feedback (automated, 2026-09-19):** the advisory bot recommended an `interpolatedIntent` on all four formats. The tool could not author one at the time; support was added (validation of placeholders, rendering, expectations, `testsv2`, the decisions slot), the sentences were set through the decisions file ("Stake {amount}", "Withdraw {amount}", "Claim staking rewards", "Withdraw all and claim"), and the branch was updated from a fresh export. Upstream lint then applied its 30-character rule to the template text and flagged a 32-character sentence, so `check` now mirrors that rule and the sentence was shortened. After the update the bot removed its recommendation and all registry checks stayed green, with both runner implementations comparing the rendered sentences.

**Merged 2026-10-16** by marcocastignoli at `1379ae8`, approved with no change requested. The only commits after the owner's are two merges of master into the branch (kuzdogan, marcocastignoli); the descriptor and test file are the ones the tool exported. The approval came out of the registry's new AI review: the maintainer verified the AI review comments of run 38758061010 against the descriptor, the tests and the verified source, and wrote: "the four formats of `StakingRewards` show what the code does. `stake` and `withdraw` move the amount shown in the staking token, which is the contract's immutable `stakingToken` (`0x1FBC…1902`), and no fee is taken. `getReward` and `exit` only send the signer's own stake and accrued rewards back to the signer. 0 notes need a change, 1 is a suggestion." Time from opening to merge: 27 days, all of it in the review queue.

## Related: rebasing the Permit2 EIP-712 PR (#2611)

The owner's earlier PR adding Monad mainnet (143) to Uniswap's Permit2 descriptor had waited since August for a rebase the maintainers requested. Rebased on 2026-09-20 onto a master that had renamed the common descriptor and added three Permit2 test cases; the conflict in the v2 test file was resolved by taking upstream's file and inserting only the Monad token entry and test case positionally (93 added lines, 1 changed). Before pushing: the address was proven to be Permit2 by matching the live `DOMAIN_SEPARATOR()` against the 3-field domain for chain 143, and its bytecode differs from Ethereum's Permit2 in exactly the two cached immutables (chain id and domain separator). Monad USDC's decimals and symbol were read on chain. Both registry runner implementations pass all six cases locally.

What the tool could not do here: `registry add-deployment` covers calldata descriptors only; EIP-712 descriptors still need the manual path. That is the remaining gap the skill documents.

2026-09-23: that gap is closed. `registry add-deployment --rpc-url` on `eip712-uniswap-permit2.json` (with `--set` for the Monad token and spender, `--token` for Monad USDC, `--description` for the PR's test name) reproduces the PR's common-file hunk and a testsv2 file byte-identical to the PR head, proves the address by `DOMAIN_SEPARATOR()` against the descriptor's domain, and passes lint and both runners. What still needed a human: choosing Monad's USDC and the spender to show, and their symbol and decimals.

**Merged 2026-10-16** by marcocastignoli at `7da11c7`, approved for commit `ea8ee11` with "0 notes need a change, 3 suggestions", none blocking and all predating the PR. The AI review run (38765658751) posted no comment because its collect step stopped on a chain Sourcify does not support (9001, in the shared Uniswap file), so the approval was a manual review. The merged diff is the hand-rebased one described above. The tool's `add-deployment` reproduces it but did not author it.

## Top contracts #1: Uniswap V2 Router02 (2026-10-21)

The first of the top contracts from the #3103 sync call (CLAUDE.md phase 5): Ethereum mainnet `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`, #9 by 7-day transactions, not in the registry.

- **What the tool derived:** ABI, source and the `factory`/`WETH` immutables from Sourcify (`init --address`). Selector matching found `quickswap/calldata-QuickSwap.json` (15 of 17 functions), which is a fork owned by QuickSwap, so it served as priors and not as an `add-deployment` target. Fixtures came from real transactions (`fixture --tx`) with token metadata read from chain. Lint, format and both runners ran through `export`.
- **What the agent decided** (one decisions file, `llm:claude-opus-5-5`): wording from `uniswap/calldata-UniswapV3Router02.json`; `interpolatedIntent` for all 17 functions. Two departures from the QuickSwap prior: `liquidity` is shown (as `unit`, 18 decimals, with "UNI-V2" in the label because `unit` glues its base to the number), and `deadline` is shown. The route, token addresses and permit `v/r/s` are hidden with reasons.
- **Finding transactions needed work outside the tool.** The router emits no events, so I scanned blocks over a public RPC for direct calls grouped by selector. 13 functions turned up in ~10 hours of blocks; `swapTokensForExactETH` and `removeLiquidityETHWithPermitSupportingFeeOnTransferTokens` took ~2 more days; the two other `WithPermit` removals never appeared and were encoded. HyperSync (Envio) would do this in one query but needs an API token. Item 17's "automatic discovery stays possible later" is now worth doing: a block scan or HyperSync query by `to` and selector.
- **The Rust runner fails real transactions.** Two of four real `addLiquidity` calls set `deadline` to the year 58774–58775; `cs-test` at `65af228` fails them with `invalid timestamp: timestamp was not in range`, while the Sourcify runner renders the date. The test uses a third transaction; report it to llbartekll/clear-signing.
- **Result:** export passed lint (0 errors, 1 warning for `interpolatedIntent` over 30 characters) and both runners (18/18). Committed as `c1337ce` on branch `uniswap-v2-router02` of a registry clone at `2c2ddeb` in `/tmp/clear-signing-work/registry`, with the PR text in `/tmp/clear-signing-work/PR-uniswap-v2-router02.md`. Opened the same day as **draft** [registry #3133](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3133) from the owner's fork.
