"""Minimal TCP client for Blender MCP socket (port 9876)."""
from __future__ import annotations

import json
import socket
import sys
import time
from pathlib import Path
from typing import Any


HOST = "127.0.0.1"
PORT = 9876
RECV_TIMEOUT = 180.0


def _recv_json(sock: socket.socket) -> dict[str, Any]:
    chunks: list[bytes] = []
    sock.settimeout(RECV_TIMEOUT)
    while True:
        data = sock.recv(1024 * 256)
        if not data:
            break
        chunks.append(data)
        text = b"".join(chunks).decode("utf-8", errors="replace")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            continue
    raise RuntimeError("Blender socket closed before valid JSON arrived")


def call(cmd_type: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = {"type": cmd_type, "params": params or {}}
    raw = (json.dumps(payload) + "\n").encode("utf-8")
    with socket.create_connection((HOST, PORT), timeout=10) as sock:
        sock.sendall(raw)
        return _recv_json(sock)


def execute_code(code: str) -> dict[str, Any]:
    return call("execute_code", {"code": code})


def execute_file(path: Path) -> dict[str, Any]:
    code = path.read_text(encoding="utf-8")
    return execute_code(code)


def wait_ready(retries: int = 30) -> None:
    last: Exception | None = None
    for _ in range(retries):
        try:
            res = call("get_scene_info")
            if res.get("status") == "success":
                return
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1)
    raise RuntimeError(f"Blender MCP not ready: {last}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps(call("get_scene_info"), indent=2))
        raise SystemExit(0)
    target = Path(sys.argv[1])
    wait_ready()
    result = execute_file(target)
    print(json.dumps(result, indent=2)[:4000])
    if result.get("status") != "success":
        raise SystemExit(1)
