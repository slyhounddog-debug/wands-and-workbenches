// StudioIntro.js — the "PARDON MY GAMES / STUDIO PRESENTS..." splash that plays before the start menu, per
// direct request. Pure decoration: reads no game state, writes none, touches no physics, and runs on its own
// rAF loop (main.js stops rendering the world while it is up, see studioIntroIsActive).
//
// Cheapness, per direct request to keep the game's optimizations intact: the thirteen bubble letters, the
// "STUDIO PRESENTS..." line and every particle sprite are baked ONCE into small offscreen canvases (outline,
// extrusion, gradient and gloss are all pre-composited), and the static backdrop (pixel frame, starfield, pixel
// gamepads) is one baked full-size canvas, so a frame is ~one drawImage per letter plus a fixed-size particle
// pool recycled in place (no ctx.filter, no per-frame gradients). The loop, the resize debounce and the
// click-swallow timer are all cleared the instant it ends, skipped or not.
//
// Timeline (all seconds from the moment it opens, tunable in Config.js's STUDIO_INTRO_*):
//   Phase 1  letters PARDON -> MY -> GAMES launch one after another and fly in from off-screen with a bouncy
//            overshoot, squashing once as they land (each landing plays the letter-bump sound);
//   Phase 2  once a word's last letter has landed, that word hovers on its own phase-offset wave;
//   Phase 3  once the title has settled, "STUDIO PRESENTS..." slides up character by character, the sparkle burst
//            goes off and the bubbles/stars/hearts start drifting; then the finished screen holds for
//            STUDIO_INTRO_HOLD_S and moves on to the start menu by itself.
// A click/tap or any key at any point skips straight to the menu.

import {
  STUDIO_INTRO_START_DELAY_S, STUDIO_INTRO_LETTER_STAGGER_S, STUDIO_INTRO_BLIP_START_S, STUDIO_INTRO_BLIP_INTERVAL_S, STUDIO_INTRO_LETTER_FLY_S, STUDIO_INTRO_FLOAT_RAMP_S,
  STUDIO_INTRO_FLOAT_AMP_PX, STUDIO_INTRO_FLOAT_SPEED, STUDIO_INTRO_FLOAT_WORD_PHASE, STUDIO_INTRO_PRESENTS_DELAY_S,
  STUDIO_INTRO_PRESENTS_CHAR_STAGGER_S, STUDIO_INTRO_PRESENTS_CHAR_FADE_S, STUDIO_INTRO_HOLD_S,
  STUDIO_INTRO_BURST_COUNT, STUDIO_INTRO_AMBIENT_COUNT,
} from './IntroConfig.js';
import { playIntroLetterBump, playStudioIntro, stopStudioIntro } from './IntroSound.js';

const TITLE_FONT_STACK = "'Fredoka', 'Baloo 2', 'Segoe UI', system-ui, sans-serif";
const PIXEL_FONT_STACK = "'Press Start 2P', 'Courier New', monospace";
const glyphFont = (px) => `700 ${px}px ${TITLE_FONT_STACK}`;
const pixelFont = (px) => `${px}px ${PIXEL_FONT_STACK}`;

// ---- Look ----
const OUTLINE_RATIO = 0.062; // thick dark outline, relative to the title font size
const RIM_RATIO = 0.03; // thin neon rim around the outline
const EXTRUDE_RATIO = 0.07; // how far the dark outline is stacked downward for the chunky 3D lip
const OUTLINE_DARK = '#1c0a45';
const OUTLINE_DEEP = '#0d0426';
const RIM_STOPS = [[0, '#5ff4ff'], [0.5, '#ffe65e'], [1, '#ff6bd6']];
const PARDON_FILL = [[0, '#9d4dff'], [0.5, '#c63bff'], [1, '#ff3fd0']];
const MY_FILLS = [[[0, '#ff6fd0'], [0.55, '#ff3fb4'], [1, '#ff8a52']], [[0, '#fff58a'], [0.55, '#ffe040'], [1, '#ffb52e']]];
const GAMES_FILL = [[0, '#fff35e'], [0.45, '#7dffa6'], [1, '#27e8ff']];
const WORDS = [
  { text: 'PARDON', line: 0, fills: [PARDON_FILL], from: 'top' },
  { text: 'MY', line: 1, fills: MY_FILLS, from: 'left' },
  { text: 'GAMES', line: 1, fills: [GAMES_FILL], from: 'bottom' },
];
const LETTER_ROT_DEG = [-4, 3, -2, 4, -3, 2, -5, 3, -2, 4, -3, 2, -4]; // each landed letter sits a touch off-level, for the bubbly look
const LETTER_DY = [0.03, -0.025, 0.02, -0.03, 0.025, -0.02, 0.03, -0.02, 0.025, -0.03, 0.02, -0.025, 0.03]; // fractions of the font size
const LETTER_TRACK_RATIO = 0.02;
const WORD_GAP_RATIO = 0.28; // the gap between MY and GAMES
const LINE_GAP_RATIO = 0.98;
const TITLE_WIDTH_FRACTION = 0.62; // the widest line may use this much of the screen width
const TITLE_HEIGHT_FRACTION = 0.5; // ...and both lines this much of the height
const TITLE_CENTER_Y_FRACTION = 0.42;
const PRESENTS_TEXT = 'STUDIO PRESENTS...';
const PRESENTS_STUDIO_CHARS = 6; // "STUDIO" is the pink-to-yellow part, the rest is cream
const PRESENTS_Y_FRACTION = 0.8;
const LETTER_OVERSHOOT = 2.2; // easeOutBack strength: how far a letter overshoots its spot before settling
const LETTER_FROM_SCALE = 1.9; // letters start this much bigger and zoom down into place
const LETTER_SPIN_RAD = 0.55;
const LAND_SQUASH_AMP = 0.16;
const LAND_SQUASH_DECAY = 6;
const LAND_SQUASH_FREQ = 28;
const LAND_SPARKS = 3;
const FADE_OUT_MS = 420; // the splash fades out over the start menu when it ends by itself (a skip is instant)
const SWALLOW_CLICK_MS = 500; // the click that follows the skipping pointerdown must not also press a menu plank

