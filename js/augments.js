'use strict';
// The Wizard's own loot and verbs (plain WZ extensions, loaded after creatures.js). Everything here is plain data in G (G.aug, G.flags.glow, G.w.boulders,
// G.w.tmod) so it survives JSON and the photo test:
//  - CORES (core_<el>): the components of his garments. Creatures of an element drop that element's Core (rare from normals, more from pairs / triples, a
//    guaranteed chunk from elites); they fly home to the Stockpile like shards. The Builder forges garments (and Ward Keys) from them at the Armory. A shrine takes
//    one Core of each of the THREE OTHER elements, sent through the Spell Portal one at a time while the Wizard stands near it (G.w.lm[id].fed).
//  - THE WARDEN KEY (wardkey): forged at the Armory from Cores of every element + Iron + Shards (CFG.keyCost). Sent through the portal while he is near the
//    Stronghold it flies down and opens the keep's door for good (G.aug.door).
//  - AUGMENTS (CFG AUGS): garments in four slots (hat, robe, boots, charm) that give him a new VERB, never a number. The Builder forges one at the Armory and
//    sends it through the portal; it lands in the wilds like a creature drop and he wears it by walking onto it. The garment it replaces pops off and flies
//    home to the Stockpile (a tile of its own), where the Builder can pick it up and send it back whenever he likes.
//  - the glow-up the first Warden's fall gives (the held-spell slot it used to come with is gone: the wand, js/wand.js, took its place).
WZ.augFresh = () => ({
  v: 3, worn: { hat: '', robe: '', boots: '', charm: '' }, door: false,   // door: the Stronghold's door has been opened with the Warden Key
  cd: { phoenix: 0 },   // cd.phoenix: seconds until the Feather can save him again
});
// a save's augment state with every field defaulted and checked. An old save (before the Builder forged garments) also hands back what it owned:
// f.legacyOwn = garment ids that were in his wardrobe (they go on the shelf), f.legacyOff = Offerings carried (they come back as Cores)
WZ.augFix = function (a) {
  const f = WZ.augFresh();
  if (!a || typeof a !== 'object') return f;
  const own = {};
  for (const id in a.own || {}) if (AUGS[id] && a.own[id]) own[id] = true;
  for (const sl of AUG_SLOTS) { const id = a.worn && a.worn[sl[0]]; if (id && AUGS[id] && AUGS[id].slot === sl[0] && (a.v >= 2 || own[id])) f.worn[sl[0]] = id; }
  f.door = !!a.door || !!(a.key && ELEMS.some(el => a.key[el]));   // (older saves had one door per keep: any open one opens the one keep there is now)
  f.cd.phoenix = Math.max(0, +(a.cd && a.cd.phoenix) || 0);
  if (!(a.v >= 2)) {
    f.legacyOwn = Object.keys(own).filter(id => f.worn[AUGS[id].slot] !== id);
    f.legacyOff = {}; for (const el of ELEMS) { const n = Math.max(0, (a.off && a.off[el]) | 0); if (n) f.legacyOff[el] = n; }
  }
  return f;
};
WZ.has = id => !!(G && G.aug && G.aug.worn[AUGS[id].slot] === id);   // is it on right now?
WZ.isLoot = k => isCoreKind(k) || isKeyKind(k);   // the precious drops: they come to him from afar, never fade, and are banked when a run ends

// ---------- where things drop from ----------
// the elements a creature belongs to: a crafted creature's order, a biome foe's own element; the Warden, the Chimera and Splitter minis have none
WZ.elemsOf = function (e) {
  if (e.mini || e.warden || e.boss) return [];
  const c = CFG.creatures[e.type];
  if (c) return c.order.slice();
  return BIOME_EL[e.type] ? [BIOME_EL[e.type]] : [];
};
// the chance one normal kill of this creature drops one Core: wild foes least, then basic / pair / triple crafted creatures
WZ.coreChance = function (e) {
  const C = CFG.cores, c = CFG.creatures[e.type];
  if (!WZ.elemsOf(e).length) return 0;
  return !c ? C.wild : c.order.length >= 3 ? C.triple : c.order.length === 2 ? C.pair : C.basic;
};
// the drop table of one enemy type, for the Collection Book (it asks the same functions the kills do, so the two cannot disagree)
WZ.dropInfo = function (type) {
  const e = { type }, els = WZ.elemsOf(e), D = CFG.enemies[type] || {};
  return { type, els, gem: D.gem || [0, 0], core: WZ.coreChance(e), chunk: CFG.cores.elite, garments: AUG_ORDER.filter(id => els.some(el => AUGS[id].make.in['core_' + el])) };
};
// n separate Cores burst out of a kill (each one is picked up, and flies home, on its own)
WZ.dropCores = function (el, n, x, y) { for (let i = 0; i < n; i++) WZ.drop('core_' + el, x, y, 1); };
// what a death pays out of the Wizard's own loot class (called from WZ.onDeath): a Core (a rare chance from normals, a guaranteed chunk of each of its
// elements from elites). Ward Keys are forged at the Armory, they never drop.
WZ.lootDrops = function (e) {
  if (e.mini || e.warden || e.boss) return;
  const els = WZ.elemsOf(e), C = CFG.cores;
  if (!els.length) return;
  if (e.elite) {
    for (const el of els) WZ.dropCores(el, C.elite[0] + Math.floor(Math.random() * (C.elite[1] - C.elite[0] + 1)), e.x, e.y);
  } else if (Math.random() < WZ.coreChance(e)) WZ.dropCores(pickOf(els), 1, e.x, e.y);
};

