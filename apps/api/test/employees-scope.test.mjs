import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { createServer } from "node:http";
import mongoose from "mongoose";

import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { ProjectModel } from "../dist/models/Project.js";
import { ReportModel } from "../dist/models/Report.js";
import { signAccessToken } from "../dist/services/auth.service.js";
import { departmentIdMatch } from "../dist/lib/department-scope.js";
import { PaginatedEmployeesResponseSchema, PaginatedProjectsResponseSchema } from "@hr-blockbot/contracts";

/**
 * `fetch` giữ socket keep-alive và tiến trình test không bao giờ thoát.
 * Mỗi request mở/đóng kết nối của chính nó.
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

// Shape production: `departmentId` là BSON ObjectId, KHÔNG kèm `department`/`store_raw`.
// Nếu scope so sánh bằng string hex thì mọi query dưới đây trả 0 document.
const deptA = new mongoose.Types.ObjectId();
const deptB = new mongoose.Types.ObjectId();
const LEGACY_DEPT = "DEPT_LEGACY";

describe("Employees/Projects scope: departmentId ObjectId vs string hex trong JWT", () => {
  let server;
  let baseUrl;

  let adminAToken;
  let adminBToken;
  let globalToken;
  let orphanEmployeeToken;
  let unmappedAdminToken;
  let blankDeptAdminToken;
  let adminDeptBToken;

  let legacyEmployeeId;
  let orphanEmployeeId;
  let deptAProjectId;
  let noDeptProjectId;
  let reviewableNoDeptProjectId;
  let noDeptReportId;
  let reviewableNoDeptReportId;

  function request(path, token) {
    return httpFetch(`${baseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  before(async () => {
    server = createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await connectDB();
    await Promise.all([
      UserModel.deleteMany({ username: /^test-scope-/ }),
      EmployeeModel.deleteMany({ employeeCode: /^TEST-SCOPE-/ }),
      ReportModel.deleteMany({ content: /TEST-SCOPE|không có departmentId/ }),
      ProjectModel.deleteMany({ title: /^TEST-SCOPE-/ }),
    ]);

    await EmployeeModel.insertMany([
      { employeeCode: "TEST-SCOPE-A1", fullName: "Admin Phòng A", departmentId: deptA, level: "Lead", status: "active" },
      {
        employeeCode: "TEST-SCOPE-A2",
        fullName: "Nhân Viên A2",
        departmentId: deptA,
        level: "Junior",
        status: "active",
        // Có 1 request PENDING để hàng đợi duyệt không rỗng: chỉ assert "không 500"
        // thì scope sai (trả rỗng) vẫn xanh và call site :405 không được bảo vệ.
        profileChangeRequests: [
          {
            requestedBy: "TEST-SCOPE-A2",
            requestedAt: new Date("2026-01-05T00:00:00.000Z"),
            status: "PENDING",
            targetFields: { level: "Middle" },
            previousSnapshot: { level: "Junior" },
          },
        ],
      },
      { employeeCode: "TEST-SCOPE-A3", fullName: "Nhân Viên A3", departmentId: deptA, level: "Senior", status: "active" },
      { employeeCode: "TEST-SCOPE-B1", fullName: "Nhân Viên B1", departmentId: deptB, level: "Junior", status: "active" },
      { employeeCode: "TEST-SCOPE-B2", fullName: "Nhân Viên B2", departmentId: deptB, level: "Middle", status: "active" },
      // Dữ liệu cũ/fixture: departmentId là string, không phải ObjectId.
      { employeeCode: "TEST-SCOPE-LEGACY", fullName: "Nhân Viên Legacy", departmentId: LEGACY_DEPT, level: "Junior", status: "active" },
      // Không set departmentId/department/store_raw: auth.middleware trả
      // departmentId = null, đúng ca "Employee chưa được map phòng ban".
      {
        employeeCode: "TEST-SCOPE-ORPHAN",
        fullName: "Nhân Viên Chưa Map Phòng",
        level: "Junior",
        status: "active",
        // Request PENDING để chứng minh scope `{ departmentId: null }` rò hàng đợi
        // duyệt của người không thuộc phòng nào.
        profileChangeRequests: [
          {
            requestedBy: "TEST-SCOPE-ORPHAN",
            requestedAt: new Date("2026-01-07T00:00:00.000Z"),
            status: "PENDING",
            targetFields: { level: "Middle" },
            previousSnapshot: { level: "Junior" },
          },
        ],
      },
    ]);

    const byCode = new Map(
      (await EmployeeModel.find({ employeeCode: /^TEST-SCOPE-/ }).lean()).map((doc) => [
        doc.employeeCode,
        doc,
      ])
    );
    const adminAProfile = byCode.get("TEST-SCOPE-A1");
    const legacyProfile = byCode.get("TEST-SCOPE-LEGACY");
    const orphanProfile = byCode.get("TEST-SCOPE-ORPHAN");
    legacyEmployeeId = legacyProfile._id.toString();
    orphanEmployeeId = orphanProfile._id.toString();

    const adminA = await UserModel.create({
      username: "test-scope-admin-a",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      employeeId: adminAProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    // Admin B gắn đúng hồ sơ legacy -> scope của B là string "DEPT_LEGACY".
    const adminB = await UserModel.create({
      username: "test-scope-admin-b",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      employeeId: legacyProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    const globalAdmin = await UserModel.create({
      username: "test-scope-global",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      isGlobalAdmin: true,
      mustChangePassword: false,
    });
    const orphanEmployeeUser = await UserModel.create({
      username: "test-scope-orphan",
      passwordHash: "not-used-in-this-test",
      role: "Employee",
      businessRole: "staff",
      employeeId: orphanProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    // Admin không gắn hồ sơ nhân viên và isGlobalAdmin=false: đúng ca "quên gán
    // department" mà RBAC phải fail-closed. Không có employeeId nên middleware trả
    // departmentId = null.
    const unmappedAdmin = await UserModel.create({
      username: "test-scope-unmapped",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    // Admin có departmentId nhưng chỉ toàn whitespace. `!user.departmentId` không bắt
    // được ca này, nên nếu guard chỉ dựa vào truthiness thì scope sẽ thành `null` và
    // match employee/project thiếu department của phòng khác.
    const blankDeptProfile = await EmployeeModel.create({
      employeeCode: "TEST-SCOPE-BLANK-DEPT",
      fullName: "Admin Phòng Trống",
      departmentId: "   ",
      level: "Junior",
      status: "active",
      profileChangeRequests: [
        {
          requestedBy: "TEST-SCOPE-BLANK-DEPT",
          requestedAt: new Date("2026-01-06T00:00:00.000Z"),
          status: "PENDING",
          targetFields: { level: "Middle" },
          previousSnapshot: { level: "Junior" },
        },
      ],
    });
    const blankDeptAdmin = await UserModel.create({
      username: "test-scope-blank-dept",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      employeeId: blankDeptProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });

    await ProjectModel.insertMany([
      {
        title: "TEST-SCOPE-Dự án A",
        departmentId: deptA,
        createdBy: adminA._id,
        status: "DRAFT",
        version: 1,
      },
      {
        title: "TEST-SCOPE-Dự án B",
        departmentId: deptB,
        createdBy: adminA._id,
        status: "DRAFT",
        version: 1,
      },
      // `assigneeId` là string hex: đúng shape mà POST /projects và /assign ghi vào
      // field Mixed (zod trả string, Mongoose không cast). Fixture dùng ObjectId sẽ
      // không khớp `user.employeeId` (luôn là string) và test sẽ xanh/rỗng giả tạo.
      {
        title: "TEST-SCOPE-Orphan P1",
        departmentId: deptA,
        createdBy: adminA._id,
        assigneeId: orphanEmployeeId,
        status: "ASSIGNED",
        version: 1,
      },
      {
        title: "TEST-SCOPE-Orphan P2",
        departmentId: deptA,
        createdBy: adminA._id,
        assigneeId: adminAProfile._id.toString(),
        status: "ASSIGNED",
        version: 1,
      },
      {
        title: "TEST-SCOPE-Orphan P3",
        departmentId: deptB,
        createdBy: adminA._id,
        assigneeId: adminAProfile._id.toString(),
        status: "ASSIGNED",
        version: 1,
      },
      // Không có departmentId. Phải ghi thẳng qua collection: schema khai
      // `departmentId: { required: true }` nên Mongoose chặn ở đường thường — document
      // dạng này chỉ vào được bằng seed/migration/ghi trực tiếp Atlas, đúng ca dữ liệu
      // cũ. Đây là bề mặt thật của bug: scope Employee dựng `{ departmentId: undefined }`,
      // Mongoose cast thành `{ departmentId: null }` và match mọi project null/thiếu
      // departmentId, bất kể project đó thuộc phòng nào.
    ]);

    await ProjectModel.collection.insertOne({
      title: "TEST-SCOPE-Orphan P4-no-dept",
      createdBy: adminA._id,
      assigneeId: adminAProfile._id.toString(),
      status: "ASSIGNED",
      version: 1,
      progress: 0,
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const projectsByTitle = new Map(
      (await ProjectModel.find({ title: /^TEST-SCOPE-/ }).lean()).map((p) => [p.title, p])
    );
    deptAProjectId = String(projectsByTitle.get("TEST-SCOPE-Dự án A")._id);
    noDeptProjectId = String(projectsByTitle.get("TEST-SCOPE-Orphan P4-no-dept")._id);

    // Project không có departmentId ở đúng trạng thái mà `POST /reports/:id/review`
    // yêu cầu (PENDING_REVIEW). Dùng P4 (ASSIGNED) sẽ hỏng vì lý do state machine,
    // không phải vì scope — test sẽ đỏ vì sai lý do.
    const reviewable = await ProjectModel.collection.insertOne({
      title: "TEST-SCOPE-Orphan P5-review-no-dept",
      createdBy: adminA._id,
      assigneeId: adminAProfile._id.toString(),
      status: "PENDING_REVIEW",
      version: 1,
      progress: 0,
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    reviewableNoDeptProjectId = String(reviewable.insertedId);

    // Report gắn với project KHÔNG có departmentId: đây là ca duy nhất đi qua
    // `assertReportScope` mà target.departmentId = null, tức ca global admin bị
    // coi là unmapped và nhận 404 khi thiếu `isGlobalAdmin` trong ActorContext.
    noDeptReportId = String(
      (
        await ReportModel.create({
          projectId: noDeptProjectId,
          submittedBy: orphanEmployeeId,
          content: "Báo cáo gắn project không có departmentId",
          status: "PENDING",
        })
      )._id
    );
    // Report thứ hai gắn project PENDING_REVIEW để đi hết được route review.
    reviewableNoDeptReportId = String(
      (
        await ReportModel.create({
          projectId: reviewableNoDeptProjectId,
          submittedBy: orphanEmployeeId,
          content: "Báo cáo review gắn project không có departmentId",
          status: "PENDING",
        })
      )._id
    );

    // Admin phòng B: cùng role Admin nhưng khác scope, dùng để chứng minh 404 vẫn
    // che giấu sự tồn tại của project ngoài phòng.
    const adminBProfile = byCode.get("TEST-SCOPE-B1");
    const adminBUser = await UserModel.create({
      username: "test-scope-admin-b-dept",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      employeeId: adminBProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });

    adminAToken = await signAccessToken({ sub: adminA._id.toString(), role: "Admin" });
    adminBToken = await signAccessToken({ sub: adminB._id.toString(), role: "Admin" });
    globalToken = await signAccessToken({ sub: globalAdmin._id.toString(), role: "Admin" });
    orphanEmployeeToken = await signAccessToken({
      sub: orphanEmployeeUser._id.toString(),
      role: "Employee",
    });
    unmappedAdminToken = await signAccessToken({
      sub: unmappedAdmin._id.toString(),
      role: "Admin",
    });
    blankDeptAdminToken = await signAccessToken({
      sub: blankDeptAdmin._id.toString(),
      role: "Admin",
    });
    adminDeptBToken = await signAccessToken({ sub: adminBUser._id.toString(), role: "Admin" });
  });

  after(async () => {
    if (server) {
      server.closeAllConnections?.();
      server.close();
    }
    await Promise.race([
      (async () => {
        await UserModel.deleteMany({ username: /^test-scope-/ });
        await EmployeeModel.deleteMany({ employeeCode: /^TEST-SCOPE-/ });
        await ReportModel.deleteMany({ content: /TEST-SCOPE|không có departmentId/ });
        await ProjectModel.deleteMany({ title: /^TEST-SCOPE-/ });
        await disconnectDB();
      })(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  });

  test("Admin scoped thấy 3 nhân sự của phòng mình khi departmentId là ObjectId", async () => {
    const res = await request("/api/employees?limit=100", adminAToken);
    assert.equal(res.status, 200);

    const body = PaginatedEmployeesResponseSchema.parse(await res.json());
    assert.equal(body.paging.totalItems, 3, "query string-hex trên field ObjectId trả 0 document");
    assert.equal(body.items.length, 3);
    for (const item of body.items) {
      assert.equal(item.department, deptA.toHexString());
    }
    assert.equal(body.items.some((item) => item.department === deptB.toHexString()), false);
  });

  test("Admin scoped không bypass được scope bằng query departmentId ngoài phòng", async () => {
    const res = await request(`/api/employees?departmentId=${deptB.toHexString()}`, adminAToken);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "RBAC_DENIED");
  });

  test("GET /api/change-requests trả hàng đợi của phòng mình, không 500", async () => {
    const res = await request("/api/change-requests", adminAToken);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.items.length, 1, "scope ObjectId sai -> hàng đợi rỗng dù có request PENDING");
    assert.equal(body.items[0].employeeName, "Nhân Viên A2");
    assert.equal(body.items[0].request.status, "PENDING");
    assert.deepEqual(body.items[0].request.targetFields, { level: "Middle" });
  });

  test("Admin scoped chỉ thấy project của phòng mình", async () => {
    const res = await request("/api/projects?limit=100", adminAToken);
    assert.equal(res.status, 200);

    const body = PaginatedProjectsResponseSchema.parse(await res.json());
    // Mọi project của deptA đều thấy, không project deptB nào lọt vào.
    assert.equal(body.paging.totalItems, 3);
    assert.deepEqual(
      body.items.map((item) => item.title).sort(),
      ["TEST-SCOPE-Dự án A", "TEST-SCOPE-Orphan P1", "TEST-SCOPE-Orphan P2"]
    );
    for (const item of body.items) {
      assert.equal(item.departmentId, deptA.toHexString());
    }
  });

  test("Helper không phá dữ liệu cũ: departmentId string vẫn match đúng", async () => {
    const res = await request("/api/employees?limit=100", adminBToken);
    assert.equal(res.status, 200);

    const body = PaginatedEmployeesResponseSchema.parse(await res.json());
    assert.equal(body.paging.totalItems, 1);
    assert.equal(body.items[0].employeeId, legacyEmployeeId);
  });

  test("Global admin thấy toàn bộ 8 nhân sự", async () => {
    const res = await request("/api/employees?limit=100", globalToken);
    assert.equal(res.status, 200);

    const body = PaginatedEmployeesResponseSchema.parse(await res.json());
    assert.equal(body.paging.totalItems, 8);
  });

  /**
   * Nhánh Employee trong `routes/projects.ts` từng dựng `$or` với
   * `{ departmentId: user.departmentId }` mà không kiểm tra giá trị. Khi user không
   * có departmentId, Mongoose cast `undefined` thành `null`, và `{ departmentId: null }`
   * match mọi project null/thiếu departmentId của MỌI phòng ban.
   *
   * P4-no-dept tồn tại chính vì thế: nếu chỉ seed P1..P3 (đều có departmentId) thì
   * code cũ trả đúng 1 item và test sẽ xanh trên một lỗ hổng còn nguyên.
   */
  test("Employee không có departmentId chỉ thấy việc được giao, không thấy project cả phòng", async () => {
    const res = await request("/api/projects?limit=100", orphanEmployeeToken);
    assert.equal(res.status, 200);

    const body = PaginatedProjectsResponseSchema.parse(await res.json());
    assert.deepEqual(
      body.items.map((item) => item.title),
      ["TEST-SCOPE-Orphan P1"],
      "scope Employee rò project ngoài phạm vi (kể cả project không có departmentId)"
    );
    assert.equal(body.paging.totalItems, 1);
    assert.equal(body.items[0].assigneeId, orphanEmployeeId);
  });

  /**
   * Admin unmapped phải bị chặn ở tầng RBAC trước khi chạm query. Nếu helper nhận
   * `undefined` mà ném, route rơi vào catch và trả 500 — client không phân biệt được
   * với sự cố hạ tầng và có thể retry vô ích.
   */
  test("Admin unmapped gọi GET /api/employees bị 403, không 500", async () => {
    const res = await request("/api/employees?limit=100", unmappedAdminToken);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "RBAC_DENIED");
  });

  /**
   * Department chỉ có whitespace là unmapped. Nếu guard chỉ kiểm tra truthiness,
   * `departmentIdMatch("   ")` trả `null` và scope `{ departmentId: null }` match
   * employee thiếu department của phòng khác — đúng ca rò dữ liệu.
   */
  test("Admin có departmentId toàn whitespace bị 403 ở hàng đợi duyệt", async () => {
    const res = await request("/api/change-requests", blankDeptAdminToken);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "RBAC_DENIED");
  });

  test("Admin có departmentId toàn whitespace gọi GET /api/projects bị 403", async () => {
    const res = await request("/api/projects?limit=100", blankDeptAdminToken);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "RBAC_DENIED");
  });

  // --- Bug 1: Admin unmapped đọc toàn bộ projects ------------------------------
  // Không guard thì không nhánh scope nào khớp, `query` ở lại `{}` và `find({})`
  // trả cả collection — 200 kèm dữ liệu của mọi phòng, tệ hơn cả 403.

  test("Admin unmapped (departmentId null) gọi GET /api/projects bị 403", async () => {
    const res = await request("/api/projects?limit=100", unmappedAdminToken);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "RBAC_DENIED");
  });

  test("Admin có departmentId rỗng gọi GET /api/projects bị 403", async () => {
    // Cùng guard với whitespace: trim rồi so rỗng, không dựa vào truthiness.
    const res = await request("/api/projects?limit=100", blankDeptAdminToken);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "RBAC_DENIED");
  });

  test("Global admin (departmentId null) vẫn thấy toàn bộ project", async () => {
    const res = await request("/api/projects?limit=100", globalToken);
    assert.equal(res.status, 200);

    const body = PaginatedProjectsResponseSchema.parse(await res.json());
    assert.equal(body.paging.totalItems, 7);
    assert.deepEqual(
      body.items.map((item) => item.title).sort(),
      [
        "TEST-SCOPE-Dự án A",
        "TEST-SCOPE-Dự án B",
        "TEST-SCOPE-Orphan P1",
        "TEST-SCOPE-Orphan P2",
        "TEST-SCOPE-Orphan P3",
        "TEST-SCOPE-Orphan P4-no-dept",
        "TEST-SCOPE-Orphan P5-review-no-dept",
      ]
    );
  });

  // --- Bug 2: global admin bị 404 khi mở chi tiết project ----------------------

  test("Global admin mở chi tiết project không có departmentId được 200", async () => {
    const res = await request(`/api/projects/${noDeptProjectId}`, globalToken);
    assert.equal(res.status, 200, "thiếu isGlobalAdmin trong ActorContext -> 404");
    assert.equal((await res.json()).id, noDeptProjectId);
  });

  test("Admin scoped deptA mở chi tiết project của phòng mình được 200", async () => {
    const res = await request(`/api/projects/${deptAProjectId}`, adminAToken);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).id, deptAProjectId);
  });

  test("Admin scoped deptB mở chi tiết project deptA vẫn 404 (không lộ tồn tại)", async () => {
    const res = await request(`/api/projects/${deptAProjectId}`, adminDeptBToken);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "RESOURCE_NOT_FOUND");
  });

  test("Employee không liên quan mở chi tiết project được 404", async () => {
    const res = await request(`/api/projects/${deptAProjectId}`, orphanEmployeeToken);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "RESOURCE_NOT_FOUND");
  });

  // --- Bug 3: assertReportScope thiếu isGlobalAdmin ---------------------------
  // `POST /api/reports` KHÔNG gọi assertReportScope (nó chỉ tạo report + transition),
  // nên test qua endpoint đó sẽ xanh cả khi bug còn nguyên. Hai endpoint thật sự đi
  // qua assertReportScope là GET /api/reports/:id và POST /api/reports/:id/review.

  test("Global admin đọc report gắn project không có departmentId được 200", async () => {
    const res = await request(`/api/reports/${noDeptReportId}`, globalToken);
    assert.equal(res.status, 200, "thiếu isGlobalAdmin trong ActorContext -> 404");
    assert.equal((await res.json())._id, noDeptReportId);
  });

  test("Global admin review report gắn project không có departmentId không bị 404 scope", async () => {
    const res = await httpFetch(`${baseUrl}/api/reports/${reviewableNoDeptReportId}/review`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${globalToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "REJECT", reason: "Thiếu minh chứng", expectedVersion: 1 }),
    });
    assert.equal(res.status, 200, "assertReportScope chặn nhầm global admin");
  });
});

