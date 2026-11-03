# F4 cloud demo in the existing API service

One Docker service runs Node API and a Python worker bound exclusively to
127.0.0.1:8001. The worker receives only an explicit environment allowlist;
Mongo/JWT/LLM/Jev credentials remain in the API process. No AI gateway is started
by this image. Existing API authorization, candidate scope, lifecycle checks,
CAS and manual confirmation are unchanged.

Render target: hr-blockbot-363-test-api-starter, Standard 1 CPU / 2 GB,
advertised USD25/month. This is a resource-constrained demo; actual model
warm-up and real request latency must pass on this target before acceptance.
Local Windows validation was not rerun with real weights because available RAM
was below the existing 2.5 GiB local safety budget. Docker is not installed on
the authoring machine; Render performs the Linux image build and real warm-up.

Required server-only environment:

- F4_MODE=PHOBERT
- F4_SEMANTIC_WEIGHT=0.5 (explicit experimental demo coefficient, not selected
  by an independent quality benchmark)
- F4_WORKER_ORIGIN=http://127.0.0.1:8001
- F4_SERVICE_KEY: dedicated random secret >=32 characters
- F4_MODEL_DIR=/opt/f4-assets/phobert-base (image default)
- F4_SEGMENTER_DIR=/opt/f4-assets/vncorenlp (image default)

Build uses deploy/f4/Dockerfile with repository root as context and its CMD as
startup. Models are public, pinned by revision and verified against fixed
SHA256 values in assets.lock.json. There is no download during inference.
Startup verifies a real synthetic rank and loaded:true before spawning the API.
Worker or API exit terminates both; SIGTERM is forwarded to both. Runtime
autoIndex/autoCreate are disabled to preserve the existing database boundary.

The image contains no database archive, test accounts, secret files or .env.
The secret is generated in the control process and stored only in Render.

Verification: node --test deploy/f4/start.test.mjs; API F4 isolation suite;
Python F4 offline tests; cloud startup real forward; authorized read-only
candidate endpoint. A PHOBERT response must have the pinned model/revision and
semanticWeight=0.5; BASELINE_FALLBACK is not a PhoBERT success.

Rollback uses the recorded prior service configuration and commit with
F4_MODE=OFF, Node runtime and original build/start commands. Do not restore the
database, rotate JWT, overwrite grants or change other services to roll back
this compute-only rollout.
