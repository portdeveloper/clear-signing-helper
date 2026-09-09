# Physical wallet acceptance handoff

Physical-device and retail trust-path validation remain pending. This packet tracks production wallet acceptance; it is not a prerequisite for distributing the developer preview CLI.

Owner action needed: provide access to a Ledger Flex or Stax and a wallet integration/maintainer who can supply the reviewed descriptor through a supported physical-device trust path. Funds are not needed for display/signature-only validation. Use a dedicated empty test account; never send a seed phrase or private key to the helper or a reviewer.

## Why the emulator result cannot close this gate

The pinned SDK's `EthereumTransactionTesterCli.ts` selects CAL mode `test` when `--erc7730-files` is present. Its `SpeculosServiceController.ts` only enables production signatures (`-p`) in production CAL mode. Our injected-descriptor runs therefore validate application behavior under test trust. The CLI used here is a Speculos runner, not a tested USB hardware runner.

Source: [SDK CLI at the tested commit](https://github.com/LedgerHQ/device-sdk-ts/blob/2e35ed527c1a9aee852809a39ed2eaf76a415af1/apps/clear-signing-tester/src/cli/EthereumTransactionTesterCli.ts), [Speculos controller](https://github.com/LedgerHQ/device-sdk-ts/blob/2e35ed527c1a9aee852809a39ed2eaf76a415af1/apps/clear-signing-tester/src/infrastructure/service-controllers/SpeculosServiceController.ts).

A development device test must be labeled as such. A retail distribution claim additionally needs a production trusted descriptor path. We cannot manufacture that approval or substitute the emulator's test trust on a retail device.

## Ready inputs

- [Morpho exported descriptor and testsv2 files](evidence/morpho-submission/registry/morpho/).
- [23 Morpho expected screen results](evidence/device-matrix-2026-09-08/morpho-flex/result.json).
- [WETH and negative control input cases](evidence/device-matrix-2026-09-08/).
- [Version pins and observed failures](DEVICE-COMPATIBILITY.md).

Start with Morpho supply and WETH deposit, then run all 23 Morpho cases on the intended device/app version before declaring that matrix complete. Record the app, OS, wallet SDK, descriptor SHA-256, fixture name and trust mode for each attempt.

## Acceptance procedure

1. Confirm the wallet uses the exact candidate descriptor; a curated registry descriptor for the same address is a different input.
2. Request signing without broadcasting. Capture every review page before signing or rejecting. Rejecting is enough for visual review; signature production is a separate recorded check.
3. Compare complete label/value pairs and order with the exported expected output. Check native value, beneficiary/recipient, amounts and every market parameter. Inspect full addresses and long values, including all continuation screens.
4. Record whether the flow used EIP-7730 clear signing, any fallback/blind signing, truncation, missing fields or context errors. A `clear_signed` status alone does not pass the visual check.
5. Run the two-entry tuple-array control. The previously observed column-wise ordering must remain a failed control unless the new device/app actually fixes it. Do not add unsupported shapes to the launch scope based on the happy path.
6. Have the tester sign the result record and link captures. The owner then decides whether to approve a production compatibility claim for the tested matrix.

## Result record

```text
Tester / date:
Device / OS / Ethereum app / wallet SDK:
Trust path: development or retail production (describe descriptor delivery)
Candidate descriptor SHA-256:
Fixture:
All labels and values complete and correctly paired: yes / no
Order correct: yes / no
Native value and target correct: yes / no
EIP-7730 / fallback / blind signing:
Signature produced or intentionally rejected:
Screens / logs:
Findings and disposition:
```

No production acceptance is recorded yet. Do not enable blind signing to turn a failed clear-signing case into a pass.
