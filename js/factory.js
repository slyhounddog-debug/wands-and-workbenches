'use strict';
// Factory-side game logic: grid, blueprints, belts, machines, power, batteries, physical items, portals, the Builder.
let G = null;   // the whole game state (also exposed as window.__wands.G for tests)

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 0 = east (+x) 1 = south (+y) 2 = west 3 = north

// upgrade level of a tree node (unlock nodes are true/false, upgrade tracks are tier numbers)
const lvl = id => { const v = G.tree[id]; return typeof v === 'number' ? v : (v ? 1 : 0); };

const FA = {};
// ----- layout (depends on the factory size, which grows with Factory Expansion) -----
FA.W = () => G.fac.w;
FA.H = () => G.fac.h;
FA.spellY = h => Math.floor((h === undefined ? G.fac.h : h) / 2) - 2;   // Spell Portal rows spellY, spellY+1 on the east edge
FA.portalCells = (w, h) => {
  const sy = FA.spellY(h);
  return [{ x: w - 1, y: sy, which: 'spell' }, { x: w - 1, y: sy + 1, which: 'spell' }, { x: w - 1, y: sy + 4, which: 'skill' }, { x: w - 1, y: sy + 5, which: 'skill' }];
};
FA.portal = which => { const sy = FA.spellY(); return { x: G.fac.w - 1, y: which === 'skill' ? sy + 4 : sy }; };   // top cell of a portal
FA.zone = () => ({ x0: 0, y0: G.fac.h - 5, x1: 4, y1: G.fac.h - 1 });
FA.piles = () => {
  const h = G.fac.h;
  // a 2x2 block on screen: wood | stone over iron | shard (the zone is 5x5 in the south-west corner)
  return { wood: { x: 1.0, y: h - 2.5 }, stone: { x: 2.5, y: h - 4.0 }, iron: { x: 3.1, y: h - 0.4 }, shard: { x: 4.6, y: h - 1.9 } };
};
FA.inb = (x, y) => x >= 0 && y >= 0 && x < G.fac.w && y < G.fac.h;
FA.cell = (x, y) => (FA.inb(x, y) ? G.fac.grid[y * G.fac.w + x] : undefined);
FA.setCell = (x, y, v) => { G.fac.grid[y * G.fac.w + x] = v; };
FA.reserved = (x, y) => { const z = FA.zone(); return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1; };

// ----- upgrade effects -----
FA.cap = () => CFG.satchel + lvl('satchel') * CFG.upgrade.satchel;
FA.stackMax = k => (ITEMS[k] && ITEMS[k].stack) || FA.cap();
FA.beltTime = () => CFG.beltTime / (1 + CFG.upgrade.belts * lvl('belts'));
// the Wizard standing at a shrine speeds up that element's harnessers (G.w.shrine, set by WZ.updMarks)
FA.shrineBoost = type => (G.w && G.w.shrine && G.w.shrine === CFG.buildings[type].elem ? 1 + CFG.marks.shrineBoost : 1);
FA.cycle = type => CFG.buildings[type].cycle / (1 + CFG.upgrade.swift * lvl('swift')) / FA.shrineBoost(type);
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
FA.isDeliverable = k => !!ITEMS[k] && !!(ITEMS[k].elem || ITEMS[k].spell || ITEMS[k].pickup || ITEMS[k].sigil);   // Spell Portal
FA.isBankable = k => SPELL_KINDS.indexOf(k) >= 0;                                                 // Skill Portal
// a Sigil only goes through while the Wizard is alive and no Chimera is already out
FA.portalTakes = (c, k) => (c.which === 'skill' ? FA.isBankable(k) : FA.isDeliverable(k) && (k !== 'sigil' || (!G.w.dead && !G.w.boss)));
FA.isLogi = b => { const k = FA.def(b).kind; return k === 'splitter' || k === 'sorter' || k === 'crate'; };

