'use strict';
// Game flow: loading -> studio intro -> the living menu world (js/menu.js) -> the start sequence -> play. Input routing, save/load, main loop, test hook.
const Main = {};
let STATE = 'loading';
let ctx = null;

// ---------- stage scaling ----------
function fit() {
  const st = $('stage'), k = Math.min(window.innerWidth / CFG.W, window.innerHeight / CFG.H);
  st.style.transform = 'translate(' + (window.innerWidth - CFG.W * k) / 2 + 'px,' + (window.innerHeight - CFG.H * k) / 2 + 'px) scale(' + k + ')';
}
window.addEventListener('resize', fit);

// ---------- new / load / save ----------
const SAVE_VERSION = 4;
const TREE_VERSION = 2;   // v2: spells and creatures left the skill tree (Main.refundTree gives back what was spent on every removed node)
const QUEST_VERSION = 6;   // v6 re-sequenced the Builder goals around building things with elements (each carried-over goal has v5 = its old index: Main.questOf); v5 split the single goal chain into two tracks, Builder and Wizard (Main.splitQuest); v2 inserted goals 14-15 (landmark, logistics): older saves past goal 13 shift by 2; v3 inserted the recharge goal at 7 and dropped "power the factory" (old 11): old goals 7-11 shift by 1; v4 inserted the first-creature-kill goal at 5 and the two Stronghold goals before Summoning: goals from the old 5 shift by 1, from the old 21 (Summoning) by 3
// the Stockpile: the starting materials, and a count (0) for every other resource (shards, Cores, element Cores, Ward Keys) and element packet
function blankStock() {
  const s = { wood: CFG.start.wood, stone: CFG.start.stone, iron: CFG.start.iron, air: 0, water: 0, fire: 0, earth: 0 };
  for (const k in RES) if (s[k] === undefined) s[k] = 0;
  return s;
}
function blankState(slot) {
  return {
    slot, xp: 0, tree: {}, stock: blankStock(), fam: {}, pinBp: false,
    bank: {}, bankTotal: 0,
    credits: { battery: 0, heavybat: 0 },
    stats: { deliveries: 0, kills: 0, harvested: 0, xpEarned: 0, packets: 0, banked: {}, time: 0, elites: 0, shards: 0, landmarks: 0, wins: 0, crafted: 0, craftedKills: 0, events: 0, eventsFailed: 0, keeps: 0, sent: {}, made: {} },
    flags: {}, quest: { B: 0, W: 0 }, qbase: { B: null, W: null }, bankLog: [], pins: { L: null, R: null }, lock: null,
    altar: WZ.altarFresh(), aug: WZ.augFresh(), hold: { on: false, spell: null },   // the Summoning Altar (where it stands, which sockets are lit)   // what he wears and which keeps are open, and the held-spell slot (unlocked by the first Warden)
    hands: [], swapped: false, ctl: Object.assign({}, Players.ctl), selected: 'hand', demolish: false, placeDir: 0, paused: false,
    saveT: 0, swapHold: 0, swapCd: 0, drag: null, lastFeet: null, lastInput: 'kb', helpT: 0, pRepeat: 0, mRepeat: 0,
  };
}
Main.newGame = function (slot) {
  G = blankState(slot);
  G.w = WZ.fresh();
  G.ev = WZ.evFresh(0);
  FA.initial();
  const intro = Main.introPending;
  Main.enter();
  if (!intro) { UI.help(true); G.helpT = 25; }
  Main.save();
};
Main.loadGame = function (slot, useBak) {
  const s = UI.slotInfo(slot, useBak);
  if (!s || s.old) return;
  try { Main.applySave(slot, s); }
  catch (e) {
    if (!useBak && UI.slotInfo(slot, true)) { UI.err('Save in slot ' + slot + ' would not load (' + e.message + '): loaded the backup instead'); Main.loadGame(slot, true); return; }
    UI.err('Could not load slot ' + slot + ': ' + e.message);
    Main.toTitle(true);
    return;
  }
  if (s.fromBak) UI.err('The save in slot ' + slot + ' was damaged: loaded the last good backup');
};
Main.applySave = function (slot, s) {
  G = blankState(slot);
  // XP is whole gems now: old fractional saves round down
  G.xp = Math.floor(s.xp || 0); G.tree = s.tree || {}; G.stock = Object.assign(G.stock, s.stock || {});
  G.bank = s.bank || {}; G.bankTotal = s.bankTotal || 0;
  G.credits = Object.assign(G.credits, s.credits || {});
  G.credits.battery = (G.credits.battery || 0) + (G.credits.station || 0) + (G.credits.charger || 0); delete G.credits.station; delete G.credits.charger;
 G.stats = Object.assign(G.stats, s.stats || {});
  G.flags = s.flags || {}; G.quest = Main.questOf(s); G.placeDir = s.placeDir || 0;
  // the Wizard's gear: an old save has none (everything defaults to empty). A save that already captured a Stronghold gets the glow-up and the spell slot silently (no animation)
  G.aug = WZ.augFix(s.aug);
  G.altar = WZ.altarFix(s.altar);
  // there is one Stronghold and one Warden now: an older save that claimed any keep has killed the Warden. Warden Cores are gone (no longer a currency), and each
  // old per-element Ward Key comes back as what it was forged from
  if (ELEMS.some(el => G.flags['core_' + el])) G.flags.warden = true;
  for (const el of ELEMS) { delete G.flags['core_' + el]; const n = G.stock['key_' + el] | 0; if (n > 0) { G.stock['core_' + el] = (G.stock['core_' + el] || 0) + 4 * n; G.stock.iron += 2 * n; G.stock.shard += n; } delete G.stock['key_' + el]; }
  delete G.stock.core;
  const captured = (G.stats.keeps || 0) > 0 || !!G.flags.warden;
  if (captured) G.flags.glow = true;
  G.hold = { on: !!(G.flags.glow || (s.hold && s.hold.on)), spell: s.hold && SPELL_COL[s.hold.spell] ? s.hold.spell : null };
  if (G.hold.on) G.flags.glow = true;
  if (!G.hold.on) G.hold.spell = null;
  if (s.qbase && typeof s.quest === 'object') G.qbase = Object.assign(G.qbase, s.qbase);   // null = measured from when the goal first shows
  if ((s.qv || 1) < 6) G.qbase.B = null;   // the Builder's goals moved: its old baseline belonged to another goal
  G.refund = Main.refundTree();   // spells, creatures and other removed nodes: what they cost comes back (toasted in Main.enter)
  G.bankLog = Array.isArray(s.bankLog) ? s.bankLog.filter(k => ITEMS[k]) : [];
  G.pins = Object.assign({ L: null, R: null }, s.pins || {}); G.pinBp = !!s.pinBp;
  for (const side of ['L', 'R']) if (G.pins[side] && !CFG.tree.some(n => n.id === G.pins[side])) G.pins[side] = null;   // a pin on a node that no longer exists
  // the hands: one pile of single items, bottom first. Older saves held one stack { kind, n } (and for a moment a queue of them): expand them in order.
  let looseBat = 0;   // Battery items were dropped (the Battery is a building now): each one a save still has comes back as a free Battery placement
  G.hands = [].concat(s.hands || [], Array.isArray(s.handQ) ? s.handQ : []).filter(h => { if (h && h.kind === 'battery') looseBat += h.n || 1; return h && ITEMS[h.kind]; }).reduce((a, h) => { for (let i = 0; i < (h.n || 1); i++) a.push({ kind: h.kind }); return a; }, []);
  G.w = WZ.fresh();
  G.ev = WZ.evFresh(s.ev && s.ev.n || 0);
  FA.fromJSON(s.fac || {});
  if (G.flags.recharged) G.flags.fed = true;   // the old "recharge the spare Battery" goal is the new "feed the Battery" one
  // an old save's wardrobe: garments he owned but was not wearing go on the Wardrobe Shelf, Offerings he carried come back as Cores
  if (G.aug.legacyOwn) { for (const id of G.aug.legacyOwn) G.stock['aug_' + id] = Math.max(1, G.stock['aug_' + id] || 0); delete G.aug.legacyOwn; }
  if (G.aug.legacyOff) { for (const el in G.aug.legacyOff) G.stock['core_' + el] += G.aug.legacyOff[el]; delete G.aug.legacyOff; }
  looseBat += FA.lostBat;
  if (looseBat) G.credits.battery += looseBat;
  G.bd = FA.freshBuilder();
  if (s.bd && FA.owned(Math.floor(s.bd.x + FA.lastShift.dx), Math.floor(s.bd.y + FA.lastShift.dy))) { G.bd.x = s.bd.x + FA.lastShift.dx; G.bd.y = s.bd.y + FA.lastShift.dy; }
  while (G.hands.length > FA.cap()) { const it = G.hands.shift(); FA.dropAt(it.kind, G.bd.x, G.bd.y); }   // an old save held more than the pile allows: the extras go on the floor
  Main.enter();
};
// older saves had ONE goal chain (an index): bring it up to the v4 numbering, then hand each track the first of its goals
// that continues an old goal that was still open (goals with no `from` are new, so they are skipped rather than redone)
// What each node that no longer exists cost, as [XP, banked spells, Warden Cores]: a save that owns one gets all of it back on load, and the key is dropped.
const REMOVED_NODES = {
  spawn2: [50, { air: 8, water: 8, fire: 8 }], spawn3: [105, { air: 10, water: 10, fire: 10, earth: 10 }, 1],
  flamethrower: [31, { air: 11, fire: 12 }], tempest: [31, { air: 11, water: 12 }], steam: [31, { fire: 11, water: 12 }], sandstorm: [31, { air: 11, earth: 12 }],
  magma: [31, { fire: 11, earth: 12 }], mud: [31, { water: 11, earth: 12 }],
  meteor: [63, { air: 10, fire: 10, earth: 10, flamethrower: 1, magma: 1 }], thunder: [63, { air: 10, fire: 10, water: 10, tempest: 1, flamethrower: 1 }],
  blizzard: [63, { air: 10, water: 10, earth: 10, mud: 1, tempest: 1 }], geyser: [63, { fire: 10, water: 10, earth: 10, steam: 1, magma: 1 }],
  nova: [147, { air: 25, fire: 25, water: 25, earth: 30, meteor: 1, thunder: 1, blizzard: 1, geyser: 1 }],
  cr_phoenix: [30, { fire: 6, air: 6 }], cr_thunderhead: [30, { air: 6, water: 6 }], cr_lavagolem: [30, { fire: 6, earth: 6 }], cr_shambler: [30, { water: 6, earth: 6 }],
  cr_dragon: [60, { air: 8, fire: 8, earth: 8 }], cr_leviathan: [60, { air: 8, fire: 8, water: 8 }], cr_titan: [60, { fire: 8, water: 8, earth: 8 }],
  // nodes removed in earlier passes (the Harnesser unlocks and Factory Expansion) that older saves may still carry
  water: [14, { air: 4 }], fire: [21, { air: 8, water: 8 }], earth: [31, { air: 5, water: 5, fire: 5 }],
};
const REMOVED_EXPAND = [[21, { air: 8 }], [31, { air: 11, water: 11 }], [46, { air: 11, water: 11, fire: 11 }], [59, { air: 14, fire: 14, earth: 14, sandstorm: 1 }],
  [74, { air: 13, water: 13, fire: 13, earth: 13, blizzard: 1, thunder: 1 }], [91, { air: 16, water: 16, fire: 16, earth: 16, meteor: 1, geyser: 1 }]];   // tier 1..6 of Factory Expansion
