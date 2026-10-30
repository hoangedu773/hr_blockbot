import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = 'C:/work-space/hr-blockbot/apps/web';
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/') { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<body style="background:#0a0a0a;color:#fafafa"><img id="a" src="/assets/logos/guta-mark-pure.svg" width="64" height="64"></body>'); return; }
  const f = path.join(ROOT, 'public', p);
  if (fs.existsSync(f)) { res.writeHead(200, {'Content-Type': p.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream'}); fs.createReadStream(f).pipe(res); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(5402, '127.0.0.1', r));
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:5402/');
await p.waitForTimeout(500);
const out = await p.evaluate(async () => {
  const img = document.getElementById('a');
  await img.decode();
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let best = [0,0,0,0];
  for (let i = 0; i < d.length; i += 4) if (d[i+3] > best[3]) best = [d[i], d[i+1], d[i+2], d[i+3]];
  return { natural: [img.naturalWidth, img.naturalHeight], brightest: best };
});
console.log(JSON.stringify(out));
await b.close(); server.close();
