# BẢNG TỔNG HỢP VÀ HƯỚNG DẪN KỸ THUẬT CHO NGƯỜI GHÉP TÀI LIỆU WORD
- **Đề tài Khóa luận:** Xây dựng Chatbot chuyển đổi số quản lý nhân sự (Mã đề tài: KLCN133).
- **Đơn vị đào tạo:** Khoa Công nghệ Thông tin — Trường Đại học Công Thương TP.HCM (HUIT).
- **Nhóm sinh viên thực hiện:** Phạm Việt Hoàng, Nguyễn Thái Hòa, Nguyễn Ngọc Phi.
- **Giảng viên hướng dẫn:** ThS. Trần Việt Hùng.
- **Mục đích tài liệu:** Hướng dẫn chi tiết cho thành viên chịu trách nhiệm ghép nối các chương báo cáo thành file Word `.docx` hoàn chỉnh để in ấn và bảo vệ, bao gồm danh mục từ viết tắt chuẩn, checklist định dạng văn bản, quy tắc tự động hóa mục lục/bảng biểu, quy trình kết xuất sơ đồ Mermaid và danh sách tổng hợp các điểm cần chèn ảnh chụp màn hình.

---

## 1. DANH MỤC CÁC KÝ HIỆU VÀ TỪ VIẾT TẮT ĐẦY ĐỦ

- Dưới đây là bảng tổng hợp toàn bộ các thuật ngữ kỹ thuật, ký hiệu viết tắt chuyên ngành Công nghệ thông tin, Quản trị nhân sự và Quy chuẩn pháp lý xuất hiện xuyên suốt 6 chương của khóa luận:

**Bảng 7.1: Danh mục ký hiệu và từ viết tắt trong khóa luận**

