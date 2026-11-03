import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { createServer } from "node:http";

import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { StoreModel } from "../dist/models/Store.js";
import { ScheduleEntryModel } from "../dist/models/ScheduleEntry.js";
import { CashCountModel } from "../dist/models/Cash.js";
import { PosOrderModel } from "../dist/models/PosOrder.js";
import { signAccessToken } from "../dist/services/auth.service.js";
import { DashboardOverviewSchema } from "@hr-blockbot/contracts";
import { testGrant, SELF_CAPS } from './helpers/authorization-v1-fixture.mjs';

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
    req.end();
  });
}

const OUTLET_1 = "GUTA CAFE - TEST Dashboard 1";
const OUTLET_2 = "GUTA EXPRESS - TEST Dashboard 2";
const OUTLET_3 = "BÁNH MÌ 365 - TEST Dashboard 3";
const GROUP_1 = "Group TEST AOM Dashboard";
const SUPPORT_1 = "GIAO HÀNG - TEST Dashboard";
const DELETED_OUTLET = "GUTA CAFE - TEST Dashboard Đã Xoá";

const FIXTURE = {
  employees: { total: 5, active: 4, inactive: 1 },
  stores: { outlets: 3, groups: 0, support: 0 },
  profileCompleted: 3,
  latestScheduleDate: "2026-10-11",
};

