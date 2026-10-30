"""Run with python -m unittest discover -s tests -p test_jev_approval.py."""
import unittest
import json
from types import SimpleNamespace
from unittest import mock

import app.agent.jev_gateway as gateway_module

from pydantic import ValidationError

from app.agent.jev_gateway import TypedDecision


class ApprovalValidationTest(unittest.TestCase):
    def test_boolean_and_probability_values(self):
        for value, expected in ((True, 1.0), (False, 0.0), (0.6, 0.6), (0, 0.0), (1, 1.0)):
            with self.subTest(value=value):
                decision = TypedDecision(intent="general_chat", needs_manager_approval=value, incident_urgency=0.2)
                self.assertEqual(decision.needs_manager_approval, expected)
                self.assertIsInstance(decision.needs_manager_approval, float)

    def test_invalid_approval_values_remain_rejected(self):
        for value in ("true", "0.5", None, -0.1, 1.1, float("nan"), float("inf"), [], {}):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                TypedDecision(intent="general_chat", needs_manager_approval=value, incident_urgency=0.2)

    def test_urgency_stays_strict(self):
        with self.assertRaises(ValidationError):
            TypedDecision(intent="general_chat", needs_manager_approval=True, incident_urgency=True)

    def test_calibration_values_are_finite_probabilities(self):
        for value in (-1, 1.1, float("nan"), float("inf"), "0.5", True):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                TypedDecision(intent="general_chat", needs_manager_approval=0, incident_urgency=0,
                              intent_probabilities={"general_chat": value})

    def test_llm_cannot_forge_provenance_or_calibration(self):
        payload = {"intent": "policy_query", "needs_manager_approval": False, "incident_urgency": 0,
                   "source": "jev_systemone", "intent_confidence": 1,
                   "intent_probabilities": {"policy_query": 1}}
        chain = mock.Mock()
        chain.complete.return_value = SimpleNamespace(text=json.dumps(payload), provider_id="fake", provider_errors=[])
        settings = SimpleNamespace(jev_api_key="", jev_usejevai_keys="", request_max_chars=2000)
        with mock.patch.object(gateway_module, "settings", settings):
            decision = gateway_module.JevGateway(chain).decide("text")
        self.assertEqual(decision.source, "llm_fallback")
        self.assertEqual(decision.intent_confidence, 0)
        self.assertEqual(decision.intent_probabilities, {})


if __name__ == "__main__":
    unittest.main()
