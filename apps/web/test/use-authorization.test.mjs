import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const esbuild = require('esbuild');

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../src/context/useAuthorization.ts');
const packageDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const reactUmd = path.join(packageDir('react'), 'umd/react.development.js');
const reactDomUmd = path.join(packageDir('react-dom'), 'umd/react-dom.development.js');

const summary = (profile, caps) => ({
  configured: true,
  profile,
  securityVersion: 0,
  enforcement: 'MIGRATING',
  capabilities: caps,
  pendingCapabilities: [],
  grants: [],
  stores: [],
  delegations: [],
});
const capsA = ['authorization.inspect_self', 'chatbot.data_read'];
const capsB = ['accounts.manage', 'grants.manage'];

// Bundle the real hook source. Only the React context and the network layer are
// stubbed so tests drive fetchMe failure modes directly.
async function buildHarness() {
  const result = await esbuild.build({
    plugins: [
      {
        name: 'entry',
        setup(build) {
          const fs = require('fs');
          build.onResolve({ filter: /^__entry__$/ }, () => ({ path: 'entry.ts', namespace: 'entry' }));
          build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({
            contents: fs.readFileSync(src, 'utf8'),
            loader: 'ts',
          }));
          build.onResolve({ filter: /^react$/ }, () => ({ path: 'react-stub', namespace: 'stub' }));
          build.onResolve({ filter: /\.\/AuthContext$/ }, () => ({ path: 'AuthContext', namespace: 'stub' }));
        },
      },
      {
        name: 'stubs',
        setup(build) {
          build.onResolve({ filter: /(context[\\/]|\.\/)AuthContext$|services[\\/]api$/ }, (args) => ({
            path: args.path,
            namespace: 'stub',
          }));
          build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            loader: 'ts',
            contents: String(args.path).includes('react-stub')
              ? `const R = globalThis.React; export const useState = R.useState; export const useEffect = R.useEffect;`
              : String(args.path).includes('AuthContext')
              ? `export function useAuth(){ return globalThis.__authValue; }`
              : `export function fetchMe(){ return globalThis.__fetchMe(); }`,
          }));
        },
      },
    ],
    stdin: { contents: 'export { useAuthorization } from "__entry__";', loader: 'ts' },
    bundle: true,
    format: 'iife',
    globalName: '__harness',
    write: false,
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  return result.outputFiles[0].text;
}

