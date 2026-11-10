import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(webRoot, 'dist');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

let server;
let browser;
let page;
let serverUrl;
const pageErrors = [];

before(async () => {
  assert.equal(fs.existsSync(path.join(distDir, 'index.html')), true, 'Build the web app before this test.');

  server = http.createServer((request, response) => {
    const relativePath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    const filePath = path.resolve(distDir, relativePath);
    if (!filePath.startsWith(`${distDir}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404).end('Not Found');
      return;
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(serverUrl, { waitUntil: 'load' });
});

after(async () => {
  await browser?.close();
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

it('reveals all dashboard columns and cards when the mobile preview is scrolled horizontally', async () => {
  const demo = page.locator('.guta-demo-scroll');
  await demo.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const first = document.querySelector('.crm-stage-col');
    return Number(getComputedStyle(first).opacity) > 0.99;
  });

  await demo.evaluate((element) => { element.style.scrollBehavior = 'auto'; element.scrollLeft = element.scrollWidth / 2; });
  await page.waitForFunction(() => {
    const columns = [...document.querySelectorAll('.crm-stage-col')];
    return columns.slice(3, 5).every((element) => Number(getComputedStyle(element).opacity) > 0.99);
  });

  await demo.evaluate((element) => { element.style.scrollBehavior = 'auto'; element.scrollLeft = element.scrollWidth; });

  await page.waitForFunction(() => {
    const root = document.querySelector('.guta-demo-scroll').getBoundingClientRect();
    const column = document.querySelector('.crm-stage-col:last-child');
    const card = column?.querySelector('.crm-card[data-enter]');
    const columnRect = column?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    return !!columnRect && !!cardRect
      && Number(getComputedStyle(column).opacity) > 0.99 && columnRect.left < root.right && columnRect.right > root.left
      && Number(getComputedStyle(card).opacity) > 0.99 && cardRect.left < root.right && cardRect.right > root.left;
  }, undefined, { timeout: 5000 });
});
