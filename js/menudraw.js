'use strict';
// Drawing the living menu world (see js/menu.js). It is called from R.drawWorld whenever G.menu exists, draws from G alone (plates, modals, props, the sequence) and, like the
// rest of the renderer, never changes the game: the Builder, the belts, the Spell Portal and everything else of the scratch factory are the real renderers' own functions
// (R.drawBuilder / drawBelt / drawPortal / drawFly...) handed a view shifted onto the patch. All text that is not a plate label is a window (a modal) drawn by this file.
(function () {
const { OX, OY } = Menu;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; };
const easeOut = t => 1 - (1 - t) * (1 - t);

// the factory's coordinates drawn in the wilds' view: shift the view's origin by the tile offset
Menu.view = function (v) {
  const mv = Object.assign({}, v);
  mv.ox = v.ox + (OX - OY) * v.hw; mv.oy = v.oy + (OX + OY) * v.hh;
  mv.cam = { x: v.cam.x - OX, y: v.cam.y - OY };
  return mv;
};
const optOf = p => {
  const d = p.data, cat = Players.CATS[d.who].find(c => c.key === d.cat);
  return { cat, op: cat.opts.find(o => o.id === d.opt) };
};
const scrOf = (v, x, y) => R.toScreen(v, x, y);

// ---------- the ground: the patch's edge and rim, then the plates ----------
Menu.drawGround = function (ctx, v, mv) {
  const m = G.menu, t = m.t;
  bakes = 0;
  for (const p of m.plates) if (p.kind !== 'tag') drawPlate(ctx, v, p, t);
  if (m.tele) {   // the teleport: a ring on the ground under each of them
    const k = clamp((m.t - m.tele.t0) / 0.8, 0, 1), a = Math.sin(k * Math.PI);
    for (const r of ['B', 'W']) {
      const c = Menu.charPos(r), p = R.toScreen(v, c.x, c.y);
      ctx.fillStyle = 'rgba(74,40,144,' + (0.55 * a).toFixed(2) + ')'; diamond(ctx, p[0], p[1], 66, 33); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = a * (0.95 - i * 0.25); ctx.strokeStyle = i % 2 ? '#ffffff' : '#c890ff'; ctx.lineWidth = 6; const q = 1.05 - i * 0.28 + Math.sin(t * 8 + i) * 0.05; diamond(ctx, p[0], p[1], 60 * q, 30 * q); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }
};
// a character nobody plays rocks back and forth and hops a little, on the spot
Menu.idleBob = function (role) {
  const m = G.menu;
  if (m.conn[role] || m.seq || m.ret || m.tele || (role === 'B' && m.hideB)) return null;
  const t = m.t * 5.2 + (role === 'W' ? 2 : 0);
  return { rot: Math.sin(t) * 0.11, hop: Math.round(Math.abs(Math.sin(t * 0.5)) * 4) * 3 };
};
const teleK = m => (m.tele ? (m.tele.dir === 'out' ? 1 - clamp((m.t - m.tele.t0) / 0.8, 0, 1) : clamp((m.t - m.tele.t0) / 0.8, 0, 1)) : 1);
// the Wizard in the menu world: shrinks into the teleport ring / grows out of it
Menu.drawWizard = function (ctx, v, w) {
  const k = teleK(G.menu), b = Menu.idleBob('W');
  if (k >= 1 && b) {
    const p = R.toScreen(v, w.x, w.y);
    ctx.save(); ctx.translate(p[0], p[1] - b.hop); ctx.rotate(b.rot); ctx.translate(-p[0], -p[1]);
    R.drawWizard(ctx, v, w);
    ctx.restore();
    return;
  }
  if (k >= 1) { R.drawWizard(ctx, v, w); return; }
  if (k <= 0.03) return;
  const p = R.toScreen(v, w.x, w.y);
  ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(Math.min(1, k * 1.3), k); ctx.translate(-p[0], -p[1]);
  R.drawWizard(ctx, v, w);
  ctx.restore();
};
function plateScale(p) {
  if (p.st === 'wait') return 0;
  if (p.st === 'in') return Math.max(0, easeOutBack(p.t));
  if (p.st === 'out') return Math.max(0, 1 - p.t * p.t);
  return 1;
}
function plateColors(p) {
  if (p.col) return [p.col, '#7a2a1a'];
  switch (p.kind) {
    case 'back': return ['#d8c8f0', '#6a5a90'];
    case 'vol': return ['#5a4a7a', '#2a1c44'];
    case 'ready': return [p.on.B || p.on.W ? '#6aff8a' : '#9be8b0', '#2a8a4a'];
    case 'anchor': return ['#ffe9a0', '#b8861a'];
    case 'pg': return ['#c8e8ff', '#3a78b0'];
    case 'cos': return ['#e8e0f0', '#6a5a90'];
    default: return p.safe ? ['#8fd8ff', '#2a78b8'] : ['#ffd75a', '#b8861a'];
  }
}
// A cosmetic or volume plate at rest (up, not pressed, not flashing) never changes between frames, so it is painted once into a bitmap on the buffer's grid and pasted: seventy of
// them were five fills and a face each, every frame. Anything that moves it (popping in or out, a character on it, a flash) takes the live path.
const PLC = new Map(), uids = new WeakMap(); let uidN = 0, bakes = 0;
const uidOf = o => { let u = uids.get(o); if (!u) uids.set(o, u = ++uidN); return u; };
function plateSig(p, top, rim) {
  if (p.kind === 'cos') {
    const { cat, op } = optOf(p), cv = cat.kind === 'color' || cat.kind === 'trail' ? null : Players.thumb(p.data.who, cat, op);
    return 'c|' + top + rim + '|' + p.r + '|' + p.data.who + cat.key + op.id + '|' + (Players.selId(p.data.who, p.data.cat) === op.id) + Players.has(op) + (cv ? uidOf(cv) : 0);
  }
  return 'v|' + top + rim + '|' + p.r + '|' + p.data.k + p.data.i + '|' + p.ic;
}
function plateCached(ctx, v, p, c, hw, hh, top, rim) {
  const P = R.px, key = plateSig(p, top, rim) + '|' + hw + '|' + hh + '|' + P;
  let e = PLC.get(key);
  if (!e) {
    if (bakes >= 8) return false;   // (a screen of new plates is painted a few a frame; the rest are drawn live meanwhile)
    bakes++;
    if (PLC.size > 400) PLC.clear();
    const ex = Math.ceil((hw + 10) / P) * P, A = Math.ceil((hh + 16) / P) * P, H = A + Math.ceil((hh + 14) / P) * P;
    const cv = document.createElement('canvas'); cv.width = ex * 2 / P; cv.height = H / P;
    const g = cv.getContext('2d'); g.setTransform(1 / P, 0, 0, 1 / P, 0, 0);
    const org = R.org; R.org = 0;
    plateBody(g, p, [ex, A], hw, hh, 1, 0, 0, top, rim, 0);
    R.org = org;
    e = { cv, ex, A };
    PLC.set(key, e);
  }
  ctx.drawImage(e.cv, snap(c[0]) - e.ex, Math.round(c[1] / P) * P - e.A, e.cv.width * P, e.cv.height * P);
  return true;
}
function drawPlate(ctx, v, p, t) {
  const s = plateScale(p);
  if (s <= 0.01) return;
  const c = scrOf(v, p.x, p.y), hw = p.r * 2 * v.hw * s, hh = p.r * 2 * v.hh * s;
  const press = (p.on.B || p.on.W) ? 4 : 0, flash = p.flash > 0 ? p.flash / 0.4 : 0;
  const [top0, rim] = plateColors(p);
  let top = top0;
  if (p.kind === 'vol') { const lit = volLit(p.data); top = lit ? (p.data.i === 0 ? '#ff7a6a' : ['#9be86a', '#c8e84a', '#ffd23a', '#ffb02a', '#ff8a2a', '#ff6a3a', '#ff4a4a'][Math.max(0, p.data.i - 1)]) : '#7a6aa8'; }
  if (p.kind === 'cos') {
    const { cat, op } = optOf(p), has = Players.has(op), sel = Players.selId(p.data.who, p.data.cat) === op.id;
    top = !has ? '#8a80a0' : sel ? '#9affb8' : '#efe8f6';
  }
  if (s >= 1 && p.st === 'up' && !press && !flash && (p.kind === 'cos' || p.kind === 'vol')) { if (plateCached(ctx, v, p, c, hw, hh, top, rim)) return; }
  plateBody(ctx, p, c, hw, hh, s, press, flash, top, rim, t);
}
function plateBody(ctx, p, c, hw, hh, s, press, flash, top, rim, t) {
  const depth = 8 * s;
  // the dark slab under it (it stands a little proud of the ground, and sinks when something stands on it)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; diamond(ctx, c[0] + 3, c[1] + 6, hw + 1.5, hh + 1.5); ctx.fill();
  const cy = c[1] - (depth - press) * (p.st === 'in' ? Math.max(0.2, s) : 1);
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.moveTo(c[0] - hw, cy); ctx.lineTo(c[0], cy + hh); ctx.lineTo(c[0] + hw, cy); ctx.lineTo(c[0] + hw, cy + depth); ctx.lineTo(c[0], cy + hh + depth); ctx.lineTo(c[0] - hw, cy + depth); ctx.closePath(); ctx.fill();
  ctx.fillStyle = top; diamond(ctx, c[0], cy, hw, hh); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; diamond(ctx, c[0], cy, hw * 0.78, hh * 0.78); ctx.fill();
  ctx.fillStyle = top; diamond(ctx, c[0], cy, hw * 0.7, hh * 0.7); ctx.fill();
  if (flash > 0) { ctx.globalAlpha = flash * 0.7; ctx.fillStyle = '#ffffff'; diamond(ctx, c[0], cy, hw, hh); ctx.fill(); ctx.globalAlpha = 1; }
  if (p.kind === 'ready' && (p.on.B || p.on.W)) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.3; diamond(ctx, c[0], cy, hw + 6, hh + 3); ctx.stroke(); ctx.globalAlpha = 1; }
  if (p.kind !== 'cos' && p.kind !== 'vol' && !(p.on.B || p.on.W) && p.st === 'up') {   // a gentle bob of light so the plates read as buttons
    ctx.globalAlpha = 0.25 + Math.sin(t * 3 + p.id) * 0.12; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; diamond(ctx, c[0], cy, hw - 5, hh - 3); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // the face of the plate
  if (p.kind === 'cos') drawCosFace(ctx, p, c[0], cy, s);
  else if (p.kind === 'vol') drawVolFace(ctx, p, c[0], cy, s);
  else if (p.ic && SP[p.ic]) {   // the symbol on the plate: small above the short word written under it (drawText), or big when it stands alone
    const spr = SP[p.ic], S = (s < 0.99 ? s : 1) * (p.word ? 3 : 6), h = spr.c.height * S;
    dspr(ctx, spr, c[0], p.word ? cy - 3 * s : cy + h / 2, S, 1, p.flip);
  }
}
function drawVolFace(ctx, p, x, y, s) {
  const d = p.data, lit = volLit(d);
  if (d.i === 0) {   // the mute plate: the row's symbol, struck through
    const spr = SP[p.ic];
    if (spr) dspr(ctx, spr, x, y + spr.c.height * 1.5 * s, 3 * s);
    ctx.strokeStyle = '#1a0f28'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 15 * s, y - 11 * s); ctx.lineTo(x + 15 * s, y + 11 * s); ctx.stroke();
    return;
  }
  for (let k = 0; k < 7; k++) {   // a staircase of bars: as many as the plate's level
    const bh = (3 + 2 * k) * s, bx = x - 20 * s + k * 6 * s;
    ctx.globalAlpha = k < d.i ? 0.9 : 0.5; ctx.fillStyle = k < d.i ? '#1a0f28' : '#e4d8ff';
    ctx.fillRect(Math.round(bx), Math.round(y + 7 * s - bh), Math.round(4 * s), Math.round(bh));
  }
  ctx.globalAlpha = 1;
}
function volLit(d) {
  const lv = Math.round((d.k === 'sfx' ? AU.settings.sfx : AU.settings.music) * 7);
  return d.i === 0 ? lv === 0 : d.i <= lv;
}
function drawCosFace(ctx, p, x, y, s) {
  const { cat, op } = optOf(p), has = Players.has(op);
  const sel = Players.selId(p.data.who, p.data.cat) === op.id;
  if (cat.kind === 'color') {
    const hw = p.r * 2 * 30 * s * 0.62, hh = p.r * 2 * 15 * s * 0.62;
    ctx.fillStyle = op.b; diamond(ctx, x, y, hw, hh); ctx.fill();
    ctx.fillStyle = op.a; ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  } else if (cat.kind === 'trail') {
    if (!op.cols) { const spr = SP.ic_x; if (spr) dspr(ctx, spr, x, y + 6, 2); }
    else op.cols.slice(0, 4).forEach((cl, i) => { ctx.fillStyle = cl; ctx.fillRect(Math.round((x - 12 + (i % 2) * 12) / 3) * 3, Math.round((y - 6 + (i >> 1) * 6) / 3) * 3, 6, 6); });
  } else {
    const cv = Players.thumb(p.data.who, cat, op);
    if (cv) { const k = 3 * s; ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, Math.round(x - cv.width * k / 2), Math.round(y - cv.height * k * 0.55), cv.width * k, cv.height * k); }
  }
  if (!has) { const l = SP.ic_lock; if (l) dspr(ctx, l, x + 10, y + 10, 1); }
  if (sel) { ctx.strokeStyle = '#1f8a4a'; ctx.lineWidth = 3; diamond(ctx, x, y, p.r * 2 * 30 * s + 3, p.r * 2 * 15 * s + 2); ctx.stroke(); }
}

