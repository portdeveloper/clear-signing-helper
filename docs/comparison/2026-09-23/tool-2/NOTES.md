# PuddleSwap StakingRewards: ERC-7730 registry submission notes

Target: `StakingRewards` at `0xe23B3825F950637256e8DE1BF39743E8f29D97F1`, Monad testnet (chain 10143). Owner: PuddleSwap.

WORK is `WORK`. Every path below is relative to WORK.

## Deliverable

```
out/registry/puddleswap/calldata-StakingRewards.json                  sha256 ebc4328c…5704683
out/registry/puddleswap/testsv2/calldata-StakingRewards.tests.json    sha256 6acad769…1474503
```

Copy it into a registry clone as `registry/puddleswap/`. The PR touches that one new entity folder and nothing else. There are no `common-*` or `sigs/` files, and the index files are not edited because `sync-indexes.yml` regenerates them after merge.

The descriptor covers all 10 write functions, and each has one test case:
`stake`, `withdraw`, `getReward`, `exit`, `notifyRewardAmount`, `setRewardsDuration`, `recoverERC20`, `grantRole`, `revokeRole`, `renounceRole`. No function is excluded and no argument is hidden.

## Sources and tools

- Instructions came from the GitHub project `portdeveloper/clear-signing-helper`, cloned to `src/clear-signing-helper` (README.md, CLAUDE.md, `.claude/skills/clear-signing-helper/SKILL.md` and its scripts). I did not read anything under /home/ubuntu/repos.
- CLI: `npm install --prefix ./cli --ignore-scripts clear-signing-helper@preview`, which installed version `0.4.0-preview.1`.
- Registry: `git clone --depth 1 https://github.com/ethereum/clear-signing-erc7730-registry.git registry-clone` at `8f5607207112c8886c090a50f866c5717c218a57` (2026-09-22). `registry-ci/` is a scratch copy of that clone with the deliverable dropped in, used to re-run the registry's CI jobs.
- Verified source was downloaded from Sourcify into `sourcify/`: `match` for both creation and runtime, `src/StakingRewards.sol:StakingRewards`, solc 0.8.35. On-chain facts were read with `cast call` against `https://testnet-rpc.monad.xyz`.
- Deliberately not read: `docs/DOGFOOD.md` in the tool repo, and registry PR #3003. Both describe how this same contract was authored before. Reading them would have broken the "don't look at existing PRs about PuddleSwap" rule in spirit. I only know #3003 exists because the tool's README and CLAUDE.md mention it. I did not open it.

## On-chain facts used (read via `cast call`, not assumed)

| Item | Value |
|---|---|
| `stakingToken()` | `0x1FBC7b6B54726D735fF1B47Df75535B4B9021902`: name "Uniswap V2", symbol "UNI-V2", 18 decimals. It is a PuddleSwap V2 pair: token0 USDC `0x534b…43A3` (6 dec), token1 WMON, factory `0xd498…8A9B` |
| `rewardsToken()` | `0x97B3070F9Da6C002343862b35E68Bd8e22608943`: "Wrapped Monad" / WMON / 18 |
| `rewardsDuration()` | 604800 (7 days) |
| `OPERATOR_ROLE()` | `0x97667070…4fa9b929` |
| Deployer / admin (from Sourcify deployment record) | `0x3eeCb6532B0C9CE1E5759E1a23300bAABb37aBfE` |

## Decisions (all mine: `llm:claude-opus-5-5`, not the user's)

The user was not available. Every judgment below is my own. It is recorded as `llm:claude-opus-5-5` in `project/clear-signing/decisions/StakingRewards.json` and `project/clear-signing/provenance.json`. Nothing is tagged `human`.

