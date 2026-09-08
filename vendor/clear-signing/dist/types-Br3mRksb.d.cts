/** Ethereum transaction to be formatted. */
interface Transaction {
    chainId: number;
    to: string;
    /** calldata hex string */
    data: string;
    value?: bigint;
    from?: string;
}
/**
 * A single call within an EIP-5792 batch.
 */
interface Eip5792Call {
    to?: string;
    data?: string;
    value?: bigint;
}
/**
 * An EIP-5792 batch of calls sharing the same sender and chain.
 * Pass to {@link formatEip5792Batch} to format all calls at once.
 */
interface Eip5792Batch {
    from?: string;
    chainId: number;
    calls: Eip5792Call[];
}
/** EIP-712 type member definition. */
interface TypeMember {
    name: string;
    type: string;
}
/**
 * ERC-7730 field type category — the base Solidity type that determines
 * which display formats can be applied:
 *   - address → addressName, tokenTicker, interoperableAddressName, raw
 *   - uint/int → amount, tokenAmount, nftName, date, duration, unit, enum, chainId, raw
 *   - bytes   → calldata, raw
 *   - string  → raw
 *   - bool    → raw
 */
type FieldType = "address" | "bool" | "string" | "bytes" | "uint" | "int";
/** EIP-712 typed data domain. */
interface TypedDataDomain {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
}
/** EIP-712 typed data input. */
interface TypedData {
    account: string;
    types: Record<string, TypeMember[]>;
    primaryType: string;
    domain: TypedDataDomain;
    message: Record<string, unknown>;
}
/** Machine-readable warning code. */
type WarningCode = "UNEXPECTED_LIB_ERROR" | "NO_DESCRIPTOR" | "DESCRIPTOR_FETCH_ERROR" | "INVALID_CALLDATA_HEX" | "CALLDATA_TOO_SHORT" | "UNSUPPORTED_DOMAIN" | "DEPLOYMENT_MISMATCH" | "NO_FORMAT_MATCH" | "CALLDATA_DECODE_ERROR" | "MUSTMATCH_VIOLATION" | "UNSUPPORTED_NESTED_FIELD_GROUP" | "DEFINITIONS_RESOLUTION_ERROR" | "INVALID_DESCRIPTOR" | "INTERPOLATION_ERROR" | "UNKNOWN_TOKEN" | "UNKNOWN_ADDRESS" | "ADDRESS_TYPE_MISMATCH" | "CONTAINER_MISSING_CHAIN_ID" | "CONTAINER_MISSING_REQUIRED_PATH" | "ARGUMENT_TYPE_MISMATCH" | "DOMAIN_MISMATCH" | "EMPTY_ARRAY" | "UNKNOWN_NFT_COLLECTION" | "BUNDLED_ARRAY_SIZE_MISMATCH" | "FORMAT_PARAM_RESOLUTION_ERROR" | "UNKNOWN_ENCODING" | "UNKNOWN_BLOCK" | "UNKNOWN_CHAIN" | "PARAM_ARRAY_SIZE_MISMATCH" | "EMBEDDED_CALLDATA_NOT_SUPPORTED" | "DECRYPTION_FAILED" | "BATCH_VALUE_TRANSFER" | "BATCH_CONTRACT_CREATION" | "BATCH_INTERPOLATION_INCOMPLETE" | "BATCH_EMPTY" | "CYCLIC_INCLUDES";
/** Warning from formatting. */
interface Warning {
    /** machine-readable warning code */
    code: WarningCode;
    /** human-readable warning message */
    message: string;
}
interface RawCalldataFallback {
    /** function selector, e.g. "0x095ea7b3" */
    selector: string;
    /** hex-encoded ABI arguments */
    args: string[];
}
/**
 * Present on a DisplayField when format is "calldata". Contains the formatted
 * nested transaction, the resolved callee address, and the chain ID if it
 * differs from the outer transaction.
 */
interface EmbeddedCalldata {
    /** Formatted display model for the nested transaction. */
    display: DisplayModel;
    /** Target address of the nested call (EIP-55 checksum format). */
    callee?: string;
    /**
     * Chain ID of the nested call — present only when it differs from the outer
     * container's chain ID.
     */
    chainId?: number;
}
/**
 * A single labeled field to display to the user.
 *
 * When clear-signing transactions with embedded calldata (nested
 * transactions), a calldata formatted field will have an embeddedCalldata
 * property containing the formatted nested transaction and resolved callee.
 */
