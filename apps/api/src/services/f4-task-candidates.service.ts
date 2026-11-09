import mongoose from 'mongoose';
import { SuggestSavedWorkCandidatesSchema, SuggestScoredWorkCandidatesSchema } from '@hr-blockbot/contracts';
import { EmployeeModel } from '../models/Employee.js';
import { TaskInstanceModel as Task } from '../models/TaskInstance.js';
import { PerformanceKpiPolicyModel as Policy } from '../models/PerformanceKpiPolicy.js';
import type { AuthenticatedUser as User } from '../middlewares/auth.middleware.js';
import { allowedStoreIds, requireCapability, resourceScope } from './authorization-scope.service.js';
import { rankCandidates, skillsOf } from './f4-orchestrator.service.js';
import { directManager, pfail, pfresh } from './performance-kpi-common.service.js';
import { getTask, taskPeriod } from './task-instance.service.js';

async function snapshot(user: User, storeId: string, period: string, currentAssignee: string | null) {
  requireCapability(user, 'task.assign');
  if (!allowedStoreIds(user, 'task.assign').includes(storeId))
    pfail('RBAC_DENIED', 'Cửa hàng ngoài phạm vi giao việc.', 403);
  requireCapability(user, 'task.read_scope', resourceScope(user, { storeId, storeMappingRef: 'task' }));
  if (!user.employeeId) return [];

  const now = new Date();
  const edges = await mongoose.connection.collection('management_relations').find({
    managerEmployeeId: new mongoose.Types.ObjectId(user.employeeId),
    storeId: new mongoose.Types.ObjectId(storeId),
    approvalRef: { $type: 'string', $ne: '' }, revokedAt: null, validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
  }, { projection: { employeeId: 1 } }).limit(501).toArray();
  if (edges.length > 500) pfail('DATA_INSUFFICIENT', 'Phạm vi gợi ý quá lớn. Hãy chọn người thủ công.');
  const ids = edges.map(edge => edge.employeeId).filter(id => String(id) !== currentAssignee);
  if (!ids.length) return [];
  const [employees, roles, work] = await Promise.all([
    EmployeeModel.find({ _id: { $in: ids }, storeId, status: 'active', lifecyclePendingRequestId: null })
      .select('fullName full_name skills').sort({ _id: 1 }).lean(),
    Policy.distinct('role', { period, status: { $in: ['PUBLISHED', 'OPEN', 'CLOSED'] } }),
    Task.find({
      storeId, assigneeEmployeeId: { $in: ids.map(String) },
      status: { $in: ['ASSIGNED', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'PENDING_REVIEW', 'HANDOVER'] },
    }).select('assigneeEmployeeId assignmentStatus status').lean(),
  ]);
  const loads = new Map<string, number>(), reservations = new Map<string, number>();
  for (const task of work) {
    const counts = task.assignmentStatus === 'ACCEPTED' ? loads : task.status === 'HANDOVER' ? reservations : null;
    const id = String(task.assigneeEmployeeId);
    if (counts) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const result = [];
  for (let start = 0; start < employees.length && result.length <= 200; start += 8) {
    const batch = await Promise.all(employees.slice(start, start + 8).map(async employee => {
      const employeeId = String(employee._id);
      try {
        const role = await directManager(user, employeeId, storeId, 'task.assign');
        if (!roles.includes(role)) return null;
      } catch (error) {
        const failure = error as { status?: number; code?: string };
        if (failure.status === 403 || failure.code === 'PERFORMANCE_KPI_RESPONSIBILITY_CONFLICT') return null;
        throw error;
      }
      return {
        employeeId, fullName: employee.fullName || employee.full_name || 'Nhân viên',
        skills: skillsOf(employee.skills), activeLoad: loads.get(employeeId) ?? 0,
        incomingReservations: reservations.get(employeeId) ?? 0,
      };
    }));
    result.push(...batch.filter(row => row !== null));
  }
  return result.slice(0, 201);
}

export async function suggestDraftScoredWork(user: User, body: unknown) {
  const input = SuggestScoredWorkCandidatesSchema.parse(body);
  const period = taskPeriod(input.dueAt);
  const context = { version: 1, description: input.description, requiredSkills: input.requiredSkills, state: 'PREVIEW' };
  return rankCandidates(await pfresh(user), async principal => {
    requireCapability(principal, 'task.manage', resourceScope(principal, { storeId: input.storeId, storeMappingRef: 'task' }));
    return { context, rows: await snapshot(principal, input.storeId, period, null) };
  });
}

export async function suggestSavedScoredWork(user: User, id: string, body: unknown) {
  const input = SuggestSavedWorkCandidatesSchema.parse(body);
  return rankCandidates(await pfresh(user), async principal => {
    const task = await getTask(principal, id);
    if (!['DRAFT', 'ASSIGNED', 'PENDING_ACCEPTANCE'].includes(task.status) || task.responsibilitySegments.length)
      pfail('INVALID_STATE', 'Chỉ gợi ý trước khi công việc có người chịu trách nhiệm.');
    const context = {
      version: task.version, description: task.description, state: task.status,
      requiredSkills: task.requiredSkills?.length ? task.requiredSkills : input.requiredSkills,
    };
    return { context, rows: await snapshot(principal, task.storeId, task.kpiPeriod, task.assigneeEmployeeId) };
  });
}
