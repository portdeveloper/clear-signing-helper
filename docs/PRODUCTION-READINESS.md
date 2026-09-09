# Production readiness tracker

Updated: 2026-09-09. The owner selected a developer preview release. This tracker records the work required for production-readiness claims; its external review and hardware items do not block distributing the experimental CLI. Preview publication requirements are in the [release handoff](RELEASE-HANDOFF.md). Unverified production claims remain out of scope.

Use this file to track release gates. Check a box only when its evidence is linked below; keep external review and device validation separate from local test results.

| Priority | Workstream | Status | Completion evidence |
| --- | --- | --- | --- |
| 1 | Complete submission path | Local path complete; physical/production trust acceptance external | [Device matrix](DEVICE-COMPATIBILITY.md), [hardware handoff](HARDWARE-ACCEPTANCE.md) |
| 2 | Protocol maintainer pilots | Three real-source exercises complete; maintainer assessment external | [Pilot evidence and limitations](PILOT-VALIDATION.md) |
| 3 | Rendering correctness and review | Automated hardening complete; human review external | [Adversarial record](ADVERSARIAL-REVIEW.md), [review packet](EXTERNAL-REVIEW.md) |
| 4 | Distribution and releases | Developer preview selected; final revision verification and publication tracked in handoff | [Distribution](DISTRIBUTION.md), [executed CI](GITHUB-CI.md) |
| 5 | First-release scope | Owner selected calldata-only developer preview with strict portability | [Calldata-only scope and exclusions](RELEASE-SCOPE.md) |

## 1. Complete submission path

- [x] Pin a real protocol repository and build its actual contracts with Foundry — Morpho Blue, 71 compiled files.
- [x] Generate a descriptor from its compiled ABI, retaining all write functions — 17 of 17; no exclusions.
- [x] Bind it to a known deployment and compare with available evidence — full function ABI and executable runtime match Sourcify's verified data; two live RPC endpoints agree with the compiled, constructor-bound runtime at finalized block 25,931,171. Luna independently repeated the check.
- [x] Add representative real transaction fixtures plus coverage for every exported function — six registry examples and 17 explicitly synthetic cases.
- [x] Inspect previews, accept internal review/expectations, and export a local submission bundle.
- [x] Run the pinned registry's actual schema, lint/recommended-field and transaction-runner checks — pass, with 17 optional intent recommendations and nonfatal Rust scanning warnings recorded.
- [x] Compare exported output with an independent renderer used by the registry — Rust 23/23; unpatched Sourcify 23/23; independent Luna rerun 23/23.
- [x] Render in a named target wallet or its emulator and inspect the actual signing screens — Morpho supply with tuple fields on Ledger Flex / Ethereum 1.22.3 / Speculos; all nine exported label/value pairs found, clear signing, no fallback or blind signing.
- [x] Extend device validation beyond supply — all 23 Morpho fixtures pass on Flex; representative arrays/native value also tested on Flex and Stax. Context lookup errors explained; [full results](DEVICE-COMPATIBILITY.md).
- [x] Deliberately exclude the observed tuple-array ordering and signed-field incompatibilities from the [candidate release policy](RELEASE-SCOPE.md). Strict portability mode rejects those shapes before export; broad authoring remains a draft capability.
- [ ] Obtain physical-device and production descriptor trust acceptance — [ready inputs and pass/fail record](HARDWARE-ACCEPTANCE.md); requires device/integration access.
- [x] Record remaining maintainer review, attestation and publication steps without presenting local checks as registry acceptance — all remain pending; see the exercise report.

Initial candidate: Morpho Blue, because an existing registry descriptor and transaction examples can be compared with its public Foundry source. The generated descriptor is an internal compatibility draft, not an official Morpho submission. No upstream PR, message or publication is authorized by this tracker.

Found and fixed during the exercise: the two-minute Forge build timeout was too short for this repository's 248.83-second initial compilation. Builds now allow ten minutes and report a specific timeout error. [Evidence](PRODUCTION-SUBMISSION.md#source-and-deployment-evidence).

## 2. Protocol maintainer pilots

