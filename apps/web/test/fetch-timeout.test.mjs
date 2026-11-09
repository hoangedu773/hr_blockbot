// Regression test cho fix "fetchMe treo trước header": apiFetch phải có deadline 25s,
// tôn trọng signal người gọi, mutation timeout là unknown outcome, và SSE đọc body sau header không bị abort.
// Bundle source THẬT (src/services/api.ts + auth.ts) bằng esbuild để test code production.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

let mod;
let hangServer;
let outDir;

// Mô phỏng thời gian deadline ở tầng test boundary:
// Rút ngắn timer 25_000ms thành simulatedMs (mặc định 60ms) để test chạy tức thì,
// không làm chậm suite và không dùng biến env production.
async function withSimulatedDeadline(fn, simulatedMs = 60) {
  const origSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...args) => {
    if (ms === 25_000) {
      return origSetTimeout(cb, simulatedMs, ...args);
    }
    return origSetTimeout(cb, ms, ...args);
  };
  try {
    return await fn();
  } finally {
    globalThis.setTimeout = origSetTimeout;
  }
}

before(async () => {
  hangServer = http.createServer((req, res) => {
    if (req.url === '/api/auth/refresh') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ accessToken: 'refreshed-token' }));
      return;
    }
    if (req.url === '/api/auth/me' && req.headers.authorization === 'Bearer refreshed-token') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ userId: 'u1', role: 'Employee', skills: [] }));
      return;
    }
    if (req.url === '/api/request-retry') {
      if (req.headers.authorization !== 'Bearer refreshed-token') {
        res.writeHead(401).end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ marker: req.headers['x-test-marker'] }));
      }
      return;
    }
    if (req.url === "/api/chat/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("event: accepted\ndata: {}\n\n");
      // Phát chunk sau một khoảng delay để kiểm chứng stream tiếp tục đọc sau khi header đã trả
      setTimeout(() => {
        res.write("event: chunk\ndata: {\"delta\":\"hello-stream\"}\n\n");
        setTimeout(() => res.end(), 20);
      }, 80);
      return;
    }
    // Mặc định: nhận kết nối nhưng KHÔNG trả lời (tái hiện treo kết nối trước header)
  });
  await new Promise((r) => hangServer.listen(0, "127.0.0.1", r));
  const apiBase = `http://127.0.0.1:${hangServer.address().port}/api`;

  outDir = fs.mkdtempSync(path.join(webRoot, "node_modules", ".test-bundle-"));
  const entryFile = path.join(outDir, "entry.ts");
  const outFile = path.join(outDir, "api.mjs");

  fs.writeFileSync(
    entryFile,
    `export * from ${JSON.stringify(path.join(webRoot, "src/services/api.ts"))};
export * from ${JSON.stringify(path.join(webRoot, "src/services/auth.ts"))};
`
  );

  execFileSync(
    process.execPath,
    [
      path.join(webRoot, "node_modules", "esbuild", "bin", "esbuild"),
      entryFile,
      "--bundle",
      "--format=esm",
      "--platform=node",
      "--external:@hr-blockbot/contracts",
      `--define:import.meta.env=${JSON.stringify({ VITE_API_BASE: apiBase })}`,
      `--outfile=${outFile}`,
    ],
    { cwd: webRoot, stdio: "pipe" }
  );
  mod = await import(pathToFileURL(outFile).href);

  mod.setAuthState("test-token", {
    id: "u1",
    role: "EMPLOYEE",
    username: "t",
    mustChangePassword: false,
    authorization: [],
  });
});

after(() => {
  mod?.clearAuthState?.();
  hangServer?.closeAllConnections?.();
  hangServer?.close();
  if (outDir && fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

describe("apiFetch deadline & SSE lifecycle", () => {
  it("fetchMe (GET) reject ApiTimeoutError khi server treo trước header, outcomeKnown=true", async () => {
    await withSimulatedDeadline(async () => {
      await assert.rejects(
        mod.fetchMe(),
        (e) => {
          assert.equal(e.name, "ApiTimeoutError");
          assert.equal(e.outcomeKnown, true, "GET an toàn để retry");
          assert.equal(e.code, "TIMEOUT");
          return true;
        }
      );
    });
  });

  it("signal người gọi được tôn trọng: caller abort reject ngay lập tức, không thành ApiTimeoutError", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(
      mod.requestJson("/auth/me", { signal: controller.signal }),
      (e) => e.name !== "ApiTimeoutError"
    );
  });

  it("mutation timeout là unknown outcome: outcomeKnown=false, mã TIMEOUT_OUTCOME_UNKNOWN", async () => {
    await withSimulatedDeadline(async () => {
      await assert.rejects(
        mod.requestJson("/kpi/periods/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
        (e) => {
          assert.equal(e.name, "ApiTimeoutError");
          assert.equal(e.outcomeKnown, false, "mutation đã gửi đi — kết quả không xác định");
          assert.equal(e.code, "TIMEOUT_OUTCOME_UNKNOWN");
          return true;
        }
      );
    });
  });

  it("Request object với method POST và không có init vẫn nhận diện đúng mutation", async () => {
    const req = new Request(
      `http://127.0.0.1:${hangServer.address().port}/api/kpi/periods/open`,
      { method: "POST" }
    );
    await withSimulatedDeadline(async () => {
      await assert.rejects(
        mod.apiFetch(req),
        (e) => {
          assert.equal(e.name, "ApiTimeoutError");
          assert.equal(e.outcomeKnown, false, "nhận diện đúng method từ Request input");
          assert.equal(e.code, "TIMEOUT_OUTCOME_UNKNOWN");
          return true;
        }
      );
    });
  });

  it('401 refresh giữ headers của Request object khi gửi lại', async () => {
    const req = new Request(`http://127.0.0.1:${hangServer.address().port}/api/request-retry`, {
      headers: { 'X-Test-Marker': 'request-header' },
    });
    const response = await mod.apiFetch(req);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).marker, 'request-header');
  });

  it("chat SSE: stream tiếp tục đọc chunk sau khi response header đã trả, không bị abort", async () => {
    await withSimulatedDeadline(async () => {
      const res = await mod.apiFetch(
        `http://127.0.0.1:${hangServer.address().port}/api/chat/stream`,
        {
          headers: { Accept: "text/event-stream" },
        }
      );
      assert.equal(res.status, 200);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
      }

      assert.match(accumulated, /hello-stream/);
    });
  });
});