interface DisplayField {
    /** Label to show in the UI for this field. */
    label: string;
    /** Value to show in the UI for this field. */
    value: string;
    /**
     * For iterated array elements whose descriptor defines a `separator`:
     * the separator text with `{index}` substituted (e.g. "Recipient 0").
     * Per ERC-7730, wallets MUST display it before this field when present.
     */
    separator?: string;
    /**
     * Present when format is "calldata". The value property holds the full
     * embedded calldata as a hex string (including any prepended selector).
     * Wallets should prefer to render embeddedCalldata.display over the raw
     * value property. If no matching ERC-7730 descriptor is found or if the
     * wallet does not support embedded calldata, it MAY display a hash of the
     * value property (embedded calldata) instead.
     */
    embeddedCalldata?: EmbeddedCalldata;
    /**
     * The fieldType and format properties can be used to show type-specific
     * components. For example, for a fieldType of "address" the wallet can
     * display an address copy button.
     *
     * The fieldType corresponds to the underlying Solidity type.
     */
    fieldType: FieldType;
    /**
     * The format corresponds to the specific display format as per ERC-7730.
     */
    format: string;
    /**
     * For example for externally resolved data, wallets should display
     * a warning when encountering unknown entities.
     */
    warning?: Warning;
    /**
     * For formatted addresses (fieldType: "address"), wallets should also
     * display the raw value in some form.
     */
    rawAddress?: string;
    /**
     * For token amounts (format: "tokenAmount") the token address is returned.
     * Wallets can display it in case that the library failed to resolve token
     * metadata from the ExternalDataProvider. In this case, value will fall
     * back to the raw amount formatting and warning.code will be UNKNOWN_TOKEN.
     */
    tokenAddress?: string;
    /**
     * For fields carrying an `encryption` annotation, the raw encrypted value as
     * 0x-prefixed hex — the field's value as it appears in the signing request,
     * before decryption. Depending on the scheme this is the ciphertext itself or
     * a pointer to it.
     *
     * Set whether or not decryption succeeded. When it did not, `value` is the
     * descriptor's `fallbackLabel` (or a generic placeholder if it declares none)
     * and `warning.code` is DECRYPTION_FAILED; the ERC-7730 spec recommends
     * wallets also show this raw value — fully or partially — next to that
     * placeholder, so the user can tell that a real value is present but withheld.
     */
    rawEncryptedValue?: string;
}
/**
 * A named group of display fields, optionally carrying a warning.
 * A group with an `EMPTY_ARRAY` warning indicates that the corresponding
 * array in the transaction data was empty.
 */
interface DisplayFieldGroup {
    label?: string;
    fields: DisplayField[];
    warning?: Warning;
}
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
        info?: {
            deploymentDate?: string;
            url?: string;
        };
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
/**
 * Display model for an EIP-5792 batch of calls.
 *
 * The `callDisplays` array preserves the same order as the `calls`
 * array passed to {@link formatEip5792Batch}, so wallets can correlate
 * each display model with its source call by index.
 *
 * The batch-level `interpolatedIntent` concatenates all individual
 * `interpolatedIntent` strings with " and " (per ERC-7730).
 * It is absent when any call could not produce an `interpolatedIntent`,
 * in which case `warnings` will contain a `BATCH_INTERPOLATION_INCOMPLETE`
 * entry.
 */
