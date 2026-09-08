"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  createGitHubRegistryIndex: () => createGitHubRegistryIndex,
  eip712: () => eip712,
  fetchPrebuiltRegistryIndex: () => fetchPrebuiltRegistryIndex,
  format: () => format,
  formatEip5792Batch: () => formatEip5792Batch,
  formatTypedData: () => formatTypedData,
  isFieldGroup: () => isFieldGroup,
  mergeDescriptors: () => mergeDescriptors,
  resolveCalldataDescriptor: () => resolveCalldataDescriptor,
  resolveTypedDataDescriptor: () => resolveTypedDataDescriptor
});
module.exports = __toCommonJS(index_exports);

// src/github-registry-client.ts
var DEFAULT_REPO = "ethereum/clear-signing-erc7730-registry";
var DEFAULT_REF = "master";
function rawBaseUrl(source) {
  return `https://raw.githubusercontent.com/${source.repo}/${source.ref}`;
}
function apiBaseUrl(source) {
  return `https://api.github.com/repos/${source.repo}`;
}
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.json();
}
async function fetchRegistryFilePaths(source) {
  const url = `${apiBaseUrl(source)}/git/trees/${source.ref}?recursive=1`;
  const data = await fetchJson(url);
  return data.tree.filter((item) => item.type === "blob").map((item) => item.path).filter((path) => {
    if (!path.startsWith("registry/") || !path.endsWith(".json")) {
      return false;
    }
    const filename = path.split("/").at(-1) ?? "";
    return filename.startsWith("calldata-") || filename.startsWith("eip712-");
  });
}
async function fetchRegistryFile(repoRelativePath, source) {
  const url = `${rawBaseUrl(source)}/${repoRelativePath}`;
  return fetchJson(url);
}

// src/utils.ts
var import_sha3 = require("@noble/hashes/sha3");
function warn(code, message) {
  return { code, message };
}
function isFieldGroup(field) {
  return "fields" in field;
}
function isAddressString(s) {
  return s.startsWith("0x") && s.length === 42;
}
function keccak256(data) {
  return (0, import_sha3.keccak_256)(data);
}
function asciiToBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}
function hexToBytes(hex) {
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (cleaned.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
function bytesToHex(bytes) {
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
function normalizeAddress(address) {
  return address.trim().toLowerCase();
}
function toChecksumAddress(bytes) {
  if (bytes.length !== 20) {
    throw new Error("Address must be 20 bytes");
  }
  const lower = bytesToHex(bytes).slice(2).toLowerCase();
  const hash = keccak256(asciiToBytes(lower));
  let result = "0x";
  for (let i = 0; i < lower.length; i++) {
    const char = lower[i];
    if (char >= "a" && char <= "f") {
      const hashByte = hash[Math.floor(i / 2)];
      const nibble = i % 2 === 0 ? hashByte >> 4 & 15 : hashByte & 15;
      result += nibble >= 8 ? char.toUpperCase() : char;
    } else {
      result += char;
    }
  }
  return result;
}
function formatAmountWithDecimals(amount, decimals) {
  if (decimals === 0) {
    return amount.toString();
  }
  const factor = 10n ** BigInt(decimals);
  const integer = amount / factor;
  const remainder = amount % factor;
  const integerPart = integer.toString();
  if (remainder === 0n) {
    return integerPart;
  }
  let fractional = remainder.toString().padStart(decimals, "0");
  while (fractional.endsWith("0")) {
    fractional = fractional.slice(0, -1);
  }
  if (fractional.length === 0) {
    return integerPart;
  }
  return `${integerPart}.${fractional}`;
}
function parseBigInt(text) {
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith("0x")) {
      return BigInt(trimmed);
    }
    return BigInt(trimmed);
  } catch {
    return void 0;
  }
}
function selectorForSignature(signature) {
  const hash = keccak256(asciiToBytes(signature));
  return hash.slice(0, 4);
}
function extractSelector(calldata) {
  if (calldata.length < 4) {
    throw new Error("calldata must be at least 4 bytes");
  }
  return calldata.slice(0, 4);
}
function bytesToAscii(bytes) {
  let s = "";
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return s;
}
function boolToBytes(value) {
  return new Uint8Array([value ? 1 : 0]);
}
function bigIntToBytes(value) {
  const bytes = new Uint8Array(32);
  let n = value;
  if (n < 0n) n = (1n << 256n) + n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}
function bytesToUnsignedBigInt(bytes) {
  let result = 0n;
  for (const byte of bytes) {
    result = result << 8n | BigInt(byte);
  }
  return result;
}
function bytesToSignedBigInt(bytes, bits) {
  const unsigned = bytesToUnsignedBigInt(bytes);
  const bitLen = BigInt(bits ?? bytes.length * 8);
  // Clear Signing Helper signed-int-fix.1: mask ABI sign extension to declared width.
  return BigInt.asIntN(Number(bitLen), unsigned);
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function stripLeadingZeros(bytes) {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  return bytes.subarray(i);
}

// src/descriptor.ts
function isCalldataDescriptorBoundTo(descriptor, chainId, address) {
  const normalized = normalizeAddress(address);
  return descriptor.context?.contract?.deployments?.some(
    (d) => d.chainId === chainId && typeof d.address === "string" && normalizeAddress(d.address) === normalized
  ) ?? false;
}
function isEip712DescriptorBoundTo(descriptor, typedData) {
  const { chainId, verifyingContract } = typedData.domain;
  const eip7122 = descriptor.context?.eip712;
  if (chainId !== void 0 && verifyingContract !== void 0 && eip7122?.deployments) {
    const normalized = normalizeAddress(verifyingContract);
    const match = eip7122.deployments.some(
      (d) => d.chainId === chainId && typeof d.address === "string" && normalizeAddress(d.address) === normalized
    );
    if (!match) return false;
  }
  const domainConstraint = eip7122?.domain;
  if (domainConstraint) {
    const messageDomain = typedData.domain;
    for (const [key, expected] of Object.entries(domainConstraint)) {
      const actual = messageDomain[key];
      if (String(actual) !== String(expected)) return false;
    }
  }
  return true;
}
function toArgumentValue(value) {
  if (typeof value === "number") {
    return value < 0 ? { type: "int", value: BigInt(value) } : { type: "uint", value: BigInt(value) };
  }
  if (typeof value === "boolean") {
    return { type: "bool", value };
  }
  if (typeof value === "string") {
    if (isAddressString(value)) {
      return { type: "address", bytes: hexToBytes(value) };
    }
    if (value.startsWith("0x")) {
      try {
        return { type: "bytes", bytes: hexToBytes(value) };
      } catch {
        return void 0;
      }
    }
    if (/^-\d+$/.test(value)) {
      return { type: "int", value: BigInt(value) };
    }
    if (/^\d+$/.test(value)) {
      return { type: "uint", value: BigInt(value) };
    }
    return { type: "string", value };
  }
  return void 0;
}
function argumentValueEquals(a, b) {
  if ((a.type === "uint" || a.type === "int") && (b.type === "uint" || b.type === "int")) {
    return a.value === b.value;
  }
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "address":
      return bytesEqual(a.bytes, b.bytes);
    case "bytes":
      return bytesEqual(a.bytes, b.bytes);
    case "bool":
      return a.value === b.value;
    case "string":
      return a.value === b.value;
  }
  return false;
}
function bytesToAddressArgumentValue(bytes) {
  if (bytes.length === 20) {
    return { type: "address", bytes };
  }
  if (bytes.length > 20) {
    return { type: "address", bytes: bytes.slice(bytes.length - 20) };
  }
  return void 0;
}
function resolvedToAddress(value) {
  if (!value) return void 0;
  if (value.type === "address") return value;
  if (value.type === "bytes" || value.type === "bytes-slice") {
    return bytesToAddressArgumentValue(value.bytes);
  }
  if (value.type === "uint" || value.type === "int") {
    return bytesToAddressArgumentValue(bigIntToBytes(value.value));
  }
  return void 0;
}
function argumentValueToBytes(value) {
  switch (value.type) {
    case "address":
      return value.bytes;
    case "uint":
    case "int":
      return bigIntToBytes(value.value);
    case "bytes":
      return value.bytes;
    case "string":
      return asciiToBytes(value.value);
    case "bool":
      return boolToBytes(value.value);
  }
}
function fieldTypeForFormat(format2) {
  switch (format2) {
    case "amount":
    case "tokenAmount":
    case "date":
    case "duration":
    case "unit":
    case "enum":
    case "nftName":
    case "chainId":
      return "uint";
    case "addressName":
    case "tokenTicker":
    case "interoperableAddressName":
      return "address";
    case "calldata":
    case "raw":
    default:
      return "bytes";
  }
}
function stripStructuredRootPrefix(path) {
  return path.startsWith("#.") ? path.slice(2) : path;
}
function isFieldGroup2(field) {
  return "fields" in field;
}
function mergeDefinitions(field, definitions) {
  const warnings = [];
  if (!field.$ref) {
    return { merged: field, warnings };
  }
  const name = extractDefinitionName(field.$ref);
  if (!name) {
    warnings.push(`Unsupported display definition reference '${field.$ref}'`);
    return { merged: field, warnings };
  }
  const def = definitions[name];
  if (!def) {
    warnings.push(`Unknown display definition reference '${field.$ref}'`);
    return { merged: field, warnings };
  }
  return {
    merged: {
      path: field.path ?? def.path,
      value: field.value ?? def.value,
      label: field.label ?? def.label,
      format: field.format ?? def.format,
      params: mergeParams(def.params ?? {}, field.params ?? {}),
      visible: field.visible ?? def.visible,
      separator: field.separator ?? def.separator,
      encryption: field.encryption ?? def.encryption
    },
    warnings
  };
}
function resolveFieldValue(field, resolvePath) {
  if (field.value !== void 0) {
    if (typeof field.value === "string" && field.value.startsWith("$.metadata.")) {
      return resolvePath(field.value);
    }
    return toArgumentValue(field.value);
  }
  if (field.path !== void 0) return resolvePath(field.path);
  return void 0;
}
function extractDefinitionName(reference) {
  const prefix = "$.display.definitions.";
  if (reference.startsWith(prefix)) {
    return reference.slice(prefix.length);
  }
  return void 0;
}
function mergeParams(base, overlay) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== null && value !== void 0) {
      merged[key] = value;
    }
  }
  return merged;
}
function resolveTransactionPath(path, tx) {
  switch (path) {
    case "@.from":
      if (!tx.from) return void 0;
      return { type: "address", bytes: hexToBytes(tx.from) };
    case "@.value":
      if (tx.value === void 0) return void 0;
      return { type: "uint", value: tx.value };
    case "@.to":
      return { type: "address", bytes: hexToBytes(tx.to) };
    case "@.chainId":
      return { type: "uint", value: BigInt(tx.chainId) };
    default:
      return void 0;
  }
}
function resolveTypedDataPath(path, typedData) {
  switch (path) {
    case "@.from":
      return { type: "address", bytes: hexToBytes(typedData.account) };
    case "@.to":
      if (!typedData.domain.verifyingContract) return void 0;
      return {
        type: "address",
        bytes: hexToBytes(typedData.domain.verifyingContract)
      };
    case "@.chainId":
      if (typedData.domain.chainId === void 0) return void 0;
      return { type: "uint", value: BigInt(typedData.domain.chainId) };
    default:
      return void 0;
  }
}
function resolveMetadataValue(metadata, pointer) {
  const prefix = "$.metadata.";
  if (!pointer.startsWith(prefix)) {
    return void 0;
  }
  const rest = pointer.slice(prefix.length);
  let current = metadata;
  for (const segment of rest.split(".")) {
    if (current === null || typeof current !== "object") {
      return void 0;
    }
    current = current[segment];
  }
  return current;
}
function interpolateTemplate(template, values) {
  let output = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "{") {
      if (template[i + 1] === "{") {
        output += "{";
        i += 2;
        continue;
      }
      let placeholder = "";
      i++;
      let closed = false;
      while (i < template.length) {
        if (template[i] === "}") {
          closed = true;
          i++;
          break;
        }
        placeholder += template[i];
        i++;
      }
      if (!closed) {
        throw new Error("Unclosed placeholder in interpolated intent");
      }
      const key = placeholder.trim();
      if (key.length === 0) {
        throw new Error("Empty placeholder in interpolated intent");
      }
      const value = values.get(stripStructuredRootPrefix(key));
      if (value === void 0) {
        throw new Error(`Missing interpolated value for '${key}'`);
      }
      output += value;
    } else if (ch === "}" && template[i + 1] === "}") {
      output += "}";
      i += 2;
    } else {
      output += ch;
      i++;
    }
  }
  return output;
}

