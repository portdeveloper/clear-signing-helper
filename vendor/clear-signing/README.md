# @ethereum-sourcify/clear-signing

Reference TypeScript implementation of [ERC-7730: Structured Data Clear Signing Format](https://eips.ethereum.org/EIPS/eip-7730).

This library transforms raw transaction calldata and EIP-712 typed data into human-readable display models, enabling wallets to show users exactly what they're signing.

Designed to drop into wallet codebases:

- Runs on modern browsers, Node.js (≥22), and React Native (ESM + CJS).
- Single runtime dependency: [`@noble/hashes`](https://github.com/paulmillr/noble-hashes).
- Pure formatting: No RPC client, no token/chain/ENS fetching; external data is delegated to the wallet via [`ExternalDataProvider`](#externaldataprovider).
- No internal caching: The caller controls when descriptors and indexes are fetched.

## Wallet Integration Guide

Integrating into a wallet? See the [Wallet Integration Guide](GUIDE.md).

## Installation

```bash
npm install @ethereum-sourcify/clear-signing
```

## Quick Start

Recommended pattern: fetch the registry index once at app startup and pass it to every `format()` / `formatTypedData()` call. The library does not cache fetched indexes internally — without an index, every format call re-fetches.

```typescript
import {
  format,
  fetchPrebuiltRegistryIndex,
} from "@ethereum-sourcify/clear-signing";

// At app startup — fetch once, keep in memory.
const index = await fetchPrebuiltRegistryIndex();
const baseOpts = {
  descriptorResolverOptions: { type: "github" as const, index },
  externalDataProvider: {
    resolveToken: async (chainId, address) => {
      // return token metadata from your wallet's token list
      // or call the ERC-20 methods on-chain
      return { name: "Tether USD", symbol: "USDT", decimals: 6 };
    },
  },
};

// Reuse on every format call — no re-fetching of the index.
const result = await format(
  {
    chainId: 1,
    to: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    data:
      "0x095ea7b3" +
      "0000000000000000000000001234567890abcdef1234567890abcdef12345678" + // spender
      "00000000000000000000000000000000000000000000000000000000000f4240", // value
  },
  baseOpts,
);

console.log(result.intent); // "Approve"
console.log(result.fields); // [{ label: "Spender", value: "0x1234..." }, { label: "Amount", value: "1 USDT" }]
console.log(result.interpolatedIntent); // "Approve 1 USDT to 0x1234..."
```

If you omit the `index` (or the `descriptorResolverOptions` entirely), `format()` still works — it just fetches the prebuilt indexes on every call.

## API Reference

### `format(tx, opts?)`

Formats a single transaction's calldata into a `DisplayModel`. Resolves an ERC-7730 descriptor by chain and contract address, decodes the calldata, and renders fields. Falls back to a `rawCalldataFallback` when no descriptor matches.

```typescript
async function format(
  tx: Transaction,
  opts?: FormatOptions,
): Promise<DisplayModel>;
```

```typescript
interface Transaction {
  chainId: number;
  to: string;
  data: string; // calldata as hex string
  value?: bigint;
  from?: string;
}
```

### `formatTypedData(typedData, opts?)`

Formats an EIP-712 typed data message into a `DisplayModel`. Resolves an ERC-7730 descriptor by domain chain and verifying contract, matches the primary type via `encodeType`, and renders fields. Requires `chainId` and `verifyingContract` in the domain.

```typescript
async function formatTypedData(
  typedData: TypedData,
  opts?: FormatOptions,
): Promise<DisplayModel>;
```

```typescript
interface TypedData {
  account: string; // signer address
  types: Record<string, TypeMember[]>;
  primaryType: string;
  domain: TypedDataDomain;
  message: Record<string, unknown>;
}
```

### `formatEip5792Batch(batch, opts?)`

Formats an [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792) batch of calls into a `BatchDisplayModel`. Each call is formatted independently via `format()`. The batch-level `interpolatedIntent` joins all individual intents with " and " as specified by [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730).

```typescript
async function formatEip5792Batch(
  batch: Eip5792Batch,
  opts?: FormatOptions,
): Promise<BatchDisplayModel>;
```

```typescript
interface Eip5792Batch {
  from?: string;
  chainId: number;
  calls: Eip5792Call[];
}

interface Eip5792Call {
  to?: string;
  data?: string;
  value?: bigint;
}
```

### `FormatOptions`

```typescript
interface FormatOptions {
  /**
   * Wallets should provide an object with async methods to resolve
   * external data like ENS names, token metadata, and NFT collection
   * names. The provided functions may use RPC calls or fetch data
   * from internal sources. This allows the library to remain
   * agnostic about how this data is fetched. If absent, the library
   * will fall back to raw formats for the corresponding fields.
   */
  externalDataProvider?: ExternalDataProvider;

  /**
   * Controls where descriptors are fetched from, and optionally carries a
   * `trustedTokens` list (see below). Defaults to the GitHub registry when
   * omitted.
   */
  descriptorResolverOptions?: GitHubResolverOptions | CustomResolverOptions;
}
```

### `ExternalDataProvider`

The library delegates all external data resolution to the wallet. The wallet may use RPC calls to resolve the data. See [`src/types.ts`](src/types.ts) for the full return type definitions (e.g. `TokenResult`, `ChainInfoResult`, etc.).

```typescript
interface ExternalDataProvider {
  /**
   * Resolution for addressName formats. The wallet should verify whether the
   * address matches any of the provided accepted types (e.g., "eoa", "contract", ...)
   * if able to. If none of the types match, set typeMatch to false so the library
   * can include a warning in the DisplayModel. When acceptedTypes is absent, the
   * descriptor has no type constraint and typeMatch: true can be returned safely.
   */
  resolveLocalName?: (
    address: string,
    acceptedTypes?: DescriptorAddressType[],
  ) => Promise<AddressNameResult | null>;
  /**
   * Resolution for addressName formats. The wallet should verify whether the
   * address matches any of the provided accepted types (e.g., "eoa", "contract", ...)
   * if able to. If none of the types match, set typeMatch to false so the library
   * can include a warning in the DisplayModel. When acceptedTypes is absent, the
   * descriptor has no type constraint and typeMatch: true can be returned safely.
   */
  resolveEnsName?: (
    address: string,
    acceptedTypes?: DescriptorAddressType[],
  ) => Promise<AddressNameResult | null>;

  /** Resolution for tokenAmount formats. */
  resolveToken?: (
    chainId: number,
    tokenAddress: string,
  ) => Promise<TokenResult | null>;

  /** Resolution for nftName formats. */
  resolveNftCollectionName?: (
    chainId: number,
    collectionAddress: string,
  ) => Promise<NftCollectionNameResult | null>;

  /** Resolution for date format with blockheight encoding. */
  resolveBlockTimestamp?: (
    chainId: number,
    blockHeight: bigint,
  ) => Promise<BlockTimestampResult | null>;

  /** Resolution for chainId and amount formats. */
  resolveChainInfo?: (chainId: number) => Promise<ChainInfoResult | null>;

  /**
   * Decryption for fields carrying an `encryption` annotation. Optional and
   * scheme-specific. Return `null` when the value cannot be decrypted — the
   * field then renders the descriptor's `fallbackLabel`. See DECRYPTION.md.
   */
  resolveDecryptedValue?: (
    chainId: number,
    encryptedValue: string,
    params: {
      scheme: DescriptorFieldEncryptionScheme;
      contractAddress?: string;
    },
  ) => Promise<DecryptedValueResult | null>;
}
```

### Descriptor Sources

Descriptors are fetched from the [Ethereum clear-signing registry](https://github.com/ethereum/clear-signing-erc7730-registry) on GitHub by default. See the [Quick Start](#quick-start) for the recommended pre-fetch pattern.

#### GitHub Registry (default)

Pass `githubSource` to `fetchPrebuiltRegistryIndex` and the matching `descriptorResolverOptions`:

```typescript
const index = await fetchPrebuiltRegistryIndex(source);
const opts = {
  descriptorResolverOptions: {
    type: "github" as const,
    githubSource: {
      repo: "ethereum/clear-signing-erc7730-registry", // default
      ref: "master", // default
    },
    index,
  },
};
```

#### Building the index from descriptor files

If the prebuilt indexes are missing descriptors or you're using a fork that doesn't publish them, walk the registry yourself with `createGitHubRegistryIndex()`. It's significantly slower (one fetch per descriptor file vs. two for the prebuilt indexes) so reserve it for setup-time use.

#### Filesystem resolver (Node-only)

For bundled descriptors or testing in Node, build your own index and load descriptor JSON files from a local directory. The filesystem resolver lives in a Node-only subpath export so it stays out of browser bundles:

```typescript
import { format } from "@ethereum-sourcify/clear-signing";
import { createFilesystemResolver } from "@ethereum-sourcify/clear-signing/filesystem";
import type { RegistryIndex } from "@ethereum-sourcify/clear-signing";

const index: RegistryIndex = {
  calldataIndex: {
    "eip155:1:0xdac17f958d2ee523a2206206994597c13d831ec7":
      "path/to/descriptor.json",
  },
  typedDataIndex: {},
};

const result = await format(tx, {
  descriptorResolverOptions: {
    type: "custom",
    resolver: createFilesystemResolver({
      index,
      descriptorDirectory: "./descriptors",
    }),
  },
});
```

#### Custom resolvers

`{ type: "custom", resolver }` accepts any object matching the `DescriptorResolver` shape, so you can plug in arbitrary descriptor sources (in-memory map, custom HTTP endpoint, ...):

```typescript
import type { DescriptorResolver } from "@ethereum-sourcify/clear-signing";

const resolver: DescriptorResolver = {
  index,
  fetchDescriptor: async (path) => {
    /* return parsed descriptor for `path` */
  },
};

const result = await format(tx, {
  descriptorResolverOptions: { type: "custom", resolver },
});
```

### Trusted token lists

The registry cannot hold a descriptor for every token. To still render plain ERC-20 and ERC-721 interactions (`transfer`, `approve`, `transferFrom`, `safeTransferFrom`, `setApprovalForAll`), add a `trustedTokens` list to `descriptorResolverOptions`. It maps `chainId → tokenAddress → standard` (addresses lowercase or EIP-55 checksummed). When **no registry descriptor resolves** for a transaction's contract, the library looks it up there; if listed, the transaction is rendered from a **bundled ERC-20 / ERC-721 template descriptor** instead of falling back to raw calldata. A registry descriptor always takes precedence.

```typescript
import type { TrustedTokens } from "@ethereum-sourcify/clear-signing";

const trustedTokens: TrustedTokens = {
  1: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "erc20", // USDC
    "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d": "erc721", // BAYC
  },
};

const result = await format(tx, {
  descriptorResolverOptions: { type: "github", index, trustedTokens },
});
```

Trust is delegated entirely to the wallet. The library never decides which contracts are trustworthy.

### Display Model

All format functions return a `DisplayModel`:

```typescript
/**
 * The complete display model produced by the library.
 *
 * According to ERC-7730, wallets have two display options:
 *   1. Show `intent` as an explanation what the contract call does, and
 *      `fields` as a list of labeled values representing the calldata parameters.
 *   2. Show `interpolatedIntent` as a short string presentation of intent and fields,
 *      which already has formatted field values embedded in it — in this case
 *      `fields` can be omitted or shown as supplementary detail.
 *
 * When interpolation fails or is not defined, wallets should fall back to Option 1.
 */
interface DisplayModel {
  /**
   * The intent from the resolved descriptor, representing a short
   * description of the operation, e.g. "Approve token spending".
   * Two possible forms:
   *   - A simple human-readable string
   *   - A list of human-readable key-value pairs
   */
  intent?: string | Record<string, string>;

  /**
   * Ordered list of fields to show to the user,
   * formatted according to their field format specification.
   */
  fields?: (DisplayField | DisplayFieldGroup)[];

  /**
   * Full sentence with formatted field values interpolated in, e.g.
   * "Approve USDC spending up to 1,000 USDC for Uniswap V3".
   * Absent when the descriptor does not define an interpolatedIntent,
   * or when interpolation fails.
   */
  interpolatedIntent?: string;

  /**
   * Additional metadata directly from the resolved descriptor.
   * Wallets may choose to display these items to provide additional
   * context about the contract being interacted with.
   */
  metadata?: {
    owner?: string;
    contractName?: string;
    info?: { deploymentDate?: string; url?: string };
  };

  /**
   * Raw calldata fallback when no descriptor matched or the descriptor was faulty.
   * Only present for calldata formatting — not applicable to EIP-712 typed data.
   */
  rawCalldataFallback?: RawCalldataFallback;

  /**
   * Warnings providing additional context, e.g. why
   * interpolation failed.
   */
  warnings?: Warning[];
}
```

### Batch Display Model

`formatEip5792Batch` returns a `BatchDisplayModel`:

```typescript
/**
 * The `callDisplays` array has the same order as the input `calls`.
 * The batch `interpolatedIntent` joins all individual intents with " and ".
 */
interface BatchDisplayModel {
  interpolatedIntent?: string;
  warnings?: Warning[];
  callDisplays: DisplayModel[];
}
```

See `src/types.ts` for the full type definitions.

## Known Limitation — EIP-712 Index Coverage

The GitHub index only keys EIP-712 descriptors on `context.eip712.deployments`. Descriptors that bind via `context.eip712.domain` or `context.eip712.domainSeparator` cannot be pre-indexed.

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile to dist/
npm test           # Run tests
npm run test:watch # Watch mode
```

## Related

- [Clear Signing Website](https://clearsigning.org)
- [ERC-7730 Specification](https://eips.ethereum.org/EIPS/eip-7730)
- [Ethereum Clear Signing Registry](https://github.com/ethereum/clear-signing-erc7730-registry)

## License

MIT
