import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, transform, reactUmdPath, reactDomUmdPath } from './helpers/browser-deps.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.join(here, '..', 'src', 'components', 'ui', 'Select.tsx');
const distAssetsDir = path.join(here, '..', 'dist', 'assets');

// The component imports React hooks and createPortal. The harness strips the
// import statements and re-supplies the same bindings from the UMD globals,
// which is how the other component tests mount source directly.
function compileSelect() {
  const source = fs.readFileSync(componentPath, 'utf-8');
  const stripped = source
    .replace(/^import .*?;\r?\n/gm, '')
    .replace('export const Select', 'const Select');
  return transform(`${stripped}\nwindow.Select = Select;`, { loader: 'tsx', format: 'iife', target: 'es2022' });
}

const builtCss = fs
  .readdirSync(distAssetsDir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => fs.readFileSync(path.join(distAssetsDir, name), 'utf8'))
  .join('\n');

const LEVELS = [
  { value: '', label: 'Tất cả' },
  { value: 'Intern', label: 'Intern' },
  { value: 'Junior', label: 'Junior' },
  { value: 'Middle', label: 'Middle' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Lead', label: 'Lead' },
];

// A fresh page per test: the harness declares top-level consts, so reusing one
// document would throw a redeclaration error on the second mount and leave the
// root empty. React's own useId is supplied so ids match production.
async function mountSelect(browser, compiled, { options = LEVELS, initial = '', disabled = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const harness = `
    const { useState } = React;
    const { createPortal } = ReactDOM;
    const useId = React.useId;
    const { useCallback, useEffect, useLayoutEffect, useMemo, useRef } = React;
    ${compiled.code}
    const root = ReactDOM.createRoot(document.getElementById('root'));
    function App() {
      const [value, setValue] = useState(${JSON.stringify(initial)});
      window.__value = value;
      return React.createElement('div', { style: { padding: 24 } },
        React.createElement('span', { id: 'lbl' }, 'Cấp bậc'),
        React.createElement(window.Select, {
          value,
          onChange: (next) => { window.__value = next; setValue(next); },
          'aria-labelledby': 'lbl',
          disabled: ${disabled},
          options: ${JSON.stringify(options)},
        }),
        React.createElement('button', { id: 'after' }, 'Sau')
      );
    }
    root.render(React.createElement(App));
  `;
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: builtCss });
  await page.addScriptTag({ path: reactUmdPath });
  await page.addScriptTag({ path: reactDomUmdPath });
  await page.addScriptTag({ content: harness });
  await page.waitForSelector('[role="combobox"]', { timeout: 5000 });
  return page;
}

describe('Select — custom listbox replaces the native popup', () => {
  let browser;
  let compiled;

  before(async () => {
    compiled = await compileSelect();
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    await browser?.close();
  });

  it('mở bằng chuột, chọn một option, đóng và trả focus về trigger', async () => {
    const page = await mountSelect(browser, compiled);
    const trigger = page.locator('[role="combobox"]');

    await trigger.click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('[role="listbox"]').count(), 1);

    await page.locator('[role="option"]', { hasText: 'Middle' }).click();
    assert.equal(await page.evaluate(() => window.__value), 'Middle');
    assert.equal(await page.locator('[role="listbox"]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox');
  });

  it('bàn phím: ArrowDown mở, ArrowDown x2, Enter chọn option thứ ba', async () => {
    const page = await mountSelect(browser, compiled);
    const trigger = page.locator('[role="combobox"]');
    await trigger.focus();

    await page.keyboard.press('ArrowDown');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    assert.equal(await page.evaluate(() => window.__value), 'Junior');
    assert.equal(await page.locator('[role="listbox"]').count(), 0);
  });

  it('Home và End nhảy tới option đầu và cuối', async () => {
    const page = await mountSelect(browser, compiled);
    await page.locator('[role="combobox"]').click();
    const listbox = page.locator('[role="listbox"]');

    await page.keyboard.press('End');
    const lastId = await listbox.getAttribute('aria-activedescendant');
    assert.ok(lastId?.endsWith('-option-5'), `End should land on the last option, got ${lastId}`);

    await page.keyboard.press('Home');
    const firstId = await listbox.getAttribute('aria-activedescendant');
    assert.ok(firstId?.endsWith('-option-0'), `Home should land on the first option, got ${firstId}`);
  });

  it('Escape đóng menu và trả focus về trigger', async () => {
    const page = await mountSelect(browser, compiled);
    await page.locator('[role="combobox"]').click();
    await page.keyboard.press('Escape');

    assert.equal(await page.locator('[role="listbox"]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox');
  });

  it('Tab rời khỏi widget thay vì bị giữ lại', async () => {
    const page = await mountSelect(browser, compiled);
    await page.locator('[role="combobox"]').click();
    await page.keyboard.press('Tab');

    assert.equal(await page.locator('[role="listbox"]').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'after');
  });

  it('typeahead: gõ "Jun" chọn đúng Junior', async () => {
    const page = await mountSelect(browser, compiled);
    await page.locator('[role="combobox"]').click();
    await page.keyboard.type('Jun', { delay: 40 });
    const activeId = await page.locator('[role="listbox"]').getAttribute('aria-activedescendant');
    assert.ok(activeId?.endsWith('-option-2'), `typeahead should land on Junior, got ${activeId}`);

    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__value), 'Junior');
  });

  it('click ngoài đóng menu', async () => {
    const page = await mountSelect(browser, compiled);
    await page.locator('[role="combobox"]').click();
    await page.mouse.click(860, 660);
    assert.equal(await page.locator('[role="listbox"]').count(), 0);
  });

  it('option bị disable không chọn được bằng chuột lẫn Enter', async () => {
    const page = await mountSelect(browser, compiled, {
      options: [
        { value: '', label: 'Tất cả' },
        { value: 'blocked', label: 'Bị khoá', disabled: true },
        { value: 'ok', label: 'Hợp lệ' },
      ],
    });
    await page.locator('[role="combobox"]').click();
    await page.locator('[role="option"]', { hasText: 'Bị khoá' }).click({ force: true });
    assert.equal(await page.evaluate(() => window.__value), '', 'disabled option must not commit');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__value), 'ok', 'arrows must skip the disabled option');
  });

  it('ARIA: trigger và listbox mô tả đúng trạng thái', async () => {
    const page = await mountSelect(browser, compiled, { initial: 'Senior' });
    const trigger = page.locator('[role="combobox"]');
    assert.equal(await trigger.getAttribute('aria-haspopup'), 'listbox');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');

    await trigger.click();
    const listbox = page.locator('[role="listbox"]');
    assert.equal(await listbox.count(), 1);
    assert.equal(await listbox.getAttribute('aria-labelledby'), 'lbl');

    const selected = page.locator('[role="option"][aria-selected="true"]');
    assert.equal(await selected.innerText(), 'Senior');
  });

  it('reduced motion: menu không chạy animation', async () => {
    const page = await mountSelect(browser, compiled);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[role="combobox"]').click();
    const duration = await page.locator('[role="listbox"]').evaluate((el) => getComputedStyle(el).animationDuration);
    assert.equal(duration, '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  it('disabled trigger không mở được menu', async () => {
    const page = await mountSelect(browser, compiled, { disabled: true });
    const trigger = page.locator('[role="combobox"]');
    assert.equal(await trigger.isDisabled(), true);
    await trigger.click({ force: true });
    assert.equal(await page.locator('[role="listbox"]').count(), 0);
  });
});