// src/formatters.ts
async function renderField(value, format2, fieldOptions, resolvePath, chainId, metadata, externalDataProvider, formatEmbeddedCalldata) {
  switch (format2) {
    case "raw":
      return formatRaw(value);
    case "amount":
      return await formatNativeAmount(value, chainId, externalDataProvider);
    case "tokenAmount":
      return await formatTokenAmount(
        fieldOptions,
        value,
        resolvePath,
        chainId,
        metadata,
        externalDataProvider
      );
    case "nftName":
      return await formatNftName(
        fieldOptions,
        value,
        resolvePath,
        chainId,
        externalDataProvider
      );
    case "date":
      return await formatDate(
        value,
        fieldOptions,
        chainId,
        externalDataProvider
      );
    case "duration":
      return formatDuration(value);
    case "unit":
      return formatUnit(value, fieldOptions, metadata);
    case "enum":
      return formatEnum(fieldOptions, value, metadata);
    case "chainId":
      return await formatChainId(value, externalDataProvider);
    case "calldata":
      return await formatCalldata(
        value,
        fieldOptions,
        resolvePath,
        chainId,
        formatEmbeddedCalldata
      );
    case "addressName":
      return await formatAddressName(
        value,
        fieldOptions,
        resolvePath,
        externalDataProvider
      );
    case "tokenTicker":
      return await formatTokenTicker(
        value,
        fieldOptions,
        resolvePath,
        chainId,
        externalDataProvider
      );
    default:
      return formatRaw(value);
  }
}
function formatRaw(value) {
  const rendered = renderRaw(value);
  if (value.type === "address") {
    return { rendered, rawAddress: toChecksumAddress(value.bytes) };
  }
  return { rendered };
}
function renderRaw(value) {
  switch (value.type) {
    case "address":
      return toChecksumAddress(value.bytes);
    case "uint":
    case "int":
      return value.value.toString();
    case "bool":
      return value.value.toString();
    case "string":
      return value.value;
    case "bytes":
      return bytesToHex(value.bytes);
  }
}
async function formatNativeAmount(value, chainId, externalDataProvider) {
  if (value.type !== "uint" && value.type !== "int") {
    return typeMismatch(value, "uint or int", "amount");
  }
  let chainInfo = null;
  if (chainId !== void 0) {
    try {
      chainInfo = await externalDataProvider?.resolveChainInfo?.(chainId) ?? null;
    } catch {
    }
  }
  if (!chainInfo) {
    return {
      rendered: renderRaw(value),
      warning: warn("UNKNOWN_CHAIN", "Chain info could not be resolved")
    };
  }
  const native = chainInfo.nativeCurrency;
  const formatted = formatAmountWithDecimals(value.value, native.decimals);
  return { rendered: `${formatted} ${native.symbol}` };
}
async function formatTokenAmount(field, value, resolvePath, containerChainId, metadata, externalDataProvider) {
  if (value.type !== "uint" && value.type !== "int") {
    return typeMismatch(value, "uint or int", "tokenAmount");
  }
  const amount = value.value;
  const metadataTokenResult = resolveMetadataToken(field, metadata);
  if (metadataTokenResult.hasMetadataRef) {
    if (!metadataTokenResult.token) {
      return {
        rendered: renderRaw(value),
        warning: warn(
          "FORMAT_PARAM_RESOLUTION_ERROR",
          "$.metadata.token is missing required ticker or decimals"
        )
      };
    }
    return {
      rendered: renderTokenAmount(
        amount,
        metadataTokenResult.token,
        field,
        resolvePath
      )
    };
  }
  const chainIdResult = resolveChainId(field, resolvePath);
  if (chainIdResult.hasChainIdParam && chainIdResult.value === void 0) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "FORMAT_PARAM_RESOLUTION_ERROR",
        "chainId or chainIdPath param could not be resolved"
      )
    };
  }
  const chainId = chainIdResult.hasChainIdParam ? chainIdResult.value : containerChainId;
  if (chainId === void 0) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "CONTAINER_MISSING_CHAIN_ID",
        "Cannot format tokenAmount without a chainId on the container"
      )
    };
  }
  const tokenAddress = resolveTokenAddress(field, resolvePath);
  if (!tokenAddress) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "FORMAT_PARAM_RESOLUTION_ERROR",
        "token or tokenPath param could not be resolved"
      )
    };
  }
  const checksumTokenAddress = toChecksumAddress(hexToBytes(tokenAddress));
  if (isNativeCurrencyAddress(tokenAddress, field, resolvePath)) {
    let chainInfo = null;
    try {
      chainInfo = await externalDataProvider?.resolveChainInfo?.(chainId) ?? null;
    } catch {
    }
    if (!chainInfo) {
      return {
        rendered: renderRaw(value),
        tokenAddress: checksumTokenAddress,
        warning: warn("UNKNOWN_CHAIN", "Chain info could not be resolved")
      };
    }
    return {
      rendered: renderTokenAmount(
        amount,
        chainInfo.nativeCurrency,
        field,
        resolvePath
      ),
      tokenAddress: checksumTokenAddress
    };
  }
  let token;
  try {
    token = await externalDataProvider?.resolveToken?.(chainId, tokenAddress) ?? null;
  } catch {
    token = null;
  }
  if (!token) {
    return {
      rendered: renderRaw(value),
      tokenAddress: checksumTokenAddress,
      warning: warn("UNKNOWN_TOKEN", "Token could not be resolved")
    };
  }
  return {
    rendered: renderTokenAmount(amount, token, field, resolvePath),
    tokenAddress: checksumTokenAddress
  };
}
function renderTokenAmount(amount, token, field, resolvePath) {
  const msg = tokenAmountMessage(field, amount, resolvePath);
  if (msg) return `${msg} ${token.symbol}`;
  return `${formatAmountWithDecimals(amount, token.decimals)} ${token.symbol}`;
}
function tokenAmountMessage(field, amount, resolvePath) {
  const params = field.params ?? {};
  const thresholdSpec = params.threshold;
  const message = typeof params.message === "string" ? params.message : "Unlimited";
  if (typeof thresholdSpec !== "string") {
    return void 0;
  }
  let threshold;
  const resolved = resolvePath(thresholdSpec);
  if (resolved === void 0) {
    threshold = parseBigInt(thresholdSpec);
  } else if (resolved.type === "uint" || resolved.type === "int") {
    threshold = resolved.value;
  } else if (resolved.type === "string") {
    threshold = parseBigInt(resolved.value);
  } else if (resolved.type === "bytes" || resolved.type === "bytes-slice") {
    threshold = bytesToUnsignedBigInt(resolved.bytes);
  }
  return threshold !== void 0 && amount >= threshold ? message : void 0;
}
function resolveMetadataToken(field, metadata) {
  const params = field.params ?? {};
  const tokenSpec = params.token ?? params.tokenPath;
  if (tokenSpec !== "$.metadata.token") return { hasMetadataRef: false };
  const meta = metadata?.token;
  if (!meta?.ticker || meta.decimals === void 0) {
    return { hasMetadataRef: true, token: void 0 };
  }
  return {
    hasMetadataRef: true,
    token: {
      name: meta.name ?? meta.ticker,
      symbol: meta.ticker,
      decimals: meta.decimals
    }
  };
}
function resolveTokenAddress(field, resolvePath) {
  const params = field.params ?? {};
  const token = params.token ?? params.tokenPath;
  if (!token) return void 0;
  if (isAddressString(token)) {
    return token.toLowerCase();
  }
  const resolved = resolvedToAddress(resolvePath(token));
  if (resolved) {
    return bytesToHex(resolved.bytes).toLowerCase();
  }
  return void 0;
}
function isNativeCurrencyAddress(tokenAddress, field, resolvePath) {
  const params = field.params ?? {};
  const spec = params.nativeCurrencyAddress;
  if (!spec) return false;
  const candidates = Array.isArray(spec) ? spec : [spec];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    if (isAddressString(candidate)) {
      if (candidate.toLowerCase() === tokenAddress) return true;
      continue;
    }
    const resolved = resolvePath(candidate);
    if (resolved?.type === "address" || resolved?.type === "bytes-slice") {
      if (bytesToHex(resolved.bytes).toLowerCase() === tokenAddress)
        return true;
    } else if (resolved?.type === "string") {
      if (resolved.value.toLowerCase() === tokenAddress) return true;
    }
  }
  return false;
}
async function formatNftName(field, value, resolvePath, chainId, externalDataProvider) {
  if (value.type !== "uint" && value.type !== "int") {
    return typeMismatch(value, "uint or int", "nftName");
  }
  if (chainId === void 0) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "CONTAINER_MISSING_CHAIN_ID",
        "Cannot format nftName without a chainId on the container"
      )
    };
  }
  const tokenId = value.value;
  const collectionAddress = resolveCollectionAddress(field, resolvePath);
  if (!collectionAddress) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "FORMAT_PARAM_RESOLUTION_ERROR",
        "collection or collectionPath param could not be resolved"
      )
    };
  }
  let collection;
  try {
    collection = await externalDataProvider?.resolveNftCollectionName?.(
      chainId,
      collectionAddress
    ) ?? null;
  } catch {
    collection = null;
  }
  if (!collection) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "UNKNOWN_NFT_COLLECTION",
        "NFT collection name could not be resolved"
      )
    };
  }
  return {
    rendered: `${collection.name} #${tokenId.toString()}`
  };
}
function resolveCollectionAddress(field, resolvePath) {
  const params = field.params ?? {};
  const collection = params.collection ?? params.collectionPath;
  if (!collection) return void 0;
  if (isAddressString(collection)) {
    return collection.toLowerCase();
  }
  const resolved = resolvedToAddress(resolvePath(collection));
  if (resolved) {
    return bytesToHex(resolved.bytes).toLowerCase();
  }
  return void 0;
}
async function formatDate(value, fieldOptions, chainId, externalDataProvider) {
  if (value.type !== "uint" && value.type !== "int")
    return typeMismatch(value, "uint or int", "date");
  const encoding = fieldOptions.params?.encoding;
  if (encoding === "timestamp") {
    try {
      return formatTimestamp(value.value);
    } catch {
      return {
        rendered: renderRaw(value),
        warning: warn("UNKNOWN_ENCODING", "Failed to parse timestamp value")
      };
    }
  }
  if (encoding === "blockheight") {
    if (chainId === void 0) {
      return {
        rendered: renderRaw(value),
        warning: warn(
          "CONTAINER_MISSING_CHAIN_ID",
          "Cannot format blockheight without a chainId on the container"
        )
      };
    }
    let result;
    try {
      result = await externalDataProvider?.resolveBlockTimestamp?.(
        chainId,
        value.value
      ) ?? null;
    } catch {
      result = null;
    }
    if (!result) {
      return {
        rendered: renderRaw(value),
        warning: warn("UNKNOWN_BLOCK", "Block timestamp could not be resolved")
      };
    }
    return formatTimestamp(BigInt(result.timestamp));
  }
  return {
    rendered: renderRaw(value),
    warning: warn(
      "UNKNOWN_ENCODING",
      `Unsupported or missing encoding: ${encoding ?? "(none)"}`
    )
  };
}
function formatTimestamp(seconds) {
  const date = new Date(Number(seconds) * 1e3);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const secs = String(date.getUTCSeconds()).padStart(2, "0");
  return {
    rendered: `${year}-${month}-${day} ${hours}:${minutes}:${secs}Z`
  };
}
function formatDuration(value) {
  if (value.type !== "uint" && value.type !== "int")
    return typeMismatch(value, "uint or int", "duration");
  const totalSeconds = value.value < 0n ? -value.value : value.value;
  const hours = totalSeconds / 3600n;
  const minutes = totalSeconds % 3600n / 60n;
  const secs = totalSeconds % 60n;
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = secs.toString().padStart(2, "0");
  return { rendered: `${hh}:${mm}:${ss}` };
}
var SI_PREFIXES = [
  [10n ** 24n, "Y"],
  [10n ** 21n, "Z"],
  [10n ** 18n, "E"],
  [10n ** 15n, "P"],
  [10n ** 12n, "T"],
  [10n ** 9n, "G"],
  [10n ** 6n, "M"],
  [10n ** 3n, "k"]
];
function formatUnit(value, fieldOptions, metadata) {
  if (value.type !== "uint" && value.type !== "int")
    return typeMismatch(value, "uint or int", "unit");
  const params = fieldOptions.params ?? {};
  const base = resolveUnitBase(params.base, metadata);
  const decimals = params.decimals ?? 0;
  const prefix = params.prefix === true;
  const formatted = formatAmountWithDecimals(value.value, decimals);
  if (!prefix) {
    return { rendered: `${formatted}${base}` };
  }
  const raw = value.value;
  for (const [factor, symbol] of SI_PREFIXES) {
    const totalFactor = factor * 10n ** BigInt(decimals);
    if (raw >= totalFactor) {
      const scaled = formatAmountWithDecimals(
        raw,
        decimals + Number(bigintLog10(factor))
      );
      return { rendered: `${scaled}${symbol}${base}` };
    }
  }
  return { rendered: `${formatted}${base}` };
}
function resolveUnitBase(spec, metadata) {
  if (!spec) return "";
  if (!spec.startsWith("$.metadata.")) return spec;
  const resolved = resolveMetadataValue(metadata, spec);
  return typeof resolved === "string" ? resolved : "";
}
function bigintLog10(n) {
  let count = 0;
  let v = n;
  while (v >= 10n) {
    v /= 10n;
    count++;
  }
  return count;
}
function formatEnum(field, value, metadata) {
  if (value.type !== "uint" && value.type !== "int" && value.type !== "bool")
    return typeMismatch(value, "uint, int or bool", "enum");
  const label = resolveEnumLabel(field, value.value.toString(), metadata);
  if (!label) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "FORMAT_PARAM_RESOLUTION_ERROR",
        "Enum label could not be resolved"
      )
    };
  }
  return { rendered: label };
}
function resolveEnumLabel(field, key, metadata) {
  const params = field.params ?? {};
  const reference = params.$ref;
  if (typeof reference !== "string") return void 0;
  const enumMap = resolveMetadataValue(metadata, reference);
  if (!enumMap || typeof enumMap !== "object") return void 0;
  const map = enumMap;
  let label = map[key];
  if (label === void 0) {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(map)) {
      if (k.toLowerCase() === lowerKey) {
        label = v;
        break;
      }
    }
  }
  return typeof label === "string" ? label : void 0;
}
async function formatChainId(value, externalDataProvider) {
  if (value.type !== "uint" && value.type !== "int") {
    return typeMismatch(value, "uint or int", "chainId");
  }
  const id = Number(value.value);
  let chainInfo = null;
  try {
    chainInfo = await externalDataProvider?.resolveChainInfo?.(id) ?? null;
  } catch {
  }
  if (!chainInfo) {
    return {
      rendered: renderRaw(value),
      warning: warn("UNKNOWN_CHAIN", "Chain info could not be resolved")
    };
  }
  return { rendered: chainInfo.name };
}
async function formatCalldata(value, fieldOptions, resolvePath, containerChainId, formatCalldata3) {
  if (value.type !== "bytes") {
    return typeMismatch(value, "bytes", "calldata");
  }
  const callee = resolveCallee(fieldOptions, resolvePath);
  if (!callee) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "FORMAT_PARAM_RESOLUTION_ERROR",
        "callee or calleePath param could not be resolved"
      )
    };
  }
  const chainIdResult = resolveChainId(fieldOptions, resolvePath);
  if (chainIdResult.hasChainIdParam && chainIdResult.value === void 0) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "FORMAT_PARAM_RESOLUTION_ERROR",
        "chainId or chainIdPath param could not be resolved"
      )
    };
  }
  const chainId = chainIdResult.hasChainIdParam ? chainIdResult.value : containerChainId;
  if (chainId === void 0) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "CONTAINER_MISSING_CHAIN_ID",
        "Cannot format embedded calldata without a chainId on the container"
      )
    };
  }
  if (!formatCalldata3) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "EMBEDDED_CALLDATA_NOT_SUPPORTED",
        "Embedded calldata formatting is not available"
      )
    };
  }
  const selector = resolveSelectorParam(fieldOptions, resolvePath);
  const data = selector ? bytesToHex(new Uint8Array([...selector, ...value.bytes])) : bytesToHex(value.bytes);
  const amount = resolveAmountParam(fieldOptions, resolvePath);
  const spender = resolveSpenderParam(fieldOptions, resolvePath);
  const tx = { chainId, to: callee, data };
  if (amount !== void 0) tx.value = amount;
  if (spender !== void 0) tx.from = spender;
  const result = await formatCalldata3(tx);
  const embedded = {
    display: result,
    callee: toChecksumAddress(hexToBytes(callee))
  };
  if (chainId !== containerChainId) embedded.chainId = chainId;
  return { rendered: data, embeddedCalldata: embedded };
}
function resolveCallee(field, resolvePath) {
  const params = field.params ?? {};
  const spec = params.callee ?? params.calleePath;
  if (!spec) return void 0;
  if (isAddressString(spec)) {
    return spec.toLowerCase();
  }
  const resolved = resolvedToAddress(resolvePath(spec));
  if (resolved) {
    return bytesToHex(resolved.bytes).toLowerCase();
  }
  return void 0;
}
function resolveAmountParam(field, resolvePath) {
  const params = field.params ?? {};
  const spec = params.amount ?? params.amountPath;
  if (!spec) return void 0;
  const resolved = resolvePath(spec);
  if (resolved === void 0) {
    return parseBigInt(spec);
  }
  if (resolved?.type === "uint" || resolved?.type === "int") {
    return resolved.value;
  }
  if (resolved?.type === "string") {
    return parseBigInt(resolved.value);
  }
  if (resolved?.type === "bytes" || resolved?.type === "bytes-slice") {
    return bytesToUnsignedBigInt(resolved.bytes);
  }
  return void 0;
}
function resolveSpenderParam(field, resolvePath) {
  const params = field.params ?? {};
  const spec = params.spender ?? params.spenderPath;
  if (!spec) return void 0;
  if (isAddressString(spec)) {
    return spec.toLowerCase();
  }
  const resolved = resolvedToAddress(resolvePath(spec));
  if (resolved) {
    return bytesToHex(resolved.bytes).toLowerCase();
  }
  return void 0;
}
function resolveSelectorParam(field, resolvePath) {
  const params = field.params ?? {};
  const spec = params.selector ?? params.selectorPath;
  if (!spec) return void 0;
  if (typeof spec === "string" && spec.startsWith("0x") && spec.length === 10) {
    return hexToBytes(spec);
  }
  const resolved = resolvePath(spec);
  if (resolved?.type === "bytes") return resolved.bytes.slice(0, 4);
  if (resolved?.type === "bytes-slice") return resolved.bytes.slice(0, 4);
  return void 0;
}
async function formatAddressName(value, field, resolvePath, externalDataProvider) {
  if (value.type !== "address")
    return typeMismatch(value, "address", "addressName");
  const checksumAddress = toChecksumAddress(value.bytes);
  const normalized = checksumAddress.toLowerCase();
  if (isSenderAddress(normalized, field, resolvePath)) {
    const fromResolved = resolvePath("@.from");
    const senderAddress = fromResolved?.type === "address" ? toChecksumAddress(fromResolved.bytes) : checksumAddress;
    return { rendered: "Sender", rawAddress: senderAddress };
  }
  const params = field.params ?? {};
  const acceptedTypes = params.types;
  const sources = params.sources;
  const tryLocal = !sources || sources.includes("local");
  const tryEns = !sources || sources.includes("ens");
  const typeMismatchWarning = acceptedTypes?.length ? warn(
    "ADDRESS_TYPE_MISMATCH",
    `Resolved address type does not match expected types [${acceptedTypes.join(", ")}]`
  ) : void 0;
  if (tryLocal && externalDataProvider?.resolveLocalName) {
    try {
      const result = await externalDataProvider.resolveLocalName(
        normalized,
        acceptedTypes
      );
      if (result) {
        return {
          rendered: result.name,
          rawAddress: checksumAddress,
          warning: result.typeMatch ? void 0 : typeMismatchWarning
        };
      }
    } catch {
    }
  }
  if (tryEns && externalDataProvider?.resolveEnsName) {
    try {
      const result = await externalDataProvider.resolveEnsName(
        normalized,
        acceptedTypes
      );
      if (result) {
        return {
          rendered: result.name,
          rawAddress: checksumAddress,
          warning: result.typeMatch ? void 0 : typeMismatchWarning
        };
      }
    } catch {
    }
  }
  return {
    rendered: checksumAddress,
    rawAddress: checksumAddress,
    warning: warn("UNKNOWN_ADDRESS", "Address name could not be resolved")
  };
}
function isSenderAddress(address, field, resolvePath) {
  const params = field.params ?? {};
  const spec = params.senderAddress;
  if (!spec) return false;
  const candidates = Array.isArray(spec) ? spec : [spec];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    if (isAddressString(candidate)) {
      if (candidate.toLowerCase() === address) return true;
      continue;
    }
    const resolved = resolvePath(candidate);
    if (resolved?.type === "address" || resolved?.type === "bytes-slice") {
      if (bytesToHex(resolved.bytes).toLowerCase() === address) return true;
    } else if (resolved?.type === "string") {
      if (resolved.value.toLowerCase() === address) return true;
    }
  }
  return false;
}
async function formatTokenTicker(value, fieldOptions, resolvePath, containerChainId, externalDataProvider) {
  if (value.type !== "address")
    return typeMismatch(value, "address", "tokenTicker");
  const tokenAddress = bytesToHex(value.bytes).toLowerCase();
  const chainIdResult = resolveChainId(fieldOptions, resolvePath);
  if (chainIdResult.hasChainIdParam && chainIdResult.value === void 0) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "FORMAT_PARAM_RESOLUTION_ERROR",
        "chainId or chainIdPath param could not be resolved"
      )
    };
  }
  const chainId = chainIdResult.hasChainIdParam ? chainIdResult.value : containerChainId;
  if (chainId === void 0) {
    return {
      rendered: renderRaw(value),
      warning: warn(
        "CONTAINER_MISSING_CHAIN_ID",
        "Cannot format tokenTicker without a chainId"
      )
    };
  }
  let token;
  try {
    token = await externalDataProvider?.resolveToken?.(chainId, tokenAddress) ?? null;
  } catch {
    token = null;
  }
  if (!token) {
    return {
      rendered: renderRaw(value),
      warning: warn("UNKNOWN_TOKEN", "Token could not be resolved")
    };
  }
  return { rendered: token.symbol };
}
function resolveChainId(field, resolvePath) {
  const params = field.params ?? {};
  const spec = params.chainId ?? params.chainIdPath;
  if (!spec) return { hasChainIdParam: false };
  if (typeof spec === "number") return { hasChainIdParam: true, value: spec };
  if (typeof spec === "string") {
    const n = Number(spec);
    if (Number.isInteger(n) && n > 0)
      return { hasChainIdParam: true, value: n };
    const resolved = resolvePath(spec);
    let resolvedN;
    if (resolved?.type === "uint" || resolved?.type === "int") {
      resolvedN = resolved.value;
    } else if (resolved?.type === "bytes" || resolved?.type === "bytes-slice") {
      resolvedN = bytesToUnsignedBigInt(resolved.bytes);
    }
    if (resolvedN !== void 0 && resolvedN <= Number.MAX_SAFE_INTEGER) {
      return {
        hasChainIdParam: true,
        value: Number(resolvedN)
      };
    }
  }
  return { hasChainIdParam: true, value: void 0 };
}
function typeMismatch(value, expected, format2) {
  return {
    rendered: renderRaw(value),
    warning: warn(
      "ARGUMENT_TYPE_MISMATCH",
      `Format ${format2} expects ${expected} but got ${value.type}`
    )
  };
}

