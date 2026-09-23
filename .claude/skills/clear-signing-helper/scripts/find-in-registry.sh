#!/usr/bin/env bash
# Search a clone of the clear-signing registry for an existing descriptor,
# so you extend an existing file (one-line chain add) instead of authoring a new one.
#
# Usage: find-in-registry.sh <address-or-name> [registry-root]
#   <address-or-name>  a contract address (any case) or a protocol/owner name
#   [registry-root]    path to a clone of ethereum/clear-signing-erc7730-registry
#                      (defaults to the current directory)
set -euo pipefail

QUERY="${1:?usage: find-in-registry.sh <address-or-name> [registry-root]}"
ROOT="${2:-.}"
REG="$ROOT/registry"

if [ ! -d "$REG" ]; then
  echo "No 'registry/' under '$ROOT'. Pass a clone of ethereum/clear-signing-erc7730-registry." >&2
  exit 1
fi

echo "# Files mentioning '$QUERY' (case-insensitive):"
grep -ril -- "$QUERY" "$REG" || echo "  (none)"

echo
echo "# Entity folders that look related:"
ls "$REG" | grep -i -- "$QUERY" || echo "  (none found - you are likely authoring a NEW descriptor)"

echo
echo "If a file matched an address/name and only your chain is missing, do not edit it by hand. Run:"
echo "  clear-signing registry add-deployment --registry $ROOT --descriptor registry/<entity>/<file>.json --chain-id <id> --address <addr>"
echo "It proves the address is the same contract, adds the deployment and renders a test case (EIP-712 files also need --rpc-url)."
