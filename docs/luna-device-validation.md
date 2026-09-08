# Independent Luna device and portability review

Date: 2026-09-08. Two Luna verification tasks independently exercised the expanded Morpho device matrix and reviewed the failure evidence and resulting product changes.

## Executed checks

- All 23 Morpho fixtures passed on the public Flex Ethereum 1.22.3 app in Speculos. All expected label/value pairs appeared in descriptor order, with EIP-7730 clear signing and no fallback or blind signing. The run captured 212 screenshots.
- `npm test`: 22 passed, zero failed.
- `python3 -m unittest discover -s scripts -p test_ledger_screen_check.py`: four passed.
- Normal export writes `portability.json`; strict export rejects known issues before creating an output directory.
- Scalar Morpho tuples are not incorrectly flagged. Bundler tuple arrays, Feral nested arrays and Ekubo signed fields produce the intended findings.

## Findings incorporated

The original device evidence checker incorrectly passed Morpho Bundler because every value appeared somewhere on screen. Luna independently confirmed columnwise rendering instead of sequential tuple pairing. The final checker requires field order and complete pairs, and rejects numeric/hex value prefixes. Saved Flex and Stax results now reject the Bundler case despite the tester's `clear_signed` status.

Luna confirmed both Feral tuple reordering and the truncated label. It also confirmed the Ekubo rejection occurs at the fifth field description, `int128 Amount`, for positive/negative values and long/short labels. The device never reaches the later `int256` field. Although the tester calls that flow `blind_signed`, the terminal state contains `6a80` and no signature. The final evidence retains that state instead of recording null fallback/error information.

The final code review requested narrower wording for signed-integer findings. That wording was corrected: the tested negative `int128` fails unpatched Sourcify; the pinned Rust runner fails the tested `int128` and `int256`. The report does not imply Sourcify fails every signed width or that the device's `int256` behavior was tested.

## Limits

Luna verification is not protocol maintainer approval or a human security audit. Passing device cases cover the recorded emulator/app/SDK combinations only. The documented upstream and device failures remain failures; the portability gate surfaces them rather than fixing those consumers.

See the [compatibility report and complete evidence](DEVICE-COMPATIBILITY.md).
