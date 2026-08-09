#!/usr/bin/env python3
import json
import pathlib
import struct
import subprocess
import sys


def read_exact(stream, count):
    data = stream.read(count)
    if data is None or len(data) != count:
        raise AssertionError(f"expected {count} response bytes, received {len(data or b'')}")
    return data


def send(process, message):
    payload = json.dumps(message, separators=(",", ":")).encode()
    process.stdin.write(struct.pack("<I", len(payload)) + payload)
    process.stdin.flush()
    length = struct.unpack("<I", read_exact(process.stdout, 4))[0]
    return json.loads(read_exact(process.stdout, length))


def read_state(path):
    return json.loads(path.read_text())


def main():
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {sys.argv[0]} SIGNED_BROWSER_ACTIVITY_HOST")

    state_path = pathlib.Path.home() / "Library/Group Containers/group.com.itu.browser-activity/browser-activity.json"
    process = subprocess.Popen(
        [sys.argv[1]],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    active = {
        "protocolVersion": 1,
        "browserBundleId": "com.microsoft.edgemac",
        "sequence": 41,
        "state": "active",
        "hostname": "Example.COM",
        "incognito": False,
    }
    inactive = {
        "protocolVersion": 1,
        "browserBundleId": "com.microsoft.edgemac",
        "sequence": 42,
        "state": "inactive",
        "incognito": False,
    }

    assert send(process, active) == {"ok": True}
    state = read_state(state_path)
    assert state["sequence"] == 41
    assert state["state"] == "active"
    assert state["hostname"] == "example.com"
    assert state["connected"] is True

    assert send(process, inactive) == {"ok": True}
    state = read_state(state_path)
    assert state["sequence"] == 42
    assert state["state"] == "inactive"
    assert state.get("hostname") is None
    assert state["connected"] is True

    rejected = dict(active, sequence=43, incognito=True)
    assert send(process, rejected)["ok"] is False
    assert read_state(state_path)["sequence"] == 42

    process.stdin.close()
    return_code = process.wait(timeout=5)
    assert return_code == 0, process.stderr.read().decode()
    state = read_state(state_path)
    assert state["sequence"] == 42
    assert state["state"] == "inactive"
    assert state.get("hostname") is None
    assert state["connected"] is False
    print("active frame: passed; inactive frame: passed; incognito rejection: passed; clean EOF: passed")


if __name__ == "__main__":
    main()
