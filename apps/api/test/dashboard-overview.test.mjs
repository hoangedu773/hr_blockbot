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
import { signAccessToken } from "../dist/services/auth.service.js";
import { DashboardOverviewSchema } from "@hr-blockbot/contracts";

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
  employees: { total: 6, active: 4, inactive: 2 },
  stores: { outlets: 3, groups: 1, support: 1 },
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

    const user = await UserModel.create({
      username: "test-dash-employee",
      passwordHash: "not-used-in-this-test",
      role: "Employee",
      businessRole: "staff",
      isGlobalAdmin: false,
      mustChangePassword: false,
    });
    employeeToken = await signAccessToken({ sub: user._id.toString(), role: "Employee" });
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
    assert.deepEqual(overview.employees, FIXTURE.employees);
  });

  test("profileCompletionRate, managersCovered, employeesPerOutlet tính từ DB", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    assert.equal(overview.profileCompletionRate.value, 50);
    assert.equal(overview.profileCompletionRate.source, "employees");
    assert.equal(overview.profileCompletionRate.reason, null);

    // 2/3 outlet có manager (sm ở outlet 1, ptch ở outlet 2); outlet 3 không có.
    assert.equal(overview.managersCovered.value, 66.7);
    assert.equal(overview.managersCovered.source, "employees");

    assert.equal(overview.employeesPerOutlet.value, 2);
    assert.equal(overview.employeesPerOutlet.source, "employees");
  });

  test("revenue trả null kèm reason đọc được, không bịa số", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    assert.equal(overview.revenue.value, null);
    assert.equal(overview.revenue.source, "cash_counts");
    assert.equal(typeof overview.revenue.reason, "string");
    assert.ok(overview.revenue.reason.length > 0);
    // n/m/k phải là số thật từ DB, không phải hằng số trong code.
    assert.match(overview.revenue.reason, /1\/3 cửa hàng/);
    assert.match(overview.revenue.reason, /trong 1 kỳ/);
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
      assert.equal(overview.profileCompletionRate.source, "employees");
      assert.ok(overview.profileCompletionRate.reason.length > 0);
      assert.match(overview.profileCompletionRate.reason, /profile_status/);

      assert.equal(overview.managersCovered.value, null);
      assert.equal(overview.managersCovered.source, "employees");
      assert.ok(overview.managersCovered.reason.length > 0);
      assert.match(overview.managersCovered.reason, /businessRole/);
    } finally {
      await EmployeeModel.deleteMany({ employeeCode: /^TEST-DASH-/ });
      await EmployeeModel.insertMany(backup);
    }
  });

  test("latestScheduleDate bằng max(work_date) của fixture", async () => {
    const res = await httpFetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const overview = DashboardOverviewSchema.parse(await res.json());

    const maxWorkDate = await ScheduleEntryModel.find({ employee_code: /^TEST-DASH-/ })
      .sort({ work_date: -1 })
      .limit(1)
      .lean();

    assert.equal(overview.latestScheduleDate, FIXTURE.latestScheduleDate);
    assert.equal(overview.latestScheduleDate, maxWorkDate[0].work_date);
  });
});
