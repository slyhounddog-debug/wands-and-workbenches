'use strict';
// The Wizard's wardrobe, two ways. Both show the same thing: the four worn slots (hat, robe, boots, charm), every augment he owns (swap freely, no cost,
// no timer) and, in the full one, his carried Offerings, Ward Keys and held spell. The augments themselves live in G.aug (augments.js).
//  - the QUICK DRAWER (#ward): a small panel that flies in from the right edge of the wilds and never pauses the game, for swapping mid-fight. I / ; on his
//    keyboard or B on his pad opens it and each further press moves the cursor to the next augment he owns; rest on one for CFG.ward.dwell seconds and it is
//    worn (a worn one you rest on is left alone). The mouse wears / takes off a tile with one click. It tucks itself away after CFG.ward.hold idle seconds.
//  - the FULL wardrobe: the Collection Book's third page (book.js hosts it: Ward.full = its container), with the detail panel and everything carried.
const Ward = { isOpen: false, dc: -1, dwell: 0, idle: 0, sig: '', cur: 0, full: null, navT: 0, navK: '' };
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
  const ownedIdx = () => AUG_ORDER.map((id, i) => (G.aug.own[id] ? i : -1)).filter(i => i >= 0);
  const sigOf = () => AUG_ORDER.map(id => (G.aug.own[id] ? 1 : 0) + (G.aug.worn[AUGS[id].slot] === id ? 'w' : '')).join('');

  // ---------- the quick drawer ----------
  Ward.render = function () {
    const host = $('ward'), A = G.aug;
    Ward.sig = sigOf();
    const slots = AUG_SLOTS.map(([k]) => {
      const id = A.worn[k];
      return '<div class="dSlot' + (id ? ' full' : '') + '" title="' + (id ? AUGS[id].name : slotLabel(k)) + '"><small>' + slotLabel(k) + '</small>' + (id ? UI.img('aug_' + id, 32) : '') + '</div>';
    }).join('');
    const tiles = AUG_ORDER.map((id, i) => {
      const a = AUGS[id], own = A.own[id], worn = A.worn[a.slot] === id;
      return '<div class="dTile' + (own ? '' : ' no') + (worn ? ' worn' : '') + (i === Ward.dc ? ' on' : '') + '" data-i="' + i + '" title="' + (own ? a.name + ': ' + a.verb : 'Not found yet') + '">' +
        UI.img('aug_' + id, 32) + '<b>' + (own ? a.name : '? ? ?') + '</b>' + (worn ? '<i>' + UI.img('ic_check', 10) + '</i>' : '') + (i === Ward.dc && !worn ? '<u style="animation-duration:' + CFG.ward.dwell + 's"></u>' : '') + '</div>';
    }).join('');
    host.innerHTML = '<div class="wdr px"><div class="wdrHead"><h4>' + UI.img('aug_tide', 20) + 'WARDROBE</h4><kbd>I</kbd><button class="x" data-close="1">' + UI.img('ic_x', 12) + '</button></div>' +
      '<div class="dSlots">' + slots + '</div><div class="dGrid">' + tiles + '</div></div>';
    host.querySelector('[data-close]').onclick = () => Ward.close();
    host.querySelectorAll('.dTile').forEach(t => { t.onclick = () => { const id = AUG_ORDER[+t.dataset.i]; if (G.aug.own[id]) { Ward.dc = -1; Ward.dwell = 0; Ward.wear(id); } else AU.sfx('error'); }; });
  };
  Ward.wear = function (id) {
    if (!WZ.wear(id)) { AU.sfx('error'); return; }
    Ward.idle = CFG.ward.hold;
    Ward.render(); Ward.renderFull();
  };
  Ward.open = function () {
    if (Ward.isOpen || !G || G.paused) return;
    Ward.isOpen = true; Ward.dc = -1; Ward.dwell = 0; Ward.idle = CFG.ward.hold;
    Ward.render(); $('ward').classList.add('open'); AU.sfx('menu_open');
  };
  Ward.close = function (quiet) {
    if (!Ward.isOpen) return;
    Ward.isOpen = false; Ward.dc = -1; Ward.dwell = 0;
    $('ward').classList.remove('open');
    if (!quiet) AU.sfx('menu_close');
  };
  // the wardrobe button on his side / the gear card: open it, or tuck it away again
  Ward.toggle = function () { if (Ward.isOpen) Ward.close(); else Ward.open(); };
  // his key (I / ; / pad B): the first press opens the drawer, the next ones move the cursor along what he owns, past the last one it closes
  Ward.press = function () {
    if (!Ward.isOpen) { Ward.open(); return; }
    const own = ownedIdx();
    if (!own.length) { Ward.close(); return; }
    const nx = own.find(i => i > Ward.dc);
    if (nx === undefined) { Ward.close(); return; }
    Ward.dc = nx; Ward.idle = CFG.ward.hold;
    Ward.dwell = G.aug.worn[AUGS[AUG_ORDER[nx]].slot] === AUG_ORDER[nx] ? 0 : CFG.ward.dwell;   // already worn: nothing to wait for
    AU.sfx('blip'); Ward.render();
  };
  // every frame the game runs: wear what the cursor has rested on, keep the drawer in step with what he owns, tuck it away when idle
  Ward.tick = function (dt) {
    if (Ward.isOpen) {
      if (G.paused || UI.treeOpen.L || UI.treeOpen.R) { Ward.close(true); return; }
      if (Ward.dwell > 0 && (Ward.dwell -= dt) <= 0) {
        Ward.dwell = 0;
        const id = AUG_ORDER[Ward.dc];
        if (id && G.aug.own[id] && G.aug.worn[AUGS[id].slot] !== id) { Ward.dc = -1; Ward.wear(id); }
      } else if (Ward.sig !== sigOf()) Ward.render();
      if ($('ward').matches(':hover')) Ward.idle = CFG.ward.hold;
      else if (Ward.dwell <= 0 && (Ward.idle -= dt) <= 0) Ward.close();
    }
  };

  // ---------- the full wardrobe (the Collection Book's third page) ----------
  const tile = (id, i) => {
    const a = AUGS[id], own = G.aug.own[id], worn = G.aug.worn[a.slot] === id;
    return '<div class="wTile' + (own ? '' : ' no') + (worn ? ' worn' : '') + (i === Ward.cur ? ' on' : '') + '" data-i="' + i + '">' + UI.img('aug_' + id, 40) +
      '<b>' + (own ? a.name : '? ? ?') + '</b><u>' + slotLabel(a.slot) + '</u>' + (worn ? '<i>' + UI.img('ic_check', 12) + 'WORN</i>' : !own ? '<i>' + UI.img('ic_lock', 12) + '</i>' : '') + '</div>';
  };
  Ward.renderFull = function () {
    const host = Ward.full;
    if (!host) return;
    const A = G.aug, cid = AUG_ORDER[Ward.cur], ca = AUGS[cid], own = A.own[cid], worn = A.worn[ca.slot] === cid;
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
    host.innerHTML = '<div class="wLeft"><h3>WORN</h3><div class="wSlots">' + slots + '</div><h3>WARDROBE</h3><div class="wGrid">' + AUG_ORDER.map(tile).join('') + '</div></div>' +
      '<div class="wMid"><div class="tth bkh">' + UI.img('aug_' + cid, 48) + '<div><b>' + (own ? ca.name : '? ? ?') + '</b><small>' + slotLabel(ca.slot) + ' AUGMENT</small></div><span class="bkSt' + (worn ? ' on' : '') + '">' + (worn ? UI.img('ic_check', 12) + 'WORN' : own ? 'IN THE WARDROBE' : UI.img('ic_lock', 12) + 'NOT FOUND YET') + '</span></div>' +
      '<div class="bkr"><span>Verb</span><em>' + esc(ca.verb) + '</em></div><div class="bkr"><span>Found</span><em>' + esc(Ward.sourceText(cid)) + '</em></div><div class="bkr"><span>Uses</span><em>' + esc(Ward.useText(cid)) + '</em></div>' +
      (cid === 'phoenix' ? '<div class="bkr"><span>Charge</span><em>' + (cd ? 'recharging: about ' + cd + ' min left' : 'ready') + '</em></div>' : '') +
      '<button class="big wBtn' + (own ? '' : ' ghost') + '" data-wear="1">' + (!own ? 'NOT FOUND YET' : worn ? 'TAKE OFF' : A.worn[ca.slot] ? 'SWAP IN (replaces ' + AUGS[A.worn[ca.slot]].name + ')' : 'WEAR') + '</button></div>' +
      '<div class="wRight"><h3>CARRIED</h3>' + inv + held + '</div>';
    host.querySelectorAll('.wTile').forEach(t => { t.onclick = () => { Ward.pick(+t.dataset.i); if (G.aug.own[AUG_ORDER[+t.dataset.i]]) Ward.toggle1(); }; });
    host.querySelectorAll('.wSlot.full').forEach(s => { s.onclick = () => { Ward.pick(AUG_ORDER.indexOf(G.aug.worn[s.dataset.slot])); Ward.toggle1(); }; });
    host.querySelector('[data-wear]').onclick = () => Ward.toggle1();
  };
  Ward.pick = function (i) { if (i === Ward.cur || i < 0) return; Ward.cur = i; AU.sfx('blip'); Ward.renderFull(); };
  Ward.toggle1 = function () { if (WZ.wear(AUG_ORDER[Ward.cur])) { Ward.renderFull(); if (Ward.isOpen) Ward.render(); } else AU.sfx('error'); };   // wear / take off the picked augment
  // keys / pad for the full wardrobe while the Collection Book shows it (book.js calls this; left from the first column goes back a page via the return value)
  Ward.keys = function (dt, p0, p1) {
    const pad = f => (p0 && p0[f]) || (p1 && p1[f]);
    if (IN.hit('Enter') || IN.hit('KeyE') || IN.hit('Period') || IN.hit('Space') || pad('a')) Ward.toggle1();
    const r = Math.floor(Ward.cur / COLS), c = Ward.cur % COLS;
    let back = false;
    if (IN.hit('ArrowLeft') || IN.hit('KeyA')) { if (c === 0) back = true; else Ward.pick(r * COLS + c - 1); }
    if (IN.hit('ArrowRight') || IN.hit('KeyD')) Ward.pick(r * COLS + (c + 1) % COLS);
    if (IN.hit('ArrowUp') || IN.hit('KeyW')) Ward.pick((Ward.cur - COLS + AUG_ORDER.length) % AUG_ORDER.length);
    if (IN.hit('ArrowDown') || IN.hit('KeyS')) Ward.pick((Ward.cur + COLS) % AUG_ORDER.length);
    const ix = (p0 && p0.ix) || (p1 && p1.ix) || 0, iy = (p0 && p0.iy) || (p1 && p1.iy) || 0;   // the stick: one step per push, then a repeat
    const k = Math.abs(ix) > 0.6 ? 'x' + Math.sign(ix) : Math.abs(iy) > 0.6 ? 'y' + Math.sign(iy) : '';
    if (!k) { Ward.navK = ''; Ward.navT = 0; return back; }
    if (k !== Ward.navK || (Ward.navT -= dt) <= 0) {
      Ward.navT = k !== Ward.navK ? 0.35 : 0.15; Ward.navK = k;
      if (k[0] === 'x') Ward.pick(r * COLS + (c + (k === 'x1' ? 1 : COLS - 1)) % COLS); else Ward.pick((Ward.cur + (k === 'y1' ? COLS : AUG_ORDER.length - COLS)) % AUG_ORDER.length);
    }
    return back;
  };
})();
