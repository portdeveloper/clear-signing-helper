# PuddleSwap StakingRewards: ERC-7730 registry submission notes

Contract: `0xe23B3825F950637256e8DE1BF39743E8f29D97F1` on Monad testnet (chain id 10143), Sourcify-verified (`match`), `src/StakingRewards.sol:StakingRewards`, solc 0.8.35.
Tool: `clear-signing-helper@0.4.0-preview.1` (npm, installed to `WORK/cli`), driven by the skill at `.claude/skills/clear-signing-helper/SKILL.md` in https://github.com/portdeveloper/clear-signing-helper.
Registry clone: `ethereum/clear-signing-erc7730-registry` at `8f56072` (2026-09-22).

## Deliverable

```
out/registry/puddleswap/calldata-StakingRewards.json
out/registry/puddleswap/testsv2/calldata-StakingRewards.tests.json
```

Copy `out/registry/puddleswap/` to `registry/puddleswap/` in a registry clone. The PR adds only these two files. No index file changes are needed: `sync-indexes` regenerates the index after merge.

Working files (not for the PR): `WORK/project/` (ABI-mode project: `clear-signing.toml`, `clear-signing/` with the decisions file, fixtures, expectations, review and provenance), `WORK/project/bundle/` (the full export, including `review/validation.json` and the runner results).

## Decisions (all mine, tagged `llm:claude-opus-5-5`; none came from the user)

The user was not available. Every item below is my decision, not the user's. The decisions file records them with `"author": "llm:claude-opus-5-5"`, and `clear-signing/provenance.json` stores them under that tag.

