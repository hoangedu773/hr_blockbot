# Account-owned chat history

The web chat saves new questions and validated answers on the API's configured MongoDB database. Returning from HRM, reloading, signing in again, or using another browser with the same account opens the most recently active conversation. The sidebar also lists older conversations. Starting a new conversation does not delete previous conversations.

## Storage and compatibility

- `chat_conversations`: server-generated UUID, owner, first-question title, activity time and a short request lease.
- `chat_conversation_turns`: separate bounded documents for each question/answer; no growing message array on the conversation. Pending, failed and interrupted questions remain visible.
- Compound indexes support owner-scoped cursor pagination and idempotent client request IDs. A retry with the same ID does not invoke the provider again. No automatic deletion or retention policy is introduced.
- New web clients send `clientMessageId` to `POST /api/chat` and receive a persisted turn. Clients omitting this field retain the existing response contract. Existing Socket chat behavior is unchanged.
- Endpoints: `GET /api/chat/conversations`, `GET /api/chat/conversations/:id/messages`, and optional idempotent `POST /api/chat/conversations`.
- API and web should deploy in that order. The first authorized persisted send explicitly creates only these two collections and their indexes, including when global `autoCreate`/`autoIndex` are disabled. Missing permissions fail closed with 503; existing indexes are not dropped or synchronized. Existing HRM documents need no migration.
- Rolling back the web first restores the old client without deleting history; then the API may be rolled back. Preserve the new collections for a later compatible release.

## Access and recovery

Every read/send resolves the current principal and requires `chatbot.data_read`. Conversation ownership is checked independently of managerial scope. Technical administrators do not receive access to other people's conversations. Responses are private/no-store; message text is not kept in browser storage.

Historical assistant text is hidden when the current authority differs from the authority at response time, or document ACL/content, project visibility/version, or personal schedule receipts no longer validate. User questions remain visible to their owner. Tokens, credentials, provider keys, and executable actions are not stored as history metadata. Restored history does not replay an action.

Provider output is saved only after existing Authorization V1 final validation. Conversation and turn CAS leases prevent simultaneous duplicate generation and fence expired requests. A browser navigation does not cancel server persistence. An expired pending request becomes interrupted on the next history read/send; reopening does not automatically call AI again.

This feature persists the transcript for display; it does not change the AI's prompt context or implement multi-turn reasoning. Conversations lost before persistence was introduced cannot be recovered from browser memory.

## Verification

After contracts/API/web builds:

```sh
pnpm --filter api test:chat-history
node --test packages/contracts/test/chat-history.test.mjs
pnpm --filter web test:chat-history
```

The browser integration requires a web build with `VITE_API_BASE=/api`; it starts its own MongoDB and API and mocks only the upstream AI HTTP transport. It covers HRM navigation, refresh, sign-out/sign-in, two-account isolation, multiple conversations, leaving during generation, and mobile selection. API tests additionally exercise ownership across the nine profiles, ACL/grant revocation, stale sessions, pagination, duplicate requests, lease expiry and late-response fencing. These local tests are separate from live Render verification.
