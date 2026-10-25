'use strict';
// Player select + cosmetics. Before a game starts each controller picks a job (Builder / Wizard), then each job is dressed up from
// the unlocked cosmetics. Cosmetics are purely visual and are unlocked by achievements; the achievements and the chosen looks live in
// a profile in localStorage (not in a save), so they carry over to every slot.
const Players = (() => {
const Players = { prof: null, open_: false, step: 1, t: 0, ready: { builder: false, wizard: false }, goT: 0, foc: {}, achOpen: false, chips: { kb: 0, p0: -1, p1: 1 }, cb: null, checkT: 1, pads: '', navs: { p0: { k: '', t: 0 }, p1: { k: '', t: 0 } } };
// who drives what in a running game (G.ctl is a copy): pb / pw = index into IN.pad (-1 = none), kbB / kbW = the keyboard plays that job
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
Players.init = function () { Players.load(); Players.applyLook(); Players.bindDom(); };

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
  if (got.length > 3) { for (const s of ['L', 'R']) UI.toast(got.length + ' achievements unlocked! New looks wait on the player screen.', s, 'ic_trophy'); return; }
  for (const a of got) {
    const sides = a.who === 'B' ? ['L'] : a.who === 'W' ? ['R'] : ['L', 'R'];
    const items = Players.unlocksOf(a.id).filter(u => u.role === (a.who === 'B' ? 'builder' : a.who === 'W' ? 'wizard' : u.role));
    const text = 'ACHIEVEMENT: ' + a.name + (items.length ? ' (new: ' + items.slice(0, 2).map(u => u.op.name).join(', ') + (items.length > 2 ? '...' : '') + ')' : '');
    for (const s of sides) UI.toast(text, s, 'ic_trophy');
  }
};

// ---------- the screen ----------
// what each controller does, from where the chips sit (-1 = Builder side, 0 = middle, 1 = Wizard side)
Players.derive = function () {
  const ch = Players.chips;
  let pb = -1, pw = -1;
  [0, 1].forEach(i => { if (!IN.pad[i]) return; const p = ch['p' + i]; if (p < 0 && pb < 0) pb = i; if (p > 0 && pw < 0) pw = i; });
  const kbB = ch.kb < 0 || (ch.kb === 0 && pb < 0), kbW = ch.kb > 0 || (ch.kb === 0 && pw < 0);
  return { kbB, kbW, pb, pw, ok: (kbB || pb >= 0) && (kbW || pw >= 0) };
};
const $p = () => document.getElementById('players');
Players.open = function (cb) {
  if (!Players.prof) Players.load();
  Players.cb = cb; Players.step = 1; Players.ready = { builder: false, wizard: false }; Players.goT = 0; Players.achOpen = false; Players.msg = '';
  for (const r in Players.CATS) Players.foc[r] = { row: 0, col: Math.max(0, Players.CATS[r][0].opts.findIndex(x => x.id === Players.prof.look[r][Players.CATS[r][0].key])) };
  Players.pads = Players.padSig();
  Players.open_ = true;
  STATE = 'select';
  UI.show('menu', false); UI.show('players', true);
  Players.render();
  AU.sfx('menu_open');
};
Players.cancel = function () {
  if (Players.achOpen) { Players.achOpen = false; Players.render(); return; }
  Players.open_ = false; Players.cb = null;
  STATE = 'menu';
  UI.show('players', false); UI.show('menu', true);
  AU.sfx('menu_close');
};
Players.padSig = () => (IN.pad[0] ? '1' : '0') + (IN.pad[1] ? '1' : '0');
Players.next = function () {
  const d = Players.derive();
  if (!d.ok) { Players.msg = !(d.kbB || d.pb >= 0) ? 'Nobody has the Builder yet: move a controller to the left.' : 'Nobody has the Wizard yet: move a controller to the right.'; AU.sfx('error'); Players.render(); return; }
  Players.step = 2; Players.msg = '';
  AU.sfx('buy');
  Players.render();
};
Players.back = function () {
  if (Players.step === 2) {
    if (Players.ready.builder || Players.ready.wizard) Players.ready = { builder: false, wizard: false }; else Players.step = 1;
    AU.sfx('menu_close'); Players.render();
  } else Players.cancel();
};
Players.move = function (chip, d) {
  const p = Math.max(-1, Math.min(1, Players.chips[chip] + d));
  if (p === Players.chips[chip]) return;
  Players.chips[chip] = p; Players.msg = ''; AU.sfx('tab'); Players.render();
};
Players.equip = function (role, row, col, silent) {
  const cat = Players.CATS[role][row], op = cat && cat.opts[col];
  if (!op) return;
  Players.foc[role] = { row, col };
  if (!Players.has(op)) { if (!silent) AU.sfx('error'); Players.render(); return; }
  Players.prof.look[role][cat.key] = op.id;
  if (op.ach) Players.prof.seen[role + '.' + cat.key + '.' + op.id] = 1;
  Players.ready[role] = false;
  if (!silent) AU.sfx('pickup');
  Players.render();
};
// move a role's cursor by one cell; walking onto an unlocked option puts it on at once (locked ones just show how to earn them)
Players.walk = function (role, dx, dy) {
  const f = Players.foc[role], cats = Players.CATS[role], l = Players.prof.look[role];
  if (dy) {
    const row = (f.row + dy + cats.length) % cats.length;
    Players.foc[role] = { row, col: Math.max(0, cats[row].opts.findIndex(x => x.id === l[cats[row].key])) };
    AU.sfx('tab'); Players.render(); return;
  }
  const n = cats[f.row].opts.length, col = (f.col + dx + n) % n;
  Players.equip(role, f.row, col);
};
Players.toggleReady = function (role) {
  Players.ready[role] = !Players.ready[role];
  AU.sfx(Players.ready[role] ? 'buy' : 'menu_close');
  Players.goT = 0; Players.render();
};
Players.commit = function () {
  const d = Players.derive();
  Players.ctl = { kbB: d.kbB, kbW: d.kbW, pb: d.pb, pw: d.pw };
  Players.save();
  Players.applyLook();
  Players.open_ = false;
  UI.show('players', false);
  const cb = Players.cb; Players.cb = null;
  AU.sfx('victory');
  if (cb) cb();
};

// ---- markup
const isNew = (role, cat, op) => !!op.ach && Players.has(op) && !Players.prof.seen[role + '.' + cat.key + '.' + op.id];
const thumbCache = {};
function dataURL(rows, pal, k) {
  const c = mapSprite(rows, pal);
  return mk(c.width * k, c.height * k, x => { x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, c.width * k, c.height * k); }).toDataURL();
}
function thumb(role, cat, op) {
  const l = Players.prof.look[role];
  if (cat.kind === 'color') return '<i class="sw" style="background:linear-gradient(135deg,' + op.a + ' 50%,' + op.b + ' 50%)"></i>';
  if (cat.kind === 'trail') return op.cols ? '<span class="dots">' + op.cols.slice(0, 4).map(c => '<b style="background:' + c + '"></b>').join('') + '</span>' : UI.img('ic_x', 16);
  if (cat.kind === 'hat') {
    const key = role + op.id + l.hatc + l.skin;
    if (!thumbCache[key]) thumbCache[key] = dataURL(op.rows.concat((role === 'builder' ? BODY_B : BODY_W).slice(0, 3)), Players.palette(role, Object.assign({}, l, { hat: op.id })), 3);
    return '<img src="' + thumbCache[key] + '">';
  }
  const key = 'staff' + op.id;
  if (!thumbCache[key]) thumbCache[key] = dataURL(op.head.concat(['.n.', '.n.', '.n.']), { g: op.gem, h: '#ffffff', n: '#7a4a22' }, 5);
  return '<img src="' + thumbCache[key] + '">';
}
function infoText(role) {
  const f = Players.foc[role], cat = Players.CATS[role][f.row], op = cat.opts[f.col];
  if (Players.has(op)) return '<b>' + cat.label + ': ' + op.name + '</b>' + (op.ach ? '<span class="ok">Unlocked by ' + Players.achById[op.ach].name + '</span>' : '<span class="dim">Always yours</span>');
  const a = Players.achById[op.ach], v = Math.min(a.n, Math.floor(a.val(G || { stats: {}, tree: {}, quest: { B: 0, W: 0 } })));
  return '<b class="lk">' + UI.img('ic_lock', 16) + ' ' + op.name + '</b><span>Earn <em>' + a.name + '</em>: ' + a.text + (a.n > 1 && G ? ' (' + v + '/' + a.n + ')' : '') + '</span>';
}
function chipHtml(id, label, pos) {
  return '<div class="chip" data-chip="' + id + '"><button data-act="chip" data-chip="' + id + '" data-d="-1"' + (pos <= -1 ? ' disabled' : '') + '>&lt;</button>' +
    UI.img(id === 'kb' ? 'ic_mouse' : 'ic_pad', 20) + '<span>' + label + '</span>' +
    '<button data-act="chip" data-chip="' + id + '" data-d="1"' + (pos >= 1 ? ' disabled' : '') + '>&gt;</button></div>';
}
function panelHtml(role, d) {
  const cats = Players.CATS[role], l = Players.prof.look[role], f = Players.foc[role], s2 = Players.step === 2, B = role === 'builder';
  const chips = [['kb', 'KEYBOARD']].concat(IN.pad[0] ? [['p0', 'PAD 1']] : [], IN.pad[1] ? [['p1', 'PAD 2']] : []).filter(c => Math.sign(Players.chips[c[0]]) === (B ? -1 : 1));
  const rows = cats.map((cat, ri) => '<div class="pRow"><label>' + cat.label + '</label><div class="opts">' + cat.opts.map((op, ci) => {
    const cls = ['opt', l[cat.key] === op.id ? 'sel' : '', s2 && f.row === ri && f.col === ci ? 'foc' : '', Players.has(op) ? '' : 'lock', isNew(role, cat, op) ? 'new' : ''].join(' ');
    return '<button class="' + cls + '" data-act="opt" data-role="' + role + '" data-row="' + ri + '" data-col="' + ci + '" tabindex="-1">' + thumb(role, cat, op) +
      (Players.has(op) ? '' : '<u>' + UI.img('ic_lock', 12) + '</u>') + (isNew(role, cat, op) ? '<s>NEW</s>' : '') + '</button>';
  }).join('') + '</div></div>').join('');
  const kbShared = d.kbB && d.kbW;
  const hint = !s2 ? '' : B ? (d.kbB ? (kbShared ? 'WASD + E' : 'ARROWS / WASD + ENTER') + (d.pb >= 0 ? ' or PAD ' + (d.pb + 1) : '') : d.pb >= 0 ? 'PAD ' + (d.pb + 1) : '') : (d.kbW ? (kbShared ? 'ARROWS + .' : 'ARROWS / WASD + ENTER') + (d.pw >= 0 ? ' or PAD ' + (d.pw + 1) : '') : d.pw >= 0 ? 'PAD ' + (d.pw + 1) : '');
  return '<div class="pPanel px' + (Players.ready[role] ? ' rdy' : '') + '" data-role="' + role + '"><div class="pHead"><h3>' + UI.img(B ? 'ic_wrench' : 'ic_hat', 24) + (B ? 'BUILDER' : 'WIZARD') + '</h3><div class="chips">' + chips.map(c => chipHtml(c[0], c[1], Players.chips[c[0]])).join('') + '</div></div>' +
    '<div class="pBody"><div class="pLeft"><canvas class="pv" data-role="' + role + '" width="200" height="200"></canvas><div class="pKeys">' + hint + '</div></div><div class="pRows' + (s2 ? '' : ' dimmed') + '">' + rows + '</div></div>' +
    '<div class="pInfo">' + infoText(role) + '</div>' +
    (s2 ? '<button class="big' + (Players.ready[role] ? '' : ' ghost') + '" data-act="ready" data-role="' + role + '">' + (Players.ready[role] ? 'READY!' : 'READY?') + '</button>' : '') + '</div>';
}
function achHtml() {
  const done = Players.ACH.filter(a => Players.prof.ach[a.id]).length;
  const row = a => {
    const ok = !!Players.prof.ach[a.id], v = G ? Math.min(a.n, Math.floor(a.val(G))) : 0;
    const un = Players.unlocksOf(a.id).map(u => u.op.name).join(', ');
    return '<div class="aRow' + (ok ? ' ok' : '') + '">' + UI.img(a.icon, 28) + '<div><b>' + a.name + '</b><span>' + a.text + (ok ? '' : (G && a.n > 1 ? ' (' + v + '/' + a.n + ' in this save)' : '')) + '</span><small>Unlocks: ' + un + '</small></div>' +
      (ok ? UI.img('ic_check', 20) : UI.img('ic_lock', 20)) + '</div>';
  };
  const sec = (t, who) => '<h4>' + t + '</h4>' + Players.ACH.filter(a => a.who === who).map(row).join('');
  return '<div class="pAch px"><h2>ACHIEVEMENTS ' + done + '/' + Players.ACH.length + '</h2><div class="aBody">' +
    sec('BUILDER', 'B') + sec('WIZARD', 'W') + sec('BOTH', 'BW') + '</div><button class="big ghost" data-act="achClose">CLOSE</button></div>';
}
Players.render = function () {
  if (!Players.open_) return;
  const d = Players.derive(), s2 = Players.step === 2;
  const pool = [['kb', 'KEYBOARD']].concat(IN.pad[0] ? [['p0', 'PAD 1']] : [], IN.pad[1] ? [['p1', 'PAD 2']] : []).filter(c => Players.chips[c[0]] === 0);
  const lines = !s2
    ? 'STEP 1: PICK A JOB FOR EACH CONTROLLER. Move left / right, then press A / ENTER.'
    : 'STEP 2: DRESS UP. Up / down picks a row, left / right tries one on. A / ENTER = ready.';
  const nUnl = Players.ACH.filter(a => Players.prof.ach[a.id]).length;
  $p().innerHTML = '<h1>WHO IS PLAYING?</h1><div class="pStep">' + lines + '</div>' +
    '<div class="pWrap">' + panelHtml('builder', d) +
    '<div class="pPool px"><h3>' + (s2 ? 'JOBS' : 'WAITING') + '</h3>' + (s2 ? '<p>Shared keyboard: WASD plays the Builder, arrows the Wizard.</p>'
      : pool.map(c => chipHtml(c[0], c[1], 0)).join('') + '<p>' + (pool.some(c => c[0] === 'kb') ? (d.kbB && d.kbW ? 'The keyboard plays both jobs.' : d.kbB ? 'The keyboard plays the Builder.' : d.kbW ? 'The keyboard plays the Wizard.' : 'The keyboard sits this one out.') : '') + '</p>' +
        (IN.pad[0] ? '' : '<p class="dim">Press a button on a controller to bring it in.</p>')) + '</div>' +
    panelHtml('wizard', d) + '</div>' +
    '<div class="pMsg">' + (Players.msg || (d.ok ? '' : 'Someone has to take each job.')) + '</div>' +
    '<div class="pBar"><button class="big ghost" data-act="back">BACK</button><button class="big ghost" data-act="ach">' + UI.img('ic_trophy', 20) + 'ACHIEVEMENTS ' + nUnl + '/' + Players.ACH.length + '</button>' +
    (s2 ? '' : '<button class="big" data-act="next"' + (d.ok ? '' : ' disabled') + '>NEXT</button>') + '</div>' + (Players.achOpen ? achHtml() : '');
};
Players.bindDom = function () {
  const root = $p();
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !Players.open_) return;
    const a = b.dataset.act;
    if (a === 'chip') Players.move(b.dataset.chip, +b.dataset.d);
    else if (a === 'opt') Players.equip(b.dataset.role, +b.dataset.row, +b.dataset.col);
    else if (a === 'ready') Players.toggleReady(b.dataset.role);
    else if (a === 'next') Players.next();
    else if (a === 'back') Players.back();
    else if (a === 'ach') { Players.achOpen = true; AU.sfx('menu_open'); Players.render(); }
    else if (a === 'achClose') Players.cancel();
  });
  root.addEventListener('mouseover', e => {   // hovering an option shows what it is (and how to earn it) without putting it on
    const b = e.target.closest('[data-act="opt"]');
    if (!b || !Players.open_) return;
    const f = Players.foc[b.dataset.role], row = +b.dataset.row, col = +b.dataset.col;
    if (f.row === row && f.col === col) return;
    Players.foc[b.dataset.role] = { row, col };
    const el = root.querySelector('.pPanel[data-role="' + b.dataset.role + '"] .pInfo');
    if (el) el.innerHTML = infoText(b.dataset.role);
    root.querySelectorAll('.pPanel[data-role="' + b.dataset.role + '"] .opt.foc').forEach(x => x.classList.remove('foc'));
    if (Players.step === 2) b.classList.add('foc');
  });
};

