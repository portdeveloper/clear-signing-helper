# clear-signing-helper

An agent skill that makes any smart contract's transactions and signed messages human-readable in wallets. It creates or extends an [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear-signing descriptor and prepares a PR to the [clear signing registry](https://github.com/ethereum/clear-signing-erc7730-registry).

## Install

```
npx skills add portdeveloper/clear-signing-helper
```

Works with Claude Code, Cursor, and other agents that read the skills format.

## What it does

Point it at a contract (address + chain) and it will:

- check whether the registry already has a descriptor, since often you only need to add your chain (a one-line change)
- verify the contract address on-chain before trusting it
- generate and label a descriptor so calls render as plain language like "Approve 1,000 USDC to ..." instead of a wall of hex
- lint and preview the result
- prepare the PR, stopping at a reviewed draft by default (opening the PR is opt-in)

ERC-7730 is chain-agnostic, so this is not specific to any one chain or project. It works for any EVM chain and any contract.

## Beyond Claude Code

The skill is a plain playbook plus two bash scripts (`verify-address.sh`, `find-in-registry.sh`), so the logic carries over to any agent or to a human following along by hand.

## Links

- Clear signing guide: https://docs.monad.xyz/guides/clear-signing
- Registry: https://github.com/ethereum/clear-signing-erc7730-registry
- ERC-7730 spec: https://eips.ethereum.org/EIPS/eip-7730
