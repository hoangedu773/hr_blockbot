# ADR-015 — shadcn/ui + Recharts cho Dashboard nền tối; không Ant Design, không ECharts

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `10-ui-ux-spec.md`, `02-architecture.md` §6 (container `web`),
  `12-performance.md` (ngân sách bundle), `11-quality-testing.md` (Lighthouse budget)

---

## Context

Đề cương bắt Dashboard **nền tối** và biểu đồ **biến động KPI** (F6), và timeline tuần 3 đã nêu tên Recharts.
Ba ràng buộc va vào nhau khi chọn thư viện:

1. Nền tối không phải "đảo màu": token màu phải là semantic (`background`, `foreground`, `card`, `muted`,
   `primary`, `destructive`, `chart-1..5`) thì biểu đồ và bảng mới cùng một hệ thống, chứ không phải mỗi
   component tự đoán màu.
2. Nhóm 3 người / 12 tuần và phần lớn quỹ thời gian phải đổ cho backend + AI (`RESEARCH-PLAN.md` §12 luật 1).
   UI phải là thứ **ghép từ khối có sẵn**, không phải thứ viết từ đầu.
3. Rubric cho "Thiết kế giao diện" 0.5đ — đủ để phải nghiêm túc, không đủ để tự dựng design system riêng.

`NOTES-01.md` §B8 đã so sánh và chốt.

## Decision

**`shadcn/ui` (trên Tailwind) làm hệ nền tảng component, `Recharts` làm tầng biểu đồ.**

Ba nghĩa vụ cụ thể:

1. **Toàn bộ màu đi qua semantic token**, không có mã hex cứng trong component. Dark mode là đổi token,
   không phải sửa view. Đây là điều shadcn cho sẵn (`background`, `foreground`, `card`, `muted`, `primary`,
   `destructive`, `chart-1..5` — §B8).
2. **Component là code của mình, copy vào repo** (mô hình shadcn), không phải dependency black-box. Sửa được
   cho đúng ngữ cảnh HR (bảng đề tài, card KPI, khung chat) mà không phải vật lộn với API của hãng thứ ba.
3. **Biểu đồ chỉ dùng Recharts.** Không kéo thêm một engine biểu đồ thứ hai "cho một loại chart".

Đồng thời ghi công bằng: Ant Design được NOTES-01 thừa nhận là "có dark algorithm/token system tốt".
Loại vì lý do riêng, không vì nó tệ.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **Ant Design** | Token dark tốt, nhưng NOTES-01 ghi "hơi nặng tay nếu nhóm muốn UI có bản sắc riêng". Dashboard quản trị + khung chat tự thiết kế → fighting-the-library tốn hơn phần tiết kiệm; kéo thêm lớp style riêng, đụng ngân sách `size-limit` |
| **ECharts** | §B8: "Không cần ECharts lúc này." Recharts phủ được line/area/bar cho KPI; ECharts mạnh ở dataset lớn và tương tác nâng cao — chưa nằm trong phạm vi |
| **visx** | Toàn quyền kiểm soát nhưng phải tự viết từng layer; cùng quỹ thời gian đó nên đổ vào F4/F5, hai chức năng AI nặng nhất |
| **Tự viết component từ đầu** | Không có token sẵn ⇒ mỗi màn hình một kiểu nền tối; 0.5đ giao diện không đáng công sức đó |

## Consequences

**Điểm mạnh**

- Một nguồn token duy nhất cho text, surface và **màu chuỗi dữ liệu** → kiểm được độ tương phản trên nền tối
  và ràng buộc WCAG AA đã nêu ở `RESEARCH-PLAN.md` §3 B8.
- Recharts khớp trực tiếp với F6: đường biến động KPI theo tuần/tháng, cột tỷ lệ hoàn thành theo phòng ban.
- Component nằm trong repo nên **chặn được vòng phụ thuộc trái bằng `dependency-cruiser`** và đo bundle bằng
  `size-limit` theo route (dashboard vs chat) — đúng luật §11: gate nào cũng có lệnh chạy.
- Cùng tinh thần với ADR-001/011: thứ gì không trả lời một vấn đề có thật trong 12 tuần thì không vào baseline.

**Đánh đổi thật**

- **Recharts đuối khi số điểm dữ liệu lớn.** Với quy mô đồ án (vài chục phòng ban × 12 tuần) thì ổn, nhưng
  nếu sau này phải vẽ hàng nghìn điểm thì phải đổi cả lớp biểu đồ — không rẻ.
- shadcn **không nhận bản vá từ upstream**: copy vào repo nghĩa là nâng cấp thành việc tay. Chấp nhận với
  vòng đời 12 tuần.
- Tailwind cho phép "đi tắt" (`text-white/50`) ngay bên cạnh hệ token. Cần rule lint cấm utility màu trực
  tiếp, ghi ở `15-engineering-conventions.md`; nếu không có rule thì token chỉ là trang trí.
- **Không có con số bundle của Recharts/shadcn trong nguồn** (`[CẦN NGUỒN]`) → cấm ghi KB nào vào báo cáo
  khi chưa tự đo.

## Mở — cần quyết định tiếp

| # | Việc | Chặn bởi |
|---|---|---|
| 1 | Palette dark cụ thể + bảng tương phản từng cặp màu | kết quả B8 (screenshot tham khảo) → `10-ui-ux-spec.md` |
| 2 | Ngân sách KB theo route (dashboard / chat) | phải đo — `12-performance.md` |
| 3 | Danh sách biểu đồ cho F6 | `01-requirements.md` |
| 4 | Rule lint cấm màu hard-code | `15-engineering-conventions.md` |

## References

- `docs/research/NOTES-01.md` §B8 — shadcn semantic CSS variables, dark qua token/theme, Ant Design
  "có dark algorithm/token system tốt nhưng hơi nặng tay", "Không cần ECharts lúc này"
- `docs/research/RESEARCH-PLAN.md` §1 (dashboard nền tối, Recharts trong timeline tuần 3), §3 B8, §11
- `docs/research/NOTES-01.md` §B9 — Core Web Vitals + internal target (ngân sách phải đo, không đoán)
- `docs/02-architecture.md` §6, `docs/10-ui-ux-spec.md`, `docs/12-performance.md`