Main.refundTree = function () {
  const back = { xp: 0, core: 0, bank: {} };
  const give = (xp, pay, core) => { back.xp += xp; back.core += core || 0; for (const k in pay) back.bank[k] = (back.bank[k] || 0) + pay[k]; };
  for (const id in G.tree) {
    if (REMOVED_NODES[id]) { give(...REMOVED_NODES[id]); delete G.tree[id]; if (G.tree[id] === undefined && SPELL_INFO[id]) G.stats.made[id] = Math.max(1, G.stats.made[id] || 0); }
    else if (id === 'expand') { for (let i = 0; i < Math.min(REMOVED_EXPAND.length, +G.tree.expand || 0); i++) give(...REMOVED_EXPAND[i]); delete G.tree.expand; }
  }
  if (!back.xp && !back.core && !Object.keys(back.bank).length) return null;
  G.xp += back.xp;   // (Warden Cores are no longer a currency: the one a removed node cost is not handed back)
  for (const k in back.bank) G.bank[k] = (G.bank[k] || 0) + back.bank[k];
  return back;
};
Main.splitQuest = function (old) {
  const at = side => { const i = QUESTS[side].findIndex(q => q.from != null && q.from >= old); return i < 0 ? QUESTS[side].length : i; };
  return { B: at('B'), W: at('W') };
};
Main.questOf = function (s) {
  if (s.quest && typeof s.quest === 'object') {
    let B = s.quest.B | 0;
    if ((s.qv || 1) < 6) { const i = QUESTS.B.findIndex(q => q.v5 != null && q.v5 >= B); B = i < 0 ? QUESTS.B.length : i; }   // resume at the first goal that continues the old one
    return { B, W: s.quest.W | 0 };
  }
  let q = s.quest || 0;
  const v = s.qv || 1;
  if (v < 2 && q >= 13) q += 2;
  if (v < 3 && q >= 6 && q <= 10) q += 1;
  if (v < 4) { if (q >= 20) q += 3; else if (q >= 4) q += 1; }
  return Main.splitQuest(q);
};
// a save that parses and has the essentials (used to decide what's safe to keep as the backup)
Main.saveOk = s => !!s && s.v >= 4 && !!s.fac && !!s.stock && isFinite(s.xp);
// the Stockpile for a save: shards, Cores, the Warden Key, garments and the factory's overflow still lying in the wilds count as banked, and so does whatever is still
// flying home (a save with more than the Stockpile holds spills the rest onto the floor when it loads: FA.pileSync)
Main.stockSaved = function () {
  const st = Object.assign({}, G.stock), add = (k, n) => { st[k] = (st[k] || 0) + n; };
  if (G.w) for (const d of G.w.drops) if (WZ.keepDrop(d) && FA.storable(d.kind)) add(d.kind, d.val || 1);
  for (const id of WZ.looseGarments()) add('aug_' + id, 1);
  const fl = FA.inFlight();
  for (const k in fl) add(k, fl[k]);
  return st;
};
Main.facSaved = () => FA.toJSON();
Main.save = function () {
  if (!G || Net.role === 'guest') return;   // (the guest holds a copy of the host's state: it writes no save)
  const key = 'wands2_save_slot' + G.slot;
  try {
    // shards still lying in the wilds count as banked in the save, so quitting mid-run never loses them
    const stockSaved = Main.stockSaved();
    const data = JSON.stringify({
      v: SAVE_VERSION, qv: QUEST_VERSION, tv: TREE_VERSION, xp: G.xp, tree: G.tree, stock: stockSaved, ev: { n: G.ev ? G.ev.n : 0 }, bank: G.bank, bankTotal: G.bankTotal, credits: G.credits, stats: G.stats,
      flags: G.flags, quest: G.quest, qbase: G.qbase, hands: G.hands, placeDir: G.placeDir, bd: { x: G.bd.x, y: G.bd.y }, fac: Main.facSaved(), at: Date.now(),
      bankLog: (G.bankLog || []).slice(-CFG.bankUndoMax), pins: G.pins, pinBp: G.pinBp, aug: G.aug, hold: G.hold, altar: G.altar,
    });
    if (!Main.saveOk(JSON.parse(data))) throw new Error('the new save failed its own check');
    // rolling backup: the save we're about to replace becomes the backup, if it was good
    const prev = localStorage.getItem(key);
    if (prev) { let ok = false; try { ok = Main.saveOk(JSON.parse(prev)); } catch (e) { ok = false; } if (ok) localStorage.setItem(key + '_bak', prev); }
    localStorage.setItem(key, data);
  } catch (e) {
    if (!Main.saveErrAt || Date.now() - Main.saveErrAt > 30000) { Main.saveErrAt = Date.now(); UI.err('Autosave failed: ' + e.message); }
  }
};
Main.enter = function () {
  STATE = 'play'; Main.still = 0; Main.drawSig = null;
  UI.splitB = null; UI.show('splitModal', false); UI.askB = null; UI.show('askModal', false);
  UI.resetCache();
  UI.show('game', !Main.introPending);   // (the start sequence plays on the bare canvas; the HUD fades in when it is over)
  UI.show('pause', false); UI.show('results', false); UI.help(false);
  UI.openTree('L', false); UI.openTree('R', false);
  Book.close(true);
  UI.buildHotbar();
  UI.show('victory', false);
  R.fcam.x = G.bd.x; R.fcam.y = G.bd.y; R.wcam.x = G.w.x; R.wcam.y = G.w.y;
  Main.metrics = { t: 0, next: 0, samples: [] };
  Main.helpFoot();
  AU.music(true); AU.hold(false);
  if (Main.introPending) { Main.introPending = false; Main.makeIntro(); }
  if (G.refund) {   // a save that owned skill-tree nodes that no longer exist: say what came back
    const r = G.refund; G.refund = null;
    const msg = 'Skill tree changed: refunded ' + r.xp + ' XP' + (Object.keys(r.bank).length ? ' and ' + Object.values(r.bank).reduce((a, n) => a + n, 0) + ' banked spells' : '') + (r.core ? ' and a Warden Core' : '') + '. Spells and creatures are in the Collection Book now.';
    UI.toast(msg, 'L', 'ic_xp'); UI.toast(msg, 'R', 'ic_xp'); UI.changed();
  }
};
// the controls card's footer: which controller plays which job
Main.helpFoot = function () {
  const c = G.ctl, el = document.querySelector('#help .hfoot');
  if (!el) return;
  const pb = c.pb >= 0 ? 'Pad ' + (c.pb + 1) : '', pw = c.pw >= 0 ? 'Pad ' + (c.pw + 1) : '';
  el.innerHTML = UI.img('ic_pad', 16) + ' ' + (pb ? pb + ' = Builder (A pick up / place, B throw, X use, LB/RB slot, RT next in a family, Back demolish). ' : '') +
    (pw ? pw + ' = Wizard (A roll). ' : '') + '<kbd>H</kbd> hides this.';
};
// Back to the title: the living menu world. From a running game the Builder is sucked up into a portal, the factory slides away, he drops back into the Wizard's world,
// both are teleported to the start of the wilds and the main menu's plates pop up (Main.exitFrame / Menu.retTick). noSave / instant skip the show.
Main.toTitle = function (noSave, instant) {
  DevBot.set(null); Book.close(true);
  const g = G, show = !noSave && !instant && STATE === 'play' && g && g.fac && !g.menu && !g.intro && Net.role !== 'guest';
  if (!noSave && G && Net.role !== 'guest' && !G.menu) { WZ.bankLooseShards(); Main.save(); }
  if (Net.role) Net.close();   // an online session ends with the game (the host's save is already written, the guest has none)
  Main.netUi(null);
  UI.show('pause', false); UI.show('results', false); UI.show('victory', false);
  UI.splitB = null; UI.show('splitModal', false); UI.askB = null; UI.show('askModal', false);
  UI.show('game', false);
  Main.introPending = false;
  if (show) { Main.xs = { g, t: 0 }; STATE = 'exit'; g.paused = false; g.outro = { t0: 0 }; R.focus = null; R.hint = null; R.whint = null; R.aim = null; R.ghost = null; R.demo = null; return; }
  Main.openMenu();
};
// the front door: a fresh living menu world
Main.openMenu = function (ret) {
  STATE = 'menu';
  UI.show('game', false);
  G = Menu.make(ret);
  AU.music(true); AU.hold(false);
};

// ---------- controls ----------
const KV = (l, r, u, d) => [(IN.down(r) ? 1 : 0) - (IN.down(l) ? 1 : 0), (IN.down(d) ? 1 : 0) - (IN.down(u) ? 1 : 0)];
const clampv = v => Math.max(-1, Math.min(1, v));
Main.viewW = () => (Net.on ? CFG.W : CFG.HALF);   // the width of the Builder's world on screen: half the stage side by side, all of it online
const overPip = () => { const p = R.pipRect, m = IN.mouse; return !!(Net.on && p && m.x >= p.x && m.x < p.x + p.w && m.y >= p.y && m.y < p.y + p.h); };
const mouseInFactory = () => IN.mouse.moved && IN.mouse.x >= 0 && IN.mouse.x < Main.viewW() && IN.mouse.y > 0 && IN.mouse.y < 800 && !overPip();

