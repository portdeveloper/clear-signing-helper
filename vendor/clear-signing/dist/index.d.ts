import { T as TypeMember, G as GitHubSource, R as RegistryIndex, a as DisplayField, b as DisplayFieldGroup, c as Descriptor, d as GitHubResolverOptions, C as CustomResolverOptions, W as Warning, e as TypedData, f as Transaction, F as FormatOptions, g as DisplayModel, E as Eip5792Batch, B as BatchDisplayModel } from './types-Br3mRksb.js';
export { A as AddressNameResult, h as BaseResolverOptions, i as BlockTimestampResult, j as ChainInfoResult, k as DecryptedValueResult, l as DescriptorAddressSource, m as DescriptorAddressType, n as DescriptorContext, o as DescriptorContractContext, p as DescriptorContractFactory, q as DescriptorDeployment, r as DescriptorDisplay, s as DescriptorEip712Context, t as DescriptorFieldEncryption, u as DescriptorFieldEncryptionScheme, v as DescriptorFieldFormat, w as DescriptorFieldFormatParams, x as DescriptorFieldFormatType, y as DescriptorFieldGroup, z as DescriptorFormatSpec, H as DescriptorMetadata, I as DescriptorMetadataInfo, J as DescriptorMetadataToken, D as DescriptorResolver, K as Eip5792Call, L as EmbeddedCalldata, M as ExternalDataProvider, N as FieldType, O as FormatCalldata, P as NftCollectionNameResult, Q as RawCalldataFallback, S as TokenResult, U as TokenStandard, V as TrustedTokens, X as TypedDataDomain, Y as TypedDataIndexEntry, Z as WarningCode } from './types-Br3mRksb.js';

/**
 * EIP-712 typed data formatting for clear signing.
 */

/** Extract the primary type name from an EIP-712 `encodeType` string. */
declare function extractPrimaryType(encodeTypeStr: string): string | undefined;
/**
 * Compute the EIP-712 encodeType string for a given primary type.
 *
 * encodeType(T) = "TypeName(field0Type field0Name,...)" followed by all
 * referenced struct types sorted alphabetically (EIP-712 spec).
 */
declare function computeEncodeType(primaryType: string, types: Record<string, TypeMember[]>): string | undefined;

/**
 * Fetches the {@link RegistryIndex} from the registry's prebuilt index files
 * (`index.calldata.json` and `index.eip712.json`). Assumes both files live
 * at the repo root.
 *
 * No caching — call this once at startup and pass the result to `format()` /
 * `formatTypedData()` via `descriptorResolverOptions.index` to reuse it
 * across calls.
 */
declare function fetchPrebuiltRegistryIndex(source?: Partial<GitHubSource>): Promise<RegistryIndex>;
/**
 * Builds a {@link RegistryIndex} by walking every descriptor file in the
 * GitHub registry and indexing it.
 *
 * Useful when the registry's prebuilt indexes are out of date or missing
 * descriptors, or when pointing at a fork that doesn't publish index files.
 * Prefer the prebuilt indexes for normal use — they're much cheaper to fetch.
 */
declare function createGitHubRegistryIndex(source?: Partial<GitHubSource>): Promise<RegistryIndex>;

/**
 * Shared utility functions for the clear signing library.
 */

/** Type guard: returns true if the display item is a DisplayFieldGroup (has nested fields). */
declare function isFieldGroup(field: DisplayField | DisplayFieldGroup): field is DisplayFieldGroup;

type ResolveDescriptorResult = {
    descriptor: Descriptor;
} | {
    warning: Warning;
};
/**
 * Resolves a calldata descriptor by `(chainId, contractAddress)`. Returns
 * a `{ descriptor }` envelope on success, or a `{ warning }` envelope when
 * resolution fails — `NO_DESCRIPTOR` when nothing is indexed for the pair,
 * `CYCLIC_INCLUDES` when the `includes` chain self-references.
 *
 * If no descriptor is indexed for the chain and address, the method also checks
 * the optional `options.trustedTokens` list for a matching trusted token. In case
 * of a matching trusted token, a token descriptor is generated on the fly.
 */
declare function resolveCalldataDescriptor(chainId: number, to: string, options?: GitHubResolverOptions | CustomResolverOptions): Promise<ResolveDescriptorResult>;
/**
 * Resolves a typed-data descriptor for the given EIP-712 message.
 *
 * Looks up candidates by `(chainId, verifyingContract, primaryType)`, then
 * picks the entry whose `encodeTypeHashes` contain the keccak256 hash of
 * the message's EIP-712 `encodeType` string. Returns `NO_DESCRIPTOR` if no
 * candidate matches, `CYCLIC_INCLUDES` if the `includes` chain self-references,
 * or `{ descriptor }` on success.
 */
