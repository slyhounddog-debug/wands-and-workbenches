'use strict';
// Factory-side game logic: grid, blueprints, belts, machines, power, batteries, physical items, portals, the Builder.
let G = null;   // the whole game state (also exposed as window.__wands.G for tests)

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 0 = east (+x) 1 = south (+y) 2 = west 3 = north

// upgrade level of a tree node (unlock nodes are true/false, upgrade tracks are tier numbers)
const lvl = id => { const v = G.tree[id]; return typeof v === 'number' ? v : (v ? 1 : 0); };

const FA = {};
// ----- layout: a fixed grid (G.fac.w x G.fac.h) of which only the tiles in G.fac.land are floor. The Stockpile Zone is fixed in the base rectangle's south-west corner -----
FA.W = () => G.fac.w;
FA.H = () => G.fac.h;
FA.base = () => CFG.factory.base;
// the two portals stand on the east edge of the floor they came with (G.fac.pp = the Spell Portal's top cell; the Skill Portal is 4 rows lower)
FA.portalCells = () => { const p = G.fac.pp; return [{ x: p.x, y: p.y, which: 'spell' }, { x: p.x, y: p.y + 1, which: 'spell' }, { x: p.x, y: p.y + 4, which: 'skill' }, { x: p.x, y: p.y + 5, which: 'skill' }]; };
FA.portal = which => { const p = G.fac.pp; return { x: p.x, y: which === 'skill' ? p.y + 4 : p.y }; };   // top cell of a portal
FA.zone = () => { const B = CFG.factory.base; return { x0: B.x0, y0: B.y0 + B.h - 5, x1: B.x0 + 4, y1: B.y0 + B.h - 1 }; };
FA.piles = () => {
  const z = FA.zone(), x = z.x0, y = z.y0;
  // a 2x2 block on screen: wood | stone over iron | shard (the zone is 5x5 in the south-west corner of the base floor)
  // the four spell spots (element packets the Wizard picked up) sit at the corners of the zone around them
  return { wood: { x: x + 1.0, y: y + 2.5 }, stone: { x: x + 2.5, y: y + 1.0 }, iron: { x: x + 3.1, y: y + 4.6 }, shard: { x: x + 4.6, y: y + 3.1 }, core: { x: x + 4.3, y: y + 1.7 },
    air: { x: x + 0.8, y: y + 0.7 }, water: { x: x + 0.7, y: y + 4.3 }, fire: { x: x + 4.6, y: y + 0.4 }, earth: { x: x + 4.5, y: y + 4.7 } };
};
FA.inb = (x, y) => x >= 0 && y >= 0 && x < G.fac.w && y < G.fac.h;
FA.owned = (x, y) => FA.inb(x, y) && G.fac.land[y * G.fac.w + x] === 1;   // is this tile factory floor?
FA.cell = (x, y) => (FA.inb(x, y) ? G.fac.grid[y * G.fac.w + x] : undefined);
FA.setCell = (x, y, v) => { G.fac.grid[y * G.fac.w + x] = v; };
FA.reserved = (x, y) => { const z = FA.zone(); return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1; };

// ----- upgrade effects -----
FA.cap = () => CFG.satchel + lvl('satchel') * CFG.upgrade.satchel;
FA.beltTime = () => CFG.beltTime / (1 + CFG.upgrade.belts * lvl('belts'));
// the Wizard standing at a shrine speeds up that element's harnessers (G.w.shrine, set by WZ.updMarks)
FA.shrineBoost = b => {
  const el = b.el, w = G.w;
  if (!w || !el) return 1;
  return (w.shrine && w.shrine === el ? 1 + CFG.marks.shrineBoost : 1) * (w.surge && w.surge === el ? 1 + CFG.events.storm.boost : 1);   // a claimed shrine, and the Portal Storm's surging element
};
FA.cycle = b => CFG.harness[b.el].cycle / (1 + CFG.upgrade.swift * lvl('swift')) / FA.shrineBoost(b);
// a Harnesser makes nothing while its crystal grows (CFG.harness.growT s after every switch) or shakes (shakeT s once it is grown)
FA.growing = b => b.grow < CFG.harness.growT || b.shake > 0;
// a Battery holds batteryLife seconds at stationGen power; Heavy Batteries hold 50% more. pw = the power this one battery carries
FA.drain = pw => pw * CFG.batteryMax / (CFG.batteryLife * CFG.stationGen) / (G.tree.heavy ? 1 + CFG.heavyBattery : 1);
// seconds left in a Station's Battery at its current load (or at full load while nothing draws)
FA.life = b => b.bat / FA.drain(G.fac.perBat > 0 ? G.fac.perBat : CFG.stationGen);
// Adjacency Overdrive: a Forge or Cauldron with a charged Battery Station on one of its four sides crafts faster
FA.overdrive = function (b) {
  if (b.type !== 'forge' && b.type !== 'cauldron') return false;
  return DIRS.some(d => { const c = FA.cell(b.x + d[0], b.y + d[1]); return !!c && c.type === 'station' && c.done && c.bat > 0; });
};
FA.def = b => CFG.buildings[b.type];
FA.count = type => G.fac.bld.filter(b => b.type === type && b.done).length;
FA.unlocked = id => {
  if (id === 'hand' || id === 'belt') return true;
  const u = CFG.buildings[id].unlock;
  return !u || !!G.tree[u];
};
FA.isDeliverable = k => !!ITEMS[k] && !!(ITEMS[k].elem || ITEMS[k].spell || ITEMS[k].pickup || ITEMS[k].sigil || ITEMS[k].egg);   // Spell Portal
FA.isBankable = k => SPELL_KINDS.indexOf(k) >= 0;                                                 // Skill Portal
// a Sigil only goes through while the Wizard is alive and no Chimera is already out
// an Egg is taken while the crafted-creature cap has room, then it waits in the portal queue; a full queue stops the portal taking more
FA.eggRoom = () => G.fac.eggQ.length < CFG.crafted.queue || (!G.w.dead && WZ.craftedAlive() < CFG.crafted.cap);
FA.portalTakes = (c, k) => (c.which === 'skill' ? FA.isBankable(k) : FA.isDeliverable(k) && (k !== 'sigil' || (!G.w.dead && !G.w.boss)) && (!ITEMS[k].egg || FA.eggRoom()));
FA.isLogi = b => { const k = FA.def(b).kind; return k === 'splitter' || k === 'crate'; };

FA.fresh = function (w, h) {
  const f = { w, h, grid: new Array(w * h).fill(null), land: new Array(w * h).fill(0), pp: { x: 0, y: 0 }, added: 0, bld: [], belts: [], floor: [], flying: [], parts: [], pops: [],
    portalQ: [], eggQ: [], portalT: 0, nextId: 1, gen: 0, demand: 0, lowT: 0, flash: 0, flashCol: '#fff', skillFlash: 0, t: 0,
    log: { spell: [], skill: [] }, working: 0, thumps: [], sucks: [], bump: 0, bumpAmp: 0, weakFlash: 0, stockNext: 0,
    rings: [], waves: [],   // throw impact rings, Spell Portal shockwaves
    elAct: { air: 0, water: 0, fire: 0, earth: 0 }, weather: { air: 0, water: 0, fire: 0, earth: 0 } };   // element packets handled lately -> the wilds' weather (0..1 each)
  return f;
};
// floor tiles: land[] (1 = floor), the portals sit on the east edge of the floor they came with
FA.setLand = function (x0, y0, w, h) { const f = G.fac; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) f.land[y * f.w + x] = 1; };
FA.setPortals = function (px, py) {
  const f = G.fac;
  f.pp = { x: px, y: py };
  for (const p of FA.portalCells()) f.grid[p.y * f.w + p.x] = { type: 'portal', x: p.x, y: p.y, which: p.which };
};
FA.initial = function () {
  const F = CFG.factory, B = F.base;
  G.fac = FA.fresh(F.w, F.h);
  FA.setLand(B.x0, B.y0, B.w, B.h);
  FA.setPortals(B.x0 + B.w - 1, B.y0 + 1);
  const ox = B.x0, oy = B.y0, sy = oy + 1;   // the base rectangle's own coordinates (the Stockpile fills its south-west 5x5, rows 3-7)
  const st = FA.makeBuilding('station', ox + 1, oy + 1, true, false, 0); st.bat = CFG.batteryMax;   // a full Battery already inside
  FA.makeBuilding('charger', ox + 3, oy + 1, true, false, 0).bat = 0;   // a spare, flat Battery waits in the Charger
  // one Air Harnesser, 2 belts, then a free Splitter beside the portals, turned north at 90 degrees: pink side A = east (2 belts straight
  // into the Spell Portal's top cell), cyan side B = south (a Creature Spawner, Zephyr Wisps, then 2 belts into the lower cell)
  const sx = ox + B.w - 4;
  FA.makeBuilding('harness', sx - 3, sy, true, false, 0);
  FA.addBelt(sx - 2, sy, 0); FA.addBelt(sx - 1, sy, 0);
  const sp = FA.makeBuilding('splitter', sx, sy, true, true, 3);
  FA.addBelt(sx + 1, sy, 0); FA.addBelt(sx + 2, sy, 0);
  FA.makeBuilding('spawner1', sx, sy + 1, true, false, 0);
  FA.addBelt(sx + 1, sy + 1, 0); FA.addBelt(sx + 2, sy + 1, 0);
  FA.splitConn(sp); sp.pct = { 0: CFG.starterSplit, 1: 100 - CFG.starterSplit };   // its outputs are east (the portal belts) and south (the Spawner)
  G.bd = FA.freshBuilder();
};
FA.freshBuilder = () => { const B = CFG.factory.base; return { x: B.x0 + 6.5, y: B.y0 + 4.5, vx: 0, vy: 0, fx: 1, fy: 0, target: null, then: null, stuckT: 0, gather: null, apT: 0,
  bob: 0, moving: false, squash: 0, throwCd: 0, dustT: 0 }; };

// Floor Tiles: a blueprint placed just outside the floor; thrown its materials like any building, it turns into floor when finished.
// The Iron cost only starts after the first CFG.factory.freeIron tiles were placed.
FA.tileCost = () => { const c = Object.assign({}, CFG.buildings.expand.cost); if (G.fac.added >= CFG.factory.freeIron) c.iron = 1; return c; };
FA.canExpand = (x, y) => FA.inb(x, y) && !FA.owned(x, y) && !FA.reserved(x, y) && !G.fac.grid[y * G.fac.w + x] &&
  DIRS.some(d => FA.owned(x + d[0], y + d[1]));
FA.costOf = b => b.cost || FA.def(b).cost;   // a Floor Tile's cost depends on how many came before it
FA.finishTile = function (b) {   // the blueprint is paid for: the tile becomes floor and the blueprint goes away
  const f = G.fac;
  f.land[b.y * f.w + b.x] = 1;
  f.bld.splice(f.bld.indexOf(b), 1);
  FA.setCell(b.x, b.y, null);
  G.stats.tiles = (G.stats.tiles || 0) + 1;
  FA.burst(b.x + 0.5, b.y + 0.5, '#8ee06a', 20); FA.ipop(b.x + 0.5, b.y + 0.5, [['ic_check']]);
  AU.sfx('complete'); UI.changed();
};

