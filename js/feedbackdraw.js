'use strict';
// Drawing the attention-and-causality cues (loaded after render.js; the rule and the list of events are in CLAUDE.md and FEEDBACK.md). Every cue answers
// WHAT happened, WHY, and what to look at NEXT, in icons. All of it is a pure function of G and the clock, so the photo test sees nothing hidden:
//   R.drawHurt      the Wizard was hit: a red edge flash and a chevron toward the attacker, the attacker's picture, its weakness pip (G.w.hurt)
//   R.drawTether    a rare drop's dotted line back to the kill that made it (drop.fx / fy / tet)
//   R.drawThreat    at the Spell Portal: what the Wizard just met and what it is weak to (G.fac.threat)
//   R.drawRej       a pickup the full Stockpile refused bouncing off the Spell Portal (G.fac.rejs)
//   R.drawBoost     a boosted Harnesser / a Battery its shrine charged: a slow pulse and a small bouncing "+"
//   R.drawFoeStatus slowed / frozen / dazed icons on a foe
//   R.drawWandFill  a wand slot (or a shrine) became ready: element particles swirl into the staff before it starts to blink (G.wand.fx)

// ---------- the Wizard was hit ----------
R.drawHurt = function (ctx, v, w, left, right, t) {
  const h = w.hurt;
  if (!h) return;
  const D = CFG.hurt, k = Math.max(0, 1 - h.t / D.dur), q = R.toScreenLocked(v, w.x, w.y), cy = q[1] - 33, RW = right - left;
  let dx = 0, dy = -1, has = false;
  if (h.ax !== null && h.ay !== null) {
    const a = R.toScreen(v, h.ax, h.ay), ddx = a[0] - q[0], ddy = a[1] - q[1], d = Math.hypot(ddx, ddy);
    if (d > 6) { dx = ddx / d; dy = ddy / d; has = true; }
  }
  const sp = R.spr(h.ic), S2 = sp ? Math.max(2, Math.min(4, Math.floor(44 / Math.max(sp.c.width, sp.c.height)))) : 3;
  const blink = h.t < 0.3 && Math.floor(h.t * 20) % 2;
  if (h.soft || !has) {   // ground / an unseen source: just its picture over his head
    const bx = Math.round(q[0]), by = Math.round(cy - 84 - h.t * 12);
    ctx.globalAlpha = Math.min(1, k * 2);
    pbox(ctx, bx - 21, by - 21, 42, 42, '#2b1d48', blink ? '#ffffff' : '#ff6a6a');
    if (sp) dspr(ctx, sp, bx, by + sp.c.height * Math.min(S2, 2) / 2, Math.min(S2, 2));
    ctx.globalAlpha = 1;
    return;
  }
  // a red band on the screen edge the hit came from (solid, no gradients), strongest right away
  const side = Math.abs(dx) * 0.6 > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'b' : 't');
  ctx.fillStyle = '#ff2a3a'; ctx.globalAlpha = D.edge * k * (blink ? 1 : 0.8);
  if (side === 'r') ctx.fillRect(right - 36, 0, 36, CFG.H); else if (side === 'l') ctx.fillRect(left, 0, 36, CFG.H);
  else if (side === 'b') ctx.fillRect(left, CFG.H - 36, RW, 36); else ctx.fillRect(left, 0, RW, 36);
  ctx.globalAlpha = 1;
  // the chevron round his body pointing at the attacker, and its picture beyond it
  const r = 78, px = -dy, py = dx, tx = q[0] + dx * (r + 16), ty = cy + dy * (r + 16) * 0.7;
  const pts = [[tx, ty], [q[0] + dx * (r - 8) + px * 15, cy + (dy * (r - 8) + py * 15) * 0.7], [q[0] + dx * (r - 8) - px * 15, cy + (dy * (r - 8) - py * 15) * 0.7]];
  ctx.globalAlpha = Math.min(1, k * 1.6);
  ctx.fillStyle = blink ? '#ffffff' : '#ff4a5a'; ctx.strokeStyle = '#1a0f28'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.closePath(); ctx.stroke(); ctx.fill();
  const bx = Math.max(left + 40, Math.min(right - 40, Math.round(q[0] + dx * (r + 62)))), by = Math.max(150, Math.min(CFG.H - 60, Math.round(cy + dy * (r + 62) * 0.7)));
  pbox(ctx, bx - 30, by - 30, 60, 60, '#2b1d48', blink ? '#ffffff' : '#ff6a6a');
  if (sp) dspr(ctx, sp, bx, by + sp.c.height * S2 / 2, S2);
  if (h.el) dspr(ctx, SP['wk_' + h.el], bx + 30, by - 24, 3);   // what it is weak to: the pip the Builder needs
  if (h.t < D.dur * 0.7) txt(ctx, h.n, bx, by + 46, 12, '#ffffff', 'center', 'd');
  ctx.globalAlpha = 1;
};

