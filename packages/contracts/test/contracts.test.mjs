import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  UserRoleSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  MeResponseSchema,
  EmployeeSummarySchema,
  EmployeeDetailSchema,
  PaginationQuerySchema,
  PaginatedEmployeesResponseSchema,
  ApiErrorResponseSchema,
} from "../dist/index.js";

describe("Contracts: Auth & RBAC Schemas", () => {
  it("chấp nhận đúng 2 role hệ thống: Admin và Employee", () => {
    assert.equal(UserRoleSchema.parse("Admin"), "Admin");
    assert.equal(UserRoleSchema.parse("Employee"), "Employee");
  });

  it("từ chối mọi role thứ ba hoặc sai format (store_manager, admin lowercase, Lead, Manager)", () => {
    const invalidRoles = [
      "store_manager",
      "manager",
      "admin",
      "employee",
      "Lead",
      "Intern",
      "SuperAdmin",
      "HR",
      "",
    ];

    for (const role of invalidRoles) {
      assert.throws(
        () => UserRoleSchema.parse(role),
        /invalid_enum_value/,
        `Role '${role}' phải bị từ chối nhưng lại được chấp nhận`
      );
    }
  });

  it("LoginRequestSchema yêu cầu email hợp lệ và password không rỗng", () => {
    const valid = LoginRequestSchema.parse({
      email: "test.admin@guta.vn",
      password: "secure_password_123",
    });
    assert.equal(valid.email, "test.admin@guta.vn");

    assert.throws(() =>
      LoginRequestSchema.parse({
        email: "not-an-email",
        password: "pass",
      })
    );

    assert.throws(() =>
      LoginRequestSchema.parse({
        email: "valid@guta.vn",
        password: "",
      })
    );
  });

  it("LoginResponse và RefreshResponse TUYỆT ĐỐI KHÔNG chứa refreshToken trong response body", () => {
    const loginRes = LoginResponseSchema.parse({
      accessToken: "mock.jwt.access.token",
      user: {
        id: "usr_123456",
        role: "Admin",
      },
    });
    assert.equal("refreshToken" in loginRes, false);

    const refreshRes = RefreshResponseSchema.parse({
      accessToken: "mock.jwt.new.access.token",
    });
    assert.equal("refreshToken" in refreshRes, false);
  });

  it("MeResponseSchema phản ánh đúng identity và role", () => {
    const me = MeResponseSchema.parse({
      userId: "660000000000000000000001",
      role: "Employee",
      employeeId: "660000000000000000000002",
      departmentId: "660000000000000000000003",
      level: "Middle",
      skills: ["Pha chế", "Thu ngân"],
    });
    assert.equal(me.role, "Employee");
    assert.equal(me.level, "Middle");
  });
});

describe("Contracts: Employee Data Minimization & PII Elimination", () => {
  it("EmployeeSummarySchema loại bỏ hoàn toàn PII nhạy cảm khi parse raw record", () => {
    const rawEmployeeData = {
      employeeId: "661234567890abcdef123456",
      fullName: "Nguyễn Văn A",
      level: "Junior",
      department: "GUTA 01",
      skills: ["Barista"],
      activeLoad: 1,
      status: "active",
      // Các trường PII nhạy cảm từ raw DB/ETL:
      bank_name: "Vietcombank",
      bank_account_number: "0123456789",
      bank_account_raw: "VCB 0123456789",
      salary: 10000000,
      cccd: "079090000001",
      phone: "0901234567",
      leave_reason: "Lý do cá nhân",
      source_row: 42,
    };

    // Zod parse mặc định strip các unrecognized keys không thuộc schema
    const parsed = EmployeeSummarySchema.parse(rawEmployeeData);

    // Kiểm tra các trường allowlist tồn tại
    assert.equal(parsed.employeeId, "661234567890abcdef123456");
    assert.equal(parsed.fullName, "Nguyễn Văn A");
    assert.equal(parsed.level, "Junior");
    assert.equal(parsed.department, "GUTA 01");
    assert.deepEqual(parsed.skills, ["Barista"]);
    assert.equal(parsed.activeLoad, 1);
    assert.equal(parsed.status, "active");

    // Kiểm tra PII hoàn toàn KHÔNG xuất hiện trong parsed object
    assert.equal("bank_name" in parsed, false);
    assert.equal("bank_account_number" in parsed, false);
    assert.equal("bank_account_raw" in parsed, false);
    assert.equal("salary" in parsed, false);
    assert.equal("cccd" in parsed, false);
    assert.equal("phone" in parsed, false);
    assert.equal("leave_reason" in parsed, false);
    assert.equal("source_row" in parsed, false);
  });

  it("EmployeeDetailSchema (own profile) không chứa ngân hàng hoặc lý do nghỉ", () => {
    const ownData = {
      employeeId: "661234567890abcdef123456",
      fullName: "Trần Thị B",
      level: "Senior",
      department: "GUTA 02",
      skills: ["Pha chế", "Quản lý ca"],
      activeLoad: 2,
      status: "active",
      employeeCode: "NV002",
      phone: "0912345678",
      hiredAt: "2024-01-15T00:00:00.000Z",
      // Nhạy cảm tuyệt đối cấm:
      bank_name: "BIDV",
      bank_account_number: "987654321",
      leave_reason: "Nghỉ việc riêng",
    };

    const parsed = EmployeeDetailSchema.parse(ownData);
    assert.equal(parsed.employeeCode, "NV002");
    assert.equal(parsed.phone, "0912345678");
    assert.equal("bank_name" in parsed, false);
    assert.equal("bank_account_number" in parsed, false);
    assert.equal("leave_reason" in parsed, false);
  });
});

describe("Contracts: Pagination & Error Envelope", () => {
  it("PaginationQuerySchema ép kiểu và giới hạn mặc định hợp lệ", () => {
    const query = PaginationQuerySchema.parse({ page: "2", limit: "50" });
    assert.equal(query.page, 2);
    assert.equal(query.limit, 50);

    const defaultQuery = PaginationQuerySchema.parse({});
    assert.equal(defaultQuery.page, 1);
    assert.equal(defaultQuery.limit, 20);

    // Limit vượt quá 100 phải bị từ chối
    assert.throws(() => PaginationQuerySchema.parse({ limit: 150 }));
  });

  it("PaginatedEmployeesResponseSchema đóng gói items và paging chuẩn", () => {
    const paginated = PaginatedEmployeesResponseSchema.parse({
      items: [
        {
          employeeId: "661234567890abcdef123456",
          fullName: "Lê Văn C",
          level: "Middle",
          department: "GUTA 03",
          skills: ["Cashier"],
          activeLoad: 0,
          status: "active",
        },
      ],
      paging: {
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });

    assert.equal(paginated.items.length, 1);
    assert.equal(paginated.paging.totalItems, 1);
  });

  it("ApiErrorResponseSchema đóng gói lỗi theo cấu trúc { error: { code, message, details?, correlationId? } }", () => {
    const err = ApiErrorResponseSchema.parse({
      error: {
        code: "RBAC_DENIED",
        message: "Không có quyền truy cập dữ liệu ngoài scope được gán",
        details: { departmentId: "660000000000000000000099" },
        correlationId: "req-abc-xyz-123",
      },
    });

    assert.equal(err.error.code, "RBAC_DENIED");
    assert.equal(err.error.correlationId, "req-abc-xyz-123");
  });
});
