'use strict';
// 3-PLAYER MODE (online only), the shared core: the UNDERWORLD and its keeper. A Builder, a Wizard and the ROOTKEEPER, who works in a world that mirrors the wilds tile for tile
// (the same seed, the same terrain) and lies underneath them. Everything here is guarded by G.m3: with G.m3 unset nothing in this file runs and the 2P / 4P games are what they were.
//
// The loop: a foe that dies in the wilds leaves REMAINS of its element in the underworld at the same spot. The Rootkeeper picks them up and throws them into a STORAGE PYLON (banked:
// his inventory) or a BURNER. A Burner burns one remain type at a time and pushes its output down its HOSES as pulses, shared evenly by everything on them: planted NODES (a stump /
// rock pile in both worlds that MANIFESTS in the wilds as a tree, rock or ore when charged), TRAPS (they stand in the wilds at the same spot and fire on foes there) and MIRROR
// HARVESTERS (one drops in for every Harvester the Builder finishes; charged, each sends a packet of its element up into that Harvester). What burning leaves (ASH) is lifted into the
// skill bank by COLLECTORS: the 3P tree costs Ash, so the team's progression runs partly on the Rootkeeper's burning.
//
// All of it is plain data in G.u (the underworld: saved with the factory, it does not reset with an expedition). Building ids are G.u's own (u.idN); a mirror remembers its
// Harvester by grid place as well (hx, hy), because factory ids are not saved.
const M3 = {};
(function () {
const ELS = ['air', 'water', 'fire', 'earth'];
const C = () => CFG.mode3;
M3.ELS = ELS;
M3.ROLE = ['B', 'W', 'K'];                // seats: 0 Builder, 1 Wizard, 2 Rootkeeper
M3.on = () => !!(G && G.m3);
M3.me = () => {   // the seat this machine plays (a guest finds it by his slot id: a fresh snapshot still carries the host's G.vi)
  if (!G || !G.m3) return 0;
  if (Net.role === 'guest' && G.seats) { const i = G.seats.findIndex(q => q.who === Net.me); if (i >= 0) return i; }
  return G.vi != null ? G.vi : 0;
};
M3.myRole = () => M3.ROLE[M3.me()];
M3.seatOf = role => M3.ROLE.indexOf(role);
M3.seat = s => (G && G.seats && G.seats[s]) || null;
M3.name = s => { const q = M3.seat(s); return q ? q.name : ['BUILDER', 'WIZARD', 'ROOTKEEPER'][s]; };
M3.col = s => { const q = M3.seat(s); return q ? q.col : '#ffffff'; };
M3.conn = role => { const q = M3.seat(M3.seatOf(role)); return !!q && q.conn !== false && q.who !== 'free'; };
M3.TOOLS = ['hose', 'burner', 'tcraft', 'rcraft', 'collector', 'pole', 'pylon', 'remove'];   // his toolbar (keys 1-8); the pole slot holds the heavy pole too once it is bought
M3.CONSUMER = { node: 1, trap: 1, mirror: 1 };   // what takes a Burner's output
M3.RELAY = { pole: 1, hpole: 1 };                 // what a hose passes through
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- the state ----------
M3.rkFresh = () => ({ x: SPAWN.x - 2.5, y: SPAWN.y - 2.5, vx: 0, vy: 0, fx: 1, fy: 1, moving: false, bob: 0, roll: 0, rollCd: 0, rdx: 1, rdy: 0, squash: 0, ghosts: [],
  hands: [], tool: null, hose: null, mashT: 0, throwCd: 0, pickCd: 0 });
M3.fresh = () => ({ v: 1, t: 0, rk: M3.rkFresh(), items: [], bld: [], hoses: [], pulses: [], fly: [], fx: [], pops: [], bank: { air: 0, water: 0, fire: 0, earth: 0 }, blog: [], bend: {},
  ghost: { W: false, K: false }, idN: 1, mirN: 0, ready: false,
  st: { picked: 0, burned: 0, planted: 0, manifest: 0, traps: 0, sent: 0, banked: 0, ash: 0, trapHits: 0 } });
M3.byId = id => (G.u ? G.u.bld.find(b => b.id === id) : null) || null;
M3.lvl = id => lvl(id);
M3.cap = () => C().rk.hands + C().upgrade.rkhands * lvl('rkhands');
M3.speed = () => CFG.wizard.speed * C().rk.speedK * (1 + C().upgrade.rkspeed * lvl('rkspeed'));
M3.out = () => C().burner.out * (1 + C().upgrade.rkheavy * lvl('rkheavy'));
M3.burnT = () => C().burner.burnT * (1 + C().upgrade.rkthrift * lvl('rkthrift'));
M3.mashK = () => 1 + C().upgrade.rkmash * lvl('rkmash');
M3.trapK = () => 1 + C().upgrade.rktrap * lvl('rktrap');
// the underworld's ground is the wilds' raw terrain (the spells' walls, ice, cracked rock and vines are the wilds' own): water and chasms cannot be entered, bog slows
M3.wetU = (x, y) => { if (x < 0.5 || y < 0.5 || x >= CFG.WW - 0.5 || y >= CFG.WH - 0.5) return true; const t = WZ.terrain[Math.floor(y) * CFG.WW + Math.floor(x)] >> 3; return t === T_POND || t === T_CHASM; };
M3.blockedU = (x, y, r) => M3.wetU(x - r, y - r) || M3.wetU(x + r, y - r) || M3.wetU(x - r, y + r) || M3.wetU(x + r, y + r);
M3.dryU = function (x, y, tries, spread) {
  if (!M3.blockedU(x, y, 0.35)) return [x, y];
  for (let i = 0; i < (tries || 30); i++) {
    const a = Math.random() * 6.283, d = spread[0] + Math.random() * (spread[1] - spread[0]), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (!M3.blockedU(px, py, 0.35)) return [px, py];
  }
  return null;
};
M3.free = (x, y, gap) => !M3.blockedU(x, y, 0.4) && !G.u.bld.some(b => Math.hypot(b.x - x, b.y - y) < gap);

// a new underworld building (type: burner, pylon, tcraft, rcraft, collector, pole, hpole, node, trap, mirror)
M3.make = function (type, x, y, o) {
  const u = G.u, b = Object.assign({ id: u.idN++, type, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, pop: 0.5 }, o || {});
  if (type === 'burner') Object.assign(b, { el: b.el || 'water', hop: { air: 0, water: 0, fire: 0, earth: 0 }, burn: 0, bel: null, ash: { air: 0, water: 0, fire: 0, earth: 0 }, pt: 0, st: 'starve', stT: 0 });
  if (type === 'tcraft' || type === 'rcraft') Object.assign(b, { r: 0, prog: 0, busy: null });
  if (type === 'collector') Object.assign(b, { ct: 0, lift: 0 });
  if (type === 'node') { const N = C().nodes[b.nk]; Object.assign(b, { kind: N.harv, ch: b.ch || 0, up: false, hp: CFG.harvest[N.harv].hp, maxHp: CFG.harvest[N.harv].hp, broken: false, flash: 0, rad: 0.5, last: null, wrongT: 0, mashT: 0 }); }
  if (type === 'trap') Object.assign(b, { fuel: b.fuel || 0, arm: 0, fire: 0, last: null, wrongT: 0 });
  if (type === 'mirror') Object.assign(b, { ch: 0, got: {}, last: null, wrongT: 0, mashT: 0, drop: 1.2 });
  u.bld.push(b);
  return b;
};
M3.linked = (a, b) => G.u.hoses.some(h => (h[0] === a && h[1] === b) || (h[0] === b && h[1] === a));
M3.reachOf = b => C().reach * (b.type === 'hpole' ? C().heavyPoleK : b.type === 'pole' ? C().poleK : 1);
M3.linkMax = (a, b) => (M3.reachOf(a) + M3.reachOf(b)) / 2;
M3.canLink = (a, b) => !!a && !!b && a !== b && !M3.linked(a.id, b.id) && dist(a, b) <= M3.linkMax(a, b) + 1e-6;
M3.link = (a, b) => { if (!M3.canLink(a, b)) return false; G.u.hoses.push([a.id, b.id]); return true; };
M3.unlink = (a, b) => { const u = G.u, n = u.hoses.length; u.hoses = u.hoses.filter(h => !((h[0] === a && h[1] === b) || (h[0] === b && h[1] === a))); return u.hoses.length < n; };
M3.unbuild = function (b) {   // a building goes: its hoses and the pulses on its way go with it
  const u = G.u;
  u.bld.splice(u.bld.indexOf(b), 1);
  u.hoses = u.hoses.filter(h => h[0] !== b.id && h[1] !== b.id);
  u.pulses = u.pulses.filter(p => p.p.indexOf(b.id) < 0);
  if (u.rk.hose === b.id) u.rk.hose = null;
};
// everything a Burner's output reaches: the consumers on its hoses, through any number of poles (BFS), each with the path of ids the pulse travels
M3.netOf = function (b) {
  const u = G.u, adj = M3.adj(), seen = new Set([b.id]), out = [], q = [[b.id]];
  while (q.length) {
    const path = q.shift(), cur = path[path.length - 1];
    for (const nid of adj.get(cur) || []) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      const n = M3.byId(nid);
      if (!n) continue;
      const p = path.concat([nid]);
      if (M3.RELAY[n.type]) q.push(p);
      else if (n.type === 'collector' || (M3.CONSUMER[n.type] && !(n.type === 'node' && n.up))) out.push({ b: n, p });
    }
  }
  return out;
};
M3.adj = function () {
  const u = G.u;
  if (M3._adjFor === u.hoses && M3._adjN === u.hoses.length && M3._adjB === u.bld.length && M3._adjU === u) return M3._adj;
  const m = new Map();
  for (const [a, b] of u.hoses) { (m.get(a) || m.set(a, []).get(a)).push(b); (m.get(b) || m.set(b, []).get(b)).push(a); }
  M3._adj = m; M3._adjFor = u.hoses; M3._adjN = u.hoses.length; M3._adjB = u.bld.length; M3._adjU = u;
  return m;
};
M3.pref = b => (b.type === 'node' ? C().nodes[b.nk].pref : b.type === 'trap' ? C().traps[b.tk].pref : b.type === 'mirror' ? b.el : null);

// ---------- what goes to the Rootkeeper's screen: a toast on his side ('K'), a pop over a spot ----------
M3.toastK = (text, icon) => UI.toast(text, 'K', icon);
M3.pop = (x, y, ic) => { G.u.pops.push({ x, y, ic, t: 0 }); if (G.u.pops.length > 24) G.u.pops.shift(); };
M3.fx = (type, x, y, o) => { G.u.fx.push(Object.assign({ type, x, y, t: 0 }, o || {})); if (G.u.fx.length > 60) G.u.fx.shift(); };

// ---------- a new 3P world: the underworld and the Rootkeeper's starter kit ----------
// round his spawn: 1 Storage Pylon, 1 Burner hosed to 3 tree / 2 rock / 1 iron nodes and the first mirror Harvester, 1 Collector NOT hosed to it, 2 remains of each element
M3.setup = function () {
  G.u = M3.fresh();
  const u = G.u, rk = u.rk;
  const c0 = M3.dryU(SPAWN.x - 6, SPAWN.y - 6, 60, [0, 6]) || [SPAWN.x - 6, SPAWN.y - 6];
  const at = (cx, cy, dmin, dmax, gap) => {
    for (let i = 0; i < 300; i++) { const a = Math.random() * 6.283, d = rnd(dmin, dmax), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; if (M3.free(Math.floor(x) + 0.5, Math.floor(y) + 0.5, gap)) return [x, y]; }
    return [cx + rnd(-dmax, dmax), cy + rnd(-dmax, dmax)];
  };
  const burner = M3.make('burner', c0[0], c0[1], { el: 'water' });
  let p = at(burner.x, burner.y, 3, 5, 1.6); M3.make('pylon', p[0], p[1]);
  const fed = [];
  for (const nk of ['tree', 'tree', 'tree', 'rock', 'rock', 'iron']) { p = at(burner.x, burner.y, 2.2, 5.6, 1.5); fed.push(M3.make('node', p[0], p[1], { nk })); }
  const h = G.fac.bld.find(b => b.done && FA.def(b).kind === 'harness');
  if (h) { p = at(burner.x, burner.y, 3, 5.6, 1.6); fed.push(M3.make('mirror', p[0], p[1], { el: h.el, hid: h.id, hx: h.x, hy: h.y })); u.mirN = 1; }
  p = at(burner.x, burner.y, 7, 9, 1.8); M3.make('collector', p[0], p[1]);
  for (const b of fed) M3.link(burner, b);
  rk.x = burner.x + 1.6; rk.y = burner.y + 1.6;
  if (M3.blockedU(rk.x, rk.y, 0.35)) { const s = M3.dryU(burner.x, burner.y, 60, [1, 3]); if (s) { rk.x = s[0]; rk.y = s[1]; } }
  for (const el of ELS) for (let i = 0; i < C().remains.start; i++) { p = at(rk.x, rk.y, 1.5, 4.5, 0); M3.addItem('rem_' + el, p[0], p[1], { t: 0 }); }
  for (const b of u.bld) b.pop = 0;
};
// the save: the underworld is kept like the factory (an expedition does not reset it); what is in flight / on screen for a moment is not
M3.saveData = function () {
  const u = G.u;
  return { v: 1, u: { t: u.t, rk: { x: u.rk.x, y: u.rk.y, hands: u.rk.hands.slice(), tool: u.rk.tool }, items: u.items.map(o => ({ k: o.k, x: o.x, y: o.y, t: o.t })).concat(u.fly.map(f => ({ k: f.k, x: f.x1, y: f.y1, t: 0 }))),
    bld: u.bld.map(b => { const o = Object.assign({}, b); delete o.pop; delete o.drop; return o; }), hoses: u.hoses, bank: u.bank, blog: u.blog.slice(-200), idN: u.idN, mirN: u.mirN, st: u.st, ghost: u.ghost } };
};
M3.fix = function (d) {
  const u = M3.fresh(), s = (d && d.u) || {};
  if (s.rk) { u.rk.x = s.rk.x; u.rk.y = s.rk.y; u.rk.hands = (s.rk.hands || []).filter(k => ITEMS[k]); u.rk.tool = M3.TOOLS.indexOf(s.rk.tool) >= 0 || s.rk.tool === 'hpole' ? s.rk.tool : null; }
  u.t = s.t || 0;
  u.items = (s.items || []).filter(o => ITEMS[o.k]).map(o => ({ k: o.k, x: o.x, y: o.y, t: o.t || 0, z: 0, vz: 0 }));
  u.bld = (s.bld || []).filter(b => b && b.type && isFinite(b.x) && isFinite(b.y)).map(b => Object.assign({}, b, { pop: 0 }));
  u.hoses = (s.hoses || []).filter(h => Array.isArray(h) && u.bld.some(b => b.id === h[0]) && u.bld.some(b => b.id === h[1]));
  Object.assign(u.bank, s.bank || {}); u.blog = (s.blog || []).filter(e => ELS.indexOf(e) >= 0);
  u.idN = Math.max(s.idN || 1, 1 + u.bld.reduce((m, b) => Math.max(m, b.id), 0)); u.mirN = s.mirN || 0;
  Object.assign(u.st, s.st || {}); Object.assign(u.ghost, s.ghost || {});
  for (const b of u.bld) if (b.type === 'mirror') b.hid = null;   // (factory ids are new after a load: found again by grid place, M3.mirrorTick)
  return u;
};

// ---------- items lying below: remains (they decay) and the seeds / traps a crafter made ----------
M3.addItem = function (k, x, y, o) {
  const s = M3.blockedU(x, y, 0.2) ? M3.dryU(x, y, 40, [0.5, 4]) : [x, y];
  if (!s) return null;
  const it = Object.assign({ k, x: s[0], y: s[1], t: 0, z: 0, vz: 0 }, o || {});
  G.u.items.push(it);
  return it;
};
// a foe died in the wilds: its remains land below at the same spot (normal 1 + 50% a second, one if it came from an Egg of several; mutant 2, elite 3; a boss: 3 of every element)
M3.remainsFrom = function (e) {
  const R = C().remains, els = WZ.elemsOf ? WZ.elemsOf(e) : [];
  if (e.boss) { for (const el of ELS) for (let i = 0; i < R.boss; i++) M3.dropRemain(el, e.x, e.y); return; }
  const many = e.crafted && ((CFG.creatures[e.type] || {}).n || 1) > 1;   // one of several from one Egg: one remain each
  const n = e.elite ? R.elite : e.mut ? R.mutant : R.normal + (!many && Math.random() < R.extra ? 1 : 0);
  for (let i = 0; i < n; i++) M3.dropRemain(els.length ? els[i % els.length] : ELS[Math.floor(Math.random() * 4)], e.x, e.y);
};
M3.dropRemain = function (el, x, y) {
  const S = C().remains.scatter, it = M3.addItem('rem_' + el, x + rnd(-S, S), y + rnd(-S, S), { z: 2.4 + Math.random(), vz: 0, land: 1 });   // (they seep down from the roof of the underworld)
  if (!it) return;
  FA.fb('remain-land');
};
M3.itemsTick = function (dt) {
  const u = G.u, R = C().remains;
  for (let i = u.items.length - 1; i >= 0; i--) {
    const it = u.items[i];
    if (it.z > 0) { it.vz -= 14 * dt; it.z = Math.max(0, it.z + it.vz * dt); if (it.z === 0) { it.vz = 0; M3.fx('dust', it.x, it.y, { col: ITEMS[it.k].color }); if (it.land) { it.land = 0; it.landT = 4; } } }
    if (it.landT > 0) it.landT -= dt;
    if (!ITEMS[it.k].rem) continue;
    it.t += dt;
    if (it.t > R.life - R.fade && !it.fading) { it.fading = 1; FA.fb('remain-fade'); }
    if (it.t >= R.life) { u.items.splice(i, 1); M3.fx('puff', it.x, it.y, { col: '#7a6a8a' }); }
  }
};

// ---------- the Rootkeeper ----------
// his input (k): ix, iy (screen directions like every character), and the presses: pick, throw, use, roll, tool (slot index | 'clear' | 'prev' | 'next'), ghost, mash held
M3.zeroK = () => ({ ix: 0, iy: 0, pick: false, throw: false, use: false, roll: false, tool: null, ghost: false });
M3.moveRk = function (dt, k) {
  const rk = G.u.rk, Cr = C().rk;
  let dx = 0, dy = 0;
  if (k.ix || k.iy) { dx = k.ix + k.iy; dy = k.iy - k.ix; }
  const m = Math.hypot(dx, dy);
  if (m > 0) { dx /= m; dy /= m; rk.fx = dx; rk.fy = dy; }
  if (rk.rollCd > 0) rk.rollCd -= dt;
  if (k.roll && G.tree.rkroll && rk.roll <= 0 && rk.rollCd <= 0) {
    rk.roll = Cr.rollT; rk.rollCd = Cr.rollCd; rk.rdx = m > 0 ? dx : rk.fx; rk.rdy = m > 0 ? dy : rk.fy;
    const rm = Math.hypot(rk.rdx, rk.rdy) || 1; rk.rdx /= rm; rk.rdy /= rm; AU.sfx('roll'); FA.fb('rk-roll');
  }
  let sp = M3.speed();
  const t = WZ.terrain[Math.floor(rk.y) * CFG.WW + Math.floor(rk.x)] >> 3;
  if (t === T_BOG) sp *= CFG.world.slowTerrain;
  if (rk.roll > 0) { rk.roll -= dt; rk.vx = rk.rdx * sp * Cr.rollSpeed; rk.vy = rk.rdy * sp * Cr.rollSpeed; if ((rk.ghostT = (rk.ghostT || 0) - dt) <= 0) { rk.ghostT = 0.04; rk.ghosts.push({ x: rk.x, y: rk.y, t: 0.22 }); } }
  else {
    const wx = dx * sp, wy = dy * sp, ex = wx - rk.vx, ey = wy - rk.vy, el = Math.hypot(ex, ey), rate = (m > 0 ? CFG.wizard.accel : CFG.wizard.friction) * dt;
    if (el <= rate) { rk.vx = wx; rk.vy = wy; } else { rk.vx += ex / el * rate; rk.vy += ey / el * rate; }
  }
  for (let i = rk.ghosts.length - 1; i >= 0; i--) if ((rk.ghosts[i].t -= dt) <= 0) rk.ghosts.splice(i, 1);
  const nx = rk.x + rk.vx * dt, ny = rk.y + rk.vy * dt, r = Cr.radius, inside = M3.blockedU(rk.x, rk.y, r);   // (already inside water, say after a load: he may walk out)
  if (inside || !M3.blockedU(nx, rk.y, r)) rk.x = Math.max(0.6, Math.min(CFG.WW - 0.6, nx)); else rk.vx = 0;
  if (inside || !M3.blockedU(rk.x, ny, r)) rk.y = Math.max(0.6, Math.min(CFG.WH - 0.6, ny)); else rk.vy = 0;
  const spd = Math.hypot(rk.vx, rk.vy);
  rk.moving = spd > 0.3;
  if (rk.moving) rk.bob += dt * 11 * Math.min(1, spd / Math.max(0.1, sp));
  if (rk.squash > 0) rk.squash -= dt;
  if (rk.throwCd > 0) rk.throwCd -= dt;
  if (rk.mashT > 0) rk.mashT -= dt;
};
// the tile in front of him (where a building, a seed or a trap goes)
M3.front = () => { const rk = G.u.rk, m = Math.hypot(rk.fx, rk.fy) || 1; return [Math.floor(rk.x + rk.fx / m * 1.4) + 0.5, Math.floor(rk.y + rk.fy / m * 1.4) + 0.5]; };
M3.near = function (pred, r) {
  const rk = G.u.rk;
  let best = null, bd = r === undefined ? C().rk.reach : r;
  for (const b of G.u.bld) { if (!pred(b)) continue; const d = dist(b, rk); if (d < bd) { bd = d; best = b; } }
  return best;
};
M3.nearItem = function () {
  const rk = G.u.rk;
  let best = null, bd = C().rk.reach;
  for (const it of G.u.items) { if (it.z > 0.3) continue; const d = dist(it, rk); if (d < bd) { bd = d; best = it; } }
  return best;
};
M3.canPay = c => Object.keys(c).every(k => (G.u.bank[k] || 0) >= c[k]);
M3.pay = function (c) {
  const u = G.u;
  for (const k in c) {
    u.bank[k] -= c[k];
    for (let n = c[k]; n > 0; n--) { const i = u.blog.lastIndexOf(k); if (i >= 0) u.blog.splice(i, 1); }   // (the newest of that kind leave the pull-out order first)
  }
};
M3.short = c => Object.keys(c).filter(k => (G.u.bank[k] || 0) < c[k]).map(k => ['rem_' + k, c[k] - (G.u.bank[k] || 0)]);
M3.say = (ic) => { const rk = G.u.rk; M3.pop(rk.x, rk.y - 0.5, ic); AU.sfx('error'); };
M3.toolCost = t => (C().bld[t] || {}).cost || {};
// pick (A / left click / .): the tool in hand places, the hose tool links, the remove tool removes; with no tool: the nearest item, else the pull-out of a pylon, else craft at a crafter
M3.pick = function () {
  const u = G.u, rk = u.rk, tool = rk.tool;
  if (tool === 'hose') return M3.hoseAt();
  if (tool === 'remove') return M3.removeAt();
  if (tool) return M3.place(tool);
  // the nearest of: a loose item, a pylon to pull from, a crafter (whichever is closest gets the press)
  const it0 = M3.nearItem(), py = M3.near(b => b.type === 'pylon'), cr = M3.near(b => b.type === 'rcraft' || b.type === 'tcraft');
  const dd = o => (o ? dist(o, rk) : 1e9), best = Math.min(dd(it0), dd(py), dd(cr));
  const it = it0 && dd(it0) === best ? it0 : null;
  if (it) {
    if (rk.hands.length >= M3.cap()) { M3.say([['ic_full']]); return; }
    u.items.splice(u.items.indexOf(it), 1); rk.hands.push(it.k); AU.sfx('pickup'); u.st.picked += ITEMS[it.k].rem ? 1 : 0;
    M3.fx('spark', it.x, it.y, { col: ITEMS[it.k].color }); return;
  }
  if (py && dd(py) === best) {
    if (!u.blog.length) { M3.say([['ic_x']]); return; }
    if (rk.hands.length >= M3.cap()) { M3.say([['ic_full']]); return; }
    const el = u.blog.pop();   // last in, first out
    u.bank[el] = Math.max(0, u.bank[el] - 1); rk.hands.push('rem_' + el); AU.sfx('pickup'); M3.pop(py.x, py.y - 1, [['rem_' + el]]); return;
  }
  if (cr) return M3.craft(cr);
  M3.say([['ic_x']]);
};
M3.recipesOf = b => Object.keys(b.type === 'rcraft' ? C().nodes : C().traps);
M3.craft = function (b) {
  if (b.busy) { M3.say([['ic_clock']]); return; }
  const k = M3.recipesOf(b)[b.r % M3.recipesOf(b).length], c = (b.type === 'rcraft' ? C().nodes : C().traps)[k].cost;
  if (!M3.canPay(c)) { M3.say(M3.short(c)); return; }
  M3.pay(c); b.busy = (b.type === 'rcraft' ? 'n_' : 't_') + k; b.prog = 0; b.pop = 0.3; AU.sfx('craft');
};
M3.place = function (tool) {
  const u = G.u, [x, y] = M3.front(), type = tool;
  if (type === 'hpole' && !G.tree.rkpole) { M3.say([['ic_lock']]); return; }
  if (!M3.free(x, y, 1.0)) { M3.pop(x, y - 0.4, [['ic_x']]); AU.sfx('error'); return; }
  const c = M3.toolCost(type);
  if (!M3.canPay(c)) { M3.say(M3.short(c)); return; }
  M3.pay(c);
  const b = M3.make(type, x, y);
  M3.fx('dust', b.x, b.y, { col: '#cdbf9a', n: 12 }); AU.sfx('place'); FA.fb('rk-build');
  return b;
};
M3.hoseAt = function () {
  const u = G.u, rk = u.rk, b = M3.near(() => true, 2.4);
  if (!b) { if (rk.hose) { rk.hose = null; AU.sfx('blip'); } else M3.say([['ic_x']]); return; }
  if (!rk.hose) { rk.hose = b.id; AU.sfx('blip'); return; }
  const a = M3.byId(rk.hose);
  if (!a || a === b) { rk.hose = null; AU.sfx('blip'); return; }
  if (M3.linked(a.id, b.id)) { M3.unlink(a.id, b.id); rk.hose = null; AU.sfx('menu_close'); return; }
  if (!M3.canLink(a, b)) { M3.pop(b.x, b.y - 1, [['ic_target'], ['ic_x']]); AU.sfx('error'); return; }   // too far: a pole between them doubles it
  M3.link(a, b); rk.hose = b.id; AU.sfx('place'); FA.fb('rk-hose');   // (the hose carries on from here: click the next building to keep laying)
};
M3.removeAt = function () {
  const b = M3.near(() => true, 2.2);
  if (!b) { M3.say([['ic_x']]); return; }
  if (b.type === 'mirror') { M3.pop(b.x, b.y - 1, [['ic_lock']]); AU.sfx('error'); return; }   // a mirror Harvester is the Builder's: it goes when its Harvester goes
  const u = G.u, c = b.type === 'node' ? C().nodes[b.nk].cost : b.type === 'trap' ? C().traps[b.tk].cost : M3.toolCost(b.type);
  for (const k in c) { u.bank[k] += c[k]; for (let i = 0; i < c[k]; i++) u.blog.push(k); }
  if (b.type === 'burner') for (const el of ELS) for (let i = 0; i < b.hop[el]; i++) M3.addItem('rem_' + el, b.x + rnd(-0.6, 0.6), b.y + rnd(-0.6, 0.6));
  M3.pop(b.x, b.y - 0.6, Object.keys(c).map(k => ['rem_' + k, c[k]]));
  M3.fx('puff', b.x, b.y, { col: '#b0a080' }); AU.sfx('drop');
  M3.unbuild(b);
};
// throw (B / right click / ,): remains fly into the nearest Storage Pylon or Burner within reach of the throw, else land in front; a seed or trap is planted in front of him
M3.throwOne = function () {
  const u = G.u, rk = u.rk;
  if (!rk.hands.length || rk.throwCd > 0) return;
  const k = rk.hands[rk.hands.length - 1], I = ITEMS[k];
  if (I.seed || I.trap) {
    const [x, y] = M3.front();
    if (!M3.free(x, y, 1.0)) { M3.pop(x, y - 0.4, [['ic_x']]); AU.sfx('error'); return; }
    rk.hands.pop(); rk.throwCd = C().rk.throwGap;
    if (I.seed) { const b = M3.make('node', x, y, { nk: I.seed }); u.st.planted++; FA.fb('node-plant'); M3.fx('dust', b.x, b.y, { col: '#8a6a3c', n: 10 }); AU.sfx('dig'); }
    else { const b = M3.make('trap', x, y, { tk: I.trap }); u.st.traps++; FA.fb('trap-set'); M3.fx('dust', b.x, b.y, { col: '#c8a050', n: 10 }); AU.sfx('place'); }
    return;
  }
  const R = C().rk.throwR, fm = Math.hypot(rk.fx, rk.fy) || 1;
  let to = null, bs = 1e9;   // the pylon or burner he faces most, nearer ones first (a target behind him counts 3x as far)
  for (const b of u.bld) {
    if (b.type !== 'pylon' && b.type !== 'burner') continue;
    const d = dist(b, rk);
    if (d > R) continue;
    const cos = d > 0.01 ? ((b.x - rk.x) * rk.fx + (b.y - rk.y) * rk.fy) / (d * fm) : 1, s = d * (2 - cos);
    if (s < bs) { bs = s; to = b; }
  }
  rk.hands.pop(); rk.throwCd = C().rk.throwGap;
  const [fx, fy] = to ? [to.x, to.y] : M3.front();
  u.fly.push({ k, x0: rk.x, y0: rk.y, x1: fx, y1: fy, t: 0, T: C().rk.throwT * (0.6 + Math.min(1, Math.hypot(fx - rk.x, fy - rk.y) / R) * 0.6), to: to ? to.id : null });
  AU.sfx('throw'); rk.squash = 0.1;
};
M3.flyTick = function (dt) {
  const u = G.u;
  for (let i = u.fly.length - 1; i >= 0; i--) {
    const f = u.fly[i];
    f.t += dt;
    if (f.t < f.T) continue;
    u.fly.splice(i, 1);
    const b = f.to ? M3.byId(f.to) : null, el = ITEMS[f.k].el;
    if (b && b.type === 'pylon' && el) {
      u.bank[el]++; u.blog.push(el); if (u.blog.length > 400) u.blog.shift(); u.st.banked++;
      M3.pop(b.x, b.y - 1.2, [['rem_' + el]]); M3.fx('ring', b.x, b.y, { col: ELEM[el].color }); AU.sfx('bank'); FA.fb('remain-bank');
    } else if (b && b.type === 'burner' && el) {
      b.hop[el]++; M3.fx('ring', b.x, b.y, { col: ELEM[el].color }); AU.sfx('drop');
    } else M3.addItem(f.k, f.x1, f.y1);
  }
};
// use (X / E): mash the node or mirror Harvester in reach, set the Burner's type, switch a crafter's recipe
M3.use = function () {
  const u = G.u, rk = u.rk, b = M3.near(q => q.type === 'node' && !q.up || q.type === 'mirror' || q.type === 'burner' || q.type === 'rcraft' || q.type === 'tcraft');
  if (!b) { M3.say([['ic_x']]); return; }
  if (b.type === 'burner') { b.el = ELS[(ELS.indexOf(b.el) + 1) % 4]; b.pop = 0.3; AU.sfx('el_' + b.el); M3.pop(b.x, b.y - 1.2, [[b.el]]); return; }
  if (b.type === 'rcraft' || b.type === 'tcraft') { b.r = (b.r + 1) % M3.recipesOf(b).length; b.pop = 0.2; AU.sfx('blip'); return; }
  rk.mashT = 0.15; b.mashT = 0.2; b.pop = 0.12;
  if (b.type === 'node') { b.ch = Math.min(1, b.ch + C().nodes[b.nk].mash * M3.mashK()); AU.sfx('crank'); M3.fx('spark', b.x, b.y, { col: '#cfe88a' }); if (b.ch >= 1) M3.manifest(b); }
  else { b.ch += C().mirror.mash * M3.mashK(); AU.sfx('crank'); M3.fx('spark', b.x, b.y, { col: ELEM[b.el].color }); M3.mirrorSend(b); }
  FA.fb('rk-mash');
};
M3.cycleTool = function (k) {
  const rk = G.u.rk, T = M3.TOOLS;
  if (k === 'clear') { rk.tool = null; rk.hose = null; return; }
  if (k === 'prev' || k === 'next') {   // round the toolbar, through the empty hand
    const L = [null].concat(T), i = L.indexOf(rk.tool === 'hpole' ? 'pole' : rk.tool);
    rk.tool = L[(Math.max(0, i) + (k === 'next' ? 1 : -1) + L.length) % L.length]; rk.hose = null; AU.sfx('blip'); return;
  }
  const want = T[k];
  if (!want) return;
  if (want === 'pole' && (rk.tool === 'pole' || rk.tool === 'hpole') && G.tree.rkpole) { rk.tool = rk.tool === 'pole' ? 'hpole' : 'pole'; AU.sfx('blip'); return; }   // (the pole slot: press it again for the heavy pole)
  rk.tool = rk.tool === want ? null : want; rk.hose = null; AU.sfx('blip');
};
M3.input = function (dt, k) {
  const u = G.u, rk = u.rk;
  M3.moveRk(dt, k);
  if (k.tool !== null && k.tool !== undefined) M3.cycleTool(k.tool);
  if (k.ghost) { u.ghost.K = !u.ghost.K; AU.sfx(u.ghost.K ? 'menu_open' : 'menu_close'); FA.fb('ghost-view'); }
  if (rk.roll > 0) return;
  if (k.pick) M3.pick();
  if (k.throw) M3.throwOne();
  if (k.use) M3.use();
};

// ---------- burners, hoses and pulses ----------
M3.burnerTick = function (b, dt) {
  const u = G.u, B = C().burner, ashN = ELS.reduce((a, e) => a + b.ash[e], 0);
  if (b.burn <= 0) {
    if (ashN >= B.ashCap) b.st = 'ash';
    else {   // only what was thrown into it burns (never the shared bank): its set type first, else whatever else is in the hopper
      const el = b.hop[b.el] > 0 ? b.el : ELS.find(e => b.hop[e] > 0);
      if (el) { b.hop[el]--; b.burn = M3.burnT(); b.bel = el; } else b.st = 'starve';
    }
  }
  if (b.burn > 0) {
    b.st = 'burn'; b.burn -= dt;
    if (b.burn <= 0) { b.burn = 0; b.ash[b.bel]++; u.st.burned++; }
    if ((b.pt -= dt) <= 0) {
      b.pt = B.pulse;
      const net = M3.netOf(b).filter(c => c.b.type !== 'collector');
      if (net.length) {
        const a = M3.out() * B.pulse / net.length;   // fewer connections, bigger pulses each
        for (const c of net) u.pulses.push({ p: c.p, t: 0, el: b.bel, a, k: Math.min(1.6, a / (B.out * B.pulse)) });
      }
    }
  }
  b.stT = b.st === b.stWas ? (b.stT || 0) + dt : 0; b.stWas = b.st;
  if (b.st === 'starve' && b.stT > 1.5 && !b.starveSeen) { b.starveSeen = 1; FA.fb('burner-starve'); }
  if (b.st !== 'starve') b.starveSeen = 0;
  if (b.st === 'ash' && b.stT > 1 && !b.ashSeen) { b.ashSeen = 1; FA.fb('ash-full'); }
  if (b.st !== 'ash') b.ashSeen = 0;
};
M3.pulseLen = function (p) {
  let L = 0;
  for (let i = 1; i < p.length; i++) { const a = M3.byId(p[i - 1]), b = M3.byId(p[i]); if (!a || !b) return -1; L += dist(a, b); }
  return L;
};
M3.pulseTick = function (dt) {
  const u = G.u, sp = C().burner.pulseSpeed;
  for (let i = u.pulses.length - 1; i >= 0; i--) {
    const q = u.pulses[i];
    q.t += dt;
    const L = M3.pulseLen(q.p);
    if (L < 0) { u.pulses.splice(i, 1); continue; }
    if (q.t * sp < L) continue;
    u.pulses.splice(i, 1);
    M3.deliver(M3.byId(q.p[q.p.length - 1]), q.el, q.a);
  }
};
// a pulse arrives: full rate on the thing's preferred type, CFG.mode3.wrong of it on any other
M3.deliver = function (b, el, a) {
  if (!b) return;
  const pref = M3.pref(b), k = el === pref ? 1 : C().wrong;
  b.last = el;
  if (k < 1) { b.wrongT = 2; if (!b.wrongSeen) { b.wrongSeen = 1; FA.fb('wrong-fuel'); } } else b.wrongSeen = 0;
  if (b.type === 'node' && !b.up) { b.ch = Math.min(1, b.ch + a * k / C().nodes[b.nk].charge); if (b.ch >= 1) M3.manifest(b); }
  else if (b.type === 'trap') b.fuel = Math.min(C().traps[b.tk].store, b.fuel + a * k);
  else if (b.type === 'mirror') { b.ch += a * k / C().mirror.pack; b.got[el] = (b.got[el] || 0) + a; M3.mirrorSend(b); }
};
M3.collectorTick = function (b, dt) {
  const u = G.u;
  if (b.lift > 0) b.lift -= dt;
  if ((b.ct -= dt) > 0) return;
  b.ct = C().collector.every;
  for (const c of M3.netOfCollector(b)) {
    const el = ELS.find(e => c.ash[e] > 0);
    if (!el) continue;
    c.ash[el]--; G.bank['ash_' + el] = (G.bank['ash_' + el] || 0) + 1; u.st.ash++;
    b.lift = 0.9; b.lel = el; M3.fx('lift', b.x, b.y, { col: ELEM[el].color, el }); AU.sfx('bank'); FA.fb('ash-up');
    UI.changed();
    return;
  }
};
M3.netOfCollector = function (b) {   // the Burners a Collector reaches through its hoses (and poles)
  const adj = M3.adj(), seen = new Set([b.id]), out = [], q = [b.id];
  while (q.length) {
    const cur = q.shift();
    for (const nid of adj.get(cur) || []) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      const n = M3.byId(nid);
      if (!n) continue;
      if (M3.RELAY[n.type]) q.push(nid); else if (n.type === 'burner') out.push(n);
    }
  }
  return out;
};
M3.craftTick = function (b, dt) {
  if (!b.busy) return;
  b.prog += dt;
  if (b.prog < C().craftT) return;
  const rk = G.u.rk, k = b.busy;
  b.busy = null; b.prog = 0; b.pop = 0.3;
  if (rk.hands.length < M3.cap() && dist(rk, b) < C().rk.reach * 2) { rk.hands.push(k); AU.sfx('pickup'); }
  else M3.addItem(k, b.x + 0.9, b.y + 0.3);
  M3.fx('spark', b.x, b.y, { col: '#ffe36b' }); AU.sfx('complete'); FA.fb('rk-craft');
};

