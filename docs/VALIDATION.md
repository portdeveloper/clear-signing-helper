# Validation record

Updated: 2026-09-08. This records executed checks, rather than planned acceptance criteria.

## Environment

- Linux ARM64; Node 22.22.3; npm 10.9.8. The same 31-test suite also passes using verified official Node 24.20.0 ARM64 binaries in a temporary directory.
- Forge, Anvil, and Cast 1.7.1; Solidity 0.8.28 for automated examples and 0.8.19 for the separate Morpho exercise.
- ERC-7730 schema 2.0.0 (vendored copy); Sourcify renderer 0.2.2 with the pinned signed-integer fix.

## Executed checks

| Check | Result |
| --- | --- |
| TypeScript typecheck and bundled CLI build | Passed |
| `npm test` | 31 tests passed, zero skipped on Node 22 and 24; independently rerun by Luna |
| Pinned registry corpus | 278 calldata descriptors / 1,435 function entries generate and render |
| Registry raw-transaction replay | 574 render; 31 appended-suffix transactions explicitly rejected |
| Sourcify ABIs and Foundry ABI-shape harnesses | Four verified ABIs and twelve compiled harnesses pass |
| Real Morpho Blue Foundry repo → export → upstream registry runners | 17 write functions; 23/23 cases pass both unpatched Sourcify and independent Rust; schema/lint/index pass |
| Live Morpho runtime comparison | Two Ethereum RPC endpoints agree at finalized block 25,931,171; 15,570 executable bytes match compiled constructor-bound code; independently repeated by Luna |
| Additional source pilots | OpenZeppelin ERC4626Mock: nine covered functions; Uniswap router: 14 covered functions with receive/callback exclusions; both installed-CLI strict exports pass, independently repeated by Luna |
| Ledger Flex emulator / public Ethereum app 1.22.3 | All 23 Morpho fixtures clear-signed; all field pairs in order; no blind signing, fallback or broadcast |
| Flex and Stax representative shape probes | WETH native value passes; tuple-array ordering failures retained; Flex int128 field-description rejection isolated with controls |
| Screen evidence checker | Four tests pass: ordering, wrapping/duplicate captures, numeric/hex prefixes, truncated labels |
| Standard reference Solidity suite | 3 passed |
| Custom-layout Solidity suite | 2 passed |
| Duplicate-contract-name Solidity suite | 2 passed |
| `npm audit` | Zero reported vulnerabilities after updating build tooling |
| Historical clean install with renderer postinstall patch | Passed at the earlier 20-test milestone; superseded by maintained vendoring |
| Current clean builds and package installation | Independent source copies, including spaces in paths; identical CLI/tarball hashes; fresh install with scripts disabled; installed Foundry workflow and signed-int rendering pass |
| Upgrade/rollback | Distinct unpublished candidate tarballs installed in sequence; consumer data preserved; exact hashes in release verification |
| Installed package against a fresh Foundry project | Signed `int24[][]`, minimum `int128`, empty arrays and native value rendered correctly; review, check and snapshot test passed |
| Single bundled `dist/cli.js` copied outside the repo | Independently exercised by Luna; works with Node 22 |
| Network syscall trace of CLI check/test and Forge child processes | No AF_INET/AF_INET6 sockets or network connections observed |

The syscall trace used `strace -f -e trace=network` after prerequisites were installed. It verifies the exercised local workflow made no internet connections. It is not a claim that package installation or an initial compiler download is offline. A network namespace test was unavailable on this host, so no network-isolation claim is made.

The final [distribution record](DISTRIBUTION.md) and [release verifier JSON](../release/release-verification.json) describe current packaging. [Source pilot evidence](PILOT-VALIDATION.md) includes deployment receipts and a mined OpenZeppelin ERC4626 deposit with exact asset/share balance assertions. Ledger emulator tests used injected descriptors under test CAL trust; physical/retail acceptance remains open. macOS and GitHub Linux runner jobs are configured but have not executed here.

## Actual transaction validation

`test/anvil.test.ts` starts a loopback Anvil instance, deploys the example token and vault, mints test tokens, approves the vault, and mines a deposit. It then:

