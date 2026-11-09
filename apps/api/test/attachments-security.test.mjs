import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { signAccessToken } from "../dist/services/auth.service.js";
import mongoose from "mongoose";
import { authorizationV1Fixture } from "./helpers/authorization-v1-fixture.mjs";

describe("Phase 3: Attachments Security & Static File Integrity", () => {
  let server;
  let baseUrl;
  let accessToken;
  let fixtureUserId;
  let fixtureRoot;
  const previousRoot = process.env.ATTACHMENTS_DATA_ROOT;

  before(async () => {
    // Synthetic file fixtures only; these are NOT official GUTA documents.
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hr-blockbot-attachments-test-"));
    const pdfRoot = path.join(fixtureRoot, "guta_mau_bien_ban_cho_agent");
    const imageRoot = path.join(fixtureRoot, "guta_bo_du_lieu_chatbot", "anh_tham_chieu");
    const rescuedRoot = path.join(fixtureRoot, "guta_rescued_pdf");
    fs.mkdirSync(pdfRoot, { recursive: true }); fs.mkdirSync(imageRoot, { recursive: true });
    fs.mkdirSync(rescuedRoot, { recursive: true });
    fs.writeFileSync(path.join(rescuedRoot, "RESCUED_Policy_Sheet.pdf"), "%PDF-1.4\n% Synthetic test fixture, not a business document\n%%EOF");
    for (const name of ["GUTA_Bien_ban_ban_giao_cong_viec.pdf", "GUTA_Bien_ban_ban_giao_tai_san.pdf"]) {
      fs.writeFileSync(path.join(pdfRoot, name), "%PDF-1.4\n% Synthetic test fixture, not a business document\n%%EOF");
    }
    fs.writeFileSync(path.join(imageRoot, "A-001d06816e.png"), Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"));
    process.env.ATTACHMENTS_DATA_ROOT = fixtureRoot;
    // `GET /api/attachments/*` yêu cầu access token (middleware thêm sau khi test này
    // được viết) — mọi assertion path-traversal bên dưới chạy với một user hợp lệ.
    await connectDB();
    const fixture = await authorizationV1Fixture();
    fixtureUserId = fixture.actors.staff.user._id;
    accessToken = fixture.actors.staff.token;
    await UserModel.updateOne({ _id: fixtureUserId }, { $push: { 'authorization.grants.1.capabilities': 'attachments.read' } });
    await mongoose.connection.collection('policies').insertOne({ title: 'Synthetic attachment security fixture', version: 'test-only',
      acl: { reviewStatus: 'APPROVED', approvalRef: 'isolated-attachment-acl', tier: 'T2_OPERATIONAL', classification: 'operational', allowedProfiles: ['staff'], validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: null, revokedAt: null, scopeKind: 'stores', storeIds: [String(fixture.stores[0]._id)] },
      attachments: [{ category: 'pdf', filename: 'GUTA_Bien_ban_ban_giao_cong_viec.pdf' }, { category: 'pdf', filename: 'GUTA_Bien_ban_ban_giao_tai_san.pdf' }, { category: 'images', filename: 'A-001d06816e.png' }, { category: 'rescued_pdf', filename: 'RESCUED_Policy_Sheet.pdf' }] });

    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (previousRoot === undefined) delete process.env.ATTACHMENTS_DATA_ROOT;
    else process.env.ATTACHMENTS_DATA_ROOT = previousRoot;
    if (fixtureRoot && path.resolve(fixtureRoot).startsWith(path.resolve(os.tmpdir()) + path.sep)
      && path.basename(fixtureRoot).startsWith("hr-blockbot-attachments-test-")) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
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

  describe("0. Rescued policy PDF category", () => {
    test("phục vụ PDF trong category rescued_pdf khi policy có attachment tương ứng", async () => {
      const res = await rawGet("/api/attachments/rescued_pdf/RESCUED_Policy_Sheet.pdf");
      assert.equal(res.statusCode, 200);
      assert.match(res.headers["content-type"] || "", /application\/pdf/);
      assert.match(res.body, /%PDF-1\.4/);
    });

    test("category rescued_pdf từ chối đuôi không phải pdf", async () => {
      const res = await rawGet("/api/attachments/rescued_pdf/notes.txt");
      assert.equal(res.statusCode, 400);
    });

    test("category rescued_pdf vẫn chặn path traversal", async () => {
      const res = await rawGet("/api/attachments/rescued_pdf/..%2f..%2fpackage.json");
      assert.ok(res.statusCode === 400 || res.statusCode === 404);
      assert.doesNotMatch(res.body, /"name":\s*"api"/);
    });
  });

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
      assert.equal(json.error.code, "RESOURCE_NOT_FOUND", 'ACL-first lookup must not disclose physical file existence');
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
