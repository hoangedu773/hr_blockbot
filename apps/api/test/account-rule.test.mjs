import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  PASSWORD_ALPHABET,
  PASSWORD_PREFIX,
  derivePassword,
  describeRule,
  normalizeUsername,
} from "../scripts/lib/account-rule.mjs";

const SECRET = "test-only-secret-for-the-account-rule-0123456789";
const OTHER_SECRET = "another-secret-with-at-least-32-characters-abcdef";

describe("Quy luật cấp tài khoản: username = mã nhân viên, password = Guta@ + HMAC", () => {
  test("username chuẩn hoá về chữ thường, bỏ khoảng trắng", () => {
    assert.equal(normalizeUsername("  GT-CH18030009 "), "gt-ch18030009");
    assert.equal(normalizeUsername("gt-vp1610002"), "gt-vp1610002");
  });

  test("mật khẩu đúng định dạng Guta@ + 8 ký tự an toàn, không có I/O/0/1", () => {
    const password = derivePassword("gt-ch18030009", SECRET);
    assert.match(password, /^Guta@[A-HJ-NP-Z2-9]{8}$/);
    assert.equal(password.length, PASSWORD_PREFIX.length + 8);

    for (const char of password.slice(PASSWORD_PREFIX.length)) {
      assert.ok(PASSWORD_ALPHABET.includes(char), `ký tự lạ trong mật khẩu: ${char}`);
    }
  });

  test("tất định: cùng secret + username luôn ra cùng mật khẩu", () => {
    assert.equal(
      derivePassword("gt-ch18030009", SECRET),
      derivePassword("gt-ch18030009", SECRET)
    );
    // Không phụ thuộc hoa/thường của đầu vào.
    assert.equal(
      derivePassword("GT-CH18030009", SECRET),
      derivePassword("gt-ch18030009", SECRET)
    );
  });

  test("đổi secret là đổi toàn bộ mật khẩu", () => {
    assert.notEqual(
      derivePassword("gt-ch18030009", SECRET),
      derivePassword("gt-ch18030009", OTHER_SECRET)
    );
  });

  test("mỗi nhân viên một mật khẩu khác nhau (không trùng trên 10.000 mã)", () => {
    const seen = new Set();
    for (let index = 0; index < 10_000; index += 1) {
      const username = `gt-ch${String(index).padStart(8, "0")}`;
      const password = derivePassword(username, SECRET);
      assert.equal(seen.has(password), false, `trùng mật khẩu tại ${username}`);
      seen.add(password);
    }
  });

  test("mật khẩu không chứa mã nhân viên — không đoán được từ mã", () => {
    const password = derivePassword("gt-ch18030009", SECRET);
    assert.equal(password.toLowerCase().includes("18030009"), false);
    assert.equal(password.toLowerCase().includes("gt-ch"), false);
  });

  test("fail-closed khi thiếu hoặc secret quá ngắn", () => {
    assert.throws(() => derivePassword("gt-ch18030009", ""), /ACCOUNT_PASSWORD_SECRET/);
    assert.throws(() => derivePassword("gt-ch18030009", "short"), /ACCOUNT_PASSWORD_SECRET/);
    assert.throws(() => derivePassword("gt-ch18030009", undefined), /ACCOUNT_PASSWORD_SECRET/);
  });

  test("mô tả quy luật không chứa secret", () => {
    const text = describeRule();
    assert.match(text, /Guta@/);
    assert.equal(text.includes(SECRET), false);
  });
});
