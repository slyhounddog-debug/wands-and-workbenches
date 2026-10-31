'use strict';
// 4-PLAYER MODE (online only), the shared core. Two Builders and two Wizards in ONE factory and ONE wilds. Everything here is guarded by G.m4: with G.m4 unset nothing in this
// file runs and the 2-player game is exactly what it was.
//
// How a second Wizard / Builder fits into code that says "the Wizard" (G.w) and "the Builder" (G.bd) everywhere: by SWAPPING.
//  - Wizard: G.w holds the whole wilds AND the first Wizard's own fields. The second Wizard's own fields (WZ.PERS) live in G.w2, his wand in G.wand2, his garments in G.aug2.
//    WZ.sel(i) exchanges the two sets, so while wizard i is "selected" every function that reads G.w / G.wand / G.aug works on HIM. At rest (between frames, whenever a snapshot is
//    taken) the first Wizard is selected. WZ.as(i, fn) runs fn with wizard i selected and puts the selection back.
//  - Builder: G.bd / G.hands / G.selected / ... (FA.BPERS) are the first Builder's; the second one's are G.bd2 and G.bs2. FA.selB(i) / FA.asB(i, fn) work the same way.
//  - A snapshot is just G: plain data with two of each, so the guests need nothing else. A machine that wants to DRAW from seat s's point of view selects that seat first.
// Seats are fixed: 0 Builder 1, 1 Builder 2, 2 Wizard 1, 3 Wizard 2 (G.seats[s] = { role, n, name, col, who }).
const M4 = {};
M4.ROLE = ['B', 'B', 'W', 'W'];
M4.on = () => !!(G && G.m4);
M4.bi = s => (s === 1 ? 1 : 0);          // builder index of a Builder seat
M4.wi = s => (s === 3 ? 1 : 0);          // wizard index of a Wizard seat
M4.seatB = i => (i ? 1 : 0);             // seat of builder i
M4.seatW = i => (i ? 3 : 2);             // seat of wizard i
M4.me = () => (G && G.m4 && G.vi != null ? G.vi : 0);   // the seat this machine plays (set locally, before drawing and in the HUD)
M4.seat = s => (G && G.seats && G.seats[s]) || null;
M4.name = s => { const q = M4.seat(s); return q ? q.name : (s < 2 ? 'BUILDER' : 'WIZARD'); };
M4.col = s => { const q = M4.seat(s); return q ? q.col : '#ffffff'; };
// "COPPER the Wizard": the words every cue uses in 4P (it must say WHICH one)
M4.label = s => { const q = M4.seat(s); return q ? q.name + ' (' + (q.role === 'B' ? 'Builder ' : 'Wizard ') + q.n + ')' : ''; };
M4.wname = i => M4.name(M4.seatW(i));
M4.bname = i => M4.name(M4.seatB(i));

// ---------- the second Wizard ----------
// every field of G.w that is HIS (movement, health, rolls, statuses, the emote wheel...); everything else in G.w is the wilds and is shared
WZ.PERS = ['x', 'y', 'hp', 'armor', 'fx', 'fy', 'sx', 'sy', 'vx', 'vy', 'target', 'roll', 'rollCd', 'rdx', 'rdy', 'hurtT', 'moving', 'bob', 'shake', 'ghosts',
  'dead', 'deadT', 'deadHandled', 'ready', 'fireT', 'invisT', 'statT', 'statHits', 'ride', 'sg', 'wheel', 'emote', 'stk', 'kick', 'jump', 'blink', 'glowT', 'scorchT', 'burn',
  'heat', 'heatT', 'heatSeen', 'hurt', 'killer', 'lastHit', 'zSlow', 'slowT', 'slowAmt', 'zSrc', 'slowSrc', 'statBurn', 'mashT', 'mashAt', 'dig', 'rollBuf', 'heartT',
  'squashT', 'ghostT', 'trailT', 'dodgeAt', 'mutPopT', 'weakSfxT', 'phoenixT', 'hasteT'];
