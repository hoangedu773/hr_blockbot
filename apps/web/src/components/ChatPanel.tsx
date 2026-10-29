import React, { useEffect, useRef, useState } from 'react';
import type { Citation } from '@hr-blockbot/contracts';
import { useAuth } from '../context/AuthContext';
import { createConversation } from '../services/api';
import {
  ChatSocketClient,
  type ChatActionProposal,
  type ChatChunkEvent,
  type ChatErrorEvent,
} from '../services/chatSocket';

/**
 * Six required panel states from the phase plan. The panel only ever enters
 * `abstain`/`degraded` when the server says so - no local guessing, no fake
 * citations, no fake "confirm" buttons.
 */
type ChatViewState = 'idle' | 'sending' | 'streaming' | 'abstain' | 'error' | 'degraded';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

interface ChatTurn {
  clientMessageId: string;
  role: 'user' | 'assistant';
  text: string;
  citations: Citation[];
  proposal: ChatActionProposal | null;
  proposalDecision: 'approved' | 'rejected' | null;
  streaming: boolean;
  done: boolean;
}

/** Error codes that mean "no LLM available": structured/degraded rendering. */
const DEGRADED_CODES = new Set([
  'LLM_UNAVAILABLE',
  'QUOTA_EXCEEDED',
  'MAX_STEPS',
  'TOOL_TIMEOUT',
  'AI_SERVICE_UNAVAILABLE',
]);

const SUGGESTIONS = [
  'Chính sách nghỉ phép năm nay quy định thế nào?',
  'Đi muộn bị xử lý theo điều khoản nào?',
  'Hạn nộp báo cáo đề tài là khi nào?',
];

const STATE_META: Record<ChatViewState, { label: string; chip: string }> = {
  idle: { label: 'Sẵn sàng', chip: 'chip--ok' },
  sending: { label: 'Đang gửi…', chip: 'chip--warn' },
  streaming: { label: 'Đang nhận câu trả lời…', chip: 'chip--info' },
  abstain: { label: 'Không đủ bằng chứng', chip: 'chip--warn' },
  error: { label: 'Lỗi', chip: 'chip--err' },
  degraded: { label: 'Không có LLM', chip: 'chip--err' },
};

function toCitation(data: unknown): Citation | null {
  if (!data || typeof data !== 'object') return null;
  const candidate = data as Partial<Citation>;
  if (
    typeof candidate.document !== 'string' ||
    typeof candidate.version !== 'string' ||
    typeof candidate.article !== 'string' ||
    typeof candidate.score !== 'number'
  ) {
    return null;
  }
  return {
    document: candidate.document,
    version: candidate.version,
    article: candidate.article,
    score: candidate.score,
  };
}

function toProposal(data: unknown): ChatActionProposal | null {
  if (!data || typeof data !== 'object') return null;
  const candidate = data as Partial<ChatActionProposal>;
  if (typeof candidate.actionId !== 'string' || typeof candidate.type !== 'string') return null;
  // P2-9: `ActionProposalData` (contracts) requires `args` + `preview`; the
  // runtime payload is still unvalidated, so fill honest defaults here.
  return {
    actionId: candidate.actionId,
    type: candidate.type,
    args:
      candidate.args && typeof candidate.args === 'object' && !Array.isArray(candidate.args)
        ? (candidate.args as Record<string, unknown>)
        : {},
    preview: typeof candidate.preview === 'string' ? candidate.preview : '',
  };
}

