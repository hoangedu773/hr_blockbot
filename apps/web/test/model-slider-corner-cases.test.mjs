import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { transform } = require('../../../node_modules/.pnpm/node_modules/esbuild');

test('ModelSlider Corner Cases & Touch Targets', async () => {
  const source = await readFile(new URL('../src/components/chat/ChatDrawer.tsx', import.meta.url), 'utf8');
  const compiled = await transform(
    source
      .replace(/^import .*?;\r?\n/gm, '')
      .replace('export const ChatDrawer', 'const ChatDrawer') +
      '\nwindow.ChatDrawer = ChatDrawer;\nwindow.ModelSlider = ModelSlider;\nwindow.MODEL_TIER_CONFIG = MODEL_TIER_CONFIG;',
    { loader: 'tsx', format: 'iife', target: 'es2022' }
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
    await page.route('http://chat.test/**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><div id="root"></div></body></html>',
      })
    );
    await page.goto('http://chat.test/');
    await page.addScriptTag({ path: resolve('apps/web/node_modules/react/umd/react.development.js') });
    await page.addScriptTag({ path: resolve('apps/web/node_modules/react-dom/umd/react-dom.development.js') });
    await page.addStyleTag({ path: resolve('apps/web/src/index.css') });
    await page.addScriptTag({
      content: `
      const { useState, useEffect, useRef } = React;
      const API_BASE = '/api';
      const apiFetch = fetch;
      ${compiled.code};
      const root = ReactDOM.createRoot(document.getElementById('root'));
      window.renderSlider = () => {
        const App = () => {
          const [tier, setTier] = useState('medium');
          return React.createElement('div', { id: 'slider-box' }, [
            React.createElement(window.ModelSlider, { tier, onChange: setTier, key: 'slider' }),
            React.createElement('div', { id: 'current-tier' }, tier)
          ]);
        };
        root.render(React.createElement(App));
      };
      window.renderDrawer = () => {
        root.render(React.createElement(window.ChatDrawer, { isOpen: true, onClose: () => {} }));
      };
    `,
    });

    await page.evaluate(() => window.renderSlider());

    const slider = page.getByRole('slider');
    await slider.waitFor({ state: 'visible' });

    // 1. Giao diện Slider: Thành phần
    assert.equal(await page.textContent('#current-tier'), 'medium');
    assert.match(await page.textContent('#slider-box'), /Balanced/);
    assert.match(await page.textContent('#slider-box'), /Gemini 3.5 Flash/);
    assert.match(await page.textContent('#slider-box'), /›/);

    // 2. Touch targets: Lightning button, Reset button
    const lightningBtn = page.getByRole('button', { name: 'Chế độ xử lý nhanh AI' });
    const resetBtn = page.getByRole('button', { name: 'Khôi phục mặc định Balanced' });

    const lightningBox = await lightningBtn.boundingBox();
    const resetBox = await resetBtn.boundingBox();
    const knobBox = await slider.boundingBox();

    console.log('Lightning box:', lightningBox);
    console.log('Reset box:', resetBox);
    console.log('Knob box:', knobBox);

    assert.ok(lightningBox.width >= 44 && lightningBox.height >= 44, 'Lightning btn target >= 44x44');
    assert.ok(resetBox.width >= 44 && resetBox.height >= 44, 'Reset btn target >= 44x44');

    // Knob has 18x18 visual and pointerEvents:none on inner 44x44, but slider element itself is 18x18
    // Let's inspect the track & knob touch behavior

    // 3. Tương tác Slider:
    // Keyboard
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.textContent('#current-tier'), 'low');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.textContent('#current-tier'), 'medium');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.textContent('#current-tier'), 'high');
    await page.keyboard.press('Home');
    assert.equal(await page.textContent('#current-tier'), 'low');
    await page.keyboard.press('End');
    assert.equal(await page.textContent('#current-tier'), 'high');

    // Reset button
    await resetBtn.click();
    assert.equal(await page.textContent('#current-tier'), 'medium');

    // Track click: 0% / 10%
    const track = page.locator('.guta-model-track');
    const trackBox = await track.boundingBox();
    await page.mouse.click(trackBox.x + trackBox.width * 0.1, trackBox.y + trackBox.height * 0.5);
    assert.equal(await page.textContent('#current-tier'), 'low');

    // Track click: 90%
    await page.mouse.click(trackBox.x + trackBox.width * 0.9, trackBox.y + trackBox.height * 0.5);
    assert.equal(await page.textContent('#current-tier'), 'high');

    // Track click: 50%
    await page.mouse.click(trackBox.x + trackBox.width * 0.5, trackBox.y + trackBox.height * 0.5);
    assert.equal(await page.textContent('#current-tier'), 'medium');

    // 4. Màn hình siêu nhỏ 320px
    await page.evaluate(() => window.renderDrawer());
    const drawer = page.getByRole('dialog');
    await drawer.waitFor({ state: 'visible' });

    const isOverflow = await drawer.evaluate((el) => el.scrollWidth > el.clientWidth);
    const scrollWidth = await drawer.evaluate((el) => el.scrollWidth);
    const clientWidth = await drawer.evaluate((el) => el.clientWidth);
    console.log(`Drawer 320px: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, overflow=${isOverflow}`);
    assert.equal(isOverflow, false, 'Drawer at 320px must not overflow horizontally');

  } finally {
    await browser.close();
  }
});
