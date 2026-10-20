const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Validates that a MongoDB URI strictly targets an isolated loopback database.
 * Rejects MongoDB Atlas, SRV connections, remote hosts, and non-test databases.
 */
export function validateIsolatedDbUri(uri) {
  if (!uri || typeof uri !== "string") {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: MongoDB URI must be a non-empty string"
    );
  }

  const trimmed = uri.trim();

  if (trimmed.startsWith("mongodb+srv://")) {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: SRV connection strings are forbidden"
    );
  }

  if (!trimmed.startsWith("mongodb://")) {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: URI must use mongodb:// scheme"
    );
  }

  if (/mongodb\.net|atlas/i.test(trimmed)) {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: Atlas connection detected"
    );
  }

  const afterScheme = trimmed.slice("mongodb://".length);
  const slashIdx = afterScheme.indexOf("/");
  const questionIdx = afterScheme.indexOf("?");

  let hostPart;
  let pathPart = "";
  if (slashIdx !== -1) {
    hostPart = afterScheme.slice(0, slashIdx);
    pathPart = afterScheme.slice(slashIdx + 1);
  } else if (questionIdx !== -1) {
    hostPart = afterScheme.slice(0, questionIdx);
    pathPart = "";
  } else {
    hostPart = afterScheme;
    pathPart = "";
  }

  if (hostPart.includes("@")) {
    hostPart = hostPart.slice(hostPart.lastIndexOf("@") + 1);
  }

  const hosts = hostPart.split(",").map((h) => h.trim());
  if (hosts.length === 0 || hosts.some((h) => !h)) {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: No host specified in MongoDB URI"
    );
  }

  for (const hostEntry of hosts) {
    let hostname;
    if (hostEntry.startsWith("[")) {
      const closingBracket = hostEntry.indexOf("]");
      if (closingBracket === -1) {
        throw new Error(
          `FATAL: Shared Atlas DB detected in test mode: Malformed IPv6 host in URI: ${hostEntry}`
        );
      }
      hostname = hostEntry.slice(0, closingBracket + 1);
    } else {
      hostname = hostEntry.split(":")[0];
    }

    if (!LOOPBACK_HOSTS.has(hostname.toLowerCase())) {
      throw new Error(
        `FATAL: Shared Atlas DB detected in test mode: Non-loopback host "${hostname}" is forbidden in test environment`
      );
    }
  }

  const dbName = pathPart.split("?")[0].trim();
  if (!dbName) {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: Database name must be explicitly specified"
    );
  }

  if (!dbName.toLowerCase().startsWith("test")) {
    throw new Error(
      `FATAL: Shared Atlas DB detected in test mode: Test database name must start with "test", received "${dbName}"`
    );
  }

  return trimmed;
}

/**
 * Fail-closed assertion ensuring tests only run against an isolated loopback test database.
 */
export function assertIsolatedDb() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `FATAL: Shared Atlas DB detected in test mode: NODE_ENV must be "test" (received "${process.env.NODE_ENV ?? ""}")`
    );
  }

  if (process.env.ATLAS_URI) {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: ATLAS_URI is forbidden in test environment"
    );
  }

  const rawUri = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI;
  if (!rawUri || !rawUri.trim()) {
    throw new Error(
      "FATAL: Shared Atlas DB detected in test mode: No test MongoDB URI provided. Set TEST_MONGODB_URI or MONGODB_URI to an isolated loopback database"
    );
  }

  const validatedUri = validateIsolatedDbUri(rawUri);

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = validatedUri;
  delete process.env.ATLAS_URI;
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || "hr-blockbot-test-jwt-secret-minimum-32-chars";

  return validatedUri;
}

// Execute immediately upon module import (fail-closed before subsequent imports)
assertIsolatedDb();
