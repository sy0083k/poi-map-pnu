#!/usr/bin/env bash
set -u

warn_count=0

echo "[quality] file length warning scan"
while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 250 ]; then
    echo "::warning file=$file,title=File length warning::Python file has $lines lines (threshold: 250)"
    warn_count=$((warn_count + 1))
  fi
done < <(find app tests -type f -name '*.py' | sort)

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -gt 220 ]; then
    echo "::warning file=$file,title=File length warning::TypeScript file has $lines lines (threshold: 220)"
    warn_count=$((warn_count + 1))
  fi
done < <(find frontend/src -type f -name '*.ts' | sort)

echo "[quality] xenon complexity warning scan"
if ! command -v xenon >/dev/null 2>&1; then
  echo "::warning title=Complexity warning::xenon is not installed; skipping complexity scan."
  warn_count=$((warn_count + 1))
elif ! xenon app tests -b B -m C -a C >/tmp/xenon-quality.log 2>&1; then
  echo "::warning title=Complexity warning::Xenon thresholds exceeded (B/C/C)."
  sed -n '1,200p' /tmp/xenon-quality.log
  warn_count=$((warn_count + 1))
fi

echo "[quality] total warnings: $warn_count"
exit 0
