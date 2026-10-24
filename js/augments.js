'use strict';
// The Wizard's own loot and verbs (plain WZ extensions, loaded after creatures.js). Everything here is plain data in G (G.aug, G.hold, G.flags.glow, G.w.boulders,
// G.w.tmod) so it survives JSON and the photo test:
//  - AUGMENTS (CFG AUGS): garments in four slots (hat, robe, boots, charm) that give him a new VERB, never a number. One drops, guaranteed, from the first kill of
//    its source (a deed, not a dice roll) and never again. They are carried in his own wardrobe (G.aug.own / worn), not the Stockpile; swapping is free.
//  - OFFERINGS (G.aug.off[el]): dropped by that element's creatures; delivering one to a Shrine of the same element claims it.
//  - WARD KEYS (G.aug.key[el]): the first elite of an element drops that element's key; it opens the matching Stronghold's arena and is never used up.
//  - the held-spell slot (G.hold): unlocked by the first Warden to fall.
WZ.augFresh = () => ({
  own: {}, worn: { hat: '', robe: '', boots: '', charm: '' }, off: { air: 0, water: 0, fire: 0, earth: 0 }, key: { air: false, water: false, fire: false, earth: false },
  got: {}, cd: { phoenix: 0 },   // got: what has already dropped (augment ids, 'key_<el>'), so it never drops twice; cd.phoenix: seconds until the Feather can save him again
});
// a save's augment state with every field defaulted and checked (an old save simply has none)
WZ.augFix = function (a) {
  const f = WZ.augFresh();
  if (!a || typeof a !== 'object') return f;
  for (const id in a.own || {}) if (AUGS[id] && a.own[id]) f.own[id] = true;
  for (const sl of AUG_SLOTS) { const id = a.worn && a.worn[sl[0]]; if (id && AUGS[id] && AUGS[id].slot === sl[0] && f.own[id]) f.worn[sl[0]] = id; }
  for (const el of ELEMS) { f.off[el] = Math.max(0, (a.off && a.off[el]) | 0); f.key[el] = !!(a.key && a.key[el]); }
  for (const k in a.got || {}) if (a.got[k]) f.got[k] = true;
  for (const id in f.own) f.got[id] = true;
  for (const el of ELEMS) if (f.key[el]) f.got['key_' + el] = true;
  f.cd.phoenix = Math.max(0, +(a.cd && a.cd.phoenix) || 0);
  return f;
};
WZ.has = id => !!(G && G.aug && G.aug.worn[AUGS[id].slot] === id);   // is it on right now?
WZ.isLoot = k => k.startsWith('aug_') || k.startsWith('off_') || k.startsWith('key_');

// ---------- where things drop from ----------
// the elements a creature belongs to: a crafted creature's order, a biome foe's own element; the Warden, the Chimera and Splitter minis have none
WZ.elemsOf = function (e) {
  if (e.mini || e.warden || e.boss) return [];
  const c = CFG.creatures[e.type];
  if (c) return c.order.slice();
  return BIOME_EL[e.type] ? [BIOME_EL[e.type]] : [];
};
// does a kill of e fall under the augment's source? a line = the basic creature of that element and its pairs (wild or crafted); an id = that one creature
WZ.srcMatch = function (e, a) {
  if (e.mini || e.warden || e.boss) return false;
  if (a.src.id) return e.type === a.src.id;
  const c = CFG.creatures[e.type];
  if (c) return c.order.length <= 2 && c.order.indexOf(a.src.line) >= 0;
  return BIOME_EL[e.type] === a.src.line;
};
// the drop table of one enemy type, for the Collection Book (it asks the same functions the kills do, so the two cannot disagree)
WZ.dropInfo = function (type) {
  const e = { type }, els = WZ.elemsOf(e), D = CFG.enemies[type] || {};
  return { type, els, gem: D.gem || [0, 0], off: els.length ? CFG.aug.offering.chance : 0, aug: AUG_ORDER.filter(id => WZ.srcMatch(e, AUGS[id])) };
};
// what a death pays out of the Wizard's own loot classes (called from WZ.onDeath): the augment of every source this kill is the first of,
// an Offering (a modest chance from normals, always from elites of an element) and the Ward Key of an element's first elite
WZ.lootDrops = function (e) {
  if (e.mini || e.warden || e.boss) return;
  const A = G.aug, els = WZ.elemsOf(e);
  for (const id of AUG_ORDER) if (!A.got[id] && WZ.srcMatch(e, AUGS[id])) { A.got[id] = true; WZ.drop('aug_' + id, e.x, e.y, 1); }
  if (!els.length) return;
  if (e.elite) {
    for (const el of els) {
      WZ.drop('off_' + el, e.x, e.y, 1);
      if (!A.got['key_' + el]) { A.got['key_' + el] = true; WZ.drop('key_' + el, e.x, e.y, 1); }
    }
  } else if (Math.random() < CFG.aug.offering.chance) WZ.drop('off_' + pickOf(els), e.x, e.y, 1);
};

