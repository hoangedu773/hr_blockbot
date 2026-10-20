"""Offline evaluation harness for policy RAG (phase-04 §6, docs/09).

Usage (from `apps/ai-service`):
    python eval/run_eval.py --retriever lexical
    python eval/run_eval.py --retriever dense
    python eval/run_eval.py --retriever hybrid
    python eval/run_eval.py --all --report eval/report.md

Metrics per retriever:
    recall@1/@3/@5     expected article retrieved in top-k (in-scope questions)
    citation_hit       expected article present in the returned citations (in-scope)
    abstain_rate(in)   in-scope questions wrongly refused (lower is better)
    abstain_rate(out)  out-of-scope questions refused (higher is better)
    false_answer_rate  out-of-scope questions answered (lower is better; fabrication risk)
    latency p50/p95    end-to-end retrieval + answer, milliseconds

Honesty rules:
- Without a real provider key the harness runs the deterministic `FakeProvider`
  (mock). Every report written in that mode carries the MOCK warning and must not be
  quoted as retrieval quality against a real embedding/LLM model.
- The corpus defaults to the seed policies shipped in the service (demo content). Use
  `--corpus db` only after Phase 1 has populated `policies` + embeddings.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))
EVAL_DIR = Path(__file__).resolve().parent

from app.config import settings
from app.llm.chain import ProviderChain, build_chain
from app.llm.fake import FakeProvider
from app.rag.answer import answer_policy
from app.rag.corpus import PolicyChunk, load_db_chunks, seed_chunks
from app.rag.policy_engine import PolicyEngine

DATASET_PATH = EVAL_DIR / "dataset.jsonl"
DEFAULT_REPORT = EVAL_DIR / "report.md"

RETRIEVERS = ("lexical", "dense", "hybrid")
MOCK_BANNER = (
    "SỐ LIỆU MOCK — chưa chứng minh với provider thật vì thiếu API key. "
    "Provider dùng trong lần chạy này là `FakeProvider` (hashing embedding + echo evidence), "
    "không phải model embedding/LLM thật."
)


# --- loading ---------------------------------------------------------------------


def load_dataset(path: Path = DATASET_PATH) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    return items


def load_corpus(source: str) -> tuple[list[PolicyChunk], str]:
    if source == "seed":
        return seed_chunks(), "seed"
    from app.db import db_client

    if not db_client.ping() or db_client.db is None:
        raise SystemExit("Khong ket noi duoc MongoDB (MONGODB_URI/ATLAS_URI) — khong chay --corpus db.")
    chunks = load_db_chunks(db_client.db.policies)
    if not chunks:
        raise SystemExit("Collection policies rong — chua co corpus de eval (Phase 1 chua xong).")
    return chunks, "policies(DB)"


def build_chain_from_args(provider: str, provider_config: str | None) -> tuple[ProviderChain, str]:
    if provider == "fake":
        return ProviderChain([FakeProvider()]), "fake"
    if not provider_config:
        raise SystemExit("--provider live can --provider-config <json file> (ADR-017 payload).")
    payload = json.loads(Path(provider_config).read_text(encoding="utf-8"))
    chain = build_chain(payload)
    if not chain:
        raise SystemExit("provider config khong tao duoc provider nao hop le.")
    return chain, "live:" + ",".join(chain.provider_ids)


# --- evaluation ------------------------------------------------------------------


def _matches_expected(citation: dict[str, Any], item: dict[str, Any]) -> bool:
    if citation.get("document") != item.get("expectedDocument"):
        return False
    article = str(citation.get("article") or "")
    return article.startswith(str(item.get("expectedArticle") or ""))


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round(fraction * (len(ordered) - 1)))))
    return ordered[index]


@dataclass
class RetrieverReport:
    retriever: str
    n_in_scope: int
    n_out_of_scope: int
    recall_at_1: float
    recall_at_3: float
    recall_at_5: float
    citation_hit_rate: float
    abstain_rate_in: float
    abstain_rate_out: float
    false_answer_rate: float
    latency_p50_ms: float
    latency_p95_ms: float
    failures: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "retriever": self.retriever,
            "nInScope": self.n_in_scope,
            "nOutOfScope": self.n_out_of_scope,
            "recall@1": round(self.recall_at_1, 4),
            "recall@3": round(self.recall_at_3, 4),
            "recall@5": round(self.recall_at_5, 4),
            "citationHitRate": round(self.citation_hit_rate, 4),
            "abstainRateIn": round(self.abstain_rate_in, 4),
            "abstainRateOut": round(self.abstain_rate_out, 4),
            "falseAnswerRate": round(self.false_answer_rate, 4),
            "latencyP50Ms": round(self.latency_p50_ms, 2),
            "latencyP95Ms": round(self.latency_p95_ms, 2),
        }

    def row(self, k: int) -> str:
        return (
            f"| {self.retriever} | {self.recall_at_1:.2f} | {self.recall_at_3:.2f} | "
            f"{self.recall_at_5:.2f} | {self.citation_hit_rate:.2f} | "
            f"{self.abstain_rate_in:.2f} | {self.abstain_rate_out:.2f} | "
            f"{self.false_answer_rate:.2f} | {self.latency_p50_ms:.1f} | "
            f"{self.latency_p95_ms:.1f} | {self.n_in_scope + self.n_out_of_scope} |"
        )


def evaluate(
    retriever_kind: str,
    chain: ProviderChain,
    dataset: list[dict[str, Any]],
    *,
    k: int = 5,
    chunks: list[PolicyChunk] | None = None,
    embedder=None,
    collect_failures: bool = True,
) -> RetrieverReport:
    corpus = chunks or seed_chunks()
    engine = PolicyEngine(chunks=corpus, retriever_kind=retriever_kind, embedder=embedder)
    # Warm-up so latency excludes lazy index construction of the first query.
    engine.retrieve(dataset[0]["question"] if dataset else "", k=k)

    in_scope = [item for item in dataset if item.get("scope") == "in"]
    out_scope = [item for item in dataset if item.get("scope") != "in"]
    recall_hits = {1: 0, 3: 0, 5: 0}
    citation_hits = 0
    abstained_in = 0
    abstained_out = 0
    latencies: list[float] = []
    failures: list[dict[str, Any]] = []

    for item in dataset:
        started = time.perf_counter()
        retrieval = engine.retrieve(item["question"], k=k)
        answer = answer_policy(item["question"], retrieval, chain)
        latencies.append((time.perf_counter() - started) * 1000.0)

        if item.get("scope") == "in":
            for depth in recall_hits:
                if any(_matches_expected(hit.citation, item) for hit in retrieval.hits[:depth]):
                    recall_hits[depth] += 1
            if answer.abstained:
                abstained_in += 1
            if any(_matches_expected(citation, item) for citation in answer.citations):
                citation_hits += 1
            if collect_failures and not any(
                _matches_expected(hit.citation, item) for hit in retrieval.hits[:k]
            ):
                failures.append(
                    {"id": item["id"], "type": "retrieval_miss", "top": [hit.citation.get("article") for hit in retrieval.hits]}
                )
        else:
            if answer.abstained:
                abstained_out += 1
            elif collect_failures:
                failures.append(
                    {
                        "id": item["id"],
                        "type": "false_answer",
                        "citations": [citation.get("article") for citation in answer.citations],
                    }
                )

    n_in = max(len(in_scope), 1)
    n_out = max(len(out_scope), 1)
    return RetrieverReport(
        retriever=retriever_kind,
        n_in_scope=len(in_scope),
        n_out_of_scope=len(out_scope),
        recall_at_1=recall_hits[1] / n_in,
        recall_at_3=recall_hits[3] / n_in,
        recall_at_5=recall_hits[5] / n_in,
        citation_hit_rate=citation_hits / n_in,
        abstain_rate_in=abstained_in / n_in,
        abstain_rate_out=abstained_out / n_out,
        false_answer_rate=(len(out_scope) - abstained_out) / n_out,
        latency_p50_ms=statistics.median(latencies) if latencies else 0.0,
        latency_p95_ms=_percentile(latencies, 0.95),
        failures=failures,
    )


# --- reporting -------------------------------------------------------------------


def table_header(k: int) -> str:
    return (
        f"| retriever | recall@1 | recall@3 | recall@{k} | citation_hit | abstain(in) | "
        "abstain(out) | false_answer | p50 ms | p95 ms | N |\n"
        "|---|---|---|---|---|---|---|---|---|---|---|"
    )


def render_report(
    reports: list[RetrieverReport],
    *,
    corpus_label: str,
    provider_label: str,
    split: str,
    k: int,
    command: str,
) -> str:
    lines = [
        "# Policy RAG eval report",
        "",
        f"- Command: `{command}`",
        f"- Date: {time.strftime('%Y-%m-%d %H:%M:%S %z')}",
        f"- Corpus: {corpus_label}",
        f"- Provider: {provider_label}",
        f"- Split: {split}",
        f"- TOP_K={k}, MIN_EVIDENCE_DENSE={settings.min_evidence_dense}, "
        f"MIN_EVIDENCE_LEXICAL={settings.min_evidence_lexical}, RRF_K={settings.rrf_k}",
        "- Commit: chưa commit (worktree feat/ai-service) — số liệu chỉ dùng nội bộ, "
        "chưa đủ điều kiện công bố theo docs/09 §4.3.",
        "",
    ]
    if provider_label == "fake":
        lines += [f"> ⚠️ {MOCK_BANNER}", ""]
    if corpus_label == "seed":
        lines += [
            "> ⚠️ Corpus là `SEED_POLICIES` trong repo (demo), chưa phải `policies` thật của Phase 1.",
            "",
        ]
    lines += [table_header(k), *[report.row(k) for report in reports], ""]
    lines += [
        "Ghi chú định nghĩa:",
        "- `abstain(in)` = câu trong phạm vi bị từ chối oan (càng thấp càng tốt).",
        "- `abstain(out)` = câu ngoài phạm vi bị từ chối đúng (càng cao càng tốt, mục tiêu ≥ 0.90).",
        "- `false_answer` = câu ngoài phạm vi vẫn bị trả lời (rủi ro bịa; càng thấp càng tốt).",
        "- `citation_hit` = câu trong phạm vi có citation trùng document + article kỳ vọng.",
        "",
    ]
    for report in reports:
        if report.failures:
            lines.append(f"## Failures — {report.retriever}")
            for failure in report.failures:
                lines.append(f"- `{failure['id']}` ({failure['type']}): {json.dumps(failure, ensure_ascii=False)}")
            lines.append("")
    return "\n".join(lines)


# --- CLI -------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Policy RAG offline evaluation")
    parser.add_argument("--retriever", choices=RETRIEVERS, default=None)
    parser.add_argument("--all", action="store_true", help="run lexical, dense and hybrid")
    parser.add_argument("--split", choices=("all", "dev", "test"), default="all")
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--corpus", choices=("seed", "db"), default="seed")
    parser.add_argument("--provider", choices=("fake", "live"), default="fake")
    parser.add_argument("--provider-config", default=None, help="ADR-017 JSON payload for --provider live")
    parser.add_argument("--report", default=None, help="markdown output path (omit to skip)")
    parser.add_argument("--json", dest="json_path", default=None, help="machine-readable metrics output")
    args = parser.parse_args(argv)

    retrievers = RETRIEVERS if (args.all or args.retriever is None) else (args.retriever,)
    dataset = load_dataset()
    if args.split != "all":
        dataset = [item for item in dataset if item.get("split") == args.split]
    if not dataset:
        raise SystemExit(f"dataset rong cho split={args.split}")

    corpus, corpus_label = load_corpus(args.corpus)
    chain, provider_label = build_chain_from_args(args.provider, args.provider_config)

    reports: list[RetrieverReport] = []
    for kind in retrievers:
        report = evaluate(kind, chain, dataset, k=args.k, chunks=corpus)
        reports.append(report)
        print(f"[eval] {kind}: {json.dumps(report.as_dict(), ensure_ascii=False)}")

    print()
    print(table_header(args.k))
    for report in reports:
        print(report.row(args.k))

    if args.json_path:
        Path(args.json_path).write_text(
            json.dumps([report.as_dict() for report in reports], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    if args.report:
        command = "python eval/run_eval.py " + " ".join(argv if argv is not None else sys.argv[1:])
        markdown = render_report(
            reports,
            corpus_label=corpus_label,
            provider_label=provider_label,
            split=args.split,
            k=args.k,
            command=command,
        )
        Path(args.report).write_text(markdown, encoding="utf-8")
        print(f"\n[eval] report -> {args.report}")
    if provider_label == "fake":
        print(f"\n⚠️ {MOCK_BANNER}")
    if corpus_label == "seed":
        print("⚠️ Corpus seed demo trong repo, chưa phải policies thật của Phase 1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
