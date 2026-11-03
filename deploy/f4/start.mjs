import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export function validateConfiguration(env) {
  if (env.F4_MODE !== 'PHOBERT' || !(Number(env.F4_SEMANTIC_WEIGHT) > 0 && Number(env.F4_SEMANTIC_WEIGHT) <= 1)) throw new Error('Explicit F4 mode/coefficient required');
  if (!env.F4_SERVICE_KEY || env.F4_SERVICE_KEY.length < 32) throw new Error('Dedicated F4 service key required');
  if (env.F4_WORKER_ORIGIN !== 'http://127.0.0.1:8001') throw new Error('Worker must use the fixed loopback origin');
}

export async function warmWorker(origin, key, alive = () => true) {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (!alive()) throw new Error('Worker exited before readiness');
    try { ready = (await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error('Worker startup timed out');
  const response = await fetch(origin + '/rank', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-f4-service-key': key },
    body: JSON.stringify({ requestId: randomUUID(), requiredSkills: ['Kiểm kê'], description: 'Synthetic startup verification', candidates: [{ id: 'c0', skills: ['Kiểm kê'] }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('Real model warm-up failed');
  const rank = await response.json();
  if (rank.model !== 'vinai/phobert-base' || rank.revision !== '01daacda68afe13d83023d16ec647239e344a1e6' || rank.items?.[0]?.id !== 'c0' || !Number.isFinite(rank.items[0].semanticScore)) throw new Error('Real model response failed validation');
  const health = await fetch(origin + '/health');
  if (!health.ok || (await health.json()).loaded !== true || !alive()) throw new Error('Worker model is not ready');
}

async function main() {
  validateConfiguration(process.env);
  // Never pass Mongo, JWT, LLM or Jev credentials into the model worker.
  const workerEnv = {};
  for (const name of ['PATH', 'JAVA_HOME', 'HOME', 'TMPDIR', 'PYTHONDONTWRITEBYTECODE', 'PYTHONUNBUFFERED', 'HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY', 'HF_HUB_DISABLE_IMPLICIT_TOKEN', 'OMP_NUM_THREADS', 'MALLOC_ARENA_MAX', 'F4_SERVICE_KEY', 'F4_MODEL_DIR', 'F4_SEGMENTER_DIR']) if (process.env[name]) workerEnv[name] = process.env[name];
  const worker = spawn('/opt/f4-venv/bin/python', ['-m', 'uvicorn', 'app.f4_gateway:app', '--host', '127.0.0.1', '--port', '8001', '--no-access-log'], { cwd: '/app/apps/ai-service', env: workerEnv, stdio: 'inherit' });
  let api, stopping = false;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    for (const child of [api, worker]) if (child && child.exitCode === null) child.kill('SIGTERM');
    const forced = setTimeout(() => { for (const child of [api, worker]) if (child && child.exitCode === null) child.kill('SIGKILL'); process.exit(code); }, 8000);
    Promise.all([api, worker].filter(Boolean).map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve)))).then(() => { clearTimeout(forced); process.exit(code); });
  };
  process.on('SIGTERM', () => stop(0)); process.on('SIGINT', () => stop(0));
  worker.on('error', () => stop(1));
  worker.on('exit', () => { if (!stopping) { console.error('[F4] Worker exited; restarting service'); stop(1); } });
  try { await warmWorker(process.env.F4_WORKER_ORIGIN, process.env.F4_SERVICE_KEY, () => !stopping && worker.exitCode === null); }
  catch { console.error('[F4] Startup verification failed'); stop(1); return; }
  if (stopping) return;
  console.log('[F4] Pinned real model warmed; experimental semantic weight=' + process.env.F4_SEMANTIC_WEIGHT);
  const guard = 'import{createRequire}from"node:module";const r=createRequire(process.cwd()+"/apps/api/package.json");r("mongoose").set("autoIndex",false).set("autoCreate",false);';
  api = spawn(process.execPath, ['--max-old-space-size=384', '--import', 'data:text/javascript,' + guard, 'apps/api/dist/index.js'], { stdio: 'inherit' });
  api.on('error', () => stop(1)); api.on('exit', code => { if (!stopping) stop(code || 1); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