- [x] Select three real-source exercises: Morpho Blue, OpenZeppelin ERC4626Mock, and Uniswap SwapRouter. Morpho/OpenZeppelin have native Foundry configurations; Uniswap uses a recorded Foundry adapter.
- [x] Exercise packaged install → init → edit → fixture → preview → check/test → strict export from clean source checkouts. OpenZeppelin has nine covered write functions; Uniswap has 14, with explicit receive/pool-callback exclusions.
- [x] Capture measured automated preview timings and concrete onboarding failures. These are not human onboarding timings.
- [ ] Have maintainers assess intent, units, recipient/permission fields and whether drafts save work.
- [x] Fix local pilot setup blockers and retain reproduction cases. The local ERC4626 deployment also mined a deposit and verified 1,000,000 assets and shares. Maintainer outreach is prepared but unsent.

## 3. Rendering correctness and review

- [x] Run deterministic adversarial/property cases for malformed calldata, nested arrays, signed/unsigned boundaries and resource limits — 576 integer mutations and 131 nested-array cases, alongside the existing registry corpus.
- [x] Compare field values and ordering against independent implementations for the recorded Morpho and representative registry cases; known differences remain failures rather than accepted snapshots.
- [x] Cover incorrect deployment binding, omitted fields/native value, hostile display controls and unsupported features. Protocol-specific semantic truth still requires the human review below.
- [ ] Obtain focused human review of decoding, visibility, export and file/process boundaries.
- [x] Resolve local automated findings: payable native-value visibility, input/output bounds, null metadata handling and safe terminal/HTML presentation. Luna independently reran 31 passing tests. Any new findings affecting the supported preview workflow must be resolved or the scope narrowed before its next release; independent human review remains pending.

## 4. Distribution and releases

- [x] Replace the temporary dependency patch with a hash-verified, explicitly maintained vendored renderer; preserve its MIT notice and bundled dependency notices.
- [x] Test Linux ARM64 on Node 22.22.3 and 24.20.0; exercise clean package installation, independent build/package equality and upgrade/rollback between distinct local candidates.
- [x] Execute all four configured macOS/Linux GitHub jobs — Node 22/24 on Ubuntu x64 and macOS ARM64 passed tests and package verification. Downloaded tarballs match each other and the local build; [run evidence](GITHUB-CI.md).
- [x] Owner selected MIT; [LICENSE](../LICENSE) and package metadata updated, with the license included in both candidate archives.
- [x] Establish pinned release inputs, package verification, release notes and update/rollback procedures — [candidate artifacts](../release/) and [distribution](DISTRIBUTION.md).
- [x] Exercise the release verification commands locally; configure pinned CI actions and Node versions, with manual dispatch and no automatic publication.
- [ ] Publish the developer preview after its automated checks and package verification pass; track the release in the [handoff](RELEASE-HANDOFF.md). External production validation remains open.

## 5. First-release scope

- [x] Prepare a calldata-only candidate; EIP-712 explicitly unsupported.
- [x] Keep the 31 suffix-bearing registry examples as explicit rejections. Morpho's chosen fixtures do not require those suffixes; no bytes are silently removed.
- [x] Owner selected the [developer preview scope](RELEASE-SCOPE.md), retaining calldata-only and strict portability restrictions.
- [x] Document an explicit [wallet/feature compatibility matrix](DEVICE-COMPATIBILITY.md), distinguishing local preview from tested device support. No external publication performed.
- [x] State that raw drafts require semantic review and that export does not verify deployment or imply acceptance.

## Existing evidence

- [Validation record](VALIDATION.md): 31 passing automated tests on Node 22 and 24, mined Anvil deposits and isolated package validation; four additional screen-check tests pass.
- [Registry compatibility](REGISTRY-COMPATIBILITY.md): 278 calldata descriptors / 1,435 function entries; 574 rendered transactions and 31 explicit suffix rejections.
- [Luna registry review](luna-registry-validation.md): independent corpus, integer and nested-array verification.

Testnet funds were not required. Ledger signatures were produced only inside local emulators and were not broadcast. Source-pilot deployment and deposit transactions were sent only to disposable loopback Anvil nodes. Some probes intentionally failed; physical-device coverage and human/maintainer review remain pending production-readiness work. Preview publication is tracked separately.
