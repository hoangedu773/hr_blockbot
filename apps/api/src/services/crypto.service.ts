import crypto from "crypto";

/**
 * AES-256-GCM encryption for LLM provider API keys (ADR-017).
 *
 * - Key source: SETTINGS_ENCRYPTION_KEY, 32 bytes base64. Fail-closed when missing/invalid.
 * - Blob format: "v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 * - The plaintext key is NEVER logged, returned or embedded in error messages.
 */

const KEY_ENV = "SETTINGS_ENCRYPTION_KEY";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const BLOB_VERSION = "v1";

export class SettingsEncryptionError extends Error {
  readonly code = "INTERNAL_ERROR";
  constructor(message = "Settings encryption is not available") {
    super(message);
    this.name = "SettingsEncryptionError";
  }
}

function getEncryptionKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw || raw.trim() === "") {
    throw new SettingsEncryptionError(`${KEY_ENV} is not configured`);
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new SettingsEncryptionError(`${KEY_ENV} is not valid base64`);
  }

  if (key.length !== 32) {
    throw new SettingsEncryptionError(`${KEY_ENV} must decode to exactly 32 bytes`);
  }
  return key;
}

export function encryptApiKey(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new SettingsEncryptionError("Cannot encrypt an empty API key");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    BLOB_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptApiKey(keyCipher: string): string {
  const key = getEncryptionKey();
  const parts = typeof keyCipher === "string" ? keyCipher.split(":") : [];

  if (parts.length !== 4 || parts[0] !== BLOB_VERSION) {
    throw new SettingsEncryptionError("Stored API key blob is malformed");
  }

  try {
    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("invalid blob dimensions");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Generic message: never reveal key material or blob fragments.
    throw new SettingsEncryptionError("Stored API key could not be decrypted");
  }
}

/** Admin-facing hint: last 4 characters only. */
export function buildKeyHint(apiKey: string): string {
  const trimmed = (apiKey || "").trim();
  return trimmed.length <= 4 ? "****" : trimmed.slice(-4);
}

/** Remove a known secret from an arbitrary error/log string before persisting or logging. */
export function redactSecret(text: string, secret?: string): string {
  const base = typeof text === "string" ? text : String(text ?? "");
  if (!secret) return base;
  return base.split(secret).join("***");
}
