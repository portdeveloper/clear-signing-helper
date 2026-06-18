# clear-signing-helper

An agent skill that makes any smart contract's transactions and signed messages human-readable in wallets. It creates or extends an [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear-signing descriptor and prepares a PR to the [clear signing registry](https://github.com/ethereum/clear-signing-erc7730-registry).

## Use it

Paste this into your coding agent (Claude Code, Cursor, and others):

```text
read https://github.com/portdeveloper/clear-signing-helper and use it to make my contract clear-signable: <address> on <chain>
```

It checks the registry, drafts the descriptor, verifies the address on-chain, and preps the PR for you to review.

Prefer it as a standing skill? Install with `npx skills add portdeveloper/clear-signing-helper`.

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

- Official build guide (Ethereum Foundation): https://clearsigning.org/build/
- Clear signing guide (Monad): https://docs.monad.xyz/guides/clear-signing
- Registry: https://github.com/ethereum/clear-signing-erc7730-registry
- ERC-7730 spec: https://eips.ethereum.org/EIPS/eip-7730
