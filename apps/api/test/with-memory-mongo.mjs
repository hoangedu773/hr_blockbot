/**
 * Test runner wrapper: guarantees a throwaway MongoDB on the loopback so the
 * fail-closed guard in `require-isolated-db.mjs` is satisfied — without Docker.
 *
 * Each test file gets a fresh in-memory mongod and its own `test_hr_<file>` database.
 * Sharing one mongod was not safe here: after a file whose teardown is cut short, the
 * server stopped answering `hello` and the next file died with "Server selection timed
 * out after 30000 ms". Startup costs ~1-2s per file once the binary is cached.
 *
 * `--test-force-exit` is required because a lingering keep-alive socket otherwise keeps
 * a test process alive forever; it only takes effect in a process that is itself the
 * test runner, which is why each file is spawned separately.
 *
 * If something already listens on 127.0.0.1:27017 that server is reused (a file that
 * wedges it will still break the next one — the operator's server, the operator's call).
 *
 * Usage: node test/with-memory-mongo.mjs test/a.test.mjs test/b.test.mjs ...
 */

import net from "node:net";
import { spawnSync } from "node:child_process";

const TEST_FILES = process.argv.slice(2);
if (TEST_FILES.length === 0) {
  console.error("with-memory-mongo.mjs: no test files given");
  process.exit(1);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// The npmmirror path this used to hardcode (`/-/binary/mongodb/`) now returns 404,
// which made `npm test` fail before any test ran. mongodb-memory-server's own default
// (fastdl.mongodb.org) works; a mirror can still be forced by exporting
// MONGOMS_DOWNLOAD_MIRROR before running the suite.

const reuseExternal = await portOpen(27017);
const memoryServer = reuseExternal ? null : await import("mongodb-memory-server");
console.log(
  reuseExternal
    ? "[test-mongo] reuse MongoDB already running on 127.0.0.1:27017"
    : "[test-mongo] in-memory MongoDB per file (first run downloads a small binary)"
);

function databaseFor(baseUri, file) {
  const slug = file
    .replace(/^.*[\\/]/, "")
    .replace(/\.test\.mjs$/, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase()
    .slice(0, 40);
  const target = new URL(baseUri);
  target.pathname = `/test_hr_${slug}`;
  return target.toString();
}

let failed = false;
for (const file of TEST_FILES) {
  let server = null;
  let baseUri = "mongodb://127.0.0.1:27017/test_hr";
  if (memoryServer) {
    server = await memoryServer.MongoMemoryServer.create();
    baseUri = server.getUri("test_hr");
  }

  console.log(`\n[test-mongo] running ${file}`);
  const env = {
    ...process.env,
    NODE_ENV: "test",
    TEST_MONGODB_URI: databaseFor(baseUri, file),
  };
  delete env.ATLAS_URI;

  const child = spawnSync(process.execPath, ["--test", "--test-force-exit", file], {
    env,
    stdio: "inherit",
  });
  if ((child.status ?? 1) !== 0) failed = true;

  if (server) {
    await server.stop().catch(() => {});
  }
}

process.exit(failed ? 1 : 0);