FA.makeBuilding = function (type, x, y, done, free, dir) {
  const f = G.fac, d = CFG.buildings[type];
  const b = { id: f.nextId++, type, x, y, dir: dir || 0, done: !!done, free: !!free, got: {}, out: [], timer: 0,
    powered: true, draw: 0, pop: 0, anim: Math.random() * 6 };
  if (d.kind === 'crafter') { b.recipe = null; b.inv = {}; b.prog = 0; }
  if (d.kind === 'station') b.bat = null;
  if (d.kind === 'charger') { b.bat = null; b.fuel = { air: 0, water: 0, fire: 0, earth: 0, wood: 0, stone: 0 }; b.types = []; }
  if (FA.isLogi(b)) { b.rr = 0; b.cd = 0; }
  if (d.kind === 'harness') { b.hand = 0; b.el = 'air'; b.grow = CFG.harness.growT; b.shake = 0; }   // hand: how far the Builder has cranked the next packet (it stays when he walks away); el / grow: the element crystal and how far it has grown
  if (d.kind === 'splitter') { b.pct = {}; b.filt = {}; b.outs = []; b.ins = []; b.sig = null; b.acc = {}; b.src = {}; }
  f.bld.push(b);
  FA.setCell(x, y, b);
  if (b.done) FA.onComplete(b, true);
  return b;
};
FA.onComplete = function (b, quiet) {
  b.done = true;
  if (FA.def(b).kind === 'harness' && !quiet) { b.grow = 0; b.shake = 0; }   // a new Harnesser grows its crystal first
  if (FA.def(b).kind === 'expand') { FA.finishTile(b); return; }
  if (FA.def(b).kind === 'crafter' && !b.recipe) b.recipe = FA.recipesFor(b.type)[0] || null;
  if (!quiet) {
    FA.burst(b.x + 0.5, b.y + 0.5, '#ffe36b', 22);
    AU.sfx('complete');
    b.pop = 0.5;
  }
};
FA.addBelt = function (x, y, dir) {
  const b = { type: 'belt', x, y, dir, item: null };
  G.fac.belts.push(b);
  FA.setCell(x, y, b);
  return b;
};
FA.burst = function (x, y, col, n) {
  for (let i = 0; i < (n || 14); i++) {
    const a = Math.random() * 6.283, s = 1 + Math.random() * 2.5;
    G.fac.parts.push({ x, y, z: 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 2 + Math.random() * 3, t: 0.8, col });
  }
};
// every element has its own particle pattern (so it reads without colour): air swirls up as rings, water falls as
// drops, fire flickers upward, earth tumbles as heavy chunks. render.js draws the matching shape (p.el)
const EL_PART = {
  air:   (a, s) => ({ vx: Math.cos(a) * s * 0.7, vy: Math.sin(a) * s * 0.7, vz: 1 + Math.random(), g: -1, spin: 1 }),
  water: (a, s) => ({ vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s * 0.6, vz: 3 + Math.random() * 2, g: 14 }),
  fire:  (a, s) => ({ vx: Math.cos(a) * s * 0.3, vy: Math.sin(a) * s * 0.3, vz: 1.5 + Math.random() * 2, g: -3 }),
  earth: (a, s) => ({ vx: Math.cos(a) * s * 0.9, vy: Math.sin(a) * s * 0.9, vz: 2.5 + Math.random() * 2, g: 18, bounce: 1 }),
};
FA.eburst = function (x, y, el, n) {
  if (!EL_PART[el]) return FA.burst(x, y, '#ffffff', n);
  for (let i = 0; i < (n || 10); i++) {
    const a = Math.random() * 6.283, o = EL_PART[el](a, 1 + Math.random() * 2);
    G.fac.parts.push(Object.assign({ x, y, z: 0.3, t: 0.8 + Math.random() * 0.3, col: Math.random() < 0.3 ? '#ffffff' : ELEM[el].color, el }, o));
  }
};
FA.pop = function (x, y, text, col) { G.fac.pops.push({ x, y, text, col: col || '#fff', t: 0 }); };
// an icon pop instead of words: a row of [spriteKey, number?] floating up
FA.ipop = function (x, y, ic) { G.fac.pops.push({ x, y, ic, t: 0 }); };
FA.pileIn = k => { const p = FA.piles()[k]; if (p) FA.ipop(p.x, p.y - 0.4, [[k]]); };   // a harvest reached the Stockpile
// something for the Stockpile (from the wilds: harvests, shards, Cores, spells, gifts) comes out of the Spell Portal and flies to its pile;
// the count goes up when it lands. Up to 6 flights share n, a beat apart. The save counts anything still in the air as already there.
FA.toStock = function (kind, n) {
  n = n || 1;
  const f = G.fac, p = FA.piles()[kind], port = FA.portal('spell');
  if (!p) { G.stock[kind] = (G.stock[kind] || 0) + n; return; }
  const px = port.x + 0.5, py = port.y + 1, d = Math.hypot(p.x - px, p.y - py), fl = Math.min(n, 6);
  for (let i = 0; i < fl; i++) {
    const delay = Math.max(0, f.stockNext - f.t);
    f.stockNext = f.t + delay + CFG.stockFlight.gap;
    f.flying.push({ kind, n: Math.floor(n / fl) + (i < n % fl ? 1 : 0), stock: true, sx: px, sy: py, x: px, y: py, z: 0.8, tx: p.x, ty: p.y, t: -delay,
      T: Math.min(CFG.stockFlight.maxT, CFG.stockFlight.baseT + d * CFG.stockFlight.perTile), h: 1.5 + d * 0.15 });
  }
};
FA.inFlight = function () {   // what the saved stock must add: stock-bound items still in the air
  const out = {};
  for (const o of G.fac.flying) if (o.stock) out[o.kind] = (out[o.kind] || 0) + (o.n || 1);
  return out;
};
FA.say = a => { if (a.ic) FA.ipop(G.bd.x, G.bd.y - 0.3, a.ic.map(k => [k])); else if (a.label) FA.pop(G.bd.x, G.bd.y - 0.3, a.label, '#ffd0a0'); };   // why an action can't happen

// ---------- hands & floor items ----------
// The hands are ONE pile of single items, G.hands (bottom first, the last one grabbed on top), at most FA.cap() items in total whatever they are.
// The top of the pile is what a throw sends first (last in, first out).
FA.top = () => (G.hands.length ? G.hands[G.hands.length - 1] : null);
FA.topKind = () => { const t = FA.top(); return t ? t.kind : null; };
FA.canHold = () => G.hands.length < FA.cap();
FA.addHands = function (k, n, charge) {
  for (let i = 0; i < n; i++) G.hands.push(k === 'battery' ? { kind: k, charge: charge || 0 } : { kind: k });
};
FA.takeOne = function () {
  const it = G.hands.pop();
  return it ? { kind: it.kind, charge: it.charge } : null;
};
FA.dropAt = function (kind, x, y, charge) {
  const a = Math.random() * 6.283, r = Math.random() * 0.25;
  G.fac.floor.push({ kind, charge, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: 0.4, vz: 2.5, t: 0 });
};
FA.dropHands = function () {   // never deletes: everything lands on the floor at the Builder's feet
  while (G.hands.length) { const it = FA.takeOne(); FA.dropAt(it.kind, G.bd.x, G.bd.y, it.charge); }
};
FA.stash = function () {       // resources back to the Stockpile; anything else lands on the floor
  if (!G.hands.length) return;
  G.hands = G.hands.filter(h => { if (RES[h.kind]) G.stock[h.kind]++; return !RES[h.kind]; });
  FA.dropHands(); AU.sfx('drop');
};
FA.pickFloor = function (it) {   // one item per press (hold to keep grabbing)
  const f = G.fac, i = f.floor.indexOf(it);
  if (i < 0 || !FA.canHold(it.kind)) return;
  FA.addHands(it.kind, 1, it.charge);
  f.floor.splice(i, 1);
  AU.sfx('pickup'); G.bd.squash = 0.2;
};

// ---------- placement / demolish ----------
FA.canPlace = (x, y) => FA.owned(x, y) && !FA.reserved(x, y) && !G.fac.grid[y * G.fac.w + x];
FA.needOf = function (b) {
  const cost = FA.costOf(b), need = {};
  for (const k in cost) { const n = cost[k] - (b.got[k] || 0); if (n > 0) need[k] = n; }
  return need;
};
FA.needText = need => Object.keys(need).map(k => need[k] + ' ' + RES[k].name).join(', ');
FA.place = function (type, x, y, dir) {
  if (!FA.unlocked(type)) { UI.toast('Unlock ' + CFG.buildings[type].name + ' in the Skill Tree first.', 'L', 'ic_lock'); AU.sfx('error'); return false; }
  if (type === 'expand' ? !FA.canExpand(x, y) : !FA.canPlace(x, y)) return false;
  const credit = G.credits[type] > 0;
  const b = FA.makeBuilding(type, x, y, credit, credit, dir);
  if (type === 'expand') { b.cost = FA.tileCost(); G.fac.added++; }
  if (credit) { G.credits[type]--; FA.burst(x + 0.5, y + 0.5, '#7be0ff', 20); FA.ipop(x + 0.5, y + 0.5, [['ic_gift']]); AU.sfx('complete'); }
  else AU.sfx('place');
  b.pop = 0.4;
  UI.changed();
  return b;
};
FA.placeBelt = function (x, y, dir) {
  if (!FA.inb(x, y)) return false;
  const c = FA.cell(x, y);
  if (c && c.type === 'belt') { if (c.dir !== dir) { c.dir = dir; AU.sfx('blip'); } return true; }
  if (!FA.canPlace(x, y)) return false;
  if (G.stock.wood < 1) { UI.toast('A belt costs 1 Wood from the Stockpile. You\'re out!', 'L', 'wood'); AU.sfx('error'); return false; }
  G.stock.wood--;
  FA.addBelt(x, y, dir);
  AU.sfx('place');
  return true;
};
// force: skip the "you can't place this again yet" question (the confirmation modal calls it back with true)
FA.demolish = function (x, y, force) {
  const c = FA.cell(x, y);
  if (!c || c.type === 'portal') return false;
  if (!force && c.type !== 'belt' && !FA.unlocked(c.type)) { UI.askDemolish(x, y, FA.def(c).name); return false; }
  const f = G.fac, cx = x + 0.5, cy = y + 0.5;
  if (c.type === 'belt') {
    G.stock.wood += 1;
    if (c.item) FA.dropAt(c.item.kind, cx, cy);
    f.belts.splice(f.belts.indexOf(c), 1);
  } else {
    if (c.done) {
      if (c.free) G.credits[c.type] = (G.credits[c.type] || 0) + 1;
      else { const cost = FA.def(c).cost; for (const k in cost) G.stock[k] += cost[k]; }
    } else for (const k in c.got) G.stock[k] += c.got[k];
    for (const o of c.out) FA.dropAt(o.kind, cx, cy, o.charge);
    if (c.inv) for (const k in c.inv) { if (RES[k]) G.stock[k] += c.inv[k]; else for (let i = 0; i < c.inv[k]; i++) FA.dropAt(k, cx, cy); }
    if (c.bat != null) FA.dropAt('battery', cx, cy, c.bat);
    f.bld.splice(f.bld.indexOf(c), 1);
    if (c.type === 'expand') f.added = Math.max(0, f.added - 1);   // an unfinished Floor Tile never counted
  }
  FA.setCell(x, y, null);
  FA.burst(cx, cy, '#ff9a8a');
  FA.ipop(cx, cy, c.type === 'belt' ? [['wood']] : Object.keys(FA.def(c).cost).map(k => [k]));   // what came back
  AU.sfx('drop');
  UI.changed();
  return true;
};

// ---------- recipes ----------
FA.recipeOk = id => { const r = CFG.recipes[id]; return (!r.tier || !!G.tree[r.tier]) && (!r.req || !!G.tree[r.req]) && (r.out !== 'battery' || !!G.tree.forge); };
FA.recipesFor = type => Object.keys(CFG.recipes).filter(id => CFG.recipes[id].machine === type && FA.recipeOk(id));
FA.refreshRecipes = function () {
  for (const b of G.fac.bld) if (b.done && FA.def(b).kind === 'crafter' && !b.recipe) b.recipe = FA.recipesFor(b.type)[0] || null;
};
FA.setRecipe = function (b, id) {
  b.recipe = id; b.prog = 0;
  const R = CFG.recipes[id], side = DIRS[(b.dir + 1) % 4];
  for (const k in b.inv) {   // eject inputs the new recipe can't use (never delete them)
    if (!R.in[k] && b.inv[k] > 0) {
      for (let i = 0; i < b.inv[k]; i++) FA.dropAt(k, b.x + 0.5 + side[0] * 0.8, b.y + 0.5 + side[1] * 0.8);
      b.inv[k] = 0;
    }
  }
};
FA.crafterReady = function (b) {   // power draw wanted (or -1 = ready with no power need), 0 = not ready
  if (!b.done || !b.recipe) return 0;
  const R = CFG.recipes[b.recipe];
  if (b.out.length >= CFG.buffer) return 0;
  for (const k in R.in) if ((b.inv[k] || 0) < R.in[k]) return 0;
  return R.power || -1;
};

