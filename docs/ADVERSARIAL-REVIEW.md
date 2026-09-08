# Adversarial automated review

This review records deterministic automated checks for malformed transaction inputs,
descriptor coverage, deployment binding, metadata validation, hostile display strings,
and resource limits. It is a test record, not a human audit or deployment attestation.

The checks live in `test/adversarial.test.ts` and use the public descriptor and fixture
validation/rendering paths. Cases include truncated, odd-length, oversized, and
non-payable-value calldata; duplicate and invalid metadata addresses; mixed-case
deployment targets; nested array expansion at the node ceiling; and HTML-looking labels,
intents, and local names.

## Finding

Before the payable-value coverage fix, `validateDescriptor` accepted a payable format
after its scaffolded `@.value` field was removed. A fixture could therefore carry native
value while the descriptor did not require that value to be shown. The regression test
expects the `UNDISPLAYED_NATIVE_VALUE` transaction-value coverage diagnostic. A payable
format must keep native value visible or be explicitly excluded.

## Boundaries and unsupported cases

The tests exercise the helper's declared subset: contract calldata and ERC-7730 v2
descriptor formats. They do not claim wallet compatibility, deployment verification,
proxy correctness, registry acceptance, or safety of arbitrary external renderer
implementations. Unsupported descriptor features remain explicit diagnostics rather
than being inferred by these tests.

Run with `npm test` after the normal build dependencies are installed.

## Executed corpus and independent rerun

The final suite has 31 tests (22 existing plus nine adversarial tests), passing on Node 22.22.3 and 24.20.0 on Linux ARM64. Luna independently reran the full suite and inspected the changed validation, resource, file and presentation paths.

- Integer corpus: 12 signed/unsigned types, 16 boundary/generated values each, 576 truncation/suffix mutations. Existing signed-rendering tests additionally cover every declared signed width from 8 to 256 bits.
- Nested corpus: 131 fixed/dynamic tuple-array cases, including 128 seeded cases. Complete leaf values are compared with an independently flattened input tree, retaining address checksums, multiplicity and order. Two malformed offset/length encodings per case are rejected with typed failures.
- Descriptor and fixture preflight: oversized and deeply nested trees fail with `INPUT_LIMIT` before recursive schema/render work.
- Native payable value omission, null metadata, invalid/duplicate metadata addresses, mismatched binding, markup, terminal controls and bidi overrides have regressions.

The seed is deterministic for reproduction; this is bounded property testing rather than an exhaustive fuzzer. The file review found no additional concrete issue in the inspected scope; path checks do not eliminate races against a concurrent hostile local filesystem process. Semantic intent and token-unit correctness remain human review tasks.
