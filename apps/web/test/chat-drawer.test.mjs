import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { transform } = require('../../../node_modules/.pnpm/node_modules/esbuild');

test('ChatDrawer renders Markdown/citations, confirms drafts honestly, validates errors and handles mobile keyboard', async () => {
  // Isolated component harness: real React + Chromium; HTTP boundary is intercepted, not live integration.
  const source = await readFile(new URL('../src/components/chat/ChatDrawer.tsx', import.meta.url), 'utf8');
  const compiled = await transform(source.replace(/^import .*?;\r?\n/gm, '').replace('export const ChatDrawer', 'const ChatDrawer') + '\nwindow.ChatDrawer = ChatDrawer;', { loader: 'tsx', format: 'iife', target: 'es2022' });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://chat.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="vi"><body><button id="trigger">Mở chat</button><div id="root"></div></body></html>' }));
    await page.goto('http://chat.test/');
    await page.addScriptTag({ path: resolve('apps/web/node_modules/react/umd/react.development.js') });
    await page.addScriptTag({ path: resolve('apps/web/node_modules/react-dom/umd/react-dom.development.js') });
    await page.addStyleTag({ path: resolve('apps/web/src/index.css') });
    await page.addScriptTag({ content: `const { useState, useEffect, useRef } = React; const API_BASE = '/api'; const apiFetch = fetch; ${compiled.code} const root = ReactDOM.createRoot(document.getElementById('root')); window.showChat = () => root.render(React.createElement(window.ChatDrawer, { isOpen: true, onClose: () => root.render(null) })); document.getElementById('trigger').onclick = window.showChat;` });
    const requests = [];
    let mode = 'success';
    await page.route('**/api/chat', async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: mode === 'invalid' ? { reply: {} } : {
        reply: '**Quy chế**\n- Dòng một\n`mã`\n<script>window.injected=true</script>',
        conversationId: 'conversation-component-test',
        citations: [{ document: 'Tài liệu kiểm thử', article: 'Điều 1', score: 1 }],
        proposedAction: { type: 'request_shift_swap', requiresConfirmation: true, preview: 'Bản nháp đổi ca', args: { shift: 'trưa' } },
      } });
    });
    await page.locator('#trigger').click();
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => typeof window.ChatDrawer), 'function');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getByRole('button', { name: /Đi trễ 20 phút tại Guta bị xử lý thế nào/ }).count(), 1);
    assert.equal(await dialog.getByRole('button', { name: /Quỹ két ca sáng bị lệch 50k xử lý sao/ }).count(), 1);
    await dialog.getByRole('button', { name: /Chi nhánh nào đang thiếu người ca trưa nay/ }).click();
    const input = dialog.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
    await input.fill('Không gửi trùng');
    await input.press('Enter');
    await dialog.getByText('Bản nháp đổi ca', { exact: true }).waitFor();
    assert.equal(requests.length, 1);
    assert.equal(await dialog.locator('strong').filter({ hasText: 'Quy chế' }).count(), 1);
    assert.match(await dialog.getByRole('region', { name: 'Trích dẫn' }).textContent(), /Điều 1.*Điểm 1.00/s);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await dialog.getByRole('button', { name: 'Xác nhận thực hiện', exact: true }).click();
    assert.equal(await dialog.getByText('Đã xác nhận đề xuất. Chưa thực thi.', { exact: true }).isVisible(), true);
    assert.match(await dialog.getByRole('status').textContent(), /Chưa thực thi hoặc ghi dữ liệu/);
    assert.equal(requests.length, 1, 'Confirm must not pretend to execute a server write');
    await input.fill('Câu hỏi tiếp theo');
    await input.press('Enter');
    await dialog.getByRole('button', { name: 'Hủy bỏ', exact: true }).waitFor();
    assert.equal(requests[1].conversationId, 'conversation-component-test');
    await dialog.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
    mode = 'invalid';
    await input.fill('Đi trễ');
    await input.press('Enter');
    await dialog.getByRole('button', { name: 'Thử lại', exact: true }).waitFor();
    assert.match(await dialog.textContent(), /phản hồi không hợp lệ/);
    assert.doesNotMatch(await dialog.textContent(), /184.250.000|50.000 ₫ phụ cấp/);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await dialog.isVisible(), true);
    const sizes = await dialog.getByRole('button').evaluateAll((buttons) => buttons.map((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
    assert.ok(sizes.every(({ width, height }) => width >= 44 && height >= 44));
    assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await dialog.getByRole('button', { name: 'Đóng Chat Copilot' }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await input.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.getByRole('button', { name: 'Đóng Chat Copilot' }).evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
