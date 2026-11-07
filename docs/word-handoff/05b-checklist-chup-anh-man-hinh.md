# BẢNG CHECKLIST HƯỚNG DẪN CHỤP ẢNH MÀN HÌNH MINH HỌA
## Dành cho sinh viên tự thực hiện chụp ảnh thực tế đưa vào Báo cáo Khóa luận

---

## 1. Hướng dẫn thiết lập môi trường để chụp ảnh
*Nguồn: docs/baseline-development.md:11-33, package.json:7-16*

Sinh viên cần chuẩn bị môi trường máy cá nhân và chạy các dịch vụ ở chế độ cục bộ (Local Development) theo quy trình dưới đây trước khi thực hiện chụp ảnh màn hình:

### 1.1. Các bước khởi động hệ thống
Mở 3 cửa sổ terminal riêng biệt từ thư mục gốc của dự án (`C:/work-space/hr-blockbot-f4`):

```powershell
# Cửa sổ 1: Khởi động Backend API Express.js (Lắng nghe tại http://localhost:3001)
pnpm --filter api dev

# Cửa sổ 2: Khởi động AI Service FastAPI (Lắng nghe tại http://localhost:8000)
cd apps/ai-service
.venv-authz-v1/Scripts/python.exe start.py

# Cửa sổ 3: Khởi động Frontend Web React 18 SPA (Truy cập tại http://localhost:5173)
pnpm --filter web dev
```

*Lưu ý quan trọng:*
- Không tự ý sửa đổi file `.env` hoặc đưa thông tin nhạy cảm lên mã nguồn.
- Đảm bảo kết nối mạng ổn định để giao diện tải đủ font chữ hệ thống Geist và bộ biểu tượng SVG.

### 1.2. Chuẩn hóa thiết lập trình duyệt khi chụp ảnh
- **Trình duyệt khuyến nghị:** Google Chrome hoặc Microsoft Edge (phiên bản mới nhất).
- **Độ phân giải màn hình chuẩn:** $1920 \times 1080$ (Full HD) hoặc tối thiểu $1440 \times 900$.
- **Mức độ thu phóng (Zoom level):** $100\%$ chuẩn, không phóng to/thu nhỏ làm vỡ bố cục thiết kế.
- **Tỷ lệ khung hình:** Ưu tiên chụp toàn bộ vùng nội dung chính (phần sidebar + content inset) hoặc hộp thoại modal căn giữa màn hình.
- **Định dạng file lưu trữ:** Đặt tên dạng PNG không nén (Lossless) để văn bản và các chỉ số tài chính hiển thị sắc nét khi in ấn hoặc xuất PDF Word.

---

## 2. Danh mục tài khoản kiểm thử & Phân quyền truy cập
*Nguồn: apps/api/src/services/authorization-policy.service.ts:8-10, apps/api/scripts/provision-accounts.mjs*

Hệ thống phân quyền theo chuẩn **Authorization V1** với 9 profile nghiệp vụ. Khi chụp ảnh các chức năng tương ứng, sinh viên cần đăng nhập đúng loại tài khoản có thẩm quyền để hiển thị đầy đủ các nút bấm và dữ liệu:

**Bảng 5b.1: Bảng danh mục vai trò và tài khoản đề xuất khi chụp ảnh màn hình**

