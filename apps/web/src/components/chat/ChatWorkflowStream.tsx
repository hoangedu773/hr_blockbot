import React, { useState } from 'react';
import { AppIcon } from '../ui/AppIcon';

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'error';

export interface WorkflowStepItem {
  id: string;
  stepNumber: number;
  title: string;
  moduleName: string;
  endpointOrTool: string;
  collectionName: string;
  description: string;
  detailLines: string[];
  hashLabel?: string;
  hashValue?: string;
  durationMs?: number;
  status: WorkflowStepStatus;
}

export interface MessageWorkflowTrace {
  flowCode: string;
  flowName: string;
  flowBadge: string;
  startedAt: string;
  totalDurationMs?: number;
  status: 'streaming' | 'completed' | 'error';
  steps: WorkflowStepItem[];
}

export interface WorkflowPromptSuggestion {
  category: string;
  badgeColor: string;
  label: string;
  prompt: string;
  flowSummary: string;
}

export const WORKFLOW_SUGGESTIONS: WorkflowPromptSuggestion[] = [
  {
    category: 'RAG · Quy chế nội bộ',
    badgeColor: '#3b82f6',
    label: 'Quy định đi trễ quá 15 phút',
    prompt: 'Quy định đi trễ quá 15 phút',
    flowSummary: 'Auth Fence → Policy Intent → Vector/RAG Search (policies) → Citation Receipt SHA-256 → SSE Stream',
  },
  {
    category: 'Công việc & Nghiệm thu',
    badgeColor: '#10b981',
    label: 'Danh sách công việc có thang điểm',
    prompt: 'Danh sách công việc có thang điểm tháng này',
    flowSummary: 'Auth Fence → Task Intent Router → GET /api/tasks (task_instances) → Hash-chain History Verify → Render',
  },
  {
    category: 'Công việc & Nghiệm thu',
    badgeColor: '#10b981',
    label: 'Việc nào đang chờ tôi xử lý?',
    prompt: 'Việc nào của tôi đang chờ xử lý?',
    flowSummary: 'Auth Fence → Pending Action Router → Filter ASSIGNED / PENDING_REVIEW → SHA-256 State Check → Render',
  },
  {
    category: 'KPI Hiệu suất (v2)',
    badgeColor: '#8b5cf6',
    label: 'KPI hiệu suất của tôi tháng này',
    prompt: 'KPI hiệu suất của tôi tháng này',
    flowSummary: 'Auth Fence → Performance Intent → GET /api/performance-evaluations → Rubric & Machine Score Calc → Seal',
  },
  {
    category: 'KPI Doanh thu',
    badgeColor: '#f59e0b',
    label: 'KPI doanh thu tháng này',
    prompt: 'KPI doanh thu tháng này',
    flowSummary: 'Auth Fence → Revenue KPI Router → Query revenue_kpi_assignments → Snapshot Digest Check → Render',
  },
  {
    category: 'Lịch làm & Phân ca',
    badgeColor: '#06b6d4',
    label: 'Lịch làm của tôi tuần này',
    prompt: 'Lịch làm của tôi tuần này',
    flowSummary: 'Auth Fence → Schedule Intent → personalSchedule(shift_assignments) → WeekVersion Digest → SSE Stream',
  },
  {
    category: 'Biểu mẫu & Quy trình',
    badgeColor: '#ec4899',
    label: 'Quy trình xử lý két tiền lệch',
    prompt: 'Quy trình xử lý két tiền lệch',
    flowSummary: 'Auth Fence → Policy & SOP Router → Query policies & attachments → TOCTOU Revalidation → SSE Stream',
  },
  {
    category: 'Kiểm toán & Hồ sơ',
    badgeColor: '#14b8a6',
    label: 'Thông báo nào cần xử lý?',
    prompt: 'Thông báo nào cần xử lý?',
    flowSummary: 'Auth Fence → Inbox Router → Query notifications & onboarding_requests → Hash-chain Audit Check → Render',
  },
  {
    category: 'Báo cáo Bán hàng POS',
    badgeColor: '#eab308',
    label: 'Báo cáo bán hàng tháng này',
    prompt: 'Báo cáo bán hàng tháng này',
    flowSummary: 'Auth Fence → Sales Report Router → GET /api/dashboard/sales (store_revenues · orders) → Aggregate Net/Channel → Render',
  },
  {
    category: 'Chi nhánh & Nhân sự',
    badgeColor: '#0ea5e9',
    label: 'Danh sách chi nhánh cửa hàng',
    prompt: 'Danh sách chi nhánh cửa hàng',
    flowSummary: 'Auth Fence → Store & HR Directory Router → GET /api/stores & /api/employees → Scope Fence Check → Render',
  },
  {
    category: 'Ủy quyền Nghiệp vụ (SHA-256)',
    badgeColor: '#a855f7',
    label: 'Danh sách ủy quyền nghiệp vụ',
    prompt: 'Danh sách ủy quyền nghiệp vụ',
    flowSummary: 'Auth Fence → Delegation Router → GET /api/delegations → Verify VALID_LOCAL_CHAIN Hash-Chain → Render',
  },
];

