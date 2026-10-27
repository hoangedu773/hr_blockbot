import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, API_BASE } from '../../services/auth';
import {
  type Citation,
  type ProposedAction,
  type Attachment,
  type ModelTier,
  MODEL_TIER_CONFIG,
  getSafeModelTier,
  ROLE_CONFIG,
  ROLE_QUICK_REPLIES,
  ModelPickerPopover,
} from './ChatDrawer';
export { type ModelTier, MODEL_TIER_CONFIG, getSafeModelTier };

interface ChatPageViewProps {
  onSwitchTab: (tab: 'crm' | 'chat') => void;
  onLogout: () => void;
}

interface ChatComposerProps {
  isTyping: boolean;
  onSend: (text: string) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  modelTier: ModelTier;
  onModelTierChange: (tier: ModelTier) => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  isTyping,
  onSend,
  inputRef: externalRef,
  modelTier,
  onModelTierChange,
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
          maxLength={4000}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Hỏi AI về ca trực, nhân sự, tiền két..."
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
        <p className="guta-chat-note" style={{ margin: 0, textAlign: 'left' }}>AI có thể nhầm lẫn. Kiểm tra nguồn trước khi quyết định.</p>
        <ModelPickerPopover tier={modelTier} onChange={onModelTierChange} />
      </div>
    </div>
  );
};


interface Message {
  id: number;
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  attachments?: Attachment[];
  proposedAction?: ProposedAction | null;
}