// ---------- a rare drop remembers which kill made it ----------
R.drawTether = function (ctx, v, o, t) {
  const a = R.toScreen(v, o.fx, o.fy), b = R.toScreen(v, o.x, o.y), fade = Math.min(1, o.tet / 0.5);
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = '#1a0f28'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 12); ctx.lineTo(b[0], b[1] - 12); ctx.stroke();
  ctx.strokeStyle = (ITEMS[o.kind] && ITEMS[o.kind].color) || '#ffffff'; ctx.lineWidth = 3; ctx.setLineDash([6, 9]); ctx.lineDashOffset = -Math.floor(t * 14) * 3;
  ctx.beginPath(); ctx.moveTo(a[0], a[1] - 12); ctx.lineTo(b[0], b[1] - 12); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; diamond(ctx, a[0], a[1], 15, 7); ctx.stroke();   // the corpse's spot
  ctx.globalAlpha = 1;
};

// ---------- the Spell Portal says what the Wizard just met ----------
R.drawThreat = function (ctx, v, t, base) {
  const th = G.fac.threat;
  if (!th) return;
  const left = th.dur - th.t, fade = Math.min(1, left / 1), n = th.els.length, bw = 60 + n * 48, bh = 66;
  const x = Math.round(base[0] - bw / 2), y = Math.round(base[1] - 226 - (th.t < 0.3 ? (0.3 - th.t) * 60 : 0));
  const blink = th.t < 1.6 && Math.floor(th.t * 8) % 2;
  ctx.globalAlpha = fade;
  pbox(ctx, x, y, bw, bh, '#2b1d48', blink ? '#ffffff' : '#ff9a3a');
  const sp = R.spr(th.ic), S2 = sp ? Math.max(2, Math.min(4, Math.floor(40 / Math.max(sp.c.width, sp.c.height)))) : 3;
  if (sp) dspr(ctx, sp, x + 33, y + 15 + sp.c.height * S2 / 2 + (Math.sin(t * 5) > 0 ? 0 : 3), S2);
  ctx.fillStyle = '#ffd23a'; const ax = x + 60; ctx.fillRect(ax, y + 30, 12, 6); ctx.fillRect(ax + 12, y + 24, 6, 18); ctx.fillRect(ax + 18, y + 30, 6, 6);   // "->" : it is weak to
  th.els.forEach((el, i) => {
    const ex = x + 60 + 24 + i * 44, ey = y + 54 + (Math.floor(t * 5 + i) % 2 ? 0 : -3);
    dspr(ctx, itemSprite(el), ex + 12, ey, 3);
  });
  if (th.n) txt(ctx, th.n, base[0], y - 8, 12, '#ffd23a', 'center', 'd');
  ctx.globalAlpha = 1;
};

