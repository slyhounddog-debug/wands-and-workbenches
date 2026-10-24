'use strict';
// The Wizard's wardrobe: the four worn slots (hat, robe, boots, charm), every augment he owns (swap freely, no cost, no timer), and his carried
// Offerings, Ward Keys and held spell. It opens over the paused game like the Collection Book (I / ; on his keyboard, B on his pad, the button on his
// side of the screen) and the game waits while it is open. The augments themselves live in G.aug (augments.js).
const Ward = { isOpen: false, cur: 0, from: 'play', navT: 0, navK: '' };
(function () {
  const COLS = 4;
  const GATE_TEXT = { water: 'an island in the middle of a lake', fire: 'a field of scorched ground', earth: 'a ring of cracked rock', air: 'a chasm with a broken bridge' };
  const USES = { bog: 'Pass the vine tangles knotted over the bogs; no more slow walking in bog.', phoenix: 'A second life: the Feather recharges while you play.',
    static: 'Takes the sting out of being swarmed: every hit that lands throws the attackers back.', kiln: 'Buried caches glint through the grass; edge glints point at landmarks you have not claimed.' };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const slotLabel = s => AUG_SLOTS.find(x => x[0] === s)[1].toUpperCase();
  // where an augment comes from, in words, worked out by the same rules the kills use (WZ.srcMatch)
  Ward.sourceText = function (id) {
    const a = AUGS[id];
    if (a.src.id) return 'The first ' + CFG.enemies[a.src.id].name + ' you defeat, wild or crafted: it drops guaranteed, once.';
    const names = Object.keys(CFG.enemies).filter(t => WZ.srcMatch({ type: t }, a)).map(t => CFG.enemies[t].name);
    return 'The first ' + ELEM_WORD[a.src.line] + '-line creature you defeat (' + names.join(', ') + '), wild or crafted: it drops guaranteed, once.';
  };
  Ward.useText = id => (AUGS[id].gate ? 'Opens the way to the ' + ELEM_WORD[AUGS[id].gate] + ' Stronghold: ' + GATE_TEXT[AUGS[id].gate] + '. Works anywhere else in the wilds too.' : USES[id]);
  const tile = (id, i) => {
    const a = AUGS[id], own = G.aug.own[id], worn = G.aug.worn[a.slot] === id;
    return '<div class="wTile' + (own ? '' : ' no') + (worn ? ' worn' : '') + (i === Ward.cur ? ' on' : '') + '" data-i="' + i + '">' + UI.img('aug_' + id, 40) +
      '<b>' + (own ? a.name : '? ? ?') + '</b><u>' + slotLabel(a.slot) + '</u>' + (worn ? '<i>' + UI.img('ic_check', 12) + 'WORN</i>' : !own ? '<i>' + UI.img('ic_lock', 12) + '</i>' : '') + '</div>';
  };
  Ward.render = function () {
    const A = G.aug, host = $('ward'), cid = AUG_ORDER[Ward.cur], ca = AUGS[cid], own = A.own[cid], worn = A.worn[ca.slot] === cid;
    const slots = AUG_SLOTS.map(([k]) => {
      const id = A.worn[k];
      return '<div class="wSlot' + (id ? ' full' : '') + '" data-slot="' + k + '"><small>' + slotLabel(k) + '</small>' + (id ? UI.img('aug_' + id, 40) + '<b>' + AUGS[id].name + '</b>' : '<span class="emp">EMPTY</span>') + '</div>';
    }).join('');
    const inv = ELEMS.map(el => '<div class="bkr"><span>' + UI.img('off_' + el, 24) + '</span><em>' + OFFER_NAME(el) + '<b class="cnt' + (A.off[el] ? '' : ' z') + '">x' + A.off[el] + '</b></em></div>').join('') +
      ELEMS.map(el => '<div class="bkr"><span>' + UI.img('key_' + el, 24) + '</span><em>' + KEY_NAME(el) + (A.key[el] ? '<b class="cnt">' + UI.img('ic_check', 12) + 'HAVE</b>' : '<b class="cnt z">' + UI.img('ic_lock', 12) + 'NOT YET</b>') + '</em></div>').join('');
    const held = G.hold.on ? (G.hold.spell ? '<div class="bkr"><span>' + UI.img(G.hold.spell, 24) + '</span><em>' + SPELLS[G.hold.spell] + '<b class="cnt">' + Main.holdKeyName() + ' fires</b></em></div>'
      : '<div class="bkr"><span>' + UI.img('ic_hand', 24) + '</span><em>Held spell: empty<b class="cnt z">next delivery fills it</b></em></div>')
      : '<div class="bkr off"><span>' + UI.img('ic_lock', 24) + '</span><em>Held spell<b class="cnt z">after the first Warden falls</b></em></div>';
    const cd = A.cd.phoenix > 0 ? Math.ceil(A.cd.phoenix / 60) : 0;
    host.innerHTML = '<div class="wardPanel px"><div class="treeHead"><h2>' + UI.img('aug_tide', 32) + 'WIZARD\'S WARDROBE</h2><div class="bkCount">' + AUG_ORDER.filter(id => A.own[id]).length + ' / ' + AUG_ORDER.length + ' AUGMENTS</div><button class="x" data-close="1">' + UI.img('ic_x', 16) + '</button></div>' +
      '<div class="wardBody"><div class="wLeft"><h3>WORN</h3><div class="wSlots">' + slots + '</div><h3>WARDROBE</h3><div class="wGrid">' + AUG_ORDER.map(tile).join('') + '</div></div>' +
      '<div class="wMid"><div class="tth bkh">' + UI.img('aug_' + cid, 48) + '<div><b>' + (own ? ca.name : '? ? ?') + '</b><small>' + slotLabel(ca.slot) + ' AUGMENT</small></div><span class="bkSt' + (worn ? ' on' : '') + '">' + (worn ? UI.img('ic_check', 12) + 'WORN' : own ? 'IN THE WARDROBE' : UI.img('ic_lock', 12) + 'NOT FOUND YET') + '</span></div>' +
      '<div class="bkr"><span>Verb</span><em>' + esc(ca.verb) + '</em></div><div class="bkr"><span>Found</span><em>' + esc(Ward.sourceText(cid)) + '</em></div><div class="bkr"><span>Uses</span><em>' + esc(Ward.useText(cid)) + '</em></div>' +
      (cid === 'phoenix' ? '<div class="bkr"><span>Charge</span><em>' + (cd ? 'recharging: about ' + cd + ' min left' : 'ready') + '</em></div>' : '') +
      '<button class="big wBtn' + (own ? '' : ' ghost') + '" data-wear="1">' + (!own ? 'NOT FOUND YET' : worn ? 'TAKE OFF' : A.worn[ca.slot] ? 'SWAP IN (replaces ' + AUGS[A.worn[ca.slot]].name + ')' : 'WEAR') + '</button></div>' +
      '<div class="wRight"><h3>CARRIED</h3>' + inv + held + '</div></div>' +
      '<p class="hint"><kbd>I</kbd> / Esc closes. <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the <kbd>ARROWS</kbd> pick an augment, <kbd>ENTER</kbd> / <kbd>E</kbd> / <kbd>.</kbd> wears or takes it off' + (IN.padList.length ? ' (<kbd>STICK</kbd> pick <kbd>A</kbd> wear <kbd>B</kbd> close)' : '') + '. Swapping is free, any time. Augments change what the Wizard can do, never his numbers. The game waits while this is open.</p></div>';
    host.querySelector('[data-close]').onclick = () => Ward.close();
    host.onmousedown = e => { if (e.target === host) Ward.close(); };
    host.querySelectorAll('.wTile').forEach(t => { t.onclick = () => { Ward.pick(+t.dataset.i); if (G.aug.own[AUG_ORDER[+t.dataset.i]]) Ward.toggle(); }; });
    host.querySelectorAll('.wSlot.full').forEach(s => { s.onclick = () => { Ward.pick(AUG_ORDER.indexOf(G.aug.worn[s.dataset.slot])); Ward.toggle(); }; });
    host.querySelector('[data-wear]').onclick = () => Ward.toggle();
  };
  Ward.pick = function (i) { if (i === Ward.cur || i < 0) return; Ward.cur = i; AU.sfx('blip'); Ward.render(); };
  Ward.toggle = function () { if (WZ.wear(AUG_ORDER[Ward.cur])) Ward.render(); else AU.sfx('error'); };
  Ward.open = function (fromPause) {
    if (Ward.isOpen || !G) return;
    Ward.from = fromPause || G.paused ? 'pause' : 'play';
    if (!G.paused) Main.pause(true);
    UI.show('pause', false);
    Ward.isOpen = true; UI.show('ward', true); Ward.render(); AU.sfx('menu_open');
  };
  Ward.close = function (quiet) {
    if (!Ward.isOpen) return;
    Ward.isOpen = false; UI.show('ward', false);
    if (quiet) return;
    AU.sfx('menu_close');
    if (Ward.from === 'pause') UI.show('pause', true); else Main.pause(false);
  };
  // called every frame while the game is up: keys / pad for the open wardrobe
  Ward.tick = function (dt) {
    if (!Ward.isOpen) return;
    const p0 = IN.pad[0], p1 = IN.pad[1], pad = f => (p0 && p0[f]) || (p1 && p1[f]);
    if (IN.hit('Escape') || IN.hit('KeyI') || IN.hit('Semicolon') || pad('b') || pad('back')) {
      Ward.close();
      IN.pressed.delete('Escape'); IN.pressed.delete('KeyI'); IN.pressed.delete('Semicolon');   // the same press must not also pause (Esc) or reopen (I) in this frame's controls
      for (const q of [p0, p1]) if (q) { q.b = false; q.back = false; }
      return;
    }
    if (IN.hit('Enter') || IN.hit('KeyE') || IN.hit('Period') || IN.hit('Space') || pad('a')) Ward.toggle();
    const r = Math.floor(Ward.cur / COLS), c = Ward.cur % COLS;
    if (IN.hit('ArrowLeft') || IN.hit('KeyA')) Ward.pick(r * COLS + (c + COLS - 1) % COLS);
    if (IN.hit('ArrowRight') || IN.hit('KeyD')) Ward.pick(r * COLS + (c + 1) % COLS);
    if (IN.hit('ArrowUp') || IN.hit('KeyW')) Ward.pick((Ward.cur - COLS + AUG_ORDER.length) % AUG_ORDER.length);
    if (IN.hit('ArrowDown') || IN.hit('KeyS')) Ward.pick((Ward.cur + COLS) % AUG_ORDER.length);
    const ix = (p0 && p0.ix) || (p1 && p1.ix) || 0, iy = (p0 && p0.iy) || (p1 && p1.iy) || 0;   // the stick: one step per push, then a repeat
    const k = Math.abs(ix) > 0.6 ? 'x' + Math.sign(ix) : Math.abs(iy) > 0.6 ? 'y' + Math.sign(iy) : '';
    if (!k) { Ward.navK = ''; Ward.navT = 0; return; }
    if (k !== Ward.navK || (Ward.navT -= dt) <= 0) {
      Ward.navT = k !== Ward.navK ? 0.35 : 0.15; Ward.navK = k;
      if (k[0] === 'x') Ward.pick(r * COLS + (c + (k === 'x1' ? 1 : COLS - 1)) % COLS); else Ward.pick((Ward.cur + (k === 'y1' ? COLS : AUG_ORDER.length - COLS)) % AUG_ORDER.length);
    }
  };
})();
