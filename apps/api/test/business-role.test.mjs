// Business-role derivation from job_title (P1-7 follow-up, business roles).
//
// Run after `npm run build` (imports the compiled model, like other dist-based
// assertions in this suite): `node --test test/business-role.test.mjs`.
// The expectations mirror the real `job_title` distribution in Atlas.

import assert from "node:assert/strict";
import test from "node:test";

import { deriveBusinessRole } from "../dist/models/Employee.js";

test("chức danh quản lý được nhận đúng cấp", () => {
  assert.equal(deriveBusinessRole("SM"), "sm");
  assert.equal(deriveBusinessRole("SM (Cửa hàng trưởng)"), "sm");
  assert.equal(deriveBusinessRole("AOM"), "aom");
  assert.equal(deriveBusinessRole("AM"), "am");
  assert.equal(deriveBusinessRole("Phụ trách cửa hàng"), "ptch");
});

test("nhân viên và các bộ phận khác là staff", () => {
  assert.equal(deriveBusinessRole("CAFE - Nhân viên bán hàng"), "staff");
  assert.equal(deriveBusinessRole("BÁNH MÌ - Nhân viên bán hàng"), "staff");
  assert.equal(deriveBusinessRole("BẾP - Bếp nấu"), "staff");
  assert.equal(deriveBusinessRole("Bảo vệ"), "staff");
  assert.equal(deriveBusinessRole("Giao hàng"), "staff");
  assert.equal(deriveBusinessRole(null), "staff");
  // "Phụ trách dự án mới" is an office project role, not a store manager tier.
  assert.equal(deriveBusinessRole("Phụ trách dự án mới"), "staff");
});

test("Admin auth role và văn phòng OD/OM là admin", () => {
  assert.equal(deriveBusinessRole(null, "Admin"), "admin");
  assert.equal(deriveBusinessRole("OD"), "admin");
  assert.equal(deriveBusinessRole("OM"), "admin");
});

test("không nhầm AM/SM là chuỗi con của chức danh khác", () => {
  // 'AM' must not match inside unrelated titles; guard against substring bugs.
  assert.equal(deriveBusinessRole("BẾP - Bếp chính"), "staff");
  assert.equal(deriveBusinessRole("Giao hàng"), "staff");
});
