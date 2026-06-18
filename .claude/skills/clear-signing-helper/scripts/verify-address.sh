#!/usr/bin/env bash
# Verify a contract address on-chain before writing it into a descriptor.
#
# Usage: verify-address.sh <chainId> <address> <rpcUrl> [eip712Name] [eip712Version]
#   - Always confirms there is bytecode at the address.
#   - If eip712Name is given, matches the live DOMAIN_SEPARATOR() against the value
#     computed for that domain (4-field if a version is given, else 3-field name+chain+contract).
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
  echo "FAIL: no contract code at $ADDR on chain $CHAIN" >&2
  exit 1
fi
echo "OK: bytecode present (${#CODE} hex chars)"

if [ -z "$NAME" ]; then
  echo "no EIP-712 name given; bytecode-only check. Confirm identity with a known view function."
  exit 0
fi

ONCHAIN=$(cast call "$ADDR" "DOMAIN_SEPARATOR()(bytes32)" --rpc-url "$RPC" 2>/dev/null || true)
if [ -z "$ONCHAIN" ]; then
  echo "no DOMAIN_SEPARATOR() getter on this contract; confirm identity another way."
  exit 0
fi

NAMEHASH=$(cast keccak "$NAME")
if [ -n "$VERSION" ]; then
  TH=$(cast keccak "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
  VHASH=$(cast keccak "$VERSION")
  EXP=$(cast keccak "$(cast abi-encode 'x(bytes32,bytes32,bytes32,uint256,address)' "$TH" "$NAMEHASH" "$VHASH" "$CHAIN" "$ADDR")")
else
  TH=$(cast keccak "EIP712Domain(string name,uint256 chainId,address verifyingContract)")
  EXP=$(cast keccak "$(cast abi-encode 'x(bytes32,bytes32,uint256,address)' "$TH" "$NAMEHASH" "$CHAIN" "$ADDR")")
fi

echo "on-chain : $ONCHAIN"
echo "expected : $EXP"
if [ "$ONCHAIN" = "$EXP" ]; then
  echo "MATCH: address is the contract for this domain on chain $CHAIN"
else
  echo "MISMATCH: do not use this address/domain. Check name/version (some omit version)." >&2
  exit 1
fi
