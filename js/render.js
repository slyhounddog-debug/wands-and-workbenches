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
  v.hw = hw; v.hh = hh;
  // snap the camera to whole buffer pixels so sprites never shimmer
  v.ox = v.org + Math.round((v.cx - (cam.x - cam.y) * hw + (sx || 0) - v.org) / P) * P;
  v.oy = Math.round((v.cy - (cam.x + cam.y) * hh + (sy || 0)) / P) * P;
}
R.toScreen = (v, x, y) => [(x - y) * v.hw + v.ox, (x + y) * v.hh + v.oy];
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
  const k = Math.min(1, dt * 7);
  cam.x += (bd.x + bd.vx * 0.18 - cam.x) * k; cam.y += (bd.y + bd.vy * 0.18 - cam.y) * k;
  const v = R.fv; setView(v, cam);
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
    const lp = R.toScreen(v, z.x0 + 0.4, z.y0 + 0.4);
    txt(ctx, 'STOCKPILE', lp[0], lp[1], 12, '#fff2cc', 'center', 'd');
  }

  const piles = FA.piles();
  const list = [];
  for (const b of f.belts) list.push({ d: b.x + b.y + 0.4, o: b, t: 'belt' });
  for (const b of f.bld) list.push({ d: b.x + b.y + 1, o: b, t: 'bld' });
  const ps = FA.portal('spell'), pk = FA.portal('skill');
  list.push({ d: ps.x + ps.y + 2, t: 'portal', o: 'spell' });
  list.push({ d: pk.x + pk.y + 2, t: 'portal', o: 'skill' });
  for (const k2 in piles) list.push({ d: piles[k2].x + piles[k2].y, o: k2, t: 'pile' });
  for (const o of f.floor) list.push({ d: o.x + o.y, o, t: 'floor' });
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
    if (k === 'splitter') [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4].forEach(d => R.outArrow(ctx, v, b, t, d));
    else if (k === 'sorter') { R.outArrow(ctx, v, b, t, b.dir, '#9dff9d'); if (b.filter) { R.outArrow(ctx, v, b, t, (b.dir + 1) % 4); R.outArrow(ctx, v, b, t, (b.dir + 3) % 4); } }
    else R.outArrow(ctx, v, b, t);
  }

  for (const it of list) {
    switch (it.t) {
      case 'belt': R.drawBelt(ctx, v, it.o, t); break;
      case 'bld': R.drawBuilding(ctx, v, it.o, t); break;
      case 'portal': R.drawPortal(ctx, v, t, it.o); break;
      case 'pile': R.drawPile(ctx, v, it.o, piles[it.o]); break;
      case 'floor': R.drawFloor(ctx, v, it.o, t); break;
      case 'fly': R.drawFly(ctx, v, it.o, t); break;
      case 'builder': R.drawBuilder(ctx, v, bd, t); break;
    }
  }
  if (R.ghost) R.drawGhost(ctx, v, R.ghost, t);
  if (R.demo) R.drawDemo(ctx, v, R.demo, t);
  if (R.aim && G.hands && !bd.gather) R.drawAim(ctx, v, R.aim, t);

  for (const p of f.parts) {
    const s = R.toScreen(v, p.x, p.y);
    ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = p.col;
    const sz = p.dust ? (p.t > 0.25 ? 8 : 4) : 4;
    ctx.fillRect(Math.round((s[0] - sz / 2) / P) * P, Math.round((s[1] - p.z * 22) / P) * P, sz, sz);
  }
  ctx.globalAlpha = 1;

  if (bd.gather) {
    const g = bd.gather, p = R.toScreen(v, g.b.x + 0.5, g.b.y + 0.5), fr = Math.min(1, g.t / g.total);
    const y = p[1] - 124;
    pbox(ctx, p[0] - 40, y - 12, 80, 24, '#2b1d48');
    ctx.fillStyle = ELEM[g.el].color; ctx.fillRect(Math.round((p[0] - 36) / P) * P, y - 8, Math.round(72 * fr / P) * P, 16);
    txt(ctx, 'TAP ' + R.key('use') + '!', p[0], y - 22 + (Math.sin(t * 14) > 0 ? 0 : 4), 16, '#ffe36b', 'center', 'd');
  }
  if (R.hint && !UI.treeOpen.L) R.drawHint(ctx, v, R.hint, t);
  if (R.focus && !UI.treeOpen.L) R.drawFocus(ctx, v, R.focus, t);
  for (const p of f.pops) {
    const s = R.toScreen(v, p.x, p.y);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, p.t - 0.6) / 0.5);
    txt(ctx, p.text, s[0], s[1] - 70 - Math.floor(p.t * 10) * 4, 12, p.col, 'center', 'd');
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  main.imageSmoothingEnabled = false;
  main.drawImage(buf.c, 0, 0, CFG.HALF, CFG.H);
  R.flush(main, 0);
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
    R.bar(ctx, p[0], top + 76, 72, got / tot, '#7be0ff');
    const need = FA.needOf(b), keys = Object.keys(need);
    let x0 = p[0] - (keys.length - 1) * 34;
    for (const k of keys) { R.chip(ctx, x0, top + 52, k, need[k]); x0 += 68; }
    return;
  }
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
      // standing at (or hovering) a crafter says what its product is for
      const near = (R.focus && R.focus.list.some(e => e.t.kind === 'bld' && e.t.o === b)) || R.hoverB === b;
      if (near) txt(ctx, recipeName(b.recipe) + ': ' + recipeUse(b.recipe), p[0], top - 12, 12, '#ffe9b8', 'center');
      // a faded ghost of the product waits in the empty output slot
      if (!b.out.length && b.prog <= 0) dspr(ctx, itemSprite(R2.out), p[0] + 44, base - 28 + (Math.sin(t * 3) > 0 ? 0 : 4), 4, 0.35);
      let x0 = p[0] - w / 2;
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
      if (b.draw > 0 && !b.powered) R.noPower(ctx, p[0], top - 16, t);
    } else txt(ctx, 'no recipe yet', p[0], top + 30, 12, '#dddddd', 'center', 'd');
    b.out.slice(0, 3).forEach((o, i) => R.item(ctx, o.kind, p[0] + 44, base - 28 - i * 16, 4, t));
  }
  if (b.type === 'station') {
    const fr = b.bat == null ? 0 : b.bat / CFG.batteryMax;
    if (b.bat != null) dspr(ctx, SP.it_battery, p[0], base - 44, 4);
    R.bar(ctx, p[0], top + 52, 64, fr, b.bat > 0 ? '#3ad06b' : '#8a8a8a');
    if (b.bat != null && b.bat > 0 && Math.sin(t * 8) > 0) {
      ctx.fillStyle = '#fff07a';
      for (let i = 0; i < 5; i++) ctx.fillRect(Math.round((p[0] - 20 + i * 10) / 4) * 4, Math.round((base - 84 + (i % 2 ? -8 : 8)) / 4) * 4, 8, 4);
    }
    if (b.bat == null) txt(ctx, 'needs Battery', p[0], top + 44, 12, '#ffe0a0', 'center', 'd');
  }
  if (b.type === 'charger') {
    if (b.bat != null) dspr(ctx, SP.it_battery, p[0], base - 40, 4);
    if (b.bat != null) R.bar(ctx, p[0], top + 52, 64, b.bat / CFG.batteryMax, b.bat >= CFG.batteryMax ? '#3ad06b' : '#ffd93a');
    const ft = FA.fuelTotal(b);
    if (ft > 0) R.bar(ctx, p[0], top + 66, 64, ft / CFG.fuelCap, '#ff8a3a', 8);
  }
  if (d.kind === 'splitter' || d.kind === 'sorter') b.out.forEach((o, i) => R.item(ctx, o.kind, p[0] - 8 + i * 16, base - 52 - i * 8, 4, t));
  if (d.kind === 'sorter') {
    pbox(ctx, p[0] - 28, top + 12, 56, 44, '#2b1d48');
    if (b.filter) R.item(ctx, b.filter, p[0], top + 48, 4, t, false);
    else txt(ctx, 'ANY', p[0], top + 40, 12, '#c8b8e8', 'center', 'd');
  }
  if (d.kind === 'crate') {
    if (b.out.length) R.item(ctx, b.out[0].kind, p[0] - 20, top + 64, 4, t, false);
    txt(ctx, b.out.length + '/' + CFG.crateCap, p[0] + (b.out.length ? 16 : 0), top + 60, 12, b.out.length >= CFG.crateCap ? '#ffb43a' : '#ffffff', 'center', 'd');
  }
  if (d.kind === 'crafter' && b.type === 'altar' && b.prog > 0 && b.powered) {
    ctx.strokeStyle = Math.sin(t * 10) > 0 ? '#ff4a8a' : '#c890ff'; ctx.lineWidth = 4;
    diamond(ctx, p[0], p[1], v.hw * 0.7, v.hh * 0.7); ctx.stroke();
  }
  // throughput: a building stuck for a moment shows why (orange ! = output blocked, grey ? = waiting on inputs)
  if (b.st && b.stT > 1.5 && Math.sin(t * 4) > -0.6) dspr(ctx, SP[b.st === 'jam' ? 'ic_jam' : 'ic_starve'], p[0] - 44, top + 72, 4);
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
  ctx.fillStyle = skill ? '#b0a070' : '#8a8fb0';
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
  ctx.fillStyle = skill ? '#7a6a40' : '#5e6280';
  ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + 16); ctx.lineTo(d[0], d[1] + 16); ctx.fill();
  const flash = Math.max(0, skill ? f.skillFlash : f.flash) * 2;
  const cols = skill ? ['#2a6a3a', '#5ad06a', '#c8ffb0', '#ffffff'] : ['#4a2890', '#8a4ad0', '#c890ff', '#ffffff'];
  ctx.save();
  ctx.translate(base[0], base[1] - 72);
  ctx.transform(-v.hw, v.hh, 0, 72, 0, 0);
  // concentric flat rings (no gradients: chunky 8-bit bands)
  const rs = [1, 0.75, 0.5, 0.25];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = flash > 0 && i === 1 ? f.flashCol : cols[i];
    ctx.beginPath(); ctx.ellipse(0, 0, rs[i] * 0.95, rs[i] * (1 - 0.06 * Math.sin(t * 3 + i)), 0, 0, 6.283); ctx.fill();
  }
  ctx.fillStyle = skill ? '#ffd23a' : '#ffffff';
  for (let i = 0; i < 4; i++) { const an = t * 1.5 + i * 1.57; ctx.fillRect(Math.cos(an) * 0.6 - 0.06, Math.sin(an) * 0.6 - 0.06, 0.12, 0.12); }
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = skill ? '#ffe36b' : '#ffffff'; ctx.globalAlpha = flash * 0.4; ctx.fillRect(base[0] - 64, base[1] - 140, 128, 136); ctx.globalAlpha = 1; }
  txt(ctx, skill ? 'SKILL PORTAL' : 'SPELL PORTAL', base[0], base[1] - 164, 12, skill ? '#ffe36b' : '#efe4ff', 'center', 'd');
  const q = f.portalQ.filter(e => e.which === which).length;
  if (q) txt(ctx, q + ' queued', base[0], base[1] - 146, 12, '#ffe36b', 'center', 'd');
  else txt(ctx, FA.rate(which) + '/MIN', base[0], base[1] - 146, 12, FA.rate(which) ? '#bfffbf' : '#a898c8', 'center', 'd');
};