// ---------- inserting items into things (belts, hands and throws all use this) ----------
FA.canInsert = function (b, kind) {
  if (!b || b.type === 'belt' || b.type === 'portal') return false;
  if (!b.done) return (FA.needOf(b)[kind] || 0) > 0;
  const d = FA.def(b);
  if (d.kind === 'crafter') {
    if (!b.recipe) return false;
    const need = CFG.recipes[b.recipe].in[kind];
    return !!need && (b.inv[kind] || 0) < Math.max(6, need * 3);
  }
  if (d.kind === 'charger') {
    if (kind === 'battery') return b.bat == null;
    return FA.isFuel(kind) && FA.fuelTotal(b) + CFG.fuelPerPacket <= CFG.fuelCap;
  }
  if (d.kind === 'station') return kind === 'battery' && b.bat == null;
  if (d.kind === 'splitter') return kind !== 'battery' && b.out.length < 2;
  if (d.kind === 'crate') return !RES[kind] && kind !== 'battery' && b.out.length < CFG.crateCap;
  return false;
};
FA.insert = function (b, kind, charge, thrown) {
  b.pop = 0.22;
  if (!b.done) {
    b.got[kind] = (b.got[kind] || 0) + 1;
    if (!Object.keys(FA.needOf(b)).length) FA.onComplete(b);
    return;
  }
  const d = FA.def(b);
  if (d.kind === 'crafter') b.inv[kind] = (b.inv[kind] || 0) + 1;
  else if (FA.isLogi(b)) b.out.push({ kind });
  if (d.kind === 'charger' && ELEM[kind]) FA.elTick(kind);   // the weather feels it, and the packet below still fuels the Charger
  if (d.kind === 'station') {
    b.bat = charge || 0;
    if (b.bat <= 0) FA.ipop(b.x + 0.5, b.y + 0.5, [['battery'], ['ic_x']]);
  } else if (d.kind === 'charger') {
    if (kind === 'battery') { b.bat = charge || 0; b.types = Object.keys(b.fuel).filter(k => b.fuel[k] > 0); }
    else { b.fuel[kind] += CFG.fuelPerPacket * (1 + CFG.chargeBonus + (thrown ? CFG.chargeThrowBonus : 0)); if (b.bat != null && b.types.indexOf(kind) < 0) b.types.push(kind); }
  }
};
// a Battery in hand and one in a Station / Charger trade places (nothing ever has to hit the floor)
FA.canSwap = (b, k) => k === 'battery' && !!b && typeof b === 'object' && !!b.done && (b.type === 'station' || b.type === 'charger') && b.bat != null;
FA.takeBat = function (b) {
  const old = b.bat;
  b.bat = null; b.over = 0; if (b.types) b.types = [];
  return old;
};
// Overclocking: a combo spell (tier = its element count) or an Elixir thrown into a Station that holds a Battery overcharges it:
// extra charge past full (up to overcharge.max) and +power for a while (b.over seconds)
FA.overTier = k => (k === 'elixir' ? 1 : ITEMS[k] && ITEMS[k].spell && (SPELL_EL[k] || []).length >= 2 ? SPELL_EL[k].length : 0);
FA.canOver = (b, k) => !!b && typeof b === 'object' && b.type === 'station' && !!b.done && b.bat != null && FA.overTier(k) > 0 && b.bat < CFG.batteryMax * CFG.overcharge.max;
FA.overcharge = function (b, k) {
  const O = CFG.overcharge, n = FA.overTier(k), elx = k === 'elixir';
  b.bat = Math.min(CFG.batteryMax * O.max, b.bat + CFG.batteryMax * (elx ? O.elixir : O.fill[n]));
  b.over = Math.max(b.over || 0, elx ? O.elixirT : O.time[n]);
  b.pop = 0.45;
  G.stats.overcharged = (G.stats.overcharged || 0) + 1;
  (SPELL_EL[k] || []).forEach(el => FA.eburst(b.x + 0.5, b.y + 0.5, el, 6));
  FA.burst(b.x + 0.5, b.y + 0.5, '#fff07a', 14);
  FA.ipop(b.x + 0.5, b.y + 0.5, [[k], ['ic_bolt', '+' + Math.round(b.over)]]);
  AU.sfx('overcharge'); UI.changed();
};
FA.takeOut = function (b) {   // one item per press
  if (!b.out.length || !FA.canHold(b.out[0].kind)) return;
  const o = b.out.shift();
  FA.addHands(o.kind, 1, o.charge);
  AU.sfx('pickup'); G.bd.squash = 0.2;
};
// a Charger burns element packets, Wood and Stone alike (the same seconds per item)
FA.isFuel = k => !!ELEM[k] || k === 'wood' || k === 'stone';
FA.fuelTotal = c => { let n = 0; for (const k in c.fuel) n += c.fuel[k]; return n; };

// ---------- portals ----------
FA.enterPortal = function (c, kind, x, y) {   // returns false if this portal doesn't take that item; (x, y) = where it went in, for the intake animation
  if (!FA.portalTakes(c, kind)) return false;
  if (c.which === 'skill') FA.bank(kind); else FA.deliver(kind, x, y);
  return true;
};
FA.bank = function (kind) {
  G.bank[kind] = (G.bank[kind] || 0) + 1;
  (G.bankLog || (G.bankLog = [])).push(kind);
  if (G.bankLog.length > CFG.bankUndoMax) G.bankLog.shift();
  G.bankTotal = (G.bankTotal || 0) + 1;
  G.stats.banked[kind] = (G.stats.banked[kind] || 0) + 1;
  const f = G.fac, p = FA.portal('skill');
  f.skillFlash = 0.5;
  f.log.skill.push(f.t);
  FA.ipop(p.x + 0.5, p.y + 1, [[kind]]);
  if (ELEM[kind]) { FA.eburst(p.x + 0.5, p.y + 1, kind, 6); AU.sfx('el_' + kind); } else AU.sfx('bank');
  UI.changed();
};
FA.unbank = function () {
  const log = G.bankLog || [];
  while (log.length) {
    const k = log.pop();
    if (!(G.bank[k] > 0)) continue;   // already spent on a skill
    G.bank[k]--; G.bankTotal = Math.max(0, (G.bankTotal || 0) - 1);
    if (G.stats.banked[k]) G.stats.banked[k]--;
    const z = FA.zone();   // the refunded spell lands in the Stockpile Zone, in the middle of the floor space between the resource piles
    const zx = (z.x0 + z.x1 + 1) / 2 + (Math.random() - 0.5) * 1.6, zy = (z.y0 + z.y1 + 1) / 2 + (Math.random() - 0.5) * 1.6;
    FA.dropAt(k, zx, zy);
    FA.ipop(zx, zy, [[k]]);
    G.fac.skillFlash = 0.4;
    UI.changed();
    return k;
  }
  return null;
};
FA.deliver = function (kind, x, y) {
  const f = G.fac, p = FA.portal('spell');
  G.stats.deliveries++;
  G.w.run.deliveries++;
  G.w.run.spells[kind] = (G.w.run.spells[kind] || 0) + 1;
  f.flash = 0.5; f.flashCol = ITEMS[kind].color || '#fff';
  if (ELEM[kind]) FA.eburst(p.x + 0.5, p.y + 1, kind, 8);
  f.log.spell.push(f.t);
  G.flags['sent_' + kind] = true;
  G.stats.sent[kind] = (G.stats.sent[kind] || 0) + 1;   // for the goals: Potions sent, Eggs hatched, combo spells delivered
  if (ITEMS[kind].egg) G.stats.eggs = (G.stats.eggs || 0) + 1;
  else if ((SPELL_EL[kind] || []).length >= 2) G.stats.combos = (G.stats.combos || 0) + 1;
  FA.suck(kind, x === undefined ? p.x + 0.5 : x, y === undefined ? p.y + 1 : y);
  if (kind === 'sigil') WZ.summonBoss();
  else if (ITEMS[kind].egg) WZ.hatch(kind);
  else if (ITEMS[kind].pickup) WZ.send(kind, 'pickup');   // it arcs out of the factory and sails into the wilds, then lands beside him
  else {
    const spell = BASIC_SPELL[kind] || kind;
    if (!BASIC_SPELL[kind]) {
      G.flags.combo = true;
      if (CFG.recipes[kind] && Object.keys(CFG.recipes[kind].in).length === 3) G.flags.triple = true;
    }
    WZ.send(kind, 'spell', spell);
  }
  AU.sfx('deliver');
};
// the Spell Portal's intake show: the item is slurped into the ring, then it shoots up and out of the factory's top-right corner
// (CFG.arc.outT) to come sailing into the wilds from their top-left (G.w.arcs, WZ.send). Drawn by R.drawSuck from G.fac.sucks
FA.suck = function (kind, x, y) {
  G.fac.sucks.push({ kind, x, y, t: 0, dur: CFG.suck.baseT + CFG.arc.outT, col: ITEMS[kind].color || '#ffffff', seed: Math.random() * 6.283 });
};
// a shockwave out of the Spell Portal when something big happens in the wilds (a heavy hit on the Wizard, an event, a Warden waking, the
// Chimera): rings across the floor, and belts / machines jitter as the front passes them (FA.quake)
FA.pressure = function (amp, col) {
  const f = G.fac;
  if (!f) return;
  f.waves.push({ t: 0, amp: Math.min(1.5, amp), col: col || '#ffffff' });
  if (f.waves.length > 4) f.waves.shift();
  f.bump = 0; f.bumpAmp = Math.max(f.bumpAmp, 10 * Math.min(1.5, amp));
  f.flash = Math.max(f.flash, 0.4); f.flashCol = col || '#ffffff';
  AU.sfx('pressure');
};
FA.quake = function (x, y) {   // px of jitter a passing shockwave front gives the tile (x, y) right now (0 when none)
  const f = G.fac, P = CFG.pressure;
  if (!f.waves.length) return 0;
  const p = FA.portal('spell'), d = Math.hypot(x + 0.5 - p.x - 0.5, y + 0.5 - p.y - 1);
  if (d > P.range) return 0;
  let off = 0;
  for (const wv of f.waves) {
    const g = Math.abs(d - wv.t * P.speed);
    if (g < 1.2) off += P.amp * wv.amp * (1 - g / 1.2) * (1 - wv.t / P.life) * (1 - d / P.range) * Math.sin(wv.t * 70 + d * 3);
  }
  return off;
};
// element packets the factory handles (harnessed, gathered, burnt, crafted with) feed the wilds' weather
FA.elTick = (el, n) => { const a = G.fac.elAct; if (a[el] !== undefined) a[el] += n || 1; };
FA.updWeather = function (dt) {
  const f = G.fac, C = CFG.weather, dec = Math.exp(-dt / C.tau), w = G.w;
  for (const el in f.elAct) {
    f.elAct[el] *= dec;
    const rate = f.elAct[el] * 60 / C.tau;   // packets a minute (an exponential window of tau seconds)
    let goal = Math.max(0, Math.min(1, (rate - C.min) / (C.full - C.min)));
    if (w && (w.shrine === el || w.surge === el)) goal = Math.min(1, goal + C.shrine);
    f.weather[el] += Math.max(-C.ease * dt, Math.min(C.ease * dt, goal - f.weather[el]));
  }
};
// a finished craft puffs out of the machine's top: steam for Water, sparks for Fire, wisps for Air, grit for Earth, smoke for no element
const EXH = { water: ['#9ad8ff', '#e8f6ff', 8, -2.5], fire: ['#ff9a3a', '#ffe36b', 4, -4], air: ['#e6f8ff', '#ffffff', 4, -1.5], earth: ['#b58a4c', '#8a6a3c', 4, 1], smoke: ['#9a94a8', '#d8d0e0', 8, -2] };
FA.exhaust = function (b, ins) {
  const els = ins.filter(k => ELEM[k]);
  for (const el of els.length ? els : ['smoke']) {
    const e = EXH[el];
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 6.283, s = 0.3 + Math.random() * 0.6;
      G.fac.parts.push({ x: b.x + 0.5 + Math.cos(a) * 0.15, y: b.y + 0.5 + Math.sin(a) * 0.15, z: 3.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        vz: 1.2 + Math.random() * 1.6, g: e[3], t: 0.9 + Math.random() * 0.5, col: i % 3 ? e[0] : e[1], sz: e[2] + (Math.random() < 0.3 ? 4 : 0) });
    }
  }
};
// a second after a spell resolves in the wilds, tell the Builder how it went (combos always, basics only on weak hits)
FA.landed = function (c) {
  const combo = ['gust', 'fireball', 'spray', 'boulder'].indexOf(c.spell) < 0;
  if (!combo && !c.weak) return;
  // icons: target = foes hit, skull = knocked out, bolt = weak hits (x = it hit nothing)
  const list = c.hits ? [['ic_target', c.hits]] : [['ic_target'], ['ic_x']];
  if (c.kills) list.push(['ic_skull', c.kills]);
  if (c.weak) list.push(['ic_bolt', c.weak]);
  const p = FA.portal('spell');
  FA.ipop(p.x + 0.5, p.y + 1.8, list);
};
// the moment a spell bursts in the wilds, the Spell Portal answers: rings, sparks and a screen bump that grow with
// the spell's tier (1 = basic, 2 = pair, 3 = triple, 4 = Nova)
FA.thump = function (tier, col) {
  const f = G.fac, p = FA.portal('spell');
  f.thumps.push({ t: 0, tier, col });
  FA.burst(p.x + 0.5, p.y + 1, col, 4 + tier * 7);
  if (tier >= 4) FA.burst(p.x + 0.5, p.y + 1, '#ffffff', 16);
  f.bump = 0; f.bumpAmp = Math.max(f.bumpAmp, [0, 4, 10, 18, 30][tier] || 0);
  f.flash = Math.max(f.flash, 0.15 + tier * 0.08); f.flashCol = col;
};