function hoverPoint(view) { return R.toTile(view, IN.mouse.x, IN.mouse.y); }
function hoverTile(view) { const t = hoverPoint(view); return [Math.floor(t[0]), Math.floor(t[1])]; }
// the tile directly in front of the Builder (snapped to the dominant grid axis)
function frontTile() {
  const bd = G.bd, ax = Math.abs(bd.fx) >= Math.abs(bd.fy);
  const dx = ax ? Math.sign(bd.fx) : 0, dy = ax ? 0 : Math.sign(bd.fy);
  return [Math.floor(bd.x) + dx, Math.floor(bd.y) + dy];
}
// who plays what on the keyboard (G.ctl, picked on the player screen): a keyboard that has BOTH jobs is split WASD+mouse / arrows (G.swapped
// flips them); one that has a single job takes either layout. The mouse belongs to the Builder, or to a Wizard who has the keyboard alone.
Main.kbShared = () => G.ctl.kbB && G.ctl.kbW;
Main.mouseB = () => G.ctl.kbB && !(Main.kbShared() && G.swapped);
Main.mouseW = () => G.ctl.kbW && (!G.ctl.kbB || G.swapped);
Main.altB = () => G.ctl.kbB && (!G.ctl.kbW || G.swapped);   // the Builder may use the . , / keys
Main.padB = () => (G.ctl.pb >= 0 ? IN.pad[G.ctl.pb] : null);
Main.padW = () => (G.ctl.pw >= 0 ? IN.pad[G.ctl.pw] : null);
const useMouseAim = () => G.lastInput === 'mouse' && mouseInFactory() && Main.mouseB();
// where a throw would land right now: the cursor with the mouse, otherwise auto-aim along the Builder's facing
function aimNow() {
  if (useMouseAim()) { const [px, py] = hoverPoint(R.fv); return FA.throwTarget(px, py); }
  return FA.throwTarget();
}
// every throw lands exactly where the lead line on screen points (R.aim, refreshed each frame)
function throwAlongAim() {
  if (!G.hands.length || G.bd.gather || G.noThrow) return;
  const a = R.aim || aimNow();
  if (a) FA.throwOne(a.x, a.y);
}

function handleMouseFactory(dt) {
  const m = IN.mouse;
  if (!Main.mouseB() || !mouseInFactory() || UI.treeOpen.L || UI.treeOpen.R) { if (!m.l) G.drag = null; return; }
  const [tx, ty] = hoverTile(R.fv), [px, py] = hoverPoint(R.fv);
  const sel = G.selected, bd = G.bd;
  // right mouse: throw along the lead line (hold = rapid), or cancel the current tool
  if (m.r && G.hands.length && !IN.shift() && !(bd.burst > 0)) throwAlongAim();
  else if (m.rp && !(IN.shift() && G.hands.length)) { if (G.demolish) G.demolish = false; else if (sel !== 'hand') UI.select('hand'); }
  if (m.lp) {
    if (G.demolish) FA.demolish(tx, ty);
    else if (sel === 'hand') {   // left click picks up: walk to the thing under the cursor and take one
      const thing = FA.thingAt(tx, ty, px, py);
      G.mRepeat = CFG.pickRepeat * 1.5;
      if (thing) { bd.then = thing; bd.target = { x: thing.x, y: thing.y }; }
      else if (FA.owned(tx, ty)) { bd.then = null; bd.target = { x: px, y: py }; }
      bd.stuckT = 0;
    } else if (sel === 'belt') {
      FA.placeBelt(tx, ty, G.placeDir);
      G.drag = { x: tx, y: ty };
    } else if (!FA.place(sel, tx, ty, G.placeDir) && FA.inb(tx, ty) && FA.unlocked(sel)) {
      UI.toast(sel === 'expand' ? 'Floor Tiles go on empty ground right beside the floor.' : sel === 'stockpile' ? 'Stockpile Tiles go on an empty floor tile.' : FA.isPile(tx, ty) ? 'Nothing can be built on a Stockpile tile (demolish it first).' : !FA.owned(tx, ty) ? 'There is no floor there: add Floor Tiles first.' : 'That tile is taken.', 'L', 'ic_x'); AU.sfx('error');
    }
  } else if (m.l && sel === 'hand' && !G.demolish && !bd.target) {   // hold to keep taking
    G.mRepeat -= dt;
    // with something in hand, holding sweeps up the same kind nearby; empty-handed it repeats on the hovered thing
    const thing = G.mRepeat <= 0 && (G.hands.length ? FA.sweepTarget(FA.topKind()) : FA.thingAt(tx, ty, px, py));
    if (thing && FA.distTo(thing) < CFG.reach + 0.5) {
      const a = FA.actionFor(thing, 'pick');
      if (a.fn && a.rep) a.fn();
      G.mRepeat = G.hands.length ? CFG.sweepRepeat : CFG.pickRepeat;
    }
  } else if (m.l && sel === 'belt' && G.drag && !G.demolish) {
    if ((tx !== G.drag.x || ty !== G.drag.y) && FA.inb(tx, ty)) {
      const dx = tx - G.drag.x, dy = ty - G.drag.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const dir = dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
        const prev = FA.cell(G.drag.x, G.drag.y);
        if (prev && prev.type === 'belt') prev.dir = dir;
        G.placeDir = dir;
      }
      FA.placeBelt(tx, ty, G.placeDir);
      G.drag = { x: tx, y: ty };
    }
  }
  if (!m.l) G.drag = null;
}

function handleMouseWizard() {
  const m = IN.mouse;
  if (!Main.mouseW() || !m.moved || m.x < CFG.HALF || !m.l || UI.treeOpen.L || UI.treeOpen.R) return;
  const [px, py] = hoverPoint(R.wv);
  G.w.target = { x: Math.max(0.5, Math.min(CFG.WW - 0.5, px)), y: Math.max(0.5, Math.min(CFG.WH - 0.5, py)) };
}

// returns true if it did something; quiet = don't complain yet (the input buffer will retry)
function placeInFront(quiet) {
  const [tx, ty] = frontTile(), sel = G.selected;
  if (G.demolish) { FA.demolish(tx, ty); return true; }
  if (sel === 'hand') { UI.toast('Pick a building first (1 to 8 or LB/RB).', 'L', 'ic_hand'); return true; }
  if (!FA.unlocked(sel) && sel !== 'belt') { FA.place(sel, tx, ty, G.placeDir); return true; }   // says what to unlock
  if (sel === 'belt' ? FA.placeBelt(tx, ty, G.placeDir) : FA.place(sel, tx, ty, G.placeDir)) return true;
  if (!quiet) { FA.ipop(tx + 0.5, ty + 0.5, [['ic_x']]); AU.sfx('error'); }
  return false;
}

// the tile R would turn: under the mouse, else in front of the Builder, else the belt / machine the use button is aimed at
const frozenNow = () => !!(UI.treeOpen.L || UI.treeOpen.R || Main.graceT > 0);
function rotateTile() {
  if (G.lastInput === 'mouse' && mouseInFactory()) return hoverTile(R.fv);
  const f = frontTile(), c = FA.cell(f[0], f[1]);
  if (c && c.type !== 'portal') return f;
  const u = G.selected === 'hand' && FA.findTarget('use');
  return u && (u.kind === 'belt' || u.kind === 'bld') ? [Math.floor(u.x), Math.floor(u.y)] : null;
}

