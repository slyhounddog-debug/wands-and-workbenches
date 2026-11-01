'use strict';
// 3-PLAYER MODE, drawing (loaded after mode4draw.js): the Rootkeeper's sprites, the underworld (R.drawUnder), what of it shows in the wilds (stumps, rock piles, manifested nodes,
// traps, the charge %, and the ghosts when the Wizard's ghost view is on), the ghosts of the wilds below, and the corner picture that cycles between teammates.
// Pure functions of G and the clock, like every renderer. (The underworld's smoothed camera is R.ucam, the same kind of thing as R.wcam: flagged in Snap.KNOWN.)

// ---------- sprites ----------
task(() => {
  const P = { h: '#22301a', H: '#4f7a2e', k: '#140c1a', e: '#ffd23a', c: '#22301a', C: '#5f8f34', g: '#9adf5a', s: '#7a5430', L: '#ffe36b', l: '#c89a3a', r: '#6a4a2a', R: '#4a3018' };
  const body = ['....hhhhh....', '...hHHHHHh...', '..hHHHHHHHh..', '..hHkkkkkHh..', '..hHkekekHh..', '..hHkkkkkHh..', '...hHHHHHh.s.', '..cCCCCCCCcs.', '.cCCgCCCgCcs.',
    '.cCCCCCCCCcs.', 'cCCgCCCCCgCLL', 'cCCCCCCCCCCll', 'cCCCCgCCCCCs.', '.cCCCCCCCCcs.', '.cCCCCCCCCc..', '..rRr...rRr..', '.rr.r...r.rr.'];
  reg('rootkeeper', mapSprite(body, P), 6.5, 17);
  const step = body.slice(0, 15).concat(['..rRr..rRr...', '.rr.r..r.rr..']);
  reg('rootkeeper2', mapSprite(step, P), 6.5, 17);
  const ic = (name, rows, pal) => reg('ic_' + name, mapSprite(rows, pal), Math.max.apply(null, rows.map(r => r.length)) / 2, rows.length);
  ic('root', ['...g...', '..ggg..', '...b...', '..bbb..', '.b.b.b.', 'b..b..b', '..b.b..'], { g: '#9adf5a', b: '#8a5a2a' });
  ic('ghost', ['.wwww.', 'wwwwww', 'wkwwkw', 'wwwwww', 'wwwwww', 'w.ww.w'], { w: '#e8f0ff', k: '#3a2a5a' });
  // remains (what a kill leaves below) and ash (what burning leaves), one per element
  for (const el of ['air', 'water', 'fire', 'earth']) {
    const c = ELEM[el].color, d = ELEM[el].dark;
    reg('it_rem_' + el, mapSprite(['..ww...', '.wccw..', 'wcdcdw.', 'wcccccw', '.wcdcw.', '..www..'], { w: '#e8e0d0', c, d }), 3.5, 6);
    reg('it_ash_' + el, mapSprite(['...c...', '..ggg..', '.ggcgg.', 'gggggggg'], { g: '#8a8494', c }), 4, 4);
  }
  reg('it_n_tree', mapSprite(['..gg..', '.g..g.', '.bbbb.', 'bccccb', 'bccccb', '.bccb.', '..bb..'], { g: '#9adf5a', b: '#5a3a1a', c: '#a8683a' }), 3, 7);
  reg('it_n_rock', mapSprite(['..g...', '.ggg..', '.sss..', 'sSsSss', 'ssssss', '.ssss.'], { g: '#9adf5a', s: '#a9b0b8', S: '#7a8088' }), 3, 6);
  reg('it_n_iron', mapSprite(['..g...', '.ggg..', '.sos..', 'sosSos', 'ssosss', '.ssss.'], { g: '#9adf5a', s: '#8a8f98', S: '#5a5f68', o: '#c8703a' }), 3, 6);
  reg('it_t_dmg', mapSprite(['t..t..t', '.tbtbt.', '.bbbbb.', 'tbbbbbt', '.bbbbb.', '.tbtbt.', 't..t..t'], { t: '#e8d8a0', b: '#7a5a2c' }), 3.5, 7);
  reg('it_t_slow', mapSprite(['.vvvv.', 'v....v', 'v.vv.v', 'v.v..v', 'v.vvvv', 'v.....', '.vvvvv'], { v: '#6aa84a' }), 3, 7);
  // the underworld's buildings (20 x 34, base diamond at (10, 26), like the factory's)
  const stoneT = '#6a6478', stoneL = '#4a4458', stoneR = '#3a3448';
  bsprite('u_burner', (x, cx, cy) => { isoBox(x, cx, cy, 8, 4, stoneT, stoneL, stoneR); isoBox(x, cx, cy - 4, 6, 4, '#2a2028', '#5a3a2a', '#4a2a1a'); x.fillStyle = '#1a1018'; x.fillRect(cx - 4, cy - 10, 8, 2); });
  bsprite('u_pylon', (x, cx, cy) => {
    isoBox(x, cx, cy, 6, 3, stoneT, stoneL, stoneR);
    poly(x, [[cx, cy - 26], [cx + 4, cy - 14], [cx, cy - 4], [cx - 4, cy - 14]], '#7a5aa8'); poly(x, [[cx, cy - 26], [cx - 4, cy - 14], [cx, cy - 4]], '#a888d8');
    x.fillStyle = '#e8d8ff'; x.fillRect(cx - 1, cy - 20, 1, 4); x.fillStyle = '#6a4a2a'; x.fillRect(cx - 7, cy - 1, 3, 1); x.fillRect(cx + 4, cy, 3, 1);
  });
  bsprite('u_collector', (x, cx, cy) => {
    isoBox(x, cx, cy, 7, 3, stoneT, stoneL, stoneR);
    x.fillStyle = '#3a3040'; x.fillRect(cx - 5, cy - 26, 2, 24); x.fillRect(cx + 3, cy - 26, 2, 24); x.fillRect(cx - 5, cy - 27, 10, 2);
    x.fillStyle = '#8a7a5a'; for (let i = 0; i < 4; i++) x.fillRect(cx - 3, cy - 22 + i * 5, 6, 1);
    isoBox(x, cx, cy - 12, 3, 4, '#c8a050', '#9a7a3a', '#7a5a2a');
  });
  bsprite('u_pole', (x, cx, cy) => { x.fillStyle = '#6a4a2a'; x.fillRect(cx - 1, cy - 22, 2, 22); x.fillStyle = '#4a3018'; x.fillRect(cx, cy - 22, 1, 22); x.fillStyle = '#c8a050'; x.fillRect(cx - 3, cy - 23, 6, 2); });
  bsprite('u_hpole', (x, cx, cy) => { x.fillStyle = '#5a5f68'; x.fillRect(cx - 2, cy - 26, 4, 26); x.fillStyle = '#3a3f48'; x.fillRect(cx + 1, cy - 26, 1, 26); x.fillStyle = '#c8a050'; for (const yy of [8, 16, 24]) x.fillRect(cx - 3, cy - yy, 6, 1); x.fillRect(cx - 4, cy - 27, 8, 2); });
  bsprite('u_rcraft', (x, cx, cy) => { isoBox(x, cx, cy, 8, 6, '#a8683a', '#7a4a2a', '#5a3418'); x.fillStyle = '#c89a5a'; x.fillRect(cx - 4, cy - 9, 8, 1); poly(x, [[cx, cy - 18], [cx + 4, cy - 12], [cx, cy - 10], [cx - 4, cy - 12]], '#8fd85a'); });
  bsprite('u_tcraft', (x, cx, cy) => { isoBox(x, cx, cy, 8, 4, stoneT, stoneL, stoneR); isoBox(x, cx, cy - 4, 5, 3, '#8a8f98', '#5a5f68', '#4a4f58'); x.fillStyle = '#e8d8a0'; for (let i = -1; i <= 1; i++) poly(x, [[cx + i * 3 - 1, cy - 9], [cx + i * 3, cy - 14], [cx + i * 3 + 1, cy - 9]], '#e8d8a0'); });
  bsprite('u_mirror', (x, cx, cy) => { isoBox(x, cx, cy, 9, 5, '#5a5070', '#3a3450', '#2a2440'); isoBox(x, cx, cy - 5, 5, 2, '#2a2038', '#1a1428', '#140e20'); x.fillStyle = '#8fd85a'; x.fillRect(cx - 8, cy - 2, 1, 2); x.fillRect(cx + 7, cy - 2, 1, 2); });
  // a planted node before it manifests: a stump (tree) or a pile (rock / ore), seen in both worlds
  reg('m3_stump', mk(18, 12, x => { x.fillStyle = '#5a3a1a'; x.fillRect(3, 4, 12, 7); x.fillStyle = '#a8683a'; x.fillRect(4, 2, 10, 3); x.fillStyle = '#c89a5a'; x.fillRect(6, 3, 6, 1); x.fillStyle = '#3a2410'; x.fillRect(1, 10, 4, 2); x.fillRect(13, 10, 4, 2); x.fillStyle = '#9adf5a'; x.fillRect(12, 1, 2, 2); }), 9, 12);
  reg('m3_rocks', mk(18, 10, x => { circ(x, 6, 7, 3.4, '#8a8f98'); circ(x, 12, 7, 3, '#a9b0b8'); circ(x, 9, 4, 2.6, '#c9ccd2'); x.fillStyle = '#9adf5a'; x.fillRect(14, 2, 2, 2); }), 9, 10);
  reg('m3_ores', mk(18, 10, x => { circ(x, 6, 7, 3.4, '#6a6f78'); circ(x, 12, 7, 3, '#8a8f98'); circ(x, 9, 4, 2.6, '#a9b0b8'); x.fillStyle = '#c8703a'; x.fillRect(5, 6, 2, 1); x.fillRect(11, 5, 2, 2); x.fillRect(9, 3, 1, 1); x.fillStyle = '#9adf5a'; x.fillRect(14, 2, 2, 2); }), 9, 10);
  reg('m3_tdmg', mk(20, 10, x => { x.fillStyle = '#7a5a2c'; x.fillRect(2, 5, 16, 3); for (let i = 0; i < 6; i++) poly(x, [[2 + i * 3, 6], [3.5 + i * 3, 0], [5 + i * 3, 6]], '#e8d8a0'); }), 10, 9);
  reg('m3_tslow', mk(20, 10, x => { x.strokeStyle = '#6aa84a'; x.lineWidth = 1.4; x.beginPath(); x.ellipse(10, 6, 8, 3, 0, 0, 6.283); x.stroke(); x.beginPath(); x.ellipse(10, 6, 4, 1.5, 0, 0, 6.283); x.stroke(); x.fillStyle = '#9adf5a'; x.fillRect(4, 3, 2, 2); x.fillRect(14, 7, 2, 2); }), 10, 9);
});

