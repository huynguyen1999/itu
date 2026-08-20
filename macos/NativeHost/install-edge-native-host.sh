#!/bin/zsh
set -euo pipefail

extension_origin="${1:-}"
script_root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ $# -ge 2 ]]; then
    host_binary="$2"
else
    installed_app="${ITU_APP_BUNDLE_PATH:-/Applications/iTu.app}"
    host_binary="$installed_app/Contents/Helpers/BrowserActivityHost"
    if [[ ! -x "$host_binary" ]]; then
        host_binary="$script_root/build/DerivedData/Build/Products/Debug/BrowserActivityHost"
        [[ -x "$host_binary" ]] || host_binary="$script_root/build/Debug/BrowserActivityHost"
    fi
fi
manifest_dir="${EDGE_NATIVE_MESSAGING_HOST_DIR:-$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts}"

if [[ "$extension_origin" =~ ^[a-p]{32}$ ]]; then
    extension_origin="chrome-extension://${extension_origin}/"
elif [[ "$extension_origin" =~ ^chrome-extension://[a-p]{32}/$ ]]; then
    :
else
    print -u2 "usage: $0 EDGE_EXTENSION_ID_OR_ORIGIN [SIGNED_HOST_BINARY]"
    exit 2
fi

if [[ ! -x "$host_binary" ]]; then
    print -u2 "signed host binary not found: $host_binary"
    exit 1
fi

mkdir -p "$manifest_dir"
/usr/bin/python3 - "$host_binary" "$extension_origin" "$manifest_dir/com.itu.browser_activity.json" <<'PY'
import json
import os
import sys
import tempfile

host_binary, origin, destination = sys.argv[1:]
payload = {
    "name": "com.itu.browser_activity",
    "description": "iTu Edge Browser Activity",
    "path": os.path.abspath(host_binary),
    "type": "stdio",
    "allowed_origins": [origin],
}
directory = os.path.dirname(destination)
fd, temporary = tempfile.mkstemp(prefix=".browser_activity.", dir=directory)
try:
    with os.fdopen(fd, "w") as file:
        json.dump(payload, file, indent=2)
        file.write("\n")
    os.replace(temporary, destination)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

print "Installed com.itu.browser_activity for $extension_origin"
