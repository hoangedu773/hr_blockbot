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


# Files that exercise the retired `app.main` entrypoint, the agent loop or the
# RAG corpus. Production runs `app.authorization_gateway:app`, which imports none
# of them, so the default lane excludes these and they run via `-m legacy`.
_LEGACY_MODULES = frozenset(
    {
        "test_agent_attachments",
        "test_agent_boundaries",
        "test_api",
        "test_health_probe",
        "test_jev_approval",
        "test_jev_usejevai",
        "test_live_db_chat",
        "test_loop",
        "test_matching",
        "test_retrieval",
        "test_router",
        "test_tools",
        "test_vector_probe",
    }
)


def pytest_collection_modifyitems(config, items):
    for item in items:
        if item.module.__name__.rsplit(".", 1)[-1] in _LEGACY_MODULES:
            item.add_marker(pytest.mark.legacy)


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