type BatchDisplayModel = Pick<DisplayModel, "interpolatedIntent" | "warnings"> & {
    callDisplays: DisplayModel[];
};
/** Closure for formatting embedded calldata (nested function calls). */
type FormatCalldata = (tx: Transaction) => Promise<DisplayModel>;
/** Result of resolving an address name (ENS or local). */
interface AddressNameResult {
    name: string;
    /** Whether the resolved address type matches the expected type. */
    typeMatch: boolean;
}
/** Result of resolving a token address */
interface TokenResult {
    name: string;
    symbol: string;
    decimals: number;
}
/** Result of resolving an NFT collection name. */
interface NftCollectionNameResult {
    name: string;
}
/** Result of resolving a block timestamp. */
interface BlockTimestampResult {
    /** Unix timestamp in seconds. */
    timestamp: number;
}
/** Result of resolving chain information by chain ID. */
interface ChainInfoResult {
    /** Human-readable chain name, e.g. "Ethereum Mainnet". */
    name: string;
    /** Native currency metadata. */
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
}
/** Result of decrypting an encrypted field value. */
interface DecryptedValueResult {
    /**
     * The decrypted plaintext, as 0x-prefixed hex of its big-endian ABI bytes —
     * never a `bigint`, `boolean`, or decimal string. The library re-interprets
     * these bytes according to the descriptor's declared `plaintextType`, so a
     * single encoding covers every scheme and every type.
     *
     * Must be valid, even-length hex.
     */
    value: string;
}
/** Wallet-provided async resolvers for external data needed by the formatter. */
interface ExternalDataProvider {
    /**
     * Resolution for addressName formats. The wallet should verify whether the
     * address matches any of the provided accepted types (e.g., "eoa", "contract", ...)
     * if able to. If none of the types match, set typeMatch to false so the library
     * can include a warning in the DisplayModel. When acceptedTypes is absent, the
     * descriptor has no type constraint and typeMatch: true can be returned safely.
     */
    resolveLocalName?: (address: string, acceptedTypes?: DescriptorAddressType[]) => Promise<AddressNameResult | null>;
    /**
     * Resolution for addressName formats. The wallet should verify whether the
     * address matches any of the provided accepted types (e.g., "eoa", "contract", ...)
     * if able to. If none of the types match, set typeMatch to false so the library
     * can include a warning in the DisplayModel. When acceptedTypes is absent, the
     * descriptor has no type constraint and typeMatch: true can be returned safely.
     */
    resolveEnsName?: (address: string, acceptedTypes?: DescriptorAddressType[]) => Promise<AddressNameResult | null>;
    /** Resolution for tokenAmount formats. */
    resolveToken?: (chainId: number, tokenAddress: string) => Promise<TokenResult | null>;
    /** Resolution for nftName formats. */
    resolveNftCollectionName?: (chainId: number, collectionAddress: string) => Promise<NftCollectionNameResult | null>;
    /** Resolution for date format with blockheight encoding. */
    resolveBlockTimestamp?: (chainId: number, blockHeight: bigint) => Promise<BlockTimestampResult | null>;
    /** Resolution for chainId and amount formats. */
    resolveChainInfo?: (chainId: number) => Promise<ChainInfoResult | null>;
    /**
     * Decryption for fields carrying an `encryption` annotation
     * ({@link DescriptorFieldEncryption}). Only needed by wallets opting in to
     * an encryption scheme — omit it and encrypted fields render their
     * `fallbackLabel`.
     *
     * The wallet decrypts and reports the plaintext bytes; the library interprets
     * them against the descriptor's declared `plaintextType`. That declared type
     * is deliberately not passed here — decryption yields bytes, and typing them
     * is the library's job, not the wallet's.
     *
     * Return `null` when the value cannot be decrypted — unsupported scheme,
     * declined by the user, or access not granted.
     */
    resolveDecryptedValue?: (chainId: number, 
    /** 0x-prefixed hex of the raw encrypted field value. */
    encryptedValue: string, params: {
        /** Scheme from the descriptor. Dispatch on this. */
        scheme: DescriptorFieldEncryptionScheme;
        /**
         * The contract the encrypted value belongs to (the container's `@.to`).
         * Absent when an EIP-712 domain declares no `verifyingContract`.
         */
        contractAddress?: string;
    }) => Promise<DecryptedValueResult | null>;
}
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
     * Controls where descriptors are fetched from.
     * Defaults to the GitHub registry when omitted.
     *
     * Pass `{ type: "github", ... }` ({@link GitHubResolverOptions}) to fetch
     * from the registry, or `{ type: "custom", resolver }`
     * ({@link CustomResolverOptions}) to plug in any pre-built
     * {@link DescriptorResolver} — for instance the Node-only filesystem
     * resolver from `@ethereum-sourcify/clear-signing/filesystem`.
     */
    descriptorResolverOptions?: GitHubResolverOptions | CustomResolverOptions;
}
/** Token standards for descriptor generation. */
type TokenStandard = "erc20" | "erc721";
/** Nested map: chain ID → token address → token standard. */
interface TrustedTokens {
    [chainId: number]: {
        [tokenAddress: string]: TokenStandard;
    };
}
interface BaseResolverOptions {
    /**
     * Wallet-provided trusted token list. Used to generate descriptors for tokens
     * on the fly. Standard tokens usually don't have a descriptor in the registry.
     * Without this option, the library can't format calls to standard tokens.
     * Only wallet-trusted tokens should be included in this object.
     *
     * Both lowercase and checksummed token addresses are accepted.
     */
    trustedTokens?: TrustedTokens;
}
type GitHubResolverOptions = BaseResolverOptions & {
    type: "github";
    /**
     * Pre-built registry index. Strongly recommended: fetch once at app
     * startup via `fetchPrebuiltRegistryIndex()` and reuse across calls.
     * If omitted, the library re-fetches the registry's prebuilt index
     * files on every `format()` / `formatTypedData()` call.
     */
    index?: RegistryIndex;
    githubSource?: Partial<GitHubSource>;
};
/**
 * Plugs a user-built {@link DescriptorResolver} into the format pipeline.
 * Use this for any descriptor source other than the built-in GitHub
 * registry — filesystem (see `@ethereum-sourcify/clear-signing/filesystem`),
 * in-memory map, custom HTTP endpoint, etc.
 */
