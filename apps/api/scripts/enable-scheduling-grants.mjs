// Owner-requested scheduling rollout. No HTTP write route and no secret files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AuthorizationStateSchema } from '@hr-blockbot/contracts';
import { UserModel } from '../dist/models/User.js';
import { activeWindow } from '../dist/services/authorization-policy.service.js';
import { verifyAccessToken } from '../dist/services/auth.service.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { requireCapability } from '../dist/services/authorization-scope.service.js';
import { withAccountSecurityLock, mutateAccountSecurity } from '../dist/services/account-security.service.js';
import { digest } from '../dist/services/project-audit.service.js';

const SELF = ['schedules.read_self', 'schedule_changes.request', 'schedule_changes.respond'];
const MANAGE = ['schedules.read_store', 'schedules.manage', 'schedules.publish', 'shifts.manage', 'schedule_changes.review'];
function stableId(text) {
  const b = createHash('sha256').update(text).digest().subarray(0, 16); b[6] = (b[6] & 15) | 80; b[8] = (b[8] & 63) | 128;
  const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function schedulingGrantPlan(row, actorId, now = new Date()) {
  const parsed = AuthorizationStateSchema.safeParse(row.authorization);
  if (!parsed.success || row.status !== 'active' || parsed.data.profile === 'system_admin' || !row.employeeId) return null;
  const next = structuredClone(row.authorization), added = [];
  for (const source of parsed.data.grants) {
    if (!activeWindow(source, now) || source.approvalRef.startsWith('OWNER_SCHEDULING_20261103:')) continue;
    let capabilities = [];
    if (source.scope.kind === 'self' && source.capabilities.includes('profile.read_self')) capabilities = SELF;
    if (source.scope.kind === 'organization') {
      if (['hr', 'sm', 'am', 'sam', 'om', 'aom', 'ptch'].includes(parsed.data.profile) && source.capabilities.includes('employees.read_operational')) capabilities = ['schedules.read_store'];
      if (['sm', 'am', 'sam', 'om'].includes(parsed.data.profile) && source.capabilities.includes('projects.assign')) capabilities = MANAGE;
    }
    capabilities = capabilities.filter((cap) => !source.capabilities.includes(cap));
    const ref = 'OWNER_SCHEDULING_20261103:' + source.id;
    if (!capabilities.length || next.grants.some((grant) => grant.approvalRef === ref)) continue;
    const grant = { id: stableId(String(row._id) + ':' + ref), profile: parsed.data.profile, scope: structuredClone(source.scope), capabilities,
      grantedBy: actorId, grantedAt: now.toISOString(), approvalRef: ref, validFrom: now.toISOString(), validUntil: source.validUntil, revokedAt: null };
    next.grants.push(grant); added.push({ sourceGrantId: source.id, grant });
  }
  if (!added.length) return null;
  AuthorizationStateSchema.parse(next);
  return { authorization: next, added };
}
export async function enableSchedulingFor(actor, targetId, expectedVersion, beforeWrite) {
  return withAccountSecurityLock(actor, async () => {
    const row = await UserModel.findById(targetId).lean();
    if (!row || (row.securityVersion ?? 0) !== expectedVersion) throw new Error('Scheduling rollout version conflict');
    const current = await resolvePrincipal({ sub: String(row._id), role: row.role, securityVersion: expectedVersion });
    if (!current.employeeActive || !current.authorization) return { changed: false };
    const plan = schedulingGrantPlan(row, actor.userId); if (!plan) return { changed: false };
    if (beforeWrite) await beforeWrite(row, plan);
    const after = await mutateAccountSecurity(actor, String(row._id), expectedVersion,
      'Owner approved scheduling V1: own published calendar/change consent; approved operational read scope; management/publish/catalog/review only from current direct assignment-grant scopes. New independent grants, no HR status/title/source-scope changes.',
      { authorization: plan.authorization }, { authorization: row.authorization, securityAudit: row.securityAudit ?? [] });
    return { changed: true, userId: String(row._id), addedGrants: plan.added.length, securityVersion: after.securityVersion };
  }, 'grants.configure');
}
async function main() {
  let raw = ''; for await (const part of process.stdin) raw += part;
  const config = JSON.parse(raw);
  if (config.dbName !== 'hr_bot_test_363' || config.apiOrigin !== 'https://hr-blockbot-363-test-api-starter.onrender.com' || !/^[a-f0-9]{40}$/.test(config.commitId ?? '')) throw new Error('Pinned target and compatible commit evidence required');
  const origins = ['https://hr-blockbot-363-test-api-starter.onrender.com', 'https://hr-blockbot-api.onrender.com', 'https://hr-blockbot-363-test-api.onrender.com'];
  for (const origin of origins) {
    const response = await fetch(origin + '/api/scheduling/access', { signal: AbortSignal.timeout(20000) });
    if (response.status !== 401) throw new Error('All shared-database API contracts must be compatible before new grants');
  }
  process.env.JWT_SECRET = config.jwtSecret; process.env.NODE_ENV = 'production';
  mongoose.set('autoIndex', false).set('autoCreate', false);
  let cookie;
  try {
    const login = await fetch(config.apiOrigin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config.actorCredential) });
    if (login.status !== 200) throw new Error('Technical actor unavailable');
    cookie = login.headers.get('set-cookie')?.split(';')[0];
    const claims = await verifyAccessToken((await login.json()).accessToken);
    await mongoose.connect(config.uri, { dbName: config.dbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 });
    const actor = await resolvePrincipal(claims); requireCapability(actor, 'grants.configure');
    if (config.apply) await withAccountSecurityLock(actor, async () => {
      const controls = mongoose.connection.collection('authorization_controls');
      if (!await controls.findOne({ _id: 'scheduling-v1', enabled: true, approvalRef: 'OWNER_SCHEDULING_20261103' }))
        await controls.updateOne({ _id: 'scheduling-v1' }, { $set: { enabled: true, approvalRef: 'OWNER_SCHEDULING_20261103', actorId: actor.userId, compatibleCommit: config.commitId, approvedAt: new Date() } }, { upsert: true });
    }, 'grants.configure');
    const rows = await UserModel.find({ status: 'active', 'authorization.profile': { $ne: 'system_admin' } }).lean();
    const result = { apply: config.apply === true, database: config.dbName, candidates: 0, updated: 0, skippedUnavailable: 0, users: [] };
    if (config.apply) await fs.mkdir(config.privateDirectory, { recursive: true });
    for (const row of rows) {
      try { const principal = await resolvePrincipal({ sub: String(row._id), role: row.role, securityVersion: row.securityVersion ?? 0 });
        if (!principal.employeeActive || !principal.authorization) { result.skippedUnavailable++; continue; }
      } catch { result.skippedUnavailable++; continue; }
      const plan = schedulingGrantPlan(row, actor.userId); if (!plan) continue; result.candidates++;
      if (config.apply) {
        const updated = await enableSchedulingFor(actor, String(row._id), row.securityVersion ?? 0, async (before, proposed) => {
          const file = path.join(config.privateDirectory, String(row._id) + '.before.private.json');
          const snapshot = { userId: String(row._id), authorization: before.authorization, securityVersion: before.securityVersion ?? 0, securityAudit: before.securityAudit ?? [], added: proposed.added };
          try { await fs.writeFile(file, JSON.stringify(snapshot, null, 2), { flag: 'wx' }); }
          catch (error) {
            if (error.code !== 'EEXIST') throw error;
            const prior = JSON.parse(await fs.readFile(file, 'utf8'));
            if (prior.userId !== snapshot.userId || prior.securityVersion !== snapshot.securityVersion || digest(prior.authorization) !== digest(snapshot.authorization) || digest(prior.securityAudit) !== digest(snapshot.securityAudit)) throw new Error('Private scheduling snapshot mismatch; preserve and reconcile');
          }
        });
        if (updated.changed) { result.updated++; result.users.push(updated); await fs.appendFile(path.join(config.privateDirectory, 'journal.private.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...updated }) + '\n'); }
      }
      if (result.candidates % 25 === 0) console.log(JSON.stringify({ progress: true, candidates: result.candidates, updated: result.updated }));
    }
    console.log(JSON.stringify({ status: 'SCHEDULING_GRANTS_COMPLETE', ...result }));
  } finally {
    await mongoose.disconnect();
    if (cookie) await fetch(config.apiOrigin + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } }).catch(() => {});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(JSON.stringify({ status: 'SCHEDULING_GRANTS_STOPPED', errorClass: error.name, message: 'Stopped; private configuration omitted' })); process.exitCode = 1; });
