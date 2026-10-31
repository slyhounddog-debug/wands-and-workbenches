'use strict';
// The Wizard's WAND and the shrines' activation (plain WZ extensions, loaded after altar.js). Everything is plain data in G (snapshot-safe, host-simulated online):
//   G.wand = { m: { air, water, fire, earth }   ticks counted toward each slot (CFG.wand.need)
//            , full: { air.. }                   a slot is READY: it holds exactly one attack
//            , ord: [elements]                   the order slots were filled in (the last one is the one armed again when the armed slot is spent)
//            , armed: el | null }                the slot Cast will fire
//   G.w.fireT / invisT / statT / statHits / ride  the verbs' own clocks (run state: they end with the expedition)
//   G.w.sg = { id, k, n, ... }                    a shrine ring mini-game in progress; G.w.lm[id].buff / cd = a shrine's timed buff / cooldown; G.w.shrines = { el: seconds left }
// The staff is charged ONLY by spells used (WZ.cast calls WZ.wandCharge): never by shrines. The four buttons (Main.controls / Net / the pad) are Cycle, Cast, Dodge and Mash.

WZ.wandFresh = () => ({ m: { air: 0, water: 0, fire: 0, earth: 0 }, full: { air: false, water: false, fire: false, earth: false }, ord: [], armed: null });
// whatever a save (or a missing field) hands in becomes a legal wand: unknown things are dropped, a full slot has a full meter, the armed slot is a full one
WZ.wandFix = function (o) {
  const W = WZ.wandFresh();
  if (o && typeof o === 'object') for (const el of ELEMS) {
    const need = CFG.wand.need[el];
    W.m[el] = Math.max(0, Math.min(need, Math.floor((o.m && +o.m[el]) || 0)));
    W.full[el] = !!(o.full && o.full[el]) || W.m[el] >= need;
    if (W.full[el]) W.m[el] = need;
  }
  const seen = {};
  for (const el of (o && Array.isArray(o.ord) ? o.ord : [])) if (ELEM[el] && W.full[el] && !seen[el]) { seen[el] = true; W.ord.push(el); }
  for (const el of ELEMS) if (W.full[el] && !seen[el]) W.ord.push(el);
  W.armed = o && W.full[o.armed] ? o.armed : W.ord.length ? W.ord[W.ord.length - 1] : null;
  return W;
};
// "something is ready", said ONCE and loudly: the element's particles are sucked into the staff and swirl in (R.drawWandFill) before it starts to blink, and a wand slot
// under his health bar grows and pulses (UI.updateWand). G.wand.fx = { el, kind: 'wand' | 'shrine', t } is plain data, advanced by WZ.wandTick.
WZ.readyCue = function (el, kind) {
  const W = G.wand;
  if (!W || G.menu || !ELEM[el]) return;
  W.fx = { el, kind, t: 0 };
  UI.cue(1); FA.fb(kind === 'wand' ? 'wand-ready' : 'shrine-ready');
};
WZ.wandFilled = () => ELEMS.filter(el => G.wand.full[el]);
WZ.invisible = () => !!(G.w && G.w.invisT > 0 && !G.w.dead);
WZ.wandCtx = el => ({ spell: 'wand_' + el, el: [el], hits: 0, kills: 0, weak: 0, wand: true });   // (a wand attack is not a spell: no Altar socket, no report at the Spell Portal)

