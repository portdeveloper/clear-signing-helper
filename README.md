# Clear Signing Helper

Create, preview, and regression-test ERC-7730 clear-signing descriptors alongside a Foundry project.

Use it to turn compiled contract functions into editable ERC-7730 JSON drafts, inspect the fields a transaction would display, and catch changes to signing output in CI. Descriptors and fixtures stay in your contract repository.

**Developer preview: `0.3.0-preview.1`.** Drafts are built from what the repository proves (ABI, NatSpec, compiler AST, broadcast records, verified source), accept every format the registry does, and export registry-shaped bundles checked by the registry's own linter. Works with Foundry projects or from a verified address. Generated labels, units and intent require developer review. Independent human review, protocol-maintainer assessment, physical-device testing and production wallet delivery remain pending. The CLI does not sign or send transactions.

[Install](#install-the-developer-preview) · [Try an example](#try-the-included-example) · [Use your own project](#add-clear-signing-to-your-foundry-repository) · [Commands](#files-and-commands)

## Install the developer preview

Requires Node.js 22+ and Foundry (or a verified contract address for [ABI mode](#use-without-foundry-abi-mode)). Install the [npm preview](https://www.npmjs.com/package/clear-signing-helper/v/0.3.0-preview.1):

```sh
npm install --global --ignore-scripts clear-signing-helper@preview
clear-signing --version
```

Or try the CLI without a global installation:

```sh
npx --yes --ignore-scripts --package=clear-signing-helper@preview clear-signing --help
```

Pin `clear-signing-helper@0.3.0-preview.1` for reproducible installs. This is an experimental developer preview; specify the preview tag or exact version explicitly.

Expected version: `0.3.0-preview.1`. Installation is independent of your contract repository; it does not need a `package.json` or Node dependencies. Have `forge` available on your PATH.

Continue with the example below or [your own Foundry project](#add-clear-signing-to-your-foundry-repository). Existing users should follow the [upgrade procedure](docs/DISTRIBUTION.md#upgrade-and-rollback). For other installation methods, see [building from source](#install-from-source) and [verified tarballs](docs/DISTRIBUTION.md#build-and-verify-a-release).

## Try the included example

After installing the CLI, clone the example from the matching release and build its contracts:

```sh
git clone --depth 1 --branch v0.3.0-preview.1 \
  https://github.com/portdeveloper/clear-signing-helper.git
cd clear-signing-helper
forge build --root examples/standard

clear-signing --root examples/standard preview \
  --fixture clear-signing/fixtures/deposit.json
```

This example includes an editable vault descriptor, a deposit fixture, and local token/address metadata. It needs no wallet, RPC endpoint or funded account. The example files live in the source repository; installing the npm package alone does not create them.

To view the same transaction in your browser:

```sh
clear-signing --root examples/standard preview \
  --fixture clear-signing/fixtures/deposit.json --open
```

The browser preview prints a private loopback URL and opens it in your browser. On a remote machine or without a desktop browser, use the terminal preview above. Use `--serve` instead of `--open` to print the URL without launching a browser. Stop the server with Ctrl+C.

Expected fields:

```text
Deposit (local draft)
  Amount: 1 USDC
  Receiver: Alice
    Address: 0x0000000000000000000000000000000000000002
```

These example addresses and token metadata are local fixtures. The automated Anvil test separately deploys contracts, mines a real local deposit, renders its actual calldata, and checks resulting balances.

## Add clear signing to your Foundry repository

Run these commands from your contract repository. Build it once with your existing Foundry setup so the Solidity compiler and project dependencies are available; the helper subsequently uses `forge build --offline --ast` with NatSpec outputs, which may recompile once. If a compiler is missing, the helper says which one and asks for that single `forge build`.

The example below assumes your project has `src/Vault.sol:Vault` with `deposit(uint256,address)`. Replace those with your actual compiled contract identity, function signature and sample arguments. The addresses below are local example values.

```sh
forge build
clear-signing init --contract src/Vault.sol:Vault --owner "My Protocol"

clear-signing fixture \
  --name deposit \
  --contract src/Vault.sol:Vault \
  --function 'deposit(uint256,address)' \
  --args '["1000000","0x0000000000000000000000000000000000000002"]' \
  --chain-id 31337 \
  --to 0x0000000000000000000000000000000000000001 \
  --local

clear-signing preview --fixture clear-signing/fixtures/deposit.json
```

Omit `--contract` during init to select production contracts under the resolved source directory. Repeat it to select several contracts. Tests, scripts, interfaces, abstract contracts, compile-only stubs with no entry points, and dependencies are excluded from default selection. Dependencies can be selected explicitly by their compiled identity.

Drafts are built from what the repository itself states or proves, and `init` prints where each value came from:

- **NatSpec.** A function's `@notice` becomes the intent when its first sentence fits the registry linter's 30-character limit; `@param` text becomes a field label under a 32-character rule. Longer text is reported but not used.
- **Solidity enums.** A parameter declared as an enum gets the `enum` format with its members under `metadata.enums`, read from the compiler AST.
- **Constructor constants.** An `immutable` address assigned from a constructor argument, with that argument recorded in a broadcast, becomes `metadata.constants.<name>`. Reference it as `$.metadata.constants.<name>` in a `token` parameter. Values that differ between deployments are left out.
- **ERC-20 and WETH conventions.** A contract with the full ERC-20 surface gets the registry's usual `approve`, `transfer` and `transferFrom` formats denominated in the contract itself; a WETH-shaped contract also gets `Wrap` and `Unwrap`. These are conventions, marked as such, and editable like any draft.

`init` reads the repository's `broadcast/` records. A contract created by `forge script --broadcast` gets its `deployments` binding filled from that record, and deployed contracts outside the default selection, such as a router under `lib/`, are listed as suggestions with their addresses. Dry runs are ignored, and a contract name shared by several compiled contracts is never bound automatically.

`init` prints the generated descriptor path under `clear-signing/descriptors/`; `fixture` writes `clear-signing/fixtures/deposit.json`. If a `forge script --broadcast` run already sent the transaction you want to describe, `fixture --name <n> --contract <id> --broadcast-tx <hash>` copies its chain, target, calldata and value verbatim. `--local` marks an undeployed example binding, so you can preview before adding real deployment addresses.

Drafts use raw values for every argument. The first preview shows an amount such as `1000000` until you add its token formatting and metadata. Inspect the generated JSON before choosing units or action descriptions. For a vault deposit, edit the generated `display.formats` entry like this:

```json
"deposit(uint256 assets,address receiver)": {
  "intent": "Deposit",
  "fields": [
    {
      "path": "assets",
      "label": "Amount",
      "format": "tokenAmount",
      "params": { "token": "0x0000000000000000000000000000000000000003" }
    },
    {
      "path": "receiver",
      "label": "Receiver",
      "format": "addressName",
      "params": { "sources": ["local"] }
    }
  ]
}
```

Use the actual parameter names from your artifact; the tool checks them. Add metadata to the fixture:

```json
"tokens": {
  "0x0000000000000000000000000000000000000003": {
    "name": "USD Coin", "symbol": "USDC", "decimals": 6
  }
},
"addressNames": {
  "0x0000000000000000000000000000000000000002": "Alice"
}
```

The token address must correspond to the asset the contract actually uses. An ABI cannot establish that relationship. Fixture metadata applies to the fixture's chain and is never fetched from RPC.

Run the preview again after editing the descriptor and fixture:

```sh
clear-signing preview --fixture clear-signing/fixtures/deposit.json
```

After inspecting the source, descriptor, and rendered fields:

```sh
clear-signing review --accept
clear-signing test --update
clear-signing check --strict-portability
clear-signing test
```

`review --accept` records your acknowledgement of the current source, descriptions, and exclusions. `test --update` accepts current rendering expectations. They are separate explicit actions; ordinary check/test runs do not modify tracked authoring.

Commit `clear-signing.toml` and `clear-signing/`. On subsequent changes, run `clear-signing sync` to scaffold newly added functions, inspect the changes, and renew review/expectations deliberately. Run [strict check and test in CI](#ci) to detect stale review and changed output. A local fixture supports preview and testing; [export](#production-bindings-and-registry-export) additionally requires real deployment bindings and fixture coverage for every covered function.

## Use without Foundry: ABI mode

A Hardhat project, or a deployment you only know by address, gets the same fixture, test and export workflow. Run in an empty directory (or pass `--root`):

```sh
clear-signing init --address 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --chain-id 1 --owner "WETH"
clear-signing init --abi ./artifacts/Vault.json --name Vault --owner "My Protocol"
```

`--address` is the one network call the tool makes, and only when asked. It fetches the verified source match from [Sourcify](https://sourcify.dev), falling back to Etherscan V2 when `ETHERSCAN_API_KEY` is set. A verified proxy is resolved to its implementation: the descriptor describes the implementation's functions and binds the proxy address users actually call. NatSpec from the verified source feeds intents and labels the same way Foundry artifacts do. An unverified address is refused with the reason; verify it on Sourcify or pass the ABI you trust with `--abi`.

Imported ABIs are stored under `clear-signing/abi/<Name>.json` with a `<Name>.source.json` sidecar recording where they came from, when, the match status, and any proxy resolution. Commit both. The engine fingerprints those files instead of Solidity sources, so editing an ABI invalidates review exactly as a source change would. `clear-signing.toml` records `mode = "abi"`; a directory cannot mix modes.

Not available in ABI mode: Solidity enums, constructor constants, broadcast bindings and broadcast fixtures, since those come from the compiler AST and `forge script` records.

## Add a chain to a descriptor already in the registry

Most protocols a new chain cares about already have a registry descriptor. The pull request that adds the chain is one deployment entry plus one test case, and the tool produces both from a registry clone:

```sh
git clone https://github.com/ethereum/clear-signing-erc7730-registry.git
clear-signing registry add-deployment \
  --registry clear-signing-erc7730-registry \
  --descriptor registry/weth/calldata-weth.json \
  --chain-id 8453 --address 0x4200000000000000000000000000000000000006 \
  --token 0x4200000000000000000000000000000000000006=WETH:18
```

The address is proven to be the same contract before anything changes: its verified ABI is fetched from Sourcify (Etherscan V2 with `ETHERSCAN_API_KEY` as fallback, a verified proxy followed to its implementation) and every function the descriptor formats must exist in it by selector. The deployment is appended, and a test case for the new chain is rendered from an existing case's calldata through the pinned renderer, so expected values are computed rather than copied. Token symbols and address names differ between chains and are never guessed; supply them with `--token <address>=<SYMBOL>:<decimals>` and `--address-name <address>=<Name>`, or pass `--no-test` to add the deployment alone. Edits are inserted into the existing file text, copying the formatting of the neighbouring entry, so the pull request diff is the added lines and nothing else. If no existing test case can be rendered on the new chain, the command says why for each one and leaves both files untouched. Upstream lint runs on the result, and the exact `git` and `gh` commands are printed; the tool never commits or opens the pull request.

## Decisions: the slots only judgment can fill

Everything the scaffold cannot prove is exposed as one editable file per contract, so a person or an agent fills it without touching descriptor JSON:

```sh
clear-signing decisions --contract src/Vault.sol:Vault      # writes clear-signing/decisions/Vault.json
# fill intents, formats, denominations, show/hide with reasons, exclude with reasons; set "author"
clear-signing apply --decisions clear-signing/decisions/Vault.json
```

The template lists every function and every argument leaf with its current value and read-only hints: the NatSpec text, the registry's formats for the same selector, candidate denominations for amounts (`@.to`, `$.metadata.constants.*`, address arguments, a literal token), and the formats valid for the type. `apply` validates the result before writing anything, then writes the descriptor, `exclusions` and `hidden` in `clear-signing.toml`, and records each decision in `clear-signing/provenance.json` as `human` or `llm` according to the file's `author`. Hidden native value and unsupported formats are refused. Running `decisions` again reproduces the current state, so the file round-trips.

## Files and commands

```text
clear-signing.toml
clear-signing/
  descriptors/calldata-Vault-<identity-hash>.json
  fixtures/deposit.json
  expectations/deposit.json
  review.json
  provenance.json        where each intent, label and format came from (natspec, ast, broadcast, convention, registry, human, llm)
  decisions/<Name>.json  the judgment slots for one contract, filled by a person or an agent
  abi/<Name>.json        ABI mode only, with <Name>.source.json beside it
.clear-signing-cache/build.json
```

Commit the TOML file and `clear-signing/`. Ignore `.clear-signing-cache/` and your existing Foundry output/cache directories. Review records are tied to the effective build and exact tool/renderer/schema versions; update them deliberately when those inputs change.

| Command | Behavior |
| --- | --- |
| `init` | Scaffold selected contracts; existing descriptors are preserved. `--abi <file>` or `--address <addr> --chain-id <id>` starts ABI mode |
| `upgrade` | Adopt a new engine version, preserve descriptors/expectations, and invalidate old review |
| `decisions --contract <id>` | Write the judgment slots (intent, formats, denominations, show/hide, exclude) as a file with hints |
| `apply --decisions <file>` | Validate a filled decisions file, then write descriptor, exclusions, hidden reasons and provenance |
| `sync` | Add missing function formats; report obsolete references without deleting them |
| `fixture` | Encode a sample call using the compiled ABI, or copy a recorded broadcast transaction with `--broadcast-tx <hash>` |
| `preview --fixture <path>` | Render in the terminal; `--open` / `--serve` enables a browser preview |
| `review --accept` | Record review for all selections; `--contract` narrows it |
| `check` | Validate schema, supported features, ABI coverage, and review freshness; `--contract` narrows it |
| `test` | Render all fixtures and compare saved expectations |
| `test --update` | Accept expectations only if every fixture renders without blocking warnings; `--contract` narrows both |
| `export --out <directory>` | Validate, write a registry-shaped bundle, and run upstream lint; `--contract` exports one contract; never publishes |
| `registry add-deployment` | Add a verified deployment and a rendered test case to a descriptor in a registry clone; `--runners` checks it with the registry's implementations; never commits |
| `registry setup-runners` | Clone and build the registry CI's Sourcify and Rust implementations once |

Global options: `--root <directory>`, `--profile <name>`, `--no-build`, and `--json`. Relative fixture/config paths resolve from the project root (the nearest `clear-signing.toml` or `foundry.toml`), including when invoked in a subdirectory. The saved profile is the default; an explicit flag or `FOUNDRY_PROFILE` overrides it.

`check` also compares each format against what other registry descriptors do with the same function selector, using a pinned snapshot of the registry's display formats. When every prior types or hides an argument and the draft leaves it raw or shown, `check` warns (`CORPUS_DISAGREEMENT`); `init` lists the priors it found under the draft's evidence. This is advisory: the registry's choices for one contract are a strong hint for another with the same selector, not proof. Refresh the snapshot with `npm run priors:snapshot -- <registry-clone>`.

`check` and `export` report known portability issues for nested arrays, tuple-array field ordering and signed integers. Use `--strict-portability` on either command to reject those ABI shapes in CI. Ordinary export includes `portability.json` for review. No findings does not mean a wallet has been verified; see the [tested device matrix](docs/DEVICE-COMPATIBILITY.md).

`--no-build` works only after a successful helper build and an exact match of current source/config/artifact fingerprints. A missing cache, changed source, or modified artifact requires rebuilding. Source changes without ABI changes also invalidate review. Fingerprinting is conservative across the project's discovered artifacts and Solidity inputs, so unrelated project source changes may require review too.

For a deliberate function exclusion, remove its descriptor format and record a reason in the selection's `exclusions` table in `clear-signing.toml`. For a deliberately hidden argument, record a reason in the `hidden` table (see [Supported boundary](#supported-boundary)):

```toml
[contracts.exclusions]
"transferAdmin(address)" = "Handled in the separate administrative signing workflow"
```

TOML's table applies to the preceding `[[contracts]]` entry. Admin functions are inventoried by default. Receive/fallback entry points require an explicit exclusion because v0.2 does not render them.

## Production bindings and registry export

For a deployed contract, put real bindings in its descriptor and remove `localBinding` from the associated fixtures:

```json
"context": {
  "contract": {
    "deployments": [{ "chainId": 1, "address": "0xYourActualContractAddress" }]
  }
}
```

The placeholder above is illustrative and fails validation until replaced with a valid address. A proxy descriptor must bind to the user-facing proxy address while the selected artifact describes its implementation. This mapping is explicit; the tool does not verify deployed bytecode or discover proxies.

Preview must match the fixture's chain and target against the descriptor. `localBinding: true` works only with an empty deployment list and cannot be exported. Adding production bindings requires new review and expectation acceptance.

```sh
clear-signing check --strict-portability
clear-signing test
clear-signing export --strict-portability --out dist/clear-signing
```

Export requires a production binding, current review, and at least one passing fixture for every covered function of each exported contract. Pass `--contract <id>` (repeatable) to export one contract while other selections are still drafts. The bundle is laid out the way the registry expects:

```text
<out>/
  registry/<entity>/calldata-<ContractName>.json        relative $schema, as in the registry
  registry/<entity>/testsv2/calldata-<ContractName>.tests.json
  review/fixtures/ review/renderings/ review/validation.json review/portability.json
  README.md                                             copy instructions and lint status
```

`<entity>` defaults to a kebab-case slug of `metadata.owner`; pass `--entity <slug>` to match an existing registry folder. Test descriptions follow the registry's `<fixture> - chain <id>` form. `--inline-abi` embeds the compiled ABI, which the schema marks deprecated, so it is off by default.

Export then formats the descriptors with the registry's own `erc7730 format` (the registry's format bot would otherwise rewrite them) and runs its linter, `erc7730` pinned to the version its CI uses, through `uvx`. A lint error removes the bundle and fails the export; warnings are recorded in `review/validation.json`. Without `uvx` the exact command is printed instead, and `--no-lint` skips it. `check` already warns locally when an intent exceeds the linter's 30-character limit.

Add `--registry-runners` to also run the two implementations the registry's CI tests every submission against: the Sourcify TypeScript runner and the Rust `cs-test` runner, at the revisions the registry pins. The first use clones and builds them under `~/.cache/clear-signing-helper/runners/` (needs `git`, `npm` and `cargo`; `clear-signing registry setup-runners` does this ahead of time). Every case must pass in both, or the export fails and the bundle is removed. Results and logs land in `review/runners/`. `--runner-pins <registry-clone>` reads the revisions from a clone's CI definition instead of the built-in pins. `registry add-deployment --runners` does the same for the test file it updates.

Export refuses existing directories, escaping paths, two selected contracts with the same name, and conflicting metadata across fixtures for the same descriptor. Copy `registry/<entity>/` into a registry clone and open the pull request from an account tied to the contract owner. Deployed-code verification, registry review, attestations, and wallet distribution remain separate steps. [Submission guide](https://clearsigning.org/build/)

## CI

After installing the pinned tool, Foundry/compiler version, and project dependencies:

```sh
clear-signing check --strict-portability --json
clear-signing test --json
```

Do not put `review --accept` or `test --update` in CI. Exit codes are `0` for success, `1` for validation/rendering/test failures, and `2` for invocation or environment failures. JSON diagnostics include stable codes and file/signature/remediation details when available.

See [the consumer CI example](docs/consumer-ci.yml) and [this project's validation workflow](.github/workflows/ci.yml).

## Supported boundary

The CLI pins ERC-7730 v2 schema 2.0.0 and Sourcify renderer 0.2.2 with a reproducible signed-integer decoding fix. [Patch details](docs/REGISTRY-COMPATIBILITY.md#signed-integer-fix) A descriptor passes `check` when it satisfies the pinned schema and uses only formats the renderer implements:

- Formats: `raw`, `amount`, `tokenAmount`, `addressName`, `nftName`, `date`, `duration`, `unit`, `enum`, `tokenTicker`, `chainId`, with the parameters the schema defines for each. `calldata` (nested calls) and `interoperableAddressName` are rejected explicitly. `tokenPath`, `collectionPath` and `nativeCurrencyAddress` may point at `@.to`, a literal address, `$.metadata.token`, `$.metadata.constants.*`, or any argument the renderer can read an address from, including array elements such as `path.[0]` and `path.[-1]` and byte slices such as `to.[-20:]`.
- Registry idioms are accepted as the renderer accepts them: `#.` root prefixes, `$id`, `display.definitions` with `$ref`, constant-value fields, `visible` set to `always`, `never`, `optional`, `default` or an `ifNotIn`/`mustMatch` rule, relative paths scoped inside groups, and byte slices on leaves. A format's type mismatch (an `addressName` on a `string`, say) is a warning because the renderer renders it raw with a warning; snapshot acceptance still refuses the resulting rendering. Measured against the registry: `npm run registry:acceptance -- <clone>` reports how many merged descriptors the validator accepts; the only class it rejects by design is the `calldata` format.
- Calldata write functions, overloads, inherited functions, tuples, fixed/dynamic nested arrays, and sequential groups that keep tuple members paired. Nested groups are expanded to concrete indexed paths for each local preview; exported descriptors retain standard nested groups, whose support varies across wallets.
- Argument leaf paths and `@.to`, `@.from`, `@.value`. Payable functions must display `@.value`; drafts use the `amount` format for it.
- `interpolatedIntent`: an optional sentence with `{path}` placeholders naming shown fields, e.g. `"Stake {amount}"`. Wallets prefer it over `intent` and the registry recommends one on every format. Placeholders must name displayed fields (or `@.value`); the rendered sentence is checked into expectations and into `testsv2`, where the registry's runners compare it. An argument left out of a format is reported as a warning. Record the reason under the selection's `hidden` table in `clear-signing.toml` to acknowledge it:

```toml
[contracts.hidden."swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"]
"path.[]" = "Route is implied by the input and output token amounts"
```

- Local metadata only. Fixtures may carry `tokens`, `addressNames`, `ensNames`, `nftCollectionNames`, `blockTimestamps`, and a `chain` entry with the native currency. Well-known chains, including Monad, fall back to a built-in native-currency table; anything else needs `chain` in the fixture, or `--chain-name` and `--native-currency` when creating it. Nothing is fetched.
- Exact, canonical ABI calldata up to 64 KiB. Input files are bounded to 8 MiB; descriptor/fixture trees to 32,768 nodes and 96 levels; decoded arguments to 8,192 nodes and 32 levels; signing output to 4,096 fields/groups.

Human previews escape terminal controls and bidirectional overrides as visible text. JSON and saved expectations retain the original values. The renderer is [vendored with provenance and dependency notices](docs/DISTRIBUTION.md); installation does not patch `node_modules`.

Missing token metadata is visible as warnings and raw fallback in preview, and blocks test acceptance/export. Empty-array notices and unnamed `addressName` values are informational: the address renders in full, as wallets show it, and the warning remains in expectations. Dates beyond the renderer's supported range fail instead of being silently accepted. Registry test runners use their own chain tables; an `amount` field on a chain they do not know will render raw there.

Unsupported features fail explicitly: EIP-712, nested transaction decoding, external includes/references, display definitions, constant-value fields, encryption, interpolated intents, factory bindings, and automatic registry access. Apart from `init --address`, `registry add-deployment`, the upstream lint run on export, and the one-time runner build behind `--registry-runners`, nothing touches the network. This is not a universal ERC-7730 validator or wallet emulator. The tool neither simulates transaction effects nor establishes semantic correctness of descriptions.

## Use with an agent

The repository also includes an [agent skill](docs/AGENT-SKILL.md) that drives this CLI end to end: registry search, `registry add-deployment` when the protocol is already listed, otherwise `init` from a Foundry build or a verified address, then the judgment steps (intent wording, token relationships, what to hide), fixtures, tests, export and a PR draft.

```sh
npx skills add portdeveloper/clear-signing-helper
```

The skill lives under `.claude/skills/clear-signing-helper/` and expects the CLI installed as above.

## Install from source

Clone the repository, then run from its root:

```sh
npm ci --ignore-scripts
npm run build
npm install --global --ignore-scripts .
clear-signing --help
```

Alternatively, run `node /path/to/clear-signing-helper/dist/cli.js` directly after building. To create a local package, run `npm pack`; see [distribution and checksum verification](docs/DISTRIBUTION.md).

Forge builds have a ten-minute timeout to accommodate large optimized protocol repositories; metadata commands have a two-minute timeout.

## Release status and evidence

`0.3.0-preview.1` is published on [npm](https://www.npmjs.com/package/clear-signing-helper/v/0.3.0-preview.1) under both the `preview` and `latest` tags, and as a [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.3.0-preview.1) with its checksum and verification record. The npm tarball's integrity hash matches the GitHub asset byte for byte. The GitHub assets contain the package checksum and local, CI, GitHub-download and npm-install verification records. All four Linux/macOS Node 22/24 CI packages matched the released tarball. See the [release handoff](docs/RELEASE-HANDOFF.md) for exact inputs and remaining distribution work.

[Validation evidence](docs/VALIDATION.md) records automated tests, real-source exercises and emulator results. The [production readiness checklist](docs/PRODUCTION-READINESS.md) retains pending human and physical-device validation. Those results are not prerequisites for distributing this experimental CLI. No descriptor has been submitted to a registry by this project.

Licensed under [MIT](LICENSE). Bundled dependencies retain their [third-party notices](docs/THIRD-PARTY-NOTICES.md).

## Develop and validate

```sh
npm ci
npm test
forge test --root examples/standard
forge test --root examples/custom-layout
forge test --root examples/duplicate-contracts
```

Tests compile real Foundry projects and run the actual CLI. The Anvil test deploys a token/vault, mines a deposit, validates its on-chain result, and compares calldata with `cast`. Rendering tests cover tuple grouping, full signature names, numeric precision, and browser escaping.

## Registry compatibility

The pinned real-registry corpus covers **278 calldata descriptors and 1,435 function entries**. Every entry generates a schema-valid basic descriptor and renders all argument leaves in order. Tests also replay **605 registry transactions**: 574 render; 31 are explicitly rejected because they append non-ABI suffix bytes. The tool never silently strips those suffixes.

Four deployed contract ABIs fetched from Sourcify (WETH, Uniswap Router02, Morpho Blue, Safe) are tested with their actual mutability and parameter names. Twelve representative registry ABI-shape harnesses compile through Foundry. These harnesses test integration and types, not deployed protocol logic. The 104 EIP-712 submissions are counted separately and remain outside scope.

Basic generation uses raw values; it does not reproduce curated token inference, enum labels, inner-call decoding, or other protocol-specific semantics. See the [reproducible compatibility report](docs/REGISTRY-COMPATIBILITY.md) and [independent Luna verification](docs/luna-registry-validation.md).

To upgrade a repository initialized with v0.1:

```sh
clear-signing upgrade
clear-signing check
# Inspect the source, descriptors, and previews before accepting changes:
clear-signing review --accept
clear-signing test --update
```

The [PRD](PRD.md) describes the broader intended product. [Validation notes](docs/VALIDATION.md) record what was actually exercised and what remains unverified.
