import { useEffect, useRef, useState } from 'react';
import type {
  AssignmentCandidate,
  AuthorizationCapability,
  F4Suggestions,
  PerformanceEvaluation,
  PerformanceKpiEvaluationAction,
  PerformanceKpiEvaluationActionPreview,
  Project,
  Report,
  TaskInstance,
  TaskTemplate,
} from '@hr-blockbot/contracts';
import * as api from '../../services/performance-kpi-api';
import {
  assignProject,
  createProject,
  fetchMe,
  fetchProjectById,
  fetchProjectReports,
  fetchProjects,
  fetchReplacementCandidates,
  newClientMessageId,
  respondAssignment,
  reviewReport,
  submitReport,
  transitionProject,
  updateProjectProgress,
} from '../../services/api';
import { performanceDate, performanceLabels, performanceNumber } from '../TaskDetailView';

type Turn = { sender: 'user' | 'assistant'; text: string };
type Step<T> = Generator<string, T, string> | AsyncGenerator<string, T, string>;
type Plan = { summary: string; readOnly?: boolean; execute: (signal: AbortSignal) => Promise<string> };
type Decision =
  | { step: Step<Plan>; optional?: boolean; canAcceptInput?: (text: string) => boolean }
  | { plan: Plan };
type Session = {
  domain: 'project' | 'task' | 'evaluation';
  period: string;
  projectIds: string[];
  taskIds: string[];
  evaluationIds: string[];
  selectedId?: string;
};

export type WorkPerfIntent =
  | 'project-list'
  | 'project-pending'
  | 'project-detail'
  | 'project-suggest'
  | 'project-create'
  | 'project-assign'
  | 'project-accept'
  | 'project-decline'
  | 'project-start'
  | 'project-progress'
  | 'project-submit'
  | 'project-review'
  | 'project-rework'
  | 'task-list'
  | 'task-pending'
  | 'task-detail'
  | 'task-create'
  | 'task-suggest'
  | 'task-template-propose'
  | 'task-template-review'
  | 'task-rework'
  | 'task-assign'
  | 'task-accept'
  | 'task-refuse'
  | 'task-progress'
  | 'task-submit'
  | 'task-evaluate'
  | 'task-refusal-decision'
  | 'eval-migrate'
  | 'eval-list'
  | 'eval-pending'
  | 'eval-detail'
  | 'eval-self-review'
  | 'eval-score'
  | 'eval-finalize'
  | 'eval-reconsider'
  | 'eval-reconsider-response'
  | 'eval-appeal'
  | 'eval-appeal-decision'
  | 'help';

const PROJECT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  ASSIGNED: 'Đã giao',
  IN_PROGRESS: 'Đang thực hiện',
  PENDING_REVIEW: 'Chờ nghiệm thu',
  COMPLETED: 'Hoàn thành',
};

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  PENDING_ACCEPTANCE: 'Chờ nhân viên tiếp nhận',
  ACCEPTED: 'Đã nhận việc',
  MANAGER_REVIEW: 'Chờ quản lý xem xét',
  HANDOVER_PENDING: 'Đang chờ bàn giao',
};

function normalizeText(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
}

function splitReason(text: string) {
  const parts = /^(.+?)(?:[\s,;]+(?:lý do|ly do|ghi chú|ghi chu|nội dung|noi dung|nhận xét|nhan xet|báo cáo|bao cao)\s*[:=]\s*|\s+(?:bởi vì|vì|vi)\s+(?!sao\b))(.+)$/is.exec(text);
  if (parts) {
    return { instruction: parts[1].trim(), note: parts[2].trim() };
  }
  const colonReport = /^((?:nộp|nop|gửi|gui|báo cáo|bao cao|nghiệm thu|nghiem thu|duyệt|duyet|yêu cầu làm lại|yeu cau lam lai|trả lại|tra lai|từ chối|tu choi)\b[^:]{3,160}):\s+(.+)$/is.exec(text);
  if (colonReport) {
    return { instruction: colonReport[1].trim(), note: colonReport[2].trim() };
  }
  return { instruction: text.trim(), note: '' };
}

function currentMonthVN() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

function formatDateVN(iso?: string | null) {
  if (!iso) return 'Chưa đặt hạn';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function resolvePeriod(text: string, fallback: string) {
  const q = normalizeText(text);
  const iso = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return iso[0];
  const slash = q.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})\b/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, '0')}`;
  const named = q.match(/\b(?:thang|ky)\s*(0?[1-9]|1[0-2])(?:\s+nam\s+(20\d{2}))?\b/);
  if (named) return `${named[2] || fallback.slice(0, 4)}-${named[1].padStart(2, '0')}`;
  if (/\b(?:thang|ky) (?:nay|hien tai)\b/.test(q)) return currentMonthVN();
  if (/\bthang (?:truoc|roi)\b/.test(q)) {
    return new Date(Date.UTC(Number(fallback.slice(0, 4)), Number(fallback.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  }
  return fallback;
}

function pickChoice<T>(text: string, items: T[], label: (item: T) => string): T[] {
  const q = normalizeText(text).replace(/[.?!]+$/, '').trim();
  const numMatch = q.match(/^(?:(?:chon|xem|doc|mo|nhan|nop|giao|cham|nghiem thu|tu choi|xu ly|phan hoi|cong bo|chot|bat dau|lam lai|ung vien) )?(?:(?:muc|so|cai|nhiem vu|cong viec|ho so|ung vien) )?(\d+)$/)
    ?? q.match(/\b(?:muc|so|nhiem vu|cong viec|ho so|ung vien) (\d+)\b/);
  if (numMatch) {
    const picked = items[Number(numMatch[1]) - 1];
    return picked ? [picked] : [];
  }
  if (/\b(?:muc|so|cai|ho so|nhiem vu|cong viec|ung vien) dau tien\b/.test(q)) return items.slice(0, 1);
  return items.filter(item => {
    const l = normalizeText(label(item));
    return l.length > 2 && (q.includes(l) || (q.length > 3 && l.includes(q)));
  });
}

function extractProjectSearchTitle(text: string): string {
  const cleaned = text
    .replace(/[?!.]+$/g, '')
    .replace(/^(?:cho\s+(?:tôi|toi|mình|minh|anh|em)\s+(?:hỏi|hoi|xem|biết|biet)\s+)?/iu, '')
    .replace(/^(?:ai\s+(?:là\s+người\s+|la\s+nguoi\s+)?(?:phù\s+hợp|phu\s+hop)\s+(?:nhất\s+|nhat\s+)?(?:với|voi|cho|làm|lam|nhận|nhan)\s+(?:công\s+việc|cong\s+viec|việc|viec)\s+)/iu, '')
    .replace(/^(?:(?:gợi\s+ý|goi\s+y)\s+(?:người|nguoi|nhân\s+sự|nhan\s+su|ứng\s+viên|ung\s+vien)(?:\s+(?:bằng|bang)\s+phobert)?\s*(?:cho|với|voi|nhận|nhan|làm|lam)?\s*(?:công\s+việc|cong\s+viec|việc|viec)?\s*)/iu, '')
    .replace(/^(?:phobert\s+(?:gợi\s+ý|goi\s+y)\s+(?:cho\s+)?(?:công\s+việc|cong\s+viec|việc|viec)?\s*)/iu, '')
    .replace(/^(?:(?:tạo|tao|thêm|them)\s+(?:bản\s+diễn\s+tập\s+|ban\s+dien\s+tap\s+)?(?:công\s+việc(?:\s+thường|\s+mới)?|cong\s+viec(?:\s+thuong|\s+moi)?|việc(?:\s+mới)?|viec(?:\s+moi)?)\s*[:=-]?\s*)/iu, '')
    .replace(/^(?:giao|phân\s+công|phan\s+cong|nhận|nhan|tiếp\s+nhận|tiep\s+nhan|đồng\s+ý\s+nhận|dong\s+y\s+nhan|bắt\s+đầu(?:\s+làm|\s+thực\s+hiện)?|bat\s+dau(?:\s+lam|\s+thuc\s+hien)?|thực\s+hiện|thuc\s+hien|cập\s+nhật\s+tiến\s+độ|cap\s+nhat\s+tien\s+do|tiến\s+độ|tien\s+do|nộp\s+báo\s+cáo|nop\s+bao\s+cao|gửi\s+báo\s+cáo|gui\s+bao\s+cao|báo\s+cáo\s+hoàn\s+thành|bao\s+cao\s+hoan\s+thanh|nộp|nop|nghiệm\s+thu|nghiem\s+thu|duyệt\s+báo\s+cáo|duyet\s+bao\s+cao|hoàn\s+thành\s+nghiệm\s+thu|hoan\s+thanh\s+nghiem\s+thu|yêu\s+cầu\s+làm\s+lại|yeu\s+cau\s+lam\s+lai|trả\s+lại\s+báo\s+cáo|tra\s+lai\s+bao\s+cao|từ\s+chối\s+nghiệm\s+thu|tu\s+choi\s+nghiem\s+thu|từ\s+chối|tu\s+choi|xem\s+chi\s+tiết|xem\s+chi\s+tiet|chi\s+tiết|chi\s+tiet)\s+(?:công\s+việc(?:\s+thường)?|cong\s+viec(?:\s+thuong)?|việc|viec|báo\s+cáo\s+công\s+việc|bao\s+cao\s+cong\s+viec)?\s*[:=-]?\s*/iu, '')
    .replace(/\s+(?:cho|với|voi)\s+[A-ZÀ-Ỹa-zà-ỹ\s]{2,40}$/u, '')
    .replace(/\s+\d{1,3}\s*%$/i, '')
    .trim();
  return cleaned.replace(/^[“"'`]+|[”"'`]+$/g, '').trim();
}

function stripBracketPrefix(title: string) {
  return title.replace(/^\s*\[[^\]]+\]\s*/, '').trim();
}

function matchProjectsByInstruction(instruction: string, projects: Project[], selectedId?: string): Project[] {
  const numPick = pickChoice(instruction, projects, p => p.title);
  const qNorm = normalizeText(instruction);
  if (/^(?:(?:chon|xem|doc|mo|nhan|nop|giao|nghiem thu|bat dau|lam lai|tu choi) )?(?:(?:muc|so|cai|cong viec) )?\d+$/.test(qNorm) || /\b(?:muc|so) \d+\b/.test(qNorm)) {
    return numPick;
  }
  if (/\b(?:cong viec nay|viec nay|muc nay|vua tao)\b/.test(qNorm) && selectedId) {
    const sel = projects.find(p => p.id === selectedId);
    if (sel) return [sel];
  }

  const rawTarget = extractProjectSearchTitle(instruction);
  const targetNorm = normalizeText(rawTarget);
  const bracketMatch = rawTarget.match(/\[([^\]]+)\]/);
  const bracketTagNorm = bracketMatch ? normalizeText(bracketMatch[1]) : '';

  if (bracketTagNorm) {
    const exactBracket = projects.filter(p => normalizeText(p.title).includes(`[${bracketTagNorm}]`));
    if (exactBracket.length) {
      if (targetNorm.length > bracketTagNorm.length + 2) {
        const refined = exactBracket.filter(p => normalizeText(p.title).includes(targetNorm));
        if (refined.length) return refined;
      }
      return exactBracket;
    }
  }

  if (targetNorm && targetNorm.length >= 3) {
    const direct = projects.filter(p => {
      const full = normalizeText(p.title);
      const base = normalizeText(stripBracketPrefix(p.title));
      return full.includes(targetNorm) || targetNorm.includes(full) || (base.length >= 3 && (base.includes(targetNorm) || targetNorm.includes(base)));
    });
    if (direct.length) return direct;
  }

  return projects.filter(p => {
    const base = normalizeText(stripBracketPrefix(p.title));
    return base.length >= 4 && qNorm.includes(base);
  });
}

function formatPhoBertSuggestions(project: { title: string; status: string; version: number; requiredSkills?: string[] }, advice: F4Suggestions): string {
  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? performanceLabels[project.status] ?? project.status;
  const sourceLine = advice.source === 'PHOBERT'
    ? `• Nguồn mô hình: ${advice.model} (revision ${advice.revision}) · Chế độ: PHOBERT (mô hình chạy thật) · Trọng số ngữ nghĩa α=${advice.semanticWeight}`
    : `• Nguồn gợi ý: ${advice.source} (Trạng thái: ${advice.status})`;

  const header = [
    `Kết quả gợi ý ứng viên cho công việc: “${project.title}”`,
    `• Trạng thái công việc: ${statusLabel} · Phiên bản v${project.version}`,
    `• Kỹ năng yêu cầu: ${project.requiredSkills?.length ? project.requiredSkills.join(', ') : 'Chưa khai báo'}`,
    sourceLine,
    `• Phạm vi đánh giá: ${advice.candidatesConsidered} nhân sự đủ điều kiện tại cửa hàng`,
  ];

  if (!advice.items.length) {
    header.push('\nHiện không có ứng viên nào trong danh sách gợi ý tự động. Quản lý có thể chọn nhân sự thủ công.');
    return header.join('\n');
  }

  const candidateLines = advice.items.map((c, idx) => {
    const scoreText = c.suitabilityScore !== null ? `${c.suitabilityScore}/100` : 'Chưa đủ dữ liệu kỹ năng';
    const exactPct = c.skillScore !== null ? `${Math.round(c.skillScore * 100)}%` : '—';
    const semPct = c.semanticScore !== null ? `${Math.round(c.semanticScore * 100)}%` : '—';
    const matchedText = c.matchedSkills.length ? c.matchedSkills.join(', ') : 'Chưa có';
    const missingText = c.missingSkills.length ? ` · Chưa khớp chính xác: ${c.missingSkills.join(', ')}` : '';
    const evidenceText = c.semanticEvidence.length
      ? c.semanticEvidence.map(pair => `${pair.required} ↔ ${pair.matched ?? '—'} (cosine ${pair.cosine.toFixed(4)})`).join('; ')
      : 'Không có cặp đối sánh';
    const missingNote = c.missingData.length ? ` (${c.missingData.join(' ')})` : '';
    return [
      `${idx + 1}. ${c.fullName} — Điểm phù hợp: ${scoreText} (Khớp chính xác: ${exactPct} · Ngữ nghĩa: ${semPct})`,
      `   • Kỹ năng khớp: ${matchedText}${missingText}`,
      `   • Đối sánh ngữ nghĩa: ${evidenceText}`,
      `   • Lý do gợi ý: ${c.explanation}${missingNote}`,
    ].join('\n');
  });

  return [
    ...header,
    '',
    ...candidateLines,
  ].join('\n');
}

