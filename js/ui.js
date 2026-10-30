'use strict';
// DOM-side UI: toasts, HUD, hotbar, goals, skill tree, menus, results. All icons are the game's own pixel sprites.
const $ = id => document.getElementById(id);
const UI = {};

// ---------- pixel icons rendered from the game's own sprites ----------
const iconCache = {};
UI.iconCanvas = function (key) {
  if (iconCache[key]) return iconCache[key];
  let c;
  if (key.startsWith('b:')) {   // building: base + floating crystal for harnessers (ids like 'air' also name items, hence the prefix)
    const id = key.slice(2), el = ELEM[id] ? id : id === 'harness' ? 'air' : null, s = SP['b_' + (el ? 'harness' : id)];   // 'b:water' = the Harnesser carrying a Water crystal
    c = document.createElement('canvas'); c.width = 20; c.height = 32;
    const x = c.getContext('2d');
    x.drawImage(s.c, 0, -2);
    if (el) { const cr = SP['cr_' + el]; x.drawImage(cr.c, 10 - cr.ax, 26 - 2 - 7 - cr.ay); }
  } else {
    const s = SP[key] || itemSprite(key);
    c = s ? s.c : null;
  }
  return (iconCache[key] = c);
};
const urlCache = {};
UI.iconURL = key => urlCache[key] || (urlCache[key] = UI.iconCanvas(key) ? UI.iconCanvas(key).toDataURL() : '');
// <img> scaled by a whole number so pixels stay square; size = roughly the wanted height in px
UI.img = function (key, size, cls) {
  const c = UI.iconCanvas(key);
  if (!c) return '';
  const k = Math.max(1, Math.round((size || 24) / Math.max(c.width, c.height)));
  return '<img class="ico ' + (cls || '') + '" src="' + UI.iconURL(key) + '" style="width:' + c.width * k + 'px;height:' + c.height * k + 'px">';
};
UI.decorate = function (root) {   // <i data-ic="ic_heart" data-s="24"></i> placeholders in the HTML
  (root || document).querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = UI.img(el.dataset.ic, +el.dataset.s || 24); });
};

// ---------- toasts ----------
UI.toast = function (text, side, icon, local) {
  if (UI.toastCap) { UI.toastCap.push({ text, side, icon }); return; }   // the guest's purchase is being resolved: its messages go back to him (Net.hooks.buy)
  if (!local && side === 'R') Net.sendToast(text, icon);   // the Wizard's messages also reach the Wizard's screen (online host)
  const box = $(side === 'R' ? 'toastR' : 'toastL');
  if (!box) return;
  for (const c of box.children) if (c.dataset.t === text) { c.classList.remove('out'); c._ttl = 2.6; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); return; }
  const el = document.createElement('div');
  el.className = 'toast px'; el.dataset.t = text; el._ttl = 3;
  el.innerHTML = (icon ? UI.img(icon, 24) : '') + '<span></span>';
  el.querySelector('span').textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
};
UI.tickToasts = function (dt) {
  for (const id of ['toastL', 'toastR']) {
    const box = $(id);
    for (const c of Array.from(box.children)) {
      c._ttl -= dt;
      if (c._ttl < 0.4) c.classList.add('out');
      if (c._ttl <= 0) box.removeChild(c);
    }
  }
};
UI.dirty = false;
UI.changed = function () { UI.dirty = true; Main.still = 0; };   // also: a frozen frame may need redrawing (see the main loop)

// ---------- never fail silently: every caught error lands in a badge (click it for the list) ----------
UI.errs = [];
UI.err = function (e) {
  const msg = String(e && e.message ? e.message : e).slice(0, 200);
  if (e && e.stack) console.error(e); else console.error('[wands] ' + msg);
  const last = UI.errs[UI.errs.length - 1];
  if (last && last.msg === msg) last.n++; else UI.errs.push({ msg, n: 1, at: new Date().toLocaleTimeString() });
  if (UI.errs.length > 20) UI.errs.shift();
  const el = $('errBadge');
  if (!el) return;
  el.classList.remove('hidden', 'pulse'); void el.offsetWidth; el.classList.add('pulse');
  const total = UI.errs.reduce((a, x) => a + x.n, 0);
  el.querySelector('b').textContent = '' + total;
  $('errList').innerHTML = UI.errs.slice().reverse().map(x => '<div><i>' + x.at + (x.n > 1 ? ' x' + x.n : '') + '</i>' + x.msg.replace(/</g, '&lt;') + '</div>').join('');
};
UI.and = function (on) {
  const el = $('andBanner');
  el.classList.toggle('hidden', !on);
  if (on) { el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); AU.sfx('blip'); }
};

