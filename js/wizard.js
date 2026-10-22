'use strict';
// Wizard-side logic: terrain, landmarks, harvestables, enemies (biome foes, elites, the Chimera), spells (cast when the
// factory delivers), drops, roll-dodge, and the flow field monsters use to walk around water.
const WZ = {};
// Terrain classes: normal speed (most), slow (T_BOG), impassable (T_POND). Paths over water act as bridges.
const T_GRASS = 0, T_DIRT = 1, T_SAND = 2, T_FLOWER = 3, T_DARK = 4, T_POND = 5, T_PATH = 6, T_BOG = 7;
const SPAWN = { x: 100.5, y: 100.5 };
const BASICS = ['gust', 'fireball', 'spray', 'boulder'];
const ELEMS = ['air', 'water', 'fire', 'earth'];

function rngMaker(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
function fbm(x, y, s) { return vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.1; }

// ---------- world generation (deterministic; same wilderness each run) ----------
WZ.terrain = null;   // Uint8: type*8 + shade
WZ.bucket = null;    // per-tile arrays of decor / harvestables / landmarks
WZ.palette = [];
WZ.marks = [];       // landmarks: { id, type: 'camp'|'shrine'|'crypt', x, y, el? }
WZ.forage = [];      // dirt mounds, stick piles and berry bushes: { kind, x, y, prog, broken, respawn }
WZ.generate = function () {
  const WW = CFG.WW, WH = CFG.WH;
  // a small flat palette per terrain (8-bit look): 8 shade slots, but only 3 distinct steps
  const base = [[102, 52, 58], [32, 38, 52], [46, 55, 72], [108, 55, 62], [118, 40, 42], [205, 65, 56], [34, 35, 60], [70, 32, 34]];
  WZ.palette = [];
  for (let t = 0; t < 8; t++) for (let s = 0; s < 8; s++) {
    const b = base[t], step = s < 5 ? 0 : s < 7 ? 1 : -1;
    WZ.palette.push('hsl(' + b[0] + ',' + b[1] + '%,' + (b[2] + step * 3) + '%)');
  }
  const ter = new Uint8Array(WW * WH);
  const pathX = y => 100 + 20 * Math.sin((y - 100) * 0.04) + 7 * Math.sin((y - 100) * 0.11);
  const pathY = x => 100 + 18 * Math.sin((x - 100) * 0.05 + 1) + 6 * Math.sin((x - 100) * 0.13);
  WZ.pathDist = (x, y) => Math.min(Math.abs(x - pathX(y)), Math.abs(y - pathY(x)));
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    let t = T_GRASS;
    const n1 = fbm(x * 0.045, y * 0.045, 1), n2 = fbm(x * 0.06, y * 0.06, 2), n3 = fbm(x * 0.05, y * 0.05, 3), n4 = fbm(x * 0.07, y * 0.07, 4);
    const n5 = fbm(x * 0.055, y * 0.055, 5);
    if (n1 > 0.7) t = T_POND;
    else if (n1 > 0.655) t = T_SAND;
    else if (n5 > 0.655) t = T_BOG;
    else if (n4 > 0.68) t = T_DIRT;
    else if (n2 > 0.62) t = T_FLOWER;
    else if (n3 > 0.63) t = T_DARK;
    if (Math.abs(x - pathX(y)) < 1.5 || Math.abs(y - pathY(x)) < 1.3) t = T_PATH;
    const dd = Math.hypot(x - SPAWN.x, y - SPAWN.y);
    if (dd < 7 && t !== T_PATH) t = T_GRASS;
    ter[y * WW + x] = t * 8 + Math.floor(hash2(x, y, 9) * 8);
  }
  WZ.terrain = ter;
  WZ.bucket = new Array(WW * WH);
  const r = rngMaker(20261020);
  const add = (o) => {
    const i = Math.floor(o.y) * WW + Math.floor(o.x);
    (WZ.bucket[i] || (WZ.bucket[i] = [])).push(o);
  };
  const tyAt = (x, y) => (ter[Math.floor(y) * WW + Math.floor(x)] >> 3);
  // landmarks first, so decor and harvestables keep clear of them
  const M = CFG.marks;
  WZ.marks = [];
  const placeMarks = (type, n, minD) => {
    for (let tries = 0, c = 0; c < n && tries < 5000; tries++) {
      const x = Math.floor(6 + r() * (WW - 12)) + 0.5, y = Math.floor(6 + r() * (WH - 12)) + 0.5;
      if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < minD || WZ.marks.some(m => Math.hypot(m.x - x, m.y - y) < M.spacing)) continue;
      let dry = true;
      for (let dy = -2; dy <= 2 && dry; dy++) for (let dx = -2; dx <= 2; dx++) if (tyAt(x + dx, y + dy) === T_POND) { dry = false; break; }
      if (!dry) continue;
      const m = { id: WZ.marks.length, type, x, y };
      if (type === 'shrine') m.el = ELEMS[c % 4];
      WZ.marks.push(m); add({ x, y, lm: m }); c++;
    }
  };
  placeMarks('camp', M.camps, 16); placeMarks('shrine', M.shrines, 22); placeMarks('crypt', M.crypts, 40);
  const rk = rngMaker(77123), K = CFG.strong;
  ELEMS.forEach((el, i) => {   // one per quadrant, minDist..minDist+22 tiles from the spawn, never beside water
    for (let tries = 0; tries < 600; tries++) {
      const a = (i + 0.5) * Math.PI / 2 + (rk() - 0.5) * 0.9, d = K.minDist + rk() * 22;
      const x = Math.floor(Math.max(8, Math.min(WW - 8, SPAWN.x + Math.cos(a) * d))) + 0.5, y = Math.floor(Math.max(8, Math.min(WH - 8, SPAWN.y + Math.sin(a) * d))) + 0.5;
      let dry = true;
      for (let dy = -3; dy <= 3 && dry; dy++) for (let dx = -3; dx <= 3; dx++) if (tyAt(x + dx, y + dy) === T_POND) { dry = false; break; }
      if (!dry || WZ.marks.some(m => Math.hypot(m.x - x, m.y - y) < M.spacing)) continue;
      const m = { id: WZ.marks.length, type: 'stronghold', x, y, el };
      WZ.marks.push(m); add({ x, y, lm: m });
      break;
    }
  });
  const nearMark = (x, y) => WZ.marks.some(m => Math.abs(m.x - x) < 3 && Math.abs(m.y - y) < 3);
  for (let i = 0; i < 9000; i++) {
    const x = 1 + r() * (WW - 2), y = 1 + r() * (WH - 2), t = tyAt(x, y), roll = r();
    if (t === T_POND || Math.hypot(x - SPAWN.x, y - SPAWN.y) < 3 || nearMark(x, y)) continue;
    let spr = null;
    if (t === T_FLOWER) { if (roll < 0.55) spr = 'flower' + Math.floor(r() * 4); }
    else if (t === T_GRASS || t === T_DARK) {
      if (roll < 0.30) spr = 'tuft'; else if (roll < 0.34) spr = 'bush';
      else if (t === T_DARK && roll < 0.38) spr = 'shrooms'; else if (roll < 0.345) spr = 'pebbles';
      else if (roll > 0.97) spr = 'flower' + Math.floor(r() * 4);
    } else if (t === T_SAND || t === T_DIRT) { if (roll < 0.15) spr = 'pebbles'; }
    else if (t === T_BOG) { if (roll < 0.4) spr = 'reeds'; }
    if (spr) add({ x, y, spr, deco: true });
  }
  for (let i = 0; i < 90; i++) {   // fences / lanterns / signposts along the paths
    const x = 4 + r() * (WW - 8), y = 4 + r() * (WH - 8);
    if (WZ.pathDist(x, y) > 2.6 || WZ.pathDist(x, y) < 1.8 || tyAt(x, y) === T_POND || nearMark(x, y)) continue;
    const roll = r();
    add({ x, y, spr: roll < 0.6 ? 'fence' : roll < 0.85 ? 'lantern' : 'sign', deco: true });
  }
  for (let i = 0; i < 160; i++) {   // ruined pillars + crystal clusters far from spawn
    const x = 4 + r() * (WW - 8), y = 4 + r() * (WH - 8);
    if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 28 || tyAt(x, y) === T_POND || nearMark(x, y)) continue;
    add({ x, y, spr: r() < 0.5 ? 'pillar' : 'crystals', deco: true });
  }
  WZ.harv = [];
  for (const k of ['tree', 'rock', 'ore']) {
    for (let c = 0; c < CFG.harvest[k].count;) {
      const x = 2 + r() * (WW - 4), y = 2 + r() * (WH - 4);
      if (tyAt(x, y) === T_POND || tyAt(x, y) === T_BOG || Math.hypot(x - SPAWN.x, y - SPAWN.y) < CFG.world.minSpawnDist || nearMark(x, y)) continue;
      const def = CFG.harvest[k];
      const h = { x, y, kind: k, hp: def.hp, maxHp: def.hp, broken: false, respawn: 0, flash: 0, harv: true };
      WZ.harv.push(h); add(h); c++;
    }
  }
  // forage spots (dirt mounds, stick piles, berry bushes): stand still and mash the roll button to search them
  WZ.forage = [];
  const ground = { mound: [T_GRASS, T_DIRT, T_SAND, T_DARK], sticks: [T_GRASS, T_DARK, T_FLOWER], bush: [T_GRASS, T_DARK, T_FLOWER] };
  for (const k of ['mound', 'sticks', 'bush']) {
    for (let c = 0, tries = 0; c < CFG.forage[k].count && tries < 20000; tries++) {
      const x = 2 + r() * (WW - 4), y = 2 + r() * (WH - 4);
      if (ground[k].indexOf(tyAt(x, y)) < 0 || Math.hypot(x - SPAWN.x, y - SPAWN.y) < 4 || nearMark(x, y)) continue;
      const o = { x, y, kind: k, prog: 0, lastT: 0, broken: false, respawn: 0, shake: 0, forage: true };
      WZ.forage.push(o); add(o); c++;
    }
  }
};

