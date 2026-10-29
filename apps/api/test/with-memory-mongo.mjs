/**
 * Test runner wrapper: guarantees a throwaway MongoDB on the loopback so the
 * fail-closed guard in `require-isolated-db.mjs` is satisfied — without Docker.
 *
 * - if something already listens on 127.0.0.1:27017, use it;
 * - otherwise start an in-memory MongoDB (mongodb-memory-server), run the tests,
 *   then stop it. The binary is downloaded once and cached in node_modules.
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

// Mirror makes the one-time mongod download fast in this region; overridable.
if (!process.env.MONGOMS_DOWNLOAD_MIRROR) {
  process.env.MONGOMS_DOWNLOAD_MIRROR = "https://registry.npmmirror.com/-/binary/mongodb";
}

let uri = null;
let server = null;
if (await portOpen(27017)) {
  console.log("[test-mongo] reuse MongoDB already running on 127.0.0.1:27017");
  uri = "mongodb://127.0.0.1:27017/test_hr";
} else {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  console.log("[test-mongo] starting in-memory MongoDB (first run downloads a small binary)...");
  server = await MongoMemoryServer.create();
  uri = server.getUri("test_hr");
  console.log(`[test-mongo] ready: ${uri}`);
}

const env = { ...process.env, NODE_ENV: "test", TEST_MONGODB_URI: uri };
delete env.ATLAS_URI;

const child = spawnSync(process.execPath, ["--test", ...TEST_FILES], {
  env,
  stdio: "inherit",
});

if (server) {
  await server.stop();
}

process.exit(child.status ?? 1);
