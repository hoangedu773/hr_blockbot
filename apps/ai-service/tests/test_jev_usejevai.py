"""Key rotation and polling for the UseJevAI trial transport (no network).

Run: cd apps/ai-service && python -m unittest tests.test_jev_usejevai -v
"""

from __future__ import annotations

import json
import unittest

from app.agent.jev_usejevai import (
    NoKeyAvailable,
    UseJevClient,
    UseJevError,
    UseJevKeyPool,
)

KEYS = ["sk_aaa", "sk_bbb", "sk_ccc"]
ANSWERS = {
    "intent": {"type": "choice", "choice": "shift_operation", "probabilities": {"shift_operation": 0.9}},
    "needs_manager_approval": {"type": "noul", "noul": 0.81},
    "incident_urgency": {"type": "score", "score": 0.05},
}


def run_body(status: str, answers: dict | None = None) -> str:
    return json.dumps({"code": 0, "message": "ok", "data": {"status": status, "result": (
        {"response": {"answers": answers}} if answers else None
    )}})


class FakeTransport:
    """Scripted transport: pops one (status, body) per call, records what it saw."""

    def __init__(self, script: list[tuple[int, str]]) -> None:
        self.script = list(script)
        self.calls: list[tuple[str, str, str]] = []

    def __call__(self, method: str, path: str, key: str, payload):
        self.calls.append((method, path, key))
        if not self.script:
            raise AssertionError("transport called more times than scripted")
        return self.script.pop(0)


class PoolTests(unittest.TestCase):
    def test_rotates_round_robin(self) -> None:
        pool = UseJevKeyPool(KEYS)
        picked = [pool.acquire() for _ in range(4)]
        self.assertEqual(picked, ["sk_aaa", "sk_bbb", "sk_ccc", "sk_aaa"])

    def test_auth_failure_disables_key_for_good(self) -> None:
        pool = UseJevKeyPool(KEYS)
        pool.report_failure("sk_aaa", "auth")
        self.assertEqual([pool.acquire() for _ in range(3)], ["sk_bbb", "sk_ccc", "sk_bbb"])

    def test_quota_failure_disables_key_for_good(self) -> None:
        pool = UseJevKeyPool(KEYS)
        pool.report_failure("sk_bbb", "quota")
        self.assertNotIn("sk_bbb", [pool.acquire() for _ in range(3)])

    def test_rate_limit_cools_down_then_recovers(self) -> None:
        pool = UseJevKeyPool(KEYS, cooldown_seconds=60)
        pool.report_failure("sk_aaa", "rate")
        self.assertEqual([pool.acquire() for _ in range(2)], ["sk_bbb", "sk_ccc"])
        pool._states["sk_aaa"].cooldown_until = 0.0  # simulate the cooldown expiring
        self.assertIn("sk_aaa", [pool.acquire() for _ in range(2)])

    def test_all_keys_dead_raises(self) -> None:
        pool = UseJevKeyPool(["sk_aaa", "sk_bbb"])
        for key in ("sk_aaa", "sk_bbb"):
            pool.report_failure(key, "auth")
        with self.assertRaises(NoKeyAvailable):
            pool.acquire()

    def test_snapshot_masks_keys(self) -> None:
        pool = UseJevKeyPool(["sk_secret_value_1234"])
        snapshot = pool.snapshot()
        self.assertEqual(snapshot[0]["key"], "sk_sec…1234")
        self.assertNotIn("secret", json.dumps(snapshot))

    def test_empty_pool_is_falsy(self) -> None:
        self.assertFalse(UseJevKeyPool(["", "  "]))
        self.assertTrue(UseJevKeyPool(KEYS))