// ---------- charging: every spell used on delivery ticks each of its elements once ----------
WZ.wandCharge = function (spell) {
  if (G.menu || !G.wand) return;
  const W = G.wand, w = G.w;
  for (const el of SPELL_EL[spell] || []) {
    if (!CFG.wand.need[el] || W.full[el]) continue;   // (a full slot holds exactly one attack: ticks for it are lost)
    if (++W.m[el] < CFG.wand.need[el]) continue;
    W.full[el] = true; W.m[el] = CFG.wand.need[el];
    W.ord.push(el); W.armed = el;   // a freshly filled slot becomes the armed one
    if (w && !w.dead) {
      WZ.ring(w.x, w.y, 1.5, ELEM[el].color, 0.5); WZ.epuff(w.x, w.y, el, 10); WZ.icon(w.x, w.y - 0.6, 'wand_' + el); AU.sfx('powerup');
      UI.toast('The wand is charged: ' + WZ.wandName(el), 'R', 'wand_' + el);
      WZ.readyCue(el, 'wand');
    }
  }
  UI.changed();
};
WZ.wandName = el => CFG.wandNames[el];
// Cycle: the next READY slot (air, water, fire, earth order), wrapping; nothing is ready = nothing happens
WZ.wandCycle = function () {
  const W = G.wand, w = G.w;
  if (!W || (w && w.dead)) return false;
  const list = WZ.wandFilled();
  if (!list.length) return false;
  const i = list.indexOf(W.armed);
  W.armed = list[(i + 1) % list.length];
  AU.sfx('tab'); if (w) WZ.ring(w.x, w.y, 0.9, ELEM[W.armed].color, 0.25);
  UI.changed();
  return true;
};
// Cast: fire the armed slot if it is full. Spends it (its meter back to 0) and arms the most recently filled slot that is left
WZ.wandCast = function () {
  const W = G.wand, w = G.w;
  if (!W || !w || w.dead || w.jump || w.blink || w.ride || w.statT > 0) return false;   // (riding or turned to stone: he is busy; nothing is spent)
  const el = W.armed;
  if (!el || !W.full[el]) return false;
  W.full[el] = false; W.m[el] = 0;
  W.ord = W.ord.filter(k => k !== el);
  W.armed = W.ord.length ? W.ord[W.ord.length - 1] : null;
  WZ.unseen();   // casting a wand attack is an action: it ends invisibility (the Puff then starts it again)
  const ctx = WZ.wandCtx(el);
  WZ.ctx = ctx;
  if (el === 'fire') WZ.wandFire(ctx); else if (el === 'air') WZ.wandAir(ctx); else if (el === 'water') WZ.wandWater(ctx); else WZ.wandEarth(ctx);
  WZ.ctx = null;
  G.stats.wands = (G.stats.wands || 0) + 1;
  (G.stats.wandUsed || (G.stats.wandUsed = {}))[el] = (G.stats.wandUsed[el] || 0) + 1;
  UI.changed();
  return true;
};
// his own action (mashing, casting) ends invisibility at once
WZ.unseen = function () {
  const w = G.w;
  if (!(w.invisT > 0)) return;
  w.invisT = 0;
  WZ.puff(w.x, w.y, '#e6f8ff', 8); AU.sfx('blip');
};

// ---------- allies feel the wand ----------
// every living ally within r tiles of (x, y): fn(ally)
WZ.eachAlly = function (x, y, r, fn) {
  for (const a of G.w.allies) if (!a.dead && a.fall <= 0 && Math.hypot(a.x - x, a.y - y) < r + a.rad) fn(a);
};
// a burning ally leaves a fire trail of its own: its segments go into one shared 'afire' Flame Trail zone (hurts hostiles only, laid where it walks, every F.gap tiles)
WZ.allyFireSeg = function (a) {
  const w = G.w, F = CFG.wand.fire;
  if (a.lx != null && Math.hypot(a.x - a.lx, a.y - a.ly) < F.gap) return;
  a.lx = a.x; a.ly = a.y;
  let z = w.zones.find(q => q.kind === 'ftrail' && q.afire);
  if (!z) { WZ.zone({ kind: 'ftrail', afire: true, x: a.x, y: a.y, r: F.r, t: F.life + 0.5, pts: [], col: '#ff7a30', ctx: WZ.wandCtx('fire') }); z = w.zones[w.zones.length - 1]; }
  z.t = F.life + 0.5; z.dur = z.t;
  z.pts.push({ x: a.x, y: a.y, a: 0, al: 1 });
};

