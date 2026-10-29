"""Smoke-test the Jev System One endpoint before wiring it into the agent loop.

Answers one question: does `JEV_API_KEY` + the payload in
`apps/ai-service/app/agent/jev_gateway.py::_system_one` actually produce a typed
decision, or does it fail on auth / payload shape / credits?

The key must come from the *same host* you call. A Vercel AI Gateway key
(`vck_...`) or a UseJevAI key will not authenticate against `thejevai.com`.

Usage (from the repo root):
  python scripts/jev_smoke.py --dry-run          # print the payload, no network
  python scripts/jev_smoke.py                    # call the default endpoint
  python scripts/jev_smoke.py --url https://other.host/v1/systemone
  JEV_API_KEY=sk_... python scripts/jev_smoke.py

Exit codes: 0 ok, 2 no key, 3 network error, 4 HTTP error, 5 Jev rejected / bad shape.

Never prints the key. Bodies are truncated to 1200 chars.
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

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILES = (REPO_ROOT / ".env", REPO_ROOT / "apps" / "ai-service" / ".env")
DEFAULT_URL = "https://thejevai.com/v1/systemone"
DEFAULT_MODEL = "typesafe/jev-1.14"
DEFAULT_TEXT = "Em xin nghỉ ca tối mai vì con ốm, anh duyệt giúp em với."

INTENT_CRITERIA = {
    "policy_query": "Hỏi quy định, nội quy, mức phạt, thưởng, tiêu chuẩn phục vụ; không yêu cầu thao tác.",
    "shift_operation": "Yêu cầu đổi ca, xin nghỉ/vắng ca, thao tác lịch làm việc.",
    "cash_audit": "Sự cố hoặc yêu cầu kiểm quỹ, giải trình chênh lệch tiền két.",
    "general_chat": "Chào hỏi, trò chuyện hoặc câu hỏi chung khác.",
}


def read_key_from_env_files() -> str:
    """Last-resort lookup so the script works without exporting the variable."""
    for path in ENV_FILES:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line.startswith("JEV_API_KEY=") and not line.endswith("="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def build_payload(text: str, model: str) -> dict:
    """Mirror of jev_gateway._system_one: questions as an object keyed by name."""
    return {
        "model": model,
        "state": text,
        "questions": {
            "intent": {
                "type": "choice",
                "instructions": "Phân loại ý định người dùng.",
                "criteria": INTENT_CRITERIA,
            },
            "needs_manager_approval": {
                "type": "noul",
                "instructions": "Hành động có cần Cửa hàng trưởng SM duyệt không?",
                "criteria": {
                    "true": "Cần phê duyệt thao tác đổi ca/giải trình quỹ.",
                    "false": "Chỉ hỏi thông tin/trò chuyện.",
                },
            },
            "incident_urgency": {
                "type": "score",
                "instructions": "Mức khẩn cấp của sự cố (0 bình thường, 1 nguy hiểm tức thì).",
                "criteria": ["Bình thường", "Nguy hiểm tức thì"],
            },
        },
    }


def mask(key: str) -> str:
    if not key:
        return "(missing)"
    return f"{key[:4]}...{key[-2:]} (len={len(key)})"


def diagnose(status: int, body: dict | None, raw: str = "") -> str:
    if status == 401:
        return "Key sai/thiếu cho host này, hoặc key thuộc provider khác. 401 KHÔNG phải lỗi payload."
    if status == 403 and "1010" in raw:
        return (
            "Cloudflare chặn User-Agent (error 1010), KHÔNG phải lỗi key. "
            "Host này chặn `Python-urllib/*` nhưng cho `python-httpx/*` và `curl/*` qua — "
            "client thật dùng httpx nên OK, chỉ script lạ mới bị."
        )
    if status == 402 or status == 403:
        return "Host nhận key nhưng tài khoản không có credit / chưa bật API access."
    if status == 404:
        return "Sai đường dẫn — host này không phục vụ /v1/systemone."
    if status == 429:
        return "Rate limit (trial thường 20 attempt/phút). Chờ rồi chạy lại."
    if status == 400:
        return "Payload sai shape (questions dạng object+criteria vs array+options, tên type, ...)."
    if status == 200 and isinstance(body, dict) and body.get("code") not in (0, None):
        return f"HTTP 200 nhưng code={body.get('code')} — Jev từ chối; đọc message trong body."
    if status == 200:
        return "OK — payload và key khớp. Kiểm tra 3 answer bên dưới có đúng type không."
    return "Không có chẩn đoán cho mã này; đọc body."


def check_answers(body: dict) -> list[str]:
    """Same contract check as jev_gateway: type must match the question kind."""
    problems: list[str] = []
    try:
        answers = body["data"]["result"]["answers"]
    except (KeyError, TypeError):
        return ["Không tìm thấy data.result.answers — response shape khác kỳ vọng."]
    for name, kind in (("intent", "choice"), ("needs_manager_approval", "noul"), ("incident_urgency", "score")):
        entry = answers.get(name)
        if not isinstance(entry, dict):
            problems.append(f"{name}: thiếu trong answers")
        elif entry.get("type") != kind:
            problems.append(f"{name}: type={entry.get('type')!r}, kỳ vọng {kind!r}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test the Jev System One endpoint.")
    parser.add_argument("--url", default=os.environ.get("JEV_URL", DEFAULT_URL))
    parser.add_argument("--model", default=os.environ.get("JEV_MODEL", DEFAULT_MODEL))
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--user-agent", default="python-httpx/0.27.0")
    parser.add_argument("--dry-run", action="store_true", help="print the payload and exit, no network")
    args = parser.parse_args()

    payload = build_payload(args.text, args.model)

    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    key = os.environ.get("JEV_API_KEY", "").strip() or read_key_from_env_files()
    print(f"endpoint : {args.url}")
    print(f"model    : {args.model}")
    print(f"key      : {mask(key)}")
    if not key:
        print("\nKhông có JEV_API_KEY (env hoặc .env). Chưa gọi mạng — đây chính là lý do 401.")
        print("Lấy key ở host tương ứng, rồi: export JEV_API_KEY=... (đừng commit).")
        return 2

    request = urllib.request.Request(
        args.url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            # thejevai.com sits behind Cloudflare and returns 403 error 1010 for
            # `Python-urllib/*`; mirror the production client's UA instead.
            "User-Agent": args.user_agent,
        },
        method="POST",
    )

    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            status = response.status
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"\nnetwork error: {type(exc).__name__}: {exc}")
        return 3
    elapsed_ms = (time.monotonic() - started) * 1000

    try:
        body = json.loads(raw) if raw.strip() else None
    except json.JSONDecodeError:
        body = None

    print(f"status   : {status}  ({elapsed_ms:.0f} ms)")
    print(f"body     : {raw[:1200]}{'...' if len(raw) > 1200 else ''}")
    print(f"\nchẩn đoán: {diagnose(status, body if isinstance(body, dict) else None, raw)}")

    if status != 200:
        return 4
    if not isinstance(body, dict) or body.get("code") != 0:
        return 5
    problems = check_answers(body)
    if problems:
        print("hợp đồng : FAIL — " + "; ".join(problems))
        return 5
    print("hợp đồng : OK — 3/3 answer đúng type (choice/noul/score).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