// ---------- picking things up ----------
WZ.gainAug = function (id, quiet) {
  const A = G.aug, a = AUGS[id], w = G.w;
  A.own[id] = true; A.got[id] = true;
  if (!A.worn[a.slot]) A.worn[a.slot] = id;   // into an empty slot straight away
  if (quiet) return;
  const msg = a.name + '! ' + a.verb;
  UI.toast(msg, 'R', 'aug_' + id); UI.toast('The Wizard found the ' + a.name, 'L', 'aug_' + id);
  WZ.ring(w.x, w.y, 2.4, a.col, 0.5); WZ.puff(w.x, w.y, a.col, 18); WZ.icon(w.x, w.y, 'aug_' + id);
  w.fx_.push({ type: 'title', x: w.x, y: w.y, text: a.name.toUpperCase() + '!', col: a.col, t: 0, dur: 1.8 });
  AU.sfx('chest'); UI.changed();
};
WZ.collect = function (dr) {   // the Wizard reached a loot drop
  const A = G.aug, w = G.w, k = dr.kind, el = k.slice(4);
  if (k.startsWith('aug_')) WZ.gainAug(el);
  else if (k.startsWith('off_')) {
    A.off[el] += dr.val || 1; AU.sfx('el_' + el); WZ.icon(w.x, w.y, k);
    if (!G.flags.offerTip) { G.flags.offerTip = true; UI.toast('An Offering! Carry it to a ' + ELEM_WORD[el] + ' Shrine and press roll beside it', 'R', k); }
  } else if (k.startsWith('key_')) {
    A.key[el] = true; WZ.ring(w.x, w.y, 2.2, ELEM[el].color, 0.5); WZ.puff(w.x, w.y, ELEM[el].color, 14); WZ.icon(w.x, w.y, k);
    UI.toast(KEY_NAME(el) + '! It opens the ' + ELEM_WORD[el] + ' Stronghold arena (it is never used up)', 'R', k); UI.toast('The Wizard found the ' + KEY_NAME(el), 'L', k);
    AU.sfx('chest');
  }
  UI.changed();
};
// loot still lying in the wilds when the run ends (or the game is saved) is his anyway, like shards
WZ.bankLoot = function (drops) {
  const A = G.aug;
  for (const dr of drops) {
    if (!WZ.isLoot(dr.kind)) continue;
    const el = dr.kind.slice(4);
    if (dr.kind.startsWith('aug_')) WZ.gainAug(el, true); else if (dr.kind.startsWith('off_')) A.off[el] += dr.val || 1; else A.key[el] = true;
  }
};
// wear or take off (free, any time). Wearing something into an occupied slot swaps it
WZ.wear = function (id) {
  const A = G.aug, a = AUGS[id];
  if (!A.own[id]) return false;
  A.worn[a.slot] = A.worn[a.slot] === id ? '' : id;
  AU.sfx('blip'); UI.changed();
  if (G.w && !G.w.dead) { WZ.puff(G.w.x, G.w.y, a.col, 6); }
  return true;
};

// ---------- Offerings at Shrines ----------
WZ.shrineAt = function () {   // an unclaimed Shrine within reach whose Offering he is carrying
  const w = G.w, M = CFG.marks;
  if (w.dead) return null;
  return WZ.marks.find(m => m.type === 'shrine' && w.lm[m.id].state !== 'done' && G.aug.off[m.el] > 0 && Math.hypot(w.x - m.x, w.y - m.y) < M.shrineR) || null;
};
WZ.shrineOffer = function (m) {
  const w = G.w, s = w.lm[m.id], col = ELEM[m.el].color;
  G.aug.off[m.el]--;
  s.flash = 0.5;
  WZ.ring(m.x, m.y, 2.6, col, 0.5); WZ.puff(m.x, m.y, col, 12); WZ.icon(m.x, m.y - 0.6, 'off_' + m.el);
  AU.sfx('shrine');
  WZ.claim(m);
};

