import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createServer } from "node:http";
import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { ProjectModel } from "../dist/models/Project.js";
import { ReportModel } from "../dist/models/Report.js";
import { StoreModel } from "../dist/models/Store.js";
import { signAccessToken } from "../dist/services/auth.service.js";
import { departmentIdMatch } from "../dist/lib/department-scope.js";
import { PaginatedEmployeesResponseSchema, PaginatedProjectsResponseSchema } from "@hr-blockbot/contracts";
import { authorizationV1Fixture, testGrant, SELF_CAPS } from "./helpers/authorization-v1-fixture.mjs";
let fixture, server, base, legacyToken, unmappedToken, blankToken, stringDeptToken, stringEmployee, projectA, projectB, rawProject, rawReport, reviewableRaw, ownProject;
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  for (const [actor, jobTitle] of [['sm', 'SM'], ['staff', 'CAFE - Nhân viên bán hàng'], ['om', 'R&D (TEST).*'], ['staffB', 'OUTSIDE ONLY']]) {
    await EmployeeModel.updateOne({ _id: fixture.actors[actor].employee._id }, { $set: { job_title: jobTitle } });
  }
  for (const [name, isGlobalAdmin] of [["legacy", true], ["unmapped", false], ["blank", false]]) {
    const employee = name === "blank" ? await EmployeeModel.create({ employeeCode: "SCOPE-BLANK", fullName: "Blank department fixture", departmentId: "   ", status: "active" }) : null;
    const row = await UserModel.create({ username: "scope-" + name, role: "Admin", isGlobalAdmin: isGlobalAdmin, employeeId: employee?._id, passwordHash: "unused" });
    const token = await signAccessToken({ sub: String(row._id), role: "Admin" });
    if (name === "legacy") legacyToken = token; else if (name === "blank") blankToken = token; else unmappedToken = token;
  }
  const store = await StoreModel.create({ store_name: "Reviewed store with legacy department metadata", status: "ACTIVE", kind: "outlet", scopeApprovalRef: "fixture-explicit-string-department" });
  stringEmployee = await EmployeeModel.create({ employeeCode: "SCOPE-STRING", fullName: "Legacy string department", departmentId: "DEPT_LEGACY", storeId: store._id, storeMappingRef: "fixture-review-not-name-inference", status: "active" });
  const row = await UserModel.create({ username: "scope-string", role: "Admin", employeeId: stringEmployee._id, passwordHash: "unused" });
  stringEmployee.userId = row._id; await stringEmployee.save();
  await UserModel.updateOne({ _id: row._id }, { $set: { authorization: { schemaVersion: 1, profile: "sm", grants: [testGrant("sm", { kind: "self" }, SELF_CAPS, row._id), testGrant("sm", { kind: "organization", storeIds: [String(store._id)] }, ["employees.read_operational"], row._id)] } } });
  stringDeptToken = await signAccessToken({ sub: String(row._id), role: "Admin" });
  await EmployeeModel.updateOne({ _id: fixture.actors.staff.employee._id }, { $set: { profileChangeRequests: [{ requestedBy: String(fixture.actors.staff.employee._id), requestedAt: new Date(), status: "PENDING", targetFields: { level: "Middle" }, previousSnapshot: { level: "Junior" } }] } });
  await EmployeeModel.updateOne({ _id: fixture.actors.staffB.employee._id }, { $set: { profileChangeRequests: [{ requestedBy: String(fixture.actors.staffB.employee._id), requestedAt: new Date(), status: "PENDING", targetFields: { level: "Middle" } }] } });
  const work = (extra) => ({ title: "Scope fixture", departmentId: fixture.departmentId, createdBy: fixture.actors.sm.user._id, status: "ASSIGNED", version: 1, ...extra });
  [projectA, projectB, ownProject] = await ProjectModel.create([
    work({ title: "Canonical A", storeId: fixture.stores[0]._id, storeMappingRef: "fixture-reviewed-project", assigneeId: String(fixture.actors.staff.employee._id) }),
    work({ title: "Canonical B", storeId: fixture.stores[1]._id, storeMappingRef: "fixture-reviewed-project", assigneeId: fixture.actors.staffB.employee._id }),
    work({ title: "Own manager assignment", storeId: fixture.stores[0]._id, storeMappingRef: "fixture-reviewed-project", assigneeId: fixture.actors.sm.employee._id }),
  ]);
  rawProject = await ProjectModel.collection.insertOne({ title: "Unmapped no-department legacy", createdBy: fixture.actors.sm.user._id, assigneeId: String(fixture.actors.sm.employee._id), status: "ASSIGNED", version: 1 });
  reviewableRaw = await ProjectModel.collection.insertOne({ title: "Unmapped pending-review legacy", createdBy: fixture.actors.sm.user._id, assigneeId: fixture.actors.staff.employee._id, status: "PENDING_REVIEW", version: 1 });
  rawReport = await ReportModel.create({ projectId: reviewableRaw.insertedId, submittedBy: fixture.actors.staff.employee._id, content: "Legacy unmapped report", status: "PENDING" });
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); base = "http://127.0.0.1:" + server.address().port + "/api";
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function request(actor, path, body) {
  const token = ({ legacy: legacyToken, unmapped: unmappedToken, blank: blankToken, string: stringDeptToken })[actor] ?? fixture.actors[actor]?.token;
  const res = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + token, Connection: "close", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}