// ---------- the patch itself ----------
Menu.drawEdge = function (ctx, v) {
  const m = G.menu, r = m.rect;
  const a = scrOf(v, r.x0, r.y0), b = scrOf(v, r.x1, r.y0), c = scrOf(v, r.x1, r.y1), d = scrOf(v, r.x0, r.y1);
  // everything outside the patch is dimmed: it is the real wilds, but only this patch is "the menu"
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.org - 10, -10, R.rect.w + R.px + 20, CFG.H + 20);
  ctx.moveTo(a[0], a[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.closePath();
  ctx.fillStyle = 'rgba(14,6,30,0.66)'; ctx.fill('evenodd');
  ctx.restore();
  // a dirt rim hanging under the two near edges, like the factory floor
  const rim = 30;
  ctx.fillStyle = '#8a5c34'; ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + rim); ctx.lineTo(d[0], d[1] + rim); ctx.fill();
  ctx.fillStyle = '#6a4426'; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] + rim); ctx.lineTo(c[0], c[1] + rim); ctx.fill();
  ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.stroke();
  ctx.globalAlpha = 1;
};

// ---------- the things that stand in the world: depth-sorted with the Wizard ----------
Menu.collect = function (objs, v, mv) {
  const m = G.menu, f = G.fac, t = m.t, wx = x => x + OX, wy = y => y + OY;
  const push = (d, fn) => objs.push({ d, t: 'menu', fn });
  // the spell belt line, and what is on it
  if (m.beltOn !== false) {
    for (const b of f.belts) {
      push(wx(b.x) + wy(b.y) + 0.4, (c) => drawBeltLine(c, v, mv, b, t));
      if (b.item && b.sk === undefined) push(wx(b.x) + wy(b.y) + 1.6, (c) => R.drawBeltItem(c, mv, b, t));   // what rides a belt is drawn over the belts after it, never under them
    }
    const pp = f.pp;
    push(wx(pp.x) + wy(pp.y) + 2, (c) => { c.save(); const k = Math.min(portalFade(m), m.beltAt === undefined ? 1 : clamp((m.t - m.beltAt) / 0.5, 0, 1)), pa = CFG.portalAlpha; if (k < 1) c.globalAlpha = k; CFG.portalAlpha = 0.85; if (k > 0) R.drawPortal(c, mv, t, 'spell'); CFG.portalAlpha = pa; c.restore(); });
  }
  for (const o of f.floor) push(wx(o.x) + wy(o.y) + 1.2, c => R.drawFloor(c, mv, o, t));
  for (const o of f.flying) push(wx(o.x) + wy(o.y) + 1.8, c => R.drawFly(c, mv, o, t));
  if (!m.hideB && !(m.dropB && m.t < m.dropB.t0)) push(wx(G.bd.x) + wy(G.bd.y), c => drawBuilderMenu(c, v, mv, m, t));
  if (m.sx && !m.hideBPortalDone) push(1e5, c => drawSuckPortal(c, v, m, t));
  if (m.kb) push(m.kb.x + m.kb.y, c => drawKeyboard(c, v, m, t));
  if (m.statues && m.page === 'cs') for (const r of ['B', 'W']) push(m.statues[r].x + m.statues[r].y, c => drawStatue(c, v, m, r, t));
};
function portalFade(m) { return m.sx && m.sx.portal ? clamp(1 - (m.t - m.sx.portal) / 0.5, 0, 1) : 1; }
function drawBeltLine(c, v, mv, b, t) {
  const m = G.menu;
  if (b.sk !== undefined) {   // sucked up into a portal over it
    const k = (m.t - b.sk) / 0.5;
    if (k >= 1) return;
    const p = R.toScreen(mv, b.x + 0.5, b.y + 0.5);
    c.save();
    c.translate(p[0], p[1]); c.scale(1 - 0.7 * k, 1 - 0.7 * k); c.translate(0, -k * 260 / (1 - 0.7 * k)); c.translate(-p[0], -p[1]);
    c.globalAlpha = 1 - k * 0.5;
    R.drawBelt(c, mv, b, t);
    c.restore();
    const sky = [p[0], p[1] - 330 * Math.min(1, k * 2)];
    c.globalAlpha = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.9;
    portalRing(c, sky[0], sky[1], 46, t);
    c.globalAlpha = 1;
    return;
  }
  R.drawBelt(c, mv, b, t, true);
}
const portalRing = R.portalRing;
function drawBuilderMenu(c, v, mv, m, t) {
  const bd = G.bd;
  if (m.dropB) {   // coming back from a game: he drops out of a portal beside the Wizard
    const k = clamp((m.t - m.dropB.t0) / 0.6, 0, 1);
    if (k < 1) {
      const p = R.toScreen(mv, bd.x, bd.y);
      c.fillStyle = 'rgba(0,0,0,' + (0.1 + 0.25 * k).toFixed(2) + ')'; diamond(c, p[0], p[1], 30 * (0.3 + 0.7 * k), 15 * (0.3 + 0.7 * k)); c.fill();
      if (k < 0.5) { c.globalAlpha = 0.9; portalRing(c, p[0], p[1] - 480, 54 * Math.sin(k / 0.5 * Math.PI), t); c.globalAlpha = 1; }
      c.save(); c.translate(0, -Math.pow(1 - k, 2) * 450); R.drawBuilder(c, mv, bd, t); c.restore();
      return;
    }
  }
  if (m.tele) {
    const k = teleK(m);
    if (k <= 0.03) return;
    const p = R.toScreen(mv, bd.x, bd.y);
    c.save(); c.translate(p[0], p[1]); c.scale(Math.min(1, k * 1.3), k); c.translate(-p[0], -p[1]);
    R.drawBuilder(c, mv, bd, t);
    c.restore();
    return;
  }
  if (m.sx && !m.hideB) {   // the portal above him opens and he is drawn up into it
    const k = clamp((m.t - m.sx.t0) / Menu.SEQ.suck, 0, 1), p = R.toScreenLocked(mv, bd.x, bd.y);
    c.save();
    const lift = easeOut(k) * 300 * k, sc = 1 - 0.75 * k * k;
    c.translate(p[0], p[1] - lift); c.scale(sc, sc); c.rotate(Math.round(k * 12) / 12 * 6.283 * 1.5); c.translate(-p[0], -(p[1] - lift));
    R.drawBuilder(c, mv, bd, t);
    c.restore();
    return;
  }
  const ib = Menu.idleBob('B');
  if (ib) {
    const p = R.toScreen(mv, bd.x, bd.y);
    c.save(); c.translate(p[0], p[1] - ib.hop); c.rotate(ib.rot); c.translate(-p[0], -p[1]);
    R.drawBuilder(c, mv, bd, t);
    c.restore();
    return;
  }
  R.drawBuilder(c, mv, bd, t);
}
function drawSuckPortal(c, v, m, t) {
  const k = clamp((m.t - m.sx.t0) / Menu.SEQ.suck, 0, 1.2);
  const p = R.toScreen(Menu.view(v), G.bd.x, G.bd.y);
  const open = Math.min(1, k * 4) * (k > 1 ? Math.max(0, 1 - (k - 1) * 5) : 1);
  if (open <= 0) return;
  c.globalAlpha = Math.min(1, open);
  portalRing(c, p[0], p[1] - 330, 80 * open, t);
  // a pale beam from the portal down onto the spot
  c.globalAlpha = 0.25 * open; c.fillStyle = '#ffffff'; c.fillRect(Math.round(p[0] - 30 * open), Math.round(p[1] - 330), Math.round(60 * open), 330);
  c.globalAlpha = 1;
}
// the keyboard building the Join plate raises: a big friendly prop
function drawKeyboard(c, v, m, t) {
  const kb = m.kb, k = easeOutBack(clamp(kb.t, 0, 1)), p = R.toScreen(v, kb.x, kb.y);
  if (kb.t <= 0) return;
  const W = 130 * k, H = 44 * k, lift = 26 * k;
  c.fillStyle = 'rgba(0,0,0,0.28)'; diamond(c, p[0] + 3, p[1] + 6, W * 0.62, H * 0.62); c.fill();
  // the case: a slab with a slanted key deck
  c.fillStyle = '#2b1d48'; c.beginPath(); c.moveTo(p[0] - W / 2, p[1] - lift + 8); c.lineTo(p[0], p[1] - lift + 8 + H / 2); c.lineTo(p[0] + W / 2, p[1] - lift + 8); c.lineTo(p[0] + W / 2, p[1] + 8); c.lineTo(p[0], p[1] + 8 + H / 2); c.lineTo(p[0] - W / 2, p[1] + 8); c.closePath(); c.fill();
  c.fillStyle = '#5a4a7a'; diamond(c, p[0], p[1] - lift + 8, W / 2, H / 2); c.fill();
  c.fillStyle = '#e8e0f0'; diamond(c, p[0], p[1] - lift + 8, W / 2 - 8, H / 2 - 4); c.fill();
  // rows of key caps
  const rows = 4, cols = 6;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const u = (q + 0.5) / cols - 0.5, w = (r + 0.5) / rows - 0.5;
    const kx = p[0] + (u - w) * (W / 2 - 14) * 0.9, ky = p[1] - lift + 8 + (u + w) * (H / 2 - 6) * 0.9;
    const act = m.typing && (Math.floor(m.t * 9) + r * 7 + q * 3) % 11 === 0;
    c.fillStyle = act ? '#ffd23a' : '#a898c8'; diamond(c, kx, ky - (act ? 0 : 2), 7 * k, 3.5 * k); c.fill();
  }
}
function drawStatue(c, v, m, r, t) {
  const s = m.statues[r], p = R.toScreen(v, s.x, s.y), spr = r === 'B' ? SP.builder : SP.wizard;
  c.fillStyle = 'rgba(0,0,0,0.28)'; diamond(c, p[0] + 3, p[1] + 5, 40, 20); c.fill();
  // the pedestal
  c.fillStyle = '#6a6478'; c.beginPath(); c.moveTo(p[0] - 36, p[1] - 14); c.lineTo(p[0], p[1] + 4); c.lineTo(p[0] + 36, p[1] - 14); c.lineTo(p[0] + 36, p[1] - 2); c.lineTo(p[0], p[1] + 16); c.lineTo(p[0] - 36, p[1] - 2); c.closePath(); c.fill();
  c.fillStyle = '#a8a2b8'; diamond(c, p[0], p[1] - 14, 36, 18); c.fill();
  if (spr) {
    c.save(); c.filter = 'grayscale(1) brightness(1.15) contrast(0.9)';
    dspr(c, spr, p[0], p[1] - 16, 3, 1, r === 'W');
    c.restore();
  }
  // a gold plaque
  c.fillStyle = '#ffd23a'; c.fillRect(Math.round((p[0] - 9) / 3) * 3, Math.round((p[1] - 4) / 3) * 3, 18, 6);
}

