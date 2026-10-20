---
title: "Next Delivery: F1-F2 Core Thesis & Integration Baseline"
description: "Kế hoạch điều phối F1 (Hồ sơ nhân sự/phòng ban/phê duyệt nhạy cảm) và F2 (Vòng đời đề tài) phục vụ Khóa luận."
status: pending
priority: P1
effort: 72h
branch: feat/pm-agentkit
tags: [thesis, f1-f2, contracts, integration, rbac]
created: 2026-10-11
---

# Next Delivery: F1-F2 Core Thesis & Integration Baseline

## Overview

Kế hoạch điều phối chuyển giao F1 (Hồ sơ nhân sự, phòng ban, 5 cấp bậc, duyệt field nhạy cảm) và F2 (Vòng đời đề tài 5 trạng thái) phục vụ Khóa luận tốt nghiệp (Thesis 2026-11-16, Feature Freeze 2026-11-09). Thiết lập trật tự an toàn: đối chiếu hiện trạng, cô lập môi trường thử nghiệm và thiết kế hàng đợi duyệt FR-003/004 (Phase 1), chuẩn hóa contracts rồi phân công từng app owner triển khai (Phase 2), kiểm thử tích hợp hai vai trên branch tích hợp riêng (Phase 3). Bằng chứng kiểm định chi tiết: [pm-261011-2220-next-delivery-evidence.md](../reports/pm-261011-2220-next-delivery-evidence.md).

## Validation Log

- **Quyết định 1 (Phạm vi nghiệp vụ):** Tập trung tuyệt đối vào F1-F2 Khóa luận (hồ sơ nhân sự GUTA + vòng đời đề tài). GUTA chỉ là nguồn dữ liệu nhân sự; loại bỏ toàn bộ nghiệp vụ ca kíp, điểm danh, đổi ca, quỹ tiền mặt.
- **Quyết định 2 (FR-045 Phân công & Phản hồi):** Tách thành cổng BLOCKED riêng do vướng thiết kế Q-10/D-15/D-16 (chưa có luồng reassign/resolution). F2 lõi chạy bình thường không chờ FR-045; tuyệt đối không đánh dấu hoàn thành FR-045.
- **Quyết định 3 (FR-003/004 Duyệt field nhạy cảm):** Chốt trong đợt này ('Chốt trong đợt này (Recommended)'); thiết kế lưu trữ (ưu tiên embed có giới hạn trong `employees` để bảo vệ baseline 11 collection, nếu thêm collection phải xin duyệt), cấm tự duyệt hồ sơ chính mình, bắt buộc lý do khi reject, hỗ trợ resubmit; F1 chỉ hoàn thành khi có luồng duyệt này.
- **Cổng thực thi (Execution Gates):** Quyền mở branch tích hợp riêng, cô lập test DB fail-closed, duyệt HTML preview UI trước khi code.

## Goals & Milestones

| # | Mục tiêu | Hạn chót | Ưu tiên |
|---|---|---|---|
| G1 | Đối chiếu baseline, bảo vệ DB test, chốt thiết kế lưu trữ FR-003/004 | 2026-10-18 | P1 |
| G2 | Chốt contracts F1-F2, chuyển giao API/Web theo ranh giới worktree | 2026-10-25 | P1 |
| G3 | Tích hợp E2E 2 vai (Admin/Employee), duyệt nhạy cảm & vòng đời đề tài | 2026-11-02 | P1 |
| G4 | Feature Freeze toàn bộ F1-F2 và bảo vệ Khóa luận tốt nghiệp | 2026-11-09 / 2026-11-16 | P1 |

## Phases

| # | Phase | Trọng tâm | Trạng thái |
|---|---|---|---|
| 1 | [Phase 1: Baseline Reconciliation & Safety Guard](./phase-01-start.md) | Đối chiếu commit HEAD, cô lập DB test, probe vector, thiết kế duyệt FR-003/004 | Pending |
| 2 | [Phase 2: Contracts & App-Owner Delivery](./phase-02-contracts-and-delivery.md) | Contracts Zod, API F1-F2 atomic, Web UI preview, hàng đợi duyệt & dashboard | Pending |
| 3 | [Phase 3: Integrated Acceptance & Handoff](./phase-03-acceptance-and-handoff.md) | Kiểm thử tích hợp E2E, ma trận nghiệm thu F1-F2, bàn giao staged dispatch | Pending |

## Core Invariants

1. **Không Multi-Doc Transaction:** F2 dùng atomic conditional update trên single document `(_id, status, version)`; audit events và notification phát sau khi commit DB thành công.
2. **Bảo mật & Tối thiểu dữ liệu:** Allowlist schema chặn PII; Admin không tự duyệt hồ sơ chính mình; không log credential/password; an toàn khi cấp tài khoản mới.
3. **Điều phối theo ranh giới:** PM sở hữu contracts/docs; Web/API/AI sở hữu app riêng; dispatch tuần tự, không chạy monolithic `ak cook` chéo app.