// ---------- Fire: Flame Trail ----------
WZ.wandFire = function (ctx) {
  const w = G.w, F = CFG.wand.fire;
  w.fireT = F.t;
  // ONE trail zone owns every segment (pts), so overlapping segments never stack their damage; it lives until the last segment has burnt out
  WZ.zone({ kind: 'ftrail', x: w.x, y: w.y, r: F.r, t: F.t + F.life, pts: [{ x: w.x, y: w.y, a: 0 }], col: '#ff7a30', ctx });
  WZ.ring(w.x, w.y, 1.6, '#ff7a30', 0.4); WZ.epuff(w.x, w.y, 'fire', 12);
  AU.sfx('zap_fire');
};
// the trail zone (called from WZ.zoneSpecial with WZ.ctx = its own ctx): lay segments while he runs, age them, burn what stands in them
WZ.trailTick = function (z, dt) {
  const w = G.w, F = CFG.wand.fire, rate = F.total / F.life;
  if (z.t > F.life && !w.dead && !z.afire) {   // still laying (the first F.t seconds)
    const l = z.pts[z.pts.length - 1];
    if (Math.hypot(w.x - l.x, w.y - l.y) >= F.gap) z.pts.push({ x: w.x, y: w.y, a: 0 });
  }
  for (const p of z.pts) p.a += dt;
  z.pts = z.pts.filter(p => p.a < F.life);
  if (!z.pts.length) { z.t = 0; return true; }
  const hit = (x, y, rad) => { for (const p of z.pts) if (Math.hypot(p.x - x, p.y - y) < F.r + rad) return true; return false; };
  for (const a of w.allies) {   // the Wizard's own trail lights an ally that walks through it (no harm to it): a few seconds of fire trail of its own
    if (a.dead || a.fall > 0 || a.burnT > 0) continue;
    for (const p of z.pts) if (!p.al && Math.hypot(p.x - a.x, p.y - a.y) < F.r + a.rad) { a.burnT = CFG.wand.ally.burn; a.lx = null; WZ.puff(a.x, a.y, '#ff7a30', 6); AU.sfx('zap_fire'); break; }
  }
  for (const e of w.enemies) if (!e.dead && !(e.fall > 0) && hit(e.x, e.y, e.rad)) { WZ.hurtE(e, rate * dt, 0, 0, true); e.flash = 0.05; }
  for (const h of WZ.hitH()) if (!h.broken && hit(h.x, h.y, h.rad || 0.4)) WZ.hurtHc(h, rate * dt);
  if (Math.random() < dt * 14) { const p = z.pts[Math.floor(Math.random() * z.pts.length)]; w.fx_.push({ type: 'spark', x: p.x + rand(-0.5, 0.5), y: p.y + rand(-0.5, 0.5), vx: 0, vy: 0, z: 0.1, vz: rand(1, 2.5), g: -2, col: Math.random() < 0.3 ? '#ffe36b' : '#ff7a30', t: 0, dur: 0.5, el: 'fire' }); }
  return true;
};

// ---------- Air: Vanishing Puff ----------
WZ.wandAir = function (ctx) {
  const w = G.w, A = CFG.wand.air, x = w.x, y = w.y;
  WZ.ring(x, y, A.r, '#e6f8ff', 0.4);
  w.fx_.push({ type: 'swirl', x, y, r: A.r, t: 0, dur: 0.5, col: '#e6f8ff' });
  w.fx_.push({ type: 'puff', x, y, r: A.r, t: 0, dur: 0.9, col: '#e6f8ff' });
  WZ.mark(x, y, A.r);
  WZ.each(x, y, A.r, (t, d, isE) => { const m = d || 1; WZ.hit(t, isE, A.dmg, isE ? (t.x - x) / m * A.push : 0, isE ? (t.y - y) / m * A.push : 0); });   // (WZ.hurtE scales the shove by the foe's own knockback)
  WZ.bendRing(x, y, A.r);
  WZ.eachAlly(x, y, A.r, a => { a.invT = CFG.wand.ally.inv; WZ.puff(a.x, a.y, '#e6f8ff', 8); });   // allies in the burst vanish too
  w.invisT = A.t;
  WZ.epuff(x, y, 'air', 14);
  AU.sfx('zap_air');
};