// ---------- particles, pops: the factory's own, in the wilds' view ----------
Menu.drawFx = function (ctx, mv, t) {
  const f = G.fac, P = R.px;
  for (const p of f.parts) {
    const s = R.toScreen(mv, p.x, p.y);
    ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = p.col;
    if (p.el) { R.elPix(ctx, p.el, Math.round(s[0] / P) * P, Math.round((s[1] - p.z * 22) / P) * P, P); continue; }
    const sz = p.dust ? (p.t > 0.25 ? 8 : 4) : p.sz || 4;
    ctx.fillRect(Math.round((s[0] - sz / 2) / P) * P, Math.round((s[1] - p.z * 22) / P) * P, sz, sz);
  }
  ctx.globalAlpha = 1;
  for (const r of f.rings) {
    const k = r.t / 0.3, s = R.toScreen(mv, r.x, r.y), rad = Math.round((10 + k * 28) / P) * P;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.col; ctx.lineWidth = 2 * P; diamond(ctx, s[0], s[1] - 28, rad, rad / 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of f.pops) {
    const s = R.toScreen(mv, p.x, p.y), a = Math.max(0, 1 - Math.max(0, p.t - 0.6) / 0.5), y = s[1] - 70 - Math.floor(p.t * 10) * 4;
    if (p.ic) { R.defer.push(c => R.iconRow(c, s[0], y + 8, p.ic, a)); continue; }
  }
};

// ---------- text, windows: the deferred full-resolution pass ----------
const INK = '#1a0f28', PANEL = '#2b1d48', HI = '#4a3468', LO = '#20142f', CREAM = '#fff6e0', GOLD = '#ffd23a', MUTED = '#c8b8e8';
function panel(c, x, y, w, h, alpha) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  c.globalAlpha = alpha === undefined ? 1 : alpha;
  c.fillStyle = INK; c.fillRect(x - 4, y, w + 8, h); c.fillRect(x, y - 4, w, h + 8);
  c.fillStyle = PANEL; c.fillRect(x, y, w, h);
  c.fillStyle = HI; c.fillRect(x, y, w, 4);
  c.fillStyle = LO; c.fillRect(x, y + h - 4, w, 4);
  c.globalAlpha = 1;
}
function ptext(c, s, x, y, size, col, align, disp) {
  c.font = size + 'px ' + (disp ? FONT_D : FONT_B);
  c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = col || CREAM;
  c.fillText(s, Math.round(x), Math.round(y));
}
function icon(c, key, x, y, size) {   // a sprite icon with its bottom-left at (x, y - size)
  const cv = UI.iconCanvas(key);
  if (!cv) return 0;
  const k = Math.max(1, Math.round(size / Math.max(cv.width, cv.height)));
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, Math.round(x), Math.round(y - cv.height * k), cv.width * k, cv.height * k);
  return cv.width * k;
}

