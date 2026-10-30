import mongoose from "mongoose";
import { redactSecrets } from "./lib/redact.js";

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI || process.env.ATLAS_URI;
  if (!uri || uri.trim() === "") {
    throw new Error(
      "MongoDB URI is not configured. Please set MONGODB_URI or ATLAS_URI in environment variables."
    );
  }
  return uri.trim();
}

/**
 * The database the app actually talks to.
 *
 * Production keeps the documented precedence (`MONGODB_DB_NAME` overrides the URI path,
 * see `docs/14-devops-deployment.md`) so one cluster can host dev/demo/test. In test mode
 * the URI path wins: `require-isolated-db.mjs` validates a `test_*` URI and copies it into
 * `MONGODB_URI`, but a `MONGODB_DB_NAME=hr_bot` inherited from the shell used to send the
 * suite to `hr_bot` — the exact database the guard exists to protect.
 */
export function resolveDbName(uri: string): string {
  const fromUri = uriPathDbName(uri);
  if (process.env.NODE_ENV === "test") {
    return fromUri || process.env.MONGODB_DB_NAME || "hr_bot";
  }
  return process.env.MONGODB_DB_NAME || fromUri || "hr_bot";
}

function uriPathDbName(uri: string): string {
  const afterScheme = uri.slice(uri.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  if (slash === -1) return "";
  return afterScheme.slice(slash + 1).split("?")[0].trim();
}

export async function connectDB(): Promise<typeof mongoose> {
  const uri = getMongoUri();
  const dbName = resolveDbName(uri);
  try {
    // 5s thay vì 30s mặc định: khi cluster mất kết nối, mỗi request treo 30s là đủ
    // cạn connection pool và biến một sự cố Mongo ngắn thành outage toàn API.
    const conn = await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5_000 });
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    const msg = err instanceof Error ? redactSecrets(err.message) : "Database connection failed";
    console.error("[MongoDB] Connection failed:", msg);
    throw new Error("Failed to connect to MongoDB");
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