// ---------- Water: Riding Wave ----------
WZ.wandWater = function (ctx) {
  const w = G.w, W = CFG.wand.water, st = WZ.stickAim(), a = st ? [st[0], st[1]] : WZ.aim();
  w.fx = a[0]; w.fy = a[1];
  w.ride = { dx: a[0], dy: a[1], t: 0, hit: [], ctx };
  w.vx = 0; w.vy = 0; w.roll = 0; w.target = null;   // (the ride eases in from a standstill: WZ.rideSet)
  WZ.ring(w.x, w.y, 1.5, '#4aa8ff', 0.35); WZ.epuff(w.x, w.y, 'water', 12);
  AU.sfx('zap_water');
};
WZ.rideEnd = function (why) {
  const w = G.w;
  if (!w.ride) return;
  w.ride = null; w.vx = 0; w.vy = 0;   // stops dead
  WZ.puff(w.x, w.y, '#bfe6ff', why === 'wall' ? 10 : 6);
  if (why === 'wall') { AU.sfx('thud'); w.shake = Math.max(w.shake, 0.18); }
};
// before he moves: the ride's velocity (a harvestable in the way stops it dead); after he moved (WZ.wandTick): the wave parts what it passes, a wall or a water edge ends it
WZ.rideSet = function (dt) {
  const w = G.w, R0 = w.ride, W = CFG.wand.water;
  // speed follows a half sine (slow, fastest in the middle, slow): the distance covered this step is the exact integral of it, so the whole ride is W.dist
  const a0 = Math.min(1, R0.t / W.t), a1 = Math.min(1, (R0.t + dt) / W.t), step = W.dist / 2 * (Math.cos(Math.PI * a0) - Math.cos(Math.PI * a1)), v = dt > 0 ? step / dt : 0;
  const nx = w.x + R0.dx * step, ny = w.y + R0.dy * step;
  for (const h of WZ.harv) if (!h.broken && Math.hypot(nx - h.x, ny - h.y) < 0.85) { WZ.rideEnd('wall'); return false; }
  w.vx = R0.dx * v; w.vy = R0.dy * v; w.fx = R0.dx; w.fy = R0.dy;
  R0.ex = nx; R0.ey = ny; R0.ox = w.x; R0.oy = w.y;
  return true;
};
WZ.rideTick = function (dt) {
  const w = G.w, R0 = w.ride, W = CFG.wand.water;
  if (!R0 || R0.ex === undefined) return;
  const want = Math.hypot(R0.ex - R0.ox, R0.ey - R0.oy), got = Math.hypot(w.x - R0.ox, w.y - R0.oy);
  R0.t += dt;
  // the wave: a V / U in front of him; it parts every foe it meets to the SIDES (no carrying) and hits each once
  const dx = R0.dx, dy = R0.dy, px = -dy, py = dx;
  WZ.ctx = R0.ctx;
  for (const e of w.enemies) {
    if (e.dead || e.fall > 0) continue;
    const ex = e.x - w.x, ey = e.y - w.y, along = ex * dx + ey * dy, lat = ex * px + ey * py;
    if (along < -0.6 || along > 1.6 || Math.abs(lat) > W.w / 2 + e.rad) continue;
    const side = lat >= 0 ? 1 : -1;
    e.kx += px * side * W.push * 3 * dt * (e.boss ? 0.1 : 1); e.ky += py * side * W.push * 3 * dt * (e.boss ? 0.1 : 1);   // a steady shove sideways while it is in the wave
    const id = WZ.eid(e);
    if (R0.hit.indexOf(id) < 0) { R0.hit.push(id); WZ.hurtE(e, W.dmg, px * side * W.push, py * side * W.push); }
  }
  for (const h of WZ.hitH()) {
    if (h.broken) continue;
    const ex = h.x - w.x, ey = h.y - w.y, along = ex * dx + ey * dy, lat = ex * px + ey * py;
    if (along < -0.6 || along > 1.6 || Math.abs(lat) > W.w / 2 + (h.rad || 0.4)) continue;
    const id = 'h' + h.x.toFixed(1) + h.y.toFixed(1);
    if (R0.hit.indexOf(id) < 0) { R0.hit.push(id); WZ.hurtH(h, W.dmg); }
  }
  WZ.eachAlly(w.x, w.y, 0, a => {   // riding past an ally heals it (once a ride)
    const ex = a.x - w.x, ey = a.y - w.y, along = ex * dx + ey * dy, lat = ex * px + ey * py, id = 'a' + WZ.eid(a);
    if (along < -0.6 || along > 1.6 || Math.abs(lat) > W.w / 2 + a.rad + CFG.wand.ally.healReach || R0.hit.indexOf(id) >= 0 || a.hp >= a.maxHp) return;
    R0.hit.push(id);
    const add = Math.min(a.maxHp - a.hp, a.maxHp * CFG.wand.ally.heal); a.hp += add; a.healT = 1.2;
    WZ.num(a.x, a.y, '+' + Math.round(add), '#7bff9a'); AU.sfx('el_water');
  });
  WZ.altarTouch(w.x + dx, w.y + dy, W.w / 2);   // (ignored: a wand attack is not a spell)
  WZ.ctx = null;
  if (Math.random() < dt * 40) w.fx_.push({ type: 'spark', x: w.x + dx * 0.8 + px * rand(-1, 1), y: w.y + dy * 0.8 + py * rand(-1, 1), vx: px * rand(-2, 2), vy: py * rand(-2, 2), z: 0.2, vz: rand(1, 3), g: 12, col: Math.random() < 0.4 ? '#ffffff' : '#4aa8ff', t: 0, dur: 0.4, el: 'water' });
  if (got < want * 0.98) WZ.rideEnd('wall');   // a wall, a water edge or any other thing he cannot cross: he stops where he is
  else if (R0.t >= W.t) WZ.rideEnd('done');
};