describe('useAuthorization (hook source, real browser)', () => {
  let server;
  let origin;
  let browser;
  let context;
  let page;
  let errors;

  const state = {
    user: null,
    accessToken: null,
    queue: [],
    calls: 0,
  };

  before(async () => {
    const harness = await buildHarness();
    const html = `<!doctype html><html><body><div id="root"></div>
      <script src="/react.js"></script>
      <script src="/react-dom.js"></script>
      <script>${harness}</script>
      <script>
        const { useState } = React;
        globalThis.__sig = 0;
        function Probe() {
          const out = globalThis.__harness.useAuthorization();
          globalThis.__view = {
            profile: out.summary ? out.summary.profile : null,
            capCount: out.summary ? out.summary.capabilities.length : -1,
            canInspect: out.can('authorization.inspect_self'),
            canManage: out.can('accounts.manage'),
            storeCount: out.stores.length,
          };
          globalThis.__sig++;
          return null;
        }
        function Harness() {
          const [auth, setAuth] = useState(globalThis.__initialAuth);
          globalThis.__authValue = auth;
          globalThis.__setAuth = (user, accessToken) => setAuth({ user, accessToken });
          return React.createElement(Probe);
        }
        globalThis.__fetchMe = () => {
          const item = globalThis.__queue.shift();
          globalThis.__calls++;
          if (item?.hold) return new Promise((resolve, reject) => { globalThis.__release = () => globalThis.__fulfill(item).then(resolve, reject); });
          const promise = item ? globalThis.__fulfill(item) : Promise.reject(new Error('unexpected fetchMe call'));
          return item && item.delayMs ? new Promise((done) => setTimeout(() => done(promise), item.delayMs)) : promise;
        };
        globalThis.__mount = () => {
          ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
        };
      </script></body></html>`;
    server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else if (pathname === '/react.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        fs_sync(reactUmd, res);
      } else if (pathname === '/react-dom.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        fs_sync(reactDomUmd, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    server?.closeAllConnections?.();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  function fs_sync(file, res) {
    const fs = require('fs');
    fs.createReadStream(file).pipe(res);
  }

  async function mount({ user = { id: 'u', role: 'Employee' }, accessToken = 't1', queue = [] } = {}) {
    if (context) await context.close().catch(() => {});
    context = await browser.newContext();
    page = await context.newPage();
    errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    state.queue = queue;
    await page.addInitScript(
      ([initUser, initToken, initQueue]) => {
        globalThis.__initialAuth = { user: initUser, accessToken: initToken };
        globalThis.__queue = Array.isArray(initQueue) ? [...initQueue] : [];
        globalThis.__calls = 0;
        globalThis.__fulfill = (item) =>
          item.abort
            ? Promise.reject(new Error('network down'))
            : item.status >= 400
            ? Promise.reject(Object.assign(new Error('HTTP ' + item.status), { status: item.status, name: 'ApiError' }))
            : Promise.resolve({ userId: 'u', authorization: item.json });
      },
      [user, accessToken, queue]
    );
    await page.goto(origin, { waitUntil: 'load' });
    await page.evaluate(() => globalThis.__mount());
    return page;
  }

  const view = () =>
    page.evaluate(() => ({ view: globalThis.__view, sig: globalThis.__sig, calls: globalThis.__calls }));
  async function waitFor(predicate, { timeout = 5000, interval = 25 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const data = await page.evaluate(() => ({
        ...globalThis.__view,
        view: globalThis.__view,
        calls: globalThis.__calls,
        sig: globalThis.__sig,
      }));
      if (predicate(data)) return data;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    return null;
  }

  it('mạng lỗi (abort) → summary null, mọi can() false', async () => {
    await mount({ queue: [{ abort: true, delayMs: 0 }] });
    await waitFor((v) => v && v.capCount === -1 && v.profile === null && v.canInspect === false);
    const { view: v, calls } = await view();
    assert.equal(v.profile, null);
    assert.equal(v.capCount, -1);
    assert.equal(v.canInspect, false);
    assert.equal(v.canManage, false);
    assert.equal(v.storeCount, 0);
    assert.equal(calls, 1);
    assert.deepEqual(errors, []);
  });

  it('5xx → summary null (fail closed)', async () => {
    await mount({ queue: [{ status: 503, delayMs: 0 }] });
    await waitFor((v) => v && v.capCount === -1);
    const { view: v } = await view();
    assert.equal(v.profile, null);
    assert.equal(v.canInspect, false);
  });

  it('401 thật → summary null, không giữ quyền cũ', async () => {
    await mount({
      user: { id: 'u', role: 'Employee', authorization: summary('staff', capsA) },
      queue: [{ status: 401, delayMs: 0 }],
    });
    await waitFor((v) => v && v.capCount === -1);
    const { view: v } = await view();
    assert.equal(v.profile, null);
    assert.equal(v.canInspect, false);
  });

  it('focus refetch out-of-order: phản hồi cũ trễ phải không ghi đè phản hồi mới', async () => {
    await mount({
      queue: [
        { status: 200, hold: true, json: summary('om', capsB) },
        { status: 200, delayMs: 0, json: summary('staff', capsA) },
      ],
    });
    assert.ok(await waitFor((v) => v && v.calls === 1), 'initial request must start before focus');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });
    assert.ok(await waitFor((v) => v && v.profile === 'staff'), 'newer response must arrive first');
    await page.evaluate(async () => { globalThis.__release(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const { view: v } = await view();
    assert.equal(v.profile, 'staff', 'stale slow response must not overwrite newer summary');
    assert.equal(v.capCount, capsA.length);
    assert.equal(v.canManage, false);
  });

  it('đổi người dùng: phản hồi của user cũ đang bay không được áp lên user mới', async () => {
    await mount({
      user: { id: 'alice', role: 'Employee' },
      accessToken: 't-alice',
      queue: [{ status: 200, hold: true, json: summary('om', capsB) }],
    });
    await waitFor((v) => v && v.calls === 1);
    await page.evaluate(
      ([u2]) => {
        globalThis.__queue.unshift({
          status: 200,
          delayMs: 0,
          json: {
            configured: true,
            profile: 'staff',
            securityVersion: 0,
            enforcement: 'MIGRATING',
            capabilities: ['authorization.inspect_self'],
            pendingCapabilities: [],
            grants: [],
            stores: [],
            delegations: [],
          },
        });
        globalThis.__setAuth({ id: u2, role: 'Employee' }, 't-bob');
      },
      ['bob']
    );
    await waitFor((v) => v && v.profile === 'staff');
    await page.evaluate(async () => { globalThis.__release(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const { view: v, calls } = await view();
    assert.equal(v.profile, 'staff', 'alice stale response must be discarded');
    assert.equal(v.canManage, false, 'old privileges must not leak across user switch');
    assert.equal(v.capCount, 1);
    assert.equal(calls, 2, 'bob triggers exactly one fetchMe');
    assert.deepEqual(errors, []);
  });

  it('mất mạng giữa chừng rồi khôi phục: focus kế tiếp lấy lại summary', async () => {
    await mount({ queue: [{ abort: true, delayMs: 0 }] });
    await waitFor((v) => v && v.capCount === -1);
    await page.evaluate((authorization) => {
      globalThis.__queue.push({ status: 200, delayMs: 0, json: authorization });
      window.dispatchEvent(new Event('focus'));
    }, summary('staff', capsA));
    await waitFor((v) => v && v.profile === 'staff');
    const { view: v } = await view();
    assert.equal(v.profile, 'staff');
    assert.equal(v.canInspect, true);
  });
});
