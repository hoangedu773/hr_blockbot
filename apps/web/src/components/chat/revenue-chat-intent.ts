export function revenueText(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
}

export function revenueParts(text: string) {
  const parts = /^(.+?)(?:[\s,;]+(?:lý do|ly do|ghi chú|ghi chu|nội dung|noi dung)\s*[:=]\s*|\s+(?:bởi vì|vì|vi)\s+(?!sao\b))(.+)$/is.exec(text);
  return { instruction: (parts?.[1] ?? text).trim(), note: parts?.[2].trim() ?? '' };
}

export type RevenueIntent =
  | 'list' | 'periods' | 'detail' | 'history' | 'export' | 'pending' | 'help'
  | 'create' | 'open' | 'close-check' | 'compute' | 'close'
  | 'draft' | 'edit' | 'publish' | 'accept' | 'refuse' | 'keep' | 'force' | 'cancel-target' | 'adjust-target'
  | 'request' | 'verify' | 'approve-adjustment' | 'reject-adjustment' | 'responsibility'
  | 'miss-reason' | 'review-reason' | 'return-reason' | 'confirm' | 'waive' | 'correct'
  | 'ai' | 'apply-ai';

const rules: [RevenueIntent, RegExp][] = [
  ['close-check', /(?:con (?:vuong|thieu)|du dieu kien|kiem tra|san sang|xem truoc|truoc khi).*\b(?:chot|dong)(?: ky)?\b/],
  ['create', /(?:tao|lap|khoi tao) (?:mot )?ky/],
  ['open', /(?:mo|bat dau) ky|(?:tao|bo sung|xem truoc).*ban nhap.*(?:con )?thieu/],
  ['close', /(?:chot|dong|khoa|ket) ky/],
  ['compute', /(?:tinh|cap nhat|tong hop) (?:lai )?(?:ket qua|doanh thu thuc te)/],
  ['periods', /(?:danh sach|liet ke|cac) ky|co (?:nhung )?ky nao/],
  ['export', /(?:xuat|tai).*(?:bao cao|csv|excel|file|kpi)/],
  ['history', /lich su|cac phien ban/],
  ['apply-ai', /(?:ap dung|dung).*(?:de xuat|goi y).*ai|ap dung de xuat/],
  ['ai', /(?:de xuat|goi y).*(?:ai|muc tieu)|ai.*(?:de xuat|goi y)/],
  ['responsibility', /(?:doi|thay|ban giao).*(?:sm|nguoi phu trach)/],
  ['reject-adjustment', /(?:tu choi|bac).*(?:dieu chinh|doi muc tieu)/],
  ['approve-adjustment', /(?:duyet|dong y|chap thuan|chap nhan).*(?:dieu chinh|doi muc tieu)/],
  ['verify', /(?:xac minh|doi chieu).*(?:dieu chinh|yeu cau)/],
  ['request', /(?:xin|yeu cau|de nghi|muon).*(?:dieu chinh|doi muc tieu)/],
  ['return-reason', /(?:tu choi|tra lai|bac|bo sung).*(?:giai trinh|ly do chua dat)/],
  ['review-reason', /(?:duyet|chap nhan|ghi nhan|xem xet|dong y).*(?:giai trinh|ly do chua dat)/],
  ['waive', /mien.*giai trinh/],
  ['miss-reason', /(?:gui|nop|viet|them|nhap).*giai trinh|^giai trinh(?: |$)/],
  ['correct', /(?:sua|dieu chinh|hieu chinh).*(?:sau chot|ket qua da chot)/],
  ['confirm', /(?:xac nhan|nghiem thu|duyet).*(?:ket qua|so cuoi ky)/],
  ['force', /(?:kich hoat|ap dung).*khong (?:can|cho).*xac nhan/],
  ['cancel-target', /(?:huy|bo|rut).*(?:chi tieu|muc tieu|kpi)/],
  ['keep', /giu nguyen.*(?:chi tieu|muc tieu|kpi)/],
  ['adjust-target', /(?:dieu chinh|sua).*(?:sau tu choi|dang cho hr|yeu cau nhan lai)/],
  ['refuse', /(?:tu choi|khong nhan|khong dong y).*(?:kpi|chi tieu|muc tieu|muc \d)|^tu choi$/],
  ['accept', /(?:chap nhan|dong y|xac nhan nhan|tiep nhan|nhan).*(?:kpi|chi tieu|muc tieu|muc \d)|^(?:chap nhan|dong y|nhan)$/],
  ['publish', /(?:phat hanh|cong bo|gui giao).*(?:kpi|chi tieu|muc tieu|ban nhap|muc \d)|^phat hanh$/],
  ['draft', /(?:tao|them|giao|lap|gan).*(?:ban nhap|chi tieu|muc tieu|kpi)/],
  ['edit', /(?:sua|doi|cap nhat).*(?:ban nhap|chi tieu|muc tieu)/],
  ['pending', /can xu l[yi]|dang cho|cho toi xu l[yi]|con thieu|can lam gi|chua co sm|kiem tra nguoi phu trach/],
  ['detail', /chi tiet|^(?:doc|mo|xem|chon) (?:muc|so|cai|ho so|\d)|^(?:muc|so) \d|^\d+[.!?]*$/],
  ['help', /lam duoc gi|huong dan|tro giup|cach dung/],
];

