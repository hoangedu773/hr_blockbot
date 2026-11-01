"""Guards the V1 runtime boundary: the production entrypoint must not import the
retired agent loop, RAG corpus or Mongo client, and must not expose the legacy
chat routes that Authorization V1 replaced.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent

# Run in a clean interpreter: importing inside pytest would see modules other
# tests already loaded and report a false negative.
_PROBE = """
import sys
import app.authorization_gateway  # noqa: F401
legacy = sorted(
    name for name in sys.modules
    if name == "app.main" or name == "app.db" or name.startswith(("app.agent", "app.rag"))
)
print(",".join(legacy))
"""


def _legacy_modules_after_import() -> list[str]:
    completed = subprocess.run(
        [sys.executable, "-c", _PROBE],
        cwd=AI_SERVICE_DIR,
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    return [name for name in completed.stdout.strip().split(",") if name]


def test_gateway_does_not_import_legacy_runtime():
    assert _legacy_modules_after_import() == [], (
        "app.authorization_gateway must not pull app.main, app.agent, app.rag or app.db"
    )


def test_gateway_retires_legacy_chat_routes():
    source = (AI_SERVICE_DIR / "app" / "authorization_gateway.py").read_text(encoding="utf-8")
    assert '"/api/v1/chat"' in source and "retired_legacy_path" in source, (
        "the legacy /api/v1/chat path must stay explicitly retired, not silently mounted"
    )
    assert '"/api/v1/authorized-chat"' in source
