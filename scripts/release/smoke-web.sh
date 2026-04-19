#!/usr/bin/env bash
# Pre-publish smoke test: pack @zwaggen/web locally, install in a tmp dir,
# boot the wrapper, curl it, kill it.
# Usage: smoke-web.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_DIR="${REPO_ROOT}/apps/web"
TMP=$(mktemp -d)
cd "$WEB_DIR"
TARBALL=$(pnpm pack --silent | tail -1)
TARBALL_PATH="${WEB_DIR}/${TARBALL}"
if [ ! -f "$TARBALL_PATH" ]; then
  echo "error: pnpm pack did not produce a tarball" >&2
  exit 1
fi
cd "$REPO_ROOT"
trap 'rm -rf "$TMP"; rm -f "$TARBALL_PATH"; [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null || true' EXIT

cd "$TMP"
npm init -y >/dev/null
npm install --silent "$TARBALL_PATH"
echo "--- installed"

# Boot the wrapper in background, --no-open, OS-picked port
LOG="$TMP/zw.log"
node node_modules/@zwaggen/web/bin/zwaggen-web.js --no-open --port 0 > "$LOG" 2>&1 &
PID=$!

# Wait up to 10s for the URL to appear
for i in $(seq 1 50); do
  URL=$(grep -oE 'http://[^ ]+' "$LOG" | head -1 || true)
  if [ -n "$URL" ]; then break; fi
  sleep 0.2
done
if [ -z "$URL" ]; then
  echo "error: wrapper did not print URL within 10s" >&2
  cat "$LOG" >&2
  exit 1
fi
echo "--- URL: $URL"

# Verify root and SPA fallback both serve the index
curl --fail -sS "$URL" | grep -q '<div id="root"' || { echo "error: root did not contain SPA root div" >&2; exit 1; }
curl --fail -sS "$URL/some/spa/route" | grep -q '<div id="root"' || { echo "error: SPA fallback failed" >&2; exit 1; }
echo "--- served root + spa fallback ok"

kill "$PID"
wait "$PID" 2>/dev/null || true
PID=""

echo "smoke-web: PASS"
