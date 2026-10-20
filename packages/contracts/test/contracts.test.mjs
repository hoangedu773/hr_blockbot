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
  ProjectStatusSchema,
  CreateProfileChangeRequestSchema,
  ReviewProfileChangeRequestSchema,
  ReportReviewSchema,
  DepartmentCreateSchema,
  ProjectCreateSchema,
  ErrorCodeSchema,
  RagQueryRequestSchema,
  RagAnswerResponseSchema,
  LLMProviderTypeSchema,
  LLMProviderSchema,
  UpdateLLMProvidersRequestSchema,
  ProviderTestResultSchema,
  ConversationSchema,
  ConversationMessageSchema,
  PolicySchema,
  PolicyChunkMetaSchema,
  CitationSchema,
  WsEventNameSchema,
  WS_CLIENT_EVENTS,
  WS_SERVER_EVENTS,
  ChatSendPayloadSchema,
  ChatAckSchema,
  ChatAcceptedPayloadSchema,
  ChatChunkPayloadSchema,
  ChatConfirmPayloadSchema,
  ChatConfirmAckSchema,
  ChatDonePayloadSchema,
  ChatErrorPayloadSchema,
  NotificationNewPayloadSchema,
  ProjectUpdatedPayloadSchema,
  ReportUpdatedPayloadSchema,
  KpiUpdatedPayloadSchema,
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

    const parsed = EmployeeSummarySchema.parse(rawEmployeeData);

    assert.equal(parsed.employeeId, "661234567890abcdef123456");
    assert.equal(parsed.fullName, "Nguyễn Văn A");
    assert.equal(parsed.level, "Junior");
    assert.equal(parsed.department, "GUTA 01");
    assert.deepEqual(parsed.skills, ["Barista"]);
    assert.equal(parsed.activeLoad, 1);
    assert.equal(parsed.status, "active");

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

describe("Contracts: F1 Profile Change Request & Department Schemas", () => {
  it("DepartmentCreateSchema yêu cầu name và code", () => {
    const dept = DepartmentCreateSchema.parse({
      name: "Phòng Công Nghệ",
      code: "DEPT_TECH",
    });
    assert.equal(dept.name, "Phòng Công Nghệ");
  });

  it("CreateProfileChangeRequestSchema chỉ chấp nhận allowlist và từ chối nếu không có trường nào", () => {
    const valid = CreateProfileChangeRequestSchema.parse({
      targetFields: {
        level: "Senior",
        jobTitle: "Kỹ sư phần mềm",
      },
    });
    assert.equal(valid.targetFields.level, "Senior");

    assert.throws(
      () =>
        CreateProfileChangeRequestSchema.parse({
          targetFields: {},
        }),
      /Phải cung cấp ít nhất một trường/
    );
  });

  it("ReviewProfileChangeRequestSchema bắt buộc lý do khi REJECT và cho phép bỏ qua khi APPROVE", () => {
    const approve = ReviewProfileChangeRequestSchema.parse({
      action: "APPROVE",
    });
    assert.equal(approve.action, "APPROVE");

    assert.throws(
      () =>
        ReviewProfileChangeRequestSchema.parse({
          action: "REJECT",
        }),
      /Lý do từ chối/
    );

    const rejectWithReason = ReviewProfileChangeRequestSchema.parse({
      action: "REJECT",
      reason: "Chưa đủ thâm niên quy định",
    });
    assert.equal(rejectWithReason.reason, "Chưa đủ thâm niên quy định");
  });
});

