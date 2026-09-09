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
