# Clear Signing Helper

Create, preview, and regression-test ERC-7730 clear-signing descriptors alongside a Foundry project.

Use it to turn compiled contract functions into editable ERC-7730 JSON drafts, inspect the fields a transaction would display, and catch changes to signing output in CI. Descriptors and fixtures stay in your contract repository.

**Developer preview: `0.2.0-preview.1`.** Supports calldata authoring and testing with [strict portability checks](docs/RELEASE-SCOPE.md). Generated labels, units and intent require developer review. Independent human review, protocol-maintainer assessment, physical-device testing and production wallet delivery remain pending. The CLI does not sign or send transactions.

[Install](#install-the-developer-preview) · [Try an example](#try-the-included-example) · [Use your own project](#add-clear-signing-to-your-foundry-repository) · [Commands](#files-and-commands)

## Install the developer preview

Requires Node.js 22+ and Foundry. Install the [npm preview](https://www.npmjs.com/package/clear-signing-helper/v/0.2.0-preview.1):

```sh
npm install --global --ignore-scripts clear-signing-helper@preview
clear-signing --version
```

Or try the CLI without a global installation:

```sh
npx --yes --ignore-scripts --package=clear-signing-helper@preview clear-signing --help
```

Pin `clear-signing-helper@0.2.0-preview.1` for reproducible installs. This is an experimental developer preview; specify the preview tag or exact version explicitly.

Expected version: `0.2.0-preview.1`. Installation is independent of your contract repository; it does not need a `package.json` or Node dependencies. Have `forge` available on your PATH.

Continue with the example below or [your own Foundry project](#add-clear-signing-to-your-foundry-repository). Existing users should follow the [upgrade procedure](docs/DISTRIBUTION.md#upgrade-and-rollback). For other installation methods, see [building from source](#install-from-source) and [verified tarballs](docs/DISTRIBUTION.md#build-and-verify-a-release).

## Try the included example

After installing the CLI, clone the example from the matching release and build its contracts:

```sh
git clone --depth 1 --branch v0.2.0-preview.1 \
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

Run these commands from your contract repository. Build it once with your existing Foundry setup so the Solidity compiler and project dependencies are available; the helper subsequently uses `forge build --offline`.

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

Omit `--contract` during init to select production contracts under the resolved source directory. Repeat it to select several contracts. Tests, scripts, interfaces, abstract contracts, and dependencies are excluded from default selection. Dependencies can be selected explicitly by their compiled identity.

`init` prints the generated descriptor path under `clear-signing/descriptors/`; `fixture` writes `clear-signing/fixtures/deposit.json`. `--local` marks an undeployed example binding, so you can preview before adding real deployment addresses.

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

## Files and commands

```text
clear-signing.toml
clear-signing/
  descriptors/calldata-Vault-<identity-hash>.json
  fixtures/deposit.json
  expectations/deposit.json
  review.json
.clear-signing-cache/build.json
```

Commit the TOML file and `clear-signing/`. Ignore `.clear-signing-cache/` and your existing Foundry output/cache directories. Review records are tied to the effective build and exact tool/renderer/schema versions; update them deliberately when those inputs change.

| Command | Behavior |
| --- | --- |
| `init` | Scaffold selected contracts; existing descriptors are preserved |
| `upgrade` | Adopt a new engine version, preserve descriptors/expectations, and invalidate old review |
| `sync` | Add missing function formats; report obsolete references without deleting them |
| `fixture` | Encode a sample call using the compiled ABI |
| `preview --fixture <path>` | Render in the terminal; `--open` / `--serve` enables a browser preview |
| `review --accept` | Record review for all selections; `--contract` narrows it |
| `check` | Validate schema, supported features, ABI coverage, and review freshness |
| `test` | Render all fixtures and compare saved expectations |
| `test --update` | Accept expectations only if every fixture renders without blocking warnings |
| `export --out <directory>` | Validate and write a new submission bundle; never publishes |

Global options: `--root <directory>`, `--profile <name>`, `--no-build`, and `--json`. Relative fixture/config paths resolve from the Foundry root, including when invoked in a subdirectory. The saved profile is the default; an explicit flag or `FOUNDRY_PROFILE` overrides it.

`check` and `export` report known portability issues for nested arrays, tuple-array field ordering and signed integers. Use `--strict-portability` on either command to reject those ABI shapes in CI. Ordinary export includes `portability.json` for review. No findings does not mean a wallet has been verified; see the [tested device matrix](docs/DEVICE-COMPATIBILITY.md).

`--no-build` works only after a successful helper build and an exact match of current source/config/artifact fingerprints. A missing cache, changed source, or modified artifact requires rebuilding. Source changes without ABI changes also invalidate review. Fingerprinting is conservative across the project's discovered artifacts and Solidity inputs, so unrelated project source changes may require review too.

For a deliberate function exclusion, remove its descriptor format and record a reason in the selection's `exclusions` table in `clear-signing.toml`:

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

Export requires a production binding, current review, and at least one passing fixture for every covered function. The output includes:

- Standard descriptor JSON files.
- `testsv2/*.tests.json` with unsigned transaction bytes, local metadata, and expected fields in the registry's v2 test schema.
- Original fixtures and normalized renderings for review.
- A validation summary and submission instructions.
- A portability report describing known consumer limitations in the selected ABI shapes.

Export refuses existing directories, escaping paths, and conflicting metadata across fixtures for the same descriptor. Copy descriptors and `testsv2` into the appropriate registry entity folder for submission. Deployed-code verification, registry review, attestations, and wallet distribution remain separate steps. [Submission guide](https://clearsigning.org/build/)

## CI

After installing the pinned tool, Foundry/compiler version, and project dependencies:

```sh
clear-signing check --strict-portability --json
clear-signing test --json
```

Do not put `review --accept` or `test --update` in CI. Exit codes are `0` for success, `1` for validation/rendering/test failures, and `2` for invocation or environment failures. JSON diagnostics include stable codes and file/signature/remediation details when available.

See [the consumer CI example](docs/consumer-ci.yml) and [this project's validation workflow](.github/workflows/ci.yml).

## Supported boundary

The CLI pins ERC-7730 v2 schema 2.0.0 and Sourcify renderer 0.2.2 with a reproducible signed-integer decoding fix. [Patch details](docs/REGISTRY-COMPATIBILITY.md#signed-integer-fix) Its deliberately checked subset is:

- Calldata write functions, overloads, inherited functions, tuples, fixed/dynamic nested arrays, and sequential groups that keep tuple members paired. Nested groups are expanded to concrete indexed paths for each local preview; exported descriptors retain standard nested groups, whose support varies across wallets.
- Formats: `raw`, `addressName` with local names, `tokenAmount` with a fixed token or a scalar address path, and `date` with timestamp encoding.
- Argument leaf paths and `@.to`, `@.from`, `@.value`. All argument leaves and the native value of payable functions must remain visible.
- Local token/name metadata and exact, canonical ABI calldata up to 64 KiB. Input files are bounded to 8 MiB; descriptor/fixture trees to 32,768 nodes and 96 levels; decoded arguments to 8,192 nodes and 32 levels; signing output to 4,096 fields/groups.

Human previews escape terminal controls and bidirectional overrides as visible text. JSON and saved expectations retain the original values. The renderer is [vendored with provenance and dependency notices](docs/DISTRIBUTION.md); installation does not patch `node_modules`.

Missing metadata is visible as warnings and raw fallback in preview, and blocks test acceptance/export. Empty-array notices are informational and remain in expectations. Dates beyond the renderer's supported range fail instead of being silently accepted.

Unsupported features fail explicitly: EIP-712, nested transaction decoding, external includes/references, conditional visibility, encryption, interpolated intents, maps/enums, factory bindings, and automatic registry access. This is not a universal ERC-7730 validator or wallet emulator. The tool neither simulates transaction effects nor establishes semantic correctness of descriptions.

## Use with an agent

The repository also includes an [agent skill](docs/AGENT-SKILL.md) for working from a deployed contract address:

```sh
npx skills add portdeveloper/clear-signing-helper
```

The skill lives under `.claude/skills/clear-signing-helper/`. Installing the standalone CLI above is sufficient for the Foundry workflow in this README.

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

The preview is available on [npm](https://www.npmjs.com/package/clear-signing-helper/v/0.2.0-preview.1) and as a [GitHub prerelease](https://github.com/portdeveloper/clear-signing-helper/releases/tag/v0.2.0-preview.1). The GitHub assets contain the package checksum and local, CI, GitHub-download and npm-install verification records. All four Linux/macOS Node 22/24 CI packages matched the released tarball. See the [release handoff](docs/RELEASE-HANDOFF.md) for exact inputs and remaining distribution work.

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