(function () {
const T = () => CFG.WT, ELS = ['air', 'water', 'fire', 'earth'];
R.ucam = { x: 100.5, y: 100.5 };
R.uv = { cx: 1200, cy: 450, T: CFG.WT, org: 800 };
const NODE_SPR = { tree: 'm3_stump', rock: 'm3_rocks', ore: 'm3_ores' };
const BLD_SPR = t => SP['u_' + t];
const toolName = t => (CFG.mode3.bld[t] || {}).name || t;
// a small bar (fr 0..1) on the low-res buffer
const bar = (ctx, x, y, w, fr, col) => { const p = R.px; ctx.fillStyle = '#1a0f28'; ctx.fillRect(Math.round((x - w / 2) / p) * p - p, Math.round(y / p) * p - p, Math.round(w / p) * p + 2 * p, 3 * p); if (fr > 0) { ctx.fillStyle = col; ctx.fillRect(Math.round((x - w / 2) / p) * p, Math.round(y / p) * p, Math.max(p, Math.round(w * Math.min(1, fr) / p) * p), p); } };
const shadow = (ctx, p, w) => { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round((p[0] - w / 2) / 3) * 3, Math.round(p[1] / 3) * 3 - 3, w, 9); };

// ---------- the Rootkeeper himself (in his world, and as a ghost in the wilds) ----------
R.drawRoot = function (ctx, v, rk, alpha, t) {
  const p = R.toScreen(v, rk.x, rk.y), S = T().S, flip = (rk.fx - rk.fy) < 0;
  for (const gh of rk.ghosts || []) { const q = R.toScreen(v, gh.x, gh.y); dspr(ctx, { c: SP.rootkeeper.white, ax: SP.rootkeeper.ax, ay: SP.rootkeeper.ay }, q[0], q[1], S, 0.3 * (gh.t / 0.22) * alpha, flip); }
  if (alpha >= 1) shadow(ctx, p, 30);
  const spr = rk.moving && Math.floor((rk.bob || 0) / 3) % 2 ? SP.rootkeeper2 : SP.rootkeeper, bob = rk.moving ? (Math.sin(rk.bob || 0) > 0 ? -3 : 0) : 0;
  const sq = rk.squash > 0 ? 1 - rk.squash : 1;
  if (alpha < 1) dspr(ctx, { c: spr.white, ax: spr.ax, ay: spr.ay }, p[0], p[1] + bob, S, alpha, flip);
  else if (sq !== 1) dsprSq(ctx, spr, p[0], p[1] + bob, S, 1 + (1 - sq) * 0.5, sq, 1, flip);
  else dspr(ctx, spr, p[0], p[1] + bob, S, 1, flip);
  if (alpha >= 1) {   // his lantern glows (the brightest thing below)
    ctx.globalAlpha = 0.18 + 0.05 * Math.sin((t || 0) * 5); ctx.fillStyle = '#ffe36b';
    ctx.fillRect(Math.round((p[0] + (flip ? -18 : 18) - 15) / 3) * 3, Math.round((p[1] - 36) / 3) * 3, 30, 24); ctx.globalAlpha = 1;
  }
};
// a planted node as it stands in a world: a stump / rock pile (below, and in the wilds until it manifests), its charge ring
const drawNodeBase = function (ctx, v, b, t, alpha) {
  const p = R.toScreen(v, b.x, b.y), S = T().S, spr = SP[NODE_SPR[b.kind]];
  const sh = b.mashT > 0 ? (Math.random() < 0.5 ? -3 : 3) : 0;
  dspr(ctx, spr, p[0] + sh, p[1], S, alpha);
  if (!b.up && b.ch > 0) { ctx.globalAlpha = alpha * 0.8; ctx.strokeStyle = '#9adf5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Math.round(p[0]), Math.round(p[1] - 15), 15, -1.571, -1.571 + b.ch * 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
  if (b.wrongT > 0 && Math.sin(t * 8) > 0) R.defer.push(c => R.iconRow(c, p[0] + 26, p[1] - 30, [[M3.pref(b)], ['ic_x']], 0.85));   // fed the wrong type: what it would rather have
};
const drawTrap = function (ctx, v, b, t, alpha, wilds) {
  const p = R.toScreen(v, b.x, b.y), S = T().S, T3 = CFG.mode3.traps[b.tk];
  const armed = b.fuel >= T3.use && !(b.arm > 0);
  dspr(ctx, SP['m3_t' + b.tk], p[0], p[1] + 3, S, alpha * (armed ? 1 : 0.55));
  if (b.fire > 0) { ctx.globalAlpha = Math.min(1, b.fire * 2) * alpha; ctx.strokeStyle = b.tk === 'slow' ? '#9ad0ff' : '#ffe36b'; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], T3.r * v.hw * 1.4 * (1.4 - b.fire), T3.r * v.hh * 1.4 * (1.4 - b.fire)); ctx.stroke(); ctx.globalAlpha = 1; }
  if (!wilds || alpha >= 1) bar(ctx, p[0], p[1] + 9, 30, b.fuel / T3.store, armed ? '#e8c060' : '#7a6a5a');
  if (b.wrongT > 0 && Math.sin(t * 8) > 0) R.defer.push(c => R.iconRow(c, p[0] + 26, p[1] - 20, [[M3.pref(b)], ['ic_x']], 0.85));
};
// a burner's fire is in the colour of what it burns
const flame = function (ctx, x, y, el, t, k) {
  const col = ELEM[el] ? ELEM[el].color : '#ff7a30';
  for (let i = 0; i < 4; i++) { const a = t * 9 + i * 1.7, h = (10 + 6 * Math.sin(a)) * k; ctx.fillStyle = i % 2 ? col : '#ffe36b'; ctx.fillRect(Math.round((x - 9 + i * 5) / 3) * 3, Math.round((y - h) / 3) * 3, 3, Math.round(h / 3) * 3); }
};
// one underworld building (alpha < 1 = a ghost in the wilds: structure only)
R.drawUBld = function (ctx, v, b, t, alpha, wilds) {
  const p = R.toScreen(v, b.x, b.y), S = T().S, gh = alpha < 1;
  if (b.type === 'node') return drawNodeBase(ctx, v, b, t, alpha);
  if (b.type === 'trap') return drawTrap(ctx, v, b, t, alpha, wilds);
  const spr = BLD_SPR(b.type);
  if (!spr) return;
  const lift = b.pop > 0 ? -Math.sin(b.pop / 0.5 * 3.14) * 6 : 0;
  if (b.type === 'mirror' && b.drop > 0 && !gh) {   // it drops in from above
    const k = Math.min(1, b.drop / 1.2);
    ctx.globalAlpha = 1 - k; dspr(ctx, spr, p[0], p[1] - k * 300, S); ctx.globalAlpha = 1;
    return;
  }
  if (gh) dspr(ctx, { c: spr.white, ax: spr.ax, ay: spr.ay }, p[0], p[1], S, alpha);
  else dspr(ctx, spr, p[0], p[1] + lift, S);
  if (gh) return;
  if (b.type === 'burner') {
    if (b.st === 'burn') flame(ctx, p[0], p[1] - 30 + lift, b.bel, t, 1);
    else if (b.st === 'ash') { ctx.fillStyle = '#8a8494'; ctx.fillRect(Math.round((p[0] - 12) / 3) * 3, Math.round((p[1] - 33) / 3) * 3, 24, 6); }
    if (b.st === 'starve' && b.stT > 1.5) R.defer.push(c => R.iconRow(c, p[0], p[1] - 90, [[b.el], ['ic_starve']]));   // starved of its set type: say which
    else if (b.st === 'ash' && b.stT > 1) R.defer.push(c => R.iconRow(c, p[0], p[1] - 90, [['ash_' + (ELS.find(e => b.ash[e] > 0) || 'air')], ['ic_full']]));   // its ash tray is full: hose a Collector to it
    else R.defer.push(c => R.iconRow(c, p[0] + 24, p[1] - 70, [[b.el]], 0.9));
  }
  if (b.type === 'mirror') {
    const cr = SP['cr_' + b.el];
    if (cr) dspr(ctx, cr, p[0], p[1] - 12 + Math.sin(t * 2 + b.id) * 2, S);
    R.rimU(ctx, p, Math.min(1, b.ch), ELEM[b.el].color);
    if (b.wrongT > 0 && Math.sin(t * 8) > 0) R.defer.push(c => R.iconRow(c, p[0] + 28, p[1] - 70, [[b.el], ['ic_x']], 0.85));
  }
  if ((b.type === 'rcraft' || b.type === 'tcraft') && b.busy) R.rimU(ctx, p, b.prog / CFG.mode3.craftT, '#ffe36b');
  if (b.type === 'collector' && b.lift > 0) { const k = 1 - b.lift / 0.9; dspr(ctx, itemSprite('ash_' + (b.lel || 'air')), p[0], p[1] - 20 - k * 60, S, 1 - k); }
};
// a progress rail along the front edges of a building's tile
R.rimU = function (ctx, p, fr, col) {
  const v = R.uv.hw ? R.uv : R.wv, hw = 27, hh = 13.5;
  ctx.strokeStyle = '#1a0f28'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(p[0] - hw, p[1]); ctx.lineTo(p[0], p[1] + hh); ctx.lineTo(p[0] + hw, p[1]); ctx.stroke();
  if (fr <= 0) return;
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p[0] - hw, p[1]);
  if (fr <= 0.5) ctx.lineTo(p[0] - hw + hw * fr * 2, p[1] + hh * fr * 2); else { ctx.lineTo(p[0], p[1] + hh); ctx.lineTo(p[0] + hw * (fr - 0.5) * 2, p[1] + hh - hh * (fr - 0.5) * 2); }
  ctx.stroke();
};
const hoseLine = function (ctx, v, a, b, alpha, col) {
  const p = R.toScreen(v, a.x, a.y), q = R.toScreen(v, b.x, b.y);
  ctx.globalAlpha = alpha; ctx.strokeStyle = '#1a1018'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 6); ctx.lineTo(q[0], q[1] - 6); ctx.stroke();
  ctx.strokeStyle = col || '#7a5a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 6); ctx.lineTo(q[0], q[1] - 6); ctx.stroke(); ctx.globalAlpha = 1;
};
// where a pulse is: its distance along the path of ids
const pulseAt = function (q) {
  let d = q.t * CFG.mode3.burner.pulseSpeed;
  for (let i = 1; i < q.p.length; i++) {
    const a = M3.byId(q.p[i - 1]), b = M3.byId(q.p[i]);
    if (!a || !b) return null;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= L || i === q.p.length - 1) { const k = L ? Math.min(1, d / L) : 1; return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k]; }
    d -= L;
  }
  return null;
};

