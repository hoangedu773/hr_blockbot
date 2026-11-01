"""F4 plumbing/math tests are synthetic. Only test_real_weights can attest PhoBERT."""
import math
import os
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app.f4_encoder import MODEL, REVISION, normalize, unit_vector, cosine, semantic_rank
import app.f4_gateway as gateway

def test_normalization_and_vector_guards():
    import unicodedata
    assert normalize(unicodedata.normalize("NFD", "  Kiểm   kê ")) == "Kiểm kê"
    assert unit_vector([3, 4]) == [0.6, 0.8]
    for values in ([], [0, 0], [math.nan], [math.inf]):
        with pytest.raises(ValueError): unit_vector(values)
    with pytest.raises(ValueError): cosine([1], [1, 0])
    assert cosine([1, 0], [-1, 0]) == 0

class SyntheticEncoder:
    def encode(self, texts):
        return [[1, 0] if "Kiểm kê" in text else [0, 1] for text in texts]

def test_synthetic_semantic_plumbing_does_not_invent_skills():
    result = semantic_rank(["Kiểm kê"], "Quán hư cấu", [{"id": "c0", "skills": ["Kiểm kê"]}, {"id": "c1", "skills": []}], SyntheticEncoder())
    assert result[0]["semanticScore"] == 1
    assert result[0]["pairs"][0]["matched"] == "Kiểm kê"
    assert result[1]["semanticScore"] == 0
    assert result[1]["pairs"][0]["matched"] is None

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("F4_SERVICE_KEY", "synthetic-f4-service-key-at-least-32")
    monkeypatch.setattr(gateway, "encoder", SyntheticEncoder())
    return TestClient(gateway.app)

def payload():
    return {"requestId": str(uuid4()), "requiredSkills": ["Kiểm kê"], "description": "Synthetic only", "candidates": [{"id": "c0", "skills": ["Kiểm kê"]}]}

def test_worker_service_auth_schema_and_synthetic_response(client):
    body = payload()
    assert client.post("/rank", json=body).status_code == 401
    headers = {"x-f4-service-key": "synthetic-f4-service-key-at-least-32"}
    response = client.post("/rank", json=body, headers=headers)
    assert response.status_code == 200
    assert response.json()["revision"] == REVISION
    assert response.json()["requestId"] == body["requestId"]
    assert client.post("/rank", json={**body, "jwt": "forged"}, headers=headers).status_code == 422
    assert client.post("/rank", json={**body, "requiredSkills": []}, headers=headers).status_code == 422
    assert client.post("/rank", json={**body, "candidates": body["candidates"] * 2}, headers=headers).status_code == 422

def test_worker_capacity_fail_closed(client):
    assert gateway.capacity.acquire(False)
    try:
        assert client.post("/rank", json=payload(), headers={"x-f4-service-key": "synthetic-f4-service-key-at-least-32"}).status_code == 503
    finally:
        gateway.capacity.release()

def test_real_weights_padding_truncation_and_forward():
    if os.environ.get("RUN_F4_REAL") != "1":
        pytest.skip("Mandatory real PhoBERT acceptance pending resource/install preflight; not a mock substitute")
    from app.f4_encoder import PhoBertEncoder
    encoder = PhoBertEncoder()
    short, padded = encoder.encode(["Kiểm kê hàng hóa", "Pha chế cà phê " * 600])
    alone = encoder.encode(["Kiểm kê hàng hóa"])[0]
    assert all(math.isfinite(value) for value in short + padded)
    assert cosine(short, alone) > 0.999
    assert abs(sum(value * value for value in short) - 1) < 1e-5
    assert encoder.model.training is False
    assert not any(parameter.requires_grad for parameter in encoder.model.parameters())

def test_pilot_refuses_unreviewed_labels_before_loading_any_model():
    import importlib.util
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "eval/evaluate_f4.py"
    spec = importlib.util.spec_from_file_location("f4_eval", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    dataset = json.loads(path.with_name("f4-pilot.json").read_text(encoding="utf-8"))
    assert len(dataset["tasks"]) == 20
    with pytest.raises(ValueError, match="PENDING_INDEPENDENT_HUMAN"):
        module.validated_labels(dataset)
    assert module.metrics([2, 0, 1, 0, 0])["Precision@3"] == 2 / 3


def test_review_packets_are_unlabelled_blinded_and_do_not_overwrite(tmp_path):
    import importlib.util
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "eval/prepare_f4_review.py"
    spec = importlib.util.spec_from_file_location("f4_review", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    dataset_path = path.with_name("f4-pilot.json")
    original = dataset_path.read_bytes()
    dataset = json.loads(original)
    paths = module.export_packets(dataset_path, tmp_path)
    expected = {(task["id"], candidate["id"]) for task in dataset["tasks"] for candidate in task["candidates"]}
    for packet_path in paths:
        packet = json.loads(packet_path.read_text(encoding="utf-8"))
        assert packet["reviewer"] == "" and packet["completedAt"] is None
        assert packet["rubricStatus"] == "PROPOSED_FOR_REVIEW"
        assert {(task["id"], candidate["id"]) for task in packet["tasks"] for candidate in task["candidates"]} == expected
        for task in packet["tasks"]:
            assert set(task) == {"id", "title", "description", "requiredSkills", "candidates"}
            for candidate in task["candidates"]:
                assert set(candidate) == {"id", "skills", "relevance", "reason", "independentHumanAttestation"}
                assert candidate["relevance"] is None and candidate["reason"] == ""
                assert candidate["independentHumanAttestation"] is False
    saved = [path.read_bytes() for path in paths]
    with pytest.raises(FileExistsError):
        module.export_packets(dataset_path, tmp_path)
    assert [path.read_bytes() for path in paths] == saved
    assert dataset_path.read_bytes() == original