type CustomResolverOptions = BaseResolverOptions & {
    type: "custom";
    resolver: DescriptorResolver;
};
/**
 * A pre-built descriptor resolver: a registry index plus a closure that
 * fetches and parses a single descriptor file by its index-relative path.
 *
 * Wrap an instance in {@link CustomResolverOptions} and pass it to
 * {@link FormatOptions.descriptorResolverOptions} to override the default
 * GitHub-backed resolution with any descriptor source. The library resolves
 * `includes` chains and merges descriptors using only `index` and
 * `fetchDescriptor`, so any source that satisfies this shape will work.
 */
interface DescriptorResolver {
    index: RegistryIndex;
    fetchDescriptor: (path: string) => Promise<Descriptor>;
}
interface RegistryIndex {
    /**
     * Maps CAIP-10 identifiers ("eip155:{chainId}:{address}") to the descriptor
     * file's path.
     *
     * The path is resolved relative to the resolver root — `descriptorDirectory`
     * for the filesystem resolver, the repository root for GitHub resolvers. It MUST
     * be the descriptor's full relative path, not just a basename: an
     * `includes` declared inside the descriptor (e.g. `"../../ercs/foo.json"`)
     * is resolved against the directory of *this* path, and any `..` segments
     * that overshoot the root are dropped. So an index keyed by bare basename
     * silently truncates `..` traversals — store `"registry/foo/main.json"`,
     * not `"main.json"`, if the include chain reaches a sibling directory.
     */
    calldataIndex: {
        [caip10Id: string]: string;
    };
    /**
     * Maps CAIP-10 identifiers to a per-primary-type list of descriptor entries.
     *
     * A single (chainId, verifyingContract, primaryType) triple may resolve to
     * multiple descriptor files (e.g. Uniswap Permit2's `PermitWitnessTransferFrom`
     * wraps different order shapes). Entries are disambiguated by matching the
     * EIP-712 `encodeType` hash of the incoming typed data against
     * `encodeTypeHashes`.
     *
     * The `path` on each entry follows the same relative-path contract as
     * `calldataIndex`.
     *
     * See https://github.com/ethereum/clear-signing-erc7730-registry/blob/master/index.eip712.json
     * as an example of the shape of this index in practice.
     */
    typedDataIndex: {
        [caip10Id: string]: {
            [primaryType: string]: TypedDataIndexEntry[];
        };
    };
}
/**
 * One candidate descriptor for an EIP-712 (chainId, verifyingContract, primaryType)
 * triple. `encodeTypeHashes` lists the keccak256 hashes of the EIP-712
 * `encodeType` strings that this descriptor supports.
 */
