# 15 — Quy ước kỹ thuật (Engineering Conventions)

Khóa luận **KLCN133** — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*. Nhóm 3 người, 12 tuần (24/08/2026 → 16/11/2026).

Tài liệu này chốt **cách commit, đặt tên nhánh, mở PR, tổ chức file và viết code** trong repo.
Văn xuôi tiếng Việt; **toàn bộ nội dung commit, branch, PR, mã nguồn, comment bằng tiếng Anh** (theo `README.md` mục "Commit convention").

Nguồn chốt quy ước (không có gì trong file này được suy diễn thêm ngoài các mục dưới):

| Chương | Nội dung lấy từ |
|---|---|
| Commit + branch + squash merge | `docs/research/NOTES-01.md` **B11**, `docs/research/RESEARCH-PLAN.md` **§3 B11** |
| Cây thư mục, module theo feature, pipeline contract | `NOTES-01.md` **B2** |
| Guard của Agent Loop (RBAC, Zod, confirm, audit) | `NOTES-01.md` **B6** |
| Core Web Vitals + internal target | `NOTES-01.md` **B9** |
| Thứ tự gate CI + công cụ test | `NOTES-01.md` **B10**, `RESEARCH-PLAN.md` **§3 B10** |
| "Không thêm gate nếu chưa có lệnh chạy trong CI" | `RESEARCH-PLAN.md` **§11** |
| Luật phạm vi cho phần sáng tạo | `RESEARCH-PLAN.md` **§12** |

> Trạng thái repo: **chưa có mã nguồn** (`README.md` dòng 9). Những lệnh ghi ở §6 là cam kết sẽ dựng cùng vòng scaffold, chưa chạy được hôm nay.

---

## 1. Conventional Commits 1.0

### 1.1 Cú pháp

```text
<type>(<scope>): <description>
<type>!: <description>                      ← breaking change, không có scope
<type>(<scope>)!: <description>             ← breaking change, có scope

<blank line>
<body — optional>

<blank line>
<footer — optional>
```

- `type` **bắt buộc**, viết thường.
- `scope` **bắt buộc** khi thay đổi nằm trong một module; được bỏ khi thay đổi trải toàn repo (vd `ci:`, `docs:` cho cấu hình pipeline và tài liệu chung).
- `<description>`: mệnh ngắn, **thì hiện tại, ngôi không xác định** ("add", không phải "added"/"adds"), viết thường, **không có dấu chấm cuối**, ≤ **72 ký tự** tính cả `type(scope):` (ngưỡng 72 là quy ước nhóm theo lệ git thông thường, không phải đòi hỏi của spec 1.0).
- `!` **và** footer `BREAKING CHANGE:` phải đi cùng nhau — `!` để máy đọc, footer để người đọc hiểu chuyện gì vỡ.
- Một commit chỉ đổi **một thứ nhất quán**. Trộn sửa lint với thêm tính năng = commit đó không revert được một mình.

Spec gốc: Conventional Commits 1.0 (link trong `README.md`; URL chi tiết đang chờ bổ sung vào `NOTES-01.md` mục "CẦN BỔ SUNG").

### 1.2 Scope — whitelist chính thức

```text
auth | hr | project | chatbot | ai | dashboard | realtime | docs | ci
```

| Scope | Vùng code / trách nhiệm | Nguồn |
|---|---|---|
| `auth` | Login, JWT access token, refresh-token rotation + reuse detection, RBAC `Admin`/`Employee`, Argon2id, `jose` | NOTES-01 B3 |
| `hr` | Hồ sơ nhân viên, phòng ban, 5 cấp bậc (`Intern/Junior/Middle/Senior/Lead`), kỹ năng | NOTES-01 B4, RESEARCH-PLAN §1 |
| `project` | Vòng đời đề tài công việc (F2): state machine, due date, `project_events`, tiến độ | NOTES-01 B4 |
| `chatbot` | Intent/router, Agent Loop, tool catalog, confirm-before-write, hội thoại qua WS | NOTES-01 B6, B7 |
| `ai` | `apps/ai-service` (FastAPI): PhoBERT, embedding, ranking, calibration, sentiment→KPI, eval harness | NOTES-01 B5, B6 |
| `dashboard` | Web Dashboard nền tối, Recharts, aggregate KPI, layout/UX | NOTES-01 B8 |
| `realtime` | Socket.IO server: rooms, events, ack, `clientMessageId`, notification persistence | NOTES-01 B7 |
| `docs` | Bộ tài liệu chuẩn trong `docs/` (kiến trúc, data model, API, báo cáo) | RESEARCH-PLAN §2 |
| `ci` | GitHub Actions, Dockerfile, lint/typecheck config, husky/commitlint, Lighthouse CI | NOTES-01 B10, B2 |

