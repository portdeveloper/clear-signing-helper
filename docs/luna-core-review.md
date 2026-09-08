# Luna core review

Date: 2026-09-07

I independently reviewed the current descriptor, Foundry adapter, and registry-test changes and ran the integration suite. All 8 integration tests passed; the full suite remains covered by the earlier 13-test run. The passing cases include the mined Anvil transaction, tuple-array ordering, full named-signature validation, clean-checkout fingerprinting, external remapping mutation detection, production export, preview escaping, and an absolute external import authorized through `profile.allow_paths`.

## Conclusions

`src/descriptors.ts` now generates a sequential `path: <name>.[]` group for arrays of tuples. Rendering a two-element `send((uint256 amount,address recipient)[] items)` fixture produced the ordered values `1, recipient1, 2, recipient2`. `validateDescriptor` recursively flattens groups for leaf coverage and rejects a descriptor whose format key does not use the compiler's full argument names. The prior signature/path and array-ordering findings are resolved.

`src/foundry.ts` confines Forge output, cache, and build-info directories with `safePath`, resolves metadata sources through declared roots/remappings/`allow_paths`, and fingerprints only the relevant build configuration. RPC URL/JWT/API-key settings are excluded. The external-remapping integration test changes a dependency after review and `--no-build` correctly returns `STALE_BUILD`. The new absolute-import `allow_paths` case builds and passes `check --no-build`, confirming the declared root is accepted.

`src/registry.ts` emits unsigned EIP-1559 `rawTx` values, lowercases and merges fixture token/address metadata, rejects conflicting metadata, flattens grouped rendered fields in order, and validates the result against the pinned ERC-7730 tests-v2 schema. The production export integration test confirms the generated test file is schema-valid and has the expected intent.

## Final result

The previously reported `allow_paths` blocker is resolved: `sourceRoots` now includes `config.allow_paths`, while those broad roots are used for metadata-source enumeration rather than recursively walked as ordinary source roots. The real Forge integration confirms both acceptance of an authorized absolute import and stale-build detection after external dependency mutation.

No remaining blocker was found in sequential descriptor grouping, full named-signature validation, output confinement, declared external-source handling, RPC-credential exclusion, external-remapping fingerprinting, or registry v2 output.
