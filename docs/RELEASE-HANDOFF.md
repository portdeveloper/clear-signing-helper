# Developer preview release handoff

Updated 2026-09-09. The owner selected an experimental developer preview, `0.2.0-preview.1`, for generating, previewing and regression-testing ERC-7730 calldata descriptors in Foundry. The selected scope retains strict portability checks. External review and physical-wallet acceptance remain pending production-readiness work and do not block preview distribution.

Published on 2026-09-09: [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.2.0-preview.1). [PR #6](https://github.com/portdeveloper/clear-signing-helper/pull/6) is merged. The release tag points to tested source commit `78c963896a4be12180a554ce6c45d242be592cee`; subsequent documentation updates do not change that artifact.

All four [Linux/macOS Node 22/24 CI jobs](https://github.com/portdeveloper/clear-signing-helper/actions/runs/34345688789) passed and their downloaded packages match the local candidate. Published package SHA-256: `24025b0b1002b34b06b4589c6d52d14898e327a0121c561c84e3dcfd7fb11155`. The release assets include local, CI and post-publication verification records. A fresh install from the public download passed version verification and Foundry build → init → fixture → preview.

## Preview publication checklist

- [x] Select the [developer preview scope](RELEASE-SCOPE.md) and explicit prerelease version.
- [x] Include MIT/dependency notices, [release notes](../release/RELEASE-NOTES.md), and [installation and upgrade instructions](DISTRIBUTION.md).
- [x] Pass the automated suite, Solidity example tests and clean package verification on the final source revision.
- [x] Confirm the final revision's Linux/macOS CI and attach its run URL and verified package hash to the GitHub prerelease.
- [x] Publish a GitHub prerelease tagged `v0.2.0-preview.1`, attaching the verified tarball, checksum and verification record.
- [x] Download the published artifact, confirm its checksum, and verify a fresh installation.

- [x] Publish the identical verified package to [npm](https://www.npmjs.com/package/clear-signing-helper/v/0.2.0-preview.1) using `--tag preview`; verify anonymous download, SHA-256/SHA-512, fresh `@preview` installation, npx and the Foundry workflow. The GitHub release includes `npm-verification.json`.
- [ ] Remove the extra `latest` tag returned by the registry after the first publication. The authenticated `npm dist-tag rm clear-signing-helper latest` request was rejected with HTTP 403. Both tags currently point to `0.2.0-preview.1`; production validation remains pending regardless of tags.

The owner selected npm as an additional distribution channel on 2026-09-09. Use `@preview` or the exact version in installation instructions. The release scripts build and verify artifacts; they do not publish automatically.

## Artifacts

Run `npm run release:verify` to generate:

- `release/clear-signing-helper-0.2.0-preview.1.tgz`
- `release/clear-signing-helper-0.2.0-preview.1.tgz.sha256`
- `release/release-verification.json`

The verification record identifies the package by SHA-256 and records the actual host and checks. Its independent clean builds, fresh installed Foundry workflow and version check must pass for the preview. Previous candidate evidence is historical; it does not verify a changed package. The [Validate workflow](https://github.com/portdeveloper/clear-signing-helper/actions/workflows/ci.yml) uploads each job's package and verification record.

For a complete local source/evidence archive, run `node scripts/capture-release-inputs.mjs` after package verification. Historical emulator, pilot and Node 24 records retain their original dates and inputs. The npm tarball omits the large raw evidence; the repository retains it.

## Pending production validation

These items stay open after preview publication:

| Work | Tracking and prepared material |
| --- | --- |
| Physical Ledger Flex/Stax review and intended descriptor trust/delivery path | [Issue #2](https://github.com/portdeveloper/clear-signing-helper/issues/2), [hardware packet](HARDWARE-ACCEPTANCE.md) |
| Protocol-maintainer assessment of intent, units, recipients, permissions and usefulness | [Issue #3](https://github.com/portdeveloper/clear-signing-helper/issues/3), [source pilots](PILOT-VALIDATION.md) |
| Independent human correctness and security review | [Issue #4](https://github.com/portdeveloper/clear-signing-helper/issues/4), [review packet](EXTERNAL-REVIEW.md) |

The [production readiness tracker](PRODUCTION-READINESS.md) preserves the supporting evidence and missing results. Emulator tests used injected descriptors and test trust. Automated checks and agent reviews do not supply the missing human or physical-device results. Export creates submission drafts; no registry acceptance, protocol endorsement, deployed-code verification or retail wallet compatibility is claimed.

No testnet funds or private keys are needed for the display/review work described in these packets. CLI publication and protocol-specific registry submission are separate actions.
