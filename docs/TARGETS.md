# Top-contract targets

Which contracts the registry team describes before Devcon (roadmap item 24, phase 5). This is the first pass of 2026-10-27, made by hand. Roadmap item 32 replaces it with `scripts/rank-targets.ts` and keeps the manual keep/drop reasons in this file.

## Method (2026-10-27)

- Source: `https://erc7730.sourcify.dev/api/live/ranking?window=7d&limit=100&offset=0..400`, the 500 busiest Ethereum mainnet contracts from 2026-10-20 to 2026-10-27. The API takes only `1h`, `24h` and `7d` windows.
- Coverage: an address counts as covered only if it appears in a registry descriptor (not under `tests/` or `testsv2/`) at registry `b70998c`. Searching the whole tree is wrong: Relay Depository and SwapRouter appear in other projects' test files as recipients and spenders.
- 297 of the 500 are verified and not covered. Plain tokens, bot and infrastructure traffic, and contracts the tool cannot describe yet were dropped by hand (reasons below).

## Candidates

Tx counts are 7-day totals for the whole contract, not only human-signed functions.

| # | Contract | Address | 7d tx | Human-signed functions | Status / note |
|---|---|---|---|---|---|
| ✓ | Uniswap V2 Router02 | `0x7a250d5630b4cf539739df2c5dacb4c659f2488d` | 81.6k | swaps, liquidity | merged #3133 |
| 1 | Uniswap V3 SwapRouter | `0xe592427a0aece92de3edee1f18e0157c05861564` | 48.9k | `exactInputSingle`, `exactOutputSingle` | #3135 in review |
| 2 | Relay Depository | `0x4cd00e387622c35bddb9b4c962c136462338bc31` | 76.6k | `depositNative`, `depositErc20` (~55k) | `execute` (21.9k) likely solver-side |
| 3 | SeaDrop | `0x00005ea00ac477b1030ce78506496e8c2de24bf5` | 22.5k | `mintPublic`, `mintSigned` | |
| 4 | Across SpokePool | `0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5` | 21.7k | `depositV3`, `deposit` (~8k) | `fillRelay` (13.7k) is relayers |
| 5 | Across SpokePoolPeriphery | `0x97ccdbea4632140639ad5ea9b944aa034eb15fd4` | 9.7k | `depositNative`, `swapAndBridge` | `depositWithAuthorization` may be relayed |
| 6 | THORChain Router | `0xd37bbe5744d730a1d98d8dc97c42f0ca46ad7146` | 11.9k | `depositWithExpiry` (~5k) | `transferOut` is the vault |
| 7 | Uniswap V3 NonfungiblePositionManager | `0xc36442b4a4522e871399cd717abdd847ab11fe88` | 7.6k | `mint`, `increaseLiquidity`, `decreaseLiquidity`, `collect` | `multicall` stays blind |
| 8 | SwftSwap | `0xc1d13492285eb664951e201bf7c80c7c6318a1b5` | 32.2k | `swap`, `swapEth` | `withdraw` looks operator-side |
| 9 | Pendle RouterV4 | `0x888888888889758f76e7103c6cbf23abbf58f946` | 4.5k | 27 functions | large, high value |
| 10 | Disperse | `0xd152f549545093347a162dce210e7293f1452150` | 3.9k | `disperseEther`, `disperseToken` | |
| 11 | ENS ETHRegistrarController | `0x59e16fccd424cc24e280be16e11bcd56fb0ce547` | 3.4k | `register`, `renew`, `commit` | |
| 12 | TransitSwap RouterV5 | `0x07964f135f276412b3182a3b2407b8dd45000000` | 5.3k | V2/V3 swaps | `aggregate` may be opaque |
| 13 | Maya Router (Harbor_RouterV5) | `0x1f21d09c65bc8af92634dcd5a100b6d04f0c81c3` | 4.4k | `depositWithExpiry` | |
| 14 | CoW EthFlow | `0xba3cb449bd2b4adddbc894d8697f5170800eadec` | 2.2k | `createOrder` | |
| 15 | Sushi RedSnwapper | `0xac4c6e212a361c968f1725b4d055b47e63f80b75` | 1.7k | `snwap`, `snwapMultiple` | in, out and minimum are plain arguments |
| 16 | Curve Router v1.2 | `0x45312ea0eff7e09c83cbe249fa1d7598c4c8cd4e` | 1.4k | `exchange` | nested arrays: registry runners mandatory |
| 17 | OP Mainnet portal | `0x0ec68c5b10f21effb74f2a5c61dfe6b08c0db6cb` | 5.7k | prove/finalize withdrawal | people and relayers mixed |
| 18 | Base portal | `0x49048044d57e1c92a77f79988d21fa8faf74e97e` | 5.0k | prove/finalize withdrawal | people and relayers mixed |
| 19 | ENS NameWrapper | `0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401` | 3.1k | `setSubnodeRecord` | may be one bot |

Unidentified proxies worth a look: `0x94e7a5dcbe816e498b89ab752661904e2f56c485` (lending: `borrow`/`withdraw`/`repay`), `0x604dd02d620633ae427888d41bfd15e38483736e` (`deposit`/`withdraw`/`depositNative`), `0xbca3039a18c0d2f2f84ba8a028c67290bc045afa` (`withdrawV2`/`depositWithId`/`swapWithData`).

## Dropped, with reasons

- **Partial screens** (decision 2026-10-27): MetaMask MetaSwap `0x881d4023…` (27k) and MetaBridge `0x0439e60f…` (24k), Relay ApprovalProxyV3 `0xccc88a9d…` (35k), 0x AllowanceHolder `0x…1ff3684f…` (23k), OKX DexRouter `0x8feab81d…` (34k), LI.FI Permit2Proxy, Rango, Mayan, Decent UTB, deBridge forwarder. The output is inside opaque data, so a screen could show what is paid but not what is received, which is false for some values.
- **Needs a spec change:** Universal Router (custom encoding, ERCs#1925), Uniswap V4 PoolManager and PositionManager (packed actions).
- **Later:** Seaport (complex orders, much of it EIP-712), 1inch AquaRouter (semantics unknown).
- **Not signed by people:** EntryPoints, LayerZero DVNs and ULN, rollup batch posting, oracles (Pyth, RedStone, Chainlink VRF/Keystone), CoW `settle`, Multicall3, BitGo `WalletSimple`, 7702 gas stations.
- **Plain tokens:** wallets build these from their trusted lists (#3130 Rule 2).
- **Tornado Router.**

## Weak points of this pass

1. Total tx overstates bot-heavy contracts. The right measure is distinct senders and the share of one-time senders per function (HyperSync `from` over 7 days; needs `ENVIO_API_TOKEN`).
2. Ethereum mainnet only.
3. Hardware-wallet use is unmeasured; ask Ledger/Trezor or use Arik's analysis.