**Không có scope `task`.** `README.md` (dòng 34) và `RESEARCH-PLAN.md` §3 B11 (dòng 208) còn ghi `task`; `NOTES-01.md` B11 (dòng 420) chốt `project` và thêm `docs`. **Tài liệu này theo NOTES-01 B11** vì đó là kết quả research vòng 1 và "đề tài" là đúng từ vựng của F2. `README.md` sẽ được sửa khớp trong một PR `docs:` riêng (không sửa tay ở đây vì ngoài phạm vi giao việc).

### 1.3 Bảng type được phép

| Type | Dùng khi | Ví dụ (đúng scope của project này) |
|---|---|---|
| `feat` | Thêm năng lực mới mà người dùng/quản lý cảm nhận được; luôn kèm issue | `feat(chatbot): add find_candidates tool with workload tie-break` |
| `fix` | Sửa hành vi sai so với spec; luôn kèm issue | `fix(project): reject transition from COMPLETED to IN_PROGRESS` |
| `docs` | Thay đổi tài liệu chuẩn, ADR, README, chú giải nghiệp vụ | `docs(hr): record decision that level is data, not role` |
| `style` | Định dạng thuần, **không đổi hành vi**: prettier, eslint --fix, thứ tự import, whitespace | `style(dashboard): normalize prop order in KpiTrendCard` |
| `refactor` | Đổi cấu trúc code, giữ nguyên hành vi và API | `refactor(hr): move level hierarchy rules from controller to service` |
| `perf` | Đổi để nhanh hơn, giữ nguyên kết quả | `perf(dashboard): compute monthly KPI aggregate in one pipeline` |
| `test` | Thêm/chỉnh test, fixture, harness — không đổi code sản xuất | `test(auth): cover refresh-token reuse detection on replay` |
| `build` | Ảnh hưởng build/dependency: pnpm workspace, tsconfig, pin version, Dockerfile | `build(ai-service): pin transformers version for reproducible eval` |
| `ci` | Pipeline, gate, runner, artifact | `ci: run AI regression gate after Python tests` |
| `revert` | Bỏ hẳn một commit đã merge | `revert: undo "feat(chatbot): auto-assign on low confidence"` |

Không có `chore`. Danh sách ở `RESEARCH-PLAN.md` §3 B11 và `README.md` còn `chore`, nhưng `chore` không mang thông tin gì mà 10 type trên không diễn đạt được: dọn dependency → `build`, dọn config pipeline → `ci`, dọn format → `style`, dọn cấu trúc → `refactor`. Chi tiết lệch nguồn ghi ở đầu §1.2/§1.3 và §8.

### 1.4 Body — "what + why", không lặp lại subject

- Viết body sau subject **một dòng trắng**.
- Body trả lời: **đổi gì (what)** và **tại sao phải thế, ràng buộc nào dẫn tới lựa chọn này (why)**. Nguồn tham chiếu dạng `NOTES-01 B4`, `RESEARCH-PLAN §11`, số issue.
- **Không** lặp subject sang body (`add login tool` → `This commit adds the login tool`). **Không** tường thuật từng file đã đụng (`Changed auth.ts and auth.service.ts`) — diff đã nói việc đó.
- Mỗi dòng body ≤ 72 ký tự, ngắt theo ý chứ không theo file.
- Không dùng body để giải thích code lằng nhằng — chỗ đó là việc của comment §5.4.

Ví dụ đủ chuẩn:

```text
fix(project): reject transition from COMPLETED to IN_PROGRESS

Reopening a finished topic silently wiped statusHistory because the
service applied the transition before validating the edge. The state
machine in NOTES-01 B4 has no COMPLETED -> IN_PROGRESS path, so the
guard is now the single source of truth.

Overdue stays a derived flag (dueDate < now) instead of a state, per
the same decision, so deadline churn cannot re-enter lifecycle.

Closes #48
```

