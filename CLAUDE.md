# CLAUDE.md

Project brief and working notes for `clear-signing-helper`. Keep this file current: it is the source of truth for what the tool is for, what it can and cannot do today, and what we are changing next. Update the roadmap status when a change lands.

## Purpose

Make it easy for a team to go from a deployed contract to a descriptor and test file they can open as a PR to the [ERC-7730 clear-signing registry](https://github.com/ethereum/clear-signing-erc7730-registry), so their transactions render as readable text in Ledger and other wallets instead of hex.

**Operating principle.** A deterministic compiler for everything the ABI and calldata prove, plus a recorded-decision workflow for the semantics only a human can supply. It never guesses silently and never blocks a decision a human has recorded.

- Provable, so generate it and never ask: functions, parameter names and types, leaf paths, canonical decoding, rendered strings and `testsv2` expectations, schema and renderer compatibility, review freshness.
- Not provable, so scaffold raw, warn, and record the decision: intent text, which token an amount is in, which arguments to hide, address types, proxy versus implementation binding.
- Heuristic conventions (humanized labels, `amount` for `@.value`) are allowed only when visible in the draft and cheap to change. Never present them as derived.

The success test is simple: a team with a real project (reference case: the sibling repo `../puddleswap`, a Uniswap V2 fork on Monad testnet, chain 10143) runs the tool, edits labels, and ends with files the registry maintainers would merge. Anything that makes them leave the tool to finish, or that rejects a descriptor the registry would accept, is a defect against this purpose. So is asking a human for something the repository already proves (see roadmap item 3).

## What the tool is today (main; last release 0.4.0-preview.1)

A Node 22+ CLI, `clear-signing`, that works from a Foundry repo, an ABI file, or a verified address (`mode = "abi"` in `clear-signing.toml`).

- `init` scaffolds ERC-7730 v2 calldata descriptors from what the project proves: ABI, NatSpec, enums (AST), constructor constants and deployments (broadcasts), verified source (Sourcify, proxies resolved), ERC-20/WETH conventions, registry priors. Every value is tagged in `clear-signing/provenance.json`.
- `decisions --contract` writes the judgment slots (intent, interpolated intent, denomination, show/hide, exclude) with hints; `apply --decisions` validates and writes descriptor, `clear-signing.toml` and provenance (`human` or `llm`).
- `fixture` encodes a call or copies a recorded broadcast transaction (`--broadcast-tx`); `preview` renders through the vendored Sourcify renderer; `test` snapshots; `review --accept` records a fingerprinted acknowledgement; `check` validates (schema, selectors, paths, renderer-supported formats, registry-prior disagreement, review freshness), all with `--contract`.
- `export` writes `registry/<entity>/calldata-<Name>.json` + `testsv2/`, runs `erc7730 format` and `lint`, optionally both registry runner implementations (`--registry-runners`), and produces no bundle on any failure.
- `registry add-deployment` adds a chain to an existing registry descriptor: calldata with a selector proof against the verified ABI, EIP-712 with a live `DOMAIN_SEPARATOR()` proof over `--rpc-url` (includes followed to the shared deployments file). Both render a test case, make a minimal positional diff in chain-id order, lint, optional runners. `registry setup-runners` pre-builds the runners.

It never signs, sends, publishes, verifies bytecode beyond a Sourcify match, or opens PRs. Network access only at `init --address`, `registry add-deployment` (Sourcify, or read-only RPC for EIP-712), the upstream lint/format run, and the one-time runner build. The agent skill under `.claude/skills/clear-signing-helper/` drives these commands; authoring a new EIP-712 descriptor still falls back to the upstream Python tool.

**What is genuinely good and must be preserved:** fixture encoding, canonical-calldata rejection, exact expected-value generation for `testsv2`, snapshot regression in CI, the hash-pinned vendored renderer with the signed-int fix, the path/symlink/size hardening in `src/io.ts`, validator parity with merged registry descriptors (see the acceptance metric), and the refusals: no guessing, no binding on a name, no writes on validation failure.

## Next up (start here after a context reset)

1. **PR reviews pending, nothing to do:** [#3003](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3003) (PuddleSwap StakingRewards, tool output, CI green, bot recommendation addressed) and [#2611](https://github.com/ethereum/clear-signing-erc7730-registry/pull/2611) (Permit2 on Monad, rebased 2026-09-20, CI green). When feedback arrives, record it in `docs/DOGFOOD.md`; a merge closes item 10.
2. **Item 15, warning noise: done (2026-09-23).** See item 15. Open: nothing measured justifies more; re-measure a fresh draft if a team reports noise.
3. **Item 16, detect a protocol already in the registry: done (2026-09-23).** See item 16.
4. **Architecture review follow-ups (2026-09-23).** Done: engine identity without the tool version, `add-deployment` fails on lint errors and restores the clone on lint or runner failure, one field resolver (`resolveFields` in `src/descriptors.ts`) for validation, decisions, apply, priors and the scaffold. Done too: export and calldata `add-deployment` require the registry runners (or `--skip-registry-runners "<reason>"`) when a displayed field is a signed int or nested array (`runnerDivergence` in `src/portability.ts`; see Decisions). Not covered: EIP-712 test cases, since the portability findings are ABI-shape based. Done 2026-09-23 as well: the lint pin follows registry CI. `DEFAULT_LINT_PIN` is the Sourcify fork at `e823abc` with `--require-verified` (registry PR #3038, open at the time; master still ran `e7bdf84` without the flag). It was `f2fafe1` until #3038 moved to `e823abc` (sourcifyeth/python-erc7730#10): under the flag, a reference ABI that cannot be fetched (rate limit, network error) is now an error, not a warning, so a strict run cannot pass without checking every deployment. Fork PRs lint without a Sourcify token, so a rate limit there now fails CI. Re-linted 2026-09-23 at both pins: #3003 and the five descriptors #2611 affects give identical findings (0 errors). `export --ci-pins <clone>` and `registry add-deployment` read `.github/requirements.txt` and `pull_request.yml` from the clone instead. Update `DEFAULT_LINT_PIN` whenever the registry bumps its requirement. Tested at `f2fafe1`: `--require-verified` checks calldata deployments only; an unverified (even code-less) EIP-712 deployment still lints clean, so #2611 was not at risk. Permit2 on Monad (143, `0x000000000022D473030F116dDEE9F6B43aC78BA3`) was verified on Sourcify anyway on 2026-09-23 from the chain-1 standard JSON input (full creation and runtime match, match id 51549487; code identical to mainnet outside immutables). Lower: `registry-edit.ts` duplicates the renderer data provider and runner diagnostics from `fixtures.ts`/`app.ts`.
5. **Item 17, gaps from the agent comparison** (`docs/COMPARISON.md`): real transactions and named constants in address mode, and one flag name for the runner pins.
6. **Item 13, advisory semantic verifier**, last, and only after measuring its disagreement rate on the corpus.
7. **The test no code substitutes for:** one outside team running the skill cold on a verified contract.

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

### 1. Stop rejecting valid registry descriptors — `done` (2026-09-19, shipped in 0.3.0-preview.1)

- Replace the format allowlist in `src/descriptors.ts` with: passes the pinned v2 schema AND the vendored renderer can render it. Reject only what the renderer truly cannot do, and say which one it is.
- Allow all `addressName` params (`types`, `sources`, `senderAddress`). Allow `amount` for `@.value` and scaffold it that way.
- Allow `tokenPath` to reference array elements (`path.[0]`, `path.[-1]`) and resolve them at render time.
- Downgrade `UNDISPLAYED_ARGUMENT` to a warning. Provide an explicit per-field opt-out with a reason (in the descriptor's authoring metadata or `clear-signing.toml`) so the choice is recorded, not silent. Keep `UNDISPLAYED_NATIVE_VALUE` as a hard error.
- Acceptance: the registry-style V2 swap descriptor from this session passes `check`, previews with token symbols, and exports. Existing corpus and adversarial tests still pass.
- Result: formats now gated by schema plus the renderer's implemented set (`SUPPORTED_FORMATS` in `src/descriptors.ts`); all `addressName` params accepted; `tokenPath` may index arrays; `UNDISPLAYED_ARGUMENT` is a warning with a `hidden` opt-out in `clear-signing.toml`; `@.value` scaffolds as `amount` with a static chain table in `src/chains.ts`; fixtures accept `chain`, `ensNames`, `nftCollectionNames`, `blockTimestamps`; `context.contract.abi` is accepted. Engine subset bumped to 3. Verified on puddleswap: the V2 swap renders "1 USDC" / "0.99 WMON" with the route hidden. Export remains project-wide (item 2).

### 2. Per-contract export and sane selection — `done` (2026-09-19, shipped in 0.3.0-preview.1)

- `export --contract <id>` exports one contract with only its fixtures; project-wide export stays as the default.
- Default selection skips contracts with zero write functions and anything under `test/` and `script/`. Print the deployed-looking dependency contracts (for example anything matching an address in `broadcast/`) as suggestions.
- Acceptance: on puddleswap, `init` then `export --contract <router>` succeeds with only the router fixtured.
- Result: `src/broadcast.ts` reads `broadcast/<Script>/<chainId>/run-latest.json` (dry runs skipped). `init` binds `deployments` from creations that map to exactly one compiled contract, and lists deployed non-selected contracts as suggestions. Default selection drops contracts with no entry points and anything under the test/script directories. `check`, `export` and `runTests` take `--contract` (repeatable). Verified on puddleswap: stubs skipped, StakingRewards bound to its testnet address from the broadcast, router exported alone.

### 3. Use what the Foundry project already proves — `done` (2026-09-19, shipped in 0.3.0-preview.1)

The build already requests `devdoc` and `userdoc` and nothing reads them; `broadcast/` is skipped outright. Each item below moves a decision from the human column to the proven column.

- **NatSpec.** Prefill `intent` from a function's `@notice` and field labels from `@param`. Mark the source in the draft so a reviewer can tell author text from humanized identifiers. Fall back to humanized names only when no NatSpec exists.
- **Solidity enums.** Read enum definitions from the AST (`--extra-output ast` or `forge inspect`). For a parameter whose declared type is an enum, emit `metadata.enums.<Name>` and an `enum` format with `$ref`. Provable; never a guess.
- **Broadcast records.** Bindings and suggestions are done in item 2 (`src/broadcast.ts`). Remaining: resolve constructor arguments. Where a constructor argument feeds an `immutable` address (staking token, vault asset, WETH), offer it as the `token` for that deployment's amount fields, labeled as derived from the deployment. Detect ERC1967-style proxy creation and record proxy-to-implementation bindings instead of asking.
- **Standard interfaces.** For ERC-20, ERC-4626 and WETH selectors, apply the settled registry convention as a visible default in the draft. This is a convention, so it stays editable and is marked as such.
- **Broadcast CALL records.** `FundStakingRewards.s.sol` recorded real `notifyRewardAmount` calldata against the deployed StakingRewards. Offer `fixture --from-broadcast` to seed fixtures from those transactions.
- Later, lower certainty: seed fixtures from `forge test` traces.
- `interpolatedIntent`: done 2026-09-19 after the registry bot recommended it on PR #3003. Validator accepts it and checks placeholders name shown fields; renderer output, expectations and `testsv2` carry the rendered sentence; ERC-20/WETH conventions include the registry's phrasings; the decisions template has the slot with prior phrasings as hints.
- Acceptance: on puddleswap, `init` yields StakingRewards with NatSpec intents, `stake` denominated in the staking token from the broadcast, TokenRegistry levels as an enum, and the router bound to `0x430c…` on 10143 without hand editing.
- Result: `src/ast.ts` indexes `forge build --ast` output (selectors, enums through structs and arrays, constructor assignments to immutables, literal address constants). `src/evidence.ts` gathers NatSpec, enums, broadcast-resolved constants and ERC-20/WETH surface detection; `scaffoldWithProvenance` in `src/descriptors.ts` consumes it and returns a provenance list that `init` prints. `fixture --broadcast-tx <hash>` copies a recorded CALL. `UNKNOWN_ADDRESS` is informational. Verified on puddleswap: NatSpec intents on StakingRewards, `metadata.constants.rewardsToken/stakingToken` from the deploy broadcast, `TokenLevel` enum on TokenRegistry, WMON `Wrap`/`Unwrap`, and the recorded `notifyRewardAmount` transaction rendered as a fixture. Denominating `stake` in `stakingToken` stays a one-line human edit (`"token": "$.metadata.constants.stakingToken"`) because the ABI cannot prove which amount is in which token; the router binding stays manual because puddleswap deployed it outside `forge script`.

### 4. Registry-ready output — `done` (2026-09-19, shipped in 0.3.0-preview.1)

- Inline the compiled ABI into `context.contract.abi` on export.
- Lay the bundle out as `registry/<owner>/calldata-<Name>.json` and `registry/<owner>/testsv2/…`, with `$schema` matching registry convention.
- Run upstream `erc7730 lint` on the exported descriptor when `uvx` is available; otherwise print the exact command. The tool's green should mean the registry's green.
- Acceptance: exported bundle drops into a registry clone and passes `erc7730 lint` and the tests-v2 schema without edits.
- Result: bundle is `registry/<entity>/calldata-<Name>.json` + `testsv2/`, with the registry's relative `$schema`, contract-named files, `<fixture> - chain <id>` test descriptions, and a `review/` sibling for fixtures, renderings, validation and portability. `--entity` overrides the owner slug; `--inline-abi` is opt-in because the v2 schema deprecates `context.contract.abi` and `erc7730 lint 1.0.10` ignores it. `src/lint.ts` runs the registry CI's own linter through `uvx` (since 2026-09-23 the Sourcify fork of `erc7730` from the registry's `.github/requirements.txt` plus its pull-request lint flags; it was `erc7730==1.0.10` until then, which the registry had already stopped using); errors fail the export, warnings are recorded, `--no-lint` skips, missing `uvx` prints the command. `check` mirrors the linter's 30-character intent warning (`INTENT_LENGTH`), and NatSpec intents are only adopted under that limit. Verified: puddleswap StakingRewards bundle copied into a fresh registry clone passed lint (warnings: no ABI source for chain 10143, which Sourcify verification would clear) and both upstream schema checks. Not run: the registry's Sourcify/Rust test runners, which need the registry's own toolchain.

### 5. ABI and address input — `done` (2026-09-19, shipped in 0.3.0-preview.1)

- Accept `--abi <file>` or `--address <addr> --chain-id <id>` (Sourcify, then Etherscan V2 fallback) as an alternative to Foundry artifacts for `init`, `fixture`, `preview`, `test`, `export`.
- Consider reusing `erc7730 generate` output as the first draft, then layering fixtures and tests on top. The agent skill and the CLI should converge on one code path.
- Acceptance: a Hardhat project or a bare verified address gets the same fixture/test/export workflow.
- Result: `mode = "abi"` in `clear-signing.toml`; ABIs live in `clear-signing/abi/<Name>.json` with a `.source.json` provenance sidecar (`src/abi-project.ts`); `src/fetch.ts` queries Sourcify v2 (proxy resolved to its single implementation, proxy address bound, userdoc/devdoc kept) with an Etherscan V2 fallback behind `ETHERSCAN_API_KEY`. Fingerprint covers the ABI files. `findConfigRoot` accepts either `clear-signing.toml` or `foundry.toml`; modes cannot mix in one directory. Tests mock Sourcify over loopback so CI stays offline. Live check: WETH and the USDC proxy imported from sourcify.dev; the Monad testnet router correctly refused as unverified. The `erc7730 generate` reuse idea was dropped: our scaffold now produces typed defaults itself, and the agent skill remains a separate prompt workflow for now.

### 6. Polish — `done` (2026-09-19, shipped in 0.3.0-preview.1)

- Offline-build failure explains "run `forge build` once so compilers are cached".
- Fix the "Item" group label and duplicated labels in terminal preview.
- Consider persisting provenance alongside review so a later reviewer sees what came from NatSpec versus convention.
- Result: `FORGE_COMPILER_MISSING` names the missing compiler versions and the one `forge build` that fixes it. Terminal preview prints unlabeled groups flat and shows `Path 0: <value>` instead of `Item` / `Path 0: Path: <value>`. `init` and `sync` write `clear-signing/provenance.json` per contract; export copies the selected contracts' entries to `review/provenance.json`.

## Roadmap, phase 2

Phase 1 (items 1-6) shipped as 0.3.0-preview.1 on 2026-09-19. Items 7-12, 14, the validator parity pass and the 2026-09-23 architecture fixes shipped as 0.4.0-preview.1 on 2026-09-23. `ENGINE` no longer includes the tool version, so 0.4.0 forced one last `upgrade`, re-review and `test --update`; releases after it that keep renderer, schema and subset force none. Phase 2 is ordered by what a Monad team actually needs first.

### 7. Add a chain to an existing registry descriptor — `done` (2026-09-19)

Most protocols a new chain cares about already have a registry descriptor; the PR that matters is one deployment line plus one test case. Today that is manual.

- `clear-signing registry add-deployment --registry <clone> --descriptor registry/<entity>/calldata-<Name>.json --chain-id <id> --address <addr>`.
- Prove the address is the same contract: fetch the verified ABI from Sourcify and require every function selector in the descriptor's formats to exist in it (Etherscan fallback as in item 5). Refuse otherwise; never bind on name alone.
- Append the deployment, then add a `testsv2` case by rendering an existing case's calldata against the new chain and address through the pinned renderer, so expected values are computed rather than copied.
- Run upstream lint and the tests-v2 schema on the modified files. Print the exact `git` commands; never open the PR.
- Acceptance: adding Monad mainnet (143) to a real registry descriptor produces a diff that passes the registry's lint and schema checks without hand edits.
- Result: `src/registry-edit.ts`, CLI `registry add-deployment`. Selector proof against the verified ABI (`ABI_MISMATCH` refuses and writes nothing); template test chosen from cases whose `to` is a known deployment and whose selector exists in the ABI; rendering runs before any write, so missing chain-specific metadata (`MISSING_METADATA`) also writes nothing; edits are positional insertions (`src/json-edit.ts`) that copy the neighbouring entry's formatting, so a compact one-line registry file gets a one-line diff. `--abi` allows a trusted local ABI, recorded as unverified. Live check used Base WETH (8453, Sourcify match) against the real `registry/weth/calldata-weth.json`. Finding: that file's only test case, "Wrap - chain 1", carries one byte beyond the ABI encoding in its calldata, so it cannot serve as a template under the canonical-calldata rule; the command reports why (`NO_RENDERABLE_TEMPLATE`) and the deployment can still be added with `--no-test`. Registry test data is not guaranteed canonical; a Monad mainnet case still needs a protocol with a Sourcify-verified 143 deployment and an existing registry descriptor.

### 8. Converge the agent skill on the CLI — `done` (2026-09-19)

`.claude/skills/clear-signing-helper/SKILL.md` still drives `uvx erc7730 generate` and hand-written tests. With ABI mode and item 7, the skill should call the CLI for generation, fixtures, tests and export, and keep only the judgment steps (registry search first, intent wording, what to hide, ownership before PR).

- Acceptance: the skill's happy path for "here is an address on chain X" is `init --address`, edit, `fixture`, `preview`, `review --accept`, `test --update`, `export`, and for "protocol already in the registry" it is item 7.
- Result: SKILL.md rewritten around the CLI. Kept: registry-first search (`find-in-registry.sh`), the judgment guidance (30-character intents, token relationships, hide-with-reason, exclusions stated in the PR), ownership gate before any PR, and `verify-address.sh` for the EIP-712 domain check the CLI does not cover. Dropped: `uvx erc7730 generate` and hand-written testsv2 for calldata. `docs/AGENT-SKILL.md` and the README agent section describe the same flow.

### 9. Run the registry's test runners on export — `done` (2026-09-19)

Upstream lint and the schemas run today; the Sourcify and Rust runners do not. They are the last difference between the tool's green and the registry's CI.

- Optional `export --registry-runners <registry-clone>` that runs both runners on the bundle when their toolchains are present, records results in `review/validation.json`, and fails on any failed case.
- Acceptance: the 0.2.0 Morpho exercise (23 cases) reproduces through the flag instead of `scripts/validate-morpho-registry.py`.
- Result: `src/runners.ts` clones and builds the Sourcify runner and `cs-test` at the registry CI's pinned revisions (built-in pins, or `--ci-pins <clone>` / `registry add-deployment --runners` reading `.github/actions/run-*-tests/action.yml`), caches them under `~/.cache/clear-signing-helper/runners/`, runs both on each `testsv2` file with the bundle's `registry/` as registry root, and passes only when every case is `pass` and the count matches the fixture. Failures fail the export and remove the bundle; results and logs go to `review/runners/`. `registry setup-runners` pre-builds. Tests use stub executables via `CLEAR_SIGNING_RUNNERS_DIR`. The Morpho 23-case reproduction was not rerun; the real runners were exercised on the ABI-mode WETH bundle, the puddleswap StakingRewards bundle, and the registry's Morpho Blue test file with an added chain (see live results in the commit).

### 10. Dogfood a real submission — `in progress` (PR #3003 open; registry CI green; the bot's interpolatedIntent recommendation addressed and withdrawn; maintainer review pending)

- Verify the puddleswap router on Sourcify (deployer side), import it with `init --address`, and take one contract through review, export and an actual registry PR opened by the owner. Record what still needed a human.
- Acceptance: a merged registry PR whose files came out of `export` unchanged, or a written list of what the maintainers asked to change.
- Progress (2026-09-19): StakingRewards, WMON and StableFaucet verified on Sourcify from the repo build; router and TokenRegistry source no longer match their deployments (router: pair init code hash constant; details in `docs/DOGFOOD.md`). StakingRewards taken from `init --address` to an exported bundle that passes format, lint, both schemas and both runners; staged as branch `puddleswap-staking-rewards` on the owner's fork and opened as [registry PR #3003](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3003) with the exported files unchanged. Export now runs `erc7730 format` so the registry's format bot leaves the PR alone. Human steps recorded in `docs/DOGFOOD.md`. 2026-09-19: the registry's advisory bot asked for `interpolatedIntent`; support was added, the branch regenerated from the decisions file, all 13 checks green again and the bot withdrew. 2026-09-20: #2611 (Permit2, EIP-712, manual) rebased and green; its Monad address proven by `DOMAIN_SEPARATOR()`. 2026-09-22: validator parity pass (see acceptance metric). Maintainer review of both PRs still pending.

### 14. EIP-712 `registry add-deployment` — `done` (2026-09-23)

Most Monad additions to established protocols are EIP-712 (Permit2 proved it); item 7 covered calldata only.

- Acceptance: #2611's change reproduced by one command.
- Result: `add-deployment` dispatches on `eip712-*.json` (`addTypedDataDeployment` in `src/registry-edit.ts`). It follows `includes` to the file holding `context.eip712.deployments` and merges the chain with the renderer's `mergeDescriptors`. The proof takes `--rpc-url` (required) and checks `eth_chainId` equals `--chain-id`, `eth_getCode` is non-empty, and `DOMAIN_SEPARATOR()` equals a candidate domain for that chain and address. Candidates come only from registry files: the descriptor's `context.eip712.domain`, each existing test's `EIP712Domain` type and domain, and the 2-field shape; shapes that do not bind chainId and verifyingContract are skipped. Failures are `RPC_REQUIRED`, `RPC_CHAIN_MISMATCH`, `NO_CODE`, `DOMAIN_UNVERIFIABLE` and `DOMAIN_MISMATCH` (lists every candidate hash), and none of them writes anything. An existing typed-data test is retargeted (domain chainId and verifyingContract). `--set <path>=<value>` overrides existing message leaves only (a typo is refused) and `--template` picks the case. It renders through `formatTypedData` with a zero-address account and fails on any top-level warning, as the registry's Sourcify runner does. `templateAddresses` lists message addresses still copied from the template's chain, since `dataProvider` tokens are not chain-keyed. Deployments are now inserted in chain-id order when the list is sorted (`insertIntoArray` in `src/json-edit.ts`; calldata benefits too), and a copied multi-line neighbour keeps its indentation. Lint runs on every descriptor whose include chain reaches the edited file. `--token` entries are written in the schema's key order (symbol, decimals, name). Live: against registry `8f56072` with `https://rpc.monad.xyz`, the #2611 command produced the same four-line common-file hunk and a testsv2 file byte-identical to the PR head. Lint showed 0 errors across the 5 affected descriptors (8 warnings, all in the UniswapX descriptors this edit does not change), and both runners passed 6/6. Limit: a matching domain proves the contract signs under that domain, not that its bytecode matches the other deployments; the result says so in `verification.caveat`.

### 15. Warning noise — `done` (2026-09-23)

The premise ("a fresh draft shows dozens") did not survive measurement. A fresh `init` of all 7 puddleswap contracts, reviewed, showed 9 warnings, and StakingRewards in address mode showed 0. All 9 came from the tool's own defaults, and the output named no contract, so TestUSDC and TestUSDT printed identical lines. The corpus numbers (496/129) are merged registry descriptors, not drafts.

- `UNDISPLAYED_ARGUMENT` counts a leaf that a displayed field reads through `token`, `tokenPath`, `collection`, `collectionPath` or `chainIdPath` as displayed, as the registry linter does (`compute_format_schema_paths` in python-erc7730). This is kept separate from `displayedLeaves`, so a `hidden` entry on such a leaf is still not `HIDDEN_AND_DISPLAYED`. Corpus: 496 → 284 (212 false positives, mostly `srcToken`/`fromToken`/`toToken` under a displayed amount). Acceptance unchanged at 258 of 280.
- `CORPUS_DISAGREEMENT` needs unanimous priors from at least `MIN_PRIOR_ENTITIES` (2) entities. All 5 draft warnings rested on a single entity's format for an unrelated function sharing the selector (bedrock `mint`, celo `withdraw` against the WETH convention). Priors remain hints in `init` and `decisions`. Corpus count is 0 before and after; the snapshot contains each corpus descriptor, so the corpus cannot measure this rule. Drafts are the measure.
- ERC-20/WETH conventions list phrasings per selector (registry first, then a shorter one) and scaffold the first that fits `MAX_INTENT` with the contract's parameter names, else none, recorded in provenance. This removed the 4 `INTENT_LENGTH` warnings the convention caused itself.
- Each warning code has its own remedy (`WARNING_REMEDY`); before, every warning told the reader to display the argument or record a hidden reason, including in `--json`. `check` and `apply` print warnings grouped by descriptor, then by code in `WARNING_RANK` order (signer-visible, then registry lint, then advice), with a count summary. The registry linter itself groups too-long intents into one warning per descriptor.
- Result: the same puddleswap draft shows 0 warnings. No `subset` bump, because warnings do not enter review or expectations.

### 16. Detect a protocol already in the registry — `done` (2026-09-23)

Adding a chain beats a new descriptor, but nothing in the CLI notices that a contract is already covered. The skill greps a registry clone for the address or name, which misses a deployment at a new address and an entity folder named differently from the query.

- `init` compares the contract's full selector set against the bundled registry priors (`src/data/registry-priors.json`). When one registry descriptor describes every function the draft would describe, print "looks like `registry/<entity>/calldata-<X>.json`; consider `registry add-deployment`" with the overlap. No new network access.
- A suggestion, never a decision: forks and standard interfaces share selectors (every ERC-20 matches every ERC-20 descriptor), so exclude pure ERC-20/WETH surfaces or rank by selector-set overlap, and never bind or skip authoring on the match.
- Acceptance: a Uniswap V2 router ABI suggests the registry's V2 router descriptor(s); puddleswap StakingRewards suggests nothing or a clearly low-overlap list; WMON gets the WETH convention, not a suggestion. EIP-712 is out of scope (priors are calldata only).
- 2026-09-23: `find-in-registry.sh` used to tell agents to add the deployment by hand; it now points to `registry add-deployment`, which proves the address first.
- Result: `registryMatches` in `src/priors.ts`, used by `init` (`registryMatches` in the result, "Already in the registry?" in the output). A match needs `MIN_SHARED` (2) shared distinctive selectors, plus either containment (every selector the file describes exists in the contract, which is what `add-deployment`'s selector proof requires) or coverage of at least half of the contract's distinctive selectors. A selector is generic when `GENERIC_ENTITIES` (3) or more entities describe it. That is 12 selectors at `8f56072`: ERC-20, ERC-4626, ERC-721, Ownable, `multicall`, `burn`. This is data-driven, not a hand list. Top 3 matches, contained ones first.
- The roadmap's wording ("consider `registry add-deployment`") was only half right. puddleswap's router is a fork: it matches `quickswap/calldata-QuickSwap.json` (15 of 17 V2 functions), a file QuickSwap owns, and adding PuddleSwap's address to it would break the ownership gate. The output and the skill give both readings (same protocol: `add-deployment`; fork: author your own, and the matched formats are already `registryPriors` hints), and the skill tells the agent to ask the user.
- Coverage alone missed the same-protocol case. SwapRouter02 (live `init --address` on chain 1) shares only 6 of 32 distinctive functions with `uniswap/calldata-UniswapV3Router02.json`, because the registry describes only the swaps; containment is what finds it.
- Measured: of 64 puddleswap artifacts with write functions, only the V2 router and its interfaces match (QuickSwap). StakingRewards, WMON, the Pair and the Factory match nothing; single shared selectors (`withdraw`, `permit`, `mint`) are cut by `MIN_SHARED`. Corpus cross-check, each registry file's selectors as an ABI: 2 of 280 files match another entity's file, serenita `EthVault` and p2p `NativeTokenVault` (StakeWise vault functions), a real same-code pair. Priors hold no deployments, so this is selectors only; an address match would need the snapshot to carry deployments.

### 17. Close the gaps the agent comparison exposed — `todo`

`docs/COMPARISON.md` (2026-09-23): with the tool, Opus 5.5 finished in 7.6 to 8.2 min for $2.58 to $2.66; without it, in 11.6 to 22.5 min for $2.72 to $4.36. All four outputs passed every registry check. The baselines' files were richer in three ways the tool should match.

- Real transactions in address mode: `fixture --from-chain <address> --rpc-url <url>` (or similar) finds recent calls to each selector with `eth_getLogs` and receipts, then copies them the way `--broadcast-tx` does. It needs a new recorded network exception.
- Named constants in address mode: read `immutable` address slots from the verified source (Sourcify gives the AST) and resolve them with `eth_call` to the public getter, then offer `$.metadata.constants.*` the way the broadcast path does.
- `registry setup-runners --registry` against `export --ci-pins`: accept one name for both.
- Done 2026-09-23: `export` now formats testsv2 files with the descriptors. All three tool runs had hit the format-bot drift.

### Later

- EIP-712 authoring (104 descriptors in the registry corpus): a separate decoding and review model. Adding a chain to an existing EIP-712 descriptor is done (item 14).
- Physical-device acceptance and independent human review, still open from the 0.2.0 tracker.
- Persisting provenance into the review record so `review --accept` acknowledges sources explicitly.

## Acceptance metric: does the validator accept what the registry merged?

`npm run registry:acceptance -- <registry clone>` runs `validateDescriptor` over every merged calldata descriptor (includes resolved). 2026-09-22 at registry `9f37816`: **261 of 284 accepted**; the 23 rejections are the `calldata` format (32 fields across 22 files; nested-call resolution is out of scope) and one encrypted field. Before this pass the number was 11 of 284: the validator rejected `#.` root prefixes, `$id`, `$ref` definitions, constant-value fields, `visible: never/optional` and rule objects, byte slices, group-scoped parameter paths, token references to integer leaves, and treated type mismatches and a missing intent or owner as errors where the renderer only warns. All of those now follow the renderer's semantics. 2026-09-23 at registry `8f56072` (280 descriptors), before and after moving every field walker onto `resolveFields`: **258 of 280 accepted** both times; the change removed 312 `CORPUS_DISAGREEMENT` and 38 `UNDISPLAYED_ARGUMENT` false positives ($ref definitions and byte slices such as `goodUntil.[-4:]`) and added no diagnostic. 2026-09-23, item 15: still 258 of 280; `UNDISPLAYED_ARGUMENT` 496 → 284 after counting parameter-referenced leaves as displayed. Re-run this after any validator change; a new rejection class is a regression against the registry.

## Roadmap, phase 3: the LLM's place in the pipeline

Principle, refined from phase 2: derive everything provable deterministically; let AI propose only what cannot be derived; verify everything verifiable against the registry's own tools; a human owns what cannot be verified. The model sits after the scaffold and fills only its judgment slots. It never generates the provable parts, and it never submits.

### 11. Decisions template and `apply` — `done` (2026-09-19)

The six human steps in `docs/DOGFOOD.md` are all judgment slots the scaffold leaves raw. Make them an explicit interface any agent, or a person, can fill without touching descriptor JSON.

- `clear-signing decisions --contract <id>` writes `clear-signing/decisions/<Name>.json`: per function, the slots that need judgment (intent, label per field, denomination for each amount with the candidate references the tool can offer such as `@.to`, `$.metadata.constants.*`, address arguments; hide-with-reason; exclude-with-reason), pre-filled with whatever evidence provided and its source.
- `clear-signing apply --decisions <file>` writes the descriptor and `clear-signing.toml` from it, validates, and records `source: llm` or `source: human` in `clear-signing/provenance.json` per decision (the file carries an `author` field).
- The LLM stays outside the CLI: no API keys or model calls in the tool. The skill instructs the agent to fill the decisions file.
- Acceptance: the PuddleSwap StakingRewards authoring in `docs/DOGFOOD.md` is reproducible from a decisions file alone; provenance distinguishes agent-authored intents from NatSpec ones.
- Result: `decisions --contract` writes `clear-signing/decisions/<Name>.json` with, per function, `decision`/`excludeReason`, `intent`, and per leaf `show`/`hideReason`/`label`/`format`/`params`, each carrying read-only `hints` (NatSpec, registry priors for the selector, candidate denominations, formats valid for the type, the 30-character intent limit). `apply --decisions` requires `author`, edits leaves in place to preserve grouping, drops hidden leaves and appends newly shown ones, refuses a hidden `@.value` or unsupported format, validates the whole descriptor before writing, then writes descriptor + `clear-signing.toml` + provenance tagged `human` or `llm`. The file round-trips. The skill now instructs agents to use it instead of editing JSON. 2026-09-23: provenance records only values that differ from the template `decisions` would write now (unchanged values keep their `natspec`/`ast`/`convention` source, and re-applying an unchanged file records nothing); a function or field may carry its own `author` overriding the file's, and each entry stores the full author string (`llm:<model>`). The author is self-declared; nothing verifies it. The skill tells agents to tag only the user's specific answers `human`. Verified in tests on the example router, and live: the PuddleSwap StakingRewards descriptor in registry PR #3003 was reproduced exactly from `init --address` plus one decisions file (provenance: 12 human, 4 natspec, 1 registry prior).

### 12. Registry-corpus selector prior — `done` (2026-09-19)

If another registry descriptor already formats the same selector, that format is the strongest available hint and disagreement is worth a warning; no model needed.

- Index `test/fixtures/registry/corpus.json` (already pinned) by selector to the formats other entities use for it, plus the entity name.
- `init` pre-fills the decisions template with the prior and its source (`registry:<entity>/<file>`); `check` warns `CORPUS_DISAGREEMENT` when a format's field formats differ in kind (raw vs tokenAmount, hidden vs shown) from every prior for that selector.
- Keep the corpus snapshot date visible; add `registry:snapshot` refresh to the release checklist.
- Acceptance: an ERC-20 `approve` or a Uniswap V2 `swapExactTokensForTokens` draft shows the prior; a deliberately raw amount on a selector the corpus formats as `tokenAmount` warns.
- Result: `scripts/snapshot-priors.ts` writes `src/data/registry-priors.json` (includes and `$ref` definitions resolved, keyed by selector; 283 descriptors, 1450 formats, 550 selectors at registry `9f37816`, ~800 KB bundled; refreshed for 0.4.0 at `8f56072`: 280 descriptors, 1419 formats, 533 selectors). `src/priors.ts` aligns leaves by ABI position so differing parameter names still compare, classifies each leaf as hidden/raw/typed, and reports `CORPUS_DISAGREEMENT` only when every prior agrees and the draft differs. `init` lists priors under evidence as `[registry prior]`. Separate from `corpus.json`, which stays format-free for the compatibility tests. Release checklist gained a refresh step.

### 13. Advisory semantic verifier — `todo` (do last; treat as a hypothesis)

An LLM reading source and judging whether each intent and denomination matches is a plausibility opinion, the same thing a registry reviewer does. It may catch the obvious mismatch and will pass subtle ones.

- Output per format: `agree | disagree | unsure` with one sentence of reasoning, written to `review/semantic.json`; never a gate. `unsure` and `disagree` are listed for the human before `review --accept`.
- Measure before trusting: run it over the pinned corpus, whose intents are already accepted, and record the disagreement rate. If it flags accepted descriptors at a real rate, the pass is noise and is dropped.
- Same boundary as item 11: the CLI defines the prompt and the result schema; the agent runs the model.
- Acceptance: a disagreement rate on the corpus low enough that a flag is worth a human minute, documented with the model and date.

Not doing: "generate first with AI" (the model would regenerate the provable parts the scaffold gets right for free), auto-submitting PRs (ownership gate; maintainers check submitter ties to the owner), or an in-CLI model call.

## Public overview page

https://portdeveloper.github.io/clear-signing-helper/ is built from `site/index.html` by `.github/workflows/pages.yml` on every push to `main` that touches `site/`. Sections: a lead with the goal line, "Use it" (the paste-into-agent prompt and an "If you are an AI agent" card summarizing SKILL.md, mirrored in `site/llms.txt`; keep both in step with the skill), the DOES / does NOT lists (each item linked to the enforcing code), the pipeline diagram with a file legend, "Run it yourself" commands, the comparison with `erc7730`, Ledger's JSON Builder and Cyfrin's `clearsig`, "Compared with an agent alone" (numbers from `docs/COMPARISON.md`; update both together if the comparison is re-run), and a status list. Every claim links to a file on `main`. Keep the status list, the acceptance number and the test count there in step with this file; no eyebrow lines, no repeated content.

## Working conventions

- Build and test: `npm ci`, `npm run build`, `npx tsx --test test/*.test.ts` (or `npm test`). Tests compile the Foundry projects under `examples/` and drive the built `dist/cli.js`. Anvil is required for `test/anvil.test.ts`.
- Reference validation target: `../puddleswap/contracts`. Run `forge build --force` there once so solc 0.5.16, 0.6.6, and 0.8.x are cached, then point the CLI at a copy with `--root`.
- Upstream tooling for comparison: `uvx --from 'erc7730 @ git+https://github.com/sourcifyeth/python-erc7730@<sha>' erc7730 lint --require-verified <file>` (the sha is in the registry's `.github/requirements.txt`; `DEFAULT_LINT_PIN` in `src/lint.ts` holds the built-in one) and `COLUMNS=10000 uvx erc7730 generate …`. Lint refuses files without a `calldata-` or `eip712-` prefix.
- Any change to `schemas/`, `vendor/clear-signing/`, or `ENGINE` in `src/descriptors.ts` changes the engine fingerprint and invalidates every user's config, review and expectations. Do it deliberately; bump `subset` for validator semantics. The tool version is deliberately not in `ENGINE`.
- Field trees are read only through `resolveFields` (group scope, `$ref` merge, `#.` roots, slices, `visible: never`). A new consumer that walks fields by hand is how the validator, decisions and priors drifted apart before.
- Do not weaken: canonical-calldata rejection, size and depth limits, path-escape checks, or the hash check in `scripts/verify-renderer.mjs`.
- Machine note: if forge reports `Exec format error` for solc, the `~/.local/share/svm` cache holds binaries for the wrong CPU architecture. Delete the affected version directories and let forge redownload.
- Local state that lives outside the repo and how to recreate it:
  - **Registry runners** build once into `~/.cache/clear-signing-helper/runners/` (or `$CLEAR_SIGNING_RUNNERS_DIR`); `setupRunners` takes the fast path when both artifacts exist. Rebuild with `clear-signing registry setup-runners` (needs `git`, `npm`, `cargo`; about 20 s warm, minutes cold).
  - **Registry clone** for `add-deployment`, the acceptance metric and prior snapshots: `git clone --depth 1 https://github.com/ethereum/clear-signing-erc7730-registry.git <dir>`. Run `git -C <dir> checkout -- .` between experiments so the clone stays clean.
  - **puddleswap working copy**: `cp -r ../puddleswap/contracts <scratch>/puddle && (cd <scratch>/puddle && forge build --force)`, then point the CLI at it with `--root`. Never run the CLI against `../puddleswap` itself; it writes `clear-signing/` and `clear-signing.toml`.
  - **ABI-mode scratch projects** need only an empty directory; `init --address` fetches everything. Known verified Monad testnet addresses: StakingRewards `0xe23B3825F950637256e8DE1BF39743E8f29D97F1`, WMON `0x97B3070F9Da6C002343862b35E68Bd8e22608943`, StableFaucet `0x50959dd2a4ef310f9aa2df9498cE9aC0aB956276`. The router `0x430c…6660` and TokenRegistry are not verified (see `docs/DOGFOOD.md`).
  - **Toolchain present on this machine:** Node 22, Foundry 1.7.1, `uv`/`uvx`, `cargo`, `gh` authenticated as the owner. `ETHERSCAN_API_KEY` is not set; Sourcify is the only ABI source unless it is.
  - Scratch belongs under the session scratchpad or `/tmp`, never in the repo; `*.tgz`, `release/*.tar.gz` and example build outputs are gitignored.

## Decisions

- Network access is limited to explicit, user-requested moments: `init --address` and `registry add-deployment` (Sourcify, then Etherscan with a key; for EIP-712 descriptors, read-only `eth_chainId`, `eth_getCode` and `eth_call` against the `--rpc-url` the user names, never a built-in endpoint), upstream `erc7730 lint` and `format` during export or add-deployment (via `uvx`, which installs the registry's pinned `erc7730` from GitHub on first use), and the one-time clone-and-build of the registry runners behind `--registry-runners` / `--runners` / `registry setup-runners`. Everything else stays offline. Record any new exception here.

- Calldata only for now. EIP-712 stays in the agent skill until the CLI path is solid.
- Portability findings remain warnings by default and hard failures only under `--strict-portability`. They are evidence-backed and should not be removed, but they must not block ordinary authoring. Exception (2026-09-23): export, and the calldata test `registry add-deployment` renders, require the registry runners when a *displayed* field hits `SIGNED_INTEGER_PORTABILITY` or `NESTED_ARRAY_PORTABILITY`, because there the expected values come from this tool's patched renderer and lowered descriptor and can differ from registry CI. `--skip-registry-runners "<reason>"` passes the gate and records the reason. Authoring (`check`, `preview`, `test`) is not gated. 11 of 280 merged registry descriptors (Ekubo signed ints, Feral File nested arrays) hit the gate at `8f56072`; all pass registry CI, so the gate asks for confirmation, not a failure.
- The tool records developer review; it never claims audit, attestation, wallet certification, or registry acceptance. Keep that language.
