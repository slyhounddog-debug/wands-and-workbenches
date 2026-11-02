'use strict';
// 3-PLAYER MODE, the runtime half (loaded after mode4run.js): a new / loaded 3P game, what each seat's input is, the Rootkeeper's own keys, his HUD, the game over (one screen per
// role, each with its own RESTART), the skill tree's 3P layer (Ash costs, his branch), the saves. The underworld itself is js/mode3.js.
//
// Seats are fixed: 0 Builder, 1 Wizard, 2 Rootkeeper (G.seats[s] = { role, name, col, who, pad, conn }). The host is whichever role he took in the lobby; the others are guests
// whose pads arrive in IN.pad[seat.pad] (Net.drive). A step's ctl is the 2P shape (bix.., wix..) plus k = the Rootkeeper's input.
(function () {
const ELS = ['air', 'water', 'fire', 'earth'];
M3.defaultSeats = () => CFG.mode3.seats.map((q, i) => ({ role: q.role, name: q.name, col: q.col, who: i === 0 ? 'host' : 'g' + i, pad: i === 0 ? -1 : i + 1, conn: true }));
M3.ctlFor = role => {
  const pad = IN.padList && IN.padList.length ? 0 : -1;
  return { kbB: role === 'B', kbW: role === 'W', pb: role === 'B' ? pad : -1, pw: role === 'W' ? pad : -1, pk: role === 'K' ? pad : -1 };
};
M3.guestSeat = () => { const i = G && G.seats ? G.seats.findIndex(q => q.who === Net.me) : -1; return i < 0 ? 1 : i; };

// a new 3P game. opts: { seats, me (the seat this machine plays) }
Main.newGame3 = function (slot, opts) {
  opts = opts || {};
  G = blankState(slot);
  G.flags.startEl = ELEMS[Math.floor(Math.random() * ELEMS.length)];
  if (opts.el) G.flags.startEl = opts.el;
  G.m3 = true; G.vi = opts.me || 0; if (opts.solo) G.solo3 = true;
  G.seats = opts.seats || M3.defaultSeats();
  G.w = WZ.fresh(); G.ev = WZ.evFresh(0);
  FA.initial();
  M3.setup();
  G.ctl = Object.assign({}, G.ctl, M3.ctlFor(M3.ROLE[G.vi]));
  const intro = Main.introPending;
  Main.enter();
  M3.netUi(M3.ROLE[G.vi]);   // (this machine's role decides the HUD, online or in a test)
  if (!intro) { UI.help(true); G.helpT = 25; }
  Main.save();
};
// open a 3P save: the shared half (factory, Stockpile, tree, goals) loads as in 2P, then the underworld is put back
Main.loadGame3 = function (slot, opts) {
  opts = opts || {};
  const s = UI.slotInfo(slot);
  if (!s || s.old || !s.m3) return false;
  Main.applySave(slot, s);
  G.m3 = true; G.vi = opts.me || 0;
  G.seats = opts.seats || M3.defaultSeats();
  G.u = M3.fix(s.m3);
  G.ctl = Object.assign({}, G.ctl, M3.ctlFor(M3.ROLE[G.vi]));
  Main.enter();
  M3.netUi(M3.ROLE[G.vi]);
  return true;
};

// ---------- input: every seat's ----------
// the Rootkeeper on this machine: his keys (Keys 'K' actions: remappable), the mouse buttons and a pad
const clamp1 = v => Math.max(-1, Math.min(1, v));
M3.localK = function (dt) {
  const p = G.ctl.pk >= 0 ? IN.pad[G.ctl.pk] : null, mv = Keys.move('K'), k = M3.zeroK();
  const overPip = () => { const r = R.pipRect, m = IN.mouse; return !!(r && m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h); };
  if (IN.hit('Escape')) {
    if (UI.treeOpen.L || UI.treeOpen.R) { UI.openTree('L', false); UI.openTree('R', false); }
    else if (G.u.rk.tool || G.u.rk.hose) k.tool = 'clear';
    else Main.pause(true);
    return k;
  }
  if (Keys.hit('treeK') || (p && p.back)) UI.openTree('R');
  if (Keys.hit('help')) { UI.help(); G.helpT = 0; }
  if (Keys.hit('book')) Book.open();
  if (Keys.hit('pip3') || (p && p.l3)) M3D.cyclePip();
  if (G.helpT > 0) { G.helpT -= dt; if (G.helpT <= 0) UI.help(false); }
  if (UI.treeOpen.R) { Main.treePads(dt, null, p); return k; }
  k.ix = clamp1(mv[0] + (p ? p.ix : 0)); k.iy = clamp1(mv[1] + (p ? p.iy : 0));
  k.pick = Keys.hit('kPick') || (IN.mouse.lp && !overPip()) || !!(p && p.a);
  k.throw = Keys.hit('kThrow') || (IN.mouse.rp && !overPip()) || !!(p && p.b);
  k.use = Keys.hit('kUse') || !!(p && p.x);
  k.roll = Keys.hit('kRoll') || !!(p && p.rt);
  k.ghost = Keys.hit('kGhost') || !!(p && p.y);
  if (Keys.hit('kTool')) k.tool = 'clear';
  else if (Keys.hit('kPrev') || (p && p.lb)) k.tool = 'prev';
  else if (Keys.hit('kNext') || (p && p.rb)) k.tool = 'next';
  else for (let i = 1; i <= 8; i++) if (Keys.hit('kSlot' + i)) k.tool = i - 1;
  return k;
};
// a Rootkeeper guest's pad (his keys were mapped onto it by Net.collect): A pick, B throw, X use, RT roll, Y ghost view, LB / RB tools, bi = the toolbar keys
M3.padK = function (p) {
  const k = M3.zeroK();
  if (!p) return k;
  k.ix = clamp1(p.ix || 0); k.iy = clamp1(p.iy || 0);
  k.pick = !!p.a; k.throw = !!p.b; k.use = !!p.x; k.roll = !!p.rt; k.ghost = !!p.y;
  if (p.lb) k.tool = 'prev'; else if (p.rb) k.tool = 'next';
  if (p.bi) for (const s of p.bi) { if (s === 'clear') k.tool = 'clear'; else if (/^sel\d$/.test(s)) k.tool = +s.slice(3) - 1; }
  return k;
};
M3.controls = function (dt) {
  if (G.solo3 && !Main.modal()) M3.soloKeys();
  const me = M3.me(), role = M3.ROLE[me];
  let B = { bix: 0, biy: 0, broll: false }, W = { wix: 0, wiy: 0, roll: false, wrx: 0, wry: 0, act: {} }, K = M3.zeroK();
  if (role === 'K') {
    if (Main.modal()) { if (IN.hit('Escape') && Main.menuUp && !Book.isOpen) Main.pause(false); }   // (behind the pause menu Esc closes it, as it does for the other roles)
    else K = M3.localK(dt);
  }
  else {
    const c = Main.modal() ? Main.wizardOnly() : Main.controls(dt);
    if (role === 'B') B = { bix: c.bix, biy: c.biy, broll: c.broll };
    else {
      W = { wix: c.wix, wiy: c.wiy, roll: c.roll, wrx: c.wrx, wry: c.wry, act: c.act };
      const p1 = Main.padW();
      if (!Main.modal() && (Keys.hit('wGhost') || (p1 && p1.rt))) M3.ghostW();
    }
    if (!Main.modal() && (Keys.hit('pip3') || (role === 'W' && Main.padW() && Main.padW().l3))) M3D.cyclePip();   // (a Builder's pad L3 pins blueprints: his corner picture cycles on the key)
  }
  for (let s = 0; s < 3; s++) {
    if (s === me) continue;
    const q = G.seats[s], pi = G.solo3 && M3.ROLE[s] === 'W' && DevBot.on && DevBot.st && DevBot.st.slot !== undefined ? DevBot.st.slot : q && q.pad, p = pi >= 0 ? IN.pad[pi] : null;   // (the solo test: the dev bot's pad plays the Wizard when he is not your seat)
    if (M3.ROLE[s] === 'B') B = Main.remoteB(dt, p);
    else if (M3.ROLE[s] === 'W') { W = M4.wizPad(p); if (p && p.rt) M3.ghostW(); }
    else K = M3.padK(p);
  }
  if (G.w.dead) W = { wix: 0, wiy: 0, roll: false, wrx: 0, wry: 0, act: {} };
  return Object.assign({}, B, W, { k: K });
};
M3.ghostW = function () { const u = G.u; u.ghost.W = !u.ghost.W; AU.sfx(u.ghost.W ? 'menu_open' : 'menu_close'); FA.fb('ghost-view'); };

// ---------- the solo test (Online > 3 PLAYER > SOLO): one person, offline, plays every seat in turn ----------
// F8 moves this machine to the next seat (Builder > Wizard > Rootkeeper), F9 lets the dev bot play the Wizard (so kills drop remains while you are another role).
// The seats you are not in stand still. Nothing is saved (Main.save skips G.solo3), and your RESTART readies everybody.
const SOLO_NAME = { B: 'BUILDER', W: 'WIZARD', K: 'ROOTKEEPER' }, SOLO_IC = { B: 'ic_wrench', W: 'ic_hat', K: 'ic_root' };
M3.soloStart = function () {
  const seats = M3.defaultSeats().map((q, i) => Object.assign(q, { pad: i === 1 ? 1 : -1 }));   // (the Wizard's seat reads pad 2: a second pad, or the dev bot)
  Net.on = false; Net.mode = 3;
  Main.newGame3(0, { el: ELS[Math.floor(Math.random() * 4)], seats, me: 0, solo: true });
  IN.squelch();
  UI.toast('SOLO TEST: F8 switches role, F9 lets the bot play the Wizard', 'L', 'ic_root');
};
M3.soloSwitch = function (role) {
  const s = role ? M3.ROLE.indexOf(role) : (G.vi + 1) % 3;
  if (s < 0 || s === G.vi) return;
  role = M3.ROLE[s];
  UI.openTree('L', false); UI.openTree('R', false); Book.close(true); UI.help(false);
  const bot = !!DevBot.on;
  if (bot) DevBot.unplug();
  G.vi = s; G.ctl = Object.assign({}, G.ctl, M3.ctlFor(role));
  if (bot) DevBot.plug();
  G.drag = null; G.carry = null; G.carryHold = null; G.ibuf = null; G.lock = null;
  R.focus = null; R.aim = null; R.ghost = null; R.demo = null; R.hoverB = null; R.rot = null;
  R.fcam.x = G.bd.x; R.fcam.y = G.bd.y; R.wcam.x = G.w.x; R.wcam.y = G.w.y; R.ucam.x = G.u.rk.x; R.ucam.y = G.u.rk.y;
  IN.squelch();
  M3.netUi(role); UI.resetCache(); UI.buildHotbar(); M3.hudSig = '';
  if (G.w.dead) UI.showResults3();
  AU.sfx('tab');
  UI.toast('SOLO TEST: you are the ' + SOLO_NAME[role], role === 'B' ? 'L' : role === 'W' ? 'R' : 'K', SOLO_IC[role]);
};
M3.soloKeys = function () {
  if (IN.hit('F8')) M3.soloSwitch();
  if (IN.hit('F9')) DevBot.toggle();
};
M3.soloSig = '';
M3.soloChip = function () {
  const el = $('solo3');
  if (!el) return;
  const on = !!(G && G.m3 && G.solo3 && STATE === 'play');
  el.classList.toggle('hidden', !on);
  if (!on) return;
  const r = M3.myRole(), h = '<div>' + UI.img(SOLO_IC[r], 16) + '<b>SOLO TEST</b> YOU: <b style="color:' + M3.col(G.vi) + '">' + SOLO_NAME[r] + '</b></div><div><kbd>F8</kbd> next role</div><div><kbd>F9</kbd> bot plays the Wizard: <b>' + (DevBot.on ? 'ON' : 'OFF') + '</b></div>';
  if (h !== M3.soloSig) { M3.soloSig = h; el.innerHTML = h; }
};

// ---------- the game over: the Wizard down ends the run (as in 2P); every connected player readies on his own screen ----------
M3.deadFlow = function (dt) {
  const w = G.w;
  if (!w.dead) return;
  w.deadT = (w.deadT || 0) + dt;
  const rd = w.ready || (w.ready = { B: false, W: false, K: false });
  if (w.deadT > 1) for (let s = 0; s < 3; s++) { if (s === M3.me()) continue; const q = G.seats[s], p = q && q.pad >= 0 ? IN.pad[q.pad] : null; if (p && p.a) rd[M3.ROLE[s]] = true; }   // a guest's RESTART (his A)
  const all = M3.ROLE.every(r => rd[r] || !M3.conn(r)) || (G.solo3 && rd[M3.myRole()]);   // (the solo test: your RESTART is everybody's)
  if (all) { WZ.reenter(); R.wcam.x = G.w.x; R.wcam.y = G.w.y; AU.sfx('buy'); UI.show('results', false); }
  else UI.resultsSync();
};
// his stats this run (the counters that only grow, against the run's start: G.w.run.k0)
UI.rootStatsHtml = function () {
  const st = G.u.st, k0 = G.w.run.k0 || st, d = k => Math.max(0, (st[k] || 0) - (k0[k] || 0));
  const rows = [['ic_clock', 'Survived', Math.floor(G.w.time / 60) + ':' + String(Math.floor(G.w.time) % 60).padStart(2, '0')], ['rem_earth', 'Remains collected', d('picked')], ['u_burner', 'Remains burned', d('burned')],
    ['n_tree', 'Nodes planted', d('planted')], ['m3_stump', 'Nodes recharged', d('manifest')], ['t_dmg', 'Traps placed', d('traps')], ['ic_skull', 'Trap hits', d('trapHits')],
    ['ic_root', 'Spells sent from below', d('sent')], ['rem_water', 'Remains banked', d('banked')], ['ash_fire', 'Ash lifted', d('ash')]];
  return '<div class="stats">' + rows.map(s => '<div>' + UI.img(s[0], 16) + '<span>' + s[1] + '</span><b>' + s[2] + '</b></div>').join('') + '</div>';
};
UI.showResults3 = function () {
  const role = M3.myRole(), el = $('results'), eb = $('resultsB');
  eb.classList.add('hidden');
  const body = role === 'B' ? UI.builderStatsHtml() : role === 'W' ? UI.statsHtml() : UI.rootStatsHtml();
  const head = role === 'B' ? ['b:forge', 'BUILDER: GAME OVER'] : role === 'W' ? ['ic_skull', 'WIZARD: GAME OVER'] : ['ic_root', 'ROOTKEEPER: GAME OVER'];
  el.innerHTML = '<div class="rIcon">' + UI.img(head[0], 48) + '</div><h2>' + head[1] + '</h2>' + UI.killerHtml() + body +
    '<p>The factory, the underworld, the stockpile, XP, bank and skill tree are all safe. Every connected player presses RESTART on his own screen.</p><div id="rSeats"></div>' +
    '<button class="big" id="rRe3">RESTART</button><button class="big ghost" id="rTitle">TITLE</button>';
  el.classList.remove('hidden'); el.classList.add('r3');
  UI.resSig = '';
  $('rRe3').onclick = () => {
    if (!G.w.dead) return;
    if (Net.role === 'guest') { Net.latchPress('a'); AU.sfx('buy'); return; }   // his A button readies him on the host
    const rd = G.w.ready, r = M3.myRole(); rd[r] = !rd[r]; AU.sfx(rd[r] ? 'buy' : 'blip');
  };
  $('rTitle').onclick = () => { el.classList.add('hidden'); Main.toTitle(); };
  FA.fb('rk-results');
  UI.resultsSync3();
};
UI.resultsSync3 = function () {
  const el = $('results');
  if (!el || el.classList.contains('hidden') || !G) return;
  if (!G.w.dead) { el.classList.add('hidden'); el.classList.remove('r3'); return; }
  const rd = G.w.ready || {}, sig = M3.ROLE.map(r => (rd[r] ? 1 : 0) + (M3.conn(r) ? 'c' : 'a')).join('') + Net.role + M3.me();
  if (sig === UI.resSig) return;
  UI.resSig = sig;
  $('rSeats').innerHTML = G.seats.map(q => '<span style="color:' + q.col + ';margin:0 10px">' + q.name + ': ' + (!M3.conn(q.role) ? 'AWAY' : rd[q.role] ? 'READY' : 'WAITING') + '</span>').join('');
  const b = $('rRe3'), mine = !!rd[M3.myRole()];
  b.textContent = mine ? 'READY' : 'RESTART'; b.classList.toggle('ghost', mine);
};
{
  const show0 = UI.showResults, sync0 = UI.resultsSync;
  UI.showResults = function () { if (G && G.m3) return UI.showResults3(); $('results').classList.remove('r3'); return show0(); };
  UI.resultsSync = function () { if (G && G.m3) return UI.resultsSync3(); return sync0(); };
}

// ---------- the skill tree's 3P layer: Ash costs on every node, the Rootkeeper's branch ----------
// Distribution rule: tier L (0-based) of every track costs CFG.mode3.ash.base + floor(L / every) Ash of ONE element; the element rotates Air, Water, Fire, Earth over every tier
// of the whole tree in the order it is drawn (branch by branch, node by node, tier by tier), so the four Ashes are spread evenly over all branches; an unlock node costs
// `unlock` of its element; Summoning costs `summon` of each element.
let ORD = null;
const ordOf = () => {
  if (ORD) return ORD;
  ORD = {}; let n = 0;
  for (const br of CFG.branches) for (const id of br.nodes) { const nd = CFG.tree.find(t => t.id === id); if (!nd) continue; ORD[id] = n; n += nd.tiers ? nd.tiers.length : 1; }
  return ORD;
};
M3.ashOf = function (n, L) {
  const A = CFG.mode3.ash, o = {};
  if (n.id === 'summon') { for (const el of ELS) o['ash_' + el] = A.summon; return o; }
  const i = ordOf()[n.id];
  if (i === undefined) return o;
  o['ash_' + ELS[(i + L) % 4]] = n.tiers ? A.base + Math.floor(L / A.every) : A.unlock;
  return o;
};
{
  const cost0 = UI.nodeCost;
  UI.nodeCost = function (n) {
    if (n.m3 && !(G && G.m3)) return null;   // (outside 3P the Rootkeeper's nodes do not exist)
    const c = cost0(n);
    if (!c || !(G && G.m3)) return c;
    const out = { xp: c.xp, pay: Object.assign({}, c.pay) }, add = M3.ashOf(n, UI.nodeLevel(n));
    for (const k in add) out.pay[k] = (out.pay[k] || 0) + add[k];
    return out;
  };
  const stats0 = UI.nodeStats;
  UI.nodeStats = function (n) {
    if (!n.m3) return stats0(n);
    const L = UI.nodeLevel(n), U = CFG.mode3.upgrade, nx = n.tiers && L < n.tiers.length ? L + 1 : null, row = (label, f) => [label, f(L), nx === null ? null : f(nx)];
    const pct = v => '+' + Math.round(v * 100) + '%';
    switch (n.id) {
      case 'rkroll': return [['Rootkeeper roll', G.tree.rkroll ? 'YES' : 'no'], ['Cooldown', CFG.mode3.rk.rollCd + 's']];
      case 'rkspeed': return [row('Rootkeeper speed', l => pct(U.rkspeed * l))];
      case 'rkheavy': return [row('Burner output', l => (CFG.mode3.burner.out * (1 + U.rkheavy * l)).toFixed(2) + ' / s')];
      case 'rkpole': return [['Standard pole reach', CFG.mode3.reach * CFG.mode3.poleK + ' tiles'], ['Heavy pole reach', CFG.mode3.reach * CFG.mode3.heavyPoleK + ' tiles']];
      case 'rkhands': return [row('Things carried', l => '' + (CFG.mode3.rk.hands + U.rkhands * l))];
      case 'rkmash': return [row('Mash charge', l => pct(U.rkmash * l))];
      case 'rktrap': return [row('Trap strength', l => pct(U.rktrap * l)), row('Re-arm time', l => '-' + Math.round(Math.min(0.7, 0.15 * l) * 100) + '%')];
      case 'rkthrift': return [row('Burn time per remain', l => (CFG.mode3.burner.burnT * (1 + U.rkthrift * l)).toFixed(1) + 's')];
    }
    return [];
  };
  // the tree: the 4th column, and the Ash in the bank row
  const tree0 = UI.renderTree;
  UI.renderTree = function (side) {
    tree0(side);
    if (!(G && G.m3)) return;
    const el = $(side === 'L' ? 'treeL' : 'treeR'), cols = el.querySelector('.cols'), row = el.querySelector('.bankRow');
    if (cols) cols.classList.add('c4');
    if (row) row.insertAdjacentHTML('beforeend', ELS.filter(e => G.bank['ash_' + e] > 0).map(e => '<span class="bk">' + UI.img('ash_' + e, 16) + G.bank['ash_' + e] + '</span>').join(''));
  };
  // the HUD: Ash in the top bar for everyone, the Rootkeeper's own card on his screen
  const hud0 = UI.updateHud;
  UI.updateHud = function (dt) {
    hud0(dt);
    M3.soloChip();
    if (!(G && G.m3 && G.u)) { const e = $('rootHud'); if (e && !e.classList.contains('hidden')) e.classList.add('hidden'); const a = $('tAsh'); if (a && a.innerHTML) a.innerHTML = ''; return; }
    M3.hud();
  };
}
M3.hudSig = '';
M3.hud = function () {
  let a = $('tAsh');
  if (!a) { a = document.createElement('div'); a.id = 'tAsh'; a.className = 'res ash'; $('topbar').appendChild(a); }
  const ah = ELS.map(e => UI.img('ash_' + e, 16) + '<b>' + (G.bank['ash_' + e] || 0) + '</b>').join('');
  if (a.dataset.h !== ah) { a.dataset.h = ah; a.innerHTML = ah; }
  const st = $('seatTag'), q = G.seats[M3.me()];
  if (q) { const h = '<b style="color:' + q.col + '">' + q.name + '</b>'; if (st.dataset.h !== h) { st.dataset.h = h; st.innerHTML = h; st.style.borderColor = q.col; } st.classList.remove('hidden'); }
  const el = $('rootHud');
  if (!el) return;
  const mine = M3.myRole() === 'K';
  el.classList.toggle('hidden', !mine);
  if (!mine) return;
  const u = G.u, rk = u.rk, cap = M3.cap();
  let hands = '';
  for (let i = 0; i < cap; i++) hands += rk.hands[i] ? '<span class="hs' + (i === rk.hands.length - 1 ? ' fr' : '') + '">' + UI.img(rk.hands[i], 16) + '</span>' : '<span class="hs em"></span>';
  const tools = M3.TOOLS.map((t, i) => { const id = t === 'pole' && rk.tool === 'hpole' ? 'hpole' : t, on = rk.tool === t || (t === 'pole' && rk.tool === 'hpole'), ic = t === 'hose' ? 'ic_root' : t === 'remove' ? 'ic_bomb' : 'u_' + id;
    return '<span class="kt' + (on ? ' on' : '') + '" title="' + CFG.mode3.bld[id].name + '">' + UI.img(ic, 22) + '<kbd>' + Keys.label('kSlot' + (i + 1)) + '</kbd></span>'; }).join('');
  const bank = ELS.map(e => UI.img('rem_' + e, 18) + '<b>' + (u.bank[e] || 0) + '</b>').join('');
  const gh = '<span class="kg' + (u.ghost.K ? ' on' : '') + '">' + UI.img('ic_ghost', 16) + '<kbd>' + Keys.label('kGhost') + '</kbd></span>';
  const roll = G.tree.rkroll ? '<span class="kg' + (rk.rollCd > 0 ? '' : ' on') + '">' + UI.img('ic_swap', 16) + '<kbd>' + Keys.label('kRoll') + '</kbd></span>' : '';
  const h = '<div class="clabel">' + UI.img('ic_root', 16) + '<b>ROOTKEEPER</b>' + gh + roll + '</div><div class="kbank">' + UI.img('u_pylon', 18) + bank + '</div><div class="khands">' + hands + '</div><div class="ktools">' + tools + '</div>' +
    (rk.tool ? '<div class="ktool">' + CFG.mode3.bld[rk.tool].name.toUpperCase() + (rk.hose ? ': CLICK THE NEXT BUILDING' : '') + '</div>' : '');
  if (h !== M3.hudSig) { M3.hudSig = h; el.innerHTML = h; }
};

// ---------- what this machine shows (host) ----------
M3.draw = function (ctx, dt) {
  const r = M3.myRole(), full = { x0: 0, w: CFG.W };
  if (r === 'B') R.drawFactory(ctx, dt, full); else if (r === 'W') R.drawWorld(ctx, dt, full); else R.drawUnder(ctx, dt, full);
  M3D.drawPip(ctx, dt);
  if (r === 'K') AU.setEar(G.u.rk.x, G.u.rk.y);   // (the wilds' sounds reach him from above his own spot)
};
// a guest's frame, from its seat (called by Main.guestFrame after the snapshot is in and the keys are read)
M3.guestView = function (dt) {
  const r = M3.myRole();
  const bh = Main.hintFor(QUESTS.B[G.quest.B]), wh = Main.hintFor(QUESTS.W[G.quest.W]);
  R.hint = bh.f; R.whint = wh.w; R.aim = null; R.ghost = null; R.demo = null; R.hoverB = null; R.rot = null;
  if (r === 'B') { G.lastInput = 'pad'; R.focus = null; Main.updateFocus(); UI.setHint(bh.slot || null, !!bh.tree, false); }
  else { R.focus = null; UI.setHint(null, false, r === 'W' ? wh.tree : false); }
  if (Keys.hit('pip3') || (IN.pad[0] && IN.pad[0].l3)) M3D.cyclePip();
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  M3.draw(ctx, dt);
  const w = G.w;
  let near = 0;
  if (!w.dead) for (const e of w.enemies) if (Math.abs(e.x - w.x) < 10 && Math.abs(e.y - w.y) < 10) near++;
  if (r !== 'K') AU.setEar(w.x, w.y);
  AU.hum(r === 'B' ? Math.min(1, G.fac.working / 10) : 0); AU.mix(r === 'B' ? Math.min(1, G.fac.working / 8) : 0, Math.min(1, near / 8), !!w.boss); AU.layerMix(G.fac.weather);
  AU.muffle(!!(UI.treeOpen.R || UI.treeOpen.L || Main.menuUp));
  UI.updateHud(dt);
};
// the HUD layout and the controls card for this machine's role
M3.netUi = function (role) {
  Main.netUi(role === 'B' ? 'host' : role === 'W' ? 'guest' : 'root');
  const g = $('game');
  g.classList.toggle('onRoot', role === 'K');
  if (role !== 'K') return;
  const k = id => '<kbd>' + Keys.labels(id).replace(/ \/ /g, '</kbd> <kbd>') + '</kbd>', mv = ['Up', 'Left', 'Down', 'Right'].map(d => '<kbd>' + Keys.label('K' + d) + '</kbd>').join('');
  $('help').innerHTML = '<div class="hcol"><h3>' + UI.img('ic_root', 16) + 'YOU ARE THE ROOTKEEPER</h3>' +
    '<div>' + mv + ' walk &nbsp; <kbd>LEFT CLICK</kbd> ' + k('kPick') + ' pick up remains / take from a pylon / craft &nbsp; <kbd>RIGHT CLICK</kbd> ' + k('kThrow') + ' throw into a Pylon or Burner, plant a seed or a trap</div>' +
    '<div>' + k('kUse') + ' mash a node or mirror Harvester, set a Burner\'s type, switch a crafter &nbsp; ' + k('kSlot1') + '-' + k('kSlot8') + ' tools (hose, burner, crafters, collector, pole, pylon, remove) &nbsp; ' + k('kTool') + ' put the tool away</div>' +
    '<div>' + k('kGhost') + ' ghost view (the foes and the Wizard above) &nbsp; ' + k('pip3') + ' corner picture: next teammate &nbsp; ' + k('treeK') + ' skill tree &nbsp; <kbd>ESC</kbd> menu</div>' +
    '<div>Kills above drop remains down here. Burners feed whatever their hoses reach: nodes grow trees and rocks in the wilds, traps fire on foes up there, mirror Harvesters send spells up to the Builder. Collectors lift the Ash into the skill bank.</div></div>' +
    '<div class="hfoot"><kbd>H</kbd> hides this. A pad: A pick, B throw, X use, RT roll, Y ghost view, LB / RB tools, Back tree.</div>';
  UI.decorate($('help'));
};
// the guest's keyboard as the Rootkeeper's pad (net.js calls it from Net.collect when this seat is the Rootkeeper)
M3.collectK = function (L, gp) {
  if (Keys.hit('kPick') || IN.mouse.lp || (gp && gp.a)) L.a = true;
  if (Keys.hit('kThrow') || IN.mouse.rp || (gp && gp.b)) L.b = true;
  if (Keys.hit('kUse') || (gp && gp.x)) L.x = true;
  if (Keys.hit('kRoll') || (gp && gp.rt)) L.rt = true;
  if (Keys.hit('kGhost') || (gp && gp.y)) L.y = true;
  if (Keys.hit('kPrev') || (gp && gp.lb)) L.lb = true;
  if (Keys.hit('kNext') || (gp && gp.rb)) L.rb = true;
  if (Keys.hit('treeK') || (gp && gp.back)) L.back = true;
  const bi = L.bi || (L.bi = []);
  for (let i = 1; i <= 8; i++) if (Keys.hit('kSlot' + i)) bi.push('sel' + i);
  if (Keys.hit('kTool')) bi.push('clear');
};
})();
