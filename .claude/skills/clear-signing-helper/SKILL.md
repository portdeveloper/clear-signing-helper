---
name: clear-signing-helper
description: Create or extend an ERC-7730 clear-signing descriptor for a smart contract on any EVM chain, verify it on-chain, validate it, and prepare a PR to the ethereum/clear-signing-erc7730-registry. Use when someone wants their contract's transactions or signed messages to render as human-readable text in wallets (Ledger and others) instead of raw hex, wants to add clear signing, write an ERC-7730 descriptor, or add their chain or contract to the clear signing registry.
---

# Clear signing descriptor (ERC-7730)

Turn a smart contract into a reviewed, validated ERC-7730 descriptor plus a ready-to-open PR to the registry, so its calls and signed messages render as plain language in supporting wallets instead of a wall of hex.

ERC-7730 is chain-agnostic. This works for any EVM chain and any contract, not just one project.

The authoritative spec and build guide is the Ethereum Foundation's https://clearsigning.org/build/ and the ERC-7730 EIP. Defer to them for schema questions; this skill is the agent-runnable workflow on top of that standard.

## Inputs to collect first

Ask for whatever is missing before starting:
- Contract address and chain id.
- Owner / protocol name (used in `metadata.owner` and the registry folder).
- An RPC URL for the chain (for on-chain verification).
- The ABI, or a way to get it: a verified contract on the chain's explorer, or the project's source.
- Whether to open the PR or stop at a draft. Default is to stop at a draft (see step 8).

## Procedure

### 1. Check the registry FIRST (the highest-leverage step)
Most well-known protocols already have a descriptor and are only missing a chain. When that is the case the change is one line, not a new file, and it merges easily.
- Search for the contract address and the protocol name: `scripts/find-in-registry.sh <address-or-name> <path-to-registry-clone>`. No local clone? Search the registry on GitHub instead (browse `registry/<owner>/` or use GitHub code search for the address).
- If a descriptor exists and only the chain is missing, add `{ "chainId": <id>, "address": "<addr>" }` to that file's `context.contract.deployments` array and stop. The display formats are chain-agnostic and carry over unchanged. This is exactly how Permit2 and Morpho reached new chains.
- Only author a new descriptor if none exists.

### 2. Verify the address on-chain (never trust an address you were handed)
- First get the candidate address from the protocol's own deployment source: their docs, an addresses file in their GitHub, or their API. Do not assume a same-address-on-every-chain vanity address is deployed on your chain; it often is not.
- `scripts/verify-address.sh <chainId> <address> <rpcUrl> [eip712Name] [eip712Version]`.
- It confirms there is bytecode at the address, then matches the live `DOMAIN_SEPARATOR()` against the EIP-712 domain shapes in use (2-field with no name like Morpho, 3-field with a name like Permit2, 4-field with name and version like most tokens) and reports which matched. The 2-field check runs even with no name, so pass the name and version when you have them. A match is proof the address is the contract you think it is.
- If the contract has no domain getter, call an identifying view function instead and confirm it responds.

### 3. Generate (only when authoring from scratch)
`uvx erc7730 generate --chain-id <id> --address <addr> --abi ./abi.json --owner "<Owner>"`
Get the ABI from the verified contract (Etherscan V2 multichain API with `ETHERSCAN_API_KEY`, addressed by chain id) or the project source.

### 4. Write human-readable intents and labels (the part that needs judgment)
This is what makes a descriptor good. For each function or signed message:
- `intent`: the action in plain language, like "Approve USDC", "Supply collateral", "Swap exact tokens". Keep it 30 characters or fewer; Ledger devices truncate longer text.
- Label every field a user should see: which parameter is the token, the amount, the spender, the recipient, the deadline.
- Pick the right format: `tokenAmount` for amounts (set `tokenPath` when the token address is another field in the same call), `addressName` for addresses (with `params.types`), `amount` for native value, a percentage for rates, `raw` only as a last resort.
- Mark the fields that matter `"visible": "always"`.
Base every label on real contract semantics. Read the ABI parameter names and any NatSpec. If a parameter's meaning is unclear, look at the source or ask. Do not guess.

### 5. Know the gotchas
- Inline ABI: embed `context.contract.abi` to make the descriptor self-contained. The lint "could not fetch ABI" warning (no `ETHERSCAN_API_KEY`) is harmless and appears on any chain.
- EIP-712 domains vary: read the exact domain from the contract. Most use `name, version, chainId, verifyingContract`; some omit `version` (Permit2) or `name` (Morpho). Get it right or the signed message will not match.
- Nested or arbitrary calldata cannot be statically decoded: multicall, `batch`, router `execute`, connector `call`/`batch`, permit-with-`data`. Cover the functions that decode cleanly and state plainly which you left out. Never ship a descriptor that renders a half-empty screen and call it done.

### 6. Validate
`uvx erc7730 lint <file>`. Fix real issues. The no-API-key ABI warning, and warnings inherited from an existing upstream descriptor, are acceptable. Re-check that every intent is 30 characters or fewer.

### 7. Preview
See the render before shipping: the Sourcify live preview, or `uvx erc7730 calldata --chain-id <id> <file>` for the device payload.

### 8. PR step (default: stop at a draft)
- The file belongs at `registry/<owner>/<calldata|eip712>-<Name>.json`.
- DEFAULT: do NOT open the PR. Output the validated file, the target path, and the exact `git`/`gh` commands, and tell the user to open the PR from an account tied to the contract owner (maintainers may ask for proof of ownership).
- Only if the user explicitly opts in to opening the PR: show the full diff, confirm, then open it.
- Why: descriptors are owned by the protocol, ownership is checked at review, and auto-opening agent PRs burdens registry maintainers. A human gate and quality beat speed here.

## Quality bar
- Prefer the minimal change: adding a chain to an existing descriptor beats a new file every time.
- One descriptor reviewed by someone who knows the contract beats ten machine-guessed ones.
- If you bounded coverage (skipped nested calldata, omitted a function), say so out loud.

## Reference examples
The registry is the best reference. Look at `registry/uniswap/` for EIP-712 and multi-chain deployments, `registry/morpho/` for a calldata descriptor with nested structs, and any `eip712-*.json` for signed-message descriptors. Match the conventions and the `$schema` path of the folder you write into.