// ---------- run state ----------
WZ.maxHp = () => CFG.wizard.hp + CFG.upgrade.hearty * lvl('hearty');
WZ.speed = () => CFG.wizard.speed * (1 + CFG.upgrade.zoomies * lvl('zoomies'));
WZ.tile = (x, y) => (x < 0 || y < 0 || x >= CFG.WW || y >= CFG.WH ? T_POND : WZ.terrain[Math.floor(y) * CFG.WW + Math.floor(x)] >> 3);
WZ.wet = (x, y) => WZ.tile(x, y) === T_POND;
// circle-vs-water test (r = body radius)
WZ.blocked = (x, y, r) => WZ.wet(x - r, y - r) || WZ.wet(x + r, y - r) || WZ.wet(x - r, y + r) || WZ.wet(x + r, y + r);
// move a body with axis sliding; water can't be entered at all
WZ.slide = function (o, nx, ny, r) {
  const inside = WZ.blocked(o.x, o.y, r);
  let hitX = false, hitY = false;
  if (inside || !WZ.blocked(nx, o.y, r)) o.x = nx; else hitX = true;
  if (inside || !WZ.blocked(o.x, ny, r)) o.y = ny; else hitY = true;
  return hitX || hitY;
};
WZ.dryNear = function (x, y, tries, spread) {   // a random dry spot near (x,y)
  for (let i = 0; i < tries; i++) {
    const a = Math.random() * 6.283, d = spread[0] + Math.random() * (spread[1] - spread[0]);
    const px = Math.max(1, Math.min(CFG.WW - 1, x + Math.cos(a) * d)), py = Math.max(1, Math.min(CFG.WH - 1, y + Math.sin(a) * d));
    if (!WZ.blocked(px, py, 0.4)) return [px, py];
  }
  return null;
};
WZ.fresh = function () {
  return {
    x: SPAWN.x, y: SPAWN.y, hp: WZ.maxHp(), armor: 0, fx: 1, fy: 1, vx: 0, vy: 0, target: null,
    roll: 0, rollCd: 0, rdx: 0, rdy: 0, hurtT: 0, moving: false, bob: 0, shake: 0, ghosts: [],
    enemies: [], proj: [], eproj: [], zones: [], fx_: [], drops: [], timers: [], pickups: [],
    time: 0, spawnT: 1.5, kills: 0, dead: false, deadHandled: false, boss: null, seen: {}, surge: null, bloom: 0, eggT: 0, mergeT: 0, zSlow: 0, slowT: 0, slowAmt: 0,
    lm: WZ.marks.map(() => ({ state: 'idle', t: 0, sp: 0, near: false })),
    run: { deliveries: 0, harvested: 0, dmg: 0, weak: 0, elites: 0, shards: 0, marks: 0, xp: 0, spells: {} },
    t: 0,
  };
};
// shards are precious: any still lying in the wilds when the run ends go to the Stockpile anyway
WZ.bankLooseShards = function () {
  const w = G && G.w;
  if (!w) return;
  for (const dr of w.drops) {
    if (dr.kind === 'shard') { G.stock.shard += dr.val; G.stats.shards = (G.stats.shards || 0) + dr.val; }
    else if (dr.kind === 'core') G.stock.core += dr.val;
  }
  w.drops = w.drops.filter(dr => dr.kind !== 'shard' && dr.kind !== 'core');
};
WZ.reenter = function () { WZ.bankLooseShards(); G.w = WZ.fresh(); };

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
// The spell currently resolving: projectiles, zones and timers carry it, so later hits still know their elements
// and can be counted for the Builder's "HIT 4 KO 2" report.
WZ.ctx = null;
WZ.mult = function (e, el) {
  if (!el || !el.length) return 1;
  const weak = e.weak && el.indexOf(e.weak) >= 0;
  if (e.boss) return weak ? CFG.boss.weakMul : CFG.boss.otherMul;
  if (weak) return CFG.weakMul;
  return (e.resist && el.indexOf(e.resist) >= 0 ? CFG.resistMul : 1) * (e.dr || 1);   // armored foes only take full damage from their weakness
};
WZ.hurtE = function (e, d, kx, ky, quiet) {
  if (e.dead || e.fall > 0) return;
  const c = WZ.ctx, m = c ? WZ.mult(e, c.el) : 1;
  d *= m;
  G.w.run.dmg += Math.min(d, Math.max(0, e.hp));
  e.hp -= d;
  if (c && e._c !== c) { e._c = c; c.hits++; if (m > 1) { c.weak++; G.w.run.weak++; } }
  if (!quiet) {
    e.flash = 0.12;
    const kb = e.kb !== undefined ? e.kb : e.boss ? 0.08 : e.elite ? 0.4 : 1;
    if (kx || ky) { e.kx += kx * kb; e.ky += ky * kb; }
    WZ.num(e.x, e.y, Math.round(d) + (m > 1 ? '!' : ''), m > 1 ? '#ffe36b' : m < 1 ? '#9a94b0' : d >= 40 ? '#ffd23a' : '#ffffff');
  }
  if (e.hp <= 0) WZ.kill(e);
};
WZ.icon = (x, y, k) => G.w.fx_.push({ type: 'icon', x: x + rand(-0.2, 0.2), y, k, t: 0, dur: 0.7 });   // a sprite floating up
WZ.num = (x, y, text, col) => G.w.fx_.push({ type: 'num', x: x + rand(-0.2, 0.2), y: y + rand(-0.2, 0.2), text: String(text), col, t: 0, dur: 0.7 });
WZ.puff = function (x, y, col, n) {
  for (let i = 0; i < (n || 8); i++) {
    const a = Math.random() * 6.283, s = rand(1.5, 4);
    G.w.fx_.push({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0.3, vz: rand(2, 5), col, t: 0, dur: rand(0.35, 0.6) });
  }
};
WZ.epuff = function (x, y, el, n) {
  for (let i = 0; i < (n || 8); i++) {
    const a = Math.random() * 6.283, s = rand(1.5, 3.5);
    const f = { type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0.3, vz: rand(2, 5), col: Math.random() < 0.3 ? '#ffffff' : ELEM[el].color, t: 0, dur: rand(0.4, 0.7), el };
    if (el === 'air') { f.vz = rand(1, 2); f.g = -1; f.spin = 1; } else if (el === 'water') f.g = 16; else if (el === 'fire') { f.vz = rand(1, 3); f.g = -3; f.vx *= 0.4; f.vy *= 0.4; } else f.g = 20;
    G.w.fx_.push(f);
  }
};
WZ.damage = function (d) {   // armor soaks damage first
  const w = G.w;
  const soak = Math.min(w.armor, d);
  w.armor -= soak; d -= soak;
  if (soak > 0) WZ.num(w.x, w.y, '-' + Math.round(soak), '#9fc4ff');
  if (d > 0) { w.hp -= d; WZ.num(w.x, w.y, '-' + Math.round(d), '#ff6a6a'); }
  w.hurtT = 0.35; w.shake = Math.max(w.shake, 0.35);
  AU.sfx(soak > 0 && d <= 0 ? 'clank' : 'hurt');
  if (w.hp <= 0) { w.hp = 0; w.dead = true; AU.sfx('die'); WZ.puff(w.x, w.y, '#b58cff', 20); }
};
// a hit the roll's i-frames just swallowed: say so, so dodging feels deliberate
WZ.dodge = function () {
  const w = G.w;
  if (w.t < (w.dodgeAt || 0)) return;
  w.dodgeAt = w.t + CFG.wizard.dodgeCd;
  WZ.ring(w.x, w.y, 1.3, '#ffffff', 0.25); WZ.puff(w.x, w.y, '#bfe9ff', 6);
  AU.sfx('dodge');
};
// ---------- forage spots: mash the roll button while standing still to dig / search ----------
WZ.forageAt = function (x, y) {
  let best = null, bd = CFG.forage.reach;
  for (const o of WZ.forage) {
    if (o.broken || Math.abs(o.x - x) > 2 || Math.abs(o.y - y) > 2) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
};
WZ.forageName = k => (k === 'mound' ? 'Dirt Mound' : k === 'sticks' ? 'Stick Pile' : 'Berry Bush');
WZ.mash = function (o) {
  const F = CFG.forage, def = F[o.kind], w = G.w;
  o.prog += 1; o.lastT = w.t; o.shake = 0.12; w.mashT = 0.14;
  WZ.puff(o.x, o.y, o.kind === 'mound' ? '#8a6a3c' : o.kind === 'sticks' ? '#c98a52' : '#46b452', 3);
  AU.sfx(o.kind === 'bush' ? 'rustle' : 'dig');
  if (o.prog < def.taps) return;
  o.broken = true; o.prog = 0; o.respawn = o.kind === 'bush' ? F.bushRespawn : F.respawn;
  if (o.kind === 'bush') {   // a pickup tumbles out of the bush: walk over it to use it
    const kind = Math.random() < def.potion ? 'potion' : 'armor', s = WZ.dryNear(o.x, o.y, 12, [0.9, 1.5]) || [o.x, o.y];
    w.pickups.push({ kind, x: s[0], y: s[1], z: 1.6, t: 0 });
  } else {
    for (const k in def.drop) for (let i = 0; i < def.drop[k]; i++) WZ.drop(k, o.x, o.y, 1);
    for (const k in def.bonus) if (Math.random() < def.bonus[k]) WZ.drop(k, o.x, o.y, 1);
  }
  G.stats.foraged = (G.stats.foraged || 0) + 1;
  WZ.puff(o.x, o.y, '#ffe9b8', 12);
  AU.sfx('chest');
};
WZ.dropPickup = function (kind) {
  const w = G.w;
  if (!w || w.dead) return;
  const spot = WZ.dryNear(w.x, w.y, 20, [1.8, 3]) || [w.x, w.y];
  const x = spot[0], y = spot[1];
  w.pickups.push({ kind, x, y, z: 9, t: 0 });
  w.fx_.push({ type: 'beam', x, y, col: ITEMS[kind].color, t: 0, dur: 0.9 });
  AU.sfx('portalDrop');
};
WZ.hurtH = function (h, d) {
  if (h.broken) return;
  h.hp -= d; h.flash = 0.1;
  if (h.hp <= 0) {
    h.broken = true; h.respawn = CFG.world.respawn;
    const def = CFG.harvest[h.kind];
    for (let i = 0; i < def.n; i++) WZ.drop(def.drop, h.x, h.y, 1);
    AU.sfx('kill');
  }
};
WZ.kill = function (e) {
  if (e.dead || WZ.rebirth(e)) return;
  e.dead = true;
  const w = G.w, def = CFG.enemies[e.type];
  G.stats.kills++; w.kills++;
  if (WZ.ctx) WZ.ctx.kills++;
  if (e.boss) { WZ.bossDown(e); return; }
  WZ.dropGems(e.x, e.y, WZ.killGems(e));
  if (e.elite) {
    // the bonus shard is random, but never dry for more than CFG.elite.pity elites in a row
    const dry = G.stats.eliteDry || 0, bonus = dry >= CFG.elite.pity || Math.random() < CFG.elite.shardBonus;
    G.stats.eliteDry = bonus ? 0 : dry + 1;
    const n = e.crafted && !CFG.crafted.eliteShards ? 0 : 1 + (bonus ? 1 : 0);
    for (let i = 0; i < n; i++) WZ.drop('shard', e.x, e.y, 1);
    G.stats.elites = (G.stats.elites || 0) + 1; w.run.elites++;
    WZ.ring(e.x, e.y, 2.2, '#ffd23a', 0.45);
  }
  WZ.onDeath(e);
  AU.sfx('kill');
  w.fx_.push({ type: 'boom', x: e.x, y: e.y, r: e.elite ? 1.4 : 0.9, t: 0, dur: 0.3, col: '#ffffff' });
  WZ.puff(e.x, e.y, def.col, e.elite ? 16 : 9);
};
WZ.drop = function (kind, x, y, val) {
  const a = Math.random() * 6.283, s = 2 + Math.random() * 2.5;
  G.w.drops.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, val });
};
// call fn(target, dist, isEnemy) for everything within r of (x,y)
WZ.each = function (x, y, r, fn) {
  const w = G.w;
  for (const e of w.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d <= r + e.rad) fn(e, d, true); }
  for (const h of WZ.harv) { if (h.broken) continue; const d = Math.hypot(h.x - x, h.y - y); if (d <= r + 0.4) fn(h, d, false); }
};
WZ.hit = (t, isE, d, kx, ky) => { if (isE) WZ.hurtE(t, d, kx || 0, ky || 0); else WZ.hurtH(t, d); };
WZ.slowE = (e, amt, t) => { if (e.boss) amt *= 0.35; if (amt >= e.slow || e.slowT <= 0) e.slow = amt; e.slowT = Math.max(e.slowT, t); };
WZ.nearest = function (x, y, maxD, skip) {
  let best = null, bd = maxD || 1e9;
  for (const e of G.w.enemies) {
    if (e.dead || (skip && skip.indexOf(e) >= 0)) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
};
WZ.aim = function () {
  const w = G.w;
  let dx = w.fx, dy = w.fy;
  const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  let best = null, bd = 16;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const ex = e.x - w.x, ey = e.y - w.y, d = Math.hypot(ex, ey);
    if (d < 0.3 || d > bd) continue;
    const cos = (ex * dx + ey * dy) / d;
    if (cos > 0.9) { bd = d; best = [ex / d, ey / d]; }
  }
  return best || [dx, dy];
};
WZ.proj = function (o) {
  const p = Object.assign({ x: G.w.x, y: G.w.y, vx: 0, vy: 0, life: 1, r: 0.6, dmg: 0, splash: 0, sr: 0, slow: 0, slowT: 0, col: '#fff', kind: 'ball', size: 5, ctx: WZ.ctx }, o);
  G.w.proj.push(p);
  return p;
};
WZ.zone = function (o) {
  const z = Object.assign({ x: G.w.x, y: G.w.y, r: 4, t: 3, dur: 3, dps: 0, slow: 0, follow: false, col: '#fff', ctx: WZ.ctx }, o);
  z.dur = z.t;
  G.w.zones.push(z);
};
WZ.ring = (x, y, r, col, dur) => G.w.fx_.push({ type: 'ring', x, y, r, t: 0, dur: dur || 0.4, col });
WZ.boom = (x, y, r, col) => G.w.fx_.push({ type: 'boom', x, y, r, t: 0, dur: 0.35, col });
WZ.later = (t, fn) => { const c = WZ.ctx; G.w.timers.push({ t, fn: () => { const o = WZ.ctx; WZ.ctx = c; fn(); WZ.ctx = o; } }); };
WZ.explode = function (x, y, r, dmg, col, skip, kb) {
  WZ.boom(x, y, r, col);
  WZ.each(x, y, r, (t, d, isE) => {
    if (t === skip) return;
    const m = d || 1;
    WZ.hit(t, isE, dmg, isE && kb ? (t.x - x) / m * kb : 0, isE && kb ? (t.y - y) / m * kb : 0);
  });
};
WZ.chain = function (n, dmg, col, range) {
  const w = G.w, hit = [];
  let px = w.x, py = w.y;
  const pts = [[px, py]];
  for (let i = 0; i < n; i++) {
    const e = WZ.nearest(px, py, range || 12, hit);
    if (!e) break;
    hit.push(e); pts.push([e.x, e.y]); px = e.x; py = e.y;
    WZ.hurtE(e, dmg, 0, 0);
  }
  if (pts.length > 1) w.fx_.push({ type: 'bolt', pts, t: 0, dur: 0.35, col });
  return hit.length;
};

