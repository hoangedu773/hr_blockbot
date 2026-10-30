"""Probe UseJevAI keys: which ones still have trial budget, without running inference.

UseJevAI is an async run API, not a single POST like `thejevai.com/v1/systemone`:
  POST /api/v1/runs      -> data.id (queued)
  GET  /api/v1/runs/{id} -> status + result

This script only reads: `GET /api/jev/status` (service availability) and
`GET /api/v1/runs?limit=1` (key validity + recent runs). Pass `--run` to spend one
trial run and print the full JSON so the response contract can be inspected.

Keys come from JEV_USEJEVAI_KEYS (comma separated) or apps/ai-service/.env.
Keys are always printed masked.

Usage:
  python scripts/jev_usejevai_probe.py
  python scripts/jev_usejevai_probe.py --run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / "apps" / "ai-service" / ".env"
BASE = "https://usejevai.com"
UA = "python-httpx/0.27.0"


def load_keys() -> list[str]:
    raw = os.environ.get("JEV_USEJEVAI_KEYS", "").strip()
    if not raw and ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.strip().startswith("JEV_USEJEVAI_KEYS="):
                raw = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    return [item.strip() for item in raw.split(",") if item.strip()]


def mask(key: str) -> str:
    return f"{key[:6]}…{key[-4:]}"


def call(method: str, path: str, key: str, payload: dict | None = None, timeout: float = 20.0):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace"), (time.monotonic() - started) * 1000
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace"), (time.monotonic() - started) * 1000
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 0, f"{type(exc).__name__}: {exc}", (time.monotonic() - started) * 1000


def safe_body(body: str, limit: int = 400, full: bool = False) -> str:
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict):
            safe: dict[str, Any] = {}
            if "code" in parsed and isinstance(parsed["code"], (int, float)):
                safe["code"] = parsed["code"]
            data = parsed.get("data")
            if isinstance(data, dict):
                safe["data"] = {
                    k: data[k]
                    for k in ("id", "status")
                    if k in data and isinstance(data[k], (str, int, float, bool))
                }
                if "result" in data and isinstance(data["result"], dict):
                    safe["data"]["result"] = {"status": "present"}
            elif isinstance(data, list):
                safe["data"] = [
                    {k: item[k] for k in ("id", "status") if k in item}
                    for item in data
                    if isinstance(item, dict)
                ]
            if full:
                return json.dumps(safe, ensure_ascii=False, indent=2)
            return json.dumps(safe, ensure_ascii=False)[:limit]
    except Exception:
        pass
    return "[bounded_output]"


def trial_run(key: str, text: str) -> tuple[int, str, float]:
    """One trial run: submit, then poll until it leaves queued/running."""
    payload = {
        "funding": "prefer_trial",
        "idempotencyKey": f"smoke-{int(time.time())}",
        "input": {
            "state": text,
            "questions": [
                {
                    "id": "intent",
                    "type": "choice",
                    "instructions": "Phân loại ý định người dùng.",
                    "options": [
                        {"label": "policy_query", "description": "Hỏi quy định, nội quy, mức phạt, thưởng."},
                        {"label": "shift_operation", "description": "Xin nghỉ, đổi ca, thao tác lịch làm việc."},
                        {"label": "cash_audit", "description": "Sự cố kiểm quỹ, chênh lệch tiền két."},
                        {"label": "general_chat", "description": "Chào hỏi, trò chuyện chung."},
                    ],
                },
                {
                    "id": "needs_manager_approval",
                    "type": "noul",
                    "instructions": "Hành động này có cần Cửa hàng trưởng duyệt không?",
                    "options": [],
                },
                {
                    "id": "incident_urgency",
                    "type": "score",
                    "instructions": "Mức khẩn cấp của sự việc.",
                    "options": [
                        {"label": "0", "description": "Bình thường"},
                        {"label": "1", "description": "Nguy hiểm tức thì"},
                    ],
                },
            ],
        },
    }
    status, body, elapsed = call("POST", "/api/v1/runs", key, payload)
    if status not in (200, 201, 202):
        return status, body, elapsed
    try:
        parsed = json.loads(body)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("data"), dict):
            return status, body, elapsed
        run_id = parsed["data"].get("id")
        if not run_id:
            return status, body, elapsed
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return status, body, elapsed

    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        time.sleep(1.5)
        status, body, elapsed = call("GET", f"/api/v1/runs/{run_id}", key)
        try:
            parsed = json.loads(body)
            data = parsed.get("data") if isinstance(parsed, dict) else None
            state = data.get("status") if isinstance(data, dict) else None
        except (KeyError, TypeError, json.JSONDecodeError):
            return status, body, elapsed
        if state not in ("queued", "running", "pending"):
            return status, body, elapsed
    return status, body, elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe UseJevAI keys.")
    parser.add_argument("--run", action="store_true", help="spend one trial run on the first working key")
    parser.add_argument("--text", default="Em xin nghỉ ca tối mai vì con ốm, anh duyệt giúp em với.")
    parser.add_argument("--full", action="store_true", help="print the whole body of the trial run")
    args = parser.parse_args()

    keys = load_keys()
    if not keys:
        print("Không tìm thấy JEV_USEJEVAI_KEYS (env hoặc apps/ai-service/.env).")
        return 2

    print(f"keys: {len(keys)}")
    status_code, status_body, _ = call("GET", "/api/jev/status", keys[0])
    print(f"service /api/jev/status -> {status_code} {safe_body(status_body, 200)}")

    alive: list[str] = []
    for index, key in enumerate(keys, start=1):
        code, body, elapsed = call("GET", "/api/v1/runs?limit=1", key)
        ok = code == 200
        if ok:
            alive.append(key)
        print(f"  #{index} {mask(key):<18} GET /api/v1/runs -> {code} ({elapsed:.0f}ms) {safe_body(body, 160)}")

    print(f"\nusable: {len(alive)}/{len(keys)}")

    if args.run and alive:
        print("\n--- one trial run (spends trial tokens) ---")
        code, body, elapsed = trial_run(alive[0], args.text)
        print(f"status {code} in {elapsed:.0f}ms")
        if args.full:
            print(safe_body(body, full=True))
        else:
            print(safe_body(body, 900))
        trial_success = False
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict) and isinstance(parsed.get("data"), dict):
                if code in (200, 201, 202) and parsed["data"].get("status") == "succeeded":
                    trial_success = True
        except Exception:
            trial_success = False
        if not trial_success:
            return 1
    return 0 if alive else 4


if __name__ == "__main__":
    sys.exit(main())
