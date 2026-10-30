'use strict';
// Drawing the Wizard's emotes (loaded after render.js; the state is in js/emote.js): the radial wheel, the four dances and the Builder's sticker. Everything is a pure function
// of G (w.wheel, w.emote, w.stk) and the clock, so the photo test sees nothing hidden.

// ---------- the wheel ----------
R.drawWheel = function (ctx, v, w, t) {
  const wh = w.wheel;
  if (!wh || w.dead) return;
  const p = R.toScreenLocked(v, w.x, w.y), cx = p[0], cy = p[1] - 114;   // over his head, so he stays in view under it
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#1a0f28'; diamond(ctx, cx, cy, 150, 96); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.5; ctx.setLineDash([9, 9]); ctx.lineDashOffset = -Math.floor(t * 8) * 3; diamond(ctx, cx, cy, 150, 96); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  for (const el of WZ.emoteOrder) {
    const d = { air: [0, -1], fire: [1, 0], water: [0, 1], earth: [-1, 0] }[el], sel = wh.sel === el, sz = sel ? 60 : 48;
    const bx = cx + d[0] * 99, by = cy + d[1] * 60, blink = sel && Math.floor(t * 8) % 2;
    pbox(ctx, bx - sz / 2, by - sz / 2, sz, sz, sel ? '#3a2a60' : '#2b1d48', blink ? '#ffffff' : sel ? ELEM[el].color : '#5a4a7a');
    R.item(ctx, el, bx, by + (sel ? 15 : 12), sel ? 3 : 2, t);
    txt(ctx, WZ.emoteName[el], bx, by + sz / 2 + 18, 12, sel ? '#ffffff' : '#b8a8d8', 'center', 'd');
  }
};

