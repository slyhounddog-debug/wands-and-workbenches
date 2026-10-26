'use strict';
// The living menu. After the loading screen and the studio intro the game opens on a small isometric patch of the REAL wilds (the Wizard's own terrain, grass and renderer) with
// both characters standing in it. Every menu of the front flow is a set of floor plates in this world: you use a menu by walking onto plates. No DOM menus are left in the
// front flow; anything that shows text is a window that flies out of the plate that summoned it and hovers above it (js/menudraw.js draws all of it).
//
// How it is built (nothing here is a parallel fake of the game):
//  - the menu world is a scratch game state: Menu.make() returns a G made by the game's own blankState / WZ.fresh / FA.fresh with G.menu on it. It is never saved and never
//    touches a save. The Wizard is the real Wizard in G.w, the Builder the real Builder in G.bd (his factory grid is a small scratch floor laid over the same patch:
//    factory tile (fx, fy) is world tile (fx + OX, fy + OY)), the spell belt line is real belts moved by FA.update, a thrown spell goes through FA.land -> the Spell
//    Portal -> FA.deliver -> WZ.send -> WZ.incoming -> WZ.cast like in the game, so it plays the real spell on the real Wizard. G.menu.* switches off only the wild monsters,
//    the damage and the HUD.
//  - ALL menu state is plain data in G.menu (plates, modals, the countdown, the start sequence), so the host-authoritative online build streams it like any other state:
//    the online guest sees and walks the very same menu world through the normal snapshot + pad wire (no protocol change).
//  - a plate triggers on the step-on edge: a character walking onto it. A plate that pops in under a character stays dormant until that character steps off and on again.
//    A spell's reach (WZ.each, flying bolts) can press the SAFE plates only (navigation and info); anything that starts, loads, overwrites or joins needs a character on it.
const Menu = {};
(function () {
// The patch is the floor of the menu world (tiles in x0..x1 by y0..y1). The wilds' start is the tip of a landmass that lies to the north (water to the south, east and
// south-west), so the main menu's patch is the dry square round the spawn and the character select's grows to the north, where there is room for its plates.
const RECT_MAIN = { x0: 94, x1: 108, y0: 90, y1: 104 }, RECT_CS = { x0: 88, x1: 108, y0: 82, y1: 104 };
const CEN_MAIN = { x: 101, y: 97 }, CEN_CS = { x: 97.5, y: 93.5 };   // where the camera looks for each
const FW = 34, OX = 80, OY = 80;           // the scratch factory grid is FW x FW; factory tile (fx, fy) is world tile (fx + OX, fy + OY)
const BELT = { y: 11, x0: 15, n: 8 }, PORTAL = { x: 25, y: 11 };   // the spell belt line (factory coordinates) and the Spell Portal's top cell
Menu.OX = OX; Menu.OY = OY; Menu.FW = FW; Menu.BELT = BELT; Menu.PORTAL = PORTAL;
Menu.camOf = () => G.menu.cam;
// a screen offset in px from the page's centre -> world coordinates (the wilds' tiles are 60 x 30 px)
const at = (sx, sy, c) => { c = c || (G.menu && G.menu.tc) || CEN_MAIN; return { x: c.x + (sx / 30 + sy / 15) / 2, y: c.y + (sy / 15 - sx / 30) / 2 }; };
Menu.at = at;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
Menu.charPos = role => (role === 'B' ? { x: G.bd.x + OX, y: G.bd.y + OY } : { x: G.w.x, y: G.w.y });
const ROLES = ['B', 'W'];

// ---------- the scratch world ----------
Menu.fresh = () => ({
  v: 1, t: 0, rect: Object.assign({}, RECT_MAIN), tr: Object.assign({}, RECT_MAIN), cam: Object.assign({}, CEN_MAIN), tc: Object.assign({}, CEN_MAIN), landN: -1, beltOn: true, free: false, ret: null, tele: null, dropB: null, sx: null, fade: 0, page: 'main', stack: [], plates: [], nextId: 1, modals: [],
  conn: { B: false, W: false }, kbUsed: { B: false, W: false }, swap: false, count: -1, seq: null, hideB: false,
  toasts: [], ev: [], evN: 0, beltT: 1.2, online: null, flow: '', pend: null, kb: null, typing: null, doc: { id: 'howto', pg: 0 }, statues: null,
});
// ret: coming back from a game ({ x, y, fx, fy, cam }: where the Wizard stands) - the Builder drops in beside him, both are teleported to the start, then the plates pop up
Menu.make = function (ret) {
  const g = blankState(0);
  g.slot = 0; g.menu = Menu.fresh();
  G = g;   // (WZ / FA helpers read the global G)
  for (const k in g.stock) g.stock[k] = 0;   // (there is no Stockpile here: starting materials would spill out onto the floor)
  R.focus = null; R.hint = null; R.whint = null; R.aim = null; R.ghost = null; R.demo = null; R.hoverB = null;   // (whatever the last game was pointing at)
  g.w = WZ.fresh();
  g.fac = FA.fresh(FW, FW);
  g.fac.qp = { x: 1, y: 1 };   // (the "?" station sits far off the patch)
  FA.setPortals(PORTAL.x, PORTAL.y);
  for (let i = 0; i < BELT.n; i++) FA.addBelt(BELT.x0 + i, BELT.y, 0);
  g.bd = FA.freshBuilder();
  Menu.setLand(g.menu.tr);
  const b = at(110, -5), w = at(-30, -20);
  g.bd.x = b.x - OX; g.bd.y = b.y - OY; g.bd.fx = 1; g.bd.fy = 0;
  g.w.x = w.x; g.w.y = w.y; g.w.fx = 1; g.w.fy = 1;
  g.w.spawnT = 1e9;
  g.ctl = Menu.ctlFor(g.menu);
  g.swapped = g.menu.swap && g.ctl.kbB && g.ctl.kbW;
  Menu.lastEv = 0;
  if (ret) {
    const m = g.menu;
    m.free = true; m.beltOn = false; m.ret = { ph: 0, t: 0 }; m.dropB = { t0: 0.45 };
    g.w.x = ret.x; g.w.y = ret.y; g.w.fx = ret.fx; g.w.fy = ret.fy;
    R.wcam.x = ret.cam.x; R.wcam.y = ret.cam.y;
    g.bd.x = ret.x + 1.5 - OX; g.bd.y = ret.y - 0.2 - OY;
  } else {
    R.wcam.x = CEN_MAIN.x; R.wcam.y = CEN_MAIN.y;
    Menu.show('main', { first: true });
  }
  return g;
};
// the Builder's floor: every tile of the patch that is dry land (the Wizard is kept in by the same rectangle and by the water itself)
Menu.setLand = function (r) {
  const f = G.fac;
  for (let fy = 0; fy < FW; fy++) for (let fx = 0; fx < FW; fx++) {
    const wx = fx + OX + 0.5, wy = fy + OY + 0.5;
    f.land[fy * FW + fx] = wx > r.x0 && wx < r.x1 && wy > r.y0 && wy < r.y1 && !WZ.wet(wx, wy) ? 1 : 0;
  }
  G.menu.landN = r.x1 - r.x0 + (r.y1 - r.y0);
};
// who drives whom: pads by number (pad 1 = Builder, pad 2 = Wizard), the keyboard takes whichever job no pad has (both with no pads: WASD + mouse for the Builder, arrows for the
// Wizard). Online the host is the Builder and the guest's virtual pad (slot 1) is the Wizard.
Menu.ctlFor = function (m) {
  if (m.online && m.online.role === 'host') return { kbB: true, kbW: false, pb: IN.pad[0] && IN.padList.length ? 0 : -1, pw: 1 };
  let pb = IN.pad[0] ? 0 : -1, pw = IN.pad[1] ? 1 : -1;
  if (m.swap) { const t = pb; pb = pw; pw = t; }
  return { kbB: pb < 0, kbW: pw < 0, pb, pw };
};

// ---------- events (a ring in G.menu, read by whoever needs to react locally: sounds on the guest, cosmetics on the machine that owns the character) ----------
const ev = (k, x) => { const m = G.menu; m.ev.push(Object.assign({ n: ++m.evN, k }, x)); if (m.ev.length > 16) m.ev.shift(); };
const sfx = name => { AU.sfx(name); ev('sfx', { s: name }); };
Menu.sfx = sfx;
const localRoles = () => (Net.role === 'guest' ? ['W'] : Net.role === 'host' ? ['B'] : ['B', 'W']);
Menu.react = function () {
  const m = G && G.menu;
  if (!m) return;
  if (Menu.lastEv > m.evN) Menu.lastEv = 0;
  for (const e of m.ev) {
    if (e.n <= Menu.lastEv) continue;
    if (e.k === 'sfx' && Net.role === 'guest') AU.sfx(e.s);
    else if (e.k === 'eq' && localRoles().indexOf(e.role) >= 0) {
      const role = e.role === 'B' ? 'builder' : 'wizard';
      if (Players.equipLocal(role, e.cat, e.opt)) AU.sfx('pickup'); else AU.sfx('error');
    }
  }
  Menu.lastEv = m.evN;
};
Menu.say = function (text) {
  const m = G && G.menu;
  if (!m) return;
  m.toasts.push({ text, col: '#ffd23a', t: 0 });
  if (m.toasts.length > 4) m.toasts.shift();
};
Menu.spellName = function (spell) {
  const m = G.menu;
  m.toasts.push({ text: SPELLS[spell] || spell, col: SPELL_COL[spell] || '#ffffff', t: 0 });
  if (m.toasts.length > 4) m.toasts.shift();
};

// ---------- plates ----------
// a plate spec: { key?, act, label, ic?, sx, sy (screen px from the centre) or x, y (world), r (half size in tiles), safe?, role?, kind?, data? }
const sp = (act, label, sx, sy, o) => Object.assign({ act, label, sx, sy, r: 0.8 }, o);
function newPlate(s, delay) {
  const m = G.menu, p = s.sx !== undefined ? at(s.sx, s.sy) : { x: s.x, y: s.y };
  return { id: m.nextId++, key: s.key || null, act: s.act, label: s.label || '', ic: s.ic || null, x: p.x, y: p.y, r: s.r || 0.8, kind: s.kind || 'act', safe: !!s.safe,
    role: s.role || null, data: s.data === undefined ? null : s.data, st: 'wait', t: 0, delay, arm: { B: false, W: false }, on: { B: false, W: false }, cd: 0, flash: 0, col: s.col || null, row: s.row || null };
}
// swap the current plate set for another: the old plates pop out, the new ones pop in (a plate that keeps its key stays put and only changes what it does)
Menu.show = function (page, o) {
  const m = G.menu;
  o = o || {};
  m.page = page;
  if (page !== 'none') {   // the patch and the camera follow the page: the character select needs more floor than the main menu
    m.tr = Object.assign({}, page === 'cs' ? RECT_CS : RECT_MAIN); m.tc = Object.assign({}, page === 'cs' ? CEN_CS : CEN_MAIN);
    if (page === 'cs') Menu.setLand(RECT_CS); else m.shrinkLand = true;   // (the floor is there before the patch has grown over it, and goes when it has shrunk back)
  }
  const specs = Menu.specs(page, o);
  const keep = {};
  for (const s of specs) if (s.key) keep[s.key] = s;
  for (const p of m.plates) {
    if (p.st === 'out') continue;
    const k = p.key && keep[p.key];
    if (k) { p.act = k.act; p.safe = !!k.safe; if (k.label !== undefined) p.label = k.label; k.used = true; continue; }
    p.st = 'out'; p.t = 0; p.delay = 0;
  }
  for (const md of m.modals) md.out = true;
  if (!o.first && page !== 'none') AU.sfx('place');
  let i = 0;
  const gap = Math.min(0.035, 0.9 / Math.max(1, specs.length));
  for (const s of specs) if (!s.used) m.plates.push(newPlate(s, (o.first ? 0.5 : 0.1) + (i++) * gap));
  Menu.pageModals(page, o);
};
Menu.go = function (page, o) { const m = G.menu; m.stack.push(m.page); Menu.show(page, o); };
Menu.back = function () {
  const m = G.menu;
  if (m.online && (m.page === 'host' || m.page === 'cs')) { Menu.hostCancel(); if (m.stack[m.stack.length - 1] === 'host') m.stack.pop(); }   // leaving the lobby closes the room
  if (m.page === 'join') Menu.joinCancel();
  const prev = m.stack.pop() || 'main';
  Menu.show(prev, { back: true });
};
function modal(kind, o) {
  const m = G.menu, md = Object.assign({ id: m.nextId++, kind, anchor: null, t: -0.25, out: false }, o);
  m.modals.push(md);
  return md;
}
Menu.modal = modal;
Menu.closeModals = function () { for (const md of G.menu.modals) md.out = true; };

// ---------- the plate sets ----------
const SLOT_POS = [[-250, 75], [0, 110], [250, 75]];
const BACK_AT = [0, 185];   // the Back plate sits at the patch's bottom corner (a few pages need that spot and put it on the left corner instead)
Menu.slotLines = function (i) {
  const s = UI.slotInfo(i);
  if (!s) return { empty: true, lines: ['SLOT ' + i, 'Empty'] };
  if (s.old) return { empty: false, old: true, lines: ['SLOT ' + i, 'Save from an older version'] };
  const nb = s.fac && s.fac.bld ? s.fac.bld.length : 0, q = Main.questOf(s);
  return { empty: false, lines: ['SLOT ' + i, Math.floor(s.xp || 0) + ' XP, ' + nb + ' buildings', 'goals ' + (q.B + q.W) + '/' + (QUESTS.B.length + QUESTS.W.length), s.at ? new Date(s.at).toLocaleDateString() : ''] };
};
Menu.specs = function (page, o) {
  const m = G.menu, back = (left) => sp('back', 'BACK', left ? -300 : BACK_AT[0], left ? -10 : BACK_AT[1], { ic: 'ic_x', safe: true, kind: 'back', r: 0.7, key: 'back' });
  switch (page) {
    case 'main': return [
      sp('go:new', 'NEW GAME', -300, 10, { ic: 'ic_play' }),
      sp('go:load', 'LOAD GAME', -225, 55, { ic: 'ic_folder' }),
      sp('go:online', 'ONLINE', -150, 100, { ic: 'ic_portal', safe: true }),
      sp('go:settings', 'SETTINGS', -65, 138, { ic: 'ic_gear', safe: true }),
      sp('doc:controls', 'CONTROLS', 20, 158, { ic: 'ic_pad', safe: true, key: 'controls' }),
      sp('doc:howto', 'HOW TO PLAY', 105, 126, { ic: 'ic_book', safe: true, key: 'howto' }),
      sp('go:ach', 'ACHIEVEMENTS', 185, 84, { ic: 'ic_trophy', safe: true }),
    ];
    case 'slots': {
      const out = [back()];
      for (let i = 0; i < 3; i++) out.push(sp('slot:' + (i + 1), 'SLOT ' + (i + 1), SLOT_POS[i][0], SLOT_POS[i][1], { ic: m.flow === 'load' ? 'ic_folder' : m.flow === 'new' ? 'ic_play' : 'ic_portal', key: 'slot' + (i + 1), r: 0.9 }));
      return out;
    }
    case 'confirm': return [
      sp('ok', 'OVERWRITE', -110, 80, { ic: 'ic_warn', key: 'ok', col: '#e8503a' }),
      sp('back', 'CANCEL', 110, 80, { ic: 'ic_x', key: 'cancel', safe: false, kind: 'back' }),
    ];
    case 'settings': {
      const out = [back()];
      for (const [row, k, y, ic] of [[0, 'sfx', -10, 'ic_sound'], [1, 'music', 85, 'ic_music']]) {
        for (let i = 0; i < 8; i++) out.push(sp('vol:' + k + ':' + i, '', -217 + i * 62, y, { r: 0.46, kind: 'vol', data: { k, i }, ic: i === 0 ? 'ic_x' : null }));
        out.push({ act: 'none', label: k === 'sfx' ? 'SOUND' : 'MUSIC', sx: -255, sy: y - 38, r: 0.001, kind: 'tag', ic, key: 'tag_' + k });
      }
      return out;
    }
    case 'howto': case 'controls': {
      const key = page, ac = page === 'howto' ? 'doc:howto' : 'doc:controls';
      const lbl = page === 'howto' ? 'HOW TO PLAY' : 'CONTROLS', ic = page === 'howto' ? 'ic_book' : 'ic_pad';
      const pos = page === 'howto' ? [105, 126] : [20, 158];
      return [sp(ac, lbl, pos[0], pos[1], { ic, key, safe: false, kind: 'anchor' }), back(true), sp('pg:-1', 'PREV', -230, 60, { ic: 'ic_x', kind: 'pg', r: 0.7, data: -1 }), sp('pg:1', 'NEXT', -130, 112, { ic: 'ic_play', kind: 'pg', r: 0.7, data: 1 })];
    }
    case 'ach': return [back(), sp('ach:0', 'PAGE 1', -110, 70, { ic: 'ic_trophy', key: 'ach0', r: 0.9 }), sp('ach:1', 'PAGE 2', 110, 70, { ic: 'ic_trophy', key: 'ach1', r: 0.9 })];
    case 'online': return [
      back(),
      sp('go:create', 'CREATE GAME', -130, 60, { ic: 'b:altar', key: 'create', r: 0.9 }),
      sp('go:join', 'JOIN GAME', 130, 60, { ic: 'ic_hat', key: 'join', r: 0.9 }),
      sp('net:test', 'CHECK THIS COMPUTER', -290, 10, { ic: 'ic_chart', key: 'test', r: 0.7 }),
    ];
    case 'host': return [back(), sp('none', 'CREATE GAME', -130, 60, { ic: 'b:altar', key: 'create', r: 0.9, kind: 'anchor' })];
    case 'join': return [back(), sp('none', 'JOIN GAME', 130, 60, { ic: 'ic_hat', key: 'join', r: 0.9, kind: 'anchor' })];
    case 'cs': return Menu.csSpecs();
  }
  return [];
};
// the modals a page raises (after its plates)
Menu.pageModals = function (page, o) {
  const m = G.menu;
  if (page === 'slots') for (let i = 1; i <= 3; i++) { const s = Menu.slotLines(i); modal('slot', { anchor: 'slot' + i, lines: s.lines, empty: s.empty, t: -0.45 - i * 0.1 }); }
  else if (page === 'howto' || page === 'controls') { m.doc = { id: page, pg: 0 }; modal('doc', { anchor: page, doc: page, t: -0.15 }); }
  else if (page === 'host') modal('room', { anchor: 'create', t: -0.3 });
  else if (page === 'join') modal('code', { anchor: 'kb', t: -0.45 });
  else if (page === 'confirm' && o.slot) { const c = Menu.slotLines(o.slot); modal('text', { title: 'OVERWRITE SLOT ' + o.slot + '?', lines: ['This replaces the saved game:'].concat(c.lines.slice(1)), t: -0.2, at: { sx: 0, sy: 20 } }); }
  if (page === 'join') Menu.kbPop();
};

// ---------- what a plate does ----------
Menu.fire = function (p, who) {
  if (p.cd > 0 || p.st !== 'up') return;
  const m = G.menu;
  p.cd = 0.55; p.flash = 0.4;
  const [a, arg, arg2] = p.act.split(':');
  const A = ACT[a];
  if (!A) return;
  if (p.kind === 'back') sfx('menu_close'); else if (p.kind !== 'vol' && a !== 'none') sfx('tab');
  A(p, who, arg, arg2);
};
const ACT = {
  none() {},
  back() { Menu.back(); },
  go(p, who, page) {
    const m = G.menu;
    if (page === 'new' || page === 'load') { m.flow = page; Menu.go('slots'); }
    else if (page === 'create') { m.flow = 'create'; Menu.go('slots'); }
    else if (page === 'join') Menu.go('join');
    else Menu.go(page);
  },
  doc(p, who, id) { Menu.go(id); },
  pg(p, who, d) { const m = G.menu, n = Menu.docCount ? Menu.docCount(m.doc.id) : 1; m.doc.pg = clamp(m.doc.pg + (+d), 0, Math.max(0, n - 1)); },
  ach(p, who, i) {
    for (const md of G.menu.modals) if (md.kind === 'ach') md.out = true;
    modal('ach', { anchor: 'ach' + i, page: +i, t: -0.05 });
  },
  vol(p, who, k, i) {
    const lv = (+i) / 7;
    if (k === 'sfx') { AU.setSfx(lv); AU.sfx('pickup'); } else AU.setMusic(lv);
    ev('sfx', { s: k === 'sfx' ? 'pickup' : 'blip' });
  },
  slot(p, who, n) {
    const m = G.menu, i = +n, s = UI.slotInfo(i);
    if (m.flow === 'new') {
      if (s) Menu.go('confirm', { slot: i }), (m.pend = { kind: 'new', slot: i, online: false });
      else Menu.startFlow('new', i);
    } else if (m.flow === 'load') {
      if (!s || s.old) { sfx('thud'); return; }
      Menu.startFlow('load', i);
    } else if (m.flow === 'create') {
      if (s && s.old) { sfx('thud'); return; }
      if (s) Menu.go('confirm', { slot: i }), (m.pend = { kind: 'create', slot: i, online: true });
      else Menu.hostStart(i, true);
    }
  },
  ok() {
    const m = G.menu, q = m.pend;
    if (!q) return;
    m.page = m.stack.pop() || 'slots';   // (the confirmation is a side step: the way back goes to the slots again)
    if (q.kind === 'create') Menu.hostStart(q.slot, true); else Menu.startFlow('new', q.slot);
  },
  eq(p, who) { ev('eq', { role: p.role, cat: p.data.cat, opt: p.data.opt }); },
  net(p, who, what) {
    if (what !== 'test') return;
    const md = modal('text', { anchor: 'test', title: 'THIS COMPUTER', lines: ['Checking...'], t: -0.1 });
    Net.selfTest().then(r => { md.lines = wrapLines(r.text, 54); md.bad = !r.ok; });
  },
};
// plain text wrapped to n characters (the simple modals draw lines as they are)
function wrapLines(s, n) {
  const out = []; let cur = '';
  for (const w of String(s).split(/\s+/)) { if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return out;
}
Menu.wrapLines = wrapLines;

// a spell's reach (or a bolt flying over) presses the SAFE plates only
Menu.touch = function (x, y, r) {
  const m = G && G.menu;
  if (!m || m.seq) return;
  for (const p of m.plates) {
    if (p.st !== 'up' || !p.safe || p.cd > 0) continue;
    if (Math.abs(x - p.x) < p.r + r * 0.8 && Math.abs(y - p.y) < p.r + r * 0.8) Menu.fire(p, null);
  }
};

// ---------- input: the same keys and pads as the game (Main.controls), for the two characters ----------
function readInput(dt) {
  const m = G.menu, c = G.ctl, sh = Main.kbShared(), p0 = Main.padB(), p1 = Main.padW(), altB = Main.altB();
  const none = [0, 0], typing = !!m.typing;
  const K = (l, r, u, d) => (typing ? none : KV(l, r, u, d));
  const wasd = K('KeyA', 'KeyD', 'KeyW', 'KeyS'), arrows = K('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown');
  const either = [clampv(wasd[0] + arrows[0]), clampv(wasd[1] + arrows[1])];
  const bk = !c.kbB ? none : sh ? (G.swapped ? arrows : wasd) : either, wk = !c.kbW ? none : sh ? (G.swapped ? wasd : arrows) : either;
  const hit = code => !typing && IN.hit(code);
  const mouseB = Main.mouseB();
  const B = { ix: clampv(bk[0] + (p0 ? p0.ix : 0)), iy: clampv(bk[1] + (p0 ? p0.iy : 0)) };
  const W = { ix: clampv(wk[0] + (p1 ? p1.ix : 0)), iy: clampv(wk[1] + (p1 ? p1.iy : 0)) };
  B.use = (c.kbB && !(sh && G.swapped) && hit('KeyE')) || (altB && hit('Slash')) || !!(p0 && p0.x && !p0.ltHeld);
  B.pick = (altB && hit('Period')) || !!(p0 && p0.a && !p0.ltHeld);
  B.throwHeld = (altB && !typing && IN.down('Comma')) || !!(p0 && p0.bHeld);
  B.mouseL = mouseB && IN.mouse.lp && !typing; B.mouseR = mouseB && IN.mouse.r && !typing;
  W.roll = (c.kbW && !(sh && G.swapped) && hit('Period')) || (c.kbW && (!sh || G.swapped) && hit('Space')) || !!(p1 && p1.a);
  W.use = (c.kbW && (hit('KeyZ') || hit('Quote'))) || (c.kbW && !c.kbB && hit('KeyE')) || (c.kbW && sh && G.swapped && hit('KeyE')) || !!(p1 && p1.x);
  if (bk[0] || bk[1] || B.use || B.pick || B.mouseL) m.kbUsed.B = m.kbUsed.B || !!c.kbB;
  if (wk[0] || wk[1] || W.roll || W.use) m.kbUsed.W = m.kbUsed.W || !!c.kbW;
  if (IN.mouse.mv) G.lastInput = 'mouse'; else if (bk[0] || bk[1]) G.lastInput = 'kb'; else if (p0 && (p0.ix || p0.iy || p0.any)) G.lastInput = 'pad';
  R.padMode = G.lastInput === 'pad';
  return { B, W };
}
// connected = has a controller that has been used (a pad is connected by being plugged in; online the guest by being live)
function updateConn() {
  const m = G.menu, c = G.ctl;
  m.conn.B = (c.pb >= 0 && !!IN.pad[c.pb]) || (c.kbB && m.kbUsed.B);
  m.conn.W = m.online && m.online.role === 'host' ? (Net.state === 'live' && !!Net.conn) : (c.pw >= 0 && !!IN.pad[c.pw]) || (c.kbW && m.kbUsed.W);
  if (m.online && m.online.role === 'host' && c.pb >= 0 && !IN.pad[c.pb]) m.conn.B = c.kbB && m.kbUsed.B;
}
// the mouse's tile in factory coordinates (the Builder aims throws with it)
const hoverFac = () => { const t = R.toTile(R.wv, IN.mouse.x, IN.mouse.y); return [t[0] - OX, t[1] - OY]; };
function aimNow() {
  if (G.lastInput === 'mouse' && Main.mouseB()) { const [px, py] = hoverFac(); return FA.throwTarget(px, py); }
  return FA.throwTarget();
}
function throwAlong() {
  if (!G.hands.length || G.bd.gather) return;
  const a = aimNow();
  if (a) FA.throwOne(a.x, a.y);
}
Menu.aimNow = aimNow;

// ---------- the belt line: spells come in forever ----------
const pool = () => ['air', 'water', 'fire', 'earth'].concat(Object.keys(SPELL_EL).filter(k => ITEMS[k] && ITEMS[k].spell));
function feedBelt(dt) {
  const m = G.menu;
  if (m.seq) return;
  if ((m.beltT -= dt) > 0) return;
  m.beltT = 2.4;
  const f = G.fac, first = f.belts.find(b => b.x === BELT.x0 && b.y === BELT.y);
  if (!first || first.item || f.belts.filter(b => b.item).length >= 4 || f.floor.length > 6) return;
  const p = pool();
  first.item = { kind: p[Math.floor(Math.random() * p.length)], prog: 0, moved: true };
}

// ---------- the step ----------
Menu.step = function (dt) {
  const m = G.menu, f = G.fac, w = G.w;
  m.t += dt;
  G.ctl = Menu.ctlFor(m);
  G.swapped = m.swap && G.ctl.kbB && G.ctl.kbW;
  if (m.ret) { retTick(dt); for (const md of m.modals) md.t = clamp(md.t + dt * 3.2, -2, 1); Menu.react(); return; }
  updateConn();
  const inp = readInput(dt);
  let B = inp.B, W = inp.W;   // (a character nobody plays gets no input at all; it rocks back and forth on the spot: Menu.idleBob, drawn by menudraw.js)
  if (!m.conn.B) B = { ix: 0, iy: 0, use: false, pick: false, mouseL: false, mouseR: false, throwHeld: false };
  if (!m.conn.W) W = { ix: 0, iy: 0, roll: false, use: false };
  if (m.typing) { B = Object.assign({}, B, { ix: 0, iy: 0 }); }
  const sucked = m.seq && m.hideB;
  // the Builder
  if (!sucked) {
    const bd = G.bd;
    if (B.mouseL) {   // left click: walk to the thing under the cursor and take one
      const [px, py] = hoverFac(), tx = Math.floor(px), ty = Math.floor(py), thing = FA.thingAt(tx, ty, px, py);
      if (thing) { bd.then = thing; bd.target = { x: thing.x, y: thing.y }; } else if (FA.owned(tx, ty)) { bd.then = null; bd.target = { x: px, y: py }; }
      bd.stuckT = 0;
    }
    if (B.pick) FA.interact('pick', true);
    if (B.mouseR || B.throwHeld) throwAlong();
    FA.moveBuilder(dt, B.ix, B.iy);
  }
  FA.update(dt);
  WZ.update(dt, W.ix, W.iy, W.roll, 0, 0);
  if (G.menu !== m) return;
  // stay inside the patch; the patch and the camera glide to where the page wants them
  w.x = clamp(w.x, m.rect.x0 + 0.45, m.rect.x1 - 0.45); w.y = clamp(w.y, m.rect.y0 + 0.45, m.rect.y1 - 0.45);
  w.hp = WZ.maxHp(); w.dead = false;
  const e = Math.min(1, dt * 3);
  for (const k of ['x0', 'x1', 'y0', 'y1']) m.rect[k] += (m.tr[k] - m.rect[k]) * e;
  m.cam.x += (m.tc.x - m.cam.x) * e; m.cam.y += (m.tc.y - m.cam.y) * e;
  if (m.shrinkLand && Math.abs(m.rect.x0 - m.tr.x0) + Math.abs(m.rect.y0 - m.tr.y0) < 0.5 && Math.abs(m.rect.x1 - m.tr.x1) + Math.abs(m.rect.y1 - m.tr.y1) < 0.5) { Menu.setLand(m.tr); m.shrinkLand = false; }
  // the plates
  platesTick(dt);
  for (let i = m.modals.length - 1; i >= 0; i--) {
    const md = m.modals[i];
    md.t = clamp(md.t + dt * (md.out ? -4 : 3.2), -2, 1);
    if (md.out && md.t <= 0) m.modals.splice(i, 1);
  }
  for (let i = m.toasts.length - 1; i >= 0; i--) { m.toasts[i].t += dt; if (m.toasts[i].t > 3.2) m.toasts.splice(i, 1); }
  if (m.kb) { m.kb.t = clamp(m.kb.t + dt * (m.kb.out ? -4 : 3), 0, 1); if (m.kb.out && m.kb.t <= 0) m.kb = null; }
  interactions({ B, W });
  if (m.typing) typingTick(dt);
  else if ((IN.hit('Escape') || (G.ctl.pw >= 0 && IN.pad[G.ctl.pw] && IN.pad[G.ctl.pw].b)) && !m.online && !m.seq && m.page !== 'main' && m.stack.length) { const bp = m.plates.find(q => q.kind === 'back' && q.st === 'up'); if (bp) Menu.fire(bp, null); }   // Esc is a shortcut for the Back plate (offline)
  feedBelt(dt);
  csTick(dt);
  onlineTick(dt);
  seqTick(dt);
  Menu.react();
};
function platesTick(dt) {
  const m = G.menu;
  for (let i = m.plates.length - 1; i >= 0; i--) {
    const p = m.plates[i];
    if (p.cd > 0) p.cd -= dt;
    if (p.flash > 0) p.flash -= dt;
    if (p.st === 'wait') { if ((p.delay -= dt) <= 0) { p.st = 'in'; p.t = 0; if (p.kind !== 'tag' && p.kind !== 'vol') puff(p.x, p.y); } }
    else if (p.st === 'in') { p.t += dt / 0.3; if (p.t >= 1) { p.t = 1; p.st = 'up'; } }
    else if (p.st === 'out') { p.t += dt / 0.22; if (p.t >= 1) { m.plates.splice(i, 1); continue; } }
    if (p.kind === 'tag') continue;
    for (const role of ROLES) {
      if (p.role && p.role !== role) { p.on[role] = false; continue; }
      if (!m.conn[role] || m.hideB && role === 'B') { p.on[role] = false; p.arm[role] = false; continue; }
      const c = Menu.charPos(role), ov = Math.abs(c.x - p.x) < p.r * 0.95 && Math.abs(c.y - p.y) < p.r * 0.95;
      p.on[role] = ov;
      if (!ov) p.arm[role] = true;   // armed: this character is off the plate, so the next time it is on it, that is a step-on
      else if (p.st !== 'up') p.arm[role] = false;   // (a plate that is still popping up under somebody is not a step-on: they must step off and on again)
      else if (p.arm[role] && !m.seq && p.kind !== 'ready') { p.arm[role] = false; Menu.fire(p, role); }
    }
  }
}
// a little pop of dust where a plate pops in
function puff(wx, wy) { G.fac.parts.push({ x: wx - OX, y: wy - OY, z: 0.05, vx: 0, vy: 0, vz: 0.7, g: 1, t: 0.4, col: '#f4efe0', dust: true }); }

// ---------- interactions: the use button next to a prop ----------
const near = (role, o, d) => { const c = Menu.charPos(role); return Math.hypot(c.x - o.x, c.y - o.y) < d; };
Menu.kbPop = function () {
  const m = G.menu;
  if (m.kb) { m.kb.out = false; return; }
  const p = at(0, 10);
  m.kb = { x: p.x, y: p.y, t: 0, out: false };
};
Menu.nearProp = function (role) {
  const m = G.menu;
  if (m.kb && !m.kb.out && m.kb.t >= 1 && !m.typing && near(role, m.kb, 2.2)) return 'kb';
  if (m.page === 'cs' && m.statues && !m.online) { const o = role === 'B' ? 'W' : 'B'; if (near(role, m.statues[o], 1.9)) return 'statue'; }
  return null;
};
function interactions(inp) {
  const m = G.menu;
  for (const role of ROLES) {
    if (!m.conn[role] || !inp[role].use || m.seq) continue;
    const prop = Menu.nearProp(role);
    if (prop === 'kb') { m.typing = { who: role, code: '', msg: '', busy: false, t: 0, fresh: true }; sfx('menu_open'); }
    else if (prop === 'statue') swapJobs(role);
  }
}
// the local job swap in menu form: the statue of the character you are not hands you that character (pads trade places, a shared keyboard flips its layout)
function swapJobs(role) {
  const m = G.menu;
  m.swap = !m.swap;
  const t = m.kbUsed.B; m.kbUsed.B = m.kbUsed.W; m.kbUsed.W = t;
  sfx('swap');
  const a = Menu.charPos('B'), b = Menu.charPos('W');
  puff(a.x, a.y); puff(b.x, b.y);
}

// ---------- typing a room code at the keyboard prop (E removed from the alphabet: it is the cancel key) ----------
// cancelling steps the character away from the keyboard (a hop out to where the use button no longer reaches it)
function stepAway(role) {
  const m = G.menu, k = m.kb;
  if (!k) return;
  const c = Menu.charPos(role), d = Math.hypot(c.x - k.x, c.y - k.y) || 1;
  const tx = k.x + (c.x - k.x) / d * 2.9, ty = k.y + (c.y - k.y) / d * 2.9;
  if (role === 'B') { if (FA.owned(Math.floor(tx - OX), Math.floor(ty - OY))) { G.bd.x = tx - OX; G.bd.y = ty - OY; G.bd.vx = G.bd.vy = 0; G.bd.squash = 0.18; } }
  else if (!WZ.blocked(tx, ty, 0.4)) { G.w.x = tx; G.w.y = ty; G.w.vx = G.w.vy = 0; G.w.squashT = 0.18; }
  puff(c.x, c.y);
}
function typingTick(dt) {
  const m = G.menu, t = m.typing;
  t.t += dt;
  if (t.fresh) { t.fresh = false; return; }   // (the press of E that opened it must not also cancel it)
  if (t.busy) return;
  if (IN.hit('KeyE') || IN.hit('Escape') || (IN.pad[0] && IN.pad[0].b) || (IN.pad[1] && IN.pad[1].b)) { const who = t.who; m.typing = null; sfx('menu_close'); stepAway(who); return; }
  if (IN.hit('Backspace')) { t.code = t.code.slice(0, -1); t.msg = ''; sfx('blip'); }
  for (const k of IN.order) {   // (in the order they went down)
    const mt = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(k), ch = mt && (mt[1] || mt[2] || mt[3]);
    if (ch && t.code.length < 6 && Net.ALPHA.indexOf(ch) >= 0) { t.code += ch; t.msg = ''; sfx('blip'); }
  }
  if (IN.hit('Enter') || IN.hit('NumpadEnter')) {
    if (t.code.length !== 6) { t.msg = 'The code has 6 letters and numbers.'; sfx('error'); return; }
    t.busy = true; t.msg = 'Connecting...';
    const code = t.code;
    Main.joinOnline(code).catch(e => {   // (on success the window says "Joined!" until the host's menu world arrives as snapshots)
      if (!G || !G.menu || !G.menu.typing) return;
      const tt = G.menu.typing; tt.busy = false; tt.msg = e.message; tt.log = Net.logText(8);
      sfx('error');
    });
  }
}
Menu.joinCancel = function () {
  const m = G.menu;
  m.typing = null;
  if (m.kb) m.kb.out = true;
  if (Net.role === 'guest') Net.close(false);
};

// ---------- starting a game ----------
Menu.startFlow = function (kind, slot) {
  const m = G.menu;
  m.pend = { kind, slot, online: false };
  Menu.go('cs');
};

// ---------- online: the host's room ----------
Menu.hostStart = function (slot, isNew) {
  const m = G.menu;
  m.pend = { kind: isNew ? 'new' : 'load', slot, online: true };
  m.online = { role: 'host', state: 'opening', code: '', status: '', slot, isNew, err: '' };
  Net.hooks = Main.hostHooks; Net.pending = { slot, isNew };
  Menu.go('host');
  Net.createRoom().then(code => { if (G && G.menu && G.menu.online) { G.menu.online.state = 'waiting'; G.menu.online.code = code; } })
    .catch(e => { Net.reset(); if (G && G.menu && G.menu.online) { G.menu.online.state = 'error'; G.menu.online.err = e.message; } });
};
Menu.hostCancel = function () {
  const m = G.menu;
  if (Net.role) Net.close(false);
  m.online = null;
};
// the guest said hello: both go on to the character select
Menu.guestJoined = function () {
  const m = G.menu;
  if (!m || !m.online) return;
  m.online.state = 'live';
  m.swap = false;
  m.kbUsed.B = true;
  sfx('buy');
  Menu.show('cs', { online: true });
};
function onlineTick(dt) {
  const m = G.menu, o = m.online;
  if (!o || o.role !== 'host') return;
  if (Net.role === 'host') Net.hostTick(dt);
  if (o.state === 'live' && Net.state === 'lost') o.status = 'Player 2 lost the connection. They can come back with the code ' + Net.code + ' (' + Math.ceil(Net.rejoinLeft() / 1000) + 's).';
  else if (o.state === 'live') o.status = '';
  for (const md of m.modals) if (md.kind === 'room') { md.o = { state: o.state, code: o.code, err: o.err, status: o.status }; }
}

// ---------- the character select ----------
// Two blocks of cosmetic plates (one per option, a tiled floor of them), the two statues, a Ready plate per player. Walking onto a cosmetic plate equips it on the machine that
// owns that character (Menu.react), a character standing on its Ready plate is ready, and when every connected player is ready a 3 second countdown starts the game.
Menu.csSpecs = function () {
  const m = G.menu, out = [];
  out.push({ act: 'back', label: 'BACK', x: 95.0, y: 100.5, r: 0.7, safe: true, kind: 'back', ic: 'ic_x', key: 'back' });
  const bb = Players.CATS.builder, wz = Players.CATS.wizard;
  // the Builder's block in the north (a row per category along x), the Wizard's in the south-east (a row per category along y), the belt line runs between them
  bb.forEach((cat, r) => cat.opts.forEach((op, c) => out.push({ act: 'eq', label: op.name, x: 89.5 + c, y: 84.5 + r, r: 0.42, kind: 'cos', role: 'B', data: { cat: cat.key, opt: op.id, kind: cat.kind, who: 'builder' }, row: c === 0 ? cat.label : null })));
  wz.forEach((cat, r) => cat.opts.forEach((op, c) => out.push({ act: 'eq', label: op.name, x: 99.5 + r, y: 93.5 + c, r: 0.42, kind: 'cos', role: 'W', data: { cat: cat.key, opt: op.id, kind: cat.kind, who: 'wizard' }, row: c === 0 ? cat.label : null })));
  out.push({ act: 'ready', label: 'BUILDER READY', x: 92.6, y: 91.4, r: 0.85, kind: 'ready', role: 'B', ic: 'ic_wrench', key: 'readyB' });
  out.push({ act: 'ready', label: 'WIZARD READY', x: 107.0, y: 97.4, r: 0.85, kind: 'ready', role: 'W', ic: 'ic_hat', key: 'readyW' });
  m.statues = { B: { x: 95.0, y: 95.5 }, W: { x: 96.8, y: 97.8 } };
  return out;
};
function csTick(dt) {
  const m = G.menu;
  if (m.page !== 'cs' || m.seq) { if (m.page !== 'cs') m.count = -1; return; }
  const rp = ROLES.map(r => ({ r, p: m.plates.find(q => q.kind === 'ready' && q.role === r) }));
  const on = r => { const q = rp.find(x => x.r === r).p; return !!(q && q.st === 'up' && q.on[r]); };
  const conn = ROLES.filter(r => m.conn[r]);
  const all = conn.length > 0 && conn.every(on) && !m.typing;
  if (all) {
    if (m.count < 0) { m.count = 3; sfx('menu_open'); }
    const was = Math.ceil(m.count);
    m.count -= dt;
    if (Math.ceil(m.count) !== was && m.count > 0) sfx('tab');
    if (m.count <= 0) beginStart();
  } else m.count = -1;
}
function beginStart() {
  const m = G.menu;
  m.count = -1;
  m.seq = { k: 'start', t: 0, ph: 0, belts: 0 };
  sfx('victory');
  Menu.show('none');
}

// ---------- the start sequence: plates pop out, a portal sucks the Builder up, the belt line is sucked away belt by belt, then the game takes over ----------
const SEQ = { out: 0.5, suck: 1.0, beltGap: 0.16, beltT: 0.5, tail: 0.6 };
function seqTick(dt) {
  const m = G.menu, q = m.seq;
  if (!q) return;
  q.t += dt;
  if (q.k !== 'start') return;
  if (q.ph === 0 && q.t >= SEQ.out) {
    q.ph = 1; q.t1 = m.t; m.sx = { t0: m.t };
    sfx('whoosh');
    G.bd.target = null; G.bd.then = null;
  }
  if (q.ph === 1 && m.t >= q.t1 + SEQ.suck) {
    q.ph = 2; q.t2 = m.t; m.hideB = true;
    const f = G.fac; f.floor.length = 0; f.flying.length = 0; G.hands.length = 0;
  }
  if (q.ph === 2) {
    const f = G.fac, n = BELT.n, k = Math.min(n, Math.floor((m.t - q.t2) / SEQ.beltGap) + 1);
    while (q.belts < k) {   // the belts go from the Builder's end back toward where they came in
      const b = f.belts.find(x => x.x === BELT.x0 + n - 1 - q.belts);
      if (b) { b.sk = m.t; sfx('whoosh'); }
      q.belts++;
    }
    if (q.belts >= n && m.t >= q.t2 + n * SEQ.beltGap + SEQ.beltT) { q.ph = 3; q.t3 = m.t; m.sx.portal = m.t; sfx('whoosh'); }
  }
  if (q.ph === 3) {
    if (m.pend && m.pend.online) m.fade = clamp((m.t - q.t3) / SEQ.tail, 0, 1);   // (online the host's screen fades to black here and back in onto the factory)
    if (m.t >= q.t3 + SEQ.tail) { q.ph = 4; Main.launch(m.pend, G); }
  }
}
Menu.SEQ = SEQ;

// ---------- frames ----------
// the offline / host frame: step the menu world and draw it
Menu.frame = function (dt, ts) {
  Menu.step(dt);
  if (STATE !== 'menu' || !G || !G.menu) return;   // (Main.launch may have taken over)
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  R.drawWorld(ctx, dt, { x0: 0, w: CFG.W, pip: true });
};
// the guest's frame while the host is still in the menu world: draw the newest snapshot, send the pad
Menu.guestFrame = function (dt, ts) {
  Net.guestTick(dt);
  Menu.react();
  ctx.clearRect(0, 0, CFG.W, CFG.H);
  R.drawWorld(ctx, dt, { x0: 0, w: CFG.W, pip: true });
};

// ---------- the way back from a game ----------
// The old game's factory has slid away (Main.exitFrame), the Builder drops out of a portal beside the Wizard, then both are teleported to the start of the wilds (a ring opens
// under each, they sink into it and come up at the start), the belt line and the Spell Portal pop up again, and the main menu's plates pop in.
function fxTick(dt) {
  const f = G.fac;
  f.t += dt;
  for (let i = f.parts.length - 1; i >= 0; i--) {
    const p = f.parts[i];
    p.t -= dt; p.x += p.vx * dt * 0.5; p.y += p.vy * dt * 0.5; p.z += p.vz * dt; p.vz -= (p.g === undefined ? 9 : p.g) * dt;
    if (p.t <= 0) f.parts.splice(i, 1);
  }
}
function retTick(dt) {
  const m = G.menu, r = m.ret, bd = G.bd;
  r.t += dt; fxTick(dt);
  if (r.ph === 0 && m.t >= m.dropB.t0 + 0.6) { r.ph = 1; r.t = 0; FA.landPuff(bd.x, bd.y); sfx('thud'); bd.squash = 0.2; }
  else if (r.ph === 1 && r.t >= 0.7) { r.ph = 2; r.t = 0; m.tele = { t0: m.t, dir: 'out' }; sfx('whoosh'); }
  else if (r.ph === 2 && r.t >= 0.85) {
    r.ph = 3; r.t = 0;
    const b = at(-90, 60), w = at(90, 60);
    bd.x = b.x - OX; bd.y = b.y - OY; bd.vx = bd.vy = 0; G.w.x = w.x; G.w.y = w.y; G.w.vx = G.w.vy = 0;
    m.free = false; m.dropB = null; m.beltOn = true; m.beltAt = m.t;
    m.tele = { t0: m.t, dir: 'in' }; sfx('whoosh');
    Menu.show('main', { first: true });
  } else if (r.ph === 3 && r.t >= 0.85) { m.tele = null; m.ret = null; }
}
})();
