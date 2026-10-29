import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LLMProvider, LLMProviderInput, LLMProviderType, ProviderTestResult } from '@hr-blockbot/contracts';
import { useAuth } from '../context/AuthContext';
import {
  ApiError,
  fetchLLMProviders,
  newClientMessageId,
  saveLLMProviders,
  testLLMProvider,
} from '../services/api';
import type { NotifyFn } from './Toast';

interface AdminSettingsViewProps {
  onNotify: NotifyFn;
}

interface ProviderFormState {
  /** `null` means "create a new provider". */
  editingId: string | null;
  name: string;
  type: LLMProviderType;
  baseUrl: string;
  model: string;
  maxTokens: string;
  timeoutMs: string;
  priority: string;
  enabled: boolean;
  apiKey: string;
}

const EMPTY_FORM: ProviderFormState = {
  editingId: null,
  name: '',
  type: 'openai_compatible',
  baseUrl: '',
  model: '',
  maxTokens: '1024',
  timeoutMs: '30000',
  priority: '1',
  enabled: true,
  apiKey: '',
};

const TYPE_OPTIONS: LLMProviderType[] = ['openai_compatible', 'gemini', 'anthropic'];

function toFormState(provider: LLMProvider): ProviderFormState {
  return {
    editingId: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    model: provider.model,
    maxTokens: String(provider.maxTokens),
    timeoutMs: String(provider.timeoutMs),
    priority: String(provider.priority),
    enabled: provider.enabled,
    // Key is write-only: never prefill it from the server response.
    apiKey: '',
  };
}

function toProviderInput(form: ProviderFormState, existing?: LLMProvider): LLMProviderInput | null {
  const maxTokens = Number.parseInt(form.maxTokens, 10);
  const timeoutMs = Number.parseInt(form.timeoutMs, 10);
  const priority = Number.parseInt(form.priority, 10);
  const name = form.name.trim();
  const baseUrl = form.baseUrl.trim();
  const model = form.model.trim();

  if (
    name.length === 0 ||
    baseUrl.length === 0 ||
    model.length === 0 ||
    !Number.isFinite(maxTokens) ||
    maxTokens <= 0 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isFinite(priority) ||
    priority <= 0
  ) {
    return null;
  }

  const input: LLMProviderInput = {
    id: existing?.id ?? newClientMessageId(),
    name,
    type: form.type,
    baseUrl,
    model,
    maxTokens,
    timeoutMs,
    priority,
    enabled: form.enabled,
  };
  const apiKey = form.apiKey.trim();
  if (apiKey.length > 0) input.apiKey = apiKey;
  return input;
}

/**
 * Builds the PUT payload for the whole provider list. `apiKeyById` only holds
 * keys typed in the current form session (keys are write-only and never
 * prefilled), so a provider with no entry is sent without `apiKey` and the
 * server keeps the stored key. Never logs the key.
 */
export function buildProviderPayload(
  nextProviders: LLMProvider[],
  apiKeyById: Record<string, string>
): LLMProviderInput[] {
  return nextProviders.map((provider) => {
    const input = toProviderInput(toFormState(provider), provider);
    if (!input) {
      throw new ApiError(`Provider "${provider.name}" có trường không hợp lệ`, 400, 'VALIDATION_FAILED');
    }
    const apiKey = apiKeyById[provider.id];
    if (apiKey) input.apiKey = apiKey;
    return input;
  });
}

