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
npm install --ignore-scripts ./clear-signing-helper-0.2.0.tgz
```

`npm ci --ignore-scripts` is the supported clean checkout verification path.
The package has no install-time mutation hook; lifecycle scripts are disabled
in the commands above to make the verification boundary explicit.

## Upgrade and rollback

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
The [local Node 24 record](../release/node24-verification.json) reports 31 passing tests using an official SHA-256-verified temporary ARM64 binary. Node 22.22.3 also passes all 31 tests and the complete release verifier on Linux ARM64. The macOS and Linux GitHub runner jobs have not been executed in this workspace: the owner must provide a repository/runner before those platforms can be approved. The workflow supports manual dispatch and never publishes.

Package versions are still unpublished `0.2.0` candidates; identify a candidate by its artifact hash, not version alone. The owner selected [MIT](../LICENSE), which is declared in package metadata and included in the package and source archive. To distribute publicly, choose the package/repository destination, rerun the checks for the resulting inputs, review the new artifact hash and authorize publication. The scripts do not perform publication.