// ---------- the keeps' doors ----------
WZ.doorLocked = m => G.w.lm[m.id].state !== 'done' && !G.aug.key[m.el];
WZ.doorTick = function (dt) {   // an invisible wall round a locked arena: without the Ward Key he cannot walk in
  const w = G.w, K = CFG.strong;
  for (const m of WZ.marks) {
    if (m.type !== 'stronghold') continue;
    const s = w.lm[m.id];
    if (s.lockT > 0) s.lockT -= dt;
    if (!WZ.doorLocked(m) || w.dead) continue;
    const dx = w.x - m.x, dy = w.y - m.y, d = Math.hypot(dx, dy);
    if (d >= K.arenaR) continue;
    const k = (K.arenaR + 0.03) / (d || 1);
    w.x = d ? m.x + dx * k : m.x + K.arenaR + 0.03; w.y = d ? m.y + dy * k : m.y;
    w.vx = 0; w.vy = 0; w.target = null;
    if (!(s.lockT > 0)) {
      s.lockT = 0.9; WZ.ring(m.x, m.y, K.arenaR, ELEM[m.el].color, 0.4); WZ.icon(w.x, w.y, 'key_' + m.el); AU.sfx('error');
      if (w.t - (s.toastAt2 || -99) > 8) { s.toastAt2 = w.t; UI.toast('The ' + ELEM_WORD[m.el] + ' Stronghold is locked: it needs the ' + KEY_NAME(m.el), 'R', 'key_' + m.el); UI.toast('The Wizard needs the ' + KEY_NAME(m.el), 'L', 'key_' + m.el); }
    }
  }
};

