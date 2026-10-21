'use strict';
// Game flow: loading -> studio intro -> menu -> play. Input routing, save/load, main loop, test hook.
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
const QUEST_VERSION = 2;   // v2 inserted goals 14-15 (landmark, logistics): older saves past goal 13 shift by 2
function blankState(slot) {
  return {
    slot, xp: 0, tree: {}, stock: { wood: CFG.start.wood, stone: CFG.start.stone, iron: CFG.start.iron, shard: 0 },
    bank: {}, bankTotal: 0,
    credits: { station: 0, charger: 0 },
    stats: { deliveries: 0, kills: 0, harvested: 0, xpEarned: 0, packets: 0, banked: {}, time: 0, elites: 0, shards: 0, landmarks: 0, wins: 0 },
    flags: {}, quest: 0,
    hands: null, swapped: false, selected: 'hand', demolish: false, placeDir: 0, paused: false,
    saveT: 0, swapHold: 0, swapCd: 0, drag: null, lastFeet: null, lastInput: 'kb', helpT: 0, pRepeat: 0, mRepeat: 0,
  };
}
Main.newGame = function (slot) {
  G = blankState(slot);
  G.w = WZ.fresh();
  FA.initial();
  Main.enter();
  UI.help(true); G.helpT = 25;
  Main.save();
};
Main.loadGame = function (slot) {
  const s = UI.slotInfo(slot);
  if (!s || s.old) return;
  G = blankState(slot);
  G.xp = s.xp || 0; G.tree = s.tree || {}; G.stock = Object.assign(G.stock, s.stock || {});
  G.bank = s.bank || {}; G.bankTotal = s.bankTotal || 0;
  G.credits = Object.assign(G.credits, s.credits || {}); G.stats = Object.assign(G.stats, s.stats || {});
  G.flags = s.flags || {}; G.quest = s.quest || 0; G.placeDir = s.placeDir || 0;
  if ((s.qv || 1) < 2 && G.quest >= 13) G.quest += 2;
  G.hands = s.hands && ITEMS[s.hands.kind] ? s.hands : null;
  G.w = WZ.fresh();
  FA.fromJSON(s.fac || {});
  G.bd = FA.freshBuilder();
  if (s.bd && FA.inb(Math.floor(s.bd.x), Math.floor(s.bd.y))) { G.bd.x = s.bd.x; G.bd.y = s.bd.y; }
  Main.enter();
};
Main.save = function () {
  if (!G) return;
  try {
    localStorage.setItem('wands2_save_slot' + G.slot, JSON.stringify({
      v: SAVE_VERSION, qv: QUEST_VERSION, xp: G.xp, tree: G.tree, stock: G.stock, bank: G.bank, bankTotal: G.bankTotal, credits: G.credits, stats: G.stats,
      flags: G.flags, quest: G.quest, hands: G.hands, placeDir: G.placeDir, bd: { x: G.bd.x, y: G.bd.y }, fac: FA.toJSON(), at: Date.now(),
    }));
  } catch (e) { /* storage unavailable */ }
};
Main.enter = function () {
  STATE = 'play';
  UI.resetCache();
  UI.show('menu', false); UI.show('game', true);
  UI.show('pause', false); UI.show('results', false); UI.help(false);
  UI.openTree('L', false); UI.openTree('R', false);
  UI.buildHotbar();
  UI.show('victory', false);
  R.fcam.x = G.bd.x; R.fcam.y = G.bd.y; R.wcam.x = G.w.x; R.wcam.y = G.w.y;
  Main.metrics = { t: 0, next: 0, samples: [] };
  AU.music(true);
};
Main.toTitle = function () {
  Main.save();
  STATE = 'menu';
  UI.show('game', false); UI.show('menu', true);
  UI.menuPage('menuMain');
  G = null;
};

// ---------- controls ----------
const KV = (l, r, u, d) => [(IN.down(r) ? 1 : 0) - (IN.down(l) ? 1 : 0), (IN.down(d) ? 1 : 0) - (IN.down(u) ? 1 : 0)];
const clampv = v => Math.max(-1, Math.min(1, v));
const mouseInFactory = () => IN.mouse.moved && IN.mouse.x >= 0 && IN.mouse.x < CFG.HALF && IN.mouse.y > 0 && IN.mouse.y < 800;

