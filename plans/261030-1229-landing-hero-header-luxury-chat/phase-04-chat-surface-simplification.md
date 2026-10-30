---
phase: 04
plan: landing-hero-header-luxury-chat
title: Chat — bỏ "Copilot", gộp menu, chuẩn hoá control
owner: fullstack-developer
status: completed
priority: P1
effort: 4h
depends_on: []
blocks: [05]
---

# Phase 04 — Đơn giản hoá surface chat

## Mục tiêu

Một surface chat đọc như chat, không như buồng lái: bỏ danh xưng "Copilot" ở mọi nơi người dùng đọc,
gộp hai nhóm nav trùng chức năng thành một, và giữ nguyên mọi hành vi đang chạy.

## Hiện trạng — chỗ gây "phức tạp"

`ChatPageView.tsx:305-334` có **hai** `<nav>` liền nhau trong sidebar:

| Nav | Nội dung | Vấn đề |
|---|---|---|
| `aria-label="Gợi ý theo vai trò"` | `ROLE_QUICK_REPLIES[currentRole]` | Trùng với khối prompt ở giữa màn hình (`:369-383`) — **cùng dữ liệu, hai chỗ** |
| `aria-label="Chủ đề mẫu"` | `TOPICS` (3 mục) | Khác nội dung, nhưng cùng hình thức nút |

Thêm `<p>GỢI Ý · {badge}</p>` và `<p>CHỦ ĐỀ MẪU</p>` — hai micro-label uppercase.

Chuỗi "Copilot" xuất hiện ở 6 bề mặt:

| File | Dòng | Chuỗi |
|---|---|---|
| `chat/ChatPageView.tsx` | 335 | `aria-label="HR-BlockBot AI Copilot"` (main) |
| | 338 | `aria-label="Menu Copilot"` |
| | 340 | `<strong>HR-BlockBot AI Copilot</strong>` |
| | 365 | `<h1>Chào mừng HR-BlockBot AI Copilot</h1>` |
| `chat/ChatDrawer.tsx` | 240 | lời chào "Tôi là Guta AI Copilot" |
| | 445 | `aria-label="Guta AI Copilot Drawer"` |
| | 452 | `aria-label="Đóng Chat Copilot"` |
| | 478 | nhãn `GUTA AI COPILOT` |
| `CrmDashboardView.tsx` | 57-59 | nav item "Trợ Lý AI (Copilot)" / "Guta Copilot AI" |
| `FolioLandingView.tsx` | 205 | `<span class="crm-tag-xs">AI copilot</span>` (trong mockup) |

## Copy mới

Nguyên tắc: gọi nó là **Trợ lý** khi nói về vai trò, **Chat** khi nói về bề mặt. Không dùng từ ngoại
lai khi tiếng Việt đã có từ rõ hơn.

| Vị trí | Cũ | Mới |
|---|---|---|
| `<h1>` chat trống | Chào mừng HR-BlockBot AI Copilot | Chào mừng đến HR BlockBot |
| `<strong>` header chat | HR-BlockBot AI Copilot | Trợ lý HR BlockBot |
| `main aria-label` | HR-BlockBot AI Copilot | Trợ lý HR BlockBot |
| `button aria-label` menu | Menu Copilot | Mở danh sách hội thoại |
| `aside aria-label` | Điều hướng Copilot | Điều hướng hội thoại |
| Drawer `aria-label` | Guta AI Copilot Drawer | Trợ lý HR BlockBot |
| Drawer close | Đóng Chat Copilot | Đóng trợ lý |
| Drawer nhãn | GUTA AI COPILOT | TRỢ LÝ HR BLOCKBOT |
| Drawer lời chào | Tôi là Guta AI Copilot — trợ lý điều hành… | Tôi là trợ lý HR BlockBot — hỗ trợ điều hành… |
| CRM nav item | Trợ Lý AI (Copilot) / Guta Copilot AI | Trợ lý HR BlockBot |
| Landing mockup tag | AI copilot | Trợ lý |

## Gộp sidebar

Bỏ `<nav aria-label="Gợi ý theo vai trò">` khỏi sidebar — dữ liệu đó **đã có** ở `guta-chat-prompts`
giữa màn hình, nơi người dùng thực sự nhìn. Sidebar giữ lại một nav "Chủ đề mẫu", đổi nhãn thành
`Hỏi nhanh` và bỏ micro-label uppercase (dùng `<p className="guta-chat-sidebar-label">` sentence case
12px).

Kết quả: sidebar từ **10 nút** (1 `chat-new` + 4 quick reply + 3 chủ đề + 2 footer) xuống **6 nút**
(1 + 3 + 2), bỏ một `<nav>`, bỏ hai micro-label uppercase. Dữ liệu quick reply không mất — nó vẫn
hiện ở `guta-chat-prompts` giữa màn hình, nơi người dùng thực sự đọc.

