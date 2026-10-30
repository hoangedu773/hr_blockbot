# Design Direction — Hai Register, Một Hệ Thống

Ghi ngày 2026-10-30. Mọi quyết định dưới đây sinh ra từ brief + `draw.mjs` dealt sheet, không phải từ sở thích.

## 1. Phân đôi register (quyết định gốc)

Sản phẩm có **hai loại bề mặt** đọc theo hai bộ luật khác nhau. Trộn chúng là nguồn gốc của việc
"trông như landing page nhưng là dashboard" hiện tại (inspector báo `app-title-size` h1 60px).

| | **Brand register** | **Product register** |
|---|---|---|
| Bề mặt | Landing (`FolioLandingView`) | CRM (`CrmDashboardView`), Chat (`ChatPageView`, `ChatDrawer`), Auth modal |
| Người dùng | Người chưa có tài khoản, xem một lần | SM/AOM/Admin, mở hằng ngày 8 tiếng |
| Luật | `ak-design-taste` page run + `ak-page-showcase` | `ak-design-taste/references/app-screens.md` |
| Dials | variance 7 / motion 5 / density 3 | variance 3 / motion 2 / density 7 |
| Motion budget | Hero appear 1.2s, scroll reveal 600–900ms, **một** signature moment | **Không có entrance.** Chỉ feedback: press 100–160ms, hover 150–200ms, sheet 240ms |
| Type scale | Display serif + sans, ratio 1.25–1.333 | Một grotesk, 12/14/16/20/24, ratio 1.2 |

## 2. Design Brief

```text
Register:  Brand + Product (hai register, một palette, một hệ token)
Scene:     SM mở app trên iPhone 390px tại quầy bar lúc 6:00 sáng, ánh sáng yếu, một tay cầm máy,
           cần biết "chi nhánh tôi hôm nay đủ người chưa" trong 3 giây.
           AOM mở laptop 1440px giữa hai cuộc gọi, quét 45 chi nhánh tìm ca thiếu người.
           Admin mở 1440px tại trụ sở, đối soát két tiền mặt cuối ngày, cần số khớp từng đồng.
           Khách lạ mở landing trên desktop, cần hiểu sản phẩm làm gì trong 5 giây.
Direction: Data terminal (dealt) cho Product — màn hình đọc lâu, số tabular, mọi selection là
           một đường 1px accent đúng bằng bề rộng nhãn. Editorial serif + Swiss grid cho Brand.
           Lý do: đây là công cụ vận hành chuỗi F&B, không phải dashboard SaaS bán hàng.
Color:     Restrained. bg #090a0f, surface #121214, raised #18181b, text #f8fafc,
           muted #94a3b8, accent #2563eb (≤3% diện tích), positive #10b981, negative #f43f5e.
           Zero-Yellow tuyệt đối (đã có test enforce).
Type:      Product: Geist Sans (một family, weight 400/500/600) + Geist Mono cho mọi con số.
           Brand: Newsreader (display serif) + Geist Sans. Trục tương phản: serif editorial vs grotesk kỹ thuật.
Signature: Bảng 45 chi nhánh với cột "Đúng giờ %" là đường 1px duy nhất mang màu accent,
           và Slide-Over Barista drawer mở bằng spatial continuity từ đúng dòng được bấm.
Dials:     Product 3/2/7 · Brand 7/5/3
```

## 3. Dealt app sheet (Product register)

```
node scripts/draw.mjs --app --sector hospitality --kind workspace \
  --brief "Chuoi F&B Guta: CRM 45 chi nhanh, phan ca, doi soat ket tien, AI copilot" \
  --screens overview --theme dark --keep palette,type --style data-terminal
→ APP SHEET — Data terminal · seed 111000223 · kind workspace · dark
```

**The move (giữ nguyên, không được phá):** mọi selection — tab, toggle, nav item, range — là **một đường 1px accent đúng bằng bề rộng nhãn**, đặt trên cạnh gần nhất đã tồn tại. Con số ở lại trắng hoặc xám và mang dấu trong text (`+14%`, `−2`), không mang màu.

**Colour budget: dưới 3%.** Accent không bao giờ dày hơn 1px.

**Off-style (cấm):**
- Filled pill tabs, coloured segmented control → hiện CRM đang dùng filled pill cho nav active (`index.css` `.nav-item`).
- Chart không có scale và không có ngày.
- Tertiary text dưới 4.5:1.
- Card sáng hơn ground, có border **và** glow.
- Xanh/đỏ trên mọi con số — chỉ cột "what moved today" và headline figure âm mới mang polarity colour.
- Gradient trên KPI card → hiện test đang **assert** điều này (`e2e-revamp-flow.test.mjs:219`).
- Glass/backdrop-blur trên card → hiện test đang **assert** `blur(24px)/blur(16px)/blur(12px)`.

**Its face — chọn 1, ghi vào notes, phải thấy trên screenshot đầu tiên:**
> **Chọn: mọi con số trong Geist Mono như quyết định của style** (mỗi giá, mỗi đếm, mỗi giờ xếp
> chồng theo cột), phần chữ trong Geist Sans. Lint sẽ flag `mono` — đây là lý do hợp lệ, ghi vào report.