// ---------- nodes: a stump / rock pile in both worlds, a harvestable in the wilds once charged ----------
M3.manifest = function (b) {
  if (b.up) return;
  b.up = true; b.ch = 1; b.hp = b.maxHp = CFG.harvest[b.kind].hp; b.broken = false; b.flash = 0; b.surf = undefined; G.u.st.manifest++;
  if (G.w) { WZ.ring(b.x, b.y, 1.4, '#8fd85a', 0.5); WZ.puff(b.x, b.y, '#8fd85a', 12); }
  M3.fx('ring', b.x, b.y, { col: '#8fd85a' }); AU.sfx('powerup', b.x, b.y);
  FA.fb('node-up');
  const nm = b.kind === 'tree' ? 'A tree' : b.kind === 'ore' ? 'An iron ore' : 'A rock';
  UI.toast(nm + ' grew up from the roots', 'R', b.kind === 'tree' ? 'wood' : b.kind === 'ore' ? 'iron' : 'stone');
};
M3.nodeTick = function (b, dt) {
  if (b.flash > 0) b.flash -= dt;
  if (b.wrongT > 0) b.wrongT -= dt;
  if (b.mashT > 0) b.mashT -= dt;
  if (b.up && b.broken) {   // the Wizard harvested it: back to a stump / pile in both worlds, to be charged again
    b.up = false; b.ch = 0; b.broken = false; b.hp = b.maxHp; b.flash = 0;
    M3.fx('ring', b.x, b.y, { col: '#c89a5a' }); M3.pop(b.x, b.y - 0.8, [['ic_clock']]); FA.fb('node-down');
  }
};
// ---------- traps: they stand in the wilds at the same spot; fueled, they fire on foes and re-arm ----------
M3.trapTick = function (b, dt) {
  if (b.fire > 0) b.fire -= dt;
  if (b.wrongT > 0) b.wrongT -= dt;
  if (b.arm > 0) { b.arm -= dt; return; }
  const T = C().traps[b.tk], w = G.w;
  if (!w || b.fuel < T.use) return;
  const foes = w.enemies.filter(e => !e.dead && !(e.fall > 0) && !e.fly && Math.abs(e.x - b.x) < T.r + e.rad && Math.abs(e.y - b.y) < T.r + e.rad && Math.hypot(e.x - b.x, e.y - b.y) < T.r + e.rad);
  if (!foes.length) return;
  b.fuel -= T.use; b.arm = T.rearm * Math.max(0.3, 1 - 0.15 * lvl('rktrap')); b.fire = 0.5;
  const ctx = { spell: 'trap_' + b.tk, el: [T.pref], hits: 0, kills: 0, weak: 0, trap: true }, k = M3.trapK(), was = WZ.ctx;
  WZ.ctx = ctx;
  try {
    for (const e of foes) {
      const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1;
      if (b.tk === 'slow') { WZ.slowE(e, Math.min(0.9, T.slow * k), T.slowT); WZ.hurtE(e, T.dmg * k, 0, 0); }
      else WZ.hurtE(e, T.dmg * k, dx / d * 4, dy / d * 4);
    }
  } finally { WZ.ctx = was; }
  G.u.st.trapHits += foes.length;
  WZ.ring(b.x, b.y, T.r, b.tk === 'slow' ? '#9ad0ff' : '#e8c060', 0.35); WZ.puff(b.x, b.y, b.tk === 'slow' ? '#6a8a4a' : '#c8a050', 10);
  M3.fx('ring', b.x, b.y, { col: '#e8c060' });
  AU.sfx(b.tk === 'slow' ? 'freeze' : 'slam', b.x, b.y); FA.fb('trap-fire');
};
// ---------- mirror Harvesters ----------
M3.mirrorSend = function (b) {
  while (b.ch >= 1) {
    b.ch -= 1; b.got = {};
    const h = FA.byId(b.hid);
    if (!h) return;
    if (h.out.length < CFG.buffer) h.out.push({ kind: b.el }); else FA.dropAt(b.el, h.x + 0.5, h.y + 0.5, true);
    G.stats.packets++; G.u.st.sent++; FA.elTick(b.el);
    // the factory's cue: the packet comes up out of the floor at that Harvester in a column of root-coloured motes, with a root icon (it came from below)
    const cx = h.x + 0.5, cy = h.y + 0.5;
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, r = Math.random() * 0.4; G.fac.parts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z: 0.02, vx: 0, vy: 0, vz: 2.5 + Math.random() * 2.5, g: 1.5, t: 0.7 + Math.random() * 0.3, col: i % 2 ? '#8fd85a' : ELEM[b.el].color }); }
    FA.ipop(cx, cy - 0.2, [['ic_root'], [b.el]]); h.pop = 0.3;
    AU.sfx('el_' + b.el); FA.fb('below-packet');
    M3.fx('lift', b.x, b.y, { col: ELEM[b.el].color, el: b.el });
  }
};
// one mirror per finished Harvester: a new Harvester's mirror drops into the underworld (and he is told), a demolished one's crumbles (its invested fuel falls out as remains)
M3.mirrorTick = function (dt) {
  const u = G.u, hs = G.fac.bld.filter(b => b.done && FA.def(b).kind === 'harness'), ms = u.bld.filter(b => b.type === 'mirror');
  for (const m of ms) if (!hs.some(h => h.id === m.hid)) { const h = hs.find(q => q.x === m.hx && q.y === m.hy && !ms.some(o => o !== m && o.hid === q.id)); m.hid = h ? h.id : null; }   // (after a load: found again by place)
  for (const m of ms) if (!m.hid) M3.mirrorGone(m);
  for (const h of hs) if (!u.bld.some(b => b.type === 'mirror' && b.hid === h.id)) M3.mirrorAdd(h);
  for (const m of u.bld) if (m.type === 'mirror') { const h = FA.byId(m.hid); if (h) { if (m.el !== h.el) { m.el = h.el; m.ch = 0; } m.hx = h.x; m.hy = h.y; } if (m.drop > 0) m.drop -= dt || 0; }
};
M3.mirrorSpot = function () {
  const u = G.u, M = C().mirror, cx = CFG.WW / 2, cy = CFG.WH / 2, k = u.mirN;
  const first = u.bld.find(b => b.type === 'mirror'), d0 = first ? Math.hypot(first.x - cx, first.y - cy) : M.first;
  const want = k < M.firstN ? Math.max(M.first, d0) + M.step * k : Math.max(M.first, d0) + M.step * M.firstN + rnd(-M.step, M.step * 2);
  for (const slack of [0, 2, 5, 9]) for (let i = 0; i < 160; i++) {
    const a = Math.random() * 6.283, d = want + rnd(-1.5 - slack, 1.5 + slack), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (x < 3 || y < 3 || x > CFG.WW - 3 || y > CFG.WH - 3) continue;
    if (M3.free(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.max(2, M.gap - slack))) return [x, y];
  }
  return M3.dryU(cx, cy, 200, [M.first, 60]);
};
M3.mirrorAdd = function (h) {
  const u = G.u, s = M3.mirrorSpot();
  if (!s) return;
  const m = M3.make('mirror', s[0], s[1], { el: h.el, hid: h.id, hx: h.x, hy: h.y });
  u.mirN++;
  M3.fx('ring', m.x, m.y, { col: ELEM[h.el].color, big: 1 }); M3.fx('dust', m.x, m.y, { col: '#cdbf9a', n: 18 });
  M3.toastK('A mirror Harvester (' + ELEM_WORD[h.el] + ') dropped in below: the Builder built a Harvester', 'b:' + h.el);
  AU.sfx('thud'); FA.fb('mirror-new');
};
M3.mirrorGone = function (m) {
  const tot = ELS.reduce((a, e) => a + (m.got[e] || 0), 0), per = C().mirror.perRemain;
  for (const el of ELS) { let n = Math.floor((m.got[el] || 0) / per + 0.5); if (!n && tot >= per / 2 && (m.got[el] || 0) === Math.max(...ELS.map(e => m.got[e] || 0))) n = 1; for (let i = 0; i < n; i++) M3.addItem('rem_' + el, m.x + rnd(-0.8, 0.8), m.y + rnd(-0.8, 0.8)); }
  M3.fx('puff', m.x, m.y, { col: '#6a5a7a' }); M3.fx('ring', m.x, m.y, { col: '#ff7a7a' });
  M3.toastK('A mirror Harvester crumbled: the Builder took down its Harvester', 'ic_warn');
  AU.sfx('drop'); FA.fb('mirror-gone');
  M3.unbuild(m);
};

