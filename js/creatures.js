'use strict';
// The Wizard-side half of the factory's new outputs: crafted creatures (Eggs hatching beside him), mutations, XP gems,
// scheduled events and Strongholds. Plain WZ extensions, loaded after wizard.js; the hooks live in WZ.update / WZ.kill.
const pickOf = a => a[Math.floor(Math.random() * a.length)];
const BIOME_FOES = ['imp', 'lurker', 'wisp', 'golem'];
const BIOME_EL = { imp: 'fire', lurker: 'water', wisp: 'air', golem: 'earth' };   // the element each biome foe is made of
const WILD_FOES = ['slime', 'shroom', 'sprite'];
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- XP gems: integers only, dropped by chance; resting gems merge into a Big Gem ----------
WZ.gemMul = () => Math.pow(1 + CFG.upgrade.gems, lvl('gems'));   // Gem Wisdom multiplies every drop chance
WZ.gemCount = function (sure, chance) {
  let n = sure;
  if (chance > 0 && Math.random() < Math.min(CFG.gemCap, chance * WZ.gemMul())) n++;
  return n;
};
WZ.dropGems = function (x, y, n) { for (let i = 0; i < n; i++) WZ.drop('xp', x, y, 1); };
// a finished goal's XP flies out of the Wizard as gems (a few chunky ones, never more than CFG.goalGems.max): he collects them like any other
WZ.goalGems = function (xp) {
  const w = G.w, k = Math.min(CFG.goalGems.max, xp), each = Math.floor(xp / k), extra = xp - each * k;
  for (let i = 0; i < k; i++) WZ.drop('xp', w.x, w.y, each + (i < extra ? 1 : 0));
  AU.sfx('chest');
};
WZ.vacuum = () => CFG.world.vacuum;   // how far gems and drops pull toward him
WZ.gemTier = v => { const T = CFG.bigGem.tiers; let k = 0; for (let i = 0; i < T.length; i++) if (v >= T[i]) k = i; return k; };
// merge resting gems near each other (called a few times a second); the survivor carries the total
WZ.mergeGems = function () {
  const dr = G.w.drops, r = CFG.bigGem.r;
  for (let i = 0; i < dr.length; i++) {
    const a = dr[i];
    if (a.kind !== 'xp' || a.t < 0.7 || a.mag) continue;
    for (let j = dr.length - 1; j > i; j--) {
      const b = dr[j];
      if (b.kind !== 'xp' || b.t < 0.7 || b.mag || Math.hypot(a.x - b.x, a.y - b.y) > r) continue;
      a.val += b.val; a.pulse = 0.25; dr.splice(j, 1);
    }
  }
};
// what a death pays in gems: elites always 3, otherwise the creature's own [guaranteed, chance]
WZ.killGems = function (e) {
  if (e.mini) return 0;
  if (e.elite) return CFG.elite.gems;
  const g = (CFG.enemies[e.type] || {}).gem || [0, 0];
  return WZ.gemCount(g[0], g[1] * (e.wild ? CFG.world.wildGem : 1));
};

// ---------- hostile effects shared by the creatures ----------
// A hostile strike hurts every ALLY inside, and the Wizard if he is inside (the roll swallows it). An ally's strike (ally = true) hurts hostiles only: never the Wizard.
WZ.strike = function (x, y, r, dmg, ally) {
  const w = G.w;
  if (ally) { for (const e of w.enemies) if (!e.dead && !(e.fall > 0) && Math.hypot(e.x - x, e.y - y) < r + e.rad) WZ.hurtE(e, dmg, 0, 0); return; }
  for (const a of w.allies) if (!a.dead && !(a.fall > 0) && Math.hypot(a.x - x, a.y - y) < r + a.rad) WZ.hurtAlly(a, dmg, 0, 0);
  if (w.dead || Math.hypot(w.x - x, w.y - y) >= r) return;
  if (w.roll > 0) WZ.dodge(); else WZ.damage(dmg);
};
WZ.telegraph = function (x, y, r, delay, col, fn, quiet) {   // a flashing ring, then the burst (quiet: an ally's, no danger cue)
  G.w.fx_.push({ type: 'warn', x, y, r, t: 0, dur: delay, col });
  if (!quiet) AU.sfx('warn');
  WZ.later(delay, () => { WZ.boom(x, y, r, col); AU.sfx(quiet ? 'hit' : 'slam'); if (fn) fn(); });
};
// a creature's shot: hostile orbs fly in w.eproj and hurt the Wizard or an ally, an ally's fly in w.aproj and hurt hostiles
WZ.shoot = function (e, p) { p.ally = !!e.ally; if (!e.ally) p.src = WZ.src; (e.ally ? G.w.aproj : G.w.eproj).push(p); };

