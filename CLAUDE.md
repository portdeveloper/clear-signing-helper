# CLAUDE.md

Project brief and working notes for `clear-signing-helper`. Keep this file current: it is the source of truth for what the tool is for, what it can and cannot do today, and what we are changing next. Update the roadmap status when a change lands.

## Purpose

Make it easy for a team to go from a deployed contract to a descriptor and test file they can open as a PR to the [ERC-7730 clear-signing registry](https://github.com/ethereum/clear-signing-erc7730-registry), so their transactions render as readable text in Ledger and other wallets instead of hex.

**Operating principle.** A deterministic compiler for everything the ABI and calldata prove, plus a recorded-decision workflow for the semantics only a human can supply. It never guesses silently and never blocks a decision a human has recorded.

- Provable, so generate it and never ask: functions, parameter names and types, leaf paths, canonical decoding, rendered strings and `testsv2` expectations, schema and renderer compatibility, review freshness.
- Not provable, so scaffold raw, warn, and record the decision: intent text, which token an amount is in, which arguments to hide, address types, proxy versus implementation binding.
- Heuristic conventions (humanized labels, `amount` for `@.value`) are allowed only when visible in the draft and cheap to change. Never present them as derived.

The success test is simple: a team with a real project (reference case: the sibling repo `../puddleswap`, a Uniswap V2 fork on Monad testnet, chain 10143) runs the tool, edits labels, and ends with files the registry maintainers would merge. Anything that makes them leave the tool to finish, or that rejects a descriptor the registry would accept, is a defect against this purpose. So is asking a human for something the repository already proves (see roadmap item 3).

## What the tool is today (0.3.0-preview.1)

A Node 22+ CLI (`clear-signing`) that works inside a Foundry repo:

- `init` scaffolds raw-value ERC-7730 v2 calldata descriptors from compiled write functions.
- `fixture` encodes a sample call; `preview` renders it through the vendored Sourcify renderer; `test` snapshots renderings; `review --accept` records a fingerprinted human acknowledgement.
- `export` writes the descriptor plus a `testsv2/*.tests.json` file in the registry's v2 test format.
- `check --strict-portability` flags ABI shapes with recorded wallet failures: signed ints, nested arrays, multi-field tuple arrays.

It never signs, sends, publishes, or verifies deployed bytecode. There is also a separate agent skill under `.claude/skills/clear-signing-helper/` for the "I only have an address" path; it shares no code with the CLI.

**What is genuinely good and must be preserved:** fixture encoding, canonical-calldata rejection, exact expected-value generation for `testsv2`, snapshot regression in CI, the hash-pinned vendored renderer with the signed-int fix, and the path/symlink/size hardening in `src/io.ts`.

## Verified gaps (2026-09-19, tested against puddleswap)

These were reproduced by running the tool, not inferred from reading.

1. **Fixed in item 1.** Format allowlist is narrower than the registry. Only `raw`, `addressName` (with `sources: ["local"]` only), `tokenAmount`, `date` pass `check`. `addressName` with `types`, `amount`, `enum`, `unit`, `duration`, `percentage`, `calldata`, `nftName`, `tokenTicker` are all rejected with `UNSUPPORTED_FEATURE`. `@.value` is forced to `raw` wei.
2. **Fixed in item 1.** `tokenPath` into an array is rejected. The registry idiom for a DEX swap, `tokenAmount` with `tokenPath: "path.[0]"`, fails with `TOKEN_MAPPING`. Every V2/V3 router needs this.
3. **Fixed in item 1.** Every argument leaf must be displayed, no opt-out. Omitting an opaque `bytes` payload or a route array is a hard `UNDISPLAYED_ARGUMENT` error. The spec and registry treat omission as a warning; good descriptors hide noise deliberately.
4. **Fixed in item 2.** Export is all or nothing across every selected contract. Exporting one router in puddleswap required deployments and passing fixtures for 9 other contracts (55 `FIXTURE_COVERAGE` errors). There is no per-contract export.
5. **Fixed in item 2** (stubs skipped; deployed dependencies suggested with addresses; still not auto-selected). Default selection is noisy and misses the deployed contract. It selected two empty compile stubs (zero functions) and skipped the real router because it lives under `lib/`. Users must know the dependency's full artifact identity.
6. **Resolved in items 1 and 4** (`--inline-abi` on export; off by default because the schema deprecates it and upstream lint does not read it). Cannot embed the ABI. `context.contract.abi` is rejected even though the compiled ABI is in hand. Upstream lint could not validate fields for chain 10143 because neither Sourcify nor Etherscan has the source. Inline ABI alone did not silence that in `erc7730 lint 1.0.10`; Sourcify verification of the deployment does.
7. **Fixed in item 6.** Offline build error is misleading. `forge build --offline` cannot fetch compilers; the tool reports `FORGE_FAILED` without saying "run `forge build` once first".
8. **Fixed in item 5.** Foundry only. No path from a plain ABI or a verified address into the CLI's fixture and test machinery. Upstream `erc7730 generate` on the same ABI produced a better first draft (typed `addressName`, `amount`, `date`, inline ABI) than `init` does.

Cosmetic items (the "Item" group label, repeated labels, "v0.1" strings) were fixed in item 6.

## Roadmap

Ordered by leverage. Status: `todo` | `in progress` | `done (commit)`.

### 1. Stop rejecting valid registry descriptors — `done` (uncommitted, 2026-09-19)

- Replace the format allowlist in `src/descriptors.ts` with: passes the pinned v2 schema AND the vendored renderer can render it. Reject only what the renderer truly cannot do, and say which one it is.
- Allow all `addressName` params (`types`, `sources`, `senderAddress`). Allow `amount` for `@.value` and scaffold it that way.
- Allow `tokenPath` to reference array elements (`path.[0]`, `path.[-1]`) and resolve them at render time.
- Downgrade `UNDISPLAYED_ARGUMENT` to a warning. Provide an explicit per-field opt-out with a reason (in the descriptor's authoring metadata or `clear-signing.toml`) so the choice is recorded, not silent. Keep `UNDISPLAYED_NATIVE_VALUE` as a hard error.
- Acceptance: the registry-style V2 swap descriptor from this session passes `check`, previews with token symbols, and exports. Existing corpus and adversarial tests still pass.
- Result: formats now gated by schema plus the renderer's implemented set (`SUPPORTED_FORMATS` in `src/descriptors.ts`); all `addressName` params accepted; `tokenPath` may index arrays; `UNDISPLAYED_ARGUMENT` is a warning with a `hidden` opt-out in `clear-signing.toml`; `@.value` scaffolds as `amount` with a static chain table in `src/chains.ts`; fixtures accept `chain`, `ensNames`, `nftCollectionNames`, `blockTimestamps`; `context.contract.abi` is accepted. Engine subset bumped to 3. Verified on puddleswap: the V2 swap renders "1 USDC" / "0.99 WMON" with the route hidden. Export remains project-wide (item 2).

### 2. Per-contract export and sane selection — `done` (uncommitted, 2026-09-19)

- `export --contract <id>` exports one contract with only its fixtures; project-wide export stays as the default.
- Default selection skips contracts with zero write functions and anything under `test/` and `script/`. Print the deployed-looking dependency contracts (for example anything matching an address in `broadcast/`) as suggestions.
- Acceptance: on puddleswap, `init` then `export --contract <router>` succeeds with only the router fixtured.
- Result: `src/broadcast.ts` reads `broadcast/<Script>/<chainId>/run-latest.json` (dry runs skipped). `init` binds `deployments` from creations that map to exactly one compiled contract, and lists deployed non-selected contracts as suggestions. Default selection drops contracts with no entry points and anything under the test/script directories. `check`, `export` and `runTests` take `--contract` (repeatable). Verified on puddleswap: stubs skipped, StakingRewards bound to its testnet address from the broadcast, router exported alone.

### 3. Use what the Foundry project already proves — `done` (uncommitted, 2026-09-19)

The build already requests `devdoc` and `userdoc` and nothing reads them; `broadcast/` is skipped outright. Each item below moves a decision from the human column to the proven column.

- **NatSpec.** Prefill `intent` from a function's `@notice` and field labels from `@param`. Mark the source in the draft so a reviewer can tell author text from humanized identifiers. Fall back to humanized names only when no NatSpec exists.
- **Solidity enums.** Read enum definitions from the AST (`--extra-output ast` or `forge inspect`). For a parameter whose declared type is an enum, emit `metadata.enums.<Name>` and an `enum` format with `$ref`. Provable; never a guess.
- **Broadcast records.** Bindings and suggestions are done in item 2 (`src/broadcast.ts`). Remaining: resolve constructor arguments. Where a constructor argument feeds an `immutable` address (staking token, vault asset, WETH), offer it as the `token` for that deployment's amount fields, labeled as derived from the deployment. Detect ERC1967-style proxy creation and record proxy-to-implementation bindings instead of asking.
- **Standard interfaces.** For ERC-20, ERC-4626 and WETH selectors, apply the settled registry convention as a visible default in the draft. This is a convention, so it stays editable and is marked as such.
- **Broadcast CALL records.** `FundStakingRewards.s.sol` recorded real `notifyRewardAmount` calldata against the deployed StakingRewards. Offer `fixture --from-broadcast` to seed fixtures from those transactions.
- Later, lower certainty: seed fixtures from `forge test` traces.
- Acceptance: on puddleswap, `init` yields StakingRewards with NatSpec intents, `stake` denominated in the staking token from the broadcast, TokenRegistry levels as an enum, and the router bound to `0x430c…` on 10143 without hand editing.
- Result: `src/ast.ts` indexes `forge build --ast` output (selectors, enums through structs and arrays, constructor assignments to immutables, literal address constants). `src/evidence.ts` gathers NatSpec, enums, broadcast-resolved constants and ERC-20/WETH surface detection; `scaffoldWithProvenance` in `src/descriptors.ts` consumes it and returns a provenance list that `init` prints. `fixture --broadcast-tx <hash>` copies a recorded CALL. `UNKNOWN_ADDRESS` is informational. Verified on puddleswap: NatSpec intents on StakingRewards, `metadata.constants.rewardsToken/stakingToken` from the deploy broadcast, `TokenLevel` enum on TokenRegistry, WMON `Wrap`/`Unwrap`, and the recorded `notifyRewardAmount` transaction rendered as a fixture. Denominating `stake` in `stakingToken` stays a one-line human edit (`"token": "$.metadata.constants.stakingToken"`) because the ABI cannot prove which amount is in which token; the router binding stays manual because puddleswap deployed it outside `forge script`.

### 4. Registry-ready output — `done` (uncommitted, 2026-09-19)

- Inline the compiled ABI into `context.contract.abi` on export.
- Lay the bundle out as `registry/<owner>/calldata-<Name>.json` and `registry/<owner>/testsv2/…`, with `$schema` matching registry convention.
- Run upstream `erc7730 lint` on the exported descriptor when `uvx` is available; otherwise print the exact command. The tool's green should mean the registry's green.
- Acceptance: exported bundle drops into a registry clone and passes `erc7730 lint` and the tests-v2 schema without edits.
- Result: bundle is `registry/<entity>/calldata-<Name>.json` + `testsv2/`, with the registry's relative `$schema`, contract-named files, `<fixture> - chain <id>` test descriptions, and a `review/` sibling for fixtures, renderings, validation and portability. `--entity` overrides the owner slug; `--inline-abi` is opt-in because the v2 schema deprecates `context.contract.abi` and `erc7730 lint 1.0.10` ignores it. `src/lint.ts` runs `uvx --from erc7730==1.0.10 erc7730 lint`; errors fail the export, warnings are recorded, `--no-lint` skips, missing `uvx` prints the command. `check` mirrors the linter's 30-character intent warning (`INTENT_LENGTH`), and NatSpec intents are only adopted under that limit. Verified: puddleswap StakingRewards bundle copied into a fresh registry clone passed lint (warnings: no ABI source for chain 10143, which Sourcify verification would clear) and both upstream schema checks. Not run: the registry's Sourcify/Rust test runners, which need the registry's own toolchain.

### 5. ABI and address input — `done` (uncommitted, 2026-09-19)

- Accept `--abi <file>` or `--address <addr> --chain-id <id>` (Sourcify, then Etherscan V2 fallback) as an alternative to Foundry artifacts for `init`, `fixture`, `preview`, `test`, `export`.
- Consider reusing `erc7730 generate` output as the first draft, then layering fixtures and tests on top. The agent skill and the CLI should converge on one code path.
- Acceptance: a Hardhat project or a bare verified address gets the same fixture/test/export workflow.
- Result: `mode = "abi"` in `clear-signing.toml`; ABIs live in `clear-signing/abi/<Name>.json` with a `.source.json` provenance sidecar (`src/abi-project.ts`); `src/fetch.ts` queries Sourcify v2 (proxy resolved to its single implementation, proxy address bound, userdoc/devdoc kept) with an Etherscan V2 fallback behind `ETHERSCAN_API_KEY`. Fingerprint covers the ABI files. `findConfigRoot` accepts either `clear-signing.toml` or `foundry.toml`; modes cannot mix in one directory. Tests mock Sourcify over loopback so CI stays offline. Live check: WETH and the USDC proxy imported from sourcify.dev; the Monad testnet router correctly refused as unverified. The `erc7730 generate` reuse idea was dropped: our scaffold now produces typed defaults itself, and the agent skill remains a separate prompt workflow for now.

### 6. Polish — `done` (uncommitted, 2026-09-19)

- Offline-build failure explains "run `forge build` once so compilers are cached".
- Fix the "Item" group label and duplicated labels in terminal preview.
- Consider persisting provenance alongside review so a later reviewer sees what came from NatSpec versus convention.
- Result: `FORGE_COMPILER_MISSING` names the missing compiler versions and the one `forge build` that fixes it. Terminal preview prints unlabeled groups flat and shows `Path 0: <value>` instead of `Item` / `Path 0: Path: <value>`. `init` and `sync` write `clear-signing/provenance.json` per contract; export copies the selected contracts' entries to `review/provenance.json`.

## Working conventions

- Build and test: `npm ci`, `npm run build`, `npx tsx --test test/*.test.ts` (or `npm test`). Tests compile the Foundry projects under `examples/` and drive the built `dist/cli.js`. Anvil is required for `test/anvil.test.ts`.
- Reference validation target: `../puddleswap/contracts`. Run `forge build --force` there once so solc 0.5.16, 0.6.6, and 0.8.x are cached, then point the CLI at a copy with `--root`.
- Upstream tooling for comparison: `uvx erc7730 lint <file>` and `COLUMNS=10000 uvx erc7730 generate …`. Lint refuses files without a `calldata-` or `eip712-` prefix.
- Any change to `schemas/`, `vendor/clear-signing/`, or `ENGINE` in `src/descriptors.ts` changes the engine fingerprint and invalidates every user's review. Do it deliberately and bump the version.
- Do not weaken: canonical-calldata rejection, size and depth limits, path-escape checks, or the hash check in `scripts/verify-renderer.mjs`.
- Machine note: if forge reports `Exec format error` for solc, the `~/.local/share/svm` cache holds binaries for the wrong CPU architecture. Delete the affected version directories and let forge redownload.

## Decisions

- Network access is limited to two explicit, user-requested moments: `init --address` (Sourcify, then Etherscan with a key) and upstream `erc7730 lint` during export (via `uvx`). Everything else stays offline. Record any new exception here.

- Calldata only for now. EIP-712 stays in the agent skill until the CLI path is solid.
- Portability findings remain warnings by default and hard failures only under `--strict-portability`. They are evidence-backed and should not be removed, but they must not block ordinary authoring.
- The tool records developer review; it never claims audit, attestation, wallet certification, or registry acceptance. Keep that language.