// ---------- logistics ----------
// push the first buffered item out of side `di` (a belt, portal or machine there); never into a belt that feeds us
FA.pushSide = function (b, di) {
  const o = b.out[0];
  if (!o) return false;
  const dd = DIRS[di], c = FA.cell(b.x + dd[0], b.y + dd[1]);
  if (!c) return false;
  if (c.type === 'portal') { if (!FA.enterPortal(c, o.kind, b.x + 0.5, b.y + 0.5)) return false; }
  else if (c.type === 'belt') { if (c.item || o.kind === 'battery' || (c.dir + 2) % 4 === di) return false; c.item = { kind: o.kind, prog: 0, moved: true }; }
  else if (FA.canInsert(c, o.kind)) { FA.insert(c, o.kind, o.charge); if (c.src) c.src[(di + 2) % 4] = b.id; }   // a Splitter remembers who feeds it
  else return false;
  b.out.shift();
  return true;
};
FA.tryOut = b => FA.pushSide(b, b.dir);
// ---------- the Splitter: a router with no front, so it never needs turning. The side items arrive from is its input; every other side with
// something that can take items is an output (up to 3, found every frame: FA.splitConn). Outputs share by b.pct[dir] (always 100 in all; a new
// set of outputs resets them to 50 / 50 or 34 / 33 / 33). An output with filters (b.filt[dir] = item kinds) takes only those kinds, and
// whatever no filter claims is shared by the outputs without filters (Fire + Earth left, Water + Air right). ----------
FA.splitCol = ['#ff5fc8', '#43e0ff', '#ffd23a'];   // outputs 1 / 2 / 3 in side order: the modal, its diagram and the arrows on the tile
FA.splitConn = function (b) {
  const ins = [], outs = [];
  for (let di = 0; di < 4; di++) {
    const dd = DIRS[di], c = FA.cell(b.x + dd[0], b.y + dd[1]), back = (di + 2) % 4;
    if (!c) continue;
    if (c.type === 'portal') { outs.push(di); continue; }
    if (c.type === 'belt') { (c.dir === back ? ins : outs).push(di); continue; }
    const k = FA.def(c).kind;
    if (k === 'splitter') (b.src[di] === c.id ? ins : outs).push(di);          // whichever splitter pushed first is upstream
    else if (c.done && c.dir === back && k !== 'station' && k !== 'charger') ins.push(di);   // it points its output at us
    else if (k !== 'station') outs.push(di);                                   // a Station takes nothing a Splitter carries
  }
  b.ins = ins; b.outs = outs.slice(0, 3);
  const sig = b.outs.join(',');
  if (sig !== b.sig) { b.sig = sig; FA.splitReset(b); }
};
FA.splitReset = function (b) {   // 1 output: 100, 2: 50 / 50, 3: 34 / 33 / 33. Filters stay on outputs that are still there
  const n = b.outs.length, pct = {}, filt = {};
  b.outs.forEach((d, i) => { pct[d] = n === 3 ? (i ? 33 : 34) : Math.round(100 / n); if (b.filt[d] && b.filt[d].length) filt[d] = b.filt[d]; });
  b.pct = pct; b.filt = filt; b.acc = {};
};
FA.splitHas = (b, d) => !!(b.filt[d] && b.filt[d].length);
// the outputs that may take an item of this kind with their weights, the one that is due first (smooth weighted round robin on b.acc)
FA.splitWays = function (b, kind) {
  let c = b.outs.filter(d => FA.splitHas(b, d) && b.filt[d].indexOf(kind) >= 0);
  if (!c.length) c = b.outs.filter(d => !FA.splitHas(b, d));
  let ways = c.map(d => ({ d, w: b.pct[d] || 0 })).filter(o => o.w > 0);
  if (!ways.length) ways = c.map(d => ({ d, w: 1 }));
  return ways.sort((p, q) => ((b.acc[q.d] || 0) + q.w) - ((b.acc[p.d] || 0) + p.w) || p.d - q.d);
};
FA.splitTook = function (b, ways, d) {   // every way earns its weight, the one that took the item pays the total (so shares come out exact)
  const tot = ways.reduce((a, o) => a + o.w, 0);
  for (const o of ways) b.acc[o.d] = Math.max(-2 * tot, Math.min(2 * tot, (b.acc[o.d] || 0) + o.w - (o.d === d ? tot : 0)));
};
// Crate: front.
FA.logiSides = b => [b.dir];
FA.updLogi = function (b, dt) {
  const split = FA.def(b).kind === 'splitter';
  if (split) FA.splitConn(b);
  if (b.cd > 0) { b.cd -= dt; return; }
  if (!b.out.length) { b.blocked = false; return; }
  if (split) {
    const ways = FA.splitWays(b, b.out[0].kind);
    for (const o of ways) if (FA.pushSide(b, o.d)) { FA.splitTook(b, ways, o.d); b.cd = FA.beltTime() * 0.4; b.blocked = false; return; }
    b.blocked = true; return;
  }
  const sides = FA.logiSides(b), n = sides.length, r0 = (b.rr || 0) % n;
  for (let i = 0; i < n; i++) {
    if (FA.pushSide(b, sides[(r0 + i) % n])) {
      b.rr = (r0 + i + 1) % n;
      b.cd = FA.beltTime() * 0.4; b.blocked = false; return;
    }
  }
  // a crate pointing at nothing is just storing, not blocked
  const fd = DIRS[b.dir];
  b.blocked = FA.def(b).kind !== 'crate' || !!FA.cell(b.x + fd[0], b.y + fd[1]);
};
// what every machine is doing right now (render.js turns it into an outline, an icon and an animation speed):
// 'work', 'missing' (has some inputs, not all), 'starve' (has nothing to work with), 'jam' (output waiting: whatever
// is in front won't take it), 'full' (output buffer full: stopped), 'off' (no power), or null (idle and fine)
FA.state = function (b) {
  if (!b.done) return null;
  const d = FA.def(b), k = d.kind;
  if (k === 'harness') {
    if (FA.growing(b)) return null;
    if (b.out.length >= CFG.buffer) return 'full';
    if (!b.powered) return 'off';
    return b.out.length && b.blocked ? 'jam' : 'work';
  }
  if (k === 'crafter') {
    if (b.out.length >= CFG.buffer) return 'full';
    if (b.out.length && b.blocked) return 'jam';
    if (!b.recipe) return 'starve';
    if (b.draw > 0 && !b.powered) return 'off';
    if (FA.crafterReady(b) !== 0) return 'work';
    return Object.keys(CFG.recipes[b.recipe].in).some(i => (b.inv[i] || 0) > 0) ? 'missing' : 'starve';
  }
  if (k === 'splitter') return b.out.length >= 2 ? 'full' : b.out.length ? (b.blocked ? 'jam' : 'work') : null;
  if (k === 'crate') return b.out.length >= CFG.crateCap ? 'full' : b.out.length && b.blocked ? 'jam' : null;
  if (k === 'station') return b.bat == null ? 'starve' : b.bat <= 0 ? 'missing' : G.fac.demand > 0 ? 'work' : null;
  if (k === 'charger') {
    if (b.bat == null) return null;
    if (b.bat >= CFG.batteryMax) return 'full';
    return FA.fuelTotal(b) > 0 ? 'work' : 'starve';
  }
  return null;
};
// how fast a machine animates in each state (stopped machines freeze, starving ones crawl)
FA.stateSpeed = { work: 1, missing: 0.45, starve: 0.15, jam: 0.6, full: 0, off: 0 };
// the first ingredient a crafter is still short of (shown as a ghost over it)
FA.missingOf = function (b) {
  if (!b.recipe) return null;
  const R = CFG.recipes[b.recipe];
  for (const k in R.in) if ((b.inv[k] || 0) < R.in[k]) return k;
  return null;
};
FA.rate = which => G.fac.log[which].length;   // portal entries in the last minute

// ---------- power ----------
FA.wants = function (b) {
  if (!b.done) return 0;
  const d = FA.def(b);
  if (d.kind === 'crafter') return Math.max(0, FA.crafterReady(b));
  if (d.kind === 'harness') return !FA.growing(b) && b.out.length < CFG.buffer ? CFG.harness[b.el].power : 0;
  return 0;
};
FA.power = function () {
  const f = G.fac;
  let gen = 0;
  for (const b of f.bld) if (b.done && b.type === 'station' && b.bat != null && b.bat > 0) gen += CFG.stationGen + (b.over > 0 ? CFG.overcharge.power : 0);
  let budget = gen, demand = 0;
  for (const b of f.bld) {   // placement order decides who stalls first
    const w = FA.wants(b);
    b.draw = w;
    if (w > 0) { demand += w; if (budget >= w) { budget -= w; b.powered = true; } else b.powered = false; }
    else b.powered = true;
  }
  // what actually gets drawn is shared evenly by every charged battery
  let used = 0, nb = 0;
  for (const b of f.bld) { if (b.draw > 0 && b.powered) used += b.draw; if (b.done && b.type === 'station' && b.bat > 0) nb++; }
  f.gen = gen; f.demand = demand; f.perBat = nb ? used / nb : 0;
};

