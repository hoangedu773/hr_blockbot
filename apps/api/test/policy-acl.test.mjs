// Phase A — ACL envelope gán cho `policies` phải đúng luật của AclSchema.
//
// Script `scripts/seed/11-policy-acl.py` suy tier từ metadata; test này chốt rằng
// envelope nó sinh ra (T1 = 9 profile, T2 = 8 profile không có system_admin,
// T3 = đúng 1 profile) là thứ `documentAllowed` chấp nhận — và envelope sai bị từ chối.
// Nếu ai sửa bảng tier mà quên invariant, test này đỏ trước khi lên Atlas.
import "./require-isolated-db.mjs";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectDB, disconnectDB } from "../dist/db.js";
import { documentAllowed } from "../dist/services/document-authorization.service.js";
import { resolvePrincipal } from "../dist/services/principal.service.js";
import { authorizationV1Fixture } from "./helpers/authorization-v1-fixture.mjs";

const ALL_PROFILES = ["system_admin", "hr", "om", "aom", "sam", "am", "sm", "ptch", "staff"];
const OPERATIONAL_PROFILES = ALL_PROFILES.filter((profile) => profile !== "system_admin");

function acl(overrides = {}) {
  return {
    reviewStatus: "APPROVED",
    approvalRef: "OWNER_POLICY_ACL_20261109",
    tier: "T1_GENERAL",
    classification: "operational",
    allowedProfiles: ALL_PROFILES,
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: null,
    revokedAt: null,
    scopeKind: "global",
    storeIds: [],
    ...overrides,
  };
}