// src/fields.ts
async function applyFieldFormats(format2, definitions, resolvePath, getArrayLength, chainId, metadata, externalDataProvider, formatEmbeddedCalldata) {
  const renderedValues = /* @__PURE__ */ new Map();
  const sliceResolvePath = buildSliceResolvePath(resolvePath);
  const ctx = {
    definitions,
    resolvePath: sliceResolvePath,
    getArrayLength,
    chainId,
    metadata,
    renderedValues,
    externalDataProvider,
    formatEmbeddedCalldata
  };
  const fields = [];
  for (const fieldSpec of format2.fields ?? []) {
    if (isFieldGroup2(fieldSpec)) {
      const groupResult = fieldSpec.path?.endsWith(".[]") ? await processGroupArrayPath(fieldSpec, ctx) : groupHasArrayChildren(fieldSpec) ? await processChildArrayPaths(fieldSpec, ctx) : await processStructGroup(fieldSpec, ctx);
      if ("warnings" in groupResult) return groupResult;
      fields.push(groupResult.group);
    } else if (fieldSpec.path?.includes(".[]")) {
      if (fieldSpec.visible === "never") continue;
      const arrayResult = await processArrayField(fieldSpec, ctx);
      if ("warnings" in arrayResult) return arrayResult;
      fields.push(arrayResult.group);
    } else {
      const result = await processSingleField(fieldSpec, ctx);
      if ("warnings" in result) return result;
      if (result.field) fields.push(result.field);
    }
  }
  return { fields, renderedValues };
}
async function processArrayField(fieldSpec, ctx) {
  const basePath = parseGroupBasePath(fieldSpec.path);
  const length = ctx.getArrayLength(basePath);
  const fieldArrayPaths = [{ path: fieldSpec.path, length }];
  const paramMismatch = checkParamArrayLengths(
    [fieldSpec],
    fieldArrayPaths,
    ctx
  );
  if (paramMismatch) return { warnings: [paramMismatch] };
  if (length === 0) {
    return {
      group: emptyArrayGroup(
        fieldSpec.label,
        `Array at '${basePath}' is empty`
      )
    };
  }
  const iterResult = await iterateArrayField(fieldSpec, length, ctx);
  if ("warnings" in iterResult) return iterResult;
  joinArrayValues(fieldArrayPaths, ctx.renderedValues);
  return {
    group: { fields: iterResult.fields }
  };
}
async function processSingleField(fieldSpec, ctx) {
  const { merged, warnings: defWarnings } = mergeDefinitions(
    fieldSpec,
    ctx.definitions
  );
  if (defWarnings.length > 0) {
    return {
      warnings: defWarnings.map(
        (msg) => warn("DEFINITIONS_RESOLUTION_ERROR", msg)
      )
    };
  }
  if (merged.visible === "never") return { field: null };
  const resolvedValue = resolveFieldValue(merged, ctx.resolvePath);
  if (!resolvedValue) {
    if (merged.path?.startsWith("@.")) {
      return {
        warnings: [
          warn(
            "CONTAINER_MISSING_REQUIRED_PATH",
            `Descriptor requires container field '${merged.path}', but it was not provided in the container`
          )
        ]
      };
    }
    return {
      warnings: [
        warn(
          "INVALID_DESCRIPTOR",
          `No value found for field '${merged.path ?? merged.value}'`
        )
      ]
    };
  }
  if (!merged.format || !merged.label) {
    return {
      warnings: [
        warn(
          "INVALID_DESCRIPTOR",
          `Missing ${!merged.format ? "format" : "label"} for field '${merged.label ?? merged.path}'`
        )
      ]
    };
  }
  let argValue = coerceResolvedValue(
    resolvedValue,
    merged.format
  );
  let decryptionWarning;
  let rawEncryptedValue;
  if (merged.encryption) {
    rawEncryptedValue = bytesToHex(argumentValueToBytes(argValue));
    const decrypted = await decryptFieldValue(argValue, merged.encryption, ctx);
    if ("value" in decrypted) {
      argValue = decrypted.value;
    } else if (decrypted.warning.code === "DECRYPTION_FAILED") {
      decryptionWarning = decrypted.warning;
    } else {
      return { warnings: [decrypted.warning] };
    }
  }
  const visibility = evaluateVisibility(merged.visible, argValue, merged.label);
  if ("warning" in visibility) return { warnings: [visibility.warning] };
  if (visibility.hide) return { field: null };
  let renderResult;
  if (decryptionWarning) {
    renderResult = {
      rendered: merged.encryption?.fallbackLabel ?? DEFAULT_ENCRYPTED_PLACEHOLDER,
      warning: decryptionWarning
    };
  } else {
    renderResult = await renderField(
      argValue,
      merged.format,
      merged,
      ctx.resolvePath,
      ctx.chainId,
      ctx.metadata,
      ctx.externalDataProvider,
      ctx.formatEmbeddedCalldata
    );
  }
  const {
    rendered,
    embeddedCalldata,
    warning: fieldWarning,
    tokenAddress,
    rawAddress
  } = renderResult;
  let separator;
  if (merged.separator && merged.path) {
    const indexMatch = merged.path.match(/\.\[(\d+)\]/);
    if (indexMatch) {
      separator = merged.separator.replace("{index}", indexMatch[1]);
    }
  }
  const displayField = {
    label: merged.label,
    value: rendered,
    ...separator && { separator },
    fieldType: argValue.type,
    format: merged.format,
    warning: fieldWarning,
    ...rawAddress && { rawAddress },
    ...tokenAddress && { tokenAddress },
    ...embeddedCalldata && { embeddedCalldata },
    ...rawEncryptedValue && { rawEncryptedValue }
  };
  if (merged.path) {
    ctx.renderedValues.set(stripStructuredRootPrefix(merged.path), rendered);
  }
  return { field: displayField };
}
async function processGroupArrayPath(group, ctx) {
  const basePath = parseGroupBasePath(group.path);
  const length = ctx.getArrayLength(basePath);
  if (length === 0) {
    return {
      group: emptyArrayGroup(group.label, `Array at '${basePath}' is empty`)
    };
  }
  const allFields = [];
  for (let i = 0; i < length; i++) {
    const prefix = `${basePath}.[${i}]`;
    const scopedResolvePath = (path) => {
      if (path.startsWith("@.") || path.startsWith("$.")) {
        return ctx.resolvePath(path);
      }
      return ctx.resolvePath(`${prefix}.${stripStructuredRootPrefix(path)}`);
    };
    const result = await processFlatFields(group.fields ?? [], {
      ...ctx,
      resolvePath: scopedResolvePath
    });
    if ("warnings" in result) return result;
    allFields.push(...result.fields);
  }
  return { group: { label: group.label, fields: allFields } };
}
async function processChildArrayPaths(group, ctx) {
  const childFields = group.fields ?? [];
  const arrayPaths = [];
  for (const child of childFields) {
    if (!isFieldGroup2(child) && child.path?.includes(".[]")) {
      const childBasePath = parseGroupBasePath(child.path);
      arrayPaths.push({
        path: child.path,
        length: ctx.getArrayLength(childBasePath)
      });
    }
  }
  const paramMismatch = checkParamArrayLengths(childFields, arrayPaths, ctx);
  if (paramMismatch) return { warnings: [paramMismatch] };
  if (arrayPaths.every((a) => a.length === 0)) {
    return {
      group: emptyArrayGroup(group.label, "All arrays in group are empty")
    };
  }
  const isBundled = group.iteration === "bundled";
  if (isBundled) {
    const lengths = arrayPaths.map((a) => a.length);
    const first = lengths[0];
    if (lengths.some((l) => l !== first)) {
      const detail = arrayPaths.map((a) => `${parseGroupBasePath(a.path)}=${a.length}`).join(", ");
      return {
        warnings: [
          warn(
            "BUNDLED_ARRAY_SIZE_MISMATCH",
            `Bundled arrays must have equal lengths: ${detail}`
          )
        ]
      };
    }
    const allFields2 = [];
    for (let i = 0; i < first; i++) {
      const result = await processFlatFields(
        expandArrayIndex(childFields, i),
        ctx
      );
      if ("warnings" in result) return result;
      allFields2.push(...result.fields);
    }
    joinArrayValues(arrayPaths, ctx.renderedValues);
    return { group: { label: group.label, fields: allFields2 } };
  }
  const allFields = [];
  for (const child of childFields) {
    if (isFieldGroup2(child)) {
      return {
        warnings: [
          warn(
            "UNSUPPORTED_NESTED_FIELD_GROUP",
            "Nested field groups are not supported"
          )
        ]
      };
    }
    if (child.path?.includes(".[]")) {
      const childBasePath = parseGroupBasePath(child.path);
      const len = ctx.getArrayLength(childBasePath);
      const iterResult = await iterateArrayField(child, len, ctx);
      if ("warnings" in iterResult) return iterResult;
      allFields.push(...iterResult.fields);
    } else {
      const result = await processSingleField(child, ctx);
      if ("warnings" in result) return result;
      if (result.field) allFields.push(result.field);
    }
  }
  joinArrayValues(arrayPaths, ctx.renderedValues);
  return { group: { label: group.label, fields: allFields } };
}
async function processStructGroup(group, ctx) {
  const prefix = stripStructuredRootPrefix(parseGroupBasePath(group.path));
  const scopedCtx = prefix ? {
    ...ctx,
    resolvePath: (path) => {
      if (path.startsWith("@.") || path.startsWith("$.")) {
        return ctx.resolvePath(path);
      }
      return ctx.resolvePath(
        `${prefix}.${stripStructuredRootPrefix(path)}`
      );
    }
  } : ctx;
  const result = await processFlatFields(group.fields ?? [], scopedCtx);
  if ("warnings" in result) return result;
  return { group: { label: group.label, fields: result.fields } };
}
function groupHasArrayChildren(group) {
  for (const child of group.fields ?? []) {
    if (!isFieldGroup2(child) && child.path?.includes(".[]")) return true;
  }
  return false;
}
async function processFlatFields(fieldSpecs, ctx) {
  const fields = [];
  for (const fieldSpec of fieldSpecs) {
    if (isFieldGroup2(fieldSpec)) {
      return {
        warnings: [
          warn(
            "UNSUPPORTED_NESTED_FIELD_GROUP",
            "Nested field groups are not supported"
          )
        ]
      };
    }
    const result = await processSingleField(fieldSpec, ctx);
    if ("warnings" in result) return result;
    if (result.field) fields.push(result.field);
  }
  return { fields };
}
function emptyArrayGroup(label, message) {
  return { label, fields: [], warning: warn("EMPTY_ARRAY", message) };
}
function expandFieldForIndex(field, index) {
  return {
    ...field,
    path: field.path?.replace(".[]", `.[${index}]`),
    ...field.params ? { params: expandParamArrayIndex(field.params, index) } : {}
  };
}
function expandArrayIndex(childFields, index) {
  return childFields.map((child) => {
    if (isFieldGroup2(child)) return child;
    if (child.path?.includes(".[]")) return expandFieldForIndex(child, index);
    return child;
  });
}
async function iterateArrayField(field, length, ctx) {
  const fields = [];
  for (let i = 0; i < length; i++) {
    const indexed = expandFieldForIndex(field, i);
    const result = await processSingleField(indexed, ctx);
    if ("warnings" in result) return result;
    if (result.field) fields.push(result.field);
  }
  return { fields };
}
function expandParamArrayIndex(params, index) {
  if (!params) return params;
  const result = { ...params };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && value.includes(".[]")) {
      result[key] = value.replace(".[]", `.[${index}]`);
    }
  }
  return result;
}
function joinArrayValues(arrayPaths, renderedValues) {
  for (const { path, length } of arrayPaths) {
    if (!path) continue;
    const wildcardPath = stripStructuredRootPrefix(path);
    const parts = [];
    for (let i = 0; i < length; i++) {
      const v = renderedValues.get(wildcardPath.replace(".[]", `.[${i}]`));
      if (v !== void 0) parts.push(v);
    }
    if (parts.length > 0) {
      const joined = parts.join(" and ");
      renderedValues.set(wildcardPath, joined);
      if (wildcardPath.endsWith(".[]")) {
        renderedValues.set(wildcardPath.slice(0, -3), joined);
      }
    }
  }
}
function checkParamArrayLengths(childFields, fieldArrayPaths, ctx) {
  for (const child of childFields) {
    if (isFieldGroup2(child) || !child.path?.includes(".[]")) continue;
    const childBasePath = parseGroupBasePath(child.path);
    const fieldLength = fieldArrayPaths.find(
      (a) => parseGroupBasePath(a.path) === childBasePath
    )?.length;
    if (fieldLength === void 0) continue;
    const params = child.params ?? {};
    for (const paramValue of Object.values(params)) {
      if (typeof paramValue !== "string" || !paramValue.includes(".[]"))
        continue;
      const paramBasePath = parseGroupBasePath(paramValue);
      const paramLength = ctx.getArrayLength(paramBasePath);
      if (paramLength > 0 && paramLength !== fieldLength) {
        return warn(
          "PARAM_ARRAY_SIZE_MISMATCH",
          `Parameter array '${paramBasePath}' has length ${paramLength} but field array '${childBasePath}' has length ${fieldLength}`
        );
      }
    }
  }
  return void 0;
}
function parseGroupBasePath(path) {
  if (!path) return "";
  const idx = path.indexOf(".[]");
  if (idx === -1) return path;
  return path.slice(0, idx);
}
function parseByteSlice(path) {
  const match = path.match(/^(.+)\.\[(-?\d*):(-?\d*)\]$/);
  if (!match) return null;
  return {
    basePath: match[1],
    slice: {
      start: match[2].length > 0 ? parseInt(match[2], 10) : void 0,
      end: match[3].length > 0 ? parseInt(match[3], 10) : void 0
    }
  };
}
function applyByteSlice(rawBytes, slice) {
  const len = rawBytes.length;
  let start = slice.start ?? 0;
  let end = slice.end ?? len;
  if (start < 0) start = Math.max(0, len + start);
  if (end < 0) end = Math.max(0, len + end);
  start = Math.min(start, len);
  end = Math.min(end, len);
  if (start >= end) return new Uint8Array(0);
  return rawBytes.slice(start, end);
}
function buildSliceResolvePath(resolve) {
  return (path) => {
    const parsed = parseByteSlice(path);
    if (!parsed) return resolve(path);
    const baseValue = resolve(parsed.basePath);
    if (!baseValue) return void 0;
    const rawBytes = argumentValueToBytes(baseValue);
    const sliced = applyByteSlice(rawBytes, parsed.slice);
    return { type: "bytes-slice", bytes: sliced };
  };
}
function bytesSliceToFieldType(bytes, fieldType, bits) {
  switch (fieldType) {
    case "address":
      return bytesToAddressArgumentValue(bytes) ?? { type: "bytes", bytes };
    case "uint":
      return { type: "uint", value: bytesToUnsignedBigInt(bytes) };
    case "int":
      return { type: "int", value: bytesToSignedBigInt(bytes, bits) };
    case "bool":
      return {
        type: "bool",
        value: bytes.length > 0 && bytes[bytes.length - 1] !== 0
      };
    case "string":
      return { type: "string", value: bytesToAscii(bytes) };
    case "bytes":
    default:
      return { type: "bytes", bytes };
  }
}
function bytesSliceToArgumentValue(slice, format2) {
  const fieldType = fieldTypeForFormat(format2);
  return bytesSliceToFieldType(slice.bytes, fieldType);
}
function coerceResolvedValue(value, format2) {
  if (value.type === "bytes-slice") {
    return bytesSliceToArgumentValue(value, format2);
  }
  if ((value.type === "uint" || value.type === "int") && fieldTypeForFormat(format2) === "address") {
    return resolvedToAddress(value) ?? value;
  }
  return value;
}
function parsePlaintextType(plaintextType) {
  switch (plaintextType) {
    case "bool":
      return { fieldType: "bool", maxBytes: 1 };
    case "address":
      return { fieldType: "address", maxBytes: 20 };
    case "string":
    case "bytes":
      return { fieldType: plaintextType };
  }
  const int = /^(u?)int(\d+)$/.exec(plaintextType);
  if (int) {
    const bits = Number(int[2]);
    if (bits < 8 || bits > 256 || bits % 8 !== 0) return void 0;
    return { fieldType: int[1] ? "uint" : "int", maxBytes: bits / 8 };
  }
  const bytes = /^bytes(\d+)$/.exec(plaintextType);
  if (bytes) {
    const size = Number(bytes[1]);
    if (size < 1 || size > 32) return void 0;
    return { fieldType: "bytes", maxBytes: size };
  }
  return void 0;
}
function exceedsPlaintextWidth(bytes, type) {
  if (type.maxBytes === void 0) return false;
  const significant = type.fieldType === "bytes" ? bytes : stripLeadingZeros(bytes);
  return significant.length > type.maxBytes;
}
async function decryptFieldValue(encrypted, encryption, ctx) {
  const { scheme, plaintextType } = encryption;
  if (!scheme || !plaintextType) {
    return {
      warning: warn(
        "INVALID_DESCRIPTOR",
        `Field encryption requires both 'scheme' and 'plaintextType'`
      )
    };
  }
  const parsedType = parsePlaintextType(plaintextType);
  if (!parsedType) {
    return {
      warning: warn(
        "INVALID_DESCRIPTOR",
        `Unsupported encryption plaintextType '${plaintextType}'`
      )
    };
  }
  if (ctx.chainId === void 0) {
    return {
      warning: warn(
        "DECRYPTION_FAILED",
        "Cannot decrypt a field without a chainId on the container"
      )
    };
  }
  const resolveDecryptedValue = ctx.externalDataProvider?.resolveDecryptedValue;
  if (!resolveDecryptedValue) {
    return {
      warning: warn(
        "DECRYPTION_FAILED",
        `No resolveDecryptedValue provider to decrypt '${scheme}' value`
      )
    };
  }
  const to = ctx.resolvePath("@.to");
  const contractAddress = to && to.type === "address" ? toChecksumAddress(to.bytes) : void 0;
  const result = await resolveDecryptedValue(
    ctx.chainId,
    bytesToHex(argumentValueToBytes(encrypted)),
    { scheme, contractAddress }
  );
  if (!result) {
    return {
      warning: warn("DECRYPTION_FAILED", `Could not decrypt '${scheme}' value`)
    };
  }
  let bytes;
  try {
    bytes = hexToBytes(result.value);
  } catch {
    return {
      warning: warn(
        "DECRYPTION_FAILED",
        `Decrypted '${scheme}' value '${result.value}' is not valid hex`
      )
    };
  }
  if (exceedsPlaintextWidth(bytes, parsedType)) {
    return {
      warning: warn(
        "DECRYPTION_FAILED",
        `Decrypted '${scheme}' value is ${bytes.length} bytes, too wide for '${plaintextType}'`
      )
    };
  }
  return {
    value: bytesSliceToFieldType(
      bytes,
      parsedType.fieldType,
      parsedType.maxBytes === void 0 ? void 0 : parsedType.maxBytes * 8
    )
  };
}
var DEFAULT_ENCRYPTED_PLACEHOLDER = "[Encrypted]";
function evaluateVisibility(visible, argValue, fieldLabel) {
  if (typeof visible !== "object") {
    return { hide: false };
  }
  if ("ifNotIn" in visible && visible.ifNotIn) {
    return { hide: matchesAnyCandidate(argValue, visible.ifNotIn) };
  }
  if ("mustMatch" in visible && visible.mustMatch) {
    if (matchesAnyCandidate(argValue, visible.mustMatch)) {
      return { hide: true };
    }
    return {
      warning: warn(
        "MUSTMATCH_VIOLATION",
        `Field '${fieldLabel}' value does not match any of the required values`
      )
    };
  }
  return { hide: false };
}
function matchesAnyCandidate(argValue, candidates) {
  return candidates.some((c) => {
    const candidateValue = toArgumentValue(c);
    if (candidateValue === void 0) return false;
    if (argumentValueEquals(argValue, candidateValue)) return true;
    if (typeof c === "number" && argValue.type === "bytes") {
      const candidateBytes = stripLeadingZeros(bigIntToBytes(BigInt(c)));
      const argBytes = stripLeadingZeros(argValue.bytes);
      return bytesEqual(candidateBytes, argBytes);
    }
    return false;
  });
}

