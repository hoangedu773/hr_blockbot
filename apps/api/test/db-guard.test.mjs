import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateIsolatedDbUri } from "./require-isolated-db.mjs";

describe("Safety Guard: Test Database URI Validator", () => {
  test("chấp nhận URI loopback hợp lệ với DB có prefix 'test'", () => {
    assert.equal(
      validateIsolatedDbUri("mongodb://localhost:27017/test-isolated"),
      "mongodb://localhost:27017/test-isolated"
    );
    assert.equal(
      validateIsolatedDbUri("mongodb://127.0.0.1:27017/test_db"),
      "mongodb://127.0.0.1:27017/test_db"
    );
  });

  test("từ chối URI kết nối tới remote cluster hoặc Atlas", () => {
    assert.throws(
      () =>
        validateIsolatedDbUri(
          "mongodb+srv://cluster0.example.mongodb.net/test-db"
        ),
      /SRV connection strings are forbidden|Atlas connection detected/
    );
    assert.throws(
      () => validateIsolatedDbUri("mongodb://192.168.1.100:27017/test-db"),
      /Non-loopback host/
    );
  });

  test("từ chối URI nếu tên database không có tiền tố 'test'", () => {
    assert.throws(
      () => validateIsolatedDbUri("mongodb://localhost:27017/production_db"),
      /must start with "test"/
    );
    assert.throws(
      () => validateIsolatedDbUri("mongodb://127.0.0.1:27017/hr_bot"),
      /must start with "test"/
    );
  });
});
