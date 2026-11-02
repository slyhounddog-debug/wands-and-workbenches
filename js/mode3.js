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
  hands: [], tool: null, hose: null, mashT: 0, throwCd: 0, pole: 'pole', stT: 0, dustT: 0, rollBuf: 0, ibuf: null, pRepeat: 0, burst: 0, burstAim: null, at: null, aim: null });
M3.fresh = () => ({ v: 1, t: 0, shake: 0, rk: M3.rkFresh(), items: [], bld: [], hoses: [], pulses: [], fly: [], fx: [], pops: [], bank: { air: 0, water: 0, fire: 0, earth: 0 }, blog: [], bend: {},
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
// what stands in the way of putting something at (x, y): the building too close (the Builder's FA.why names the thing in the way), or null (the ground itself is water or a chasm)
M3.blocker = (x, y, gap) => G.u.bld.find(b => Math.hypot(b.x - x, b.y - y) < gap) || null;
// the reason a placement / planting is refused, as the icon row that pops on the tile: the culprit's picture + x, or a bare x for ground he cannot build on
M3.whyBlocked = function (x, y, gap) { const b = M3.blocker(x, y, gap); return { ic: b ? [[M3.bIcon(b)], ['ic_x']] : [['ic_x']], culprit: b }; };

// a new underworld building (type: burner, pylon, tcraft, rcraft, collector, pole, hpole, node, trap, mirror)
M3.make = function (type, x, y, o) {
  const u = G.u, b = Object.assign({ id: u.idN++, type, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, pop: 0.5 }, o || {});
  if (type === 'burner') Object.assign(b, { el: b.el || 'water', hop: { air: 0, water: 0, fire: 0, earth: 0 }, burn: 0, bel: null, ash: { air: 0, water: 0, fire: 0, earth: 0 }, pt: 0, st: 'starve', stT: 0, no: null, open: 0, openT: 0 });
  if (type === 'tcraft' || type === 'rcraft') Object.assign(b, { r: 0, prog: 0, busy: null });
  if (type === 'collector') Object.assign(b, { ct: 0, lift: 0, idle: 0 });
  if (type === 'node') { const N = C().nodes[b.nk]; Object.assign(b, { kind: N.harv, ch: b.ch || 0, up: false, hp: CFG.harvest[N.harv].hp, maxHp: CFG.harvest[N.harv].hp, broken: false, flash: 0, rad: 0.5, last: null, wrongT: 0, mashT: 0 }); }
  if (type === 'trap') Object.assign(b, { fuel: b.fuel || 0, arm: 0, fire: 0, last: null, wrongT: 0, dryT: 0, fullT: 0 });
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

// an underworld sound is for the Rootkeeper only: his machine plays it (the host when he is the host) and a Rootkeeper guest hears it from the host's sound log (G.snd, k: 1);
// the Builder's and the Wizard's machines never do. (Sounds the wilds should hear, a tree growing, a trap firing, stay AU.sfx with their position.)
M3.sfx = function (name) {
  if (Net.role !== 'guest' && M3.myRole() === 'K') AU.sfx(name);
  if (Net.on && Net.role === 'host') Main.tapSfx(name, null, null, true);
};
// the underworld's camera kick (the wilds' w.shake: seconds of it, 24 px a second at most), and the wilds' own when the Wizard is near enough to feel what is made below
M3.kick = amp => { const u = G.u; if (u) u.shake = Math.max(u.shake || 0, amp); };
M3.feel = (x, y, amp) => { const w = G.w; if (w && !w.dead && Math.hypot(x - w.x, y - w.y) < 14) w.shake = Math.max(w.shake, amp); };
// ---------- what goes to the Rootkeeper's screen: a toast on his side ('K'), a pop over a spot ----------
M3.toastK = (text, icon) => UI.toast(text, 'K', icon);
M3.pop = (x, y, ic) => { G.u.pops.push({ x, y, ic, t: 0 }); if (G.u.pops.length > 24) G.u.pops.shift(); };
// WHEN HIS WORLD SAYS NO (FEEDBACK.md, "3-player mode"): the same plumbing as the Builder's and the Wizard's refusals (the evidence counter FA.fb, the cue tiers of CFG.cue, an icon row
// popping where it happened, a sound), in his own materials (remains, ash, hoses, his burners). Tiers: 1 = a resource did not go where it was meant to (the cue holds ambient toasts
// back for a moment, UI.cue), 0 = ambient (a press that cannot happen, a state worth knowing). None of his refusals is a danger (nothing below can hurt him) or a goal.
M3.TIER = { 'burner-busy': 1, 'rk-bounce': 1, 'burner-open': 1, 'trap-dry': 1, 'mirror-blocked': 1, 'burner-ash-throw': 1, 'trap-full': 0, 'collector-idle': 0, 'rk-nope': 0 };
M3.fb = function (id) {
  FA.fb(id);
  const t = M3.TIER[id];
  if (t && Net.role !== 'guest' && M3.myRole() === 'K') UI.cue(t);   // (the tier raises the cue level on HIS machine only: a Wizard or Builder host is not held back by what happens below)
};
// the icon of a building, for "this is what is in the way"
M3.bIcon = b => (b.type === 'node' ? 'n_' + b.nk : b.type === 'trap' ? 't_' + b.tk : 'u_' + b.type);
// a press or placement that cannot happen: ONE icon row where it was refused, red ring on the culprit when there is one, and the error sound
M3.nope = function (x, y, ic, culprit) {
  M3.pop(x, y, ic); M3.sfx('error'); M3.fb('rk-nope');
  if (culprit) M3.fx('ring', culprit.x, culprit.y, { col: '#ff6a6a' });
};
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
  return { v: 1, u: { t: u.t, rk: { x: u.rk.x, y: u.rk.y, hands: u.rk.hands.slice(), tool: u.rk.tool }, items: u.items.map(o => ({ k: o.k, x: o.x, y: o.y, t: o.t })).concat(u.fly.map(f => ({ k: f.kind, x: f.tx, y: f.ty, t: 0 }))),
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
// He speaks the game's one grammar of verbs, through the SAME implementations as the other roles: walking and rolling are the Wizard's (WZ.rollBuffer / rollStart / rollMove /
// steer / stepOn), the pick / use buttons are the Builder's (FA.pressPre / pressPick: the input buffer, hold-to-repeat, sweeping; FA.bestTarget: what a press reaches; FA.doAct:
// why not), throwing is the Builder's (FA.aimFrom: auto-aim, the mouse aims a host; FA.throwJuice; the catch grace; hold to keep throwing, the stack throw), and so are the
// prompts, the lead line and the carried pile (R.drawFocus / drawAim / drawCarry). Only what he does them TO is his own: his world's candidates and actions (M3.cands /
// M3.actionFor) and the numbers in CFG.mode3.rk.
// his input (k): ix, iy (screen directions like every character), the presses pick / throw / use / roll / ghost / stack (the whole pile), held pickHeld / throwHeld,
// tool (slot index | 'clear' | 'prev' | 'next'), at (the mouse's point in his world when a host plays on the mouse, else null)
M3.zeroK = () => ({ ix: 0, iy: 0, pick: false, pickHeld: false, throw: false, throwHeld: false, stack: false, use: false, roll: false, tool: null, ghost: false, at: null });
M3.slide = (o, nx, ny, r) => WZ.slide(o, nx, ny, r, M3.blockedU);   // (the underworld's ground: the raw terrain)
M3.moveRk = function (dt, k) {
  const rk = G.u.rk, Cr = C().rk;
  let dx = 0, dy = 0;
  if (k.ix || k.iy) { dx = k.ix + k.iy; dy = k.iy - k.ix; }
  const m = Math.hypot(dx, dy);
  if (m > 0) { dx /= m; dy /= m; rk.fx = dx; rk.fy = dy; }
  if (rk.rollCd > 0) rk.rollCd -= dt;
  if (WZ.rollBuffer(rk, !!(k.roll && G.tree.rkroll), dt) && rk.rollCd <= 0 && rk.roll <= 0) {   // (Root Roll: a press a moment too early is kept, as the Wizard's is)
    WZ.rollStart(rk, m, dx, dy, Cr.rollT, Cr.rollCd); M3.sfx('roll'); FA.fb('rk-roll');
    M3.fx('dust', rk.x, rk.y, { col: '#cdbf9a', n: 8 }); rk.squash = 0.12; M3.kick(0.05);   // (a puff off the ground, a squash, a small kick)
  }
  let sp = M3.speed();
  const t = WZ.terrain[Math.floor(rk.y) * CFG.WW + Math.floor(rk.x)] >> 3;
  if (t === T_BOG) sp *= CFG.world.slowTerrain;
  if (rk.roll > 0) WZ.rollMove(rk, dt, sp, Cr.rollSpeed, 0.05);
  else WZ.steer(rk, dx * sp, dy * sp, (m > 0 ? CFG.wizard.accel : CFG.wizard.friction) * dt);
  WZ.ghostAge(rk, dt);
  const spd = Math.hypot(rk.vx, rk.vy);
  const was = rk.moving;
  rk.moving = spd > 0.3;
  if (was !== rk.moving) rk.squash = 0.12;   // (the Builder squashes when he starts or stops walking)
  if (spd > 0.01) WZ.stepOn(rk, dt, spd, sp, Cr.radius, M3.slide);
  if (rk.moving && !(rk.roll > 0)) {   // dust puffs behind him (the Builder's) and a soft step
    if ((rk.dustT -= dt) <= 0) { rk.dustT = 0.16; M3.fx('dust', rk.x - rk.vx * 0.04, rk.y - rk.vy * 0.04, { col: '#cdbf9a', n: 3 }); }
    if ((rk.stT -= dt) <= 0) { rk.stT = 0.3; M3.sfx('step_b'); }
  } else { rk.stT = 0.08; rk.dustT = 0; }
  if (rk.squash > 0) rk.squash -= dt;
  if (rk.throwCd > 0) rk.throwCd -= dt;
  if (rk.mashT > 0) rk.mashT -= dt;
};
// the tile in front of him, and where a tool acts: the tile under the mouse (a host playing on the mouse), else the one in front of him (the Builder's placeInFront / hoverTile)
M3.front = () => { const rk = G.u.rk, m = Math.hypot(rk.fx, rk.fy) || 1; return [Math.floor(rk.x + rk.fx / m * 1.4) + 0.5, Math.floor(rk.y + rk.fy / m * 1.4) + 0.5]; };
M3.toolAt = () => { const at = G.u.rk.at; return at ? [Math.floor(at[0]) + 0.5, Math.floor(at[1]) + 0.5] : M3.front(); };
M3.near = function (pred, r) {
  const rk = G.u.rk;
  let best = null, bd = r === undefined ? C().rk.reach : r;
  for (const b of G.u.bld) { if (!pred(b)) continue; const d = dist(b, rk); if (d < bd) { bd = d; best = b; } }
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
M3.say = ic => { const rk = G.u.rk; M3.nope(rk.x, rk.y - 0.5, ic); };
M3.sayA = a => { const rk = G.u.rk; M3.pop(rk.x, rk.y - 0.5, a.row || (a.ic || []).map(k => [k])); M3.fb('rk-nope'); };   // (FA.doAct: why a press can't happen, over him; the error sound is FA.doAct's, played through M3.sfx)
M3.burst = (x, y, col, n) => M3.fx('spark', x, y, { col, n });   // (his world's particles, for the shared juice)
M3.toolCost = t => (C().bld[t] || {}).cost || {};
// ---------- the hands: one pile, last in first out, at most M3.cap() (the Builder's rule) ----------
M3.top = () => { const h = G.u.rk.hands; return h.length ? h[h.length - 1] : null; };
M3.canHold = () => G.u.rk.hands.length < M3.cap();
// ---------- what his pick / use buttons reach (the shared resolver's candidates and actions, FA.act shape) ----------
M3.cands = function () {
  const u = G.u, r = C().rk.reach, out = [];
  for (const it of u.items) if (!(it.z > 0.3)) out.push({ kind: 'floor', o: it, x: it.x, y: it.y, r });   // a loose item (the factory's floor items: same kind, same bonus)
  for (const b of u.bld) out.push({ kind: 'bld', o: b, x: b.x, y: b.y, r });
  return out;
};
M3.itemOf = c => (c.kind === 'floor' ? c.o.k : c.o.type === 'pylon' && G.u.blog.length ? 'rem_' + G.u.blog[G.u.blog.length - 1] : null);
M3.recipesOf = b => Object.keys(b.type === 'rcraft' ? C().nodes : C().traps);
M3.recipeOf = b => { const ks = M3.recipesOf(b); return ks[b.r % ks.length]; };
M3.productOf = (b, k) => (b.type === 'rcraft' ? 'n_' : 't_') + (k || M3.recipeOf(b));
M3.recipeCost = b => (b.type === 'rcraft' ? C().nodes : C().traps)[M3.recipeOf(b)].cost;
M3.isCraft = b => b.type === 'rcraft' || b.type === 'tcraft';
M3.actionFor = function (c, mode) {
  const u = G.u, A = FA.act, pick = mode === 'pick';
  if (c.kind === 'floor') {
    const it = c.o;
    if (!pick || u.items.indexOf(it) < 0) return FA.none();
    return M3.canHold() ? A('Pick up ' + itemName(it.k), () => M3.takeItem(it), true, [it.k]) : FA.full();
  }
  const b = c.o;
  if (pick) {
    if (b.type === 'pylon') {   // (the Builder's Stockpile: take the last banked one back out)
      if (!u.blog.length) return A('The pylon is empty', null, false, ['u_pylon', 'ic_x']);
      return M3.canHold() ? A('Take ' + itemName('rem_' + u.blog[u.blog.length - 1]), () => M3.pullPylon(b), true, ['rem_' + u.blog[u.blog.length - 1]]) : FA.full();
    }
    if (M3.isCraft(b)) {
      if (b.busy) return A('Still crafting', null, false, ['ic_clock']);
      const cost = M3.recipeCost(b);
      if (!M3.canPay(cost)) { const a = A('Not enough remains banked', null, false, [M3.productOf(b), 'ic_x']); a.row = M3.short(cost); return a; }
      return A('Craft ' + itemName(M3.productOf(b)), () => M3.craft(b), false, [M3.productOf(b)]);
    }
    return FA.none();
  }
  if (b.type === 'node' && b.up) return A('Grown: the Wizard harvests it', null, false, ['n_' + b.nk, 'ic_check']);   // (nothing left to charge: say so instead of a press that does nothing)
  if ((b.type === 'node' && !b.up) || b.type === 'mirror') { const a = A('Mash', () => M3.mash(b), false, [b.type === 'mirror' ? b.el : 'ic_bolt']); a.mash = true; return a; }
  if (b.type === 'burner') return A('Set what it burns', () => M3.setBurner(b), false, [b.el, 'ic_swap', ELS[(ELS.indexOf(b.el) + 1) % 4]]);   // (the Builder's Harvester switch: now, swap, next)
  if (M3.isCraft(b)) { const ks = M3.recipesOf(b), nx = ks[(b.r + 1) % ks.length]; return A('Switch recipe', () => M3.nextRecipe(b), false, ['ic_swap', M3.productOf(b, nx)]); }
  return FA.none();
};
M3.findTarget = mode => FA.bestTarget(G.u.rk, M3.cands(), mode, M3.actionFor, M3.top(), M3.itemOf);
M3.interact = function (mode, quiet) { const t = M3.findTarget(mode); return t ? FA.doAct(M3.actionFor(t, mode), quiet, M3.sayA, M3.sfx) : null; };
M3.ad = () => ({   // his side of the shared buttons (FA.pressPre / pressPick): a tool in hand makes the pick button act with it
  interact: M3.interact, building: !!G.u.rk.tool, place: M3.toolAct, actionFor: M3.actionFor, n: () => G.u.rk.hands.length,
  again: () => { const h = M3.top(); return h ? FA.sweepFrom(G.u.rk, M3.cands(), h, M3.actionFor, M3.itemOf) : M3.findTarget('pick'); },
});
// the prompts (R.drawFocus): built like the Builder's (FA.focusOf); none while a tool is out (its ghost is the preview) or while rolling
M3.focus = function () {
  const rk = G.u.rk;
  if (rk.tool || rk.roll > 0) return null;
  const tp = M3.findTarget('pick'), tu = M3.findTarget('use'), list = FA.focusOf(tp, tp && M3.actionFor(tp, 'pick'), tu, tu && M3.actionFor(tu, 'use'));
  return list.length ? { list } : null;
};
// ---------- the actions themselves ----------
M3.takeItem = function (it) {   // one item per press (hold to keep grabbing)
  const u = G.u, rk = u.rk, i = u.items.indexOf(it);
  if (i < 0 || !M3.canHold()) return;
  u.items.splice(i, 1); rk.hands.push(it.k); u.st.picked += ITEMS[it.k].rem ? 1 : 0;
  FA.pickJuice(it.k, it.x, it.y, rk, M3.burst, M3.sfx);
};
M3.pullPylon = function (py) {
  const u = G.u, rk = u.rk;
  if (!u.blog.length || !M3.canHold()) return;
  const el = u.blog.pop();   // last in, first out
  u.bank[el] = Math.max(0, u.bank[el] - 1); rk.hands.push('rem_' + el); M3.pop(py.x, py.y - 1, [['rem_' + el]]);
  FA.pickJuice('rem_' + el, py.x, py.y, rk, M3.burst, M3.sfx);
};
M3.craft = function (b) {
  if (b.busy) { M3.say([['ic_clock']]); return; }
  const c = M3.recipeCost(b);
  if (!M3.canPay(c)) { M3.say(M3.short(c)); return; }
  M3.pay(c); b.busy = M3.productOf(b); b.prog = 0; b.pop = 0.3; M3.sfx('craft');
  M3.fx('spark', b.x, b.y, { col: '#ffe36b', n: 5 }); M3.kick(0.05); G.u.rk.squash = 0.12;
};
M3.nextRecipe = b => { b.r = (b.r + 1) % M3.recipesOf(b).length; b.pop = 0.2; M3.sfx('blip'); };
M3.setBurner = b => { b.el = ELS[(ELS.indexOf(b.el) + 1) % 4]; b.pop = 0.3; M3.sfx('el_' + b.el); M3.pop(b.x, b.y - 1.2, [[b.el]]); M3.fx('ring', b.x, b.y, { col: ELEM[b.el].color }); G.u.rk.squash = 0.12; };
M3.mash = function (b) {   // a tap fills the meter (the Builder's crank: he squashes, sparks of what it makes, the crank sound)
  const rk = G.u.rk;
  rk.mashT = 0.15; rk.squash = 0.15; b.mashT = 0.2; b.pop = 0.12;
  if (b.type === 'node') { b.ch = Math.min(1, b.ch + C().nodes[b.nk].mash * M3.mashK()); M3.sfx('crank'); M3.fx('spark', b.x, b.y, { col: '#cfe88a' }); if (b.ch >= 1) M3.manifest(b); }
  else { b.ch += C().mirror.mash * M3.mashK(); M3.sfx('crank'); M3.fx('spark', b.x, b.y, { col: ELEM[b.el].color }); M3.mirrorSend(b); }
  FA.fb('rk-mash');
};
// ---------- the tools (the pick button with a tool out): place, lay a hose, remove. Each returns whether it did something; quiet = the input buffer will retry, say nothing yet ----------
M3.toolAct = function (quiet) {
  const tool = G.u.rk.tool;
  if (tool === 'hose') return M3.hoseAt(quiet);
  if (tool === 'remove') return M3.removeAt(quiet);
  return !!M3.place(tool, quiet);
};
// the building a hose / remove tool acts on: the one under the mouse (a host on the mouse), else the shared resolver's pick in reach (the way he faces counts)
M3.toolAction = c => (G.u.rk.tool === 'remove' && c.o.type === 'mirror' ? FA.act('A mirror Harvester goes with its Harvester', null, false, ['ic_lock']) : FA.act('', () => {}));
M3.toolTarget = function () {
  const u = G.u, rk = u.rk, r = rk.tool === 'hose' ? 2.4 : 2.2;
  if (rk.at) { let best = null, bd = 0.9; for (const b of u.bld) { const d = Math.hypot(b.x - rk.at[0], b.y - rk.at[1]); if (d < bd) { bd = d; best = b; } } return best; }
  const t = FA.bestTarget(rk, u.bld.map(b => ({ kind: 'bld', o: b, x: b.x, y: b.y, r })), 'tool', M3.toolAction, null, () => null);
  return t ? t.o : null;
};
M3.place = function (tool, quiet) {
  const [x, y] = M3.toolAt(), type = tool;
  const no = (ic, culprit) => { if (!quiet) M3.nope(x, y - 0.4, ic, culprit); return null; };   // (the Builder's placeInFront: the reason pops on the tile)
  if (type === 'hpole' && !G.tree.rkpole) return no([['ic_lock']]);
  if (!M3.free(x, y, 1.0)) { const w = M3.whyBlocked(x, y, 1.0); return no(w.ic, w.culprit); }
  const c = M3.toolCost(type);
  if (!M3.canPay(c)) return no(M3.short(c));
  M3.pay(c);
  const b = M3.make(type, x, y);
  M3.fx('dust', b.x, b.y, { col: '#cdbf9a', n: 12 }); M3.fx('ring', b.x, b.y, { col: '#cdbf9a' }); M3.sfx('place'); FA.fb('rk-build');
  M3.kick(0.15); G.u.rk.squash = 0.12;   // (the Builder's building lands with a nudge)
  return b;
};
M3.hoseAt = function (quiet) {
  const u = G.u, rk = u.rk, b = M3.toolTarget();
  if (!b) { if (rk.hose) { rk.hose = null; M3.sfx('blip'); return true; } if (!quiet) M3.say([['ic_x']]); return false; }
  if (!rk.hose) { rk.hose = b.id; M3.sfx('blip'); M3.fx('spark', b.x, b.y, { col: '#9adf5a', n: 5 }); rk.squash = 0.1; return true; }
  const a = M3.byId(rk.hose);
  if (!a || a === b) { rk.hose = null; M3.sfx('blip'); return true; }
  if (M3.linked(a.id, b.id)) { M3.unlink(a.id, b.id); rk.hose = null; M3.sfx('menu_close'); M3.fx('puff', b.x, b.y, { col: '#7a5a3a' }); rk.squash = 0.1; return true; }
  if (!M3.canLink(a, b)) { if (!quiet) M3.nope(b.x, b.y - 1, [['ic_target'], ['ic_x']]); return false; }   // too far: a pole between them doubles it
  M3.link(a, b); rk.hose = b.id; M3.sfx('place'); FA.fb('rk-hose');
  M3.fx('stream', a.x, a.y, { col: '#9adf5a', x1: b.x, y1: b.y }); M3.fx('spark', b.x, b.y, { col: '#9adf5a', n: 6 }); rk.squash = 0.12; M3.kick(0.06);   // (the hose carries on from here: pick the next building to keep laying)
  return true;
};
M3.refundOf = b => (b.type === 'node' ? C().nodes[b.nk].cost : b.type === 'trap' ? C().traps[b.tk].cost : M3.toolCost(b.type));
M3.removeAt = function (quiet) {
  const b = M3.toolTarget();
  if (!b) { if (!quiet) M3.say([['ic_x']]); return false; }
  if (b.type === 'mirror') { if (!quiet) M3.nope(b.x, b.y - 1, [['ic_lock']], b); return false; }   // a mirror Harvester is the Builder's: it goes when its Harvester goes
  const u = G.u, c = M3.refundOf(b);
  for (const k in c) { u.bank[k] += c[k]; for (let i = 0; i < c[k]; i++) u.blog.push(k); }
  if (b.type === 'burner') for (const el of ELS) for (let i = 0; i < b.hop[el]; i++) M3.addItem('rem_' + el, b.x + rnd(-0.6, 0.6), b.y + rnd(-0.6, 0.6));
  M3.pop(b.x, b.y - 0.6, Object.keys(c).map(k => ['rem_' + k, c[k]]));
  M3.fx('puff', b.x, b.y, { col: '#b0a080' }); M3.sfx('drop');
  M3.kick(0.12); G.u.rk.squash = 0.12;
  M3.unbuild(b);
  return true;
};
// ---------- throwing (the Builder's): remains go to a Storage Pylon or a Burner; a seed or a trap is planted where a tool would act ----------
// every receiver in range that takes kind k, the FA.throwList shape (the auto-aim cone, FA.aimFrom, picks among them)
M3.throwList = function (k) {
  const rk = G.u.rk, R = C().rk.throwR, out = [];
  if (!ITEMS[k] || !ITEMS[k].rem) return out;
  for (const b of G.u.bld) { if (b.type !== 'pylon' && b.type !== 'burner') continue; const d = Math.hypot(b.x - rk.x, b.y - rk.y); if (d >= 0.4 && d <= R) out.push({ x: b.x, y: b.y, obj: b, prio: M3.accepts(b, k) ? 1 : 3, d }); }
  return out;
};
// ONE BURNER BURNS ONE TYPE OF REMAINS AT A TIME. What it is committed to: what it is burning now, else what waits in its hopper (its set type first, as burnerTick picks), else nothing.
// A remain of any other type is turned away (M3.flyTick bounces it and says what the burner is burning); an idle, empty burner takes any.
M3.burnerType = b => (b.burn > 0 ? b.bel : (b.hop[b.el] > 0 ? b.el : ELS.find(e => b.hop[e] > 0)) || null);
M3.accepts = (b, k) => { if (!b || !ITEMS[k] || !ITEMS[k].rem) return false; if (b.type === 'pylon') return true; if (b.type !== 'burner') return false; const cur = M3.burnerType(b); return !cur || cur === ITEMS[k].el; };
// where a throw lands: at the mouse (a host on the mouse; clamped to his range, onto the receiver under it), else auto-aim
M3.throwTarget = function () {
  const rk = G.u.rk, k = M3.top();
  if (!k) return null;
  if (rk.at) {
    const R = C().rk.throwR;
    let dx = rk.at[0] - rk.x, dy = rk.at[1] - rk.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > R) { dx *= R / d; dy *= R / d; }
    const tx = rk.x + dx, ty = rk.y + dy, hit = M3.throwList(k).find(c => Math.hypot(c.x - tx, c.y - ty) < 0.9);
    return hit ? { x: hit.x, y: hit.y, obj: hit.obj } : { x: tx, y: ty, obj: null };
  }
  return FA.aimFrom(rk, M3.throwList(k), CFG.WW, CFG.WH);
};
M3.plantable = k => !!(k && (ITEMS[k].seed || ITEMS[k].trap));
// one throw (cd: the gap before the next; aim: a fixed point, the stack throw's; quiet: a held button repeating, so a seed that cannot go in says nothing)
M3.throwOne = function (cd, aim, quiet) {
  const u = G.u, rk = u.rk;
  if (!rk.hands.length || rk.throwCd > 0) return false;
  const k = M3.top(), I = ITEMS[k];
  if (I.seed || I.trap) {
    const [x, y] = M3.toolAt();
    if (!M3.free(x, y, 1.0)) { if (!quiet) { const w = M3.whyBlocked(x, y, 1.0); M3.nope(x, y - 0.4, w.ic, w.culprit); } return false; }
    rk.hands.pop(); rk.throwCd = cd || C().rk.throwGap;
    if (I.seed) { const b = M3.make('node', x, y, { nk: I.seed }); u.st.planted++; FA.fb('node-plant'); M3.fx('dust', b.x, b.y, { col: '#8a6a3c', n: 10 }); M3.sfx('dig'); }
    else { const b = M3.make('trap', x, y, { tk: I.trap }); u.st.traps++; FA.fb('trap-set'); M3.fx('dust', b.x, b.y, { col: '#c8a050', n: 10 }); M3.sfx('place'); }
    rk.squash = 0.18; M3.kick(0.1);
    return true;
  }
  const tg = aim ? { x: aim.x, y: aim.y, obj: aim.to ? M3.byId(aim.to) : null } : M3.throwTarget();
  rk.hands.pop(); rk.throwCd = cd || C().rk.throwGap;
  u.fly.push(FA.flightOf(k, rk.x, rk.y, tg.x, tg.y, { to: tg.obj ? tg.obj.id : null }));   // (the Builder's flight: the same line, lob and time)
  FA.throwJuice(rk, tg.x, tg.y, k, M3.burst, M3.sfx);
  return true;
};
// a throw comes down: into what it was aimed at, else (the Builder's catch grace, CFG.catchR) into a pylon or burner it lands right beside, else on the ground
M3.catchNear = function (x, y, k) {
  let best = null, bd = CFG.catchR;
  for (const b of G.u.bld) {
    if (!M3.accepts(b, k)) continue;
    const d = Math.hypot(Math.max(Math.abs(b.x - x) - 0.5, 0), Math.max(Math.abs(b.y - y) - 0.5, 0));
    if (d <= bd) { bd = d; best = b; }
  }
  return best;
};
// a throw that cannot go in springs BACK toward him (the Builder's bounce: CFG.boing, the same boing flight, never into a building), with ONE icon row where it came down saying why
// (the item + x; a Burner busy with another type adds what it is burning, see M3.busyCue)
M3.bounce = function (f, why) {
  const u = G.u, rk = u.rk, B = CFG.boing, x = f.tx, y = f.ty, dx = rk.x - x, dy = rk.y - y, d = Math.hypot(dx, dy) || 1;
  let k = Math.max(B.min, Math.min(B.max, d * B.back)), bx = x + dx / d * k, by = y + dy / d * k;
  const bad = (px, py) => M3.blockedU(px, py, 0.2) || !!M3.buildingAt(px, py);
  while (k > 0.4 && bad(bx, by)) { k -= 0.3; bx = x + dx / d * k; by = y + dy / d * k; }
  if (bad(bx, by)) { bx = rk.x; by = rk.y; }
  u.fly.push({ kind: f.kind, sx: x, sy: y, x, y, z: 0.8, tx: bx, ty: by, t: 0, T: B.T, h: B.h, boing: true });
  M3.pop(x, y - 0.2, why); M3.fx('ring', x, y, { col: '#ff6a6a' }); M3.sfx('boing'); M3.kick(0.04);
};
// the building whose tile (x, y) lies on, if any
M3.buildingAt = (x, y) => G.u.bld.find(b => Math.abs(b.x - x) < 0.5 && Math.abs(b.y - y) < 0.5) || null;
// a Burner turned a remain away: it SAYS what it is burning. Its tag (b.no, plain data, drawn by R.drawUBld) shows the remain it burns and a flame for a moment, and a ring in that
// element's colour goes out from it, so the "no" also teaches the rule
M3.busyCue = function (b, f) {
  const cur = M3.burnerType(b), el = ITEMS[f.kind].el;
  b.no = { k: el, cur, t: 2.4 }; b.pop = 0.3;
  M3.fx('ring', b.x, b.y, { col: ELEM[cur].color, big: 1 });
  M3.fb('burner-busy');
  M3.bounce(f, [['rem_' + el], ['ic_x']]);
};
M3.flyTick = function (dt) {
  const u = G.u;
  for (let i = u.fly.length - 1; i >= 0; i--) {
    const f = u.fly[i];
    f.t += dt;
    FA.flightPos(f, f);
    if (f.t < f.T) continue;
    u.fly.splice(i, 1);
    if (f.boing) { M3.addItem(f.kind, f.tx, f.ty); M3.sfx('thud'); M3.fx('dust', f.tx, f.ty, { col: ITEMS[f.kind].color, n: 4 }); continue; }   // (the end of a bounce-back: it just lands)
    const el = ITEMS[f.kind].el, aimed = f.to ? M3.byId(f.to) : null;
    // into what it was aimed at, else (the Builder's catch grace) into a receiver that TAKES it right beside where it came down
    const b = aimed && M3.accepts(aimed, f.kind) ? aimed : (el ? M3.catchNear(f.tx, f.ty, f.kind) : null);
    if (b && b.type === 'pylon' && el) {
      u.bank[el]++; u.blog.push(el); if (u.blog.length > 400) u.blog.shift(); u.st.banked++;
      M3.pop(b.x, b.y - 1.2, [['rem_' + el]]); M3.fx('ring', b.x, b.y, { col: ELEM[el].color }); M3.sfx('bank'); FA.fb('remain-bank'); M3.kick(0.1); b.pop = 0.3;
    } else if (b && b.type === 'burner' && el) {
      b.hop[el]++; M3.fx('ring', b.x, b.y, { col: ELEM[el].color }); M3.sfx('drop'); M3.kick(0.1); b.pop = 0.3;
      if (ELS.reduce((a, e) => a + b.ash[e], 0) >= C().burner.ashCap) {   // taken in, but it cannot burn it: its ash tray is full (it says so now, not only after a second of standing dark)
        M3.pop(b.x, b.y - 1.4, [['ash_' + (ELS.find(e => b.ash[e] > 0) || 'air')], ['ic_full']]); M3.sfx('st_full'); M3.fb('burner-ash-throw');
      }
    } else {
      const hit = aimed || M3.buildingAt(f.tx, f.ty);
      if (hit && hit.type === 'burner' && el) M3.busyCue(hit, f);   // a Burner already on another type
      else if (hit) { M3.fb('rk-bounce'); M3.bounce(f, [['rem_' + el], [M3.bIcon(hit)], ['ic_x']]); }   // a building that does not take remains: what it is, and x
      else if (M3.blockedU(f.tx, f.ty, 0.2)) { M3.fb('rk-bounce'); M3.bounce(f, [['rem_' + el], ['ic_x']]); }   // water, a chasm or the edge of the world: no ground to lie on
      else { M3.addItem(f.kind, f.tx, f.ty); M3.sfx('thud'); M3.fx('dust', f.tx, f.ty, { col: ITEMS[f.kind].color, n: 4 }); M3.kick(0.05); }
    }
  }
};
// ---------- the toolbar: the Builder's hotbar rules (UI.select / UI.cycle / UI.pickSlot) ----------
// a slot's key picks it (pressed again it stays; on the pole slot, a family once the heavy pole is bought, it switches the pole inside); prev / next go slot to slot (from an empty
// hand: the first / the last); clear puts the tool away (the empty hand)
M3.poleNow = () => (G.tree.rkpole && G.u.rk.pole === 'hpole' ? 'hpole' : 'pole');   // the pole slot's member (the Builder's family slot: the last one picked)
M3.cycleTool = function (k) {
  const rk = G.u.rk, T = M3.TOOLS;
  if (k === 'clear') { if (rk.tool || rk.hose) M3.sfx('blip'); rk.tool = null; rk.hose = null; rk.ibuf = null; return; }
  if (k === 'prev' || k === 'next') {
    const n = T.length, i = T.indexOf(rk.tool === 'hpole' ? 'pole' : rk.tool), dir = k === 'next' ? 1 : -1;
    rk.tool = T[i < 0 ? (dir > 0 ? 0 : n - 1) : ((i + dir) % n + n) % n]; if (rk.tool === 'pole') rk.tool = M3.poleNow(); rk.hose = null; rk.ibuf = null; M3.sfx('blip'); return;
  }
  const want = T[k];
  if (!want) return;
  if (want === 'pole') {   // the pole slot is a family: its first press picks the pole it shows, pressing it again switches poles once the heavy pole is bought
    if (rk.tool === 'pole' || rk.tool === 'hpole') { if (G.tree.rkpole) rk.pole = rk.tool === 'pole' ? 'hpole' : 'pole'; } else { rk.hose = null; rk.ibuf = null; }
    rk.tool = M3.poleNow(); M3.sfx('blip'); return;
  }
  if (rk.tool !== want) { rk.hose = null; rk.ibuf = null; }
  rk.tool = want; M3.sfx('blip');
};
M3.input = function (dt, k) {
  const u = G.u, rk = u.rk;
  rk.at = k.at || null;
  M3.moveRk(dt, k);
  if (k.tool !== null && k.tool !== undefined) M3.cycleTool(k.tool);
  if (k.ghost) { u.ghost.K = !u.ghost.K; M3.sfx(u.ghost.K ? 'menu_open' : 'menu_close'); FA.fb('ghost-view'); }
  // the lead line (drawn from G: R.drawAim): where a throw would land now, while he holds remains with no tool out
  const top = M3.top(), tg = top && !rk.tool && !M3.plantable(top) ? M3.throwTarget() : null;
  rk.aim = tg ? { x: tg.x, y: tg.y, to: tg.obj ? tg.obj.id : null, ok: !tg.obj || M3.accepts(tg.obj, top) } : null;   // (ok: the receiver takes it: a Burner busy with another type shows red)
  if (rk.roll > 0) return;
  const ad = M3.ad();
  FA.pressPre(dt, rk, ad, !!k.pick, !!k.use);
  FA.pressPick(dt, rk, ad, !!k.pick, !!k.pickHeld);
  // throw: a press throws one and holding keeps throwing; the stack button sends the whole pile at one aim point, one every CFG.throwStackGap (the Builder's Shift + throw)
  if (k.stack && rk.hands.length) { const a = M3.throwTarget(); if (a) { rk.burst = rk.hands.length; rk.burstAim = { x: a.x, y: a.y, to: a.obj ? a.obj.id : null }; } }
  if (rk.burst > 0) { if (!rk.hands.length) rk.burst = 0; else if (M3.throwOne(CFG.throwStackGap, rk.burstAim, true)) rk.burst--; }
  else if (k.throw || k.throwHeld) M3.throwOne(undefined, undefined, !k.throw);
};

// ---------- burners, hoses and pulses ----------
M3.burnerTick = function (b, dt) {
  const u = G.u, B = C().burner, ashN = ELS.reduce((a, e) => a + b.ash[e], 0);
  if (b.no && (b.no.t -= dt) <= 0) b.no = null;   // (the tag of a refused remain: what it burns, for a moment)
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
      const all = M3.netOf(b), net = all.filter(c => c.b.type !== 'collector');
      b.open = all.length === 0 ? 1 : 0;   // (burning with nothing on its hoses: the heat goes nowhere)
      if (net.length) {
        const a = M3.out() * B.pulse / net.length;   // fewer connections, bigger pulses each
        for (const c of net) u.pulses.push({ p: c.p, t: 0, el: b.bel, a, k: Math.min(1.6, a / (B.out * B.pulse)) });
      }
    }
  }
  b.stT = b.st === b.stWas ? (b.stT || 0) + dt : 0; b.stWas = b.st;
  if (b.st !== 'burn') b.open = 0;
  b.openT = b.open ? (b.openT || 0) + dt : 0;
  if (b.openT > 1.5 && !b.openSeen) { b.openSeen = 1; M3.pop(b.x, b.y - 1.6, [['ic_hose'], ['ic_x']]); M3.sfx('st_jam'); M3.fb('burner-open'); }
  if (!b.open) b.openSeen = 0;
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
  else if (b.type === 'trap') {
    const st = C().traps[b.tk].store;
    if (b.fuel >= st - 1e-6 && !(b.fullT > 0)) { b.fullT = 3; M3.pop(b.x, b.y - 1, [['ic_full']]); M3.sfx('st_full'); M3.fb('trap-full'); }   // (a full trap: the pulses that reach it are wasted)
    b.fuel = Math.min(st, b.fuel + a * k);
  }
  else if (b.type === 'mirror') { b.ch += a * k / C().mirror.pack; b.got[el] = (b.got[el] || 0) + a; M3.mirrorSend(b); }
};
M3.collectorTick = function (b, dt) {
  const u = G.u;
  if (b.lift > 0) b.lift -= dt;
  if ((b.ct -= dt) > 0) return;
  b.ct = C().collector.every;
  const reach = M3.netOfCollector(b);
  b.idle = reach.length === 0 ? 1 : 0;   // (hosed to no Burner: it has nothing to lift)
  for (const c of reach) {
    const el = ELS.find(e => c.ash[e] > 0);
    if (!el) continue;
    c.ash[el]--; G.bank['ash_' + el] = (G.bank['ash_' + el] || 0) + 1; u.st.ash++;
    b.lift = 0.9; b.lel = el; M3.fx('lift', b.x, b.y, { col: ELEM[el].color, el }); M3.sfx('bank'); FA.fb('ash-up'); M3.kick(0.05);
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
  if (rk.hands.length < M3.cap() && dist(rk, b) < C().rk.reach * 2) { rk.hands.push(k); M3.sfx('pickup'); }
  else M3.addItem(k, b.x + 0.9, b.y + 0.3);
  M3.fx('spark', b.x, b.y, { col: '#ffe36b' }); M3.sfx('complete'); FA.fb('rk-craft'); M3.kick(0.1);
};

// ---------- nodes: a stump / rock pile in both worlds, a harvestable in the wilds once charged ----------
M3.manifest = function (b) {
  if (b.up) return;
  b.up = true; b.ch = 1; b.hp = b.maxHp = CFG.harvest[b.kind].hp; b.broken = false; b.flash = 0; b.surf = undefined; G.u.st.manifest++;
  if (G.w) { WZ.ring(b.x, b.y, 1.4, '#8fd85a', 0.5); WZ.puff(b.x, b.y, '#8fd85a', 12); }
  M3.fx('ring', b.x, b.y, { col: '#8fd85a' }); AU.sfx('powerup', b.x, b.y); M3.kick(0.2); M3.feel(b.x, b.y, 0.12);
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
M3.trapFoes = (b, T, w) => w.enemies.filter(e => !e.dead && !(e.fall > 0) && !e.fly && Math.abs(e.x - b.x) < T.r + e.rad && Math.abs(e.y - b.y) < T.r + e.rad && Math.hypot(e.x - b.x, e.y - b.y) < T.r + e.rad);
M3.trapTick = function (b, dt) {
  if (b.fire > 0) b.fire -= dt;
  if (b.wrongT > 0) b.wrongT -= dt;
  if (b.fullT > 0) b.fullT -= dt;
  if (b.dryT > 0) b.dryT -= dt;
  if (b.arm > 0) { b.arm -= dt; return; }
  const T = C().traps[b.tk], w = G.w;
  if (!w) return;
  if (b.fuel < T.use) {   // no fuel: a foe walks through it and nothing happens. It says so (what it wants, starved), in both worlds, instead of staying a silent ornament
    if ((b.dryChk = (b.dryChk || 0) - dt) > 0 || b.dryT > 0) return;
    b.dryChk = 0.3;
    if (!M3.trapFoes(b, T, w).length) return;
    b.dryT = 2.4; M3.pop(b.x, b.y - 1.1, [[T.pref], ['ic_starve']]); M3.fx('ring', b.x, b.y, { col: '#8a8494' }); M3.fb('trap-dry');
    if (Math.hypot(b.x - G.u.rk.x, b.y - G.u.rk.y) < 14) M3.sfx('st_starve');
    return;
  }
  const foes = M3.trapFoes(b, T, w);
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
  AU.sfx(b.tk === 'slow' ? 'freeze' : 'slam', b.x, b.y); FA.fb('trap-fire'); M3.kick(0.2); M3.feel(b.x, b.y, 0.12);
};
// ---------- mirror Harvesters ----------
M3.mirrorSend = function (b) {
  while (b.ch >= 1) {
    b.ch -= 1; b.got = {};
    const h = FA.byId(b.hid);
    if (!h) return;
    if (h.out.length < CFG.buffer) h.out.push({ kind: b.el });
    else { FA.dropAt(b.el, h.x + 0.5, h.y + 0.5, true); M3.pop(b.x, b.y - 1, [[b.el], ['ic_jam']]); M3.fx('ring', b.x, b.y, { col: '#ff9a3a' }); M3.sfx('st_jam'); M3.fb('mirror-blocked'); }   // (its output is full: the packet had to fall on the floor. The Builder's jam, told below)
    G.stats.packets++; G.u.st.sent++; FA.elTick(b.el);
    // the factory's cue: the packet comes up out of the floor at that Harvester in a column of root-coloured motes, with a root icon (it came from below)
    const cx = h.x + 0.5, cy = h.y + 0.5;
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, r = Math.random() * 0.4; G.fac.parts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z: 0.02, vx: 0, vy: 0, vz: 2.5 + Math.random() * 2.5, g: 1.5, t: 0.7 + Math.random() * 0.3, col: i % 2 ? '#8fd85a' : ELEM[b.el].color }); }
    FA.ipop(cx, cy - 0.2, [['ic_root'], [b.el]]); h.pop = 0.3;
    AU.sfx('el_' + b.el); FA.fb('below-packet'); FA.nudge(2.5); M3.kick(0.1);
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
  M3.sfx('thud'); FA.fb('mirror-new');
};
M3.mirrorGone = function (m) {
  const tot = ELS.reduce((a, e) => a + (m.got[e] || 0), 0), per = C().mirror.perRemain;
  for (const el of ELS) { let n = Math.floor((m.got[el] || 0) / per + 0.5); if (!n && tot >= per / 2 && (m.got[el] || 0) === Math.max(...ELS.map(e => m.got[e] || 0))) n = 1; for (let i = 0; i < n; i++) M3.addItem('rem_' + el, m.x + rnd(-0.8, 0.8), m.y + rnd(-0.8, 0.8)); }
  M3.fx('puff', m.x, m.y, { col: '#6a5a7a' }); M3.fx('ring', m.x, m.y, { col: '#ff7a7a' });
  M3.toastK('A mirror Harvester crumbled: the Builder took down its Harvester', 'ic_warn');
  M3.sfx('drop'); FA.fb('mirror-gone');
  M3.unbuild(m);
};

// ---------- the step (host): everything below, once a frame, after the factory ----------
M3.update = function (dt, k) {
  const u = G.u;
  if (!u) return;
  u.t += dt;
  if (u.shake > 0) u.shake = Math.max(0, u.shake - dt);
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
  if ((u.idleT = (u.idleT || 0) - dt) <= 0) {   // an idle Collector within his sight shows what it lacks (R.drawUBld / M3D.infoNear); counted for the ledger
    u.idleT = 0.5;
    if (u.bld.some(b => b.type === 'collector' && b.idle && Math.hypot(b.x - u.rk.x, b.y - u.rk.y) < 3.2)) M3.fb('collector-idle');
  }
  M3.itemsTick(dt);
  for (let i = u.fx.length - 1; i >= 0; i--) if ((u.fx[i].t += dt) > (u.fx[i].type === 'lift' ? 1.1 : u.fx[i].type === 'stream' ? 0.6 : 0.7)) u.fx.splice(i, 1);
  for (let i = u.pops.length - 1; i >= 0; i--) if ((u.pops[i].t += dt) > 1.1) u.pops.splice(i, 1);
  // presence bleed: the Wizard bends the grass below at his spot (he bends the wilds' grass himself; the Rootkeeper's is added to the wilds in WZ.bendTick)
  const B = CFG.bend;
  for (const key in u.bend) if ((u.bend[key].t += dt) > B.life) delete u.bend[key];
  const w = G.w;
  if (w && !w.dead) WZ.bendAt(w.x, w.y, w.vx, w.vy, CFG.wizard.radius, u.bend);
  if (w && !w.dead && (u.chT = (u.chT || 0) - dt) <= 0) {   // the Wizard is near a node that is charging: he sees its % (R.drawWorld); counted for the ledger
    u.chT = 0.5;
    if (u.bld.some(b => b.type === 'node' && !b.up && b.ch > 0 && Math.hypot(b.x - w.x, b.y - w.y) < CFG.mode3.chargeR)) FA.fb('node-charge');
  }
  WZ.bendAt(u.rk.x, u.rk.y, u.rk.vx, u.rk.vy, 0.35, u.bend);   // (and his own, in his own world: the wilds' bending, into the underworld's map)
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
