'use strict';
// The Collection Book: a reference for every spell and every creature (they left the skill tree: production is their only gate).
// Two pages. Each entry shows what the tree's hover card used to (name, icon, description, recipe / production, stats) with a looping demo:
// SPV for spells (spellpreview.js), CPV for creatures (creaturepreview.js). It opens over the paused game from the button beside the
// skill-tree button (or C), or from the pause menu, and nothing runs while it is closed.
const PAGES = ['spells', 'creatures', 'wardrobe'];
const Book = { isOpen: false, page: 'spells', sel: { spells: 'gust', creatures: 'zephyr', wardrobe: 'tide' }, from: 'play', navT: 0 };
(function () {
  const SPELL_ORDER = ['gust', 'fireball', 'spray', 'boulder', 'flamethrower', 'tempest', 'steam', 'sandstorm', 'magma', 'mud', 'meteor', 'thunder', 'blizzard', 'geyser', 'nova'];
  // the Creatures page lists every enemy type: the crafted creatures, then the wild foes, the Warden and the Chimera (each with its drop table)
  const WILD_ORDER = ['slime', 'shroom', 'sprite', 'imp', 'lurker', 'wisp', 'golem'];
  const CREATURE_ORDER = Object.keys(CFG.creatures).concat(WILD_ORDER, ['warden', 'boss']);
  const kindOf = id => (CFG.creatures[id] ? 'crafted' : id === 'warden' || id === 'boss' ? 'boss' : 'wild');
  const WILD_NOTE = {
    slime: 'Wanders in from anywhere. Slow and weak: a gem now and then.', shroom: 'Anywhere in the wilds. Slow, but tougher than a slime.', sprite: 'Anywhere in the wilds. Fast and fragile.',
    imp: 'Lives on sand and dirt. Weak to Water, resists Fire. Its element is Fire.', lurker: 'Lives in the bogs. Weak to Fire, resists Water. Its element is Water.',
    wisp: 'Drifts over the far meadows and flower fields. Weak to Earth, resists Air. Its element is Air.', golem: 'Walks the dark woods far from the start. Weak to Air, resists Earth. Its element is Earth.',
    warden: 'Guards a Stronghold: an elite with slams and orb volleys. It wakes only once its keep\'s Ward Key has been sent in through the portal.',
    boss: 'The Primal Chimera, called out of the Summoning Altar once it is lit and every Stronghold is claimed. Only its current weakness hurts it, and the weakness changes every quarter of its health.',
  };
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
  function wildRows(id) {   // wild foes, the Warden and the Chimera: no Egg recipe, just the numbers
    const c = CFG.enemies[id], rows = [];
    if (c.weak) rows.push(row('Weak to / resists', UI.img(c.weak, 16) + (c.resist ? ' / ' + UI.img(c.resist, 16) : '')));
    rows.push(row('Health', '' + c.hp + (kindOf(id) === 'wild' ? ' (wild ones carry ' + pct(CFG.world.wildHp) + ' of it, and grow tougher the longer a run lasts)' : '')));
    rows.push(row('Touch damage', '' + c.dmg), row('Speed', c.speed + ' tiles/s'));
    rows.push(row('Gems', c.gem[0] ? c.gem[0] + (c.gem[1] ? ' guaranteed + ' + pct(c.gem[1]) + ' chance of one more' : ' guaranteed') : pct(c.gem[1]) + ' chance of one (wild foes pay ' + pct(CFG.world.wildGem) + ' of that)'));
    if (id === 'warden') rows.push(row('Slams / orbs', 'a telegraphed slam every ' + CFG.strong.warden.slamEvery + 's, a ring of ' + CFG.strong.warden.volleyN + ' orbs every ' + CFG.strong.warden.volleyEvery + 's'));
    if (id === 'boss') rows.push(row('Phases', 'four, one weakness each; it summons its brood, slams and fires orb rings'));
    return rows.join('');
  }
  // the Drops block: normal drops, elite drops and the garments the Cores it drops go into, all read off the same tables the kills use (WZ.dropInfo, CFG)
  function dropsHtml(id) {
    const I = WZ.dropInfo(id), D = CFG.enemies[id], A = G.aug, E = CFG.elite, C = CFG.cores, kind = kindOf(id);
    const line = (ic, text, state) => '<div class="bkd">' + ic + '<span>' + text + '</span>' + (state || '') + '</div>';
    const have = (ok, yes, no) => '<b class="' + (ok ? 'yes' : 'no') + '">' + (ok ? UI.img('ic_check', 12) + yes : no) + '</b>';
    const eliteShard = ' + a Shard (a bonus one ' + pct(E.shardBonus) + ' of the time)';
    const coreIcons = els => els.map(e => UI.img('core_' + e, 16)).join('');
    let s = '<div class="bkdc"><h4>NORMAL DROPS</h4>';
    if (id === 'boss') s += line(UI.img('ic_xp', 16), D.gem[0] + ' XP gems') + line(UI.img('shard', 16), CFG.boss.shards + ' Aether Shards') + line(coreIcons(ELEMS), C.boss + ' of every Core');
    else if (id === 'warden') s += line(UI.img('shard', 16), 'keep claimed: ' + CFG.strong.shards + ' Shards, ' + CFG.strong.gems + ' gems, a Warden Core (once per keep)') + line(UI.img('core_earth', 16), C.warden + ' Cores of the keep\'s element') + line(UI.img('ic_crown', 16), 'first Warden ever: the glow-up and the held-spell slot');
    else {
      s += line(UI.img('ic_xp', 16), (D.gem[0] ? D.gem[0] + ' XP gem' + (D.gem[0] > 1 ? 's' : '') + (D.gem[1] ? ' + ' + pct(D.gem[1]) + ' for one more' : '') : pct(D.gem[1]) + ' chance of an XP gem'));
      if (I.els.length) s += line(coreIcons(I.els), pct(I.core) + ' chance of a ' + I.els.map(e => CORE_NAME[e]).join(' or ') + ' (rides home to the Stockpile)');
      else s += line(UI.img('ic_x', 16), 'no element: no Cores');
      if (kind === 'crafted') s += line(UI.img(CFG.creatures[id].order[0], 16), pct(CFG.crafted.recycle) + ' chance of a ' + ELEM_WORD[CFG.creatures[id].order[0]] + ' packet (rides home)');
    }
    s += '</div>';
    if (id !== 'boss') {
      s += '<div class="bkdc"><h4>ELITE DROPS</h4>';
      if (id === 'warden') s += line(UI.img('ic_crown', 16), 'an elite: ' + E.gems + ' gems' + eliteShard);
      else {
        s += line(UI.img('ic_xp', 16), E.gems + ' XP gems' + (kind === 'crafted' && !CFG.crafted.eliteShards ? '' : eliteShard));
        if (I.els.length) {
          s += line(coreIcons(I.els), 'always ' + (C.elite[0] === C.elite[1] ? C.elite[0] : C.elite[0] + '-' + C.elite[1]) + ' Core' + (C.elite[1] > 1 ? 's' : '') + (I.els.length > 1 ? ' of each element' : ''));
        } else s += line(UI.img('ic_x', 16), 'no element: no Cores');
      }
      s += '</div>';
    }
    s += '<div class="bkdc"><h4>CORES GO INTO</h4>';
    s += I.els.map(e => line(UI.img('key_' + e, 16), KEY_NAME(e) + ': ' + CFG.keyCost.cores + ' ' + CORE_NAME[e] + ' + Iron + Shard (Armory)', have(A.key[e], 'DOOR OPEN', 'NOT YET'))).join('');
    s += I.els.length ? line(coreIcons(I.els), 'a Shrine of any OTHER element takes one') : '';
    s += I.garments.length ? I.garments.map(a => line(UI.img('aug_' + a, 16), AUGS[a].name + ': ' + Object.keys(AUGS[a].make.in).filter(isCoreKind).map(k => AUGS[a].make.in[k] + ' ' + CORE_NAME[k.slice(5)]).join(' + '), have(FA.augMade(a), 'MADE', 'NOT YET'))).join('') : I.els.length ? '' : line(UI.img('ic_x', 16), 'nothing: it drops no Cores');
    return s + '</div>';
  }
  // ---- the Wardrobe page: what each garment does, what it is made from and where those Cores come from (the Builder forges them, the Wizard walks onto them) ----
  const GATE_TEXT = { water: 'an island in the middle of a lake', fire: 'a field of scorched ground', earth: 'a ring of cracked rock', air: 'a chasm with a broken bridge' };
  const USES = { bog: 'Pass the vine tangles knotted over the bogs; no more slow walking in bog.', phoenix: 'A second life: the Feather recharges while you play.',
    static: 'Takes the sting out of being swarmed: every hit that lands throws the attackers back.', kiln: 'Buried caches glint through the grass; edge glints point at landmarks you have not claimed.' };
  const useText = id => (AUGS[id].gate ? 'Opens the way to the ' + ELEM_WORD[AUGS[id].gate] + ' Stronghold: ' + GATE_TEXT[AUGS[id].gate] + '. Works anywhere else in the wilds too.' : USES[id]);
  const augState = id => (G.aug.worn[AUGS[id].slot] === id ? 'WORN' : G.fac.shelf.indexOf(id) >= 0 ? 'ON THE SHELF' : FA.augMade(id) ? 'MADE' : '');
  function garmentRows(id) {
    const a = AUGS[id], R = CFG.recipes['aug_' + id];
    return [row('Slot', a.slot.toUpperCase()), row('What it does', a.verb), row('Uses', useText(id)),
      row('Recipe', UI.recipeHtml('aug_' + id)), row('Forged', 'at the Armory, ' + R.time + 's, ' + R.power + ' power. Throw the Cores, Iron and Shard in, press E to pick the garment'),
      row('Worn', 'send it through the Spell Portal: it drops into the wilds and he puts it on by walking onto it. What it replaces flies to the Wardrobe Shelf by the portal')].join('');
  }
  function garmentDrops(id) {   // for each kind of Core in the recipe: who drops it, and how often
    const C = CFG.cores, make = AUGS[id].make.in, nm = c => CFG.creatures[c].name;
    const line = (ic, text) => '<div class="bkd">' + ic + '<span>' + text + '</span></div>';
    return Object.keys(make).filter(isCoreKind).map(k => {
      const el = k.slice(5), crafted = Object.keys(CFG.creatures).filter(c => CFG.creatures[c].order.indexOf(el) >= 0), by = n => crafted.filter(c => CFG.creatures[c].order.length === n);
      const wild = Object.keys(BIOME_EL).filter(t => BIOME_EL[t] === el).map(t => CFG.enemies[t].name);
      let h = '<div class="bkdc"><h4>' + make[k] + ' ' + CORE_NAME[el].toUpperCase() + '</h4>';
      if (wild.length) h += line(UI.img(Object.keys(BIOME_EL).find(t => BIOME_EL[t] === el), 16), wild.join(', ') + ' (wild): ' + pct(C.wild));
      if (by(1).length) h += line(UI.img(by(1)[0], 16), by(1).map(nm).join(', ') + ': ' + pct(C.basic));
      if (by(2).length) h += line(UI.img(by(2)[0], 16), by(2).map(nm).join(', ') + ': ' + pct(C.pair));
      if (by(3).length) h += line(UI.img(by(3)[0], 16), by(3).map(nm).join(', ') + ': ' + pct(C.triple));
      return h + line(UI.img('ic_crown', 16), 'any elite of it: ' + (C.elite[0] === C.elite[1] ? C.elite[0] : C.elite[0] + '-' + C.elite[1]) + ' for sure') + '</div>';
    }).join('');
  }
  function creatureRows(id) {
    const c = CFG.creatures[id], n = c.order.length, rec = 'egg_' + id, rows = [];
    rows.push(row('Class', klass(n) + ' ' + els(c.order)));
    rows.push(row('Weak to / resists', UI.img(c.weak, 16) + ' / ' + UI.img(c.resist, 16)));
    rows.push(row('Egg recipe', UI.recipeHtml(rec)), row('Hatch', (c.n || 1) + ' creature' + ((c.n || 1) > 1 ? 's' : '') + ' per Egg, ' + c.time + 's at a Creature Spawner, ' + c.power + ' power'));
    rows.push(row('Health', '' + c.hp), row('Touch damage', '' + c.dmg), row('Speed', c.speed + ' tiles/s' + (c.fly ? ', flies' : '')));
    rows.push(row('Gems', (c.gem[0] ? c.gem[0] + ' guaranteed + ' : '') + pct(c.gem[1]) + ' chance of ' + (c.gem[0] ? 'one more' : 'one')));
    rows.push(row('Variants', pct(CFG.crafted.eliteChance) + ' elite (x' + CFG.crafted.eliteHp + ' HP, x' + CFG.crafted.eliteDmg + ' damage), ' + pct(CFG.crafted.mutChance) + ' one mutation, HP / speed / damage +-' + pct(CFG.crafted.jitter)));
    return rows.join('');
  }

  // has the player made / met it yet? (the entry stays fully readable either way: unseen ones are just greyed out)
  const st = () => G.stats;
  const seenSpell = id => ((st().made || {})[id] || 0) > 0 || ((st().sent || {})[id] || 0) > 0 || (!!BASIC_EL[id] && ((st().sent || {})[BASIC_EL[id]] || 0) > 0);
  const seenCreature = id => ((st().met || {})[id] || 0) > 0 || ((st().sent || {})['egg_' + id] || 0) > 0;
  const seen = (pg, id) => (pg === 'spells' ? seenSpell(id) : pg === 'creatures' ? seenCreature(id) : FA.augMade(id));
  const idsOf = pg => (pg === 'spells' ? SPELL_ORDER : pg === 'creatures' ? CREATURE_ORDER : AUG_ORDER);

  // The shell (header, tabs, list, detail) is built once per open; picking an entry only swaps the text, the stats and the demo, so nothing
  // jumps and the list keeps its place. Both pages share one layout: the list tiles, the header, the demo box (same size) and the stats column.
  let ref = null;
  Book.build = function () {
    const el = $('book');
    el.innerHTML = '<div class="bookPanel px"><div class="treeHead"><h2>' + UI.img('ic_book', 32) + 'COLLECTION BOOK</h2><div class="tabs bkTabs">' +
      '<button class="tab" data-p="spells">SPELLS</button><button class="tab" data-p="creatures">CREATURES</button><button class="tab" data-p="wardrobe">WARDROBE</button></div><div class="bkCount"></div><button class="x" data-close="1">' + UI.img('ic_x', 16) + '</button></div>' +
      '<div class="bookBody"><div class="bookList"></div><div class="bookDetail"><div class="tth bkh"></div>' +
      '<div class="bkLeft"><p class="bkDesc"></p><div class="bkDemoBox"><canvas class="bkDemo"></canvas></div><div class="spvc"></div></div><div class="bkRows"></div><div class="bkDrops"></div></div></div>' +
      '<p class="hint"></p></div>';
    const q = c => el.querySelector(c);
    ref = { el, hint: q('.hint'), list: q('.bookList'), head: q('.bkh'), desc: q('.bkDesc'), cv: q('canvas.bkDemo'), cap: q('.spvc'), drops: q('.bkDrops'), rows: q('.bkRows'), detail: q('.bookDetail'), count: q('.bkCount'), page: null };
    q('[data-close]').onclick = () => Book.close();
    el.querySelectorAll('.tab').forEach(bt => { bt.onclick = () => Book.setPage(bt.dataset.p); });
    el.onmousedown = e => { if (e.target === el) Book.close(); };
  };
  const hintHtml = pg => '<kbd>C</kbd> / Esc closes. <kbd>W</kbd><kbd>S</kbd> or <kbd>UP</kbd><kbd>DOWN</kbd> pick an entry, <kbd>A</kbd><kbd>D</kbd> or <kbd>TAB</kbd> flip the page' + (IN.padList.length ? ' <kbd>STICK</kbd> pick <kbd>LB</kbd><kbd>RB</kbd> page <kbd>B</kbd> close' : '') +
    (pg === 'wardrobe' ? '. The Wardrobe lists every garment: what it does and what the Builder forges it from. The Wizard wears one by walking onto it, so there is nothing to equip here. Greyed ones are not made yet.' : '. Greyed entries are ones you have not made or met yet: you can still read everything.') + ' The game waits while the book is open.';
  Book.fillList = function () {   // the tiles of the current page (once per page flip)
    const pg = Book.page, sp = pg === 'spells', aug = pg === 'wardrobe', ids = idsOf(pg);
    ref.hint.innerHTML = hintHtml(pg);
    ref.list.innerHTML = ids.map(i => {
      const nm = sp ? SPELLS[i] : aug ? AUGS[i].name : CFG.enemies[i].name, icon = sp ? spellIcon(i) : aug ? 'aug_' + i : i;
      return '<div class="bkItem" data-id="' + i + '">' + UI.img(icon, 32) + '<b>' + nm + '</b><u></u></div>';
    }).join('');
    ref.list.querySelectorAll('.bkItem').forEach(b => { b.onclick = () => Book.pick(b.dataset.id); });
    ref.list.querySelectorAll('.bkItem').forEach(b => { const ok = seen(pg, b.dataset.id); b.classList.toggle('unseen', !ok); b.querySelector('u').textContent = ok ? '' : '?'; });
    ref.el.querySelectorAll('.tab').forEach(bt => bt.classList.toggle('on', bt.dataset.p === pg));
    const n = ids.filter(i => seen(pg, i)).length;
    ref.count.textContent = (sp || aug ? 'MADE ' : 'MET ') + n + ' / ' + ids.length;
  };
  Book.fillDetail = function () {   // the selected entry: text, stats and demo, swapped in place
    if (Book.page === 'wardrobe') return Book.fillGarment();
    const pg = Book.page, sp = pg === 'spells', id = Book.sel[pg], ok = seen(pg, id);
    ref.list.querySelectorAll('.bkItem').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const crafted = !sp && kindOf(id) === 'crafted';
    const nm = sp ? SPELLS[id] : CFG.enemies[id].name, desc = sp ? SPELL_INFO[id].desc : crafted ? CFG.creatures[id].note : WILD_NOTE[id];
    const tag = sp ? klass(spellEls(id).length) + ' SPELL' : crafted ? klass(CFG.creatures[id].order.length) + ' CREATURE' : kindOf(id) === 'wild' ? 'WILD FOE' : id === 'warden' ? 'STRONGHOLD BOSS' : 'FINAL BOSS';
    ref.head.innerHTML = UI.img(sp ? spellIcon(id) : id, 48) + '<div><b>' + nm + '</b><small>' + tag + '</small></div>' +
      '<span class="bkSt' + (ok ? ' on' : '') + '">' + (ok ? UI.img('ic_check', 12) + (sp ? 'MADE' : 'MET') : UI.img('ic_lock', 12) + (sp ? 'NOT MADE YET' : 'NOT MET YET')) + '</span>';
    ref.desc.textContent = desc;
    ref.cap.textContent = sp ? SPV.caption(id) : crafted ? CPV.caption(id) : '';
    ref.rows.innerHTML = sp ? spellRows(id) : crafted ? creatureRows(id) : wildRows(id);
    ref.drops.innerHTML = sp ? '' : dropsHtml(id);
    ref.detail.classList.toggle('unseen', !ok);
    if (ref.page !== pg) { ref.page = pg; ref.cv.width = sp ? 186 : CPV.W; ref.cv.height = sp ? 100 : CPV.H; }   // both fill the same box on screen
    SPV.stop(); CPV.stop();
    if (sp || crafted) (sp ? SPV : CPV).mount(ref.cv, id); else Book.stillLife(ref.cv, id);
    ref.list.querySelector('.bkItem.on').scrollIntoView({ block: 'nearest' });
  };
  Book.fillGarment = function () {   // the Wardrobe page's selected garment: the Wizard wearing it, what it does, its recipe and where the Cores come from
    const id = Book.sel.wardrobe, a = AUGS[id], st = augState(id), ok = !!st;
    ref.list.querySelectorAll('.bkItem').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    ref.head.innerHTML = UI.img('aug_' + id, 48) + '<div><b>' + a.name + '</b><small>' + a.slot.toUpperCase() + ' GARMENT</small></div>' +
      '<span class="bkSt' + (ok ? ' on' : '') + '">' + (ok ? UI.img('ic_check', 12) + st : UI.img('ic_lock', 12) + 'NOT MADE YET') + '</span>';
    ref.desc.textContent = a.verb + '.';
    ref.cap.textContent = 'FORGED AT THE ARMORY';
    ref.rows.innerHTML = garmentRows(id);
    ref.drops.innerHTML = garmentDrops(id);
    ref.detail.classList.toggle('unseen', !ok);
    if (ref.page !== 'wardrobe') { ref.page = 'wardrobe'; ref.cv.width = CPV.W; ref.cv.height = CPV.H; }
    SPV.stop(); CPV.stop();
    Book.stillGarment(ref.cv, id);
    ref.list.querySelector('.bkItem.on').scrollIntoView({ block: 'nearest' });
  };
  Book.stillGarment = function (cv, id) {   // the Wizard on the meadow in the garment, large
    const c = cv.getContext('2d'), s = SP.wizard, o = SP['ao_' + id];
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2e6a3a'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#3a7e46'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % cv.width, (i * 37) % cv.height, 6, 3);
    const k = Math.max(1, Math.floor(Math.min(cv.width * 0.7 / s.c.width, cv.height * 0.8 / s.c.height))), x = Math.round(cv.width / 2), y = Math.round(cv.height * 0.9);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - Math.round(s.c.width * k / 2), y - 4, s.c.width * k, 8);
    c.drawImage(s.c, x - s.ax * k, y - s.ay * k, s.c.width * k, s.c.height * k);
    if (o) c.drawImage(o.c, x - o.ax * k, y - o.ay * k, o.c.width * k, o.c.height * k);
  };
  // wild foes, the Warden and the Chimera have no scripted demo: just the sprite, large, on the meadow
  Book.stillLife = function (cv, id) {
    const c = cv.getContext('2d'), s = SP[id];
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2e6a3a'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#3a7e46'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % cv.width, (i * 37) % cv.height, 6, 3);
    if (!s) return;
    const k = Math.max(1, Math.floor(Math.min(cv.width * 0.7 / s.c.width, cv.height * 0.8 / s.c.height)));
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(Math.round(cv.width / 2 - s.c.width * k / 2), Math.round(cv.height * 0.9 - 4), s.c.width * k, 8);
    c.drawImage(s.c, Math.round(cv.width / 2 - s.ax * k), Math.round(cv.height * 0.9 - s.ay * k), s.c.width * k, s.c.height * k);
  };
  Book.render = function () { Book.build(); Book.fillList(); Book.fillDetail(); };
  Book.setPage = function (p) { if (p === Book.page) return; Book.page = p; AU.sfx('tab'); Book.fillList(); Book.fillDetail(); };
  Book.pick = function (id) { if (id === Book.sel[Book.page]) return; Book.sel[Book.page] = id; AU.sfx('blip'); Book.fillDetail(); };
  Book.step = function (d) {
    const ids = idsOf(Book.page), i = ids.indexOf(Book.sel[Book.page]);
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
    const flip = d => Book.setPage(PAGES[(PAGES.indexOf(Book.page) + d + PAGES.length) % PAGES.length]);
    if (pad('lb')) flip(-1);
    if (pad('rb')) flip(1);
    if (IN.hit('Tab')) flip(IN.shift() ? -1 : 1);
    if (IN.hit('ArrowLeft') || IN.hit('KeyA')) Book.setPage(PAGES[Math.max(0, PAGES.indexOf(Book.page) - 1)]);
    if (IN.hit('ArrowRight') || IN.hit('KeyD')) Book.setPage(PAGES[Math.min(PAGES.length - 1, PAGES.indexOf(Book.page) + 1)]);
    if (IN.hit('ArrowUp') || IN.hit('KeyW')) Book.step(-1);
    if (IN.hit('ArrowDown') || IN.hit('KeyS')) Book.step(1);
    const iy = (p0 && p0.iy) || (p1 && p1.iy) || 0;   // the stick: one step per push, then a repeat
    if (Math.abs(iy) > 0.6) {
      if (!Book.navHeld) { Book.navHeld = true; Book.navT = 0.35; Book.step(iy > 0 ? 1 : -1); }
      else if ((Book.navT -= dt) <= 0) { Book.navT = 0.15; Book.step(iy > 0 ? 1 : -1); }
    } else Book.navHeld = false;
  };
})();
