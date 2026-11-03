import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthorizationGrantSchema, AuthorizationStateSchema, type AuthorizationState } from '@hr-blockbot/contracts';
import { activeWindow } from './authorization-policy.service.js';
import { digest } from './project-audit.service.js';
const ModuleGrant = z.object({ _id: z.string().length(24), userId: z.string().regex(/^[a-f0-9]{24}$/), sourceGrantId: z.string().uuid(),
  grant: AuthorizationGrantSchema, sourceHash: z.string().length(64), approvalRef: z.literal('OWNER_REVENUE_KPI_20261104'), grantedBy: z.string().regex(/^[a-f0-9]{24}$/),
  createdAt: z.string().datetime(), version: z.literal(1), revokedAt: z.string().datetime().nullable() }).strict();
export const REVENUE_SELF_CAPS = ['revenue_kpi.read_self', 'revenue_kpi.respond', 'revenue_kpi.request_adjustment'] as const;
export const REVENUE_HR_CAPS = ['revenue_kpi.read_scope', 'revenue_kpi.assign', 'revenue_kpi.approve', 'revenue_kpi.close'] as const;
export const REVENUE_AM_CAPS = ['revenue_kpi.read_scope', 'revenue_kpi.verify_adjustment'] as const;
export function revenueSourceHash(grant: any) { return digest({ id: grant.id, profile: grant.profile, scope: grant.scope, validFrom: grant.validFrom, validUntil: grant.validUntil, approvalRef: grant.approvalRef }); }
export function makeRevenueModuleGrant(userId: string, authorization: AuthorizationState, source: any, actorId: string) {
  const profile = authorization.profile;
  if (!['hr', 'am', 'sm'].includes(profile)) return null;
  const capabilities = source.scope.kind === 'self' ? profile === 'hr' ? ['revenue_kpi.read_self'] : [...REVENUE_SELF_CAPS] : source.scope.kind === 'organization' && profile === 'hr' ? [...REVENUE_HR_CAPS] : source.scope.kind === 'organization' && profile === 'am' ? [...REVENUE_AM_CAPS] : [];
  if (!capabilities.length || !activeWindow(source, new Date())) return null;
  // Organization permission requires an already approved comparable operational
  // source grant. No global/store/reporting scope is invented by profile alone.
  if (source.scope.kind === 'organization' && !source.capabilities.includes(profile === 'hr' ? 'employees.read_hr' : 'dashboard.read')) return null;
  if (source.scope.kind === 'self' && !source.capabilities.includes('profile.read_self')) return null;
  const h = digest(userId + ':' + source.id + ':revenue-v1'), uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return ModuleGrant.parse({ _id: h.slice(0, 24), userId, sourceGrantId: source.id, sourceHash: revenueSourceHash(source), approvalRef: 'OWNER_REVENUE_KPI_20261104', grantedBy: actorId, createdAt: new Date().toISOString(), version: 1, revokedAt: null,
    grant: { ...source, id: uuid, capabilities, grantedBy: actorId, grantedAt: new Date().toISOString(), approvalRef: 'OWNER_REVENUE_KPI_20261104' } });
}
export async function withRevenueModuleGrants(userId: string, authorization: AuthorizationState): Promise<AuthorizationState> {
  if (process.env.REVENUE_KPI_ENABLED !== 'true' || !['hr', 'am', 'sm'].includes(authorization.profile)) return authorization;
  // Only this service understands the new separate collection. Legacy services
  // keep parsing the unmodified persisted users.authorization schema.
  const rows = await mongoose.connection.collection('revenue_kpi_grants').find({ userId, revokedAt: null }).limit(100).toArray();
  const extra = [];
  for (const row of rows) {
    const parsed = ModuleGrant.safeParse(row); if (!parsed.success) continue; const r = parsed.data;
    const source = authorization.grants.find(g => g.id === r.sourceGrantId);
    if (!source || !activeWindow(source, new Date()) || revenueSourceHash(source) !== r.sourceHash || r.grant.profile !== authorization.profile || digest(r.grant.scope) !== digest(source.scope)) continue;
    const expected = makeRevenueModuleGrant(userId, authorization, source, r.grantedBy);
    if (!expected || digest([...expected.grant.capabilities].sort()) !== digest([...r.grant.capabilities].sort())) continue;
    extra.push(r.grant);
  }
  return AuthorizationStateSchema.parse({ ...authorization, grants: [...authorization.grants, ...extra] });
}
