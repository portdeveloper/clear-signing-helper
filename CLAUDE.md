# CLAUDE.md

This repository is one agent skill, [SKILL.md](SKILL.md): how to write ERC-7730 calldata descriptors for the most-used uncovered contracts on Ethereum mainnet and open them as draft PRs in the [clear-signing registry](https://github.com/ethereum/clear-signing-erc7730-registry). Keep this file current.

## Why it is a skill (2026-11-27)

Until 2026-11-27 `main` was `clear-signing-helper`, a CLI that derived descriptors and tests from an ABI. What was measured:

- A replay of 37 descriptors written by a plain prompt to Fable 5.2 (Marco Castignoli's) found no confirmed error in them.
- Reviews asked for changes on both kinds of file: 19 of Marco's 28, and on the tool-made #3133, #3135 and #3149–#3156.
- Addressing the review of 24 PRs on 2026-11-25 used the registry's linter, both runners and ad hoc scripts, not the CLI.
- The registry's two-model AI review and Marco's review skill already do the checking a descriptor needs.

No run compared tool and no tool on the same task, so this is "no evidence the tool is better", not proof that it is not. Marco proposed a skill built on his prompt; the owner decided on 2026-11-27 that the skill is the way forward.

The CLI, its tests, docs and the full history of this file are on the `tool` branch (`99d4d07`) and on npm as `0.6.0-preview.9`. It is parked, not deleted. The weekly registry drift check and CI ran from `main` and no longer run.

## The skill

- Frame: Marco's prompt (ranking URL, skip custom encoding, one PR per protocol, match the web app).
- Added: the rules that the reviews of #3254–#3282 and the earlier top-contract PRs exposed, and the label limit from registry #3283.
- Keep it to rules that come from the linter, the runners and contract source. Do not copy the registry AI reviewer's prompt into it, and never give that reviewer this skill's text: a generator and a reviewer that share rules pass each other without the descriptors getting more correct.
- Tested once: a blind agent on 2026-11-27 (Bitcoin Hyper presale, 2 functions) got lint 0 errors and both runners 2 of 2 in about 20 minutes. Its 15 findings were folded in (test file name, `rawTx`, runner commands, proxies, the short-lived-project rule). The changed skill has not been run again.
- Open: `ADDRESSED-CONTRACTS.md` is from 2026-11-10 and lacks #3254–#3282; the skill may later be offered to the registry repo, where it can follow the CI pins.

## Registry PRs in flight

- #3254–#3282 (29 drafts, Marco's files, opened by the owner): Marco's review answered on 2026-11-25, 24 branches pushed, CI green. Waiting on his re-review, AI review runs (the owner approves them; each spends the registry's API keys) and a maintainer other than Marco.
- Blocked on others: #3269 Everstake (implementation unverified on Sourcify); #3281 Tycho (router superseded, new one unverified; close or rebind is the owner's call).
- #3205 MetaSwap: draft until MetaMask verifies the four adapters.
- An unreported runner bug: `tokenTicker` on an unknown token renders as a checksummed address in the Sourcify runner and as raw bytes in the Rust runner.

## Working conventions

- Push this repo straight to `main`, no PRs. No Claude attribution in commits, PRs or issues.
- Registry commits are authored `port <108868128+portdeveloper@users.noreply.github.com>`. Push registry branches with `git push fork <branch>` after `git fetch fork` and a rebase; never force.
- Verify a claim before writing it into the skill: read the source, run the command.
- The site (`site/`, built by `.github/workflows/pages.yml` on pushes to `main`) and `site/llms.txt` summarise the skill; keep them in step with it.
- Scratch goes under the session scratchpad, never in the repo.
