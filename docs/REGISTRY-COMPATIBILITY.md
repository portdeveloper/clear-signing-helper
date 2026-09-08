# Registry compatibility

Executed 2026-09-07 against the [ERC-7730 registry at commit `0318f9a`](https://github.com/ethereum/clear-signing-erc7730-registry/tree/0318f9a51ec4fc7ba4aed6de5e315c8884d1fe38). The checked-in CC0 corpus makes the checks repeatable without network access.

## Results

| Check | Result |
| --- | --- |
| Top-level calldata descriptors, with includes resolved | 278 of 278 generate schema-valid basic drafts |
| Effective function entries across those descriptors | 1,435 of 1,435 render every argument leaf in order |
| Registry raw transactions | 574 of 605 render; 31 explicitly reject appended calldata |
| Complete deployed-contract ABIs retrieved from Sourcify | WETH, Uniswap Router02, Morpho Blue and Safe pass |
| Representative ABI-shape projects compiled through Foundry | 12 pass generation, fixture creation and preview |
| Full automated suite, including mined Anvil transaction | 20 tests pass, zero skipped |
| Top-level EIP-712 descriptors | 104 inventoried; generation remains unsupported |

Function entries include repeated functions inherited through registry includes. The all-registry checks generate fresh raw descriptors from function signatures, then compare rendered values and order with the typed ABI arguments. They do not import the existing curated display rules or claim identical signing screens.

The initial generation probe passed 1,409 function entries and failed 26 entries involving nested arrays. Recursive scaffolding and transaction-specific expansion now cover all 1,435. Payable ABI functions also receive an explicit native-value field in wei, including functions without arguments.

## Evidence and examples

- [Eight generated JSON examples](../examples/registry-basic/README.md) include WETH, Uniswap, Morpho, Safe, Ekubo, Feral File, OKX and ParaSwap.
- [Corpus tests](../test/registry-compatibility.test.ts) cover all descriptors and raw transactions, rather than a handpicked subset.
- [Snapshot provenance](../test/fixtures/registry/README.md) records the source commit, input file hashes and license. `verified-abis.json` records the four Sourcify retrieval URLs and match statuses.
- [Independent Luna verification](luna-registry-validation.md) includes nested empty-array probes, signed-integer bounds, expansion limits and a full suite rerun.

The twelve Foundry harnesses cover Aave, Uniswap, Morpho Blue, Morpho Bundler, Safe, Lido, Ekubo, Flare, Feral File, OKX, ParaSwap and WETH. They reproduce ABI shapes with no-op function bodies. They establish integration with actual Forge artifacts, not correctness of those protocols' implementations. The separate Anvil test deploys the example token and vault, mines a deposit and checks resulting balances.

Registry format signatures omit mutability. The raw-transaction replay uses payable ABI-shape harnesses to retain transaction value. The four Sourcify ABI checks use actual mutability and parameter names. Normal CLI generation always reads these from the project's compiled ABI.

## Signed-integer fix

Exact value comparisons exposed a bug in the pinned Sourcify renderer 0.2.2: negative signed integers narrower than 256 bits could render as large positive numbers because the ABI word's sign extension was not masked to the declared width. This affected real shapes such as Uniswap `int24` and Ekubo `int128`. Canonical `int256` decoding was already correct.

The maintained [vendored renderer](../vendor/clear-signing/PROVENANCE.md) applies a minimal correction using `BigInt.asIntN(declaredWidth, value)` to both upstream bundles. [`scripts/verify-renderer.mjs`](../scripts/verify-renderer.mjs) checks their final SHA-256 hashes before building. This replaces the initial install-time patch; installation no longer mutates dependencies. The renderer stays pinned to 0.2.2; the engine identifies itself as `0.2.2+signed-int-fix.1`. The fix has not been submitted upstream.

Regression tests compare exact minimum, -1, zero, 1 and maximum values for every signed width from 8 through 256 bits. They also compare nested arrays containing negative values and empty arrays. The engine change invalidates old review records; run `clear-signing upgrade`, inspect the new output, then explicitly accept review and expectations.

## Limits

The 31 noncanonical transaction examples contain valid ABI calldata followed by additional bytes:

| Registry entity | Rejected examples |
| --- | ---: |
| 1inch | 10 |
| Morpho | 11 |
| OKX | 5 |
| Surge | 4 |
| WETH | 1 |

These return `NONCANONICAL_CALLDATA`. Tests establish that canonical re-encoding is a prefix of each original transaction. The tool does not strip or interpret suffixes; canonical fixtures for the same function shapes do render. Supporting attribution and other suffix schemes requires explicit handling before these exact examples can pass.

Basic drafts expose raw argument values. Token inference, enum names, compressed routes, nested transaction decoding, maps, encrypted values and conditional displays require additional authoring or features outside the supported subset. Bytes containing calls remain opaque. A generated draft still requires source and semantic review before submission.

Nested groups remain standard JSON on disk; local preview expands them into concrete indexed paths for the supplied transaction. Empty arrays remain visible. Expansion is bounded to 32 levels, 8,192 nodes and 4,096 fields. Wallet/device support for the exported groups has not been verified. The fixed-array regression tests are synthetic because this registry snapshot contains no fixed-size array signatures.

EIP-712 generation, deployed bytecode matching by this CLI, registry acceptance, attestations and hardware-wallet rendering are outside this validation. No descriptor was published.

## Reproduce

With Node 22 and the Foundry/compiler prerequisites installed:

```sh
npm ci
npm test
npx tsx scripts/generate-registry-examples.ts
```

To deliberately refresh the corpus from a local registry clone:

```sh
npm run registry:snapshot -- /path/to/clear-signing-erc7730-registry
```

Review source changes and update inventory assertions when changing the pin. Refreshing the corpus does not refresh the separately recorded Sourcify ABIs.