export function detectWorkPerfIntent(text: string, session?: Session): WorkPerfIntent | null {
  const { instruction } = splitReason(text);
  const q = normalizeText(instruction);

  // Never intercept policy/regulation questions, schedule, onboarding, revenue KPI, or ops/HR modules
  if (/\b(?:quy dinh|quy che|bieu mau|huong dan|cach tinh|cong thuc|di tre|nghi le|cham cong|lich lam|phan ca|bang dang ky ca|dang ky ca|ca truc|doi ca|tiep nhan nhan vien|ho so tiep nhan|kpi doanh thu|chi tieu doanh thu|doanh thu|tien ket|bao cao ban hang|uy quyen|danh sach chi nhanh|danh sach cua hang|danh ba nhan su|danh sach nhan su|danh sach nhan vien|ho so cua toi|so dien thoai|yeu cau sua ho so|yeu cau cap nhat ho so|thong bao|xin bo sung nhan su|dieu chuyen)\b/.test(q)) {
    return null;
  }

  if (/\b(?:chuyen|xac minh)\b.*\bho so\b.*\bkpi\b|\bkpi\b.*\b(?:can chuyen|can xac minh)\b/.test(q)) return 'eval-migrate';

  // Scored KPI tasks explicitly mention "có thang điểm" or "nhiệm vụ"
  const templateAction = /\b(?:goi y|de xuat) (?:mau|thang) (?:cham|diem)\b/.test(q) ? 'task-template-propose'
    : /\b(?:duyet|cong bo|tu choi) mau (?:cham|thang diem)\b/.test(q) ? 'task-template-review' : null;
  if (templateAction) return templateAction;
  const hasScoredTaskScope = /\b(?:cong viec co thang diem|viec co thang diem|cong viec tinh kpi|nhiem vu kpi|nhiem vu co thang diem|nhiem vu duoc giao|nhiem vu cua toi|nhiem vu thang|giao nhiem vu|nhan nhiem vu|nop nhiem vu|nghiem thu nhiem vu|cham nhiem vu|danh gia nhiem vu)\b/.test(q);
  const hasEvalScope = /\b(?:kpi hieu suat|danh gia hieu suat|diem hieu suat)\b/.test(q);

  // Regular work (Công việc & nghiệm thu) + PhoBERT candidate suggestion
  const hasPhoBertSuggest = /\b(?:ai phu hop|nguoi phu hop|ung vien phu hop|goi y nguoi|goi y nhan su|goi y ung vien|phobert|de xuat nguoi|de xuat ung vien)\b/.test(q);
  const hasRegularProjectScope = !hasScoredTaskScope && (
    hasPhoBertSuggest ||
    /\b(?:cong viec thuong|cong viec va nghiem thu|tao cong viec|tao ban dien tap|them cong viec|giao cong viec|phan cong cong viec|nhan cong viec|tiep nhan cong viec|bat dau cong viec|bat dau lam cong viec|thuc hien cong viec|cap nhat tien do cong viec|tien do cong viec|nop bao cao|gui bao cao|bao cao hoan thanh|duyet bao cao|yeu cau lam lai|tra lai bao cao|tu choi nghiem thu|nghiem thu cong viec|cong viec can nghiem thu|viec can nghiem thu|danh sach cong viec|cong viec cua toi|cong viec cua hang|cong viec ban nhap|kiem ke quay pha che cuoi ca|demo bv f4|dien tap)\b/.test(q)
  );

  // Let single personal KPI summary ("KPI hiệu suất của tôi") go to backend `/api/chat/stream` so it renders the native performanceKpi card,
  // unless the user asks for an action (tự nhận xét, kiến nghị, khiếu nại, phản hồi) or list/store/team view.
  const isSimpleOwnEvalRead = hasEvalScope
    && /\b(?:cua toi|cua minh|cua em|ca nhan)\b/.test(q)
    && !/\b(?:tu nhan xet|tu danh gia|kien nghi|khieu nai|phan hoi|cham diem|cong bo|chot|danh sach|cua hang|doi ngu|can xu ly|cho cham|lich su|chi tiet)\b/.test(q);
  if (isSimpleOwnEvalRead) return null;

  if (!hasRegularProjectScope && !hasScoredTaskScope && !hasEvalScope && !session) return null;

  if (/\b(?:tro giup|huong dan thao tac|lam duoc gi)\b/.test(q)) return 'help';

  const activeDomain = hasRegularProjectScope
    ? 'project'
    : hasScoredTaskScope
      ? 'task'
      : hasEvalScope
        ? 'evaluation'
        : session?.domain;

  if (activeDomain === 'project') {
    if (hasPhoBertSuggest) return 'project-suggest';
    if (/\b(?:tao cong viec|tao ban dien tap|them cong viec|tao viec moi|tao moi cong viec)\b/.test(q)) return 'project-create';
    if (/\b(?:yeu cau lam lai|lam lai|tra lai bao cao|tu choi nghiem thu|bac bao cao)\b/.test(q)) return 'project-rework';
    if (/\b(?:nghiem thu|duyet bao cao|hoan thanh nghiem thu)\b/.test(q) && !/\b(?:can nghiem thu|cho nghiem thu|cong viec va nghiem thu)\b/.test(q)) return 'project-review';
    if (/\b(?:nop bao cao|gui bao cao|bao cao hoan thanh|nop cong viec|nop ket qua|nop muc)\b/.test(q)) return 'project-submit';
    if (/\b(?:bat dau|trien khai|chuyen sang dang thuc hien)\b/.test(q)) return 'project-start';
    if (/\b(?:cap nhat tien do|tien do)\b/.test(q)) return 'project-progress';
    if (/\b(?:tu choi|khong nhan)\b/.test(q)) return 'project-decline';
    if (/\b(?:chap nhan|dong y nhan|tiep nhan|nhan cong viec|nhan viec|nhan muc)\b/.test(q) && !/\bcho nhan\b/.test(q)) return 'project-accept';
    if (/\b(?:giao cong viec|giao viec|phan cong|giao muc|giao cho)\b/.test(q) && !/\bduoc giao\b/.test(q)) return 'project-assign';
    if (/\b(?:chi tiet|xem muc|doc muc|mo muc|muc \d|so \d)\b/.test(q) || /^(?:xem|mo|chon)?\s*\d+$/.test(q)) return 'project-detail';
    if (/\b(?:can xu ly|cho xu ly|cho nhan|cho nghiem thu|can nghiem thu)\b/.test(q)) return 'project-pending';
    return hasRegularProjectScope ? 'project-list' : null;
  }

  if (activeDomain === 'task') {
    if (hasPhoBertSuggest) return 'task-suggest';
    if (/^(?:tao|them)\b/.test(q) && hasScoredTaskScope) return 'task-create';
    if (/\b(?:yeu cau lam lai|tra lai)\b/.test(q)) return 'task-rework';
    if (/\b(?:xu ly tu choi|duyet tu choi|bac tu choi)\b/.test(q)) return 'task-refusal-decision';
    if (/\b(?:nghiem thu|cham diem|cham nhiem vu|danh gia nhiem vu)\b/.test(q) && !/\b(?:can nghiem thu|cho nghiem thu|cho cham)\b/.test(q)) return 'task-evaluate';
    if (/\b(?:nop|gui ket qua|bao cao hoan thanh)\b/.test(q)) return 'task-submit';
    if (/\b(?:tien do|hoan thanh cac buoc|cap nhat buoc)\b/.test(q)) return 'task-progress';
    if (/\b(?:tu choi|khong nhan)\b/.test(q)) return 'task-refuse';
    if (/\b(?:chap nhan|dong y nhan|nhan nhiem vu|nhan viec|nhan muc)\b/.test(q)) return 'task-accept';
    if (/\b(?:giao viec|giao nhiem vu|phan cong|giao muc)\b/.test(q) && !/\bduoc giao\b/.test(q)) return 'task-assign';
    if (/\b(?:chi tiet|xem muc|doc muc|mo muc|muc \d|so \d)\b/.test(q) || /^(?:xem|mo|chon)?\s*\d+$/.test(q)) return 'task-detail';
    if (/\b(?:can xu ly|cho xu ly|cho nhan|cho nghiem thu|cho cham|bi tu choi)\b/.test(q)) return 'task-pending';
    return hasScoredTaskScope ? 'task-list' : null;
  }

  if (activeDomain === 'evaluation') {
    if (/\blich su\b/.test(q)) return 'eval-detail';
    if (/\b(?:xu ly khieu nai|quyet dinh khieu nai|duyet khieu nai)\b/.test(q)) return 'eval-appeal-decision';
    if (/\b(?:khieu nai|gui khieu nai)\b/.test(q)) return 'eval-appeal';
    if (/\b(?:phan hoi kien nghi|tra loi kien nghi|dong y phan hoi|rut kien nghi)\b/.test(q)) return 'eval-reconsider-response';
    if (/\b(?:kien nghi|xem xet lai)\b/.test(q)) return 'eval-reconsider';
    if (/\b(?:cong bo|chot diem|chot kpi)\b/.test(q)) return 'eval-finalize';
    if (/\b(?:cham diem|cham kpi|danh gia tieu chi)\b/.test(q) && !/\bcho cham\b/.test(q)) return 'eval-score';
    if (/\b(?:tu nhan xet|tu danh gia)\b/.test(q)) return 'eval-self-review';
    if (/\b(?:chi tiet|giai thich|xem muc|doc muc|mo muc|muc \d|so \d)\b/.test(q) || /^(?:xem|mo|chon)?\s*\d+$/.test(q)) return 'eval-detail';
    if (/\b(?:can xu ly|cho xu ly|cho cham|dang tranh chap|kien nghi nao|khieu nai nao)\b/.test(q)) return 'eval-pending';
    return hasEvalScope ? 'eval-list' : null;
  }

  return null;
}

function describeProject(p: Project, reportList: Report[] = []) {
  const statusLabel = PROJECT_STATUS_LABELS[p.status] ?? p.status;
  const assignLabel = p.assignmentStatus ? (ASSIGNMENT_STATUS_LABELS[p.assignmentStatus] ?? p.assignmentStatus) : 'Chưa phân công';
  const lines = [
    `${p.title} · Phiên bản v${p.version}`,
    `• Trạng thái: ${statusLabel} (${assignLabel}) · Tiến độ: ${p.progress}%`,
    `• Người nhận: ${p.assigneeName || (p.assigneeId ? 'Đã phân công' : 'Chưa giao')} · Hạn hoàn thành: ${formatDateVN(p.dueDate)}`,
    `• Kỹ năng yêu cầu: ${p.requiredSkills.length ? p.requiredSkills.join(', ') : 'Chưa khai báo'}`,
    p.description ? `• Mô tả: ${p.description}` : '',
  ].filter(Boolean);

  if (reportList.length) {
    const latest = reportList[0];
    lines.push(`• Báo cáo gần nhất (${latest.status}): “${latest.content}”${latest.reason ? ` · Nhận xét duyệt: ${latest.reason}` : ''}`);
  }
  const latestAudit = p.assignmentAudit?.[p.assignmentAudit.length - 1];
  if (latestAudit) {
    lines.push(`• Kiểm toán bất biến: Block #${latestAudit.sequence} (${latestAudit.type}) · SHA-256 ${latestAudit.hash.slice(0, 12)}...`);
  }
  return lines.join('\n');
}