export function detectRevenueIntent(text: string, inContext: boolean): RevenueIntent | null {
  const command = revenueText(revenueParts(text).instruction);
  const scoped = /\b(?:kpi doanh thu|chi tieu doanh thu|muc tieu doanh thu|ky doanh thu)\b/.test(command);
  const periodCommand = /\b(?:tao|lap|mo|chot|dong|khoa) ky\b/.test(command) && /\b(?:thang|20\d{2}-|\d{1,2}\/20\d{2})/.test(command);
  if (/\b(?:hieu suat|tiep nhan nhan vien|ho so tiep nhan|ho so cua toi|lich lam|thong bao|nghiem thu cong viec|thong tin nhan su)\b/.test(command) && !scoped) return null;
  if (!scoped && !inContext && !periodCommand) return null;
  const match = rules.find(([, rule]) => rule.test(command));
  const readQuestion = /^(?:(?:toi muon|hay|cho (?:toi|minh)) )?(?:xem(?! (?:truoc|xet))|liet ke)\b/.test(command);
  if (readQuestion && match && !['close-check', 'periods', 'history', 'pending', 'detail', 'help'].includes(match[0])) {
    return /\bgiai trinh\b/.test(command) ? 'detail' : 'list';
  }
  if (match) return match[0];
  return scoped || (inContext && /^(?:xem|liet ke|danh sach)?\s*(?:kpi|ky|thang|cua hang|khu vuc|ban nhap)\b/.test(command)) ? 'list' : null;
}

export function revenueMonth(text: string, fallback: string) {
  const command = revenueText(text);
  const iso = command.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  const named = command.match(/\b(?:thang|ky)\s*(0?[1-9]|1[0-2])(?:\s*[/.-]\s*|\s+nam\s+|\s+)?(20\d{2})?\b/)
    ?? command.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})\b/);
  if (iso) return iso[0];
  if (named) return (named[2] || fallback.slice(0, 4)) + '-' + named[1].padStart(2, '0');
  if (/\b(?:thang|ky) (?:nay|hien tai)\b/.test(command)) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  }
  const shift = /\bthang (?:truoc|roi)\b/.test(command) ? -1 : /\bthang (?:sau|toi)\b/.test(command) ? 1 : 0;
  if (shift) return new Date(Date.UTC(Number(fallback.slice(0, 4)), Number(fallback.slice(5)) - 1 + shift, 1)).toISOString().slice(0, 7);
  return fallback;
}

export function pickRevenueChoice<T>(text: string, options: T[], label: (item: T) => string) {
  const query = revenueText(text).replace(/[.?!]+$/, '').trim();
  const number = query.match(/^(?:(?:chon|xem|doc|mo) )?(?:(?:muc|so|cai) )?(\d+)$/)
    ?? query.match(/\b(?:muc|so) (\d+)\b/);
  if (number) {
    const selected = options[Number(number[1]) - 1];
    return selected ? [selected] : [];
  }
  if (/\b(?:cai|muc|ho so) dau tien\b/.test(query)) return options.slice(0, 1);
  const exact = options.filter(item => revenueText(label(item)) === query);
  if (exact.length) return exact;
  const fragments = query.split(/(?:cua hang|chi nhanh|khu vuc|cho|tai|o)\s+/).slice(1)
    .map(part => part.split(/\b(?:thang|ky|voi|muc tieu|ly do|thanh|len|xuong)\b/)[0].trim().replace(/^[,;:-]+|[,;:-]+$/g, '').trim())
    .filter(part => part.length > 3);
  return options.filter(item => {
    const normalized = revenueText(label(item));
    const tokens = normalized.match(/\b\d{2,4}[a-z]?\s+[^-]+$/);
    return normalized.length > 2 && (query.includes(normalized) || (query.length > 2 && normalized.includes(query))
      || fragments.some(fragment => normalized.includes(fragment)) || (!!tokens && query.includes(tokens[0].trim())));
  });
}
