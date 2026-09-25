# Clear Signing Helper 0.5.0-preview.1 — developer preview

Follows the registry CI's current linter, copies real transactions into test cases, names token constants from a verified address, tells you when the registry already describes your contract, and cuts the warnings a fresh draft shows to the ones that matter.

## Upgrade from 0.4.0-preview.1

No `upgrade` step: the engine fingerprint (renderer, schema, validator subset) is unchanged, so reviews and expectations stay valid. Install the new version and run `clear-signing check`. `export --ci-pins` is now `export --registry`, the same name the `registry` commands use; `--ci-pins` still works.

## What changed

**Lint matches registry CI again.** The built-in linter is the Sourcify fork of `erc7730` at `e823abc` with `--require-verified`, the pin registry master runs since #3038 (2026-09-24). With that pin, a reference ABI that cannot be fetched (rate limit, network error) is an error, not a warning. 0.4.0-preview.1 linted at `f2fafe1`, where the same failure was only a warning, so it could pass what registry CI fails. `--registry <clone>` reads the registry's pull-request workflow under its new name, `registry-checks.yml` (#3046), as well as the former `pull_request.yml`.

**Real transactions as test cases.** `fixture --tx <hash> --rpc-url <url>` copies a mined transaction exactly as sent. It refuses one that is pending, reverted, a contract creation, signed for another chain, sent to an address that is not a bound deployment of the contract (a call through a router, multicall or smart account), calling a function the contract does not have, or carrying noncanonical calldata; nothing is written on refusal. The fixture keeps the hash, and export writes it as the registry test case's `txHash`, so a reviewer can look it up. `--broadcast-tx` fixtures keep their hash too.

**Named constants from a verified address.** `init --address` turns address immutables with a public getter, such as a staking contract's `stakingToken`, into `metadata.constants`. The decisions file then offers `$.metadata.constants.stakingToken` as a denomination. Sourcify's record has each immutable's value but no names. The tool names them from the verified source map, and leaves out any it cannot name with certainty. No extra request is made. Provenance tags these `verified source`, and constants from source literals are now tagged `ast` rather than `broadcast`.

**"Already in the registry?"** `init` compares the contract's functions with every registry calldata descriptor in the bundled snapshot. It lists a match when at least two functions are shared, and either every function the file describes exists in the contract (what `registry add-deployment` requires) or the file covers at least half of the contract's functions. Functions three or more registry projects describe (ERC-20, ERC-4626, ERC-721, Ownable, `multicall`) are left out of the comparison. A match is a suggestion: the same protocol on a new chain calls for `registry add-deployment`, while a fork's match belongs to another owner, so you author your own descriptor. Nothing is bound or skipped on it.

**Fewer, clearer warnings.** On PuddleSwap, a fresh draft of seven contracts went from 9 warnings to 0.
- An argument a displayed field reads through `tokenPath`, `token`, `collectionPath` or `chainIdPath` counts as displayed, as it does in the registry linter. This removed 212 of 496 undisplayed-argument warnings across the registry corpus.
- A registry-prior disagreement needs agreement from at least two projects.
- ERC-20 convention intents fit 30 characters.
- Each warning code has its own remedy, in human output and `--json`.
- `check` groups warnings by descriptor and code.

**Registry snapshot** refreshed at registry `53d86dc` (285 descriptors, 1432 formats, 533 selectors). The validator accepts 263 of the 285 merged calldata descriptors; the rest use nested calldata or an encrypted field, as before.

## Network access

Only at explicit moments:
- `init --address` (Sourcify, then Etherscan with a key);
- `registry add-deployment` (the same, plus read-only `eth_chainId`, `eth_getCode` and `eth_call` for EIP-712);
- new: `fixture --tx`, read-only `eth_chainId`, `eth_getTransactionByHash` and `eth_getTransactionReceipt`;
- upstream `erc7730 lint` and `format` through `uvx`;
- the one-time clone and build of the registry runners.

Every RPC call goes to the `--rpc-url` you name. Everything else is offline.

## Scope and limitations