WZ.sIdx = 0;
WZ.flowB = null; WZ.flowCdB = 0;
WZ.swapP = function () {
  const a = G.w, b = G.w2, P = WZ.PERS;
  for (let i = 0; i < P.length; i++) { const k = P[i], t = a[k]; a[k] = b[k]; b[k] = t; }
  let t = G.wand; G.wand = G.wand2; G.wand2 = t;
  t = G.aug.worn; G.aug.worn = G.aug2.worn; G.aug2.worn = t;
  t = G.aug.cd; G.aug.cd = G.aug2.cd; G.aug2.cd = t;
  t = WZ.flow; WZ.flow = WZ.flowB; WZ.flowB = t;
  t = WZ.flowCd; WZ.flowCd = WZ.flowCdB; WZ.flowCdB = t;
};
WZ.sel = function (i) {
  i = i ? 1 : 0;
  if (!G || !G.w2 || WZ.sIdx === i) return;
  WZ.swapP(); WZ.sIdx = i; G.wi = i;   // (G.wi: which Wizard is selected, so a drawing can tell whose fields G.w holds)
};
WZ.as = function (i, fn) {
  if (!G || !G.w2) return fn();
  const p = WZ.sIdx; WZ.sel(i);
  try { return fn(); } finally { WZ.sel(p); }
};
WZ.pw = i => (!G || !G.w2 || (i ? 1 : 0) === WZ.sIdx ? G.w : G.w2);   // the object that holds wizard i's own fields right now
WZ.n = () => (G && G.w2 ? 2 : 1);
WZ.fresh2 = function () {
  const f = WZ.fresh(), o = {};
  for (const k of WZ.PERS) o[k] = f[k];
  o.x = SPAWN.x + 1.6; o.y = SPAWN.y + 0.6;
  return o;
};
// is wizard i up? (2P: the only one)
WZ.alive = i => !WZ.pw(i).dead;
WZ.anyAlive = () => (G.w2 ? !G.w.dead || !G.w2.dead : !G.w.dead);
// the run is over: 2P = the Wizard is dead; 4P = both are
WZ.over = () => (G.w2 ? G.w.dead && G.w2.dead : !!G.w.dead);
// the nearest living wizard to a point: index (or -1)
WZ.nearestW = function (x, y) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < WZ.n(); i++) { const p = WZ.pw(i); if (p.dead) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } }
  return best;
};
// run fn(i) once for each living wizard with that wizard selected
WZ.eachW = function (fn) {
  if (!G.w2) { if (!G.w.dead) fn(0); return; }
  for (let i = 0; i < 2; i++) if (!WZ.pw(i).dead) WZ.as(i, () => fn(i));
};

// ---------- the second Builder ----------
FA.BPERS = ['hands', 'carry', 'carryHold', 'selected', 'demolish', 'placeDir', 'lock', 'drag', 'lastFeet', 'pRepeat', 'mRepeat', 'ibuf', 'noThrow', 'fam', 'swapHold'];
FA.bIdx = 0;
FA.bsFresh = () => ({ hands: [], carry: null, carryHold: null, selected: 'hand', demolish: false, placeDir: 0, lock: null, drag: null, lastFeet: null, pRepeat: 0, mRepeat: 0, ibuf: null, noThrow: false, fam: {}, swapHold: 0 });
FA.swapB = function () {
  const t = G.bd; G.bd = G.bd2; G.bd2 = t;
  const P = FA.BPERS, s = G.bs2;
  for (let i = 0; i < P.length; i++) { const k = P[i], v = G[k]; G[k] = s[k]; s[k] = v; }
};
FA.selB = function (i) {
  i = i ? 1 : 0;
  if (!G || !G.bd2 || FA.bIdx === i) return;
  FA.swapB(); FA.bIdx = i; G.bi = i;
};
FA.asB = function (i, fn) {
  if (!G || !G.bd2) return fn();
  const p = FA.bIdx; FA.selB(i);
  try { return fn(); } finally { FA.selB(p); }
};
FA.nB = () => (G && G.bd2 ? 2 : 1);
FA.bd = i => (!G || !G.bd2 || (i ? 1 : 0) === FA.bIdx ? G.bd : G.bd2);

// ---------- selecting a seat (the machine's own view) ----------
// everything that draws or builds the HUD for seat s runs with that seat's characters selected
M4.asSeat = function (s, fn) {
  const wi = M4.ROLE[s] === 'W' ? M4.wi(s) : null, bi = M4.ROLE[s] === 'B' ? M4.bi(s) : null;
  const pw = WZ.sIdx, pb = FA.bIdx;
  if (wi != null) WZ.sel(wi); else if (G.w2) WZ.sel(M4.pairW(s));
  if (bi != null) FA.selB(bi); else if (G.bd2) FA.selB(M4.pairB(s));
  try { return fn(); } finally { WZ.sel(pw); FA.selB(pb); }
};
// the buddy of a seat: B1 and W1 are a pair, B2 and W2 are a pair (the picture-in-picture shows your buddy's world)
M4.pairW = s => (s === 1 || s === 3 ? 1 : 0);
M4.pairB = s => (s === 1 || s === 3 ? 1 : 0);
M4.pairSeat = s => (s < 2 ? M4.seatW(s) : M4.seatB(s - 2));