// -- the rich text engine: html-ish strings (<b>, <kbd>, <i>, <code>, &nbsp;, <br>) and icon runs, wrapped to a width and cut into pages
const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'");
function runsOf(html) {
  const out = [];
  const st = { b: 0, kbd: 0, i: 0, code: 0 };
  const re = /<(\/?)(b|kbd|i|em|code|br|u)\b[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) {
      const text = ent(m[3]);
      if (st.kbd) { out.push({ t: 'kbd', s: text.trim() }); continue; }
      for (const w of text.split(/(\s+)/)) { if (!w) continue; if (/^\s+$/.test(w)) out.push({ t: 'sp' }); else out.push({ t: 'w', s: w, b: st.b, i: st.i, code: st.code }); }
    } else {
      const tag = m[2], close = !!m[1];
      if (tag === 'br') out.push({ t: 'br' });
      else if (tag === 'b') st.b += close ? -1 : 1;
      else if (tag === 'kbd') st.kbd += close ? -1 : 1;
      else if (tag === 'i' || tag === 'em') st.i += close ? -1 : 1;
      else if (tag === 'code') st.code += close ? -1 : 1;
    }
  }
  return out;
}
let mctx = null;
function measurer() { return mctx || (mctx = document.createElement('canvas').getContext('2d')); }
// lay runs out in a column of width W: returns lines [{ w, items: [{ x, run, w }] }]
function flow(runs, W, size) {
  const c = measurer();
  c.font = size + 'px ' + FONT_B;
  const lines = [];
  let cur = { items: [], w: 0 };
  const gap = Math.round(size * 0.3);
  const push = () => { lines.push(cur); cur = { items: [], w: 0 }; };
  for (const r of runs) {
    if (r.t === 'br') { push(); continue; }
    if (r.t === 'sp') { if (cur.items.length) cur.w += gap; continue; }
    let w;
    if (r.t === 'kbd') { c.font = size * 0.8 + 'px ' + FONT_D; w = Math.ceil(c.measureText(r.s).width) + 16; c.font = size + 'px ' + FONT_B; }
    else if (r.t === 'ic') w = (UI.iconCanvas(r.k) ? UI.iconCanvas(r.k).width * Math.max(1, Math.round(size * 1.2 / Math.max(UI.iconCanvas(r.k).width, UI.iconCanvas(r.k).height))) : 0) + (r.n ? 6 + String(r.n).length * 12 : 0);
    else w = Math.ceil(c.measureText(r.s).width);
    if (cur.items.length && cur.w + w > W) push();
    cur.items.push({ x: cur.w, run: r, w }); cur.w += w;
  }
  if (cur.items.length || !lines.length) push();
  return lines;
}
// blocks -> pages. block kinds: { h: 'Heading' } { p: 'html' } { runs: [...] } { row: [keyHtml, descHtml], kw }.
// Each page is { cmds: [ { type, x, y, ... } ] } at a fixed size.
const DOC = { w: 640, h: 420, pad: 24, size: 18, lh: 24 };
function paginate(blocks, W, H, size, lh) {
  const pages = [];
  let page = { cmds: [] }, y = 0;
  const flush = () => { pages.push(page); page = { cmds: [] }; y = 0; };
  const put = (cmd, h) => { if (y + h > H && y > 0) flush(); cmd.y = y; page.cmds.push(cmd); y += h; };
  for (const b of blocks) {
    if (b.h !== undefined) { if (y + lh * 4 > H && y > 0) flush(); if (y > 0) y += 12; put({ type: 'h', s: b.h }, lh + 8); continue; }
    if (b.row) {
      const kw = b.kw || 360, kl = flow(runsOf(b.row[0]), kw - 12, size), dl = flow(runsOf(b.row[1]), W - kw - 12, size), n = Math.max(kl.length, dl.length);
      if (y + n * lh > H && y > 0) flush();
      page.cmds.push({ type: 'lines', x: 0, y, lines: kl, lh }); page.cmds.push({ type: 'lines', x: kw, y, lines: dl, lh });
      y += n * lh + 14; continue;
    }
    const runs = b.runs || runsOf(b.p);
    const lines = flow(runs, W, size);
    let i = 0;
    while (i < lines.length) {   // a long paragraph continues on the next page
      const room = Math.max(1, Math.floor((H - y) / lh));
      const take = Math.min(room, lines.length - i);
      if (take < Math.min(lines.length - i, 2) && y > 0) { flush(); continue; }
      page.cmds.push({ type: 'lines', x: 0, y, lines: lines.slice(i, i + take), lh }); y += take * lh; i += take;
      if (i < lines.length) flush();
    }
    y += 10;
  }
  if (page.cmds.length) pages.push(page);
  return pages;
}
function docBlocks() {
  const out = { howto: [] };   // (the Controls live in the pause menu only)
  const ks = Object.keys(HOWTO);
  for (const tab of ks) {
    if (tab === 'CONTROLS') continue;
    const blocks = [];
    if (HOWTO[tab]) for (const h of HOWTO[tab]) { blocks.push({ h: h[0] }); blocks.push({ p: h[1] }); }
    else {   // the recipes tab: what each resource is for, then every machine's recipes as icons
      const uses = { wood: 'Every building, belts (1 each), fuel for a Battery', stone: 'Every building, fuel for a Battery', iron: 'Forge, Armory, Battery, Heavy Battery, Stockpile Tiles, every garment and the Warden Key, Floor Tiles after the 28th',
        shard: 'Rare: only from landmarks and elites. Spawners, garments, the Warden Key; 6 go into the Skill Portal for Summoning', wardkey: 'Forged at the Armory. Sent through the Spell Portal while the Wizard stands at the Stronghold, it opens the door to the Warden',
        air: 'Spell Portal: Air Gust. Skill Portal: currency. Battery fuel, recipes', water: 'Spell Portal: Water Spray. Skill Portal: currency. Battery fuel, recipes', fire: 'Spell Portal: Fireball. Skill Portal: currency. Battery fuel, recipes', earth: 'Spell Portal: Boulder. Skill Portal: currency. Battery fuel, recipes' };
      blocks.push({ h: 'What everything is for' });
      for (const k of Object.keys(uses)) blocks.push({ runs: [{ t: 'ic', k }, { t: 'sp' }, { t: 'w', s: itemName(k) + ':', b: 1 }, { t: 'sp' }].concat(runsOf(uses[k])) });
      const byM = {};
      for (const id in CFG.recipes) (byM[CFG.recipes[id].machine] = byM[CFG.recipes[id].machine] || []).push(id);
      for (const mach in byM) {
        blocks.push({ h: CFG.buildings[mach].name });
        for (const id of byM[mach]) {
          const R0 = CFG.recipes[id], runs = [];
          Object.keys(R0.in).forEach((k, i) => { if (i) runs.push({ t: 'sp' }); runs.push({ t: 'ic', k, n: R0.in[k] > 1 ? 'x' + R0.in[k] : 0 }); });
          runs.push({ t: 'sp' }, { t: 'w', s: '>' }, { t: 'sp' }, { t: 'ic', k: R0.out }, { t: 'sp' }, { t: 'w', s: recipeName(id), b: 1 });
          if (R0.power) runs.push({ t: 'sp' }, { t: 'w', s: '(' + R0.power + ' power)', i: 1 });
          blocks.push({ runs });
        }
      }
    }
    out.howto.push({ name: tab, blocks });
  }
  return out;
}
let docCache = null;
function docPages(id) {
  if (!docCache) {
    docCache = { howto: [] };
    const d = docBlocks(), IW = DOC.w - DOC.pad * 2, IH = DOC.h - 130;
    for (const key of ['howto']) for (const sec of d[key]) for (const pg of paginate(sec.blocks, IW, IH, DOC.size, DOC.lh)) { pg.title = sec.name; docCache[key].push(pg); }
  }
  return docCache[id];
}
Menu.docCount = id => docPages(id).length;

