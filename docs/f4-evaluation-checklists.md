# F4 — checklist benchmark và demo local

Không deploy/commit/push, không Atlas/dữ liệu thật, không fine-tune, không KPI/chatbot WRITE. Các dấu [ ] là việc cần con người kiểm tra ở lần thực hiện, không phải xác nhận tự động đã hoàn thành.

## A. Điều kiện mở benchmark chính thức

- [ ] Giữ nguồn pilot20×10, ID/kỹ năng/mô tả/workload/split không đổi; lưu SHA256. Không thêm nhãn vào nguồn.
- [ ] Duyệt rubric và protocol đề xuất trước khi chấm; lưu người/thời gian có múi giờ/tham chiếu thực và protocol hash. Cả hai thành viên đọc đúng phiên bản đã duyệt.
- [ ] Hai người thật tự chấm200 cặp/người, lý do và attestation từng cặp; không xem phiếu nhau hoặc dự đoán mô hình, không dùng AI điền hộ.
- [ ] Hai completedAt do chính thành viên nhập khi hoàn tất. Cặp mơ hồ vẫn null và được làm rõ trước khi hoàn tất, không ép điểm.
- [ ] Chạy công cụ đối chiếu trên hai file cuối: đủ200 cặp, hai reviewer khác nhau, nguồn không đổi, không cặp thiếu, không bất đồng. Giữ phiếu gốc; không tự adjudicate.
- [ ] Nếu bất đồng, giữ cả hai nhãn/lý do và chặn benchmark; nhóm phải duyệt cơ chế xử lý riêng. Công cụ chưa thực thi một chính sách giải quyết mới.
- [ ] Người có thẩm quyền xác minh người thật/độc lập, duyệt nhãn, tự ghi reference/by/at và các xác nhận vào manifest. File hash mới phải đúng hai file cuối; sửa file sau phê duyệt sẽ làm gate fail.
- [ ] `--check-only` đạt; đây chỉ là integrity/gate validation, không phải đo chất lượng.
- [ ] Nguồn model/tokenizer/VnCoreNLP pinned, manifests hợp lệ, môi trường CPU riêng; local_files_only/offline. Đủ RAM2,5GiB và đĩa4GiB; không hạ ngưỡng hoặc đóng ứng dụng người dùng.
- [ ] F4_MODEL_DIR/F4_SEGMENTER_DIR và JAVA_HOME chỉ cấp cho process benchmark riêng, trỏ tới cache/JDK đã xác minh. Không đọc hoặc kế thừa credential thật. Gate tài nguyên hiện được xác minh trên Windows; host khác cần phép đo khả dụng thực, không bỏ gate khi chưa đo được.
- [ ] Chốt protocol trước nhìn test: binary relevant≥1, P@1/3/5, Recall@5, MRR, exponential-gain NDCG@5, zero-relevant handling và macro average. Không gọi P@K là F1.

Sau khi tất cả đạt, từ thư mục AI service chạy bằng Python F4 riêng:

```text
<python-f4> eval/evaluate_f4.py --dataset eval/f4-pilot.json --reviewer-a <A-final.json> --reviewer-b <B-final.json> --approval <approval-human.json> --output <ket-qua-moi.json>
```

Output phải là đường dẫn mới. Evaluator chọn alpha trên dev.NDCG@5, hòa chọn alpha nhỏ hơn; giữ test để báo baseline, PhoBERT thuần(alpha1) và hệ số được chọn. Không xem test rồi chạy lại để chọn alpha có lợi. Lưu mọi kết quả kể cả alpha0/baseline tốt nhất; không ghi đè lượt cũ.

Báo cáo có thứ tự/ID cùng candidate pool, metric từng task, delta và mọi ca một metric của PhoBERT/tổ hợp thấp hơn baseline; không chỉ lấy ví dụ tốt. Ghi thư viện/hardware/source/data/approval hashes. Latency lõi baseline/semantic, cold load và process peak gồm JVM được ghi riêng; không phải latency Web→API và không phải RAM baseline standalone. Pilot nhỏ/templated, chỉ mang tính thăm dò; không đủ suy ra accuracy production hoặc F1≥85%.

