import { z } from 'zod';

export const ScheduleDateSchema = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');
const Id = z.string().regex(/^[a-f0-9]{24}$/i).transform((value) => value.toLowerCase());
export const ShiftIntervalSchema = z.object({ startMinute: z.number().int().min(0).max(2879), endMinute: z.number().int().min(1).max(2880) }).strict();
export const ShiftDefinitionInputSchema = z.object({
  code: z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N}._-]+$/u),
  name: z.string().trim().min(1).max(100), active: z.boolean(),
  intervals: z.array(ShiftIntervalSchema).min(1).max(4),
}).strict().superRefine((value, ctx) => {
  const intervals = [...value.intervals].sort((a, b) => a.startMinute - b.startMinute);
  if (intervals.some((item, index) => item.endMinute <= item.startMinute || item.endMinute - item.startMinute > 1440
    || index > 0 && item.startMinute < intervals[index - 1].endMinute))
    ctx.addIssue({ code: 'custom', message: 'Khoảng giờ phải có thời lượng dương, tối đa 24 giờ và không chồng nhau.' });
});
export type ShiftDefinitionInput = z.infer<typeof ShiftDefinitionInputSchema>;
export type ShiftDefinition = ShiftDefinitionInput & { id: string; storeId: string; version: number };
export const ScheduleDraftInputSchema = z.object({
  expectedVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(500),
  assignments: z.array(z.object({ id: z.string().uuid().transform((value) => value.toLowerCase()), employeeId: Id, date: ScheduleDateSchema, shiftId: Id }).strict()).max(500),
}).strict().refine((value) => new Set(value.assignments.map((item) => item.id)).size === value.assignments.length, 'Mã phân công bị trùng');
export type ScheduleDraftInput = z.infer<typeof ScheduleDraftInputSchema>;
export type ScheduleAssignment = z.infer<typeof ScheduleDraftInputSchema>['assignments'][number] & {
  employeeName: string; employeeCode: string; shiftCode: string; shiftName: string;
  shiftVersion: number; intervals: z.infer<typeof ShiftIntervalSchema>[];
  source?: { kind: 'DEMO_RANDOM' | 'LEGACY_MATCHED'; batchId: string; sourceId?: string };
};
export const ScheduleChangeCreateSchema = z.object({
  expectedVersion: z.number().int().positive(), clientRequestId: z.string().uuid().transform((value) => value.toLowerCase()),
  assignmentId: z.string().uuid().transform((value) => value.toLowerCase()), receiverEmployeeId: Id.nullable().optional(),
  arrangement: z.enum(['DIRECT', 'MANAGER']).default('DIRECT'),
  targetAssignmentId: z.string().uuid().transform((value) => value.toLowerCase()).optional(),
  kind: z.enum(['COVER', 'SWAP']), reason: z.string().trim().min(5).max(500),
}).strict().superRefine((v, ctx) => {
  if (v.arrangement === 'DIRECT' && !v.receiverEmployeeId) ctx.addIssue({ code: 'custom', message: 'Choose receiver' });
  if (v.arrangement === 'MANAGER' && (v.kind !== 'COVER' || v.receiverEmployeeId || v.targetAssignmentId)) ctx.addIssue({ code: 'custom', message: 'Manager finds a replacement' });
  if (v.arrangement === 'DIRECT' && v.kind === 'SWAP' && !v.targetAssignmentId) ctx.addIssue({ code: 'custom', message: 'Both shifts must be selected before consent' });
  if (v.kind === 'COVER' && v.targetAssignmentId) ctx.addIssue({ code: 'custom', message: 'Cover has no return shift' });
});
export const ScheduleChangeActionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  action: z.enum(['ACCEPT', 'DECLINE', 'CONFIRM', 'CANCEL', 'APPROVE', 'REJECT', 'SELECT']),
  receiverEmployeeId: Id.optional(),
  targetAssignmentId: z.string().uuid().transform((value) => value.toLowerCase()).optional(), reason: z.string().trim().min(5).max(500),
}).strict();
export type ScheduleChange = {
  id: string; kind: 'COVER' | 'SWAP'; status: 'PENDING_MANAGER' | 'PENDING_RECEIVER' | 'PENDING_REQUESTER' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  requesterEmployeeId: string; receiverEmployeeId: string | null; requesterUserId: string; receiverUserId: string | null;
  source: ScheduleAssignment; target: ScheduleAssignment | null; reason: string; decisionReason: string | null;
  policyVersion?: 2; arrangement?: 'DIRECT' | 'MANAGER'; urgent?: boolean;
  completionMode?: 'CONSENT' | 'MANAGER';
  managerDecision?: { userId: string; employeeId: string; securityVersion: number; at: string; reason: string } | null;
  selectionHistory?: { receiverEmployeeId: string; managerUserId: string; at: string; reason: string }[];
  receiverName?: string | null;
};
export type OperationalScheduleWeek = {
  id: string; storeId: string; weekStart: string; version: number; publishedAt: string | null;
  draft: ScheduleAssignment[]; published: ScheduleAssignment[]; requests: ScheduleChange[];
  hasUnpublishedChanges: boolean; pendingNotifications: number; registrationAssignmentIds?: string[];
  history: { at: string; actorId: string; action: string; reason: string }[];
};
export type SchedulingAccess = {
  canReadSelf: boolean; canRequest: boolean; canRespond: boolean; employeeId: string | null;
  stores: { id: string; name: string; canRead: boolean; canManage: boolean; canPublish: boolean; canConfigure: boolean; canReview: boolean }[];
};
export type PersonalSchedule = {
  from: string; to: string;
  legacyEntries?: { id: string; date: string; shiftCode: string; sourceType: string }[];
  legacyTruncated?: boolean;
  assignments: (ScheduleAssignment & { weekId: string; weekVersion: number; storeId: string; storeName: string })[];
  requests: (ScheduleChange & { weekId: string; weekVersion: number; storeName: string })[];
};

