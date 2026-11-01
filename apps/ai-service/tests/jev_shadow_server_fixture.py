"""Owned cross-language test entrypoint; never used by start.py/Render.

Jev uses httpx.MockTransport. Real HTTP below is restricted to an owned loopback
test callback; no key lookup, external API, policy corpus or DB access.
"""
import json
import os
import time
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import httpx

from app.authorization_gateway import app
from app.jev_shadow import SyntheticMockConfig

MESSAGES = frozenset(("Synthetic policy Alpha", "Synthetic policy Beta", "Synthetic policy Revoke",
                      "Synthetic policy ACL", "Synthetic policy Failure", "Synthetic policy Timeout"))
origin = os.environ["SHADOW_FIXTURE_CALLBACK"]
parsed = urlsplit(origin)
assert parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and not parsed.path and not parsed.username


def jev(request):
    body = json.loads(request.content)
    assert set(body) == {"model", "state", "questions"}
    message = body["state"]
    assert message in MESSAGES
    assert request.headers["authorization"] == "Bearer synthetic-shadow-not-a-live-key"
    assert set(body["questions"]) == {"intent", "needs_manager_approval", "incident_urgency"}
    for secret in ("NEVER_", "PRIVATE_", "fixture-contact", "delegationToken", "scopeMapping", "employeeId"):
        assert secret not in json.dumps(body)
    # Tag only, no raw prompt/key/headers or upstream body in logs/callback.
    app.state.shadow_callback_client.post(origin + "/__owned_shadow_stage",
        json={"tag": message.rsplit(" ", 1)[-1]}).raise_for_status()
    if message.endswith("Failure"):
        raise httpx.ConnectError("Synthetic transport unavailable")
    if message.endswith("Timeout"):
        time.sleep(0.75)
    intent = "general_chat" if message.endswith("Beta") else "policy_query"
    return httpx.Response(200, json={"code": 0, "data": {"result": {"answers": {
        "intent": {"type": "choice", "choice": intent, "confidence": 0.75, "probabilities": {intent: 0.75}},
        "needs_manager_approval": {"type": "noul", "noul": 0.0},
        "incident_urgency": {"type": "score", "score": 1.0},
    }}}})


@asynccontextmanager
async def fixture_lifespan(application):
    # Provision the owned callback transport once, before readiness. Recreating
    # its TLS context for every HTTP mock consumed ~0.4-0.5s of the unchanged
    # 500ms analysis budget on Windows; that is fixture setup, not Jev latency.
    # The callback still runs (including awaited Node mutations) on every call.
    with httpx.Client(trust_env=False, timeout=2, follow_redirects=False) as callback:
        application.state.shadow_callback_client = callback
        try:
            yield
        finally:
            del application.state.shadow_callback_client


app.router.lifespan_context = fixture_lifespan
app.state.jev_synthetic_mock = SyntheticMockConfig(httpx.MockTransport(jev), MESSAGES, 500)
