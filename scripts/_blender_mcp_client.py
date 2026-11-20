"""Minimal Blender MCP TCP client for when Cursor MCP disconnects."""
from __future__ import annotations

import json
import socket
import sys
import time


def call(cmd_type: str, params: dict | None = None, timeout: float = 300.0) -> dict:
    payload = json.dumps({"type": cmd_type, "params": params or {}})
    sock = socket.create_connection(("127.0.0.1", 9876), timeout=30)
    sock.settimeout(timeout)
    sock.sendall(payload.encode("utf-8"))
    data = b""
    while True:
        chunk = sock.recv(1 << 20)
        if not chunk:
            break
        data += chunk
        try:
            obj = json.loads(data.decode("utf-8"))
            sock.close()
            return obj
        except json.JSONDecodeError:
            continue
    sock.close()
    raise RuntimeError(f"Incomplete response: {data[:500]!r}")


def execute(code: str, timeout: float = 300.0) -> dict:
    return call("execute_code", {"code": code}, timeout=timeout)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps(call("ping"), indent=2))
        sys.exit(0)
    mode = sys.argv[1]
    if mode == "ping":
        print(json.dumps(call("ping"), indent=2))
    elif mode == "exec":
        code = sys.stdin.read() if len(sys.argv) < 3 else open(sys.argv[2], encoding="utf-8").read()
        print(json.dumps(execute(code), indent=2))
    elif mode == "shot":
        out = call("get_viewport_screenshot", {"max_size": int(sys.argv[2]) if len(sys.argv) > 2 else 1024})
        print(json.dumps({k: v for k, v in out.items() if k != "result"} | {
            "status": out.get("status"),
            "has_image": bool((out.get("result") or {}).get("image") or (out.get("result") or {}).get("filepath")),
            "keys": list((out.get("result") or {}).keys()) if isinstance(out.get("result"), dict) else None,
        }, indent=2))
        # save image if present
        result = out.get("result") or {}
        path = result.get("filepath")
        if path:
            print("FILE", path)
        elif result.get("image"):
            import base64
            raw = result["image"]
            if isinstance(raw, str) and raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            dest = sys.argv[3] if len(sys.argv) > 3 else "qa_screenshots/phase2_blender_viewport.png"
            import os
            os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
            with open(dest, "wb") as f:
                f.write(base64.b64decode(raw))
            print("SAVED", dest)
    else:
        print("usage: ping | exec [file] | shot [max] [out]")
        sys.exit(1)
