# Design report: db-preview.html

Type: **mockup** · Verdict: **PASS (with skipped/not-applicable checks)** · Plan: `design-plan.md`


## Automatic checks
### ✔ Plan check

```
Plan check: design-plan.md

PASS.
Next: node scripts/tokens.mjs finance-ledger --out tokens.css
```

### ✔ Design lint (generic habits, tokens, a11y)

```
Design lint: previews/db-preview.html
  (20 distinct hard-coded colors, 5 distinct font sizes)
  ⚠ 20 different hard-coded colors. Use the role variables from tokens.css (aim ≤ 10 total).
  ⚠ 8 fixed px widths ≥400px (639px, 1180px, 640px, 1023px). Fixed widths break narrow layouts — use max-width, %, or a token.
```

### ✔ Screenshots + audit

```
1440x900  →  C:\work-space\hr-blockbot\design-check\shots/1440x900.png
  no automatic issues found (still look at the screenshots)

1280x800  →  C:\work-space\hr-blockbot\design-check\shots/1280x800.png
  no automatic issues found (still look at the screenshots)

390x844  →  C:\work-space\hr-blockbot\design-check\shots/390x844.png
  ⚠ Lede <p.muted.cluster> "Extract 07/10/2026 từ Google Sheet GUTA " renders at 13px over ~5 lines (50% of the h1). Drop it one step at narrow — it should cost ≤3 lines of fold space.
  ⚠ Body text outside 25–85ch per line: <p.muted.cluster> "Extract 07/10/2026 từ Google Sheet GUTA " ≈25ch/line. Aim for 45–75ch.

0 issue(s), 2 warning(s). Now OPEN the screenshots and score them with references/critique.md.
```

### – Designer notes

```
no design-notes.json under the evidence root — the designer left no reasoning notes this run (Step 8.5)
```

### – assets.provenance

```
no raster assets under assets/ — provenance rows not required
```

### – assets.attribution

```
no raster assets under assets/
```

## Look at the pictures (required even when everything passes)
Open: `C:\work-space\hr-blockbot\design-check\contact-sheet.png`

Stated responsive intent (from the plan):
- nav: ở narrow sidebar (danh sách 12 nút + ô tìm) xếp xuống DƯỚI nội dung chính (flex order), luôn hiển thị đầy đủ, không toggle — h1 + nút primary nằm trong fold đầu tiên
- stats: 5 cột → 2 cột ở medium → 1–2 cột ở narrow, không drop nội dung
- erd: giữ toàn bộ node/cạnh, bọc trong scroller có nhãn "cuộn ngang để xem hết sơ đồ →" ở narrow
- Panel chi tiết bảng: khối "cột" và "dữ liệu mẫu" xếp dọc ở narrow; bảng mẫu nằm trong .table-wrap có fade cạnh phải
- detail: khối "cột" và "dữ liệu mẫu" xếp dọc; bảng mẫu nằm trong .table-wrap có fade cạnh phải

**wide (≥1024px)**
- C:\work-space\hr-blockbot\design-check\shots\1280x800.png
- C:\work-space\hr-blockbot\design-check\shots\1440x900.png
**narrow (<640px)**
- C:\work-space\hr-blockbot\design-check\shots\390x844.png

## Score (fill in, from references/critique.md)
| # | Check | Score 0–2 | Evidence (what you see in the screenshot) |
|---|---|---|---|
| 1 | First glance | | |
| 2 | Hierarchy | | |
| 3 | Alignment | | |
| 4 | Spacing | | |
| 5 | Typography | | |
| 6 | Color | | |
| 7 | Contrast & legibility | | |
| 8 | Content | | |
| 9 | Integrity | | |
| 10 | Responsive / format | | |
| 11 | Distinctiveness | | |
| 12 | Polish | | |
| 13 | Truthful content & claim provenance | | |

Done when: every automatic check passes AND every score is 2 (or you explain why a 1 is acceptable).

## Learn from this run
If you had to fix the same kind of problem more than once, or found something the checks missed, write a lesson card:
`node <kit>/scripts/kb.mjs new <domain> <id> --type lesson` (it stays "proposed" until a human accepts it).

## Reviewer prompt (for a second model that can see images)
> You are a strict senior product designer. Attached: contact-sheet.png and the rubric in critique.md.
> Score each of the 13 rubric lines 0–2 with one sentence of visual evidence.
> Then list the 5 most important fixes, most important first, each as: element → problem → exact change (property and new value).
> Do not praise. Do not suggest new features.

## Score table (Step 8 — contact-sheet.png của bản FINAL full-data, v2 07/10)

| # | Check | Điểm | Bằng chứng nhìn thấy |
|---|---|---|---|
| 1 | First glance | 2 | h1 → 5 stat → ERD với node employees tô accent; thứ tự đọc rõ. |
| 2 | Hierarchy | 2 | Rank 1 tiêu đề + node/edge chọn; rank 2 stats; rank 3 chú thích muted. |
| 3 | Alignment | 2 | 12 node thẳng 3 biên cột; sidebar một biên trái; stats đều khung. |
| 4 | Spacing | 2 | Panel cách đều --space-5; nhóm chặt, giữa nhóm rộng. |
| 5 | Typography | 2 | IBM Plex Sans + Mono, số tabular khắp nơi — signature finance-ledger giữ trọn. |
| 6 | Color | 2 | Accent chỉ ở selection + CTA; amber chỉ cho bridge/alias chờ. |
| 7 | Contrast & legibility | 2 | Audit bản v2: 0 lỗi contrast, 0 text <12px, 0 JS error. |
| 8 | Content | 2 | Toàn bộ 39.380 dòng thật nhúng từ extract 07/10; phân trang + lọc theo bảng. |
| 9 | Integrity | 2 | Không tràn ngang, không clip; JS load sạch (lỗi double-index pool đã sửa). |
| 10 | Narrow composition | 2 | 390px: h1 + CTA trong fold, context xuống 13px ≤3 dòng, stats 2-cột, hết cuộn ngang. |
| 11 | Medium / format fit | 2 | Dashboard explorer giữ form ở mọi băng; stats 2-cột medium. |
| 12 | Distinctiveness | 2 | ERD 3 tầng + R1–R10 ba kiểu nét — bố cục riêng của chủ đề DB. |
| 13 | Polish | 2 | Hover/focus/active/pressed; zero-result empty state; pager disable đúng méi. |
| 14 | Truthful content | 2 | Mọi ô dữ liệu truy về db/hr_bot.db extract 07/10; AB1-B219 gắn cờ chờ xác nhận. |

Ghi nhận v2: phần "Dữ liệu mẫu 5 dòng" thay bằng bộ duyệt TOÀN BỘ dữ liệu (lọc mọi cột + phân trang
25/50/100/200 + aria-live chỉ số dòng). Audit tự động không bấm tương tác phân trang — đường code
trang 2 trùng trang 1 (khác mỗi chỉ số start); đã ghi là kiểm chứng một phần.
