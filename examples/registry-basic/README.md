# Generated basic registry examples

These are actual generator outputs, not copied registry display rules. They show function names and all argument values as raw fields. Review intent, labels, token semantics, and deployment bindings before use.

- WETH, Uniswap Router02, Morpho Blue and Safe use the complete write-function ABI fetched from Sourcify for the address in the corresponding registry submission. Payable functions include native value in wei. These examples may cover more functions than the original registry descriptor.
- Ekubo, Feral File, OKX and ParaSwap demonstrate complex ABI shapes, including nested arrays, from registry function signatures. Those signatures do not specify mutability, so these are unbound ABI-shape drafts. Real Foundry compilation supplies the actual mutability and adds native value fields where needed.

Nothing in this folder has been submitted to a registry or externally reviewed for protocol semantics. Nested group rendering on hardware wallets is device dependent. Inner transaction bytes, compressed routes, and encrypted values remain raw.

Regenerate from the pinned fixtures:

```sh
npx tsx scripts/generate-registry-examples.ts
```

See [the compatibility report](../../docs/REGISTRY-COMPATIBILITY.md) for evidence and limitations.