Main.splitNav = { dx: 0, t: 0 };
Main.controls = function (dt) {
  const p0 = Main.padB(), p1 = Main.padW(), c = G.ctl, sh = Main.kbShared(), altB = Main.altB();
  const wasd = KV('KeyA', 'KeyD', 'KeyW', 'KeyS'), arrows = KV('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown');
  const either = [clampv(wasd[0] + arrows[0]), clampv(wasd[1] + arrows[1])], none = [0, 0];
  const bk = !c.kbB ? none : sh ? (G.swapped ? arrows : wasd) : either, wk = !c.kbW ? none : sh ? (G.swapped ? wasd : arrows) : either;
  let bix = clampv(bk[0] + (p0 ? p0.ix : 0)), biy = clampv(bk[1] + (p0 ? p0.iy : 0));
  let wix = clampv(wk[0] + (p1 ? p1.ix : 0)), wiy = clampv(wk[1] + (p1 ? p1.iy : 0));
  let wrx = p1 ? p1.rx || 0 : 0, wry = p1 ? p1.ry || 0 : 0;   // the Wizard's right stick: where a Tempest Tear aims
  if (bk[0] || bk[1]) G.lastInput = 'kb';
  if (p0 && (p0.ix || p0.iy || p0.any)) G.lastInput = 'pad';
  if (IN.mouse.mv) G.lastInput = 'mouse';
  R.padMode = G.lastInput === 'pad';

  // Builder: left-click / A picks up, right-click / B throws, E / X uses (swapped keyboard: . pick, , throw, / use)
  // F (Shift + F = backwards) / LT + X on a pad switches the element of the Harnesser in reach
  const swapEl = (c.kbB && IN.hit('KeyF')) || (p0 && p0.x && p0.ltHeld);
  let use = (c.kbB && !(sh && G.swapped) && IN.hit('KeyE')) || (altB && IN.hit('Slash')) || (p0 && p0.x && !p0.ltHeld);
  let pick = (altB && IN.hit('Period')) || (p0 && p0.a && !p0.ltHeld);
  const pickHeld = (altB && IN.down('Period')) || (p0 && p0.aHeld && !p0.ltHeld);
  // Tumble (a skill-tree track): the Builder's dodge roll, in the Wizard's input language: Space (Right Shift when the keyboard is swapped, Space is the Wizard's then), LT + A on a pad
  let broll = (c.kbB && ((sh && !G.swapped) || !c.kbW) && IN.hit('Space')) || (c.kbB && sh && G.swapped && IN.hit('ShiftRight')) || (p0 && p0.a && p0.ltHeld);
  const throwHeld = (altB && IN.down('Comma')) || (p0 && p0.bHeld);
  // a Wizard keyboard: arrows + . when it is shared and not swapped, WASD + Space when swapped; alone on the keyboard it takes both
  let roll = (c.kbW && !(sh && G.swapped) && IN.hit('Period')) || (c.kbW && (!sh || G.swapped) && IN.hit('Space')) || (c.kbW && sh && G.swapped && IN.hit('KeyE')) || (p1 && p1.a);
  // the Wizard's own button: fire the held spell (Z or ' on the keyboard, X on his pad)
  let hold = (c.kbW && (IN.hit('KeyZ') || IN.hit('Quote'))) || (p1 && p1.x);
  // throw the whole stack: Shift + right-click (Shift + , when swapped), or LT + B on a pad
  const stackThrow = (IN.shift() && ((IN.mouse.rp && mouseInFactory() && Main.mouseB()) || (altB && IN.hit('Comma')))) || (p0 && p0.b && p0.ltHeld);
  // pick a target on purpose: right stick / R3 on a pad, Tab / Shift+Tab on the keyboard
  const cyc = (p0 && p0.cyc) || (IN.hit('Tab') ? (IN.shift() ? -1 : 1) : 0);

  if (IN.hit('Escape')) {
    if (UI.askB) UI.askClose(false);
    else if (UI.splitB) UI.closeSplit();
    else if (UI.treeOpen.L || UI.treeOpen.R) { UI.openTree('L', false); UI.openTree('R', false); }
    else if (G.demolish) G.demolish = false;
    else if (G.selected !== 'hand') UI.select('hand');
    else Main.pause(true);
  }
  if (IN.hit('KeyT') || (p0 && p0.y && !UI.splitB)) UI.openTree('L');
  if (!Net.on && (IN.hit('KeyY') || (p1 && p1.y))) UI.openTree('R');   // (online the Wizard's tree is on the guest's screen)
  if (IN.hit('KeyH')) { UI.help(); G.helpT = 0; }
  if (IN.hit('KeyC') && !frozenNow() && !UI.splitB && !UI.askB) Book.open();   // the Collection Book: every spell and creature
  if ((IN.hit('KeyP') || (p0 && p0.l3)) && !frozenNow()) { G.pinBp = !G.pinBp; AU.sfx('blip'); UI.pinT = 0; UI.changed(); }   // pin the unfinished buildings' needs on the Builder's side
  if (IN.hit('F3') || IN.hit('Backquote')) { UI.debugOn = !UI.debugOn; AU.sfx('blip'); }
  if (IN.hit('F4') && UI.debugOn) DevBot.toggle();   // dev-only: only while the F3 overlay is open
  if (G.helpT > 0) { G.helpT -= dt; if (G.helpT <= 0) UI.help(false); }
  if (!UI.splitB) CFG.hotkeys.forEach((k, i) => { if (IN.hit(k)) UI.select(CFG.hotbar[i]); });   // 1-4 toggle a Splitter output's filters while its settings are open
  let rot = 0;
  if (IN.hit('BracketLeft') || (p0 && p0.lb)) rot = -1;
  if (IN.hit('BracketRight') || (p0 && p0.rb)) rot = 1;
  if (IN.wheel && IN.mouse.x < Main.viewW() && !UI.treeOpen.L) rot = IN.wheel > 0 ? 1 : -1;
  if (rot && !(UI.treeOpen.L || UI.treeOpen.R)) UI.cycle(rot);
  if (!(UI.treeOpen.L || UI.treeOpen.R) && Main.graceT <= 0 && (IN.hit('KeyQ') || (p0 && p0.rt))) UI.cycleFam(IN.shift() ? -1 : 1);   // next member of a family slot
  if (IN.hit('KeyB') || IN.hit('Delete') || (p0 && p0.back)) { G.demolish = !G.demolish; AU.sfx('blip'); if (G.demolish) UI.toast('Demolish armed: click a building or belt, or an empty tile to lift it (full refund). Esc cancels.', 'L', 'ic_bomb'); }
  if (IN.hit('KeyR') && !frozenNow()) {
    // R turns whatever is already placed under the cursor (or in front / in reach); only with nothing there does it turn the next placement
    const at = rotateTile();
    if (UI.splitB) { /* a Splitter has no front to turn */ }
    else if (!(at && FA.rotateAt(at[0], at[1]))) { G.placeDir = (G.placeDir + 1) % 4; AU.sfx('blip'); }
  }

  // swap roles: hold X (keyboard) or Start (either pad)
  const holding = !Net.on && (IN.down('KeyX') || (p0 && p0.startHeld) || (p1 && p1.startHeld));   // either pad, or X on the keyboard (no job swap online: the roles are fixed)
  if (G.swapCd > 0) G.swapCd -= dt;
  if (holding && G.swapCd <= 0) {
    G.swapHold += dt;
    UI.swapRing(G.swapHold / CFG.swapHold);
    if (G.swapHold >= CFG.swapHold) {
      // swap the jobs: pads trade places; a keyboard with both jobs flips its layout, one with a single job gives it to the other
      const k = G.ctl;
      if (sh) G.swapped = !G.swapped; else { const t = k.kbB; k.kbB = k.kbW; k.kbW = t; }
      const t = k.pb; k.pb = k.pw; k.pw = t;
      G.swapHold = 0; G.swapCd = CFG.swapCooldown;
      UI.swapRing(null); AU.sfx('swap');
      G.bd.target = null; G.w.target = null;
      const msg = sh ? (G.swapped ? 'Swapped! Builder: arrows, . pick up, , throw, / use. Wizard: WASD, Space roll, click right side.' : 'Swapped back!') : 'Swapped jobs!';
      UI.toast(msg, 'L', 'ic_swap'); UI.toast(msg, 'R', 'ic_swap');
    }
  } else {
    G.swapHold = 0;
    UI.swapRing(null);
  }

  // an open skill tree (either side) freezes both halves, so nobody acts until it closes (and for the "And..." beat after)
  const inTree = UI.treeOpen.L || UI.treeOpen.R, frozen = inTree || Main.graceT > 0;
  if (inTree && (IN.hit('KeyQ') || (p0 && p0.x) || (!Net.on && p1 && p1.x))) UI.undoBank();   // Q / pad X: take the last deposit back out
  if (inTree) Main.treePads(dt, p0, Net.on ? null : p1);
  if (frozen) { bix = 0; biy = 0; use = false; pick = false; broll = false; if (!Net.on) { wix = 0; wiy = 0; wrx = 0; wry = 0; roll = false; hold = false; } }   // (online a tree only holds ITS player still: the sim and the other player carry on)
  // a demolish question is open: E / Enter / A confirms, Esc / B backs out
  if (UI.askB && !frozen) {
    if (use || IN.hit('Enter') || (p0 && p0.a)) UI.askClose(true);
    else if (p0 && p0.b) UI.askClose(false);
    bix = 0; biy = 0; use = false; pick = false; G.noThrow = true;
  }
  // the Splitter's settings are open: the Builder's inputs belong to them (the Wizard plays on)
  // up / down picks an output, left / right nudges its share by 5 (with key repeat), 1-4 toggle its element filters (pad: X moves the
  // element cursor, Y flips it), E / Enter / A / B close
  if (UI.splitB && !frozen) {
    const F = UI.splitFoc, b = UI.splitB;
    if (use || IN.hit('Enter') || (p0 && (p0.a || p0.b))) { UI.closeSplit(); G.noThrow = true; }
    else {
      if (p0 && p0.x) { UI.splitPad = true; F.col = (F.col + 1) % 4; UI.splitSync(); AU.sfx('tab'); }
      if (p0 && p0.y) { UI.splitPad = true; UI.splitToggle(F.row, ELEMS[F.col]); }
      for (let i = 0; i < 4; i++) if (IN.hit('Digit' + (i + 1))) UI.splitToggle(F.row, ELEMS[i]);
      const n = Main.splitNav, dx = Math.abs(bix) > 0.5 ? Math.sign(bix) : 0, dy = !dx && Math.abs(biy) > 0.5 ? Math.sign(biy) : 0, k = dx ? 'x' + dx : dy ? 'y' + dy : '';
      const go = () => { if (dx) UI.splitNudge(b.outs.length === 2 ? 0 : F.row, dx * 5); else if (dy) { F.row = Math.max(0, Math.min(b.outs.length - 1, F.row + dy)); UI.splitSync(); AU.sfx('tab'); } };
      if (!k) { n.dx = ''; n.t = 0; }
      else if (k !== n.dx) { n.dx = k; n.t = 0.35; go(); }
      else if ((n.t -= dt) <= 0) { n.t = dy ? 0.25 : 0.1; go(); }
    }
    bix = 0; biy = 0; use = false; pick = false;
  }
  // right-click / B / swapped , cancels hand-gathering (and that press doesn't throw)
  if (!IN.mouse.r && !throwHeld) G.noThrow = false;
  if (G.bd.gather && !frozen && ((IN.mouse.rp && mouseInFactory() && Main.mouseB()) || (altB && IN.hit('Comma')) || (p0 && p0.b))) {
    G.bd.gather = null; G.noThrow = true; IN.mouse.rp = false; AU.sfx('blip');
  }

  if (!frozen) { handleMouseFactory(dt); handleMouseWizard(); }
  if (!frozen) {
    if (cyc) FA.cycleLock(cyc);
    if (stackThrow && G.hands.length && !G.bd.gather && !G.noThrow) {   // a burst at one aim point, one item every throwStackGap
      const a = R.aim || aimNow();
      if (a) { G.bd.burst = G.hands.length; G.bd.burstAim = { x: a.x, y: a.y }; }
    }
    if (G.bd.burst > 0) {
      if (!G.hands.length) G.bd.burst = 0;
      else if (FA.throwOne(G.bd.burstAim.x, G.bd.burstAim.y, CFG.throwStackGap)) G.bd.burst--;
    }
    // pick / use presses are buffered: if nothing is in reach yet (still walking up to it), keep trying for
    // CFG.inputBuffer seconds before giving up and showing why
    const press = mode => {
      const a = FA.interact(mode, true);
      G.ibuf = a && a.fn ? null : { mode, t: CFG.inputBuffer };
      return a;
    };
    const building = G.selected !== 'hand' || G.demolish;
    if (G.ibuf && G.ibuf.mode === 'place') {   // a place-in-front that hit a taken tile retries while the Builder settles
      G.ibuf.t -= dt;
      if (placeInFront(G.ibuf.t > 0) || G.ibuf.t <= 0) G.ibuf = null;
    } else if (G.ibuf && !use && !pick) {
      const b = G.ibuf;
      b.t -= dt;
      if (b.mode === 'pick' && building) G.ibuf = null;
      else {
        const a = FA.interact(b.mode, b.t > 0);
        if ((a && a.fn) || b.t <= 0) {
          G.ibuf = null;
          if (b.mode === 'pick' && a && a.fn) G.pRepeat = a.rep ? CFG.pickRepeat * 1.5 : 0;
        }
      }
    }
    if (use) press('use');
    if (swapEl) { const hb = FA.harnessNear(); if (hb) FA.cycleElem(hb, IN.shift() ? -1 : 1); else AU.sfx('error'); }
    // A / . picks up one item (holding keeps grabbing); with a building selected it places in front instead
    if (pick) {
      if (building) { if (!placeInFront(true)) G.ibuf = { mode: 'place', t: CFG.inputBuffer }; }
      else { const a = press('pick'); G.pRepeat = a && a.fn && a.rep ? CFG.pickRepeat * 1.5 : 0; }
    } else if (pickHeld && !building && G.pRepeat > 0) {
      G.pRepeat -= dt;
      if (G.pRepeat <= 0) {
        const t = G.hands.length ? FA.sweepTarget(FA.topKind()) : FA.findTarget('pick'), a = t && FA.actionFor(t, 'pick');
        if (a && a.rep && a.fn) { a.fn(); G.pRepeat = G.hands.length ? CFG.sweepRepeat : CFG.pickRepeat; }
      }
    } else if (!pickHeld) G.pRepeat = 0;
    if (throwHeld && !(G.bd.burst > 0) && !(p0 && p0.ltHeld)) throwAlongAim();
    if (IN.hit('Enter') && !placeInFront(true)) G.ibuf = { mode: 'place', t: CFG.inputBuffer };
    if (p0 && p0.aHeld && G.selected === 'belt' && !G.demolish) {
      const tx = Math.floor(G.bd.x), ty = Math.floor(G.bd.y), key = tx + ',' + ty;
      if (G.lastFeet !== key) {
        G.lastFeet = key;
        const ax = Math.abs(G.bd.fx) >= Math.abs(G.bd.fy);
        G.placeDir = ax ? (G.bd.fx >= 0 ? 0 : 2) : (G.bd.fy >= 0 ? 1 : 3);
        FA.placeBelt(tx, ty, G.placeDir);
      }
    } else G.lastFeet = null;
  }
  return { bix, biy, wix, wiy, wrx, wry, roll, hold: !!hold, broll: !!broll };
};
// the name of the key that fires the held spell, for the toast
Main.holdKeyName = () => (Main.padW() ? 'X' : 'Z');

