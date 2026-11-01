/**
 * Test runner wrapper: guarantees a throwaway MongoDB on the loopback so the
 * fail-closed guard in `require-isolated-db.mjs` is satisfied — without Docker.
 *
 * Each test file gets a fresh in-memory mongod and its own `test_hr_<file>` database.
 * Sharing one mongod was not safe here: after a file whose teardown is cut short, the
 * server stopped answering `hello` and the next file died with "Server selection timed
 * out after 30000 ms". Startup costs ~1-2s per file once the binary is cached.
 *
 * Each file is spawned separately so one wedged mongod cannot poison the next. The
 * child runs plain `node --test`: `--test-force-exit` used to be here to kill lingering
 * keep-alive sockets, but on Node 24 it aborts with a libuv assertion
 * (`!(handle->flags & UV_HANDLE_CLOSING)`) after the assertions already passed, turning
 * a green file into exit 1. Teardown now closes sockets instead.
 *
 * Always provision our own mongod, even if a developer's MongoDB is already on
 * port 27017. A test_ prefix alone does not authorize deleting their databases.
 *
 * Usage: node test/with-memory-mongo.mjs test/a.test.mjs test/b.test.mjs ...
 */

import { spawn } from "node:child_process";

const TEST_FILES = process.argv.slice(2);
if (TEST_FILES.length === 0) {
  console.error("with-memory-mongo.mjs: no test files given");
  process.exit(1);
}

// The npmmirror path this used to hardcode (`/-/binary/mongodb/`) now returns 404,
// which made `npm test` fail before any test ran. mongodb-memory-server's own default
// (fastdl.mongodb.org) works; a mirror can still be forced by exporting
// MONGOMS_DOWNLOAD_MIRROR before running the suite.

const memoryServer = await import("mongodb-memory-server");
console.log("[test-mongo] owned in-memory MongoDB per file; never reuse an external server");

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
  const server = await memoryServer.MongoMemoryServer.create();
  const baseUri = server.getUri("test_hr");

  console.log(`\n[test-mongo] running ${file}`);
  const env = {
    ...process.env,
    NODE_ENV: "test",
    TEST_MONGODB_URI: databaseFor(baseUri, file),
  };
  delete env.ATLAS_URI;
  // The guard copies TEST_MONGODB_URI into MONGODB_URI, but a shell-level
  // MONGODB_DB_NAME would still redirect mongoose to another database.
  delete env.MONGODB_DB_NAME;
  // Chain integration tests provision their own loopback EVM. Never inherit a
  // developer's real RPC/registry settings into a hermetic API test process.
  for (const key of ["ASSIGNMENT_CHAIN_RPC_URL", "ASSIGNMENT_CHAIN_ID", "ASSIGNMENT_REGISTRY_ADDRESS", "ASSIGNMENT_CHAIN_CONFIRMATIONS"]) delete env[key];

  // No `--test-force-exit`: on Node 24 it aborts the process with
  // "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" after the tests have
  // already passed, so a green suite exits 1. Every file now closes its sockets
  // (see `httpFetch` in auth.test.mjs and `server.closeAllConnections` in teardown),
  // so the process drains on its own.
  //
  // Must be async `spawn`, not `spawnSync`: spawnSync blocks this process's event
  // loop, so the in-memory mongod's stdout pipe is never drained. Once that pipe
  // fills, mongod blocks on write and every query in the child hangs — the suite
  // passed assertions and then never exited. Only files that never touch the DB
  // (db-guard) were immune.
  const status = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", file], { env, stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  if (status !== 0) failed = true;

  if (server) {
    await server.stop().catch(() => {});
  }
}

process.exit(failed ? 1 : 0);