Giữ nguyên: `chat-new` (đổi nhãn "+ New Chat" → "Hội thoại mới"), `chat-back-crm`, `Đăng xuất`.

## Cập nhật test (bắt buộc cùng commit)

17 locator khoá chuỗi cũ. Sửa **chính xác** các dòng sau, không đổi ngữ nghĩa test:

| File | Dòng | Từ | Thành |
|---|---|---|---|
| `test/e2e-revamp-flow.test.mjs` | 310 | `getByRole('heading', { name: 'Chào mừng HR-BlockBot AI Copilot' })` | `'Chào mừng đến HR BlockBot'` |
| | 560, 585, 610, 794, 856, 894, 997 | `page.locator('nav a').filter({ hasText: 'Copilot' })` | `page.locator('nav a').filter({ hasText: 'Trợ lý HR BlockBot' })` |
| | 613 | `getByRole('heading', { name: 'Chào mừng HR-BlockBot AI Copilot' })` | `'Chào mừng đến HR BlockBot'` |
| | 619 | `getByText('HR-BlockBot AI Copilot', { exact: true })` | `getByText('Trợ lý HR BlockBot', { exact: true })` |
| | 905 | `getByRole('button', { name: 'Menu Copilot' })` | `'Mở danh sách hội thoại'` |
| `test/auth-login-flow.test.mjs` | 123 | `filter({ hasText: /Copilot/i })` | `filter({ hasText: /Trợ lý HR BlockBot/i })` |
| `test/chat-drawer.test.mjs` | 88, 92 | `getByRole('button', { name: 'Đóng Chat Copilot' })` | `'Đóng trợ lý'` |

**Cẩn thận:** locator `nav a` filter `'Trợ lý HR BlockBot'` có thể khớp cả nav item CRM lẫn nav
landing. Kiểm sau khi sửa: nếu khớp >1, dùng `page.locator('nav[aria-label="Phân hệ vận hành"] a')`
thay vì `nav a`.

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/components/chat/ChatPageView.tsx` |
| Sửa | `apps/web/src/components/chat/ChatDrawer.tsx` |
| Sửa | `apps/web/src/components/CrmDashboardView.tsx` (chỉ 2 dòng nav item) |
| Sửa | `apps/web/src/components/FolioLandingView.tsx` (chỉ `crm-tag-xs`) |
| Sửa | `apps/web/src/styles/product.css` (`.guta-chat-sidebar-label` thay 2 rule micro-label) |
| Sửa | `apps/web/test/e2e-revamp-flow.test.mjs` |
| Sửa | `apps/web/test/auth-login-flow.test.mjs` |
| Sửa | `apps/web/test/chat-drawer.test.mjs` |

**Không chạm:** `ChatPanel.tsx` (dead code, `source-shape` test cấm nối vào `App.tsx`),
`AiCopilotBar.tsx`, `AiCopilotModal.tsx` — để nguyên, không xoá trong phase này.

## Bất biến phải giữ

- `ChatComposer` markup **không đổi**: test `:637-647` assert chính xác `radius 9999px`,
  `background rgba(255,255,255,.05)`, `blur(20px)`, `rows 1`, thứ tự `LABEL, BUTTON, TEXTAREA, BUTTON`,
  kích thước nút 44×44. Không sửa file này.
- `ROLE_CONFIG`, `ROLE_QUICK_REPLIES` export từ `ChatDrawer.tsx` vẫn phải còn (ChatPageView import).
- `data-testid="chat-page"` giữ nguyên.

## Kiểm chứng

```bash
cd apps/web && pnpm test
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" http://localhost:5173 --app --out .taste-skill/inspect/chat
```

Đạt khi:

1. `grep -ri "copilot" apps/web/src` → **0 kết quả**.
2. `grep -ri "copilot" apps/web/test` → 0 kết quả.
3. Sidebar chat còn đúng 1 `<nav>`; số nút giảm từ 7 → 3.
4. `pnpm test` pass toàn bộ, gồm `chat-drawer.test.mjs` (focus trap, Esc, click-outside).
5. Điều hướng bằng bàn phím qua sidebar: Tab order không nhảy vào phần tử đã bỏ.
6. `guta-chat-prompts` giữa màn hình vẫn hiện đủ quick replies theo vai trò.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Locator `nav a` filter trúng nhiều phần tử sau khi đổi chữ | Chạy test ngay sau khi sửa; nếu ambiguous, thu hẹp bằng `aria-label` của nav |
| Đổi `aria-label` làm vỡ a11y test khác chưa biết | `grep -rn "aria-label" test/` trước khi sửa để lập danh sách đầy đủ |
| Người dùng quen "Copilot" | Đây là yêu cầu trực tiếp; đổi cả 6 bề mặt cùng lúc để không có hai tên song song |
