# Executed GitHub CI

The [PR validation run](https://github.com/portdeveloper/clear-signing-helper/actions/runs/34216725726) passed on 2026-09-08 for commit `3a0f2d8760bd9b0143242f4c5cfa73f9004a4ce2`, in [PR #1](https://github.com/portdeveloper/clear-signing-helper/pull/1). Luna independently checked all four jobs. [Captured run details](evidence/github-ci/2026-09-08/run-34216725726.json) retain the job steps and results.

| Runner | Actual architecture | Node | Result |
| --- | --- | --- | --- |
| Ubuntu 24.04 | Linux x64 | 22.22.3 | Passed |
| Ubuntu 24.04 | Linux x64 | 24.20.0 | Passed |
| macOS 15 | Apple Silicon ARM64 | 22.22.3 | Passed |
| macOS 15 | Apple Silicon ARM64 | 24.20.0 | Passed |

Each job installed from the lockfile with lifecycle scripts disabled, ran the Solidity example suites, passed all 31 CLI tests, independently built/packed two source copies, and verified installed CLI rendering and package licensing. All four jobs uploaded candidate tarballs, SHA-256 sidecars and verification records. Since the previous local candidate is not checked into Git, remote checks correctly record a same-build reinstall; the separate local validation exercised distinct-candidate upgrade/rollback.

The downloaded artifacts were independently checked against their declared hashes. All four candidates matched the local candidate for this commit:

```text
package SHA-256: 4ef9136b88e0023b6e8e80180452588658f62d519aede10c4bb0e6c5d4385cbf
CLI SHA-256:     c02dcb4436daee3ed094a18096c6bce6e6619f0c281bec396d6db85ef45f11b5
```

The [four verification records](evidence/github-ci/2026-09-08/) capture actual platforms and checks. Download candidates from the workflow run's artifacts or run `gh run download 34216725726 --repo portdeveloper/clear-signing-helper --dir /tmp/new-ci-artifacts`.

These results close the configured remote platform gate. They do not establish Intel macOS, Windows, physical-wallet support, semantic approval or publication. Later commits have their own runs and artifact hashes; use the current PR checks for the latest revision.
