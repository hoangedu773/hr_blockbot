import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthorizationSummary } from '@hr-blockbot/contracts';
import { fetchEmployees, requestJson } from '../../services/api';

type Store = AuthorizationSummary['stores'][number];

export type ChatLifecycleMode =
  | 'STAFFING_PROPOSAL' // SM xin bổ sung nhân sự gửi AM
  | 'EXIT_PROPOSAL' // SM đề xuất nghỉ việc gửi HR
  | 'REACTIVATE_PROPOSAL' // SM đề xuất tái kích hoạt gửi HR
  | 'TRANSFER_CONFIRM' // SM xác nhận điều chuyển
  | 'STAFFING_VIEW' // AM xem yêu cầu bổ sung từ SM
  | 'TRANSFER_PROPOSAL' // AM lập điều chuyển giữa 2 cửa hàng
  | 'HR_REVIEW'; // HR duyệt yêu cầu nhân sự

export interface ChatLifecycleProps {
  initialPrompt: string;
  mode: ChatLifecycleMode;
  stores: Store[];
  onExit: () => void;
  onOpenLifecycleCrm?: (id?: string) => void;
  renderComposer: (send: (text: string) => void, busy: boolean, placeholder?: string) => ReactNode;
}

type Turn = {
  sender: 'user' | 'assistant';
  text: string;
  card?: ReactNode;
};

type EmployeeItem = {
  employeeId: string;
  fullName: string;
  storeId?: string | null;
  jobTitle?: string | null;
};

type StaffingItem = {
  id: string;
  storeId: string;
  storeName?: string;
  requestedBy?: string;
  requesterName?: string;
  quantity: number;
  jobTitle?: string | null;
  neededBy: string;
  reason: string;
  status: 'PENDING_AM' | 'IN_PROGRESS' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';
  decisionReason?: string | null;
  progress: {
    linked: number;
    completed: number;
  };
  version: number;
  createdAt: string;
};

