// Standalone reproduction for mask/output size mismatches. No LiveKit server or camera needed: a canvas
// stands in for the camera and its captureStream() track goes through BackgroundProcessor.
//
//   ?path=canvas          force the canvas.captureStream() fallback path (what Safari uses)
//   ?settings=transposed  getSettings() reports the frame size swapped, like iOS in portrait, whose
//                         frames describe the unrotated sensor buffer
//   ?play=gated           HTMLMediaElement.play() rejects with NotAllowedError until the page is clicked,
//                         like WebKit outside a user gesture
//   ?subject=emoji        draw an emoji person instead of the vector figure
//   ?camera=real          use getUserMedia() instead of the synthetic camera (open the page on a phone over
//                         https, rotate the phone)
//   ?lib=main|fix         which build to load: lib-main.mjs (upstream main) or lib-fix.mjs (this branch)
import { LocalVideoTrack } from 'livekit-client';

const params = new URLSearchParams(location.search);
const lib = params.get('lib') === 'main' ? 'main' : 'fix';
const { BackgroundProcessor } = await import(lib === 'main' ? './lib-main.mjs' : './lib-fix.mjs');

const forceCanvasPath = params.get('path') === 'canvas';
const transposeSettings = params.get('settings') === 'transposed';
const gatePlay = params.get('play') === 'gated';
const subject = params.get('subject') ?? 'figure';
const realCamera = params.get('camera') === 'real';

if (forceCanvasPath) {
  for (const name of ['MediaStreamTrackProcessor', 'MediaStreamTrackGenerator']) {
    Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
  }
}

let gestureSeen = false;
if (gatePlay) {
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!gestureSeen) {
      return Promise.reject(new DOMException('play() requires a user gesture', 'NotAllowedError'));
    }
    return originalPlay.call(this);
  };
  window.addEventListener('pointerdown', () => { gestureSeen = true; });
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sourceVideo = $<HTMLVideoElement>('source');
const outputVideo = $<HTMLVideoElement>('output');

// ---- synthetic camera -------------------------------------------------------------------------
const cam = document.createElement('canvas');
let landscape = true;
const camSize = () => (landscape ? [640, 480] : [480, 640]);
[cam.width, cam.height] = camSize();
const ctx = cam.getContext('2d')!;

function drawFigure(w: number, h: number, t: number) {
  const m = Math.min(w, h);
  const cx = w / 2 + Math.sin(t / 900) * 10;
  // torso with a striped shirt (texture makes a blurred person visible)
  const torsoW = m * 0.5;
  const torsoTop = h * 0.62;
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath();
  ctx.roundRect(cx - torsoW / 2, torsoTop, torsoW, h - torsoTop + 40, m * 0.08);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#3b82f6';
  for (let y = torsoTop; y < h; y += 20) ctx.fillRect(cx - torsoW / 2, y, torsoW, 10);
  ctx.restore();
  // neck + head
  ctx.fillStyle = '#e0ac8b';
  ctx.fillRect(cx - m * 0.05, h * 0.52, m * 0.1, h * 0.12);
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.4, m * 0.14, m * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = '#3b2a20';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.4 - m * 0.1, m * 0.145, m * 0.1, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // eyes, brows, mouth
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx + s * m * 0.055, h * 0.39, m * 0.028, m * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(cx + s * m * 0.055, h * 0.39, m * 0.011, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + s * m * 0.055 - m * 0.03, h * 0.36, m * 0.06, m * 0.008);
  }
  ctx.strokeStyle = '#8b3a3a';
  ctx.lineWidth = m * 0.008;
  ctx.beginPath();
  ctx.arc(cx, h * 0.45, m * 0.045, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function drawCamera(t: number) {
  const [w, h] = camSize();
  // checkerboard background: sharp when unblurred, flat grey when blurred
  const cell = 12;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      ctx.fillStyle = ((x + y) / cell) % 2 === 0 ? '#d4d4d8' : '#71717a';
      ctx.fillRect(x, y, cell, cell);
    }
  }
  if (subject === 'emoji') {
    ctx.font = `${Math.min(w, h) * 0.7}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧑‍💼', w / 2 + Math.sin(t / 900) * 10, h * 0.55);
  } else {
    drawFigure(w, h, t);
  }
  // corner marker so the frame shape is obvious at a glance
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(w - 40, 12, 28, 28);
  ctx.fillStyle = '#111';
  ctx.font = '16px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${w}x${h}`, 12, 12);
}

