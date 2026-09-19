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
