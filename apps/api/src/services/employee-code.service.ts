import mongoose from "mongoose";
import { WorkflowError } from "./project-workflow.service.js";

const COUNTER_ID = "GT-CH";
const CODE_PATTERN = /^GT-CH\d{8}$/;
const MAX_SEQUENCE = 9999;

export function employeeCodePeriod(hiredAt: string): string {
  const date = new Date(hiredAt);
  if (Number.isNaN(date.getTime())) throw new WorkflowError(400, "INVALID_HIRE_DATE", "Ngày bắt đầu không hợp lệ.");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")!.value;
  const month = parts.find((part) => part.type === "month")!.value;
  if (Number(year) < 2000 || Number(year) > 2099) throw new WorkflowError(400, "INVALID_HIRE_DATE", "Quy tắc mã hiện hỗ trợ năm bắt đầu từ 2000 đến 2099.");
  return year.slice(-2) + month;
}

/** Include both legacy/canonical identifiers and codes already reserved by pending requests. */
async function highestSuffix(collection: string, fields: string[]): Promise<number> {
  const result = await mongoose.connection.collection(collection).aggregate<{ maximum: number }>([
    { $project: { codes: fields.map((field) => ({ $toUpper: { $cond: [{ $eq: [{ $type: "$" + field }, "string"] }, "$" + field, ""] } })) } },
    { $unwind: "$codes" }, { $match: { codes: CODE_PATTERN } },
    { $group: { _id: null, maximum: { $max: { $toInt: { $substrBytes: ["$codes", 9, 4] } } } } },
  ]).toArray();
  return result[0]?.maximum ?? 0;
}

export async function reserveEmployeeCode(hiredAt: string): Promise<string> {
  const period = employeeCodePeriod(hiredAt);
  const highWater = Math.max(...await Promise.all([
    highestSuffix("employees", ["employeeCode", "employee_code", "personnelKey"]),
    highestSuffix("onboarding_requests", ["payload.employeeCode", "employeeKey"]),
    highestSuffix("users", ["username"]),
  ]));
  const counters = mongoose.connection.collection<{ _id: string; value: number; updatedAt: Date }>("employee_code_counters");
  const update = { $max: { value: highWater }, $set: { updatedAt: new Date() } };
  try { await counters.updateOne({ _id: COUNTER_ID }, update, { upsert: true }); }
  catch (error: any) {
    // Two first requests may attempt to initialize the same built-in unique _id.
    if (error.code !== 11000) throw error;
    await counters.updateOne({ _id: COUNTER_ID }, update);
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const counter = await counters.findOneAndUpdate({ _id: COUNTER_ID, value: { $gte: 0, $lt: MAX_SEQUENCE } },
      { $inc: { value: 1 }, $set: { updatedAt: new Date() } }, { returnDocument: "after" });
    if (!counter) throw new WorkflowError(409, "EMPLOYEE_CODE_EXHAUSTED", "Đã hết dãy số thứ tự 4 chữ số. Cần mở rộng quy tắc mã trước khi tiếp nhận thêm.");
    if (!Number.isInteger(counter.value)) throw new WorkflowError(503, "EMPLOYEE_CODE_COUNTER_INVALID", "Bộ cấp mã cần được kiểm tra. Giữ lại đề nghị để gửi lại sau.");
    const code = "GT-CH" + period + String(counter.value).padStart(4, "0");
    const exact = { $regex: "^" + code + "$", $options: "i" };
    const [employee, user, request] = await Promise.all([
      mongoose.connection.collection("employees").findOne({ $or: [{ employeeCode: exact }, { employee_code: exact }, { personnelKey: exact }] }, { projection: { _id: 1 } }),
      mongoose.connection.collection("users").findOne({ username: exact }, { projection: { _id: 1 } }),
      mongoose.connection.collection("onboarding_requests").findOne({ $or: [{ employeeKey: exact }, { "payload.employeeCode": exact }] }, { projection: { _id: 1 } }),
    ]);
    if (!employee && !user && !request) return code;
  }
  throw new WorkflowError(503, "EMPLOYEE_CODE_RETRY", "Chưa cấp được mã duy nhất. Vui lòng gửi lại cùng đề nghị.");
}
