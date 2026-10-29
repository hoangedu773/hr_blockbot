# Nghiên cứu UX/Motion cho Guta Workspace

Ngày: 25/10/2026. Phạm vi: benchmark sản phẩm và motion, rà soát năm file frontend yêu cầu cùng `docs/10-ui-ux-spec.md`, `docs/DESIGN.md`, `docs/README.md`; đầu ra đề xuất, không sửa code/docs.

## Kết luận

Xếp hạng hướng tham khảo: **1) Apple + Emil Kowalski cho motion; 2) Linear/Raycast cho hành động nhanh; 3) ChatGPT cho khởi đầu hội thoại; 4) Vercel/Supabase/Stripe cho dữ liệu dày**. Không sao chép giao diện hay cài motion framework. App dùng React 18/Vite và CSS sẵn có; giữ CSS custom-property hiện tại, thêm lượng CSS tối thiểu cho motion token. Ưu tiên session hợp lệ vào thẳng **Chat Copilot**; CRM vẫn truy cập một thao tác qua tab hoặc split view. Landing chỉ dành cho chưa có session.

Phát hiện quan trọng: app **đã có** CRM/Chat switching và nhiều hiệu ứng CSS, nhưng mặc định dashboard là CRM và hiệu ứng chưa thống nhất; reduced-motion rule đã có trong `index.css`. Login hiện lưu local user vào `sessionStorage`, khởi tạo từ session nên refresh cùng tab có thể vào thẳng dashboard; song không xác minh session thực tế, tab mới không kế thừa sessionStorage. Không gọi đây là authenticated auto-login cho đến khi auth cookie/session validate được. Thiết kế splash không được trì hoãn dashboard tùy ý: chỉ phủ thời gian auth/session bootstrap; lỗi/timeout phải hiện actionable fallback.

## Hiện trạng và UX bottlenecks

| Khu vực | Hiện trạng đọc được | Nghẽn / rủi ro | Ưu tiên |
|---|---|---|---|
| `App.tsx` | `localUser` đọc từ `sessionStorage`; `activeTab` mặc định `crm`; chỉ `authUser` đồng bộ nếu đã có `guta_user` trong sessionStorage. | Khởi tạo trực tiếp bằng local mock user có thể bỏ qua xác thực; first view là bảng CRM. Auth bootstrap/loading state chưa thấy. | P0: định nghĩa session thật, khởi tạo trạng thái loading rồi chọn chat-first khi hợp lệ. |
| `FolioLandingView.tsx` | HTML tĩnh nhúng bằng `dangerouslySetInnerHTML`; navbar `fixed`, nhưng JS chỉ mở/đóng menu; không có listener scroll/shrink trong component. Motion phụ thuộc CSS assets ngoài. | Navbar không co theo scroll trong component; rủi ro animation/accessibility khó audit vì markup/CSS tách. | P1: sticky/shrink đơn giản qua CSS + scroll state nhỏ nếu CSS sticky không đủ. |
| `CrmDashboardView.tsx` | CRM là tab mặc định; drawer/backdrop, hover/active, skeleton có sẵn; React effect bind DOM listeners thủ công. | Drawer dùng utility `duration-200`, global CSS overrides duration 250ms; không có entry stagger; layout data-first; listeners implementation imperatively coupled. | P1: chuẩn hóa duration/easing ở `index.css`; tránh refactor component boundaries không cần thiết. |
| `ChatPageView.tsx` | Chat là view độc lập, tự scroll/focus; transition sang CRM remount view và mất trạng thái cục bộ. | Chuyển tab mất chat context/state; CSS transitions thiếu nhất quán; chat chưa làm first view. | P0/P1: ưu tiên chat first; nếu tab switching quan trọng, giữ state bằng mounted/inert view hoặc state lift chỉ khi yêu cầu giữ hội thoại được xác nhận. |
| `index.css` | Tokens `--ease-spring: cubic-bezier(0.16,1,0.3,1)`, `--duration-fast:150ms`, `--duration-normal:250ms`; CRM drawer easing `cubic-bezier(0.23,1,0.32,1)`; reduced-motion rule đã có. | Hai easing cạnh tranh; `.shift-pill-block` dùng `transition: all`; animation skeleton infinite; một số motion selectors không đồng nhất. | P1: tokens một nguồn, chỉ transition transform/opacity/colors cần thiết; reduced motion ngừng pulse/skeleton sweep. |