| Nhóm Profile V1 | Mã vai trò | Mục đích chụp ảnh | Dữ liệu & Màn hình hiển thị phù hợp |
| :--- | :--- | :--- | :--- |
| `system_admin` | Quản trị kỹ thuật | Quản trị tài khoản, danh mục phân quyền, cấu hình hệ thống | Màn hình Quản trị tài khoản (`UserAccountsView`), Cài đặt LLM (`AdminSettingsView`) |
| `hr` | Quản lý Nhân sự tổng | Hồ sơ nhân viên toàn chuỗi, tiếp nhận nhân sự, phê duyệt vòng đời | Màn hình Danh sách nhân sự (`EmployeeListView`), Tiếp nhận nhân viên (`OnboardingView`) |
| `am` / `om` | Quản lý Khu vực / Vận hành | Chỉ tiêu KPI doanh thu khu vực, đối soát bán hàng chuỗi | Màn hình KPI doanh thu (`RevenueKpiView`), Báo cáo bán hàng (`SalesReportView`) |
| `sm` | Cửa hàng trưởng | Xếp lịch ca tuần, phân công việc F4, duyệt nghiệm thu, lịch hẹn | Màn hình Xếp lịch ca (`SchedulingView`), Phân công (`AssignmentPanel`), Lịch hẹn (`SmAppointments`) |
| `staff` / `ptch` | Barista / Trưởng ca | Xem hồ sơ cá nhân, đăng ký ca làm việc, nộp báo cáo, chat AI | Màn hình Hồ sơ của tôi (`EmployeeProfileView`), Đăng ký ca, Chatbot (`ChatPageView`) |

*Quy tắc đăng nhập:*
- `username`: Mã nhân viên định dạng chữ thường (ví dụ: `gt-ch18030009`, `gt-vp1610002` hoặc tài khoản `admin`).
- `password`: Mật khẩu tài khoản đã được cấp phát hoặc thiết lập sau bước đổi mật khẩu lần đầu.

---

## 3. Bảng Checklist chi tiết các ảnh chụp màn hình minh họa

Dưới đây là danh sách đầy đủ 22 ảnh chụp màn hình cần thực hiện, được ánh xạ chính xác vào các mục và hình minh họa trong **Chương 5** của báo cáo:

**Bảng 5b.2: Bảng checklist chi tiết các ảnh chụp màn hình cho Báo cáo Khóa luận**