// ---------- verbs ----------
// Tide-Walking Boots / Bogwalker Shroud: what the Wizard may step on is decided while HE moves (WZ.pass is false for everybody else)
WZ.slideW = function (o, nx, ny, r) {
  WZ.pass.water = WZ.has('tide'); WZ.pass.vine = WZ.has('bog');
  const hit = WZ.slide(o, nx, ny, r);
  WZ.pass.water = false; WZ.pass.vine = false;
  return hit;
};
// taking the boots (or the shroud) off in the middle of a lake: the water washes him up on the nearest dry spot
WZ.washAshore = function () {
  const w = G.w;
  if (w.dead || w.jump || w.blink) return;
  WZ.pass.water = WZ.has('tide'); WZ.pass.vine = WZ.has('bog');
  const bad = WZ.wet(w.x, w.y);
  WZ.pass.water = false; WZ.pass.vine = false;
  if (!bad) return;
  for (let r = 1; r <= 18; r++) for (let i = 0; i < 16; i++) {
    const a = i / 16 * 6.283, x = w.x + Math.cos(a) * r, y = w.y + Math.sin(a) * r;
    if (x < 1 || y < 1 || x > CFG.WW - 1 || y > CFG.WH - 1 || WZ.blocked(x, y, CFG.wizard.radius)) continue;
    WZ.puff(w.x, w.y, '#bfe6ff', 12); w.x = x; w.y = y; w.vx = 0; w.vy = 0; w.target = null;
    WZ.puff(x, y, '#bfe6ff', 8); AU.sfx('thud');
    return;
  }
};
// Gale Circlet: the roll becomes a blink. It crosses water and chasms but stops short of walls, cracked rock, vine tangles and a locked door
WZ.blinkStop = function (x, y) {
  const t = WZ.tile(x, y);
  if (t === T_WALL || t === T_VINE) return true;
  const K = CFG.strong;
  for (const m of WZ.marks) if (m.type === 'stronghold' && WZ.doorLocked(m) && Math.hypot(x - m.x, y - m.y) < K.arenaR) return true;
  return false;
};
WZ.blinkStart = function () {   // returns true when it blinked (false: nowhere to land, so he just rolls)
  const w = G.w, B = CFG.aug.blink, ux = w.rdx, uy = w.rdy, r = CFG.wizard.radius;
  let far = B.dist;
  for (let d = 0.25; d <= B.dist; d += 0.25) if (WZ.blinkStop(w.x + ux * d, w.y + uy * d)) { far = d - 0.5; break; }
  for (let d = far; d >= B.min; d -= 0.25) {
    const x = w.x + ux * d, y = w.y + uy * d;
    if (x < 1 || y < 1 || x > CFG.WW - 1 || y > CFG.WH - 1 || WZ.blocked(x, y, r) || (WZ.tile(x, y) === T_SCORCH && !WZ.has('ember'))) continue;   // never lands in lava
    w.blink = { sx: w.x, sy: w.y, tx: x, ty: y, t: 0, T: B.T };
    w.roll = B.T + 0.12;   // a few i-frames after he lands
    WZ.ring(w.x, w.y, 1.2, '#e6f8ff', 0.3); WZ.puff(w.x, w.y, '#e6f8ff', 8);
    G.stats.blinks = (G.stats.blinks || 0) + 1;
    return true;
  }
  return false;
};
// Static Cloak: a foe that strikes him is thrown back by a static burst (it does no damage)
WZ.staticBurst = function () {
  const w = G.w, S = CFG.aug.stat;
  if (w.t < (w.statT || 0)) return;
  w.statT = w.t + S.cd;
  WZ.ring(w.x, w.y, S.r, '#fff27a', 0.35); AU.sfx('zap_combo');
  for (const e of w.enemies) {
    if (e.dead || e.fall > 0) continue;
    const dx = e.x - w.x, dy = e.y - w.y, d = Math.hypot(dx, dy);
    if (d > S.r + e.rad) continue;
    const kb = e.kb !== undefined ? e.kb : e.boss ? 0.08 : e.elite ? 0.4 : 1, m = d || 1;
    e.kx += dx / m * S.push * kb; e.ky += dy / m * S.push * kb; e.cd = Math.max(e.cd, 0.8);
    w.fx_.push({ type: 'bolt', pts: [[w.x, w.y], [e.x, e.y]], t: 0, dur: 0.3, col: '#fff27a' });
  }
};
// Phoenix Feather: death is cancelled on the spot (once per CFG.aug.phoenix.cd seconds of play)
WZ.phoenixSave = function () {
  const w = G.w, A = G.aug, P = CFG.aug.phoenix;
  if (!WZ.has('phoenix') || A.cd.phoenix > 0) return false;
  A.cd.phoenix = P.cd;
  w.hp = Math.max(1, Math.ceil(WZ.maxHp() * P.hp)); w.hurtT = 1.4; w.dead = false; w.roll = 0;
  for (const e of w.enemies) {
    if (e.dead) continue;
    const dx = e.x - w.x, dy = e.y - w.y, d = Math.hypot(dx, dy) || 1;
    if (d < 6) { const kb = e.kb !== undefined ? e.kb : e.boss ? 0.08 : e.elite ? 0.4 : 1; e.kx += dx / d * 14 * kb; e.ky += dy / d * 14 * kb; }
  }
  WZ.ring(w.x, w.y, 4, '#ff9a3a', 0.6); WZ.puff(w.x, w.y, '#ffd23a', 26); WZ.epuff(w.x, w.y, 'fire', 14);
  w.fx_.push({ type: 'beam', x: w.x, y: w.y, col: '#ff9a3a', t: 0, dur: 1.0 });
  w.fx_.push({ type: 'title', x: w.x, y: w.y, text: 'REBORN!', col: '#ffd23a', t: 0, dur: 1.6 });
  AU.sfx('victory'); w.shake = Math.max(w.shake, 0.5);
  G.stats.revives = (G.stats.revives || 0) + 1;
  UI.toast('The Phoenix Feather saved the Wizard! It recharges in ' + Math.round(P.cd / 60) + ' minutes', 'R', 'aug_phoenix'); UI.toast('The Phoenix Feather saved the Wizard', 'L', 'aug_phoenix');
  UI.changed();
  return true;
};
// Stonefist Charm: a Gust shoves loose boulders away and cracks the cracked rock near him open
WZ.gustEffects = function (px, py, r) {
  if (!WZ.has('stone')) return;
  const w = G.w, B = CFG.aug.boulder, WW = CFG.WW;
  let shoved = 0, cracked = 0;
  for (const b of w.boulders) {
    const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);
    if (d > r || d < 0.01) continue;
    const k = B.push * (1.15 - 0.5 * d / r);
    b.vx += dx / d * k; b.vy += dy / d * k; shoved++;
  }
  const cr = r * 0.55;
  for (let ty = Math.floor(py - cr); ty <= Math.floor(py + cr); ty++) for (let tx = Math.floor(px - cr); tx <= Math.floor(px + cr); tx++) {
    if (tx < 0 || ty < 0 || tx >= WW || ty >= CFG.WH || Math.hypot(tx + 0.5 - px, ty + 0.5 - py) > cr) continue;
    const i = ty * WW + tx, m = w.tmod[i];
    if (m && m.k === 'rock') { delete w.tmod[i]; w.tmodN--; cracked++; WZ.puff(tx + 0.5, ty + 0.5, '#8a8a92', 5); }
  }
  if (cracked) { WZ.flowDirty(); w.shake = Math.max(w.shake, 0.3); AU.sfx('wall'); G.stats.cracked = (G.stats.cracked || 0) + cracked; WZ.icon(px, py, 'aug_stone'); }
  else if (shoved) AU.sfx('thud');
};
// loose boulders slide where a Gust sent them, then stop; water and chasms swallow them; they are solid to the Wizard
WZ.boulderTick = function (dt) {
  const w = G.w, B = CFG.aug.boulder;
  for (let i = w.boulders.length - 1; i >= 0; i--) {
    const b = w.boulders[i];
    if (b.vx || b.vy) {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, t = WZ.tile(nx, ny);
      if (t === T_POND || t === T_CHASM) { WZ.puff(nx, ny, t === T_POND ? '#bfe6ff' : '#4a3a6a', 10); AU.sfx('thud'); w.boulders.splice(i, 1); continue; }
      if (WZ.wet(nx, ny)) { b.vx = 0; b.vy = 0; } else { b.x = nx; b.y = ny; }
      const k = Math.exp(-B.friction * dt); b.vx *= k; b.vy *= k;
      if (Math.hypot(b.vx, b.vy) < 0.3) { b.vx = 0; b.vy = 0; }
    }
    if (!w.dead && !w.blink && !w.jump) {
      const dx = w.x - b.x, dy = w.y - b.y, d = Math.hypot(dx, dy), min = B.r + CFG.wizard.radius;
      if (d < min) { const k = d || 0.01; w.x = b.x + dx / k * min; w.y = b.y + dy / k * min; }
    }
  }
};

