"""Frozen local PhoBERT F4 encoder. No provider, Mongo, Jev or download path."""
from __future__ import annotations
import hashlib
import json
import math
import os
from pathlib import Path
import unicodedata

MODEL = "vinai/phobert-base"
REVISION = "01daacda68afe13d83023d16ec647239e344a1e6"
SEGMENTER_REVISION = "62bbc58fe5d113c898eae112656be97dcf50b3a0"

def normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).split())

def unit_vector(values: list[float]) -> list[float]:
    if not values or not all(math.isfinite(v) for v in values):
        raise ValueError("Invalid embedding")
    norm = math.sqrt(sum(v * v for v in values))
    if not math.isfinite(norm) or norm <= 1e-12:
        raise ValueError("Zero norm embedding")
    return [v / norm for v in values]

def cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        raise ValueError("Embedding shape mismatch")
    a, b = unit_vector(left), unit_vector(right)
    return max(0.0, min(1.0, sum(x * y for x, y in zip(a, b))))

def verify_assets(directory: Path, revision: str) -> None:
    """Setup must attest exact downloaded files; runtime never trusts mutable hub main."""
    manifest = json.loads((directory / "artifact-manifest.json").read_text(encoding="utf-8"))
    if manifest.get("revision") != revision or not manifest.get("files"):
        raise ValueError("Unpinned artifacts")
    required = {"config.json", "pytorch_model.bin", "bpe.codes", "vocab.txt"} if revision == REVISION else {"VnCoreNLP-1.2.jar", "models/wordsegmenter/vi-vocab", "models/wordsegmenter/wordsegmenter.rdr"}
    if not required.issubset(manifest["files"]):
        raise ValueError("Required artifacts not attested")
    if revision == REVISION and any((directory / name).exists() and name not in manifest["files"] for name in ["tokenizer_config.json", "special_tokens_map.json", "added_tokens.json"]):
        raise ValueError("Unattested tokenizer configuration")
    for relative, expected in manifest["files"].items():
        path = (directory / relative).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file():
            raise ValueError("Invalid artifact path")
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ValueError("Artifact integrity failed")

class PhoBertEncoder:
    """Construct only inside the serialized dedicated F4 worker, after resource approval."""
    def __init__(self) -> None:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
        model_dir = Path(os.environ["F4_MODEL_DIR"]).resolve()
        segmenter_dir = Path(os.environ["F4_SEGMENTER_DIR"]).resolve()
        verify_assets(model_dir, REVISION)
        verify_assets(segmenter_dir, SEGMENTER_REVISION)
        # Imported lazily: the existing lightweight AI/auth service is unaffected.
        import torch
        from transformers import AutoModel, AutoTokenizer
        import py_vncorenlp
        self.torch = torch
        torch.set_num_threads(2)
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False, use_fast=False, token=False)
        self.model = AutoModel.from_pretrained(str(model_dir), local_files_only=True, trust_remote_code=False, use_safetensors=False, token=False)
        self.model.eval()
        for parameter in self.model.parameters():
            parameter.requires_grad_(False)
        cwd = os.getcwd()
        try:
            self.segmenter = py_vncorenlp.VnCoreNLP(annotators=["wseg"], save_dir=str(segmenter_dir), max_heap_size="-Xmx256m")
        finally:
            os.chdir(cwd)

    def encode(self, texts: list[str]) -> list[list[float]]:
        vectors = []
        for offset in range(0, len(texts), 4):
            raw = [normalize(text) for text in texts[offset:offset + 4]]
            if any(not text for text in raw):
                raise ValueError("Empty encoder input")
            segmented = [" ".join(self.segmenter.word_segment(text)) for text in raw]
            encoded = self.tokenizer(segmented, return_tensors="pt", padding=True, truncation=True, max_length=256, return_special_tokens_mask=True)
            special = encoded.pop("special_tokens_mask")
            if encoded["input_ids"].shape[1] > 256:
                raise ValueError("Token limit exceeded")
            mask = encoded["attention_mask"] * (1 - special)
            if bool((mask.sum(dim=1) == 0).any()):
                raise ValueError("No content tokens")
            with self.torch.inference_mode():
                hidden = self.model(**encoded).last_hidden_state.float()
                pooled = (hidden * mask.unsqueeze(-1)).sum(dim=1) / mask.sum(dim=1).unsqueeze(-1)
                vectors.extend(unit_vector(row) for row in pooled.cpu().tolist())
        return vectors

def semantic_rank(required: list[str], description: str, candidates: list[dict], encoder) -> list[dict]:
    """Descriptions contextualize requirements only; they never add employee skills."""
    queries = ["Kỹ năng yêu cầu: " + skill + ". Ngữ cảnh nhiệm vụ: " + normalize(description)[:320] for skill in required]
    skill_texts = {skill: "Kỹ năng nhân viên: " + normalize(skill) for candidate in candidates for skill in candidate["skills"]}
    texts = list(dict.fromkeys(queries + list(skill_texts.values())))
    if len(texts) > 512:
        raise ValueError("Encoder request capacity exceeded")
    vectors = encoder.encode(texts)
    if len(vectors) != len(texts):
        raise ValueError("Missing embeddings")
    lookup = dict(zip(texts, vectors))
    result = []
    for candidate in candidates:
        pairs = []
        for skill, query in zip(required, queries):
            best = max(((cosine(lookup[query], lookup[skill_texts[own]]), own) for own in candidate["skills"]), default=(0.0, None))
            pairs.append({"required": skill, "matched": best[1], "cosine": best[0]})
        result.append({"id": candidate["id"], "semanticScore": sum(pair["cosine"] for pair in pairs) / len(required), "pairs": pairs})
    return result