// ---------- picking things up ----------
WZ.collect = function (dr) {   // the Wizard reached a Core or a Ward Key: it flies home to the Stockpile
  const w = G.w, k = dr.kind, el = k.slice(k.indexOf('_') + 1), n = dr.val || 1;
  FA.toStock(k, n);
  G.stats.cores = (G.stats.cores || 0) + (isCoreKind(k) ? n : 0);
  WZ.icon(w.x, w.y, k); AU.sfx('chest');
  WZ.puff(w.x, w.y, ELEM[el].color, 6);
  if (!G.flags['core_seen_' + el]) { G.flags['core_seen_' + el] = true; UI.toast(CORE_NAME[el] + '! The Builder forges garments and the Warden Key from Cores (the Armory); the other three elements\' Shrines take it', 'R', k); UI.toast('The Wizard found a ' + CORE_NAME[el] + ': it is in the Stockpile', 'L', k); }
  UI.changed();
};
// Cores and Ward Keys still lying in the wilds when the run ends (or the game is saved) are the Stockpile's anyway, like shards; so is a garment nobody walked onto
WZ.bankLoot = function (drops) {
  for (const dr of drops) if (WZ.isLoot(dr.kind)) G.stock[dr.kind] = (G.stock[dr.kind] || 0) + (dr.val || 1);
};
WZ.looseGarments = function () {   // garments delivered but not worn yet: in the air or lying in the wilds
  const w = G.w, out = [];
  if (!w) return out;
  for (const a of w.arcs) if (ITEMS[a.kind] && ITEMS[a.kind].aug) out.push(ITEMS[a.kind].id);
  for (const p of w.pickups) if (ITEMS[p.kind] && ITEMS[p.kind].aug) out.push(ITEMS[p.kind].id);
  return out;
};
// he walked onto a garment: it goes on, and whatever it replaces pops off and flies home to the Stockpile
WZ.wearGarment = function (id) {
  const A = G.aug, a = AUGS[id], w = G.w, old = A.worn[a.slot];
  A.worn[a.slot] = id;
  UI.toast(a.name + '! ' + a.verb, 'R', 'aug_' + id); UI.toast('The Wizard put on the ' + a.name, 'L', 'aug_' + id);
  WZ.ring(w.x, w.y, 2.4, a.col, 0.5); WZ.puff(w.x, w.y, a.col, 18); WZ.icon(w.x, w.y, 'aug_' + id);
  w.fx_.push({ type: 'title', x: w.x, y: w.y, text: a.name.toUpperCase() + '!', col: a.col, t: 0, dur: 1.8 });
  AU.sfx('chest');
  if (old && old !== id) WZ.garmentOff(old);
  G.stats.garments = (G.stats.garments || 0) + 1;
  UI.changed();
};
WZ.garmentOff = function (id) {   // pops off in a ring of sparks, up through the portal over his head and home to the Stockpile (it spills onto the floor if there is no room)
  const w = G.w, a = AUGS[id];
  WZ.ring(w.x, w.y, 1.8, a.col, 0.45); WZ.puff(w.x, w.y, a.col, 10);
  WZ.hsuck('aug_' + id, w.x, w.y, false);
  FA.toStock('aug_' + id, 1);
  AU.sfx('whoosh');
};

