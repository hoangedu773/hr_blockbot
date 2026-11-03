# HR BlockBot — AI Service

## Authorization V1 runtime (local implementation, not a deployment claim)

`python start.py` starts `app.authorization_gateway:app`. This transport adapter
reuses the existing provider chain without changing matching/PhoBERT algorithms.
It does not import the legacy Mongo/tool runtime or retrieve a local policy corpus.

- The Express API authenticates the signed-in user, opens a short-lived,
  audience/request/security-version-bound receipt, then calls
  `POST /api/v1/authorized-chat` with a separate service key.
- This adapter calls only allowlisted tools on the trusted
  `AUTHORIZATION_API_ORIGIN` configured by the operator. Identity, scope, fields,
  document ACLs and final output validation are controlled by the API, not prompts.
- Documents without approved ACL classification are denied before content retrieval.
  Provider-generated citations, attachments and write actions are not trusted;
  the API emits only revalidated server receipts. Writes remain proposal-only.
- Legacy `/api/v1/chat` and `/api/v1/rag/query` return 403 in this entrypoint.
  Direct calls without service authentication and a valid end-user delegation fail.
- The V1 service does not require or receive `MONGODB_URI`. Configure the separate
  service key and trusted API origin using `.env.example`; never commit credentials.

`app.main` and legacy evaluation/probe scripts are retained for offline regression
of the other member's AI work. They are **not** the V1 application entrypoint and
must not be mounted as a fallback to bypass authorization. The old agent flag does
not authorize the V1 transport to execute writes.

### JevAI V1 live adapter

For a key issued by **usejevai.com**, configure `JEV_V1_PROVIDER=usejevai` and
`USEJEVAI_API_KEY` server-side, in addition to LIVE + explicit external-text
opt-in. This is a separate provider from thejevai.com; their keys are not
interchangeable. See https://usejevai.com/jev-api.

V1 submits one idempotent `prefer_trial` run to the pinned UseJevAI origin,
polls that run within the request deadline and validates the three typed
answers. Unknown/failed/late runs degrade without resubmitting or switching
to purchased funding. Only the user message crosses this decision boundary;
user identities, grants, policy context, provider credentials and delegation
tokens are excluded. Source is accurately labelled `jev_usejevai`.
This adapter does not import the legacy agent/tools/Mongo runtime.

The V1 gateway includes an explicit, fail-closed Jev System One adapter. It runs
only after the API's `validate_context` preflight succeeds and receives only the
user's message; it never receives Mongo credentials, delegation tokens, user
context, or tool results. Jev output is typed intent/urgency/approval metadata,
not authorization and not an automatic action approval.

Live execution requires all three operator settings:

```bash
JEV_V1_MODE=LIVE
JEV_LIVE_ALLOW_EXTERNAL_TEXT=true
JEV_API_KEY=<operator-managed-secret>
```

With any setting missing, the adapter returns a non-authoritative status. `OFF`
remains the default and `SHADOW` remains synthetic-only. The existing
`JEV_USEJEVAI_KEYS` queued adapter remains available in the legacy/offline agent
lane; it is not silently substituted into V1 because its transport has different
semantics and budget behavior.

## Cài đặt & Chạy:

```bash
cd apps/ai-service
pip install -r requirements.txt
python start.py
```

## Kiểm thử:

Two lanes, both required before a merge that touches `apps/ai-service`:

```bash
# Default lane: only what app.authorization_gateway:app actually mounts
pytest -q

# Legacy lane: app.main, agent loop, RAG corpus — offline regression only
pytest -q -m legacy

# Hermetic V1 transport tests (mock API/provider, no database or real account)
pytest tests/test_authorization_gateway.py -q
```

`pytest.ini` sets `addopts = -m "not legacy and not eval"`; `tests/conftest.py`
assigns the `legacy` marker by module name. `tests/test_v1_runtime_boundary.py`
fails if the gateway ever starts importing `app.main`, `app.agent`, `app.rag` or
`app.db`.

Cross-language HTTP integration (from the repository root, after building API):

```powershell
pnpm --filter api test:authorization-python
```

This separate gate needs the isolated Python environment
`apps/ai-service/.venv-authz-v1` (or an explicit `AUTHORIZATION_TEST_PYTHON` path).
It launches real Express/Python processes and its own throwaway MongoDB; an owned
HTTP proxy serves a synthetic provider. No production URL guard is bypassed or
changed, no real model is called, and Python receives no Mongo credentials.

Endpoints:
- Interactive Swagger/Redoc are disabled in the V1 entrypoint.
- Health check: `http://localhost:8000/health`
- Liveness probe: `http://localhost:8000/health/live`
- Readiness probe: `http://localhost:8000/health/ready`

Liveness only proves that the process responds. Readiness verifies the configured
API dependency; it does not assert provider availability, user permissions, public
blockchain anchoring or that a production rollout/migration has taken place.
