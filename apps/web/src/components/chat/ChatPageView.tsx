import { KpiActionDispatcher } from '../kpi-action-dispatcher';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from '../BrandMark';
import { ThemeToggle } from '../ThemeToggle';
import { ChatOnboarding, isOnboardingRequest } from './ChatOnboarding';
import { useChatInbox } from './ChatInbox';
import { useRevenueKpiChat } from './useRevenueKpiChat';
import { useWorkAndPerformanceChat } from './useWorkAndPerformanceChat';
import { useScheduleChat } from './useScheduleChat';
import { useOperationsAndHrChat } from './useOperationsAndHrChat';
import {
  WorkflowTracePanel,
  WORKFLOW_SUGGESTIONS,
  buildWorkflowTrace,
  type MessageWorkflowTrace,
} from './ChatWorkflowStream';
import { EmployeeLifecycleView } from '../EmployeeLifecycleView';
import {
  ChatLifecycle,
  isStaffingProposalRequest,
  isLifecycleExitRequest,
  isLifecycleReactivateRequest,
  isTransferConfirmRequest,
  isStaffingViewRequest,
  isTransferProposalRequest,
  isLifecycleReviewRequest,
  type ChatLifecycleMode,
} from './ChatLifecycle';
import { PerformanceKpiView } from '../PerformanceKpiView';
import '../../styles/crm-work.css';
import { apiFetch, API_BASE } from '../../services/auth';
import { newClientMessageId } from '../../services/api';
import { streamChat } from '../../services/chat-stream';
import { ChatConversationListSchema, ChatHistoryPageSchema, type ChatAction, type ChatConversationSummary, type ChatHistoryTurn } from '@hr-blockbot/contracts';
import type {
  Citation,
  Attachment,
} from '../../types/chat';

interface ChatPageViewProps {
  onSwitchTab: (tab: 'crm' | 'chat') => void;
  onLogout: () => void;
  notificationButton?: React.ReactNode;
  onNotificationsChanged: () => void;
  onboardingNotification?: { id: string } | null;
  onOnboardingNotificationOpened?: () => void;
}

interface ChatComposerProps {
  isTyping: boolean;
  onSend: (text: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  onboarding?: boolean;
  composerPlaceholder?: string;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  isTyping,
  onSend,
  inputRef: externalRef,
  onboarding,
  composerPlaceholder,
}) => {
  const [input, setInput] = useState('');
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
  }, [input]);

  const handleSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <div className="guta-chat-width" style={{ position: 'relative' }}>
      <form className="guta-chat-composer" onSubmit={handleSubmit}>
        <label htmlFor="copilot-message" className="sr-only">Tin nhắn cho Guta AI</label>
        <button type="button" className="chat-attach-btn" aria-label="Thao tác bổ sung" title="Nhập câu hỏi cho Guta AI" onClick={() => textareaRef.current?.focus()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14m-7-7h14" /></svg>
        </button>
        <textarea
          id="copilot-message"
          ref={textareaRef}
          rows={1}
          maxLength={2000}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={composerPlaceholder || (onboarding ? 'Nhập câu trả lời để tiếp nhận nhân viên…' : 'Hỏi AI về ca trực, nhân sự, tiền két...')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button className="chat-send" type="submit" aria-label="Gửi" disabled={isTyping || !input.trim()}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
        </button>
      </form>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', padding: '0 4px', gap: '8px', flexWrap: 'wrap' }}>
        <p className="guta-chat-note" style={{ margin: 0, textAlign: 'left' }}>{onboarding ? 'Gõ “hủy” để dừng. Hồ sơ chỉ được gửi khi bạn xác nhận.' : 'AI có thể nhầm lẫn. Kiểm tra nguồn trước khi quyết định.'}</p>
      </div>
    </div>
  );
};


interface Message {
  id: number | string;
  sender: 'user' | 'assistant';
  text: string;
  performanceKpi?: ChatHistoryTurn['performanceKpi'];
  citations?: Citation[];
  attachments?: Attachment[];
  proposedAction?: ChatAction | null;
}

type InlineMessage = Message & { after: Message['id'] | undefined };

// Workflow replies are session-local. A server history refresh replaces only the AI turns.
function interleaveMessages(messages: Message[], inline: InlineMessage[]) {
  const after = new Map<InlineMessage['after'], InlineMessage[]>();
  const ids = new Set(messages.map(message => message.id));
  for (const message of inline) {
    const anchor = message.after !== undefined && ids.has(message.after) ? message.after : undefined;
    const list = after.get(anchor) ?? [];
    list.push(message);
    after.set(anchor, list);
  }
  return [...(after.get(undefined) ?? []), ...messages.flatMap(message => [message, ...(after.get(message.id) ?? [])])];
}

// Gợi ý câu hỏi theo role: mỗi câu map vào một intent đã có trong gateway
// (pending actions, schedule, policy search, revenue KPI). Không câu nào
// cần logic mới — thêm câu mới chỉ khi intent tương ứng đã wire.
const ROLE_PROMPTS = {
  staff: [
    { label: 'Việc nào sắp đến hạn?', prompt: 'Việc nào của tôi sắp đến hạn?' },
    { label: 'Lịch làm tuần này', prompt: 'Lịch làm của tôi tuần này' },
    { label: 'Quy định đi trễ', prompt: 'Quy định đi trễ quá 15 phút' },
    { label: 'Biểu mẫu bàn giao ca', prompt: 'Cho tôi biểu mẫu bàn giao ca' },
  ],
  sm_am: [
    { label: 'Việc nào chờ tôi xử lý?', prompt: 'Việc nào đang chờ tôi xử lý?' },
    { label: 'KPI doanh thu cửa hàng', prompt: 'KPI doanh thu của cửa hàng tháng này' },
    { label: 'Quy trình xử lý két lệch', prompt: 'Quy trình xử lý két tiền lệch' },
    { label: 'Quy định nộp trễ doanh thu', prompt: 'Quy định xử phạt nộp trễ doanh thu' },
  ],
  hr: [
    { label: 'Kiểm tra trước khi chốt KPI', prompt: 'Kiểm tra trước khi chốt kỳ KPI doanh thu tháng trước' },
    { label: 'KPI doanh thu cần xử lý', prompt: 'KPI doanh thu cần xử lý' },
    { label: 'Quy chế chấm công', prompt: 'Quy chế chấm công và giải trình công hiện hành' },
    { label: 'Quy định nghỉ lễ', prompt: 'Quy định nghỉ lễ và ngày lễ GUTA' },
  ],
  system_admin: [
    { label: 'Tài liệu kỹ thuật đang lưu', prompt: 'Danh mục tài liệu kỹ thuật đang lưu' },
    { label: 'Trạng thái dịch vụ', prompt: 'Trạng thái dịch vụ' },
  ],
} as const;

