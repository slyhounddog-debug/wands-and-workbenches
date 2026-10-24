'use strict';
// The Collection Book: a reference for every spell and every creature (they left the skill tree: production is their only gate).
// Two pages. Each entry shows what the tree's hover card used to (name, icon, description, recipe / production, stats) with a looping demo:
// SPV for spells (spellpreview.js), CPV for creatures (creaturepreview.js). It opens over the paused game from the button beside the
// skill-tree button (or C), or from the pause menu, and nothing runs while it is closed.
const Book = { isOpen: false, page: 'spells', sel: { spells: 'gust', creatures: 'zephyr' }, from: 'play', navT: 0 };
(function () {
  const SPELL_ORDER = ['gust', 'fireball', 'spray', 'boulder', 'flamethrower', 'tempest', 'steam', 'sandstorm', 'magma', 'mud', 'meteor', 'thunder', 'blizzard', 'geyser', 'nova'];
  const CREATURE_ORDER = Object.keys(CFG.creatures);
  const BASIC_EL = { gust: 'air', fireball: 'fire', spray: 'water', boulder: 'earth' };
  const spellIcon = id => BASIC_EL[id] || id;
  const spellEls = id => SPELL_EL[id] || [];
  const klass = n => (n <= 1 ? 'BASIC' : n === 2 ? 'PAIR' : n === 3 ? 'TRIPLE' : 'ALL FOUR');
  const pct = v => Math.round(v * 100) + '%';
  const els = list => list.map(k => UI.img(k, 16)).join('');
  const row = (a, b) => '<div class="bkr"><span>' + a + '</span><em>' + b + '</em></div>';

  // numbers a spell shows, built from CFG.spells so they never drift from WZ.cast
  const BASIC_DMG = {
    gust: s => s.dmg + ' dmg, knocks foes back ' + s.push + ', ' + s.r + ' tile burst; chops trees and rocks',
    fireball: s => s.dmg + ' dmg + ' + s.splash + ' splash in ' + s.sr + ' tiles',
    spray: s => s.n + ' droplets x ' + s.dmg + ' dmg, -' + pct(s.slow) + ' speed for ' + s.slowT + 's, heals ' + s.heal,
    boulder: s => s.dmg + ' dmg + ' + s.splash + ' splash in ' + s.sr + ' tiles',
  };
  function spellRows(id) {
    const S = CFG.spells[id], r = CFG.recipes[id], n = spellEls(id).length, rows = [];
    rows.push(row('Class', klass(n) + ' ' + els(spellEls(id))));
    if (r) {
      rows.push(row('Forge recipe', UI.recipeHtml(id)), row('Craft', r.time + 's at the Forge, ' + r.power + ' power'));
      if (r.parents) rows.push(row('Needs made first', r.parents.map(p => '<span class="bkp ' + (((G.stats.made || {})[p] || 0) > 0 ? 'ok' : '') + '">' + UI.img(p, 16) + (((G.stats.made || {})[p] || 0) > 0 ? UI.img('ic_check', 12) : UI.img('ic_lock', 12)) + '</span>').join('')));
      else rows.push(row('Gate', 'just the packets: fuse ' + els(spellEls(id)) + ' at a Forge'));
    } else rows.push(row('Production', 'send one ' + UI.img(BASIC_EL[id], 16) + ' packet through the Spell Portal: it casts on arrival'));
    rows.push(row('Damage', (BASIC_DMG[id] || SPELL_DMG[id])(S)));
    rows.push(row('Drop-in', S.drop + 's warning over the Wizard before it lands'));
    if (S.r && !BASIC_DMG[id]) rows.push(row('Radius', S.r + ' tiles'));
    if (S.range) rows.push(row('Reach', S.range + ' tiles'));
    if (S.n && !BASIC_DMG[id]) rows.push(row('Projectiles / targets', '' + S.n));
    if (S.t) rows.push(row('Lasts', S.t + 's'));
    if (S.slow && !BASIC_DMG[id]) rows.push(row('Slows', '-' + pct(S.slow) + ' speed' + (S.slowT ? ' for ' + S.slowT + 's' : '')));
    rows.push(row('Weakness', 'x2 on a weak foe, x0.5 on a resistant one (x1.6 / x0.4 on the Chimera)'));
    rows.push(row('Banked now', '' + (G.bank[id] || 0)));
    return rows.join('');
  }
  function creatureRows(id) {
    const c = CFG.creatures[id], n = c.order.length, rec = 'egg_' + id, rows = [];
    rows.push(row('Class', klass(n) + ' ' + els(c.order)));
    rows.push(row('Weak to / resists', UI.img(c.weak, 16) + ' / ' + UI.img(c.resist, 16)));
    rows.push(row('Egg recipe', UI.recipeHtml(rec)), row('Hatch', (c.n || 1) + ' creature' + ((c.n || 1) > 1 ? 's' : '') + ' per Egg, ' + c.time + 's at a Creature Spawner, ' + c.power + ' power'));
    rows.push(row('Health', '' + c.hp), row('Touch damage', '' + c.dmg), row('Speed', c.speed + ' tiles/s' + (c.fly ? ', flies' : '')));
    rows.push(row('Gems', (c.gem[0] ? c.gem[0] + ' guaranteed + ' : '') + pct(c.gem[1]) + ' chance of ' + (c.gem[0] ? 'one more' : 'one')));
    rows.push(row('Variants', pct(CFG.crafted.eliteChance) + ' elite (x' + CFG.crafted.eliteHp + ' HP, x' + CFG.crafted.eliteDmg + ' damage), ' + pct(CFG.crafted.mutChance) + ' one mutation, HP / speed / damage +-' + pct(CFG.crafted.jitter)));
    rows.push(row('Drops', pct(CFG.crafted.recycle) + ' chance of a ' + UI.img(c.order[0], 16) + ' packet that rides home to the Stockpile'));
    return rows.join('');
  }

  // has the player made / met it yet? (the entry stays fully readable either way: unseen ones are just greyed out)
  const st = () => G.stats;
  const seenSpell = id => ((st().made || {})[id] || 0) > 0 || ((st().sent || {})[id] || 0) > 0 || (!!BASIC_EL[id] && ((st().sent || {})[BASIC_EL[id]] || 0) > 0);
  const seenCreature = id => ((st().met || {})[id] || 0) > 0 || ((st().sent || {})['egg_' + id] || 0) > 0;
  const seen = (pg, id) => (pg === 'spells' ? seenSpell(id) : seenCreature(id));

  // The shell (header, tabs, list, detail) is built once per open; picking an entry only swaps the text, the stats and the demo, so nothing
  // jumps and the list keeps its place. Both pages share one layout: the list tiles, the header, the demo box (same size) and the stats column.
  let ref = null;
  Book.build = function () {
    const el = $('book');
    el.innerHTML = '<div class="bookPanel px"><div class="treeHead"><h2>' + UI.img('ic_book', 32) + 'COLLECTION BOOK</h2><div class="tabs bkTabs">' +
      '<button class="tab" data-p="spells">SPELLS</button><button class="tab" data-p="creatures">CREATURES</button></div><div class="bkCount"></div><button class="x" data-close="1">' + UI.img('ic_x', 16) + '</button></div>' +
      '<div class="bookBody"><div class="bookList"></div><div class="bookDetail"><div class="tth bkh"></div>' +
      '<div class="bkLeft"><p class="bkDesc"></p><div class="bkDemoBox"><canvas class="bkDemo"></canvas></div><div class="spvc"></div></div><div class="bkRows"></div></div></div>' +
      '<p class="hint"><kbd>C</kbd> / Esc closes. <kbd>W</kbd><kbd>S</kbd> or <kbd>UP</kbd><kbd>DOWN</kbd> pick an entry, <kbd>A</kbd><kbd>D</kbd> flip the page' + (IN.padList.length ? ' <kbd>STICK</kbd> pick <kbd>LB</kbd><kbd>RB</kbd> page <kbd>B</kbd> close' : '') + '. Greyed entries are ones you have not made or met yet: you can still read everything. The game waits while the book is open.</p></div>';
    const q = c => el.querySelector(c);
    ref = { el, list: q('.bookList'), head: q('.bkh'), desc: q('.bkDesc'), cv: q('canvas.bkDemo'), cap: q('.spvc'), rows: q('.bkRows'), detail: q('.bookDetail'), count: q('.bkCount'), page: null };
    q('[data-close]').onclick = () => Book.close();
    el.querySelectorAll('.tab').forEach(bt => { bt.onclick = () => Book.setPage(bt.dataset.p); });
    el.onmousedown = e => { if (e.target === el) Book.close(); };
  };
  Book.fillList = function () {   // the tiles of the current page (once per page flip)
    const pg = Book.page, sp = pg === 'spells', ids = sp ? SPELL_ORDER : CREATURE_ORDER;
    ref.list.innerHTML = ids.map(i => {
      const nm = sp ? SPELLS[i] : CFG.creatures[i].name, icon = sp ? spellIcon(i) : i;
      return '<div class="bkItem" data-id="' + i + '">' + UI.img(icon, 32) + '<b>' + nm + '</b><u></u></div>';
    }).join('');
    ref.list.querySelectorAll('.bkItem').forEach(b => { b.onclick = () => Book.pick(b.dataset.id); });
    ref.list.querySelectorAll('.bkItem').forEach(b => { const ok = seen(pg, b.dataset.id); b.classList.toggle('unseen', !ok); b.querySelector('u').textContent = ok ? '' : '?'; });
    ref.el.querySelectorAll('.tab').forEach(bt => bt.classList.toggle('on', bt.dataset.p === pg));
    const n = ids.filter(i => seen(pg, i)).length;
    ref.count.textContent = (sp ? 'MADE ' : 'MET ') + n + ' / ' + ids.length;
  };
  Book.fillDetail = function () {   // the selected entry: text, stats and demo, swapped in place
    const pg = Book.page, sp = pg === 'spells', id = Book.sel[pg], ok = seen(pg, id);
    ref.list.querySelectorAll('.bkItem').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const nm = sp ? SPELLS[id] : CFG.creatures[id].name, desc = sp ? SPELL_INFO[id].desc : CFG.creatures[id].note;
    const n = sp ? spellEls(id).length : CFG.creatures[id].order.length;
    ref.head.innerHTML = UI.img(sp ? spellIcon(id) : id, 48) + '<div><b>' + nm + '</b><small>' + klass(n) + (sp ? ' SPELL' : ' CREATURE') + '</small></div>' +
      '<span class="bkSt' + (ok ? ' on' : '') + '">' + (ok ? UI.img('ic_check', 12) + (sp ? 'MADE' : 'MET') : UI.img('ic_lock', 12) + (sp ? 'NOT MADE YET' : 'NOT MET YET')) + '</span>';
    ref.desc.textContent = desc;
    ref.cap.textContent = sp ? SPV.caption(id) : CPV.caption(id);
    ref.rows.innerHTML = sp ? spellRows(id) : creatureRows(id);
    ref.detail.classList.toggle('unseen', !ok);
    if (ref.page !== pg) { ref.page = pg; ref.cv.width = sp ? 186 : CPV.W; ref.cv.height = sp ? 100 : CPV.H; }   // both fill the same box on screen
    SPV.stop(); CPV.stop();
    (sp ? SPV : CPV).mount(ref.cv, id);
    ref.list.querySelector('.bkItem.on').scrollIntoView({ block: 'nearest' });
  };
  Book.render = function () { Book.build(); Book.fillList(); Book.fillDetail(); };
  Book.setPage = function (p) { if (p === Book.page) return; Book.page = p; AU.sfx('tab'); Book.fillList(); Book.fillDetail(); };
  Book.pick = function (id) { if (id === Book.sel[Book.page]) return; Book.sel[Book.page] = id; AU.sfx('blip'); Book.fillDetail(); };
  Book.step = function (d) {
    const ids = Book.page === 'spells' ? SPELL_ORDER : CREATURE_ORDER, i = ids.indexOf(Book.sel[Book.page]);
    Book.pick(ids[(i + d + ids.length) % ids.length]);
  };
  // open over the (paused) game: from play it pauses the game itself; from the pause menu it hides the menu and brings it back on close
  Book.open = function (fromPause) {
    if (Book.isOpen || !G) return;
    Book.from = fromPause || G.paused ? 'pause' : 'play';
    if (!G.paused) Main.pause(true);
    UI.show('pause', false);
    Book.isOpen = true; UI.show('book', true); Book.render(); AU.sfx('menu_open');
  };
  Book.close = function (quiet) {
    if (!Book.isOpen) return;
    SPV.stop(); CPV.stop();
    Book.isOpen = false; UI.show('book', false);
    if (quiet) return;
    AU.sfx('menu_close');
    if (Book.from === 'pause') UI.show('pause', true); else Main.pause(false);
  };
  // called every frame while the game is up: keys / pad for the open book
  Book.tick = function (dt) {
    if (!Book.isOpen) return;
    const p0 = IN.pad[0], p1 = IN.pad[1], pad = (f) => (p0 && p0[f]) || (p1 && p1[f]);
    if (IN.hit('Escape') || IN.hit('KeyC') || pad('b') || pad('back')) {
      Book.close();
      IN.pressed.delete('Escape'); IN.pressed.delete('KeyC');   // the same press must not also pause (Esc) or reopen (C) in this frame's controls
      for (const q of [p0, p1]) if (q) { q.b = false; q.back = false; }
      return;
    }
    if (IN.hit('ArrowLeft') || IN.hit('KeyA') || pad('lb')) Book.setPage('spells');
    if (IN.hit('ArrowRight') || IN.hit('KeyD') || pad('rb')) Book.setPage('creatures');
    if (IN.hit('ArrowUp') || IN.hit('KeyW')) Book.step(-1);
    if (IN.hit('ArrowDown') || IN.hit('KeyS')) Book.step(1);
    const iy = (p0 && p0.iy) || (p1 && p1.iy) || 0;   // the stick: one step per push, then a repeat
    if (Math.abs(iy) > 0.6) {
      if (!Book.navHeld) { Book.navHeld = true; Book.navT = 0.35; Book.step(iy > 0 ? 1 : -1); }
      else if ((Book.navT -= dt) <= 0) { Book.navT = 0.15; Book.step(iy > 0 ? 1 : -1); }
    } else Book.navHeld = false;
  };
})();
