# Danh mục 10 Mục tiêu REA Clean-Room — Architecture & Interaction Analysis

Tài liệu được khởi tạo theo phương pháp **Clean-Room Reverse Engineering**:
1. **Investigator (REA)**: Bóc tách bằng chứng qua CDP / Network HAR / DOM Snapshot. Tạo file `SPEC-<target>.md`.
2. **Auditor (ak-fable-thinking)**: Chỉ duyệt quy tắc có ID bằng chứng (`E1..En`). Loại bỏ suy diễn không có bằng chứng.
3. **Builder (ak-cook / session mới)**: Xây dựng lại tính năng chỉ dựa trên `SPEC-<target>.md`, tuyệt đối không đọc mã nguồn gốc.
4. **Tester (Mutation Test)**: Viết test suite và kiểm định đánh trượt 100% các biến thể cố tình tạo lỗi.

---

## 10 Mục Tiêu Tiềm Năng & Luồng Bóc Tách

| # | Mục tiêu | URL / Nền tảng | Tính năng trọng tâm bóc tách (Feature Scope) | Bằng chứng cần thu hoạch |
|---|---|---|---|---|
| **01** | **Chatbase Widget** | `https://www.chatbase.co` | SSE Streaming Chat, Session persistence, Citations data part | HAR `/api/chat/*`, DOM text delta |
| **02** | **Vapi AI Web SDK** | `https://vapi.ai` | WebSocket audio streaming, Function call UI indicator | WS event frame, latency metadata |
| **03** | **Cal.com Embed** | `https://app.cal.com` | Booking state machine, múi giờ, slot conflict lock | POST reservation, iframe message contract |
| **04** | **Typebot Runtime** | `https://typebot.io` | Conversational form, dynamic branching, variable memory | Step transition payload, form state schema |
| **05** | **Formbricks Widget**| `https://formbricks.com` | In-app popover trigger, user attribute filtering | Trigger evaluation engine, telemetry HAR |
| **06** | **Dify Workflow UI** | `https://dify.ai` | Streaming markdown chunks, LLM execution node trace | SSE multi-part stream, node execution state |
| **07** | **Linear Palette** | `https://linear.app` | Keyboard command palette (`Cmd+K`), offline queue | Keyboard event bus, optimistic action dispatch |
| **08** | **Tidio Chat** | `https://www.tidio.com` | Live chat + Bot handover, bot typing indicator | Socket frame sequence, operator queue state |
| **09** | **Supabase Auth** | `https://supabase.com` | PKCE flow, Session family refresh, Cookie storage | Token refresh request, replay detection header |
| **10** | **PostHog Toolbar** | `https://posthog.com` | Cross-origin DOM inspection, injected canvas overlay | Event batching interval, shadow DOM boundaries |

---

## Cấu trúc Báo cáo Chuẩn cho Mỗi Target (`SPEC-<target>.md`)

1. **Evidence Ledger**: Danh sách file HAR, JSON trace, ảnh chụp màn hình kèm mã băm SHA-256.
2. **Request Contract**: Method, Headers, Body, trường danh tính client.
3. **Response Protocol**: SSE/WebSocket frames, status codes, cấu trúc error envelope.
4. **State Machine & Invariants**: Trạng thái UI (6 states), xử lý mất kết nối, cơ chế retry.
5. **Chưa biết (§8 Unknowns)**: Những hành vi không thể chứng minh bằng dữ liệu quan sát.
