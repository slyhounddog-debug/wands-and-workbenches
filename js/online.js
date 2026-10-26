'use strict';
// Online co-op glue (Phase 1): everything the game itself does to host or join a room. The transport is js/net.js (the only file that knows PeerJS); this file wires it into
// the menus, the main loop and the HUD. Host = Builder (runs the sim exactly as offline play does), guest = Wizard (renders snapshots, sends a pad). Loaded after main.js.
//
// What changes while Net.on (and nothing changes when it is off):
//  - nothing ever freezes the sim: a skill tree, the pause menu or the Collection Book only holds ITS player still (Main.menuUp instead of G.paused; no "And..." beat)
//  - the player's own world fills the stage, the partner's is a picture-in-picture (R.drawPip); job swap is off; the host's Wizard is a virtual pad (Net.drive)
//  - the guest runs no simulation: Main.guestFrame draws the newest snapshot of G and its HUD reads it
Main.menuUp = false;   // online: the pause menu is up (G.paused stays false)
Main.isPaused = () => !!(G && (G.paused || Main.menuUp));
Main.modal = () => Net.role === 'host' && (Main.menuUp || Book.isOpen);
// the host's Builder is held still behind a menu / the book; the Wizard (the guest's virtual pad) carries on
Main.wizardOnly = function () {
  const p1 = Main.padW();
  if (IN.hit('Escape') && Main.menuUp && !Book.isOpen) Main.pause(false);
  return { bix: 0, biy: 0, wix: p1 ? p1.ix : 0, wiy: p1 ? p1.iy : 0, wrx: p1 ? p1.rx || 0 : 0, wry: p1 ? p1.ry || 0 : 0, roll: !!(p1 && p1.a), hold: !!(p1 && p1.x), broll: false };
};

// ---------- banners over the game ----------
Main.nbKind = null;
Main.netBanner = function (kind, msg) {
  const el = $('netBanner');
  Main.nbKind = kind;
  if (!kind) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const code = Net.code ? '<p>Room code <b>' + Net.code + '</b></p>' : '';
  let h = '';
  if (kind === 'hostLost') h = '<h2>PLAYER 2 DISCONNECTED</h2><p>The game is frozen. They can come back with the same room code in <b id="nbSec">60s</b>.</p>' + code + '<div class="splitBtns"><button class="big ghost" id="nbQuit">SAVE &amp; TITLE</button></div>';
  else if (kind === 'guestLost') h = '<h2>CONNECTION LOST</h2><p id="nbMsg">The host stopped answering. Try to rejoin the same room' + (Net.code ? ' (<b>' + Net.code + '</b>)' : '') + '.</p><div class="splitBtns"><button class="big" id="nbRejoin">REJOIN</button><button class="big ghost" id="nbTitle">TITLE</button></div>';
  else if (kind === 'ended') h = '<h2>GAME OVER</h2><p>' + (msg || 'The host ended the game.') + '</p><div class="splitBtns"><button class="big" id="nbTitle">TITLE</button></div>';
  else if (kind === 'loading') h = '<h2>JOINED!</h2><p>Waiting for the host\'s world<span class="dots"></span></p><div class="splitBtns"><button class="big ghost" id="nbTitle">CANCEL</button></div>';
  el.innerHTML = '<div class="panel px">' + h + '</div>';
  el.classList.remove('hidden');
  UI.decorate(el);
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('nbQuit', () => Main.toTitle());
  on('nbTitle', () => Main.toTitle(true));
  on('nbRejoin', () => {
    const b = $('nbRejoin'); b.disabled = true; $('nbMsg').textContent = 'Reconnecting...';
    Net.rejoin().catch(e => { const m = $('nbMsg'); if (m) m.textContent = e.message; if (b) b.disabled = false; });
  });
};
Main.netBannerTick = function () {
  if (Main.nbKind === 'hostLost') { const s = $('nbSec'); if (s) s.textContent = Math.ceil(Net.rejoinLeft() / 1000) + 's'; }
};
// the layout classes on the HUD (CSS: #game.onHost / #game.onGuest) and the guest's own controls card
Main.netUi = function (mode) {
  const g = $('game');
  g.classList.toggle('online', !!mode); g.classList.toggle('onHost', mode === 'host'); g.classList.toggle('onGuest', mode === 'guest');
  Main.netBanner(null);
  const help = $('help');
  if (Main.helpHtml === undefined) Main.helpHtml = help.innerHTML;
  if (mode === 'guest') {
    help.innerHTML = '<div class="hcol"><h3>' + UI.img('ic_hat', 16) + 'YOU ARE THE WIZARD</h3>' +
      '<div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk &nbsp; <kbd>SPACE</kbd> roll (invulnerable), or dig at a mound, pile or bush</div>' +
      '<div><kbd>E</kbd> fire the held spell &nbsp; <kbd>T</kbd> skill tree &nbsp; <kbd>C</kbd> book &nbsp; <kbd>ESC</kbd> menu</div>' +
      '<div>Spells fire by themselves when the Builder sends them. Nothing pauses: the game goes on while you shop. A gamepad works too (A roll, X held spell, Y tree).</div></div>' +
      '<div class="hfoot"><kbd>H</kbd> hides this.</div>';
  } else if (Main.helpHtml !== help.innerHTML) { help.innerHTML = Main.helpHtml; UI.decorate(help); }
  if (!mode) Main.menuUp = false;
};

