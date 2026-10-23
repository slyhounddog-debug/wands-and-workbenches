'use strict';
// Canvas rendering for both halves. Each half is drawn into a low-res buffer (1 buffer px = P screen px) and scaled
// up with nearest-neighbour, so every shape — belts, glows, terrain — lands on the same chunky 8-bit pixel grid.
// Text is deferred and drawn afterwards at full resolution in the pixel fonts. HUD / menus are DOM (see ui.js).
const R = {
  fcam: { x: 6.5, y: 8.5 }, wcam: { x: 100.5, y: 100.5 },
  fv: { cx: 400, cy: 440, T: CFG.FT, org: 0 }, wv: { cx: 1200, cy: 450, T: CFG.WT, org: 800 },
  ghost: null, aim: null, focus: null, demo: null, padMode: false,
  hint: null, whint: null, hoverB: null, mapC: null,   // goal pointers (factory / wilds), hovered building, minimap image
  defer: null, px: 1, org: 0, bufs: {},
};
// digits always come from Silkscreen (the 'Digits' faces in style.css): no 5 that reads as 8, no 6 that reads as G
const FONT_D = '"Digits", "Press Start 2P", "Courier New", monospace';   // display: numbers, short labels
const FONT_B = '"DigitsB", "Jersey 10", "Press Start 2P", monospace';  // body: prompts, longer labels

function lowBuffer(name, w, h) {
  let b = R.bufs[name];
  if (!b) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    b = R.bufs[name] = { c, x: c.getContext('2d') };
  }
  b.x.imageSmoothingEnabled = false;
  return b;
}
function setView(v, cam, sx, sy) {
  const hw = v.T.TW / 2, hh = v.T.TH / 2, P = v.T.P;
  v.hw = hw; v.hh = hh; v.cam = cam; v.sx = sx || 0; v.sy = sy || 0;
  // snap the camera to whole buffer pixels so sprites never shimmer
  v.ox = v.org + Math.round((v.cx - (cam.x - cam.y) * hw + (sx || 0) - v.org) / P) * P;
  v.oy = Math.round((v.cy - (cam.x + cam.y) * hh + (sy || 0)) / P) * P;
}
R.toScreen = (v, x, y) => [(x - y) * v.hw + v.ox, (x + y) * v.hh + v.oy];
// the followed character: snapped to the pixel grid relative to the (smoothed) camera instead of to the world. Snapping him
// and the camera separately made him hop back and forth by a pixel whenever the two rounded on different frames (worst on
// diagonals, where x and y round independently); this way he holds still on screen while the ground scrolls past
R.toScreenLocked = (v, x, y) => {
  const c = v.cam, P = v.T.P, ex = v.cx + v.sx + (x - y - (c.x - c.y)) * v.hw, ey = v.cy + v.sy + (x + y - (c.x + c.y)) * v.hh;
  return [v.org + Math.round((ex - v.org) / P) * P, Math.round(ey / P) * P];
};
R.toTile = (v, sx, sy) => {
  const u = (sx - v.ox) / v.hw, w = (sy - v.oy) / v.hh;
  return [(u + w) / 2, (w - u) / 2];
};
const snap = x => R.org + Math.round((x - R.org) / R.px) * R.px;

function dspr(ctx, s, x, y, S, alpha, flip) {
  if (!s) return;
  const w = s.c.width * S, h = s.c.height * S;
  if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = alpha;
  const px = snap(x - (flip ? (s.c.width - s.ax) : s.ax) * S), py = Math.round((y - s.ay * S) / R.px) * R.px;
  if (flip) {
    ctx.save(); ctx.translate(px + w, py); ctx.scale(-1, 1);
    ctx.drawImage(s.c, 0, 0, w, h);
    ctx.restore();
  } else ctx.drawImage(s.c, px, py, w, h);
  if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = 1;
}
// draw a sprite squashed/stretched around its anchor (sx = width scale, sy = height scale)
function dsprSq(ctx, s, x, y, S, sx, sy, alpha, flip) {
  if (Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) { dspr(ctx, s, x, y, S, alpha, flip); return; }
  ctx.save();
  ctx.translate(snap(x), Math.round(y / R.px) * R.px);
  ctx.scale(sx * (flip ? -1 : 1), sy);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.drawImage(s.c, -s.ax * S, -s.ay * S, s.c.width * S, s.c.height * S);
  ctx.restore();
}
function diamond(ctx, cx, cy, hw, hh) {
  ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath();
}
// chunky pixel rectangle with a dark outline
function pbox(ctx, x, y, w, h, fill, edge) {
  const p = R.px;
  x = Math.round(x / p) * p; y = Math.round(y / p) * p; w = Math.round(w / p) * p; h = Math.round(h / p) * p;
  ctx.fillStyle = edge || '#1a0f28';
  ctx.fillRect(x + p, y, w - 2 * p, h); ctx.fillRect(x, y + p, w, h - 2 * p);
  ctx.fillStyle = fill;
  ctx.fillRect(x + p, y + p, w - 2 * p, h - 2 * p);
}
// ----- text: always crisp pixel fonts at full resolution, drawn after the low-res buffer is scaled up -----
function drawText(c, s, x, y, size, col, align, font) {
  const display = font === 'd';
  const sz = display ? (size < 14 ? 12 : size < 20 ? 16 : 24) : Math.round(size * 1.3 / 2) * 2;
  c.font = (display ? '' : '700 ') + sz + 'px ' + (display ? FONT_D : FONT_B);
  c.textAlign = align || 'center';
  c.textBaseline = 'alphabetic';
  const o = display ? 3 : 2;
  c.fillStyle = '#1a0f28';
  for (const d of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o], [-o, o], [o, -o], [-o, -o], [0, o + 2]]) c.fillText(s, Math.round(x) + d[0], Math.round(y) + d[1]);
  c.fillStyle = col || '#fff';
  c.fillText(s, Math.round(x), Math.round(y));
}
function txt(ctx, s, x, y, size, col, align, font) {
  if (R.defer) { const a = ctx.globalAlpha; R.defer.push(c => { c.globalAlpha = a; drawText(c, s, x, y, size, col, align, font); c.globalAlpha = 1; }); return; }
  drawText(ctx, s, x, y, size, col, align, font);
}
function itemSprite(kind) {
  if (ELEM[kind]) return SP['pk_' + kind];
  if (SP['it_' + kind]) return SP['it_' + kind];
  if (kind === 'xp') return SP.gem;
  return null;
}
R.item = function (ctx, kind, x, y, S, t, glow) {
  const it = ITEMS[kind];
  if (glow !== false && it && (it.elem || it.spell || it.pickup)) {
    ctx.fillStyle = it.color; ctx.globalAlpha = 0.3 + Math.sin((t || 0) * 6) * 0.08;
    const r = Math.round(3.6 * S / R.px) * R.px;
    ctx.fillRect(snap(x - r), Math.round((y - 2 * S - r) / R.px) * R.px, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  dspr(ctx, itemSprite(kind), x, y, S);
};
// ----- icons instead of words: sprites drawn crisp at full resolution in the deferred pass -----
R.spr = k => SP[k] || itemSprite(k);
R.icS = s => Math.max(2, Math.floor(26 / Math.max(s.c.width, s.c.height)));   // scale an icon to ~26px
// a row of [spriteKey, number?] centred on x, bottoms on y
R.iconRow = function (c, x, y, list, alpha) {
  const items = list.map(e => { const s = R.spr(e[0]), n = e[1] == null ? null : String(e[1]); return { s, n, w: (s ? s.c.width * R.icS(s) : 0) + (n ? 6 + n.length * 14 : 0) }; });
  let x0 = Math.round(x - (items.reduce((a, e) => a + e.w, 0) + (items.length - 1) * 8) / 2);
  c.imageSmoothingEnabled = false;
  for (const e of items) {
    c.globalAlpha = alpha == null ? 1 : alpha;
    if (e.s) { const S = R.icS(e.s), w = e.s.c.width * S, h = e.s.c.height * S; c.drawImage(e.s.c, x0, Math.round(y - h), w, h); x0 += w; }
    if (e.n) { drawText(c, e.n, x0 + 4, y - 2, 12, '#ffffff', 'left', 'd'); x0 += 6 + e.n.length * 14; }
    x0 += 8;
  }
  c.globalAlpha = 1;
};
// a prompt bubble with a key cap and icons (no words). mash = the key cap bounces as if being hammered
R.iprompt = function (ctx, x, y, key, ic, maxX, minX, mash) {
  const draw = c => {
    c.font = '12px ' + FONT_D;
    const kb = key ? Math.max(24, Math.ceil(c.measureText(key).width) + 12) : 0;
    const sprs = (ic || []).map(R.spr).filter(Boolean);
    const iw = sprs.reduce((a, s) => a + s.c.width * R.icS(s) + 6, 0);
    const w = Math.round(kb + 16 + iw + (key && sprs.length ? 8 : 0)), h = 40, p = 4;
    const x0 = Math.round(Math.max((minX || 0) + 8, Math.min((maxX || CFG.HALF) - w - 8, x - w / 2))), y0 = Math.round(y - h / 2);
    c.fillStyle = '#1a0f28'; c.fillRect(x0 + p, y0, w - 2 * p, h); c.fillRect(x0, y0 + p, w, h - 2 * p);
    c.fillStyle = '#fff6e0'; c.fillRect(x0 + p, y0 + p, w - 2 * p, h - 2 * p);
    let cx = x0 + 8;
    if (key) {
      const dn = mash && Math.floor(performance.now() / 110) % 2 ? 3 : 0;
      c.fillStyle = '#1a0f28'; c.fillRect(cx, y0 + 7, kb + 4, 26);
      c.fillStyle = dn ? '#d98a20' : '#ffb43a'; c.fillRect(cx + 2, y0 + 9 + dn, kb, 20 - dn);
      c.fillStyle = '#3a2410'; c.textAlign = 'center'; c.font = '12px ' + FONT_D; c.fillText(key, cx + 2 + kb / 2, y0 + 25 + dn);
      cx += kb + 12;
    }
    c.imageSmoothingEnabled = false;
    for (const s of sprs) { const S = R.icS(s), sw = s.c.width * S, sh = s.c.height * S; c.drawImage(s.c, cx, Math.round(y0 + h / 2 - sh / 2), sw, sh); cx += sw + 6; }
  };
  if (R.defer) R.defer.push(draw); else draw(ctx);
};
// close enough to the Builder (or hovered / focused) to show a building's info panel
R.inTip = b => R.isNear(b) || Math.hypot(G.bd.x - b.x - 0.5, G.bd.y - b.y - 0.5) < CFG.tipRadius;
R.flush = function (main, x0) {
  main.save();
  main.beginPath(); main.rect(x0, 0, CFG.HALF, CFG.H); main.clip();
  for (const fn of R.defer) fn(main);
  main.restore();
  R.defer = null;
};

// ===================== FACTORY =====================
R.drawFactory = function (main, dt) {
  const T = CFG.FT, S = T.S, P = T.P, f = G.fac, bd = G.bd;
  const buf = lowBuffer('f', CFG.HALF / P, CFG.H / P), ctx = buf.x;
  ctx.setTransform(1 / P, 0, 0, 1 / P, 0, 0);
  R.px = P; R.org = 0; R.defer = [];
  const cam = R.fcam;
  const k = 1 - Math.exp(-dt * 7);   // frame-rate independent, so the follow lag stays constant while he walks
  cam.x += (bd.x + bd.vx * 0.18 - cam.x) * k; cam.y += (bd.y + bd.vy * 0.18 - cam.y) * k;
  // a spell landing in the wilds bumps the factory view (sideways shake too for triples and the Nova)
  const bmp = f.bumpAmp > 0 ? f.bumpAmp * Math.cos(f.bump * 40) * (1 - f.bump / 0.4) : 0;
  const v = R.fv; setView(v, cam, f.bumpAmp >= 18 ? (Math.random() - 0.5) * bmp : 0, bmp);
  const t = f.t, W = f.w, H = f.h;

  // sky
  const bands = ['#8fd0ec', '#a2daea', '#b4e4e4', '#c6ecd8', '#b4e2c0', '#a8dcae'];
  for (let i = 0; i < bands.length; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(0, i * 150, CFG.HALF, 152); }
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 260 + t * (8 + i * 3)) % 1200) - 200, cy = 60 + i * 70 + Math.sin(i * 3) * 30;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(cx / P) * P, Math.round(cy / P) * P, 96, 16); ctx.fillRect(Math.round(cx / P) * P + 16, Math.round(cy / P) * P - 12, 56, 12);
  }

  const c0 = R.toScreen(v, 0, 0), c1 = R.toScreen(v, W, 0), c2 = R.toScreen(v, W, H), c3 = R.toScreen(v, 0, H);
  const rim = 32;
  ctx.fillStyle = '#8a5c34'; ctx.beginPath(); ctx.moveTo(c3[0], c3[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c2[0], c2[1] + rim); ctx.lineTo(c3[0], c3[1] + rim); ctx.fill();
  ctx.fillStyle = '#6a4426'; ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c1[0], c1[1] + rim); ctx.lineTo(c2[0], c2[1] + rim); ctx.fill();
  ctx.fillStyle = '#5ab84a';
  ctx.beginPath(); ctx.moveTo(c3[0], c3[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c1[0], c1[1] + 8); ctx.lineTo(c2[0], c2[1] + 8); ctx.lineTo(c3[0], c3[1] + 8); ctx.fill();

  // shiny grass
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = (x - y) * v.hw + v.ox, sy = (x + y + 1) * v.hh + v.oy;
    if (sx < -90 || sx > CFG.HALF + 90 || sy < -60 || sy > CFG.H + 60) continue;
    ctx.fillStyle = (x + y) & 1 ? '#8ee06a' : '#82d65f';
    diamond(ctx, sx, sy, v.hw + 1, v.hh + 1); ctx.fill();
  }
  // a pixel-band sheen sweeping across the meadow, plus twinkles
  ctx.save();
  ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath(); ctx.clip();
  const ph = ((t * 0.08) % 1.6) - 0.3;
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  const sx0 = c3[0] + (c1[0] - c3[0]) * ph;
  ctx.moveTo(sx0, 0); ctx.lineTo(sx0 + 120, 0); ctx.lineTo(sx0 - 200, CFG.H); ctx.lineTo(sx0 - 320, CFG.H); ctx.fill();
  for (let i = 0; i < 30; i++) {
    const gx = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * W, gy = Math.abs((Math.sin(i * 78.233) * 12543.123) % 1) * H;
    if (Math.sin(t * 2 + i * 1.7) < 0.5) continue;
    const p = R.toScreen(v, gx, gy), x = Math.round(p[0] / P) * P, y = Math.round(p[1] / P) * P;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - P, y, P * 3, P); ctx.fillRect(x, y - P, P, P * 3);
  }
  ctx.restore();

  // stockpile pad
  {
    const z = FA.zone();
    const a = R.toScreen(v, z.x0, z.y0), b = R.toScreen(v, z.x1 + 1, z.y0), c = R.toScreen(v, z.x1 + 1, z.y1 + 1), d = R.toScreen(v, z.x0, z.y1 + 1);
    ctx.fillStyle = '#c49258';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f4d898'; ctx.lineWidth = 8; ctx.setLineDash([16, 16]); ctx.lineDashOffset = -Math.floor(t * 4) * 8; ctx.stroke(); ctx.setLineDash([]);
  }

  const piles = FA.piles();
  const list = [];
  for (const b of f.belts) list.push({ d: b.x + b.y + 0.4, o: b, t: 'belt' });
  for (const b of f.bld) list.push({ d: b.x + b.y + 1, o: b, t: 'bld' });
  const ps = FA.portal('spell'), pk = FA.portal('skill');
  list.push({ d: ps.x + ps.y + 2, t: 'portal', o: 'spell' });
  list.push({ d: pk.x + pk.y + 2, t: 'portal', o: 'skill' });
  for (const k2 in piles) list.push({ d: piles[k2].x + piles[k2].y, o: k2, t: 'pile' });
  const piles2 = [];
  for (const o of f.floor) {
    const g = o.z <= 0 && piles2.find(q => q.kind === o.kind && Math.abs(q.x - o.x) < 0.45 && Math.abs(q.y - o.y) < 0.45);
    if (g) g.items.push(o); else piles2.push({ kind: o.kind, x: o.x, y: o.y, items: [o] });
  }
  for (const g of piles2) list.push({ d: g.x + g.y, o: g, t: g.items.length > 1 ? 'floorG' : 'floor' });
  for (const o of f.flying) list.push({ d: o.x + o.y + 0.5, o, t: 'fly' });
  list.push({ d: bd.x + bd.y, o: bd, t: 'builder' });
  list.sort((a, b) => a.d - b.d);

  // reflections in the shiny grass
  for (const it of list) {
    if (it.t === 'bld') {
      const b = it.o, p = R.toScreen(v, b.x + 0.5, b.y + 0.5), spr = R.bldSprite(b);
      if (spr) R.reflect(ctx, spr, p[0], p[1] + v.hh * 0.9, S, b.done ? 0.22 : 0.1);
    } else if (it.t === 'builder') {
      const p = R.toScreen(v, bd.x, bd.y);
      R.reflect(ctx, G.hands ? SP.builderC : SP.builder, p[0], p[1], S, 0.22);
    }
  }
  for (const b of f.bld) {
    const k = b.done && FA.def(b).kind;
    if (!k || k === 'station' || k === 'charger') continue;
    if (k === 'splitter') FA.splitSides(b).forEach((d, i) => R.splitArrow(ctx, v, b, t, d, FA.splitCol[i], i ? 100 - b.split : b.split));
    else if (k === 'sorter') { R.outArrow(ctx, v, b, t, b.dir, '#9dff9d'); if (b.filter) { R.outArrow(ctx, v, b, t, (b.dir + 1) % 4); R.outArrow(ctx, v, b, t, (b.dir + 3) % 4); } }
    else R.outArrow(ctx, v, b, t);
  }

  for (const it of list) {
    switch (it.t) {
      case 'belt': R.drawBelt(ctx, v, it.o, t); break;
      case 'bld': R.drawBuilding(ctx, v, it.o, t); break;
      case 'portal': R.drawPortal(ctx, v, t, it.o); break;
      case 'pile': R.drawPile(ctx, v, it.o, piles[it.o]); break;
      case 'floor': R.drawFloor(ctx, v, it.o.items[0], t); break;
      case 'floorG': R.drawFloorPile(ctx, v, it.o, t); break;
      case 'fly': R.drawFly(ctx, v, it.o, t); break;
      case 'builder': R.drawBuilder(ctx, v, bd, t); break;
    }
  }
  R.drawShrineStreams(ctx, v, t);
  if (R.ghost) R.drawGhost(ctx, v, R.ghost, t);
  if (R.demo) R.drawDemo(ctx, v, R.demo, t);
  if (R.aim && G.hands && !bd.gather) R.drawAim(ctx, v, R.aim, t);
  R.drawLock(ctx, v, t);

  for (const p of f.parts) {
    const s = R.toScreen(v, p.x, p.y);
    ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = p.col;
    if (p.el) { R.elPix(ctx, p.el, Math.round(s[0] / P) * P, Math.round((s[1] - p.z * 22) / P) * P, P); continue; }
    const sz = p.dust ? (p.t > 0.25 ? 8 : 4) : 4;
    ctx.fillRect(Math.round((s[0] - sz / 2) / P) * P, Math.round((s[1] - p.z * 22) / P) * P, sz, sz);
  }
  ctx.globalAlpha = 1;

  if (bd.gather) {
    const g = bd.gather, p = R.toScreen(v, g.b.x + 0.5, g.b.y + 0.5), fr = Math.min(1, g.t / g.total);
    const y = p[1] - 60;   // on the machine itself: the prompt bubbles stack above it and would cover anything higher
    pbox(ctx, p[0] - 56, y - 16, 112, 32, '#2b1d48');
    ctx.fillStyle = ELEM[g.el].color; ctx.fillRect(Math.round((p[0] - 48) / P) * P, y - 8, Math.round(96 * fr / P) * P, 16);
    dspr(ctx, itemSprite(g.el), p[0] - 76, y + 12, 4);
  }
  if (R.hint && !UI.treeOpen.L) R.drawHint(ctx, v, R.hint, t);
  if (R.focus && !UI.treeOpen.L) R.drawFocus(ctx, v, R.focus, t);
  for (const p of f.pops) {
    const s = R.toScreen(v, p.x, p.y), a = Math.max(0, 1 - Math.max(0, p.t - 0.6) / 0.5), y = s[1] - 70 - Math.floor(p.t * 10) * 4;
    if (p.ic) { R.defer.push(c => R.iconRow(c, s[0], y + 8, p.ic, a)); continue; }
    ctx.globalAlpha = a;
    txt(ctx, p.text, s[0], y, 12, p.col, 'center', 'd');
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  main.imageSmoothingEnabled = false;
  main.drawImage(buf.c, 0, 0, CFG.HALF, CFG.H);
  R.flush(main, 0);
};