// src/eip712.ts
async function formatEip712(typedData, descriptor, externalDataProvider, formatEmbeddedCalldata) {
  if (!isEip712DescriptorBoundTo(descriptor, typedData)) {
    return {
      warnings: [
        warn(
          "DOMAIN_MISMATCH",
          `Descriptor context does not match the typed data domain`
        )
      ]
    };
  }
  const format2 = findFormatSpec(descriptor, typedData);
  if (!format2) {
    return {
      warnings: [
        warn(
          "NO_FORMAT_MATCH",
          `No display format found for primary type '${typedData.primaryType}'`
        )
      ]
    };
  }
  const resolvePath = (path) => {
    if (path.startsWith("@.")) return resolveTypedDataPath(path, typedData);
    if (path.startsWith("$."))
      return toArgumentValue(resolveMetadataValue(descriptor.metadata, path));
    const raw = getMessageValue(
      typedData.message,
      stripStructuredRootPrefix(path)
    );
    if (raw === void 0) return void 0;
    return toArgumentValue(raw);
  };
  const getArrayLength = (path) => {
    const raw = getMessageValue(
      typedData.message,
      stripStructuredRootPrefix(path)
    );
    return Array.isArray(raw) ? raw.length : 0;
  };
  const definitions = descriptor.display?.definitions ?? {};
  const result = await applyFieldFormats(
    format2,
    definitions,
    resolvePath,
    getArrayLength,
    typedData.domain.chainId,
    descriptor.metadata,
    externalDataProvider,
    formatEmbeddedCalldata
  );
  if ("warnings" in result) {
    return { warnings: result.warnings };
  }
  const warnings = [];
  let interpolatedIntent;
  if (format2.interpolatedIntent) {
    try {
      interpolatedIntent = interpolateTemplate(
        format2.interpolatedIntent,
        result.renderedValues
      );
    } catch (e) {
      warnings.push(warn("INTERPOLATION_ERROR", e.message));
    }
  }
  const meta = descriptor.metadata;
  return {
    intent: format2.intent,
    interpolatedIntent,
    fields: result.fields.length > 0 ? result.fields : void 0,
    metadata: meta ? { owner: meta.owner, contractName: meta.contractName, info: meta.info } : void 0,
    ...warnings.length > 0 && { warnings }
  };
}
function findFormatSpec(descriptor, typedData) {
  const formats = descriptor.display?.formats;
  if (!formats) return void 0;
  const encodeTypeStr = computeEncodeType(
    typedData.primaryType,
    typedData.types
  );
  if (!encodeTypeStr) return void 0;
  return formats[encodeTypeStr];
}
function extractPrimaryType(encodeTypeStr) {
  const open = encodeTypeStr.indexOf("(");
  if (open <= 0) return void 0;
  return encodeTypeStr.slice(0, open);
}
function computeEncodeType(primaryType, types) {
  if (!(primaryType in types)) return void 0;
  const referenced = /* @__PURE__ */ new Set();
  collectReferencedTypes(primaryType, types, referenced);
  referenced.delete(primaryType);
  return [primaryType, ...Array.from(referenced).sort()].map((typeName) => {
    const members = types[typeName] ?? [];
    return `${typeName}(${members.map((m) => `${m.type} ${m.name}`).join(",")})`;
  }).join("");
}
function collectReferencedTypes(typeName, types, result) {
  if (result.has(typeName)) return;
  result.add(typeName);
  for (const member of types[typeName] ?? []) {
    const baseType = member.type.replace(/(\[.*?\])+$/, "");
    if (baseType in types) {
      collectReferencedTypes(baseType, types, result);
    }
  }
}
function getMessageValue(message, path) {
  let current = message;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return void 0;
    const indexMatch = segment.match(/^\[(-?\d+)\]$/);
    if (indexMatch) {
      if (!Array.isArray(current)) return void 0;
      let idx = parseInt(indexMatch[1], 10);
      if (idx < 0) idx += current.length;
      if (idx < 0 || idx >= current.length) return void 0;
      current = current[idx];
    } else {
      current = current[segment];
    }
  }
  return current;
}

