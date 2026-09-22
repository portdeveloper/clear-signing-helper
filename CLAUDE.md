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

It never signs, sends, publishes, or verifies deployed bytecode beyond a Sourcify match. The agent skill under `.claude/skills/clear-signing-helper/` is a playbook over the CLI; only EIP-712 work still falls back to the upstream Python tool.

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
- `interpolatedIntent`: done 2026-09-19 after the registry bot recommended it on PR #3003. Validator accepts it and checks placeholders name shown fields; renderer output, expectations and `testsv2` carry the rendered sentence; ERC-20/WETH conventions include the registry's phrasings; the decisions template has the slot with prior phrasings as hints.
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

## Roadmap, phase 2

Phase 1 (items 1-6) shipped as 0.3.0-preview.1 on 2026-09-19. Phase 2 is ordered by what a Monad team actually needs first.

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
- Result: `src/runners.ts` clones and builds the Sourcify runner and `cs-test` at the registry CI's pinned revisions (built-in pins, or `--runner-pins <clone>` / `registry add-deployment --runners` reading `.github/actions/run-*-tests/action.yml`), caches them under `~/.cache/clear-signing-helper/runners/`, runs both on each `testsv2` file with the bundle's `registry/` as registry root, and passes only when every case is `pass` and the count matches the fixture. Failures fail the export and remove the bundle; results and logs go to `review/runners/`. `registry setup-runners` pre-builds. Tests use stub executables via `CLEAR_SIGNING_RUNNERS_DIR`. The Morpho 23-case reproduction was not rerun; the real runners were exercised on the ABI-mode WETH bundle, the puddleswap StakingRewards bundle, and the registry's Morpho Blue test file with an added chain (see live results in the commit).

### 10. Dogfood a real submission — `in progress` (PR #3003 open; registry CI green; the bot's interpolatedIntent recommendation addressed and withdrawn; maintainer review pending)

- Verify the puddleswap router on Sourcify (deployer side), import it with `init --address`, and take one contract through review, export and an actual registry PR opened by the owner. Record what still needed a human.
- Acceptance: a merged registry PR whose files came out of `export` unchanged, or a written list of what the maintainers asked to change.
- Progress (2026-09-19): StakingRewards, WMON and StableFaucet verified on Sourcify from the repo build; router and TokenRegistry source no longer match their deployments (router: pair init code hash constant; details in `docs/DOGFOOD.md`). StakingRewards taken from `init --address` to an exported bundle that passes format, lint, both schemas and both runners; staged as branch `puddleswap-staking-rewards` on the owner's fork and opened as [registry PR #3003](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3003) with the exported files unchanged. Export now runs `erc7730 format` so the registry's format bot leaves the PR alone. Human steps recorded in `docs/DOGFOOD.md`.

### Later

- EIP-712 descriptors (104 in the registry corpus): a separate decoding and review model. The Permit2 rebase (`docs/DOGFOOD.md`) shows the concrete need: `registry add-deployment` for `eip712-*.json`, proving the address by `DOMAIN_SEPARATOR()` instead of selectors.
- Physical-device acceptance and independent human review, still open from the 0.2.0 tracker.
- Persisting provenance into the review record so `review --accept` acknowledges sources explicitly.

## Acceptance metric: does the validator accept what the registry merged?

`npm run registry:acceptance -- <registry clone>` runs `validateDescriptor` over every merged calldata descriptor (includes resolved). 2026-09-22 at registry `9f37816`: **261 of 284 accepted**; the 23 rejections are the `calldata` format (32 fields across 22 files; nested-call resolution is out of scope) and one encrypted field. Before this pass the number was 11 of 284: the validator rejected `#.` root prefixes, `$id`, `$ref` definitions, constant-value fields, `visible: never/optional` and rule objects, byte slices, group-scoped parameter paths, token references to integer leaves, and treated type mismatches and a missing intent or owner as errors where the renderer only warns. All of those now follow the renderer's semantics. Re-run this after any validator change; a new rejection class is a regression against the registry.

## Roadmap, phase 3: the LLM's place in the pipeline

Principle, refined from phase 2: derive everything provable deterministically; let AI propose only what cannot be derived; verify everything verifiable against the registry's own tools; a human owns what cannot be verified. The model sits after the scaffold and fills only its judgment slots. It never generates the provable parts, and it never submits.

### 11. Decisions template and `apply` — `done` (2026-09-19)

The six human steps in `docs/DOGFOOD.md` are all judgment slots the scaffold leaves raw. Make them an explicit interface any agent, or a person, can fill without touching descriptor JSON.