// ---------- the dances ----------
// Draws the Wizard (and his worn garments) mid-dance and the dance's own scenery. w.emote = { el, t }
R.drawDance = function (ctx, v, w, p, spr, layers, flip, alpha, S) {
  const e = w.emote, u = e.t, el = e.el, B = CFG.emote.beat, ph = u / B * 6.283, Y = n => Math.round(n / 3) * 3;
  let ox = 0, oy = 0, rot = 0, sx = 1, sy = 1, fl = flip;
  if (el === 'air') { oy = -(27 + 12 * Math.sin(ph / 2)); rot = Math.sin(ph / 2 + 1) * 0.18; sx = 1 + Math.sin(ph) * 0.04; }
  else if (el === 'water') { ox = Math.sin(ph / 2) * 9; oy = -Math.abs(Math.sin(ph / 2)) * 9; rot = Math.sin(ph / 2) * 0.22; fl = (Math.sin(ph / 2) > 0) !== flip; }
  else if (el === 'fire') { const h = Math.abs(Math.sin(ph * 0.75)); oy = -h * 21; sy = 1 + (h > 0.7 ? 0.1 : 0) - (h < 0.15 ? 0.14 : 0); sx = 2 - sy; rot = Math.sin(ph * 0.75) * 0.1; fl = Math.floor(u / (B * 0.67)) % 2 === 0 ? flip : !flip; }
  else { const c = (u / B) % 1; if (c < 0.55) oy = -18 * Math.sin(c / 0.55 * 1.5708); else if (c < 0.7) oy = -18 * (1 - (c - 0.55) / 0.15); else { const r = (c - 0.7) / 0.3; sy = 0.78 + 0.22 * r; sx = 1.22 - 0.22 * r; } rot = c < 0.55 ? 0.05 : 0; }
  // scenery behind him
  const fx = p[0], fy = p[1];
  if (el === 'air') {
    for (let i = 0; i < 3; i++) { const k = (u * 0.9 + i / 3) % 1; ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = '#e6f8ff'; ctx.lineWidth = 3; diamond(ctx, fx, fy + 3, 12 + k * 30, 6 + k * 15); ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else if (el === 'water') {
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#4aa8ff'; diamond(ctx, fx, fy + 3, 24 + 3 * Math.sin(ph), 11); ctx.fill(); ctx.globalAlpha = 1;
    for (let i = 0; i < 2; i++) { const k = (u * 0.8 + i / 2) % 1; ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = '#e6f8ff'; ctx.lineWidth = 3; diamond(ctx, fx, fy + 3, 12 + k * 24, 6 + k * 12); ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else if (el === 'fire') {
    ctx.fillStyle = 'rgba(255,122,48,0.2)'; diamond(ctx, fx, fy + 3, 30, 14); ctx.fill();
  }
  // him
  ctx.save(); ctx.translate(snap(fx + ox), Y(fy + oy)); ctx.rotate(Math.round(rot * 24) / 24); ctx.scale(sx * (fl ? -1 : 1), sy); ctx.globalAlpha = alpha;
  ctx.drawImage(spr.c, -spr.ax * S, -spr.ay * S, spr.c.width * S, spr.c.height * S);
  for (const l of layers) ctx.drawImage(l.s.c, -l.s.ax * S, -l.s.ay * S, l.s.c.width * S, l.s.c.height * S);
  ctx.restore(); ctx.globalAlpha = 1;
  // scenery in front
  if (el === 'air') {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) { const a = u * 2.2 + i * 1.257, k = 0.6 + 0.4 * Math.sin(u * 1.1 + i); ctx.globalAlpha = 0.85; ctx.fillRect(snap(fx + Math.cos(a) * 33 * k - 3), Y(fy - 45 + oy * 0.6 + Math.sin(a) * 15 * k), 6, 3); }
    ctx.globalAlpha = 1;
  } else if (el === 'water') {
    const cyl = fy - 108 + oy * 0.3;   // a little rain cloud over his head that follows his sway
    ctx.fillStyle = '#7a8ca8'; ctx.fillRect(snap(fx + ox - 24), Y(cyl), 48, 12); ctx.fillRect(snap(fx + ox - 15), Y(cyl - 9), 30, 9); ctx.fillRect(snap(fx + ox - 36), Y(cyl + 6), 18, 9); ctx.fillRect(snap(fx + ox + 21), Y(cyl + 6), 15, 9);
    ctx.fillStyle = '#c4d2e6'; ctx.fillRect(snap(fx + ox - 12), Y(cyl - 6), 18, 6);
    for (let i = 0; i < 7; i++) { const k = (u * 1.4 + i * 0.37) % 1; ctx.fillStyle = i % 3 ? '#4aa8ff' : '#bfe6ff'; ctx.globalAlpha = 1 - k * 0.5; ctx.fillRect(snap(fx + ox + (i - 3) * 11 - 1), Y(cyl + 15 + k * 105), 3, 9); }
    ctx.globalAlpha = 1;
  } else if (el === 'fire') {
    for (let i = 0; i < 8; i++) {
      const k = (u * 1.6 + i * 0.29) % 1, a = i * 0.785 + u * 1.5, fxx = fx + Math.cos(a) * 24 * (0.6 + 0.4 * k), fyy = fy - 6 - k * 72 + Math.sin(a) * 6;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.35 ? '#ffe36b' : k < 0.7 ? '#ff9a2a' : '#d8441a'; ctx.fillRect(snap(fxx - 3), Y(fyy), k < 0.5 ? 9 : 6, k < 0.5 ? 12 : 9);
    }
    ctx.globalAlpha = 1;
  } else {
    const c = (u / B) % 1;
    if (c >= 0.55) {   // the stomp lands: a ring of dust and cracks in the ground
      const k = Math.min(1, (c - 0.55) / 0.45);
      ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 6; diamond(ctx, fx, fy + 3, 15 + k * 45, 7 + k * 22); ctx.stroke();
      ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) { const a = i * 1.257 + 0.4, d0 = 12, d1 = 15 + k * 33; ctx.beginPath(); ctx.moveTo(snap(fx + Math.cos(a) * d0), Y(fy + 3 + Math.sin(a) * d0 * 0.5)); ctx.lineTo(snap(fx + Math.cos(a + 0.2) * d1), Y(fy + 3 + Math.sin(a + 0.2) * d1 * 0.5)); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 4; i++) { const hop = Math.abs(Math.sin(ph / 2 + i * 1.3)) * 18, a = i * 1.571 + 0.7; ctx.fillStyle = i % 2 ? '#8a8a96' : '#a98a5c'; ctx.fillRect(snap(fx + Math.cos(a) * 36 - 4), Y(fy + Math.sin(a) * 12 - hop - 3), 9, 9); }
  }
};

// ---------- the sticker the Builder sees ----------
const STK = {};
function stickerOf(el) {
  const spr = SP.wizard;
  if (!spr) return null;
  const m = STK[el];
  if (m && m.spr === spr) return m.c;
  const N = 44, B = 4, T = N + B * 2;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
  const disc = (x, cx, cy, r) => { for (let y = -r; y <= r; y++) { const hw = Math.round(Math.sqrt(r * r - y * y)); x.fillRect(cx - hw, cy + y, hw * 2, 1); } };
  const [art, a] = mk(N, N);
  const C = { air: ['#d6f2ff', '#6aa8d8'], water: ['#bfe0ff', '#3a78c8'], fire: ['#ffd8a8', '#d8541a'], earth: ['#e6d2a0', '#7a5a2a'] }[el];
  a.fillStyle = C[1]; disc(a, 22, 22, 21); a.fillStyle = C[0]; disc(a, 22, 22, 18);
  const px = (c, x, y, w, h) => { a.fillStyle = c; a.fillRect(x, y, w || 1, h || 1); };
  const sw = spr.c.width, sh = spr.c.height;
  const foot = el === 'air' ? 31 : 37, k = el === 'earth' ? 0.84 : 1, dh = Math.round(sh * k), dx = Math.round(22 - spr.ax), dy = foot - Math.round(spr.ay * k);
  if (el === 'air') {   // floating on a cloud, with wind curls
    for (const [x, y, w] of [[12, 33, 20], [9, 35, 10], [27, 35, 9], [15, 31, 14]]) px('#ffffff', x, y, w, 3);
    for (const [x, y] of [[6, 14], [7, 13], [8, 13], [9, 14], [34, 22], [35, 21], [36, 21], [37, 22]]) px('#ffffff', x, y, 1, 1);
    px('#9bd0f0', 10, 37, 24, 2);
  } else if (el === 'water') {   // a rain cloud, drops and a puddle
    for (const [x, y, w, h] of [[12, 5, 20, 5], [16, 3, 12, 3], [9, 7, 8, 4], [28, 7, 7, 4]]) px('#7a8ca8', x, y, w, h);
    px('#c4d2e6', 17, 4, 5, 2);
    for (const [x, y] of [[13, 13], [19, 16], [25, 12], [30, 17], [16, 22], [28, 25]]) { px('#3a78c8', x, y, 1, 3); px('#ffffff', x, y, 1, 1); }
    px('#4a90e0', 11, 38, 22, 3); px('#9fd0ff', 14, 39, 8, 1);
  } else if (el === 'fire') {   // flames at his feet, sparks
    for (const [x, h] of [[8, 9], [12, 14], [30, 14], [34, 9], [16, 7], [26, 7]]) { px('#d8441a', x, 38 - h, 4, h); px('#ff9a2a', x + 1, 38 - h + 3, 2, h - 3); px('#ffe36b', x + 1, 38 - Math.round(h / 2), 2, Math.round(h / 3)); }
    for (const [x, y] of [[6, 14], [37, 12], [10, 8], [34, 6]]) px('#ffb030', x, y, 2, 2);
  } else {   // a stomp: cracks, dust and flying rocks
    px('#5a3a1a', 9, 38, 26, 2);
    for (const [x, y, w, h] of [[10, 36, 1, 4], [11, 39, 4, 1], [32, 36, 1, 4], [28, 39, 4, 1], [20, 40, 1, 2]]) px('#2a1c10', x, y, w, h);
    for (const [x, y] of [[6, 30], [8, 33], [36, 30], [34, 33]]) px('#ffffff', x, y, 3, 2);
    for (const [x, y, c] of [[8, 14, '#8a8a96'], [34, 12, '#a98a5c'], [30, 20, '#8a8a96'], [12, 22, '#a98a5c']]) { px(c, x, y, 4, 4); px('#2c2c36', x + 3, y, 1, 4); px('#2c2c36', x, y + 3, 4, 1); }
  }
  a.drawImage(spr.c, 0, 0, sw, sh, dx, dy, sw, dh);
  const pk = SP['pk_' + el];
  if (pk) a.drawImage(pk.c, N - pk.c.width - 1, 1);   // the element's packet in the corner
  const [sil, s2] = mk(N, N), [dk, d2] = mk(N, N);
  for (const [c, x] of [['#ffffff', s2], ['#1a0f28', d2]]) { x.drawImage(art, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = c; x.fillRect(0, 0, N, N); }
  const [out, o] = mk(T, T);
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10) o.drawImage(dk, B + x, B + y);
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) o.drawImage(sil, B + x, B + y);
  o.drawImage(art, B, B);
  STK[el] = { spr, c: out };
  return out;
}
// the sticker slides in from the factory's right edge (the side facing the wilds), wobbles for a few seconds and slides back out; a name under it
R.drawSticker = function (ctx, t) {
  const s = G.w && G.w.stk;
  if (!s) return;
  const c = stickerOf(s.el);
  if (!c) return;
  const e = Math.max(0, Math.min(1, s.t / 0.35, (s.dur - s.t) / 0.35)), ease = 1 - Math.pow(1 - e, 3), P = R.px || 4, W = c.width * P, H = c.height * P;
  const x = R.rect.w - W / 2 - 16 + (1 - ease) * (W + 40), y = 330 + Math.sin(t * 3) * 4;
  ctx.save(); ctx.translate(snap(x), Math.round(y / P) * P); ctx.rotate(Math.round((Math.sin(s.t * 5) * 0.09 - 0.05) * 24) / 24);
  ctx.drawImage(c, -W / 2, -H / 2, W, H);
  ctx.restore();
  txt(ctx, WZ.emoteName[s.el], x, y + H / 2 + 20, 12, '#ffffff', 'center', 'd');
};