// ---------- per-frame update ----------
FA.update = function (dt) {
  const f = G.fac;
  f.t += dt;
  if (f.flash > 0) f.flash -= dt;
  if (f.skillFlash > 0) f.skillFlash -= dt;
  if (f.weakFlash > 0) f.weakFlash -= dt;
  if (f.bumpAmp > 0) { f.bump += dt; if (f.bump > 0.4) f.bumpAmp = 0; }
  for (let i = f.sucks.length - 1; i >= 0; i--) { f.sucks[i].t += dt; if (f.sucks[i].t > f.sucks[i].dur) f.sucks.splice(i, 1); }
  for (let i = f.thumps.length - 1; i >= 0; i--) { f.thumps[i].t += dt; if (f.thumps[i].t > 0.5 + f.thumps[i].tier * 0.12) f.thumps.splice(i, 1); }
  for (let i = f.rings.length - 1; i >= 0; i--) { f.rings[i].t += dt; if (f.rings[i].t > 0.3) f.rings.splice(i, 1); }
  for (let i = f.waves.length - 1; i >= 0; i--) { f.waves[i].t += dt; if (f.waves[i].t > CFG.pressure.life) f.waves.splice(i, 1); }
  FA.updWeather(dt);
  FA.power();
  if (f.demand > f.gen) {
    f.lowT -= dt;
    if (f.lowT <= 0) { f.lowT = 16; UI.toast('Not enough power: machines are stalling! Charge a Battery.', 'L', 'ic_bolt'); }
  } else f.lowT = 0;
  for (const k in f.log) while (f.log[k].length && f.t - f.log[k][0] > 60) f.log[k].shift();

  f.working = 0;
  for (const b of f.bld) {
    if (b.pop > 0) b.pop -= dt;
    if (b.thump > 0) b.thump -= dt;
    if (!b.done) continue;
    const d = FA.def(b);
    b.anim += dt * (b.st === undefined || b.st === null ? 1 : FA.stateSpeed[b.st]);
    if (d.kind === 'harness') {
      const H = CFG.harness;
      if (b.grow < H.growT) {   // the crystal is growing: nothing is made; when it is full the Harnesser shakes and sparkles for a moment
        b.grow = Math.min(H.growT, b.grow + dt);
        if (b.grow >= H.growT) { b.shake = H.shakeT; b.timer = 0; b.pop = 0.5; FA.eburst(b.x + 0.5, b.y + 0.5, b.el, 18); AU.sfx('el_' + b.el); AU.sfx('complete'); }
      } else if (b.shake > 0) {
        b.shake -= dt; b.sparkT = (b.sparkT || 0) - dt;
        if (b.sparkT <= 0) { b.sparkT = 0.15; FA.eburst(b.x + 0.5, b.y + 0.5, b.el, 3); }
      } else if (b.out.length < CFG.buffer && b.powered) {
        b.timer += dt; f.working++;
        if (b.timer >= FA.cycle(b)) { b.timer = 0; b.out.push({ kind: b.el }); b.pop = 0.25; G.stats.packets++; FA.eburst(b.x + 0.5, b.y + 0.5, b.el, 4); FA.elTick(b.el); }
      }
      b.blocked = b.out.length > 0 && !FA.tryOut(b);
    } else if (d.kind === 'crafter') {
      b.blocked = b.out.length > 0 && !FA.tryOut(b);
      b.od = FA.overdrive(b);
      const w = FA.crafterReady(b);
      if (w !== 0) {
        if (b.powered) {
          const R = CFG.recipes[b.recipe];
          b.prog += dt * (b.od ? 1 + CFG.overdrive : 1); f.working++;
          if (b.prog >= R.time) {
            b.prog = 0;
            for (const k in R.in) b.inv[k] -= R.in[k];
            b.out.push(R.out === 'battery' ? { kind: 'battery', charge: 0 } : { kind: R.out });
            G.stats.made[R.out] = (G.stats.made[R.out] || 0) + 1;
            b.pop = 0.35;
            FA.burst(b.x + 0.5, b.y + 0.5, ITEMS[R.out].color, 10);
            for (const k in R.in) if (ELEM[k]) FA.elTick(k, R.in[k]);
            if (b.type === 'forge' || b.type === 'cauldron') { b.thump = CFG.thump; FA.exhaust(b, Object.keys(R.in)); }   // recoil + exhaust
            AU.sfx('craft');
          }
        }
      } else b.prog = 0;
    } else if (d.kind === 'station') {
      if (b.over > 0) b.over = b.bat == null ? 0 : Math.max(0, b.over - dt);
      if (b.bat != null && f.perBat > 0 && b.bat > 0) {
        b.bat = Math.max(0, b.bat - FA.drain(f.perBat) * dt);
        if (b.bat === 0) FA.ipop(b.x + 0.5, b.y + 0.5, [['battery'], ['ic_x']]);
      }
      if (b.bat != null && b.bat < CFG.batteryMax * CFG.chargeTipAt && !G.flags.chargeTip) {   // first time a Battery runs half down
        G.flags.chargeTip = true;
        if (!G.flags.recharged) {
          UI.toast('Battery below half: throw element packets at the Charger to charge the next one', 'L', 'ic_bolt');
          for (const c of f.bld) if (c.type === 'charger') FA.ipop(c.x + 0.5, c.y + 0.5, [['battery'], ['ic_bolt']]);
        }
      }
    } else if (d.kind === 'charger') FA.updCharger(b, dt);
    else if (FA.isLogi(b)) FA.updLogi(b, dt);
    const st = FA.state(b);
    if (st === b.st) {
      const was = b.stT; b.stT += dt;
      // a state that holds for a moment chirps (only for machines near the Builder, so a big factory isn't a choir)
      if (was < 0.2 && b.stT >= 0.2 && st && b.seen && Math.hypot(G.bd.x - b.x - 0.5, G.bd.y - b.y - 0.5) < CFG.stateSoundR) AU.sfx('st_' + st);
    } else { b.seen = b.st !== undefined; b.st = st; b.stT = 0; }
  }

  // belts: advance, then hand items forward (two passes so chains flow)
  const bt = FA.beltTime();
  for (const bl of f.belts) if (bl.item) { bl.item.prog += dt / bt; bl.item.moved = false; }
  for (let pass = 0; pass < 2; pass++) {
    for (const bl of f.belts) {
      const it = bl.item;
      if (!it || it.prog < 1 || it.moved) continue;
      const dd = DIRS[bl.dir], nc = FA.cell(bl.x + dd[0], bl.y + dd[1]);
      it.prog = 1;
      if (!nc) continue;
      if (nc.type === 'belt') { if (!nc.item) { nc.item = { kind: it.kind, prog: 0, moved: true }; bl.item = null; } }
      else if (nc.type === 'portal') { if (FA.enterPortal(nc, it.kind, bl.x + 0.5, bl.y + 0.5)) bl.item = null; }
      else if (FA.canInsert(nc, it.kind)) { FA.insert(nc, it.kind); bl.item = null; }
    }
  }

  // hand-sent portal queue
  if (f.portalQ.length) {
    f.portalT -= dt;
    if (f.portalT <= 0) {
      f.portalT = CFG.portalGap;
      const q = f.portalQ.shift();
      if (q.which === 'skill') FA.bank(q.kind); else FA.deliver(q.kind);
    }
  }

  // thrown items
  for (let i = f.flying.length - 1; i >= 0; i--) {
    const o = f.flying[i];
    o.t += dt;
    const k = Math.min(1, Math.max(0, o.t / o.T));
    if (o.stock && o.t - dt < 0 && o.t >= 0) { FA.burst(o.sx, o.sy, ITEMS[o.kind].color, 5); f.flash = Math.max(f.flash, 0.12); f.flashCol = '#ffffff'; }   // it leaves the Spell Portal
    o.x = o.sx + (o.tx - o.sx) * k; o.y = o.sy + (o.ty - o.sy) * k; o.z = Math.sin(k * Math.PI) * o.h + (1 - k) * 0.8;
    if (k >= 1) { f.flying.splice(i, 1); FA.land(o); }
  }
  for (const o of f.floor) {
    o.t += dt;
    if (o.z > 0 || o.vz > 0) { o.z += o.vz * dt; o.vz -= 14 * dt; if (o.z <= 0) { o.z = 0; o.vz = Math.abs(o.vz) > 2 ? -o.vz * 0.35 : 0; } }
  }
  FA.gatherFloor(dt);
  FA.autoPick(dt);
  for (let i = f.parts.length - 1; i >= 0; i--) {
    const p = f.parts[i];
    p.t -= dt; p.x += p.vx * dt * 0.5; p.y += p.vy * dt * 0.5; p.z += p.vz * dt; p.vz -= (p.g === undefined ? 9 : p.g) * dt;
    if (p.g < 0 && p.sz) p.vz = Math.min(p.vz, 2.5);   // exhaust drifts up instead of rocketing
    if (p.spin) { const a = dt * 6, vx = p.vx; p.vx = vx * Math.cos(a) - p.vy * Math.sin(a); p.vy = vx * Math.sin(a) + p.vy * Math.cos(a); }
    if (p.bounce && p.z < 0) { p.z = 0; p.vz = Math.abs(p.vz) * 0.4; p.bounce = 0; }
    if (p.t <= 0) f.parts.splice(i, 1);
  }
  for (let i = f.pops.length - 1; i >= 0; i--) { f.pops[i].t += dt; if (f.pops[i].t > 1.1) f.pops.splice(i, 1); }
  FA.updGather(dt);
  if (G.bd.squash > 0) G.bd.squash -= dt;
};

// a slight pickup range: a loose item that has settled within autoPick.r tiles of the Builder hops into his hands, one every autoPick.gap seconds
FA.autoPick = function (dt) {
  const A = CFG.autoPick, bd = G.bd;
  if (bd.apT > 0) { bd.apT -= dt; return; }
  if (bd.gather || A.r <= 0) return;
  let best = null, bs = A.r;
  for (const o of G.fac.floor) {
    if (o.t < A.delay || o.z > 0.05) continue;
    const d = Math.hypot(o.x - bd.x, o.y - bd.y);
    if (d < bs && FA.canHold(o.kind)) { bs = d; best = o; }
  }
  if (best) { FA.pickFloor(best); bd.apT = A.gap; }
};
// resting floor items slide toward the nearest item of the same kind, so loose packets settle into piles
FA.gatherFloor = function (dt) {
  const fl = G.fac.floor;
  for (const o of fl) {
    if (o.z > 0 || o.t < 0.6) continue;
    let best = null, bd = 1.1;
    for (const q of fl) {
      if (q === o || q.kind !== o.kind || q.z > 0) continue;
      const d = Math.hypot(q.x - o.x, q.y - o.y);
      if (d < bd) { bd = d; best = q; }
    }
    if (best && bd > 0.18) { const k = Math.min(1, 0.7 * dt / bd); o.x += (best.x - o.x) * k; o.y += (best.y - o.y) * k; }
  }
};
FA.updCharger = function (c, dt) {
  if (c.bat == null || c.bat >= CFG.batteryMax) return;
  const act = Object.keys(c.fuel).filter(k => c.fuel[k] > 0);
  if (!act.length) return;
  const nt = Math.max(c.types.length, act.length);
  const dur = CFG.chargeBase / Math.pow(CFG.chargeBoost, nt - 1);
  c.bat = Math.min(CFG.batteryMax, c.bat + CFG.batteryMax / dur * dt);
  for (const k of act) c.fuel[k] = Math.max(0, c.fuel[k] - dt / act.length);
  if (c.bat >= CFG.batteryMax) { G.flags.recharged = true; G.stats.charged = (G.stats.charged || 0) + 1; FA.ipop(c.x + 0.5, c.y + 0.5, [['battery'], ['ic_check']]); AU.sfx('charge'); c.pop = 0.4; }
};

