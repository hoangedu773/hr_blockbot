import "./require-isolated-db.mjs";
import { test, describe, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import http, { createServer } from "node:http";
import mongoose from "mongoose";

import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { signAccessToken } from "../dist/services/auth.service.js";
import { redactSecrets } from "../dist/lib/redact.js";

/**
 * Sự cố Mongo thoáng qua KHÔNG được báo thành 401: client web coi 401 là hết phiên,
 * gọi refresh, refresh cũng 401 rồi `notifyAuthFailure()` đá toàn bộ người dùng đang
 * online về trang đăng nhập. Lỗi hạ tầng phải là 503 để client retry.
 *
 * Không dừng mongod thật: mock đúng lớp lỗi driver ném ra khi không chọn được server,
 * nên test chạy hermetic và không phụ thuộc timing của serverSelectionTimeout.
 */
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
            headers: { get: (name) => res.headers[name.toLowerCase()] ?? null },
            json: async () => (body ? JSON.parse(body) : null),
            text: async () => body,
          });
        });
      }
    );
    req.setTimeout(15000, () => {
      req.destroy(new Error(`request timeout: ${init.method || "GET"} ${target.pathname}`));
    });
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

function serverSelectionError() {
  const { MongoServerSelectionError } = mongoose.mongo;
  return new MongoServerSelectionError(
    "Server selection timed out after 5000 ms",
    new Map()
  );
}

describe("DB outage không bị phân loại thành 401", () => {
  let server;
  let baseUrl;
  let token;
  let originalFindById;

  before(async () => {
    server = createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await connectDB();
    await UserModel.deleteMany({ username: /^test-outage-/ });

    const user = await UserModel.create({
      username: "test-outage-user",
      passwordHash: "not-used-in-this-test",
      role: "Employee",
      businessRole: "staff",
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    token = await signAccessToken({ sub: user._id.toString(), role: "Employee" });

    originalFindById = UserModel.findById;
  });

  afterEach(() => {
    UserModel.findById = originalFindById;
  });

  after(async () => {
    UserModel.findById = originalFindById;
    if (server) {
      server.closeAllConnections?.();
      server.close();
    }
    await Promise.race([
      (async () => {
        await UserModel.deleteMany({ username: /^test-outage-/ });
        await disconnectDB();
      })(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  });

  test("MongoServerSelectionError khi resolve user -> 503 SERVICE_UNAVAILABLE, không phải 401", async () => {
    UserModel.findById = () => {
      throw serverSelectionError();
    };

    const res = await httpFetch(`${baseUrl}/api/stores`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 503, "lỗi hạ tầng phải là 503, không được là 401");
    const body = await res.json();
    assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
    // Không rò rỉ chi tiết hạ tầng ra client.
    assert.equal(JSON.stringify(body).includes("mongodb"), false);
    assert.equal(JSON.stringify(body).includes("MongoServerSelectionError"), false);
  });

  test("lỗi mạng khi query cũng là 503", async () => {
    const { MongoNetworkError } = mongoose.mongo;
    UserModel.findById = () => {
      throw new MongoNetworkError("connection reset by peer");
    };

    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, "SERVICE_UNAVAILABLE");
  });

  test("JSON hỏng -> 400, không bị handler chung nuốt thành 500", async () => {
    const res = await httpFetch(`${baseUrl}/api/stores`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: '{"name": "broken"',
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_FAILED");
    // Không được trích body vào message: parser thường chèn nguyên đoạn JSON hỏng.
    assert.equal(JSON.stringify(body).includes("broken"), false);
  });

  test("body > 100kb -> 413 PAYLOAD_TOO_LARGE", async () => {
    const res = await httpFetch(`${baseUrl}/api/stores`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(200_000) }),
    });

    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, "PAYLOAD_TOO_LARGE");
  });

  test("redactSecrets che credential ở mọi dạng URI", () => {
    // Password chứa `/` là ca bản regex cũ bỏ sót.
    const withSlash = "connect failed mongodb://admin:p/ssw0rd@cluster0.example.net:27017/hr_bot";
    assert.equal(redactSecrets(withSlash).includes("ssw0rd"), false);
    assert.equal(redactSecrets(withSlash).includes("admin:"), false);
    assert.ok(redactSecrets(withSlash).includes("***:***@"));

    // Password chứa `@` đã encode thành %40.
    const encoded = "mongodb+srv://svc:p%40ss@cluster.mongodb.net/hr";
    assert.equal(redactSecrets(encoded).includes("p%40ss"), false);
    assert.ok(redactSecrets(encoded).includes("***:***@"));

    // Không có credential: giữ nguyên.
    const clean = "mongodb://localhost:27017/test_db";
    assert.equal(redactSecrets(clean), clean);

    // Message driver dạng user:pass@host.
    const driver = "MongoServerError: auth failed for user:secret@db-host";
    assert.equal(redactSecrets(driver).includes("secret"), false);

    // Chuỗi thường không bị biến dạng.
    const plain = "Cửa hàng GUTA CAFE - Quận 1 đã được cập nhật";
    assert.equal(redactSecrets(plain), plain);
  });

  test("token hỏng vẫn là 401, không bị đổi thành 503", async () => {
    const res = await httpFetch(`${baseUrl}/api/stores`, {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "UNAUTHENTICATED");
  });

  test("token hợp lệ nhưng user đã bị xoá vẫn là 401", async () => {
    UserModel.findById = () => Promise.resolve(null);

    const res = await httpFetch(`${baseUrl}/api/stores`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "UNAUTHENTICATED");
  });
});
