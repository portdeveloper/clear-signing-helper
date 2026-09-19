# Distribution

The package ships the CLI bundle and a maintained copy of
`@ethereum-sourcify/clear-signing` 0.2.2 under `vendor/clear-signing`. The
renderer is a runtime dependency of the CLI, so installation does not edit
`node_modules` after npm has placed files. The dependency remains named
`@ethereum-sourcify/clear-signing` and is resolved from the package's vendored
directory.

The vendor directory preserves Sourcify's MIT notice and README. Its
`PROVENANCE.md` records the original and final SHA-256 hashes for both ESM and
CommonJS bundles. `npm run build` verifies those hashes and the
`signed-int-fix.1` marker before esbuild runs. The fix applies the declared
ABI width when converting signed integers. Update the vendor files and both
hash tables together when reviewing a renderer upgrade.

`docs/THIRD-PARTY-NOTICES.md` reproduces the license texts for every runtime
dependency in the lockfile, including dependencies bundled into the CLI.

## Build and verify a release

Use Node.js 22 or newer, then run:

```sh
npm ci --ignore-scripts
npm run release:verify
```

The release check independently installs and builds two clean source copies, one in a path with spaces. It compares CLI and tarball hashes, inspects license/provenance files, installs into a fresh consumer with lifecycle scripts disabled, and runs real Foundry init/fixture/preview plus a signed-int renderer probe. With a distinct previous local candidate tarball present it also exercises upgrade and rollback while retaining consumer data; without one it records only a same-build reinstall. It retains the candidate, SHA-256 sidecar and [verification record](../release/release-verification.json) in `release/`.

For a local tarball install:

```sh
npm run build
npm pack --ignore-scripts
npm install --ignore-scripts ./clear-signing-helper-0.3.0-preview.1.tgz
```

`npm ci --ignore-scripts` is the supported clean checkout verification path.
The package has no install-time mutation hook; lifecycle scripts are disabled
in the commands above to make the verification boundary explicit.

## Preview distribution

The first public release uses version `0.2.0-preview.1` and a GitHub prerelease tagged `v0.2.0-preview.1`. Attach the verified tarball, SHA-256 sidecar and `release-verification.json`, with a link to green CI for the tagged source revision. Verify the downloaded release artifact and a fresh installation after publication. Keep the prerelease status visible.

`0.3.0-preview.1` was published on 2026-09-19 under the `preview` and `latest` tags; publishing requires a granular token with 2FA bypass or an interactive one-time code. The owner authorized npm publication on 2026-09-09. The exact GitHub tarball was published as [`clear-signing-helper@0.2.0-preview.1`](https://www.npmjs.com/package/clear-signing-helper/v/0.2.0-preview.1) with `--tag preview --ignore-scripts`. Anonymous download matched the GitHub SHA-256 and registry SHA-512 integrity. A fresh credential-free install through `@preview`, the documented npx command, and the Foundry workflow passed; see `npm-verification.json` in the GitHub release assets.

The registry returned both `preview` and `latest` pointing to this first prerelease despite the explicit publish tag. Removing `latest` with `npm dist-tag rm clear-signing-helper latest` was rejected with HTTP 403. Cleanup remains pending; this tag does not establish stable or production-ready status. Document installation through `@preview` or the exact prerelease version. Temporary publishing credentials were removed after use.

External human review, maintainer assessment and physical-wallet acceptance remain pending; they do not block this scoped developer preview. See the [release handoff](RELEASE-HANDOFF.md) for publication progress and the [production tracker](PRODUCTION-READINESS.md) for those unresolved results.

## Upgrade and rollback

For users moving from an unpublished `0.2.0` candidate, retain the old tarball and back up `clear-signing.toml` and `clear-signing/`. Install the preview and run `clear-signing upgrade`. The explicit prerelease version changes the engine fingerprint, preserving descriptors while clearing old review. Inspect the source and previews before `clear-signing review --accept` and `clear-signing test --update`, then run `clear-signing check --strict-portability` and `clear-signing test`. Restore both the prior tool and its matching authoring files to roll back.


To upgrade the helper, review the new renderer package and its source hashes,
replace the contents of `vendor/clear-signing`, update the root dependency and
lockfile, and run `npm ci --ignore-scripts`, `npm test`, and
`npm run release:verify`. Keep the upstream MIT notice and update
`vendor/clear-signing/PROVENANCE.md` with both pre-fix and final hashes.

To roll back, restore the previous `package.json`, `package-lock.json`, and
`vendor/clear-signing` directory from the reviewed revision, then run the same
clean install and release checks. Existing consumer installations can pin the
previous tarball while the rollback is reviewed.

The GitHub Actions matrix is configured for Linux and macOS on Node.js 22.22.3
and 24.20.0. It runs npm installation with scripts disabled, the Foundry
example suites, the full test suite, and the reproducible package verification.
The [local Node 24 record](../release/node24-verification.json) reports 31 passing tests using an official SHA-256-verified temporary ARM64 binary. Node 22.22.3 also passes all 31 tests and the complete release verifier on Linux ARM64. For the preceding candidate, all four [GitHub runner jobs](GITHUB-CI.md) passed on Ubuntu 24.04 x64 and macOS 15 ARM64 using both Node versions, producing identical package hashes. Verified candidates are uploaded as workflow artifacts; the workflow supports manual dispatch and does not publish npm packages or registry submissions.

The preview has its own prerelease version and artifact hash. Historical `0.2.0` candidate records remain evidence for their recorded revisions. The owner selected [MIT](../LICENSE), which is declared in package metadata and included in the package and source archive. Release scripts do not perform publication.