// ---------- throwing ----------
// will this receiver take a thrown item of kind k? (portal / belt / building / blueprint / the Stockpile Zone)
FA.accepts = (o, k) => (o === 'zone' ? !!(RES[k] || ELEM[k]) : !o ? false : o.type === 'portal' ? FA.portalTakes(o, k) : o.type === 'belt' ? !o.item && k !== 'battery' : FA.canInsert(o, k) || FA.canSwap(o, k) || FA.canOver(o, k));
// every receiver in throwing range that would take kind k, with a priority (lower = preferred)
FA.throwList = function (k) {
  const bd = G.bd, out = [];
  const add = (x, y, obj, prio) => { const d = Math.hypot(x - bd.x, y - bd.y); if (d >= 0.4 && d <= CFG.throwRange) out.push({ x, y, obj, prio, d }); };
  for (const p of FA.portalCells(G.fac.w, G.fac.h)) { const c = FA.cell(p.x, p.y); if (FA.portalTakes(c, k)) add(p.x + 0.5, p.y + 0.5, c, 0.8); }
  for (const b of G.fac.bld) {
    if (FA.canInsert(b, k) || FA.canSwap(b, k)) add(b.x + 0.5, b.y + 0.5, b, b.done && FA.isLogi(b) ? 1.4 : 1);
    else if (FA.canOver(b, k)) add(b.x + 0.5, b.y + 0.5, b, 2.6);   // overcharging is on purpose: the portal stays the first choice for spells
  }
  if (RES[k] || ELEM[k]) { const z = FA.zone(); add((z.x0 + z.x1 + 1) / 2, (z.y0 + z.y1 + 1) / 2, 'zone', 1.1); }
  if (k !== 'battery') for (const bl of G.fac.belts) if (!bl.item) add(bl.x + 0.5, bl.y + 0.5, bl, 2.2);
  return out;
};
// ---------- deliberate target selection (pad right stick / Tab): G.lock pins one target until it stops being valid ----------
// holding something: cycle the receivers that take it (best first). Empty-handed: cycle what's in reach to pick or use
FA.lockList = function () {
  const bd = G.bd, h = FA.top();
  if (h) return FA.throwList(h.kind).sort((a, b) => a.d * a.prio - b.d * b.prio).map(c => ({ thr: true, held: h.kind, x: c.x, y: c.y, obj: c.obj }));
  const out = [];
  for (const c of FA.candidates()) {
    const d = Math.hypot(c.x - bd.x, c.y - bd.y);
    if (d > c.r) continue;
    if (FA.actionFor(c, 'pick').fn || FA.actionFor(c, 'use').fn) out.push({ thr: false, c, d });
  }
  return out.sort((a, b) => a.d - b.d);
};
FA.lockKey = l => (l.thr ? l.obj : l.c.o);
FA.cycleLock = function (dir) {
  const list = FA.lockList();
  if (!list.length) { G.lock = null; AU.sfx('error'); return; }
  const i = G.lock ? list.findIndex(l => FA.lockKey(l) === FA.lockKey(G.lock) && l.thr === G.lock.thr) : -1;
  G.lock = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : ((i + dir) % list.length + list.length) % list.length];
  G.lock.n = list.length;
  AU.sfx('blip');
};
// the lock if it still makes sense for this mode ('throw' / 'pick' / 'use'), otherwise null
FA.lockValid = function (mode) {
  const l = G.lock, h = FA.top();
  if (!l) return null;
  if (l.thr) {
    if (mode !== 'throw' || !h || h.kind !== l.held || !FA.accepts(l.obj, h.kind) || Math.hypot(l.x - G.bd.x, l.y - G.bd.y) > CFG.throwRange) return null;
    return l;
  }
  if (mode === 'throw') return null;
  const c = l.c;
  if (c.kind === 'floor' && G.fac.floor.indexOf(c.o) < 0) return null;
  if (Math.hypot(c.x - G.bd.x, c.y - G.bd.y) > c.r) return null;
  return FA.actionFor(c, mode).fn ? l : null;
};
FA.throwTarget = function (aimX, aimY) {
  const bd = G.bd, h = FA.top();
  if (!h) return null;
  const k = h.kind;
  if (aimX !== undefined) {   // mouse aim: land exactly there (clamped to range)
    let dx = aimX - bd.x, dy = aimY - bd.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > CFG.throwRange) { dx *= CFG.throwRange / d; dy *= CFG.throwRange / d; }
    const tx = bd.x + dx, ty = bd.y + dy, c = FA.cell(Math.floor(tx), Math.floor(ty));
    if (c && c.type !== 'belt') return { x: Math.floor(tx) + 0.5, y: Math.floor(ty) + 0.5, obj: c };
    if (!c && FA.reserved(Math.floor(tx), Math.floor(ty))) return { x: tx, y: ty, obj: 'zone' };
    return { x: tx, y: ty, obj: c || null };
  }
  const lk = FA.lockValid('throw');
  if (lk) return { x: lk.x, y: lk.y, obj: lk.obj };   // the pad player picked this one on purpose
  const fm = Math.hypot(bd.fx, bd.fy) || 1, fx = bd.fx / fm, fy = bd.fy / fm;
  let best = null, bs = 1e9;
  for (const c of FA.throwList(k)) {
    const dx = c.x - bd.x, dy = c.y - bd.y, cos = (dx * fx + dy * fy) / c.d;
    if (cos < 0.45) continue;
    const sc = c.d * (1.7 - cos) * c.prio;
    if (sc < bs) { bs = sc; best = c; }
  }
  if (best) return { x: best.x, y: best.y, obj: best.obj };
  return { x: Math.max(0.3, Math.min(G.fac.w - 0.3, bd.x + fx * 2.6)), y: Math.max(0.3, Math.min(G.fac.h - 0.3, bd.y + fy * 2.6)), obj: null };
};
FA.throwOne = function (aimX, aimY, cd) {
  const bd = G.bd;
  if (!G.hands.length || bd.throwCd > 0) return false;
  const tg = FA.throwTarget(aimX, aimY);
  const it = FA.takeOne();
  if (FA.canSwap(tg.obj, it.kind)) FA.addHands('battery', 1, FA.takeBat(tg.obj));   // the old one comes back to the hands
  const d = Math.hypot(tg.x - bd.x, tg.y - bd.y);
  G.fac.flying.push({ kind: it.kind, charge: it.charge, sx: bd.x, sy: bd.y, x: bd.x, y: bd.y, z: 0.8, tx: tg.x, ty: tg.y, t: 0, T: 0.28 + d * 0.045, h: 0.9 + d * 0.22, fromBuilder: true });
  bd.throwCd = cd || CFG.throwRepeat; bd.squash = 0.18;
  bd.fx = tg.x - bd.x || bd.fx; bd.fy = tg.y - bd.y || bd.fy;
  AU.sfx('throw');
  return true;
};
// the portal (cell) nearest to (x, y) that takes this kind and is within CFG.portalCatch tiles of it, else null
FA.portalNear = function (x, y, kind) {
  let best = null, bd = CFG.portalCatch;
  for (const p of FA.portalCells(G.fac.w, G.fac.h)) {
    const c = FA.cell(p.x, p.y);
    if (!c || !FA.portalTakes(c, kind)) continue;
    const d = Math.hypot(Math.max(p.x - x, 0, x - p.x - 1), Math.max(p.y - y, 0, y - p.y - 1));
    if (d <= bd) { bd = d; best = c; }
  }
  return best;
};
// a tiny ring where a throw hits, leaning the way it was flying
FA.impact = (o, bad) => G.fac.rings.push({ x: o.x, y: o.y, dx: o.x - o.sx, dy: o.y - o.sy, t: 0, col: bad ? '#ff6a6a' : ITEMS[o.kind].color || '#ffffff' });
FA.land = function (o) {
  if (o.stock) { G.stock[o.kind] = (G.stock[o.kind] || 0) + (o.n || 1); FA.pileIn(o.kind); AU.sfx('drop'); UI.changed(); return; }
  if (o.boing) { FA.dropAt(o.kind, o.x, o.y, o.charge); AU.sfx('thud'); return; }   // the end of a bounce-back: it just lands
  const tx = Math.floor(o.x), ty = Math.floor(o.y), c = FA.cell(tx, ty);
  const toPortal = c => {
    if (!FA.enterPortal(c, o.kind, o.x, o.y)) return false;
    if (o.fromBuilder && c.which === 'spell') G.flags.portalHand = true;
    FA.impact(o);
    return true;
  };
  // a throw that comes down close to a portal that takes it is pulled in, so it never lies beside the portal looking blocked
  const fell = () => { const pc = FA.portalNear(o.x, o.y, o.kind); if (pc && toPortal(pc)) return true; FA.dropAt(o.kind, o.x, o.y, o.charge); return false; };
  const bounce = () => {   // couldn't go in: a cartoon boing back up and over toward the Builder (never into a building)
    const B = CFG.boing, bd = G.bd, dx = bd.x - o.x, dy = bd.y - o.y, d = Math.hypot(dx, dy) || 1;
    let k = Math.max(B.min, Math.min(B.max, d * B.back)), x = o.x + dx / d * k, y = o.y + dy / d * k;
    while (k > 0.4 && FA.solid(Math.floor(x), Math.floor(y))) { k -= 0.3; x = o.x + dx / d * k; y = o.y + dy / d * k; }
    if (FA.solid(Math.floor(x), Math.floor(y))) { x = bd.x; y = bd.y; }
    G.fac.flying.push({ kind: o.kind, charge: o.charge, sx: o.x, sy: o.y, x: o.x, y: o.y, z: 0.8, tx: x, ty: y, t: 0, T: B.T, h: B.h, boing: true });
    FA.impact(o, true);
    AU.sfx('boing');
  };
  if (c && c.type === 'portal') {
    if (!toPortal(c)) { bounce(); FA.ipop(o.x, o.y, [[o.kind], ['ic_x']]); }
    return;
  }
  if (c && c.type === 'belt') {
    if (!c.item && o.kind !== 'battery') { c.item = { kind: o.kind, prog: 0.5, moved: true }; FA.impact(o); AU.sfx('drop'); return; }
    const pc = FA.portalNear(o.x, o.y, o.kind);
    if (pc && toPortal(pc)) return;
    return bounce();   // the belt is full (or it's a Battery, which belts never carry)
  }
  if (c) {
    if (FA.canOver(c, o.kind)) { FA.overcharge(c, o.kind); FA.impact(o); return; }
    if (FA.canInsert(c, o.kind)) { FA.insert(c, o.kind, o.charge, true); FA.impact(o); AU.sfx('drop'); FA.ipop(o.x, o.y, [[o.kind]]); return; }
    return bounce();
  }
  if (!FA.owned(tx, ty)) { bounce(); FA.ipop(o.x, o.y, [[o.kind], ['ic_x']]); return; }   // it came down off the edge of the floor
  if (FA.reserved(tx, ty) && (RES[o.kind] || ELEM[o.kind])) { G.stock[o.kind] = (G.stock[o.kind] || 0) + 1; FA.ipop(o.x, o.y, [[o.kind]]); AU.sfx('drop'); return; }
  if (!fell()) AU.sfx('thud');
};

// ---------- the Builder ----------
FA.solid = function (tx, ty) {
  if (!FA.owned(tx, ty)) return true;   // the void beyond the floor
  const c = G.fac.grid[ty * G.fac.w + tx];
  return !!c && c.type !== 'belt';
};
FA.blockedAt = function (px, py) {
  const r = CFG.builder.radius;
  return FA.solid(Math.floor(px - r), Math.floor(py - r)) || FA.solid(Math.floor(px + r), Math.floor(py - r)) ||
         FA.solid(Math.floor(px - r), Math.floor(py + r)) || FA.solid(Math.floor(px + r), Math.floor(py + r));
};
FA.moveBuilder = function (dt, ix, iy) {
  const bd = G.bd, C = CFG.builder;
  if (bd.throwCd > 0) bd.throwCd -= dt;
  let dx = 0, dy = 0;
  if (ix || iy) { bd.target = null; bd.then = null; dx = ix + iy; dy = iy - ix; if (bd.gather) bd.gather = null; }
  else if (bd.target) {
    const tx = bd.target.x - bd.x, ty = bd.target.y - bd.y, d = Math.hypot(tx, ty);
    const arrive = bd.then ? FA.distTo(bd.then) < CFG.reach - 0.25 : d < 0.12;
    if (arrive) {
      bd.target = null;
      if (bd.then) { const t = bd.then; bd.then = null; const a = FA.actionFor(t, 'pick'); if (a.fn) a.fn(); else FA.say(a); }
    } else { dx = tx; dy = ty; }
  }
  const m = Math.hypot(dx, dy);
  let wx = 0, wy = 0;
  if (m > 0) { const s = Math.min(1, m) / m; wx = dx * s * C.speed; wy = dy * s * C.speed; bd.fx = dx / m; bd.fy = dy / m; }
  const ex = wx - bd.vx, ey = wy - bd.vy, el = Math.hypot(ex, ey);
  const rate = (m > 0 ? C.accel : C.friction) * dt;
  if (el <= rate) { bd.vx = wx; bd.vy = wy; } else { bd.vx += ex / el * rate; bd.vy += ey / el * rate; }
  const inside = FA.blockedAt(bd.x, bd.y);
  const ox = bd.x, oy = bd.y;
  const nx = Math.max(0.3, Math.min(G.fac.w - 0.3, bd.x + bd.vx * dt));
  if (inside || !FA.blockedAt(nx, bd.y)) bd.x = nx; else bd.vx = 0;
  const ny = Math.max(0.3, Math.min(G.fac.h - 0.3, bd.y + bd.vy * dt));
  if (inside || !FA.blockedAt(bd.x, ny)) bd.y = ny; else bd.vy = 0;
  const moved = Math.hypot(bd.x - ox, bd.y - oy);
  const wasMoving = bd.moving;
  bd.moving = moved > 0.002;
  if (bd.moving) {
    bd.bob += dt * 13;
    bd.dustT -= dt;
    if (bd.dustT <= 0) { bd.dustT = 0.16; G.fac.parts.push({ x: bd.x - bd.vx * 0.04, y: bd.y - bd.vy * 0.04, z: 0.05, vx: -bd.vx * 0.1, vy: -bd.vy * 0.1, vz: 0.6, t: 0.4, col: '#ffffff', dust: true }); }
    // the chosen footstep trail (a cosmetic from the player screen)
    bd.trailT = (bd.trailT || 0) - dt;
    if (bd.trailT <= 0) { bd.trailT = 0.07; const tc = Players.trailCol('builder'); if (tc) G.fac.parts.push({ x: bd.x, y: bd.y, z: 0.15, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8, vz: 1.2 + Math.random() * 1.4, g: 3, t: 0.7, col: tc }); }
  }
  if (wasMoving !== bd.moving) bd.squash = 0.12;
  if (bd.target) {
    if (moved < 0.0005 && m > 0) { bd.stuckT += dt; if (bd.stuckT > 0.35) { bd.target = null; bd.then = null; bd.stuckT = 0; } } else bd.stuckT = 0;
  }
};
FA.distTo = function (t) {
  const bd = G.bd;
  if (t.kind === 'pile') { const p = FA.piles()[t.o]; return Math.hypot(p.x - bd.x, p.y - bd.y); }
  if (t.kind === 'floor') return Math.hypot(t.o.x - bd.x, t.o.y - bd.y) + 0.4;
  return Math.hypot(t.o.x + 0.5 - bd.x, t.o.y + 0.5 - bd.y);
};