// ---------- mutations ----------
WZ.mutate = function (e, kind) {
  const w = G.w, M = CFG.mutations[kind || (kind = pickOf(Object.keys(CFG.mutations)))];
  e.mut = kind;
  if (kind === 'swift') e.spd *= M.spd;
  else if (kind === 'armored') e.dr = (e.dr || 1) * M.dr;
  else if (kind === 'regen') e.regen = M.rate;
  // announced on both halves: an icon over the creature, and one at the Spell Portal (a toast the first time each kind shows)
  WZ.icon(e.x, e.y - 0.5, M.ic);
  if (e.weak && w.t >= (w.mutThreatT || 0)) { w.mutThreatT = w.t + 6; FA.threat([e.weak], e.type, 'MUTANT SPAWNED'); }   // the Builder reads what it is weak to over the Spell Portal
  if (w.t >= (w.mutPopT || 0)) { w.mutPopT = w.t + 1.5; const p = FA.portal('spell'); FA.ipop(p.x + 0.5, p.y + 1.8, [[M.ic], [e.crafted ? 'egg_' + e.type : 'ic_skull']]); }
  if (!w.seenMut) w.seenMut = {};
  if (!w.seenMut[kind]) {
    w.seenMut[kind] = true;
    UI.toast(M.name + ' ' + (CFG.enemies[e.type].name || 'foe') + ' appeared', 'L', M.ic); UI.toast(M.name + ' ' + (CFG.enemies[e.type].name || 'foe') + ' appeared', 'R', M.ic);
  }
};
WZ.spawnMini = function (src) {
  const M = CFG.mutations.splitter;
  for (let i = 0; i < M.n; i++) {
    const a = Math.random() * 6.283, x = src.x + Math.cos(a) * 0.5, y = src.y + Math.sin(a) * 0.5;
    if (WZ.blocked(x, y, 0.3)) continue;
    const m = WZ.makeEnemy(src.type, x, y, false);
    m.hp = m.maxHp = src.maxHp * M.hp; m.dmg = src.dmg * 0.7; m.mini = true; m.crafted = false; m.sz = (src.sz || 1) * 0.65; m.rad *= 0.7;
    m.ai = src.ai; m.var = src.var; m.weak = src.weak; m.resist = src.resist; m.evt = src.evt; m.mark = src.mark;
  }
};
// everything that happens when something dies (called from WZ.kill)
WZ.onDeath = function (e) {
  const w = G.w, was = WZ.cur;
  WZ.cur = e;   // (a death blast / splash it leaves behind is still ITS: WZ.src)
  try { WZ.onDeath2(e, w); } finally { WZ.cur = was; }
};
WZ.dropMul = e => e.elite ? CFG.drops.eliteMul : e.mut ? CFG.drops.mutMul : 1;
WZ.onDeath2 = function (e, w) {
  if (e.mut === 'volatile') { const M = CFG.mutations.volatile, x = e.x, y = e.y; WZ.telegraph(x, y, M.r, M.delay, '#ff7a30', () => WZ.strike(x, y, M.r, M.dmg)); }
  if (e.mut === 'splitter') WZ.spawnMini(e);
  const def = CFG.creatures[e.type];
  if (def && def.ai === 'slime' && !e.mini) { const S = def.splash; WZ.zone({ x: e.x, y: e.y, r: S.r, t: S.t, slow: S.slow, hostile: true, col: '#4aa8ff', src: WZ.srcOf(e) }); }
  if (def && def.ai === 'lava' && !e.mini) { const x = e.x, y = e.y, B = def.blast; WZ.telegraph(x, y, B.r, B.delay, '#ff5a2a', () => WZ.strike(x, y, B.r, B.dmg)); }
  if (e.crafted) {
    G.stats.craftedKills = (G.stats.craftedKills || 0) + 1;
    // what it was hatched from comes back some of the time: a basic its element packet, a double / triple the combo spell that seeded it (it flies home like a packet)
  }
  const mul = WZ.dropMul(e);   // mutants roll twice as often, elites three times
  if (e.crafted) {
    const cd = CFG.creatures[e.type], tier = cd.order.length;
    if (Math.random() < (tier === 1 ? CFG.crafted.recycle : CFG.crafted.recycleSpell[tier]) * mul) WZ.drop(tier === 1 ? cd.order[0] : Object.keys(cd.cost)[0], e.x, e.y, 1);
  } else if (!e.mini && !e.warden && !e.boss) {   // a wild foe carries a packet of its own element now and then
    const els = WZ.elemsOf(e);
    if (els.length && Math.random() < CFG.drops.packet * mul) WZ.drop(els[Math.floor(Math.random() * els.length)], e.x, e.y, 1);
  }
  if (e.evt) w.evKills = (w.evKills || 0) + 1;
  if (!e.mini) {   // a common resource now and then (Wood or Stone), and Iron more rarely: any foe, wild or hatched
    const D = CFG.drops;
    if (Math.random() < D.common * mul) WZ.drop(Math.random() < 0.5 ? 'wood' : 'stone', e.x, e.y, 1);
    if (Math.random() < D.iron * mul) WZ.drop('iron', e.x, e.y, 1);
  }
  WZ.lootDrops(e);   // Cores and Ward Keys (augments.js)
};
// the Phoenix's one rebirth: true when the death was cancelled
WZ.rebirth = function (e) {
  if (e.ai !== 'phoenix' || e.reborn) return false;
  const def = CFG.creatures[e.type];
  e.reborn = true; e.hp = e.maxHp * def.reborn; e.dv = 0; e.dvCd = 2; e.flash = 0.4; e.slow = 0;
  WZ.ring(e.x, e.y, 2.4, '#ff9a3a', 0.5); WZ.puff(e.x, e.y, '#ffd23a', 18); WZ.epuff(e.x, e.y, 'fire', 10);
  const was = WZ.cur; WZ.cur = e; WZ.strike(e.x, e.y, 2.2, e.ally ? 8 * CFG.ally.dmgMul : 8, e.ally); WZ.cur = was;
  AU.sfx('el_fire'); WZ.num(e.x, e.y, 'REBORN', '#ffd23a');
  return true;
};

