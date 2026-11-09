import mongoose from 'mongoose';
import {
  TaskSuitabilitySchema,
  type TaskSuitability,
  type TaskSuitabilityCandidate,
  type TaskSuitabilityRating,
} from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { EmployeeModel, deriveBusinessRole } from '../models/Employee.js';
import { TaskInstanceModel } from '../models/TaskInstance.js';
import { PerformanceKpiPolicyModel } from '../models/PerformanceKpiPolicy.js';
import { ProjectModel } from '../models/Project.js';
import { UserModel } from '../models/User.js';
import { getTask } from './task-instance.service.js';

interface CandidateRecord {
  _id: unknown;
  fullName?: string;
  full_name?: string;
  job_title?: string;
  skills?: string[];
  status?: string;
  lifecyclePendingRequestId?: string | null;
  storeId?: unknown;
}

interface OpenTaskRecord {
  assigneeEmployeeId?: string | null;
}

interface PolicyRecord {
  role?: string;
  status?: string;
}

interface UserAuthRecord {
  employeeId?: unknown;
  authorization?: {
    profile?: string;
  };
}

interface ProjectRecord {
  requiredSkills?: string[];
}

const RATING_ORDER: Record<TaskSuitabilityRating, number> = {
  strong: 0,
  possible: 1,
  not_recommended: 2,
};

