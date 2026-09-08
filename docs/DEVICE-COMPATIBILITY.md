# Device compatibility findings

Executed 2026-09-08. These results extend the [first Morpho submission exercise](PRODUCTION-SUBMISSION.md). Local rendering, upstream software rendering and device rendering are separate checks.

## Tested versions and inputs

- Ledger Device SDK commit `2e35ed527c1a9aee852809a39ed2eaf76a415af1`.
- Public Ledger Ethereum app 1.22.3, Flex and Stax ELF releases.
- Speculos digest `sha256:6ed9eefd51cddd862b746719af4cd7a3265fe43d0588c388359753cab8d46d11`, selected through explicit local Docker tags referencing that digest.
- The same pinned registry, Sourcify runner and Rust runner used in the original submission exercise.

The [manifest](evidence/device-matrix-2026-09-08/manifest.json) records binary URLs/hashes, counts and detailed outcomes. This was local emulator testing with dummy accounts. No transaction was broadcast and no testnet funds were needed.

The SDK selects test CAL signatures when `--erc7730-files` injects descriptors. These runs used that test trust mode, not retail production descriptor delivery. The [physical acceptance packet](HARDWARE-ACCEPTANCE.md) documents the source evidence and required production trust handoff.

Morpho Blue uses the descriptor exported from its real compiled source. The other cases are explicitly synthetic fixtures generated from existing registry ABI signatures and address bindings. They test encoding and display, not whether the transactions would execute successfully on-chain. They retain raw values and opaque inner-call bytes.

## Results

| Case | Helper preview | Pinned Sourcify | Pinned Rust | Ledger Flex | Ledger Stax |
| --- | --- | --- | --- | --- | --- |
| Morpho Blue: all 17 write functions, 23 fixtures | Pass | 23/23 | 23/23 | 23/23, including field order | Not tested |
| WETH `deposit()`, native value in wei | Pass | Pass | Pass | Pass | Pass |
| Morpho Bundler: two tuple-array entries | Pass | Pass | Pass | Values visible; tuple order fails | Same order failure |
| Feral File: nested tuple arrays | Pass | Nested groups unsupported | Nested fields unresolved | Tuple order fails; one label truncated | Same failures |
| Ekubo: negative `int128` and `int256` arguments | Pass | Negative `int128` wrong | Negative integers wrong | `int128` field rejected before signing | Not tested |

The [Morpho matrix](evidence/device-matrix-2026-09-08/morpho-flex/result.json) contains all 23 outcomes and ordered field checks, with 212 screenshots. Luna ran this matrix independently; the parent reran the stronger text-pair checks against its captured screens and confirmed 23 passes. All were EIP-7730 clear-signing paths with no fallback or blind signing.

The shape-run reports preserve separate fields for tester status, signature production, fallback, blind signing, complete label/value pairs and field order: [Flex](evidence/device-matrix-2026-09-08/shapes-flex/summary.json), [Stax](evidence/device-matrix-2026-09-08/shapes-stax/summary.json), [software runners](evidence/device-matrix-2026-09-08/software/summary.json).

## Why “clear signed” is not enough

For two Bundler entries, the generated descriptor and helper preview keep each tuple together:

```text
To 0x…11 → Data 0xabcd → Value 111 → …
To 0x…22 → Data 0x1234 → Value 222 → …
```

Both Ledger targets instead displayed:

```text
To 0x…11 → To 0x…22
Data 0xabcd → Data 0x1234 → Value 111 → Value 222 → …
```

The tester reports `clear_signed`, and all values are present, but sequential tuple grouping is lost. Our initial presence-only checker also passed this case. The final gate rejects it because field order does not match. The old result is retained as `previousPresenceOnlyPassed` in the evidence, rather than hidden.

Feral File showed the same problem: recipients 1 and 2 appeared before their corresponding Bps values. Its `Pay By Vault Contract` label was also truncated to `Pay By Vault Cont...`, producing the tester's `partially_clear_signed` status. The emulator did produce a signature. Full-label matching and tuple-order matching both fail; this is not a missing-value decoding claim.

