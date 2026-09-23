---
name: clear-signing-helper
description: Create or extend an ERC-7730 clear-signing descriptor for a smart contract on any EVM chain and prepare a PR to the ethereum/clear-signing-erc7730-registry, using the clear-signing CLI for everything that can be derived and reserving human judgment for intents, token relationships and what to hide. Use when someone wants their contract's transactions to render as human-readable text in wallets (Ledger and others), wants to add clear signing, write an ERC-7730 descriptor, or add their chain or contract to the clear signing registry.
---

# Clear signing descriptor (ERC-7730)

Turn a contract into a reviewed, validated ERC-7730 descriptor plus a ready-to-open registry PR. ERC-7730 is chain-agnostic: any EVM chain, any contract.

The spec and build guide are https://clearsigning.org/build/ and the EIP. Defer to them for schema questions. This skill is the workflow on top, and the `clear-signing` CLI does the mechanical part: it generates everything the ABI, compiler output, deployment records and verified source prove, renders test expectations, and runs the registry's own linter. You supply what only a human can: the wording of intents, which token an amount is in when the ABI cannot say, and which arguments a signer does not need to see. Never guess those; ask.

## Setup

```sh
npm install --global --ignore-scripts clear-signing-helper@preview   # Node 22+
clear-signing --version
uv --version   # lets the CLI run the registry's erc7730 lint via uvx
cargo --version && clear-signing registry setup-runners   # builds the registry CI's two test runners once (needs git, npm, cargo; minutes on a cold cache)
```

Run the registry's test runners on every export and add-deployment (`--registry-runners`, `--runners` below). They are what check that each test's expected output matches what registry CI renders; lint alone does not. If `uv` or `cargo` is missing and the user cannot install it, say in the PR which check did not run.

Add `--json` to any CLI command for machine-readable output with stable diagnostic codes.

## Inputs to collect first

- Contract address and chain id, or a path to the project's Foundry repository.
- Owner / protocol name (`metadata.owner`, and the registry folder).
- Whether to open the PR or stop at a draft. Default: stop at a draft (step 5).

## 1. Check the registry first (highest leverage)

Most well-known protocols already have a descriptor and only lack a chain. That PR is one deployment line plus one test case.

```sh
git clone --depth 1 https://github.com/ethereum/clear-signing-erc7730-registry.git registry-clone
scripts/find-in-registry.sh <address-or-protocol-name> registry-clone
```

If a `calldata-*.json` matched and only the chain is missing:

```sh
clear-signing registry add-deployment --registry registry-clone \
  --descriptor registry/<entity>/calldata-<Name>.json \
  --chain-id <id> --address <addr> --runners \
  [--token <tokenAddr>=<SYMBOL>:<decimals>] [--address-name <addr>=<Name>]
```

The CLI fetches the verified ABI at the address (Sourcify, then Etherscan with `ETHERSCAN_API_KEY`), proves every function the descriptor formats exists there, appends the deployment, renders a test case for the new chain from an existing one, runs lint, and prints the `git`/`gh` commands. It refuses and changes nothing if the address is a different contract, if the address is unverified, or if a test cannot be rendered; read the reason. Token symbols differ per chain, so when it asks for `--token`, look the token up and pass it. `--no-test` adds the deployment alone when no existing case is usable. Then go to step 5.

If an `eip712-*.json` matched (Permit2, UniswapX, most permit-style protocols), the same command takes an RPC endpoint for the new chain instead of a verified ABI:

```sh
clear-signing registry add-deployment --registry registry-clone \
  --descriptor registry/<entity>/eip712-<Name>.json \
  --chain-id <id> --address <addr> --rpc-url <endpoint for that chain> --runners \
  [--set <message.path>=<value>] [--token <tokenAddr>=<SYMBOL>:<decimals>] [--template "<existing test description>"] [--description "<new test description>"]
```

It follows `includes` to the file that holds the deployments (often a shared `common-*.json`), checks the endpoint serves that chain and there is code at the address, and requires the live `DOMAIN_SEPARATOR()` to equal a domain the descriptor or its existing tests record. Then it inserts the deployment in chain-id order, retargets an existing test case at the new chain and address, renders it the way the registry's runner does, and lints every descriptor that includes the edited file. Read `templateAddresses` in the result: those are message addresses (tokens, spenders) still copied from the template's chain. Point them at this chain's contracts with `--set details.token=0x… --set spender=0x…` and give the token with `--token`. Otherwise the test shows a mainnet address on the new chain. The proof shows the contract signs under this domain; it does not compare bytecode, so say in the PR how you know the address is the canonical deployment.

