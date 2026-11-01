import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { UserModel } from '../../dist/models/User.js';
import { EmployeeModel } from '../../dist/models/Employee.js';
import { StoreModel } from '../../dist/models/Store.js';
import { AuthorizationRegionModel, ManagementRelationModel } from '../../dist/models/AuthorizationMapping.js';
import { OnboardingRequestModel } from '../../dist/models/OnboardingRequest.js';
import { hashPassword, signAccessToken } from '../../dist/services/auth.service.js';

export const SELF_CAPS = ['authorization.inspect_self', 'profile.read_self', 'profile.update_self_basic', 'profile.request_self', 'projects.read_assigned', 'assignment.respond', 'assignment.handover', 'assignment.discuss', 'projects.execute', 'reports.submit', 'assignment.audit_read', 'chatbot.data_read'];
export const MANAGEMENT_CAPS = ['stores.read', 'employees.read_operational', 'directory.read_store', 'dashboard.read', 'projects.create', 'projects.assign', 'projects.read_managed', 'assignment.review', 'assignment.escalation_review', 'reports.review', 'employees.transfer_confirm', 'delegations.request'];
export function testGrant(profile, scope, capabilities, grantedBy, extra = {}) {
  return { id: randomUUID(), profile, scope: { storeIds: [], regionIds: [], reportingEmployeeIds: [], ...scope }, capabilities,
    grantedBy: String(grantedBy), grantedAt: new Date().toISOString(), approvalRef: 'isolated-reviewed-fixture', validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: null, revokedAt: null, ...extra };
}
export async function authorizationV1Fixture() {
  await Promise.all([UserModel.init(), EmployeeModel.init(), StoreModel.init(), AuthorizationRegionModel.init(), ManagementRelationModel.init(), OnboardingRequestModel.init()]);
  const departmentId = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('departments').insertOne({ _id: departmentId, code: 'V1-SAME-DEPARTMENT', name: 'Isolated authorization fixture' });
  const regions = await AuthorizationRegionModel.create([{ code: 'REGION-A', name: 'Fixture A', status: 'ACTIVE', approvalRef: 'fixture-region-a', version: 1 }, { code: 'REGION-B', name: 'Fixture B', status: 'ACTIVE', approvalRef: 'fixture-region-b', version: 1 }]);
  const stores = await StoreModel.create(regions.map((region, i) => ({ store_name: `AUTHZ V1 store ${i ? 'B' : 'A'}`, kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'fixture-store-proof', regionId: region._id, regionApprovalRef: 'fixture-region-proof', departmentId })));
  const password = 'OnlyIsolatedFixture@2026', passwordHash = await hashPassword(password), actors = {};
  for (const profile of ['system_admin', 'hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff', 'staffB', 'hr2']) {
    const canonicalProfile = profile === 'staffB' ? 'staff' : profile === 'hr2' ? 'hr' : profile;
    const store = profile === 'staffB' ? stores[1] : stores[0];
    const employee = await EmployeeModel.create({ employeeCode: `V1-${profile}`, fullName: `Isolated V1 ${profile}`, departmentId, storeId: store._id, storeMappingRef: 'fixture-personnel-mapping', status: 'active', level: 'Junior', phone: 'fixture-contact', bank_account_number: 'NEVER_SEND_BANK' });
    const id = new mongoose.Types.ObjectId(), grants = [testGrant(canonicalProfile, { kind: 'self' }, canonicalProfile === 'system_admin' ? ['authorization.inspect_self'] : SELF_CAPS, id)];
    const organization = { kind: 'organization', storeIds: [String(store._id)] };
    let capabilities = canonicalProfile === 'staff' ? ['directory.read_store'] : ['stores.read', 'directory.read_store'];
    if (['om', 'sam', 'am', 'sm'].includes(canonicalProfile)) capabilities = [...MANAGEMENT_CAPS, ...(canonicalProfile === 'sm' ? ['onboarding.propose'] : ['delegations.review'])];
    if (canonicalProfile === 'hr') capabilities = ['stores.read', 'directory.read_store', 'employees.read_operational', 'employees.read_hr', 'employees.update_other', 'employees.review', 'employees.create', 'onboarding.draft', 'onboarding.review', 'employees.lifecycle_request', 'employees.lifecycle_review', 'employees.transfer', 'dashboard.read'];
    if (canonicalProfile === 'system_admin') grants.push(testGrant(canonicalProfile, { kind: 'system' }, ['accounts.manage', 'grants.configure', 'grants.revoke', 'provider_settings.manage', 'security_audit.read'], id));
    else grants.push(testGrant(canonicalProfile, organization, capabilities, id));
    const user = await UserModel.create({ _id: id, username: `v1-${profile}`.toLowerCase(), passwordHash, role: canonicalProfile === 'system_admin' ? 'Admin' : 'Employee', isGlobalAdmin: false, employeeId: employee._id,
      authorization: { schemaVersion: 1, profile: canonicalProfile, grants } });
    employee.userId = user._id; await employee.save();
    actors[profile] = { user, employee, token: await signAccessToken({ sub: String(user._id), role: user.role, securityVersion: 0 }) };
  }
  for (const [parent, child] of [['om', 'sam'], ['sam', 'am'], ['am', 'sm'], ['sm', 'staff'], ['sm', 'ptch'], ['om', 'aom']]) {
    await ManagementRelationModel.create({ managerEmployeeId: actors[parent].employee._id, employeeId: actors[child].employee._id, storeId: stores[0]._id,
      approvalRef: 'fixture-reporting-proof', validFrom: new Date(Date.now() - 60000), validUntil: null, version: 1 });
  }
  return { actors, stores, regions, departmentId, password };
}
