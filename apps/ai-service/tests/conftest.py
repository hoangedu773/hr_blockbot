"""Keep the unit suite independent of workstation credentials and live services."""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_environment = pytest.MonkeyPatch()
_live_requested = os.getenv("RUN_LIVE_TESTS") == "1"
if not _live_requested:
    for _name in list(os.environ):
        if _name.startswith(("AI_", "JEV_", "OPENAI_", "GOOGLE_", "GEMINI_")) or _name in (
            "MONGODB_URI", "ATLAS_URI", "CORS_ALLOW_ORIGINS",
        ):
            _environment.delenv(_name, raising=False)
    _environment.setenv("PYTHON_DOTENV_DISABLED", "1")


def pytest_unconfigure(config):
    _environment.undo()


@pytest.fixture(autouse=True)
def _reset_provider_cooldowns():
    # The key-cabinet registry is module-level (survives across requests in
    # production); tests must start with an empty cabinet or a provider parked
    # by an earlier test silently breaks the next test's fallback assertions.
    from app.llm.chain import _provider_cooldowns

    _provider_cooldowns.clear()
    yield
    _provider_cooldowns.clear()


@pytest.fixture(autouse=True)
def _block_live_network(monkeypatch, request):
    if _live_requested and request.node.path.name == "test_live_db_chat.py":
        return
    import httpx
    import socket

    def blocked(*args, **kwargs):
        raise AssertionError("Live network is forbidden in the offline unit suite")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