function describeTask(t: TaskInstance, names: Record<string, string>) {
  const assignee = t.assigneeEmployeeId ? (names[t.assigneeEmployeeId] ?? 'Nhân viên được giao') : 'Chưa giao';
  const assignmentLabel = t.assignmentStatus ? (performanceLabels[t.assignmentStatus] ?? t.assignmentStatus) : 'Chưa giao';
  const lines = [
    `${t.title} · Kỳ ${t.kpiPeriod}`,
    `Trạng thái · ${performanceLabels[t.status] ?? t.status} (${assignmentLabel})`,
    `Người nhận · ${assignee} · Trọng số ${performanceNumber(t.taskWeightPercent)}% · Tiến độ ${performanceNumber(t.progressPercent)}%`,
    `Hạn hoàn thành · ${performanceDate(t.extendedDueAt ?? t.dueAt)}`,
    `Mô tả · ${t.description}`,
    `Các bước thực hiện · ${t.stepProgress.map(s => {
      const stepName = t.templateSnapshot.steps.find(step => step.code === s.code)?.name ?? s.code;
      return `${stepName} (${s.done ? 'Đã xong' : 'Chưa xong'})`;
    }).join(' → ')}`,
  ];
  if (t.refusalReason) {
    lines.push(`Lý do từ chối · ${t.refusalReason}`);
  }
  if (t.evaluations.length) {
    const lastEval = t.evaluations[t.evaluations.length - 1];
    lines.push(`Kết quả nghiệm thu · ${performanceNumber(lastEval.totalScore)}/100 điểm (${performanceLabels[lastEval.status] ?? lastEval.status}) · ${lastEval.evaluatorComment}`);
  }
  const latestBlock = t.history[t.history.length - 1];
  if (latestBlock) {
    lines.push(`Chuỗi băm kiểm toán · Block #${t.history.length} · SHA-256 ${latestBlock.hash.slice(0, 12)}...`);
  }
  return lines.join('\n');
}