// ---------- spells ----------
// a delivered spell first plays its own drop-in over the Wizard (CFG.spells[s].drop seconds, drawn by R.drawDrop),
// so whoever plays him sees and hears it coming even without watching the Spell Portal; then it casts
WZ.incoming = function (spell) {
  const w = G.w;
  if (!w || w.dead) return;
  const combo = BASICS.indexOf(spell) < 0, dur = CFG.spells[spell].drop || 0.5;
  w.fx_.push({ type: 'drop', spell, x: w.x, y: w.y, col: SPELL_COL[spell] || '#fff', t: 0, dur, big: combo, seed: Math.random() * 6 });
  AU.sfx(combo ? 'incoming_big' : 'incoming');
  WZ.later(dur, () => WZ.cast(spell));
};
WZ.cast = function (spell) {
  const w = G.w;
  if (!w || w.dead) return;
  const px = w.x, py = w.y, combo = BASICS.indexOf(spell) < 0;
  const ctx = { spell, el: SPELL_EL[spell] || [], hits: 0, kills: 0, weak: 0 };
  // it bursts at his feet, and the Spell Portal back in the factory feels it (harder for higher tiers)
  w.fx_.push({ type: 'arrive', x: px, y: py, col: SPELL_COL[spell] || '#fff', t: 0, dur: combo ? 0.4 : 0.3, big: combo });
  if (combo) {
    w.shake = Math.max(w.shake, 0.25);
    w.fx_.push({ type: 'title', x: px, y: py, text: SPELLS[spell].toUpperCase() + '!', col: SPELL_COL[spell], t: 0, dur: 1.2 });
  }
  FA.thump(Math.max(1, ctx.el.length), SPELL_COL[spell] || '#ffffff');
  ctx.el.forEach(el => WZ.epuff(px, py, el, combo ? 6 : 8));
  WZ.ctx = ctx;
  const cone = (n, spread, f) => {
    const a = WZ.aim(), base = Math.atan2(a[1], a[0]);
    for (let i = 0; i < n; i++) {
      const ang = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      f(Math.cos(ang), Math.sin(ang), i);
    }
  };
  const S = CFG.spells[spell];
  switch (spell) {
    case 'gust':
      AU.sfx('zap_air');
      WZ.ring(px, py, S.r, '#e6f8ff', 0.45);
      WZ.each(px, py, S.r, (t, d, isE) => { const m = d || 1; WZ.hit(t, isE, S.dmg, isE ? (t.x - px) / m * S.push : 0, isE ? (t.y - py) / m * S.push : 0); });
      break;
    case 'fireball': {
      AU.sfx('zap_fire');
      const a = WZ.aim();
      WZ.proj({ vx: a[0] * S.speed, vy: a[1] * S.speed, life: S.life, dmg: S.dmg, splash: S.splash, sr: S.sr, col: '#ff7a30', kind: 'fire', size: 7 });
      break;
    }
    case 'spray':
      AU.sfx('zap_water');
      w.hp = Math.min(WZ.maxHp(), w.hp + S.heal);
      cone(S.n, S.spread, (dx, dy) => WZ.proj({ vx: dx * S.speed, vy: dy * S.speed, life: S.life, dmg: S.dmg, slow: S.slow, slowT: S.slowT, col: '#4aa8ff', size: 4, r: 0.55 }));
      break;
    case 'boulder': {
      AU.sfx('zap_earth');
      const a = WZ.aim();
      WZ.proj({ vx: a[0] * S.speed, vy: a[1] * S.speed, life: S.life, dmg: S.dmg, splash: S.splash, sr: S.sr, col: '#8a6a3c', kind: 'rock', size: 9, r: 0.75 });
      break;
    }
    case 'flamethrower':
      AU.sfx('zap_fire');
      cone(S.n, S.spread, (dx, dy) => WZ.proj({ vx: dx * S.speed, vy: dy * S.speed, life: S.life, dmg: S.dmg, col: '#ff9a2b', size: 6, r: 0.55 }));
      break;
    case 'steam':
      AU.sfx('zap_combo');
      WZ.ring(px, py, S.r, '#f4f4f8', 0.5);
      WZ.each(px, py, S.r, (t, d, isE) => { WZ.hit(t, isE, S.dmg); if (isE) WZ.slowE(t, S.slow, S.slowT); });
      break;
    case 'sandstorm':
      AU.sfx('zap_combo');
      WZ.zone({ r: S.r, t: S.t, dps: S.dps, slow: S.slow, follow: true, col: '#d9b46a' });
      break;
    case 'magma': {
      AU.sfx('zap_fire');
      const a = WZ.aim();
      WZ.proj({ vx: a[0] * S.speed, vy: a[1] * S.speed, life: S.life, dmg: S.dmg, splash: S.splash, sr: S.sr, col: '#ff4a1a', kind: 'magma', size: 8, r: 0.7 });
      break;
    }
    case 'tempest':
      AU.sfx('zap_combo');
      WZ.chain(S.n, S.dmg, '#bfe9ff', S.range);
      WZ.each(px, py, S.slowR, (t, d, isE) => { if (isE) WZ.slowE(t, S.slow, S.slowT); });
      break;
    case 'mud': {
      AU.sfx('zap_earth');
      const e = WZ.nearest(px, py, S.range);
      const x = e ? e.x : px + w.fx * 5, y = e ? e.y : py + w.fy * 5;
      WZ.zone({ x, y, r: S.r, t: S.t, dps: S.dps, slow: S.slow, col: '#6e4a2a' });
      break;
    }
    case 'meteor': {
      AU.sfx('zap_combo');
      for (let i = 0; i < S.n; i++) {
        WZ.later(i * S.gap, () => {
          const alive = G.w.enemies.filter(e => !e.dead && Math.hypot(e.x - G.w.x, e.y - G.w.y) < S.range);
          const e = alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
          const x = e ? e.x : G.w.x + rand(-7, 7), y = e ? e.y : G.w.y + rand(-7, 7);
          G.w.fx_.push({ type: 'meteor', x, y, t: 0, dur: S.fall });
          WZ.later(S.fall, () => { WZ.explode(x, y, S.r, S.dmg, '#ff7a30'); AU.sfx('hit'); });
        });
      }
      break;
    }
    case 'thunder':
      AU.sfx('zap_combo');
      WZ.chain(S.n, S.dmg, '#fff27a', S.range);
      break;
    case 'blizzard':
      AU.sfx('zap_combo');
      WZ.zone({ r: S.r, t: S.t, dps: S.dps, slow: S.slow, follow: true, col: '#dff4ff' });
      break;
    case 'geyser': {
      AU.sfx('zap_water');
      const list = G.w.enemies.filter(e => !e.dead).sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py)).slice(0, S.n);
      list.forEach((e, i) => {
        const x = e.x, y = e.y;
        G.w.fx_.push({ type: 'warn', x, y, r: S.r, t: 0, dur: S.delay + i * S.gap, col: '#4aa8ff' });
        WZ.later(S.delay + i * S.gap, () => { WZ.explode(x, y, S.r, S.dmg, '#7ad0ff'); });
      });
      break;
    }
    case 'nova':
      AU.sfx('zap_combo');
      WZ.ring(px, py, S.r, '#fff6c0', 0.6);
      WZ.boom(px, py, S.r, '#ffe36b');
      WZ.each(px, py, S.r, (t, d, isE) => { const m = d || 1; WZ.hit(t, isE, S.dmg, isE ? (t.x - px) / m * S.push : 0, isE ? (t.y - py) / m * S.push : 0); if (isE) WZ.slowE(t, S.slow, S.slowT); });
      break;
  }
  WZ.ctx = null;
  WZ.later(1.1, () => FA.landed(ctx));
};

