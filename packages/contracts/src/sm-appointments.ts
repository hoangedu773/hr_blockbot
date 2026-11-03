import { z } from 'zod';

const Id = z.string().regex(/^[a-f0-9]{24}$/i);
export const SmAppointmentKindSchema = z.enum(['PRIMARY', 'ADDITIONAL', 'SUPERVISORY', 'TEMPORARY']);
export const SmAppointmentProposalSchema = z.object({
  clientRequestId: z.string().uuid(),
  storeId: Id,
  kind: SmAppointmentKindSchema,
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().nullable(),
  evidenceRef: z.string().trim().min(3).max(300),
  basis: z.enum(['SIMULATION_APPROVED', 'DOCUMENTED_ASSIGNMENT']),
  reason: z.string().trim().min(3).max(2000),
  replacesAppointmentId: Id.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (value.validUntil && Date.parse(value.validUntil) <= Date.parse(value.validFrom)) ctx.addIssue({ code: 'custom', message: 'Invalid interval' });
  if (['ADDITIONAL', 'TEMPORARY'].includes(value.kind) && !value.validUntil) ctx.addIssue({ code: 'custom', message: 'Temporary/additional assignments require an end' });
  if ((value.kind === 'TEMPORARY') !== !!value.replacesAppointmentId) ctx.addIssue({ code: 'custom', message: 'Temporary assignment must identify the primary appointment' });
});
export const SmAppointmentDecisionSchema = z.object({
  expectedVersion: z.number().int().min(1),
  action: z.enum(['APPROVE', 'REJECT', 'REVOKE']),
  reason: z.string().trim().min(3).max(2000),
  handoverRef: z.string().trim().min(3).max(300).optional(),
}).strict();
export const SmAppointmentSchema = z.object({
  id: Id, employeeId: Id, storeId: Id, kind: SmAppointmentKindSchema,
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']),
  effectiveState: z.enum(['PENDING', 'SCHEDULED', 'EFFECTIVE', 'EXPIRED', 'REJECTED', 'REVOKED']),
  validFrom: z.string().datetime(), validUntil: z.string().datetime().nullable(),
  evidenceRef: z.string(), basis: z.enum(['SIMULATION_APPROVED', 'DOCUMENTED_ASSIGNMENT']), reason: z.string(),
  replacesAppointmentId: Id.nullable(), requestedBy: Id, approvedBy: Id.nullable(), approvedAt: z.string().datetime().nullable(),
  version: z.number().int(), grade: z.literal('UNKNOWN'), grantsChanged: z.literal(false),
  auditIntegrity: z.enum(['VALID_LOCAL_CHAIN', 'INVALID']).optional(),
  history: z.array(z.object({ id: z.string(), actorId: Id, at: z.string(), type: z.string(), reason: z.string(),
    before: z.string().nullable(), after: z.string(), handoverRef: z.string().nullable(), previousHash: z.string(), hash: z.string(), stateHash: z.string() })),
});
export type SmAppointment = z.infer<typeof SmAppointmentSchema>;