| STT | Tên ảnh chụp | Đường dẫn Route / Giao diện UI | Vai trò / Tài khoản đề xuất | Dữ liệu và trạng thái cần hiển thị trên màn hình | Vị trí Chương / Hình minh họa trong Word |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 01 | Giao diện đăng nhập hệ thống | `http://localhost:5173` (Bấm nút "Đăng Nhập" góc phải trên Landing Page để mở `AccountLoginModal`) | Khách vãng lai (Chưa đăng nhập) | Modal đăng nhập nền tối, viền Electric Sapphire, gồm 2 trường nhập: Mã nhân viên (`username`) và Mật khẩu (`password`), nút "Đăng Nhập". | **Hình 5.2: Giao diện đăng nhập hệ thống Guta Workspace** |
| 02 | Cơ chế đăng xuất an toàn | `http://localhost:5173` (CRM Dashboard, click vào biểu tượng Log Out tại góc dưới Sidebar) | Tài khoản bất kỳ đã đăng nhập | Thanh Userbar hiển thị tên nhân viên, icon Log Out màu đỏ và Toast thông báo nổi: "Đã đăng xuất phiên làm việc an toàn". | **Hình 5.3: Giao diện và cơ chế đăng xuất an toàn thu hồi phiên làm việc** |
| 03 | Đổi mật khẩu bắt buộc lần đầu | Modal `ChangePasswordModal` tự động bật chặn màn hình khi tài khoản có cờ `mustChangePassword` | Nhân viên đăng nhập lần đầu | Hộp thoại thông báo tài khoản đang dùng mật khẩu tạm, gồm 3 ô nhập: Mật khẩu hiện tại, Mật khẩu mới (tối thiểu 8 ký tự), Xác nhận mật khẩu mới. | **Hình 5.4: Giao diện đổi mật khẩu tạm bắt buộc ở lần đăng nhập đầu tiên** |
| 04 | Khôi phục mật khẩu một lần | `http://localhost:5173/#recover=<token_hop_le>` (Màn hình `ActivationView`) | Nhân viên nhận liên kết phục hồi | Tiêu đề "Khôi phục mật khẩu", hướng dẫn bảo mật không chia sẻ liên kết, 2 ô nhập mật khẩu mới tối thiểu 12 ký tự, nút "Thiết lập mật khẩu". | **Hình 5.5: Giao diện thiết lập lại mật khẩu qua liên kết bảo mật một lần** |
| 05 | Quản trị tài khoản & Profile V1 | CRM Dashboard -> Tab Vận hành -> "Tài khoản" (`UserAccountsView`) | `system_admin` (Quản trị viên) | Bảng danh sách tài khoản người dùng, hiển thị cột Mã nhân viên, Role, Profile V1 (`system_admin`, `sm`, `staff`...), Trạng thái kích hoạt. | **Hình 5.6: Giao diện quản lý tài khoản và phân quyền người dùng Authorization V1** |
| 06 | Quy trình xác thực hoàn tất | CRM Dashboard sau khi đăng nhập thành công | `sm` (Cửa hàng trưởng) hoặc `staff` | Toast màu xanh thông báo "Bạn đã đăng nhập vào Guta Workspace", giao diện làm việc chuyển từ Brand Register sang Product Register. | **Hình 5.7: Thực thi quy trình xác thực và quản lý phiên người dùng (UC01)** |
| 07 | Hồ sơ nhân sự & Cấp bậc F1 | CRM Dashboard -> Tab Vận hành -> "Nhân sự" (`EmployeeListView`) và "Hồ sơ của tôi" (`EmployeeProfileView`) | `hr` hoặc `sm` | Bảng nhân sự hiển thị họ tên, chức danh, cấp bậc (Intern đến Lead), danh sách kỹ năng được gắn thẻ badge chuyên nghiệp. | **Hình 5.8: Màn hình quản lý hồ sơ nhân sự và phân bổ cấp bậc F1 (UC02)** |
| 08 | Ủy quyền nghiệp vụ tạm thời | CRM Dashboard -> Tab Vận hành -> "Ủy quyền nghiệp vụ" (`DelegationView`) | `sm` (Cửa hàng trưởng) | Danh sách các quyết định ủy quyền đang hiệu lực, người được ủy quyền (PTCH), phạm vi quyền hạn và người duyệt độc lập (AM/OM). | **Hình 5.9: Giao diện quản trị tài khoản và cơ chế ủy quyền nghiệp vụ (UC03)** |
| 09 | Quản lý đề tài & Vòng đời F2 | CRM Dashboard -> Tab Vận hành -> "Công việc & nghiệm thu" (`ProjectListView`) | `sm` hoặc `staff` | Bảng danh sách công việc theo máy trạng thái: DRAFT, ASSIGNED, IN_PROGRESS, PENDING_REVIEW, COMPLETED kèm thanh tiến độ hoàn thành. | **Hình 5.10: Quản lý tiến độ công việc theo vòng đời trạng thái F2 (UC04)** |
| 10 | Gợi ý ứng viên thông minh F4 | Chi tiết công việc -> Bấm "Giao việc" -> Mở `AssignmentPanel` & `CandidateSuggestions` | `sm` (Cửa hàng trưởng) | Bảng Top 10 ứng viên được gợi ý bởi thuật toán: Cột tỷ lệ khớp kỹ năng, điểm phù hợp, số nhiệm vụ đang đảm nhận (active load). | **Hình 5.11: Giao diện gợi ý ứng viên thông minh và phân công nhiệm vụ F4 (UC05)** |
| 11 | Tiếp nhận, từ chối & bàn giao | Trong `AssignmentPanel` của nhân sự được phân công | `staff` (Nhân viên được giao việc) | Các nút hành động nghiệp vụ ADR-021: Nút "Tiếp nhận", nút "Từ chối" kèm form nhập lý do, nút "Yêu cầu bàn giao" cho đồng nghiệp khác. | **Hình 5.12: Quy trình tiếp nhận, từ chối và bàn giao công việc ADR-021 (UC06)** |
| 12 | Nộp báo cáo & Duyệt nghiệm thu | Tab "Công việc & nghiệm thu" -> Chi tiết công việc `TaskDetailView` | `staff` (Nộp) & `sm` (Duyệt) | Form nộp nội dung báo cáo tiến độ kèm đính kèm liên kết tài liệu; Giao diện quản lý bấm nút "Duyệt nghiệm thu" hoặc "Yêu cầu bổ sung". | **Hình 5.13: Giao diện nộp báo cáo tiến độ và duyệt nghiệm thu F7 (UC07)** |
| 13 | Chatbot hỏi đáp chính sách RAG | Chuyển sang Tab "Chat" trên thanh điều hướng hoặc mở `ChatPageView` | `staff` hoặc `sm` | Khung hội thoại AI: Người dùng hỏi quy định kỷ luật/chính sách, Guta AI trả lời có khung Căn cứ quy định (Citations: văn bản, điều, khoản). | **Hình 5.14: Giao diện Chatbot tra cứu chính sách nhân sự tích hợp RAG F3 (UC08)** |
| 14 | Chatbot Preview-Confirm KPI | Khung chat AI, hỏi: "Đề xuất mở kỳ KPI doanh thu tháng 11" | `am` (Quản lý khu vực) hoặc `sm` | Thẻ tương tác `RevenueKpiOpenCard` xuất hiện trong khung chat, hiển thị bảng xem trước chỉ tiêu, gồm nút "Xác nhận thực hiện" và "Hủy". | **Hình 5.15: Quy trình Chatbot đề xuất và xác nhận ghi nhận KPI (Preview-Confirm) (UC09)** |
| 15 | Đánh giá KPI hiệu suất F5 | CRM Dashboard -> Tab Vận hành -> "KPI hiệu suất" (`PerformanceKpiView`) | `sm` hoặc `staff` | Bảng chấm điểm KPI theo tiêu chí, so sánh điểm tự đánh giá và điểm quản lý chấm, khung AI tóm tắt nhận xét định tính của nhân viên. | **Hình 5.16: Giao diện đánh giá hiệu suất nhân viên và phân tích nhận xét F5 (UC10)** |
| 16 | Theo dõi KPI doanh thu chi nhánh | CRM Dashboard -> Tab Vận hành -> "KPI doanh thu" (`RevenueKpiView`) | `sm` hoặc `am` | Biểu đồ/bảng chỉ tiêu doanh thu kỳ hiện tại, doanh số thực tế đồng bộ từ POS, tỷ lệ đạt chỉ tiêu và phân bổ doanh số theo ca trực. | **Hình 5.17: Quản lý chỉ tiêu và theo dõi KPI doanh thu chuỗi cửa hàng (UC11)** |
| 17 | Xếp lịch ca & Đăng ký ca | CRM Dashboard -> Tab Vận hành -> "Lịch làm & phân ca" (`SchedulingView`) | `sm` (Xếp ca) & `staff` (Đăng ký) | Ma trận phân ca tuần: Ca sáng (06:00 - 14:00), Ca chiều (14:00 - 22:00), danh sách Barista được phân bổ, trạng thái bản lịch ca PUBLISHED. | **Hình 5.18: Giao diện xếp lịch ca làm việc và đăng ký ca trực tuần (UC12)** |
| 18 | Trung tâm điều hành CRM chuỗi | CRM Dashboard -> Tab Vận hành -> "Chi nhánh / Cửa hàng" (`StoreDirectoryView`) | `om` hoặc `am` (Quản lý cấp cao) | Dashboard tổng quan 45 chi nhánh Guta Cafe, bộ lọc theo Quận/Huyện, thẻ số lượng nhân viên trực ca và Slide-over Drawer thông tin chi nhánh. | **Hình 5.19: Bảng điều khiển trung tâm CRM quản trị chuỗi Guta Cafe F6 (UC13)** |
| 19 | Lịch hẹn SM & Nhắc việc | CRM Dashboard -> Drawer chi tiết cửa hàng -> Tab "Lịch hẹn SM" (`StoreSmAppointments`) | `sm` & `staff` | Danh sách các buổi gặp định kỳ 1-1 giữa Cửa hàng trưởng và nhân viên (mục đích, thời gian, địa điểm gặp, trạng thái xác nhận). | **Hình 5.20: Quản lý lịch hẹn làm việc SM và hệ thống thông báo nhắc việc (UC14)** |
| 20 | Thông báo thời gian thực | Góc trên hoặc góc phải màn hình CRM khi có sự kiện mới phát sinh | Mọi tài khoản có phiên | Thanh Toast Container hiển thị thông báo mới: "Lịch làm việc tuần mới đã được phát hành" hoặc "Có nhiệm vụ mới cần tiếp nhận". | **Hình 5.23: Thông báo thời gian thực hiển thị trên giao diện người dùng** |
| 21 | Landing Page tổng quan hệ thống | `http://localhost:5173` (Trang chủ khi chưa đăng nhập) | Khách vãng lai | Toàn cảnh giao diện Folio Landing Page phong cách báo chí (Newsreader Editorial), màu sắc Electric Sapphire, khối Workflow Section. | Dùng làm Hình mở đầu cho phần Giới thiệu giao diện |
| 22 | Drawer thông tin Barista trong ca | CRM Dashboard -> Bấm vào một chi nhánh để mở Slide-over Drawer | `sm` hoặc `om` | Drawer trượt từ bên phải: Danh sách Barista đang trong ca trực hiện tại, thông tin liên hệ, nút gửi cảnh báo Telegram. | Dùng minh họa tính năng Slide-over CRM chuyên sâu |