FA.startGather = function (b) {
  const el = b.el;
  G.bd.gather = { b, t: b.hand || 0, total: 1, el };   // the meter only moves when E is tapped (FA.crank); it starts from what is already cranked
  G.bd.target = null;
  AU.sfx('blip');
};
FA.tapGain = () => (1 + CFG.upgrade.manual * lvl('manual')) / CFG.manual.taps;   // share of the meter one tap of E fills
FA.crank = function () {
  const g = G.bd.gather;
  if (!g) return;
  g.t += FA.tapGain(); g.b.hand = Math.min(g.t, 0.999);
  G.bd.squash = 0.15;
  FA.eburst(g.b.x + 0.5, g.b.y + 0.5, g.el, 4);
  AU.sfx('crank');
};
FA.updGather = function (dt) {
  const bd = G.bd, g = bd.gather;
  if (!g) return;
  if (G.fac.grid[g.b.y * G.fac.w + g.b.x] !== g.b) { bd.gather = null; return; }
  bd.bob += dt * 9;
  if (g.t >= g.total) {
    bd.gather = null; g.b.hand = 0;
    if (FA.canHold(g.el)) FA.addHands(g.el, 1); else FA.dropAt(g.el, bd.x, bd.y);
    G.flags.gathered = true; G.stats.packets++; FA.elTick(g.el);
    AU.sfx('el_' + g.el);
    FA.eburst(g.b.x + 0.5, g.b.y + 0.5, g.el, 12);
    FA.ipop(g.b.x + 0.5, g.b.y + 0.5, [[g.el]]);
  }
};

// ---------- what the pick and use buttons do: one resolver for the prompts, the buttons and click-to-walk ----------
FA.candidates = function () {
  const bd = G.bd, out = [], piles = FA.piles();
  for (const it of G.fac.floor) out.push({ kind: 'floor', o: it, x: it.x, y: it.y, r: 1.3 });
  for (const k in piles) out.push({ kind: 'pile', o: k, x: piles[k].x, y: piles[k].y, r: CFG.reach });
  for (const b of G.fac.bld) out.push({ kind: 'bld', o: b, x: b.x + 0.5, y: b.y + 0.5, r: CFG.reach });
  for (const p of FA.portalCells(G.fac.w, G.fac.h)) out.push({ kind: 'portal', o: FA.cell(p.x, p.y), x: p.x + 0.5, y: p.y + 0.5, r: CFG.reach });
  const tx = Math.floor(bd.x), ty = Math.floor(bd.y);
  for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
    const c = FA.cell(xx, yy);
    if (c && c.type === 'belt') out.push({ kind: 'belt', o: c, x: xx + 0.5, y: yy + 0.5, r: 1.15, weak: !c.item });
  }
  return out;
};
// mode 'pick' (left-click / A: take one item) or 'use' (E / X: crank, gather, rotate, switch recipe, set a filter).
// Nothing here puts an item down: throwing is the only way to get rid of what you hold.
// the kind of item a pick target would hand over (for sweeping and same-kind priority)
FA.itemOf = c => (c.kind === 'floor' ? c.o.kind : c.kind === 'pile' ? c.o : c.kind === 'belt' ? c.o.item && c.o.item.kind : c.kind === 'bld' && c.o.out && c.o.out.length ? c.o.out[0].kind : null);
// holding pick sweeps: the nearest thing in reach that hands over the same kind as the stack in hand
FA.sweepTarget = function (kind) {
  const bd = G.bd;
  let best = null, bs = 1e9;
  for (const c of FA.candidates()) {
    const d = Math.hypot(c.x - bd.x, c.y - bd.y);
    if (d > c.r + 0.5 || d >= bs || FA.itemOf(c) !== kind) continue;
    const a = FA.actionFor(c, 'pick');
    if (a.fn && a.rep) { bs = d; best = c; }
  }
  return best;
};
FA.findTarget = function (mode) {
  const lk = FA.lockValid(mode);
  if (lk) return lk.c;
  const bd = G.bd, fm = Math.hypot(bd.fx, bd.fy) || 1, hk = FA.topKind();
  let best = null, bs = 1e9, info = null, is = 1e9;
  for (const c of FA.candidates()) {
    const dx = c.x - bd.x, dy = c.y - bd.y, d = Math.hypot(dx, dy);
    if (d > c.r) continue;
    const cos = d > 0.01 ? (dx * bd.fx + dy * bd.fy) / (d * fm) : 1;
    const s = d - cos * 0.45 - (c.kind === 'floor' ? 0.3 : 0) - (hk && FA.itemOf(c) === hk ? 0.5 : 0), a = FA.actionFor(c, mode);
    if (a.fn) { if (s < bs) { bs = s; best = c; } }
    else if (a.label && s < is) { is = s; info = c; }
  }
  return best || info;
};
// label, function, and whether holding the button repeats it (single pickups)
// ic = sprite keys the prompt shows instead of the label (the label is kept for anything that still wants words)
const A = (label, fn, rep, ic) => ({ label, fn, rep: !!rep, ic });
const NONE = A('', null), FULL = A('Hands full: right-click to throw', null, false, ['ic_hand', 'ic_x']);
FA.actionFor = function (t, mode) {
  const h = FA.top(), k = h && h.kind, f = G.fac, pick = mode === 'pick';
  switch (t.kind) {
    case 'floor': {
      const it = t.o;
      if (!pick || f.floor.indexOf(it) < 0) return NONE;
      return FA.canHold(it.kind) ? A('Pick up ' + itemName(it.kind), () => FA.pickFloor(it), true, [it.kind]) : FULL;
    }
    case 'pile': {
      if (!pick) return NONE;
      const r = t.o;
      if (!FA.canHold(r)) return FULL;
      if (G.stock[r] <= 0) return A('No ' + itemName(r) + ': the Wizard must bring more', null, false, [r, 'ic_x']);
      return A('Take ' + itemName(r), () => FA.takePile(r), true, [r]);
    }
    case 'belt': {
      const b = t.o;
      if (!pick) return A('Rotate belt', () => { b.dir = (b.dir + 1) % 4; AU.sfx('blip'); }, false, ['ic_rotate']);
      if (!b.item) return NONE;
      if (FA.canHold(b.item.kind)) return A('Grab ' + itemName(b.item.kind), () => { if (b.item && FA.canHold(b.item.kind)) { FA.addHands(b.item.kind, 1); b.item = null; AU.sfx('pickup'); } }, true, [b.item.kind]);
      return FULL;
    }
    case 'portal':
      if (!pick) return NONE;
      return NONE;
    case 'bld': return FA.bldAction(t.o, pick);
  }
  return NONE;
};
FA.bldAction = function (b, pick) {
  const h = FA.top(), k = h && h.kind, d = FA.def(b);
  if (!b.done) {
    if (!pick) return NONE;
    const need = FA.needOf(b);
    return A(h && need[k] ? 'Throw ' + itemName(k) + ' in to build' : 'Needs ' + FA.needText(need), null, false, Object.keys(need));
  }
  if (pick) {
    if (d.kind === 'splitter') return h ? NONE : A('Set the split', () => UI.openSplit(b), false, ['ic_gear']);
    if (b.out.length) return FA.canHold(b.out[0].kind) ? A('Take ' + itemName(b.out[0].kind), () => FA.takeOut(b), true, [b.out[0].kind]) : FULL;
    if ((d.kind === 'station' || d.kind === 'charger') && b.bat != null) {
      if (k === 'battery') return A('Swap Battery (' + Math.round(b.bat / CFG.batteryMax * 100) + '%)', () => {
        const it = FA.takeOne(); FA.addHands('battery', 1, FA.takeBat(b)); FA.insert(b, 'battery', it.charge);
        AU.sfx('pickup'); G.bd.squash = 0.2; UI.changed();
      }, false, ['battery', 'ic_swap']);
      if (!FA.canHold('battery')) return FULL;
      return A('Take Battery (' + Math.round(b.bat / CFG.batteryMax * 100) + '%)', () => { FA.addHands('battery', 1, FA.takeBat(b)); AU.sfx('pickup'); }, false, ['battery']);
    }
    return NONE;
  }
  if (G.bd.gather && G.bd.gather.b === b) return A('Crank!', () => FA.crank(), false, [G.bd.gather.el]);
  if (d.kind === 'splitter') return A('Set up the routes', () => UI.openSplit(b), false, ['ic_gear']);   // it has no front to turn
  const turn = A('Turn output', () => { b.dir = (b.dir + 1) % 4; b.pop = 0.2; AU.sfx('blip'); }, false, ['ic_rotate']);
  if (d.kind === 'harness') {
    if (FA.growing(b)) return A('The crystal is still growing', null, false, ['ic_clock', b.el]);
    return FA.canHold(b.el) ? A('Hand-gather ' + ELEM[b.el].name + ' (tap to fill the meter)', () => FA.startGather(b), false, [b.el]) : FULL;
  }
  if (d.kind === 'crafter') {
    const list = FA.recipesFor(b.type);
    if (list.length > 1) {
      const nx = list[(list.indexOf(b.recipe) + 1) % list.length];
      return A('Switch recipe to ' + recipeName(nx), () => { FA.setRecipe(b, nx); AU.sfx('blip'); }, false, ['ic_swap', CFG.recipes[nx].out]);
    }
    if (!list.length) return A('No recipe unlocked yet: see the Skill Tree', null, false, ['ic_lock']);
  }
  if (FA.isLogi(b)) return turn;
  return NONE;
};
// Switching a Harnesser's element (F / LT + X): the old crystal bursts into particles, the new one grows from nothing for CFG.harness.growT seconds
// (switching again while it grows starts the 15 seconds over), and nothing is harnessed until it has grown and shaken.
FA.setElem = function (b, el) {
  if (!ELEM[el] || b.el === el) return false;
  const cx = b.x + 0.5, cy = b.y + 0.5;
  if (b.done) { FA.eburst(cx, cy, b.el, 22); FA.burst(cx, cy, '#ffffff', 8); AU.sfx('el_' + el); b.pop = 0.4; }
  b.el = el; b.timer = 0; b.hand = 0; b.shake = 0;
  if (b.done) b.grow = 0;
  if (G.bd.gather && G.bd.gather.b === b) G.bd.gather = null;
  UI.changed();
  return true;
};
FA.cycleElem = function (b, dir) {
  const o = CFG.harness.order;
  return FA.setElem(b, o[(o.indexOf(b.el) + (dir || 1) + o.length) % o.length]);
};
// the Harnesser the cycle key acts on: the one the use button is aimed at, else the nearest in reach
FA.harnessNear = function () {
  const bd = G.bd;
  let best = null, bs = 1e9;
  for (const b of G.fac.bld) {
    if (FA.def(b).kind !== 'harness') continue;
    const d = Math.hypot(b.x + 0.5 - bd.x, b.y + 0.5 - bd.y);
    if (d <= CFG.reach && d < bs) { bs = d; best = b; }
  }
  return best;
};
// R on something already placed: turn the belt / building on this tile a quarter turn. Stations and Chargers have no output side.
FA.rotateAt = function (tx, ty) {
  const c = FA.cell(tx, ty);
  if (!c || c.type === 'portal') return false;
  if (c.type !== 'belt') { const k = FA.def(c).kind; if (k === 'station' || k === 'charger' || k === 'splitter') return false; c.pop = 0.2; }   // a Splitter routes itself
  c.dir = (c.dir + 1) % 4;
  AU.sfx('blip'); FA.ipop(tx + 0.5, ty + 0.5, [['ic_rotate']]); UI.changed();
  return true;
};
FA.takePile = function (r) {   // one item per press (hold to keep grabbing)
  if (G.stock[r] <= 0 || !FA.canHold(r)) return;
  G.stock[r]--;
  FA.addHands(r, 1);
  G.flags.tookPile = true;
  G.bd.squash = 0.2;
  AU.sfx('pickup');
};
// quiet: don't complain when there's nothing to do (the input buffer retries for a moment first)
FA.interact = function (mode, quiet) {
  if (mode !== 'pick' && G.bd.gather) { FA.crank(); return A('Crank!', FA.crank, false, [G.bd.gather.el]); }
  const t = FA.findTarget(mode);
  if (!t) return null;
  const a = FA.actionFor(t, mode);
  if (a.fn) a.fn(); else if (a.label && !quiet) { FA.say(a); AU.sfx('error'); }
  return a;
};
// click-to-interact: find what's under a tile
FA.thingAt = function (tx, ty, fx, fy) {
  let best = null, bd = 0.7;
  for (const it of G.fac.floor) { const d = Math.hypot(it.x - fx, it.y - fy); if (d < bd) { bd = d; best = { kind: 'floor', o: it, x: it.x, y: it.y }; } }
  if (best) return best;
  const piles = FA.piles();
  for (const k in piles) if (Math.hypot(piles[k].x - fx, piles[k].y - fy) < 0.8) return { kind: 'pile', o: k, x: piles[k].x, y: piles[k].y };
  const c = FA.cell(tx, ty);
  if (!c) return null;
  if (c.type === 'portal') return { kind: 'portal', o: c, x: tx + 0.5, y: ty + 0.5 };
  if (c.type === 'belt') return c.item ? { kind: 'belt', o: c, x: tx + 0.5, y: ty + 0.5 } : null;
  return { kind: 'bld', o: c, x: tx + 0.5, y: ty + 0.5 };
};