// ---------- host ----------
Main.hostHooks = {
  // the guest said hello: start the game now (a new one or a saved one), with the roles fixed
  guestJoined() {
    const p = Net.pending;
    Players.ctl = { kbB: true, kbW: false, pb: IN.padList.length ? 0 : -1, pw: 1 };   // the host is the Builder (keyboard + mouse, or his pad); the Wizard is a virtual pad in slot 1
    Net.on = true;
    if (p.isNew) Main.newGame(p.slot); else Main.loadGame(p.slot);
    if (!G) return;   // (the save would not load: toTitle already closed the session)
    Main.netUi('host');
    UI.toast('Player 2 joined as the Wizard.', 'L', 'ic_check');
  },
  // somebody is knocking: show how the connection attempt is going (it is the one place the host can see why a join does not complete)
  guestDialing(conn) {
    const el = () => (Net.state === 'waiting' && !$('menuHost').classList.contains('hidden') ? document.querySelector('#menuHost .netStatus') : null), t0 = performance.now();
    const tick = async () => {
      const s = el();
      if (!s || conn.open || Net.conn) return;
      const p = await Net.probe(conn), secs = Math.round((performance.now() - t0) / 1000);
      s.innerHTML = 'Player 2 found you, connecting<span class="dots"></span><br><small>' + Net.probeText(p, Net.hdiag) + ' (' + secs + 's)</small>';
      setTimeout(tick, 1000);
    };
    tick();
  },
  guestLost() { Main.netBanner('hostLost'); },
  guestBack() { Main.netBanner(null); UI.toast('Player 2 is back.', 'L', 'ic_check'); },
  timeout() { Main.toTitle(); },   // 60 s are up: back to the title screen, the save (already written) is intact
  // the guest asked to buy a node: the usual cost logic decides; what it would have toasted goes back to him, the result reaches his screen in the next snapshot
  buy(id) {
    if (!G || Net.state !== 'live') return;
    const before = G.xp + '|' + JSON.stringify(G.tree);
    UI.toastCap = [];
    try { UI.buy(id); } finally { var caps = UI.toastCap; UI.toastCap = null; }
    const ok = G.xp + '|' + JSON.stringify(G.tree) !== before;
    Net.sendBuyRes(id, ok, caps);
    if (ok) for (const t of caps) if (t.side === 'L') UI.toast(t.text, 'L', t.icon);
  },
};
Main.hostOnline = function (slot, isNew) {
  Net.hooks = Main.hostHooks; Net.pending = { slot, isNew };
  UI.hostLobby('opening');
  Net.createRoom().then(code => UI.hostLobby('waiting', code)).catch(e => { Net.reset(); UI.hostLobby('error', e.message); });
};

