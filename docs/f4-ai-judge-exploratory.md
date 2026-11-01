# F4 — AI Judge, isolated exploratory evaluation

This is a separate synthetic research tool. AI_GENERATED relevance is weak supervision, not human gold, production accuracy, F1 or official F4 acceptance. It never populates reviewer A/B, independentHumanAttestation or approval. The official evaluator and human approval gates remain unchanged.

## Inputs and blinding

The live cloud command accepts only the canonical, hash-pinned 20×10 synthetic pilot. It projects **requiredSkills, description and candidate.skills**. Each pair receives a random opaque ID; pair order is shuffled by a hash. Original IDs, scenario, group, dev/test split, workload, baseline/PhoBERT scores and rankings are not transmitted. The source map stays local. The Judge does not use PhoBERT, RAG, provider cabinets, Atlas, CRM or authorization data.

Rubric 0/1/2 retains the proposed evidence definitions: no useful evidence / some but not all requirements / all requirements supported. The AI-only extension uses a provisional integer plus uncertain=true and an explicit question for human checking. This does **not** change the official human rubric, whose uncertain labels remain null. All uncertain AI pairs remain in the exploratory report; none is silently discarded. Instructions embedded in skill text are untrusted data, not tools or executable commands.

## Provider safety

`eval/f4_gemini_judge.py` is an isolated native Gemini transport. It does not change the application provider chain. Fixed HTTPS origin, header-only secret, no redirects/proxy inheritance, no grounding/tools/files, no paid or alternative-model fallback. One explicitly configured key only; no rotation to evade per-project quotas. The tool requires an owner Free-tier/no-linked-billing confirmation before reading the isolated key or constructing the HTTP client. This confirmation is an owner assertion, **not independently verified billing evidence**; the content-generation endpoint does not expose a trustworthy billing-tier check. Never link billing to make this evaluation run.

The approved live model is pinned to `gemini-3.5-flash-lite`; there is no automatic model switch. A new Structured Outputs phase first sends at most two **unlabelled** pairs with `--smoke-only`. Inspect live schema/modelVersion/Free-tier evidence before `--resume` for the rest. Previously accepted pairs remain untouched. Later batches have at most five pairs (default four). Each batch must have all IDs once and pass structural **and** semantic checks. JSON syntax/envelope/incomplete-batch failures can retry at most twice per pair (three attempts) and at most six times per run, each with a new request ID and original response preserved. Foreign/duplicate identities, invented skills, contradictory evidence/grade, wrong model, auth, quota and transport failures are not retried automatically. No LLM or regex repairs malformed JSON. The minimum request interval remains13seconds; this is pacing, **not a guarantee** of project RPM/TPM/RPD availability.

HTTP400/INVALID_ARGUMENT migration failures have a separate hard limit of four rejected requests (initial+three configuration attempts). Credential-rejected400 cannot enter this recovery path. Every400 remains visible in counts/history; these are not model labels. V4 reached that limit. V5 has a separately authorized, persisted **three-POST diagnostic budget**, not a reset of V4. Boolean probes and mocked smoke results cannot authorize continuation. `--verified-v5` requires a saved, hash-checked LIVE_GEMINI real-pair smoke from that diagnostic ledger and imports its labels once. Any new HTTP400 on the verified profile stops further batch calls; the original four failures remain intact.

The append-only, fsynced `request-events.jsonl` records request intent and an atomic validated batch. Resume checks input/manifest/prompt hashes, canonical evidence, existing pairs and identical model/version/confirmation. A run lock prevents two writers. `--recover-unlabelled` explicitly enables owner-approved recovery of previously unfinished unlabelled work: a valid saved response with measured latency and matching version can commit offline without a new call; otherwise an abandonment/failure/recovery event is appended, never altering the prior request or text. Only still-unlabelled pairs may be newly requested. Auth/quota terminal errors cannot be cleared through this flag. Corrupt/truncated events fail closed. These local integrity checks are not cryptographic provider attestations.