const SPARKLE_COLORS = ['#ffffff', '#9ff6ff', '#fff29a', '#ffa6ec'];
const PIXEL_COLORS = ['#ff4fd0', '#5ff0ff', '#ffe45e', '#b64cff', '#ffffff'];

// ---- State ----
let overlayEl = null;
let canvasEl = null;
let ctx = null;
let active = false;
let rafId = 0;
let resizeTimer = 0;
let swallowTimer = 0;
let fadeTimer = 0;
let onDoneCb = null;
let W = 0;
let H = 0;
let dpr = 1;
let u = 1; // screen scale relative to a 1080px-tall screen
let t = 0; // seconds since the splash opened
let lastNow = 0;
let burstFired = false;
let nextLanding = 0;
let nextBlip = 0;
let bakeCursor = 0;
let timeline = null;
let titleFs = 0;
let titleBox = { cx: 0, cy: 0, w: 0, h: 0 };
let bgSprite = null;
let presents = null;
let sprites = null;
const letters = [];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const easeOutCubic = (p) => 1 - (1 - p) * (1 - p) * (1 - p);
const easeOutBack = (p) => { const c3 = LETTER_OVERSHOOT + 1; const q = p - 1; return 1 + c3 * q * q * q + LETTER_OVERSHOOT * q * q; };
const smoothstep = (p) => p * p * (3 - 2 * p);

export function loadStudioIntroFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([document.fonts.load(glyphFont(100), 'PARDONMYGAMES'), document.fonts.load(pixelFont(16), PRESENTS_TEXT)]).catch(() => {});
}

export function studioIntroIsActive() {
  return active;
}

// ---- Baking ----
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return { c, g };
}

function stopsGradient(g, y0, y1, stops) {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  return grad;
}