function roleKey(profile: string | undefined | null): keyof typeof ROLE_PROMPTS {
  if (profile === 'staff' || profile === 'ptch') return 'staff';
  if (profile === 'sm' || profile === 'am' || profile === 'sam' || profile === 'om' || profile === 'aom') return 'sm_am';
  if (profile === 'hr') return 'hr';
  return 'system_admin';
}

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);

export function safeAttachmentUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) return null;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * A reply the demo cannot render (network failure, timeout, 5xx or a payload that
 * breaks the contract) means the AI pipeline is unusable, not that the user did
 * something wrong. Only an explicit 4xx is treated as a request problem.
 */
function isServiceFault(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch() could not reach the server
  if (error instanceof Error && error.name === 'AbortError') return true; // 20s timeout
  const httpStatus = error instanceof Error ? /^Chat HTTP (\d{3})$/.exec(error.message) : null;
  if (httpStatus) return Number(httpStatus[1]) >= 500;
  return true; // invalid reply payload
}



export const ChatPageView: React.FC<ChatPageViewProps> = ({ onSwitchTab, onLogout, notificationButton, onNotificationsChanged, onboardingNotification, onOnboardingNotificationOpened }) => {
  const { user } = useAuth();
  const profileLabel = user?.authorization?.profile || 'Chưa cấp profile';
  const canProposeOnboarding = user?.authorization?.capabilities?.includes('onboarding.propose');
  const canReviewOnboarding = user?.authorization?.capabilities?.includes('onboarding.review');
  const canProposeLifecycle = user?.authorization?.capabilities?.includes('employees.lifecycle_request');
  const canTransfer = user?.authorization?.capabilities?.includes('employees.transfer');
  const canReviewLifecycle = user?.authorization?.capabilities?.includes('employees.lifecycle_review');
  const canConfirmTransfer = user?.authorization?.stores?.some((s) => s.capabilities.includes('employees.transfer_confirm'));
  const isSmUser = user?.authorization?.profile === 'sm' || user?.authorization?.stores?.some((s) => s.capabilities.includes('onboarding.propose') || s.capabilities.includes('employees.lifecycle_request'));
  const isAmUser = user?.authorization?.profile === 'am' || canTransfer;
  const isHrUser = user?.authorization?.profile === 'hr' || canReviewLifecycle;

  const [intakePrompt, setIntakePrompt] = useState<string | null>(null);
  const [lifecyclePrompt, setLifecyclePrompt] = useState<{ prompt: string; mode: ChatLifecycleMode } | null>(null);
  const [lifecycleCrm, setLifecycleCrm] = useState<{ id?: string; mode: 'review' | 'awaiting_me'; key: number } | null>(null);
  const [kpiAction, setKpiAction] = useState<{ id: string; period: string; kind: string } | null>(null);

  const quickReplies = [
    { label: 'Thông báo nào cần xử lý?', prompt: 'Thông báo nào cần xử lý?' },
    ...ROLE_PROMPTS[roleKey(user?.authorization?.profile)],
    ...(canProposeOnboarding ? [{ label: 'Tiếp nhận nhân viên mới', prompt: 'Tiếp nhận nhân viên mới' }] : []),
    ...(canReviewOnboarding ? [{ label: 'Hồ sơ tiếp nhận nào chờ duyệt?', prompt: 'Hồ sơ tiếp nhận nào chờ duyệt?' }] : []),
    ...(isSmUser
      ? [
          { label: 'Xin bổ sung nhân sự', prompt: 'Xin bổ sung nhân sự' },
          { label: 'Đề xuất cho nhân viên nghỉ việc', prompt: 'Đề xuất cho nhân viên nghỉ việc' },
          { label: 'Đề xuất tái kích hoạt nhân viên', prompt: 'Đề xuất tái kích hoạt nhân viên' },
        ]
      : []),
    ...(canConfirmTransfer ? [{ label: 'Xác nhận điều chuyển nhân sự', prompt: 'Xác nhận điều chuyển nhân sự' }] : []),
    ...(isAmUser
      ? [
          { label: 'Xem yêu cầu bổ sung nhân sự từ SM', prompt: 'Xem yêu cầu bổ sung nhân sự từ SM' },
          { label: 'Điều chuyển nhân viên giữa 2 cửa hàng', prompt: 'Điều chuyển nhân viên giữa 2 cửa hàng' },
        ]
      : []),
    ...(isHrUser ? [{ label: 'Duyệt yêu cầu nhân sự', prompt: 'Duyệt yêu cầu nhân sự' }] : []),
    ...(user?.authorization?.capabilities?.some(cap => cap === 'revenue_kpi.read_self' || cap === 'revenue_kpi.read_scope')
      ? [{ label: 'KPI doanh thu tháng này', prompt: 'KPI doanh thu tháng này' }] : []),
    ...(user?.authorization?.capabilities?.includes('projects.assign')
      ? [{ label: 'Gợi ý người bằng PhoBERT', prompt: 'Ai phù hợp với công việc kiểm kê quầy pha chế cuối ca?' }] : []),
    ...(user?.authorization?.capabilities?.some(cap => cap === 'projects.assign' || cap === 'assignment.respond' || cap === 'reports.submit' || cap === 'reports.review')
      ? [{ label: 'Công việc & nghiệm thu', prompt: 'Danh sách công việc thường' }] : []),
    ...(user?.authorization?.capabilities?.some(cap => cap === 'task.respond' || cap === 'task.manage' || cap === 'performance_kpi.read_self' || cap === 'performance_kpi.read_scope')
      ? [
          { label: 'Công việc có thang điểm', prompt: 'Danh sách công việc có thang điểm tháng này' },
          { label: 'KPI hiệu suất của tôi', prompt: 'KPI hiệu suất của tôi tháng này' },
        ] : []),
    ...(user?.authorization?.capabilities?.some(cap => cap === 'schedules.read_self' || cap === 'schedules.read_store')
      ? [{ label: 'Bảng đăng ký ca tuần sau', prompt: 'Bảng đăng ký ca tuần sau' }] : []),
    ...(user?.authorization?.capabilities?.includes('dashboard.read')
      ? [{ label: 'Báo cáo bán hàng tháng này', prompt: 'Báo cáo bán hàng tháng này' }] : []),
    ...(user?.authorization?.capabilities?.includes('stores.read')
      ? [{ label: 'Danh sách chi nhánh', prompt: 'Danh sách chi nhánh cửa hàng' }] : []),
    ...(user?.authorization?.capabilities?.some(cap => cap === 'employees.read_operational' || cap === 'employees.read_hr')
      ? [{ label: 'Danh bạ nhân sự', prompt: 'Danh bạ nhân sự đang làm việc' }] : []),
    { label: 'Hồ sơ của tôi', prompt: 'Xem hồ sơ của tôi' },
    ...(user?.authorization?.capabilities?.some(cap => cap === 'delegations.request' || cap === 'delegations.review')
      ? [{ label: 'Ủy quyền nghiệp vụ', prompt: 'Danh sách ủy quyền nghiệp vụ' }] : []),
  ];
  const [messages, setMessages] = useState<Message[]>([]);
  const [inlineMessages, setInlineMessages] = useState<InlineMessage[]>([]);
  const inbox = useChatInbox({
    userId: user?.id, canReview: canReviewOnboarding,
    stores: user?.authorization?.stores ?? [], onChanged: onNotificationsChanged,
  });
  const revenue = useRevenueKpiChat({ grants: user?.authorization?.capabilities ?? [], onChanged: onNotificationsChanged });
  const workPerf = useWorkAndPerformanceChat({
    grants: user?.authorization?.capabilities ?? [],
    onChanged: onNotificationsChanged,
    onOpenKpiAction: target => setKpiAction(target),
  });
  const schedule = useScheduleChat({ grants: user?.authorization?.capabilities ?? [], onChanged: onNotificationsChanged });
  const opsHr = useOperationsAndHrChat({
    userId: user?.id,
    authorization: user?.authorization,
    onChanged: onNotificationsChanged,
  });
  const inlineBusy = inbox.busy || revenue.busy || workPerf.busy || schedule.busy || opsHr.busy;
  const lastFlow = useRef<'inbox' | 'revenue' | 'workPerf' | 'schedule' | 'opsHr'>();
  const displayMessages = interleaveMessages(messages, inlineMessages);
  const lastMessageId = messages[messages.length - 1]?.id;
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [workflowMode, setWorkflowMode] = useState(false);
  const [workflowTraces, setWorkflowTraces] = useState<Record<string, MessageWorkflowTrace>>({});
  const [activeStreamingTrace, setActiveStreamingTrace] = useState<MessageWorkflowTrace | null>(null);
  const streamStartMsRef = useRef<number>(Date.now());
  const chunkCountRef = useRef<number>(0);
  const lastPromptTextRef = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>();
  const nextId = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null), [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<string | undefined>();
  const [historyError, setHistoryError] = useState(''), [historyLoading, setHistoryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatConversationSummary | null>(null), [deleting, setDeleting] = useState(false);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const historySequence = useRef(0), listSequence = useRef(0), turns = useRef(new Map<string, ChatHistoryTurn>());
  const owner = useRef(user?.id); owner.current = user?.id;

  const cancelPending = () => {
    clearTimeout(timer.current!);
    timer.current = null;
    pending.current?.abort();
    pending.current = null;
    setIsStreaming(false);
  };

  useEffect(() => {
    headingRef.current?.focus();
    return cancelPending;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (deleteTarget) return;
      if (sidebarOpen) setSidebarOpen(false);
      else onSwitchTab('crm');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSwitchTab, sidebarOpen, deleteTarget]);
  useEffect(() => { if (!deleteTarget) return; const dialog = deleteDialog.current; dialog?.showModal(); return () => dialog?.close(); }, [deleteTarget]);

  useEffect(() => {
    const end = endRef.current;
    const last = end?.previousElementSibling;
    const body = end?.closest('.guta-chat-body');
    if (!inlineBusy && last?.hasAttribute('data-inline-message') && body && last.clientHeight > body.clientHeight) {
      last.scrollIntoView({ block: 'start' });
    } else end?.scrollIntoView({ behavior: 'auto' });
  }, [messages, inlineMessages, isTyping, inlineBusy]);

  const appendInline = (after: InlineMessage['after'], promptForTrace?: string) => (turn: Pick<Message, 'text' | 'sender'>) => {
    const id = 'inline:' + ++nextId.current;
    setInlineMessages(previous => [...previous, { ...turn, id, after }]);
    if (turn.sender === 'assistant') {
      const promptSource = promptForTrace || lastPromptTextRef.current || turn.text;
      const elapsed = Math.max(95, Date.now() - streamStartMsRef.current);
      const trace = buildWorkflowTrace({
        prompt: promptSource,
        profileLabel,
        capabilitiesCount: user?.authorization?.capabilities?.length ?? 0,
        storeCount: user?.authorization?.stores?.length ?? 0,
        status: 'completed',
        durationMs: elapsed,
        replyPreview: turn.text.slice(0, 140),
      });
      setWorkflowTraces(prev => ({ ...prev, [id]: trace }));
    }
  };

  const newChat = (focus = true) => {
    setIntakePrompt(null);
    setLifecyclePrompt(null);
    setLifecycleCrm(null);
    inbox.reset();
    revenue.reset();
    workPerf.reset();
    schedule.reset();
    opsHr.reset();
    lastFlow.current = undefined;
    setInlineMessages([]);
    setActiveStreamingTrace(null);
    cancelPending();
    historySequence.current++;
    turns.current.clear(); setSelectedConversation(undefined); setMessageCursor(null); setHistoryError(''); setHistoryLoading(false);
    conversationId.current = undefined;
    setMessages([]);
    setIsTyping(false);
    setIsStreaming(false);
    setAnnouncement('');
    if (focus) inputRef.current?.focus();
  };

  const mergeTurns = (items: ChatHistoryTurn[]) => {
    for (const turn of items) turns.current.set(turn.id, turn);
    const rows: Message[] = [];
    for (const turn of [...turns.current.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
      rows.push({ id: turn.id + ':user', sender: 'user', text: turn.userMessage });
      if (['QUEUED', 'PENDING'].includes(turn.status)) continue;
      rows.push({ id: turn.id + ':assistant', sender: 'assistant', text: turn.replyHidden
        ? 'Phản hồi cũ được ẩn vì quyền truy cập hoặc dữ liệu nguồn đã thay đổi. Bạn có thể hỏi lại với quyền hiện tại.'
        : turn.status === 'COMPLETED' ? turn.reply || 'Chưa tải được phản hồi đã lưu.'
        : 'Lượt trả lời bị gián đoạn hoặc chưa thành công. Câu hỏi đã được lưu; bạn có thể gửi lại.', citations: turn.citations, proposedAction: turn.replyHidden ? null : turn.proposedAction, performanceKpi: turn.replyHidden ? undefined : turn.performanceKpi });
    }
    setMessages(rows);
  };
  const loadConversations = async (before?: string) => {
    const seq = ++listSequence.current, userId = user?.id;
    try {
      const response = await apiFetch(`${API_BASE}/chat/conversations?limit=15${before ? '&before=' + encodeURIComponent(before) : ''}`);
      if (!response.ok) throw new Error();
      const data = ChatConversationListSchema.parse(await response.json());
      if (seq !== listSequence.current || owner.current !== userId) return [];
      setConversations(old => (before ? [...data.items, ...old.filter(item => !data.items.some(row => row.id === item.id))] : data.items).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)));
      setListCursor(data.nextCursor); return data.items;
    } catch { if (seq === listSequence.current && owner.current === userId) setHistoryError('Chưa tải được lịch sử. Các tin nhắn gửi thành công vẫn được lưu trên hệ thống.'); return []; }
  };
  const loadMessages = async (id: string, before?: string, silent = false) => {
    const seq = historySequence.current, userId = user?.id;
    if (!silent) setHistoryLoading(true);
    try {
      const response = await apiFetch(`${API_BASE}/chat/conversations/${encodeURIComponent(id)}/messages?limit=15${before ? '&before=' + encodeURIComponent(before) : ''}`);
      if (response.status === 404 && seq === historySequence.current && conversationId.current === id && owner.current === userId) {
        newChat(false); setConversations(old => old.filter(item => item.id !== id)); setHistoryError('Hội thoại đã được xóa hoặc không còn truy cập được.'); return;
      }
      if (!response.ok) throw new Error();
      const data = ChatHistoryPageSchema.parse(await response.json());
      if (seq !== historySequence.current || conversationId.current !== id || owner.current !== userId) return;
      mergeTurns(data.items); if (!silent || before) setMessageCursor(data.nextCursor);
      setHistoryError(''); setIsTyping(data.items.some(turn => ['QUEUED', 'PENDING'].includes(turn.status)));
    } catch { if (seq === historySequence.current && owner.current === userId) setHistoryError('Chưa mở được hội thoại. Hãy tải lại hoặc chọn hội thoại khác.'); }
    finally { if (seq === historySequence.current && owner.current === userId && !silent) setHistoryLoading(false); }
  };
  const openConversation = (id: string) => {
    setIntakePrompt(null);
    setLifecyclePrompt(null);
    setLifecycleCrm(null);
    inbox.reset();
    revenue.reset();
    workPerf.reset();
    schedule.reset();
    opsHr.reset();
    lastFlow.current = undefined;
    setInlineMessages([]);
    cancelPending();
    historySequence.current++;
    turns.current.clear();
    setMessages([]);
    setIsTyping(false);
    setIsStreaming(false);
    setServiceUnavailable(false);
    conversationId.current = id;
    setSelectedConversation(id);
    setSidebarOpen(false);
    setMessageCursor(null);
    setHistoryError('');
    setAnnouncement('');
    void loadMessages(id);
  };
  const removeConversation = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget, userId = user?.id;
    setDeleting(true); listSequence.current++;
    if (conversationId.current === target.id) { cancelPending(); historySequence.current++; }
    try {
      const response = await apiFetch(`${API_BASE}/chat/conversations/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
      if (response.status !== 204 && response.status !== 404) throw new Error();
      if (owner.current !== userId) return;
      listSequence.current++;
      if (conversationId.current === target.id) newChat(false);
      setConversations(old => old.filter(item => item.id !== target.id)); setDeleteTarget(null); setHistoryError('');
      void loadConversations();
    } catch {
      if (owner.current === userId) { setDeleteTarget(null); setHistoryError('Chưa xóa được hội thoại. Vui lòng thử lại.');
        if (conversationId.current === target.id) { setIsTyping(false); void loadMessages(target.id, undefined, true); } }
    } finally { if (owner.current === userId) setDeleting(false); }
  };
  useEffect(() => {
    newChat(false); setConversations([]); setListCursor(null); setDeleteTarget(null); setDeleting(false);
    const seq = historySequence.current;
    void loadConversations().then(items => { if (seq === historySequence.current && items[0]) openConversation(items[0].id); });
    return () => { historySequence.current++; listSequence.current++; cancelPending(); };
  }, [user?.id]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'hidden') return; void loadConversations(); if (conversationId.current && !pending.current) void loadMessages(conversationId.current, undefined, true); };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => { if (isTyping && !pending.current) refresh(); }, 2000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [selectedConversation, isTyping, user?.id]);

  useEffect(() => {
    if (!onboardingNotification || isTyping || historyLoading || inlineBusy || pending.current) return;
    if (canReviewOnboarding) {
      historySequence.current++;
      setIntakePrompt(null);
      setLifecyclePrompt(null);
      setLifecycleCrm(null);
      setKpiAction(null);
      setServiceUnavailable(false);
      revenue.reset();
      workPerf.reset();
      schedule.reset();
      opsHr.reset();
      lastFlow.current = 'inbox';
      inbox.openDetail(onboardingNotification.id, appendInline(lastMessageId));
    }
    onOnboardingNotificationOpened?.();
  }, [onboardingNotification, canReviewOnboarding, isTyping, historyLoading, inlineBusy, lastMessageId, onOnboardingNotificationOpened]);

  const send = async (prompt: string) => {
    const text = prompt.trim();
    if (!text || text.length > 2000 || pending.current || isTyping || inlineBusy || historyLoading) return;
    streamStartMsRef.current = Date.now();
    chunkCountRef.current = 0;
    lastPromptTextRef.current = text;
    if (isLifecycleReviewRequest(text) && isHrUser) {
      historySequence.current++;
      setLifecyclePrompt({ prompt: text, mode: 'HR_REVIEW' });
      setSidebarOpen(false);
      return;
    }
    if (isTransferConfirmRequest(text) && canConfirmTransfer) {
      historySequence.current++;
      setLifecyclePrompt({ prompt: text, mode: 'TRANSFER_CONFIRM' });
      setSidebarOpen(false);
      return;
    }
    if (isStaffingViewRequest(text) && isAmUser) {
      historySequence.current++;
      setLifecyclePrompt({ prompt: text, mode: 'STAFFING_VIEW' });
      setSidebarOpen(false);
      return;
    }
    if (isStaffingProposalRequest(text) && isSmUser) {
      historySequence.current++;
      setLifecyclePrompt({ prompt: text, mode: 'STAFFING_PROPOSAL' });
      setSidebarOpen(false);
      return;
    }
    if (isTransferProposalRequest(text) && canTransfer) {
      historySequence.current++;
      setLifecyclePrompt({ prompt: text, mode: 'TRANSFER_PROPOSAL' });
      setSidebarOpen(false);
      return;
    }
    if (isLifecycleExitRequest(text) && canProposeLifecycle) {
      historySequence.current++;
      setLifecyclePrompt({ prompt: text, mode: 'EXIT_PROPOSAL' });
      setSidebarOpen(false);
      return;
    }
    if (isLifecycleReactivateRequest(text) && canProposeLifecycle) {
      historySequence.current++;
      setLifecyclePrompt({ prompt: text, mode: 'REACTIVATE_PROPOSAL' });
      setSidebarOpen(false);
      return;
    }
    const append = appendInline(lastMessageId, text);
    const flow = lastFlow.current === 'inbox' && inbox.send(text, append) ? 'inbox'
      : lastFlow.current === 'workPerf' && workPerf.send(text, append, true) ? 'workPerf'
      : lastFlow.current === 'schedule' && schedule.send(text, append, true) ? 'schedule'
      : lastFlow.current === 'opsHr' && opsHr.send(text, append, true) ? 'opsHr'
      : revenue.send(text, append, lastFlow.current === 'revenue') ? 'revenue'
      : lastFlow.current !== 'workPerf' && workPerf.send(text, append, false) ? 'workPerf'
      : schedule.send(text, append, false) ? 'schedule'
      : opsHr.send(text, append, false) ? 'opsHr'
      : lastFlow.current !== 'inbox' && inbox.send(text, append) ? 'inbox' : undefined;
    if (flow) {
      lastFlow.current = flow;
      historySequence.current++;
      setSidebarOpen(false);
      setServiceUnavailable(false);
      return;
    }
    if (isOnboardingRequest(text)) {
      if (!canProposeOnboarding) {
        void send('Bạn chưa được cấp quyền tiếp nhận nhân viên mới. Vui lòng liên hệ quản lý.');
        return;
      }
      historySequence.current++;
      setIntakePrompt(text);
      setSidebarOpen(false);
      return;
    }
    historySequence.current++;
    const controller = new AbortController();
    const clientMessageId = newClientMessageId();
    const assistantMsgId = clientMessageId + ':assistant';
    const capabilitiesCount = user?.authorization?.capabilities?.length ?? 0;
    const storeCount = user?.authorization?.stores?.length ?? 0;
    pending.current = controller;
    setMessages((previous) => [...previous, { id: clientMessageId + ':user', sender: 'user', text }]);
    setIsTyping(true);
    setIsStreaming(false);
    setSidebarOpen(false);
    setAnnouncement('Đang gửi tin nhắn...');
    setActiveStreamingTrace(
      buildWorkflowTrace({
        prompt: text,
        profileLabel,
        capabilitiesCount,
        storeCount,
        status: 'streaming',
        activeStepIndex: 2,
      })
    );

    let accumulatedText = '';
    let streamFailed = false;
    let streamDone = false;
    const timeout = setTimeout(() => controller.abort(), 45000);
    timer.current = timeout;

    try {
      await streamChat({
        message: text,
        conversationId: conversationId.current,
        clientMessageId,
        signal: controller.signal,
        onAccepted: (payload) => {
          if (pending.current !== controller) return;
          if (payload.conversationId) {
            conversationId.current = payload.conversationId;
            setSelectedConversation(payload.conversationId);
          }
          setActiveStreamingTrace(
            buildWorkflowTrace({
              prompt: text,
              profileLabel,
              capabilitiesCount,
              storeCount,
              status: 'streaming',
              activeStepIndex: 3,
            })
          );
        },
        onChunk: (delta) => {
          if (pending.current !== controller) return;
          accumulatedText += delta;
          chunkCountRef.current += 1;
          setIsStreaming(true);
          const liveTrace = buildWorkflowTrace({
            prompt: text,
            profileLabel,
            capabilitiesCount,
            storeCount,
            status: 'streaming',
            activeStepIndex: 4,
            chunkCount: chunkCountRef.current,
            replyPreview: accumulatedText.slice(0, 140),
          });
          setActiveStreamingTrace(null);
          setWorkflowTraces((prev) => ({ ...prev, [assistantMsgId]: liveTrace }));
          setMessages((previous) => {
            const existingIndex = previous.findIndex((m) => m.id === assistantMsgId);
            if (existingIndex >= 0) {
              const updated = [...previous];
              updated[existingIndex] = { ...updated[existingIndex], text: accumulatedText };
              return updated;
            }
            return [...previous, { id: assistantMsgId, sender: 'assistant', text: accumulatedText }];
          });
        },
        onDone: (saved) => {
          if (pending.current !== controller) return;
          streamDone = true;
          setIsStreaming(false);
          setActiveStreamingTrace(null);
          const elapsed = Math.max(120, Date.now() - streamStartMsRef.current);
          const doneTrace = buildWorkflowTrace({
            prompt: text,
            profileLabel,
            capabilitiesCount,
            storeCount,
            status: 'completed',
            durationMs: elapsed,
            chunkCount: chunkCountRef.current,
            citationsCount: saved.turn.citations?.length ?? 0,
            hasProposedAction: Boolean(saved.turn.proposedAction),
            replyPreview: (saved.turn.reply || accumulatedText).slice(0, 140),
          });
          setWorkflowTraces((prev) => ({
            ...prev,
            [saved.turn.id + ':assistant']: doneTrace,
            [assistantMsgId]: doneTrace,
          }));
          conversationId.current = saved.conversationId;
          setSelectedConversation(saved.conversationId);
          mergeTurns([saved.turn]);
          setIsTyping(['QUEUED', 'PENDING'].includes(saved.turn.status));
          setServiceUnavailable(saved.turn.status === 'FAILED');
          setAnnouncement(`Guta AI: ${saved.turn.reply || 'Đã nhận phản hồi.'}`);
          void loadConversations();
        },
        onError: (errPayload) => {
          if (pending.current !== controller) return;
          streamFailed = true;
          setActiveStreamingTrace(null);
          setMessages((previous) => [
            ...previous.filter((m) => m.id !== assistantMsgId),
            { id: ++nextId.current, sender: 'assistant', text: errPayload.message || 'Lỗi kết nối máy chủ' },
          ]);
          setServiceUnavailable(errPayload.code === 'AI_SERVICE_UNAVAILABLE' || errPayload.code === 'LLM_UNAVAILABLE');
          setAnnouncement(`Lỗi: ${errPayload.message || 'Lỗi kết nối máy chủ'}`);
          setIsTyping(false);
          setIsStreaming(false);
        },
      });
    } catch (err: unknown) {
      if (pending.current !== controller) return;
      setActiveStreamingTrace(null);
      if (!streamFailed) {
        const message = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ';
        const unavailable = isServiceFault(err);
        setServiceUnavailable(unavailable);
        setMessages((previous) => [
          ...previous.filter((m) => m.id !== assistantMsgId),
          {
            id: ++nextId.current,
            sender: 'assistant',
            text: `Không thể kết nối đến máy chủ AI hoặc hệ thống đang bận (${message}). Vui lòng kiểm tra đường truyền và thử lại.`,
          },
        ]);
        setAnnouncement(`Không thể kết nối đến máy chủ AI hoặc hệ thống đang bận (${message}). Vui lòng kiểm tra đường truyền và thử lại.`);
        setIsTyping(false);
        setIsStreaming(false);
      }
    } finally {
      clearTimeout(timeout);
      if (timer.current === timeout) {
        timer.current = null;
      }
      if (pending.current === controller) {
        pending.current = null;
        if (!streamDone) {
          setIsTyping(false);
        }
        setIsStreaming(false);
      }
    }
  };

  const composer = (
    <ChatComposer
      isTyping={isTyping || historyLoading || inlineBusy}
      onSend={(text) => send(text)}
      inputRef={inputRef}
    />
  );

  return (
    <div className="guta-chat" data-testid="chat-page" data-workflow-mode={workflowMode ? 'true' : undefined}>
      <aside id="copilot-sidebar" className="guta-chat-sidebar" data-open={sidebarOpen} aria-label="Điều hướng hội thoại">
        <div className="guta-chat-brand"><BrandMark className="guta-chat-logo" alt="" />Guta Workspace</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className="chat-new"
            type="button"
            onClick={() => {
              setWorkflowMode(false);
              newChat();
            }}
          >
            Hội thoại mới
          </button>
          <button
            className="chat-workflow-btn"
            type="button"
            data-active={workflowMode ? 'true' : undefined}
            aria-pressed={workflowMode}
            onClick={() => {
              const nextMode = !workflowMode;
              setWorkflowMode(nextMode);
              setSidebarOpen(false);
              if (nextMode && displayMessages.length === 0) {
                inputRef.current?.focus();
              }
            }}
          >
            <span className="chat-workflow-btn-icon" aria-hidden="true">⚡</span>
            <span style={{ flex: 1 }}>Luồng làm việc</span>
            <span className="chat-workflow-btn-badge">{workflowMode ? 'ĐANG BẬT' : 'STREAM'}</span>
          </button>
        </div>
        <nav className="guta-chat-history" aria-label="Lịch sử hội thoại"><p className="guta-chat-sidebar-label">Hội thoại gần đây</p>
          {!conversations.length && <p className="guta-chat-note">Chưa có hội thoại đã lưu.</p>}
          {conversations.map(item => <div className="guta-chat-history-row" key={item.id}>
            <button type="button" aria-current={selectedConversation === item.id ? 'page' : undefined} onClick={() => openConversation(item.id)} title={item.title}>{item.title}</button>
            <button className="guta-chat-history-delete" type="button" aria-label={`Xóa hội thoại ${item.title}`} title="Xóa hội thoại" disabled={deleting} onClick={() => setDeleteTarget(item)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" /></svg>
            </button>
          </div>)}
          {listCursor && <button type="button" onClick={() => void loadConversations(listCursor)}>Hội thoại cũ hơn</button>}
        </nav>
        <footer>
          <button className="chat-back-crm" type="button" onClick={() => onSwitchTab('crm')}>Quay lại Vận Hành (CRM)</button>
          <button type="button" aria-label="Đăng Xuất Phiên" onClick={onLogout}>Đăng xuất</button>
        </footer>
      </aside>
      {deleteTarget && <dialog ref={deleteDialog} className="guta-chat-delete-dialog" aria-labelledby="chat-delete-title" aria-describedby="chat-delete-description" onCancel={event => { if (deleting) event.preventDefault(); else setDeleteTarget(null); }}>
        <h2 id="chat-delete-title">Xóa hội thoại?</h2>
        <p id="chat-delete-description">Hội thoại “{deleteTarget.title}” và các tin nhắn bên trong sẽ bị xóa khỏi lịch sử của bạn. Bạn không thể hoàn tác trên ứng dụng.</p>
        <div className="guta-chat-delete-actions">
          <button type="button" autoFocus disabled={deleting} onClick={() => setDeleteTarget(null)}>Hủy</button>
          <button type="button" disabled={deleting} onClick={() => void removeConversation()}>{deleting ? 'Đang xóa…' : 'Xóa hội thoại'}</button>
        </div>
      </dialog>}
      <main className="guta-chat-main" aria-label="Chat">
        <header className="guta-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button className="chat-menu" type="button" aria-label="Mở danh sách hội thoại" aria-expanded={sidebarOpen} aria-controls="copilot-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <div className="guta-chat-header-title">
              <strong>{workflowMode ? 'Chat · Luồng làm việc Backend' : 'Chat'}</strong>
              <span>{profileLabel}</span>
            </div>
            <div className="guta-chat-mode-switch" role="group" aria-label="Chế độ hiển thị Chat">
              <button
                type="button"
                className="guta-chat-mode-pill"
                data-active={!workflowMode ? 'true' : undefined}
                onClick={() => setWorkflowMode(false)}
              >
                💬 Chat tiêu chuẩn
              </button>
              <button
                type="button"
                className="guta-chat-mode-pill"
                data-active={workflowMode ? 'true' : undefined}
                onClick={() => setWorkflowMode(true)}
              >
                ⚡ Luồng làm việc
              </button>
            </div>
          </div>
          <div className="guta-chat-header-actions">
            <div className="guta-verified-badge">
              <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }} />
              <span style={{ fontWeight: 600, color: 'var(--chat-text)' }}>
                {profileLabel}
              </span>
            </div>
            {notificationButton}
            <ThemeToggle className="theme-toggle--chat" />
            <button type="button" aria-label="Quay lại CRM" onClick={() => onSwitchTab('crm')}>CRM</button>
          </div>
        </header>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
        {historyError && <p className="guta-chat-banner" role="status">{historyError}</p>}
        {historyLoading && <p className="guta-chat-note" role="status">Đang tải hội thoại đã lưu…</p>}
        {messageCursor && selectedConversation && <button type="button" className="btn" disabled={historyLoading} onClick={() => void loadMessages(selectedConversation, messageCursor)}>Xem tin nhắn cũ hơn</button>}
        {serviceUnavailable && (
          <div className="guta-chat-banner" data-testid="chat-service-unavailable">
            <strong>Demo an toàn · Dịch vụ AI chưa khả dụng</strong>
            <p>Bạn vẫn xem được dữ liệu CRM; phần trả lời AI cần backend.</p>
          </div>
        )}
        {intakePrompt ? (
          <ChatOnboarding prompt={intakePrompt} onExit={() => setIntakePrompt(null)}
            stores={user?.authorization?.stores.filter(store => store.capabilities.includes('onboarding.propose')) ?? []}
            renderComposer={(onSend, busy) => <ChatComposer onSend={onSend} isTyping={busy} onboarding />} />
        ) : lifecyclePrompt ? (
          <ChatLifecycle
            initialPrompt={lifecyclePrompt.prompt}
            mode={lifecyclePrompt.mode}
            stores={user?.authorization?.stores ?? []}
            onExit={() => setLifecyclePrompt(null)}
            onOpenLifecycleCrm={(id) => {
              setLifecyclePrompt(null);
              setLifecycleCrm({ id, mode: 'review', key: Date.now() });
            }}
            renderComposer={(onSend, busy, placeholder) => (
              <ChatComposer onSend={onSend} isTyping={busy} composerPlaceholder={placeholder} />
            )}
          />
        ) : lifecycleCrm ? (
          <div className="guta-chat-body" aria-label="Xử lý hồ sơ nhân sự trong chat">
            <div className="guta-chat-width">
              <button type="button" className="btn" onClick={() => setLifecycleCrm(null)}>Quay lại hội thoại</button>
              <EmployeeLifecycleView key={lifecycleCrm.key} chatMode={lifecycleCrm.mode} initialRequestId={lifecycleCrm.id} />
            </div>
          </div>
        ) : kpiAction ? (
          <div className="guta-chat-body" aria-label="Đánh giá hiệu suất trong chat">
            <div className="guta-chat-width">
              <button type="button" className="btn" onClick={() => setKpiAction(null)}>Quay lại hội thoại</button>
              <PerformanceKpiView key={kpiAction.id + kpiAction.kind} selectedPeriod={kpiAction.period} chatEvaluation={kpiAction} />
            </div>
          </div>
        ) : displayMessages.length === 0 && !inlineBusy ? (
          <section className="guta-chat-empty" aria-label="Bắt đầu hội thoại">
            <div className="guta-chat-width">
              <div className="guta-chat-hero">
                <BrandMark alt="Guta Workspace" width={48} height={48} />
                <h1 ref={headingRef} tabIndex={-1}>
                  {workflowMode ? 'Luồng làm việc & Kiểm toán Backend' : 'Chào mừng đến HR BlockBot'}
                </h1>
                <p>
                  {workflowMode
                    ? 'Trực quan hóa từng bước xử lý phía sau mỗi câu hỏi: Phân quyền ABAC → AI Gateway Router → Truy vấn MongoDB → Niêm phong SHA-256.'
                    : 'Cùng bạn điều phối ca trực, tra cứu nhân sự và đối soát tiền két.'}
                </p>
              </div>
              {composer}
              {workflowMode ? (
                <div className="guta-workflow-suggestions" aria-label="Câu hỏi gợi ý theo luồng làm việc">
                  <div className="guta-workflow-suggestions-head">
                    <span>CHỌN MỘT CÂU HỎI ĐỂ STREAM LUỒNG XỬ LÝ BACKEND CHI TIẾT ({profileLabel.toUpperCase()}):</span>
                  </div>
                  <div className="guta-workflow-suggestions-grid">
                    {WORKFLOW_SUGGESTIONS.map((item) => (
                      <button
                        type="button"
                        key={item.label}
                        className="guta-workflow-suggestion-card"
                        onClick={() => void send(item.prompt)}
                      >
                        <div className="guta-workflow-suggestion-top">
                          <span
                            className="guta-workflow-suggestion-cat"
                            style={{ borderColor: item.badgeColor, color: item.badgeColor }}
                          >
                            {item.category}
                          </span>
                          <span className="guta-workflow-suggestion-run">Chạy luồng →</span>
                        </div>
                        <strong className="guta-workflow-suggestion-title">{item.label}</strong>
                        <span className="guta-workflow-suggestion-flow">{item.flowSummary}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="guta-chat-prompts" aria-label="Gợi ý hành động nhanh theo vai trò">
                  <div style={{ width: '100%', textAlign: 'center', marginBottom: '8px', fontSize: '11px', color: 'var(--chat-muted)', letterSpacing: '0.04em' }}>
                    GỢI Ý TRONG PHẠM VI ĐƯỢC CẤP ({profileLabel}):
                  </div>
                  {quickReplies.map((item) => (
                    <button
                      type="button"
                      key={item.label}
                      title={item.prompt}
                      onClick={() => send(item.prompt)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            <div className="guta-chat-body" role="log" aria-label="Hội thoại">
              <div className="guta-chat-width">
                {displayMessages.map((message, msgIdx) => {
                  const prevUserMsg =
                    message.sender === 'assistant'
                      ? [...displayMessages.slice(0, msgIdx)].reverse().find((m) => m.sender === 'user')
                      : undefined;
                  const traceForMsg =
                    workflowMode && message.sender === 'assistant'
                      ? workflowTraces[String(message.id)] ??
                        buildWorkflowTrace({
                          prompt: prevUserMsg?.text || lastPromptTextRef.current || message.text,
                          profileLabel,
                          capabilitiesCount: user?.authorization?.capabilities?.length ?? 0,
                          storeCount: user?.authorization?.stores?.length ?? 0,
                          status: 'completed',
                          durationMs: 285,
                          citationsCount: message.citations?.length ?? 0,
                          hasProposedAction: Boolean(message.proposedAction),
                          replyPreview: message.text.slice(0, 140),
                        })
                      : null;

                  return (
                    <article className="guta-chat-message" data-sender={message.sender} data-inline-message={'after' in message ? true : undefined} key={message.id}>
                      <strong>{message.sender === 'user' ? 'Bạn' : 'Guta AI'}</strong>
                      <p>{message.text}</p>
                      {message.performanceKpi&&<section className="guta-chat-card" aria-label="Giải thích KPI hiệu suất"><strong>{['FINAL','CORRECTED'].includes(message.performanceKpi.status)?'Điểm chính thức':'Điểm tạm tính'} · {message.performanceKpi.period}</strong><p>{message.performanceKpi.score==null?'Chưa đủ dữ liệu':new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(message.performanceKpi.score)+' / 100'}</p><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{[['detail','Xem chi tiết'],...(message.performanceKpi.canReconsider?[['reconsideration','Kiến nghị']]:[]),...(message.performanceKpi.canAppeal?[['appeal','Khiếu nại']]:[])].map(([kind,label])=><button type="button" className="btn" key={kind} onClick={()=>setKpiAction({id:message.performanceKpi!.evaluationId,period:message.performanceKpi!.period,kind})}>{label}</button>)}</div><small>Xem hồ sơ hoặc xác nhận gửi yêu cầu ngay trong chat.</small></section>}
                      {!!message.citations?.length && <details className="guta-chat-card guta-chat-citation-details" aria-label="Trích dẫn">
                        <summary>
                          <strong>Căn cứ quy định (Citations)</strong>
                          <svg className="guta-chat-citation-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                        </summary>
                        <ul>{message.citations.map((citation, index) => <li key={index}>{citation.document}{citation.version ? ` · ${citation.version}` : ''}{citation.article ? ` · ${citation.article}` : ''}</li>)}</ul>
                      </details>}
                      {!!message.attachments?.length && (
                        <section className="guta-chat-card" aria-label="Tài liệu đính kèm" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <strong>Tài liệu & Biểu mẫu đính kèm (Attachments)</strong>
                          {message.attachments.map((att, index) => {
                            const isPdf = att.type === 'pdf';
                            const safeHref = safeAttachmentUrl(att.url);
                            return (
                              <div
                                key={index}
                                style={{
                                  display: 'flex',
                                  flexDirection: isPdf ? 'row' : 'column',
                                  alignItems: isPdf ? 'center' : 'stretch',
                                  justifyContent: isPdf ? 'space-between' : 'flex-start',
                                  gap: '10px',
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                              >
                                {isPdf ? (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      <span style={{ background: '#dc2626', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 6px', borderRadius: '4px', flexShrink: 0 }}>PDF</span>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.title}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--chat-muted)' }}>
                                          <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '1px 5px', borderRadius: '4px', marginRight: '6px' }}>Biểu mẫu GUTA</span>
                                          {att.fileName}
                                        </div>
                                      </div>
                                    </div>
                                    {safeHref && (
                                      <a
                                        href={safeHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: '6px',
                                          background: '#10b981',
                                          color: '#fff',
                                          fontSize: '12px',
                                          fontWeight: 600,
                                          textDecoration: 'none',
                                          whiteSpace: 'nowrap',
                                          flexShrink: 0,
                                        }}
                                      >
                                        Xem / Tải PDF
                                      </a>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>Ảnh tham chiếu</span>
                                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{att.title}</span>
                                    </div>
                                    {safeHref && (
                                      <a href={safeHref} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                        <img src={safeHref} alt={att.title} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', background: '#000', display: 'block' }} loading="lazy" />
                                      </a>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--chat-muted)' }}>
                                      <span>{att.fileName}</span>
                                      {safeHref && <a href={safeHref} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>Xem ảnh lớn ↗</a>}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </section>
                      )}
                      {message.proposedAction && (
                        <KpiActionDispatcher key={message.proposedAction.actionId} action={message.proposedAction} />
                      )}
                      {traceForMsg && <WorkflowTracePanel trace={traceForMsg} defaultExpanded />}
                    </article>
                  );
                })}
                {/* ponytail: CSS keyframes step carousel; add SSE streaming stage events when backend supports event-driven progress */}
                {isTyping && !isStreaming && (
                  <div className="guta-chat-status" role="status">
                    <div className="guta-thinking-avatar" aria-hidden="true">
                      <img src="/assets/logos/guta-mark-white.svg" alt="" />
                    </div>
                    <div className="guta-thinking-content">
                      <div className="guta-thinking-header">
                        <span className="guta-thinking-label">Đang phân tích dữ liệu ca trực...</span>
                        <span className="guta-thinking-dots" aria-hidden="true">
                          <span className="guta-thinking-dot" />
                          <span className="guta-thinking-dot" />
                          <span className="guta-thinking-dot" />
                        </span>
                      </div>
                      <div className="guta-thinking-steps" aria-hidden="true">
                        <span className="guta-thinking-step guta-step-1">Tra cứu quy chế Guta</span>
                        <span className="guta-thinking-step guta-step-2">Kiểm tra điều khoản</span>
                        <span className="guta-thinking-step guta-step-3">Soạn phản hồi</span>
                      </div>
                    </div>
                  </div>
                )}
                {isTyping && workflowMode && activeStreamingTrace && (
                  <WorkflowTracePanel trace={activeStreamingTrace} defaultExpanded />
                )}
                <div ref={endRef} />
              </div>
            </div>
            <div className="guta-chat-bottom">{composer}</div>
          </>
        )}
      </main>
    </div>
  );
};

export default ChatPageView;