`eval/report_f4_ai_progress.py --run <run-dir> --confirmation <owner-confirmation.json> --output <new-dir>` is offline-only. It exports previously validated results as `ai-generated-labels.partial.json` with status INCOMPLETE, plus counts, uncertainty, unfinished request IDs and accepted-request latency. Inspection of unfinished work is not permission to resume it. Partial exports are deliberately rejected by the exploratory benchmark gate.

Structured schema is generated from the requested opaque IDs and includes relevance integer0/1/2, reason, per-requirement evidence/status, uncertain and uncertaintyReason. The current native REST shape is `generationConfig.responseFormat.text={mimeType:"APPLICATION_JSON",schema:...}`; do not confuse SDK `responseJsonSchema` or Interactions `response_format` examples with native generateContent. The endpoint remains v1beta/models/gemini-3.5-flash-lite:generateContent, with no Interactions migration. V5's three live diagnostic results were: tiny object+boolean HTTP200; real two-pair bounded schema HTTP400; **identical real request except four array-cardinality fields removed HTTP200**, with both labels passing the existing local validator. This isolates a sufficient fix to that schema group, **not** the individual offending keyword/value or Google's compiler internals. It is not evidence that minItems/maxItems are globally unsupported. The verified profile removes only those provider-side bounds; complete batch cardinality, unique/known IDs, per-requirement evidence and semantic consistency remain enforced locally. See the saved V5 request bodies and `payload-comparison.json`; the V5 report records final dataset counts rather than assuming completion from a smoke test.

Gemini3.5 transport removes deprecated sampling and candidate-count settings, and sets thinkingLevel=minimal. A text Part may carry an opaque `thoughtSignature` according to Google's API schema; it is ignored and never logged or echoed. Hidden-thought Parts, code, tools and other unknown content remain denied. Synthetic JSON answer text and sanitized response metadata are retained before strict label parsing, so future schema failures can be investigated without regrading a successful response. Full upstream HTTP error bodies, signatures and secrets are not retained. HTTP400 diagnostics retain only filtered status/message, detail type names and field/description violations if supplied. Exact credentials, key-shaped tokens, authorization tokens and emails are redacted; generic INVALID_ARGUMENT with no field violations is reported as such, not assigned an invented cause.

Each grade requires per-requirement status MET/PARTIAL/NOT_EVIDENCED/UNCLEAR, exact supporting input skill strings, a reason and explicit uncertainty. Unknown skills, contradictory grade/evidence, invented IDs, duplicate keys/IDs, tool calls, truncated responses and model-version drift fail closed. Metadata records both the selected model's declared version and the actual `modelVersion` returned by generation. A model appearing in `models.list` is **not proof** that generation works for that project.

Keys must stay outside source, command-line arguments and logs. Supply `F4_JUDGE_GEMINI_API_KEY` only to the owned evaluation child process, or use `--key-file` with an encrypted Windows current-user DPAPI file. `scripts/f4_judge_secret.py --store-stdin` receives a single key through stdin and creates `%USERPROFILE%/.codex/secrets/hr-blockbot-f4-judge.dpapi` exclusively, never overwriting another credential. Its check mode reports only configured/path/storage, not the secret. DPAPI binds decryption to this Windows user; it does not protect against a compromised process already running as that user. No application `.env`, registry environment variable, provider cabinet, machine security setting or Google billing configuration is changed. Do not paste new keys into chat. Upstream error bodies are not logged; diagnostics contain only status, type, fixed classifications and sanitized response metadata. On failure, no complete label file is produced.

The optional `eval/f4_ai_judge.py` local Ollama runner requires an explicitly selected existing GGUF completion model, a version digest, literal loopback origin, no cloud proxy and a conservative model-size/RAM budget. It does not pull models, install a server or weaken the application's SSRF guard. Mock transports carry MOCK_TRANSPORT provenance and cannot feed the live exploratory evaluator.

## Commands

Run from `apps/ai-service` using the existing lightweight test environment. Paths below are examples; output directories must be new.