// The enclosed holes of a glyph (A, R, D, O, P counters) as a solid dark layer: anything transparent that a
// flood-fill from the sprite's border can't reach. Painted over the rim/outline strokes and under the gradient
// fill so the narrow counters read dark instead of showing slivers of the neon rim.
function bakeCounters(ch, fs, w, h, cx, base) {
  // 1x scratch canvas whatever the device ratio is: the mask only has to be close, since the gradient fill is
  // drawn over every glyph edge, and a flood fill over full-resolution pixels was the slow part of the bake.
  const pw = Math.ceil(w);
  const ph = Math.ceil(h);
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = glyphFont(fs);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(ch, cx, base);
  const px = g.getImageData(0, 0, pw, ph);
  const seen = new Uint8Array(pw * ph);
  const stack = [];
  const push = (i) => { if (px.data[i * 4 + 3] < 128 && !seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < pw; x++) { push(x); push((ph - 1) * pw + x); }
  for (let y = 0; y < ph; y++) { push(y * pw); push(y * pw + pw - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % pw;
    if (x > 0) push(i - 1);
    if (x < pw - 1) push(i + 1);
    if (i >= pw) push(i - pw);
    if (i < pw * (ph - 1)) push(i + pw);
  }
  const hole = new Uint8Array(pw * ph);
  let any = false;
  for (let i = 0; i < pw * ph; i++) if (px.data[i * 4 + 3] < 128 && !seen[i]) { hole[i] = 1; any = true; }
  if (!any) return null;
  const dark = parseInt(OUTLINE_DARK.slice(1), 16);
  const out = g.createImageData(pw, ph);
  for (let y = 1; y < ph - 1; y++) {
    for (let x = 1; x < pw - 1; x++) {
      const i = y * pw + x;
      if (hole[i] || hole[i - 1] || hole[i + 1] || hole[i - pw] || hole[i + pw]) { // 1px dilation: the glyph fill covers the spill
        out.data[i * 4] = (dark >> 16) & 255;
        out.data[i * 4 + 1] = (dark >> 8) & 255;
        out.data[i * 4 + 2] = dark & 255;
        out.data[i * 4 + 3] = 255;
      }
    }
  }
  g.clearRect(0, 0, pw, ph);
  g.putImageData(out, 0, 0);
  return c;
}

// One bubble letter: neon rim, stacked dark extrusion, thick dark outline, gradient fill with a glossy
// highlight, bottom shade and two specular dots. The fill is composited in a scratch canvas
// with source-atop so the gloss only ever lands on the glyph itself.
function bakeLetter(ch, fs, fillStops) {
  const outline = fs * OUTLINE_RATIO;
  const rim = fs * RIM_RATIO;
  const ext = fs * EXTRUDE_RATIO;
  const pad = Math.ceil(outline + rim + ext + fs * 0.05);
  ctx.font = glyphFont(fs);
  const adv = ctx.measureText(ch).width;
  const w = Math.ceil(adv + pad * 2);
  const h = Math.ceil(fs * 0.9 + pad * 2);
  const { c, g } = makeCanvas(w, h);
  const base = pad + fs * 0.76;
  const capH = fs * 0.7;
  const capTop = base - capH;
  const cx = w / 2;
  g.font = glyphFont(fs);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = stopsGradient(g, capTop, base + ext, RIM_STOPS);
  g.lineWidth = (outline + rim) * 2;
  g.strokeText(ch, cx, base);
  g.strokeText(ch, cx, base + ext);
  g.strokeStyle = OUTLINE_DEEP;
  g.lineWidth = outline * 2;
  g.strokeText(ch, cx, base + ext);
  g.strokeText(ch, cx, base + ext * 0.5);
  g.strokeStyle = OUTLINE_DARK;
  g.strokeText(ch, cx, base);
  const counters = bakeCounters(ch, fs, w, h, cx, base);
  if (counters) g.drawImage(counters, 0, 0, w, h);

  const { c: tc, g: t2 } = makeCanvas(w, h);
  t2.font = glyphFont(fs);
  t2.textAlign = 'center';
  t2.textBaseline = 'alphabetic';
  t2.lineJoin = 'round';
  t2.fillStyle = stopsGradient(t2, capTop, base, fillStops);
  t2.fillText(ch, cx, base);
  t2.globalCompositeOperation = 'source-atop';
  const sheen = t2.createLinearGradient(0, capTop, 0, capTop + capH * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.7)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  t2.fillStyle = sheen;
  t2.fillRect(0, 0, w, h);
  const shade = t2.createLinearGradient(0, capTop + capH * 0.55, 0, base);
  shade.addColorStop(0, 'rgba(70,0,120,0)');
  shade.addColorStop(1, 'rgba(70,0,120,0.38)');
  t2.fillStyle = shade;
  t2.fillRect(0, 0, w, h);
  t2.globalCompositeOperation = 'source-over';
  t2.fillStyle = 'rgba(255,255,255,0.92)';
  t2.beginPath();
  t2.ellipse(cx - adv * 0.2, capTop + capH * 0.2, fs * 0.035, fs * 0.022, -0.5, 0, Math.PI * 2);
  t2.ellipse(cx - adv * 0.06, capTop + capH * 0.12, fs * 0.016, fs * 0.012, -0.5, 0, Math.PI * 2);
  t2.fill();
  g.drawImage(tc, 0, 0, w, h);
  return { c, w, h, ax: w / 2, ay: base - capH * 0.5, adv };
}

function mixHex(a, b, p) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - p) + ((pb >> shift) & 255) * p);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// "STUDIO PRESENTS..." baked as one strip so the slide-up reveal is one source-rect drawImage per character and
// the finished line is a single drawImage.
function bakePresents(px) {
  ctx.font = pixelFont(px);
  const widths = [...PRESENTS_TEXT].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const pad = Math.ceil(px * 0.4);
  const w = Math.ceil(total + pad * 2);
  const h = Math.ceil(px * 1.5 + pad);
  const { c, g } = makeCanvas(w, h);
  g.font = pixelFont(px);
  g.textBaseline = 'alphabetic';
  const xs = [];
  let x = pad;
  const base = px * 1.15;
  [...PRESENTS_TEXT].forEach((ch, i) => {
    xs.push(x);
    g.fillStyle = OUTLINE_DEEP;
    g.fillText(ch, x + px * 0.12, base + px * 0.12);
    g.fillStyle = i < PRESENTS_STUDIO_CHARS ? mixHex('#ff4fd0', '#ffe05a', i / (PRESENTS_STUDIO_CHARS - 1)) : '#fff8d8';
    g.fillText(ch, x, base);
    x += widths[i];
  });
  return { c, w, h, xs, widths, px };
}