// words for the 4P cues: no cue says "the Wizard"; it names the Wizard it is about (the one selected when the cue is raised), or says "the Wizards" for the whole team
M4.words = t => (G && G.m4 && G.seats ? String(t).replace(/\b[Tt]he Wizard\b/g, M4.wname(G.wi || 0)) : t);
M4.W = () => (G && G.m4 ? 'Wizards' : 'Wizard');
M4.Wd = () => (G && G.m4 ? 'Wizards' : 'Wizard');
M4.sel0 = function () { WZ.sel(0); FA.selB(0); };   // back to rest (new game, snapshot, errors)

// ---------- helpers every world function can use (2P: they reduce to the one Wizard) ----------
M4.k = name => (G && G.m4 ? CFG.mode4[name] : 1);   // a 4P balance number (1 outside 4P)
WZ.allW = () => (G.w2 ? [WZ.pw(0), WZ.pw(1)] : [G.w]);              // each Wizard's own-fields object, first Wizard first (read and write his fields through it)
WZ.each2 = fn => { for (let i = 0, n = WZ.n(); i < n; i++) WZ.as(i, fn); };   // fn() once per Wizard (dead ones too: fn checks), with him selected
// distance from a point to the nearest living Wizard (2P: to THE Wizard, as it always was)
WZ.dmin = function (x, y) {
  if (!G.w2) return Math.hypot(G.w.x - x, G.w.y - y);
  let d = Infinity;
  for (const q of WZ.allW()) if (!q.dead) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
  return d;
};
// a living Wizard picked at random (index), -1 when both are down
WZ.pickLive = function () {
  const l = [0, 1].filter(i => WZ.n() > i && !WZ.pw(i).dead);
  return l.length ? l[Math.floor(Math.random() * l.length)] : -1;
};
// the second Wizard's own pass (called by the step right after WZ.update): movement, rolls, the wand, emotes, statuses; the wilds are not touched
WZ.update2 = function (dt, ix, iy, roll, rx, ry, act) {
  if (!G.w2) return;
  WZ.p2 = true;
  try { WZ.as(1, () => WZ.update(dt, ix, iy, roll, rx, ry, act)); } finally { WZ.p2 = false; }
};

// ---------- the wilds in 4P ----------
const reenter0 = WZ.reenter;
WZ.reenter = function () {   // a new expedition: both Wizards start again (the wand, garments and the shrines carry over as in 2P)
  if (!G.w2) return reenter0();
  WZ.sel(0);
  reenter0();
  G.w2 = WZ.fresh2();
};
// foes spawn round a random living Wizard; their health is the 4P number
const spawn0 = WZ.spawn;
WZ.spawn = function () {
  if (!G.w2) return spawn0();
  const i = WZ.pickLive();
  if (i >= 0) WZ.as(i, spawn0);
};
const makeEnemy0 = WZ.makeEnemy;
WZ.makeEnemy = function (type, x, y, elite) {
  const e = makeEnemy0(type, x, y, elite);
  if (G.m4 && !G.menu) { const k = CFG.mode4.hp; e.maxHp *= k; e.hp = e.maxHp; }
  return e;
};
const mult0 = WZ.mult;
WZ.mult = function () { return mult0.apply(null, arguments) * (G.m4 && WZ.ctx ? CFG.mode4.dmg : 1); };
// events play out round a Wizard picked when the event starts
const evTick0 = WZ.evTick;
WZ.evTick = function (dt) {
  if (!G.w2 || !G.ev) return evTick0(dt);
  let fw = G.ev.fw;
  if (fw == null || WZ.pw(fw).dead) fw = G.ev.fw = Math.max(0, WZ.pickLive());
  WZ.as(fw, () => evTick0(dt));
};
// the spell portal's chunk of the eggs, spawn spots and so on look at "the Wizard": pick one
for (const fn of ['spawnSpot', 'allySpot']) {
  const f0 = WZ[fn];
  WZ[fn] = function () {
    if (!G.w2) return f0.apply(null, arguments);
    const i = WZ.pickLive();
    return WZ.as(Math.max(0, i), () => f0.apply(null, arguments));
  };
}