### 1.5 Footer

| Footer | Dùng khi | Mẫu |
|---|---|---|
| `BREAKING CHANGE:` | Mọi thay đổi buộc bên tiêu dùng (client sinh từ OpenAPI, tool schema, WS event contract, format dữ liệu đã seed) phải sửa theo. Giải thích **cũ → mới → cách migrate** | `BREAKING CHANGE: find_candidates now requires departmentId; callers must send it or the tool returns 400` |
| `Closes #n` (hoặc `Fixes #n`, `Refs #n`) | Gắn commit với issue/luồng nghiệm thu. `feat`/`fix` **bắt buộc** có tham chiếu issue — gate commitlint + scope whitelist ở `RESEARCH-PLAN.md` §11 | `Closes #48` |
| `Co-authored-by: Name <email>` | Khi hai người viết chung một commit trước khi squash | — |

Footer mỗi dòng một cặp `Token: value`, tách khỏi body bằng dòng trống.

---

## 2. 12 commit tốt — và vì sao tốt

| # | Commit | Vì sao đạt |
|---|---|---|
| 1 | `feat(auth): add refresh token rotation with family revocation` | type đúng, scope `auth` có thật, động từ hiện tại, một năng lực duy nhất |
| 2 | `fix(ai): round cosine score before threshold compare` | mô tả lỗi cụ thể + vị trí; `fix` kèm issue ở footer |
| 3 | `docs(ci): state that no CI gate lands without a runnable command` | type `docs` cho tài liệu, scope `ci`, lấy đúng nguyên tắc ở RESEARCH-PLAN §11 |
| 4 | `refactor(hr): extract KPI override rules into domain service` | nói rõ dịch chuyển cấu trúc, không đổi hành vi |
| 5 | `perf(dashboard): memoize KPI series transform in chart card` | một tối ưu, một phạm vi đo được |
| 6 | `test(project): cover every state machine transition path` | test-only, khớp luật "100% state-machine transition" ở RESEARCH-PLAN §11 |
| 7 | `build(realtime): split ws server entry for standalone deploy` | thay đổi đóng gói, không trộn nghiệp vụ |
| 8 | `ci: add gitleaks job after build stage` | thay đổi toàn pipeline nên không cần scope; ngắn, rõ |
| 9 | `revert: undo "feat(chatbot): auto-submit progress without confirm"` | chỉn chu cả tên commit bị revert; giữ lại được lịch sử S8 |
| 10 | `feat(chatbot)!: require confirmation before write tools` | `!` đánh dấu breaking, đọc log là biết phải migration |
| 11 | `feat(ai): add platt calibration endpoint for similarity scores` | năng lực mới, scope đúng vùng `apps/ai-service` |
| 12 | `fix(dashboard): align dark chart palette tokens with theme switch` | scope `dashboard`, hành vi sai bị sửa, không chung chung |

Commit 10 phải có footer:

```text
feat(chatbot)!: require confirmation before write tools

BREAKING CHANGE: submit_report and assign_project now return a
confirmation challenge instead of mutating data; clients must render
the confirm step before the tool completes.

Closes #61
```

## 3. 12 commit xấu — và vì sao không đạt

| # | Commit | Lỗi |
|---|---|---|
| 1 | `first commit` | Không type, không scope, không mô tả; vô nghĩa với git bisect |
| 2 | `update` | Không nói cập nhật gì; kiểu message này giết khả năng đọc log |
| 3 | `fix bug` | Quá mơ hồ: bug nào, module nào, không tham chiếu issue |
| 4 | `feat(task): add candidate ranking` | **sai scope** — `task` không có trong whitelist (§1.2); phải là `project`/`ai` |
| 5 | `feat(chatbot): implement policy RAG with citations` khi diff chỉ sửa một câu trong `docs/10-ui-ux-spec.md` | **Mô tả tính năng không có code** — vi phạm nghiêm trọng nhất: log quảng cáo thứ chưa tồn tại; đúng ra là `docs(chatbot)` |
| 6 | `Feat(Auth): Add Login Flow` | Type viết hoa, scope viết hoa, description viết hoa, có vẻ đã đặt tên theo tính năng cũ |
| 7 | `fix(ai): wrong score is returned now.` | Có dấu chấm cuối + mô tả trạng thái thay vì hành động; "now" không chỉ cái gì |
| 8 | `feat(dashboard): add weekly KPI variance chart with drill-down by department and export to csv and email digest for managers` | **Quá 72 ký tự** và nhồi 3 tính năng vào một commit |
| 9 | `wip` / `WIP: chatbot stuff` | Không type, không scope; commit trạng thái tạm không được merge vào `main` |
| 10 | `docs: thêm tài liệu test` | Nội dung **tiếng Việt** trái cam kết tiếng Anh (`README.md`), và thiếu scope khi sửa một file xác định |
| 11 | Subject `refactor(auth): simplify token verify`, body `Simplify token verify.` | Body **lặp lại subject**, không thêm what/why |
| 12 | `feat(chatbot): change tool args, old clients break` — không `!`, không `BREAKING CHANGE:` | Breaking change giấu trong description; consumer không có gì để migrate |