function drawLines(c, cmd, x0, y0, size, lh) {
  for (let li = 0; li < cmd.lines.length; li++) {
    const ln = cmd.lines[li], base = y0 + cmd.y + li * lh + size;
    for (const it of ln.items) {
      const r = it.run, x = x0 + cmd.x + it.x;
      if (r.t === 'w') ptext(c, r.s, x, base, size, r.code ? '#7be0ff' : r.b ? GOLD : r.i ? MUTED : CREAM);
      else if (r.t === 'kbd') {
        c.fillStyle = INK; c.fillRect(x - 2, base - size - 1, it.w + 4, size + 8);
        c.fillStyle = CREAM; c.fillRect(x, base - size + 1, it.w, size + 4);
        c.fillStyle = '#c8a878'; c.fillRect(x, base + size * 0.1, it.w, 3);
        ptext(c, r.s, x + it.w / 2, base - 1, size * 0.8, '#3a2410', 'center', true);
      } else if (r.t === 'ic') {
        const w = icon(c, r.k, x, base + 4, size * 1.2);
        if (r.n) ptext(c, String(r.n), x + w + 4, base, size, CREAM, 'left', true);
      }
    }
  }
}

// -- the windows
function anchorOf(v, md) {
  const m = G.menu;
  let ax, ay;
  if (md.anchor === 'kb' && m.kb) { ax = m.kb.x; ay = m.kb.y; }
  else if (md.anchor) { const p = m.plates.find(q => q.key === md.anchor); if (p) { ax = p.x; ay = p.y; } }
  if (ax === undefined) { const o = md.at ? Menu.at(md.at.sx, md.at.sy) : { x: md.x, y: md.y }; ax = o.x; ay = o.y; }
  const s = R.toScreen(v, ax, ay);
  return { x: s[0], y: s[1] };
}
const SIZES = { doc: [DOC.w, DOC.h], ach: [DOC.w, DOC.h], slot: [250, 150], text: [560, 220], room: [560, 320], code: [560, 280] };
function modalSize(md) {
  if (md.kind === 'text') { const n = (md.lines || []).length; return [md.w || 560, 96 + n * 28]; }
  if (md.kind === 'slot') return [250, 56 + (md.empty ? 1 : md.lines.length - 1) * 30 + 14];
  return SIZES[md.kind] || [400, 200];
}
// The windows hover in the sky above the patch's top-right edge (the plates stand along it), never over the patch where the characters are: each one flies out of its plate
// to the place above the edge that is nearest to it, side by side when there are several, and a big one (the documents, the achievements) takes the far right.
Menu.drawModals = function (c, v) {
  const m = G.menu, r = m.rect;
  const A = scrOf(v, r.x0, r.y0), B = scrOf(v, r.x1, r.y0);   // the patch's top corner and its right corner
  const sky = (x0, x1) => { const d = x1 < A[0] ? A[0] - x1 : x0 > A[0] ? x0 - A[0] : 0; return A[1] + Math.min(d, B[0] - A[0]) * 0.5; };   // the lowest a window may reach over [x0, x1]
  const list = m.modals.map(md => ({ md, sz: modalSize(md), a: anchorOf(v, md) })).sort((p, q) => p.a.x - q.a.x);
  let edge = 20;
  for (const it of list) {
    const md = it.md, w = it.sz[0], h = it.sz[1], a = it.a, k = easeOut(clamp(md.t, 0, 1));
    let hx = Math.max(md.kind === 'doc' || md.kind === 'ach' ? CFG.W - w - 24 : a.x - w / 2, edge);
    let hy = sky(hx, hx + w) - 20 - h, guard = 0;
    while (hy < 14 && hx + w < CFG.W - 20 && guard++ < 80) { hx += 20; hy = sky(hx, hx + w) - 20 - h; }
    hy = Math.max(14, hy) - Math.sin(m.t * 2 + md.id) * 3;
    edge = hx + w + 12;
    if (k <= 0) continue;
    const x = a.x + (hx + w / 2 - a.x) * k - (w * k) / 2, y = a.y + (hy + h / 2 - a.y) * k - (h * k) / 2;
    c.save();
    c.translate(x, y); c.scale(k, k);
    drawModal(c, md, w, h, k, v);
    c.restore();
    // a thin tether from the plate to the window, so it reads as coming from it
    c.globalAlpha = 0.5; c.strokeStyle = GOLD; c.lineWidth = 3; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(a.x, a.y - 26); c.lineTo(clamp(a.x, hx + 14, hx + w - 14), y + h * k + 4); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
  }
};
function fit(c, s, size, maxW) { c.font = size + 'px ' + FONT_B; while (size > 11 && c.measureText(s).width > maxW) { size--; c.font = size + 'px ' + FONT_B; } return size; }
function drawModal(c, md, w, h, k, v) {
  panel(c, 0, 0, w, h);
  switch (md.kind) {
    case 'slot': {
      ptext(c, md.lines[0], w / 2, 40, 14, GOLD, 'center', true);
      if (md.empty) ptext(c, 'Empty', w / 2, 88, 28, MUTED, 'center');
      else md.lines.slice(1).forEach((s, i) => ptext(c, s, w / 2, 76 + i * 30, 24, CREAM, 'center'));
      break;
    }
    case 'text': {
      ptext(c, md.title || '', w / 2, 44, 16, GOLD, 'center', true);
      (md.lines || []).forEach((s, i) => ptext(c, s, w / 2, 88 + i * 28, 24, md.bad ? '#ff9a8a' : CREAM, 'center'));
      break;
    }
    case 'doc': {
      const pages = docPages(md.doc), pg = clamp(G.menu.doc.pg, 0, pages.length - 1), page = pages[pg];
      ptext(c, 'HOW TO PLAY', DOC.pad, 42, 16, GOLD, 'left', true);
      ptext(c, page.title.toUpperCase(), w / 2 + 50, 42, 12, MUTED, 'center', true);
      ptext(c, (pg + 1) + ' / ' + pages.length, w - DOC.pad, 42, 14, CREAM, 'right', true);
      c.fillStyle = HI; c.fillRect(DOC.pad, 56, w - DOC.pad * 2, 4);
      const x0 = DOC.pad, y0 = 76;
      for (const cmd of page.cmds) {
        if (cmd.type === 'h') ptext(c, cmd.s, x0, y0 + cmd.y + 18, 15, GOLD, 'left', true);
        else drawLines(c, cmd, x0, y0, DOC.size, DOC.lh);
      }
      ptext(c, '< >  PLATES TURN THE PAGE', w / 2, h - 14, 12, MUTED, 'center', true);
      break;
    }
    case 'ach': {
      const rows = Players.achRows(), half = Math.ceil(rows.length / 2), list = md.page === 0 ? rows.slice(0, half) : rows.slice(half);
      const done = rows.filter(r => r.ok).length;
      ptext(c, 'ACHIEVEMENTS ' + done + '/' + rows.length, 24, 42, 16, GOLD, 'left', true);
      ptext(c, 'PAGE ' + (md.page + 1) + ' / 2', w - 24, 42, 12, MUTED, 'right', true);
      c.fillStyle = HI; c.fillRect(24, 56, w - 48, 4);
      const cw = (w - 48 - 20) / 2, per = Math.ceil(list.length / 2);
      list.forEach((r, i) => {
        const col = i < per ? 0 : 1, ri = i < per ? i : i - per, x = 24 + col * (cw + 20), y = 70 + ri * 44;
        c.globalAlpha = r.ok ? 1 : 0.62;
        icon(c, r.icon, x, y + 34, 30);
        ptext(c, r.name, x + 40, y + 16, fit(c, r.name, 19, cw - 80), r.ok ? GOLD : CREAM);
        ptext(c, r.text, x + 40, y + 36, fit(c, r.text, 15, cw - 80), MUTED);
        icon(c, r.ok ? 'ic_check' : 'ic_lock', x + cw - 22, y + 28, 20);
        c.globalAlpha = 1;
      });
      break;
    }
    case 'room': {
      const o = md.o || { state: 'opening' };
      ptext(c, 'HOST A GAME', w / 2, 46, 16, GOLD, 'center', true);
      if (o.state === 'opening') ptext(c, 'Opening a room' + '...'.slice(0, 1 + Math.floor(G.menu.t * 2) % 3), w / 2, 160, 26, CREAM, 'center');
      else if (o.state === 'error') Menu.wrapLines(o.err || 'Something went wrong.', 40).forEach((s, i) => ptext(c, s, w / 2, 130 + i * 28, 24, '#ff9a8a', 'center'));
      else {
        ptext(c, 'Your partner joins with this code:', w / 2, 90, 22, MUTED, 'center');
        for (let i = 0; i < o.code.length; i++) {
          const x = w / 2 - 3 * 76 + i * 76 + 6;
          c.fillStyle = INK; c.fillRect(x - 2, 112, 68, 84); c.fillStyle = '#3c2862'; c.fillRect(x, 114, 64, 80);
          ptext(c, o.code[i], x + 32, 176, 52, GOLD, 'center', true);
        }
        const st = o.status || (o.state === 'live' ? 'Player 2 is here!' : 'Waiting for player 2' + '...'.slice(0, 1 + Math.floor(G.menu.t * 2) % 3));
        Menu.wrapLines(st, 52).forEach((s, i) => ptext(c, s, w / 2, 236 + i * 26, 22, CREAM, 'center'));
      }
      break;
    }
    case 'code': {
      const ty = G.menu.typing;
      ptext(c, 'JOIN A GAME', w / 2, 46, 16, GOLD, 'center', true);
      ptext(c, ty ? 'Type the 6 letters the host sees' : 'Walk up to the keyboard and press E', w / 2, 86, 22, MUTED, 'center');
      const code = ty ? ty.code : '';
      for (let i = 0; i < 6; i++) {
        const x = w / 2 - 3 * 76 + i * 76 + 6, cur = ty && i === code.length && Math.floor(G.menu.t * 3) % 2;
        c.fillStyle = INK; c.fillRect(x - 2, 108, 68, 84); c.fillStyle = cur ? '#5a4a8a' : '#3c2862'; c.fillRect(x, 110, 64, 80);
        if (code[i]) ptext(c, code[i], x + 32, 172, 52, GOLD, 'center', true);
      }
      const msg = ty && ty.msg;
      if (msg) Menu.wrapLines(msg, 50).forEach((s, i) => ptext(c, s, w / 2, 222 + i * 24, 20, ty.busy ? CREAM : '#ff9a8a', 'center'));
      else if (ty) ptext(c, 'ENTER joins   BACKSPACE edits   E cancels', w / 2, 232, 14, MUTED, 'center', true);
      break;
    }
  }
}

