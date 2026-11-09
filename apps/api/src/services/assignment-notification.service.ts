import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { ProjectModel } from '../models/Project.js';
import { allowedStoreIds } from './authorization-scope.service.js';
import { projectReadScope } from './project-workflow.service.js';

type StoredAssignmentNotice = { id: string; message: string; at: string; recipients: string[] };

export function assignmentNoticeRecipients(user: AuthenticatedUser) {
  const storeRecipients = allowedStoreIds(user, 'assignment.review').map(id => 'store-managers:' + id);
  return user.employeeId ? ['employee:' + user.employeeId, ...storeRecipients] : storeRecipients;
}

export async function listScopedAssignmentNotices(user: AuthenticatedUser) {
  const allowed = assignmentNoticeRecipients(user);
  const projects = await ProjectModel.find({
    $and: [projectReadScope(user), { 'assignmentNotices.recipients': { $in: allowed } }],
  }).select('title assignmentNotices notificationReads').lean();
  return projects.flatMap(project => ((project.assignmentNotices ?? []) as StoredAssignmentNotice[])
    .filter(item => item.recipients.some(recipient => allowed.includes(recipient)))
    .map(item => ({
      id: String(item.id), projectId: String(project._id), projectTitle: project.title,
      message: String(item.message), at: String(item.at),
      read: (project.notificationReads ?? []).includes(user.userId + ':' + item.id),
    })));
}