1. Fetches the mined transaction from Anvil.
2. Confirms the receiver gained 1,000,000 shares and the vault received 1,000,000 token units.
3. Uses the actual transaction destination, sender, calldata, and value as the clear-signing fixture.
4. Uses the deployed token's name, symbol, and decimals as local metadata.
5. Confirms the output is “1 USDC” with Alice as the receiver and the raw receiver address retained.
6. Independently encodes the deposit with `cast calldata` and compares it to the mined transaction bytes.
7. Saves and reruns the rendering expectation.

This test uses unlocked local Anvil accounts. The CLI does not receive a private key, broadcast transactions, or need testnet funds.

## Failure cases exercised

Automated integration tests run the built executable against temporary copies of real Solidity projects. They verify failures for missing review, source changes without ABI changes, stale artifacts, missing expectations, changed signing output, missing function coverage, invalid paths/types, omitted arguments, unsupported external includes, unresolved token metadata, malformed/trailing calldata, unknown selectors, invalid transaction values, mismatched chain/address bindings, and local-only export.

They also verify preservation of developer edits, explicit snapshot updates, clean-checkout review portability, external remapping dependency changes, duplicate contract identities, custom Foundry paths/profiles, and escaping symlinks/output paths. Registry export is validated against the vendored registry test schema.

Rendering tests check amount precision for decimals 0/6/18 at zero, one, and maximum uint256; matching full compiler argument names; sequential pairing of tuple-array members; escaped browser HTML; a tokenized loopback URL; and restrictive response headers.

The v0.2 tests add exact signed values at every width from 8 through 256 bits, nested fixed/dynamic arrays with empty inner arrays, and explicit engine upgrades that preserve descriptors while invalidating review. The [registry compatibility report](REGISTRY-COMPATIBILITY.md) records corpus provenance, exact coverage and remaining gaps.

The separate [production submission exercise](PRODUCTION-SUBMISSION.md) compiles real Morpho Blue source, compares its executable runtime with Sourcify's verified data, exports all write functions, and runs the upstream registry tools. It also exposed and fixed an overly short build timeout. Its network-dependent setup is deliberately separate from the ordinary automated test suite.

The [expanded device matrix](DEVICE-COMPATIBILITY.md) records the full Morpho run and known failures in independent consumers. A new regression test uses a real Foundry tuple-array contract to verify that ordinary export preserves portability findings and strict export creates no bundle. Passing local tests does not erase failed device cases.

## Independent Luna verification

- [Registry compatibility validation](luna-registry-validation.md): complete corpus, exact argument values, nested arrays, signed-integer patch, expansion bounds and final 20-test suite.
- [Foundry and standalone-package validation](luna-foundry-validation.md): real Forge suites; custom layout/profile; duplicate identities; source-only router projects; exact two-element tuple-array field ordering; README quickstart.
- [Adversarial validation](luna-adversarial-validation.md): stale sources with unchanged ABI, exact preservation of hand edits, and synchronization after adding a real Solidity function.
- [Core review](luna-core-review.md) identified the initial tuple-array ordering problem and compiler-name validation gap. Both were fixed and received regression tests. A final `allow_paths` compatibility gap was also fixed and independently rechecked; the final core review records no concrete blockers in its audited areas. A suspected external-remapping freshness issue was withdrawn after real Forge probes detected both relative-symlink and absolute dependency changes correctly.

## Boundaries still unverified

- macOS, Windows, Linux arm64, and other Node/Foundry/compiler versions.
- Independent live RPC deployment comparison, physical hardware and broad wallet/device coverage. Morpho uses Sourcify's stored chain data; the current matrix covers 23 Flex Morpho fixtures and selected Flex/Stax shapes.
- Registry acceptance, attestations, or publication.
- Broader ERC-7730 features outside the documented supported subset.
- Product pilot targets (onboarding time, adoption, and user understanding).

Passing these tests does not prove a description accurately represents arbitrary contract behavior. Human review of transaction intent and token/field semantics remains part of the workflow.