---

## 4. Hướng dẫn xử lý ảnh và chèn vào Microsoft Word

Để báo cáo đạt điểm tối đa về hình thức và tính chuyên nghiệp theo thang điểm chấm Khóa luận của Khoa Công nghệ Thông tin - Trường Đại học Công Thương TP.HCM (HUIT), sinh viên cần tuân thủ các quy tắc biên tập sau:

1. **Cắt cúp ảnh hợp lý (Cropping):**
   - Loại bỏ các vùng thừa như thanh tác vụ Windows (Taskbar), thanh bookmark của trình duyệt hoặc các tab cá nhân không liên quan.
   - Chỉ giữ lại khung cửa sổ hiển thị của ứng dụng web.
2. **Quy chuẩn kích thước và căn chỉnh trong Word:**
   - Ảnh chụp toàn màn hình: Đặt độ rộng ảnh (Width) trong Word từ $14\,\text{cm}$ đến $16\,\text{cm}$ (vừa vặn lề trang A4 có lề trái 3 cm, lề phải 2 cm).
   - Ảnh chụp modal / hộp thoại nhỏ: Đặt độ rộng từ $8\,\text{cm}$ đến $11\,\text{cm}$.
   - Tất cả các hình ảnh bắt buộc phải được **Căn giữa (Center Align)** trong văn bản.
3. **Quy chuẩn ghi chú thích hình ảnh:**
   - Chú thích hình đặt ngay bên dưới ảnh, in đậm, căn giữa, cỡ chữ 11 hoặc 12 pt.
   - Quy tắc đánh số: `**Hình Chương.SốThứTự: [Tên mô tả hình ảnh]**`. Ví dụ: `**Hình 5.14: Giao diện Chatbot tra cứu chính sách nhân sự tích hợp RAG F3 (UC08)**`.
   - Trong phần lời văn thuyết minh của báo cáo, luôn phải có câu dẫn chiếu tới hình ảnh, ví dụ: *"Quy trình hỏi đáp chính sách nhân sự được minh họa trực quan như trong Hình 5.14 dưới đây..."*.
