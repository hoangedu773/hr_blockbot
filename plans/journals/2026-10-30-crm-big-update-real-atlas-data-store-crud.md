---
title: "CRM big update: real Atlas data + store CRUD"
date: 2026-10-30
summary: "Bỏ toàn bộ hardcode màn CRM, thêm /api/stores CRUD có auth+scope và /api/dashboard/overview derive từ Atlas. 3 vòng QA (2 REJECT: cascade race mất dữ liệu, cross-tenant write), 137/137 test xanh. Nhánh feat/crm-real-data, commit 8a888cd."
---

# CRM big update: real Atlas data + store CRUD

Bỏ toàn bộ hardcode màn CRM, thêm /api/stores CRUD có auth+scope và /api/dashboard/overview derive từ Atlas. 3 vòng QA (2 REJECT: cascade race mất dữ liệu, cross-tenant write), 137/137 test xanh. Nhánh feat/crm-real-data, commit 8a888cd.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