Unchanged from 0.4.0-preview.1:
- Authoring new EIP-712 descriptors, the `calldata` format and encrypted fields are unsupported and fail explicitly.
- `fixture --tx` does not discover transactions. You supply the hashes; an explorer lists them.
- Named immutables need a Sourcify match. An Etherscan-only import has no constants.
- A registry match cannot tell a fork from the original protocol.
- Generated content requires developer review. The CLI never claims audit, attestation, wallet certification or registry acceptance, and it does not hold keys, send transactions or publish.

## Install

Requires Node.js 22+ and, for Foundry mode, Foundry. From the release assets:

```sh
sha256sum --check clear-signing-helper-0.5.0-preview.1.tgz.sha256
npm install --global --ignore-scripts ./clear-signing-helper-0.5.0-preview.1.tgz
clear-signing --version
```

On macOS, use `shasum -a 256 --check`. Expected version: `0.5.0-preview.1`. Upstream lint and format need `uv` (`uvx`) on the PATH; the registry runners need `git`, `npm` and `cargo`.

## Validation

- **Automated:** 69 tests. New ones cover `fixture --tx` against a mocked JSON-RPC (every refusal, and `txHash` in the exported test), named immutables from a trimmed real Sourcify record, registry matching, grouped warnings, and the renamed registry workflow.
- **Live `fixture --tx`:** the recorded `notifyRewardAmount` on Monad testnet (block 52286214) was copied byte for byte through `testnet-rpc.monad.xyz`, and a transfer to another contract was refused.
- **Live `init --address`:** it named StakingRewards' `stakingToken` and `rewardsToken`, and SwapRouter02's `factory` and `WETH9`; it found `uniswap/calldata-UniswapV3Router02.json` for SwapRouter02.
- **Lint pin:** `e823abc` and the old pin gave identical findings on registry PRs #3003 and #2611.
- Physical-device and human review results from 0.2.0-preview.1 were not repeated for this version.

---

# Clear Signing Helper 0.4.0-preview.1 — developer preview

Adds a chain to a protocol that is already in the ERC-7730 registry with one command, puts the judgment calls in a file a person or an agent fills, and checks exports with the registry CI's own linter and test runners. Works inside a Foundry project or from a verified contract address.

## Upgrade from 0.3.0-preview.1

The engine fingerprint no longer includes the tool version, so this release changes it once. Every existing project runs:

```sh
clear-signing upgrade
clear-signing check
# inspect previews, then renew review and expectations deliberately
clear-signing review --accept
clear-signing test --update
```

Descriptors and fixtures are preserved; expectations change only in their `engine` block. From here on, a release that keeps the renderer, schema and validator subset does not force this step. `export --runner-pins` is now `--ci-pins`.

## What changed