function bakeSparkle(color) {
  const s = 44;
  const { c, g } = makeCanvas(s, s);
  const glow = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, s, s);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? s * 0.46 : s * 0.12;
    g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return { c, size: s };
}

const PIXEL_STAR_MAP = ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.'];
const PIXEL_HEART_MAP = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
function bakePixelMap(map, cell, color, hiColor, hx, hy) {
  const { c, g } = makeCanvas(map[0].length * cell, map.length * cell);
  g.fillStyle = color;
  map.forEach((row, y) => [...row].forEach((v, x) => { if (v === '#') g.fillRect(x * cell, y * cell, cell, cell); }));
  g.fillStyle = hiColor;
  g.fillRect(hx * cell, hy * cell, cell, cell);
  return { c, size: map[0].length * cell };
}

function bakeBubble() {
  const s = 44;
  const { c, g } = makeCanvas(s, s);
  g.fillStyle = 'rgba(170,230,255,0.12)';
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(160,228,255,0.85)';
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.3, Math.PI * 1.1, Math.PI * 1.45);
  g.stroke();
  return { c, size: s };
}

function bakeSprites() {
  const cell = Math.max(2, Math.round(3 * u));
  sprites = {
    sparkles: SPARKLE_COLORS.map(bakeSparkle),
    star: bakePixelMap(PIXEL_STAR_MAP, cell, '#ffd23a', '#fff1a0', 4, 2),
    heart: bakePixelMap(PIXEL_HEART_MAP, cell, '#ff4f8a', '#ffc2d6', 1, 1),
    bubble: bakeBubble(),
  };
}

function drawPixelGamepad(g, x, y, cell, body, dark) {
  const R = (cx, cy, w, h, color) => { g.fillStyle = color; g.fillRect(x + cx * cell, y + cy * cell, w * cell, h * cell); };
  R(1, 0, 14, 8, dark);
  R(0, 1, 16, 7, dark);
  R(2, 1, 12, 6, body);
  R(1, 2, 14, 5, body);
  R(3, 3, 3, 1, dark); R(4, 2, 1, 3, dark); // d-pad
  R(10, 2, 1, 1, '#5ff0ff'); R(12, 3, 1, 1, '#ff6bd6'); R(10, 4, 1, 1, '#7dff7d'); R(9, 3, 1, 1, '#ffe45e'); // face buttons
  R(7, 5, 2, 1, dark);
}

// Static backdrop: faint pixel starfield, a dithered band across the middle, a purple pixel frame and two corner gamepads.
function bakeBackdrop() {
  const { c, g } = makeCanvas(W, H);
  const px = Math.max(2, Math.round(3 * u));
  for (let i = 0; i < 150; i++) {
    g.globalAlpha = rand(0.25, 0.7);
    g.fillStyle = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
    g.fillRect(Math.floor(rand(0, W) / px) * px, Math.floor(rand(0, H) / px) * px, px, px);
  }
  g.globalAlpha = 0.07;
  g.fillStyle = '#d9b8ff';
  for (let y = H * 0.36; y < H * 0.64; y += px * 2) for (let x = (Math.round(y / px) % 2) * px; x < W; x += px * 4) g.fillRect(x, y, px, px);
  g.globalAlpha = 1;
  const lw = Math.max(3, Math.round(4 * u));
  const m = Math.round(Math.min(W, H) * 0.045);
  const n = lw * 3; // notched pixel corners
  g.strokeStyle = '#8b4fe0';
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(m + n, m); g.lineTo(W - m - n, m); g.lineTo(W - m - n, m + n * 0.4); g.lineTo(W - m, m + n * 0.4);
  g.lineTo(W - m, H - m - n); g.lineTo(W - m - n, H - m - n); g.lineTo(W - m - n, H - m);
  g.lineTo(m + n, H - m); g.lineTo(m + n, H - m - n * 0.4); g.lineTo(m, H - m - n * 0.4);
  g.lineTo(m, m + n); g.lineTo(m + n, m + n); g.closePath();
  g.stroke();
  const cell = Math.max(3, Math.round(5 * u));
  drawPixelGamepad(g, W - m - cell * 17, m + cell * 1.5, cell, '#4fc7f0', '#2b5f9e');
  drawPixelGamepad(g, m + cell * 1.5, H - m - cell * 10, cell, '#b8a2ee', '#6a4aa8');
  return c;
}