- `clear-signing decisions --contract <id>` writes `clear-signing/decisions/<Name>.json`: per function, the slots that need judgment (intent, label per field, denomination for each amount with the candidate references the tool can offer such as `@.to`, `$.metadata.constants.*`, address arguments; hide-with-reason; exclude-with-reason), pre-filled with whatever evidence provided and its source.
- `clear-signing apply --decisions <file>` writes the descriptor and `clear-signing.toml` from it, validates, and records `source: llm` or `source: human` in `clear-signing/provenance.json` per decision (the file carries an `author` field).
- The LLM stays outside the CLI: no API keys or model calls in the tool. The skill instructs the agent to fill the decisions file.
- Acceptance: the PuddleSwap StakingRewards authoring in `docs/DOGFOOD.md` is reproducible from a decisions file alone; provenance distinguishes agent-authored intents from NatSpec ones.
- Result: `decisions --contract` writes `clear-signing/decisions/<Name>.json` with, per function, `decision`/`excludeReason`, `intent`, and per leaf `show`/`hideReason`/`label`/`format`/`params`, each carrying read-only `hints` (NatSpec, registry priors for the selector, candidate denominations, formats valid for the type, the 30-character intent limit). `apply --decisions` requires `author`, edits leaves in place to preserve grouping, drops hidden leaves and appends newly shown ones, refuses a hidden `@.value` or unsupported format, validates the whole descriptor before writing, then writes descriptor + `clear-signing.toml` + provenance tagged `human` or `llm`. The file round-trips. The skill now instructs agents to use it instead of editing JSON. Verified in tests on the example router, and live: the PuddleSwap StakingRewards descriptor in registry PR #3003 was reproduced exactly from `init --address` plus one decisions file (provenance: 12 human, 4 natspec, 1 registry prior).

### 12. Registry-corpus selector prior — `done` (2026-09-19)

If another registry descriptor already formats the same selector, that format is the strongest available hint and disagreement is worth a warning; no model needed.

- Index `test/fixtures/registry/corpus.json` (already pinned) by selector to the formats other entities use for it, plus the entity name.
- `init` pre-fills the decisions template with the prior and its source (`registry:<entity>/<file>`); `check` warns `CORPUS_DISAGREEMENT` when a format's field formats differ in kind (raw vs tokenAmount, hidden vs shown) from every prior for that selector.
- Keep the corpus snapshot date visible; add `registry:snapshot` refresh to the release checklist.
- Acceptance: an ERC-20 `approve` or a Uniswap V2 `swapExactTokensForTokens` draft shows the prior; a deliberately raw amount on a selector the corpus formats as `tokenAmount` warns.
- Result: `scripts/snapshot-priors.ts` writes `src/data/registry-priors.json` (includes and `$ref` definitions resolved, keyed by selector; 283 descriptors, 1450 formats, 550 selectors at registry `9f37816`, ~800 KB bundled). `src/priors.ts` aligns leaves by ABI position so differing parameter names still compare, classifies each leaf as hidden/raw/typed, and reports `CORPUS_DISAGREEMENT` only when every prior agrees and the draft differs. `init` lists priors under evidence as `[registry prior]`. Separate from `corpus.json`, which stays format-free for the compatibility tests. Release checklist gained a refresh step.

### 13. Advisory semantic verifier — `todo` (do last; treat as a hypothesis)

An LLM reading source and judging whether each intent and denomination matches is a plausibility opinion, the same thing a registry reviewer does. It may catch the obvious mismatch and will pass subtle ones.

- Output per format: `agree | disagree | unsure` with one sentence of reasoning, written to `review/semantic.json`; never a gate. `unsure` and `disagree` are listed for the human before `review --accept`.
- Measure before trusting: run it over the pinned corpus, whose intents are already accepted, and record the disagreement rate. If it flags accepted descriptors at a real rate, the pass is noise and is dropped.
- Same boundary as item 11: the CLI defines the prompt and the result schema; the agent runs the model.
- Acceptance: a disagreement rate on the corpus low enough that a flag is worth a human minute, documented with the model and date.

Not doing: "generate first with AI" (the model would regenerate the provable parts the scaffold gets right for free), auto-submitting PRs (ownership gate; maintainers check submitter ties to the owner), or an in-CLI model call.

## Working conventions

- Build and test: `npm ci`, `npm run build`, `npx tsx --test test/*.test.ts` (or `npm test`). Tests compile the Foundry projects under `examples/` and drive the built `dist/cli.js`. Anvil is required for `test/anvil.test.ts`.
- Reference validation target: `../puddleswap/contracts`. Run `forge build --force` there once so solc 0.5.16, 0.6.6, and 0.8.x are cached, then point the CLI at a copy with `--root`.
- Upstream tooling for comparison: `uvx erc7730 lint <file>` and `COLUMNS=10000 uvx erc7730 generate …`. Lint refuses files without a `calldata-` or `eip712-` prefix.
- Any change to `schemas/`, `vendor/clear-signing/`, or `ENGINE` in `src/descriptors.ts` changes the engine fingerprint and invalidates every user's review. Do it deliberately and bump the version.
- Do not weaken: canonical-calldata rejection, size and depth limits, path-escape checks, or the hash check in `scripts/verify-renderer.mjs`.
- Machine note: if forge reports `Exec format error` for solc, the `~/.local/share/svm` cache holds binaries for the wrong CPU architecture. Delete the affected version directories and let forge redownload.

## Decisions

- Network access is limited to explicit, user-requested moments: `init --address` and `registry add-deployment` (Sourcify, then Etherscan with a key), upstream `erc7730 lint` during export or add-deployment (via `uvx`), and the one-time clone-and-build of the registry runners behind `--registry-runners` / `--runners` / `registry setup-runners`. Everything else stays offline. Record any new exception here.

- Calldata only for now. EIP-712 stays in the agent skill until the CLI path is solid.
- Portability findings remain warnings by default and hard failures only under `--strict-portability`. They are evidence-backed and should not be removed, but they must not block ordinary authoring.
- The tool records developer review; it never claims audit, attestation, wallet certification, or registry acceptance. Keep that language.
