# Release handoff

Prepared 2026-09-08. Local implementation, automated hardening, source pilots, emulator checks and package verification are complete for the [candidate scope](RELEASE-SCOPE.md). Nothing has been published. The items below require the owner or an external party; they are not recorded as passed.

## What I need from the owner

| Owner action | Why it is needed | Material ready for review |
| --- | --- | --- |
| Approve the calldata-only launch scope | MIT is selected; signed/nested/tuple-array shapes and suffixes are deliberately outside the strict release workflow | [Scope](RELEASE-SCOPE.md), [release notes](../release/RELEASE-NOTES.md) |
| Nominate a protocol maintainer and a human correctness reviewer, or authorize outreach to named people | Only those reviewers can provide semantic/maintainer approval and human review | [Ready review packet and unsent outreach draft](EXTERNAL-REVIEW.md), [three source exercises](PILOT-VALIDATION.md) |
| Provide a Flex/Stax tester and a wallet integration contact able to deliver the reviewed descriptor under the intended trust path | Emulator injection used test trust. Physical review and retail descriptor delivery are not established by those results | [Hardware procedure, exact inputs and result form](HARDWARE-ACCEPTANCE.md) |
| Authorize publication after the preceding gates pass | npm/registry access and the owner's release decision are external actions | Candidate artifacts below; no automatic publishing in the scripts |

No testnet funds or private keys are needed for the remaining display/review gates. If a maintainer later requests transaction execution on a specific testnet, that is a separate test with an explicit deployment and fixture.

The owner supplied [portdeveloper/clear-signing-helper](https://github.com/portdeveloper/clear-signing-helper) and GitHub CLI access. Its existing agent skill is preserved in [PR #1](https://github.com/portdeveloper/clear-signing-helper/pull/1). All four remote Linux/macOS jobs passed tests and package verification; [execution evidence](GITHUB-CI.md) closes that access/platform gate.

## Candidate and evidence

Download remote candidates and verification records from the successful [Validate workflow runs](https://github.com/portdeveloper/clear-signing-helper/actions/workflows/ci.yml). The generated archive paths below are available in the local workspace after running the release scripts; binary candidates and generated hash manifests are not committed to Git.

- [Installable CLI tarball](../release/clear-signing-helper-0.2.0.tgz) and [SHA-256 sidecar](../release/clear-signing-helper-0.2.0.tgz.sha256).
- [Release verification](../release/release-verification.json): two independent clean installs/builds, package equality, fresh installed Foundry workflow, signed-int rendering, candidate upgrade/rollback and preserved consumer data.
- [Reviewable source/evidence archive](../release/clear-signing-helper-source.tar.gz) and [input hash manifest](../release/source-manifest.json).
- [Validation record](VALIDATION.md): 31 automated tests on Node 22 and 24, four screen-check tests, registry corpus and mined local transactions.
- [Device matrix](DEVICE-COMPATIBILITY.md): Morpho 23/23 Flex, WETH Flex/Stax, and retained failing controls.
- [Morpho live runtime check](evidence/morpho-submission/live-rpc-2026-09-08.json): two RPC endpoints agree with the compiled constructor-bound runtime at a recorded finalized block; independently repeated by Luna.

The version is unpublished `0.2.0`; identify this candidate by the package/source hashes. Older root-level tarballs are retained as rollback test inputs. Use the tarball under `release/` for this handoff. The npm package omits large raw evidence; the source archive retains it.

## After the owner supplies those inputs

The owner's MIT license choice, repository destination and remote matrix are complete. Collect reviewer/device result records, fix any new findings, and regenerate the candidate hashes. Review that concrete result before merging and publication. Owner choices and external findings can change release inputs; the current verification does not pre-approve a changed artifact.

The [tracker](PRODUCTION-READINESS.md) keeps the remaining external boxes open. Ordinary draft export remains available; a draft's existence does not bypass the launch gates.
