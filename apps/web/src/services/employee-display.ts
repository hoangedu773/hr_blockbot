import type { EmployeeSummary } from '@hr-blockbot/contracts';
const readable = (value: string | null | undefined) => {
  const text = value?.trim(); return text && !/^[a-f\d]{24}$/i.test(text) ? text : null;
};
/** Display labels only. IDs and recorded grades remain unchanged in API/data. */
export const employeeLocationLabel = (employee: Pick<EmployeeSummary, 'storeName' | 'department'>) =>
  readable(employee.storeName) || readable(employee.department) || 'Chưa cập nhật nơi làm việc';
export const employeeJobLabel = (title: string | null | undefined) => title?.trim() === 'SM' ? 'Cửa hàng trưởng (SM)' : title?.trim() || 'Chưa cập nhật chức danh';
export function profileDate(value: string | null | undefined) {
  if (!value) return 'Chưa cập nhật';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Chưa cập nhật';
}