---

## 4. Nhánh, PR, review, merge

### 4.1 Nhánh

```text
main                     ← luôn chạy được, chỉ nhận code đã review + CI xanh
feat/<scope>-<kebab>     feat/chatbot-find-candidates-tool
fix/<scope>-<kebab>      fix/project-completed-transition
docs/<kebab>             docs/conventional-commits-scopes
```

- **Không Git Flow.** Nhóm 3 người / 12 tuần → trunk-based trên `main` + **short-lived branch** + PR + **squash merge** (NOTES-01 B11). Không có `develop`, không có release branch.
- Tên nhánh `kebab-case`, tiếng Anh, có prefix `feat/`, `fix/`, `docs/`; kèm số issue khi nhánh sinh ra từ một issue: `fix/48-completed-transition`.
- Nhánh sống **tính theo ngày**. Mỗi nhánh chỉ một luồng nghiệm thu hoặc một bug; mở PR khi CI xanh và có test, không "gom dần cho lớn".
- Không push thẳng `main`. Không force-push lên nhánh đã có PR mở mà không báo; không `--no-verify` để đi đường tắt qua husky (§6).
- Đồng bộ với `main` bằng `git rebase main` hoặc merge một commit `Merge branch 'main' into ...` (commit merge không phải viết tay nên không theo format §1).

### 4.2 PR template

Tiêu đề PR = **commit cuối cùng sẽ sinh ra**, theo đúng §1 (squash merge lấy nguyên tiêu đề). Nếu tiêu đề không đạt chuẩn commit, CI chặn merge.

```markdown
Closes #<issue>

## What
- <1–3 dòng: thay đổi hành vi nào, thuộc module nào>

## Why
- <vấn đề/pạm vi/luồng nghiệm thu; dẫn NOTES-01 B<n> hoặc RESEARCH-PLAN §<n> nếu quyết định ở đó>

## Evidence
- [ ] Test mới/bị ảnh hưởng: <tên file test, số case>
- [ ] Lệnh đã chạy + kết quả đọc được: <pnpm test / pnpm test:api / pytest -q>
- [ ] không đổi API/WS contract   ·   hoặc: có đổi → đã cập nhật `06-api-spec.md` + zod schema + ghi `BREAKING CHANGE` ở mô tả squash
- [ ] Không có secret, không log dữ liệu cá nhân, không số liệu tự đặt (TBD nếu chưa đo)

## Definition of Ready (trước khi code)
- [ ] Issue đã ánh xạ một user flow (F1–F7 / UF-xx) và có tiêu chí "xong" đo được
- [ ] Không phải S ngoài phạm vi chưa qua luật phạm vi §9
- [ ] Đã biết gate CI nào giữ thay đổi này (§6)

## Definition of Done
- [ ] CI xanh toàn chuỗi §6: lint → typecheck → unit → API integration → Python AI tests → AI regression gate → build → Playwright smoke → Lighthouse → gitleaks
- [ ] Logic state machine có test cho mọi transition (100%) — §6
- [ ] Coverage domain/service đạt mức ở `docs/11-quality-testing.md` §3
- [ ] Không còn TODO kiểu "làm sau khi merge"; không để comment đã chết
- [ ] Reviewer đã duyệt; tài liệu bị ảnh hưởng (`04/05/06/08/09/10/11`) đã cập nhật
```

### 4.3 Review rule (nhóm 3 người)

