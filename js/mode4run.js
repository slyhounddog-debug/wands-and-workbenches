'use strict';
// 4-PLAYER MODE, the runtime half (loaded after main.js): a new 4P game, what each seat's input is, both Builders, a fallen Wizard getting up, the game over. The swapping core is js/mode4.js.
//
// A step's input in 4P is a ctl with ctl.s = [B1, B2, W1, W2] (each seat's own input), and the old top-level fields (bix, wix...) are Builder 1's and Wizard 1's so everything that reads
// the 2P shape keeps working.
M4.zeroIn = s => (s < 2 ? { bix: 0, biy: 0, broll: false } : { wix: 0, wiy: 0, roll: false, wrx: 0, wry: 0, act: {} });
// a complete ctl from the seats' inputs (missing seats stand still)
M4.ctlOf = function (seats) {
  const s = [0, 1, 2, 3].map(i => Object.assign(M4.zeroIn(i), (seats && seats[i]) || {}));
  return Object.assign({}, s[0], s[2], { s });
};
M4.defaultSeats = () => CFG.mode4.seats.map((q, i) => ({ role: q.role, n: q.n, name: q.name, col: q.col, who: i === 0 ? 'host' : 'g' + i, pad: i === 0 ? -1 : i + 1, att: null, conn: true }));

// a new 4P game. opts: { seats (G.seats), me (the seat this machine plays) }
Main.newGame4 = function (slot, opts) {
  opts = opts || {};
  M4.sel0();
  G = blankState(slot);
  G.m4 = true; G.vi = opts.me || 0;
  G.seats = opts.seats || M4.defaultSeats();
  G.w = WZ.fresh(); G.w2 = WZ.fresh2();
  G.wand2 = WZ.wandFresh(); G.aug2 = { worn: WZ.augFresh().worn, cd: { phoenix: 0 } };
  G.ev = WZ.evFresh(0);
  WZ.sIdx = 0; WZ.flow = null; WZ.flowB = null; FA.bIdx = 0;
  FA.initial();
  G.bd2 = FA.freshBuilder(); G.bd2.x += 1.5; G.bd2.y += 0.5; G.bs2 = FA.bsFresh();
  M4.setupFactory();
  G.rdy = [false, false, false, false];
  const role = M4.ROLE[G.vi];
  G.ctl = Object.assign({}, G.ctl, { kbB: role === 'B', kbW: role === 'W' });
  const intro = Main.introPending;
  Main.enter();
  if (!intro) { UI.help(true); G.helpT = 25; }
  Main.save();
};

// ---------- what each seat does this frame ----------
// the local seat plays through the normal controls (keyboard, mouse, a real pad); every other seat arrives as a pad (IN.pad[seat.pad], written by Net.drive from the guests' packets)
M4.wizPad = function (p) {
  if (!p) return M4.zeroIn(2);
  return { wix: p.ix || 0, wiy: p.iy || 0, wrx: p.rx || 0, wry: p.ry || 0, roll: !!p.a, act: { mash: !!p.x, cast: !!p.b, cycle: !!p.y, emote: !!p.rb } };
};
M4.controls = function (dt) {
  const me = M4.me(), out = [null, null, null, null];
  for (let s = 0; s < 4; s++) {
    const q = G.seats[s];
    if (s === me) {
      const bi = M4.bi(s), c = M4.ROLE[s] === 'B' ? FA.asB(bi, () => (Main.modal() ? Main.wizardOnly() : Main.controls(dt))) : (Main.modal() ? Main.wizardOnly() : Main.controls(dt));
      out[s] = M4.ROLE[s] === 'B' ? { bix: c.bix, biy: c.biy, broll: c.broll } : { wix: c.wix, wiy: c.wiy, roll: c.roll, wrx: c.wrx, wry: c.wry, act: c.act };
    } else if (M4.inject && M4.inject[s]) out[s] = M4.inject[s];
    else {
      const p = q && q.pad >= 0 ? IN.pad[q.pad] : null;
      out[s] = M4.ROLE[s] === 'B' ? FA.asB(M4.bi(s), () => Main.remoteB(dt, p)) : M4.wizPad(p);
    }
  }
  for (let i = 0; i < 2; i++) if (WZ.pw(i).dead) out[M4.seatW(i)] = M4.zeroIn(2);   // a fallen Wizard stands still
  return M4.ctlOf(out);
};
M4.moveBuilders = function (dt, ctl) {
  for (let i = 0; i < 2; i++) {
    const s = ctl.s ? ctl.s[M4.seatB(i)] : i === 0 ? ctl : M4.zeroIn(0);
    FA.asB(i, () => { if (s.broll) FA.builderRoll(s.bix, s.biy); FA.moveBuilder(dt, s.bix || 0, s.biy || 0); });
  }
};
M4.wizard2 = function (dt, ctl) {
  const s = ctl.s ? ctl.s[3] : M4.zeroIn(3);
  WZ.update2(dt, s.wix || 0, s.wiy || 0, !!s.roll, s.wrx || 0, s.wry || 0, s.act || {});
  M4.spellTick();
  M4.worldTick(dt);   // (burning foes)
};