export const AdminSettingsView: React.FC<AdminSettingsViewProps> = ({ onNotify }) => {
  const { user } = useAuth();
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [configVersion, setConfigVersion] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [form, setForm] = useState<ProviderFormState | null>(null);
  const [formError, setFormError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [testingId, setTestingId] = useState<string>('');
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string>('');
  // Keys typed in this session only; cleared per provider once the PUT succeeds.
  const apiKeyByIdRef = useRef<Record<string, string>>({});

  const isAdmin = user?.role === 'Admin';

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchLLMProviders();
      setProviders(data.providers);
      setConfigVersion(data.configVersion);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Không tải được cấu hình provider');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin, load]);

  const persist = async (
    nextProviders: LLMProvider[],
    apiKeyById: Record<string, string>,
    successMessage: string
  ) => {
    setIsSaving(true);
    setFormError('');
    try {
      const payload = buildProviderPayload(nextProviders, apiKeyById);
      const saved = await saveLLMProviders({ providers: payload });
      setProviders(saved.providers);
      setConfigVersion(saved.configVersion);
      // Keys were sent with this PUT; do not keep them around after success.
      nextProviders.forEach((provider) => {
        delete apiKeyById[provider.id];
      });
      setForm(null);
      onNotify(successMessage, 'success', 'Đã lưu cấu hình');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lưu cấu hình provider thất bại';
      setFormError(message);
      onNotify(message, 'error', 'Lỗi lưu cấu hình');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveForm = async () => {
    if (!form) return;
    const existing = form.editingId ? providers.find((provider) => provider.id === form.editingId) : undefined;
    const input = toProviderInput(form, existing);
    if (!input) {
      setFormError('Điền đủ tên, baseUrl, model và các số dương (maxTokens/timeoutMs/priority).');
      return;
    }
    if (!existing && form.apiKey.trim().length === 0) {
      setFormError('Provider mới bắt buộc phải nhập API key.');
      return;
    }

    const optimistic: LLMProvider = {
      id: input.id,
      name: input.name,
      type: input.type,
      baseUrl: input.baseUrl,
      model: input.model,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
      priority: input.priority,
      enabled: input.enabled,
      keyHint: existing?.keyHint,
      lastTestAt: existing?.lastTestAt ?? null,
      lastTestOk: existing?.lastTestOk ?? null,
      lastTestError: existing?.lastTestError ?? null,
    };
    const nextProviders = existing
      ? providers.map((provider) => (provider.id === existing.id ? optimistic : provider))
      : [...providers, optimistic];

    // Carry the key the Admin just typed into the payload; an empty field means
    // "keep the stored key" and must not send `apiKey` at all.
    const typedKey = form.apiKey.trim();
    if (typedKey.length > 0) apiKeyByIdRef.current[input.id] = typedKey;

    setProviders(nextProviders);
    await persist(nextProviders, apiKeyByIdRef.current, existing ? 'Đã cập nhật provider.' : 'Đã thêm provider mới.');
  };

  const handleDelete = async (provider: LLMProvider) => {
    if (pendingDeleteId !== provider.id) {
      setPendingDeleteId(provider.id);
      return;
    }
    setPendingDeleteId('');
    const nextProviders = providers.filter((item) => item.id !== provider.id);
    setProviders(nextProviders);
    await persist(nextProviders, apiKeyByIdRef.current, `Đã xoá provider "${provider.name}".`);
  };

  const handleTest = async (provider: LLMProvider) => {
    setTestingId(provider.id);
    try {
      const result = await testLLMProvider(provider.id);
      setTestResults((prev) => ({ ...prev, [provider.id]: result }));
      onNotify(
        result.ok
          ? `Test OK · ${result.latencyMs}ms · model ${result.model}`
          : `Test thất bại: ${result.error ?? 'không rõ nguyên nhân'}`,
        result.ok ? 'success' : 'error',
        'Test connection'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không gọi được endpoint test provider';
      setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false, latencyMs: 0, model: provider.model, error: message } }));
      onNotify(message, 'error', 'Test connection');
    } finally {
      setTestingId('');
    }
  };

  if (!isAdmin) {
    return (
      <div className="empty" role="alert">
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#fda4af' }}>403 — RBAC_DENIED</div>
        <p>Chỉ tài khoản Admin được xem cấu hình LLM provider. Tài khoản hiện tại: {user?.role ?? 'chưa đăng nhập'}.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="skeleton" style={{ height: '22px', width: '260px' }} />
        <div className="skeleton" style={{ height: '64px' }} />
        <div className="skeleton" style={{ height: '64px' }} />
        <div className="skeleton" style={{ height: '64px' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>Cấu Hình LLM Provider</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            ADR-017 · configVersion {configVersion} · key mã hoá AES-256-GCM, client chỉ thấy keyHint
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn" onClick={() => void load()} disabled={isSaving}>
            Tải lại
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setForm({ ...EMPTY_FORM, priority: String(providers.length + 1) });
              setFormError('');
            }}
            disabled={isSaving}
          >
            + Thêm provider
          </button>
        </div>
      </div>

      {loadError && (
        <div className="banner banner--error" role="alert">
          <span>Không tải được cấu hình: {loadError}</span>
          <button type="button" className="btn btn--sm" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}

      <div className="banner" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <span>
          API key chỉ được ghi một chiều. Sau khi lưu, máy chủ chỉ trả về <code style={{ fontFamily: 'var(--mono)' }}>keyHint</code> (4
          ký tự cuối) — giao diện không bao giờ hiển thị key thật hay bản mã.
        </span>
      </div>

      {providers.length === 0 && !loadError && (
        <div className="empty">
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Chưa cấu hình provider nào</div>
          <p>Thêm provider đầu tiên (ví dụ endpoint OpenAI-compatible) để bật trả lời bằng LLM. Không có provider, trợ lý chạy ở chế độ degraded.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setForm({ ...EMPTY_FORM, priority: '1' });
              setFormError('');
            }}
          >
            Thêm provider
          </button>
        </div>
      )}

      {providers.length > 0 && (
        <div className="card table-wrap" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Loại</th>
                <th>Model</th>
                <th>Ưu tiên</th>
                <th>Key</th>
                <th>Test gần nhất</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {[...providers]
                .sort((a, b) => a.priority - b.priority)
                .map((provider) => {
                  const result = testResults[provider.id];
                  const lastOk = result ? result.ok : provider.lastTestOk;
                  const lastAt = provider.lastTestAt ?? null;
                  const lastError = result?.error ?? provider.lastTestError ?? '';
                  return (
                    <tr key={provider.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{provider.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{provider.baseUrl}</div>
                      </td>
                      <td>
                        <span className="chip chip--info">{provider.type}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{provider.model}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{provider.priority}</td>
                      <td>
                        <span className="chip" title="Chỉ 4 ký tự cuối">
                          ••••{provider.keyHint ?? '????'}
                        </span>
                      </td>
                      <td>
                        {result ? (
                          <span className={`chip ${result.ok ? 'chip--ok' : 'chip--err'}`}>
                            {result.ok ? `${result.latencyMs}ms` : 'lỗi'}
                          </span>
                        ) : lastOk === true ? (
                          <span className="chip chip--ok">OK</span>
                        ) : lastOk === false ? (
                          <span className="chip chip--err" title={lastError}>
                            lỗi
                          </span>
                        ) : (
                          <span className="chip">chưa test</span>
                        )}
                        {lastAt && (
                          <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                            {new Date(lastAt).toLocaleString('vi-VN')}
                          </div>
                        )}
                        {(result?.error || lastError) && (
                          <div style={{ fontSize: '10px', color: '#fda4af', maxWidth: '220px' }}>{result?.error || lastError}</div>
                        )}
                      </td>
                      <td>
                        <span className={`chip ${provider.enabled ? 'chip--ok' : 'chip--warn'}`}>
                          {provider.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => void handleTest(provider)}
                            disabled={testingId === provider.id || isSaving}
                            aria-busy={testingId === provider.id}
                          >
                            {testingId === provider.id ? <span className="spinner" /> : null}
                            Test connection
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => {
                              setForm(toFormState(provider));
                              setFormError('');
                            }}
                            disabled={isSaving}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={`btn btn--sm ${pendingDeleteId === provider.id ? 'btn--danger' : 'btn--ghost'}`}
                            onClick={() => void handleDelete(provider)}
                            disabled={isSaving}
                          >
                            {pendingDeleteId === provider.id ? 'Xác nhận xoá' : 'Xoá'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Biểu mẫu provider" onClick={() => setForm(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                {form.editingId ? 'Sửa provider' : 'Thêm provider'}
              </h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm(null)}>
                Đóng
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '14px' }}>
              <div className="field">
                <label className="field__label" htmlFor="provider-name">
                  Tên hiển thị
                </label>
                <input
                  id="provider-name"
                  className="input"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ví dụ: Primary OpenAI-compatible"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="provider-type">
                  Loại
                </label>
                <select
                  id="provider-type"
                  className="select"
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value as LLMProviderType })}
                >
                  {TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="provider-base-url">
                  Base URL
                </label>
                <input
                  id="provider-base-url"
                  className="input"
                  value={form.baseUrl}
                  onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  placeholder="https://…/v1"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="provider-model">
                  Model
                </label>
                <input
                  id="provider-model"
                  className="input"
                  value={form.model}
                  onChange={(event) => setForm({ ...form, model: event.target.value })}
                  placeholder="Tên model do provider công bố"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="provider-max-tokens">
                  maxTokens
                </label>
                <input
                  id="provider-max-tokens"
                  className="input"
                  inputMode="numeric"
                  value={form.maxTokens}
                  onChange={(event) => setForm({ ...form, maxTokens: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="provider-timeout">
                  timeoutMs
                </label>
                <input
                  id="provider-timeout"
                  className="input"
                  inputMode="numeric"
                  value={form.timeoutMs}
                  onChange={(event) => setForm({ ...form, timeoutMs: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="provider-priority">
                  priority (1 = chính)
                </label>
                <input
                  id="provider-priority"
                  className="input"
                  inputMode="numeric"
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="provider-api-key">
                  API key {form.editingId ? '(để trống = giữ key cũ)' : '(bắt buộc)'}
                </label>
                <input
                  id="provider-api-key"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={form.editingId ? 'Không hiển thị key đã lưu' : 'Chỉ ghi, không bao giờ đọc lại'}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              Bật provider này trong danh sách fallback
            </label>

            {formError && (
              <div className="banner banner--error" role="alert" style={{ marginTop: '12px' }}>
                <span>{formError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setForm(null)} disabled={isSaving}>
                Huỷ
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void handleSaveForm()} disabled={isSaving} aria-busy={isSaving}>
                {isSaving ? <span className="spinner" /> : null}
                {isSaving ? 'Đang lưu…' : 'Lưu provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