### Chuẩn và trade-off benchmark

| Hạng | Tham khảo | Áp dụng cho Guta | Trade-off / adoption risk |
|---:|---|---|---|
| 1 | Apple HIG Motion + Emil Kowalski | Motion có mục đích, ngắn, interruptible; drawer có không gian/identity; reduce motion chuyển cross-fade/instant. CSS motion theo transform/opacity để tránh layout/paint nặng. | Apple HIG chính thức, ổn định nhưng hướng native; không lấy SwiftUI spring làm thông số web nguyên xi. Emil là tác giả thực hành, không phải chuẩn normative; exact reference truy cập được hạn chế, không chép thông số chưa xác minh. |
| 2 | Linear + Raycast | Command/action-first navigation; chat/copilot trở thành action center, CRM là view context rõ ràng, quick switch/keyboard action. | Product observation chứ không phải public UI spec; Linear/Raycast thay đổi thường xuyên, không sao chép shortcut/keybind hay sản phẩm. |
| 3 | ChatGPT/OpenAI | Chat-first onboarding, prompt starters, composer trung tâm; context panel khi cần. | OpenAI site không truy xuất được trong lượt nghiên cứu; benchmark dựa trên mô hình tương tác phổ biến, không kết luận chi tiết implementation. AI có thể tạo kỳ vọng chức năng vượt demo. |
| 4 | Vercel Geist + Supabase | Typography rõ, semantic tokens, pattern cho table/filter/metric; phù hợp CRM đông dữ liệu. | Geist có hệ thống/tokens nhưng không cung cấp spec motion cụ thể; Supabase design-system index xác nhận pattern navigation/table/charts/metric nhưng thiếu animation data. Không cần thêm dependency. |
| 5 | Stripe Dashboard | Tham khảo mật độ dữ liệu, hierarchy, operation/status. | Stripe docs UI URL thử nghiệm 404; thiếu nguồn chính thức truy xuất được trong phạm vi này, nên không dùng làm căn cứ motion hoặc khẳng định chi tiết. |

**Trade-off giải pháp motion:** CSS-only tokens (hạng 1): hiệu năng/chi phí tốt, dependency bằng 0, bảo trì thấp; đạt đủ nhu cầu. Framer Motion (hạng 2): orchestration/spring chính xác và layout transitions linh hoạt hơn, nhưng tăng bundle, dependency, conventions; không phù hợp khi chỉ cần splash, drawer, tab fade. Web Animations API (hạng 3): native, imperative control; phù hợp khi CSS không thể điều khiển lifecycle, nhưng tăng JS/lifecycle. Khuyến nghị CSS-only trước; nâng cấp khi có yêu cầu gesture/layout choreography và đo chứng minh CSS không đáp ứng.

## Đề xuất kiến trúc và motion tokens

Không dựng thêm motion framework/component chung cho vài transition. `index.css` là nguồn token chung; component sở hữu trạng thái, `App.tsx` sở hữu luồng session/tab. Giữ `CrmDashboardView` và `ChatPageView` boundaries hiện hữu. `FolioLandingView` giữ landing/nav behavior, CSS của Folio cần nằm cùng stylesheet đang quản lý giao diện Folio.

| Token đề xuất | Giá trị gợi ý | Dùng |
|---|---|---|
| `--motion-ease-standard` | `cubic-bezier(0.23, 1, 0.32, 1)` | drawer, tabs, reveal; chọn một curve thay xung đột `.16,1,.3,1`. |
| `--motion-fast` | `140ms` | hover/focus/press color. |
| `--motion-base` | `220ms` | tab cross-fade, card entry. |
| `--motion-panel` | `280ms` | drawer/overlay entry; không block interaction. |
| `--motion-stagger-step` | `35ms` | tối đa vài nhóm KPI, không stagger từng hàng bảng. |
| `--motion-distance-sm` | `8px` | fade-up entry / panel offset. |

