# Developer preview scope

Updated 2026-09-09. The owner selected a developer preview release: `0.2.0-preview.1`. Its promise is to generate, preview, and regression-test ERC-7730 calldata descriptors in Foundry. Independent human review, maintainer assessment, physical-device testing and retail wallet delivery remain pending. They are production-readiness work, not prerequisites for distributing this experimental CLI.

## Included

The product is a standalone, local CLI for Foundry repositories. It authors ERC-7730 v2 **calldata** descriptors, encodes fixtures, previews values, records developer review, detects changed expectations and exports submission drafts. It does not hold keys, send transactions, publish descriptors or attest deployments.

The documented preview workflow requires both `check --strict-portability` and `export --strict-portability`, plus passing fixture tests. Scalar unsigned integers, addresses, booleans, strings/bytes, scalar tuples and native transaction value remain eligible for this workflow. Eligibility is not wallet certification; the named consumer and exact descriptor must still be checked. Morpho Blue's 23 Flex emulator cases and WETH's Flex/Stax deposit cases are the current device evidence.

Payable formats must show `@.value`, including when a sample value is zero. All ABI argument leaves must be displayed. Raw values are the default; a maintainer must decide the correct intent, units, recipients, permissions and token relationships.

## Deliberately excluded

| Feature | Candidate behavior | Reason |
| --- | --- | --- |
| Signed integers, nested arrays, multi-field tuple arrays | Strict check/export reject; ordinary draft authoring still works with findings | Reproduced upstream value/order incompatibilities |
| EIP-712 | Explicitly unsupported | Separate decoding and review model, outside the implemented product |
| Calldata with an ABI suffix | Reject the entire fixture; never strip bytes | The suffix may change protocol semantics |
| Opaque `bytes` arguments | Display raw bytes only | No claim to explain inner calls or transaction effects |
| Receive/fallback functions | Require explicit reasoned exclusions | No supported function-selector rendering path |
| Dynamic includes, conditional visibility, factory/proxy discovery | Explicitly unsupported | Outside the checked local subset |

The 31 suffix-bearing examples in the pinned registry corpus therefore remain deliberate failures. The recorded Morpho candidate has 23 fixtures that pass exact ABI re-encoding. Any protocol requiring those suffixes remains outside the supported preview workflow.

For an incompatible function, remove its descriptor format and add a reason in the matching contract's `exclusions` table. Do not change the signature, flatten or drop arguments, suppress a finding, or accept an incorrect device result to get a release through. If the protocol's main user operation is excluded, that protocol is not a supported pilot.

## Distribution and trust

The preceding candidate's tested environments are Linux ARM64 locally, plus Ubuntu 24.04 x64 and macOS 15 ARM64 in GitHub CI, on Node 22.22.3 and 24.20.0. All four remote jobs passed the 31-test suite and package verification. See [executed CI evidence](GITHUB-CI.md). Intel macOS and Windows are not verified.

The owner selected the [MIT license](../LICENSE) for this project. The renderer and other bundled dependencies retain their own notices. No npm package or registry submission is published by the release scripts.

Device tests used Speculos with injected descriptors and test CAL signatures. Retail wallet delivery, production descriptor trust, protocol approval and physical device acceptance remain unverified. These are gates for the corresponding production claims, not for preview distribution. See [the handoff](RELEASE-HANDOFF.md).

## Preview release requirements

- Use the explicit prerelease version `0.2.0-preview.1` and mark the GitHub release as a prerelease.
- Pass the automated suite, Solidity example tests, and clean package verification for the release revision; link its CI and package checksums.
- Retain strict portability checks, complete argument/native-value visibility, fresh developer review, and passing fixture expectations before strict export.
- Include MIT and dependency notices, installation and upgrade instructions, and the pending validation boundaries above.
- Publish the verified CLI artifact through the selected distribution channel. Registry submissions and protocol endorsements are separate actions.

Known failing wallet cases remain failures. No pending human or device result is recorded as passed to enable the preview. If a new correctness defect is found within the supported workflow, resolve it or narrow that workflow before release.
