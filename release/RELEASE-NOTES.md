# Unpublished 0.2.0 candidate — 2026-09-08

Clear Signing Helper is a standalone CLI for authoring ERC-7730 calldata descriptors inside Foundry repositories. It discovers compiled write functions, generates complete raw drafts, encodes fixtures, previews and snapshots signing output, tracks review freshness, and exports registry-shaped local bundles.

This candidate adds strict portability checks for known consumer incompatibilities and includes `portability.json` in exports. Its release scope excludes signed integers, nested arrays and multi-field tuple arrays from strict workflows; broad draft generation remains available. EIP-712 and calldata suffixes remain explicit unsupported cases.

Hardening makes payable native value mandatory, bounds input/decoded/output trees, rejects null metadata predictably, and escapes terminal/bidi controls in human previews. The signed-integer renderer correction is now maintained in a hash-verified vendor copy with license notices; installation no longer modifies dependencies.

Validation includes 31 tests on Linux ARM64 Node 22.22.3 and 24.20.0, four screen-check regressions, the full pinned registry corpus, Morpho live RPC runtime comparison, Morpho's 23 Flex emulator cases, and complete OpenZeppelin/Uniswap source pilots with strict exports. An actual OpenZeppelin ERC4626 deposit was mined and checked on disposable Anvil. Uniswap's 14 covered functions use raw synthetic calldata; the pool callback and receive entrypoint are excluded, and no swap execution is claimed.

Packaging was tested through independent clean builds, identical tarball output, script-disabled installation, a real installed Foundry workflow and upgrade/rollback between distinct local candidate builds. Consult `release-verification.json` for the exact artifact hash and checks. Both candidates are unpublished 0.2.0 builds, not a released-version migration claim.

The owner selected MIT; the license text and package metadata are included in the candidate. All four [remote platform CI jobs](../docs/GITHUB-CI.md) passed and produced identical packages. Still required: owner scope approval, protocol maintainer/human review, physical-device and intended descriptor-trust-path validation, and merge/publication authorization. See [the handoff](../docs/RELEASE-HANDOFF.md). The general CLI does not verify deployed code, discover proxies, sign transactions, attest or publish.

For upgrades, back up the repository's descriptor/config/review/expectation files and retain the previous tarball. Install the new pinned tarball with `--ignore-scripts`, run `clear-signing upgrade` if the engine changes, inspect source/previews, explicitly renew review and expectations, then run strict check and test. To roll back, reinstall the previous reviewed tarball and restore matching authoring files; run check/test before using it. Never treat automatic snapshot replacement as upgrade validation.
