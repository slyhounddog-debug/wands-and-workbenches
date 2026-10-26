'use strict';
// Cosmetics + the profile. Before a game starts each character is dressed up in the living menu world (js/menu.js): every option is a floor plate and walking onto
// an unlocked one equips it. Cosmetics are purely visual and are unlocked by achievements; the achievements and the chosen looks live in a profile in localStorage
// (not in a save), so they carry over to every slot. (The old DOM player-select screen is gone; this file is the catalogue, the achievements and the profile.)
const Players = (() => {
const Players = { prof: null, chips: { kb: 0, p0: -1, p1: 1 }, checkT: 1 };   // (chips: the old player screen's controller positions, kept in the profile untouched)
// who drives what in a running game (G.ctl is a copy): pb / pw = index into IN.pad (-1 = none), kbB / kbW = the keyboard plays that job. The menu world sets it when the game starts.
Players.ctl = { kbB: true, kbW: true, pb: 0, pw: 1 };

// ---------- the catalogue ----------
// o(id, name, achievement needed or null, extra fields). Colour options carry a (main) and b (second tone), which is also the swatch.
const o = (id, name, ach, x) => Object.assign({ id, name, ach: ach || null }, x);
const C = (id, name, ach, a, b, x) => o(id, name, ach, Object.assign({ a, b: b || a }, x));
const SKINS = [C('light', 'Light', null, '#f2c9a0'), C('peach', 'Peach', null, '#e8b088'), C('tan', 'Tan', null, '#d49a6a'), C('brown', 'Brown', null, '#b07848'), C('deep', 'Deep', null, '#8a5a38'), C('dark', 'Dark', null, '#6a4026')];
const TRAILS = (lst) => [o('none', 'No trail', null, { cols: null })].concat(lst);
const T = (id, name, ach, cols) => o(id, name, ach, { cols });
const TRAIL_COLS = {
  sparks: ['#ffd23a', '#ffffff', '#ff9a2b'], embers: ['#ff7a30', '#ffd23a', '#c8431a'], bubbles: ['#7be0ff', '#ffffff', '#bff0ff'],
  leaves: ['#6fd36b', '#3c9e48', '#a8e870'], stardust: ['#ffffff', '#e0b8ff', '#7be0ff'], hearts: ['#ff5a8a', '#ffa0c0', '#ff2a60'],
  rainbow: ['#ff5a5a', '#ffd23a', '#6aff8a', '#7be0ff', '#c890ff'],
};
const BLANK = '............';
// the Builder's body (rows below the helmet); the helmet is 1-5 rows, the last one the brim (8 wide, columns 2-9)
const BODY_B = ['...kkkkkk...', '...kdkkdk...', '...kkkkkk...', '....kkkk....', '..rrbbbbrr..', '.rrrbbbbrrr.', '.kkrbbbbrkk.', '...bbbbbb...', '...bb..bb...', '...bb..bb...', '..nnn..nnn..', '..nnn..nnn..'];
const BODY_W = ['...kkkkkk...', '...kdkkdk...', '...kwwwwk...', '..bbwwwwbb..', '.kbbbwwbbbk.', '.bbbbbbbbbb.', '..bBbbbbBb..', '..bbbbbbbb..', '...nn..nn...', '...nn..nn...'];
const STAFF_SHAFT = 11;

Players.CATS = {
  builder: [
    { key: 'hat', label: 'HELMET', kind: 'hat', opts: [
      o('hard', 'Hard Hat', null, { rows: ['....yyyy....', '...yyyyyy...', '..YYYYYYYY..'] }),
      o('cap', 'Work Cap', 'packets_100', { rows: ['.....oo.....', '...yyyyyy...', '..yyyyyyYY..'] }),
      o('miner', 'Miner Lamp', 'logistics', { rows: ['....yyyy....', '...yyggyy...', '..YYYYYYYY..'] }),
      o('beanie', 'Striped Beanie', 'time1h', { rows: ['.....oo.....', '...yyyyyy...', '..yOyOyOyO..'] }),
      o('chef', 'Chef Toque', 'combos50', { rows: ['..ww.ww.ww..', '.wwwwwwwwww.', '.wwwwwwwwww.', '..YYYYYYYY..'] }),
      o('top', 'Top Hat', 'expand', { rows: ['...yyyyyy...', '...yyyyyy...', '...oooooo...', '.YYYYYYYYYY.'] }),
      o('party', 'Party Cone', 'eggs25', { rows: ['......o.....', '.....yy.....', '....yoyy....', '...yyyyyy...', '..YYYYYYYY..'] }),
      o('prop', 'Propeller Cap', 'charge10', { rows: ['..oooOOooo..', '.....YY.....', '...yyyyyy...', '..YYYYYYYY..'] }),
      o('viking', 'Horned Helm', 'goalsB', { rows: ['.w..yyyy..w.', '.wwyyyyyyww.', '..YYYYYYYY..'] }),
      o('crown', 'Crown', 'win', { rows: ['.G..G..G..G.', '.GGGGGGGGGG.', '..GRGGGRGG..'] }),
    ] },
    { key: 'hatc', label: 'HELMET COLOR', kind: 'color', opts: [
      C('yellow', 'Yellow', null, '#ffc928', '#d99a00'), C('orange', 'Safety Orange', 'first_send', '#ff8a2a', '#c85a10'),
      C('red', 'Brick Red', 'forge', '#d8403a', '#9a2820'), C('blue', 'Sky Blue', 'logistics', '#4aa0e8', '#2a70b8'),
      C('green', 'Leaf Green', 'expand', '#5ac85a', '#388a38'), C('pink', 'Bubblegum', 'eggs25', '#ff8ac0', '#d85a98'),
      C('white', 'Snow White', 'charge10', '#f4f4fa', '#b0b0c8'), C('black', 'Midnight', 'summon', '#3a3650', '#1f1c30'),
      C('gold', 'Golden', 'packets_1500', '#ffe36b', '#e0a820'),
    ] },
    { key: 'outfit', label: 'OVERALLS', kind: 'color', opts: [
      C('classic', 'Classic Blue', null, '#2f6fc6', '#e0562a'), C('forest', 'Forest', 'goalsB', '#2f8a4a', '#d8b030'),
      C('crimson', 'Crimson', 'forge', '#c83a4a', '#f0e0c8'), C('teal', 'Teal', 'combos50', '#2aa8a0', '#f08a4a'),
      C('plum', 'Plum', 'nova', '#7a40b8', '#ff9ad0'), C('charcoal', 'Charcoal', 'summon', '#454560', '#ff5a5a'),
      C('sunset', 'Sunset', 'time1h', '#e86a30', '#ffd23a'), C('golden', 'Golden', 'win', '#e8b830', '#fff6c0'),
    ] },
    { key: 'skin', label: 'SKIN', kind: 'color', opts: SKINS },
    { key: 'trail', label: 'FOOTSTEPS', kind: 'trail', opts: TRAILS([
      T('sparks', 'Sparks', 'packets_100', TRAIL_COLS.sparks), T('embers', 'Embers', 'forge', TRAIL_COLS.embers), T('bubbles', 'Bubbles', 'expand', TRAIL_COLS.bubbles),
      T('leaves', 'Leaves', 'time1h', TRAIL_COLS.leaves), T('stardust', 'Stardust', 'nova', TRAIL_COLS.stardust), T('rainbow', 'Rainbow', 'win', TRAIL_COLS.rainbow),
    ]) },
  ],
  wizard: [
    { key: 'hat', label: 'HAT', kind: 'hat', opts: [
      o('pointy', 'Pointy Hat', null, { rows: ['....pp......', '...pppp.....', '...pppp.....', '..pppppp....', '..pppppp....', '.PPPPPPPPPP.'] }),
      o('tall', 'Archmage Hat', 'kills100', { rows: ['.....p......', '....pp......', '....pp......', '...pppp.....', '...pppp.....', '..pppppp....', '..pppppp....', '.PPPPPPPPPP.'] }),
      o('crooked', 'Crooked Hat', 'dodge25', { rows: ['.......pp...', '......ppp...', '...pppppp...', '..pppppppp..', '..pppppppp..', '.PPPPPPPPPP.'] }),
      o('witch', 'Wide Brim', 'forage', { rows: ['....pp......', '...pppp.....', '..pppppp....', '..oooooo....', 'PPPPPPPPPPPP'] }),
      o('starry', 'Starry Hat', 'shrine', { rows: ['....pp......', '...pGpp.....', '...pppp.....', '..ppppGp....', '..pppppp....', '.PPPPPPPPPP.'] }),
      o('beanie', 'Wool Beanie', 'events', { rows: ['.....oo.....', '...pppppp...', '..pppppppp..', '..oooooooo..'] }),
      o('top', 'Magician Top Hat', 'triple', { rows: ['..pppppppp..', '..pppppppp..', '..oooooooo..', '.PPPPPPPPPP.'] }),
      o('crown', 'Crown', 'win', { rows: ['.G..G..G..G.', '.GGGGGGGGGG.', '.GRGGGGGRG..'] }),
    ] },
    { key: 'hatc', label: 'HAT COLOR', kind: 'color', opts: [
      C('purple', 'Purple', null, '#7b3fc4', '#5a2a9a'), C('blue', 'Blue', 'shrine', '#3b7bd0', '#2a58a8'),
      C('crimson', 'Crimson', 'elites', '#d03a4a', '#9a2434'), C('forest', 'Forest', 'forage', '#3fa860', '#2a7a44'),
      C('teal', 'Teal', 'camps', '#2fb8b0', '#1f8a84'), C('rose', 'Rose', 'weak50', '#f070b0', '#c04888'),
      C('midnight', 'Midnight', 'novakill', '#34304a', '#1f1c30'), C('snow', 'Snow', 'dodge150', '#f0f0fa', '#b8b8d0'),
      C('sun', 'Sunny', 'harvest', '#ffc928', '#d99a00', { acc: '#ffffff' }),
    ] },
    { key: 'robe', label: 'ROBE', kind: 'color', opts: [
      C('royal', 'Royal Blue', null, '#3b5bd0', '#2c46a8'), C('crimson', 'Crimson', 'camps', '#d03a4a', '#9a2434'),
      C('emerald', 'Emerald', 'harvest', '#2faa66', '#1f7a48'), C('amber', 'Amber', 'events', '#e8a020', '#b87a10'),
      C('frost', 'Frost', 'dodge25', '#7ec3e8', '#4a98c4'), C('plum', 'Plum', 'keep', '#8a4ac0', '#64309a'),
      C('rose', 'Rose', 'goalsW', '#f070b0', '#c04888'), C('shadow', 'Shadow', 'kills1000', '#4a4a60', '#2e2e44'),
      C('gold', 'Gold', 'win', '#ffd23a', '#d9a010'),
    ] },
    { key: 'beard', label: 'BEARD', kind: 'color', opts: [
      C('white', 'White', null, '#f4f4f4'), C('grey', 'Grey', 'kills100', '#b8b8c8'), C('brown', 'Brown', 'camps', '#7a4a22'),
      C('ginger', 'Ginger', 'forage', '#e0782a'), C('blue', 'Blue', 'shrine', '#7ec3e8'), C('green', 'Green', 'harvest', '#6fd36b'),
      C('pink', 'Pink', 'weak50', '#ff9ad0'), C('black', 'Black', 'kills1000', '#2b2230'),
    ] },
    { key: 'staff', label: 'STAFF', kind: 'staff', opts: [
      o('star', 'Star Staff', null, { head: ['.g.', 'ggg', '.g.'], gem: '#ffe36b' }),
      o('orb', 'Orb Staff', 'shards', { head: ['ggg', 'ghg', 'ggg'], gem: '#7be0ff' }),
      o('crystal', 'Crystal Staff', 'novakill', { head: ['.h.', 'ggg', 'ggg'], gem: '#c890ff' }),
      o('heart', 'Heart Staff', 'weak50', { head: ['g.g', 'ggg', '.g.'], gem: '#ff5a8a' }),
      o('flame', 'Flame Staff', 'events', { head: ['.g.', 'ggg', 'g.g'], gem: '#ff8a2a' }),
      o('moon', 'Moon Staff', 'keep', { head: ['gg.', 'g..', 'gg.'], gem: '#e8e8ff' }),
    ] },
    { key: 'skin', label: 'SKIN', kind: 'color', opts: SKINS },
    { key: 'trail', label: 'FOOTSTEPS', kind: 'trail', opts: TRAILS([
      T('sparks', 'Sparks', 'dodge25', TRAIL_COLS.sparks), T('embers', 'Embers', 'elites', TRAIL_COLS.embers), T('leaves', 'Leaves', 'harvest', TRAIL_COLS.leaves),
      T('bubbles', 'Bubbles', 'shards', TRAIL_COLS.bubbles), T('stardust', 'Stardust', 'shrine', TRAIL_COLS.stardust), T('hearts', 'Hearts', 'goalsW', TRAIL_COLS.hearts),
      T('rainbow', 'Rainbow', 'win', TRAIL_COLS.rainbow),
    ]) },
  ],
};

// ---------- achievements ----------
// val(g) >= n unlocks it. who: 'B' Builder, 'W' Wizard, 'BW' both (what they unlock is whatever lists them as its `ach` above).
const A = (id, who, name, icon, text, n, val) => ({ id, who, name, icon, text, n, val });
const st = k => g => g.stats[k] || 0;
const node = id => g => (g.tree[id] ? 1 : 0);
Players.ACH = [
  A('first_send', 'B', 'First Delivery', 'ic_portal', 'Send something through a portal', 1, st('deliveries')),
  A('packets_100', 'B', 'Packet Pusher', 'ic_bolt', 'Send 100 element packets', 100, st('packets')),
  A('packets_1500', 'B', 'Element Tycoon', 'ic_trophy', 'Send 1500 element packets', 1500, st('packets')),
  A('forge', 'B', 'Forgemaster', 'b:forge', 'Unlock the Elemental Forge', 1, node('forge')),
  A('logistics', 'B', 'Traffic Controller', 'b:splitter', 'Unlock Logistics', 1, node('logistics')),
  A('expand', 'B', 'Room to Grow', 'ic_expand', 'Add 20 Floor Tiles to the factory', 20, g => Math.max(g.stats.tiles || 0, (g.tree.expand || 0) * 8)),
  A('charge10', 'B', 'Battery Boss', 'battery', 'Fully charge 10 Batteries', 10, st('charged')),
  A('eggs25', 'B', 'Egg Factory', 'egg_zephyr', 'Send 25 Eggs to the Wizard', 25, st('eggs')),
  A('combos50', 'B', 'Combo Cook', 'steam', 'Send 50 combo spells', 50, st('combos')),
  A('nova', 'B', 'Nova Maker', 'nova', 'Craft the Elemental Nova at the Forge', 1, g => (g.stats.made || {}).nova || 0),
  A('summon', 'B', 'Summoner', 'b:altar', 'Unlock Summoning', 1, node('summon')),
  A('time1h', 'B', 'Dedicated Builder', 'ic_clock', 'Play for one hour in one save', 3600, st('time')),
  A('goalsB', 'B', 'Foreman', 'ic_wrench', 'Finish 12 Builder goals', 12, g => g.quest.B),
  A('kills100', 'W', 'Monster Masher', 'ic_skull', 'Defeat 100 monsters', 100, st('kills')),
  A('kills1000', 'W', 'Monster Slayer', 'ic_skull', 'Defeat 1000 monsters', 1000, st('kills')),
  A('dodge25', 'W', 'Nimble', 'ic_shield', 'Dodge 25 hits by rolling', 25, st('dodges')),
  A('dodge150', 'W', 'Untouchable', 'ic_shield', 'Dodge 150 hits by rolling', 150, st('dodges')),
  A('shrine', 'W', 'Shrine Keeper', 'ic_flag', 'Claim a Shrine', 1, st('shrines')),
  A('camps', 'W', 'Camp Crasher', 'ic_flag', 'Clear 3 camps or crypts', 3, st('clears')),
  A('elites', 'W', 'Elite Hunter', 'ic_crown', 'Defeat 5 Elites', 5, st('elites')),
  A('forage', 'W', 'Forager', 'ic_boot', 'Forage 20 spots', 20, st('foraged')),
  A('weak50', 'W', 'Weak Spotter', 'ic_target', 'Finish 50 monsters with a weakness hit', 50, st('weakKills')),
  A('triple', 'W', 'Triple Threat', 'meteor', 'Defeat 30 monsters with Triple spells', 30, st('k3')),
  A('novakill', 'W', 'Nova Blaster', 'nova', 'Defeat 15 monsters with the Nova', 15, st('k4')),
  A('events', 'W', 'Storm Chaser', 'ic_warn', 'Beat 3 world events', 3, st('events')),
  A('keep', 'W', 'Keep Conqueror', 'wardkey', 'Kill the Warden', 1, st('keeps')),
  A('harvest', 'W', 'Lumberjack', 'wood', 'Harvest 200 trees and rocks', 200, st('harvested')),
  A('shards', 'W', 'Shard Collector', 'shard', 'Collect 10 Aether Shards', 10, st('shards')),
  A('goalsW', 'W', 'Adventurer', 'ic_hat', 'Finish 12 Wizard goals', 12, g => g.quest.W),
  A('win', 'BW', 'Chimera Slayer', 'ic_crown', 'Beat the Primal Chimera together', 1, st('wins')),
];
Players.achById = {};
Players.ACH.forEach(a => { Players.achById[a.id] = a; });

// ---------- profile ----------
Players.defaults = role => { const l = {}; Players.CATS[role].forEach(c => { l[c.key] = c.opts[0].id; }); return l; };
Players.optOf = (role, key, id) => { const c = Players.CATS[role].find(k => k.key === key); return c.opts.find(x => x.id === id) || c.opts[0]; };
Players.has = op => !op.ach || !!Players.prof.ach[op.ach];
Players.load = function () {
  let p = null;
  try { p = JSON.parse(localStorage.getItem('wands_profile')); } catch (e) { p = null; }
  p = p && typeof p === 'object' ? p : {};
  Players.prof = { ach: p.ach || {}, seen: p.seen || {}, look: p.look || {}, roles: p.roles || {} };
  for (const role in Players.CATS) {
    const l = Players.prof.look[role] = Object.assign(Players.defaults(role), Players.prof.look[role]);
    for (const c of Players.CATS[role]) { const op = c.opts.find(x => x.id === l[c.key]); if (!op || !Players.has(op)) l[c.key] = c.opts[0].id; }   // gone or still locked: back to the first
  }
  const r = Players.prof.roles;
  Players.chips = { kb: [-1, 0, 1].includes(r.kb) ? r.kb : 0, p0: [-1, 0, 1].includes(r.p0) ? r.p0 : -1, p1: [-1, 0, 1].includes(r.p1) ? r.p1 : 1 };
};
Players.save = function () {
  try { localStorage.setItem('wands_profile', JSON.stringify({ ach: Players.prof.ach, seen: Players.prof.seen, look: Players.prof.look, roles: Players.chips })); } catch (e) { /* private mode: the profile just doesn't stick */ }
};
Players.init = function () { Players.load(); Players.applyLook(); };

// ---------- sprites from a look ----------
Players.palette = function (role, l) {
  const g = k => Players.optOf(role, k, l[k]);
  if (role === 'builder') {
    const h = g('hatc'), ov = g('outfit'), sk = g('skin');
    return { y: h.a, Y: h.b, o: h.acc || '#fff6e0', O: h.b, k: sk.a, d: '#2b2230', r: ov.b, b: ov.a, n: '#5a3a22', w: '#f4f4f4', g: '#fff27a', G: '#ffd23a', R: '#ff5a6e' };
  }
  const h = g('hatc'), rb = g('robe'), bd = g('beard'), sk = g('skin'), sf = g('staff');
  return { p: h.a, P: h.b, o: h.acc || '#ffd23a', k: sk.a, d: '#2b2230', w: bd.a, b: rb.a, B: rb.b, n: '#7a4a22', g: sf.gem, h: '#ffffff', G: '#ffd23a', R: '#ff5a6e' };
};
// the four Builder poses / the Wizard, as canvases (callers wrap them with reg() or use them straight for previews)
Players.make = function (role, l) {
  const pal = Players.palette(role, l);
  if (role === 'builder') {
    const hat = Players.optOf('builder', 'hat', l.hat).rows, pad = Array(6 - hat.length).fill(BLANK);   // every helmet sits in the same 6 rows
    const last = hat[hat.length - 1], hatC = hat.slice(0, -1).concat(['.k' + last.slice(2, 10) + 'k.']);   // arms up: hands beside the brim
    const walk = b => { const c = b.slice(); c[8] = '...bb...b...'; return c; };
    const carry = BODY_B.slice();
    carry[0] = '.r.kkkkkk.r.'; carry[1] = '.r.kdkkdk.r.'; carry[2] = '.r.kkkkkk.r.'; carry[3] = '.rr.kkkk.rr.'; carry[4] = '..rrbbbbrr..'; carry[5] = '...rbbbbr...'; carry[6] = '...bbbbbb...';
    return {
      builder: mapSprite(pad.concat(hat, BODY_B), pal), builder2: mapSprite(pad.concat(hat, walk(BODY_B)), pal),
      builderC: mapSprite(pad.concat(hatC, carry), pal), builderC2: mapSprite(pad.concat(hatC, walk(carry)), pal),
    };
  }
  const hat = Players.optOf('wizard', 'hat', l.hat).rows, head = Players.optOf('wizard', 'staff', l.staff).head;
  const body = hat.concat(BODY_W), H = body.length;
  const staff = head.concat(Array(STAFF_SHAFT).fill('.n.'));   // bottom-aligned, so a taller hat never moves the staff
  const rows = body.map((r, i) => r + (staff[i - (H - staff.length)] || '...'));
  return { wizard: mapSprite(rows, pal) };
};
Players.applyLook = function () {
  const b = Players.make('builder', Players.prof.look.builder), w = Players.make('wizard', Players.prof.look.wizard);
  for (const k in b) reg(k, b[k]);
  reg('wizard', w.wizard, 6, w.wizard.height);
};

// ---------- footstep trails ----------
Players.trailCol = function (role) {
  const l = Players.prof && Players.prof.look[role], op = l && Players.optOf(role, 'trail', l.trail);
  if (!op || !op.cols) return null;
  return op.cols[(Players.tc = (Players.tc || 0) + 1) % op.cols.length];
};

// ---------- achievements ----------
Players.unlocksOf = id => {
  const out = [];
  for (const role in Players.CATS) for (const c of Players.CATS[role]) for (const op of c.opts) if (op.ach === id) out.push({ role, cat: c, op });
  return out;
};
Players.check = function () {
  if (!G || !Players.prof) return;
  const got = [];
  for (const a of Players.ACH) if (!Players.prof.ach[a.id] && a.val(G) >= a.n) { Players.prof.ach[a.id] = Date.now(); got.push(a); }
  if (!got.length) return;
  Players.save();
  AU.sfx('chest');
  if (got.length > 3) { for (const s of ['L', 'R']) UI.toast(got.length + ' achievements unlocked! New looks wait in the character select.', s, 'ic_trophy'); return; }
  for (const a of got) {
    const sides = a.who === 'B' ? ['L'] : a.who === 'W' ? ['R'] : ['L', 'R'];
    const items = Players.unlocksOf(a.id).filter(u => u.role === (a.who === 'B' ? 'builder' : a.who === 'W' ? 'wizard' : u.role));
    const text = 'ACHIEVEMENT: ' + a.name + (items.length ? ' (new: ' + items.slice(0, 2).map(u => u.op.name).join(', ') + (items.length > 2 ? '...' : '') + ')' : '');
    for (const s of sides) UI.toast(text, s, 'ic_trophy');
  }
};

// ---------- the menu world's side of it (js/menu.js) ----------
// There is no player-select screen any more: the cosmetic options are floor plates in the living menu world (Menu.specs 'cs'), and a character stepping onto one equips it
// through Players.equipLocal. These helpers are all the plates need: the profile (above), thumbnails for the plates, and which option is on.
Players.selId = (role, catKey) => (Players.prof.look[role] || {})[catKey];
Players.equipLocal = function (role, catKey, optId) {
  const cat = Players.CATS[role].find(c => c.key === catKey), op = cat && cat.opts.find(x => x.id === optId);
  if (!op) return false;
  if (!Players.has(op)) return false;   // still locked: the plate only shows what earns it
  Players.prof.look[role][catKey] = op.id;
  if (op.ach) Players.prof.seen[role + '.' + catKey + '.' + op.id] = 1;
  Players.save();
  Players.applyLook();
  return true;
};
// a little canvas for a cosmetic option's plate (swatches and trail dots are drawn by the plate itself): a hat on top of a head, a staff head
const thumbCache = {};
Players.thumb = function (role, cat, op) {
  const l = Players.prof.look[role];
  if (cat.kind === 'hat') {
    const key = role + op.id + l.hatc + l.skin;
    return thumbCache[key] || (thumbCache[key] = mapSprite(op.rows.concat((role === 'builder' ? BODY_B : BODY_W).slice(0, 3)), Players.palette(role, Object.assign({}, l, { hat: op.id }))));
  }
  if (cat.kind === 'staff') {
    const key = 'staff' + op.id;
    return thumbCache[key] || (thumbCache[key] = mapSprite(op.head.concat(['.n.', '.n.', '.n.']), { g: op.gem, h: '#ffffff', n: '#7a4a22' }));
  }
  return null;
};
// the achievements as the Achievements plates show them: [{ icon, name, text, ok, unlocks }]
Players.achRows = function () {
  return Players.ACH.map(a => ({ icon: a.icon, name: a.name, text: a.text, ok: !!Players.prof.ach[a.id], who: a.who, unlocks: Players.unlocksOf(a.id).map(u => u.op.name).join(', ') }));
};
return Players;
})();
