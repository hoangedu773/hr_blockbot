# Chatbot service — Dọn nốt, tối ưu, commit chuẩn

Ngày: 2026-11-09 · Nhánh: `fix/integrate-kpi-notifications-261109` (HEAD `d011c83`)
Worktree: `C:/work-space/worktrees/hr-blockbot-f4-kpi-notifications`
Chế độ: agent chính tự thực thi, không giao subagent.

## Contract

**Outcome.** Nhánh sạch: không còn file chưa track, không còn code chết, PDF lên được Render, `catch {}` rỗng được thay bằng log có ích, plan được commit, và mọi commit có message Conventional Commits đúng scope. Phi đọc được lịch sử để biết phần nào là của ai.

**Constraints.**
- Không đổi hành vi nghiệp vụ; chỉ dọn dẹp và tối ưu có bằng chứng.
- Không sửa file domain của Phi trừ khi đã xác nhận bằng test.
- Commit theo Conventional Commits, scope whitelist `auth | hr | project | chatbot | ai | dashboard | realtime | docs | ci`.
- Không push `main`, không force-push.

**Non-goals.** Đổi deploy branch trên Render (việc của chủ dự án); P5 wiring (chờ hàm domain); gộp 39 cặp trùng tiêu đề (chờ Phi).

**Acceptance.**
- `git status` sạch (không untracked, không modified).
- `pnpm -r typecheck` và `pnpm --filter api build` + `pnpm --filter web build` xanh.
- API test: policy-acl 11, chat-v1 12, attachments 13, chat-streaming 22, chat-history 8, revenue-open-chat 4 — tất cả pass.
- AI service pytest 345 passed.
- Web chat-page test pass.

## Phase 1 — Dọn code chết và sửa `catch {}` rỗng

### 1.1 `ai-client.service.ts:461`

```ts
} catch {}
```

Nuốt lỗi khi parse error body từ AI service. Nếu AI trả JSON hỏng, mất toàn bộ thông tin debug. Sửa: log một dòng có `response.status` và loại lỗi parse, không log body (có thể chứa PII).

### 1.2 Kiểm `TOPICS` và các biến chết khác

`TOPICS` đã bị xoá trong đợt sửa nav trùng. Cần quét lại: biến khai báo không dùng, import không dùng, function không gọi trong các file chatbot.

## Phase 2 — PDF lên Render

`data/` bị gitignore (`.gitignore:85`) nên 29 MB PDF trong `data/guta_rescued_pdf/` không có trên Render → mọi `attachments` trả 404 ở production.

Ba cách, chọn cách rẻ nhất đúng yêu cầu "chưa up thì up":

| Cách | Việc | Mất |
|---|---|---|
| **Chọn: đưa PDF vào repo** | Bỏ `data/guta_rescued_pdf/` khỏi gitignore (dùng negation `!data/guta_rescued_pdf/`), commit 53 file | Repo tăng 29 MB; Git LFS không dùng nên clone chậm hơn |
| Đóng gói lúc build | Thêm bước copy trong Render build command | Phải sửa cấu hình Render (ngoài quyền repo) |
| Serve từ Drive | Trả link Drive thay attachment | Mất kiểm soát quyền, link có thể bị thu hồi |

Negation trong `.gitignore` là thay đổi 2 dòng, không cần đụng Render. 29 MB là mức chấp nhận được cho một repo nội bộ.

## Phase 3 — Tối ưu có bằng chứng

### 3.1 `get_my_tasks` gọi 2 lần

`authorization_gateway.py:451` và `:462` — khi câu chứa cả "doanh thu" và "nhiệm vụ", `get_my_tasks` được thêm vào `calls` hai lần. Sửa: dedupe `calls` trước khi fetch.

### 3.2 Citation chỉ lấy top-1 article

`bestChunkMeta` trả `article` của chunk cao điểm nhất. Câu trả lời trải 2 điều khoản thì mất điều thứ 2. Sửa: trả `articles: string[]` cho cả 2 chunk trong top-2 (đã có sẵn danh sách), citation mang mảng.

Rủi ro: đổi shape `citation.article` từ `string` sang `string[]` — phải giữ tương thích ngược (union type hoặc field mới `articles`).

### 3.3 Không làm

- Gộp 39 cặp trùng: cần Phi quyết bản chuẩn.
- Bật hybrid retrieval: cần index + gold set.

## Phase 4 — Commit chuẩn và báo Phi

Chia commit theo đơn vị logic, mỗi commit một mục đích:

| Commit | Nội dung |
|---|---|
| `chore(chatbot): drop unused declarations left after merge` | Phase 1.2 |
| `fix(chatbot): log the AI error body parse failure instead of swallowing it` | Phase 1.1 |
| `fix(ai): dedupe scoped tool calls when intents overlap` | Phase 3.1 |
| `feat(chatbot): cite every matched article, not only the top chunk` | Phase 3.2 |
| `docs(chatbot): record the corpus, ACL, and PDF operating notes` | `docs/27-*`, plan files |
| `build(ci): track the rescued policy PDFs so Render serves attachments` | Phase 2 |

Sau đó comment vào issue #3: đính chính bảng claim giờ đã đúng 9/9 (sau `aee1a42`), liệt kê các commit mới, và ghi rõ phần nào là của ai.

## Thứ tự

1 → 2 → 3.1 → 3.2 → 4 (commit theo nhóm ngay sau mỗi phase để dễ revert).

## Rủi ro

- Phase 2 làm repo tăng 29 MB; nếu chủ dự án không muốn, đổi sang Render build step.
- Phase 3.2 đổi shape citation — phải giữ field cũ để UI không vỡ.
- Phase 1.1 thêm log có thể lộ PII nếu log body; chỉ log status + error class.

## Câu hỏi chưa chốt

1. Đưa 29 MB PDF vào repo (Phase 2) — đồng ý hay muốn dùng Render build step?
2. Phase 3.2 đổi citation sang mảng `articles` — chấp nhận thay đổi contract này chứ?
