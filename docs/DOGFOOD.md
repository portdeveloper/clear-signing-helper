# Dogfood: a real registry submission from the tool's output

Date: 2026-09-19. Project: [PuddleSwap](https://app.puddleswap.org), a Uniswap V2 fork on Monad testnet (chain 10143). Goal: take one contract from a deployed address to a registry pull request using only the CLI, and record what still needed a human.

## Deployer side: source verification

The tool refuses to bind an address whose source is not verified. Verification status before and after this exercise:

| Contract | Address | Before | After | Note |
| --- | --- | --- | --- | --- |
| StakingRewards | `0xe23B…97F1` | unverified | match | `forge verify-contract --verifier sourcify` from the repo build |
| WMON | `0x97B3…8943` | unverified | match | same |
| StableFaucet | `0x5095…6276` | unverified | match | same |
| TokenRegistry | `0x8228…461D` | unverified | unverified | bytecode length differs from current source; the source changed after deployment |
| UniswapV2Router02 | `0x430c…6660` | unverified | unverified | see below |

The router was deployed from this repository's own build (`forge inspect UniswapV2Router02 bytecode`, solc 0.6.6, 200 runs). Comparing on-chain code with the current artifact, every difference sits in the 54 immutable slots except one 32-byte constant: the pair init code hash in `lib/v2-periphery/contracts/libraries/UniswapV2Library.sol`. The repository carries Uniswap's upstream value `96e8ac42…8845f`; the deployed router embeds `354b5f81…126c96`, the hash of the pair bytecode as compiled in this repository. Setting that constant to the deployed value makes the source match and lets Sourcify verify it. That is a change to the deployer's repository and was not made here.

## Tool side: StakingRewards from address to bundle

```sh
clear-signing init --address 0xe23B3825F950637256e8DE1BF39743E8f29D97F1 --chain-id 10143 --owner PuddleSwap
# edit descriptor and clear-signing.toml (see below)
clear-signing fixture --name stake    --contract <id> --function 'stake(uint256)'    --args '["1000000000000000000"]' --chain-id 10143 --to 0xe23B…
clear-signing fixture --name withdraw --contract <id> --function 'withdraw(uint256)' --args '["500000000000000000"]'  --chain-id 10143 --to 0xe23B…
clear-signing fixture --name claim    --contract <id> --function 'getReward()' --chain-id 10143 --to 0xe23B…
clear-signing fixture --name exit     --contract <id> --function 'exit()'      --chain-id 10143 --to 0xe23B…
clear-signing preview --fixture clear-signing/fixtures/stake.json   # and the others
clear-signing review --accept && clear-signing test --update
clear-signing export --strict-portability --registry-runners --out bundle
```

What the tool derived: the ABI and NatSpec from the Sourcify match, the deployment binding, and every expected value in `testsv2`. Upstream `erc7730 format` and `lint` ran on the bundle (lint fetched the reference ABI from Sourcify and validated the fields; the six warnings are the intentionally excluded operator functions). Both registry implementations passed all four cases.

## What still needed a human

1. **Choosing the user-facing surface.** Ten write functions; four are user flows (`stake`, `withdraw`, `getReward`, `exit`). Six operator and role functions were excluded with a reason in `clear-signing.toml`.
2. **Intents.** NatSpec was present on four functions but only one notice fit the 30-character limit as an action ("Change the streaming window", an admin function). The user-facing intents were written by hand: "Stake LP tokens", "Withdraw LP tokens", "Claim rewards", "Withdraw and claim".
3. **Which token the amounts are in.** In ABI mode there is no AST or broadcast, so `metadata.constants` was not available. The LP token address came from `stakingToken()` on chain and from the deploy broadcast's constructor argument in the Foundry checkout; it was written as a literal `token` parameter.
4. **Fixture metadata.** The LP token's symbol and decimals (`UNI-V2`, 18) were read from chain with `cast` and typed into the fixtures.
5. **Verification itself.** Three `forge verify-contract` runs, plus the router diagnosis above.
6. **Registry conventions the tool did not yet cover.** `erc7730 format` rewrote the pretty-printed descriptor into the registry's compact style; export now runs it. The registry's advisory script recommends `interpolatedIntent` on every format; the tool does not author or validate interpolated intents.

## Registry submission

- Branch `puddleswap-staking-rewards` on `portdeveloper/clear-signing-erc7730-registry`, one commit, two files under `registry/puddleswap/`. Registry-side checks run locally: index buildable, `erc7730 lint` clean apart from excluded-function warnings, both schemas, both runners.
- Pull request: opened by the owner after review; result to be recorded here.