FA.fresh = function (w, h) {
  const f = { w, h, grid: new Array(w * h).fill(null), bld: [], belts: [], floor: [], flying: [], parts: [], pops: [],
    portalQ: [], portalT: 0, nextId: 1, gen: 0, demand: 0, lowT: 0, flash: 0, flashCol: '#fff', skillFlash: 0, t: 0,
    log: { spell: [], skill: [] }, working: 0, thumps: [], bump: 0, bumpAmp: 0, weakFlash: 0 };
  for (const p of FA.portalCells(w, h)) f.grid[p.y * w + p.x] = { type: 'portal', x: p.x, y: p.y, which: p.which };
  return f;
};
FA.initial = function () {
  const sz = CFG.factorySizes[0];
  G.fac = FA.fresh(sz[0], sz[1]);
  const sy = FA.spellY(), w = sz[0];
  FA.makeBuilding('air', w - 7, sy, true, false, 0);
  for (let x = w - 6; x <= w - 2; x++) FA.addBelt(x, sy, 0);
  const st = FA.makeBuilding('station', 8, sy + 2, true, false, 0); st.bat = CFG.batteryMax;   // a full Battery already inside
  FA.makeBuilding('charger', 10, sy + 2, true, false, 0).bat = 0;   // a spare, flat Battery waits in the Charger
  G.bd = FA.freshBuilder();
};
FA.freshBuilder = () => ({ x: 5.5, y: G.fac.h - 6.5, vx: 0, vy: 0, fx: 1, fy: 0, target: null, then: null, stuckT: 0, gather: null,
  bob: 0, moving: false, squash: 0, throwCd: 0, dustT: 0 });

// Factory Expansion: grow the floor west/north-south. Everything shifts so the portals stay on the east edge;
// the Stockpile Zone stays in the south-west corner, so it ends up further from the portals each time.
FA.resize = function (w2, h2) {
  const f = G.fac, dx = w2 - f.w, dy = FA.spellY(h2) - FA.spellY(f.h);
  const old = { bld: f.bld, belts: f.belts };
  f.w = w2; f.h = h2;
  f.grid = new Array(w2 * h2).fill(null);
  for (const p of FA.portalCells(w2, h2)) f.grid[p.y * w2 + p.x] = { type: 'portal', x: p.x, y: p.y, which: p.which };
  f.bld = []; f.belts = [];
  const refund = (o) => {   // anything that would land in the new Stockpile Zone (or off the floor) is refunded
    if (o.type === 'belt') { G.stock.wood += 1; if (o.item) FA.dropAt(o.item.kind, 6.5, h2 - 6.5); return; }
    if (o.done && !o.free) { const c = FA.def(o).cost; for (const k in c) G.stock[k] += c[k]; }
    else if (o.done && o.free) G.credits[o.type] = (G.credits[o.type] || 0) + 1;
    else for (const k in o.got) G.stock[k] += o.got[k];
    if (o.bat != null) FA.dropAt('battery', 6.5, h2 - 6.5, o.bat);
  };
  const place = (o, list) => {
    o.x += dx; o.y += dy;
    if (!FA.inb(o.x, o.y) || FA.reserved(o.x, o.y) || f.grid[o.y * w2 + o.x]) { refund(o); return; }
    list.push(o); f.grid[o.y * w2 + o.x] = o;
  };
  old.bld.forEach(o => place(o, f.bld));
  old.belts.forEach(o => place(o, f.belts));
  const shift = o => { o.x += dx; o.y += dy; };
  f.floor.forEach(shift); f.parts.forEach(shift); f.pops.forEach(shift);
  f.flying.forEach(o => { o.x += dx; o.y += dy; o.sx += dx; o.sy += dy; o.tx += dx; o.ty += dy; });
  const bd = G.bd;
  bd.x += dx; bd.y += dy; bd.target = null; bd.then = null;
  if (bd.gather) bd.gather = null;
  if (typeof R !== 'undefined') { R.fcam.x += dx; R.fcam.y += dy; }
  FA.burst(bd.x, bd.y, '#ffe36b', 30);
};

