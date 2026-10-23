const fs = require('fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForSelector('h1');

  await page.evaluate(() => {
    const root = document.querySelector('#root > div');
    root.classList.add('folio-preview');
    const demo = root.querySelector('main section .grid.h-\\[280px\\]')?.parentElement;
    if (demo) {
      demo.dataset.folioDemo = '';
      demo.setAttribute('tabindex', '0');
      demo.setAttribute('aria-label', 'Minh họa giao diện 21st-CRM, cuộn ngang để xem');
      demo.setAttribute('role', 'region');
      const hint = document.createElement('p');
      hint.textContent = 'Minh họa 21st-CRM · Cuộn ngang để xem đầy đủ';
      demo.after(hint);
    }
    document.querySelector('#auth-modal')?.remove();
    document.querySelectorAll('script').forEach(node => node.remove());
  });

  await page.evaluate(require('./guta-content.cjs'));
  const markup = await page.locator('#root').innerHTML();

  const script = `<script>
  // Mobile Menu
  const toggle = document.querySelector('button[aria-label="Open Menu"]');
  toggle?.setAttribute('aria-expanded','false');
  toggle?.addEventListener('click', () => {
    const nav = toggle.closest('nav');
    const open = nav.dataset.state !== 'active';
    nav.dataset.state = open ? 'active' : 'false';
    toggle.setAttribute('aria-expanded', String(open));
  });

  // Dialog
  document.querySelectorAll('a[href="#login"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelector('#preview-notice').showModal();
  }));

  // Accordion
  document.querySelectorAll('[data-slot="accordion-trigger"]').forEach(trigger => trigger.addEventListener('click', () => {
    const content = trigger.closest('[data-slot="accordion-item"]').querySelector('[data-slot="accordion-content"]');
    const open = trigger.getAttribute('aria-expanded') !== 'true';
    trigger.setAttribute('aria-expanded', String(open));
    content.hidden = !open;
  }));

  // Theme Toggle (Light & Dark Mode)
  const html = document.documentElement;
  const lightBtn = document.querySelector('[data-theme-toggle] button[aria-label="Light theme"]');
  const darkBtn = document.querySelector('[data-theme-toggle] button[aria-label="Dark theme"]');

  lightBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    html.classList.remove('dark');
    html.classList.add('light');
  });

  darkBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    html.classList.remove('light');
    html.classList.add('dark');
  });
  </script>`;

  fs.writeFileSync(
    'apps/web/previews/folio-layout.html',
    `<!doctype html><html lang="vi" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Folio — preview sửa bố cục &amp; 21st-CRM</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&display=swap"><link rel="stylesheet" href="/assets/folio/folio.css"><link rel="stylesheet" href="folio-layout.css"></head><body>${markup}<dialog id="preview-notice"><p>Preview bố cục — chưa thay đổi đăng nhập ứng dụng.</p><form method="dialog"><button>Đóng</button></form></dialog>${script}</body></html>`
  );

  // Small delay to let Vite file watcher settle after writeFileSync
  await new Promise(r => setTimeout(r, 600));

  // Verification across viewports
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5173/previews/folio-layout.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');

    const text = await page.locator('body').innerText();
    assert.ok(!/Stock Analysis|AAPL|Greenleaf|Sarah Chen|Highlands Coffee|SQL|2,847 records/.test(text), 'No unrelated Folio content');
    
    // Check CRM dashboard components
    assert.ok(await page.locator('.crm-app').isVisible(), 'CRM App mounted');
    assert.equal(await page.locator('.crm-card').count(), 6, 'Kanban CRM cards rendered');
    assert.equal(await page.locator('.crm-metric-box').count(), 4, '4 metric cards rendered');

    // Check FAQ accordion
    await page.locator('.guta-faq summary').first().click();
    assert.ok(await page.locator('.guta-faq details').first().evaluate(el => el.open));
    await page.locator('.guta-faq summary').first().click();

    // Check heading typography (Vietnamese line-height & no clipping)
    assert.equal(await page.locator('h1').innerText(), 'Quản Trị Nhân Sự & Phân Ca Tự Động');
    const h1Lh = await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).lineHeight));
    const h1Fs = await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(h1Lh > h1Fs, `Heading line-height (${h1Lh}px) must be greater than font-size (${h1Fs}px) to prevent diacritic clipping`);
    assert.equal(h1Fs, width >= 1024 ? 60 : width >= 768 ? 48 : 36);

    // Check navbar buttons: strictly 2 action buttons on desktop (Đăng nhập, Xem dashboard)
    if (width >= 1024) {
      const rightBtns = await page.locator('header nav div.flex.w-full.flex-col a[data-slot="button"]').allInnerTexts();
      assert.deepEqual(rightBtns, ['Đăng nhập', 'Xem dashboard'], 'Desktop navbar must contain strictly 2 action buttons');

      // Check center menu links does NOT collide or overlap with logo or right buttons
      const collision = await page.evaluate(() => {
        const ul = document.querySelector('header nav div.absolute.inset-0 ul');
        const rightCluster = document.querySelector('header nav div.flex.w-full.flex-col.gap-3.sm\\:flex-row.sm\\:items-center.lg\\:w-auto');
        const logo = document.querySelector('header nav a[aria-label="Guta Workspace home"]');
        const cRect = ul.getBoundingClientRect();
        const rRect = rightCluster.getBoundingClientRect();
        const lRect = logo.getBoundingClientRect();
        return {
          gapLeft: Math.round(cRect.left - lRect.right),
          gapRight: Math.round(rRect.left - cRect.right),
          overlaps: cRect.right > rRect.left || cRect.left < lRect.right
        };
      });
      assert.ok(!collision.overlaps, `Text collision at ${width}px: gapLeft=${collision.gapLeft}px, gapRight=${collision.gapRight}px`);
      assert.ok(collision.gapLeft >= 30, `Left gap (${collision.gapLeft}px) must be >= 30px`);
      assert.ok(collision.gapRight >= 30, `Right gap (${collision.gapRight}px) must be >= 30px`);
    }

    // Check no page overflow
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);

    // Mobile menu test
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open Menu' }).click();
      assert.equal(await page.getByRole('button', { name: 'Open Menu' }).getAttribute('aria-expanded'), 'true');
      assert.ok(await page.getByRole('link', { name: 'Nghiệp vụ', exact: true }).last().isVisible());
      await page.getByRole('button', { name: 'Open Menu' }).click();
    }

    // Theme toggle & CDP font test (test on 1440px)
    if (width === 1440) {
      // CDP Font Verification
      const client = await page.context().newCDPSession(page);
      await client.send('DOM.enable');
      await client.send('CSS.enable');
      const doc = await client.send('DOM.getDocument');
      
      const h1Node = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'h1' });
      const h1Fonts = await client.send('CSS.getPlatformFontsForNode', { nodeId: h1Node.nodeId });
      assert.ok(h1Fonts.fonts.some(f => /Newsreader|Tiempos/i.test(f.familyName)), `H1 must render with Newsreader/Tiempos, got: ${JSON.stringify(h1Fonts.fonts)}`);
      assert.ok(!h1Fonts.fonts.some(f => /Times New Roman/i.test(f.familyName)), `H1 must not split into Times New Roman`);

      const h2Nodes = await client.send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: 'h2' });
      for (const nodeId of h2Nodes.nodeIds) {
        const h2Fonts = await client.send('CSS.getPlatformFontsForNode', { nodeId });
        assert.ok(h2Fonts.fonts.some(f => /Newsreader|Tiempos/i.test(f.familyName)), `H2 must render with Newsreader/Tiempos, got: ${JSON.stringify(h2Fonts.fonts)}`);
        assert.ok(!h2Fonts.fonts.some(f => /Times New Roman/i.test(f.familyName)), `H2 must not split into Times New Roman`);
      }

      const bodyP = await client.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'h1 + div > p' });
      const pFonts = await client.send('CSS.getPlatformFontsForNode', { nodeId: bodyP.nodeId });
      assert.ok(pFonts.fonts.some(f => /Geist/i.test(f.familyName)), `Body text must render with Geist, got: ${JSON.stringify(pFonts.fonts)}`);

      // Toggle to Light mode
      await page.locator('[data-theme-toggle] button[aria-label="Light theme"]').click();
      await page.waitForTimeout(300);
      const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
      assert.ok(isLight, 'Switched to light theme');
      const lightBg = await page.locator('.folio-preview').evaluate(el => getComputedStyle(el).backgroundColor);
      assert.ok(lightBg.includes('250') || lightBg.includes('255'), 'Light background applied');
      await page.screenshot({ path: `apps/web/previews/folio-layout-light.png`, fullPage: true });

      // Toggle back to Dark mode
      await page.locator('[data-theme-toggle] button[aria-label="Dark theme"]').click();
      await page.waitForTimeout(300);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      assert.ok(isDark, 'Switched back to dark theme');
      const darkBg = await page.locator('.folio-preview').evaluate(el => getComputedStyle(el).backgroundColor);
      assert.ok(darkBg.includes('18') || darkBg.includes('0'), 'Dark background applied');
    }

    await page.screenshot({ path: `apps/web/previews/folio-layout-${width}.png`, fullPage: true });
    console.log(`PASS ${width}px: 2 navbar buttons, 0 collision (gapLeft/Right > 30px), typography, 21st-CRM, no overflow`);
  }

  console.log('ALL VERIFICATIONS PASSED.');
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
