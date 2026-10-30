---
phase: 05
plan: design-system-big-update
title: Verification — inspect 3 width, taste lint, adversarial QA, critique loop
owner: tester
status: completed
priority: P0
effort: 6h
depends_on: [01, 02, 03, 04]
blocks: []
---

# Phase 05 — Verification & Critique

Đây là gate cuối. Không có "gần đúng". Mỗi mục dưới đây là một lệnh chạy được với ngưỡng số.

## Context Links

- `ak-design-taste/references/critique.md` (14 pass, rubric 4 tiêu chí, caps)
- `ak-design-taste/references/app-screens.md` §2.7 (app critique 7 câu hỏi)
- `ak-motion-craft/references/review-standards.md` (10 tiêu chuẩn + bảng findings)
- `ak-motion-craft/references/break-ui.md` (adversarial data)
- `research/baseline-evidence.md` (baseline để so)

## Gate 1 — Static checks

```bash
pnpm --filter web typecheck
node plans/261030-1153-design-system-big-update/assets/audit-class-coverage.mjs
```

| Ngưỡng | Pass |
|---|---|
| `tsc --noEmit` | 0 error |
| class coverage | `missing in css bundles: 0` |
| `grep -rc "!important" apps/web/src/styles/` | 0 |

## Gate 2 — Taste lint (app rules)

```bash
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/lint.mjs" --app \
  apps/web/src/components/CrmDashboardView.tsx \
  apps/web/src/components/chat/ChatDrawer.tsx \
  apps/web/src/components/chat/ChatPageView.tsx \
  apps/web/src/components/FolioLandingView.tsx \
  apps/web/src/components/landing \
  apps/web/src/styles
```

| Rule | Baseline | Ngưỡng pass |
|---|---|---|
| `gradient` (FAIL) | 21 | **0** |
| `emoji` (FAIL) | 13 | **0** |
| `micro-label` (FAIL) | 2 | **0** |
| `purple` (FAIL) | 2 | **0** |
| `glass` (WARN) | 19 | ≤ 1 (chỉ sticky header brand) |
| `shadow` (WARN) | 19 | ≤ 2 (chỉ overlay thật: menu, dialog) |
| `bounce` (WARN) | 3 | ≤ 1 (chỉ status dot live) |
| `transition-all` (WARN) | 3 | **0** |
| `framework-colour` (WARN) | 55 | ≤ 10 (chỉ trong `tokens.css` định nghĩa) |
| `mono` (WARN) | 54 | giữ, **có lý do ghi trong report** (dealt sheet "every figure in monospace") |

## Gate 3 — Inspector, 3 width, 4 bề mặt

```bash
node scripts/inspect.mjs <url>/            --widths 1440,768,390 --out assets/final-landing
node scripts/inspect.mjs <url>/crm --app   --widths 1440,768,390 --out assets/final-crm
```

Bề mặt: Landing (chưa login) · CRM (Admin) · Chat page · Auth modal.

| Ngưỡng | Pass |
|---|---|
| FAIL mỗi bề mặt | **0** (landing cho phép `--allow app-title-size` có lý do) |
| `overflow` @390 | không có |
| `tiny-text` | 0 |
| `tabular` | ≥ 95% figures |
| `no-data-hue` | 0 trên CRM (cột Đúng giờ mang accent) |
| `ragged-row` | 0 |
| `panel-void` | ≤ 1 (có lý do) |
| contrast body | ≥ 4.5:1; large/UI ≥ 3:1 |

## Gate 4 — Test suite

```bash
pnpm --filter web test
```

| Suite | Yêu cầu |
|---|---|
| 50 test hiện có | **50/50 PASS**, 0 skip |
| `yellowCount === 0` | giữ nguyên |
| Assertion mới từ ADR-021 | `.crm-kpi-card` không gradient; tabular-nums; không `transition: all`; 390px không overflow |

## Gate 5 — Adversarial QA (5 vector)

| Vector | Kịch bản | Pass |
|---|---|---|
| **1. Zero-Yellow** | Quét mọi computed style trên 4 bề mặt | `yellowCount === 0` |
| **2. Contrast** | Đo text trên mọi surface ở 3 width | body ≥ 4.5:1, large ≥ 3:1 |
| **3. Mobile 320px** | Render 320px, mở modal + drawer | `scrollWidth === clientWidth`; CTA 1 dòng; touch ≥ 44px |
| **4. Reduced motion** | `emulateMedia({ reducedMotion: 'reduce' })` | mọi `transform === 'none'`; content đầy đủ; story dừng ở still |
| **5. Break-UI** | Tên 80 ký tự, số 0, danh sách rỗng, ảnh lỗi, 10.000 dòng | không tràn; số 0 in là "0"; missing là "—"; không cắt chữ |

Vector 5 lấy từ `ak-motion-craft/references/break-ui.md`.

## Gate 6 — Motion review (bảng bắt buộc)

Nộp bảng theo `ak-motion-craft/references/review-standards.md`:

| Before | After | Why |
|---|---|---|
| (liệt kê từng thay đổi motion thực tế đã làm) | | |

Verdict phải là **Approve**, không phải "Block".

Điều kiện Approve:
- Không có `ease-in` trên UI entrance.
- Không `scale(0)`.
- Không `transition: all`.
- Không animation trên action 100+/ngày (tab switch, Ctrl+K).
- Duration UI ≤ 300ms (trừ brand reveal 600–900ms có lý do).
- `prefers-reduced-motion` có mặt ở mọi nơi có transform.
- Hover gate `(hover: hover) and (pointer: fine)`.

## Gate 7 — Critique loop (`ak-design-taste/references/critique.md`)

Chấm rubric trên screenshot, **không** trên code. 3 vòng tối đa.

```
ROUND n
Seen in one second: …
Idea (one sentence): …
Live thing: …
Layout words by section: hero=… / …=… / …
Scores: design _ · usability _ · creativity _ · content _ → overall _._
Caps applied: …
Top three problems:
1. …
2. …
3. …
```

**Ngưỡng:** overall ≥ 7.5. Nếu vòng 3 vẫn < 7.5, **báo thẳng** trong report kèm vấn đề còn lại,
không làm tròn lên.

App screen critique dùng 7 câu hỏi của `app-screens.md` §2.7 thay vì rubric page.

## Gate 8 — Performance

| Đo | Ngưỡng |
|---|---|
| LCP (landing, 4G throttle) | < 2.5s |
| CLS | < 0.1 |
| Long task khi mở drawer | 0 task > 50ms |
| Dropped frame khi scroll bảng 45 dòng | 0 (DevTools Performance, 6× CPU throttle) |
| CSS bundle gzip | < 60KB |

## Deliverable

`plans/reports/tester-261030-1153-design-system-verification.md` gồm:

1. Bảng gate 1–8 với số đo thật.
2. Bảng Before/After motion.
3. Critique 3 vòng + score cuối.
4. Danh sách việc **không** verify được (nếu có) — ghi rõ "unverified".
5. Screenshot cuối: `assets/final-*/{desktop,tablet,mobile}-fold.jpg`.

## Failure Protocol

Gate nào đỏ → **không** đánh dấu done. Trả về phase tương ứng với:
- File + dòng vi phạm.
- Lệnh tái hiện.
- Ngưỡng mong đợi vs thực tế.

Tối đa 3 vòng sửa. Quá 3 vòng → escalate, ghi `BLOCKED` kèm lý do.