[`ledger_screen_check.py`](../scripts/ledger_screen_check.py) now collapses duplicate polling captures, requires complete label/value pairs, rejects prefixes of larger numeric/hex values and checks display order. It is a conservative text check, not a universal screen parser or pixel-layout proof. Four regression tests cover the observed ordering false positive, wrapped values, numeric/hex prefix false positives and truncated labels.

## Signed integer isolation

The Ekubo fixture failed while supplying the fifth field description, `Amount`, typed `int128`: the device returned `6a80 Invalid data`. Positive values, negative values, a shortened final label and the original label all produced the same rejection. Those [control results](evidence/device-matrix-2026-09-08/controls-flex/summary.json) rule out negative transaction values or the final label length as the sole cause of this device failure.

The tester calls these cases `blind_signed`, but its final SDK state contains an error and `signature=null`. No signature was produced. The failed flow attempted fallback and reported `isBlindSign=true`; those states are retained in the final reports. The later `int256` field was never reached, so this does not establish device behavior for `int256`.

Separately, both unmodified software runners mishandle the negative values: Sourcify 0.2.2 gets the narrower signed value wrong; the pinned Rust runner renders both tested negatives as unsigned values. The helper's patched renderer displays them correctly. That local fix is not embedded in exported descriptor JSON.

## SDK context warnings

All 23 Morpho cases succeeded despite context-error counters: 17 reported two errors and six reported three. Luna traced optional external-plugin lookup failures and directly observed HTTP 403 `Not Authorized` from the SDK's CAL endpoint with its test origin token. The injected calldata descriptors still loaded and clear signing completed. This explains why an optional context error does not by itself determine the signing result; it does not grant access to the rejected endpoint or prove other context failures harmless.

## Product changes

`check` and `export` now report known portability findings for nested arrays, multi-field tuple arrays and signed integers. Export writes `portability.json` alongside its validation report. These findings are conservative ABI-shape warnings tied to observed consumer limitations; they do not modify or weaken the descriptor.

```sh
clear-signing check --strict-portability
clear-signing export --out submission --strict-portability
```

Strict mode exits with a validation error when these known classes are present and refuses export before creating a bundle. Ordinary authoring/check/export remains available with visible findings. An empty finding list is not wallet certification: the CLI does not run a device emulator or verify every consumer. Scalar tuples such as Morpho Blue market parameters are not incorrectly classified as tuple arrays.

At this matrix milestone the automated suite passed 22 tests, including a real Foundry tuple-array project whose normal export carries the report and whose strict export writes no bundle. The later [hardening review](ADVERSARIAL-REVIEW.md) extends the suite to 31 tests.

[Independent Luna review](luna-device-validation.md) reran all 22 automated tests and the four screen-check tests, checked the saved device failures, and verified the strict export behavior.

## Reproduce

From this checkout, with the pinned SDK already built and public app binaries downloaded:

```sh
npx tsx scripts/prepare-device-cases.ts /tmp/new-device-cases
docker tag ghcr.io/ledgerhq/speculos@sha256:6ed9eefd51cddd862b746719af4cd7a3265fe43d0588c388359753cab8d46d11 ghcr.io/ledgerhq/speculos:csh-device-20260908
python3 scripts/run-ledger-shape-cases.py \
  --sdk /path/to/pinned/device-sdk-ts \
  --cases /tmp/new-device-cases \
  --app /path/to/app-1.22.3-flex.elf \
  --out /tmp/new-flex-results
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_ledger_screen_check.py'
```

The runner creates the required screenshot directory, uses ports 19191/29191 and records per-case commands. Use `--device stax` with the Stax ELF for that target, and `--case <name>` to select cases. Run it sequentially when using these fixed ports. Outcomes failing the final field gate return a nonzero exit status even when the SDK reports `clear_signed`.

## Remaining release decisions

The tested Morpho Blue and WETH paths are evidence for a limited initial release. Broad tuple-array portability and the tested signed field remain release blockers for protocols using those shapes. Physical devices, other app/SDK versions, EIP-712 and suffix-bearing calldata remain outside this matrix. Upstream fixes and protocol maintainer review have not been requested or published.
