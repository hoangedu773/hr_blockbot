import type { NotificationGroup, NotificationInboxItem } from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { listScopedAssignmentNotices } from './assignment-notification.service.js';
import { listNotifications } from './notification.service.js';

type InboxCursor = Pick<NotificationInboxItem, 'createdAt' | 'source' | 'id'>;

function position(item: InboxCursor) {
  return item.createdAt + '|' + (item.source === 'assignment' ? '1' : '0') + item.id;
}

export async function listNotificationInbox(user: AuthenticatedUser, options: {
  group?: NotificationGroup;
  unreadOnly: boolean;
  limit: number;
  cursor?: InboxCursor;
}) {
  const { group, cursor, unreadOnly, limit } = options;
  const [standalone, assignments] = await Promise.all([
    listNotifications(user.userId, {
      group, unreadOnly, limit, before: cursor?.createdAt,
      beforeId: cursor?.source === 'notification' ? cursor.id : undefined,
      includeBefore: cursor?.source === 'assignment',
    }),
    !group || group === 'work' ? listScopedAssignmentNotices(user) : [],
  ]);
  const notices: NotificationInboxItem[] = standalone.items.map(({ readAt, ...item }) => ({
    ...item, read: readAt !== null, source: 'notification',
  }));
  const before = cursor ? position(cursor) : null;
  for (const entry of assignments) {
    if (unreadOnly && entry.read) continue;
    const item: NotificationInboxItem = {
      id: entry.id, source: 'assignment', read: entry.read, type: 'system',
      title: ('Phân công · ' + entry.projectTitle).slice(0, 200), body: entry.message,
      channel: 'in_app', entityKind: 'project', entityId: entry.projectId,
      severity: 'INFO', actionRef: null, createdAt: entry.at,
    };
    if (!before || position(item) < before) notices.push(item);
  }
  return {
    items: notices.sort((a, b) => position(a) < position(b) ? 1 : position(a) > position(b) ? -1 : 0).slice(0, limit),
    unread: standalone.unread + assignments.filter(item => !item.read).length,
  };
}
