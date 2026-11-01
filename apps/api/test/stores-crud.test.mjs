import "./require-isolated-db.mjs";
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createServer } from "node:http";
import { createApp } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { StoreModel, classifyStoreKind, storeKindExpression } from "../dist/models/Store.js";
import { EmployeeModel } from "../dist/models/Employee.js";
import { signAccessToken } from "../dist/services/auth.service.js";
import { StoreListResponseSchema } from "@hr-blockbot/contracts";
import { authorizationV1Fixture, testGrant } from "./helpers/authorization-v1-fixture.mjs";

// Store configuration has NOT been approved in V1. The retired global-Admin
// rename/cascade/delete success expectations are replaced with real API denial +
// unchanged-data assertions, including concurrent requests and existing leases.
// This suite does not claim to validate a future approved store mutation workflow.
let fixture, server, base, legacyToken, snapshot, extraStore;
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  const root = await UserModel.create({ username: "legacy-store-root", role: "Admin", isGlobalAdmin: true, passwordHash: "unused" });
  legacyToken = await signAccessToken({ sub: String(root._id), role: "Admin" });
  await UserModel.updateOne({ _id: fixture.actors.om.user._id }, { $push: { "authorization.grants.1.scope.storeIds": String(fixture.stores[1]._id) } });
  await StoreModel.updateOne({ _id: fixture.stores[0]._id }, { $set: { district: "A", employee_count: 999, manager_employee_id: fixture.actors.staff.employee._id } });
  await StoreModel.updateOne({ _id: fixture.stores[1]._id }, { $set: { district: "B" } });
  extraStore = await StoreModel.collection.insertOne({ store_name: "GUTA CAFE - Unreviewed legacy", employee_count: 900 });
  snapshot = await sourceSnapshot();
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port + "/api";
});
async function sourceSnapshot() {
  return JSON.stringify({ stores: await StoreModel.collection.find({}).sort({ _id: 1 }).toArray(), employees: await EmployeeModel.collection.find({}).sort({ _id: 1 }).toArray() });
}
afterEach(async () => { assert.equal(await sourceSnapshot(), snapshot, "Read/denied mutation must not rewrite legacy data, mapping, counts, leases or personnel"); });
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, method = "GET", suffix = "", body) {
  const token = actor === "legacy" ? legacyToken : fixture.actors[actor]?.token;
  const response = await fetch(base + "/stores" + suffix, { method, headers: { Connection: "close", ...(token ? { Authorization: "Bearer " + token } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
const storeA = () => String(fixture.stores[0]._id), storeB = () => String(fixture.stores[1]._id);
test("unauthenticated store access is 401", async () => { assert.equal((await call("")).status, 401); });
test("staff has minimal directory, not operational store aggregates", async () => { assert.equal((await call("staff")).status, 403); });
test("legacy global Admin has no stores.read authority", async () => { assert.equal((await call("legacy")).status, 403); });
test("explicit SM store grant isolates two stores in the SAME department", async () => {
  const response = await call("sm", "GET", "?limit=100"); assert.equal(response.status, 200);
  const result = StoreListResponseSchema.parse(response.body);
  assert.deepEqual(result.items.map((row) => row.id), [storeA()]); assert.equal(result.paging.totalItems, 1);
  assert.equal((await call("sm", "GET", "/" + storeB())).status, 403);
});
test("filters cannot expand store scope", async () => {
  for (const suffix of ["?district=B", "?q=" + encodeURIComponent("store B"), "?kind=group", "?status=INACTIVE"]) {
    const result = await call("sm", "GET", suffix); assert.equal(result.status, 200); assert.deepEqual(result.body.items, []);
  }
});
test("explicit multi-store OM reads only verified canonical outlets; ETL totals/title do not grant", async () => {
  const result = await call("om", "GET", "?limit=100"); assert.equal(result.status, 200);
  assert.deepEqual(result.body.items.map((row) => row.id).sort(), [storeA(), storeB()].sort());
  const own = result.body.items.find((row) => row.id === storeA());
  assert.equal(own.employeeCount, 10); assert.equal(own.activeEmployeeCount, 10);
  // Approved CRM UX05: show ALL active approved graph parents, never infer a
  // primary manager from a title. The fixture explicitly maps these four.
  assert.deepEqual(own.managers.map((row) => row.employeeId).sort(), ['om', 'sam', 'am', 'sm'].map((actor) => String(fixture.actors[actor].employee._id)).sort());
  assert.equal(own.managerEmployeeId, null, 'multiple managers do not invent a primary');
  assert.deepEqual(result.body.summary, { totalOutlets: 2, totalGroups: 0 });
});
test("technical admin cannot read operational store counts", async () => { assert.equal((await call("system_admin")).status, 403); });
test("unreviewed legacy store is not exposed by a similar name or a global flag", async () => {
  assert.equal((await call("om", "GET", "/" + extraStore.insertedId)).status, 403);
});
test("store creation is PENDING for all nine profiles, including technical admin", async () => {
  for (const actor of ["system_admin", "hr", "om", "aom", "sam", "am", "sm", "ptch", "staff", "legacy"])
    assert.equal((await call(actor, "POST", "", { name: "Must not create", kind: "outlet" })).status, 403, actor);
});
test("duplicate-name create cannot reach storage while policy is pending", async () => {
  assert.equal((await call("system_admin", "POST", "", { name: fixture.stores[0].store_name })).status, 403);
});
test("malformed create cannot bypass pending configuration policy", async () => {
  for (const body of [{ name: " " }, { name: "Injected", isGlobalAdmin: true }, { name: "Injected", scopeApprovalRef: "body-must-not-authorize" }])
    assert.equal((await call("system_admin", "POST", "", body)).status, 403);
});
test("rename cannot cascade raw personnel fields in either own or foreign store", async () => {
  for (const id of [storeA(), storeB()]) assert.equal((await call("sm", "PATCH", "/" + id, { name: "Unapproved rename" })).status, 403);
});
test("other store metadata mutations remain denied, not just renames", async () => {
  assert.equal((await call("system_admin", "PATCH", "/" + storeA(), { district: "Injected", status: "INACTIVE", code: "X" })).status, 403);
});
test("delete is denied with and without employees, no silent soft deletion", async () => {
  for (const id of [storeA(), String(extraStore.insertedId)]) assert.equal((await call("system_admin", "DELETE", "/" + id)).status, 403);
});
test("department equality and legacy title SM do not substitute for explicit scope", async () => {
  assert.equal(String(fixture.stores[0].departmentId), String(fixture.stores[1].departmentId));
  assert.equal((await call("am", "GET", "/" + storeB())).status, 403);
});
test("malformed write IDs and payloads cannot bypass policy", async () => {
  for (const suffix of ["/not-an-id", "/" + storeA()]) assert.equal((await call("system_admin", "PATCH", suffix, {})).status, 403);
});
test("concurrent rename/delete requests are all denied and leave no orphaned personnel", async () => {
  const replies = await Promise.all(Array.from({ length: 20 }, (_, i) => call(i % 2 ? "system_admin" : "om", i % 3 ? "PATCH" : "DELETE", "/" + storeA(), i % 3 ? { name: "Unapproved concurrent " + i } : undefined)));
  assert.ok(replies.every((reply) => reply.status === 403));
  assert.equal(await EmployeeModel.countDocuments({ storeId: fixture.stores[0]._id }), 10);
});
test("existing or expired rename lease never grants configuration capability", async () => {
  // Pure policy check plus API denial: this does not exercise dormant lease writes.
  assert.equal((await call("system_admin", "PATCH", "/" + storeA(), { name: fixture.stores[0].store_name })).status, 403);
});
test("paginated counts and summary stay scoped, even on an empty page", async () => {
  const result = await call("sm", "GET", "?page=2&limit=1"); assert.equal(result.status, 200);
  assert.deepEqual(result.body.items, []); assert.equal(result.body.paging.totalItems, 1); assert.equal(result.body.summary.totalOutlets, 1);
});
test("display-only legacy kind classifier still matches its aggregation expression", async () => {
  const inputs = [{ store_name: "GUTA CAFE - test kind" }, { store_name: "Group test kind" }, { store_name: "BẾP test kind" }];
  // Isolated expression evaluation, no manufacturing canonical authorization.
  const rows = await mongoose.connection.collection("stores").aggregate([{ $limit: 1 }, { $project: { values: { $literal: inputs } } }, { $unwind: "$values" }, { $replaceRoot: { newRoot: "$values" } }, { $project: { store_name: 1, kind: storeKindExpression() } }]).toArray();
  for (const row of rows) assert.equal(row.kind, classifyStoreKind(row.store_name, undefined));
});
test("same-name imported outlet cannot be read or counted through another canonical ID", async () => {
  // This suite owns the throwaway server. Temporarily reproduce a pre-unique-index
  // legacy import; restore the index after removing ONLY the synthetic records.
  const duplicateId = new mongoose.Types.ObjectId(), personId = new mongoose.Types.ObjectId();
  await StoreModel.collection.dropIndex('store_name_1');
  try {
    await StoreModel.collection.insertOne({ _id: duplicateId, store_name: fixture.stores[0].store_name, kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'imported-duplicate-proof', departmentId: fixture.departmentId });
    await EmployeeModel.collection.insertOne({ _id: personId, fullName: 'Foreign duplicate fixture', storeId: duplicateId, storeMappingRef: 'imported-explicit-duplicate', status: 'active' });
    assert.equal((await call("sm", "GET", "/" + duplicateId)).status, 403);
    const result = await call("sm"); assert.equal(result.body.items[0].employeeCount, 10);
  } finally {
    await EmployeeModel.collection.deleteOne({ _id: personId });
    await StoreModel.collection.deleteOne({ _id: duplicateId });
    await StoreModel.collection.createIndex({ store_name: 1 }, { name: 'store_name_1', unique: true });
  }
});