// src/github-registry-index.ts
var CALLDATA_INDEX_FILE = "index.calldata.json";
var EIP712_INDEX_FILE = "index.eip712.json";
async function fetchPrebuiltRegistryIndex(source) {
  const gitHubSource = {
    repo: source?.repo ?? DEFAULT_REPO,
    ref: source?.ref ?? DEFAULT_REF
  };
  const [calldataIndex, typedDataIndex] = await Promise.all([
    fetchRegistryFile(CALLDATA_INDEX_FILE, gitHubSource),
    fetchRegistryFile(EIP712_INDEX_FILE, gitHubSource)
  ]);
  return {
    calldataIndex,
    typedDataIndex
  };
}
function indexDescriptor(descriptor, path, index) {
  const context = descriptor.context;
  if (!context) return;
  const contract = context.contract;
  if (contract) {
    const deployments2 = contract.deployments;
    if (deployments2) {
      for (const dep of deployments2) {
        const chainId = dep.chainId;
        const address = dep.address;
        if (chainId !== void 0 && address) {
          const key = `eip155:${chainId}:${normalizeAddress(address)}`;
          if (!index.calldataIndex[key]) {
            index.calldataIndex[key] = path;
          }
        }
      }
    }
    return;
  }
  const eip7122 = context.eip712;
  if (!eip7122) return;
  const deployments = eip7122.deployments;
  if (!deployments?.length) return;
  const display = descriptor.display;
  const formats = display?.formats;
  if (!formats) return;
  const hashesByPrimaryType = /* @__PURE__ */ new Map();
  for (const encodeTypeStr of Object.keys(formats)) {
    const primaryType = extractPrimaryType(encodeTypeStr);
    if (!primaryType) continue;
    const hash = bytesToHex(keccak256(asciiToBytes(encodeTypeStr)));
    const list = hashesByPrimaryType.get(primaryType) ?? [];
    list.push(hash);
    hashesByPrimaryType.set(primaryType, list);
  }
  if (hashesByPrimaryType.size === 0) return;
  for (const dep of deployments) {
    const chainId = dep.chainId;
    const address = dep.address;
    if (chainId === void 0 || !address) continue;
    const caip = `eip155:${chainId}:${normalizeAddress(address)}`;
    const byPrimaryType = index.typedDataIndex[caip] ??= {};
    for (const [primaryType, encodeTypeHashes] of hashesByPrimaryType) {
      const entries = byPrimaryType[primaryType] ??= [];
      entries.push({ path, encodeTypeHashes });
    }
  }
}
async function createGitHubRegistryIndex(source) {
  const gitHubSource = {
    repo: source?.repo ?? DEFAULT_REPO,
    ref: source?.ref ?? DEFAULT_REF
  };
  const paths = await fetchRegistryFilePaths(gitHubSource);
  const index = {
    calldataIndex: {},
    typedDataIndex: {}
  };
  const concurrency = 25;
  const maxRetries = 3;
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (path) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const descriptor = await fetchRegistryFile(
              path,
              gitHubSource
            );
            indexDescriptor(descriptor, path, index);
            return;
          } catch {
            if (attempt < maxRetries) {
              await new Promise((resolve) => setTimeout(resolve, 3e3));
            }
          }
        }
      })
    );
  }
  return index;
}

