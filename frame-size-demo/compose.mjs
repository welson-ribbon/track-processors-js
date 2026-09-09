import { chromium } from '/Users/welson/Dev/Ribbon/mono/web/node_modules/playwright/index.mjs';
const O = '/private/tmp/claude-501/-Users-welson-Dev-Ribbon/3d652999-265d-438e-a825-c69c8e115da0/scratchpad/demo-out';
const PAIRS = [
  ['A-canvas-path-transposed-settings-1-settle', 'Before (main): canvas path, track settings say 480x640 while frames are 640x480 (an upright iPhone)', 'After (this PR): same start'],
  ['B-canvas-path-rotation-2-rotate', 'Before (main): canvas path, source rotated 640x480 → 480x640 mid-call', 'After (this PR): same rotation'],
  ['C-default-path-rotation-2-rotate', 'Before (main): MediaStreamTrackProcessor path, source rotated 640x480 → 480x640 mid-call', 'After (this PR): same rotation'],
];
const html = (name, b, a) => `<!doctype html><body style="margin:0;background:#fff;font:15px/1.3 system-ui">
<div id="pair" style="display:inline-block;padding:10px">
<div style="color:#b91c1c;font-weight:600;margin:0 0 6px">${b}</div><img src="file://${O}/main/${name}.png" style="display:block">
<div style="color:#15803d;font-weight:600;margin:14px 0 6px">${a}</div><img src="file://${O}/fix/${name}.png" style="display:block">
</div></body>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
for (const [name, b, a] of PAIRS) {
  await page.setContent(html(name, b, a));
  await page.waitForLoadState('networkidle');
  await page.locator('#pair').screenshot({ path: `${O}/pairs/${name}.png` });
  console.log('wrote', name);
}
await browser.close();
