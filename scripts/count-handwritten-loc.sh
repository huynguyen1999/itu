#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "      Handwritten Production LOC Report    "
echo "=========================================="

API_LOC=$(cloc api/src --include-lang=TypeScript --exclude-dir=node_modules,dist,generated --not-match-f='.*\.spec\.ts$|.*\.test\.ts$' --quiet --csv | tail -n 1 | cut -d',' -f5)
WEB_LOC=$(cloc web/src --include-lang=TypeScript --exclude-dir=node_modules,dist,generated --not-match-f='.*\.spec\.ts$|.*\.test\.ts$|.*\.test\.tsx$' --quiet --csv | tail -n 1 | cut -d',' -f5)
MACOS_LOC=$(cloc macos/iTu --include-lang=Swift --exclude-dir=iTuTests,OpenAPI,generated --not-match-f='.*\.generated\.swift$|.*Tests\.swift$' --quiet --csv | tail -n 1 | cut -d',' -f5)

TOTAL_LOC=$((API_LOC + WEB_LOC + MACOS_LOC))

echo "API Production LOC:   ${API_LOC}"
echo "Web Production LOC:   ${WEB_LOC}"
echo "macOS Production LOC: ${MACOS_LOC}"
echo "------------------------------------------"
echo "Total Production LOC: ${TOTAL_LOC}"
echo "=========================================="