// ---------- the step (host): everything below, once a frame, after the factory ----------
M3.update = function (dt, k) {
  const u = G.u;
  if (!u) return;
  u.t += dt;
  M3.input(dt, k || M3.zeroK());
  M3.mirrorTick(dt);
  for (const b of u.bld.slice()) {
    if (b.pop > 0) b.pop -= dt;
    if (b.type === 'burner') M3.burnerTick(b, dt);
    else if (b.type === 'collector') M3.collectorTick(b, dt);
    else if (b.type === 'rcraft' || b.type === 'tcraft') M3.craftTick(b, dt);
    else if (b.type === 'node') M3.nodeTick(b, dt);
    else if (b.type === 'trap') M3.trapTick(b, dt);
    else if (b.type === 'mirror') { if (b.wrongT > 0) b.wrongT -= dt; if (b.mashT > 0) b.mashT -= dt; }
  }
  M3.pulseTick(dt);
  M3.flyTick(dt);
  M3.itemsTick(dt);
  for (let i = u.fx.length - 1; i >= 0; i--) if ((u.fx[i].t += dt) > (u.fx[i].type === 'lift' ? 1.1 : u.fx[i].type === 'stream' ? 0.6 : 0.7)) u.fx.splice(i, 1);
  for (let i = u.pops.length - 1; i >= 0; i--) if ((u.pops[i].t += dt) > 1.1) u.pops.splice(i, 1);
  // presence bleed: the Wizard bends the grass below at his spot (he bends the wilds' grass himself; the Rootkeeper's is added to the wilds in WZ.bendTick)
  const B = CFG.bend;
  for (const key in u.bend) if ((u.bend[key].t += dt) > B.life) delete u.bend[key];
  const w = G.w;
  if (w && !w.dead) M3.bendAt(u.bend, w.x, w.y, w.vx, w.vy, CFG.wizard.radius);
  if (w && !w.dead && (u.chT = (u.chT || 0) - dt) <= 0) {   // the Wizard is near a node that is charging: he sees its % (R.drawWorld); counted for the ledger
    u.chT = 0.5;
    if (u.bld.some(b => b.type === 'node' && !b.up && b.ch > 0 && Math.hypot(b.x - w.x, b.y - w.y) < CFG.mode3.chargeR)) FA.fb('node-charge');
  }
  M3.bendAt(u.bend, u.rk.x, u.rk.y, u.rk.vx, u.rk.vy, 0.35);   // (and his own, in his own world)
};
// the grass a body pushes through leans (the same as WZ.bendAt, into any bend map)
M3.bendAt = function (bend, x, y, vx, vy, r) {
  const sp = Math.hypot(vx, vy);
  if (sp < 0.6) return;
  const B = CFG.bend, WW = CFG.WW, d = (vx - vy) / (sp * 1.414) * Math.min(1, sp / 5), reach = r + B.r;
  for (let ty = Math.floor(y - 1); ty <= Math.floor(y + 1); ty++) for (let tx = Math.floor(x - 1); tx <= Math.floor(x + 1); tx++) {
    if (tx < 0 || ty < 0 || tx >= WW || ty >= CFG.WH) continue;
    const i = ty * WW + tx, b = WZ.bucket[i];
    if (b) for (let j = 0; j < b.length && j < 32; j++) { const o = b[j]; if (o.deco && BENDY.has(o.spr) && Math.hypot(o.x - x, o.y - y) < reach) bend[i * 32 + j] = { t: 0, d }; }
  }
};

