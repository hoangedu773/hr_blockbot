import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccountEmailSchema, OnboardingCreateSchema, type AuthorizationSummary } from '@hr-blockbot/contracts';
import { requestJson } from '../../services/api';

type Store = AuthorizationSummary['stores'][number];
type Manager = { employeeId: string; fullName: string; employeeCode: string };
type Draft = { fullName: string; phone: string; email: string; hiredAt: string; reason: string };
type Step = keyof Draft | 'store' | 'manager' | 'confirm' | 'closed';
type Turn = { sender: 'user' | 'assistant'; text: string };

const questions = {
  fullName: 'Nhân viên mới tên đầy đủ là gì?',
  phone: 'Cho mình số điện thoại của nhân viên.',
  email: 'Nhân viên dùng email nào để nhận link kích hoạt?',
  hiredAt: 'Nhân viên vào làm ngày nào? Ví dụ 15/11/2026.',
  reason: 'Bạn cho mình lý do tiếp nhận nhân viên này nhé.',
} satisfies Record<keyof Draft, string>;
const nextStep: Record<keyof Draft, keyof Draft | 'confirm'> = { fullName: 'phone', phone: 'email', email: 'hiredAt', hiredAt: 'reason', reason: 'confirm' };
const emptyDraft: Draft = { fullName: '', phone: '', email: '', hiredAt: '', reason: '' };
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const commandText = (value: string) => normalize(value).replace(/[.!?]+$/g, '');

export function isOnboardingRequest(value: string) {
  return /^(?:(?:toi|minh|em|chi|anh) )?(?:(?:can|muon|hay|cho toi|cho minh|giup toi) )*(?:(?:them|tao|dang ky|tiep nhan|onboard) (?:ho so (?:tiep nhan )?)?(?:nhan vien|nhan su|nv)(?: moi)?|tao (?:de nghi|ho so) tiep nhan)(?: (?:giup toi|giup minh|nhe|voi|duoc khong))*$/.test(commandText(value));
}

const relativeHireDays = new Map([
  ['hom qua', -1], ['hom nay', 0], ['ngay hom nay', 0],
  ['mai', 1], ['ngay mai', 1], ['ngay kia', 2], ['ngay mot', 2],
]);
const vietnamDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
const displayHireDate = (day: string) => day.split('-').reverse().join('/');