- Mỗi PR cần **duy nhất 1 approve từ người không phải tác giả**; tác giả không tự merge, không approve PR của mình.
- Người còn lại là reviewer dự phòng cho module của họ (`auth`/`hr`/`project` → người 1, `chatbot`/`ai`/`realtime` → người 2, `dashboard`/`docs` → người 3); ai code ở đâu thì ở đó **không** được là reviewer duy nhất.
- Review tập trung 5 thứ theo thứ tự: (1) đúng phạm vi đã duyệt chưa, (2) có test không / test có thật không, (3) hợp đồng API + zod + RBAC có bị hở không, (4) tên và cấu trúc file có theo §5 không, (5) style/format — thứ mà eslint/prettier đã lo rồi thì đừng comment tay.
- Góp ý dạng blocking ghi `Sửa:`; dạng không chặn ghi `Nên (non-blocking):` và vẫn phải mở issue để không rơi.
- Không đổi phạm vi trong lúc review. Phát hiện việc mới → mở issue, để nó ở PR khác; nếu đó là S mới thì phải qua luật phạm vi §9.
- Sau 1 ngày làm việc chưa ai review → ping ở kênh nhóm; không tự merge "vì hết giờ".

### 4.4 Squash merge

- **Chỉ squash merge.** Một PR = một commit trên `main`, message là **squash commit message đã đạt §1** (type, scope, description ≤72, body what/why, footer `Closes #n`).
- Sửa squash message **trước khi** bấm merge; đừng để "Update PR from base" hay 7 commit `fix typo` vào `main`.
- PR một tính năng lớn có thể giữ history → chọn *merge commit* và **phải** bật gate kiểm tra message từng commit; mặc định là squash.
- `main` xanh là hợp đồng: commit nào đỏ CI cũng bị revert bằng `revert:` (§1.3), không "sửa dần trên main".

---

## 5. Quy ước code

### 5.1 Cấu trúc monorepo và module theo feature

```text
root/
├─ apps/
│  ├─ web/               ← React + TS + shadcn/ui + Recharts
│  ├─ api/               ← Express + TS
│  └─ ai-service/        ← Python + FastAPI
├─ packages/
│  ├─ contracts/         ← zod schema → OpenAPI → Orval client
│  ├─ config/
│  └─ eslint-config/
├─ docs/
├─ pnpm-workspace.yaml
└─ package.json
```

Mỗi feature một module, không phân lớp theo kỹ thuật (`controllers/`, `services/` toàn cục). Template bắt buộc:

```text
modules/<feature>/
  <feature>.controller.ts    ← thin: đọc request, gọi service, trả về
  <feature>.service.ts       ← nghiệp vụ + state machine + guard
  <feature>.repository.ts    ← Mongo, duy nhất chỗ chạm mongoose
  <feature>.schema.ts        ← zod: input, output, tool args
  <feature>.routes.ts        ← mount path + middleware auth/RBAC
```

- Controller mỏng; nghiệp vụ ở service; repository không chứa luật nghiệp vụ; **không** import `mongoose`/`express` trong `domain/`, `ai-service` **không** import model của API, không circular deps (gate `dependency-cruiser`, `RESEARCH-PLAN.md` §11).
- Type chia giữa `apps/web` và `apps/api` đi qua `packages/contracts`: **`Zod schema → OpenAPI → Orval → typed React client`** (NOTES-01 B2). Không viết tay type trùng lặp, **không sửa** code do Orval sinh; muốn đổi shape là đổi zod schema rồi regenerate.
- Pipeline xử lý request luôn là: `validate (zod) → authorize (RBAC) → service → repository`.

### 5.2 Naming

| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| File module | `<feature>.<layer>.ts`, kebab cho nhiều từ | `auth.routes.ts`, `kpi-override.service.ts` |
| Biến/hàm | `camelCase`, động từ + danh từ | `rotateRefreshToken()`, `findCandidates()` |
| Class/type/interface | `PascalCase`, không `I`/`T` tiền tố | `RefreshSession`, `ToolResult` |
| Hằng cấp module | `SCREAMING_SNAKE_CASE` | `MAX_AGENT_STEPS` |
| State của đề tài | `UPPER_SNAKE` khớp `NOTES-01` B4 | `PENDING_REVIEW`, `COMPLETED` |
| Collection Mongo | số nhiều, `camelCase` field | `employees.employeeCode`, `projects.statusHistory[]` |
| Tool của Agent | `snake_case`, khớp catalog B6 | `get_my_profile`, `submit_report` |
| WS event | `<domain>:<action>` quá khứ/hiện tại, khớp B7 | `chat:chunk`, `project:updated` |
| WS room | `user:<id>` / `department:<id>` | `user:emp_42` |
| Role/level | `Admin`, `Employee`; `Intern`, `Junior`, `Middle`, `Senior`, `Lead` | — |
| Test file | `<module>.<layer>.test.ts` / `test_<subject>.py` | `auth.service.test.ts` |
| Nhánh Git | §4.1 | `feat/ai-calibration-endpoint` |