FA.makeBuilding = function (type, x, y, done, free, dir) {
  const f = G.fac, d = CFG.buildings[type];
  const b = { id: f.nextId++, type, x, y, dir: dir || 0, done: !!done, free: !!free, got: {}, out: [], timer: 0,
    powered: true, draw: 0, pop: 0, anim: Math.random() * 6 };
  if (d.kind === 'crafter') { b.recipe = null; b.inv = {}; b.prog = 0; }
  if (d.kind === 'station') b.bat = null;
  if (d.kind === 'charger') { b.bat = null; b.fuel = { air: 0, water: 0, fire: 0, earth: 0 }; b.types = []; }
  if (FA.isLogi(b)) { b.rr = 0; b.cd = 0; }
  if (d.kind === 'sorter') b.filter = null;
  f.bld.push(b);
  FA.setCell(x, y, b);
  if (b.done) FA.onComplete(b, true);
  return b;
};
FA.onComplete = function (b, quiet) {
  b.done = true;
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
FA.say = a => { if (a.ic) FA.ipop(G.bd.x, G.bd.y - 0.3, a.ic.map(k => [k])); else if (a.label) FA.pop(G.bd.x, G.bd.y - 0.3, a.label, '#ffd0a0'); };   // why an action can't happen

// ---------- hands & floor items ----------
FA.canHold = k => !G.hands || (G.hands.kind === k && G.hands.n < FA.stackMax(k));
FA.addHands = function (k, n, charge) {
  if (!G.hands) G.hands = { kind: k, n: 0 };
  G.hands.n += n;
  if (k === 'battery') G.hands.charge = charge || 0;
};
FA.takeOne = function () {
  const h = G.hands;
  if (!h) return null;
  const it = { kind: h.kind, charge: h.charge };
  h.n--;
  if (h.n <= 0) G.hands = null;
  return it;
};
FA.dropAt = function (kind, x, y, charge) {
  const a = Math.random() * 6.283, r = Math.random() * 0.25;
  G.fac.floor.push({ kind, charge, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: 0.4, vz: 2.5, t: 0 });
};
FA.dropHands = function () {   // never deletes: everything lands on the floor at the Builder's feet
  while (G.hands) { const it = FA.takeOne(); FA.dropAt(it.kind, G.bd.x, G.bd.y, it.charge); }
};
FA.stash = function () {       // resources back to the Stockpile; anything else lands on the floor
  const h = G.hands;
  if (!h) return;
  if (RES[h.kind]) { G.stock[h.kind] += h.n; G.hands = null; AU.sfx('drop'); return; }
  FA.dropHands();
};
FA.pickFloor = function (it) {   // one item per press (hold to keep grabbing)
  const f = G.fac, i = f.floor.indexOf(it);
  if (i < 0 || !FA.canHold(it.kind)) return;
  FA.addHands(it.kind, 1, it.charge);
  f.floor.splice(i, 1);
  AU.sfx('pickup'); G.bd.squash = 0.2;
};

// ---------- placement / demolish ----------
FA.canPlace = (x, y) => FA.inb(x, y) && !FA.reserved(x, y) && !G.fac.grid[y * G.fac.w + x];
FA.needOf = function (b) {
  const cost = FA.def(b).cost, need = {};
  for (const k in cost) { const n = cost[k] - (b.got[k] || 0); if (n > 0) need[k] = n; }
  return need;
};
FA.needText = need => Object.keys(need).map(k => need[k] + ' ' + RES[k].name).join(', ');
FA.place = function (type, x, y, dir) {
  if (!FA.unlocked(type)) { UI.toast('Unlock ' + CFG.buildings[type].name + ' in the Skill Tree first.', 'L', 'ic_lock'); AU.sfx('error'); return false; }
  if (!FA.canPlace(x, y)) return false;
  const credit = G.credits[type] > 0;
  const b = FA.makeBuilding(type, x, y, credit, credit, dir);
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
FA.demolish = function (x, y) {
  const c = FA.cell(x, y);
  if (!c || c.type === 'portal') return false;
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
  }
  FA.setCell(x, y, null);
  FA.burst(cx, cy, '#ff9a8a');
  FA.ipop(cx, cy, c.type === 'belt' ? [['wood']] : Object.keys(FA.def(c).cost).map(k => [k]));   // what came back
  AU.sfx('drop');
  UI.changed();
  return true;
};

// ---------- recipes ----------
FA.recipeOk = id => { const r = CFG.recipes[id]; return !!G.tree[r.tier] && (!r.req || !!G.tree[r.req]) && (r.out !== 'battery' || !!G.tree.forge); };
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
    return !!ELEM[kind] && FA.fuelTotal(b) + CFG.fuelPerPacket <= CFG.fuelCap;
  }
  if (d.kind === 'station') return kind === 'battery' && b.bat == null;
  if (d.kind === 'splitter' || d.kind === 'sorter') return kind !== 'battery' && b.out.length < 2;
  if (d.kind === 'crate') return !RES[kind] && kind !== 'battery' && b.out.length < CFG.crateCap;
  return false;
};
FA.insert = function (b, kind, charge) {
  b.pop = 0.22;
  if (!b.done) {
    b.got[kind] = (b.got[kind] || 0) + 1;
    if (!Object.keys(FA.needOf(b)).length) FA.onComplete(b);
    return;
  }
  const d = FA.def(b);
  if (d.kind === 'crafter') b.inv[kind] = (b.inv[kind] || 0) + 1;
  else if (FA.isLogi(b)) b.out.push({ kind });
  else if (d.kind === 'station') {
    b.bat = charge || 0;
    if (b.bat <= 0) FA.ipop(b.x + 0.5, b.y + 0.5, [['battery'], ['ic_x']]);
  } else if (d.kind === 'charger') {
    if (kind === 'battery') { b.bat = charge || 0; b.types = Object.keys(b.fuel).filter(k => b.fuel[k] > 0); }
    else { b.fuel[kind] += CFG.fuelPerPacket; if (b.bat != null && b.types.indexOf(kind) < 0) b.types.push(kind); }
  }
};
// a Battery in hand and one in a Station / Charger trade places (nothing ever has to hit the floor)
FA.canSwap = (b, k) => k === 'battery' && !!b && typeof b === 'object' && !!b.done && (b.type === 'station' || b.type === 'charger') && b.bat != null;
FA.takeBat = function (b) {
  const old = b.bat;
  b.bat = null; if (b.types) b.types = [];
  return old;
};
FA.takeOut = function (b) {   // one item per press
  if (!b.out.length || !FA.canHold(b.out[0].kind)) return;
  const o = b.out.shift();
  FA.addHands(o.kind, 1, o.charge);
  AU.sfx('pickup'); G.bd.squash = 0.2;
};
FA.fuelTotal = c => c.fuel.air + c.fuel.water + c.fuel.fire + c.fuel.earth;

