import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pydantic import ValidationError
from fastapi.testclient import TestClient
from app.kpi_analysis import ProposeTargetRequest, propose_target
from app.authorization_gateway import app
import os


class RevenueTargetTests(unittest.TestCase):
    def request(self, **kw):
        return ProposeTargetRequest(unitType="STORE", months=[{"period": p, "revenueVnd": 100000, "orderCount": 10} for p in ["2026-07", "2026-08", "2026-09"]], baselinePercent=3.0, allowedMinPercent=1.0, allowedMaxPercent=5.0, **kw)

    def test_strict_privacy_and_baseline(self):
        request = self.request()
        self.assertTrue(propose_target(request, None)["degraded"])
        self.assertEqual(propose_target(request, None)["suggestedGrowthPercent"], 3)
        with self.assertRaises(ValidationError):
            ProposeTargetRequest.model_validate({**request.model_dump(), "employeeName": "forbidden"})

    def test_live_shape_clamped_without_identity_or_secret(self):
        calls = []
        def complete(messages, opts):
            calls.extend(messages)
            return SimpleNamespace(text='{"suggestedGrowthPercent": 20.0, "rationale": "Xu hướng doanh thu", "confidence":"medium"}', model="mock")
        with patch("app.kpi_analysis.provider_cache.get", return_value=SimpleNamespace(complete=complete)):
            r = propose_target(self.request(), {"private": "DO_NOT_SEND"})
        self.assertEqual(r["suggestedGrowthPercent"], 5)
        self.assertFalse(r["degraded"])
        self.assertNotIn("DO_NOT_SEND", str(calls))

    def test_invalid_model_response_fallback(self):
        with patch("app.kpi_analysis.provider_cache.get", return_value=SimpleNamespace(complete=lambda *_: SimpleNamespace(text='{"targetVnd":123}', model="mock"))):
            self.assertTrue(propose_target(self.request(), {"p": 1})["degraded"])

    def test_endpoint_auth_and_aggregate_only(self):
        with patch.dict(os.environ, {"AI_SERVICE_API_KEY": "owned-revenue-service-key-32-characters"}):
            client = TestClient(app)
            body = self.request().model_dump()
            self.assertEqual(client.post('/api/v1/kpi/propose-target', json=body).status_code, 401)
            r = client.post('/api/v1/kpi/propose-target', json=body, headers={"x-ai-service-key": os.environ["AI_SERVICE_API_KEY"]})
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json()["degraded"])