test("ObjectId canonical store query returns actual scoped employees, not an empty type-mismatch result", async () => {
  const response = await request("sm", "/employees?limit=100"); assert.equal(response.status, 200);
  const result = PaginatedEmployeesResponseSchema.parse(response.body); assert.equal(result.paging.totalItems, 10);
  assert.ok(!result.items.some((row) => row.employeeId === String(fixture.actors.staffB.employee._id)));
});
test("department query is an intersection, never an authority selector", async () => {
  const response = await request("sm", "/employees?departmentId=" + new mongoose.Types.ObjectId());
  assert.equal(response.status, 200); assert.deepEqual(response.body.items, []);
  const sameDept = await request("sm", "/employees?departmentId=" + fixture.departmentId);
  assert.ok(!sameDept.body.items.some((row) => row.employeeId === String(fixture.actors.staffB.employee._id)));
});

test('recorded job title is consistent in the scoped list/detail without exposing personal fields', async () => {
  const response = await request('sm', '/employees?limit=100');
  const row = response.body.items.find((item) => item.employeeId === String(fixture.actors.staff.employee._id));
  assert.equal(row.jobTitle, 'CAFE - Nhân viên bán hàng');
  const detail = await request('sm', '/employees/' + row.employeeId);
  assert.equal(detail.status, 200); assert.equal(detail.body.jobTitle, row.jobTitle);
  for (const item of [row, detail.body]) for (const key of ['phone', 'hiredAt', 'bank_account_number', 'profileChangeRequests', 'authorization'])
    assert.equal(key in item, false, key);
  assert.equal((await request('string', '/employees')).body.items[0].jobTitle, null, 'missing title is never inferred from Junior or an SM account');
});

test('job-title filter is case-insensitive literal search with scoped pagination', async () => {
  const response = await request('sm', '/employees?jobTitle=' + encodeURIComponent('nhân viên') + '&limit=1');
  assert.equal(response.status, 200); assert.equal(response.body.paging.totalItems, 1);
  assert.equal(response.body.items[0].employeeId, String(fixture.actors.staff.employee._id));
  const literal = await request('sm', '/employees?jobTitle=' + encodeURIComponent('.*'));
  assert.equal(literal.status, 200); assert.equal(literal.body.paging.totalItems, 1);
  assert.equal(literal.body.items[0].employeeId, String(fixture.actors.om.employee._id));
});

