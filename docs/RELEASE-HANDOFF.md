# Developer preview release handoff

## Before any release

- Refresh the advisory registry prior: `npm run priors:snapshot -- <fresh registry clone>` and commit `src/data/registry-priors.json`; its `commit` and `generatedAt` fields are shown to users.
- Run `npm run registry:acceptance -- <fresh registry clone>` and record the accepted count in CLAUDE.md. Any new rejection class other than the `calldata` format is a regression against what the registry accepts.

## 0.6.0-preview.6 (2026-10-27)

Roadmap item 31: `claims`, plus `apply` relabelling hidden fields, `--strict-portability` gating on displayed fields only, and RPC rate-limit retries. Engine fingerprint unchanged, so users run no `upgrade`. Priors and pins unchanged from 0.6.0-preview.5 (registry `b70998c`).

- [x] `npm test` 88/88 and `npm run release:verify` (which now runs the suite outside CI) produced `clear-signing-helper-0.6.0-preview.6.tgz`, SHA-256 `1ede2ef4ee36f493bd32235eae535dac52c5f5ddaaa75a3717bd1b1f6bae5ba1`.
- [x] Published that tarball to npm as [`clear-signing-helper@0.6.0-preview.6`](https://www.npmjs.com/package/clear-signing-helper/v/0.6.0-preview.6) with `--tag preview --ignore-scripts --access public`, then moved `latest` to it. The registry tarball has the same SHA-256; integrity `sha512-SJJEuffUnZ5HJ1mNSD0MVlodL/fS7DnWyq4+vFvmL6IlhzxSORxWfDEoIlmpXmxJMQeRiea7NRstBjktB3Zc2w==`. Both `preview` and `latest` point to it, and `npx --package=clear-signing-helper@0.6.0-preview.6 clear-signing --version` reported `0.6.0-preview.6`. The token came from `~/.config/clear-signing-helper/npmrc-release` via `--userconfig`; it appears in no output.
- [x] Tagged `v0.6.0-preview.6` at `fc82ea9`; CI runs 40495713731 (push) and 40496023313 passed; [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.6.0-preview.6) with the tarball and checksum.
- [ ] Revoke the npm token used for this release (valid 2026-10-27 only, pasted into the session transcript) and delete `~/.config/clear-signing-helper/npmrc-release`.

## 0.6.0-preview.5 (2026-10-26)

Items 25–30 of the roadmap: `discover`, `PERMIT_GRANT_HIDDEN`, `LIMIT_WORDING`, decisions hints and `registryName`, `TAIL_SLICE_TOKEN`, and `mustMatch` in decisions. Engine fingerprint unchanged, so users run no `upgrade`.

- [x] Prior refreshed and acceptance run at registry `b70998c`: 587 descriptors, 904 selectors; 556 of 587 accepted, and the 31 rejections are the two known classes (30 `calldata`, 1 encrypted field). `npm run registry:drift` matched on all 7 checks.
- [x] `npm run release:verify` (Node 24.22.1, linux-arm64, Foundry 1.7.1) produced `clear-signing-helper-0.6.0-preview.5.tgz`, SHA-256 `23b198993e596d590dd21dc5ca430f4f89b84f69006cf0c08755bb945de8a690`.
- [x] Published that tarball to npm as [`clear-signing-helper@0.6.0-preview.5`](https://www.npmjs.com/package/clear-signing-helper/v/0.6.0-preview.5) with `--tag preview --ignore-scripts --access public`, then moved `latest` to it. A first attempt passed `release/…tgz` without `./`, and npm read it as a GitHub shorthand: nothing was published. The registry tarball has the same SHA-256 as the local one, and its integrity is `sha512-Cj1DeMekRqPBVA+xrcuOJen7nSicR1T0kI4NkPEMQzUCve5M2CACoptAmR3FR6CogybVeJbrx7pottQJt9Om+g==`. Both `preview` and `latest` point to it, and `npx --package=clear-signing-helper@0.6.0-preview.5 clear-signing --version` reported `0.6.0-preview.5`. The token was held in a mode-600 file in the session scratchpad, used with `--userconfig`, and deleted right after use; it appears in no npm log.
- [x] Tagged `v0.6.0-preview.5` at `3b672a2`; [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.6.0-preview.5) with the tarball and checksum.
- [x] **CI at the tag failed: three stale tests.** The suite was not run after the priors refresh, and `release:verify` did not run it. The refreshed snapshot holds Uniswap's own V2 Router02 file (registry #3133), so a V2 router ABI now matches it ahead of QuickSwap, and dropping `deadline` also draws `CORPUS_DISAGREEMENT`, since two entities now show it. The tool behaved correctly; the tests asserted the old data. Fixed in the next commit (tests only, not in the package), and `release:verify` now runs `npm test` outside CI. CI on that commit, `52a6907` ([run 40392127367](https://github.com/portdeveloper/clear-signing-helper/actions/runs/40392127367)), passed on Node 22.22.3 and 24.20.0, ubuntu-24.04 and macos-15, and all four candidate packages have the published SHA-256 `23b19899…a690`. The package is identical; the tag stays at `3b672a2`.
- [ ] Revoke the npm token used for this release on npmjs.com (it was pasted into the session transcript), together with the older ones still open below.

## 0.6.0-preview.4 (2026-10-21)

Follows registry CI of 2026-10-21 (master `2c2ddeb`): linter `964176e` (#3128, `context.contract.abi` is a lint error, so `--inline-abi` is removed), Sourcify runner `9d6d2fe` (#3127), Rust runner `65af228` (#3131). The validator accepts `iteration: "bundled"` and groups without a `path`. Engine fingerprint unchanged, so users run no `upgrade`.

- [x] Prior refreshed and acceptance run at registry `2c2ddeb`: 391 descriptors, 803 selectors; 366 of 391 accepted, the 25 rejections are the `calldata` format and one encrypted field. `npm run registry:drift` passed all 7 checks at the same commit. Renderer 0.2.2 and 0.3.0 gave identical output on all 2,022 registry test cases, so the vendored renderer stays.
- [x] Live: `registry add-deployment` of Safe 1.4.1 on chain 143 passed lint (0 errors) and both new runners (2/2), with "Payment: 0 MON".
- [x] `npm run release:verify` (Node 24.22.1, linux-arm64, Foundry 1.7.1) produced `clear-signing-helper-0.6.0-preview.4.tgz`, SHA-256 `b5f887d9ce4fdd98253b4b0b98b3d5ee57a35ac5d2e2bc223d1c64c85bb4f56c`. No prior candidate was given, so upgrade and rollback were not exercised (the engine is unchanged).
- [x] Published that tarball to npm as [`clear-signing-helper@0.6.0-preview.4`](https://www.npmjs.com/package/clear-signing-helper/v/0.6.0-preview.4) with `--tag preview --ignore-scripts --access public`, then moved `latest` to it. The registry tarball has the same SHA-256 as the local one, and its integrity is `sha512-rRxhbR22raGncefaiyAsSZgSxn8FRHFTLjOd+XYE6HVJImDrVi4xVUArflYLBHbVLW3uoWB8MOx/f9ODt/zwTw==`. Both `preview` and `latest` point to it, and a credential-free `npx --package=clear-signing-helper@preview clear-signing --version` reported `0.6.0-preview.4`. The token was held in a mode-600 file in the session scratchpad, used with `--userconfig`, and deleted right after use.
- [x] Published before the push and CI, because the session machine had no GitHub credentials at first. Then pushed `main`, tagged `v0.6.0-preview.4` at `e64fc2c`; CI run [39662806614](https://github.com/portdeveloper/clear-signing-helper/actions/runs/39662806614) passed on Node 22.22.3 and 24.20.0, ubuntu-24.04 and macos-15, and all four candidate packages have the SHA-256 above.
- [x] [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.6.0-preview.4) with the tarball, checksum and verification record; the downloaded asset matched the checksum.
- [ ] Revoke the npm token used for this release on npmjs.com (it was pasted into the session transcript), together with the older ones still open below.

## 0.6.0-preview.3 (2026-10-17)

Follows registry CI again: schema 2.1.0 (every format needs an intent; engine `subset` 3 to 4, so users run `upgrade`), lint pin `13eed8e`, Rust runner `dc158b1`, and the fix for `--registry <clone>` linting without `--require-verified` after the registry moved its lint into `descriptor-lint.yml`.

- [x] Prior refreshed and acceptance run at registry `fbe748d`: 288 descriptors, 551 selectors; 266 of 288 accepted, same 22 rejections. `npm run registry:drift` passed all 7 checks at the same commit.
- [x] Tag `v0.6.0-preview.3` on `main` at `14edfd6`; CI run [39007073618](https://github.com/portdeveloper/clear-signing-helper/actions/runs/39007073618) passed on Node 22.22.3 and 24.20.0, ubuntu-24.04 and macos-15. All four CI candidate packages have the same SHA-256 as the local candidate.
- [x] `npm run release:verify` produced `clear-signing-helper-0.6.0-preview.3.tgz`, SHA-256 `0690998bb02d7f4f44520c34a942f2739ed6499cb7feb6a6e73bc25cfdc531b3`, and `release-verification.json`.
- [x] [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.6.0-preview.3) with the tarball, checksum and verification record; the downloaded asset matched the checksum.
- [x] Published that tarball to npm as [`clear-signing-helper@0.6.0-preview.3`](https://www.npmjs.com/package/clear-signing-helper/v/0.6.0-preview.3) with `--tag preview --ignore-scripts --access public`, then moved `latest` to it. Registry integrity `sha512-6BgiNIlNnGFsfUU8z1JX8SEv3M0K5DvUhIVhiGgZzNwjGqRedXILeyRy3NvtJsfDYYS1akAxtZx3sK3E3dS7+A==` equals the GitHub asset, and the registry tarball has the same SHA-256. npm now processes a publish before serving it: the metadata appeared about 8 minutes after `npm publish` reported success, and the tarball about 4 minutes later (404 until then). Wait for both before verifying. A credential-free `npx --package=clear-signing-helper@preview clear-signing --version` reported `0.6.0-preview.3`; from a fresh clone of the tag, with the published package, the example previewed ("Deposit", "1 USDC", "Alice") and its signing test passed.
- [x] README, DISTRIBUTION, consumer CI example and site point at 0.6.0-preview.3. The token was held in a mode-600 file in the session scratchpad, used with `--userconfig`, and deleted right after use. No copy is in the repository.
- [ ] Revoke the npm token used for this release on npmjs.com (it was pasted into the session transcript), together with the older ones still open below.

## 0.6.0-preview.2 (2026-09-26)

The code of 0.6.0-preview.1, repackaged: that package shipped the PRD, 23 other internal docs and the agent skill, none meant for users (owner, 2026-09-26: "we should not publish files that are meant for me or an llm"). The package now holds `dist/`, `schemas/`, `vendor/clear-signing/`, `scripts/verify-renderer.mjs`, `README.md`, `LICENSE` and `docs/THIRD-PARTY-NOTICES.md` (46 files to 20), and `verify-release.mjs` fails on any other file; run against the 0.6.0-preview.1 package it rejects 26.

- [x] Registry unchanged at `53d86dc`, so the prior and the acceptance run (263 of 285) from the same day still hold.
- [x] Tag `v0.6.0-preview.2` on `main` at `e457ea5`; CI run [36257617625](https://github.com/portdeveloper/clear-signing-helper/actions/runs/36257617625) passed on Node 22.22.3 and 24.20.0, ubuntu-24.04 and macos-15. All four CI candidate packages have the same SHA-256 as the local candidate.
- [x] `npm run release:verify` produced `clear-signing-helper-0.6.0-preview.2.tgz`, SHA-256 `7ac717c3d9e376cfbaa9469d07f6a592cde909c42da4d5608e47762d7023877d`, and `release-verification.json`. All nine checks passed, plus the new file allowlist. The engine fingerprint is unchanged, so no user runs `upgrade`.
- [x] [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.6.0-preview.2) created with the tarball, checksum and verification record. The downloaded asset matched the checksum.
- [x] Published that tarball to npm as [`clear-signing-helper@0.6.0-preview.2`](https://www.npmjs.com/package/clear-signing-helper/v/0.6.0-preview.2) with `--tag preview --ignore-scripts --access public`, then moved `latest` to it. Registry integrity `sha512-qxq1GJa9wOg95+liyuaYAhfoidny9hZry4mXNt0w06MElSf9lRrIafFbH0LXRnZLZWAEtII5EqzD78G85O46DQ==` equals the GitHub asset. A credential-free `npx --package=clear-signing-helper@preview clear-signing --version` and a plain `npm install` report `0.6.0-preview.2` (the first `npx` attempt crashed inside npm's arborist on a cache left by the preview.1 check; a fresh cache installs cleanly).
- [x] Deprecated `0.6.0-preview.1` on npm: "Contains maintainer notes that were not meant to ship; use 0.6.0-preview.2". Not unpublished: a full scan found no credentials, and unpublishing would burn the version number anyway.
- [x] README, DISTRIBUTION and site point at 0.6.0-preview.2. The token was held in a mode-600 file in the session scratchpad, used with `--userconfig`, and deleted after each use. No copy is in the repository.
- [ ] Revoke the npm token used for 0.6.0-preview.1 and preview.2 on npmjs.com (it was pasted into the session transcript).

## 0.6.0-preview.1 (2026-09-26, deprecated)

- [x] Tag `v0.6.0-preview.1` on `main` at `b17fd15`; CI run [36248741000](https://github.com/portdeveloper/clear-signing-helper/actions/runs/36248741000) passed on all four platforms, and the four candidate packages matched the local SHA-256 `0d3d6120333f0ee83dabdbc2716d38f3d65b8ca338e1dde98ce6960e4c705f49`.
- [x] [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.6.0-preview.1) and npm publication under `preview` and `latest`; registry integrity `sha512-GJKPKS8uYuQdnSGcxjuUiJ0Fb4drLeENb0CvR0bVUdJBeo+dQgUuyv3BSC7yGhhso+EBu9ZLlS3SCzRPc9bCag==` equals the GitHub asset.
- [x] Superseded the same day by 0.6.0-preview.2 and deprecated: the package carried maintainer and agent files (see above).

## 0.5.0-preview.1 (2026-09-25)

- [x] The registry did not move after the morning measurement: prior refreshed and acceptance run at registry `53d86dc` (285 descriptors, 533 selectors; 263 of 285 accepted, same 22 rejections), recorded in CLAUDE.md. `e823abc` is the lint pin on registry master and built in.
- [x] Tag `v0.5.0-preview.1` on `main` at `852c989`; CI run [36188279647](https://github.com/portdeveloper/clear-signing-helper/actions/runs/36188279647) passed on Node 22.22.3 and 24.20.0, ubuntu-24.04 and macos-15. All four CI candidate packages have the same SHA-256 as the local candidate.
- [x] `npm run release:verify` produced `clear-signing-helper-0.5.0-preview.1.tgz`, SHA-256 `428bdada06979d6b6956bdc0718247c795bef2c40d49911e55ae62aaa72910fd`, and `release-verification.json`. All nine checks passed, including upgrade and rollback against the prior candidate. The engine fingerprint is unchanged, so no user runs `upgrade`.
- [x] [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.5.0-preview.1) created with the tarball, checksum and verification record. The downloaded asset matched the checksum.
- [x] Published that tarball to npm as [`clear-signing-helper@0.5.0-preview.1`](https://www.npmjs.com/package/clear-signing-helper/v/0.5.0-preview.1) with `--tag preview --ignore-scripts --access public`, then moved `latest` to it. Registry integrity `sha512-Ow0x4nERytUlIvvjKJtEpKZygkOFUw/EgGhtJ8FTtYU+Dr+9V5zGf4uzielZnImxnf0QXWVYOcip8FUUkhW6xQ==` equals the GitHub asset. A credential-free `npx --package=clear-signing-helper@preview` reported `0.5.0-preview.1`. From a fresh clone of the tag, with the published package, the example previewed ("Deposit", "1 USDC", "Alice") and its signing test passed. Run npx outside the repository checkout: inside it, npx resolves the local `clear-signing-helper` package and finds no linked binary.
- [x] README, DISTRIBUTION and site point at the npm version. The token was held in a mode-600 file in the session scratchpad, used with `--userconfig`, and deleted after publication. No copy is in the repository.
- [ ] Revoke the npm token used for this publication on npmjs.com (it was pasted into the session transcript).

## 0.4.0-preview.1 (2026-09-23)

- [x] Refreshed the registry prior at registry `8f56072` (280 descriptors, 533 selectors); acceptance at the same commit: 258 of 280 (recorded in CLAUDE.md).
- [x] Tag `v0.4.0-preview.1` on `main` at `a14880b`; CI run [35866670558](https://github.com/portdeveloper/clear-signing-helper/actions/runs/35866670558) passed on Node 22.22.3 and 24.20.0, ubuntu-24.04 and macos-15. All four CI candidate packages have the same SHA-256 as the local candidate.
- [x] `npm run release:verify` produced `clear-signing-helper-0.4.0-preview.1.tgz`, SHA-256 `89fd6798119f9ceba2cc74bbdb18b40f9acc0b2ccebdcdb418055741c60449fe`, and `release-verification.json` (upgrade and rollback exercised against the 0.3.0-preview.1 candidate).
- [x] [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.4.0-preview.1) created with the tarball, checksum and verification record. The downloaded asset matched the checksum, installed with lifecycle scripts disabled and reported `0.4.0-preview.1`.
- [x] Published the identical tarball to npm as [`clear-signing-helper@0.4.0-preview.1`](https://www.npmjs.com/package/clear-signing-helper/v/0.4.0-preview.1) with `--tag preview --ignore-scripts --access public`, then moved `latest` to it. Registry integrity `sha512-hqhtpUxnwhSr8rRFK50JSsGoq5K4z4fmDcHwPAPmP7Bkmn46X+7Wex6p7eoLnKz3Bv1LheEM8F5C2asGGNtpfQ==` equals the GitHub asset. A credential-free `npx --package=clear-signing-helper@preview` returned `0.4.0-preview.1`, previewed the example fixture from a fresh clone of the tag, and passed its signing test. Pass the tarball as `./release/<file>.tgz`: without `./`, npm reads `release/<file>` as a GitHub shorthand.
- [x] README, DISTRIBUTION and site point at the npm version.
- [ ] Revoke the npm token used for this publication on npmjs.com.

## 0.3.0-preview.1 (2026-09-19)

- [x] Tag `v0.3.0-preview.1` on `main` at `7c14b70`; CI run [35440995617](https://github.com/portdeveloper/clear-signing-helper/actions/runs/35440995617) passed on Node 22.22.3 and 24.20.0, ubuntu-24.04 and macos-15.
- [x] `npm run release:verify` produced `clear-signing-helper-0.3.0-preview.1.tgz`, SHA-256 `2619f5c1c2f11630f223e10586b8b2e0195828371d244d4546fcf269b747300e`, and `release-verification.json`.
- [x] [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.3.0-preview.1) created with the tarball, checksum and verification record. The downloaded asset matched the checksum, installed with lifecycle scripts disabled, reported `0.3.0-preview.1`, and previewed the example fixture.
- [x] Published the identical tarball to npm as [`clear-signing-helper@0.3.0-preview.1`](https://www.npmjs.com/package/clear-signing-helper/v/0.3.0-preview.1) with `--tag preview --ignore-scripts --access public`, using a granular token with 2FA bypass (an account token without it is refused with E403). Registry integrity `sha512-OqRAh4F9I4t4Ozho0iqqfQXbMTywx59jvZ1zQi7OrNod4LGoonurSGnGgst0JJ7LdCwVOPSH4zOQ3aWK0uSoPw==` equals the GitHub asset. A credential-free `npx --package=clear-signing-helper@preview clear-signing --version` returned `0.3.0-preview.1` and previewed the example fixture.
- [x] Moved the `latest` dist-tag to `0.3.0-preview.1`. npm does not allow a package without `latest`, so a bare install now resolves to the current preview rather than the superseded one. Note that `npx clear-signing-helper` without `--package=` cannot infer the `clear-signing` binary name; the README uses the explicit form.
- [x] README install section points at the npm version.
- [x] Tokens used for this publication revoked on npmjs.com (2026-09-19).

Earlier release below.


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
