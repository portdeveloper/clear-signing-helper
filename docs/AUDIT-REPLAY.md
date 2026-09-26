# Audit replay (2026-09-26)

A stand-in for item 3 (an outside team running the skill cold) while no team is available. The registry merged a series of "Cyfrin Audit" fix PRs in September 2026. Each one corrects a descriptor that had already been merged, and each correction is a judgment call this tool leaves to a human or agent. We ran the tool cold on 9 of those contracts, with the answers removed, and checked whether the output repeats the defect the auditors found.

## Setup

- **Targets.** Calldata descriptors from audit PRs whose contracts are Sourcify-verified and use no `calldata` format. Aave (#3024) and Serenita (#3018) were dropped because they use the `calldata` format.
- **Blinding.** The registry clone at `53d86dc` had each target descriptor removed, plus same-entity files sharing a selector with it, their test files, and their `index.calldata.json` entries. It was committed fresh as "registry snapshot 2026-09-25". `registry-priors.json` was rebuilt from that clone (272 descriptors, 500 selectors) and packed into the 0.5.0-preview.1 tarball.
- **Agent.** `claude -p` with Opus 5.5, run from a fresh directory outside this repo, so it had no CLAUDE.md or memory. It got the site's paste prompt ("read https://github.com/portdeveloper/clear-signing-helper and use it to make my contract clear-signable: <address> on <chain>"), the tarball, the blinded clone, a public RPC, and any real transaction hashes the audit PR fixtures had. Nobody was available to answer questions, so each question went to `QUESTIONS.md` with the agent's best answer, tagged `llm`. The session had to stop at the exported bundle.
- **Pilot.** One QuickSwap pilot run exposed two harness problems. First, an index entry and the commit message leaked the blinding. Second, the agent ended its turn to wait on a background task, which ends a headless session. Both were fixed before the 9 runs.

## Results

| Target | Audit finding | Result | Credit |
|---|---|---|---|
| QuickSwap router (#3021) | `addLiquidityETH` hides `@.value` | pass | tool (`@.value` always scaffolded; `UNDISPLAYED_NATIVE_VALUE`) |
| QuickSwap router (#3021) | `approveMax` hidden on permit removes | pass | tool default shows every leaf; agent kept it |
| Morpho Blue (#3022) | `assets` raw; should be `tokenAmount` via `marketParams.loanToken`/`collateralToken` | pass | agent |
| Morpho Blue (#3022) | `shares` must not read as a token amount | pass (raw, "Borrow shares") | agent |
| p2p NativeTokenVault (#3025) | `enterExitQueue.shares` as `tokenAmount` on a vault that is not an ERC-20 | pass (raw) | agent |
| Flying Tulip PutManager (#3026) | FT amounts raw | pass (literal FT address) | agent (FT is a private immutable, so no constant; read via `getFTAddress()`) |
| Flying Tulip EpochRewardsVault (#3026) | `claim` intent names ftUSD, pays FT | pass ("Claim FT rewards") | tool (NatSpec plus verified `FT` constant) |
| SwissBorg NttManager (#3020) | Wormhole chain id shown raw | pass (enum) | agent, by hand-editing the descriptor: decisions cannot create an enum |
| Kiln batch deposit v2 (#3017) | `withdrawalCreds` a raw blob; decode the address by byte slice | **miss** | agent copied "Type and owner" from Kiln's fee-splitter test, whose nested expectation still carries the pre-audit labels |
| KyberSwap MetaAggregationRouterV2 (#3015) | zero `dstReceiver` shows as the null address | pass (`senderAddress`) | agent (idiom found in `paraswap/calldata-AugustusSwapper-v6.2.json`) |
| Hyperliquid CctpExtension (#3006) | total debited hidden; per-batch amount shown as "Amount" | pass ("Total amount", "Amount per burn", "Max fee per burn") | agent (tool showed the leaf by default) |

**10 of 11 checks pass: the tool scored 3 and the agent 7.** Every bundle had 0 lint errors. 8 of 9 passed both registry runners in `export`. QuickSwap exported without runners, because the Rust runner hard-codes chain 137 as MATIC (registry #3027, also hit by the audit PR itself). Runs took 10 to 18 minutes and cost $1.40 to $2.71 each, $18.67 in total. The pilot added $2.54.

What this shows: with the tool, a capable agent produced drafts that avoid most of what the auditors later found in the human-written originals, and the drafts passed registry CI. What it does not show: how a human team does. A human won't read the verified source as thoroughly as this agent did, so for a person the tool's hints matter more. The sample is 9 contracts, one run each.

## Tool and doc defects found (ranked by how many runs hit them)

Fixed on 2026-09-26: every item below, 1 to 10 (and the metadata length limits beside item 4). Item 1 was first fixed by shipping the skill in the npm package (0.6.0-preview.1), then reverted: the package carries no files meant for an agent, so the skill's scripts are now linked by exact raw URL where agents start. Re-applying the Hyperliquid run's own decisions file with the fix and exporting took upstream lint from 7 warnings to 3; both runners passed.

1. **The npm package ships no skill** (9 of 9). `SKILL.md` and `scripts/` exist only on GitHub. Several agents guessed the scripts' path wrong on the first try.
2. **Hidden arguments are dropped instead of written as `"visible": "never"`** (every run with a hidden field). Registry descriptors (Serenita, Hyperliquid EIP-712) use `visible: "never"`. Dropping them leaves upstream lint with "Missing display field" warnings (Kyber 43, p2p 29), and reviewers never see the hide reasons.
3. **`receive()` cannot be excluded through decisions** (QuickSwap, Kyber, p2p). `apply` fails with `UNSUPPORTED_ENTRYPOINT receive()`, the template has no slot for it, and agents hand-edit `clear-signing.toml`.
4. **Labels over 20 characters pass `check`** (Morpho, Hyperliquid, SwissBorg). Upstream lint warns, so agents found out only at export and redid review, test and export.
5. **`export --out` rejects absolute paths and `..`** (EpochRewardsVault, PutManager, Kyber). `UNSAFE_PATH` does not say the path is relative to the project root.
6. **Decisions cannot create an enum** (SwissBorg). `ENUM_REFERENCE` tells the user to "edit the descriptor".
7. **A registry runner divergence fails the whole export** (QuickSwap). There is no per-runner skip with a reason, so the agent dropped `--registry-runners` entirely and lost the Sourcify check too.
8. **Stale docs.** The README's "Supported boundary" lists interpolated intents, display definitions and constant-value fields as unsupported (Morpho, Kiln). CLI `--help` says "in a Foundry repository" (pilot).
9. **`find-in-registry.sh`** greps test files and says "run add-deployment" on any hit (Hyperliquid: the address appeared only as a message recipient in a Circle EIP-712 test).
10. **Smaller:**
    - No token metadata fetch for fixtures; agents ran `cast call` by hand.
    - `init` keeps no verified source, so agents curl Sourcify for semantics.
    - `init` has no `--registry`, so `registryMatches` ignores the user's clone.
    - `nftName` missing from `formatsForType` for uint256.
    - A NatSpec `@notice "Only callable by msig"` was adopted as an intent.
    - Struct-field hints repeat the parent `@param`.
    - Re-running `decisions` resets `author`.
    - Setting `interpolatedIntent: null` reports "0 changed" and leaves stale provenance.
    - A checksum typo gives a `TOKEN_MAPPING` message that never mentions checksums.
    - `CLEAR_SIGNING_RUNNERS_DIR` is undocumented.
    - Field order follows the ABI, and decisions cannot reorder it.
    - `contractName` is not a decisions slot.

Upstream, not ours: the registry runners disagree on a nested `interpolatedIntent`; `INTENT_LENGTH` counts placeholder paths; Kiln's fee-splitter test already fails on the current registry.

## Caveats

- **Imperfect blinding:**
  - Empty `tests/`/`testsv2/` directories were left where files were removed (Kyber and QuickSwap agents noticed).
  - The README text for item 16 names `quickswap/calldata-QuickSwap.json`.
  - The Rust runner has a QuickSwap test.
  - Kiln's fee-splitter test carries the pre-audit rendering.

  No agent found a removed descriptor. The Kiln leak made the result worse, not better.
- **Kyber's transaction hash was wrong for chain 1** (`TX_NOT_FOUND`), which was a harness error. The agent found other real swaps through logs.
- **Real transactions are hard to find without an explorer key.** Free RPCs refuse wide `eth_getLogs` ranges, so most fixtures were encoded.
- **Artifacts** (transcripts, bundles, `QUESTIONS.md`, `REPORT.md`) were kept under `/tmp/claude-1000/cold/` on the dev machine. They are not preserved in the repo.