function hireDate(text: string) {
  const input = commandText(text).replace(/^(?:(?:bat dau|vao lam)(?: tu)?|tu) /, '');
  const offset = relativeHireDays.get(input);
  if (offset !== undefined) {
    const localDay = new Date(vietnamDate.format(new Date()) + 'T00:00:00Z');
    localDay.setUTCDate(localDay.getUTCDate() + offset);
    return localDay.toISOString().slice(0, 10);
  }

  const explicit = input.replace(/^ngay /, '');
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/.exec(explicit)
    ?? /^(\d{1,2}) thang (\d{1,2}) nam (20\d{2})$/.exec(explicit);
  const iso = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(explicit);
  const parts = local ? [local[3], local[2].padStart(2, '0'), local[1].padStart(2, '0')] : iso?.slice(1);
  if (!parts) return null;
  const day = parts.join('-');
  const date = new Date(day + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

function fieldValue(step: keyof Draft, text: string): string | null {
  if (step === 'fullName') return text.length <= 200 && /\p{L}/u.test(text) ? text : null;
  if (step === 'phone') {
    const compact = text.replace(/[\s.()-]/g, '');
    return /^\+?\d{8,15}$/.test(compact) ? compact : null;
  }
  if (step === 'email') {
    const email = AccountEmailSchema.safeParse(text);
    return email.success && !email.data.endsWith('.invalid') ? email.data : null;
  }
  if (step === 'hiredAt') return hireDate(text);
  return text.length <= 2000 ? text : null;
}

const editFields: Record<string, keyof Draft | 'store' | 'manager'> = {
  'ten': 'fullName', 'ho ten': 'fullName', 'so dien thoai': 'phone', 'sdt': 'phone',
  'email': 'email', 'ngay vao lam': 'hiredAt', 'ly do': 'reason', 'cua hang': 'store', 'quan ly': 'manager',
};
const numbered = (names: string[]) => names.map((name, index) => `${index + 1}. ${name}`).join('\n');
const indexOfChoice = (text: string, names: string[]) => {
  if (/^\d+$/.test(text)) return Number(text) - 1;
  const matches = names.map((name, index) => normalize(name) === normalize(text) ? index : -1).filter(index => index >= 0);
  return matches.length === 1 ? matches[0] : -1;
};

export function ChatOnboarding({ prompt, stores, onExit, renderComposer }: {
  prompt: string;
  stores: Store[];
  onExit: () => void;
  renderComposer: (send: (text: string) => void, busy: boolean) => ReactNode;
}) {
  const [turns, setTurns] = useState<Turn[]>([{ sender: 'user', text: prompt }]);
  const [step, setStep] = useState<Step>('store');
  const [draft, setDraft] = useState(emptyDraft);
  const [store, setStore] = useState<Store>();
  const [manager, setManager] = useState<Manager>();
  const [managerOptions, setManagerOptions] = useState<Manager[]>([]);
  const [busy, setBusy] = useState(false);
  const editing = useRef(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController>();
  const requestId = useRef<string>();
  const end = useRef<HTMLDivElement>(null);
  const say = (text: string) => setTurns(previous => [...previous, { sender: 'assistant', text }]);
  const askStore = () => say('Chọn cửa hàng tiếp nhận. Bạn có thể gõ số hoặc tên cửa hàng.\n' + numbered(stores.map(item => item.name)));
  const askManager = (choices: Manager[]) => say('Bạn muốn đề xuất ai làm quản lý trực tiếp? Gõ số hoặc “bỏ qua”.\n' + numbered(choices.map(item => `${item.fullName} · ${item.employeeCode}`)));
  const showPreview = (values: Draft, place: Store, lead?: Manager) => {
    setStep('confirm');
    say(`Xem trước hồ sơ\nHọ tên: ${values.fullName}\nSố điện thoại: ${values.phone}\nEmail: ${values.email}\nNgày vào làm: ${displayHireDate(values.hiredAt)}\nCửa hàng: ${place.name}\nQuản lý trực tiếp: ${lead?.fullName ?? 'Chưa đề xuất'}\nLý do: ${values.reason}\n\nGõ “xác nhận” để gửi HR, “sửa email” (hoặc tên trường cần sửa) để chỉnh, hoặc “hủy”.`);
  };
  const afterChoice = (place: Store, lead?: Manager) => {
    if (editing.current) { editing.current = false; showPreview(draft, place, lead); }
    else { setStep('fullName'); say(questions.fullName); }
  };
  const chooseStore = async (place: Store) => {
    setStore(place);
    setManager(undefined);
    setManagerOptions([]);
    if (!place.capabilities.includes('onboarding.reporting_propose')) { afterChoice(place); return; }
    const lookup = new AbortController();
    controller.current = lookup;
    setBusy(true);
    try {
      const { defaultManager, items } = await requestJson<{ defaultManager: Manager | null; items: Manager[] }>(
        `/initial-reporting/managers?storeId=${place.id}&page=1&limit=20`, { signal: lookup.signal });
      if (lookup.signal.aborted) return;
      const choices = defaultManager && !items.some(item => item.employeeId === defaultManager.employeeId) ? [defaultManager, ...items] : items;
      setManagerOptions(choices);
      if (!defaultManager && choices.length) { setStep('manager'); askManager(choices); return; }
      setManager(defaultManager ?? undefined);
      if (defaultManager) say(`Đã chọn ${defaultManager.fullName} làm quản lý trực tiếp. Bạn có thể sửa ở bước xem lại.`);
      afterChoice(place, defaultManager ?? undefined);
    } catch {
      if (!lookup.signal.aborted) { say('Chưa tải được quản lý trực tiếp. Có thể bổ sung sau khi tạo đề nghị.'); afterChoice(place); }
    } finally { if (!lookup.signal.aborted) setBusy(false); }
  };
  useEffect(() => {
    setTurns([{ sender: 'user', text: prompt }]);
    if (stores.length === 1) {
      say(`Cửa hàng tiếp nhận là ${stores[0].name}.`);
      void chooseStore(stores[0]);
    } else if (stores.length) askStore();
    else { say('Tài khoản của bạn chưa có quyền đề nghị tiếp nhận tại cửa hàng nào.'); setStep('closed'); }
    return () => controller.current?.abort();
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, busy]);

  async function send(text: string) {
    if (busy || inFlight.current || step === 'closed') return;
    const command = commandText(text);
    if (/^huy(?: (?:de nghi|ho so|tiep nhan))?$/.test(command)) {
      setDraft(emptyDraft); setTurns([{ sender: 'assistant', text: 'Đã hủy nhập hồ sơ.' }]); setStep('closed');
      return;
    }
    setTurns(previous => [...previous, { sender: 'user', text }]);
    if (step === 'store') {
      const choice = stores[indexOfChoice(text, stores.map(item => item.name))];
      if (choice) await chooseStore(choice);
      else askStore();
      return;
    }
    if (!store) return;
    if (step === 'manager') {
      const choice = managerOptions[indexOfChoice(text, managerOptions.map(item => item.fullName))];
      if (!choice && command !== 'bo qua') { askManager(managerOptions); return; }
      setManager(choice); afterChoice(store, choice); return;
    }
    if (step !== 'confirm') {
      const value = fieldValue(step, text);
      if (value === null) { say('Thông tin chưa hợp lệ. ' + questions[step]); return; }
      if (step === 'hiredAt') say(`Mình ghi nhận ngày vào làm là ${displayHireDate(value)} theo giờ Việt Nam.`);
      const values = { ...draft, [step]: value };
      setDraft(values);
      const next = nextStep[step];
      if (editing.current || next === 'confirm') { editing.current = false; showPreview(values, store, manager); }
      else { setStep(next); say(questions[next]); }
      return;
    }
    const field = command.startsWith('sua ') ? editFields[command.slice(4)] : undefined;
    if (field) {
      if (field === 'manager' && !managerOptions.length) { say('Chưa có quản lý hợp lệ để chọn. Bạn có thể bổ sung sau.'); return; }
      editing.current = true;
      setStep(field);
      if (field === 'store') askStore();
      else if (field === 'manager') askManager(managerOptions);
      else say(questions[field]);
      return;
    }
    if (!['xac nhan', 'xac nhan gui hr', 'gui hr'].includes(command)) {
      say('Gõ “xác nhận” để gửi HR, “sửa” kèm tên trường, hoặc “hủy”.');
      return;
    }
    requestId.current ??= crypto.randomUUID();
    const input = OnboardingCreateSchema.safeParse({
      ...draft, clientRequestId: requestId.current, storeId: store.id,
      hiredAt: new Date(draft.hiredAt + 'T00:00:00+07:00').toISOString(),
      ...(manager && { initialManagerEmployeeId: manager.employeeId }),
    });
    if (!input.success) { say('Hồ sơ chưa hợp lệ. Hãy sửa thông tin trước khi gửi.'); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await requestJson<{ payload: { employeeCode: string } }>('/onboarding', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input.data),
      });
      setDraft(emptyDraft);
      setTurns([{ sender: 'assistant', text: `Đã gửi đề nghị cho HR duyệt. Mã nhân viên: ${result.payload.employeeCode}.` }]);
      setStep('closed');
    } catch (error) {
      say(`${error instanceof Error ? error.message : 'Chưa gửi được hồ sơ.'} Gõ “xác nhận” để thử lại cùng đề nghị.`);
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <>
    <div className="guta-chat-body" role="log" aria-label="Tiếp nhận nhân viên trong chat">
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
      {step !== 'closed' && renderComposer(text => void send(text), busy)}
    </div>
  </>;
}
