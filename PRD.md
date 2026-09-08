# Clear Signing Helper — Product Requirements Document

Status: Draft for discussion
Date: 2026-09-07
Working executable name: `clear-signing` (availability not yet checked)

## 1. Product definition

A standalone developer tool that helps teams using Foundry create, preview, test, and maintain ERC-7730 clear-signing descriptors in their contract repositories.

The product promise: **make the text a user sees when signing a transaction a reviewable, tested part of the contract codebase.**

The initial product is a CLI with a local browser preview. It discovers an existing Foundry project, uses compiler artifacts to scaffold descriptors, helps developers fill in transaction meaning, and catches descriptor regressions in CI. It requires no contract changes, hosted account, or native Foundry plugin API.

## 2. Problem and opportunity

Clear signing requires more than decoding an ABI. A wallet needs descriptions of the action, field labels, units, token relationships, and the deployments where those descriptions apply. ERC-7730 supplies a JSON format for this information; protocol developers supply the meaning. [Specification](https://eips.ethereum.org/EIPS/eip-7730)

Today, a protocol developer must move between contract code, descriptor authoring, preview tools, validation, and registry submission. The ecosystem already includes generators and renderers. The opportunity is to connect those capabilities to the repository where contracts change, and keep the resulting descriptors accurate over time. [Build guide](https://clearsigning.org/build/), [registry generator](https://github.com/ethereum/clear-signing-erc7730-registry/blob/master/tools/scripts/generate-7730.README.md), [Clearsig](https://github.com/Cyfrin/clearsig)

The core problems to solve:

- Starting requires learning descriptor structure before seeing a useful result.
- ABI types alone do not establish transaction intent or display semantics.
- Contract changes can leave descriptors incomplete or stale.
- Reviewers need examples of the resulting signing text, alongside the JSON.
- Teams need a repeatable local and CI workflow before submitting descriptors for publication.

## 3. Users and jobs

| User | Job | Successful outcome |
| --- | --- | --- |
| Protocol developer | Add clear signing to an existing Foundry project | Commit a reviewed descriptor and example transactions without changing contracts |
| Contract reviewer | Review a contract or descriptor change | See coverage changes and readable signing-output diffs |
| Protocol maintainer | Keep descriptions aligned with releases | CI catches broken references, missing coverage, and rendering regressions |

Initial adoption hypothesis: teams maintaining user-facing contracts will value repository integration and regression checks enough to keep the tool in CI. Validate this with pilot teams before expanding into wallet tooling.

## 4. Goals and boundaries

### Goals

- Reach a first useful preview quickly in a working Foundry repository.
- Produce standard ERC-7730 descriptors that remain editable without this tool.
- Make missing decisions visible instead of silently guessing transaction meaning.
- Give CI deterministic checks and actionable diagnostics.
- Preserve developer edits when contracts and generated scaffolding change.
- Prepare files and examples for the ecosystem's existing review and publication process.

### Outside the MVP

- Hardhat integration, editor extensions, or changes to Foundry itself.
- Wallet software, transaction signing, private-key handling, or transaction broadcasting.
- Automatic registry publication, descriptor attestations, or wallet distribution.
- EIP-712 descriptor generation and testing.
- Automatic extraction of every transaction from Forge test traces.
- Arbitrary nested calls, multicall interpretation, and protocol-specific byte encodings.
- Automatic proxy discovery, upgrade monitoring, or proof that local code matches a deployed contract.
- AI-generated semantics as a requirement for using the product.

## 5. Primary workflow

1. The developer installs the tool and runs it inside an existing Foundry repository.
2. The tool resolves the Foundry project and builds it using the selected profile.
3. The developer selects production contracts. The tool inventories their callable write functions and scaffolds descriptors.
4. A guided setup collects project metadata and highlights semantic decisions, such as the token associated with an amount. The developer edits ordinary JSON where needed.
5. The developer supplies a sample transaction and local token/address metadata, then previews the rendered action and fields.
6. The developer saves the reviewed output as a test expectation and commits the files.
7. CI checks descriptor validity, function coverage, source changes, and expected rendering.
8. Before publication, the developer supplies real deployment bindings and exports a validated submission bundle.

All commands below describe the proposed interface; they are not available yet.

```sh
clear-signing init --contract src/Vault.sol:Vault
clear-signing preview --fixture clear-signing/fixtures/deposit.json --open
clear-signing check
clear-signing test
clear-signing export --out dist/clear-signing
```

Example outcome: for a vault whose reviewed configuration identifies USDC as its asset, a fixture calling `deposit(1000000, alice)` renders the action “Deposit,” the amount “1 USDC,” and Alice as the receiver. A change that removes the receiver or changes the amount formatting fails the saved expectation.

The preview shows a reference rendering. It does not promise the exact layout or feature support of any particular wallet.

## 6. MVP requirements

### R1. Foundry project discovery

- Support invocation from the project root or a subdirectory, plus explicit `--root` and `--profile` options.
- Read resolved Foundry configuration, respecting custom source/artifact directories, profiles, and remappings. Foundry already exposes configuration and compiler-output controls. [Foundry reference](https://getfoundry.sh/forge/reference/config/)
- Build through the installed `forge` executable; do not embed or fork Foundry.
- Identify contracts by source path and contract name to avoid collisions.
- Exclude tests, scripts, dependencies, interfaces, and abstract contracts from default selection. Allow explicit selection of deployable dependency contracts.
- Consume compiler ABI and available NatSpec/metadata. Missing documentation reduces suggestions but does not block basic scaffolding.
- Report missing Forge, incompatible versions, and compilation errors with a concrete next step.
- Support one Foundry project per invocation; monorepos use explicit roots.

### R2. Descriptor scaffolding and maintenance

- Generate a deterministic draft for each selected contract, covering external/public `nonpayable` and `payable` ABI functions, including inherited functions.
- Distinguish overloads by canonical signature. Handle standard ABI tuples and arrays within the declared renderer support matrix.
- Account separately for receive/fallback entry points; identify unsupported coverage explicitly.
- Suggest readable labels from names and documentation. Leave unresolved units, token mappings, and intent decisions in a separate review checklist.
- Do not infer that every integer is a token amount or hide fields based on their names.
- Include admin functions in the inventory. Exclusions require a recorded reason.
- Keep tool-specific review state outside standard descriptor JSON. Never embed TODO values as if they were real deployment addresses.
- Make initialization idempotent. A later `sync` command proposes additions and flags obsolete references while preserving human-authored labels and formatting rules.
- Treat generated scaffolds as drafts until required decisions are completed; schema validity alone does not mark them reviewed.

### R3. Local transaction preview

- Accept a fixture containing chain ID, destination, calldata, transaction value, descriptor reference, and local metadata needed for rendering.
- Provide terminal output and an optional browser view served on loopback.
- Show the action, ordered fields, target, network, descriptor, and any unresolved or unsupported values.
- Display raw values alongside readable values where metadata is missing. Never silently substitute guessed token decimals or labels.
- Render calldata through the same core used by snapshot tests.
- Use explicitly marked fixture bindings for undeployed contracts. These bindings cannot be exported as production deployment metadata.
- Perform no transaction signing or simulation. Rendering a call does not establish that it succeeds or has the claimed economic outcome.

### R4. Validation and coverage

- Validate against a pinned ERC-7730 schema and a documented supported-feature subset.
- Check function signatures, selectors, field paths, formatter requirements, and descriptor context consistency against selected artifacts and fixtures.
- Reject unsupported descriptor features with precise diagnostics instead of ignoring them.
- Track every in-scope function as covered, explicitly excluded, or missing. Report exclusions separately from coverage.
- Fail for missing coverage, invalid references, unresolved required decisions, and selector ambiguity within a selected contract.
- Detect source/build-input changes for selected contracts, including relevant dependencies. Require renewed review even when the ABI is unchanged; do not claim to understand the behavioral change.
- Store review fingerprints so unchanged inputs pass on later runs. Provide an explicit `review` command to record the developer's acknowledgement after inspection.
- Define coverage as descriptor presence and structural validation, never proof that descriptions are semantically correct.

### R5. Rendering tests

- Store transaction inputs and expected normalized action/field output in separate, readable files.
- Compare intent, labels, field order, and displayed values; exclude timestamps, absolute paths, and incidental presentation details.
- Use checked-in token metadata and address labels so tests work without RPC or external registries.
- Fail on missing expectations, context mismatches, unresolved rendering data, and unsupported encodings.
- Require at least one passing fixture per covered function for an export-ready bundle. Allow additional boundary cases such as zero, maximum approval amounts, and array inputs.
- Update expectations only through an explicit `test --update` operation. CI never updates snapshots.
- Reuse fixtures produced by a team's own Forge tests if they match the fixture format; automatic trace capture is deferred.

### R6. CI and automation

- Supply documented CI commands and an example GitHub Actions workflow.
- Offer noninteractive operation and JSON diagnostics with stable codes, file locations, affected signatures, and remediation text.
- Exit with `0` for success, `1` for validation/test failures, and `2` for invocation or environment failures.
- Run deterministically without network access once Forge, compiler versions, dependencies, and the tool are installed.
- Rebuild through Forge by default, benefiting from its compilation cache. `--no-build` requires a matching tool-recorded input fingerprint; missing or stale fingerprints fail with instructions to rebuild.
- Keep `check` and `test` from editing descriptors or expectations. Build/cache output is permitted.
- Document that source-review acknowledgement and snapshot acceptance are developer decisions, not third-party approval or attestations.

### R7. Submission export

- Export standard descriptor files, example transactions, and a validation summary to an explicit output directory.
- Require actual chain/address bindings, completed review decisions, and passing checks/tests.
- Keep proxy address and implementation artifact mappings explicit; do not substitute an implementation address for the user-facing proxy address.
- Distinguish locally validated bindings from deployment verification. MVP does not prove the supplied address runs the selected code.
- Exclude local draft bindings, caches, and tool-specific review state from descriptors.
- Follow the selected registry's documented file conventions and pinned schema version. Explain remaining submission steps; export does not imply acceptance or wallet availability. [Submission process](https://clearsigning.org/build/)

## 7. Proposed commands and repository files

| Command | Purpose | Writes |
| --- | --- | --- |
| `init` | Select contracts and scaffold configuration/descriptors | New project files; never overwrite existing authoring |
| `sync` | Reconcile current artifacts with descriptors | Explicitly requested scaffolding updates and review state |
| `preview --fixture <file> [--open]` | Inspect one transaction's rendered fields | No tracked files |
| `check` | Validate descriptors, coverage, and review fingerprints | Build/cache only |
| `review --contract <path:name>` | Record developer acknowledgement of current inputs and decisions | Review state |
| `test [--update]` | Compare or explicitly accept rendering expectations | Expectations only with `--update` |
| `export --out <directory>` | Produce a submission bundle after checks pass | Selected output directory |

```text
clear-signing.toml
clear-signing/
  descriptors/
    calldata-Vault.json
  fixtures/
    deposit.json
  expectations/
    deposit.json
  review.json
```

Configuration records contract identities, descriptor paths, exclusions with reasons, schema/renderer versions, and deployment mappings. Resolve relative paths from the configuration file. Disambiguate filenames when contract names collide.

Descriptors, fixtures, expectations, and review state belong in version control. Build fingerprints and temporary preview assets belong in ignored cache storage. The tracked review state records the accepted input fingerprint; caches store computation results.

## 8. Architecture and distribution direction

- Separate a reusable core for descriptor validation, rendering, fixtures, and coverage from the Foundry adapter and CLI/browser presentation.
- Prefer existing ERC-7730 libraries where their schema support, correctness, licensing, and packaging satisfy the requirements. The build guide lists TypeScript and Rust implementations; evaluate these against Clearsig before choosing an implementation language. [Available tooling](https://clearsigning.org/build/), [Clearsig](https://github.com/Cyfrin/clearsig)
- Pin schema and renderer versions. Upgrades are explicit and show changed renderings; normal runs do not fetch “latest.” ERC-7730 remains a draft and wallet support differs by feature. [Specification status](https://eips.ethereum.org/EIPS/eip-7730), [compatibility guidance](https://clearsigning.org/build/)
- Ship an independently installed CLI. Users should not need to add a JavaScript project or compile Rust to use it. Exact packaging follows the dependency evaluation.
- Target macOS arm64/x64 and Linux x64 for the first release; document other platforms as unverified until tested.
- Core operations use local files. No hosted account, API key, telemetry, or source upload is required. Optional AI assistance is a later feature with explicit source selection.
- Treat descriptors as data: reject path traversal and unintended remote references, bound recursive/large inputs, and escape content in the browser preview.

## 9. Release acceptance criteria

| Scenario | Required result |
| --- | --- |
| Default Foundry project | Init discovers a selected production contract and produces a useful draft |
| Custom directories/profile | Discovery and build use the resolved paths/profile without editing `foundry.toml` |
| Same contract name in two files | Selection and generated files remain unambiguous |
| Overloads, inheritance, tuples, arrays | Supported signatures and field paths resolve correctly; unsupported cases are explicit |
| Existing descriptor edited by a developer | Running init/sync does not erase labels or formatting decisions |
| New write function added | Check fails with the missing signature and a suggested next step |
| Implementation changed without ABI change | Check requests review of changed build inputs |
| Decimal mapping or receiver display changed | Test fails with a readable expected/actual diff |
| Wrong chain/address or missing metadata | Preview explains the problem; test/export fails |
| Undeployed contract | Local preview works with a marked fixture binding; production export remains incomplete |
| Offline clean CI run with prerequisites installed | Check/test produce repeatable results without network requests |
| Export-ready sample project | Bundle validates against the pinned schema and documented registry file conventions |

Validate with three small reference projects: a token, a vault, and a router using standard ABI tuples/arrays. Add a project with custom paths, multiple profiles, duplicate contract names, and an explicit proxy mapping. These examples establish the supported boundary, not universal protocol compatibility.

## 10. Success measures

Proposed pilot targets, to be measured rather than assumed:

- At least 4 of 5 pilot developers reach a first meaningful preview within 15 minutes, excluding installation and initial compilation.
- At least 3 pilot teams commit descriptors and fixtures and enable CI checks.
- Seeded missing-function, invalid-path, stale-review, and rendering-regression cases are all caught in the reference suite.
- Repeated generation on unchanged inputs produces no diff and preserves every human-authored field.
- After compilation, check plus 50 simple rendering fixtures completes within 10 seconds on a documented reference machine.

Collect timing and usability feedback through pilot sessions and voluntarily shared CI results. No automatic telemetry is needed for the MVP.

## 11. Delivery sequence

1. **Compatibility spike:** choose a renderer and schema version/subset; prove discovery, generation, and rendering on a token and vault; decide packaging and supported Forge versions.
2. **Authoring alpha:** ship init, safe sync, terminal/browser preview, fixture format, and guided review decisions.
3. **CI beta:** add coverage, change fingerprints, snapshot tests, JSON diagnostics, and the reference project matrix.
4. **Pilot release:** add submission export, distribution artifacts, and onboarding docs; run the pilot and refine the workflow.

Each stage exits when its scenarios are demonstrated end to end. Dates and staffing remain unset until the compatibility spike estimates the work.

## 12. Decisions still to resolve

- Which existing renderer provides the best verified ERC-7730 support and distributable dependencies?
- Which schema version and feature subset should v1 support for the target wallets and registry?
- Which minimum Forge version and stable-version test matrix are practical to maintain?
- How much semantic guidance can stay in terminal prompts before a browser editor becomes necessary?
- Which teams and contracts should be the first pilots?
- Should submission export later gain a separate, explicit command to open a registry PR?

These decisions do not change the product direction: a standalone Foundry-aware tool, with local authoring, preview, and regression checks as its core workflow.