| STT | Từ viết tắt | Thuật ngữ đầy đủ (Tiếng Anh / Tiếng Việt) | Giải thích ý nghĩa trong ngữ cảnh đề tài |
|---|---|---|---|
| 1 | **AC** | Acceptance Criteria | Tiêu chí chấp nhận để nghiệm thu một tính năng hoặc kịch bản kiểm thử |
| 2 | **AES** | Advanced Encryption Standard | Chuẩn mã hóa dữ liệu đối xứng (dự án dùng AES-256-GCM bảo vệ API key) |
| 3 | **AI** | Artificial Intelligence | Trí tuệ nhân tạo (phân hệ hỗ trợ tìm kiếm ngữ nghĩa và gợi ý nhân sự) |
| 4 | **AM** | Area Manager | Quản lý khu vực phụ trách cụm nhiều cửa hàng Guta Cafe |
| 5 | **API** | Application Programming Interface | Giao diện lập trình ứng dụng kết nối Frontend, Backend và AI Service |
| 6 | **BLLĐ** | Bộ luật Lao động | Bộ luật Lao động số 45/2019/QH14 của Quốc hội Việt Nam |
| 7 | **BHXH** | Bảo hiểm Xã hội | Chế độ bảo hiểm bắt buộc theo luật lao động cho người lao động |
| 8 | **BHYT** | Bảo hiểm Y tế | Chế độ bảo hiểm chăm sóc sức khỏe người lao động |
| 9 | **BHTN** | Bảo hiểm Thất nghiệp | Chế độ hỗ trợ người lao động khi chấm dứt hợp đồng |
| 10 | **CCCD** | Căn cước công dân | Mã số định danh công dân (thuộc dữ liệu nhạy cảm PII được che giấu) |
| 11 | **CI/CD** | Continuous Integration / Deployment | Tích hợp liên tục và Triển khai tự động phần mềm |
| 12 | **CLO** | Course Learning Outcome | Chuẩn đầu ra môn học / khóa luận theo thang điểm đánh giá của Khoa |
| 13 | **CLS** | Cumulative Layout Shift | Chỉ số đo lường độ ổn định thị giác của giao diện (Core Web Vitals) |
| 14 | **CRM** | Customer / Operations Relationship Mgmt | Hệ thống quản trị vận hành chuỗi cửa hàng Guta Cafe |
| 15 | **CSRF** | Cross-Site Request Forgery | Tấn công giả mạo yêu cầu từ phía người dùng (được phòng chống qua SameSite) |
| 16 | **DTO** | Data Transfer Object | Đối tượng vận chuyển dữ liệu giữa các tầng dịch vụ và mạng |
| 17 | **E2E** | End-to-End | Kiểm thử luồng khép kín từ giao diện người dùng đến cơ sở dữ liệu |
| 18 | **ERD** | Entity Relationship Diagram | Sơ đồ thể hiện mối quan hệ giữa các thực thể dữ liệu |
| 19 | **F&B** | Food and Beverage | Ngành dịch vụ ẩm thực và đồ uống (đặc thù vận hành của chuỗi Guta Cafe) |
| 20 | **FR** | Functional Requirement | Yêu cầu chức năng của hệ thống (từ FR-01 đến FR-14) |
| 21 | **F1–F7** | Feature 1 – Feature 7 | 7 chức năng cốt lõi được định nghĩa trong Đề cương chi tiết khóa luận |
| 22 | **HMAC** | Hash-based Message Authentication Code | Mã xác thực thông điệp dựa trên hàm băm mật mã (dùng cho chữ ký số) |
| 23 | **HR** | Human Resources | Bộ phận / nghiệp vụ quản trị nhân sự doanh nghiệp |
| 24 | **HRM** | Human Resource Management | Hệ thống quản trị nguồn nhân lực |
| 25 | **HUIT** | Ho Chi Minh City University of Industry & Trade | Trường Đại học Công Thương TP. Hồ Chí Minh |
| 26 | **INP** | Interaction to Next Paint | Chỉ số đo lường khả năng phản hồi tương tác giao diện người dùng |
| 27 | **IoT** | Internet of Things | Mạng lưới vạn vật kết nối (dùng trong máy chấm công vân tay, khuôn mặt) |
| 28 | **JWT** | JSON Web Token | Chuẩn mở (RFC 7519) truyền tải thông tin định danh người dùng an toàn |
| 29 | **KPI** | Key Performance Indicator | Chỉ số đánh giá hiệu quả công việc và doanh thu |
| 30 | **LCP** | Largest Contentful Paint | Chỉ số đo lường tốc độ hiển thị phần tử nội dung lớn nhất trên trang |
| 31 | **LLM** | Large Language Model | Mô hình ngôn ngữ lớn (Gemini, DeepSeek, Llama...) phục vụ hỏi đáp |
| 32 | **M0** | MongoDB Atlas Free Tier | Cụm cơ sở dữ liệu đám mây miễn phí giới hạn 512 MB dung lượng |
| 33 | **MRR** | Mean Reciprocal Rank | Chỉ số đánh giá thứ hạng của kết quả đúng đầu tiên trong bài toán xếp hạng |
| 34 | **MVP** | Minimum Viable Product | Sản phẩm khả dụng tối thiểu đáp ứng các yêu cầu cốt lõi |
| 35 | **NCKH** | Nghiên cứu Khoa học | Hoạt động nghiên cứu khoa học của sinh viên theo quy định của Nhà trường |
| 36 | **NDC** | Non-Deterministic Computation | Tính toán bất định (đặc tính của các phản hồi sinh ra từ LLM) |
| 37 | **NFR** | Non-Functional Requirement | Yêu cầu phi chức năng (bảo mật, hiệu năng, tính sẵn sàng) |
| 38 | **OKR** | Objectives and Key Results | Phương pháp quản trị mục tiêu và kết quả then chốt |
| 39 | **OM** | Operations Manager | Giám đốc / Trưởng phòng vận hành chuỗi |
| 40 | **OOM** | Out Of Memory | Lỗi cạn kiệt bộ nhớ RAM trong quá trình vận hành máy chủ |
| 41 | **ORM** | Object-Relational / Document Mapping | Kỹ thuật ánh xạ đối tượng lập trình với cơ sở dữ liệu (Mongoose) |
| 42 | **OT** | Overtime | Làm thêm ngoài giờ theo quy định của Bộ luật Lao động |
| 43 | **PII** | Personally Identifiable Information | Thông tin nhận dạng cá nhân cần bảo vệ (CCCD, SĐT, số tài khoản) |
| 44 | **POS** | Point of Sale | Điểm bán hàng / phần mềm thanh toán thu ngân tại cửa hàng |
| 45 | **PR** | Pull Request | Yêu cầu tích hợp mã nguồn trong quy trình Git workflow |
| 46 | **P@K** | Precision at K | Độ chính xác của $K$ kết quả đầu tiên trong thuật toán tìm kiếm |
| 47 | **RAG** | Retrieval-Augmented Generation | Kỹ thuật tăng cường sinh văn bản bằng truy xuất thông tin ngữ cảnh |
| 48 | **RBAC** | Role-Based Access Control | Mô hình kiểm soát truy cập dựa trên vai trò người dùng |
| 49 | **REST** | Representational State Transfer | Kiểu kiến trúc dịch vụ web truyền tải dữ liệu qua giao thức HTTP |
| 50 | **RFC** | Request for Comments | Chuẩn kỹ thuật chính thức của Tổ chức Kỹ thuật Internet (IETF) |
| 51 | **RTR** | Refresh Token Rotation | Cơ chế xoay vòng Refresh Token tự động để ngăn ngừa tấn công phát lại |
| 52 | **SM** | Store Manager | Cửa hàng trưởng quản lý trực tiếp một chi nhánh Guta Cafe |
| 53 | **SME** | Small and Medium Enterprise | Doanh nghiệp quy mô nhỏ và vừa |
| 54 | **SPA** | Single Page Application | Ứng dụng web một trang được xây dựng trên nền React |
| 55 | **SQL** | Structured Query Language | Ngôn ngữ truy vấn dữ liệu có cấu trúc |
| 56 | **TC** | Test Case | Kịch bản kiểm thử chi tiết chức năng phần mềm |
| 57 | **TNCN** | Thuế Thu nhập Cá nhân | Nghĩa vụ thuế thu nhập cá nhân theo biểu thuế lũy tiến từng phần |
| 58 | **TTL** | Time To Live | Khoảng thời gian tồn tại hợp lệ của token hoặc bản ghi bộ nhớ đệm |
| 59 | **UAT** | User Acceptance Testing | Kiểm thử chấp nhận của người dùng cuối |
| 60 | **UC** | Use Case | Ca sử dụng mô tả tương tác giữa tác nhân và hệ thống (UC01 đến UC14) |
| 61 | **UF** | User Flow | Luồng thao tác của người dùng qua các màn hình giao diện |
| 62 | **UI** | User Interface | Giao diện đồ họa người dùng của ứng dụng |
| 63 | **UX** | User Experience | Trải nghiệm và cảm nhận tương tác của người dùng |
| 64 | **VND** | Đồng Việt Nam | Đơn vị tiền tệ chính thức sử dụng trong tính toán doanh thu và lương |
| 65 | **WS** | WebSocket | Giao thức truyền thông hai chiều thời gian thực (Socket.IO) |
| 66 | **Zod** | Zod Schema Validation | Thư viện định nghĩa và kiểm thực kiểu dữ liệu TypeScript dùng chung |