Hai trục quyền **không trộn** (NOTES-01 B3): `role` = quyền hệ thống, `level` = dữ liệu nghiệp vụ. Đừng viết `if (user.level === 'Senior')` cho luật phân quyền.

### 5.3 TypeScript

- `strict: true` ở mọi package TS; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` bật nếu đã dựng scaffold (không tắt để code chạy được).
- **Không `any`.** Không `@ts-ignore`, không `@ts-expect-error` trừ khi có comment giải thích **và** issue theo dõi. `unknown` ở biên + `zod.parse` trước khi dùng.
- Type dữ liệu nghiệp vụ định nghĩa một lần ở `packages/contracts`; không sao chép hand-written sang `apps/web`.
- `async` everywhere, không promise trần; mọi `await` nằm trong phạm vi có xử lý lỗi (§5.6).
- `enum` của TS tránh dùng cho state machine; dùng union literal + bảng transition trong service (nguồn B4).

### 5.4 Comment — viết thưa, và chỉ khi "why" không hiển nhiên

- Code tự giải thích *cái gì* và *như thế nào*. Comment chỉ để trả lời *tại sao*: ràng buộc nghiệp vụ, quyết định trong `NOTES-01`/ADR, workaround của thư viện, lý do không dùng cách hiển nhiên hơn.
- Comment ngắn, **tiếng Anh**, đặt trên dòng code bị nghi hoặc. JSDoc chỉ cho API công khai ở `packages/contracts` và service boundary.
- Cấm: comment thuật lại diff (`// set status`), comment ghi tên người/nhánh ngày tháng (git blame đã có), comment giữ code cũ (`// old logic` → xoá đi), TODO không issue → phải thành `TODO(#48): ...`.
- Với mỗi chỗ sau thì **nên** có comment: transition hợp pháp của state machine, lý do `OVERDUE` là dẫn xuất chứ không phải state, ngưỡng abstention/calibration, vì sao tool ghi phải confirm, vì sao transaction không dùng cho multi-collection (B1/B4).
- Tài liệu và docs không được phình thay comment: quá dài thì nó thuộc `docs/`, không thuộc file nguồn.

### 5.5 Dữ liệu, log và secret

- **Zod ở mọi boundary**: body/query/params HTTP, payload WS, và **mọi đối số LLM trả về cho tool** trước khi thực thi (NOTES-01 B6 — "Zod validate every argument"). Tool schema + RBAC check + audit log là ba bước bắt buộc của một tool call.
- **Không log secret**: không in token, password, `tokenHash`, connection string, header `Authorization`, cookie; không log nguyên văn nhận xét của nhân viên. PII phải được che hoặc thay bằng hash (`ipHash` trong B3 là ví dụ mẫu).
- Không có secret trong repo: cấu hình qua biến môi trường, `gitleaks` chạy ở pre-commit và CI — **1 secret leak = fail build** (RESEARCH-PLAN §11).
- Không hard-code ID, threshold, template câu trả lời; hằng số nghiệp vụ nằm trong `packages/config` hoặc service tương ứng và có test.

### 5.6 Xử lý lỗi tập trung