// ---------- THE UNDERWORLD ----------
R.drawUnder = function (main, dt, rect) {
  const Tw = T(), S = Tw.S, P = Tw.P, u = G.u, rk = u.rk, t = u.t;
  const rc = R.rect = rect || { x0: CFG.HALF, w: CFG.HALF }, X0 = rc.x0, RW = rc.w;
  const bw = Math.ceil(RW / P), bh = CFG.H / P;
  const buf = lowBuffer('u' + X0 + '_' + RW, bw, bh), ctx = buf.x;
  ctx.setTransform(1 / P, 0, 0, 1 / P, -X0 / P, 0);
  R.px = P; R.org = X0; R.defer = [];
  const cam = R.ucam, k = Math.min(1, dt * 8);
  cam.x += (rk.x + rk.vx * 0.12 - cam.x) * k; cam.y += (rk.y + rk.vy * 0.12 - cam.y) * k;
  const v = R.uv; v.org = X0; v.cx = X0 + RW / 2; setView(v, cam, 0, 0);
  const left = X0, right = X0 + RW;
  ctx.fillStyle = '#120a1a'; ctx.fillRect(X0, 0, RW + P, CFG.H);
  drawGround(ctx, v, left, right);
  // the same layout as the wilds: its grass (bending where the Wizard walks above, and where he walks himself), then the dark of being underground over all of it
  const d0 = Math.floor((-v.oy) / v.hh) - 2, d1 = Math.ceil((CFG.H - v.oy) / v.hh) + 6, uMin = Math.floor((left - v.ox) / v.hw) - 2, uMax = Math.ceil((right - v.ox) / v.hw) + 2;
  const WW = CFG.WW, WH = CFG.WH, bk = WZ.bucket, B = CFG.bend;
  for (let d = Math.max(0, d0); d <= Math.min(WW + WH - 2, d1); d++) for (let uu = uMin; uu <= uMax; uu++) {
    if (((d + uu) & 1) !== 0) continue;
    const x = (d + uu) / 2, y = (d - uu) / 2;
    if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
    const i = y * WW + x, b = bk[i];
    if (!b) continue;
    for (let j = 0; j < b.length; j++) {
      const o = b[j];
      if (!o.deco || !BENDY.has(o.spr)) continue;
      const p = R.toScreen(v, o.x, o.y), bn = u.bend[i * 32 + j];
      let sk = 0;
      if (bn) { const q = bn.t - B.hold; sk = Math.round(bn.d * B.amp * (q <= 0 ? 1 : Math.exp(-q * B.damp) * Math.cos(q * B.spring)) * 10) / 10; }
      if (sk) dsprSkew(ctx, SP[o.spr], p[0], p[1], S, sk); else dspr(ctx, SP[o.spr], p[0], p[1], S);
    }
  }
  ctx.fillStyle = 'rgba(34,14,22,0.7)'; ctx.fillRect(X0, 0, RW + P, CFG.H);   // (an earth-dark wash: the layer underneath)
  ctx.fillStyle = 'rgba(10,4,12,0.35)'; for (let i = 0; i < 3; i++) { const e = 24 + i * 24; ctx.fillRect(X0, 0, RW + P, e); ctx.fillRect(X0, CFG.H - e, RW + P, e); ctx.fillRect(X0, 0, e, CFG.H); ctx.fillRect(X0 + RW - e, 0, e + P, CFG.H); }   // a stepped dark rim (the cave closes in at the edges)
  // glowing motes in the earth (a hash of the tile: no state)
  for (let d = Math.max(0, d0); d <= Math.min(WW + WH - 2, d1); d++) for (let uu = uMin; uu <= uMax; uu++) {
    if (((d + uu) & 1) !== 0) continue;
    const x = (d + uu) / 2, y = (d - uu) / 2, h = hash2(x, y, 77);
    if (h > 0.035) continue;
    const p = R.toScreen(v, x + 0.5, y + 0.5);
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 2 + h * 300); ctx.fillStyle = h < 0.012 ? '#9adf5a' : '#c8a0ff'; ctx.fillRect(Math.round(p[0] / 3) * 3, Math.round(p[1] / 3) * 3, 3, 3);
  }
  ctx.globalAlpha = 1;
  // the hoses, then the pulses running along them
  for (const [a, b] of u.hoses) { const A = M3.byId(a), Bb = M3.byId(b); if (A && Bb) hoseLine(ctx, v, A, Bb, 1); }
  if (rk.hose) { const A = M3.byId(rk.hose); if (A) { const near = M3.near(q => q !== A, 2.4), ok = near && M3.canLink(A, near); ctx.setLineDash([9, 6]); hoseLine(ctx, v, A, rk, 0.9, ok ? '#9adf5a' : Math.hypot(rk.x - A.x, rk.y - A.y) > M3.reachOf(A) ? '#ff6a6a' : '#c8a050'); ctx.setLineDash([]); } }
  for (const q of u.pulses) {
    const at = pulseAt(q);
    if (!at) continue;
    const p = R.toScreen(v, at[0], at[1]), r = Math.round((4 + 6 * q.k) / 3) * 3;
    ctx.fillStyle = ELEM[q.el] ? ELEM[q.el].color : '#ffe36b'; ctx.fillRect(Math.round((p[0] - r) / 3) * 3, Math.round((p[1] - 6 - r) / 3) * 3, r * 2, r * 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round((p[0] - 1) / 3) * 3, Math.round((p[1] - 7) / 3) * 3, 3, 3);
  }
  // everything that stands: buildings, items, him, and the ghosts of the wilds above (when his ghost view is on)
  const objs = [], vis = (x, y, m) => { const sx = (x - y) * v.hw + v.ox, sy = (x + y) * v.hh + v.oy; return sx > left - m && sx < right + m && sy > -m && sy < CFG.H + m * 2; };
  for (const b of u.bld) if (vis(b.x, b.y, 120)) objs.push({ d: b.x + b.y, b });
  for (const it of u.items) if (vis(it.x, it.y, 60)) objs.push({ d: it.x + it.y, it });
  objs.push({ d: rk.x + rk.y, rk: true });
  if (u.ghost.K && G.w) {
    for (const e of G.w.enemies) if (!e.dead && vis(e.x, e.y, 120)) objs.push({ d: e.x + e.y, ge: e });
    if (!G.w.dead) objs.push({ d: G.w.x + G.w.y, gw: true });
  }
  objs.sort((a, b) => a.d - b.d);
  for (const o of objs) {
    if (o.b) R.drawUBld(ctx, v, o.b, t, 1, false);
    else if (o.it) {
      const it = o.it, p = R.toScreen(v, it.x, it.y), R0 = CFG.mode3.remains;
      const fade = ITEMS[it.k].rem && it.t > R0.life - R0.fade ? (Math.sin(t * 14) > 0 ? 0.35 : 0.85) : 1;   // its last seconds: it blinks out
      if (it.z <= 0) shadow(ctx, p, 15);
      ctx.globalAlpha = fade; dspr(ctx, itemSprite(it.k), p[0], p[1] - 3 - it.z * 30 + (Math.sin(t * 4 + it.x) > 0 ? -3 : 0), S); ctx.globalAlpha = 1;
    } else if (o.rk) R.drawRoot(ctx, v, rk, 1, t);
    else if (o.ge) { const e = o.ge, s = SP[e.type + (e.var ? '_' + e.var : '')] || SP[e.type] || SP.slime, p = R.toScreen(v, e.x, e.y); if (s) dspr(ctx, { c: s.white, ax: s.ax, ay: s.ay }, p[0], p[1], S * (e.sz || 1), CFG.mode3.ghostA * 0.8); }
    else if (o.gw) { const s = SP.wizard, p = R.toScreen(v, G.w.x, G.w.y); dspr(ctx, { c: s.white, ax: s.ax, ay: s.ay }, p[0], p[1], S, CFG.mode3.ghostA); R.defer.push(c => txt(c, 'WIZARD', Math.round(p[0]), Math.round(p[1]) + 26, 9, '#d8c8ff', 'center', 'd')); }
  }
  // thrown remains in the air, the effects, the icons popping over things
  for (const f of u.fly) {
    const k = Math.min(1, f.t / f.T), x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k, p = R.toScreen(v, x, y);
    dspr(ctx, itemSprite(f.k), p[0], p[1] - 10 - Math.sin(k * 3.14) * 60, S);
  }
  for (const f of u.fx) {
    const p = R.toScreen(v, f.x, f.y), k = f.t / (f.type === 'lift' ? 1.1 : 0.7);
    if (f.type === 'ring') { ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.col; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], 20 + k * (f.big ? 90 : 40), 10 + k * (f.big ? 45 : 20)); ctx.stroke(); }
    else if (f.type === 'dust' || f.type === 'puff' || f.type === 'spark') {
      ctx.fillStyle = f.col || '#cdbf9a';
      for (let i = 0; i < (f.n || 8); i++) { const a = i * 2.4 + f.x * 3, r = k * (f.type === 'spark' ? 30 : 42); ctx.globalAlpha = 1 - k; ctx.fillRect(Math.round((p[0] + Math.cos(a) * r) / 3) * 3, Math.round((p[1] - 6 + Math.sin(a) * r * 0.5 - (f.type === 'spark' ? k * 30 : 0)) / 3) * 3, 6, 6); }
    } else if (f.type === 'lift') { ctx.globalAlpha = (1 - k) * 0.7; ctx.fillStyle = f.col; ctx.fillRect(Math.round((p[0] - 6) / 3) * 3, Math.round((p[1] - 30 - k * 240) / 3) * 3, 12, 36); }
    else if (f.type === 'stream') { const q = R.toScreen(v, f.x1, f.y1); ctx.globalAlpha = 1 - k; ctx.fillStyle = f.col; for (let i = 0; i < 5; i++) { const j = (k + i / 5) % 1; ctx.fillRect(Math.round((p[0] + (q[0] - p[0]) * j) / 3) * 3, Math.round((p[1] - 20 + (q[1] - p[1]) * j - Math.sin(j * 3.14) * 30) / 3) * 3, 6, 6); } }
    ctx.globalAlpha = 1;
  }
  for (const q of u.pops) { const p = R.toScreen(v, q.x, q.y), a = Math.min(1, (1.1 - q.t) * 3); R.defer.push(c => R.iconRow(c, p[0], p[1] - 40 - q.t * 40, q.ic, a)); }
  // the tool he holds: a ghost of it on the tile in front of him (red when it cannot go there), its cost
  if (rk.tool && rk.tool !== 'hose' && rk.tool !== 'remove') {
    const [fx, fy] = M3.front(), spr = BLD_SPR(rk.tool), c = M3.toolCost(rk.tool), ok = M3.free(fx, fy, 1.0) && M3.canPay(c) && (rk.tool !== 'hpole' || G.tree.rkpole), p = R.toScreen(v, fx, fy);
    ctx.globalAlpha = 0.5; ctx.fillStyle = ok ? '#9adf5a' : '#ff5a5a'; diamond(ctx, p[0], p[1], v.hw, v.hh); ctx.fill(); ctx.globalAlpha = 1;
    if (spr) dspr(ctx, spr, p[0], p[1], S, 0.55);
    if (rk.tool === 'pole' || rk.tool === 'hpole') { ctx.globalAlpha = 0.25; ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 3; const r = M3.reachOf({ type: rk.tool }); diamond(ctx, p[0], p[1], r * v.hw * 1.41, r * v.hh * 1.41); ctx.stroke(); ctx.globalAlpha = 1; }
    if (Object.keys(c).length) R.defer.push(cx => R.iconRow(cx, p[0], p[1] - 70, Object.keys(c).map(k2 => ['rem_' + k2, c[k2]]), ok ? 1 : 0.6));
  }
  if (rk.tool === 'hose' || rk.tool === 'remove') { const b = M3.near(() => true, rk.tool === 'hose' ? 2.4 : 2.2); if (b) { const p = R.toScreen(v, b.x, b.y); ctx.strokeStyle = rk.tool === 'remove' ? '#ff5a5a' : '#9adf5a'; ctx.lineWidth = 3; diamond(ctx, p[0], p[1], v.hw, v.hh); ctx.stroke(); } }
  // what the nearest thing holds / needs (only near him: show, don't tell)
  M3D.infoNear(ctx, v, t);
  // remains that landed off screen lately: a pointer on the edge (where to go next)
  for (const it of u.items) {
    if (!(it.landT > 0)) continue;
    const p = R.toScreen(v, it.x, it.y);
    if (p[0] > left + 20 && p[0] < right - 20 && p[1] > 20 && p[1] < CFG.H - 20) continue;
    const cx = Math.max(left + 36, Math.min(right - 36, p[0])), cy = Math.max(120, Math.min(CFG.H - 40, p[1]));
    pbox(ctx, cx - 24, cy - 24, 48, 48, '#2b1d48'); dspr(ctx, itemSprite(it.k), cx, cy + 12, 3);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  main.save(); main.beginPath(); main.rect(X0, 0, RW, CFG.H); main.clip();
  main.imageSmoothingEnabled = false;
  main.drawImage(buf.c, X0, 0, bw * P, CFG.H);
  main.restore();
  R.flush(main, X0);
};