// ---------- guest ----------
Main.guestHooks = {
  lost() { Main.netBanner('guestLost'); },
  resumed() { Main.netBanner(null); },
  ended(msg) { Main.netBanner('ended', msg); },
  toast(m) { UI.toast(m.text, 'R', m.icon, true); },
  buyres(m) {
    for (const t of m.toasts || []) if (t.side === 'L') UI.toast(t.text, 'R', t.icon, true);   // the host's answer: "Unlocked: ..." / "Still need ..."
    AU.sfx(m.ok ? 'buy' : 'error');
    if (UI.treeOpen.R) UI.renderTree('R');
  },
};
Main.joinOnline = function (code) {
  Net.hooks = Main.guestHooks;
  return Net.join(code).then(() => {
    G = null; STATE = 'guest'; Main.menuUp = false;
    UI.show('menu', false); UI.show('game', false);
    Main.netUi('guest');
    Main.netBanner('loading');
  });
};
// the first snapshot has arrived: the HUD wakes up
Main.enterGuest = function () {
  Net.on = true; Main.menuUp = false; Net.helpT = 25;
  Main.winsSeen = G.stats.wins || 0; Main.lastQW = G.quest.W; Main.resShown = false;
  UI.resetCache();
  UI.show('menu', false); UI.show('players', false); UI.show('game', true);
  UI.show('pause', false); UI.show('results', false); UI.show('victory', false);
  Main.netUi('guest');
  UI.openTree('L', false); UI.openTree('R', false);
  R.wcam.x = G.w.x; R.wcam.y = G.w.y; R.fcam.x = G.bd.x; R.fcam.y = G.bd.y;
  UI.help(true);
  AU.music(true); AU.hold(false);
};
Main.guestKeys = function (dt) {
  const p = IN.pad[0];
  if (IN.hit('Escape')) { if (UI.treeOpen.R) UI.openTree('R', false); else if (!Book.isOpen) Main.pause(!Main.menuUp); }
  if (!Main.menuUp && !Book.isOpen && (IN.hit('KeyT') || IN.hit('KeyY') || (p && p.y))) UI.openTree('R');
  if (IN.hit('KeyC') && !UI.treeOpen.R && !Main.menuUp && !Book.isOpen) Book.open();
  if (IN.hit('KeyH')) UI.help();
  if (Net.helpT > 0) { Net.helpT -= dt; if (Net.helpT <= 0) UI.help(false); }
  if (UI.treeOpen.R && !Main.menuUp) Main.treePads(dt, null, p);
  if (IN.hit('F3') || IN.hit('Backquote')) UI.debugOn = !UI.debugOn;
};
// things the guest notices by watching the snapshots go by
Main.guestSeen = function () {
  if (G.quest.W > Main.lastQW) {   // the host completed a Wizard goal: the card flashes like it does offline
    const el = $('questW'); el.classList.remove('done'); void el.offsetWidth; el.classList.add('done'); AU.sfx('complete');
  }
  Main.lastQW = G.quest.W;
  if ((G.stats.wins || 0) > Main.winsSeen) { Main.winsSeen = G.stats.wins; UI.showVictory(); }
  const down = G.w.dead && (G.w.deadT || 0) > 0.9;   // the death screen: the roll button (or its button) re-enters
  if (down && !Main.resShown) { Main.resShown = true; UI.showResults(); }
  else if (!G.w.dead && Main.resShown) { Main.resShown = false; UI.show('results', false); }
};
Main.guestFrame = function (dt, ts) {
  const s = Net.takeSnap();
  if (s) {
    G = s;   // the newest whole snapshot replaces the state atomically; nothing here ever mutates it
    if (!Net.on) Main.enterGuest(); else Main.guestSeen();
  }
  if (!G || !Net.on) { AU.hum(0); AU.mix(0, 0, false); AU.layerMix(null); AU.muffle(true); drawBackdrop(ts); return; }
  Net.mute = !!(UI.treeOpen.R || Main.menuUp || Book.isOpen);
  Net.guestTick(dt);
  Book.tick(dt);
  Main.guestKeys(dt);
  const bh = Main.hintFor(QUESTS.B[G.quest.B]), wh = Main.hintFor(QUESTS.W[G.quest.W]);
  R.hint = bh.f; R.whint = wh.w; R.focus = null; R.aim = null; R.ghost = null; R.demo = null; R.hoverB = null;
  UI.setHint(null, false, wh.tree);
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  R.drawWorld(ctx, dt, { x0: 0, w: CFG.W });
  R.drawPip(ctx, dt);
  let near = 0;
  const w = G.w;
  if (!w.dead) for (const e of w.enemies) if (Math.abs(e.x - w.x) < 10 && Math.abs(e.y - w.y) < 10) near++;
  AU.hum(0); AU.mix(0, Math.min(1, near / 8), !!w.boss); AU.layerMix(G.fac.weather);   // v1: music and UI sounds only, the world's sound effects stay on the host
  AU.muffle(!!(UI.treeOpen.R || Main.menuUp));
  UI.updateHud(dt);
};