// ---------- the held-spell slot and the first Warden's glow-up ----------
WZ.glowUp = function (m) {
  const w = G.w;
  G.flags.glow = true; G.hold.on = true;
  w.glowT = CFG.aug.glow.dur;
  w.fx_.push({ type: 'glowup', x: w.x, y: w.y, t: 0, dur: CFG.aug.glow.dur });
  WZ.ring(w.x, w.y, 6, '#fff6c0', 0.9); w.shake = Math.max(w.shake, 0.6);
  FA.pressure(1, '#fff6c0');
  AU.sfx('victory');
  const msg = 'The Wizard glows! He can HOLD a spell now: the next one delivered waits for ' + Main.holdKeyName();
  UI.toast(msg, 'R', 'ic_crown'); UI.toast('The Wizard glows: he can hold one spell now', 'L', 'ic_crown');
};
WZ.hold = function (spell) {   // a delivered spell goes into the empty slot instead of firing
  const w = G.w, p = FA.portal('spell');
  G.hold.spell = spell;
  WZ.ring(w.x, w.y, 1.6, SPELL_COL[spell] || '#ffffff', 0.4); WZ.icon(w.x, w.y, spell); AU.sfx('powerup');
  FA.ipop(p.x + 0.5, p.y + 1.8, [[spell], ['ic_hand']]);
  UI.changed();
};
WZ.fireHeld = function () {
  const w = G.w;
  if (!G.hold || !G.hold.on || !G.hold.spell || !w || w.dead || w.jump) return false;
  const s = G.hold.spell;
  G.hold.spell = null;
  WZ.cast(s);
  UI.changed();
  return true;
};

// ---------- the Kilnsight Mask ----------
WZ.forageSeen = o => !o.hidden || WZ.has('kiln');   // buried caches only exist for a Wizard who can see them

// ---------- every frame (called from WZ.update) ----------
WZ.augTick = function (dt) {
  const A = G.aug;
  if (A.cd.phoenix > 0) A.cd.phoenix = Math.max(0, A.cd.phoenix - dt);
  if (G.w.glowT > 0) G.w.glowT -= dt;
  WZ.washAshore();
  WZ.doorTick(dt);
  WZ.boulderTick(dt);
};
