# Maintainer and human review packet

Independent human and maintainer review remain pending. These reviews inform production readiness and future fixes; they do not block distribution of the developer preview. Review requests are tracked in repository issues #3 and #4; the targeted outreach draft below has not been sent.

## Protocol maintainer exercise

Use the [source pilot record](PILOT-VALIDATION.md), [Morpho submission draft](PRODUCTION-SUBMISSION.md) and [candidate scope](RELEASE-SCOPE.md). The authoring and export steps have automated/internal evidence; maintainers have not assessed whether the drafts are useful or semantically correct.

For each candidate repository, record:

| Question | Maintainer response required |
| --- | --- |
| Does the function intent describe the actual operation? | Corrected intent or approval, with source reference |
| Are recipient/spender/beneficiary, permissions, limits and assets visible? | Missing or misleading field findings |
| Are units and token relationships correct? | Explicit decimals/token binding; no inference from parameter names alone |
| Is an opaque bytes field sufficient for this action? | Accept raw disclosure or mark that operation unsupported |
| Is the deployment/proxy mapping correct? | Chain, user-facing address, implementation and verification evidence |
| Do exclusions remove an important user action? | Accept or reject the pilot scope |
| Does this save authoring/review time? | Time to first useful preview, confusing steps, suggested changes |

Suggested outreach draft (not sent):

> We have a standalone Foundry CLI that generates ERC-7730 calldata drafts and regression fixtures. We exercised your public source locally; this is not an official submission. Could a maintainer review the attached function intents, units, recipient/permission fields and exclusions, then try the documented authoring flow? We are seeking corrections and an assessment of usefulness for the developer preview. Local checks and emulator results do not establish semantic approval or deployment identity.

## Focused human correctness review

Review the exact candidate source/package hashes recorded at handoff and report findings with reproductions and severity. Prioritize these boundaries:

| Area | Source | Review questions |
| --- | --- | --- |
| ABI decoding and renderer | `src/fixtures.ts`, `src/expansion.ts`, `vendor/clear-signing` | Do accepted bytes round-trip? Are signs, dimensions, indices and every leaf preserved? Can a resource limit be bypassed? |
| Field visibility | `src/descriptors.ts` | Can a parameter or native value be omitted, mislabeled or given a misleading formatter? Which judgments require protocol knowledge? |
| Review and export | `src/app.ts`, `src/registry.ts` | Can stale review, local bindings, missing fixtures or mismatched expectations reach a submission? Are failed writes cleaned up? |
| Files and builds | `src/io.ts`, `src/foundry.ts` | Do paths, symlinks, external dependencies, subprocess arguments and fingerprints respect the stated trust boundary? |
| Presentation | `src/output.ts`, `src/preview.ts` | Can metadata alter markup, terminal state or apparent field order? Are raw values available for inspection? |
| Release input | `scripts/verify-release.mjs`, `scripts/verify-renderer.mjs`, lockfile and notices | Does the installed tarball match the tested source and maintained renderer? |

The CLI executes the installed Forge against repository configuration. It is intended for repositories the developer has chosen to build. It is not a sandbox for hostile compiler toolchains or concurrent local filesystem attackers. Fixture token/name metadata and human intent labels are assertions to review, not independently verified facts.

Use [automated adversarial evidence](ADVERSARIAL-REVIEW.md) and the [device failure matrix](DEVICE-COMPATIBILITY.md) as starting reproductions. Luna reviews are supporting evidence and do not fill in the human sign-off below.

```text
Reviewer / date / exact source or artifact hash:
Scope inspected:
Findings (severity, reproduction, expected and actual behavior):
Fix verification:
Residual risks and exclusions:
Approval or rejection for the stated release scope:
```