// ---- Layout ----
function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = overlayEl.clientWidth || window.innerWidth;
  H = overlayEl.clientHeight || window.innerHeight;
  u = H / 1080;
  canvasEl.width = Math.round(W * dpr);
  canvasEl.height = Math.round(H * dpr);

  ctx.font = glyphFont(100);
  const adv100 = (word) => [...word.text].reduce((sum, ch) => sum + ctx.measureText(ch).width + 100 * LETTER_TRACK_RATIO, 0);
  const line2At100 = adv100(WORDS[1]) + adv100(WORDS[2]) + 100 * WORD_GAP_RATIO;
  const widest100 = Math.max(adv100(WORDS[0]), line2At100);
  titleFs = Math.min((W * TITLE_WIDTH_FRACTION) / widest100 * 100, (H * TITLE_HEIGHT_FRACTION) / (LINE_GAP_RATIO + 1));
  const lineGap = titleFs * LINE_GAP_RATIO;
  const centerY = H * TITLE_CENTER_Y_FRACTION;
  const lineCY = [centerY - lineGap / 2, centerY + lineGap / 2];
  const track = titleFs * LETTER_TRACK_RATIO;

  ctx.font = glyphFont(titleFs);
  const wordAdv = WORDS.map((word) => [...word.text].map((ch) => ctx.measureText(ch).width)); // only measured here: the sprites themselves are baked a letter per frame (see update)
  const wordWidth = wordAdv.map((list) => list.reduce((sum, a) => sum + a + track, 0) - track);
  const gap = titleFs * WORD_GAP_RATIO;
  const line2W = wordWidth[1] + gap + wordWidth[2];
  const wordStartX = [(W - wordWidth[0]) / 2, (W - line2W) / 2, (W - line2W) / 2 + wordWidth[1] + gap];
  titleBox = { cx: W / 2, cy: centerY, w: Math.max(wordWidth[0], line2W), h: lineGap + titleFs * 0.7 };

  let k = 0;
  WORDS.forEach((word, wi) => {
    let x = wordStartX[wi];
    wordAdv[wi].forEach((adv, i) => {
      const L = letters[k];
      L.sprite = null;
      L.adv = adv;
      L.tx = x + adv / 2;
      L.ty = lineCY[word.line] + titleFs * LETTER_DY[k];
      const n = word.text.length;
      const spread = (i - (n - 1) / 2) * titleFs * 0.5;
      const reach = titleFs * 2.4;
      if (word.from === 'top') { L.ox = L.tx + spread; L.oy = -reach; }
      else if (word.from === 'bottom') { L.ox = L.tx + spread; L.oy = H + reach; }
      else { L.ox = -reach; L.oy = L.ty + spread; }
      x += adv + track;
      k++;
    });
  });

  const presentsPx = Math.round(Math.min(W * 0.024, H * 0.04));
  bakeCursor = 0;
  presents = bakePresents(presentsPx);
  bakeSprites();
  bgSprite = bakeBackdrop();
}

function buildTimeline() {
  let k = 0;
  letters.length = 0;
  const wordSettle = [];
  WORDS.forEach((word, wi) => {
    for (let i = 0; i < word.text.length; i++) {
      const launch = STUDIO_INTRO_START_DELAY_S + k * STUDIO_INTRO_LETTER_STAGGER_S;
      letters.push({ word: wi, idx: i, k, launch, land: launch + STUDIO_INTRO_LETTER_FLY_S, ch: word.text[i], fills: word.fills[i % word.fills.length], sprite: null, adv: 0, tx: 0, ty: 0, ox: 0, oy: 0 });
      wordSettle[wi] = launch + STUDIO_INTRO_LETTER_FLY_S;
      k++;
    }
  });
  const lastLand = wordSettle[WORDS.length - 1];
  const presentsStart = lastLand + STUDIO_INTRO_PRESENTS_DELAY_S;
  const presentsEnd = presentsStart + (PRESENTS_TEXT.length - 1) * STUDIO_INTRO_PRESENTS_CHAR_STAGGER_S + STUDIO_INTRO_PRESENTS_CHAR_FADE_S;
  return { wordSettle, presentsStart, presentsEnd, end: presentsEnd + STUDIO_INTRO_HOLD_S };
}

// ---- Particles ----
// A fixed pool recycled in place (landing sparks + the burst + the ambient drifters), nothing allocated per frame.
const POOL_SIZE = STUDIO_INTRO_BURST_COUNT + STUDIO_INTRO_AMBIENT_COUNT + LAND_SPARKS * 13 + 8;
const pool = Array.from({ length: POOL_SIZE }, () => ({ on: false, kind: 0, ci: 0, x: 0, y: 0, vx: 0, vy: 0, ay: 0, drag: 0, life: 0, max: 0, size: 0, rot: 0, vr: 0, phase: 0, amp: 0, ambient: false, front: false }));
let poolCursor = 0;
let ambientAlive = 0;
let ambientSpawnAcc = 0;
const KIND_SPARKLE = 0;
const KIND_SQUARE = 1;
const KIND_STAR = 2;
const KIND_HEART = 3;
const KIND_BUBBLE = 4;