Only author a new descriptor if nothing matched. The grep misses a protocol at a new address or under a differently named entity folder, so step 2 checks again by function selectors.

## 2. Generate the draft

Pick the input you have. Each writes `clear-signing.toml`, `clear-signing/descriptors/calldata-<Name>-<hash>.json`, and `clear-signing/provenance.json`.

Read `registryMatches` in the result (printed as "Already in the registry?"). It lists registry descriptors whose functions this contract shares, leaving out standard interfaces such as ERC-20 and ERC-4626. `contained: true` means every function the file describes exists here, so `add-deployment`'s selector proof would pass. The match does not tell you who owns the code. Ask the user:
- **Same protocol, new chain:** go back to step 1 and run `registry add-deployment` with that file. The draft is not needed.
- **A fork or copy** (for example a Uniswap V2 fork matching QuickSwap): the file belongs to its owner. Never add the fork's address to it. Keep authoring your own descriptor; the matched file's formats show up as `registryPriors` hints in step 3.

**Foundry repository** (best evidence: NatSpec, enums, constructor constants, broadcast deployments and transactions):

```sh
cd <repo> && forge build            # once, so compilers are cached
clear-signing init --owner "<Owner>"                     # production contracts under src/
clear-signing init --contract <path>:<Name> --owner "<Owner>"   # a dependency, e.g. a router under lib/
```

**Deployed address** (needs verified source on Sourcify, or Etherscan with a key):

```sh
mkdir <name>-clear-signing && cd <name>-clear-signing
clear-signing init --address <addr> --chain-id <id> --owner "<Owner>"
```

A verified proxy is followed to its implementation and the proxy address is bound. If the address is unverified the CLI says so; get the deployer to verify on https://sourcify.dev, or use the ABI you trust with `clear-signing init --abi <file> --name <Name>` and say in the PR that it was not source-verified.

Read the `init` output. It lists every value it derived and its source: NatSpec (author text), AST (enums), broadcast (deployments, constructor constants), convention (ERC-20/WETH defaults). Deployment bindings appear only when the repository proves them; otherwise add `{ "chainId", "address" }` to `context.contract.deployments` yourself, from the protocol's own deployment record.

## 3. Author what the tool cannot prove

Do not edit descriptor JSON by hand. Ask the tool for the judgment slots, fill them, and apply:

```sh
clear-signing decisions --contract <id>            # writes clear-signing/decisions/<Name>.json
# edit that file and set "author": "llm:<your model>"
clear-signing apply --decisions clear-signing/decisions/<Name>.json
```

Tag every value with whoever decided it. The file-level `author` is yours: `llm:<your model>`. When the user gave you a specific answer (an intent wording, which token an amount is in, a hide reason), put `"author": "human"` on that function or field only. Anything you wrote or chose stays under your tag, even if the user approved the file as a whole; approving is not deciding. Use a file-level `"human"` only when the user filled in the file themselves.

The file lists every function and argument with hints you must read before deciding: the NatSpec text, what other registry descriptors do with the same selector (`hints.registryPriors`), the candidate denominations for each amount, and the formats valid for the type. `apply` refuses invalid combinations and writes nothing on error; it records each value you changed from the template in provenance, under the author tag that applies to it, so reviewers can see which choices were the model's and which were the user's. Values left as the tool drafted them keep their original source (NatSpec, AST, convention). Where a hint does not settle a question, ask the user rather than choosing. The rules for each slot:

