# Pinned upstream schemas

`erc7730-v2.schema.json` updated 2026-10-15; `erc7730-tests-v2.schema.json` downloaded 2026-09-07. Runtime validation uses these bundled copies and never fetches a schema URL.

- `erc7730-v2.schema.json`: https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json
  - Upstream version: 2.1.0 (identical at eips.ethereum.org, ethereum/ERCs `assets/erc-7730/` and the registry's `specs/`, which registry CI validates against); specification: https://eips.ethereum.org/EIPS/eip-7730 (CC0).
  - 2.1.0 over 2.0.0: every format requires a non-blank `intent`; `amount` gets typed `threshold`/`message` params.
  - File SHA-256: `3561dde8368e765951b797f8cccf23da27eb6987d3db8a194fd2b9a018169efc`.
- `erc7730-tests-v2.schema.json`: https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master/specs/erc7730-tests-v2.schema.json
  - Registry: https://github.com/ethereum/clear-signing-erc7730-registry.

`ENGINE.schema` in the CLI is the SHA-256 of canonicalized schema JSON, rather than the original file bytes. Changes require explicit compatibility review and a tool release.