// ---------- HUD ----------
const cache = {};
function setTxt(id, s) { if (cache[id] !== s) { cache[id] = s; $(id).textContent = s; } }
function setHtml(id, s) { if (cache[id] !== s) { cache[id] = s; $(id).innerHTML = s; } }
function fmtTime(t) { t = Math.floor(t); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
UI.resetCache = () => { for (const k in cache) delete cache[k]; };

// the hands as small slots in pile order (the first grabbed on the left, the top of the pile, thrown next, lit); empty slots stay as outlines. Never numbers.
UI.handsHtml = function () {
  const l = G.hands, cap = FA.cap();
  let s = '';
  for (let i = 0; i < cap; i++) s += l[i] ? '<span class="hs' + (i === l.length - 1 ? ' fr' : '') + '">' + UI.img(l[i].kind, 16) + '</span>' : '<span class="hs em"></span>';
  return s;
};
UI.updateHud = function (dt) {
  const f = G.fac, w = G.w;
  const pulse = (id, v) => { if (cache['v' + id] !== undefined && v > cache['v' + id]) { const el = $(id); el.classList.remove('gain'); void el.offsetWidth; el.classList.add('gain'); } cache['v' + id] = v; };
  for (const k of ['wood', 'stone', 'iron', 'shard']) {
    const id = 't' + k[0].toUpperCase() + k.slice(1);
    setHtml(id, UI.img(k, 24) + '<b>' + G.stock[k] + '</b>');
    pulse(id, G.stock[k]);
  }
  const xp = Math.floor(G.xp);
  setHtml('tXp', UI.img('ic_xp', 24) + '<b>' + xp + '</b><span class="lbl">XP</span>');
  const can = UI.anyAffordable();
  $('tXp').classList.toggle('ready', can);
  // something in the tree can be bought: its two buttons flash for a moment now and then (not while that tree is open)
  const N = CFG.treeNudge;
  UI.nudgeT = can ? (UI.nudgeT === undefined ? 0 : (UI.nudgeT + dt) % (N.every + N.time)) : undefined;
  const flash = can && UI.nudgeT < N.time;
  $('btnTree').classList.toggle('nudge', flash && !UI.treeOpen.L); $('btnTreeR').classList.toggle('nudge', flash && !UI.treeOpen.R);
  pulse('tXp', xp);
  // the Skill Portal bank: four element packets + how many combo spells are banked
  const combos = SPELL_KINDS.filter(k => ITEMS[k].spell).reduce((a, k) => a + (G.bank[k] || 0), 0);
  setHtml('tBank', UI.img('ic_skill', 24) + ['air', 'water', 'fire', 'earth'].map(k => UI.img(k, 16) + '<b>' + (G.bank[k] || 0) + '</b>').join('') + (combos ? UI.img('flamethrower', 16) + '<b>' + combos + '</b>' : '') + (G.bank.shard > 0 ? UI.img('shard', 16) + '<b>' + G.bank.shard + '</b>' : ''));
  pulse('tBank', G.bankTotal || 0);
  const gen = f.gen, dem = f.demand, low = dem > gen;
  setTxt('powTxt', gen + ' / ' + dem);
  $('powFill').style.width = (dem === 0 ? (gen > 0 ? 100 : 0) : Math.min(100, gen / dem * 100)).toFixed(0) + '%';
  // the charge left in every Battery building, added up (an overcharged one counts past full), against what they could hold
  let bc = 0, bcap = 0;
  for (const b of f.bld) if (FA.isCell(b) && b.done) { bcap += CFG.batteryMax; bc += b.bat; }
  // the Cores and the Warden Key waiting in the Stockpile (only the ones there are any of)
  setHtml('tComp', Object.keys(RES).filter(k => (isCoreKind(k) || isKeyKind(k)) && G.stock[k] > 0).map(k => UI.img(k, 20) + '<b>' + G.stock[k] + '</b>').join(''));
  setTxt('batTxt', Math.round(bc) + (bcap ? ' / ' + bcap : ''));
  $('batFill').style.width = (bcap ? Math.min(100, bc / bcap * 100) : 0).toFixed(0) + '%';
  $('powCard').classList.toggle('low', low);
  $('vigL').classList.toggle('on', low);
  setHtml('handTxt', UI.handsHtml());
  const sf = (G.fac.shkFlash || 0) > 0;   // something was just shaken loose somewhere: the POWER and HANDS cards flash
  $('powCard').classList.toggle('shk', sf); $('handCard').classList.toggle('shk', sf);
  $('apChip').classList.toggle('on', !!G.autoPick); setHtml('apChip', 'AUTO <b>' + (G.autoPick ? 'ON' : 'OFF') + '</b>');
  $('handCard').classList.toggle('full', !FA.canHold());
  $('btnDemo').classList.toggle('on', G.demolish);
  const mh = WZ.maxHp();
  setTxt('hpTxt', Math.ceil(w.hp) + '/' + mh);
  $('hpFill').style.width = (Math.max(0, w.hp) / mh * 100).toFixed(1) + '%';
  setTxt('armTxt', Math.ceil(w.armor) + '');
  $('armFill').style.width = (w.armor / CFG.wizard.armorMax * 100).toFixed(1) + '%';
  setTxt('runTime', fmtTime(w.time));
  setTxt('runKills', '' + w.kills);
  // the Chimera's bar spans the split so both players see what it's weak to right now
  const bo = w.boss;
  $('bossBar').classList.toggle('hidden', !bo);
  $('game').classList.toggle('bossOn', !!bo);
  if (bo) {
    const nx = WZ.nextWeak(bo);
    setHtml('bossWeak', 'WEAK ' + UI.img(bo.weak, 20) + '<b style="color:' + ELEM[bo.weak].color + '">' + ELEM_WORD[bo.weak].toUpperCase() + '</b>' +
      (nx ? '<span class="next">NEXT ' + UI.img(nx, 14) + ELEM_WORD[nx].toUpperCase() + '</span>' : ''));
    $('bossFill').style.width = (Math.max(0, bo.hp) / bo.maxHp * 100).toFixed(1) + '%';
    setTxt('bossTxt', Math.ceil(Math.max(0, bo.hp)) + ' / ' + bo.maxHp);
  }
  // whoever opens a skill tree freezes the wilds: say so on the other half in plain words
  const tl = UI.treeOpen.L, tr = UI.treeOpen.R;
  $('wizPause').classList.toggle('hidden', Net.on || !tl || tr);
  $('facNote').classList.toggle('hidden', Net.on || !tr || tl);
  UI.updateGear();
  UI.updateQuest(dt);
  UI.updateEvent();
  UI.updateEggQ();
  if (Net.role !== 'guest') { UI.updatePins(dt); UI.updateHotbar(); }
  if (Net.on) UI.syncTrees();
  UI.updateDebug(dt);
  if (UI.tipT > 0) { UI.tipT -= dt; if (UI.tipT <= 0 && !UI.tipHover) $('hotTip').classList.add('hidden'); }
  UI.tickToasts(dt);
};
// the Wizard's gear on his HUD: the four worn augments (a faint outline when a slot is empty); the wand's four slots sit under his health bar (UI.updateWand)
UI.updateGear = function () {
  const A = G.aug, P = CFG.aug.phoenix;
  let s = '';
  for (const sl of AUG_SLOTS) {
    const id = A.worn[sl[0]], cool = id === 'phoenix' && A.cd.phoenix > 0;
    s += '<span class="gs ' + (id ? '' : 'em ') + (cool ? 'cool' : '') + '" title="' + (id ? AUGS[id].name : sl[1]) + '">' + UI.img(id ? 'aug_' + id : 'aug_' + AUG_ORDER.find(k => AUGS[k].slot === sl[0]), 32) + (id ? '' : '<small>' + sl[1].toUpperCase().slice(0, 4) + '</small>') + (cool ? '<i style="width:' + Math.round((1 - A.cd.phoenix / P.cd) * 38) + 'px"></i>' : '') + '</span>';
  }
  setHtml('gearCard', s);
  UI.updateWand();
  const np = $('noPow');
  if (np) np.classList.toggle('hidden', !((G.fac.darkT || 0) >= 1.5));   // the Wizard sees when the factory has gone dark (it is in the snapshot, so the online guest sees it too)
};
// The wand: four slots (Air, Water, Fire, Earth) under his health bar, each an icon filling with the spells that charged it; a READY slot is lit, and the ARMED one (the one Cast fires)
// has a bright frame and a marker. The key chips are the Cycle and Cast buttons of whoever plays him.
UI.updateWand = function () {
  const W = G.wand;
  if (!W || !$('wandRow')) return;
  const kn = Main.wizKeyNames();
  let s = '';
  for (const el of ELEMS) {
    const need = CFG.wand.need[el], full = W.full[el], m = W.m[el], on = W.armed === el;
    s += '<span class="ws' + (full ? ' full' : '') + (on ? ' armed' : '') + '" style="--ec:' + ELEM[el].color + '" title="' + CFG.wandNames[el] + ': ' + (full ? 'READY' + (on ? ' (armed: Cast fires it)' : ' (Cycle arms it)') : m + ' of ' + need + ' spells') + '">' + UI.img('wand_' + el, 24) + '<i style="height:' + Math.round(m / need * 100) + '%"></i>' + (full ? '' : '<b>' + m + '</b>') + (on ? '<u></u>' : '') + '</span>';
  }
  s += '<span class="wk" title="Cycle the armed wand attack / Cast it / Emote wheel"><kbd>' + kn.cycle + '</kbd><kbd>' + kn.cast + '</kbd><kbd>' + kn.emote + '</kbd></span>';
  setHtml('wandRow', s);
};// The building note sits right above the hotbar and the button prompts (drawn by R.drawFocus) stack above it; UI.inspectH is how tall the note is, so they can clear it.
UI.inspectH = 0;
UI.setInspect = function (s) {
  const el = $('inspect');
  if (!s) { el.classList.add('hidden'); UI.inspectH = 0; return; }
  el.classList.remove('hidden');
  if (cache.inspect !== s || !UI.inspectH) { setTxt('inspect', s); UI.inspectH = el.offsetHeight; }
};

// ---------- goals: one card per player, the two tracks run at the same time ----------
// [have, need] for the bar, or null (stat goals count what happened SINCE the goal started: G.qbase)
UI.questProg = function (side, q) {
  if (q.stat) return [Math.max(0, Math.min(q.n, q.stat(G) - (G.qbase[side] || 0))), q.n];
  return q.prog ? q.prog(G) : null;
};
// a goal's gift as icon rows: [[icon key, count, sprite key for the pop]]
UI.giftList = function (gift) {
  const out = [];
  if (!gift) return out;
  for (const k in gift.bank || {}) out.push([k, gift.bank[k], k]);
  for (const k in gift.stock || {}) out.push([k, gift.stock[k], k]);
  for (const k in gift.credit || {}) out.push(['b:' + k, gift.credit[k], 'b_' + k]);
  for (const k of gift.pickup || []) { const e = out.find(o => o[0] === k); if (e) e[1]++; else out.push([k, 1, k]); }
  return out;
};
UI.giftHtml = (gift, size) => UI.giftList(gift).map(e => UI.img(e[0], size) + (e[1] > 1 ? '<b>' + e[1] + '</b>' : '')).join('');
// hand over a gift: spells to the bank, materials to the Stockpile, a free placement, pickups that drop beside the Wizard
UI.giveGift = function (gift) {
  if (!gift) return;
  const f = G.fac, sp = FA.portal('skill');
  for (const k in gift.bank || {}) { G.bank[k] = (G.bank[k] || 0) + gift.bank[k]; FA.ipop(sp.x + 0.5, sp.y + 1, [[k, gift.bank[k]]]); f.skillFlash = 0.5; }
  for (const k in gift.stock || {}) FA.toStock(k, gift.stock[k]);
  for (const k in gift.credit || {}) { G.credits[k] = (G.credits[k] || 0) + gift.credit[k]; FA.ipop(G.bd.x, G.bd.y - 1.2, [['ic_gift']]); }
  if (gift.pickup) G.pend = (G.pend || []).concat(gift.pickup);
};
// finished a goal: XP, the gift, then a fanfare on that player's half (floating icons, ring, sound, the card flashes)
UI.questDone = function (side, q) {
  G.xp += q.xp; G.stats.xpEarned += q.xp;
  G.quest[side]++; G.qbase[side] = null;
  UI.giveGift(q.gift);
  const big = q.xp >= 30, gl = UI.giftList(q.gift);
  UI.toast('Goal complete! +' + q.xp + ' XP' + (q.gift && q.gift.credit ? ' and a FREE ' + Object.keys(q.gift.credit).map(k => CFG.buildings[k].name).join(', ') : ''), side === 'W' ? 'R' : 'L', 'ic_target');
  if (side === 'B') {
    FA.ipop(G.bd.x, G.bd.y - 0.6, [['ic_check'], ['ic_xp', q.xp]]);
    FA.burst(G.bd.x, G.bd.y, '#ffd23a', big ? 28 : 14);
  } else if (G.w) {
    const w = G.w;
    WZ.num(w.x, w.y, '+' + q.xp + ' XP', '#ffe36b'); WZ.icon(w.x, w.y, 'ic_check');
    WZ.ring(w.x, w.y, big ? 2.4 : 1.6, '#ffd23a', 0.5); WZ.puff(w.x, w.y, '#ffd23a', big ? 20 : 10);
  }
  AU.sfx(big ? 'complete' : 'buy');
  const el = $('quest' + side); el.classList.remove('done'); void el.offsetWidth; el.classList.add('done');
  UI.changed();
};
UI.questSide = function (side) {
  const list = QUESTS[side], i = G.quest[side], q = list[i], nm = QUEST_NAME[side];
  if (!q) {
    setHtml('qIcon' + side, UI.img('ic_trophy', 32));
    setHtml('qHead' + side, '<span>' + nm + ' GOALS DONE</span><span class="qr">' + list.length + '/' + list.length + '</span>');
    setTxt('qText' + side, side === 'B' ? 'All Builder goals complete! Keep the factory humming.' : 'All Wizard goals complete! See how long you last.');
    $('qBar' + side).style.display = 'none';
    return;
  }
  const guest = Net.role === 'guest';   // (the guest only reads: the host starts, counts and completes goals)
  if (G.qbase[side] == null && !guest) G.qbase[side] = q.stat ? q.stat(G) : 0;
  const p = guest && G.qbase[side] == null ? (q.stat ? [0, q.n] : (q.prog ? q.prog(G) : null)) : UI.questProg(side, q);
  if (!guest && (q.stat ? p[0] >= p[1] : q.done(G))) { UI.questDone(side, q); return; }
  setHtml('qIcon' + side, UI.img(q.icon, 32));
  setHtml('qHead' + side, '<span>' + nm + ' GOAL ' + (i + 1) + '/' + list.length + '</span><span class="qr">' + (p ? '<em>' + Math.floor(p[0]) + '/' + p[1] + '</em>' : '') + '+' + q.xp + ' XP' + UI.giftHtml(q.gift, 16) + '</span>');
  setTxt('qText' + side, q.text);
  $('qBar' + side).style.display = p ? '' : 'none';
  if (p) $('qFill' + side).style.width = Math.min(100, p[0] / p[1] * 100) + '%';
};
UI.updateQuest = function (dt) {
  for (const side of QUEST_SIDES) UI.questSide(side);
  // pickups from a gift drop beside the Wizard one at a time, once he is alive and the game is running
  if (Net.role !== 'guest' && G.pend && G.pend.length && G.w && !G.w.dead && !UI.treeOpen.L && !UI.treeOpen.R) {
    G.pendT = (G.pendT || 0) - dt;
    if (G.pendT <= 0) { G.pendT = 0.8; WZ.dropPickup(G.pend.shift()); }
  }
};

// the next scheduled event: shows from five minutes out (the toasts at 5 min / 2 min / 30 s are in WZ.evWarn)
UI.updateEvent = function () {
  const el = $('evCard'), info = WZ.evInfo();
  const show = info && (info.active || info.left <= CFG.events.warn[0]);
  el.classList.toggle('hidden', !show);
  if (!show) { cache.ev = null; return; }
  const p = info.plan, left = info.active ? null : Math.ceil(info.left);
  const state = info.active ? 'NOW' : info.deferred ? 'DEFERRED ' + fmtTime(info.clear) : fmtTime(left);
  const sig = p.n + '|' + state + '|' + (info.active ? Math.floor(info.active.t / 5) : 0);
  if (cache.ev === sig) return;
  cache.ev = sig;
  const icon = { migration: 'ic_boot', stampede: 'ic_fast', hunt: 'ic_crown', bloom: 'ic_expand', storm: 'ic_bolt', brood: 'ic_skull' }[p.id];
  el.classList.toggle('now', !!info.active);
  el.classList.toggle('soon', !info.active && info.left <= CFG.events.warn[2]);
  el.innerHTML = UI.img(icon, 24) + '<div class="eb"><div class="eh">CYCLE ' + p.cycle + (info.active ? ' EVENT' : ' NEXT EVENT') + '</div><div class="en">' + WZ.evName(p) + '</div></div>' +
    '<div class="ef">' + (p.id === 'bloom' ? Object.keys(CFG.mutations).map(k => UI.img(CFG.mutations[k].ic, 20)) : p.el.map(k => UI.img(k, 20))).join('') + '</div><div class="et">' + state + '</div>';
};

// the drop queue (bottom left of the wilds): creatures waiting for the Spell Portal to open for them, next to drop first
// (up to 12 icons, then a count), with how many factory creatures are out there against the cap. Shows from the first Egg on.
UI.updateEggQ = function () {
  const el = $('eggQ'), q = G.fac.eggQ, alive = WZ.craftedAlive(), cap = CFG.crafted.cap, on = q.length > 0 || alive > 0 || (G.stats.crafted || 0) > 0;
  el.classList.toggle('hidden', !on);
  const sig = on ? q.join(',') + '|' + alive : '';
  if (cache.eq === sig) return;
  cache.eq = sig;
  if (!on) return;
  const show = q.length ? q.slice(0, 12).map((k, i) => UI.img(SP[ITEMS[k].creature] ? ITEMS[k].creature : k, 28, i ? '' : 'next')).join('') : '<span class="qe">' + UI.img('ic_check', 16) + '</span>';
  el.classList.toggle('full', alive >= cap);
  el.innerHTML = '<span class="qa">' + UI.img('ic_portal', 20) + '<b>' + alive + '/' + cap + '</b></span><span class="qs">' + show + '</span>' +
    (q.length > 12 ? '<span class="qn">+' + (q.length - 12) + '</span>' : '');
};

// goal pointers that live in the DOM: a blinking hotbar slot and/or blinking skill-tree buttons
UI.setHint = function (slot, treeL, treeR) {
  const sig = slot + '|' + treeL + '|' + treeR;
  if (cache.hint === sig) return;
  cache.hint = sig;
  for (const s of $('hotbar').children) s.classList.toggle('hint', s.dataset.id === (slot && UI.slotOf(slot)));
  $('btnTree').classList.toggle('hint', !!treeL); $('btnTreeR').classList.toggle('hint', !!treeR);
};

// ---------- debug overlay (F3 or `): income rates and when the next skill becomes affordable ----------
UI.debugOn = false;
UI.debugEvent = function () {
  const i = WZ.evInfo();
  if (!i) return '';
  const when = i.active ? 'RUNNING ' + fmtTime(i.active.t) : i.deferred ? 'deferred ' + fmtTime(i.clear) : 'in ' + fmtTime(Math.max(0, i.left));
  return '<div>Event: <b>' + WZ.evTitle(i.plan) + '</b> ' + when + '</div><div class="dim">Crafted alive ' + WZ.craftedAlive() + '/' + CFG.crafted.cap + '  Eggs queued ' + G.fac.eggQ.length + '  made ' + (G.stats.crafted || 0) + '  killed ' + (G.stats.craftedKills || 0) + '  events ' + (G.stats.events || 0) + '</div>';
};
// the Wizard's worn garments, the Wardrobe Shelf, open keeps, Cores and the wand (F3 overlay: * = armed, ! = ready)
UI.debugGear = function () {
  const A = G.aug, worn = AUG_SLOTS.map(s => s[1] + ' ' + (A.worn[s[0]] ? AUGS[A.worn[s[0]]].name : '-')).join(' | '), al = G.altar;
  return '<div>Worn: <b>' + worn + '</b></div><div class="dim">Stockpile ' + FA.pileList().filter(p => p.n > 0).length + '/' + FA.pileTiles().length + ' tiles  Cores ' + ELEMS.map(e => e[0].toUpperCase() + (G.stock['core_' + e] || 0)).join(' ') +
    '  Door ' + (A.door ? 'open' : 'locked') + '  Warden ' + (G.flags.warden ? 'dead' : 'alive') + '  Altar ' + (al.placed ? 'lit ' + al.lit.map(l => (l ? 'X' : '.')).join('') : G.tree.summon ? 'landing' : 'not bought') + '  Wand <b>' + ELEMS.map(e => e[0].toUpperCase() + (G.wand.full[e] ? (G.wand.armed === e ? '*' : '!') : G.wand.m[e] + '/' + CFG.wand.need[e])).join(' ') + '</b>  Feather ' + Math.ceil(A.cd.phoenix) + 's</div>';
};
UI.updateDebug = function (dt) {
  const el = $('debug');
  el.classList.toggle('hidden', !UI.debugOn);
  if (!UI.debugOn) return;
  UI.dbgT = (UI.dbgT || 0) - dt;
  if (UI.dbgT > 0) return;
  UI.dbgT = 0.25;
  if (Net.role === 'guest') { el.innerHTML = '<b>' + UI.img('ic_chart', 14) + 'NET (guest)</b>' + UI.netHtml(); return; }
  const m = Main.metrics, a = m.samples[0], b = m.samples[m.samples.length - 1];
  if (!a || b.t - a.t < 2) { el.innerHTML = '<b>DEBUG</b><div>collecting...</div>' + DevBot.html(); return; }
  const min = (b.t - a.t) / 60, xpm = (b.xp - a.xp) / min, pkm = (b.pk - a.pk) / min, bkm = (b.bk - a.bk) / min;
  const rateOf = k => ((b.banked[k] || 0) - (a.banked[k] || 0)) / min;
  // ETA per affordable-by-requirements node = the slowest of its XP and bank shortfalls at current income
  let best = null;
  for (const n of CFG.tree) {
    const c = UI.nodeCost(n);
    if (!c || UI.nodeReqs(n).length) continue;
    let eta = 0, why = 'XP';
    const need = c.xp - G.xp;
    if (need > 0) eta = xpm > 0 ? need / xpm : Infinity;
    if ((c.core || 0) > G.stock.core) { eta = Infinity; why = 'Warden Core'; }
    for (const k in c.pay) {
      const s = c.pay[k] - (G.bank[k] || 0);
      if (s <= 0) continue;
      const tk = rateOf(k) > 0 ? s / rateOf(k) : Infinity;
      if (tk > eta) { eta = tk; why = itemName(k); }
    }
    if (!best || eta < best.eta) best = { n, eta, why };
  }
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const eta = !best ? 'nothing to buy' : best.eta === 0 ? best.n.name + ': affordable now' : best.eta === Infinity ? best.n.name + ': never (no ' + best.why + ' income)' : best.n.name + ' in ' + fmtTime(best.eta * 60) + ' (' + best.why + ')';
  el.innerHTML = '<b>' + UI.img('ic_chart', 14) + 'DEBUG</b><span class="dim"> last ' + fmtTime(b.t - a.t) + '</span>' +
    '<div>XP/min <b>' + f1(xpm) + '</b></div><div>Spells made/min <b>' + f1(pkm) + '</b></div><div>Banked/min <b>' + f1(bkm) + '</b>' +
    ' <span class="dim">' + ELEMS.map(k => k[0].toUpperCase() + f1(rateOf(k))).join(' ') + '</span></div>' +
    '<div>Spell Portal <b>' + FA.rate('spell') + '/min</b>  Skill Portal <b>' + FA.rate('skill') + '/min</b></div>' +
    '<div>Next unlock: <b>' + eta + '</b></div>' + UI.debugEvent() + UI.debugGear() +
    '<div class="dim">Foes ' + G.w.enemies.length + '  working machines ' + G.fac.working + '  play ' + fmtTime(G.stats.time) + '</div>' + DevBot.html() + (Net.role ? UI.netHtml() : '');
};
UI.netHtml = function () {
  const s = Net.stats;
  return '<div>NET <b>' + Net.role + '</b> ' + Net.state + ' room <b>' + (Net.code || '-') + '</b></div><div>Snapshot <b>' + s.rawKB.toFixed(0) + ' KB</b> raw, <b>' + s.zipKB.toFixed(1) + ' KB</b> sent (max ' + s.maxZip.toFixed(1) + '), <b>' + s.fps + '</b>/s, <b>' + s.kbps + ' KB/s</b>' + (Net.role === 'guest' ? ', ping <b>' + s.rtt + ' ms</b>' : '') + '</div>';
};

// ---------- hotbar: single slots plus families (Harnessers, Crafters, Power, Logistics, Spawners) whose member cycles ----------
UI.tipT = 0; UI.tipHover = false;
const KEYLBL = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
UI.isFam = id => !!CFG.families[id];
UI.slotOf = id => { for (const f in CFG.families) if (CFG.families[f].members.indexOf(id) >= 0) return f; return id; };   // the slot a building lives in
UI.famMember = function (f) {   // the member the slot currently shows: the last one picked, else the first unlocked
  G.fam = G.fam || {};
  const ms = CFG.families[f].members;
  if (G.fam[f] && ms.indexOf(G.fam[f]) >= 0) return G.fam[f];
  return ms.find(m => FA.unlocked(m)) || ms[0];
};
UI.buildHotbar = function () {
  const box = $('hotbar');
  box.innerHTML = '';
  delete cache.hint;
  G.fam = G.fam || {};
  CFG.hotbar.forEach((id, i) => {
    const s = document.createElement('div');
    s.className = 'slot'; s.dataset.id = id;
    s.innerHTML = '<kbd>' + KEYLBL[i] + '</kbd><span class="ic"></span><span class="pips"></span><i class="lock">' + UI.img('ic_lock', 16) + '</i><i class="free">FREE</i>';
    s.onclick = () => UI.select(id);
    s.onmouseenter = () => { UI.tipHover = true; UI.showTip(id); };
    s.onmouseleave = () => { UI.tipHover = false; UI.tipT = 0.6; };
    if (UI.isFam(id)) s.addEventListener('wheel', e => { e.preventDefault(); UI.cycleFam(e.deltaY > 0 ? 1 : -1, id); UI.showTip(id); }, { passive: false });   // the wheel over a family slot cycles its member
    box.appendChild(s);
  });
  UI.updateHotbar(true);
};
UI.updateHotbar = function (force) {
  const sig = G.selected + '|' + JSON.stringify(G.tree) + '|' + JSON.stringify(G.credits) + '|' + G.demolish + '|' + JSON.stringify(G.fam);
  if (!force && cache.hot === sig) return;
  cache.hot = sig;
  for (const s of $('hotbar').children) {
    const id = s.dataset.id, fam = UI.isFam(id), cur = fam ? UI.famMember(id) : id;
    const key = cur === 'hand' ? 'ic_hand' : cur === 'belt' ? 'belt' : 'b:' + cur;
    const html = UI.img(key, key.startsWith('b:') ? 64 : 42);
    if (s.dataset.cur !== cur) { s.dataset.cur = cur; s.querySelector('.ic').innerHTML = html; }
    s.querySelector('.pips').innerHTML = fam ? CFG.families[id].members.map(m => '<b class="' + (m === cur ? 'on' : '') + (FA.unlocked(m) ? '' : ' off') + '"></b>').join('') : '';
    s.classList.toggle('sel', (fam ? CFG.families[id].members.indexOf(G.selected) >= 0 : id === G.selected) && !G.demolish);
    s.classList.toggle('locked', fam ? !CFG.families[id].members.some(m => FA.unlocked(m)) : !FA.unlocked(id));
    s.classList.toggle('credit', !!G.credits[cur]);
  }
};
UI.recipeHtml = r => { const R = CFG.recipes[r]; return '<span class="rec' + (FA.recipeOk(r) ? '' : ' off') + '">' + Object.keys(R.in).map(k => UI.img(k, 16) + (R.in[k] > 1 ? 'x' + R.in[k] : '')).join(' ') + ' > ' + UI.img(R.out, 16) + '</span>'; };
UI.showTip = function (slot) {
  const fam = UI.isFam(slot), id = fam ? UI.famMember(slot) : slot;
  let h;
  if (id === 'hand') h = '<b>Hand</b><p>Click to walk. Click a machine, pile or item to walk over and use it.</p>';
  else if (id === 'belt') h = '<b>Wooden Belt</b> <span class="cost">' + UI.img('wood', 16) + '1</span><p>Moves items one tile at a time. Click-drag to lay a line; R rotates. Belts can\'t pull from the Stockpile.</p>';
  else {
    const d = CFG.buildings[id];
    const dc = id === 'expand' ? FA.tileCost() : id === 'robot' ? FA.robotCost() : d.cost;   // a Floor Tile adds Iron after the first CFG.factory.freeIron; each robot costs more than the last
    const cost = Object.keys(dc).map(k => UI.img(k, 16) + dc[k]).join(' ');
    const list = Object.keys(CFG.recipes).filter(r => CFG.recipes[r].machine === id && !CFG.recipes[r].ally);
    const rec = list.length ? '<div class="recs">' + list.slice(0, 6).map(UI.recipeHtml).join('') + (list.length > 6 ? '<span class="rec">+' + (list.length - 6) + ' more</span>' : '') + '</div>' : '';
    const lockNode = d.unlock && CFG.tree.find(n => n.id === d.unlock);
    // a family slot also lists its members (locked ones greyed) and how to cycle them
    const strip = fam ? '<div class="fam"><span class="fn">' + CFG.families[slot].name + '</span>' + CFG.families[slot].members.map(m => '<span class="fm' + (m === id ? ' cur' : '') + (FA.unlocked(m) ? '' : ' off') + '" title="' + CFG.buildings[m].name + '">' + UI.img('b:' + m, 28) + '</span>').join('') +
      '<span class="fk"><kbd>Q</kbd>' + (IN.padList.length ? '<kbd>RT</kbd>' : '') + UI.img('ic_swap', 12) + '</span></div>' : '';
    h = strip + '<b>' + d.name + '</b> <span class="cost">' + cost + '</span>' + (FA.unlocked(id) ? '' : ' <span class="lockt">' + UI.img('ic_lock', 12) + lockNode.name + ' in the Skill Tree</span>') + (G.credits[id] ? ' <span class="freet">next one FREE</span>' : '') + '<p>' + d.desc + '</p>' + rec;
  }
  const el = $('hotTip');
  el.innerHTML = h;
  el.classList.remove('hidden');
  const idx = CFG.hotbar.indexOf(slot);
  el.style.left = Math.max(10, Math.min(CFG.HALF - 430, 18 + idx * 62 - 170)) + 'px';
  UI.tipT = 3;
};
// pick a slot (a family picks the member it currently shows) or a building (which also becomes its family's current member)
UI.select = function (id) {
  const fam = UI.isFam(id) ? id : UI.slotOf(id);
  if (UI.isFam(fam)) { G.fam = G.fam || {}; G.fam[fam] = UI.isFam(id) ? UI.famMember(id) : id; id = G.fam[fam]; }
  G.selected = id; G.demolish = false;
  UI.updateHotbar(true);
  UI.showTip(UI.isFam(fam) ? fam : id);
  AU.sfx('blip');
};
UI.cycle = function (dir) {   // the previous / next slot
  const n = CFG.hotbar.length, i = CFG.hotbar.indexOf(UI.slotOf(G.selected));
  UI.select(CFG.hotbar[((i + dir) % n + n) % n]);
};
// the next / previous unlocked member of a family (the selected building's, or the slot given); locked members are skipped
UI.cycleFam = function (dir, slot) {
  const f = slot || UI.slotOf(G.selected);
  if (!UI.isFam(f)) return;
  const ms = CFG.families[f].members.filter(m => FA.unlocked(m)), cur = UI.famMember(f);
  if (!ms.length) { AU.sfx('error'); return; }
  const i = ms.indexOf(cur), next = ms[(((i < 0 ? 0 : i) + dir) % ms.length + ms.length) % ms.length];
  G.fam[f] = next;
  if (!slot || UI.slotOf(G.selected) === f) { G.selected = next; G.demolish = false; }
  UI.updateHotbar(true);
  AU.sfx('blip');
};

// ---------- skill tree ----------
// Every node costs XP + banked spells. Spells and creatures are not in the tree (the Collection Book lists them; producing them is the gate).
const ELEM_UNLOCK = {};   // every element is available from the start
UI.nodeLevel = n => (n.tiers ? lvl(n.id) : (G.tree[n.id] ? 1 : 0));
UI.nodeMax = n => (n.tiers ? n.tiers.length : 1);
UI.nodeCost = function (n) {
  const L = UI.nodeLevel(n);
  if (L >= UI.nodeMax(n)) return null;
  if (!n.tiers) return { xp: n.xp, pay: n.pay };
  // packets per tier come from pk (the old XP basis, halved by the rebalance), split across the tier's kinds
  // tier 1 of a track is half price in packets (CFG.firstTierPay), except Tumble's ability tier (fullFirst); a track with xpFirst costs XP only at tier 1, no packets or spells at all
  const xp = n.tiers[L], kinds = n.kinds[L], pay = {}, per = Math.max(1, Math.round((n.pk ? n.pk[L] : xp) / Math.max(1, kinds.length) * (L === 0 && !n.fullFirst ? CFG.firstTierPay : 1)));
  if (!(n.xpFirst && L === 0)) kinds.forEach(k => { pay[k] = per; });
  Object.assign(pay, (n.combos && n.combos[L]) || {});
  return { xp, pay };
};
UI.nodeReqs = function (n) {   // tree ids still needed before this node (or its next tier) can be bought
  const need = (n.req || []).slice(), c = UI.nodeCost(n);
  if (c) for (const k in c.pay) { const r = ELEM_UNLOCK[k]; if (r && r !== n.id && need.indexOf(r) < 0) need.push(r); }   // spells need no node: producing them is the gate
  return need.filter(r => !G.tree[r]);
};
UI.canAfford = function (c) {
  if (G.xp < c.xp) return false;
  for (const k in c.pay) if ((G.bank[k] || 0) < c.pay[k]) return false;
  return true;
};
UI.anyAffordable = () => CFG.tree.some(n => { const c = UI.nodeCost(n); return c && !UI.nodeReqs(n).length && UI.canAfford(c); });
UI.costHtml = function (c) {
  let h = '<span class="c' + (G.xp >= c.xp ? '' : ' short') + '">' + UI.img('ic_xp', 14) + c.xp + '</span>';
  for (const k in c.pay) h += '<span class="c' + ((G.bank[k] || 0) >= c.pay[k] ? '' : ' short') + '">' + UI.img(k, 14) + c.pay[k] + '</span>';
  return h;
};
UI.treeOpen = { L: false, R: false };
UI.openTree = function (side, open) {
  if (open === undefined) open = !UI.treeOpen[side];
  const was = UI.treeOpen[side];
  UI.treeOpen[side] = open;
  if (was && !open && !UI.treeOpen.L && !UI.treeOpen.R && typeof Main !== 'undefined') Main.treeClosed();
  $(side === 'L' ? 'treeL' : 'treeR').classList.toggle('hidden', !open);
  if (was !== open) AU.sfx(open ? 'menu_open' : 'menu_close');
  if (open) { UI.renderTree(side); UI.help(false); }
  else if (UI.tipNode && UI.tipNode.side === side) UI.showNodeTip(side, null);
};
UI.nodeOf = id => CFG.tree.find(t => t.id === id);
UI.renderTree = function (side) {
  const el = $(side === 'L' ? 'treeL' : 'treeR');
  const cols = CFG.branches;   // three branches, left to right: Builder, Buildings, Wizard (spells and creatures live in the Collection Book)
  const bank = BANK_KINDS.filter(k => G.bank[k] > 0).map(k => '<span class="bk">' + UI.img(k, 16) + G.bank[k] + '</span>').join('') || '<span class="dim">empty: send spells into the Skill Portal</span>';
  let h = '<div class="treeHead"><h2>' + UI.img(side === 'L' ? 'ic_wrench' : 'ic_hat', 32) + 'SKILL TREE</h2><div class="xpbig">' + UI.img('ic_xp', 24) + Math.floor(G.xp) + '</div><button class="x" data-close="1">' + UI.img('ic_x', 16) + '</button></div>';
  const un = UI.undoKind();
  h += '<div class="bankRow">' + UI.img('ic_skill', 24) + '<span class="lbl">BANK</span>' + bank +
    (un ? '<span class="undo" data-undo="1"><kbd>Q</kbd><kbd>X</kbd>' + UI.img('ic_rotate', 14) + UI.img(un, 16) + '</span>' : '') + '</div><div class="cols">';
  cols.forEach(c => {
    h += '<div class="col"><h4>' + UI.img(c.icon, 16) + c.name + '</h4>';
    for (const n of c.nodes.map(UI.nodeOf)) {
      const L = UI.nodeLevel(n), max = UI.nodeMax(n), cost = UI.nodeCost(n), reqs = UI.nodeReqs(n);
      const cls = !cost ? 'owned' : reqs.length ? 'reqd' : UI.canAfford(cost) ? 'can' : 'cant';
      const pips = n.tiers ? '<div class="pips">' + n.tiers.map((_, i) => '<i class="' + (i < L ? 'on' : '') + '"></i>').join('') + '</div>' : '';
      const lvlTxt = n.tiers ? ' <small>' + L + '/' + max + '</small>' : '';
      let foot;
      if (!cost) foot = '<div class="nf done">' + UI.img('ic_check', 12) + (n.tiers ? 'MAXED' : 'OWNED') + '</div>';
      else if (reqs.length) foot = '<div class="nf req">' + UI.img('ic_lock', 12) + 'needs ' + reqs.map(r => CFG.tree.find(t => t.id === r).name).join(', ') + '</div>';
      else foot = '<div class="nf">' + UI.costHtml(cost) + '</div>';
      const pinned = G.pins && G.pins[side] === n.id;
      const focus = UI.padDriven[side] && UI.tfocus[side] === n.id;
      h += '<div class="node ' + cls + (pinned ? ' pinned' : '') + (focus ? ' focus' : '') + '" data-id="' + n.id + '">' + (pinned ? '<span class="pinMark">' + UI.img('ic_pin', 14) + '</span>' : '') + '<div class="ni">' + UI.img(n.icon, 32) + '</div><div class="nb"><div class="nn">' + n.name + lvlTxt + '</div>' + pips + foot + '</div></div>';
    }
    h += '</div>';
  });
  h += '</div><div class="treeInfo">Hover a skill to see what it does and its numbers now and after buying. Costs are XP plus spells banked in the Skill Portal.</div>';
  h += '<p class="hint">' + (side === 'L' ? 'T' : 'Y') + ' / Esc closes. The whole game (factory and wilds) is paused while the tree is open.' +
    (IN.padList.length ? ' <kbd>STICK</kbd> move <kbd>A</kbd> buy <kbd>RB</kbd> pin <kbd>X</kbd> undo <kbd>B</kbd> close' : '') + '</p>';
  el.innerHTML = h;
  el.querySelector('[data-close]').onclick = () => UI.openTree(side, false);
  el.querySelectorAll('.node').forEach(nd => {
    const n = CFG.tree.find(t => t.id === nd.dataset.id);
    nd.onclick = () => UI.buy(n.id);
    nd.oncontextmenu = e => { e.preventDefault(); UI.pin(side, n.id); };
    nd.onmouseenter = () => { UI.padDriven[side] = false; el.querySelectorAll('.node.focus').forEach(x => x.classList.remove('focus')); UI.showNodeTip(side, n.id); };
    nd.onmouseleave = () => UI.showNodeTip(side, null);
  });
  el.onscroll = () => UI.showNodeTip(side, UI.padDriven[side] ? UI.tfocus[side] : null);
  const ub = el.querySelector('[data-undo]');
  if (ub) ub.onclick = () => UI.undoBank();
  if (UI.tipNode && UI.tipNode.side === side) UI.showNodeTip(side, UI.tipNode.id);   // a purchase re-rendered the node under the cursor
};

// ---------- skill-tree hover card: what a node does + its numbers now and after the next purchase ----------
const fPct = v => '+' + Math.round(v * 1000) / 10 + '%';
const fSec = v => v.toFixed(2) + 's';
// one-line damage summaries for the hover card, built from CFG.spells so they never drift from WZ.cast
const SPELL_DMG = {
  flamethrower: s => s.dps + ' dmg/s in a ' + s.range + ' tile cone for ' + s.t + 's, follows his aim',
  steam: s => 'a mine: ' + s.dmg + ' dmg burst (' + s.r + ' tiles) when a foe is within ' + s.wake + ' tiles, then a slowing steam cloud for ' + s.cloud.t + 's; up to ' + s.max,
  tempest: s => 'a droplet for ' + s.life + 's, ' + s.dps + ' dmg/s, slows; up to ' + s.reach + ' tiles out, ' + s.spread + ' deg fan',
  sandstorm: s => s.dmg + ' dmg to each foe on the way out and back; catch it for a second throw (' + Math.round(s.second.dmg * 100) + '% dmg)',
  magma: s => s.dmg + ' dmg blast, a lava pool (' + s.pool.dps + ' dmg/s), ' + s.blobs + ' blobs x ' + s.blobDmg,
  mud: s => s.orbs + ' orbiting orbs for ' + s.t + 's, each a ' + s.dmg + ' dmg blast (' + s.sr + ' tiles) on the first foe it touches, -' + Math.round(s.slow * 100) + '% speed',
  meteor: s => s.dmg + ' dmg meteor (' + s.r + ' tiles), then ' + s.frags + ' homing burning boulders x ' + s.fragDmg + ' a landing',
  thunder: s => 'a bolt every ' + s.every + 's for ' + s.t + 's: ' + s.dmg + ' dmg, forks to ' + s.chain + ' more x ' + s.chainDmg,
  blizzard: s => 'icicles x ' + s.iceDmg + ' dmg, ' + s.chill + ' hits freeze a foe for ' + s.freeze + 's; ice for ' + s.frost.t + 's',
  geyser: s => s.waves + ' waves of ' + s.n + ' blasts x ' + s.dmg + ' dmg, foes thrown up (' + s.land + ' dmg landing), then slowed ' + s.slowT + 's',
  nova: s => 'pulls in from ' + s.pullR + ' tiles, zaps ' + s.r + ' tiles, then a ' + s.dmg + ' dmg burst that shoves everything out',
};
UI.nodeStats = function (n) {   // rows [label, now, next]: next undefined = a plain fact, null = maxed out
  const L = UI.nodeLevel(n), up = CFG.upgrade[n.id], nx = L < UI.nodeMax(n) ? L + 1 : null;
  const row = (label, f) => [label, f(L), nx === null ? null : f(nx)];
  switch (n.id) {
    case 'swift': return [row('Harnesser speed', l => fPct(up * l)), row('Air Pocket every', l => fSec(CFG.harness.air.cycle / (1 + up * l))), row('Water Drop every', l => fSec(CFG.harness.water.cycle / (1 + up * l)))];
    case 'manual': return [row('Hand-harnessing speed', l => fPct(up * l)), row('Taps to fill the meter', l => (CFG.manual.taps / (1 + up * l)).toFixed(1))];
    case 'belts': return [row('Belt speed', l => fPct(up * l)), row('Time per tile', l => fSec(CFG.beltTime / (1 + up * l)))];
    case 'satchel': return [row('Items carried (any mix)', l => '' + (CFG.satchel + up * l))];
    case 'zoomies': return [row('Wizard speed', l => fPct(up * l))];
    case 'hearty': return [row('Wizard max HP', l => '' + (CFG.wizard.hp + up * l))];
    case 'gems': return [row('Gem drop chance', l => 'x' + Math.pow(1 + up, l).toFixed(2)), row('Cinder Imp gem chance', l => Math.min(95, Math.round(CFG.creatures.cinder.gem[1] * 100 * Math.pow(1 + up, l))) + '%'), row('Wild Slime gem chance', l => Math.min(95, Math.round(CFG.enemies.slime.gem[1] * 100 * Math.pow(1 + up, l))) + '%')];
    case 'magnet': return [row('Pickup range', l => (CFG.world.vacuum + up * l).toFixed(2) + ' tiles'), row('Shard / Core range', l => ((CFG.world.vacuum + up * l) * 2.5).toFixed(2) + ' tiles')];
    case 'crafting': return [row('Craft time', l => '-' + Math.round(up * l * 100) + '%'), row('A 10s Forge craft takes', l => fSec(10 * (1 - up * l))), row('A 20s Nova takes', l => fSec(20 * (1 - up * l)))];
    case 'remedies': return [row('Health Potion heals', l => Math.round(CFG.pickups.potion.heal * (1 + up * l))), row('Greater Elixir heals', l => Math.round(CFG.pickups.elixir.heal * (1 + up * l)))];
    case 'wardwoven': return [row('Shield Potion armor', l => Math.round(CFG.pickups.armor.armor * (1 + up * l))), row('Greater Shield Potion armor', l => Math.round(CFG.pickups.plate.armor * (1 + up * l)))];
    case 'slippery': return [row('Roll cooldown', l => fSec(CFG.wizard.rollCd * (1 - up * l)))];
    case 'mighty': return [row('Basic spell damage', l => fPct(up * l)), row('Knockback', l => fPct(up * l)), row('Fireball damage', l => Math.round(CFG.spells.fireball.dmg * (1 + up * l))), row('Boulder damage per bounce', l => Math.round(CFG.spells.boulder.dmg * (1 + up * l)))];
    case 'harvest': return [row('Spell damage to trees, rocks, ore', l => fPct(up * l))];
    case 'forager': return [row('Foraging speed', l => fPct(up * l)), row('Taps to dig a Dirt Mound', l => (CFG.forage.mound.taps / (1 + up * l)).toFixed(1)), row('Chance of a double yield', l => Math.round(up * l * 100) + '%')];
    case 'longarm': return [row('Throw distance', l => (CFG.throwRange * (1 + up * l)).toFixed(1) + ' tiles')];
    case 'tumble': return [row('Builder roll', l => (l ? 'YES' : 'no')), row('Roll cooldown', l => (l ? fSec(CFG.builder.roll.cd * (1 - up * (l - 1))) : '--'))];
    case 'hustle': return [row('Builder move speed', l => fPct(up * l)), row('Speed', l => (CFG.builder.speed * (1 + up * l)).toFixed(2) + ' tiles/s')];
    case 'rapid': return [row('Throw cooldown', l => fSec(CFG.throwRepeat * (1 - up * l))), row('Throws per second', l => (1 / (CFG.throwRepeat * (1 - up * l))).toFixed(1))];
    case 'summon': return [['Lands', 'in the wilds beside the Wizard'], ['Takes spells', 'once the Warden is dead'], ['Lit by', 'a Single, a Pair, a Triple, the Nova'], ['Wakes the Chimera', 'with all 4 sockets lit']];
    case 'heavy': {
      const life = k => Math.round(CFG.batteryLife * k) + 's';
      return [['Battery at full load lasts', life(1)], ['Heavy Battery at full load lasts', life(1 + CFG.heavyBattery)]];
    }
  }
  const rows = [];
  for (const id in CFG.buildings) {
    const d = CFG.buildings[id];
    if (d.unlock !== n.id) continue;
    const info = Object.keys(d.cost).map(k => UI.img(k, 14) + d.cost[k]).join(' ');
    rows.push([d.name, info]);
  }
  for (const id in CFG.recipes) if (CFG.recipes[id].tier === n.id) rows.push([recipeName(id), UI.recipeHtml(id)]);
  return rows;
};
UI.nodeTipHtml = function (n) {
  const L = UI.nodeLevel(n), max = UI.nodeMax(n), cost = UI.nodeCost(n), reqs = UI.nodeReqs(n);
  const state = n.tiers ? 'TIER ' + L + '/' + max : G.tree[n.id] ? 'OWNED' : 'LOCKED';
  let h = '<div class="tth">' + UI.img(n.icon, 32) + '<div><b>' + n.name + '</b><small>' + state + '</small></div></div>';
  h += '<p>' + (n.tiers ? (n.fullFirst ? 'Tier ' + 1 + ' gives the Builder a new move. After that, each tier: ' : 'Each tier: ') + n.per + '.' : n.desc) + '</p>';
  const rows = UI.nodeStats(n);
  if (rows.length) {
    if (n.tiers) h += '<div class="ttr ttc"><span></span><em>NOW</em><em>' + (cost ? 'NEXT' : '') + '</em></div>';
    h += rows.map(r => r[2] === undefined
      ? '<div class="ttr wide"><span>' + r[0] + '</span><em>' + r[1] + '</em></div>'
      : '<div class="ttr"><span>' + r[0] + '</span><em>' + r[1] + '</em><em class="' + (r[2] === null ? 'max' : 'up') + '">' + (r[2] === null ? 'MAX' : r[2]) + '</em></div>').join('');
  }
  if (!cost) h += '<div class="ttf done">' + UI.img('ic_check', 12) + (n.tiers ? 'MAXED' : 'OWNED') + '</div>';
  else if (reqs.length) h += '<div class="ttf req">' + UI.img('ic_lock', 12) + 'Needs ' + reqs.map(r => CFG.tree.find(t => t.id === r).name).join(', ') + '</div>';
  else h += '<div class="ttf">' + UI.costHtml(cost) + '</div><div class="ttn">' + (n.tiers && L === 0 ? (n.xpFirst ? 'First tier: XP only. ' : n.fullFirst ? 'Full price: it is a new ability. ' : 'First tier: half the usual spells. ') : '') + (UI.canAfford(cost) ? 'Click to buy.' : 'Not enough yet.') + ' Right-click to pin.</div>';
  return h;
};
UI.tipNode = null;
UI.showNodeTip = function (side, id) {
  const el = $('nodeTip'), nd = id && $(side === 'L' ? 'treeL' : 'treeR').querySelector('.node[data-id="' + id + '"]');
  UI.tipNode = nd ? { side, id } : null;
  if (!nd) { el.classList.add('hidden'); SPV.stop(); return; }
  el.innerHTML = UI.nodeTipHtml(CFG.tree.find(t => t.id === id));
  el.classList.remove('hidden');
  // beside the node (in stage px), flipped to its left when it would leave this half of the screen
  const st = $('stage').getBoundingClientRect(), k = st.width / CFG.W, r = nd.getBoundingClientRect();
  const x0 = (r.left - st.left) / k, x1 = (r.right - st.left) / k, y = (r.top - st.top) / k;
  const hi = (side === 'L' ? 0 : CFG.HALF) + CFG.HALF, w = el.offsetWidth, hgt = el.offsetHeight;
  el.style.left = Math.max(8, x1 + 12 + w <= hi - 8 ? x1 + 12 : x0 - 12 - w) + 'px';
  el.style.top = Math.max(8, Math.min(CFG.H - hgt - 8, y)) + 'px';
};
UI.buy = function (id) {
  if (Net.role === 'guest') { Net.sendBuy(id); return; }   // online the guest only asks: the host checks the cost and applies it (the answer comes back as a snapshot and a buyres)
  const n = CFG.tree.find(t => t.id === id);
  if (!n) return;
  const c = UI.nodeCost(n);
  if (!c) return;
  const reqs = UI.nodeReqs(n);
  if (reqs.length) { UI.toast('Unlock ' + reqs.map(r => CFG.tree.find(t => t.id === r).name).join(', ') + ' first.', 'L', 'ic_lock'); AU.sfx('error'); return; }
  if (!UI.canAfford(c)) {
    const short = [];
    if (G.xp < c.xp) short.push(Math.ceil(c.xp - G.xp) + ' XP');
    for (const k in c.pay) if ((G.bank[k] || 0) < c.pay[k]) short.push((c.pay[k] - (G.bank[k] || 0)) + ' ' + itemName(k));

    UI.toast('Still need ' + short.join(', '), 'L', 'ic_skill'); AU.sfx('error'); return;
  }
  G.xp -= c.xp;
  for (const k in c.pay) G.bank[k] -= c.pay[k];
  G.tree[id] = n.tiers ? UI.nodeLevel(n) + 1 : true;
  AU.sfx('buy');
  const label = n.name + (n.tiers ? ' ' + G.tree[id] : '');
  UI.toast('Unlocked: ' + label, 'L', n.icon); UI.toast('Unlocked: ' + label, 'R', n.icon);
  if (id === 'hearty') G.w.hp = Math.min(WZ.maxHp(), G.w.hp + CFG.upgrade.hearty);
  FA.refreshRecipes();
  UI.refreshTrees();
  UI.updateHotbar(true);
  UI.changed();
};
// ---------- gamepad navigation: the stick / d-pad moves a focus ring between nodes, A buys, RB pins ----------
UI.tfocus = { L: null, R: null };      // focused node id per side
UI.padDriven = { L: false, R: false };  // the focus ring shows only while a pad (not the mouse) is driving
UI.treeNav = function (side, dx, dy) {
  const el = $(side === 'L' ? 'treeL' : 'treeR'), nodes = Array.from(el.querySelectorAll('.node'));
  if (!nodes.length) return;
  const cur = nodes.find(n => n.dataset.id === UI.tfocus[side]);
  let next = nodes[0];
  if (cur && (dx || dy)) {
    const cr = cur.getBoundingClientRect(), cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    let bs = 1e9; next = null;
    for (const n of nodes) {   // nearest node in that direction, favouring the same row / column
      if (n === cur) continue;
      const r = n.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = dx ? x * dx : y * dy, perp = dx ? Math.abs(y) : Math.abs(x);
      if (along < 8) continue;
      const sc = along + perp * 2.5;
      if (sc < bs) { bs = sc; next = n; }
    }
    if (!next) return;
  } else if (cur && !dx && !dy) return;
  UI.tfocus[side] = next.dataset.id; UI.padDriven[side] = true;
  el.querySelectorAll('.node.focus').forEach(x => x.classList.remove('focus'));
  next.classList.add('focus');
  next.scrollIntoView({ block: 'nearest' });
  UI.showNodeTip(side, next.dataset.id);
  AU.sfx('blip');
};
UI.treeBuy = side => { if (UI.tfocus[side]) UI.buy(UI.tfocus[side]); };
UI.treePin = side => { if (UI.tfocus[side]) UI.pin(side, UI.tfocus[side]); };

// ---------- undo a Skill Portal deposit (Q / pad X in the tree): the item drops back out beside the portal ----------
UI.undoKind = function () {
  const log = (G && G.bankLog) || [];
  for (let i = log.length - 1; i >= 0; i--) if (G.bank[log[i]] > 0) return log[i];
  return null;
};
UI.undoBank = function () {
  if (Net.role === 'guest') return;
  const k = FA.unbank();
  if (!k) { AU.sfx('error'); return; }
  AU.sfx('drop');
  for (const sd of ['L', 'R']) if (UI.treeOpen[sd]) UI.renderTree(sd);
};
// ---------- pinned nodes: either player pins one (right-click in the tree); a card shows what's left and how ----------
UI.pin = function (side, id) {
  if (Net.role === 'guest') return;
  G.pins = G.pins || { L: null, R: null };
  G.pins[side] = G.pins[side] === id ? null : id;
  AU.sfx('blip'); UI.changed();
  UI.renderTree(side); UI.pinT = 0;
};
// income over the last two minutes (the debug overlay's samples): XP/min and banked/min per kind
UI.rates = function () {
  const m = Main.metrics, a = m.samples[0], b = m.samples[m.samples.length - 1];
  if (!a || b.t - a.t < 5) return null;
  const min = (b.t - a.t) / 60;
  return { xpm: (b.xp - a.xp) / min, rateOf: k => ((b.banked[k] || 0) - (a.banked[k] || 0)) / min };
};
UI.pinHtml = function (side, id) {
  const n = CFG.tree.find(t => t.id === id), c = UI.nodeCost(n);
  let h = '<div class="clabel">' + UI.img('ic_pin', 16) + UI.img(n.icon, 16) + '<span>' + n.name + '</span></div>';
  if (!c) return h + '<div class="pa">' + UI.img('ic_check', 20) + '</div>';
  const r = UI.rates(), rows = [], f1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const add = (k, need, rate) => rows.push({ k, need, rate, t: need <= 0 ? 0 : rate > 0 ? need / rate : Infinity });
  add('ic_xp', Math.ceil(c.xp - G.xp), r ? r.xpm : 0);
  for (const k in c.pay) add(k, c.pay[k] - (G.bank[k] || 0), r ? r.rateOf(k) : 0);

  const short = rows.filter(x => x.need > 0), eta = short.reduce((a, x) => Math.max(a, x.t), 0);
  // missing amounts, each with its current income
  h += short.map(x => '<div class="pr">' + UI.img(x.k, 16) + '<b>' + x.need + '</b><i>' + (x.rate > 0 ? '+' + f1(x.rate) + '/m' : '+0') + '</i></div>').join('');
  h += '<div class="pr eta">' + UI.img('ic_clock', 16) + '<b>' + (eta === 0 ? 'NOW' : eta === Infinity ? '--' : fmtTime(eta * 60)) + '</b></div>';
  // the next physical step, as icons
  const reqs = UI.nodeReqs(n);
  let act;
  if (reqs.length) act = [UI.img('ic_lock', 16), UI.img(CFG.tree.find(t => t.id === reqs[0]).icon, 16)];
  else if (!short.length) act = [UI.img('ic_tree', 16), '<kbd>' + (side === 'L' ? 'T' : 'Y') + '</kbd>'];
  else {
    const worst = short.reduce((a, x) => (x.t > a.t ? x : a));
    if (worst.k === 'ic_xp') act = [UI.img('ic_hat', 16), UI.img('ic_skull', 16)];   // the Wizard fights for XP

    else if (ELEM[worst.k] && !G.fac.bld.some(b => b.type === 'harness' && b.done && b.el === worst.k)) act = [UI.img('b:' + worst.k, 16)];   // set a Harnesser to that element first
    else if (ITEMS[worst.k].spell && !(G.fac.bld.some(b => b.type === 'forge' && b.recipe === worst.k))) act = [UI.img('b:forge', 16), UI.img('ic_swap', 14), UI.img(worst.k, 16)];   // set a Forge to it
    else act = [UI.img(worst.k, 16), '<em>&gt;</em>', UI.img('ic_skill', 16)];   // send it into the Skill Portal
  }
  return h + '<div class="pa">' + act.join('') + '</div>';
};
// pinned blueprints (P / L3): every unfinished building with what it still needs, then the sum against the Stockpile
UI.bpHtml = function () {
  const bps = G.fac.bld.filter(b => !b.done);
  let h = '<div class="clabel">' + UI.img('ic_pin', 16) + UI.img('ic_wrench', 16) + '<span class="stat">' + bps.length + '</span></div>';
  if (!bps.length) return h + '<div class="pa">' + UI.img('ic_check', 20) + '</div>';
  const tot = {};
  for (const b of bps) {
    const need = FA.needOf(b);
    for (const k in need) tot[k] = (tot[k] || 0) + need[k];
  }
  bps.slice(0, 6).forEach(b => {
    const need = FA.needOf(b);
    h += '<div class="br">' + UI.img('b:' + b.type, 24) + (b.ready ? UI.img('ic_check', 16) : '') + Object.keys(need).map(k => '<span class="need">' + UI.img(k, 16) + '<b' + (G.stock[k] >= need[k] ? '' : ' class="short"') + '>' + need[k] + '</b></span>').join('') + '</div>';
  });
  if (bps.length > 6) h += '<div class="more">+' + (bps.length - 6) + '</div>';
  h += '<div class="tot">' + Object.keys(tot).map(k => '<span class="need">' + UI.img(k, 16) + '<b' + (G.stock[k] >= tot[k] ? '' : ' class="short"') + '>' + tot[k] + '</b></span>').join('') + '</div>';
  return h;
};
UI.pinT = 0;
UI.updatePins = function (dt) {
  UI.pinT -= dt;
  if (UI.pinT > 0) return;
  UI.pinT = 0.5;
  const bp = $('bpCard');
  bp.classList.toggle('hidden', !G.pinBp);
  if (G.pinBp) setHtml('bpCard', UI.bpHtml());
  for (const sd of ['L', 'R']) {
    const id = G.pins && G.pins[sd], el = $('pin' + sd);
    el.classList.toggle('hidden', !id);
    if (id && CFG.tree.find(t => t.id === id)) setHtml('pin' + sd, UI.pinHtml(sd, id));
  }
};
// online a tree stays open while the game runs on, so it follows the numbers it shows
UI.syncTrees = function () {
  if (!UI.treeOpen.L && !UI.treeOpen.R) return;
  const sig = G.xp + '|' + JSON.stringify(G.bank) + '|' + JSON.stringify(G.tree);
  if (sig !== UI.treeSig) { UI.treeSig = sig; UI.refreshTrees(); }
};
UI.refreshTrees = function () {
  if (UI.treeOpen.L) UI.renderTree('L');
  if (UI.treeOpen.R) UI.renderTree('R');
};

// ---------- swap ring / help ----------
UI.swapRing = function (fr) {
  const el = $('swapRing');
  if (fr === null) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  $('swapFill').style.height = Math.min(100, fr * 100) + '%';
};
UI.help = function (on) {
  if (on === undefined) on = $('help').classList.contains('hidden');
  if (on !== !$('help').classList.contains('hidden')) AU.sfx(on ? 'menu_open' : 'menu_close');
  $('help').classList.toggle('hidden', !on);
};

// ---------- results ----------
// the expedition's story in numbers (shared by the death screen and the victory screen)
UI.statsHtml = function () {
  const w = G.w, r = w.run;
  const rows = [
    ['ic_clock', 'Survived', fmtTime(w.time)], ['ic_skull', 'Kills', w.kills],
    ['ic_crown', 'Elites', r.elites], ['ic_portal', 'Deliveries', r.deliveries],
    ['ic_bolt', 'Damage', Math.round(r.dmg)], ['ic_target', 'Weak hits', r.weak],
    ['wood', 'Harvested', r.harvested], ['shard', 'Shards', r.shards],
    ['ic_flag', 'Landmarks', r.marks], ['ic_xp', 'XP earned', Math.floor(r.xp)],
    ['egg_zephyr', 'Crafted kills', G.stats.craftedKills || 0], ['ic_trophy', 'Events cleared', G.stats.events || 0],
  ];
  // best spell: the most-delivered combo, else the most-delivered basic packet
  const sp = Object.keys(r.spells).filter(k => ITEMS[k].spell || ITEMS[k].elem).sort((a, b) => (ITEMS[b].spell ? 1e6 : 0) + r.spells[b] - (ITEMS[a].spell ? 1e6 : 0) - r.spells[a])[0];
  const best = sp ? '<div class="best">' + UI.img(sp, 24) + 'Star spell: <b>' + (ELEM[sp] ? SPELLS[BASIC_SPELL[sp]] : itemName(sp)) + ' x' + r.spells[sp] + '</b></div>' : '';
  return '<div class="stats">' + rows.map(s => '<div>' + UI.img(s[0], 16) + '<span>' + s[1] + '</span><b>' + s[2] + '</b></div>').join('') + '</div>' + best;
};
// The game over screen (both players see it when the Wizard dies): each presses RESTART to ready up, and when both have the run starts again (Main.step).
// G.w.ready = { B, W } is plain data, so the other screen shows it from the snapshots. The Builder's button is the host's (or the shared screen's), the Wizard's
// the guest's online (his press is the roll button latched, the host reads it as the pad) or the shared screen's offline.
UI.showResults = function () {
  const el = $('results');
  el.innerHTML = '<div class="rIcon">' + UI.img('ic_skull', 48) + '</div><h2>GAME OVER</h2>' + UI.statsHtml() + '<p>The factory, stockpile, XP, bank and skill tree are all safe. Both players press RESTART to go again.</p>' +
    '<button class="big" id="rReB">BUILDER</button><button class="big" id="rReW">WIZARD</button><button class="big ghost" id="rTitle">TITLE</button>';
  el.classList.remove('hidden');
  UI.resSig = '';
  $('rReB').onclick = () => {
    if (Net.role === 'guest' || !G.w.dead) return;
    G.w.ready.B = !G.w.ready.B; AU.sfx(G.w.ready.B ? 'buy' : 'blip');
  };
  $('rReW').onclick = () => {
    if (Net.role === 'host' || !G.w.dead) return;
    if (Net.role === 'guest') { Net.latchPress('a'); AU.sfx('buy'); return; }   // the roll button readies him; the panel shows it when the next snapshot says so
    G.w.ready.W = !G.w.ready.W; AU.sfx(G.w.ready.W ? 'buy' : 'blip');
  };
  $('rTitle').onclick = () => { el.classList.add('hidden'); Main.toTitle(); };
  UI.resultsSync();
};
// the two RESTART buttons follow G.w.ready; the whole panel goes once the Wizard is alive again
UI.resultsSync = function () {
  const el = $('results');
  if (!el || el.classList.contains('hidden') || !G) return;
  if (!G.w.dead) { el.classList.add('hidden'); return; }
  const r = G.w.ready || {}, sig = (r.B ? 1 : 0) + '' + (r.W ? 1 : 0) + Net.role;
  if (sig === UI.resSig) return;
  UI.resSig = sig;
  const set = (id, name, on, mine) => { const b = $(id); b.textContent = name + (on ? ': READY' : mine ? ': RESTART' : ': WAITING'); b.classList.toggle('ghost', !on && !mine); b.disabled = !mine; };
  set('rReB', 'BUILDER', r.B, Net.role !== 'guest');
  set('rReW', 'WIZARD', r.W, Net.role !== 'host');
};
UI.showVictory = function () {
  if (!G) return;
  const el = $('victory'), s = G.stats;
  if (!Net.on) G.paused = true;   // (online the game cannot be stopped for one of the two)
  el.innerHTML = '<div class="panel px"><div class="rIcon">' + UI.img('ic_trophy', 64) + '</div><h2>THE CHIMERA FALLS!</h2><p class="sub2">Builder and Wizard, you did it together. You win!</p>' + UI.statsHtml() +
    '<div class="life">ALL TIME: ' + UI.img('ic_skull', 14) + s.kills + ' kills ' + UI.img('ic_portal', 14) + s.deliveries + ' deliveries ' + UI.img('ic_flag', 14) + (s.landmarks || 0) + ' landmarks ' + UI.img('ic_crown', 14) + (s.wins || 1) + ' win' + ((s.wins || 1) > 1 ? 's' : '') + ' ' + UI.img('ic_clock', 14) + fmtTime(s.time) + '</div>' +
    '<button class="big" id="vKeep">KEEP PLAYING</button><button class="big ghost" id="vTitle">SAVE &amp; TITLE</button></div>';
  el.classList.remove('hidden');
  Main.save();
  $('vKeep').onclick = () => { el.classList.add('hidden'); if (!Net.on) G.paused = false; AU.sfx('buy'); };
  $('vTitle').onclick = () => { el.classList.add('hidden'); if (!Net.on) G.paused = false; Main.toTitle(); };
};

// ---------- menu ----------
UI.show = (id, on) => $(id).classList.toggle('hidden', !on);
UI.slotInfo = function (i, useBak) {
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return undefined; } };   // undefined = unreadable
  const key = 'wands2_save_slot' + i, bak = () => { const b = read(key + '_bak'); return b && Main.saveOk(b) ? Object.assign(b, { fromBak: true }) : null; };
  if (useBak) return bak();
  const s = read(key);
  if (s === null) return null;
  if (s === undefined || (s.v >= 4 && !Main.saveOk(s))) return bak() || null;   // damaged: the last good autosave
  return s.v >= 4 ? s : { old: true };
};
const HOWTO = {
  'THE IDEA': [
    ['Two jobs, one team', 'The <b>Builder</b> (left) runs an elemental factory. The <b>Wizard</b> (right) explores the wilds but has <b>no attack of his own</b>: every spell he casts is made in the factory and sent through the <b>Spell Portal</b>.'],
    ['The loop', 'The Wizard stands near trees, rocks and ore so delivered spells smash them. Drops vacuum into him and land in the factory <b>Stockpile</b>. The Builder carries them to blueprints to grow the factory, which makes stronger spells, potions, shield potions and garments.'],
    ['Two portals', 'The <b>Spell Portal</b> sends things to the Wizard. The <b>Skill Portal</b> banks element spells and combo spells as currency for the <b>Skill Tree</b>, together with XP from kills.'],
    ['Follow the goals', 'Each player has their own goal card (Builder on the left, Wizard on the right) and the two run at the same time. Every goal pays XP, and the bigger ones add a gift: spells for the skill tree, building materials, a free Battery, potions and shield potions. A gold arrow points at where to go, and the right hotbar slot or skill-tree button blinks.'],
    ['Winning', 'Late on, storm the <b>Stronghold</b> and kill <b>the Warden</b>. Buying <b>Summoning</b> (it costs 6 Aether Shards sent into the <b>Skill Portal</b>) makes the <b>Summoning Altar</b> fall from the sky into the wilds beside the Wizard. While the Warden lives the Altar ignores every spell (words rise off it to say so). Once it is dead, the Wizard lights its four sockets by hitting it with one spell of each tier: a Single, a Pair, a Triple and the Elemental Nova (the Builder sends them; a socket stays lit for good). With all four lit, the Primal Chimera rises from the Altar when he stands by it. Beat it to win. You can keep playing afterwards.'],
  ],
  'FACTORY': [
    ['Hands', 'The Builder carries one stack (5 at first). <b>Left-click</b> (pad <b>A</b>) picks up <b>one item at a time</b>: hold it to keep grabbing. <b>Right-click</b> (pad <b>B</b>) throws one item along the dotted lead line: it aims at machines, blueprints, belts, portals or the Stockpile. Throwing is the only way to put things in. Nothing ever vanishes.'],
    ['Building', 'Pick a slot (keys <b>1</b> to <b>8</b> or the wheel; slot 8 is Floor Tiles). Slots with a pip row are <b>families</b> (Crafters, Power, Logistics, Creature Spawners): <b>Q</b>, the wheel over the slot or <b>RT</b> on a pad cycles the member (locked ones are skipped). <b>R</b> rotates its output arrow, click a tile to drop a blueprint, then throw Wood, Stone and Iron Ore at it. Demolish (<b>B</b>) always refunds 100%.'],
    ['Machines', 'The <b>Harnesser</b> carries one of four element crystals: <b>F</b> (<b>LT + X</b> on a pad) switches it to the next element at any time. The old crystal bursts, the new one grows for 7.5 seconds, then the Harnesser shakes and starts making spells (nothing is made while it grows, and switching again restarts the 15 seconds). Every building shows what it holds as real items stacked on it: inputs, what it has made, a blueprint materials (faint copies = still missing), Battery fuel. Harnessers make spells by themselves, or stand next to one and press <b>E</b>, then <b>keep tapping E</b> to fill the meter and crank one out by hand (it never fills by itself; no power needed; <b>right-click</b> or pad <b>B</b> stops). Machines push out of their arrow side: onto a belt, into another machine or into a portal.'],
    ['Power', 'Harnessers (Air too) and the Forge use power. The factory starts with one charged <b>Battery</b> just south of the Stockpile. A Battery is a building: it gives +10 power while it has charge and drains by itself while anything needs power. To refill it, throw element spells, Wood or Stone at it (or belt them in): it burns them into charge, more kinds at once = faster (hand-gathered spells are free). Every spell charges 10% more than its base, and a spell you throw in by hand adds another 20%. Build more Batteries like any building (place the blueprint, throw its materials at it). A charged Battery right beside a <b>Forge</b> or <b>Cauldron</b> overdrives it: <b>+15%</b> crafting speed. Late on, the <b>Heavy Batteries</b> node unlocks the <b>Heavy Battery</b>, which drains slower so its charge lasts 50% longer.'],
    ['Creatures', 'The <b>Creature Spawner</b> turns element spells into <b>Eggs</b>. Send an Egg through the <b>Spell Portal</b> and the creature drops in beside the Wizard (inside his view, dazed for a moment) for him to fight and earn XP gems. Zephyr Wisps (Air) are hatching from the very start. There is only one Spawner and nothing to unlock: feed it ONE thing at a time. An element spell hatches the basic creature of its element. A forged combo spell hatches the pair or triple creature of its elements: Flamethrower (Cinder Phoenix), Tempest Tear (Thunderhead), Magma Bomb (Lava Golem), Mud Shield (Swamp Shambler), Meteor Shower (Ember Dragon), Thunderstorm (Storm Leviathan), Geyser Eruption (Kiln Titan). Steam Mine, Gale Boomerang and Blizzard are no seeds: the Spawner bounces them back. <b>Allies:</b> throw an Element <b>Core</b> (by hand) at an idle Spawner and it grows a <b>friendly</b> version of the creature instead: Gale = Zephyr Wisp, Tide = Puddle Slime, Ember = Cinder Imp, Stone = Pebble Golem. While it grows, throw a Core of a different element to make it the pair creature, then a third for the triple (each Core adds growing time). A Core thrown at a hostile grow, a repeated element, a mix with no creature, a fourth Core, or a spell during an ally grow all bounce back. Send the green-tinted Egg through the Spell Portal: the ally hatches 2-4 tiles from the Wizard with double health and half damage, and hostiles go for it before him. Up to 10 allies, 3 eggs waiting; a spent ally pays nothing. A small icon shows which creature it is hatching; when one dies it sometimes gives back what it was hatched from. At most 25 factory creatures live at once: extra Eggs wait beside the portal. Every creature is in the <b>Collection Book</b> (C) with a live demo. Creatures are weak to the cycle <b>Fire &lt; Water &lt; Earth &lt; Air &lt; Fire</b> (the first element in their name), so practise on them with the right spells.'],
    ['Growing', 'The floor starts small (12 x 9). Place <b>Floor Tiles</b> (slot 8) on empty ground beside it and throw them Wood and Stone (and Iron after the 28th) to turn them into floor. A floor tile holds <b>5</b> loose items; more bounce on to the next tile.'],
    ['Stockpile', 'The <b>Stockpile</b> is a real inventory: it starts as 3 x 2 wooden tiles, and every tile holds <b>50 of ONE kind</b> (Wood, Stone, Iron, Shards, Cores, the Warden Key, element spells, garments). Slot 8 swaps (<b>Q</b>) to the <b>Stockpile Tile</b> (4 Wood, 2 Stone, 1 Iron), placed on an empty floor tile. When the Stockpile has no room for something, the Wizard cannot send it home: the portal over his head spits it back out. <b>Demolish</b> takes a building first; on an empty tile it lifts the Stockpile tile (back to floor) or the floor tile itself, refunded, and whatever lay there bounces to the next tile with room. When the whole factory is full the extras go through the Spell Portal into the wilds.'],
    ['Spells', 'Spells need no unlocking: a pair is the two element spells fused at an Elemental Forge, a triple needs its two parent pairs to have been made once, and the Nova needs all four triples. The <b>Collection Book</b> (button beside the Skill Tree, or <b>C</b>) lists every spell and creature with a live demo, its recipe and its numbers.'],
    ['Logistics', 'Belts already merge: any belt can feed into another. The <b>Splitter</b> routes what comes in to up to 3 outputs: every side that has a belt, machine or portal to feed (the side items arrive from is the input). Click it (<b>A</b> on a pad) to share the outputs out by percentage with a slider, and switch element toggles on an output to make it a <b>filter</b> (Fire + Earth left, Water + Air right). The starting Splitter sends 25% to the Spell Portal and 75% to the Spawner. The <b>Storage Crate</b> holds any number of one kind of element spell or Egg and feeds them out of its arrow. E turns a Crate.'],
    ['Reading the floor', 'Every machine shows its state the moment it changes, with an outline, an icon, how fast it animates and a little chirp: <b>green flowing dashes</b> working (up close), <b>yellow dashes</b> + a ghost of the missing ingredient, <b>grey dots</b> + <b>?</b> starved, <b>orange long dashes</b> + <b>!</b> output jammed, <b>thick red</b> + stacked bars output full (stopped), <b>purple dash-dot</b> + bolt no power. Each portal shows how many items it took in the last minute.'],
    ['Elements', 'Each element has its own shape everywhere: <b>Air</b> is a ring, <b>Water</b> a drop, <b>Fire</b> a flame, <b>Earth</b> a block. Their particles move differently too (swirling rings, falling drops, rising sparks, tumbling chunks) and each has its own little sound.'],
    ['Handling lots of items', 'Hold pick to sweep up every matching item nearby until your hands are full. <b>Shift + right-click</b> (pad <b>LT + B</b>) throws your whole stack. Items left on the floor slide together into piles. The throw line shows a ghost where the item will land and outlines what will catch it (green) or bounce it (red).'],
    ['Picking targets on a pad', 'Flick the <b>right stick</b> (or click it; <b>Tab</b> on a keyboard) to cycle through nearby targets: with something in hand, the machines, belts and portals that will take it, best first; empty-handed, what you can pick up or use. The chosen one gets cyan brackets.'],
  ],
  'RECIPES': null,
  'WILDS': [
    ['Terrain', 'Grass, dirt, sand and paths are normal speed. <b>Bog</b> (dark olive, reeds) slows everyone down. <b>Water</b> can\'t be crossed at all, except by the paths that bridge it. Monsters never spawn in water.'],
    ['XP gems', 'XP comes only as <b>gems</b>: each kill has a chance to drop one (1 gem = 1 XP; crafted pairs and triples always drop some, elites always drop 3). Gems lying close together merge into one <b>Big Gem</b>. <b>Gem Wisdom</b> raises the drop chances, <b>Loot Magnet</b> widens the pickup range.'],
    ['Events', 'Every 10 to 15 minutes of play something happens in the wilds: a <b>Migration</b>, a <b>Stampede</b>, an <b>Elite Hunt</b>, a <b>Mutation Bloom</b>, a <b>Portal Storm</b> or the <b>Chimera\'s Brood</b>, then the cycle starts again, harder. The card under the goal shows what and when from five minutes out, with the elements to stock up on; toasts warn at 5 min, 2 min and 30 s. Clearing one showers XP gems (and a Shard from Cycle 2). Nothing starts while the Chimera is out.'],
    ['The Stronghold', 'One far-off keep, marked on the map. Walk near it to <b>scout</b> it: its guards, <b>the Warden</b> and what the Warden is weak to show up. The keep has a <b>two-step door</b>. First its approach terrain (an island in a lake, scorched ground, a ring of cracked rock or a broken bridge over a chasm, depending on its element), which one garment opens. Then the <b>Warden Key</b>: the Builder forges it at the Armory from 3 Cores of every element, 3 Iron Ore and 3 Aether Shards, and sends it through the Spell Portal while the Wizard stands near the keep. It sails down onto the door and opens it for good (the Portal bounces it back if the Wizard is too far away). Kill the Warden and the guards: lots of Aether Shards and Cores, the Wizard <b>glows</b> for good and gets the <b>held-spell slot</b>, and the <b>Summoning Altar</b> starts taking spells.'],
    ['Augments', 'The Wizard\'s own gear. <b>Augments</b> are garments in four slots (Hat, Robe, Boots, Charm) that give him a new <b>verb</b>, never a number: <b>Tide-Walking Boots</b> walk on water, the <b>Emberward Cloak</b> crosses scorched ground, the <b>Stonefist Charm</b> lets a Gust shove boulders and crack rock open, the <b>Gale Circlet</b> turns the roll into a blink across gaps. The <b>Bogwalker Shroud</b>, <b>Phoenix Feather</b>, <b>Static Cloak</b> and <b>Kilnsight Mask</b> mix two or three elements. The Wizard does not find them: the <b>Builder forges them at the Armory</b> from <b>Cores</b> (Stone, Tide, Ember and Gale Cores dropped by the creatures of that element: rare from normal kills, more from pairs and triples, a sure chunk from elites) plus Iron Ore and an Aether Shard. Cores fly home to the Stockpile like shards; the Collection Book\'s Wardrobe page shows every recipe and where each Core comes from. A finished garment goes through the Spell Portal and drops into the wilds like a creature: the Wizard puts it on by <b>walking onto it</b>. The garment he was wearing pops off and flies home to the <b>Stockpile</b> (a tile of its own), where the Builder can take it and send it back whenever they want to swap.'],
    ['Pickups', 'Potions and Shield Potions sent through the Spell Portal fall beside the Wizard. Walk over them to use them. They wait if HP or shield is already full.'],
    ['Weaknesses', 'Biome monsters take <b>double damage</b> from one element and half from another: <b>Ember Imps</b> (sand, dirt) hate Water, <b>Bog Lurkers</b> hate Fire, <b>Gale Wisps</b> (far meadows) hate Earth, <b>Stone Golems</b> (far dark woods) hate Air. Combo spells count every element in them. A small diamond over a foe shows its weakness, and yellow numbers with a ! mean a weak hit.'],
    ['Elites', 'Big gold-ringed monsters with a crown. Much tougher, but they drop <b>Aether Shards</b> and lots of XP. Each one is weak to one element.'],
    ['Landmarks', 'The map (bottom right) shows them. <b>Monster Camps</b> (red) wake when the Wizard walks up: clear them. <b>Crypts</b> (purple) open if he waits at the door, and their Guardian must fall. Both pay Aether Shards, the rare resource for the Summoning Altar. <b>Shrines</b> (element colours) want <b>three Cores</b>, one of each element the Shrine does NOT belong to (an Air Shrine takes Water, Fire and Earth): creatures of those elements drop them now and then (elites always do). Stand near the Shrine and have the Builder send the Cores through the Spell Portal one by one: each sails down onto the Shrine, and the third claims the Shard. A claimed Shrine does nothing until the Wizard <b>wakes</b> it: stand beside it and press <b>Mash</b>, then press Mash again each time a closing ring passes through its target zone, three times (a miss only restarts that ring; walking away cancels it). Awake, it speeds up that element\'s Harnessers by 25% for <b>30 seconds</b>, wherever the Wizard goes, then recharges for <b>2 minutes</b> (it visibly refills). Standing on a Shrine gives nothing, and Shrines never charge the wand.'],
    ['Foraging', '<b>Dirt Mounds</b>, <b>Stick Piles</b> and <b>Berry Bushes</b> are scattered everywhere. Stand at one and <b>mash the Mash button</b> (pad <b>X</b>, left-click, <kbd>/</kbd> on a shared keyboard) to dig out Stone (sometimes Iron Ore) or Wood, or shake a Health Potion or Armor Plate out of a bush. Mash is its own button: the roll never digs. They grow back after a while. Wearing the Kilnsight Mask also shows <b>buried caches</b> glinting in the grass: dig those the same way.'],
    ['The Wand', 'The Wizard\'s staff holds <b>four wand attacks</b>, one per element, and they are charged by <b>the spells the Builder sends</b>: every spell adds one tick to each element it carries (a Gust ticks Air, a Flamethrower Air and Fire, the Nova all four). A slot is READY after <b>8 Air, 7 Water, 6 Fire or 5 Earth</b> ticks and holds exactly one attack (ticks for a full slot are lost). The four slots sit under his health bar. <b>Cycle</b> (pad <b>Y</b>) picks which ready slot is armed; <b>Cast</b> (pad <b>B</b>) fires it. <b>Flame Trail</b> (Fire): +15% speed for 3 seconds and a trail of fire that burns for 5 seconds. <b>Vanishing Puff</b> (Air): a burst of air that shoves and hurts, then for 4 seconds nothing hostile can target him (mashing or casting ends it early). <b>Riding Wave</b> (Water): he rides a wave in a straight line, about 8 tiles in a second, parting foes to the sides; it stops dead at walls and water. <b>Statue</b> (Earth): 4 seconds of stone, slower but taking only 30% damage, then it bursts, harder for every hit he took.'],
    ['Dodging', 'The roll (<b>Dodge</b>: pad <b>A</b>, <kbd>Space</kbd>, <kbd>.</kbd>) makes the Wizard <b>invulnerable</b> while he flickers white. A hit he rolls through pops <b>DODGE!</b>.'],
    ['The Primal Chimera', 'The boss. It only takes real damage from its current weakness (shown on the boss bar and its glowing belly), and the weakness changes every quarter of its health, so the factory has to switch what it sends. Roll or walk out of the pink slam marks and dodge its orbs.'],
  ],
  'CONTROLS': [
    ['Builder: keyboard & mouse', '<kbd>WASD</kbd> walk, <kbd>left-click</kbd> pick up one (hold to repeat; walks there first), <kbd>right-click</kbd> throw along the lead line (hold = rapid), <kbd>E</kbd> use: gather, crank, rotate, switch recipe, <kbd>1</kbd>-<kbd>7</kbd> or wheel: slot, <kbd>Q</kbd> (or wheel over a family slot): next member of the slot, <kbd>R</kbd> rotate, click: place (with a building selected), drag belts, <kbd>B</kbd> demolish, <kbd>Enter</kbd> place in front, <kbd>T</kbd> skill tree (in it: right-click a skill to pin it, <kbd>Q</kbd> takes the last deposit back out), <kbd>Tab</kbd> cycle targets, <kbd>Shift</kbd>+<kbd>right-click</kbd> throw the whole stack, <kbd>H</kbd> controls card, <kbd>F3</kbd> or <kbd>`</kbd> debug numbers.'],
    ['Wizard: keyboard', 'Four buttons, always separate: <b>Cycle</b> the wand, <b>Cast</b> it, <b>Dodge</b> (the invulnerable roll), <b>Mash</b> (dig, wake a shrine). Alone on the keyboard: <kbd>WASD</kbd> or arrows walk, <kbd>Q</kbd> Cycle, <kbd>right-click</kbd> Cast, <kbd>Space</kbd> Dodge, <kbd>left-click</kbd> Mash, <kbd>Y</kbd> skill tree. Sharing the keyboard (arrows side): <kbd>M</kbd> Cycle, <kbd>,</kbd> Cast, <kbd>.</kbd> Dodge, <kbd>/</kbd> Mash. Walk onto a garment the Builder sends to wear it.'],
    ['Swap jobs', 'Hold <kbd>X</kbd> (or Start on a pad) for 1.5s. Then arrows + <kbd>.</kbd> use / <kbd>,</kbd> throw drive the Builder, and WASD + <kbd>Space</kbd> Dodge, <kbd>E</kbd> or left-click Mash, <kbd>Z</kbd> or right-click Cast, <kbd>V</kbd> Cycle drive the Wizard.'],
    ['Gamepads', 'The Builder pad: stick move, A pick up (hold to sweep; with a building selected: place in front; hold with Belt to lay belts), B throw (LT + B: whole stack), X use, right stick cycle targets, X in the tree: undo the last deposit, LB/RB slot, RT next member of a family slot, Back demolish, L3 pin blueprints, Y tree. The Wizard pad: stick move, right stick aim a Tempest Tear, A dodge, X mash, B cast the wand, Y cycle the wand, Back / Select tree. Hold Start to swap. (Which controller plays which job is chosen on the player screen before each game.)'],
  ],
};
// volume sliders for the pause menu (the front door has its own: the volume staircases in the menu world)
UI.settingsPage = function (box, back) {
  const s = AU.settings, row = (k, icon, label) => '<label>' + UI.img(icon, 24) + label + ' <b>' + Math.round(s[k] * 100) + '%</b><input data-k="' + k + '" type="range" min="0" max="100" value="' + Math.round(s[k] * 100) + '"></label>';
  box.classList.remove('wideCtl');
  box.innerHTML = '<h2>SETTINGS</h2>' + row('sfx', 'ic_sound', 'SOUND') + row('music', 'ic_music', 'MUSIC') +
    '<label title="Online only: how big your partner\'s world is in the corner of your screen. 0% hides it. Only you see this setting.">' + UI.img('ic_portal', 24) + 'PARTNER VIEW <b>' + (s.pip ? s.pip + '%' : 'OFF') + '</b><input data-k="pip" type="range" min="0" max="45" value="' + s.pip + '"></label>' +
    '<button class="big ghost ap">' + UI.img('ic_hand', 20) + 'AUTO-PICKUP: ' + (G && G.autoPick ? 'ON' : 'OFF') + '</button>' +
    '<button class="big ghost ctl">' + UI.img('ic_pad', 20) + 'CONTROLS</button><button class="big ghost back">BACK</button>';
  box.querySelectorAll('input').forEach(inp => {
    inp.oninput = () => {
      if (inp.dataset.k === 'pip') { AU.setPip(+inp.value); inp.previousElementSibling.textContent = +inp.value ? inp.value + '%' : 'OFF'; return; }
      (inp.dataset.k === 'sfx' ? AU.setSfx : AU.setMusic)(inp.value / 100); inp.previousElementSibling.textContent = inp.value + '%';
    };
  });
  box.querySelector('[data-k="sfx"]').onchange = () => AU.sfx('pickup');
  box.querySelector('.ap').onclick = e => { Main.toggleAutoPick(); e.currentTarget.lastChild.textContent = 'AUTO-PICKUP: ' + (G.autoPick ? 'ON' : 'OFF'); };
  box.querySelector('.ctl').onclick = () => { AU.sfx('blip'); UI.controlsPage(box, () => UI.settingsPage(box, back)); };
  box.querySelector('.back').onclick = back;
};