Keyframes/classes: `guta-splash-in` logo scale `0.94→1` + opacity, `guta-splash-out` overlay opacity-only; `guta-view-enter` opacity + translateY(8px→0); drawer uses translateX only; buttons use `:active` slight translate/scale only where it does not change layout. Avoid animating height, width, padding, blur, `transition: all`. “Spring” in CSS is easing approximation, not physical spring simulation; no need to promise physics spring. Card hover lift only on `hover:hover` pointer fine, max 2px and no hover lift on touch. Stagger only KPI group, not 45 table rows.

Reduced motion: `@media (prefers-reduced-motion: reduce)` disable pulsing/scaling/translation and infinite skeleton sweep; keep state changes via instant visibility/color or short opacity dissolve. Respect system preference without JS. Ensure splash cannot hold user on a moving screen; fallback content visible if load stalled.

Palette: maintain Zero-Yellow and avoid adding saturated blue surfaces. Sapphire remains semantic focus/primary, not ambient glow. Use neutral obsidian/slate, contrast and borders by tokens. Frosted glass selectively on header/drawer only: `rgba(..., .8)` + blur; solid opaque fallback, avoid layering blur across large table viewport due paint cost/readability.

## Flow đề xuất

1. App bootstrap queries existing auth/session authority. `loading` renders branded splash with `/assets/logos/guta-mark-pure.svg`; on valid session transition to Copilot. Session validation failure clears stale state, lands on Folio/login. No fake localStorage token-as-auth.
2. On valid login, `activeTab='chat'`; Chat first view includes operational prompts and a visible quick switch “Chi nhánh”. On switching, present table view through current CRM component; desktop split view is optional only if viewport/panel usability proves it, not required to meet the Chat-first outcome.
3. Tab transition cross-fade with short opacity/translate; avoid current unmount state loss if retaining conversation is part of acceptance. Define persistence acceptance first; do not add storage or chat history API speculatively.
4. Landing nav sticky. At `scrollY > 20px`, reduce vertical padding, add translucent neutral surface/border/shadow; retain stable nav geometry as much as possible to avoid CLS. `position: sticky` plus class toggle preferred over changing fixed nav height dramatically.

## Docs cần cập nhật sau khi code được duyệt

### `docs/10-ui-ux-spec.md`

- Sửa §0/§3/§5.3 để phản ánh code thực tế: Folio landing + auth modal; authenticated entry Chat-first; CRM branch table là alternate view; xóa mô tả dashboard routes/Employee/Admin schema không còn tương ứng chỉ khi domain owner xác nhận scope mismatch.
- §10 hiện motion abstract, duration `TBD`, không nêu splash, chat-first, sticky nav, transition inventory. Bổ sung token table, transition inventory, reduced-motion behavior, no layout animation, perf/fallback, measurable acceptance.
- §8 accessibility đã checklist reduced motion nhưng nội dung cũ ghi “chưa có màn hình nào được code” — lỗi thời, cập nhật trạng thái audit chính xác sau test.
- §11 gates ghi scaffold `apps/web` chưa tồn tại; giờ app đã có. Chỉ thay sau khi kiểm tra scripts thật; không tuyên bố gate CI nếu chưa chạy được.

### `docs/DESIGN.md`

- §4.1 flow hiện ghi Landing → modal → CRM; cập nhật session-return → splash ngắn → Copilot, first-run landing/login, CRM quick switch.
- §4.2 token hiện có Zero-Yellow nhưng mô tả accent xanh dương khá dày; quy định Sapphire là semantic accent, surfaces neutral. Thêm motion tokens và frosted header fallback.
- §1 catalogue “top 6”, superlatives (“lớn nhất”, “số 1 thế giới”, “tỷ lệ vàng”) thiếu chứng cứ/nhanh lỗi thời; đổi thành ranked source table có credibility, fit, tradeoff, review date, hoặc bỏ nếu không còn dẫn đường thiết kế.
- Remove dead preview paths only after checking files exist; currently DESIGN links `apps/web/previews/...` and root preview paths mixed.

### `docs/README.md`

- Frontend reading path ghi ChatDrawer/old architecture; cập nhật `ChatPageView.tsx`, `App.tsx`, CSS owner, new §10 motion and link to motion decisions. Its project plan links may be stale; verify before editing.