---

## 2. CHECKLIST ĐỊNH DẠNG VĂN BẢN VÀ BỐ CỤC CHUẨN

### 2.1. Cấu trúc tổng thể của Quyển Khóa Luận Tốt Nghiệp
- Người thực hiện ghép Word cần sắp xếp các phần theo đúng thứ tự tiêu chuẩn học thuật của HUIT:
  1. **Trang Bìa chính (Bìa cứng):** Bìa mạ vàng hoặc bìa màu theo quy định Khoa (Đầy đủ Trường, Khoa, Tên đề tài, GVHD, Sinh viên, Năm học 2026).
  2. **Trang Bìa phụ (Bìa giấy mềm):** Nội dung tương tự bìa chính in trên giấy trắng.
  3. **Nhiệm vụ Khóa luận Tốt nghiệp:** Kèm chữ ký chấp thuận của Trưởng bộ môn và GVHD.
  4. **Bản Nhận xét của Giảng viên Hướng dẫn:** Chứa các tiêu chí chấm điểm theo chuẩn đầu ra CLO.
  5. **Bản Nhận xét của Giảng viên Phản biện.**
  6. **Lời Cam Đoan:** Xác nhận tính trung thực của mã nguồn và nội dung nghiên cứu.
  7. **Lời Cảm Ơn:** Tri ân Nhà trường, Quý Thầy Cô và các đơn vị hỗ trợ.
  8. **Tóm tắt Đề tài (Abstract):** Bản tiếng Việt và bản tiếng Anh (khoảng 1 trang mỗi bản).
  9. **Mục Lục (Table of Contents):** Sinh tự động bằng tính năng của Microsoft Word.
  10. **Danh Mục Ký Hiệu và Chữ Viết Tắt.**
  11. **Danh Mục Hình Ảnh (List of Figures):** Sinh tự động.
  12. **Danh Mục Bảng Biểu (List of Tables):** Sinh tự động.
  13. **PHẦN NỘI DUNG CHÍNH:**
      - **MỞ ĐẦU:** Giới thiệu tổng quan, tính cấp thiết, mục tiêu và phạm vi đề tài.
      - **CHƯƠNG 1: KHẢO SÁT HIỆN TRẠNG VÀ KẾ HOẠCH THỰC HIỆN.**
      - **CHƯƠNG 2: PHÂN TÍCH HỆ THỐNG (Use-Case nghiệp vụ và hệ thống, Sơ đồ lớp phân tích).**
      - **CHƯƠNG 3: THIẾT KẾ HỆ THỐNG (Sơ đồ lớp thiết kế, Mô hình dữ liệu MongoDB, Giao diện).**
      - **CHƯƠNG 4: THUẬT TOÁN TÍCH HỢP (Khái niệm, Bài toán giải quyết, Thuật toán matching & RAG).**
      - **CHƯƠNG 5: CÀI ĐẶT HỆ THỐNG (Cài đặt các chức năng cơ bản, phân quyền và chức năng nghiệp vụ).**
      - **CHƯƠNG 6: KIỂM THỬ VÀ TRIỂN KHAI HỆ THỐNG (Chiến lược, Test case, Kết quả, Triển khai Cloud).**
      - **KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN.**
  14. **TÀI LIỆU THAM KHẢO:** Trích dẫn chuẩn học thuật IEEE/APA.
  15. **PHỤ LỤC:** Phụ lục A (Ma trận truy vết yêu cầu), Phụ lục B (Mã nguồn hợp đồng Zod), Phụ lục C (Phiếu UAT thực tế).

