# Phát triển từ baseline B01

B01 là bản tích hợp HRM/CRM/Authorization V1 đang được review. Tài liệu này không phải lệnh commit/push/deploy, không cấp business capability và không chứng minh production đã hoạt động. Các bảng bootstrap cũ trong README/plan là lịch sử; runtime V1 xem `authorization-v1-runtime.md`, `jev-shadow-v1-runtime.md`, `f4-v1-local-runtime.md`.

## Một phiên bản chung, mỗi người một checkout

Chỉ sau khi chủ dự án duyệt và publish baseline, clone branch đã duyệt vào thư mục mới. Ghi lại `git rev-parse HEAD`; hai thành viên phải có cùng SHA ban đầu. Không dùng main đang có uncommitted changes của người khác. Tạo nhánh chức năng riêng từ baseline đó; F5/F7 chưa được triển khai chỉ vì có tài liệu này.

Nhánh đề xuất: `baseline/hr-blockbot-v1-20261101`; sau duyệt, hai nhánh `feat/f5-monthly-kpi-domain` và `feat/f7-deadline-reminders`. Không tự push main, force-push, đẩy `--all` hoặc cập nhật `integration/full-delivery`. Deploy là quyết định riêng.

## Môi trường đã kiểm tra

- Windows x64, Node 24.15.0, pnpm 11.25.0, Python 3.13.5. Root packageManager pin pnpm; đây không phải chứng nhận mọi phiên bản OS/Node/Python khác.
- Browser test cần Chromium của đúng phiên bản Playwright trong lockfile. Có thể cài bằng `pnpm --filter web exec playwright install chromium` nếu máy chưa có; không cần browser account.
- API regression dùng `mongodb-memory-server` sở hữu từng process/DB test trên loopback. Lần đầu cần tải mongod tương thích nếu cache chưa có; khi offline phải chuẩn bị cache. Không trỏ harness vào MongoDB/Atlas của bạn.
- Base Python requirements pin các package cấp cao nhất, không phải transitive lock. Ghi phiên bản đã resolve khi tái kiểm định. Bộ offline không cần torch, model, Java hoặc API key.

## Cài dependencies và build

Từ root clone riêng, dùng đúng pnpm ở trên:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @hr-blockbot/contracts build
pnpm -r typecheck
pnpm -r run build
python -m venv apps/ai-service/.venv-authz-v1
apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pip install -r apps/ai-service/requirements.txt
```

Trên POSIX, Python venv nằm ở `.venv-authz-v1/bin/python`; các cross-language harness dùng `AUTHORIZATION_TEST_PYTHON` để chỉ định interpreter khi cần. Xem script của từng harness; không sử dụng venv của checkout khác.

Không copy `.env` thật từ thành viên khác vào source/Git. Kiểm thử synthetic ở dưới không cần credential thật hoặc `.env`. Khi chạy ứng dụng thủ công, operator cấp cấu hình riêng từ `.env.example`: Node có DB riêng và các secret riêng; Python V1 chỉ có Node origin + shared service key, không nhận credential MongoDB. Không đăng nhập bằng role picker; tài khoản cần mapping/grant/ACL và phê duyệt hợp lệ. Production activation/recovery delivery chưa được wiring mặc định, không báo gửi thành công giả.

## Các gate mặc định, không gọi model/provider thật

Chạy tuần tự nếu máy ít RAM; luôn giữ test environment độc lập. Đặt `PYTHON_DOTENV_DISABLED=1`, `F4_MODE=OFF`, `JEV_V1_MODE=OFF`; không kế thừa credentials từ shell. Unit Python có conftest chặn live network. Node harness tự tạo database synthetic; không tự cấu hình TEST_MONGODB_URI đến DB có sẵn.

```powershell
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test
pnpm --filter web test
apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pytest -q -ra
apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pytest -q -m legacy
node apps/web/test/authorization-v1.integration.mjs
node apps/web/test/crm-completion-v1.integration.mjs
node apps/web/test/crm-workflow.integration.mjs
pnpm --filter api test:authorization-python
pnpm --filter api test:jev-shadow
```

Chạy full API trước khi chạy browser/backend integration riêng để tránh nhiều mongod/model cạnh tranh RAM. `test:jev-shadow` đã nằm trong full API: chỉ chạy riêng lại nếu cần điều tra hoặc source liên quan thay đổi. Legacy route 503, PENDING và DENIED là kết quả chính sách cần giữ, không mở quyền để vượt test.

Browser/backend integration dùng API/Mongo thật nhưng dữ liệu synthetic; LLM/Jev responses vẫn fixture/mock. Không coi chúng là live model hoặc production verification. Bộ unit Python mặc định bỏ qua real PhoBERT test và live Atlas/LLM probe; phải ghi đúng hai hạn chế khi báo cáo.

## PhoBERT và bằng chứng riêng

Không cài/đọc model khi chưa qua preflight trong `f4-v1-local-runtime.md`: tối thiểu 2,5 GiB RAM trống và 4 GiB disk theo guard hiện có. Dùng Python worker riêng, model/revision/segmenter pin và hash manifests; không đặt binary/cache trong Git hoặc trong base venv.

Worker VnCoreNLP/pyjnius cần JDK phù hợp và `JAVA_HOME` trong môi trường process. Lượt benchmark và E2E Windows đã kiểm tra dùng JDK 24; chỉ có `java.exe` trên PATH không thay thế bước cấu hình này. Đặt JAVA_HOME cho terminal/process worker theo đường dẫn JDK trên máy của bạn, không thay đổi biến hệ thống hay copy Java binary vào repo. Thiếu cấu hình Java có thể khiến worker trả 503 fail-closed dù HTTP health còn hoạt động.

`RUN_F4_REAL=1` là opt-in riêng cho smoke/E2E, không thuộc test mặc định. Chỉ đặt biến này sau preflight. Integration coefficient phải khai báo rõ; không diễn giải hệ số thử kỹ thuật thành hệ số tốt nhất. Mặc định Node vẫn baseline/OFF.

Benchmark EXPLORATORY 01/11/2026 trên 200 nhãn AI, 53 uncertain, chọn alpha trên dev=0; PhoBERT thuần chưa vượt baseline trong kết quả chính. Kết quả, labels, journal, checkpoint, payload và credential riêng nằm ngoài Git. Đây chưa phải human-gold acceptance; không dùng tập test để chọn lại alpha hay fine-tune. Không bắt buộc chạy lại benchmark nếu source/revision/assets đã đối chiếu hash với bằng chứng đóng băng.

## Nội dung được commit

Chỉ source, tests synthetic, schema, dependency manifests/lockfile và tài liệu đã review. Không commit `.env` thật, key/DPAPI, DB export/PII, outputs/checkpoint/AI labels/private payload, test results, model binary/cache, node_modules/venv hoặc runtime logs. Review toàn bộ file dự kiến commit bằng inventory đóng, không dùng `git add .` cho working tree đang phát triển.