// src/bundled/erc20.ts
var erc20Descriptor = {
  context: { contract: {} },
  display: {
    formats: {
      "transfer(address _to, uint256 _value)": {
        intent: "Send",
        fields: [
          {
            path: "_value",
            label: "Amount",
            format: "tokenAmount",
            params: { tokenPath: "@.to" },
            visible: "always"
          },
          {
            path: "_to",
            label: "To",
            format: "addressName",
            params: { types: ["eoa"], sources: ["local", "ens"] },
            visible: "always"
          }
        ]
      },
      "approve(address _spender, uint256 _value)": {
        intent: "Approve",
        fields: [
          {
            path: "_spender",
            label: "Spender",
            format: "addressName",
            params: { types: ["eoa", "contract"] },
            visible: "always"
          },
          {
            path: "_value",
            label: "Amount",
            format: "tokenAmount",
            params: {
              tokenPath: "@.to",
              threshold: "0x8000000000000000000000000000000000000000000000000000000000000000"
            },
            visible: "always"
          }
        ]
      }
    }
  }
};

// src/bundled/erc721.ts
var erc721Descriptor = {
  context: { contract: {} },
  metadata: { enums: { rights: { True: "Grant all", False: "Deny all" } } },
  display: {
    definitions: {
      from: {
        label: "From",
        format: "addressName",
        params: { types: ["eoa"], sources: ["local", "ens"] }
      },
      to: {
        label: "To",
        format: "addressName",
        params: { types: ["eoa"], sources: ["local", "ens"] }
      },
      operator: {
        label: "Operator",
        format: "addressName",
        params: { types: ["contract"], sources: ["local", "ens"] }
      },
      tokenId: {
        label: "NFT",
        format: "nftName",
        params: { collectionPath: "@.to" }
      }
    },
    formats: {
      "transferFrom(address _from, address _to, uint256 _tokenId)": {
        intent: "Send NFT",
        fields: [
          { path: "_from", $ref: "$.display.definitions.from" },
          {
            path: "_to",
            $ref: "$.display.definitions.to",
            visible: "always"
          },
          {
            path: "_tokenId",
            $ref: "$.display.definitions.tokenId",
            visible: "always"
          }
        ]
      },
      "safeTransferFrom(address _from, address _to, uint256 _tokenId)": {
        intent: "Send NFT",
        fields: [
          { path: "_from", $ref: "$.display.definitions.from" },
          { path: "_to", $ref: "$.display.definitions.to" },
          { path: "_tokenId", $ref: "$.display.definitions.tokenId" }
        ]
      },
      "approve(address _approved, uint256 _tokenId)": {
        intent: "Approve operator for NFT",
        fields: [
          { path: "_approved", $ref: "$.display.definitions.operator" },
          { path: "_tokenId", $ref: "$.display.definitions.tokenId" }
        ]
      },
      "setApprovalForAll(address _operator, bool _approved)": {
        $id: "setApprovalForAll",
        intent: "Manage operator rights for",
        fields: [
          {
            path: "@.to",
            label: "Collection",
            format: "addressName",
            params: { types: ["collection"], sources: ["local", "ens"] }
          },
          { path: "_operator", $ref: "$.display.definitions.operator" },
          {
            path: "_approved",
            label: "Access rights",
            format: "enum",
            params: { $ref: "$.metadata.enums.rights" }
          }
        ]
      }
    }
  }
};