// ---------- a pickup bounced off the Spell Portal (the factory is full) ----------
R.drawRej = function (ctx, v, r, base) {
  const u = Math.min(1, r.t / r.dur), cx = base[0], cy = base[1] - 72, spr = itemSprite(r.kind);
  const out = u < 0.4 ? u / 0.4 : 1 - (u - 0.4) / 0.6;   // comes out toward the factory, is turned away, goes back in
  const x = cx - Math.sin(Math.min(1, u / 0.4) * 1.5708) * 46 * (u < 0.4 ? 1 : 1 - (u - 0.4) / 0.6), y = cy + 30 - Math.sin(u * Math.PI) * 54 - out * 6;
  if (u >= 0.36 && u < 0.62) {   // the hit: a red ring in the portal's plane and the cross
    const k = (u - 0.36) / 0.26;
    ctx.save(); ctx.translate(cx, cy); ctx.transform(-v.hw, v.hh, 0, 72, 0, 0);
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.ellipse(0, 0, 0.9 + k * 0.5, 0.9 + k * 0.5, 0, 0, 6.283); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  const sq = u >= 0.36 && u < 0.5 ? 0.72 : 1;
  if (spr) dsprSq(ctx, spr, x, y, 4, 1 + (1 - sq), sq, Math.min(1, u * 8));
  if (u > 0.3 && u < 0.85 && Math.floor(r.t * 14) % 2) dspr(ctx, SP.ic_x, x, y - 40, 4);
};

// ---------- a boost the Wizard made happen: the Harnesser / Battery pulses gently and a small "+" bounces over it ----------
R.drawBoost = function (ctx, v, p, base, t, col, seed) {
  ctx.globalAlpha = 0.1 + 0.07 * Math.sin(t * 5 + seed); ctx.fillStyle = col; diamond(ctx, p[0], p[1], v.hw * 0.9, v.hh * 0.9); ctx.fill(); ctx.globalAlpha = 1;
  const k = Math.abs(Math.sin(t * 4 + seed)), bounce = Math.round(k * 12 / 4) * 4, S2 = Math.sin(t * 8 + seed) > 0 ? 4 : 3;
  const sil = silOf(SP.ic_plus, col);
  dspr(ctx, silOf(SP.ic_plus, '#1a0f28'), p[0] + 2, base - 128 - bounce + 2, S2);   // (a dark shadow so it reads on any ground)
  dspr(ctx, sil, p[0], base - 128 - bounce, S2);
};

// ---------- statuses on a foe: slowed, frozen, dazed ----------
R.drawFoeStatus = function (ctx, e, x, y) {
  const list = [];
  if (e.frozen > 0) list.push(['#bfe9ff', 'ic_slow']);
  else if (e.slow > 0 && e.slowT > 0) list.push(['#78c8ff', 'ic_slow']);
  if (e.dazeT > 0 && !(e.frozen > 0)) list.push(['#ffe36b', 'ic_warn']);
  list.forEach((s, i) => {
    const bx = Math.round(x + i * 24), by = Math.round(y);
    pbox(ctx, bx - 9, by - 9, 18, 18, s[0], '#1a0f28');
    dspr(ctx, SP[s[1]], bx, by + 6, 2);
  });
};

// ---------- a wand slot / a shrine is ready: the element's particles are sucked into the staff before it starts to blink ----------
R.drawWandFill = function (ctx, gx, gy, tt) {
  const fx = G.wand && G.wand.fx;
  if (!fx || !ELEM[fx.el]) return;
  const D = CFG.wandFill, k = Math.min(1, fx.t / D.dur), n = 18, el = fx.el, col = ELEM[el].color;
  for (let i = 0; i < n; i++) {
    const ph = Math.max(0, Math.min(1, (k - (i / n) * 0.55) / 0.45));   // each particle leaves a little after the one before
    if (ph <= 0 || ph >= 1) continue;
    const a = i * 2.4 + ph * 7, r = (1 - ph) * (150 + (i % 3) * 20), x = gx + Math.cos(a) * r, y = gy + Math.sin(a) * r * 0.55 - (1 - ph) * 30;
    ctx.globalAlpha = Math.min(1, ph * 3) * 0.95; ctx.fillStyle = i % 4 === 0 ? '#ffffff' : col;
    R.elPix(ctx, el, snap(x), Math.round(y / 3) * 3, ph > 0.8 ? 3 : 6);
  }
  if (k > 0.65) {   // the staff takes it in: a growing halo
    const g = (k - 0.65) / 0.35;
    ctx.globalAlpha = 0.35 * (1 - g * 0.4); ctx.fillStyle = col; ctx.fillRect(snap(gx - 12 - g * 12), Math.round((gy - 12 - g * 12) / 3) * 3, 24 + g * 24, 24 + g * 24);
  }
  ctx.globalAlpha = 1;
};
