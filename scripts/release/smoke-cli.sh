#!/usr/bin/env bash
# Pre-publish smoke test: pack the cli locally, install in a tmp dir,
# run --help and a real diff against the fixtures.
# Usage: smoke-cli.sh
# Returns 0 on success, non-zero otherwise.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI_DIR="${REPO_ROOT}/packages/cli"
FIXTURES="${CLI_DIR}/tests/fixtures"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cd "$CLI_DIR"
TARBALL=$(pnpm pack --silent | tail -1)
TARBALL_PATH="${CLI_DIR}/${TARBALL}"
if [ ! -f "$TARBALL_PATH" ]; then
  echo "error: pnpm pack did not produce a tarball" >&2
  exit 1
fi
cd "$REPO_ROOT"

cd "$TMP"
npm init -y >/dev/null
npm install --silent "$TARBALL_PATH"
echo "--- installed"
ls node_modules/@zwaggen/

# Confirm core was NOT installed as a runtime dep
if [ -d "node_modules/@zwaggen/core" ]; then
  echo "error: @zwaggen/core was installed as a runtime dep — bundle is broken" >&2
  exit 1
fi

# --help
node node_modules/@zwaggen/cli/bin/zwag.js --help > /dev/null
echo "--- --help ok"

# Real diff (identical specs → exit 0)
node node_modules/@zwaggen/cli/bin/zwag.js diff "$FIXTURES/spec-a.json" "$FIXTURES/spec-a.json"
echo "--- diff (identical) ok, exit 0"

# Breaking diff → exit 1
set +e
node node_modules/@zwaggen/cli/bin/zwag.js diff "$FIXTURES/spec-a.json" "$FIXTURES/spec-b-breaking.json"
RC=$?
set -e
if [ "$RC" -ne 1 ]; then
  echo "error: expected breaking diff to exit 1, got $RC" >&2
  exit 1
fi
echo "--- diff (breaking) exit 1 ok"

# Cleanup tarball in repo
rm -f "$TARBALL_PATH"

echo "smoke-cli: PASS"
