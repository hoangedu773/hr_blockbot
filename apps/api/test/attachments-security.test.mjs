import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { signAccessToken } from "../dist/services/auth.service.js";

describe("Phase 3: Attachments Security & Static File Integrity", () => {
  let server;
  let baseUrl;
  let accessToken;
  let fixtureUserId;

  before(async () => {
    // `GET /api/attachments/*` yêu cầu access token (middleware thêm sau khi test này
    // được viết) — mọi assertion path-traversal bên dưới chạy với một user hợp lệ.
    await connectDB();
    await UserModel.deleteMany({ username: "test-p3-attach" });
    const fixture = await UserModel.create({
      username: "test-p3-attach",
      passwordHash: "not-used-by-this-suite",
      role: "Employee",
    });
    fixtureUserId = fixture._id;
    accessToken = await signAccessToken({ sub: fixture._id.toString(), role: "Employee" });

    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      // Không await `close()`: một keep-alive socket còn sót lại làm promise này treo
      // vô hạn và `npm test` không bao giờ kết thúc.
      server.closeAllConnections?.();
      server.close();
    }
    // Dọn dẹp best-effort: in-memory mongod đôi khi ngừng trả lời sau nhiều request,
    // và teardown không được phép treo cả bộ test. DB test bị xoá sau mỗi lần chạy nên
    // dữ liệu fixture không sống sót dù bước xoá có bị bỏ dở.
    await Promise.race([
      (async () => {
        if (fixtureUserId) await UserModel.deleteMany({ _id: fixtureUserId });
        await disconnectDB();
      })(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  });

  // Helper for raw HTTP requests without client-side path normalization
  function rawGet(rawPath) {
    return new Promise((resolve, reject) => {
      const port = server.address().port;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: rawPath,
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          // Node >= 19 keeps `http.globalAgent` sockets alive; without this the test
          // process stays up waiting on an idle socket long after the assertions pass.
          agent: false,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: buffer.toString("utf8"),
              buffer,
            });
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  describe("1. Security & Path Traversal Lockdown", () => {
    test("chặn payload ../package.json (400 hoặc 404, không lộ package.json)", async () => {
      const res = await rawGet("/api/attachments/pdf/../package.json");
      assert.ok([400, 404].includes(res.statusCode), `Expected 400 or 404, got ${res.statusCode}`);
      assert.ok(!res.body.includes('"name": "hr-blockbot"'), "Must not leak package.json");
      assert.ok(!res.body.includes('"private": true'), "Must not leak package.json content");
    });

    test("chặn payload ../../.env (400 hoặc 404, không lộ .env)", async () => {
      const res = await rawGet("/api/attachments/pdf/../../.env");
      assert.ok([400, 404].includes(res.statusCode), `Expected 400 or 404, got ${res.statusCode}`);
      assert.ok(!res.body.includes("MONGO_URI"), "Must not leak .env variables");
      assert.ok(!res.body.includes("JWT_SECRET"), "Must not leak .env variables");
    });

    test("chặn payload ..%2f..%2f.env (400 hoặc 404)", async () => {
      const res = await rawGet("/api/attachments/pdf/..%2f..%2f.env");
      assert.ok([400, 404].includes(res.statusCode), `Expected 400 or 404, got ${res.statusCode}`);
      assert.ok(!res.body.includes("MONGO_URI"), "Must not leak .env variables");
    });

    test("chặn payload pdf/..%2f..%2fpackage.json (400 hoặc 404)", async () => {
      const res = await rawGet("/api/attachments/pdf/..%2f..%2fpackage.json");
      assert.ok([400, 404].includes(res.statusCode), `Expected 400 or 404, got ${res.statusCode}`);
      assert.ok(!res.body.includes('"dependencies"'), "Must not leak package.json");
    });

    test("chặn ký tự null %00 trong filename (400 hoặc 404)", async () => {
      const res = await rawGet("/api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf%00.exe");
      assert.ok([400, 404].includes(res.statusCode), `Expected 400 or 404, got ${res.statusCode}`);
    });

    test("chặn file không hợp lệ .exe (400 Bad Request)", async () => {
      const res = await rawGet("/api/attachments/pdf/trojan.exe");
      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.body);
      assert.equal(json.error.code, "INVALID_EXTENSION");
    });

    test("chặn file không hợp lệ .sh (400 Bad Request)", async () => {
      const res = await rawGet("/api/attachments/pdf/exploit.sh");
      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.body);
      assert.equal(json.error.code, "INVALID_EXTENSION");
    });

    test("chặn file .exe trong category images (400 Bad Request)", async () => {
      const res = await rawGet("/api/attachments/images/virus.exe");
      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.body);
      assert.equal(json.error.code, "INVALID_EXTENSION");
    });

    test("chặn category không hợp lệ (400 Bad Request)", async () => {
      const res = await rawGet("/api/attachments/documents/sample.pdf");
      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.body);
      assert.equal(json.error.code, "INVALID_CATEGORY");
    });

    test("trả 404 cho file không tồn tại với định dạng hợp lệ", async () => {
      const res = await rawGet("/api/attachments/pdf/nonexistent_file.pdf");
      assert.equal(res.statusCode, 404);
      const json = JSON.parse(res.body);
      assert.equal(json.error.code, "FILE_NOT_FOUND");
    });
  });

  describe("2. Static File Integrity", () => {
    test("phục vụ tệp GUTA_Bien_ban_ban_giao_cong_viec.pdf đúng Content-Type và dữ liệu", async () => {
      const res = await rawGet("/api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf");
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "application/pdf");
      assert.ok(res.buffer.length > 0, "PDF buffer must not be empty");
      // Check PDF magic number (%PDF-)
      const magic = res.buffer.subarray(0, 5).toString("ascii");
      assert.equal(magic, "%PDF-", "File must have valid PDF header");
    });

    test("phục vụ tệp GUTA_Bien_ban_ban_giao_tai_san.pdf đúng Content-Type và dữ liệu", async () => {
      const res = await rawGet("/api/attachments/pdf/GUTA_Bien_ban_ban_giao_tai_san.pdf");
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "application/pdf");
      assert.ok(res.buffer.length > 0, "PDF buffer must not be empty");
      const magic = res.buffer.subarray(0, 5).toString("ascii");
      assert.equal(magic, "%PDF-", "File must have valid PDF header");
    });

    test("phục vụ tệp ảnh A-001d06816e.png đúng Content-Type và dữ liệu", async () => {
      const res = await rawGet("/api/attachments/images/A-001d06816e.png");
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "image/png");
      assert.ok(res.buffer.length > 0, "PNG buffer must not be empty");
      // Check PNG magic bytes (\x89PNG\r\n\x1a\n)
      assert.equal(res.buffer[0], 0x89);
      assert.equal(res.buffer.subarray(1, 4).toString("ascii"), "PNG");
    });
  });
});
