# Foundry reference projects

These small projects are used as realistic, offline fixtures for `clear-signing`.
They deliberately use no `forge-std` dependency or remappings, so a clean machine
with Foundry can build and test them without fetching a library.

| Project | What it exercises |
| --- | --- |
| [`standard`](./standard) | An inherited admin, ERC-20-like token, asset vault, router overloads, tuples, and arrays |
| [`custom-layout`](./custom-layout) | Non-default source/test/output directories and the `ci` profile |
| [`duplicate-contracts`](./duplicate-contracts) | Two source files containing the same contract name |

Run a project with:

```sh
forge test --root examples/standard
FOUNDRY_PROFILE=ci forge test --root examples/custom-layout
forge test --root examples/duplicate-contracts
```

The projects contain no deployment scripts, private keys, RPC configuration, or
network-dependent tests. Addresses in tests are deterministic local addresses.