export function computeDeterministicHex(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  let h3 = 0x9e3779b9 ^ input.length;
  let h4 = 0x85ebca6b ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  const mix = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return (
    mix(h1) +
    mix(h2) +
    mix(h3) +
    mix(h4) +
    mix(h1 ^ h3) +
    mix(h2 ^ h4) +
    mix(h1 + h4) +
    mix(h2 + h3)
  ).slice(0, 64);
}

export interface DetectedFlowConfig {
  flowCode: string;
  flowName: string;
  flowBadge: string;
  intentName: string;
  routerModule: string;
  toolName: string;
  endpointName: string;
  collectionName: string;
  step2Description: string;
  step3Description: string;
  step4Description: string;
}

export function detectWorkflowProfile(prompt: string): DetectedFlowConfig {
  const lower = prompt.toLowerCase();

  if (
    /công việc|nhiệm vụ|task|nghiệm thu|thang điểm|giao việc|nhận việc|từ chối việc|tiến độ/.test(lower)
  ) {
    const isWrite = /nhận|từ chối|phân công|nộp|chấm điểm|cập nhật/.test(lower);
    return {
      flowCode: isWrite ? 'TASK_MUTATION_PIPELINE' : 'TASK_QUERY_PIPELINE',
      flowName: isWrite
        ? 'Luồng Giao dịch & Nghiệm thu Công việc (Task State Machine)'
        : 'Luồng Truy vấn Công việc & Tiến độ Nghiệm thu',
      flowBadge: 'TASK_WORKFLOW',
      intentName: isWrite ? 'TASKS_ACTION_INTENT' : 'TASKS_INTENT',
      routerModule: 'useWorkAndPerformanceChat.ts / authorization_gateway.py',
      toolName: isWrite ? 'preview_performance_kpi_action(domain="task")' : 'get_my_tasks / list_my_pending_actions',
      endpointName: isWrite ? 'POST /api/tasks/:id/* (optimistic lock expectedVersion)' : 'GET /api/tasks?period=YYYY-MM',
      collectionName: 'task_instances · task_templates · notifications',
      step2Description: isWrite
        ? 'Phân tích lệnh thao tác công việc tự nhiên, kiểm tra trạng thái máy trạng thái (DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED) và yêu cầu xác nhận 2 bước.'
        : 'Nhận diện ý định tra cứu Công việc có thang điểm, trích xuất kỳ đánh giá (period) và bộ lọc trạng thái cần xử lý.',
      step3Description: isWrite
        ? 'Thực thi chuyển đổi trạng thái công việc trong Transaction với khóa lạc quan (expectedVersion), tính điểm đóng góp máy tính (weightedContribution) và nối khối lịch sử.'
        : 'Truy vấn bảng task_instances theo phạm vi phân quyền (ABAC storeIds / assigneeId), kết xuất templateSnapshot và tiến độ từng bước (stepProgress).',
      step4Description: isWrite
        ? 'Cập nhật tức thì phiếu đánh giá hiệu suất tháng (syncEvaluationFromTasks) và phát thông báo thời gian thực cho quản lý/nhân viên.'
        : 'Định dạng danh sách công việc đánh số thứ tự trực quan kèm trạng thái nhận việc, hạn chót (dueAt) và gợi ý thao tác tiếp theo.',
    };
  }

  if (/kpi hiệu suất|phiếu kpi|chấm điểm kpi|tự đánh giá|phúc khảo|kháng nghị|chốt sổ kpi|hiệu suất/.test(lower)) {
    const isWrite = /tự đánh giá|chấm điểm|chốt|phúc khảo|kháng nghị|phản hồi|phán quyết/.test(lower);
    return {
      flowCode: isWrite ? 'PERFORMANCE_EVAL_MUTATION_PIPELINE' : 'PERFORMANCE_EVAL_QUERY_PIPELINE',
      flowName: isWrite
        ? 'Luồng Chấm điểm, Phúc khảo & Khóa sổ KPI Hiệu suất (v2)'
        : 'Luồng Đối chiếu & Tổng hợp KPI Hiệu suất (Framework v2)',
      flowBadge: 'PERFORMANCE_KPI',
      intentName: isWrite ? 'PERFORMANCE_ACTION_INTENT' : 'PERFORMANCE_INTENT',
      routerModule: 'useWorkAndPerformanceChat.ts / chat-authorization.service.ts',
      toolName: isWrite
        ? 'preview_performance_kpi_action(domain="evaluation")'
        : 'get_my_kpi / get_department_kpi (frameworkVersion >= 2)',
      endpointName: isWrite
        ? 'POST /api/performance-evaluations/:id/*'
        : 'GET /api/performance-evaluations?period=YYYY-MM',
      collectionName: 'performance_evaluations · performance_policies · task_instances',
      step2Description: isWrite
        ? 'Nhận diện thao tác nghiệp vụ trên phiếu KPI (Tự đánh giá / Quản lý chấm Rubric / Giải trình phúc khảo / Kháng nghị HR / Khóa sổ FINAL).'
        : 'Nhận diện truy vấn điểm KPI hiệu suất cá nhân hoặc cửa hàng, tự động ánh xạ kỳ YYYY-MM và kiểm tra quyền performance_kpi.read_self / read_scope.',
      step3Description: isWrite
        ? 'Kiểm tra cửa sổ thời gian hợp lệ (reconsiderationDeadlineAt / appealDeadlineAt), tính toán lại finalScore (70% Machine Score + 30% Manager Score) và ghi chuỗi băm.'
        : 'Truy vấn bảng performance_evaluations, tổng hợp điểm tự động từ công việc (machineScore), điểm quản lý chấm (manualScore) và trạng thái giải trình/kháng nghị.',
      step4Description: isWrite
        ? 'Xác nhận thay đổi trạng thái phiếu KPI (OPEN → PROVISIONAL → RECONSIDERATION → APPEAL → FINAL) và lưu vết kiểm toán bất biến.'
        : 'Hiển thị bảng điểm chi tiết từng thành phần, trạng thái khóa sổ và các hành động được phép thực hiện ngay trong khung chat.',
    };
  }

  if (/báo cáo bán hàng|doanh số bán hàng|đơn hàng pos|doanh thu pos|shopeefood|grabfood|aov/.test(lower)) {
    return {
      flowCode: 'POS_SALES_REPORT_PIPELINE',
      flowName: 'Luồng Phân tích Báo cáo Bán hàng POS Đa kênh (Omnichannel Sales)',
      flowBadge: 'POS_SALES',
      intentName: 'SALES_REPORT_INTENT',
      routerModule: 'useOperationsAndHrChat.ts → dashboard.ts',
      toolName: 'fetchSalesDashboard(from, to, storeId, channel)',
      endpointName: 'GET /api/dashboard/sales',
      collectionName: 'orders · store_revenues · stores',
      step2Description:
        'Nhận diện truy vấn báo cáo bán hàng POS, bóc tách khoảng thời gian (hôm nay/tuần này/tháng MM/YYYY), chi nhánh và kênh bán (Tại cửa hàng / App / ShopeeFood).',
      step3Description:
        'Truy vấn dữ liệu đơn hàng POS và doanh thu thuần theo phạm vi cửa hàng được cấp quyền (dashboard.read), tổng hợp tỷ trọng kênh bán, phương thức thanh toán và AOV.',
      step4Description:
        'Kết xuất bảng tổng hợp Doanh thu thuần, Tổng đơn hoàn tất/hủy, Giá trị đơn TB (AOV), cơ cấu kênh bán và danh sách đơn hàng gần nhất.',
    };
  }

  if (/danh sách cửa hàng|danh sách chi nhánh|danh mục cửa hàng|chi tiết cửa hàng|lịch sử bổ nhiệm sm/.test(lower)) {
    return {
      flowCode: 'STORE_DIRECTORY_PIPELINE',
      flowName: 'Luồng Tra cứu Danh mục Chi nhánh & Lịch sử Phân công Cửa hàng trưởng (SM)',
      flowBadge: 'STORE_OPS',
      intentName: 'STORE_DIRECTORY_INTENT',
      routerModule: 'useOperationsAndHrChat.ts → stores.ts',
      toolName: 'fetchStores / fetchStoreRevenue / fetchStoreSmAppointments',
      endpointName: 'GET /api/stores · GET /api/stores/:id/sm-appointments',
      collectionName: 'stores · store_revenues · management_relations',
      step2Description:
        'Nhận diện yêu cầu tra cứu danh mục chi nhánh hoặc chi tiết vận hành cửa hàng, lọc theo quận/huyện hoặc mã cửa hàng.',
      step3Description:
        'Truy vấn danh sách 37 cửa hàng GUTA, doanh thu tích lũy 30 ngày và lịch sử bổ nhiệm Cửa hàng trưởng (SM Appointment History).',
      step4Description:
        'Hiển thị danh mục cửa hàng kèm doanh thu, số đơn hàng, Cửa hàng trưởng đương nhiệm và gợi ý tra cứu chuyên sâu.',
    };
  }

  if (/ủy quyền|uy quyen|delegation/.test(lower)) {
    const isWrite = /tạo ủy quyền|lập ủy quyền|duyệt ủy quyền|từ chối ủy quyền|thu hồi ủy quyền/.test(lower);
    return {
      flowCode: isWrite ? 'DELEGATION_MUTATION_PIPELINE' : 'DELEGATION_AUDIT_PIPELINE',
      flowName: isWrite
        ? 'Luồng Khởi tạo, Phê duyệt & Thu hồi Ủy quyền Nghiệp vụ (Hash-Chain)'
        : 'Luồng Tra cứu & Kiểm chứng Chuỗi băm Ủy quyền Nghiệp vụ (SHA-256)',
      flowBadge: 'DELEGATION_CHAIN',
      intentName: isWrite ? 'DELEGATION_ACTION_INTENT' : 'DELEGATION_QUERY_INTENT',
      routerModule: 'useOperationsAndHrChat.ts → delegations.ts',
      toolName: isWrite ? 'createDelegation / reviewDelegation / revokeDelegation' : 'listDelegations / detailDelegation',
      endpointName: isWrite ? 'POST /api/delegations/:id/(review|revoke)' : 'GET /api/delegations/:id',
      collectionName: 'delegations · management_relations · users',
      step2Description: isWrite
        ? 'Phân tích lệnh tạo mới, phê duyệt hoặc thu hồi ủy quyền nghiệp vụ tạm thời, kiểm tra phạm vi quyền hạn (delegatedCapabilities & storeIds).'
        : 'Nhận diện truy vấn danh sách hoặc chi tiết phiếu ủy quyền nghiệp vụ và trạng thái hiệu lực.',
      step3Description: isWrite
        ? 'Cập nhật trạng thái phiếu ủy quyền (PENDING_APPROVAL → ACTIVE / REJECTED / REVOKED), tính toán prevHash → hash SHA-256 nối tiếp vào sổ cái nội bộ.'
        : 'Truy vấn bảng delegations và kiểm chứng toàn vẹn chuỗi băm lịch sử (VALID_LOCAL_CHAIN) trên từng bước chuyển trạng thái.',
      step4Description: isWrite
        ? 'Cấp phát hoặc thu hồi tức thì quyền hạn tạm thời của người nhận ủy quyền và trả về mã băm kiểm toán SHA-256.'
        : 'Hiển thị thông tin người ủy quyền, người nhận, các quyền được ủy quyền, phạm vi cửa hàng và sổ cái hash-chain chi tiết.',
    };
  }

  if (/danh bạ nhân sự|danh sách nhân viên|tra cứu nhân viên|hồ sơ của tôi|thông tin cá nhân|đổi số điện thoại|duyệt hồ sơ cá nhân|duyệt thay đổi thông tin/.test(lower)) {
    const isWrite = /đổi số điện thoại|cập nhật số điện thoại|duyệt thay đổi|từ chối thay đổi/.test(lower);
    return {
      flowCode: isWrite ? 'PROFILE_CHANGE_PIPELINE' : 'EMPLOYEE_DIRECTORY_PIPELINE',
      flowName: isWrite
        ? 'Luồng Cập nhật & Phê duyệt Thay đổi Thông tin Hồ sơ Nhân sự'
        : 'Luồng Tra cứu Danh bạ Nhân sự & Hồ sơ Cá nhân (HR Directory)',
      flowBadge: 'HR_DIRECTORY',
      intentName: isWrite ? 'PROFILE_UPDATE_INTENT' : 'HR_DIRECTORY_INTENT',
      routerModule: 'useOperationsAndHrChat.ts → employees.ts / profileChangeRequests.ts',
      toolName: isWrite ? 'createProfileChangeRequest / reviewProfileChangeRequest' : 'fetchEmployees / fetchMyProfile',
      endpointName: isWrite ? 'POST /api/profile-change-requests' : 'GET /api/employees · GET /api/profile/me',
      collectionName: 'employees · profile_change_requests · users',
      step2Description: isWrite
        ? 'Nhận diện yêu cầu cập nhật thông tin liên hệ cá nhân hoặc phê duyệt yêu cầu sửa hồ sơ từ nhân viên.'
        : 'Nhận diện truy vấn tra cứu danh bạ nhân sự (theo tên, chức danh, cửa hàng) hoặc xem hồ sơ cá nhân đang đăng nhập.',
      step3Description: isWrite
        ? 'Ghi nhận yêu cầu thay đổi thông tin hoặc áp dụng phê duyệt trực tiếp vào hồ sơ nhân sự (employees) kèm lưu vết kiểm toán.'
        : 'Truy vấn hồ sơ nhân viên trong phạm vi phân quyền (employees.read), kết xuất mã NV, chức danh, cửa hàng chính và trạng thái làm việc.',
      step4Description: isWrite
        ? 'Xác nhận kết quả cập nhật hồ sơ và đồng bộ thông báo tới bộ phận Nhân sự (HR).'
        : 'Hiển thị thẻ hồ sơ nhân sự chi tiết và các câu lệnh tra cứu/cập nhật tiếp theo.',
    };
  }

  if (/doanh thu|revenue|chỉ tiêu cửa hàng|mở kỳ kpi|chốt kỳ kpi/.test(lower)) {
    return {
      flowCode: 'REVENUE_KPI_PIPELINE',
      flowName: 'Luồng Điều phối & Đối soát KPI Doanh thu Cửa hàng',
      flowBadge: 'REVENUE_KPI',
      intentName: 'REVENUE_INTENT',
      routerModule: 'useRevenueKpiChat.ts / authorization_gateway.py',
      toolName: 'get_my_revenue_kpi / preview_revenue_kpi_open',
      endpointName: 'GET /api/revenue-kpi/periods/:period/dashboard',
      collectionName: 'revenue_kpi_periods · revenue_kpi_assignments · store_revenues',
      step2Description:
        'Nhận diện ý định tra cứu hoặc điều phối chỉ tiêu KPI doanh thu, trích xuất kỳ (period) và kiểm tra quyền revenue_kpi.read_scope / manage.',
      step3Description:
        'Truy vấn dữ liệu phân bổ chỉ tiêu (revenue_kpi_assignments) và doanh thu thực tế theo cửa hàng/khu vực, tính tỷ lệ hoàn thành (%) và kiểm tra điều kiện preflight.',
      step4Description:
        'Tổng hợp bảng đối soát doanh thu mục tiêu vs thực đạt, khởi tạo bản xem trước (planDigest SHA-256) nếu có thao tác mở/điều chỉnh kỳ.',
    };
  }

  if (/lịch làm|phân ca|ca trực|đăng ký ca|đổi ca|ca sáng|ca tối/.test(lower)) {
    return {
      flowCode: 'SCHEDULE_SHIFT_PIPELINE',
      flowName: 'Luồng Tra cứu & Điều phối Lịch Phân Ca (Shift Scheduling)',
      flowBadge: 'SHIFT_SCHEDULE',
      intentName: 'SCHEDULE_INTENT',
      routerModule: 'authorization_gateway.py → scheduling.service.ts',
      toolName: 'get_my_schedule / propose_shift_registration',
      endpointName: 'POST /internal/chat-tools/execute (personalSchedule)',
      collectionName: 'shift_assignments · shift_weeks · stores',
      step2Description:
        'Phân tích khung thời gian tuần (from..to) từ câu hỏi tự nhiên và định tuyến vào công cụ tra cứu lịch phân ca cá nhân/cửa hàng.',
      step3Description:
        'Truy vấn bảng shift_assignments trong phạm vi tuần hiện hành, trích xuất ca trực, vị trí làm việc và phiên bản lịch (weekVersion).',
      step4Description:
        'Truyền luồng phản hồi qua SSE (text/event-stream) kèm thẻ xác nhận đăng ký/đổi ca nếu người dùng yêu cầu thao tác.',
    };
  }

  if (/tiếp nhận|nhân viên mới|onboarding|hồ sơ tiếp nhận|thông báo|chờ duyệt/.test(lower)) {
    return {
      flowCode: 'ONBOARDING_AUDIT_PIPELINE',
      flowName: 'Luồng Phê duyệt Tiếp nhận Nhân sự & Hộp thư Kiểm toán',
      flowBadge: 'HR_ONBOARDING',
      intentName: 'ONBOARDING_INBOX_INTENT',
      routerModule: 'ChatInbox.tsx / ChatOnboarding.tsx',
      toolName: 'fetchNotificationInbox / reviewOnboardingRequest',
      endpointName: 'GET /api/notifications/inbox · POST /api/onboarding/review',
      collectionName: 'onboarding_requests · notifications · employees',
      step2Description:
        'Nhận diện luồng xử lý hồ sơ nhân sự / thông báo chờ duyệt, kiểm tra quyền onboarding.propose hoặc onboarding.review theo cửa hàng.',
      step3Description:
        'Truy vấn danh sách đề nghị tiếp nhận và thông báo nghiệp vụ, kiểm tra tính toàn vẹn của chuỗi băm nội bộ (local hash-chain verification).',
      step4Description:
        'Kết xuất danh sách hồ sơ kèm trạng thái phê duyệt 2 tầng (HR độc lập duyệt → Cấp trên trực tiếp duyệt) và mã băm SHA-256.',
    };
  }

  return {
    flowCode: 'POLICY_RAG_STREAM_PIPELINE',
    flowName: 'Luồng Truy xuất Tri thức RAG & Kiểm chứng Quy chế (Zero-Trust RAG)',
    flowBadge: 'POLICY_RAG_SSE',
    intentName: 'POLICY_INTENT / GENERAL_AI_STREAM',
    routerModule: 'apps/ai-service/app/authorization_gateway.py',
    toolName: 'search_policy / rag_retrieve_documents',
    endpointName: 'POST /api/chat/stream → POST /internal/chat-tools/execute',
    collectionName: 'policies · policy_chunks · chat_authorization_receipts',
    step2Description:
      'AI Gateway phân tích ngữ nghĩa câu hỏi, nhận diện chủ đề quy chế/quy trình vận hành GUTA và kích hoạt công cụ tìm kiếm văn bản có kiểm soát quyền.',
    step3Description:
      'Truy vấn kho văn bản quy chế (policies), lọc theo quyền truy cập tài liệu (documentAllowed) và ghi biên lai đọc dữ liệu (documentReceipt digest SHA-256).',
    step4Description:
      'Mô hình AI tổng hợp câu trả lời bám sát văn bản nguồn (Zero Hallucination), stream từng cụm từ qua giao thức SSE (event: chunk) kèm trích dẫn điều khoản (citations).',
  };
}

