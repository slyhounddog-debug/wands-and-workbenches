'use strict';
// Wizard-side logic: terrain, landmarks, harvestables, enemies (biome foes, elites, the Chimera), spells (cast when the
// factory delivers), drops, roll-dodge, and the flow field monsters use to walk around water.
const WZ = {};
// Terrain classes: normal speed (most), slow (T_BOG), impassable (T_POND). Paths over water act as bridges.
const T_GRASS = 0, T_DIRT = 1, T_SAND = 2, T_FLOWER = 3, T_DARK = 4, T_POND = 5, T_PATH = 6, T_BOG = 7;
const T_ICE = 8, T_WALL = 9;   // temporary terrain from spells (G.w.tmod): Flash Frost ice (full speed, even over water), Earth Wall blocks (impassable)
// scorched ground hurts and slows (the Emberward Cloak walks it unharmed), a chasm can't be entered (the Gale Circlet's blink crosses it); T_VINE comes from
// G.w.tmod too: a vine tangle blocks everyone but a Wizard in the Bogwalker Shroud. Cracked rock is a tmod 'rock' (impassable, T_WALL) until a Gust breaks it
const T_SCORCH = 10, T_CHASM = 11, T_VINE = 12;
// decor that leans when a body pushes through it (G.w.bend)
const BENDY = new Set(['tuft', 'tuft2', 'tuft3', 'flower0', 'flower1', 'flower2', 'flower3', 'reeds'].concat(SHRUB_NAMES));
// which plain shrub grows at a spot: shape, size and colour come from a hash of the position (no RNG, so nothing else in the world moves); the colours follow the ground
WZ.shrubAt = function (x, y, t) {
  const h = ((Math.floor(x * 13.7) * 73856093) ^ (Math.floor(y * 17.3) * 19349663)) >>> 0;
  const pals = t === T_DARK ? [1, 4, 0, 1] : t === T_FLOWER ? [2, 3, 0, 2] : [0, 2, 1, 0];
  return 'sh_' + (h % 3) + ((h >> 4) % 3) + pals[(h >> 8) % 4];
};
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
// The harvestables and forage spots are static layout (regenerated from the seed) plus a little state that changes in play: hp, broken, respawn timer, hit flash,
// dig progress. That state lives in G.w (sparse: G.w.hv / G.w.fg, keyed by the node's id, only for nodes that differ from fresh), so a snapshot sees it;
// the module objects read and write it through these accessors, so the rest of the code still says h.hp, o.broken, ...
WZ.nodeProps = function (o, store, defs) {
  for (const key in defs) {
    const dflt = typeof defs[key] === 'function' ? defs[key] : () => defs[key];
    Object.defineProperty(o, key, {
      enumerable: true, configurable: true,
      get() { const st = G && G.w && G.w[store], e = st && st[o.id]; return e && key in e ? e[key] : dflt(o); },
      set(v) { const st = G.w[store]; let e = st[o.id]; if (!e) { if (v === dflt(o)) return; e = st[o.id] = {}; } e[key] = v; },
    });
  }
};
const FORAGE_STATE = { prog: 0, lastT: 0, broken: false, respawn: 0, shake: 0 };
WZ.generate = function () {
  const WW = CFG.WW, WH = CFG.WH;
  // a small flat palette per terrain (8-bit look): 8 shade slots, but only 3 distinct steps
  const base = [[102, 52, 58], [32, 38, 52], [46, 55, 72], [108, 55, 62], [118, 40, 42], [205, 65, 56], [34, 35, 60], [70, 32, 34], [0, 0, 50], [0, 0, 50], [10, 38, 14], [262, 40, 7]];   // 8 and 9 are the virtual ice / wall types (never stored in the terrain)
  WZ.palette = [];
  for (let t = 0; t < 12; t++) for (let s = 0; s < 8; s++) {
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
  const hostile = t => t === T_POND || t === T_SCORCH || t === T_CHASM;   // nothing grows or is placed on these
  // landmarks first, so decor and harvestables keep clear of them
  const M = CFG.marks;
  WZ.marks = [];
  // the one Stronghold goes in first (its own RNG picks its element and its quadrant), so every other landmark can keep clear of the approach terrain carved round it
  const rk = rngMaker(77123), K = CFG.strong, kel = ELEMS[Math.floor(rk() * 4)];
  [kel].forEach((el) => {   // minDist..minDist+22 tiles from the spawn, never beside water
    const i = Math.floor(rk() * 4);
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
  const placeMarks = (type, n, minD) => {
    for (let tries = 0, c = 0; c < n && tries < 5000; tries++) {
      const x = Math.floor(6 + r() * (WW - 12)) + 0.5, y = Math.floor(6 + r() * (WH - 12)) + 0.5;
      if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < minD || WZ.marks.some(m => Math.hypot(m.x - x, m.y - y) < (m.type === 'stronghold' ? K.gate[m.el].r1 + 5 : M.spacing))) continue;   // a keep's approach terrain stays clear
      let dry = true;
      for (let dy = -2; dy <= 2 && dry; dy++) for (let dx = -2; dx <= 2; dx++) if (tyAt(x + dx, y + dy) === T_POND) { dry = false; break; }
      if (!dry) continue;
      const m = { id: WZ.marks.length, type, x, y };
      if (type === 'shrine') m.el = ELEMS[c % 4];
      WZ.marks.push(m); add({ x, y, lm: m }); c++;
    }
  };
  placeMarks('camp', M.camps, 16); placeMarks('shrine', M.shrines, 22); placeMarks('crypt', M.crypts, 40);
  // ---- the approach terrain of every keep, and the free-standing hazards: carved into the terrain before any decor so nothing grows in them ----
  // cracked rock and vine tangles are G.w.tmod entries (WZ.fresh puts them back each expedition); loose boulders are G.w.boulders
  WZ.rockTiles = []; WZ.vineTiles = []; WZ.boulderSpots = []; WZ.gates = [];
  const solid = new Set(), WWd = WW;
  const setT = (tx, ty, t) => { ter[ty * WWd + tx] = t * 8 + Math.floor(hash2(tx, ty, 9) * 8); };
  const inb = (tx, ty) => tx >= 2 && ty >= 2 && tx < WW - 2 && ty < WH - 2;
  const each = (cx, cy, rr, fn) => { for (let ty = Math.floor(cy - rr); ty <= Math.ceil(cy + rr); ty++) for (let tx = Math.floor(cx - rr); tx <= Math.ceil(cx + rr); tx++) if (inb(tx, ty)) fn(tx, ty, Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy)); };
  const rock = (tx, ty) => { const i = ty * WWd + tx; if (!solid.has(i)) { solid.add(i); WZ.rockTiles.push(i); } };
  for (const m of WZ.marks) {
    if (m.type !== 'stronghold') continue;
    const g = K.gate[m.el], ang = Math.atan2(SPAWN.y - m.y, SPAWN.x - m.x), gate = { id: m.id, el: m.el, kind: g.kind, ang };
    each(m.x, m.y, g.r1 + 1, (tx, ty, d) => {
      if (d < g.r0) { if ((ter[ty * WWd + tx] >> 3) === T_POND) setT(tx, ty, T_GRASS); return; }   // inside the ring: dry land (an island, for the moat)
      if (d > g.r1) return;
      if (g.kind === 'moat') setT(tx, ty, T_POND);
      else if (g.kind === 'scorch') setT(tx, ty, T_SCORCH);
      else if (g.kind === 'chasm') setT(tx, ty, T_CHASM);
      else { if ((ter[ty * WWd + tx] >> 3) === T_POND) setT(tx, ty, T_GRASS); rock(tx, ty); }
    });
    if (g.kind === 'chasm') {   // a bridge came across the chasm towards the spawn: both ends stand at the lips, the middle is gone
      each(m.x, m.y, g.r1 + 3, (tx, ty, d) => {
        const along = (tx + 0.5 - m.x) * Math.cos(ang) + (ty + 0.5 - m.y) * Math.sin(ang), side = -(tx + 0.5 - m.x) * Math.sin(ang) + (ty + 0.5 - m.y) * Math.cos(ang);
        if (along > 0 && Math.abs(side) < 1.4 && ((d > g.r1 && d < g.r1 + 3) || (d < g.r0 && d > g.r0 - 2))) setT(tx, ty, T_PATH);
      });
      gate.bridge = [{ x: m.x + Math.cos(ang) * (g.r1 + 0.5), y: m.y + Math.sin(ang) * (g.r1 + 0.5) }, { x: m.x + Math.cos(ang) * (g.r0 - 0.5), y: m.y + Math.sin(ang) * (g.r0 - 0.5) }];
    }
    WZ.gates.push(gate);
  }
  const rf = rngMaker(92929), H = CFG.aug.fields, awayFrom = (x, y, rr) => Math.hypot(x - SPAWN.x, y - SPAWN.y) > 28 && !WZ.marks.some(m => Math.hypot(m.x - x, m.y - y) < (m.type === 'stronghold' ? 34 : rr + 5));
  const spot = rr => { for (let t = 0; t < 400; t++) { const x = 12 + rf() * (WW - 24), y = 12 + rf() * (WH - 24); if (awayFrom(x, y, rr)) return [x, y]; } return null; };
  for (let n = 0; n < H.scorch; n++) {   // lava fields
    const s = spot(8), rr = 4 + rf() * 3, sd = Math.floor(rf() * 99);
    if (s) each(s[0], s[1], rr + 1.5, (tx, ty, d) => { if (d < rr * (0.78 + 0.5 * vnoise(tx * 0.5, ty * 0.5, sd))) setT(tx, ty, T_SCORCH); });
  }
  for (let n = 0; n < H.chasm; n++) {   // rifts: long cracks about 3 tiles wide (a blink crosses them)
    const s = spot(16), a = rf() * Math.PI, len = 16 + rf() * 10;
    if (s) each(s[0], s[1], len / 2 + 2, (tx, ty) => {
      const dx = tx + 0.5 - s[0], dy = ty + 0.5 - s[1], al = dx * Math.cos(a) + dy * Math.sin(a), sd = -dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(al) < len / 2 && Math.abs(sd) < 1.5 * (1 - Math.pow(Math.abs(al) / (len / 2), 3) * 0.6)) setT(tx, ty, T_CHASM);
    });
  }
  for (let n = 0; n < H.rocks; n++) {   // walls of cracked rock to break through
    const s = spot(14), a = rf() * Math.PI, len = 12 + rf() * 8;
    if (s) each(s[0], s[1], len / 2 + 2, (tx, ty) => {
      const dx = tx + 0.5 - s[0], dy = ty + 0.5 - s[1], al = dx * Math.cos(a) + dy * Math.sin(a), sd = -dx * Math.sin(a) + dy * Math.cos(a);
      const t0 = ter[ty * WWd + tx] >> 3;
      if (Math.abs(al) < len / 2 && Math.abs(sd) < 1.1 && t0 !== T_POND && t0 !== T_SCORCH && t0 !== T_CHASM) rock(tx, ty);
    });
  }
  for (let n = 0, tries = 0; n < H.vines && tries < 4000; tries++) {   // vine tangles knotted over the bog
    const x = 12 + rf() * (WW - 24), y = 12 + rf() * (WH - 24);
    if ((ter[Math.floor(y) * WW + Math.floor(x)] >> 3) !== T_BOG || !awayFrom(x, y, 4)) continue;
    n++;
    each(x, y, 3, (tx, ty, d) => { if (d < 2.4 && (ter[ty * WWd + tx] >> 3) === T_BOG && !solid.has(ty * WWd + tx)) { solid.add(ty * WWd + tx); WZ.vineTiles.push(ty * WWd + tx); } });
  }
  const boulderOk = (x, y) => awayFrom(x, y, 3) && !solid.has(Math.floor(y) * WW + Math.floor(x)) && [T_GRASS, T_PATH, T_DIRT, T_SAND, T_FLOWER, T_DARK].indexOf(ter[Math.floor(y) * WW + Math.floor(x)] >> 3) >= 0;
  for (let n = 0, tries = 0; n < H.boulders && tries < 4000; tries++) {   // loose boulders on the roadside
    const x = 6 + rf() * (WW - 12), y = 6 + rf() * (WH - 12);
    if (WZ.pathDist(x, y) < 1.4 && boulderOk(x, y)) { WZ.boulderSpots.push({ x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 }); n++; }
  }
  const nearMark = (x, y) => WZ.marks.some(m => Math.abs(m.x - x) < 3 && Math.abs(m.y - y) < 3) || solid.has(Math.floor(y) * WW + Math.floor(x));
  for (const g of WZ.gates) if (g.bridge) for (const b of g.bridge) add({ x: b.x, y: b.y, spr: 'bridge_end', deco: true });   // the stumps of the broken bridge
  for (let i = 0; i < 9000; i++) {
    const x = 1 + r() * (WW - 2), y = 1 + r() * (WH - 2), t = tyAt(x, y), roll = r();
    if (hostile(t) || Math.hypot(x - SPAWN.x, y - SPAWN.y) < 3 || nearMark(x, y)) continue;
    let spr = null;
    if (t === T_FLOWER) { if (roll < 0.55) spr = 'flower' + Math.floor(r() * 4); }
    else if (t === T_GRASS || t === T_DARK) {
      if (roll < 0.30) spr = 'tuft'; else if (roll < 0.34) spr = WZ.shrubAt(x, y, t);
      else if (t === T_DARK && roll < 0.38) spr = 'shrooms'; else if (roll < 0.345) spr = 'pebbles';
      else if (roll > 0.97) spr = 'flower' + Math.floor(r() * 4);
    } else if (t === T_SAND || t === T_DIRT) { if (roll < 0.15) spr = 'pebbles'; }
    else if (t === T_BOG) { if (roll < 0.4) spr = 'reeds'; }
    if (spr) add({ x, y, spr, deco: true });
  }
  for (let i = 0; i < 90; i++) {   // fences / lanterns / signposts along the paths
    const x = 4 + r() * (WW - 8), y = 4 + r() * (WH - 8);
    if (WZ.pathDist(x, y) > 2.6 || WZ.pathDist(x, y) < 1.8 || hostile(tyAt(x, y)) || nearMark(x, y)) continue;
    const roll = r();
    add({ x, y, spr: roll < 0.6 ? 'fence' : roll < 0.85 ? 'lantern' : 'sign', deco: true });
  }
  for (let i = 0; i < 160; i++) {   // ruined pillars + crystal clusters far from spawn
    const x = 4 + r() * (WW - 8), y = 4 + r() * (WH - 8);
    if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 28 || hostile(tyAt(x, y)) || nearMark(x, y)) continue;
    add({ x, y, spr: r() < 0.5 ? 'pillar' : 'crystals', deco: true });
  }
  WZ.harv = [];
  for (const k of ['tree', 'rock', 'ore']) {
    for (let c = 0; c < CFG.harvest[k].count;) {
      const x = 2 + r() * (WW - 4), y = 2 + r() * (WH - 4);
      if (hostile(tyAt(x, y)) || tyAt(x, y) === T_BOG || Math.hypot(x - SPAWN.x, y - SPAWN.y) < CFG.world.minSpawnDist || nearMark(x, y)) continue;
      const def = CFG.harvest[k];
      const h = { id: WZ.harv.length, x, y, kind: k, maxHp: def.hp, harv: true };
      WZ.nodeProps(h, 'hv', { hp: o => o.maxHp, broken: false, respawn: 0, flash: 0, surf: undefined });
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
      const o = { id: WZ.forage.length, x, y, kind: k, forage: true };
      WZ.nodeProps(o, 'fg', FORAGE_STATE);
      WZ.forage.push(o); add(o); c++;
    }
  }
  // buried caches: invisible forage spots that only glint for a Wizard in the Kilnsight Mask (their own RNG too)
  const rc = rngMaker(8181), CC = CFG.forage.cache;
  for (let c = 0, tries = 0; c < CC.count && tries < 20000; tries++) {
    const x = 2 + rc() * (WW - 4), y = 2 + rc() * (WH - 4);
    if ([T_GRASS, T_DIRT, T_SAND, T_DARK, T_FLOWER].indexOf(tyAt(x, y)) < 0 || Math.hypot(x - SPAWN.x, y - SPAWN.y) < 6 || nearMark(x, y)) continue;
    const o = { id: WZ.forage.length, x, y, kind: 'cache', forage: true, hidden: true };
    WZ.nodeProps(o, 'fg', FORAGE_STATE);
    WZ.forage.push(o); add(o); c++;
  }
  // extra grass tufts all over (their own RNG, so nothing above moved): they lean as the Wizard and big foes push through them
  const rt = rngMaker(51515);
  for (let i = 0; i < CFG.bend.tufts; i++) {
    const x = 1 + rt() * (WW - 2), y = 1 + rt() * (WH - 2), t = tyAt(x, y), roll = rt();
    if (hostile(t) || t === T_PATH || t === T_SAND || Math.hypot(x - SPAWN.x, y - SPAWN.y) < 2 || nearMark(x, y)) continue;
    add({ x, y, spr: t === T_BOG ? (roll < 0.5 ? 'reeds' : 'tuft3') : roll < 0.45 ? 'tuft2' : roll < 0.8 ? 'tuft' : 'tuft3', deco: true });
  }
  // more plain shrubs on top of the ones above (also their own RNG)
  const rs = rngMaker(61616);
  for (let i = 0; i < CFG.bend.shrubs; i++) {
    const x = 1 + rs() * (WW - 2), y = 1 + rs() * (WH - 2), t = tyAt(x, y);
    if (t !== T_GRASS && t !== T_DARK && t !== T_FLOWER) continue;
    if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 3 || nearMark(x, y)) continue;
    add({ x, y, spr: WZ.shrubAt(x, y, t), deco: true });
  }
};