// ---------- menus ----------
UI.onlinePage = function () {
  const box = $('menuOnline');
  box.innerHTML = '<h2>ONLINE</h2><p class="netNote">Two players, two computers. The host plays the Builder and gets a 6-letter room code; the guest types it in and plays the Wizard. No accounts, no installs.</p>' +
    '<button class="big" id="oCreate">' + UI.img('ic_wrench', 20) + 'CREATE GAME</button><button class="big" id="oJoin">' + UI.img('ic_hat', 20) + 'JOIN GAME</button><button class="big ghost" id="oTest">CHECK THIS COMPUTER</button><div class="netStatus" id="oTestMsg"></div><button class="big ghost back">BACK</button>';
  $('oTest').onclick = () => {
    const m = $('oTestMsg'); m.className = 'netStatus'; m.innerHTML = 'Checking<span class="dots"></span>';
    Net.selfTest().then(r => { m.className = 'netStatus' + (r.ok ? '' : ' err'); m.textContent = r.text; });
  };
  $('oCreate').onclick = () => UI.hostSlots();
  $('oJoin').onclick = () => UI.joinPage();
  box.querySelector('.back').onclick = () => UI.menuPage('menuMain');
  UI.menuPage('menuOnline');
};
// the host picks the game: a saved one to carry on or a new one
UI.hostSlots = function () {
  const box = $('menuSlots');
  box.innerHTML = '<h2>HOST A GAME</h2><p class="netNote">Pick the game you will play as the Builder. Your partner joins as the Wizard.</p>';
  for (let i = 1; i <= 3; i++) {
    const s = UI.slotInfo(i), ok = s && !s.old, row = document.createElement('div');
    row.className = 'slotRow';
    const b = document.createElement('button');
    b.className = 'big slot';
    b.innerHTML = slotLabel(i, s) + '<em>' + (ok ? 'CONTINUE' : 'NEW GAME') + '</em>';
    if (s && s.old) b.disabled = true; else b.onclick = () => Main.hostOnline(i, !ok);
    row.appendChild(b);
    if (ok) {
      const ow = document.createElement('button');
      ow.className = 'big ghost warn ow'; ow.innerHTML = UI.img('ic_warn', 14) + 'NEW';
      ow.title = 'Start a new game in this slot (overwrites it)';
      ow.onclick = () => Main.hostOnline(i, true);
      row.appendChild(ow);
    }
    box.appendChild(row);
  }
  const back = document.createElement('button'); back.className = 'big ghost back'; back.textContent = 'BACK';
  back.onclick = () => UI.onlinePage();
  box.appendChild(back);
  UI.menuPage('menuSlots');
};
UI.hostLobby = function (state, info) {
  const box = $('menuHost');
  let h = '<h2>HOST A GAME</h2>';
  if (state === 'opening') h += '<div class="netStatus">Opening a room<span class="dots"></span></div>';
  else if (state === 'waiting') h += '<p class="netNote">Tell your partner to open the game, press ONLINE, JOIN GAME and type:</p><div class="bigCode">' + info + '</div><div class="netStatus">Waiting for player 2<span class="dots"></span></div>' + (Net.relay ? '<p class="netNote">A relay is ON (?turn=...): the other computer needs it too.</p>' : '');
  else h += '<div class="netStatus err">' + (info || 'Something went wrong.') + '</div>';
  h += '<button class="big ghost back">' + (state === 'error' ? 'BACK' : 'CANCEL') + '</button>';
  box.innerHTML = h;
  box.querySelector('.back').onclick = () => { if (Net.role) Net.close(false); UI.hostSlots(); };
  UI.menuPage('menuHost');
};
UI.joinPage = function (msg, isErr) {
  const box = $('menuJoin');
  box.innerHTML = '<h2>JOIN A GAME</h2><p class="netNote">Type the 6 letters the host sees on their screen.' + (Net.relay ? ' (A relay is ON.)' : '') + '</p><input id="joinCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="------">' +
    '<div class="netStatus' + (isErr ? ' err' : '') + '" id="joinMsg">' + (msg || '') + '</div><button class="big" id="joinGo">JOIN</button><button class="big ghost back">BACK</button>';
  const inp = $('joinCode'), go = () => {
    const code = Net.cleanCode(inp.value);
    if (code.length !== 6) { $('joinMsg').className = 'netStatus err'; $('joinMsg').textContent = 'The code has 6 letters and numbers.'; return; }
    inp.disabled = true; $('joinGo').disabled = true;
    $('joinMsg').className = 'netStatus'; $('joinMsg').innerHTML = 'Connecting<span class="dots"></span>';
    Main.joinOnline(code).catch(e => UI.joinPage(e.message, true));
  };
  inp.oninput = () => { const c = Net.cleanCode(inp.value); if (inp.value !== c) inp.value = c; };
  inp.onkeydown = e => { if (e.key === 'Enter') go(); e.stopPropagation(); };
  $('joinGo').onclick = go;
  box.querySelector('.back').onclick = () => { if (Net.role) Net.close(false); UI.onlinePage(); };
  UI.menuPage('menuJoin');
  setTimeout(() => { if (!inp.disabled) inp.focus(); }, 30);
};