declare function resolveTypedDataDescriptor(typedData: TypedData, options?: GitHubResolverOptions | CustomResolverOptions): Promise<ResolveDescriptorResult>;
/**
 * Merges an including ERC-7730 descriptor with the descriptor it includes.
 *
 * May be useful for creating indexes, and correctly resolving an includes chain.
 *
 * Implements the EIP-7730 merge algorithm:
 * - The including descriptor takes priority over the included descriptor for all unique keys.
 * - `fields` arrays within display format entries are merged by path value:
 *   fields from the including descriptor override matching fields in the included descriptor,
 *   and new fields are appended.
 * - The `includes` key itself is not carried over to the merged result.
 */
declare function mergeDescriptors(including: Descriptor, included: Descriptor): Descriptor;

/**
 * Ethereum clear signing library for human-readable transaction previews.
 *
 * @example
 * ```typescript
 * import { format, formatTypedData } from '@ethereum-sourcify/clear-signing';
 *
 * // Format a transaction
 * const result = await format({ chainId: 1, to: '0xdAC17F958D2ee523a2206206994597C13D831ec7', data: '0x095ea7b3...' });
 * console.log(result.intent);
 * console.log(result.fields);
 *
 * // Format EIP-712 typed data
 * const result2 = await formatTypedData({ account: '0x...', domain: { ... }, types: { ... }, primaryType: '...', message: { ... } });
 * console.log(result2.intent);
 * ```
 */

/** EIP-712 utility helpers. */
declare const eip712: {
    computeEncodeType: typeof computeEncodeType;
    extractPrimaryType: typeof extractPrimaryType;
};
/**
 * Formats a single transaction's calldata into a human-readable {@link DisplayModel}.
 *
 * Resolves an ERC-7730 descriptor for the transaction's chain and contract address,
 * decodes the calldata according to the matched function signature, and renders
 * each field using the descriptor's display format rules. When no descriptor is
 * found, returns a {@link RawCalldataFallback} with the selector and raw ABI words.
 *
 * External data (token metadata, address names, etc.) is resolved via
 * {@link FormatOptions.externalDataProvider} when provided.
 */
declare function format(tx: Transaction, opts?: FormatOptions): Promise<DisplayModel>;
/**
 * Formats an EIP-5792 batch of calls into a {@link BatchDisplayModel}.
 *
 * Each call is formatted independently via {@link format}. Calls without
 * `data` (native value transfers) or without `to` (contract creations) cannot
 * be formatted and produce a per-call warning instead.
 *
 * The batch-level `interpolatedIntent` joins all individual intents with
 * " and " as specified by ERC-7730. When any call lacks an
 * `interpolatedIntent`, the batch-level intent is omitted and a
 * `BATCH_INTERPOLATION_INCOMPLETE` warning is emitted.
 *
 * The returned `callDisplays` array preserves the same order as `batch.calls`.
 */
declare function formatEip5792Batch(batch: Eip5792Batch, opts?: FormatOptions): Promise<BatchDisplayModel>;
/**
 * Formats an EIP-712 typed data message into a human-readable {@link DisplayModel}.
 *
 * Resolves an ERC-7730 descriptor for the domain's chain and verifying contract,
 * matches the message's primary type against `display.formats` keys via `encodeType`,
 * and renders each field using the descriptor's display format rules. When no
 * descriptor is found, returns a `NO_DESCRIPTOR` warning.
 *
 * Currently requires both `chainId` and `verifyingContract` in the typed data domain.
 *
 * External data (token metadata, address names, etc.) is resolved via
 * {@link FormatOptions.externalDataProvider} when provided.
 */
declare function formatTypedData(typedData: TypedData, opts?: FormatOptions): Promise<DisplayModel>;

export { BatchDisplayModel, CustomResolverOptions, Descriptor, DisplayField, DisplayFieldGroup, DisplayModel, Eip5792Batch, FormatOptions, GitHubResolverOptions, GitHubSource, RegistryIndex, Transaction, TypeMember, TypedData, Warning, createGitHubRegistryIndex, eip712, fetchPrebuiltRegistryIndex, format, formatEip5792Batch, formatTypedData, isFieldGroup, mergeDescriptors, resolveCalldataDescriptor, resolveTypedDataDescriptor };
