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
await new Promise((r) => server.listen(5398, '127.0.0.1', r));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.route('**/api/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 't', user: { id: 'q', role: 'Admin', username: 'admin' } } });
  if (u.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: {} });
  return route.fulfill({ status: 200, json: {} });
});
await p.goto('http://127.0.0.1:5398/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.locator('a[href="#login"]').first().click({ timeout: 20000 });
await p.waitForTimeout(400);
await p.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
await p.getByLabel('Mật khẩu', { exact: true }).fill('x');
await p.locator('#auth-modal button[type=submit]').click();
await p.waitForTimeout(2600);

const chat = p.getByTestId('chat-page');
await chat.waitFor({ state: 'visible', timeout: 20000 });

const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
await input.focus();
await p.keyboard.press('Shift+Tab');
await p.keyboard.press('Enter');
await p.waitForTimeout(150);

console.log('textarea', JSON.stringify(await input.evaluate((el) => {
  const s = getComputedStyle(el);
  return { focused: document.activeElement === el, focusVisible: el.matches(':focus-visible'), outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth };
})));

console.log('matching outline rules', JSON.stringify(await p.evaluate(() => {
  const el = document.querySelector('#copilot-message');
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.cssRules) { walk(rule.cssRules); continue; }
        if (!rule.selectorText || !rule.style) continue;
        if (!rule.style.getPropertyValue('outline') && !rule.style.getPropertyValue('outline-style')) continue;
        let matches = false;
        try { matches = el.matches(rule.selectorText); } catch { continue; }
        if (matches) out.push({ selector: rule.selectorText, outline: rule.style.getPropertyValue('outline'), outlineStyle: rule.style.getPropertyValue('outline-style') });
      }
    };
    walk(rules);
  }
  return out;
}), null, 1));

await input.fill('Kiểm tra tương phản');
await p.waitForFunction(() => !document.querySelector('.chat-send').disabled);
await p.mouse.move(0, 0);
console.log('send', JSON.stringify(await p.evaluate(() => {
  const rgb = (value) => value.match(/[\d.]+/g).map(Number);
  const blend = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
  const background = (element) => {
    const chain = [];
    for (let node = element; node; node = node.parentElement) chain.unshift(node);
    return chain.reduce((color, node) => blend(rgb(getComputedStyle(node).backgroundColor), color), [0, 0, 0]);
  };
  const el = document.querySelector('.chat-send');
  const bg = background(el);
  return { color: getComputedStyle(el).color, bg, ink: blend(rgb(getComputedStyle(el).color), bg), classes: el.className };
}), null, 1));

await b.close();
server.close();
