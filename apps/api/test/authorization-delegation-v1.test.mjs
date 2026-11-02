import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { AuthorizationDelegationModel } from '../dist/models/AuthorizationDelegation.js';
import { ManagementRelationModel } from '../dist/models/AuthorizationMapping.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { hasCapability } from '../dist/services/authorization-scope.service.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { authorizationV1Fixture, SELF_CAPS, MANAGEMENT_CAPS, testGrant } from './helpers/authorization-v1-fixture.mjs';
let fixture, server, base;
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture(); await AuthorizationDelegationModel.init();
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${fixture.actors[actor].token}`, Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
function terms(extra = {}) {
  return { sourceGrantId: fixture.actors.sm.user.authorization.grants[1].id, recipientUserId: String(fixture.actors.ptch.user._id), capabilities: ['projects.create', 'projects.assign', 'reports.review'],
    scope: { kind: 'organization', storeIds: [String(fixture.stores[0]._id)], regionIds: [], reportingEmployeeIds: [] }, validFrom: new Date(Date.now() - 1000).toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(), reason: 'Isolated bounded SM delegation', ...extra };
}
const review = (row) => ({ expectedVersion: row.version, decision: 'APPROVE', reason: 'Independent direct AM verification' });
const principal = async (actor) => resolvePrincipal({ sub: String(fixture.actors[actor].user._id), role: 'Employee', securityVersion: 0 });

test('delegation enforces fourteen days, approved capabilities, canonical scope and no chaining', async () => {
  assert.equal((await call('sm', '/delegations', terms({ validUntil: new Date(Date.now() + 15 * 86400000).toISOString() }))).status, 400);
  assert.equal((await call('sm', '/delegations', terms({ capabilities: ['accounts.manage'] }))).status, 403);
  assert.equal((await call('sm', '/delegations', terms({ scope: { kind: 'organization', storeIds: [String(fixture.stores[1]._id)] } }))).status, 403);
  assert.equal((await call('sm', '/delegations', terms({ recipientUserId: String(fixture.actors.staff.user._id) }))).status, 403);
  assert.equal((await call('ptch', '/delegations', terms())).status, 403);
});
test('only explicitly granted direct superior approves SM to PTCH; concurrent approvals have one winner, no self or higher-rank shortcut', async () => {
  const request = await call('sm', '/delegations', terms()); assert.equal(request.status, 201);
  for (const actor of ['sm', 'ptch', 'system_admin', 'hr', 'sam', 'om']) assert.equal((await call(actor, `/delegations/${request.body.id}/review`, review(request.body))).status, 403, actor);
  const approvals = await Promise.all([call('am', `/delegations/${request.body.id}/review`, review(request.body)), call('am', `/delegations/${request.body.id}/review`, review(request.body))]);
  assert.deepEqual(approvals.map((row) => row.status).sort(), [200, 409]);
  const delegated = await principal('ptch'); assert.equal(hasCapability(delegated, 'projects.assign'), true); assert.equal(hasCapability(delegated, 'employees.read_hr'), false);
  const project = await call('ptch', '/projects', { title: 'Delegated scoped assignment', departmentId: String(fixture.departmentId), storeId: String(fixture.stores[0]._id), assigneeId: String(fixture.actors.staff.employee._id), dueDate: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(project.status, 201, JSON.stringify(project.body));
  const other = await call('ptch', '/projects', { title: 'Forbidden same-department B', departmentId: String(fixture.departmentId), storeId: String(fixture.stores[1]._id), dueDate: new Date(Date.now() + 86400000).toISOString() }); assert.equal(other.status, 403);
  assert.equal((await call('ptch', '/delegations', terms())).status, 403);
  const approved = approvals.find((row) => row.status === 200).body;
  assert.equal((await call('sm', `/delegations/${approved.id}/revoke`, { expectedVersion: approved.version, reason: 'End delegated work' })).status, 200);
  assert.equal(hasCapability(await principal('ptch'), 'projects.assign'), false);
});
test('root revoke, reviewer relation revoke, expiry and audit tampering invalidate delegated authority immediately', async () => {
  for (const scenario of ['source', 'relation', 'expiry', 'audit']) {
    const request = await call('sm', '/delegations', terms()); assert.equal(request.status, 201);
    const approval = await call('am', `/delegations/${request.body.id}/review`, review(request.body)); assert.equal(approval.status, 200);
    assert.equal(hasCapability(await principal('ptch'), 'projects.assign'), true);
    if (scenario === 'source') await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } });
    if (scenario === 'relation') await ManagementRelationModel.updateOne({ managerEmployeeId: fixture.actors.am.employee._id, employeeId: fixture.actors.sm.employee._id }, { $set: { revokedAt: new Date() } });
    if (scenario === 'expiry') await AuthorizationDelegationModel.updateOne({ _id: request.body.id }, { $set: { validUntil: new Date(Date.now() - 1000) } });
    if (scenario === 'audit') await AuthorizationDelegationModel.updateOne({ _id: request.body.id }, { $set: { 'history.1.actorUserId': String(fixture.actors.om.user._id) } });
    assert.equal(hasCapability(await principal('ptch'), 'projects.assign'), false, scenario);
    await AuthorizationDelegationModel.updateMany({ recipientUserId: fixture.actors.ptch.user._id }, { $set: { status: 'REVOKED' } });
    await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $set: { 'authorization.grants.1.revokedAt': null } });
    await ManagementRelationModel.updateOne({ managerEmployeeId: fixture.actors.am.employee._id, employeeId: fixture.actors.sm.employee._id }, { $set: { revokedAt: null } });
  }
});
test('OM to AOM stays pending without an explicitly verified independent approver', async () => {
  const request = await call('om', '/delegations', terms({ sourceGrantId: fixture.actors.om.user.authorization.grants[1].id, recipientUserId: String(fixture.actors.aom.user._id) })); assert.equal(request.status, 201);
  for (const actor of ['om', 'sam', 'am', 'system_admin']) assert.equal((await call(actor, `/delegations/${request.body.id}/review`, review(request.body))).status, 403);
  assert.equal(hasCapability(await principal('aom'), 'projects.assign'), false);
  assert.equal((await AuthorizationDelegationModel.findById(request.body.id)).status, 'PENDING');
});

test('SAM -> SM-position supervisor -> SM -> PTCH uses explicit direct-superior review, not title or grade', async () => {
  const storeId=String(fixture.stores[1]._id), storeA=String(fixture.stores[0]._id);
  async function actor(name,profile,review=false){
    const employee=await EmployeeModel.create({employeeCode:'BRANCH-'+name,fullName:'Isolated '+name,departmentId:fixture.departmentId,storeId,storeMappingRef:'isolated-branch',status:'active',level:'Junior'});
    const user=await UserModel.create({username:'branch-'+name,role:'Employee',passwordHash:fixture.actors.sm.user.passwordHash,employeeId:employee._id,status:'active',securityVersion:0,
      authorization:{schemaVersion:1,profile,grants:[testGrant(profile,{kind:'self'},SELF_CAPS,fixture.actors.system_admin.user._id),testGrant(profile,{kind:'organization',storeIds:[storeId]},profile==='sm'?[...MANAGEMENT_CAPS,...(review?['delegations.review']:[])]:['directory.read_store'],fixture.actors.system_admin.user._id)]}});
    employee.userId=user._id;await employee.save();fixture.actors[name]={user,employee};return fixture.actors[name];
  }
  const supervisor=await actor('supervisor','sm'),sm=await actor('smC','sm'),ptch=await actor('ptchC','ptch'),peer=await actor('peerSM','sm',true);
  for(const [parent,child]of [[fixture.actors.sam,supervisor],[supervisor,sm],[sm,ptch]])await ManagementRelationModel.create({managerEmployeeId:parent.employee._id,employeeId:child.employee._id,storeId,approvalRef:'isolated-reviewed-SAM-SM3-SM',validFrom:new Date(Date.now()-60000),validUntil:null,revokedAt:null,version:1});
  async function token(name){const u=await UserModel.findById(fixture.actors[name].user._id).lean();return signAccessToken({sub:String(u._id),role:u.role,securityVersion:u.securityVersion??0});}
  async function send(name,path,body){fixture.actors[name].token=await token(name);return call(name,path,body);}
  const termsC=()=>terms({sourceGrantId:sm.user.authorization.grants[1].id,recipientUserId:String(ptch.user._id),scope:{kind:'organization',storeIds:[storeId],regionIds:[],reportingEmployeeIds:[]}});
  const currentPtch=async()=>{const u=await UserModel.findById(ptch.user._id).lean();return resolvePrincipal({sub:String(u._id),role:u.role,securityVersion:u.securityVersion??0});};
  let request=await send('smC','/delegations',termsC());assert.equal(request.status,201);
  // Direct edge and same SM profile are insufficient without the explicit grant.
  assert.equal((await send('supervisor',`/delegations/${request.body.id}/review`,review(request.body))).status,403);
  // A peer with a review grant cannot replace the approved direct superior.
  assert.equal((await send('peerSM',`/delegations/${request.body.id}/review`,review(request.body))).status,403);
  for(const name of ['smC','ptchC','sam','am','system_admin','hr'])assert.equal((await send(name,`/delegations/${request.body.id}/review`,review(request.body))).status,403,name);
  const grant=await send('system_admin',`/admin/users/${supervisor.user._id}/grants`,{profile:'sm',scope:{kind:'organization',storeIds:[storeId]},capabilities:['delegations.review'],validUntil:null,expectedVersion:0,reason:'Approved isolated direct-superior branch review'});
  assert.equal(grant.status,200,JSON.stringify(grant.body));
  const reviewGrant=grant.body.authorization.grants.at(-1);assert.deepEqual(reviewGrant.capabilities,['delegations.review']);
  // No grade/title change is necessary or permitted for this source of authority.
  assert.equal((await EmployeeModel.findById(supervisor.employee._id).lean()).gutaGrade,null);
  const approvals=await Promise.all([send('supervisor',`/delegations/${request.body.id}/review`,review(request.body)),send('supervisor',`/delegations/${request.body.id}/review`,review(request.body))]);
  assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
  assert.equal(hasCapability(await currentPtch(),'projects.assign'),true);
  assert.equal(hasCapability(await currentPtch(),'employees.read_hr'),false);
  assert.equal((await send('ptchC','/delegations',termsC())).status,403);
  assert.equal((await send('ptchC','/projects',{title:'Cross-store denied',departmentId:String(fixture.departmentId),storeId:storeA,dueDate:new Date(Date.now()+86400000).toISOString()})).status,403);
  // Revoking the approver grant invalidates effective delegation even for an
  // already-approved request; stale recipient sessions do not preserve power.
  const revoke=await send('system_admin',`/admin/users/${supervisor.user._id}/grants/${reviewGrant.id}/revoke`,{expectedVersion:grant.body.securityVersion,reason:'End isolated reviewer approval'});
  assert.equal(revoke.status,200);assert.equal(hasCapability(await currentPtch(),'projects.assign'),false);
  const pendingAfterRevoke=await send('smC','/delegations',termsC());assert.equal(pendingAfterRevoke.status,201);
  assert.equal((await send('supervisor',`/delegations/${pendingAfterRevoke.body.id}/review`,review(pendingAfterRevoke.body))).status,403);
  // Regrant through the real endpoint, then independently invalidate each live
  // prerequisite. Fixture writes below model revoked/expired data, not bypasses.
  const fresh=await send('system_admin',`/admin/users/${supervisor.user._id}/grants`,{profile:'sm',scope:{kind:'organization',storeIds:[storeId]},capabilities:['delegations.review'],validUntil:null,expectedVersion:revoke.body.securityVersion,reason:'New isolated review window'});
  assert.equal(fresh.status,200);
  for(const cause of ['direct-edge','source-grant','reviewer-expiry','reviewer-disabled','delegation-expiry']){
    request=await send('smC','/delegations',termsC());assert.equal(request.status,201,cause);
    const approval=await send('supervisor',`/delegations/${request.body.id}/review`,review(request.body));assert.equal(approval.status,200,cause);
    assert.equal(hasCapability(await currentPtch(),'projects.assign'),true,cause);
    const edge={managerEmployeeId:supervisor.employee._id,employeeId:sm.employee._id,storeId};
    const g=fresh.body.authorization.grants.at(-1).id;
    if(cause==='direct-edge')await ManagementRelationModel.updateOne(edge,{$set:{revokedAt:new Date()}});
    if(cause==='source-grant')await UserModel.updateOne({_id:sm.user._id},{$set:{'authorization.grants.1.revokedAt':new Date().toISOString()}});
    if(cause==='reviewer-expiry')await UserModel.updateOne({_id:supervisor.user._id,'authorization.grants.id':g},{$set:{'authorization.grants.$.validUntil':new Date(Date.now()-1000).toISOString()}});
    if(cause==='reviewer-disabled')await UserModel.updateOne({_id:supervisor.user._id},{$set:{status:'disabled'}});
    if(cause==='delegation-expiry')await AuthorizationDelegationModel.updateOne({_id:request.body.id},{$set:{validUntil:new Date(Date.now()-1000)}});
    assert.equal(hasCapability(await currentPtch(),'projects.assign'),false,cause);
    await AuthorizationDelegationModel.updateMany({recipientUserId:ptch.user._id},{$set:{status:'REVOKED'}});
    await ManagementRelationModel.updateOne(edge,{$set:{revokedAt:null}});
    await UserModel.updateOne({_id:sm.user._id},{$set:{'authorization.grants.1.revokedAt':null}});
    await UserModel.updateOne({_id:supervisor.user._id,'authorization.grants.id':g},{$set:{'authorization.grants.$.validUntil':null,status:'active'}});
  }
});
