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
// ----- the Stockpile: a physical inventory made of Stockpile tiles (G.fac.land === 2). One tile holds ONE kind, up to CFG.stockCap of it; a kind with more
// spreads over more tiles. G.stock[kind] is the count, the tiles each kind sits on are worked out from it (G.fac.slots: kind -> [tile index], kept by FA.pileSync).
// Whatever no longer fits (a tile was demolished, a gift was too big) spills out onto the nearest floor, CFG.floorCap items a tile; when the floor is full
// too, it goes through the Spell Portal into the wilds (FA.toWild). -----
FA.storable = k => !!(RES[k] || ELEM[k] || (ITEMS[k] && (ITEMS[k].aug || ITEMS[k].spell)));   // resources, Cores, the Warden Key, element packets, garments and forged combo spells
FA.isPile = (x, y) => FA.inb(x, y) && G.fac.land[y * G.fac.w + x] === 2;
FA.pileTiles = () => { const f = G.fac, out = []; for (let i = 0; i < f.land.length; i++) if (f.land[i] === 2) out.push(i); return out; };
FA.tileXY = i => ({ x: i % G.fac.w, y: Math.floor(i / G.fac.w) });
// what is still on its way to the Stockpile (stock flights), per kind
FA.inFlight = function () {
  const out = {};
  for (const o of G.fac.flying) if (o.stock) out[o.kind] = (out[o.kind] || 0) + (o.n || 1);
  return out;
};
// how many more of this kind the Stockpile can take right now (its own tiles' room plus every free tile)
FA.room = function (k, air) {
  if (!FA.storable(k)) return 0;
  const C = CFG.stockCap, fl = air || FA.inFlight(), have = q => (G.stock[q] || 0) + (fl[q] || 0);
  let used = 0;
  for (const q in G.stock) if (q !== k && FA.storable(q) && have(q) > 0) used += Math.ceil(have(q) / C);
  for (const q in fl) if (q !== k && !(q in G.stock) && have(q) > 0) used += Math.ceil(have(q) / C);
  return Math.max(0, (FA.pileTiles().length - used) * C - have(k));
};
FA.pileSync = function () {
  const f = G.fac, C = CFG.stockCap, s = f.slots || (f.slots = {}), air = FA.inFlight(), tiles = FA.pileTiles(), isT = {}, taken = {};
  for (const i of tiles) isT[i] = true;
  const kinds = Object.keys(G.stock).concat(Object.keys(air)).filter((k, i, a) => a.indexOf(k) === i && FA.storable(k) && (G.stock[k] || 0) + (air[k] || 0) > 0);
  for (const k in s) if (kinds.indexOf(k) < 0) delete s[k];
  for (const k of kinds) {   // keep the tiles a kind already has (as many as it needs)
    const need = Math.ceil(((G.stock[k] || 0) + (air[k] || 0)) / C);
    s[k] = (s[k] || []).filter(i => isT[i] && !taken[i]).slice(0, need);
    for (const i of s[k]) taken[i] = true;
  }
  for (const k of kinds) {   // then hand out free tiles, nearest to the kind's own first (or to the Stockpile's corner)
    const need = Math.ceil(((G.stock[k] || 0) + (air[k] || 0)) / C);
    while (s[k].length < need) {
      const ref = s[k].length ? FA.tileXY(s[k][0]) : FA.tileXY(tiles[0] || 0);
      let best = -1, bd = 1e9;
      for (const i of tiles) { if (taken[i]) continue; const q = FA.tileXY(i), d = Math.hypot(q.x - ref.x, q.y - ref.y) + i * 1e-6; if (d < bd) { bd = d; best = i; } }
      if (best < 0) break;
      s[k].push(best); taken[best] = true;
    }
    const over = Math.min(G.stock[k] || 0, (G.stock[k] || 0) + (air[k] || 0) - s[k].length * C);
    if (over > 0) {   // no room left for it: the extras spill out of the Stockpile onto the floor
      G.stock[k] -= over;
      const src = s[k].length ? FA.tileXY(s[k][s[k].length - 1]) : tiles.length ? FA.tileXY(tiles[0]) : FA.portal('spell');
      for (let n = 0; n < over; n++) FA.dropAt(k, src.x + 0.5, src.y + 0.5, true);
      UI.changed();
    }
  }
};
// what lies on each Stockpile tile: [{ i, x, y, kind, n }] (a kind's first tiles are full, its last one holds the rest)
FA.pileList = function () {
  const s = G.fac.slots || {}, C = CFG.stockCap, out = [];
  for (const k in s) {
    let left = G.stock[k] || 0;
    for (const i of s[k]) { const q = FA.tileXY(i), n = Math.max(0, Math.min(C, left)); left -= n; out.push({ i, x: q.x + 0.5, y: q.y + 0.5, kind: k, n }); }
  }
  return out;
};
// the tile a flight of this kind should head for: the kind's tile with room, else the next free one (assign = reserve it now)
FA.pileSpot = function (k, assign) {
  const s = G.fac.slots || (G.fac.slots = {}), C = CFG.stockCap, have = (G.stock[k] || 0) + (FA.inFlight()[k] || 0), mine = s[k] || [];
  if (mine.length && (have % C || have < mine.length * C)) { const q = FA.tileXY(mine[Math.min(mine.length - 1, Math.floor(have / C))]); return { x: q.x + 0.5, y: q.y + 0.5 }; }
  const used = {}; for (const q in s) for (const i of s[q]) used[i] = true;
  const tiles = FA.pileTiles(), ref = mine.length ? FA.tileXY(mine[0]) : FA.tileXY(tiles[0] || 0);
  let best = -1, bd = 1e9;
  for (const i of tiles) { if (used[i]) continue; const q = FA.tileXY(i), d = Math.hypot(q.x - ref.x, q.y - ref.y) + i * 1e-6; if (d < bd) { bd = d; best = i; } }
  if (best < 0) best = mine.length ? mine[mine.length - 1] : tiles[0];
  if (best === undefined) { const p = FA.portal('spell'); return { x: p.x - 0.5, y: p.y + 0.5 }; }
  if (assign && mine.indexOf(best) < 0) (s[k] = mine).push(best);
  const q = FA.tileXY(best);
  return { x: q.x + 0.5, y: q.y + 0.5 };
};
// the stacks that exist right now, by kind (the first tile of each): only kinds with something in the Stockpile
FA.piles = () => { const out = {}; for (const p of FA.pileList()) if (p.n > 0 && !out[p.kind]) out[p.kind] = { x: p.x, y: p.y }; return out; };
// ----- the floor: a loose item needs a plain floor tile (no building, belt or Stockpile) with fewer than CFG.floorCap items on it -----
FA.floorOk = (x, y) => FA.owned(x, y) && !FA.isPile(x, y) && !G.fac.grid[y * G.fac.w + x];
FA.floorCount = function (tx, ty) {
  let n = 0;
  for (const o of G.fac.floor) if (Math.floor(o.x) === tx && Math.floor(o.y) === ty) n++;
  for (const o of G.fac.flying) if (o.boing && !o.stock && Math.floor(o.tx) === tx && Math.floor(o.ty) === ty) n++;   // bounces already on their way there
  return n;
};
// the nearest floor tile (centre) that still has room, or null when the whole floor is full
FA.floorSpot = function (x, y) {
  const f = G.fac, cnt = {};
  for (const o of f.floor) { const i = Math.floor(o.y) * f.w + Math.floor(o.x); cnt[i] = (cnt[i] || 0) + 1; }
  for (const o of f.flying) if (o.boing && !o.stock) { const i = Math.floor(o.ty) * f.w + Math.floor(o.tx); cnt[i] = (cnt[i] || 0) + 1; }
  let best = null, bd = 1e9;
  for (let ty = 0; ty < f.h; ty++) for (let tx = 0; tx < f.w; tx++) {
    if (!FA.floorOk(tx, ty) || (cnt[ty * f.w + tx] || 0) >= CFG.floorCap) continue;
    const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
    if (d < bd) { bd = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
  }
  return best;
};
// The ? station: one tile off the Stockpile's top-left edge. Throw anything at it: it bounces off into the Stockpile (or back to the Builder when that
// cannot be stored) and a short note floats over it saying what the thing is for (G.fac.q = { kind, t, age }).
FA.qTile = () => G.fac.qp || { x: CFG.factory.base.x0 - 1, y: CFG.factory.base.y0 + CFG.factory.base.h - 2 };
FA.isQ = (x, y) => { const q = FA.qTile(); return x === q.x && y === q.y; };
FA.qInfo = function (k) {
  let use;
  if (k === 'wood' || k === 'stone') use = 'Builds things. Burns in a Battery.';
  else if (k === 'iron') use = 'Builds Forges, Armory, Batteries.';
  else if (k === 'shard') use = 'Rare. Spawners, garments, keys. Skill Portal: Summoning.';
  else if (isCoreKind(k)) use = 'Forges garments and the Warden Key. Opens other Shrines.';
  else if (isKeyKind(k)) use = 'Spell Portal: opens the Stronghold door.';
  else if (ELEM[k]) use = 'Feeds Forge, Spawner, Battery.';
  else if (ITEMS[k] && ITEMS[k].spell) use = SEED_SPELL[k] ? 'Cast it, bank it, or hatch a ' + CFG.creatures[SEED_SPELL[k]].name + ' at the Spawner.' : 'Cast it: Spell Portal. Bank it: Skill.';
  else if (k === 'potion' || k === 'elixir') use = 'Heals the Wizard via the Spell Portal.';
  else if (k === 'armor' || k === 'plate') use = 'Armors the Wizard via the Spell Portal.';
  else if (ITEMS[k] && ITEMS[k].egg) use = 'Spell Portal: hatches beside the Wizard.';
  else if (ITEMS[k] && ITEMS[k].aug) use = 'Spell Portal: the Wizard wears it.';
  else use = 'Throw it into a machine or portal.';
  return { name: itemName(k), use, stores: FA.storable(k) };
};
FA.qHit = function (o, bounce) {
  const f = G.fac, k = o.kind, info = FA.qInfo(k);
  f.q = { kind: k, t: CFG.qShow, age: 0 };
  if (info.stores && FA.room(k) > 0) {   // boings off the station and into its pile
    const sp = FA.pileSpot(k, true);
    FA.impact(o); AU.sfx('boing');
    f.flying.push({ kind: k, n: 1, stock: true, q: true, boing: true, sx: o.x, sy: o.y, x: o.x, y: o.y, z: 0.8, tx: sp.x, ty: sp.y, t: 0, T: 0.6, h: 1.7 });
  } else bounce();   // it cannot be stored: back toward the Builder like any refusal
};
FA.inb = (x, y) => x >= 0 && y >= 0 && x < G.fac.w && y < G.fac.h;
FA.owned = (x, y) => FA.inb(x, y) && G.fac.land[y * G.fac.w + x] >= 1;   // is this tile factory floor? (1 = floor, 2 = a Stockpile tile on the floor)
FA.cell = (x, y) => (FA.inb(x, y) ? G.fac.grid[y * G.fac.w + x] : undefined);
FA.setCell = (x, y, v) => { G.fac.grid[y * G.fac.w + x] = v; };

// ----- upgrade effects -----
FA.cap = () => CFG.satchel + lvl('satchel') * CFG.upgrade.satchel;
FA.beltTime = () => CFG.beltTime / (1 + CFG.upgrade.belts * lvl('belts'));
// the Builder's tracks (tree branch BUILDER) and Swift Crafting (BUILDINGS)
FA.craftMul = () => 1 / (1 - CFG.upgrade.crafting * lvl('crafting'));   // every crafter (Forge, Cauldron, Armory, Spawner): -6% cycle time a tier, so progress runs this much faster
FA.range = () => CFG.throwRange * (1 + CFG.upgrade.longarm * lvl('longarm'));   // Long Arm: how far a throw reaches
FA.throwGap = base => base * (1 - CFG.upgrade.rapid * lvl('rapid'));   // Rapid Throws: the cooldown between throws (and between a stack's throws)
FA.builderSpeed = () => CFG.builder.speed * (1 + CFG.upgrade.hustle * lvl('hustle'));   // Hustle
FA.hasRoll = () => lvl('tumble') >= 1;
FA.rollCd = () => CFG.builder.roll.cd * (1 - CFG.upgrade.tumble * Math.max(0, lvl('tumble') - 1));   // Tumble: tier 1 is the roll, tiers 2-4 shorten its cooldown
// the Wizard standing at a shrine speeds up that element's harnessers (G.w.shrine, set by WZ.updMarks)
FA.shrineBoost = b => {
  const el = b.el, w = G.w;
  if (!w || !el) return 1;
  return (w.shrine && w.shrine === el ? 1 + CFG.marks.shrineBoost : 1) * (w.surge && w.surge === el ? 1 + CFG.events.storm.boost : 1);   // a claimed shrine, and the Portal Storm's surging element
};
FA.cycle = b => CFG.harness[b.el].cycle / (1 + CFG.upgrade.swift * lvl('swift')) / FA.shrineBoost(b);
// a Harnesser makes nothing while its crystal grows (CFG.harness.growT s after every switch) or shakes (shakeT s once it is grown)
FA.growing = b => b.grow < CFG.harness.growT || b.shake > 0;
// a Battery holds batteryLife seconds at stationGen power; a Heavy Battery drains slower and lasts 50% longer. pw = the power this one battery carries
FA.drain = (pw, b) => pw * CFG.batteryMax / (CFG.batteryLife * CFG.stationGen) / (b && b.type === 'heavybat' ? 1 + CFG.heavyBattery : 1);
// seconds left in a Battery at its current load (or at full load while nothing draws)
FA.life = b => b.bat / FA.drain(G.fac.perBat > 0 ? G.fac.perBat : CFG.stationGen, b);
FA.isCell = b => !!b && typeof b === 'object' && !!b.type && !!CFG.buildings[b.type] && CFG.buildings[b.type].kind === 'cell';
// Adjacency Overdrive: a Forge or Cauldron with a charged Battery on one of its four sides crafts faster
FA.overdrive = function (b) {
  if (b.type !== 'forge' && b.type !== 'cauldron') return false;
  return DIRS.some(d => { const c = FA.cell(b.x + d[0], b.y + d[1]); return !!c && FA.isCell(c) && c.done && c.bat > 0; });
};
FA.def = b => CFG.buildings[b.type];
FA.count = type => G.fac.bld.filter(b => b.type === type && b.done).length;
FA.unlocked = id => {
  if (id === 'hand' || id === 'belt') return true;
  const u = CFG.buildings[id].unlock;
  return !u || !!G.tree[u];
};
FA.isDeliverable = k => !!ITEMS[k] && (!!(ITEMS[k].elem || ITEMS[k].spell || ITEMS[k].pickup || ITEMS[k].egg || ITEMS[k].aug) || FA.isUnlockKind(k));   // Spell Portal
FA.crateOk = k => !!ELEM[k] || !!(ITEMS[k] && ITEMS[k].egg);   // a Storage Crate holds element packets or Eggs, one kind at a time, as many as you like
FA.isBankable = k => BANK_KINDS.indexOf(k) >= 0;                                                 // Skill Portal (packets, spells and Aether Shards)
// an Egg is taken while the crafted-creature cap has room, then it waits in the portal queue; a full queue stops the portal taking more
FA.eggRoom = () => G.fac.eggQ.length < CFG.crafted.queue || (!G.w.dead && WZ.craftedAlive() < CFG.crafted.cap);
FA.portalTakes = (c, k) => (c.which === 'skill' ? FA.isBankable(k) : FA.isDeliverable(k) && (!ITEMS[k].egg || FA.eggRoom()) &&
  (!ITEMS[k].aug || (!G.w.dead)) && (!FA.isUnlockKind(k) || !!WZ.unlockTarget(k)));   // a garment needs a living Wizard; a Core / key only goes when he stands near the shrine / keep it opens
FA.isLogi = b => { const k = FA.def(b).kind; return k === 'splitter' || k === 'crate'; };

FA.fresh = function (w, h) {
  const f = { w, h, grid: new Array(w * h).fill(null), land: new Array(w * h).fill(0), pp: { x: 0, y: 0 }, added: 0, bld: [], belts: [], floor: [], flying: [], parts: [], pops: [],
    portalQ: [], eggQ: [], portalT: 0, nextId: 1, gen: 0, demand: 0, lowT: 0, flash: 0, flashCol: '#fff', skillFlash: 0, t: 0,
    log: { spell: [], skill: [] }, working: 0, thumps: [], sucks: [], bump: 0, bumpAmp: 0, weakFlash: 0, stockNext: 0,
    rings: [], waves: [], slots: {}, q: null, qp: null, outQ: [], outT: 0,   // throw impact rings, Spell Portal shockwaves; qp = the ? station's tile; outQ = items the full factory sends into the wilds
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
  const ox = B.x0, oy = B.y0, sy = oy + 1, S = CFG.factory.pile;   // the base rectangle's own coordinates (the Stockpile is its south-west S.w x S.h)
  for (let y = oy + B.h - S.h; y < oy + B.h; y++) for (let x = ox; x < ox + S.w; x++) G.fac.land[y * G.fac.w + x] = 2;
  G.fac.qp = { x: ox - 1, y: oy + B.h - S.h };   // the ? station sits off the Stockpile's top-left edge
  FA.makeBuilding('battery', ox + S.w + 1, oy + B.h - S.h, true, false, 0).bat = CFG.batteryMax;   // the one Battery: just east of the Stockpile, full
  // one Air Harnesser, 3 belts, then a free Splitter, 3 belts east straight into the Spell Portal's top cell (pink output), and south (cyan output) one belt
  // down into a Creature Spawner (Zephyr Wisps), whose Eggs ride up one belt and east into the portal's lower cell
  const sx = ox + B.w - 5;
  FA.makeBuilding('harness', sx - 4, sy, true, false, 0);
  FA.addBelt(sx - 3, sy, 0); FA.addBelt(sx - 2, sy, 0); FA.addBelt(sx - 1, sy, 0);
  const sp = FA.makeBuilding('splitter', sx, sy, true, true, 3);
  FA.addBelt(sx + 1, sy, 0); FA.addBelt(sx + 2, sy, 0); FA.addBelt(sx + 3, sy, 0);
  FA.addBelt(sx, sy + 1, 1);
  FA.makeBuilding('spawner', sx, sy + 2, true, false, 0);
  FA.addBelt(sx + 1, sy + 2, 3); FA.addBelt(sx + 1, sy + 1, 0); FA.addBelt(sx + 2, sy + 1, 0); FA.addBelt(sx + 3, sy + 1, 0);
  FA.splitConn(sp); sp.pct = { 0: CFG.starterSplit, 1: 100 - CFG.starterSplit };   // its outputs are east (the portal belts) and south (the Spawner)
  G.bd = FA.freshBuilder();
};
FA.freshBuilder = () => { const B = CFG.factory.base; return { x: B.x0 + 6.5, y: B.y0 + 4.5, vx: 0, vy: 0, fx: 1, fy: 0, flipS: false, target: null, then: null, stuckT: 0, gather: null, apT: 0,
  bob: 0, moving: false, squash: 0, throwCd: 0, dustT: 0, roll: 0, rollCd: 0, rdx: 1, rdy: 0, ghosts: [] }; };

// Floor Tiles: a blueprint placed just outside the floor; thrown its materials like any building, it turns into floor when finished.
// The Iron cost only starts after the first CFG.factory.freeIron tiles were placed.
FA.tileCost = () => { const c = Object.assign({}, CFG.buildings.expand.cost); if (G.fac.added >= CFG.factory.freeIron) c.iron = 1; return c; };
FA.canExpand = (x, y) => FA.inb(x, y) && !FA.owned(x, y) && !FA.isQ(x, y) && !G.fac.grid[y * G.fac.w + x] &&
  DIRS.some(d => FA.owned(x + d[0], y + d[1]));
// a Stockpile Tile goes on a plain, empty floor tile (it is a layer on the floor: demolishing it leaves the floor)
FA.canPileTile = (x, y) => FA.owned(x, y) && !FA.isPile(x, y) && !G.fac.grid[y * G.fac.w + x];
FA.isTile = type => type === 'expand' || type === 'stockpile';
FA.canPut = (type, x, y) => (type === 'expand' ? FA.canExpand(x, y) : type === 'stockpile' ? FA.canPileTile(x, y) : FA.canPlace(x, y));
FA.costOf = b => b.cost || FA.def(b).cost;   // a Floor Tile's cost depends on how many came before it
FA.finishTile = function (b) {   // the blueprint is paid for: the tile becomes floor (or Stockpile) and the blueprint goes away
  const f = G.fac, pile = b.type === 'stockpile';
  f.land[b.y * f.w + b.x] = pile ? 2 : 1;
  f.bld.splice(f.bld.indexOf(b), 1);
  FA.setCell(b.x, b.y, null);
  if (pile) G.stats.pileTiles = (G.stats.pileTiles || 0) + 1; else G.stats.tiles = (G.stats.tiles || 0) + 1;
  FA.burst(b.x + 0.5, b.y + 0.5, pile ? '#f4d898' : '#8ee06a', 20); FA.ipop(b.x + 0.5, b.y + 0.5, [['ic_check']]);
  AU.sfx('complete'); UI.changed();
};
// Demolishing with no building on the tile takes the tile itself: a Stockpile tile turns back into floor, a floor tile into empty ground. Both are refunded.
// What lay on it bounces to the nearest Stockpile tile with room for it / the nearest floor (and, when the factory is full, through the portal into the wilds).
FA.canLift = (x, y) => FA.owned(x, y) && !G.fac.grid[y * G.fac.w + x] && (FA.isPile(x, y) || !(Math.floor(G.bd.x) === x && Math.floor(G.bd.y) === y));   // never the floor under the Builder's feet
FA.liftCost = (x, y) => (FA.isPile(x, y) ? CFG.buildings.stockpile.cost : CFG.buildings.expand.cost);
FA.liftTile = function (x, y) {
  const f = G.fac, i = y * f.w + x, cx = x + 0.5, cy = y + 0.5;
  if (!FA.canLift(x, y)) { if (FA.owned(x, y) && Math.floor(G.bd.x) === x && Math.floor(G.bd.y) === y) FA.ipop(cx, cy, [['ic_x']]); return false; }
  const pile = f.land[i] === 2, cost = FA.liftCost(x, y);
  const here = pile ? FA.pileList().filter(p => p.i === i && p.n > 0) : [];
  for (const p of here) G.stock[p.kind] -= p.n;   // its stack leaves the Stockpile for a moment...
  f.land[i] = pile ? 1 : 0;
  if (!pile) f.added = Math.max(0, f.added - 1);
  FA.pileSync();
  for (const p of here) {   // ...and bounces to the next Stockpile tile with room, the rest onto the floor
    const keep = Math.min(p.n, FA.room(p.kind));
    if (keep > 0) FA.toStockFrom(p.kind, keep, cx, cy);
    for (let n = keep; n < p.n; n++) FA.dropAt(p.kind, cx, cy, true);
  }
  if (!pile) for (const o of f.floor.slice()) if (Math.floor(o.x) === x && Math.floor(o.y) === y) { f.floor.splice(f.floor.indexOf(o), 1); FA.dropAt(o.kind, o.x, o.y, true); }   // loose items on a lifted floor tile bounce away
  for (const k in cost) G.stock[k] = (G.stock[k] || 0) + cost[k];
  FA.burst(cx, cy, '#ff9a8a'); FA.ipop(cx, cy, Object.keys(cost).map(k => [k]));
  AU.sfx('drop'); UI.changed();
  return true;
};

FA.makeBuilding = function (type, x, y, done, free, dir) {
  const f = G.fac, d = CFG.buildings[type];
  const b = { id: f.nextId++, type, x, y, dir: dir || 0, done: !!done, free: !!free, got: {}, out: [], timer: 0,
    powered: true, draw: 0, pop: 0, anim: Math.random() * 6 };
  if (d.kind === 'crafter') { b.recipe = null; b.inv = {}; b.prog = 0; }
  if (d.kind === 'cell') { b.bat = 0; b.over = 0; b.top = false; b.fuel = { air: 0, water: 0, fire: 0, earth: 0, wood: 0, stone: 0 }; b.types = []; }   // bat = charge, fuel = what is waiting to burn, top = it was topped up lately (counts once per charge)
  if (FA.isLogi(b)) { b.rr = 0; b.cd = 0; }
  if (d.kind === 'crate') { b.ck = null; b.cn = 0; }   // what it holds: one kind, any number of them
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
  if (FA.def(b).kind === 'crafter' && !b.recipe && b.type !== 'spawner') b.recipe = FA.recipesFor(b.type)[0] || null;
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
FA.pileIn = k => { const p = FA.pileSpot(k, true); if (p) FA.ipop(p.x, p.y - 0.4, [[k]]); };   // a harvest reached the Stockpile
// something for the Stockpile (from the wilds: harvests, shards, Cores, spells, gifts) comes out of the Spell Portal and flies to its pile;
// the count goes up when it lands. Up to 6 flights share n, a beat apart. The save counts anything still in the air as already there.
FA.toStock = function (kind, n) { const port = FA.portal('spell'); FA.toStockFrom(kind, n, port.x + 0.5, port.y + 1, true); };
// the same flights from anywhere in the factory (port = they leave the Spell Portal, a beat apart, with a flash)
FA.toStockFrom = function (kind, n, px, py, port) {
  n = n || 1;
  const f = G.fac, p = FA.pileSpot(kind, true), d = Math.hypot(p.x - px, p.y - py), fl = Math.min(n, 6);
  for (let i = 0; i < fl; i++) {
    const delay = port ? Math.max(0, f.stockNext - f.t) : i * 0.06;
    if (port) f.stockNext = f.t + delay + CFG.stockFlight.gap;
    f.flying.push({ kind, n: Math.floor(n / fl) + (i < n % fl ? 1 : 0), stock: true, q: !port, sx: px, sy: py, x: px, y: py, z: 0.8, tx: p.x, ty: p.y, t: -delay,
      T: Math.min(CFG.stockFlight.maxT, CFG.stockFlight.baseT + d * CFG.stockFlight.perTile), h: 1.5 + d * 0.15 });
  }
};
// the factory is full (no Stockpile room, no floor left): the item goes through the Spell Portal and lands in the wilds beside the Wizard (FA.update sends
// G.fac.outQ one at a time while he is alive). There he can only pick it up again once the Stockpile has room.
FA.toWild = function (kind) { G.fac.outQ.push(kind); };
FA.outTick = function (dt) {
  const f = G.fac;
  if (!f.outQ.length || !G.w || G.w.dead) return;
  if ((f.outT -= dt) > 0) return;
  f.outT = 0.3;
  const k = f.outQ.shift(), p = FA.portal('spell');
  if (!ITEMS[k]) return;
  FA.suck(k, p.x + 0.5, p.y + 1);
  f.flash = Math.max(f.flash, 0.2); f.flashCol = '#ff9a8a';
  WZ.send(k, 'drop');
  if (!f.fullTipAt || f.t - f.fullTipAt > 20) { f.fullTipAt = f.t; UI.toast('The factory is full: overflow goes through the portal to the Wizard. Build Stockpile Tiles!', 'L', 'b:stockpile'); }
};
FA.say = a => { if (a.ic) FA.ipop(G.bd.x, G.bd.y - 0.3, a.ic.map(k => [k])); else if (a.label) FA.pop(G.bd.x, G.bd.y - 0.3, a.label, '#ffd0a0'); };   // why an action can't happen

// has this garment been made and not yet lost track of? (worn, in the Stockpile, in the Builder's hands, on a belt, in a machine's output, in the air or in the wilds)
FA.augMade = id => G.aug.worn[AUGS[id].slot] === id || FA.exists('aug_' + id);
// is one of these anywhere? (the Stockpile, hands, floor, flights, belts, outputs, crates, the portal queues, the wilds)
FA.exists = function (k) {
  const f = G.fac, is = o => o.kind === k;
  if (G.stock[k] > 0 || f.outQ.indexOf(k) >= 0 || f.bld.some(b => b.ck === k && b.cn > 0)) return true;
  if (G.hands.some(is) || f.floor.some(is) || f.flying.some(is) || f.portalQ.some(is) || f.belts.some(b => b.item && b.item.kind === k) || f.bld.some(b => b.out.some(is))) return true;
  return !!G.w && (G.w.arcs.some(is) || G.w.pickups.some(is) || G.w.drops.some(is));
};
FA.isUnlockKind = k => isCoreKind(k) || isKeyKind(k);   // Cores open shrines, Ward Keys open keeps (the Spell Portal only takes them when the Wizard is near the right one)
FA.beltOk = k => !RES[k];   // belts carry what the machines make (packets, spells, potions, Eggs, garments): never raw resources, shards, Cores or keys

// ---------- hands & floor items ----------
// The hands are ONE pile of single items, G.hands (bottom first, the last one grabbed on top), at most FA.cap() items in total whatever they are.
// The top of the pile is what a throw sends first (last in, first out).
FA.top = () => (G.hands.length ? G.hands[G.hands.length - 1] : null);
FA.topKind = () => { const t = FA.top(); return t ? t.kind : null; };
FA.canHold = () => G.hands.length < FA.cap();
FA.addHands = function (k, n) {
  for (let i = 0; i < n; i++) G.hands.push({ kind: k });
};
FA.takeOne = function () {
  const it = G.hands.pop();
  return it ? { kind: it.kind } : null;
};
// set an item down at (x, y): on that floor tile if it has room (CFG.floorCap items a tile), else it bounces to the nearest one that has, else (the floor is full)
// it leaves through the Spell Portal for the wilds. spill = always bounce there from (x, y) (it was thrown out of somewhere).
FA.dropAt = function (kind, x, y, spill) {
  const f = G.fac, tx = Math.floor(x), ty = Math.floor(y);
  if (!spill && FA.floorOk(tx, ty) && FA.floorCount(tx, ty) < CFG.floorCap) {
    const a = Math.random() * 6.283, r = Math.random() * 0.22, cl = v => Math.max(0.12, Math.min(0.88, v));
    f.floor.push({ kind, x: tx + cl(x - tx + Math.cos(a) * r), y: ty + cl(y - ty + Math.sin(a) * r), z: 0.4, vz: 2.5, t: 0 });
    return;
  }
  const s = FA.floorSpot(x, y);
  if (!s) { FA.toWild(kind); return; }
  const a = Math.random() * 6.283, r = Math.random() * 0.25, d = Math.hypot(s.x - x, s.y - y);
  f.flying.push({ kind, sx: x, sy: y, x, y, z: 0.6, tx: s.x + Math.cos(a) * r, ty: s.y + Math.sin(a) * r, t: 0, T: Math.min(0.9, 0.35 + d * 0.06), h: 1 + Math.min(2, d * 0.2), boing: true });
};
FA.dropHands = function () {   // never deletes: everything lands on the floor at the Builder's feet
  while (G.hands.length) { const it = FA.takeOne(); FA.dropAt(it.kind, G.bd.x, G.bd.y); }
};
FA.stash = function () {       // what the Stockpile can hold goes back into it (what does not fit spills out of it); anything else lands on the floor
  if (!G.hands.length) return;
  G.hands = G.hands.filter(h => { const s = FA.storable(h.kind); if (s) G.stock[h.kind] = (G.stock[h.kind] || 0) + 1; return !s; });
  FA.dropHands(); AU.sfx('drop');
};
FA.pickFloor = function (it) {   // one item per press (hold to keep grabbing)
  const f = G.fac, i = f.floor.indexOf(it);
  if (i < 0 || !FA.canHold(it.kind)) return;
  FA.addHands(it.kind, 1);
  f.floor.splice(i, 1);
  AU.sfx('pickup'); G.bd.squash = 0.2;
};

// ---------- placement / demolish ----------
FA.canPlace = (x, y) => FA.owned(x, y) && !FA.isPile(x, y) && !G.fac.grid[y * G.fac.w + x];
FA.needOf = function (b) {
  const cost = FA.costOf(b), need = {};
  for (const k in cost) { const n = cost[k] - (b.got[k] || 0); if (n > 0) need[k] = n; }
  return need;
};
FA.needText = need => Object.keys(need).map(k => need[k] + ' ' + RES[k].name).join(', ');
FA.place = function (type, x, y, dir) {
  if (!FA.unlocked(type)) { UI.toast('Unlock ' + CFG.buildings[type].name + ' in the Skill Tree first.', 'L', 'ic_lock'); AU.sfx('error'); return false; }
  if (!FA.canPut(type, x, y)) return false;
  const credit = G.credits[type] > 0;
  const b = FA.makeBuilding(type, x, y, credit, credit, dir);
  if (type === 'stockpile') for (const o of G.fac.floor.slice()) if (Math.floor(o.x) === x && Math.floor(o.y) === y) { G.fac.floor.splice(G.fac.floor.indexOf(o), 1); FA.dropAt(o.kind, o.x, o.y, true); }   // loose items make way for the blueprint
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
  if (!c) return FA.liftTile(x, y);   // no building here: the Stockpile tile / floor tile itself goes
  if (c.type === 'portal') return false;
  if (!force && c.type !== 'belt' && !FA.unlocked(c.type)) { UI.askDemolish(x, y, FA.def(c).name); return false; }
  const f = G.fac, cx = x + 0.5, cy = y + 0.5, add = (k, n) => { G.stock[k] = (G.stock[k] || 0) + n; };
  FA.setCell(x, y, null);   // cleared first, so what it held can be set down on its own tile
  if (c.type === 'belt') {
    add('wood', 1);
    if (c.item) FA.dropAt(c.item.kind, cx, cy);
    f.belts.splice(f.belts.indexOf(c), 1);
  } else {
    if (c.done) {
      if (c.free) G.credits[c.type] = (G.credits[c.type] || 0) + 1;
      else { const cost = FA.def(c).cost; for (const k in cost) add(k, cost[k]); }
    } else for (const k in c.got) add(k, c.got[k]);
    for (const o of c.out) FA.dropAt(o.kind, cx, cy);
    if (c.cn > 0) { if (FA.storable(c.ck)) add(c.ck, c.cn); else for (let i = 0; i < c.cn; i++) FA.dropAt(c.ck, cx, cy, i >= CFG.floorCap); }   // a crate's packets go back into the Stockpile, its Eggs onto the floor
    if (c.inv) for (const k in c.inv) { if (FA.storable(k)) add(k, c.inv[k]); else for (let i = 0; i < c.inv[k]; i++) FA.dropAt(k, cx, cy); }
    if (c.fuel) for (const k in c.fuel) { const n = Math.floor(c.fuel[k] / CFG.fuelPerPacket); if (FA.storable(k)) add(k, n); else for (let i = 0; i < n; i++) FA.dropAt(k, cx, cy); }   // what was waiting to burn comes back
    f.bld.splice(f.bld.indexOf(c), 1);
    if (c.type === 'expand') f.added = Math.max(0, f.added - 1);   // an unfinished Floor Tile never counted
  }
  FA.burst(cx, cy, '#ff9a8a');
  FA.ipop(cx, cy, c.type === 'belt' ? [['wood']] : Object.keys(FA.def(c).cost).map(k => [k]));   // what came back
  AU.sfx('drop');
  UI.changed();
  return true;
};

// ---------- recipes ----------
// Production is the only gate for spells and creatures: a recipe needs its tree node only when it has a tier (potions, armor, garments, keys),
// and a Triple / the Nova needs its parent spells to have been MADE at least once (G.stats.made, counted from crafter output)
FA.recipeOk = id => { const r = CFG.recipes[id]; return (!r.tier || !!G.tree[r.tier]) && (!r.req || !!G.tree[r.req]) && (!r.aug || !FA.augMade(r.aug)) && (!r.key || (!G.aug.door && !FA.exists('wardkey'))) && (!r.parents || r.parents.every(p => ((G.stats.made || {})[p] || 0) > 0)); };
FA.recipesFor = type => Object.keys(CFG.recipes).filter(id => CFG.recipes[id].machine === type && FA.recipeOk(id));
// The Creature Spawner has no recipe to choose and holds no spare packets: a packet is absorbed the moment it arrives and starts growing an egg, and the SET of elements
// absorbed so far (b.inv, one of each) names the creature (Air = Zephyr Wisp, Fire + Air = Cinder Phoenix ...). Another element before the egg is grown changes it into
// the bigger creature's egg; b.prog (seconds already grown) carries over, so only the difference in grow time is left to wait.
FA.spawnerHave = b => Object.keys(b.inv).filter(k => b.inv[k] > 0);
FA.spawnerFor = function (have) {   // the egg recipe whose one input is this (an element packet = a basic creature, a seed spell = its pair / triple creature)
  if (have.length !== 1) return null;
  return FA.recipesFor('spawner').find(id => { const ks = Object.keys(CFG.recipes[id].in); return ks.length === 1 && ks[0] === have[0]; }) || null;
};
FA.spawnerPick = b => FA.spawnerFor(FA.spawnerHave(b));
FA.eggOf = rid => CFG.creatures[ITEMS[CFG.recipes[rid].out].creature];   // the creature an egg recipe hatches
// It takes ONE thing at a time, only while it is empty (and the finished eggs are not backed up): an element packet, or a seed spell (SEED_SPELL). Anything else is refused
// and boings back (Storm Orb, Sandstorm, Blizzard, a second thing while an egg grows).
FA.spawnerTakes = function (b, kind) {
  if (!(ELEM[kind] || SEED_SPELL[kind]) || FA.spawnerHave(b).length || b.out.length >= CFG.buffer) return false;
  return !!FA.spawnerFor([kind]);
};
// an older save's Spawner may hold spare packets or a pair egg grown from two elements (no longer a thing): the first thing that names an egg stays (a basic one), everything else is set down beside it
FA.spawnerFix = function (b) {
  const have = FA.spawnerHave(b), keep = have.find(k => FA.spawnerFor([k]));
  for (const k of have) {
    const n = k === keep ? 1 : 0;
    if (ITEMS[k]) for (let i = n; i < b.inv[k]; i++) FA.dropAt(k, b.x + 0.5, b.y + 0.5);
    b.inv[k] = n;
  }
  if (have.length > 1) b.prog = 0;
  b.recipe = FA.spawnerPick(b);
  if (!b.recipe) { b.inv = {}; b.prog = 0; }
};
// what it would take now (an empty Spawner takes any of the four packets): shown as blinking lamps on its front
FA.spawnerCan = b => ELEMS.filter(k => FA.spawnerTakes(b, k));
FA.refreshRecipes = function () {
  for (const b of G.fac.bld) if (b.done && FA.def(b).kind === 'crafter' && b.type !== 'spawner' && !b.recipe) b.recipe = FA.recipesFor(b.type)[0] || null;
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
    if (b.type === 'spawner') return FA.spawnerTakes(b, kind);
    if (!b.recipe) return false;
    const need = CFG.recipes[b.recipe].in[kind];
    return !!need && (b.inv[kind] || 0) < Math.max(6, need * 3);
  }
  if (d.kind === 'cell') return FA.isFuel(kind) && FA.fuelTotal(b) + CFG.fuelPerPacket <= CFG.fuelCap;
  if (d.kind === 'splitter') return FA.beltOk(kind) && b.out.length < 2;
  if (d.kind === 'crate') return FA.crateOk(kind) && (!(b.cn > 0) || b.ck === kind);
  return false;
};
FA.insert = function (b, kind, thrown) {
  b.pop = 0.22;
  if (!b.done) {
    b.got[kind] = (b.got[kind] || 0) + 1;
    if (!Object.keys(FA.needOf(b)).length) FA.onComplete(b);
    return;
  }
  const d = FA.def(b);
  if (d.kind === 'crafter') {
    b.inv[kind] = (b.inv[kind] || 0) + 1;
    if (b.type === 'spawner') {   // absorbed whole at once: the egg starts growing
      b.recipe = FA.spawnerPick(b);
      if (ELEM[kind]) { FA.eburst(b.x + 0.5, b.y + 0.5, kind, 8); AU.sfx('el_' + kind); }
      else { FA.burst(b.x + 0.5, b.y + 0.5, ITEMS[kind].color, 14); (SPELL_EL[kind] || []).forEach(el => FA.eburst(b.x + 0.5, b.y + 0.5, el, 4)); AU.sfx('complete'); }   // a seed spell
    }
  }
  else if (d.kind === 'crate') { b.ck = kind; b.cn = (b.cn || 0) + 1; }
  else if (FA.isLogi(b)) b.out.push({ kind });
  if (d.kind === 'cell') {   // fuel waits in the Battery and burns into charge (FA.updCell)
    if (ELEM[kind]) FA.elTick(kind);   // the weather feels it, and the packet below still fuels the Battery
    b.fuel[kind] += CFG.fuelPerPacket * (1 + CFG.chargeBonus + (thrown ? CFG.chargeThrowBonus : 0));
    if (b.types.indexOf(kind) < 0) b.types.push(kind);
    G.flags.fed = true;
  }
};
// Overclocking: a combo spell (tier = its element count) or an Elixir thrown into a Battery overcharges it:
// extra charge past full (up to overcharge.max) and +power for a while (b.over seconds)
FA.overTier = k => (k === 'elixir' ? 1 : ITEMS[k] && ITEMS[k].spell && (SPELL_EL[k] || []).length >= 2 ? SPELL_EL[k].length : 0);
FA.canOver = (b, k) => FA.isCell(b) && !!b.done && FA.overTier(k) > 0 && b.bat < CFG.batteryMax * CFG.overcharge.max;
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
  if (b.cn > 0 && FA.canHold()) { FA.addHands(b.ck, 1); if (--b.cn <= 0) { b.cn = 0; b.ck = null; } AU.sfx('pickup'); G.bd.squash = 0.2; return; }   // a crate
  if (!b.out.length || !FA.canHold(b.out[0].kind)) return;
  const o = b.out.shift();
  FA.addHands(o.kind, 1);
  AU.sfx('pickup'); G.bd.squash = 0.2;
};
// a Battery burns element packets, Wood and Stone alike (the same seconds per item)
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
    const p = FA.portal('skill'), zx = p.x - 0.5, zy = p.y + 1;   // the refunded spell drops out beside the Skill Portal
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
  if (ITEMS[kind].aug) G.flags.sent_aug = true;
  G.stats.sent[kind] = (G.stats.sent[kind] || 0) + 1;   // for the goals: Potions sent, Eggs hatched, combo spells delivered
  if (ITEMS[kind].egg) G.stats.eggs = (G.stats.eggs || 0) + 1;
  else if ((SPELL_EL[kind] || []).length >= 2) G.stats.combos = (G.stats.combos || 0) + 1;
  FA.suck(kind, x === undefined ? p.x + 0.5 : x, y === undefined ? p.y + 1 : y);
  if (ITEMS[kind].egg) WZ.hatch(kind);
  else if (ITEMS[kind].pickup || ITEMS[kind].aug) WZ.send(kind, 'pickup');   // it arcs out of the factory and sails into the wilds, then lands (a garment where a creature would drop in)
  else if (FA.isUnlockKind(kind)) WZ.send(kind, 'unlock');   // a Core / Ward Key sails down onto the shrine / keep it opens
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
  else if (c.type === 'belt') { if (c.item || !FA.beltOk(o.kind) || (c.dir + 2) % 4 === di) return false; c.item = { kind: o.kind, prog: 0, moved: true }; }
  else if (FA.canInsert(c, o.kind)) { FA.insert(c, o.kind); if (c.src) c.src[(di + 2) % 4] = b.id; }   // a Splitter remembers who feeds it
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
    else if (c.done && c.dir === back && k !== 'cell') ins.push(di);   // it points its output at us (a Battery has no output)
    else outs.push(di);
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
FA.updLogi = function (b, dt) {
  const split = FA.def(b).kind === 'splitter';
  if (split) FA.splitConn(b);
  if (b.cd > 0) { b.cd -= dt; return; }
  if (!split) {   // a crate feeds its arrow side one at a time, by itself
    if (!(b.cn > 0)) { b.blocked = false; return; }
    const fd = DIRS[b.dir], front = FA.cell(b.x + fd[0], b.y + fd[1]);
    b.out = [{ kind: b.ck }];
    const ok = !!front && FA.pushSide(b, b.dir);
    b.out = [];
    if (ok) { if (--b.cn <= 0) { b.cn = 0; b.ck = null; } b.cd = FA.beltTime() * 0.4; }
    b.blocked = !!front && !ok;   // pointing at nothing it is just storing, not blocked
    return;
  }
  if (!b.out.length) { b.blocked = false; return; }
  const ways = FA.splitWays(b, b.out[0].kind);
  for (const o of ways) if (FA.pushSide(b, o.d)) { FA.splitTook(b, ways, o.d); b.cd = FA.beltTime() * 0.4; b.blocked = false; return; }
  b.blocked = true;
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
  if (k === 'crate') return b.cn > 0 && b.blocked ? 'jam' : null;
  if (k === 'cell') {   // flat with nothing to burn = starved; burning fuel into charge = working
    if (b.bat < CFG.batteryMax && FA.fuelTotal(b) > 0) return 'work';
    return b.bat <= 0 ? 'starve' : null;
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
  for (const b of f.bld) if (b.done && FA.isCell(b) && b.bat > 0) gen += CFG.stationGen + (b.over > 0 ? CFG.overcharge.power : 0);
  let budget = gen, demand = 0;
  for (const b of f.bld) {   // placement order decides who stalls first
    const w = FA.wants(b);
    b.draw = w;
    if (w > 0) { demand += w; if (budget >= w) { budget -= w; b.powered = true; } else b.powered = false; }
    else b.powered = true;
  }
  // what actually gets drawn is shared evenly by every charged battery
  let used = 0, nb = 0;
  for (const b of f.bld) { if (b.draw > 0 && b.powered) used += b.draw; if (b.done && FA.isCell(b) && b.bat > 0) nb++; }
  f.gen = gen; f.demand = demand; f.perBat = nb ? used / nb : 0;
};

// ---------- per-frame update ----------
FA.update = function (dt) {
  const f = G.fac;
  f.t += dt;
  FA.pileSync();
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
    if (f.lowT <= 0) { f.lowT = 16; UI.toast('Not enough power: machines are stalling! Feed a Battery, or build another.', 'L', 'ic_bolt'); }
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
      if (b.type === 'spawner') b.recipe = FA.spawnerPick(b);   // the egg follows from the elements absorbed so far
      const w = FA.crafterReady(b);
      if (w !== 0) {
        if (b.powered) {
          const R = CFG.recipes[b.recipe];
          b.prog += dt * (b.od ? 1 + CFG.overdrive : 1) * FA.craftMul(); f.working++;
          if (b.prog >= R.time) {
            b.prog = 0;
            for (const k in R.in) b.inv[k] -= R.in[k];
            b.out.push({ kind: R.out });
            G.stats.made[R.out] = (G.stats.made[R.out] || 0) + 1;
            b.pop = 0.35;
            FA.burst(b.x + 0.5, b.y + 0.5, ITEMS[R.out].color, 10);
            for (const k in R.in) if (ELEM[k]) FA.elTick(k, R.in[k]);
            if (b.type === 'forge' || b.type === 'cauldron') { b.thump = CFG.thump; FA.exhaust(b, Object.keys(R.in)); }   // recoil + exhaust
            AU.sfx('craft');
          }
        }
      } else b.prog = 0;
    } else if (d.kind === 'cell') FA.updCell(b, dt);
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
    if (o.stock && !o.q && o.t - dt < 0 && o.t >= 0) { FA.burst(o.sx, o.sy, ITEMS[o.kind].color, 5); f.flash = Math.max(f.flash, 0.12); f.flashCol = '#ffffff'; }   // it leaves the Spell Portal
    o.x = o.sx + (o.tx - o.sx) * k; o.y = o.sy + (o.ty - o.sy) * k; o.z = Math.sin(k * Math.PI) * o.h + (1 - k) * 0.8;
    if (k >= 1) { f.flying.splice(i, 1); FA.land(o); }
  }
  for (const o of f.floor) {
    o.t += dt;
    if (o.z > 0 || o.vz > 0) { o.z += o.vz * dt; o.vz -= 14 * dt; if (o.z <= 0) { o.z = 0; o.vz = Math.abs(o.vz) > 2 ? -o.vz * 0.35 : 0; } }
  }
  FA.gatherFloor(dt);
  FA.absorbFloor();
  FA.outTick(dt);
  FA.autoPick(dt);
  if (f.q) { f.q.age += dt; if ((f.q.t -= dt) <= 0) f.q = null; }
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

// anything resting on a Stockpile tile is taken in when there is room for it; anything else bounces off to the nearest floor
FA.absorbFloor = function () {
  const f = G.fac;
  for (let i = f.floor.length - 1; i >= 0; i--) {
    const o = f.floor[i];
    if (o.z > 0.05 || !FA.isPile(Math.floor(o.x), Math.floor(o.y))) continue;
    f.floor.splice(i, 1);
    if (FA.room(o.kind) > 0) { FA.toStockFrom(o.kind, 1, o.x, o.y); AU.sfx('drop'); UI.changed(); }
    else { FA.dropAt(o.kind, o.x, o.y, true); AU.sfx('boing'); }
  }
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
      if (q === o || q.kind !== o.kind || q.z > 0 || Math.floor(q.x) !== Math.floor(o.x) || Math.floor(q.y) !== Math.floor(o.y)) continue;   // only within its own tile (a tile holds CFG.floorCap)
      const d = Math.hypot(q.x - o.x, q.y - o.y);
      if (d < bd) { bd = d; best = q; }
    }
    if (best && bd > 0.18) { const k = Math.min(1, 0.7 * dt / bd); o.x += (best.x - o.x) * k; o.y += (best.y - o.y) * k; }
  }
};
// a Battery: it burns the fuel waiting inside it into charge, then gives power and drains with the factory's load, all by itself
FA.updCell = function (b, dt) {
  const M = CFG.batteryMax;
  if (b.over > 0) b.over = Math.max(0, b.over - dt);
  if (b.bat < M) {
    const act = Object.keys(b.fuel).filter(k => b.fuel[k] > 0);
    if (act.length) {
      const nt = Math.max(b.types.length, act.length), dur = CFG.chargeBase / Math.pow(CFG.chargeBoost, nt - 1);
      b.bat = Math.min(M, b.bat + M / dur * dt);
      for (const k of act) b.fuel[k] = Math.max(0, b.fuel[k] - dt / act.length);
    }
  }
  if (!FA.fuelTotal(b) || FA.fuelTotal(b) < 0.01) b.types = [];
  if (b.bat >= M && !b.top) {   // topped up (it counts once, and again only after it has run down a good way)
    b.top = true; G.stats.charged = (G.stats.charged || 0) + 1;
    FA.ipop(b.x + 0.5, b.y + 0.5, [['battery'], ['ic_check']]); AU.sfx('charge'); b.pop = 0.4;
  } else if (b.top && b.bat < M * 0.8) b.top = false;
  if (G.fac.perBat > 0 && b.bat > 0) {
    b.bat = Math.max(0, b.bat - FA.drain(G.fac.perBat, b) * dt);
    if (b.bat === 0) FA.ipop(b.x + 0.5, b.y + 0.5, [['battery'], ['ic_x']]);
  }
  if (b.bat < M * CFG.chargeTipAt && !G.flags.chargeTip) {   // the first time a Battery runs half down
    G.flags.chargeTip = true;
    if (!G.flags.fed) {
      UI.toast('Battery below half: throw element packets, Wood or Stone at it to charge it', 'L', 'ic_bolt');
      FA.ipop(b.x + 0.5, b.y + 0.5, [['battery'], ['ic_bolt']]);
    }
  }
};