// ---------- hatching: Eggs arrive through the Spell Portal ----------
WZ.craftedAlive = function () {
  let n = 0;
  for (const e of G.w.enemies) if (e.crafted && !e.dead) n++;
  return n;
};
// somewhere on dry land that is inside the camera (the 800x900 view), CFG.crafted.spawnMin..spawnMax tiles from the Wizard
WZ.spawnSpot = function () {
  const w = G.w, C = CFG.crafted, cam = (typeof R !== 'undefined' && R.wcam) || w;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.283, d = C.spawnMin + Math.random() * (C.spawnMax - C.spawnMin);
    const x = clampN(w.x + Math.cos(a) * d, 1, CFG.WW - 1), y = clampN(w.y + Math.sin(a) * d, 1, CFG.WH - 1);
    if (WZ.blocked(x, y, 0.4)) continue;
    const dx = x - cam.x, dy = y - cam.y, sx = (dx - dy) * CFG.WT.TW / 2, sy = (dx + dy) * CFG.WT.TH / 2;
    if (Math.abs(sx) > 340 || sy < -110 || sy > 380) continue;   // room above it for the portal it drops out of
    return [x, y];
  }
  return WZ.dryNear(w.x, w.y, 30, [C.spawnMin, C.spawnMax]);
};
// a creature with its own rolls: stats +-jitter, size, palette variant, elite / mutation
WZ.makeCreature = function (id, x, y, o) {
  o = o || {};
  const met = G.stats.met || (G.stats.met = {}); met[id] = (met[id] || 0) + 1;   // the Collection Book greys out creatures you have never met
  const C = CFG.crafted, def = CFG.creatures[id], e = WZ.makeEnemy(id, x, y, false), j = () => 1 + (Math.random() * 2 - 1) * C.jitter;
  e.hp = e.maxHp = e.maxHp * j(); e.spd *= j(); e.dmg *= j();
  e.ai = def.ai; e.var = Math.floor(Math.random() * C.variants); e.sz = 1 + (Math.random() * 2 - 1) * C.size; e.fly = !!def.fly;
  if (def.dr) e.dr = Array.isArray(def.dr) ? def.dr[0] : def.dr;
  if (def.kb !== undefined) e.kb = def.kb;
  if (def.regen) e.regen = def.regen;
  if (def.cracks) e.crack = 0;
  if (o.plain) return e;
  if (Math.random() < C.eliteChance) { WZ.eliteUp(e, C.eliteHp, C.eliteDmg); e.sz *= 1.25; }
  if (Math.random() < C.mutChance) WZ.mutate(e);
  return e;
};
WZ.spawnCreature = function (id, spot) {
  const w = G.w, C = CFG.crafted;
  spot = spot || WZ.spawnSpot();
  if (!spot) return null;
  const e = WZ.makeCreature(id, spot[0], spot[1]);
  e.crafted = true; e.fallT0 = e.fall = C.fall + 0.25; e.dazeT = C.daze;   // 0.25s for the portal to open, then the drop
  w.fx_.push({ type: 'hatch', x: e.x, y: e.y, col: CFG.creatures[id].col, t: 0, dur: C.fall + 0.25 + 0.35 });
  AU.sfx('portalDrop');
  G.stats.crafted = (G.stats.crafted || 0) + 1;
  return e;
};
// an Egg reached the Spell Portal: hatch it now, or hold it until the crafted-creature cap has room
WZ.hatch = function (kind) {
  const n = CFG.creatures[ITEMS[kind].creature].n || 1;   // all n creatures wait their turn: eggTick drops them CFG.crafted.dropGap apart
  if (ITEMS[kind].ally) { G.w.aq.push({ k: kind, left: n }); return; }   // a friendly egg waits in the wilds' ally queue (run state, like the creatures themselves)
  for (let i = 0; i < n; i++) G.fac.eggQ.push(kind);
};
WZ.eggTick = function (dt) {
  const w = G.w, q = G.fac.eggQ;
  if (!w.dead && w.aq.length && w.t >= (w.aeggT || 0) && WZ.allyAlive() < CFG.ally.cap) {   // allies: the first queued egg hatches what fits, one at a time
    const eg = w.aq[0];
    if (WZ.spawnAlly(ITEMS[eg.k].creature)) { w.aeggT = w.t + CFG.crafted.dropGap; if (--eg.left <= 0) w.aq.shift(); }
  }
  if (!q.length || w.dead || w.t < (w.eggT || 0) || WZ.craftedAlive() >= CFG.crafted.cap) return;
  if (WZ.spawnCreature(ITEMS[q[0]].creature)) { q.shift(); w.eggT = w.t + CFG.crafted.dropGap; }
};
// ---------- allies: the friendly versions (grown from Cores at the Spawner). They live in G.w.allies, NOT w.enemies, so the Wizard's spells, events, keeps and kill goals never see them ----------
WZ.allyAlive = function () { let n = 0; for (const a of G.w.allies) if (!a.dead) n++; return n; };
// 2-4 tiles from the Wizard on dry land: help arrives at his side
WZ.allySpot = function () {
  const w = G.w, A = CFG.ally;
  for (let i = 0; i < 30; i++) {
    const an = Math.random() * 6.283, d = A.spawnMin + Math.random() * (A.spawnMax - A.spawnMin);
    const x = clampN(w.x + Math.cos(an) * d, 1, CFG.WW - 1), y = clampN(w.y + Math.sin(an) * d, 1, CFG.WH - 1);
    if (!WZ.blocked(x, y, 0.4)) return [x, y];
  }
  return WZ.dryNear(w.x, w.y, 12, [A.spawnMin, A.spawnMax]);
};
WZ.spawnAlly = function (id) {
  const w = G.w, A = CFG.ally, C = CFG.crafted, spot = WZ.allySpot();
  if (!spot) return null;
  const e = WZ.makeCreature(id, spot[0], spot[1], { plain: true });   // stats +-15%, size, palette: but never elite, never mutated
  w.enemies.splice(w.enemies.lastIndexOf(e), 1);   // makeEnemy put it among the hostiles; it is not one
  const met = G.stats.met; if (met && met[id] > 0) met[id]--;   // an ally does not count as a creature you have met
  e.ally = true; e.crafted = false;
  e.hp = e.maxHp = e.maxHp * A.hpMul; e.dmg *= A.dmgMul;
  e.fallT0 = e.fall = C.fall + 0.25; e.dazeT = C.daze;
  w.allies.push(e);
  w.fx_.push({ type: 'hatch', x: e.x, y: e.y, col: '#46e0c8', t: 0, dur: C.fall + 0.25 + 0.35 });
  AU.sfx('portalDrop');
  return e;
};
// what a hostile goes for: the nearest living ally within aggro tiles of it, else the Wizard. { x, y, a } (a = the ally, or null for the Wizard); never stored
WZ.foeTarget = function (e) {
  const w = G.w;
  let best = null, bd = CFG.ally.aggro;
  for (const a of w.allies) {
    if (a.dead || a.fall > 0 || a.invT > 0) continue;   // (an ally under the Vanishing Puff cannot be targeted)
    const d = Math.hypot(a.x - e.x, a.y - e.y);
    if (d < bd) { bd = d; best = a; }
  }
  if (best) return { x: best.x, y: best.y, a: best };
  if (WZ.invisible()) return { x: e.x, y: e.y, a: null, mill: true };   // Vanishing Puff: nothing hostile targets him (an ally comes first, otherwise it mills about)
  return { x: w.x, y: w.y, a: null };
};
// damage to an ally, from any hostile attack: exactly what the Wizard would take, minus his armor and rolls
WZ.hurtAlly = function (a, d, kx, ky) {
  if (a.dead || a.fall > 0) return;
  if (a.stoneT > 0) d *= CFG.wand.ally.stoneTake;   // turned to stone by the Statue's burst: half damage
  a.hp -= d; a.flash = 0.12;
  if (kx || ky) { const kb = a.kb !== undefined ? a.kb : 1; a.kx += kx * kb; a.ky += ky * kb; }
  WZ.num(a.x, a.y, Math.round(d), '#ff8aa8');
  if (a.hp <= 0) WZ.allyDie(a);
};
// an ally is spent: its own death effects (a slime's splash, a lava golem's blast) work for its side, and NOTHING drops: no gems, packets, Cores, recycle roll, kills or event progress
WZ.allyDie = function (a) {
  if (a.dead || WZ.rebirth(a)) return;
  a.dead = true;
  const def = CFG.creatures[a.type], A = CFG.ally;
  if (def && def.ai === 'slime') { const S = def.splash; WZ.zone({ x: a.x, y: a.y, r: S.r, t: S.t, slow: S.slow, ally: true, col: '#4aa8ff' }); }
  if (def && def.ai === 'lava') { const x = a.x, y = a.y, B = def.blast; WZ.telegraph(x, y, B.r, B.delay, '#ff5a2a', () => WZ.strike(x, y, B.r, B.dmg * A.dmgMul, true), true); }
  AU.sfx('hit', a.x, a.y);
  G.w.fx_.push({ type: 'boom', x: a.x, y: a.y, r: 0.9, t: 0, dur: 0.3, col: '#46e0c8' });
  WZ.puff(a.x, a.y, def ? def.col : '#46e0c8', 9);
};
// every ally, every frame: fight the nearest hostile within engage tiles of the Wizard (their own attacks, half damage), otherwise drift back to him and stand near
WZ.allyTick = function (dt) {
  const w = G.w, A = CFG.ally, al = w.allies, cfg = CFG.world;
  if (!al.length) return;
  for (let i = 0; i < al.length; i++) {
    const a = al[i];
    if (a.dead) continue;
    if (a.flash > 0) a.flash -= dt;
    if (a.cd > 0) a.cd -= dt;
    if (a.slowT > 0) { a.slowT -= dt; if (a.slowT <= 0) a.slow = 0; }
    if (a.regen && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * a.regen * dt);
    if (a.land > 0) a.land -= dt;
    for (const k of ['invT', 'healT', 'stoneT']) if (a[k] > 0) { a[k] -= dt; if (a[k] < 1e-6) a[k] = 0; }   // the wand's buffs (see CFG.wand.ally)
    if (a.burnT > 0) { a.burnT -= dt; if (a.burnT < 1e-6) a.burnT = 0; else WZ.allyFireSeg(a); }
    if (a.fall > 0) { a.fall -= dt; if (a.fall <= 0) { a.fall = 0; a.land = 0.22; WZ.puff(a.x, a.y, '#d8c8a8', 8); AU.sfx('thud'); } continue; }   // dropping in from the Egg's portal
    if (a.dazeT > 0) { a.dazeT -= dt; continue; }
    const dw = Math.hypot(w.x - a.x, w.y - a.y) || 1;
    if (dw > A.teleport) { const sp = WZ.allySpot(); if (sp) { a.x = sp[0]; a.y = sp[1]; WZ.puff(a.x, a.y, '#46e0c8', 8); } continue; }   // left far behind: it rejoins him
    let foe = null, bd = 1e9;
    if (dw < A.leash) for (const e of w.enemies) {
      if (e.dead || e.fall > 0 || Math.hypot(e.x - w.x, e.y - w.y) > A.engage) continue;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      if (d < bd) { bd = d; foe = e; }
    }
    const tx = foe ? foe.x : w.x, ty = foe ? foe.y : w.y, ex = tx - a.x, ey = ty - a.y, d = Math.hypot(ex, ey) || 1;
    if (a.swim === undefined) a.swim = !a.fly && WZ.elemsOf(a).indexOf('water') >= 0;
    const s = a.spd * (1 - a.slow) * (a.stoneT > 0 ? CFG.wand.ally.stoneSpd : 1) * (!a.fly && !a.swim && WZ.tile(a.x, a.y) === T_BOG ? cfg.slowTerrain : 1);
    let ux = ex / d, uy = ey / d, mx = 0, my = 0;
    if (a.detour > 0) { a.detour -= dt; const px = -uy * a.side, py = ux * a.side; ux = px; uy = py; }   // last-resort sidestep
    if (foe) {
      mx = ux * s; my = uy * s;
      if (a.ai) { const r = WZ.aiTick(a, dt, d, ux, uy, s, { x: foe.x, y: foe.y, e: foe }); if (r) { mx = r[0]; my = r[1]; } }
    } else if (dw > A.follow) { const k = Math.min(1.7, 0.7 + (dw - A.follow) * 0.15); mx = ux * s * k; my = uy * s * k; }   // back to his side, faster the further it is
    // keep the line apart from the other allies
    for (let j = i + 1; j < al.length; j++) {
      const o = al[j]; if (o.dead) continue;
      const ox = a.x - o.x, oy = a.y - o.y, want = a.rad + o.rad + cfg.sepPad;
      if (Math.abs(ox) > want || Math.abs(oy) > want) continue;
      const od = Math.hypot(ox, oy) || 0.01;
      if (od >= want) continue;
      const push = (want - od) * cfg.sepForce;
      mx += ox / od * push; my += oy / od * push;
      WZ.slide(o, o.x - ox / od * push * dt, o.y - oy / od * push * dt, 0.3);
    }
    if (a.fly) { a.x = Math.max(0.5, Math.min(CFG.WW - 0.5, a.x + (mx + a.kx) * dt)); a.y = Math.max(0.5, Math.min(CFG.WH - 0.5, a.y + (my + a.ky) * dt)); }
    else if (WZ.moveOn(a, a.x + (mx + a.kx) * dt, a.y + (my + a.ky) * dt, 0.3) && !(a.detour > 0)) { a.detour = 0.5 + Math.random() * 0.6; a.side = a.side || (Math.random() < 0.5 ? 1 : -1); a.kx = 0; a.ky = 0; }
    const decay = Math.exp(-6 * dt); a.kx *= decay; a.ky *= decay;
    a.face = (ex - ey) >= 0 ? 1 : -1;
    if (foe && d < a.rad + foe.rad + 0.45 && a.cd <= 0) {   // touch: the hostile takes its half-strength hit
      a.cd = cfg.touchCd * rand(0.85, 1.3);
      WZ.hurtE(foe, (a.diving && a.diveDmg) || a.dmg, ux * 3, uy * 3);
      if (!foe.dead) { a.kx -= ux * 5; a.ky -= uy * 5; }
    }
  }
  w.allies = al.filter(a => !a.dead);
};

