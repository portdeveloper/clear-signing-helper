# First release candidate scope

Prepared 2026-09-08. This is the implemented candidate policy and recommended launch boundary, pending the owner's release approval. Broad wallet compatibility is not a release claim.

## Included

The product is a standalone, local CLI for Foundry repositories. It authors ERC-7730 v2 **calldata** descriptors, encodes fixtures, previews values, records developer review, detects changed expectations and exports submission drafts. It does not hold keys, send transactions, publish descriptors or attest deployments.

The initial production workflow requires both `check --strict-portability` and `export --strict-portability`, plus passing fixture tests. Scalar unsigned integers, addresses, booleans, strings/bytes, scalar tuples and native transaction value remain eligible for this workflow. Eligibility is not wallet certification; the named consumer and exact descriptor must still be checked. Morpho Blue's 23 Flex emulator cases and WETH's Flex/Stax deposit cases are the current device evidence.

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

The 31 suffix-bearing examples in the pinned registry corpus therefore remain deliberate failures. They do not block the Morpho candidate, whose 23 fixtures pass exact ABI re-encoding. Any pilot requiring those suffixes needs a separate supported implementation before release for that protocol.

For an incompatible function, remove its descriptor format and add a reason in the matching contract's `exclusions` table. Do not change the signature, flatten or drop arguments, suppress a finding, or accept an incorrect device result to get a release through. If the protocol's main user operation is excluded, that protocol is not a supported pilot.

## Distribution and trust

The initial supported environment is the Linux/Node 22 environment with executed evidence. Additional platform/version jobs are configured in CI; a configured job is not a successful platform test. See [distribution evidence](DISTRIBUTION.md) for executed versions and remaining runner requirements.

The owner selected the [MIT license](../LICENSE) for this project. The renderer and other bundled dependencies retain their own notices. No npm package or registry submission is published by the release scripts.

Device tests used Speculos with injected descriptors and test CAL signatures. Retail wallet delivery, production descriptor trust, protocol approval and physical device acceptance are separate external gates. See [the handoff](RELEASE-HANDOFF.md).
