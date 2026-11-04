import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  chromium,
  reactDomUmdPath,
  reactUmdPath,
  transform,
} from './helpers/browser-deps.mjs';

// Isolated component harness: real React + Chromium, HTTP boundary intercepted.
// It replaces the retired ChatDrawer harness and covers the surface users actually
// see (ChatPageView): citations, attachments, confirm-before-write honesty,
// contract-violation handling and the service-unavailable banner.

const distAssetsDir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const builtCss = fs
  .readdirSync(distAssetsDir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => fs.readFileSync(path.join(distAssetsDir, name), 'utf8'))
  .join('\n');

function harnessSource(source) {
  return transform(
    source
      .replace(/^import .*?;\r?\n/gm, '')
      .replace('export const ChatPageView', 'const ChatPageView')
      .replace(/export default ChatPageView;\s*$/, '') +
      '\nwindow.ChatPageView = ChatPageView;',
    { loader: 'tsx', format: 'iife', target: 'es2022' }
  );
}

test('ChatPageView renders citations/attachments, confirms drafts honestly and reports contract violations', async () => {
  const { build } = createRequire(import.meta.url)('esbuild');
  const contracts = await build({ entryPoints: [fileURLToPath(new URL('../../../packages/contracts/dist/index.js', import.meta.url))], bundle: true, platform: 'browser', format: 'iife', globalName: 'ChatContracts', write: false });
  const source = await readFile(new URL('../src/components/chat/ChatPageView.tsx', import.meta.url), 'utf8');
  const card = await readFile(new URL('../src/components/RevenueKpiOpenCard.tsx', import.meta.url), 'utf8');
  const compiled = await harnessSource(card.slice(card.indexOf('const itemLabels')).replace(/^export /gm, '') + source);
  const now = new Date().toISOString(), id = 'a'.repeat(24), secondId = 'b'.repeat(24);
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
    await page.addStyleTag({ content: builtCss });
    await page.addScriptTag({ content: contracts.outputFiles[0].text });
    await page.route('**/api/chat/conversations**', route => route.fulfill({ json: { items: [], nextCursor: null } }));

    const prelude = [
      'const { useState, useEffect, useRef } = React;',
      "const API_BASE = '/api';",
      'const apiFetch = fetch;',
      "const newClientMessageId = () => '375a3b79-6a09-4c3a-b551-32ae773d93c3';",
      'const { ChatConversationListSchema, ChatHistoryPageSchema, ChatHistorySendSchema, RevenueKpiOpenActionSchema, RevenueKpiOpenPreviewSchema } = ChatContracts;',
      "const useAuth = () => ({ user: { authorization: { profile: 'staff' } } });",
      'const BrandMark = () => null;',
      'const ThemeToggle = () => null;',
    ].join(' ');

    await page.addScriptTag({
      content: `${prelude} ${compiled.code} const root = ReactDOM.createRoot(document.getElementById('root')); window.mount = () => root.render(React.createElement(window.ChatPageView, { onSwitchTab: () => {}, onLogout: () => {} }));`,
    });

    const requests = [];
    let mode = 'success';
    await page.route('**/api/chat', async (route) => {
      requests.push(route.request().postDataJSON());
      if (mode === 'invalid') {
        await route.fulfill({ json: { reply: {} } });
        return;
      }
      if (mode === 'fault') {
        await route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE' } } });
        return;
      }
      await route.fulfill({
        json: {
          reply: 'Theo quy chế hiện hành, đi trễ quá 15 phút bị nhắc nhở.',
          conversationId: 'conversation-page-test',
          citations: [{ document: 'Tài liệu kiểm thử', article: 'Điều 1', score: 1 }],
          attachments: [
            { title: 'Biên bản bàn giao công việc', type: 'pdf', url: '/api/attachments/pdf/bb-cv.pdf', fileName: 'bb-cv.pdf' },
            { title: 'Liên kết độc hại', type: 'pdf', url: 'javascript:alert(1)', fileName: 'x.pdf' },
          ],
          proposedAction: proposal,
        },
      });
    });

    await page.evaluate(() => window.mount());
    const pageRoot = page.getByTestId('chat-page');
    await pageRoot.waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);

    const input = pageRoot.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
    await input.fill('Đi trễ quá 15 phút thì sao?');
    await input.press('Enter');

    await pageRoot.getByText('Theo quy chế hiện hành, đi trễ quá 15 phút bị nhắc nhở.').waitFor();
    assert.equal(requests.length, 1);
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

    const attachments = pageRoot.getByRole('region', { name: 'Tài liệu đính kèm' });
    assert.match(await attachments.textContent(), /bb-cv\.pdf/);
    const links = await attachments.locator('a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
    assert.deepEqual(links, ['/api/attachments/pdf/bb-cv.pdf'], 'unsafe javascript: attachment URL must be dropped');
    assert.equal(await page.evaluate(() => window.injected), undefined);

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