// ---------- Cores and keys sent through the Spell Portal ----------
// a shrine takes the Cores of the three OTHER elements (an Air Shrine: Water, Fire and Earth), one each, sent while the Wizard stands within CFG.unlockR of it;
// WZ.shrineNeeds lists the elements it still lacks (its own Core, ones it already has and ones already in the air towards it are refused)
WZ.shrineNeeds = function (m) {
  const fed = G.w.lm[m.id].fed || {};
  return ELEMS.filter(e => e !== m.el && !fed[e]);
};
WZ.shrineFed = m => ELEMS.filter(e => e !== m.el && G.w.lm[m.id].fed && G.w.lm[m.id].fed[e]).length;
// the shrine / keep a Core or Ward Key of this kind would open, if the Wizard is close enough to it (else null: the portal bounces it back)
WZ.unlockTarget = function (k) {
  const w = G && G.w;
  if (!w || w.dead || !(isCoreKind(k) || isKeyKind(k))) return null;
  const el = k.slice(k.indexOf('_') + 1);
  if (isCoreKind(k)) return WZ.marks.find(m => m.type === 'shrine' && w.lm[m.id].state !== 'done' && WZ.shrineNeeds(m).indexOf(el) >= 0 && !w.arcs.some(a => a.mark === m.id && a.kind === k) &&
    Math.hypot(w.x - m.x, w.y - m.y) < CFG.unlockR) || null;
  return WZ.marks.find(m => m.type === 'stronghold' && w.lm[m.id].state !== 'done' && !G.aug.door && !w.arcs.some(a => a.mark === m.id) &&
    Math.hypot(w.x - m.x, w.y - m.y) < CFG.unlockR) || null;
};
WZ.unlockLand = function (a) {   // the Core / key has come down on its shrine / keep
  const w = G.w, m = WZ.marks.find(q => q.id === a.mark);
  if (!m) return;
  const el = m.type === 'shrine' ? a.kind.slice(5) : m.el, col = ELEM[el].color;   // a shrine's colour is the Core that came down on it
  WZ.ring(m.x, m.y, 3, col, 0.5); WZ.puff(m.x, m.y, col, 16); WZ.icon(m.x, m.y - 0.6, a.kind);
  if (m.type === 'shrine') {
    const s = w.lm[m.id];
    if (s.state === 'done') return;
    (s.fed || (s.fed = {}))[el] = true; s.flash = 0.5;
    const have = WZ.shrineFed(m);
    if (have < 3) {
      AU.sfx('chest'); w.shake = Math.max(w.shake, 0.15);
      UI.toast('The ' + ELEM_WORD[m.el] + ' Shrine took a ' + CORE_NAME[el] + ' (' + have + '/3)', 'R', a.kind); UI.toast('The ' + ELEM_WORD[m.el] + ' Shrine took a ' + CORE_NAME[el] + ' (' + have + '/3)', 'L', a.kind);
      UI.changed();
      return;
    }
    AU.sfx('shrine');
    WZ.claim(m);
  } else {
    G.aug.door = true; AU.sfx('chest'); w.shake = Math.max(w.shake, 0.3);
    UI.toast('The Warden Key opened the Stronghold! The Warden waits inside', 'R', a.kind); UI.toast('The Stronghold is open', 'L', a.kind);
    G.stats.unlocked = (G.stats.unlocked || 0) + 1;
    UI.changed();
  }
};

// ---------- the keeps' doors ----------
WZ.doorLocked = m => G.w.lm[m.id].state !== 'done' && !G.aug.door;
WZ.doorTick = function (dt) {   // an invisible wall round a locked arena: until its Ward Key has been sent in he cannot walk in
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
      s.lockT = 0.9; WZ.ring(m.x, m.y, K.arenaR, ELEM[m.el].color, 0.4); WZ.icon(w.x, w.y, 'wardkey'); AU.sfx('error');
      if (w.t - (s.toastAt2 || -99) > 8) { s.toastAt2 = w.t; UI.toast('The Stronghold is locked: the Builder must send the Warden Key through the portal', 'R', 'wardkey'); UI.toast('The Wizard stands at the locked Stronghold: forge and send the Warden Key', 'L', 'wardkey'); }
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

// ---------- the Warden's glow-up ----------
WZ.glowUp = function (m) {
  const w = G.w;
  G.flags.glow = true;
  w.glowT = CFG.aug.glow.dur;
  w.fx_.push({ type: 'glowup', x: w.x, y: w.y, t: 0, dur: CFG.aug.glow.dur });
  WZ.ring(w.x, w.y, 6, '#fff6c0', 0.9); w.shake = Math.max(w.shake, 0.6);
  FA.pressure(1, '#fff6c0');
  AU.sfx('victory');
  UI.toast('The Wizard glows! The Warden is down: the Summoning Altar takes spells now', 'R', 'ic_crown'); UI.toast('The Wizard glows: the Warden is down, the Altar is open to spells', 'L', 'ic_crown');
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