### 2.2. Quy chuẩn Font chữ, Cỡ chữ, Giãn dòng và Canh lề trang
- **Lưu ý quan trọng về nguồn gốc quy cách:** Các thông số dưới đây được quan sát và tổng hợp trực tiếp từ mẫu đồ án tốt nghiệp tham khảo gần nhất của Thầy (`_ref-notes/DACN_QuanLySanPickleball.txt` và mẫu Đề cương chi tiết KLCN HUIT 2026). *Đây là quan sát từ mẫu tham khảo thực tế, chưa phải quy định văn bản cứng của Khoa; người ghép Word cần đối chiếu mẫu mới nhất tại Văn phòng Khoa CNTT trước khi in chính thức:*

**Bảng 7.2: Quy chuẩn định dạng văn bản chi tiết**

| Thành phần văn bản | Font chữ quy định | Cỡ chữ (Size) | Định dạng kiểu chữ | Canh lề & Thụt lề | Khoảng cách dòng & đoạn |
|---|---|---|---|---|---|
| **Tiêu đề Chương (Heading 1)** | Times New Roman | **18 pt** (hoặc 16 pt) | **Chữ in hoa, ĐẬM (Bold)** | Canh giữa trang | Spacing Before: 12 pt, After: 12 pt |
| **Tiêu đề Mục cấp 1 (Heading 2)** | Times New Roman | **14 pt** | **ĐẬM (Bold)**, Đánh số 6.1 | Canh đều hai bên (Justify) | Spacing Before: 6 pt, After: 6 pt |
| **Tiêu đề Mục cấp 2 (Heading 3)** | Times New Roman | **13 pt** | **ĐẬM (Bold)**, Đánh số 6.1.1 | Canh đều hai bên (Justify) | Spacing Before: 6 pt, After: 3 pt |
| **Tiêu đề Mục cấp 3 (Heading 4)** | Times New Roman | **13 pt** | *Nghiêng Đậm (Bold Italic)* | Canh đều hai bên (Justify) | Spacing Before: 3 pt, After: 3 pt |
| **Nội dung văn bản chính** | Times New Roman | **13 pt** | Thường (Regular) | Canh đều hai bên, Thụt đầu dòng 1.0 cm | Line spacing: **1.3 - 1.5 lines**, Spacing After: 3-6 pt |
| **Tên Bảng (Caption Bảng)** | Times New Roman | **12 pt** | **ĐẬM**, Ví dụ: **Bảng 6.1: ...** | Canh trên đầu bảng, Căn trái hoặc Giữa | Spacing Before: 6 pt, After: 3 pt |
| **Nội dung trong Bảng** | Times New Roman | **11 pt - 12 pt** | Thường (Header in Đậm) | Căn giữa hoặc Trái tùy dữ liệu | Line spacing: **1.15 lines**, Spacing: 2 pt |
| **Nguồn trích dẫn / Ghi chú Bảng** | Times New Roman | **10 pt - 11 pt** | *Nghiêng (Italic)* | Canh dưới bảng, Canh phải | Spacing Before: 2 pt, After: 6 pt |
| **Tên Hình (Caption Hình)** | Times New Roman | **12 pt** | **ĐẬM**, Ví dụ: **Hình 6.1: ...** | Canh dưới hình ảnh, Canh giữa | Spacing Before: 3 pt, After: 6 pt |
| **Mã nguồn (Source Code block)** | Consolas / Courier New | **10 pt - 10.5 pt** | Thường, Đóng khung nền xám | Canh trái, Không thụt dòng | Line spacing: **1.0 line** |

