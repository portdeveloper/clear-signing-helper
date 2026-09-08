# Luna Foundry validation

Date: 2026-09-07

This validation used the built CLI at `dist/cli.js`, Forge 1.7.1, and Solidity
0.8.28. Each project was copied to a fresh `/tmp/clear-signing-luna-*`
directory before running the CLI, so the checked-in examples and their
clear-signing files were not modified. The final rerun used source-only copies
with freshly generated descriptors.

## Router tuple and array coverage

The standard fixture's router route methods were changed from `pure` to
nonpayable and now emit `RouteExecuted`. This makes them actual write functions
and includes them in the clear-signing inventory. Forge's ABI reports these
signatures as nonpayable:

```text
batchSwap((address,address,uint256,uint256)[],address)
executeRoute((address,address,address,uint256,uint256,bytes),address)
executeRoute((address,address,address,uint256,uint256,bytes)[],address)
```

Forge validation after the change:

```text
forge test --root examples/standard
3 tests passed, 0 failed
```

Against a fresh copy of `examples/standard`, the CLI workflow was:

```text
clear-signing --root TEMP init --contract src/SwapRouter.sol:SwapRouter
clear-signing --root TEMP fixture --function executeRoute((address,address,address,uint256,uint256,bytes),address) ... --local
clear-signing --root TEMP fixture --function executeRoute((address,address,address,uint256,uint256,bytes)[],address) ... --local
clear-signing --root TEMP fixture --function batchSwap((address,address,uint256,uint256)[],address) ... --local
clear-signing --root TEMP preview --fixture clear-signing/fixtures/single-full-named.json
clear-signing --root TEMP preview --fixture clear-signing/fixtures/route-two.json
clear-signing --root TEMP preview --fixture clear-signing/fixtures/batch-two.json
clear-signing --root TEMP review --accept
clear-signing --root TEMP test --update
clear-signing --root TEMP test
clear-signing --root TEMP check
```

All fixture encodings and previews passed. The renderer produced the expected
`Execute Route` intent for both the single tuple and tuple-array calls, with
`Pool`, `Token In`, `Token Out`, `Amount In`, `Min Amount Out`, `Call Data`,
and `Recipient` fields. The final tuple-array scaffold uses a sequential
`steps.[]` group, so all six leaves of the first route element remain adjacent
before all six leaves of the second route element. The `batchSwap` scaffold
uses the same sequential `swaps.[]` grouping, keeping each element's token and
amount fields together. Assertions over two differing elements verified both
field sequences and values. The final checks for the fresh router-only copy
were:

```text
test --update: 3 passed, 3 updated
test:         3 passed, 0 updated
check:        SwapRouter covered 6, excluded 0
```

The single-tuple fixture was also encoded once with the full compiler-named
signature, including `step` and `recipient`; the resulting canonical signature
and preview matched the ABI entry.

The first preview before running `sync` failed as expected with three
`MISSING_COVERAGE` diagnostics for the newly nonpayable tuple and array
functions. `sync` added those scaffold formats while preserving the existing
router formats, after which preview and check passed. That earlier run used a
copy with the old flat tuple-array formats; the fresh rerun above confirms the
final sequential grouping behavior and does not rely on `sync` to rewrite an
existing descriptor.

## Fresh standalone bundle and README quickstart

For the final rerun, only `dist/cli.js` was copied to a temporary directory
outside the repository. Running `node clear-signing.js --version` and
`node clear-signing.js --help` succeeded, followed by `init`, fixture encoding,
preview, review, snapshot update, test, and check against the source-only
standard project. No `node_modules`, package manifest, or repository-relative
runtime file was needed by the copied CLI.

The README quickstart was also run against the checked-in standard example:

```text
node dist/cli.js --root examples/standard preview \
  --fixture clear-signing/fixtures/deposit.json
```

It rendered `Deposit (local draft)`, `Amount: 1 USDC`, and `Receiver: Alice`
with the expected local chain and target metadata.

## Custom paths and profile

Against a fresh copy of `examples/custom-layout`, the CLI was run with
`--profile ci`:

```text
clear-signing --root TEMP --profile ci init --contract contracts/CustomVault.sol:CustomVault
clear-signing --root TEMP --profile ci fixture --function initialize(address,address) ... --local
clear-signing --root TEMP --profile ci preview --fixture clear-signing/fixtures/initialize.json
clear-signing --root TEMP --profile ci review --accept
clear-signing --root TEMP --profile ci test --update
clear-signing --root TEMP --profile ci test
clear-signing --root TEMP --profile ci check
```

The project resolved `contracts/` and `specs/`, built to its custom artifact
directory, and used the CI profile successfully. The initializer preview
rendered `Asset Token` and `Initial Manager`.

```text
test --update: 1 passed, 1 updated
test:         1 passed, 0 updated
check:        CustomVault covered 3, excluded 0
```

## Duplicate contract names

Against a fresh copy of `examples/duplicate-contracts`, init selected both
identities:

```text
src/alpha/Registry.sol:Registry -> calldata-Registry-d5531ada.json
src/beta/Registry.sol:Registry  -> calldata-Registry-73992e48.json
```

Fixtures and previews for `register(bytes32,address)` passed for both source
paths. Review, snapshot update, repeated snapshot test, and check all passed:

```text
test --update: 2 passed, 2 updated
test:         2 passed, 0 updated
check:        both Registry contracts covered 1, excluded 0
```

No network, RPC, deployment, private key, or forge-std dependency was used.