type LifecycleRow = {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  kind: 'TRANSFER' | 'EXIT' | 'REACTIVATE';
  status:
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'PENDING_CONFIRMATIONS'
    | 'PENDING_EFFECTIVE'
    | 'PENDING_HANDOVER'
    | 'PENDING_ACTIVATION'
    | 'ACTIVATING'
    | 'APPLYING'
    | 'COMPLETED';
  effectiveAt: string;
  reason: string;
  sourceStoreId?: string | null;
  sourceStoreName?: string | null;
  targetStoreId?: string | null;
  targetStoreName?: string | null;
  requestedBy?: string;
  requesterName?: string;
  confirmations: Array<{ storeId: string; confirmedBy: string; confirmedAt: string; reason?: string }>;
  auditIntegrity: string;
  version: number;
  createdAt: string;
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

const commandText = (value: string) => normalize(value).replace(/[.!?]+$/g, '');

const relativeDays = new Map([
  ['hom qua', -1],
  ['hom nay', 0],
  ['ngay hom nay', 0],
  ['mai', 1],
  ['ngay mai', 1],
  ['ngay kia', 2],
  ['ngay mot', 2],
  ['tuan sau', 7],
  ['sang tuan', 7],
]);

const vietnamDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parseVietnamDate(text: string): string | null {
  const clean = commandText(text).replace(/^(?:(?:tu|vao|ngay|bat dau tu) )+/, '');
  const offset = relativeDays.get(clean);
  if (offset !== undefined) {
    const localDay = new Date(vietnamDate.format(new Date()) + 'T00:00:00Z');
    localDay.setUTCDate(localDay.getUTCDate() + offset);
    return localDay.toISOString().slice(0, 10);
  }
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const ymd = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

const displayDate = (isoOrYmd: string) => {
  const parts = isoOrYmd.slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : isoOrYmd;
};

const numbered = (items: string[]) => items.map((name, index) => `${index + 1}. ${name}`).join('\n');

const indexOfChoice = (text: string, names: string[]) => {
  if (/^\d+$/.test(text)) return Number(text) - 1;
  const matches = names
    .map((name, index) => (normalize(name).includes(normalize(text)) || normalize(text).includes(normalize(name)) ? index : -1))
    .filter((index) => index >= 0);
  return matches.length === 1 ? matches[0] : -1;
};

export function isStaffingProposalRequest(text: string): boolean {
  const c = commandText(text);
  return (
    c.includes('xin bo sung nhan su') ||
    c.includes('can them nhan vien') ||
    c.includes('bo sung nhan su') ||
    c.includes('xin them nguoi') ||
    c.includes('xin nhan su') ||
    /^(?:(?:toi|minh|em|chi|anh|cua hang) )?(?:(?:can|muon|hay|cho toi|cho minh|giup toi|de nghi|de xuat|xin) )*(?:(?:bo sung|them|xin them|yeu cau|de xuat)(?: them)? (?:nhan vien|nhan su|nguoi|nv)|can (?:them )?(?:\d+ )?(?:nhan vien|nhan su|nguoi|nv))(?: (?:cho cua hang|gap|nhe|voi|duoc khong))*$/.test(c)
  );
}

export function isLifecycleExitRequest(text: string): boolean {
  const c = commandText(text);
  return (
    c.includes('nghi viec') ||
    c.includes('thoi viec') ||
    c.includes('cho nhan vien nghi') ||
    c.includes('xin cho nv nghi')
  );
}

export function isLifecycleReactivateRequest(text: string): boolean {
  const c = commandText(text);
  return (
    c.includes('tai kich hoat') ||
    c.includes('kich hoat lai') ||
    c.includes('di lam lai')
  );
}

export function isTransferConfirmRequest(text: string): boolean {
  const c = commandText(text);
  return (
    c.includes('xac nhan dieu chuyen') ||
    c.includes('cho cua hang dong y') ||
    c.includes('dieu chuyen cho xac nhan') ||
    c.includes('xac nhan nhan nguoi') ||
    c.includes('xac nhan chuyen nguoi')
  );
}

export function isStaffingViewRequest(text: string): boolean {
  const c = commandText(text);
  return (
    c.includes('yeu cau bo sung nhan su tu sm') ||
    c.includes('yeu cau nhan su tu sm') ||
    c.includes('danh sach xin them nguoi') ||
    c.includes('sm xin them nguoi') ||
    c.includes('yeu cau bo sung nhan su')
  );
}

export function isTransferProposalRequest(text: string): boolean {
  const c = commandText(text);
  return (
    c.includes('dieu chuyen nhan vien giua 2 cua hang') ||
    c.includes('dieu chuyen nhan vien') ||
    c.includes('dieu chuyen nhan su') ||
    c.includes('chuyen nhan vien sang cua hang') ||
    c.includes('lap de nghi dieu chuyen') ||
    c.includes('lap dieu chuyen')
  );
}

export function isLifecycleReviewRequest(text: string): boolean {
  const c = commandText(text);
  return (
    c.includes('duyet yeu cau nhan su') ||
    c.includes('duyet de nghi nhan su') ||
    c.includes('co de nghi nghi viec hay dieu chuyen') ||
    c.includes('ho so nhan su cho duyet') ||
    c.includes('yeu cau nhan su cho duyet') ||
    c.includes('de nghi cho hr duyet')
  );
}

export function ChatLifecycle({
  initialPrompt,
  mode: initialMode,
  stores,
  onExit,
  onOpenLifecycleCrm,
  renderComposer,
}: ChatLifecycleProps) {
  const [currentMode, setCurrentMode] = useState<ChatLifecycleMode>(initialMode);
  const [turns, setTurns] = useState<Turn[]>([{ sender: 'user', text: initialPrompt }]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string>('init');

  // Form states
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [targetStore, setTargetStore] = useState<Store | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [jobTitle, setJobTitle] = useState<string>('');
  const [neededBy, setNeededBy] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeItem | null>(null);
  const [linkedStaffing, setLinkedStaffing] = useState<StaffingItem | null>(null);

  const confirmListRef = useRef<LifecycleRow[]>([]);
  const staffingListRef = useRef<StaffingItem[]>([]);
  const reviewListRef = useRef<LifecycleRow[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  const say = (text: string, card?: ReactNode) => {
    setTurns((prev) => [...prev, { sender: 'assistant', text, card }]);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  // Initial step setup based on mode
  useEffect(() => {
    void initializeMode(initialMode);
  }, [initialMode]);

  const storeName = (id: string | null | undefined, fallback?: string | null) =>
    fallback || stores.find((s) => s.id === id)?.name || id || 'Không xác định';

  async function initializeMode(mode: ChatLifecycleMode, linked?: StaffingItem) {
    setCurrentMode(mode);
    setBusy(true);

    try {
      if (mode === 'STAFFING_PROPOSAL') {
        // SM Xin bổ sung nhân sự
        const smStores = stores.filter(
          (s) => s.capabilities.includes('onboarding.propose') || s.capabilities.includes('employees.lifecycle_request')
        );
        const extractNum = initialPrompt.match(/(?:them|can|xin)\s+(\d+)\s+(?:nhan vien|nhan su|nguoi|nv)/i);
        if (extractNum) setQuantity(Math.min(20, Math.max(1, Number(extractNum[1]))));

        if (smStores.length === 1) {
          setSelectedStore(smStores[0]);
          setStep('quantity');
          say(
            `Cửa hàng yêu cầu: **${smStores[0].name}**.\n` +
              (extractNum
                ? `Đã nhận diện số lượng: **${extractNum[1]} nhân viên**.\nVị trí / chức danh cần bổ sung là gì? (VD: Pha chế, Thu ngân, Phục vụ... hoặc gõ “bỏ qua”).`
                : 'Cửa hàng cần bổ sung bao nhiêu nhân viên? (Nhập số lượng từ 1 đến 20 nhân sự).')
          );
          if (extractNum) setStep('jobTitle');
        } else if (smStores.length > 1) {
          setStep('store');
          say('Chọn cửa hàng của bạn cần bổ sung nhân sự (gõ số hoặc tên chi nhánh):\n' + numbered(smStores.map((s) => s.name)));
        } else {
          say('Tài khoản của bạn chưa có quyền quản lý cửa hàng (SM) để gửi yêu cầu bổ sung nhân sự.');
          setStep('closed');
        }
      } else if (mode === 'EXIT_PROPOSAL' || mode === 'REACTIVATE_PROPOSAL') {
        // SM Đề xuất Nghỉ việc hoặc Tái kích hoạt
        const smStores = stores.filter((s) => s.capabilities.includes('employees.lifecycle_request'));
        if (!smStores.length) {
          say('Tài khoản của bạn chưa có quyền đề xuất thay đổi trạng thái nhân sự tại cửa hàng.');
          setStep('closed');
          return;
        }
        const activeStore = smStores[0];
        setSelectedStore(activeStore);
        const res = await fetchEmployees({
          storeId: activeStore.id,
          status: mode === 'EXIT_PROPOSAL' ? 'active' : 'inactive',
          limit: 20,
        });
        setEmployees(res.items);
        if (!res.items.length) {
          say(
            `Tại cửa hàng **${activeStore.name}** hiện không có nhân sự ${
              mode === 'EXIT_PROPOSAL' ? 'đang hoạt động' : 'đã nghỉ'
            } để lập đề xuất.`
          );
          setStep('closed');
          return;
        }
        setStep('employee');
        say(
          `Cửa hàng: **${activeStore.name}**.\nChọn nhân viên đề xuất ${
            mode === 'EXIT_PROPOSAL' ? 'nghỉ việc' : 'tái kích hoạt'
          } (gõ số thứ tự hoặc tên):\n` +
            numbered(res.items.map((e) => `${e.fullName} · ${e.employeeId} (${e.jobTitle || 'Nhân viên'})`))
        );
      } else if (mode === 'TRANSFER_CONFIRM') {
        // SM Xác nhận điều chuyển nhân sự
        const res = await requestJson<{ items: LifecycleRow[] }>('/employee-lifecycle?group=awaiting_me&page=1&limit=20');
        const confirmable = res.items.filter((r) => r.kind === 'TRANSFER');
        confirmListRef.current = confirmable;
        if (!confirmable.length) {
          say('Hiện tại không có đề xuất điều chuyển nhân sự nào đang chờ cửa hàng của bạn đồng ý.');
          setStep('closed');
        } else {
          setStep('confirm_list');
          say(
            `Hiện có **${confirmable.length} đề xuất điều chuyển** đang chờ cửa hàng của bạn xác nhận đồng ý (bấm nút hoặc gõ “đồng ý 1”):`,
            renderTransferConfirmCards(confirmable)
          );
        }
      } else if (mode === 'STAFFING_VIEW') {
        // AM Xem yêu cầu từ SM
        const res = await requestJson<{ items: StaffingItem[] }>('/staffing-requests?page=1&limit=20');
        const pending = res.items.filter((s) => ['PENDING_AM', 'IN_PROGRESS'].includes(s.status));
        staffingListRef.current = pending;
        if (!pending.length) {
          say('Hiện tại không có yêu cầu bổ sung nhân sự nào từ các Cửa hàng trưởng (SM) trong khu vực.');
          setStep('closed');
        } else {
          setStep('staffing_list');
          say(
            `Tìm thấy **${pending.length} yêu cầu bổ sung nhân sự** từ các SM trong khu vực (bấm nút hoặc gõ số thứ tự để lập điều chuyển):`,
            renderStaffingViewCards(pending)
          );
        }
      } else if (mode === 'TRANSFER_PROPOSAL') {
        // AM Lập điều chuyển giữa 2 cửa hàng
        const transferStores = stores.filter((s) => s.capabilities.includes('employees.transfer'));
        if (transferStores.length < 2) {
          say('Tài khoản cần có quyền quản lý ít nhất 2 cửa hàng trong khu vực để thực hiện điều chuyển.');
          setStep('closed');
          return;
        }
        if (linked) {
          setLinkedStaffing(linked);
          const target = stores.find((s) => s.id === linked.storeId);
          if (target) setTargetStore(target);
          setReason(`Điều chuyển đáp ứng yêu cầu của ${storeName(linked.storeId, linked.storeName)} (${linked.reason})`);
          if (linked.neededBy) setNeededBy(linked.neededBy.slice(0, 10));
        }
        setStep('transfer_source');
        say(
          (linked
            ? `Đang lập điều chuyển đáp ứng yêu cầu của cửa hàng **${storeName(linked.storeId, linked.storeName)}**.\n`
            : '') +
            'Chọn **cửa hàng nguồn** (cửa hàng có nhân sự chuyển đi):\n' +
            numbered(transferStores.filter((s) => s.id !== linked?.storeId).map((s) => s.name))
        );
      } else if (mode === 'HR_REVIEW') {
        // HR Duyệt yêu cầu nhân sự
        const res = await requestJson<{ items: LifecycleRow[] }>('/employee-lifecycle?group=pending_review&page=1&limit=20');
        reviewListRef.current = res.items;
        if (!res.items.length) {
          say('Hiện không có đề xuất nhân sự (nghỉ việc, tái kích hoạt, điều chuyển) nào đang chờ HR duyệt.');
          setStep('closed');
        } else {
          setStep('review_list');
          say(
            `Hiện có **${res.items.length} đề xuất nhân sự** đang chờ HR phê duyệt độc lập (bấm nút hoặc gõ “duyệt 1” / “từ chối 1: lý do”):`,
            renderHrReviewCards(res.items)
          );
        }
      }
    } catch (err) {
      say(`Có lỗi khi tải dữ liệu nghiệp vụ: ${err instanceof Error ? err.message : 'Không xác định'}`);
      setStep('closed');
    } finally {
      setBusy(false);
    }
  }

  // Action handlers
  const handleConfirmStoreTransfer = async (row: LifecycleRow, storeId: string, customReason?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await requestJson(`/employee-lifecycle/${row.id}/confirm-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: row.version,
          storeId,
          reason: customReason || 'Cửa hàng trưởng đã xác nhận đồng ý điều chuyển qua Chatbot.',
        }),
      });
      say(
        `✅ Cửa hàng **${storeName(storeId)}** đã xác nhận đồng ý điều chuyển cho nhân viên **${
          row.employeeName || row.employeeId
        }**.\n` +
          'Khi cả 2 cửa hàng đi và đến đều xác nhận, hệ thống sẽ tự động hoàn tất điều chuyển!'
      );
      // Reload confirm list
      void initializeMode('TRANSFER_CONFIRM');
    } catch (err) {
      say(`Chưa xác nhận được: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleHrReviewDecision = async (row: LifecycleRow, decision: 'APPROVE' | 'REJECT', customReason?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await requestJson(`/employee-lifecycle/${row.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: row.version,
          decision,
          reason: customReason || (decision === 'APPROVE' ? 'HR đã xem xét và phê duyệt qua Chatbot.' : 'HR từ chối.'),
        }),
      });
      say(
        `✅ HR đã **${decision === 'APPROVE' ? 'PHÊ DUYỆT' : 'TỪ CHỐI'}** đề xuất ${
          row.kind === 'EXIT' ? 'nghỉ việc' : row.kind === 'REACTIVATE' ? 'tái kích hoạt' : 'điều chuyển'
        } cho nhân viên **${row.employeeName || row.employeeId}**.`
      );
      void initializeMode('HR_REVIEW');
    } catch (err) {
      say(`Không thực hiện được quyết định: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const handleStartTransferFromStaffing = (staffing: StaffingItem) => {
    void initializeMode('TRANSFER_PROPOSAL', staffing);
  };

  const handleStaffingDecision = async (staffing: StaffingItem, decision: 'ACCEPT' | 'REJECT', customReason?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await requestJson(`/staffing-requests/${staffing.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: staffing.version,
          decision,
          reason:
            customReason ||
            (decision === 'ACCEPT'
              ? 'AM đã tiếp nhận yêu cầu bổ sung nhân sự qua Chatbot.'
              : 'AM từ chối yêu cầu bổ sung nhân sự qua Chatbot.'),
        }),
      });
      say(
        `✅ AM đã **${decision === 'ACCEPT' ? 'TIẾP NHẬN' : 'TỪ CHỐI'}** yêu cầu bổ sung nhân sự của cửa hàng **${storeName(
          staffing.storeId,
          staffing.storeName
        )}**.`
      );
      void initializeMode('STAFFING_VIEW');
    } catch (err) {
      say(`Không thực hiện được quyết định: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Turn sender
  async function send(text: string) {
    if (busy || inFlight.current || step === 'closed') return;
    const command = commandText(text);

    if (command === 'huy' || command === 'thoat' || command === 'dong') {
      say('Đã hủy thao tác nghiệp vụ.');
      setStep('closed');
      return;
    }

    setTurns((prev) => [...prev, { sender: 'user', text }]);

    // STAFFING PROPOSAL FLOW
    if (currentMode === 'STAFFING_PROPOSAL') {
      const smStores = stores.filter(
        (s) => s.capabilities.includes('onboarding.propose') || s.capabilities.includes('employees.lifecycle_request')
      );
      if (step === 'store') {
        const choice = smStores[indexOfChoice(text, smStores.map((s) => s.name))];
        if (!choice) {
          say('Vui lòng chọn cửa hàng từ danh sách:\n' + numbered(smStores.map((s) => s.name)));
          return;
        }
        setSelectedStore(choice);
        setStep('quantity');
        say(`Cửa hàng: **${choice.name}**.\nCửa hàng cần bổ sung bao nhiêu nhân viên? (Nhập số lượng từ 1 đến 20)`);
        return;
      }
      if (step === 'quantity') {
        const num = Number(command);
        if (!num || num < 1 || num > 20) {
          say('Số lượng cần là một số nguyên từ 1 đến 20. Bạn cần bổ sung bao nhiêu nhân viên?');
          return;
        }
        setQuantity(num);
        setStep('jobTitle');
        say(`Số lượng: **${num} nhân sự**.\nVị trí / chức danh cần bổ sung? (VD: Pha chế, Thu ngân, Phục vụ... hoặc gõ “bỏ qua”).`);
        return;
      }
      if (step === 'jobTitle') {
        const title = command === 'bo qua' ? '' : text.trim();
        setJobTitle(title);
        setStep('neededBy');
        say(
          (title ? `Vị trí: **${title}**.\n` : '') +
            'Ngày giờ cần nhân sự có mặt tại cửa hàng? (VD: ngày mai, 15/11/2026, thứ 2 tuần sau...).'
        );
        return;
      }
      if (step === 'neededBy') {
        const parsed = parseVietnamDate(text);
        if (!parsed) {
          say('Chưa hiểu ngày bạn nhập. Hãy nhập theo dạng ngày mai, hôm nay hoặc 15/11/2026.');
          return;
        }
        setNeededBy(parsed);
        setStep('reason');
        say(`Ngày cần: **${displayDate(parsed)}**.\nLý do bạn đề xuất xin bổ sung nhân sự cho cửa hàng?`);
        return;
      }
      if (step === 'reason') {
        setReason(text.trim());
        setStep('confirm');
        say(
          `**Xem trước yêu cầu bổ sung nhân sự**\n` +
            `• Cửa hàng cần: **${selectedStore?.name}**\n` +
            `• Số lượng cần: **${quantity} nhân viên**${jobTitle ? ` (${jobTitle})` : ''}\n` +
            `• Cần trước: **${displayDate(neededBy)}**\n` +
            `• Lý do: **${text.trim()}**\n\n` +
            `Gõ **“xác nhận”** để gửi yêu cầu cho AM khu vực, hoặc **“hủy”** để dừng.`
        );
        return;
      }
      if (step === 'confirm') {
        if (!['xac nhan', 'gui am', 'dong y'].includes(command)) {
          say('Gõ **“xác nhận”** để gửi AM, hoặc **“hủy”**.');
          return;
        }
        inFlight.current = true;
        setBusy(true);
        try {
          await requestJson('/staffing-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId: selectedStore?.id,
              quantity,
              ...(jobTitle ? { jobTitle } : {}),
              neededBy: new Date(neededBy + 'T07:00:00+07:00').toISOString(),
              reason,
            }),
          });
          say(
            `✅ **Đã gửi yêu cầu bổ sung ${quantity} nhân sự cho AM khu vực thành công!**\n` +
              'AM sẽ xem xét và lập đề xuất điều chuyển nhân sự từ chi nhánh khác sang đáp ứng cho cửa hàng.'
          );
          setStep('closed');
        } catch (err) {
          say(`Chưa gửi được: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}. Gõ “xác nhận” để thử lại.`);
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
        return;
      }
    }

    // EXIT / REACTIVATE FLOW
    if (currentMode === 'EXIT_PROPOSAL' || currentMode === 'REACTIVATE_PROPOSAL') {
      if (step === 'employee') {
        const choice = employees[indexOfChoice(text, employees.map((e) => e.fullName))];
        if (!choice) {
          say('Vui lòng chọn nhân viên theo số thứ tự hoặc họ tên trong danh sách.');
          return;
        }
        setSelectedEmployee(choice);
        setStep('effectiveAt');
        say(
          `Đã chọn: **${choice.fullName}** (${choice.employeeId}).\n` +
            `Ngày quyết định ${currentMode === 'EXIT_PROPOSAL' ? 'nghỉ việc' : 'tái kích hoạt'} có hiệu lực? (VD: ngày mai, 15/11/2026...).`
        );
        return;
      }
      if (step === 'effectiveAt') {
        const parsed = parseVietnamDate(text);
        if (!parsed) {
          say('Chưa hiểu ngày bạn nhập. Hãy nhập theo dạng ngày mai, hôm nay hoặc 15/11/2026.');
          return;
        }
        setNeededBy(parsed);
        setStep('reason');
        say(`Ngày hiệu lực: **${displayDate(parsed)}**.\nLý do đề xuất ${currentMode === 'EXIT_PROPOSAL' ? 'nghỉ việc' : 'tái kích hoạt'}?`);
        return;
      }
      if (step === 'reason') {
        setReason(text.trim());
        setStep('confirm');
        say(
          `**Xem trước đề xuất nhân sự**\n` +
            `• Nghiệp vụ: **${currentMode === 'EXIT_PROPOSAL' ? 'Nghỉ việc' : 'Tái kích hoạt'}**\n` +
            `• Nhân viên: **${selectedEmployee?.fullName}** (${selectedEmployee?.employeeId})\n` +
            `• Cửa hàng: **${selectedStore?.name}**\n` +
            `• Ngày hiệu lực: **${displayDate(neededBy)}**\n` +
            `• Lý do: **${text.trim()}**\n\n` +
            `Gõ **“xác nhận”** để gửi HR độc lập phê duyệt, hoặc **“hủy”** để dừng.`
        );
        return;
      }
      if (step === 'confirm') {
        if (!['xac nhan', 'gui hr', 'dong y'].includes(command)) {
          say('Gõ **“xác nhận”** để gửi HR, hoặc **“hủy”**.');
          return;
        }
        inFlight.current = true;
        setBusy(true);
        try {
          const res = await requestJson<{ id: string }>('/employee-lifecycle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: selectedEmployee?.employeeId,
              kind: currentMode === 'EXIT_PROPOSAL' ? 'EXIT' : 'REACTIVATE',
              effectiveAt: new Date(neededBy + 'T00:00:00+07:00').toISOString(),
              reason,
            }),
          });
          say(
            `✅ **Đã gửi đề xuất cho HR độc lập phê duyệt thành công!**\n` +
              `Mã yêu cầu: \`${res.id}\`.\nHR sẽ xem xét phê duyệt theo đúng quy trình phân quyền độc lập.`
          );
          setStep('closed');
        } catch (err) {
          say(`Chưa gửi được: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}. Gõ “xác nhận” để thử lại.`);
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
        return;
      }
    }

    // TRANSFER PROPOSAL (AM)
    if (currentMode === 'TRANSFER_PROPOSAL') {
      const transferStores = stores.filter((s) => s.capabilities.includes('employees.transfer'));
      if (step === 'transfer_source') {
        const availableSources = transferStores.filter((s) => s.id !== targetStore?.id);
        const choice = availableSources[indexOfChoice(text, availableSources.map((s) => s.name))];
        if (!choice) {
          say('Vui lòng chọn cửa hàng nguồn từ danh sách:\n' + numbered(availableSources.map((s) => s.name)));
          return;
        }
        setSelectedStore(choice);
        setBusy(true);
        try {
          const res = await fetchEmployees({ storeId: choice.id, status: 'active', limit: 20 });
          setEmployees(res.items);
          if (!res.items.length) {
            say(`Tại cửa hàng **${choice.name}** hiện không có nhân viên nào đang hoạt động để chuyển đi. Hãy chọn cửa hàng khác.`);
            return;
          }
          setStep('transfer_employee');
          say(
            `Cửa hàng đi: **${choice.name}**.\nChọn nhân viên cần điều chuyển (gõ số hoặc tên):\n` +
              numbered(res.items.map((e) => `${e.fullName} · ${e.employeeId} (${e.jobTitle || 'Nhân viên'})`))
          );
        } catch (err) {
          say(`Lỗi tải nhân viên: ${err instanceof Error ? err.message : 'Không xác định'}`);
        } finally {
          setBusy(false);
        }
        return;
      }
      if (step === 'transfer_employee') {
        const choice = employees[indexOfChoice(text, employees.map((e) => e.fullName))];
        if (!choice) {
          say('Vui lòng chọn nhân viên theo số thứ tự hoặc họ tên.');
          return;
        }
        setSelectedEmployee(choice);
        if (targetStore) {
          setStep('transfer_effective');
          say(
            `Đã chọn nhân viên: **${choice.fullName}**.\nCửa hàng đến: **${targetStore.name}**.\n` +
              `Ngày giờ chuyển có hiệu lực? (VD: ngày mai, 15/11/2026...).`
          );
        } else {
          setStep('transfer_target');
          const availableTargets = transferStores.filter((s) => s.id !== selectedStore?.id);
          say(
            `Đã chọn nhân viên: **${choice.fullName}**.\nChọn **cửa hàng đích** (cửa hàng tiếp nhận):\n` +
              numbered(availableTargets.map((s) => s.name))
          );
        }
        return;
      }
      if (step === 'transfer_target') {
        const availableTargets = transferStores.filter((s) => s.id !== selectedStore?.id);
        const choice = availableTargets[indexOfChoice(text, availableTargets.map((s) => s.name))];
        if (!choice) {
          say('Vui lòng chọn cửa hàng đích từ danh sách:\n' + numbered(availableTargets.map((s) => s.name)));
          return;
        }
        setTargetStore(choice);
        setStep('transfer_effective');
        say(`Cửa hàng đến: **${choice.name}**.\nNgày giờ chuyển có hiệu lực? (VD: ngày mai, 15/11/2026...).`);
        return;
      }
      if (step === 'transfer_effective') {
        const parsed = parseVietnamDate(text);
        if (!parsed) {
          say('Chưa hiểu ngày bạn nhập. Hãy nhập theo dạng ngày mai, hôm nay hoặc 15/11/2026.');
          return;
        }
        setNeededBy(parsed);
        if (reason) {
          setStep('confirm');
          say(
            `**Xem trước đề xuất điều chuyển nhân sự**\n` +
              `• Nhân viên: **${selectedEmployee?.fullName}** (${selectedEmployee?.employeeId})\n` +
              `• Cửa hàng chuyển đi: **${selectedStore?.name}**\n` +
              `• Cửa hàng chuyển đến: **${targetStore?.name}**\n` +
              `• Ngày hiệu lực: **${displayDate(parsed)}**\n` +
              `• Lý do: **${reason}**\n\n` +
              `Gõ **“xác nhận”** để gửi HR độc lập phê duyệt, hoặc **“hủy”** để dừng.`
          );
        } else {
          setStep('transfer_reason');
          say(`Ngày hiệu lực: **${displayDate(parsed)}**.\nLý do điều chuyển nhân viên giữa 2 cửa hàng?`);
        }
        return;
      }
      if (step === 'transfer_reason') {
        setReason(text.trim());
        setStep('confirm');
        say(
          `**Xem trước đề xuất điều chuyển nhân sự**\n` +
            `• Nhân viên: **${selectedEmployee?.fullName}** (${selectedEmployee?.employeeId})\n` +
            `• Cửa hàng chuyển đi: **${selectedStore?.name}**\n` +
            `• Cửa hàng chuyển đến: **${targetStore?.name}**\n` +
            `• Ngày hiệu lực: **${displayDate(neededBy)}**\n` +
            `• Lý do: **${text.trim()}**\n\n` +
            `Gõ **“xác nhận”** để gửi HR độc lập phê duyệt, hoặc **“hủy”** để dừng.`
        );
        return;
      }
      if (step === 'confirm') {
        if (!['xac nhan', 'gui hr', 'dong y'].includes(command)) {
          say('Gõ **“xác nhận”** để gửi HR, hoặc **“hủy”**.');
          return;
        }
        inFlight.current = true;
        setBusy(true);
        try {
          const res = await requestJson<{ id: string }>('/employee-lifecycle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: selectedEmployee?.employeeId,
              kind: 'TRANSFER',
              targetStoreId: targetStore?.id,
              ...(linkedStaffing ? { staffingRequestId: linkedStaffing.id } : {}),
              effectiveAt: new Date(neededBy + 'T00:00:00+07:00').toISOString(),
              reason,
            }),
          });
          say(
            `✅ **Đã gửi đề xuất điều chuyển cho HR phê duyệt thành công!**\n` +
              `Mã yêu cầu: \`${res.id}\`.\n` +
              `Quy trình: 1. AM đã lập → 2. HR phê duyệt → 3. Cửa hàng đi & Cửa hàng đến đồng ý → Hoàn tất điều chuyển.`
          );
          setStep('closed');
        } catch (err) {
          say(`Chưa gửi được: ${err instanceof Error ? err.message : 'Lỗi hệ thống'}. Gõ “xác nhận” để thử lại.`);
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
        return;
      }
    }

    // NATURAL LANGUAGE COMMANDS FOR LIST STEPS (TRANSFER_CONFIRM, STAFFING_VIEW, HR_REVIEW)
    if (currentMode === 'TRANSFER_CONFIRM' && step === 'confirm_list') {
      const m = command.match(/^(?:dong y|xac nhan|ok)(?: (\d+))?$/) || command.match(/^(\d+)$/);
      const idx = m?.[1] ? Number(m[1]) - 1 : 0;
      const row = confirmListRef.current[idx];
      if (!row) {
        say('Vui lòng bấm nút **Đồng ý tiếp nhận / điều chuyển** trên thẻ hoặc gõ **“đồng ý 1”**.');
        return;
      }
      const isSource = stores.some((s) => s.id === row.sourceStoreId);
      const storeIdToConfirm = isSource ? row.sourceStoreId! : row.targetStoreId!;
      await handleConfirmStoreTransfer(row, storeIdToConfirm);
      return;
    }

    if (currentMode === 'STAFFING_VIEW' && step === 'staffing_list') {
      const acceptMatch = command.match(/^tiep nhan(?: (\d+))?$/);
      if (acceptMatch) {
        const idx = acceptMatch[1] ? Number(acceptMatch[1]) - 1 : 0;
        const item = staffingListRef.current[idx];
        if (item) await handleStaffingDecision(item, 'ACCEPT');
        else say('Không tìm thấy yêu cầu theo số thứ tự.');
        return;
      }
      const transferMatch = command.match(/^(?:lap )?dieu chuyen(?: (\d+))?$/) || command.match(/^(\d+)$/);
      if (transferMatch) {
        const idx = transferMatch[1] ? Number(transferMatch[1]) - 1 : 0;
        const item = staffingListRef.current[idx];
        if (item) {
          handleStartTransferFromStaffing(item);
          return;
        }
      }
      say('Vui lòng bấm **Lập điều chuyển đáp ứng** trên thẻ hoặc gõ số thứ tự (VD: **“1”**, **“điều chuyển 1”**).');
      return;
    }

    if (currentMode === 'HR_REVIEW' && step === 'review_list') {
      const approveMatch = command.match(/^(?:phe )?duyet(?: (\d+))?$/) || command.match(/^(?:dong y|xac nhan)(?: (\d+))?$/);
      if (approveMatch) {
        const idx = approveMatch[1] ? Number(approveMatch[1]) - 1 : 0;
        const row = reviewListRef.current[idx];
        if (row) await handleHrReviewDecision(row, 'APPROVE');
        else say('Không tìm thấy đề xuất theo số thứ tự.');
        return;
      }
      const rejectMatch = text.match(/^(?:từ chối|tu choi)(?:\s+(\d+))?[:\s-]*(.*)$/i);
      if (rejectMatch) {
        const idx = rejectMatch[1] ? Number(rejectMatch[1]) - 1 : 0;
        const row = reviewListRef.current[idx];
        const rejectReason = rejectMatch[2]?.trim() || 'HR từ chối đề xuất qua Chatbot.';
        if (row) await handleHrReviewDecision(row, 'REJECT', rejectReason);
        else say('Không tìm thấy đề xuất theo số thứ tự.');
        return;
      }
      say('Vui lòng bấm **HR Phê duyệt** / **HR Từ chối** trên thẻ hoặc gõ **“duyệt 1”**, **“từ chối 1: lý do”**.');
      return;
    }
  }

  // Card renderers
  function renderTransferConfirmCards(items: LifecycleRow[]) {
    return (
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        {items.map((row) => {
          const isSource = stores.some((s) => s.id === row.sourceStoreId);
          const storeIdToConfirm = isSource ? row.sourceStoreId! : row.targetStoreId!;
          const alreadyConfirmed = row.confirmations.some((c) => c.storeId === storeIdToConfirm);

          return (
            <div
              key={row.id}
              className="crm-report-card"
              style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <strong>
                  {row.employeeName || row.employeeId} {row.employeeCode ? `(${row.employeeCode})` : ''}
                </strong>
                <span className="chip chip--warn">
                  {isSource ? 'Cửa hàng đi' : 'Cửa hàng đến'} · {alreadyConfirmed ? 'Đã đồng ý' : 'Chờ xác nhận'}
                </span>
              </div>
              <p style={{ margin: '6px 0', fontSize: 13 }}>
                {storeName(row.sourceStoreId, row.sourceStoreName)} ➔ {storeName(row.targetStoreId, row.targetStoreName)}
              </p>
              <p style={{ margin: '4px 0', fontSize: 12, opacity: 0.8 }}>
                Ngày hiệu lực: {new Date(row.effectiveAt).toLocaleDateString('vi-VN')} · Lý do: {row.reason}
              </p>
              {!alreadyConfirmed && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void handleConfirmStoreTransfer(row, storeIdToConfirm)}
                  >
                    Đồng ý tiếp nhận / điều chuyển
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderStaffingViewCards(items: StaffingItem[]) {
    return (
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        {items.map((item) => (
          <div
            key={item.id}
            className="crm-report-card"
            style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <strong>
                Cửa hàng: {storeName(item.storeId, item.storeName)} (Cần {item.quantity} NV{item.jobTitle ? ` - ${item.jobTitle}` : ''})
              </strong>
              <span className="chip chip--info">
                Tiến độ: {item.progress.completed}/{item.quantity} (Đã lập: {item.progress.linked}/{item.quantity})
              </span>
            </div>
            <p style={{ margin: '6px 0', fontSize: 12, opacity: 0.8 }}>
              SM đề xuất: {item.requesterName || 'SM'} · Cần trước: {new Date(item.neededBy).toLocaleDateString('vi-VN')}
            </p>
            <p style={{ margin: '4px 0', fontSize: 13 }}>Lý do: {item.reason}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {item.progress.linked < item.quantity && (
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => handleStartTransferFromStaffing(item)}
                >
                  Lập điều chuyển đáp ứng ({item.progress.linked}/{item.quantity})
                </button>
              )}
              {item.status === 'PENDING_AM' && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void handleStaffingDecision(item, 'ACCEPT')}
                >
                  AM Tiếp nhận
                </button>
              )}
              {item.progress.linked === 0 && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    const input = window.prompt('Nhập lý do AM từ chối yêu cầu bổ sung nhân sự:');
                    if (input && input.trim()) void handleStaffingDecision(item, 'REJECT', input.trim());
                  }}
                >
                  AM Từ chối
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderHrReviewCards(items: LifecycleRow[]) {
    const kindLabels = { EXIT: 'Nghỉ việc', REACTIVATE: 'Tái kích hoạt', TRANSFER: 'Điều chuyển' };
    return (
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        {items.map((row) => (
          <div
            key={row.id}
            className="crm-report-card"
            style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <strong>
                {kindLabels[row.kind]}: {row.employeeName || row.employeeId} {row.employeeCode ? `(${row.employeeCode})` : ''}
              </strong>
              <span className="chip chip--warn">Chờ HR phê duyệt</span>
            </div>
            <p style={{ margin: '6px 0', fontSize: 13 }}>
              {row.kind === 'TRANSFER'
                ? `${storeName(row.sourceStoreId, row.sourceStoreName)} ➔ ${storeName(row.targetStoreId, row.targetStoreName)}`
                : `Cửa hàng: ${storeName(row.sourceStoreId, row.sourceStoreName)}`}
            </p>
            <p style={{ margin: '4px 0', fontSize: 12, opacity: 0.8 }}>
              Đề xuất bởi: {row.requesterName || 'Quản lý'} · Hiệu lực: {new Date(row.effectiveAt).toLocaleDateString('vi-VN')}
            </p>
            <p style={{ margin: '4px 0', fontSize: 13 }}>Lý do: {row.reason}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void handleHrReviewDecision(row, 'APPROVE')}
              >
                HR Phê duyệt
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  const input = window.prompt('Nhập lý do từ chối đề xuất:');
                  if (input && input.trim()) void handleHrReviewDecision(row, 'REJECT', input.trim());
                }}
              >
                HR Từ chối
              </button>
              {onOpenLifecycleCrm && (
                <button type="button" className="btn" disabled={busy} onClick={() => onOpenLifecycleCrm(row.id)}>
                  Xem trên CRM
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="guta-chat-body" role="log" aria-label="Quản lý nhân sự và điều chuyển trong chat">
        <div className="guta-chat-width">
          {turns.map((turn, index) => (
            <article className="guta-chat-message" data-sender={turn.sender} key={index}>
              <strong>{turn.sender === 'user' ? 'Bạn' : 'Guta AI'}</strong>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{turn.text}</p>
              {turn.card}
            </article>
          ))}
          {busy && <p role="status">Đang xử lý…</p>}
          <div ref={endRef} />
        </div>
      </div>
      <div className="guta-chat-bottom">
        <div className="guta-chat-width">
          <button type="button" className="btn" disabled={busy} onClick={onExit}>
            Quay lại hội thoại
          </button>
        </div>
        {step !== 'closed' && renderComposer((text) => void send(text), busy, 'Nhập phản hồi, số thứ tự, “xác nhận” hoặc “hủy”…')}
      </div>
    </>
  );
}