function grab() {
  for (let n = 0; n < POOL_SIZE; n++) {
    poolCursor = (poolCursor + 1) % POOL_SIZE;
    if (!pool[poolCursor].on) return pool[poolCursor];
  }
  return null;
}

function spawnLandingSparks(L) {
  for (let i = 0; i < LAND_SPARKS; i++) {
    const p = grab();
    if (!p) return;
    const a = rand(0, Math.PI * 2);
    const sp = rand(60, 150) * u;
    Object.assign(p, { on: true, kind: KIND_SPARKLE, ci: Math.floor(rand(0, SPARKLE_COLORS.length)), x: L.tx + rand(-0.3, 0.3) * L.adv, y: L.ty + titleFs * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * u, ay: 120 * u, drag: 2.2, life: 0, max: rand(0.4, 0.7), size: rand(9, 15) * u, rot: rand(0, 6.28), vr: rand(-4, 4), ambient: false, front: true });
  }
}

function spawnBurst() {
  for (let i = 0; i < STUDIO_INTRO_BURST_COUNT; i++) {
    const p = grab();
    if (!p) return;
    const a = rand(0, Math.PI * 2);
    const sp = rand(140, 520) * u;
    const roll = Math.random();
    const kind = roll < 0.35 ? KIND_SPARKLE : roll < 0.7 ? KIND_SQUARE : roll < 0.85 ? KIND_STAR : KIND_HEART;
    Object.assign(p, {
      on: true, kind, ci: kind === KIND_SQUARE ? Math.floor(rand(0, PIXEL_COLORS.length)) : Math.floor(rand(0, SPARKLE_COLORS.length)),
      x: titleBox.cx + rand(-0.35, 0.35) * titleBox.w, y: titleBox.cy + rand(-0.3, 0.3) * titleBox.h,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: kind === KIND_HEART ? -50 * u : 70 * u, drag: 1.7, life: 0, max: rand(0.9, 1.9),
      size: (kind === KIND_SQUARE ? rand(5, 9) : kind === KIND_SPARKLE ? rand(12, 24) : rand(14, 22)) * u, rot: rand(0, 6.28), vr: rand(-5, 5), ambient: false, front: true,
    });
  }
}

function spawnAmbient() {
  const p = grab();
  if (!p) return;
  const roll = Math.random();
  const kind = roll < 0.55 ? KIND_BUBBLE : roll < 0.85 ? KIND_STAR : KIND_HEART;
  Object.assign(p, {
    on: true, kind, ci: 0, x: rand(W * 0.05, W * 0.95), y: rand(H * 0.1, H * 0.95), vx: 0, ay: 0, drag: 0, life: 0, phase: rand(0, 6.28), amp: rand(8, 20) * u,
    vy: kind === KIND_STAR ? 0 : -rand(26, 70) * u, max: kind === KIND_STAR ? rand(2, 4) : rand(9, 14), size: (kind === KIND_BUBBLE ? rand(10, 28) : kind === KIND_STAR ? rand(12, 20) : rand(14, 22)) * u,
    rot: 0, vr: 0, ambient: true, front: false,
  });
  ambientAlive++;
}

