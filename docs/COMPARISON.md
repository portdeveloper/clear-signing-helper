# The tool against an agent alone

Does a coding agent produce a better registry PR with clear-signing-helper than without it? We measured this once, on 2026-09-23, on one contract. It is one data point, not a benchmark.

**Result.** All four final outputs passed every registry check we could run locally. The tool runs were faster, cheaper and far more consistent from run to run. They were not more correct. The baselines produced slightly richer files: real transactions in the tests, named token constants and a project URL.

## Setup

- **Contract:** PuddleSwap StakingRewards, `0xe23B3825F950637256e8DE1BF39743E8f29D97F1` on Monad testnet (10143), verified on Sourcify. It has 10 state-changing functions, two tokens (an LP staking token and WMON rewards) and AccessControl roles.
- **Model:** `claude-opus-5-5`, effort `high`, in headless Claude Code 2.1.280 (`claude -p --output-format json`).
- **Isolation:** each run started in a fresh directory outside any repository, so no `CLAUDE.md` or project memory was loaded, and no user-level skill or setting mentioned clear signing. The runs were told not to look at existing PRs or forks for this contract, and not to use `gh`. The transcripts show no run read another run's files.
- **Arms:** two runs each.
  - Baseline ([prompt](comparison/prompt-baseline.txt)): the task, plus "do not use clear-signing-helper".
  - Tool ([prompt](comparison/prompt-tool.txt)): the paste-in line from the site, plus the same task and rules.
  - Neither arm could ask the user, so both made the judgment calls themselves and recorded them.
- **No warm cache:** each tool run got an empty runner cache (`CLEAR_SIGNING_RUNNERS_DIR`), so it had to clone and build both registry runners itself.
- **Scoring:** [`comparison/score.sh`](comparison/score.sh) copies each output into a fresh registry clone at `8f56072` and runs the registry's pull-request checks:
  - `erc7730 lint` at the CI pin (`e7bdf84`), and at the pin from registry PR #3038 with `--require-verified`;
  - both JSON schemas;
  - the testsv2 requirement and selector coverage, using the registry's own scripts;
  - the recommendations script and the format bot;
  - both registry test runners (Sourcify `dae3cda`, Rust `10605ba`).

  As a control, the harness was first run on the files of registry PR #3003, which pass registry CI. It reproduced that: lint clean apart from warnings, both runners 4/4.

## Results

| | tool-1 | tool-2 | baseline-1 | baseline-2 |
|---|---|---|---|---|
| Wall-clock | 8.2 min | 7.6 min | 22.5 min | 11.6 min |
| Cost (reported by Claude Code) | $2.66 | $2.58 | $4.36 | $2.72 |
| Output tokens | 33,641 | 31,615 | 58,883 | 36,539 |
| Cache-read input tokens | 4.41 M | 3.84 M | 8.76 M | 4.65 M |
| Turns | 46 | 39 | 83 | 57 |
| Fixes after a failing check | 3 | 1 | 5 | 1 |
| Lint, both pins | clean | clean | clean | clean |
| Schemas, testsv2, coverage, format bot | pass | pass | pass | pass |
| Registry runners (both) | 10/10 | 10/10 | 13/13 | 10/10 |
| Functions described | 10/10 | 10/10 | 10/10 | 10/10 |
| Real on-chain transactions in tests | 0 | 0 | 5 | 4 |
| Token reference | literal address | literal address | `$.metadata.constants` | `$.metadata.constants` |

The raw metrics, final files and each run's own notes are in [`comparison/2026-09-23/`](comparison/2026-09-23/).

**Semantics.** All four runs made the same substantive decisions, and they agree with PR #3003:
- `stake` and `withdraw` are denominated in the USDC/WMON LP token, and `notifyRewardAmount` in WMON;
- `setRewardsDuration` is shown as a duration;
- roles are shown as raw `bytes32`, the only format valid for the type;
- nothing is hidden.

The baselines named the pool in the stake intents ("Stake {amount} (USDC/WMON)"), because the LP token's symbol is the generic "UNI-V2". Neither tool run did that.

## What it means

1. **A capable agent reaches a green PR without the tool.** Both baselines read the registry's CI workflows, worked out that CI runs two test runners, then built and ran both at the pinned revisions on their own. Neither guessed its expected output. So the claim "an agent alone guesses the test output and fails CI" does not hold for this model on this contract.
2. **With the tool, runs are faster, cheaper and predictable.** The tool runs took 7.6 to 8.2 minutes and cost $2.58 to $2.66. The baselines took 11.6 to 22.5 minutes and cost $2.72 to $4.36. The spread matters as much as the mean: the baselines varied 1.9x in time and 1.6x in cost, while the tool runs varied by 8% and 3%.
3. **The tool rules out some mistakes.** baseline-1 first formatted the `bytes32` role as an `enum`. Both runners failed four cases, and it had to redo them. The decisions template offers only `raw` for `bytes32`, so no tool run could make that mistake. A baseline that had skipped the runners would have shipped it.
4. **The tool left out things a reviewer would want.** It has no way to find real transactions for an address, and it does not turn `immutable` token addresses into named constants outside Foundry broadcasts. The baselines did both, with `cast` and by reading the source.

## Tool gaps found, and their status

- `export` formatted descriptors but not testsv2 files, so the format bot would have rewritten the test file. All three tool runs across both rounds hit this and fixed it by hand. **Fixed:** export now formats the test files too (`src/app.ts`), and a test checks it.
- There is no source of real transactions in address mode. Roadmap item 17.
- Immutable token addresses are not turned into named constants in address mode. Roadmap item 17.
- `registry setup-runners` takes `--registry` while `export` takes `--ci-pins`, and one run used the wrong one. Roadmap item 17.

## An earlier round, discarded

A first round used Claude Code subagents started from this repository. Both arms inherited this project's `CLAUDE.md`, which describes the registry's runners and the earlier PR for this contract. The baseline agent pointed this out itself. Its numbers pointed the same way (tool 4.9 min and 126k tokens, baseline 9.3 min and 144k tokens, both outputs green), but the baseline was not blind, so the clean round above replaced it.

## Limits

- One simple contract. A contract with nested structs, arrays of tuples, many functions or an existing registry descriptor could come out differently, most likely in the tool's favour for add-deployment. We have not measured it.
- Two runs per arm, and one model at one effort level.
- No human answered the judgment questions, so neither arm was measured on how well it asks.
- Cost is Claude Code's own estimate from the result JSON.

## Reproduce

```sh
git clone --depth 1 https://github.com/ethereum/clear-signing-erc7730-registry.git /tmp/reg && (cd /tmp/reg && npm ci --ignore-scripts)
docs/comparison/run.sh baseline 1 & docs/comparison/run.sh tool 1 & wait    # results in /tmp/clear-signing-comparison
docs/comparison/score.sh tool-1 /tmp/clear-signing-comparison/tool-1/out/registry /tmp/reg
```
