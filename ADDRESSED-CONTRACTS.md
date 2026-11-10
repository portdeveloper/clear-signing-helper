# Contracts already addressed (done or skipped)

Every Ethereum mainnet contract from the [Sourcify clear-signing dashboard](https://erc7730.sourcify.dev/) that we have looked at, with the outcome, so nobody retries one that is done or cannot be covered.

- **Checked:** 2026-11-10, against registry master `b021a8d` and the dashboard's 24h ranking (`window=24h&limit=25&exclude=eth,token,unverified,infra`).
- **To filter a list:** use the CSV at the bottom (lowercase addresses, one per line). Drop every row whose status is `done`, `skip` or `in-progress`. Rows marked `open` are free to take.
- **Source of the decisions:** `docs/TARGETS.md` (read by `scripts/rank-targets.ts`); per-contract records are in `docs/DOGFOOD.md`.

## Summary

| Status | Count | Meaning |
|---|---|---|
| done | 18 | A descriptor is merged in the registry |
| in-progress | 1 | Our PR is open |
| skip | 29 | Cannot be covered today, or not ours to author |
| open | 5 | Looked at, not decided or not started |

53 addresses in total.

## Done: merged in the registry (18)

"Left blind" lists functions deliberately not described. Do not retry those either unless the reason has gone away.

| Address | Contract | PR | Registry file | Left blind, and why |
|---|---|---|---|---|
| `0x7a250d5630b4cf539739df2c5dacb4c659f2488d` | Uniswap V2 Router02 | #3133 | `uniswap/calldata-UniswapV2Router02.json` | Nothing |
| `0xe592427a0aece92de3edee1f18e0157c05861564` | Uniswap V3 SwapRouter | #3135 | `uniswap/calldata-UniswapV3SwapRouter.json` | `exactInput`, `exactOutput`: the last token of a packed path can be spoofed (registry #3136). `multicall`: nested calldata |
| `0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45` | Uniswap SwapRouter02 | #3146 (fix to Uniswap's file) | `uniswap/calldata-UniswapV3Router02.json` | `exactInput`, `exactOutput` removed for #3136. `multicall` (about half the traffic): nested calldata |
| `0x4cd00e387622c35bddb9b4c962c136462338bc31` | Relay Depository | #3149 | `relay/calldata-RelayDepository.json` | `execute`: solver-side |
| `0x00005ea00ac477b1030ce78506496e8c2de24bf5` | SeaDrop | #3150 | `opensea/calldata-SeaDrop.json` | Nothing in the top functions |
| `0xd152f549545093347a162dce210e7293f1452150` | Disperse | #3151 | `disperse/calldata-Disperse.json` | Nothing |
| `0x59e16fccd424cc24e280be16e11bcd56fb0ce547` | ENS ETHRegistrarController | #3152 | `ens/calldata-ETHRegistrarController.json` | Nothing in the top functions |
| `0xd37bbe5744d730a1d98d8dc97c42f0ca46ad7146` | THORChain Router | #3153 | `thorchain/calldata-THORChainRouter.json` | `transferOut`: called by the vault, not by people |
| `0xba3cb449bd2b4adddbc894d8697f5170800eadec` | CoW Swap EthFlow | #3154 | `cow-protocol/calldata-CoWSwapEthFlow.json` | Nothing in the top functions |
| `0x1f21d09c65bc8af92634dcd5a100b6d04f0c81c3` | Harbor Router (not Maya's router) | #3155 | `harbor/calldata-HarborRouterV5.json` | Nothing in the top functions |
| `0xac4c6e212a361c968f1725b4d055b47e63f80b75` | Sushi RedSnwapper | #3156 | `sushi/calldata-RedSnwapper.json` | Nothing in the top functions |
| `0x0000000000000068f116a894984e2db1123eb395` | Seaport 1.6 | #3177 | `opensea/calldata-Seaport-1.6.json` | Buy direction only. Accepting offers, `fulfillAvailableAdvancedOrders` (sweeps), `matchAdvancedOrders`, `validate`, and the items inside `cancel`: nested order arrays fail both registry runners (waits on registry #3091) |
| `0xc1d13492285eb664951e201bf7c80c7c6318a1b5` | SwftSwap | #3171 (Manuel) | `swft/calldata-SwftSwap.json` | `withdraw`, `withdrawETH`: looked operator-side, not verified by us |
| `0x0ec68c5b10f21effb74f2a5c61dfe6b08c0db6cb` | Blast OptimismPortal | #3172 (Manuel) | `blast/calldata-OptimismPortal.json` | Not checked by us |
| `0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5` | Across SpokePool | #3173 (Manuel) | `across/calldata-Ethereum_SpokePool.json` | `fillRelay`, `fillV3Relay`: relayers only |
| `0x49048044d57e1c92a77f79988d21fa8faf74e97e` | Base OptimismPortal2 | #3174 (Manuel) | `base/calldata-OptimismPortal2.json` | Not checked by us |
| `0xc36442b4a4522e871399cd717abdd847ab11fe88` | Uniswap V3 NonfungiblePositionManager | #3175 (Manuel) | `uniswap/calldata-UniswapV3NonfungiblePositionManager.json` | `multicall`: nested calldata |
| `0x888888888889758f76e7103c6cbf23abbf58f946` | Pendle RouterV4 | #3176 (Manuel) | `pendle/calldata-PendleRouterV4.json` | Not checked by us |

SwapRouter02 was already in the registry; our PR fixed its file. Other top-25 contracts were in the registry before this work and are not listed here (1inch AggregationRouterV6, LI.FI Diamond, WETH9, Aave Pool, KyberSwap MetaAggregationRouterV2); the dashboard's `inRegistry` flag catches them.

## In progress (1)

| Address | Contract | PR | State |
|---|---|---|---|
| `0x881d40237659c251811cec9c364ef91dc08d300c` | MetaMask MetaSwap | #3205 (draft) | A pinned subset: `feeOnTop` must be 0 and `aggregatorId` one of 4, about a third of swaps when measured on 2026-11-06. Waits on an AI review |

## Skipped: cannot be covered today (29, plus MetaBridge, which is also under "Open")

"Retry when" says what would have to change. If it says "no", the contract is not a target at all.

### Needs a spec change

| Address | Contract | Reason | Retry when |
|---|---|---|---|
| `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` | Uniswap Universal Router | `execute(commands, inputs, deadline)`: each input's layout depends on a command byte, which a descriptor cannot express | Custom encoding lands (ERCs#1925) |
| `0x23617e59a5925b2a4bf75d73ff6711cd0b29de85` | Uniswap Universal Router | Same | Same |
| `0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca` | Uniswap Universal Router | Same | Same |
| `0x000000000004444c5dc75cb358380d2e3de08a90` | Uniswap V4 PoolManager | Callback (`unlock`) with packed actions | Same |
| `0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e` | Uniswap V4 PositionManager | Packed actions (`modifyLiquidities`) | Same |

### Opaque payload: the screen could show what is paid but not what is received

| Address | Contract | Reason | Retry when |
|---|---|---|---|
| `0x0439e60f02a8900a951603950d8d4527f400c3f1` | MetaMask MetaBridge | Output inside adapter data | **Worth a re-check**, see "Open" below |
| `0x5567954cd026cebfe486062cb75848e0f1c12e58` | Relay ApprovalProxy | Transfers, then an arbitrary multicall | Nested calldata is supported |
| `0xccc88a9d1b4ed6b0eaba998850414b24f1c315be` | Relay ApprovalProxyV3 | Same | Same |
| `0x0729e2a4716d9f7dd17858d5d504426d228697f7` | Relay RelayRouter | `multicall` of arbitrary calls | Same |
| `0x0000000000001ff3684f28c67538d4d072c22734` | 0x AllowanceHolder | `exec` forwards opaque data | Same |
| `0x89c6340b1a1f4b25d36cd8b063d49045caf3f818` | LI.FI Permit2Proxy | Opaque diamond calldata | Same |
| `0x69460570c93f9de5e2edbc3052bf10125f0ca22d` | Rango | Generic bridge and swap payloads | Same |
| `0x337685fdab40d39bd02028545a4ffa7d287cc3e2` | Mayan Forwarder2 | Opaque protocol data | Same |
| `0x1b6257cae4192e62b629efca21771be3d759183d` | Decent UTB | Opaque bridge payloads | Same |
| `0x97ccdbea4632140639ad5ea9b944aa034eb15fd4` | Across SpokePoolPeriphery | `swapAndBridge` carries opaque swap calldata; `depositWithAuthorization` is mostly relayed | Same |
| `0x07964f135f276412b3182a3b2407b8dd45000000` | TransitSwap RouterV5 | `aggregate` (most of the traffic) is opaque | Same |
| `0x45312ea0eff7e09c83cbe249fa1d7598c4c8cd4e` | Curve Router v1.2 | The output token sits at a different index of the route in each call; no path can say "last nonzero" | The format gains such a path |

### Source not verified, so the code cannot be read and lint fails

| Address | Contract | Reason | Retry when |
|---|---|---|---|
| `0xb300000b72deaeb607a12d5f54773d1c19c7028d` | Diamond (one selector, `0x810c705b`) | The facet serving it, `0xf4351fe8260d9a4dd58f687379e9ae1ebc68f277`, is not on Sourcify (checked 2026-11-10) | The facet is verified |
| `0x3328f7f4a1d1c57c35df56bbf0c9dcafca309c49` | TransparentUpgradeableProxy (`swapETHForExactTokens`) | Implementation `0x35fC…B34E` unverified on Sourcify and Blockscout. Traffic is human | The implementation is verified |
| `0xab830fcccb4f20bad23b7669d58cb35a96d57d5a` | ERC1967Proxy (`rebalance`) | Implementation unverified, and bot traffic (141 tx from 2 senders in 600 blocks) | No |

### Not signed by people, or not a target

| Address | Contract | Reason | Retry when |
|---|---|---|---|
| `0xda7afeed021eafc1c1af9c362de477dad0396b81` | PrioUpdateRegistry | Bot: `updateState` pushes | No |
| `0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401` | ENS NameWrapper | Bot-led in a small sample (8 of 13 calls from one address). The weakest drop here | 7-day sender counts show people |
| `0xca11bde05977b3631167028862be2a173976ca11` | Multicall3 | Arbitrary calls | No |
| `0x3a5cc8689d1b0cef2c317bc5c0ad6ce88b27d597` | BitGo WalletSimple | Custody infrastructure | No |
| `0x5af5194b4b0909eb978e3cf1e25333852277f07d` | TKGasStation | EIP-7702 gas station | No |
| `0xf67e35af6a18a01702e6c2f1e18a63c2fc3a528c` | Tangem 7702 gasless EntryPoint | EIP-7702 gas station | No |
| `0x30a88bf894d1b806125a23ebf23d715496fd7102` | Pyth oracle | Oracle pushes | No |
| `0xd90e2f925da726b50c4ed8d0fb90ad053324f31b` | Tornado Router | Not a target | No |
| `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a` | 1inch AquaRouter | Semantics not understood yet | Someone reads the source |

### Not ours to author

| Address | Contract | Reason | Retry when |
|---|---|---|---|
| `0x8feab81d36e7576107d5de0758c1b839be31b4f6` | OKX DexRouter v1.0.10 | OKX opened registry #2887 for this address; open and untouched since 2026-08-24 | OKX abandons it. It is describable: `dagSwapTo`/`smartSwapTo` name `toToken` and `minReturnAmount` |

## Open: looked at, free to take (5)

| Address | Contract | What we know |
|---|---|---|
| `0x19993b3cf15c1055063468eb932f5e335a7526ea` | PangeaOFTV3 | Looks coverable. `send` (794 tx/day) is the standard LayerZero OFT send; the registry already formats that selector in `tether/calldata-usdt0-OFT-Flare.json` and `flare/calldata-FXRP-OFT-Flare.json`. `poke()` (2,278 tx/day) takes no arguments and may be bot traffic. Source not read yet |
| `0x0439e60f02a8900a951603950d8d4527f400c3f1` | MetaMask MetaBridge | Dropped as opaque, but it has the same `(string, address, uint256, bytes)` shape as MetaSwap, whose drop turned out to be wrong (fixed offsets inside `data`). Not re-checked; needs the adapters read and fork replays |
| `0x94e7a5dcbe816e498b89ab752661904e2f56c485` | Unidentified proxy | Lending: `borrow`, `withdraw`, `repay`. Not identified |
| `0x604dd02d620633ae427888d41bfd15e38483736e` | Unidentified proxy | `deposit`, `withdraw`, `depositNative`. Not identified |
| `0xbca3039a18c0d2f2f84ba8a028c67290bc045afa` | Unidentified proxy | `withdrawV2`, `depositWithId`, `swapWithData`. Not identified |

MetaBridge appears in both "Skipped" and "Open": the recorded decision is a drop, and the re-check is a suggestion. In the CSV it is `open`.

## Whole categories to filter before looking at a contract

These never reached a per-contract decision, so they are not in the CSV. `scripts/rank-targets.ts` drops them automatically.

- **Unverified on Sourcify.** Lint runs with `--require-verified`.
- **Plain tokens:** 98% or more of the traffic is ERC-20/721 calls, ERC-2612 `permit` or EIP-3009 (USDC, USDT and so on). Wallets build these from their trusted token lists (registry #3130, rule 2).
- **Bot traffic:** 90% or more in bundler `handleOps`, LayerZero DVN or executor calls, Across `fillRelay`, CoW `settle`, THORChain or Maya `transferOut`, sequencer batch posting, oracle updates. The exact signatures are the `BOT` list in `scripts/rank-targets.ts`.
- **Already in the registry:** check the address against `context.contract.deployments` in a registry clone, not the whole tree (test files name other contracts as recipients and spenders) and not only the dashboard's `inRegistry` flag, which lags.

## CSV

```csv
address,status,name,ref
0x7a250d5630b4cf539739df2c5dacb4c659f2488d,done,Uniswap V2 Router02,#3133
0xe592427a0aece92de3edee1f18e0157c05861564,done,Uniswap V3 SwapRouter,#3135
0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45,done,Uniswap SwapRouter02,#3146
0x4cd00e387622c35bddb9b4c962c136462338bc31,done,Relay Depository,#3149
0x00005ea00ac477b1030ce78506496e8c2de24bf5,done,SeaDrop,#3150
0xd152f549545093347a162dce210e7293f1452150,done,Disperse,#3151
0x59e16fccd424cc24e280be16e11bcd56fb0ce547,done,ENS ETHRegistrarController,#3152
0xd37bbe5744d730a1d98d8dc97c42f0ca46ad7146,done,THORChain Router,#3153
0xba3cb449bd2b4adddbc894d8697f5170800eadec,done,CoW Swap EthFlow,#3154
0x1f21d09c65bc8af92634dcd5a100b6d04f0c81c3,done,Harbor Router,#3155
0xac4c6e212a361c968f1725b4d055b47e63f80b75,done,Sushi RedSnwapper,#3156
0x0000000000000068f116a894984e2db1123eb395,done,Seaport 1.6,#3177
0xc1d13492285eb664951e201bf7c80c7c6318a1b5,done,SwftSwap,#3171
0x0ec68c5b10f21effb74f2a5c61dfe6b08c0db6cb,done,Blast OptimismPortal,#3172
0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5,done,Across SpokePool,#3173
0x49048044d57e1c92a77f79988d21fa8faf74e97e,done,Base OptimismPortal2,#3174
0xc36442b4a4522e871399cd717abdd847ab11fe88,done,Uniswap V3 NonfungiblePositionManager,#3175
0x888888888889758f76e7103c6cbf23abbf58f946,done,Pendle RouterV4,#3176
0x881d40237659c251811cec9c364ef91dc08d300c,in-progress,MetaMask MetaSwap,#3205
0x66a9893cc07d91d95644aedd05d03f95e1dba8af,skip,Uniswap Universal Router,custom encoding
0x23617e59a5925b2a4bf75d73ff6711cd0b29de85,skip,Uniswap Universal Router,custom encoding
0x4c82d1fbfe28c977cbb58d8c7ff8fcf9f70a2cca,skip,Uniswap Universal Router,custom encoding
0x000000000004444c5dc75cb358380d2e3de08a90,skip,Uniswap V4 PoolManager,custom encoding
0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e,skip,Uniswap V4 PositionManager,custom encoding
0x5567954cd026cebfe486062cb75848e0f1c12e58,skip,Relay ApprovalProxy,opaque
0xccc88a9d1b4ed6b0eaba998850414b24f1c315be,skip,Relay ApprovalProxyV3,opaque
0x0729e2a4716d9f7dd17858d5d504426d228697f7,skip,Relay RelayRouter,opaque
0x0000000000001ff3684f28c67538d4d072c22734,skip,0x AllowanceHolder,opaque
0x89c6340b1a1f4b25d36cd8b063d49045caf3f818,skip,LI.FI Permit2Proxy,opaque
0x69460570c93f9de5e2edbc3052bf10125f0ca22d,skip,Rango,opaque
0x337685fdab40d39bd02028545a4ffa7d287cc3e2,skip,Mayan Forwarder2,opaque
0x1b6257cae4192e62b629efca21771be3d759183d,skip,Decent UTB,opaque
0x97ccdbea4632140639ad5ea9b944aa034eb15fd4,skip,Across SpokePoolPeriphery,opaque
0x07964f135f276412b3182a3b2407b8dd45000000,skip,TransitSwap RouterV5,opaque
0x45312ea0eff7e09c83cbe249fa1d7598c4c8cd4e,skip,Curve Router v1.2,output not addressable
0xb300000b72deaeb607a12d5f54773d1c19c7028d,skip,Diamond 0x810c705b,facet unverified
0x3328f7f4a1d1c57c35df56bbf0c9dcafca309c49,skip,TransparentUpgradeableProxy swapETHForExactTokens,implementation unverified
0xab830fcccb4f20bad23b7669d58cb35a96d57d5a,skip,ERC1967Proxy rebalance,bot and unverified
0xda7afeed021eafc1c1af9c362de477dad0396b81,skip,PrioUpdateRegistry,bot
0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401,skip,ENS NameWrapper,bot-led (weak)
0xca11bde05977b3631167028862be2a173976ca11,skip,Multicall3,not a target
0x3a5cc8689d1b0cef2c317bc5c0ad6ce88b27d597,skip,BitGo WalletSimple,not a target
0x5af5194b4b0909eb978e3cf1e25333852277f07d,skip,TKGasStation,not a target
0xf67e35af6a18a01702e6c2f1e18a63c2fc3a528c,skip,Tangem 7702 gasless EntryPoint,not a target
0x30a88bf894d1b806125a23ebf23d715496fd7102,skip,Pyth oracle,bot
0xd90e2f925da726b50c4ed8d0fb90ad053324f31b,skip,Tornado Router,not a target
0x1111113ccf1426a8e30e2bff5e005d929bf6a90a,skip,1inch AquaRouter,semantics unknown
0x8feab81d36e7576107d5de0758c1b839be31b4f6,skip,OKX DexRouter v1.0.10,OKX's own #2887
0x19993b3cf15c1055063468eb932f5e335a7526ea,open,PangeaOFTV3,looks coverable
0x0439e60f02a8900a951603950d8d4527f400c3f1,open,MetaMask MetaBridge,re-check the opaque drop
0x94e7a5dcbe816e498b89ab752661904e2f56c485,open,Unidentified proxy (lending),not identified
0x604dd02d620633ae427888d41bfd15e38483736e,open,Unidentified proxy (deposit),not identified
0xbca3039a18c0d2f2f84ba8a028c67290bc045afa,open,Unidentified proxy (swapWithData),not identified