function mergeCitations(current: Citation[], incoming: Citation[]): Citation[] {
  const merged = [...current];
  for (const citation of incoming) {
    const exists = merged.some(
      (item) =>
        item.document === citation.document &&
        item.version === citation.version &&
        item.article === citation.article
    );
    if (!exists) merged.push(citation);
  }
  return merged;
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) nodes.push(line.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${tokenIndex++}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c${tokenIndex++}`}
          style={{ fontFamily: 'var(--mono)', fontSize: '12px', background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px' }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

/** Minimal, XSS-safe markdown: paragraphs, `- ` lists, **bold**, `code`. */
function renderMarkdown(text: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="bubble__list">
        {items.map((item, index) => (
          <li key={`li-${index}`}>{renderInline(item, `ul-${blocks.length}-${index}`)}</li>
        ))}
      </ul>
    );
  };

  text.split('\n').forEach((line, index) => {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2));
      return;
    }
    flushBullets();
    if (line.trim().length === 0) return;
    blocks.push(
      <p key={`p-${index}`} style={{ margin: blocks.length === 0 ? 0 : '6px 0 0' }}>
        {renderInline(line, `p-${index}`)}
      </p>
    );
  });
  flushBullets();
  return blocks;
}

export const ChatPanel: React.FC = () => {
  const { accessToken } = useAuth();
  const socketRef = useRef<ChatSocketClient | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [viewState, setViewState] = useState<ChatViewState>('idle');
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [connectionMessage, setConnectionMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [degradedReason, setDegradedReason] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [lastQuestion, setLastQuestion] = useState<string>('');
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [conversationWarning, setConversationWarning] = useState<string>('');
  const conversationPromiseRef = useRef<Promise<string | null> | null>(null);
  const conversationCreateFailedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!accessToken) return;

    const patchAssistant = (clientMessageId: string, patch: (turn: ChatTurn) => ChatTurn) => {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.role === 'assistant' && turn.clientMessageId === clientMessageId ? patch(turn) : turn
        )
      );
    };

    const client = new ChatSocketClient({
      onConnect: () => {
        setConnection('connected');
        setConnectionMessage('');
      },
      onDisconnect: () => {
        setConnection('reconnecting');
        setConnectionMessage('Mất kết nối tới realtime gateway — đang kết nối lại…');
      },
      onConnectError: (message) => {
        setConnection('reconnecting');
        setConnectionMessage(`Không kết nối được realtime gateway: ${message}`);
      },
      onAccepted: () => {
        setViewState((previous) => (previous === 'degraded' || previous === 'error' ? previous : 'streaming'));
      },
      onChunk: (event: ChatChunkEvent) => {
        setViewState('streaming');
        patchAssistant(event.clientMessageId, (turn) => {
          if (event.kind === 'text') {
            return { ...turn, text: turn.text + (event.delta ?? ''), streaming: true };
          }
          if (event.kind === 'citation') {
            const citation = toCitation(event.data);
            if (!citation) return turn;
            return { ...turn, citations: mergeCitations(turn.citations, [citation]), streaming: true };
          }
          const proposal = toProposal(event.data);
          return proposal ? { ...turn, proposal, streaming: true } : turn;
        });
      },
      onDone: (event) => {
        patchAssistant(event.clientMessageId, (turn) => ({
          ...turn,
          citations: event.citations ? mergeCitations(turn.citations, event.citations) : turn.citations,
          streaming: false,
          done: true,
        }));

        if (event.finishReason === 'ABSTAIN') {
          setViewState('abstain');
          setErrorMessage('');
          setDegradedReason('');
        } else if (event.finishReason === 'ERROR') {
          setViewState('error');
          setErrorMessage('Máy chủ báo lỗi khi xử lý câu hỏi (finishReason=ERROR).');
        } else {
          setViewState('idle');
        }
      },
      onError: (event: ChatErrorEvent) => {
        setTurns((prev) =>
          prev.map((turn, index, list) => {
            if (turn.role !== 'assistant') return turn;
            const isTarget = event.clientMessageId
              ? turn.clientMessageId === event.clientMessageId
              : index === list.length - 1;
            return isTarget ? { ...turn, streaming: false, done: true } : turn;
          })
        );
        if (DEGRADED_CODES.has(event.code)) {
          setViewState('degraded');
          setDegradedReason(`${event.code}: ${event.message}`);
          setErrorMessage('');
        } else {
          setViewState('error');
          setErrorMessage(`${event.code}: ${event.message}`);
        }
      },
    });

    socketRef.current = client;
    client.connect(accessToken);

    return () => {
      client.disconnect();
      socketRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns, viewState]);

  const ensureConversation = async (): Promise<string | null> => {
    const client = socketRef.current;
    if (!client) return null;
    const existing = client.currentConversationId;
    if (existing) return existing;
    if (conversationCreateFailedRef.current) return null;

    if (!conversationPromiseRef.current) {
      conversationPromiseRef.current = createConversation()
        .then((conversation) => {
          client.setConversationId(conversation.id);
          setConversationWarning('');
          return conversation.id;
        })
        .catch((err: unknown) => {
          conversationCreateFailedRef.current = true;
          setConversationWarning(
            `Không tạo được phiên hội thoại qua REST (${
              err instanceof Error ? err.message : 'lỗi không rõ'
            }). chat:send sẽ gửi không kèm conversationId để máy chủ tự xử lý.`
          );
          return null;
        })
        .finally(() => {
          conversationPromiseRef.current = null;
        });
    }
    return conversationPromiseRef.current;
  };

  const submit = async (text: string) => {
    const trimmed = text.trim();
    const client = socketRef.current;
    if (trimmed.length === 0 || !client || !client.isConnected) return;

    // Phase 2 contract: `conversationId` for `chat:send` is the `id` returned by
    // POST /api/conversations. Create it lazily on the first message; if the
    // endpoint is not live yet, send without it and surface the real error.
    await ensureConversation();

    const payload = client.send(trimmed);
    setTurns((prev) => [
      ...prev,
      {
        clientMessageId: payload.clientMessageId,
        role: 'user',
        text: trimmed,
        citations: [],
        proposal: null,
        proposalDecision: null,
        streaming: false,
        done: true,
      },
      {
        clientMessageId: payload.clientMessageId,
        role: 'assistant',
        text: '',
        citations: [],
        proposal: null,
        proposalDecision: null,
        streaming: false,
        done: false,
      },
    ]);
    setDraft('');
    setLastQuestion(trimmed);
    setErrorMessage('');
    setDegradedReason('');
    setOpenCitation(null);
    setViewState('sending');
  };

  const decideProposal = (turn: ChatTurn, approve: boolean) => {
    if (!turn.proposal) return;
    socketRef.current?.confirmAction(turn.proposal.actionId, approve);
    setTurns((prev) =>
      prev.map((item) =>
        item.clientMessageId === turn.clientMessageId && item.role === 'assistant'
          ? { ...item, proposalDecision: approve ? 'approved' : 'rejected' }
          : item
      )
    );
    setViewState('sending');
  };

  const stateMeta = STATE_META[viewState];
  const isBusy = viewState === 'sending' || viewState === 'streaming';
  const lastAssistant = [...turns].reverse().find((turn) => turn.role === 'assistant');
  const abstainDocuments =
    lastAssistant && viewState === 'abstain'
      ? Array.from(new Set(lastAssistant.citations.map((citation) => `${citation.document} (${citation.version})`)))
      : [];

  return (
    <div className="chat-shell" data-chat-state={viewState}>
      <div className="chat-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Trợ Lý Chính Sách</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            Hợp đồng WS chat:* · câu trả lời phải kèm trích dẫn hoặc từ chối trả lời
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span className="chip" data-testid="chat-connection">
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background:
                  connection === 'connected' ? 'var(--emerald)' : connection === 'connecting' ? 'var(--amber)' : 'var(--rose)',
              }}
            />
            {connection === 'connected' ? 'Đã kết nối' : connection === 'connecting' ? 'Đang kết nối' : 'Đang kết nối lại'}
          </span>
          <span className={`chip ${stateMeta.chip}`} data-testid="chat-state">
            {stateMeta.label}
          </span>
        </div>
      </div>

      <div className="chat-log" ref={logRef}>
        {connectionMessage && (
          <div className="banner banner--warn" role="status">
            <span>{connectionMessage}</span>
          </div>
        )}

        {conversationWarning && (
          <div className="banner banner--warn" role="status">
            <span>{conversationWarning}</span>
          </div>
        )}

        {viewState === 'degraded' && (
          <div className="banner banner--warn" role="status">
            <span>
              <strong>Đang ở chế độ không có LLM.</strong> Kết quả bên dưới là dữ liệu thô từ công cụ tra cứu, không được
              diễn giải. {degradedReason && <span style={{ fontFamily: 'var(--mono)' }}>({degradedReason})</span>}
            </span>
          </div>
        )}

        {turns.length === 0 && viewState !== 'error' && (
          <div className="empty">
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Chưa có câu hỏi nào</div>
            <p style={{ maxWidth: '420px' }}>
              Đặt câu hỏi về chính sách nhân sự. Câu trả lời ngoài phạm vi tài liệu sẽ được từ chối thay vì suy đoán.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="btn btn--sm"
                  onClick={() => submit(suggestion)}
                  disabled={connection !== 'connected'}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={`${turn.clientMessageId}-user`} className="chat-row chat-row--user">
              <div className="bubble bubble--user">{turn.text}</div>
            </div>
          ) : (
            <div key={`${turn.clientMessageId}-assistant`} className="chat-row chat-row--bot">
              {!turn.done && turn.text.length === 0 && !turn.proposal ? (
                <div className="bubble" aria-label="Đang chờ câu trả lời">
                  <span className="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : (
                <div className={`bubble ${turn.streaming ? 'bubble--streaming' : ''}`}>
                  {turn.text.length > 0 ? renderMarkdown(turn.text) : <em style={{ color: 'var(--text-muted)' }}>(không có nội dung văn bản)</em>}
                </div>
              )}

              {turn.citations.length > 0 && (
                <div className="citation-row">
                  {turn.citations.map((citation, index) => (
                    <button
                      key={`${turn.clientMessageId}-cit-${index}`}
                      type="button"
                      className="citation-chip"
                      onClick={() => setOpenCitation(citation)}
                      title={`${citation.document} · ${citation.version} · Điều ${citation.article}`}
                    >
                      📄 {citation.document} · {citation.version} · Điều {citation.article}
                    </button>
                  ))}
                </div>
              )}

              {turn.proposal && (
                <div className="proposal-card">
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#fcd34d' }}>
                    Đề xuất hành động: {turn.proposal.type}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {turn.proposal.preview || 'Máy chủ không trả về mô tả xem trước cho hành động này.'}
                  </div>
                  <div className="proposal-card__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={turn.proposalDecision !== null || !turn.done}
                      onClick={() => decideProposal(turn, true)}
                    >
                      Xác nhận
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      disabled={turn.proposalDecision !== null || !turn.done}
                      onClick={() => decideProposal(turn, false)}
                    >
                      Huỷ
                    </button>
                  </div>
                  {turn.proposalDecision && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Đã gửi chat:confirm ({turn.proposalDecision === 'approved' ? 'đồng ý' : 'từ chối'}).
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {viewState === 'abstain' && (
          <div className="banner banner--warn" role="status">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span>
                <strong>Chưa có trong tài liệu chính sách.</strong> Hệ thống không tìm thấy bằng chứng đủ mạnh để trả lời câu
                hỏi này.
              </span>
              {abstainDocuments.length > 0 ? (
                <span style={{ fontSize: '11px' }}>
                  Tài liệu đã nạp trong câu trả lời: {abstainDocuments.join(' · ')}
                </span>
              ) : (
                <span style={{ fontSize: '11px' }}>Máy chủ không trả về danh mục tài liệu đã nạp cho lượt này.</span>
              )}
            </div>
          </div>
        )}

        {viewState === 'error' && (
          <div className="banner banner--error" role="alert">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span>
                <strong>Không xử lý được câu hỏi.</strong> {errorMessage}
              </span>
              {lastQuestion && (
                <button type="button" className="btn btn--sm" onClick={() => submit(lastQuestion)} disabled={connection !== 'connected'}>
                  Thử lại câu hỏi trước
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="chat-composer">
        <textarea
          className="textarea"
          aria-label="Câu hỏi của bạn"
          placeholder={
            connection === 'connected' ? 'Hỏi về chính sách nhân sự… (Enter để gửi)' : 'Đang kết nối lại realtime gateway…'
          }
          value={draft}
          disabled={connection !== 'connected' || isBusy}
          aria-invalid={viewState === 'error'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
        />
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => submit(draft)}
          disabled={connection !== 'connected' || isBusy || draft.trim().length === 0}
          aria-busy={isBusy}
        >
          {isBusy ? <span className="spinner" /> : null}
          {isBusy ? 'Đang xử lý' : 'Gửi'}
        </button>
      </div>

      {openCitation && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Chi tiết trích dẫn" onClick={() => setOpenCitation(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Chi tiết trích dẫn</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpenCitation(null)}>
                Đóng
              </button>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', marginTop: '14px', fontSize: '12px' }}>
              <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Document</dt>
              <dd>{openCitation.document}</dd>
              <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Version</dt>
              <dd>{openCitation.version}</dd>
              <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Article</dt>
              <dd>{openCitation.article}</dd>
              <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Score</dt>
              <dd>{openCitation.score.toFixed(4)}</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};