- Một chỗ duy nhất cho API: Express error middleware + **error catalog** trong `06-api-spec.md` (RESEARCH-PLAN §2). `service` ném domain error có mã; controller **không** `try/catch` trả JSON tự do.
- Client không bao giờ thấy stack trace hay message của Mongo; chỉ `code` + `message` đã duyệt, message tiếng Anh.
- Lỗi phía AI service: FastAPI trả cấu trúc, API Node là caller nên mapping sang mã của catalog; không nhân bản danh sách lỗi.
- Agent Loop guard là một khối duy nhất (NOTES-01 B6): `maxSteps = 5`, `toolTimeout`, LLM timeout, max tool result size, RBAC check mỗi tool, Zod validate mỗi đối số, xác nhận cho tool ghi, audit mỗi mutation. Không có chỗ cho tool nào tự nới guard.
- SaaS ngoài tier hết quota → rơi về đường dự phòng có chủ đích (S9 trong `RESEARCH-PLAN.md` §9), không ném lỗi trần cho người dùng.
- Không `process.exit()` trong request path; không nuốt lỗi (`catch {}`), không `Promise` mồ côi.

---

## 6. Enforce bằng máy, không bằng lời nhắn

### 6.1 Local hook (husky + commitlint + lint-staged) — mô tả hành vi

| Móc | Hành vi | Kết quả khi fail |
|---|---|---|
| `pre-commit` → **lint-staged** | Chạy eslint + prettier **trên các file đã stage**, không quét cả repo | File bị format lại rồi phải stage lại; commit bị chặn |
| `pre-commit` → **gitleaks** | Quét secret trong diff đang stage | Chặn commit (NOTES-01 B10; RESEARCH-PLAN §11) |
| `commit-msg` → **commitlint** | Kiểm tra cú pháp §1: type nằm trong bảng §1.3, scope nằm trong whitelist §1.2, description ≤72 và không dấu chấm cuối, `feat`/`fix` phải có tham chiếu issue, `!` phải kèm `BREAKING CHANGE:` | Commit bị từ chối kèm danh sách luật vi phạm |
| `pre-push` | Chạy typecheck + unit test của package bị ảnh hưởng (affected) | Push bị chặn |

Không ai được tắt hook (`--no-verify`) "cho kịp". Cần nới luật nào thì sửa **cấu hình + tài liệu này** trong một PR `ci:`/`docs:` có review — gate nằm trong repo chứ không nằm trong đầu từng người.

### 6.2 Chuỗi gate CI (theo thứ tự NOTES-01 B10)

```text
install → lint → typecheck → unit → API integration → Python AI tests
        → AI regression gate → build → Playwright smoke → Lighthouse → gitleaks
```

| # | Gate | Một lệnh (script sẽ khai báo ở scaffold) | Chặn khi |
|---|---|---|---|
| 1 | install | `pnpm install --frozen-lockfile` | lockfile lệch `package.json` |
| 2 | lint | `pnpm lint` | eslint/phạm quy §5 |
| 3 | typecheck | `pnpm typecheck` | `tsc --noEmit` lỗi; `any` rò ra biên |
| 4 | unit | `pnpm test` (Vitest) | một unit test đỏ, 100% state-machine transition không đạt |
| 5 | API integration | `pnpm test:api` (Supertest + mongodb-memory-server) | response sai zod/OpenAPI, RBAC hở |
| 6 | Python AI tests | `pytest -q` (apps/ai-service) | eval harness lỗi, fixture đổi không kiểm soát |
| 7 | AI regression gate | `pytest -q tests/eval -m gate` | F1/P@5 tụt **quá 2 điểm** so với baseline công bố ở `09-ai-evaluation.md` (RESEARCH-PLAN §11) |
| 8 | build | `pnpm build` | web/api/ai-service không build được |
| 9 | Playwright smoke | `pnpm test:e2e` | luồng khói đăng nhập → tra cứu → nộp báo cáo gãy |
| 10 | Lighthouse | `npx @lhci/cli autorun --collect.production --assert` | LCP/INP/CLS vượt ngưỡng §7 |
| 11 | gitleaks | `gitleaks detect` | đúng 1 secret cũng đủ đỏ |

PR luôn chạy mocked deterministic agent test; **live provider evaluation chạy nightly/release** (NOTES-01 B10) — chi tiết ở `docs/11-quality-testing.md` §4.

### 6.3 Nguyên tắc chống "docs trang trí"

> **Không thêm gate nào nếu chưa có lệnh chạy nó trong CI.** (`RESEARCH-PLAN.md` §11)

Quy trình đảo ngược: muốn có luật mới ở file này → mở PR `ci:` thêm lệnh + gate trước, rồi mới viết luật. Bảng gate nào không còn lệnh tương ứng thì **xóa dòng đó** khỏi tài liệu, chứ không giữ cho đẹp báo cáo.