// ---------- per-frame simulation ----------
Main.step = function (dt, ctl) {
  ctl = ctl || (Main.modal() ? Main.wizardOnly() : Main.controls(dt));
  // the whole game (machines, belts, Builder, wilds) freezes while anyone has a skill tree open, then for the "And..." beat. Online nothing ever freezes it.
  const inTree = !Net.on && (UI.treeOpen.L || UI.treeOpen.R);
  if (!inTree && Main.graceT > 0) { Main.graceT -= dt; if (Main.graceT <= 0) UI.and(false); }
  const frozen = inTree || Main.graceT > 0;
  const facHalt = frozen || G.w.dead;   // the factory waits while the Wizard is down (the wilds keep running for the death effects)
  if (!facHalt) {
    if (ctl.broll) FA.builderRoll(ctl.bix, ctl.biy);
    FA.moveBuilder(dt, ctl.bix, ctl.biy);
    FA.update(dt);
  }
  if (!frozen) {
    if (ctl.hold) WZ.fireHeld();   // the Wizard fires the spell he is holding (it aims like a delivered one)
    WZ.update(dt, ctl.wix, ctl.wiy, ctl.roll, ctl.wrx, ctl.wry);
  }
  if (!G) return;   // a victory screen button may have gone to the title mid-step
  // soft footsteps, one stride timer each
  if (!frozen) {
    const bd = G.bd, wz = G.w, st = Main.stride || (Main.stride = { b: 0, w: 0 });
    if (!facHalt && bd.moving) { st.b -= dt; if (st.b <= 0) { st.b = 0.3; AU.sfx('step_b'); } } else st.b = 0.08;
    if (wz.moving && !wz.dead && !(wz.roll > 0)) { st.w -= dt; if (st.w <= 0) { st.w = 0.27; AU.sfx('step_w'); } } else st.w = 0.08;
  }
  if (G.w.dead && !G.w.deadHandled) {
    G.w.deadHandled = true;
    if (!Net.on) setTimeout(() => { if (G && G.w.dead) UI.showResults(); }, 900);
    else UI.toast('The Wizard is down. The factory waits until he is back.', 'L', 'ic_skull');   // (the guest sees the results screen on his side)
  }
  if (Net.on && G.w.dead) {   // online the Wizard re-enters with his roll button (the results screen on the guest's side is the same press)
    G.w.deadT = (G.w.deadT || 0) + dt;
    const p1 = Main.padW();
    if (G.w.deadT > 1 && p1 && p1.a) { WZ.reenter(); R.wcam.x = G.w.x; R.wcam.y = G.w.y; AU.sfx('buy'); }
  }
  if (!frozen) { G.stats.time += dt; Main.sample(dt); }
  // the soundtrack follows the game: factory activity, monsters crowding the Wizard, the Chimera
  const w = G.w;
  let near = 0;
  if (!w.dead) for (const e of w.enemies) if (Math.abs(e.x - w.x) < 10 && Math.abs(e.y - w.y) < 10) near++;
  AU.mix(Math.min(1, G.fac.working / 8), Math.min(1, near / 8), !!w.boss);
  AU.layerMix(G.fac.weather);   // each element's layer swells with the same signal that tints the wilds
  AU.muffle(!!(UI.treeOpen.L || UI.treeOpen.R));   // a skill tree is open: the music plays on, muffled
  AU.hum(facHalt ? 0 : Math.min(1, G.fac.working / 10));
  UI.updateHud(dt);
  if ((Players.checkT -= dt) <= 0) { Players.checkT = 1; Players.check(); }   // achievements (they unlock cosmetics)
  UI.splitTick(dt);
  Main.updateFocus();
  G.saveT += dt;
  if (G.saveT > CFG.autosave || (UI.dirty && G.saveT > 1.5)) { G.saveT = 0; UI.dirty = false; Main.save(); }
};
// a pad drives the tree on its own side (pad 1 = Builder = left tree, pad 2 = Wizard = right tree; a lone pad drives either):
// stick or d-pad moves the focus ring (with key repeat), A buys, RB pins, B closes
Main.nav = { L: { k: '', t: 0 }, R: { k: '', t: 0 } };
Main.treePads = function (dt, p0, p1) {
  for (const side of ['L', 'R']) {
    if (!UI.treeOpen[side]) continue;
    const pd = side === 'L' ? p0 : (p1 || (UI.treeOpen.L ? null : p0));
    if (!pd) continue;
    if (!UI.tfocus[side] || !UI.padDriven[side]) UI.treeNav(side, 0, 0);   // first touch: land on the first node
    const ax = Math.abs(pd.ix) > Math.abs(pd.iy);
    const dx = ax && Math.abs(pd.ix) > 0.5 ? Math.sign(pd.ix) : 0, dy = !ax && Math.abs(pd.iy) > 0.5 ? Math.sign(pd.iy) : 0;
    const n = Main.nav[side], k = dx + ',' + dy;
    if (!dx && !dy) { n.k = ''; n.t = 0; }
    else if (k !== n.k) { n.k = k; n.t = 0.35; UI.treeNav(side, dx, dy); }
    else if ((n.t -= dt) <= 0) { n.t = 0.12; UI.treeNav(side, dx, dy); }
    if (pd.a) UI.treeBuy(side);
    if (pd.rb) UI.treePin(side);
    if (pd.b) UI.openTree(side, false);
  }
};
// the skill tree just closed: drop every buffered / held input (nobody should act on a press from before the pause),
// then hold the game for a beat with a big "And..." so both players are ready when it resumes
Main.graceT = 0;
Main.treeClosed = function () {
  if (!G) return;
  if (Net.role === 'guest') { IN.squelch(); return; }
  G.ibuf = null; G.pRepeat = 0; G.mRepeat = 0; G.drag = null; G.lock = null;
  G.bd.target = null; G.bd.then = null; G.bd.burst = 0;
  G.w.target = null; G.w.rollBuf = 0;
  IN.squelch();
  if (Net.on) return;   // online nothing holds for a beat: the other player never stopped
  Main.graceT = CFG.graceTime;
  UI.and(true);
};
// one sample per second of the running totals; the debug overlay turns the last two minutes into rates
Main.metrics = { t: 0, next: 0, samples: [] };
Main.sample = function (dt) {
  const m = Main.metrics;
  m.t += dt;
  if (m.t < m.next) return;
  m.next = m.t + 1;
  m.samples.push({ t: m.t, xp: G.stats.xpEarned, pk: G.stats.packets, bk: G.bankTotal || 0, banked: Object.assign({}, G.stats.banked) });
  while (m.samples.length > 121) m.samples.shift();
};
// where one goal wants you to look: a factory tile (f), a spot in the wilds (w), a hotbar slot or the tree
Main.hintFor = function (q) {
  const h = q && q.hint, out = { f: null, w: null, slot: null, tree: false };
  if (!h) return out;
  const at = (b, lift) => ({ x: b.x + 0.5, y: b.y + 0.5, tile: true, lift: lift || 150 });
  const make = type => {
    const node = CFG.buildings[type].unlock;
    if (node && !G.tree[node]) { out.tree = true; return; }
    const bs = G.fac.bld.filter(b => b.type === type);
    const bp = bs.find(b => !b.done), done = bs.find(b => b.done);
    if (bp) out.f = at(bp); else if (done) out.f = at(done); else out.slot = type;
  };
  if (h.pile) { const p = FA.pileSpot(h.pile); out.f = { x: p.x, y: p.y, lift: 76 }; }
  else if (h.portal) { const p = FA.portal(h.portal); out.f = { x: p.x + 0.5, y: p.y + 1, lift: 240 }; }
  else if (h.use) { const b = G.fac.bld.find(b2 => b2.type === h.use && b2.done); if (b) out.f = at(b); }
  else if (h.build) { const bp = G.fac.bld.find(b => b.type === h.build && !b.done); if (bp) out.f = at(bp); else out.slot = h.build; }
  else if (h.make) make(h.make);
  else if (h.tree) out.tree = true;
  else if (h.combo) make('forge');   // combo spells need no unlock: the Forge (and the packets it fuses) is the whole gate
  else if (h.harv || h.mark || h.forage) {   // mark: 'shrine' / 'camp' (camps + crypts) = the nearest unclaimed one, 'myshrine' = a claimed shrine to stand on
    const w = G.w;
    let best = null, bd = 1e9;
    const near = o => { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < bd) { bd = d; best = o; } };
    if (h.harv) for (const o of WZ.harv) { if (!o.broken && o.kind === 'tree') near(o); }
    else if (h.forage) for (const o of WZ.forage) { if (!o.broken && WZ.forageSeen(o)) near(o); }
    else {
      for (const m of WZ.marks) {
        const done = w.lm[m.id].state === 'done';
        if (h.mark === 'myshrine' ? !(m.type === 'shrine' && done) : done || (h.mark === 'shrine' ? m.type !== 'shrine' : h.mark === 'camp' && m.type !== 'camp' && m.type !== 'crypt')) continue;
        near(m);
      }
    }
    // the arrow's tip sits above the sprite AND the health / progress bar drawn over it (a tree's bar, a forage spot's taps)
    if (best) out.w = { x: best.x, y: best.y, lift: h.mark ? 120 : (best.kind === 'bush' ? SP.fbush : SP[best.kind]).c.height * CFG.WT.S + 28 };
  } else if (h.crafted) {   // the nearest factory creature, else the Spell Portal the Egg goes through
    let best = null, bd = 1e9;
    for (const e of G.w.enemies) { if (!e.crafted || e.dead) continue; const d = Math.hypot(e.x - G.w.x, e.y - G.w.y); if (d < bd) { bd = d; best = e; } }
    if (best) { const spr = (best.var && SP[best.type + '_' + best.var]) || SP[best.type]; out.w = { x: best.x, y: best.y, lift: Math.round(spr.c.height * CFG.WT.S * (best.sz || 1) * (best.elite ? 1.4 : 1)) + (best.fly ? 12 : 0) + 46 }; } else { const p = FA.portal('spell'); out.f = { x: p.x + 0.5, y: p.y + 1, lift: 240 }; }
  } else if (h.keep) {   // scout: the nearest unscouted Stronghold; claim: the nearest unclaimed one
    const w = G.w;
    let best = null, bd = 1e9;
    for (const m of WZ.marks) { if (m.type !== 'stronghold' || w.lm[m.id].state === 'done' || (h.keep === 'scout' && w.lm[m.id].seen)) continue; const d = Math.hypot(m.x - w.x, m.y - w.y); if (d < bd) { bd = d; best = m; } }
    if (best) out.w = { x: best.x, y: best.y, lift: 150 };
  } else if (h.boss) {   // the Chimera while it is out, else the Altar that calls it
    if (G.w.boss) out.w = { x: G.w.boss.x, y: G.w.boss.y, lift: 140 };
    else if (WZ.altarOn()) out.w = { x: G.altar.x, y: G.altar.y, lift: 190 };
  } else if (h.altar) {   // not bought yet: the tree; landing: nothing; standing: the Altar
    if (!G.tree.summon) out.tree = true;
    else if (WZ.altarOn()) out.w = { x: G.altar.x, y: G.altar.y, lift: 190 };
  }
  return out;
};
// both tracks at once: the Builder's goal points at the factory / hotbar / left tree button, the Wizard's at the wilds / right button
Main.questHint = function () {
  const b = Main.hintFor(QUESTS.B[G.quest.B]), w = Main.hintFor(QUESTS.W[G.quest.W]);
  return { f: b.f || w.f, w: w.w || b.w, slot: b.slot || w.slot, treeL: b.tree, treeR: w.tree };
};
Main.updateFocus = function () {
  if (G.lock && !(G.lock.thr ? FA.lockValid('throw') : (FA.lockValid('pick') || FA.lockValid('use')))) G.lock = null;
  if (G.lock && G.lastInput === 'mouse') G.lock = null;   // the mouse picks exact things anyway
  const bd = G.bd, hov = G.lastInput === 'mouse' && mouseInFactory();
  // prompts: what the pick button (left-click / A) and the use button (E / X) would do right now
  let tp = null;
  if (G.selected === 'hand' && !G.demolish) {
    if (hov) { const [tx, ty] = hoverTile(R.fv), [px, py] = hoverPoint(R.fv); tp = FA.thingAt(tx, ty, px, py); }
    else tp = FA.findTarget('pick');
  }
  const t = bd.gather ? { kind: 'bld', o: bd.gather.b, x: bd.gather.b.x + 0.5, y: bd.gather.b.y + 0.5 } : FA.findTarget('use');
  const ap = tp && FA.actionFor(tp, 'pick'), au = t && FA.actionFor(t, 'use'), list = [];
  if (ap && ap.fn) list.push({ t: tp, a: ap, key: 'pick' });
  if (au && au.fn) list.push({ t, a: au, key: 'use' });
  if (!list.length) { if (ap && ap.label) list.push({ t: tp, a: ap }); else if (au && au.label) list.push({ t, a: au }); }
  const hn = G.selected === 'hand' && !G.demolish ? FA.harnessNear() : null;   // a third prompt: switch the Harnesser's element
  if (hn) { const o = CFG.harness.order; list.push({ t: { kind: 'bld', o: hn, x: hn.x + 0.5, y: hn.y + 0.5 }, a: { label: 'Change element', fn: null, ic: [hn.el, 'ic_swap', o[(o.indexOf(hn.el) + 1) % o.length]] }, key: 'cycle' }); }
  R.focus = list.length ? { list } : null;
  let b = null;
  if (mouseInFactory() && G.lastInput === 'mouse') {
    const [tx, ty] = hoverTile(R.fv), c = FA.cell(tx, ty);
    if (c && c.type !== 'belt' && c.type !== 'portal') b = c;
  }
  R.hoverB = b;
  const ft = R.focus ? R.focus.list[0].t : t;
  if (!b && ft && ft.kind === 'bld') b = ft.o;
  if (!b && G.selected === 'hand') {   // a Battery has nothing to press, so it never gets a prompt: its note shows whenever the Builder is in reach of it
    let bs = CFG.reach;
    for (const c of G.fac.bld) { if (!c.done || FA.def(c).kind !== 'cell') continue; const d = Math.hypot(c.x + 0.5 - bd.x, c.y + 0.5 - bd.y); if (d <= bs) { bs = d; b = c; } }
  }
  UI.setInspect(b ? FA.status(b) : null);
  if (R.focus) R.focus.inspH = UI.inspectH;   // the prompts are drawn above the note
  const qh = Main.questHint();
  R.hint = qh.f; R.whint = qh.w;
  UI.setHint(qh.slot && G.selected !== qh.slot ? qh.slot : null, qh.treeL, qh.treeR);
  R.aim = null;
  const frozen = UI.treeOpen.L || UI.treeOpen.R || Main.graceT > 0;
  if (G.hands.length && !frozen && G.selected === 'hand' && !G.demolish) R.aim = aimNow();   // with a building selected the placement ghost is the only preview (a throw still works, it just isn't outlined)
  R.ghost = null; R.demo = null;
  if (frozen) return;
  const [gx, gy] = useMouseAim() || (G.lastInput === 'mouse' && mouseInFactory()) ? hoverTile(R.fv) : frontTile();
  if (G.demolish) {
    const c = FA.cell(gx, gy);
    if (c && c.type !== 'portal') {
      const cost = c.type === 'belt' ? { wood: 1 } : c.done ? FA.def(c).cost : c.got;
      R.demo = { x: gx, y: gy, refund: c.free && c.done ? [['ic_gift']] : Object.keys(cost).filter(k => cost[k] > 0).map(k => [k, cost[k]]) };
    } else if (!c && FA.canLift(gx, gy)) {   // no building: the tile itself would go (a Stockpile tile back to floor, a floor tile back to empty ground)
      const cost = FA.liftCost(gx, gy);
      R.demo = { x: gx, y: gy, tile: true, refund: Object.keys(cost).map(k => [k, cost[k]]) };
    }
    else R.demo = { x: gx, y: gy };
  } else if (G.selected !== 'hand' && FA.inb(gx, gy)) {
    const c = FA.cell(gx, gy);
    const ok = G.selected === 'belt' ? (FA.canPlace(gx, gy) || (c && c.type === 'belt')) : FA.isTile(G.selected) ? FA.canPut(G.selected, gx, gy) : FA.canPlace(gx, gy) && FA.unlocked(G.selected);
    R.ghost = { type: G.selected, x: gx, y: gy, ok: !!ok, dir: G.placeDir };
  }
};