// while the Wizard stands on a claimed shrine, its element streams out of the Spell Portal into every boosted harnesser
R.drawShrineStreams = function (ctx, v, t) {
  const el = G.w.shrine;
  if (!el) return;
  const ps = FA.portal('spell'), a = R.toScreen(v, ps.x + 0.5, ps.y + 1), col = ELEM[el].color;
  for (const b of G.fac.bld) {
    if (!b.done || FA.def(b).elem !== el) continue;
    const q = R.toScreen(v, b.x + 0.5, b.y + 0.5), lift = 120 + Math.hypot(q[0] - a[0], q[1] - a[1]) * 0.25;
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.7 + i / 4 + b.id * 0.13) % 1;
      const x = a[0] + (q[0] - a[0]) * k, y = a[1] - 80 + (q[1] - 50 - a[1] + 80) * k - Math.sin(k * Math.PI) * lift;
      const px = Math.round(x / 4) * 4, py = Math.round(y / 4) * 4;
      ctx.fillStyle = ELEM[el].dark; ctx.fillRect(px - 8, py - 8, 16, 16);
      ctx.fillStyle = i % 2 ? '#ffffff' : col; ctx.fillRect(px - 4, py - 4, 8, 8);
    }
  }
};
R.reflect = function (ctx, s, x, y, S, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(snap(x), Math.round(y / R.px) * R.px);
  ctx.scale(1, -0.5);
  ctx.drawImage(s.c, -s.ax * S, -s.ay * S, s.c.width * S, s.c.height * S);
  ctx.restore();
};
R.bldSprite = function (b) {
  const d = CFG.buildings[b.type];
  return d.elem ? SP['b_' + d.elem] : SP['b_' + b.type];
};
R.outArrow = function (ctx, v, b, t, dir, col) {
  const dd = DIRS[dir === undefined ? b.dir : dir], p = R.toScreen(v, b.x + 0.5 + dd[0] * 0.62, b.y + 0.5 + dd[1] * 0.62);
  const sdx = (dd[0] - dd[1]) * v.hw, sdy = (dd[0] + dd[1]) * v.hh, m = Math.hypot(sdx, sdy), nx = sdx / m, ny = sdy / m;
  const pulse = Math.sin(t * 5) > 0 ? 1.15 : 1;
  ctx.fillStyle = '#5a3a1a';
  ctx.beginPath();
  ctx.moveTo(p[0] + nx * 14 * pulse, p[1] + ny * 14 * pulse);
  ctx.lineTo(p[0] - ny * 12 - nx * 6, p[1] + nx * 6 - ny * 6);
  ctx.lineTo(p[0] + ny * 12 - nx * 6, p[1] - nx * 6 - ny * 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = col || '#fff0aa';
  ctx.beginPath();
  ctx.moveTo(p[0] + nx * 9 * pulse, p[1] + ny * 9 * pulse);
  ctx.lineTo(p[0] - ny * 7 - nx * 3, p[1] + nx * 3 - ny * 3);
  ctx.lineTo(p[0] + ny * 7 - nx * 3, p[1] - nx * 3 - ny * 3);
  ctx.closePath(); ctx.fill();
};

// a Splitter's output arrow: pulses in its side's colour (the same colour as that end of the slider), bigger for a bigger share;
// a side with 0% is a small dim arrow that doesn't pulse
R.splitArrow = function (ctx, v, b, t, dir, col, pct) {
  const dd = DIRS[dir], p = R.toScreen(v, b.x + 0.5 + dd[0] * 0.68, b.y + 0.5 + dd[1] * 0.68);
  const sdx = (dd[0] - dd[1]) * v.hw, sdy = (dd[0] + dd[1]) * v.hh, m = Math.hypot(sdx, sdy), nx = sdx / m, ny = sdy / m;
  const on = pct > 0, k = on ? (0.8 + pct / 500) * (1 + 0.22 * (Math.sin(t * 5 + dir) * 0.5 + 0.5)) : 0.6;
  ctx.globalAlpha = on ? 1 : 0.4;
  for (const [g, c] of [[1.3, '#1a0f28'], [1, col]]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(p[0] + nx * 17 * g * k, p[1] + ny * 17 * g * k);
    ctx.lineTo(p[0] - ny * 13 * g * k - nx * 7 * g, p[1] + nx * 13 * g * k - ny * 7 * g);
    ctx.lineTo(p[0] + ny * 13 * g * k - nx * 7 * g, p[1] - nx * 13 * g * k - ny * 7 * g);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (R.inTip(b)) txt(ctx, pct + '%', p[0] - nx * 4, p[1] + (ny > 0 ? 36 : -30), 12, col, 'center', 'd');
};

R.drawBelt = function (ctx, v, b, t) {
  const p = R.toScreen(v, b.x + 0.5, b.y + 0.5), hw = v.hw * 0.9, hh = v.hh * 0.9, lift = 8;
  ctx.fillStyle = 'rgba(30,70,30,0.3)';
  diamond(ctx, p[0] + 4, p[1] + 4, hw, hh); ctx.fill();
  ctx.fillStyle = '#4a4f5c';
  ctx.beginPath(); ctx.moveTo(p[0] - hw, p[1] - lift); ctx.lineTo(p[0], p[1] + hh - lift); ctx.lineTo(p[0], p[1] + hh); ctx.lineTo(p[0] - hw, p[1]); ctx.fill();
  ctx.fillStyle = '#353a46';
  ctx.beginPath(); ctx.moveTo(p[0], p[1] + hh - lift); ctx.lineTo(p[0] + hw, p[1] - lift); ctx.lineTo(p[0] + hw, p[1]); ctx.lineTo(p[0], p[1] + hh); ctx.fill();
  ctx.fillStyle = '#5a4026'; diamond(ctx, p[0], p[1] - lift, hw, hh); ctx.fill();
  ctx.fillStyle = '#9a7650'; diamond(ctx, p[0], p[1] - lift, hw - 6, hh - 3); ctx.fill();
  const dd = DIRS[b.dir];
  const sdx = (dd[0] - dd[1]) * v.hw, sdy = (dd[0] + dd[1]) * v.hh;
  const m = Math.hypot(sdx, sdy), nx = sdx / m, ny = sdy / m;
  ctx.save();
  diamond(ctx, p[0], p[1] - lift, hw - 6, hh - 3); ctx.clip();
  // chunky slats scroll in 4px steps so they stay on the pixel grid
  ctx.fillStyle = '#e4c08a';
  const speed = 1 / FA.beltTime();
  for (let i = 0; i < 3; i++) {
    const ph = Math.floor(((t * speed + i / 3) % 1) * 8) / 8 - 0.5;
    const cx = p[0] + sdx * ph, cy = p[1] - lift + sdy * ph;
    ctx.beginPath();
    ctx.moveTo(cx - ny * 16, cy + nx * 8); ctx.lineTo(cx + ny * 16, cy - nx * 8);
    ctx.lineTo(cx + ny * 16 + nx * 6, cy - nx * 8 + ny * 6); ctx.lineTo(cx - ny * 16 + nx * 6, cy + nx * 8 + ny * 6);
    ctx.fill();
  }
  ctx.restore();
  if (b.item) {
    const ph = Math.min(0.5, b.item.prog - 0.5);
    R.item(ctx, b.item.kind, p[0] + sdx * ph, p[1] - lift + sdy * ph - 4, 4, t);
  }
};

// the Builder is standing at it (its prompt is up) or the mouse is over it
R.isNear = b => (R.focus && R.focus.list.some(e => e.t.kind === 'bld' && e.t.o === b)) || R.hoverB === b;
R.drawBuilding = function (ctx, v, b, t) {
  const p = R.toScreen(v, b.x + 0.5, b.y + 0.5), S = 4, d = FA.def(b);
  const spr = R.bldSprite(b);
  const base = p[1] + v.hh * 0.9 - 2;
  const pop = Math.max(0, b.pop);
  const sq = 1 + Math.sin(pop * 18) * pop * 0.5;
  const top = p[1] - 128;
  if (!b.done) {
    dsprSq(ctx, spr, p[0], base, S, 1, sq, 0.45);
    ctx.strokeStyle = '#78c8ff'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -Math.floor(t * 6) * 4;
    diamond(ctx, p[0], p[1], v.hw * 0.95, v.hh * 0.95); ctx.stroke(); ctx.setLineDash([]);
    const cost = d.cost, tot = Object.values(cost).reduce((a, b2) => a + b2, 0), got = Object.values(b.got).reduce((a, b2) => a + b2, 0);
    if (!R.inTip(b)) return;   // what a blueprint still needs only shows when the Builder is close
    R.bar(ctx, p[0], top + 76, 72, got / tot, '#7be0ff');
    const need = FA.needOf(b), keys = Object.keys(need);
    let x0 = p[0] - (keys.length - 1) * 34;
    for (const k of keys) { R.chip(ctx, x0, top + 52, k, need[k]); x0 += 68; }
    return;
  }
  const tip = R.inTip(b);   // info panels (recipes, battery bars, counts) only near the Builder
  const glow = d.kind === 'harness' ? ELEM[d.elem].color : d.kind === 'crafter' ? (b.recipe ? ITEMS[CFG.recipes[b.recipe].out].color : '#888') : null;
  const working = (d.kind === 'harness' && b.out.length < CFG.buffer && b.powered) || (d.kind === 'crafter' && b.prog > 0 && b.powered);
  if (glow && working && Math.sin(b.anim * 4) > -0.3) {
    ctx.fillStyle = glow; ctx.globalAlpha = 0.22;
    diamond(ctx, p[0], p[1], v.hw * 0.85, v.hh * 0.85); ctx.fill(); ctx.globalAlpha = 1;
  }
  dsprSq(ctx, spr, p[0], base, S, 1 + (sq - 1) * -0.5, sq);
  if (d.kind === 'harness') {
    const bob = Math.round(Math.sin(b.anim * (working ? 3 : 1)) * 1.5) * 4;
    const cy = base - 28 - bob;
    const spin = working ? Math.cos(b.anim * 2.4) : 1;
    dsprSq(ctx, SP['cr_' + d.elem], p[0], cy, S, Math.max(0.25, Math.round(Math.abs(spin) * 4) / 4), 1 + pop * 0.4);
    for (let i = 0; i < b.out.length; i++) {
      const a = b.anim * 2 + i * 2.094;
      R.item(ctx, d.elem, p[0] + Math.cos(a) * 32, cy - 34 + Math.sin(a) * 12, 4, t, false);
    }
    if (b.out.length < CFG.buffer) R.bar(ctx, p[0], base + 2, 48, b.timer / FA.cycle(b.type), ELEM[d.elem].color, 8);
    if (!b.powered && d.power > 0) R.noPower(ctx, p[0], top + 20, t);
    else if (FA.shrineBoost(b.type) > 1 && Math.sin(t * 6) > -0.3) {   // shrine boost: a pulsing rim (the stream from the portal is drawn in R.drawShrineStreams)
      ctx.strokeStyle = ELEM[d.elem].color; ctx.lineWidth = 4; diamond(ctx, p[0], p[1], v.hw * 0.95, v.hh * 0.95); ctx.stroke();
    }
  }
  if (d.kind === 'crafter') {
    if (b.type === 'forge' && b.prog > 0 && b.powered) R.flames(ctx, p[0] - 12, p[1] - 22, t);
    if (b.type === 'cauldron') {
      const col = b.recipe ? ITEMS[CFG.recipes[b.recipe].out].color : '#ff5a7a';
      for (let i = 0; i < (b.prog > 0 ? 4 : 1); i++) {
        const ph = (b.anim * 0.8 + i * 0.27) % 1;
        ctx.fillStyle = col; ctx.globalAlpha = ph < 0.7 ? 1 : 0.5;
        const sz = ph < 0.5 ? 8 : 4;
        ctx.fillRect(Math.round((p[0] - 12 + i * 8) / 4) * 4, Math.round((base - 60 - ph * 44) / 4) * 4, sz, sz);
      }
      ctx.globalAlpha = 1;
    }
    if (b.type === 'anvil' && b.prog > 0 && b.powered) {
      const hit = (b.anim * 2.5) % 1;
      const hy = Math.round((hit < 0.5 ? -40 + hit * 60 : -10 - (hit - 0.5) * 60) / 4) * 4;
      ctx.fillStyle = '#5a5a66'; ctx.fillRect(p[0] + 4, base - 68 + hy, 24, 12); ctx.fillStyle = '#8a5a30'; ctx.fillRect(p[0] + 12, base - 56 + hy, 8, 28);
      if (hit > 0.45 && hit < 0.6) for (let i = 0; i < 6; i++) { ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round((p[0] + 8 + Math.cos(i) * 28) / 4) * 4, Math.round((base - 52 - Math.abs(Math.sin(i * 2)) * 24) / 4) * 4, 4, 4); }
    }
    if (b.recipe) {
      const R2 = CFG.recipes[b.recipe];
      const keys = Object.keys(R2.in), w = keys.length * 56 + 64;
      // a faded ghost of the product waits in the empty output slot
      if (!b.out.length && b.prog <= 0) dspr(ctx, itemSprite(R2.out), p[0] + 44, base - 28 + (Math.sin(t * 3) > 0 ? 0 : 4), 4, 0.35);
      let x0 = p[0] - w / 2;
      if (tip) {   // the recipe card: inputs (have/need) > product
      pbox(ctx, x0 - 4, top, w + 8, 48, '#2b1d48');
      for (const k of keys) {
        const have = Math.min(b.inv[k] || 0, 9), ok = (b.inv[k] || 0) >= R2.in[k];
        R.item(ctx, k, x0 + 16, top + 38, 3, t, false);
        txt(ctx, have + '/' + R2.in[k], x0 + 42, top + 32, 12, ok ? '#9dff9d' : '#ffffff', 'center', 'd');
        x0 += 56;
      }
      ctx.fillStyle = '#ffe36b';
      ctx.fillRect(Math.round((x0 + 2) / 4) * 4, top + 20, 12, 8); ctx.fillRect(Math.round((x0 + 14) / 4) * 4, top + 16, 4, 16); ctx.fillRect(Math.round((x0 + 18) / 4) * 4, top + 20, 4, 8);
      R.item(ctx, R2.out, x0 + 40, top + 40, 3, t, false);
      if (b.prog > 0) R.bar(ctx, p[0], top + 52, 84, b.prog / R2.time, ITEMS[R2.out].color);
      }
      if (b.draw > 0 && !b.powered) R.noPower(ctx, p[0], top - 16, t);
    } else dspr(ctx, SP.ic_lock, p[0], top + 44, 4);
    b.out.slice(0, 3).forEach((o, i) => R.item(ctx, o.kind, p[0] + 44, base - 28 - i * 16, 4, t));
    if (b.od) {   // Adjacency Overdrive: sparks jump across from the charged Station beside it
      for (const dd of DIRS) {
        const c = FA.cell(b.x + dd[0], b.y + dd[1]);
        if (!c || c.type !== 'station' || !c.done || !(c.bat > 0)) continue;
        const q = R.toScreen(v, b.x + 0.5 + dd[0] * 0.5, b.y + 0.5 + dd[1] * 0.5);
        ctx.fillStyle = Math.sin(t * 17) > 0 ? '#fff07a' : '#ffffff';
        for (let i = 0; i < 3; i++) ctx.fillRect(Math.round((q[0] - 8 + Math.sin(t * 23 + i * 2) * 10) / 4) * 4, Math.round((q[1] - 40 - i * 12) / 4) * 4, 8, 4);
      }
      if (Math.sin(t * 8) > -0.4) dspr(ctx, SP.ic_bolt, p[0] - 44, base - 12, 4);
    }
  }
  if (b.type === 'station') {
    const fr = b.bat == null ? 0 : b.bat / CFG.batteryMax;
    if (b.bat != null) dspr(ctx, SP.it_battery, p[0], base - 44, 4);
    if (tip) R.bar(ctx, p[0], top + 52, 64, fr, b.bat > 0 ? '#3ad06b' : '#8a8a8a');
    if (b.bat != null && b.bat > 0 && Math.sin(t * 8) > 0) {
      ctx.fillStyle = '#fff07a';
      for (let i = 0; i < 5; i++) ctx.fillRect(Math.round((p[0] - 20 + i * 10) / 4) * 4, Math.round((base - 84 + (i % 2 ? -8 : 8)) / 4) * 4, 8, 4);
    }
    if (b.bat == null && Math.sin(t * 4) > 0) dspr(ctx, SP.it_battery, p[0], base - 44, 4, 0.4);   // a ghost Battery says what goes in
  }
  if (b.type === 'charger') {
    if (b.bat != null) dspr(ctx, SP.it_battery, p[0], base - 40, 4);
    if (b.bat != null && b.bat >= CFG.batteryMax && Math.sin(t * 6) > 0) { ctx.strokeStyle = '#3ad06b'; ctx.lineWidth = 4; diamond(ctx, p[0], p[1], v.hw * 0.9, v.hh * 0.9); ctx.stroke(); }   // full: come get it
    if (b.bat == null && Math.sin(t * 4) > 0) dspr(ctx, SP.it_battery, p[0], base - 40, 4, 0.4);
    const ft = FA.fuelTotal(b);
    if (tip && b.bat != null) R.bar(ctx, p[0], top + 52, 64, b.bat / CFG.batteryMax, b.bat >= CFG.batteryMax ? '#3ad06b' : '#ffd93a');
    if (tip && ft > 0) R.bar(ctx, p[0], top + 66, 64, ft / CFG.fuelCap, '#ff8a3a', 8);
  }
  if (d.kind === 'splitter' || d.kind === 'sorter') b.out.forEach((o, i) => R.item(ctx, o.kind, p[0] - 8 + i * 16, base - 52 - i * 8, 4, t));
  if (d.kind === 'sorter' || d.kind === 'crate') {
    // a tiny item floats over the tile: the Sorter's filter / the Crate's next item. Faint until you stand at or hover it
    const lit = R.isNear(b), a = lit ? 1 : 0.45, fy = base - 84 + (Math.sin(t * 3 + b.x + b.y) > 0 ? 0 : 4);
    const kind = d.kind === 'sorter' ? b.filter : b.out.length ? b.out[0].kind : null;
    if (kind && lit) R.item(ctx, kind, p[0], fy, 4, t);
    else if (kind) dspr(ctx, itemSprite(kind), p[0], fy, 4, a);
    ctx.globalAlpha = a;
    if (d.kind === 'crate' && tip) txt(ctx, b.out.length + '/' + CFG.crateCap, p[0], fy - (kind ? 44 : 8), 12, b.out.length >= CFG.crateCap ? '#ffb43a' : '#ffffff', 'center', 'd');
    ctx.globalAlpha = 1;
  }
  if (d.kind === 'crafter' && b.type === 'altar' && b.prog > 0 && b.powered) {
    ctx.strokeStyle = Math.sin(t * 10) > 0 ? '#ff4a8a' : '#c890ff'; ctx.lineWidth = 4;
    diamond(ctx, p[0], p[1], v.hw * 0.7, v.hh * 0.7); ctx.stroke();
  }
  // throughput: a building stuck for a moment shows why (orange ! = output blocked, grey ? = waiting on inputs)
  R.drawState(ctx, v, b, t, p, top);
};
// machine state language, shown the moment it changes: outline colour AND dash pattern (readable without colour),
// an icon, plus the animation speed (FA.stateSpeed) and a chirp (FA.update)
const ST = {
  work:    { col: '#5ad06a', dash: [16, 8], w: 4 },      // flowing dashes (only drawn up close)
  missing: { col: '#ffd23a', dash: [12, 8], w: 4 },      // + a ghost of the missing ingredient
  starve:  { col: '#a8b0c0', dash: [4, 8], w: 4 },       // dotted + grey ?
  jam:     { col: '#ff8a2b', dash: [24, 6], w: 6 },      // long dashes + orange !
  full:    { col: '#e8384a', dash: [], w: 8 },           // thick solid + stacked bars
  off:     { col: '#9a5ad0', dash: [8, 4, 2, 4], w: 6 }, // dash-dot + the no-power bolt
};
R.drawState = function (ctx, v, b, t, p, top) {
  const st = b.st, S = ST[st];
  if (!S) return;
  const blink = Math.sin(t * (st === 'full' || st === 'off' ? 9 : 5)) > -0.3;
  if (st !== 'work' || R.inTip(b)) {
    ctx.strokeStyle = S.col; ctx.lineWidth = S.w; ctx.setLineDash(S.dash); ctx.lineDashOffset = st === 'work' ? -Math.floor(t * 8) * 4 : 0;
    if (st === 'work' || blink) { diamond(ctx, p[0], p[1], v.hw * 0.98, v.hh * 0.98); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  if (!blink) return;
  const ix = p[0] - 44, iy = top + 72;
  if (st === 'missing') { const k = FA.missingOf(b); dspr(ctx, k ? itemSprite(k) : SP.it_battery, ix, iy, 4, 0.75); }
  else if (st === 'starve') dspr(ctx, SP.ic_starve, ix, iy, 4);
  else if (st === 'jam') dspr(ctx, SP.ic_jam, ix, iy, 4);
  else if (st === 'full') dspr(ctx, SP.ic_full, ix, iy, 4);
};
// one particle in its element's shape (u = one art pixel): air ring, water drop, fire spark, earth chunk
R.elPix = function (ctx, el, x, y, u) {
  if (el === 'air') { ctx.fillRect(x - u, y - u, 3 * u, u); ctx.fillRect(x - u, y + u, 3 * u, u); ctx.fillRect(x - u, y, u, u); ctx.fillRect(x + u, y, u, u); }
  else if (el === 'water') { ctx.fillRect(x, y - u, u, u); ctx.fillRect(x - u, y, 3 * u, 2 * u); }
  else if (el === 'fire') { ctx.fillRect(x, y - u, u, 3 * u); ctx.fillRect(x - u, y, 3 * u, u); }
  else ctx.fillRect(x - u, y - u, 2 * u, 2 * u);
};
// outline whatever a thrown item would land in: a tile, a whole portal, or the Stockpile Zone
R.outlineObj = function (ctx, v, o, col, t, k) {
  k = k || 1;
  ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.setLineDash([14, 8]); ctx.lineDashOffset = -Math.floor(t * 8) * 4;
  const quad = (x0, y0, x1, y1) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, c = R.toScreen(v, cx, cy);
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(q => { const sp = R.toScreen(v, q[0], q[1]); return [c[0] + (sp[0] - c[0]) * k, c[1] + (sp[1] - c[1]) * k]; });
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.stroke();
  };
  if (o === 'zone') { const z = FA.zone(); quad(z.x0, z.y0, z.x1 + 1, z.y1 + 1); }
  else if (o.type === 'portal') { const q = FA.portal(o.which); quad(q.x, q.y, q.x + 1, q.y + 2); }
  else quad(o.x, o.y, o.x + 1, o.y + 1);
  ctx.setLineDash([]);
};
R.chip = function (ctx, x, y, kind, n) {
  pbox(ctx, x - 32, y - 20, 64, 32, '#2b1d48');
  R.item(ctx, kind, x - 14, y + 6, 3, 0, false);
  txt(ctx, '' + n, x + 14, y + 2, 12, '#ffffff', 'center', 'd');
};
R.noPower = function (ctx, x, y, t) {
  if (Math.sin(t * 8) < -0.2) return;
  pbox(ctx, x - 16, y - 16, 32, 32, '#e8304a');
  dspr(ctx, SP.ic_bolt, x, y + 12, 4);
};
R.bar = function (ctx, x, y, w, fr, col, h) {
  h = h || 12;
  pbox(ctx, x - w / 2 - 4, y - 4, w + 8, h + 8, '#2b1d48');
  if (fr > 0) { ctx.fillStyle = col; ctx.fillRect(Math.round((x - w / 2) / R.px) * R.px, Math.round(y / R.px) * R.px, Math.max(R.px, Math.round(Math.min(1, fr) * w / R.px) * R.px), Math.round(h / R.px) * R.px); }
};
R.flames = function (ctx, x, y, t) {
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i ? '#ffe36b' : '#ff7a30';
    const sz = 12 - i * 4;
    ctx.fillRect(Math.round((x + Math.sin(t * 7 + i) * 4) / 4) * 4, Math.round((y - ((t * 30 + i * 10) % 24)) / 4) * 4, sz, sz);
  }
};

R.drawPortal = function (ctx, v, t, which) {
  const f = G.fac, p0 = FA.portal(which), skill = which === 'skill';
  const base = R.toScreen(v, p0.x + 0.5, p0.y + 1);
  const a = R.toScreen(v, p0.x, p0.y), b = R.toScreen(v, p0.x + 1, p0.y), c = R.toScreen(v, p0.x + 1, p0.y + 2), d = R.toScreen(v, p0.x, p0.y + 2);
  ctx.globalAlpha = CFG.portalAlpha;   // the portals are see-through, so the Builder and belts show behind them
  ctx.fillStyle = skill ? '#b0a070' : '#8a8fb0';
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
  ctx.fillStyle = skill ? '#7a6a40' : '#5e6280';
  ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + 16); ctx.lineTo(d[0], d[1] + 16); ctx.fill();
  ctx.globalAlpha = 1;
  const flash = Math.max(0, skill ? f.skillFlash : f.flash) * 2;
  const cols = skill ? ['#2a6a3a', '#5ad06a', '#c8ffb0', '#ffffff'] : ['#4a2890', '#8a4ad0', '#c890ff', '#ffffff'];
  // while the Chimera is out, the Spell Portal wears its current weakness: a rim in that colour, flashing after a change
  const boss = !skill && G.w.boss, weakCol = boss && ELEM[boss.weak].color, wfl = boss && f.weakFlash > 0;
  if (boss) {
    const k = wfl ? 1.45 + Math.ceil((1 - f.weakFlash / CFG.boss.weakFlash) * 4) / 4 * 0.5 : 1.3;
    if (!wfl || Math.sin(t * 24) > 0) {
      ctx.strokeStyle = wfl && Math.sin(t * 12) > 0 ? '#ffffff' : weakCol; ctx.lineWidth = wfl ? 12 : 8;
      ctx.globalAlpha = wfl ? 1 : Math.sin(t * 4) > 0 ? 0.85 : 0.5;
      ctx.beginPath();
      [a, b, c, d].forEach((q, i) => { const x = base[0] + (q[0] - base[0]) * k, y = base[1] + (q[1] - base[1]) * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  // spell-landing pulses: one ring per tier, each tier reaching further
  if (!skill) for (const th of f.thumps) {
    const dur = 0.5 + th.tier * 0.12;
    for (let i = 0; i < th.tier; i++) {
      const kk = th.t / dur - i * 0.12;
      if (kk <= 0 || kk >= 1) continue;
      const r = (1.1 + th.tier * 0.75) * Math.ceil(kk * 5) / 5;
      ctx.globalAlpha = 1 - kk; ctx.strokeStyle = i % 2 ? '#ffffff' : th.col; ctx.lineWidth = 4 + th.tier * 2;
      diamond(ctx, base[0], base[1], r * v.hw, r * v.hh); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(base[0], base[1] - 72);
  ctx.transform(-v.hw, v.hh, 0, 72, 0, 0);
  if (boss) { ctx.fillStyle = wfl && Math.sin(t * 12) > 0 ? '#ffffff' : weakCol; ctx.beginPath(); ctx.ellipse(0, 0, 1.14, 1.18, 0, 0, 6.283); ctx.fill(); }
  // concentric flat rings (no gradients: chunky 8-bit bands)
  const rs = [1, 0.75, 0.5, 0.25];
  ctx.globalAlpha = CFG.portalAlpha;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = flash > 0 && i === 1 ? f.flashCol : cols[i];
    ctx.beginPath(); ctx.ellipse(0, 0, rs[i] * 0.95, rs[i] * (1 - 0.06 * Math.sin(t * 3 + i)), 0, 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = skill ? '#ffd23a' : '#ffffff';
  for (let i = 0; i < 4; i++) { const an = t * 1.5 + i * 1.57; ctx.fillRect(Math.cos(an) * 0.6 - 0.06, Math.sin(an) * 0.6 - 0.06, 0.12, 0.12); }
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = skill ? '#ffe36b' : '#ffffff'; ctx.globalAlpha = flash * 0.4; ctx.fillRect(base[0] - 64, base[1] - 140, 128, 136); ctx.globalAlpha = 1; }
  if (boss) {   // the element that hurts the boss right now, floating in the middle of the portal
    const sc = wfl && Math.sin(t * 12) > 0 ? 1.3 : 1;
    dsprSq(ctx, itemSprite(boss.weak), base[0], base[1] - 52 + (Math.sin(t * 4) > 0 ? 0 : 4), 4, sc, sc);
    const nx = WZ.nextWeak(boss);
    if (nx) {
      pbox(ctx, base[0] + 36, base[1] - 132, 64, 40, '#2b1d48');
      ctx.fillStyle = '#c8b8e8'; ctx.fillRect(base[0] + 44, base[1] - 116, 12, 8); ctx.fillRect(base[0] + 56, base[1] - 120, 4, 16);
      dspr(ctx, itemSprite(nx), base[0] + 80, base[1] - 98, 3, 0.8);
    }
  }
  dspr(ctx, SP[skill ? 'ic_skill' : 'ic_portal'], base[0], base[1] - 160, 4);
  const q = f.portalQ.filter(e => e.which === which).length + (which === 'spell' ? f.eggQ.length : 0);
  if (q) txt(ctx, q + ' queued', base[0], base[1] - 146, 12, '#ffe36b', 'center', 'd');
};

R.drawPile = function (ctx, v, k, pos) {
  const p = R.toScreen(v, pos.x, pos.y), n = G.stock[k];
  const cnt = Math.min(15, Math.ceil(n / 2));
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(Math.round((p[0] - 36) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 72, 12);
  for (let i = 0; i < cnt; i++) {
    const row = Math.floor(i / 5), col = i % 5;
    dspr(ctx, itemSprite(k), p[0] + (col - 2) * 12 + (row % 2) * 6, p[1] - row * 12 + ((col * 7) % 5) - 2, 4);
  }
  txt(ctx, '' + n, p[0], p[1] + 30, 12, n > 0 ? (k === 'shard' ? '#e0b8ff' : '#ffffff') : '#ff9a9a', 'center', 'd');
};
// goal pointer in the factory: a bouncing arrow over the target, or an arrow on the edge pointing toward it
R.drawHint = function (ctx, v, h, t) {
  const p = R.toScreen(v, h.x, h.y), lift = h.lift || 150;
  const x0 = 40, x1 = CFG.HALF - 40, y0 = 140, y1 = CFG.H - 130;
  const on = p[0] > x0 && p[0] < x1 && p[1] - lift > y0 - 60 && p[1] < y1 + 60;
  const bob = Math.sin(t * 6) > 0 ? 0 : 8;
  if (on) {
    ctx.strokeStyle = Math.sin(t * 6) > 0 ? '#ffe36b' : '#ffa62a'; ctx.lineWidth = 8;
    if (h.tile) { diamond(ctx, p[0], p[1], v.hw * 1.05, v.hh * 1.05); ctx.stroke(); }
    R.arrow(ctx, p[0], p[1] - lift - bob, 0, 1);
  } else {
    const cx = Math.max(x0, Math.min(x1, p[0])), cy = Math.max(y0, Math.min(y1, p[1] - lift / 2));
    const dx = p[0] - cx, dy = p[1] - lift / 2 - cy, m = Math.hypot(dx, dy) || 1;
    R.arrow(ctx, cx - dx / m * bob, cy - dy / m * bob, dx / m, dy / m);
  }
};
R.arrow = function (ctx, x, y, nx, ny) {   // chunky gold arrow whose tip sits at (x,y), pointing along (nx,ny)
  const px = -ny, py = nx, L = 36, W = 22;
  const tri = (k, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - nx * L * k + px * W * k, y - ny * L * k + py * W * k); ctx.lineTo(x - nx * L * k - px * W * k, y - ny * L * k - py * W * k); ctx.closePath(); ctx.fill();
  };
  ctx.fillStyle = '#1a0f28'; ctx.fillRect(Math.round((x - nx * 52 - 10) / 4) * 4, Math.round((y - ny * 52 - 10) / 4) * 4, 20, 20);
  tri(1.25, '#1a0f28'); tri(1, '#ffd23a');
  ctx.fillStyle = '#ffd23a'; ctx.fillRect(Math.round((x - nx * 50 - 6) / 4) * 4, Math.round((y - ny * 50 - 6) / 4) * 4, 12, 12);
};
R.drawFloor = function (ctx, v, o, t) {
  const p = R.toScreen(v, o.x, o.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round((p[0] - 12) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 24, 8);
  const bob = o.z > 0 ? o.z * 26 : (Math.sin(t * 3 + o.x * 5) > 0 ? 8 : 4);
  R.item(ctx, o.kind, p[0], p[1] - bob, 4, t);
};
R.drawFloorPile = function (ctx, v, g, t) {
  const p = R.toScreen(v, g.x, g.y), n = g.items.length;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round((p[0] - 16) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 32, 8);
  for (let i = 0; i < Math.min(n, 4); i++) R.item(ctx, g.kind, p[0] + (i % 2 ? 4 : -4), p[1] - 6 - i * 10, 4, t, i === Math.min(n, 4) - 1);
  txt(ctx, '' + n, p[0] + 24, p[1] - 10, 12, '#ffffff', 'center', 'd');
};
R.drawFly = function (ctx, v, o, t) {
  if (o.t < 0) return;   // still waiting its turn to leave the portal
  const p = R.toScreen(v, o.x, o.y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(Math.round((p[0] - 10) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 20, 8);
  R.item(ctx, o.kind, p[0], p[1] - o.z * 44 + 6, 4, t);
};

R.drawBuilder = function (ctx, v, bd, t) {
  const p = R.toScreenLocked(v, bd.x, bd.y), S = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round((p[0] - 20) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 40, 12);
  const carrying = !!G.hands;
  const step = Math.sin(bd.bob);
  const hop = Math.round((bd.gather ? Math.abs(Math.sin(bd.bob)) * 12 : (bd.moving ? Math.abs(step) * 5 : 0)) / 4) * 4;
  const spr = carrying ? (bd.moving && step > 0 ? SP.builderC2 : SP.builderC) : (bd.moving && step > 0 ? SP.builder2 : SP.builder);
  const sq = bd.squash > 0 ? Math.sin(bd.squash * 25) * 0.12 : 0;
  // facing flips with hysteresis: moving straight up or down the screen sits right on the threshold and used to flicker
  const fd = bd.fx - bd.fy;
  if (fd < -0.3) bd.flipS = true; else if (fd > 0.3) bd.flipS = false;
  const flip = !!bd.flipS;
  // playful walk: the body pivots at the hips and leans back and forth with each step, stretching taller on the
  // push-off and skewing off-axis, so it reads as if his legs were swinging
  const ph = bd.bob, wk = bd.moving ? 1 : 0, g = bd.gather ? 1 : 0;
  const lean = (wk * Math.sin(ph) * 0.16 + g * Math.sin(ph * 1.5) * 0.06) * (flip ? -1 : 1);
  const stretch = wk * Math.abs(Math.sin(ph)) * 0.14, skew = wk * Math.sin(ph + 1.2) * 0.14 * (flip ? -1 : 1);
  const pv = spr.ay * S * 0.35;   // pivot height above the feet
  ctx.save();
  ctx.translate(snap(p[0]), Math.round((p[1] - hop - pv) / R.px) * R.px);
  ctx.rotate(lean);
  ctx.transform(1, 0, skew, 1, 0, 0);
  ctx.scale((1 + sq) * (1 - stretch * 0.45) * (flip ? -1 : 1), (1 - sq) * (1 + stretch));
  ctx.drawImage(spr.c, -spr.ax * S, -spr.ay * S + pv, spr.c.width * S, spr.c.height * S);
  ctx.restore();
  const h = G.hands;
  if (h) {
    const n = Math.min(h.n, 8), y0 = p[1] - 72 - hop;
    for (let i = 0; i < n; i++) {
      const wob = bd.moving && i > 1 ? (Math.sin(t * 6 + i * 0.7) > 0 ? 4 : 0) : 0;
      R.item(ctx, h.kind, p[0] + wob + (i % 2 ? 4 : -4), y0 - i * 8, 4, t, i === n - 1);
    }
    const label = h.kind === 'battery' ? Math.round(h.charge / CFG.batteryMax * 100) + '%' : 'x' + h.n;
    txt(ctx, label, p[0] + 34, y0 - n * 8 + 6, 12, h.n >= FA.stackMax(h.kind) ? '#ffe36b' : '#ffffff', 'center', 'd');
  }
};
R.drawGhost = function (ctx, v, g, t) {
  const p = R.toScreen(v, g.x + 0.5, g.y + 0.5);
  ctx.fillStyle = g.ok ? 'rgba(120,255,140,0.4)' : 'rgba(255,90,90,0.45)';
  diamond(ctx, p[0], p[1], v.hw, v.hh); ctx.fill();
  const dd = DIRS[g.dir], sdx = (dd[0] - dd[1]) * v.hw * 0.45, sdy = (dd[0] + dd[1]) * v.hh * 0.45;
  if (g.type !== 'belt') dspr(ctx, R.bldSprite({ type: g.type }), p[0], p[1] + v.hh * 0.9 - 2, 4, 0.55);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8;
  const ex = p[0] + sdx * 1.2, ey = p[1] + sdy * 1.2;
  ctx.beginPath(); ctx.moveTo(p[0] - sdx * 0.6, p[1] - sdy * 0.6); ctx.lineTo(ex, ey); ctx.stroke();
  const m = Math.hypot(sdx, sdy), nx = sdx / m, ny = sdy / m;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(ex + nx * 8, ey + ny * 8); ctx.lineTo(ex - nx * 12 - ny * 14, ey - ny * 12 + nx * 14); ctx.lineTo(ex - nx * 12 + ny * 14, ey - ny * 12 - nx * 14); ctx.fill();
  if (g.type !== 'belt' && g.type !== 'hand' && G.credits[g.type] > 0) dspr(ctx, SP.ic_gift, p[0], p[1] - 100 + (Math.sin(t * 6) > 0 ? 0 : 4), 4);
  // a Station beside a Forge / Cauldron (or the other way round) will overdrive it
  const pair = g.type === 'station' ? ['forge', 'cauldron'] : g.type === 'forge' || g.type === 'cauldron' ? ['station'] : null;
  if (g.ok && pair && DIRS.some(dd => { const c = FA.cell(g.x + dd[0], g.y + dd[1]); return c && pair.indexOf(c.type) >= 0; })) {
    if (Math.sin(t * 10) > 0) dspr(ctx, SP.ic_bolt, p[0], p[1] - 120, 4);   // it will overdrive its neighbour
  }
  if (!R.padMode) R.iprompt(ctx, p[0], p[1] + v.hh + 30, 'R', ['ic_rotate']);
};
R.drawDemo = function (ctx, v, g, t) {
  const p = R.toScreen(v, g.x + 0.5, g.y + 0.5);
  ctx.fillStyle = Math.sin(t * 10) > 0 ? 'rgba(255,60,60,0.45)' : 'rgba(255,60,60,0.3)';
  diamond(ctx, p[0], p[1], v.hw, v.hh); ctx.fill();
  dspr(ctx, SP.ic_x, p[0], p[1] - 24, 4);
  if (g.refund) R.defer.push(c => R.iconRow(c, p[0], p[1] - 70, g.refund));   // what demolishing gives back
};
R.drawAim = function (ctx, v, a, t) {
  const bd = G.bd, s = R.toScreen(v, bd.x, bd.y), e = R.toScreen(v, a.x, a.y);
  const d = Math.hypot(e[0] - s[0], e[1] - s[1]);
  const h = 40 + d * 0.25, off = Math.floor(t * 8) % 3;
  ctx.fillStyle = '#ffffff';
  for (let i = off; i <= 24; i += 3) {
    const k = i / 24, x = s[0] + (e[0] - s[0]) * k, y = s[1] - 70 + (e[1] - s[1] + 70) * k - Math.sin(k * Math.PI) * h;
    ctx.fillRect(Math.round(x / 4) * 4 - 4, Math.round(y / 4) * 4 - 4, 8, 8);
  }
  const hd = G.hands, ok = !!(hd && a.obj && FA.accepts(a.obj, hd.kind)), col = !a.obj ? '#ffffff' : ok ? '#9dff9d' : '#ff6a6a';
  if (a.obj && a.obj.type !== 'belt') R.outlineObj(ctx, v, a.obj, col, t, 1.04);
  else { ctx.strokeStyle = col; ctx.lineWidth = 6; diamond(ctx, e[0], e[1], 24, 12); ctx.stroke(); }
  if (hd) dspr(ctx, itemSprite(hd.kind), e[0], e[1] - 10 + (Math.sin(t * 6) > 0 ? 0 : 4), 4, 0.5);   // where it will land
  if (a.obj && !ok) dspr(ctx, SP.ic_x, e[0], e[1] - 40, 4);
};
// a pad / Tab-picked target: cyan corner brackets, plus the cycle key while there's more than one choice
R.drawLock = function (ctx, v, t) {
  const l = G.lock;
  if (!l || G.lastInput === 'mouse') return;
  const valid = l.thr ? FA.lockValid('throw') : (FA.lockValid('pick') || FA.lockValid('use'));
  if (!valid) return;
  const col = Math.sin(t * 8) > 0 ? '#7be0ff' : '#ffffff';
  if (l.thr) R.outlineObj(ctx, v, l.obj, col, t, 1.2);
  else { const p = R.toScreen(v, l.c.x, l.c.y); ctx.strokeStyle = col; ctx.lineWidth = 8; diamond(ctx, p[0], p[1], v.hw * 1.15, v.hh * 1.15); ctx.stroke(); }
  if (l.n > 1) { const p = R.toScreen(v, l.thr ? l.x : l.c.x, l.thr ? l.y : l.c.y); R.iprompt(ctx, p[0], p[1] + 44, R.padMode ? 'RS' : 'TAB', ['ic_swap']); }
};
// the button label for the Builder's pick (take one item) and use (crank / rotate / switch) actions
R.key = which => { const alt = Main.kbShared() && G.swapped; return which === 'pick' ? (R.padMode ? 'A' : alt ? '.' : 'LMB') : (R.padMode ? 'X' : alt ? '/' : 'E'); };
// f.list: up to two prompts ({t, a, key}); a second prompt over the same target stacks above the first
R.drawFocus = function (ctx, v, f, t) {
  f.list.forEach((e, i) => {
    const tg = e.t, a = e.a;
    let x = tg.x, y = tg.y, lift = 120;
    if (tg.kind === 'floor') lift = 56;
    if (tg.kind === 'pile') lift = 74;
    if (tg.kind === 'belt') lift = 56;
    if (tg.kind === 'portal') { y = tg.o.y + (tg.o.y === FA.portal(tg.o.which).y ? 1 : 0); lift = 200; }
    if (i && tg.o === f.list[0].t.o) lift += 48;
    const p = R.toScreen(v, x, y);
    ctx.strokeStyle = Math.sin(t * 6) > 0 ? '#ffec8c' : '#ffd23a'; ctx.lineWidth = 6;
    if (tg.kind === 'bld' || tg.kind === 'belt') { diamond(ctx, p[0], p[1], v.hw * 1.02, v.hh * 1.02); ctx.stroke(); }
    else if (tg.kind !== 'portal') { diamond(ctx, p[0], p[1], 28, 14); ctx.stroke(); }
    const py = p[1] - lift + (Math.sin(t * 3) > 0 ? 0 : 4), mx = CFG.HALF * (R.org ? 2 : 1);
    if (a.ic) R.iprompt(ctx, p[0], py, e.key ? R.key(e.key) : null, a.ic, mx, R.org, e.key === 'use' && !!G.bd.gather);
    else R.prompt(ctx, p[0], py, e.key ? R.key(e.key) : null, a.label, mx, R.org);
  });
};
R.prompt = function (ctx, x, y, key, label, maxX, minX) {
  const draw = c => {
    c.font = '700 22px ' + FONT_B;
    c.font = '12px ' + FONT_D;
    const kb = key ? Math.max(24, Math.ceil(c.measureText(key).width) + 12) : 0, kw = key ? kb + 12 : 0;
    c.font = '700 22px ' + FONT_B;
    const tw = c.measureText(label).width, w = Math.round(tw + kw + 28), h = 40;
    const x0 = Math.round(Math.max((minX || 0) + 8, Math.min((maxX || CFG.HALF) - w - 8, x - w / 2))), y0 = Math.round(y - h / 2);
    const p = 4;
    c.fillStyle = '#1a0f28';
    c.fillRect(x0 + p, y0, w - 2 * p, h); c.fillRect(x0, y0 + p, w, h - 2 * p);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x0 + p, y0 + h, w - 2 * p, p);
    c.fillStyle = key ? '#fff6e0' : '#4a3468';
    c.fillRect(x0 + p, y0 + p, w - 2 * p, h - 2 * p);
    if (key) {
      c.fillStyle = '#1a0f28'; c.fillRect(x0 + 8, y0 + 7, kb + 4, 26);
      c.fillStyle = '#ffb43a'; c.fillRect(x0 + 10, y0 + 9, kb, 20);
      c.fillStyle = '#3a2410'; c.textAlign = 'center'; c.font = '12px ' + FONT_D; c.fillText(key, x0 + 10 + kb / 2, y0 + 25);
    }
    c.font = '700 22px ' + FONT_B; c.textAlign = 'left';
    c.fillStyle = key ? '#3a2848' : '#f0e8ff'; c.fillText(label, x0 + 14 + kw, y0 + 27);
  };
  if (R.defer) R.defer.push(draw); else draw(ctx);
};

// ===================== WIZARD WORLD =====================
R.drawWorld = function (main, dt) {
  const T = CFG.WT, S = T.S, P = T.P, w = G.w;
  const bw = Math.ceil(CFG.HALF / P), bh = CFG.H / P;
  const buf = lowBuffer('w', bw, bh), ctx = buf.x;
  ctx.setTransform(1 / P, 0, 0, 1 / P, -CFG.HALF / P, 0);
  R.px = P; R.org = CFG.HALF; R.defer = [];
  const cam = R.wcam;
  const k = Math.min(1, dt * 8);
  cam.x += (w.x + w.vx * 0.12 - cam.x) * k; cam.y += (w.y + w.vy * 0.12 - cam.y) * k;
  const sh = w.shake > 0 ? w.shake * 24 : 0;
  const v = R.wv; setView(v, cam, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

  ctx.fillStyle = '#2d4a2a'; ctx.fillRect(CFG.HALF, 0, CFG.HALF + P, CFG.H);
  const left = CFG.HALF, right = CFG.W;
  const d0 = Math.floor((-v.oy) / v.hh) - 2, d1 = Math.ceil((CFG.H - v.oy) / v.hh) + 6;
  const uMin = Math.floor((left - v.ox) / v.hw) - 2, uMax = Math.ceil((right - v.ox) / v.hw) + 2;
  const WW = CFG.WW, WH = CFG.WH;
  const objs = [];
  const bk = WZ.bucket, ter = WZ.terrain, pal = WZ.palette;
  const wt = w.t;
  for (let d = Math.max(0, d0); d <= Math.min(WW + WH - 2, d1); d++) {
    for (let u = uMin; u <= uMax; u++) {
      if (((d + u) & 1) !== 0) continue;
      const x = (d + u) / 2, y = (d - u) / 2;
      if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
      const i = y * WW + x;
      const sx = (x - y) * v.hw + v.ox, sy = (x + y + 1) * v.hh + v.oy;
      const tt = ter[i], ty = tt >> 3;
      ctx.fillStyle = pal[tt];
      diamond(ctx, sx, sy, v.hw + 1.5, v.hh + 1.5); ctx.fill();
      if (ty === T_POND && ((x * 7 + y * 3 + Math.floor(wt * 2)) % 9) === 0) { ctx.fillStyle = '#bfe6ff'; ctx.fillRect(Math.round(sx / 3) * 3 - 9, Math.round(sy / 3) * 3, 18, 3); }
      if (ty === T_BOG && ((x * 5 + y * 11) % 4) === 0) { ctx.fillStyle = '#4a5a2a'; ctx.fillRect(Math.round(sx / 3) * 3 - 6, Math.round(sy / 3) * 3 - 3, 12, 6); }
      const b = bk[i];
      if (b) for (let j = 0; j < b.length; j++) {
        const o = b[j];
        if (!o.broken || o.kind === 'bush') objs.push({ d: o.x + o.y, t: o.lm ? 'lm' : o.deco ? 'deco' : o.forage ? 'forage' : 'harv', o });
      }
    }
  }
  for (const z of w.zones) R.drawZone(ctx, v, z);
  for (const f of w.fx_) if (f.type === 'ring' || f.type === 'warn') R.drawFx(ctx, v, f); else if (f.type === 'drop') R.drawDrop(ctx, v, f, true);

  for (const dr of w.drops) objs.push({ d: dr.x + dr.y, t: 'drop', o: dr });
  for (const pk of w.pickups) objs.push({ d: pk.x + pk.y, t: 'pick', o: pk });
  for (const e of w.enemies) objs.push({ d: e.x + e.y, t: 'enemy', o: e });
  objs.push({ d: w.x + w.y, t: 'wiz', o: w });
  objs.sort((a, b) => a.d - b.d);
  for (const it of objs) {
    const o = it.o;
    if (it.t === 'deco') {
      const p = R.toScreen(v, o.x, o.y);
      if (p[0] < left - 60 || p[0] > right + 60) continue;
      dspr(ctx, SP[o.spr], p[0], p[1], S);
    } else if (it.t === 'harv') {
      const p = R.toScreen(v, o.x, o.y), spr = SP[o.kind];
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(snap(p[0] - 18), Math.round(p[1] / 3) * 3 - 3, 36, 9);
      const shake = o.flash > 0 ? (Math.random() < 0.5 ? -3 : 3) : 0;
      dspr(ctx, spr, p[0] + shake, p[1], S);
      if (o.flash > 0) dspr(ctx, { c: spr.white, ax: spr.ax, ay: spr.ay }, p[0] + shake, p[1], S, 0.5);
      if (o.hp < o.maxHp) R.hpBar(ctx, p[0], p[1] - spr.c.height * S - 9, 42, o.hp / o.maxHp, '#7be07b');
    } else if (it.t === 'drop') {
      const p = R.toScreen(v, o.x, o.y);
      const bob = (Math.sin(o.t * 6) > 0 ? 3 : 0) - (o.t < 0.45 ? Math.sin(o.t / 0.45 * 3.14) * 21 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(snap(p[0] - 6), Math.round(p[1] / 3) * 3 - 3, 12, 6);
      const gs = o.kind === 'xp' ? 3 + WZ.gemTier(o.val) + (o.pulse > 0 ? 1 : 0) : 3;   // a Big Gem is a chunkier gem
      if (o.kind === 'xp' && o.val >= CFG.bigGem.tiers[1] && Math.sin(o.t * 8) > 0) { ctx.fillStyle = 'rgba(123,224,255,0.35)'; diamond(ctx, p[0], p[1], 9 * gs, 4.5 * gs); ctx.fill(); }
      dspr(ctx, itemSprite(o.kind), p[0], p[1] - 6 + bob, gs);
    } else if (it.t === 'pick') R.drawPickup(ctx, v, o, wt);
    else if (it.t === 'forage') R.drawForage(ctx, v, o);
    else if (it.t === 'lm') R.drawMark(ctx, v, o.lm);
    else if (it.t === 'enemy') R.drawEnemy(ctx, v, o);
    else if (it.t === 'wiz') R.drawWizard(ctx, v, o);
  }
  for (const p of w.proj) R.drawProj(ctx, v, p);
  for (const p of w.eproj) R.drawProj(ctx, v, p);
  for (const f of w.fx_) if (f.type !== 'ring' && f.type !== 'warn') R.drawFx(ctx, v, f);

  for (const pk of w.pickups) {   // off-screen pointers to pickups
    const p = R.toScreen(v, pk.x, pk.y);
    if (p[0] > left + 20 && p[0] < right - 20 && p[1] > 20 && p[1] < CFG.H - 20) continue;
    const cx = Math.max(left + 36, Math.min(right - 36, p[0])), cy = Math.max(120, Math.min(CFG.H - 40, p[1]));
    pbox(ctx, cx - 24, cy - 24, 48, 48, '#2b1d48');
    R.item(ctx, pk.kind, cx, cy + 15, 3, wt, false);
  }
  if (w.hurtT > 0) {
    ctx.fillStyle = 'rgba(255,40,40,' + Math.min(0.35, w.hurtT) + ')';
    ctx.fillRect(left, 0, 30, CFG.H); ctx.fillRect(right - 30, 0, 30, CFG.H); ctx.fillRect(left, 0, CFG.HALF, 30); ctx.fillRect(left, CFG.H - 30, CFG.HALF, 30);
  }
  if (w.hp > 0 && w.hp < WZ.maxHp() * 0.3 && Math.sin(wt * 6) > 0) {
    ctx.strokeStyle = 'rgba(200,0,30,0.5)'; ctx.lineWidth = 24; ctx.strokeRect(left + 12, 12, CFG.HALF - 24, CFG.H - 24);
  }
  if (R.whint && !w.dead) R.drawWHint(ctx, v, R.whint, wt);
  if (R.mapC) R.defer.push(c => R.drawMinimap(c));
  // the wilds are frozen while anyone is in the skill tree (the DOM banner says so in words)
  if (UI.treeOpen.L || UI.treeOpen.R) { ctx.fillStyle = 'rgba(20,10,40,0.45)'; ctx.fillRect(left, 0, CFG.HALF, CFG.H); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  main.save(); main.beginPath(); main.rect(CFG.HALF, 0, CFG.HALF, CFG.H); main.clip();
  main.imageSmoothingEnabled = false;
  main.drawImage(buf.c, CFG.HALF, 0, bw * P, CFG.H);
  main.restore();
  R.flush(main, CFG.HALF);
};

R.hpBar = function (ctx, x, y, w, fr, col) {
  const p = R.px;
  ctx.fillStyle = '#1a0f28'; ctx.fillRect(snap(x - w / 2 - p), Math.round(y / p) * p - p, Math.round(w / p) * p + 2 * p, 3 * p);
  if (fr > 0) { ctx.fillStyle = col; ctx.fillRect(snap(x - w / 2), Math.round(y / p) * p, Math.max(p, Math.round(w * Math.min(1, fr) / p) * p), p); }
};
R.drawPickup = function (ctx, v, o, t) {
  const p = R.toScreen(v, o.x, o.y);
  const col = ITEMS[o.kind].color;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(snap(p[0] - 15), Math.round(p[1] / 3) * 3 - 3, 30, 9);
  if (o.z <= 0 && Math.sin(t * 5) > 0) { ctx.strokeStyle = col; ctx.lineWidth = 6; diamond(ctx, p[0], p[1], 27, 13); ctx.stroke(); }
  const y = p[1] - o.z * 50 - 9 - (o.z <= 0 && Math.sin(t * 3) > 0 ? 6 : 0);
  R.item(ctx, o.kind, p[0], y, 3, t);
  if (o.full && o.z <= 0) R.defer.push(c => R.iconRow(c, p[0], p[1] - 48, [[CFG.pickups[o.kind].heal ? 'ic_heart' : 'ic_shield'], ['ic_check']]));   // already full
};
R.drawEnemy = function (ctx, v, e) {
  const p = R.toScreen(v, e.x, e.y), S = CFG.WT.S, t = G.w.t;
  const spr = (e.var && SP[e.type + '_' + e.var]) || SP[e.type], fly = e.type === 'sprite' || e.type === 'wisp' || e.fly;
  const fk = e.fall > 0 ? e.fall / (e.fallT0 || CFG.crafted.fall) : 0, hidden = e.fall > 0 && e.fall > (e.fallT0 || 0) - 0.2;   // dropping out of the Egg's portal
  if (hidden) return;
  const hop = e.boss ? (Math.sin(t * 3) > 0 ? 3 : 0) : Math.abs(Math.sin(t * 6 + e.bob)) > 0.5 ? (fly ? 9 : 6) : 0;
  const lift = (fly ? 12 : 0) + fk * 300, sc = (e.elite ? 1.4 : 1) * (e.sz || 1);
  const k = e.land > 0 ? e.land / 0.22 : 0, qx = sc * (1 + 0.28 * k), qy = sc * (1 - 0.28 * k);   // squashes on landing
  const sw = e.boss ? 66 : 24 * sc;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(snap(p[0] - sw / 2), Math.round(p[1] / 3) * 3 - 3, Math.round(sw / 3) * 3, e.boss ? 12 : 6);
  const wfl = e.boss && e.weakFlash > 0;
  if (e.boss) {   // aura in the colour of its current weakness; right after a change it flashes and throws rings out
    ctx.strokeStyle = wfl && Math.sin(t * 12) > 0 ? '#ffffff' : ELEM[e.weak].color; ctx.lineWidth = wfl ? 9 : 6;
    ctx.globalAlpha = wfl ? 1 : Math.sin(t * 5) > 0 ? 0.9 : 0.5;
    diamond(ctx, p[0], p[1], 72, 36); ctx.stroke();
    if (wfl) {
      const kk = 1 + Math.ceil((1 - e.weakFlash / CFG.boss.weakFlash) * 5) / 5 * 1.4;
      ctx.strokeStyle = ELEM[e.weak].color; ctx.globalAlpha = e.weakFlash / CFG.boss.weakFlash;
      diamond(ctx, p[0], p[1], 72 * kk, 36 * kk); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (e.elite) { ctx.strokeStyle = Math.sin(t * 6) > 0 ? '#ffd23a' : '#ffa62a'; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], 27 * (e.sz || 1), 13 * (e.sz || 1)); ctx.stroke(); }
  if (e.crafted) { ctx.strokeStyle = '#46e0c8'; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], 21 * sc, 10 * sc); ctx.stroke(); }   // factory-made: a teal ring
  if (e.slow > 0) { ctx.strokeStyle = '#78c8ff'; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], 18 * sc, 9 * sc); ctx.stroke(); }
  const y = p[1] - hop - lift;
  dsprSq(ctx, spr, p[0], y, S, qx, qy, 1, e.face < 0);
  const wht = { c: spr.white, ax: spr.ax, ay: spr.ay };
  if (e.flash > 0) dsprSq(ctx, wht, p[0], y, S, qx, qy, 0.85, e.face < 0);
  if (e.tele && Math.sin(t * 30) > 0) dsprSq(ctx, wht, p[0], y, S, qx, qy, 0.7, e.face < 0);   // winding up an attack
  if (e.boss) {   // its belly glows with the element that hurts it
    if (wfl && Math.sin(t * 12) > 0) dsprSq(ctx, wht, p[0], y, S, sc, sc, 0.5, e.face < 0);
    ctx.fillStyle = ELEM[e.weak].color; ctx.fillRect(snap(p[0] - 6), Math.round((y - 24) / 3) * 3, 12, 9);
    if (wfl) R.item(ctx, e.weak, p[0], y - spr.c.height * S - 12 + (Math.sin(t * 8) > 0 ? 0 : 6), 3, t);
    return;
  }
  const top = y - spr.c.height * S * sc;
  if (e.warden) { ctx.fillStyle = e.weakCol; ctx.fillRect(snap(p[0] - 6), Math.round((y - 30 * sc) / 3) * 3, 12, 12); }   // the keep's element in its chest
  if (e.ai === 'titan' && e.crack) { ctx.fillStyle = '#2a1410'; for (let i = 0; i < e.crack; i++) ctx.fillRect(snap(p[0] - 24 + i * 21), Math.round((y - 60 * sc + i * 9) / 3) * 3, 3, 24); }
  if (e.dazeT > 0) { ctx.fillStyle = '#ffe36b'; for (let i = 0; i < 3; i++) ctx.fillRect(snap(p[0] + Math.cos(t * 8 + i * 2.1) * 15 - 3), Math.round((top - 6 + Math.sin(t * 8 + i * 2.1) * 4) / 3) * 3, 6, 6); }
  if (e.tele) dspr(ctx, SP.ic_warn, p[0], top - 22, S);
  if (e.hp < e.maxHp) R.hpBar(ctx, p[0], top - 9, e.elite ? 42 : 30, e.hp / e.maxHp, e.elite ? '#ffd23a' : e.crafted ? '#46e0c8' : '#ff6a6a');
  if (e.elite) dspr(ctx, SP.ic_crown, p[0], top - 15, S);
  if (e.mut) dspr(ctx, SP[CFG.mutations[e.mut].ic], p[0] - 27, top - 6, S);   // its mutation
  if (e.weak && (e.elite || CFG.enemies[e.type].weak)) dspr(ctx, SP['wk_' + e.weak], p[0] + (e.elite ? 30 : 21), top + 3, S);
};
// the Wizard's dig / search button: pad 2 A, the roll key otherwise
R.wkey = () => (Main.padW() ? 'A' : !Main.kbShared() || G.swapped ? 'SPACE' : '.');
// forage spots: a glint says "search me", a bar fills while he mashes, a searched bush stands bare until it regrows
R.drawForage = function (ctx, v, o) {
  const w = G.w, p = R.toScreen(v, o.x, o.y), S = CFG.WT.S, t = w.t;
  if (p[0] < CFG.HALF - 60 || p[0] > CFG.W + 60) return;
  if (o.broken) { dspr(ctx, SP.fbush_bare, p[0], p[1], S); return; }
  const spr = SP[o.kind === 'bush' ? 'fbush' : o.kind], shake = o.shake > 0 ? (Math.random() < 0.5 ? -3 : 3) : 0, h = spr.c.height * S;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(snap(p[0] - 21), Math.round(p[1] / 3) * 3 - 3, 42, 9);
  dspr(ctx, spr, p[0] + shake, p[1], S);
  if (o.shake > 0) dspr(ctx, { c: spr.white, ax: spr.ax, ay: spr.ay }, p[0] + shake, p[1], S, 0.35);
  if (Math.sin(t * 2.2 + o.x * 3.1) > 0.8) {
    const gx = snap(p[0] + 12), gy = Math.round((p[1] - h + 6) / 3) * 3;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(gx - 3, gy, 9, 3); ctx.fillRect(gx, gy - 3, 3, 9);
  }
  if (o.prog > 0) R.hpBar(ctx, p[0], p[1] - h - 9, 42, o.prog / CFG.forage[o.kind].taps, '#ffe36b');
  if (w.dig === o && !w.dead) {
    ctx.strokeStyle = Math.sin(t * 6) > 0 ? '#ffec8c' : '#ffd23a'; ctx.lineWidth = 6; diamond(ctx, p[0], p[1], 33, 15); ctx.stroke();
    // key cap hammering away + what's inside (a bush hides a pickup)
    const loot = o.kind === 'bush' ? ['potion'] : Object.keys(CFG.forage[o.kind].drop);
    R.iprompt(ctx, p[0], p[1] - h - 42, R.wkey(), loot, CFG.W, CFG.HALF, true);
  }
};
// landmarks: camps wake when the Wizard walks up, shrines boost harnessers while he stands on them, crypts open if he waits at the door
R.drawMark = function (ctx, v, m) {
  const w = G.w, s = w.lm[m.id], p = R.toScreen(v, m.x, m.y), S = CFG.WT.S, t = w.t, done = s.state === 'done', M = CFG.marks;
  const d = Math.hypot(w.x - m.x, w.y - m.y);
  ctx.fillStyle = done ? 'rgba(0,0,0,0.12)' : 'rgba(40,10,60,0.25)';
  diamond(ctx, p[0], p[1], 2.4 * v.hw, 2.4 * v.hh); ctx.fill();
  let ic = null;   // a row of icons over the landmark instead of a label
  if (m.type === 'camp') {
    dspr(ctx, SP.lm_camp, p[0], p[1], S, done ? 0.5 : 1);
    if (!done) for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i ? '#ffe36b' : '#ff7a30';
      ctx.fillRect(snap(p[0] + Math.sin(t * 7 + i) * 3 - 6 + i * 3), Math.round((p[1] - 9 - ((t * 24 + i * 8) % 18)) / 3) * 3, 9 - i * 3, 9 - i * 3);
    }
    if (s.state === 'active') ic = [['ic_skull', w.enemies.filter(e => e.mark === m.id).length]];   // foes left
  } else if (m.type === 'shrine') {
    const col = ELEM[m.el].color, R0 = M.shrineR * 1.4, on = done && w.shrine === m.el;
    if (s.state === 'active') {
      // the claim mini-game: the ring shrinks onto the crystal; it lights up while it lines up with the target ring
      const k = WZ.shrineRing(s), hit = Math.abs(k - M.shrineTarget) <= M.shrineTol;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.globalAlpha = 0.7;
      diamond(ctx, p[0], p[1], M.shrineTarget * R0 * v.hw, M.shrineTarget * R0 * v.hh); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.miss > 0 ? '#ff5a5a' : s.flash > 0 ? '#ffffff' : hit ? col : shade(col, 0.6); ctx.lineWidth = hit ? 9 : 6;
      const kk = Math.round(k * 12) / 12;   // shrinks in chunky steps
      diamond(ctx, p[0], p[1], kk * R0 * v.hw, kk * R0 * v.hh); ctx.stroke();
      for (let i = 0; i < M.shrineHits; i++) {   // progress pips under the shrine
        const x = p[0] + (i - (M.shrineHits - 1) / 2) * 24, y = p[1] + 27;
        ctx.fillStyle = '#1a0f28'; diamond(ctx, x, y, 12, 9); ctx.fill();
        ctx.fillStyle = i < (s.hits || 0) ? col : '#4a3a5a'; diamond(ctx, x, y, 7.5, 6); ctx.fill();
      }
      R.iprompt(ctx, p[0], p[1] - 150, R.wkey(), null, CFG.W, CFG.HALF, hit);
    } else {
      ctx.strokeStyle = col; ctx.lineWidth = on ? 6 : 3; ctx.globalAlpha = on ? (Math.sin(t * 8) > 0 ? 1 : 0.6) : 0.35;
      diamond(ctx, p[0], p[1], M.shrineR * v.hw * 1.4, M.shrineR * v.hh * 1.4); ctx.stroke(); ctx.globalAlpha = 1;
    }
    dspr(ctx, SP.lm_shrine, p[0], p[1], S);
    dspr(ctx, SP['cr_' + m.el], p[0], p[1] - 39 - (Math.sin(t * (on ? 8 : 3)) > 0 ? 3 : 0), S, done && !on ? 0.6 : 1);
    if (on) {   // boosting: the shrine's power streams up into a little portal (and out of the factory's Spell Portal)
      const top = p[1] - 168, rw = 27 + (Math.sin(t * 6) > 0 ? 3 : 0);
      ctx.fillStyle = '#2a1050'; diamond(ctx, p[0], top, rw, rw / 2.5); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const ph = (t * 1.1 + i / 5) % 1, x = p[0] + Math.sin(ph * 9 + i) * 9 * (1 - ph);
        ctx.fillStyle = i % 2 ? '#ffffff' : col;
        ctx.fillRect(snap(x - 3), Math.round((p[1] - 45 - ph * (p[1] - 45 - top)) / 3) * 3, 6, 6);
      }
    }
  } else if (m.type === 'stronghold') {
    const col = ELEM[m.el].color, K = CFG.strong;
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = done ? 0.2 : 0.5; diamond(ctx, p[0], p[1], 3.4 * v.hw, 3.4 * v.hh); ctx.stroke(); ctx.globalAlpha = 1;
    dspr(ctx, SP.lm_keep, p[0], p[1], S, done ? 0.6 : 1);
    ctx.fillStyle = col; ctx.fillRect(snap(p[0] + 3), Math.round((p[1] - 99) / 3) * 3, 24, 15);   // the banner flies the element's colour
    ctx.fillStyle = '#1a0f28'; ctx.fillRect(snap(p[0] + 3), Math.round((p[1] - 84) / 3) * 3, 12, 6);
    if (done) { if (d < 10) ic = [['ic_check']]; }
    else if (s.state === 'active') ic = [['ic_skull', w.enemies.filter(e => e.mark === m.id).length], ['wk_' + WZ.WARDEN_WEAK(m.el)]];
    else if (s.seen && d < K.reveal + 6) { const g = K.guards[m.el]; ic = Object.keys(g).map(k => ['egg_' + k, g[k]]).concat([['ic_crown'], ['wk_' + WZ.WARDEN_WEAK(m.el)]]); }   // scouted: guards, Warden, its weakness
    else if (d < K.reveal + 6 && Math.sin(t * 3) > 0) ic = [['ic_keep']];
  } else {
    dspr(ctx, SP.lm_crypt, p[0], p[1], S, done ? 0.6 : 1);
    if (s.state === 'idle') {
      if (s.t > 0) R.hpBar(ctx, p[0], p[1] + 12, 48, s.t / M.cryptHold, '#b07aff');
      else if (d < 8 && Math.sin(t * 3) > 0) ic = [['ic_clock']];   // wait at the door
    } else if (!done) ic = [['ic_skull']];
  }
  if (done && d < 8 && m.type !== 'shrine') ic = [['ic_check']];
  if (ic && d < (m.type === 'stronghold' ? CFG.strong.reveal + 6 : 13)) R.defer.push(c => R.iconRow(c, p[0], p[1] - (m.type === 'stronghold' ? 126 : 96), ic));
};
// goal pointer in the wilds: an arrow over the target, or a boxed pointer on the edge with the distance
R.drawWHint = function (ctx, v, h, t) {
  const p = R.toScreen(v, h.x, h.y), left = CFG.HALF;
  const on = p[0] > left + 40 && p[0] < CFG.W - 40 && p[1] > 200 && p[1] < CFG.H - 40;
  const bob = Math.sin(t * 6) > 0 ? 0 : 6;
  if (on) { R.arrow(ctx, p[0], p[1] - (h.lift || 80) - bob, 0, 1); return; }
  const cx = Math.max(left + 60, Math.min(CFG.W - 60, p[0])), cy = Math.max(200, Math.min(CFG.H - 200, p[1]));
  const dx = p[0] - cx, dy = p[1] - cy, m = Math.hypot(dx, dy) || 1;
  R.arrow(ctx, cx + dx / m * (20 - bob), cy + dy / m * (20 - bob), dx / m, dy / m);
  txt(ctx, Math.round(Math.hypot(h.x - G.w.x, h.y - G.w.y)) + 'm', cx - dx / m * 50, cy - dy / m * 50 + 6, 12, '#ffe36b', 'center', 'd');
};
// ---------- minimap: the whole wilds as a little iso diamond in the bottom-right corner ----------
R.buildMap = function () {
  const c = document.createElement('canvas'); c.width = CFG.WW; c.height = CFG.WH;
  const x = c.getContext('2d'), img = x.createImageData(CFG.WW, CFG.WH);
  const cols = [[74, 138, 58], [122, 90, 58], [200, 176, 112], [106, 154, 74], [46, 90, 42], [58, 122, 200], [184, 154, 106], [74, 90, 42]];
  for (let i = 0; i < CFG.WW * CFG.WH; i++) { const k = cols[WZ.terrain[i] >> 3]; img.data[i * 4] = k[0]; img.data[i * 4 + 1] = k[1]; img.data[i * 4 + 2] = k[2]; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  R.mapC = c;
};
R.drawMinimap = function (c) {
  const w = G.w, cx = CFG.W - 124, cy = CFG.H - 74, t = w.t;
  const at = (x, y) => [Math.round(cx + (x - y) * 0.5), Math.round(cy + (x + y - CFG.WW) * 0.25)];
  c.save();
  c.fillStyle = '#1a0f28';
  c.beginPath(); c.moveTo(cx, cy - 58); c.lineTo(cx + 108, cy); c.lineTo(cx, cy + 58); c.lineTo(cx - 108, cy); c.closePath(); c.fill();
  c.imageSmoothingEnabled = false;
  c.globalAlpha = 0.9;
  c.transform(0.5, 0.25, -0.5, 0.25, cx, cy - CFG.WW * 0.25);
  c.drawImage(R.mapC, 0, 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  const dot = (x, y, s, col) => { const q = at(x, y); c.fillStyle = '#1a0f28'; c.fillRect(q[0] - s / 2 - 2, q[1] - s / 2 - 2, s + 4, s + 4); c.fillStyle = col; c.fillRect(q[0] - s / 2, q[1] - s / 2, s, s); };
  for (const m of WZ.marks) {
    const done = w.lm[m.id].state === 'done';
    dot(m.x, m.y, done ? 4 : m.type === 'stronghold' ? 9 : 6, done ? '#6a6a7a' : m.type === 'camp' ? '#ff5a4a' : m.type === 'crypt' ? '#b07aff' : ELEM[m.el].color);
    if (m.type === 'stronghold' && !done) { const q = at(m.x, m.y); c.fillStyle = '#ffe36b'; c.fillRect(q[0] - 1, q[1] - 11, 2, 5); }   // a flag over the keep
  }
  // the nearest scouted Stronghold: its guards, a crown for the Warden and what the Warden fears, as icons above the map
  let kp = null, kd = 1e9;
  for (const m of WZ.marks) if (m.type === 'stronghold' && w.lm[m.id].seen && w.lm[m.id].state !== 'done') { const dd = Math.hypot(m.x - w.x, m.y - w.y); if (dd < kd) { kd = dd; kp = m; } }
  if (kp) { const g = CFG.strong.guards[kp.el]; R.iconRow(c, cx, cy - 72, Object.keys(g).map(k => ['egg_' + k, g[k]]).concat([['ic_crown'], ['wk_' + WZ.WARDEN_WEAK(kp.el)]])); }
  if (w.boss && Math.sin(t * 10) > 0) dot(w.boss.x, w.boss.y, 10, '#ff4a8a');
  if (R.whint) dot(R.whint.x, R.whint.y, 6, Math.sin(t * 8) > 0 ? '#ffd23a' : '#ffffff');
  dot(w.x, w.y, 6, Math.sin(t * 6) > -0.5 ? '#ffffff' : '#7be0ff');
  c.font = '8px ' + FONT_D; c.textAlign = 'center'; c.fillStyle = '#c8b8e8'; c.fillText('MAP', cx, cy - 64);
  c.restore();
};
R.drawWizard = function (ctx, v, w) {
  const p = R.toScreenLocked(v, w.x, w.y), S = CFG.WT.S, spr = SP.wizard;
  for (const gh of w.ghosts) {
    const q = R.toScreen(v, gh.x, gh.y);
    dspr(ctx, { c: spr.white, ax: spr.ax, ay: spr.ay }, q[0], q[1], S, 0.35 * (1 - gh.t / 0.25));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(snap(p[0] - 15), Math.round(p[1] / 3) * 3 - 3, 30, 9);
  if (w.armor > 0) { ctx.strokeStyle = Math.sin(w.t * 4) > 0 ? '#9fc4ff' : '#6a90e0'; ctx.lineWidth = 3; ctx.strokeRect(snap(p[0] - 27), Math.round((p[1] - 60) / 3) * 3, 54, 63); }
  const bob = w.moving ? (Math.abs(Math.sin(w.bob)) > 0.5 ? 3 : 0) : 0;
  const flip = (w.fx - w.fy) < -0.05;
  if (w.dead) { ctx.save(); ctx.translate(snap(p[0]), p[1]); ctx.rotate(Math.PI / 2); ctx.drawImage(spr.c, -spr.ax * S, -spr.ay * S, spr.c.width * S, spr.c.height * S); ctx.restore(); return; }
  if (w.roll > 0) {
    const fr = 1 - w.roll / CFG.wizard.rollTime, step = Math.floor(fr * 8) / 8;   // somersault in 8 chunky frames
    // i-frames: he strobes between see-through and a white silhouette, so it's clear he can't be hit
    const ghost = Math.floor(w.roll * 30) % 2 === 0;
    ctx.save(); ctx.translate(snap(p[0]), p[1] - 24); ctx.rotate(step * 6.283 * (flip ? -1 : 1));
    ctx.globalAlpha = ghost ? 0.4 : 0.9;
    ctx.drawImage(ghost ? spr.c : spr.white, -spr.ax * S, -spr.ay * S + 24, spr.c.width * S, spr.c.height * S); ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
  const blink = w.hurtT > 0 && Math.floor(w.hurtT * 20) % 2;
  if (w.mashT > 0) dsprSq(ctx, spr, p[0], p[1] - bob, S, 1.15, 0.85, blink ? 0.4 : 1, flip);   // squashed while digging
  else dspr(ctx, spr, p[0], p[1] - bob, S, blink ? 0.4 : 1, flip);
  if (Math.sin(G.w.t * 6) > 0) { ctx.fillStyle = '#fff07a'; ctx.fillRect(snap(p[0] + (flip ? -27 : 21)), Math.round((p[1] - 48 - bob) / 3) * 3, 6, 6); }
  if (w.rollCd > 0) R.hpBar(ctx, p[0], p[1] + 9, 27, 1 - w.rollCd / CFG.wizard.rollCd, '#ffffff');
};
R.drawProj = function (ctx, v, p) {
  const s = R.toScreen(v, p.x, p.y), sz = Math.max(6, Math.round(p.size * 1.4 / 3) * 3);
  const x = snap(s[0] - sz / 2), y = Math.round((s[1] - 15 - sz / 2) / 3) * 3;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, Math.round(s[1] / 3) * 3 - 3, sz, 6);
  ctx.fillStyle = p.col; ctx.globalAlpha = 0.45;
  ctx.fillRect(snap(x - p.vx * 1.4), Math.round((y - p.vy * 0.7) / 3) * 3, sz, sz);
  ctx.globalAlpha = 1;
  ctx.fillRect(x - 3, y, sz + 6, sz); ctx.fillRect(x, y - 3, sz, sz + 6);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 6, 6);
};
R.drawZone = function (ctx, v, z) {
  const s = R.toScreen(v, z.x, z.y), fr = Math.min(1, z.t / z.dur);
  const rx = z.r * v.hw * 1.414, ry = z.r * v.hh * 1.414;
  ctx.globalAlpha = Math.min(0.35, fr * 0.6);
  ctx.fillStyle = z.col; diamond(ctx, s[0], s[1], rx, ry); ctx.fill();
  ctx.globalAlpha = Math.min(0.8, fr);
  ctx.strokeStyle = z.col; ctx.lineWidth = 6; ctx.setLineDash([18, 12]); ctx.lineDashOffset = -Math.floor(G.w.t * 10) * 6;
  diamond(ctx, s[0], s[1], rx, ry); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 1;
};
R.drawFx = function (ctx, v, f) {
  const s = R.toScreen(v, f.x !== undefined ? f.x : f.pts[0][0], f.y !== undefined ? f.y : f.pts[0][1]);
  const fr = f.t / f.dur, K = 1.414;
  if (f.type === 'ring') {
    const st = Math.ceil(fr * 5) / 5;   // grows in 5 chunky steps
    ctx.globalAlpha = 1 - fr; ctx.strokeStyle = f.col; ctx.lineWidth = 9;
    diamond(ctx, s[0], s[1], f.r * st * v.hw * K, f.r * st * v.hh * K); ctx.stroke();
    ctx.globalAlpha = (1 - fr) * 0.22; ctx.fillStyle = f.col; ctx.fill(); ctx.globalAlpha = 1;
  } else if (f.type === 'boom') {
    const st = 0.4 + Math.ceil(fr * 3) / 3 * 0.6;
    ctx.globalAlpha = 1 - fr; ctx.fillStyle = f.col;
    diamond(ctx, s[0], s[1] - 6, f.r * st * v.hw * K, f.r * st * v.hh * K * 1.2); ctx.fill(); ctx.globalAlpha = 1;
  } else if (f.type === 'warn') {
    if (Math.sin(fr * 30) > 0) { ctx.strokeStyle = f.col; ctx.lineWidth = 6; diamond(ctx, s[0], s[1], f.r * v.hw * K, f.r * v.hh * K); ctx.stroke(); }
  } else if (f.type === 'meteor') {
    const h = (1 - fr) * 320;
    ctx.fillStyle = 'rgba(255,80,40,0.3)'; diamond(ctx, s[0], s[1], 2.2 * v.hw * fr * K, 2.2 * v.hh * fr * K); ctx.fill();
    ctx.fillStyle = '#ffc850'; for (let i = 1; i < 5; i++) ctx.fillRect(snap(s[0] + h * 0.3 + i * 9), Math.round((s[1] - h - i * 27) / 3) * 3, 12 - i * 2, 12 - i * 2);
    ctx.fillStyle = '#ff7a30'; ctx.fillRect(snap(s[0] + h * 0.3 - 12), Math.round((s[1] - h - 12) / 3) * 3, 24, 24);
  } else if (f.type === 'bolt') {
    ctx.globalAlpha = 1 - fr; ctx.strokeStyle = f.col; ctx.lineWidth = 9; ctx.lineJoin = 'miter';
    ctx.beginPath();
    for (let i = 0; i < f.pts.length; i++) {
      const q = R.toScreen(v, f.pts[i][0], f.pts[i][1]);
      if (i === 0) ctx.moveTo(q[0], q[1] - 27);
      else {
        const pr = R.toScreen(v, f.pts[i - 1][0], f.pts[i - 1][1]);
        for (let j = 1; j <= 4; j++) {
          const a = j / 4;
          ctx.lineTo(pr[0] + (q[0] - pr[0]) * a + (j < 4 ? (Math.random() - 0.5) * 24 : 0), pr[1] - 27 + (q[1] - pr[1]) * a + (j < 4 ? (Math.random() - 0.5) * 24 : 0));
        }
      }
    }
    ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
  } else if (f.type === 'num') {
    ctx.globalAlpha = 1 - Math.max(0, fr - 0.5) * 2;
    txt(ctx, f.text, s[0], s[1] - 54 - Math.floor(fr * 6) * 6, 16, f.col, 'center', 'd');
    ctx.globalAlpha = 1;
  } else if (f.type === 'spark') {
    ctx.globalAlpha = 1 - fr; ctx.fillStyle = f.col;
    if (f.el) R.elPix(ctx, f.el, snap(s[0]), Math.round((s[1] - f.z * 30) / 3) * 3, 3);
    else ctx.fillRect(snap(s[0] - 3), Math.round((s[1] - f.z * 30 - 3) / 3) * 3, 6, 6);
    ctx.globalAlpha = 1;
  } else if (f.type === 'beam') {
    ctx.globalAlpha = (1 - fr) * 0.7; ctx.fillStyle = f.col;
    const wdt = Math.round((28 * (1 - fr) + 9) / 3) * 3;
    ctx.fillRect(snap(s[0] - wdt / 2), s[1] - 500, wdt, 500);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(s[0] - 3), s[1] - 500, 6, 500);
    ctx.globalAlpha = 1;
  } else if (f.type === 'drop') R.drawDrop(ctx, v, f, false);
  else if (f.type === 'arrive') {   // the spell's drop-in landed: it bursts at the Wizard's feet
    const w = G.w, q = R.toScreenLocked(v, w.x, w.y);
    ctx.globalAlpha = 1 - fr; ctx.strokeStyle = f.col; ctx.lineWidth = 9;
    diamond(ctx, q[0], q[1], (1 + fr * (f.big ? 3 : 2)) * v.hw, (1 + fr * (f.big ? 3 : 2)) * v.hh); ctx.stroke();
    ctx.fillStyle = f.col;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + fr * 4, r = 12 + fr * 40;
      ctx.fillRect(snap(q[0] + Math.cos(a) * r - 4), Math.round((q[1] - 30 + Math.sin(a) * r * 0.5 - fr * 30) / 3) * 3, 9, 9);
    }
    ctx.globalAlpha = 1;
  } else if (f.type === 'hatch') {   // a portal tears open above the landing spot and the creature drops out of it
    const top = s[1] - 300, open = f.t < 0.2 ? f.t / 0.2 : Math.max(0, Math.min(1, (f.dur - f.t) / 0.5)), rw = Math.round(42 * open / 3) * 3;
    if (rw > 0) {
      ctx.globalAlpha = 0.22 * open; ctx.fillStyle = f.col; ctx.fillRect(snap(s[0] - 9), top, 18, 300); ctx.globalAlpha = 1;
      ctx.fillStyle = '#2a1050'; diamond(ctx, s[0], top, rw, rw / 2.5); ctx.fill();
      ctx.strokeStyle = f.col; ctx.lineWidth = 6; ctx.stroke();
    }
  } else if (f.type === 'icon') {   // a collected resource floating up off the Wizard
    const a = 1 - Math.max(0, fr - 0.5) * 2, y = s[1] - 60 - Math.floor(fr * 6) * 6;
    R.defer.push(c => R.iconRow(c, s[0], y, [[f.k]], a));
  } else if (f.type === 'title') {
    const q = R.toScreen(v, G.w.x, G.w.y);
    ctx.globalAlpha = 1 - Math.max(0, fr - 0.6) / 0.4;
    txt(ctx, f.text, q[0], q[1] + 66 - Math.floor(fr * 6) * 3, 20, f.col, 'center', 'd');   // under his feet, clear of the toasts
    ctx.globalAlpha = 1;
  }
};
// a delivered spell on its way in (WZ.incoming): every spell has its own themed drop-in out of a little portal over
// the Wizard, plus a ring closing in on his feet that blinks just before it casts, so he can read the timing.
// Drawn twice: ground = true under the bodies (rings, shadows, puddles), then the falling part over them.
R.drawDrop = function (ctx, v, f, ground) {
  const w = G.w;
  if (w.dead) return;
  const q = R.toScreenLocked(v, w.x, w.y), cx = q[0], fr = Math.min(1, f.t / f.dur), t = f.t, sd = f.seed || 0;
  const Y = y => Math.round(y / 3) * 3, c01 = x => Math.max(0, Math.min(1, x)), ease = p => p * p;
  const blk = (x, y, sz, col) => { sz = Math.round(sz / 3) * 3; if (sz <= 0) return; ctx.fillStyle = col; ctx.fillRect(snap(x - sz / 2), Y(y - sz / 2), sz, sz); };
  const top = q[1] - (f.big ? 126 : 105), land = q[1] - 33, R0 = f.big ? 42 : 30;
  const open = Math.min(1, fr / 0.18) * (fr > 0.85 ? (1 - fr) / 0.15 : 1);
  const portal = (y, rw, rim, core) => {
    rw = Math.round(rw * open / 3) * 3;
    if (rw <= 0) return;
    ctx.fillStyle = core || '#2a1050'; diamond(ctx, cx, y, rw, rw / 2.5); ctx.fill();
    ctx.strokeStyle = rim || f.col; ctx.lineWidth = 6; ctx.stroke();
  };
  const flat = (r, col, a) => { ctx.globalAlpha = a; ctx.fillStyle = col; diamond(ctx, cx, q[1], r * v.hw * 1.414, r * v.hh * 1.414); ctx.fill(); ctx.globalAlpha = 1; };
  if (ground) {
    // the shared telegraph: a dashed ring closing in on his feet, blinking fast at the end
    const rr = 0.6 + (1 - fr) * 1.4;
    if (fr < 0.7 || Math.floor(t * 20) % 2) {
      ctx.globalAlpha = 0.5 + fr * 0.5; ctx.strokeStyle = f.col; ctx.lineWidth = 6; ctx.setLineDash([12, 9]); ctx.lineDashOffset = -Math.floor(t * 12) * 3;
      diamond(ctx, cx, q[1], rr * v.hw * 1.414, rr * v.hh * 1.414); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // aimed spells: chevrons light up along the way they'll fly
    if (['fireball', 'boulder', 'magma', 'spray', 'flamethrower'].indexOf(f.spell) >= 0) {
      const a = WZ.aim(), dx = (a[0] - a[1]) * v.hw, dy = (a[0] + a[1]) * v.hh;
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = Math.floor(t * 10) % 3 === i - 1 ? 1 : 0.4;
        const x = cx + dx * (0.9 + i * 0.6), y = q[1] + dy * (0.9 + i * 0.6);
        blk(x, y, 9, f.col); blk(x + dx * 0.25, y + dy * 0.25, 6, f.col);
      }
      ctx.globalAlpha = 1;
    }
  }
  switch (f.spell) {
    case 'gust':   // wind streaks spiral down out of the portal and wrap round him
      if (ground) break;
      portal(top, R0);
      for (let i = 0; i < 10; i++) {
        const p = c01((fr - 0.12 - i * 0.045) / 0.45);
        if (p <= 0 || p >= 1) continue;
        const a = i * 2.4 + p * 9 + sd, r = 33 * (1 - p * 0.3), x = cx + Math.cos(a) * r, y = top + (land - top) * p + Math.sin(a) * r * 0.3;
        ctx.globalAlpha = 1 - p * 0.5; ctx.fillStyle = i % 2 ? '#ffffff' : f.col;
        ctx.fillRect(snap(x - 9), Y(y), 18, 3); ctx.fillRect(snap(x + (Math.sin(a) > 0 ? 6 : -12)), Y(y - 3), 6, 3);
      }
      ctx.globalAlpha = 1;
      break;
    case 'fireball': {   // a ball of fire drops through, trailing flame
      if (ground) { flat(0.5 + fr * 0.4, '#ff7a30', fr * 0.3); break; }
      portal(top, R0);
      if (fr < 0.2) break;
      const p = ease(c01((fr - 0.2) / 0.8)), y = top + (land - top) * p, FL = ['#fff3a0', '#ffc850', '#ff7a30', '#c83a10'];
      for (let i = 4; i >= 1; i--) blk(cx + (Math.floor(t * 30 + i) % 2 ? 3 : -3), y - i * 12 * (0.4 + p), 18 - i * 3, FL[i - 1]);
      blk(cx, y, 24, '#ff7a30'); blk(cx, y + 3, 12, '#fff3a0');
      break;
    }
    case 'spray':   // droplets rain down in columns and pool at his feet
      if (ground) { flat(0.3 + fr * 0.6, f.col, 0.35); break; }
      portal(top, R0);
      for (let i = 0; i < 10; i++) {
        const p = ease(c01((fr - 0.15 - (i % 5) * 0.06 - (i > 4 ? 0.25 : 0)) / 0.35));
        if (p <= 0 || p >= 1) continue;
        const x = cx + ((i * 3) % 5 - 2) * 12, y = top + (q[1] - 9 - top) * p;
        ctx.fillStyle = f.col; ctx.fillRect(snap(x - 3), Y(y - 6), 6, 3); ctx.fillRect(snap(x - 6), Y(y - 3), 12, 9);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(x - 3), Y(y), 3, 3);
      }
      break;
    case 'boulder': {   // a rock tumbles out, its shadow growing under him
      const p = ease(c01((fr - 0.25) / 0.75));
      if (ground) { flat(0.3 + p * 0.6, '#000000', 0.15 + p * 0.25); break; }
      portal(top, R0 + 6);
      if (fr < 0.25) break;
      const y = top + (land - top) * p, fz = Math.floor(t * 14) % 2;
      ctx.fillStyle = '#5a4026'; ctx.fillRect(snap(cx - 15), Y(y - 12), 30, 24); ctx.fillRect(snap(cx - 12), Y(y - 15), 24, 30);
      ctx.fillStyle = '#b58a4c'; ctx.fillRect(snap(cx - 12), Y(y - 9), 24, 18); ctx.fillRect(snap(cx - 9), Y(y - 12), 18, 24);
      ctx.fillStyle = '#8a6a3c'; ctx.fillRect(snap(cx + (fz ? 0 : -9)), Y(y + (fz ? 0 : -6)), 9, 6);   // tumbling: the facets flip
      ctx.fillStyle = '#e0c088'; ctx.fillRect(snap(cx + (fz ? -9 : 3)), Y(y + (fz ? -9 : 3)), 6, 3);
      for (let i = 0; i < 3; i++) blk(cx + (i - 1) * 12 + (fz ? 3 : -3), y - 24 - i * 9 - p * 12, 6, '#8a6a3c');   // grit shaken loose
      break;
    }
    case 'flamethrower': {   // the portal pours a widening, flickering column of flame
      if (ground) { if (fr > 0.5) flat(0.7, '#ff9a2b', 0.2 + (Math.floor(t * 20) % 2) * 0.1); break; }
      portal(top, R0);
      const bot = top + (q[1] - 12 - top) * c01((fr - 0.15) / 0.45), FL = ['#fff3a0', '#ffc850', '#ff9a2b', '#e0481a'];
      for (let y = top + 6, j = 0; y < bot; y += 9, j++) {
        const wd = 6 + (y - top) * 0.25, jit = Math.sin(t * 40 + j * 1.7 + sd) * 6;
        ctx.fillStyle = FL[(j + Math.floor(t * 20)) % 4]; ctx.fillRect(snap(cx - wd / 2 + jit), Y(y), Math.round(wd / 3) * 3, 9);
      }
      break;
    }
    case 'steam':   // puffs billow down and gather into a cloud round him
      if (ground) break;
      portal(top, R0, '#c8ccd8');
      for (let i = 0; i < 8; i++) {
        const p = c01((fr - 0.12 - i * 0.05) / 0.5);
        if (p <= 0) continue;
        const a = i * 2.3 + sd, x = cx + Math.cos(a) * p * 36, y = top + (q[1] - 24 - top) * Math.sqrt(p) + Math.sin(a) * p * 9, sz = 12 + p * 15;
        ctx.globalAlpha = 0.85 - p * 0.35;
        blk(x, y, sz, i % 3 ? '#f4f4f8' : '#c8ccd8'); blk(x + sz * 0.4, y - sz * 0.3, sz * 0.66, '#ffffff');
      }
      ctx.globalAlpha = 1;
      break;
    case 'sandstorm': {   // a sand funnel twists down from the portal, wide at the top, narrow at his feet
      if (ground) { flat(0.4 + fr * 0.5, f.col, 0.25); break; }
      portal(top, R0, '#b08a40');
      const bot = top + (q[1] - 6 - top) * c01((fr - 0.1) / 0.6);
      for (let L = 0; L < 9; L++) {
        const y = top + 9 + L * 11, r = 36 - L * 3.5;
        if (y > bot) break;
        for (let g = 0; g < 3; g++) {
          const a = t * 14 + L * 0.9 + g * 2.09 + sd;
          ctx.globalAlpha = Math.sin(a) > 0 ? 1 : 0.5;   // the back of the funnel is fainter
          blk(cx + Math.cos(a) * r, y + Math.sin(a) * r * 0.25, 6, g ? '#d9b46a' : '#8a6a3c');
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'magma': {   // a glob of molten rock oozes out on a stretching neck, drips run ahead, then it drops
      if (ground) { flat(0.4 + fr * 0.5, '#ff4a1a', 0.15 + fr * 0.2 + (Math.floor(t * 12) % 2) * 0.08); break; }
      portal(top, R0, '#ff4a1a', '#3a0a08');
      if (fr < 0.15) break;
      const ooze = c01((fr - 0.15) / 0.35), p = ease(c01((fr - 0.5) / 0.5));
      const y = fr < 0.5 ? top + 6 + ooze * 15 : top + 21 + (land - top - 21) * p, sz = fr < 0.5 ? 9 + Math.round(ooze * 4) * 3 : 21;
      if (fr < 0.5) { ctx.fillStyle = '#c83a10'; ctx.fillRect(snap(cx - 6), Y(top), 12, Y(y - top)); }
      for (let i = 0; i < 3; i++) { const d = c01(fr * 2.2 - 0.6 - i * 0.3); if (d > 0 && d < 1) blk(cx + (i - 1) * 9, top + 9 + (land - top) * ease(d), 6, i % 2 ? '#ffc850' : '#ff4a1a'); }
      blk(cx, y, sz + 6, '#3a0a08'); blk(cx, y, sz, '#ff4a1a'); blk(cx - 3, y - 3, Math.max(3, sz - 12), '#ffc850');
      break;
    }
    case 'tempest': {   // a storm cloud gathers over the portal, slanting rain, lightning flickering inside
      if (ground) break;
      portal(top, R0, '#9aa8d8');
      const grow = c01(fr / 0.3);
      if (fr > 0.15) for (let i = 0; i < 12; i++) {
        const p = (t * 2.6 + i * 0.37 + sd) % 1, x = cx + ((i * 7) % 11 - 5) * 7 - p * 15, y = top + 6 + (q[1] - 12 - top) * p;
        ctx.fillStyle = '#bfe9ff'; ctx.fillRect(snap(x), Y(y), 3, 9);
      }
      for (let i = 0; i < 5; i++) blk(cx + (i - 2) * 15 * grow, top - 6 + Math.sin(i * 1.3 + sd + t * 3) * 3 - (i % 2) * 9, (15 + (i % 2) * 6) * grow, i % 2 ? '#7a84a8' : '#5a6488');
      if (fr > 0.55 && Math.floor(t * 25) % 3 === 0) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(cx - 9, top - 6); ctx.lineTo(cx + 3, top + 9); ctx.lineTo(cx - 6, top + 18); ctx.lineTo(cx + 6, top + 33); ctx.stroke();
      }
      break;
    }
    case 'mud': {   // gloopy blobs arc out and splat round his feet; the target gets marked
      const spots = [];
      for (let i = 0; i < 4; i++) {
        const p = c01((fr - 0.15 - i * 0.12) / 0.45), a = i * 1.571 + sd + 0.8, ex = Math.cos(a) * 1.1, ey = Math.sin(a) * 1.1;
        spots.push([p, cx + (ex - ey) * v.hw * p, q[1] + (ex + ey) * v.hh * p]);
      }
      if (ground) {
        ctx.fillStyle = '#6e4a2a';
        for (const s of spots) if (s[0] >= 1) { diamond(ctx, s[1], s[2], 18, 9); ctx.fill(); }
        const e = WZ.nearest(w.x, w.y, CFG.spells.mud.range);
        if (e && Math.floor(t * 12) % 2) {
          const p = R.toScreen(v, e.x, e.y);
          ctx.strokeStyle = f.col; ctx.lineWidth = 6; ctx.setLineDash([9, 6]); diamond(ctx, p[0], p[1], 1.2 * v.hw, 1.2 * v.hh); ctx.stroke(); ctx.setLineDash([]);
        }
        break;
      }
      portal(top, R0, '#8a5a2a');
      for (const s of spots) if (s[0] > 0 && s[0] < 1) {
        const y = top + (s[2] - top) * s[0] - Math.sin(s[0] * Math.PI) * 30;
        blk(s[1], y, 12, '#6e4a2a'); blk(s[1] - 3, y - 3, 6, '#a07a4a');
      }
      break;
    }
    case 'meteor': {   // a bigger portal glows white-hot, then a burning rock punches through at a slant
      if (ground) { flat(0.5 + c01((fr - 0.4) / 0.6) * 1.2, '#ff5028', 0.25); break; }
      const pt = top - 15, heat = c01(fr / 0.4);
      portal(pt, R0 + 12, '#ff4a1a', '#3a0a08');
      if (fr < 0.45) { ctx.globalAlpha = heat * 0.6; ctx.fillStyle = '#ffc850'; diamond(ctx, cx, pt, R0 * heat, R0 * heat / 2.5); ctx.fill(); ctx.globalAlpha = 1; }
      for (let i = 0; i < 4; i++) blk(cx + Math.sin(i * 2.1 + sd) * R0, pt + ((t * 3 + i * 0.25) % 1) * 36, 3, '#ffc850');   // embers off the rim
      if (fr < 0.4) break;
      const p = ease(c01((fr - 0.4) / 0.6)), x = cx + (1 - p) * 30, y = pt + (land - pt) * p;
      for (let i = 1; i < 6; i++) blk(x + i * 9, y - i * 15, 18 - i * 3, i < 3 ? '#ffc850' : '#ff7a30');
      blk(x, y, 27, '#5a2a14'); blk(x - 3, y - 3, 15, '#ff7a30'); blk(x - 3, y - 6, 6, '#fff3a0');
      break;
    }
    case 'thunder': {   // the portal crackles with sparks, then a jagged bolt cracks down onto him
      if (ground) { if (fr > 0.7 && Math.floor(t * 30) % 2) flat(0.8, '#fff27a', 0.35); break; }
      portal(top, R0, '#fff27a', '#2a2050');
      if (Math.floor(t * 30) % 2) for (let i = 0; i < 3; i++) {
        const a = sd + i * 2.1 + Math.floor(t * 15), x0 = cx + Math.cos(a) * R0, y0 = top + Math.sin(a) * R0 * 0.4;
        ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(a) * 9 + 6, y0 + 6); ctx.lineTo(x0 + Math.cos(a) * 18, y0 + 3); ctx.stroke();
      }
      for (let i = 0; i < 5; i++) blk(cx + Math.sin(t * 17 + i * 2.7) * (R0 + 9), top + Math.cos(t * 13 + i) * 15, 3, '#ffffff');
      if (fr > 0.7 && Math.floor(t * 30) % 2) {
        ctx.beginPath(); ctx.moveTo(cx, top);
        for (let j = 1; j <= 5; j++) ctx.lineTo(cx + (j < 5 ? (Math.random() - 0.5) * 30 : 0), top + (q[1] - 9 - top) * j / 5);
        ctx.strokeStyle = '#fff27a'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
      }
      break;
    }
    case 'blizzard':   // snowflakes swirl down, spreading out, as frost creeps over the ground
      if (ground) {
        flat(0.4 + fr * 0.9, '#dff4ff', 0.3);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) { const a = i * 1.047 + sd; if (fr > 0.2 + i * 0.1) ctx.fillRect(snap(cx + Math.cos(a) * fr * 42), Y(q[1] + Math.sin(a) * fr * 21), 6, 3); }
        break;
      }
      portal(top, R0, '#dff4ff');
      for (let i = 0; i < 12; i++) {
        const p = c01((fr - 0.1 - i * 0.04) / 0.45);
        if (p <= 0 || p >= 1) continue;
        const a = i * 2.4 + sd + p * 5, r = 9 + p * 45 * ((i % 3) / 3 + 0.4), x = snap(cx + Math.cos(a) * r), y = Y(top + (q[1] - 6 - top) * p + Math.sin(a) * r * 0.3);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#bfe9ff'; ctx.fillRect(x - 3, y, 9, 3); ctx.fillRect(x, y - 3, 3, 9);
      }
      break;
    case 'geyser': {   // this one opens UNDER him: bubbles rise out of a ground portal, then the water starts to spout
      if (ground) {
        const rw = Math.round((R0 + 9) * open / 3) * 3;
        if (rw > 0) {
          ctx.fillStyle = '#10204a'; diamond(ctx, cx, q[1], rw, rw / 2); ctx.fill(); ctx.strokeStyle = f.col; ctx.lineWidth = 6; ctx.stroke();
          ctx.fillStyle = '#7ad0ff'; diamond(ctx, cx, q[1], rw * fr * 0.8, rw * fr * 0.4); ctx.fill();
        }
        break;
      }
      for (let i = 0; i < 8; i++) {
        const p = (t * 1.8 + i * 0.13 + sd) % 1, x = cx + Math.sin(i * 2.7 + sd) * 18 * open, y = q[1] - p * 45;
        if (fr < 0.1) break;
        ctx.globalAlpha = 1 - p; blk(x, y, 6, f.col); blk(x - 1, y - 1, 3, '#ffffff');
      }
      ctx.globalAlpha = 1;
      if (fr > 0.75) {
        const h = Math.round((fr - 0.75) / 0.25 * 30 / 3) * 3 + (Math.floor(t * 20) % 2) * 3;
        ctx.fillStyle = f.col; ctx.fillRect(snap(cx - 9), Y(q[1] - 3 - h), 18, h);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(cx - 3), Y(q[1] - 3 - h), 6, 6);
      }
      break;
    }
    case 'nova': {   // a big golden portal with turning rays; all four elements spiral in and meet on him
      if (ground) { flat(0.6 + fr * 1.4, '#ffe36b', 0.12 + fr * 0.15); break; }
      portal(top, R0 + 6, '#ffe36b', '#3a2a10');
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + t * 3, r = (R0 + 12 + (i % 2) * 9) * open; blk(cx + Math.cos(a) * r, top + Math.sin(a) * r * 0.4, 6, '#fff6c0'); }
      const p = c01((fr - 0.1) / 0.8);
      ELEMS.forEach((el, i) => {
        const a = i * 1.571 + p * 7 + sd, r = (1 - p) * 60 + 6, x = cx + Math.cos(a) * r, y = top + (land - top) * ease(p) + Math.sin(a) * r * 0.35;
        ctx.fillStyle = ELEM[el].color; R.elPix(ctx, el, snap(x), Y(y), 6);
        ctx.globalAlpha = 0.4; R.elPix(ctx, el, snap(cx + Math.cos(a - 0.5) * (r + 9)), Y(y - 12), 3); ctx.globalAlpha = 1;
      });
      if (fr > 0.85) { const s = Math.round((fr - 0.85) / 0.15 * 30 / 3) * 3 + 6; ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(cx - s), Y(land - 3), s * 2, 6); ctx.fillRect(snap(cx - 3), Y(land - s), 6, s * 2); }
      break;
    }
  }
};