// ---- input + previews (called every frame while the screen is up)
const dirOf = (p, n, dt) => {   // a pad stick / d-pad turned into single steps with key repeat
  const ax = Math.abs(p.ix) > Math.abs(p.iy), dx = ax && Math.abs(p.ix) > 0.5 ? Math.sign(p.ix) : 0, dy = !ax && Math.abs(p.iy) > 0.5 ? Math.sign(p.iy) : 0, k = dx + ',' + dy;
  if (!dx && !dy) { n.k = ''; n.t = 0; return null; }
  if (k !== n.k) { n.k = k; n.t = 0.35; return [dx, dy]; }
  if ((n.t -= dt) <= 0) { n.t = 0.12; return [dx, dy]; }
  return null;
};
const kh = (...codes) => codes.some(c => IN.hit(c));
Players.tick = function (dt) {
  if (!Players.open_) return;
  Players.t += dt;
  const sig = Players.padSig();
  if (sig !== Players.pads) { Players.pads = sig; Players.ready = { builder: false, wizard: false }; Players.render(); }
  const p = [IN.pad[0], IN.pad[1]], pd = [p[0] && dirOf(p[0], Players.navs.p0, dt), p[1] && dirOf(p[1], Players.navs.p1, dt)];
  if (!p[0]) { Players.navs.p0.k = ''; } if (!p[1]) { Players.navs.p1.k = ''; }
  const esc = kh('Escape', 'Backspace') || (p[0] && p[0].b) || (p[1] && p[1].b);
  if (Players.achOpen) { if (esc || kh('Enter')) Players.cancel(); }
  else if (Players.step === 1) {
    if (kh('ArrowLeft', 'KeyA')) Players.move('kb', -1);
    if (kh('ArrowRight', 'KeyD')) Players.move('kb', 1);
    [0, 1].forEach(i => { if (pd[i] && pd[i][0]) Players.move('p' + i, pd[i][0]); });
    if (kh('Enter', 'Space', 'KeyE', 'Period') || (p[0] && p[0].a) || (p[1] && p[1].a)) Players.next();
    else if (esc) Players.back();
  } else {
    const d = Players.derive(), shared = d.kbB && d.kbW;
    const act = (role, dir, ok) => { if (dir && dir[0]) Players.walk(role, dir[0], 0); else if (dir && dir[1]) Players.walk(role, 0, dir[1]); if (ok) Players.toggleReady(role); };
    const kd = (l, r, u, dn) => { const dx = (kh(...r) ? 1 : 0) - (kh(...l) ? 1 : 0), dy = (kh(...dn) ? 1 : 0) - (kh(...u) ? 1 : 0); return dx || dy ? [dx, dx ? 0 : dy] : null; };
    const WASD = [['KeyA'], ['KeyD'], ['KeyW'], ['KeyS']], ARR = [['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown']], ALL = WASD.map((k, i) => k.concat(ARR[i]));
    if (shared) { act('builder', kd(...WASD), kh('KeyE')); act('wizard', kd(...ARR), kh('Period', 'Enter')); }
    else if (d.kbB) act('builder', kd(...ALL), kh('Enter', 'Space', 'KeyE', 'Period'));
    else if (d.kbW) act('wizard', kd(...ALL), kh('Enter', 'Space', 'KeyE', 'Period'));
    if (d.pb >= 0) act('builder', pd[d.pb], p[d.pb].a);
    if (d.pw >= 0) act('wizard', pd[d.pw], p[d.pw].a);
    if (esc) Players.back();
    if (Players.ready.builder && Players.ready.wizard) { Players.goT += dt; if (Players.goT > 0.7) { Players.commit(); return; } } else Players.goT = 0;
  }
  Players.drawPreviews(dt);
};

