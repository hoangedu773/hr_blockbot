/**
 * Một điểm redact duy nhất cho mọi log.
 *
 * Bản cũ có 5 bản copy với 2 biến thể regex khác nhau. Biến thể `/\/\/[^@\s/]+@/`
 * không khớp password chứa `/`, nên `mongodb://admin:p/ssw0rd@host` đi thẳng vào log
 * kèm credential. Không dựa vào việc driver đã redact: message của driver có thể chứa
 * host/user nguyên văn tuỳ phiên bản.
 */
const MONGO_URI_CREDENTIALS = /mongodb(?:\+srv)?:\/\/[^@\s]+@/gi;
const GENERIC_USERINFO = /\b[\w.%-]+:[^\s@/]+@/g;

export function redactSecrets(input: string): string {
  return input
    .replace(MONGO_URI_CREDENTIALS, "mongodb://***:***@")
    .replace(GENERIC_USERINFO, "***:***@");
}