function updateParticles(dt) {
  if (t >= timeline.presentsStart) {
    ambientSpawnAcc += dt * (STUDIO_INTRO_AMBIENT_COUNT / 1.5);
    while (ambientAlive < STUDIO_INTRO_AMBIENT_COUNT && ambientSpawnAcc >= 1) { ambientSpawnAcc -= 1; spawnAmbient(); }
  }
  for (let i = 0; i < POOL_SIZE; i++) {
    const p = pool[i];
    if (!p.on) continue;
    p.life += dt;
    if (p.ambient) {
      p.y += p.vy * dt;
      p.x += Math.sin(t * 0.9 + p.phase) * p.amp * dt;
    } else {
      p.vx -= p.vx * p.drag * dt;
      p.vy += (p.ay - p.vy * p.drag) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.rot += p.vr * dt;
    if (p.life >= p.max || (p.ambient && p.y < -40)) { p.on = false; if (p.ambient) ambientAlive--; }
  }
}

function drawParticle(p) {
  const k = p.life / p.max;
  let alpha = Math.min(1, k / 0.12, (1 - k) / 0.35);
  if (p.kind === KIND_SQUARE) {
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = PIXEL_COLORS[p.ci];
    ctx.fillRect(Math.round((p.x - p.size / 2) * dpr) / dpr, Math.round((p.y - p.size / 2) * dpr) / dpr, p.size, p.size);
    return;
  }
  if (p.kind === KIND_STAR && p.ambient) alpha *= 0.55 + 0.45 * Math.sin(t * 5 + p.phase); // ambient stars twinkle in place
  const sprite = p.kind === KIND_SPARKLE ? sprites.sparkles[p.ci] : p.kind === KIND_STAR ? sprites.star : p.kind === KIND_HEART ? sprites.heart : sprites.bubble;
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.imageSmoothingEnabled = p.kind === KIND_SPARKLE || p.kind === KIND_BUBBLE;
  const s = p.size;
  if (p.kind === KIND_SPARKLE) {
    const cos = Math.cos(p.rot) * dpr;
    const sin = Math.sin(p.rot) * dpr;
    ctx.setTransform(cos, sin, -sin, cos, p.x * dpr, p.y * dpr);
    ctx.drawImage(sprite.c, -s / 2, -s / 2, s, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.drawImage(sprite.c, (p.x - s / 2) * dpr, (p.y - s / 2) * dpr, s * dpr, s * dpr);
  }
}

function drawParticles(front) {
  for (let i = 0; i < POOL_SIZE; i++) if (pool[i].on && pool[i].front === front) drawParticle(pool[i]);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
}

// ---- Drawing ----
function drawLetters() {
  const amp = STUDIO_INTRO_FLOAT_AMP_PX * u;
  for (let i = 0; i < letters.length; i++) {
    const L = letters[i];
    const p = (t - L.launch) / STUDIO_INTRO_LETTER_FLY_S;
    if (p <= 0) continue;
    if (!L.sprite) L.sprite = bakeLetter(L.ch, titleFs, L.fills); // normally already baked ahead of time (update)
    let x = L.tx;
    let y = L.ty;
    let rot = (LETTER_ROT_DEG[L.k] * Math.PI) / 180;
    let sx = 1;
    let sy = 1;
    let alpha = 1;
    if (p < 1) {
      const e = easeOutBack(p);
      x = L.tx + (L.ox - L.tx) * (1 - e);
      y = L.ty + (L.oy - L.ty) * (1 - e);
      const zoom = 1 + (LETTER_FROM_SCALE - 1) * (1 - easeOutCubic(p));
      sx = sy = zoom;
      rot += (1 - e) * LETTER_SPIN_RAD * (L.k % 2 ? 1 : -1);
      alpha = Math.min(1, p * 2.5);
    } else {
      const tl = t - L.land;
      const squash = Math.exp(-LAND_SQUASH_DECAY * tl) * Math.sin(tl * LAND_SQUASH_FREQ) * LAND_SQUASH_AMP;
      sx = 1 + squash;
      sy = 1 - squash;
      const fa = smoothstep(clamp((t - timeline.wordSettle[L.word]) / STUDIO_INTRO_FLOAT_RAMP_S, 0, 1)); // 0 until the whole word has landed
      if (fa > 0) {
        const wave = STUDIO_INTRO_FLOAT_SPEED * t + L.word * STUDIO_INTRO_FLOAT_WORD_PHASE;
        y += fa * amp * (Math.sin(wave) + 0.35 * Math.sin(wave + L.idx * 0.55));
        rot += fa * 0.014 * Math.sin(wave * 0.8 + L.idx * 0.4);
        const pulse = 1 + fa * 0.012 * Math.sin(wave * 1.3);
        sx *= pulse;
        sy *= pulse;
      }
    }
    const cos = Math.cos(rot) * dpr;
    const sin = Math.sin(rot) * dpr;
    ctx.globalAlpha = alpha;
    ctx.setTransform(cos * sx, sin * sx, -sin * sy, cos * sy, x * dpr, y * dpr);
    ctx.drawImage(L.sprite.c, -L.sprite.ax, -L.sprite.ay, L.sprite.w, L.sprite.h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

function drawPresents() {
  if (t < timeline.presentsStart) return;
  const x0 = (W - presents.w) / 2;
  const y0 = H * PRESENTS_Y_FRACTION - presents.h / 2;
  if (t >= timeline.presentsEnd) {
    ctx.drawImage(presents.c, x0 * dpr, y0 * dpr, presents.w * dpr, presents.h * dpr);
    return;
  }
  const px = presents.px;
  for (let i = 0; i < PRESENTS_TEXT.length; i++) {
    const p = (t - timeline.presentsStart - i * STUDIO_INTRO_PRESENTS_CHAR_STAGGER_S) / STUDIO_INTRO_PRESENTS_CHAR_FADE_S;
    if (p <= 0) continue;
    const e = easeOutCubic(Math.min(1, p));
    ctx.globalAlpha = e;
    const sx = Math.floor((presents.xs[i] - px * 0.05) * dpr);
    const sw = Math.ceil((presents.widths[i] + px * 0.2) * dpr);
    ctx.drawImage(presents.c, sx, 0, sw, presents.c.height, (x0 + presents.xs[i] - px * 0.05) * dpr, (y0 + (1 - e) * px * 1.1) * dpr, sw, presents.c.height);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.drawImage(bgSprite, 0, 0);
  drawParticles(false);
  drawLetters();
  drawPresents();
  drawParticles(true);
}

function update(dt) {
  if (bakeCursor < letters.length) { const L = letters[bakeCursor++]; if (!L.sprite) L.sprite = bakeLetter(L.ch, titleFs, L.fills); } // one letter per frame, well before its launch
  // Blips run on their own clock (earlier and slower than the landings, per direct request); the landing sparks stay tied to the picture.
  while (nextBlip < letters.length && t >= STUDIO_INTRO_BLIP_START_S + nextBlip * STUDIO_INTRO_BLIP_INTERVAL_S) playIntroLetterBump(nextBlip++);
  while (nextLanding < letters.length && t >= letters[nextLanding].land) {
    spawnLandingSparks(letters[nextLanding]);
    nextLanding++;
  }
  if (!burstFired && t >= timeline.presentsStart) { burstFired = true; spawnBurst(); }
  updateParticles(dt);
}

function frame(now) {
  if (!active) return;
  rafId = requestAnimationFrame(frame);
  const dt = clamp((now - lastNow) / 1000, 0, 0.05); // a stalled tab pauses the timeline instead of jumping it
  lastNow = now;
  t += dt;
  update(dt);
  draw();
  if (t >= timeline.end) finish(false);
}

// ---- Input / lifecycle ----
function onPointer(e) {
  e.preventDefault();
  finish(true);
}

function onKey(e) {
  if (e.repeat) return; // the key that opened the splash may still be held
  e.stopImmediatePropagation(); // swallowed so the skipping key doesn't also fire a game hotkey
  finish(true);
}

function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (active) layout(); }, 120); // sprites are baked for one viewport size, rebuilt once resizing settles
}

function swallowNextClick() {
  const eat = (e) => { e.stopPropagation(); e.preventDefault(); clearTimeout(swallowTimer); };
  window.addEventListener('click', eat, { capture: true, once: true });
  swallowTimer = setTimeout(() => window.removeEventListener('click', eat, true), SWALLOW_CLICK_MS);
}

function hide() {
  clearTimeout(fadeTimer);
  overlayEl.classList.add('hidden');
  overlayEl.classList.remove('leaving');
}

function finish(skipped) {
  if (!active) return;
  active = false;
  cancelAnimationFrame(rafId);
  clearTimeout(resizeTimer);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', onResize);
  overlayEl.removeEventListener('pointerdown', onPointer);
  stopStudioIntro();
  bgSprite = null;
  sprites = null;
  presents = null;
  if (skipped) {
    hide();
    swallowNextClick();
  } else {
    overlayEl.classList.add('leaving');
    fadeTimer = setTimeout(hide, FADE_OUT_MS);
  }
  const cb = onDoneCb;
  onDoneCb = null;
  if (cb) cb();
}

// Per direct request the splash plays on the first load and on a browser refresh, but not when the pause menu's
// Main Menu button reloads the page: that button calls this just before reloading, and the next runStudioIntro
// consumes the flag. (sessionStorage, so it only ever survives that one reload.)
const SKIP_NEXT_KEY = 'finsanity_skip_studio_intro';
export function skipStudioIntroOnNextLoad() {
  try { sessionStorage.setItem(SKIP_NEXT_KEY, '1'); } catch { /* storage blocked: the intro just plays again */ }
}
function consumeSkipFlag() {
  try {
    const skip = sessionStorage.getItem(SKIP_NEXT_KEY) === '1';
    if (skip) sessionStorage.removeItem(SKIP_NEXT_KEY);
    return skip;
  } catch { return false; }
}

// Opens the splash; onDone fires once, whether it ended by itself or was skipped.
export function runStudioIntro(onDone) {
  if (consumeSkipFlag()) { onDone(); return; }
  overlayEl = document.getElementById('studio-intro');
  canvasEl = document.getElementById('studio-intro-canvas');
  ctx = canvasEl.getContext('2d');
  onDoneCb = onDone;
  timeline = buildTimeline();
  t = 0;
  nextLanding = 0;
  nextBlip = 0;
  bakeCursor = 0;
  burstFired = false;
  ambientAlive = 0;
  ambientSpawnAcc = 0;
  for (const p of pool) p.on = false;
  overlayEl.classList.remove('hidden', 'leaving');
  layout();
  active = true;
  overlayEl.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  playStudioIntro(timeline.end);
  lastNow = performance.now();
  rafId = requestAnimationFrame(frame);
}