## File ownership sau khi giao implementation

| File | Owner | Chạm khi | Lưu ý |
|---|---|---|---|
| `apps/web/src/App.tsx` | app shell/auth owner | bootstrap session, initial tab, view transition/lifecycle | Auth owner xác minh semantics; không coi `sessionStorage.guta_user` là credential. |
| `apps/web/src/components/FolioLandingView.tsx` | landing owner | shrink class/state, login entry | HTML đang stringified, listener teardown phải chuẩn. |
| `apps/web/src/components/CrmDashboardView.tsx` | CRM owner | drawer easing, switch affordance nếu hiện tại cần | Không làm rework table. |
| `apps/web/src/components/chat/ChatPageView.tsx` | chat owner | chat-first visual transition/state retention | Inline style block hiện riêng, đồng bộ token bằng custom properties. |
| `apps/web/src/index.css` | design system owner | shared tokens, motion/reduced-motion, CRM/landing cross-cutting | Đây là owner chính của global CSS; tránh tạo token trùng component. |
| `docs/10-ui-ux-spec.md`, `docs/DESIGN.md`, `docs/README.md` | docs owner sau behavior chốt | spec/navigation cập nhật hậu code | Chỉ ghi hành vi đã implement/test. |

## Kiểm thử đo được / acceptance

- **Session:** valid persisted auth session mở `/` vào dashboard; invalid/expired session vào landing/login; no credential không vào dashboard. Session init không hiện landing nháy trước dashboard. Test cùng tab và tab mới theo auth contract.
- **First view:** sau auth success, `data-testid=chat-page` visible và CRM table không visible; một thao tác đưa tới chi nhánh; chat draft/messages không mất nếu acceptance xác nhận retention.
- **Splash:** dùng logo asset chính xác; chỉ xuất hiện khi bootstrap pending; success transition tổng thời gian tối đa 500ms sau khi session resolved, không fixed wait; error/rejection không bị kẹt.
- **Reduced motion:** emulation `prefers-reduced-motion: reduce` bỏ scale/translate/pulse/infinite skeleton animation; app flow vẫn có thể thao tác.
- **Motion:** drawer 180–300ms; transition property chỉ transform/opacity/background/border-color; no layout shift; tab click feedback ngay; reduced-motion path instant/fade-only.
- **Landing header:** scroll 0px initial state, at 21px compact state; nav remains visible; nav transition không đổi document content height/CLS đáng kể; keyboard focus visible.
- **Performance:** run Lighthouse/mobile route checks; CLS ≤ 0.1, LCP <2.5s, INP <200ms mục tiêu existing spec (phân biệt lab vs field). Profile 45 rows; no stagger-per-row, no repeated long-running animation. Không thêm dependency.
- **Visual/accessibility:** desktop/mobile 320px/768px/1280px; keyboard nav, focus, contrast, 44px targets; test blur disabled fallback in unsupported browser.

## Rà soát docs rác / stale / duplicate

**Không xóa gì từ research này.** `docs/README.md` là navigation authority nhưng nội dung nói 34 stores/2,456 staff trong khi CLAUDE/docs khác nói 45 branches; cần owner phân xử, không tự sửa số.