- **Quy chuẩn Canh lề trang (Page Margins):**
  - **Lề Trên (Top):** $2.0\text{ cm} - 2.5\text{ cm}$.
  - **Lề Dưới (Bottom):** $2.0\text{ cm} - 2.5\text{ cm}$.
  - **Lề Trái (Left - Gáy sách):** **$3.0\text{ cm} - 3.5\text{ cm}$** *(Bắt buộc để đóng gáy lò xo hoặc dán gáy cứng không bị mất chữ)*.
  - **Lề Phải (Right):** $2.0\text{ cm}$.

### 2.3. Quy tắc tự động hóa chức năng Microsoft Word (Bắt buộc tuân thủ)
1. **Không gõ tay Mục lục và Danh mục Hình/Bảng:**
   - Người ghép Word tuyệt đối KHÔNG tự gõ số trang bằng tay. Phải gán đúng Style `Heading 1`, `Heading 2`, `Heading 3` cho các tiêu đề mục.
   - Sử dụng thẻ `References -> Table of Contents` để tạo Mục lục tự động.
   - Sử dụng thẻ `References -> Insert Caption` để đặt tên cho Hình và Bảng, sau đó dùng `Insert Table of Figures` để tạo Danh mục Hình và Danh mục Bảng.
2. **Quy tắc ngắt Section và Đánh số trang:**
   - Tạo `Section Break (Next Page)` giữa trang Bìa, các trang mở đầu (Lời cảm ơn, Mục lục) và Chương 1.
   - **Phần mở đầu (từ Lời cam đoan đến hết Danh mục bảng):** Đánh số trang bằng chữ số La Mã thường in nghiêng: `i, ii, iii, iv, v...`.
   - **Phần nội dung chính (từ Mở đầu, Chương 1 đến hết Phụ lục):** Đánh số trang bằng chữ số tự nhiên bắt đầu từ `1, 2, 3...` tại góc dưới bên phải hoặc chính giữa phía dưới trang.
3. **Quy tắc định dạng Bảng biểu chống vỡ khung:**
   - Nhấp chuột phải vào Bảng chọn `Table Properties`:
     - Tích chọn mục `Repeat as header row at the top of each page` (Lặp lại hàng tiêu đề của bảng khi bảng dài bị ngắt sang trang mới).
     - Bỏ tích chọn mục `Allow row to break across pages` (Không cho phép một dòng văn bản trong bảng bị xé đôi giữa hai trang).
     - Định dạng đoạn trong bảng: Bật tính năng `Keep with next` để tiêu đề bảng luôn dính liền với bảng biểu, không bị hiện tượng tiêu đề ở cuối trang này còn bảng ở đầu trang sau.