- **Intent**: the action in plain words, 30 characters or fewer (Ledger truncates; the registry linter warns). "Approve USDC", "Supply collateral", "Swap". The CLI prefilled NatSpec `@notice` where it fit; keep it only if it reads as an action.
- **Interpolated intent**: also fill `interpolatedIntent`, a sentence with `{path}` placeholders for shown fields: "Stake {amount}", "Send {amount} to {to}". Wallets prefer it and the registry's advisory bot asks for one on every format. Placeholders must name fields you show; `hints.registryInterpolatedIntents` lists how other descriptors phrase the same selector. Argument-free functions get a fuller sentence, e.g. "Claim staking rewards".
- **Token amounts**: use `tokenAmount`. When the token is another argument, `"params": {"tokenPath": "path.[0]"}` (arrays may be indexed, `[-1]` is the last element). When it is the contract itself, `"tokenPath": "@.to"`. When it is a constructor constant the CLI extracted, `"token": "$.metadata.constants.<name>"`. When you cannot tell from the source which token an amount is in, ask; do not guess.
- **Addresses**: `addressName` with `"params": {"types": ["eoa","wallet"]}` for recipients, `["contract"]` or `["token"]` where that is what it is.
- **Native value**: payable functions must display `@.value`; the draft uses `amount`.
- **Dates and enums**: `date` with `{"encoding": "timestamp"}`; enums are already wired to `metadata.enums` when the source declares them.
- **Hide noise deliberately**: opaque `bytes` payloads, redundant routes, callback data. Set `show: false` with a `hideReason`; `apply` records it under `hidden` in `clear-signing.toml` and `check` stops warning. Never hide a recipient, spender, amount or limit.
- **Functions you will not cover** (multicall, `execute(bytes)`, admin flows): set `decision: "exclude"` with an `excludeReason`. Say plainly in the PR what is excluded. Never ship a descriptor that renders a half-empty screen.
- **Nested calldata** cannot be decoded statically; exclude those functions.

Base every label on the contract's semantics: parameter names, NatSpec, source. If a parameter's meaning is unclear, look at the source or ask.

## 4. Fixtures, preview, review, test, export

```sh
clear-signing fixture --name <n> --contract <id> --function '<sig>' --args '[...]' --chain-id <id> --to <deployed>
clear-signing fixture --name <n> --contract <id> --broadcast-tx <hash>     # Foundry: a real recorded transaction
clear-signing preview --fixture clear-signing/fixtures/<n>.json           # add tokens/addressNames to the fixture until it renders cleanly
clear-signing check --contract <id>
clear-signing review --accept --contract <id>
clear-signing test --update --contract <id>
clear-signing export --contract <id> --strict-portability --registry-runners --ci-pins registry-clone --out bundle [--entity <registry-folder>]
```

Every function you kept needs at least one passing fixture. Fixture metadata (`tokens`, `addressNames`, `chain`) is local and never fetched; put the real symbol and decimals in. `export` writes `bundle/registry/<entity>/calldata-<Name>.json` and `testsv2/` exactly as the registry wants them, runs `erc7730 lint` and both registry test runners at the pins in the clone's CI files, and records everything under `bundle/review/`. Any failure produces no bundle. `--strict-portability` rejects ABI shapes with recorded wallet failures (signed ints, nested arrays, multi-field tuple arrays); if it fires, exclude that function or drop strict mode and say so in the PR.

`review --accept` and `test --update` are the human's acknowledgement; run them only after you have looked at the preview.

## 5. PR step (default: stop at a draft)

- Copy `bundle/registry/<entity>/` into the registry clone at `registry/<entity>/`, or use the files `registry add-deployment` already changed there.
- DEFAULT: do NOT open the PR. Show the diff, the target path, the lint output, what was excluded or hidden and why, and the exact `git`/`gh` commands (the CLI prints them). Tell the user to open the PR from an account tied to the contract owner; maintainers check ownership.
- Only if the user explicitly opts in: confirm the diff, then open it.

## EIP-712 signed messages

The CLI does not author new EIP-712 descriptors (adding a chain to an existing one is step 1). Follow https://clearsigning.org/build/ by hand: read the exact domain from the contract, confirm the address with `scripts/verify-address.sh <chainId> <address> <rpcUrl> [name] [version]` (matches the live `DOMAIN_SEPARATOR()` against the 2-, 3- and 4-field domain shapes), write `eip712-<Name>.json` with the `$schema` of the folder you write into, add a `testsv2` case, and run `uvx erc7730 lint <file>`. Do not add an `excluded` key; it is a v1 concept the v2 schema rejects.

## Quality bar

- Adding a chain to an existing descriptor beats a new file every time.
- One descriptor reviewed by someone who knows the contract beats ten machine-guessed ones. The CLI records what it derived and from where; the PR should say what a human decided.
- If you bounded coverage, say so out loud.
- Never re-encode or trim calldata, never bind an address on name alone, never silence a `check` warning without recording a reason.
