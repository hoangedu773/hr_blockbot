import { useEffect, useRef, useState, type ReactNode } from 'react';
import { OnboardingReviewSchema, type NotificationInboxItem, type NotificationSeverity } from '@hr-blockbot/contracts';
import { ApiError, fetchNotificationInbox, markNotificationRead, readAssignmentNotice, requestJson } from '../../services/api';

type ListPrompt =
  | { kind: 'notifications'; text: string }
  | { kind: 'pending'; text: string };
export type InboxPrompt = ListPrompt | { kind: 'detail'; id: string };

type OnboardingRow = {
  id: string;
  version: number;
  status: string;
  auditIntegrity?: string;
  requestedBy: string;
  storeId: string;
  payload: { fullName: string; employeeCode: string; phone: string; email?: string; hiredAt: string; reason?: string };
};
type Item = { notice: NotificationInboxItem } | { onboarding: OnboardingRow };
type Selection = { notice?: NotificationInboxItem; onboarding?: OnboardingRow };
type Review = { row: OnboardingRow; decision: 'APPROVE' | 'REJECT'; reason?: string };
type Turn = { sender: 'user' | 'assistant'; text: string };

const groups: { severity: NotificationSeverity; label: string }[] = [
  { severity: 'URGENT', label: 'Khẩn cấp' },
  { severity: 'ACTION_REQUIRED', label: 'Cần xử lý' },
  { severity: 'INFO', label: 'Thông tin' },
];
const states: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING_HR_REVIEW: 'Chờ HR duyệt', REJECTED: 'Đã từ chối',
  PROVISIONING: 'Đang tạo tài khoản', PENDING_ACTIVATION: 'Chờ nhân viên kích hoạt',
  ACTIVATING: 'Đang hoàn tất kích hoạt', ACTIVE: 'Đã kích hoạt',
};
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd')
    .trim().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
}

export function inboxIntent(text: string): ListPrompt | null {
  const command = normalize(text)
    .replace(/^cho (?:toi|minh) biet /, '')
    .replace(/\b(?:tbao|thong thao)\b/g, 'thong bao');
  if (/\b(?:ho so|de nghi) tiep nhan\b/.test(command)
    && /\b(?:duyet|xem|liet ke|danh sach|xu l[yi])\b/.test(command)
    && !/\b(?:quy trinh|quy dinh|huong dan|cach)\b/.test(command)) return { kind: 'pending', text };
  if (/^(?:(?:toi|minh|em) )?(?:(?:muon xem|cho (?:toi|minh)(?: xem)?|kiem tra|liet ke|hien(?: thi)?|doc|xem|co(?: bao nhieu)?) )?(?:tat ca )?(?:danh sach )?thong bao(?: (?:cua (?:toi|minh|em)|gi|nao|moi|chua doc|(?:dang )?(?:can|cho) xu l[yi]|khan(?: cap)?|thong tin))*(?: (?:khong|ko|k|nhe|voi|a|di))?$/.test(command)) {
    return { kind: 'notifications', text };
  }
  return null;
}

function itemNumber(command: string) {
  const target = command.replace(/^(?:(?:cho (?:toi|minh)|toi muon|hay) )?(?:doc|xem|mo)\b(?: chi tiet)? ?/, '')
    .replace(/^(?:chi tiet )?(?:thong bao|ho so|muc|cai|so|thu)(?: (?:thu|so))? /, '')
    .replace(/ (?:nhe|voi|di|a)$/, '');
  if (/^[1-9]\d*$/.test(target)) return Number(target);
  return ({ 'dau tien': 1, nhat: 1, hai: 2, ba: 3, tu: 4, nam: 5 } as Record<string, number>)[target];
}

function brief(body: string) {
  const line = body.replace(/\s+/g, ' ').trim();
  return line.length > 125 ? line.slice(0, 124).trimEnd() + '…' : line;
}

