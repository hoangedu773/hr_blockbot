---
title: "Full Delivery: F1-F3 end-to-end trên Render (freeze 09/11)"
description: "Đóng F1 (hồ sơ + duyệt), F2 (vòng đời đề tài), F3 (chatbot hybrid RAG + admin cấu hình provider) và deploy Render $7, mỗi phase chạy được ở session riêng."
status: pending
priority: P1
effort: "120h"
branch: feat/pm-agentkit
tags: [thesis, f1, f2, f3, rag, render, deploy]
created: 2026-10-20
---

# Full Delivery — F1/F2/F3 + deploy

## Overview

Kế hoạch chuyển repo từ "monorepo có nền tảng auth + 2.439 hồ sơ" thành hệ thống **chạy được 3 chức năng trên môi trường công khai** trước freeze 09/11/2026. Xuất phát từ hiện trạng đo thật ngày 2026-10-20: DB `hr_bot` có 2.439 nhân sự + 37 phòng ban, nhưng **`users`, `policies`, `projects`, `reports`, `evaluations` đều rỗng**; chatbot bị khoá `403`; dashboard gọi API đã 503.

Quyết định đã chốt trong phiên (không mở lại): `ADR-017` (provider cấu hình runtime), `ADR-018` (bỏ trần 11 collection), `design/data-derivation.md` (suy diễn đã chạy), `design/conversations-storage.md` (1 collection, trần 50), deploy Render Starter $7 + gọi model qua API ngoài.

## Goals

| # | Goal | Đo bằng |
|---|---|---|
| G1 | F1 chạy: xem hồ sơ 2 vai, sửa field thường, gửi/duyệt field nhạy cảm | E2E 2 phiên trình duyệt + test API |
| G2 | F2 chạy: DRAFT→ASSIGNED→IN_PROGRESS→PENDING_REVIEW→COMPLETED, chống conflict version | 1 test concurrency 2 request, đúng 1 thắng |
| G3 | F3 chạy: hỏi chính sách có trích dẫn, từ chối khi thiếu bằng chứng, Admin đổi provider trên UI | 30 câu trong phạm vi + 10 ngoài phạm vi, có bảng số |
| G4 | Deploy Render $7: web + api + ai, đăng nhập được, chat được | URL công khai + ảnh chụp |
| G5 | Tài liệu khớp code: ERD, PRD, README, ADR | review chéo 0 mâu thuẫn |

## Phases

| # | Phase | Owner | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| 1 | [Contracts & schema](./phase-01-contracts-and-schema.md) | PM | — | Pending |
| 2 | [API: settings, conversations, F1/F2](./phase-02-api.md) | API | Phase 1 | Pending |
| 3 | [Web: admin + chat + F1/F2 UI](./phase-03-web.md) | Web | Phase 1 (contracts) | Pending |
| 4 | [AI: provider, hybrid RAG, tool catalog, eval](./phase-04-ai.md) | AI | Phase 1 (contracts) | Pending |
| 5 | [Tích hợp, eval, deploy Render](./phase-05-integration-deploy.md) | PM + all | Phase 2,3,4 | Pending |

Phase 2/3/4 chạy **song song** được sau Phase 1 vì chia theo worktree: `api`, `web`, `ai`. Không ai sửa file của người khác.

## Core invariants

1. **Không ghi DB từ `ai-service`.** Mọi mutation qua `apps/api`, sau confirm (FR-020).
2. **Mọi field suy diễn có `derivedMeta`**; không thêm giá trị tổng hợp nào mà thiếu nhãn nguồn.
3. **Key LLM mã hoá AES-256-GCM**, không bao giờ trả về client, chỉ `keyHint`.
4. **Không PII ra ngoài**: khi gọi model, chỉ gửi câu hỏi + chunk chính sách + allowlist field; cấm `bank_*`, lương, CCCD, `leave_reason`.
5. **Fail-closed**: thiếu config → 503; thiếu quyền → 403; hết provider → `degraded-structured`.
6. **Mỗi phase phải tự đứng được** khi mở ở session mới: có goal, file ownership, lệnh verify, do-not-touch.

## Cổng chất lượng (chặn merge)

| Cổng | Điều kiện |
|---|---|
| Contracts | `pnpm --filter @hr-blockbot/contracts test` pass, schema mới export |
| API | `pnpm --filter api test` pass; test settings không log key; test conversations trần 50 |
| Web | `pnpm --filter web build` pass; chat panel render 6 trạng thái |
| AI | `pytest` pass; eval in-scope ≥ ngưỡng đã chốt, out-of-scope abstain ≥ 90% |
| Deploy | smoke test trên URL Render: login, xem hồ sơ, hỏi chính sách, đổi provider |

## Rủi ro

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Render 512MB OOM khi chat | demo chết | AI service không load model; embedding/LLM qua API ngoài |
| Không có key LLM thật từ đầu | F3 không test được | Admin UI + 1 provider `openai_compatible` trỏ endpoint bất kỳ; test bằng endpoint công khai |
| `policies` chưa có nội dung | RAG rỗng | Phase 1 chốt danh mục; Phase 4 ingest trước khi eval |
| Khối lượng 5 phase / 3 người / 3 tuần | trễ freeze | thang cắt: bỏ F5/F7, giữ F1/F2/F3 |

## Handoff

- Phase 1 xong → mở 3 session song song, mỗi session nhận đúng 1 phase file + `docs/22-erd-overall.md`.
- Không session nào được sửa `plans/**` hay `docs/**` ngoài phần được giao.
- Kết thúc mỗi phase: cập nhật checkbox + commit + push `feat/<owner>`.
