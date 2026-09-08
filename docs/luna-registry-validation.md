# Luna registry validation

Date: 2026-09-07

This validation used the vendored registry corpus at commit
`0318f9a51ec4fc7ba4aed6de5e315c8884d1fe38` and the independent clone
at `/tmp/clear-signing-registry-audit`. The corpus scope is all top-level
registry calldata descriptors, with `includes` resolved offline. No deployed
protocol source or deployed bytecode was used for the ABI-shape checks.

## Corpus inventory

The corpus contains 278 calldata descriptor files and 1,435 effective function
formats. The effective ABI shapes include 180 formats containing tuples, 182
containing arrays, 173 containing bytes values, and 80 zero-argument formats.
There are no fixed-size array examples in this snapshot. Registry signatures
have named top-level and tuple parameters; a separate synthetic unnamed ABI
check confirms that the scaffold uses stable `arg0`, `arg1`, and so on and
passes descriptor validation.

The corpus metadata counts 104 EIP-712 descriptors. This is exactly the
top-level `registry/*/eip712-*.json` inventory. A broader descriptor-file count
adds the separate ERC template
`ercs/eip712-erc2612-permit.json`, yielding 105. The files
`registry/safe/common-eip712-Safe.json` and
`registry/uniswap/common-eip712-uniswap.json` are include fragments, not
standalone descriptors. EIP-712 generation remains outside this calldata-only
tool.

## Basic generation and expansion

The generated raw scaffold and renderer probe covered all 1,435 effective
calldata formats: 1,435 generated and 1,435 rendered. The probe used ABI
samples with populated arrays and bytes values. A second probe varied nested
array lengths, including empty inner arrays, across all 15 signatures in the
registry containing nested arrays. All 15 rendered successfully, every
nonempty leaf appeared in order, and the observed leaf count matched the
encoded input. Empty arrays remained explicit `EMPTY_ARRAY` groups.

The nested-array examples are concentrated in these real descriptors:

- Feral File sale data has `(address recipient,uint256 bps)[][] revenueShares`
  in `registry/feral-file/calldata-feralfile-english-auction-0.json`, the
  `calldata-feralfile-exhibition-v4-*.json` descriptors, and
  `calldata-feralfile-vault-0.json`.
- OKX multi-commission routers have
  `(address[] mixAdapters,address[] assetTo,uint256[] rawData,bytes[] extraData,uint256 fromToken)[][] batches`
  in `registry/okx/calldata-OkxDexRouterV1.0.7-multi-commission.json` and
  `registry/okx/calldata-OkxDexRouterV1.0.8-suffix-compat.json`.

Expansion limits were checked directly. ABI nesting through depth 32 is
accepted; depth 33 returns `UNSUPPORTED_TYPE`. A 64×64 nested array produces
4,096 output leaves; 65×65 returns `RENDER_LIMIT` because the output exceeds
4,096 fields. An input that exceeds 8,192 expansion nodes returns
`RENDER_LIMIT`. These checks exercise the per-parameter decoded values rather
than assuming a single root array.

Representative real shapes also rendered from generated raw descriptors:

- Uniswap `exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)` rendered all four real test calls from `registry/uniswap/testsv2/calldata-UniswapV3Router02.tests.json`.
- Aave `multicall(bytes[] data)` is represented in
  `registry/aave/calldata-lpv3.json`.
- Morpho Bundler uses
  `multicall((address to,bytes data,uint256 value,bool skipRevert,bytes32 callbackHash)[] bundle)` in `registry/morpho/calldata-MorphoBundlerV3.json`.
- Safe nested transaction bytes and custom `calldata` fields are defined in
  `registry/safe/common-Safe.json`; basic generation exposes the bytes leaves
  as raw values and does not decode the inner transaction.
- ERC-721 templates in `ercs/calldata-erc721-nfts.json` use registry-only
  `nftName` and `enum` formats; a basic generated descriptor can still expose
  those ABI leaves as raw fields.

Payable zero-argument calls are covered. The real Benqi `submit()` example in
`registry/benqi/testsv2/calldata-sAVAX.tests.json` has selector `0x5bcb2fc6`
and value `1770000000000000000`; the scaffold adds `@.value` and renders the
native value. A canonical synthetic `deposit() payable` call behaves the same.

## Real transaction replay

The compatibility replay inspected 605 registry test transactions. It rendered
574 canonical transactions and deliberately rejected 31 transactions whose
calldata has an appended suffix. The suffix rejections are grouped by entity:

| Entity | Rejected suffix cases |
| --- | ---: |
| 1inch | 10 |
| Morpho | 11 |
| OKX | 5 |
| Surge | 4 |
| WETH | 1 |
| **Total** | **31** |

The replay verifies that each rejected transaction has canonical ABI data as a
prefix and rejects it with `NONCANONICAL_CALLDATA`; the suffix is never hidden.
The WETH `deposit()` example has a one-byte suffix. Canonically encoded fixtures for these ABI shapes remain
renderable.

## Signed integer correction and final suite

The earlier raw-leaf probe found that the pinned renderer mishandled declared
signed widths narrower than the ABI word, including `int24` and `int128`, by
displaying sign-extended values as unsigned 256-bit integers. Canonical
`int256` behavior was already correct. At this historical milestone the fix was applied by
the initial `scripts/patch-renderer.mjs`, which checked the exact original SHA-256 for both
renderer bundles before replacing the signed conversion with
`BigInt.asIntN(declaredWidth, value)`. The patch script was run twice during
this validation; the second run made no file changes. The later [distribution work](DISTRIBUTION.md) replaces install-time patching with a hash-verified maintained vendor copy.

The signed-integer regression test covers every width from 8 through 256 with
minimum, `-1`, zero, `1`, and maximum values. The final full suite is green:

```text
20 tests passed, 0 failed
```

This includes the complete 1,435-format raw-leaf check, the verified-ABI
check, the 12 ABI-shape Forge workflows, and the canonical replay with 574
rendered transactions and 31 explicitly rejected suffix cases.

The Forge portion compiles 12 representative ABI-shape harnesses covering
Aave, Uniswap, Morpho, Safe, Lido, Ekubo, Flare, Feral File, OKX, Paraswap,
and WETH. These harnesses only reproduce ABI shapes for authoring tests; they
are not implementations of, or verification of, the deployed protocols.