const M3D = {};
window.M3D = M3D;
// the key caps the Rootkeeper's prompts show (a pad's letters, or his keys)
M3D.keys = function () {
  const pad = Net.role === 'guest' ? !!IN.pad[0] : !!(G.ctl && G.ctl.pk >= 0 && IN.pad[G.ctl.pk]);
  if (pad) return { pick: 'A', throw: 'B', use: 'X' };
  return { pick: 'LMB', throw: 'RMB', use: Keys.label('kUse') };
};
M3D.infoNear = function (ctx, v, t) {
  const u = G.u, rk = u.rk, K = M3D.keys();
  for (const b of u.bld) {
    if (Math.hypot(b.x - rk.x, b.y - rk.y) > 3.2) continue;
    const p = R.toScreen(v, b.x, b.y);
    if (b.type === 'pylon') R.defer.push(c => R.iconRow(c, p[0], p[1] - 96, ELS.map(e => ['rem_' + e, u.bank[e]])));
    else if (b.type === 'burner') R.defer.push(c => { R.iconRow(c, p[0], p[1] - 116, ELS.filter(e => b.hop[e]).map(e => ['rem_' + e, b.hop[e]])); const a = ELS.reduce((s, e) => s + b.ash[e], 0); if (a) R.iconRow(c, p[0], p[1] - 146, [['ash_' + (ELS.find(e => b.ash[e]) || 'air'), a + '/' + CFG.mode3.burner.ashCap]]); });
    else if (b.type === 'rcraft' || b.type === 'tcraft') { const ks = M3.recipesOf(b), kk = ks[b.r % ks.length], c0 = (b.type === 'rcraft' ? CFG.mode3.nodes : CFG.mode3.traps)[kk].cost; R.defer.push(c => R.iconRow(c, p[0], p[1] - 100, [[(b.type === 'rcraft' ? 'n_' : 't_') + kk]].concat(Object.keys(c0).map(e => ['rem_' + e, c0[e]])), M3.canPay(c0) ? 1 : 0.6)); }
    else if (b.type === 'node' && !b.up) R.defer.push(c => txt(c, Math.floor(b.ch * 100) + '%', Math.round(p[0]), Math.round(p[1]) - 50, 12, '#cfe88a', 'center', 'd'));
    else if (b.type === 'mirror') R.defer.push(c => R.iconRow(c, p[0], p[1] - 100, [[b.el], ['ic_root']]));
  }
  // one prompt for the nearest thing he can do something with (the key cap + what it does, as icons)
  if (rk.tool) return;
  const it = M3.nearItem(), b = M3.near(q => q.type === 'node' && !q.up || q.type === 'mirror' || q.type === 'burner' || q.type === 'rcraft' || q.type === 'tcraft' || q.type === 'pylon');
  const x = Math.round(R.rect.x0 + 140), y = CFG.H - 150;
  if (it) R.iprompt(ctx, x, y, K.pick, [it.k]);
  else if (b && b.type === 'pylon' && u.blog.length) R.iprompt(ctx, x, y, K.pick, ['rem_' + u.blog[u.blog.length - 1]]);
  else if (b && (b.type === 'rcraft' || b.type === 'tcraft')) { const ks = M3.recipesOf(b); R.iprompt(ctx, x, y, K.pick, [(b.type === 'rcraft' ? 'n_' : 't_') + ks[b.r % ks.length]]); R.iprompt(ctx, x, y - 46, K.use, ['ic_rotate']); }
  if (b && (b.type === 'node' || b.type === 'mirror')) R.iprompt(ctx, x, y - (it ? 46 : 0), K.use, [b.type === 'mirror' ? b.el : 'ic_bolt'], null, null, true);
  else if (b && b.type === 'burner') R.iprompt(ctx, x, y - (it ? 46 : 0), K.use, [b.el, 'ic_rotate']);
  if (rk.hands.length) { const top = rk.hands[rk.hands.length - 1]; R.iprompt(ctx, x, y - 92, K.throw, [top, ITEMS[top].rem ? 'u_pylon' : 'ic_flag']); }
};