Main.pause = function (on) {
  if (!G) return;
  if (on) { UI.closeSplit(); UI.askClose(false); }
  if (Net.on) {   // online the menu is only a screen: the sim (and the other player) keep going
    if (Main.menuUp !== on) AU.sfx(on ? 'menu_open' : 'menu_close');
    Main.menuUp = on;
    const c = $('pCode');
    c.classList.toggle('hidden', !Net.code);
    const ns = Net.stats;
    c.innerHTML = Net.code ? 'ROOM <b>' + Net.code + '</b>' + (ns.kbps ? ' &nbsp; ' + ns.kbps + ' KB/s' : '') + (ns.path ? ' &nbsp; ' + ns.path : '') + (ns.chan ? ' &nbsp; ' + ns.chan : '') + (ns.netRtt ? ' &nbsp; net ' + ns.netRtt + ' ms' : '') + (Net.role === 'guest' && ns.rtt ? ' &nbsp; ping ' + ns.rtt + ' ms' : '') + (ns.skipped ? ' &nbsp; skipped ' + ns.skipped : '') : '';
    $('pQuit').textContent = Net.role === 'host' ? 'END ONLINE GAME' : 'LEAVE GAME';
  } else {
    if (G.paused !== on) AU.sfx(on ? 'menu_open' : 'menu_close');
    G.paused = on;
    $('pCode').classList.add('hidden'); $('pQuit').innerHTML = 'SAVE &amp; TITLE';
  }
  UI.show('pause', on);
  UI.show('pauseMain', true); UI.show('pauseSet', false);
  AU.hold(on);   // the music waits with the game
};

