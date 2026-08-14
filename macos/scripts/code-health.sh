#!/usr/bin/env bash
set -u

macos_root="$(cd "$(dirname "$0")/.." && pwd)"
status=0

if command -v swiftlint >/dev/null 2>&1; then
  swiftlint lint --config "$macos_root/.swiftlint.yml" "$macos_root/iTu" || status=1
else
  echo "swiftlint not installed; skipped SwiftLint"
fi

if command -v periphery >/dev/null 2>&1; then
  (cd "$macos_root" && periphery scan --config .periphery.yml) || status=1
else
  echo "periphery not installed; skipped Periphery"
fi

exit "$status"