// ---------- creature behaviour ----------
// returns [mx, my] to replace the usual chase, or null. (ux, uy) points at the Wizard, d is the distance, s the current speed
WZ.aiTick = function (e, dt, d, ux, uy, s, TG) {
  const w = G.w, def = CFG.creatures[e.type] || {}, px = -uy, py = ux, ally = !!e.ally, dm = v => (ally ? v * CFG.ally.dmgMul : v);   // an ally's damage is half
  TG = TG || { x: w.x, y: w.y, a: null };   // where it is going: the ally it hunts, or the Wizard (for an ally: the foe it fights)
  e.age = (e.age || 0) + dt;
  e.tele = false;
  switch (e.ai) {
    case 'wisp': {   // erratic drifting with short phase-dashes
      const D = def.dash;
      e.dashCd = (e.dashCd === undefined ? rand(0.4, D.every) : e.dashCd) - dt;
      if (e.dashT > 0) { e.dashT -= dt; return [e.dx * s * D.mul, e.dy * s * D.mul]; }
      if (e.dashCd <= 0 && d > 1.4) {
        e.dashCd = D.every * rand(0.7, 1.3); e.dashT = D.time;
        const a = Math.atan2(uy, ux) + rand(-0.5, 0.5); e.dx = Math.cos(a); e.dy = Math.sin(a);
        WZ.epuff(e.x, e.y, 'air', 4);
      }
      const k = Math.sin(e.age * 2.4 + e.bob) * 0.9, mx = ux * 0.7 + px * k, my = uy * 0.7 + py * k, m = Math.hypot(mx, my) || 1;
      return [mx / m * s * 0.85, my / m * s * 0.85];
    }
    case 'imp': {   // kites at range, spitting ember bolts
      const S = def.shot;
      e.shotCd = (e.shotCd === undefined ? rand(0.6, S.every) : e.shotCd) - dt;
      if (e.shotCd <= 0 && d < S.far + 2 && d > 1) {
        e.shotCd = S.every * rand(0.85, 1.2);
        WZ.shoot(e, { x: e.x, y: e.y, vx: ux * S.speed, vy: uy * S.speed, life: 2.4, dmg: dm(S.dmg), col: '#ff7a30', size: 5 });
        AU.sfx('volley', e.x, e.y);
      }
      const want = d < S.near ? -1 : d > S.far ? 1 : 0, side = e.side || (e.side = Math.random() < 0.5 ? 1 : -1);
      const mx = ux * want + px * side * 0.5, my = uy * want + py * side * 0.5, m = Math.hypot(mx, my) || 1;
      return [mx / m * s, my / m * s];
    }
    case 'storm': case 'serpent': case 'phoenix': {
      if (e.ai !== 'phoenix') WZ.zapTick(e, dt, def.zap, TG);
      if (e.ai === 'storm') {   // hovers about four tiles off, drifting slowly overhead
        const want = d > 4.5 ? 1 : d < 3 ? -1 : 0, k = Math.sin(e.age * 0.8 + e.bob) * 0.6, mx = ux * want + px * k, my = uy * want + py * k, m = Math.hypot(mx, my) || 1;
        return [mx / m * s, my / m * s];
      }
      const V = def.dive;
      e.dvCd = (e.dvCd === undefined ? rand(1, V.every) : e.dvCd) - dt;
      e.diving = false;
      if (e.dv === 1) {   // wind-up: hangs in the air flashing, then locks onto where he stands
        e.dvT -= dt; e.tele = true;
        if (e.dvT <= 0) { e.dv = 2; e.dvT = V.time; const m = Math.hypot(TG.x - e.x, TG.y - e.y) || 1; e.dx = (TG.x - e.x) / m; e.dy = (TG.y - e.y) / m; AU.sfx('volley'); }
        return [0, 0];
      }
      if (e.dv === 2) {
        e.dvT -= dt; e.diving = true; e.diveDmg = dm(V.dmg);
        if (e.dvT <= 0) { e.dv = 0; e.dvCd = V.every * rand(0.8, 1.2); if (V.burst) WZ.steamBurst(e, V.burst); }
        return [e.dx * s * V.mul, e.dy * s * V.mul];
      }
      if (e.dvCd <= 0 && d < 10 && d > 2.5) { e.dv = 1; e.dvT = V.wind; if (!ally) AU.sfx('warn'); }
      const want = d > 5 ? 1 : d < 3 ? -0.6 : 0, side = e.side || (e.side = Math.random() < 0.5 ? 1 : -1);
      const mx = ux * want + px * side * 0.8, my = uy * want + py * side * 0.8, m = Math.hypot(mx, my) || 1;
      return [mx / m * s, my / m * s];
    }
    case 'lava': {   // leaves short-lived magma behind it
      const T = def.trail;
      e.trCd = (e.trCd === undefined ? 0.3 : e.trCd) - dt;
      if (e.trCd <= 0) { e.trCd = T.every; WZ.zone({ x: e.x, y: e.y, r: T.r, t: T.t, dps: dm(T.dps), hostile: !ally, ally, col: '#ff5a2a' }); }
      return null;
    }
    case 'shambler': {   // mud-snare zones across the Wizard's path; heals while standing in bog or at the water's edge
      const S = def.snare;
      e.snCd = (e.snCd === undefined ? rand(1, S.every) : e.snCd) - dt;
      if (e.snCd <= 0 && d < 11) { e.snCd = S.every; WZ.zone({ x: e.x + (TG.x - e.x) * 0.6, y: e.y + (TG.y - e.y) * 0.6, r: S.r, t: S.t, slow: S.slow, hostile: !ally, ally, tag: 'snare', col: '#6e4a2a' }); }
      const wet = WZ.tile(e.x, e.y) === T_BOG || WZ.wet(e.x + 1, e.y) || WZ.wet(e.x - 1, e.y) || WZ.wet(e.x, e.y + 1) || WZ.wet(e.x, e.y - 1);
      if (wet && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.regen * dt); if (Math.random() < dt * 3) WZ.puff(e.x, e.y, '#6aff8a', 1); }
      return null;
    }
    case 'dragon': {   // flame-breath cone after a telegraph, wing-gust knockback when close
      const B = def.breath, Gu = def.gust;
      e.brCd = (e.brCd === undefined ? rand(2, B.every) : e.brCd) - dt;
      e.guCd = (e.guCd === undefined ? rand(3, Gu.every) : e.guCd) - dt;
      if (e.brT > 0) {
        e.brT -= dt; e.tele = true;
        if (e.brT <= 0) {
          const base = Math.atan2(e.bdy, e.bdx);
          for (let i = 0; i < B.n; i++) { const a = base + (i / (B.n - 1) - 0.5) * 2 * B.half; WZ.shoot(e, { x: e.x, y: e.y, vx: Math.cos(a) * B.speed, vy: Math.sin(a) * B.speed, life: B.range / B.speed, dmg: dm(B.dmg), col: '#ff9a2b', size: 6 }); }
          AU.sfx('zap_fire');
        }
        return [0, 0];
      }
      if (e.brCd <= 0 && d < B.range) {
        e.brCd = B.every * rand(0.9, 1.1); e.brT = B.delay; e.bdx = ux; e.bdy = uy;
        for (let i = 1; i <= 3; i++) w.fx_.push({ type: 'warn', x: e.x + ux * i * 2, y: e.y + uy * i * 2, r: 0.9 + i * 0.35, t: 0, dur: B.delay, col: '#ff7a30' });
        if (!ally) AU.sfx('warn');
      }
      if (e.guCd <= 0 && d < Gu.r) {
        e.guCd = Gu.every; WZ.ring(e.x, e.y, Gu.r, '#e6f8ff', 0.4); AU.sfx('slam', e.x, e.y);
        if (TG.a) WZ.hurtAlly(TG.a, Gu.dmg, ux * Gu.push, uy * Gu.push);   // a hostile dragon's gust on the ally it hunts
        else if (ally) { if (TG.e) WZ.hurtE(TG.e, dm(Gu.dmg), ux * Gu.push, uy * Gu.push); }   // an allied dragon's on its foe
        else if (!w.dead && w.roll <= 0) { w.vx += ux * Gu.push; w.vy += uy * Gu.push; WZ.damage(Gu.dmg); } else if (w.roll > 0) WZ.dodge();
      }
      return null;
    }
    case 'titan': {   // armor cracks at HP thresholds, each venting a telegraphed steam burst
      const f = e.hp / e.maxHp, V = def.vent;
      while (e.crack < def.cracks.length && f <= def.cracks[e.crack]) {
        e.crack++; e.dr = def.dr[e.crack]; e.flash = 0.3;
        const x = e.x, y = e.y;
        WZ.telegraph(x, y, V.r, V.delay, '#f4f4f8', () => WZ.strike(x, y, V.r, dm(V.dmg), ally), ally);
        WZ.puff(e.x, e.y, '#c8a07a', 12);
      }
      return null;
    }
    case 'warden': case 'brood': {   // a slam where he stands (roll out of it); the Warden also throws a ring of orbs
      const S = e.slam;
      e.slamT -= dt;
      if (e.slamT <= 0 && d < 11) {
        e.slamT = S.every; const x = TG.x, y = TG.y;
        WZ.telegraph(x, y, S.r, 1.0, '#ff4a8a', () => { w.shake = Math.max(w.shake, 0.3); WZ.strike(x, y, S.r, S.dmg); });
      }
      if (e.vol) {
        e.vol.t -= dt;
        if (e.vol.t <= 0 && d < 14) {
          e.vol.t = e.vol.every;
          const col = e.weakCol || '#ff4a8a';
          for (let i = 0; i < e.vol.n; i++) { const a = i / e.vol.n * 6.283 + Math.random() * 0.3; w.eproj.push({ x: e.x, y: e.y, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, life: 2.4, dmg: e.vol.dmg, col, size: 7, src: WZ.src }); }
          AU.sfx('volley', e.x, e.y);
        }
      }
      return null;
    }
  }
  return null;
};
WZ.zapTick = function (e, dt, Z, TG) {   // chain zaps: telegraphed strike points around its target (the Wizard / the ally it hunts / an ally's foe), then a bolt strings them together
  const w = G.w, ally = !!e.ally;
  TG = TG || { x: w.x, y: w.y };
  e.zapCd = (e.zapCd === undefined ? rand(1.5, Z.every) : e.zapCd) - dt;
  if (e.zapCd > 0 || Math.hypot(TG.x - e.x, TG.y - e.y) > 13) return;
  e.zapCd = Z.every * rand(0.85, 1.15);
  const pts = [];
  for (let i = 0; i < Z.n; i++) pts.push(i ? [TG.x + rand(-3.4, 3.4), TG.y + rand(-3.4, 3.4)] : [TG.x, TG.y]);
  for (const p of pts) w.fx_.push({ type: 'warn', x: p[0], y: p[1], r: Z.r, t: 0, dur: Z.delay, col: '#fff27a' });
  if (!ally) AU.sfx('warn');
  const ox = e.x, oy = e.y;
  WZ.later(Z.delay, () => {
    G.w.fx_.push({ type: 'bolt', pts: [[ox, oy]].concat(pts), t: 0, dur: 0.35, col: '#fff27a' });
    AU.sfx('zap_combo');
    for (const p of pts) WZ.strike(p[0], p[1], Z.r, ally ? Z.dmg * CFG.ally.dmgMul : Z.dmg, ally);
  });
};
WZ.steamBurst = function (e, B) {
  const w = G.w;
  w.fx_.push({ type: 'boom', x: e.x, y: e.y, r: B.r, t: 0, dur: 0.35, col: '#f4f4f8' }); AU.sfx('hit', e.x, e.y);
  if (e.ally) { for (const o of w.enemies) if (!o.dead && !(o.fall > 0) && Math.hypot(o.x - e.x, o.y - e.y) < B.r + o.rad) { WZ.hurtE(o, B.dmg * CFG.ally.dmgMul, 0, 0); WZ.slowE(o, B.slow, B.slowT); } return; }
  for (const a of w.allies) if (!a.dead && !(a.fall > 0) && Math.hypot(a.x - e.x, a.y - e.y) < B.r + a.rad) { WZ.hurtAlly(a, B.dmg, 0, 0); a.slow = Math.max(a.slow, B.slow); a.slowT = Math.max(a.slowT, B.slowT); }
  if (w.dead || Math.hypot(w.x - e.x, w.y - e.y) >= B.r) return;
  if (w.roll > 0) { WZ.dodge(); return; }
  WZ.damage(B.dmg); w.slowT = B.slowT; w.slowAmt = B.slow; w.slowSrc = Object.assign({ st: 'slow' }, WZ.src || WZ.HAZ.steam);
};

