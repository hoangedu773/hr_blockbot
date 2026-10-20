---
title: "Phase 4 — AI: provider adapter, hybrid RAG, tool catalog, eval"
status: pending
priority: P1
effort: 40h
owner: AI
created: 2026-10-20
depends_on: phase-01
---

# Phase 4 — AI service

## Goal

Biến `apps/ai-service` từ "keyword Jaccard + template + 6 tool ca kíp" thành RAG thật: hybrid retrieval trên `policies`, sinh câu trả lời bằng provider do Admin cấu hình, luôn có trích dẫn, từ chối khi thiếu bằng chứng — kèm bộ eval đo được.

## Preconditions

- Phase 1 xong: `policies` đã có document + chunk (chưa embedding).
- `SETTINGS_ENCRYPTION_KEY` có ở `apps/api`; `AI_SERVICE_API_KEY` chia sẻ giữa api ↔ ai.
- Không sửa `apps/api/**`, `apps/web/**`.

## Tasks

### 1. Provider layer (ADR-012 + ADR-017)

- [ ] `LLMProvider` interface: `complete(messages, opts)`, `embed(texts, opts)`, `name`, `timeout`.
- [ ] `OpenAICompatibleProvider`: `baseUrl + /chat/completions`, `/embeddings`; phủ OpenAI, Groq, DeepSeek, OpenRouter, vLLM, Ollama.
- [ ] `GeminiProvider`: `generateContent` + `embedContent`.
- [ ] Config nhận **theo request** từ `apps/api` (header `x-ai-service-key`), cache 60s theo `configVersion`.
- [ ] Fallback theo `priority`; hết provider → `503 LLM_UNAVAILABLE` → chế độ `degraded-structured` (`08 §6`).
- [ ] Không log prompt chứa PII; log `providerId`, `latency`, `tokens`.

### 2. Ingest + embedding

- [ ] `scripts/embed_policies.py`: đọc `policies` (chunk chưa có embedding), gọi embedding provider, ghi `chunks[].embedding` (384d, `model` ghi rõ).
- [ ] Tạo Atlas Vector index trên `policies.chunks.embedding` (384, cosine) — đã chứng minh chạy trên M0 ngày 2026-10-20.
- [ ] Idempotent: bỏ qua chunk đã có embedding cùng `model`; `--reembed` để làm lại.

### 3. Retrieval

- [ ] `Retriever` interface: `search(q, scope, k) -> Hit[]`.
- [ ] `LexicalRetriever`: BM25 thuần Python (không thêm dependency nặng) hoặc Atlas text index.
- [ ] `DenseRetriever`: `$vectorSearch` top-K với `numCandidates`.
- [ ] `HybridRetriever`: RRF (k=60) trên 2 danh sách; trọng số cấu hình được.
- [ ] Abstain: `max(score) < MIN_EVIDENCE` → từ chối; ngưỡng đặt trong config, có script hiệu chuẩn.
- [ ] Trả `citations[]` đầy đủ `document/version/article/score/source`.

### 4. Answer pipeline

- [ ] Prompt: chỉ dùng evidence; bắt buộc chèn citation; nếu thiếu thì nói thiếu, không suy đoán.
- [ ] **Citation verifier**: mỗi câu trả lời phải map được về ≥1 chunk; câu không map được → loại hoặc đánh dấu.
- [ ] `POST /api/v1/chat` (thay `/agent/chat` đang 403): nhận `{message, conversationId, userContext, providerConfig}`, trả SSE hoặc JSON theo hợp đồng Phase 1.
- [ ] `POST /api/v1/rag/query` giữ cho eval/CLI.

### 5. Tool catalog (thay 6 tool ca kíp)

- [ ] `get_my_profile`, `get_my_projects`, `get_project_status`, `get_my_kpi`, `get_department_kpi` (Admin), `search_policy`, `submit_report` (write → đề xuất, không tự ghi).
- [ ] Mỗi tool: pydantic args, scope check theo `userContext`, timeout, trần kết quả.
- [ ] Router intent: 28 intent catalog → tool hoặc abstain; intent không có tool → chỉ đường dashboard (FR-022).
- [ ] Guard `maxSteps=5`, `toolTimeout`, `LLM timeout`.

### 6. Eval harness

- [ ] `eval/dataset.jsonl`: 30 câu trong phạm vi + 10 câu ngoài phạm vi (ghi rõ đáp án kỳ vọng + chunk đúng nếu có).
- [ ] `eval/run_eval.py --retriever lexical|dense|hybrid`: in bảng `recall@k`, `citation_hit`, `abstain_rate`, `false_answer_rate`, `latency_p50/p95`.
- [ ] So sánh B0 lexical → B1 dense → B2 hybrid; xuất `eval/report.md` để dán vào báo cáo.
- [ ] `pytest -m eval` chạy được offline (mock provider) trong CI.

## File ownership

| Ok | File |
|---|---|
| ✅ | `apps/ai-service/**`, `scripts/embed_policies.py` |
| ❌ | `apps/api/**`, `apps/web/**`, `packages/contracts/**`, `docs/**`, `plans/**` |

## Verification

```bash
cd apps/ai-service && pytest -q
python ../../scripts/embed_policies.py --dry-run
python eval/run_eval.py --retriever lexical
python eval/run_eval.py --retriever dense
python eval/run_eval.py --retriever hybrid
curl -s localhost:8000/health | jq .
```

## Acceptance

1. `hybrid` ≥ `dense` ≥ `lexical` trên `recall@5` (nếu không, ghi rõ và chọn cái thắng — không ép).
2. 10 câu ngoài phạm vi: ≥ 9 trả abstain, 0 câu bịa nguồn.
3. Mọi câu trả lời có ≥1 citation hợp lệ (verifier pass 100%).
4. Hết provider → 503, không crash, client nhận `degraded`.
5. `pytest` pass, eval chạy < 5 phút với 40 câu.

## Rollback

- Giữ `LexicalRetriever` làm mặc định nếu dense/hybrid lỗi; đổi bằng config, không sửa code.
- Embedding ghi thêm field, có `--reembed` và script xoá embedding.

## Không được làm

- Không ghi DB (kể cả `policies`) từ ai-service — embedding là package riêng chạy bằng script.
- Không gọi model bằng key hardcode; mọi key đi qua config từ api.
- Không dùng LangChain/LangGraph (`ADR-012`).
