FROM node:22-bookworm-slim AS node-build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN pnpm --filter @hr-blockbot/contracts build && pnpm --filter api build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-dev openjdk-17-jdk-headless build-essential ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    PATH=/opt/f4-venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HUB_DISABLE_IMPLICIT_TOKEN=1 OMP_NUM_THREADS=1 MALLOC_ARENA_MAX=2 \
    F4_MODEL_DIR=/opt/f4-assets/phobert-base F4_SEGMENTER_DIR=/opt/f4-assets/vncorenlp
WORKDIR /app
COPY apps/ai-service/requirements-f4.txt /tmp/requirements-f4.txt
RUN python3 -m venv /opt/f4-venv \
    && pip install --no-cache-dir -r /tmp/requirements-f4.txt
COPY deploy/f4/assets.lock.json deploy/f4/download-assets.mjs /app/deploy/f4/
RUN node deploy/f4/download-assets.mjs /opt/f4-assets
COPY --from=node-build /app /app
COPY apps/ai-service/app/f4_encoder.py apps/ai-service/app/f4_gateway.py /app/apps/ai-service/app/
COPY deploy/f4/start.mjs /app/deploy/f4/start.mjs
USER node
EXPOSE 10000
CMD ["node", "deploy/f4/start.mjs"]
