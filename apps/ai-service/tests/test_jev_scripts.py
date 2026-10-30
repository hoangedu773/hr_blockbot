"""Offline checks for operational Jev script results; never load real keys."""
import importlib.util
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest import mock


SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class JevScriptTests(unittest.TestCase):
    def test_live_checker_miss_exits_one(self):
        import app.agent.jev_gateway as gateway_module
        script = load_script("jev_gateway_live_check")
        gateway = mock.Mock(enabled=True)
        gateway.pool.keys = ["synthetic"]
        gateway.pool.snapshot.return_value = []
        gateway.decide.return_value = SimpleNamespace(intent="general_chat", needs_manager_approval=0,
                                                       incident_urgency=0, intent_confidence=0, source="jev_usejevai")
        with mock.patch.object(script, "load_env"), mock.patch.object(script, "SAMPLES", [("policy_query", "synthetic")]), \
             mock.patch.object(gateway_module, "JevGateway", return_value=gateway), \
             mock.patch("sys.argv", ["check"]), redirect_stdout(io.StringIO()):
            self.assertEqual(script.main(), 1)

    def test_probe_accepts_202_and_polls(self):
        script = load_script("jev_usejevai_probe")
        call = mock.Mock(side_effect=[(202, '{"data":{"id":"run"}}', 1),
                                      (200, '{"data":{"status":"succeeded"}}', 2)])
        with mock.patch.object(script, "call", call), mock.patch.object(script.time, "sleep"):
            status, body, _ = script.trial_run("synthetic", "text")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["data"]["status"], "succeeded")
        self.assertEqual(call.call_args_list[1].args[:2], ("GET", "/api/v1/runs/run"))

    def test_probe_failed_trial_exits_nonzero_without_raw_body(self):
        script = load_script("jev_usejevai_probe")
        output = io.StringIO()
        raw = '{"data":{"status":"failed"},"message":"secret-upstream"}'
        with mock.patch.object(script, "load_keys", return_value=["synthetic"]), \
             mock.patch.object(script, "call", return_value=(200, raw, 1)), \
             mock.patch.object(script, "trial_run", return_value=(200, raw, 2)), \
             mock.patch("sys.argv", ["probe", "--run", "--full"]), redirect_stdout(output):
            self.assertNotEqual(script.main(), 0)
        self.assertNotIn("secret-upstream", output.getvalue())


if __name__ == "__main__":
    unittest.main()