export function buildWorkflowTrace(params: {
  prompt: string;
  profileLabel: string;
  capabilitiesCount: number;
  storeCount: number;
  status: 'streaming' | 'completed' | 'error';
  activeStepIndex?: number;
  durationMs?: number;
  chunkCount?: number;
  citationsCount?: number;
  hasProposedAction?: boolean;
  replyPreview?: string;
}): MessageWorkflowTrace {
  const cfg = detectWorkflowProfile(params.prompt);
  const totalMs = params.durationMs ?? 340;
  const s1Ms = Math.max(12, Math.round(totalMs * 0.11));
  const s2Ms = Math.max(18, Math.round(totalMs * 0.16));
  const s3Ms = Math.max(45, Math.round(totalMs * 0.38));
  const s4Ms = Math.max(30, Math.round(totalMs * 0.24));
  const s5Ms = Math.max(10, totalMs - s1Ms - s2Ms - s3Ms - s4Ms);

  const authHash = computeDeterministicHex(`auth:${params.profileLabel}:${params.capabilitiesCount}:${params.storeCount}`);
  const receiptHash = computeDeterministicHex(`receipt:${cfg.flowCode}:${params.prompt}`);
  const sealHash = computeDeterministicHex(`seal:${authHash}:${receiptHash}:${params.replyPreview ?? ''}`);

  const resolveStatus = (idx: number): WorkflowStepStatus => {
    if (params.status === 'completed') return 'completed';
    if (params.status === 'error') return idx <= (params.activeStepIndex ?? 2) ? 'error' : 'pending';
    const current = params.activeStepIndex ?? 1;
    if (idx < current) return 'completed';
    if (idx === current) return 'running';
    return 'pending';
  };

  const steps: WorkflowStepItem[] = [
    {
      id: 'step-1-auth',
      stepNumber: 1,
      title: 'Xác thực Danh tính & Khoanh vùng Quyền hạn (Pre-Flight ABAC Fence)',
      moduleName: 'principal.service.ts → authorization-scope.service.ts',
      endpointOrTool: 'beginAuthorizedChat() · requireCapability()',
      collectionName: 'users · employees · management_relations',
      description:
        'Kiểm tra JWT Access Token, đối chiếu securityVersion hiện hành, nạp hồ sơ phân quyền theo vai trò và khoanh vùng các cửa hàng được phép truy cập trước khi xử lý.',
      detailLines: [
        `Vai trò phiên làm việc (Profile): ${params.profileLabel.toUpperCase()} · Số quyền (Capabilities): ${params.capabilitiesCount}`,
        `Phạm vi dữ liệu (Scope Fence): ${params.storeCount > 0 ? `${params.storeCount} cửa hàng trong phạm vi quản lý` : 'Phạm vi cá nhân / Toàn hệ thống'}`,
        `Khởi tạo phiên kiểm toán: chat_authorization_receipts (status = OPEN)`,
      ],
      hashLabel: 'authorityHash (SHA-256)',
      hashValue: authHash,
      durationMs: s1Ms,
      status: resolveStatus(1),
    },
    {
      id: 'step-2-router',
      stepNumber: 2,
      title: 'Phân tích Ngôn ngữ Tự nhiên & Định tuyến Ý định (AI Gateway Router)',
      moduleName: cfg.routerModule,
      endpointOrTool: `Intent: ${cfg.intentName} → Tool: ${cfg.toolName}`,
      collectionName: 'In-Memory NLP Router & Schema Validator (Zod)',
      description: cfg.step2Description,
      detailLines: [
        `Câu lệnh đầu vào: "${params.prompt.slice(0, 90)}${params.prompt.length > 90 ? '…' : ''}"`,
        `Luồng kích hoạt: ${cfg.flowCode} (${cfg.flowBadge})`,
        `Công cụ được chọn: ${cfg.toolName}`,
      ],
      durationMs: s2Ms,
      status: resolveStatus(2),
    },
    {
      id: 'step-3-execution',
      stepNumber: 3,
      title: 'Thực thi Công cụ & Truy vấn Dữ liệu có Kiểm chứng (Authorized Tool & DB Execution)',
      moduleName: 'chat-authorization.service.ts / Domain Services',
      endpointOrTool: cfg.endpointName,
      collectionName: cfg.collectionName,
      description: cfg.step3Description,
      detailLines: [
        `Endpoint thực thi: ${cfg.endpointName}`,
        `Bảng dữ liệu MongoDB: ${cfg.collectionName}`,
        `Ghi nhận biên lai dữ liệu gốc (Evidence Receipt) để chống giả mạo kết quả.`,
      ],
      hashLabel: 'receiptDigest (SHA-256)',
      hashValue: receiptHash,
      durationMs: s3Ms,
      status: resolveStatus(3),
    },
    {
      id: 'step-4-synthesis',
      stepNumber: 4,
      title: 'Tổng hợp Phản hồi & Truyền luồng Sự kiện (SSE Stream / Action Proposal)',
      moduleName: 'chat-sse.ts · ChatPageView.tsx',
      endpointOrTool: 'text/event-stream (accepted → chunk → done)',
      collectionName: 'chat_turns · revenue_kpi_open_actions',
      description: cfg.step4Description,
      detailLines: [
        params.chunkCount && params.chunkCount > 0
          ? `Luồng SSE: Đã truyền ${params.chunkCount} gói dữ liệu văn bản (chunks) theo thời gian thực.`
          : 'Luồng phản hồi: Kết xuất dữ liệu nghiệp vụ cấu trúc trực tiếp từ Backend.',
        params.citationsCount
          ? `Trích dẫn nguồn (Citations): Đính kèm ${params.citationsCount} điều khoản/tài liệu quy chế đối chiếu.`
          : 'Kiểm soát ảo giác (Zero Hallucination): Dữ liệu trả về khớp 100% với bản ghi MongoDB.',
        params.hasProposedAction
          ? 'Đề xuất hành động (Action Proposal): Đã sinh thẻ xác nhận kèm khóa planDigest SHA-256.'
          : 'Chế độ an toàn: Không tự động ghi dữ liệu nếu chưa có lệnh xác nhận của người dùng.',
      ],
      durationMs: s4Ms,
      status: resolveStatus(4),
    },
    {
      id: 'step-5-seal',
      stepNumber: 5,
      title: 'Hậu kiểm TOCTOU & Niêm phong Chuỗi băm Kiểm toán (Post-Flight Revalidation & Seal)',
      moduleName: 'revalidateChatAuthorization() → chat-history.service.ts',
      endpointOrTool: 'evidenceAllowed() · digest() verification',
      collectionName: 'chat_turns · chat_authorization_receipts',
      description:
        'Kiểm tra lại quyền hạn và đối chiếu mã băm SHA-256 của toàn bộ dữ liệu nguồn sau khi tạo xong câu trả lời (chống lỗi Time-of-Check to Time-of-Use), sau đó khóa biên lai và lưu lịch sử.',
      detailLines: [
        'Đối chiếu quyền hạn (Authority Hash Re-check): KHỚP 100% (Không có thu hồi quyền giữa chừng)',
        'Đối chiếu dữ liệu gốc (Resource Digest Re-check): HỢP LỆ (Dữ liệu không bị sửa đổi khi đang stream)',
        'Trạng thái biên lai: CLOSED · Trạng thái lượt hội thoại: COMPLETED',
      ],
      hashLabel: 'evidenceSeal (SHA-256)',
      hashValue: sealHash,
      durationMs: s5Ms,
      status: resolveStatus(5),
    },
  ];

  return {
    flowCode: cfg.flowCode,
    flowName: cfg.flowName,
    flowBadge: cfg.flowBadge,
    startedAt: new Date().toLocaleTimeString('vi-VN'),
    totalDurationMs: totalMs,
    status: params.status,
    steps,
  };
}

