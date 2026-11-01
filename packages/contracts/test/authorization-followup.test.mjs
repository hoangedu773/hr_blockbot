import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PasswordRecoveryIssueSchema, OnboardingResubmitSchema, ActivationRequestSchema, PaginationQuerySchema, AuthorizationProfileSchema } from '../dist/index.js';
test('recovery issue requires a CAS version/reason and rejects supplied credentials or authority', () => {
  assert.equal(PasswordRecoveryIssueSchema.parse({ expectedVersion: 2, reason: ' Verified ' }).reason, 'Verified');
  for (const input of [{}, { expectedVersion: -1, reason: 'x' }, { expectedVersion: 1, reason: ' ' }, { expectedVersion: 1, reason: 'x', token: 'secret' }, { expectedVersion: 1, reason: 'x', password: 'secret' }, { expectedVersion: 1, reason: 'x', role: 'Admin' }]) assert.equal(PasswordRecoveryIssueSchema.safeParse(input).success, false);
});
test('resubmission changes only ordinary proposal fields, never identity/store/profile or audit', () => {
  const input = { expectedVersion: 2, fullName: 'Corrected', phone: 'synthetic', hiredAt: '2026-10-31T00:00:00Z', reason: 'Verified correction' };
  assert.equal(OnboardingResubmitSchema.safeParse(input).success, true);
  for (const extra of [{ employeeCode: 'different' }, { storeId: 'a'.repeat(24) }, { userId: 'a'.repeat(24) }, { profile: 'om' }, { history: [] }, { approvedBy: 'a'.repeat(24) }]) assert.equal(OnboardingResubmitSchema.safeParse({ ...input, ...extra }).success, false);
});
test('token/password and bounded pagination boundaries remain strict without changing nine profiles', () => {
  assert.equal(ActivationRequestSchema.safeParse({ token: 'a'.repeat(64), newPassword: 'PrivatePassword@2026' }).success, true);
  assert.equal(ActivationRequestSchema.safeParse({ token: 'a'.repeat(63), newPassword: 'short' }).success, false);
  assert.equal(PaginationQuerySchema.safeParse({ page: 0, limit: 101 }).success, false);
  assert.equal(PaginationQuerySchema.parse({ page: '12', limit: '20' }).page, 12);
  assert.deepEqual(AuthorizationProfileSchema.options, ['system_admin', 'hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff']);
});
