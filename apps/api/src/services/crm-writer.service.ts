import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { WorkflowError, objectId } from "./project-workflow.service.js";

const owner = new AsyncLocalStorage<string>();
const instanceId = randomUUID();
// Cross-process serialization for the small CRM V1 write surface. No TTL: a
// suspended writer must never outlive a lease and commit behind a new owner.
// A killed process leaves a maintenance fence; only verified operator recovery
// after stopping old writers may unlock it. Business workflow fences remain.
export async function withCrmWriter<T>(action: () => Promise<T>): Promise<T> {
  const controls = mongoose.connection.collection<any>("authorization_controls");
  const inherited = owner.getStore();
  if (inherited) {
    if (!await controls.findOne({ _id: "crm-writers", locked: true, token: inherited })) throw new WorkflowError(409, "CRM_WRITER_FENCED", "Writer không còn sở hữu khóa; cần đối chiếu, không ghi tiếp.");
    return action();
  }
  try { await controls.updateOne({ _id: "crm-writers" }, { $setOnInsert: { locked: false, revision: 0 } }, { upsert: true }); }
  catch (error: any) { if (error.code !== 11000) throw error; }
  const token = randomUUID();
  const claimed = await controls.findOneAndUpdate({ _id: "crm-writers", locked: false }, { $set: { locked: true, token, at: new Date(), ownerProcessId: process.pid, ownerInstanceId: instanceId }, $inc: { revision: 1 } }, { returnDocument: "after" });
  if (!claimed) throw new WorkflowError(409, "CRM_WRITE_IN_PROGRESS", "CRM đang xử lý thay đổi khác. Tải lại và thử lại; nếu writer đã dừng cần maintenance đối chiếu trước khi gỡ khóa.");
  try { return await owner.run(token, action); }
  finally { await controls.updateOne({ _id: "crm-writers", token }, { $set: { locked: false }, $unset: { token: "", at: "", ownerProcessId: "", ownerInstanceId: "" } }); }
}

export async function assertEmployeeReceivesWork(id: unknown, storeId: unknown) {
  const employee = await mongoose.connection.collection<any>("employees").findOne({ _id: objectId(String(id)) });
  if (employee?.lifecyclePendingRequestId) throw new WorkflowError(409, "CRM_EMPLOYEE_FENCED", "Nhân sự đang áp dụng workflow nhân sự; không tạo thêm phân công hoặc trách nhiệm.");
  if (!employee || employee.status !== "active" || !employee.storeMappingRef || String(employee.storeId) !== String(storeId)) throw new WorkflowError(409, "INVALID_ASSIGNEE", "Nhân sự không còn active trong cửa hàng canonical; tải lại để đối chiếu.");
  return employee;
}