R.drawPile = function (ctx, v, k, pos) {
  const p = R.toScreen(v, pos.x, pos.y), n = G.stock[k];
  const cnt = Math.min(15, Math.ceil(n / 2));
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(Math.round((p[0] - 36) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 72, 12);
  for (let i = 0; i < cnt; i++) {
    const row = Math.floor(i / 5), col = i % 5;
    dspr(ctx, itemSprite(k), p[0] + (col - 2) * 12 + (row % 2) * 6, p[1] - row * 12 + ((col * 7) % 5) - 2, 4);
  }
  txt(ctx, (RES[k].short || RES[k].name) + ' ' + n, p[0], p[1] + 30, 12, n > 0 ? (k === 'shard' ? '#e0b8ff' : '#ffffff') : '#ff9a9a', 'center', 'd');
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
R.drawFly = function (ctx, v, o, t) {
  const p = R.toScreen(v, o.x, o.y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(Math.round((p[0] - 10) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 20, 8);
  R.item(ctx, o.kind, p[0], p[1] - o.z * 44 + 6, 4, t);
};

R.drawBuilder = function (ctx, v, bd, t) {
  const p = R.toScreen(v, bd.x, bd.y), S = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round((p[0] - 20) / 4) * 4, Math.round(p[1] / 4) * 4 - 4, 40, 12);
  const carrying = !!G.hands;
  const step = Math.sin(bd.bob);
  const hop = Math.round((bd.gather ? Math.abs(Math.sin(bd.bob)) * 12 : (bd.moving ? Math.abs(step) * 5 : 0)) / 4) * 4;
  const spr = carrying ? (bd.moving && step > 0 ? SP.builderC2 : SP.builderC) : (bd.moving && step > 0 ? SP.builder2 : SP.builder);
  const sq = bd.squash > 0 ? Math.sin(bd.squash * 25) * 0.12 : 0;
  const flip = (bd.fx - bd.fy) < -0.1;
  dsprSq(ctx, spr, p[0], p[1] - hop, S, 1 + sq, 1 - sq, 1, flip);
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
  if (g.type !== 'belt' && g.type !== 'hand' && G.credits[g.type] > 0) txt(ctx, 'FREE!', p[0], p[1] - 110, 16, '#7be0ff', 'center', 'd');
  txt(ctx, 'R rotates', p[0], p[1] + v.hh + 26, 12, '#ffffff', 'center', 'd');
};
R.drawDemo = function (ctx, v, g, t) {
  const p = R.toScreen(v, g.x + 0.5, g.y + 0.5);
  ctx.fillStyle = Math.sin(t * 10) > 0 ? 'rgba(255,60,60,0.45)' : 'rgba(255,60,60,0.3)';
  diamond(ctx, p[0], p[1], v.hw, v.hh); ctx.fill();
  dspr(ctx, SP.ic_x, p[0], p[1] - 24, 4);
  if (g.label) txt(ctx, g.label, p[0], p[1] - 74, 12, '#ffd0d0', 'center', 'd');
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
  ctx.strokeStyle = a.obj ? '#9dff9d' : '#ffffff'; ctx.lineWidth = 6;
  diamond(ctx, e[0], e[1], 24, 12); ctx.stroke();
};
// the button label for the Builder's pick (take one item) and use (crank / rotate / switch) actions
R.key = which => which === 'pick' ? (R.padMode ? 'A' : G.swapped ? '.' : 'LMB') : (R.padMode ? 'X' : G.swapped ? '/' : 'E');
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
    R.prompt(ctx, p[0], p[1] - lift + (Math.sin(t * 3) > 0 ? 0 : 4), e.key ? R.key(e.key) : null, a.label, CFG.HALF * (R.org ? 2 : 1), R.org);
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
      if (b) for (let j = 0; j < b.length; j++) { const o = b[j]; if (!o.broken) objs.push({ d: o.x + o.y, t: o.lm ? 'lm' : o.deco ? 'deco' : 'harv', o }); }
    }
  }
  for (const z of w.zones) R.drawZone(ctx, v, z);
  for (const f of w.fx_) if (f.type === 'ring' || f.type === 'warn') R.drawFx(ctx, v, f);

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
      dspr(ctx, itemSprite(o.kind), p[0], p[1] - 6 + bob, 3);
    } else if (it.t === 'pick') R.drawPickup(ctx, v, o, wt);
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
  if (o.full && o.z <= 0) txt(ctx, CFG.pickups[o.kind].heal ? 'HP FULL' : 'ARMOR FULL', p[0], p[1] - 54, 12, '#ffe0a0', 'center', 'd');
};
R.drawEnemy = function (ctx, v, e) {
  const p = R.toScreen(v, e.x, e.y), S = CFG.WT.S, t = G.w.t;
  const spr = SP[e.type], fly = e.type === 'sprite' || e.type === 'wisp';
  const hop = e.boss ? (Math.sin(t * 3) > 0 ? 3 : 0) : Math.abs(Math.sin(t * 6 + e.bob)) > 0.5 ? (fly ? 9 : 6) : 0;
  const lift = fly ? 12 : 0, sc = e.elite ? 1.4 : 1;
  const sw = e.boss ? 66 : 24 * sc;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(snap(p[0] - sw / 2), Math.round(p[1] / 3) * 3 - 3, Math.round(sw / 3) * 3, e.boss ? 12 : 6);
  if (e.boss) {   // aura in the colour of its current weakness
    ctx.strokeStyle = ELEM[e.weak].color; ctx.lineWidth = 6; ctx.globalAlpha = Math.sin(t * 5) > 0 ? 0.9 : 0.5;
    diamond(ctx, p[0], p[1], 72, 36); ctx.stroke(); ctx.globalAlpha = 1;
  } else if (e.elite) { ctx.strokeStyle = Math.sin(t * 6) > 0 ? '#ffd23a' : '#ffa62a'; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], 27, 13); ctx.stroke(); }
  if (e.slow > 0) { ctx.strokeStyle = '#78c8ff'; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], 18 * sc, 9 * sc); ctx.stroke(); }
  const y = p[1] - hop - lift;
  dsprSq(ctx, spr, p[0], y, S, sc, sc, 1, e.face < 0);
  if (e.flash > 0) dsprSq(ctx, { c: spr.white, ax: spr.ax, ay: spr.ay }, p[0], y, S, sc, sc, 0.85, e.face < 0);
  if (e.boss) {   // its belly glows with the element that hurts it
    ctx.fillStyle = ELEM[e.weak].color; ctx.fillRect(snap(p[0] - 6), Math.round((y - 24) / 3) * 3, 12, 9);
    return;
  }
  const top = y - spr.c.height * S * sc;
  if (e.hp < e.maxHp) R.hpBar(ctx, p[0], top - 9, e.elite ? 42 : 30, e.hp / e.maxHp, e.elite ? '#ffd23a' : '#ff6a6a');
  if (e.elite) dspr(ctx, SP.ic_crown, p[0], top - 15, S);
  if (e.weak && (e.elite || CFG.enemies[e.type].weak)) dspr(ctx, SP['wk_' + e.weak], p[0] + (e.elite ? 30 : 21), top + 3, S);
};
// landmarks: camps wake when the Wizard walks up, shrines want a spell of their element, crypts open if he waits at the door
R.drawMark = function (ctx, v, m) {
  const w = G.w, s = w.lm[m.id], p = R.toScreen(v, m.x, m.y), S = CFG.WT.S, t = w.t, done = s.state === 'done';
  const d = Math.hypot(w.x - m.x, w.y - m.y);
  ctx.fillStyle = done ? 'rgba(0,0,0,0.12)' : 'rgba(40,10,60,0.25)';
  diamond(ctx, p[0], p[1], 2.4 * v.hw, 2.4 * v.hh); ctx.fill();
  let label = null, col = '#ffe9b8';
  if (m.type === 'camp') {
    dspr(ctx, SP.lm_camp, p[0], p[1], S, done ? 0.5 : 1);
    if (!done) for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i ? '#ffe36b' : '#ff7a30';
      ctx.fillRect(snap(p[0] + Math.sin(t * 7 + i) * 3 - 6 + i * 3), Math.round((p[1] - 9 - ((t * 24 + i * 8) % 18)) / 3) * 3, 9 - i * 3, 9 - i * 3);
    }
    if (s.state === 'idle') label = 'MONSTER CAMP';
    else if (!done) { label = 'CLEAR THE CAMP: ' + w.enemies.filter(e => e.mark === m.id).length + ' LEFT'; col = '#ffb0a0'; }
  } else if (m.type === 'shrine') {
    if (!done && d < CFG.marks.shrineR + 0.4) { ctx.strokeStyle = ELEM[m.el].color; ctx.lineWidth = 6; ctx.globalAlpha = Math.sin(t * 8) > 0 ? 1 : 0.5; diamond(ctx, p[0], p[1], CFG.marks.shrineR * v.hw * 1.4, CFG.marks.shrineR * v.hh * 1.4); ctx.stroke(); ctx.globalAlpha = 1; }
    dspr(ctx, SP.lm_shrine, p[0], p[1], S);
    if (!done) dspr(ctx, SP['cr_' + m.el], p[0], p[1] - 39 - (Math.sin(t * 3) > 0 ? 3 : 0), S);
    if (!done) { label = d < CFG.marks.shrineR ? 'NOW: SEND ' + ELEM_WORD[m.el].toUpperCase() + '!' : ELEM_WORD[m.el].toUpperCase() + ' SHRINE'; col = ELEM[m.el].color; }
  } else {
    dspr(ctx, SP.lm_crypt, p[0], p[1], S, done ? 0.6 : 1);
    if (s.state === 'idle') {
      label = 'CRYPT: WAIT AT THE DOOR';
      if (s.t > 0) R.hpBar(ctx, p[0], p[1] + 12, 48, s.t / CFG.marks.cryptHold, '#b07aff');
    } else if (!done) { label = 'SLAY THE GUARDIAN'; col = '#ffb0a0'; }
  }
  if (done && d < 8) { label = 'CLAIMED'; col = '#a898c8'; }
  if (label && d < 13) txt(ctx, label, p[0], p[1] - 110, 12, col, 'center', 'd');
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
    dot(m.x, m.y, done ? 4 : 6, done ? '#6a6a7a' : m.type === 'camp' ? '#ff5a4a' : m.type === 'crypt' ? '#b07aff' : ELEM[m.el].color);
  }
  if (w.boss && Math.sin(t * 10) > 0) dot(w.boss.x, w.boss.y, 10, '#ff4a8a');
  if (R.whint) dot(R.whint.x, R.whint.y, 6, Math.sin(t * 8) > 0 ? '#ffd23a' : '#ffffff');
  dot(w.x, w.y, 6, Math.sin(t * 6) > -0.5 ? '#ffffff' : '#7be0ff');
  c.font = '8px ' + FONT_D; c.textAlign = 'center'; c.fillStyle = '#c8b8e8'; c.fillText('MAP', cx, cy - 64);
  c.restore();
};
R.drawWizard = function (ctx, v, w) {
  const p = R.toScreen(v, w.x, w.y), S = CFG.WT.S, spr = SP.wizard;
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
    ctx.save(); ctx.translate(snap(p[0]), p[1] - 24); ctx.rotate(step * 6.283 * (flip ? -1 : 1));
    ctx.drawImage(spr.c, -spr.ax * S, -spr.ay * S + 24, spr.c.width * S, spr.c.height * S); ctx.restore();
    return;
  }
  const blink = w.hurtT > 0 && Math.floor(w.hurtT * 20) % 2;
  dspr(ctx, spr, p[0], p[1] - bob, S, blink ? 0.4 : 1, flip);
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
    ctx.fillRect(snap(s[0] - 3), Math.round((s[1] - f.z * 30 - 3) / 3) * 3, 6, 6); ctx.globalAlpha = 1;
  } else if (f.type === 'beam') {
    ctx.globalAlpha = (1 - fr) * 0.7; ctx.fillStyle = f.col;
    const wdt = Math.round((28 * (1 - fr) + 9) / 3) * 3;
    ctx.fillRect(snap(s[0] - wdt / 2), s[1] - 500, wdt, 500);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(s[0] - 3), s[1] - 500, 6, 500);
    ctx.globalAlpha = 1;
  } else if (f.type === 'arrive') {
    // a mini portal tears open over the Wizard's head, the spell drops through it, then bursts at his feet
    const w = G.w, q = R.toScreen(v, w.x, w.y), top = q[1] - (f.big ? 126 : 105), k = Math.min(1, fr / 0.45);
    if (fr < 0.6) {
      const rw = Math.round((f.big ? 42 : 30) * Math.min(1, k * 2.5) * (fr > 0.45 ? (0.6 - fr) / 0.15 : 1) / 3) * 3;
      if (rw > 0) {
        ctx.fillStyle = '#2a1050'; diamond(ctx, q[0], top, rw, rw / 2.5); ctx.fill();
        ctx.strokeStyle = f.col; ctx.lineWidth = 6; ctx.stroke();
      }
      if (k > 0.35) {
        const by = top + (q[1] - 40 - top) * Math.min(1, (k - 0.35) / 0.5);
        ctx.fillStyle = f.col; ctx.fillRect(snap(q[0] - 6), Math.round(top / 3) * 3, 12, Math.round((by - top) / 3) * 3);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(snap(q[0] - 3), Math.round(top / 3) * 3, 6, Math.round((by - top) / 3) * 3);
        ctx.fillStyle = f.col; ctx.fillRect(snap(q[0] - 12), Math.round((by - 12) / 3) * 3, 24, 24);
      }
    } else {
      const b = (fr - 0.6) / 0.4;
      ctx.globalAlpha = 1 - b; ctx.strokeStyle = f.col; ctx.lineWidth = 9;
      diamond(ctx, q[0], q[1], (1 + b * (f.big ? 3 : 2)) * v.hw, (1 + b * (f.big ? 3 : 2)) * v.hh); ctx.stroke();
      ctx.fillStyle = f.col;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + b * 4, r = 12 + b * 40;
        ctx.fillRect(snap(q[0] + Math.cos(a) * r - 4), Math.round((q[1] - 30 + Math.sin(a) * r * 0.5 - b * 30) / 3) * 3, 9, 9);
      }
      ctx.globalAlpha = 1;
    }
  } else if (f.type === 'title') {
    const q = R.toScreen(v, G.w.x, G.w.y);
    ctx.globalAlpha = 1 - Math.max(0, fr - 0.6) / 0.4;
    txt(ctx, f.text, q[0], q[1] + 66 - Math.floor(fr * 6) * 3, 20, f.col, 'center', 'd');   // under his feet, clear of the toasts
    ctx.globalAlpha = 1;
  }
};