// ---------- what of the underworld stands in the WILDS (R.drawWorld calls this in 3P) ----------
// always: stumps / rock piles, manifested nodes (as the harvestables they are), traps, and the charge % of a recharging node near the Wizard;
// with his ghost view on: the hoses, burners, collectors, pylons, poles, crafters, mirror Harvesters and the Rootkeeper himself, see-through (no pulses: structure only)
M3D.wildsObjs = function (objs, v, w) {
  const u = G.u, gh = !!u.ghost.W, A = CFG.mode3.ghostA, t = w.t, cr = CFG.mode3.chargeR;
  for (const b of u.bld) {
    if (b.type === 'node') {
      if (b.up && !b.broken) objs.push({ d: b.x + b.y, t: 'harv', o: b });
      else if (!b.up) objs.push({ d: b.x + b.y, t: 'menu', fn: ctx => drawNodeBase(ctx, v, b, t, 1) });
      if (!b.up && Math.hypot(b.x - w.x, b.y - w.y) < cr) { const p = R.toScreen(v, b.x, b.y); R.defer.push(c => txt(c, Math.floor(b.ch * 100) + '%', Math.round(p[0]), Math.round(p[1]) - 50, 12, '#cfe88a', 'center', 'd')); }
    } else if (b.type === 'trap') objs.push({ d: b.x + b.y, t: 'menu', fn: ctx => drawTrap(ctx, v, b, t, 1, true) });
    else if (gh) objs.push({ d: b.x + b.y, t: 'menu', fn: ctx => R.drawUBld(ctx, v, b, t, A, true) });
  }
  if (gh) {
    objs.push({ d: -1e9, t: 'menu', fn: ctx => { for (const [a, b] of u.hoses) { const P1 = M3.byId(a), P2 = M3.byId(b); if (P1 && P2) hoseLine(ctx, v, P1, P2, A * 0.8, '#c8a0ff'); } } });
    objs.push({ d: u.rk.x + u.rk.y, t: 'menu', fn: ctx => { R.drawRoot(ctx, v, u.rk, A, t); const p = R.toScreen(v, u.rk.x, u.rk.y); R.defer.push(c => txt(c, 'ROOTKEEPER', Math.round(p[0]), Math.round(p[1]) + 26, 9, '#cfe88a', 'center', 'd')); } });
  }
};

