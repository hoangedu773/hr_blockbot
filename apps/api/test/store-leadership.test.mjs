import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupStoreManagers, summarizeStoreLeadership } from '../dist/services/store-leadership.service.js';

const person = (id, title, extra = {}) => ({ _id: id, fullName: id, job_title: title, storeId: 'A',
  hrmProfileMappingV1: { identityMappingVerified: true, sourceTitleVerified: true, sourceJobTitle: title }, ...extra });
const edge = (id, extra = {}) => ({ managerEmployeeId: id, storeId: 'A', validUntil: null, ...extra });
const summary = (people, relations) => summarizeStoreLeadership(groupStoreManagers(people, relations).get('A') ?? []);

test('AM and sole home-store SM stay distinct without changing the graph', () => {
  const people = [person('Nhi', 'SM'), person('Hang', 'AM')], relations = [edge('Hang'), edge('Nhi'), edge('Nhi')];
  const before = JSON.stringify({ people, relations }), result = summary(people, relations);
  assert.equal(result.managerName, 'Nhi'); assert.equal(result.managerEmployeeId, 'Nhi');
  assert.equal(result.storeManagerStatus, 'identified'); assert.equal(result.managers.length, 2);
  assert.equal(result.managers.find((m) => m.employeeId === 'Hang').role, 'am');
  assert.equal(JSON.stringify({ people, relations }), before);
});
test('two home-store SMs preserve both names without inventing a primary', () => {
  const result = summary([person('one', 'SM'), person('two', 'SM')], [edge('one'), edge('two')]);
  assert.equal(result.storeManagerStatus, 'ambiguous'); assert.equal(result.managerName, null);
  assert.equal(result.managerEmployeeId, null); assert.equal(result.managers.length, 2);
});
test('unverified title, proposed profile, grade and account role cannot name a store manager', () => {
  for (const metadata of [undefined, { sourceTitleVerified: false, identityMappingVerified: true, sourceJobTitle: 'SM' },
    { sourceTitleVerified: true, identityMappingVerified: false, sourceJobTitle: 'SM' }]) {
    const result = summary([person('unknown', 'SM', { hrmProfileMappingV1: metadata, job_title: 'SM',
      gutaGrade: 'SM3', authorization: { profile: 'sm' } })], [edge('unknown')]);
    assert.equal(result.storeManagerStatus, 'unconfirmed'); assert.equal(result.managers[0].role, 'unknown');
  }
});
test('cover is explicit, separate from home-store SM, and keeps relation expiry', () => {
  const until = new Date('2027-11-02T08:00:00Z');
  const result = summary([person('cover', 'SM', { storeId: 'B', storeIds: ['A'], smCoverRef: 'approved-cover' })], [edge('cover', { validUntil: until })]);
  assert.equal(result.storeManagerStatus, 'unconfirmed'); assert.equal(result.managers[0].assignmentKind, 'cover');
  assert.equal(result.managers[0].relationValidUntil, until.toISOString());
  assert.equal(summary([person('unconfirmed', 'SM', { storeId: 'B', storeIds: ['A'] })], [edge('unconfirmed')]).managers[0].assignmentKind, 'unclassified');
});
test('changed or malformed title verification is shown as unknown', () => {
  for (const extra of [{ job_title: 'AM' }, { hrmProfileMappingV1: { identityMappingVerified: 'true', sourceTitleVerified: true, sourceJobTitle: 'SM' } },
    { hrmProfileMappingV1: { identityMappingVerified: true, sourceTitleVerified: true, sourceJobTitle: 123 } }]) {
    assert.equal(summary([person('person', 'SM', extra)], [edge('person')]).managers[0].role, 'unknown');
  }
});
test('manager with no eligible approved relation is absent; shared graph edges are deduplicated', () => {
  assert.equal(groupStoreManagers([person('not-related', 'SM')], []).size, 0);
  assert.equal(summary([], [edge('inactive-or-unmapped')]).managers.length, 0);
  const result = summary([person('manager', 'SM')], [edge('manager', { validUntil: new Date('2027-01-01T00:00:00Z') }), edge('manager')]);
  assert.equal(result.managers.length, 1); assert.equal(result.managers[0].relationValidUntil, null);
});