// ---------- inspector text ----------
FA.status = function (b) {
  const d = FA.def(b), n = d.name;
  if (!b.done) return n + ': blueprint, needs ' + (FA.needText(FA.needOf(b)) || 'nothing');
  if (d.kind === 'harness') {
    let st = 'producing';
    if (FA.growing(b)) return n + ' (' + ELEM_WORD[b.el] + '): the crystal is growing, ' + Math.ceil(CFG.harness.growT - b.grow) + 's until it makes packets. F switches the element';
    if (b.out.length >= CFG.buffer) st = 'BLOCKED: nothing takes its output. Belt it away or take it (click)'; else if (!b.powered) st = 'NO POWER';
    else if (FA.shrineBoost(b) > 1) st = 'producing, SHRINE BOOST +' + Math.round(CFG.marks.shrineBoost * 100) + '% (the Wizard is at a ' + ELEM_WORD[b.el] + ' Shrine)';
    return n + ' (' + ELEM_WORD[b.el] + '): ' + b.out.length + '/' + CFG.buffer + ' ready, ' + st;
  }
  if (d.kind === 'crafter') {
    if (!b.recipe) return n + ': no recipe unlocked yet';
    const R = CFG.recipes[b.recipe];
    let s = n + ': ' + recipeName(b.recipe) + ' (' + recipeUse(b.recipe) + ') needs ' + Object.keys(R.in).map(k => itemName(k) + ' ' + (b.inv[k] || 0) + '/' + R.in[k]).join(', ');
    if (b.draw > 0 && !b.powered) s += '. NO POWER (' + R.power + ')';
    else if (b.prog > 0) s += '. Crafting ' + Math.floor(b.prog / R.time * 100) + '%';
    else if (b.out.length >= CFG.buffer) s += '. BLOCKED: output full';
    else s += '. STARVED: waiting for inputs';
    if (b.out.length) s += '. ' + b.out.length + ' ready (click to take)';
    if (b.od) s += '. OVERDRIVE +' + Math.round(CFG.overdrive * 100) + '% (Battery Station beside it)';
    return s;
  }
  if (d.kind === 'splitter') {
    if (!b.outs.length) return n + ': no outputs yet. Put belts or machines on its sides (the side items come in from is the input)';
    const dn = ['east', 'south', 'west', 'north'];
    return n + ': ' + b.outs.map(o => (b.pct[o] || 0) + '% ' + dn[o] + (FA.splitHas(b, o) ? ' (' + b.filt[o].map(itemName).join(' + ') + ')' : '')).join(', ') + (b.blocked && b.out.length ? '. BLOCKED' : '') + ' (click to set)';
  }
  if (d.kind === 'crate') return n + ': ' + b.out.length + '/' + CFG.crateCap + (b.out.length ? ', next out: ' + itemName(b.out[0].kind) : ', empty') + '. Feeds its arrow side; point it at nothing to just store';
  if (d.kind === 'station') return n + ': ' + (b.bat == null ? 'empty, insert a charged Battery' : 'Battery ' + Math.round(b.bat) + '/' + CFG.batteryMax + (b.bat > 0 ? ', +' + (CFG.stationGen + (b.over > 0 ? CFG.overcharge.power : 0)) + ' power, ' + Math.ceil(FA.life(b)) + 's left at this load' : ' (flat)') + (b.over > 0 ? '. OVERCHARGED ' + Math.ceil(b.over) + 's' : ''));
  if (d.kind === 'charger') {
    const act = Object.keys(b.fuel).filter(k => b.fuel[k] > 0);
    let s = n + ': ' + (b.bat == null ? 'no Battery' : 'Battery ' + Math.round(b.bat) + '/' + CFG.batteryMax);
    s += ', fuel ' + Math.round(FA.fuelTotal(b)) + 's' + (act.length ? ' (' + act.join(', ') + ')' : '');
    if (b.bat != null && b.bat < CFG.batteryMax && act.length) {
      const nt = Math.max(b.types.length, act.length), rate = CFG.batteryMax / (CFG.chargeBase / Math.pow(CFG.chargeBoost, nt - 1));
      s += ', ready in ' + Math.ceil((CFG.batteryMax - b.bat) / rate) + 's';
    } else if (b.bat != null && b.bat < CFG.batteryMax) s += ', feed it element packets';
    else if (b.bat != null) s += ', FULL';
    return s;
  }
  return n;
};

// ---------- save / restore ----------
FA.toJSON = function () {
  const f = G.fac;
  return {
    v: 2, w: f.w, h: f.h, land: f.land.join(''), pp: f.pp, added: f.added,   // v2: a fixed grid + which tiles are floor (v1 saves were one rectangle)
    bld: f.bld.map(b => {
      const o = { type: b.type, x: b.x, y: b.y, dir: b.dir, done: b.done, free: b.free, got: b.got, out: b.out, timer: b.timer };
      if (b.inv) { o.recipe = b.recipe; o.inv = b.inv; o.prog = b.prog; }
      if (b.bat !== undefined) o.bat = b.bat;
      if (b.fuel) { o.fuel = b.fuel; o.types = b.types; }
      if (b.hand > 0) o.hand = Math.round(b.hand * 1000) / 1000;
      if (b.el) { o.el = b.el; o.grow = Math.round(b.grow * 10) / 10; }
      if (b.cost) o.cost = b.cost;
      if (b.pct) { o.pct = b.pct; o.filt = b.filt; o.sig = b.sig; }
      if (b.over > 0) o.over = b.over;
      return o;
    }),
    belts: f.belts.map(b => ({ x: b.x, y: b.y, dir: b.dir, item: b.item ? b.item.kind : null })),
    floor: f.floor.concat(f.flying.filter(o => !o.stock).map(o => ({ kind: o.kind, charge: o.charge, x: o.tx, y: o.ty }))).map(o => ({ kind: o.kind, charge: o.charge, x: o.x, y: o.y })),
    portalQ: f.portalQ, eggQ: f.eggQ,
  };
};
const LEGACY_SORTER = { wood: 2, stone: 1, shard: 1 };
// an old (v1) save was one rectangle with its own origin: it moves onto the fixed grid with its south-west corner on the base rectangle's, so the Stockpile stays where it was.
// FA.lastShift is how far everything moved (the Builder's position is moved by Main.applySave).
FA.lastShift = { dx: 0, dy: 0 };
FA.fromJSON = function (j) {
  const F = CFG.factory, B = F.base;
  G.fac = FA.fresh(F.w, F.h);
  FA.lastShift = { dx: 0, dy: 0 };
  if (j.v >= 2 && typeof j.land === 'string' && j.land.length === F.w * F.h && j.pp) {
    for (let i = 0; i < j.land.length; i++) G.fac.land[i] = j.land[i] === '1' ? 1 : 0;
    G.fac.added = j.added | 0;
    FA.setPortals(j.pp.x | 0, j.pp.y | 0);
  } else {
    const ow = j.w || 20, oh = j.h || 14, dx = B.x0, dy = B.y0 + B.h - oh;
    FA.lastShift = { dx, dy };
    FA.setLand(dx, dy, ow, oh);
    FA.setPortals(dx + ow - 1, dy + Math.floor(oh / 2) - 2);
    const mv = o => Object.assign({}, o, { x: o.x + dx, y: o.y + dy });
    j = Object.assign({}, j, { bld: (j.bld || []).map(mv), belts: (j.belts || []).map(mv), floor: (j.floor || []).map(mv) });
  }
  (j.bld || []).forEach(o => {
    if (o.type === 'sorter') {   // the Sorter was dropped (a Splitter's element toggles do its job): refund it and set its contents down
      for (const k in LEGACY_SORTER) G.stock[k] = (G.stock[k] || 0) + LEGACY_SORTER[k];
      (o.out || []).forEach(x => { if (x && ITEMS[x.kind]) FA.dropAt(x.kind, o.x + 0.5, o.y + 0.5, x.charge); });
      return;
    }
    if (ELEM[o.type]) o = Object.assign({}, o, { type: 'harness', el: o.type, grow: CFG.harness.growT });   // the four Harnessers became one that switches element
    if (!CFG.buildings[o.type] || !FA.inb(o.x, o.y) || G.fac.grid[o.y * G.fac.w + o.x]) return;
    const b = FA.makeBuilding(o.type, o.x, o.y, false, o.free, o.dir || 0);
    if (o.cost && typeof o.cost === 'object') b.cost = o.cost;
    if (b.el !== undefined) { if (ELEM[o.el]) b.el = o.el; b.grow = o.grow >= 0 ? Math.min(CFG.harness.growT, +o.grow) : CFG.harness.growT; }
    b.done = !!o.done; b.got = o.got || {}; b.out = Array.isArray(o.out) ? o.out.filter(x => x && ITEMS[x.kind]) : []; b.timer = o.timer || 0;
    if (b.inv) { b.recipe = o.recipe && CFG.recipes[o.recipe] ? o.recipe : null; b.inv = o.inv || {}; b.prog = o.prog || 0; }
    if (b.bat !== undefined) b.bat = o.bat == null ? null : o.bat;
    if (b.fuel) { b.fuel = Object.assign(b.fuel, o.fuel || {}); b.types = o.types || []; }
    if (b.hand !== undefined && o.hand > 0) b.hand = Math.min(0.999, +o.hand);
    if (b.pct && o.pct && typeof o.pct === 'object') {
      for (const k in o.pct) if (+k >= 0 && +k < 4) b.pct[k] = Math.max(0, Math.min(100, Math.round(+o.pct[k] || 0)));
      for (const k in o.filt || {}) if (Array.isArray(o.filt[k])) b.filt[k] = o.filt[k].filter(x => ITEMS[x]);
      b.sig = typeof o.sig === 'string' ? o.sig : null;
    } else if (b.pct && typeof o.split === 'number') {   // an older save: two sides off its facing (ang 180 = opposite, 90 = a right angle)
      const A2 = (b.dir + 1) % 4, B2 = (b.dir + (o.ang === 90 ? 2 : 3)) % 4, s = Math.max(0, Math.min(100, Math.round(o.split)));
      b.pct[A2] = s; b.pct[B2] = 100 - s; b.sig = [A2, B2].sort().join(',');   // kept if those are still its outputs (FA.splitConn)
    }
    if (b.type === 'station' && o.over > 0) b.over = o.over;
  });
  (j.belts || []).forEach(o => {
    if (!FA.inb(o.x, o.y) || G.fac.grid[o.y * G.fac.w + o.x]) return;
    const b = FA.addBelt(o.x, o.y, o.dir);
    if (o.item && ITEMS[o.item]) b.item = { kind: o.item, prog: 0.5, moved: false };
  });
  (j.floor || []).forEach(o => { if (ITEMS[o.kind]) G.fac.floor.push({ kind: o.kind, charge: o.charge, x: o.x, y: o.y, z: 0, vz: 0, t: 1 }); });
  G.fac.portalQ = (j.portalQ || []).filter(q => q && ITEMS[q.kind]);
  G.fac.eggQ = (j.eggQ || []).filter(k => ITEMS[k] && ITEMS[k].egg);
  FA.refreshRecipes();
};