```powershell
.\.venv-authz-v1\Scripts\python.exe eval/f4_ai_judge.py --export-only --output <new-blind-input-directory>
.\.venv-authz-v1\Scripts\python.exe eval/f4_gemini_judge.py --free-tier-confirmation <owner-confirmation.json> --key-file <user-private.dpapi> --output <new-run-directory> --smoke-only
.\.venv-authz-v1\Scripts\python.exe eval/f4_gemini_judge.py --free-tier-confirmation <same-owner-confirmation.json> --key-file <same-user-private.dpapi> --output <same-run-directory> --resume --batch-size 5
.\.venv-authz-v1\Scripts\python.exe -m pytest tests/test_f4_ai_judge.py -q
```

The smoke and resume commands require the isolated key; a DPAPI path is not a plaintext secret. Do not put the key into the command itself. `free-tier-confirmation.json` has fields version=1, status=CONFIRMED_FREE_TIER, provider=gemini, exact model, billingLinked=false, confirmedBy, confirmedAt with timezone and reference. Never manufacture a confirmation on behalf of an owner who has not agreed. These fields are **not relevance labels or human benchmark approvals**. The old gemini-2.5-flash artifacts remain readable as history, but cannot resume into a3.5run.

These are generic workflow examples, not instructions to reset or replay the existing journal. The V5 diagnostic ledger has spent all three allowed live probes; do not run another diagnostic against it. The existing run's verified continuation uses `--resume --recover-unlabelled --verified-v5 --batch-size 5` with the same confirmation and private key path. This is valid only while labels remain incomplete, the proof still validates and no terminal failure blocks continuation. Once the complete label file exists, the runner refuses regrading. The original17labels, four V4 failures, responses and request IDs must remain intact.

Only after all200 AI decisions validate, use the existing real F4 environment with unchanged pinned model/segmenter paths and JAVA_HOME for that child process:

```powershell
D:\hr-blockbot-f4-runtime\.venv-f4-v1\Scripts\python.exe eval/evaluate_f4_exploratory.py --labels <run/ai-generated-labels.json> --output <new-exploratory-report.json>
```

The evaluator checks label provenance, source and rubric hashes before loading PhoBERT. It refuses missing/partial/mock labels. The unchanged 2.5GiB RAM /4GiB free-disk gate applies before real PhoBERT loading; no synthetic encoder or fallback substitutes for it. A new benchmark requires a fresh real-model run; prior smoke latency is never reused as quality evidence.

## Evaluation and interpretation

Both rankings use the same ten candidates per task, no KPI. Alpha grid0/.25/.5/.75/1 is selected by dev NDCG@5 only, lowest-alpha tie-break. Test is evaluated only after selection, never used to choose alpha. Nothing changes runtime F4_MODE or production defaults. Reused metric math reports macro Precision@1/@3/@5, Recall@5, MRR and NDCG@5, zero-relevance queries, dev grid, held-out baseline/pure PhoBERT/selected blend, every per-query ranking and positive/negative deltas. Mixed-delta cases may appear in both better and worse lists. An uncertain-pair list includes the AI's exact evidence and reason.

Measure real model load time, per-query baseline/semantic core latency, p50/p95 and process peak RSS including JVM. This is **not Web/API E2E latency**, standalone baseline memory, or Judge-server memory. For cloud batches, row latency is the containing HTTP request latency; do not sum rows. `judge-batch-latency.json` reports batch wall times and total HTTP wall time; deliberate pacing, failed attempts, process startup and metadata probes are not included in that total. Remote server RAM is not available and must not be invented.

Report agreement with one LLM's provisional labels, not validated human relevance. Risks remain: correlated semantic bias, prompt sensitivity, batch context effects, mutable server models, a small synthetic pool and only ten held-out queries. Human review and explicit approval remain necessary for official evaluation. Do not claim F1≥85% from these retrieval metrics.

## References

- [Gemini generation API / actual modelVersion](https://ai.google.dev/api/generate-content)
- [Current native generateContent REST Structured Outputs example](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
- [Gemini model metadata](https://ai.google.dev/api/models)
- [Pricing and Free-tier data use](https://ai.google.dev/gemini-api/docs/pricing)
- [Project-level quotas, not key-level](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations)
- [Ollama model digest inventory](https://docs.ollama.com/api/tags)
