# Developer preview release handoff

Updated 2026-09-09. The owner selected an experimental developer preview, `0.2.0-preview.1`, for generating, previewing and regression-testing ERC-7730 calldata descriptors in Foundry. The selected scope retains strict portability checks. External review and physical-wallet acceptance remain pending production-readiness work and do not block preview distribution.

## Preview publication checklist

- [x] Select the [developer preview scope](RELEASE-SCOPE.md) and explicit prerelease version.
- [x] Include MIT/dependency notices, [release notes](../release/RELEASE-NOTES.md), and [installation and upgrade instructions](DISTRIBUTION.md).
- [ ] Pass the automated suite, Solidity example tests and clean package verification on the final source revision.
- [ ] Confirm the final revision's Linux/macOS CI and attach its run URL and verified package hash to the GitHub prerelease.
- [ ] Publish a GitHub prerelease tagged `v0.2.0-preview.1`, attaching the verified tarball, checksum and verification record.
- [ ] Download the published artifact, confirm its checksum, and verify a fresh installation.

The GitHub prerelease is the default distribution plan. npm distribution, if selected, must use the explicit version and the `preview` dist-tag rather than `latest`. The release scripts build and verify artifacts; they do not publish automatically.

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