// ---------- throwing ----------
// will this receiver take a thrown item of kind k? (portal / belt / building / blueprint / the Stockpile Zone)
FA.accepts = (o, k) => (o === 'q' ? true : o === 'zone' ? FA.room(k) > 0 : !o ? false : o.type === 'portal' ? FA.portalTakes(o, k) : o.type === 'belt' ? !o.item && FA.beltOk(k) : FA.canInsert(o, k) || FA.canOver(o, k));
// every receiver in throwing range that would take kind k, with a priority (lower = preferred)
FA.throwList = function (k) {
  const bd = G.bd, out = [];
  const add = (x, y, obj, prio) => { const d = Math.hypot(x - bd.x, y - bd.y); if (d >= 0.4 && d <= FA.range()) out.push({ x, y, obj, prio, d }); };
  for (const p of FA.portalCells(G.fac.w, G.fac.h)) { const c = FA.cell(p.x, p.y); if (FA.portalTakes(c, k)) add(p.x + 0.5, p.y + 0.5, c, 0.8); }
  for (const b of G.fac.bld) {
    if (FA.canInsert(b, k)) add(b.x + 0.5, b.y + 0.5, b, b.done && FA.isLogi(b) ? 1.4 : 1);
    else if (FA.canOver(b, k)) add(b.x + 0.5, b.y + 0.5, b, 2.6);   // overcharging is on purpose: the portal stays the first choice for spells
  }
  { const q = FA.qTile(); add(q.x + 0.5, q.y + 0.5, 'q', FA.storable(k) ? 3 : 2.4); }
  if (FA.room(k) > 0) { const z = FA.pileSpot(k); add(z.x, z.y, 'zone', 1.1); }   // the Stockpile tile this kind goes on
  if (FA.beltOk(k)) for (const bl of G.fac.belts) if (!bl.item) add(bl.x + 0.5, bl.y + 0.5, bl, 2.2);
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
    if (mode !== 'throw' || !h || h.kind !== l.held || !FA.accepts(l.obj, h.kind) || Math.hypot(l.x - G.bd.x, l.y - G.bd.y) > FA.range()) return null;
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
    if (d > FA.range()) { dx *= FA.range() / d; dy *= FA.range() / d; }
    const tx = bd.x + dx, ty = bd.y + dy, c = FA.cell(Math.floor(tx), Math.floor(ty));
    if (c && c.type !== 'belt') return { x: Math.floor(tx) + 0.5, y: Math.floor(ty) + 0.5, obj: c };
    if (!c && FA.isQ(Math.floor(tx), Math.floor(ty))) { const q = FA.qTile(); return { x: q.x + 0.5, y: q.y + 0.5, obj: 'q' }; }
    if (!c && FA.isPile(Math.floor(tx), Math.floor(ty))) return { x: tx, y: ty, obj: 'zone' };
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
  const d = Math.hypot(tg.x - bd.x, tg.y - bd.y);
  G.fac.flying.push({ kind: it.kind, sx: bd.x, sy: bd.y, x: bd.x, y: bd.y, z: 0.8, tx: tg.x, ty: tg.y, t: 0, T: 0.28 + d * 0.045, h: 0.9 + d * 0.22, fromBuilder: true });
  bd.throwCd = FA.throwGap(cd || CFG.throwRepeat); bd.squash = 0.18;
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
// the building or blueprint nearest to (x, y) that is taking this kind and is within CFG.catchR tiles of its tile, else null: the same small grace the
// portals give, so a throw that comes down just beside something that wants it goes in instead of lying on the floor
FA.catchNear = function (x, y, kind) {
  let best = null, bd = CFG.catchR;
  for (const b of G.fac.bld) {
    if (!FA.canInsert(b, kind) && !FA.canOver(b, kind)) continue;
    const d = Math.hypot(Math.max(b.x - x, 0, x - b.x - 1), Math.max(b.y - y, 0, y - b.y - 1));
    if (d <= bd) { bd = d; best = b; }
  }
  return best;
};
// a tiny ring where a throw hits, leaning the way it was flying
FA.impact = (o, bad) => G.fac.rings.push({ x: o.x, y: o.y, dx: o.x - o.sx, dy: o.y - o.sy, t: 0, col: bad ? '#ff6a6a' : ITEMS[o.kind].color || '#ffffff' });
FA.land = function (o) {
  if (o.stock) { G.stock[o.kind] = (G.stock[o.kind] || 0) + (o.n || 1); FA.ipop(o.tx, o.ty - 0.4, [[o.kind]]); AU.sfx('drop'); UI.changed(); return; }   // (a stack that no longer fits spills out again: FA.pileSync)
  if (o.boing) { FA.dropAt(o.kind, o.x, o.y); AU.sfx('thud'); return; }   // the end of a bounce-back: it just lands
  const tx = Math.floor(o.x), ty = Math.floor(o.y), c = FA.cell(tx, ty);
  const toPortal = c => {
    if (!FA.enterPortal(c, o.kind, o.x, o.y)) return false;
    if (o.fromBuilder && c.which === 'spell') G.flags.portalHand = true;
    FA.impact(o);
    return true;
  };
  // a throw into a building / blueprint that is taking it (a Battery overcharges on a combo spell, anything else is inserted)
  const into = b => {
    if (FA.canOver(b, o.kind)) { FA.overcharge(b, o.kind); FA.impact(o); return true; }
    if (FA.canInsert(b, o.kind)) { FA.insert(b, o.kind, true); FA.impact(o); AU.sfx('drop'); FA.ipop(o.x, o.y, [[o.kind]]); return true; }
    return false;
  };
  // a throw that comes down close to a portal that takes it, or to a building or blueprint that wants it, is pulled in: nothing lies on the floor looking blocked
  const near = () => { const pc = FA.portalNear(o.x, o.y, o.kind); if (pc && toPortal(pc)) return true; const nb = FA.catchNear(o.x, o.y, o.kind); return !!nb && into(nb); };
  const fell = () => { if (near()) return true; FA.dropAt(o.kind, o.x, o.y); return false; };
  const bounce = () => {   // couldn't go in: a cartoon boing back up and over toward the Builder (never into a building)
    const B = CFG.boing, bd = G.bd, dx = bd.x - o.x, dy = bd.y - o.y, d = Math.hypot(dx, dy) || 1;
    let k = Math.max(B.min, Math.min(B.max, d * B.back)), x = o.x + dx / d * k, y = o.y + dy / d * k;
    while (k > 0.4 && FA.solid(Math.floor(x), Math.floor(y))) { k -= 0.3; x = o.x + dx / d * k; y = o.y + dy / d * k; }
    if (FA.solid(Math.floor(x), Math.floor(y))) { x = bd.x; y = bd.y; }
    G.fac.flying.push({ kind: o.kind, sx: o.x, sy: o.y, x: o.x, y: o.y, z: 0.8, tx: x, ty: y, t: 0, T: B.T, h: B.h, boing: true });
    FA.impact(o, true);
    AU.sfx('boing');
  };
  if (c && c.type === 'portal') {
    if (!toPortal(c)) { bounce(); FA.ipop(o.x, o.y, [[o.kind], ['ic_x']]); }
    return;
  }
  if (c && c.type === 'belt') {
    if (!c.item && FA.beltOk(o.kind)) { c.item = { kind: o.kind, prog: 0.5, moved: true }; FA.impact(o); AU.sfx('drop'); return; }
    if (near()) return;
    return bounce();   // the belt is full, or it is a resource (belts only carry what machines make)
  }
  if (c) {
    if (into(c)) return;
    if (near()) return;   // it hit something that does not want it, but a neighbour that does is right there
    return bounce();
  }
  if (FA.isQ(tx, ty)) { FA.qHit(o, bounce); return; }
  if (!FA.owned(tx, ty)) { bounce(); FA.ipop(o.x, o.y, [[o.kind], ['ic_x']]); return; }   // it came down off the edge of the floor
  if (FA.isPile(tx, ty)) {   // a Stockpile tile: it hops onto its kind's tile when there is room, otherwise it bounces back
    if (FA.room(o.kind) > 0) { FA.impact(o); FA.toStockFrom(o.kind, 1, o.x, o.y); AU.sfx('drop'); return; }
    bounce(); FA.ipop(o.x, o.y, [[o.kind], ['ic_x']]); return;
  }
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
  if (bd.rollCd > 0) bd.rollCd -= dt;
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
  const spd = FA.builderSpeed();
  if (m > 0) { const s = Math.min(1, m) / m; wx = dx * s * spd; wy = dy * s * spd; bd.fx = dx / m; bd.fy = dy / m; }
  const ex = wx - bd.vx, ey = wy - bd.vy, el = Math.hypot(ex, ey);
  const rate = (m > 0 ? C.accel : C.friction) * dt;
  if (bd.roll > 0) {   // Tumble: a committed somersault burst along the way he was heading (no steering, no acceleration), dust and afterimages
    bd.roll -= dt; bd.vx = bd.rdx * spd * C.roll.speed; bd.vy = bd.rdy * spd * C.roll.speed;
    bd.ghostT = (bd.ghostT || 0) - dt;
    if (bd.ghostT <= 0) { bd.ghostT = 0.06; (bd.ghosts || (bd.ghosts = [])).push({ x: bd.x, y: bd.y, t: 0 }); }
    bd.target = null; bd.then = null;
  } else if (el <= rate) { bd.vx = wx; bd.vy = wy; } else { bd.vx += ex / el * rate; bd.vy += ey / el * rate; }
  if (bd.ghosts) { for (const g of bd.ghosts) g.t += dt; bd.ghosts = bd.ghosts.filter(g => g.t < 0.25); }
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
  // facing flips with hysteresis: moving straight up or down the screen sits right on the threshold and used to flicker (state, not drawing: the renderer only reads bd.flipS)
  const fd = bd.fx - bd.fy;
  if (fd < -0.3) bd.flipS = true; else if (fd > 0.3) bd.flipS = false;
  if (bd.target) {
    if (moved < 0.0005 && m > 0) { bd.stuckT += dt; if (bd.stuckT > 0.35) { bd.target = null; bd.then = null; bd.stuckT = 0; } } else bd.stuckT = 0;
  }
};
// Tumble: the Builder's dodge roll (same input language as the Wizard's roll: Space / LT + A, Enter when swapped). (ix, iy) = his input, else the way he faces
FA.builderRoll = function (ix, iy) {
  const bd = G.bd, C = CFG.builder.roll;
  if (!FA.hasRoll() || bd.roll > 0 || bd.rollCd > 0) return false;
  let dx = ix + iy, dy = iy - ix;   // screen directions -> grid directions, as in moveBuilder
  if (!dx && !dy) { dx = bd.fx; dy = bd.fy; }
  const m = Math.hypot(dx, dy) || 1;
  bd.rdx = dx / m; bd.rdy = dy / m; bd.fx = bd.rdx; bd.fy = bd.rdy;
  bd.roll = C.time; bd.rollT0 = C.time; bd.rollCd = FA.rollCd(); bd.rollCdMax = bd.rollCd; bd.gather = null; bd.target = null; bd.then = null;
  AU.sfx('roll');
  G.fac.parts.push({ x: bd.x, y: bd.y, z: 0.05, vx: -bd.rdx * 0.6, vy: -bd.rdy * 0.6, vz: 0.8, t: 0.5, col: '#ffffff', dust: true });
  return true;
};
FA.distTo = function (t) {
  const bd = G.bd;
  if (t.kind === 'pile') return Math.hypot(t.x - bd.x, t.y - bd.y);
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
  const bd = G.bd, out = [];
  for (const it of G.fac.floor) out.push({ kind: 'floor', o: it, x: it.x, y: it.y, r: 1.3 });
  for (const p of FA.pileList()) if (p.n > 0) out.push({ kind: 'pile', o: p.kind, x: p.x, y: p.y, r: CFG.reach });   // every Stockpile tile with something on it
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
FA.itemOf = c => (c.kind === 'floor' ? c.o.kind : c.kind === 'pile' ? c.o : c.kind === 'belt' ? c.o.item && c.o.item.kind : c.kind === 'bld' && c.o.cn > 0 ? c.o.ck : c.kind === 'bld' && c.o.out && c.o.out.length ? c.o.out[0].kind : null);
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
    if (b.cn > 0) return FA.canHold() ? A('Take ' + itemName(b.ck), () => FA.takeOut(b), true, [b.ck]) : FULL;   // a crate
    if (b.out.length) return FA.canHold(b.out[0].kind) ? A('Take ' + itemName(b.out[0].kind), () => FA.takeOut(b), true, [b.out[0].kind]) : FULL;
    return NONE;
  }
  if (G.bd.gather && G.bd.gather.b === b) return A('Crank!', () => FA.crank(), false, [G.bd.gather.el]);
  if (d.kind === 'splitter') return A('Set up the routes', () => UI.openSplit(b), false, ['ic_gear']);   // it has no front to turn
  const turn = A('Turn output', () => { b.dir = (b.dir + 1) % 4; b.pop = 0.2; AU.sfx('blip'); }, false, ['ic_rotate']);
  if (d.kind === 'harness') {
    if (FA.growing(b)) return A('The crystal is still growing', null, false, ['ic_clock', b.el]);
    return FA.canHold(b.el) ? A('Hand-gather ' + ELEM[b.el].name + ' (tap to fill the meter)', () => FA.startGather(b), false, [b.el]) : FULL;
  }
  if (d.kind === 'crafter' && b.type !== 'spawner') {
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
// R on something already placed: turn the belt / building on this tile a quarter turn. Batteries have no output side.
FA.rotateAt = function (tx, ty) {
  const c = FA.cell(tx, ty);
  if (!c || c.type === 'portal') return false;
  if (c.type !== 'belt') { const k = FA.def(c).kind; if (k === 'cell' || k === 'splitter') return false; c.pop = 0.2; }   // a Splitter routes itself
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
  for (const p of FA.pileList()) if (p.n > 0 && Math.floor(p.x) === tx && Math.floor(p.y) === ty) return { kind: 'pile', o: p.kind, x: p.x, y: p.y };
  const c = FA.cell(tx, ty);
  if (!c) return null;
  if (c.type === 'portal') return { kind: 'portal', o: c, x: tx + 0.5, y: ty + 0.5 };
  if (c.type === 'belt') return c.item ? { kind: 'belt', o: c, x: tx + 0.5, y: ty + 0.5 } : null;
  return { kind: 'bld', o: c, x: tx + 0.5, y: ty + 0.5 };
};

// ---------- inspector text ----------
// shorthand power use for the note: what a Harnesser / crafter is drawing right now (0 while idle, "0/n" when it wants power and has none)
FA.powerNote = function (b) {
  const k = FA.def(b).kind;
  if (!b.done || (k !== 'harness' && k !== 'crafter')) return '';
  return ' | PWR ' + (b.draw > 0 && !b.powered ? '0/' + b.draw : b.draw > 0 ? b.draw : 0);
};
FA.status = b => FA.statusText(b) + FA.powerNote(b);
FA.statusText = function (b) {
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
    if (b.type === 'spawner') {
      if (!b.recipe) return n + ': feed it ONE thing: a packet = its basic creature, or a seed spell: ' + Object.keys(SEED_SPELL).map(k => itemName(k) + ' = ' + CFG.creatures[SEED_SPELL[k]].name).join(', ');
      const R = CFG.recipes[b.recipe], c = FA.eggOf(b.recipe), seed = FA.spawnerHave(b)[0];
      let s = n + ': growing ' + c.name + ' from ' + itemName(seed) + ' ' + Math.min(99, Math.floor(b.prog / R.time * 100)) + '%';
      if (b.draw > 0 && !b.powered) s += '. NO POWER';
      if (b.out.length) s += '. ' + b.out.length + ' ready (click to take)';
      return s;
    }
    if (!b.recipe) return n + ': no recipe unlocked yet';
    const R = CFG.recipes[b.recipe];
    let s = n + ': ' + recipeName(b.recipe) + ' (' + recipeUse(b.recipe) + ') needs ' + Object.keys(R.in).map(k => itemName(k) + ' ' + (b.inv[k] || 0) + '/' + R.in[k]).join(', ');
    if (b.draw > 0 && !b.powered) s += '. NO POWER';
    else if (b.prog > 0) s += '. Crafting ' + Math.floor(b.prog / R.time * 100) + '%';
    else if (b.out.length >= CFG.buffer) s += '. BLOCKED: output full';
    else s += '. STARVED: waiting for inputs';
    if (b.out.length) s += '. ' + b.out.length + ' ready (click to take)';
    if (b.od) s += '. OVERDRIVE +' + Math.round(CFG.overdrive * 100) + '% (a charged Battery beside it)';
    return s;
  }
  if (d.kind === 'splitter') {
    if (!b.outs.length) return n + ': no outputs yet. Put belts or machines on its sides (the side items come in from is the input)';
    const dn = ['east', 'south', 'west', 'north'];
    return n + ': ' + b.outs.map(o => (b.pct[o] || 0) + '% ' + dn[o] + (FA.splitHas(b, o) ? ' (' + b.filt[o].map(itemName).join(' + ') + ')' : '')).join(', ') + (b.blocked && b.out.length ? '. BLOCKED' : '') + ' (click to set)';
  }
  if (d.kind === 'crate') return n + ': ' + (b.cn > 0 ? b.cn + ' ' + itemName(b.ck) : 'empty (takes element packets or Eggs, one kind)') + '. Belt in, it feeds its arrow side; point it at nothing to just store';
  if (d.kind === 'cell') {
    const act = Object.keys(b.fuel).filter(k => b.fuel[k] > 0);
    let s = n + ': charge ' + Math.round(b.bat) + '/' + CFG.batteryMax + (b.bat > 0 ? ', +' + (CFG.stationGen + (b.over > 0 ? CFG.overcharge.power : 0)) + ' power, ' + Math.ceil(FA.life(b)) + 's left at this load' : ' (flat)') + (b.over > 0 ? '. OVERCHARGED ' + Math.ceil(b.over) + 's' : '');
    s += '. Fuel ' + Math.round(FA.fuelTotal(b)) + 's' + (act.length ? ' (' + act.join(', ') + ')' : '');
    if (b.bat < CFG.batteryMax && act.length) {
      const nt = Math.max(b.types.length, act.length), rate = CFG.batteryMax / (CFG.chargeBase / Math.pow(CFG.chargeBoost, nt - 1));
      s += ', full in ' + Math.ceil((CFG.batteryMax - b.bat) / rate) + 's';
    } else if (b.bat < CFG.batteryMax) s += ': throw it element packets, Wood or Stone';
    return s;
  }
  return n;
};

// ---------- save / restore ----------
FA.toJSON = function () {
  const f = G.fac;
  return {
    v: 3, w: f.w, h: f.h, land: f.land.join(''), pp: f.pp, added: f.added, qp: f.qp,   // v2: a fixed grid + which tiles are floor (v1 saves were one rectangle); v3: '2' = a Stockpile tile
    bld: f.bld.map(b => {
      const o = { type: b.type, x: b.x, y: b.y, dir: b.dir, done: b.done, free: b.free, got: b.got, out: b.out, timer: b.timer };
      if (b.inv) { o.recipe = b.recipe; o.inv = b.inv; o.prog = b.prog; }
      if (b.bat !== undefined) o.bat = b.bat;
      if (b.fuel) { o.fuel = b.fuel; o.types = b.types; }
      if (b.hand > 0 && b.el) o.hand = Math.round(b.hand * 1000) / 1000;
      if (b.el) { o.el = b.el; o.grow = Math.round(b.grow * 10) / 10; }
      if (b.cost) o.cost = b.cost;
      if (b.pct) { o.pct = b.pct; o.filt = b.filt; o.sig = b.sig; }
      if (b.over > 0) o.over = b.over;
      if (b.cn > 0) { o.ck = b.ck; o.cn = b.cn; }
      return o;
    }),
    belts: f.belts.map(b => ({ x: b.x, y: b.y, dir: b.dir, item: b.item ? b.item.kind : null })),
    floor: f.floor.concat(f.flying.filter(o => !o.stock).map(o => ({ kind: o.kind, x: o.tx, y: o.ty }))).map(o => ({ kind: o.kind, x: o.x, y: o.y })),
    portalQ: f.portalQ, eggQ: f.eggQ, outQ: f.outQ.concat(G.w ? G.w.arcs.filter(a => a.then === 'drop').map(a => a.kind) : []),   // overflow on its way to the wilds
  };
};
const LEGACY_SORTER = { wood: 2, stone: 1, shard: 1 };
const LEGACY_BASE_H = 8;   // the base rectangle was 12x8 before the 12x9 start (older saves were laid out against it)
// an old (v1) save was one rectangle with its own origin: it moves onto the fixed grid with its south-west corner on the base rectangle's, so the Stockpile stays where it was.
// FA.lastShift is how far everything moved (the Builder's position is moved by Main.applySave).
FA.lastShift = { dx: 0, dy: 0 };
// Batteries used to be items (and Stations / Chargers the buildings that held them). Each Station or Charger loads as a Battery building (it keeps its charge and
// fuel); every loose Battery item found in a save is counted here and Main.applySave turns it into a free Battery placement.
FA.lostBat = 0;
FA.fromJSON = function (j) {
  const F = CFG.factory, B = F.base;
  G.fac = FA.fresh(F.w, F.h);
  FA.lostBat = 0;
  const known = k => { if (k === 'battery') FA.lostBat++; return !!ITEMS[k]; };
  FA.lastShift = { dx: 0, dy: 0 };
  if (j.v >= 2 && typeof j.land === 'string' && j.land.length === F.w * F.h && j.pp) {
    for (let i = 0; i < j.land.length; i++) G.fac.land[i] = j.land[i] === '2' ? 2 : j.land[i] === '1' ? 1 : 0;
    G.fac.added = j.added | 0;
    FA.setPortals(j.pp.x | 0, j.pp.y | 0);
  } else {
    const ow = j.w || 20, oh = j.h || 14, dx = B.x0, dy = B.y0 + LEGACY_BASE_H - oh;
    FA.lastShift = { dx, dy };
    FA.setLand(dx, dy, ow, oh);
    FA.setPortals(dx + ow - 1, dy + Math.floor(oh / 2) - 2);
    const mv = o => Object.assign({}, o, { x: o.x + dx, y: o.y + dy });
    j = Object.assign({}, j, { bld: (j.bld || []).map(mv), belts: (j.belts || []).map(mv), floor: (j.floor || []).map(mv) });
  }
  // before Stockpile tiles (v3) the Stockpile was a fixed 5x5 pad in the old base rectangle's south-west corner, with the ? station off its top-left edge: it becomes 25 Stockpile tiles
  if (!(j.v >= 3)) G.fac.qp = { x: B.x0 - 1, y: B.y0 + LEGACY_BASE_H - 5 };   // (its 25 Stockpile tiles are laid at the end, once the buildings are in)
  else if (j.qp && FA.inb(j.qp.x | 0, j.qp.y | 0)) G.fac.qp = { x: j.qp.x | 0, y: j.qp.y | 0 };
  (j.bld || []).forEach(o => {
    if (o.type === 'altar') {   // the Summoning Altar left the factory (it falls into the wilds when Summoning is bought): refund its materials
      for (const k of ['stone', 'iron', 'shard']) G.stock[k] = (G.stock[k] || 0) + ({ stone: 14, iron: 7, shard: 6 })[k];
      return;
    }
    if (o.type === 'sorter') {   // the Sorter was dropped (a Splitter's element toggles do its job): refund it and set its contents down
      for (const k in LEGACY_SORTER) G.stock[k] = (G.stock[k] || 0) + LEGACY_SORTER[k];
      (o.out || []).forEach(x => { if (x && known(x.kind)) FA.dropAt(x.kind, o.x + 0.5, o.y + 0.5); });
      return;
    }
    if (o.type === 'station' || o.type === 'charger') o = Object.assign({}, o, { type: 'battery', bat: o.bat > 0 ? o.bat : 0 });   // both became the one Battery building
    if (/^spawner[123]$/.test(o.type)) o = Object.assign({}, o, { type: 'spawner' });   // the three Spawner tiers became one
    if (ELEM[o.type]) o = Object.assign({}, o, { type: 'harness', el: o.type, grow: CFG.harness.growT });   // the four Harnessers became one that switches element
    if (!CFG.buildings[o.type] || !FA.inb(o.x, o.y) || G.fac.grid[o.y * G.fac.w + o.x]) return;
    const b = FA.makeBuilding(o.type, o.x, o.y, false, o.free, o.dir || 0);
    if (o.cost && typeof o.cost === 'object') b.cost = o.cost;
    if (b.el !== undefined) { if (ELEM[o.el]) b.el = o.el; b.grow = o.grow >= 0 ? Math.min(CFG.harness.growT, +o.grow) : CFG.harness.growT; }
    b.done = !!o.done; b.got = o.got || {}; b.out = Array.isArray(o.out) ? o.out.filter(x => x && known(x.kind)) : []; b.timer = o.timer || 0;
    if (b.inv) {
      b.recipe = o.recipe && CFG.recipes[o.recipe] && CFG.recipes[o.recipe].machine === b.type ? o.recipe : null; b.inv = o.inv || {}; b.prog = o.prog || 0;   // (the Battery recipe was dropped: an old Forge / Bench on it falls back)
      if (o.recipe && !b.recipe) for (const k in b.inv) { for (let i = 0; i < b.inv[k]; i++) if (ITEMS[k]) b.out.push({ kind: k }); b.inv[k] = 0; }   // what it was holding is set out for the Builder to take
      if (b.type === 'spawner') FA.spawnerFix(b);
    }
    if (b.bat !== undefined) { b.bat = o.bat > 0 ? Math.min(+o.bat, CFG.batteryMax * CFG.overcharge.max) : 0; b.top = b.bat >= CFG.batteryMax; }
    if (b.fuel) { b.fuel = Object.assign(b.fuel, o.fuel || {}); b.types = o.types || []; }
    if (b.hand !== undefined && o.hand > 0) b.hand = Math.min(0.999, +o.hand);   // a Harnesser's half-cranked packet
    if (b.pct && o.pct && typeof o.pct === 'object') {
      for (const k in o.pct) if (+k >= 0 && +k < 4) b.pct[k] = Math.max(0, Math.min(100, Math.round(+o.pct[k] || 0)));
      for (const k in o.filt || {}) if (Array.isArray(o.filt[k])) b.filt[k] = o.filt[k].filter(x => ITEMS[x]);
      b.sig = typeof o.sig === 'string' ? o.sig : null;
    } else if (b.pct && typeof o.split === 'number') {   // an older save: two sides off its facing (ang 180 = opposite, 90 = a right angle)
      const A2 = (b.dir + 1) % 4, B2 = (b.dir + (o.ang === 90 ? 2 : 3)) % 4, s = Math.max(0, Math.min(100, Math.round(o.split)));
      b.pct[A2] = s; b.pct[B2] = 100 - s; b.sig = [A2, B2].sort().join(',');   // kept if those are still its outputs (FA.splitConn)
    }
    if (b.over !== undefined && o.over > 0) b.over = +o.over;
    if (b.cn !== undefined) {   // a crate holds one kind of packet or Egg (an older crate's mixed contents: the first kind it can hold stays, the rest are set down beside it)
      if (o.cn > 0 && FA.crateOk(o.ck)) { b.ck = o.ck; b.cn = o.cn | 0; }
      for (const x of b.out) { if (FA.crateOk(x.kind) && (!b.cn || b.ck === x.kind)) { b.ck = x.kind; b.cn++; } else FA.dropAt(x.kind, b.x + 0.5, b.y + 0.5, true); }
      b.out = [];
    }
  });
  (j.belts || []).forEach(o => {
    if (!FA.inb(o.x, o.y) || G.fac.grid[o.y * G.fac.w + o.x]) return;
    const b = FA.addBelt(o.x, o.y, o.dir);
    if (o.item && known(o.item)) { if (FA.beltOk(o.item)) b.item = { kind: o.item, prog: 0.5, moved: false }; else FA.dropAt(o.item, o.x + 0.5, o.y + 0.5); }   // belts no longer carry resources: it lands beside the belt
  });
  (j.floor || []).forEach(o => { if (known(o.kind)) G.fac.floor.push({ kind: o.kind, x: o.x, y: o.y, z: 0, vz: 0, t: 1 }); });
  for (const id of (j.shelf || []).filter((id, i, a) => AUGS[id] && a.indexOf(id) === i)) G.stock['aug_' + id] = Math.max(1, G.stock['aug_' + id] || 0);   // the Wardrobe Shelf is gone: its garments are in the Stockpile
  G.fac.portalQ = (j.portalQ || []).filter(q => q && ITEMS[q.kind]);
  G.fac.eggQ = (j.eggQ || []).filter(k => ITEMS[k] && ITEMS[k].egg);
  G.fac.outQ = (j.outQ || []).filter(k => ITEMS[k]);
  if (!(j.v >= 3)) for (let y = B.y0 + LEGACY_BASE_H - 5; y < B.y0 + LEGACY_BASE_H; y++) for (let x = B.x0; x < B.x0 + 5; x++) if (FA.owned(x, y) && !G.fac.grid[y * F.w + x]) G.fac.land[y * F.w + x] = 2;
  FA.refreshRecipes();
};
