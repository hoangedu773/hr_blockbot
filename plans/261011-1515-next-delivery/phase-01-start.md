---
title: "Phase 1: Baseline Reconciliation & Safety Guard"
status: pending
priority: P1
effort: 16h
created: 2026-10-11
---

# Phase 1: Baseline Reconciliation & Safety Guard

## Overview

Giai đoạn thiết lập nền tảng kỹ thuật an toàn và đối chiếu hiện trạng trước khi viết mã F1/F2 phục vụ Khóa luận. Trọng tâm: đối soát commit thực tế của 3 dịch vụ so với PM HEAD, dựng rào chắn DB test cô lập ngăn phá hủy dữ liệu, probe kết nối vector search thật trên MongoDB Atlas M0, rà soát dữ liệu nhân sự GUTA, đóng băng cơ chế tiêu thụ TypeScript contracts, và hoàn thiện cổng thiết kế lưu trữ hàng đợi duyệt nhạy cảm FR-003/004. Bằng chứng kiểm định: `plans/reports/pm-261011-2220-next-delivery-evidence.md`.

## Preconditions & Execution Gates

- Nhánh công việc: `feat/pm-agentkit` (PM/Contracts), tham chiếu nhánh dịch vụ `feat/api-backend` (`a5cb61f`), `feat/frontend-web` (`62a00cf`), `feat/ai-service` (`3e09159`).
- Không thực hiện merge ngầm vào `main`. Mọi thao tác tích hợp phải diễn ra trên integration branch/worktree được cấp phép riêng.
- Cấm kết nối suite test tới cụm MongoDB Atlas dùng chung; bắt buộc sử dụng DB kiểm thử cô lập.
- Duy trì quyền sở hữu độc quyền của PM đối với root manifests (`package.json`, `pnpm-lock.yaml`) và thư mục `packages/contracts/`.

## Implementation Tasks

### 1. Baseline & Environment Reconciliation
- [x] Đối soát revision thực tế của các nhánh dịch vụ (API `a5cb61f`, Web `62a00cf`, AI `3e09159`, PM `a03ae0a`) và ghi nhận độ lệch 6/4 commit so với PM HEAD.
- [x] Đối chiếu trạng thái kế hoạch bootstrap cũ: ghi nhận tiến độ 29% (9/31 tasks, 1/5 phase done) chỉ là checkbox, báo cáo QA 47/47 cũ chưa chứng minh E2E hợp nhất trên cùng một revision; không sửa đổi file plan cũ trong phiên này.
- [x] Kiểm tra tính sẵn sàng của package contracts: xác nhận build phát sinh `dist/index.js` trước khi chạy test, khắc phục triệt để lỗi `ERR_MODULE_NOT_FOUND` và chạy 10/10 unit tests.
- [x] Đóng băng cơ chế tiêu thụ contracts: ghi nhận script `generate:openapi` hiện là stub exit 1; đóng băng tiêu thụ TypeScript schema trực tiếp từ `@hr-blockbot/contracts`, không claim pipeline sinh client tự động đã hoàn tất.
- [x] Thẩm định các script trong `apps/api/package.json`: ghi nhận có `build` và `test:auth` nhưng thiếu `test`; cấu hình test commands tường minh trong package của owner, không để lệnh root test nuốt chửng lỗi bỏ sót.

### 2. Safety Guards & Database Protection
- [x] Thiết lập fail-closed guard cho suite test backend: chặn thực thi `apps/api/test/auth.test.mjs` nếu phát hiện kết nối shared Atlas cluster; chỉ cho phép chạy khi `NODE_ENV=test` trỏ tới isolated test DB hoặc Mongo memory server (Đã tạo `require-isolated-db.mjs` và kiểm chứng 3/3 tests trong `db-guard.test.mjs`).
- [x] Tái cấu trúc hook dọn dẹp fixture: thay thế lệnh xóa toàn cục nguy hiểm `RefreshSessionModel.deleteMany({})` bằng cơ chế xóa có phạm vi hẹp (scoped cleanup theo test session prefix / fixture user ID).
- [ ] Thiết lập quy trình snapshot backup database: thực hiện backup toàn bộ collections trước bất kỳ thao tác chạy thử nghiệm có ghi dữ liệu.
- [ ] Rà soát dữ liệu nhân sự GUTA: xác nhận GUTA chỉ là nguồn đọc danh sách nhân sự ban đầu; thực hiện đếm bản ghi read-only, cấm import dữ liệu sản xuất vào môi trường thử nghiệm và cấm dump dữ liệu PII nhạy cảm (CCCD, lương, ngân hàng, địa chỉ cá nhân).