**Add a chain to an existing registry descriptor.** `clear-signing registry add-deployment --registry <clone> --descriptor <path> --chain-id <id> --address <addr>` edits a registry clone in place. A calldata address is proven by requiring every selector the descriptor formats to exist in its Sourcify-verified ABI (a verified proxy is followed to its implementation). An EIP-712 address is proven over a read-only `--rpc-url` by matching its live `DOMAIN_SEPARATOR()` against the domains the descriptor and its tests record; `includes` are followed to the shared deployments file. A test case for the new chain is rendered through the pinned renderer, not copied, and the diff is positional (chain-id order, the file's own formatting). Lint runs on every affected descriptor; a lint error or a failed registry runner restores every edited file. It never commits or opens a pull request and prints the `git`/`gh` commands instead. It reproduced registry PR #2611 (Permit2 on Monad) byte for byte.

**Decisions file.** `decisions --contract <id>` writes the judgment slots (intent, interpolated intent, per-field show/hide with reason, label, format, token denomination, exclude with reason) with read-only hints: NatSpec, registry priors for the same selector, candidate denominations, formats valid for the type. `apply --decisions <file>` validates the whole descriptor before writing and records `human` or `llm` in `clear-signing/provenance.json`. `$ref` definitions and descriptor-level `visible: "never"` round-trip unchanged.

**Registry priors.** What other registry descriptors do with the same selector (snapshot of registry `8f56072`, 280 descriptors, 533 selectors) appears in `init` evidence and decisions hints. `check` warns `CORPUS_DISAGREEMENT` only when every prior agrees and the draft differs.

**`interpolatedIntent`.** Validated (placeholders must name displayed fields), rendered, and carried into expectations and `testsv2`; ERC-20 and WETH conventions include the registry's phrasings.

**Registry CI parity on export.** Export formats with the registry's `erc7730 format` and lints with the registry CI's own package: the Sourcify fork of `erc7730` from the registry's `.github/requirements.txt`, with `--require-verified`, so every calldata deployment must be verified on Sourcify. `--ci-pins <registry-clone>` reads the package, lint flags and runner revisions from a clone. `--registry-runners` builds and runs the registry's Sourcify and Rust test runners on the bundle; any failed case removes the bundle. The runners are required when a displayed field is a signed integer or a nested array, where this tool's renderer and the registry's can differ; `--skip-registry-runners "<reason>"` records why they were not run.

**Validation follows the renderer.** `#.` roots, `$id`, `$ref` definitions, constant-value fields, `visible` rules, byte slices, group-scoped parameter paths and token references to integer leaves are accepted; type mismatches, a missing intent or owner are warnings, as they are in the renderer. One field resolver serves validation, decisions, apply and priors. The validator accepts 258 of the 280 calldata descriptors merged in the registry at `8f56072`; the rest use nested calldata or an encrypted field.

**Agent skill.** `.claude/skills/clear-signing-helper/` drives the CLI end to end: registry search first, `registry add-deployment` when the protocol is listed, otherwise `init`, the decisions file, fixtures, tests and export, with an ownership gate before any pull request.

## Network access

Only at explicit moments: `init --address` and `registry add-deployment` (Sourcify, then Etherscan with a key; for EIP-712, read-only `eth_chainId`, `eth_getCode` and `eth_call` against the `--rpc-url` you name), upstream `erc7730 lint` and `format` through `uvx` (which installs the registry's pinned package from GitHub on first use), and the one-time clone and build of the registry runners. Everything else is offline.

## Scope and limitations

Authoring new EIP-712 descriptors, the `calldata` format (nested call resolution) and encrypted fields remain unsupported and fail explicitly. `--strict-portability` still rejects signed integers, nested arrays and multi-field tuple arrays because of recorded consumer incompatibilities. A matching EIP-712 domain proves the contract signs under that domain, not that its bytecode matches other deployments. Generated intents, units, token relationships and hidden-argument decisions require developer review; the CLI records that review and never claims audit, attestation, wallet certification or registry acceptance. It does not hold keys, send transactions or publish.

## Install

Requires Node.js 22+ and, for Foundry mode, Foundry. From the release assets:

```sh
sha256sum --check clear-signing-helper-0.4.0-preview.1.tgz.sha256
npm install --global --ignore-scripts ./clear-signing-helper-0.4.0-preview.1.tgz
clear-signing --version
```

On macOS, use `shasum -a 256 --check`. Expected version: `0.4.0-preview.1`. Upstream lint and format need `uv` (`uvx`) on the PATH; the registry runners need `git`, `npm` and `cargo`.

## Validation

55 automated tests across authoring, rendering, adversarial input, the pinned registry corpus, ABI mode and registry edits against mocked Sourcify and JSON-RPC, runner result handling with stub runners, and a mined Anvil deposit. Live: PuddleSwap StakingRewards (Monad testnet) went from `init --address` to an exported bundle that passed format, lint, both schemas and both registry runners and is open unchanged as registry PR #3003; the #2611 Permit2-on-Monad edit was reproduced byte for byte by `registry add-deployment` against `rpc.monad.xyz`, with both runners 6/6; the registry lint pin was exercised against registry `8f56072` with verified and unverified deployments. Physical-device and human review results from 0.2.0-preview.1 were not repeated for this version.

---

# Clear Signing Helper 0.3.0-preview.1 — developer preview

Generate ERC-7730 calldata descriptors from what your repository already proves, accept every descriptor the registry accepts, and export a bundle laid out for a registry pull request and checked by the registry's own linter. Works inside a Foundry project or from a verified contract address.

## Upgrade from 0.2.0-preview.1

The engine subset changed (validation semantics), so every existing project must run:

```sh
clear-signing upgrade
clear-signing check
# inspect previews, then renew review and expectations deliberately
clear-signing review --accept
clear-signing test --update
```

Descriptors, fixtures and expectations are preserved. Expect new `UNDISPLAYED_ARGUMENT` and `INTENT_LENGTH` warnings from `check`; neither blocks. Existing raw `@.value` fields keep working; new drafts use `amount`.

## What changed

**Validation matches the registry.** `check` accepts every format the pinned renderer implements (`raw`, `amount`, `tokenAmount`, `addressName` with `types`/`sources`/`senderAddress`, `nftName`, `date`, `duration`, `unit`, `enum`, `tokenTicker`, `chainId`) with parameters validated by the schema. `tokenPath` may index arrays (`path.[0]`, `path.[-1]`) and reference `$.metadata.constants`. Leaving an argument out is a warning; a reason under the selection's `hidden` table in `clear-signing.toml` records the decision. Payable functions must still display `@.value`. `check` warns when an intent exceeds the registry linter's 30-character limit.

**Drafts use evidence, and say where it came from.** NatSpec `@notice` and `@param` become intents and labels when they fit the device. Solidity enums become `enum` formats with `metadata.enums`. An `immutable` address set from a constructor argument recorded in a broadcast becomes `metadata.constants.<name>`. ERC-20 and WETH-shaped contracts receive the registry's conventional formats, marked as conventions. `init` prints every value it took and its source, and `clear-signing/provenance.json` keeps that record.

**Deployment records are used.** `forge script --broadcast` creations bind `deployments`; deployed dependencies outside the default selection are suggested with their addresses; recorded transactions become fixtures with `fixture --broadcast-tx <hash>`. Default selection skips entry-point-free stubs and test/script directories.

**Per-contract scope.** `check`, `test` and `export` take `--contract` (repeatable), so one contract can ship while others are drafts.

**Registry-ready export.** The bundle is `registry/<entity>/calldata-<Name>.json` plus `testsv2/`, with the registry's relative `$schema` and `<fixture> - chain <id>` test names; `review/` holds fixtures, renderings, validation, portability and provenance. `--entity` names the registry folder; `--inline-abi` is opt-in. Export runs `erc7730 lint` (pinned to the registry CI version, via `uvx`); errors fail the export, warnings are recorded, `--no-lint` skips, and a missing `uvx` prints the command.

**ABI mode.** `init --abi <file>` or `init --address <addr> --chain-id <id>` works without Foundry. Addresses are resolved through Sourcify (verified proxies follow to their implementation and bind the proxy address; NatSpec is kept) with an Etherscan V2 fallback behind `ETHERSCAN_API_KEY`. ABIs and a provenance sidecar are stored under `clear-signing/abi/`.

**Fixtures.** `chain` (native currency), `ensNames`, `nftCollectionNames` and `blockTimestamps` are accepted and exported into the registry test data provider. Well-known chains, including Monad, have a built-in native-currency table. `UNKNOWN_ADDRESS` is informational.

**Polish.** A missing compiler under the offline build names the version and the one `forge build` that fixes it. Terminal preview no longer prints `Item` headers or repeated labels. Multi-line errors keep their line breaks.

## Network access

Two explicit moments only: `init --address` (Sourcify, then Etherscan with a key) and the upstream lint run during export. Everything else is offline.

## Scope and limitations

EIP-712, nested calldata decoding (`calldata` format), includes, display definitions, constant-value fields, encryption and factory bindings remain unsupported and fail explicitly. Strict portability still rejects signed integers, nested arrays and multi-field tuple arrays because of recorded consumer incompatibilities. The registry's Sourcify and Rust test runners are not executed by export. Generated intents, units, token relationships and hidden-argument decisions require developer review; the CLI records that review and never claims audit, attestation, wallet certification or registry acceptance. It does not hold keys, send transactions, verify deployed bytecode beyond a Sourcify match, or publish.

## Install

Requires Node.js 22+ and, for Foundry mode, Foundry. From the release assets:

```sh
sha256sum --check clear-signing-helper-0.3.0-preview.1.tgz.sha256
npm install --global --ignore-scripts ./clear-signing-helper-0.3.0-preview.1.tgz
clear-signing --version
```

On macOS, use `shasum -a 256 --check`. Expected version: `0.3.0-preview.1`. Upstream lint additionally needs `uv` (`uvx`) on the PATH.

## Validation

39 automated tests across authoring, rendering, adversarial input, the pinned registry corpus (278 descriptors, 605 transactions), ABI mode with a mocked Sourcify, and a mined Anvil deposit. Exercised against a real Uniswap V2 fork on Monad testnet: stubs skipped, deployments bound from broadcasts, NatSpec intents, enum members, constructor constants, a recorded transaction as fixture, and a single-contract bundle that passed `erc7730 lint` and both upstream schemas inside a fresh registry clone. WETH and the USDC proxy imported live from Sourcify. Physical-device and human review results from 0.2.0-preview.1 were not repeated for this version.

---

# Clear Signing Helper 0.2.0-preview.1 — developer preview

Generate, preview, and regression-test ERC-7730 calldata descriptors alongside a Foundry project. This experimental CLI discovers compiled write functions, scaffolds editable JSON drafts, encodes sample calls, previews signing fields, tracks developer review, and checks rendering expectations in CI.

## Scope and limitations

Use `clear-signing check --strict-portability`, `clear-signing test`, and `clear-signing export --strict-portability --out <directory>` for the documented preview workflow. Strict mode rejects signed integers, nested arrays and multi-field tuple arrays because of recorded consumer incompatibilities. EIP-712 and calldata suffixes remain unsupported. Ordinary draft authoring retains portability findings.

Generated descriptors require developer review of labels, intent, units, token relationships, recipients and permissions. Independent human review, protocol-maintainer assessment, physical Ledger testing and retail descriptor delivery remain pending. Emulator evidence used test trust. This preview does not claim production wallet compatibility or protocol approval.

The CLI does not hold keys, send transactions, verify deployed code, discover proxies, attest deployments or publish descriptors. Export writes a local submission draft. Registry review and wallet distribution are separate steps.

## Install

Download `clear-signing-helper-0.2.0-preview.1.tgz` and its `.sha256` sidecar from this prerelease. Requires Node.js 22+ and Foundry. In the download directory:

```sh
sha256sum --check clear-signing-helper-0.2.0-preview.1.tgz.sha256
npm install --global --ignore-scripts ./clear-signing-helper-0.2.0-preview.1.tgz
clear-signing --version
```

On macOS, use `shasum -a 256 --check` for the checksum command. Expected version: `0.2.0-preview.1`. Follow the [Foundry quickstart](https://github.com/portdeveloper/clear-signing-helper#add-clear-signing-to-your-foundry-repository).

## Validation

The release includes a package checksum and `release-verification.json` recording independent clean builds, identical package output, installation with lifecycle scripts disabled, an installed CLI version check and a real Foundry fixture/preview workflow. Consult the attached record and release CI link for the exact preview artifact and platform results.

Historical evidence from the preceding candidate includes 31 automated tests across Linux/macOS and Node 22/24, four screen-check regressions, registry corpus comparisons, Morpho's 23 Flex emulator cases, and OpenZeppelin/Uniswap source exercises. Those records retain their original versions and hashes; they are not physical-device or human review results. See the [evidence index](https://github.com/portdeveloper/clear-signing-helper/blob/main/docs/PRODUCTION-READINESS.md).

MIT licensed, with retained third-party notices and hash-verified renderer provenance.

## Upgrading from an unpublished candidate

Back up descriptor/config/review/expectation files and retain the previous tarball. Install this preview, run `clear-signing upgrade`, inspect source and rendered fields, then explicitly run `clear-signing review --accept` and `clear-signing test --update`. The preview version changes the engine fingerprint and invalidates earlier review; descriptors are preserved. Run strict check and test before exporting.

To roll back, reinstall the previous reviewed tarball and restore its matching authoring files, then run check/test. Do not put review acceptance or expectation updates in CI.
