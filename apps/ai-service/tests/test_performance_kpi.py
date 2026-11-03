import os
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.authorization_gateway import app
from app.performance_kpi import SuggestTaskStructureRequest, SummarizeEvaluationRequest, ExplainKpiRequest, suggest_structure, summarize_evaluation, explain_kpi


def content():
    return {"code": "INVENTORY", "name": "Kiểm kê", "steps": [{"code": "count", "name": "Kiểm đếm", "progressWeightPercent": 100, "required": True}], "qualityCriteria": [{"code": c, "name": c, "maxScore": 25, "mandatory": True, "description": "Kiểm tra bằng chứng", "evidenceRequired": True} for c in ["completeness", "accuracy", "timeliness", "evidence"]], "requiredEvidence": [], "effectiveFrom": "2026-10", "effectiveTo": None}


class PerformanceTests(unittest.TestCase):
    def test_strict_rubric_and_privacy(self):
        value = {"title": "Kiểm kê cuối ngày", "description": "Đối chiếu mặt hàng", "role": "STAFF", "template": content()}
        self.assertTrue(suggest_structure(SuggestTaskStructureRequest(**value))["degraded"])
        with self.assertRaises(ValidationError):
            SuggestTaskStructureRequest(**{**value, "description": "phone 0901234567"})
        value["template"]["qualityCriteria"].pop()
        with self.assertRaises(ValidationError):
            SuggestTaskStructureRequest(**value)

    def test_invalid_model_falls_back_without_decision(self):
        request = SuggestTaskStructureRequest(title="Kiểm kê cuối ngày", description="Đối chiếu mặt hàng", role="STAFF", template=content(), providerConfig={"providers": []})
        chain = SimpleNamespace(complete=lambda *a: SimpleNamespace(text='{"finalScore":100}', model="invalid"))
        with patch("app.performance_kpi.provider_cache.get", return_value=chain):
            result = suggest_structure(request)
        self.assertTrue(result["degraded"])
        self.assertNotIn("finalScore", result)

    def test_summary_only_aliases_and_no_final_score(self):
        request = SummarizeEvaluationRequest(status="PROVISIONAL", criteria=[{"alias": "c0", "score": 90, "evidenceCount": 0, "notApplicable": False}], tasks=[{"alias": "t0", "score": 95, "inclusion": "INCLUDED", "evidenceCount": 0, "pending": False}])
        result = summarize_evaluation(request)
        self.assertEqual(result["anomalies"][0]["code"], "HIGH_SCORE_NO_EVIDENCE")
        self.assertNotIn("finalScore", result)

    def test_explain_625_and_8929_without_removing_failure(self):
        terms = [{"alias": "t0", "weight": 40, "score": 85, "included": True}, {"alias": "t1", "weight": 30, "score": 95, "included": True}, {"alias": "t2", "weight": 30, "score": 0, "included": True}]
        result = explain_kpi(ExplainKpiRequest(status="PENDING_DISPUTE", terms=terms))
        self.assertIn("62.5", result["summary"])
        self.assertIn("tạm tính", result["summary"])
        terms[-1]["included"] = False
        self.assertIn("89.29", explain_kpi(ExplainKpiRequest(status="FINAL", terms=terms))["summary"])

    def test_service_auth_and_strict_endpoints(self):
        with patch.dict(os.environ, {"AI_SERVICE_API_KEY": "owned-performance-fixture-key"}):
            client = TestClient(app)
            for path, body in [("explain", {"status": "PROVISIONAL", "terms": []}), ("summarize-evaluation", {"status": "OPEN", "criteria": [], "tasks": []}), ("suggest-task-structure", {"title": "Kiểm kê cuối ngày", "description": "Đối chiếu mặt hàng", "role": "STAFF", "template": content()})]:
                self.assertEqual(client.post("/api/v1/kpi/" + path, json=body).status_code, 401)
                self.assertEqual(client.post("/api/v1/kpi/" + path, json=body, headers={"x-ai-service-key": "owned-performance-fixture-key"}).status_code, 200)
                self.assertEqual(client.post("/api/v1/kpi/" + path, json={**body, "employeeId": "injected"}, headers={"x-ai-service-key": "owned-performance-fixture-key"}).status_code, 422)
