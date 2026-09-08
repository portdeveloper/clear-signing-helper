# Independent source pilots

Run `scripts/run-source-pilots.sh` (a wrapper for `run-source-pilots.mjs`) with a prepared source parent and a new evidence directory. The orchestrator creates fresh pinned clones, installs the current packed CLI into an isolated consumer, starts a disposable local Anvil, deploys both pilot contracts, and invokes the installed CLI through `init`, descriptor editing, complete fixture generation, preview, review, `test --update`, `test`, strict check, and strict export. It never broadcasts externally or publishes.

The canonical [fresh-source replay](evidence/pilots/reproducible-2026-09-08-r2/manifest.json) was independently executed by Luna. OpenZeppelin Contracts `dbb6104ce834628e473d2173bbc9d47f81a9eec3` uses solc 0.8.33 and produced nine fixtures covering all nine write functions. Uniswap v3-periphery `80f26c86c57b8a5e4b913f42844d4c8bd274d058` uses solc 0.7.6 and produced 14 fixtures covering 14 of 15 write functions. Its signed pool callback and additional `receive()` entrypoint are explicitly excluded. Every recorded workflow step exited zero, including strict check and export.

Measured time from helper init through the first preview was 5.014 seconds for OpenZeppelin and 5.874 seconds for Uniswap. The first preview command itself took 462 ms and 385 ms respectively. Complete helper workflows took 11.129 and 13.041 seconds. These are automated timings; they exclude cloning, initial compilation, dependency setup, installation and human review, and they are not a maintainer usability claim.

From the source archive, with Node/npm, Forge/Anvil and Solidity 0.8.33/0.7.6 installed:

```sh
npm ci --ignore-scripts
node scripts/prepare-pilot-sources.mjs /tmp/new-pilot-sources
node scripts/run-source-pilots.mjs /tmp/new-pilot-sources /tmp/new-pilot-evidence
```

Both destination paths must be new. The preparation script clones public inputs at pinned commits and asserts the selected compiler versions; the helper uses offline Forge builds. Install missing compilers through the existing Foundry setup first. The [OpenZeppelin configuration](evidence/pilots/reproducible-2026-09-08-r2/openzeppelin-contracts-foundry.toml), [Uniswap adapter](evidence/pilots/reproducible-2026-09-08-r2/uniswap-v3-periphery-foundry.toml) and manifest retain the exact settings and dependency pins.

The local Anvil evidence records successful ERC20 mint, approval, and ERC4626 deposit of 1,000,000 assets for 1,000,000 shares. The router was deployed with local placeholder dependencies; no swap execution is claimed. The two earlier exploratory runs remain retained as `r1` dependency-onboarding failure and `r2` callback-signing failure. The completed run scopes callback and `receive()` entrypoints with explicit reasons; the callback exclusion is a portability boundary and does not claim signing support for callback execution. Uniswap's original Hardhat project was adapted with a disposable Foundry configuration copied into evidence; no native-token semantics are inferred. All dependency commits, source configs, licenses, deployment receipts, strict findings, fixtures, renderings, and exported bundles are retained. These are internal Luna validation results, not wallet certification, external deployment verification, or maintainer approval.