1. **Author a new descriptor rather than add a deployment.** `find-in-registry.sh` found nothing for the address, "puddle" or "StakingRewards" in the registry. (Another entity has a file of the same name, but under a different folder with different deployments.)
2. **Entity folder `puddleswap`.** This is the lowercase slug of the owner name, which is the most common folder style in the registry. `metadata.owner` is `"PuddleSwap"`.
3. **Cover every write function, admin ones included.** Admin transactions (reward funding, role changes, token rescue) are the ones where blind signing is most dangerous, so they are described rather than excluded. The user-facing ones are `stake`, `withdraw`, `getReward` and `exit`.
4. **Intent and interpolatedIntent wording.** Every template is 30 characters or fewer, so the linter and the CLI raise no `INTENT_LENGTH` warning. Every format has an `interpolatedIntent`, so the registry's recommendations bot has nothing to report.

   | Function | intent | interpolatedIntent | Why |
   |---|---|---|---|
   | stake | Stake | Stake {amount} | Plain action |
   | withdraw | Withdraw | Withdraw {amount} | Withdraws staked LP |
   | getReward | Claim rewards | Claim staking rewards | Clearer than "Get Reward"; there are no arguments |
   | exit | Withdraw all and claim | Withdraw all stake and claim | NatSpec: "Withdraw the full stake and claim accrued rewards" (too long for 30 characters) |
   | notifyRewardAmount | Start reward period | Stream {reward} as rewards | NatSpec: "Start (or extend) a reward period". Rewards stream linearly over `rewardsDuration` |
   | setRewardsDuration | Set rewards duration | Set period {rewardsDuration_} | The first try, "Set duration to {…}", was 34 characters. The placeholder name is fixed by the ABI |
   | recoverERC20 | Recover tokens | Recover {amount} to {to} | NatSpec: "Rescue tokens accidentally sent here" |
   | grantRole / revokeRole | Grant role / Revoke role | Grant role to {account} / Revoke role from {account} | |
   | renounceRole | Renounce role | Renounce your role | The first try, "Renounce role for {callerConfirmation}", was 38 characters. The contract requires `callerConfirmation == msg.sender`, so "your" is accurate |

5. **Which token each amount is in** (the ABI cannot prove this; the source and chain state do):
   - `stake.amount` and `withdraw.amount` → `tokenAmount` with the literal token `0x1FBC…1902`. The source does `stakingToken.safeTransferFrom` / `safeTransfer(amount)`, and on-chain `stakingToken()` returns this address.
   - `notifyRewardAmount.reward` → `tokenAmount` with the literal token `0x97B3…8943` (WMON), because the reward is measured in `rewardsToken`, and `rewardsToken()` returns WMON.
   - `recoverERC20.amount` → `tokenAmount` with `tokenPath: "token"`, because the source calls `IERC20(token).safeTransfer(to, amount)`.
   - I used a literal token address, not `$.metadata.constants.*`. In ABI mode the CLI extracts no constructor constants, and the decisions template offered only `@.to` or a literal. With a single deployment, a literal is exact.
6. **`setRewardsDuration.rewardsDuration_` uses `duration`.** It is a number of seconds (`periodFinish = block.timestamp + rewardsDuration`). The renderer displays 604800 as `168:00:00`.
7. **Address formats.**
   - `recoverERC20.token` → `addressName` with `types: ["token"]`. I kept it visible even though the amount already shows a ticker. For an arbitrary rescue token the wallet may not know the ticker, and the admin should see exactly which contract is being drained.
   - `recoverERC20.to` → `addressName` with `types: ["eoa","wallet"]`, labelled "Recipient".
   - Role `account` / `callerConfirmation` → `addressName` with `types: ["eoa","wallet","contract"]`. A role holder can be a contract (a multisig or a keeper).
8. **Role `bytes32` is shown `raw`.** It is the only format valid for bytes32. The role is not hidden, because it is the value being granted or revoked. Known limitation: the signer sees a hash (`0x9766…` = OPERATOR_ROLE, `0x00…00` = DEFAULT_ADMIN_ROLE), not a name.
9. **Nothing hidden.** No argument is noise. Every one is an amount, recipient, role or duration.
10. **Accepted the `CORPUS_DISAGREEMENT` warning on `withdraw(uint256)`.** The only registry prior for that selector is `celo`'s `withdraw(uint256 index)`, which takes an index, not an amount. Here the argument is an LP amount, so `tokenAmount` is correct and the prior does not apply. The CLI keeps the warning, and it is advisory only.
11. **Fixture values.** Stake 0.5 LP, withdraw 0.25 LP, notify 1000 WMON, duration 604800 s, recover 5 USDC (`0x534b…43A3`) to the admin, and role calls with OPERATOR_ROLE for the admin. Sender is the real deployer/admin `0x3eeC…aBfE`. Test token metadata (`dataProvider.tokens`) uses the on-chain name, symbol and decimals, including the LP token's literal on-chain symbol "UNI-V2". I added no `addressNames`, so addresses render in full, as a wallet without a name source would show them.
12. **No `metadata.url` / `info`.** I do not know PuddleSwap's official URL and did not invent one. The schema does not require it.
13. **Adopted the registry `erc7730 format` layout for the testsv2 file** (see fix iteration 1).

## Check log