// ---------- enemies ----------
// biome foes spawn by the terrain under the spawn point; everything else uses the spawn weights
WZ.pickType = function (x, y) {
  const t = WZ.tile(x, y), dist = Math.hypot(x - SPAWN.x, y - SPAWN.y), r = Math.random(), early = G.w.time < 40;
  if (!early && t === T_BOG && r < 0.65) return 'lurker';
  if (!early && (t === T_SAND || t === T_DIRT) && r < 0.55) return 'imp';
  if (t === T_DARK && dist > 30 && r < 0.45) return 'golem';
  if ((t === T_FLOWER || dist > 45) && dist > 25 && r < 0.35) return 'wisp';
  let roll = Math.random() * 100;
  for (const k in CFG.enemies) { roll -= CFG.enemies[k].w; if (roll <= 0) return k; }
  return 'slime';
};
WZ.makeEnemy = function (type, x, y, elite) {
  const w = G.w, def = CFG.enemies[type];
  const hp = type === 'boss' || def.crafted || type === 'warden' ? def.hp : def.hp * (1 + CFG.world.hpPerMin * w.time / 60);
  const e = { type, x, y, hp, maxHp: hp, kx: 0, ky: 0, slow: 0, slowT: 0, cd: 0, flash: 0, dead: false, face: 1, bob: Math.random() * 6,
    weak: def.weak || null, resist: def.resist || null, rad: def.rad || 0.35, spd: def.speed, dmg: def.dmg };
  if (elite) WZ.eliteUp(e);
  w.enemies.push(e);
  return e;
};
// bigger, tougher, gold-ringed; hpMul / dmgMul default to the usual elite numbers
WZ.eliteUp = function (e, hpMul, dmgMul) {
  const E = CFG.elite;
  e.elite = true; e.hp = e.maxHp = e.maxHp * (hpMul || E.hp); e.spd *= hpMul ? 1 : E.speed; e.dmg *= dmgMul || E.dmg; e.rad = Math.max(e.rad, 0.5);
  if (!e.weak) e.weak = ELEMS[Math.floor(Math.random() * 4)];
};
WZ.spawn = function () {
  const w = G.w, cfg = CFG.world, E = CFG.elite;
  const spot = WZ.dryNear(w.x, w.y, 12, [cfg.ringMin, cfg.ringMax]);   // never spawn on water
  if (!spot) return;
  const dist = Math.hypot(w.x - SPAWN.x, w.y - SPAWN.y);
  const pElite = w.time < E.minTime ? 0 : Math.min(E.max, E.base + E.perMin * w.time / 60 + E.perDist * dist / 100);
  const e = WZ.makeEnemy(WZ.pickType(spot[0], spot[1]), spot[0], spot[1], Math.random() < pElite * cfg.wildElite);
  e.wild = true; e.hp = e.maxHp = e.maxHp * cfg.wildHp; e.dmg *= cfg.wildDmg;
  if (w.bloom && Math.random() < w.bloom) WZ.mutate(e);   // Mutation Bloom: wild spawns mutate a lot
};
// first sighting of a biome foe or an elite: tell both players what it's weak to
WZ.announce = function (e, key) {
  const def = CFG.enemies[e.type], el = e.weak;
  if (key === 'elite') {
    UI.toast('Elite near the Wizard: send ' + ELEM_WORD[el] + '!', 'L', el);
  } else {
    UI.toast('The Wizard meets ' + def.name + 's: send ' + ELEM_WORD[el] + ' spells!', 'L', el);
  }
  AU.sfx('alert');
};