// ---------- run state ----------
WZ.maxHp = () => CFG.wizard.hp + CFG.upgrade.hearty * lvl('hearty');
// the tree's WIZARD branch (numbers only: his verbs come from garments)
WZ.rollCd = () => CFG.wizard.rollCd * (1 - CFG.upgrade.slippery * lvl('slippery'));   // Slippery: shorter roll cooldown
WZ.harvMul = () => 1 + CFG.upgrade.harvest * lvl('harvest');   // Harvest Strength: every spell hits trees, rocks and ore harder
WZ.remedy = k => (k === 'potion' || k === 'elixir' ? 1 + CFG.upgrade.remedies * lvl('remedies') : k === 'armor' || k === 'plate' ? 1 + CFG.upgrade.wardwoven * lvl('wardwoven') : 1);   // Remedies (healing) / Wardwoven (armor)
// a spell's numbers as cast: the four basic spells get Mighty Elements' bonus on damage and knockback
WZ.spellS = function (spell) {
  const S = CFG.spells[spell], m = 1 + CFG.upgrade.mighty * lvl('mighty');
  if (BASICS.indexOf(spell) < 0 || m === 1) return S;
  const o = Object.assign({}, S);
  for (const k of ['dmg', 'splash', 'push', 'bonk']) if (o[k]) o[k] = S[k] * m;
  o.mk = m;
  return o;
};
// his walking speed: the tree's Zoomies, the wand's Flame Trail (+15% while it lasts) and Statue (-20% while he is stone)
WZ.speed = () => { const w = G && G.w; return CFG.wizard.speed * (1 + CFG.upgrade.zoomies * lvl('zoomies')) * (w && w.fireT > 0 ? 1 + CFG.wand.fire.speed : 1) * (w && w.statT > 0 ? CFG.wand.earth.speedMul : 1); };
WZ.tile = (x, y) => {
  if (x < 0 || y < 0 || x >= CFG.WW || y >= CFG.WH) return T_POND;
  const i = Math.floor(y) * CFG.WW + Math.floor(x), w = G && G.w;
  if (w && w.tmodN) { const m = w.tmod[i]; if (m) return m.k === 'ice' ? T_ICE : m.k === 'vine' ? T_VINE : T_WALL; }
  return WZ.terrain[i] >> 3;
};
// what the Wizard's gear lets him step on (set only while HE moves, see WZ.slideW): Tide-Walking Boots = water, Bogwalker Shroud = vine tangles
WZ.pass = { water: false, vine: false };
WZ.wet = (x, y) => { const t = WZ.tile(x, y); return t === T_POND ? !WZ.pass.water : t === T_VINE ? !WZ.pass.vine : t === T_WALL || t === T_CHASM; };   // can't be entered
// ---------- terrain spells: Earth Wall blocks and Flash Frost ice live in G.w.tmod (tile index -> { k, t, dur }) ----------
WZ.flowDirty = () => { if (WZ.flow) WZ.flow.cx = -1; WZ.flowCd = 0; };   // monsters re-path round the new terrain
WZ.setT = function (i, k, t) {
  const w = G.w, m = w.tmod[i];
  if (m) { if (m.k === k) m.t = Math.max(m.t, t); return false; }
  w.tmod[i] = { k, t, dur: t }; w.tmodN++;
  WZ.flowDirty();
  return true;
};
// an Earth Wall: a line of blocks across (nx, ny) centred on (cx, cy), never on water or on top of the Wizard; foes caught in it are shoved out
WZ.wall = function (cx, cy, nx, ny, S) {
  const w = G.w, WW = CFG.WW;
  let n = 0;
  for (let s = -S.len / 2; s <= S.len / 2; s += 0.35) {
    const tx = Math.floor(cx - ny * s), ty = Math.floor(cy + nx * s);
    if (tx < 1 || ty < 1 || tx >= WW - 1 || ty >= CFG.WH - 1) continue;
    const i = ty * WW + tx;
    if ((WZ.terrain[i] >> 3) === T_POND || (Math.abs(w.x - tx - 0.5) < 1.1 && Math.abs(w.y - ty - 0.5) < 1.1)) continue;
    if (WZ.setT(i, 'wall', S.t)) { n++; WZ.puff(tx + 0.5, ty + 0.5, '#8a6a3c', 3); }
  }
  for (const e of w.enemies) if (!e.dead && !e.fly && WZ.blocked(e.x, e.y, 0.3)) { e.kx += nx * 9; e.ky += ny * 9; }
  if (n) { w.shake = Math.max(w.shake, 0.3); AU.sfx('wall'); }
  return n;
};
// Flash Frost: bog and water within r turn to ice for t seconds (full speed, and water can be walked on)
WZ.freeze = function (x, y, r, t) {
  const WW = CFG.WW;
  let n = 0;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
    if (tx < 0 || ty < 0 || tx >= WW || ty >= CFG.WH || Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > r) continue;
    const i = ty * WW + tx, b = WZ.terrain[i] >> 3;
    if ((b === T_BOG || b === T_POND) && WZ.setT(i, 'ice', t)) n++;
  }
  return n;
};
WZ.tmodTick = function (dt) {
  const w = G.w, WW = CFG.WW;
  if (!w.tmodN) return;
  for (const k in w.tmod) {
    const m = w.tmod[k];
    if ((m.t -= dt) > 0) continue;
    const i = +k, x = i % WW + 0.5, y = Math.floor(i / WW) + 0.5;
    if (m.k === 'ice' && (WZ.terrain[i] >> 3) === T_POND && Math.abs(w.x - x) < 1.3 && Math.abs(w.y - y) < 1.3) { m.t = 0.5; continue; }   // never melts under his feet
    delete w.tmod[k]; w.tmodN--; WZ.flowDirty();
    if (m.k === 'wall') WZ.puff(x, y, '#8a6a3c', 4); else WZ.puff(x, y, '#bfe9ff', 2);
  }
};
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
  // cracked rock and vine tangles stand in G.w.tmod from the start of every expedition (they never expire; a Gust breaks the rock), loose boulders in G.w.boulders
  const tmod = {};
  let tmodN = 0;
  for (const i of WZ.rockTiles || []) { tmod[i] = { k: 'rock', t: 1e9, dur: 1e9 }; tmodN++; }
  for (const i of WZ.vineTiles || []) { tmod[i] = { k: 'vine', t: 1e9, dur: 1e9 }; tmodN++; }
  return {
    x: SPAWN.x, y: SPAWN.y, hp: WZ.maxHp(), armor: 0, fx: 1, fy: 1, sx: 0, sy: 0, mines: [], booms: [], eidN: 0, vx: 0, vy: 0, target: null,
    roll: 0, rollCd: 0, rdx: 0, rdy: 0, hurtT: 0, moving: false, bob: 0, shake: 0, ghosts: [],
    enemies: [], allies: [], aq: [], proj: [], eproj: [], aproj: [], zones: [], fx_: [], drops: [], timers: [], pickups: [],
    time: 0, spawnT: 1.5, kills: 0, dead: false, deadHandled: false, ready: { B: false, W: false }, boss: null, seen: {}, surge: null, bloom: 0, eggT: 0, mergeT: 0, zSlow: 0, slowT: 0, slowAmt: 0,
    fireT: 0, invisT: 0, statT: 0, statHits: 0, ride: null, sg: null, shrines: {},   // the wand's clocks (js/wand.js): Flame Trail speed, Vanishing Puff, Statue (and the hits it took), Riding Wave; the shrine ring game and the shrine buffs running
    bsw: [],   // the shockwaves of Battery Shrines arriving (js/bshrine.js)
    wheel: null, emote: null, stk: null,   // the emote wheel while it is up, the dance he is doing, the sticker the Builder sees (js/emote.js)
    cine: null, rit: 0, quake: 0, altarFlash: 0,   // the Altar's landing cinematic, the Chimera ritual countdown, the world shake after the impact, the flash when a spell hits it
    hv: {}, fg: {},   // harvestable / forage node state (see WZ.nodeProps)
    arcs: [], decals: [], bend: {}, tmod, tmodN, kick: null, jump: null,   // deliveries in flight, ground marks, leaning grass, spell terrain, recoil, geyser jump
    boulders: (WZ.boulderSpots || []).map(b => ({ x: b.x, y: b.y, vx: 0, vy: 0 })), blink: null, glowT: 0, scorchT: 0,   // loose boulders, the Circlet's blink, the glow-up timer, time spent on scorched ground
    lm: WZ.marks.map(() => ({ state: 'idle', t: 0, sp: 0, near: false })),
    run: { deliveries: 0, harvested: 0, dmg: 0, weak: 0, elites: 0, shards: 0, marks: 0, xp: 0, spells: {} },
    t: 0,
  };
};
// shards are precious: any still lying in the wilds when the run ends go to the Stockpile anyway (what does not fit spills onto the factory floor)
WZ.bankLooseShards = function () {
  const w = G && G.w;
  if (!w) return;
  for (const dr of w.drops) {
    if (!WZ.keepDrop(dr) || !FA.storable(dr.kind)) continue;
    G.stock[dr.kind] = (G.stock[dr.kind] || 0) + dr.val;
    if (dr.kind === 'shard') G.stats.shards = (G.stats.shards || 0) + dr.val;
  }
  w.drops = w.drops.filter(dr => !WZ.keepDrop(dr) || !FA.storable(dr.kind));
  for (const id of WZ.looseGarments()) G.stock['aug_' + id] = (G.stock['aug_' + id] || 0) + 1;   // a garment nobody walked onto goes home to the Stockpile
  w.pickups = w.pickups.filter(p => !ITEMS[p.kind].aug); w.arcs = w.arcs.filter(a => !ITEMS[a.kind].aug);
  for (const a of w.arcs) if (a.then === 'drop') G.fac.outQ.push(a.kind);   // overflow still in the air: it waits at the portal for the next expedition
  w.arcs = w.arcs.filter(a => a.then !== 'drop');
};
WZ.reenter = function () { WZ.bankLooseShards(); const hv = G.w.hv, fg = G.w.fg; G.w = WZ.fresh(); G.w.hv = hv; G.w.fg = fg; };   // the trees and spots keep their state from one expedition to the next (a new game or a load starts them fresh)

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
  if (m > 1 && !quiet && G.w.t - (G.w.weakSfxT || -1) > 0.08) { G.w.weakSfxT = G.w.t; AU.sfx('hitw', e.x, e.y); }   // a weakness hit lands heavier (a zone ticking on a crowd would otherwise chatter)
  if (!quiet) {
    e.flash = 0.12;
    const kb = e.kb !== undefined ? e.kb : e.boss ? 0.08 : e.elite ? 0.4 : 1;
    if (kx || ky) { e.kx += kx * kb; e.ky += ky * kb; }
    WZ.num(e.x, e.y, Math.round(d) + (m > 1 ? '!' : ''), m > 1 ? '#ffe36b' : m < 1 ? '#9a94b0' : d >= 40 ? '#ffd23a' : '#ffffff');
  }
  if (e.hp <= 0) { if (c && m > 1) G.stats.weakKills = (G.stats.weakKills || 0) + 1; WZ.kill(e); }
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
WZ.damage = function (d, soft) {   // armor soaks damage first. soft = burning ground: no hit-stun, shake or hurt sound
  const w = G.w;
  if (G.menu) return;   // the living menu world is a consequence-free preview: nothing can hurt the Wizard there
  if (w.jump) return;   // airborne on a geyser: nothing reaches him
  if (w.statT > 0) { d *= CFG.wand.earth.take; if (!soft) w.statHits++; }   // the Statue: stone takes 30% of it, and every hit charges the burst that ends it
  if (!soft) FA.rumble(d);   // any hit rattles the factory, harder for a bigger one
  if (!soft && d >= CFG.pressure.hit * WZ.maxHp()) FA.pressure(Math.min(1.5, d / WZ.maxHp() * 3), '#ff5a5a');   // a heavy hit shakes the factory too
  const soak = Math.min(w.armor, d);
  w.armor -= soak; d -= soak;
  if (soak > 0) WZ.num(w.x, w.y, '-' + Math.round(soak), '#9fc4ff');
  if (d > 0) { w.hp -= d; WZ.num(w.x, w.y, '-' + Math.round(d), soft ? '#ff9a3a' : '#ff6a6a'); }
  if (!soft && d > 0 && w.hp > 0) FA.shakeLoose(w.hp / WZ.maxHp());   // health lost: the factory may drop something (armor soaking the hit keeps it still)
  if (!soft) { w.hurtT = 0.35; w.shake = Math.max(w.shake, 0.35); AU.sfx(soak > 0 && d <= 0 ? 'clank' : 'hurt'); }
  if (w.hp <= 0) {
    if (WZ.phoenixSave()) return;   // the Phoenix Feather cancels death
    w.hp = 0; w.dead = true; AU.sfx('die'); WZ.puff(w.x, w.y, '#b58cff', 20);
  }
};
// a hit the roll's i-frames just swallowed: say so, so dodging feels deliberate
WZ.dodge = function () {
  const w = G.w;
  if (w.t < (w.dodgeAt || 0)) return;
  w.dodgeAt = w.t + CFG.wizard.dodgeCd;
  G.stats.dodges = (G.stats.dodges || 0) + 1;
  WZ.ring(w.x, w.y, 1.3, '#ffffff', 0.25); WZ.puff(w.x, w.y, '#bfe9ff', 6);
  AU.sfx('dodge');
};
// ---------- forage spots: mash the roll button while standing still to dig / search ----------
WZ.forageAt = function (x, y) {
  let best = null, bd = CFG.forage.reach;
  for (const o of WZ.forage) {
    if (o.broken || Math.abs(o.x - x) > 2 || Math.abs(o.y - y) > 2 || !WZ.forageSeen(o)) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
};
WZ.forageName = k => (k === 'mound' ? 'Dirt Mound' : k === 'sticks' ? 'Stick Pile' : k === 'cache' ? 'Buried Cache' : 'Berry Bush');
WZ.mash = function (o) {
  const F = CFG.forage, def = F[o.kind], w = G.w;
  o.prog += 1 + CFG.upgrade.forager * lvl('forager'); o.lastT = w.t; o.shake = 0.12; w.mashT = 0.14;   // Keen Forager: each press digs this much more
  WZ.puff(o.x, o.y, o.kind === 'mound' ? '#8a6a3c' : o.kind === 'sticks' ? '#c98a52' : o.kind === 'cache' ? '#ffd23a' : '#46b452', 3);
  AU.sfx(o.kind === 'bush' ? 'rustle' : 'dig');
  if (o.prog < def.taps) return;
  o.broken = true; o.prog = 0; o.respawn = o.kind === 'bush' ? F.bushRespawn : F.respawn;
  // Keen Forager: each tier is a +12% chance that the spot gives everything twice
  const twice = Math.random() < CFG.upgrade.forager * lvl('forager'), rounds = twice ? 2 : 1;
  if (twice) { WZ.icon(o.x, o.y - 0.4, 'ic_check'); WZ.puff(o.x, o.y, '#ffd23a', 8); }
  for (let r = 0; r < rounds; r++) {
    if (o.kind === 'cache') { const s = WZ.dryNear(o.x, o.y, 12, [0.9, 1.5]) || [o.x, o.y]; w.pickups.push({ kind: Math.random() < def.pickup ? 'elixir' : 'plate', x: s[0], y: s[1], z: 1.6, t: 0 }); }   // a pickup tumbles out of the cache as well
    if (o.kind === 'bush') {   // a pickup tumbles out of the bush: walk over it to use it
      const kind = Math.random() < def.potion ? 'potion' : 'armor', s = WZ.dryNear(o.x, o.y, 12, [0.9, 1.5]) || [o.x, o.y];
      w.pickups.push({ kind, x: s[0], y: s[1], z: 1.6, t: 0 });
    } else {
      for (const k in def.drop) for (let i = 0; i < def.drop[k]; i++) WZ.drop(k, o.x, o.y, 1);
      for (const k in def.bonus) if (Math.random() < def.bonus[k]) WZ.drop(k, o.x, o.y, 1);
    }
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
  if (h.bshr) { WZ.bshrHurt(h, d); return; }   // a Battery Shrine: the damage is charge for its Battery
  if (h.broken) return;
  h.hp -= d * WZ.harvMul(); h.flash = 0.1;
  if (h.hp <= 0) {
    h.broken = true; h.respawn = CFG.world.respawn;
    const def = CFG.harvest[h.kind];
    for (let i = 0; i < def.n; i++) WZ.drop(def.drop, h.x, h.y, 1);
    AU.sfx('kill', h.x, h.y);
  }
};
// continuous damage to a tree / rock / shrine (d is already dps x dt)
WZ.hurtHc = function (h, d) {
  if (h.bshr) { WZ.bshrHurt(h, d); return; }
  h.hp -= d * WZ.harvMul(); h.flash = 0.05;
  if (h.hp <= 0) { h.hp = 0.0001; WZ.hurtH(h, 1); }
};
WZ.kill = function (e) {
  if (e.dead || WZ.rebirth(e)) return;
  e.dead = true;
  const w = G.w, def = CFG.enemies[e.type];
  G.stats.kills++; w.kills++;
  if (WZ.ctx) {
    WZ.ctx.kills++;
    const n = WZ.ctx.el.length;   // kills by combo spells: two elements and up, three and up, the Nova
    if (n >= 2) G.stats.k2 = (G.stats.k2 || 0) + 1;
    if (n >= 3) G.stats.k3 = (G.stats.k3 || 0) + 1;
    if (n >= 4) G.stats.k4 = (G.stats.k4 || 0) + 1;
  }
  if (e.boss) { WZ.bossDown(e); return; }
  if (e.elite && !Net.on) w.hitstop = Math.max(w.hitstop || 0, e.warden ? CFG.hitstop.warden : CFG.hitstop.elite);   // hit-stop: the Wizard's side holds still for a beat (offline only: a guest's prediction would rubber-band)
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
  AU.sfx('kill', e.x, e.y);
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
  WZ.altarTouch(x, y, r);   // a player spell that reaches the Summoning Altar lights its socket
  if (G.menu) Menu.touch(x, y, r);   // ...and in the menu world a spell's reach can press the safe floor plates
  for (const e of w.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d <= r + e.rad) fn(e, d, true); }
  for (const h of WZ.harv) { if (h.broken) continue; const d = Math.hypot(h.x - x, h.y - y); if (d <= r + 0.4) fn(h, d, false); }
  for (const s of G.bshr) { const d = Math.hypot(s.x - x, s.y - y); if (d <= r + s.rad) fn(s, d, false); }   // the Battery Shrines
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
// the Wizard's right stick as a world direction + tilt [dx, dy, 0..1], or null when it is at rest (w.sx / w.sy are set from the pad every frame)
WZ.stickAim = function () {
  const w = G.w, m = Math.hypot(w.sx || 0, w.sy || 0);
  return m > 0.3 ? [w.sx / m, w.sy / m, Math.min(1, m)] : null;
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
// ---------- the marks spells leave on the ground (CFG.spells[s].dec): burns, cracks, frost... light spells faint and short, heavy ones deep ----------
WZ.decal = function (x, y, r, dec) {
  const w = G.w, rr = Math.max(0.2, r * dec.r);
  const old = w.decals.find(o => o.k === dec.k && Math.hypot(o.x - x, o.y - y) < rr * 0.6);   // a fresh hit on the same spot renews it
  if (old) { old.t = Math.min(old.t, 0.1); old.r = Math.max(old.r, rr); return; }
  w.decals.push({ x, y, r: rr, k: dec.k, c: dec.c || null, t: 0, dur: dec.t, a: dec.a, s: hash2(Math.floor(x * 7), Math.floor(y * 7), w.decals.length + 3) });
  if (w.decals.length > CFG.decalMax) w.decals.splice(w.decals.findIndex(d => !d.perm), 1);   // (the oldest ordinary mark goes; a permanent one stays)
};
// a mark that never fades (dur is out of reach of the ageing loop): the Altar's crater
WZ.decalPerm = function (x, y, r, k, a) {
  const w = G.w;
  if (w.decals.some(d => d.perm && d.k === k)) return;
  w.decals.push({ x, y, r, k, c: null, t: 1, dur: 1e9, a, perm: true, s: hash2(Math.floor(x * 7), Math.floor(y * 7), 11) });
};
WZ.mark = (x, y, r) => { const c = WZ.ctx, S = c && CFG.spells[c.spell]; if (S && S.dec && !WZ.wet(x, y)) WZ.decal(x, y, r, S.dec); };   // the current spell's mark
// Geyser Jump: shot into the air and over water / bog to the farthest dry spot ahead (up to J.dist tiles), untouchable while airborne
WZ.launch = function (J) {
  const w = G.w, m = Math.hypot(w.fx, w.fy) || 1, ux = w.fx / m, uy = w.fy / m;
  let tx = w.x, ty = w.y;
  for (let d = J.dist; d >= J.min; d -= 0.5) {
    const x = w.x + ux * d, y = w.y + uy * d;
    if (x < 1 || y < 1 || x > CFG.WW - 1 || y > CFG.WH - 1 || WZ.blocked(x, y, CFG.wizard.radius) || WZ.tile(x, y) === T_BOG) continue;
    tx = x; ty = y; break;
  }
  w.jump = { sx: w.x, sy: w.y, tx, ty, t: 0, T: J.T, h: J.h };
  w.roll = 0; w.kick = null; w.target = null; w.rollBuf = 0;
  WZ.ring(w.x, w.y, 1.6, '#7ad0ff', 0.4); WZ.epuff(w.x, w.y, 'water', 14);
  AU.sfx('launch');
};
// grass, flowers and bushes a body pushes through lean the way it moves (G.w.bend: bucket slot -> { t, d }), then spring back (R.drawWorld)
WZ.bendAt = function (x, y, vx, vy, r) {
  const sp = Math.hypot(vx, vy);
  if (sp < 0.6) return;
  const B = CFG.bend, WW = CFG.WW, bend = G.w.bend, d = (vx - vy) / (sp * 1.414) * Math.min(1, sp / 5), reach = r + B.r;
  for (let ty = Math.floor(y - 1); ty <= Math.floor(y + 1); ty++) for (let tx = Math.floor(x - 1); tx <= Math.floor(x + 1); tx++) {
    if (tx < 0 || ty < 0 || tx >= WW || ty >= CFG.WH) continue;
    const i = ty * WW + tx, b = WZ.bucket[i];
    if (b) for (let j = 0; j < b.length && j < 32; j++) {
      const o = b[j];
      if (o.deco && BENDY.has(o.spr) && Math.hypot(o.x - x, o.y - y) < reach) bend[i * 32 + j] = { t: 0, d };
    }
  }
};
WZ.bendTick = function (dt) {
  const w = G.w, B = CFG.bend;
  for (const k in w.bend) if ((w.bend[k].t += dt) > B.life) delete w.bend[k];
  if (!w.dead && !w.jump) WZ.bendAt(w.x, w.y, w.vx, w.vy, CFG.wizard.radius);
  for (const e of w.enemies) if (!e.dead && !e.fly && !(e.fall > 0) && (e.rad >= B.bigRad || e.elite || e.boss)) WZ.bendAt(e.x, e.y, e.mvx || 0, e.mvy || 0, e.rad * (e.sz || 1));
};
// ---------- deliveries crossing the split: what the Spell Portal sends leaves the factory's top-right corner (FA.suck), then sails in from
// the wilds' top-left along a curve, its shadow sweeping over the ground (R.drawArc). On arrival a spell starts its drop-in, a pickup lands ----------
WZ.send = function (kind, then, spell) {
  const w = G.w;
  if (!w || w.dead) return;
  const a = { kind, then, spell: spell || null, t: -(CFG.suck.baseT + CFG.arc.outT), T: CFG.arc.inT, col: ITEMS[kind].color || '#ffffff', seed: Math.random() * 6.283, tx: null, ty: null };
  if (then === 'unlock') { const m = WZ.unlockTarget(kind); if (!m) return; a.mark = m.id; a.tx = m.x; a.ty = m.y; a.T = CFG.arc.inT * 1.3; }   // a Core / key sails down onto the shrine / keep it opens
  w.arcs.push(a);
};
WZ.arcTick = function (dt) {
  const w = G.w;
  if (w.dead) { for (const a of w.arcs) if (a.then === 'drop') G.fac.outQ.push(a.kind); w.arcs.length = 0; return; }   // the factory's overflow never gets lost: it goes back in the queue
  for (let i = w.arcs.length - 1; i >= 0; i--) {
    const a = w.arcs[i], was = a.t;
    a.t += dt;
    if (was < 0 && a.t >= 0) AU.sfx('whoosh');   // it comes into view at the top-left
    if ((a.then === 'pickup' || a.then === 'drop') && a.t >= 0 && a.tx === null) {   // a garment drops in like a creature (on screen, not on top of him); a potion or overflow lands beside him
      const s = (ITEMS[a.kind].aug && a.then === 'pickup' ? WZ.spawnSpot() : WZ.dryNear(w.x, w.y, 20, [1.8, 3.2])) || [w.x, w.y];
      a.tx = s[0]; a.ty = s[1];
    }
    if (a.t < a.T) continue;
    w.arcs.splice(i, 1);
    if (a.then === 'spell') WZ.incoming(a.spell);
    else if (a.then === 'unlock') WZ.unlockLand(a);
    else if (a.then === 'drop') { w.drops.push({ kind: a.kind, x: a.tx, y: a.ty, vx: 0, vy: 0, t: 0.3, val: 1, home: true, rejT: 1.5 }); WZ.ring(a.tx, a.ty, 0.9, a.col, 0.3); AU.sfx('portalDrop'); }   // the factory's overflow lies here until the Stockpile has room
    else { w.pickups.push({ kind: a.kind, x: a.tx, y: a.ty, z: 0.5, t: 0 }); WZ.ring(a.tx, a.ty, 0.9, a.col, 0.3); AU.sfx('portalDrop'); }
  }
};
WZ.explode = function (x, y, r, dmg, col, skip, kb) {
  WZ.mark(x, y, r);
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
    const e = WZ.nearest(px, py, range || 12, hit), al = WZ.altarChainTarget(px, py, range || 12);
    if (al && (!e || Math.hypot(al.x - px, al.y - py) < Math.hypot(e.x - px, e.y - py))) { hit.push(al); pts.push([al.x, al.y]); px = al.x; py = al.y; WZ.altarHit(WZ.ctx); continue; }   // the bolt arcs to the Altar
    if (!e) break;
    hit.push(e); pts.push([e.x, e.y]); px = e.x; py = e.y;
    WZ.mark(e.x, e.y, 1);
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
  if (G.menu) Menu.spellName(spell);   // the menu world toasts the name of every spell that fires
  WZ.wandCharge(spell);   // the staff trickle-charges: one tick for each element in the spell (js/wand.js)
  // it bursts at his feet, and the Spell Portal back in the factory feels it (harder for higher tiers)
  w.fx_.push({ type: 'arrive', x: px, y: py, col: SPELL_COL[spell] || '#fff', t: 0, dur: combo ? 0.4 : 0.3, big: combo });
  if (combo) {
    w.shake = Math.max(w.shake, 0.25);
    w.fx_.push({ type: 'title', x: px, y: py, text: SPELLS[spell].toUpperCase() + '!', col: SPELL_COL[spell], t: 0, dur: 1.2 });
  }
  FA.thump(Math.max(1, ctx.el.length), SPELL_COL[spell] || '#ffffff');
  ctx.el.forEach(el => WZ.epuff(px, py, el, combo ? 6 : 8));
  WZ.ctx = ctx;
  const S = WZ.spellS(spell), a = WZ.aim(), sid = Math.floor(Math.random() * 1e9);
  switch (spell) {
    case 'gust':   // a cyclone: three spinning pulses grow out of him; foes flung into each other bonk
      AU.sfx('zap_air');
      for (let i = 0; i < S.pulses; i++) WZ.later(i * S.gap, () => WZ.gustPulse(G.w.x, G.w.y, S.r * (i + 1) / S.pulses, S, i === S.pulses - 1));
      break;
    case 'fireball':   // small, very fast, and it homes in (WZ.projSpecial)
      AU.sfx('zap_fire');
      WZ.proj({ vx: a[0] * S.speed, vy: a[1] * S.speed, life: S.life, dmg: S.dmg, splash: S.splash, sr: S.sr, col: '#ff7a30', kind: 'fire', size: 5, r: 0.45, home: S.turn, seek: S.seek, trT: 0 });
      break;
    case 'spray':   // a crescent wave that rolls out and carries what it catches
      AU.sfx('zap_water');
      w.hp = Math.min(WZ.maxHp(), w.hp + S.heal);
      WZ.proj({ x: px + a[0] * 0.6, y: py + a[1] * 0.6, vx: a[0] * S.speed, vy: a[1] * S.speed, life: S.life, dmg: S.dmg, slow: S.slow, slowT: S.slowT, push: S.push, mk: S.mk, w: S.w, col: '#4aa8ff', kind: 'wave', size: 6, r: 0.7, sid, trT: 0 });
      break;
    case 'boulder':   // it bounces: every landing crushes what is round it
      AU.sfx('zap_earth');
      WZ.proj({ vx: a[0] * S.speed, vy: a[1] * S.speed, life: 30, dmg: S.dmg, sr: S.sr, push: S.push, col: '#8a6a3c', kind: 'boulder', size: 9, r: 0.75, hops: S.hops, h0: S.hops, hop: S.hop, ht: 0, n: 0 });
      break;
    case 'flamethrower':   // a stream of fire out in front of him for S.t seconds (it follows his aim)
      AU.sfx('zap_fire');
      WZ.zone({ kind: 'flame', follow: true, r: S.range, t: S.t, dps: S.dps, half: S.half, ax: a[0], ay: a[1], col: '#ff9a2b', trT: 0, snd: 0 });
      break;
    case 'steam':   // a mine is lobbed a short way along the aim and sits dormant (WZ.mineTick)
      AU.sfx('zap_combo');
      WZ.layMine(px, py, a, S);
      break;
    case 'sandstorm':   // a boomerang thrown in an arc along the aim: out, back to where he stands, a catch throws a smaller one (WZ.boomTick)
      AU.sfx('zap_air');
      WZ.throwBoom(px, py, a, S, ctx);
      break;
    case 'magma': {   // lobbed high onto the thickest crowd
      AU.sfx('zap_fire');
      const tg = WZ.crowdAt(px, py, S.range, S.sr) || [px + a[0] * 6, py + a[1] * 6];
      WZ.lob('magma', px, py, tg[0], tg[1], S.flight, 3.4, 10, '#ff4a1a');
      break;
    }
    case 'tempest':   // a controllable water droplet: it joins the fan of live ones (WZ.zoneSpecial 'tear'), its own clock running
      AU.sfx('zap_water');
      WZ.zone({ kind: 'tear', x: px, y: py, r: S.r, t: S.life, col: '#4fc3ff', trT: 0, spd: WZ.tearSpeed(S) });
      WZ.epuff(px, py, 'water', 6);
      break;
    case 'mud': {   // blue / brown orbs circle him; each goes off on the first foe it touches (WZ.zoneSpecial 'mshield')
      AU.sfx('zap_earth');
      const orbs = [];
      for (let i = 0; i < S.orbs; i++) orbs.push(i / S.orbs * 6.283);
      WZ.zone({ kind: 'mshield', follow: true, r: S.orbitR + 0.6, t: S.t, orbs, ang: 0, col: '#8a5a2a' });
      WZ.puff(px, py, '#6e4a2a', 8); WZ.epuff(px, py, 'water', 6); WZ.epuff(px, py, 'earth', 6);
      break;
    }
    case 'meteor': {   // ONE huge meteor on the thickest crowd; it shatters into fragments
      AU.sfx('zap_combo');
      const al = WZ.altarChainTarget(px, py, S.range), tg = al ? [al.x, al.y] : WZ.crowdAt(px, py, S.range, S.r) || [px + a[0] * 6, py + a[1] * 6];
      WZ.lob('meteor', tg[0] + 1.2, tg[1] - 1.2, tg[0], tg[1], S.fall, 14, 16, '#ff7a30', true);
      break;
    }
    case 'thunder':   // a storm cloud hangs over him and calls bolts down
      AU.sfx('zap_combo');
      WZ.zone({ kind: 'storm', follow: true, r: S.range, t: S.t, zt: 0.08, col: '#fff27a' });
      break;
    case 'blizzard':
      AU.sfx('zap_combo');
      WZ.mark(px, py, S.r);
      WZ.zone({ kind: 'blizzard', r: S.r, t: S.t, dps: S.dps, slow: S.slow, follow: true, col: '#dff4ff', frost: S.frost.every, fk: S.frost.every, it: 0 });   // keeps freezing round him while it rages
      if (WZ.freeze(px, py, S.r, S.frost.t)) AU.sfx('freeze');   // Flash Frost: bog and water turn to ice
      break;
    case 'geyser':   // waves of eruptions: the nearest foes first, then random ones (WZ.geyserWave); he stays on the ground
      AU.sfx('zap_water');
      for (let k = 0; k < S.waves; k++) WZ.later(k * S.waveGap, () => WZ.geyserWave(k, S));
      break;
    case 'nova': {   // everything within pullR is hauled in and everything within r zapped, then it bursts (WZ.zoneSpecial 'novapull' -> WZ.novaBurst)
      AU.sfx('zap_combo');
      w.fx_.push({ type: 'flash', x: px, y: py, col: '#ffffff', t: 0, dur: 0.3 });
      w.shake = Math.max(w.shake, 0.6);
      WZ.zone({ kind: 'novapull', follow: true, r: S.pullR, t: S.pullT, zt: 0, col: '#ffe36b' });
      break;
    }
  }
  WZ.ctx = null;
  if (spell !== 'steam' && spell !== 'sandstorm') WZ.later(1.1, () => FA.landed(ctx));   // (a mine and a boomerang report when they are spent)
};
// ---------- the spells' moving parts (all plain data in G.w.proj / G.w.zones; WZ.update calls projSpecial / zoneSpecial) ----------
// a fresh mark of the current spell's trail (or its own mark, smaller) where a moving spell passes
WZ.trail = (x, y) => { const c = WZ.ctx, S = c && CFG.spells[c.spell]; if (S && !WZ.wet(x, y)) WZ.decal(x, y, 1, S.trail || { k: S.dec.k, r: S.dec.r * 0.5, t: S.dec.t * 0.7, a: S.dec.a * 0.7, c: S.dec.c }); };
// the spot with the most foes round it within range of (x, y): the centre of that crowd, or null when nobody is in range
WZ.crowdAt = function (x, y, range, r) {
  const list = G.w.enemies.filter(e => !e.dead && !(e.fall > 0) && Math.hypot(e.x - x, e.y - y) < range);
  let best = null, bn = 0;
  for (const e of list) {
    const near = list.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < r * 1.2);
    if (near.length > bn) { bn = near.length; best = [near.reduce((s, o) => s + o.x, 0) / near.length, near.reduce((s, o) => s + o.y, 0) / near.length]; }
  }
  return best;
};
// a lobbed thing (Magma Bomb, its blobs, the meteor and its fragments): flies from (sx, sy) to (tx, ty) in T s, h tiles high (fall = drops from the sky), lands with WZ.lobLand
WZ.lob = function (sub, sx, sy, tx, ty, T, h, size, col, fall) {
  return WZ.proj({ x: sx, y: sy, kind: 'lob', sub, sx, sy, tx, ty, t: 0, T, h, size, col, fall: !!fall, life: T + 1 });
};
WZ.lobLand = function (p) {
  const S = CFG.spells[p.ctx ? p.ctx.spell : 'magma'], w = G.w, x = p.tx, y = p.ty;
  const splat = (sub, n, dist, T, h, size, col) => {
    for (let i = 0; i < n; i++) {
      const an = i / n * 6.283 + Math.random() * 0.8, d = dist[0] + Math.random() * (dist[1] - dist[0]);
      let bx = x + Math.cos(an) * d, by = y + Math.sin(an) * d;
      if (WZ.wet(bx, by)) { bx = x + Math.cos(an) * d * 0.4; by = y + Math.sin(an) * d * 0.4; }
      WZ.lob(sub, x, y, bx, by, T + Math.random() * 0.15, h, size, col);
    }
  };
  if (WZ.tile(x, y) === T_POND && !(G.w.tmod[Math.floor(y) * CFG.WW + Math.floor(x)])) { WZ.puff(x, y, '#bfe6ff', 14); AU.sfx('thud'); if (p.sub !== 'meteor') return; }   // a hiss and a splash in water
  if (p.sub === 'magma') {
    WZ.explode(x, y, S.sr, S.dmg, '#ff4a1a', null, 8);
    WZ.zone({ x, y, kind: 'lava', r: S.pool.r, t: S.pool.t, dps: S.pool.dps, col: '#ff6a1a' });
    splat('blob', S.blobs, S.blobDist, 0.45, 1.6, 5, '#ff7a30');
    w.shake = Math.max(w.shake, 0.45); AU.sfx('slam', x, y); WZ.epuff(x, y, 'fire', 14); WZ.epuff(x, y, 'earth', 8);
  } else if (p.sub === 'blob') { WZ.explode(x, y, S.blobR, S.blobDmg, '#ff7a30'); AU.sfx('hit'); }
  else if (p.sub === 'meteor') {
    WZ.explode(x, y, S.r, S.dmg, '#ff7a30', null, S.push);
    WZ.boom(x, y, S.r * 1.3, '#ffffff'); WZ.ring(x, y, S.r * 1.6, '#ffb030', 0.6);
    for (let i = 0; i < S.frags; i++) {   // the fragments are burning boulders that fly out and bounce
      const an = (i + Math.random() * 0.6) / S.frags * 6.283;
      WZ.proj({ x, y, vx: Math.cos(an) * S.fragSpeed, vy: Math.sin(an) * S.fragSpeed, life: 30, dmg: S.fragDmg, sr: S.fragR, push: 6, col: '#ff7a30', kind: 'boulder', burn: true, size: 7, r: 0.5, hops: S.fragHops, h0: S.fragHops, hop: S.fragHop * (0.9 + Math.random() * 0.3), ht: 0, n: 0, seek: S.fragSeek, turn: S.fragTurn, tid: 0 });
    }
    w.shake = Math.max(w.shake, 0.8); AU.sfx('slam', x, y); AU.sfx('thud', x, y); WZ.puff(x, y, '#d8c8a8', 24); WZ.epuff(x, y, 'fire', 16);
    WZ.bendRing(x, y, S.r * 2);
  }
};
// Cyclone Gust: one spinning pulse
WZ.gustPulse = function (x, y, r, S, last) {
  const w = G.w;
  WZ.ring(x, y, r, '#e6f8ff', 0.35);
  w.fx_.push({ type: 'swirl', x, y, r, t: 0, dur: 0.45, col: '#e6f8ff' });
  if (last) WZ.mark(x, y, r);
  WZ.each(x, y, r, (t, d, isE) => {
    const m = d || 1;
    WZ.hit(t, isE, S.dmg, isE ? (t.x - x) / m * S.push : 0, isE ? (t.y - y) / m * S.push : 0);
    if (isE && !t.boss) { t.bonk = 0.7; t.bonkDmg = S.bonk; }
  });
  WZ.bendRing(x, y, r);
  if (last) WZ.gustEffects(x, y, r);   // the Stonefist Charm: boulders shoved, cracked rock broken
};
WZ.bendRing = function (x, y, r) { const n = Math.max(6, Math.ceil(r * 5)); for (let i = 0; i < n; i++) { const an = i / n * 6.283; WZ.bendAt(x + Math.cos(an) * r, y + Math.sin(an) * r, Math.cos(an) * 6, Math.sin(an) * 6, 0.7); } };
// lazy ids, so a mine or a fragment can hold on to its foe as plain data (G has no references to enemies)
WZ.eid = e => e.id || (e.id = G.w.eidN = (G.w.eidN || 0) + 1);
WZ.byId = id => { for (const e of G.w.enemies) if (e.id === id && !e.dead) return e; return null; };
// Steam Mine: lobbed a short way along the aim (back off from water and walls), it lands and sits dormant
WZ.layMine = function (x, y, a, S) {
  const w = G.w;
  let d = S.throw, tx = x + a[0] * d, ty = y + a[1] * d;
  while (d > 1 && (WZ.wet(tx, ty) || WZ.blocked(tx, ty, 0.3))) { d -= 0.5; tx = x + a[0] * d; ty = y + a[1] * d; }
  w.mines.push({ x, y, sx: x, sy: y, tx, ty, z: 0, st: 'lob', t: 0, age: 0, tid: 0, gx: tx, gy: ty, ctx: WZ.ctx });
  while (w.mines.length > S.max) { const o = w.mines.shift(); WZ.puff(o.x, o.y, '#f4f4f8', 8); }   // the oldest pops harmlessly
};
// every mine: lob -> dormant (pulsing; a foe within wake tiles wakes it) -> wake (a fast pulse and a hop) -> fly at that foe -> burst
WZ.mineTick = function (dt) {
  const w = G.w, S = CFG.spells.steam;
  for (let i = w.mines.length - 1; i >= 0; i--) {
    const m = w.mines[i];
    m.age += dt; m.t += dt;
    if (m.st === 'lob') {
      const k = Math.min(1, m.t / S.flight);
      m.x = m.sx + (m.tx - m.sx) * k; m.y = m.sy + (m.ty - m.sy) * k; m.z = Math.sin(k * Math.PI) * S.h;
      if (k >= 1) { m.st = 'dorm'; m.t = 0; m.z = 0; WZ.puff(m.x, m.y, '#d8c8a8', 6); AU.sfx('thud'); }
    } else if (m.st === 'dorm') {
      if (m.age > S.life) { WZ.puff(m.x, m.y, '#f4f4f8', 10); w.mines.splice(i, 1); continue; }   // spent: it pops harmlessly
      let e = null, bd = S.wake;
      for (const o of w.enemies) { if (o.dead || o.fall > 0) continue; const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < bd) { bd = d; e = o; } }
      if (e) { m.st = 'wake'; m.t = 0; m.tid = WZ.eid(e); m.gx = e.x; m.gy = e.y; AU.sfx('alert'); }
    } else if (m.st === 'wake') {
      m.z = S.hopH * Math.min(1, m.t / S.wakeT);
      const e = WZ.byId(m.tid); if (e) { m.gx = e.x; m.gy = e.y; }
      if (m.t >= S.wakeT) { m.st = 'fly'; m.t = 0; }
    } else {   // fly: it commits to the foe that woke it (and to where it last saw it if that foe dies)
      const e = WZ.byId(m.tid); if (e) { m.gx = e.x; m.gy = e.y; }
      const dx = m.gx - m.x, dy = m.gy - m.y, d = Math.hypot(dx, dy) || 1, step = S.speed * dt;
      if (d <= S.hit + step * 0.5 || m.t >= S.fly) { WZ.mineBurst(m); w.mines.splice(i, 1); continue; }
      m.x += dx / d * step; m.y += dy / d * step; m.z = S.hopH * (1 - 0.4 * Math.min(1, m.t / S.fly));
      if (Math.random() < dt * 40) w.fx_.push({ type: 'spark', x: m.x, y: m.y, vx: rand(-1, 1), vy: rand(-1, 1), z: m.z * 0.7, vz: rand(0, 1.5), g: -1, col: '#ffffff', t: 0, dur: 0.4 });
    }
  }
};
// a mine goes off: scalding steam in r tiles, then a cloud that slows
WZ.mineBurst = function (m) {
  const S = CFG.spells.steam, w = G.w, x = m.x, y = m.y, c = WZ.ctx;
  WZ.ctx = m.ctx;
  WZ.explode(x, y, S.r, S.dmg, '#f4f4f8', null, S.push);
  WZ.ring(x, y, S.r, '#ffffff', 0.45);
  WZ.zone({ kind: 'steamcloud', x, y, r: S.cloud.r, t: S.cloud.t, slow: S.cloud.slow, col: '#f4f4f8' });
  for (let i = 0; i < 16; i++) { const an = i / 16 * 6.283; w.fx_.push({ type: 'spark', x, y, vx: Math.cos(an) * 9, vy: Math.sin(an) * 9, z: 0.6, vz: 2, g: -2, col: i % 2 ? '#ffffff' : '#cfe8ff', t: 0, dur: 0.6 }); }
  WZ.bendRing(x, y, S.r);
  w.shake = Math.max(w.shake, 0.35); AU.sfx('slam', x, y);
  if (m.ctx) { const mc = m.ctx; WZ.later(0.3, () => FA.landed(mc)); }
  WZ.ctx = c;
};
// Gale Boomerang: thrown along the aim from where he stands; ph 'out' (an arc), 'back' (to the catch spot tx, ty), or a one-way throw (b.one)
WZ.throwBoom = function (x, y, a, S, ctx) {
  G.w.booms.push({ x, y, ox: x, oy: y, ax: a[0], ay: a[1], ph: 'out', t: 0, k: 0, fx: x, fy: y, tx: x, ty: y, sc: 1, dmg: S.dmg, one: false, spin: 0, sid: Math.floor(Math.random() * 1e9), ctx });
};
// a boomerang's hits this frame: every foe / node it overlaps takes its damage once per leg (the token is the throw + the leg)
WZ.boomHit = function (b, px, py, leg) {
  const S = CFG.spells.sandstorm, w = G.w, r = S.r * b.sc, tok = b.sid * 4 + leg;
  let ux = b.x - px, uy = b.y - py; const m = Math.hypot(ux, uy) || 1; ux /= m; uy /= m;
  WZ.ctx = b.ctx;
  for (const e of w.enemies) {
    if (e.dead || e.fall > 0 || e.bm === tok || Math.hypot(e.x - b.x, e.y - b.y) > r + e.rad) continue;
    e.bm = tok;
    WZ.hurtE(e, b.dmg, ux * S.push, uy * S.push);
    WZ.mark(e.x, e.y, 0.6);
  }
  for (const h of WZ.hitH()) if (!h.broken && h.surf !== tok && Math.hypot(h.x - b.x, h.y - b.y) < r + (h.rad || 0.4)) { h.surf = tok; WZ.hurtH(h, b.dmg); }
  WZ.altarTouch(b.x, b.y, r);
  WZ.ctx = null;
};
WZ.boomTick = function (dt) {
  const w = G.w, S = CFG.spells.sandstorm, T = S.second;
  for (let i = w.booms.length - 1; i >= 0; i--) {
    const b = w.booms[i], px = b.x, py = b.y;
    b.spin += dt; b.t += dt;
    let leg = 0, end = false;
    if (b.one) {   // the second, smaller one: straight along the aim it was thrown on, one way, then gone
      const d = Math.min(b.reach, b.t * T.speed);
      b.x = b.ox + b.ax * d; b.y = b.oy + b.ay * d; leg = 2;
      end = d >= b.reach;
    } else if (b.ph === 'out') {   // an arc: ahead of him first, bending to the side at the far point
      const th = Math.min(1, b.t / S.out) * Math.PI / 2, nx = -b.ay, ny = b.ax;
      b.x = b.ox + b.ax * S.reach * Math.sin(th) + nx * S.curve * (1 - Math.cos(th));
      b.y = b.oy + b.ay * S.reach * Math.sin(th) + ny * S.curve * (1 - Math.cos(th));
      if (b.t >= S.out) { b.ph = 'back'; b.t = 0; b.fx = b.x; b.fy = b.y; }
    } else {   // back: toward where he stands now; for the last stretch the catch spot stays put (he has to be there)
      leg = 1;
      const k = Math.min(1, b.t / S.back);
      if (k < S.lock) { b.tx = w.x; b.ty = w.y; }
      const dx = b.tx - b.fx, dy = b.ty - b.fy, d = Math.hypot(dx, dy) || 1, cx = dx / d, cy = dy / d, bulge = S.curve * 1.1 * Math.sin(Math.PI * k);
      const sg = (-cy * -b.ay + cx * b.ax) >= 0 ? 1 : -1;   // it bulges to the same side the throw bent to, so the two legs make a loop
      b.x = b.fx + dx * k - cy * sg * bulge; b.y = b.fy + dy * k + cx * sg * bulge;
      end = k >= 1;
    }
    b.k = leg;
    WZ.boomHit(b, px, py, leg);
    if (Math.random() < dt * 30) w.fx_.push({ type: 'spark', x: b.x, y: b.y, vx: rand(-1.5, 1.5), vy: rand(-1.5, 1.5), z: 0.9, vz: rand(0, 1), g: 3, col: Math.random() < 0.5 ? '#d9b46a' : '#fff0c8', t: 0, dur: 0.4, el: 'air' });
    if (!end) continue;
    w.booms.splice(i, 1);
    const spent = () => { const bc = b.ctx; if (bc) WZ.later(0.2, () => FA.landed(bc)); };
    if (b.one) { WZ.puff(b.x, b.y, '#d9b46a', 8); spent(); continue; }
    if (Math.hypot(w.x - b.x, w.y - b.y) <= S.catchR) {   // caught: it flies again, smaller, one way, along his aim
      const a = WZ.aim(), m = Math.hypot(a[0], a[1]) || 1;
      WZ.ring(w.x, w.y, 1.2, '#ffe36b', 0.3); WZ.num(w.x, w.y, 'CATCH!', '#ffe36b'); AU.sfx('pickup');
      w.booms.push({ x: w.x, y: w.y, ox: w.x, oy: w.y, ax: a[0] / m, ay: a[1] / m, t: 0, k: 2, one: true, sc: T.scale, dmg: S.dmg * T.dmg, reach: T.reach, spin: 0, sid: Math.floor(Math.random() * 1e9), ctx: b.ctx });
    } else { WZ.puff(b.x, b.y, '#d9b46a', 10); AU.sfx('thud'); spent(); }   // nobody there: it falls and fizzles
  }
};
// Mud Shield: an orb goes off on the foe it touched
WZ.mudBlast = function (x, y, S) {
  const w = G.w;
  WZ.mark(x, y, S.sr); WZ.boom(x, y, S.sr, '#8a5a2a'); WZ.ring(x, y, S.sr, '#4aa8ff', 0.4);
  WZ.each(x, y, S.sr, (t, d, isE) => { const m = d || 1; WZ.hit(t, isE, S.dmg, isE ? (t.x - x) / m * S.push : 0, isE ? (t.y - y) / m * S.push : 0); if (isE) WZ.slowE(t, S.slow, S.slowT); });
  WZ.puff(x, y, '#6e4a2a', 10); WZ.puff(x, y, '#4aa8ff', 8); WZ.epuff(x, y, 'earth', 6); WZ.epuff(x, y, 'water', 6);
  WZ.bendRing(x, y, S.sr);
  w.shake = Math.max(w.shake, 0.3); AU.sfx('thud');
};
// Geyser Eruption: one wave. Wave 0 goes under the nearest foes (and the Altar), later waves under random ones that are not already in the air
WZ.geyserWave = function (k, S) {
  const w = G.w, px = w.x, py = w.y;
  const live = w.enemies.filter(e => !e.dead && !(e.fall > 0));
  let list;
  if (k === 0) list = live.sort((p, q) => Math.hypot(p.x - px, p.y - py) - Math.hypot(q.x - px, q.y - py));
  else {
    list = live.filter(e => !(e.air > 0) && Math.hypot(e.x - px, e.y - py) < S.range);
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
  }
  list = list.slice(0, S.n).map(e => [e.x, e.y]);
  const alt = k === 0 ? WZ.altarChainTarget(px, py, 14) : null;
  if (alt) list.unshift([alt.x, alt.y]);   // one erupts under the Altar too
  list.forEach((q, i) => {
    const x = q[0], y = q[1];
    w.fx_.push({ type: 'warn', x, y, r: S.r, t: 0, dur: S.delay + i * S.gap, col: '#4aa8ff' });
    WZ.later(S.delay + i * S.gap, () => WZ.erupt(x, y, S));
  });
};
// Geyser: one eruption throws what stands on it into the air (WZ.update brings it down for land dmg)
WZ.erupt = function (x, y, S) {
  const w = G.w;
  w.fx_.push({ type: 'column', x, y, r: S.r, t: 0, dur: 0.6, col: '#7ad0ff' });
  WZ.explode(x, y, S.r, S.dmg, '#7ad0ff');
  for (const e of w.enemies) {
    if (e.dead || e.boss || e.warden || e.fall > 0 || Math.hypot(e.x - x, e.y - y) > S.r + e.rad) continue;
    e.air = e.airT = S.toss; e.airDmg = S.land; e.airSlow = S.slow; e.airSlowT = S.slowT; e.airEl = (WZ.ctx ? WZ.ctx.el : []).slice();
  }
  WZ.epuff(x, y, 'water', 10); AU.sfx('zap_water');
};
// Elemental Nova, the burst: everything within r is shoved hard, hurt, slowed, scorched and staggered, and a spray of magma balls, water drops, air wisps and rock chunks
// ('nbit' projectiles) flies out of him to the edge, hitting what it crosses
WZ.novaBurst = function (z) {
  const S = CFG.spells.nova, w = G.w, x = z.x, y = z.y;
  WZ.ctx = z.ctx;
  WZ.ring(x, y, S.r, '#ffe36b', 0.55); WZ.ring(x, y, S.r * 0.6, '#ffffff', 0.4); WZ.boom(x, y, S.r, '#ffe36b');
  w.fx_.push({ type: 'flash', x, y, col: '#ffffff', t: 0, dur: 0.3 });
  WZ.mark(x, y, S.r);
  WZ.each(x, y, S.r, (t, d, isE) => {
    const m = d || 1;
    WZ.hit(t, isE, S.dmg, isE ? (t.x - x) / m * S.push : 0, isE ? (t.y - y) / m * S.push : 0);
    if (!isE || t.dead) return;
    WZ.slowE(t, S.slow, S.slowT);
    WZ.decal(t.x, t.y, 1, { k: 'burn', r: 0.5, t: 3, a: 0.6 });
    if (!t.boss) t.dazeT = Math.max(t.dazeT || 0, S.stagger);
  });
  const n = S.bits * 4, EL = ['fire', 'water', 'air', 'earth'];
  for (let i = 0; i < n; i++) {
    const an = i / n * 6.283 + (Math.random() - 0.5) * 0.2, sp = S.bitSpeed * (0.85 + Math.random() * 0.3), el = EL[i % 4];
    WZ.proj({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: (S.r + 0.5) / sp, dmg: S.bitDmg, kind: 'nbit', el, sid: Math.floor(Math.random() * 1e9), col: ELEM[el].color, size: 6, r: 0.5, trT: 0 });
  }
  EL.forEach(el => WZ.epuff(x, y, el, 14));
  WZ.bendRing(x, y, S.r);
  w.shake = Math.max(w.shake, 0.9); AU.sfx('slam', x, y);
  WZ.ctx = null;
};
// Thunderstorm: one bolt comes down on (x, y) and forks on to the nearest foes
WZ.strikeAt = function (x, y) {
  const S = CFG.spells.thunder, w = G.w;
  w.fx_.push({ type: 'skybolt', x, y, t: 0, dur: 0.28, col: '#fff27a' });
  WZ.explode(x, y, S.r, S.dmg, '#fff27a');
  const hit = w.enemies.filter(e => !e.dead && Math.hypot(e.x - x, e.y - y) <= S.r + e.rad);
  let fx = x, fy = y;
  const pts = [[x, y]];
  for (let i = 0; i < S.chain; i++) {
    const e = WZ.nearest(fx, fy, S.chainR, hit);
    if (!e) break;
    hit.push(e); pts.push([e.x, e.y]); fx = e.x; fy = e.y;
    WZ.mark(e.x, e.y, 0.6); WZ.hurtE(e, S.chainDmg, 0, 0);
  }
  if (pts.length > 1) w.fx_.push({ type: 'bolt', pts, t: 0, dur: 0.3, col: '#fff27a' });
  w.shake = Math.max(w.shake, 0.2); AU.sfx('hit');
};
// projectiles that are not plain bolts: returns true when it is done (removed)
WZ.projSpecial = function (p, dt) {
  const w = G.w, S = p.ctx ? CFG.spells[p.ctx.spell] : null;
  if (p.kind === 'lob') {
    p.t += dt;
    const k = Math.min(1, p.t / p.T);
    p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k;
    p.z = p.fall ? (1 - k) * p.h : Math.sin(k * Math.PI) * p.h;
    if (p.sub === 'meteor' && Math.random() < dt * 30) w.fx_.push({ type: 'spark', x: p.x, y: p.y, vx: rand(-1, 1), vy: rand(-1, 1), z: p.z, vz: 1, g: -2, col: Math.random() < 0.5 ? '#ffd23a' : '#ff7a30', t: 0, dur: 0.4 });
    if (k >= 1) { WZ.lobLand(p); return true; }
    return false;
  }
  if (p.kind === 'boulder') {   // in the air between landings it touches nothing; each landing crushes
    if (p.seek) {   // a Meteor fragment hunts: it steers (a lazy turn) toward its foe, and takes the nearest one when that foe is gone
      let tg = p.tid ? WZ.byId(p.tid) : null;
      if (!tg) { tg = WZ.nearest(p.x, p.y, p.seek); p.tid = tg ? WZ.eid(tg) : 0; }
      if (tg) {
        const sp = Math.hypot(p.vx, p.vy) || 1, want = Math.atan2(tg.y - p.y, tg.x - p.x), cur = Math.atan2(p.vy, p.vx);
        let da = want - cur; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
        const na = cur + Math.max(-p.turn * dt, Math.min(p.turn * dt, da));
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.ht += dt;
    if (p.ht < p.hop) return false;
    p.ht = 0; p.n++;
    if (WZ.tile(p.x, p.y) === T_POND || WZ.tile(p.x, p.y) === T_CHASM || WZ.blocked(p.x, p.y, 0.2)) { WZ.puff(p.x, p.y, '#bfe6ff', 12); AU.sfx('thud'); return true; }   // swallowed by water / a chasm, or it hit a wall
    WZ.explode(p.x, p.y, p.sr, p.dmg, p.burn ? '#ff7a30' : '#a98a5c', null, p.push);
    WZ.puff(p.x, p.y, p.burn ? '#ffb030' : '#d8c8a8', 10); WZ.epuff(p.x, p.y, p.burn ? 'fire' : 'earth', 6);
    w.shake = Math.max(w.shake, p.burn ? 0.12 : 0.25 + 0.05 * Math.max(0, (p.h0 || 0) - p.n)); AU.sfx(p.burn ? 'hit' : 'thud');
    p.hops--; p.hop *= 0.85; p.vx *= 0.9; p.vy *= 0.9;
    return p.hops <= 0;
  }
  if (p.kind === 'nbit') {   // a magma ball / water drop / air wisp / rock chunk flying out of the Nova: hits each foe once
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    for (const e of w.enemies) {
      if (e.dead || e.fall > 0 || e.surf === p.sid || Math.hypot(e.x - p.x, e.y - p.y) > p.r + e.rad) continue;
      e.surf = p.sid;
      WZ.hurtE(e, p.dmg, p.vx * 0.15, p.vy * 0.15);
      if (p.el === 'water') WZ.slowE(e, CFG.spells.nova.slow, CFG.spells.nova.slowT);
      if (p.el === 'fire' && !e.dead) WZ.mark(e.x, e.y, 0.6);
    }
    WZ.altarTouch(p.x, p.y, 0.6);
    if (Math.random() < dt * 30) w.fx_.push({ type: 'spark', x: p.x, y: p.y, vx: -p.vx * 0.1 + rand(-1, 1), vy: -p.vy * 0.1 + rand(-1, 1), z: 0.4, vz: rand(0, 2), g: 6, col: p.col, t: 0, dur: 0.35, el: p.el });
    if (p.life > 0) return false;
    WZ.epuff(p.x, p.y, p.el, 4);
    return true;
  }
  if (p.kind === 'icicle') { p.life -= dt; if (p.life > 0) return false; WZ.icicleHit(p.x, p.y); return true; }
  if (p.kind === 'strike') { p.life -= dt; if (p.life > 0) return false; WZ.strikeAt(p.x, p.y); return true; }
  if (p.kind === 'wave') {   // pierces: hits each foe once (sid) and carries them
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
    if ((p.trT -= dt) <= 0) { p.trT = S.trailGap; WZ.trail(p.x, p.y); }
    WZ.altarTouch(p.x, p.y, p.w / 2);
    for (const e of w.enemies) {
      if (e.dead || e.fall > 0) continue;
      const rx = e.x - p.x, ry = e.y - p.y, al = rx * ux + ry * uy, pe = -rx * uy + ry * ux;
      if (Math.abs(al) > 0.7 + e.rad || Math.abs(pe) > p.w / 2 + e.rad) continue;
      if (e.surf !== p.sid) {
        e.surf = p.sid;
        WZ.hurtE(e, p.dmg, 0, 0);
        WZ.slowE(e, p.slow, p.slowT);
      }
      if (!e.boss) { const kb = e.kb !== undefined ? e.kb : e.elite ? 0.4 : 1, mk = p.mk || 1; e.kx = p.vx * 1.1 * kb * mk; e.ky = p.vy * 1.1 * kb * mk; }   // it surfs the wave
    }
    for (const h of WZ.hitH()) if (!h.broken && h.surf !== p.sid && Math.hypot(h.x - p.x, h.y - p.y) < p.w / 2 + (h.rad || 0.4)) { h.surf = p.sid; WZ.hurtH(h, p.dmg); }
    if (Math.random() < dt * 40) { const s = (Math.random() - 0.5) * p.w; w.fx_.push({ type: 'spark', x: p.x - uy * s, y: p.y + ux * s, vx: ux * 3, vy: uy * 3, z: 0.4, vz: rand(2, 4), g: 16, col: Math.random() < 0.4 ? '#ffffff' : '#7ad0ff', t: 0, dur: 0.5, el: 'water' }); }
    if (p.life > 0) return false;
    WZ.puff(p.x, p.y, '#7ad0ff', 10);
    return true;
  }
  if (p.kind === 'fire' && p.home) {   // homing: it turns toward the foe that needs the least turning within seek tiles (a nearer one wins a close call); only a foe almost straight behind is ignored
    let best = null, bs = 1e9;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    for (const e of w.enemies) {
      if (e.dead || e.fall > 0) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > p.seek) continue;
      const c = (dx * p.vx + dy * p.vy) / (d * sp || 1);
      if (c <= S.behind) continue;
      const sc = Math.acos(Math.max(-1, Math.min(1, c))) + d * S.nearBias;
      if (sc < bs) { bs = sc; best = e; }
    }
    if (best) {
      const want = Math.atan2(best.y - p.y, best.x - p.x), cur = Math.atan2(p.vy, p.vx);
      let da = want - cur; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
      const na = cur + Math.max(-p.home * dt, Math.min(p.home * dt, da));
      p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
    }
    if ((p.trT -= dt) <= 0) { p.trT = S.trailGap; WZ.trail(p.x, p.y); }
  }
  return null;   // a plain bolt from here on (the usual hit test)
};
// Blizzard: an icicle comes down; a foe it hits chill times freezes solid
WZ.icicleHit = function (x, y) {
  const S = CFG.spells.blizzard, w = G.w;
  WZ.mark(x, y, S.iceR);
  WZ.puff(x, y, '#e6f8ff', 5);
  WZ.each(x, y, S.iceR, (t, d, isE) => {
    WZ.hit(t, isE, S.iceDmg);
    if (!isE || t.dead || t.boss) return;
    t.chill = (t.chill || 0) + 1;
    if (t.chill >= S.chill) { t.chill = 0; t.frozen = S.freeze; t.dazeT = Math.max(t.dazeT || 0, S.freeze); WZ.ring(t.x, t.y, 1, '#ffffff', 0.3); AU.sfx('freeze'); }
  });
};
// zones that do more than tick round a circle: returns true when the usual circle damage should be skipped
// A new Tempest Tear's speed (x the Wizard's): between speedMin and speedMax, and at least gapPref (10%) different from every live tear (gapMin, 5%, once there are
// manyTears of them); the most spread-out value in the range wins. If the range cannot hold that many tears apart it is stretched upward rather than let two match.
WZ.tearSpeed = function (S) {
  const used = G.w.zones.filter(o => o.kind === 'tear' && o.t > 0).map(o => o.spd || S.speedMul);
  const gapOf = c => used.reduce((m, o) => Math.min(m, Math.abs(c - o) / Math.min(c, o)), 9);
  const search = hi => { let best = S.speedMin, bg = -1; for (let c = S.speedMin; c <= hi + 1e-9; c += 0.01) { const g = gapOf(c); if (g > bg + 1e-9) { bg = g; best = c; } } return [best, bg]; };
  for (const gap of used.length < S.manyTears ? [S.gapPref, S.gapMin] : [S.gapMin]) { const r = search(S.speedMax); if (r[1] >= gap) return +r[0].toFixed(2); }
  let r = search(S.speedMax);
  for (let hi = S.speedMax + 0.5; hi < 40 && r[1] < S.gapMin; hi += 0.5) r = search(hi);
  return +r[0].toFixed(2);
};
WZ.zoneSpecial = function (z, dt) {
  const w = G.w, S = z.ctx ? CFG.spells[z.ctx.spell] : null;
  if (z.kind === 'ftrail') return WZ.trailTick(z, dt);   // the wand's Flame Trail (js/wand.js)
  if (z.kind === 'flame') {   // a cone of fire in front of him, along his aim
    const a = WZ.aim(), m = Math.hypot(a[0], a[1]) || 1;
    z.ax += (a[0] / m - z.ax) * Math.min(1, dt * 10); z.ay += (a[1] / m - z.ay) * Math.min(1, dt * 10);
    const am = Math.hypot(z.ax, z.ay) || 1, ux = z.ax / am, uy = z.ay / am, cos = Math.cos(z.half);
    const inCone = (x, y, rad) => { const dx = x - z.x, dy = y - z.y, d = Math.hypot(dx, dy); return d < z.r + rad && (d < 0.6 || (dx * ux + dy * uy) / d > cos); };
    for (const e of w.enemies) if (!e.dead && !(e.fall > 0) && inCone(e.x, e.y, e.rad)) { WZ.hurtE(e, z.dps * dt, 0, 0, true); e.flash = 0.06; }
    for (const h of WZ.hitH()) if (!h.broken && inCone(h.x, h.y, h.rad || 0.4)) WZ.hurtHc(h, z.dps * dt);
    WZ.altarTouch(z.x + ux * z.r * 0.5, z.y + uy * z.r * 0.5, z.r * 0.4);
    if ((z.trT -= dt) <= 0) { z.trT = S.trailGap; const d = 1 + Math.random() * (z.r - 1), an = Math.atan2(uy, ux) + (Math.random() - 0.5) * z.half * 1.6; WZ.trail(z.x + Math.cos(an) * d, z.y + Math.sin(an) * d); }
    for (let i = 0; i < 3; i++) {   // the flames themselves
      const an = Math.atan2(uy, ux) + (Math.random() - 0.5) * z.half * 1.8, s = 7 + Math.random() * 6;
      w.fx_.push({ type: 'spark', x: z.x + ux * 0.5, y: z.y + uy * 0.5, vx: Math.cos(an) * s, vy: Math.sin(an) * s, z: 0.6, vz: rand(0.5, 2), g: -2, col: Math.random() < 0.3 ? '#ffe36b' : Math.random() < 0.5 ? '#ff9a2b' : '#ff5a1a', t: 0, dur: rand(0.3, 0.5), el: 'fire' });
    }
    if ((z.snd -= dt) <= 0) { z.snd = 0.3; AU.sfx('zap_fire'); }
    return true;
  }
  if (z.kind === 'tear') {   // a water droplet: flies toward a spot S.reach tiles out along his aim, offset spread degrees from its neighbours, hurting and slowing all it passes through
    const sib = w.zones.filter(o => o.kind === 'tear'), n = sib.length, i = sib.indexOf(z), st = WZ.stickAim();
    const an = Math.atan2(st ? st[1] : w.fy, st ? st[0] : w.fx) + (i - (n - 1) / 2) * S.spread * Math.PI / 180;
    const reach = st ? Math.max(S.minReach, S.reach * st[2]) : S.reach;
    const dx = w.x + Math.cos(an) * reach - z.x, dy = w.y + Math.sin(an) * reach - z.y, d = Math.hypot(dx, dy), step = WZ.speed() * (z.spd || S.speedMul) * dt;
    if (d > 0.001) { const k = Math.min(1, step / d); z.x += dx * k; z.y += dy * k; }
    const lx = z.x - w.x, ly = z.y - w.y, ld = Math.hypot(lx, ly);
    if (ld > S.reach) { z.x = w.x + lx / ld * S.reach; z.y = w.y + ly / ld * S.reach; }   // the leash: never more than reach tiles from him
    z.vx = d > 0.001 ? dx / d : 0; z.vy = d > 0.001 ? dy / d : 0;
    for (const e of w.enemies) {
      if (e.dead || e.fall > 0 || Math.hypot(e.x - z.x, e.y - z.y) > z.r + e.rad) continue;
      WZ.hurtE(e, S.dps * dt, 0, 0, true); WZ.slowE(e, S.slow, S.slowT); e.flash = 0.05;
    }
    for (const h of WZ.hitH()) if (!h.broken && Math.hypot(h.x - z.x, h.y - z.y) < z.r + (h.rad || 0.4)) WZ.hurtHc(h, S.dps * dt);
    WZ.altarTouch(z.x, z.y, z.r);
    if ((z.trT -= dt) <= 0) { z.trT = S.trailGap; WZ.trail(z.x, z.y); }
    if (Math.random() < dt * 24) w.fx_.push({ type: 'spark', x: z.x, y: z.y, vx: rand(-1, 1), vy: rand(-1, 1), z: 0.5, vz: rand(0.5, 2), g: 6, col: Math.random() < 0.4 ? '#ffffff' : '#4fc3ff', t: 0, dur: 0.4, el: 'water' });
    return true;
  }
  if (z.kind === 'mshield') {   // orbs circle him; the first foe (or the Altar) one touches sets it off
    z.ang += S.spin * dt;
    for (let i = z.orbs.length - 1; i >= 0; i--) {
      const an = z.ang + z.orbs[i], ox = z.x + Math.cos(an) * S.orbitR, oy = z.y + Math.sin(an) * S.orbitR;
      let hit = WZ.altarBlocks(ox, oy, S.orbR);
      if (!hit) for (const e of w.enemies) if (!e.dead && !(e.fall > 0) && Math.hypot(e.x - ox, e.y - oy) < S.orbR + e.rad) { hit = true; break; }
      if (!hit) { if (Math.random() < dt * 12) w.fx_.push({ type: 'spark', x: ox, y: oy, vx: 0, vy: 0, z: 0.6, vz: 0.5, g: 0, col: i % 2 ? '#4aa8ff' : '#8a5a2a', t: 0, dur: 0.3 }); continue; }
      z.orbs.splice(i, 1);
      WZ.mudBlast(ox, oy, S);
    }
    if (!z.orbs.length) z.t = 0;
    return true;
  }
  if (z.kind === 'novapull') {   // the Nova gathers: everything within pullR is hauled toward him while everything within r is zapped
    for (const e of w.enemies) {
      if (e.dead || e.fall > 0) continue;
      const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy);
      if (d > S.pullR + e.rad || d < 1.4) continue;
      const kb = e.kb !== undefined ? e.kb : e.boss ? 0.08 : e.elite ? 0.4 : 1;
      e.kx += dx / d * S.pull * kb * dt * 6; e.ky += dy / d * S.pull * kb * dt * 6;
    }
    if ((z.zt -= dt) <= 0) {
      z.zt = S.zapEvery;
      const hit = [];
      WZ.each(z.x, z.y, S.r, (t, d, isE) => {
        if (isE) { WZ.hurtE(t, S.zapDmg, 0, 0, true); t.flash = 0.08; if (hit.length < S.zapN) hit.push(t); } else WZ.hurtH(t, S.zapDmg);
      });
      for (const t of hit) w.fx_.push({ type: 'bolt', pts: [[z.x, z.y], [t.x, t.y]], t: 0, dur: 0.18, col: Math.random() < 0.5 ? '#ffe36b' : '#ffffff' });
      if (hit.length) AU.sfx('zap_air');
    }
    return true;
  }
  if (z.kind === 'storm') {   // the cloud hangs over him and calls bolts down
    if ((z.zt -= dt) <= 0) {
      z.zt = S.every;
      const al = WZ.altarChainTarget(z.x, z.y, z.r), list = w.enemies.filter(e => !e.dead && !(e.fall > 0) && Math.hypot(e.x - z.x, e.y - z.y) < z.r);
      const e = list.length ? list[Math.floor(Math.random() * list.length)] : null;
      let x, y;
      if (al && Math.random() < 0.5) { x = al.x; y = al.y; } else if (e) { x = e.x; y = e.y; } else { const an = Math.random() * 6.283, d = 2 + Math.random() * (z.r - 2); x = z.x + Math.cos(an) * d; y = z.y + Math.sin(an) * d; }
      w.fx_.push({ type: 'warn', x, y, r: S.r, t: 0, dur: S.warn, col: '#fff27a' });
      WZ.proj({ x, y, kind: 'strike', life: S.warn, vx: 0, vy: 0 });
    }
    return true;
  }
  if (z.kind === 'blizzard' && S) {   // icicles rain round him (half of them on foes)
    if ((z.it -= dt) <= 0) {
      z.it = S.icicle;
      const list = w.enemies.filter(e => !e.dead && !(e.fall > 0) && Math.hypot(e.x - z.x, e.y - z.y) < z.r);
      let x, y;
      if (list.length && Math.random() < 0.55) { const e = list[Math.floor(Math.random() * list.length)]; x = e.x; y = e.y; }
      else { const an = Math.random() * 6.283, d = 1 + Math.random() * (z.r - 1); x = z.x + Math.cos(an) * d; y = z.y + Math.sin(an) * d; }
      WZ.proj({ x, y, kind: 'icicle', life: 0.3, vx: 0, vy: 0 });
    }
    return false;
  }
  return false;
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
  if (!def.crafted) { const met = G.stats.met || (G.stats.met = {}); met[type] = (met[type] || 0) + 1; }   // the Collection Book greys out foes you have never met (crafted ones count in makeCreature)
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
  if (m.type === 'shrine') G.stats.shrines = (G.stats.shrines || 0) + 1; else G.stats.clears = (G.stats.clears || 0) + 1;
  WZ.ring(m.x, m.y, 4, '#c890ff', 0.6); WZ.puff(m.x, m.y, '#c890ff', 18);
  AU.sfx('chest'); UI.changed();   // the shards themselves fly out and pop up at the factory's shard pile
};
// (shrines are claimed by a Core the Builder sends through the Spell Portal while the Wizard is near: WZ.unlockTarget / WZ.unlockLand in augments.js)
WZ.foesNear = (m, n) => {
  for (let i = 0; i < n; i++) {
    const s = WZ.dryNear(m.x, m.y, 12, [1.2, 3.5]);
    if (s) WZ.makeEnemy(WZ.pickType(s[0], s[1]), s[0], s[1], false).mark = m.id;
  }
};
WZ.updMarks = function (dt) {
  const w = G.w, M = CFG.marks;
  for (const m of WZ.marks) {
    const s = w.lm[m.id];
    if (s.state === 'done' && m.type !== 'shrine') continue;   // (claimed shrines are still looked at: their flash)
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
    } else {   // shrines: claimed by the element's Core coming down on them (WZ.unlockLand); standing there does nothing: he wakes a claimed one with the Mash button (WZ.shrineTick)
      if (s.flash > 0) s.flash -= dt;
    }
  }
};

