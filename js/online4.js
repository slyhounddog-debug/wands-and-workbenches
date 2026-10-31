'use strict';
// 4-PLAYER ONLINE: the lobby and the glue (loaded after online.js). Uses the living menu world exactly like the 2P lobby: the host's menu world is a game state (G.menu) that is
// streamed to every guest as snapshots, the guests' pads walk their characters in it. Nothing about the wire changes for the lobby; the 4P lobby is G.menu.l4 (plain data).
//
// FLOW. Online plate -> 2 PLAYER / 4 PLAYER plates (m.mode) -> HOST / JOIN. A 4P host opens a room that takes three guests; every player (the host first) arrives in the lobby's hall
// and steps on the WIZARD or the BUILDER plate. Roles are first come, first served: each has two seats (Builder 1, Builder 2, Wizard 1, Wizard 2); a full role bumps the player
// to the other one (a cue over his head and a line at the bottom says so). Seated, he is teleported to his quadrant: his own floor of cosmetic plates (+ the four elements for a
// Wizard: he picks TWO as his attunement), and the four READY plates sit together in the middle where the quadrants meet. When all four seats are filled and every owner stands
// on his READY plate (a Wizard has to have picked his two elements) a 3 second countdown starts the game (Main.newGame4).
const Lobby4 = {};
(function () {
const OX = 80, OY = 80;
const RECT = { x0: 52, x1: 90, y0: 51, y1: 85 };           // the 4P lobby's floor (a block of dry wilds to the north-west of the start; it is cleared of trees and rocks when the lobby opens)
const TC = { x: 71, y: 68 };                                // its middle: where the four quadrants meet
const HALL = { x: 71, y: 80.2 };                            // everyone arrives here
const HOME = [{ x: 75.6, y: 61.5 }, { x: 75.6, y: 75.0 }, { x: 66.6, y: 61.5 }, { x: 66.6, y: 75.0 }];   // each seat's own spot (B1, B2, W1, W2): next to its floor, by the middle
const READY_X = [72.2, 74.7, 67.2, 69.7];                   // the READY plates in a row at the middle: W1 W2 on the left, B1 B2 on the right
const NAMES = i => CFG.mode4.seats[i].name, COLS = i => CFG.mode4.seats[i].col;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
Menu.L4 = { rect: RECT, tc: TC };
Lobby4.RECT = RECT; Lobby4.TC = TC; Lobby4.HALL = HALL;
const ELEMS4 = ['air', 'water', 'fire', 'earth'];

// ---------- the state ----------
Lobby4.fresh = () => ({ chars: [], seats: [0, 1, 2, 3].map(() => ({ who: null, ready: false, att: [] })), bumps: [], count: -1, me: 'host', n: 0, say: [] });
Lobby4.addChar = function (L, who) {
  if (L.chars.some(c => c.who === who)) return L.chars.find(c => c.who === who);
  const c = { who, n: ++L.n, x: HALL.x + (L.chars.length - 1.5) * 1.4, y: HALL.y + 0.8, vx: 0, vy: 0, fx: 1, fy: 1, seat: -1, bob: 0, moving: false, conn: true, tele: 0 };
  L.chars.push(c);
  return c;
};
Lobby4.me = L => L.chars.find(c => c.who === L.me) || null;
Lobby4.mySeat = () => { const m = G && G.menu, L = m && m.l4, c = L && Lobby4.me(L); return c ? c.seat : -1; };
Lobby4.camTarget = function () { const L = G.menu.l4, c = L && Lobby4.me(L); return c ? { x: c.x, y: c.y } : null; };   // the camera is not locked: it follows your own character
Lobby4.label = c => (c.seat >= 0 ? NAMES(c.seat) : 'PLAYER ' + c.n);

// ---------- the plates ----------
// the plate specs of the lobby (Menu.specs('cs4')): the role plates and the way back in the hall, each seat's cosmetic floor + (Wizards) its four element plates, the READY row
Lobby4.specs = function () {
  const out = [];
  const bb = Players.CATS.builder, wz = Players.CATS.wizard;
  out.push({ act: 'back', label: 'BACK', word: 'BACK', x: HALL.x, y: 83.9, r: 0.8, safe: true, kind: 'back', ic: 'ic_x', key: 'backcs4' });
  out.push({ act: 'l4role:W', label: 'WIZARD: first come, first served (2 seats)', word: 'WIZ', x: HALL.x - 3.6, y: 82.3, r: 1.05, kind: 'act', ic: 'ic_hat', key: 'roleW' });
  out.push({ act: 'l4role:B', label: 'BUILDER: first come, first served (2 seats)', word: 'BLD', x: HALL.x + 3.6, y: 82.3, r: 1.05, kind: 'act', ic: 'ic_wrench', key: 'roleB' });
  [2, 3].forEach(s => wz.forEach((cat, j) => cat.opts.forEach((op, i) => out.push({ act: 'eq', label: op.name, x: 53.6 + j * 1.95, y: (s === 2 ? 53.0 : 68.6) + i * 1.5, r: 0.64, kind: 'cos', role: 'W', seat: s, data: { cat: cat.key, opt: op.id, kind: cat.kind, who: 'wizard' } }))));
  [0, 1].forEach(s => bb.forEach((cat, k) => cat.opts.forEach((op, i) => out.push({ act: 'eq', label: op.name, x: 77.8 + k * 1.95, y: (s === 0 ? 53.0 : 68.6) + i * 1.5, r: 0.64, kind: 'cos', role: 'B', seat: s, data: { cat: cat.key, opt: op.id, kind: cat.kind, who: 'builder' } }))));
  [2, 3].forEach(s => ELEMS4.forEach((el, e) => out.push({ act: 'l4att:' + el, label: ELEM_WORD[el] + ': one of your two elements', word: ELEM_WORD[el].slice(0, 4), x: 68.1 + e * 1.65, y: s === 2 ? 56.4 : 73.4, r: 0.72, kind: 'act', ic: 'pk_' + el, role: 'W', seat: s, key: 'att' + s + el })));
  [0, 1, 2, 3].forEach(s => out.push({ act: 'l4ready:' + s, label: NAMES(s) + ' READY', word: 'READY', x: READY_X[s], y: 67.6, r: 0.98, kind: 'ready', role: M4.ROLE[s], seat: s, ic: M4.ROLE[s] === 'W' ? 'ic_hat' : 'ic_wrench', key: 'ready' + s, col: COLS(s) }));
  return out;
};
// a plate spec's extras (seat) are kept on the plate (Menu.newPlate copies only what it knows)
Lobby4.tagPlates = function () {
  const m = G.menu, specs = Lobby4.specs();
  for (const p of m.plates) { const s = specs.find(q => (q.key && q.key === p.key) || (!q.key && q.act === p.act && q.label === p.label && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01)); if (s && s.seat !== undefined) p.seat = s.seat; }
};

// ---------- the step (host) ----------
const padOf = who => {
  if (who === 'host') {
    const gp = IN.pad[0] || null, k = (l, r, u, d) => [(IN.down(r) ? 1 : 0) - (IN.down(l) ? 1 : 0), (IN.down(d) ? 1 : 0) - (IN.down(u) ? 1 : 0)];
    const a = k('KeyA', 'KeyD', 'KeyW', 'KeyS'), b = k('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown');
    return { ix: clamp(a[0] + b[0] + (gp ? gp.ix : 0), -1, 1), iy: clamp(a[1] + b[1] + (gp ? gp.iy : 0), -1, 1) };
  }
  const s = Net.slot && Net.slot(who), p = s && s.state === 'live' ? IN.pad[s.pad] : null;
  return p ? { ix: p.ix || 0, iy: p.iy || 0 } : { ix: 0, iy: 0 };
};
const wet = (x, y) => WZ.wet(x, y);
function moveChar(c, dt, pad) {
  const sp = 5.2;
  let dx = pad.ix + pad.iy, dy = pad.iy - pad.ix;
  const m = Math.hypot(dx, dy);
  if (m > 0) { dx /= m; dy /= m; c.fx = dx; c.fy = dy; }
  const wx = dx * sp, wy = dy * sp, e = Math.min(1, dt * 14);
  c.vx += (wx - c.vx) * e; c.vy += (wy - c.vy) * e;
  const R4 = G.menu.rect;
  const nx = clamp(c.x + c.vx * dt, R4.x0 + 0.5, R4.x1 - 0.5), ny = clamp(c.y + c.vy * dt, R4.y0 + 0.5, R4.y1 - 0.5);
  if (!wet(nx, c.y)) c.x = nx; else c.vx = 0;
  if (!wet(c.x, ny)) c.y = ny; else c.vy = 0;
  c.moving = Math.hypot(c.vx, c.vy) > 0.3;
  if (c.moving) c.bob += dt * 11;
}
const evq = (m, o) => { m.ev.push(Object.assign({ n: ++m.evN }, o)); if (m.ev.length > 16) m.ev.shift(); };
const say = (m, text, col) => { m.toasts.push({ text, col: col || '#ffd23a', t: 0 }); if (m.toasts.length > 4) m.toasts.shift(); };
// a player steps on WIZARD or BUILDER: a free seat of that role in arrival order, else he is bumped to the other role (and the lobby says so)
Lobby4.pick = function (c, role) {
  const m = G.menu, L = m.l4, S = L.seats;
  if (c.seat >= 0 && M4.ROLE[c.seat] === role) return;
  const free = r => (r === 'B' ? [0, 1] : [2, 3]).find(s => !S[s].who);
  const other = role === 'B' ? 'W' : 'B';
  let s = free(role), bumped = false;
  if (s === undefined) { s = free(other); bumped = true; }
  if (s === undefined) { Menu.sfx('error'); say(m, 'Every seat is taken', '#ff9a8a'); return; }
  const was = c.seat, who = Lobby4.label(c);
  if (was >= 0) S[was] = { who: null, ready: false, att: [] };
  S[s] = { who: c.who, ready: false, att: L.fixed && L.fixed[s] ? L.fixed[s].slice() : [] };
  c.seat = s; c.x = HOME[s].x; c.y = HOME[s].y; c.vx = c.vy = 0; c.tele = 1;
  FA.fb('lobby-seat');
  if (bumped) {   // the cue: an icon swap over his head and a line at the bottom
    L.bumps.push({ who: c.who, from: role, to: other, t: 0, col: COLS(s) });
    say(m, who + ': the ' + (role === 'W' ? 'WIZARD' : 'BUILDER') + ' seats are full - you are ' + NAMES(s) + ' the ' + (other === 'W' ? 'Wizard' : 'Builder'), '#ff9a8a');
    Menu.sfx('error'); FA.fb('lobby-bump');
  } else say(m, NAMES(s) + ' is the ' + (role === 'W' ? 'Wizard' : 'Builder') + ' now', COLS(s));
  Menu.sfx('buy');
};
Lobby4.toggleAtt = function (c, el) {
  const L = G.menu.l4, S = L.seats[c.seat];
  if (c.seat < 2 || !S) return;
  if (L.fixed && L.fixed[c.seat]) { if (!(S.fixedT > 0)) { S.fixedT = 2; say(G.menu, NAMES(c.seat) + ': the attunement is fixed for this save', '#ffd23a'); Menu.sfx('error'); } return; }
  const i = S.att.indexOf(el);
  if (i >= 0) S.att.splice(i, 1); else { S.att.push(el); if (S.att.length > 2) S.att.shift(); }
  Menu.sfx('tab');
};
function platesTick(m, L, dt) {
  for (const p of m.plates) {
    if (p.kind === 'tag') continue;
    if (p.st !== 'up') { p.on.B = p.on.W = false; continue; }
    let any = false;
    for (const c of L.chars) {
      const mine = p.seat === undefined || p.seat === null ? (p.act.indexOf('l4role') === 0 || p.kind === 'back' ? true : false) : c.seat === p.seat;
      const on = !c.tele && Math.abs(c.x - p.x) < p.r * 0.95 && Math.abs(c.y - p.y) < p.r * 0.95;
      if (on && mine) any = true;
      if (!on) { p.arm[c.who] = true; continue; }
      if (!mine || p.kind === 'ready') continue;
      if (p.arm[c.who]) {
        p.arm[c.who] = false;
        const [a, arg] = p.act.split(':');
        p.flash = 0.4;
        if (a === 'l4role') Lobby4.pick(c, arg);
        else if (a === 'l4att') Lobby4.toggleAtt(c, arg);
        else if (a === 'eq') evq(m, { k: 'eq', seat: c.seat, role: M4.ROLE[c.seat], cat: p.data.cat, opt: p.data.opt });
        else if (a === 'back' && c.who === 'host') { Menu.sfx('menu_close'); Menu.back(); return; }
      }
    }
    p.on.B = p.on.W = any;
  }
  // a Wizard's element plates show his two picks lit
  for (const p of m.plates) if (p.act.indexOf('l4att') === 0) { const S = L.seats[p.seat]; p.col = S && S.att.indexOf(p.act.split(':')[1]) >= 0 ? ELEM[p.act.split(':')[1]].color : null; }
}
Lobby4.step = function (dt) {
  const m = G.menu, L = m.l4;
  if (L) L.me = L.me || 'host';
  if (!L) return;
  if (m.page !== 'cs4') return;
  // the host's own character; guests' characters come from Net hooks (joined / lost)
  Lobby4.addChar(L, 'host');
  for (const c of L.chars) {
    if (c.tele > 0) c.tele = Math.max(0, c.tele - dt * 2.2);
    if (m.seq) { c.vx = c.vy = 0; continue; }
    const s = c.who === 'host' ? null : Net.slot(c.who);
    c.conn = c.who === 'host' || !!(s && s.state === 'live');
    moveChar(c, dt, c.conn ? padOf(c.who) : { ix: 0, iy: 0 });
  }
  for (let i = L.bumps.length - 1; i >= 0; i--) { L.bumps[i].t += dt; if (L.bumps[i].t > CFG.mode4.bumpT) L.bumps.splice(i, 1); }
  platesTick(m, L, dt);
  // who stands on their READY plate (a Wizard needs his two elements first)
  const standing = [0, 1, 2, 3].map(s => {
    const o = L.seats[s], c = o.who && L.chars.find(q => q.who === o.who), p = m.plates.find(q => q.kind === 'ready' && q.seat === s);
    return !!(c && c.conn && p && p.st === 'up' && !c.tele && Math.abs(c.x - p.x) < p.r * 0.95 && Math.abs(c.y - p.y) < p.r * 0.95 && (s < 2 || o.att.length === 2));
  });
  standing.forEach((v, s) => { if (v && !L.seats[s].ready && s >= 2) FA.fb('lobby-ready'); L.seats[s].ready = v; });
  const full = L.seats.every(o => o.who && L.chars.find(c => c.who === o.who && c.conn));
  if (!m.seq) {
    if (full && standing.every(Boolean)) {
      if (L.count < 0) { L.count = 3; Menu.sfx('menu_open'); }
      const was = Math.ceil(L.count);
      L.count -= dt;
      if (Math.ceil(L.count) !== was && L.count > 0) Menu.sfx('tab');
      if (L.count <= 0) { L.count = -1; m.seq = { k: 'start4', t: 0 }; Menu.sfx('victory'); }
    } else L.count = -1;
    // a Wizard standing on READY without his two elements: say why, once
    for (const s of [2, 3]) {
      const o = L.seats[s], c = o.who && L.chars.find(q => q.who === o.who), p = m.plates.find(q => q.kind === 'ready' && q.seat === s);
      if (c && p && !c.tele && Math.abs(c.x - p.x) < p.r * 0.95 && Math.abs(c.y - p.y) < p.r * 0.95 && o.att.length < 2) {
        if (!(o.need > 0)) { o.need = 3; say(m, NAMES(s) + ': pick TWO elements first', '#ffd23a'); Menu.sfx('error'); }
      } else if (o.need > 0) o.need = Math.max(0, o.need - dt);
    }
  } else {
    m.seq.t += dt; m.fade = clamp(m.seq.t / 0.7, 0, 1);
    if (m.seq.t >= 0.8) Lobby4.launch();
  }
  // the floor and the camera: nothing to ease (the patch is the whole lobby)
  for (const k of ['x0', 'x1', 'y0', 'y1']) m.rect[k] += (m.tr[k] - m.rect[k]) * Math.min(1, dt * 3);
  for (let i = m.toasts.length - 1; i >= 0; i--) { m.toasts[i].t += dt; if (m.toasts[i].t > 3.2) m.toasts.splice(i, 1); }
  for (let i = m.modals.length - 1; i >= 0; i--) { const md = m.modals[i]; md.t = clamp(md.t + dt * (md.out ? -4 : 3.2), -2, 1); if (md.out && md.t <= 0) m.modals.splice(i, 1); }
  for (let i = m.plates.length - 1; i >= 0; i--) {   // the plate engine's own popping in and out
    const p = m.plates[i];
    if (p.cd > 0) p.cd -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.st === 'wait') { if ((p.delay -= dt) <= 0) { p.st = 'in'; p.t = 0; } }
    else if (p.st === 'in') { p.t += dt / 0.3; if (p.t >= 1) { p.t = 1; p.st = 'up'; } }
    else if (p.st === 'out') { p.t += dt / 0.22; if (p.t >= 1) { m.plates.splice(i, 1); continue; } }
  }
  Menu.react();
};

// ---------- opening the lobby (host) ----------
Lobby4.clear = function () {
  for (const o of WZ.harv.concat(WZ.forage)) if (o.x > RECT.x0 - 1.5 && o.x < RECT.x1 + 1.5 && o.y > RECT.y0 - 1.5 && o.y < RECT.y1 + 1.5) { o.broken = true; o.respawn = 1e9; }
  const w = G.w;
  for (const k in w.tmod) { const t = +k, x = t % CFG.WW + 0.5, y = Math.floor(t / CFG.WW) + 0.5; if (x > RECT.x0 - 1.5 && x < RECT.x1 + 1.5 && y > RECT.y0 - 1.5 && y < RECT.y1 + 1.5) { delete w.tmod[k]; w.tmodN--; } }
  w.boulders = w.boulders.filter(b => !(b.x > RECT.x0 - 1.5 && b.x < RECT.x1 + 1.5 && b.y > RECT.y0 - 1.5 && b.y < RECT.y1 + 1.5));
};
// the host's room has its first guest (or the host chose 4P and the room is open): the lobby opens in the menu world
Lobby4.open = function () {
  const m = G.menu;
  if (m.l4) return;
  m.l4 = Lobby4.fresh(); m.hideB = true;
  const sv = m.pend && m.pend.kind === 'load' ? UI.slotInfo(m.pend.slot) : null;
  if (sv && sv.m4 && sv.m4.atts) m.l4.fixed = [null, null, sv.m4.atts[2] || null, sv.m4.atts[3] || null];   // a saved game: the Wizards' attunements are fixed
  Lobby4.clear();
  Lobby4.addChar(m.l4, 'host');
  Menu.show('cs4');
};
Lobby4.joined = function (slot) {   // a guest said hello
  const m = G && G.menu;
  if (!m || !m.online) return;
  m.online.state = 'live';
  if (!m.l4) Lobby4.open();
  Lobby4.addChar(m.l4, slot.id);
  say(m, 'PLAYER ' + m.l4.n + ' joined (' + (Net.gs.length + 1) + ' of 4)', '#9affb8');
  Menu.sfx('buy');
};

// ---------- drawing (called from Menu.collect / Menu.drawText) ----------
const synth = (c, base) => Object.assign({}, base, { x: c.x, y: c.y, vx: c.vx, vy: c.vy, fx: c.fx, fy: c.fy, bob: c.bob, moving: c.moving, roll: 0, ghosts: [], squash: 0, target: null });
Lobby4.collect = function (objs, v, mv) {
  const m = G.menu, L = m.l4, t = m.t;
  const push = (d, fn) => objs.push({ d, t: 'menu', fn });
  for (const c of L.chars) {
    const role = c.seat >= 0 ? M4.ROLE[c.seat] : 'W', col = c.seat >= 0 ? COLS(c.seat) : '#ffffff';
    push(c.x + c.y, cx => {
      const k = c.tele > 0 ? 1 - c.tele : 1;
      const p = R.toScreen(v, c.x, c.y);
      cx.strokeStyle = col; cx.lineWidth = 3; cx.globalAlpha = c.conn ? 0.9 : 0.35; diamond(cx, p[0], p[1] + 2, 22, 11); cx.stroke(); cx.globalAlpha = 1;
      if (k < 1) { cx.save(); cx.translate(p[0], p[1]); cx.scale(Math.max(0.1, k), Math.max(0.1, k)); cx.translate(-p[0], -p[1]); }
      cx.globalAlpha = c.conn ? 1 : 0.55;
      if (role === 'B') R.drawBuilder(cx, mv, synth({ x: c.x - OX, y: c.y - OY, vx: c.vx, vy: c.vy, fx: c.fx, fy: c.fy, bob: c.bob, moving: c.moving }, G.bd), t);
      else R.drawWizard(cx, v, synth(c, G.w));
      cx.globalAlpha = 1;
      if (k < 1) cx.restore();
      txt(cx, Lobby4.label(c), Math.round(p[0]), Math.round(p[1]) + 30, 9, col, 'center', 'd');
      if (!c.conn) txt(cx, 'AWAY', Math.round(p[0]), Math.round(p[1]) - 70, 9, '#ff9a8a', 'center', 'd');
      const bp = L.bumps.find(b => b.who === c.who);   // the bump cue: the full role crossed out, then the one he got
      if (bp) {
        const a = Math.min(1, (CFG.mode4.bumpT - bp.t) * 2), y0 = p[1] - 96 - Math.sin(bp.t * 6) * 3;
        cx.globalAlpha = a;
        R.iconRow(cx, p[0] - 30, y0, [[bp.from === 'W' ? 'ic_hat' : 'ic_wrench']]);
        cx.strokeStyle = '#ff5a5a'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(p[0] - 52, y0 - 26); cx.lineTo(p[0] - 8, y0 + 6); cx.stroke();
        R.iconRow(cx, p[0] + 30, y0, [[bp.to === 'W' ? 'ic_hat' : 'ic_wrench']]);
        cx.globalAlpha = 1;
      }
    });
  }
};
Lobby4.drawText = function (c, v) {
  const m = G.menu, L = m.l4;
  if (!L) return;
  // the countdown over the middle, and what each plate is while somebody stands on it
  if (m.online && m.online.code) txt(c, 'ROOM CODE ' + m.online.code + '   PLAYERS ' + L.chars.length + ' OF 4', 800, 44, 20, '#ffe36b', 'center', 'd');
  if (L.count > 0) { const p = R.toScreen(v, TC.x, TC.y - 3); txt(c, String(Math.ceil(L.count)), Math.round(p[0]), Math.round(p[1]), 56, '#ffe36b', 'center', 'd'); }
  for (const ch of L.chars) for (const p of m.plates) {
    if (!p.label || p.kind === 'tag' || p.st !== 'up' || p.kind === 'cos' && ch.seat !== p.seat) continue;
    if (Math.abs(ch.x - p.x) < p.r * 0.95 && Math.abs(ch.y - p.y) < p.r * 0.95) { const q = R.toScreen(v, p.x, p.y); txt(c, p.label, Math.round(q[0]), Math.round(q[1]) - 120, 12, '#ffffff', 'center', 'b'); }
  }
};

// ---------- the host's connection hooks (4P) ----------
Main.hostHooks4 = {
  joined(s) {
    if (G && G.m4 && !G.menu) {   // a new player takes the seat whose player stayed away past the window
      const q = G.seats.find(x => x.who === 'free' && x.was === s.id);
      if (q) { q.who = s.id; q.conn = true; delete q.was; UI.toast(q.name + ' joined.', 'L', 'ic_check'); UI.toast(q.name + ' joined.', 'R', 'ic_check'); FA.fb('seat-back'); }
      return;
    }
    Lobby4.joined(s);
  },
  back(s) {
    const m = G && G.menu;
    if (m && m.l4) { say(m, Lobby4.label(Lobby4.addChar(m.l4, s.id)) + ' is back', '#9affb8'); return; }
    if (G && G.m4) { const q = G.seats.find(x => x.who === s.id); if (q) { q.conn = true; UI.toast(q.name + ' is back.', 'L', 'ic_check'); UI.toast(q.name + ' is back.', 'R', 'ic_check'); FA.fb('seat-back'); } }
  },
  lost(s) {
    const m = G && G.menu;
    if (m && m.l4) { const c = m.l4.chars.find(x => x.who === s.id); if (c) { c.conn = false; say(m, Lobby4.label(c) + ' lost the connection', '#ff9a8a'); const o = m.l4.seats[c.seat]; if (o) o.ready = false; } return; }
    if (G && G.m4) {
      const q = G.seats.find(x => x.who === s.id);
      if (q) { q.conn = false; UI.toast(q.name + ' lost the connection: standing by (' + Math.round(Net.REJOIN_MS / 1000) + 's)', 'L', 'ic_warn'); UI.toast(q.name + ' lost the connection', 'R', 'ic_warn'); FA.fb('seat-lost'); }
      Main.setHold(s.id, false);
    }
  },
  released(s) {   // the 60 seconds are up: the seat stays idle (the game goes on) and anyone with the code may take it
    const m = G && G.menu;
    if (m && m.l4) { const c = m.l4.chars.find(x => x.who === s.id); if (c) { const o = m.l4.seats[c.seat]; if (o) m.l4.seats[c.seat] = { who: null, ready: false, att: [] }; m.l4.chars.splice(m.l4.chars.indexOf(c), 1); } return; }
    if (G && G.m4) { const q = G.seats.find(x => x.who === s.id); if (q) { q.was = s.id; q.who = 'free'; UI.toast(q.name + ' left: the seat is open', 'L', 'ic_warn'); } }
  },
  pause(s, on) { if (G && G.m4 && !G.menu) Main.setHold(s.id, on); },
  buy(s, id) {
    if (!G || !G.m4) return;
    const before = G.xp + '|' + JSON.stringify(G.tree);
    UI.toastCap = [];
    try { UI.buy(id); } finally { var caps = UI.toastCap; UI.toastCap = null; }
    const ok = G.xp + '|' + JSON.stringify(G.tree) !== before;
    Net.sendBuyRes4(s, id, ok, caps);
  },
  padBack(s) {   // a Wizard's Back opens his own tree on his own screen (it is not a pad press here); a Builder's Back is the demolish toggle
    const q = G && G.seats && G.seats.find(x => x.who === s.id);
    return !!q && q.role === 'B';
  },
};
Net.hooks4 = Main.hostHooks4;
})();

// ---------- the 4P game starts (host) ----------
Lobby4.launch = function () {
  const m = G.menu, L = m.l4, pend = m.pend || { slot: 1 };
  const seats = L.seats.map((o, i) => ({ role: M4.ROLE[i], n: i < 2 ? i + 1 : i - 1, name: CFG.mode4.seats[i].name, col: CFG.mode4.seats[i].col, who: o.who, pad: o.who === 'host' ? -1 : (Net.slot(o.who) || {}).pad, att: o.att.slice(), conn: true }));
  const me = seats.findIndex(s => s.who === 'host');
  Net.sealed = true; Net.on = true; Net.mode = 4;
  Players.ctl = { kbB: M4.ROLE[me] === 'B', kbW: M4.ROLE[me] === 'W', pb: IN.padList.length ? 0 : -1, pw: -1 };
  Players.save();
  if (pend.kind === 'load') Main.loadGame4(pend.slot || 1, { seats, me }); else Main.newGame4(pend.slot || 1, { seats, me });
  Main.netUi(M4.ROLE[me] === 'B' ? 'host' : 'guest');
  Net.hooks4 = Main.hostHooks4;
};