// ---------- landmarks ----------
WZ.markName = m => (m.type === 'shrine' ? ELEM_WORD[m.el] + ' Shrine' : m.type === 'stronghold' ? ELEM_WORD[m.el] + ' Stronghold' : m.type === 'camp' ? 'Monster Camp' : 'Ancient Crypt');
WZ.claim = function (m) {
  const w = G.w, M = CFG.marks, n = M[m.type + 'Shards'];
  w.lm[m.id].state = 'done';
  for (let i = 0; i < n; i++) WZ.drop('shard', m.x, m.y, 1);
  WZ.dropGems(m.x, m.y, M.xpBonus);
  G.stats.landmarks = (G.stats.landmarks || 0) + 1; w.run.marks++;
  WZ.ring(m.x, m.y, 4, '#c890ff', 0.6); WZ.puff(m.x, m.y, '#c890ff', 18);
  AU.sfx('chest'); UI.changed();   // the shards themselves fly out and pop up at the factory's shard pile
};
// the shrine mini-game: a ring shrinks toward the crystal over shrineCycle seconds; pressing while it overlaps the
// target ring scores a hit, a miss just restarts the ring. shrineHits hits claim it. It can't be failed.
WZ.shrineAt = function () {
  const w = G.w;
  return WZ.marks.find(m => m.type === 'shrine' && w.lm[m.id].state === 'active') || null;
};
WZ.shrineRing = s => 1 - (s.ph || 0);   // ring size, 1 = outer edge, 0 = the crystal
WZ.shrineTap = function (m) {
  const w = G.w, M = CFG.marks, s = w.lm[m.id];
  if (Math.abs(WZ.shrineRing(s) - M.shrineTarget) <= M.shrineTol) {
    s.hits = (s.hits || 0) + 1; s.flash = 0.3; s.ph = 0;
    WZ.ring(m.x, m.y, 1.2 + s.hits * 0.5, ELEM[m.el].color, 0.4); WZ.puff(m.x, m.y, ELEM[m.el].color, 8);
    AU.sfx('shrine');
    if (s.hits >= M.shrineHits) WZ.claim(m);
  } else { s.miss = 0.25; s.ph = 0; AU.sfx('thud'); }
};
WZ.foesNear = (m, n) => {
  for (let i = 0; i < n; i++) {
    const s = WZ.dryNear(m.x, m.y, 12, [1.2, 3.5]);
    if (s) WZ.makeEnemy(WZ.pickType(s[0], s[1]), s[0], s[1], false).mark = m.id;
  }
};
WZ.updMarks = function (dt) {
  const w = G.w, M = CFG.marks;
  w.shrine = null;
  for (const m of WZ.marks) {
    const s = w.lm[m.id];
    if (s.state === 'done' && m.type !== 'shrine') continue;   // claimed shrines keep boosting
    const d = Math.hypot(w.x - m.x, w.y - m.y);
    if (m.type === 'camp') {
      if (s.state === 'idle' && d < M.campWake) {
        s.state = 'active';
        const sp = WZ.dryNear(m.x, m.y, 12, [1, 2.5]) || [m.x, m.y];
        WZ.makeEnemy(WZ.pickType(sp[0], sp[1]), sp[0], sp[1], true).mark = m.id;
        WZ.foesNear(m, M.campFoes - 1 + Math.floor(w.time / 180));
        UI.toast('The Wizard stirred up a Monster Camp: send firepower!', 'L', 'ic_flag');
        AU.sfx('alert');
      } else if (s.state === 'active' && !w.enemies.some(e => e.mark === m.id && !e.dead)) WZ.claim(m);
    } else if (m.type === 'crypt') {
      if (s.state === 'idle') {
        if (d < 1.6) {
          s.t += dt;
          if (s.t >= M.cryptHold) {
            s.state = 'active'; s.sp = M.cryptMinions;
            const sp = WZ.dryNear(m.x, m.y, 12, [1.5, 2.5]) || [m.x + 2, m.y];
            const g = WZ.makeEnemy('golem', sp[0], sp[1], true);
            g.hp = g.maxHp = g.maxHp * 2; g.mark = m.id; g.guard = true;
            WZ.foesNear(m, 4);
            WZ.ring(m.x, m.y, 5, '#b07aff', 0.6); w.shake = 0.4;
            UI.toast('Crypt Guardian (weak to ' + ELEM_WORD[g.weak] + ') is after the Wizard!', 'L', g.weak);
            AU.sfx('roar');
          }
        } else s.t = Math.max(0, s.t - dt * 2);
      } else {
        s.sp -= dt;
        if (s.sp <= 0) { s.sp = M.cryptMinions; WZ.foesNear(m, 2); }
        if (!w.enemies.some(e => e.guard && e.mark === m.id && !e.dead)) WZ.claim(m);
      }
    } else if (m.type === 'stronghold') {
      WZ.updKeep(m, s, d, dt);
    } else {   // shrines: claimed with the ring mini-game, then they boost their element's harnessers while he stands on them
      const near = d < M.shrineR;
      if (s.flash > 0) s.flash -= dt;
      if (s.miss > 0) s.miss -= dt;
      if (s.state === 'done') { if (near) w.shrine = m.el; }
      else if (near) { s.state = 'active'; s.ph = ((s.ph || 0) + dt / M.shrineCycle) % 1; }
      else if (s.state === 'active') { s.state = 'idle'; s.ph = 0; s.hits = 0; }   // walked off: cancelled
    }
  }
};