// a looping walk-and-idle demo of each job's current look, with its footstep trail
Players.pv = { builder: { parts: [], tp: 0 }, wizard: { parts: [], tp: 0 } };
Players.drawPreviews = function (dt) {
  const root = $p();
  if (!root) return;
  root.querySelectorAll('canvas.pv').forEach(cv => {
    const role = cv.dataset.role, x = cv.getContext('2d'), st = Players.pv[role], l = Players.prof.look[role], key = JSON.stringify(l);
    if (st.key !== key) { st.key = key; st.sp = Players.make(role, l); }
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, 200, 200);
    x.fillStyle = '#1a0f28'; x.fillRect(0, 0, 200, 200);
    x.fillStyle = '#4a8a3a'; x.fillRect(0, 150, 200, 50);
    x.fillStyle = '#5ab84a'; x.fillRect(0, 150, 200, 6);
    const walking = Math.floor(Players.t / 2.4) % 2 === 1, S = 8, step = Math.sin(Players.t * 13) > 0;
    const spr = role === 'builder' ? st.sp[walking ? (step ? 'builder2' : 'builder') : (Math.floor(Players.t / 1.2) % 4 === 3 ? 'builderC' : 'builder')] : st.sp.wizard;
    const bob = walking ? (Math.abs(Math.sin(Players.t * 13)) > 0.5 ? 8 : 0) : (Math.sin(Players.t * 3) > 0.6 ? 8 : 0), fx = walking ? Math.sin(Players.t * 2.6) * 22 : 0;
    const w = spr.width * S, h = spr.height * S, cx = 100 + fx - (role === 'wizard' ? 0 : 0);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(cx - 40, 150, 80, 8);
    x.save(); x.translate(cx, 156 - bob);
    const flip = role === 'wizard' ? 1 : 0;
    if (flip) x.scale(-1, 1);
    x.drawImage(spr, -(role === 'wizard' ? 6 : spr.width / 2) * S, -h, w, h);
    x.restore();
    // trail
    const op = Players.optOf(role, 'trail', l.trail);
    if (walking && op.cols && (st.tp -= dt) <= 0) { st.tp = 0.06; st.parts.push({ x: cx - 6 + Math.random() * 12, y: 154, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 50, t: 0.7, col: op.cols[(Players.t * 20 | 0) % op.cols.length] }); }
    for (let i = st.parts.length - 1; i >= 0; i--) {
      const q = st.parts[i]; q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 90 * dt;
      if (q.t <= 0) { st.parts.splice(i, 1); continue; }
      x.globalAlpha = Math.min(1, q.t * 2); x.fillStyle = q.col; x.fillRect(Math.round(q.x / 4) * 4, Math.round(q.y / 4) * 4, 8, 8);
    }
    x.globalAlpha = 1;
  });
};
return Players;
})();