describe("Phase A: policy ACL envelope", () => {
  let actors;

  before(async () => {
    await connectDB();
    const fixture = await authorizationV1Fixture();
    actors = fixture.actors;
    // `documentAllowed` kiểm `policies.read` trước khi đọc acl.
    for (const actor of ["staff", "hr", "system_admin", "sm"]) {
      await resolvePrincipal({
        sub: String(actors[actor].user._id),
        role: actors[actor].user.role,
        securityVersion: 0,
      });
    }
    const { UserModel } = await import("../dist/models/User.js");
    for (const actor of ["staff", "hr", "system_admin", "sm"]) {
      await UserModel.updateOne(
        { _id: actors[actor].user._id },
        { $push: { "authorization.grants.1.capabilities": "policies.read" } }
      );
    }
  });

  after(async () => { await disconnectDB(); });

  const principal = (actor) => resolvePrincipal({
    sub: String(actors[actor].user._id),
    role: actors[actor].user.role,
    securityVersion: 0,
  });

  test("T1_GENERAL cho profile nghiệp vụ đọc", async () => {
    for (const actor of ["staff", "hr", "sm"]) {
      assert.equal(documentAllowed(await principal(actor), { acl: acl() }), true, `${actor} phải đọc được T1`);
    }
  });

  // `policies.read` là capability scope `organization`, nên `hasCapability` đòi
  // `allowedStoreIds().length > 0`. Grant của system_admin là scope `system` với
  // storeIds rỗng, nên system_admin không bao giờ qua được — kể cả khi AclSchema bắt
  // T1_GENERAL phải liệt kê đủ 9 profile. Đây là hành vi hiện tại của policy, không
  // phải điều test này được phép sửa; nếu chủ dự án muốn admin kỹ thuật đọc được
  // policy thì phải đổi AUTHORIZATION_POLICY, không phải đổi ACL.
  test("system_admin không đọc được policies dù acl hợp lệ (system scope không có store)", async () => {
    assert.equal(documentAllowed(await principal("system_admin"), { acl: acl() }), false);
  });

  test("T1_GENERAL thiếu một profile là envelope sai, bị từ chối toàn bộ", async () => {
    const user = await principal("staff");
    const broken = acl({ allowedProfiles: OPERATIONAL_PROFILES });
    assert.equal(documentAllowed(user, { acl: broken }), false);
  });

  test("T2_OPERATIONAL cho staff nhưng envelope chứa system_admin thì sai", async () => {
    const user = await principal("staff");
    assert.equal(documentAllowed(user, { acl: acl({ tier: "T2_OPERATIONAL", allowedProfiles: OPERATIONAL_PROFILES }) }), true);
    assert.equal(documentAllowed(user, { acl: acl({ tier: "T2_OPERATIONAL", allowedProfiles: ALL_PROFILES }) }), false);
  });

  test("T3_HR_SENSITIVE chỉ hr đọc được", async () => {
    const hrAcl = acl({ tier: "T3_HR_SENSITIVE", allowedProfiles: ["hr"] });
    assert.equal(documentAllowed(await principal("hr"), { acl: hrAcl }), true);
    assert.equal(documentAllowed(await principal("staff"), { acl: hrAcl }), false);
    assert.equal(documentAllowed(await principal("system_admin"), { acl: hrAcl }), false);
  });

  test("T3_HR_SENSITIVE với profile khác hr là envelope sai", async () => {
    const user = await principal("hr");
    assert.equal(documentAllowed(user, { acl: acl({ tier: "T3_HR_SENSITIVE", allowedProfiles: ["hr", "am"] }) }), false);
  });

  test("T3_TECHNICAL envelope: chỉ system_admin hợp lệ, classification phải technical", async () => {
    // Envelope đúng vẫn không đọc được vì system_admin thiếu store scope cho
    // `policies.read` (xem test phía trên). Test này chốt phần envelope: sai
    // classification hoặc sai profile thì cũng bị từ chối như nhau.
    const technical = acl({ tier: "T3_TECHNICAL", classification: "technical", allowedProfiles: ["system_admin"] });
    assert.equal(documentAllowed(await principal("system_admin"), { acl: technical }), false);
    assert.equal(documentAllowed(await principal("hr"), { acl: technical }), false);
    const wrongClassification = acl({ tier: "T3_TECHNICAL", classification: "operational", allowedProfiles: ["system_admin"] });
    assert.equal(documentAllowed(await principal("system_admin"), { acl: wrongClassification }), false);
    const wrongProfile = acl({ tier: "T3_TECHNICAL", classification: "technical", allowedProfiles: ["hr"] });
    assert.equal(documentAllowed(await principal("hr"), { acl: wrongProfile }), false);
  });

  test("document không có acl bị từ chối — đây là trạng thái hiện tại của corpus", async () => {
    const user = await principal("staff");
    assert.equal(documentAllowed(user, { title: "Chưa gán ACL" }), false);
  });

  test("acl hết hạn, bị thu hồi, hoặc ngày sai đều bị từ chối", async () => {
    const user = await principal("staff");
    const expired = acl({ validFrom: new Date(Date.now() - 120_000).toISOString(), validUntil: new Date(Date.now() - 60_000).toISOString() });
    assert.equal(documentAllowed(user, { acl: expired }), false);
    assert.equal(documentAllowed(user, { acl: acl({ revokedAt: new Date().toISOString() }) }), false);
    assert.equal(documentAllowed(user, { acl: acl({ validUntil: "not-a-date" }) }), false);
  });

  test("scopeKind stores phải có storeIds; global không được có storeIds", async () => {
    const user = await principal("staff");
    assert.equal(documentAllowed(user, { acl: acl({ scopeKind: "stores", storeIds: [] }) }), false);
    assert.equal(documentAllowed(user, { acl: acl({ scopeKind: "global", storeIds: ["a".repeat(24)] }) }), false);
  });

  test("user thiếu capability policies.read không đọc được dù acl hợp lệ", async () => {
    // system_admin fixture chỉ có authorization.inspect_self + capabilities kỹ thuật, không có policies.read.
    const admin = await resolvePrincipal({
      sub: String(actors.system_admin.user._id),
      role: actors.system_admin.user.role,
      securityVersion: 0,
    });
    const withoutRead = { ...admin, authorization: { ...admin.authorization, grants: admin.authorization.grants.map((grant) => ({ ...grant, capabilities: grant.capabilities.filter((capability) => capability !== "policies.read") })) } };
    assert.equal(documentAllowed(withoutRead, { acl: acl() }), false);
  });
});