// ---------- Earth: Statue ----------
WZ.wandEarth = function (ctx) {
  const w = G.w, E = CFG.wand.earth;
  w.statT = E.t; w.statHits = 0; w.roll = 0;
  WZ.ring(w.x, w.y, 1.6, '#b58a4c', 0.4); WZ.puff(w.x, w.y, '#a98a5c', 14); WZ.epuff(w.x, w.y, 'earth', 10);
  AU.sfx('zap_earth'); w.shake = Math.max(w.shake, 0.2);
};
WZ.statueMul = () => { const E = CFG.wand.earth; return 1 + Math.min(E.cap, (G.w.statHits || 0) * E.perHit); };
WZ.statueBurst = function () {
  const w = G.w, E = CFG.wand.earth, k = WZ.statueMul(), x = w.x, y = w.y;
  WZ.ctx = WZ.wandCtx('earth');
  WZ.explode(x, y, E.r, E.dmg * k, '#b58a4c', null, E.push * k);
  WZ.ctx = null;
  WZ.eachAlly(x, y, E.r, a => { a.stoneT = CFG.wand.ally.stone; WZ.puff(a.x, a.y, '#a98a5c', 8); });   // allies caught in the burst turn to stone for a while
  w.fx_.push({ type: 'statue', x, y, t: 0, dur: 0.9, k });
  WZ.boom(x, y, E.r * 1.1, '#ffffff'); WZ.ring(x, y, E.r * 1.2, '#b58a4c', 0.5);
  for (let i = 0; i < 16; i++) {   // the stone flies apart
    const a = i / 16 * 6.283, s = rand(3, 7);
    w.fx_.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0.8, vz: rand(2, 6), g: 14, col: i % 3 ? '#8a8a96' : '#b58a4c', t: 0, dur: rand(0.5, 0.9), el: 'earth' });
  }
  w.shake = Math.max(w.shake, 0.3 + 0.3 * (k - 1)); AU.sfx('slam');
};

