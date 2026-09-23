#!/usr/bin/env bash
# run.sh <baseline|tool> <n> [workdir]: one headless Claude Code run in a fresh directory outside any repo,
# so no CLAUDE.md is loaded. The result JSON (tokens, cost, duration) lands in <workdir>/<arm>-<n>.json.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd); arm=$1; n=$2; C=${3:-/tmp/clear-signing-comparison}
W=$C/$arm-$n; mkdir -p "$W" && cd "$W"
# The tool arm builds the registry runners from scratch, like a first-time user.
export CLEAR_SIGNING_RUNNERS_DIR=$W/.runners-cache
date -u +%FT%TZ > "$C/$arm-$n.start"
timeout 5400 claude -p "$(cat "$here/prompt-$arm.txt")" --model claude-opus-5-5 --effort high \
  --output-format json --dangerously-skip-permissions > "$C/$arm-$n.json" 2> "$C/$arm-$n.err"
date -u +%FT%TZ > "$C/$arm-$n.end"