// ---------- the Primal Chimera ----------
WZ.summonBoss = function () {
  const w = G.w;
  if (!w || w.dead || w.boss) return false;
  const spot = WZ.dryNear(w.x, w.y, 30, [8, 11]) || [w.x + 6, w.y];
  const e = WZ.makeEnemy('boss', spot[0], spot[1], false);
  e.boss = true; e.order = ELEMS.slice().sort(() => Math.random() - 0.5); e.phase = 0; e.weak = e.order[0];
  e.slamT = 3; e.sumT = 6; e.volT = 5;
  w.boss = e;
  e.weakFlash = G.fac.weakFlash = CFG.boss.weakFlash;
  w.fx_.push({ type: 'beam', x: e.x, y: e.y, col: '#ff4a8a', t: 0, dur: 1.4 });
  WZ.ring(e.x, e.y, 6, '#ff4a8a', 0.8); w.shake = 0.8;
  const msg = 'The Primal Chimera rises! Weak to ' + ELEM_WORD[e.weak] + ' (it changes as it weakens)';
  UI.toast(msg, 'R', 'ic_crown'); UI.toast(msg, 'L', e.weak);
  AU.sfx('roar');
  return true;
};
WZ.bossAI = function (e, dt, d) {
  const B = CFG.boss, w = G.w;
  const ph = Math.min(3, Math.floor((1 - e.hp / e.maxHp) * 4));
  if (e.weakFlash > 0) e.weakFlash -= dt;
  if (ph !== e.phase) {
    e.phase = ph; e.weak = e.order[ph];
    e.weakFlash = G.fac.weakFlash = B.weakFlash;   // both the Chimera and the Spell Portal flash the new element
    AU.sfx('weak'); AU.sfx('el_' + e.weak);
    WZ.ring(e.x, e.y, 5, ELEM[e.weak].color, 0.7); w.shake = Math.max(w.shake, 0.4); WZ.epuff(e.x, e.y, e.weak, 16);
  }
  e.slamT -= dt; e.sumT -= dt; e.volT -= dt;
  if (e.slamT <= 0 && d < 10) {   // telegraphed slam where the Wizard stands: roll or walk out
    e.slamT = B.slamEvery;
    const x = w.x, y = w.y;
    w.fx_.push({ type: 'warn', x, y, r: B.slamR, t: 0, dur: B.slamDelay, col: '#ff4a8a' });
    AU.sfx('warn');
    WZ.later(B.slamDelay, () => {
      WZ.boom(x, y, B.slamR, '#ff4a8a'); AU.sfx('slam'); G.w.shake = Math.max(G.w.shake, 0.3);
      if (!G.w.dead && Math.hypot(G.w.x - x, G.w.y - y) < B.slamR) { if (G.w.roll > 0) WZ.dodge(); else WZ.damage(B.slamDmg); }
    });
  }
  if (e.volT <= 0 && d < 15) {    // a ring of orbs in the current weakness colour
    e.volT = B.volleyEvery;
    for (let i = 0; i < B.volleyN; i++) {
      const a = i / B.volleyN * 6.283 + Math.random() * 0.3;
      w.eproj.push({ x: e.x, y: e.y, vx: Math.cos(a) * B.volleySpeed, vy: Math.sin(a) * B.volleySpeed, life: 2.4, dmg: B.volleyDmg, col: ELEM[e.weak].color, size: 7 });
    }
    AU.sfx('volley');
  }
  if (e.sumT <= 0) { e.sumT = B.summonEvery; WZ.foesNear(e, B.summonN); WZ.ring(e.x, e.y, 3, '#ff4a8a', 0.4); }
};
WZ.nextWeak = e => (e && e.order && e.phase < 3 ? e.order[e.phase + 1] : null);
WZ.bossDown = function (e) {
  const w = G.w, B = CFG.boss;
  w.boss = null;
  WZ.dropGems(e.x, e.y, CFG.enemies.boss.gem[0]);
  for (let i = 0; i < B.shards; i++) WZ.drop('shard', e.x, e.y, 1);
  for (let i = 0; i < 6; i++) WZ.later(i * 0.15, () => { WZ.boom(e.x + rand(-1.5, 1.5), e.y + rand(-1.5, 1.5), 2.5, i % 2 ? '#ffe36b' : '#ff4a8a'); AU.sfx('hit'); });
  WZ.puff(e.x, e.y, '#ff4a8a', 40); w.shake = 1;
  for (const o of w.enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 22) { o.dead = true; WZ.puff(o.x, o.y, CFG.enemies[o.type].col, 6); }   // its brood scatters
  G.flags.won = true; G.stats.wins = (G.stats.wins || 0) + 1; w.run.boss = true;
  UI.toast('THE PRIMAL CHIMERA FALLS!', 'R', 'ic_crown'); UI.toast('THE PRIMAL CHIMERA FALLS!', 'L', 'ic_crown');
  AU.sfx('victory'); UI.changed();
  WZ.later(2.6, () => UI.showVictory());
};

// ---------- flow field: monsters walk around lakes instead of hugging the shore ----------
// A BFS distance map (8-way, no corner cutting) over a 97x97 window around the Wizard, rebuilt when he changes tile.
const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
WZ.flow = null; WZ.flowCd = 0;
WZ.buildFlow = function () {
  const w = G.w, N = 97, H = 48, cx = Math.floor(w.x), cy = Math.floor(w.y);
  let F = WZ.flow;
  if (!F) F = WZ.flow = { n: N, dist: new Int16Array(N * N), q: new Int32Array(N * N), m: new Uint8Array(N * N) };
  F.x0 = cx - H; F.y0 = cy - H; F.cx = cx; F.cy = cy;
  const D = F.dist, Q = F.q, M = F.m, WW = CFG.WW, WH = CFG.WH;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i + F.x0, y = j + F.y0;
    M[j * N + i] = x >= 0 && y >= 0 && x < WW && y < WH && (WZ.terrain[y * WW + x] >> 3) !== T_POND ? 1 : 0;
  }
  D.fill(-1);
  const s = H * N + H;
  if (!M[s]) return;
  let h = 0, t = 0;
  D[s] = 0; Q[t++] = s;
  while (h < t) {
    const c = Q[h++], ci = c % N, cj = (c / N) | 0, nd = D[c] + 1;
    for (const o of NB8) {
      const i = ci + o[0], j = cj + o[1];
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const k = j * N + i;
      if (!M[k] || D[k] >= 0) continue;
      if (o[0] && o[1] && (!M[cj * N + i] || !M[j * N + ci])) continue;
      D[k] = nd; Q[t++] = k;
    }
  }
};
WZ.clearLine = function (x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.4);
  for (let i = 1; i < n; i++) { const k = i / n; if (WZ.blocked(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0.3)) return false; }
  return true;
};
WZ.flowDir = function (e, d) {   // unit step toward the Wizard around water, or null to walk straight at him
  const F = WZ.flow, w = G.w;
  if (!F) return null;
  if (d < 24) {
    if (w.t >= (e.losAt || 0)) { e.losAt = w.t + 0.25; e.los = WZ.clearLine(e.x, e.y, w.x, w.y); }
    if (e.los) return null;
  }
  const N = F.n, tx = Math.floor(e.x) - F.x0, ty = Math.floor(e.y) - F.y0;
  if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
  const here = F.dist[ty * N + tx];
  if (here <= 0) return null;
  let best = -1, bx = 0, by = 0;
  for (const o of NB8) {
    const nx = tx + o[0], ny = ty + o[1];
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
    const v = F.dist[ny * N + nx];
    if (v < 0 || v >= here || (best >= 0 && v >= best)) continue;
    if (o[0] && o[1] && (!F.m[ty * N + nx] || !F.m[ny * N + tx])) continue;
    best = v; bx = nx; by = ny;
  }
  if (best < 0) return null;
  const gx = bx + F.x0 + 0.5 - e.x, gy = by + F.y0 + 0.5 - e.y, m = Math.hypot(gx, gy) || 1;
  return [gx / m, gy / m];
};