export async function suggestSuitableCandidates(
  user: AuthenticatedUser,
  taskRef: string,
  options?: { asOf?: string }
): Promise<TaskSuitability> {
  const task = await getTask(user, taskRef);

  // 1. Resolve required skills
  let requiredSkills: string[] = [];
  const taskProps = task as Record<string, unknown>;
  if (Array.isArray(taskProps.requiredSkills) && taskProps.requiredSkills.length > 0) {
    requiredSkills = taskProps.requiredSkills.filter((s): s is string => typeof s === 'string');
  } else if (task.projectId) {
    const project = await ProjectModel.findById(task.projectId).select('requiredSkills').lean<ProjectRecord>();
    if (project?.requiredSkills && Array.isArray(project.requiredSkills)) {
      requiredSkills = project.requiredSkills;
    }
  }

  // 2. Fetch candidates in the same store (data minimization: select only safe fields)
  const storeFilter = mongoose.Types.ObjectId.isValid(task.storeId)
    ? { $in: [task.storeId, new mongoose.Types.ObjectId(task.storeId)] }
    : task.storeId;

  const employees = await EmployeeModel.find({ storeId: storeFilter })
    .select('_id fullName full_name job_title skills status lifecyclePendingRequestId storeId')
    .lean<CandidateRecord[]>();

  if (employees.length === 0) {
    return TaskSuitabilitySchema.parse({
      taskRef,
      candidates: [],
      generatedAt: options?.asOf ?? new Date().toISOString(),
      deterministic: true,
      advisory: true,
    });
  }

  const employeeIds = employees.map((e) => String(e._id));

  // 3. Workload open: tasks in open statuses (ASSIGNED, PENDING_ACCEPTANCE, ACCEPTED, IN_PROGRESS, SUBMITTED, PENDING_REVIEW)
  const openStatuses = ['ASSIGNED', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'PENDING_REVIEW'];
  const openTasks = await TaskInstanceModel.find({
    assigneeEmployeeId: { $in: employeeIds },
    status: { $in: openStatuses },
  }).select('assigneeEmployeeId').lean<OpenTaskRecord[]>();

  const workloadMap = new Map<string, number>();
  for (const id of employeeIds) {
    workloadMap.set(id, 0);
  }
  for (const ot of openTasks) {
    const assignee = String(ot.assigneeEmployeeId);
    workloadMap.set(assignee, (workloadMap.get(assignee) ?? 0) + 1);
  }

  // 4. KPI Framework match: roles with OPEN or PUBLISHED policy in task.kpiPeriod
  const policies = await PerformanceKpiPolicyModel.find({
    period: task.kpiPeriod,
    status: { $in: ['OPEN', 'PUBLISHED'] },
  }).select('role status').lean<PolicyRecord[]>();
  const activeRoles = new Set(policies.map((p) => String(p.role ?? '').toUpperCase()));

  // 5. Query user accounts to verify role/profile
  const users = await UserModel.find({
    employeeId: { $in: employees.map((e) => e._id) },
    status: 'active',
  }).select('employeeId authorization.profile').lean<UserAuthRecord[]>();
  const userProfileMap = new Map<string, string>();
  for (const u of users) {
    if (u.employeeId && u.authorization?.profile) {
      userProfileMap.set(String(u.employeeId), String(u.authorization.profile).toUpperCase());
    }
  }

  // 6. Evaluate suitability for each candidate
  const normalizedRequiredSkills = requiredSkills.map((s) => s.trim().toLowerCase());
  const candidates: TaskSuitabilityCandidate[] = [];

  for (const emp of employees) {
    const empId = String(emp._id).toLowerCase();
    const name = String(emp.fullName || emp.full_name || 'Nhân viên');
    const jobTitle = String(emp.job_title ?? '');
    const workloadOpen = workloadMap.get(String(emp._id)) ?? 0;
    const reasons: string[] = ['Cùng cửa hàng'];
    const constraints: string[] = [];

    // Role check
    const role = userProfileMap.get(String(emp._id)) || deriveBusinessRole(emp.job_title).toUpperCase();
    const hasFramework = activeRoles.size === 0 || activeRoles.has(role);

    // Skills match
    const empSkills = Array.isArray(emp.skills) ? emp.skills : [];
    const empSkillSet = new Set(empSkills.map((s: string) => s.trim().toLowerCase()));
    const matchedSkills = normalizedRequiredSkills.filter((s) => empSkillSet.has(s));
    const missingSkills = normalizedRequiredSkills.filter((s) => !empSkillSet.has(s));

    if (normalizedRequiredSkills.length > 0) {
      reasons.push(`${matchedSkills.length}/${normalizedRequiredSkills.length} kỹ năng khớp`);
      if (missingSkills.length > 0) {
        constraints.push(`Thiếu kỹ năng: ${missingSkills.join(', ')}`);
      }
    }

    if (hasFramework && activeRoles.size > 0) {
      reasons.push(`Khung KPI vai trò ${role} mở trong kỳ`);
    } else if (activeRoles.size > 0 && !hasFramework) {
      constraints.push(`Chưa có chính sách KPI cho vai trò ${role} trong kỳ`);
    }

    reasons.push(`Đang có ${workloadOpen} nhiệm vụ mở`);

    // Invariants & Suitability classification
    let suitability: TaskSuitabilityRating;

    if (emp.lifecyclePendingRequestId) {
      suitability = 'not_recommended';
      constraints.push('Đang trong quy trình điều chuyển / nhân sự (lifecycle pending)');
    } else if (emp.status !== 'active') {
      suitability = 'not_recommended';
      constraints.push('Hồ sơ không hoạt động');
    } else if (normalizedRequiredSkills.length > 0 && matchedSkills.length === 0) {
      suitability = 'not_recommended';
      constraints.push('Không có kỹ năng yêu cầu nào phù hợp');
    } else if (normalizedRequiredSkills.length > 0 && missingSkills.length > 0) {
      suitability = 'possible';
    } else {
      suitability = 'strong';
    }

    candidates.push({
      employeeId: empId,
      name,
      jobTitle,
      suitability,
      reasons,
      workloadOpen,
      constraints,
    });
  }

  // 7. Deterministic sort: (1) suitability: strong (0) -> possible (1) -> not_recommended (2); (2) workloadOpen asc; (3) employeeId asc
  candidates.sort((a, b) => {
    const rDiff = RATING_ORDER[a.suitability] - RATING_ORDER[b.suitability];
    if (rDiff !== 0) return rDiff;
    const wDiff = a.workloadOpen - b.workloadOpen;
    if (wDiff !== 0) return wDiff;
    return a.employeeId.localeCompare(b.employeeId);
  });

  return TaskSuitabilitySchema.parse({
    taskRef,
    candidates,
    generatedAt: options?.asOf ?? new Date().toISOString(),
    deterministic: true,
    advisory: true,
  });
}