### 2.4. Hướng dẫn kết xuất và chèn Sơ đồ Mermaid chất lượng cao
- Trong các file văn bản nguồn `.md`, các sơ đồ kiến trúc và luồng xử lý được mô tả bằng cú pháp Mermaid.
- **Cách thức chuyển đổi sang ảnh in ấn:**
  1. **Cách 1: Sử dụng Mermaid Live Editor (Khuyến nghị cho sinh viên):**
     - Truy cập trang web: `https://mermaid.live/`.
     - Sao chép toàn bộ khối mã sơ đồ Mermaid (bỏ dấu backticks ```mermaid).
     - Dán vào khung soạn thảo bên trái, kiểm tra sơ đồ hiển thị hoàn chỉnh bên phải.
     - Chọn nút `Actions -> Download PNG` (chọn cấu hình kích thước nhân 2x hoặc 3x) hoặc tải file `SVG`.
  2. **Cách 2: Sử dụng dòng lệnh Mermaid CLI (`@mermaid-js/mermaid-cli`):**
     - Chạy lệnh xuất ảnh chất lượng cao:
       ```bash
       npx @mermaid-js/mermaid-cli -i diagram.mmd -o diagram.png -w 2048 -b transparent
       ```
  3. **Chèn ảnh vào Microsoft Word:**
     - Chèn ảnh vào giữa trang, chỉnh chế độ `In Line with Text`.
     - Đặt tên chú thích ngay bên dưới hình ảnh theo mẫu: `**Hình N.x: Tên mô tả sơ đồ**`.

---

## 3. DANH SÁCH CÁC VỊ TRÍ CẦN CHÈN ẢNH CHỤP MÀN HÌNH VÀ DỮ LIỆU ĐÒI HỎI

- Dưới đây là bảng tổng hợp các vị trí cần chèn ảnh chụp màn hình thực tế của ứng dụng HR BlockBot trong toàn bộ quyển báo cáo. Người ghép Word cần đăng nhập vào hệ thống local hoặc trang web Render Cloud `https://hr-blockbot-web.onrender.com` để chụp đúng giao diện:

**Bảng 7.3: Danh sách vị trí cần chụp và chèn ảnh giao diện**

| STT | Vị trí chèn trong báo cáo | Tên màn hình / Đối tượng | Đường dẫn màn hình (Route / UI) | Dữ liệu & Trạng thái cần có | Vai trò tài khoản đăng nhập |
|---|---|---|---|---|---|
| 1 | **Chương 5 (Mục 5.1)** | Trang chủ Landing Page | `http://localhost:5173/` hoặc `/` | Tiêu đề Newsreader, Logo marquee khách hàng, tuyệt đối không có pixel màu vàng | Khách vãng lai (Chưa login) |
| 2 | **Chương 5 (Mục 5.1)** | Hộp thoại Đăng nhập (Auth Modal) | Nhấp nút "Get Started" trên trang chủ | Form nhập email, password; hiển thị rõ thông báo kiểm thực khi nhập sai | Khách vãng lai |
| 3 | **Chương 5 (Mục 5.2)** | Quản trị CRM 45 chi nhánh Guta | Giao diện `/crm` (CRM Dashboard) | Bảng danh sách 45 cửa hàng, bộ lọc quận, thống kê doanh thu POS so với mục tiêu | Quản lý (`Admin` hoặc `AM`) |
| 4 | **Chương 5 (Mục 5.2)** | Ngăn kéo Slide-over chi nhánh | Nhấp chọn cửa hàng "Sư Vạn Hạnh" | Drawer trượt từ bên phải hiển thị danh sách Barista trong ca và nút gửi Telegram | Quản lý chi nhánh (`SM`) |
| 5 | **Chương 5 (Mục 5.3)** | Giao diện Chatbot thông minh | `/chat` hoặc Chat Drawer trong CRM | Cuộc hội thoại hỏi đáp chính sách nhân sự, hiển thị thẻ Trích dẫn (Citations) | Nhân viên (`Barista`) |
| 6 | **Chương 5 (Mục 5.3)** | Thẻ xem trước đề xuất (Preview) | Khung chat khi quản lý giao việc / KPI | Thẻ Card xem trước đề xuất ở trạng thái `PENDING` kèm nút "Xác nhận thực hiện" | Quản lý (`SM` / `AM`) |
| 7 | **Chương 5 (Mục 5.4)** | Đánh giá KPI & Phân tích nhận xét | Tab Đánh giá KPI trong CRM | Bảng tiêu chí rubric chấm điểm, điểm tính toán tất định và phân tích cảm xúc AI | Cửa hàng trưởng (`SM`) |
| 8 | **Chương 5 (Mục 5.5)** | Lưới Xếp lịch ca làm việc | Tab Lịch làm việc trong CRM | Lưới lịch tuần/tháng của nhân viên, hiển thị ca làm việc sáng/chiều/tối | Cửa hàng trưởng (`SM`) |
| 9 | **Chương 6 (Mục 6.3)** | Kết quả kiểm thử E2E Playwright | Terminal console lúc chạy test | Màn hình terminal chạy `node apps/web/test/e2e-revamp-flow.test.mjs` báo xanh 17/17 pass | Lập trình viên / Tester |
| 10 | **Chương 6 (Mục 6.5)** | Bảng điều khiển Render Cloud | `dashboard.render.com` | Hiển thị 3 service `hr-blockbot-web`, `hr-blockbot-api`, `hr-blockbot-ai` đều báo `Live` xanh | Quản trị DevOps |

---

## 4. DANH SÁCH CÁC MỤC CẦN KIỂM CHỨNG LẠI TRƯỚC KHI IN

- Các mục dưới đây mang nhãn `[CHƯA KIỂM CHỨNG]` trong các tài liệu nguồn, sinh viên cần thực hiện đúng các thao tác kiểm chứng dưới đây để lấy số liệu thực tế cập nhật vào báo cáo:

**Bảng 7.4: Danh sách các hạng mục cần chạy kiểm chứng thực tế**

| STT | Nội dung cần kiểm chứng | Lệnh thực thi kiểm tra | Kết quả cần lấy để điền vào Word | Vị trí mục trong Word |
|---|---|---|---|---|
| 1 | **Điểm số Lighthouse CI chính thức** | `npx lhci autorun` hoặc kiểm tra tab Lighthouse trên Chrome DevTools cho trang `https://hr-blockbot-web.onrender.com` | 4 điểm số phần trăm: Performance (Hiệu năng), Accessibility (Khả năng tiếp cận), Best Practices và SEO | Điền vào Mục 6.4.3 (Chương 6) |
| 2 | **Lệnh sao lưu dự phòng MongoDB Atlas** | `mongodump --uri="<MONGODB_URI>" --out=./backup-demo` | Ghi nhận dung lượng file backup và ngày giờ xuất dữ liệu an toàn trước buổi bảo vệ | Điền vào Mục 6.5.4 (Chương 6) |
| 3 | **Biên bản xác nhận chữ ký UAT** | In mẫu phiếu UAT tại Bảng 6.4, tổ chức phiên đánh giá cho 2 sinh viên và GVHD | Ký tên xác nhận thật trên giấy, chụp ảnh hoặc scan đưa vào Phụ lục C | Điền vào Phụ lục C |

---

## 5. BẢNG KIỂM TRA TRƯỚC KHI ĐÓNG QUYỂN (PRE-PRINT CHECKLIST)

- [ ] Toàn bộ các tiêu đề đã được gán Style chuẩn (`Heading 1`, `Heading 2`, `Heading 3`).
- [ ] Đã cập nhật (Update Field) toàn bộ: Mục lục, Danh mục hình ảnh và Danh mục bảng biểu.
- [ ] Đã kiểm tra số trang trong Mục lục khớp chính xác 100% với số trang nội dung bên trong.
- [ ] Không còn bất kỳ dòng chữ nào mang ký hiệu `[CHÈN ẢNH: ...]` bị bỏ quên trong nội dung (Tất cả đã được thay bằng ảnh chụp màn hình thật).
- [ ] Không còn nhãn `[CHƯA KIỂM CHỨNG: ...]` chưa được xử lý hoặc để trống số liệu.
- [ ] Bề rộng lề trái trang in đã đặt đủ 3.0 cm hoặc 3.5 cm để khi đóng gáy mạ vàng không bị che lấp chữ.
- [ ] Đã kiểm tra lỗi chính tả tiếng Việt bằng công cụ kiểm tra chính tả của Microsoft Word.
- [ ] Bảng biểu dài sang trang thứ hai đã tự động hiển thị lại hàng tiêu đề (Repeat Header Row).
- [ ] Các sơ đồ Mermaid được chuyển đổi thành ảnh có độ phân giải cao, chữ trên sơ đồ đọc rõ ràng, không bị méo mó.
- [ ] Tài liệu tham khảo đã được đánh số liên tục `[1], [2], [3]...` và có đầy đủ tác giả, tên văn bản, năm công bố và liên kết truy cập hợp lệ.
