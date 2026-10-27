# Top-contracts handoff

Who does which of the 20 top contracts (CLAUDE.md phase 5, `docs/TARGETS.md`). We author 10, and the 6 below go to a second contributor. Four more are dropped with reasons and should not be done. State on 2026-10-27.

## Done by us (10)

| Contract | PR |
|---|---|
| Uniswap V2 Router02 | [#3133](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3133) (merged) |
| Uniswap V3 SwapRouter | [#3135](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3135) (draft) |
| Relay Depository | [#3149](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3149) (draft) |
| SeaDrop | [#3150](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3150) (draft) |
| Disperse | [#3151](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3151) (draft) |
| ENS ETHRegistrarController | [#3152](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3152) (draft) |
| THORChain Router | [#3153](https://github.com/ethereum/clear-signing-erc7730-registry/pull/3153) (draft) |
| CoW EthFlow | in progress |
| Sushi RedSnwapper | in progress |
| Maya Router | in progress |

## Do not do (dropped, reasons in `docs/TARGETS.md`)

Across SpokePoolPeriphery, TransitSwap RouterV5, Curve Router v1.2 and ENS NameWrapper, plus the earlier "partial screen" and "needs a spec change" drops (MetaMask MetaSwap/MetaBridge, Relay ApprovalProxy, 0x AllowanceHolder, OKX DexRouter, LI.FI, Rango, Mayan, Decent, the Universal Routers, Uniswap V4, Seaport, 1inch AquaRouter).

## Handed off (6)

Each note says what we already know and where the judgment calls are. Everything here is from reading the verified source or the 7-day traffic on 2026-10-27; check it again before relying on it.

### 1. Across SpokePool, `0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5` (Ethereum)

- **Traffic:** about 8k user deposits a week (`depositV3`, `deposit`), plus 13.7k `fillRelay` calls from relayers.
- **It is a proxy.** `init --address` resolves it and binds the proxy.
- **Describe:** the deposit family (`deposit`, `depositV3`, `depositNow`, `depositV3Now`, `unsafeDeposit`) and `speedUpDeposit`/`speedUpV3Deposit`.
- **Exclude, with reasons:**
  - relayer functions: `fillRelay`, `fillV3Relay`, `fillRelayWithUpdatedDeposit`, `executeSlowRelayLeaf`, `executeRelayerRefundLeaf`, `claimRelayerRefund`, `requestSlowFill`;
  - HubPool and admin functions: `relayRootBundle`, `pause*`, `set*`, `upgradeTo*`, `emergencyDeleteRootBundle`, `executeExternalCall`, the adapter calls, `multicall`/`tryMulticall`.
- **`depositor` must be shown.** It is the account that can later speed up the deposit, which changes its output amount, recipient and message. If a dapp sets it to another account, that account can redirect the funds.
- **`outputAmount`** is in `outputToken`'s units on the *destination* chain. A wallet cannot know those decimals: USDC has 6 on Ethereum but 18 on BNB Chain, so scaling by the input token can be off by 10^12. Show it raw, labelled so it reads as raw units, or not at all.
- **A non-empty `message`** makes the recipient a handler contract that runs calls on arrival, so "to {recipient}" stops meaning where the funds end up. Recommended: pin `message` with `mustMatch: ["0x"]`. Deposits with destination actions then stay blind instead of showing a misleading recipient.
- **The `deposit`/`depositNow` variants take addresses as `bytes32`.** Check that the renderer and both registry runners display them before choosing `addressName`.
- **What cannot be shown:** the destination token and amount. Like Relay #3149, the screen can only say what is paid in.

### 2. Uniswap V3 NonfungiblePositionManager, `0xC36442b4a4522e871399cd717abdd847ab11fe88` (Ethereum)

- **Traffic:** about 7.8k transactions a week, but about half are `multicall`, which stays blind. The Uniswap app sends `multicall`, so the gain is in direct calls: `mint`, `increaseLiquidity`, `decreaseLiquidity`, `collect`, `burn`.
- **Lessons from #3133 and #3135 that apply directly:**
  - `amount0Desired`/`amount1Desired` are **maximums** the position may not fully use. Label them "Maximum …" and write "up to" in the sentence; `amount0Min`/`amount1Min` are minimums.
  - The payment helpers (`refundETH`, `sweepToken`, `unwrapWETH9`, `selfPermit*`) are the same code as SwapRouter #3135. Reuse its wording.
- **Two semantic traps:**
  - **`decreaseLiquidity` sends no tokens.** It only credits `tokensOwed`, and `collect` transfers them. Word it so the signer does not expect funds from the decrease itself.
  - **`collect` takes `amount0Max`/`amount1Max`,** usually `type(uint128).max` for "everything owed". Find out how such a value renders.
- **ERC-721 functions** (`transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll`, `permit`) move or approve a whole liquidity position. Show the token id with `nftName` (collection `@.to`) and the recipient or operator.

### 3. Pendle RouterV4, `0x888888888889758f76e7103c6cbf23abbf58f946` (Ethereum)

- **Size:** 27+ functions, large values per transaction, about 4.4k transactions a week. 1.4k of them are `multicall` (blind).
- **The key question, unverified:** does the router itself check the final output against the shown minimum (`minPtOut`, `minYtOut`, `minTokenOut`, `minLpOut`) after any aggregator swap in `TokenInput.swapData`/`TokenOutput.swapData`?
  - **If it does,** the screen "pay X of tokenIn, receive at least Y PT" is true whatever the swap data does, like RedSnwapper, and the screen is full.
  - **If it does not,** the screen is partial. Describe only the functions without aggregator data, or drop the contract.
- **`ApproxParams`** are search hints for the router's binary search. They are probably safe to hide with a reason, but confirm they cannot change the output beyond the minimum.

### 4. SwftSwap, `0xc1d13492285eb664951e201bf7c80c7c6318a1b5` (Ethereum)

- **Traffic:** a custodial cross-chain swap service, about 32k transactions a week. `withdraw`/`withdrawETH` (about 17k) look operator-side, so check who sends them.
- **The functions:** `swap(fromToken, toToken string, destination string, fromAmount, minReturnAmount)` and `swapEth(toToken, destination, minReturnAmount)`. The destination chain/token and address are strings, which is readable.
- **The trap:** `minReturnAmount` is probably not enforced on-chain, because the payout happens off-chain by the operator. If so, "at least" is a request, not a guarantee. Label it "Requested Minimum" (or similar) and say so in the PR.
- **Decide whether a custodial service belongs in the registry at all.** Ask the maintainers.

### 5. Base portal, `0x49048044D57e1C92A77f79988d21Fa8fAF74E97e` (Ethereum)

- **Version:** OptimismPortal 6.0.1. About 5k transactions a week: `proveWithdrawalTransaction`, `finalizeWithdrawalTransaction`, `finalizeWithdrawalTransactionExternalProof`, `depositTransaction`.
- **Withdrawals:** the withdrawal struct `(nonce, sender, target, value, gasLimit, data)` is readable. For an ETH withdrawal `data` is empty and the screen is full. For a token withdrawal `data` is an `L1StandardBridge` call, opaque to the wallet, so the screen is partial. The proof arguments are proof data and are hidden with a reason.
- **Relayers:** many prove/finalize calls are sent for users. Finalizing someone else's withdrawal pays them, not the sender, so word the screen around the withdrawal's `target` and `value`, not the signer.
- **`depositTransaction(to, value, gasLimit, isCreation, data)`** is the L1-to-L2 deposit.

### 6. OP-stack portal, `0x0ec68c5b10f21effb74f2a5c61dfe6b08c0db6cb` (Ethereum): identify the chain first

- **It is not OP Mainnet.** OP Mainnet's portal is `0xbEb5Fc579115071764c7423A4f12eDde41f106Ed`, with only about 820 transactions a week.
- **What we know:** this one is an OptimismPortal 1.10.0 with about 5.7k transactions a week, and its `systemConfig()` is `0x5531DcfF39EC1ec727C4c5D2fc49835368F805a9`. Find the chain in the Superchain registry before writing `metadata`.
- **Otherwise as Base,** but check the function set: 1.10.0 is older than Base's 6.0.1.

## Prompt for the contributor's agent

Needs clear-signing-helper **0.6.0-preview.6 or later** (the first release with `claims`); check with `clear-signing --version`. Paste this into a coding agent (Claude Code or similar), replacing `<CONTRACT>` with one entry above and pasting that entry's notes where marked. Do one contract per session.

```text
Write an ERC-7730 clear-signing descriptor for <CONTRACT> on Ethereum mainnet and open it as a DRAFT pull request to https://github.com/ethereum/clear-signing-erc7730-registry from my fork.

Use the clear-signing-helper CLI for everything it can derive, and follow its agent skill exactly:
- Install: npm install --global --ignore-scripts clear-signing-helper@preview (Node 22+). Foundry (anvil, cast) is needed for `claims`; uv/uvx for the registry linter; git, npm and cargo for the registry test runners.
- Skill (read it first, it has the authoring rules): https://raw.githubusercontent.com/portdeveloper/clear-signing-helper/main/.claude/skills/clear-signing-helper/SKILL.md
- Clone the registry: git clone https://github.com/ethereum/clear-signing-erc7730-registry.git and add my fork as a remote.

The rule that matters most: a dapp fills the arguments, so every sentence and amount on the screen must be true for ANY value of the arguments the screen does not explain. For each shown amount, find the require in the verified source that makes it true, and any argument that switches that check off; pin such an argument with mustMatch, or exclude the function. Label limits as limits ("Maximum ...", "Minimum ...", "up to", "at least"). Hide a field only with a reason that says why the signer does not need it. Exclude functions only bots, relayers, vaults or admins call, with a precise reason.

Steps (run each command from a new project directory):
1. clear-signing init --address <address> --chain-id 1 --owner "<protocol>" --registry <registry clone>
2. clear-signing decisions --contract <id>; fill the decisions file (set "author": "llm:<your model>"; intents and sentence templates <= 30 characters, labels <= 20 including hidden ones); clear-signing apply --decisions <file>. Do not hand-edit descriptor JSON except to wrap paired arrays in a {"iteration": "bundled"} group, which the decisions file cannot express.
3. clear-signing discover --contract <id> --rpc-url https://ethereum-rpc.publicnode.com (set ENVIO_API_TOKEN from envio.dev to search the whole chain); encode with clear-signing fixture --function only what has no real call, using a realistic sender.
4. clear-signing preview --fixture <file> for each fixture; read every screen as a signer would.
5. clear-signing claims --contract <id> --rpc-url <an endpoint with historical state, e.g. https://mainnet.gateway.tenderly.co or https://eth.drpc.org>: it replays the real transactions on a fork and varies hidden or raw arguments; read every finding against the source and fix the wording, pin with mustMatch, or exclude.
6. clear-signing review --accept; clear-signing test --update; clear-signing export --out bundle --strict-portability --registry-runners --registry <registry clone> --entity <slug>. Required: erc7730 lint 0 errors and both registry runners passing every case.
7. Copy bundle/registry/<slug> into the registry clone on a new branch, commit, push to my fork, and open a DRAFT PR.

PR body: state that it is a draft for the registry's top-contracts effort (sync call #3103) and NOT submitted by the protocol team; then Coverage (described and excluded functions with reasons), What the screens say (each judgment call with the source line that justifies it), Tests (which cases are real transactions with txHash, which are encoded and why), Checks (lint pin, runner pins, pass counts). Follow the structure of https://github.com/ethereum/clear-signing-erc7730-registry/pull/3151. Never claim anything you did not verify.

What we already know about this contract (verify before relying on it):
<paste the contract's notes from docs/HANDOFF-TARGETS.md>
```