Lý do: đây là màn đối soát tiền két; chữ số phải xếp thẳng cột để mắt bắt được sai lệch một hàng nghìn.

**Signature element của sản phẩm (chỉ sản phẩm này có):**
> Cột **"Đúng giờ %"** trong bảng 45 chi nhánh: mỗi ô là số mono + một đường 1px accent dài đúng
> bằng tỷ lệ đó, đặt trên đường rule của hàng. Nhìn một cột là thấy chi nhánh nào tụt, không cần đọc số.

**Shell:** icon rail 50–60px là off-brand ở đây — sản phẩm có 7 điểm đến và cần nhãn. Chọn
**Ruled T-frame** (sidebar 224px + top bar 64px trên cùng một ground, chia bằng 1px rule) —
đây là archetype phổ biến thứ ba trong study và là cái duy nhất khớp với sidebar có nhãn hiện tại.

**Type (Product):** Geist Sans 400/500/600; Geist Mono 400/500 cho figures. Sizes: title 24, section 16, kpi 24 (figure chính 30), body 14, small 12. `font-variant-numeric: tabular-nums` bắt buộc.

## 4. Brand register (Landing)

Landing hiện tại đã đúng hướng editorial (Newsreader + Geist) nhưng sai chi tiết thực thi:
3 typeface (thêm `Tiempos Headline` **không load được**), 37 block chữ <11px, conic gradient, emoji.

**Giữ:** Newsreader display + Geist Sans; tông Obsidian; bố cục hero căn giữa có mockup sản phẩm bên dưới.
**Sửa:** bỏ `Tiempos Headline` (fallback về Newsreader), bỏ conic gradient, bỏ emoji, nâng mọi chữ ≥11px,
thay 7 micro-label uppercase bằng sentence case, thêm tagline reveal section (yêu cầu B11 của `ak-page-showcase`).

**Signature moment (một, duy nhất, được phép loud):**
> Hero headline dòng "Quản Trị Nhân Sự &" / "Phân Ca Tự Động" rise từ mask, mỗi dòng 900ms `--ease-expo`,
> stagger 110ms; mockup CRM bên dưới trượt lên 24px với `card` kind 1.05s, chậm hơn 400ms.

**Điều cấm trên Brand register:** mọi section dùng cùng một fade-and-slide-up (motion tell số 1 của
trang do AI tạo). Mỗi section phải có manner riêng: list arrives row-by-row, statement rises line-by-line,
figure counts up once.

## 5. Showcase register (Bento + hero mockup)

`ak-page-showcase` chỉ áp cho phần **có visual**: 4 bento card và mockup CRM trong hero.
Section text thuần (FAQ, pricing, footer) dùng scroll reveal thường, **không** dùng skill này.

**Story cho từng visual (một câu, viết trước khi build):**

| Visual | Story |
|---|---|
| Bento "Phân công theo kỹ năng" | Một barista mới rơi vào ô trống, điểm khớp PhoBERT đếm từ 0 lên 94.2%, các ứng viên khác lùi lại một bậc |
| Bento "Đối soát két tiền mặt" | Con trỏ quét từng dòng, dòng lệch 20.000₫ sáng lên, số chênh lệch đếm từ 0 |
| Bento "Tra cứu chính sách" | Prompt gõ từng ký tự, 3 chip nguồn hiện dần, câu trả lời resolve từ blur 6px |
| Bento "Phân ca 24H" | Một ca trượt từ cột "Chờ" sang cột "Đã giao", badge đổi trạng thái |
| Hero mockup CRM | Row 45 chi nhánh cuộn chậm trong clip, dừng ở dòng thiếu người, cột "Đúng giờ" rút xuống 93% |

**Ràng buộc:** mọi story bắt đầu và kết thúc đúng frame thiết kế; chỉ `transform`/`opacity`/`filter`/`clip-path`;
blur động ≤14px; `prefers-reduced-motion: reduce` render still frame.

## 6. Ba quyết định cần chốt (đã có khuyến nghị)

| # | Vấn đề | Khuyến nghị | Vì sao |
|---|---|---|---|
| D1 | Tailwind bundle tĩnh vs build thật | **Cài `tailwindcss@4` + `@tailwindcss/vite`, xoá bundle tĩnh** | 61 class đang render không style. Không sửa gốc thì mọi phase sau là trang trí trên nền gãy. |
| D2 | Test assert glass + gradient trên KPI card | **Cập nhật test thành behavioral** (đo contrast, đo tabular, đo không overflow) | Đây là style snapshot của một quyết định đã bị đảo; giữ nó thì không thể implement dealt sheet. |
| D3 | `index.css` 1.204 dòng, 106 `!important` | **Xoá, thay bằng `src/styles/{tokens,base,product,brand}.css`** | Override war với bundle tĩnh; khi có build thật thì lớp này vô nghĩa và chỉ gây drift. |

Chi tiết: `decisions/ADR-020-tailwind-v4-real-build.md`, `decisions/ADR-021-test-style-snapshot-to-behavioral.md`.
