# Account-owned chat history

The web chat saves new questions and validated answers on the API's configured MongoDB database. Returning from HRM, reloading, signing in again, or using another browser with the same account opens the most recently active conversation. The sidebar also lists older conversations. Starting a new conversation does not delete previous conversations.

## Storage and compatibility

- `chat_conversations`: server-generated UUID, owner, first-question title, activity time and a short request lease.
- `chat_conversation_turns`: separate bounded documents for each question/answer; no growing message array on the conversation. Pending, failed and interrupted questions remain visible.
- Compound indexes support owner-scoped cursor pagination and idempotent client request IDs. A retry with the same ID does not invoke the provider again. No automatic deletion or retention policy is introduced.
- `ChatPageView` sends `clientMessageId` to `POST /api/chat/stream` and consumes SSE events. `POST /api/chat` remains the JSON endpoint for existing clients; existing Socket chat behavior is unchanged.
- Endpoints: `GET /api/chat/conversations`, `GET /api/chat/conversations/:id/messages`, and optional idempotent `POST /api/chat/conversations`.
- `DELETE /api/chat/conversations/:id` is owner-only and idempotent. It removes the title and transcript and retains a minimal owner/ID/deletion-time tombstone for replay protection. Deleted conversations cannot be read, continued or recreated with an old request ID. Pending provider replies are fenced and discarded. No HRM records or business audit trail are deleted.
- API and web should deploy in that order. The first authorized persisted send explicitly creates only these two collections and their indexes, including when global `autoCreate`/`autoIndex` are disabled. Missing permissions fail closed with 503; existing indexes are not dropped or synchronized. Existing HRM documents need no migration.
- An older web client can run against the new API. Once deletion has been used, retain the API deletion guards during rollback; an older API that ignores tombstones must not accept chat writes. Preserve the history collections rather than dropping data during a code rollback.

## Access and recovery

Every read/send resolves the current principal and requires `chatbot.data_read`. Conversation ownership is checked independently of managerial scope. Technical administrators do not receive access to other people's conversations. Responses are private/no-store; message text is not kept in browser storage.

Historical assistant text is hidden when current authority differs from response time or a recorded source receipt no longer validates. New authorized-chat receipts cover the scoped policy, project, schedule, KPI, profile, directory and candidate-suggestion reads. Candidate suggestions pin their evaluation time so replay compares the same snapshot. Older turns missing newer receipt fields retain their historical evidence coverage; no receipt is fabricated. User questions remain visible to their owner. Tokens, credentials, provider keys, and executable actions are not stored as history metadata. Restored history does not replay an action.

Provider output is saved only after Authorization V1 final validation. Streaming also revalidates current authority and resource evidence before each emitted chunk; chunks already received cannot be recalled. A safety error clears the partial display and is not stored as a completed answer. Navigating away, signing out, or starting a new chat cancels an in-flight stream; conversation and turn leases fence cleanup and later requests. A turn already committed before cancellation is not retroactively deleted. Expired pending requests become interrupted on a later history read/send; reopening does not automatically call AI again.

This feature persists the transcript for display; it does not change the AI's prompt context or implement multi-turn reasoning. Conversations lost before persistence was introduced cannot be recovered from browser memory.

## Verification

After contracts/API/web builds:

```sh
pnpm --filter api test:chat-history
node --test packages/contracts/test/chat-history.test.mjs
pnpm --filter web test:chat-history
```

The browser integration requires a web build with `VITE_API_BASE=/api`; it starts its own MongoDB and API and mocks only the upstream AI HTTP transport. It covers HRM navigation, refresh, sign-out/sign-in, two-account isolation, multiple conversations, leaving during generation, mobile selection, deletion confirmation/cancellation/Escape and deleting selected/unselected conversations without reappearance after reload. API tests additionally exercise ownership across the nine profiles, ACL/grant revocation, stale sessions, pagination, duplicate requests, lease expiry, owner-only deletion, replay after deletion and late-response fencing. These local tests are separate from live Render verification.
