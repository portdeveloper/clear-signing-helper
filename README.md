# ERC-7730 coverage skill

An agent skill for writing [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) clear-signing descriptors for the most-used contracts on Ethereum mainnet and opening them as draft PRs in the [clear-signing registry](https://github.com/ethereum/clear-signing-erc7730-registry), so wallets show those transactions as readable text instead of hex.

The skill is one file: [SKILL.md](SKILL.md).

## Use it

Paste into Claude Code or another coding agent:

```
read https://raw.githubusercontent.com/portdeveloper/clear-signing-helper/main/SKILL.md and follow it to cover the next uncovered contracts of the ranking
```

Or install it as a skill:

```
git clone https://github.com/portdeveloper/clear-signing-helper ~/.claude/skills/erc7730-coverage
```

The agent needs `git`, `gh`, `uvx`, Node, `cargo` and Foundry's `cast`.

## What is in it

- How to pick contracts from the [Sourcify ranking](https://erc7730.sourcify.dev) and which to skip.
- Rules for the screen: what the sentence must name, which arguments to pin, label and intent lengths.
- How to build the test file from real transactions.
- The registry's own checks (linter and both test runners) and how to run them before pushing.
- How to label and describe a PR for a contract you do not own.

The rules come from the reviews of about 40 registry PRs written this way. [ADDRESSED-CONTRACTS.md](ADDRESSED-CONTRACTS.md) lists contracts already looked at, with the reason for each skip (as of 2026-11-10).

## Status

One blind run on 2026-11-27: an agent given only the skill produced a descriptor and test file that passed the linter (0 errors) and both runners in about 20 minutes. What it tripped on was added to the skill afterwards; the changed skill has not been run again.

A descriptor in the registry is not an audit, and neither is this skill.

## The CLI

Until 2026-11-27 this repository was `clear-signing-helper`, a CLI that derives descriptors and tests from an ABI. It is on the [`tool` branch](https://github.com/portdeveloper/clear-signing-helper/tree/tool) and on [npm](https://www.npmjs.com/package/clear-signing-helper) (`0.6.0-preview.9`), and is not being developed further for now. With current models, a plain agent wrote descriptors as correct as the agent with the tool, so the instructions moved into a skill.

MIT licensed.