// ---------- portals ----------
FA.enterPortal = function (c, kind) {   // returns false if this portal doesn't take that item
  if (!FA.portalTakes(c, kind)) return false;
  if (c.which === 'skill') FA.bank(kind); else FA.deliver(kind);
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
    const p = FA.portal('skill');
    FA.dropAt(k, p.x - 0.4, p.y + 1);
    G.fac.skillFlash = 0.4;
    UI.changed();
    return k;
  }
  return null;
};
FA.deliver = function (kind) {
  const f = G.fac, p = FA.portal('spell');
  G.stats.deliveries++;
  G.w.run.deliveries++;
  G.w.run.spells[kind] = (G.w.run.spells[kind] || 0) + 1;
  f.flash = 0.5; f.flashCol = ITEMS[kind].color || '#fff';
  if (ELEM[kind]) FA.eburst(p.x + 0.5, p.y + 1, kind, 8);
  f.log.spell.push(f.t);
  G.flags['sent_' + kind] = true;
  FA.ipop(p.x + 0.5, p.y + 1, [[kind]]);
  if (kind === 'sigil') WZ.summonBoss();
  else if (ITEMS[kind].pickup) {
    WZ.dropPickup(kind);
  } else {
    const spell = BASIC_SPELL[kind] || kind;
    if (!BASIC_SPELL[kind]) {
      G.flags.combo = true;
      if (CFG.recipes[kind] && Object.keys(CFG.recipes[kind].in).length === 3) G.flags.triple = true;
    }
    WZ.cast(spell);
  }
  AU.sfx('deliver');
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
  if (c.type === 'portal') { if (!FA.enterPortal(c, o.kind)) return false; }
  else if (c.type === 'belt') { if (c.item || o.kind === 'battery' || (c.dir + 2) % 4 === di) return false; c.item = { kind: o.kind, prog: 0, moved: true }; }
  else if (FA.canInsert(c, o.kind)) FA.insert(c, o.kind, o.charge);
  else return false;
  b.out.shift();
  return true;
};
FA.tryOut = b => FA.pushSide(b, b.dir);
// Splitter: front / right / left in turn. Sorter: filter matches out the front, the rest out the sides. Crate: front.
FA.logiSides = function (b) {
  const k = FA.def(b).kind, o = b.out[0];
  if (k === 'crate') return [b.dir];
  if (k === 'splitter') return [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4];
  return !b.filter || (o && o.kind === b.filter) ? [b.dir] : [(b.dir + 1) % 4, (b.dir + 3) % 4];
};
FA.updLogi = function (b, dt) {
  if (b.cd > 0) { b.cd -= dt; return; }
  if (!b.out.length) { b.blocked = false; return; }
  const sides = FA.logiSides(b), n = sides.length, r0 = (b.rr || 0) % n;
  for (let i = 0; i < n; i++) {
    if (FA.pushSide(b, sides[(r0 + i) % n])) { b.rr = (r0 + i + 1) % n; b.cd = FA.beltTime() * 0.4; b.blocked = false; return; }
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
  if (k === 'splitter' || k === 'sorter') return b.out.length >= 2 ? 'full' : b.out.length ? (b.blocked ? 'jam' : 'work') : null;
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
  if (d.kind === 'harness' && d.power > 0) return b.out.length < CFG.buffer ? d.power : 0;
  return 0;
};
FA.power = function () {
  const f = G.fac;
  let gen = 0;
  for (const b of f.bld) if (b.done && b.type === 'station' && b.bat != null && b.bat > 0) gen += CFG.stationGen;
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
  for (let i = f.thumps.length - 1; i >= 0; i--) { f.thumps[i].t += dt; if (f.thumps[i].t > 0.5 + f.thumps[i].tier * 0.12) f.thumps.splice(i, 1); }
  FA.power();
  if (f.demand > f.gen) {
    f.lowT -= dt;
    if (f.lowT <= 0) { f.lowT = 16; UI.toast('Not enough power: machines are stalling! Charge a Battery.', 'L', 'ic_bolt'); }
  } else f.lowT = 0;
  for (const k in f.log) while (f.log[k].length && f.t - f.log[k][0] > 60) f.log[k].shift();

  f.working = 0;
  for (const b of f.bld) {
    if (b.pop > 0) b.pop -= dt;
    if (!b.done) continue;
    const d = FA.def(b);
    b.anim += dt * (b.st === undefined || b.st === null ? 1 : FA.stateSpeed[b.st]);
    if (d.kind === 'harness') {
      if (b.out.length < CFG.buffer && b.powered) {
        b.timer += dt; f.working++;
        if (b.timer >= FA.cycle(b.type)) { b.timer = 0; b.out.push({ kind: d.elem }); b.pop = 0.25; G.stats.packets++; FA.eburst(b.x + 0.5, b.y + 0.5, d.elem, 4); }
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
            b.pop = 0.35;
            FA.burst(b.x + 0.5, b.y + 0.5, ITEMS[R.out].color, 10);
            AU.sfx('craft');
          }
        }
      } else b.prog = 0;
    } else if (d.kind === 'station') {
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
      else if (nc.type === 'portal') { if (FA.enterPortal(nc, it.kind)) bl.item = null; }
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
    const k = Math.min(1, o.t / o.T);
    o.x = o.sx + (o.tx - o.sx) * k; o.y = o.sy + (o.ty - o.sy) * k; o.z = Math.sin(k * Math.PI) * o.h + (1 - k) * 0.8;
    if (k >= 1) { f.flying.splice(i, 1); FA.land(o); }
  }
  for (const o of f.floor) {
    o.t += dt;
    if (o.z > 0 || o.vz > 0) { o.z += o.vz * dt; o.vz -= 14 * dt; if (o.z <= 0) { o.z = 0; o.vz = Math.abs(o.vz) > 2 ? -o.vz * 0.35 : 0; } }
  }
  FA.gatherFloor(dt);
  for (let i = f.parts.length - 1; i >= 0; i--) {
    const p = f.parts[i];
    p.t -= dt; p.x += p.vx * dt * 0.5; p.y += p.vy * dt * 0.5; p.z += p.vz * dt; p.vz -= (p.g === undefined ? 9 : p.g) * dt;
    if (p.spin) { const a = dt * 6, vx = p.vx; p.vx = vx * Math.cos(a) - p.vy * Math.sin(a); p.vy = vx * Math.sin(a) + p.vy * Math.cos(a); }
    if (p.bounce && p.z < 0) { p.z = 0; p.vz = Math.abs(p.vz) * 0.4; p.bounce = 0; }
    if (p.t <= 0) f.parts.splice(i, 1);
  }
  for (let i = f.pops.length - 1; i >= 0; i--) { f.pops[i].t += dt; if (f.pops[i].t > 1.1) f.pops.splice(i, 1); }
  FA.updGather(dt);
  if (G.bd.squash > 0) G.bd.squash -= dt;
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
  if (c.bat >= CFG.batteryMax) { G.flags.recharged = true; FA.ipop(c.x + 0.5, c.y + 0.5, [['battery'], ['ic_check']]); AU.sfx('charge'); c.pop = 0.4; }
};

