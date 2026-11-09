import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { createServer } from "node:http";

function httpFetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: init.method || "GET",
        headers: { ...(init.headers || {}), Connection: "close" },
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            json: async () => JSON.parse(body),
          });
        });
      }
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

import { app } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import {
  registerLoginAttempt,
  clearLoginAttempts,
  sweepExpiredLoginAttempts,
  LOGIN_MAX_TRACKED_KEYS,
} from "../dist/services/login-attempt-limiter.js";

describe("P1-6: login rate-limit map không tăng vô hạn", () => {
  let server, baseUrl;

  before(async () => {
    await connectDB();
    server = createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    server.closeAllConnections?.();
    await disconnectDB();
  });

  test("khi map đầy: sweep giải phóng bucket hết hạn giúp key mới được chấp nhận, và bảo toàn bucket active", () => {
    const now = Date.now();
    const expiredTimestamp = now - 6 * 60 * 1000;
    const activeKey = "10.0.0.99|active-target";

    // 1. Tạo 1 bucket active (count = 1)
    assert.equal(registerLoginAttempt(activeKey, now), false);

    // 2. Lấp đầy phần còn lại của map bằng các bucket đã hết hạn
    const expiredKeys = [];
    for (let i = 1; i < LOGIN_MAX_TRACKED_KEYS; i++) {
      const k = `10.1.${i >> 8}.${i & 255}|expired`;
      expiredKeys.push(k);
      registerLoginAttempt(k, expiredTimestamp);
    }

    // 3. Map đầy 10.000 keys -> key mới bị chặn (fail-closed)
    const newKeyBeforeSweep = "10.2.0.1|blocked-new";
    assert.equal(registerLoginAttempt(newKeyBeforeSweep, now), true, "khi map đầy, key mới phải bị chặn");

    // 4. Sweep dọn dẹp các bucket hết hạn
    sweepExpiredLoginAttempts(now);

    // 5. Sau sweep: key mới được chấp nhận do đã có chỗ trống
    const newKeyAfterSweep = "10.2.0.2|accepted-new";
    assert.equal(registerLoginAttempt(newKeyAfterSweep, now), false, "sau sweep, key mới phải được chấp nhận");

    // 6. Bucket active trước sweep vẫn nguyên vẹn và tiếp tục đếm đến ngưỡng chặn
    for (let i = 0; i < 4; i++) {
      assert.equal(registerLoginAttempt(activeKey, now), false, `lần thử ${i + 2} của bucket active`);
    }
    assert.equal(registerLoginAttempt(activeKey, now), true, "bucket active bị chặn khi đủ 6 lần sai");

    // Dọn dẹp
    clearLoginAttempts(activeKey);
    clearLoginAttempts(newKeyBeforeSweep);
    clearLoginAttempts(newKeyAfterSweep);
    for (const k of expiredKeys) {
      clearLoginAttempts(k);
    }
  });

  test("end-to-end: 5 lần sai theo cặp IP+username nhận consumer-visible 429", async () => {
    const USERNAME = "test-p6-ratelimit";
    const XFWD = "9.9.9.9";
    let saw429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await httpFetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": XFWD },
        body: JSON.stringify({ username: USERNAME, password: "wrong" }),
      });
      if (res.status === 429) {
        saw429 = true;
        const data = await res.json();
        assert.equal(data.error.code, "TOO_MANY_ATTEMPTS");
        break;
      }
      assert.equal(res.status, 401);
    }
    assert.equal(saw429, true, "mong đợi 429 sau khi vượt LOGIN_MAX_ATTEMPTS");
  });

  test("end-to-end: khi map chạm cap, request từ user mới nhận consumer-visible 429", async () => {
    const now = Date.now();
    for (let i = 0; i < LOGIN_MAX_TRACKED_KEYS; i++) {
      registerLoginAttempt(`10.7.${i >> 8}.${i & 255}|fill`, now);
    }
    try {
      const res = await httpFetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "never-seen-capped-user", password: "wrong" }),
      });
      assert.equal(res.status, 429, "request mới khi map đầy phải nhận HTTP 429");
      const data = await res.json();
      assert.equal(data.error.code, "TOO_MANY_ATTEMPTS");
    } finally {
      for (let i = 0; i < LOGIN_MAX_TRACKED_KEYS; i++) {
        clearLoginAttempts(`10.7.${i >> 8}.${i & 255}|fill`);
      }
    }
  });
});
