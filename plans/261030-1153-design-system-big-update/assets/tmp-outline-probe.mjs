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
await new Promise((r) => server.listen(5397, '127.0.0.1', r));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.route('**/api/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 't', user: { id: 'q', role: 'Admin', username: 'admin' } } });
  if (u.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: {} });
  return route.fulfill({ status: 200, json: {} });
});
await p.goto('http://127.0.0.1:5397/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.locator('a[href="#login"]').first().click();
await p.waitForTimeout(400);
await p.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
await p.getByLabel('Mật khẩu', { exact: true }).fill('x');
await p.locator('#auth-modal button[type=submit]').click();
await p.waitForTimeout(2600);

const chat = p.getByTestId('chat-page');
await chat.waitFor({ state: 'visible', timeout: 15000 });
const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
await input.focus();
await p.keyboard.press('Shift+Tab');
await p.keyboard.press('Enter');
await p.waitForTimeout(120);

const cdp = await p.context().newCDPSession(p);
const handle = await input.elementHandle();
const { node } = await cdp.send('DOM.describeNode', { objectId: (await handle.evaluateHandle((el) => el)).toString() }).catch(() => ({}));
console.log('element info', await input.evaluate((el) => ({
  tag: el.tagName,
  cls: el.className,
  focused: document.activeElement === el,
  matchesFocusVisible: el.matches(':focus-visible'),
  outlineStyle: getComputedStyle(el).outlineStyle,
  outlineWidth: getComputedStyle(el).outlineWidth,
  outlineColor: getComputedStyle(el).outlineColor,
})));

// Which rules apply, per the CSSOM, for outline.
const applied = await p.evaluate(() => {
  const el = document.querySelector('#copilot-message');
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.cssRules) { walk(rule.cssRules); continue; }
        if (!rule.selectorText || !rule.style) continue;
        if (!rule.style.getPropertyValue('outline') && !rule.style.getPropertyValue('outline-style')) continue;
        let matches = false;
        try { matches = el.matches(rule.selectorText); } catch { continue; }
        if (matches) out.push({ selector: rule.selectorText, outline: rule.style.getPropertyValue('outline'), style: rule.style.getPropertyValue('outline-style') });
      }
    };
    walk(rules);
  }
  return out;
});
console.log('matching outline rules:', JSON.stringify(applied, null, 1));

// The exact pair the failing assertion measures, plus its ancestor chain.
console.log('pair', await input.evaluate((el) => {
  const chain = [];
  for (let n = el; n && n !== document.body; n = n.parentElement) chain.push(n.tagName + '.' + String(n.className).slice(0, 40));
  return chain;
}));

await b.close();
server.close();