async function allNotices(signal: AbortSignal) {
  const limit = 100;
  const items = new Map<string, NotificationInboxItem>();
  let cursor: NotificationInboxItem | undefined;
  do {
    const page = await fetchNotificationInbox({ limit, cursor, signal });
    for (const item of page.items) items.set(item.source + ':' + item.id, item);
    if (page.items.length < limit) return [...items.values()];
    const next = page.items[limit - 1];
    if (next.id === cursor?.id && next.source === cursor?.source) throw new Error('Repeated inbox page');
    cursor = next;
  } while (!signal.aborted);
  return [];
}

async function allPending(signal: AbortSignal) {
  const rows: OnboardingRow[] = [];
  for (let page = 1; !signal.aborted; page++) {
    const result = await requestJson<{ items: OnboardingRow[]; paging: { hasNext: boolean } }>(
      '/onboarding/pending-review?page=' + page + '&limit=50', { signal },
    );
    rows.push(...result.items);
    if (!result.paging.hasNext) return rows;
  }
  return [];
}

export function ChatInbox({ start, userId, canReview, stores, onExit, onChanged, renderComposer }: {
  start: InboxPrompt;
  userId?: string;
  canReview?: boolean;
  stores: readonly { id: string; name: string }[];
  onExit: () => void;
  onChanged: () => void;
  renderComposer: (onSend: (text: string) => void, busy: boolean) => ReactNode;
}) {
  const [turns, setTurns] = useState<Turn[]>(() => start.kind === 'detail' ? [] : [{ sender: 'user', text: start.text }]);
  const [busy, setBusy] = useState(true);
  const inFlight = useRef(true);
  const controller = useRef<AbortController>();
  const items = useRef<Item[]>([]);
  const selected = useRef<Selection>();
  const review = useRef<Review>();
  const end = useRef<HTMLDivElement>(null);

  const say = (text: string) => setTurns(previous => [...previous, { sender: 'assistant', text }]);
  const storeName = (id: string) => stores.find(store => store.id === id)?.name ?? 'Cửa hàng trong hồ sơ';
  const canDecide = (row: OnboardingRow) => canReview && row.requestedBy !== userId
    && row.auditIntegrity === 'VALID_LOCAL_CHAIN' && row.status === 'PENDING_HR_REVIEW';

  async function showList(prompt: ListPrompt, signal: AbortSignal) {
    if (prompt.kind === 'pending') {
      if (!canReview) { say('Tài khoản của bạn chưa có quyền duyệt hồ sơ tiếp nhận.'); return; }
      const rows = await allPending(signal);
      if (signal.aborted) return;
      items.current = rows.map(onboarding => ({ onboarding }));
      selected.current = undefined;
      if (!rows.length) { say('Bạn không có hồ sơ tiếp nhận nào đang chờ duyệt.'); return; }
      say([
        `Bạn có ${rows.length} hồ sơ tiếp nhận chờ duyệt.`, '',
        ...rows.map((row, index) => `${index + 1}. ${row.payload.fullName} · ${storeName(row.storeId)}`),
        '', 'Bạn muốn xem hồ sơ nào? Ví dụ, nhắn “đọc mục 1”.',
      ].join('\n'));
      return;
    }

    const notices = await allNotices(signal);
    if (signal.aborted) return;
    selected.current = undefined;
    items.current = [];
    if (!notices.length) { say('Bạn chưa có thông báo nào.'); return; }
    const unread = notices.filter(notice => !notice.read).length;
    const unreadOnly = /\bchua doc\b/.test(normalize(prompt.text));
    const lines = [`Bạn có tổng cộng ${notices.length} thông báo (${unread} chưa đọc).`];
    if (unreadOnly) lines.push('Mình liệt kê các mục chưa đọc bên dưới.');
    for (const { severity, label } of groups) {
      const matching = notices.filter(notice => notice.severity === severity);
      lines.push('', `${label} (${matching.length})`);
      for (const notice of matching) {
        if (unreadOnly && notice.read) continue;
        const number = items.current.push({ notice });
        lines.push(`${number}. ${notice.title} · ${brief(notice.body)}`);
      }
    }
    if (items.current.length) lines.push('', 'Bạn muốn đọc thông báo nào? Ví dụ, nhắn “đọc mục 1”.');
    say(lines.join('\n'));
  }

  async function showDetail(item: Item | undefined, signal: AbortSignal, id?: string) {
    selected.current = undefined;
    const notice = item && 'notice' in item ? item.notice : undefined;
    const onboardingId = id ?? (item && 'onboarding' in item ? item.onboarding.id
      : notice?.entityKind === 'onboarding' && canReview ? notice.entityId : undefined);
    const lines: string[] = [];
    if (notice) {
      const severity = groups.find(group => group.severity === notice.severity)?.label;
      lines.push(notice.title, `${severity} · ${dateTime.format(new Date(notice.createdAt))} · ${notice.read ? 'Đã đọc' : 'Chưa đọc'}`, '', notice.body);
    }
    let row: OnboardingRow | undefined;
    if (onboardingId) {
      try {
        row = await requestJson<OnboardingRow>('/onboarding/' + encodeURIComponent(onboardingId), { signal });
      } catch (error) {
        if (!notice || !(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
        lines.push('', 'Hồ sơ liên quan hiện không còn trong phạm vi bạn được xem.');
      }
    }
    if (signal.aborted) return;
    selected.current = { notice, onboarding: row };
    if (row) {
      const payload = row.payload;
      if (lines.length) lines.push('');
      lines.push(`Hồ sơ ${payload.fullName} · ${payload.employeeCode}`,
        storeName(row.storeId), `Trạng thái · ${states[row.status] ?? 'Chưa xác định'}`,
        `Ngày vào làm · ${new Date(payload.hiredAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
      if (payload.phone) lines.push(`Điện thoại · ${payload.phone}`);
      if (payload.email) lines.push(`Email · ${payload.email}`);
      if (payload.reason) lines.push(`Lý do đề nghị · ${payload.reason}`);
      if (canDecide(row)) lines.push('', 'Bạn có thể nhắn “duyệt hồ sơ này” hoặc “từ chối hồ sơ này”.');
    }
    if (notice && !notice.read) lines.push('', 'Nhắn “đánh dấu đã đọc” để cập nhật thông báo này.');
    say(lines.join('\n'));
  }

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    const task = start.kind === 'detail' ? showDetail(undefined, request.signal, start.id) : showList(start, request.signal);
    void task.catch(() => {
      if (!request.signal.aborted) say('Mình chưa tải được dữ liệu. Bạn có thể hỏi lại hoặc quay về hội thoại.');
    }).finally(() => {
      if (!request.signal.aborted) { inFlight.current = false; setBusy(false); }
    });
    return () => request.abort();
  }, [start]);
  useEffect(() => {
    if (busy) return;
    const lastReply = end.current?.previousElementSibling;
    const body = end.current?.closest('.guta-chat-body');
    if (lastReply && body && lastReply.clientHeight > body.clientHeight) lastReply.scrollIntoView({ block: 'start' });
    else end.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  async function send(text: string) {
    const signal = controller.current?.signal;
    if (inFlight.current || !signal || signal.aborted) return;
    const command = normalize(text);
    if (/^(?:quay lai(?: hoi thoai)?|thoat)$/.test(command)) { onExit(); return; }
    setTurns(previous => [...previous, { sender: 'user', text }]);
    if (/^(?:huy|dung lai|thoi)$/.test(command)) {
      if (!review.current) { onExit(); return; }
      review.current = undefined;
      say('Đã hủy quyết định. Hồ sơ vẫn giữ nguyên trạng thái.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const pending = review.current;
      if (pending) {
        const confirmation = /^(?:toi )?(?:dong y|xac nhan)(?: (duyet|tu choi))?$/.exec(command);
        const label = pending.decision === 'APPROVE' ? 'duyệt' : 'từ chối';
        if (!pending.reason) {
          if (confirmation) { say(`Bạn cho mình biết lý do ${label} hồ sơ trước nhé.`); return; }
          pending.reason = text;
          say(`Bạn sẽ ${label} hồ sơ của ${pending.row.payload.fullName}.\nLý do · ${text}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }
        if (!confirmation || (confirmation[1] && confirmation[1] !== normalize(label))) {
          say(`Quyết định đang chờ là ${label}. Nhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }
        if (!canDecide(pending.row)) {
          review.current = undefined;
          say('Hồ sơ này hiện không thể duyệt hoặc từ chối bằng tài khoản của bạn.');
          return;
        }
        const body = OnboardingReviewSchema.parse({
          decision: pending.decision, reason: pending.reason, expectedVersion: pending.row.version,
        });
        review.current = undefined;
        const result = await requestJson<OnboardingRow>('/onboarding/' + encodeURIComponent(pending.row.id) + '/review', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
        });
        if (signal.aborted) return;
        selected.current = { ...selected.current, onboarding: result };
        say(`Đã ${label} hồ sơ của ${result.payload.fullName}. Trạng thái hiện tại · ${states[result.status] ?? 'Đã ghi nhận quyết định'}.`);
        onChanged();
        return;
      }

      const list = inboxIntent(text);
      if (list && !/\b(?:nay|do)\b/.test(command)) { await showList(list, signal); return; }
      const current = selected.current;
      const decision = /^(?:(?:toi|minh) (?:muon |se )?)?(duyet|phe duyet|tu choi)(?: (?:ho so|de nghi)(?: tiep nhan)?(?: (?:nay|do))?| (?:muc|cai) (?:nay|do))?$/.exec(command);
      if (decision) {
        const row = current?.onboarding;
        if (!row || !canDecide(row)) { say('Hãy đọc một hồ sơ đang chờ bạn duyệt trước. Ví dụ, nhắn “hồ sơ tiếp nhận cần duyệt”, rồi chọn số hồ sơ.'); return; }
        review.current = { row, decision: decision[1] === 'tu choi' ? 'REJECT' : 'APPROVE' };
        say(`Bạn cho mình biết lý do ${decision[1] === 'tu choi' ? 'từ chối' : 'duyệt'} hồ sơ của ${row.payload.fullName} nhé.`);
        return;
      }
      if (/^(?:danh dau |chuyen sang )?da doc(?: (?:thong bao|muc)(?: nay| do)?)?$/.test(command)) {
        const notice = current?.notice;
        if (!notice) { say('Bạn chọn đọc một thông báo trước nhé.'); return; }
        if (!notice.read) {
          if (notice.source === 'notification') await markNotificationRead(notice.id);
          else if (notice.entityId) await readAssignmentNotice(notice.entityId, notice.id);
          if (signal.aborted) return;
          notice.read = true;
          onChanged();
        }
        say(`Đã đánh dấu đã đọc thông báo “${notice.title}”.`);
        return;
      }
      const number = itemNumber(command);
      if (number !== undefined) {
        const item = items.current[number - 1];
        if (item) await showDetail(item, signal);
        else say('Mục này chưa có trong danh sách vừa hiện. Bạn chọn lại số giúp mình nhé.');
        return;
      }
      say('Bạn có thể nhắn “đọc mục 2”, “xem thông báo của tôi” hoặc “hồ sơ tiếp nhận cần duyệt”.');
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && [403, 404, 409].includes(error.status)) {
        selected.current = undefined;
        say(`${error.message} Bạn có thể hỏi lại để kiểm tra trạng thái mới nhất.`);
      } else {
        say('Chưa nhận được kết quả. Bạn hãy đọc lại mục đó để kiểm tra trạng thái trước khi thử lại.');
      }
    } finally {
      if (!signal.aborted) { inFlight.current = false; setBusy(false); }
    }
  }

  return <>
    <div className="guta-chat-body" role="log" aria-label="Thông báo và hồ sơ trong chat">
      <div className="guta-chat-width">
        {turns.map((turn, index) => <article className="guta-chat-message" data-sender={turn.sender} key={index}>
          <strong>{turn.sender === 'user' ? 'Bạn' : 'Guta AI'}</strong>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{turn.text}</p>
        </article>)}
        {busy && <p role="status">Đang xử lý…</p>}
        <div ref={end} />
      </div>
    </div>
    <div className="guta-chat-bottom">
      <div className="guta-chat-width"><button type="button" className="btn" disabled={busy} onClick={onExit}>Quay lại hội thoại</button></div>
      {renderComposer(text => void send(text), busy)}
    </div>
  </>;
}
