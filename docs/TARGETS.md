# Top-contract targets

Which contracts the registry team describes before Devcon (roadmap item 24, phase 5). The ranking is `scripts/rank-targets.ts` (roadmap item 32); this file holds the decisions a person made about its rows, which the script reads.

## Method

`npx tsx scripts/rank-targets.ts [--registry <clone>] [--senders 40] [--show 60] [--json <file>]`, with `ENVIO_API_TOKEN` set for sender counts. Re-run it before each sync call.

- Source: `https://erc7730.sourcify.dev/api/live/ranking?window=7d&limit=1000`, the busiest Ethereum mainnet contracts of the last 7 days. The API takes only `1h`, `24h` and `7d` windows (`--window`).
- Covered: the address is a chain-1 deployment in some registry file's `context.contract.deployments` (tests excluded). Searching the whole tree is wrong: Relay Depository and SwapRouter appear in other projects' test files as recipients and spenders. Where this disagrees with the dashboard's `inRegistry`, the script lists both. An address with only an EIP-712 deployment (Permit2) is not covered for calldata and is marked.
- Dropped automatically: unverified on Sourcify; plain tokens (98% or more of the transactions are ERC-20/721 calls, ERC-2612 `permit` or EIP-3009); bot traffic (90% or more in the `BOT` signature list: bundlers, LayerZero DVNs and executors, Across `fillRelay`, CoW `settle`, THORChain/Maya `transferOut`, sequencer batches, oracles). Bot functions are also subtracted from what is left ("human-side tx").
- Ranked by **usefulness of clear signing**, not traffic: human-side activity (distinct senders of the non-bot functions when `ENVIO_API_TOKEN` is set, with the one-time sender share beside it; otherwise human-side transactions) times how much a screen can say (1 for `full`, 0.5 for `partial`, from the table below). Contracts the table does not decide are listed separately by activity as **NEW**, because their screen has not been judged.
- Not yet in the score: how much is at stake per signature and how often hardware wallets sign it. Neither is measured (see Weak points).

## Decisions

Read by the script: one row per address, `keep` or `drop`, the screen (`full`: a screen can state everything that matters for any argument values; `partial`: only what is paid in, because the output is off-chain or in opaque data; `-` for drops), a name, a reason. A `drop` row removes the contract from the ranking; `keep` rows are ranked by usefulness: human-side activity times 1 (full) or 0.5 (partial). Tx counts in reasons are 7-day totals from the first pass (2026-10-27, top 500).