// -- what is drawn in the screen-space pass for the whole menu world
Menu.drawText = function (c, v, mv) {
  const m = G.menu;
  TIPS = [];
  // the short word written on a plate, and a tooltip with its full name when a character is beside it
  for (const p of m.plates) {
    if (p.kind === 'cos' || !p.word || plateScale(p) < 0.95) continue;
    const sc = scrOf(v, p.x, p.y), cy = sc[1] - (8 - ((p.on.B || p.on.W) ? 4 : 0));
    drawText(c, p.word, sc[0], cy + 15, 17, '#ffffff', 'center');
  }
  if (!m.seq) for (const p of m.plates) {
    if (p.kind === 'cos' || !p.label || p.label === p.word || plateScale(p) < 0.95) continue;
    let near = false;
    for (const r of ['B', 'W']) if (m.conn[r]) { const q = Menu.charPos(r); if (Math.hypot(q.x - p.x, q.y - p.y) < p.r + 1.2) near = true; }
    if (near) { const sc = scrOf(v, p.x, p.y); tooltip(c, sc[0], sc[1] - 56, [p.label], GOLD); }
  }
  // the character select: what the plate under a character is
  if (m.page === 'cs') {
    for (const r of ['B', 'W']) {
      if (!m.conn[r]) continue;
      const p = m.plates.find(q => q.kind === 'cos' && q.role === r && q.on[r]);
      if (p) {
        const { cat, op } = optOf(p), has = Players.has(op), sc = scrOf(v, p.x, p.y);
        const lines = [cat.label + ': ' + op.name];
        if (!has) { const a = Players.achById[op.ach]; lines.push('Earn ' + a.name + ': ' + a.text); } else if (op.ach) lines.push('Unlocked by ' + Players.achById[op.ach].name);
        tooltip(c, sc[0], sc[1] - 62, lines, has ? GOLD : '#ff9a8a');
      }
    }
    for (const r of ['B', 'W']) if (m.statues && Menu.nearProp(r) === 'statue') { const s = scrOf(v, m.statues[r === 'B' ? 'W' : 'B'].x, m.statues[r === 'B' ? 'W' : 'B'].y); keyPrompt(c, s[0], s[1] - 120, r, ['ic_swap']); }
  }
  charsOverTips(c, v, mv);
  // the prompts: use next to the keyboard
  if (m.kb && m.kb.t >= 1 && !m.typing) for (const r of ['B', 'W']) if (m.conn[r] && Menu.nearProp(r) === 'kb') { const s = scrOf(v, m.kb.x, m.kb.y); keyPrompt(c, s[0], s[1] - 90, r, ['ic_gear']); }
  // spell names, top right
  m.toasts.forEach((tt, i) => {
    const a = clamp(Math.min(tt.t / 0.15, (3.2 - tt.t) / 0.4), 0, 1), y = 40 + i * 52, w = 330, x0 = 30 - (1 - a) * 40;
    c.globalAlpha = a; panel(c, x0, y, w, 40);
    c.fillStyle = tt.col; c.fillRect(x0 + 8, y + 8, 8, 24);
    ptext(c, tt.text, x0 + 28, y + 28, 22, CREAM);
    c.globalAlpha = 1;
  });
  if (m.page === 'main' && !m.seq && !m.ret) {   // the title, over the patch
    const bob = Math.round(Math.sin(m.t * 2.4) * 3);
    c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.font = '52px ' + FONT_D;
    const tx = CFG.W / 2 + m.sh[0];   // (over the patch, which sits left of the screen's middle)
    [['WANDS &', 90], ['WORKBENCHES', 152]].forEach(([s, y]) => { for (const [dx, col] of [[8, INK], [4, '#a0500a']]) { c.fillStyle = col; c.fillText(s, tx + dx, y + bob + dx); } c.fillStyle = '#ffd23a'; c.fillText(s, tx, y + bob); });
    ptext(c, 'Build the factory. Arm the wizard. Together.', tx, 196 + bob, 26, CREAM, 'center');
    if (!m.conn.B && !m.conn.W) drawText(c, 'WALK ONTO A PLATE', tx, 884, 14, '#ffe36b', 'center', 'd');
  }
  if (m.fade > 0 && Net.role !== 'guest') { c.fillStyle = 'rgba(0,0,0,' + m.fade.toFixed(3) + ')'; c.fillRect(0, 0, CFG.W, CFG.H); }   // (online the host's screen goes dark before the factory)
  // the countdown
  if (m.count > 0) {
    const n = Math.ceil(m.count), k = 1 - (m.count - Math.floor(m.count));
    c.save(); c.translate(CFG.W / 2, 330); c.scale(1 + (1 - k) * 0.3, 1 + (1 - k) * 0.3);
    c.globalAlpha = 0.5 + k * 0.5;
    c.font = '120px ' + FONT_D; c.textAlign = 'center'; c.lineWidth = 12; c.strokeStyle = INK; c.strokeText(String(n), 0, 70); c.fillStyle = GOLD; c.fillText(String(n), 0, 70);
    c.restore(); c.globalAlpha = 1;
  }
  // the pad / keyboard hints for a Builder holding or next to a spell
  Menu.drawModals(c, v);
};
let TIPS = [];   // the tooltips drawn this frame: [x, y, w, h]
function tooltip(c, x, y, lines, col) {
  const w = Math.max(...lines.map(s => { c.font = '20px ' + FONT_B; return c.measureText(s).width; })) + 36, h = 18 + lines.length * 28;
  x = clamp(x - w / 2, 14, CFG.W - w - 14); y = y - h;
  panel(c, x, y, w, h, 0.96);
  lines.forEach((s, i) => ptext(c, s, x + 18, y + 30 + i * 28, 20, i ? CREAM : col));
  TIPS.push([x - 4, y - 4, w + 8, h + 8]);
}
// the characters stand on top of the tooltips (which are full-resolution text drawn after the low-res world): draw both again, clipped to the tooltips' rectangles
function charsOverTips(c, v, mv) {
  const m = G.menu;
  if (!TIPS.length || m.seq || m.ret || m.tele || m.dropB) return;
  c.save(); c.beginPath(); for (const r of TIPS) c.rect(r[0], r[1], r[2], r[3]); c.clip();
  const bd = G.bd, w = G.w, last = (bd.x + OX + bd.y + OY) > (w.x + w.y);   // the nearer one last
  if (last) Menu.drawWizard(c, v, w);
  if (!m.hideB) drawBuilderMenu(c, v, mv, m, m.t);
  if (!last) Menu.drawWizard(c, v, w);
  c.restore();
}
function keyPrompt(c, x, y, role, icons) {
  const key = role === 'B' ? (Main.padB() ? 'X' : (G.ctl.kbB && !(Main.kbShared() && G.swapped) ? 'E' : '/')) : (Main.padW() ? 'X' : (G.ctl.kbB && !G.swapped ? '/' : 'E'));
  R.iprompt(c, x, y, key, icons);
}
// the Builder's hints: what the pick and throw buttons are
Menu.hints = function (ctx, v, mv) {
  const m = G.menu, bd = G.bd;
  if (m.hideB || m.seq || !m.conn.B) return;
  const pk = R.focus && R.focus.list.find(e => e.key === 'pick');   // (what the pick button takes: Menu.step works it out like Main.updateFocus)
  if (pk && !G.hands.length) {
    const s = R.toScreen(mv, pk.t.x, pk.t.y); R.iprompt(ctx, s[0], s[1] - 100, R.key('pick'), pk.a.ic || []);
  } else if (G.hands.length && !bd.gather) {
    const aim = Menu.aimNow();
    if (aim && aim.obj && (aim.obj.type === 'portal' || aim.obj === 'wiz')) {
      const s = R.toScreen(mv, aim.x, aim.y);
      R.iprompt(ctx, s[0], s[1] - 150, G.lastInput === 'pad' ? 'B' : G.ctl.kbB && Main.altB() ? ',' : 'RMB', ['ic_portal']);
      const sa = R.toScreen(mv, aim.x, aim.y); ctx.strokeStyle = '#7bff9a'; ctx.lineWidth = 4; diamond(ctx, sa[0], sa[1], 34, 17); ctx.stroke();
    }
  }
};
})();
