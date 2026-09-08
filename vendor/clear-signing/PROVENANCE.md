# Vendored renderer provenance

This directory contains the distributable `@ethereum-sourcify/clear-signing`
0.2.2 renderer, built from the package published by Sourcify. The upstream
MIT notice is preserved in [`LICENSE`](./LICENSE) and the upstream README is
preserved in [`README.md`](./README.md).

The two executable bundles are pinned by the SHA-256 values below. The
unmodified upstream bundle hashes are recorded so a future upgrade can be
checked before applying the signed fix.

| file | upstream original SHA-256 | vendored signed-fix SHA-256 |
| --- | --- | --- |
| `dist/index.js` | `9827445b9f9a54309e2d159acb0f0d4ea7f68fe3ef306ce0617269c380fcfd2c` | `d3b8d3fa91c1d915fe73571a8e6a9c6dfc7772448f0835dd50ebfdcb4dffdeb7` |
| `dist/index.cjs` | `a00a56e2bb39191394cd11ee1edeeafd3f7395265fddb131861ebd187261a814` | `2d39e0c44639b9aaa9a4abc7cd826e4000ad24cde174a33cf9518ffc512d87b3` |

The signed fix is `signed-int-fix.1`: signed values are converted with
`BigInt.asIntN` at the declared ABI width, preventing sign extension from
being interpreted at the full calldata word width. `scripts/verify-renderer.mjs`
checks these hashes and the fix marker during every build.
