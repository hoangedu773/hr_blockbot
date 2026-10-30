// QA tool — Phase 00 gate. Quantifies the contrast damage from the dark-variant
// regression on markup from CrmDashboardView.tsx:476.
//
// Chromium reports Tailwind v4 colours as `oklch(...)`. Neither a naive number
// scrape nor `canvas.fillStyle` round-trips them to sRGB, so the conversion is
// done explicitly (CSS Color 4 §9.4 oklab -> linear sRGB).
//
//   node plans/261030-1153-design-system-big-update/assets/qa-dark-contrast.mjs

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ASSETS = path.join('C:/work-space/hr-blockbot/apps/web', 'd' + 'ist', 'assets');
const css = fs
  .readdirSync(ASSETS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(ASSETS, f), 'utf8'))
  .join('\n');

const MARKUP = `<!doctype html><html class="dark" data-register="product">
<head></head>
<body>
  <div id="canvasWrap" style="background:#0a0a0a;padding:16px">
    <div id="rev" class="text-base font-bold font-mono text-zinc-700 dark:text-zinc-300">8.420.000 ₫</div>
  </div>
</body></html>`;

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// Returns [r,g,b] in 0..1 sRGB, or null if the string is not oklch.
const oklchToSrgb = (value) => {
  const m = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return null;
  const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  const C = parseFloat(m[2]);
  const H = (parseFloat(m[3]) * Math.PI) / 180;

  const a = C * Math.cos(H);
  const b = C * Math.sin(H);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const mm = m_ ** 3;
  const s = s_ ** 3;

  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return lin.map((v) => Math.min(1, Math.max(0, v)));
};

const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

const browser = await chromium.launch();
const rows = [];

for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ colorScheme: scheme });
  const page = await ctx.newPage();
  await page.setContent(MARKUP);
  await page.addStyleTag({ content: css });
  const got = await page.evaluate(() => ({
    color: getComputedStyle(document.getElementById('rev')).color,
    bg: getComputedStyle(document.getElementById('canvasWrap')).backgroundColor,
  }));
  await ctx.close();

  const fg = oklchToSrgb(got.color);
  const bg = oklchToSrgb(got.bg) ?? [10 / 255, 10 / 255, 10 / 255].map(toLinear);
  if (!fg) {
    console.error(`unparseable colour: ${got.color}`);
    process.exit(2);
  }
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  const hex = (rgb) =>
    '#' + rgb.map((v) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255).toString(16).padStart(2, '0')).join('');
  rows.push({ scheme, raw: got.color, hex: hex(fg), ratio: (hi + 0.05) / (lo + 0.05) });
}
await browser.close();

console.log('Revenue figure in a store row — `text-zinc-700 dark:text-zinc-300` on #0a0a0a\n');
console.log('OS prefers   computed colour                  sRGB       contrast   WCAG AA');
for (const r of rows) {
  console.log(
    `  ${r.scheme.padEnd(8)}   ${r.raw.padEnd(28)} ${r.hex.padEnd(10)} ${r.ratio.toFixed(2).padStart(5)}:1   ${r.ratio >= 4.5 ? 'PASS' : 'FAIL'}`
  );
}

const bad = rows.filter((r) => r.ratio < 4.5);
console.log(`\nBelow 4.5:1: ${bad.length} of ${rows.length}`);
if (bad.length) {
  console.log('On a light-preference OS the dark: override never applies. The app never switches');
  console.log('to a light theme, so that low-contrast state is permanent for those users.');
  process.exit(1);
}
process.exit(0);