// ---------- backdrop for non-play screens (8-bit sunset + meadow) ----------
function drawBackdrop(ts) {
  R.px = 4; R.org = 0; R.defer = null;
  const bands = ['#2a1850', '#3a2068', '#52307e', '#6e3c8e', '#8e4a92', '#b45a8a', '#d8707a', '#f09070'];
  for (let i = 0; i < bands.length; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(0, i * 80, CFG.W, 84); }
  ctx.fillStyle = '#5ab84a'; ctx.fillRect(0, 640, CFG.W, CFG.H - 640);
  for (let i = 0; i < 80; i++) {
    const x = Math.floor((Math.sin(i * 91.7) * 0.5 + 0.5) * CFG.W / 4) * 4, y = Math.floor((Math.sin(i * 33.1 + 4) * 0.5 + 0.5) * CFG.H * 0.55 / 4) * 4;
    if (Math.sin(ts / 500 + i) > 0.3) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 4, 4); }
  }
  for (let y = -3; y < 9; y++) for (let x = -3; x < 22; x++) {
    const sx = 800 + (x - y) * 40, sy = 760 + (x + y) * 20;
    if (sy < 660) continue;
    ctx.fillStyle = (x + y) & 1 ? '#7fd35c' : '#8ee06a';
    diamond(ctx, sx, sy, 41, 21); ctx.fill();
  }
  if (SP.builder && SP.wizard) {
    const b = Math.sin(ts / 260) > 0 ? 8 : 0;
    dspr(ctx, SP.builderC, 640, 800 - b, 4);
    R.item(ctx, 'fire', 640, 724 - b, 4, ts / 1000);
    dspr(ctx, SP.wizard, 960, 800 - (Math.sin(ts / 300 + 1) > 0 ? 4 : 0), 4, 1, true);
  }
}

// ---------- main loop ----------
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  IN.pollPads();
  if (DevBot.on) DevBot.drive(dt);   // dev-only Wizard bot: writes the Wizard's pad state, nothing else
  if (Net.role === 'host') Net.drive();   // online: the guest's pad becomes the Wizard's pad, the same seam
  if (STATE === 'guest') {
    try { Main.guestFrame(dt, ts); } catch (e) { R.defer = null; UI.err(e); }
  } else if (STATE === 'menu' && G && G.menu) {
    AU.hum(0); AU.mix(0, 0, false); AU.layerMix(null); AU.muffle(true);   // the front door: all four music layers, muffled
    try { Menu.frame(dt, ts); } catch (e) { R.defer = null; UI.err(e); }
  } else if (STATE === 'exit' && Main.xs) {
    AU.hum(0); AU.mix(0, 0, false); AU.layerMix(null); AU.muffle(true);
    try { Main.exitFrame(dt, ts); } catch (e) { R.defer = null; UI.err(e); Main.openMenu(); }
  } else if (STATE === 'play' && G && G.intro && !G.paused) {   // the start sequence: the factory slides in (or fades in online), the starting buildings drop out of portals
    try { Main.introFrame(dt, ts); } catch (e) { R.defer = null; UI.err(e); Main.introEnd(); }
  } else if (STATE === 'play' && G) {
    try {
      Snap.tick();   // dev-only: the snapshot bar and its keys (inert unless the F3 overlay is open)
      Book.tick(dt);   // the Collection Book's keys and pad while it is open
      if (Snap.mode !== 'off') { AU.hum(0); Snap.draw(ctx, ts); Main.still = 0; }   // a snapshot view is up: the simulation is frozen and the cached frame shows
      else {
      if (!G.paused && !(Net.role === 'host' && Net.state !== 'live')) Main.step(dt);   // (online, the host waits while the guest is away)
      else AU.hum(0);
      if (Net.role === 'host') { Net.hostTick(dt); Main.netBannerTick(); }
      if (G && Net.on) {   // online the Builder's world fills the stage with the Wizard's in a corner; nothing is ever frozen, so nothing is skipped
        ctx.clearRect(0, 0, CFG.W, CFG.H);
        R.drawFactory(ctx, dt, { x0: 0, w: CFG.W });
        R.drawPip(ctx, dt);
      } else if (G) {
        // A frozen game (pause menu, a skill tree, the "And..." beat) is the same picture every frame: once it has settled for a few frames the canvas is left alone,
        // and a half hidden under its own opaque tree panel is not drawn at all. Main.still counts the frames since anything changed (UI.changed resets it).
        const frozen = G.paused || UI.treeOpen.L || UI.treeOpen.R || Main.graceT > 0;
        const sig = frozen ? [G.paused, UI.treeOpen.L, UI.treeOpen.R, Main.graceT > 0].join() : '';
        if (sig !== Main.drawSig) { Main.drawSig = sig; Main.still = 0; }
        if (!frozen || Main.still++ < 3) {
          if (!UI.treeOpen.L) { ctx.clearRect(0, 0, CFG.HALF, CFG.H); R.drawFactory(ctx, G.paused ? 0 : dt); }
          if (!UI.treeOpen.R) { ctx.clearRect(CFG.HALF, 0, CFG.HALF, CFG.H); R.drawWorld(ctx, G.paused ? 0 : dt); }
        }
      }
      }
    } catch (e) { R.defer = null; UI.err(e); }
  } else {
    AU.hum(0); AU.mix(0, 0, false); AU.layerMix(null); AU.muffle(true);   // the loading screen and the studio intro: all four layers, muffled
    if (STATE !== 'intro') drawBackdrop(ts);
  }
  IN.endFrame();
}

// ---------- boot ----------
window.addEventListener('error', e => { if (window.UI && UI.err) UI.err(e.error || e.message); });
window.addEventListener('unhandledrejection', e => { if (window.UI && UI.err) UI.err(e.reason || 'unhandled promise rejection'); });
window.addEventListener('DOMContentLoaded', () => {
  ctx = $('cv').getContext('2d');
  ctx.imageSmoothingEnabled = false;
  fit();
  $('btnTree').onclick = () => UI.openTree('L');
  $('btnTreeR').onclick = () => UI.openTree('R');
  $('btnBook').onclick = () => { if (!UI.treeOpen.L && !UI.treeOpen.R && !UI.splitB) Book.open(); };
  $('btnBookR').onclick = () => { if (!UI.treeOpen.L && !UI.treeOpen.R && !UI.splitB) Book.open(); };
  $('pBook').onclick = () => Book.open(true);
  $('btnDemo').onclick = () => { G.demolish = !G.demolish; AU.sfx('blip'); };
  $('btnSwap').onclick = () => UI.toast('Hold X (or Start on a pad) for 1.5 seconds to swap jobs.', 'L', 'ic_swap');
  $('btnHelp').onclick = () => UI.help();
  const sb = $('splitBody');   // the rows are rebuilt whenever the outputs change, so their events are caught here
  sb.oninput = e => { const r = e.target; if (r.classList.contains('splitR')) { UI.splitPad = false; UI.splitFoc.row = +r.dataset.i; UI.splitSet(+r.dataset.i, +r.value); } };
  sb.onchange = e => { if (e.target.blur) e.target.blur(); };   // keep the arrow keys for walking
  sb.onclick = e => { const bt = e.target.closest && e.target.closest('button.el'); if (bt) { UI.splitPad = false; UI.splitFoc.row = +bt.dataset.i; UI.splitToggle(+bt.dataset.i, bt.dataset.el); bt.blur(); } };
  $('splitReset').onclick = () => UI.splitReset();
  $('splitDone').onclick = () => UI.closeSplit();
  $('splitModal').onmousedown = e => { if (e.target.id === 'splitModal') UI.closeSplit(); };
  $('splitModal').oncontextmenu = e => { e.preventDefault(); UI.closeSplit(); };
  $('askYes').onclick = () => UI.askClose(true);
  $('askNo').onclick = () => UI.askClose(false);
  $('askModal').onmousedown = e => { if (e.target.id === 'askModal') UI.askClose(false); };
  $('pResume').onclick = () => Main.pause(false);
  $('pSet').onclick = () => {
    UI.settingsPage($('pauseSet'), () => { UI.show('pauseSet', false); UI.show('pauseMain', true); });
    UI.show('pauseMain', false); UI.show('pauseSet', true);
  };
  $('pQuit').onclick = () => { Main.pause(false); Main.toTitle(); };
  window.addEventListener('beforeunload', () => { if (STATE === 'play') Main.save(); if (Net.role) Net.close(); });
  // losing focus or switching tabs pauses play and silences all audio until the window is back
  const away = () => { if (Net.on) return; if (STATE === 'play' && G && !G.paused) Main.pause(true); AU.sleep(true); };   // (online the game carries on: it is not the host's alone to stop)
  window.addEventListener('blur', away);
  window.addEventListener('focus', () => AU.sleep(false));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (STATE === 'play') Main.save(); away(); }
    else if (document.hasFocus()) AU.sleep(false);
  });
  requestAnimationFrame(frame);

  const fonts = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('20px "Jersey 10"'), document.fonts.load('16px Digits', '0123456789'), document.fonts.load('16px DigitsB', '0123456789'), StudioIntro.loadFonts()]).catch(() => {})
    : Promise.resolve();
  SP.build(f => { $('loadFill').style.width = Math.round(f * 90) + '%'; }, () => {
    Players.init();   // the saved looks replace the default Builder / Wizard sprites
    WZ.generate();
    R.buildMap();
    UI.decorate();
    fonts.then(() => {
      $('loadFill').style.width = '100%';
      $('loadMsg').textContent = 'CLICK OR PRESS ANY KEY';
      $('loadMsg').classList.add('ready');
      let started = false;
      const go = () => {
        if (started) return; started = true;
        window.removeEventListener('keydown', go); window.removeEventListener('mousedown', go);
        AU.init();
        UI.show('loading', false);
        STATE = 'intro';
        StudioIntro.run(() => { Main.openMenu(); });
      };
      setTimeout(() => { window.addEventListener('keydown', go); window.addEventListener('mousedown', go); }, 100);
    });
  });
});

