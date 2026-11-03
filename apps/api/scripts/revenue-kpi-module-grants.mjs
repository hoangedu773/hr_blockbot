// Owner-approved test-only module grants. Persist outside users.authorization so
// older main API contracts stay compatible. Secrets only enter process stdin.
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { AuthorizationStateSchema } from '@hr-blockbot/contracts';
import { UserModel } from '../dist/models/User.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { makeRevenueModuleGrant } from '../dist/services/revenue-kpi-grants.service.js';
import { ensureRevenueKpiStorage } from '../dist/services/revenue-kpi-storage.service.js';
import { withAccountSecurityLock } from '../dist/services/account-security.service.js';
import { verifyAccessToken } from '../dist/services/auth.service.js';
import { digest } from '../dist/services/project-audit.service.js';
import { activeWindow } from '../dist/services/authorization-policy.service.js';
let cookie;
async function main() {
  let raw = ''; for await (const part of process.stdin) raw += part; const c = JSON.parse(raw);
  if (c.dbName !== 'hr_bot_test_363' || c.approvalRef !== 'OWNER_REVENUE_KPI_20261104' || c.apiOrigin !== 'https://hr-blockbot-363-test-api-starter.onrender.com') throw Error('Pinned test target required');
  process.env.NODE_ENV = 'production'; process.env.JWT_SECRET = c.jwtSecret; process.env.REVENUE_KPI_ENABLED = 'true';
  mongoose.set('autoCreate', false).set('autoIndex', false);
  await mongoose.connect(c.uri, { dbName: c.dbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 });
  const response = await fetch(c.apiOrigin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c.actorCredential) });
  if (!response.ok) throw Error('Technical actor unavailable'); cookie = response.headers.get('set-cookie')?.split(';')[0];
  const actor = await resolvePrincipal(await verifyAccessToken((await response.json()).accessToken));
  const users = await UserModel.find({ status: 'active', 'authorization.profile': { $in: ['hr', 'am', 'sm'] } }).sort({ _id: 1 }).lean();
  const plan = [], skipped = [];
  for (const u of users) {
    const parsed = AuthorizationStateSchema.safeParse(u.authorization); if (!parsed.success) { skipped.push({ id: String(u._id), reason: 'INVALID_AUTHORIZATION' }); continue; }
    try { const principal = await resolvePrincipal({ sub: String(u._id), role: u.role, securityVersion: u.securityVersion ?? 0 }); if (!principal.employeeActive || principal.mustChangePassword) throw Error('Unavailable'); }
    catch { skipped.push({ id: String(u._id), reason: 'PRINCIPAL_UNAVAILABLE' }); continue; }
    for (const source of parsed.data.grants.filter(g => activeWindow(g, new Date()))) {
      const grant = makeRevenueModuleGrant(String(u._id), parsed.data, source, actor.userId); if (grant) plan.push(grant);
    }
  }
  const userHash = digest(users), stable = g => ({ ...g, createdAt: '', grant: { ...g.grant, grantedAt: '' } });
  const planHash = digest(plan.map(stable)), old = await mongoose.connection.collection('revenue_kpi_grants').find({}).toArray();
  await fs.mkdir(c.privateDirectory, { recursive: true });
  await fs.writeFile(path.join(c.privateDirectory, `${c.apply ? 'apply' : 'dry-run'}-${Date.now()}.private.json`), JSON.stringify({ userHash, planHash, plan, skipped, before: old }, null, 2), { flag: 'wx' });
  let inserted = 0;
  if (c.apply) {
    if (c.planHash !== planHash || c.userHash !== userHash) throw Error('Reviewed plan changed');
    await withAccountSecurityLock(actor, async () => {
      const current = await UserModel.find({ status: 'active', 'authorization.profile': { $in: ['hr', 'am', 'sm'] } }).sort({ _id: 1 }).lean(); if (digest(current) !== userHash) throw Error('Accounts changed');
      await ensureRevenueKpiStorage();
      for (const g of plan) { const existing = await mongoose.connection.collection('revenue_kpi_grants').findOne({ _id: g._id }); if (existing && digest(stable(existing)) !== digest(stable(g))) throw Error('Existing module grant differs; preserve');
        const r = await mongoose.connection.collection('revenue_kpi_grants').updateOne({ _id: g._id }, { $setOnInsert: g }, { upsert: true }); inserted += r.upsertedCount; }
    });
    const after = await UserModel.find({ status: 'active', 'authorization.profile': { $in: ['hr', 'am', 'sm'] } }).sort({ _id: 1 }).lean(); if (digest(after) !== userHash) throw Error('Protected users changed');
  }
  console.log(JSON.stringify({ status: c.apply ? 'PASS_MODULE_GRANTS_APPLIED' : 'PASS_MODULE_GRANTS_DRY_RUN', userHash, planHash, plannedGrants: plan.length, recipients: new Set(plan.map(g => g.userId)).size, skipped: skipped.length, inserted, protectedUsersUnchanged: true }));
  await fetch(c.apiOrigin + '/api/auth/logout', { method: 'POST', headers: cookie ? { Cookie: cookie } : {} }); cookie = null;
}
main().catch(() => { console.error(JSON.stringify({ status: 'MODULE_GRANTS_STOPPED', details: 'Inspect private plan; secret omitted' })); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