class ClientTests(unittest.TestCase):
    def client(self, script: list[tuple[int, str]], keys: list[str] | None = None) -> tuple[UseJevClient, FakeTransport]:
        transport = FakeTransport(script)
        client = UseJevClient(
            UseJevKeyPool(keys or KEYS),
            transport=transport,
            timeout_seconds=5,
            poll_interval_seconds=0,
            sleep=lambda _: None,
        )
        return client, transport

    def test_submit_then_poll_to_success(self) -> None:
        client, transport = self.client([
            (200, json.dumps({"data": {"id": "run-1", "status": "queued"}})),
            (200, run_body("running")),
            (200, run_body("succeeded", ANSWERS)),
        ])
        answers = client.decide("Em xin nghỉ ca tối mai", [{"id": "intent"}])
        self.assertEqual(answers["intent"]["choice"], "shift_operation")
        self.assertEqual([call[0] for call in transport.calls], ["POST", "GET", "GET"])
        self.assertTrue(transport.calls[1][1].endswith("/api/v1/runs/run-1"))

    def test_submit_accepts_202_accepted(self) -> None:
        """The live API answers 202 Accepted, not 200 — regression guard."""
        client, _ = self.client([
            (202, json.dumps({"data": {"id": "run-202"}})),
            (200, run_body("succeeded", ANSWERS)),
        ])
        answers = client.decide("text", [])
        self.assertEqual(answers["intent"]["choice"], "shift_operation")

    def test_401_on_submit_rotates_to_next_key(self) -> None:
        client, transport = self.client([
            (401, '{"code":-1,"message":"bad key"}'),
            (200, json.dumps({"data": {"id": "run-2"}})),
            (200, run_body("succeeded", ANSWERS)),
        ])
        answers = client.decide("text", [])
        self.assertEqual(answers["needs_manager_approval"]["noul"], 0.81)
        self.assertEqual([call[2] for call in transport.calls], ["sk_aaa", "sk_bbb", "sk_bbb"])
        self.assertTrue(client.pool._states["sk_aaa"].disabled)

    def test_all_keys_rejected_raises(self) -> None:
        client, _ = self.client([(401, "{}")] * len(KEYS))
        with self.assertRaises(UseJevError) as ctx:
            client.decide("text", [])
        self.assertEqual(ctx.exception.code, "auth")

    def test_rate_limit_on_submit_raises_rate(self) -> None:
        client, _ = self.client([(429, "{}")])
        with self.assertRaises(UseJevError) as ctx:
            client.decide("text", [])
        self.assertEqual(ctx.exception.code, "rate")

    def test_failed_run_raises(self) -> None:
        client, _ = self.client([
            (200, json.dumps({"data": {"id": "run-3"}})),
            (200, run_body("failed")),
        ])
        with self.assertRaises(UseJevError) as ctx:
            client.decide("text", [])
        self.assertEqual(ctx.exception.code, "run_failed")

    def test_poll_timeout(self) -> None:
        now = [0.0]
        transport = FakeTransport([
            (200, json.dumps({"data": {"id": "run-4"}})),
            (200, run_body("queued")),
            (200, run_body("queued")),
        ])
        client = UseJevClient(
            UseJevKeyPool(KEYS),
            transport=transport,
            timeout_seconds=2,
            poll_interval_seconds=1,
            sleep=lambda seconds: now.__setitem__(0, now[0] + seconds),
            clock=lambda: now[0],
        )
        with self.assertRaises(UseJevError) as ctx:
            client.decide("text", [])
        self.assertEqual(ctx.exception.code, "timeout")

    def test_missing_answers_raises_bad_result(self) -> None:
        client, _ = self.client([
            (200, json.dumps({"data": {"id": "run-5"}})),
            (200, run_body("succeeded", None)),
        ])
        with self.assertRaises(UseJevError) as ctx:
            client.decide("text", [])
        self.assertEqual(ctx.exception.code, "bad_result_body")


class GatewayMappingTests(unittest.TestCase):
    """JevGateway._usejevai: answers -> TypedDecision, including probabilities."""

    def setUp(self) -> None:
        # The pool cache is keyed by the key string and lives at module level, so a
        # disabled key would leak into the next test.
        import app.agent.jev_gateway as gateway_module

        gateway_module._POOLS.clear()

    def gateway(self, script: list[tuple[int, str]]):
        from types import SimpleNamespace
        from unittest import mock

        import app.agent.jev_gateway as gateway_module
        import app.agent.jev_usejevai as transport_module
        from app.llm.chain import ProviderChain

        fake = FakeTransport(script)
        stub = SimpleNamespace(
            jev_api_key="",
            jev_usejevai_keys="sk_one,sk_two",
            jev_usejevai_base_url="https://example.test",
            jev_usejevai_timeout_ms=5000,
            jev_usejevai_cooldown_seconds=60.0,
            request_max_chars=2000,
        )
        for patcher in (
            mock.patch.object(gateway_module, "settings", stub),
            mock.patch.object(transport_module, "urllib_transport", lambda base, timeout: fake),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        return gateway_module.JevGateway(ProviderChain([])), fake

    def test_answers_map_to_typed_decision_with_probabilities(self) -> None:
        gateway, _ = self.gateway([
            (202, json.dumps({"data": {"id": "run-9"}})),
            (200, run_body("succeeded", ANSWERS)),
        ])
        decision = gateway.decide("Em xin nghỉ ca tối mai")
        self.assertEqual(decision.intent, "shift_operation")
        self.assertEqual(decision.source, "jev_usejevai")
        self.assertEqual(decision.intent_confidence, 0.0)  # ANSWERS has no confidence field
        self.assertEqual(decision.intent_probabilities, {"shift_operation": 0.9})
        self.assertAlmostEqual(decision.needs_manager_approval, 0.81)
        self.assertAlmostEqual(decision.incident_urgency, 0.05)

    def test_invalid_primitive_type_is_rejected(self) -> None:
        bad = dict(ANSWERS)
        bad["intent"] = {"type": "score", "score": 0.5}
        gateway, _ = self.gateway([
            (202, json.dumps({"data": {"id": "run-10"}})),
            (200, run_body("succeeded", bad)),
        ])
        with self.assertRaises(Exception) as ctx:
            gateway.decide("text")
        self.assertIn("DECISION_INVALID", json.dumps(ctx.exception.__dict__, default=str))

    def test_exhausted_keys_raise_no_key_available(self) -> None:
        """Second call must surface NO_KEY_AVAILABLE so the loop can degrade visibly."""
        gateway, _ = self.gateway([(401, "{}"), (401, "{}")])
        with self.assertRaises(Exception):
            gateway.decide("text")
        with self.assertRaises(Exception) as ctx:
            gateway.decide("text")
        self.assertIn("NO_KEY_AVAILABLE", json.dumps(ctx.exception.__dict__, default=str))


if __name__ == "__main__":
    unittest.main()