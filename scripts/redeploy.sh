#!/usr/bin/env bash
# Rebuild the Cloudflare bundle from src/ + public/ and generate the connector deploy steps.
#   ./scripts/redeploy.sh                     → build + steps 1 and 3 (then run step 1, and re-run with its result)
#   ./scripts/redeploy.sh <manifest-result>   → build + upload steps for only new/changed files + step 3
# Then run each /workspace/cfdeploy/*.js in order with the Cloudflare connector's execute tool ("code": "$file:<path>").
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-cf.js
node scripts/cf-connector-deploy.js manifest
if [ -n "${1:-}" ]; then node scripts/cf-connector-deploy.js upload "$1"; fi
node scripts/cf-connector-deploy.js script
ls -1 "${OUT:-/workspace/cfdeploy}"