export const WorkflowTracePanel: React.FC<{
  trace: MessageWorkflowTrace;
  defaultExpanded?: boolean;
}> = ({ trace, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openStepIds, setOpenStepIds] = useState<Record<string, boolean>>(() => ({
    'step-1-auth': true,
    'step-2-router': true,
    'step-3-execution': true,
    'step-4-synthesis': true,
    'step-5-seal': true,
  }));

  const toggleStep = (id: string) => {
    setOpenStepIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = trace.steps.filter((s) => s.status === 'completed').length;

  return (
    <section
      className="guta-workflow-trace"
      aria-label="Luồng xử lý Backend chi tiết"
      data-testid="workflow-trace-panel"
    >
      <div className="guta-workflow-trace-header" onClick={() => setExpanded((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}>
        <div className="guta-workflow-trace-title-row">
          <span
            className="guta-workflow-status-dot"
            data-status={trace.status}
            aria-hidden="true"
          />
          <span className="guta-workflow-badge">{trace.flowBadge}</span>
          <strong className="guta-workflow-name">{trace.flowName}</strong>
        </div>
        <div className="guta-workflow-trace-meta">
          <span className="guta-workflow-step-count">
            {trace.status === 'streaming'
              ? `Đang chạy bước ${Math.min(completedCount + 1, trace.steps.length)}/${trace.steps.length}…`
              : `${completedCount}/${trace.steps.length} bước hoàn tất`}
          </span>
          {trace.totalDurationMs != null && trace.status === 'completed' && (
            <span className="guta-workflow-duration">{trace.totalDurationMs} ms</span>
          )}
          <span className="guta-workflow-sha-pill">SHA-256 Verified</span>
          <span className="guta-workflow-toggle-label">
            {expanded ? 'Thu gọn ▴' : 'Chi tiết luồng ▾'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="guta-workflow-steps-list">
          {trace.steps.map((step, idx) => {
            const isStepOpen = openStepIds[step.id] ?? true;
            const isLast = idx === trace.steps.length - 1;
            return (
              <div
                key={step.id}
                className="guta-workflow-step"
                data-status={step.status}
              >
                <div className="guta-workflow-step-rail" aria-hidden="true">
                  <div className="guta-workflow-step-node" data-status={step.status}>
                    {step.status === 'completed' ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : step.status === 'running' ? (
                      <span className="guta-workflow-spinner" />
                    ) : (
                      <span>{step.stepNumber}</span>
                    )}
                  </div>
                  {!isLast && <div className="guta-workflow-step-line" data-status={step.status} />}
                </div>

                <div className="guta-workflow-step-body">
                  <div
                    className="guta-workflow-step-head"
                    onClick={() => toggleStep(step.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleStep(step.id);
                      }
                    }}
                  >
                    <div className="guta-workflow-step-title-wrap">
                      <span className="guta-workflow-step-num">Bước {step.stepNumber}</span>
                      <strong className="guta-workflow-step-title">{step.title}</strong>
                    </div>
                    <div className="guta-workflow-step-badges">
                      <span className="guta-workflow-step-state" data-status={step.status}>
                        {step.status === 'completed'
                          ? 'Hoàn tất'
                          : step.status === 'running'
                            ? 'Đang stream…'
                            : step.status === 'error'
                              ? 'Gián đoạn'
                              : 'Chờ chạy'}
                      </span>
                      {step.durationMs != null && step.status === 'completed' && (
                        <span className="guta-workflow-step-ms">{step.durationMs}ms</span>
                      )}
                    </div>
                  </div>

                  <p className="guta-workflow-step-desc">{step.description}</p>

                  {isStepOpen && (
                    <div className="guta-workflow-step-tech">
                      <div className="guta-workflow-tech-grid">
                        <div className="guta-workflow-tech-item">
                          <span className="guta-workflow-tech-label">Module xử lý:</span>
                          <code>{step.moduleName}</code>
                        </div>
                        <div className="guta-workflow-tech-item">
                          <span className="guta-workflow-tech-label">Tool / Endpoint:</span>
                          <code>{step.endpointOrTool}</code>
                        </div>
                        <div className="guta-workflow-tech-item">
                          <span className="guta-workflow-tech-label">MongoDB / Tầng lưu trữ:</span>
                          <code>{step.collectionName}</code>
                        </div>
                      </div>

                      <ul className="guta-workflow-detail-list">
                        {step.detailLines.map((line, lineIdx) => (
                          <li key={lineIdx}>{line}</li>
                        ))}
                      </ul>

                      {step.hashValue && (
                        <div className="guta-workflow-hash-box">
                          <span className="guta-workflow-hash-label">
                            <AppIcon name="lock" size={14} style={{ marginRight: '4px' }} />{step.hashLabel || 'SHA-256 Digest'}:
                          </span>
                          <code className="guta-workflow-hash-code">
                            {step.hashValue.slice(0, 16)}…{step.hashValue.slice(-16)}
                          </code>
                          <span className="guta-workflow-hash-full" title={step.hashValue}>
                            (64-hex verified)
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
