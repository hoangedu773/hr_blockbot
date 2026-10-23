const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173/previews/folio-layout.html');
  await page.locator('[data-theme-toggle] button[aria-label="Light theme"]').click();
  
  const bg = await page.evaluate(() => {
    const el = document.querySelector('.folio-preview');
    // check all matching rules in all stylesheets
    const list = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && el.matches(rule.selectorText)) {
            list.push({ sel: rule.selectorText, css: rule.cssText });
          }
        }
      } catch(e) {}
    }
    return {
      computedBg: getComputedStyle(el).backgroundColor,
      computedColor: getComputedStyle(el).color,
      canvasVar: getComputedStyle(el).getPropertyValue('--folio-canvas'),
      list
    };
  });
  console.log('Result:', JSON.stringify(bg, null, 2));
  await browser.close();
})();