---

## 7. Core Web Vitals và ngưỡng hiệu năng (để commit/PR biết mình phải giữ gì)

Chuẩn ngoài, đo tại **percentile 75** (NOTES-01 B9):

| Chỉ số | Ngưỡng |
|---|---|
| LCP | ≤ **2.5 s** |
| INP | ≤ **200 ms** |
| CLS | ≤ **0.1** |

Internal target (ngưỡng nội bộ, **chưa phải chuẩn ngoài — phải benchmark trước khi đưa thành "kết quả"** trong báo cáo):

```text
CRUD read p95              < 300 ms
Dashboard aggregate p95    < 800 ms
Chat tool lookup p95       < 1 s
Warm embedding inference   < 500 ms
LLM first token            < 2.5 s
```

PR chạm `apps/web` (route, chart, bundle) phải kèm số Lighthouse trước/sau; PR chạm `apps/ai-service` hoặc repository phải kèm số benchmark tương ứng. Cách đo và bảng chi tiết nằm ở `docs/11-quality-testing.md` §6.

---

## 8. Lệch nguồn đã biết (ghi lại, không tự xử)

| # | Chỗ lệch | Các nguồn | Cách xử lý trong file này |
|---|---|---|---|
| 1 | Scope `task` vs `project` | `README.md` dòng 34 và RESEARCH-PLAN §3 B11 dòng 208 = `task`; NOTES-01 B11 dòng 420 = `project` | Theo **NOTES-01 B11**: `project`. `README.md` cần sửa trong PR `docs:` riêng |
| 2 | `docs` có trong scope không | README/§3 B11 không có; NOTES-01 B11 có | **Có** `docs` |
| 3 | `style`/`chore` | §3 B11 và README có `chore`; NOTES-01 B11 chỉ nêu spec + `feat`/`fix`/`BREAKING CHANGE` | Bảng type §1.3 dùng `style`, **không** dùng `chore`; cần GVHD/nhóm chốt nếu muốn giữ `chore` |
| 4 | URL nguồn | NOTES-01 dòng 6–8 và mục "CẦN BỔ SUNG": URL của B1/B5 chưa có | Không trích số nào vào báo cáo trước khi có URL; không phát minh URL mới |
| 5 | Báo cáo / định dạng | NOTES-01 **B12 = UNRESOLVED** | Không chốt template; phụ thuộc GVHD (xem `docs/11-quality-testing.md` §9) |

---

## 9. Luật phạm vi — chỉ lấy từ `RESEARCH-PLAN.md` §12

Áp dụng cho mọi commit/PR có chứa phần "sáng tạo thêm" (S-series). Năm luật, nguyên văn tinh thần §12:

1. **Sàn trước, trần sau.** F1–F7 + auth + deploy thật phải chạy được **trước tuần 9**. Không S nào được code trước cột mốc đó, trừ **S5/S8/S11/S13/S14** (tài liệu + hạ tầng, không đụng nghiệp vụ).
2. **Mỗi S phải ánh xạ về một luồng người dùng thật** trong `18-user-flows.md` (B0) **và phải đo được bằng số**. Không có luồng, không có số → dời sang `docs/backlog-parked.md` kèm lý do, không giữ trong plan.
3. **Không S nào được làm mờ F4/F5.** Hai chức năng AI là chỗ hội đồng chấm "chất khóa luận"; S nào giành thời gian của chúng thì S thua.
4. **Phạm vi sáng tạo phải được GVHD duyệt bằng văn bản/chat** (câu hỏi §7.8–§7.10) **trước khi** ghi vào `00-vision-scope.md`. Mỗi mục thêm phải trích được "sản phẩm X đang có luồng này" (bằng chứng từ B0) — không nhận lý do "thêm cho đẹp".
5. **Đóng băng tính năng ở tuần 11.** Sau đó chỉ: sửa bug, tối ưu, viết báo cáo.

Hệ quả thực tế khi mở PR: một commit `feat:` cho S chưa qua cửa 1–4 thì **không đủ Definition of Ready** (§4.2), reviewer từ chối mà không cần đọc code. Danh sách 5 S đã chọn và thứ tự `S14 → S3 → S2 → S1 → S6` ở `NOTES-01.md` phần "Kết luận kiến trúc sau vòng research"; mọi thứ ngoài đó là parked.