| Mức | Tài liệu | Quan sát | Đề xuất an toàn |
|---|---|---|---|
| P0 kiểm tra provenance | `docs/DevinUserSetup-x64-3.10.23.exe` | executable installer, không được nội dung docs trỏ tới; binary lớn/khó review, không phải tài liệu sản phẩm. | Xác nhận ai dùng/được phép tải về; nếu không phải dependency hợp lệ, remove khỏi git, ghi setup URL/hướng dẫn thay thế. Không xóa trước consent/usage check. |
| P1 lưu trữ | `docs/KLCN133_TranVietHung.docx` | nguồn đề cương được `00-vision-scope.md`, `RESEARCH-PLAN.md` trỏ đến; không phải file rác. | Giữ nếu quyền phân phối/nguồn hợp lệ; nếu cần bỏ binary khỏi Git, thay bằng tài liệu đã trích dẫn có kiểm soát + nguồn lưu trữ, cập nhật mọi link trước. |
| P1 kiểm tra path | `docs/DESIGN.md` | ghi `apps/web/previews/...`, `apps/web/public/...` và root `previews/...` trộn lẫn; có thể link stale. | Kiểm tra existence và sửa links; nội dung gallery copy-paste đang mâu thuẫn “mẫu để chọn” với quyết định design đã chốt. |
| P1 archive candidate | `docs/16-project-plan.md`, `docs/research/RESEARCH-PLAN.md`, `docs/research/B0-worksheet.md` | kế hoạch 12 tuần/B0 có khả năng historical; README nói timeline trễ và roadmap mới ở docs/20. | Không xóa hồ sơ nghiên cứu/academic trace. Đánh dấu historical/superseded, liên kết plan đang hiệu lực sau owner xác nhận. |
| P1 drift | `docs/00-vision-scope.md`, `docs/README.md`, `docs/10-ui-ux-spec.md`, `docs/DESIGN.md`, `docs/AGENT-GUIDELINES.md` | references về no code, vai Admin/Employee, 34/45 branches, worktree/main và thực tế app không đồng nhất. | Batch consistency audit trước khi cleanup. Giữ scope/legal/architecture decisions, không hợp nhất tùy tiện. |
| P2 duplicates | `docs/database-design.md` và `docs/05-data-model.md`; `docs/21-chatbot-architecture.md` và `docs/02-architecture.md`; `docs/22-erd-overall.md` và diagrams | có khả năng overlap; tên alone không chứng minh duplicate. | Chọn canonical owner cho schema/architecture, giữ tài liệu domain-specific, cross-link và gỡ bản sao chỉ sau diff nội dung. |
| P2 artifacts | `docs/diagrams/rag-architecture.{json,html,svg}` | cùng basename, có thể ba source/render formats. | Xác định source-of-truth và generation command; giữ source + generated output cần thiết, không gọi là rác chỉ vì nhiều định dạng. |

Dọn docs nên tách commit sau behavior acceptance; không sửa binary, không xóa plan/history, không đụng worktree artifacts trong task nghiên cứu.

## Nguồn, credibility và giới hạn

Nguồn trực tiếp/official: Apple Human Interface Guidelines Motion (official, normative; https://developer.apple.com/design/human-interface-guidelines/motion); MDN `prefers-reduced-motion` (reference chuẩn web; https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion); web.dev animation guide (Google web platform performance guidance; https://web.dev/articles/animations-guide); Vercel Geist (official design system; https://vercel.com/geist/introduction); Supabase design-system docs (official pattern index; https://supabase.com/design-system); Raycast product site (primary product source; https://raycast.com/); Linear method (primary, nhưng không phải technical motion spec; https://linear.app/method).

Ba nguồn độc lập xác nhận nguyên tắc cốt lõi: Apple nhấn mạnh purpose/interruption/Reduce Motion; MDN mô tả system preference; web.dev khuyến nghị transform/opacity để giảm layout/paint. Nguồn source mạnh cho motion hơn các screenshot benchmark. Emil Kowalski URL được thử nhưng trả 404; không dùng thông số được gán cho ông làm chứng cứ. OpenAI 403, Stripe docs 404; các benchmark đó chỉ là UX inference. Không có production case study hoặc đo performance trực tiếp trên app. Không kiểm tra toàn bộ docs links, repo dependency/scripts, CSS assets Folio, hay phiên auth thật; cần thực hiện trong implementation/docs phase.

## Câu hỏi còn mở

1. Auto-login phải dựa auth cookie/session thật hay demo `sessionStorage` được giữ? Owner auth xác nhận nguồn truth.
2. Chat/CRM quick switch phải retain hội thoại khi remount không? Yêu cầu không nói rõ; xác nhận trước khi giữ hai view mounted hoặc lift state.
3. Có chủ ý giữ splash cho tất cả lần mở, hay chỉ session bootstrap dài hơn ngưỡng thấy được? Khuyến nghị chỉ hiển thị lúc pending.
4. Installer `.exe` và tài liệu đề cương `.docx` có yêu cầu lưu trong git/compliance không?
5. Số chi nhánh / số nhân sự truth là 45 hay 34? Cần domain owner giải quyết discrepancy.
