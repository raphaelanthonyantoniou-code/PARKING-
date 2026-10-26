// Try a cut on your own head. The visitor takes a selfie or picks a photo;
// MediaPipe finds the face and the hair on the device, and the fade is
// applied to the visitor's own hair: the sides go from their hair through
// stubble to skin, and hair standing out past the head is trimmed away.
// The photo never leaves the device.

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
const MAX_SIDE = 960;

// Fade height above the top of the ear, and the blend width, as a share of
// the face height (chin to hairline).
const FADE_AT = { low: 0.1, mid: 0.22, high: 0.34, skin: 0.22 };
const BLEND = 0.13;

let models = null;
async function loadModels() {
  if (models) return models;
  models = (async () => {
    const vision = await import(BASE + 'vision_bundle.mjs');
    const files = { wasmLoaderPath: BASE + 'wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + 'wasm/vision_wasm_internal.wasm' };
    const face = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: BASE + 'face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 1,
    });
    const hair = await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: BASE + 'hair_segmenter.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
    });
    return { face, hair };
  })();
  try {
    return await models;
  } catch (err) {
    models = null;
    throw err;
  }
}

// Outline of the face in the Face Landmarker mesh.
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix = (a, b, t) => a + (b - a) * t;
// How much of the scalp hair of a given length covers: 0 is bare skin.
const cover = (mm) => (mm <= 0 ? 0 : Math.min(1, 0.4 + 0.6 * Math.min(1, mm / 7) ** 0.65));
// Cheap repeatable noise for hair grain.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function median(values) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[values.length >> 1];
}

// Everything that does not change when the visitor picks another cut.
async function analyse(img) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const { face, hair } = await loadModels();

  const found = face.detect(canvas).faceLandmarks?.[0];
  if (!found) throw new Error('no-face');
  const P = found.map((p) => [p.x * W, p.y * H]);

  const seg = hair.segment(canvas);
  const masks = seg.confidenceMasks || [];
  const m = masks[masks.length - 1];
  const raw = m.getAsFloat32Array();
  const mw = m.width, mh = m.height;
  // Resample the hair mask to the photo size.
  const mask = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const my = Math.min(mh - 1, Math.floor(y * mh / H));
    for (let x = 0; x < W; x++) mask[y * W + x] = raw[my * mw + Math.min(mw - 1, Math.floor(x * mw / W))];
  }
  seg.close?.();

  // A frame on the head: u across, v up, origin at brow level between the
  // edges of the face, so it holds up when the head is tilted.
  const L = P[234], R = P[454];
  const roll = Math.atan2(R[1] - L[1], R[0] - L[0]);
  const ex = [Math.cos(roll), Math.sin(roll)], up = [Math.sin(roll), -Math.cos(roll)];
  const mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
  const brow = [(P[105][0] + P[334][0]) / 2, (P[105][1] + P[334][1]) / 2];
  const lift = (brow[0] - mid[0]) * up[0] + (brow[1] - mid[1]) * up[1];
  const O = [mid[0] + up[0] * lift, mid[1] + up[1] * lift];
  const faceH = Math.hypot(P[10][0] - P[152][0], P[10][1] - P[152][1]);
  const halfW = Math.hypot(R[0] - L[0], R[1] - L[1]) / 2;

  // Hair falling over the face (a fringe) is top hair, not sides: mark the
  // face so the fade leaves it alone.
  const oc = document.createElement('canvas');
  oc.width = W; oc.height = H;
  const og = oc.getContext('2d', { willReadFrequently: true });
  og.filter = `blur(${Math.max(2, Math.round(faceH * 0.02))}px)`;
  og.fillStyle = '#fff';
  og.beginPath();
  FACE_OVAL.forEach((i, n) => (n ? og.lineTo(P[i][0], P[i][1]) : og.moveTo(P[i][0], P[i][1])));
  og.closePath();
  og.fill();
  const ovalPx = og.getImageData(0, 0, W, H).data;
  const oval = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) oval[i] = ovalPx[i * 4 + 3] / 255;

  const img0 = cx.getImageData(0, 0, W, H);
  const px = img0.data;
  const sample = (pts, r) => {
    const rs = [], gs = [], bs = [];
    for (const [x0, y0] of pts) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(x0 + dx), y = Math.round(y0 + dy);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
      }
    }
    return [median(rs), median(gs), median(bs)];
  };
  // Skin from the forehead and temples, hair from the visitor's own hair.
  const skin = sample([P[151], P[9], P[108], P[337]].map((p) => [p[0], p[1]]), 3);
  const hr = [], hg = [], hb = [];
  for (let i = 0; i < W * H; i += 3) if (mask[i] > 0.8) { hr.push(px[i * 4]); hg.push(px[i * 4 + 1]); hb.push(px[i * 4 + 2]); }
  const hairCol = hr.length > 50 ? [median(hr), median(hg), median(hb)] : [34, 26, 20];

  // Frame the head for display: a 4:5 crop centred a little above the eyes.
  const cw = Math.min(W, Math.round(faceH * 1.9)), ch = Math.min(H, Math.round(cw * 1.25));
  const ccx = O[0] + up[0] * faceH * 0.18, ccy = O[1] + up[1] * faceH * 0.18;
  const crop = {
    x: Math.round(Math.min(Math.max(0, ccx - cw / 2), W - cw)),
    y: Math.round(Math.min(Math.max(0, ccy - ch * 0.45), H - ch)),
    w: cw, h: ch,
  };

  return { W, H, img0, mask, oval, O, ex, up, faceH, halfW, skin, hairCol, crop };
}