// ---------- the corner picture, cycled between teammates (each machine chooses; a local view setting, like the picture's size) ----------
M3D.pipSel = 0;   // which of this seat's two teammates (0 / 1)
M3D.pipRoles = () => M3.ROLE.filter(r => r !== M3.myRole());
M3D.pipRole = () => M3D.pipRoles()[M3D.pipSel % 2];
M3D.cyclePip = () => { M3D.pipSel = (M3D.pipSel + 1) % 2; AU.sfx('blip'); FA.fb('pip-cycle'); const sc = R.bufs.pip3; if (sc) sc.drawn = false; };
M3D.drawPip = function (main, dt) {
  R.pipRect = null;
  const pct = AU.settings.pip;
  if (!(pct > 0) || !G || !G.u) return;
  let sc = R.bufs.pip3;
  if (!sc) { const c = document.createElement('canvas'); c.width = CFG.HALF; c.height = CFG.H; sc = R.bufs.pip3 = { c, x: c.getContext('2d') }; }
  const role = M3D.pipRole(), rect = { x0: 0, w: CFG.HALF, pip: true };
  sc.acc = (sc.acc || 0) + dt;
  if (!sc.drawn || sc.acc >= Math.min(0.1, Math.max(1 / 24, (sc.cost || 0) * 8 / 1000))) {
    const t0 = performance.now();
    sc.x.clearRect(0, 0, CFG.HALF, CFG.H);
    if (role === 'W') R.drawWorld(sc.x, sc.acc, rect); else if (role === 'B') R.drawFactory(sc.x, sc.acc, rect); else R.drawUnder(sc.x, sc.acc, rect);
    sc.drawn = true; sc.acc = 0;
    sc.cost = sc.cost ? sc.cost * 0.7 + (performance.now() - t0) * 0.3 : performance.now() - t0;
  }
  const v = role === 'W' ? R.wv : role === 'B' ? R.fv : R.uv;
  const CH = 500, sy = Math.max(0, Math.min(CFG.H - CH, Math.round(v.cy - CH / 2)));
  const W = Math.round(CFG.W * pct / 100), H = Math.round(W * CH / CFG.HALF), x = CFG.W - W - 16, y = CFG.H - H - 16;
  main.save();
  main.fillStyle = '#1a0f28'; main.fillRect(x - 6, y - 6, W + 12, H + 12);
  main.fillStyle = M3.col(M3.seatOf(role)); main.fillRect(x - 2, y - 2, W + 4, H + 4);
  main.imageSmoothingEnabled = true; main.imageSmoothingQuality = 'medium';
  main.drawImage(sc.c, 0, sy, CFG.HALF, CH, x, y, W, H);
  main.restore();
  const label = M3.name(M3.seatOf(role)), kk = Keys.label('pip3');
  main.fillStyle = 'rgba(26,15,40,0.8)'; main.fillRect(x, y, Math.min(W, 230), 22);
  drawText(main, label + '  [' + kk + '] NEXT', x + 8, y + 17, 10, '#ffe36b', 'left', 'd');
  if (role === 'W' && G.w) {
    const w = G.w, mh = WZ.maxHp();
    main.fillStyle = 'rgba(26,15,40,0.85)'; main.fillRect(x, y + H - 22, W, 22);
    main.fillStyle = '#3a2a4a'; main.fillRect(x + 6, y + H - 17, W - 12, 7);
    main.fillStyle = '#ff5a6a'; main.fillRect(x + 6, y + H - 17, Math.round((W - 12) * Math.max(0, w.hp) / mh), 7);
    if (w.dead) { main.fillStyle = 'rgba(40,0,10,0.55)'; main.fillRect(x, y, W, H - 22); drawText(main, 'DOWN', x + W / 2, y + H / 2, 16, '#ff9ab0', 'center', 'd'); }
  }
  R.pipRect = { x: x - 6, y: y - 6, w: W + 12, h: H + 12 };
};
})();