// Settings > Controls: every binding in the game (kept next to Main.controls / IN.pollPads: change one, change the other)
const K = (...a) => a.map(x => '<kbd>' + x + '</kbd>').join(' ');
const CONTROLS = [
  ['BUILDER: KEYBOARD & MOUSE', [
    [K('W', 'A', 'S', 'D'), 'Walk'],
    [K('LEFT-CLICK'), 'Pick up one item (hold to keep taking, it walks there first). On a Splitter: open its settings'],
    [K('RIGHT-CLICK'), 'Throw one item along the dotted line (hold = rapid). While hand-gathering: cancel the gather'],
    [K('SHIFT') + ' + ' + K('RIGHT-CLICK'), 'Throw the whole stack'],
    [K('SPACE') + ' &nbsp;/&nbsp; pad LT + A', 'Builder roll (the Tumble skill, BUILDER branch of the tree): a quick somersault along the way he walks. With a swapped keyboard it is Right Shift'],
    [K('E'), 'Use: hand-gather a Harnesser (tap again and again to fill the meter), turn a belt or machine, switch recipe'],
    [K('F') + ' &nbsp;(' + K('SHIFT') + ' + ' + K('F') + ' = back)', 'Switch the element of the Harnesser in reach (the new crystal grows for 7.5 seconds)'],
    [K('SHIFT') + ' + ' + K('E') + ' (hold) &nbsp;/&nbsp; pad LT + RB (hold)', 'Move a finished building: it lifts after a moment, the ghost follows you, let go to set it down (R turns its output, right-click / B cancels)'],
    [K('G') + ' &nbsp;/&nbsp; pad LT + Y', 'Auto-pickup on / off (off by default): loose items that settle within a tile of you hop into your hands'],
    [K('1') + ' - ' + K('9') + ' &nbsp;or&nbsp; ' + K('WHEEL'), 'Pick a hotbar slot (Hand, Belt, the building families, Floor Tiles, then the Helper Robot)'],
    [K('[') + ' ' + K(']'), 'Previous / next hotbar slot'],
    [K('Q') + ' &nbsp;(' + K('SHIFT') + ' back)', 'Next member of a family slot (or the wheel over the slot)'],
    [K('R'), 'Turn the belt or building under the cursor (in front of you on a pad: X), or the one you are about to place. A Splitter never needs turning: it finds its input and outputs itself'],
    [K('CLICK') + ' &nbsp;/&nbsp; ' + K('ENTER'), 'Place the selected building / belt (Enter: on the tile in front). Drag to lay belts'],
    [K('B') + ' &nbsp;/&nbsp; ' + K('DELETE'), 'Demolish mode (full refund)'],
    [K('P') + ' &nbsp;/&nbsp; pad L3 (left stick click)', 'Pin blueprints: a card on the Builder side lists what every unfinished building still needs (red = the Stockpile is short)'],
    [K('TAB') + ' &nbsp;(' + K('SHIFT') + ' back)', 'Cycle through nearby targets'],
    [K('ESC'), 'Close / cancel the tool, then pause'],
  ]],
  ['WIZARD: KEYBOARD', [
    [K('ARROWS') + ' &nbsp;or&nbsp; ' + K('WASD'), 'Walk (alone on the keyboard either; sharing it the Wizard has the arrows)'],
    ['Wizard pad: right stick', 'Aim the Tempest Tear droplets (tilt = how far out, up to 6 tiles); with no keyboard stick they aim the way the Wizard faces'],
    [K('SPACE') + ' &nbsp;/&nbsp; ' + K('.'), 'DODGE: the roll (invulnerable); with the Gale Circlet it is a short blink. Sharing the keyboard: ' + K('.')],
    [K('LEFT-CLICK') + ' &nbsp;/&nbsp; ' + K('/'), 'MASH: dig a mound, stick pile, bush or buried cache; wake a claimed shrine (press again as its ring closes). Mash is never the roll. Sharing the keyboard: ' + K('/')],
    [K('RIGHT-CLICK') + ' &nbsp;/&nbsp; ' + K(','), 'CAST the armed wand attack (it needs a ready slot). Sharing the keyboard: ' + K(',')],
    [K('Q') + ' &nbsp;/&nbsp; ' + K('M'), 'CYCLE the wand: the next ready slot becomes the armed one (a slot that just filled is armed at once). Sharing the keyboard: ' + K('M')],
    [K('Y'), 'Wizard Skill Tree'],
  ]],
  ['PLAYER SELECT (before each game)', [
    [K('LEFT') + ' ' + K('RIGHT') + ' &nbsp;or stick', 'Move your controller to the Builder side, the middle (the keyboard then plays any job nobody else has) or the Wizard side'],
    [K('ENTER') + ' &nbsp;/&nbsp; ' + K('A'), 'Next step; then up / down picks a row and left / right tries a cosmetic on. Enter / A again = ready'],
    [K('ESC') + ' &nbsp;/&nbsp; ' + K('B'), 'Back'],
    ['Cosmetics', 'Unlocked by achievements (see the ACHIEVEMENTS button). They never change how the game plays'],
  ]],
  ['ONLINE (the guest is the Wizard)', [
    [K('W', 'A', 'S', 'D'), 'Guest: walk'],
    [K('SPACE'), 'Guest: dodge roll (invulnerable)'],
    [K('LEFT-CLICK'), 'Guest: mash (dig a mound, pile, bush or cache; wake a shrine)'],
    [K('RIGHT-CLICK') + ' ' + K('Q'), 'Guest: cast the armed wand attack / cycle the wand'],
    [K('N'), 'Guest: emote wheel (WASD picks a dance, N or left-click does it)'],
    [K('T'), 'Guest: skill tree (a purchase is sent to the host, who checks it). Nothing pauses online: a tree or menu only holds its own player still'],
    ['Gamepad', 'A pad works as on the Wizard side (A dodge, X mash, B cast, Y cycle, Back / Select tree). Job swap is off online'],
    ['Settings > PARTNER VIEW', 'How big the other player\'s world is in your corner, 0% (off) to 45%. Only you see it'],
  ]],
  ['BOTH PLAYERS', [
    [K('C'), 'Collection Book: every spell and creature, with live demos (also on the pause menu)'],
    [K('T') + ' &nbsp;/&nbsp; ' + K('Y'), 'Builder / Wizard Skill Tree (the whole game pauses while one is open)'],
    [K('H'), 'Show or hide the controls card'],
    [K('X') + ' &nbsp;hold 1.5s', 'Swap jobs. Then: Builder arrows, ' + K('.') + ' pick up, ' + K(',') + ' throw, ' + K('/') + ' use. Wizard WASD + mouse: ' + K('SPACE') + ' dodge, ' + K('E') + ' / left-click mash, ' + K('Z') + ' / right-click cast, ' + K('V') + ' cycle'],
    [K('N'), 'Wizard: emote wheel. Move to pick Float (up), Blaze (right), Rain (down) or Stomp (left), then N or Mash. He dances until he moves'],
    [K('ESC'), 'Pause menu (Resume, Settings, Save &amp; Title). Losing window focus pauses too'],
  ]],
  ['SKILL TREE', [
    [K('CLICK'), 'Buy a skill (or A on a pad)'],
    [K('RIGHT-CLICK'), 'Pin a skill to that side (RB on a pad)'],
    [K('Q'), 'Take the last Skill Portal deposit back out (pad X)'],
    [K('ESC') + ' ' + K('T') + ' ' + K('Y'), 'Close (pad B; the Wizard pad\'s Back / Select also opens and closes his tree)'],
  ]],
  ['SPLITTER SETTINGS', [
    [K('DRAG'), 'Slide a bar: each output\'s share (colours match the arrows on the tile). With 3 outputs the other two make up the rest, so it is always 100'],
    [K('W') + ' ' + K('S') + ' &nbsp;or stick / d-pad', 'Pick an output'],
    [K('A') + ' ' + K('D') + ' &nbsp;or stick / d-pad', 'Nudge its share by 5'],
    [K('1') + ' - ' + K('4'), 'Only Air / Water / Fire / Earth for this output (pad: X moves the cursor, Y toggles). What no output asks for is shared by the outputs without filters'],
    [K('E') + ' ' + K('ESC'), 'Close (pad A or B). RESET puts the shares back to even and clears the filters'],
  ]],
  ['GAMEPAD: BUILDER', [
    [K('STICK') + ' ' + K('D-PAD'), 'Walk'],
    [K('A'), 'Pick up (hold to sweep). With a building selected: place in front (hold with Belt to lay belts)'],
    [K('B') + ' &nbsp;/&nbsp; ' + K('LT') + ' + ' + K('B'), 'Throw (hold = rapid) / throw the whole stack. Cancels hand-gathering'],
    [K('X'), 'Use'],
    [K('LT') + ' + ' + K('X'), 'Switch the element of the Harnesser in reach'],
    [K('LT') + ' + ' + K('A'), 'Builder roll (the Tumble skill in the tree)'],
    [K('RIGHT STICK') + ' &nbsp;or ' + K('R3'), 'Flick to cycle targets'],
    [K('LB') + ' ' + K('RB'), 'Previous / next hotbar slot'],
    [K('RT'), 'Next member of a family slot'],
    [K('BACK'), 'Demolish mode'],
    [K('Y'), 'Builder Skill Tree (stick / d-pad moves the focus, A buys, RB pins, X undoes, B closes)'],
  ]],
  ['GAMEPAD: WIZARD', [
    [K('STICK') + ' ' + K('D-PAD'), 'Walk'],
    [K('A'), 'Dodge: the roll (blink with the Gale Circlet)'],
    [K('X'), 'Mash: dig, wake a shrine'],
    [K('B'), 'Cast the armed wand attack'],
    [K('Y'), 'Cycle the wand (the next ready slot)'],
    [K('BACK'), 'Wizard Skill Tree'],
    [K('START') + ' &nbsp;hold', 'Swap jobs (either pad)'],
  ]],
  ['DEBUG (for now)', [
    [K('F3') + ' &nbsp;or&nbsp; ' + K('`'), 'Toggle the debug overlay: XP and spells per minute, bank and portal rates, time to the next affordable skill, the next event, creature counts'],
    [K('F4') + ' &nbsp;with the overlay open', 'Dev bot: plays the Wizard (a virtual controller) so one person can test the factory solo. Press again to turn it off'],
    [K('F2') + ' &nbsp;with the overlay open', 'Snapshot photo test (dev-only): captures the game state as plain JSON, redraws a frame from that copy alone and reports every leak. Press again to cycle LIVE / SNAPSHOT / BLINK / DIFF (the game is frozen while a view is up), Esc leaves. The SNAPSHOT bar under the overlay also has SAVE (downloads the JSON)'],
    [K('F12') + ' &nbsp;console', 'In the browser console, <code>__wands</code> is the test hook:'],
    ['<code>__wands.start(slot)</code>', 'Start a new game in slot 1-3'],
    ['<code>__wands.deliver(kind)</code>', 'Send an item through the Spell Portal, e.g. <code>"fire"</code>'],
    ['<code>__wands.bank(kind, n)</code>', 'Bank n of an item in the Skill Portal'],
    ['<code>__wands.egg(kind)</code>', 'Deliver an Egg, e.g. <code>"egg_zephyr"</code>'],
    ['<code>__wands.bot("wizard")</code>', 'Dev bot on (<code>null</code> = off); <code>__wands.step</code> then plays the Wizard too'],
    ['<code>__wands.snapshot()</code>', 'Photo test: returns the snapshot object (<code>.G</code> = the state, <code>.issues</code> = what cannot survive JSON, <code>.leaks</code> = what the renderers reached for); <code>__wands.Snap.report</code> has the verdict and pixel diff; <code>__wands.snapView("blink")</code> shows the frames (<code>"off"</code> resumes)'],
    ['<code>__wands.boss()</code>', 'Summon the Primal Chimera now'],
    ['<code>__wands.event(n)</code>', 'Make event n start in 5 seconds (1-6 first cycle, 7 = Cycle 2 Migration...)'],
    ['<code>__wands.step(dt, n)</code>', 'Run n simulation steps of dt seconds'],
    ['<code>__wands.G / FA / WZ / UI / R / CFG</code>', 'The live game state and modules, for poking at numbers'],
    ['<code>node tools/devtool/server.mjs</code>', 'The dev tool (port 8090): layout, variables, formulas and audio tabs over a live preview'],
  ]],
];
UI.controlsPage = function (box, back) {
  box.classList.add('wideCtl');
  const sec = ([title, rows]) => '<div class="ctlSec' + (title.startsWith('DEBUG') ? ' dbg wide' : '') + '"><h3>' + title + '</h3>' +
    rows.map(r => '<div class="ctlRow"><div class="k">' + r[0] + '</div><div>' + r[1] + '</div></div>').join('') + '</div>';
  box.innerHTML = '<h2>CONTROLS</h2><div class="ctlBody">' + CONTROLS.map(sec).join('') + '</div><button class="big ghost back">BACK</button>';
  box.querySelector('.back').onclick = back;
};
// ---------- Splitter settings: one slider, the pink side on its left and the cyan side on its right ----------
UI.askB = null;
UI.askDemolish = function (x, y, name) {
  UI.askB = { x, y };
  $('askName').textContent = name.toUpperCase();
  $('askModal').classList.remove('hidden');
  AU.sfx('error');
};
UI.askClose = function (yes) {
  const a = UI.askB;
  if (!a) return;
  UI.askB = null;
  $('askModal').classList.add('hidden');
  if (yes) FA.demolish(a.x, a.y, true); else AU.sfx('blip');
};
// ---------- Splitter settings: the outputs it found (FA.splitConn) with their shares and element filters ----------
// 2 outputs: one slider (output 1 on its left, output 2 on its right). 1 or 3 outputs: a slider each, always 100 in all. Every output has
// four element toggles: lit ones are the only kinds it takes. Keyboard / pad: up / down picks an output, left / right nudges its share by 5,
// 1-4 (pad: X moves the cursor, Y flips it) toggles an element
UI.splitB = null; UI.splitFoc = { row: 0, col: 0 }; UI.splitShown = null; UI.splitPad = false;
UI.openSplit = function (b) {
  UI.splitB = b; UI.splitFoc = { row: 0, col: 0 }; UI.splitShown = null; UI.splitPad = false;
  FA.splitConn(b);
  $('splitModal').classList.remove('hidden');
  UI.splitSync();
  AU.sfx('menu_open');
};
UI.closeSplit = function () {
  if (!UI.splitB) return;
  UI.splitB = null;
  $('splitModal').classList.add('hidden');
  AU.sfx('menu_close'); UI.changed();
};
// output i (in b.outs order) takes v%; with 3 the other two share what is left in their old ratio, so it always adds up to 100
UI.splitSet = function (i, v) {
  const b = UI.splitB;
  if (!b) return;
  const o = b.outs, n = o.length;
  if (n < 2 || i < 0 || i >= n) return;
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (n === 2) { b.pct[o[i]] = v; b.pct[o[1 - i]] = 100 - v; }
  else {
    const j = (i + 1) % 3, k = (i + 2) % 3, pj = b.pct[o[j]] || 0, pk = b.pct[o[k]] || 0, rest = 100 - v;
    const a = pj + pk > 0 ? Math.round(rest * pj / (pj + pk)) : Math.round(rest / 2);
    b.pct[o[i]] = v; b.pct[o[j]] = a; b.pct[o[k]] = rest - a;
  }
  b.acc = {}; b.pop = 0.15; UI.changed();
  UI.splitSync();
};
UI.splitNudge = (i, dv) => { const b = UI.splitB; if (b && b.outs[i] !== undefined) UI.splitSet(i, (b.pct[b.outs[i]] || 0) + dv); };
UI.splitToggle = function (i, el) {
  const b = UI.splitB;
  if (!b || b.outs[i] === undefined) return;
  const d = b.outs[i], f = (b.filt[d] || []).slice(), at = f.indexOf(el);
  if (at >= 0) f.splice(at, 1); else f.push(el);
  if (f.length) b.filt[d] = f; else delete b.filt[d];
  b.pop = 0.2; AU.sfx('blip'); UI.changed();
  UI.splitSync();
};
UI.splitReset = function () { const b = UI.splitB; if (!b) return; b.filt = {}; FA.splitReset(b); AU.sfx('blip'); UI.changed(); UI.splitSync(); };
// builds the rows when the set of outputs changes, otherwise just refreshes the numbers, toggles and the focus
UI.splitSync = function () {
  const b = UI.splitB;
  if (!b) return;
  const o = b.outs, n = o.length, box = $('splitBody'), col = FA.splitCol, F = UI.splitFoc;
  F.row = Math.max(0, Math.min(n - 1, F.row));
  if (UI.splitShown !== b.sig) {
    UI.splitShown = b.sig;
    const sw = i => '<i class="sw" style="background:' + col[i] + '"></i>';
    let h = '';
    if (!n) h = '<p class="splitNone">Nothing to route yet. Put belts or machines on its sides: the side items come in from is the input, every other side is an output.</p>';
    else if (n === 2) h = '<div class="splitRow"><div class="splitSide" style="color:' + col[0] + '">' + sw(0) + '<b data-v="0">50</b><small>%</small></div>' +
      '<input class="splitR" data-i="0" type="range" min="0" max="100" step="1" tabindex="-1"><div class="splitSide b" style="color:' + col[1] + '"><small>%</small><b data-v="1">50</b>' + sw(1) + '</div></div>';
    else h = o.map((d, i) => '<div class="splitRow three" data-row="' + i + '"><div class="splitSide" style="color:' + col[i] + '">' + sw(i) + '<b data-v="' + i + '">0</b><small>%</small></div>' +
      '<input class="splitR" data-i="' + i + '" type="range" min="0" max="100" step="1" tabindex="-1"' + (n === 1 ? ' disabled' : '') + '></div>').join('');
    if (n) h += '<div class="splitFl"><span>ONLY</span>' + o.map((d, i) => '<div class="splitF" data-row="' + i + '">' + sw(i) +
      ELEMS.map((el, j) => '<button class="el" data-i="' + i + '" data-el="' + el + '" data-c="' + j + '" title="' + ELEM[el].name + '">' + UI.img(el, 22) + '<kbd>' + (j + 1) + '</kbd></button>').join('') + '</div>').join('') + '</div>';
    box.innerHTML = h;
  }
  box.querySelectorAll('.splitR').forEach(r => {
    const i = +r.dataset.i, v = b.pct[o[i]] || 0;
    if (+r.value !== v) r.value = v;
    r.style.background = n === 2 ? 'linear-gradient(90deg,' + col[0] + ' ' + v + '%,' + col[1] + ' ' + v + '%)' : 'linear-gradient(90deg,' + col[i] + ' ' + v + '%,#2b1d48 ' + v + '%)';
  });
  box.querySelectorAll('b[data-v]').forEach(e => { e.textContent = b.pct[o[+e.dataset.v]] || 0; });
  box.querySelectorAll('button.el').forEach(e => {
    const i = +e.dataset.i, f = b.filt[o[i]] || [];
    e.classList.toggle('on', f.indexOf(e.dataset.el) >= 0);
    e.classList.toggle('cur', UI.splitPad && i === F.row && +e.dataset.c === F.col);
  });
  box.querySelectorAll('[data-row]').forEach(e => e.classList.toggle('foc', n > 1 && +e.dataset.row === F.row));
};
// the little iso diagram: the tile, a coloured arrow out of each output and grey arrows into it from its inputs
UI.splitTick = function (dt) {
  const b = UI.splitB;
  if (!b) return;
  if (G.fac.bld.indexOf(b) < 0) { UI.closeSplit(); return; }
  if (UI.splitShown !== b.sig) UI.splitSync();   // something was connected or taken away: new outputs, new rows
  const c = $('splitDia'), x = c.getContext('2d'), t = performance.now() / 1000, cx = 160, cy = 78, hw = 54, hh = 27;
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = '#4f7a3c';
  x.beginPath(); x.moveTo(cx, cy - hh); x.lineTo(cx + hw, cy); x.lineTo(cx, cy + hh); x.lineTo(cx - hw, cy); x.closePath(); x.fill();
  x.strokeStyle = '#1a0f28'; x.lineWidth = 4; x.stroke();
  x.imageSmoothingEnabled = false;
  const spr = SP.b_splitter;
  if (spr) x.drawImage(spr.c, cx - 30, cy - 78, 60, 102);   // the sprite's base diamond sits at (10, 26)
  const arrow = (d, col, k, inward) => {
    const dd = DIRS[d], sx = (dd[0] - dd[1]), sy = (dd[0] + dd[1]), m = Math.hypot(sx * hw, sy * hh), f = inward ? -1 : 1, nx = sx * hw / m * f, ny = sy * hh / m * f;
    const px = cx + sx * hw * 1.45, py = cy + sy * hh * 1.45;
    for (const [s, cl] of [[1.35, '#1a0f28'], [1, col]]) {
      x.fillStyle = cl; x.beginPath();
      x.moveTo(px + nx * 22 * s * k, py + ny * 22 * s * k);
      x.lineTo(px - ny * 18 * s * k - nx * 10 * s, py + nx * 18 * s * k - ny * 10 * s);
      x.lineTo(px + ny * 18 * s * k - nx * 10 * s, py - nx * 18 * s * k - ny * 10 * s);
      x.closePath(); x.fill();
    }
  };
  b.ins.forEach(d => { x.globalAlpha = 0.6; arrow(d, '#c8b8e8', 0.75, true); });
  b.outs.forEach((d, i) => {
    const p = b.pct[d] || 0, on = p > 0 || FA.splitHas(b, d);
    x.globalAlpha = on ? 1 : 0.35;
    arrow(d, FA.splitCol[i], on ? 1 + 0.18 * (Math.sin(t * 5 + i) * 0.5 + 0.5) : 0.7, false);
  });
  x.globalAlpha = 1;
};
