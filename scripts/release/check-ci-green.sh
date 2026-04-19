#!/usr/bin/env bash
# Verifies the latest run of the test workflow on the given SHA succeeded.
# Usage: check-ci-green.sh <SHA>
# Requires: GH_TOKEN env var (auto-provided in GitHub Actions).
# Exits 0 if green, 1 otherwise.
set -euo pipefail

SHA="${1:?usage: check-ci-green.sh <SHA>}"
WORKFLOW="test.yml"

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY env var required (set by GitHub Actions; for local use export it as owner/repo)}"

echo "Checking ${WORKFLOW} on ${REPO}@${SHA}..."

CONCLUSION=$(gh api \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${SHA}&per_page=1" \
  --jq '.workflow_runs[0].conclusion // "missing"')

case "$CONCLUSION" in
  success) echo "ok: CI green on ${SHA}"; exit 0 ;;
  missing) echo "error: no ${WORKFLOW} run found for ${SHA} — push to main and wait for CI" >&2; exit 1 ;;
  *)       echo "error: ${WORKFLOW} on ${SHA} is '${CONCLUSION}', not 'success'" >&2; exit 1 ;;
esac
