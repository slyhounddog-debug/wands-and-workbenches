'use strict';
// Drawing the attention-and-causality cues (loaded after render.js; the rule and the list of events are in CLAUDE.md and FEEDBACK.md). Every cue answers
// WHAT happened, WHY, and what to look at NEXT, in icons. All of it is a pure function of G and the clock, so the photo test sees nothing hidden:
//   R.drawHurt      the Wizard was hit: a red edge flash and a chevron toward the attacker, the direction only (G.w.hurt)
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
  // the chevron round his body pointing at the attacker (the arrow alone: no picture, the direction is the answer)
  const r = 78, px = -dy, py = dx, tx = q[0] + dx * (r + 16), ty = cy + dy * (r + 16) * 0.7;
  const pts = [[tx, ty], [q[0] + dx * (r - 8) + px * 15, cy + (dy * (r - 8) + py * 15) * 0.7], [q[0] + dx * (r - 8) - px * 15, cy + (dy * (r - 8) - py * 15) * 0.7]];
  ctx.globalAlpha = Math.min(1, k * 1.6);
  ctx.fillStyle = blink ? '#ffffff' : '#ff4a5a'; ctx.strokeStyle = '#1a0f28'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.globalAlpha = 1;
};

// ---------- ash or lava within 4 tiles: a thermometer blinks over his head (not with the Emberward Cloak) ----------
R.drawHeat = function (ctx, v, w, t) {
  if (!w.heat || w.dead || WZ.has('ember') || G.menu) return;
  const q = R.toScreenLocked(v, w.x, w.y), fast = w.heat >= 2 ? 6 : 3;
  if (Math.floor(t * fast) % 2) return;
  const y = Math.round(q[1] - 150);
  pbox(ctx, Math.round(q[0] - 24), y - 30, 48, 60, '#2b1d48', w.heat === 3 ? '#ff5a3a' : '#ffb030');
  dspr(ctx, SP.ic_thermo, q[0], y + 22, 5);
};
// ---------- an Aether Shard being picked up: it rises over the spot, hovers, shakes with confetti ----------
R.drawShardUp = function (ctx, v, o, p, t) {
  const U = CFG.shardUp, rise = Math.min(1, o.up / U.rise), e = 1 - Math.pow(1 - rise, 3), lift = Math.round(e * U.h * v.hh * 2 / 3) * 3, shaking = o.up > U.rise, k = Math.max(0, o.up - U.rise) / U.shake;
  const jx = shaking ? (Math.floor(o.up * 40) % 2 ? 4 : -4) * (0.5 + k) : 0, hov = shaking ? 0 : Math.round(Math.sin(t * 6) * 1.5) * 3, y = p[1] - 12 - lift - hov;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; diamond(ctx, p[0], p[1], 14 - e * 4, 7 - e * 2); ctx.fill();
  ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 8); ctx.fillStyle = '#c890ff'; diamond(ctx, p[0] + jx, y + 6, 22 + (shaking ? 10 * k : 0), 11); ctx.fill(); ctx.globalAlpha = 1;   // a halo
  dspr(ctx, itemSprite('shard'), p[0] + jx, y, shaking ? 4 : 3);
  if (shaking) {   // confetti pours off it
    const cols = ['#ffe36b', '#ff6a8a', '#7be0ff', '#9aff8a', '#c890ff', '#ffffff'], age = o.up - U.rise;
    for (let i = 0; i < 22; i++) {
      const cyc = (age * 1.5 + i * 0.173) % 1, a = i * 2.4 + 0.7, sp = 34 + (i % 5) * 12;
      ctx.fillStyle = cols[i % cols.length]; ctx.globalAlpha = 1 - cyc * 0.7;
      ctx.fillRect(Math.round((p[0] + jx + Math.cos(a) * sp * cyc) / 3) * 3, Math.round((y - 12 + Math.sin(a) * sp * 0.5 * cyc + cyc * cyc * 90) / 3) * 3, i % 3 ? 6 : 9, i % 3 ? 6 : 3);
    }
    ctx.globalAlpha = 1;
  } else if (rise > 0.5) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round((p[0] + 12) / 3) * 3, Math.round((y - 18 + Math.sin(t * 9) * 6) / 3) * 3, 6, 6); }
};
// ---------- over the Spell Portal: an Aether Shard is on its way (the preview before the real one comes out) ----------
R.drawShardPrev = function (ctx, v, t, base) {
  const sp = G.fac.shardPrev;
  if (!sp) return;
  const fade = Math.min(1, (sp.dur - sp.t) / 0.5), pop = sp.t < 0.25 ? sp.t / 0.25 : 1, y = Math.round(base[1] - 96 - (1 - pop) * 30 + Math.sin(t * 5) * 2), bx = Math.min(R.rect.x0 + R.rect.w - 52, Math.round(base[0] - 78));   // beside the portal, clear of the danger panel above it
  ctx.globalAlpha = fade;
  pbox(ctx, bx - 40, y - 44, 80, 80, '#2b1d48', Math.floor(t * 6) % 2 ? '#ffffff' : '#c890ff');
  dspr(ctx, itemSprite('shard'), bx, y + 4, 4);
  txt(ctx, 'SHARD', bx, y - 52, 12, '#e0b8ff', 'center', 'd');
  ctx.globalAlpha = 1;
};

