// Attribution probe: does removing every Phase-01 rule restore the two
// ChatPage assertions? If yes the change is mine; if no, they pre-date it.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const STATIC = path.join('C:/work-space/hr-blockbot/apps/web', 'd' + 'ist');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(STATIC, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(STATIC, 'index.html')).pipe(res);
  }
});
await new Promise((r) => server.listen(5399, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/api/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 't', user: { id: 'q', role: 'Admin', username: 'admin' } } });
  if (u.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: {} });
  return route.fulfill({ status: 200, json: {} });
});
await page.goto('http://127.0.0.1:5399/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /Get Started/i }).click();
await page.waitForTimeout(400);
await page.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
await page.getByLabel('Mật khẩu', { exact: true }).fill('x');
await page.locator('#auth-modal button[type=submit]').click();
await page.waitForTimeout(2600);

const chat = page.getByTestId('chat-page');
await chat.waitFor({ state: 'visible', timeout: 20000 });
const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

const snapshot = async (label) => {
  await input.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const outline = await input.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.borderTopWidth, s.outlineStyle, s.boxShadow, s.backgroundColor];
  });
  await input.fill('Kiểm tra tương phản');
  await page.waitForFunction(() => !document.querySelector('.chat-send').disabled);
  await page.mouse.move(0, 0);
  const contrast = await page.evaluate(() => {
    const rgb = (v) => v.match(/[\d.]+/g).map(Number);
    const blend = (f, b) => f.slice(0, 3).map((v, i) => v * (f[3] ?? 1) + b[i] * (1 - (f[3] ?? 1)));
    const background = (el) => {
      const chain = [];
      for (let n = el; n; n = n.parentElement) chain.unshift(n);
      return chain.reduce((c, n) => blend(rgb(getComputedStyle(n).backgroundColor), c), [0, 0, 0]);
    };
    const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const send = document.querySelector('.chat-send');
    const bg = background(send);
    return { ratio: +ratio(blend(rgb(getComputedStyle(send).color), bg), bg).toFixed(3), color: getComputedStyle(send).color };
  });
  console.log(label, JSON.stringify({ outline, sendContrast: contrast }));
};

await snapshot('WITH my rules   ');

// Remove every rule whose selector is one Phase 01 introduced or rewrote.
const removed = await page.evaluate(() => {
  const mine = /\.crm-|#detail-drawer|#drawer-backdrop|\.table-row-hover/;
  let count = 0;
  const walk = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const rule = list[i];
      if (rule.cssRules && rule.type !== 4) { walk(rule.cssRules); continue; }
      if (rule.selectorText && mine.test(rule.selectorText)) { list.deleteRule(i); count++; }
    }
  };
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    walk(rules);
  }
  return count;
});
console.log('rules removed', removed);

await snapshot('WITHOUT my rules');
await browser.close();
server.close();
