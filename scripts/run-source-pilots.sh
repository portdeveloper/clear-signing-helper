#!/usr/bin/env bash
set -euo pipefail

# Maintained implementation: run-source-pilots.mjs.
exec node "$(cd "$(dirname "$0")/.." && pwd)/scripts/run-source-pilots.mjs" "$@"