// Paints the chosen cut onto a copy of the photo.
function render(A, cut, out) {
  const { W, H, img0, mask, oval, O, ex, up, faceH: f, halfW } = A;
  const src = img0.data;
  const res = new ImageData(new Uint8ClampedArray(src), W, H);
  const dst = res.data;

  const a = halfW * 1.13;          // skull half width, just above the ears
  const b = 0.8 * f;               // skull height above the brows
  const pxPerMm = (2 * a) / 150;   // a head is about 15 cm across
  const ridge = 0.42 * f;          // where the sides turn into the top
  const D = FADE_AT[cut.fade] * f;
  const b0 = D - BLEND * f * 0.8, b1 = D + BLEND * f * 0.2;
  const baseMm = cut.fade === 'skin' ? 0 : 0.5;
  const sideLen = (h) => (h >= b1 ? cut.guard : h <= b0 ? baseMm : mix(baseMm, cut.guard, smooth((h - b0) / (b1 - b0))));
  const topMm = cut.keepTop ? Infinity : cut.top * 10;
  const [sr, sg, sb] = A.skin, [hr, hg, hb] = A.hairCol;

  // Only the area around the head needs work.
  const corners = [[-1.9 * a, -0.5 * f], [1.9 * a, -0.5 * f], [-1.9 * a, b + 0.9 * f], [1.9 * a, b + 0.9 * f]]
    .map(([u, v]) => [O[0] + ex[0] * u + up[0] * v, O[1] + ex[1] * u + up[1] * v]);
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));

  // Background behind trimmed hair: walk outward from the middle of the head
  // until the hair ends and borrow the colour there.
  const C = [O[0] + up[0] * 0.15 * f, O[1] + up[1] * 0.15 * f];
  function behind(x, y) {
    let dx = x - C[0], dy = y - C[1];
    const n = Math.hypot(dx, dy) || 1;
    dx /= n; dy /= n;
    for (let s = 2; s < 600; s += 2) {
      const qx = Math.round(x + dx * s), qy = Math.round(y + dy * s);
      if (qx < 0 || qy < 0 || qx >= W || qy >= H) break;
      if (mask[qy * W + qx] < 0.08) {
        const ax = Math.min(W - 1, Math.max(0, Math.round(qx + dx * 4))), ay = Math.min(H - 1, Math.max(0, Math.round(qy + dy * 4)));
        const i = (ay * W + ax) * 4;
        return [src[i], src[i + 1], src[i + 2]];
      }
    }
    return null;
  }

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = y * W + x;
      const hm = mask[k];
      if (hm < 0.12) continue;
      const dxp = x - O[0], dyp = y - O[1];
      const u = dxp * ex[0] + dyp * ex[1], v = dxp * up[0] + dyp * up[1];
      const au = Math.abs(u);
      // How far outside the skull this pixel is, in pixels.
      let out;
      if (v <= 0) out = au - a;
      else {
        const rho = Math.hypot(u / a, v / b);
        out = (rho - 1) * Math.hypot(u, v) / Math.max(rho, 1e-6);
      }
      // Sides and back below the ridge take the fade; above it, the top.
      const side = smooth((au / a - 0.42) / 0.42) * smooth((ridge - v) / (0.16 * f)) * (1 - oval[k]);
      const sideMm = sideLen(v + 0.02 * f);
      const mm = side >= 0.999 ? sideMm : topMm === Infinity ? (side > 0.001 ? mix(60, sideMm, side) : Infinity) : mix(topMm, sideMm, side);
      if (mm === Infinity || mm > 60) continue;

      const i = k * 4;
      const or = src[i], og = src[i + 1], ob = src[i + 2];
      const keep = smooth((hm - 0.12) / 0.5);
      const thick = mm * pxPerMm * 0.8 + 0.6;
      let r, g, bl;
      if (out > thick) {
        // Hair that would be cut off: show what is behind it.
        const bg = behind(x, y);
        if (!bg) continue;
        [r, g, bl] = bg;
      } else {
        // On the scalp: skin, stubble or short hair, lit like the head.
        const c = cover(mm);
        const shade = 0.98 - 0.2 * smooth((au / a - 0.6) / 0.5) - 0.08 * smooth(v / b);
        const grain = hash(x, y), streak = 0.5 * hash(x + Math.round(y * 0.35), (y / 3) | 0) + 0.5 * hash((x / 2) | 0, (y / 2) | 0);
        // Stubble shows as fine dark dots on bare skin; once the hair covers,
        // the scalp only shows through as a softer tone.
        const dots = c < 0.75 ? (grain < c ? 1 : 0.35) : 0.88 + 0.12 * grain;
        const tone = 0.7 + 0.45 * streak;
        // Their own hair where it is still long enough, otherwise its colour
        // laid down short with a grain.
        const own = smooth((mm - 10) / 20);
        const hR = mix(hr * tone, or, own), hG = mix(hg * tone, og, own), hB = mix(hb * tone, ob, own);
        const sR = sr * shade, sG = sg * shade, sB = sb * shade;
        const d = Math.min(1, c * dots * 1.05);
        r = mix(sR, hR, d); g = mix(sG, hG, d); bl = mix(sB, hB, d);
        // Soft edge where short hair meets the background.
        const edge = smooth(thick - out + 0.5);
        if (edge < 1) {
          const bg = behind(x, y);
          if (bg) { r = mix(bg[0], r, edge); g = mix(bg[1], g, edge); bl = mix(bg[2], bl, edge); }
        }
      }
      dst[i] = mix(or, r, keep);
      dst[i + 1] = mix(og, g, keep);
      dst[i + 2] = mix(ob, bl, keep);
    }
  }
  show(res, A.crop, out);
}

