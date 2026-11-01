import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { endpoint } from "../dist/lib/endpoint.js";
import { WorkflowError } from "../dist/services/project-workflow.service.js";

// Isolated unit test: no database, no HTTP server. It pins the envelope contract
// that every route relying on `lib/endpoint.ts` inherits.

function harness() {
  const res = {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  let forwarded;
  const next = (error) => {
    forwarded = error;
  };
  return { res, next: (error) => next(error), forwarded: () => forwarded };
}

test("success path writes nothing on its own", async () => {
  const { res, next, forwarded } = harness();
  const handler = endpoint(async (_req, response) => {
    response.status(200).json({ ok: true });
  });

  await handler({}, res, next);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(forwarded(), undefined);
});

test("Zod failure becomes 400 VALIDATION_FAILED with the shared message", async () => {
  const { res, next, forwarded } = harness();
  const schema = z.object({ page: z.number() });
  const handler = endpoint(async () => {
    schema.parse({ page: "not-a-number" });
  });

  await handler({}, res, next);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    error: { code: "VALIDATION_FAILED", message: "Tham số không hợp lệ; kiểm tra bộ lọc và phân trang." },
  });
  assert.equal(forwarded(), undefined);
});

test("WorkflowError keeps its own status, code and message", async () => {
  const { res, next, forwarded } = harness();
  const handler = endpoint(async () => {
    throw new WorkflowError(409, "PROJECT_VERSION_CONFLICT", "Phiên bản đã thay đổi");
  });

  await handler({}, res, next);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: { code: "PROJECT_VERSION_CONFLICT", message: "Phiên bản đã thay đổi" },
  });
  assert.equal(forwarded(), undefined);
});

test("unknown and infrastructure errors are forwarded, never reshaped", async () => {
  const { res, next, forwarded } = harness();
  const infrastructure = Object.assign(new Error("connection reset"), { name: "MongoNetworkError" });
  const handler = endpoint(async () => {
    throw infrastructure;
  });

  await handler({}, res, next);

  assert.equal(res.statusCode, undefined);
  assert.equal(res.body, undefined);
  assert.equal(forwarded(), infrastructure);
});

test("plain object carrying status+code is treated as a coded error", async () => {
  const { res, next } = harness();
  const handler = endpoint(async () => {
    throw { status: 403, code: "RBAC_DENIED", message: "Capability missing" };
  });

  await handler({}, res, next);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: { code: "RBAC_DENIED", message: "Capability missing" } });
});