const RegistrationSlotSchema = z.object({ date: ScheduleDateSchema, shiftId: Id, shiftVersion: z.number().int().positive() }).strict();
const RegistrationId = z.string().uuid().transform((value) => value.toLowerCase());
const RegistrationAction = z.enum(['APPROVE', 'EDIT', 'REMOVE']);
export const ScheduleRegistrationCreateSchema = z.object({
  weekStart: ScheduleDateSchema, clientRequestId: RegistrationId, slot: RegistrationSlotSchema,
}).strict();
export const ScheduleRegistrationAddSchema = ScheduleRegistrationCreateSchema.extend({ employeeId: Id });
export const ScheduleRegistrationActionSchema = z.object({
  weekStart: ScheduleDateSchema, expectedVersion: z.number().int().positive(),
  action: RegistrationAction, slot: RegistrationSlotSchema.optional(),
  reason: z.string().trim().min(5).max(500).optional(),
}).strict().refine((value) => (value.action === 'EDIT') === !!value.slot &&
  (value.action === 'APPROVE' || !!value.reason), 'Thiếu ca hoặc lý do.');
export type ScheduleRegistrationAction = z.infer<typeof RegistrationAction>;
export type ScheduleRegistrationStatus = 'PENDING_MANAGER' | 'PENDING_EMPLOYEE' | 'APPROVED' | 'REJECTED' | 'DECLINED' | 'CANCELLED';
export type ScheduleRegistration = {
  id: string; version: number; status: ScheduleRegistrationStatus;
  employeeName: string; slot: Pick<ScheduleAssignment, 'date' | 'shiftId' | 'shiftCode' | 'shiftName' | 'intervals'>;
  reviewReason: string | null; placement: 'DRAFT' | 'PUBLISHED' | null;
  isOwn: boolean; canManage: boolean; expired: boolean;
};
export type ScheduleRegistrations = {
  storeId: string; storeName: string; published: boolean; shifts: ShiftDefinition[]; items: ScheduleRegistration[];
  roster: { employeeId: string; fullName: string; employeeCode: string }[];
};
