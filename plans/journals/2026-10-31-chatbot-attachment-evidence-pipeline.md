---
title: "Chuỗi bằng chứng đính kèm GUTA: sửa phân phối tệp trước"
date: 2026-10-31
summary: Đối chứng bản đề xuất Policy Digest với code thật; phát hiện 3 lỗi phân phối attachment bị bỏ sót.
---

# Chuỗi bằng chứng đính kèm GUTA: sửa phân phối tệp trước


## Bối cảnh

Người dùng chuyển một bản đề xuất kỹ thuật (Policy Digest + BM25 + attachment registry) kèm yêu cầu "dò xét hệ thống và cho biết nên xử lý thế nào cho tối ưu". Đề xuất tự nhận là giải pháp thay thế "Full Document RAG 3.000–5.000 token/lượt".

## Phát hiện quyết định

Bản đề xuất mô tả sai baseline. `apps/ai-service/app/agent/in_context_policy.py` đã là digest + BM25 top-k từ trước; đo thực tế cho thấy prompt 155–1.000 token/lượt, không phải 4.500. Toàn bộ phần "giảm 90% token" của đề xuất là no-op.

Trong khi đó ba lỗi thật bị bỏ qua:

1. `data/` nằm trong `.gitignore:72` và `render.yaml` không có disk → tệp đính kèm không tồn tại trong artifact deploy. `resolveDataRoot()` trong `apps/api/src/routes/attachments.ts` resolve về `<repo>\data`, không tồn tại.
2. Web dùng `href={att.url}` với path tương đối `/api/attachments/...` trong khi API ở origin khác và endpoint yêu cầu `Authorization` — hai lỗi độc lập khiến nút tải không thể hoạt động.
3. `resolve_attachments` (`loop.py:234–239`) chấp nhận mọi `dict` có `url`+`title` từ model, không whitelist. Đã chạy thử và URL lạ đi thẳng ra client.

Ngoài ra `main.py:329` dùng `strict_provider=True` nên nhánh degraded mà đề xuất mô tả không bao giờ chạy trên đường chat production.

## Quyết định

Đảo thứ tự ưu tiên: sửa chuỗi phân phối tệp (phục vụ → auth → registry) trước, mở rộng nội dung sau. Không đụng prompt. Loại hướng HMAC download token ở giai đoạn này vì `apiFetch` + blob tái dùng được luồng refresh 401 sẵn có.

## Kiểm chứng đã chạy

- `pytest -q` trong `apps/ai-service`: 178 passed, 1 skipped.
- 6 test `test_agent_attachments.py` pass — nhưng chỉ phủ 2 PDF hardcode, không phủ URL do model sinh.
- Đo `select_relevant_policies` trên 6 câu hỏi; phát hiện thêm lỗi thứ tự ưu tiên đẩy `attendance`/`cash` lên trước và cắt `top_k` khiến câu hỏi biểu mẫu trả sai chủ đề.

## Bài học giữ lại

Một bản đề xuất có bảng trade-off chỉnh chu vẫn có thể so sánh sai thứ với thực tế. Đối chứng bằng cách chạy code thật (đo token, gọi `resolve_attachments` với URL lạ, chạy `resolveDataRoot`) rẻ hơn nhiều so với tranh luận kiến trúc — và phát hiện được lỗi mà cả bản đề xuất lẫn tài liệu dự án đang bỏ sót.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
