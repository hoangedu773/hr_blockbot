# Jev SHADOW adapter — V1 runtime

`app.authorization_gateway:app` remains the sole V1 entrypoint. No AgentLoop,
ToolRuntime, legacy corpus or chatbot writes are enabled.

- `JEV_V1_MODE=OFF` (default): original four scoped tool reads/checks, no analysis
  call and no analysis metadata. Browser-supplied mode/identity is not a flag.
- `SHADOW`: observational metadata only. Before an eligible analysis, the API
  verifies the current request-bound principal via `validate_context`. The
  original four reads/checks still follow; final Node principal/ACL/resource
  validation and receipt closure are unchanged.
- `ADVISORY` and unknown modes are unsupported; they cannot activate analysis.

## Mock-only boundary

This phase has **no live Jev transport configuration**. A trusted test harness can
install `app.state.jev_synthetic_mock = SyntheticMockConfig(...)` with an exact
`httpx.MockTransport` and an exact, explicit set of synthetic messages. The public
runtime installs no fixture. Even `SHADOW` plus legacy `JEV_API_KEY` values cannot
start a real request. No key is loaded for analysis; the mock uses a fixed fake
credential and instance-local default settings. Non-fixture text is skipped, not
regex-masked and assumed safe. No scoped context, document or end-user token goes
to Jev. OFF does not initialize JevGateway.

The adapter calls the existing JevGateway and validates TypedDecision. JevGateway
only gained instance-local settings injection and remaining-deadline binding;
its classification prompts, response interpretation and transports are reused.
No PhoBERT/matching algorithm is changed.

`decisionSource` remains `authorization-v1`. Optional `decisionAnalysis` contains
SHADOW mode/status, `execution: mock` for success, bounded probabilities and
latency. It is never an approval or capability. Failed/skipped analysis has
`execution: none` and no claimed source. A valid answer continues after analysis
failure, if the original authorization and total request budget remain valid.
No analysis result enters the answer prompt, changes tools or creates an action.

The request-local deadline (maximum 15 seconds) covers preflight, mock analysis,
scoped reads and answer generation. Analysis gets a bounded fraction of remaining
time. Worker capacity is limited; a timed-out mock result is discarded. Python
cannot forcibly interrupt arbitrary synchronous mock-handler code, so tests must
finish their owned handlers; late work cannot write CRM data or replace a reply.

## Verification

- Offline Python: `pytest -q` (live tests disabled; network blocked).
- Cross-language: `pnpm --filter api test:jev-shadow` after shared-contract build.
  Owns isolated Mongo, Node API, Python fixture, mocked Jev HTTP and a loopback
  synthetic answer provider. The full API test command includes this integration.
- Contracts/Node/Socket preserve absent metadata and reject unapproved analysis
  modes, live provenance, invalid probabilities and extra authority fields.
- No UI action/executor was added; web Socket types reuse shared contracts.

Live Jev needs separate approval of provider/transport, synthetic testing budget,
privacy/retention, real secret handling and end-to-end evidence. A mock source
label, configured key or legacy live-check result does not prove V1 live usage.
