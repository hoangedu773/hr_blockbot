import "./require-isolated-db.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { RefreshSessionModel } from "../dist/models/RefreshSession.js";
import { signAccessToken } from "../dist/services/auth.service.js";
import { authorizationV1Fixture } from "./helpers/authorization-v1-fixture.mjs";

// V1 replaces the old role/global CRUD policy. Retired direct-create, role-upgrade,
// password-return and destructive-delete paths must remain explicitly tested as
// denied, not re-enabled to preserve obsolete positive expectations.
let fixture, server, base, legacyToken;
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  const legacy = await UserModel.create({ username: "legacy-global-admin", passwordHash: "unused", role: "Admin", isGlobalAdmin: true });
  legacyToken = await signAccessToken({ sub: String(legacy._id), role: "Admin" });
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port + "/api";
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function request(actor, method, path, body) {
  const token = actor === "legacy" ? legacyToken : fixture.actors[actor]?.token;
  const response = await fetch(base + path, { method, headers: { Connection: "close", ...(token ? { Authorization: "Bearer " + token } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
const target = () => String(fixture.actors.staff.user._id);
test("missing token is 401", async () => { assert.equal((await request("", "GET", "/admin/users")).status, 401); });
test("staff, HR and operational managers cannot administer technical accounts", async () => {
  for (const actor of ["staff", "hr", "om", "sm"]) for (const [method, path, body] of [
    ["GET", "/admin/users"], ["POST", "/admin/users", { username: "forbidden", role: "Admin", isGlobalAdmin: true }],
    ["PATCH", "/admin/users/" + target(), { role: "Admin" }], ["DELETE", "/admin/users/" + target()]
  ]) assert.equal((await request(actor, method, path, body)).status, 403, actor + " " + method);
});
test("legacy global flag without an approved technical grant is denied", async () => {
  const result = await request("legacy", "GET", "/admin/users"); assert.equal(result.status, 403); assert.equal(result.body.error.code, "RBAC_DENIED");
});
test("technical account list is metadata only, no employee names/contact/bank/password", async () => {
  const result = await request("system_admin", "GET", "/admin/users?limit=50"); assert.equal(result.status, 200); assert.ok(result.body.items.length >= 12);
  const linked = result.body.items.find((row) => row.id === target());
  assert.equal(linked.employeeName, null); assert.equal(linked.profile, "staff"); assert.equal(linked.isGlobalAdmin, false);
  assert.doesNotMatch(JSON.stringify(result.body), /passwordHash|fixture-contact|NEVER_SEND_BANK|Isolated V1/);
});
test("technical search uses login code, not protected HR names", async () => {
  const byCode = await request("system_admin", "GET", "/admin/users?q=v1-staff");
  assert.equal(byCode.status, 200); assert.ok(byCode.body.items.every((row) => row.username.includes("v1-staff")));
  const byName = await request("system_admin", "GET", "/admin/users?q=" + encodeURIComponent("Isolated V1"));
  assert.equal(byName.status, 200); assert.deepEqual(byName.body.items, []);
});
test("direct active staff creation is retired; canonical user/employee links cannot change", async () => {
  const beforeUser = await UserModel.countDocuments(), beforeEmployee = await EmployeeModel.countDocuments();
  const result = await request("system_admin", "POST", "/admin/users", { username: "direct-staff", role: "Employee", employeeId: String(fixture.actors.staff.employee._id) });
  assert.equal(result.status, 409); assert.equal(result.body.error.code, "ONBOARDING_WORKFLOW_REQUIRED");
  assert.equal(await UserModel.countDocuments(), beforeUser); assert.equal(await EmployeeModel.countDocuments(), beforeEmployee);
  assert.equal(String((await EmployeeModel.findById(fixture.actors.staff.employee._id)).userId), target());
  assert.doesNotMatch(JSON.stringify(result.body), /temporaryPassword|passwordHash/);
});
test("duplicate username cannot bypass onboarding with a direct-create retry", async () => {
  const result = await request("system_admin", "POST", "/admin/users", { username: fixture.actors.staff.user.username, role: "Employee" });
  assert.equal(result.status, 409); assert.equal(await UserModel.countDocuments({ username: fixture.actors.staff.user.username }), 1);
});
test("direct creation cannot assign legacy businessRole admin", async () => {
  assert.equal((await request("system_admin", "POST", "/admin/users", { username: "invalid-admin", role: "Employee", businessRole: "admin" })).status, 409);
  assert.equal(await UserModel.countDocuments({ username: "invalid-admin" }), 0);
});
test("legacy role demotion cannot mutate profile/grants or revoke unrelated sessions", async () => {
  const result = await request("system_admin", "PATCH", "/admin/users/" + String(fixture.actors.hr.user._id), { role: "Employee" });
  assert.equal(result.status, 400);
  const row = await UserModel.findById(fixture.actors.hr.user._id); assert.equal(row.authorization.profile, "hr"); assert.equal(row.securityVersion, 0);
});
test("legacy role elevation and employee relinking are rejected rather than deriving authority", async () => {
  for (const body of [{ role: "Admin" }, { isGlobalAdmin: true }, { employeeId: String(fixture.actors.hr.employee._id) }, { businessRole: "admin" }])
    assert.equal((await request("system_admin", "PATCH", "/admin/users/" + target(), body)).status, 400);
  assert.equal((await UserModel.findById(target())).authorization.profile, "staff");
});
test("cannot disable self through lowercase or uppercase ObjectId", async () => {
  for (const id of [String(fixture.actors.system_admin.user._id), String(fixture.actors.system_admin.user._id).toUpperCase()])
    assert.equal((await request("system_admin", "PATCH", "/admin/users/" + id, { status: "disabled", reason: "Self modification must fail", expectedVersion: 0 })).status, 403);
  assert.equal((await UserModel.findById(fixture.actors.system_admin.user._id)).status, "active");
});
test("password reset without configured secure delivery returns no plaintext and preserves existing credentials", async () => {
  const before = await UserModel.findById(target()).lean();
  const result = await request("system_admin", "POST", "/admin/users/" + target() + "/reset-password", {});
  assert.equal(result.status, 503); assert.equal(result.body.error.code, "SECURE_RECOVERY_DELIVERY_REQUIRED");
  assert.doesNotMatch(JSON.stringify(result.body), /temporaryPassword|passwordHash/);
  const after = await UserModel.findById(target()).lean(); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.securityVersion, before.securityVersion);
});
test("delete is retired and never silently removes canonical user/employee history", async () => {
  assert.equal((await request("system_admin", "DELETE", "/admin/users/" + target())).status, 405);
  assert.ok(await UserModel.findById(target())); assert.equal(String((await EmployeeModel.findById(fixture.actors.staff.employee._id)).userId), target());
});
test("retired delete does not disclose whether a target exists", async () => {
  assert.equal((await request("system_admin", "DELETE", "/admin/users/000000000000000000000000")).status, 405);
});
test("audited disable revokes old access/refresh; controlled unlock does not restore old tokens", async () => {
  const login = await request("", "POST", "/auth/login", { username: fixture.actors.staff.user.username, password: fixture.password });
  assert.equal(login.status, 200);
  const disabled = await request("system_admin", "PATCH", "/admin/users/" + target(), { status: "disabled", reason: "Owned fixture security check", expectedVersion: 0 });
  assert.equal(disabled.status, 200); assert.equal(disabled.body.securityVersion, 1);
  assert.equal((await request("staff", "GET", "/auth/me")).status, 401);
  assert.equal(await RefreshSessionModel.countDocuments({ userId: target(), revokedAt: null }), 0);
  const stale = await request("system_admin", "PATCH", "/admin/users/" + target(), { status: "active", reason: "Stale update", expectedVersion: 0 });
  assert.equal(stale.status, 409);
  const active = await request("system_admin", "PATCH", "/admin/users/" + target(), { status: "active", reason: "Controlled unlock", expectedVersion: 1 });
  assert.equal(active.status, 200); assert.equal(active.body.securityVersion, 2);
  assert.equal((await request("staff", "GET", "/auth/me")).status, 401);
  const stored = await UserModel.findById(target()); assert.equal(stored.securityAudit.length, 2); assert.equal(stored.securityAudit[1].previousHash, stored.securityAudit[0].hash);
});