// ---------- throwing ----------
// will this receiver take a thrown item of kind k? (portal / belt / building / blueprint / the Stockpile Zone)
FA.accepts = (o, k) => (o === 'zone' ? !!RES[k] : !o ? false : o.type === 'portal' ? FA.portalTakes(o, k) : o.type === 'belt' ? !o.item && k !== 'battery' : FA.canInsert(o, k) || FA.canSwap(o, k));
// every receiver in throwing range that would take kind k, with a priority (lower = preferred)
FA.throwList = function (k) {
  const bd = G.bd, out = [];
  const add = (x, y, obj, prio) => { const d = Math.hypot(x - bd.x, y - bd.y); if (d >= 0.4 && d <= CFG.throwRange) out.push({ x, y, obj, prio, d }); };
  for (const p of FA.portalCells(G.fac.w, G.fac.h)) { const c = FA.cell(p.x, p.y); if (FA.portalTakes(c, k)) add(p.x + 0.5, p.y + 0.5, c, 0.8); }
  for (const b of G.fac.bld) if (FA.canInsert(b, k) || FA.canSwap(b, k)) add(b.x + 0.5, b.y + 0.5, b, b.done && FA.isLogi(b) ? 1.4 : 1);
  if (RES[k]) { const z = FA.zone(); add((z.x0 + z.x1 + 1) / 2, (z.y0 + z.y1 + 1) / 2, 'zone', 1.1); }
  if (k !== 'battery') for (const bl of G.fac.belts) if (!bl.item) add(bl.x + 0.5, bl.y + 0.5, bl, 2.2);
  return out;
};
// ---------- deliberate target selection (pad right stick / Tab): G.lock pins one target until it stops being valid ----------
// holding something: cycle the receivers that take it (best first). Empty-handed: cycle what's in reach to pick or use
FA.lockList = function () {
  const bd = G.bd, h = G.hands;
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
  const l = G.lock, h = G.hands;
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
  const bd = G.bd, h = G.hands;
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
  if (!G.hands || bd.throwCd > 0) return false;
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
FA.land = function (o) {
  const tx = Math.floor(o.x), ty = Math.floor(o.y), c = FA.cell(tx, ty);
  const fell = () => FA.dropAt(o.kind, o.x, o.y, o.charge);
  const bounce = () => {   // couldn't go in: hop back toward where it came from
    const dx = o.sx - o.x, dy = o.sy - o.y, d = Math.hypot(dx, dy) || 1;
    FA.dropAt(o.kind, o.x + dx / d * 0.85, o.y + dy / d * 0.85, o.charge);
    AU.sfx('error');
  };
  if (c && c.type === 'portal') {
    if (FA.enterPortal(c, o.kind)) { if (o.fromBuilder && c.which === 'spell') G.flags.portalHand = true; }
    else { bounce(); FA.ipop(o.x, o.y, [[o.kind], ['ic_x']]); }
    return;
  }
  if (c && c.type === 'belt') {
    if (!c.item && o.kind !== 'battery') { c.item = { kind: o.kind, prog: 0.5, moved: true }; AU.sfx('drop'); return; }
    return fell();
  }
  if (c) {
    if (FA.canInsert(c, o.kind)) { FA.insert(c, o.kind, o.charge); AU.sfx('drop'); FA.ipop(o.x, o.y, [[o.kind]]); return; }
    return bounce();
  }
  if (FA.reserved(tx, ty) && RES[o.kind]) { G.stock[o.kind]++; FA.ipop(o.x, o.y, [[o.kind]]); AU.sfx('drop'); return; }
  fell();
  AU.sfx('thud');
};

// ---------- the Builder ----------
FA.solid = function (tx, ty) {
  if (!FA.inb(tx, ty)) return true;
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
  const el = FA.def(b).elem;
  G.bd.gather = { b, t: 0, total: FA.cycle(b.type) + CFG.gatherExtra, el };
  G.bd.target = null;
  AU.sfx('blip');
};
FA.crank = function () {
  const g = G.bd.gather;
  if (!g) return;
  g.t += CFG.crankBoost;
  G.bd.squash = 0.15;
  FA.eburst(g.b.x + 0.5, g.b.y + 0.5, g.el, 4);
  AU.sfx('crank');
};
FA.updGather = function (dt) {
  const bd = G.bd, g = bd.gather;
  if (!g) return;
  if (G.fac.grid[g.b.y * G.fac.w + g.b.x] !== g.b) { bd.gather = null; return; }
  g.t += dt; bd.bob += dt * 9;
  if (g.t >= g.total) {
    bd.gather = null;
    if (FA.canHold(g.el)) FA.addHands(g.el, 1); else FA.dropAt(g.el, bd.x, bd.y);
    G.flags.gathered = true; G.stats.packets++;
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
  const bd = G.bd, fm = Math.hypot(bd.fx, bd.fy) || 1, hk = G.hands && G.hands.kind;
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
  const h = G.hands, k = h && h.kind, f = G.fac, pick = mode === 'pick';
  switch (t.kind) {
    case 'floor': {
      const it = t.o;
      if (!pick || f.floor.indexOf(it) < 0) return NONE;
      return FA.canHold(it.kind) ? A('Pick up ' + itemName(it.kind), () => FA.pickFloor(it), true, [it.kind]) : FULL;
    }
    case 'pile': {
      if (!pick) return NONE;
      const r = t.o;
      if (h && (k !== r || h.n >= FA.cap())) return FULL;
      if (G.stock[r] <= 0) return A('No ' + RES[r].name + ': the Wizard must harvest more', null, false, [r, 'ic_x']);
      return A('Take ' + RES[r].name, () => FA.takePile(r), true, [r]);
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
  const h = G.hands, k = h && h.kind, d = FA.def(b);
  if (!b.done) {
    if (!pick) return NONE;
    const need = FA.needOf(b);
    return A(h && need[k] ? 'Throw ' + itemName(k) + ' in to build' : 'Needs ' + FA.needText(need), null, false, Object.keys(need));
  }
  if (pick) {
    if (b.out.length) return FA.canHold(b.out[0].kind) ? A('Take ' + itemName(b.out[0].kind), () => FA.takeOut(b), true, [b.out[0].kind]) : FULL;
    if ((d.kind === 'station' || d.kind === 'charger') && b.bat != null) {
      if (h && k === 'battery') return A('Swap Battery (' + Math.round(b.bat / CFG.batteryMax * 100) + '%)', () => {
        const it = FA.takeOne(); FA.addHands('battery', 1, FA.takeBat(b)); FA.insert(b, 'battery', it.charge);
        AU.sfx('pickup'); G.bd.squash = 0.2; UI.changed();
      }, false, ['battery', 'ic_swap']);
      if (h) return FULL;
      return A('Take Battery (' + Math.round(b.bat / CFG.batteryMax * 100) + '%)', () => { FA.addHands('battery', 1, b.bat); b.bat = null; if (b.types) b.types = []; AU.sfx('pickup'); }, false, ['battery']);
    }
    return NONE;
  }
  if (G.bd.gather && G.bd.gather.b === b) return A('Crank!', () => FA.crank(), false, [G.bd.gather.el]);
  const turn = A('Turn output', () => { b.dir = (b.dir + 1) % 4; b.pop = 0.2; AU.sfx('blip'); }, false, ['ic_rotate']);
  if (d.kind === 'sorter') {
    if (h && b.filter !== k) return A('Sort ' + itemName(k) + ' out the front', () => { b.filter = k; b.pop = 0.3; AU.sfx('blip'); UI.changed(); }, false, [k]);
    if (!h && b.filter) return A('Clear filter (' + itemName(b.filter) + ')', () => { b.filter = null; AU.sfx('blip'); UI.changed(); }, false, [b.filter, 'ic_x']);
    return turn;
  }
  if (d.kind === 'harness') return FA.canHold(d.elem) ? A('Hand-gather ' + ELEM[d.elem].name + ' (then tap to crank)', () => FA.startGather(b), false, [d.elem]) : FULL;
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
    if (b.out.length >= CFG.buffer) st = 'BLOCKED: nothing takes its output. Belt it away or take it (click)'; else if (!b.powered) st = 'NO POWER';
    else if (FA.shrineBoost(b.type) > 1) st = 'producing, SHRINE BOOST +' + Math.round(CFG.marks.shrineBoost * 100) + '% (the Wizard is at a ' + ELEM_WORD[d.elem] + ' Shrine)';
    return n + ': ' + b.out.length + '/' + CFG.buffer + ' ready, ' + st;
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
  if (d.kind === 'splitter') return n + ': ' + (b.out.length >= 2 ? 'BLOCKED: no free side to push into' : 'deals items out of its front, right and left');
  if (d.kind === 'sorter') return n + ': ' + (b.filter ? itemName(b.filter) + ' out the front, everything else out the sides' : 'no filter (E with an item in hand sets it)') + (b.out.length >= 2 ? '. BLOCKED' : '');
  if (d.kind === 'crate') return n + ': ' + b.out.length + '/' + CFG.crateCap + (b.out.length ? ', next out: ' + itemName(b.out[0].kind) : ', empty') + '. Feeds its arrow side; point it at nothing to just store';
  if (d.kind === 'station') return n + ': ' + (b.bat == null ? 'empty, insert a charged Battery' : 'Battery ' + Math.round(b.bat) + '/' + CFG.batteryMax + (b.bat > 0 ? ', +10 power, ' + Math.ceil(FA.life(b)) + 's left at this load' : ' (flat)'));
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
    w: f.w, h: f.h,
    bld: f.bld.map(b => {
      const o = { type: b.type, x: b.x, y: b.y, dir: b.dir, done: b.done, free: b.free, got: b.got, out: b.out, timer: b.timer };
      if (b.inv) { o.recipe = b.recipe; o.inv = b.inv; o.prog = b.prog; }
      if (b.bat !== undefined) o.bat = b.bat;
      if (b.fuel) { o.fuel = b.fuel; o.types = b.types; }
      if (b.filter) o.filter = b.filter;
      return o;
    }),
    belts: f.belts.map(b => ({ x: b.x, y: b.y, dir: b.dir, item: b.item ? b.item.kind : null })),
    floor: f.floor.concat(f.flying.map(o => ({ kind: o.kind, charge: o.charge, x: o.tx, y: o.ty }))).map(o => ({ kind: o.kind, charge: o.charge, x: o.x, y: o.y })),
    portalQ: f.portalQ,
  };
};
FA.fromJSON = function (j) {
  const sz = CFG.factorySizes[Math.min(lvl('expand'), CFG.factorySizes.length - 1)];
  G.fac = FA.fresh(j.w || sz[0], j.h || sz[1]);
  (j.bld || []).forEach(o => {
    if (!CFG.buildings[o.type] || !FA.inb(o.x, o.y) || G.fac.grid[o.y * G.fac.w + o.x]) return;
    const b = FA.makeBuilding(o.type, o.x, o.y, false, o.free, o.dir || 0);
    b.done = !!o.done; b.got = o.got || {}; b.out = Array.isArray(o.out) ? o.out.filter(x => x && ITEMS[x.kind]) : []; b.timer = o.timer || 0;
    if (b.inv) { b.recipe = o.recipe && CFG.recipes[o.recipe] ? o.recipe : null; b.inv = o.inv || {}; b.prog = o.prog || 0; }
    if (b.bat !== undefined) b.bat = o.bat == null ? null : o.bat;
    if (b.fuel) { b.fuel = Object.assign(b.fuel, o.fuel || {}); b.types = o.types || []; }
    if (b.filter !== undefined) b.filter = o.filter && ITEMS[o.filter] ? o.filter : null;
  });
  (j.belts || []).forEach(o => {
    if (!FA.inb(o.x, o.y) || G.fac.grid[o.y * G.fac.w + o.x]) return;
    const b = FA.addBelt(o.x, o.y, o.dir);
    if (o.item && ITEMS[o.item]) b.item = { kind: o.item, prog: 0.5, moved: false };
  });
  (j.floor || []).forEach(o => { if (ITEMS[o.kind]) G.fac.floor.push({ kind: o.kind, charge: o.charge, x: o.x, y: o.y, z: 0, vz: 0, t: 1 }); });
  G.fac.portalQ = (j.portalQ || []).filter(q => q && ITEMS[q.kind]);
  FA.refreshRecipes();
};