describe("departmentIdMatch: fail-closed và giữ nguyên kiểu dữ liệu cũ", () => {
  test("null/undefined/rỗng/whitespace đều trả null, không ném", () => {
    assert.equal(departmentIdMatch(null), null);
    assert.equal(departmentIdMatch(undefined), null);
    assert.equal(departmentIdMatch(""), null);
    assert.equal(departmentIdMatch("   "), null);
  });

  test("department code dạng string trả nguyên bản", () => {
    assert.equal(departmentIdMatch("DEPT_LEGACY"), "DEPT_LEGACY");
  });

  test("ObjectId hex trả $in gồm cả string và ObjectId", () => {
    const hex = "6ad77a3ef4b31490e55d31c8";
    const match = departmentIdMatch(hex);
    assert.ok(Array.isArray(match.$in), "phải là $in");
    assert.equal(match.$in.length, 2);
    assert.equal(match.$in[0], hex);
    assert.ok(match.$in[1] instanceof mongoose.Types.ObjectId);
    assert.equal(String(match.$in[1]), hex);
  });

  test("chuỗi 12 ký tự không bị cast thành ObjectId", () => {
    // `ObjectId.isValid("123456789012")` trả true ở một số phiên bản driver; regex
    // 24-hex phải chặn để department code 12 ký tự không bị hiểu thành ObjectId.
    assert.equal(departmentIdMatch("123456789012"), "123456789012");
  });
});