// ---------- a delivered spell is physical in 4P: it lands in the wilds and whoever walks onto it casts it ----------
const incoming0 = WZ.incoming;
WZ.incoming = function (spell) {
  if (!G.w2 || G.menu) return incoming0(spell);
  const live = [0, 1].filter(i => !WZ.pw(i).dead);
  if (!live.length) return;
  const n = G.w.spellN = (G.w.spellN || 0) + 1, i = live[n % live.length], q = WZ.pw(i);
  const s = WZ.dryNear(q.x, q.y, 20, [2.2, 4]) || [q.x, q.y], kind = Object.keys(BASIC_SPELL).find(k => BASIC_SPELL[k] === spell) || spell;
  G.w.pickups.push({ kind, spell, x: s[0], y: s[1], z: 0.5, t: 0, for: i });
  WZ.ring(s[0], s[1], 0.9, SPELL_COL[spell] || '#ffffff', 0.3); AU.sfx('portalDrop');
  FA.fb('spell-land');
};
WZ.spellPickup = function (p) { FA.fb('spell-grab'); incoming0(p.spell); };   // (the Wizard who walked onto it is the selected one)
// a spell nobody picked up in time casts for the nearest living Wizard, so nothing is wasted
M4.spellTick = function () {
  const w = G.w;
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    const p = w.pickups[i];
    if (!p.spell || p.z > 0 || p.t < CFG.mode4.spellHold) continue;
    const wi = WZ.nearestW(p.x, p.y);
    w.pickups.splice(i, 1);
    if (wi >= 0) WZ.as(wi, () => incoming0(p.spell));
  }
};

// ---------- the 4P balance table (CFG.mode4) ----------
for (const [obj, fn, mode] of [[WZ, 'dropMul', 'drops'], [WZ, 'gemMul', 'drops'], [WZ, 'coreChance', 'drops']]) {   // every drop chance x CFG.mode4.drops
  const f0 = obj[fn];
  obj[fn] = function () { return f0.apply(null, arguments) * (G && G.m4 ? CFG.mode4[mode] : 1); };
}
{ const cycle0 = FA.cycle; FA.cycle = b => cycle0(b) / (G && G.m4 ? CFG.mode4.outputs : 1); }       // Harnessers: x outputs faster
{ const craft0 = FA.craftMul; FA.craftMul = () => craft0() * (G && G.m4 ? CFG.mode4.outputs : 1); }  // crafters: x outputs faster

// ---------- garments: a second copy of each can be forged in 4P ----------
// how many copies of garment id exist anywhere (worn by either Wizard, in the Stockpile, hands, belts, flights, the wilds)
FA.augCopies = function (id) {
  const k = 'aug_' + id, f = G.fac, cnt = a => a.filter(o => o && o.kind === k).length;
  let n = (G.aug.worn[AUGS[id].slot] === id ? 1 : 0) + (G.aug2 && G.aug2.worn[AUGS[id].slot] === id ? 1 : 0);
  n += (G.stock[k] || 0) + f.outQ.filter(x => x === k).length + cnt(f.rejs) + f.bld.reduce((s, b) => s + (b.ck === k ? b.cn : 0) + cnt(b.out), 0);
  n += cnt(G.hands) + (G.bs2 ? cnt(G.bs2.hands) : 0) + cnt(f.floor) + cnt(f.flying) + cnt(f.portalQ) + f.belts.filter(b => b.item && b.item.kind === k).length;
  if (G.w) n += cnt(G.w.arcs) + cnt(G.w.pickups) + cnt(G.w.drops);
  return n;
};

// ---------- the starting factory in 4P ----------
// a second Harnesser right beside the first, feeding the same belt; each Harnesser starts on an element of one Wizard's attunement (W1's -> the first, W2's -> the second)
M4.setupFactory = function () {
  const f = G.fac, hs = f.bld.filter(b => b.type === 'harness');
  if (!hs.length) return;
  const h1 = hs[0];
  let h2 = hs[1];
  if (!h2) {
    const x = h1.x, y = h1.y + 1;
    if (FA.owned(x, y) && !f.grid[y * f.w + x]) {
      h2 = FA.makeBuilding('harness', x, y, true, false, 0);
      if (!f.grid[y * f.w + x + 1]) FA.addBelt(x + 1, y, 3);   // one belt north, onto the first Harnesser's line
    }
  }
  const a = (G.seats[2] && G.seats[2].att) || ['air', 'water'], b = (G.seats[3] && G.seats[3].att) || ['fire', 'earth'];
  h1.el = a[0]; h1.grow = CFG.harness.growT;
  if (h2) { h2.el = b[0] === a[0] ? b[1] : b[0]; h2.grow = CFG.harness.growT; }
};

// ---------- identity in the cues ----------
{
  const threat0 = FA.threat;   // a danger at the Spell Portal says which Wizard met it
  FA.threat = function (els, ic, n) { return threat0.call(FA, els, ic, G && G.m4 && G.w2 ? M4.wname(G.wi || 0) + ': ' + n : n); };
  const shrine0 = WZ.shrineActivate;   // a shrine woken says who woke it
  WZ.shrineActivate = function (m, s) {
    shrine0(m, s);
    if (G.m4) { UI.toast(M4.wname(G.wi || 0) + ' woke the ' + ELEM_WORD[m.el] + ' Shrine', 'L', m.el); FA.fb('boost-who'); }
  };
}
