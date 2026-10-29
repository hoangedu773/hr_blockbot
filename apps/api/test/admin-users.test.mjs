import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { createServer } from "node:http";

import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { RefreshSessionModel } from "../dist/models/RefreshSession.js";
import { hashPassword, signAccessToken } from "../dist/services/auth.service.js";

/**
 * HTTP client riêng cho bộ test: `fetch` giữ socket keep-alive và tiến trình test
 * không bao giờ thoát, nên mỗi request mở và đóng kết nối của chính nó.
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
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

describe("Admin user management: CRUD tài khoản và hạ quyền", () => {
  let server;
  let baseUrl;

  let globalAdmin;
  let secondGlobalAdmin;
  let scopedAdmin;
  let employeeUser;
  let employeeProfile;
  let otherEmployeeProfile;

  let globalToken;
  let scopedToken;
  let employeeToken;

  function request(method, path, body, token) {
    return httpFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  before(async () => {
    server = createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await connectDB();

    await UserModel.deleteMany({ username: /^test-au-/ });
    await EmployeeModel.deleteMany({ employeeCode: /^TEST-AU-/ });

    employeeProfile = await EmployeeModel.create({
      employeeCode: "TEST-AU-EMP01",
      fullName: "Nhân Viên Được Gán",
      departmentId: "DEPT_AU",
      department: "DEPT_AU",
      level: "Junior",
      businessRole: "sm",
      status: "active",
    });
    otherEmployeeProfile = await EmployeeModel.create({
      employeeCode: "TEST-AU-EMP02",
      fullName: "Nhân Viên Thứ Hai",
      departmentId: "DEPT_AU",
      department: "DEPT_AU",
      level: "Junior",
      businessRole: "staff",
      status: "active",
    });

    const passwordHash = await hashPassword("AdminPass@123");
    globalAdmin = await UserModel.create({
      username: "test-au-root",
      passwordHash,
      role: "Admin",
      businessRole: "admin",
      isGlobalAdmin: true,
      mustChangePassword: false,
    });
    secondGlobalAdmin = await UserModel.create({
      username: "test-au-second",
      passwordHash,
      role: "Admin",
      businessRole: "admin",
      isGlobalAdmin: true,
      mustChangePassword: false,
    });
    // Admin có hồ sơ nhưng KHÔNG có cờ toàn quyền: mọi thao tác quản trị tài khoản
    // phải bị chặn (fail-closed), kể cả khi họ quản lý được nhân sự trong phòng ban.
    scopedAdmin = await UserModel.create({
      username: "test-au-scoped",
      passwordHash,
      role: "Admin",
      businessRole: "admin",
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    employeeUser = await UserModel.create({
      username: "test-au-employee",
      passwordHash,
      role: "Employee",
      businessRole: "sm",
      employeeId: employeeProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    employeeProfile.userId = employeeUser._id;
    await employeeProfile.save();

    globalToken = await signAccessToken({ sub: globalAdmin._id.toString(), role: "Admin" });
    scopedToken = await signAccessToken({ sub: scopedAdmin._id.toString(), role: "Admin" });
    employeeToken = await signAccessToken({ sub: employeeUser._id.toString(), role: "Employee" });
  });

  after(async () => {
    if (server) {
      server.closeAllConnections?.();
      server.close();
    }
    await Promise.race([
      (async () => {
        await UserModel.deleteMany({ username: /^test-au-/ });
        await EmployeeModel.deleteMany({ employeeCode: /^TEST-AU-/ });
        await disconnectDB();
      })(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  });

  test("thiếu access token bị 401", async () => {
    const res = await request("GET", "/api/admin/users");
    assert.equal(res.status, 401);
  });

  test("Employee bị 403 ở mọi thao tác quản trị tài khoản", async () => {
    const list = await request("GET", "/api/admin/users", null, employeeToken);
    assert.equal(list.status, 403);
    assert.equal((await list.json()).error.code, "RBAC_DENIED");

    const create = await request(
      "POST",
      "/api/admin/users",
      { username: "test-au-hack", role: "Admin", isGlobalAdmin: true },
      employeeToken
    );
    assert.equal(create.status, 403);

    const patch = await request(
      "PATCH",
      `/api/admin/users/${globalAdmin._id}`,
      { role: "Employee" },
      employeeToken
    );
    assert.equal(patch.status, 403);

    const del = await request("DELETE", `/api/admin/users/${globalAdmin._id}`, null, employeeToken);
    assert.equal(del.status, 403);
  });

  test("Admin bị giới hạn phòng ban (không isGlobalAdmin) vẫn bị 403 — fail-closed", async () => {
    const res = await request("GET", "/api/admin/users", null, scopedToken);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, "RBAC_DENIED");
    assert.match(body.error.message, /full-authority/i);
  });

  test("Admin toàn quyền xem danh sách, không lộ passwordHash", async () => {
    const res = await request("GET", "/api/admin/users?limit=50", null, globalToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.items));
    assert.ok(body.paging.totalItems >= 4);

    for (const item of body.items) {
      assert.equal("passwordHash" in item, false, "passwordHash không được rời khỏi server");
      assert.equal(typeof item.username, "string");
      assert.equal(typeof item.isGlobalAdmin, "boolean");
    }

    const linked = body.items.find((item) => item.username === "test-au-employee");
    assert.equal(linked.employeeName, "Nhân Viên Được Gán");
    assert.equal(linked.businessRole, "sm");
  });

  test("lọc theo role và tìm theo tên nhân viên", async () => {
    const admins = await request("GET", "/api/admin/users?role=Admin&limit=50", null, globalToken);
    assert.equal(admins.status, 200);
    const adminBody = await admins.json();
    assert.ok(adminBody.items.every((item) => item.role === "Admin"));

    const byName = await request(
      "GET",
      `/api/admin/users?q=${encodeURIComponent("Được Gán")}`,
      null,
      globalToken
    );
    assert.equal(byName.status, 200);
    const nameBody = await byName.json();
    assert.ok(nameBody.items.some((item) => item.username === "test-au-employee"));
  });

  test("tạo tài khoản: sinh mật khẩu tạm, gắn hồ sơ, buộc đổi mật khẩu", async () => {
    const res = await request(
      "POST",
      "/api/admin/users",
      {
        username: "test-au-created",
        role: "Employee",
        employeeId: String(otherEmployeeProfile._id),
      },
      globalToken
    );
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.role, "Employee");
    assert.equal(body.mustChangePassword, true);
    assert.equal(body.businessRole, "staff", "businessRole lấy từ hồ sơ khi không truyền");
    assert.ok(body.temporaryPassword && body.temporaryPassword.length >= 12);

    const created = await UserModel.findOne({ username: "test-au-created" }).lean();
    assert.ok(created);
    const profile = await EmployeeModel.findById(otherEmployeeProfile._id).lean();
    assert.equal(String(profile.userId), String(created._id));

    // Mật khẩu tạm đăng nhập được và buộc đổi ngay.
    const login = await request("POST", "/api/auth/login", {
      username: "test-au-created",
      password: body.temporaryPassword,
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.mustChangePassword, true);
  });

  test("tạo tài khoản trùng tên đăng nhập bị 409", async () => {
    const res = await request(
      "POST",
      "/api/admin/users",
      { username: "test-au-employee", role: "Employee" },
      globalToken
    );
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, "DUPLICATE_KEY");
  });

  test("không cho gán businessRole 'admin' cho tài khoản Employee", async () => {
    const res = await request(
      "POST",
      "/api/admin/users",
      { username: "test-au-badrole", role: "Employee", businessRole: "admin" },
      globalToken
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "VALIDATION_FAILED");
  });

  test("hạ role Admin toàn quyền xuống Employee: mất quyền, thu hồi phiên, bậc lấy từ hồ sơ", async () => {
    const login = await request("POST", "/api/auth/login", {
      username: "test-au-second",
      password: "AdminPass@123",
    });
    assert.equal(login.status, 200);

    const res = await request(
      "PATCH",
      `/api/admin/users/${secondGlobalAdmin._id}`,
      { role: "Employee" },
      globalToken
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.role, "Employee");
    assert.equal(body.isGlobalAdmin, false);
    assert.notEqual(body.businessRole, "admin");

    const activeSessions = await RefreshSessionModel.countDocuments({
      userId: secondGlobalAdmin._id,
      revokedAt: null,
    });
    assert.equal(activeSessions, 0, "phiên cũ phải bị thu hồi sau khi đổi quyền");

    // Token cũ vẫn còn hạn nhưng middleware đọc role từ DB -> mất quyền ngay.
    const stillAdmin = await request("GET", "/api/admin/users", null, globalToken);
    assert.equal(stillAdmin.status, 200);
    const oldToken = (await login.json()).accessToken;
    const denied = await request("GET", "/api/admin/users", null, oldToken);
    assert.equal(denied.status, 403);
  });

  test("nâng role Employee lên Admin thì businessRole thành admin", async () => {
    const res = await request(
      "PATCH",
      `/api/admin/users/${employeeUser._id}`,
      { role: "Admin" },
      globalToken
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.role, "Admin");
    assert.equal(body.businessRole, "admin");
    assert.equal(body.isGlobalAdmin, false);

    // Hạ lại để các test sau thấy trạng thái ban đầu.
    const back = await request(
      "PATCH",
      `/api/admin/users/${employeeUser._id}`,
      { role: "Employee", businessRole: "sm" },
      globalToken
    );
    assert.equal(back.status, 200);
    assert.equal((await back.json()).businessRole, "sm");
  });

  test("không thể tự hạ quyền hoặc tự xoá tài khoản đang đăng nhập", async () => {
    const demote = await request(
      "PATCH",
      `/api/admin/users/${globalAdmin._id}`,
      { role: "Employee" },
      globalToken
    );
    assert.equal(demote.status, 403);

    const dropGlobal = await request(
      "PATCH",
      `/api/admin/users/${globalAdmin._id}`,
      { isGlobalAdmin: false },
      globalToken
    );
    assert.equal(dropGlobal.status, 403);

    const remove = await request("DELETE", `/api/admin/users/${globalAdmin._id}`, null, globalToken);
    assert.equal(remove.status, 403);
  });

  test("đặt lại mật khẩu: mật khẩu cũ chết, mật khẩu mới dùng được, phiên bị thu hồi", async () => {
    const before = await request("POST", "/api/auth/login", {
      username: "test-au-employee",
      password: "AdminPass@123",
    });
    assert.equal(before.status, 200);

    const res = await request(
      "POST",
      `/api/admin/users/${employeeUser._id}/reset-password`,
      {},
      globalToken
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mustChangePassword, true);
    assert.ok(body.temporaryPassword);

    const oldLogin = await request("POST", "/api/auth/login", {
      username: "test-au-employee",
      password: "AdminPass@123",
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await request("POST", "/api/auth/login", {
      username: "test-au-employee",
      password: body.temporaryPassword,
    });
    assert.equal(newLogin.status, 200);

    const activeSessions = await RefreshSessionModel.countDocuments({
      userId: employeeUser._id,
      revokedAt: null,
    });
    // Chỉ phiên vừa đăng nhập bằng mật khẩu mới còn sống.
    assert.equal(activeSessions, 1);
  });

  test("xoá tài khoản: mất đăng nhập, hồ sơ được bỏ liên kết", async () => {
    const created = await UserModel.findOne({ username: "test-au-created" }).lean();
    assert.ok(created);

    const res = await request("DELETE", `/api/admin/users/${created._id}`, null, globalToken);
    assert.equal(res.status, 204);

    const gone = await UserModel.findById(created._id).lean();
    assert.equal(gone, null);

    const profile = await EmployeeModel.findById(otherEmployeeProfile._id).lean();
    assert.equal(profile.userId, null);

    const login = await request("POST", "/api/auth/login", {
      username: "test-au-created",
      password: "whatever",
    });
    assert.equal(login.status, 401);
  });

  test("xoá tài khoản không tồn tại trả 404", async () => {
    const res = await request(
      "DELETE",
      "/api/admin/users/000000000000000000000000",
      null,
      globalToken
    );
    assert.equal(res.status, 404);
  });
});