// Draws the head crop of a full-size image into a display canvas.
function show(data, crop, out) {
  const full = document.createElement('canvas');
  full.width = data.width; full.height = data.height;
  full.getContext('2d').putImageData(data, 0, 0);
  out.width = crop.w; out.height = crop.h;
  out.getContext('2d').drawImage(full, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
}

/* -------------------------------------------------------------------- UI */

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...kids.flat().filter((k) => k != null));
  return node;
}

let dialog = null;

export function openTryOn({ state, FADES, GUARDS, PRESETS, onBook }) {
  if (dialog) { dialog.sync(state); dialog.node.showModal(); return; }
  const cut = { fade: state.fade, guard: state.guard, top: state.top, keepTop: true };
  let analysed = null, busy = false, stream = null;

  const status = el('p', { class: 'to-status', 'aria-live': 'polite' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sx-sr', id: 'to-file' });
  const selfie = el('input', { type: 'file', accept: 'image/*', capture: 'user', class: 'sx-sr', id: 'to-selfie' });
  const video = el('video', { class: 'to-video', playsinline: true, muted: true, autoplay: true });
  const snap = el('button', { type: 'button', class: 'btn btn-neon to-snap' }, 'Take the photo');
  const camWrap = el('div', { class: 'to-cam', hidden: true }, video, snap);
  const startCam = el('button', { type: 'button', class: 'btn btn-neon' }, 'Take a selfie');
  const upload = el('label', { class: 'btn btn-ghost', for: 'to-file' }, 'Upload a photo');
  const pick = el('div', { class: 'to-pick' },
    el('p', { class: 'to-pick-title', text: 'See the cut on your own head.' }),
    el('p', { class: 'to-pick-tips', text: 'Face the camera, keep your hair in the shot and use good light. A plain wall behind you works best.' }),
    el('div', { class: 'to-pick-btns' }, startCam, upload),
    el('p', { class: 'to-private', text: 'Your photo stays on your device. Nothing is uploaded.' }),
    camWrap);

  const result = el('canvas', { class: 'to-result' });
  const before = el('canvas', { class: 'to-before' });
  const handle = el('div', { class: 'to-handle', 'aria-hidden': 'true' }, el('span', { text: 'Before' }), el('span', { text: 'After' }));
  const range = el('input', { type: 'range', min: 0, max: 100, value: 50, class: 'to-compare', 'aria-label': 'Compare before and after' });
  const view = el('div', { class: 'to-view', hidden: true, style: '--cut:50%' }, result, before, handle, range);

  const presetRow = el('div', { class: 'fl-presets to-presets' },
    PRESETS.map((p, i) => el('button', { type: 'button', class: 'fl-preset', 'data-preset': i, text: p.label })));
  const fadeRow = el('div', { class: 'fl-seg' },
    Object.entries(FADES).map(([k, f]) => el('button', { type: 'button', class: 'fl-seg-btn', 'data-fade': k, text: f.label })));
  const guardRow = el('div', { class: 'fl-guards' },
    GUARDS.map((g, i) => el('button', { type: 'button', class: 'fl-guard', 'data-guard': i }, el('b', { text: g.label }), el('span', { text: `${g.mm} mm` }))));
  const keepTop = el('input', { type: 'checkbox', checked: true, id: 'to-keep' });
  const topRange = el('input', { type: 'range', min: 1, max: 10, step: 1, value: cut.top, class: 'fl-range', 'aria-label': 'Length on top', disabled: true });
  const topOut = el('output', { class: 'fl-out' });
  const controls = el('div', { class: 'to-controls', hidden: true },
    el('div', { class: 'fl-field' }, el('p', { class: 'fl-label', text: 'Start from a classic' }), presetRow),
    el('div', { class: 'fl-field' }, el('p', { class: 'fl-label', text: 'Fade height' }), fadeRow),
    el('div', { class: 'fl-field' }, el('p', { class: 'fl-label', text: 'Guard on the sides' }), guardRow),
    el('div', { class: 'fl-field' },
      el('div', { class: 'fl-label-row' }, el('p', { class: 'fl-label', text: 'Length on top' }), topOut),
      el('label', { class: 'to-keep', for: 'to-keep' }, keepTop, 'Keep my own top'),
      topRange),
    el('div', { class: 'to-actions' },
      el('button', { type: 'button', class: 'btn btn-brass', 'data-to-book': true }, 'Book this cut'),
      el('button', { type: 'button', class: 'btn btn-ghost', 'data-to-save': true }, 'Save picture'),
      el('button', { type: 'button', class: 'btn btn-ghost', 'data-to-new': true }, 'New photo')));

  const close = el('button', { type: 'button', class: 'to-close', 'aria-label': 'Close' }, '×');
  const node = el('dialog', { class: 'to', 'aria-labelledby': 'to-title' },
    el('div', { class: 'to-inner' },
      el('header', { class: 'to-head' },
        el('div', {}, el('p', { class: 'eyebrow', text: 'Fade lab' }), el('h2', { class: 'to-title', id: 'to-title', text: 'Try it on' })),
        close),
      el('div', { class: 'to-body' }, el('div', { class: 'to-stage' }, pick, view, status), controls),
      file, selfie));
  document.body.append(node);

  const say = (t) => { status.textContent = t || ''; };
  function sync(s) {
    if (s) Object.assign(cut, { fade: s.fade, guard: s.guard, top: s.top });
    fadeRow.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fade === cut.fade)));
    guardRow.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.guard === cut.guard)));
    presetRow.querySelectorAll('button').forEach((b) => {
      const p = PRESETS[+b.dataset.preset];
      b.setAttribute('aria-pressed', String(p.fade === cut.fade && p.guard === cut.guard));
    });
    topRange.value = String(cut.top);
    topRange.disabled = cut.keepTop;
    topOut.textContent = cut.keepTop ? 'Yours' : `${cut.top} cm`;
    draw();
  }
  let pending = 0;
  function draw() {
    if (!analysed) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      render(analysed, { fade: cut.fade, guard: GUARDS[cut.guard].mm, top: cut.top, keepTop: cut.keepTop }, result);
    });
  }

  function stopCam() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    camWrap.hidden = true;
  }

  async function use(img) {
    if (busy) return;
    busy = true;
    stopCam();
    say('Finding your face and hair…');
    try {
      analysed = await analyse(img);
      show(analysed.img0, analysed.crop, before);
      pick.hidden = true;
      view.hidden = false;
      controls.hidden = false;
      say('');
      sync();
    } catch (err) {
      console.warn('Try-on:', err);
      say(err.message === 'no-face'
        ? 'We could not find a face. Try a photo looking straight at the camera with your hair in the shot.'
        : 'The mirror would not load on this device. Try another browser.');
    } finally {
      busy = false;
    }
  }

  async function fromFile(f) {
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { use(img); URL.revokeObjectURL(url); };
    img.onerror = () => { say('That file is not a photo we can read.'); URL.revokeObjectURL(url); };
    img.src = url;
  }
  file.addEventListener('change', () => fromFile(file.files[0]));
  selfie.addEventListener('change', () => fromFile(selfie.files[0]));

  startCam.addEventListener('click', async () => {
    loadModels().catch(() => {});
    if (!navigator.mediaDevices?.getUserMedia) { selfie.click(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      video.srcObject = stream;
      camWrap.hidden = false;
      say('');
    } catch {
      selfie.click();
    }
  });
  snap.addEventListener('click', () => {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d');
    // Keep the photo the way the visitor saw it in the preview.
    g.translate(c.width, 0); g.scale(-1, 1);
    g.drawImage(video, 0, 0);
    use(c);
  });
  upload.addEventListener('click', () => loadModels().catch(() => {}));

  range.addEventListener('input', () => view.style.setProperty('--cut', `${range.value}%`));
  presetRow.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const p = PRESETS[+b.dataset.preset];
    Object.assign(cut, { fade: p.fade, guard: p.guard, top: p.top });
    sync();
  });
  fadeRow.addEventListener('click', (e) => { const b = e.target.closest('[data-fade]'); if (b) { cut.fade = b.dataset.fade; sync(); } });
  guardRow.addEventListener('click', (e) => { const b = e.target.closest('[data-guard]'); if (b) { cut.guard = +b.dataset.guard; sync(); } });
  keepTop.addEventListener('change', () => { cut.keepTop = keepTop.checked; sync(); });
  topRange.addEventListener('input', () => { cut.top = +topRange.value; sync(); });

  node.addEventListener('click', (e) => {
    if (e.target === node) node.close();
    if (e.target.closest('[data-to-new]')) {
      analysed = null; view.hidden = true; controls.hidden = true; pick.hidden = false; file.value = ''; selfie.value = '';
    }
    if (e.target.closest('[data-to-save]')) {
      const a = el('a', { download: 'my-fade.png', href: result.toDataURL('image/png') });
      a.click();
    }
    if (e.target.closest('[data-to-book]')) { node.close(); onBook?.(cut); }
  });
  close.addEventListener('click', () => node.close());
  node.addEventListener('close', stopCam);

  dialog = { node, sync: (s) => sync(s), use };
  // Testing hook: lets a script hand in a photo without the file picker.
  window.__tryon = { use, cut, sync };
  sync();
  node.showModal();
}