// ---------- a fallen Wizard, the game over ----------
M4.revive = function (i) {
  const o = WZ.pw(1 - i), cfg = CFG.mode4;
  WZ.as(i, () => {
    const w = G.w, spot = o.dead ? null : WZ.dryNear(o.x, o.y, 8, [1, 2]);
    w.dead = false; w.deadT = 0; w.deadHandled = false; w.hp = Math.max(1, Math.round(WZ.maxHp() * cfg.respawnHp)); w.armor = 0;
    w.hurt = null; w.killer = null; w.vx = 0; w.vy = 0; w.roll = 0; w.hurtT = 0.8;
    if (spot) { w.x = spot[0]; w.y = spot[1]; }
    WZ.ring(w.x, w.y, 2.2, M4.col(M4.seatW(i)), 0.5); WZ.puff(w.x, w.y, '#ffffff', 14); AU.sfx('powerup');
    FA.fb('revive');
  });
};
M4.deadFlow = function (dt) {
  const cfg = CFG.mode4;
  for (let i = 0; i < 2; i++) {
    const q = WZ.pw(i);
    if (q.dead) { q.deadT = (q.deadT || 0) + dt; if (!WZ.over() && q.deadT >= cfg.respawnT) M4.revive(i); }
  }
  if (!WZ.over()) { G.over = false; return; }
  if (!G.over) {   // both are down: the run is over
    G.over = true; G.rdy = [false, false, false, false];
    setTimeout(() => { if (G && G.over) UI.showResults(); }, 900);
  }
  G.overT = (G.overT || 0) + dt;
  if (G.overT > 1) G.seats.forEach((q, s) => { const p = q.pad >= 0 ? IN.pad[q.pad] : null; if (p && p.a) G.rdy[s] = true; });   // a guest's A button readies him
  // restart needs every CONNECTED player ready (RESTART button, or A / the roll button on a pad)
  const ready = G.seats.every((q, i) => G.rdy[i] || q.conn === false);
  if (ready) { G.over = false; G.overT = 0; WZ.reenter(); R.wcam.x = G.w.x; R.wcam.y = G.w.y; AU.sfx('buy'); UI.show('results', false); }
  else UI.resultsSync();
};

// ---------- what this machine's screen shows (4P) ----------
// the picture is drawn from the viewer's seat: his own character is selected (so every "the Wizard" / "the Builder" in the drawing and the HUD is HIM) and the other world in the
// corner follows his buddy (B1 - W1, B2 - W2). A Builder seat sees the factory full screen, a Wizard seat the wilds.
M4.draw = function (ctx, dt) {
  const s = M4.me();
  M4.asSeat(s, () => {
    if (M4.ROLE[s] === 'B') R.drawFactory(ctx, dt, { x0: 0, w: CFG.W }); else R.drawWorld(ctx, dt, { x0: 0, w: CFG.W });
    R.drawPip(ctx, dt);
  });
};
M4.guestSeat = () => { const i = G.seats.findIndex(q => q.who === Net.me); return i < 0 ? 0 : i; };
// the guest's frame, from its seat (called by Main.guestFrame after the snapshot is in and the keys are read)
M4.guestView = function (dt) {
  const s = G.vi, role = M4.ROLE[s];
  M4.asSeat(s, () => {
    const bh = Main.hintFor(QUESTS.B[G.quest.B]), wh = Main.hintFor(QUESTS.W[G.quest.W]);
    R.hint = bh.f; R.whint = wh.w; R.aim = null; R.ghost = null; R.demo = null; R.hoverB = null; R.rot = null;
    if (role === 'B') { G.lastInput = 'pad'; R.focus = null; Main.updateFocus(); UI.setHint(bh.slot || null, !!bh.tree, false); }
    else { R.focus = null; UI.setHint(null, false, wh.tree); }
    ctx.clearRect(0, 0, CFG.W, CFG.H);
    if (role === 'B') R.drawFactory(ctx, dt, { x0: 0, w: CFG.W }); else R.drawWorld(ctx, dt, { x0: 0, w: CFG.W });
    R.drawPip(ctx, dt);
    const w = G.w;
    let near = 0;
    if (!w.dead) for (const e of w.enemies) if (Math.abs(e.x - w.x) < 10 && Math.abs(e.y - w.y) < 10) near++;
    AU.setEar(w.x, w.y);
    AU.hum(role === 'B' ? Math.min(1, G.fac.working / 10) : 0); AU.mix(role === 'B' ? Math.min(1, G.fac.working / 8) : 0, Math.min(1, near / 8), !!w.boss); AU.layerMix(G.fac.weather);
    AU.muffle(!!(UI.treeOpen.R || UI.treeOpen.L || Main.menuUp));
    UI.updateHud(dt);
  });
};

