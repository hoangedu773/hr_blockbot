// Maintenance only, no HTTP entrypoint. Configuration/secrets arrive on stdin.
// Dry-run by default. Original malformed metadata is retained in a private journal.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AuthorizationStateSchema } from '@hr-blockbot/contracts';
import { UserModel } from '../dist/models/User.js';
import { verifyAccessToken } from '../dist/services/auth.service.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { requireCapability } from '../dist/services/authorization-scope.service.js';
import { mutateAccountSecurity, withAccountSecurityLock } from '../dist/services/account-security.service.js';
import { digest } from '../dist/services/project-audit.service.js';

const metadataFree = state => ({ ...state, grants: state.grants.map(({ id, grantedBy, ...grant }) => grant) });
function stableId(userId, grant) {
  const b = createHash('sha256').update('AM_METADATA_REPAIR_V1:' + userId + ':' + digest(grant)).digest().subarray(0,16);
  b[6] = (b[6] & 15) | 80; b[8] = (b[8] & 63) | 128;
  const s = b.toString('hex'); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export function buildAmMetadataRepair(row, actorId) {
  if (AuthorizationStateSchema.safeParse(row.authorization).success) return null;
  if (row.authorization?.profile !== 'am' || !/^[a-f0-9]{24}$/i.test(actorId)) throw new Error('Unexpected repair target/actor');
  const result = AuthorizationStateSchema.safeParse(row.authorization);
  if (result.error.issues.some(issue => issue.path.length !== 3 || issue.path[0] !== 'grants' || !['id','grantedBy'].includes(issue.path[2]))) throw new Error('Non-metadata validation error; manual review required');
  const indexes = [...new Set(result.error.issues.map(issue => issue.path[1]))];
  const authorization = structuredClone(row.authorization), mapping = [];
  for (const index of indexes) {
    const grant = authorization.grants[index];
    if (grant.profile !== 'am' || grant.scope?.kind !== 'organization' || grant.grantedBy !== 'system' || !/^region-[a-z0-9]+-[a-z0-9]+$/.test(grant.id) || !grant.approvalRef?.startsWith('OWNER_ORG_CLEANUP_20261103:AM_REGION:')) throw new Error('Unknown malformed grant provenance');
    const before = { id: grant.id, grantedBy: grant.grantedBy };
    grant.id = stableId(String(row._id), row.authorization.grants[index]);
    grant.grantedBy = actorId; // Attribution of this authorized metadata repair, NOT a fabricated historical approver.
    mapping.push({ index, before, after: { id: grant.id, grantedBy: grant.grantedBy } });
  }
  AuthorizationStateSchema.parse(authorization);
  if (digest(metadataFree(row.authorization)) !== digest(metadataFree(authorization))) throw new Error('Authority changed during metadata repair');
  return { authorization, mapping, beforeHash: digest(row.authorization), afterHash: digest(authorization) };
}

export async function repairAmMetadata(actor, id, expectedVersion, options = {}) {
  requireCapability(actor, 'grants.configure');
  return withAccountSecurityLock(actor, async () => {
    const row = await UserModel.findById(id).lean();
    if (!row || (row.securityVersion ?? 0) !== expectedVersion) throw new Error('Repair version conflict');
    const plan = buildAmMetadataRepair(row, actor.userId);
    if (!plan) return { changed: false };
    const oldIds = plan.mapping.map(item => item.before.id);
    if (await mongoose.connection.collection('authorization_delegations').findOne({ sourceGrantId: { $in: oldIds } })) throw new Error('Delegation reference requires separate migration');
    if (options.beforeWrite) await options.beforeWrite(row, plan);
    const reason = 'Owner-authorized AM metadata repair: UUID and repairing technical actor only; original grantedBy=system preserved in private journal. This does not attest the historical approver. Capabilities/scope/validity/approvalRef/grantedAt unchanged.';
    const after = await mutateAccountSecurity(actor, String(row._id), expectedVersion, reason,
      { authorization: plan.authorization }, { authorization: row.authorization, securityAudit: row.securityAudit ?? [] });
    return { changed: true, plan, securityVersion: after.securityVersion, after };
  }, 'grants.configure');
}

async function main() {
  let raw = ''; for await (const chunk of process.stdin) raw += chunk;
  const config = JSON.parse(raw);
  if (config.dbName !== 'hr_bot_test_363' || config.apiOrigin !== 'https://hr-blockbot-363-test-api-starter.onrender.com') throw new Error('Pinned maintenance target required');
  process.env.JWT_SECRET = config.jwtSecret; process.env.NODE_ENV = 'production';
  mongoose.set('autoIndex', false).set('autoCreate', false);
  let cookie;
  try {
    const login = await fetch(config.apiOrigin + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config.actorCredential) });
    if (login.status !== 200) throw new Error('Technical actor login failed');
    cookie = login.headers.get('set-cookie')?.split(';')[0];
    const claims = await verifyAccessToken((await login.json()).accessToken);
    await mongoose.connect(config.uri, { dbName:config.dbName, autoIndex:false, autoCreate:false, serverSelectionTimeoutMS:8000 });
    const actor = await resolvePrincipal(claims); requireCapability(actor,'grants.configure');
    const rows = await UserModel.find({ 'authorization.profile':'am' }).lean();
    const plans = rows.map(row => ({ row, plan:buildAmMetadataRepair(row,actor.userId) })).filter(x => x.plan);
    const result = { database:config.dbName, apply:config.apply === true, candidates:plans.length, repaired:0, skippedValid:rows.length-plans.length, scopeAndCapabilitiesUnchanged:true, users:[] };
    if (config.apply) {
      await fs.mkdir(config.privateDirectory,{recursive:true});
      for (const {row} of plans) {
        const change = await repairAmMetadata(actor,String(row._id),row.securityVersion??0,{
          beforeWrite:async (current,plan) => {
            const filename=path.join(config.privateDirectory, String(row._id)+'.before.private.json');
            try { await fs.writeFile(filename,JSON.stringify({ userId:String(row._id), authorization:current.authorization, securityVersion:current.securityVersion??0, securityAudit:current.securityAudit??[], plan },null,2),{flag:'wx'}); }
            catch(error) { if(error.code!=='EEXIST') throw error; const saved=JSON.parse(await fs.readFile(filename,'utf8')); if(saved.plan.beforeHash!==plan.beforeHash) throw new Error('Existing snapshot differs; preserve journal and stop'); }
          },
        });
        if(change.changed) {
          result.repaired++;
          await fs.appendFile(path.join(config.privateDirectory,'journal.private.jsonl'),JSON.stringify({ at:new Date().toISOString(),userId:String(row._id),state:'APPLIED',beforeHash:change.plan.beforeHash,afterHash:change.plan.afterHash,mapping:change.plan.mapping,securityVersion:change.securityVersion })+'\n');
        }
      }
    }
    const invalidAfter = (await UserModel.find({'authorization.profile':'am'}).select('authorization').lean()).filter(row=>!AuthorizationStateSchema.safeParse(row.authorization).success).length;
    result.invalidAfter=invalidAfter;
    console.log(JSON.stringify(result));
  } finally {
    await mongoose.disconnect();
    if(cookie) await fetch(config.apiOrigin+'/api/auth/logout',{method:'POST',headers:{Cookie:cookie}}).catch(()=>{});
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{ console.error(JSON.stringify({status:'FAILED_METADATA_REPAIR',errorClass:error.name,reason:'Maintenance stopped; private configuration not printed'})); process.exitCode=1; });
}
