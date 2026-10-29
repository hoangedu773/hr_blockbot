"""Temporary verification script for phase 02 (P0-3, P0-4, P1-12). Deleted after use."""

from __future__ import annotations

import copy
import dataclasses
import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from fastapi.testclient import TestClient

import app.main as main_module
from app.config import settings
from app.llm.base import ProviderInvalidConfig
from app.llm.chain import payload_version
from app.llm.url_guard import validate_base_url

client = TestClient(main_module.app)


def show(label: str, response) -> None:
    body = response.json()
    print(f"{label} -> HTTP {response.status_code} {body}")


print("== P0-3: fail-closed service key ==")
main_module.settings = dataclasses.replace(settings, ai_service_api_key="")
show("unset key, no header", client.post("/api/v1/chat", json={"message": "hi"}))

main_module.settings = dataclasses.replace(settings, ai_service_api_key="test-secret-key")
show(
    "key configured, wrong header",
    client.post("/api/v1/chat", json={"message": "hi"}, headers={"x-ai-service-key": "wrong"}),
)
main_module.settings = settings

print()
print("== P0-4: payload_version always hashes the whole payload ==")
base = {
    "configVersion": 42,
    "providers": [
        {"id": "p", "type": "openai_compatible", "model": "m", "baseUrl": "https://a.example.com/v1"}
    ],
}
other_host = copy.deepcopy(base)
other_host["providers"][0]["baseUrl"] = "https://b.example.com/v1"
other_model = copy.deepcopy(base)
other_model["providers"][0]["model"] = "m2"

print("same configVersion, same payload :", payload_version(base), "|", payload_version(copy.deepcopy(base)), "| equal:", payload_version(base) == payload_version(copy.deepcopy(base)))
print("same configVersion, diff baseUrl :", payload_version(base), "|", payload_version(other_host), "| equal:", payload_version(base) == payload_version(other_host))
print("same configVersion, diff model   :", payload_version(base), "|", payload_version(other_model), "| equal:", payload_version(base) == payload_version(other_model))

print()
print("== P1-12: SSRF baseUrl guard ==")
cases = [
    ("http://169.254.169.254/v1", False),
    ("http://127.0.0.1/v1", False),
    ("http://localhost:8080", False),
    ("http://api.localhost/v1", False),
    ("http://10.0.0.5/v1", False),
    ("http://172.16.4.4/v1", False),
    ("http://192.168.1.10/v1", False),
    ("http://[::1]/v1", False),
    ("http://[fd00::1]/v1", False),
    ("http://[fe80::1]/v1", False),
    ("file:///etc/passwd", False),
    ("gopher://example.com/v1", False),
    ("https://generativelanguage.googleapis.com/v1beta", True),
    ("https://api.openai.com/v1", True),
]
for url, should_accept in cases:
    try:
        validate_base_url(url)
        accepted = True
        detail = "accepted"
    except ProviderInvalidConfig as exc:
        accepted = False
        detail = f"rejected ({exc.code}: {exc})"
    verdict = "OK" if accepted == should_accept else "MISMATCH"
    print(f"{verdict:8} {url:52} {detail}")
