import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { createServer } from "node:http";

import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { StoreModel } from "../dist/models/Store.js";
import mongoose from "mongoose";
import { signAccessToken } from "../dist/services/auth.service.js";
import { StoreSummarySchema, StoreListResponseSchema } from "@hr-blockbot/contracts";

/**
 * Client riêng: `fetch` giữ socket keep-alive và tiến trình test không bao giờ thoát.
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

const OUTLET_A = "GUTA CAFE - TEST Quận 1";
const OUTLET_B = "GUTA EXPRESS - TEST Quận 2";
const GROUP = "Group TEST AOM";
const SUPPORT = "BẾP - TEST Quận 3";
const CASCADE = "GUTA CAFE - TEST Cascade";
const CASCADE_RENAMED = "GUTA CAFE - TEST Cascade Đổi Tên";
const FREE = "GUTA CAFE - TEST Xoá Được";
const RACE_STORE = "GUTA CAFE - TEST Race";
const RACE_NAME_A = "GUTA CAFE - TEST Race A";
const RACE_NAME_B = "GUTA CAFE - TEST Race B";
const OID_OUTLET = "GUTA CAFE - TEST ObjectId Dept";
const OID_DEPT = new mongoose.Types.ObjectId();
const RACE_EMPLOYEES = 1000;
const RACE_ROUNDS = 10;

describe("Stores CRUD: auth, scope, cascade và soft delete", () => {
  let server;
  let baseUrl;

  let globalToken;
  let scopedToken;
  let employeeToken;
  let oidScopedToken;

  let cascadeStoreId;
  let freeStoreId;
  let raceStoreId;

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
    await Promise.all([
      UserModel.deleteMany({ username: /^test-store-/ }),
      EmployeeModel.deleteMany({ employeeCode: /^TEST-STORE-/ }),
      StoreModel.deleteMany({ store_name: /TEST/ }),
    ]);

    // insertOne (không qua Mongoose) = đúng shape document legacy 144 cửa hàng:
    // chỉ có `store_name` + `employee_count`, không `kind`/`status`/`deleted_at`.
    const legacy = await StoreModel.collection.insertMany([
      { store_name: OUTLET_A, employee_count: 999 },
      { store_name: OUTLET_B, employee_count: 1 },
      { store_name: GROUP, employee_count: 0 },
      { store_name: SUPPORT, employee_count: 0 },
      { store_name: CASCADE, employee_count: 2 },
      { store_name: FREE, employee_count: 0 },
      { store_name: RACE_STORE, employee_count: RACE_EMPLOYEES },
      { store_name: OID_OUTLET, employee_count: 1 },
    ]);
    cascadeStoreId = String(legacy.insertedIds[4]);
    freeStoreId = String(legacy.insertedIds[5]);
    raceStoreId = String(legacy.insertedIds[6]);

    await EmployeeModel.insertMany([
      {
        employeeCode: "TEST-STORE-E1",
        fullName: "Nhân Viên Quận 1",
        departmentId: "DEPT_STORE_A",
        department: "DEPT_STORE_A",
        store_raw: OUTLET_A,
        status: "active",
        businessRole: "sm",
      },
      {
        employeeCode: "TEST-STORE-E2",
        fullName: "Nhân Viên Quận 2",
        departmentId: "DEPT_STORE_B",
        department: "DEPT_STORE_B",
        store_raw: OUTLET_B,
        status: "active",
        businessRole: "staff",
      },
      {
        employeeCode: "TEST-STORE-E3",
        fullName: "Nhân Viên Cascade 1",
        departmentId: "DEPT_STORE_B",
        department: "DEPT_STORE_B",
        store_raw: CASCADE,
        status: "active",
        businessRole: "staff",
      },
      {
        employeeCode: "TEST-STORE-E4",
        fullName: "Nhân Viên Cascade 2",
        departmentId: "DEPT_STORE_B",
        department: "DEPT_STORE_B",
        store_raw: CASCADE,
        status: "inactive",
        businessRole: "staff",
      },
      {
        // departmentId là ObjectId thật, đúng shape seed production. Scope cũ so sánh
        // bằng string nên distinct trả rỗng -> Admin scoped thấy 0 cửa hàng.
        employeeCode: "TEST-STORE-OID",
        fullName: "Nhân Viên Dept ObjectId",
        departmentId: OID_DEPT,
        store_raw: OID_OUTLET,
        status: "active",
        businessRole: "sm",
      },
      {
        employeeCode: "TEST-STORE-ADM",
        fullName: "Admin Quận 1",
        departmentId: "DEPT_STORE_A",
        department: "DEPT_STORE_A",
        store_raw: OUTLET_A,
        status: "active",
        businessRole: "admin",
      },
    ]);

    // Map theo code: `find` không đảm bảo thứ tự, destructure mảng sẽ gán nhầm hồ sơ
    // và làm scope test xanh/đỏ ngẫu nhiên.
    const profilesByCode = new Map(
      (await EmployeeModel.find({
        employeeCode: { $in: ["TEST-STORE-E1", "TEST-STORE-ADM", "TEST-STORE-OID"] },
      }).lean()).map((profile) => [profile.employeeCode, profile])
    );
    const employeeProfile = profilesByCode.get("TEST-STORE-E1");
    const scopedAdminProfile = profilesByCode.get("TEST-STORE-ADM");
    const oidAdminProfile = profilesByCode.get("TEST-STORE-OID");

    const globalAdmin = await UserModel.create({
      username: "test-store-global",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      isGlobalAdmin: true,
      mustChangePassword: false,
    });
    const scopedAdmin = await UserModel.create({
      username: "test-store-scoped",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      employeeId: scopedAdminProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    const employeeUser = await UserModel.create({
      username: "test-store-employee",
      passwordHash: "not-used-in-this-test",
      role: "Employee",
      businessRole: "sm",
      employeeId: employeeProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });

    const oidScopedAdmin = await UserModel.create({
      username: "test-store-scoped-oid",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      employeeId: oidAdminProfile._id,
      isGlobalAdmin: false,
      mustChangePassword: false,
    });

    globalToken = await signAccessToken({ sub: globalAdmin._id.toString(), role: "Admin" });
    oidScopedToken = await signAccessToken({ sub: oidScopedAdmin._id.toString(), role: "Admin" });
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
        await UserModel.deleteMany({ username: /^test-store-/ });
        await EmployeeModel.deleteMany({ employeeCode: /^TEST-STORE-/ });
        await StoreModel.deleteMany({ store_name: /TEST/ });
        await disconnectDB();
      })(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  });

  test("GET /api/stores không token bị 401", async () => {
    const res = await request("GET", "/api/stores");
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "UNAUTHENTICATED");
  });

  test("Employee chỉ thấy cửa hàng của chính mình", async () => {
    const res = await request("GET", "/api/stores?limit=100", null, employeeToken);
    assert.equal(res.status, 200);

    const body = StoreListResponseSchema.parse(await res.json());
    assert.deepEqual(
      body.items.map((item) => item.name),
      [OUTLET_A]
    );
    assert.equal(body.paging.totalItems, 1);

    const other = await request("GET", `/api/stores/${cascadeStoreId}`, null, employeeToken);
    assert.equal(other.status, 403);
    assert.equal((await other.json()).error.code, "RBAC_DENIED");
  });

  test("Admin scope hẹp không thấy cửa hàng ngoài department", async () => {
    const res = await request("GET", "/api/stores?limit=100", null, scopedToken);
    assert.equal(res.status, 200);

    const body = StoreListResponseSchema.parse(await res.json());
    const names = body.items.map((item) => item.name);
    assert.deepEqual(names, [OUTLET_A]);
    assert.equal(names.includes(OUTLET_B), false);

    // Bypass bằng filter cũng không lọt: scope áp trước filter.
    const bypass = await request("GET", "/api/stores?kind=outlet&district=Quận 2", null, scopedToken);
    assert.equal(bypass.status, 200);
    assert.deepEqual((await bypass.json()).items, []);
  });

  test("global admin thấy toàn bộ cửa hàng, kèm summary theo kind", async () => {
    const res = await request("GET", "/api/stores?limit=100", null, globalToken);
    assert.equal(res.status, 200);

    const body = StoreListResponseSchema.parse(await res.json());
    const names = body.items.map((item) => item.name);
    for (const name of [OUTLET_A, OUTLET_B, GROUP, SUPPORT, CASCADE, FREE]) {
      assert.ok(names.includes(name), `thiếu ${name}`);
    }

    // Doc legacy không có `kind`: phân loại bằng tên, không bằng field thiếu.
    const byName = new Map(body.items.map((item) => [item.name, item]));
    assert.equal(byName.get(OUTLET_A).kind, "outlet");
    assert.equal(byName.get(GROUP).kind, "group");
    assert.equal(byName.get(SUPPORT).kind, "support");

    // employeeCount derive từ employees.store_raw, không tin stores.employee_count (=999).
    assert.equal(byName.get(OUTLET_A).employeeCount, 2);
    assert.equal(byName.get(OUTLET_A).activeEmployeeCount, 2);
    assert.equal(byName.get(OUTLET_A).managerName, "Nhân Viên Quận 1");

    // OUTLET_A, OUTLET_B, CASCADE, FREE, RACE_STORE, OID_OUTLET — GROUP là group,
    // SUPPORT là support.
    assert.equal(body.summary.totalOutlets, 6);
    assert.equal(body.summary.totalGroups, 1);
  });

  test("POST tạo cửa hàng rồi GET /:id đọc lại đúng", async () => {
    const created = await request(
      "POST",
      "/api/stores",
      { name: "GUTA CAFE - TEST Mới", code: "TST-01", district: "Quận 7", kind: "outlet" },
      globalToken
    );
    assert.equal(created.status, 201);

    const summary = StoreSummarySchema.parse(await created.json());
    assert.equal(summary.name, "GUTA CAFE - TEST Mới");
    assert.equal(summary.code, "TST-01");
    assert.equal(summary.district, "Quận 7");
    assert.equal(summary.status, "ACTIVE");
    assert.equal(summary.employeeCount, 0);
    assert.equal(summary.managerName, null);

    const read = await request("GET", `/api/stores/${summary.id}`, null, globalToken);
    assert.equal(read.status, 200);
    assert.deepEqual(StoreSummarySchema.parse(await read.json()), summary);
  });

  test("POST trùng tên bị 409 STORE_EXISTS", async () => {
    const res = await request("POST", "/api/stores", { name: OUTLET_A }, globalToken);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, "STORE_EXISTS");
  });

  test("POST tên rỗng bị 400 VALIDATION_FAILED kèm details", async () => {
    const res = await request("POST", "/api/stores", { name: "   " }, globalToken);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.error.code, "VALIDATION_FAILED");
    assert.ok(body.error.details, "phải kèm details để client hiển thị lỗi field");
  });

  test("PATCH đổi tên cascade employees.store_raw và tính lại employee_count", async () => {
    const res = await request(
      "PATCH",
      `/api/stores/${cascadeStoreId}`,
      { name: CASCADE_RENAMED },
      globalToken
    );
    assert.equal(res.status, 200);

    const summary = StoreSummarySchema.parse(await res.json());
    assert.equal(summary.name, CASCADE_RENAMED);
    assert.equal(summary.employeeCount, 2);
    assert.equal(summary.activeEmployeeCount, 1);

    const employees = await EmployeeModel.find({ employeeCode: /^TEST-STORE-E[34]$/ }).lean();
    assert.equal(employees.length, 2);
    for (const employee of employees) {
      assert.equal(employee.store_raw, CASCADE_RENAMED);
    }

    const store = await StoreModel.findById(cascadeStoreId).lean();
    assert.equal(store.employee_count, 2, "employee_count phải là số thật, không phải giá trị cũ");
  });

  test("Admin scope hẹp bị 403 khi PATCH/DELETE cửa hàng ngoài department", async () => {
    // GET đã scoped từ đầu; nếu write chỉ check role thì Admin hẹp sửa/xoá được
    // cửa hàng ngoài department — cross-tenant write.
    const patch = await request(
      "PATCH",
      `/api/stores/${cascadeStoreId}`,
      { district: "Quận 12" },
      scopedToken
    );
    assert.equal(patch.status, 403);
    assert.equal((await patch.json()).error.code, "RBAC_DENIED");

    const rename = await request(
      "PATCH",
      `/api/stores/${cascadeStoreId}`,
      { name: "GUTA CAFE - TEST Chiếm Đoạt" },
      scopedToken
    );
    assert.equal(rename.status, 403);
    assert.equal((await rename.json()).error.code, "RBAC_DENIED");

    const del = await request("DELETE", `/api/stores/${cascadeStoreId}`, null, scopedToken);
    assert.equal(del.status, 403);
    assert.equal((await del.json()).error.code, "RBAC_DENIED");

    // Không có thay đổi nào rơi xuống DB.
    const store = await StoreModel.findById(cascadeStoreId).lean();
    assert.equal(store.store_name, CASCADE_RENAMED);
    assert.equal(store.deleted_at ?? null, null);
    assert.equal(await EmployeeModel.countDocuments({ store_raw: CASCADE_RENAMED }), 2);
  });

  test("Admin scope hẹp không được tạo cửa hàng mới (403)", async () => {
    const res = await request(
      "POST",
      "/api/stores",
      { name: "GUTA CAFE - TEST Do Scoped Tạo" },
      scopedToken
    );
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, "RBAC_DENIED");
    assert.equal(await StoreModel.countDocuments({ store_name: "GUTA CAFE - TEST Do Scoped Tạo" }), 0);
  });

  test("Admin scope hẹp vẫn PATCH được cửa hàng trong department của mình", async () => {
    const created = await request(
      "POST",
      "/api/stores",
      { name: "GUTA CAFE - TEST Scoped Của Tôi", kind: "outlet" },
      globalToken
    );
    assert.equal(created.status, 201);
    const storeId = StoreSummarySchema.parse(await created.json()).id;

    // Gắn nhân sự vào cửa hàng đó trong department A để nó thuộc scope của scopedAdmin.
    await EmployeeModel.create({
      employeeCode: "TEST-STORE-SCOPED-OWN",
      fullName: "Nhân Viên Scoped",
      departmentId: "DEPT_STORE_A",
      department: "DEPT_STORE_A",
      store_raw: "GUTA CAFE - TEST Scoped Của Tôi",
      status: "active",
      businessRole: "staff",
    });

    const patch = await request("PATCH", `/api/stores/${storeId}`, { district: "Quận 4" }, scopedToken);
    assert.equal(patch.status, 200);
    assert.equal(StoreSummarySchema.parse(await patch.json()).district, "Quận 4");

    // DELETE trên cửa hàng TRONG scope phải đi qua được scope guard và dừng ở ràng
    // buộc nhân sự (409), không phải 403. Xem ghi chú trong báo cáo: 204 là không thể
    // với Admin scoped vì scope derive từ employees — cửa hàng rời scope đúng lúc
    // nhân sự cuối cùng rời đi.
    const del = await request("DELETE", `/api/stores/${storeId}`, null, scopedToken);
    assert.equal(del.status, 409);
    assert.equal((await del.json()).error.code, "STORE_HAS_EMPLOYEES");

    await EmployeeModel.deleteMany({ employeeCode: "TEST-STORE-SCOPED-OWN" });
    const globalDel = await request("DELETE", `/api/stores/${storeId}`, null, globalToken);
    assert.equal(globalDel.status, 204);
  });

  test("Admin scoped với departmentId là ObjectId thật vẫn thấy cửa hàng trong scope", async () => {
    const res = await request("GET", "/api/stores?limit=100", null, oidScopedToken);
    assert.equal(res.status, 200);

    const body = StoreListResponseSchema.parse(await res.json());
    assert.deepEqual(
      body.items.map((item) => item.name),
      [OID_OUTLET],
      "departmentId kiểu ObjectId không được làm scope rỗng"
    );
    assert.equal(body.paging.totalItems, 1);
  });

  test("PATCH body rỗng bị 400, id sai định dạng bị 400", async () => {
    const empty = await request("PATCH", `/api/stores/${cascadeStoreId}`, {}, globalToken);
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error.code, "VALIDATION_FAILED");

    const badId = await request("PATCH", "/api/stores/khong-phai-objectid", { name: "X" }, globalToken);
    assert.equal(badId.status, 400);
  });

  test("PATCH name trùng tên hiện tại vẫn ghi các field khác", async () => {
    const before = await StoreModel.findById(raceStoreId).lean();
    assert.equal(before.status ?? "ACTIVE", "ACTIVE");
    const employeesBefore = await EmployeeModel.countDocuments({ store_raw: RACE_STORE });

    const res = await request(
      "PATCH",
      `/api/stores/${raceStoreId}`,
      { name: RACE_STORE, status: "INACTIVE", district: "Quận 9", code: "C9" },
      globalToken
    );
    assert.equal(res.status, 200);

    const body = StoreSummarySchema.parse(await res.json());
    assert.equal(body.name, RACE_STORE);
    assert.equal(body.status, "INACTIVE");
    assert.equal(body.district, "Quận 9");
    assert.equal(body.code, "C9");

    // DB phải thật sự đổi, không chỉ response.
    const after = await StoreModel.findById(raceStoreId).lean();
    assert.equal(after.status, "INACTIVE");
    assert.equal(after.district, "Quận 9");
    assert.equal(after.code, "C9");
    // Không được cascade: nhân sự vẫn nguyên ở tên cũ.
    assert.equal(
      await EmployeeModel.countDocuments({ store_raw: RACE_STORE }),
      employeesBefore
    );
  });

  test("DELETE bị 409 STORE_DELETE_CONFLICT khi tên đổi giữa count và update", async () => {
    // Dựng đúng TOCTOU của handler: đọc store_name -> countDocuments -> ghi. Nếu bước
    // ghi không có điều kiện `store_name`, rename chen giữa làm count đo trên tên cũ
    // (0 nhân sự) và cửa hàng bị xoá trong khi nhân sự đã trỏ tên mới.
    const target = await StoreModel.create({
      store_name: "GUTA CAFE - TEST TOCTOU",
      employee_count: 0,
      kind: "outlet",
      status: "ACTIVE",
      deleted_at: null,
    });

    const realCountDocuments = EmployeeModel.countDocuments;
    let renamed = false;
    EmployeeModel.countDocuments = function countWithRename(...args) {
      const result = realCountDocuments.apply(this, args);
      if (!renamed) {
        renamed = true;
        // Rename xảy ra sau khi count đọc nhưng trước khi handler ghi deleted_at.
        return Promise.resolve(result).then(async (value) => {
          await StoreModel.collection.updateOne(
            { _id: target._id },
            { $set: { store_name: "GUTA CAFE - TEST TOCTOU Renamed" } }
          );
          return value;
        });
      }
      return result;
    };

    try {
      const res = await request("DELETE", `/api/stores/${target._id}`, null, globalToken);
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error.code, "STORE_DELETE_CONFLICT");
    } finally {
      EmployeeModel.countDocuments = realCountDocuments;
    }

    const after = await StoreModel.findById(target._id).lean();
    assert.equal(after.deleted_at ?? null, null, "không được xoá khi tên đã đổi");
    assert.equal(after.store_name, "GUTA CAFE - TEST TOCTOU Renamed");

    await StoreModel.deleteOne({ _id: target._id });
  });

  test("DELETE khi còn nhân sự bị 409 STORE_HAS_EMPLOYEES kèm employeeCount", async () => {
    const res = await request("DELETE", `/api/stores/${cascadeStoreId}`, null, globalToken);
    assert.equal(res.status, 409);

    const body = await res.json();
    assert.equal(body.error.code, "STORE_HAS_EMPLOYEES");
    assert.equal(body.error.details.employeeCount, 2);

    const stillThere = await StoreModel.findById(cascadeStoreId).lean();
    assert.ok(stillThere, "cửa hàng không được xoá khi vẫn còn nhân sự");
    // Doc legacy không có field `deleted_at` -> undefined cũng là "chưa xoá".
    assert.equal(stillThere.deleted_at ?? null, null);
  });

  test(`PATCH đổi tên đồng thời ${RACE_ROUNDS} vòng trên ${RACE_EMPLOYEES} nhân sự: không mồ côi`, async () => {
    // Với N nhỏ (40) race không lộ vì cascade xong trước khi request thứ hai đọc.
    // N=1000 + làm chậm cascade của request đi trước để mở đúng cửa sổ QA dựng được
    // với 2 client thật (độ trễ mạng giữa rename và cascade):
    //   A: acquire -> rename orig->A  |  B: acquire, đọc previousName = "A"
    //   B: claim A->B, cascade A->B (0 doc)  |  A: cascade orig->A
    //   => toàn bộ nhân sự mồ côi ở "A", cả hai response đều 200.
    // Độ trễ được tiêm ở phía test (không có seam trong production code) và chỉ áp
    // cho lần updateMany đầu tiên của mỗi vòng.
    const employees = Array.from({ length: RACE_EMPLOYEES }, (_, index) => ({
      employeeCode: `TEST-STORE-RACE-${index}`,
      fullName: `Nhân Viên Race ${index}`,
      store_raw: RACE_STORE,
      status: "active",
      businessRole: "staff",
    }));
    await EmployeeModel.insertMany(employees);

    const realUpdateMany = EmployeeModel.updateMany;
    let delayNextCascade = false;

    try {
      EmployeeModel.updateMany = function delayedUpdateMany(...args) {
        if (!delayNextCascade) return realUpdateMany.apply(this, args);
        delayNextCascade = false;
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            realUpdateMany.apply(this, args).then(resolve, reject);
          }, 250);
        });
      };

      for (let round = 0; round < RACE_ROUNDS; round += 1) {
        const nameA = `${RACE_NAME_A} ${round}`;
        const nameB = `${RACE_NAME_B} ${round}`;

        delayNextCascade = true;
        const firstPromise = request("PATCH", `/api/stores/${raceStoreId}`, { name: nameA }, globalToken);
        // Đủ để A đã rename xong và đang nằm trong cascade bị làm chậm.
        await new Promise((resolve) => setTimeout(resolve, 60));
        const secondPromise = request("PATCH", `/api/stores/${raceStoreId}`, { name: nameB }, globalToken);

        const [first, second] = await Promise.all([firstPromise, secondPromise]);

        const statuses = [first.status, second.status].sort();
        const winner = first.status === 200 ? first : second;
        const loser = first.status === 200 ? second : first;
        const loserCode = first.status === 200 || second.status === 200 ? (await loser.json()).error?.code : null;

        // Kiểm tra toàn vẹn dữ liệu TRƯỚC khi kiểm tra status code: thiệt hại thật của
        // race là nhân sự mồ côi. Bất biến: mọi nhân sự phải nằm ở tên mà store đang
        // mang — không phụ thuộc request nào thắng.
        const storeNow = await StoreModel.findById(raceStoreId).lean();
        const atCurrentName = await EmployeeModel.countDocuments({
          store_raw: storeNow?.store_name ?? "<missing>",
        });
        assert.equal(
          atCurrentName,
          RACE_EMPLOYEES,
          `vòng ${round}: ${RACE_EMPLOYEES - atCurrentName} nhân sự mồ côi — store tên ` +
            `'${storeNow?.store_name}', employee_count=${storeNow?.employee_count}, ` +
            `statuses=${statuses}, loser=${loserCode}`
        );

        assert.deepEqual(
          statuses,
          [200, 409],
          `vòng ${round}: mong đợi đúng 1 thắng 1 thua, nhận ${statuses} (loser=${loserCode})`
        );

        const winnerBody = StoreSummarySchema.parse(await winner.json());
        assert.ok(
          ["STORE_RENAME_CONFLICT", "STORE_RENAME_BUSY"].includes(loserCode),
          `vòng ${round}: mã lỗi lạ ${loserCode}`
        );
        assert.equal(
          await EmployeeModel.countDocuments({ store_raw: nameA }),
          winnerBody.name === nameA ? RACE_EMPLOYEES : 0,
          `vòng ${round}: phân bố nhân sự sai ở ${nameA}`
        );
        assert.equal(
          await EmployeeModel.countDocuments({ store_raw: nameB }),
          winnerBody.name === nameB ? RACE_EMPLOYEES : 0,
          `vòng ${round}: phân bố nhân sự sai ở ${nameB}`
        );

        const store = await StoreModel.findById(raceStoreId).lean();
        assert.equal(store.store_name, winnerBody.name);
        assert.equal(store.employee_count, RACE_EMPLOYEES);
        assert.equal(store.rename_lease_until ?? null, null, `vòng ${round}: lease không được rò`);
        assert.equal(store.rename_lease_token ?? null, null, `vòng ${round}: token không được rò`);

        const readBack = await request("GET", `/api/stores/${raceStoreId}`, null, globalToken);
        assert.equal(StoreSummarySchema.parse(await readBack.json()).employeeCount, RACE_EMPLOYEES);

        const reset = await request(
          "PATCH",
          `/api/stores/${raceStoreId}`,
          { name: RACE_STORE },
          globalToken
        );
        assert.equal(reset.status, 200, `vòng ${round}: reset tên thất bại`);
      }
    } finally {
      EmployeeModel.updateMany = realUpdateMany;
    }
  });

  test("lease đang giữ -> 409 STORE_RENAME_BUSY, không cascade", async () => {
    const future = new Date(Date.now() + 60_000);
    await StoreModel.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(raceStoreId) },
      { $set: { rename_lease_until: future, rename_lease_token: "held-by-someone-else" } }
    );

    try {
      const res = await request(
        "PATCH",
        `/api/stores/${raceStoreId}`,
        { name: "GUTA CAFE - TEST Không Được Đổi" },
        globalToken
      );
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error.code, "STORE_RENAME_BUSY");

      const store = await StoreModel.findById(raceStoreId).lean();
      assert.equal(store.store_name, RACE_STORE, "tên không được đổi khi lease bận");
      assert.equal(
        await EmployeeModel.countDocuments({ store_raw: RACE_STORE }),
        RACE_EMPLOYEES,
        "không được cascade khi lease bận"
      );
    } finally {
      await StoreModel.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(raceStoreId) },
        { $set: { rename_lease_until: null, rename_lease_token: null } }
      );
    }
  });

  test("lease hết hạn -> PATCH đổi tên thành công", async () => {
    const past = new Date(Date.now() - 60_000);
    await StoreModel.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(raceStoreId) },
      { $set: { rename_lease_until: past, rename_lease_token: "stale-token" } }
    );

    const res = await request(
      "PATCH",
      `/api/stores/${raceStoreId}`,
      { name: RACE_STORE },
      globalToken
    );
    assert.equal(res.status, 200);

    const store = await StoreModel.findById(raceStoreId).lean();
    assert.equal(store.store_name, RACE_STORE);
    assert.equal(store.rename_lease_until ?? null, null, "lease cũ phải được giải phóng");
  });

  test("PATCH không đổi tên không acquire lease và không chạm employees.store_raw", async () => {
    const before = await EmployeeModel.find({ store_raw: RACE_STORE })
      .select({ _id: 1, store_raw: 1 })
      .lean();

    const res = await request(
      "PATCH",
      `/api/stores/${raceStoreId}`,
      { district: "Quận 9", status: "INACTIVE" },
      globalToken
    );
    assert.equal(res.status, 200);

    const body = StoreSummarySchema.parse(await res.json());
    assert.equal(body.district, "Quận 9");
    assert.equal(body.status, "INACTIVE");
    assert.equal(body.name, RACE_STORE);
    assert.equal(body.employeeCount, RACE_EMPLOYEES);

    const store = await StoreModel.findById(raceStoreId).lean();
    assert.equal(store.rename_lease_until ?? null, null);
    assert.equal(store.rename_lease_token ?? null, null);

    const after = await EmployeeModel.find({ store_raw: RACE_STORE })
      .select({ _id: 1, store_raw: 1 })
      .lean();
    assert.deepEqual(after.map((e) => String(e._id)).sort(), before.map((e) => String(e._id)).sort());
  });

  test("DELETE sau khi chuyển hết nhân sự trả 204 và cửa hàng rời khỏi danh sách", async () => {
    const moved = await EmployeeModel.updateMany(
      { store_raw: CASCADE_RENAMED },
      { $set: { store_raw: FREE } }
    );
    assert.equal(moved.modifiedCount, 2);

    const deleted = await request("DELETE", `/api/stores/${cascadeStoreId}`, null, globalToken);
    assert.equal(deleted.status, 204);
    assert.equal((await deleted.text()).length, 0);

    const list = await request("GET", "/api/stores?limit=100", null, globalToken);
    const body = StoreListResponseSchema.parse(await list.json());
    assert.equal(
      body.items.some((item) => item.id === cascadeStoreId),
      false
    );

    const gone = await request("GET", `/api/stores/${cascadeStoreId}`, null, globalToken);
    assert.equal(gone.status, 404);

    // Nhân sự đã chuyển sang FREE nên FREE vẫn không xoá được — không có orphan.
    const free = await request("DELETE", `/api/stores/${freeStoreId}`, null, globalToken);
    assert.equal(free.status, 409);
    assert.equal((await free.json()).error.code, "STORE_HAS_EMPLOYEES");
  });
});
