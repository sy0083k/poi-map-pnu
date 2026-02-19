#!/usr/bin/env bash
set -euo pipefail

MANIFEST_PATH="static/dist/.vite/manifest.json"

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "ERROR: Missing Vite manifest at $MANIFEST_PATH"
  echo "Run: cd frontend && npm ci && npm run build"
  exit 1
fi

echo "OK: Found Vite manifest at $MANIFEST_PATH"
