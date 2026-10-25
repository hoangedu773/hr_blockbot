"""Run with python -m unittest discover -s tests -p test_jev_approval.py."""
import unittest

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


if __name__ == "__main__":
    unittest.main()