describe("Dashboard overview: số liệu derive từ DB, KPI thiếu nguồn trả null", () => {
  let server;
  let baseUrl;
  let employeeToken;

  before(async () => {
    server = createServer(createApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await connectDB();
    await Promise.all([
      UserModel.deleteMany({ username: /^test-dash-/ }),
      EmployeeModel.deleteMany({ employeeCode: /^TEST-DASH-/ }),
      StoreModel.deleteMany({ store_name: /Dashboard/ }),
      ScheduleEntryModel.deleteMany({ employee_code: /^TEST-DASH-/ }),
      CashCountModel.deleteMany({ store_name: /TEST Dashboard/ }),
      PosOrderModel.deleteMany({ orderId: /^TEST-DASH-ORDER-/ }),
    ]);

    // Cửa hàng: 3 outlet + 1 group + 1 support (legacy, không `kind`) + 1 outlet đã xoá.
    await StoreModel.collection.insertMany([
      { store_name: OUTLET_1, employee_count: 0 },
      { store_name: OUTLET_2, employee_count: 0 },
      { store_name: OUTLET_3, employee_count: 0 },
      { store_name: GROUP_1, employee_count: 0 },
      { store_name: SUPPORT_1, employee_count: 0 },
      { store_name: DELETED_OUTLET, employee_count: 0, deleted_at: new Date("2026-09-01T00:00:00Z") },
    ]);

    await EmployeeModel.insertMany([
      {
        employeeCode: "TEST-DASH-E1",
        fullName: "Quản Lý Outlet 1",
        store_raw: OUTLET_1,
        status: "active",
        businessRole: "sm",
        profile_status: "ĐÃ HOÀN TẤT",
      },
      {
        employeeCode: "TEST-DASH-E2",
        fullName: "Nhân Viên Outlet 1",
        store_raw: OUTLET_1,
        status: "active",
        businessRole: "staff",
        profile_status: "ĐÃ HOÀN TẤT",
      },
      {
        employeeCode: "TEST-DASH-E3",
        fullName: "Phụ Trách Outlet 2",
        store_raw: OUTLET_2,
        status: "active",
        businessRole: "ptch",
        profile_status: "ĐÃ HOÀN TẤT",
      },
      {
        employeeCode: "TEST-DASH-E4",
        fullName: "Nhân Viên Outlet 3",
        store_raw: OUTLET_3,
        status: "active",
        businessRole: "staff",
        profile_status: "CHƯA HOÀN TẤT",
      },
      {
        employeeCode: "TEST-DASH-E5",
        fullName: "Nhân Viên Nghỉ 1",
        store_raw: OUTLET_3,
        status: "inactive",
        businessRole: "staff",
        profile_status: "CHƯA HOÀN TẤT",
      },
      {
        employeeCode: "TEST-DASH-E6",
        fullName: "Nhân Viên Nghỉ 2",
        store_raw: GROUP_1,
        status: "inactive",
        businessRole: "staff",
        profile_status: "CHƯA HOÀN TẤT",
      },
    ]);

    await ScheduleEntryModel.insertMany([
      {
        employee_code: "TEST-DASH-E1",
        employee_name: "Quản Lý Outlet 1",
        block_code: "B1",
        block_index: 0,
        work_date: "2026-10-04",
        shift_code: "S1",
      },
      {
        employee_code: "TEST-DASH-E1",
        employee_name: "Quản Lý Outlet 1",
        block_code: "B1",
        block_index: 0,
        work_date: FIXTURE.latestScheduleDate,
        shift_code: "S1",
      },
      {
        employee_code: "TEST-DASH-E2",
        employee_name: "Nhân Viên Outlet 1",
        block_code: "B2",
        block_index: 0,
        work_date: "2026-09-27",
        shift_code: "S2",
      },
    ]);

    // Chỉ 1/N cửa hàng có cash_counts — đúng lý do revenue không thể tính toàn chuỗi.
    await CashCountModel.insertMany([
      { store_name: OUTLET_1, cash_total_vnd: 1000, walkin_total_vnd: 500, grand_total_vnd: 1500 },
    ]);

    const canonicalStores = await StoreModel.find({ store_name: { $in: [OUTLET_1, OUTLET_2, OUTLET_3] } }).lean();
    for (const store of canonicalStores) {
      await StoreModel.updateOne({ _id: store._id }, { $set: { kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'isolated-dashboard-mapping' } });
      await EmployeeModel.updateMany({ store_raw: store.store_name }, { $set: { storeId: store._id, storeMappingRef: 'isolated-dashboard-personnel' } });
    }
    await PosOrderModel.insertMany([
      { orderId: 'TEST-DASH-ORDER-1', storeId: canonicalStores[0]._id, orderedAt: new Date(), channel: 'IN_STORE', paymentMethod: 'CASH', status: 'COMPLETED', subtotalVnd: 125000, discountVnd: 5000, refundVnd: 0, netRevenueVnd: 120000, items: [], source: 'demo' },
      { orderId: 'TEST-DASH-ORDER-2', storeId: canonicalStores[1]._id, orderedAt: new Date(), channel: 'APP', paymentMethod: 'MOMO', status: 'COMPLETED', subtotalVnd: 85000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 85000, items: [], source: 'demo' },
      { orderId: 'TEST-DASH-ORDER-3', storeId: canonicalStores[2]._id, orderedAt: new Date(), channel: 'IN_STORE', paymentMethod: 'CASH', status: 'CANCELLED', subtotalVnd: 90000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 0, items: [], source: 'demo' },
    ]);
    const linked = await EmployeeModel.findOne({ employeeCode: 'TEST-DASH-E1' });
    const user = await UserModel.create({
      username: "test-dash-employee",
      passwordHash: "not-used-in-this-test",
      role: "Admin",
      businessRole: "admin",
      isGlobalAdmin: true,
      mustChangePassword: false,
      employeeId: linked._id,
    });
    await UserModel.updateOne({ _id: user._id }, { $set: { authorization: { schemaVersion: 1, profile: 'om', grants: [testGrant('om', { kind: 'self' }, SELF_CAPS, user._id), testGrant('om', { kind: 'organization', storeIds: canonicalStores.map((store) => String(store._id)) }, ['dashboard.read'], user._id)] } } });
    linked.userId = user._id; await linked.save();
    employeeToken = await signAccessToken({ sub: user._id.toString(), role: "Admin" });
  });

  after(async () => {
    if (server) {
      server.closeAllConnections?.();
      server.close();
    }
    await Promise.race([
      (async () => {
        await UserModel.deleteMany({ username: /^test-dash-/ });
        await EmployeeModel.deleteMany({ employeeCode: /^TEST-DASH-/ });
        await StoreModel.deleteMany({ store_name: /Dashboard/ });
        await ScheduleEntryModel.deleteMany({ employee_code: /^TEST-DASH-/ });
        await CashCountModel.deleteMany({ store_name: /TEST Dashboard/ });
        await PosOrderModel.deleteMany({ orderId: /^TEST-DASH-ORDER-/ });
        await disconnectDB();
      })(),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  });

  test("không token bị 401", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "UNAUTHENTICATED");
  });

  test("response parse được qua DashboardOverviewSchema", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    assert.equal(res.status, 200);

    const overview = DashboardOverviewSchema.parse(await res.json());
    assert.equal(typeof overview.generatedAt, "string");
    assert.equal(Number.isNaN(Date.parse(overview.generatedAt)), false);
  });

  test("đếm stores/employees khớp fixture", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    assert.deepEqual(overview.stores, FIXTURE.stores);
    assert.deepEqual(overview.employees, { ...FIXTURE.employees, unknown: 0 });
  });

  test("unverified ETL/title metrics stay unavailable; employeesPerOutlet uses scoped canonical counts", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    assert.equal(overview.profileCompletionRate.value, null);
    assert.equal(overview.profileCompletionRate.source, "none");
    assert.ok(overview.profileCompletionRate.reason.length > 0);

    // 2/3 outlet có manager (sm ở outlet 1, ptch ở outlet 2); outlet 3 không có.
    assert.equal(overview.managersCovered.value, null);
    assert.equal(overview.managersCovered.source, "none");

    assert.equal(overview.employeesPerOutlet.value, 1.7);
    assert.equal(overview.employeesPerOutlet.source, "canonical employees/storeId");
  });

  test("revenue aggregate chỉ tính order hoàn tất trong phạm vi được cấp", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    assert.equal(overview.revenue.value, 205000);
    assert.equal(overview.revenue.source, "pos_orders");
    assert.equal(overview.revenue.reason, null);
    assert.ok(typeof overview.revenue.asOf === "string");
  });

  test("SM chỉ thấy doanh thu của cửa hàng được cấp", async () => {
    const user = await UserModel.findOne({ username: "test-dash-employee" }).lean();
    const originalAuthorization = user.authorization;
    const linked = await EmployeeModel.findOne({ employeeCode: "TEST-DASH-E1" }).lean();
    await UserModel.updateOne(
      { username: "test-dash-employee" },
      { $set: { authorization: { schemaVersion: 1, profile: "sm", grants: [testGrant("sm", { kind: "organization", storeIds: [String(linked.storeId)] }, ["dashboard.read"], user._id)] } } }
    );
    try {
      const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.status, 200);
      const overview = DashboardOverviewSchema.parse(await res.json());
      assert.equal(overview.stores.outlets, 1);
      assert.equal(overview.revenue.value, 120000);
    } finally {
      await UserModel.updateOne({ username: "test-dash-employee" }, { $set: { authorization: originalAuthorization } });
    }
  });

  test("onTimeRate trả null vì nguồn không có dữ liệu chấm công", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    assert.equal(overview.onTimeRate.value, null);
    assert.equal(overview.onTimeRate.source, "none");
    assert.equal(overview.onTimeRate.asOf, null);
    assert.ok(overview.onTimeRate.reason.length > 0);
  });

  test("thiếu profile_status/businessRole -> value null kèm reason, không trả 0", async () => {
    // Xoá sạch hai field nguồn trên TOÀN BỘ nhân sự để mô phỏng ETL chưa chạy /
    // backfill chưa chạy. 0% ở đây là số bịa: không có gì để đo.
    const backup = await EmployeeModel.find({ employeeCode: /^TEST-DASH-/ }).lean();
    await EmployeeModel.updateMany(
      { employeeCode: /^TEST-DASH-/ },
      { $unset: { profile_status: "", businessRole: "" } }
    );

    try {
      const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
        headers: { Authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.status, 200);
      const overview = DashboardOverviewSchema.parse(await res.json());

      assert.equal(overview.profileCompletionRate.value, null);
      assert.equal(overview.profileCompletionRate.source, "none");
      assert.ok(overview.profileCompletionRate.reason.length > 0);
      assert.match(overview.profileCompletionRate.reason, /Chưa có nguồn xác minh/);

      assert.equal(overview.managersCovered.value, null);
      assert.equal(overview.managersCovered.source, "none");
      assert.ok(overview.managersCovered.reason.length > 0);
      assert.match(overview.managersCovered.reason, /không được coi là chỉ số KPI/);
    } finally {
      await EmployeeModel.deleteMany({ employeeCode: /^TEST-DASH-/ });
      await EmployeeModel.insertMany(backup);
    }
  });

  test("legacy schedule date is not leaked from a source without canonical authorization", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    const maxWorkDate = await ScheduleEntryModel.find({ employee_code: /^TEST-DASH-/ })
      .sort({ work_date: -1 })
      .limit(1)
      .lean();

    assert.equal(maxWorkDate[0].work_date, FIXTURE.latestScheduleDate);
    assert.equal(overview.latestScheduleDate, null);
  });
});