| Address | Decision | Screen | Name | Reason |
|---|---|---|---|---|
| `0xe592427a0aece92de3edee1f18e0157c05861564` | keep | full | Uniswap V3 SwapRouter | #3135 in review; `exactInputSingle`, `exactOutputSingle` |
| `0x4cd00e387622c35bddb9b4c962c136462338bc31` | keep | partial | Relay Depository | #3149 (draft); `depositNative`, `depositErc20` (~55k); `execute` (21.9k) likely solver-side |
| `0x00005ea00ac477b1030ce78506496e8c2de24bf5` | keep | full | SeaDrop | #3150 (draft); `mintPublic`, `mintSigned` |
| `0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5` | keep | partial | Across SpokePool | `depositV3`, `deposit` (~8k); `fillRelay` is relayers |
| `0x97ccdbea4632140639ad5ea9b944aa034eb15fd4` | drop | - | Across SpokePoolPeriphery | partial screen: `swapAndBridge` carries opaque swap calldata; `depositWithAuthorization` is mostly relayed (the user signs typed data, not the transaction); `depositNative` is better covered by the SpokePool (2026-10-27) |
| `0xd37bbe5744d730a1d98d8dc97c42f0ca46ad7146` | keep | full | THORChain Router | #3153 (draft); `depositWithExpiry` (~5k); `transferOut` is the vault |
| `0xc36442b4a4522e871399cd717abdd847ab11fe88` | keep | partial | Uniswap V3 NonfungiblePositionManager | `mint`, `increaseLiquidity`, `decreaseLiquidity`, `collect`; `multicall` stays blind |
| `0xc1d13492285eb664951e201bf7c80c7c6318a1b5` | keep | partial | SwftSwap | `swap`, `swapEth`; `withdraw` looks operator-side |
| `0x888888888889758f76e7103c6cbf23abbf58f946` | keep | partial | Pendle RouterV4 | 27 functions, large, high value |
| `0xd152f549545093347a162dce210e7293f1452150` | keep | full | Disperse | #3151 (draft); `disperseEther`, `disperseToken` |
| `0x59e16fccd424cc24e280be16e11bcd56fb0ce547` | keep | full | ENS ETHRegistrarController | #3152 (draft); `register`, `renew`, `commit` |
| `0x07964f135f276412b3182a3b2407b8dd45000000` | drop | - | TransitSwap RouterV5 | partial screen: `aggregate` (3.4k of 5.3k) is opaque; only the small `exactInputV2Swap`/`exactInputV3Swap` share would be clear (2026-10-27) |
| `0x1f21d09c65bc8af92634dcd5a100b6d04f0c81c3` | keep | full | Harbor Router | #3155 (draft). Not Maya Protocol's router: the verified source is `Harbor_RouterV5` ("managed by XNode Vaults"), and Maya's own API lists `0xe3985E6b61b814F7Cdb188766562ba71b446B46d` (MAYAChain_Router, ~1.1k tx/7d) as its Ethereum router |
| `0xba3cb449bd2b4adddbc894d8697f5170800eadec` | keep | full | CoW EthFlow | #3154 (draft); `createOrder` |
| `0xac4c6e212a361c968f1725b4d055b47e63f80b75` | keep | full | Sushi RedSnwapper | #3156 (draft); `snwap`, `snwapMultiple`; in, out and minimum are plain arguments |
| `0x45312ea0eff7e09c83cbe249fa1d7598c4c8cd4e` | drop | - | Curve Router v1.2 | cannot name the output: the route is 11 addresses padded with zeros, so the output token sits at a different index in each call, and no path can say "last nonzero" (2026-10-27) |
| `0x0ec68c5b10f21effb74f2a5c61dfe6b08c0db6cb` | keep | partial | OP-stack portal (chain to identify) | prove/finalize withdrawal; people and relayers mixed. Not OP Mainnet's portal (that is `0xbEb5Fc579115071764c7423A4f12eDde41f106Ed`, 820 tx/7d): OptimismPortal 1.10.0, systemConfig `0x5531DcfF39EC1ec727C4c5D2fc49835368F805a9` |
| `0x49048044d57e1c92a77f79988d21fa8faf74e97e` | keep | partial | Base portal | prove/finalize withdrawal; people and relayers mixed |
| `0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401` | drop | - | ENS NameWrapper | bot-led: 8 of 13 direct calls in 3,000 blocks came from one address (2026-10-27) |
| `0x881d40237659c251811cec9c364ef91dc08d300c` | drop | - | MetaMask MetaSwap | partial screen: output inside opaque adapter data |
| `0x0439e60f02a8900a951603950d8d4527f400c3f1` | drop | - | MetaMask MetaBridge | partial screen: output inside opaque adapter data |
| `0xccc88a9d1b4ed6b0eaba998850414b24f1c315be` | drop | - | Relay ApprovalProxyV3 | partial screen: transfers then an opaque multicall |
| `0x0000000000001ff3684f28c67538d4d072c22734` | drop | - | 0x AllowanceHolder | partial screen: `exec` forwards opaque data |
| `0x8feab81d36e7576107d5de0758c1b839be31b4f6` | drop | - | OKX DexRouter | partial screen: packed bytes routes |
| `0x89c6340b1a1f4b25d36cd8b063d49045caf3f818` | drop | - | LI.FI Permit2Proxy | partial screen: opaque diamond calldata |
| `0x69460570c93f9de5e2edbc3052bf10125f0ca22d` | drop | - | Rango | partial screen: generic bridge/swap payloads |
| `0x337685fdab40d39bd02028545a4ffa7d287cc3e2` | drop | - | Mayan Forwarder2 | partial screen: opaque protocol data |
| `0x1b6257cae4192e62b629efca21771be3d759183d` | drop | - | Decent UTB | partial screen: opaque bridge payloads |
| `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` | drop | - | Uniswap Universal Router | needs custom encoding (ERCs#1925) |
| `0x23617e59a5925b2a4bf75d73ff6711cd0b29de85` | drop | - | Uniswap Universal Router | needs custom encoding (ERCs#1925) |
| `0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca` | drop | - | Uniswap Universal Router | needs custom encoding (ERCs#1925) |
| `0x000000000004444c5dc75cb358380d2e3de08a90` | drop | - | Uniswap V4 PoolManager | callback (`unlock`), packed actions |
| `0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e` | drop | - | Uniswap V4 PositionManager | packed actions (`modifyLiquidities`) |
| `0x0000000000000068f116a894984e2db1123eb395` | drop | - | Seaport | later: complex orders, much of it EIP-712 |
| `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | drop | - | 1inch AquaRouter | later: semantics unknown |
| `0xca11bde05977b3631167028862be2a173976ca11` | drop | - | Multicall3 | not signed by people as a screen: arbitrary calls |
| `0x3a5cc8689d1b0cef2c317bc5c0ad6ce88b27d597` | drop | - | BitGo WalletSimple | custody infrastructure |
| `0x5af5194b4b0909eb978e3cf1e25333852277f07d` | drop | - | TKGasStation | 7702 gas station |
| `0xf67e35af6a18a01702e6c2f1e18a63c2fc3a528c` | drop | - | Tangem 7702 gasless EntryPoint | 7702 gas station |
| `0x30a88bf894d1b806125a23ebf23d715496fd7102` | drop | - | Pyth oracle | oracle pushes |
| `0xd90e2f925da726b50c4ed8d0fb90ad053324f31b` | drop | - | Tornado Router | not a target |

Unidentified proxies the first pass wanted a look at (still NEW): `0x94e7a5dcbe816e498b89ab752661904e2f56c485` (lending: `borrow`/`withdraw`/`repay`), `0x604dd02d620633ae427888d41bfd15e38483736e` (`deposit`/`withdraw`/`depositNative`), `0xbca3039a18c0d2f2f84ba8a028c67290bc045afa` (`withdrawV2`/`depositWithId`/`swapWithData`).

## Drop categories

The reasons behind the `drop` rows, for deciding new ones the same way.

- **Partial screens** (decision 2026-10-27): the output is inside opaque data, so a screen could show what is paid but not what is received, which is false for some values. Also deBridge's forwarder.
- **Needs a spec change:** Universal Router (custom encoding, ERCs#1925), Uniswap V4 PoolManager and PositionManager (packed actions).
- **Later:** Seaport, 1inch AquaRouter.
- **Not signed by people:** EntryPoints, LayerZero, rollup batch posting, oracles, CoW `settle` (all in the script's `BOT` list), Multicall3, BitGo `WalletSimple`, 7702 gas stations.
- **Plain tokens:** wallets build these from their trusted lists (#3130 Rule 2); dropped by the script.

## Weak points

1. Without `ENVIO_API_TOKEN`, transactions still overstate bot-heavy contracts whose bot functions are not in the `BOT` list (an unknown proxy with one `execute` caller). Sender counts fix that; nobody has run them yet (no token on 2026-10-27).
2. Ethereum mainnet only.
3. Hardware-wallet use is unmeasured; ask Ledger/Trezor or use Arik's analysis.
4. The dashboard lists at most 6 functions per contract, so the token and bot shares are computed over those; the tail is counted as human-side.