const TOPICS = [
  { title: 'Gợi ý điều động ca', prompt: 'Chi nhánh nào đang thiếu người ca trưa nay?' },
  { title: 'Quy định kỷ luật', prompt: 'Kiểm tra quy định đi trễ quá 15 phút' },
  { title: 'Báo cáo két ca', prompt: 'Tổng hợp doanh thu két sáng toàn chuỗi' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseReply(value: unknown): Omit<Message, 'id' | 'sender'> & { conversationId?: string } {
  if (!isRecord(value) || typeof value.reply !== 'string' || !value.reply.trim()) {
    throw new Error('Invalid chat reply');
  }
  const citations: Citation[] = [];
  if (value.citations != null) {
    if (!Array.isArray(value.citations)) throw new Error('Invalid citations');
    for (const item of value.citations) {
      if (!isRecord(item) || typeof item.document !== 'string' || !item.document.trim()
        || (item.version !== undefined && typeof item.version !== 'string')
        || (item.article !== undefined && typeof item.article !== 'string')
        || (item.score !== undefined && (typeof item.score !== 'number' || !Number.isFinite(item.score)))) {
        throw new Error('Invalid citation');
      }
      citations.push({
        document: item.document,
        version: item.version as string | undefined,
        article: item.article as string | undefined,
        score: item.score as number | undefined,
      });
    }
  }
  const attachments: Attachment[] = [];
  if (value.attachments != null) {
    if (!Array.isArray(value.attachments)) throw new Error('Invalid attachments');
    for (const item of value.attachments) {
      if (!isRecord(item) || typeof item.title !== 'string' || typeof item.url !== 'string') {
        continue;
      }
      attachments.push({
        title: item.title,
        type: item.type === 'image' ? 'image' : 'pdf',
        url: item.url,
        fileName: typeof item.fileName === 'string' && item.fileName ? item.fileName : item.url.split('/').pop() || 'document',
      });
    }
  }
  let proposedAction: ProposedAction | null = null;
  if (value.proposedAction != null) {
    const action = value.proposedAction;
    if (!isRecord(action) || typeof action.type !== 'string' || !action.type.trim()
      || (action.preview !== undefined && typeof action.preview !== 'string')
      || (action.actionId !== undefined && typeof action.actionId !== 'string')
      || (action.args !== undefined && !isRecord(action.args))) {
      throw new Error('Invalid proposed action');
    }
    proposedAction = {
      type: action.type,
      preview: action.preview as string | undefined,
      actionId: action.actionId as string | undefined,
      status: 'pending',
    };
  }
  if (value.conversationId != null && (typeof value.conversationId !== 'string' || !value.conversationId.trim())) {
    throw new Error('Invalid conversation ID');
  }
  return { text: value.reply, citations, attachments, proposedAction, conversationId: value.conversationId as string | undefined };
}


const styles = `
.guta-chat {
  animation: guta-view-enter 220ms cubic-bezier(0.23, 1, 0.32, 1) both;
  --chat-bg: #171717; --chat-sidebar: #111111; --chat-card: #1e1e1e;
  --chat-text: #f5f5f5; --chat-muted: #b4b4b4; --chat-border: rgba(255, 255, 255, 0.1);
  --chat-accent: #ffffff; --chat-focus: rgba(255, 255, 255, 0.3); --chat-hover: rgba(255, 255, 255, 0.08);
  --chat-font: var(--font-sans, 'Geist', system-ui, sans-serif);
  display: flex; height: 100dvh; overflow: hidden; background: var(--chat-bg);
  color: var(--chat-text); font: 16px/1.6 var(--chat-font); color-scheme: dark;
}
.guta-chat *, .guta-chat *::before, .guta-chat *::after { box-sizing: border-box; }
.guta-chat button, .guta-chat textarea { font: inherit; color: inherit; }
.guta-chat button { min-height: 44px; min-width: 44px; cursor: pointer; border: 1px solid transparent; border-radius: 12px; background: transparent; padding: 8px 16px; text-align: left; }
.guta-chat button:focus-visible, .guta-chat textarea:focus-visible { outline: 2px solid var(--chat-focus); outline-offset: 3px; }
.guta-chat button:active:not(:disabled) { background: var(--chat-hover); }
.guta-chat button:disabled { opacity: .5; cursor: not-allowed; }
.guta-chat .chat-primary { background: var(--chat-accent); color: #000000; }
.guta-chat .chat-primary:active:not(:disabled), .guta-chat .chat-send:active:not(:disabled) { background: #dedede; }
.guta-chat-sidebar { width: 256px; flex-shrink: 0; background: var(--chat-sidebar); border-right: 1px solid var(--chat-border); display: flex; flex-direction: column; gap: 24px; padding: 24px 16px; overflow-y: auto; }
.guta-chat-brand { display: flex; align-items: center; gap: 8px; padding: 0 8px; font-weight: 700; }
.guta-chat-logo { width: 32px; height: 32px; object-fit: contain; }
.guta-chat-sidebar .chat-new { border-color: var(--chat-border); }
.guta-chat-sidebar nav { display: flex; flex-direction: column; gap: 8px; }
.guta-chat-sidebar nav p { margin: 0 0 8px; padding: 0 16px; font-size: 12px; color: var(--chat-muted); }
.guta-chat-sidebar nav button { font-size: 14px; white-space: nowrap; }
.guta-chat-sidebar footer { margin-top: auto; display: grid; gap: 8px; }
.guta-chat-sidebar footer button { font-size: 14px; padding: 8px; white-space: nowrap; }
.guta-chat .chat-back-crm { border-color: var(--chat-border); background: var(--chat-hover); transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background-color 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.guta-chat .chat-back-crm:active:not(:disabled) { transform: scale(0.98); }
.guta-chat-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.guta-chat-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 72px; padding: 16px 24px; flex-wrap: wrap; }
.guta-chat-header-title { display: flex; flex-direction: column; gap: 2px; }
.guta-chat-header strong { font-size: 16px; }
.guta-chat-header span { font-size: 12px; color: var(--chat-muted); }
.guta-chat-header-actions { display: flex; align-items: center; gap: 12px; }
.guta-verified-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--chat-border); font-size: 11px; }
.guta-chat-model-tier { display: inline-flex; align-items: center; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--chat-border); border-radius: 9999px; padding: 3px; gap: 2px; }
.guta-chat-model-btn:hover:not(:disabled) { color: var(--chat-text); background: var(--chat-hover); }
.guta-chat-model-btn[data-active="true"] { background: var(--chat-accent) !important; color: #000000 !important; font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
.guta-chat-header .chat-menu { display: none; }
.guta-chat-body { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; }
.guta-chat-width { width: 100%; max-width: 768px; margin: 0 auto; }
.guta-chat-empty { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; justify-content: center; padding: 24px; }
.guta-chat-hero { text-align: center; margin-bottom: 32px; }
.guta-chat-hero img { width: 48px; height: 48px; margin: 0 auto 24px; object-fit: contain; }
.guta-chat h1, .guta-chat h1:focus, .guta-chat h1:focus-visible { outline: none !important; border: none !important; box-shadow: none !important; }
.guta-chat h1 { font-size: clamp(24px, 3vw, 32px); line-height: 1.25; font-weight: 600; font-style: normal; letter-spacing: -.03em; margin: 0 0 16px; }
.guta-chat-hero p { color: var(--chat-muted); margin: 0; }
.guta-chat-prompts { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 24px; }
.guta-chat-prompts button { border-color: var(--chat-border); font-size: 14px; white-space: nowrap; border-radius: 999px; }
.guta-chat-composer { display: flex; align-items: center; gap: 10px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 9999px; padding: 6px 8px 6px 14px; }
.guta-chat-composer:focus-within { border-color: rgba(255, 255, 255, 0.28); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4); }
.guta-chat .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.guta-chat-composer textarea { display: block; flex: 1; min-width: 0; min-height: 44px; max-height: 192px; resize: none; background: transparent; border: none !important; outline: none !important; box-shadow: none !important; padding: 10px 0; font-size: 14px; line-height: 24px; overflow-y: auto; }
.guta-chat-composer textarea::placeholder { color: var(--chat-muted); opacity: 1; }
.guta-chat .chat-send, .guta-chat .chat-attach-btn { flex-shrink: 0; border-radius: 9999px; width: 44px; height: 44px; min-width: 44px; min-height: 44px; border: none; padding: 0; display: flex; align-items: center; justify-content: center; }
.guta-chat .chat-attach-btn { color: rgba(255, 255, 255, 0.6); background: transparent; }
.guta-chat .chat-send { background: var(--chat-accent); color: #000000; transition: none; }
.guta-chat .chat-send:disabled { opacity: 1; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.3); }
.guta-chat-note { text-align: center; font-size: 12px; color: var(--chat-muted); margin: 16px 0 0; }
.guta-chat-bottom { padding: 16px 24px max(16px, env(safe-area-inset-bottom)); }
.guta-chat-message { margin-bottom: 32px; overflow-wrap: anywhere; }
.guta-chat-message > p { white-space: pre-wrap; margin: 8px 0 0; }
.guta-chat-message[data-sender="user"] { margin-left: auto; padding: 16px 24px; border-radius: 24px; background: var(--chat-card); width: fit-content; max-width: 90%; }
.guta-chat-message strong { font-size: 14px; }
.guta-chat-card { border: 1px solid var(--chat-border); border-radius: 16px; padding: 16px; margin-top: 16px; background: var(--chat-card); }
.guta-chat-card p { margin: 8px 0; }
.guta-chat-card ul { margin: 8px 0 0; padding-left: 24px; font-size: 14px; color: var(--chat-muted); }
.guta-chat-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.guta-chat-actions button { font-size: 14px; border-color: var(--chat-border); white-space: nowrap; }
.guta-chat-status { display: flex; align-items: flex-start; gap: 12px; padding: 14px 18px; border-radius: 16px; background: rgba(255, 255, 255, 0.04); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); color: #a1a1aa; margin: 16px 0; width: fit-content; max-width: 480px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05); animation: guta-thinking-enter 220ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.guta-thinking-avatar { width: 32px; height: 32px; flex-shrink: 0; border-radius: 10px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); display: flex; align-items: center; justify-content: center; animation: guta-aura-pulse 2.4s cubic-bezier(0.23, 1, 0.32, 1) infinite; }
.guta-thinking-avatar img { width: 18px; height: 18px; object-fit: contain; }
.guta-thinking-content { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
.guta-thinking-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.guta-thinking-label { font-size: 13px; font-weight: 500; color: #e4e4e7; letter-spacing: -0.01em; line-height: 1.4; }
.guta-thinking-dots { display: inline-flex; align-items: center; gap: 3.5px; }
.guta-thinking-dot { width: 4px; height: 4px; border-radius: 9999px; background: #a1a1aa; animation: guta-dot-pulse 1.4s cubic-bezier(0.23, 1, 0.32, 1) infinite both; }
.guta-thinking-dot:nth-child(1) { animation-delay: 0s; }
.guta-thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.guta-thinking-dot:nth-child(3) { animation-delay: 0.4s; }
.guta-thinking-shimmer-bar { width: 100%; max-width: 200px; height: 2px; border-radius: 9999px; background: rgba(255, 255, 255, 0.06); position: relative; overflow: hidden; margin: 1px 0; }
.guta-thinking-shimmer-line { position: absolute; inset: 0; width: 100%; height: 100%; background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.35) 50%, transparent 100%); transform: translateX(-100%); animation: guta-shimmer-sweep 2s cubic-bezier(0.23, 1, 0.32, 1) infinite; }
.guta-thinking-steps { position: relative; height: 16px; font-size: 11px; line-height: 16px; color: #71717a; overflow: hidden; }
.guta-thinking-step { position: absolute; top: 0; left: 0; white-space: nowrap; opacity: 0; transform: translateY(3px); will-change: opacity, transform; }
.guta-step-1 { opacity: 1; transform: translateY(0); animation: guta-step-cycle-1 6s cubic-bezier(0.23, 1, 0.32, 1) infinite; }
.guta-step-2 { animation: guta-step-cycle-2 6s cubic-bezier(0.23, 1, 0.32, 1) infinite; }
.guta-step-3 { animation: guta-step-cycle-3 6s cubic-bezier(0.23, 1, 0.32, 1) infinite; }
@keyframes guta-thinking-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes guta-aura-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.08), 0 0 8px rgba(255, 255, 255, 0.04); } 50% { box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06), 0 0 16px rgba(255, 255, 255, 0.12); } }
@keyframes guta-dot-pulse { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1.2); background-color: #ffffff; } }
@keyframes guta-shimmer-sweep { 0% { transform: translateX(-100%); } 50%, 100% { transform: translateX(100%); } }
@keyframes guta-step-cycle-1 { 0%, 28% { opacity: 1; transform: translateY(0); } 33.33%, 94% { opacity: 0; transform: translateY(-3px); } 95%, 100% { opacity: 1; transform: translateY(0); } }
@keyframes guta-step-cycle-2 { 0%, 28% { opacity: 0; transform: translateY(3px); } 33.33%, 61% { opacity: 1; transform: translateY(0); } 66.66%, 100% { opacity: 0; transform: translateY(-3px); } }
@keyframes guta-step-cycle-3 { 0%, 61% { opacity: 0; transform: translateY(3px); } 66.66%, 94% { opacity: 1; transform: translateY(0); } 98%, 100% { opacity: 0; transform: translateY(-3px); } }
@keyframes guta-sparkle-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
.guta-model-sparkle { animation: guta-sparkle-pulse 2.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .guta-chat-status { animation: none !important; }
  .guta-thinking-avatar { animation: none !important; }
  .guta-thinking-dot { animation: none !important; opacity: 0.8 !important; }
  .guta-thinking-shimmer-line { animation: none !important; display: none !important; }
  .guta-step-1 { animation: none !important; opacity: 1 !important; transform: none !important; position: static !important; }
  .guta-step-2, .guta-step-3 { display: none !important; }
  .guta-model-sparkle { animation: none !important; }
}
.guta-chat-sidebar, .guta-chat-body, .guta-chat-empty, .guta-chat textarea { scrollbar-width: thin; scrollbar-color: var(--chat-border) transparent; }
@media (hover: hover) and (pointer: fine) {
  .guta-chat button:hover:not(:disabled) { background: var(--chat-hover); }
  .guta-chat .chat-attach-btn:hover { color: var(--chat-accent); }
  .guta-chat .chat-primary:hover:not(:disabled), .guta-chat .chat-send:hover:not(:disabled) { background: #dedede; }
}
@media (max-width: 767px) {
  .guta-chat-sidebar { display: none; position: absolute; top: 72px; bottom: 0; left: 0; z-index: 2; width: min(280px, 100%); box-shadow: 16px 0 32px rgba(0, 0, 0, 0.25); }
  .guta-chat-sidebar[data-open="true"] { display: flex; }
  .guta-chat-header { padding: 8px 16px; }
  .guta-chat-header .chat-menu { display: block; }
  .guta-chat-header-title span { display: none; }
  .guta-chat-body, .guta-chat-empty { padding: 16px; }
  .guta-chat-empty { justify-content: safe center; }
  .guta-chat-bottom { padding: 8px 16px max(16px, env(safe-area-inset-bottom)); }
  .guta-chat-hero { margin-bottom: 24px; }
}
@media (max-width: 480px) {
  .guta-chat-header { padding: 8px 12px; gap: 8px; }
  .guta-chat-header-actions { gap: 4px; }
  .guta-chat-header-actions button { padding: 6px 10px; text-align: center; }
  .guta-verified-badge { padding: 4px 6px !important; }
  .guta-verified-badge span:last-child { display: none; }
}
`;

export const ChatPageView: React.FC<ChatPageViewProps> = ({ onSwitchTab, onLogout }) => {
  const { user } = useAuth();
  const currentRole: 'Admin' | 'Employee' = user?.role === 'Admin' ? 'Admin' : 'Employee';
  const [messages, setMessages] = useState<Message[]>([]);
  const [modelTier, setModelTier] = useState<ModelTier>(getSafeModelTier);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>();
  const nextId = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const cancelPending = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current?.abort();
    pending.current = null;
  };

  useEffect(() => {
    headingRef.current?.focus();
    return cancelPending;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (sidebarOpen) setSidebarOpen(false);
      else onSwitchTab('crm');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSwitchTab, sidebarOpen]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages, isTyping]);

  const newChat = () => {
    cancelPending();
    conversationId.current = undefined;
    setMessages([]);
    setIsTyping(false);
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const send = (prompt: string) => {
    const text = prompt.trim();
    if (!text || text.length > 4000 || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setMessages((previous) => [...previous, { id: ++nextId.current, sender: 'user', text }]);
    setIsTyping(true);
    setSidebarOpen(false);
    // Preserve the delay and cancel it on reset/unmount before starting a request.
    timer.current = setTimeout(async () => {
      timer.current = null;
      const timeout = setTimeout(() => controller.abort(), 20000);
      let reply: ReturnType<typeof parseReply>;
      try {
        const response = await apiFetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversationId: conversationId.current,
            modelTier,
            model: MODEL_TIER_CONFIG[modelTier].id,
            role: currentRole,
            userContext: { role: currentRole },
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
        const data: unknown = await response.json();
        reply = parseReply(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ';
        reply = {
          text: `Không thể kết nối đến máy chủ AI hoặc hệ thống đang bận (${message}). Vui lòng kiểm tra đường truyền và thử lại.`,
        };
      } finally {
        clearTimeout(timeout);
      }
      if (pending.current !== controller) return;
      pending.current = null;
      if (reply.conversationId) conversationId.current = reply.conversationId;
      setMessages((previous) => [...previous, { ...reply, id: ++nextId.current, sender: 'assistant' }]);
      setIsTyping(false);
    }, 600);
  };

  const confirm = (id: number, approved: boolean) => {
    setMessages((previous) => previous.map((message) => message.id === id && message.proposedAction?.status === 'pending'
      ? { ...message, proposedAction: { ...message.proposedAction, status: approved ? 'confirmed' : 'cancelled' } }
      : message));
  };

  const composer = (
    <ChatComposer
      isTyping={isTyping}
      onSend={(text) => send(text)}
      inputRef={inputRef}
      modelTier={modelTier}
      onModelTierChange={(newTier) => {
        setModelTier(newTier);
        try { localStorage.setItem('guta_model_tier', newTier); } catch { /* ignore quota/private */ }
      }}
    />
  );

  return (
    <div className="guta-chat" data-testid="chat-page">
      <style>{styles}</style>
      <aside id="copilot-sidebar" className="guta-chat-sidebar" data-open={sidebarOpen} aria-label="Điều hướng Copilot">
        <div className="guta-chat-brand"><img className="guta-chat-logo" src="/assets/logos/guta-mark-pure.svg" alt="" />HR-BlockBot Workspace</div>
        <button className="chat-new" type="button" onClick={newChat}>+ New Chat</button>
        <nav aria-label="Gợi ý theo vai trò">
          <p>GỢI Ý · {ROLE_CONFIG[currentRole].badge.toUpperCase()}</p>
          {ROLE_QUICK_REPLIES[currentRole].map((item) => (
            <button
              type="button"
              key={item.label}
              disabled={isTyping}
              title={item.prompt}
              onClick={() => send(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <nav aria-label="Chủ đề mẫu">
          <p>CHỦ ĐỀ MẪU</p>
          {TOPICS.map((topic) => (
            <button type="button" key={topic.title} disabled={isTyping} onClick={() => send(topic.prompt)}>
              {topic.title}
            </button>
          ))}
        </nav>
        <footer>
          <button className="chat-back-crm" type="button" onClick={() => onSwitchTab('crm')}>Quay lại Vận Hành (CRM)</button>
          <button type="button" aria-label="Đăng Xuất Phiên" onClick={onLogout}>Đăng xuất</button>
        </footer>
      </aside>
      <main className="guta-chat-main" aria-label="HR-BlockBot AI Copilot">
        <header className="guta-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="chat-menu" type="button" aria-label="Menu Copilot" aria-expanded={sidebarOpen} aria-controls="copilot-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <div className="guta-chat-header-title">
              <strong>HR-BlockBot AI Copilot</strong>
              <span>{ROLE_CONFIG[currentRole].label} · {MODEL_TIER_CONFIG[modelTier].desc}</span>
            </div>
          </div>
          <div className="guta-chat-header-actions">
            <div className="guta-verified-badge">
              <span style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#10b981' }} />
              <span style={{ fontWeight: 600, color: 'var(--chat-text)' }}>
                {user?.role === 'Admin' ? 'Quản trị viên (Admin)' : 'Nhân viên (Employee)'}
              </span>
            </div>
            <button type="button" aria-label="Quay lại CRM" onClick={() => onSwitchTab('crm')}>CRM</button>
          </div>
        </header>
        {messages.length === 0 ? (
          <section className="guta-chat-empty" aria-label="Bắt đầu hội thoại">
            <div className="guta-chat-width">
              <div className="guta-chat-hero">
                <img src="/assets/logos/guta-mark-pure.svg" alt="HR-BlockBot Logo" />
                <h1 ref={headingRef} tabIndex={-1}>Chào mừng HR-BlockBot AI Copilot</h1>
                <p>Cùng bạn điều phối ca trực, tra cứu nhân sự và đối soát tiền két.</p>
              </div>
              {composer}
              <div className="guta-chat-prompts" aria-label="Gợi ý hành động nhanh theo vai trò">
                <div style={{ width: '100%', textAlign: 'center', marginBottom: '8px', fontSize: '11px', color: 'var(--chat-muted)', letterSpacing: '0.04em' }}>
                  GỢI Ý NHANH CHO {ROLE_CONFIG[currentRole].label.toUpperCase()} ({ROLE_CONFIG[currentRole].badge}):
                </div>
                {ROLE_QUICK_REPLIES[currentRole].map((item) => (
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
            </div>
          </section>
        ) : (
          <>
            <div className="guta-chat-body" role="log" aria-label="Hội thoại" aria-live="polite" aria-relevant="additions text">
              <div className="guta-chat-width">
                {messages.map((message) => (
                  <article className="guta-chat-message" data-sender={message.sender} key={message.id}>
                    <strong>{message.sender === 'user' ? 'Bạn' : 'Guta AI'}</strong>
                    <p>{message.text}</p>
                    {!!message.citations?.length && <section className="guta-chat-card" aria-label="Trích dẫn">
                      <strong>Căn cứ quy định (Citations)</strong>
                      <ul>{message.citations.map((citation, index) => <li key={index}>{citation.document}{citation.version ? ` · ${citation.version}` : ''}{citation.article ? ` · ${citation.article}` : ''}</li>)}</ul>
                    </section>}
                    {!!message.attachments?.length && (
                      <section className="guta-chat-card" aria-label="Tài liệu đính kèm" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <strong>Tài liệu & Biểu mẫu đính kèm (Attachments)</strong>
                        {message.attachments.map((att, index) => {
                          const isPdf = att.type === 'pdf';
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
                                  <a
                                    href={att.url}
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
                                </>
                              ) : (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px' }}>Ảnh tham chiếu</span>
                                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{att.title}</span>
                                  </div>
                                  <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                    <img src={att.url} alt={att.title} style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', background: '#000', display: 'block' }} loading="lazy" />
                                  </a>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--chat-muted)' }}>
                                    <span>{att.fileName}</span>
                                    <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>Xem ảnh lớn ↗</a>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </section>
                    )}
                    {message.proposedAction && <section className="guta-chat-card" aria-label="Đề xuất hành động">
                      <strong>Đề xuất hành động (Confirm-before-write)</strong>
                      <p>{message.proposedAction.preview || message.proposedAction.type}</p>
                      <p>Chỉ ghi nhận lựa chọn tại giao diện. Chưa gửi lệnh hoặc thay đổi dữ liệu.</p>
                      {message.proposedAction.status === 'pending' ? <div className="guta-chat-actions">
                        <button className="chat-primary" type="button" onClick={() => confirm(message.id, true)}>Xác Nhận (Confirm)</button>
                        <button type="button" onClick={() => confirm(message.id, false)}>Từ Chối</button>
                      </div> : <p role="status">{message.proposedAction.status === 'confirmed' ? 'Đã xác nhận đề xuất. Chưa thực thi.' : 'Đã từ chối hành động. Không có dữ liệu nào bị thay đổi.'}</p>}
                    </section>}
                  </article>
                ))}
                {/* ponytail: CSS keyframes step carousel; add SSE streaming stage events when backend supports event-driven progress */}
                {isTyping && (
                  <div className="guta-chat-status" role="status">
                    <div className="guta-thinking-avatar" aria-hidden="true">
                      <img src="/assets/logos/guta-mark-pure.svg" alt="" />
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
                      <div className="guta-thinking-shimmer-bar" aria-hidden="true">
                        <div className="guta-thinking-shimmer-line" />
                      </div>
                      <div className="guta-thinking-steps" aria-hidden="true">
                        <span className="guta-thinking-step guta-step-1">Tra cứu quy chế Guta</span>
                        <span className="guta-thinking-step guta-step-2">Kiểm tra điều khoản</span>
                        <span className="guta-thinking-step guta-step-3">Soạn phản hồi</span>
                      </div>
                    </div>
                  </div>
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