// ---------- main update ----------
WZ.update = function (dt, ix, iy, rollPressed) {
  const w = G.w, cfg = CFG.world;
  w.t += dt;
  // broken nodes respawn
  for (const h of WZ.harv) {
    if (h.flash > 0) h.flash -= dt;
    if (h.broken) { h.respawn -= dt; if (h.respawn <= 0) { h.broken = false; h.hp = h.maxHp; } }
  }
  // forage spots grow back; a half-dug one slowly fills in again if the Wizard stops mashing
  for (const o of WZ.forage) {
    if (o.shake > 0) o.shake -= dt;
    if (o.broken) { o.respawn -= dt; if (o.respawn <= 0) o.broken = false; }
    else if (o.prog > 0 && w.t - o.lastT > 0.5) o.prog = Math.max(0, o.prog - CFG.forage.decay * dt);
  }
  for (const f of w.fx_) {
    f.t += dt;
    if (f.type === 'spark') {
      f.x += f.vx * dt * 0.5; f.y += f.vy * dt * 0.5; f.z += f.vz * dt; f.vz -= (f.g === undefined ? 12 : f.g) * dt;
      if (f.spin) { const a = dt * 6, vx = f.vx; f.vx = vx * Math.cos(a) - f.vy * Math.sin(a); f.vy = vx * Math.sin(a) + f.vy * Math.cos(a); }
      if (f.z < 0) { f.z = 0; f.vz = 0; }
    }
  }
  w.fx_ = w.fx_.filter(f => f.t < f.dur);
  if (w.dead) { w.shrine = null; w.dig = null; if (G.ev && G.ev.active) WZ.evFail(); return; }
  w.time += dt;
  if (w.hurtT > 0) w.hurtT -= dt;
  if (w.mashT > 0) w.mashT -= dt;
  if (w.hp < WZ.maxHp() * 0.3) { w.heartT = (w.heartT || 0) - dt; if (w.heartT <= 0) { w.heartT = 0.4 + w.hp / WZ.maxHp() * 2.5; AU.sfx('heart'); } }
  if (w.rollCd > 0) w.rollCd -= dt;

  // timers
  for (let i = w.timers.length - 1; i >= 0; i--) {
    const t = w.timers[i]; t.t -= dt;
    if (t.t <= 0) { w.timers.splice(i, 1); t.fn(); }
  }
  if (!G.w || G.w !== w) return;   // a timer may have ended the run (victory screen re-enter)

  // movement
  let dx = 0, dy = 0;
  if (ix || iy) { w.target = null; dx = ix + iy; dy = iy - ix; }
  else if (w.target) {
    const tx = w.target.x - w.x, ty = w.target.y - w.y;
    if (Math.hypot(tx, ty) < 0.2) w.target = null; else { dx = tx; dy = ty; }
  }
  const m = Math.hypot(dx, dy);
  if (m > 0) { dx /= m; dy /= m; w.fx = dx; w.fy = dy; }
  // standing still at a forage spot, the roll button digs instead (move while pressing it to roll away)
  const sh = w.roll > 0 ? null : WZ.shrineAt();
  w.dig = w.roll > 0 || sh ? null : WZ.forageAt(w.x, w.y);
  if (rollPressed && sh && m === 0) { WZ.shrineTap(sh); w.mashAt = w.t; rollPressed = false; }
  else if (rollPressed && w.dig && m === 0) { WZ.mash(w.dig); w.mashAt = w.t; rollPressed = false; }
  else if (rollPressed && m === 0 && w.t - (w.mashAt || -9) < 0.35) rollPressed = false;   // extra mashes after it's dug don't roll him off
  // a roll pressed a moment too early (still rolling / cooling down) is kept for CFG.inputBuffer seconds
  if (rollPressed && (w.rollCd > 0 || w.roll > 0)) { w.rollBuf = CFG.inputBuffer; rollPressed = false; }
  else if (w.rollBuf > 0) { w.rollBuf -= dt; if (w.rollCd <= 0 && w.roll <= 0) { rollPressed = true; w.rollBuf = 0; } }
  if (rollPressed && w.rollCd <= 0 && w.roll <= 0) {
    w.roll = CFG.wizard.rollTime; w.rollCd = CFG.wizard.rollCd;
    w.rdx = m > 0 ? dx : w.fx; w.rdy = m > 0 ? dy : w.fy;
    const rm = Math.hypot(w.rdx, w.rdy) || 1; w.rdx /= rm; w.rdy /= rm;
    AU.sfx('roll');
  }
  let sp = WZ.speed();
  if (WZ.tile(w.x, w.y) === T_BOG) sp *= cfg.slowTerrain;
  // hostile mud / steam slows (the roll ignores them)
  const slowK = (1 - Math.min(0.8, w.zSlow || 0)) * (w.slowT > 0 ? 1 - w.slowAmt : 1);
  if (w.slowT > 0) w.slowT -= dt;
  if (w.roll > 0) {
    // the roll ignores acceleration: a committed burst
    w.roll -= dt;
    w.vx = w.rdx * sp * CFG.wizard.rollSpeed; w.vy = w.rdy * sp * CFG.wizard.rollSpeed;
    w.ghostT = (w.ghostT || 0) - dt;
    if (w.ghostT <= 0) { w.ghostT = 0.05; w.ghosts.push({ x: w.x, y: w.y, t: 0 }); }
  } else {
    const wx = dx * sp * slowK, wy = dy * sp * slowK, ex = wx - w.vx, ey = wy - w.vy, el = Math.hypot(ex, ey);
    const rate = (m > 0 ? CFG.wizard.accel : CFG.wizard.friction) * dt;
    if (el <= rate) { w.vx = wx; w.vy = wy; } else { w.vx += ex / el * rate; w.vy += ey / el * rate; }
  }
  for (const gh of w.ghosts) gh.t += dt;
  w.ghosts = w.ghosts.filter(gh => gh.t < 0.25);
  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt);
  const spd = Math.hypot(w.vx, w.vy);
  w.moving = spd > 0.3;
  if (spd > 0.01) {
    w.bob += dt * 11 * Math.min(1, spd / sp);
    const nx = Math.max(0.5, Math.min(CFG.WW - 0.5, w.x + w.vx * dt)), ny = Math.max(0.5, Math.min(CFG.WH - 0.5, w.y + w.vy * dt));
    const ox = w.x, oy = w.y;
    WZ.slide(w, nx, ny, CFG.wizard.radius);
    if (w.x === ox) w.vx = 0;
    if (w.y === oy) w.vy = 0;
    if (w.target && w.x === ox && w.y === oy) w.target = null;
  }
  WZ.flowCd -= dt;
  if (WZ.flowCd <= 0 && (!WZ.flow || WZ.flow.cx !== Math.floor(w.x) || WZ.flow.cy !== Math.floor(w.y))) { WZ.buildFlow(); WZ.flowCd = 0.2; }

  // pickups crafted in the factory: fall from the sky, then walk over to use
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    const p = w.pickups[i];
    p.t += dt;
    if (p.z > 0) { p.z = Math.max(0, p.z - dt * 14); if (p.z === 0) { WZ.puff(p.x, p.y, ITEMS[p.kind].color, 8); AU.sfx('thud'); } continue; }
    if (Math.hypot(p.x - w.x, p.y - w.y) > 0.8 + CFG.upgrade.magnet * lvl('magnet')) continue;   // Loot Magnet reaches these too
    const def = CFG.pickups[p.kind];
    if (def.heal) {
      if (w.hp >= WZ.maxHp()) { p.full = true; continue; }
      const got = Math.min(def.heal, WZ.maxHp() - w.hp);
      w.hp += got; WZ.num(w.x, w.y, '+' + Math.round(got), '#6aff8a');
    } else {
      if (w.armor >= CFG.wizard.armorMax) { p.full = true; continue; }
      const got = Math.min(def.armor, CFG.wizard.armorMax - w.armor);
      w.armor += got; WZ.num(w.x, w.y, '+' + Math.round(got), '#9fc4ff');
    }
    WZ.puff(p.x, p.y, ITEMS[p.kind].color, 12);
    AU.sfx('powerup');
    w.pickups.splice(i, 1);
  }
  // solid harvestables
  for (const h of WZ.harv) {
    if (h.broken) continue;
    const ex = w.x - h.x, ey = w.y - h.y;
    if (Math.abs(ex) > 1 || Math.abs(ey) > 1) continue;
    const d = Math.hypot(ex, ey);
    if (d < 0.75) { const k = d || 0.01; w.x = h.x + ex / k * 0.75; w.y = h.y + ey / k * 0.75; }
  }

  // spawning (slower while the Chimera is out: it brings its own brood)
  w.spawnT -= dt;
  if (w.spawnT <= 0) {
    const iv = Math.max(cfg.spawnFloor, cfg.spawnStart * Math.pow(cfg.spawnMul, w.time / 60));
    w.spawnT = iv * (w.boss ? 2 : 1);
    if (w.enemies.length < cfg.cap) WZ.spawn();
  }
  WZ.updMarks(dt);
  WZ.eggTick(dt);
  if (G.ev) WZ.evTick(dt);

  // enemies
  const en = w.enemies;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.cd > 0) e.cd -= dt;
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    if (e.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
    if (e.land > 0) e.land -= dt;
    if (e.fall > 0) { e.fall -= dt; if (e.fall <= 0) { e.fall = 0; e.land = 0.22; WZ.puff(e.x, e.y, '#d8c8a8', 8); AU.sfx('thud'); } continue; }   // dropping in from the Egg's portal
    if (e.dazeT > 0) { e.dazeT -= dt; continue; }   // dazed on landing
    const ex = w.x - e.x, ey = w.y - e.y, d = Math.hypot(ex, ey) || 1;
    if (d > 45) { const sp2 = WZ.dryNear(w.x, w.y, 8, [cfg.ringMin, cfg.ringMax]); if (sp2) { e.x = sp2[0]; e.y = sp2[1]; } continue; }
    if (d < 12) { const key = e.elite ? 'elite' : e.boss ? null : (e.weak ? e.type : null); if (key && !w.seen[key]) { w.seen[key] = true; WZ.announce(e, key); } }
    if (e.boss) WZ.bossAI(e, dt, d);
    const s = e.spd * (1 - e.slow) * (!e.fly && WZ.tile(e.x, e.y) === T_BOG ? cfg.slowTerrain : 1);
    let ux = ex / d, uy = ey / d, steered = false;
    if (e.detour > 0) { e.detour -= dt; const px = -uy * e.side, py = ux * e.side; ux = px; uy = py; }   // last-resort sidestep
    else if (d > 1.5 && !e.fly) { const f = WZ.flowDir(e, d); if (f) { ux = f[0]; uy = f[1]; steered = true; } }
    let mx = ux * s, my = uy * s;
    if (e.ai) { const r = WZ.aiTick(e, dt, d, ux, uy, s); if (r) { mx = r[0]; my = r[1]; } }   // a creature's own movement and attacks
    // soft separation: bodies keep (rad + rad + sepPad) apart, so packs stay readable and don't land hits in one clump
    for (let j = i + 1; j < en.length; j++) {
      const o = en[j]; if (o.dead) continue;
      const ox = e.x - o.x, oy = e.y - o.y, want = e.rad + o.rad + cfg.sepPad;
      if (Math.abs(ox) > want || Math.abs(oy) > want) continue;
      const od = Math.hypot(ox, oy) || 0.01;
      if (od >= want) continue;
      const push = (want - od) * cfg.sepForce, wo = o.boss ? 0.1 : e.boss ? 1.6 : 1;   // the boss shoves, nobody shoves it
      if (!e.boss) { mx += ox / od * push; my += oy / od * push; }
      WZ.slide(o, o.x - ox / od * push * dt * wo, o.y - oy / od * push * dt * wo, 0.3);
    }
    if (e.fly) { e.x = Math.max(0.5, Math.min(CFG.WW - 0.5, e.x + (mx + e.kx) * dt)); e.y = Math.max(0.5, Math.min(CFG.WH - 0.5, e.y + (my + e.ky) * dt)); }   // flyers cross water
    else if (WZ.slide(e, e.x + (mx + e.kx) * dt, e.y + (my + e.ky) * dt, 0.3) && !(e.detour > 0) && !steered) {
      e.detour = 0.5 + Math.random() * 0.6; e.side = e.side || (Math.random() < 0.5 ? 1 : -1);
      e.kx = 0; e.ky = 0;
    }
    const decay = Math.exp(-6 * dt); e.kx *= decay; e.ky *= decay;
    e.face = (ex - ey) >= 0 ? 1 : -1;
    // touch damage
    const reach = e.rad + 0.45;
    if (d < reach && e.cd <= 0 && w.roll <= 0 && w.hurtT > 0) e.cd = rand(0.15, 0.45);   // queued: strike a little later
    else if (d < reach && e.cd <= 0 && w.roll <= 0 && w.hurtT <= 0) {
      e.cd = cfg.touchCd * rand(0.85, 1.3);
      WZ.damage((e.diving && e.diveDmg) || e.dmg);
      if (!e.boss) { e.kx -= ex / d * 6; e.ky -= ey / d * 6; }   // bump the attacker back a little
    } else if (d < reach && e.cd <= 0 && w.roll > 0) { e.cd = 0.3; WZ.dodge(); }
  }
  w.enemies = en.filter(e => !e.dead);

  // projectiles
  for (let i = w.proj.length - 1; i >= 0; i--) {
    const p = w.proj[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let hit = null, hitE = false;
    for (const e of w.enemies) { if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.rad) { hit = e; hitE = true; break; } }
    if (!hit) for (const h of WZ.harv) { if (!h.broken && Math.hypot(h.x - p.x, h.y - p.y) < p.r + 0.4) { hit = h; break; } }
    WZ.ctx = p.ctx;
    if (hit) {
      if (p.kind === 'magma') {
        WZ.explode(p.x, p.y, p.sr, p.dmg, '#ff4a1a');
        WZ.zone({ x: p.x, y: p.y, r: 3, t: 3, dps: 10, slow: 0, col: '#ff6a1a' });
      } else {
        WZ.hit(hit, hitE, p.dmg, hitE ? p.vx * 0.15 : 0, hitE ? p.vy * 0.15 : 0);
        if (hitE && p.slow) WZ.slowE(hit, p.slow, p.slowT);
        if (p.splash) WZ.explode(p.x, p.y, p.sr, p.splash, p.kind === 'rock' ? '#a98a5c' : '#ff9a2b', hit);
      }
      w.proj.splice(i, 1);
    } else if (p.life <= 0) {
      if (p.kind === 'magma') { WZ.explode(p.x, p.y, p.sr, p.dmg, '#ff4a1a'); WZ.zone({ x: p.x, y: p.y, r: 3, t: 3, dps: 10, col: '#ff6a1a' }); }
      w.proj.splice(i, 1);
    }
    WZ.ctx = null;
  }
  // the Chimera's orbs: roll through them or step aside
  for (let i = w.eproj.length - 1; i >= 0; i--) {
    const p = w.eproj[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0 || WZ.wet(p.x, p.y)) { w.eproj.splice(i, 1); continue; }
    const pd = Math.hypot(p.x - w.x, p.y - w.y);
    if (w.roll > 0 && pd < 0.9 && !p.dodged) { p.dodged = true; WZ.dodge(); }   // rolled clean through it
    else if (pd < 0.55 && w.roll <= 0 && w.hurtT <= 0) { WZ.damage(p.dmg); w.eproj.splice(i, 1); }
  }

  // zones
  let zs = 0;
  for (let i = w.zones.length - 1; i >= 0; i--) {
    const z = w.zones[i];
    z.t -= dt;
    if (z.follow) { z.x = w.x; z.y = w.y; }
    if (z.hostile) {
      if (!w.dead && Math.hypot(w.x - z.x, w.y - z.y) < z.r) {
        if (z.slow) zs = Math.max(zs, z.slow);
        if (z.dps && w.roll <= 0) { z.tk = (z.tk || 0) + dt; if (z.tk >= 0.5) { z.tk = 0; WZ.damage(z.dps * 0.5); } }
      }
      if (z.t <= 0) w.zones.splice(i, 1);
      continue;
    }
    WZ.ctx = z.ctx;
    WZ.each(z.x, z.y, z.r, (t, d, isE) => {
      if (z.dps) { if (isE) WZ.hurtE(t, z.dps * dt, 0, 0, true); else { t.hp -= z.dps * dt; t.flash = 0.05; if (t.hp <= 0) { t.hp = 0.0001; WZ.hurtH(t, 1); } } }
      if (isE && z.slow) WZ.slowE(t, z.slow, 0.25);
    });
    WZ.ctx = null;
    if (z.t <= 0) w.zones.splice(i, 1);
  }
  w.zSlow = zs;

  // drops: fly out, then vacuum into the wizard
  w.mergeT -= dt;
  if (w.mergeT <= 0) { w.mergeT = 0.25; WZ.mergeGems(); }
  for (let i = w.drops.length - 1; i >= 0; i--) {
    const dr = w.drops[i];
    dr.t += dt;
    const ex = w.x - dr.x, ey = w.y - dr.y, d = Math.hypot(ex, ey);
    if (dr.t < 0.45) {   // fly out, but never into water
      const nx = dr.x + dr.vx * dt, ny = dr.y + dr.vy * dt;
      if (!WZ.wet(nx, ny)) { dr.x = nx; dr.y = ny; }
      dr.vx *= 0.93; dr.vy *= 0.93;
    }
    if (dr.pulse > 0) dr.pulse -= dt;
    const vac = dr.kind === 'shard' || dr.kind === 'core' ? WZ.vacuum() * 2.5 : WZ.vacuum();   // shards and Cores are precious: they come to you
    if (dr.t > 0.3 && d < vac) {
      const sp2 = 7 + (vac - d) * 7;
      dr.x += ex / (d || 1) * sp2 * dt; dr.y += ey / (d || 1) * sp2 * dt;
      dr.mag = true;
    }
    if (d < 0.45 && dr.t > 0.3) {
      if (dr.kind === 'xp') { G.xp += dr.val; G.stats.xpEarned += dr.val; w.run.xp += dr.val; AU.sfx(dr.val >= CFG.bigGem.tiers[1] ? 'gemBig' : 'gem'); if (dr.val >= CFG.bigGem.tiers[1]) WZ.num(w.x, w.y, '+' + dr.val, '#7be0ff'); }
      else if (dr.kind === 'core') { G.stock.core += dr.val; AU.sfx('chest'); WZ.icon(w.x, w.y, 'core'); FA.pileIn('core'); UI.changed(); }
      else if (ELEM[dr.kind]) {   // a recycled packet rides home and lands beside the Spell Portal
        const p = FA.portal('spell'); FA.dropAt(dr.kind, p.x - 0.6, p.y + 2.6); FA.ipop(p.x + 0.5, p.y + 1.8, [[dr.kind]]); AU.sfx('el_' + dr.kind); WZ.icon(w.x, w.y, dr.kind);
      }
      else if (dr.kind === 'shard') { G.stock.shard += dr.val; w.run.shards += dr.val; G.stats.shards = (G.stats.shards || 0) + dr.val; AU.sfx('shard'); WZ.icon(w.x, w.y, 'shard'); FA.pileIn('shard'); UI.changed(); }
      else { G.stock[dr.kind] += dr.val; w.run.harvested += dr.val; G.stats.harvested += dr.val; AU.sfx('pickup'); WZ.icon(w.x, w.y, dr.kind); FA.pileIn(dr.kind); }
      w.drops.splice(i, 1);
    } else if (dr.t > 120 && dr.kind !== 'shard' && dr.kind !== 'core') w.drops.splice(i, 1);
  }
};