// src/bundled-descriptors.ts
var templates = {
  erc20: erc20Descriptor,
  erc721: erc721Descriptor
};
function buildBundledTokenDescriptor(standard, chainId, address) {
  const descriptor = structuredClone(templates[standard]);
  descriptor.context = {
    ...descriptor.context,
    contract: {
      ...descriptor.context?.contract,
      deployments: [{ chainId, address }]
    }
  };
  return descriptor;
}

// src/resolver.ts
async function createResolver(options = {
  type: "github"
}) {
  switch (options.type) {
    case "custom":
      return options.resolver;
    case "github": {
      const source = {
        repo: options.githubSource?.repo ?? DEFAULT_REPO,
        ref: options.githubSource?.ref ?? DEFAULT_REF
      };
      const index = options.index ?? await fetchPrebuiltRegistryIndex(source);
      return {
        index,
        fetchDescriptor: async (path) => await fetchRegistryFile(path, source)
      };
    }
  }
}
async function resolveCalldataDescriptor(chainId, to, options) {
  const resolver = await createResolver(options);
  const path = resolver.index.calldataIndex[`eip155:${chainId}:${normalizeAddress(to)}`];
  if (path) return resolveWithIncludes(resolver, path);
  const standard = lookupTrustedToken(options?.trustedTokens, chainId, to);
  if (standard) {
    return { descriptor: buildBundledTokenDescriptor(standard, chainId, to) };
  }
  return noDescriptorWarning(chainId, to);
}
function lookupTrustedToken(trustedTokens, chainId, address) {
  const tokens = trustedTokens?.[chainId];
  if (!tokens) return void 0;
  const lowercaseResult = tokens[normalizeAddress(address)];
  if (lowercaseResult !== void 0) return lowercaseResult;
  try {
    return tokens[toChecksumAddress(hexToBytes(address))];
  } catch {
    return void 0;
  }
}
async function resolveTypedDataDescriptor(typedData, options) {
  const { chainId, verifyingContract } = typedData.domain;
  if (chainId === void 0 || !verifyingContract) {
    return noDescriptorWarning(chainId, verifyingContract);
  }
  const resolver = await createResolver(options);
  const byPrimaryType = resolver.index.typedDataIndex[`eip155:${chainId}:${normalizeAddress(verifyingContract)}`];
  const entries = byPrimaryType?.[typedData.primaryType];
  if (!entries?.length) return noDescriptorWarning(chainId, verifyingContract);
  const encodeTypeStr = computeEncodeType(
    typedData.primaryType,
    typedData.types
  );
  if (!encodeTypeStr) return noDescriptorWarning(chainId, verifyingContract);
  const hash = bytesToHex(keccak256(asciiToBytes(encodeTypeStr)));
  const match = entries.find((e) => e.encodeTypeHashes.includes(hash));
  if (!match) return noDescriptorWarning(chainId, verifyingContract);
  return resolveWithIncludes(resolver, match.path);
}
function noDescriptorWarning(chainId, address) {
  return {
    warning: warn(
      "NO_DESCRIPTOR",
      `No descriptor found for chain ${chainId} and address ${address}`
    )
  };
}
async function resolveWithIncludes(resolver, path, visited = /* @__PURE__ */ new Set()) {
  if (visited.has(path)) {
    return {
      warning: warn(
        "CYCLIC_INCLUDES",
        `Cyclic includes detected for descriptor path '${path}'`
      )
    };
  }
  visited.add(path);
  const descriptor = await resolver.fetchDescriptor(path);
  const includes = typeof descriptor.includes === "string" ? descriptor.includes : void 0;
  if (!includes) return { descriptor };
  const includesPath = resolveIncludePath(path, includes);
  const included = await resolveWithIncludes(resolver, includesPath, visited);
  if ("warning" in included) return included;
  return { descriptor: mergeDescriptors(descriptor, included.descriptor) };
}
function resolveIncludePath(base, includes) {
  const baseSegments = ("/" + base).split("/").slice(0, -1);
  const out = [];
  for (const seg of [...baseSegments, ...includes.split("/")]) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0) out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}