| # | Command (from WORK unless noted) | Result |
|---|---|---|
| 1 | `bash …/find-in-registry.sh 0xe23B…97F1 registry-clone`, and the same with `puddle` and `StakingRewards` | none found → new descriptor |
| 2 | `clear-signing init --address 0xe23B…97F1 --chain-id 10143 --owner "PuddleSwap"` (in `project/`) | pass. Sourcify `match`, deployment bound to 10143:0xe23B…, 10 functions scaffolded raw |
| 3 | `curl https://sourcify.dev/server/v2/contract/10143/0xe23B…?fields=sources,…` | creationMatch=match, runtimeMatch=match |
| 4 | `cast call` for rewardsToken/stakingToken/rewardsDuration/OPERATOR_ROLE and token name/symbol/decimals/token0/token1 | values in the table above |
| 5 | `clear-signing decisions --contract clear-signing/abi/StakingRewards.json:StakingRewards` | template written |
| 6 | `clear-signing apply --decisions clear-signing/decisions/StakingRewards.json` (first version) | applied, with warnings: 2× `INTENT_LENGTH` (renounceRole 38, setRewardsDuration 34) and 1× `CORPUS_DISAGREEMENT` (withdraw) → see pre-export adjustment A |
| 7 | `clear-signing apply …` (second version) | applied. Only the accepted `CORPUS_DISAGREEMENT` warning remains |
| 8 | `clear-signing check` | expected fail: `REVIEW_REQUIRED` (review not yet accepted) |
| 9 | `clear-signing fixture …` ×10 | 10 fixtures created |
| 10 | `clear-signing preview --fixture …` ×10 | all render. Amounts show symbols (0.5 UNI-V2, 0.25 UNI-V2, 1000 WMON, 5 USDC), duration shows 168:00:00. `UNKNOWN_ADDRESS` is informational (no address names supplied) |
| 11 | `clear-signing review --accept` | pass |
| 12 | `clear-signing test --update` | pass, 10 expectations |
| 13 | `clear-signing check --strict-portability` | pass (`CORPUS_DISAGREEMENT` warning only) |
| 14 | `clear-signing test` | pass, 10/10 |
| 15 | `clear-signing export --contract … --strict-portability --registry-runners --ci-pins ../registry-clone --entity puddleswap --out bundle` (runners dir, uv and npm caches under WORK/cache) | pass. `erc7730 format` applied, lint exit 0 with 0 warnings (pin e7bdf84 from the clone's `.github/requirements.txt`), Sourcify runner 10/10, Rust `cs-test` 10/10 |
| 16 | In `registry-ci/`: `CHANGED_FILES=<descriptor> node .github/scripts/list-affected-descriptors.js` | pass. 1 affected descriptor, test file found, `missing_tests: []` |
| 17 | `uvx --from "$(cat .github/requirements.txt)" erc7730 lint <descriptor> --gha` (current CI pin e7bdf84) | pass, "no issue found" |
| 18 | `uvx --from 'erc7730 @ git+…python-erc7730@f2fafe1' erc7730 lint --require-verified <descriptor>` (the pin the tool says registry PR #3038 moves CI to) | pass, "no issue found" |
| 19 | Negative control: changed a path to `amountX` in a scratch copy, then ran check 17 | fails as expected with "`#.amountX` … does not exist in function 0x1171bda9 ABI (see repo.sourcify.dev/10143/…)". So the linter really fetched the verified ABI and validated the field paths; this is not the "Could not fetch ABI" silent skip. File restored and confirmed byte-identical |
| 20 | `uvx --from check-jsonschema==0.38.0 check-jsonschema --schemafile specs/erc7730-v2.schema.json <descriptor>` | pass |
| 21 | `… --schemafile specs/erc7730-tests-v2.schema.json <tests>` | pass (re-run after fix 1: pass) |
| 22 | `npm ci --ignore-scripts && node tools/scripts/generate-index.js --validate` | pass. "Index is buildable", no (chainId, address) collision |
| 23 | File-name job (`find registry -mindepth 2 … ! -name 'calldata-*.json' …`) | pass, 0 offending files |
| 24 | `node .github/scripts/check-selector-coverage.js <descriptor>` | pass. Every selector has a test case |
| 25 | `CHANGED_FILES="<descriptor> <tests>" node .github/scripts/check-recommended-fields.js` | pass. Empty output, so the recommendations bot has nothing to say |
| 26 | `uvx --from "$(cat .github/requirements.txt)" erc7730 format`, then `git diff -- registry/puddleswap` | **fail**: the descriptor was unchanged, but the testsv2 file was reflowed (+17/−81 lines, whitespace only) → fix iteration 1 |
| 27 | After fix 1: the same format, then `git diff -- registry/puddleswap` | pass, 0 lines |
| 28 | After fix 1: `node cache/runners/sourcify-dae3cdab/dist/cli.js <tests> --verbose` | pass, 10 pass / 0 fail |
| 29 | After fix 1: `cache/runners/rust-10605ba7/target/release/cs-test run <tests> --registry registry-ci/registry` (full registry tree, as CI does) | pass, 10/10. It printed warnings about unrelated `*/sigs/*.json` files in other entities, which already exist on master |
| 30 | Final: `diff -r out/registry/puddleswap registry-ci/registry/puddleswap`, then re-ran 17, 18, 22, 24 and 25 | identical, all pass |

The attested-descriptor job does not apply: this is a new entity with no `sigs/`. The Ledger test jobs are disabled in registry CI.

## Fix iterations

- **Pre-export adjustment A** (warning, not a failure): apply/check warned `INTENT_LENGTH` on two interpolated intents. I changed `setRewardsDuration` to "Set period {rewardsDuration_}" (29 characters) and `renounceRole` to "Renounce your role" (18). Re-applied, and the warnings cleared.
- **Fix iteration 1**: the registry's `erc7730 format` (check 26) reformats `testsv2/calldata-StakingRewards.tests.json`. The CLI's export formats only the descriptor, not the test file. In the registry that bot is a weekly `schedule`/`workflow_dispatch` job on master, not a PR gate, so this would not have failed PR CI. It would have produced a later bot commit touching our file. I replaced the test file in `out/` with the formatted version, after confirming it is semantically identical (`json.load` equal). Then I re-ran the tests schema, both runners and format idempotency, and all passed.

That is **1 fix iteration**, plus one pre-export wording adjustment.

## What I could not do or verify

- **Possible conflict with registry PR #3003.** The tool's README and CLAUDE.md say PR #3003, "PuddleSwap StakingRewards", is open. Per the rules I did not look at it. If it merges first, this PR would fail `validate_index`, because each (chainId, address) maps to exactly one descriptor, and the folder and file name would probably collide too. Check its status before opening this PR, and submit only one of the two.
- **No real transactions.** Test cases use calldata encoded by the CLI from chosen arguments, wrapped in unsigned type-2 `rawTx` values (no `txHash`). I did not replay real on-chain transactions.
- **No wallet or device testing.** Rendering was checked only by the vendored Sourcify renderer and the registry's two runners (Sourcify TS and Rust `cs-test`).
- **Ownership.** The registry expects the PR to come from an account tied to PuddleSwap. I opened no PR and pushed nothing, as instructed.
- **Descriptor is pool-specific.** The contract NatSpec says "One instance per farmed pool". Because the staking and reward tokens are literal addresses, this descriptor is correct only for this one deployment. A second pool needs its own descriptor, or a refactor to per-deployment constants. It must not get an extra `deployments` entry here.
- **Lint pin uncertainty.** Registry master pins `erc7730` at e7bdf84. The tool's built-in pin is f2fafe1 with `--require-verified` (registry PR #3038, which the tool describes as open). The descriptor passed both.
- **Role names.** `bytes32` roles display as raw hashes. ERC-7730 has no bytes32-to-name mapping format the renderer supports.
- **Caching outside WORK.** The runners, uv and npm caches were kept under `WORK/cache`. The Rust runner build (`cargo build --locked`) ran with the default `CARGO_HOME` (`~/.cargo`). Its crate cache already existed from 2026-09-19 and nothing was downloaded into it, but cargo did take its lock and touch `~/.cargo` metadata. Nothing was installed globally.
- I did not run the registry's `build-bundle.js` / visual report steps, or `check-permissions`. They are reporting steps, not gates, and some need GitHub context.

## Draft PR text (not submitted)

> **Add PuddleSwap StakingRewards (Monad testnet)**
>
> Adds `registry/puddleswap/calldata-StakingRewards.json` and its `testsv2` file for the PuddleSwap LP staking contract `0xe23B3825F950637256e8DE1BF39743E8f29D97F1` on Monad testnet (10143), which is verified on Sourcify (full match).
>
> All 10 write functions are described and tested: stake / withdraw (amounts in the staking LP token `0x1FBC…1902`), getReward, exit, notifyRewardAmount (in WMON, the rewards token), setRewardsDuration (duration), recoverERC20 (amount in the recovered token), grantRole / revokeRole / renounceRole (role shown as raw bytes32). Nothing is hidden or excluded. Token relationships come from the verified source and the contract's `stakingToken()` / `rewardsToken()`.
>
> Checked locally: `erc7730 lint` (CI pin, and f2fafe1 with `--require-verified`), JSON schemas, index build, selector coverage, recommendations, and both registry runners 10/10. Draft generated with clear-signing-helper 0.4.0-preview.1. Intents and formats were chosen by an AI agent (claude-opus-5-5), and a PuddleSwap maintainer has not reviewed them.

## Working files (not part of the PR)

- `project/`: CLI project (`clear-signing.toml`, decisions file, fixtures, expectations, provenance, review record). `project/bundle/` holds the raw export with its `review/` evidence (validation.json, runner logs, renderings, portability).
- `registry-ci/`: registry clone with the deliverable staged, used for the CI replication.
- `cache/`: runners, uv and npm caches, and runner outputs.
