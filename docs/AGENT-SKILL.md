# clear-signing-helper

An agent skill that makes any smart contract's transactions and signed messages human-readable in wallets. It creates or extends an [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear-signing descriptor and prepares a PR to the [clear signing registry](https://github.com/ethereum/clear-signing-erc7730-registry).

## Use it

Paste this into your coding agent (Claude Code, Cursor, and others):

```text
read https://github.com/portdeveloper/clear-signing-helper and use it to make my contract clear-signable: <address> on <chain>
```

It checks the registry, generates the draft from verified source or your Foundry build, asks only for the decisions a human must make, and preps the PR for you to review.

Prefer it as a standing skill? Install with `npx skills add portdeveloper/clear-signing-helper`.

## What it does

Point it at a contract (address + chain) or a Foundry repository and it will:

- check whether the registry already has a descriptor, since often you only need to add your chain; then `clear-signing registry add-deployment` proves the address is the same contract, appends the deployment and renders the test case
- otherwise generate a draft with `clear-signing init`, from Foundry artifacts (NatSpec, enums, constructor constants, broadcast deployments) or from the verified source at an address (Sourcify, proxies resolved)
- ask you only for what the ABI cannot prove: intent wording, which token an amount is in, which arguments to hide, and record those decisions
- encode fixtures, preview the rendering, snapshot expectations, and export a bundle laid out for the registry and checked by the registry's own linter
- prepare the PR, stopping at a reviewed draft by default (opening the PR is opt-in)

ERC-7730 is chain-agnostic, so this is not specific to any one chain or project. It works for any EVM chain and any contract.

## Beyond Claude Code

The skill is a plain playbook over the `clear-signing` CLI, plus two bash scripts: `find-in-registry.sh` to search a registry clone, and `verify-address.sh` to match a live `DOMAIN_SEPARATOR()` while authoring a new EIP-712 descriptor, which the CLI does not cover (adding a chain to an existing one goes through `registry add-deployment --rpc-url`). The logic carries over to any agent or to a human following along by hand.

## Links

- Official build guide (Ethereum Foundation): https://clearsigning.org/build/
- Clear signing guide (Monad): https://docs.monad.xyz/guides/clear-signing
- Registry: https://github.com/ethereum/clear-signing-erc7730-registry
- ERC-7730 spec: https://eips.ethereum.org/EIPS/eip-7730
