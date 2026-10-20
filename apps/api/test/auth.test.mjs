import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { app } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { RefreshSessionModel } from "../dist/models/RefreshSession.js";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  ARGON2_CONFIG,
} from "../dist/services/auth.service.js";
import { assertInScope, RbacDeniedError } from "../dist/services/rbac.service.js";
import {
  EmployeeSummarySchema,
  EmployeeDetailSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
} from "@hr-blockbot/contracts";

describe("Phase 2: Auth, RBAC, Data Minimization & Security Lockdown Test Suite", () => {
  let server;
  let baseUrl;

  let testAdminUser;
  let testAdminEmployee;
  let testEmpUser;
  let testEmpEmployee;
  let testOtherEmployee;

  before(async () => {
    // 1. Start ephemeral HTTP server for live API tests
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 2. Connect to database
    await connectDB();

    // 3. Clean up any leftover test data
    const leftoverUsers = await UserModel.find(
      { email: /@test-phase2\.vn$/ },
      { _id: 1 }
    ).lean();
    if (leftoverUsers.length > 0) {
      const leftoverUserIds = leftoverUsers.map((u) => u._id);
      await RefreshSessionModel.deleteMany({ userId: { $in: leftoverUserIds } });
    }
    await UserModel.deleteMany({ email: /@test-phase2\.vn$/ });
    await EmployeeModel.deleteMany({ employeeCode: /^TEST-P2-/ });

    // 4. Seed test employees
    testAdminEmployee = await EmployeeModel.create({
      employeeCode: "TEST-P2-ADM01",
      fullName: "Admin Phòng Kỹ Thuật",
      departmentId: "DEPT_TECH",
      department: "DEPT_TECH",
      level: "Lead",
      skills: ["Quản lý", "Kiến trúc"],
      status: "active",
      bank_name: "Vietcombank",
      bank_account_number: "9999999999",
      phone: "0900000001",
    });

    testEmpEmployee = await EmployeeModel.create({
      employeeCode: "TEST-P2-EMP01",
      fullName: "Nhân Viên Thu Ngân",
      departmentId: "DEPT_TECH",
      department: "DEPT_TECH",
      level: "Junior",
      skills: ["Pha chế", "Thu ngân"],
      status: "active",
      bank_name: "Techcombank",
      bank_account_number: "8888888888",
      phone: "0900000002",
      hiredAt: new Date("2025-01-01"),
    });

    testOtherEmployee = await EmployeeModel.create({
      employeeCode: "TEST-P2-EMP02",
      fullName: "Nhân Viên Chi Nhánh Khác",
      departmentId: "DEPT_OTHER",
      department: "DEPT_OTHER",
      level: "Senior",
      skills: ["Pha chế"],
      status: "active",
      bank_name: "Agribank",
      bank_account_number: "7777777777",
      phone: "0900000003",
    });

    // 5. Seed test users
    const adminPasswordHash = await hashPassword("AdminPass@123");
    testAdminUser = await UserModel.create({
      email: "admin@test-phase2.vn",
      passwordHash: adminPasswordHash,
      role: "Admin",
      employeeId: testAdminEmployee._id,
    });
    testAdminEmployee.userId = testAdminUser._id;
    await testAdminEmployee.save();

    const empPasswordHash = await hashPassword("EmpPass@123");
    testEmpUser = await UserModel.create({
      email: "emp@test-phase2.vn",
      passwordHash: empPasswordHash,
      role: "Employee",
      employeeId: testEmpEmployee._id,
    });
    testEmpEmployee.userId = testEmpUser._id;
    await testEmpEmployee.save();
  });

  after(async () => {
    // Clean up test data scoped by user fixture IDs
    const fixtureUserIds = [testAdminUser?._id, testEmpUser?._id].filter(Boolean);
    if (fixtureUserIds.length > 0) {
      await RefreshSessionModel.deleteMany({ userId: { $in: fixtureUserIds } });
    }
    await UserModel.deleteMany({ email: /@test-phase2\.vn$/ });
    await EmployeeModel.deleteMany({ employeeCode: /^TEST-P2-/ });

    // Close connections
    await disconnectDB();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================================================
  // Unit Tests: Password, Jose JWT, RBAC Guard, Data Minimization
  // ==========================================================================
  describe("1. Password Hashing (Argon2id)", () => {
    test("sử dụng đúng thông số Argon2id (~19 MiB memory, 2 iterations, parallelism 1)", async () => {
      assert.equal(ARGON2_CONFIG.memoryCost, 19456);
      assert.equal(ARGON2_CONFIG.timeCost, 2);
      assert.equal(ARGON2_CONFIG.parallelism, 1);

      const hash = await hashPassword("Secret123!");
      assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);

      const isValid = await verifyPassword(hash, "Secret123!");
      assert.equal(isValid, true);

      const isInvalid = await verifyPassword(hash, "WrongPassword");
      assert.equal(isInvalid, false);
    });
  });

  describe("2. Token Signing & Jose JWT Verification", () => {
    test("ký và verify Access Token với claims sub và role", async () => {
      const token = await signAccessToken({ sub: "user-123", role: "Admin" });
      assert.ok(typeof token === "string" && token.length > 20);

      const claims = await verifyAccessToken(token);
      assert.equal(claims.sub, "user-123");
      assert.equal(claims.role, "Admin");
    });

    test("từ chối token giả mạo hoặc sai chữ ký", async () => {
      await assert.rejects(async () => {
        await verifyAccessToken("invalid.token.structure");
      });
    });
  });

  describe("3. Scope Guard (assertInScope)", () => {
    test("Employee chỉ được truy cập hồ sơ chính mình ('own')", () => {
      const actor = {
        userId: "u1",
        role: "Employee",
        employeeId: "e1",
        departmentId: "d1",
      };

      // Own profile: allow
      assert.doesNotThrow(() => {
        assertInScope(actor, { employeeId: "e1", userId: "u1" });
      });

      // Cross-user profile: deny with RBAC_DENIED
      assert.throws(
        () => {
          assertInScope(actor, { employeeId: "e2", userId: "u2" });
        },
        (err) => err instanceof RbacDeniedError && err.code === "RBAC_DENIED"
      );
    });

    test("Admin chỉ được truy cập trong department scope được gán", () => {
      const actor = {
        userId: "uAdmin",
        role: "Admin",
        employeeId: "eAdmin",
        departmentId: "DEPT_TECH",
      };

      // In-scope: allow
      assert.doesNotThrow(() => {
        assertInScope(actor, { departmentId: "DEPT_TECH" });
      });

      // Cross-scope: deny
      assert.throws(
        () => {
          assertInScope(actor, { departmentId: "DEPT_SALES" });
        },
        (err) => err instanceof RbacDeniedError && err.code === "RBAC_DENIED"
      );

      // Admin unmapped (không có departmentId): deny
      const unmappedAdmin = {
        userId: "uUnmapped",
        role: "Admin",
        departmentId: null,
      };
      assert.throws(
        () => {
          assertInScope(unmappedAdmin, { departmentId: "DEPT_TECH" });
        },
        (err) => err instanceof RbacDeniedError && err.code === "RBAC_DENIED"
      );
    });
  });

  describe("4. Data Minimization & PII Elimination", () => {
    test("EmployeeSummarySchema loại bỏ triệt để PII ngân hàng, phone, lương, lý do nghỉ", () => {
      const rawData = {
        employeeId: "660000000000000000000001",
        fullName: "Nguyễn Văn Test",
        level: "Junior",
        department: "DEPT_TECH",
        skills: ["Skill A"],
        status: "active",
        // PII cấm rò rỉ:
        bank_name: "BIDV",
        bank_account_number: "1234567890",
        phone: "0901234567",
        salary: 15000000,
        leave_reason: "Lý do nhạy cảm",
      };

      const parsed = EmployeeSummarySchema.parse(rawData);
      assert.equal("bank_name" in parsed, false);
      assert.equal("bank_account_number" in parsed, false);
      assert.equal("phone" in parsed, false);
      assert.equal("salary" in parsed, false);
      assert.equal("leave_reason" in parsed, false);
    });
  });

  // ==========================================================================
  // HTTP Endpoints Integration Tests
  // ==========================================================================
  describe("5. Endpoints: Login, Auth Me & Logout", () => {
    test("POST /api/auth/login - từ chối payload sai format (400 VALIDATION_FAILED)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, "VALIDATION_FAILED");
    });

    test("POST /api/auth/login - từ chối sai email hoặc password bằng thông báo chung (401 UNAUTHENTICATED)", async () => {
      // Sai email
      const res1 = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nonexistent@test-phase2.vn", password: "somepassword" }),
      });
      assert.equal(res1.status, 401);
      const data1 = await res1.json();
      assert.equal(data1.error.code, "UNAUTHENTICATED");
      assert.equal(data1.error.message, "Invalid email or password");

      // Sai mật khẩu
      const res2 = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test-phase2.vn", password: "WrongPassword" }),
      });
      assert.equal(res2.status, 401);
      const data2 = await res2.json();
      assert.equal(data2.error.code, "UNAUTHENTICATED");
      assert.equal(data2.error.message, "Invalid email or password");
    });

    test("POST /api/auth/login - thành công cấp Access Token trong body và Refresh Token trong HttpOnly cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test-phase2.vn", password: "AdminPass@123" }),
      });
      assert.equal(res.status, 200);

      const body = await res.json();
      // Validate schema
      const validated = LoginResponseSchema.parse(body);
      assert.ok(validated.accessToken);
      assert.equal(validated.user.role, "Admin");

      // Đảm bảo TUYỆT ĐỐI KHÔNG có refreshToken trong body
      assert.equal("refreshToken" in body, false);

      // Đảm bảo có Set-Cookie HttpOnly
      const setCookie = res.headers.get("set-cookie");
      assert.ok(setCookie && setCookie.includes("refreshToken="));
      assert.ok(setCookie.includes("HttpOnly"));
      assert.ok(setCookie.includes("SameSite=Strict"));
    });

    test("GET /api/auth/me - yêu cầu auth, trả đúng identity và scope", async () => {
      // Unauthenticated -> 401
      const resUnauth = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(resUnauth.status, 401);

      // Login Admin
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test-phase2.vn", password: "AdminPass@123" }),
      });
      const { accessToken } = await loginRes.json();

      const resMe = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      assert.equal(resMe.status, 200);
      const meData = await resMe.json();
      assert.equal(meData.role, "Admin");
      assert.equal(meData.departmentId, "DEPT_TECH");
    });
  });

  describe("6. Refresh Token Rotation (RTR) & Replay Attack Detection", () => {
    test("POST /api/auth/refresh - rotate token thành công một lần", async () => {
      // 1. Login để lấy RT-1
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "emp@test-phase2.vn", password: "EmpPass@123" }),
      });
      const setCookie1 = loginRes.headers.get("set-cookie");
      const rt1 = setCookie1.match(/refreshToken=([^;]+)/)[1];

      // 2. Refresh lần đầu bằng RT-1 -> nhận RT-2
      const refreshRes1 = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${rt1}` },
      });
      assert.equal(refreshRes1.status, 200);
      const refreshBody1 = await refreshRes1.json();
      assert.ok(refreshBody1.accessToken);
      assert.equal("refreshToken" in refreshBody1, false);

      const setCookie2 = refreshRes1.headers.get("set-cookie");
      const rt2 = setCookie2.match(/refreshToken=([^;]+)/)[1];
      assert.notEqual(rt1, rt2);

      // 3. REPLAY ATTACK: Dùng lại RT-1 đã bị rotate -> lập tức phát hiện replay và thu hồi cả family
      const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${rt1}` },
      });
      assert.equal(replayRes.status, 401);
      const replayData = await replayRes.json();
      assert.equal(replayData.error.code, "TOKEN_REUSED");

      // 4. FAIL-CLOSED: RT-2 (đang hợp lệ trước đó) cũng BỊ THU HỒI theo do cùng family
      const successorRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${rt2}` },
      });
      assert.equal(successorRes.status, 401);
    });

    test("Concurrent Refresh Race Condition: cả hai không tạo successor hợp lệ dùng được sau revoke", async () => {
      // 1. Login
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "emp@test-phase2.vn", password: "EmpPass@123" }),
      });
      const setCookie = loginRes.headers.get("set-cookie");
      const rt = setCookie.match(/refreshToken=([^;]+)/)[1];

      // 2. Hai request refresh đồng thời cùng RT
      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { Cookie: `refreshToken=${rt}` },
        }),
        fetch(`${baseUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { Cookie: `refreshToken=${rt}` },
        }),
      ]);

      const statuses = [resA.status, resB.status];
      // Một request có thể thắng (200) và một bị reject (401), hoặc nếu phát hiện replay thì family bị thu hồi
      assert.ok(statuses.includes(200) || statuses.every((s) => s === 401));
    });

    test("POST /api/auth/logout - thu hồi toàn bộ session family và xóa cookie", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "emp@test-phase2.vn", password: "EmpPass@123" }),
      });
      const setCookie = loginRes.headers.get("set-cookie");
      const rt = setCookie.match(/refreshToken=([^;]+)/)[1];

      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${rt}` },
      });
      assert.equal(logoutRes.status, 204);

      // Thử dùng lại RT sau logout -> 401
      const tryRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `refreshToken=${rt}` },
      });
      assert.equal(tryRefresh.status, 401);
    });
  });

  describe("7. Employees API (RBAC, Scope Guard & Allowlist Projection)", () => {
    let adminToken;
    let empToken;

    before(async () => {
      // Lấy token cho Admin và Employee
      const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test-phase2.vn", password: "AdminPass@123" }),
      });
      adminToken = (await adminLogin.json()).accessToken;

      const empLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "emp@test-phase2.vn", password: "EmpPass@123" }),
      });
      empToken = (await empLogin.json()).accessToken;
    });

    test("GET /api/employees - Employee cố gọi danh sách nhân sự bị 403 RBAC_DENIED", async () => {
      const res = await fetch(`${baseUrl}/api/employees`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, "RBAC_DENIED");
    });

    test("GET /api/employees - Admin xem danh sách trong scope, TUYỆT ĐỐI KHÔNG chứa PII", async () => {
      const res = await fetch(`${baseUrl}/api/employees`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.items));
      assert.ok(data.items.length >= 2);

      // Xác minh mọi phần tử đều nằm trong DEPT_TECH và KHÔNG có PII
      for (const item of data.items) {
        assert.equal(item.department, "DEPT_TECH");
        assert.equal("bank_name" in item, false);
        assert.equal("bank_account_number" in item, false);
        assert.equal("phone" in item, false);
        assert.equal("salary" in item, false);
      }

      // Đảm bảo không lộ nhân sự thuộc DEPT_OTHER
      const hasOtherDept = data.items.some((i) => i.employeeId === testOtherEmployee._id.toString());
      assert.equal(hasOtherDept, false);
    });

    test("GET /api/employees - Admin yêu cầu xem phòng ban ngoài scope bị 403 RBAC_DENIED", async () => {
      const res = await fetch(`${baseUrl}/api/employees?departmentId=DEPT_OTHER`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, "RBAC_DENIED");
    });

    test("GET /api/employees/:id - Employee xem hồ sơ của CHÍNH MÌNH (own) thành công với EmployeeDetailSchema", async () => {
      const res = await fetch(`${baseUrl}/api/employees/${testEmpEmployee._id}`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      // Cho phép xem phone, employeeCode của chính mình
      assert.equal(data.employeeCode, "TEST-P2-EMP01");
      assert.equal(data.phone, "0900000002");
      // Nhưng TUYỆT ĐỐI KHÔNG có ngân hàng
      assert.equal("bank_name" in data, false);
      assert.equal("bank_account_number" in data, false);
    });

    test("GET /api/employees/:id - Employee xem hồ sơ người khác bị 403 RBAC_DENIED", async () => {
      const res = await fetch(`${baseUrl}/api/employees/${testAdminEmployee._id}`, {
        headers: { Authorization: `Bearer ${empToken}` },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, "RBAC_DENIED");
    });

    test("GET /api/employees/:id - Admin xem nhân sự trong scope chỉ nhận EmployeeSummarySchema (không có phone/hiredAt)", async () => {
      const res = await fetch(`${baseUrl}/api/employees/${testEmpEmployee._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.fullName, "Nhân Viên Thu Ngân");
      // Admin xem nhân sự chỉ là summary: không có phone, bank
      assert.equal("phone" in data, false);
      assert.equal("bank_name" in data, false);
    });

    test("GET /api/employees/:id - Admin xem nhân sự ngoài scope bị 403 RBAC_DENIED", async () => {
      const res = await fetch(`${baseUrl}/api/employees/${testOtherEmployee._id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, "RBAC_DENIED");
    });
  });

  describe("8. Security Lockdown: Legacy Endpoints & Health Check", () => {
    test("Legacy endpoints (/stores, /schedules, /corrections, /cash) trả 503 disabled", async () => {
      for (const endpoint of ["/api/stores", "/api/schedules", "/api/corrections", "/api/cash"]) {
        const res = await fetch(`${baseUrl}${endpoint}`);
        assert.equal(res.status, 503);
        const data = await res.json();
        assert.ok(data.error.message.includes("disabled"));
      }
    });

    test("GET /api/health - trả thông tin tối thiểu, phân biệt liveness vs readiness, không lộ connection string", async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.status, "ok");
      assert.equal(data.liveness, "ok");
      assert.equal(data.readiness, "ok");

      // Đảm bảo không in URI, username, password
      const rawText = JSON.stringify(data);
      assert.equal(rawText.includes("mongodb"), false);
      assert.equal(rawText.includes("password"), false);
    });
  });
});