1. **New descriptor, not add-deployment.** `find-in-registry.sh` found nothing for the address, "puddle" or "StakingRewards", so this is a new entity folder, `registry/puddleswap/` (slug of the owner "PuddleSwap").
2. **Which token each amount is in** (the ABI can't prove this; I read the verified source and on-chain state):
   - `stake.amount` and `withdraw.amount` are in `stakingToken`. The source does `stakingToken.safeTransferFrom/safeTransfer(amount)`. On chain, `stakingToken()` = `0x1FBC7b6B54726D735fF1B47Df75535B4B9021902`: a Uniswap V2 pair, "Uniswap V2" / `UNI-V2`, 18 decimals, token0 USDC `0x534b…43A3`, token1 WMON.
   - `notifyRewardAmount.reward` is in `rewardsToken`. The source compares `reward` against `rewardsToken.balanceOf(this)`. On chain, `rewardsToken()` = `0x97B3070F9Da6C002343862b35E68Bd8e22608943`, WMON, 18 decimals.
   - `recoverERC20.amount` is in the `token` argument (`tokenPath: "token"`). The source calls `IERC20(token).safeTransfer(to, amount)`.
   - I used literal token addresses in `params.token`. Both tokens are `immutable`, and ABI mode can't extract constructor constants into `metadata.constants`. The descriptor has exactly one deployment, so the literals are correct. A future second deployment with different tokens would need its own descriptor or constants.
3. **Intent wording** (all ≤ 30 characters; interpolated templates also ≤ 30, which the linter checks):
   | Function | intent | interpolatedIntent | Why |
   | --- | --- | --- | --- |
   | `stake` | Stake LP tokens | Stake {amount} | Renders "Stake 1.5 UNI-V2" |
   | `withdraw` | Unstake LP tokens | Unstake {amount} | "Unstake" rather than "Withdraw", so a signer doesn't read it as withdrawing rewards |
   | `getReward` | Claim rewards | Claim staking rewards | Plain action; no arguments |
   | `exit` | Unstake all and claim rewards | same | NatSpec ("Withdraw the full stake and claim accrued rewards…") exceeds 30 characters; shortened |
   | `notifyRewardAmount` | Start reward period | Start {reward} reward period | NatSpec: "Start (or extend) a reward period" |
   | `setRewardsDuration` | Set reward duration | Set period: {rewardsDuration_} | Replaces the NatSpec prefill "Change the streaming window", which is vague to a signer. See fix iterations 1, 3 and 4 for the length issue |
   | `recoverERC20` | Recover tokens | Recover {amount} to {to} | NatSpec: "Rescue tokens accidentally sent here" |
   | `grantRole` / `revokeRole` | Grant role / Revoke role | Grant role to {account} / Revoke role from {account} | |
   | `renounceRole` | Renounce role | Renounce role | The only address is the caller's own confirmation, so it isn't interpolated |
4. **Formats:** `setRewardsDuration` uses `duration` (seconds → `168:00:00` for 604800). Recipient/account addresses use `addressName` with `types: ["eoa","wallet"]`. `recoverERC20.token` uses `addressName` with `types: ["token"]`, so the full token address is shown next to the "25 USDC" amount. `role` stays `raw` bytes32: it's the only format the type allows, and there is no enum for bytes32.
5. **Nothing hidden, nothing excluded.** I included the admin functions (`notifyRewardAmount`, `setRewardsDuration`, `recoverERC20`, grant/revoke/renounce role). The skill allows excluding admin flows, but admins sign these from wallets too, and they are the highest-privilege calls. Every one of them renders a complete screen with no hidden argument, so excluding them would only leave admins blind-signing.
6. **Label choices:** "Amount to stake", "Amount to unstake", "Reward amount", "Reward duration", "Recipient", "Your account" (for `callerConfirmation`, which must equal the sender).
7. **Accepted advisory warning `CORPUS_DISAGREEMENT` on `withdraw(uint256)`.** The only prior is Celo's `withdraw(uint256 index)`, where the argument is an index, not an amount. It is a different function that shares the selector, so the raw prior does not apply.
8. **Fixture values (illustrative, not real transactions):** stake 1.5 LP, unstake 0.5 LP, notify 1000 WMON, duration 604800 s (the deployed value), recover 25 USDC, role = `OPERATOR_ROLE` (`0x9766…b929`, read on chain), and `0x8ba1f109551bD432803012645Ac136ddd64DBA72` as the example account/sender. Token metadata (name, symbol, decimals) in the tests was read on chain with `cast call`. No address names were added: unknown addresses render in full, as a wallet shows them.
9. **Test-file formatting.** I ship the testsv2 file as the registry's own `erc7730 format` writes it (compact), not as `export` wrote it (expanded). JSON content is identical (checked). The descriptor was byte-identical either way. Reason: the registry's weekly format bot would otherwise rewrite the tests file.
10. **Did not read** `docs/DOGFOOD.md` in the helper repo, or registry PR #3003 that the helper README/CLAUDE.md mention for this same contract. That keeps the run independent, per the rule about not looking at existing PRs about PuddleSwap.

## Check log

Environment: `PATH=WORK/cli/node_modules/.bin:$PATH`, `CLEAR_SIGNING_RUNNERS_DIR=WORK/cache/runners`, `UV_CACHE_DIR=WORK/cache/uv`, `CARGO_HOME=WORK/cache/cargo`, `npm_config_cache=WORK/cache/npm`.

| # | Command | Result |
| --- | --- | --- |
| 1 | `npm install --prefix WORK/cli --ignore-scripts clear-signing-helper@preview`; `clear-signing --version` | pass, 0.4.0-preview.1 |
| 2 | `find-in-registry.sh <address>` / `puddle` / `StakingRewards` against the clone | no match, so a new descriptor |
| 3 | `clear-signing registry setup-runners --ci-pins registry-clone` | **fail**: `unknown option '--ci-pins'` (the right flag is `--registry`) |
| 4 | `clear-signing registry setup-runners --registry registry-clone` | pass; Sourcify runner `dae3cdab`, Rust `cs-test` `10605ba7` |
| 5 | `clear-signing init --address 0xe23B… --chain-id 10143 --owner "PuddleSwap"` | pass; Sourcify `match`, bound to 10143:0xe23B…, 10 functions |
| 6 | `cast call` stakingToken / rewardsToken / rewardsDuration / OPERATOR_ROLE, plus name/symbol/decimals/token0/token1 (`--rpc-url https://testnet-rpc.monad.xyz`) | pass (values in Decisions 2 and 8) |
| 7 | `clear-signing decisions --contract …` | pass |
| 8 | `clear-signing apply --decisions …` (first version) | pass, with warning `INTENT_LENGTH`: "Set duration to {rewardsDuration_}" is 34 characters → fix 1 |
| 9 | `apply` after fix 1 ("Set {rewardsDuration_} period") | pass (only `CORPUS_DISAGREEMENT`, accepted) |
| 10 | `clear-signing check` | expected fail `REVIEW_REQUIRED` (review not yet accepted) |
| 11 | `clear-signing fixture …` × 10 (one per function) | pass |
| 12 | `clear-signing preview --fixture …` × 10 | pass; all render; `UNKNOWN_ADDRESS` informational only. "Set 168:00:00 period" read badly → fix 3 |
| 13 | `review --accept`, `test --update`, `check --strict-portability`, `test` | pass (10/10) |
| 14 | `export … --out WORK/cache/bundle1` (absolute path) | **fail**: `UNSAFE_PATH` → fix 2 |
| 15 | `export --strict-portability --registry-runners --ci-pins registry-clone --out bundle1 --entity puddleswap` | pass; lint 0 warnings; Sourcify 10/10, Rust 10/10 |
| 16 | Read `erc7730/lint/lint_validate_max_length.py` | I concluded it checked only `intent`. **Wrong**, see row 17 |
| 17 | Fix 3 applied, then `apply`, `review --accept`, `test --update`, `check`, `test`, then `export` (CI pin) and `export` (default pin `f2fafe1 --require-verified`) | all pass, but lint **warning** at both pins: "Display intent too long: Set reward duration to {rewardsDuration_}" → fix 4 |
| 18 | Fix 4 applied, then `apply`, `preview`, `review --accept`, `test --update`, `check --strict-portability`, `test` | pass; 10/10 |
| 19 | `export --contract … --strict-portability --registry-runners --ci-pins registry-clone --out bundle --entity puddleswap` | pass; `erc7730 format` applied; lint (`e7bdf84`, the registry CI pin) exit 0, 0 warnings; Sourcify 10/10; Rust 10/10 |
| 20 | `export --strict-portability --out bundle-strictpin` (built-in pin `f2fafe1` with `--require-verified`, the registry's upcoming PR #3038 setting) | pass; lint 0 warnings |
| 21 | `diff -r bundle/registry bundle-strictpin/registry` | identical |
| 22 | In clone: `check-jsonschema==0.38.0 --schemafile specs/erc7730-v2.schema.json` on descriptor (path resolved from its `$schema`, as in `pull_request.yml`) | pass |
| 23 | In clone: `check-jsonschema --schemafile specs/erc7730-tests-v2.schema.json` on tests file | pass |
| 24 | In clone: `npm ci --ignore-scripts && node tools/scripts/generate-index.js --validate` | pass ("Index is buildable (1261 calldata, 344 eip712 entries)") |
| 25 | In clone: file-name check from `pull_request.yml` (`find registry …`) | pass (no bad names) |
| 26 | In clone: `node .github/scripts/check-selector-coverage.js registry/puddleswap/calldata-StakingRewards.json` | pass (0 of 1 failed; every format has a test) |
| 27 | In clone: `node .github/scripts/check-recommended-fields.js …` (the advisory bot) | pass (empty output: every format has `interpolatedIntent`, no deprecated keys) |
| 28 | In clone: `list-affected-descriptors.js` | our descriptor and its test file detected, `missing_tests: []` |
| 29 | In clone: `uvx --from "$(cat .github/requirements.txt)" erc7730 lint registry/puddleswap/calldata-StakingRewards.json --gha` (exactly the CI step) | pass, "no issue found" |
| 30 | In clone: `erc7730 lint --require-verified` at `f2fafe1` | pass, "no issue found" |
| 31 | In clone: `erc7730 format` (registry-wide, as the weekly bot runs it) | descriptor unchanged; tests file reformatted to compact style. **Side effect:** it also reformatted many unrelated registry files, which I reverted with `git checkout -- .` → fix 5 |
| 32 | JSON equality of formatted vs exported files | both semantically identical; descriptor byte-identical |
| 33 | In clone, on the formatted files: tests schema, selector coverage, Sourcify runner (`--output`), Rust `cs-test run --registry registry -o …` | pass; Sourcify 10/10, Rust 10/10 (Rust printed parse warnings for unrelated `sigs/` files only) |
| 34 | `git -C registry-clone status --short` | only `?? registry/puddleswap/` |

## Fix iterations

1. **`INTENT_LENGTH` in `apply`.** "Set duration to {rewardsDuration_}" was 34 characters. Changed it to "Set {rewardsDuration_} period" (29).
2. **`UNSAFE_PATH` in `export`.** `--out` must be a project-relative path. Changed it to `--out bundle1`.
3. **Wording.** The preview rendered "Set 168:00:00 period", which reads badly. I misread the linter source (row 16) as checking only `intent`, and changed the template to "Set reward duration to {rewardsDuration_}" (41 characters), accepting the CLI's warning.
4. **Lint warning** "Display intent too long" at both lint pins (row 17): fix 3 was wrong, and the linter does count the interpolated template. Changed it to "Set period: {rewardsDuration_}" (exactly 30), which renders "Set period: 168:00:00". Re-ran the full chain: lint 0 warnings.
5. **Test-file format drift.** Running the registry's `erc7730 format` showed the exported tests file is not in the registry's canonical format. I ship the formatted version, whose content is identical, and re-ran schema, coverage and both runners on it. The registry-wide format run also touched unrelated files in my clone; I reverted them. It also made one temporary copy under `/tmp` (outside WORK) for the before/after diff, deleted right after. That broke the "work only inside WORK" rule. Nothing else was written outside WORK.

Also corrected (not a check failure): `registry setup-runners` takes `--registry`, not `--ci-pins` (rows 3 and 4).

## Not done / not verified

- **No PR opened, nothing pushed**, per the rules. To submit: copy `out/registry/puddleswap/` into a registry clone, commit, and open the PR from an account tied to PuddleSwap. The skill and the registry both say maintainers check submitter ownership. **This is the main open risk to first-try acceptance, and nothing in this run addresses it.**
- **GitHub-side CI jobs that need secrets or GitHub infrastructure** (the tests-results comment workflow, labeler, the LLM `analyze` workflow, which is `workflow_dispatch` only) were not run. Their local equivalents (lint, schemas, index, names, selector coverage, recommendations, both runners) were.
- **`--require-verified` with `SOURCIFY_TOKEN`:** I ran it without the CI's token. It passed, and the contract is a Sourcify `match`.
- **No physical-device or Ledger emulator test.** In particular, I haven't confirmed how Ledger displays `duration` (`168:00:00`) or a raw bytes32 role.
- **`metadata.info` (legalName, url) is omitted.** I don't know PuddleSwap's official URL and didn't invent one. 228 of 281 registry calldata descriptors include it. It's optional in the schema and no check flagged it, but a reviewer may ask for it.
- **Roles show as raw 32-byte hashes.** For the PR description: `0x00…00` = `DEFAULT_ADMIN_ROLE`, `0x97667070…b929` = `OPERATOR_ROLE` = `keccak256("OPERATOR_ROLE")`.
- **Testnet only.** The single deployment is on chain 10143. The registry already holds testnet deployments (33 index entries on common testnets), but a maintainer could still ask for mainnet.
- Test transactions are ABI-encoded examples, not recorded on-chain transactions.