## B. Demo worker PhoBERT thật bằng dữ liệu synthetic

- [ ] Không sửa hoặc dùng .env/credentials thật. Chuẩn bị dedicated Python, model/cache/JDK đã có; không cài vào môi trường AI hiện hành.
- [ ] Preflight5 mẫu ổn định, mỗi mẫu RAM≥2,5GiB/đĩa≥4GiB. Nếu không đủ, dừng riêng model; không hạ ngưỡng.
- [ ] Dùng key test sinh riêng, chỉ bind127.0.0.1; không mở port Internet và không kế thừa Mongo/provider credentials.
- [ ] Khởi động worker `app.f4_gateway:app`; health ban đầu loaded:false. Không nhầm health sống với weights đã sẵn sàng.
- [ ] Thiếu/sai service key bị401, payload thêm trường bị422; không tắt auth.
- [ ] Warm-up bằng một /rank synthetic có service key, đối chiếu model/revision/response. Warm-up có ngân sách60s như harness đã nghiệm thu; **không đổi deadline8s của Node**.
- [ ] Health chuyển loaded:true; request sau warm-up hoàn tất trong timeout8s. Nếu cold/failure/fallback thì nói đúng trạng thái, không gắn nhãn PhoBERT cho baseline.
- [ ] Giữ đầy đủ worker stdout/stderr, xem cảnh báo JNI/JVM; không tắt faulthandler hay lọc log để che lỗi. Kết quả native probe và worker bình thường là hai chế độ khác nhau.
- [ ] Kết thúc chỉ dừng worker do harness tạo, không đóng app người dùng. Windows process bị harness terminate có thể exit1; phân biệt cleanup này với crash trước khi assertions hoàn tất.

Công cụ kiểm tra có sẵn, không mở CRM hoặc tạo database:

```text
<python-authz> scripts/check_f4_demo.py --python <python-f4> --model-dir <cache/phobert-base> --segmenter-dir <cache/vncorenlp> --java-home <jdk-da-co> --output <demo-smoke-moi.json>
```

Công cụ giữ full worker log, tạo key test riêng và thu hồi process của chính nó. Không có tính năng download/install hoặc bật F4_MODE production. Các số smoke không phải benchmark chất lượng20×10.

## C. Demo CRM đầu-cuối

- [ ] Chỉ MongoMemoryServer do fixture sở hữu; synthetic store/employee/task và explicit grants; không Atlas, không tái sử dụng tài khoản thật.
- [ ] Build hiện tại, dùng harness `apps/web/test/f4-real.integration.mjs`, Python/cache/JDK riêng và opt-in RUN_F4_REAL=1. Hệ số integration-only được khai báo rõ; chưa phải hệ số tối ưu.
- [ ] UI hiển thị model/revision thật, Node kiểm principal/store scope/eligibility/lifecycle trước và sau inference; không để model quyết định authorization.
- [ ] Xem gợi ý chưa tạo assignment; quản lý chọn rồi xác nhận. Nhân viên tiếp nhận/từ chối; đổi người và bàn giao theo consent/CAS/audit hiện có.
- [ ] Giữ nguyên fallback và kiểm tra revoke/stale/foreign-candidate theo API regression; không biến test mock edge cases thành bằng chứng mọi ca đều đã chạy weights thật.
- [ ] Phân biệt kết quả E2E model thật đã được chấp nhận ở phase trước với lượt smoke worker mới và benchmark chưa chạy. Không cần bật PHOBERT mặc định để demo; không sửa CRM/Authorization/Jev.

## D. Những điều chưa thể xác nhận bằng công cụ

Danh tính/độc lập thực tế của người chấm cần chủ dự án xác minh; file JSON/hash không thay xác thực người thật. Adjudication chưa được duyệt/triển khai. Chưa có nhãn/benchmark/alpha tối ưu. Chưa đo tải200 ứng viên hoặc độ ổn định JVM dài hạn, chưa production-ready. Không có kết luận cải thiện so với baseline trước thí nghiệm.