// ---------- scheduled events ----------
// The scheduler runs inside WZ.update, so it only advances on play time: not while paused, in a skill tree, dead or on the
// victory screen. G.ev survives re-entering the wilds; only its rotation index (n) is saved.
const evGap = () => rand(CFG.events.gapMin, CFG.events.gapMax);
WZ.evFresh = function (n) { return { n: n || 0, left: evGap(), plan: null, active: null, clear: 0, warned: 0 }; };
WZ.evName = p => CFG.events[p.id].name;
WZ.evPlan = function (n) {
  const E = CFG.events, id = E.rotation[n % E.rotation.length], cycle = Math.floor(n / E.rotation.length) + 1, p = { id, cycle, n, types: [], weaks: [], el: [] };
  const two = cycle > 1;   // mixed compositions from Cycle 2
  if (id === 'migration') { const t = BIOME_FOES.slice().sort(() => Math.random() - 0.5); p.types = t.slice(0, two ? 2 : 1); }
  else if (id === 'stampede') { const b = BIOME_FOES.slice().sort(() => Math.random() - 0.5); p.types = WILD_FOES.concat(b.slice(0, two ? 2 : 1)); }
  else if (id === 'hunt') {
    const n2 = E.hunt.elites[0] + Math.floor(Math.random() * (E.hunt.elites[1] - E.hunt.elites[0] + 1)) + (cycle > 2 ? 1 : 0);
    for (let i = 0; i < n2; i++) { p.types.push(pickOf(BIOME_FOES)); p.weaks.push(pickOf(ELEMS)); }
  } else if (id === 'storm') { p.surge = pickOf(ELEMS); p.types = BIOME_FOES.filter(t => BIOME_EL[t] === p.surge); }
  else if (id === 'brood') { p.types = [pickOf(BIOME_FOES)]; p.weaks = [pickOf(ELEMS)]; }
  // what to stockpile: the weaknesses of what is coming
  const seen = {};
  const add = k => { if (k && !seen[k]) { seen[k] = 1; p.el.push(k); } };
  p.weaks.forEach(add); p.types.forEach(t => add((CFG.enemies[t] || {}).weak));
  if (p.surge) add(p.surge);
  return p;
};
WZ.evTitle = p => 'Cycle ' + p.cycle + ': ' + WZ.evName(p);
WZ.evWarn = function (i) {
  const ev = G.ev, p = ev.plan, E = CFG.events, secs = E.warn[i], when = secs >= 60 ? Math.round(secs / 60) + ' min' : secs + ' s';
  const msg = WZ.evTitle(p) + ' in ' + when + (p.el.length ? ': stock ' + p.el.map(k => ELEM_WORD[k]).join(' + ') : '');
  const ic = p.el[0] || 'ic_skull';
  UI.toast(msg, 'L', ic); UI.toast(msg, 'R', ic);
  if (i === E.warn.length - 1) AU.sfx('evwarn'); else AU.sfx('alert');
};
WZ.evTick = function (dt) {
  const ev = G.ev, w = G.w, E = CFG.events;
  if (!ev.plan) ev.plan = WZ.evPlan(ev.n);
  if (ev.active) { WZ.evRun(dt); return; }
  if (w.boss) ev.clear = E.defer; else if (ev.clear > 0) ev.clear -= dt;   // 60 s of quiet after a blocker before anything may start
  if (ev.left > 0) {
    ev.left -= dt;
    for (let i = 0; i < E.warn.length; i++) if (ev.warned <= i && ev.left <= E.warn[i]) { ev.warned = i + 1; WZ.evWarn(i); }
    if (ev.left > 0) return;
    ev.left = 0;
  }
  if (ev.clear > 0) return;   // due, but deferred
  WZ.evStart();
};
WZ.evStart = function () {
  const ev = G.ev, w = G.w, p = ev.plan, msg = 'EVENT: ' + WZ.evTitle(p) + '!';
  ev.active = { id: p.id, plan: p, t: 0, wave: 0, cd: 0, spawned: 0, evKey: ev.n };
  ev.warned = 3;
  w.evKills = 0;
  if (p.id === 'bloom') w.bloom = CFG.events.bloom.mut + CFG.events.mutAdd * (p.cycle - 1);
  if (p.id === 'storm') w.surge = p.surge;
  UI.toast(msg, 'L', p.el[0] || 'ic_skull'); UI.toast(msg, 'R', p.el[0] || 'ic_skull');
  FA.threat(p.el, p.types[0] || 'ic_skull', WZ.evName(p).toUpperCase() + ' STARTED');   // what is coming and what it is weak to, over the Builder's Spell Portal
  AU.sfx('roar'); w.shake = Math.max(w.shake, 0.5);
  FA.pressure(1, '#ffd23a');   // the factory feels it too
  w.fx_.push({ type: 'title', x: w.x, y: w.y, text: WZ.evName(p).toUpperCase() + '!', col: '#ffd23a', t: 0, dur: 1.8 });
};
WZ.evFoes = a => { let n = 0; for (const e of G.w.enemies) if (e.evt && !e.dead && e.evtKey === a.evKey) n++; return n; };
// event spawns share the global cap; they get the cycle's hp / damage scaling and the cycle's elite / mutation odds
WZ.evMake = function (type, spot, o) {
  const w = G.w, a = G.ev.active;
  if (!spot || w.enemies.length >= CFG.world.cap) return null;
  o = o || {};
  const c = a.plan.cycle, S = 1 + CFG.events.scale * (c - 1), E = CFG.events;
  const e = WZ.makeEnemy(type, spot[0], spot[1], !!o.elite);
  e.hp = e.maxHp = e.hp * S; e.dmg *= S; e.evt = true; e.evtKey = a.evKey;
  if (o.spd) e.spd *= o.spd;
  if (!e.elite && Math.random() < E.eliteAdd * (c - 1)) WZ.eliteUp(e);
  const mc = (o.mut || 0) + E.mutAdd * (c - 1);
  if (mc > 0 && Math.random() < mc) WZ.mutate(e);
  return e;
};
WZ.evRing = function (a, b) { const w = G.w; return WZ.dryNear(w.x, w.y, 14, [a, b]); };
WZ.evRun = function (dt) {
  const ev = G.ev, a = ev.active, E = CFG.events, w = G.w, P = a.plan, c = P.cycle, size = 1 + E.waveAdd * (c - 1);
  a.t += dt;
  a.cd -= dt;
  switch (a.id) {
    case 'migration': {   // a stream of one (later two) biome foes, a line of them at a time
      const M = E.migration;
      if (a.wave < M.waves && a.cd <= 0) {
        a.cd = M.gap;
        const type = P.types[a.wave % P.types.length], n = Math.round(M.n * size), ang = a.ang === undefined ? (a.ang = Math.random() * 6.283) : a.ang;
        const cx = w.x + Math.cos(ang) * 21, cy = w.y + Math.sin(ang) * 21;
        for (let i = 0; i < n; i++) {   // a line across the stream's direction
          const o = (i - (n - 1) / 2) * 1.3, x = clampN(cx - Math.sin(ang) * o, 1, CFG.WW - 1), y = clampN(cy + Math.cos(ang) * o, 1, CFG.WH - 1);
          if (!WZ.blocked(x, y, 0.4)) WZ.evMake(type, [x, y], { spd: M.speed });
        }
        a.wave++;
      }
      if (a.wave >= M.waves && a.cd <= -1 && !WZ.evFoes(a)) WZ.evClear();
      break;
    }
    case 'stampede': {   // fast mixed packs, in bursts, never closer than the safe distance
      const S = E.stampede;
      if (a.wave < S.bursts && a.cd <= 0) {
        a.cd = S.gap;
        const ang = Math.random() * 6.283, n = Math.round(S.n * size);
        for (let i = 0; i < n; i++) {
          const sp = WZ.dryNear(w.x + Math.cos(ang) * 17, w.y + Math.sin(ang) * 17, 8, [0, 4]);
          if (sp && Math.hypot(sp[0] - w.x, sp[1] - w.y) >= S.safe) WZ.evMake(pickOf(P.types), sp, { spd: S.speed });
        }
        a.wave++;
      }
      if (a.wave >= S.bursts && a.cd <= -1 && !WZ.evFoes(a)) WZ.evClear();
      break;
    }
    case 'hunt': {   // 2-3 elites with escorts walk in from the edge of the map
      if (!a.started) {
        a.started = true;
        P.types.forEach((t, i) => {
          const sp = WZ.evRing(20, 27);
          const el = WZ.evMake(t, sp, { elite: true });
          if (!el) return;
          el.weak = P.weaks[i]; el.hunt = true;
          for (let k = 0; k < Math.round(E.hunt.escorts * size); k++) { const s2 = WZ.dryNear(sp ? sp[0] : w.x, sp ? sp[1] : w.y, 8, [1, 3]); WZ.evMake(pickOf(WILD_FOES.concat(BIOME_FOES)), s2); }
        });
        const first = w.enemies.find(e => e.hunt);
        if (first) w.fx_.push({ type: 'beam', x: first.x, y: first.y, col: '#ffd23a', t: 0, dur: 1.2 });
      }
      if (a.t > 2 && !w.enemies.some(e => e.hunt && !e.dead)) WZ.evClear();
      break;
    }
    case 'bloom': {   // wild spawns carry a much higher mutation chance (WZ.spawn reads w.bloom) for the duration
      if (a.t >= E.bloom.dur) { w.bloom = 0; WZ.evClear(); }
      break;
    }
    case 'storm': {   // spawn bursts of the surging element's foes, and its harnessers run boosted
      const S = E.storm;
      if (a.t < S.dur && a.cd <= 0) {
        a.cd = S.gap;
        const type = pickOf(P.types), n = Math.round(S.n * size);
        for (let i = 0; i < n; i++) WZ.evMake(type, WZ.evRing(15, 24), { spd: S.surge });
        WZ.ring(w.x, w.y, 6, ELEM[P.surge].color, 0.6); AU.sfx('alert');
      }
      if (a.t >= S.dur && !WZ.evFoes(a)) { w.surge = null; WZ.evClear(); }
      break;
    }
    case 'brood': {   // one oversized mutated elite that slams, with a few of its brood
      const B = E.brood;
      if (!a.started) {
        a.started = true;
        const sp = WZ.evRing(17, 23), e = WZ.evMake(P.types[0], sp, { elite: true });
        if (e) {
          e.brood = true; e.sz = B.size / 1.4; e.rad = 0.9; e.hp = e.maxHp = e.maxHp * B.hp / CFG.elite.hp; e.dmg *= B.dmg; e.weak = P.weaks[0];
          e.ai = 'brood'; e.slam = { every: B.slamEvery, r: B.slamR, dmg: B.slamDmg * (1 + E.scale * (c - 1)) }; e.slamT = 3;
          WZ.mutate(e);
          w.fx_.push({ type: 'beam', x: e.x, y: e.y, col: '#ff4a8a', t: 0, dur: 1.4 });
        }
      }
      if (a.t > 4 && a.t - (a.mT || 0) > 11 && w.enemies.some(e => e.brood && !e.dead)) { a.mT = a.t; for (let i = 0; i < B.minions; i++) WZ.evMake(pickOf(WILD_FOES), WZ.evRing(8, 13)); }
      if (a.t > 2 && !w.enemies.some(e => e.brood && !e.dead)) WZ.evClear();
      break;
    }
  }
  if (a.t > 420) WZ.evClear();   // nothing runs forever
};
WZ.evNext = function () {
  const ev = G.ev, w = G.w;
  ev.n++; ev.plan = null; ev.active = null; ev.left = evGap(); ev.warned = 0;
  if (w) { w.surge = null; w.bloom = 0; }
};
WZ.evClear = function () {
  const ev = G.ev, a = ev.active, w = G.w, R0 = CFG.events.reward, c = a.plan.cycle;
  const gems = R0.gems + R0.perCycle * (c - 1);
  WZ.dropGems(w.x, w.y, gems);
  if (c >= 2) WZ.drop('shard', w.x, w.y, 1);
  G.stats.events = (G.stats.events || 0) + 1;
  WZ.ring(w.x, w.y, 5, '#ffd23a', 0.6); AU.sfx('chest');
  const msg = WZ.evName(a.plan) + ' survived!';
  UI.toast(msg, 'L', 'ic_trophy'); UI.toast(msg, 'R', 'ic_trophy');
  w.fx_.push({ type: 'title', x: w.x, y: w.y, text: 'SURVIVED!', col: '#7bff9a', t: 0, dur: 1.6 });
  UI.changed();
  WZ.evNext();
};
WZ.evFail = function () {   // the Wizard fell mid-event: no reward, the clock moves on
  G.stats.eventsFailed = (G.stats.eventsFailed || 0) + 1;
  WZ.evNext();
};
// seconds until the next event and what it is (the card and the debug overlay read this)
WZ.evInfo = function () {
  const ev = G.ev;
  if (!ev) return null;
  if (!ev.plan) ev.plan = WZ.evPlan(ev.n);
  return { plan: ev.plan, left: ev.left, active: ev.active, deferred: ev.left <= 0 && !ev.active && ev.clear > 0, clear: ev.clear };
};