// the Statue rams: while the stone lasts every foe he touches takes damage and a shove that grow with his speed (each foe at most once per ramGap s; e.ramT is the sim time it may be hit again)
WZ.statueRam = function (dt) {
  const w = G.w, E = CFG.wand.earth, spd = Math.hypot(w.vx, w.vy);
  if (spd < E.ramMin) return;
  const ux = w.vx / spd, uy = w.vy / spd;
  WZ.ctx = WZ.wandCtx('earth');
  for (const e of w.enemies) {
    if (e.dead || e.fall > 0 || w.t < (e.ramT || 0)) continue;
    const dx = e.x - w.x, dy = e.y - w.y;
    if (Math.hypot(dx, dy) > e.rad + CFG.wizard.radius + E.ramReach) continue;
    if (dx * ux + dy * uy < -0.2) continue;   // only what is in front of (or beside) the boulder, not what he has already passed
    e.ramT = w.t + E.ramGap;
    const m = Math.hypot(dx, dy) || 1, push = E.ramPush * spd;
    WZ.hurtE(e, E.ram * spd, (dx / m * 0.5 + ux * 0.5) * push, (dy / m * 0.5 + uy * 0.5) * push);
    WZ.puff(e.x, e.y, '#a98a5c', 4); AU.sfx('thud'); w.shake = Math.max(w.shake, 0.12);
  }
  WZ.ctx = null;
};

// ---------- every frame (WZ.update) ----------
WZ.wandTick = function (dt) {
  const w = G.w;
  if (w.fireT > 0 && (w.fireT -= dt) < 1e-6) w.fireT = 0;   // (the epsilon: 60 steps of 0.05 s leave a hair of float dust)
  if (w.invisT > 0) { w.invisT -= dt; if (w.invisT < 1e-6) { w.invisT = 0; WZ.puff(w.x, w.y, '#e6f8ff', 6); } }
  if (w.statT > 0) {
    w.statT -= dt;
    WZ.statueRam(dt);
    if (Math.random() < dt * 10) w.fx_.push({ type: 'spark', x: w.x + rand(-0.3, 0.3), y: w.y + rand(-0.3, 0.3), vx: 0, vy: 0, z: rand(0.2, 1.2), vz: 0.5, g: 6, col: '#9a9aa6', t: 0, dur: 0.4 });
    if (w.statT < 1e-6) { w.statT = 0; WZ.statueBurst(); }
  }
  if (w.ride) WZ.rideTick(dt);
  const fx = G.wand && G.wand.fx;
  if (fx && (fx.t += dt) > Math.max(CFG.wandFill.dur, CFG.wandFill.pulse)) G.wand.fx = null;
};

