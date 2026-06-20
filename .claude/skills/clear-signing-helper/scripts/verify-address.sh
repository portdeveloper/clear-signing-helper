#!/usr/bin/env bash
# Verify a contract address on-chain before writing it into a descriptor.
#
# Usage: verify-address.sh <chainId> <address> <rpcUrl> [eip712Name] [eip712Version]
#   - Always confirms there is bytecode at the address.
#   - If the contract exposes DOMAIN_SEPARATOR(), it matches the live value against the
#     EIP-712 domain shapes seen in the wild and reports which one matched:
#       * 2-field: EIP712Domain(uint256 chainId,address verifyingContract)                          (e.g. Morpho Blue)
#       * 3-field: EIP712Domain(string name,uint256 chainId,address verifyingContract)              (e.g. Permit2)
#       * 4-field: EIP712Domain(string name,string version,uint256 chainId,address verifyingContract) (most ERC-2612 tokens)
#     The 2-field check always runs. Pass the name (and version) to also try the 3- and 4-field shapes.
#
# Requires foundry's `cast` (https://getfoundry.sh).
set -euo pipefail

CHAIN="${1:?usage: verify-address.sh <chainId> <address> <rpcUrl> [eip712Name] [eip712Version]}"
ADDR="${2:?address}"
RPC="${3:?rpcUrl}"
NAME="${4:-}"
VERSION="${5:-}"

command -v cast >/dev/null || { echo "needs foundry's cast: https://getfoundry.sh" >&2; exit 1; }

CODE=$(cast code "$ADDR" --rpc-url "$RPC")
if [ "$CODE" = "0x" ] || [ -z "$CODE" ]; then
  echo "FAIL: no contract code at $ADDR on chain $CHAIN (a same-address-everywhere vanity address may not be deployed here)" >&2
  exit 1
fi
echo "OK: bytecode present (${#CODE} hex chars)"

ONCHAIN=$(cast call "$ADDR" "DOMAIN_SEPARATOR()(bytes32)" --rpc-url "$RPC" 2>/dev/null || true)
if [ -z "$ONCHAIN" ]; then
  echo "no DOMAIN_SEPARATOR() getter; confirm identity with a known view function instead."
  exit 0
fi
echo "on-chain DOMAIN_SEPARATOR: $ONCHAIN"

match=""

# 2-field (no name) -- e.g. Morpho Blue
TH2=$(cast keccak "EIP712Domain(uint256 chainId,address verifyingContract)")
EXP2=$(cast keccak "$(cast abi-encode 'x(bytes32,uint256,address)' "$TH2" "$CHAIN" "$ADDR")")
[ "$ONCHAIN" = "$EXP2" ] && match="2-field (chainId, verifyingContract)"

if [ -z "$match" ] && [ -n "$NAME" ]; then
  NH=$(cast keccak "$NAME")
  # 3-field (name) -- e.g. Permit2
  TH3=$(cast keccak "EIP712Domain(string name,uint256 chainId,address verifyingContract)")
  EXP3=$(cast keccak "$(cast abi-encode 'x(bytes32,bytes32,uint256,address)' "$TH3" "$NH" "$CHAIN" "$ADDR")")
  [ "$ONCHAIN" = "$EXP3" ] && match="3-field (name, chainId, verifyingContract)"
  if [ -z "$match" ] && [ -n "$VERSION" ]; then
    VH=$(cast keccak "$VERSION")
    # 4-field (name + version) -- most ERC-2612 tokens
    TH4=$(cast keccak "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    EXP4=$(cast keccak "$(cast abi-encode 'x(bytes32,bytes32,bytes32,uint256,address)' "$TH4" "$NH" "$VH" "$CHAIN" "$ADDR")")
    [ "$ONCHAIN" = "$EXP4" ] && match="4-field (name, version, chainId, verifyingContract)"
  fi
fi

if [ -n "$match" ]; then
  echo "MATCH: domain is $match -- address is the genuine contract on chain $CHAIN"
else
  echo "no match among tried domain shapes (2-field always; 3/4-field need name/version)."
  echo "the contract may use a different domain. pass the right name/version, or compute its domain by hand before trusting the address."
  exit 1
fi
