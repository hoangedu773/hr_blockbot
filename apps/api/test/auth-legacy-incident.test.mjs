import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { SignJWT } from 'jose';
import { app } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { RefreshSessionModel } from '../dist/models/RefreshSession.js';
import { hashPassword, verifyAccessToken } from '../dist/services/auth.service.js';
import { loadAccount } from '../dist/services/principal.service.js';

// Never use model.create() for the legacy fixtures: it would populate defaults
// before persistence and conceal the exact production-compatibility question.
const password='SyntheticIncidentOnly@2026';
let server,base,passwordHash;
const id=()=>new mongoose.Types.ObjectId();
async function fixture(name,{user={},employee={},removeUser=[],removeEmployee=[],noMapping=false,orphan=false}={}) {
  const userId=id(),employeeId=id();
  const u={_id:userId,username:'incident-'+name,passwordHash,role:'Employee',status:'active',securityVersion:0,
    ...(!noMapping?{employeeId}:{}),...user};
  const e={_id:employeeId,userId,status:'active',skills:['Synthetic verified skill'],...employee};
  for(const field of removeUser)delete u[field];
  for(const field of removeEmployee)delete e[field];
  await UserModel.collection.insertOne(u);
  if(!noMapping&&!orphan)await EmployeeModel.collection.insertOne(e);
  return {user:u,employee:e};
}
function call(path,{method='GET',body,token}={}) {
  return new Promise((resolve,reject)=>{
    const request=http.request(base+path,{method,agent:false,headers:{Connection:'close',
      ...(body?{'content-type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))}));
    });
    request.on('error',reject);request.end(body?JSON.stringify(body):undefined);
  });
}
const login=(row,override=password)=>call('/api/auth/login',{method:'POST',body:{username:row.user.username,password:override}});
async function unavailable(row) {
  const response=await login(row);
  assert.equal(response.status,401);
  assert.equal(response.body.error.code,'UNAUTHENTICATED');
  assert.equal(response.body.error.message,'Invalid username or password');
  assert.deepEqual(Object.keys(response.body.error).sort(),['code','message']);
  assert.equal(await RefreshSessionModel.countDocuments({userId:row.user._id}),0);
}

before(async()=>{
  await connectDB();passwordHash=await hashPassword(password);
  server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{
  server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));
  await disconnectDB();
});

test('explicit active legacy account can sign in, but no grants is 403 not 401',async()=>{
  const row=await fixture('valid-no-grants');const response=await login(row);assert.equal(response.status,200);
  const claims=await verifyAccessToken(response.body.accessToken);assert.equal(claims.securityVersion,0);
  const me=await call('/api/auth/me',{token:response.body.accessToken});assert.equal(me.status,200);
  assert.equal(me.body.authorization.configured,false);assert.deepEqual(me.body.authorization.capabilities,[]);
  assert.equal((await call('/api/employees',{token:response.body.accessToken})).status,403);
});
test('hydration supplies active but must never authorize a persisted missing user status',async()=>{
  const row=await fixture('missing-user-status',{removeUser:['status']});
  const raw=await UserModel.collection.findOne({_id:row.user._id});
  assert.equal(Object.hasOwn(raw,'status'),false);
  assert.equal(UserModel.hydrate(raw).status,'active'); // repro of the dangerous implicit default
  await unavailable(row);
  assert.equal(Object.hasOwn(await UserModel.collection.findOne({_id:row.user._id}),'status'),false);
});
test('missing user status is not approved even for legacy Admin/isGlobalAdmin',async()=>{
  await unavailable(await fixture('missing-admin-status',{user:{role:'Admin',isGlobalAdmin:true},removeUser:['status']}));
});
for(const status of ['disabled','pending_activation',null,''])test('persisted nonactive user state remains denied: '+String(status),async()=>{
  await unavailable(await fixture('user-state-'+(status===null?'null':status===''?'blank':status),{user:{status}}));
});
test('raw employee missing status is rejected even when hydrated Employee would have active default',async()=>{
  const row=await fixture('missing-employee-status',{removeEmployee:['status']});
  assert.equal(Object.hasOwn(await EmployeeModel.collection.findOne({_id:row.employee._id}),'status'),false);
  await unavailable(row);
});
test('inactive employee stays denied',async()=>unavailable(await fixture('inactive-employee',{employee:{status:'inactive'}})));
test('orphan users.employeeId is rejected',async()=>unavailable(await fixture('orphan',{orphan:true})));
test('reverse employees.userId never repairs missing authoritative mapping',async()=>{
  const row=await fixture('no-authoritative-link',{noMapping:true});
  await EmployeeModel.collection.insertOne(row.employee);
  const response=await login(row);assert.equal(response.status,200);
  const me=await call('/api/auth/me',{token:response.body.accessToken});assert.equal(me.status,200);assert.equal(me.body.employeeId,null);
  assert.equal((await call('/api/employees',{token:response.body.accessToken})).status,403);
});
test('employee linked to another user stays rejected',async()=>unavailable(await fixture('mismatch',{employee:{userId:id()}})));
test('unfinished employee lifecycle stays rejected',async()=>unavailable(await fixture('lifecycle',{employee:{lifecyclePendingRequestId:String(id())}})));
test('unfinished onboarding activation stays rejected',async()=>unavailable(await fixture('activation-fence',{user:{provisioningRequestId:id()}})));
test('missing securityVersion uses existing zero-version compatibility without grants',async()=>{
  const response=await login(await fixture('missing-security-version',{removeUser:['securityVersion']}));
  assert.equal(response.status,200);assert.equal((await verifyAccessToken(response.body.accessToken)).securityVersion,0);
});
test('wrong credentials are indistinguishable from account refusal',async()=>{
  const row=await fixture('wrong-password');const response=await login(row,'WrongSyntheticPassword@2026');
  assert.equal(response.status,401);assert.equal(response.body.error.message,'Invalid username or password');
});
test('missing, malformed and pre-V1 tokens get 401; they do not become permission failures',async()=>{
  assert.equal((await call('/api/auth/me')).status,401);
  assert.equal((await call('/api/auth/me',{token:'not-a-jwt'})).status,401);
  const row=await fixture('old-token');
  const token=await new SignJWT({sub:String(row.user._id),role:'Employee'}).setProtectedHeader({alg:'HS256'})
    .setAudience('hr-blockbot-api').setExpirationTime('5m').sign(new TextEncoder().encode(process.env.JWT_SECRET));
  assert.equal((await call('/api/auth/me',{token})).status,401);
});
test('a new account security version invalidates the older current-session token',async()=>{
  const row=await fixture('version-revoke',{user:{securityVersion:5}});const response=await login(row);assert.equal(response.status,200);
  await UserModel.collection.updateOne({_id:row.user._id,securityVersion:5},{$set:{securityVersion:6}});
  assert.equal((await call('/api/auth/me',{token:response.body.accessToken})).status,401);
});
test('reviewed synthetic status repair restores sign-in only, never grants business rights',async()=>{
  const row=await fixture('reviewed-repair',{removeEmployee:['status']});await unavailable(row);
  const result=await EmployeeModel.collection.updateOne({_id:row.employee._id,status:{$exists:false}},
    {$set:{status:'active'},$push:{authorizationMigrationHistory:{approvalRef:'SYNTHETIC-OWNER-REVIEW-ONLY',reason:'Explicit fixture approval, never a production default'}}});
  assert.equal(result.modifiedCount,1);
  const response=await login(row);assert.equal(response.status,200);
  assert.equal((await call('/api/employees',{token:response.body.accessToken})).status,403);
  assert.equal((await EmployeeModel.collection.updateOne({_id:row.employee._id,status:{$exists:false}},{$set:{status:'active'}})).modifiedCount,0);
});
test('internal diagnostics separate missing user and employee state without public enumeration',async()=>{
  const userMissing=await fixture('internal-user-state',{removeUser:['status']});
  const employeeMissing=await fixture('internal-employee-state',{removeEmployee:['status']});
  await assert.rejects(loadAccount(String(userMissing.user._id)),error=>error.internalReason==='ACCOUNT_STATUS_UNREVIEWED');
  await assert.rejects(loadAccount(String(employeeMissing.user._id)),error=>error.internalReason==='EMPLOYEE_STATUS_UNREVIEWED');
  await unavailable(userMissing);await unavailable(employeeMissing);
});

// Field-shape regression derived from the authorized Atlas copy inventory only.
// No company IDs, names, hashes, sessions or employee records are fixtures here.
for(const employeeStatus of ['active','inactive'])test('copied legacy shape: missing user V1 fields never implies approval, employee '+employeeStatus,async()=>{
  const row=await fixture('copied-shape-'+employeeStatus,{
    removeUser:['status','securityVersion','authorization'],
    employee:{status:employeeStatus,departmentId:'SYNTHETIC-LEGACY-DEPARTMENT',store_raw:'SYNTHETIC-LEGACY-STORE'},
    removeEmployee:['storeId','storeMappingRef'],
  });
  await unavailable(row);
  const persisted=await UserModel.collection.findOne({_id:row.user._id});
  for(const field of ['status','securityVersion','authorization'])assert.equal(Object.hasOwn(persisted,field),false);
});

test('explicit active local account with legacy department but no grant/canonical store stays forbidden',async()=>{
  const row=await fixture('copied-unmapped-active',{
    removeUser:['authorization'],employee:{departmentId:'SYNTHETIC-LEGACY-DEPARTMENT',store_raw:'SYNTHETIC-LEGACY-STORE'},removeEmployee:['storeId','storeMappingRef'],
  });
  const response=await login(row);assert.equal(response.status,200);
  const denied=await call('/api/employees',{token:response.body.accessToken});
  assert.equal(denied.status,403);assert.equal(denied.body.error.code,'RBAC_DENIED');
  const employee=await EmployeeModel.collection.findOne({_id:row.employee._id});
  assert.equal(Object.hasOwn(employee,'storeId'),false);assert.equal(Object.hasOwn(employee,'storeMappingRef'),false);
});