function mergeDescriptors(including, included) {
  const result = { ...included };
  for (const [key, value] of Object.entries(including)) {
    if (key === "includes") continue;
    if (key === "display" && isObject(value) && isObject(included.display)) {
      result.display = mergeDisplaySection(
        value,
        included.display
      );
    } else {
      result[key] = isObject(value) && isObject(result[key]) ? deepMerge(value, result[key]) : value;
    }
  }
  return result;
}
function mergeDisplaySection(including, included) {
  const result = { ...included };
  for (const [key, value] of Object.entries(including)) {
    if (key === "formats" && isObject(value) && isObject(included.formats)) {
      result.formats = mergeFormats(
        value,
        included.formats
      );
    } else {
      result[key] = isObject(value) && isObject(result[key]) ? deepMerge(value, result[key]) : value;
    }
  }
  return result;
}
function mergeFormats(including, included) {
  const result = { ...included };
  for (const [selector, format2] of Object.entries(including)) {
    const includedFormat = included[selector];
    if (isObject(format2) && isObject(includedFormat)) {
      result[selector] = mergeFormatEntry(
        format2,
        includedFormat
      );
    } else {
      result[selector] = format2;
    }
  }
  return result;
}
function mergeFormatEntry(including, included) {
  const result = { ...included };
  for (const [key, value] of Object.entries(including)) {
    if (key === "fields" && Array.isArray(value) && Array.isArray(included.fields)) {
      result.fields = mergeFields(
        value,
        included.fields
      );
    } else {
      result[key] = isObject(value) && isObject(result[key]) ? deepMerge(value, result[key]) : value;
    }
  }
  return result;
}
function deepMerge(including, included) {
  const result = { ...included };
  for (const [key, value] of Object.entries(including)) {
    result[key] = isObject(value) && isObject(result[key]) ? deepMerge(value, result[key]) : value;
  }
  return result;
}
function mergeFields(including, included) {
  const result = [...included];
  for (const field of including) {
    const existingIndex = result.findIndex((f) => f.path === field.path);
    if (existingIndex >= 0) {
      result[existingIndex] = deepMerge(field, result[existingIndex]);
    } else {
      result.push(field);
    }
  }
  return result;
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/calldata.ts
async function formatCalldata2(tx, descriptor, externalDataProvider, formatEmbeddedCalldata) {
  const parsed = parseCalldataHex(tx.data);
  if ("warning" in parsed) {
    return { warnings: [parsed.warning] };
  }
  const { calldata, selector } = parsed;
  if (!isCalldataDescriptorBoundTo(descriptor, tx.chainId, tx.to)) {
    return {
      rawCalldataFallback: rawPreviewFromCalldata(selector, calldata),
      warnings: [
        warn(
          "DEPLOYMENT_MISMATCH",
          `Descriptor is not bound to chain ${tx.chainId} and address ${tx.to}`
        )
      ]
    };
  }
  const selectorHex = bytesToHex(selector);
  const match = findFormatBySelector(descriptor, selectorHex);
  if (!match) {
    return {
      rawCalldataFallback: rawPreviewFromCalldata(selector, calldata),
      warnings: [
        warn("NO_FORMAT_MATCH", `No format match for selector ${selectorHex}`)
      ]
    };
  }
  const { inputs, spec: format2 } = match;
  let decoded;
  try {
    decoded = decodeArguments(inputs, calldata);
  } catch {
    return {
      rawCalldataFallback: rawPreviewFromCalldata(selector, calldata),
      warnings: [
        warn(
          "CALLDATA_DECODE_ERROR",
          `Failed to decode calldata for selector ${selectorHex}`
        )
      ]
    };
  }
  const resolvePath = (path) => {
    if (path.startsWith("@.")) return resolveTransactionPath(path, tx);
    if (path.startsWith("$."))
      return toArgumentValue(resolveMetadataValue(descriptor.metadata, path));
    const key = normalizeNegativeIndices(
      stripStructuredRootPrefix(path),
      decoded.arrayLengths
    );
    if (key === void 0) return void 0;
    return decoded.values.get(key);
  };
  const getArrayLength = (path) => {
    const key = normalizeNegativeIndices(
      stripStructuredRootPrefix(path),
      decoded.arrayLengths
    );
    if (key === void 0) return 0;
    return decoded.arrayLengths.get(key) ?? 0;
  };
  const definitions = descriptor.display?.definitions ?? {};
  const result = await applyFieldFormats(
    format2,
    definitions,
    resolvePath,
    getArrayLength,
    tx.chainId,
    descriptor.metadata,
    externalDataProvider,
    formatEmbeddedCalldata
  );
  if ("warnings" in result) {
    return {
      rawCalldataFallback: rawPreviewFromCalldata(selector, calldata),
      warnings: result.warnings
    };
  }
  const warnings = [];
  let interpolatedIntent;
  if (format2.interpolatedIntent) {
    try {
      interpolatedIntent = interpolateTemplate(
        format2.interpolatedIntent,
        result.renderedValues
      );
    } catch (e) {
      warnings.push(warn("INTERPOLATION_ERROR", e.message));
    }
  }
  const meta = descriptor.metadata;
  return {
    intent: format2.intent,
    interpolatedIntent,
    fields: result.fields,
    metadata: meta ? {
      owner: meta.owner,
      contractName: meta.contractName,
      info: meta.info
    } : void 0,
    ...warnings.length > 0 && { warnings }
  };
}
function parseCalldataHex(data) {
  let calldata;
  try {
    calldata = hexToBytes(data);
  } catch {
    return {
      warning: warn(
        "INVALID_CALLDATA_HEX",
        `Calldata is not valid hex: ${data}`
      )
    };
  }
  let selector;
  try {
    selector = extractSelector(calldata);
  } catch {
    return {
      warning: warn(
        "CALLDATA_TOO_SHORT",
        `Calldata must be at least 4 bytes: ${data}`
      )
    };
  }
  return { calldata, selector };
}
function rawPreviewFromCalldata(selector, calldata) {
  const args = [];
  if (calldata.length > 4) {
    const data = calldata.slice(4);
    for (let i = 0; i < data.length; i += 32) {
      const chunk = data.slice(i, Math.min(i + 32, data.length));
      args.push(bytesToHex(chunk).slice(2));
    }
  }
  return {
    selector: bytesToHex(selector),
    args
  };
}
function normalizeNegativeIndices(path, arrayLengths) {
  if (!path.includes("[-")) return path;
  const segments = path.split(".");
  for (let i = 0; i < segments.length; i++) {
    const match = segments[i].match(/^\[(-\d+)\]$/);
    if (!match) continue;
    const neg = parseInt(match[1], 10);
    const prefix = segments.slice(0, i).join(".");
    const length = arrayLengths.get(prefix);
    if (length === void 0) return void 0;
    const absIdx = length + neg;
    if (absIdx < 0) return void 0;
    segments[i] = `[${absIdx}]`;
  }
  return segments.join(".");
}
function findFormatBySelector(descriptor, selectorHex) {
  const formats = descriptor.display?.formats;
  if (!formats) return void 0;
  for (const [key, spec] of Object.entries(formats)) {
    const parsed = parseFunctionSignatureKey(key);
    if (!parsed) continue;
    if (bytesToHex(parsed.selector) === selectorHex) {
      return { inputs: parsed.inputs, spec };
    }
  }
  return void 0;
}
function parseFunctionSignatureKey(key) {
  const openParen = key.indexOf("(");
  if (openParen === -1) return void 0;
  const fnName = key.slice(0, openParen).trim();
  if (!fnName) return void 0;
  const afterOpen = key.slice(openParen + 1);
  const closeIdx = findMatchingClose(afterOpen);
  if (closeIdx === -1) return void 0;
  const paramsStr = afterOpen.slice(0, closeIdx);
  const inputs = parseParamList(paramsStr);
  const canonical = `${fnName}(${canonicalParamList(inputs)})`;
  const selector = selectorForSignature(canonical);
  return { inputs, selector };
}
function findMatchingClose(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}
function splitTopLevel(paramsStr) {
  if (paramsStr.trim() === "") return [];
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of paramsStr) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
function parseParamList(paramsStr) {
  return splitTopLevel(paramsStr).map(parseParam);
}
function parseParam(param) {
  param = param.trim();
  if (param.startsWith("(")) {
    const closeIdx = findMatchingClose(param.slice(1));
    if (closeIdx === -1) return { name: "", type: "tuple" };
    const inner = param.slice(1, closeIdx + 1);
    const components = parseParamList(inner);
    const rest = param.slice(closeIdx + 2).trim();
    const { arraySuffix, name } = extractSuffixAndName(rest);
    return { type: `tuple${arraySuffix}`, name, components };
  }
  const spaceIdx = param.indexOf(" ");
  if (spaceIdx === -1) return { type: param, name: "" };
  return { type: param.slice(0, spaceIdx), name: param.slice(spaceIdx + 1) };
}
function extractSuffixAndName(rest) {
  const match = rest.match(/^((?:\[\d*\])*)\s*(.*)/);
  if (!match) return { arraySuffix: "", name: rest.trim() };
  return { arraySuffix: match[1], name: match[2] };
}
function canonicalParamList(inputs) {
  return inputs.map(canonicalParam).join(",");
}
function canonicalParam(input) {
  if (input.type.startsWith("tuple")) {
    const suffix = input.type.slice(5);
    return `(${canonicalParamList(input.components ?? [])})${suffix}`;
  }
  return input.type;
}
function parseArrayType(type) {
  const match = type.match(/^(.+)\[(\d*)\]$/);
  if (!match) return void 0;
  return {
    elementType: match[1],
    size: match[2].length > 0 ? parseInt(match[2], 10) : void 0
  };
}
function isDynamicInput(input) {
  if (input.type === "bytes" || input.type === "string") return true;
  const arr = parseArrayType(input.type);
  if (arr) {
    if (arr.size === void 0) return true;
    return isDynamicInput({
      name: "",
      type: arr.elementType,
      components: input.components
    });
  }
  if (input.type === "tuple" && input.components) {
    return input.components.some(isDynamicInput);
  }
  return false;
}
function staticHeadSize(input) {
  if (input.type === "tuple" && input.components && input.components.length > 0) {
    return input.components.reduce((sum, c) => sum + staticHeadSize(c), 0);
  }
  const arr = parseArrayType(input.type);
  if (arr && arr.size !== void 0) {
    return arr.size * staticHeadSize({
      name: "",
      type: arr.elementType,
      components: input.components
    });
  }
  return 32;
}
function decodeArguments(inputs, calldata) {
  const headSize = inputs.reduce((sum, input) => {
    return sum + (isDynamicInput(input) ? 32 : staticHeadSize(input));
  }, 0);
  if (calldata.length < 4 + headSize) {
    throw new Error(
      `calldata length ${calldata.length} too small (expected at least ${4 + headSize} bytes)`
    );
  }
  const decoded = {
    values: /* @__PURE__ */ new Map(),
    arrayLengths: /* @__PURE__ */ new Map()
  };
  const data = calldata.slice(4);
  decodeComponents(inputs, data, 0, void 0, decoded);
  return decoded;
}
function decodeComponents(inputs, data, baseOffset, prefix, decoded) {
  let headCursor = baseOffset;
  for (const input of inputs) {
    if (isDynamicInput(input)) {
      const relOffset = Number(
        bytesToUnsignedBigInt(data.slice(headCursor, headCursor + 32))
      );
      decodeValue(input, data, baseOffset + relOffset, prefix, decoded);
      headCursor += 32;
    } else {
      decodeValue(input, data, headCursor, prefix, decoded);
      headCursor += staticHeadSize(input);
    }
  }
}
function decodeValue(input, data, offset, prefix, decoded) {
  const name = argumentName(prefix, input);
  if (input.type === "bytes" || input.type === "string") {
    const length = Number(
      bytesToUnsignedBigInt(data.slice(offset, offset + 32))
    );
    const content = data.slice(offset + 32, offset + 32 + length);
    const value2 = input.type === "string" ? { type: "string", value: bytesToAscii(content) } : { type: "bytes", bytes: content };
    if (name) decoded.values.set(name, value2);
    return;
  }
  const arr = parseArrayType(input.type);
  if (arr) {
    let count;
    let elementsStart;
    if (arr.size === void 0) {
      count = Number(bytesToUnsignedBigInt(data.slice(offset, offset + 32)));
      elementsStart = offset + 32;
    } else {
      count = arr.size;
      elementsStart = offset;
    }
    if (name) decoded.arrayLengths.set(name, count);
    const elemInputs = [];
    for (let i = 0; i < count; i++) {
      elemInputs.push({
        name: `[${i}]`,
        type: arr.elementType,
        components: input.components
      });
    }
    decodeComponents(elemInputs, data, elementsStart, name, decoded);
    return;
  }
  if (input.type === "tuple" && input.components && input.components.length > 0) {
    decodeComponents(input.components, data, offset, name, decoded);
    return;
  }
  const value = decodeWord(input.type, data.slice(offset, offset + 32));
  if (name) decoded.values.set(name, value);
}
function argumentName(prefix, input) {
  const trimmed = input.name.trim();
  if (prefix !== void 0) {
    return trimmed.length === 0 ? prefix : `${prefix}.${trimmed}`;
  }
  return trimmed.length === 0 ? void 0 : trimmed;
}
function decodeWord(kind, word) {
  if (kind === "address") {
    return { type: "address", bytes: word.slice(12) };
  }
  if (kind.startsWith("uint")) {
    return { type: "uint", value: bytesToUnsignedBigInt(word) };
  }
  if (kind.startsWith("int")) {
    const bits = kind === "int" ? 256 : parseInt(kind.slice(3), 10);
    return { type: "int", value: bytesToSignedBigInt(word, bits) };
  }
  if (kind === "bool") {
    return { type: "bool", value: word[31] !== 0 };
  }
  const bytesNMatch = kind.match(/^bytes(\d+)$/);
  if (bytesNMatch) {
    const n = parseInt(bytesNMatch[1], 10);
    return { type: "bytes", bytes: word.slice(0, n) };
  }
  return { type: "bytes", bytes: word };
}

// src/index.ts
var eip712 = {
  computeEncodeType,
  extractPrimaryType
};
async function format(tx, opts) {
  try {
    let descriptor;
    try {
      const result = await resolveCalldataDescriptor(
        tx.chainId,
        tx.to,
        opts?.descriptorResolverOptions
      );
      if ("warning" in result) {
        const parsed = parseCalldataHex(tx.data);
        if ("warning" in parsed) {
          return { warnings: [result.warning, parsed.warning] };
        }
        return {
          rawCalldataFallback: rawPreviewFromCalldata(
            parsed.selector,
            parsed.calldata
          ),
          warnings: [result.warning]
        };
      } else {
        descriptor = result.descriptor;
      }
    } catch (error) {
      return {
        warnings: [
          warn(
            "DESCRIPTOR_FETCH_ERROR",
            `Failed to resolve descriptor for chain ${tx.chainId} and address ${tx.to}: ${String(error)}`
          )
        ]
      };
    }
    const formatEmbeddedCalldata = (innerTx) => format(innerTx, opts);
    return formatCalldata2(
      tx,
      descriptor,
      opts?.externalDataProvider,
      formatEmbeddedCalldata
    );
  } catch (error) {
    return { warnings: [unexpectedErrorWarning(error)] };
  }
}
async function formatEip5792Batch(batch, opts) {
  try {
    if (batch.calls.length === 0) {
      return {
        callDisplays: [],
        warnings: [warn("BATCH_EMPTY", "Batch contains no calls")]
      };
    }
    const callDisplays = [];
    for (const call of batch.calls) {
      if (!call.data) {
        callDisplays.push({
          warnings: [
            warn(
              "BATCH_VALUE_TRANSFER",
              "Call has no data field \u2014 native value transfer cannot be formatted"
            )
          ]
        });
        continue;
      }
      if (!call.to) {
        callDisplays.push({
          warnings: [
            warn(
              "BATCH_CONTRACT_CREATION",
              "Call has no to field \u2014 contract creation cannot be formatted"
            )
          ]
        });
        continue;
      }
      const tx = {
        chainId: batch.chainId,
        to: call.to,
        data: call.data,
        value: call.value,
        from: batch.from
      };
      callDisplays.push(await format(tx, opts));
    }
    const intents = callDisplays.map((d) => d.interpolatedIntent);
    if (intents.every((i) => !!i)) {
      return { interpolatedIntent: intents.join(" and "), callDisplays };
    }
    return {
      callDisplays,
      warnings: [
        warn(
          "BATCH_INTERPOLATION_INCOMPLETE",
          "Batch interpolatedIntent is not available because one or more calls could not be interpolated"
        )
      ]
    };
  } catch (error) {
    return { callDisplays: [], warnings: [unexpectedErrorWarning(error)] };
  }
}
async function formatTypedData(typedData, opts) {
  try {
    const { chainId, verifyingContract } = typedData.domain;
    if (!chainId || !verifyingContract) {
      return {
        warnings: [
          warn(
            "UNSUPPORTED_DOMAIN",
            "Currently only works on EIP-712 messages with chainId and verifyingContract in the domain"
          )
        ]
      };
    }
    let descriptor;
    try {
      const result = await resolveTypedDataDescriptor(
        typedData,
        opts?.descriptorResolverOptions
      );
      if ("warning" in result) {
        return { warnings: [result.warning] };
      } else {
        descriptor = result.descriptor;
      }
    } catch (error) {
      return {
        warnings: [
          warn(
            "DESCRIPTOR_FETCH_ERROR",
            `Failed to resolve descriptor for chain ${chainId} and address ${verifyingContract}: ${String(error)}`
          )
        ]
      };
    }
    const formatEmbeddedCalldata = (innerTx) => format(innerTx, opts);
    return formatEip712(
      typedData,
      descriptor,
      opts?.externalDataProvider,
      formatEmbeddedCalldata
    );
  } catch (error) {
    return { warnings: [unexpectedErrorWarning(error)] };
  }
}
function unexpectedErrorWarning(error) {
  return warn(
    "UNEXPECTED_LIB_ERROR",
    `Encountered an unexpected error in @ethereum-sourcify/clear-signing. Please report to the maintainers: ${String(error)}`
  );
}
//# sourceMappingURL=index.cjs.map