// ---------- the Builder's goal gems: scattered XP gems lying on the floor until he walks near them ----------
R.drawFacGems = function (ctx, v, f, t) {
  for (const g of f.xpg) {
    const s = R.toScreen(v, g.x, g.y), rest = g.t >= 0.5, arc = rest ? 0 : Math.sin(g.t / 0.5 * Math.PI) * 40, bob = rest ? Math.round(Math.sin(t * 4 + g.seed) * 1.5) * 3 : 0, sc = 3 + WZ.gemTier(g.val);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; diamond(ctx, s[0], s[1], 10 + sc * 2, 5 + sc); ctx.fill();
    dspr(ctx, SP.gem, s[0], s[1] - 8 - arc - bob, sc);
    if (rest && Math.floor(t * 3 + g.seed * 5) % 6 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(s[0] + 9), Math.round(s[1] - 26 - bob), 6, 6); }   // a glint
  }
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
  // the title says WHY the picture is there (MUTANT SPAWNED, ELITE SPAWNED...), the box says "this one is WEAK TO" these elements: no arrow to misread
  const left = th.dur - th.t, fade = Math.min(1, left / 1), n = th.els.length, bw = 92 + Math.max(110, n * 48 + 20), bh = 84;
  const rx0 = R.rect.x0, rx1 = R.rect.x0 + R.rect.w, x = Math.max(rx0 + 8, Math.min(rx1 - bw - 8, Math.round(base[0] - bw / 2))), y = Math.round(base[1] - 236 - (th.t < 0.3 ? (0.3 - th.t) * 60 : 0));   // (kept inside this half: the portal stands at its edge)
  const blink = th.t < 1.6 && Math.floor(th.t * 8) % 2;
  ctx.globalAlpha = fade;
  pbox(ctx, x, y, bw, bh, '#2b1d48', blink ? '#ffffff' : '#ff9a3a');
  const sp = R.spr(th.ic), S2 = sp ? Math.max(2, Math.min(4, Math.floor(56 / Math.max(sp.c.width, sp.c.height)))) : 3;
  if (sp) dspr(ctx, sp, x + 44, y + 12 + (56 - sp.c.height * S2) / 2 + sp.c.height * S2 / 2 + (Math.sin(t * 5) > 0 ? 0 : 3), S2);
  ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + 88, y + 8, 4, bh - 16);   // a divider between what it is and what it is weak to
  txt(ctx, 'WEAK TO', x + 100 + Math.max(110, n * 48 + 20) / 2 - 6, y + 28, 12, '#ffd23a', 'center', 'd');
  th.els.forEach((el, i) => {
    const ex = x + 100 + i * 48, ey = y + 74 + (Math.floor(t * 5 + i) % 2 ? 0 : -3);
    dspr(ctx, itemSprite(el), ex + 12, ey, 3);
    txt(ctx, ELEM_WORD[el] || el, ex + 12, ey + 14, 8, '#ffffff', 'center', 'd');
  });
  if (th.n) { const tw = th.n.length * 14 / 2 + 8; txt(ctx, th.n, Math.max(rx0 + tw, Math.min(rx1 - tw, x + bw / 2)), y - 10, 14, '#ffd23a', 'center', 'd'); }
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
  if (e.burnT > 0) list.push(['#ff8a3a', 'ic_flame']);   // (4P: Fire's trait)
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
