#!/usr/bin/env bash
set -euo pipefail

archives_dir="${1:?usage: $0 ARCHIVES_DIR DOWNLOAD_URL_PREFIX}"
download_url_prefix="${2:?usage: $0 ARCHIVES_DIR DOWNLOAD_URL_PREFIX}"
sparkle_bin="${SPARKLE_BIN:-}"
sparkle_ed_key="${SPARKLE_ED_KEY:-}"

if [[ -z "$sparkle_bin" || ! -x "$sparkle_bin/generate_appcast" ]]; then
    echo "SPARKLE_BIN must point to Sparkle's bin directory" >&2
    exit 2
fi
if [[ -z "$sparkle_ed_key" ]]; then
    echo "SPARKLE_ED_KEY is required to sign the appcast" >&2
    exit 2
fi

mkdir -p "$archives_dir"

generate=("$sparkle_bin/generate_appcast" \
    --download-url-prefix "${download_url_prefix%/}/" \
    --embed-release-notes \
    "$archives_dir")

printf '%s' "$sparkle_ed_key" | "${generate[@]:0:1}" \
    --ed-key-file - \
    "${generate[@]:1}"

test -s "$archives_dir/appcast.xml"
echo "Generated $archives_dir/appcast.xml"