function hoverPoint(view) { return R.toTile(view, IN.mouse.x, IN.mouse.y); }
function hoverTile(view) { const t = hoverPoint(view); return [Math.floor(t[0]), Math.floor(t[1])]; }
// the tile directly in front of the Builder (snapped to the dominant grid axis)
function frontTile() {
  const bd = G.bd, ax = Math.abs(bd.fx) >= Math.abs(bd.fy);
  const dx = ax ? Math.sign(bd.fx) : 0, dy = ax ? 0 : Math.sign(bd.fy);
  return [Math.floor(bd.x) + dx, Math.floor(bd.y) + dy];
}
const useMouseAim = () => G.lastInput === 'mouse' && mouseInFactory() && !G.swapped;
// where a throw would land right now: the cursor with the mouse, otherwise auto-aim along the Builder's facing
function aimNow() {
  if (useMouseAim()) { const [px, py] = hoverPoint(R.fv); return FA.throwTarget(px, py); }
  return FA.throwTarget();
}
// every throw lands exactly where the lead line on screen points (R.aim, refreshed each frame)
function throwAlongAim() {
  if (!G.hands || G.bd.gather) return;
  const a = R.aim || aimNow();
  if (a) FA.throwOne(a.x, a.y);
}

function handleMouseFactory(dt) {
  const m = IN.mouse;
  if (!mouseInFactory() || UI.treeOpen.L) { if (!m.l) G.drag = null; return; }
  const [tx, ty] = hoverTile(R.fv), [px, py] = hoverPoint(R.fv);
  const sel = G.selected, bd = G.bd;
  // right mouse: throw along the lead line (hold = rapid), or cancel the current tool
  if (m.r && G.hands) throwAlongAim();
  else if (m.rp) { if (G.demolish) G.demolish = false; else if (sel !== 'hand') UI.select('hand'); }
  if (m.lp) {
    if (G.demolish) FA.demolish(tx, ty);
    else if (sel === 'hand') {   // left click picks up: walk to the thing under the cursor and take one
      const thing = FA.thingAt(tx, ty, px, py);
      G.mRepeat = CFG.pickRepeat * 1.5;
      if (thing) { bd.then = thing; bd.target = { x: thing.x, y: thing.y }; }
      else if (FA.inb(tx, ty)) { bd.then = null; bd.target = { x: px, y: py }; }
      bd.stuckT = 0;
    } else if (sel === 'belt') {
      FA.placeBelt(tx, ty, G.placeDir);
      G.drag = { x: tx, y: ty };
    } else if (!FA.place(sel, tx, ty, G.placeDir) && FA.inb(tx, ty) && FA.unlocked(sel)) {
      UI.toast(FA.reserved(tx, ty) ? 'The Stockpile Zone has to stay clear.' : 'That tile is taken.', 'L', 'ic_x'); AU.sfx('error');
    }
  } else if (m.l && sel === 'hand' && !G.demolish && !bd.target) {   // hold to keep taking
    G.mRepeat -= dt;
    const thing = G.mRepeat <= 0 && FA.thingAt(tx, ty, px, py);
    if (thing && FA.distTo(thing) < CFG.reach - 0.25) {
      const a = FA.actionFor(thing, 'pick');
      if (a.fn && a.rep) a.fn();
      G.mRepeat = CFG.pickRepeat;
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
  if (!G.swapped || !m.moved || m.x < CFG.HALF || !m.l || UI.treeOpen.R) return;
  const [px, py] = hoverPoint(R.wv);
  G.w.target = { x: Math.max(0.5, Math.min(CFG.WW - 0.5, px)), y: Math.max(0.5, Math.min(CFG.WH - 0.5, py)) };
}

function placeInFront() {
  const [tx, ty] = frontTile(), sel = G.selected;
  if (G.demolish) { FA.demolish(tx, ty); return; }
  if (sel === 'hand') { UI.toast('Pick a building first (1 to 9, 0, - or LB/RB).', 'L', 'ic_hand'); return; }
  if (sel === 'belt') { FA.placeBelt(tx, ty, G.placeDir); return; }
  if (!FA.place(sel, tx, ty, G.placeDir) && FA.unlocked(sel)) { UI.toast('Something is already there.', 'L', 'ic_x'); AU.sfx('error'); }
}

Main.controls = function (dt) {
  const p0 = IN.pad[0], p1 = IN.pad[1];
  const wasd = KV('KeyA', 'KeyD', 'KeyW', 'KeyS'), arrows = KV('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown');
  const bk = G.swapped ? arrows : wasd, wk = G.swapped ? wasd : arrows;
  let bix = clampv(bk[0] + (p0 ? p0.ix : 0)), biy = clampv(bk[1] + (p0 ? p0.iy : 0));
  let wix = clampv(wk[0] + (p1 ? p1.ix : 0)), wiy = clampv(wk[1] + (p1 ? p1.iy : 0));
  if (bk[0] || bk[1]) G.lastInput = 'kb';
  if (p0 && (p0.ix || p0.iy || p0.any)) G.lastInput = 'pad';
  if (IN.mouse.mv) G.lastInput = 'mouse';
  R.padMode = G.lastInput === 'pad';

  // Builder: left-click / A picks up, right-click / B throws, E / X uses (swapped keyboard: . pick, , throw, / use)
  let use = IN.hit(G.swapped ? 'Slash' : 'KeyE') || (p0 && p0.x);
  let pick = (G.swapped && IN.hit('Period')) || (p0 && p0.a);
  const pickHeld = (G.swapped && IN.down('Period')) || (p0 && p0.aHeld);
  const throwHeld = (G.swapped && IN.down('Comma')) || (p0 && p0.bHeld);
  let roll = IN.hit(G.swapped ? 'Space' : 'Period') || (G.swapped && IN.hit('KeyE')) || (p1 && p1.a);

  if (IN.hit('Escape')) {
    if (UI.treeOpen.L || UI.treeOpen.R) { UI.openTree('L', false); UI.openTree('R', false); }
    else if (G.demolish) G.demolish = false;
    else if (G.selected !== 'hand') UI.select('hand');
    else Main.pause(true);
  }
  if (IN.hit('KeyT') || (p0 && p0.y)) UI.openTree('L');
  if (IN.hit('KeyY') || (p1 && p1.y)) UI.openTree('R');
  if (IN.hit('KeyH')) { UI.help(); G.helpT = 0; }
  if (IN.hit('F3') || IN.hit('Backquote')) { UI.debugOn = !UI.debugOn; AU.sfx('blip'); }
  if (G.helpT > 0) { G.helpT -= dt; if (G.helpT <= 0) UI.help(false); }
  CFG.hotkeys.forEach((k, i) => { if (IN.hit(k)) UI.select(CFG.hotbar[i]); });
  let rot = 0;
  if (IN.hit('BracketLeft') || (p0 && p0.lb)) rot = -1;
  if (IN.hit('BracketRight') || (p0 && p0.rb)) rot = 1;
  if (IN.wheel && IN.mouse.x < CFG.HALF && !UI.treeOpen.L) rot = IN.wheel > 0 ? 1 : -1;
  if (rot) UI.cycle(rot);
  if (IN.hit('KeyB') || IN.hit('Delete') || (p0 && p0.back)) { G.demolish = !G.demolish; AU.sfx('blip'); if (G.demolish) UI.toast('Demolish armed: click a building or belt (full refund). Esc cancels.', 'L', 'ic_bomb'); }
  if (IN.hit('KeyR')) { G.placeDir = (G.placeDir + 1) % 4; AU.sfx('blip'); }

  // swap roles: hold X (keyboard) or Start (either pad)
  const holding = IN.down('KeyX') || (p0 && p0.startHeld) || (p1 && p1.startHeld);
  if (G.swapCd > 0) G.swapCd -= dt;
  if (holding && G.swapCd <= 0) {
    G.swapHold += dt;
    UI.swapRing(G.swapHold / CFG.swapHold);
    if (G.swapHold >= CFG.swapHold) {
      G.swapped = !G.swapped; G.swapHold = 0; G.swapCd = CFG.swapCooldown;
      UI.swapRing(null); AU.sfx('swap');
      G.bd.target = null; G.w.target = null;
      const msg = G.swapped ? 'Swapped! Builder: arrows, . pick up, , throw, / use. Wizard: WASD, Space roll, click right side.' : 'Swapped back!';
      UI.toast(msg, 'L', 'ic_swap'); UI.toast(msg, 'R', 'ic_swap');
    }
  } else {
    G.swapHold = 0;
    UI.swapRing(null);
  }

  if (UI.treeOpen.L) { bix = 0; biy = 0; use = false; pick = false; }
  if (UI.treeOpen.R) { wix = 0; wiy = 0; roll = false; }

  handleMouseFactory(dt);
  handleMouseWizard();
  if (!UI.treeOpen.L) {
    if (use) FA.interact('use');
    // A / . picks up one item (holding keeps grabbing); with a building selected it places in front instead
    const building = G.selected !== 'hand' || G.demolish;
    if (pick) {
      if (building) placeInFront();
      else { const a = FA.interact('pick'); G.pRepeat = a && a.rep ? CFG.pickRepeat * 1.5 : 0; }
    } else if (pickHeld && !building && G.pRepeat > 0) {
      G.pRepeat -= dt;
      if (G.pRepeat <= 0) {
        const t = FA.findTarget('pick'), a = t && FA.actionFor(t, 'pick');
        if (a && a.rep && a.fn) { a.fn(); G.pRepeat = CFG.pickRepeat; }
      }
    } else if (!pickHeld) G.pRepeat = 0;
    if (throwHeld) throwAlongAim();
    if (IN.hit('Enter')) placeInFront();
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
  return { bix, biy, wix, wiy, roll };
};

// ---------- per-frame simulation ----------
Main.step = function (dt, ctl) {
  ctl = ctl || Main.controls(dt);
  FA.moveBuilder(dt, ctl.bix, ctl.biy);
  FA.update(dt);
  // the wilds freeze while anyone has the skill tree open, so the Wizard can't die while you shop
  if (!UI.treeOpen.L && !UI.treeOpen.R) WZ.update(dt, ctl.wix, ctl.wiy, ctl.roll);
  if (!G) return;   // a victory screen button may have gone to the title mid-step
  if (G.w.dead && !G.w.deadHandled) { G.w.deadHandled = true; setTimeout(() => { if (G && G.w.dead) UI.showResults(); }, 900); }
  G.stats.time += dt;
  Main.sample(dt);
  // the soundtrack follows the game: factory activity, monsters crowding the Wizard, the Chimera
  const w = G.w;
  let near = 0;
  if (!w.dead) for (const e of w.enemies) if (Math.abs(e.x - w.x) < 10 && Math.abs(e.y - w.y) < 10) near++;
  AU.mix(Math.min(1, G.fac.working / 8), Math.min(1, near / 8), !!w.boss);
  AU.hum(Math.min(1, G.fac.working / 10));
  UI.updateHud(dt);
  Main.updateFocus();
  G.saveT += dt;
  if (G.saveT > CFG.autosave || (UI.dirty && G.saveT > 1.5)) { G.saveT = 0; UI.dirty = false; Main.save(); }
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
// where the current goal wants you to look: a factory tile (R.hint), a spot in the wilds (R.whint), a hotbar slot or the tree
Main.questHint = function () {
  const q = QUESTS[G.quest], h = q && q.hint, out = { f: null, w: null, slot: null, tree: false };
  if (!h) return out;
  const at = (b, lift) => ({ x: b.x + 0.5, y: b.y + 0.5, tile: true, lift: lift || 150 });
  const make = type => {
    const node = CFG.buildings[type].unlock;
    if (node && !G.tree[node]) { out.tree = true; return; }
    const bs = G.fac.bld.filter(b => b.type === type);
    const bp = bs.find(b => !b.done), done = bs.find(b => b.done);
    if (bp) out.f = at(bp); else if (done) out.f = at(done); else out.slot = type;
  };
  if (h.pile) { const p = FA.piles()[h.pile]; out.f = { x: p.x, y: p.y, lift: 76 }; }
  else if (h.portal) { const p = FA.portal(h.portal); out.f = { x: p.x + 0.5, y: p.y + 1, lift: 240 }; }
  else if (h.use) { const b = G.fac.bld.find(b2 => b2.type === h.use && b2.done); if (b) out.f = at(b); }
  else if (h.build) { const bp = G.fac.bld.find(b => b.type === h.build && !b.done); if (bp) out.f = at(bp); else out.slot = h.build; }
  else if (h.make) make(h.make);
  else if (h.tree) out.tree = true;
  else if (h.combo) {   // needs a spell with that many elements unlocked, then the Forge
    const ok = FA.recipesFor('forge').some(id => Object.keys(CFG.recipes[id].in).length >= h.combo && id !== 'battery');
    if (!ok) out.tree = true; else make('forge');
  } else if (h.harv || h.mark) {
    const w = G.w;
    let best = null, bd = 1e9;
    if (h.harv) for (const o of WZ.harv) { if (o.broken || o.kind !== 'tree') continue; const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < bd) { bd = d; best = o; } }
    else for (const m of WZ.marks) { if (w.lm[m.id].state === 'done') continue; const d = Math.hypot(m.x - w.x, m.y - w.y); if (d < bd) { bd = d; best = m; } }
    if (best) out.w = { x: best.x, y: best.y, lift: h.mark ? 120 : 90 };
  } else if (h.boss) {
    if (G.w.boss) out.w = { x: G.w.boss.x, y: G.w.boss.y, lift: 140 };
    else make('altar');
  }
  return out;
};
Main.updateFocus = function () {
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
  R.focus = list.length ? { list } : null;
  let b = null;
  if (mouseInFactory() && G.lastInput === 'mouse') {
    const [tx, ty] = hoverTile(R.fv), c = FA.cell(tx, ty);
    if (c && c.type !== 'belt' && c.type !== 'portal') b = c;
  }
  R.hoverB = b;
  const ft = R.focus ? R.focus.list[0].t : t;
  if (!b && ft && ft.kind === 'bld') b = ft.o;
  UI.setInspect(b ? FA.status(b) : null);
  const qh = Main.questHint();
  R.hint = qh.f; R.whint = qh.w;
  UI.setHint(qh.slot && G.selected !== qh.slot ? qh.slot : null, qh.tree);
  R.aim = null;
  if (G.hands && !UI.treeOpen.L) R.aim = aimNow();
  R.ghost = null; R.demo = null;
  if (UI.treeOpen.L) return;
  const [gx, gy] = useMouseAim() || (G.lastInput === 'mouse' && mouseInFactory()) ? hoverTile(R.fv) : frontTile();
  if (G.demolish) {
    const c = FA.cell(gx, gy);
    if (c && c.type !== 'portal') R.demo = { x: gx, y: gy, label: c.type === 'belt' ? 'BELT: +1 WOOD' : CFG.buildings[c.type].name.toUpperCase() };
    else R.demo = { x: gx, y: gy };
  } else if (G.selected !== 'hand' && FA.inb(gx, gy)) {
    const c = FA.cell(gx, gy);
    const ok = G.selected === 'belt' ? (FA.canPlace(gx, gy) || (c && c.type === 'belt')) : FA.canPlace(gx, gy) && FA.unlocked(G.selected);
    R.ghost = { type: G.selected, x: gx, y: gy, ok: !!ok, dir: G.placeDir };
  }
};

Main.pause = function (on) {
  if (!G) return;
  G.paused = on;
  UI.show('pause', on);
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
  if (STATE === 'play' && G) {
    if (!G.paused) Main.step(dt);
    else AU.hum(0);
    if (G) {
      ctx.clearRect(0, 0, CFG.W, CFG.H);
      R.drawFactory(ctx, G.paused ? 0 : dt);
      R.drawWorld(ctx, G.paused ? 0 : dt);
    }
  } else {
    AU.hum(0); AU.mix(0, 0, false);
    if (STATE !== 'intro') drawBackdrop(ts);
  }
  IN.endFrame();
}

// ---------- boot ----------
window.addEventListener('DOMContentLoaded', () => {
  ctx = $('cv').getContext('2d');
  ctx.imageSmoothingEnabled = false;
  fit();
  UI.buildMenu();
  $('btnTree').onclick = () => UI.openTree('L');
  $('btnTreeR').onclick = () => UI.openTree('R');
  $('btnDemo').onclick = () => { G.demolish = !G.demolish; AU.sfx('blip'); };
  $('btnSwap').onclick = () => UI.toast('Hold X (or Start on a pad) for 1.5 seconds to swap jobs.', 'L', 'ic_swap');
  $('btnHelp').onclick = () => UI.help();
  $('pResume').onclick = () => Main.pause(false);
  $('pQuit').onclick = () => { Main.pause(false); Main.toTitle(); };
  window.addEventListener('beforeunload', () => { if (STATE === 'play') Main.save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && STATE === 'play') Main.save(); });
  requestAnimationFrame(frame);

  const fonts = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('700 20px "Pixelify Sans"'), StudioIntro.loadFonts()]).catch(() => {})
    : Promise.resolve();
  SP.build(f => { $('loadFill').style.width = Math.round(f * 90) + '%'; }, () => {
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
        StudioIntro.run(() => { STATE = 'menu'; UI.show('menu', true); UI.menuPage('menuMain'); AU.music(true); });
      };
      setTimeout(() => { window.addEventListener('keydown', go); window.addEventListener('mousedown', go); }, 100);
    });
  });
});

// ---------- test hook ----------
window.__wands = {
  get G() { return G; },
  Main, FA, WZ, UI, R, CFG,
  start(slot) { Main.newGame(slot || 1); },
  deliver(kind) { FA.deliver(kind); },
  bank(kind, n) { for (let i = 0; i < (n || 1); i++) FA.bank(kind); },
  step(dt, n) { for (let i = 0; i < (n || 1); i++) if (G && !G.paused) Main.step(dt, { bix: 0, biy: 0, wix: 0, wiy: 0, roll: false }); },
  boss() { return WZ.summonBoss(); },
};