// ---------- the game over screen (4P): every connected player presses READY ----------
UI.showResults4 = function () {
  const el = $('results');
  const killers = [0, 1].map(i => { const k = WZ.pw(i).killer; if (!k) return ''; const e = k.el && ELEM[k.el] ? k.el : null; return '<div class="killer">' + UI.img(k.ic, 40) + '<div><b><span style="color:' + M4.col(M4.seatW(i)) + '">' + M4.wname(i) + '</span> WAS KILLED BY ' + k.n.toUpperCase() + '</b>' + (e ? '<span>weak to ' + UI.img(e, 18) + '<em style="color:' + ELEM[e].color + '">' + ELEM_WORD[e].toUpperCase() + '</em>: Builders, send ' + ELEM_WORD[e] + ' spells</span>' : '') + '</div></div>'; }).join('');
  el.innerHTML = '<div class="rIcon">' + UI.img('ic_skull', 48) + '</div><h2>GAME OVER</h2>' + killers + UI.statsHtml() + '<p>The factory, stockpile, XP, bank and skill tree are all safe. Everybody presses READY to go again.</p><div id="rSeats"></div>' +
    '<button class="big" id="rReMe">READY</button><button class="big ghost" id="rTitle">TITLE</button>';
  el.classList.remove('hidden');
  UI.resSig = '';
  $('rReMe').onclick = () => {
    if (!G.over) return;
    if (Net.role === 'guest') { Net.latchPress('a'); AU.sfx('buy'); return; }   // his A button readies him on the host; the panel shows it from the next snapshot
    const me = M4.me(); G.rdy[me] = !G.rdy[me]; AU.sfx(G.rdy[me] ? 'buy' : 'blip');
  };
  $('rTitle').onclick = () => { el.classList.add('hidden'); Main.toTitle(); };
  UI.resultsSync4();
};
UI.resultsSync4 = function () {
  const el = $('results');
  if (!el || el.classList.contains('hidden') || !G) return;
  if (!G.over) { el.classList.add('hidden'); return; }
  const sig = (G.rdy || []).map(r => (r ? 1 : 0)).join('') + G.seats.map(q => (q.conn === false ? 0 : 1)).join('') + Net.role + (G.vi || 0);
  if (sig === UI.resSig) return;
  UI.resSig = sig;
  $('rSeats').innerHTML = G.seats.map((q, i) => '<span style="color:' + q.col + ';margin:0 10px">' + q.name + ': ' + (q.conn === false ? 'AWAY' : G.rdy[i] ? 'READY' : 'WAITING') + '</span>').join('');
  const me = M4.me(), b = $('rReMe');
  b.textContent = G.rdy[me] ? 'READY' : 'READY?'; b.classList.toggle('ghost', !!G.rdy[me]);
};

// ---------- saves (4P) ----------
// a 4P save is the 2P save of Builder 1 and Wizard 1 (all the shared things: Stockpile, factory, tree, goals, stats) plus m4: the second Builder's hands and place, the second Wizard's
// wand and garments, and each seat's attunement (fixed for the save). The save is tagged m4: a 2P menu refuses it and a 4P room refuses a 2P save.
M4.saveData = function () {
  return { v: 1, hands2: G.bs2.hands, bd2: { x: G.bd2.x, y: G.bd2.y }, wand2: G.wand2, aug2: G.aug2, placeDir2: G.bs2.placeDir, atts: G.seats.map(q => q.att || null) };
};
// open a 4P save: the shared half loads exactly as in 2P, then the second Builder / Wizard are put back
Main.loadGame4 = function (slot, opts) {
  opts = opts || {};
  const s = UI.slotInfo(slot);
  if (!s || s.old || !s.m4) return false;
  M4.sel0();
  Main.applySave(slot, s);
  const d = s.m4;
  G.m4 = true; G.vi = opts.me || 0;
  G.seats = opts.seats || M4.defaultSeats();
  if (d.atts) G.seats.forEach((q, i) => { if (d.atts[i]) q.att = d.atts[i].slice(); });   // (the attunements are fixed for the save)
  G.w2 = WZ.fresh2(); G.wand2 = WZ.wandFix ? WZ.wandFix(d.wand2) : WZ.wandFresh(); G.aug2 = { worn: Object.assign(WZ.augFresh().worn, (d.aug2 && d.aug2.worn) || {}), cd: { phoenix: 0 } };
  G.bd2 = FA.freshBuilder(); if (d.bd2) { G.bd2.x = d.bd2.x; G.bd2.y = d.bd2.y; }
  G.bs2 = FA.bsFresh(); G.bs2.hands = (d.hands2 || []).filter(h => h && ITEMS[h.kind]).slice(0, FA.cap()); G.bs2.placeDir = d.placeDir2 || 0;
  G.rdy = [false, false, false, false];
  WZ.sIdx = 0; FA.bIdx = 0; WZ.flow = null; WZ.flowB = null;
  const role = M4.ROLE[G.vi];
  G.ctl = Object.assign({}, G.ctl, { kbB: role === 'B', kbW: role === 'W' });
  Main.enter();
  return true;
};
