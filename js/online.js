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
// ---------- smoothing ----------
// The guest gets a new picture of the world about 20 times a second; drawn as they come, everything would move in 20 Hz steps. So when one arrives, every thing that
// moves (matched with the one in the previous picture by its stable id, see Net.stamp) starts again from where it was DRAWN and glides to where the host says it is over
// about one snapshot interval, and every frame moves it a little further (Main.tweenStep). A jump bigger than a few tiles (a respawn, a blink) is not smoothed.
Main.tw = [];   // [object, field, from, to, ...]
Main.twAt = 0;
const TWEEN_ARR = [['w', 'enemies'], ['w', 'allies'], ['w', 'proj'], ['w', 'eproj'], ['w', 'aproj'], ['w', 'drops'], ['w', 'pickups'], ['w', 'boulders'], ['w', 'zones'], ['w', 'mines'], ['w', 'booms']];
Main.tween = function (a, b, at) {
  const tw = [];
  const push = (o, n, f, max, mono) => {
    const x = o[f], y = n[f];
    if (typeof x !== 'number' || typeof y !== 'number' || x === y || Math.abs(y - x) > max || (mono && y < x)) return;
    tw.push(n, f, x, y); n[f] = x;
  };
  const pair = (oa, na, fields, max, mono) => {
    if (!oa || !na) return;
    const m = new Map();
    for (const o of oa) if (o && o.uid !== undefined) m.set(o.uid, o);
    for (const n of na) { const o = n && m.get(n.uid); if (o) for (const f of fields) push(o, n, f, max, mono); }
  };
  if (a.w && b.w) { push(a.w, b.w, 'x', 4); push(a.w, b.w, 'y', 4); push(a.w, b.w, 't', 1, true); }
  if (a.bd && b.bd) { push(a.bd, b.bd, 'x', 4); push(a.bd, b.bd, 'y', 4); }
  if (a.fac && b.fac) {
    push(a.fac, b.fac, 't', 1, true);
    pair(a.fac.flying, b.fac.flying, ['t'], 3, true);
    const ob = a.fac.belts, nb = b.fac.belts;   // the items riding the belts
    if (ob && nb) for (let i = 0; i < Math.min(ob.length, nb.length); i++) { const o = ob[i], n = nb[i]; if (o.x === n.x && o.y === n.y && o.item && n.item && o.item.kind === n.item.kind) push(o.item, n.item, 'prog', 0.6, true); }
  }
  if (a.w && b.w) {
    for (const [p, k] of TWEEN_ARR) pair(a[p] && a[p][k], b[p] && b[p][k], ['x', 'y'], 4);
    pair(a.w.arcs, b.w.arcs, ['t'], 2, true);
  }
  Main.tw = tw; Main.twAt = at || performance.now();
};
Main.tweenStep = function (now) {
  const tw = Main.tw;
  if (!tw.length) return;
  const k = Math.max(0, Math.min(1, (now - Main.twAt) / (Math.max(0.04, Math.min(0.12, Net.snapGap)) * 1000)));
  for (let i = 0; i < tw.length; i += 4) tw[i][tw[i + 1]] = tw[i + 2] + (tw[i + 3] - tw[i + 2]) * k;
};
// ---------- prediction ----------
// The guest's own Wizard answers his keys at once instead of one round trip later. Every frame the guest steps a private copy of the Wizard (Main.pr.s) with the same walking
// and rolling rules the host runs (Main.walkStep mirrors the movement block of WZ.update: KEEP THEM IN STEP) and draws that. Each snapshot is the host's truth about where he
// was when it had used pad packet G.na; Main.predSnap starts again from it and replays the pad packets the host has not seen yet (Net.hist), so the copy lands where he is NOW.
// The difference to what was drawn before is not snapped but faded out over ~0.1 s (Main.pr.err). Anything the guest cannot know (a geyser jump, a blink, a recoil, death) is
// not predicted: the host's picture is shown as it is. ?predict=0 turns it off.
Main.PREDICT = !/[?&]predict=0/.test(location.search);
Main.pr = { ok: false, s: null, ex: 0, ey: 0, bob: 0, fix: 0 };
const PFIELDS = ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'roll', 'rollCd', 'rdx', 'rdy'];
Main.walkStep = function (o, dt, ix, iy, press, slowK) {
  let dx = 0, dy = 0;
  if (ix || iy) { dx = ix + iy; dy = iy - ix; }
  const m = Math.hypot(dx, dy);
  if (m > 0) { dx /= m; dy /= m; o.fx = dx; o.fy = dy; }
  if (o.rollCd > 0) o.rollCd -= dt;
  if (press && o.rollCd <= 0 && o.roll <= 0 && !WZ.has('gale') && !(m === 0 && WZ.forageAt(o.x, o.y))) {   // (the Circlet's roll is a blink and a dig is not a roll: the host decides those)
    o.roll = CFG.wizard.rollTime; o.rollCd = WZ.rollCd();
    o.rdx = m > 0 ? dx : o.fx; o.rdy = m > 0 ? dy : o.fy;
    const rm = Math.hypot(o.rdx, o.rdy) || 1; o.rdx /= rm; o.rdy /= rm;
  }
  let sp = WZ.speed();
  const tn = WZ.tile(o.x, o.y);
  if (tn === T_BOG && !WZ.has('bog')) sp *= CFG.world.slowTerrain;
  if (tn === T_SCORCH && !WZ.has('ember')) sp *= CFG.aug.scorch.slow;
  if (o.roll > 0) { o.roll -= dt; o.vx = o.rdx * sp * CFG.wizard.rollSpeed; o.vy = o.rdy * sp * CFG.wizard.rollSpeed; }
  else {
    const wx = dx * sp * slowK, wy = dy * sp * slowK, ex = wx - o.vx, ey = wy - o.vy, el = Math.hypot(ex, ey);
    const rate = (m > 0 ? CFG.wizard.accel : CFG.wizard.friction) * dt;
    if (el <= rate) { o.vx = wx; o.vy = wy; } else { o.vx += ex / el * rate; o.vy += ey / el * rate; }
  }
  const spd = Math.hypot(o.vx, o.vy);
  if (spd > 0.01) {
    const nx = Math.max(0.5, Math.min(CFG.WW - 0.5, o.x + o.vx * dt)), ny = Math.max(0.5, Math.min(CFG.WH - 0.5, o.y + o.vy * dt));
    const ox = o.x, oy = o.y;
    WZ.slideW(o, nx, ny, CFG.wizard.radius);
    if (o.x === ox) o.vx = 0;
    if (o.y === oy) o.vy = 0;
  }
  return spd;
};
const slowOf = w => (1 - Math.min(0.8, w.zSlow || 0)) * (w.slowT > 0 ? 1 - w.slowAmt : 1);
// a new snapshot (G is already it): start the copy from the host's Wizard and replay the pad packets the host has not used yet
Main.predSnap = function (s) {
  const pr = Main.pr, w = s.w;
  pr.ok = Main.PREDICT && !!w && !s.menu && !w.dead && !w.jump && !w.blink && !w.kick && !(w.cine);
  if (!pr.ok) { pr.s = null; pr.ex = pr.ey = 0; return; }
  const o = {};
  for (const f of PFIELDS) o[f] = w[f];
  // Which moment on the guest's clock does this picture show? Packet na was sent at H[i0].t and arrived (host clock) at nft - nat, so D = sent - arrived = minus (one-way delay +
  // the clocks' offset), and the picture's moment is nft + D. One sample of D is noisy (the host notices a packet only when its frame is free, the network jitters: a
  // different few ms each picture, which showed as a tug back and forth while walking), but the noise only ever makes a packet LATE, so the steadiest estimate is the
  // largest D of the last two seconds (Main.pr.dq). Then every input from that moment to now is replayed (packet na only for what it had left; a newer packet's button
  // press always, the host has not seen it).
  // replay up to the moment the current copy stands for (Main.predictFrame then steps it on to this frame), so the two can be compared like for like
  const now = pr.s && pr.lastTs ? pr.lastTs : (Net.prevTs || performance.now());
  pr.lastTs = now;
  const k = slowOf(w), na = s.na || 0, H = Net.hist;
  let i0 = H.findIndex(h => h.q >= na);
  if (i0 < 0) i0 = H.length;
  let t0 = H[i0] ? H[i0].t : now;
  if (H[i0] && H[i0].q === na && s.nft) {
    const dq = pr.dq || (pr.dq = []);
    dq.push(H[i0].t - (s.nft - (s.nat || 0) * 1000)); if (dq.length > 40) dq.shift();
    t0 = s.nft + Math.max(...dq);
  }
  let left = 0.6;   // never replay more than this many seconds
  for (let i = i0; i < H.length && left > 0; i++) {
    const h = H[i], a = Math.max(h.t, t0), b = i + 1 < H.length ? H[i + 1].t : now;
    let dur = Math.min(left, Math.max(0, (b - a) / 1000)), press = h.q > na && h.a;
    left -= dur;
    while (dur > 1e-4 || press) { const d = Math.min(dur, 1 / 60); Main.walkStep(o, d, h.ix, h.iy, press, k); press = false; dur -= d; if (d === 0) break; }
  }
  // what was drawn a moment ago, against where the replay says he is now: fade the difference out, unless it is big (a teleport, a long stall)
  const cur = pr.s;
  if (cur) {
    const ex = cur.x + pr.ex - o.x, ey = cur.y + pr.ey - o.y, e = Math.hypot(ex, ey);
    pr.fix = pr.fix * 0.8 + e * 0.2;
    pr.last = { e: +e.toFixed(3), ex: +ex.toFixed(3), ey: +ey.toFixed(3), na: s.na, nat: s.nat, hx: +w.x.toFixed(3), hy: +w.y.toFixed(3), hvx: +w.vx.toFixed(2), hvy: +w.vy.toFixed(2), hurt: w.hurtT > 0, kick: !!w.kick, t: Math.round(performance.now()) };   // (diagnostics: the last correction)
    if (e < 2.5) { pr.ex = ex; pr.ey = ey; } else { pr.ex = pr.ey = 0; }
  } else { pr.ex = pr.ey = 0; pr.bob = w.bob || 0; }
  pr.s = o;
};
// every frame: step the copy with this frame's own input, fade the correction, and put it where the renderer looks (the snapshot's Wizard fields)
Main.predictFrame = function (dt) {
  const pr = Main.pr, w = G && G.w;
  if (!pr.ok || !pr.s || !w || w.dead) return;
  const L = Net.liveInput(), k = slowOf(w), ts = Net.frameTs || performance.now();
  let left = Math.max(0, Math.min(0.25, (ts - (pr.lastTs || ts)) / 1000)), spd = 0, press = L.a;
  pr.lastTs = ts;
  while (left > 1e-5 || press) { const d = Math.min(left, 1 / 60); spd = Main.walkStep(pr.s, d, L.ix, L.iy, press, k); press = false; left -= d; if (d === 0) break; }
  const f = Math.exp(-dt / 0.1); pr.ex *= f; pr.ey *= f;
  for (const key of PFIELDS) w[key] = pr.s[key];
  w.x += pr.ex; w.y += pr.ey;
  w.moving = spd > 0.3;
  if (spd > 0.01) pr.bob += dt * 11 * Math.min(1, spd / WZ.speed());
  w.bob = pr.bob;
};
Main.guestFrame = function (dt, ts) {
  Net.prevTs = Net.frameTs || ts; Net.frameTs = ts;   // (the prediction's clock: frame timestamps, the same clock the host stamps its pictures with)
  const s = Net.takeSnap();
  if (s) {
    const old = G;
    G = s;   // the newest whole snapshot replaces the state atomically (its moving things are then glided from where they were drawn: Main.tween)
    Main.predSnap(s);   // (before the glide below moves his x / y: it needs the host's own numbers)
    if (old && old.w && s.w && !old.menu && !s.menu) Main.tween(old, s, Net.takenAt); else Main.tw = [];
    if (G.menu) Menu.lastEv = Menu.lastEv || G.menu.evN;   // (the lobby: do not replay the events that happened before we got here)
    else if (!Net.on) Main.enterGuest(); else Main.guestSeen();
  }
  if (G && G.menu && !Net.on) { AU.hum(0); AU.mix(0, 0, false); AU.layerMix(null); AU.muffle(true); Menu.guestFrame(dt, ts); return; }   // the host is still in the menu world
  if (!G || !Net.on) { AU.hum(0); AU.mix(0, 0, false); AU.layerMix(null); AU.muffle(true); drawBackdrop(ts); return; }
  Main.tweenStep(performance.now());
  Net.mute = !!(UI.treeOpen.R || Main.menuUp || Book.isOpen);
  Net.guestTick(dt);
  Main.predictFrame(dt);
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
