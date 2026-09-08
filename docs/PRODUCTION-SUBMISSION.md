# Production gate 1: Morpho submission exercise

Date: 2026-09-07. This is an internal compatibility exercise using a real protocol repository. It is not an official Morpho submission, maintainer approval, attestation or publication.

Follow-up on 2026-09-08: [all 23 Morpho fixtures now pass on Flex; broader Flex/Stax probes found specific portability failures](DEVICE-COMPATIBILITY.md). The single-case results below are the original milestone.

## Pinned inputs

| Input | Revision |
| --- | --- |
| [Morpho Blue](https://github.com/morpho-org/morpho-blue/tree/c3f327e49ddae623e2e3162f8468d58fbb79d1b8) | `c3f327e49ddae623e2e3162f8468d58fbb79d1b8` |
| [ERC-7730 registry](https://github.com/ethereum/clear-signing-erc7730-registry/tree/0318f9a51ec4fc7ba4aed6de5e315c8884d1fe38) | `0318f9a51ec4fc7ba4aed6de5e315c8884d1fe38` |
| [Sourcify registry runner](https://github.com/sourcifyeth/clear-signing-test-runner/tree/dae3cdabd0eab26173d7f7a31a2ca7e75bf07daf) | `dae3cdabd0eab26173d7f7a31a2ca7e75bf07daf`, unpatched renderer 0.2.2 |
| [Independent Rust runner](https://github.com/llbartekll/clear-signing/tree/10605ba78f3d6f3f13102e0f3a3ecbc44ac500dc) | `10605ba78f3d6f3f13102e0f3a3ecbc44ac500dc` |
| Upstream Python tools | `erc7730==1.0.10`, `check-jsonschema==0.38.0` |

The runner revisions and Python package versions are taken directly from the pinned registry's CI. Its Ledger job is separate from the two software renderer jobs.

## Source and deployment evidence

The actual `src/Morpho.sol:Morpho` contract was compiled with the repository's original Foundry configuration: solc 0.8.19, via IR, 999,999 optimizer runs and Paris EVM. Recursive submodules are required; the first nonrecursive dependency setup failed on the missing `ds-test` submodule and was corrected without changing protocol source.

The initial compilation of 71 files took 248.83 seconds. This exceeded the helper's previous two-minute build timeout. The helper now allows ten minutes for compilation, retains two minutes for Forge metadata commands, and reports `FORGE_TIMEOUT` separately from a missing executable.

The deployed reference is Ethereum mainnet `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`. [`check-morpho-deployment.ts`](../scripts/check-morpho-deployment.ts) compares the compiled artifact with a saved [Sourcify response](https://sourcify.dev/server/v2/contract/1/0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb?fields=all). It checks:

- Exact function names, input/output types and mutability against the verified ABI.
- Exact equality of all 15,570 executable runtime bytes against the verified recompilation, excluding compiler metadata.
- Matching immutable byte ranges and the domain separator independently calculated from the constructor formula, chain ID and contract address.
- Exact equality with Sourcify's stored on-chain executable runtime after substituting that domain separator.

Metadata differs because the current repository has licensing/comment/formatting changes and a different metadata hash setting. This is not a claim of byte-for-byte equality of the complete deployed binary. The public RPC request attempted during the exercise returned HTTP 403, so the evidence relies on Sourcify's stored chain data and does not establish an independent live RPC comparison. This check is an exercise script; the CLI still does not automatically verify deployment bindings.

## Generation and upstream checks

The preparation script generates fresh raw fields from the compiled ABI, creates synthetic coverage for every write function and imports the six Morpho Blue transaction examples from the pinned registry. Synthetic cases are encoding/rendering fixtures; they are not claimed to succeed if executed against the protocol. Registry-derived cases preserve chain, target, calldata and value. Export creates standardized unsigned transaction envelopes, while provenance retains original raw transaction bytes and available transaction hashes.

[`prepare-morpho-submission.ts`](../scripts/prepare-morpho-submission.ts) runs the built CLI's init, fixture, preview, review, test, check and export commands. Review acceptance is limited to this internal raw-field exercise, without protocol maintainer endorsement.

[`validate-morpho-registry.py`](../scripts/validate-morpho-registry.py) stages the exported JSON at the existing Morpho Blue paths in a disposable registry clone. This avoids introducing a duplicate address registration while exercising the registry layout. It is not a proposal to replace the existing curated descriptor with raw fields. Only the descriptor filename and test file's relative descriptor reference are adapted.

The wrapper runs the actual upstream descriptor schema, test schema, v2 linter, recommendation script, index generator, Sourcify runner and Rust runner. It checks each runner's case statuses as well as its process exit code; a report written successfully can still contain failed cases. The upstream v2 Python linter does not perform deployed ABI comparison, which is why the separate comparison above is necessary.

The completed run produced these results:

| Check | Result |
| --- | --- |
| Compiled ABI generation | All 17 write functions covered; no exclusions |
| Local review/check/test/export | 23 fixtures pass: six registry examples plus 17 synthetic cases |
| Upstream descriptor and test JSON schemas | Both pass |
| Upstream v2 Python linter | Pass, no warnings |
| Registry index validation | Pass: 900 calldata and 185 EIP-712 address/type entries remain buildable |
| Recommended fields | 17 nonblocking suggestions for `interpolatedIntent`; no deprecated ABI fields |
| Unpatched Sourcify registry runner | 23 pass, zero fail/error/skipped |
| Independent Rust registry runner | 23 pass, zero fail/error/skipped |
| Independent Luna rerun of exported Rust fixtures | 23 pass; helper's full 20-test suite also passes |
| Ledger Flex emulator with public Ethereum app 1.22.3 | One Morpho supply case clear-signed; no blind signing or fallback; all nine exported field pairs found |

See the [machine-readable summary](evidence/morpho-submission/summary.json), [Sourcify output](evidence/morpho-submission/sourcify-results.json), [Rust output](evidence/morpho-submission/rust-results.json), [deployment comparison](evidence/morpho-submission/deployment-check.json), and [fixture provenance](evidence/morpho-submission/provenance.json). The [generated descriptor](evidence/morpho-submission/registry/morpho/calldata-MorphoBlue.json) and [registry test file](evidence/morpho-submission/registry/morpho/testsv2/calldata-MorphoBlue.tests.json) retain a runnable directory layout with the upstream schemas. The saved test file was rerun successfully with the upstream Sourcify runner after copying it into this repo.

The Rust runner reports nonfatal warnings when scanning existing registry attestation JSON files as descriptors; these unrelated `sigs/` files lack `context`. The [complete log](evidence/morpho-submission/rust.log) is retained. The recommendation script's process success does not mean no suggestions: [all 17 suggestions are retained](evidence/morpho-submission/recommendations.log). Interpolated intents remain outside the helper's current supported subset.

## Reproduction

Use fresh disposable checkouts at the revisions above. Initialize Morpho's recursive submodules, run `forge build` once to install its compiler through Foundry, and build the helper. Do not modify the protocol's tracked source/configuration.

```sh
git -C /tmp/csh-production-morpho-blue submodule update --init --recursive
forge build --root /tmp/csh-production-morpho-blue
npm run build
npx tsx scripts/prepare-morpho-submission.ts /tmp/csh-production-morpho-blue
```

Install the upstream Python tools in a disposable virtual environment using the registry's `.github/requirements.txt` and `.github/requirements-schema.txt`. This run used Python 3.13.13; the upstream CI uses Python 3.12. Install registry dependencies with `npm ci`. Build the pinned Sourcify runner with `npm ci && npm run build`, and the pinned Rust runner with `cargo build --locked`.

```sh
python3 scripts/validate-morpho-registry.py \
  --registry /tmp/csh-production-registry \
  --bundle /tmp/csh-production-morpho-blue/submission-bundle \
  --python-bin /tmp/csh-production-python/bin \
  --sourcify-runner /tmp/csh-production-sourcify/dist/cli.js \
  --rust-runner /tmp/csh-production-rust/target/debug/cs-test \
  --out /tmp/csh-morpho-upstream-results
```

The registry staging script requires a clean clone and a new output directory; use new temporary locations or restore only the disposable clone before repeating it. The preparation script also requires a checkout without prior clear-signing authoring.

## Ledger signing-screen validation

Luna exercised the exported Morpho supply fixture with the public [Ledger Ethereum 1.22.3 Flex app binary](https://github.com/LedgerHQ/app-ethereum/releases/download/1.22.3/app-1.22.3-flex.elf), the [Device SDK at the registry's pin](https://github.com/LedgerHQ/device-sdk-ts/tree/2e35ed527c1a9aee852809a39ed2eaf76a415af1), and Speculos. The SDK was built locally with Node 22.22.3 and pnpm 10.28.2. This public route uses `--custom-app` and does not require private Coin Apps access or a gating token.

The [manifest](evidence/morpho-submission/ledger/manifest.json) records the exact command, ELF SHA-256 and resolved Speculos image digest. The image used for this trial differs from the registry CI's pinned image; this is an independently exercised public emulator route, not a claim to have run the registry's disabled private Ledger job.

The tester exited 0 with `clear_signed`, `clearSigningType=eip7730`, `usedFallback=false` and `blindSigning=false`. Its screen analyzer found all 13 expected text snippets. A separate comparison matched all nine exported label/value pairs together in the captured screens, ignoring device line wrapping. The parent agent also inspected the field and final confirmation screenshots. A local emulator signature was produced; no transaction was broadcast.

- [Morpho and token fields](evidence/morpho-submission/ledger/screenshots/screenshot_4.png)
- [Amounts and beneficiary](evidence/morpho-submission/ledger/screenshots/screenshot_6.png)
- [Final Supply confirmation](evidence/morpho-submission/ledger/screenshots/screenshot_8.png)
- [Transaction signed](evidence/morpho-submission/ledger/screenshots/screenshot_10.png)
- [All-field screen comparison](evidence/morpho-submission/ledger/all-field-screen-check.json)
- [Complete tester log](evidence/morpho-submission/ledger/tester-with-apps.log)

The first invocation failed because unset `COIN_APPS_PATH` produced an invalid Docker volume. Setting it to an empty directory fixed the setup while `--custom-app` continued to supply the public ELF. The successful run reported two nonfatal SDK context errors associated with `ExternalPluginContextLoader`; the EIP-7730 path, expected screens and signature nevertheless completed. These errors remain recorded for follow-up, rather than being presented as a warning-free device test.

To reproduce from the pinned SDK checkout after building its libraries:

```sh
COIN_APPS_PATH=/path/to/empty-directory pnpm cs-tester cli raw-file \
  /path/to/clear-signing-helper/docs/evidence/morpho-submission/ledger/raw-supply.json \
  --device flex \
  --custom-app /path/to/app-1.22.3-flex.elf \
  --erc7730-files /path/to/clear-signing-helper/docs/evidence/morpho-submission/registry/morpho/calldata-MorphoBlue.json \
  --screenshot-folder-path /path/to/new-screenshots \
  --log-file /path/to/new-tester.log --file-log-level debug --log-level info
```

Use the recorded binary hash and emulator digest when preparing a reproduction. The successful run selected `latest` and recorded its resolved digest. This SDK's `--docker-image-tag` accepts a tag, not a digest. For a strictly pinned rerun, start Speculos directly by digest and use `--external-speculos --speculos-port <port>`; that alternative invocation is documented in the manifest but was not itself rerun here. The fixture uses the tester's local emulator account; no funded account is needed. All emulator containers started by this exercise were removed after validation.

## Remaining release gate

Update 2026-09-08: [live RPC evidence](evidence/morpho-submission/live-rpc-2026-09-08.json) now compares two Ethereum RPC endpoints at finalized block 25,931,171. Both return identical full runtime code; its 15,570 executable bytes match the compiled runtime after constructor-domain substitution. [Luna independently repeated the check](evidence/morpho-submission/live-rpc-luna-2026-09-08.json). This closes the earlier exercise's lack of live RPC access; the general CLI still does not verify deployments or proxies.

The first complete source-to-signing-screen path is now demonstrated for Morpho supply on one emulator target. Remaining functions, nested arrays, other devices and physical hardware still need device coverage. Protocol maintainer review, attestation and publication remain pending. Track those outcomes in [the release checklist](PRODUCTION-READINESS.md); this exercise does not declare the whole product production-ready.
