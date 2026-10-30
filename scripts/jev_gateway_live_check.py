"""Live check: JevGateway.decide() over the rotating UseJevAI trial keys.

Runs the real code path (`JevGateway.decide` -> `_usejevai` -> `UseJevClient`),
not a copy of it, so a PASS here means the agent loop will see real Jev decisions.

Costs one trial run per message (free tier). Keys are read from
apps/ai-service/.env and never printed unmasked.

Usage (needs a Python with pydantic + httpx, e.g. the service venv):
  python scripts/jev_gateway_live_check.py
  python scripts/jev_gateway_live_check.py --message "..."   # one custom message
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"
ENV_FILE = AI_SERVICE / ".env"

SAMPLES = [
    ("shift_operation", "Em xin nghỉ ca tối mai vì con ốm, anh duyệt giúp em với."),
    ("policy_query", "Đi muộn 10 phút thì bị phạt bao nhiêu tiền?"),
    ("cash_audit", "Két hụt 200 nghìn so với bill, em phải giải trình thế nào?"),
    ("general_chat", "Chào bot, hôm nay bạn khỏe không?"),
]


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.startswith("JEV_"):
            os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Live JevGateway check over rotating keys.")
    parser.add_argument("--message", action="append", default=[], help="custom message (repeatable)")
    args = parser.parse_args()

    load_env(ENV_FILE)
    sys.path.insert(0, str(AI_SERVICE))

    from app.agent.jev_gateway import JevGateway  # noqa: PLC0415 - env must load first
    from app.config import settings  # noqa: PLC0415
    from app.llm.chain import ProviderChain  # noqa: PLC0415

    gateway = JevGateway(ProviderChain([]))
    print(f"enabled       : {gateway.enabled}")
    print(f"keys          : {len(gateway.pool.keys)}")
    print(f"model (single): {settings.jev_model}")
    print(f"timeout       : {settings.jev_usejevai_timeout_ms} ms\n")

    if not gateway.enabled:
        print("Không có key nào — kiểm tra JEV_USEJEVAI_KEYS trong apps/ai-service/.env")
        return 2

    cases = [(None, message) for message in args.message] if args.message else SAMPLES
    failures = 0
    for expected, message in cases:
        started = time.monotonic()
        try:
            decision = gateway.decide(message)
        except Exception as exc:  # noqa: BLE001 - report, do not hide
            failures += 1
            print(f"FAIL  {type(exc).__name__}  ← {message}")
            continue
        elapsed = (time.monotonic() - started) * 1000
        mark = "ok  " if expected in (None, decision.intent) else "MISS"
        if mark == "MISS":
            failures += 1
        print(
            f"{mark}  intent={decision.intent:<16} approval={decision.needs_manager_approval:.2f} "
            f"urgency={decision.incident_urgency:.2f} p={decision.intent_confidence:.2f} "
            f"src={decision.source:<13} {elapsed:.0f}ms  ← {message}"
        )

    print("\npool:")
    for item in gateway.pool.snapshot():
        print(f"  {item['key']:<14} uses={item['uses']} fails={item['failures']} "
              f"disabled={item['disabled']} reason={item['reason'] or '-'}")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
