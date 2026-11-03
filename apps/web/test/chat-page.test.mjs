import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
  const source = await readFile(new URL('../src/components/chat/ChatPageView.tsx', import.meta.url), 'utf8');
  const compiled = await harnessSource(source);
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

    const prelude = [
      'const { useState, useEffect, useRef } = React;',
      "const API_BASE = '/api';",
      'const apiFetch = fetch;',
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
          proposedAction: { type: 'request_shift_swap', requiresConfirmation: true, preview: 'Bản nháp đổi ca' },
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

    await pageRoot.getByRole('button', { name: 'Xác Nhận (Confirm)' }).click();
    assert.equal(await pageRoot.getByText('Đã xác nhận đề xuất. Chưa thực thi.', { exact: true }).isVisible(), true);
    assert.equal(requests.length, 1, 'Confirm must not issue a server write');

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
