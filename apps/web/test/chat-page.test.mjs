import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  chromium,
  reactDomUmdPath,
  reactUmdPath,
} from './helpers/browser-deps.mjs';

// Isolated component harness: real React + Chromium, HTTP boundary intercepted.
// It replaces the retired ChatDrawer harness and covers the surface users actually
// see (ChatPageView): citations, attachments, confirm-before-write honesty,
// contract-violation handling and the service-unavailable banner.

let builtCss = '';
try {
  const distAssetsDir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
  if (fs.existsSync(distAssetsDir)) {
    builtCss = fs
      .readdirSync(distAssetsDir)
      .filter((name) => name.endsWith('.css'))
      .map((name) => fs.readFileSync(path.join(distAssetsDir, name), 'utf8'))
      .join('\n');
  }
} catch {
  // dist assets optional in test harness
}

test('ChatPageView renders citations/attachments, confirms drafts honestly and reports contract violations', async () => {
  const { build } = createRequire(import.meta.url)('esbuild');
  const contractsEntry = fs.existsSync(fileURLToPath(new URL('../../../packages/contracts/dist/index.js', import.meta.url)))
    ? fileURLToPath(new URL('../../../packages/contracts/dist/index.js', import.meta.url))
    : fileURLToPath(new URL('../../../packages/contracts/src/index.ts', import.meta.url));
  const contracts = await build({
    entryPoints: [contractsEntry],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'ChatContracts',
    write: false,
  });

  const chatPageBundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/components/chat/ChatPageView.tsx', import.meta.url))],
    bundle: true,
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    platform: 'browser',
    format: 'iife',
    globalName: 'ChatPageModule',
    write: false,
    plugins: [
      {
        name: 'harness-stubs',
        setup(buildInstance) {
          buildInstance.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /^react\/jsx-(dev-)?runtime$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
          buildInstance.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /^@hr-blockbot\/contracts$/ }, () => ({ path: 'contracts', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /AuthContext/ }, () => ({ path: 'auth-context', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /BrandMark/ }, () => ({ path: 'brand-mark', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /ThemeToggle/ }, () => ({ path: 'theme-toggle', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /(?:services\/auth|[/\\]auth)$/ }, () => ({ path: 'auth-service', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /(?:services\/api|[/\\]api)$/ }, () => ({ path: 'api-service', namespace: 'stub' }));
          buildInstance.onResolve({ filter: /\.css$/ }, () => ({ path: 'css-stub', namespace: 'stub' }));
          buildInstance.onLoad({ filter: /^css-stub$/, namespace: 'stub' }, () => ({ contents: '', loader: 'js' }));

          buildInstance.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
            if (args.path === 'react') {
              return {
                contents: `
                  const R = window.React;
                  export default R;
                  export const useState = (...a) => R.useState(...a);
                  export const useEffect = (...a) => R.useEffect(...a);
                  export const useRef = (...a) => R.useRef(...a);
                  export const useMemo = (...a) => R.useMemo(...a);
                  export const useCallback = (...a) => R.useCallback(...a);
                  export const createContext = (...a) => R.createContext(...a);
                  export const useContext = (...a) => R.useContext(...a);
                  export const createElement = (...a) => R.createElement(...a);
                `,
                loader: 'js',
              };
            }
            if (args.path === 'react/jsx-runtime' || args.path === 'react/jsx-dev-runtime') {
              return {
                contents: `
                  const R = window.React;
                  export const Fragment = R.Fragment;
                  export const jsx = (type, props, key) => R.createElement(type, key !== undefined ? { ...props, key } : props);
                  export const jsxs = jsx;
                  export const jsxDEV = jsx;
                `,
                loader: 'js',
              };
            }
            if (args.path === 'react-dom') {
              return {
                contents: "export default window.ReactDOM; export const createPortal = (children, container) => children;",
                loader: 'js',
              };
            }
            if (args.path === 'contracts') {
              return {
                contents: `
                  const C = window.ChatContracts;
                  export default C;
                  export const ChatConversationListSchema = C.ChatConversationListSchema; export const PerformanceDashboardSchema = C.PerformanceDashboardSchema; export const PerformancePolicyRulesSchema = C.PerformancePolicyRulesSchema; export const AccountEmailSchema = C.AccountEmailSchema; export const OnboardingCreateSchema = C.OnboardingCreateSchema; export const notificationEntityKinds = C.notificationEntityKinds || [];
                  export const ChatHistoryPageSchema = C.ChatHistoryPageSchema;
                  export const ChatHistorySendSchema = C.ChatHistorySendSchema;
                  export const RevenueKpiOpenActionSchema = C.RevenueKpiOpenActionSchema;
                  export const RevenueKpiOpenPreviewSchema = C.RevenueKpiOpenPreviewSchema;
                  export const RevenueKpiChatActionSchema = C.RevenueKpiChatActionSchema;
                  export const PerformanceKpiChatActionSchema = C.PerformanceKpiChatActionSchema;
                  export const ChatAcceptedPayloadSchema = C.ChatAcceptedPayloadSchema;
                  export const ChatChunkTextPayloadSchema = C.ChatChunkTextPayloadSchema;
                  export const ChatErrorPayloadSchema = C.ChatErrorPayloadSchema;
                  export const RevenueKpiPolicySchema = C.RevenueKpiPolicySchema;
                `,
                loader: 'js',
              };
            }
            if (args.path === 'auth-context') {
              return {
                contents: "export const useAuth = () => ({ user: { authorization: { profile: 'staff' } } });",
                loader: 'js',
              };
            }
            if (args.path === 'brand-mark') {
              return {
                contents: 'export const BrandMark = () => null;',
                loader: 'js',
              };
            }
            if (args.path === 'theme-toggle') {
              return {
                contents: 'export const ThemeToggle = () => null;',
                loader: 'js',
              };
            }
            if (args.path === 'auth-service') {
              return {
                contents: "export const API_BASE = '/api'; export const apiFetch = (...args) => window.fetch(...args);",
                loader: 'js',
              };
            }
            if (args.path === 'api-service') {
              return {
                contents: "export const API_BASE = '/api'; export const apiFetch = (...args) => window.fetch(...args); export const requestJson = (...args) => window.fetch(...args); export const newClientMessageId = () => '375a3b79-6a09-4c3a-b551-32ae773d93c3'; export const fetchReplacementCandidates = () => window.fetch('/api/projects/x/candidates'); export const fetchNotifications = () => window.fetch('/api/notifications'); export const fetchNotificationInbox = () => window.fetch('/api/notifications/inbox'); export const readAssignmentNotice = () => window.fetch('/api/notifications/read', { method: 'POST' }); export const markNotificationRead = () => window.fetch('/api/notifications/read', { method: 'POST' }); export const fetchMe = () => window.fetch('/api/auth/me');",
                loader: 'js',
              };
            }
            return null;
          });
        },
      },
    ],
  });
  const now = new Date().toISOString(), id = 'a'.repeat(24), secondId = 'b'.repeat(24);
  const conversationId = 'f3b2c5ab-83d8-47f1-b866-7aeaa3b74241';
  const unit = { unitType: 'STORE', storeId: id, storeIds: [id], areaKey: null, label: 'Cửa hàng kiểm thử',
    assigneeEmployeeId: id, assigneeName: 'SM kiểm thử', assigneeRole: 'SM', assignmentId: null,
    targetMode: 'ABSOLUTE_VND', growthPercent: null, targetVnd: 100000, code: null, message: null, retryable: false, fixHint: null };
  const blocked = { ...unit, storeId: secondId, storeIds: [secondId], label: 'Cửa hàng thiếu SM',
    status: 'BLOCKED', retryable: true, code: 'MISSING_SM', message: 'Cần bổ nhiệm SM' };
  const proposal = { actionId: 'dbafcc4e-b2e3-4370-8354-40be02fd4c41', type: 'revenue_kpi.open_period',
    status: 'PENDING', expiresAt: new Date(Date.now() + 600000).toISOString(), requiresConfirmation: true, executed: false, result: null,
    preview: { periodId: id, period: '2026-11', version: 1, status: 'DRAFT', planDigest: 'a'.repeat(64), generatedAt: now, executed: false,
      summary: { create: 1, skipped: 0, blocked: 1, total: 2 }, items: [{ ...unit, status: 'CREATE' }, blocked] } };
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://chat.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="vi"><body><div id="root"></div></body></html>',
      })
    );
    await page.goto('http://chat.test/');
    await page.addScriptTag({ path: reactUmdPath });
    await page.addScriptTag({ path: reactDomUmdPath });
    if (builtCss) await page.addStyleTag({ content: builtCss });
    await page.addScriptTag({ content: contracts.outputFiles[0].text });
    await page.addScriptTag({ content: chatPageBundle.outputFiles[0].text });
    await page.route('**/api/chat/conversations**', (route) => route.fulfill({ json: { items: [], nextCursor: null } }));

    await page.addScriptTag({
      content: `
        window.ChatPageView = window.ChatPageModule.ChatPageView || window.ChatPageModule.default;
        const root = ReactDOM.createRoot(document.getElementById('root'));
        window.mount = () => root.render(React.createElement(window.ChatPageView, { onSwitchTab: () => {}, onLogout: () => {} }));
      `,
    });

    const requests = [];
    let mode = 'success';
    await page.route('**/api/chat/stream', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204 });
      }
      const data = route.request().postDataJSON();
      requests.push(data);
      if (mode === 'fault') {
        return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Chat HTTP 503' } } });
      }
      if (mode === 'invalid') {
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reply: {} }),
        });
      }
      const clientMessageId = data?.clientMessageId || '375a3b79-6a09-4c3a-b551-32ae773d93c3';
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId, messageId: clientMessageId, conversationId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId,
          turn: {
            id: clientMessageId,
            userMessage: data?.message || '',
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Theo quy chế hiện hành, đi trễ quá 15 phút bị nhắc nhở.',
            replyHidden: false,
            citations: [{ document: 'Tài liệu kiểm thử', article: 'Điều 1', score: 1 }],
            attachments: [],
             proposedAction: proposal,
          },
        })}\n\n`,
      ].join('');
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseBody,
      });
    });
    await page.route('**/api/chat', async (route) => {
      if (route.request().url().includes('/stream')) return route.fallback();
      return route.fulfill({ status: 200, json: {} });
    });

    assert.equal(await page.evaluate(() => typeof window.mount), 'function', `harness mount missing; page errors: ${errors.join(' | ')}`);
    await page.evaluate(() => window.mount());
    const pageRoot = page.getByTestId('chat-page');
    await pageRoot.waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);

    const input = pageRoot.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
    await input.fill('Đi trễ quá 15 phút thì sao?');
    await input.press('Enter');

    assert.equal(requests.length, 1);
    try {
      await pageRoot.locator('[data-sender="assistant"]').getByText('Theo quy chế hiện hành, đi trễ quá 15 phút bị nhắc nhở.', { exact: true }).waitFor({ timeout: 5000 });
    } catch (cause) {
      const text = await pageRoot.getByRole('log').textContent();
      throw new Error(`Expected completed response missing; assistant log: ${text}; page errors: ${errors.join(' | ')}`, { cause });
    }
    assert.equal(requests[0].message, 'Đi trễ quá 15 phút thì sao?');

    const citations = pageRoot.locator('details[aria-label="Trích dẫn"]');
    const citationToggle = citations.locator('summary');
    assert.equal(await citations.evaluate((node) => node.open), false);
    assert.equal(await citations.locator('ul').isVisible(), false);
    await citationToggle.click();
    assert.equal(await citations.locator('ul').isVisible(), true);
    assert.match(await citations.textContent(), /Tài liệu kiểm thử/);
    assert.match(await citations.textContent(), /Điều 1/);
    await citationToggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await citations.locator('ul').isVisible(), false);
    await page.keyboard.press('Space');
    assert.equal(await citations.locator('ul').isVisible(), true);


    const decisions = [], retries = [], reads = [];
    const retry = { ...proposal, actionId: '70cc657c-5998-4776-8630-74fce48a3206', preview: { ...proposal.preview, version: 2, status: 'OPEN' } };
    const policy = await page.evaluate(() => ChatContracts.RevenueKpiPolicySchema.parse({}));
    const executed = { ...proposal, status: 'EXECUTED', requiresConfirmation: false, executed: true,
      result: { period: { id, period: '2026-11', status: 'OPEN', policy, openedBy: id, openedAt: now,
        closedBy: null, closedAt: null, version: 2, history: [], createdAt: now, updatedAt: now },
        executed: true, outcome: 'PARTIAL', summary: { created: 1, skipped: 0, blocked: 1, failed: 0, total: 2 },
        created: [{ ...unit, status: 'CREATED', assignmentId: id }], skipped: [], blocked: [blocked], failed: [] } };
    await page.route('**/api/chat/actions/**/decision', async route => {
      const input = route.request().postDataJSON();
      decisions.push(input);
      if (!input.approve) return route.fulfill({ json: { ...retry, status: 'CANCELLED', requiresConfirmation: false } });
      // Simulate another tab deciding first: the card must re-read the stored
      // outcome instead of keeping stale PENDING controls.
      if (decisions.filter(item => item.approve).length === 1)
        return route.fulfill({ status: 409, json: { error: { code: 'REVENUE_KPI_ACTION_DECIDED', message: 'Đề xuất đã được xử lý.' } } });
      return route.fulfill({ json: executed });
    });
    await page.route('**/api/chat/actions/**', async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      reads.push(route.request().url());
      return route.fulfill({ json: executed });
    });
    await page.route('**/api/revenue-kpi/periods/2026-11/open-proposal', route => {
      retries.push(route.request().postDataJSON());
      return route.fulfill({ json: retry });
    });
    const card = pageRoot.getByRole('region', { name: 'Kế hoạch mở kỳ KPI doanh thu' });
    await card.getByText('Dự kiến tạo 1 · Đã có 0 · Cần xử lý 1.').waitFor();
    assert.equal(decisions.length, 0);
    await card.getByRole('button', { name: 'Xác nhận kế hoạch' }).click();
    await card.getByText(/Kỳ đang mở. Đã tạo 1/).waitFor();
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].expectedVersion, 1);
    assert.equal(decisions[0].planDigest, proposal.preview.planDigest);
    assert.equal(reads.length, 1, 'A decided action must be re-read from the server');
    assert.equal(await card.getByRole('button', { name: 'Xác nhận kế hoạch' }).count(), 0);
    await card.getByText('Cần bổ nhiệm SM').waitFor();
    await card.getByRole('button', { name: 'Xem trước để thử lại' }).click();
    await card.getByRole('button', { name: 'Hủy đề xuất' }).click();
    await card.getByText('Đã hủy đề xuất. Kỳ và bản nháp giữ nguyên.').waitFor();
    assert.deepEqual(retries, [{}]);
    assert.deepEqual(Object.keys(decisions[1]).sort(), ['approve', 'clientRequestId']);
    assert.equal(decisions[1].approve, false);

    mode = 'invalid';
    await input.fill('Câu hỏi tiếp theo');
    await input.press('Enter');
    await pageRoot.getByTestId('chat-service-unavailable').waitFor({ state: 'visible' });
    assert.match(await pageRoot.textContent(), /Không thể kết nối đến máy chủ AI/);

    mode = 'fault';
    await page.waitForTimeout(1200);
    await input.fill('Câu hỏi thứ ba');
    await input.press('Enter');
    await page.waitForTimeout(1200);
    assert.match(await pageRoot.textContent(), /503/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
