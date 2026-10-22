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
    const d = CFG.buildings[key.slice(2)], s = d.elem ? SP['b_' + d.elem] : SP['b_' + key.slice(2)];
    c = document.createElement('canvas'); c.width = 20; c.height = 32;
    const x = c.getContext('2d');
    x.drawImage(s.c, 0, -2);
    if (d.elem) { const cr = SP['cr_' + d.elem]; x.drawImage(cr.c, 10 - cr.ax, 26 - 2 - 7 - cr.ay); }
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
UI.toast = function (text, side, icon) {
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
UI.changed = function () { UI.dirty = true; };

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

UI.batteryStatus = function () {
  let charged = 0, flat = 0, charging = 0;
  const ct = c => { if (c == null) return; if (c > 0) charged++; else flat++; };
  for (const b of G.fac.bld) {
    if (b.type === 'station') ct(b.bat);
    if (b.type === 'charger' && b.bat != null) { if (b.bat >= CFG.batteryMax) charged++; else if (FA.fuelTotal(b) > 0) charging++; else flat++; }
    for (const o of b.out) if (o.kind === 'battery') ct(o.charge);
  }
  for (const o of G.fac.floor) if (o.kind === 'battery') ct(o.charge);
  if (G.hands && G.hands.kind === 'battery') ct(G.hands.charge);
  if (!charged && !flat && !charging) return null;
  return [charged, flat, charging];
};
UI.handsHtml = function () {
  const h = G.hands;
  if (!h) return '<span class="dim">empty</span>';
  const extra = h.kind === 'battery' ? Math.round(h.charge / CFG.batteryMax * 100) + '%' : 'x' + h.n + '<i>/' + FA.stackMax(h.kind) + '</i>';
  return UI.img(h.kind, 24) + '<span>' + itemName(h.kind) + '</span><span class="cnt">' + extra + '</span>';
};
UI.updateHud = function (dt) {
  const f = G.fac, w = G.w;
  const pulse = (id, v) => { if (cache['v' + id] !== undefined && v > cache['v' + id]) { const el = $(id); el.classList.remove('gain'); void el.offsetWidth; el.classList.add('gain'); } cache['v' + id] = v; };
  for (const k of ['wood', 'stone', 'iron', 'shard', 'core']) {
    const id = 't' + k[0].toUpperCase() + k.slice(1);
    setHtml(id, UI.img(k, 24) + '<b>' + G.stock[k] + '</b>');
    pulse(id, G.stock[k]);
  }
  const xp = Math.floor(G.xp);
  setHtml('tXp', UI.img('ic_xp', 24) + '<b>' + xp + '</b><span class="lbl">XP</span>');
  $('tXp').classList.toggle('ready', UI.anyAffordable());
  pulse('tXp', xp);
  // the Skill Portal bank: four element packets + how many combo spells are banked
  const combos = SPELL_KINDS.filter(k => ITEMS[k].spell).reduce((a, k) => a + (G.bank[k] || 0), 0);
  setHtml('tBank', UI.img('ic_skill', 24) + ['air', 'water', 'fire', 'earth'].map(k => UI.img(k, 16) + '<b>' + (G.bank[k] || 0) + '</b>').join('') + (combos ? UI.img('flamethrower', 16) + '<b>' + combos + '</b>' : ''));
  pulse('tBank', G.bankTotal || 0);
  const bs = UI.batteryStatus();
  setHtml('tBat', UI.img('battery', 24) + (bs ? '<b>' + bs[0] + '</b><span class="lbl">ok ' + (bs[1] + bs[2]) + ' flat</span>' : '<span class="lbl">none</span>'));
  const gen = f.gen, dem = f.demand, low = dem > gen;
  setTxt('powTxt', gen + ' / ' + dem);
  $('powFill').style.width = (dem === 0 ? (gen > 0 ? 100 : 0) : Math.min(100, gen / dem * 100)).toFixed(0) + '%';
  $('powCard').classList.toggle('low', low);
  $('vigL').classList.toggle('on', low);
  setHtml('handTxt', UI.handsHtml());
  $('handCard').classList.toggle('full', !!G.hands && G.hands.n >= FA.stackMax(G.hands.kind));
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
  $('wizPause').classList.toggle('hidden', !tl || tr);
  $('facNote').classList.toggle('hidden', !tr || tl);
  UI.updateQuest(dt);
  UI.updateEvent();
  UI.updateEggQ();
  UI.updatePins(dt);
  UI.updateHotbar();
  UI.updateDebug(dt);
  if (UI.tipT > 0) { UI.tipT -= dt; if (UI.tipT <= 0 && !UI.tipHover) $('hotTip').classList.add('hidden'); }
  UI.tickToasts(dt);
};
UI.setInspect = function (s) {
  const el = $('inspect');
  if (!s) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  setTxt('inspect', s);
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
  for (const k in gift.stock || {}) { G.stock[k] += gift.stock[k]; FA.pileIn(k); }
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
  if (G.qbase[side] == null) G.qbase[side] = q.stat ? q.stat(G) : 0;
  const p = UI.questProg(side, q);
  if (q.stat ? p[0] >= p[1] : q.done(G)) { UI.questDone(side, q); return; }
  setHtml('qIcon' + side, UI.img(q.icon, 32));
  setHtml('qHead' + side, '<span>' + nm + ' GOAL ' + (i + 1) + '/' + list.length + '</span><span class="qr">' + (p ? '<em>' + Math.floor(p[0]) + '/' + p[1] + '</em>' : '') + '+' + q.xp + ' XP' + UI.giftHtml(q.gift, 16) + '</span>');
  setTxt('qText' + side, q.text);
  $('qBar' + side).style.display = p ? '' : 'none';
  if (p) $('qFill' + side).style.width = Math.min(100, p[0] / p[1] * 100) + '%';
};
UI.updateQuest = function (dt) {
  for (const side of QUEST_SIDES) UI.questSide(side);
  // pickups from a gift drop beside the Wizard one at a time, once he is alive and the game is running
  if (G.pend && G.pend.length && G.w && !G.w.dead && !UI.treeOpen.L && !UI.treeOpen.R) {
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
UI.updateDebug = function (dt) {
  const el = $('debug');
  el.classList.toggle('hidden', !UI.debugOn);
  if (!UI.debugOn) return;
  UI.dbgT = (UI.dbgT || 0) - dt;
  if (UI.dbgT > 0) return;
  UI.dbgT = 0.25;
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
    '<div>XP/min <b>' + f1(xpm) + '</b></div><div>Packets made/min <b>' + f1(pkm) + '</b></div><div>Banked/min <b>' + f1(bkm) + '</b>' +
    ' <span class="dim">' + ELEMS.map(k => k[0].toUpperCase() + f1(rateOf(k))).join(' ') + '</span></div>' +
    '<div>Spell Portal <b>' + FA.rate('spell') + '/min</b>  Skill Portal <b>' + FA.rate('skill') + '/min</b></div>' +
    '<div>Next unlock: <b>' + eta + '</b></div>' + UI.debugEvent() +
    '<div class="dim">Foes ' + G.w.enemies.length + '  working machines ' + G.fac.working + '  play ' + fmtTime(G.stats.time) + '</div>' + DevBot.html();
};

// ---------- hotbar: single slots plus families (Harnessers, Crafters, Power, Logistics, Spawners) whose member cycles ----------
UI.tipT = 0; UI.tipHover = false;
const KEYLBL = ['1', '2', '3', '4', '5', '6', '7'];
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
    const cost = Object.keys(d.cost).map(k => UI.img(k, 16) + d.cost[k]).join(' ');
    const list = Object.keys(CFG.recipes).filter(r => CFG.recipes[r].machine === id);
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
// Every node costs XP + banked spells. Element packets need their harnesser unlocked; combo spells need their own node.
const ELEM_UNLOCK = { water: 'water', fire: 'fire', earth: 'earth' };
UI.nodeLevel = n => (n.tiers ? lvl(n.id) : (G.tree[n.id] ? 1 : 0));
UI.nodeMax = n => (n.tiers ? n.tiers.length : 1);
UI.nodeCost = function (n) {
  const L = UI.nodeLevel(n);
  if (L >= UI.nodeMax(n)) return null;
  if (!n.tiers) return { xp: n.xp, pay: n.pay, core: n.core || 0 };
  // packets per tier come from pk (the old XP basis, halved by the rebalance), split across the tier's kinds
  const xp = n.tiers[L], kinds = n.kinds[L], pay = {}, per = Math.max(1, Math.round((n.pk ? n.pk[L] : xp) / kinds.length * (L === 0 ? CFG.firstTierPay : 1)));
  kinds.forEach(k => { pay[k] = per; });
  Object.assign(pay, (n.combos && n.combos[L]) || {});
  return { xp, pay };
};
UI.nodeReqs = function (n) {   // tree ids still needed before this node (or its next tier) can be bought
  const need = (n.req || []).slice(), c = UI.nodeCost(n);
  if (c) for (const k in c.pay) { const r = ELEM_UNLOCK[k] || (ITEMS[k] && ITEMS[k].spell ? k : null); if (r && r !== n.id && need.indexOf(r) < 0) need.push(r); }
  return need.filter(r => !G.tree[r]);
};
UI.canAfford = function (c) {
  if (G.xp < c.xp || (c.core || 0) > G.stock.core) return false;
  for (const k in c.pay) if ((G.bank[k] || 0) < c.pay[k]) return false;
  return true;
};
UI.anyAffordable = () => CFG.tree.some(n => { const c = UI.nodeCost(n); return c && !UI.nodeReqs(n).length && UI.canAfford(c); });
UI.costHtml = function (c) {
  let h = '<span class="c' + (G.xp >= c.xp ? '' : ' short') + '">' + UI.img('ic_xp', 14) + c.xp + '</span>';
  for (const k in c.pay) h += '<span class="c' + ((G.bank[k] || 0) >= c.pay[k] ? '' : ' short') + '">' + UI.img(k, 14) + c.pay[k] + '</span>';
  if (c.core) h += '<span class="c' + (G.stock.core >= c.core ? '' : ' short') + '">' + UI.img('core', 14) + c.core + '</span>';
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
UI.renderTree = function (side) {
  const el = $(side === 'L' ? 'treeL' : 'treeR');
  const cols = [['ic_factory', 'FACTORY'], ['ic_new', 'SPELLS'], ['ic_up', 'UPGRADES'], ['egg_zephyr', 'CREATURES']];
  const bank = SPELL_KINDS.filter(k => G.bank[k] > 0).map(k => '<span class="bk">' + UI.img(k, 16) + G.bank[k] + '</span>').join('') || '<span class="dim">empty: send spells into the Skill Portal</span>';
  let h = '<div class="treeHead"><h2>' + UI.img(side === 'L' ? 'ic_wrench' : 'ic_hat', 32) + 'SKILL TREE</h2><div class="xpbig">' + UI.img('ic_xp', 24) + Math.floor(G.xp) + '</div><button class="x" data-close="1">' + UI.img('ic_x', 16) + '</button></div>';
  const un = UI.undoKind();
  h += '<div class="bankRow">' + UI.img('ic_skill', 24) + '<span class="lbl">BANK</span>' + bank +
    (un ? '<span class="undo" data-undo="1"><kbd>Q</kbd><kbd>X</kbd>' + UI.img('ic_rotate', 14) + UI.img(un, 16) + '</span>' : '') + '</div><div class="cols">';
  cols.forEach((c, ci) => {
    h += '<div class="col"><h4>' + UI.img(c[0], 16) + c[1] + '</h4>';
    for (const n of CFG.tree.filter(t => t.col === ci)) {
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
  flamethrower: s => s.n + ' bolts x ' + s.dmg + ' dmg',
  tempest: s => s.dmg + ' dmg, chains to ' + s.n,
  steam: s => s.dmg + ' dmg in a ' + s.r + ' tile ring, slows',
  sandstorm: s => s.dps + ' dmg/s for ' + s.t + 's, follows',
  magma: s => s.dmg + ' dmg + ' + s.splash + ' splash',
  mud: s => s.dps + ' dmg/s for ' + s.t + 's, -' + Math.round(s.slow * 100) + '% speed',
  meteor: s => s.n + ' meteors x ' + s.dmg + ' dmg',
  thunder: s => s.dmg + ' dmg, chains to ' + s.n,
  blizzard: s => s.dps + ' dmg/s for ' + s.t + 's, follows',
  geyser: s => s.n + ' blasts x ' + s.dmg + ' dmg',
  nova: s => s.dmg + ' dmg in a ' + s.r + ' tile ring',
};
UI.nodeStats = function (n) {   // rows [label, now, next]: next undefined = a plain fact, null = maxed out
  const L = UI.nodeLevel(n), up = CFG.upgrade[n.id], nx = L < UI.nodeMax(n) ? L + 1 : null;
  const row = (label, f) => [label, f(L), nx === null ? null : f(nx)];
  switch (n.id) {
    case 'expand': return [row('Factory floor', l => CFG.factorySizes[Math.min(l, CFG.factorySizes.length - 1)].join('x'))];
    case 'swift': return [row('Harnesser speed', l => fPct(up * l)), row('Air Pocket every', l => fSec(CFG.buildings.air.cycle / (1 + up * l))), row('Water Drop every', l => fSec(CFG.buildings.water.cycle / (1 + up * l)))];
    case 'belts': return [row('Belt speed', l => fPct(up * l)), row('Time per tile', l => fSec(CFG.beltTime / (1 + up * l)))];
    case 'satchel': return [row('Hand stack', l => '' + (CFG.satchel + up * l))];
    case 'zoomies': return [row('Wizard speed', l => fPct(up * l))];
    case 'hearty': return [row('Wizard max HP', l => '' + (CFG.wizard.hp + up * l))];
    case 'gems': return [row('Gem drop chance', l => 'x' + Math.pow(1 + up, l).toFixed(2)), row('Cinder Imp gem chance', l => Math.min(95, Math.round(CFG.creatures.cinder.gem[1] * 100 * Math.pow(1 + up, l))) + '%'), row('Wild Slime gem chance', l => Math.min(95, Math.round(CFG.enemies.slime.gem[1] * 100 * Math.pow(1 + up, l))) + '%')];
    case 'magnet': return [row('Pickup range', l => (CFG.world.vacuum + up * l).toFixed(2) + ' tiles'), row('Shard / Core range', l => ((CFG.world.vacuum + up * l) * 2.5).toFixed(2) + ' tiles')];
    case 'heavy': {
      const life = k => Math.round(CFG.batteryLife * k) + 's';
      return [['Battery at full load lasts', G.tree.heavy ? life(1 + CFG.heavyBattery) : life(1) + ' > ' + life(1 + CFG.heavyBattery)]];
    }
  }
  const rows = [];
  if (n.id.startsWith('cr_')) {
    const id = n.id.slice(3), c = CFG.creatures[id];
    rows.push(['Egg recipe', UI.recipeHtml('egg_' + id)], ['Hatch', (c.n || 1) + 'x, ' + c.time + 's, ' + c.power + ' power'], ['Creature', c.hp + ' HP, ' + c.dmg + ' dmg, weak to ' + UI.img(c.weak, 14)], ['Elements', c.order.map(k => UI.img(k, 16)).join('')]);
    return rows;
  }
  if (ITEMS[n.id] && ITEMS[n.id].spell) {
    const r = CFG.recipes[n.id];
    rows.push(['Forge recipe', UI.recipeHtml(n.id)], ['Craft', r.time + 's, ' + r.power + ' power'], ['Damage', SPELL_DMG[n.id](CFG.spells[n.id])]);
    rows.push(['Elements', SPELL_EL[n.id].map(k => UI.img(k, 16)).join('')], ['Banked now', '' + (G.bank[n.id] || 0)]);
    return rows;
  }
  for (const id in CFG.buildings) {
    const d = CFG.buildings[id];
    if (d.unlock !== n.id) continue;
    const info = d.kind === 'harness' ? '1 per ' + fSec(FA.cycle(id)) + (d.power ? ', ' + d.power + ' power' : ', no power') : Object.keys(d.cost).map(k => UI.img(k, 14) + d.cost[k]).join(' ');
    rows.push([d.name, info]);
  }
  for (const id in CFG.recipes) if (CFG.recipes[id].tier === n.id) rows.push([recipeName(id), UI.recipeHtml(id)]);
  return rows;
};
UI.nodeTipHtml = function (n) {
  const L = UI.nodeLevel(n), max = UI.nodeMax(n), cost = UI.nodeCost(n), reqs = UI.nodeReqs(n);
  const state = n.tiers ? 'TIER ' + L + '/' + max : G.tree[n.id] ? 'OWNED' : 'LOCKED';
  let h = '<div class="tth">' + UI.img(n.icon, 32) + '<div><b>' + n.name + '</b><small>' + state + '</small></div></div>';
  h += '<p>' + (n.tiers ? 'Each tier: ' + n.per + '.' : n.desc) + '</p>';
  const sp = SPV.spellFor(n.id);
  if (sp) h += '<canvas class="spv" width="186" height="100" data-spell="' + sp + '"></canvas><div class="spvc">' + SPV.caption(sp) + '</div>';
  const rows = UI.nodeStats(n);
  if (rows.length) {
    if (n.tiers) h += '<div class="ttr ttc"><span></span><em>NOW</em><em>' + (cost ? 'NEXT' : '') + '</em></div>';
    h += rows.map(r => r[2] === undefined
      ? '<div class="ttr wide"><span>' + r[0] + '</span><em>' + r[1] + '</em></div>'
      : '<div class="ttr"><span>' + r[0] + '</span><em>' + r[1] + '</em><em class="' + (r[2] === null ? 'max' : 'up') + '">' + (r[2] === null ? 'MAX' : r[2]) + '</em></div>').join('');
  }
  if (!cost) h += '<div class="ttf done">' + UI.img('ic_check', 12) + (n.tiers ? 'MAXED' : 'OWNED') + '</div>';
  else if (reqs.length) h += '<div class="ttf req">' + UI.img('ic_lock', 12) + 'Needs ' + reqs.map(r => CFG.tree.find(t => t.id === r).name).join(', ') + '</div>';
  else h += '<div class="ttf">' + UI.costHtml(cost) + '</div><div class="ttn">' + (n.tiers && L === 0 ? 'First tier: half the usual spells. ' : '') + (UI.canAfford(cost) ? 'Click to buy.' : 'Not enough yet.') + ' Right-click to pin.</div>';
  return h;
};
UI.tipNode = null;
UI.showNodeTip = function (side, id) {
  const el = $('nodeTip'), nd = id && $(side === 'L' ? 'treeL' : 'treeR').querySelector('.node[data-id="' + id + '"]');
  UI.tipNode = nd ? { side, id } : null;
  if (!nd) { el.classList.add('hidden'); SPV.stop(); return; }
  el.innerHTML = UI.nodeTipHtml(CFG.tree.find(t => t.id === id));
  const cv = el.querySelector('canvas.spv');
  if (cv) SPV.mount(cv, cv.dataset.spell); else SPV.stop();
  el.classList.remove('hidden');
  // beside the node (in stage px), flipped to its left when it would leave this half of the screen
  const st = $('stage').getBoundingClientRect(), k = st.width / CFG.W, r = nd.getBoundingClientRect();
  const x0 = (r.left - st.left) / k, x1 = (r.right - st.left) / k, y = (r.top - st.top) / k;
  const hi = (side === 'L' ? 0 : CFG.HALF) + CFG.HALF, w = el.offsetWidth, hgt = el.offsetHeight;
  el.style.left = Math.max(8, x1 + 12 + w <= hi - 8 ? x1 + 12 : x0 - 12 - w) + 'px';
  el.style.top = Math.max(8, Math.min(CFG.H - hgt - 8, y)) + 'px';
};
UI.buy = function (id) {
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
    if ((c.core || 0) > G.stock.core) short.push((c.core - G.stock.core) + ' Warden Core (from a Stronghold)');
    UI.toast('Still need ' + short.join(', '), 'L', 'ic_skill'); AU.sfx('error'); return;
  }
  G.xp -= c.xp;
  G.stock.core -= c.core || 0;
  for (const k in c.pay) G.bank[k] -= c.pay[k];
  G.tree[id] = n.tiers ? UI.nodeLevel(n) + 1 : true;
  AU.sfx('buy');
  const label = n.name + (n.tiers ? ' ' + G.tree[id] : '');
  UI.toast('Unlocked: ' + label, 'L', n.icon); UI.toast('Unlocked: ' + label, 'R', n.icon);
  if (id === 'hearty') G.w.hp = Math.min(WZ.maxHp(), G.w.hp + CFG.upgrade.hearty);
  if (id === 'expand') {
    const sz = CFG.factorySizes[Math.min(G.tree.expand, CFG.factorySizes.length - 1)];
    FA.resize(sz[0], sz[1]);
    UI.toast('The factory floor grew to ' + sz[0] + 'x' + sz[1] + '!', 'L', 'ic_expand');
  }
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
  const k = FA.unbank();
  if (!k) { AU.sfx('error'); return; }
  AU.sfx('drop');
  for (const sd of ['L', 'R']) if (UI.treeOpen[sd]) UI.renderTree(sd);
};
// ---------- pinned nodes: either player pins one (right-click in the tree); a card shows what's left and how ----------
UI.pin = function (side, id) {
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
  if (c.core) add('core', c.core - G.stock.core, 0);
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
    else if (worst.k === 'core') act = [UI.img('ic_hat', 16), UI.img('ic_keep', 16)];   // the Wizard claims a Stronghold
    else if (ELEM[worst.k] && !FA.count(worst.k)) act = [UI.img('b:' + worst.k, 16)];   // build that harnesser first
    else if (ITEMS[worst.k].spell && !(G.fac.bld.some(b => b.type === 'forge' && b.recipe === worst.k))) act = [UI.img('b:forge', 16), UI.img('ic_swap', 14), UI.img(worst.k, 16)];   // set a Forge to it
    else act = [UI.img(worst.k, 16), '<em>&gt;</em>', UI.img('ic_skill', 16)];   // send it into the Skill Portal
  }
  return h + '<div class="pa">' + act.join('') + '</div>';
};
UI.pinT = 0;
UI.updatePins = function (dt) {
  UI.pinT -= dt;
  if (UI.pinT > 0) return;
  UI.pinT = 0.5;
  for (const sd of ['L', 'R']) {
    const id = G.pins && G.pins[sd], el = $('pin' + sd);
    el.classList.toggle('hidden', !id);
    if (id && CFG.tree.find(t => t.id === id)) el.innerHTML = UI.pinHtml(sd, id);
  }
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
UI.showResults = function () {
  const el = $('results');
  el.innerHTML = '<div class="rIcon">' + UI.img('ic_skull', 48) + '</div><h2>THE WIZARD NEEDS A NAP</h2>' + UI.statsHtml() + '<p>The factory, stockpile, XP, bank and skill tree are all safe.</p><button class="big" id="rRe">RE-ENTER</button><button class="big ghost" id="rTitle">TITLE</button>';
  el.classList.remove('hidden');
  $('rRe').onclick = () => { WZ.reenter(); R.wcam.x = G.w.x; R.wcam.y = G.w.y; el.classList.add('hidden'); AU.sfx('buy'); };
  $('rTitle').onclick = () => { el.classList.add('hidden'); Main.toTitle(); };
};
UI.showVictory = function () {
  if (!G) return;
  const el = $('victory'), s = G.stats;
  G.paused = true;
  el.innerHTML = '<div class="panel px"><div class="rIcon">' + UI.img('ic_trophy', 64) + '</div><h2>THE CHIMERA FALLS!</h2><p class="sub2">Builder and Wizard, you did it together. You win!</p>' + UI.statsHtml() +
    '<div class="life">ALL TIME: ' + UI.img('ic_skull', 14) + s.kills + ' kills ' + UI.img('ic_portal', 14) + s.deliveries + ' deliveries ' + UI.img('ic_flag', 14) + (s.landmarks || 0) + ' landmarks ' + UI.img('ic_crown', 14) + (s.wins || 1) + ' win' + ((s.wins || 1) > 1 ? 's' : '') + ' ' + UI.img('ic_clock', 14) + fmtTime(s.time) + '</div>' +
    '<button class="big" id="vKeep">KEEP PLAYING</button><button class="big ghost" id="vTitle">SAVE &amp; TITLE</button></div>';
  el.classList.remove('hidden');
  Main.save();
  $('vKeep').onclick = () => { el.classList.add('hidden'); G.paused = false; AU.sfx('buy'); };
  $('vTitle').onclick = () => { el.classList.add('hidden'); G.paused = false; Main.toTitle(); };
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
function slotLabel(i, s) {
  if (!s) return '<b>SLOT ' + i + '</b><span>Empty</span>';
  if (s.old) return '<b>SLOT ' + i + '</b><span>Save from an older version</span>';
  const nb = (s.fac && s.fac.bld ? s.fac.bld.length : 0), q = Main.questOf(s);
  const when = s.at ? new Date(s.at).toLocaleString() : '';
  return '<b>SLOT ' + i + '</b><span>' + Math.floor(s.xp || 0) + ' XP, ' + nb + ' buildings, goals ' + (q.B + q.W) + '/' + (QUESTS.B.length + QUESTS.W.length) + '</span><small>' + when + '</small>';
}
UI.menuPage = function (page) {
  ['menuMain', 'menuSlots', 'menuHow', 'menuSet'].forEach(id => UI.show(id, id === page));
  if (page === 'menuMain') $('mContinue').classList.toggle('hidden', !UI.lastSlot());
};
UI.lastSlot = function () {
  let best = null, at = 0;
  for (let i = 1; i <= 3; i++) { const s = UI.slotInfo(i); if (s && !s.old && (s.at || 0) >= at) { at = s.at || 0; best = i; } }
  return best;
};

const HOWTO = {
  'THE IDEA': [
    ['Two jobs, one team', 'The <b>Builder</b> (left) runs an elemental factory. The <b>Wizard</b> (right) explores the wilds but has <b>no attack of his own</b>: every spell he casts is made in the factory and sent through the <b>Spell Portal</b>.'],
    ['The loop', 'The Wizard stands near trees, rocks and ore so delivered spells smash them. Drops vacuum into him and land in the factory <b>Stockpile</b>. The Builder carries them to blueprints to grow the factory, which makes stronger spells, potions and armor.'],
    ['Two portals', 'The <b>Spell Portal</b> sends things to the Wizard. The <b>Skill Portal</b> banks element packets and spells as currency for the <b>Skill Tree</b>, together with XP from kills.'],
    ['Follow the goals', 'Each player has their own goal card (Builder on the left, Wizard on the right) and the two run at the same time. Every goal pays XP, and the bigger ones add a gift: spells for the skill tree, building materials, a free Station, potions and armor. A gold arrow points at where to go, and the right hotbar slot or skill-tree button blinks.'],
    ['Winning', 'Late on, claim a <b>Stronghold</b> for a <b>Warden Core</b> (Summoning costs one), build the <b>Summoning Altar</b>, bind an Elemental Nova and Aether Shards into a <b>Boss Sigil</b> and send it through the Spell Portal. Beat the <b>Primal Chimera</b> to win. You can keep playing afterwards.'],
  ],
  'FACTORY': [
    ['Hands', 'The Builder carries one stack (5 at first). <b>Left-click</b> (pad <b>A</b>) picks up <b>one item at a time</b>: hold it to keep grabbing. <b>Right-click</b> (pad <b>B</b>) throws one item along the dotted lead line: it aims at machines, blueprints, belts, portals or the Stockpile. Throwing is the only way to put things in. Nothing ever vanishes.'],
    ['Building', 'Pick a slot (keys <b>1</b> to <b>7</b> or the wheel). Slots with a pip row are <b>families</b> (Harnessers, Crafters, Power, Logistics, Creature Spawners): <b>Q</b>, the wheel over the slot or <b>RT</b> on a pad cycles the member (locked ones are skipped). <b>R</b> rotates its output arrow, click a tile to drop a blueprint, then throw Wood, Stone and Iron Ore at it. Demolish (<b>B</b>) always refunds 100%.'],
    ['Machines', 'Harnessers make element packets by themselves, or stand next to one and press <b>E</b>, then <b>tap E</b> to crank one out by hand (no power needed; <b>right-click</b> or pad <b>B</b> stops). Machines push out of their arrow side: onto a belt, into another machine or into a portal.'],
    ['Power', 'Harnessers (Air too) and the Forge use power. The factory starts with a charged Battery in a Battery Station and a Charger beside it: a Battery drains while anything needs power, so carry it to the Charger and throw element packets at it to refill it (hand-gathered packets are free). Every packet charges 10% more than its base, and a packet you throw in by hand adds another 20%. Craft a Battery at the Forge (2 Iron Ore), charge it at a Charger by feeding it packets (more kinds = faster), then haul it to a Battery Station. A charged Station right beside a <b>Forge</b> or <b>Cauldron</b> overdrives it: <b>+15%</b> crafting speed. Late on, <b>Heavy Batteries</b> make every Battery last 50% longer in a Station.'],
    ['Creatures', 'The <b>Creature Spawner</b> turns element packets into <b>Eggs</b>. Send an Egg through the <b>Spell Portal</b> and the creature drops in beside the Wizard (inside his view, dazed for a moment) for him to fight and earn XP gems. Zephyr Wisps (Air) are hatching from the very start. Tier 2 and 3 Spawners (Skill Tree) hatch two- and three-element creatures; each one is its own node. At most 12 factory creatures live at once: extra Eggs wait in the portal. Creatures are weak to the cycle <b>Fire &lt; Water &lt; Earth &lt; Air &lt; Fire</b> (the first element in their name), so practise on them with the right spells.'],
    ['Growing', 'The floor starts small. <b>Factory Expansion</b> in the Skill Tree makes it bigger, pushing the Stockpile further from the portals.'],
    ['Logistics', 'Belts already merge: any belt can feed into another. The <b>Splitter</b> shares items between its two sides (right and left of its arrow) by the percentages you choose: click it (<b>A</b> on a pad) for a slider, 50 / 50 to start. The <b>180 / 90</b> toggle sets whether its two sides are opposite each other or at a right angle; <b>Turn</b> steps through every orientation. Each end of the slider has the colour of one arrow on the tile (pink or cyan), and the arrows pulse to show where items go. The <b>Sorter</b> sends one item kind out the front (E while holding it) and the rest out the sides. The <b>Storage Crate</b> holds 30 packets or spells and feeds them out of its arrow. E turns any of them (a Sorter with a filter clears it first).'],
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
    ['Strongholds', 'Four far-off keeps, one per element, marked on the map. Walk near one to <b>scout</b> it: its guards, its <b>Warden</b> and what the Warden is weak to show up. Beat the Warden and the guards to claim it: lots of Aether Shards and a <b>Warden Core</b> (each keep pays its Core once per save). Spawner III and Summoning each cost a Core.'],
    ['Pickups', 'Potions and armor sent through the Spell Portal fall beside the Wizard. Walk over them to use them. They wait if HP or armor is already full.'],
    ['Weaknesses', 'Biome monsters take <b>double damage</b> from one element and half from another: <b>Ember Imps</b> (sand, dirt) hate Water, <b>Bog Lurkers</b> hate Fire, <b>Gale Wisps</b> (far meadows) hate Earth, <b>Stone Golems</b> (far dark woods) hate Air. Combo spells count every element in them. A small diamond over a foe shows its weakness, and yellow numbers with a ! mean a weak hit.'],
    ['Elites', 'Big gold-ringed monsters with a crown. Much tougher, but they drop <b>Aether Shards</b> and lots of XP. Each one is weak to one element.'],
    ['Landmarks', 'The map (bottom right) shows them. <b>Monster Camps</b> (red) wake when the Wizard walks up: clear them. <b>Crypts</b> (purple) open if he waits at the door, and their Guardian must fall. Both pay Aether Shards, the rare resource for Sorters and the Summoning Altar. <b>Shrines</b> (element colours): stand on one and a ring shrinks toward the crystal. Press the roll button when it lights up over the white ring, three times, to claim it for a Shard (a miss just restarts the ring). From then on, while the Wizard stands on it, the factory\'s Harnessers of that element run <b>25% faster</b>.'],
    ['Foraging', '<b>Dirt Mounds</b>, <b>Stick Piles</b> and <b>Berry Bushes</b> are scattered everywhere. Stand still at one and <b>mash the roll button</b> (<kbd>.</kbd>, pad <b>A</b>) to dig out Stone (sometimes Iron Ore) or Wood, or shake a Health Potion or Armor Plate out of a bush. Move while pressing it to roll away instead. They grow back after a while.'],
    ['Dodging', 'The roll makes the Wizard <b>invulnerable</b> while he flickers white. A hit he rolls through pops <b>DODGE!</b>.'],
    ['The Primal Chimera', 'The boss. It only takes real damage from its current weakness (shown on the boss bar and its glowing belly), and the weakness changes every quarter of its health, so the factory has to switch what it sends. Roll or walk out of the pink slam marks and dodge its orbs.'],
  ],
  'CONTROLS': [
    ['Builder: keyboard & mouse', '<kbd>WASD</kbd> walk, <kbd>left-click</kbd> pick up one (hold to repeat; walks there first), <kbd>right-click</kbd> throw along the lead line (hold = rapid), <kbd>E</kbd> use: gather, crank, rotate, switch recipe, <kbd>1</kbd>-<kbd>7</kbd> or wheel: slot, <kbd>Q</kbd> (or wheel over a family slot): next member of the slot, <kbd>R</kbd> rotate, click: place (with a building selected), drag belts, <kbd>B</kbd> demolish, <kbd>Enter</kbd> place in front, <kbd>T</kbd> skill tree (in it: right-click a skill to pin it, <kbd>Q</kbd> takes the last deposit back out), <kbd>Tab</kbd> cycle targets, <kbd>Shift</kbd>+<kbd>right-click</kbd> throw the whole stack, <kbd>H</kbd> controls card, <kbd>F3</kbd> or <kbd>`</kbd> debug numbers.'],
    ['Wizard: keyboard', '<kbd>Arrows</kbd> walk, <kbd>.</kbd> roll-dodge (invulnerable; standing still at a mound, stick pile or bush it digs instead), <kbd>Y</kbd> skill tree.'],
    ['Swap jobs', 'Hold <kbd>X</kbd> (or Start on a pad) for 1.5s. Then arrows + <kbd>.</kbd> use / <kbd>,</kbd> throw drive the Builder, and WASD + <kbd>Space</kbd> roll + clicking on the right half drive the Wizard.'],
    ['Gamepads', 'The Builder pad: stick move, A pick up (hold to sweep; with a building selected: place in front; hold with Belt to lay belts), B throw (LT + B: whole stack), X use, right stick cycle targets, X in the tree: undo the last deposit, LB/RB slot, RT next member of a family slot, Back demolish, Y tree. The Wizard pad: stick move, A roll, Y tree. Hold Start to swap. (Which controller plays which job is chosen on the player screen before each game.)'],
  ],
};
UI.howPage = function (tab) {
  const tabs = Object.keys(HOWTO);
  tab = tab || tabs[0];
  let body = '';
  if (HOWTO[tab]) body = HOWTO[tab].map(h => '<h3>' + h[0] + '</h3><p>' + h[1] + '</p>').join('');
  else {
    const uses = {
      wood: 'Every building, belts (1 each), Cauldron brews',
      stone: 'Every building, Armor',
      iron: 'Fire Harnesser, Forge, Anvil, Station, Charger, Sorter, Altar, Batteries, Armor',
      shard: 'Rare: only from landmarks and elites. Sorter, Summoning Altar, Boss Sigil',
      core: 'Once per Stronghold per save. Costs of Spawner III and Summoning',
      sigil: 'Spell Portal: summons the Primal Chimera beside the Wizard',
      air: 'Spell Portal: Air Gust. Skill Portal: currency. Charger fuel, recipes',
      water: 'Spell Portal: Water Spray. Skill Portal: currency. Charger fuel, recipes',
      fire: 'Spell Portal: Fireball. Skill Portal: currency. Charger fuel, recipes',
      earth: 'Spell Portal: Boulder. Skill Portal: currency. Charger fuel, recipes',
    };
    body = '<div class="uses">' + Object.keys(uses).map(k => '<div>' + UI.img(k, 32) + '<b>' + itemName(k) + '</b><span>' + uses[k] + '</span></div>').join('') + '</div>';
    const byM = {};
    for (const id in CFG.recipes) (byM[CFG.recipes[id].machine] = byM[CFG.recipes[id].machine] || []).push(id);
    for (const m in byM) {
      body += '<h3>' + CFG.buildings[m].name + '</h3><div class="recs big">' + byM[m].map(id => {
        const R = CFG.recipes[id];
        return '<span class="rec">' + Object.keys(R.in).map(k => UI.img(k, 24) + (R.in[k] > 1 ? 'x' + R.in[k] : '')).join(' ') + ' > ' + UI.img(R.out, 24) + ' <b>' + recipeName(id) + '</b>' + (R.power ? ' <i>' + R.power + UI.img('ic_bolt', 12) + '</i>' : '') + '</span>';
      }).join('') + '</div>';
    }
    body += '<p class="dim">Eggs hatch into creatures when sent through the Spell Portal (never the Skill Portal). Health Potion heals 35, Greater Elixir heals 80, Armor Plate +35 armor, Heavy Plate +70 armor. Each combo spell must be unlocked in the Skill Tree before the Forge can make it.</p>';
  }
  $('menuHow').innerHTML = '<h2>HOW TO PLAY</h2><div class="tabs">' + tabs.map(t => '<button class="tab' + (t === tab ? ' on' : '') + '" data-t="' + t + '">' + t + '</button>').join('') + '</div><div class="howBody">' + body + '</div><button class="big ghost back">BACK</button>';
  $('menuHow').querySelectorAll('.tab').forEach(b => { b.onclick = () => { AU.sfx('tab'); UI.howPage(b.dataset.t); }; });
  $('menuHow').querySelector('.back').onclick = () => UI.menuPage('menuMain');
  UI.menuPage('menuHow');
};
UI.buildMenu = function () {
  $('mContinue').onclick = () => { const s = UI.lastSlot(); if (s) Players.open(() => Main.loadGame(s)); };
  $('mNew').onclick = () => UI.slotPage('new');
  $('mLoad').onclick = () => UI.slotPage('load');
  $('mHow').onclick = () => UI.howPage();
  $('mSet').onclick = () => { UI.settingsPage($('menuSet'), () => UI.menuPage('menuMain')); UI.menuPage('menuSet'); };
  document.querySelectorAll('#menu button').forEach(b => b.addEventListener('mouseenter', () => AU.sfx('blip')));
};
// volume sliders, shared by the title menu and the pause menu
UI.settingsPage = function (box, back) {
  const s = AU.settings, row = (k, icon, label) => '<label>' + UI.img(icon, 24) + label + ' <b>' + Math.round(s[k] * 100) + '%</b><input data-k="' + k + '" type="range" min="0" max="100" value="' + Math.round(s[k] * 100) + '"></label>';
  box.classList.remove('wideCtl');
  box.innerHTML = '<h2>SETTINGS</h2>' + row('sfx', 'ic_sound', 'SOUND') + row('music', 'ic_music', 'MUSIC') +
    '<button class="big ghost ctl">' + UI.img('ic_pad', 20) + 'CONTROLS</button><button class="big ghost back">BACK</button>';
  box.querySelectorAll('input').forEach(inp => {
    inp.oninput = () => { (inp.dataset.k === 'sfx' ? AU.setSfx : AU.setMusic)(inp.value / 100); inp.previousElementSibling.textContent = inp.value + '%'; };
  });
  box.querySelector('[data-k="sfx"]').onchange = () => AU.sfx('pickup');
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
    [K('E'), 'Use: hand-gather a Harnesser, tap to crank, turn a belt or machine, switch recipe, set a Sorter filter'],
    [K('1') + ' - ' + K('7') + ' &nbsp;or&nbsp; ' + K('WHEEL'), 'Pick a hotbar slot (Hand, Belt, then the building families)'],
    [K('[') + ' ' + K(']'), 'Previous / next hotbar slot'],
    [K('Q') + ' &nbsp;(' + K('SHIFT') + ' back)', 'Next member of a family slot (or the wheel over the slot)'],
    [K('R'), 'Turn the belt or building under the cursor (in front of you on a pad: X), or the one you are about to place. Turns the Splitter while its settings are open'],
    [K('CLICK') + ' &nbsp;/&nbsp; ' + K('ENTER'), 'Place the selected building / belt (Enter: on the tile in front). Drag to lay belts'],
    [K('B') + ' &nbsp;/&nbsp; ' + K('DELETE'), 'Demolish mode (full refund)'],
    [K('TAB') + ' &nbsp;(' + K('SHIFT') + ' back)', 'Cycle through nearby targets'],
    [K('ESC'), 'Close / cancel the tool, then pause'],
  ]],
  ['WIZARD: KEYBOARD', [
    [K('ARROWS'), 'Walk'],
    [K('.'), 'Roll (invulnerable). Standing still at a mound, stick pile or bush: dig. At a shrine: tap on the ring'],
    [K('Y'), 'Wizard Skill Tree'],
  ]],
  ['PLAYER SELECT (before each game)', [
    [K('LEFT') + ' ' + K('RIGHT') + ' &nbsp;or stick', 'Move your controller to the Builder side, the middle (the keyboard then plays any job nobody else has) or the Wizard side'],
    [K('ENTER') + ' &nbsp;/&nbsp; ' + K('A'), 'Next step; then up / down picks a row and left / right tries a cosmetic on. Enter / A again = ready'],
    [K('ESC') + ' &nbsp;/&nbsp; ' + K('B'), 'Back'],
    ['Cosmetics', 'Unlocked by achievements (see the ACHIEVEMENTS button). They never change how the game plays'],
  ]],
  ['BOTH PLAYERS', [
    [K('T') + ' &nbsp;/&nbsp; ' + K('Y'), 'Builder / Wizard Skill Tree (the whole game pauses while one is open)'],
    [K('H'), 'Show or hide the controls card'],
    [K('X') + ' &nbsp;hold 1.5s', 'Swap jobs. Then: Builder arrows, ' + K('.') + ' pick up, ' + K(',') + ' throw, ' + K('/') + ' use. Wizard WASD, ' + K('SPACE') + ' roll, click the right half to walk'],
    [K('ESC'), 'Pause menu (Resume, Settings, Save &amp; Title). Losing window focus pauses too'],
  ]],
  ['SKILL TREE', [
    [K('CLICK'), 'Buy a skill (or A on a pad)'],
    [K('RIGHT-CLICK'), 'Pin a skill to that side (RB on a pad)'],
    [K('Q'), 'Take the last Skill Portal deposit back out (pad X)'],
    [K('ESC') + ' ' + K('T') + ' ' + K('Y'), 'Close (pad B / Y)'],
  ]],
  ['SPLITTER SETTINGS', [
    [K('DRAG'), 'Slide the bar: the left number is the share for the pink side, the right number the cyan side'],
    [K('A') + ' ' + K('D') + ' &nbsp;or stick / d-pad', 'Nudge the split by 5'],
    [K('R') + ' &nbsp;/&nbsp; ' + K('E') + ' ' + K('ESC'), 'Turn the Splitter / close (pad X turns, Y flips 180 / 90, A or B closes)'],
    [K('180') + ' ' + K('90'), 'Whether the two sides are opposite (2 axes) or at a right angle (4 corners); TURN steps through every orientation'],
  ]],
  ['GAMEPAD: BUILDER', [
    [K('STICK') + ' ' + K('D-PAD'), 'Walk'],
    [K('A'), 'Pick up (hold to sweep). With a building selected: place in front (hold with Belt to lay belts)'],
    [K('B') + ' &nbsp;/&nbsp; ' + K('LT') + ' + ' + K('B'), 'Throw (hold = rapid) / throw the whole stack. Cancels hand-gathering'],
    [K('X'), 'Use'],
    [K('RIGHT STICK') + ' &nbsp;or ' + K('R3'), 'Flick to cycle targets'],
    [K('LB') + ' ' + K('RB'), 'Previous / next hotbar slot'],
    [K('RT'), 'Next member of a family slot'],
    [K('BACK'), 'Demolish mode'],
    [K('Y'), 'Builder Skill Tree (stick / d-pad moves the focus, A buys, RB pins, X undoes, B closes)'],
  ]],
  ['GAMEPAD: WIZARD', [
    [K('STICK') + ' ' + K('D-PAD'), 'Walk'],
    [K('A'), 'Roll / dig / shrine tap'],
    [K('Y'), 'Wizard Skill Tree'],
    [K('START') + ' &nbsp;hold', 'Swap jobs (either pad)'],
  ]],
  ['DEBUG (for now)', [
    [K('F3') + ' &nbsp;or&nbsp; ' + K('`'), 'Toggle the debug overlay: XP and packets per minute, bank and portal rates, time to the next affordable skill, the next event, creature counts'],
    [K('F4') + ' &nbsp;with the overlay open', 'Dev bot: plays the Wizard (pad 2) so one person can test the factory solo. Press again to turn it off'],
    [K('F12') + ' &nbsp;console', 'In the browser console, <code>__wands</code> is the test hook:'],
    ['<code>__wands.start(slot)</code>', 'Start a new game in slot 1-3'],
    ['<code>__wands.deliver(kind)</code>', 'Send an item through the Spell Portal, e.g. <code>"fire"</code>'],
    ['<code>__wands.bank(kind, n)</code>', 'Bank n of an item in the Skill Portal'],
    ['<code>__wands.egg(kind)</code>', 'Deliver an Egg, e.g. <code>"egg_zephyr"</code>'],
    ['<code>__wands.bot("wizard")</code>', 'Dev bot on (<code>null</code> = off); <code>__wands.step</code> then plays the Wizard too'],
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
UI.slotPage = function (mode) {
  const box = $('menuSlots');
  box.innerHTML = '<h2>' + (mode === 'new' ? 'NEW GAME' : 'LOAD GAME') + '</h2>';
  for (let i = 1; i <= 3; i++) {
    const s = UI.slotInfo(i);
    const b = document.createElement('button');
    b.className = 'big slot';
    if (mode === 'new') {
      b.innerHTML = slotLabel(i, s) + (s ? '<em>' + UI.img('ic_warn', 16) + 'OVERWRITE</em>' : '<em>START</em>');
      if (s) b.classList.add('warn');
      b.onclick = () => Players.open(() => Main.newGame(i));   // who is playing + their looks first
    } else {
      b.innerHTML = slotLabel(i, s);
      if (!s || s.old) b.disabled = true; else b.onclick = () => Players.open(() => Main.loadGame(i));
    }
    box.appendChild(b);
  }
  const back = document.createElement('button'); back.className = 'big ghost back'; back.textContent = 'BACK';
  back.onclick = () => UI.menuPage('menuMain');
  box.appendChild(back);
  UI.menuPage('menuSlots');
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
UI.splitB = null;
UI.openSplit = function (b) {
  UI.splitB = b;
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
UI.splitSet = function (v) {
  const b = UI.splitB;
  if (!b) return;
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (v !== b.split) { b.split = v; b.pop = 0.15; UI.changed(); }
  UI.splitSync();
};
UI.splitAng = function (a) {
  const b = UI.splitB;
  if (!b || b.ang === a) return;
  b.ang = a; b.pop = 0.2; AU.sfx('blip'); UI.changed(); UI.splitSync();
};
UI.splitTurn = function () {
  const b = UI.splitB;
  if (!b) return;
  b.dir = (b.dir + 1) % 4; b.pop = 0.2; AU.sfx('blip'); UI.changed();
};
UI.splitSync = function () {
  const b = UI.splitB;
  if (!b) return;
  const [ca, cb] = FA.splitCol, r = $('splitRange');
  if (+r.value !== b.split) r.value = b.split;
  r.style.background = 'linear-gradient(90deg,' + ca + ' ' + b.split + '%,' + cb + ' ' + b.split + '%)';
  $('splitM180').classList.toggle('on', b.ang !== 90); $('splitM90').classList.toggle('on', b.ang === 90);
  $('splitA').textContent = b.split; $('splitBv').textContent = 100 - b.split;
};
// the little iso diagram: the tile with an arrow on each output side in that side's colour (turns with the Splitter)
UI.splitTick = function (dt) {
  const b = UI.splitB;
  if (!b) return;
  if (G.fac.bld.indexOf(b) < 0) { UI.closeSplit(); return; }
  if (+$('splitRange').value !== b.split) UI.splitSync();
  const c = $('splitDia'), x = c.getContext('2d'), t = performance.now() / 1000, cx = 160, cy = 78, hw = 54, hh = 27;
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = '#4f7a3c';
  x.beginPath(); x.moveTo(cx, cy - hh); x.lineTo(cx + hw, cy); x.lineTo(cx, cy + hh); x.lineTo(cx - hw, cy); x.closePath(); x.fill();
  x.strokeStyle = '#1a0f28'; x.lineWidth = 4; x.stroke();
  x.imageSmoothingEnabled = false;
  const spr = SP.b_splitter;
  if (spr) x.drawImage(spr.c, cx - 30, cy - 78, 60, 102);   // the sprite's base diamond sits at (10, 26)
  const sides = FA.splitSides(b), pct = [b.split, 100 - b.split];
  sides.forEach((d, i) => {
    const dd = DIRS[d], sx = (dd[0] - dd[1]), sy = (dd[0] + dd[1]), m = Math.hypot(sx * hw, sy * hh), nx = sx * hw / m, ny = sy * hh / m;
    const px = cx + sx * hw * 1.45, py = cy + sy * hh * 1.45, k = pct[i] > 0 ? 1 + 0.18 * (Math.sin(t * 5) * 0.5 + 0.5) : 0.7;
    x.globalAlpha = pct[i] > 0 ? 1 : 0.35;
    for (const [s, col] of [[1.35, '#1a0f28'], [1, FA.splitCol[i]]]) {
      x.fillStyle = col; x.beginPath();
      x.moveTo(px + nx * 22 * s * k, py + ny * 22 * s * k);
      x.lineTo(px - ny * 18 * s * k - nx * 10 * s, py + nx * 18 * s * k - ny * 10 * s);
      x.lineTo(px + ny * 18 * s * k - nx * 10 * s, py - nx * 18 * s * k - ny * 10 * s);
      x.closePath(); x.fill();
    }
    x.globalAlpha = 1;
  });
};
