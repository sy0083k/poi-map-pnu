#!/usr/bin/env bash
set -euo pipefail

GENERATE_XML=0
GENERATE_HTML=0

for arg in "$@"; do
  case "$arg" in
    --xml)
      GENERATE_XML=1
      ;;
    --html)
      GENERATE_HTML=1
      ;;
    *)
      echo "usage: $0 [--xml] [--html]" >&2
      exit 2
      ;;
  esac
done

echo "[coverage] erase stale data"
coverage erase

echo "[coverage] run pytest"
coverage run -m pytest -q

echo "[coverage] report"
coverage report -m

if [ "$GENERATE_XML" -eq 1 ]; then
  echo "[coverage] xml"
  coverage xml
fi

if [ "$GENERATE_HTML" -eq 1 ]; then
  echo "[coverage] html"
  coverage html
fi

echo "[coverage] debug data"
coverage debug data
