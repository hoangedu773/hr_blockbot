const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const previewUrl = "file://" + path.resolve("previews/preview-folio-intelligence.html").replace(/\\/g, "/");
  await p1.goto(previewUrl, { waitUntil: "networkidle" });
  
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await p2.evaluate(() => localStorage.clear());
  await p2.reload({ waitUntil: "networkidle" });

  const getH1Chain = async (page) => {
    return await page.evaluate(() => {
      let el = document.querySelector('h1');
      const chain = [];
      while (el && el.tagName !== 'HTML') {
        const s = window.getComputedStyle(el);
        chain.push({
          tag: el.tagName,
          id: el.id,
          class: el.className,
          rect: el.getBoundingClientRect(),
          display: s.display,
          padding: s.padding,
          margin: s.margin,
          position: s.position,
          top: s.top
        });
        el = el.parentElement;
      }
      return chain;
    });
  };

  const previewChain = await getH1Chain(p1);
  const webChain = await getH1Chain(p2);

  console.log("=== PREVIEW H1 PARENT CHAIN ===");
  console.log(JSON.stringify(previewChain, null, 2));

  console.log("=== WEB APP H1 PARENT CHAIN ===");
  console.log(JSON.stringify(webChain, null, 2));

  await browser.close();
})();
