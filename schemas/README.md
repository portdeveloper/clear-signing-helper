# Pinned upstream schemas

Downloaded 2026-09-07. Runtime validation uses these bundled copies and never fetches a schema URL.

- `erc7730-v2.schema.json`: https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json
  - Upstream version: 2.0.0; specification: https://eips.ethereum.org/EIPS/eip-7730 (CC0).
  - File SHA-256: `999c1e7366d58cb10d207a7396331e990a0d9f40f0b8b269c6bab4df78682dc1`.
- `erc7730-tests-v2.schema.json`: https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master/specs/erc7730-tests-v2.schema.json
  - Registry: https://github.com/ethereum/clear-signing-erc7730-registry.

`ENGINE.schema` in the CLI is the SHA-256 of canonicalized schema JSON, rather than the original file bytes. Changes require explicit compatibility review and a tool release.
