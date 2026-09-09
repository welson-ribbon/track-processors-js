import { chromium } from '/Users/welson/Dev/Ribbon/mono/web/node_modules/playwright/index.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const lib of ['main', 'fix']) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`http://localhost:8080/frame-size-demo.html?lib=${lib}&path=canvas&settings=transposed`);
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) { const n = await page.evaluate(() => window.__demo?.status().framesProcessed ?? 0); if (n >= 40) break; await sleep(250); }
  await sleep(1000);
  const s = await page.evaluate(() => window.__demo.status());
  console.log(lib, 'upright', JSON.stringify({ title: await page.locator('#title').innerText(), output: s.output, frame: s.frame, frames: s.framesProcessed, sharpness: s.sharpness }), errors.length ? errors : '');
  for (const step of ['rotate-1', 'rotate-2']) {
    const before = await page.evaluate(() => window.__demo.status().framesProcessed);
    await page.click('#rotate');
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) { const n = await page.evaluate(() => window.__demo.status().framesProcessed); if (n >= before + 40) break; await sleep(250); }
    await sleep(1000);
    const r = await page.evaluate(() => window.__demo.status());
    console.log(lib, step, JSON.stringify({ output: r.output, frame: r.frame, presented: r.presented, frames: r.framesProcessed, sharpness: r.sharpness }), errors.length ? errors : '');
  }
  await page.close();
}
await browser.close();
