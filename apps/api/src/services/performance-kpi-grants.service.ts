import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthorizationGrantSchema, AuthorizationStateSchema, type AuthorizationState } from '@hr-blockbot/contracts';
import { activeWindow } from './authorization-policy.service.js';
import { digest } from './project-audit.service.js';
const ModuleGrant = z.object({ _id: z.string().length(24), userId: z.string().regex(/^[a-f0-9]{24}$/), sourceGrantId: z.string().uuid(),
  grant: AuthorizationGrantSchema, sourceHash: z.string().length(64), approvalRef: z.literal('OWNER_PERFORMANCE_KPI_20261104'), grantedBy: z.string().regex(/^[a-f0-9]{24}$/),
  createdAt: z.string().datetime(), version: z.literal(1), revokedAt: z.string().datetime().nullable() }).strict();
export const PERFORMANCE_SELF_CAPS = ['performance_kpi.read_self', 'task.read_self', 'task.respond'] as const;
export const PERFORMANCE_HR_CAPS = ['performance_kpi.read_scope', 'performance_kpi.policy_manage', 'performance_kpi.appeal_review', 'performance_kpi.correct', 'task.read_scope'] as const;
export const PERFORMANCE_AM_CAPS = ['performance_kpi.read_scope', 'performance_kpi.evaluate', 'performance_kpi.finalize', 'performance_kpi.reconsider', 'performance_kpi.appeal_review', 'task.read_scope', 'task.manage', 'task.assign', 'task.evaluate', 'task.handover'] as const;
export function performanceSourceHash(grant: any) { return digest({ id: grant.id, profile: grant.profile, scope: grant.scope, validFrom: grant.validFrom, validUntil: grant.validUntil, approvalRef: grant.approvalRef }); }
export function makePerformanceModuleGrant(userId: string, authorization: AuthorizationState, source: any, actorId: string) {
  const profile = authorization.profile;
  if (!['hr', 'am', 'sm', 'staff', 'ptch'].includes(profile)) return null;
  const capabilities = source.scope.kind === 'self' ? profile === 'hr' ? ['performance_kpi.read_self'] : [...PERFORMANCE_SELF_CAPS] : source.scope.kind === 'organization' && profile === 'hr' ? [...PERFORMANCE_HR_CAPS] : source.scope.kind === 'organization' && ['am','sm'].includes(profile) ? [...PERFORMANCE_AM_CAPS].filter(c => profile !== 'sm' || c !== 'performance_kpi.appeal_review') : [];
  if (!capabilities.length || !activeWindow(source, new Date())) return null;
  // Organization permission requires an already approved comparable operational
  // source grant. No global/store/reporting scope is invented by profile alone.
  if (source.scope.kind === 'organization' && !source.capabilities.includes(profile === 'hr' ? 'employees.read_hr' : 'projects.assign')) return null;
  if (source.scope.kind === 'self' && !source.capabilities.includes('profile.read_self')) return null;
  const h = digest(userId + ':' + source.id + ':performance-v1'), uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return ModuleGrant.parse({ _id: h.slice(0, 24), userId, sourceGrantId: source.id, sourceHash: performanceSourceHash(source), approvalRef: 'OWNER_PERFORMANCE_KPI_20261104', grantedBy: actorId, createdAt: new Date().toISOString(), version: 1, revokedAt: null,
    grant: { ...source, id: uuid, capabilities, grantedBy: actorId, grantedAt: new Date().toISOString(), approvalRef: 'OWNER_PERFORMANCE_KPI_20261104' } });
}
export async function withPerformanceModuleGrants(userId: string, authorization: AuthorizationState): Promise<AuthorizationState> {
  if (process.env.PERFORMANCE_KPI_ENABLED !== 'true' || !['hr', 'am', 'sm', 'ptch', 'staff'].includes(authorization.profile)) return authorization;
  // Only this service understands the new separate collection. Legacy services
  // keep parsing the unmodified persisted users.authorization schema.
  const rows = await mongoose.connection.collection('performance_kpi_grants').find({ userId, revokedAt: null }).limit(100).toArray();
  const extra = [];
  for (const row of rows) {
    const parsed = ModuleGrant.safeParse(row); if (!parsed.success) continue; const r = parsed.data;
    const source = authorization.grants.find(g => g.id === r.sourceGrantId);
    if (!source || !activeWindow(source, new Date()) || performanceSourceHash(source) !== r.sourceHash || r.grant.profile !== authorization.profile || digest(r.grant.scope) !== digest(source.scope)) continue;
    const expected = makePerformanceModuleGrant(userId, authorization, source, r.grantedBy);
    if (!expected || digest([...expected.grant.capabilities].sort()) !== digest([...r.grant.capabilities].sort())) continue;
    extra.push(r.grant);
  }
  return AuthorizationStateSchema.parse({ ...authorization, grants: [...authorization.grants, ...extra] });
}