let t0 = performance.now();
let mediaTrack: MediaStreamTrack;
const switchTo = (target: string) => {
  const next = new URLSearchParams(location.search);
  next.set('lib', target);
  return `${location.pathname}?${next}`;
};
$('title').textContent = lib === 'main' ? 'BEFORE: livekit main' : 'AFTER: fix branch';
$('title').style.color = lib === 'main' ? '#b91c1c' : '#15803d';
$('links').innerHTML = `<a href="${switchTo('main')}">before (main)</a> · <a href="${switchTo('fix')}">after (fix)</a>`;
if (realCamera) {
  $('rotate').hidden = true;
  const start = $('start');
  start.hidden = false;
  await new Promise<void>((resolve) => start.addEventListener('click', () => resolve(), { once: true }));
  start.hidden = true;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  });
  mediaTrack = stream.getVideoTracks()[0];
} else {
  setInterval(() => drawCamera(performance.now() - t0), 1000 / 30);
  drawCamera(0);
  mediaTrack = cam.captureStream(30).getVideoTracks()[0];
}
if (transposeSettings) {
  const originalGetSettings = mediaTrack.getSettings.bind(mediaTrack);
  mediaTrack.getSettings = () => {
    const s = originalGetSettings();
    return { ...s, width: s.height, height: s.width };
  };
}
sourceVideo.srcObject = new MediaStream([mediaTrack]);

// ---- processor ---------------------------------------------------------------------------------
let framesProcessed = 0;
const processor = BackgroundProcessor({
  mode: 'background-blur',
  blurRadius: 10,
  onFrameProcessed: () => framesProcessed++,
});
const track = new LocalVideoTrack(mediaTrack, undefined, true);
track.attach(outputVideo);
track.setProcessor(processor).catch((e) => console.error('setProcessor failed', e));

$('rotate').addEventListener('click', () => rotate());
function rotate() {
  landscape = !landscape;
  [cam.width, cam.height] = camSize();
  drawCamera(performance.now() - t0);
}

// ---- status ------------------------------------------------------------------------------------
const probe = document.createElement('canvas');
const probeCtx = probe.getContext('2d', { willReadFrequently: true })!;
// mean absolute gradient of a 24x24 patch: high on the checkerboard/stripes, low where blurred
function sharpness(fx: number, fy: number) {
  const w = outputVideo.videoWidth;
  const h = outputVideo.videoHeight;
  if (!w || !h) return 0;
  probe.width = w;
  probe.height = h;
  probeCtx.drawImage(outputVideo, 0, 0, w, h);
  const size = 24;
  const x0 = Math.round(fx * w - size / 2);
  const y0 = Math.round(fy * h - size / 2);
  const d = probeCtx.getImageData(x0, y0, size, size).data;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const i = (y * size + x) * 4;
      const r = (i2: number) => (d[i2] + d[i2 + 1] + d[i2 + 2]) / 3;
      sum += Math.abs(r(i) - r(i + 4)) + Math.abs(r(i) - r(i + size * 4));
      n++;
    }
  }
  return Math.round(sum / n);
}

function fmt(o: { width?: number; height?: number } | undefined | null) {
  return o && o.width ? `${o.width}x${o.height}` : '-';
}

function status() {
  const p = processor as any;
  const dummy = p.sourceDummy as HTMLVideoElement | undefined;
  const bg = [sharpness(0.1, 0.1), sharpness(0.9, 0.1), sharpness(0.1, 0.9), sharpness(0.9, 0.9)];
  return {
    path: p.displayCanvas ? 'canvas (fallback)' : 'MediaStreamTrackProcessor',
    settings: fmt(mediaTrack.getSettings()),
    setupSize: dummy ? `${dummy.width}x${dummy.height}` : '-',
    presented: dummy ? `${dummy.videoWidth}x${dummy.videoHeight}` : '-',
    frame: fmt(p.transformer?.canvas),
    output: fmt(p.displayCanvas ?? p.processedTrack?.getSettings?.()),
    outputVideo: `${outputVideo.videoWidth}x${outputVideo.videoHeight}`,
    dummyPaused: dummy?.paused,
    framesProcessed,
    sharpness: { face: sharpness(0.5, 0.4), shirt: sharpness(0.5, 0.8), background: bg },
  };
}

setInterval(() => {
  const s = status();
  $('mode').textContent = `${forceCanvasPath ? 'canvas path' : 'default path'}${transposeSettings ? ', transposed settings' : ''}${gatePlay ? ', play() gated' : ''}${realCamera ? ', real camera' : ''}`;
  $('status').textContent = JSON.stringify(s, null, 2);
}, 250);

(window as any).__demo = { status, rotate, processor, track };
