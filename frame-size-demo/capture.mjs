// Drives example/frame-size-demo.html in headless Chromium against two checkouts of the library and
// captures screenshots + status for each scenario step.
//   node capture.mjs            -> runs both "main" and "fix"
import { chromium } from '/Users/welson/Dev/Ribbon/mono/web/node_modules/playwright/index.mjs';
import { createServer } from '/private/tmp/claude-501/-Users-welson-Dev-Ribbon/3d652999-265d-438e-a825-c69c8e115da0/scratchpad/track-processors-js/node_modules/vite/dist/node/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const S = '/private/tmp/claude-501/-Users-welson-Dev-Ribbon/3d652999-265d-438e-a825-c69c8e115da0/scratchpad';
const VERSIONS = { main: { root: `${S}/tp-main`, port: 8081 }, fix: { root: `${S}/track-processors-js`, port: 8080 } };
const SCENARIOS = [
  { name: 'A-canvas-path-transposed-settings', query: 'path=canvas&settings=transposed', steps: ['settle', 'rotate', 'rotate'] },
  { name: 'B-canvas-path-rotation', query: 'path=canvas', steps: ['settle', 'rotate', 'rotate'] },
  { name: 'C-default-path-rotation', query: '', steps: ['settle', 'rotate'] },
  { name: 'D-canvas-path-play-refused', query: 'path=canvas&play=gated', steps: ['wait', 'click', 'wait'] },
];
const only = process.argv[2]; const onlyScenario = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = `${S}/demo-out`;
mkdirSync(OUT, { recursive: true });
const results = {};

async function waitForFrames(page, min, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const n = await page.evaluate(() => window.__demo?.status().framesProcessed ?? 0);
    if (n >= min) return n;
    await sleep(250);
  }
  return -1;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const [version, { root, port }] of Object.entries(VERSIONS)) {
  if (only && only !== version) continue;
  const server = await createServer({ configFile: false, root: `${root}/example`, logLevel: 'error', server: { port, strictPort: true, fs: { strict: false } } });
  await server.listen();
  mkdirSync(`${OUT}/${version}`, { recursive: true });
  results[version] = {};
  for (const sc of SCENARIOS) { if (onlyScenario && !sc.name.startsWith(onlyScenario)) continue;
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
    await page.goto(`http://localhost:${port}/frame-size-demo.html?${sc.query}`);
    results[version][sc.name] = [];
    let baseline = 0;
    for (let i = 0; i < sc.steps.length; i++) {
      const step = sc.steps[i];
      if (step === 'settle') { await waitForFrames(page, 40); await sleep(1500); }
      if (step === 'rotate') { baseline = await page.evaluate(() => window.__demo.status().framesProcessed); await page.click('#rotate'); await waitForFrames(page, baseline + 30); await sleep(1500); }
      if (step === 'click') { await page.mouse.click(600, 30); await sleep(3000); }
      if (step === 'wait') { await sleep(3000); }
      const status = await page.evaluate(() => window.__demo.status());
      const file = `${OUT}/${version}/${sc.name}-${i + 1}-${step}.png`;
      await page.locator('#row').screenshot({ path: file });
      results[version][sc.name].push({ step, status, file });
      console.log(version, sc.name, i + 1, step, JSON.stringify(status));
    }
    if (errors.length) console.log(version, sc.name, 'console/page errors:', errors.slice(0, 6));
    results[version][sc.name].errors = errors;
    await page.close();
  }
  await server.close();
}
await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
