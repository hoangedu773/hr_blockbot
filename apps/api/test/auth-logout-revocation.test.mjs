import "./require-isolated-db.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { createServer } from "node:http";

/** Close the socket per request so the test process can exit (same pattern as auth.test.mjs). */
function httpFetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      { hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`,
        method: init.method || "GET", headers: { ...(init.headers || {}), Connection: "close" }, agent: false },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode,
            headers: { get: (name) => { const value = res.headers[name.toLowerCase()]; return Array.isArray(value) ? value.join(", ") : value ?? null; } },
            json: async () => JSON.parse(body), text: async () => body });
        });
      }
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

import { app } from "../dist/app.js";
import { connectDB, disconnectDB } from "../dist/db.js";
import { UserModel } from "../dist/models/User.js";
import { RefreshSessionModel } from "../dist/models/RefreshSession.js";
import { hashPassword } from "../dist/services/auth.service.js";

const USERNAME = "test-logout-user";
const PASSWORD = "LogoutPass@123";
let server;
let baseUrl;

before(async () => {
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  await connectDB();
  const leftovers = await UserModel.find({ username: USERNAME }, { _id: 1 }).lean();
  if (leftovers.length) await RefreshSessionModel.deleteMany({ userId: { $in: leftovers.map((u) => u._id) } });
  await UserModel.deleteMany({ username: USERNAME });
  await UserModel.create({
    username: USERNAME,
    passwordHash: await hashPassword(PASSWORD),
    role: "Employee",
    status: "active",
    securityVersion: 1,
    mustChangePassword: false,
  });
});

after(async () => {
  if (server) { server.closeAllConnections?.(); server.close(); }
  await Promise.race([
    (async () => {
      const users = await UserModel.find({ username: USERNAME }, { _id: 1 }).lean();
      if (users.length) await RefreshSessionModel.deleteMany({ userId: { $in: users.map((u) => u._id) } });
      await UserModel.deleteMany({ username: USERNAME });
      await disconnectDB();
    })(),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
});

async function login() {
  const res = await httpFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  assert.ok(body.accessToken);
  assert.ok(cookie.startsWith("refreshToken="));
  return { access: body.accessToken, cookie };
}
const me = (access) => httpFetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${access}` } });
const logout = (cookie) => httpFetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
const refresh = (cookie) => httpFetch(`${baseUrl}/api/auth/refresh`, { method: "POST", headers: { Cookie: cookie } });

test("logout revokes the access token issued for that session immediately", async () => {
  const session = await login();
  assert.equal((await me(session.access)).status, 200);
  assert.equal((await logout(session.cookie)).status, 204);
  assert.equal((await me(session.access)).status, 401, "access token must be rejected after logout");
  assert.equal((await refresh(session.cookie)).status, 401, "revoked refresh family must be rejected");
});

test("logout revokes only the current session family", async () => {
  const a = await login();
  const b = await login();
  assert.equal((await logout(a.cookie)).status, 204);
  assert.equal((await me(a.access)).status, 401);
  assert.equal((await me(b.access)).status, 200, "another login session must stay valid");
});

test("refresh rotation keeps the access token bound to the same family", async () => {
  const session = await login();
  const rotated = await refresh(session.cookie);
  assert.equal(rotated.status, 200);
  const newAccess = (await rotated.json()).accessToken;
  const newCookie = (rotated.headers.get("set-cookie") || "").split(";")[0];
  assert.equal((await me(session.access)).status, 200);
  assert.equal((await me(newAccess)).status, 200);
  assert.equal((await logout(newCookie)).status, 204);
  assert.equal((await me(newAccess)).status, 401, "family logout must revoke the rotated access token too");
});