// ---------- the Stronghold: scouted from afar, defended by creatures and THE Warden, claimed once the Warden falls (the Summoning Altar needs that) ----------
WZ.WARDEN_WEAK = el => WEAK_TO[WEAK_TO[el]];   // two steps round the cycle: never what the guards fear
WZ.keepGuards = el => CFG.strong.guards[el];
WZ.updKeep = function (m, s, d, dt) {
  const w = G.w, K = CFG.strong;
  if (s.flash > 0) s.flash -= dt;
  if (d < K.reveal && !s.seen) {
    s.seen = true; G.flags.scouted = true;
    const gate = AUGS[AUG_ORDER.find(id => AUGS[id].gate === m.el)];
    const msg = 'The Stronghold scouted: the way in needs the ' + gate.name + ' and the Warden Key. The Warden is weak to ' + ELEM_WORD[WZ.WARDEN_WEAK(m.el)];
    UI.toast(msg, 'L', WZ.WARDEN_WEAK(m.el)); UI.toast(msg, 'R', 'ic_keep');
    AU.sfx('alert'); UI.changed();
  }
  if (s.state === 'idle') {
    // standing inside the wake radius runs a countdown (warnT); the guards only spawn when it reaches warnT, and leaving (or dying) resets it.
    // The arena only wakes for a Wizard who is allowed in: without the Warden Key the door (WZ.doorTick) keeps him out, so no countdown starts
    if (d >= K.wake || w.dead || !G.aug.door) { s.warnT = 0; return; }
    if (!(s.warnT > 0)) {
      s.warnT = 0;
      if (!(w.t - (s.toastAt || -99) < 8)) { s.toastAt = w.t; UI.toast('Stronghold area! The guards wake in ' + K.warnT + 's: leave to reset it', 'R', 'ic_warn'); UI.toast('The Wizard is in a Stronghold area', 'L', 'ic_warn'); }
      AU.sfx('warn');
    }
    const was = Math.ceil(K.warnT - s.warnT);
    s.warnT += dt;
    if (s.warnT < K.warnT) { if (Math.ceil(K.warnT - s.warnT) !== was) AU.sfx('blip'); return; }
    s.state = 'active'; s.warnT = 0;
    const g = K.guards[m.el];
    for (const id in g) for (let i = 0; i < g[id]; i++) {
      const sp = WZ.dryNear(m.x, m.y, 14, [2, 5]) || [m.x + 2, m.y];
      const e = WZ.makeCreature(id, sp[0], sp[1], { plain: true });
      e.mark = m.id; e.keepGuard = true;
    }
    const sp = WZ.dryNear(m.x, m.y, 14, [1.5, 3]) || [m.x + 2, m.y], W = K.warden;
    const e = WZ.makeEnemy('warden', sp[0], sp[1], false);
    e.elite = true; e.guard = true; e.warden = true; e.mark = m.id; e.ai = 'warden'; e.sz = 1.05; e.weak = WZ.WARDEN_WEAK(m.el); e.resist = null; e.weakCol = ELEM[m.el].color;
    e.slam = { every: W.slamEvery, r: W.slamR, dmg: W.slamDmg }; e.slamT = 3; e.vol = { t: 5, every: W.volleyEvery, n: W.volleyN, dmg: W.volleyDmg };
    WZ.ring(m.x, m.y, 6, ELEM[m.el].color, 0.7); w.shake = 0.5; AU.sfx('roar');
    FA.pressure(1.2, ELEM[m.el].color);
    FA.threat([e.weak], e.type, 'THE WARDEN WAKES'); UI.toast('The Warden stirs: weak to ' + ELEM_WORD[e.weak] + '!', 'L', e.weak); UI.toast('The Warden stirs: weak to ' + ELEM_WORD[e.weak] + '!', 'R', e.weak);
  } else if (s.state === 'active' && !w.enemies.some(e => e.mark === m.id && !e.dead)) WZ.claimKeep(m);
};
WZ.claimKeep = function (m) {
  const w = G.w, K = CFG.strong, s = w.lm[m.id], first = !G.flags.warden;
  s.state = 'done';
  G.flags.warden = true;   // the Warden is dead for good: the Summoning Altar takes spells from now on
  for (let i = 0; i < K.shards; i++) WZ.drop('shard', m.x, m.y, 1);
  WZ.dropGems(m.x, m.y, K.gems);
  for (const el of ELEMS) WZ.dropCores(el, CFG.cores.warden, m.x, m.y);   // a chunk of Cores of every element
  G.stats.keeps = (G.stats.keeps || 0) + 1; G.stats.landmarks = (G.stats.landmarks || 0) + 1; w.run.marks++;
  WZ.ring(m.x, m.y, 5, ELEM[m.el].color, 0.7); WZ.puff(m.x, m.y, '#ffd23a', 24);
  AU.sfx('chest');
  const msg = first ? 'The Warden is dead! The Summoning Altar will answer spells now' : 'The Stronghold is cleared again';
  UI.toast(msg, 'L', 'ic_crown'); UI.toast(msg, 'R', 'ic_crown');
  if (!G.flags.glow) WZ.glowUp(m);   // the first Warden to fall (per save): the Wizard glows for good
  UI.changed();
};
