#!/usr/bin/env bash
# score.sh <label> <out/registry dir> <registry clone> [workdir]: run the registry's pull-request checks on one
# output in a fresh copy of the clone: lint at the CI pin and at the #3038 pin with --require-verified, both
# JSON schemas, the testsv2 requirement, selector coverage, the recommendations script, the format bot, and
# both registry test runners. Needs uvx, node, and `npm ci --ignore-scripts` run once in the clone.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd); repo=$(cd "$here/../.." && pwd)
L=$1; SRC=$(realpath "$2"); REG=$(realpath "$3"); WD=${4:-/tmp/clear-signing-comparison}; E=$WD/eval-$L
rm -rf "$E" && cp -r "$REG" "$E" && cp -r "$SRC"/* "$E/registry/" && cd "$E"
DESC=$(cd "$SRC" && find . -type f -name 'calldata-*.json' -not -path '*/testsv2/*' -not -path '*/tests/*' | sed 's|^\./|registry/|')
TESTS=$(cd "$SRC" && find . -type f -path '*/testsv2/*' | sed 's|^\./|registry/|')
CI="erc7730 @ git+$(sed -n 's/^erc7730 @ git+//p' .github/requirements.txt)"
NEXT='erc7730 @ git+https://github.com/sourcifyeth/python-erc7730@f2fafe1'
echo "== lint (registry CI pin)"; uvx --from "$CI" erc7730 lint $DESC --gha 2>&1 | tail -30; echo "exit ${PIPESTATUS[0]}"
echo "== lint (PR #3038 pin, --require-verified)"; uvx --from "$NEXT" erc7730 lint --require-verified $DESC 2>&1 | tail -30; echo "exit ${PIPESTATUS[0]}"
echo "== schema"; for f in $DESC; do uvx --from check-jsonschema==0.38.0 check-jsonschema --schemafile specs/erc7730-v2.schema.json "$f" 2>&1 | tail -5; done
for f in $TESTS; do uvx --from check-jsonschema==0.38.0 check-jsonschema --schemafile specs/erc7730-tests-v2.schema.json "$f" 2>&1 | tail -5; done
echo "== require testsv2"; for f in $DESC; do t=$(dirname "$f")/testsv2/$(basename "$f" .json).tests.json; [ -f "$t" ] && echo "ok $t" || echo "MISSING $t"; done
echo "== selector coverage"; node .github/scripts/check-selector-coverage.js $DESC 2>&1 | tail -10; echo "exit ${PIPESTATUS[0]}"
echo "== recommended fields (advisory)"; node .github/scripts/check-recommended-fields.js $DESC 2>&1 | tail -10
echo "== format bot (lines with M would be rewritten)"; git add -A >/dev/null; uvx --from "$CI" erc7730 format >/dev/null 2>&1; git status --short -- $(cd "$SRC" && ls -d */ | sed 's|^|registry/|')
echo "== runners"; for t in $TESTS; do (cd "$repo" && npx tsx "$here/runners.ts" "$E/$t" "$E" "$WD/runners-$L" "$REG" 2>&1 | tail -5); done