export function useWorkAndPerformanceChat({
  grants,
  onChanged,
}: {
  grants: readonly AuthorizationCapability[];
  onChanged: () => void;
  onOpenKpiAction?: (target: { id: string; period: string; kind: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const session = useRef<Session>();
  const decision = useRef<Decision>();
  const inFlight = useRef<AbortController>();
  const can = (cap: AuthorizationCapability) => grants.includes(cap);

  const reset = () => {
    inFlight.current?.abort();
    inFlight.current = undefined;
    session.current = undefined;
    decision.current = undefined;
    setBusy(false);
  };

  useEffect(() => () => inFlight.current?.abort(), []);

  function send(text: string, append: (turn: Turn) => void, allowContext = true) {
    const activeSession = allowContext ? session.current : undefined;
    const intent = detectWorkPerfIntent(text, activeSession);
    const q = normalizeText(text).replace(/[.!?]+$/, '');

    // If an optional follow-up step is active (e.g., choosing a PhoBERT candidate after viewing suggestions),
    // and the user instead types a new command or switches to another chat domain, release the optional step cleanly.
    if (decision.current && 'step' in decision.current && decision.current.optional) {
      const isCancel = /^(?:huy|huy thao tac|dung lai|bo qua|thoi)$/.test(q);
      const acceptedByStep = decision.current.canAcceptInput ? decision.current.canAcceptInput(text) : false;
      if (!isCancel && !acceptedByStep) {
        decision.current = undefined;
      }
    }

    if (!allowContext && !intent) {
      return false;
    }
    if (!intent && !decision.current) return false;
    if (inFlight.current) return true;

    const controller = new AbortController();
    inFlight.current = controller;
    const signal = controller.signal;
    const say = (reply: string) => {
      if (!signal.aborted) append({ sender: 'assistant', text: reply });
    };
    const { instruction, note } = splitReason(text);
    append({ sender: 'user', text });
    setBusy(true);

    async function advance(
      result: IteratorResult<string, Plan>,
      step: Step<Plan>,
      options?: { optional?: boolean; canAcceptInput?: (input: string) => boolean },
    ) {
      if (signal.aborted) return;
      if (result.done) {
        if (result.value.readOnly) {
          say(await result.value.execute(signal));
          return;
        }
        decision.current = { plan: result.value };
        say(`${result.value.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
      } else {
        decision.current = { step, optional: options?.optional, canAcceptInput: options?.canAcceptInput };
        say(result.value);
      }
    }

    async function respond() {
      const pending = decision.current;
      if (pending && /^(?:huy|huy thao tac|dung lai|bo qua|thoi)$/.test(q)) {
        decision.current = undefined;
        say('Đã hủy thao tác đang chuẩn bị.');
        return;
      }
      if (pending && 'step' in pending) {
        decision.current = undefined;
        await advance(await pending.step.next(text), pending.step);
        return;
      }
      if (pending && 'plan' in pending) {
        if (!/^(?:toi )?(?:xac nhan(?: thuc hien)?|dong y|tien hanh|thuc hien)$/.test(q)) {
          say('Nhắn “xác nhận” để thực hiện nội dung vừa xem hoặc “hủy” để dừng.');
          return;
        }
        decision.current = undefined;
        say(await pending.plan.execute(signal));
        if (!signal.aborted) onChanged();
        return;
      }

      if (!intent) return;
      if (intent === 'help') {
        say([
          'Bạn có thể thao tác tự nhiên với Công việc & nghiệm thu (công việc thường + PhoBERT), Công việc có thang điểm và KPI hiệu suất:',
          '• Công việc thường & PhoBERT: “Ai phù hợp với công việc kiểm kê quầy pha chế cuối ca?”, “Tạo công việc ...”, “Giao công việc ...”, “Nhận công việc ...”, “Bắt đầu công việc ...”, “Nộp báo cáo công việc ...: <nội dung>”, “Nghiệm thu công việc ...”, “Yêu cầu làm lại công việc ... lý do: <lý do>”.',
          '• Công việc có thang điểm: “Tạo công việc có thang điểm”, “PhoBERT gợi ý người cho công việc có thang điểm”, “Danh sách công việc có thang điểm”, “Nghiệm thu mục 1”. Mẫu mới: “AI đề xuất thang điểm”, rồi HR nhắn “Duyệt mẫu chấm”.',
          '• KPI hiệu suất: “Danh sách KPI hiệu suất tháng này”, “KPI hiệu suất cần xử lý”, “Tự nhận xét KPI hiệu suất”, “Kiến nghị KPI hiệu suất”, “Khiếu nại KPI hiệu suất”.',
        ].join('\n'));
        return;
      }

      const period = resolvePeriod(instruction, session.current?.period ?? currentMonthVN());

      if (intent === 'eval-migrate') {
        if (!can('performance_kpi.policy_manage')) {
          say('HR có quyền quản lý chính sách sẽ xác minh và chuyển hồ sơ KPI.');
          return;
        }
        const { items } = await api.performanceMigrations(period);
        if (signal.aborted) return;
        if (!items.length) { say('Không có hồ sơ KPI cần chuyển trong kỳ ' + period + '.'); return; }
        if (!items.some(item => item.canConvert)) {
          say(['Có ' + items.length + ' hồ sơ cần HR xác minh trước khi chuyển:',
            ...items.map((item, index) => (index + 1) + '. ' + item.employeeName + ' · ' + item.blockedReason),
            'HR cần xác minh tài khoản, cửa hàng và quản lý trực tiếp rồi yêu cầu chuyển lại.'].join('\n'));
          return;
        }
        function* conversionFlow(): Step<Plan> {
          let chosen: api.PendingPerformanceMigration | undefined;
          while (!chosen) {
            const reply = yield ['Hồ sơ KPI cần xác minh trong kỳ ' + period + ':',
              ...items.map((item, index) => (index + 1) + '. ' + item.employeeName + ' · ' + (item.canConvert ? 'Sẵn sàng chuyển' : item.blockedReason)),
              'Chọn số thứ tự của hồ sơ sẵn sàng chuyển hoặc nhắn “hủy”.'].join('\n');
            const number = /^(?:(?:mục|muc|số|so)\s*)?(\d+)$/i.exec(reply.trim());
            const candidate = number ? items[Number(number[1]) - 1] : undefined;
            if (candidate?.canConvert) chosen = candidate;
          }
          const target = chosen;
          const clientRequestId = newClientMessageId();
          return {
            summary: ['Chuyển hồ sơ ' + target.employeeName + ' kỳ ' + period + ' sang đánh giá theo bằng chứng.',
              'Nhận xét quản lý đã lưu · ' + (target.managerReview ?? 'Chưa có'),
              'Điểm quản lý tham khảo · ' + (target.managerScore ?? 'Chưa có'),
              'Người quản lý sẽ chấm từng tiêu chí theo chính sách của kỳ.'].join('\n'),
            execute: async () => {
              await api.performanceConvertEvaluation(target.id, {
                expectedVersion: target.version, clientRequestId, policyId: target.policyId,
                reason: 'HR xác nhận chuyển hồ sơ qua chatbot theo mẫu đánh giá theo bằng chứng.',
              });
              return 'Đã chuyển hồ sơ ' + target.employeeName + '. Người quản lý có thể chấm KPI theo từng tiêu chí.';
            },
          };
        }
        const step = conversionFlow();
        await advance(await step.next(), step);
        return;
      }
      // ---- REGULAR PROJECT DOMAIN (Công việc & nghiệm thu + PhoBERT) ----
      if (intent.startsWith('project-')) {
        const [{ items: allProjects }, me] = await Promise.all([
          fetchProjects({ limit: 50 }),
          fetchMe(),
        ]);
        if (signal.aborted) return;
        const employeeId = me.employeeId ?? undefined;

        const current: Session = session.current?.domain === 'project'
          ? session.current
          : { domain: 'project', period, projectIds: [], taskIds: [], evaluationIds: [] };
        session.current = current;

        if (intent === 'project-create') {
          if (!can('projects.create')) {
            say('Tài khoản của bạn chưa có quyền tạo công việc mới (`projects.create`).');
            return;
          }
          const creatableStore = me.authorization?.stores?.find(s => s.capabilities.includes('projects.create') && s.departmentId)
            ?? me.authorization?.stores?.find(s => s.departmentId);
          if (!creatableStore || !creatableStore.departmentId) {
            say('Không tìm thấy cửa hàng/phòng ban hợp lệ để tạo công việc mới.');
            return;
          }
          const targetStore = {
            id: creatableStore.id,
            name: creatableStore.name,
            departmentId: creatableStore.departmentId,
          };

          // Parse inline fields or match template project
          const rawAfterVerb = extractProjectSearchTitle(instruction);
          const inlineTitle = rawAfterVerb
            .replace(/\s*(?:theo mau|nhu mau|ban dien tap).*$/i, '')
            .replace(/\s*;\s*(?:mo ta|mô tả|ky nang|kỹ năng|han|hạn)\s*[:=].*$/i, '')
            .trim();

          const baseRefQuery = stripBracketPrefix(inlineTitle || rawAfterVerb);
          const refProject = allProjects.find(p => {
            const pBase = normalizeText(stripBracketPrefix(p.title));
            const qBase = normalizeText(baseRefQuery);
            return qBase.length >= 4 && (pBase.includes(qBase) || qBase.includes(pBase));
          }) ?? allProjects.find(p => normalizeText(p.title).includes('kiem ke quay pha che cuoi ca'));

          const descMatch = /(?:mô tả|mo ta)\s*[:=]\s*([^;]+)/i.exec(text);
          const skillsMatch = /(?:kỹ năng|ky nang)\s*[:=]\s*([^;]+)/i.exec(text);
          const dueMatch = /(?:hạn|han)\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i.exec(text);

          function* createProjectFlow(): Step<Plan> {
            let title = inlineTitle;
            while (title.trim().length < 3) {
              title = (yield 'Bạn hãy nhập tiêu đề công việc thường cần tạo (ví dụ: “[DIỄN TẬP CHAT] Kiểm kê quầy pha chế cuối ca”):').trim();
            }
            const matchedTemplate = refProject ?? allProjects.find(p => {
              const pBase = normalizeText(stripBracketPrefix(p.title));
              const tBase = normalizeText(stripBracketPrefix(title));
              return tBase.length >= 4 && (pBase.includes(tBase) || tBase.includes(pBase));
            });

            let description = descMatch?.[1]?.trim() ?? matchedTemplate?.description ?? '';
            while (description.trim().length < 5) {
              description = (yield `Nhập mô tả chi tiết cho công việc “${title}”:`).trim();
            }

            let requiredSkills = skillsMatch
              ? skillsMatch[1].split(',').map(s => s.trim()).filter(Boolean)
              : (matchedTemplate?.requiredSkills?.length ? [...matchedTemplate.requiredSkills] : []);
            while (!requiredSkills.length) {
              const skillsReply = (yield `Nhập các kỹ năng yêu cầu cho công việc “${title}” (cách nhau bởi dấu phẩy, ví dụ: Bán hàng, Pha đồ uống, Kiểm kê nguyên vật liệu):`).trim();
              requiredSkills = skillsReply.split(',').map(s => s.trim()).filter(Boolean);
            }

            const dueDateIso = dueMatch?.[1]
              ? new Date(`${dueMatch[1]}T10:00:00.000Z`).toISOString()
              : (matchedTemplate?.dueDate ?? new Date('2026-11-30T10:00:00.000Z').toISOString());

            return {
              summary: [
                `Xác nhận tạo công việc mới trong Công việc & nghiệm thu:`,
                `• Tiêu đề: ${title}`,
                `• Cửa hàng: ${targetStore.name}`,
                `• Kỹ năng yêu cầu: ${requiredSkills.join(', ')}`,
                `• Hạn hoàn thành: ${formatDateVN(dueDateIso)}`,
                `• Mô tả: ${description}`,
              ].join('\n'),
              execute: async () => {
                const created = await createProject({
                  title,
                  description,
                  requiredSkills,
                  dueDate: dueDateIso,
                  departmentId: targetStore.departmentId,
                  storeId: targetStore.id,
                });
                current.selectedId = created.id;
                current.projectIds = [created.id, ...current.projectIds.filter(id => id !== created.id)];
                return [
                  `Đã tạo công việc “${title}” thành công.`,
                  `• Mã công việc: ${created.id}`,
                  `• Trạng thái: ${PROJECT_STATUS_LABELS[created.status] ?? created.status} · Phiên bản v${created.version}`,
                  `• Kỹ năng yêu cầu: ${requiredSkills.join(', ')}`,
                  `\nBạn có thể hỏi ngay: “Ai phù hợp với công việc ${title}?” để chạy mô hình PhoBERT gợi ý ứng viên và giao việc.`,
                ].join('\n');
              },
            };
          }

          const step = createProjectFlow();
          await advance(await step.next(), step);
          return;
        }

        if (intent === 'project-list' || intent === 'project-pending') {
          const filtered = allProjects.filter(p => {
            if (/\b(?:cua toi|cua minh|cua em)\b/.test(q) && p.assigneeId !== employeeId) return false;
            if (/\bban nhap\b/.test(q) && p.status !== 'DRAFT') return false;
            if (/\bcho nhan\b/.test(q) && !(p.status === 'ASSIGNED' && p.assignmentStatus === 'PENDING_ACCEPTANCE')) return false;
            if (/\b(?:cho nghiem thu|can nghiem thu)\b/.test(q) && p.status !== 'PENDING_REVIEW') return false;
            if (intent === 'project-pending') {
              if (p.assigneeId === employeeId && ['ASSIGNED', 'IN_PROGRESS'].includes(p.status)) return true;
              if (can('reports.review') && p.status === 'PENDING_REVIEW') return true;
              if (can('projects.assign') && p.status === 'DRAFT') return true;
              return false;
            }
            return true;
          });
          current.projectIds = filtered.map(p => p.id);
          current.selectedId = filtered.length === 1 ? filtered[0].id : current.selectedId;
          if (!filtered.length) {
            say('Hiện không có công việc thường nào phù hợp bộ lọc trong Công việc & nghiệm thu.');
            return;
          }
          say([
            `Công việc & nghiệm thu (${filtered.length} công việc):`,
            ...filtered.slice(0, 15).map((p, i) => {
              const statusLabel = PROJECT_STATUS_LABELS[p.status] ?? p.status;
              const assignLabel = p.assignmentStatus ? ` (${ASSIGNMENT_STATUS_LABELS[p.assignmentStatus] ?? p.assignmentStatus})` : '';
              const who = p.assigneeName || (p.assigneeId === employeeId ? 'Bạn' : p.assigneeId ? 'Đã giao' : 'Chưa giao');
              return `${i + 1}. ${p.title} · ${statusLabel}${assignLabel} · Người nhận: ${who} · Tiến độ ${p.progress}%`;
            }),
            '\nNhắn “xem mục 1”, “ai phù hợp với công việc ...”, “nhận mục 1”, “bắt đầu mục 1”, “nộp báo cáo mục 1: ...” hoặc “nghiệm thu mục 1”.',
          ].join('\n'));
          return;
        }

        // Resolve target project for project-suggest, project-assign, project-accept, project-start, project-progress, project-submit, project-review, project-rework, project-detail
        const ordered = current.projectIds.map(id => allProjects.find(p => p.id === id)).filter((p): p is Project => !!p);
        const pool = ordered.length ? [...ordered, ...allProjects.filter(p => !current.projectIds.includes(p.id))] : allProjects;
        const matched = matchProjectsByInstruction(instruction, pool, current.selectedId);

        let selected: Project | undefined;
        if (matched.length === 1) {
          selected = matched[0];
        } else if (matched.length > 1) {
          // Filter by appropriate state for the requested action
          const preferredByIntent = matched.filter(p => {
            if (intent === 'project-suggest' || intent === 'project-assign') return p.status === 'DRAFT';
            if (intent === 'project-accept' || intent === 'project-decline') return p.status === 'ASSIGNED' && p.assignmentStatus === 'PENDING_ACCEPTANCE';
            if (intent === 'project-start') return p.status === 'ASSIGNED' || p.status === 'IN_PROGRESS';
            if (intent === 'project-progress' || intent === 'project-submit') return p.status === 'IN_PROGRESS' || p.status === 'ASSIGNED';
            if (intent === 'project-review' || intent === 'project-rework') return p.status === 'PENDING_REVIEW';
            return true;
          });
          const stateCandidates = preferredByIntent.length ? preferredByIntent : matched.filter(p => {
            if (intent === 'project-suggest') return ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(p.status);
            return true;
          });
          selected = (current.selectedId ? stateCandidates.find(p => p.id === current.selectedId) : undefined)
            ?? stateCandidates[0]
            ?? matched[0];
        } else {
          selected = (current.selectedId ? allProjects.find(p => p.id === current.selectedId) : undefined)
            ?? (pool.length === 1 ? pool[0] : undefined);
        }

        if (!selected) {
          current.projectIds = pool.slice(0, 15).map(p => p.id);
          say([
            'Bạn muốn thao tác trên công việc nào trong Công việc & nghiệm thu?',
            ...pool.slice(0, 10).map((p, i) => `${i + 1}. ${p.title} · ${PROJECT_STATUS_LABELS[p.status] ?? p.status}`),
            'Hãy nhắn kèm số thứ tự hoặc tên công việc.',
          ].join('\n'));
          return;
        }
        current.selectedId = selected.id;
        if (!current.projectIds.includes(selected.id)) {
          current.projectIds = [selected.id, ...current.projectIds];
        }

        if (intent === 'project-detail') {
          const [fresh, reportsList] = await Promise.all([
            fetchProjectById(selected.id),
            fetchProjectReports(selected.id).catch((): Report[] => []),
          ]);
          if (signal.aborted) return;
          say(describeProject(fresh, reportsList));
          return;
        }

        if (intent === 'project-suggest' || intent === 'project-assign') {
          if (!can('projects.assign')) {
            say('Tài khoản của bạn chưa có quyền phân công / xem gợi ý ứng viên (`projects.assign`).');
            return;
          }
          const fresh = await fetchProjectById(selected.id);
          if (signal.aborted) return;
          if (!['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(fresh.status)) {
            say(`Công việc “${fresh.title}” đang ở trạng thái ${PROJECT_STATUS_LABELS[fresh.status] ?? fresh.status}, không còn ở trạng thái cần phân công.`);
            return;
          }
          const advice = await fetchReplacementCandidates(fresh.id);
          if (signal.aborted) return;

          const pickCandidate = (input: string, items: AssignmentCandidate[]) => pickChoice(input, items, c => c.fullName);
          // Check if SM already named the assignee in a `project-assign` command
          const preselected = intent === 'project-assign' ? pickCandidate(instruction, advice.items)[0] : undefined;

          function* suggestAndAssignFlow(): Step<Plan> {
            let chosen = preselected;
            while (!chosen) {
              const promptMsg = [
                formatPhoBertSuggestions(fresh, advice),
                '',
                fresh.status === 'DRAFT'
                  ? 'Bạn muốn chọn ứng viên nào để giao việc? Nhắn số thứ tự (ví dụ “1” hoặc “chọn 1”) hoặc tên nhân viên để xem trước lệnh giao việc, hoặc “hủy” nếu chỉ xem gợi ý.'
                  : 'Công việc này đã có người nhận. Nhắn “hủy” để đóng bảng gợi ý.',
              ].join('\n');
              const reply = yield promptMsg;
              chosen = pickCandidate(reply, advice.items)[0];
            }
            const modelBadge = advice.source === 'PHOBERT'
              ? `${advice.model ?? 'vinai/phobert-base'} · revision ${advice.revision}`
              : advice.source;
            return {
              summary: [
                `Xác nhận giao công việc thường trong Công việc & nghiệm thu:`,
                `• Công việc: ${fresh.title} (Phiên bản v${fresh.version})`,
                `• Nhân viên được chọn: ${chosen.fullName}`,
                `• Điểm phù hợp: ${chosen.suitabilityScore !== null ? `${chosen.suitabilityScore}/100` : 'Chọn thủ công'} · Nguồn gợi ý: ${modelBadge}`,
                `• Kỹ năng khớp: ${chosen.matchedSkills.length ? chosen.matchedSkills.join(', ') : 'Đối sánh ngữ nghĩa'}`,
              ].join('\n'),
              execute: async () => {
                const latest = await fetchProjectById(fresh.id);
                const assigned = await assignProject(latest.id, {
                  assigneeId: chosen!.employeeId,
                  expectedVersion: latest.version,
                });
                const updatedProj = await fetchProjectById(fresh.id);
                return [
                  `Đã giao công việc “${updatedProj.title}” cho ${updatedProj.assigneeName || chosen!.fullName}.`,
                  `• Trạng thái: ${PROJECT_STATUS_LABELS[updatedProj.status] ?? assigned.status} (${ASSIGNMENT_STATUS_LABELS[updatedProj.assignmentStatus ?? ''] ?? updatedProj.assignmentStatus ?? 'Chờ nhân viên tiếp nhận'})`,
                  `• Phiên bản: v${updatedProj.version}`,
                  `• Nguồn gợi ý đã tham chiếu: ${modelBadge}`,
                ].join('\n');
              },
            };
          }

          const step = suggestAndAssignFlow();
          await advance(await step.next(), step, {
            optional: intent === 'project-suggest',
            canAcceptInput: (input) => pickCandidate(input, advice.items).length > 0,
          });
          return;
        }

        if (intent === 'project-accept') {
          const fresh = await fetchProjectById(selected.id);
          if (signal.aborted) return;
          if (fresh.status !== 'ASSIGNED') {
            say(`Công việc “${fresh.title}” hiện đang ở trạng thái ${PROJECT_STATUS_LABELS[fresh.status] ?? fresh.status}, không ở trạng thái chờ nhận việc.`);
            return;
          }
          const alsoStart = /\bva bat dau\b/.test(q);
          const plan: Plan = {
            summary: `Xác nhận tiếp nhận${alsoStart ? ' và bắt đầu thực hiện' : ''} công việc “${fresh.title}” (Hạn hoàn thành: ${formatDateVN(fresh.dueDate)} · Phiên bản v${fresh.version}).`,
            execute: async () => {
              const accepted = await respondAssignment(fresh.id, {
                action: 'ACCEPT',
                expectedVersion: fresh.version,
              });
              if (alsoStart) {
                const started = await transitionProject(accepted.id, {
                  targetStatus: 'IN_PROGRESS',
                  expectedVersion: accepted.version,
                });
                return `Đã tiếp nhận và bắt đầu thực hiện công việc “${accepted.title}” · Trạng thái: ${PROJECT_STATUS_LABELS[started.status] ?? started.status} · Phiên bản v${started.version}.`;
              }
              return `Đã tiếp nhận công việc “${accepted.title}” · Trạng thái: ${PROJECT_STATUS_LABELS[accepted.status] ?? accepted.status} (${ASSIGNMENT_STATUS_LABELS[accepted.assignmentStatus ?? ''] ?? accepted.assignmentStatus}) · Phiên bản v${accepted.version}.\nBạn có thể nhắn “Bắt đầu công việc ${accepted.title}” để chuyển sang trạng thái Đang thực hiện.`;
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }

        if (intent === 'project-decline') {
          const fresh = await fetchProjectById(selected.id);
          if (signal.aborted) return;
          function* declineFlow(): Step<Plan> {
            let reason = note;
            while (reason.trim().length < 3) {
              reason = (yield `Bạn hãy nhập lý do từ chối nhận công việc “${fresh.title}”:`).trim();
            }
            return {
              summary: `Xác nhận từ chối nhận công việc “${fresh.title}” với lý do: “${reason}”.`,
              execute: async () => {
                const latest = await fetchProjectById(fresh.id);
                const updated = await respondAssignment(latest.id, {
                  action: 'DECLINE',
                  reason,
                  expectedVersion: latest.version,
                });
                return `Đã gửi phản hồi từ chối công việc “${updated.title}”. Trạng thái phân công: ${ASSIGNMENT_STATUS_LABELS[updated.assignmentStatus ?? ''] ?? updated.assignmentStatus}.`;
              },
            };
          }
          const step = declineFlow();
          await advance(await step.next(), step);
          return;
        }

        if (intent === 'project-start') {
          const fresh = await fetchProjectById(selected.id);
          if (signal.aborted) return;
          if (fresh.status === 'IN_PROGRESS') {
            say(`Công việc “${fresh.title}” đã ở trạng thái Đang thực hiện (${fresh.progress}%). Bạn có thể nhắn “Nộp báo cáo công việc ${fresh.title}: <nội dung>”.`);
            return;
          }
          if (fresh.status !== 'ASSIGNED') {
            say(`Công việc “${fresh.title}” đang ở trạng thái ${PROJECT_STATUS_LABELS[fresh.status] ?? fresh.status}, không thể chuyển sang Đang thực hiện.`);
            return;
          }
          const plan: Plan = {
            summary: `Xác nhận bắt đầu thực hiện công việc “${fresh.title}” (chuyển trạng thái sang Đang thực hiện - IN_PROGRESS · Phiên bản v${fresh.version}).`,
            execute: async () => {
              let currentProj = await fetchProjectById(fresh.id);
              if (currentProj.status === 'ASSIGNED' && currentProj.assignmentStatus !== 'ACCEPTED') {
                currentProj = await respondAssignment(currentProj.id, {
                  action: 'ACCEPT',
                  expectedVersion: currentProj.version,
                });
              }
              const started = await transitionProject(currentProj.id, {
                targetStatus: 'IN_PROGRESS',
                expectedVersion: currentProj.version,
              });
              return `Đã bắt đầu thực hiện công việc “${currentProj.title}” · Trạng thái: ${PROJECT_STATUS_LABELS[started.status] ?? started.status} (${started.status}) · Tiến độ: ${currentProj.progress}% · Phiên bản v${started.version}.\nKhi hoàn tất, bạn hãy nhắn “Nộp báo cáo công việc ${currentProj.title}: <nội dung báo cáo>”.`;
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }

        if (intent === 'project-progress') {
          const fresh = await fetchProjectById(selected.id);
          if (signal.aborted) return;
          const pctMatch = text.match(/(\d{1,3})\s*%/);
          const targetPct = pctMatch ? Math.min(100, Math.max(0, Number(pctMatch[1]))) : Math.min(100, (fresh.progress || 0) + 50);
          const plan: Plan = {
            summary: `Xác nhận cập nhật tiến độ công việc “${fresh.title}” từ ${fresh.progress}% lên ${targetPct}%.`,
            execute: async () => {
              let currentProj = await fetchProjectById(fresh.id);
              let expectedVer = currentProj.version;
              if (currentProj.status === 'ASSIGNED') {
                if (currentProj.assignmentStatus !== 'ACCEPTED') {
                  currentProj = await respondAssignment(currentProj.id, { action: 'ACCEPT', expectedVersion: expectedVer });
                  expectedVer = currentProj.version;
                }
                const tr = await transitionProject(currentProj.id, { targetStatus: 'IN_PROGRESS', expectedVersion: expectedVer });
                expectedVer = tr.version;
              }
              const updated = await updateProjectProgress(currentProj.id, {
                progress: targetPct,
                expectedVersion: expectedVer,
              });
              return `Đã cập nhật tiến độ công việc “${currentProj.title}” lên ${updated.progress}% (Phiên bản v${updated.version}).`;
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }

        if (intent === 'project-submit') {
          const fresh = await fetchProjectById(selected.id);
          if (signal.aborted) return;
          function* submitProjectReportFlow(): Step<Plan> {
            let content = note;
            while (content.trim().length < 5) {
              content = (yield `Bạn hãy nhập nội dung báo cáo hoàn thành cho công việc “${fresh.title}” (tối thiểu 5 ký tự):`).trim();
            }
            const urlMatches = content.match(/https?:\/\/[^\s,;]+/gi) ?? [];
            return {
              summary: [
                `Xác nhận nộp báo cáo nghiệm thu cho công việc “${fresh.title}”:`,
                `• Nội dung báo cáo: “${content}”`,
                urlMatches.length ? `• Liên kết đính kèm: ${urlMatches.join(', ')}` : '',
              ].filter(Boolean).join('\n'),
              execute: async () => {
                let currentProj = await fetchProjectById(fresh.id);
                let expectedVer = currentProj.version;
                if (currentProj.status === 'ASSIGNED') {
                  if (currentProj.assignmentStatus !== 'ACCEPTED') {
                    currentProj = await respondAssignment(currentProj.id, { action: 'ACCEPT', expectedVersion: expectedVer });
                    expectedVer = currentProj.version;
                  }
                  const tr = await transitionProject(currentProj.id, { targetStatus: 'IN_PROGRESS', expectedVersion: expectedVer });
                  expectedVer = tr.version;
                }
                const res = await submitReport(currentProj.id, {
                  content,
                  attachments: urlMatches,
                  expectedVersion: expectedVer,
                });
                return [
                  `Đã nộp báo cáo công việc “${currentProj.title}” thành công.`,
                  `• Mã báo cáo: ${res.reportId}`,
                  `• Trạng thái công việc: ${PROJECT_STATUS_LABELS[res.status] ?? res.status} (${res.status}) · Phiên bản v${res.version}`,
                  `• Chờ Quản lý cửa hàng (SM) kiểm tra và nghiệm thu.`,
                ].join('\n');
              },
            };
          }
          const step = submitProjectReportFlow();
          await advance(await step.next(), step);
          return;
        }

        if (intent === 'project-review' || intent === 'project-rework') {
          if (!can('reports.review')) {
            say('Tài khoản của bạn chưa có quyền duyệt báo cáo nghiệm thu (`reports.review`).');
            return;
          }
          const [fresh, reportsList] = await Promise.all([
            fetchProjectById(selected.id),
            fetchProjectReports(selected.id),
          ]);
          if (signal.aborted) return;
          const pendingReport = reportsList.find((r: Report) => r.status === 'PENDING');
          if (fresh.status !== 'PENDING_REVIEW' || !pendingReport) {
            say(`Công việc “${fresh.title}” hiện đang ở trạng thái ${PROJECT_STATUS_LABELS[fresh.status] ?? fresh.status} và không có báo cáo nào đang chờ duyệt (PENDING).`);
            return;
          }
          const targetReport = pendingReport;

          if (intent === 'project-rework') {
            function* reworkFlow(): Step<Plan> {
              let reason = note;
              while (reason.trim().length < 3) {
                reason = (yield `Bạn hãy nhập lý do yêu cầu làm lại đối với báo cáo công việc “${fresh.title}”:`).trim();
              }
              return {
                summary: [
                  `Xác nhận YÊU CẦU LÀM LẠI (REJECT) báo cáo công việc “${fresh.title}”:`,
                  `• Báo cáo của nhân viên: “${targetReport.content}”`,
                  `• Lý do yêu cầu làm lại: “${reason}”`,
                ].join('\n'),
                execute: async () => {
                  const latest = await fetchProjectById(fresh.id);
                  const res = await reviewReport(targetReport.id, {
                    action: 'REJECT',
                    reason,
                    expectedVersion: latest.version,
                  });
                  return [
                    `Đã gửi yêu cầu làm lại cho công việc “${fresh.title}”.`,
                    `• Trạng thái công việc: ${PROJECT_STATUS_LABELS[res.projectStatus] ?? res.projectStatus} (${res.projectStatus}) · Phiên bản v${res.version}`,
                    `• Lý do phản hồi: “${reason}”`,
                  ].join('\n');
                },
              };
            }
            const step = reworkFlow();
            await advance(await step.next(), step);
            return;
          }

          const reviewReason = note.trim().length >= 2 ? note.trim() : 'Đã kiểm tra báo cáo và nghiệm thu đạt yêu cầu vận hành cuối ca.';
          const plan: Plan = {
            summary: [
              `Xác nhận NGHIỆM THU ĐẠT (APPROVE) báo cáo công việc “${fresh.title}”:`,
              `• Người thực hiện: ${fresh.assigneeName || 'Nhân viên được giao'}`,
              `• Nội dung báo cáo: “${pendingReport.content}”`,
              `• Nhận xét nghiệm thu: “${reviewReason}”`,
            ].join('\n'),
            execute: async () => {
              const latest = await fetchProjectById(fresh.id);
              const res = await reviewReport(pendingReport.id, {
                action: 'APPROVE',
                reason: reviewReason,
                expectedVersion: latest.version,
              });
              const completedProj = await fetchProjectById(fresh.id);
              return [
                `Đã nghiệm thu hoàn tất công việc “${completedProj.title}”.`,
                `• Trạng thái cuối: ${PROJECT_STATUS_LABELS[completedProj.status] ?? res.projectStatus} (${completedProj.status})`,
                `• Tiến độ: ${completedProj.progress}% · Phiên bản v${completedProj.version}`,
                `• Nhận xét nghiệm thu: “${reviewReason}”`,
              ].join('\n');
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }
      }

      if (intent === 'task-create' || intent === 'task-template-propose') {
        if (!can('task.manage')) {
          say('Tài khoản của bạn chưa có quyền tạo công việc hoặc đề xuất mẫu chấm.');
          return;
        }
        const me = await fetchMe();
        if (signal.aborted) return;
        const stores = (me.authorization?.stores ?? []).filter(store => store.capabilities.includes('task.manage'));
        if (!stores.length) {
          say('Không có cửa hàng được cấp quyền tạo công việc có thang điểm.');
          return;
        }
        const proposing = intent === 'task-template-propose';
        const templates = proposing ? [] : (await api.performanceTemplates()).items;
        if (signal.aborted) return;

        function* intake(): Step<Plan> {
          let store = stores.length === 1 ? stores[0] : undefined;
          while (!store) {
            const reply = yield ['Chọn cửa hàng bằng số hoặc tên:', ...stores.map((s, i) => `${i + 1}. ${s.name}`)].join('\n');
            const matches = pickChoice(reply, stores, s => s.name);
            if (matches.length === 1) store = matches[0];
          }
          const storeId = store.id;
          const titlePrompt = proposing ? 'Nhập tên mẫu chấm muốn đề xuất.' : 'Nhập tiêu đề công việc có thang điểm.';
          let title = instruction.match(/:\s*(.+)$/s)?.[1]?.trim() ?? '';
          while (title.length < 3 || title.length > 200) title = (yield `${titlePrompt} (3–200 ký tự)`).trim();
          let description = '';
          while (!description) description = (yield `Mô tả công việc “${title}” để ${proposing ? 'AI đề xuất thang chấm' : 'nhân viên biết cần làm gì'}.`).trim();
          let dueAt = '';
          while (!dueAt) {
            const reply = (yield `Nhập ${proposing ? 'ngày dự kiến áp dụng mẫu' : 'hạn hoàn thành'} theo YYYY-MM-DD.`).trim();
            const date = new Date(reply + 'T23:59:59+07:00');
            if (/^20\d{2}-\d{2}-\d{2}$/.test(reply) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === reply) dueAt = date.toISOString();
          }
          const taskPeriod = dueAt.slice(0, 7);
          if (proposing) {
            const roles = [{ code: 'STAFF', label: 'Nhân viên' }, { code: 'PTCH', label: 'PTCH' }, { code: 'SM', label: 'SM' }] as const;
            let role: typeof roles[number] | undefined;
            while (!role) {
              const reply = yield 'Chọn người dùng mẫu: 1. Nhân viên · 2. PTCH · 3. SM.';
              const matches = pickChoice(reply, [...roles], r => r.label);
              if (matches.length === 1) role = matches[0];
            }
            const roleCode = role.code;
            return {
              summary: '',
              readOnly: true,
              execute: async executionSignal => {
                const suggestion = await api.performanceSuggest({ title, description, storeId, templateCode: null, role: roleCode });
                if (executionSignal.aborted) return '';
                const content = { ...suggestion.content, name: title, effectiveFrom: taskPeriod, effectiveTo: null };
                const clientRequestId = newClientMessageId();
                decision.current = { plan: {
                  summary: '',
                  execute: async () => {
                    const template = await api.performancePost<TaskTemplate>('/tasks/templates/proposals', {
                      storeId, content, reason: 'Đề nghị HR duyệt mẫu chấm cho công việc.', expectedVersion: 0, clientRequestId,
                    });
                    return `Đã gửi mẫu “${template.content.name}” cho HR duyệt. Mã mẫu: ${template.id}.`;
                  },
                } };
                return [suggestion.degraded ? 'Mẫu dự phòng để HR xem xét' : 'Mẫu chấm đề xuất', `• ${title} · ${store.name} · Kỳ ${taskPeriod}`,
                  ...content.steps.map(step => `• Bước: ${step.name} (${step.progressWeightPercent}%)`),
                  ...content.qualityCriteria.map(c => `• Tiêu chí: ${c.name} (${c.maxScore} điểm)`),
                  `Bằng chứng: ${content.requiredEvidence.map(e => e.name).join(', ') || 'Theo tiêu chí'}`,
                  'Nhắn “xác nhận” để gửi HR duyệt hoặc “hủy”.'].join('\n');
              },
            };
          }
          const published = templates.filter(t => t.status === 'PUBLISHED' && (!t.proposalStoreId || t.proposalStoreId === storeId)
            && t.content.effectiveFrom <= taskPeriod && (!t.content.effectiveTo || taskPeriod <= t.content.effectiveTo));
          if (!published.length) return { summary: '', readOnly: true, execute: async () =>
            'Kỳ này chưa có mẫu chấm đã công bố cho cửa hàng. Nhắn “AI đề xuất thang điểm” để chuẩn bị mẫu và gửi HR duyệt.' };
          let template: TaskTemplate | undefined;
          while (!template) {
            const reply = yield ['Chọn mẫu đã công bố bằng số hoặc tên:', ...published.map((t, i) => `${i + 1}. ${t.content.name} (v${t.templateVersion})`)].join('\n');
            const matches = pickChoice(reply, published, t => t.content.name);
            if (matches.length === 1) template = matches[0];
          }
          let weight = NaN;
          while (!Number.isFinite(weight) || weight < 5 || weight > 50) {
            const reply = yield 'Nhập mức quan trọng của nhiệm vụ từ 5 đến 50%. Ví dụ: 25.';
            weight = Number(reply.trim().replace(/%$/, '').replace(',', '.'));
          }
          let requiredSkills: string[] | undefined;
          while (!requiredSkills) {
            const reply = (yield 'Nhập kỹ năng yêu cầu, cách nhau bằng dấu phẩy. Nhắn “bỏ trống” nếu không cần.').trim();
            const skills = normalizeText(reply) === 'bo trong' ? [] : [...new Set(reply.split(',').map(s => s.trim()).filter(Boolean))];
            if (skills.length <= 30 && skills.every(skill => skill.length <= 100)) requiredSkills = skills;
          }
          const clientRequestId = newClientMessageId();
          const templateId = template.id;
          return {
            summary: [`Xác nhận tạo công việc có thang điểm “${title}”`, `• ${store.name} · Hạn ${formatDateVN(dueAt)} · Trọng số ${weight}%`,
              `• Mô tả: ${description}`, `• Mẫu: ${template.content.name} · ${template.content.qualityCriteria.map(c => `${c.name} ${c.maxScore} điểm`).join(' · ')}`,
              `• Kỹ năng: ${requiredSkills.join(', ') || 'Không yêu cầu'}`].join('\n'),
            execute: async executionSignal => {
              const created = await api.performancePost<TaskInstance>('/tasks', {
                storeId, title, description, dueAt, templateId, requiredSkills, taskWeightPercent: weight, expectedVersion: 0, clientRequestId,
              });
              if (!executionSignal.aborted) session.current = { domain: 'task', period: created.kpiPeriod, projectIds: [], taskIds: [created.id], evaluationIds: [], selectedId: created.id };
              return `Đã tạo công việc có thang điểm “${created.title}” · Bản nháp · v${created.version}.\nNhắn “PhoBERT gợi ý người cho công việc có thang điểm này” để chọn người giao việc.`;
            },
          };
        }
        const step = intake();
        await advance(await step.next(), step);
        return;
      }

      if (intent === 'task-template-review') {
        if (!can('performance_kpi.policy_manage')) {
          say('Tài khoản của bạn chưa có quyền duyệt mẫu chấm.');
          return;
        }
        const pending = (await api.performanceTemplates()).items.filter(t => t.status === 'DRAFT' && t.proposalStoreId);
        if (signal.aborted) return;
        if (!pending.length) {
          say('Không có mẫu chấm cửa hàng nào đang chờ HR duyệt trong phạm vi của bạn.');
          return;
        }
        const action = q.startsWith('tu choi') ? 'reject' : 'publish';
        function* reviewTemplate(): Step<Plan> {
          let template: TaskTemplate | undefined;
          while (!template) {
            const reply = yield ['Chọn đề xuất mẫu chấm cần xử lý bằng số hoặc tên:', ...pending.map((t, i) => `${i + 1}. ${t.content.name} · Kỳ ${t.content.effectiveFrom}`)].join('\n');
            const matches = pickChoice(reply, pending, t => t.content.name);
            if (matches.length === 1) template = matches[0];
          }
          const selected = template;
          const label = action === 'publish' ? 'Công bố' : 'Từ chối';
          const details = [`${selected.content.name} · Hiệu lực từ ${selected.content.effectiveFrom}`,
            ...selected.content.steps.map(step => `• Bước: ${step.name} (${step.progressWeightPercent}%)`),
            ...selected.content.qualityCriteria.map(c => `• Tiêu chí: ${c.name} (${c.maxScore} điểm)`),
            `Bằng chứng yêu cầu: ${selected.content.requiredEvidence.map(e => e.name).join(', ') || 'Theo tiêu chí'}`].join('\n');
          let reason = note;
          while (reason.length < 5) reason = (yield `${details}\nNhập lý do và căn cứ để ${label.toLocaleLowerCase('vi')} mẫu.`).trim();
          const clientRequestId = newClientMessageId();
          return {
            summary: `${label} mẫu “${selected.content.name}” · ${reason}`,
            execute: async () => {
              const updated = await api.performancePost<TaskTemplate>(`/tasks/templates/${selected.id}/${action}`, {
                reason, evidenceRefs: [reason], expectedVersion: selected.version, clientRequestId,
              });
              return `Mẫu “${updated.content.name}” · ${updated.status === 'PUBLISHED' ? 'Đã công bố' : 'Đã từ chối'}.`;
            },
          };
        }
        const step = reviewTemplate();
        await advance(await step.next(), step);
        return;
      }

      // ---- TASK DOMAIN ----
      if (intent.startsWith('task-')) {
        const [{ items: tasks }, me, catalog] = await Promise.all([
          api.performanceTasks(period),
          fetchMe(),
          can('task.manage') || can('performance_kpi.read_scope') ? api.performanceCatalog().catch(() => ({ employees: [], stores: [] })) : Promise.resolve({ employees: [], stores: [] }),
        ]);
        if (signal.aborted) return;
        const employeeId = me.employeeId ?? undefined;
        const names: Record<string, string> = Object.fromEntries(catalog.employees.map(e => [e.id, e.name]));

        const current: Session = session.current?.domain === 'task' && session.current.period === period
          ? session.current
          : { domain: 'task', period, projectIds: [], taskIds: [], evaluationIds: [] };
        session.current = current;

        if (intent === 'task-list' || intent === 'task-pending') {
          const filtered = tasks.filter(t => {
            if (/\b(?:cua toi|cua minh|cua em)\b/.test(q) && t.assigneeEmployeeId !== employeeId) return false;
            if (/\bcho nhan\b/.test(q) && t.status !== 'ASSIGNED') return false;
            if (/\b(?:cho nghiem thu|cho cham)\b/.test(q) && t.status !== 'PENDING_REVIEW') return false;
            if (/\bbi tu choi\b/.test(q) && t.assignmentStatus !== 'REFUSED') return false;
            if (/\bban nhap\b/.test(q) && t.status !== 'DRAFT') return false;
            if (intent === 'task-pending') {
              if (t.assigneeEmployeeId === employeeId && ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'].includes(t.status)) return true;
              if (can('task.evaluate') && t.status === 'PENDING_REVIEW') return true;
              if (can('task.manage') && (t.status === 'DRAFT' || t.assignmentStatus === 'REFUSED')) return true;
              return false;
            }
            return true;
          });
          current.taskIds = filtered.map(t => t.id);
          current.selectedId = filtered.length === 1 ? filtered[0].id : undefined;
          if (!filtered.length) {
            say(`Kỳ ${period} hiện không có nhiệm vụ có thang điểm nào phù hợp bộ lọc.`);
            return;
          }
          say([
            `Công việc có thang điểm · Kỳ ${period} (${filtered.length} nhiệm vụ):`,
            ...filtered.map((t, i) => {
              const who = t.assigneeEmployeeId ? (names[t.assigneeEmployeeId] ?? (t.assigneeEmployeeId === employeeId ? 'Bạn' : 'Đã giao')) : 'Chưa giao';
              return `${i + 1}. ${t.title} · ${performanceLabels[t.status] ?? t.status} · ${who} · Trọng số ${performanceNumber(t.taskWeightPercent)}% · Tiến độ ${performanceNumber(t.progressPercent)}%`;
            }),
            '\nNhắn “xem mục 1”, “nhận mục 1”, “tiến độ mục 1”, “nộp mục 1”, “giao mục 1” hoặc “nghiệm thu mục 1”.',
          ].join('\n'));
          return;
        }

        const ordered = current.taskIds.map(id => tasks.find(t => t.id === id)).filter((t): t is TaskInstance => !!t);
        const candidates = ordered.length ? ordered : tasks;
        const picked = pickChoice(instruction, candidates, t => t.title);
        const hasExplicitNumber = /\b(?:muc|so|nhiem vu|cong viec) \d+\b/.test(q);
        const target = picked.length === 1 ? picked[0] : picked.length || hasExplicitNumber ? undefined
          : (current.selectedId ? tasks.find(t => t.id === current.selectedId) : undefined) ?? (candidates.length === 1 ? candidates[0] : undefined);

        if (!target) {
          current.taskIds = candidates.map(t => t.id);
          say([
            `Bạn muốn thao tác trên nhiệm vụ nào trong kỳ ${period}?`,
            ...candidates.slice(0, 10).map((t, i) => `${i + 1}. ${t.title} · ${performanceLabels[t.status] ?? t.status}`),
            'Hãy nhắn kèm số thứ tự, ví dụ “xem mục 1” hoặc “nhận mục 1”.',
          ].join('\n'));
          return;
        }
        const selected = target;
        current.selectedId = selected.id;

        if (intent === 'task-detail') {
          say(describeTask(selected, names));
          return;
        }

        if (intent === 'task-accept') {
          if (selected.status !== 'ASSIGNED') {
            say(`Nhiệm vụ “${selected.title}” đang ở trạng thái ${performanceLabels[selected.status] ?? selected.status}, không ở trạng thái chờ nhận.`);
            return;
          }
          const plan: Plan = {
            summary: `Xác nhận nhận nhiệm vụ “${selected.title}” (Kỳ ${selected.kpiPeriod} · Trọng số ${performanceNumber(selected.taskWeightPercent)}% · Hạn ${performanceDate(selected.dueAt)}).`,
            execute: async () => {
              const updated = await api.performanceTaskAction(selected.id, 'accept', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
              });
              return `Đã nhận nhiệm vụ “${updated.title}”. Trạng thái hiện tại: ${performanceLabels[updated.status] ?? updated.status}. Bạn có thể nhắn “tiến độ mục 1” hoặc “nộp mục 1” khi hoàn thành.`;
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }

        if (intent === 'task-refuse') {
          function* refuseFlow(): Step<Plan> {
            let reason = note;
            while (reason.trim().length < 5) {
              reason = (yield `Bạn hãy nhập lý do từ chối nhiệm vụ “${selected.title}” (tối thiểu 5 ký tự):`).trim();
            }
            return {
              summary: `Từ chối nhiệm vụ “${selected.title}” với lý do: “${reason}”.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'refuse', {
                  expectedVersion: selected.version,
                  clientRequestId: newClientMessageId(),
                  reason,
                  evidenceRefs: [`Báo cáo từ chối qua trợ lý Chat: ${reason}`],
                });
                return `Đã gửi yêu cầu từ chối nhiệm vụ “${updated.title}”. Chờ quản lý trực tiếp xem xét.`;
              },
            };
          }
          const step = refuseFlow();
          await advance(await step.next(), step);
          return;
        }

        if (intent === 'task-progress') {
          const allCodes = selected.templateSnapshot.steps.map(s => s.code);
          const plan: Plan = {
            summary: `Cập nhật hoàn thành 100% các bước của nhiệm vụ “${selected.title}” (${selected.templateSnapshot.steps.map(s => s.name).join(', ')}).`,
            execute: async () => {
              const updated = await api.performanceTaskAction(selected.id, 'progress', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                completedStepCodes: allCodes,
                evidenceRefs: [note || 'Đã hoàn thành đầy đủ các bước theo quy trình vận hành cửa hàng.'],
              });
              return `Đã cập nhật tiến độ nhiệm vụ “${updated.title}” lên ${performanceNumber(updated.progressPercent)}%. Nhắn “nộp mục 1” để gửi nghiệm thu.`;
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }

        if (intent === 'task-submit') {
          function* submitFlow(): Step<Plan> {
            let reason = note;
            while (reason.trim().length < 5) {
              reason = (yield `Bạn hãy nhập tóm tắt kết quả và bằng chứng nộp nhiệm vụ “${selected.title}” (tối thiểu 5 ký tự):`).trim();
            }
            return {
              summary: `Nộp kết quả nhiệm vụ “${selected.title}” để chờ nghiệm thu · Nội dung: “${reason}”.`,
              execute: async () => {
                let currentTask = selected;
                const requiredCodes = currentTask.templateSnapshot.steps.filter(s => s.required).map(s => s.code);
                const doneCodes = currentTask.stepProgress.filter(s => s.done).map(s => s.code);
                if (requiredCodes.some(c => !doneCodes.includes(c))) {
                  currentTask = await api.performanceTaskAction(currentTask.id, 'progress', {
                    expectedVersion: currentTask.version,
                    clientRequestId: newClientMessageId(),
                    completedStepCodes: currentTask.templateSnapshot.steps.map(s => s.code),
                    evidenceRefs: [reason],
                  });
                }
                const updated = await api.performanceTaskAction(currentTask.id, 'submit', {
                  expectedVersion: currentTask.version,
                  clientRequestId: newClientMessageId(),
                  reason,
                  evidenceRefs: [reason],
                });
                return `Đã nộp nhiệm vụ “${updated.title}”. Trạng thái: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = submitFlow();
          await advance(await step.next(), step);
          return;
        }

        if (intent === 'task-suggest') {
          if (!can('task.assign')) {
            say('Tài khoản của bạn chưa có quyền gợi ý người nhận cho công việc có thang điểm.');
            return;
          }
          if (selected.status !== 'DRAFT') {
            say('Hãy chọn một công việc có thang điểm đang ở trạng thái bản nháp.');
            return;
          }
          if (!selected.requiredSkills?.length) {
            say('Công việc chưa có kỹ năng yêu cầu. Quản lý có thể chọn người thủ công bằng “giao mục” kèm số thứ tự.');
            return;
          }
          const advice = await api.suggestTaskCandidates(selected.id);
          if (signal.aborted) return;
          if (advice.projectVersion !== selected.version) {
            say('Công việc đã thay đổi. Hãy hỏi lại để lấy gợi ý mới.');
            return;
          }
          const output = formatPhoBertSuggestions(selected, advice);
          if (!advice.items.length) {
            say(output);
            return;
          }
          function* chooseSuggested(): Step<Plan> {
            let chosen: F4Suggestions['items'][number] | undefined;
            while (!chosen) {
              const reply = yield output + '\nNhắn số thứ tự hoặc tên để chọn người, hoặc “hủy”.';
              const matches = pickChoice(reply, advice.items, c => c.fullName);
              if (matches.length === 1) chosen = matches[0];
            }
            const candidate = chosen;
            const clientRequestId = newClientMessageId();
            return {
              summary: `Giao công việc có thang điểm “${selected.title}” cho ${candidate.fullName} · Gợi ý tham khảo: ${advice.source}.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'assign', {
                  expectedVersion: selected.version, clientRequestId, assigneeEmployeeId: candidate.employeeId,
                  reason: 'Quản lý xác nhận chọn người thực hiện sau khi xem gợi ý.',
                });
                return `Đã giao nhiệm vụ “${updated.title}” cho ${candidate.fullName}. Trạng thái: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = chooseSuggested();
          await advance(await step.next(), step, { optional: true, canAcceptInput: input => pickChoice(input, advice.items, c => c.fullName).length > 0 });
          return;
        }

        if (intent === 'task-assign') {
          const storeEmployees = catalog.employees.filter(e => e.storeId === selected.storeId && e.role !== 'SM');
          function* assignFlow(): Step<Plan> {
            let pickedEmp = pickChoice(instruction, storeEmployees, e => e.name)[0];
            while (!pickedEmp) {
              const reply = yield [
                `Chọn nhân sự tại cửa hàng để giao nhiệm vụ “${selected.title}”:`,
                ...storeEmployees.map((e, i) => `${i + 1}. ${e.name} (${e.role})`),
                'Nhắn số thứ tự hoặc tên nhân viên:',
              ].join('\n');
              pickedEmp = pickChoice(reply, storeEmployees, e => e.name)[0];
            }
            const reason = note.trim().length >= 5 ? note.trim() : `Phân công nhiệm vụ ${selected.title} theo kế hoạch vận hành cửa hàng.`;
            return {
              summary: `Giao nhiệm vụ “${selected.title}” cho ${pickedEmp.name} · Lý do: “${reason}”.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'assign', {
                  expectedVersion: selected.version,
                  clientRequestId: newClientMessageId(),
                  assigneeEmployeeId: pickedEmp.id,
                  reason,
                });
                return `Đã giao nhiệm vụ “${updated.title}” cho ${pickedEmp.name}. Trạng thái: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = assignFlow();
          await advance(await step.next(), step);
          return;
        }

        if (intent === 'task-refusal-decision') {
          function* refusalDecisionFlow(): Step<Plan> {
            let decisionKind: 'VALID' | 'INVALID' = /\b(?:khong hop le|bac|giu)\b/.test(q) ? 'INVALID' : 'VALID';
            let reason = note;
            while (reason.trim().length < 5) {
              const reply = yield `Nhập lý do xử lý từ chối nhiệm vụ “${selected.title}” (gõ kèm “hợp lệ” để hủy việc hoặc “không hợp lệ” để yêu cầu tiếp tục nhận):`;
              if (/\bkhong hop le|bac\b/.test(normalizeText(reply))) decisionKind = 'INVALID';
              else if (/\bhop le\b/.test(normalizeText(reply))) decisionKind = 'VALID';
              reason = reply.trim();
            }
            return {
              summary: `Xử lý từ chối nhiệm vụ “${selected.title}” · Quyết định: ${decisionKind === 'VALID' ? 'Chấp nhận từ chối (Hủy phần việc)' : 'Bác từ chối (Yêu cầu nhận lại)'} · Lý do: “${reason}”.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'refusal-decision', {
                  expectedVersion: selected.version,
                  clientRequestId: newClientMessageId(),
                  decision: decisionKind,
                  reason,
                  policyRef: decisionKind === 'INVALID' ? 'Quy chế phân công nhiệm vụ vận hành cửa hàng GUTA' : null,
                  evidenceRefs: [reason],
                });
                return `Đã xử lý từ chối nhiệm vụ “${updated.title}”. Trạng thái hiện tại: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = refusalDecisionFlow();
          await advance(await step.next(), step);
          return;
        }

        if (intent === 'task-evaluate' || intent === 'task-rework') {
          if (!can('task.evaluate')) {
            say('Tài khoản của bạn chưa có quyền nghiệm thu công việc có thang điểm.');
            return;
          }
          if (selected.status !== 'PENDING_REVIEW') {
            say('Chỉ nghiệm thu trong Chat khi công việc đang chờ nghiệm thu.');
            return;
          }
          const task = selected;
          const segments = task.responsibilitySegments.filter(s => s.status !== 'RELEASED' && s.submittedAt);
          if (!segments.length) {
            say('Nhiệm vụ chưa có phần trách nhiệm đã nộp để nghiệm thu.');
            return;
          }
          const outcome = intent === 'task-rework' ? 'REWORK' : 'CONFIRM';
          function* evaluateTaskFlow(): Step<Plan> {
            let segment = segments.length === 1 ? segments[0] : undefined;
            while (!segment) {
              const reply = yield ['Chọn phần trách nhiệm cần chấm:', ...segments.map((s, i) => `${i + 1}. ${names[s.employeeId] ?? 'Nhân viên'} · ${s.workScope} (${s.weightSharePercent}%)`)].join('\n');
              const matches = pickChoice(reply, segments, s => s.workScope);
              if (matches.length === 1) segment = matches[0];
            }
            const reviewedSegment = segment;
            const evidenceRefs = reviewedSegment.evidenceRefs;
            const criteria = task.templateSnapshot.qualityCriteria;
            const criteriaScores: { code: string; score: number; comment: string; evidenceRefs: string[] }[] = [];
            let workCompletedPercent = NaN;
            while (!Number.isFinite(workCompletedPercent) || workCompletedPercent < 0 || workCompletedPercent > 100) {
              const reply = yield `Tiến độ đã báo: ${task.progressPercent}%. Bằng chứng nhân viên đã nộp:\n${evidenceRefs.join('\n') || 'Chưa có'}\nNhập % phạm vi thực tế đã xác minh (0–100).`;
              const value = reply.trim().replace(/%$/, '').replace(',', '.');
              if (/^\d+(?:\.\d{1,2})?$/.test(value)) workCompletedPercent = Number(value);
            }
            let lateReason: string | null = null;
            if (reviewedSegment.submittedAt && Date.parse(reviewedSegment.submittedAt) > Date.parse(task.extendedDueAt ?? task.dueAt)) {
              do { lateReason = (yield 'Kết quả nộp sau hạn. Nhập nguyên nhân nộp muộn đã xác minh (ít nhất 5 ký tự).').trim(); }
              while (lateReason.length < 5);
            }
            for (const criterion of criteria) {
              const max = criterion.code === 'completeness' ? Math.floor(criterion.maxScore * workCompletedPercent) / 100 : criterion.maxScore;
              while (true) {
                const reply = yield `${criterion.name} (0–${max} điểm). Nhập “điểm | lý do”, ví dụ “${max} | Đã đối chiếu với biên bản”.`;
                const separator = reply.indexOf('|');
                if (separator < 1) continue;
                const raw = reply.slice(0, separator).trim().replace(',', '.');
                const comment = reply.slice(separator + 1).trim();
                const score = Number(raw);
                if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || score < 0 || score > max || comment.length < 5) continue;
                criteriaScores.push({ code: criterion.code, score, comment, evidenceRefs });
                break;
              }
            }
            let reason = note;
            while (reason.trim().length < 5) {
              reason = (yield 'Nhập nhận xét tổng hợp và căn cứ nghiệm thu.').trim();
            }
            const total = criteriaScores.reduce((sum, entry) => sum + entry.score, 0);
            const clientRequestId = newClientMessageId();
            return {
              summary: [`${outcome === 'REWORK' ? 'Yêu cầu làm lại' : 'Xác nhận nghiệm thu'} “${task.title}” · ${performanceNumber(total)}/100 điểm rubric`,
                ...criteriaScores.map((entry, i) => `• ${criteria[i].name}: ${entry.score}/${criteria[i].maxScore} · ${entry.comment}`),
                `• Phạm vi đã xác minh: ${workCompletedPercent}%`,
                ...(lateReason ? [`• Lý do nộp muộn: ${lateReason}`] : []),
                `• Nhận xét: ${reason}`].join('\n'),
              execute: async () => {
                const updated = await api.performanceTaskAction(task.id, 'evaluate', {
                  expectedVersion: task.version, clientRequestId, segmentId: reviewedSegment.segmentId,
                  criteriaScores, workCompletedPercent, outcome, employeeFault: false, lateReason,
                  reason, evidenceRefs: evidenceRefs.length ? evidenceRefs : [reason],
                });
                const evaluation = updated.evaluations[updated.evaluations.length - 1];
                return `${outcome === 'REWORK' ? 'Đã yêu cầu làm lại' : 'Đã nghiệm thu nhiệm vụ'} “${updated.title}” · ${performanceNumber(evaluation?.totalScore)}/100 điểm · ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = evaluateTaskFlow();
          await advance(await step.next(), step);
          return;
        }
      }

      // ---- EVALUATION DOMAIN ----
      const [dashboard, me] = await Promise.all([api.performanceDashboard(period), fetchMe()]);
      if (signal.aborted) return;
      const employeeId = me.employeeId ?? undefined;
      const evaluations = dashboard.evaluations;

      const current: Session = session.current?.domain === 'evaluation' && session.current.period === period
        ? session.current
        : { domain: 'evaluation', period, projectIds: [], taskIds: [], evaluationIds: [] };
      session.current = current;

      if (intent === 'eval-list' || intent === 'eval-pending') {
        const filtered = evaluations.filter(e => {
          if (/\b(?:cua toi|cua minh|cua em)\b/.test(q) && e.employeeId !== employeeId) return false;
          if (intent === 'eval-pending') {
            if (e.employeeId === employeeId && (['OPEN', 'SELF_REVIEW'].includes(e.evaluationStatus) || (e.evaluationStatus === 'PROVISIONAL' && !e.reconsideration))) return true;
            if (e.evaluatorEmployeeId === employeeId && (['OPEN', 'SELF_REVIEW', 'MANAGER_REVIEW'].includes(e.evaluationStatus) || e.reconsideration?.status === 'REQUESTED')) return true;
            if (can('performance_kpi.appeal_review') && e.appeal && ['REQUESTED', 'IN_REVIEW', 'RETURNED'].includes(e.appeal.status)) return true;
            return false;
          }
          return true;
        });
        current.evaluationIds = filtered.map(e => e.id);
        current.selectedId = filtered.length === 1 ? filtered[0].id : undefined;
        if (!filtered.length) {
          say(`Kỳ ${period} hiện không có phiếu đánh giá KPI hiệu suất nào trong danh sách này.`);
          return;
        }
        say([
          `KPI hiệu suất · Kỳ ${period} (${filtered.length} hồ sơ):`,
          ...filtered.map((e, i) => {
            const disputeTag = e.appeal ? ` · Khiếu nại: ${e.appeal.status}` : e.reconsideration ? ` · Kiến nghị: ${e.reconsideration.status}` : '';
            return `${i + 1}. ${e.employeeName} (${e.role} · ${e.storeName}) · ${performanceLabels[e.evaluationStatus] ?? e.evaluationStatus} · Điểm: ${performanceNumber(e.finalScore)}/100${disputeTag}`;
          }),
          '\nNhắn “xem mục 1”, “tự nhận xét mục 1”, “chấm điểm mục 1”, “công bố mục 1”, “kiến nghị mục 1”, “phản hồi kiến nghị mục 1” hoặc “khiếu nại mục 1”.',
        ].join('\n'));
        return;
      }

      const ordered = current.evaluationIds.map(id => evaluations.find(e => e.id === id)).filter((e): e is PerformanceEvaluation => !!e);
      const candidates = ordered.length ? ordered : evaluations;
      const picked = pickChoice(instruction, candidates, e => `${e.employeeName} ${e.storeName}`);
      const ownEval = evaluations.find(e => e.employeeId === employeeId);
      const selected = picked[0]
        ?? (current.selectedId ? evaluations.find(e => e.id === current.selectedId) : undefined)
        ?? (['eval-detail', 'eval-self-review', 'eval-reconsider', 'eval-appeal'].includes(intent) && ownEval ? ownEval : undefined)
        ?? (candidates.length === 1 ? candidates[0] : undefined);

      if (!selected) {
        current.evaluationIds = candidates.map(e => e.id);
        say([
          `Bạn muốn chọn hồ sơ KPI hiệu suất nào trong kỳ ${period}?`,
          ...candidates.slice(0, 10).map((e, i) => `${i + 1}. ${e.employeeName} (${e.storeName}) · ${performanceLabels[e.evaluationStatus] ?? e.evaluationStatus} · ${performanceNumber(e.finalScore)}/100`),
          'Hãy nhắn kèm số thứ tự, ví dụ “xem mục 1”.',
        ].join('\n'));
        return;
      }
      current.selectedId = selected.id;

      if (intent === 'eval-detail') {
        const explained = await api.performanceExplain(selected.id);
        say([
          `KPI hiệu suất · ${selected.employeeName} · Kỳ ${selected.period} · ${performanceLabels[selected.evaluationStatus] ?? selected.evaluationStatus}`,
          explained.summary,
          ...selected.criteriaScores.map(c => `• ${c.name}: ${performanceNumber(c.score)}/100 · Trọng số áp dụng ${performanceNumber(c.effectiveWeightPercent)}%`),
          selected.reconsideration?.responseReason ? 'Phản hồi kiến nghị · ' + selected.reconsideration.responseReason : '',
          selected.appeal?.responseReason ? 'Kết luận khiếu nại ' + (selected.appeal.reviewerRole ?? '') + ' · ' + selected.appeal.responseReason : '',
          ...(/\blich su\b/.test(q) ? selected.history.map(entry => {
            const action = ({'EVALUATION_OPENED':'Mở hồ sơ','EVALUATION_MANAGER-SCORE':'Quản lý chấm điểm','EVALUATION_FINALIZE':'Công bố kết quả','EVALUATION_RECONSIDERATION':'Nhân viên kiến nghị','EVALUATION_RECONSIDERATION-RESPONSE':'Phản hồi kiến nghị','EVALUATION_APPEAL':'Nhân viên khiếu nại','EVALUATION_APPEAL-DECISION':'Quyết định khiếu nại'} as Record<string,string>)[entry.action] ?? 'Cập nhật hồ sơ';
            return action + ' · ' + (entry.reason ?? '') + (typeof entry.before?.finalScore === 'number' && typeof entry.after?.finalScore === 'number' ? ' · Điểm ' + performanceNumber(entry.before.finalScore) + ' → ' + performanceNumber(entry.after.finalScore) : '');
          }) : []),
          ...(explained.advice ?? []),
          selected.history.length ? `Chuỗi băm kiểm toán · Block #${selected.history.length} · SHA-256 ${selected.history[selected.history.length - 1].hash.slice(0, 12)}...` : '',
        ].filter(Boolean).join('\n'));
        return;
      }

      const adjusting = /\b(?:dieu chinh|sua diem|tang diem|giam diem)\b/.test(q);
      if (intent === 'eval-score' || adjusting && ['eval-reconsider-response', 'eval-appeal-decision'].includes(intent)) {
        const kind = intent === 'eval-score' ? 'evaluation.score'
          : intent === 'eval-reconsider-response' ? 'reconsideration.response' : 'appeal.decision';
        const required = kind === 'evaluation.score' ? 'performance_kpi.evaluate'
          : kind === 'reconsideration.response' ? 'performance_kpi.reconsider' : 'performance_kpi.appeal_review';
        if (!can(required) || kind !== 'appeal.decision' && selected.evaluatorEmployeeId !== employeeId) {
          say('Bạn cần có quyền chấm hoặc giải quyết khiếu nại đối với hồ sơ này.');
          return;
        }
        const evaluation = selected;
        async function* scoreEvaluationFlow(): AsyncGenerator<string, Plan, string> {
          const manual = evaluation.policySnapshot.frameworkSnapshot.criteria.filter(c => !['tasks', 'revenue'].includes(c.code));
          const scores: {code: string; score: number | null; notApplicable: boolean; comment: string; evidenceRefs: string[]}[] = [];
          for (const criterion of manual) {
            while (true) {
              const reply = yield criterion.name + ' · Trọng số ' + criterion.weightPercent + '%.\nNhập “điểm | lý do | bằng chứng”, ví dụ “85 | Hoàn thành đầy đủ | Biên bản kiểm tra”.\nNếu tiêu chí thiếu dữ liệu, nhập “không áp dụng | lý do”.';
              const [raw, comment = '', ...proof] = reply.split('|').map(value => value.trim());
              if (comment.length < 5 || comment.length > 2000) continue;
              if (normalizeText(raw) === 'khong ap dung') {
                scores.push({code: criterion.code, score: null, notApplicable: true, comment, evidenceRefs: []});
                break;
              }
              const numeric = raw.replace(',', '.');
              const evidence = proof.join(' | ');
              if (!/^\d+(?:\.\d{1,2})?$/.test(numeric) || Number(numeric) > 100 || evidence.length < 5 || evidence.length > 2000) continue;
              scores.push({code: criterion.code, score: Number(numeric), notApplicable: false, comment, evidenceRefs: [evidence]});
              break;
            }
          }
          let reason = note;
          while (reason.trim().length < 5 || reason.length > 2000) reason = (yield 'Nhập nhận xét tổng hợp và căn cứ chấm KPI.').trim();
          const content = {criteriaScores: scores, reason, evidenceRefs: [...new Set([reason, ...scores.flatMap(score => score.evidenceRefs)])],
            ...(kind === 'evaluation.score' ? {} : {decision: 'ADJUSTED'})};
          const proposal = await api.performancePost<{actionId: string; preview: PerformanceKpiEvaluationActionPreview}>('/chat/actions/performance/preview', {
            domain: 'evaluation', kind, target: {evaluationId: evaluation.id}, content,
          });
          const preview = proposal.preview;
          const clientRequestId = newClientMessageId();
          return {
            summary: ['Bản xem trước ' + (kind === 'evaluation.score' ? 'chấm' : 'điều chỉnh') + ' KPI · ' + evaluation.employeeName + ' · ' + evaluation.period,
              ...(kind === 'evaluation.score' ? [
                ...preview.criteriaScores.map(score => '• ' + (evaluation.policySnapshot.frameworkSnapshot.criteria.find(c => c.code === score.code)?.name ?? score.code) + ': ' + performanceNumber(score.projectedScore) + '/100 · Trọng số áp dụng ' + performanceNumber(score.effectiveWeightPercent) + '%'),
                '• Điểm nhóm nhiệm vụ: ' + performanceNumber(preview.taskGroupScore) + '/100',
                '• Tổng điểm dự kiến: ' + performanceNumber(preview.projectedFinalScore) + '/100',
              ] : scores.map(score => '• ' + (manual.find(c => c.code === score.code)?.name ?? score.code) + ' · ' + (score.notApplicable ? 'Không áp dụng' : performanceNumber(score.score) + '/100') + ' · ' + score.comment)),
              '• Nhận xét: ' + reason, ...preview.warnings].join('\n'),
            execute: async () => {
              const result = await api.performancePost<PerformanceKpiEvaluationAction>('/chat/actions/' + proposal.actionId + '/decision', {
                approve: true, expectedVersion: preview.expectedVersion, planDigest: preview.planDigest, clientRequestId,
              });
              const saved = result.result?.evaluation;
              if (!saved) throw new Error('Chưa lưu được điểm KPI. Hãy kiểm tra lại hồ sơ.');
              return 'Đã ' + (kind === 'evaluation.score' ? 'lưu điểm' : 'điều chỉnh điểm') + ' KPI cho ' + saved.employeeName + ': ' + performanceNumber(saved.finalScore) + '/100 · ' + (performanceLabels[saved.evaluationStatus] ?? saved.evaluationStatus) + '.';
            },
          };
        }
        const step = scoreEvaluationFlow();
        await advance(await step.next(), step);
        return;
      }
      if (intent === 'eval-self-review') {
        function* selfReviewFlow(): Step<Plan> {
          let reviewText = note;
          while (reviewText.trim().length < 5) {
            reviewText = (yield `Bạn hãy nhập nội dung tự nhận xét kết quả công việc kỳ ${selected.period} (tối thiểu 5 ký tự):`).trim();
          }
          return {
            summary: `Gửi tự nhận xét KPI hiệu suất kỳ ${selected.period} của ${selected.employeeName}: “${reviewText}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'self-review', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                text: reviewText,
                evidenceRefs: [`Tự nhận xét qua Chat: ${reviewText}`],
              });
              return `Đã lưu tự nhận xét cho kỳ ${updated.period}. Trạng thái hiện tại: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = selfReviewFlow();
        await advance(await step.next(), step);
        return;
      }

      if (intent === 'eval-finalize') {
        const nextLabel = selected.evaluationStatus === 'MANAGER_REVIEW' ? 'Công bố điểm tạm tính (PROVISIONAL)' : 'Chốt điểm chính thức (FINAL)';
        const reason = note.trim().length >= 5 ? note.trim() : `Xác nhận ${nextLabel.toLowerCase()} sau khi đối chiếu đầy đủ bằng chứng.`;
        const plan: Plan = {
          summary: `${nextLabel} cho hồ sơ ${selected.employeeName} (Kỳ ${selected.period} · Điểm hiện tại ${performanceNumber(selected.finalScore)}/100) · Lý do: “${reason}”.`,
          execute: async () => {
            const updated = await api.performanceEvaluationAction(selected.id, 'finalize', {
              expectedVersion: selected.version,
              clientRequestId: newClientMessageId(),
              reason,
              evidenceRefs: [reason],
            });
            return `Đã cập nhật hồ sơ ${updated.employeeName} sang trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus} (${performanceNumber(updated.finalScore)}/100).`;
          },
        };
        decision.current = { plan };
        say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
        return;
      }

      if (intent === 'eval-reconsider' || intent === 'eval-appeal') {
        const appeal = intent === 'eval-appeal';
        const subject = appeal ? 'khiếu nại độc lập' : 'kiến nghị';
        if (!selected.criteriaScores.length) {
          say('Hồ sơ chưa có tiêu chí đã chấm để gửi ' + subject + '.');
          return;
        }
        function* disputeFlow(): Step<Plan> {
          const criteria = selected.criteriaScores;
          let pickedCriteria = criteria.filter(c => normalizeText(instruction).includes(normalizeText(c.name)));
          while (!pickedCriteria.length) {
            const reply = yield 'Bạn muốn gửi ' + subject + ' về tiêu chí nào?\n' +
              criteria.map((c, i) => `${i + 1}. ${c.name} · ${performanceNumber(c.score)}/100`).join('\n') +
              '\nNhập số thứ tự, tên tiêu chí hoặc “tất cả”.';
            const normalized = normalizeText(reply);
            pickedCriteria = normalized === 'tat ca' ? criteria : pickChoice(reply, criteria, c => c.name);
          }
          let reason = note;
          while (reason.trim().length < 5 || reason.length > 2000) {
            reason = (yield `Nhập lý do và bằng chứng gửi ${subject} cho kỳ ${selected.period}.`).trim();
          }
          const criterionCodes = pickedCriteria.map(c => c.code);
          return {
            summary: `Gửi ${subject} KPI hiệu suất kỳ ${selected.period} (${selected.employeeName})\nTiêu chí · ${pickedCriteria.map(c => c.name).join(', ')}\nLý do và bằng chứng · ${reason}`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, appeal ? 'appeal' : 'reconsideration', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                reason,
                evidenceRefs: [reason],
                criterionCodes,
                taskIds: criterionCodes.includes('tasks') ? selected.taskBreakdown.slice(0, 50).map(t => t.taskId) : [],
              });
              return `Đã gửi ${subject} cho kỳ ${updated.period}. Trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = disputeFlow();
        await advance(await step.next(), step);
        return;
      }

      if (intent === 'eval-reconsider-response') {
        const isSelf = selected.employeeId === employeeId;
        const decisionKind = isSelf
          ? (/\brut\b/.test(q) ? 'WITHDRAWN' : 'ACCEPTED')
          : 'UPHELD';
        function* reconsiderResponseFlow(): Step<Plan> {
          let reason = note;
          while (reason.trim().length < 5) {
            reason = (yield `Nhập nội dung phản hồi kiến nghị cho hồ sơ ${selected.employeeName} (tối thiểu 5 ký tự):`).trim();
          }
          return {
            summary: `Phản hồi kiến nghị hồ sơ ${selected.employeeName} · ${decisionKind === 'UPHELD' ? 'Giữ nguyên điểm' : decisionKind === 'ACCEPTED' ? 'Đồng ý với phản hồi' : 'Rút kiến nghị'} · Nội dung: “${reason}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'reconsideration-response', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                decision: decisionKind,
                reason,
                evidenceRefs: [reason],
              });
              return `Đã ghi nhận phản hồi kiến nghị cho ${updated.employeeName}. Trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = reconsiderResponseFlow();
        await advance(await step.next(), step);
        return;
      }

      if (intent === 'eval-appeal-decision') {
        const decisionKind = /\btra ve|cham lai\b/.test(q) ? 'RETURNED' : 'UPHELD';
        function* appealDecisionFlow(): Step<Plan> {
          let reason = note;
          while (reason.trim().length < 5) {
            reason = (yield `Nhập kết luận giải quyết khiếu nại cho hồ sơ ${selected.employeeName} (tối thiểu 5 ký tự):`).trim();
          }
          return {
            summary: `Giải quyết khiếu nại KPI hiệu suất của ${selected.employeeName} · Quyết định: ${decisionKind === 'RETURNED' ? 'Trả về người chấm đánh giá lại' : 'Giữ nguyên kết quả'} · Kết luận: “${reason}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'appeal-decision', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                decision: decisionKind,
                reason,
                evidenceRefs: [reason],
              });
              return `Đã ban hành quyết định giải quyết khiếu nại cho ${updated.employeeName}. Trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = appealDecisionFlow();
        await advance(await step.next(), step);
        return;
      }
    }

    void respond()
      .catch(error => say(error instanceof Error ? error.message : 'Chưa xử lý được yêu cầu công việc / KPI hiệu suất.'))
      .finally(() => {
        if (!signal.aborted) {
          inFlight.current = undefined;
          setBusy(false);
        }
      });
    return true;
  }

  return { busy, reset, send };
}
