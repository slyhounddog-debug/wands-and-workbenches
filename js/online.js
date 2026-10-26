'use strict';
// Online co-op glue (Phase 1): everything the game itself does to host or join a room. The transport is js/net.js (the only file that knows PeerJS); this file wires it into
// the menus, the main loop and the HUD. Host = Builder (runs the sim exactly as offline play does), guest = Wizard (renders snapshots, sends a pad). Loaded after main.js.
//
// The lobby is the living menu world (js/menu.js): the host's menu world is streamed to the guest like any game state, the guest's pad walks the Wizard in it, and nothing
// about the wire changes. The game proper starts from there (Main.launch).
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
  // the guest said hello: both go on to the character select in the menu world (the roles are fixed: the host is the Builder, the guest the Wizard); the game itself
  // starts from there, when both are ready (Main.launch)
  guestJoined() { if (G && G.menu) Menu.guestJoined(); },
  // somebody is knocking: show how the connection attempt is going (it is the one place the host can see why a join does not complete)
  guestDialing(conn) {
    const t0 = performance.now();
    const tick = async () => {
      const o = G && G.menu && G.menu.online;
      if (!o || Net.state !== 'waiting' || conn.open || Net.conn) { if (o && Net.state === 'waiting') o.status = ''; return; }
      const p = await Net.probe(conn), secs = Math.round((performance.now() - t0) / 1000);
      o.status = 'Player 2 found you, connecting... ' + Net.probeText(p, Net.hdiag) + ' (' + secs + 's) ' + Net.logText(6).split('\n').join(' | ');
      setTimeout(tick, 1000);
    };
    tick();
  },
  guestLost() { if (!(G && G.menu)) Main.netBanner('hostLost'); },   // (in the lobby the room modal says it)
  guestBack() { if (G && G.menu) return; Main.netBanner(null); UI.toast('Player 2 is back.', 'L', 'ic_check'); },
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

// ---------- guest ----------
Main.guestHooks = {
  lost() { Main.netBanner('guestLost'); },
  resumed() { Main.netBanner(null); },
  ended(msg) {
    if (G && G.menu) { Main.toTitle(true); if (G && G.menu) Menu.say(msg || 'The host ended the game.'); return; }   // (the lobby: back to the menu world with a word)
    Main.netBanner('ended', msg);
  },
  toast(m) { UI.toast(m.text, 'R', m.icon, true); },
  buyres(m) {
    for (const t of m.toasts || []) if (t.side === 'L') UI.toast(t.text, 'R', t.icon, true);   // the host's answer: "Unlocked: ..." / "Still need ..."
    AU.sfx(m.ok ? 'buy' : 'error');
    if (UI.treeOpen.R) UI.renderTree('R');
  },
};
// the guest types the code at the keyboard prop in the menu world (Menu typingTick); once the host has said welcome, the host's menu world arrives as snapshots
Main.joinOnline = function (code) {
  Net.hooks = Main.guestHooks;
  return Net.join(code).then(() => {
    STATE = 'guest'; Main.menuUp = false;
    UI.show('game', false);
    Main.netUi('guest');
    if (G && G.menu && G.menu.typing) G.menu.typing.msg = 'Joined! Waiting for the host...';
  });
};
// the first snapshot has arrived: the HUD wakes up
Main.enterGuest = function () {
  Net.on = true; Main.menuUp = false; Net.helpT = 25;
  Main.winsSeen = G.stats.wins || 0; Main.lastQW = G.quest.W; Main.resShown = false;
  UI.resetCache();
  UI.show('game', true);
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
    if (G.menu) Menu.lastEv = Menu.lastEv || G.menu.evN;   // (the lobby: do not replay the events that happened before we got here)
    else if (!Net.on) Main.enterGuest(); else Main.guestSeen();
  }
  if (G && G.menu && !Net.on) { AU.hum(0); AU.mix(0, 0, false); AU.layerMix(null); AU.muffle(true); Menu.guestFrame(dt, ts); return; }   // the host is still in the menu world
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