// ---------- the Primal Chimera ----------
WZ.summonBoss = function (ax, ay) {   // at the Altar when it calls it (ax, ay); beside the Wizard for the debug hook
  const w = G.w;
  if (!w || w.dead || w.boss) return false;
  const spot = ax !== undefined ? (WZ.dryNear(ax, ay, 30, [3, 5]) || [ax + 3, ay]) : (WZ.dryNear(w.x, w.y, 30, [8, 11]) || [w.x + 6, w.y]);
  const e = WZ.makeEnemy('boss', spot[0], spot[1], false);
  e.boss = true; e.order = ELEMS.slice().sort(() => Math.random() - 0.5); e.phase = 0; e.weak = e.order[0];
  e.slamT = 3; e.sumT = 6; e.volT = 5;
  w.boss = e;
  e.weakFlash = G.fac.weakFlash = CFG.boss.weakFlash;
  w.fx_.push({ type: 'beam', x: e.x, y: e.y, col: '#ff4a8a', t: 0, dur: 1.4 });
  WZ.ring(e.x, e.y, 6, '#ff4a8a', 0.8); w.shake = 0.8;
  FA.pressure(1.4, '#ff4a8a');
  const msg = 'The Primal Chimera rises! Weak to ' + ELEM_WORD[e.weak] + ' (it changes as it weakens)';
  UI.toast(msg, 'R', 'ic_crown'); UI.toast(msg, 'L', e.weak);
  AU.sfx('roar');
  return true;
};
WZ.bossAI = function (e, dt, d, TG) {   // d and TG: the distance to, and the position of, what it is going for (an ally in range, else the Wizard)
  const B = CFG.boss, w = G.w;
  TG = TG || { x: w.x, y: w.y };
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
    const x = TG.x, y = TG.y;
    w.fx_.push({ type: 'warn', x, y, r: B.slamR, t: 0, dur: B.slamDelay, col: '#ff4a8a' });
    AU.sfx('warn');
    WZ.later(B.slamDelay, () => {
      WZ.boom(x, y, B.slamR, '#ff4a8a'); AU.sfx('slam', x, y); G.w.shake = Math.max(G.w.shake, 0.3);
      WZ.strike(x, y, B.slamR, B.slamDmg);   // hurts every ally inside, and the Wizard if he is (the roll swallows it)
    });
  }
  if (e.volT <= 0 && d < 15) {    // a ring of orbs in the current weakness colour
    e.volT = B.volleyEvery;
    for (let i = 0; i < B.volleyN; i++) {
      const a = i / B.volleyN * 6.283 + Math.random() * 0.3;
      w.eproj.push({ x: e.x, y: e.y, vx: Math.cos(a) * B.volleySpeed, vy: Math.sin(a) * B.volleySpeed, life: 2.4, dmg: B.volleyDmg, col: ELEM[e.weak].color, size: 7 });
    }
    AU.sfx('volley', e.x, e.y);
  }
  if (e.sumT <= 0) { e.sumT = B.summonEvery; WZ.foesNear(e, B.summonN); WZ.ring(e.x, e.y, 3, '#ff4a8a', 0.4); }
};
WZ.nextWeak = e => (e && e.order && e.phase < 3 ? e.order[e.phase + 1] : null);
WZ.bossDown = function (e) {
  const w = G.w, B = CFG.boss;
  w.boss = null;
  WZ.dropGems(e.x, e.y, CFG.enemies.boss.gem[0]);
  for (let i = 0; i < B.shards; i++) WZ.drop('shard', e.x, e.y, 1);
  for (const el of ELEMS) WZ.dropCores(el, CFG.cores.boss, e.x, e.y);
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
    M[j * N + i] = x >= 0 && y >= 0 && x < WW && y < WH && !WZ.wet(x + 0.5, y + 0.5) ? 1 : 0;   // water, unless frozen; Earth Walls block
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
WZ.update = function (dt, ix, iy, rollPressed, rx, ry, act) {   // act = { mash, cast, cycle }: the Wizard's other three buttons (his roll is rollPressed)
  const w = G.w, cfg = CFG.world;
  w.t += dt;
  w.sx = ((rx || 0) + (ry || 0)) / 1.414; w.sy = ((ry || 0) - (rx || 0)) / 1.414;   // the right stick, in world directions (iso, like the movement stick)
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
  for (let i = w.decals.length - 1; i >= 0; i--) if ((w.decals[i].t += dt) > w.decals[i].dur) w.decals.splice(i, 1);
  WZ.tmodTick(dt);
  WZ.arcTick(dt);
  WZ.cineTick(dt);   // the Summoning Altar's landing (runs even if he dies meanwhile)
  if (w.dead) { w.wheel = null; w.emote = null; w.stk = null; w.sg = null; w.dig = null; w.jump = null; w.blink = null; if (G.ev && G.ev.active) WZ.evFail(); return; }
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

  // a geyser has him in the air: he flies along its arc, no steering, no rolling, untouchable (WZ.damage)
  if (w.jump) {
    const J = w.jump, k = Math.min(1, (J.t += dt) / J.T);
    w.x = J.sx + (J.tx - J.sx) * k; w.y = J.sy + (J.ty - J.sy) * k; w.vx = 0; w.vy = 0;
    ix = 0; iy = 0; rollPressed = false; w.rollBuf = 0; w.target = null;
    if (Math.floor(J.t * 30) % 2) w.fx_.push({ type: 'spark', x: w.x, y: w.y, vx: rand(-1, 1), vy: rand(-1, 1), z: Math.sin(k * Math.PI) * J.h, vz: -2, g: 14, col: Math.random() < 0.4 ? '#ffffff' : '#7ad0ff', t: 0, dur: 0.4, el: 'water' });
    if (k >= 1) {
      w.jump = null; w.shake = Math.max(w.shake, 0.3); w.squashT = 0.2;
      WZ.ring(w.x, w.y, 1.4, '#7ad0ff', 0.35); WZ.puff(w.x, w.y, '#d8c8a8', 10); AU.sfx('thud');
    }
  }

  // the wand's buttons: Cycle picks the armed slot, Cast fires it (a spell-delivery 'act' never comes from the menu world)
  let A = act || {};
  { const eo = WZ.emoteInput(ix, iy, rollPressed, A); ix = eo.ix; iy = eo.iy; rollPressed = eo.roll; A = eo.act; }   // the emote wheel / dance (js/emote.js)
  if (!G.menu && G.wand) { if (A.cycle && !WZ.wandCycle()) AU.sfx('error'); if (A.cast && !WZ.wandCast() && !w.ride && !(w.statT > 0)) AU.sfx('error'); }   // (nothing ready: a dull no)
  if (w.ride) { ix = 0; iy = 0; rollPressed = false; w.rollBuf = 0; w.target = null; }   // a Riding Wave has the controls
  if (w.statT > 0) { rollPressed = false; w.rollBuf = 0; }   // stone does not roll

  // movement
  let dx = 0, dy = 0;
  if (ix || iy) { w.target = null; dx = ix + iy; dy = iy - ix; }
  else if (w.target) {
    const tx = w.target.x - w.x, ty = w.target.y - w.y;
    if (Math.hypot(tx, ty) < 0.2) w.target = null; else { dx = tx; dy = ty; }
  }
  const m = Math.hypot(dx, dy);
  if (m > 0) { dx /= m; dy /= m; w.fx = dx; w.fy = dy; }
  // the Mash button (its own button now, never the roll): it wakes a claimed shrine's ring game, else digs the forage spot in reach. Mashing is an action: it ends Vanishing Puff
  w.dig = w.roll > 0 || w.ride ? null : WZ.forageAt(w.x, w.y);
  const sgBusy = !!w.sg, sgStarted = WZ.shrineTick(dt, !!A.mash && !w.ride);
  if (A.mash && !w.ride) { WZ.unseen(); if (!sgBusy && !sgStarted && w.dig) { WZ.mash(w.dig); w.mashAt = w.t; } }
  // a roll pressed a moment too early (still rolling / cooling down) is kept for CFG.inputBuffer seconds
  if (rollPressed && (w.rollCd > 0 || w.roll > 0)) { w.rollBuf = CFG.inputBuffer; rollPressed = false; }
  else if (w.rollBuf > 0) { w.rollBuf -= dt; if (w.rollCd <= 0 && w.roll <= 0) { rollPressed = true; w.rollBuf = 0; } }
  if (rollPressed && w.rollCd <= 0 && w.roll <= 0) {
    w.roll = CFG.wizard.rollTime; w.rollCd = WZ.rollCd();
    w.rdx = m > 0 ? dx : w.fx; w.rdy = m > 0 ? dy : w.fy;
    const rm = Math.hypot(w.rdx, w.rdy) || 1; w.rdx /= rm; w.rdy /= rm;
    AU.sfx(WZ.has('gale') && WZ.blinkStart() ? 'dodge' : 'roll');   // the Gale Circlet: the roll is a short blink instead
  }
  let sp = WZ.speed();
  const tn = WZ.tile(w.x, w.y);
  if (tn === T_BOG && !WZ.has('bog')) sp *= cfg.slowTerrain;   // the Bogwalker Shroud: bog never slows him
  if (tn === T_SCORCH && !WZ.has('ember')) sp *= CFG.aug.scorch.slow;
  // hostile mud / steam slows (the roll ignores them)
  const slowK = (1 - Math.min(0.8, w.zSlow || 0)) * (w.slowT > 0 ? 1 - w.slowAmt : 1);
  if (w.slowT > 0) w.slowT -= dt;
  if (w.blink) {   // the Circlet's blink: straight to the landing spot, over water and chasms, no collision on the way (WZ.blinkStart picked a legal one)
    const B = w.blink, k = Math.min(1, (B.t += dt) / B.T);
    w.roll -= dt;
    w.x = B.sx + (B.tx - B.sx) * k; w.y = B.sy + (B.ty - B.sy) * k; w.vx = 0; w.vy = 0;
    w.ghostT = (w.ghostT || 0) - dt;
    if (w.ghostT <= 0) { w.ghostT = 0.025; w.ghosts.push({ x: w.x, y: w.y, t: 0 }); }
    if (k >= 1) { w.blink = null; w.squashT = 0.12; WZ.ring(w.x, w.y, 1.2, '#e6f8ff', 0.3); WZ.puff(w.x, w.y, '#e6f8ff', 8); }
  } else if (w.ride) {   // Riding Wave: a straight run along the aim (WZ.rideSet), the wave parts the foes it meets (WZ.rideTick)
    WZ.rideSet(dt);
  } else if (w.roll > 0) {
    // the roll ignores acceleration: a committed burst
    w.roll -= dt;
    w.vx = w.rdx * sp * CFG.wizard.rollSpeed; w.vy = w.rdy * sp * CFG.wizard.rollSpeed;
    w.ghostT = (w.ghostT || 0) - dt;
    if (w.ghostT <= 0) { w.ghostT = 0.05; w.ghosts.push({ x: w.x, y: w.y, t: 0 }); }
  } else {
    const wx = dx * sp * slowK, wy = dy * sp * slowK, ex = wx - w.vx, ey = wy - w.vy, el = Math.hypot(ex, ey);
    const heavy = w.statT > 0;   // the Statue: a heavy boulder, slow to get going, slow to turn, slow to stop
    const rate = (m > 0 ? (heavy ? CFG.wand.earth.accel : CFG.wizard.accel) : (heavy ? CFG.wand.earth.friction : CFG.wizard.friction)) * dt;
    if (el <= rate) { w.vx = wx; w.vy = wy; } else { w.vx += ex / el * rate; w.vy += ey / el * rate; }
  }
  if (w.kick) {   // a short shove (the Altar's shockwaves; spells no longer recoil) (it slides along water like any move)
    const K = w.kick, s = K.d / CFG.wizard.kickT;
    if (w.roll > 0 || w.jump || (K.t -= dt) <= 0) w.kick = null;
    else WZ.slideW(w, w.x + K.x * s * dt, w.y + K.y * s * dt, CFG.wizard.radius);
  }
  if (w.squashT > 0) w.squashT -= dt;
  for (const gh of w.ghosts) gh.t += dt;
  w.ghosts = w.ghosts.filter(gh => gh.t < 0.25);
  if (w.shake > 0) w.shake = Math.max(0, w.shake - dt);
  const spd = Math.hypot(w.vx, w.vy);
  w.moving = spd > 0.3;
  // the chosen footstep trail (a cosmetic from the player screen)
  if (w.moving && !w.dead) {
    w.trailT = (w.trailT || 0) - dt;
    if (w.trailT <= 0) { w.trailT = 0.07; const tc = Players.trailCol('wizard'); if (tc) G.w.fx_.push({ type: 'spark', x: w.x, y: w.y, vx: rand(-0.8, 0.8), vy: rand(-0.8, 0.8), z: 0.15, vz: rand(1.2, 2.6), g: 4, col: tc, t: 0, dur: 0.6 }); }
  }
  if (spd > 0.01) {
    w.bob += dt * 11 * Math.min(1, spd / sp);
    const nx = Math.max(0.5, Math.min(CFG.WW - 0.5, w.x + w.vx * dt)), ny = Math.max(0.5, Math.min(CFG.WH - 0.5, w.y + w.vy * dt));
    const ox = w.x, oy = w.y;
    WZ.slideW(w, nx, ny, CFG.wizard.radius);
    if (w.x === ox) w.vx = 0;
    if (w.y === oy) w.vy = 0;
    if (w.target && w.x === ox && w.y === oy) w.target = null;
  }
  WZ.wandTick(dt);   // the wand's clocks: Flame Trail speed, Vanishing Puff, Statue and its burst, the Riding Wave
  WZ.emoteTick(dt);  // the dance beat and the Builder's sticker
  WZ.augTick(dt);   // augment cooldowns, washing ashore, the keeps' doors, boulders
  WZ.altarTick(dt);   // the Summoning Altar: placing it, its sockets, the Chimera ritual
  WZ.bshrTick(dt);   // the Battery Shrines: one per Battery, their shockwaves
  // scorched ground burns (the Emberward Cloak walks it unharmed and throws embers up instead)
  if (tn === T_SCORCH && !w.jump && !w.blink) {
    if (WZ.has('ember')) { if (Math.random() < dt * 10) w.fx_.push({ type: 'spark', x: w.x + rand(-0.4, 0.4), y: w.y + rand(-0.4, 0.4), vx: 0, vy: 0, z: 0.1, vz: rand(1.5, 3), g: -2, col: Math.random() < 0.5 ? '#ffb030' : '#ff7a30', t: 0, dur: 0.5 }); }
    else {
      w.scorchT = (w.scorchT || 0) + dt; w.burn = (w.burn || 0) + dt;   // burn = seconds in a row on scorched ground: the longer he stays, the worse it gets
      if (w.scorchT >= 0.25) { w.scorchT = 0; WZ.damage(CFG.aug.scorch.dps * (1 + CFG.aug.scorch.ramp * w.burn) * 0.25, true); if (Math.random() < 0.5) AU.sfx('blip'); }
    }
  } else if (w.burn > 0) w.burn = Math.max(0, w.burn - dt * 2);   // off the ground: it cools quickly
  WZ.flowCd -= dt;
  if (WZ.flowCd <= 0 && (!WZ.flow || WZ.flow.cx !== Math.floor(w.x) || WZ.flow.cy !== Math.floor(w.y))) { WZ.buildFlow(); WZ.flowCd = 0.2; }

  // pickups crafted in the factory: fall from the sky, then walk over to use
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    const p = w.pickups[i];
    p.t += dt;
    if (p.z > 0) { p.z = Math.max(0, p.z - dt * 14); if (p.z === 0) { WZ.puff(p.x, p.y, ITEMS[p.kind].color, 8); AU.sfx('thud'); } continue; }
    if (Math.hypot(p.x - w.x, p.y - w.y) > 0.8 + CFG.upgrade.magnet * lvl('magnet')) continue;   // Loot Magnet reaches these too
    if (ITEMS[p.kind].aug) { WZ.wearGarment(ITEMS[p.kind].id); w.pickups.splice(i, 1); continue; }
    const def = CFG.pickups[p.kind];
    if (def.heal) {
      if (w.hp >= WZ.maxHp()) { p.full = true; continue; }
      const got = Math.min(Math.round(def.heal * WZ.remedy(p.kind)), WZ.maxHp() - w.hp);   // Remedies
      w.hp += got; WZ.num(w.x, w.y, '+' + Math.round(got), '#6aff8a');
    } else {
      if (w.armor >= CFG.wizard.armorMax) { p.full = true; continue; }
      const got = Math.min(Math.round(def.armor * WZ.remedy(p.kind)), CFG.wizard.armorMax - w.armor);   // Wardwoven
      w.armor += got; WZ.num(w.x, w.y, '+' + Math.round(got), '#9fc4ff');
    }
    G.stats.used = (G.stats.used || 0) + 1;
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
  if (w.spawnT <= 0 && !G.menu) {   // (the menu world has no wild monsters)
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
    if (e.air > 0) {   // thrown up by a geyser: it comes down hard
      e.air -= dt;
      if (e.air <= 0) {
        e.air = 0; e.land = 0.22; WZ.puff(e.x, e.y, '#d8c8a8', 8); AU.sfx('thud');
        const c = WZ.ctx; WZ.ctx = { spell: 'geyser', el: (e.airEl || []).slice(), hits: 0, kills: 0, weak: 0 };
        WZ.mark(e.x, e.y, 0.8); WZ.hurtE(e, e.airDmg || 0, 0, 0);
        if (!e.dead && e.airSlowT) WZ.slowE(e, e.airSlow, e.airSlowT);   // slowed once it is back down
        WZ.ctx = c;
      }
      continue;
    }
    if (e.frozen > 0) e.frozen -= dt;
    if (e.dazeT > 0) { e.dazeT -= dt; continue; }   // dazed on landing (or frozen solid, or staggered)
    const dw = Math.hypot(w.x - e.x, w.y - e.y) || 1;   // to the Wizard (the despawn teleport and the first-sighting toast always use him)
    if (dw > 45) { const sp2 = WZ.dryNear(w.x, w.y, 8, [cfg.ringMin, cfg.ringMax]); if (sp2) { e.x = sp2[0]; e.y = sp2[1]; } continue; }
    if (dw < 12) { const key = e.elite ? 'elite' : e.boss ? null : (e.weak ? e.type : null); if (key && !w.seen[key]) { w.seen[key] = true; WZ.announce(e, key); } }
    const TG = WZ.foeTarget(e), ex = TG.x - e.x, ey = TG.y - e.y, d = TG.a ? Math.hypot(ex, ey) || 1 : dw;   // an ally within aggro range comes first
    if (e.boss && !TG.mill) WZ.bossAI(e, dt, d, TG);
    const s = e.spd * (1 - e.slow) * (!e.fly && WZ.tile(e.x, e.y) === T_BOG ? cfg.slowTerrain : 1);
    let ux = ex / d, uy = ey / d, steered = false;
    if (e.detour > 0) { e.detour -= dt; const px = -uy * e.side, py = ux * e.side; ux = px; uy = py; }   // last-resort sidestep
    else if (d > 1.5 && !e.fly && !TG.a && !TG.mill) { const f = WZ.flowDir(e, d); if (f) { ux = f[0]; uy = f[1]; steered = true; } }   // (the flow field leads to the Wizard: an ally is chased in a straight line)
    if (TG.mill) {   // Vanishing Puff: nobody to go for (he is unseen and no ally is near): it mills about where it stands
      e.millT = (e.millT || 0) - dt;
      if (e.millT <= 0) { e.millT = rand(0.7, 1.8); const an = Math.random() * 6.283, st = Math.random() < 0.35 ? 0 : 0.3; e.millX = Math.cos(an) * st; e.millY = Math.sin(an) * st; }
      ux = e.millX || 0; uy = e.millY || 0; steered = true;
    }
    let mx = ux * s, my = uy * s;
    if (e.ai && !TG.mill) { const r = WZ.aiTick(e, dt, d, ux, uy, s, TG); if (r) { mx = r[0]; my = r[1]; } }   // a creature's own movement and attacks
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
    const ox0 = e.x, oy0 = e.y;
    if (e.fly) { e.x = Math.max(0.5, Math.min(CFG.WW - 0.5, e.x + (mx + e.kx) * dt)); e.y = Math.max(0.5, Math.min(CFG.WH - 0.5, e.y + (my + e.ky) * dt)); }   // flyers cross water
    else if (WZ.slide(e, e.x + (mx + e.kx) * dt, e.y + (my + e.ky) * dt, 0.3) && !(e.detour > 0) && !steered) {
      e.detour = 0.5 + Math.random() * 0.6; e.side = e.side || (Math.random() < 0.5 ? 1 : -1);
      e.kx = 0; e.ky = 0;
    }
    if (dt > 0) { e.mvx = (e.x - ox0) / dt; e.mvy = (e.y - oy0) / dt; }   // its walking velocity (the grass it tramples leans that way)
    if (e.bonk > 0) {   // flung by a Cyclone Gust: if it slams into another foe while it is still flying, both bonk
      e.bonk -= dt;
      if (Math.hypot(e.kx, e.ky) > 4) for (const o of en) {
        if (o === e || o.dead || o.fall > 0 || Math.hypot(o.x - e.x, o.y - e.y) > e.rad + o.rad + 0.1) continue;
        const dmg = e.bonkDmg || 0;
        e.bonk = 0; WZ.hurtE(e, dmg, 0, 0); WZ.hurtE(o, dmg, e.kx * 0.4, e.ky * 0.4);
        WZ.puff((e.x + o.x) / 2, (e.y + o.y) / 2, '#ffffff', 6); WZ.icon((e.x + o.x) / 2, (e.y + o.y) / 2, 'ic_bolt'); AU.sfx('thud');
        break;
      }
    }
    const decay = Math.exp(-6 * dt); e.kx *= decay; e.ky *= decay;
    e.face = (ex - ey) >= 0 ? 1 : -1;
    // touch damage
    const reach = e.rad + 0.45;
    if (TG.mill) { /* it does not know he is there: no touch */ } else if (TG.a) {   // hunting an ally: the touch is for it, not for the Wizard
      if (d < e.rad + TG.a.rad + 0.25 && e.cd <= 0) {
        e.cd = cfg.touchCd * rand(0.85, 1.3);
        WZ.hurtAlly(TG.a, (e.diving && e.diveDmg) || e.dmg, ex / d * 4, ey / d * 4);
        if (!e.boss) { e.kx -= ex / d * 6; e.ky -= ey / d * 6; }
      }
    } else if (d < reach && e.cd <= 0 && w.roll <= 0 && w.hurtT > 0) e.cd = rand(0.15, 0.45);   // queued: strike a little later
    else if (d < reach && e.cd <= 0 && w.roll <= 0 && w.hurtT <= 0) {
      e.cd = cfg.touchCd * rand(0.85, 1.3);
      WZ.damage((e.diving && e.diveDmg) || e.dmg);
      if (WZ.has('static') && !w.dead) WZ.staticBurst();   // the Static Cloak: whatever struck him is thrown back by a burst of static
      if (!e.boss) { e.kx -= ex / d * 6; e.ky -= ey / d * 6; }   // bump the attacker back a little
    } else if (d < reach && e.cd <= 0 && w.roll > 0) { e.cd = 0.3; WZ.dodge(); }
  }
  w.enemies = en.filter(e => !e.dead);
  WZ.allyTick(dt);   // the friendly creatures fight (after the hostiles have had their turn at them)
  WZ.bendTick(dt);

  // projectiles
  for (let i = w.proj.length - 1; i >= 0; i--) {
    const p = w.proj[i];
    WZ.ctx = p.ctx;
    const sp = WZ.projSpecial(p, dt);   // lobs, bouncing boulders, waves, mudslides, icicles, bolts from the sky (null = a plain bolt)
    if (sp !== null) { if (sp) w.proj.splice(i, 1); WZ.ctx = null; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (G.menu && p.ctx) Menu.touch(p.x, p.y, p.r || 0.4);   // (menu world: a bolt flying over a safe plate presses it)
    let hit = null, hitE = false;
    for (const e of w.enemies) { if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.rad) { hit = e; hitE = true; break; } }
    if (!hit) for (const h of WZ.hitH()) { if (!h.broken && Math.hypot(h.x - p.x, h.y - p.y) < p.r + (h.rad || 0.4)) { hit = h; break; } }
    if (!hit && p.ctx && WZ.altarBlocks(p.x, p.y, p.r)) hit = 'altar';   // a bolt or boulder that reaches the Summoning Altar bursts on it
    WZ.ctx = p.ctx;
    if (hit === 'altar') {
      WZ.altarHit(p.ctx);
      if (p.kind === 'magma') { WZ.explode(p.x, p.y, p.sr, p.dmg, '#ff4a1a'); WZ.zone({ x: p.x, y: p.y, r: 3, t: 3, dps: 10, slow: 0, col: '#ff6a1a' }); }
      else if (p.splash) WZ.explode(p.x, p.y, p.sr, p.splash, p.kind === 'rock' ? '#a98a5c' : '#ff9a2b');
      else { WZ.mark(p.x, p.y, 1); WZ.puff(p.x, p.y, p.col, 5); }
      w.proj.splice(i, 1);
    } else if (hit) {
      if (p.kind === 'magma') {
        WZ.explode(p.x, p.y, p.sr, p.dmg, '#ff4a1a');
        WZ.zone({ x: p.x, y: p.y, r: 3, t: 3, dps: 10, slow: 0, col: '#ff6a1a' });
      } else {
        WZ.hit(hit, hitE, p.dmg, hitE ? p.vx * 0.15 : 0, hitE ? p.vy * 0.15 : 0);
        if (hitE && p.slow) WZ.slowE(hit, p.slow, p.slowT);
        if (p.splash) WZ.explode(p.x, p.y, p.sr, p.splash, p.kind === 'rock' ? '#a98a5c' : '#ff9a2b', hit);
        else WZ.mark(p.x, p.y, 1);
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
    let ha = null;
    for (const a of w.allies) if (!a.dead && !(a.fall > 0) && Math.hypot(a.x - p.x, a.y - p.y) < a.rad + 0.35) { ha = a; break; }
    if (ha) { WZ.hurtAlly(ha, p.dmg, p.vx * 0.15, p.vy * 0.15); w.eproj.splice(i, 1); continue; }   // it hit an ally in the way
    const pd = Math.hypot(p.x - w.x, p.y - w.y);
    if (w.roll > 0 && pd < 0.9 && !p.dodged) { p.dodged = true; WZ.dodge(); }   // rolled clean through it
    else if (pd < 0.55 && w.roll <= 0 && w.hurtT <= 0) { WZ.damage(p.dmg); w.eproj.splice(i, 1); }
  }
  // an ally's shots (an Imp's ember, a Dragon's breath): they hurt hostiles, never the Wizard or other allies
  for (let i = w.aproj.length - 1; i >= 0; i--) {
    const p = w.aproj[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0 || WZ.wet(p.x, p.y)) { w.aproj.splice(i, 1); continue; }
    let hit = null;
    for (const e of w.enemies) if (!e.dead && !(e.fall > 0) && Math.hypot(e.x - p.x, e.y - p.y) < e.rad + 0.35) { hit = e; break; }
    if (hit) { WZ.hurtE(hit, p.dmg, p.vx * 0.15, p.vy * 0.15); w.aproj.splice(i, 1); }
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
      z.tka = (z.tka || 0) + dt;
      const tickA = z.tka >= 0.5; if (tickA) z.tka = 0;
      for (const a of w.allies) {   // allies are caught in it like the Wizard
        if (a.dead || a.fall > 0 || Math.hypot(a.x - z.x, a.y - z.y) >= z.r) continue;
        if (z.slow) WZ.slowE(a, z.slow, 0.25);
        if (z.dps && tickA) WZ.hurtAlly(a, z.dps * 0.5, 0, 0);
      }
      if (z.t <= 0) w.zones.splice(i, 1);
      continue;
    }
    if (z.ally) {   // a friendly creature's zone (a slime's splash, a lava trail, a mud snare): it slows / burns hostiles only
      for (const e of w.enemies) {
        if (e.dead || e.fall > 0 || Math.hypot(e.x - z.x, e.y - z.y) >= z.r + e.rad) continue;
        if (z.slow) WZ.slowE(e, z.slow, 0.25);
        if (z.dps) WZ.hurtE(e, z.dps * dt, 0, 0, true);
      }
      if (z.t <= 0) w.zones.splice(i, 1);
      continue;
    }
    if (z.frost && (z.fk -= dt) <= 0) { z.fk = z.frost; WZ.freeze(z.x, z.y, z.r, CFG.spells.blizzard.frost.t); }   // the Blizzard freezes the ground it passes over
    WZ.ctx = z.ctx;
    if (!WZ.zoneSpecial(z, dt)) WZ.each(z.x, z.y, z.r, (t, d, isE) => {   // (a flame cone, the storm cloud, a droplet, the mud shield, the Nova's pull do their own thing)
      if (z.dps) { if (isE) WZ.hurtE(t, z.dps * dt, 0, 0, true); else WZ.hurtHc(t, z.dps * dt); }
      if (isE && z.slow) WZ.slowE(t, z.slow, 0.25);
    });
    WZ.ctx = null;
    if (z.t <= 0) { if (z.kind === 'novapull') WZ.novaBurst(z); w.zones.splice(i, 1); }   // the Nova bursts when its gathering is done
  }
  w.zSlow = zs;
  WZ.mineTick(dt);
  WZ.boomTick(dt);

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
    if (dr.hide > 0) dr.hide -= dt;
    if (dr.rejT > 0) { dr.rejT -= dt; continue; }   // it was just turned away by the portal over his head: it lies where it fell for a moment
    const loot = WZ.isLoot(dr.kind), keep = WZ.keepDrop(dr), vac = keep ? WZ.vacuum() * 2.5 : WZ.vacuum();   // shards, Cores, garments and the factory's overflow are precious: they come to you
    if (dr.t > 0.3 && d < vac) {
      const sp2 = 7 + (vac - d) * 7;
      dr.x += ex / (d || 1) * sp2 * dt; dr.y += ey / (d || 1) * sp2 * dt;
      dr.mag = true;
    }
    if (d < 0.45 && dr.t > 0.3) {
      // everything he picks up is sucked into a little portal over his head. What goes to the Stockpile only goes when it has room for it:
      // otherwise the portal spits it back out and it falls to the ground with a bounce (WZ.hsuck, rej)
      if (dr.kind !== 'xp' && FA.room(dr.kind) < dr.val) { WZ.reject(dr); continue; }
      WZ.hsuck(dr.kind, dr.x, dr.y, false, dr.val);
      if (dr.kind === 'xp') { G.xp += dr.val; G.stats.xpEarned += dr.val; w.run.xp += dr.val; AU.sfx(dr.val >= CFG.bigGem.tiers[1] ? 'gemBig' : 'gem'); if (dr.val >= CFG.bigGem.tiers[1]) WZ.num(w.x, w.y, '+' + dr.val, '#7be0ff'); }
      else if (loot) WZ.collect(dr);
      else if (ELEM[dr.kind]) {   // a recycled packet flies out of the Spell Portal onto its Stockpile tile
        FA.toStock(dr.kind, dr.val); AU.sfx('el_' + dr.kind);
      }
      else if (ITEMS[dr.kind] && ITEMS[dr.kind].spell) { FA.toStock(dr.kind, dr.val); AU.sfx('chest'); }   // a recycled combo spell does the same, as spell stock
      else if (dr.kind === 'shard') { FA.toStock('shard', dr.val); w.run.shards += dr.val; G.stats.shards = (G.stats.shards || 0) + dr.val; AU.sfx('shard'); }
      else if (dr.home) { FA.toStock(dr.kind, dr.val); AU.sfx('pickup'); }   // the factory's overflow going back home
      else { FA.toStock(dr.kind, dr.val); w.run.harvested += dr.val; G.stats.harvested += dr.val; AU.sfx('pickup'); }
      w.drops.splice(i, 1);
    } else if (dr.t > 120 && !keep) w.drops.splice(i, 1);
  }
};
// drops that never fade and are banked when a run ends: shards, Cores, the Warden Key, garments, the factory's overflow and anything the portal turned away once
WZ.keepDrop = dr => dr.kind === 'shard' || WZ.isLoot(dr.kind) || !!(ITEMS[dr.kind] && ITEMS[dr.kind].aug) || !!dr.home || !!dr.rej;
// the little portal over his head: the picked-up thing spirals up into it (rej = it is spat back out, falls to where it lay and bounces)
WZ.hsuck = function (kind, x, y, rej, val) {
  const w = G.w;
  w.fx_.push({ type: 'hsuck', kind, val: val || 1, x, y, t: 0, dur: rej ? 1.05 : 0.42, rej: !!rej, seed: Math.random() * 6.283 });
};
WZ.reject = function (dr) {
  const w = G.w;
  dr.rejT = 1.05 + CFG.stockReject; dr.rej = true; dr.hide = 1.05; dr.vx = 0; dr.vy = 0;
  WZ.hsuck(dr.kind, dr.x, dr.y, true);
  AU.sfx('boing');
  if (w.t - (w.fullAt || -99) > 12) {
    w.fullAt = w.t;
    UI.toast('The Stockpile is full: the portal spits it back out', 'R', 'ic_x');
    UI.toast('No room in the Stockpile for ' + itemName(dr.kind) + ': build Stockpile Tiles (slot 8)', 'L', 'b:stockpile');
  }
};