test('title filter and foreign store ID never expand scope or confer access', async () => {
  for (const suffix of ['', '&storeId=' + fixture.stores[1]._id]) {
    const result = await request('sm', '/employees?jobTitle=OUTSIDE%20ONLY' + suffix);
    assert.equal(result.status, 200); assert.equal(result.body.paging.totalItems, 0); assert.deepEqual(result.body.items, []);
  }
  assert.equal((await request('staff', '/employees?jobTitle=SM')).status, 403);
  assert.equal((await request('sm', '/employees?jobTitle=' + 'x'.repeat(101))).status, 400);
  assert.equal((await request('sm', '/employees?jobTitle[]=SM')).status, 400);
});
test("only explicitly granted HR can read scoped pending profile queue", async () => {
  assert.equal((await request("sm", "/change-requests")).status, 403);
  const response = await request("hr", "/change-requests"); assert.equal(response.status, 200);
  assert.deepEqual(response.body.items.map((row) => row.employeeId), [String(fixture.actors.staff.employee._id)]);
});
test("managed projects use actual reporting edges and store IDs, not same-department membership", async () => {
  const response = await request("sm", "/projects?limit=100"); assert.equal(response.status, 200);
  const result = PaginatedProjectsResponseSchema.parse(response.body);
  assert.deepEqual(result.items.map((row) => row.id).sort(), [String(projectA._id), String(ownProject._id)].sort());
});
test("legacy string department metadata remains readable with explicit canonical store grant", async () => {
  const response = await request("string", "/employees"); assert.equal(response.status, 200);
  assert.deepEqual(response.body.items.map((row) => row.employeeId), [String(stringEmployee._id)]);
  assert.equal(response.body.items[0].department, "DEPT_LEGACY");
});
test("global Admin without V1 authorization cannot enumerate all employees", async () => {
  assert.equal((await request("legacy", "/employees")).status, 403);
});
test("staff sees only assigned canonical projects, not coworkers or missing-location records", async () => {
  const response = await request("staff", "/projects"); assert.equal(response.status, 200);
  assert.deepEqual(response.body.items.map((row) => row.id), [String(projectA._id)]);
});
test("unmapped Admin employee list is forbidden, not 500 or a global query", async () => { assert.equal((await request("unmapped", "/employees")).status, 403); });
test("blank department does not grant profile queue access", async () => { assert.equal((await request("blank", "/change-requests")).status, 403); });
test("blank department does not grant projects access", async () => { assert.equal((await request("blank", "/projects")).status, 403); });
test("unmapped Admin cannot list projects through empty scope", async () => { assert.equal((await request("unmapped", "/projects")).status, 403); });
test("staff cannot turn a fake department/global query into managed project read", async () => {
  const response = await request("staff", "/projects?departmentId=" + fixture.departmentId + "&isGlobalAdmin=true");
  assert.equal(response.status, 200); assert.deepEqual(response.body.items.map((row) => row.id), [String(projectA._id)]);
});
test("legacy global Admin cannot enumerate canonical or legacy projects", async () => { assert.equal((await request("legacy", "/projects")).status, 403); });
test("even the historical assignee cannot open an unmapped legacy project", async () => { assert.equal((await request("sm", "/projects/" + rawProject.insertedId)).status, 404); });
test("manager can open canonical subordinate work", async () => { assert.equal((await request("sm", "/projects/" + projectA._id)).status, 200); });
test("another store's employee gets 404 for project details despite same department", async () => { assert.equal((await request("staffB", "/projects/" + projectA._id)).status, 404); });
test("unrelated staff cannot discover an unassigned/other-person project", async () => { assert.equal((await request("staff", "/projects/" + ownProject._id)).status, 404); });
test("legacy global flag cannot read report on an unmapped project", async () => { assert.equal((await request("legacy", "/reports/" + rawReport._id)).status, 403); });
test("review on unmapped legacy project is refused without changing report/version", async () => {
  const response = await request("sm", "/reports/" + rawReport._id + "/review", { action: "REJECT", reason: "Must not bypass mapping", expectedVersion: 1 });
  assert.equal(response.status, 404);
  assert.equal((await ReportModel.findById(rawReport._id)).status, "PENDING");
  assert.equal((await ProjectModel.findById(reviewableRaw.insertedId)).version, 1);
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