// ---------- shrines: claimed once (the Builder's Cores), activated by a ring-timing mini-game, then a timed buff and a cooldown ----------
WZ.shrineReady = s => s.state === 'done' && !(s.buff > 0) && !(s.cd > 0);
// the shrine he could activate now: a claimed, ready one within shrineR
WZ.shrineNear = function () {
  const w = G.w;
  let best = null, bd = CFG.marks.shrineR;
  for (const m of WZ.marks) {
    if (m.type !== 'shrine' || !WZ.shrineReady(w.lm[m.id])) continue;
    const d = Math.hypot(w.x - m.x, w.y - m.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
};
// the timed buffs: element -> seconds left (the longest of that element's shrines)
WZ.shrineTick = function (dt, press) {
  const w = G.w, M = CFG.marks;
  w.shrines = {};
  for (const m of WZ.marks) {
    if (m.type !== 'shrine') continue;
    const s = w.lm[m.id];
    if (s.state !== 'done') continue;
    if (s.buff > 0) {
      s.buff -= dt;
      if (s.buff <= 0) { s.buff = 0; s.cd = M.cdT; UI.toast(ELEM_WORD[m.el] + ' Shrine buff ended: it recharges for ' + Math.round(M.cdT / 60) + ' minutes', 'R', 'cr_' + m.el); }
    } else if (s.cd > 0) {
      s.cd -= dt;
      if (s.cd <= 0) { s.cd = 0; s.flash = 0.5; WZ.ring(m.x, m.y, 3, ELEM[m.el].color, 0.6); AU.sfx('el_' + m.el); if (G.w.t - (s.rdyAt || -99) > 5) { s.rdyAt = G.w.t; UI.toast('A ' + ELEM_WORD[m.el] + ' Shrine is ready again: press Mash at it', 'R', 'cr_' + m.el); WZ.readyCue(m.el, 'shrine'); } }
    }
    if (s.buff > 0) w.shrines[m.el] = Math.max(w.shrines[m.el] || 0, s.buff);
  }
  // the mini-game: it runs while he stays within reach of its shrine
  if (w.sg) {
    const sg = w.sg, m = WZ.marks[sg.id], s = w.lm[sg.id];
    if (w.dead || Math.hypot(w.x - m.x, w.y - m.y) > M.shrineR + 0.5 || !WZ.shrineReady(s)) { w.sg = null; return; }   // walked off: nothing is consumed
    sg.k += dt;
    if (sg.flash > 0) sg.flash -= dt;
    const dur = M.ring[Math.min(sg.n, M.ring.length - 1)];
    // a press is judged where the ring was when it was made: a guest sees the ring a little late
    const k = sg.k - (Net.on ? M.netLag : 0), f = k / dur;
    if (press && sg.k >= 0) {
      if (f >= M.zone[0] && f <= M.zone[1]) {
        sg.n++; sg.flash = 0.35; sg.ok = sg.n;
        WZ.ring(m.x, m.y, 2.4, ELEM[m.el].color, 0.4); WZ.epuff(m.x, m.y, m.el, 8); AU.sfx('powerup');
        if (sg.n >= M.rings) { WZ.shrineActivate(m, s); return; }
        sg.k = -M.lead * 0.7;
      } else {
        sg.k = -M.lead; sg.miss = (sg.miss || 0) + 1; sg.failT = 0.4;
        AU.sfx('error'); WZ.puff(m.x, m.y, '#8a8a96', 5);
      }
    } else if (sg.k > dur * 1.04) { sg.k = -M.lead * 0.7; sg.failT = 0.3; AU.sfx('blip'); }   // the ring closed with no press: it starts again
    if (sg.failT > 0) sg.failT -= dt;
    return;
  }
  if (press) {
    const m = WZ.shrineNear();
    if (m) { w.sg = { id: m.id, k: -M.lead, n: 0, flash: 0, failT: 0, miss: 0 }; AU.sfx('tab'); return true; }
  }
};
WZ.shrineActivate = function (m, s) {
  const w = G.w, M = CFG.marks;
  s.buff = M.buffT; s.cd = 0; s.flash = 0.6; w.sg = null; w.shrines[m.el] = Math.max(w.shrines[m.el] || 0, s.buff);
  G.stats.shrineAct = (G.stats.shrineAct || 0) + 1;
  WZ.ring(m.x, m.y, 5, ELEM[m.el].color, 0.7); WZ.puff(m.x, m.y, ELEM[m.el].color, 20); WZ.epuff(m.x, m.y, m.el, 18);
  w.shake = Math.max(w.shake, 0.3);
  AU.sfx('chest'); AU.sfx('el_' + m.el);
  UI.toast('The ' + ELEM_WORD[m.el] + ' Shrine wakes: ' + ELEM_WORD[m.el] + ' Harnessers +' + Math.round(M.shrineBoost * 100) + '% for ' + M.buffT + ' seconds', 'R', 'cr_' + m.el);
  UI.toast('The ' + ELEM_WORD[m.el] + ' Shrine is awake: ' + ELEM_WORD[m.el] + ' Harnessers +' + Math.round(M.shrineBoost * 100) + '% for ' + M.buffT + ' seconds', 'L', m.el);
  UI.changed();
};
