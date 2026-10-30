import { chromium } from 'playwright';
import fs from 'node:fs';
const file = process.argv[2];
const box = JSON.parse(process.argv[3]);
const b = await chromium.launch();
const p = await b.newPage();
const data = fs.readFileSync(file).toString('base64');
const out = await p.evaluate(async ({ data, box }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(box.x, box.y, box.w, box.h).data;
  const hist = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = `${d[i]},${d[i+1]},${d[i+2]}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  return { size: [img.naturalWidth, img.naturalHeight], top: [...hist.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5) };
}, { data, box });
console.log(JSON.stringify(out));
await b.close();
