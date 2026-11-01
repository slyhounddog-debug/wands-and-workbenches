'use strict';
// 3-PLAYER ONLINE: the lobby and the glue (loaded after online4.js). Like the 4P lobby it is the living menu world: the host's menu world is a game state (G.menu.l3, plain data)
// streamed to the guests, their pads walk their characters in it.
//
// FLOW. Online plate -> 2 / 3 / 4 PLAYER plates -> HOST / JOIN. A joining player picks his role first (three role plates beside the keyboard prop); his hello names it, and a
// role that is already in the room is REJECTED ("that role is already taken": there is one seat per role, nothing to bump to). In the lobby three statues stand side by side,
// the BUILDER, the WIZARD and the ROOTKEEPER: the use key next to a statue switches your character to that role if it is free (a taken one is rejected the same way). The game
// starts when all three roles are held by connected players and each stands on his role's READY plate (a 3 second countdown).
const Lobby3 = {};
(function () {
const OX = 80, OY = 80;
const RECT = { x0: 52, x1: 90, y0: 51, y1: 85 }, TC = { x: 71, y: 68 }, HALL = { x: 71, y: 80.2 };   // (the same cleared block as the 4P lobby)
const STATUE = [{ x: 64.5, y: 75.2 }, { x: 71, y: 75.2 }, { x: 77.5, y: 75.2 }];   // B, W, K
const READY = [{ x: 64.5, y: 70.6 }, { x: 71, y: 70.6 }, { x: 77.5, y: 70.6 }];
const ROLE = ['B', 'W', 'K'], NAME = i => CFG.mode3.seats[i].name, COL = i => CFG.mode3.seats[i].col;
const RICON = { B: 'ic_wrench', W: 'ic_hat', K: 'ic_root' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
Lobby3.RECT = RECT; Lobby3.TC = TC; Lobby3.STATUE = STATUE;
Lobby3.fresh = () => ({ chars: [], seats: [0, 1, 2].map(() => ({ who: null, ready: false })), rej: [], count: -1, me: 'host', n: 0 });
Lobby3.addChar = function (L, who) {
  const c0 = L.chars.find(c => c.who === who);
  if (c0) return c0;
  const c = { who, n: ++L.n, x: HALL.x + (L.chars.length - 1) * 1.4, y: HALL.y + 0.8, vx: 0, vy: 0, fx: 1, fy: 1, seat: -1, bob: 0, moving: false, conn: true, tele: 0 };
  L.chars.push(c);
  return c;
};
Lobby3.me = L => L.chars.find(c => c.who === L.me) || null;
Lobby3.mySeat = () => { const m = G && G.menu, L = m && m.l3, c = L && Lobby3.me(L); return c ? c.seat : -1; };
Lobby3.camTarget = () => { const L = G.menu.l3, c = L && Lobby3.me(L); return c ? { x: c.x, y: c.y } : null; };
Lobby3.label = c => (c.seat >= 0 ? NAME(c.seat) : 'PLAYER ' + c.n);
// is this role free for that player? (the host's own character counts like any other)
Lobby3.taken = (L, role, who) => { const o = L.seats[ROLE.indexOf(role)]; return !!(o && o.who && o.who !== who); };
const say = (m, text, col) => { m.toasts.push({ text, col: col || '#ffd23a', t: 0 }); if (m.toasts.length > 4) m.toasts.shift(); };
const evq = (m, o) => { m.ev.push(Object.assign({ n: ++m.evN }, o)); if (m.ev.length > 16) m.ev.shift(); };
// a player claims a role (a statue, or the role he joined with): free = his; taken = rejected, with a cue over his head and a line at the bottom
Lobby3.claim = function (c, role) {
  const m = G.menu, L = m.l3, s = ROLE.indexOf(role);
  if (c.seat === s) return true;
  if (Lobby3.taken(L, role, c.who)) {
    const by = L.chars.find(q => q.who === L.seats[s].who);
    L.rej.push({ who: c.who, role, t: 0 });
    say(m, (c.who === 'host' ? 'The host' : 'PLAYER ' + c.n) + ': the ' + NAME(s) + ' is already taken' + (by ? ' by ' + (by.who === 'host' ? 'the host' : 'PLAYER ' + by.n) : ''), '#ff9a8a');
    Menu.sfx('error'); FA.fb('lobby-taken');
    return false;
  }
  if (c.seat >= 0) L.seats[c.seat] = { who: null, ready: false };
  L.seats[s] = { who: c.who, ready: false };
  c.seat = s; c.tele = 1;
  say(m, (c.who === 'host' ? 'The host' : 'PLAYER ' + c.n) + ' is the ' + NAME(s) + ' now', COL(s));
  Menu.sfx('swap'); FA.fb('lobby-role');
  return true;
};

// ---------- the plates ----------
Lobby3.specs = function () {
  const out = [], bb = Players.CATS.builder, wz = Players.CATS.wizard;
  out.push({ act: 'back', label: 'BACK', word: 'BACK', x: HALL.x, y: 83.9, r: 0.8, safe: true, kind: 'back', ic: 'ic_x', key: 'backcs3' });
  wz.forEach((cat, j) => cat.opts.forEach((op, i) => out.push({ act: 'eq', label: op.name, x: 53.6 + j * 1.95, y: 53.0 + i * 1.5, r: 0.64, kind: 'cos', role: 'W', seat: 1, data: { cat: cat.key, opt: op.id, kind: cat.kind, who: 'wizard' } })));
  bb.forEach((cat, k) => cat.opts.forEach((op, i) => out.push({ act: 'eq', label: op.name, x: 77.8 + k * 1.95, y: 53.0 + i * 1.5, r: 0.64, kind: 'cos', role: 'B', seat: 0, data: { cat: cat.key, opt: op.id, kind: cat.kind, who: 'builder' } })));
  [0, 1, 2].forEach(s => out.push({ act: 'l3ready:' + s, label: NAME(s) + ' READY', word: 'READY', x: READY[s].x, y: READY[s].y, r: 0.98, kind: 'ready', role: ROLE[s] === 'K' ? 'W' : ROLE[s], seat: s, ic: RICON[ROLE[s]], key: 'ready3' + s, col: COL(s) }));
  return out;
};
Lobby3.tagPlates = function () {
  const m = G.menu, specs = Lobby3.specs();
  for (const p of m.plates) { const s = specs.find(q => (q.key && q.key === p.key) || (!q.key && q.act === p.act && q.label === p.label && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01)); if (s && s.seat !== undefined) p.seat = s.seat; }
};

// ---------- the step (host) ----------
const padOf = who => {
  if (who === 'host') {
    const gp = IN.pad[0] || null, k = (l, r, u, d) => [(IN.down(r) ? 1 : 0) - (IN.down(l) ? 1 : 0), (IN.down(d) ? 1 : 0) - (IN.down(u) ? 1 : 0)];
    const a = k('KeyA', 'KeyD', 'KeyW', 'KeyS'), b = k('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown');
    return { ix: clamp(a[0] + b[0] + (gp ? gp.ix : 0), -1, 1), iy: clamp(a[1] + b[1] + (gp ? gp.iy : 0), -1, 1), use: IN.hit('KeyE') || IN.hit('Slash') || !!(gp && gp.x) };
  }
  const s = Net.slot && Net.slot(who), p = s && s.state === 'live' ? IN.pad[s.pad] : null;
  return p ? { ix: p.ix || 0, iy: p.iy || 0, use: !!p.x } : { ix: 0, iy: 0, use: false };
};
function moveChar(c, dt, pad) {
  const sp = 5.2;
  let dx = pad.ix + pad.iy, dy = pad.iy - pad.ix;
  const mm = Math.hypot(dx, dy);
  if (mm > 0) { dx /= mm; dy /= mm; c.fx = dx; c.fy = dy; }
  const e = Math.min(1, dt * 14);
  c.vx += (dx * sp - c.vx) * e; c.vy += (dy * sp - c.vy) * e;
  const nx = clamp(c.x + c.vx * dt, RECT.x0 + 0.5, RECT.x1 - 0.5), ny = clamp(c.y + c.vy * dt, RECT.y0 + 0.5, RECT.y1 - 0.5);
  if (!WZ.wet(nx, c.y) && !statueAt(nx, c.y)) c.x = nx; else c.vx = 0;
  if (!WZ.wet(c.x, ny) && !statueAt(c.x, ny)) c.y = ny; else c.vy = 0;
  c.moving = Math.hypot(c.vx, c.vy) > 0.3;
  if (c.moving) c.bob += dt * 11;
}
const statueAt = (x, y) => STATUE.some(s => Math.abs(x - s.x) < 0.7 && Math.abs(y - s.y) < 0.7);
Lobby3.nearStatue = c => { let best = -1, bd = 1.9; STATUE.forEach((s, i) => { const d = Math.hypot(c.x - s.x, c.y - s.y); if (d < bd) { bd = d; best = i; } }); return best; };
function platesTick(m, L) {
  for (const p of m.plates) {
    if (p.st !== 'up') { p.on.B = p.on.W = false; continue; }
    let any = false;
    for (const c of L.chars) {
      const mine = p.seat === null || p.seat === undefined ? p.kind === 'back' : c.seat === p.seat;
      const on = !c.tele && Math.abs(c.x - p.x) < p.r * 0.95 && Math.abs(c.y - p.y) < p.r * 0.95;
      if (on && mine) any = true;
      if (!on) { p.arm[c.who] = true; continue; }
      if (!mine || p.kind === 'ready') continue;
      if (p.arm[c.who]) {
        p.arm[c.who] = false; p.flash = 0.4;
        if (p.act === 'eq') evq(m, { k: 'eq', seat: c.seat, role: ROLE[c.seat], cat: p.data.cat, opt: p.data.opt });
        else if (p.kind === 'back' && c.who === 'host') { Menu.sfx('menu_close'); Menu.back(); return; }
      }
    }
    p.on.B = p.on.W = any;
  }
}
Lobby3.step = function (dt) {
  const m = G.menu, L = m.l3;
  if (!L || m.page !== 'cs3') return;
  Lobby3.addChar(L, 'host');
  for (const c of L.chars) {
    if (c.tele > 0) c.tele = Math.max(0, c.tele - dt * 2.2);
    if (m.seq) { c.vx = c.vy = 0; continue; }
    const s = c.who === 'host' ? null : Net.slot(c.who);
    c.conn = c.who === 'host' || !!(s && s.state === 'live');
    const pad = c.conn ? padOf(c.who) : { ix: 0, iy: 0, use: false };
    moveChar(c, dt, pad);
    if (pad.use) { const i = Lobby3.nearStatue(c); if (i >= 0) Lobby3.claim(c, ROLE[i]); }   // the statue interaction: switch to that role
  }
  for (let i = L.rej.length - 1; i >= 0; i--) if ((L.rej[i].t += dt) > CFG.mode4.bumpT) L.rej.splice(i, 1);
  platesTick(m, L);
  const standing = [0, 1, 2].map(s => {
    const o = L.seats[s], c = o.who && L.chars.find(q => q.who === o.who), p = m.plates.find(q => q.kind === 'ready' && q.seat === s);
    return !!(c && c.conn && p && p.st === 'up' && !c.tele && Math.abs(c.x - p.x) < p.r * 0.95 && Math.abs(c.y - p.y) < p.r * 0.95);
  });
  standing.forEach((v, s) => { if (v && !L.seats[s].ready) FA.fb('lobby-ready3'); L.seats[s].ready = v; });
  const full = L.seats.every(o => o.who && L.chars.find(c => c.who === o.who && c.conn));
  if (!m.seq) {
    if (full && standing.every(Boolean)) {
      if (L.count < 0) { L.count = 3; Menu.sfx('menu_open'); }
      const was = Math.ceil(L.count);
      L.count -= dt;
      if (Math.ceil(L.count) !== was && L.count > 0) Menu.sfx('tab');
      if (L.count <= 0) { L.count = -1; m.seq = { k: 'start3', t: 0 }; Menu.sfx('victory'); }
    } else L.count = -1;
  } else { m.seq.t += dt; m.fade = clamp(m.seq.t / 0.7, 0, 1); if (m.seq.t >= 0.8) Lobby3.launch(); }
  for (let i = m.toasts.length - 1; i >= 0; i--) { m.toasts[i].t += dt; if (m.toasts[i].t > 3.2) m.toasts.splice(i, 1); }
  for (let i = m.modals.length - 1; i >= 0; i--) { const md = m.modals[i]; md.t = clamp(md.t + dt * (md.out ? -4 : 3.2), -2, 1); if (md.out && md.t <= 0) m.modals.splice(i, 1); }
  for (let i = m.plates.length - 1; i >= 0; i--) {
    const p = m.plates[i];
    if (p.cd > 0) p.cd -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.st === 'wait') { if ((p.delay -= dt) <= 0) { p.st = 'in'; p.t = 0; } }
    else if (p.st === 'in') { p.t += dt / 0.3; if (p.t >= 1) { p.t = 1; p.st = 'up'; } }
    else if (p.st === 'out') { p.t += dt / 0.22; if (p.t >= 1) { m.plates.splice(i, 1); continue; } }
  }
  Menu.react();
};
// the lobby opens in the menu world when the first guest says hello
Lobby3.open = function () {
  const m = G.menu;
  if (m.l3) return;
  m.l3 = Lobby3.fresh(); m.hideB = true;
  Lobby4.clear();
  Lobby3.addChar(m.l3, 'host');
  Menu.show('cs3');
};
Lobby3.joined = function (slot) {
  const m = G && G.menu;
  if (!m || !m.online) return;
  m.online.state = 'live';
  if (!m.l3) Lobby3.open();
  const c = Lobby3.addChar(m.l3, slot.id);
  say(m, 'PLAYER ' + m.l3.n + ' joined (' + (Net.gs.length + 1) + ' of 3)', '#9affb8');
  if (slot.want && ROLE.indexOf(slot.want) >= 0) Lobby3.claim(c, slot.want);
  Menu.sfx('buy');
};

// ---------- drawing (called from Menu.collect / Menu.drawText) ----------
const synth = (c, base) => Object.assign({}, base, { x: c.x, y: c.y, vx: c.vx, vy: c.vy, fx: c.fx, fy: c.fy, bob: c.bob, moving: c.moving, roll: 0, ghosts: [], squash: 0, target: null });
function drawStatue(cx, v, i) {
  const s = STATUE[i], p = R.toScreen(v, s.x, s.y), r = ROLE[i], spr = r === 'B' ? SP.builder : r === 'W' ? SP.wizard : SP.rootkeeper;
  cx.fillStyle = 'rgba(0,0,0,0.28)'; diamond(cx, p[0] + 3, p[1] + 5, 40, 20); cx.fill();
  cx.fillStyle = '#6a6478'; cx.beginPath(); cx.moveTo(p[0] - 36, p[1] - 14); cx.lineTo(p[0], p[1] + 4); cx.lineTo(p[0] + 36, p[1] - 14); cx.lineTo(p[0] + 36, p[1] - 2); cx.lineTo(p[0], p[1] + 16); cx.lineTo(p[0] - 36, p[1] - 2); cx.closePath(); cx.fill();
  cx.fillStyle = '#a8a2b8'; diamond(cx, p[0], p[1] - 14, 36, 18); cx.fill();
  if (spr) { cx.save(); cx.filter = 'grayscale(1) brightness(1.15) contrast(0.9)'; dspr(cx, spr, p[0], p[1] - 16, 3, 1, r === 'W'); cx.restore(); }
  const L = G.menu.l3, o = L.seats[i];
  cx.fillStyle = o.who ? COL(i) : '#ffd23a'; cx.fillRect(Math.round((p[0] - 9) / 3) * 3, Math.round((p[1] - 4) / 3) * 3, 18, 6);   // the plaque: the role's colour once somebody holds it
}
Lobby3.collect = function (objs, v, mv) {
  const m = G.menu, L = m.l3, t = m.t;
  const push = (d, fn) => objs.push({ d, t: 'menu', fn });
  for (let i = 0; i < 3; i++) push(STATUE[i].x + STATUE[i].y, cx => drawStatue(cx, v, i));
  for (const c of L.chars) {
    const role = c.seat >= 0 ? ROLE[c.seat] : 'W', col = c.seat >= 0 ? COL(c.seat) : '#ffffff';
    push(c.x + c.y, cx => {
      const k = c.tele > 0 ? 1 - c.tele : 1, p = R.toScreen(v, c.x, c.y);
      cx.strokeStyle = col; cx.lineWidth = 3; cx.globalAlpha = c.conn ? 0.9 : 0.35; diamond(cx, p[0], p[1] + 2, 22, 11); cx.stroke(); cx.globalAlpha = 1;
      if (k < 1) { cx.save(); cx.translate(p[0], p[1]); cx.scale(Math.max(0.1, k), Math.max(0.1, k)); cx.translate(-p[0], -p[1]); }
      cx.globalAlpha = c.conn ? (c.seat < 0 ? 0.6 : 1) : 0.5;
      if (role === 'B') R.drawBuilder(cx, mv, synth({ x: c.x - OX, y: c.y - OY, vx: c.vx, vy: c.vy, fx: c.fx, fy: c.fy, bob: c.bob, moving: c.moving }, G.bd), t);
      else if (role === 'K') R.drawRoot(cx, v, { x: c.x, y: c.y, vx: c.vx, vy: c.vy, fx: c.fx, fy: c.fy, bob: c.bob, moving: c.moving, ghosts: [] }, 1, t);
      else R.drawWizard(cx, v, synth(c, G.w));
      cx.globalAlpha = 1;
      if (k < 1) cx.restore();
      txt(cx, Lobby3.label(c), Math.round(p[0]), Math.round(p[1]) + 30, 9, col, 'center', 'd');
      if (!c.conn) txt(cx, 'AWAY', Math.round(p[0]), Math.round(p[1]) - 70, 9, '#ff9a8a', 'center', 'd');
      const rj = L.rej.find(q => q.who === c.who);   // the rejection cue: the role he wanted, crossed out
      if (rj) {
        const a = Math.min(1, (CFG.mode4.bumpT - rj.t) * 2), y0 = p[1] - 96 - Math.sin(rj.t * 6) * 3;
        cx.globalAlpha = a; R.iconRow(cx, p[0], y0, [[RICON[rj.role]]]);
        cx.strokeStyle = '#ff5a5a'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(p[0] - 22, y0 - 26); cx.lineTo(p[0] + 22, y0 + 6); cx.stroke(); cx.globalAlpha = 1;
      }
    });
  }
};
Lobby3.drawText = function (c, v) {
  const m = G.menu, L = m.l3;
  if (!L) return;
  if (m.online && m.online.code) txt(c, 'ROOM CODE ' + m.online.code + '   PLAYERS ' + L.chars.length + ' OF 3', 800, 44, 20, '#ffe36b', 'center', 'd');
  if (L.count > 0) { const p = R.toScreen(v, TC.x, TC.y - 1); txt(c, String(Math.ceil(L.count)), Math.round(p[0]), Math.round(p[1]), 56, '#ffe36b', 'center', 'd'); }
  for (let i = 0; i < 3; i++) {   // each statue's role, and who holds it
    const s = STATUE[i], p = R.toScreen(v, s.x, s.y), o = L.seats[i], by = o.who && L.chars.find(q => q.who === o.who);
    txt(c, NAME(i), Math.round(p[0]), Math.round(p[1]) + 36, 10, COL(i), 'center', 'd');
    txt(c, by ? Lobby3.label(by) === NAME(i) ? (by.who === 'host' ? 'HOST' : 'PLAYER ' + by.n) : '' : 'FREE', Math.round(p[0]), Math.round(p[1]) + 52, 9, by ? '#ffffff' : '#9affb8', 'center', 'd');
  }
  const me = Lobby3.me(L);
  if (me && !m.seq) {
    const i = Lobby3.nearStatue(me);
    if (i >= 0 && me.seat !== i) { const p = R.toScreen(v, STATUE[i].x, STATUE[i].y); txt(c, (Net.role === 'guest' ? 'LEFT CLICK / E' : 'E') + ': BE THE ' + NAME(i), Math.round(p[0]), Math.round(p[1]) - 120, 12, '#ffffff', 'center', 'b'); }
    else if (me.seat < 0) { const p = R.toScreen(v, me.x, me.y); txt(c, 'PICK A ROLE AT A STATUE', Math.round(p[0]), Math.round(p[1]) - 90, 11, '#ffe36b', 'center', 'd'); }
  }
  for (const ch of L.chars) for (const p of m.plates) {
    if (!p.label || p.st !== 'up' || p.kind === 'cos' && ch.seat !== p.seat) continue;
    if (Math.abs(ch.x - p.x) < p.r * 0.95 && Math.abs(ch.y - p.y) < p.r * 0.95) { const q = R.toScreen(v, p.x, p.y); txt(c, p.label, Math.round(q[0]), Math.round(q[1]) - 120, 12, '#ffffff', 'center', 'b'); }
  }
};

// ---------- the host's connection hooks (3P) ----------
Main.hostHooks3 = {
  // a hello: may this player come in with that role? (in the lobby: the role must be free; in the game a seat is only open once its player stayed away past the window)
  canJoin(m) {
    if (m.mode !== 3) return 'mode';
    const mm = G && G.menu, role = ROLE.indexOf(m.role) >= 0 ? m.role : 'W';
    if (mm && mm.l3 && Lobby3.taken(mm.l3, role, null)) { FA.fb('lobby-taken'); return 'role'; }
    return '';
  },
  pickRel(m, rels) {   // a seat released in the game: only the player who asks for ITS role gets it
    if (!G || !G.m3) return rels[0] || null;
    const role = ROLE.indexOf(m.role) >= 0 ? m.role : 'W', q = G.seats.find(x => x.role === role && x.who === 'free');
    return q ? rels.find(s => s.id === q.was) || null : null;
  },
  joined(s) {
    if (G && G.m3 && !G.menu) {
      const q = G.seats.find(x => x.who === 'free' && x.was === s.id);
      if (q) { q.who = s.id; q.conn = true; delete q.was; for (const side of ['L', 'R', 'K']) UI.toast(q.name + ' joined.', side, 'ic_check'); FA.fb('seat-back3'); }
      return;
    }
    Lobby3.joined(s);
  },
  back(s) {
    const m = G && G.menu;
    if (m && m.l3) { say(m, Lobby3.label(Lobby3.addChar(m.l3, s.id)) + ' is back', '#9affb8'); return; }
    if (G && G.m3) { const q = G.seats.find(x => x.who === s.id); if (q) { q.conn = true; for (const side of ['L', 'R', 'K']) UI.toast(q.name + ' is back.', side, 'ic_check'); FA.fb('seat-back3'); } }
  },
  lost(s) {
    const m = G && G.menu;
    if (m && m.l3) { const c = m.l3.chars.find(x => x.who === s.id); if (c) { c.conn = false; say(m, Lobby3.label(c) + ' lost the connection', '#ff9a8a'); const o = m.l3.seats[c.seat]; if (o) o.ready = false; } return; }
    if (G && G.m3) {
      const q = G.seats.find(x => x.who === s.id);
      if (q) { q.conn = false; for (const side of ['L', 'R', 'K']) UI.toast(q.name + ' lost the connection: standing by (' + Math.round(Net.REJOIN_MS / 1000) + 's)', side, 'ic_warn'); FA.fb('seat-lost3'); }
      Main.setHold(s.id, false);
    }
  },
  released(s) {
    const m = G && G.menu;
    if (m && m.l3) { const c = m.l3.chars.find(x => x.who === s.id); if (c) { if (c.seat >= 0) m.l3.seats[c.seat] = { who: null, ready: false }; m.l3.chars.splice(m.l3.chars.indexOf(c), 1); } return; }
    if (G && G.m3) { const q = G.seats.find(x => x.who === s.id); if (q) { q.was = s.id; q.who = 'free'; UI.toast(q.name + ' left: the seat is open', 'L', 'ic_warn'); } }
  },
  pause(s, on) { if (G && G.m3 && !G.menu) Main.setHold(s.id, on); },
  buy(s, id) {
    if (!G || !G.m3) return;
    const before = G.xp + '|' + JSON.stringify(G.tree);
    UI.toastCap = [];
    try { UI.buy(id); } finally { var caps = UI.toastCap; UI.toastCap = null; }
    Net.sendBuyRes4(s, id, G.xp + '|' + JSON.stringify(G.tree) !== before, caps);
  },
  padBack(s) { const q = G && G.seats && G.seats.find(x => x.who === s.id); return !!q && q.role === 'B'; },   // a Builder's Back is demolish; the others' Back opens their tree on their own screen
};
})();

// ---------- the 3P game starts (host) ----------
Lobby3.launch = function () {
  const m = G.menu, L = m.l3, pend = m.pend || { slot: 1 };
  const seats = L.seats.map((o, i) => ({ role: M3.ROLE[i], name: CFG.mode3.seats[i].name, col: CFG.mode3.seats[i].col, who: o.who, pad: o.who === 'host' ? -1 : (Net.slot(o.who) || {}).pad, conn: true }));
  const me = seats.findIndex(s => s.who === 'host');
  Net.sealed = true; Net.on = true; Net.mode = 3;
  Players.ctl = M3.ctlFor(M3.ROLE[me]);
  Players.save();
  if (pend.kind === 'load') Main.loadGame3(pend.slot || 1, { seats, me }); else Main.newGame3(pend.slot || 1, { seats, me });
  M3.netUi(M3.ROLE[me]);
  Net.hooks4 = Main.hostHooks3;
};
