/**
 * Reads the live DOM class list and tells us, for each class, whether any
 * CSS rule in the loaded stylesheets matches it. That is the ground truth:
 * the audit script's string matching cannot see escaped selectors.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'file:///C:/work-space/hr-blockbot/apps/web/test/helpers/browser-deps.mjs';

const root = 'C:/work-space/hr-blockbot/apps/web';
const dist = path.join(root, 'dist');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(dist, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    const t = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': t[path.extname(f)] ?? 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  const i = path.join(dist, 'index.html');
  if (fs.existsSync(i)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(i).pipe(res); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let user = null;
await page.route('**/api/auth/login', (r) => {
  const { username } = r.request().postDataJSON();
  user = { id: 'u', role: 'Employee', username, mustChangePassword: false };
  return r.fulfill({ status: 200, json: { accessToken: 't', user } });
});
await page.route('**/api/auth/refresh', (r) => r.fulfill({ status: 200, json: { accessToken: user ? 't' : null } }));
await page.route('**/api/auth/me', (r) => r.fulfill({ status: 200, json: { userId: 'u', role: 'Employee', username: 'employee', mustChangePassword: false, skills: [] } }));
await page.route('**/api/chat', (r) => r.fulfill({ status: 200, json: {} }));

const collect = () => page.evaluate(() => {
  const out = new Map();
  for (const el of document.querySelectorAll('[class]')) {
    for (const c of el.getAttribute('class').split(/\s+/)) {
      if (c && !out.has(c)) out.set(c, el.tagName);
    }
  }
  return [...out.entries()];
});

const unmatched = (pairs) => page.evaluate((entries) => {
  const bad = [];
  for (const [cls, tag] of entries) {
    let matched = false;
    try {
      matched = document.querySelectorAll('.' + CSS.escape(cls)).length > 0 &&
        (() => {
          // A class "has a style" if any sheet rule targets it. Cheaper proxy:
          // compare computed style against a probe element with the class removed.
          return null;
        })();
    } catch { /* ignore */ }
    bad.push([cls, tag]);
  }
  return bad;
}, pairs);

const cssText = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 50));
  return null;
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const landing = await collect();

await page.getByRole('button', { name: /Get Started/i }).click();
await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await page.getByRole('heading', { name: /Chào mừng/i }).waitFor({ timeout: 8000 });
const chat = await collect();
await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
await page.getByRole('table').waitFor({ state: 'visible' });
await page.waitForTimeout(400);
const crm = await collect();

// Which classes appear in DOM but match zero selectors across all sheets.
const all = new Set([...landing, ...chat, ...crm].map(([c]) => c));
const missing = await page.evaluate((classes) => {
  const selectors = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const r of list) {
        if (r.selectorText) selectors.push(r.selectorText);
        if (r.cssRules) walk(r.cssRules);
      }
    };
    walk(rules);
  }
  const blob = selectors.join('\n');
  return classes.filter((c) => {
    const esc = c.replace(/[.*+?^${}()|[\]\\/:%#,!&>='"]/g, (s) => '\\' + s);
    return !blob.includes('.' + esc);
  });
}, [...all]);

console.log('DOM classes:', all.size);
console.log('NO RULE MATCHES (' + missing.length + '):');
console.log(missing.sort().join('\n'));

fs.writeFileSync(
  'C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets/tmp-dom-missing.json',
  JSON.stringify({ missing: missing.sort(), all: [...all].sort() }, null, 1)
);

await browser.close();
server.close();