### 3. AI Vector Probe Gate & Storage Design Gate
- [ ] Thực hiện probe thực tế Atlas Vector Search (`$vectorSearch`) trên authorized test corpus để đo độ sẵn sàng, trạng thái index và độ trễ truy vấn (không dùng mock ping hay Jaccard lexical probe).
- [ ] Ghi nhận kết quả probe: nếu probe vector bị chặn hoặc chưa đạt, ghi rõ trạng thái blocked nhưng không chặn luồng dev F1/F2 của API/Web; cấm claim hoàn tất bootstrap AI khi chưa probe thành công.
- [x] Thiết kế cơ chế lưu trữ hàng đợi duyệt nhạy cảm FR-003/004 (Design Gate): phân tích đánh đổi giữa lưu embedded có giới hạn trong `employees` (bảo vệ baseline 11 collection của đề cương) vs tách collection thứ 12 (phải có approval); chốt cấu trúc request, lý do bắt buộc khi từ chối, resubmit flow, cấm Admin tự duyệt chính mình (`07 §7.3`), chống stale update và lưu vết audit (Đã phê duyệt phương án embedded trong `docs/design/fr003-004-approval-storage.md`).

## File Ownership & Artifacts

| Phân loại | Đường dẫn file | Chủ sở hữu | Quyền hạn & Mục đích |
|---|---|---|---|
| Existing | `packages/contracts/package.json` | PM Integrator | Read/Write: Kiểm tra script build, test và dist output |
| Existing | `packages/contracts/src/index.ts` | PM Integrator | Read/Write: Rà soát export contracts cơ sở |
| Existing | `apps/api/package.json` | API Owner | Read/Write: Thêm script test chuẩn, loại bỏ nguy cơ silent skip |
| Existing | `apps/api/test/auth.test.mjs` | API Owner | Read/Write: Thẩm tra hook dọn dẹp DB và thêm guard fail-closed |
| Proposed | `apps/api/src/config/test-db-guard.ts` | API Owner | Create: Module fail-closed chặn chạy test trên Atlas dùng chung |
| Proposed | `docs/design/fr003-004-approval-storage.md` | PM / API | Create: Tài liệu chốt thiết kế lưu trữ hàng đợi duyệt nhạy cảm |
| Proposed | `scripts/probe-vector-readiness.py` | AI Owner | Create: Script probe vector search thật trên test corpus |

## Verification Commands & Acceptance Criteria

```bash
# 1. Kiểm tra build và test hợp đồng contracts độc lập
pnpm --filter @hr-blockbot/contracts build
pnpm --filter @hr-blockbot/contracts test

# 2. Kiểm tra fail-closed guard ngăn chạy test trên DB thật
NODE_ENV=production pnpm --filter api test:auth # Kỳ vọng: EXIT 1 với lỗi "FATAL: Shared Atlas DB detected in test mode"

# 3. Kiểm tra DB test cô lập với scoped cleanup
NODE_ENV=test MONGODB_URI="mongodb://localhost:27017/test-isolated" pnpm --filter api test:auth

# 4. Chạy vector probe trên test corpus độc lập
python scripts/probe-vector-readiness.py # Kỳ vọng: Trả về trạng thái index và latency ms thực tế
```

- **Tiêu chí nghiệm thu:**
  1. Hợp đồng `@hr-blockbot/contracts` build và chạy 10/10 test thành công từ thư mục `dist/`.
  2. Test suite API lập tức dừng (fail-closed) nếu phát hiện URI trỏ tới cụm Atlas dùng chung; có backup snapshot trước mọi thao tác mutation.
  3. Báo cáo reconciliation phản ánh trung thực trạng thái các nhánh dịch vụ mà không ghi đè plan cũ.
  4. Vector probe cho kết quả thực tế trên Atlas M0 (được ghi nhận vào report mà không làm tắc nghẽn F1/F2).
  5. Tài liệu thiết kế FR-003/004 hoàn tất và được phê duyệt trước khi chuyển sang Phase 2.

## Rollback & Failure Modes

- **Rủi ro rò rỉ dữ liệu hoặc xóa nhầm DB:** Nếu test API chạm DB dùng chung, ngắt kết nối ngay lập tức (`SIGINT`), phục hồi dữ liệu từ bản snapshot backup đã tạo trước đó.
- **Rủi ro Vector Search không khả dụng:** Giữ nguyên trạng thái blocked của AI Service probe trong tài liệu; cô lập nhánh AI, tiếp tục Phase 2 cho API và Web mà không gián đoạn.
- **Rủi ro tranh chấp thiết kế FR-003/004:** Nếu giải pháp embedded vượt quá giới hạn hoặc làm phức tạp truy vấn, dừng lại tại Design Gate để xin ý kiến hội đồng; không tự ý thêm collection thứ 12 vào mã nguồn.
