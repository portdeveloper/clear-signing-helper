# Luna adversarial validation

Date: 2026-09-07. Recorded from the independent verification agent's executed command results. This is a bounded set of probes; the automated integration suite covers additional failure cases.

## Artifact freshness

A temporary copy of `examples/standard` was used:

- Baseline `check` rebuilt the project and returned expected pending-review/coverage diagnostics.
- Repeating `check --no-build` reached normal descriptor validation, confirming unchanged build inputs were accepted.
- Appending a Solidity comment to `src/AssetVault.sol`, leaving its ABI unchanged, caused `check --no-build` to fail with exit 2 and `STALE_BUILD`.
- Rebuilding after the change restored normal validation without bypassing review.

## Preservation and newly added functions

A separate temporary project selected only `src/AssetVault.sol:AssetVault`:

- Init created its descriptor.
- The deposit field label was manually changed to `Human reviewed assets`.
- Repeating init preserved the exact descriptor file hash and custom label.
- Adding `pause() external onlyAdmin {}` to the actual Solidity contract and running sync added the new format.
- Sync preserved the custom deposit label and reported `REVIEW_REQUIRED`.

No false pass was found in these executed probes. Original repository source files were not modified by this verification.
