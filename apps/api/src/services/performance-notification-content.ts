import type { NotificationItem, NotificationType } from '@hr-blockbot/contracts';

type NoticeContent = Pick<NotificationItem, 'title' | 'body' | 'severity'>;

const content: Partial<Record<NotificationType, NoticeContent>> = {
  task_assigned: { title: 'Đã giao nhiệm vụ', body: 'Người được giao cần xem nội dung và phản hồi việc nhận nhiệm vụ.', severity: 'ACTION_REQUIRED' },
  task_accepted: { title: 'Đã nhận nhiệm vụ', body: 'Người được giao đã xác nhận nhận nhiệm vụ.', severity: 'INFO' },
  task_refused: { title: 'Nhiệm vụ bị từ chối', body: 'Người được giao đã từ chối. Người phụ trách có thể xem lý do và xử lý.', severity: 'ACTION_REQUIRED' },
  task_due_soon: { title: 'Nhiệm vụ sắp đến hạn', body: 'Hãy xem hạn thực hiện và phần việc còn lại.', severity: 'ACTION_REQUIRED' },
  task_overdue: { title: 'Nhiệm vụ đã quá hạn', body: 'Đã qua hạn thực hiện. Hãy mở nhiệm vụ để kiểm tra tình trạng.', severity: 'URGENT' },
  task_submitted: { title: 'Đã nộp kết quả nhiệm vụ', body: 'Kết quả đã được gửi. Người phụ trách có thể xem bằng chứng và đánh giá.', severity: 'ACTION_REQUIRED' },
  task_evaluated: { title: 'Nhiệm vụ đã được đánh giá', body: 'Đã ghi nhận kết quả đánh giá. Mở nhiệm vụ để xem chi tiết.', severity: 'INFO' },
  task_handover: { title: 'Đã cập nhật bàn giao nhiệm vụ', body: 'Mở nhiệm vụ để xem người phụ trách và phần việc được bàn giao.', severity: 'ACTION_REQUIRED' },
  performance_kpi_opened: { title: 'Đã mở đánh giá KPI', body: 'Hồ sơ đánh giá đã được tạo. Hãy xem kỳ và tiêu chí áp dụng.', severity: 'ACTION_REQUIRED' },
  performance_kpi_score_ready: { title: 'Đã cập nhật điểm KPI', body: 'Người đánh giá đã ghi điểm theo tiêu chí. Mở bản đánh giá để xem tình trạng và căn cứ.', severity: 'INFO' },
  performance_kpi_finalized: { title: 'Đã công bố kết quả KPI', body: 'Mở bản đánh giá để xem kết quả và trạng thái hiện tại.', severity: 'INFO' },
  performance_kpi_reconsideration_requested: { title: 'Có kiến nghị về điểm KPI', body: 'Người có trách nhiệm cần xem lý do kiến nghị và phản hồi.', severity: 'ACTION_REQUIRED' },
  performance_kpi_reconsideration_responded: { title: 'Đã phản hồi kiến nghị KPI', body: 'Mở bản đánh giá để xem nội dung phản hồi.', severity: 'INFO' },
  performance_kpi_appeal_requested: { title: 'Có khiếu nại về KPI', body: 'Mở bản đánh giá để xem nội dung và hạn xử lý khiếu nại.', severity: 'ACTION_REQUIRED' },
  performance_kpi_appeal_decided: { title: 'Đã xử lý khiếu nại KPI', body: 'Mở bản đánh giá để xem quyết định và lý do.', severity: 'INFO' },
  performance_kpi_corrected: { title: 'Đã điều chỉnh kết quả KPI', body: 'Kết quả đã được cập nhật. Mở bản đánh giá để xem lịch sử điều chỉnh.', severity: 'INFO' },
};

export function performanceNotificationContent(type: NotificationType, dedupeKey?: string): NoticeContent | undefined {
  if (type === 'performance_kpi_appeal_requested' && dedupeKey?.startsWith('performance_kpi_response_overdue:')) {
    return { title: 'Đã quá hạn phản hồi KPI', body: 'Hãy mở bản đánh giá để xem kiến nghị hoặc khiếu nại đang cần xử lý.', severity: 'URGENT' };
  }
  return content[type];
}
