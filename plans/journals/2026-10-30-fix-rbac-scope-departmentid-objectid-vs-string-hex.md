---
title: "Fix RBAC scope: departmentId ObjectId vs string hex"
date: 2026-10-30
summary: "employees.departmentId là ObjectId trong Atlas nhưng req.user.departmentId là string hex => scoped admin thấy rỗng. Thêm departmentIdMatch helper ( 2 dạng), sửa 4 call site. Phát hiện thêm 2 lỗ hổng: Admin unmapped đọc toàn bộ projects, global admin bị 404 project/report do thiếu isGlobalAdmin trong ActorContext. 160/160 test xanh, commit a1a1f51."
---

# Fix RBAC scope: departmentId ObjectId vs string hex

employees.departmentId là ObjectId trong Atlas nhưng req.user.departmentId là string hex => scoped admin thấy rỗng. Thêm departmentIdMatch helper ( 2 dạng), sửa 4 call site. Phát hiện thêm 2 lỗ hổng: Admin unmapped đọc toàn bộ projects, global admin bị 404 project/report do thiếu isGlobalAdmin trong ActorContext. 160/160 test xanh, commit a1a1f51.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
