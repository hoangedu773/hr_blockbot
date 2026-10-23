const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  
  for (const width of [1024, 1100, 1200, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:5173/previews/folio-layout.html');
    
    await page.evaluate(() => {
      // Remove 3rd button
      const btns = Array.from(document.querySelectorAll('header nav a[data-slot="button"]'));
      const traiNghiem = btns.find(b => b.innerText.includes('Trải nghiệm'));
      if (traiNghiem) traiNghiem.remove();
      
      const centerMenuContainer = document.querySelector('header nav .absolute.inset-0');
      if (centerMenuContainer) {
        centerMenuContainer.className = 'hidden lg:flex items-center justify-center flex-1 mx-4';
        centerMenuContainer.style.position = 'static';
        centerMenuContainer.style.margin = '0 auto';
      }

      const ul = document.querySelector('header nav ul');
      if (ul) {
        ul.style.display = 'flex';
        ul.style.gap = window.innerWidth >= 1280 ? '2rem' : '1.25rem';
      }
      
      const rightCluster = document.querySelector('header nav div.flex.w-full.flex-col.gap-3.sm\\:flex-row.sm\\:items-center.lg\\:w-auto');
      if (rightCluster) rightCluster.style.gap = '8px';
    });

    const collision = await page.evaluate(() => {
      const centerMenu = document.querySelector('header nav ul');
      const rightCluster = document.querySelector('header nav div.flex.w-full.flex-col.gap-3.sm\\:flex-row.sm\\:items-center.lg\\:w-auto');
      const logo = document.querySelector('header nav a[aria-label="Guta Workspace home"]');
      
      const cRect = centerMenu ? centerMenu.getBoundingClientRect() : null;
      const rRect = rightCluster ? rightCluster.getBoundingClientRect() : null;
      const lRect = logo ? logo.getBoundingClientRect() : null;
      
      return {
        width: window.innerWidth,
        gapLogoToCenter: cRect && lRect ? Math.round(cRect.left - lRect.right) : 0,
        gapCenterToRight: cRect && rRect ? Math.round(rRect.left - cRect.right) : 0,
        overlapsRight: cRect && rRect ? cRect.right > rRect.left : false,
        overlapsLeft: cRect && lRect ? cRect.left < lRect.right : false
      };
    });
    console.log(`Flex layout at ${width}px:`, collision);
  }

  await browser.close();
})();