interface TypedDataIndexEntry {
    path: string;
    encodeTypeHashes: string[];
}
interface GitHubSource {
    repo: string;
    ref: string;
}
type DescriptorFieldFormatType = "raw" | "amount" | "tokenAmount" | "nftName" | "date" | "duration" | "unit" | "enum" | "chainId" | "addressName" | "tokenTicker" | "calldata" | "interoperableAddressName";
type DescriptorAddressType = "wallet" | "eoa" | "contract" | "token" | "collection";
type DescriptorAddressSource = "local" | "ens";
type DescriptorFieldEncryptionScheme = "fhevm";
interface DescriptorFieldEncryption {
    scheme?: DescriptorFieldEncryptionScheme;
    plaintextType?: string;
    fallbackLabel?: string;
}
interface DescriptorFieldFormatParams {
    tokenPath?: string;
    token?: string;
    nativeCurrencyAddress?: string | string[];
    threshold?: string | number;
    message?: string;
    chainIdPath?: string;
    chainId?: number;
    encoding?: "timestamp" | "blockheight";
    base?: string;
    decimals?: number;
    prefix?: boolean;
    $ref?: string;
    collectionPath?: string;
    collection?: string;
    calleePath?: string;
    callee?: string;
    selectorPath?: string;
    selector?: string;
    amountPath?: string;
    amount?: string;
    spenderPath?: string;
    spender?: string;
    types?: DescriptorAddressType[];
    sources?: DescriptorAddressSource[];
    senderAddress?: string | string[];
}
interface DescriptorFieldFormat {
    $id?: string;
    path?: string;
    value?: unknown;
    label?: string;
    format?: DescriptorFieldFormatType;
    params?: DescriptorFieldFormatParams;
    visible?: "never" | "always" | "optional" | {
        ifNotIn?: Array<string | number | boolean | null>;
    } | {
        mustMatch?: Array<string | number | boolean | null>;
    };
    separator?: string;
    encryption?: DescriptorFieldEncryption;
    $ref?: string;
}
interface DescriptorFieldGroup {
    path?: string;
    label?: string;
    fields?: Array<DescriptorFieldFormat | DescriptorFieldGroup>;
    iteration?: "sequential" | "bundled";
}
interface DescriptorFormatSpec {
    $id?: string;
    intent?: string | Record<string, string>;
    interpolatedIntent?: string;
    fields?: Array<DescriptorFieldFormat | DescriptorFieldGroup>;
}
interface DescriptorDisplay {
    definitions?: Record<string, DescriptorFieldFormat>;
    formats?: Record<string, DescriptorFormatSpec>;
}
interface DescriptorDeployment {
    chainId?: number;
    address?: string;
}
interface DescriptorContractFactory {
    deployEvent?: string;
    deployments?: DescriptorDeployment[];
}
interface DescriptorContractContext {
    deployments?: DescriptorDeployment[];
    factory?: DescriptorContractFactory;
}
interface DescriptorEip712Context {
    $id?: string;
    domain?: Record<string, unknown>;
    deployments?: DescriptorDeployment[];
    domainSeparator?: string;
}
interface DescriptorContext {
    $id?: string;
    contract?: DescriptorContractContext;
    eip712?: DescriptorEip712Context;
}
interface DescriptorMetadataInfo {
    deploymentDate?: string;
    url?: string;
}
interface DescriptorMetadataToken {
    name?: string;
    ticker?: string;
    decimals?: number;
}
interface DescriptorMetadata {
    owner?: string;
    contractName?: string;
    info?: DescriptorMetadataInfo;
    token?: DescriptorMetadataToken;
    constants?: Record<string, string | number | boolean>;
    maps?: Record<string, unknown>;
    enums?: Record<string, Record<string, string>>;
}
interface Descriptor {
    $schema?: string;
    includes?: string;
    context?: DescriptorContext;
    metadata?: DescriptorMetadata;
    display?: DescriptorDisplay;
    [key: string]: unknown;
}

export type { AddressNameResult as A, BatchDisplayModel as B, CustomResolverOptions as C, DescriptorResolver as D, Eip5792Batch as E, FormatOptions as F, GitHubSource as G, DescriptorMetadata as H, DescriptorMetadataInfo as I, DescriptorMetadataToken as J, Eip5792Call as K, EmbeddedCalldata as L, ExternalDataProvider as M, FieldType as N, FormatCalldata as O, NftCollectionNameResult as P, RawCalldataFallback as Q, RegistryIndex as R, TokenResult as S, TypeMember as T, TokenStandard as U, TrustedTokens as V, Warning as W, TypedDataDomain as X, TypedDataIndexEntry as Y, WarningCode as Z, DisplayField as a, DisplayFieldGroup as b, Descriptor as c, GitHubResolverOptions as d, TypedData as e, Transaction as f, DisplayModel as g, BaseResolverOptions as h, BlockTimestampResult as i, ChainInfoResult as j, DecryptedValueResult as k, DescriptorAddressSource as l, DescriptorAddressType as m, DescriptorContext as n, DescriptorContractContext as o, DescriptorContractFactory as p, DescriptorDeployment as q, DescriptorDisplay as r, DescriptorEip712Context as s, DescriptorFieldEncryption as t, DescriptorFieldEncryptionScheme as u, DescriptorFieldFormat as v, DescriptorFieldFormatParams as w, DescriptorFieldFormatType as x, DescriptorFieldGroup as y, DescriptorFormatSpec as z };
