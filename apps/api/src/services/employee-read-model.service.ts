// Read-time classification only. Never write guessed status to legacy data.
export const employeeStatus = (row: any): "active" | "inactive" | "UNKNOWN" => row.status === "active" || row.status === "inactive" ? row.status : "UNKNOWN";
export const employeeSearch = (value: string) => {
  const literal = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { $or: ["fullName", "full_name", "employeeCode", "employee_code"].map((key) => ({ [key]: { $regex: literal, $options: "i" } })) };
};