// ---------- the start sequence ----------
// Menu.seqTick hands over here when the Builder and the belt line are gone: the real game is built (a new one or a saved one), the Wizard stays exactly where he stood, and
// G.intro runs the rest: offline the factory slides in from the left and the Builder drops out of a portal into it, online the Builder's screen fades from black onto the
// factory; the factory then stands empty for a second and the starting buildings fall out of portals ~200 ms apart, each landing with a puff of dust.
// (All of it is plain data in G: G.intro, and fallAt on whatever has yet to land; the sim waits until it is over.)
Main.introPending = false;
Main.CINE = 2;   // the start sequence (the intro: slide, drops) and the way back play this many times faster than their data says (the data stays: 1 s empty, 200 ms apart)
Main.launch = function (pend, mG) {
  const c = mG.ctl, wiz = { x: mG.w.x, y: mG.w.y, fx: mG.w.fx, fy: mG.w.fy }, swapped = mG.swapped, cam = { x: R.wcam.x, y: R.wcam.y };
  const online = !!pend.online && Net.role === 'host';
  Players.ctl = online ? { kbB: true, kbW: false, pb: IN.padList.length ? 0 : -1, pw: 1 } : { kbB: c.kbB, kbW: c.kbW, pb: c.pb, pw: c.pw };
  Players.save();
  Main.introPending = true;
  Net.on = online;
  if (pend.kind === 'new') Main.newGame(pend.slot); else Main.loadGame(pend.slot);
  Main.introPending = false;
  if (!G || G === mG || !G.intro) { Net.on = false; return; }   // (a save that would not load has already gone back to the menu)
  G.swapped = !!swapped && G.ctl.kbB && G.ctl.kbW;
  G.w.x = wiz.x; G.w.y = wiz.y; G.w.fx = wiz.fx; G.w.fy = wiz.fy;
  R.wcam.x = cam.x; R.wcam.y = cam.y;
  R.focus = null; R.hint = null; R.whint = null; R.aim = null; R.ghost = null; R.demo = null; R.hoverB = null;
  if (online) Main.netUi('host');
};
Main.makeIntro = function () {
  const online = !!Net.on, f = G.fac;
  const lead = online ? 0.9 : 1.1;   // the slide / the fade-in
  const I = G.intro = { t: 0, online, lead, empty: 1, drop: 0.55, gap: 0.2, end: 0 };
  const objs = f.bld.concat(f.belts).sort((a, b) => (a.x + a.y) - (b.x + b.y));
  I.gap = objs.length <= 24 ? 0.2 : Math.max(0.05, 4.8 / objs.length);   // (~200 ms apart; a big saved factory is dropped in faster so it does not take a minute)
  objs.forEach((o, i) => { o.fallAt = lead + I.empty + i * I.gap; });
  G.bd.fallAt = online ? 0.25 : lead * 0.5;
  I.end = lead + I.empty + (objs.length - 1) * I.gap + I.drop + 0.35;
  I.t = 0;
};
Main.introStep = function (dt) {
  const I = G.intro, f = G.fac;
  I.t += dt; f.t += dt; G.w.t += dt;
  for (let i = f.parts.length - 1; i >= 0; i--) {
    const p = f.parts[i];
    p.t -= dt; p.x += p.vx * dt * 0.5; p.y += p.vy * dt * 0.5; p.z += p.vz * dt; p.vz -= (p.g === undefined ? 9 : p.g) * dt;
    if (p.t <= 0) f.parts.splice(i, 1);
  }
  for (let i = f.pops.length - 1; i >= 0; i--) { f.pops[i].t += dt; if (f.pops[i].t > 1.1) f.pops.splice(i, 1); }
  if (f.flash > 0) f.flash -= dt;
  if (G.bd.squash > 0) G.bd.squash -= dt;
  for (const o of f.bld) if (o.pop > 0) o.pop -= dt;
  for (const o of f.bld.concat(f.belts, [G.bd])) {
    if (o.fallAt === undefined || I.t < o.fallAt + I.drop) continue;
    delete o.fallAt;   // it has landed
    const cx = o.type === 'belt' || o.type ? o.x + 0.5 : o.x, cy = o.type === 'belt' || o.type ? o.y + 0.5 : o.y;
    FA.landPuff(cx, cy); AU.sfx('thud');
    if (o === G.bd) G.bd.squash = 0.2; else if (o.type !== 'belt') o.pop = 0.35;
  }
};
const smooth = k => k * k * (3 - 2 * k);
Main.introFrame = function (dt, ts) {
  const rdt = dt;
  dt *= Main.CINE;
  Main.introStep(dt);
  if (Net.role === 'host') { Net.hostTick(rdt); Main.netBannerTick(); }   // (online the guest watches the factory fill up in his corner: the snapshots keep flowing)
  const I = G.intro;
  AU.hum(0); AU.mix(0, 0, false); AU.layerMix(G.fac.weather); AU.muffle(false);
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  if (I.online) {   // the Builder's screen fades from black onto the (empty) factory
    R.drawFactory(ctx, dt, { x0: 0, w: CFG.W });
    R.drawPip(ctx, dt);
    const a = 1 - clampv(I.t / I.lead, 0, 1);
    if (a > 0) { ctx.fillStyle = 'rgba(0,0,0,' + (a * a).toFixed(3) + ')'; ctx.fillRect(0, 0, CFG.W, CFG.H); }
  } else {
    const e = smooth(clampv(I.t / I.lead, 0, 1));
    if (e < 1) Main.slide(ctx, dt, e);
    else { R.drawFactory(ctx, dt); R.drawWorld(ctx, dt); }
  }
  if (I.t >= I.end) Main.introEnd();
};
// the two halves as two panes: the world fills the stage with the Wizard in the middle, the factory slides over it from the left (e = 0: the world alone, e = 1: the usual split)
Main.slide = function (ctx, dt, e, fac, wld) {
  const mk2 = n => { let b = R.bufs[n]; if (!b) { const c = document.createElement('canvas'); c.width = CFG.W; c.height = CFG.H; b = R.bufs[n] = { c, x: c.getContext('2d') }; } b.x.clearRect(0, 0, CFG.W, CFG.H); return b; };
  const A = mk2('paneW'), B = mk2('paneF');
  if (wld) wld(A.x); else R.drawWorld(A.x, dt, { x0: 0, w: CFG.W, pip: true });
  if (fac) fac(B.x); else R.drawFactory(B.x, dt, { x0: 0, w: CFG.HALF });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(A.c, Math.round(400 * e), 0);
  ctx.drawImage(B.c, Math.round(-800 + 800 * e), 0);
  ctx.fillStyle = '#1a0f28'; ctx.fillRect(Math.round(800 * e) - 8, 0, 8, CFG.H);   // the split line rides along with the factory's edge
};
Main.introEnd = function () {
  const f = G.fac;
  G.intro = null;
  for (const o of f.bld.concat(f.belts, [G.bd])) delete o.fallAt;
  UI.show('game', true);
  const gm = $('game'); gm.classList.add('fadeIn'); setTimeout(() => gm.classList.remove('fadeIn'), 900);
  UI.resetCache(); Main.still = 0; Main.drawSig = null;
  UI.help(true); G.helpT = 25; Main.helpFoot();
  if (Net.on && Net.role === 'host') UI.toast('Player 2 joined as the Wizard.', 'L', 'ic_check');
};
// ---------- the way back: the Builder is sucked into a portal, the factory slides away, he drops into the Wizard's world, both are teleported to the start ----------
Main.exitFrame = function (dt, ts) {
  dt *= Main.CINE;
  const X = Main.xs, g = X.g, T1 = 1.0, T2 = 0.9;
  X.t += dt; G = g;
  g.fac.t += dt; g.outro.t0 = X.t;
  for (let i = g.fac.parts.length - 1; i >= 0; i--) { const p = g.fac.parts[i]; p.t -= dt; p.x += p.vx * dt * 0.5; p.y += p.vy * dt * 0.5; p.z += p.vz * dt; p.vz -= (p.g === undefined ? 9 : p.g) * dt; if (p.t <= 0) g.fac.parts.splice(i, 1); }
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  if (X.t < T1) { R.drawFactory(ctx, dt); R.drawWorld(ctx, dt); return; }
  if (X.t < T1 + T2) { g.outro.gone = true; Main.slide(ctx, dt, 1 - smooth((X.t - T1) / T2)); return; }
  const ret = { x: g.w.x, y: g.w.y, fx: g.w.fx, fy: g.w.fy, cam: { x: R.wcam.x, y: R.wcam.y } };
  Main.xs = null; g.outro = null;
  Main.openMenu(ret);
};

// ---------- test hook ----------
window.__wands = {
  get G() { return G; },
  Main, FA, WZ, UI, R, CFG, DevBot, Snap, Net,
  start(slot) { Main.newGame(slot || 1); },
  get menu() { return Menu; },
  deliver(kind) { FA.deliver(kind); },
  bank(kind, n) { for (let i = 0; i < (n || 1); i++) FA.bank(kind); },
  // runs the simulation with zeroed inputs; with the dev bot on, it plays the Wizard through the real pad path (Main.controls)
  step(dt, n) { for (let i = 0; i < (n || 1); i++) if (G && !G.paused) { if (DevBot.on) { DevBot.drive(dt); Main.step(dt); } else Main.step(dt, { bix: 0, biy: 0, wix: 0, wiy: 0, roll: false }); } },
  bot(who) { return DevBot.set(who); },
  boss() { return WZ.summonBoss(); },
  // force event n (1 = the first of the rotation, 7 = Cycle 2's Migration, ...) to start in 5 seconds
  event(n) { const ev = G.ev; ev.n = Math.max(0, (n || 1) - 1); ev.plan = null; ev.active = null; ev.left = 5; ev.warned = 3; ev.clear = 0; return WZ.evInfo(); },
  egg(kind) { FA.deliver(kind || 'egg_zephyr'); },
  // dev-only photo test: capture G as plain JSON, redraw one frame from that copy alone, report every leak (see js/snapshot.js)
  snapshot() { return Snap.run(); },
  snapView(mode) { Snap.show(mode); },
};