// ---------- hooks into the wilds (each does nothing outside 3P) ----------
// a foe that dies leaves remains below
const kill0 = WZ.kill;
WZ.kill = function (e) {
  const was = e.dead;
  kill0(e);
  if (G && G.m3 && G.u && !G.menu && !was && e.dead) M3.remainsFrom(e);
};
// the Rootkeeper bends the wilds' grass at the mirror of where he walks (always on, ghosts or not)
const bend0 = WZ.bendTick;
WZ.bendTick = function (dt) {
  bend0(dt);
  if (G && G.m3 && G.u && !G.menu) { const rk = G.u.rk; WZ.bendAt(rk.x, rk.y, rk.vx, rk.vy, 0.35); }
};
// a manifested node is a harvestable like any tree, rock or ore: every hit list that asks for the harvestables near a box gets it too
const harvBox0 = WZ.harvBox;
WZ.harvBox = function (x0, y0, x1, y1) {
  const out = harvBox0(x0, y0, x1, y1);
  if (G && G.m3 && G.u) for (const b of G.u.bld) if (b.type === 'node' && b.up && !b.broken && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) out.push(b);
  return out;
};
// the 3P balance table (CFG.mode3): foe health and counts (the counts through M4.k, which the spawn reads)
const makeEnemy0 = WZ.makeEnemy;
WZ.makeEnemy = function (type, x, y, elite) {
  const e = makeEnemy0(type, x, y, elite);
  if (G && G.m3 && !G.menu) { e.maxHp *= CFG.mode3.hp; e.hp = e.maxHp; }
  return e;
};
const k0 = M4.k;
M4.k = name => (G && G.m3 && !G.m4 && CFG.mode3[name] !== undefined ? CFG.mode3[name] : k0(name));
// the 3P cues name the Rootkeeper: toasts on his side are 'K' (UI.toast shows them on his screen only)
M3.words = t => t;
})();