describe("Contracts: F2 Project Lifecycle & Report Schemas", () => {
  it("ProjectStatusSchema chỉ chấp nhận đúng 5 trạng thái quy định", () => {
    const validStatuses = [
      "DRAFT",
      "ASSIGNED",
      "IN_PROGRESS",
      "PENDING_REVIEW",
      "COMPLETED",
    ];
    for (const status of validStatuses) {
      assert.equal(ProjectStatusSchema.parse(status), status);
    }

    // Cấm trạng thái 'OVERDUE' hoặc 'SUBMITTED'
    assert.throws(() => ProjectStatusSchema.parse("OVERDUE"));
    assert.throws(() => ProjectStatusSchema.parse("SUBMITTED"));
  });

  it("ProjectCreateSchema yêu cầu title và departmentId", () => {
    const proj = ProjectCreateSchema.parse({
      title: "Nâng cấp bảo mật Auth",
      departmentId: "DEPT_TECH",
    });
    assert.equal(proj.title, "Nâng cấp bảo mật Auth");
  });

  it("ReportReviewSchema bắt buộc reason khi REJECT và yêu cầu expectedVersion", () => {
    assert.throws(
      () =>
        ReportReviewSchema.parse({
          action: "REJECT",
          expectedVersion: 2,
        }),
      /Lý do xem xét/
    );

    const validReject = ReportReviewSchema.parse({
      action: "REJECT",
      reason: "Báo cáo thiếu bảng số liệu thực nghiệm",
      expectedVersion: 2,
    });
    assert.equal(validReject.expectedVersion, 2);
  });

  it("ErrorCodeSchema chứa đầy đủ mã lỗi mới", () => {
    assert.equal(
      ErrorCodeSchema.parse("MAX_CHANGE_REQUESTS_REACHED"),
      "MAX_CHANGE_REQUESTS_REACHED"
    );
    assert.equal(
      ErrorCodeSchema.parse("PROFILE_CHANGE_CONFLICT"),
      "PROFILE_CHANGE_CONFLICT"
    );
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

describe("Contracts: ADR-009 — user_role chỉ còn Admin|Employee", () => {
  it("RagQueryRequestSchema chỉ nhận Admin|Employee, mặc định Employee", () => {
    const parsed = RagQueryRequestSchema.parse({ question: "Quy định nghỉ phép?" });
    assert.equal(parsed.user_role, "Employee");

    assert.equal(
      RagQueryRequestSchema.parse({ question: "x", user_role: "Admin" }).user_role,
      "Admin"
    );
    assert.equal(
      RagQueryRequestSchema.parse({ question: "x", user_role: "Employee" }).user_role,
      "Employee"
    );

    for (const legacy of ["employee", "store_manager", "admin", "Manager"]) {
      assert.throws(
        () => RagQueryRequestSchema.parse({ question: "x", user_role: legacy }),
        /invalid_enum_value/,
        `user_role '${legacy}' phải bị từ chối nhưng lại được chấp nhận`
      );
    }
  });
});

describe("Contracts: ADR-017 — LLM provider settings", () => {
  const validProvider = {
    id: "prov-openai",
    name: "OpenAI compatible (Groq)",
    type: "openai_compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "gpt-oss-120b",
    maxTokens: 1024,
    timeoutMs: 15000,
    priority: 1,
    enabled: true,
    keyHint: "a1b2",
  };

  it("LLMProviderTypeSchema đúng 3 loại: openai_compatible | gemini | anthropic", () => {
    for (const type of ["openai_compatible", "gemini", "anthropic"]) {
      assert.equal(LLMProviderTypeSchema.parse(type), type);
    }
    for (const invalid of ["openai", "groq", "gemini_flash", "OPENAI_COMPATIBLE", ""]) {
      assert.throws(() => LLMProviderTypeSchema.parse(invalid), /invalid_enum_value/);
    }
  });

  it("LLMProviderSchema KHÔNG BAO GIỜ lộ keyCipher/key thật, chỉ keyHint", () => {
    const parsed = LLMProviderSchema.parse({
      ...validProvider,
      keyCipher: "3f8a:9c1d:encrypted-blob",
      apiKey: "sk-live-secret-should-never-leak",
    });

    assert.equal(parsed.keyHint, "a1b2");
    assert.equal("keyCipher" in parsed, false);
    assert.equal("apiKey" in parsed, false);

    assert.throws(() => LLMProviderSchema.parse({ ...validProvider, priority: 0 }));
    assert.throws(() => LLMProviderSchema.parse({ ...validProvider, model: "" }));
    assert.throws(() => LLMProviderSchema.parse({ ...validProvider, enabled: "yes" }));
  });

  it("UpdateLLMProvidersRequestSchema nhận mảng provider + apiKey chỉ-ghi và strip keyCipher", () => {
    const req = UpdateLLMProvidersRequestSchema.parse({
      providers: [
        { ...validProvider, apiKey: "sk-write-only" },
        {
          ...validProvider,
          id: "prov-gemini",
          type: "gemini",
          baseUrl: "https://generativelanguage.googleapis.com",
          model: "gemini-2.0-flash",
          priority: 2,
          keyCipher: "must-be-stripped",
        },
      ],
    });

    assert.equal(req.providers.length, 2);
    assert.equal(req.providers[0].apiKey, "sk-write-only");
    assert.equal(req.providers[1].apiKey, undefined);
    assert.equal("keyCipher" in req.providers[0], false);
    assert.equal("keyCipher" in req.providers[1], false);
  });

  it("ProviderTestResultSchema trả ok/latencyMs/model và error chỉ khi lỗi", () => {
    const ok = ProviderTestResultSchema.parse({
      ok: true,
      latencyMs: 412,
      model: "gpt-oss-120b",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.latencyMs, 412);
    assert.equal(ok.error, undefined);

    const failed = ProviderTestResultSchema.parse({
      ok: false,
      latencyMs: 30000,
      model: "gpt-oss-120b",
      error: "ETIMEDOUT",
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.error, "ETIMEDOUT");

    assert.throws(() => ProviderTestResultSchema.parse({ latencyMs: 10, model: "m" }));
    assert.throws(() => ProviderTestResultSchema.parse({ ok: true, latencyMs: -1, model: "m" }));
  });
});

describe("Contracts: conversations-storage — Conversation & Message", () => {
  const citation = {
    document: "Quy chế nội bộ GUTA",
    version: "1.0",
    article: "Điều 5",
    score: 0.87,
  };

  const message = {
    id: "5f1d2c4a-8b7e-4f0a-9c3d-2a6b7e8f9d10",
    role: "assistant",
    content: "Theo Điều 5, nhân viên được nghỉ 12 ngày/năm.",
    citations: [citation],
    abstain: false,
    createdAt: "2026-10-20T12:00:00.000Z",
  };

  const conversation = {
    id: "6600000000000000000000aa",
    userId: "660000000000000000000001",
    channel: "web",
    status: "active",
    messages: [message],
    messageCount: 1,
    startedAt: "2026-10-20T11:59:00.000Z",
    lastMessageAt: "2026-10-20T12:00:00.000Z",
  };

  it("ConversationMessageSchema đúng 3 role, citations mặc định [], abstain mặc định false", () => {
    const parsed = ConversationMessageSchema.parse({
      id: "msg-1",
      role: "user",
      content: "Chào",
      createdAt: "2026-10-20T12:00:00.000Z",
    });
    assert.deepEqual(parsed.citations, []);
    assert.equal(parsed.abstain, false);

    assert.deepEqual(
      ConversationMessageSchema.parse(message).citations.map((c) => c.article),
      ["Điều 5"]
    );

    assert.throws(() => ConversationMessageSchema.parse({ ...message, role: "bot" }));
    assert.throws(() => ConversationMessageSchema.parse({ ...message, role: "store_manager" }));
  });

  it("CitationSchema dùng chung đúng 4 field document/version/article/score", () => {
    const parsed = CitationSchema.parse(citation);
    assert.equal(parsed.document, "Quy chế nội bộ GUTA");
    assert.equal(parsed.score, 0.87);
    assert.deepEqual(Object.keys(parsed).sort(), ["article", "document", "score", "version"]);

    assert.throws(() => CitationSchema.parse({ document: "x", article: "Điều 1", score: 1 }));
  });

  it("RagAnswerResponseSchema dùng CitationSchema chung, không khai báo inline", () => {
    const answer = RagAnswerResponseSchema.parse({
      answer: "Nghỉ 12 ngày/năm.",
      citations: [citation],
    });
    assert.equal(answer.abstain, false);
    assert.equal(answer.citations[0].version, "1.0");
    assert.throws(() => RagAnswerResponseSchema.parse({ answer: "x", citations: [{ document: "d" }] }));
  });

  it("ConversationSchema: channel chỉ 'web', status đóng, trần cứng 50 message", () => {
    const parsed = ConversationSchema.parse(conversation);
    assert.equal(parsed.channel, "web");
    assert.equal(parsed.status, "active");
    assert.equal(parsed.messageCount, 1);

    assert.throws(() => ConversationSchema.parse({ ...conversation, channel: "zalo" }));
    assert.throws(() => ConversationSchema.parse({ ...conversation, status: "archived" }));

    const tooMany = {
      ...conversation,
      messages: Array.from({ length: 51 }, (_, i) => ({ ...message, id: `msg-${i}` })),
      messageCount: 51,
    };
    assert.throws(() => ConversationSchema.parse(tooMany), /too_big|Array must contain at most 50/);

    const exactly50 = {
      ...tooMany,
      messages: tooMany.messages.slice(0, 50),
      messageCount: 50,
    };
    assert.equal(ConversationSchema.parse(exactly50).messages.length, 50);
  });

  it("ConversationSchema lưu contextSummary khi đã nén cửa sổ prompt", () => {
    const parsed = ConversationSchema.parse({
      ...conversation,
      contextSummary: {
        text: "Người dùng hỏi về nghỉ phép và lương.",
        coversUpToMessageId: message.id,
        createdAt: "2026-10-20T12:05:00.000Z",
      },
    });
    assert.equal(parsed.contextSummary.coversUpToMessageId, message.id);
  });
});

describe("Contracts: policies — Policy & PolicyChunkMeta", () => {
  it("PolicyChunkMetaSchema bắt buộc document/version/source, có article/effectiveFrom", () => {
    const meta = PolicyChunkMetaSchema.parse({
      document: "Bộ luật Lao động 2019",
      version: "2019",
      article: "Điều 113",
      source: "https://vanban.chinhphu.vn/...",
      effectiveFrom: "2021-01-01",
    });
    assert.equal(meta.article, "Điều 113");

    assert.throws(() => PolicyChunkMetaSchema.parse({ version: "1", source: "s" }));
    assert.throws(() => PolicyChunkMetaSchema.parse({ document: "d", version: "", source: "s" }));
    assert.throws(() => PolicyChunkMetaSchema.parse({ document: "d", version: "1" }));
  });

  it("PolicySchema chứa title/version/source + chunks (embedding chưa bắt buộc trước Phase 4)", () => {
    const policy = PolicySchema.parse({
      id: "6600000000000000000000bb",
      title: "Quy chế nội bộ GUTA",
      version: "1.0",
      source: "authored:docs/policies/guta-noi-quy.md",
      category: "quy định công ty",
      effectiveFrom: "2026-10-01",
      chunks: [
        {
          document: "Quy chế nội bộ GUTA",
          version: "1.0",
          article: "Điều 5",
          source: "authored:docs/policies/guta-noi-quy.md",
          text: "Nhân viên được nghỉ phép 12 ngày/năm.",
          order: 0,
        },
      ],
    });

    assert.equal(policy.chunks.length, 1);
    assert.equal(policy.chunks[0].embedding, undefined);
    assert.throws(() => PolicySchema.parse({ title: "", version: "1", source: "s" }));
    assert.throws(() => PolicySchema.parse({ title: "t", version: "1" }));
    assert.throws(() =>
      PolicySchema.parse({
        title: "t",
        version: "1",
        source: "s",
        chunks: [{ document: "d", version: "1", source: "s", text: "", order: 0 }],
      })
    );
  });
});

describe("Contracts: WS event schemas — nguồn chuẩn docs/06 §4.2", () => {
  const citation = { document: "Quy chế nội bộ GUTA", version: "v1.0", article: "Điều 3", score: 0.91 };

  it("đúng 10 event đóng, registry client/server phủ đủ và không trùng", () => {
    const names = [
      "chat:send", "chat:accepted", "chat:chunk", "chat:confirm", "chat:done", "chat:error",
      "notification:new", "project:updated", "report:updated", "kpi:updated",
    ];
    for (const n of names) {
      assert.equal(WsEventNameSchema.parse(n), n);
    }
    assert.throws(() => WsEventNameSchema.parse("chat:typing"));

    assert.deepEqual(Object.keys(WS_CLIENT_EVENTS).sort(), ["chat:confirm", "chat:send"]);
    assert.deepEqual(Object.keys(WS_SERVER_EVENTS).sort(), [
      "chat:accepted", "chat:chunk", "chat:done", "chat:error",
      "kpi:updated", "notification:new", "project:updated", "report:updated",
    ]);
    const all = [...Object.keys(WS_CLIENT_EVENTS), ...Object.keys(WS_SERVER_EVENTS)];
    assert.equal(new Set(all).size, 10);
  });

  it("chat:send yêu cầu clientMessageId + (text hoặc confirm), conversationId tuỳ chọn", () => {
    const normal = ChatSendPayloadSchema.parse({ clientMessageId: "c-1", text: "Nghỉ phép bao nhiêu ngày?" });
    assert.equal(normal.text, "Nghỉ phép bao nhiêu ngày?");
    assert.equal(normal.conversationId, undefined);

    const withConversation = ChatSendPayloadSchema.parse({
      clientMessageId: "c-2", text: "Tiếp", conversationId: "conv-1",
    });
    assert.equal(withConversation.conversationId, "conv-1");

    const confirmOnly = ChatSendPayloadSchema.parse({
      clientMessageId: "c-3", confirm: { actionId: "act-1", approved: true },
    });
    assert.equal(confirmOnly.confirm.approved, true);

    assert.throws(() => ChatSendPayloadSchema.parse({ clientMessageId: "c-4" }));
    assert.throws(() => ChatSendPayloadSchema.parse({ clientMessageId: "c-5", text: "  " }));
    assert.throws(() => ChatSendPayloadSchema.parse({ text: "thiếu id" }));
    assert.throws(() =>
      ChatSendPayloadSchema.parse({ clientMessageId: "c-6", text: "x", confirm: { actionId: "a" } })
    );
  });

  it("ack của chat:send là union accepted/rejected", () => {
    const ok = ChatAckSchema.parse({
      accepted: true, clientMessageId: "c-1", conversationId: "conv-1", messageId: "m-1",
    });
    assert.equal(ok.accepted, true);

    const rejected = ChatAckSchema.parse({
      accepted: false,
      error: { code: "RBAC_DENIED", message: "không có quyền", retryable: false },
    });
    assert.equal(rejected.error.code, "RBAC_DENIED");

    assert.throws(() => ChatAckSchema.parse({ accepted: true }));
    assert.throws(() =>
      ChatAckSchema.parse({ accepted: false, error: { code: "X", message: "m" } })
    );
  });

  it("chat:accepted đủ 4 field bắt buộc", () => {
    const payload = ChatAcceptedPayloadSchema.parse({
      clientMessageId: "c-1", messageId: "m-1", conversationId: "conv-1",
      acceptedAt: "2026-10-20T12:00:00.000Z",
    });
    assert.equal(payload.messageId, "m-1");
    assert.throws(() => ChatAcceptedPayloadSchema.parse({ clientMessageId: "c-1", messageId: "m-1" }));
  });

  it("chat:chunk phân biệt text (delta) và data part (citation/action_proposal)", () => {
    const base = { clientMessageId: "c-1", messageId: "m-1" };

    const text = ChatChunkPayloadSchema.parse({ ...base, seq: 0, kind: "text", delta: "Theo " });
    assert.equal(text.kind, "text");
    assert.equal(text.delta, "Theo ");

    const cit = ChatChunkPayloadSchema.parse({ ...base, seq: 1, kind: "citation", data: citation });
    assert.equal(cit.kind, "citation");
    assert.equal(cit.data.article, "Điều 3");
    assert.equal("delta" in cit, false);

    const proposal = ChatChunkPayloadSchema.parse({
      ...base, seq: 2, kind: "action_proposal",
      data: { actionId: "act-1", type: "submit_report", args: { projectId: "p-1" }, preview: "Nộp báo cáo?" },
    });
    assert.equal(proposal.data.actionId, "act-1");

    // kind='text' bắt buộc delta, không được mang data
    assert.throws(() => ChatChunkPayloadSchema.parse({ ...base, seq: 0, kind: "text", data: citation }));
    assert.throws(() => ChatChunkPayloadSchema.parse({ ...base, seq: 0, kind: "text", delta: "" }));
    // kind='citation' bắt buộc data đúng CitationSchema
    assert.throws(() => ChatChunkPayloadSchema.parse({ ...base, seq: 1, kind: "citation", delta: "x" }));
    assert.throws(() =>
      ChatChunkPayloadSchema.parse({ ...base, seq: 1, kind: "citation", data: { document: "d" } })
    );
    // seq không âm, kind lạ bị chặn
    assert.throws(() => ChatChunkPayloadSchema.parse({ ...base, seq: -1, kind: "text", delta: "x" }));
    assert.throws(() => ChatChunkPayloadSchema.parse({ ...base, seq: 0, kind: "typing", delta: "x" }));
    assert.throws(() => ChatChunkPayloadSchema.parse({ seq: 0, kind: "text", delta: "x" }));
  });

  it("chat:confirm yêu cầu clientMessageId mới + actionId + approve", () => {
    const payload = ChatConfirmPayloadSchema.parse({
      clientMessageId: "c-9", actionId: "act-1", approve: false,
    });
    assert.equal(payload.approve, false);
    assert.throws(() => ChatConfirmPayloadSchema.parse({ actionId: "act-1", approve: true }));
    assert.throws(() =>
      ChatConfirmPayloadSchema.parse({ clientMessageId: "c-9", actionId: "act-1", approve: "yes" })
    );

    const ack = ChatConfirmAckSchema.parse({
      accepted: true, clientMessageId: "c-9", actionId: "act-1",
    });
    assert.equal(ack.actionId, "act-1");
    assert.throws(() => ChatConfirmAckSchema.parse({ accepted: true, clientMessageId: "c-9" }));
  });

  it("chat:done giữ enum finishReason 4 giá trị + citations dùng CitationSchema", () => {
    const done = ChatDonePayloadSchema.parse({
      clientMessageId: "c-1", messageId: "m-1", finishReason: "ANSWER",
      citations: [citation], score: 0.88, usage: { inputTokens: 120, outputTokens: 40 },
    });
    assert.equal(done.finishReason, "ANSWER");
    assert.equal(done.citations[0].score, 0.91);

    for (const reason of ["ANSWER", "TOOL_RESULT", "ABSTAIN", "ERROR"]) {
      assert.equal(
        ChatDonePayloadSchema.parse({ clientMessageId: "c", messageId: "m", finishReason: reason }).finishReason,
        reason
      );
    }
    assert.throws(() =>
      ChatDonePayloadSchema.parse({ clientMessageId: "c", messageId: "m", finishReason: "stop" })
    );
    assert.throws(() =>
      ChatDonePayloadSchema.parse({ clientMessageId: "c", messageId: "m", finishReason: "ANSWER", citations: [{ document: "d" }] })
    );
  });

  it("chat:error mang code trong catalog + retryable bắt buộc", () => {
    const err = ChatErrorPayloadSchema.parse({
      clientMessageId: "c-1", messageId: "m-1",
      code: "LLM_UNAVAILABLE", message: "hết provider", retryable: true,
    });
    assert.equal(err.code, "LLM_UNAVAILABLE");
    assert.equal(err.retryable, true);

    for (const code of ["CONVERSATION_FULL", "MAX_STEPS", "TOOL_TIMEOUT", "VALIDATION_FAILED"]) {
      assert.ok(ChatErrorPayloadSchema.parse({ code, message: "m", retryable: false }).code);
    }
    assert.throws(() => ChatErrorPayloadSchema.parse({ code: "LLM_UNAVAILABLE", message: "m" }));
  });

  it("4 event server→client cũ dùng lại enum đã có (status/dedupe)", () => {
    const notif = NotificationNewPayloadSchema.parse({
      notificationId: "n-1", type: "deadline_3d", title: "Sắp hết hạn",
      body: "Đề tài A còn 3 ngày", channel: "ws", createdAt: "2026-10-20T12:00:00.000Z",
    });
    assert.equal(notif.type, "deadline_3d");
    assert.throws(() =>
      NotificationNewPayloadSchema.parse({ notificationId: "n", type: "unknown_type", title: "t", body: "b", channel: "ws" })
    );

    const project = ProjectUpdatedPayloadSchema.parse({
      projectId: "p-1", status: "PENDING_REVIEW", version: 3,
      updatedAt: "2026-10-20T12:00:00.000Z", actorId: "u-1",
    });
    assert.equal(project.status, "PENDING_REVIEW");
    assert.throws(() => ProjectUpdatedPayloadSchema.parse({ projectId: "p", status: "OVERDUE", version: 1, updatedAt: "t" }));
    assert.throws(() => ProjectUpdatedPayloadSchema.parse({ projectId: "p", status: "ASSIGNED", version: 0, updatedAt: "t" }));

    const report = ReportUpdatedPayloadSchema.parse({
      reportId: "r-1", projectId: "p-1", status: "REJECTED",
      reviewReason: "Thiếu minh chứng", createdAt: "2026-10-20T12:00:00.000Z",
    });
    assert.equal(report.status, "REJECTED");
    assert.throws(() => ReportUpdatedPayloadSchema.parse({ reportId: "r", projectId: "p", status: "SUBMITTED" }));

    const kpi = KpiUpdatedPayloadSchema.parse({
      evaluationId: "e-1", employeeId: "emp-1", period: "2026-10",
      machineScore: 7.5, finalScore: 8, publishedAt: "2026-10-20T12:00:00.000Z",
    });
    assert.equal(kpi.finalScore, 8);
    assert.throws(() => KpiUpdatedPayloadSchema.parse({ evaluationId: "e", employeeId: "emp" }));
  });
});
