'use strict';
// 4-PLAYER ELEMENT EFFECTS (loaded after mode4run.js; nothing here runs unless G.m4 is set).
//
// The 15 spell FORMS are exactly what they are in 2P. On top of them, in 4P only:
//  1. TRAITS. Every element a spell contains puts its trait on the foes it hits, and each can be read off the effect:
//       FIRE  = burn (a damage-over-time that glows on the foe) and seeking (steerable shots hunt a foe)
//       WATER = slow (a blue slowed foe) and a trickle of sustain (the caster heals a little as it lands)
//       AIR   = push (foes are shoved away) and mobility (the caster runs faster for a moment)
//       EARTH = crush (a short daze) and persistence (ground effects last longer, impacts scar the ground)
//     Singles carry none of this (they already express their own element the 2P way: the Seeker homes, the Wave slows and heals, the Gust pushes, the Boulder crushes): they are the
//     cheap insurance and cast the same in every hand.
//  2. ATTUNEMENT. Each Wizard picked TWO elements in the lobby (fixed for the save: G.seats[s].att). It decides how his spells come out:
//       a pair that is EXACTLY his two elements  = the TRUE FORM: the 2P shape at its strongest (both traits x CFG.mode4.elem.trueK, damage x trueDmg)
//       a pair with ONE of his elements          = LED by that element: the same recipe takes that element's SHAPE (table SHAPE: e.g. Air + Fire cast by a Fire / Water Wizard
//                                                  is a short wide steam BLAST, cast by an Air / Earth Wizard a long narrow TORNADO CONE) and that element's trait x leadK
//       the one pair he has no element in (his complement) = the plain 2P form
//       a triple (it always holds one or two of his elements) and the Nova (everybody's) = the 2P form with his elements' traits x leadK
//     Refraction happens at CAST time through whoever casts (a delivered spell lies in the wilds as a pickup: either Wizard can walk onto it), never at delivery.
const EX = CFG.mode4.elem;
const PAIR_FORM = {   // by leading element: how the same recipe is shaped (multipliers on CFG.spells[spell] numbers; a dotted key reaches a nested number) and what the form is called
  flamethrower: { fire: { name: 'STEAM BLAST', k: { half: 1.7, range: 0.6, t: 0.55, dps: 1.7 } }, air: { name: 'TORNADO CONE', k: { half: 0.55, range: 1.45, t: 1.25, dps: 0.75 } } },
  steam: { fire: { name: 'FIRE MINE', k: { dmg: 1.5, r: 1.25, 'cloud.t': 0.6 } }, water: { name: 'FOG MINE', k: { dmg: 0.75, r: 1.1, 'cloud.r': 1.5, 'cloud.t': 1.8 } } },
  sandstorm: { air: { name: 'GALE BOOMERANG', k: { dmg: 0.8, reach: 1.3, out: 0.85, back: 0.85, curve: 1.2 } }, earth: { name: 'GRIT BOOMERANG', k: { dmg: 1.45, r: 1.3, reach: 0.75, out: 1.15, back: 1.15 } } },
  magma: { fire: { name: 'EMBER BOMB', k: { dmg: 1.3, blobs: 1.6, 'pool.t': 0.8 } }, earth: { name: 'LAVA FLOW', k: { sr: 1.3, dmg: 1.15, 'pool.t': 1.8 } } },
  tempest: { air: { name: 'GALE TEARS', k: { speedMul: 1.4, dps: 0.8, life: 0.8 } }, water: { name: 'RAIN TEARS', k: { dps: 1.2, life: 1.4, slow: 1.15 } } },
  mud: { water: { name: 'BOG ORBS', k: { slow: 1.2, slowT: 1.5, dmg: 0.8, orbs: 1.34 } }, earth: { name: 'ROCK ORBS', k: { dmg: 1.4, push: 1.2, t: 1.4, orbs: 0.67 } } },
};
M4.PAIR_FORM = PAIR_FORM;
// how wizard wi's cast of `spell` comes out: null (not 4P / a single), else { kind: 'true' | 'lead' | 'multi' | 'plain', lead, leads, str (trait strength by element), name, att, ... }
M4.expression = function (spell, wi) {
  if (!G || !G.m4 || G.menu) return null;
  const els = SPELL_EL[spell] || [];
  const seat = M4.seatW(wi || 0), q = G.seats && G.seats[seat], att = q && q.att && q.att.length === 2 ? q.att : null;
  if (els.length < 2) return { spell, wi: wi || 0, seat, els: els.slice(), att: null, kind: 'single', lead: null, leads: [], str: {}, name: null, healN: 0 };   // singles never refract and carry no trait (they already express their own element)
  const str = {};
  for (const e of els) str[e] = 1;
  const x = { spell, wi: wi || 0, seat, els: els.slice(), att: att ? att.slice() : null, kind: 'plain', lead: null, leads: [], str, name: null, healN: 0 };
  if (!att) return x;
  const shared = els.filter(e => att.indexOf(e) >= 0);
  if (els.length === 2) {
    if (shared.length === 2) { x.kind = 'true'; x.leads = shared; x.lead = shared[0]; for (const e of els) str[e] = EX.trueK; x.name = SPELLS[spell].toUpperCase() + ' (TRUE FORM)'; }
    else if (shared.length === 1) { x.kind = 'lead'; x.lead = shared[0]; x.leads = shared; str[x.lead] = EX.leadK; x.name = (PAIR_FORM[spell] && PAIR_FORM[spell][x.lead] ? PAIR_FORM[spell][x.lead].name : SPELLS[spell].toUpperCase()); }
  } else if (shared.length) { x.kind = 'multi'; x.lead = shared[0]; x.leads = shared; for (const e of shared) str[e] = EX.leadK; }
  return x;
};
// ---------- the form: CFG.spells numbers for this cast ----------
const dig = (o, path, f) => { const ks = path.split('.'); let t = o; for (let i = 0; i < ks.length - 1; i++) { t = t && t[ks[i]]; } const k = ks[ks.length - 1]; if (t && typeof t[k] === 'number') t[k] = f(t[k], k); };
const spellS0 = WZ.spellS;
WZ.spellS = function (spell) {
  const S = spellS0(spell), x = M4.cur;
  if (!x || x.spell !== spell || (x.kind !== 'lead' && x.kind !== 'true')) return S;
  const o = JSON.parse(JSON.stringify(S));
  if (x.kind === 'lead') {
    const f = PAIR_FORM[spell] && PAIR_FORM[spell][x.lead];
    if (f) for (const p in f.k) dig(o, p, (v, k) => (k === 'blobs' || k === 'orbs' ? Math.max(1, Math.round(v * f.k[p])) : v * f.k[p]));
  } else for (const p of ['dmg', 'dps']) dig(o, p, v => v * EX.trueDmg);   // the true form hits harder
  return o;
};
// ---------- casting ----------
M4.cur = null;
const cast0 = WZ.cast;
WZ.cast = function (spell) {
  if (!G.m4 || G.menu) return cast0(spell);
  const x = M4.expression(spell, G.wi || 0);
  M4.cur = x;
  try { cast0(spell); } finally { M4.cur = null; }
  if (x) M4.castCue(x);
};
// the cue on a refracted cast: WHAT = the form's name over his head in the lead's colour with its ingredients, WHY = the lead element's packet and "VIOLET:" (who), NEXT = the
// Builder's hit report at the Spell Portal says whose cast it was (FA.landed)
M4.castCue = function (x) {
  const w = G.w, q = G.seats[x.seat], el = x.lead && ELEM[x.lead] ? x.lead : null;
  if (x.str.air) w.hasteT = EX.haste.t * x.str.air;   // Air: he runs faster for a moment
  if (x.kind === 'plain' || x.kind === 'single' || !x.name) return;
  FA.fb('refract');
  w.fx_.push({ type: 'title', x: w.x, y: w.y - 0.9, text: q.name + ': ' + x.name, col: el ? ELEM[el].color : q.col, t: 0, dur: 1.6 });
  x.els.forEach((e, i) => WZ.icon(w.x + (i - (x.els.length - 1) / 2) * 0.7, w.y - 1.5, 'pk_' + e));
  if (el) { WZ.ring(w.x, w.y, 1.8, ELEM[el].color, 0.4); WZ.epuff(w.x, w.y, el, 8); }
};
// Air's mobility ticks down with his other clocks
const wandTick0 = WZ.wandTick;
WZ.wandTick = function (dt) { wandTick0(dt); const w = G.w; if (w.hasteT > 0) w.hasteT = Math.max(0, w.hasteT - dt); };
// Earth: a ground effect of a spell with Earth in it lasts longer
const zone0 = WZ.zone;
WZ.zone = function (o) {
  const x = WZ.ctx && WZ.ctx.x;
  if (x && x.str.earth && o && !o.hostile && o.t) o = Object.assign({}, o, { t: o.t * (1 + (EX.persist - 1) * (x.str.earth >= EX.trueK ? 1.5 : 1)) });
  return zone0(o);
};
// Fire: a shot that can steer hunts a foe (the Meteor's fragments and the Magma's blobs are Boulder shots: the 2P code already steers anything with p.seek)
const proj0 = WZ.proj;
WZ.proj = function (o) {
  const p = proj0(o), x = p.ctx && p.ctx.x;
  if (x && x.str.fire && p.kind === 'boulder' && !p.seek) { p.seek = EX.seek.range; p.turn = EX.seek.turn * x.str.fire; }
  return p;
};
// ---------- what a hit does ----------
const hurt0 = WZ.hurtE;
WZ.hurtE = function (e, d, kx, ky, quiet) {
  const r = hurt0.apply(this, arguments), c = WZ.ctx;
  if (c && c.x && c.x.kind !== 'single' && e && !e.dead && !G.menu) M4.trait(e, c.x);
  return r;
};
M4.trait = function (e, x) {
  const w = G.w, t = w.t, S = x.str;
  if (S.fire) { e.burnT = Math.max(e.burnT || 0, EX.burn.t * S.fire); e.burnD = Math.max(e.burnD || 0, EX.burn.dps * S.fire); }
  if (S.water) WZ.slowE(e, Math.min(0.8, EX.slow.amt * S.water), EX.slow.t);
  if (e.t4 > t) return;   // the one-shot parts once per foe per EX.gap seconds (a zone ticking on a foe would stack them every frame)
  e.t4 = t + EX.gap;
  if (S.water && x.healN < EX.heal.max && w.hp < WZ.maxHp()) { x.healN++; w.hp = Math.min(WZ.maxHp(), w.hp + WZ.maxHp() * EX.heal.pct * S.water); }
  if (S.air) { const dx = e.x - w.x, dy = e.y - w.y, dd = Math.hypot(dx, dy) || 1, k = e.boss ? 0.25 : e.kb !== undefined ? e.kb : 1; e.kx += dx / dd * EX.push * S.air * k; e.ky += dy / dd * EX.push * S.air * k; }
  if (S.earth) { if (!e.boss) e.dazeT = Math.max(e.dazeT || 0, EX.daze * S.earth); WZ.mark(e.x, e.y, EX.scar); }
  for (const el in S) if (Math.random() < 0.5) WZ.epuff(e.x, e.y, el, 2);   // you can see which elements are in it
};
// burning foes take their damage over time (as the Wizard who set them alight: a fire spell's context, so kills count)
const BURN = { spell: 'burn', el: ['fire'], hits: 0, kills: 0, weak: 0 };
M4.worldTick = function (dt) {
  const en = G.w.enemies;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (!(e.burnT > 0) || e.dead) continue;
    e.burnT -= dt;
    if (Math.random() < dt * 8) WZ.epuff(e.x, e.y, 'fire', 1);
    const c = WZ.ctx; WZ.ctx = BURN;
    WZ.hurtE(e, e.burnD * dt, 0, 0, true);
    WZ.ctx = c;
    if (e.burnT <= 0) e.burnD = 0;
  }
};
// ---------- the Collection Book: what each spell does in each Wizard's hands ----------
// [{ seat, name, att, kind, form, lead, traits: [elements] }] for a spell id
M4.bookRows = function (spell) {
  const rows = [];
  for (let wi = 0; wi < 2; wi++) {
    const seat = M4.seatW(wi), x = M4.expression(spell, wi), q = G.seats[seat];
    if (!x || x.kind === 'single') continue;
    const form = x.kind === 'true' ? 'TRUE FORM: ' + SPELLS[spell] + ' at its strongest' : x.kind === 'lead' ? x.name + ' (' + ELEM_WORD[x.lead] + ' leads)' : x.kind === 'multi' ? SPELLS[spell] + ' with ' + x.leads.map(e => ELEM_WORD[e]).join(' + ') + ' stronger' : SPELLS[spell] + ' (plain: none of his elements)';
    rows.push({ seat, name: q.name, col: q.col, att: x.att, kind: x.kind, form, traits: x.els });
  }
  return rows;
};
