// Formulas tab: the game's maths on charts and tables, so a mechanic can be tested without setting it up in game.
// Each section mirrors the real formula (the code it copies is named in its blurb) and reads its inputs from CFG
// through the Variables tab's store: a slider here edits the same variable (same autosave to overrides/tuning.json,
// same live push into the preview), a "what-if" slider only exists on this page.
import { $, h, ls } from './common.js';
import { getV, setValue, DEF } from './variables.js';
import { chart, table, stats, note, grid, range, fmt, COL, PAL } from './fcharts.js';

const view = $('#view-formulas');
export const tools = h('span', {});

const ELEMS = ['air', 'water', 'fire', 'earth'];
const V = path => (path in DEF ? getV(path) : 0);
const plain = v => String(Math.round(v * 10000) / 10000);
const S = {};                       // what-if values (persisted)
try { Object.assign(S, JSON.parse(ls.get('formulas', '{}'))); } catch (e) { /* ignore */ }
const saveS = () => ls.set('formulas', JSON.stringify(S));
const num = (k, d) => (typeof S[k] === 'number' ? S[k] : d);
const spellName = k => (typeof SPELLS !== 'undefined' && SPELLS[k]) || k;
const cap1 = s => s[0].toUpperCase() + s.slice(1);

// ---------- shared game formulas (the same maths the game runs) ----------
const F = {
  spawnIv: m => Math.max(V('world.spawnFloor'), V('world.spawnStart') * Math.pow(V('world.spawnMul'), m)),
  hpMul: m => 1 + V('world.hpPerMin') * m,
  pElite: (m, d) => (m * 60 < V('elite.minTime') ? 0 : Math.min(V('elite.max'), V('elite.base') + V('elite.perMin') * m + V('elite.perDist') * d / 100)),
  swift: t => 1 + V('upgrade.swift') * t,
  rate: (el, tier, boost) => 60 / (V('harness.' + el + '.cycle') / F.swift(tier) / boost),   // packets / min of one Harnesser
  gemMul: t => Math.pow(1 + V('upgrade.gems'), t),
  gemExp: (sure, chance, t) => sure + Math.min(V('gemCap'), chance * F.gemMul(t)),
  drainK: heavy => V('batteryMax') / (V('batteryLife') * V('stationGen')) / (heavy ? 1 + V('heavyBattery') : 1),
  chargeDur: types => V('chargeBase') / Math.pow(V('chargeBoost'), Math.max(1, types) - 1),
  hpOf: (id, m) => { const d = CFG.enemies[id]; return V('enemies.' + id + '.hp') * (d.crafted || id === 'boss' || id === 'warden' ? 1 : F.hpMul(m)); },
};
function spellHit(k) {   // the optimistic damage of one cast landing entirely on one foe (a mine is one burst, a boomerang two legs)
  const s = CFG.spells[k], g = f => (f in s ? V('spells.' + k + '.' + f) : 0);
  if (s.dps) return { hit: g('dps'), cast: g('dps') * g('t') };
  const n = k === 'sandstorm' ? 2 : (s.n ? g('n') : 1);
  return { hit: g('dmg'), cast: g('dmg') * n + g('splash') };
}
function spellMult(k, def) {   // WZ.mult for a foe def
  const els = SPELL_EL[k] || [];
  if (def.weak && els.includes(def.weak)) return V('weakMul');
  const dr = CFG.creatures[def.creature] ? CFG.creatures[def.creature].dr : null;
  return (def.resist && els.includes(def.resist) ? V('resistMul') : 1) * (dr ? (Array.isArray(dr) ? dr[0] : dr) : 1);
}

// ---------- parameter controls ----------
function rangeFor(v) {
  const a = Math.abs(v);
  if (a === 0) return { min: 0, max: 10, step: 0.1 };
  if (Number.isInteger(v)) return { min: Math.min(0, v * 4), max: Math.max(10, a * 4), step: 1 };
  if (a < 0.01) return { min: 0, max: Math.max(0.05, a * 5), step: 0.0005 };
  if (a < 0.1) return { min: 0, max: Math.max(0.5, a * 5), step: 0.005 };
  if (a < 1) return { min: 0, max: Math.max(1, Math.ceil(a * 4)), step: 0.01 };
  return { min: 0, max: Math.ceil(a * 4), step: a < 10 ? 0.05 : 0.5 };
}
// p: { cfg: 'path', label } | { key, label, min, max, step, def } | { key, label, type: 'select', options: [[v, text]], def, rebuild? } | { key, type: 'check', label, def }
function control(p, onChange, onRebuild) {
  if (p.head) return h('h3', {}, p.head);
  if (p.cfg) {
    if (!(p.cfg in DEF)) return h('div', { class: 'warn' }, 'Missing CFG variable: ' + p.cfg);
    const def = DEF[p.cfg], rg = p.min != null ? { min: p.min, max: p.max, step: p.step } : rangeFor(def);
    const range = h('input', { type: 'range', min: rg.min, max: rg.max, step: rg.step }), numEl = h('input', { type: 'number', step: rg.step });
    const row = h('div', { class: 'frow' }, h('span', { class: 'k', title: p.cfg + '   (default ' + fmt(def) + ')' }, p.label || p.cfg), range, numEl,
      h('button', { class: 'x', title: 'Back to the default (' + fmt(def) + ')', onclick: () => { setValue(p.cfg, def); sync(); onChange(); } }, 'x'));
    function sync() { const v = getV(p.cfg); if (+range.max < v) range.max = v; range.value = v; if (document.activeElement !== numEl) numEl.value = plain(v); row.classList.toggle('set', Math.abs(v - def) > 1e-12); }
    range.addEventListener('input', () => { setValue(p.cfg, +range.value); sync(); onChange(); });
    numEl.addEventListener('change', () => { setValue(p.cfg, +numEl.value); sync(); onChange(); });
    sync();
    return row;
  }
  if (p.type === 'select') {
    const sel = h('select', {}, p.options.map(([v, t]) => h('option', { value: v }, t)));
    sel.value = String(S[p.key] != null && p.options.some(o => String(o[0]) === String(S[p.key])) ? S[p.key] : p.def);
    S[p.key] = sel.value;
    sel.addEventListener('change', () => { S[p.key] = sel.value; saveS(); p.rebuild ? onRebuild() : onChange(); });
    return h('div', { class: 'frow sel' }, h('span', { class: 'k' }, p.label), sel);
  }
  if (p.type === 'check') {
    const c = h('input', { type: 'checkbox' }); c.checked = S[p.key] != null ? !!S[p.key] : !!p.def; S[p.key] = c.checked;
    c.addEventListener('change', () => { S[p.key] = c.checked; saveS(); onChange(); });
    return h('label', { class: 'frow chk' }, c, p.label);
  }
  const range = h('input', { type: 'range', min: p.min, max: p.max, step: p.step }), numEl = h('input', { type: 'number', step: p.step });
  const v0 = num(p.key, p.def); S[p.key] = v0; range.value = v0; numEl.value = fmt(v0);
  const set = v => { if (!isFinite(v)) return; S[p.key] = v; saveS(); range.value = v; if (document.activeElement !== numEl) numEl.value = plain(v); onChange(); };
  range.addEventListener('input', () => set(+range.value)); numEl.addEventListener('change', () => set(+numEl.value));
  return h('div', { class: 'frow what', title: 'A what-if input that only exists on this page' }, h('span', { class: 'k' }, p.label), range, numEl, h('span', { class: 'tag' }, 'what-if'));
}

// ---------- sections ----------
const sections = [];
const add = s => sections.push(s);

// 1 ---- spawn pressure
add({
  id: 'spawn', title: 'Wilds: spawn pressure & scaling', blurb: 'WZ.update spawn timer, WZ.makeEnemy hp scaling, WZ.spawn elite chance. How fast foes appear, how tough they get, and how likely an elite is as a run goes on.',
  params: () => [
    { head: 'Spawning' }, { cfg: 'world.spawnStart', label: 'Seconds between spawns at 0:00' }, { cfg: 'world.spawnMul', label: 'Interval x per minute' }, { cfg: 'world.spawnFloor', label: 'Fastest interval (s)' }, { cfg: 'world.cap', label: 'Foe cap (world.cap)' },
    { head: 'Toughness' }, { cfg: 'world.hpPerMin', label: 'Foe HP growth per minute' },
    { head: 'Elites' }, { cfg: 'elite.minTime', label: 'No elites before (s)' }, { cfg: 'elite.base', label: 'Base chance' }, { cfg: 'elite.perMin', label: '+ per minute' }, { cfg: 'elite.perDist', label: '+ per 100 tiles from spawn' }, { cfg: 'elite.max', label: 'Max chance' },
    { head: 'Chart' }, { key: 'minutes', label: 'Run length (min)', min: 10, max: 240, step: 5, def: 60 }, { key: 'dist', label: 'Wizard distance from spawn (tiles)', min: 0, max: 150, step: 5, def: 60 },
  ],
  draw(out) {
    const T = num('minutes', 60), d = num('dist', 60), xs = range(0, T, Math.max(1, T / 80));
    const floorM = Math.log(V('world.spawnFloor') / V('world.spawnStart')) / Math.log(V('world.spawnMul'));
    let alive = 0, capT = null;   // foes spawned with nobody killing any
    for (let s = 0; s <= T * 60; s += 1) { alive += 1 / F.spawnIv(s / 60); if (capT == null && alive >= V('world.cap')) capT = s / 60; }
    out.append(stats([['Interval hits the floor', floorM > 0 ? floorM : 0, 'minutes'], ['Fastest rate', 60 / V('world.spawnFloor'), 'foes / min'], ['Cap reached if nothing is killed', capT != null ? capT : '> ' + T, 'minutes'], ['Elite chance at the end', F.pElite(T, d) * 100, '% per spawn']]),
      grid(
        chart({ title: 'Foes spawned per minute', yl: 'per min', xl: 'minutes', series: [{ name: 'foes / min', color: COL.acc, pts: xs.map(m => [m, 60 / F.spawnIv(m)]) }] }),
        chart({ title: 'Foe HP multiplier', xl: 'minutes', series: [{ name: 'x HP', color: COL.bad, pts: xs.map(m => [m, F.hpMul(m)]) }] }),
        chart({ title: 'Elite chance per spawn', yl: '%', xl: 'minutes', series: [{ name: 'at this distance', color: COL.ok, pts: xs.map(m => [m, F.pElite(m, d) * 100]) }, { name: 'at spawn (0 tiles)', color: COL.mute, dash: true, pts: xs.map(m => [m, F.pElite(m, 0) * 100]) }, { name: 'at 150 tiles', color: COL.water, dash: true, pts: xs.map(m => [m, F.pElite(m, 150) * 100]) }] }),
        chart({ title: 'Foes spawned in total (if none die)', xl: 'minutes', series: [{ name: 'total', color: COL.water, pts: xs.map(m => { let a = 0; for (let s = 0; s < m * 60; s += 2) a += 2 / F.spawnIv(s / 60); return [m, a]; }) }] })),
      table(['Minute', 'Seconds / spawn', 'Spawns / min', 'HP x', 'Slime HP', 'Stone Golem HP', 'Elite %'],
        [0, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180].filter(m => m <= Math.max(T, 10)).map(m => [m + ':00', F.spawnIv(m), 60 / F.spawnIv(m), F.hpMul(m), F.hpOf('slime', m), F.hpOf('golem', m), F.pElite(m, d) * 100]),
        'Wild foes only: crafted creatures, the Chimera and the Warden keep their listed HP. "Cap reached" ignores kills, so it is the worst case.'));
  },
});

// 2 ---- spells vs foes
add({
  id: 'spells', title: 'Spells: damage vs foes & the Chimera', blurb: 'CFG.spells (WZ.cast) with WZ.mult: weak x2, resisted x0.5, armored creatures only take full damage from their weakness, the Chimera takes x1.6 on its current weakness and x0.4 otherwise. Totals are optimistic: every hit of one cast lands on the same foe.',
  params: () => {
    const foes = Object.keys(CFG.enemies).filter(k => k !== 'boss').map(k => [k, CFG.enemies[k].name + (CFG.enemies[k].weak ? ' (weak ' + CFG.enemies[k].weak + ')' : '')]);
    const sp = Object.keys(CFG.spells).map(k => [k, spellName(k)]);
    const sel = S.spell && CFG.spells[S.spell] ? S.spell : 'fireball';
    const fields = Object.keys(CFG.spells[sel]).filter(f => typeof CFG.spells[sel][f] === 'number').map(f => ({ cfg: 'spells.' + sel + '.' + f, label: f }));
    return [{ head: 'Target' }, { key: 'foe', type: 'select', label: 'Foe', options: foes, def: 'golem' }, { key: 'min', label: 'Run minute (wild foes scale)', min: 0, max: 120, step: 1, def: 15 },
      { head: 'Multipliers' }, { cfg: 'weakMul', label: 'Weak x' }, { cfg: 'resistMul', label: 'Resisted x' }, { cfg: 'boss.weakMul', label: 'Chimera on weakness x' }, { cfg: 'boss.otherMul', label: 'Chimera off weakness x' }, { cfg: 'enemies.boss.hp', label: 'Chimera HP' },
      { head: 'Edit a spell' }, { key: 'spell', type: 'select', label: 'Spell', options: sp, def: 'fireball', rebuild: true }, ...fields];
  },
  draw(out) {
    const foe = S.foe && CFG.enemies[S.foe] ? S.foe : 'golem', def = CFG.enemies[foe], hp = F.hpOf(foe, num('min', 15)), bossHp = V('enemies.boss.hp');
    const rows = Object.keys(CFG.spells).map(k => {
      const { hit, cast } = spellHit(k), m = spellMult(k, def), eff = cast * m;
      return { k, hit, cast, m, eff, casts: eff > 0 ? Math.ceil(hp / eff) : Infinity, bw: Math.ceil(bossHp / (cast * V('boss.weakMul'))), bo: Math.ceil(bossHp / (cast * V('boss.otherMul'))) };
    });
    out.append(stats([[def.name + ' HP', hp, 'at minute ' + num('min', 15)], ['Weak to', def.weak || 'nothing'], ['Resists', def.resist || 'nothing'], ['Chimera HP', bossHp]]),
      grid(chart({ title: 'Casts to kill ' + def.name, yl: 'casts', bars: true, labels: rows.map(r => spellName(r.k)), series: [{ name: 'casts', color: COL.acc, vals: rows.map(r => r.casts) }] }, 230),
        chart({ title: 'Casts to kill the Chimera', yl: 'casts', bars: true, labels: rows.map(r => spellName(r.k)), series: [{ name: 'on its weakness', color: COL.ok, vals: rows.map(r => r.bw) }, { name: 'off its weakness', color: COL.bad, vals: rows.map(r => r.bo) }] }, 230)),
      table(['Spell', 'Elements', 'Dmg / hit', 'Max / cast', 'x vs ' + def.name, 'Dmg / cast', 'Casts to kill', 'Chimera (weak)', 'Chimera (off)'],
        rows.map(r => [spellName(r.k), (SPELL_EL[r.k] || []).join(' + '), r.hit, r.cast, r.m, r.eff, r.casts, r.bw, r.bo]), 'Zone spells (Sandstorm, Mud, Blizzard) count dps x seconds. Gust has no damage worth the name: it is a shove.'));
  },
});

// 3 ---- harnessers, belts, crafting
add({
  id: 'harness', title: 'Factory: harnessers, belts & machine planning', blurb: 'FA.cycle (cycle / Swift Harnessing / Shrine + Portal Storm boost), FA.beltTime, Adjacency Overdrive. Includes a planner: how many Harnessers does one machine need to run flat out?',
  params: () => {
    const rec = Object.keys(CFG.recipes).filter(k => Object.keys(CFG.recipes[k].in).some(i => ELEMS.includes(i))).map(k => [k, CFG.recipes[k].out + ' (' + CFG.recipes[k].machine + ')']);
    return [{ head: 'Harnessers' }, ...ELEMS.map(e => ({ cfg: 'harness.' + e + '.cycle', label: cap1(e) + ' cycle (s)' })), { cfg: 'upgrade.swift', label: 'Swift Harnessing per tier' },
      { cfg: 'marks.shrineBoost', label: 'Shrine boost' }, { cfg: 'events.storm.boost', label: 'Portal Storm boost' }, { cfg: 'overdrive', label: 'Adjacency Overdrive' },
      { head: 'Belts' }, { cfg: 'beltTime', label: 'Seconds per tile' }, { cfg: 'upgrade.belts', label: 'Swift Belts per tier' },
      { head: 'Test' }, { key: 'tier', label: 'Swift Harnessing tier', min: 0, max: 8, step: 1, def: 0 }, { key: 'boost', type: 'select', label: 'Boost', options: [['0', 'none'], ['1', 'Shrine'], ['2', 'Portal Storm'], ['3', 'Shrine + Storm']], def: '0' },
      { key: 'belt', label: 'Belt tier', min: 0, max: 6, step: 1, def: 0 }, { key: 'len', label: 'Belt length (tiles)', min: 1, max: 40, step: 1, def: 12 },
      { head: 'Machine planner' }, { key: 'rec', type: 'select', label: 'Recipe', options: rec, def: 'flamethrower' }, { key: 'od', type: 'check', label: 'Battery beside it (Overdrive)', def: false }];
  },
  draw(out) {
    const tier = num('tier', 0), b = +(S.boost || 0), boost = (b & 1 ? 1 + V('marks.shrineBoost') : 1) * (b & 2 ? 1 + V('events.storm.boost') : 1);
    const tiers = range(0, 8, 1), bt = t => V('beltTime') / (1 + V('upgrade.belts') * t);
    const rid = S.rec && CFG.recipes[S.rec] ? S.rec : 'flamethrower', R = CFG.recipes[rid], od = S.od && /forge|cauldron/.test(R.machine) ? 1 + V('overdrive') : 1;
    const time = R.time, perMin = 60 / (time / od);
    const planRows = Object.keys(R.in).filter(i => ELEMS.includes(i)).map(el => { const need = R.in[el] * perMin, per = F.rate(el, tier, boost); return [cap1(el), R.in[el], need, per, need / per, Math.ceil(need / per - 1e-9)]; });
    out.append(stats([['Belt speed', 1 / bt(num('belt', 0)), 'tiles / s'], ['Belt crossing', bt(num('belt', 0)) * num('len', 12), 'seconds for ' + num('len', 12) + ' tiles'], ['Boost multiplier', boost, 'x on harnessers'], ['Machine rate', perMin, R.out + ' / min' + (od > 1 ? ' with Overdrive' : '')]]),
      grid(chart({ title: 'Packets per minute, one Harnesser', yl: 'per min', xl: 'Swift tier', series: ELEMS.map(el => ({ name: cap1(el), color: COL[el], pts: tiers.map(t => [t, F.rate(el, t, boost)]) })) }),
        chart({ title: 'Seconds per belt tile', xl: 'Swift Belts tier', series: [{ name: 's / tile', color: COL.acc, pts: range(0, 6, 1).map(t => [t, bt(t)]) }] })),
      h('h3', {}, 'Planner: ' + R.out + ' at ' + R.machine + ' (' + fmt(time) + 's' + (od > 1 ? ', ' + fmt(time / od) + 's with Overdrive' : '') + ')'),
      table(['Element', 'Per craft', 'Needed / min', 'One Harnesser / min', 'Harnessers (exact)', 'Harnessers (whole)'], planRows,
        'Assumes the machine never waits. Packets from the Stockpile or Harnessers hand-gathered do not count. Power is not modelled here (see the Power tab).'));
  },
});

// 4 ---- power
add({
  id: 'power', title: 'Factory: power & batteries', blurb: 'FA.drain / FA.life / FA.updCell: a Battery lasts batteryLife seconds at a full 10 power; the load is split over every charged Battery; a Battery charges faster with more element types and each packet is worth fuelPerPacket seconds of charging.',
  params: () => [
    { head: 'Batteries' }, { cfg: 'batteryMax', label: 'Battery capacity' }, { cfg: 'batteryLife', label: 'Life at full 10 power (s)' }, { cfg: 'stationGen', label: 'Power per Battery' }, { cfg: 'heavyBattery', label: 'Heavy Batteries bonus' },
    { head: 'Charging' }, { cfg: 'chargeBase', label: 'Charge time, 1 element (s)' }, { cfg: 'chargeBoost', label: 'Faster per extra element' }, { cfg: 'fuelPerPacket', label: 'Charging seconds per packet' },
    { head: 'Test' }, { key: 'load', label: 'Total power drawn', min: 0, max: 40, step: 0.5, def: 8 }, { key: 'stations', label: 'Charged Batteries', min: 1, max: 6, step: 1, def: 2 }, { key: 'heavy', type: 'check', label: 'Heavy Batteries unlocked', def: false },
    { key: 'types', label: 'Element types in the Battery', min: 1, max: 4, step: 1, def: 2 }],
  draw(out) {
    const L = num('load', 8), St = num('stations', 2), heavy = !!S.heavy, types = num('types', 2), k = F.drainK(heavy);
    const supply = V('stationGen') * St, life = L > 0 ? V('batteryMax') / (L / St * k) : Infinity, dur = F.chargeDur(types);
    const drainAll = L * k, fill = V('batteryMax') / dur, chargers = drainAll / fill, ppc = dur / V('fuelPerPacket');
    const pktMin = drainAll / V('batteryMax') * ppc * 60;
    const lifeAt = (Ld, s) => (Ld > 0 ? V('batteryMax') / (Math.min(Ld, V('stationGen') * s) / s * F.drainK(heavy)) : 0);
    out.append(stats([['Supply', supply, 'power from ' + St + ' Battery(ies)' + (L > supply ? ' (BROWNOUT)' : '')], ['One Battery lasts', life, 'seconds at this load'], ['Charge time', dur, 'seconds with ' + types + ' type(s)'], ['Packets per full charge', ppc],
      ['Chargers to keep up', chargers, 'running non-stop'], ['Packets to sustain', pktMin, 'per minute']]),
      grid(chart({ title: 'Battery life vs total load', yl: 'seconds', xl: 'power drawn', series: [1, 2, 3, 4].map((s, i) => ({ name: s + ' Batter' + (s > 1 ? 'ies' : 'y'), color: PAL[i], pts: range(2, 40, 1).map(x => [x, lifeAt(x, s)]).filter(p => p[0] <= V('stationGen') * s) })) }),
        chart({ title: 'Charge time by element types', yl: 'seconds', bars: true, labels: ['1 type', '2 types', '3 types', '4 types'], series: [{ name: 'full charge', color: COL.acc, vals: [1, 2, 3, 4].map(F.chargeDur) }] }),
        chart({ title: 'Packets / min to sustain a load', yl: 'per min', xl: 'power drawn', series: [1, 2, 3, 4].map((t, i) => ({ name: t + ' type' + (t > 1 ? 's' : ''), color: PAL[i + 1], pts: range(0, 40, 2).map(x => [x, x * k / V('batteryMax') * (F.chargeDur(t) / V('fuelPerPacket')) * 60]) })) })),
      note('Lines stop where the Batteries can no longer supply the load. "Chargers to keep up" assumes every Battery is fed the whole time.'));
  },
});

// 5 ---- gems / xp
add({
  id: 'gems', title: 'Economy: XP gems & Gem Wisdom', blurb: 'WZ.gemCount: guaranteed gems + one more with chance (base chance x (1 + upgrade.gems)^tier, capped at gemCap). The XP/min estimate assumes every wild spawn gets killed, so it is a ceiling.',
  params: () => [{ head: 'Gem Wisdom' }, { cfg: 'upgrade.gems', label: 'Chance x per tier (minus 1)' }, { cfg: 'gemCap', label: 'Chance cap' },
    ...['slime', 'shroom', 'sprite', 'imp', 'lurker', 'wisp', 'golem'].map(e => ({ cfg: 'enemies.' + e + '.gem.1', label: CFG.enemies[e].name + ' gem chance' })),
    { head: 'Test' }, { key: 'tier', label: 'Gem Wisdom tier', min: 0, max: 12, step: 1, def: 0 }, { key: 'min', label: 'Minute (for XP / min)', min: 0, max: 120, step: 1, def: 10 }],
  draw(out) {
    const ids = Object.keys(CFG.enemies).filter(k => !CFG.enemies[k].crafted && k !== 'boss' && k !== 'warden'), cr = Object.keys(CFG.creatures).filter(k => CFG.creatures[k].tier === 1), t = num('tier', 0), m = num('min', 10);
    const all = ids.concat(cr), wild = ids.filter(k => CFG.enemies[k].w > 0), wsum = wild.reduce((a, k) => a + CFG.enemies[k].w, 0);
    const avg = wild.reduce((a, k) => a + CFG.enemies[k].w / wsum * F.gemExp(V('enemies.' + k + '.gem.0'), V('enemies.' + k + '.gem.1'), t), 0);
    const e = k => [V('enemies.' + k + '.gem.0'), V('enemies.' + k + '.gem.1')];
    out.append(stats([['Gem chance multiplier', F.gemMul(t), 'at tier ' + t], ['Avg gems per wild kill', avg], ['XP / min at minute ' + m, avg * 60 / F.spawnIv(m), 'if every spawn is killed'], ['Kills for 100 XP', 100 / avg]]),
      grid(chart({ title: 'Expected gems per kill vs Gem Wisdom', yl: 'gems', xl: 'tier', series: all.map((k, i) => ({ name: CFG.enemies[k].name, color: PAL[i % PAL.length], pts: range(0, 12, 1).map(x => [x, F.gemExp(e(k)[0], e(k)[1], x)]) })) }, 240),
        chart({ title: 'Gem chance at this tier', yl: 'chance', bars: true, labels: all.map(k => CFG.enemies[k].name), series: [{ name: 'base', color: COL.mute, vals: all.map(k => e(k)[1]) }, { name: 'tier ' + t, color: COL.acc, vals: all.map(k => Math.min(V('gemCap'), e(k)[1] * F.gemMul(t))) }] }, 240)),
      table(['Foe', 'Guaranteed', 'Base chance', 'Chance now', 'Expected gems', 'Kills per 100 XP'], all.map(k => { const [s, c] = e(k), x = F.gemExp(s, c, t); return [CFG.enemies[k].name, s, c, Math.min(V('gemCap'), c * F.gemMul(t)), x, 100 / x]; })));
  },
});

// 6 ---- skill tree
add({
  id: 'tree', title: 'Economy: skill-tree cost & time to afford', blurb: 'UI.nodeCost: an upgrade tier asks tiers[i] XP and about pk[i] packets split over its elements (tier 1 asks firstTierPay of that), plus its spell combos. Give it an XP and packet income to see how long each track takes. The two scale boxes are what-ifs on top of the shipped prices (costScale itself is applied when the game starts).',
  params: () => [{ head: 'Income' }, { key: 'xpm', label: 'XP / min you earn', min: 1, max: 300, step: 1, def: 40 }, { key: 'pkm', label: 'Packets / min you bank', min: 1, max: 600, step: 1, def: 60 },
    { head: 'Prices' }, { cfg: 'firstTierPay', label: 'Tier 1 packet share' }, { key: 'xs', label: 'XP cost scale (what-if)', min: 0.2, max: 2, step: 0.05, def: 1 }, { key: 'ps', label: 'Packet cost scale (what-if)', min: 0.2, max: 2, step: 0.05, def: 1 },
    { head: 'Per tier effect' }, ...['swift', 'manual', 'belts', 'satchel', 'zoomies', 'hearty', 'gems'].map(u => ({ cfg: 'upgrade.' + u, label: u }))],
  draw(out) {
    const xs = num('xs', 1), ps = num('ps', 1), xpm = num('xpm', 40), pkm = num('pkm', 60);
    const tracks = CFG.tree.filter(n => n.tiers).map(n => {
      const xp = [], pk = [];
      n.tiers.forEach((tx, L) => {
        const kinds = n.kinds[L], per = Math.max(1, Math.round((n.pk ? n.pk[L] : tx) * ps / kinds.length * (L === 0 ? V('firstTierPay') : 1)));
        xp.push(Math.round(tx * xs)); pk.push(per * kinds.length + Object.values((n.combos && n.combos[L]) || {}).reduce((a, b) => a + b, 0));
      });
      return { n, xp, pk, tx: xp.reduce((a, b) => a + b, 0), tp: pk.reduce((a, b) => a + b, 0) };
    });
    const unl = [0, 1].map(c => { const ns = CFG.tree.filter(n => n.col === c && !n.tiers); return { c, tx: ns.reduce((a, n) => a + Math.max(1, Math.round(n.xp * xs)), 0), tp: ns.reduce((a, n) => a + Object.values(n.pay || {}).reduce((x, y) => x + Math.max(1, Math.round(y * ps)), 0), 0), cnt: ns.length }; });
    const cum = (a) => { let s = 0; return a.map((v, i) => [i + 1, s += v]); };
    const eta = (x, p) => Math.max(x / xpm, p / pkm);
    const totX = tracks.reduce((a, t) => a + t.tx, 0) + unl[0].tx + unl[1].tx, totP = tracks.reduce((a, t) => a + t.tp, 0) + unl[0].tp + unl[1].tp;
    out.append(stats([['Whole tree XP', totX], ['Whole tree packets', totP], ['Time to buy everything', eta(totX, totP), 'minutes (the slower of XP / packets)'], ['Bottleneck', totX / xpm > totP / pkm ? 'XP' : 'packets']]),
      grid(chart({ title: 'Cumulative XP by tier', yl: 'XP', xl: 'tier', series: tracks.map((t, i) => ({ name: t.n.name, color: PAL[i % PAL.length], pts: cum(t.xp) })) }, 230),
        chart({ title: 'Cumulative packets by tier', yl: 'packets', xl: 'tier', series: tracks.map((t, i) => ({ name: t.n.name, color: PAL[i % PAL.length], pts: cum(t.pk) })) }, 230),
        chart({ title: 'Minutes to finish each track', yl: 'minutes', bars: true, labels: tracks.map(t => t.n.name).concat(['Factory unlocks', 'Spells']), series: [{ name: 'minutes', color: COL.acc, vals: tracks.map(t => eta(t.tx, t.tp)).concat(unl.map(u => eta(u.tx, u.tp))) }] }, 230)),
      table(['Track', 'Tiers', 'Total XP', 'Total packets', 'Minutes', 'Final bonus'],
        tracks.map(t => [t.n.name, t.n.tiers.length, t.tx, t.tp, eta(t.tx, t.tp), (t.n.id in CFG.upgrade ? fmt(V('upgrade.' + t.n.id) * t.n.tiers.length) + ' (' + t.n.per + ')' : t.n.per)])
          .concat(unl.map(u => [u.c ? 'Spell nodes' : 'Factory unlock nodes', u.cnt + ' nodes', u.tx, u.tp, eta(u.tx, u.tp), '']))),
      note('Spell nodes also cost banked combo spells and Spawner III / Summoning cost Warden Cores; those are not counted. Per-node prices live in Variables as tree.#id.xp / tree.#id.pay.'));
  },
});

// 7 ---- creature eggs
add({
  id: 'eggs', title: 'Creatures: Eggs, spawners & production', blurb: 'CFG.creatures: one Egg (1 packet per element) hatches n creatures. Edit n, the craft time and the packet costs straight in the table. HP per packet is the value you get out of the factory; the Harnesser count says how many it takes to keep one Spawner running.',
  params: () => [{ head: 'Limits' }, { cfg: 'crafted.cap', label: 'Crafted creatures alive at once' }, { cfg: 'crafted.queue', label: 'Eggs the Portal holds back' },
    { head: 'Test' }, { key: 'tier', label: 'Swift Harnessing tier', min: 0, max: 8, step: 1, def: 0 }, { key: 'sp', label: 'Spawners of one kind', min: 1, max: 8, step: 1, def: 1 }],
  draw(out) {
    const tier = num('tier', 0), sp = num('sp', 1), ids = Object.keys(CFG.creatures);
    const cell = (path, step) => { const i = h('input', { type: 'number', step: step || 1, class: 'cell' }); i.value = plain(V(path)); i.addEventListener('change', () => { setValue(path, +i.value); this.refresh(); }); return i; };
    const rows = ids.map(id => {
      const c = CFG.creatures[id], n = V('creatures.' + id + '.n') || 1, time = V('creatures.' + id + '.time'), cost = Object.keys(c.cost).reduce((a, el) => a + V('creatures.' + id + '.cost.' + el), 0);
      const hp = V('creatures.' + id + '.hp'), gem = V('creatures.' + id + '.gem.0') + V('creatures.' + id + '.gem.1');
      const perMin = 60 / time, harn = Object.keys(c.cost).map(el => V('creatures.' + id + '.cost.' + el) * perMin / F.rate(el, tier, 1)).reduce((a, b) => a + b, 0);
      return { id, c, n, time, cost, hp, gem, perMin, harn, hpPk: n * hp / cost, gemPk: n * gem / cost, fill: V('crafted.cap') / (n * perMin * sp) };
    });
    out.append(stats([['Cap', V('crafted.cap'), 'alive at once'], ['Best HP per packet', Math.max(...rows.map(r => r.hpPk)), rows.reduce((a, r) => (r.hpPk > a.hpPk ? r : a)).c.name], ['Best gems per packet', Math.max(...rows.map(r => r.gemPk)), rows.reduce((a, r) => (r.gemPk > a.gemPk ? r : a)).c.name]]),
      grid(chart({ title: 'Creature HP per element packet', yl: 'HP', bars: true, labels: rows.map(r => r.c.name), series: [{ name: 'HP / packet', color: COL.ok, vals: rows.map(r => r.hpPk) }] }, 230),
        chart({ title: 'Creatures per minute, one Spawner', yl: 'per min', bars: true, labels: rows.map(r => r.c.name), series: [{ name: 'creatures / min', color: COL.acc, vals: rows.map(r => r.n * r.perMin) }] }, 230)),
      table(['Creature', 'Tier', 'Creatures / Egg', 'Craft time (s)', 'Packets / Egg', ...ELEMS.map(cap1), 'HP each', 'HP / packet', 'Gems / packet', 'Creatures / min', 'Harnessers to feed it', 'Minutes to fill cap (' + sp + ' spawner' + (sp > 1 ? 's' : '') + ')'],
        rows.map(r => [r.c.name, r.c.tier, cell('creatures.' + r.id + '.n'), cell('creatures.' + r.id + '.time'), r.cost, ...ELEMS.map(el => (el in r.c.cost ? cell('creatures.' + r.id + '.cost.' + el) : '')), r.hp, r.hpPk, r.gemPk, r.n * r.perMin, r.harn, r.fill]),
        'Cells with an input are Variables (creatures.<id>.n / time / cost.<element>), saved like any other variable. Harnessers are counted at the Swift tier above with no boost.'));
  },
});

// 8 ---- events
add({
  id: 'events', title: 'Wilds: scheduled events & cycles', blurb: 'WZ.evTick / evGap / evClear: one event every gapMin..gapMax seconds of play time, a rotation of 6, then Cycle 2, 3...; event foes get hp and damage x(1 + scale x (cycle-1)), plus elite / mutation chances and bigger waves per cycle.',
  params: () => [{ head: 'Schedule' }, { cfg: 'events.gapMin', label: 'Shortest gap (s)' }, { cfg: 'events.gapMax', label: 'Longest gap (s)' },
    { head: 'Scaling per cycle' }, { cfg: 'events.scale', label: 'Foe HP / damage' }, { cfg: 'events.eliteAdd', label: 'Elite chance' }, { cfg: 'events.mutAdd', label: 'Mutation chance' }, { cfg: 'events.waveAdd', label: 'Wave size' },
    { head: 'Reward' }, { cfg: 'events.reward.gems', label: 'Gems (cycle 1)' }, { cfg: 'events.reward.perCycle', label: 'Extra gems per cycle' },
    { head: 'Waves' }, { cfg: 'events.migration.waves', label: 'Migration waves' }, { cfg: 'events.migration.n', label: 'Migration foes / wave' }, { cfg: 'events.stampede.bursts', label: 'Stampede bursts' }, { cfg: 'events.stampede.n', label: 'Stampede foes / burst' }, { cfg: 'events.storm.dur', label: 'Portal Storm length (s)' }, { cfg: 'events.storm.gap', label: 'Portal Storm gap (s)' }, { cfg: 'events.storm.n', label: 'Portal Storm foes / drop' },
    { head: 'Chart' }, { key: 'cycles', label: 'Cycles shown', min: 2, max: 16, step: 1, def: 10 }],
  draw(out) {
    const C = num('cycles', 10), cs = range(1, C, 1), avg = (V('events.gapMin') + V('events.gapMax')) / 2 / 60, sc = c => 1 + V('events.scale') * (c - 1), wave = c => 1 + V('events.waveAdd') * (c - 1);
    const foes = c => ({ Migration: V('events.migration.waves') * V('events.migration.n'), Stampede: V('events.stampede.bursts') * V('events.stampede.n'), 'Portal Storm': Math.floor(V('events.storm.dur') / V('events.storm.gap')) * V('events.storm.n') });
    const start = c => (6 * (c - 1) + 1) * avg;
    out.append(stats([['Average gap', avg, 'minutes (events need play time, not clock time)'], ['Rotation length', 6 * avg, 'minutes for one cycle of 6'], ['Cycle 2 starts around', start(2), 'minutes'], ['Cycle ' + C + ' starts around', start(C), 'minutes']]),
      grid(chart({ title: 'Event foe HP / damage and wave size', xl: 'cycle', series: [{ name: 'foe hp & dmg x', color: COL.bad, pts: cs.map(c => [c, sc(c)]) }, { name: 'wave size x', color: COL.water, pts: cs.map(c => [c, wave(c)]) }] }),
        chart({ title: 'Elite and mutation chance', yl: '%', xl: 'cycle', series: [{ name: 'elite', color: COL.acc, pts: cs.map(c => [c, Math.min(100, V('events.eliteAdd') * (c - 1) * 100)]) }, { name: 'mutation', color: COL.ok, pts: cs.map(c => [c, Math.min(100, V('events.mutAdd') * (c - 1) * 100)]) }] }),
        chart({ title: 'Reward gems for clearing', yl: 'gems', xl: 'cycle', series: [{ name: 'gems', color: COL.ok, pts: cs.map(c => [c, V('events.reward.gems') + V('events.reward.perCycle') * (c - 1)]) }] })),
      table(['Cycle', 'HP & dmg x', 'Wave x', 'Elite %', 'Mutation %', 'Migration foes', 'Stampede foes', 'Storm foes', 'Reward gems', 'Shard', 'Starts ~min'],
        cs.map(c => [c, sc(c), wave(c), Math.min(100, V('events.eliteAdd') * (c - 1) * 100), Math.min(100, V('events.mutAdd') * (c - 1) * 100), Math.round(foes(c).Migration * wave(c)), Math.round(foes(c).Stampede * wave(c)), Math.round(foes(c)['Portal Storm'] * wave(c)), V('events.reward.gems') + V('events.reward.perCycle') * (c - 1), c >= 2 ? 'yes' : 'no', start(c)]),
        'Foe counts are before the "two foe types from Cycle 2" rule and any cap the world has. The Elite Hunt and Chimera\'s Brood are fixed-size fights.'));
  },
});

// 9 ---- wizard survival
add({
  id: 'wizard', title: 'Wizard: health, speed & survival', blurb: 'WZ.maxHp / WZ.speed (Hearty Hat, Zoomies), the roll, and touch damage (every touching foe lands about dmg once per touchCd seconds). Armor is spent before health.',
  params: () => [{ head: 'Wizard' }, { cfg: 'wizard.hp', label: 'Base HP' }, { cfg: 'upgrade.hearty', label: 'HP per Hearty tier' }, { cfg: 'wizard.speed', label: 'Base speed' }, { cfg: 'upgrade.zoomies', label: 'Zoomies per tier' },
    { cfg: 'wizard.rollTime', label: 'Roll time (s)' }, { cfg: 'wizard.rollSpeed', label: 'Roll speed x' }, { cfg: 'wizard.rollCd', label: 'Roll cooldown (s)' }, { cfg: 'wizard.armorMax', label: 'Max armor' },
    { cfg: 'world.touchCd', label: 'Touch hit every (s)' }, { cfg: 'pickups.potion.heal', label: 'Potion heals' }, { cfg: 'pickups.elixir.heal', label: 'Elixir heals' },
    { head: 'Test' }, { key: 'hearty', label: 'Hearty Hat tier', min: 0, max: 8, step: 1, def: 0 }, { key: 'zoom', label: 'Zoomies tier', min: 0, max: 6, step: 1, def: 0 }, { key: 'armor', label: 'Armor held', min: 0, max: 100, step: 5, def: 0 }, { key: 'touch', label: 'Foes touching him', min: 1, max: 12, step: 1, def: 3 }],
  draw(out) {
    const he = num('hearty', 0), zo = num('zoom', 0), ar = Math.min(num('armor', 0), V('wizard.armorMax')), tn = num('touch', 3);
    const hp = t => V('wizard.hp') + V('upgrade.hearty') * t, sp = t => V('wizard.speed') * (1 + V('upgrade.zoomies') * t), roll = t => sp(t) * V('wizard.rollSpeed') * V('wizard.rollTime');
    const foes = ['slime', 'shroom', 'sprite', 'imp', 'lurker', 'wisp', 'golem'], avgHit = 1.075;   // touch cooldown is rand(0.85, 1.3) x touchCd
    const ttd = (k, n) => (hp(he) + ar) / (n * V('enemies.' + k + '.dmg') * avgHit / V('world.touchCd'));
    out.append(stats([['Max HP', hp(he)], ['Speed', sp(zo), 'tiles / s'], ['Roll distance', roll(zo), 'tiles (roughly)'], ['Roll uptime', V('wizard.rollTime') / V('wizard.rollCd') * 100, '% of the time can be i-framed'], ['Potions to full', hp(he) / V('pickups.potion.heal')]]),
      grid(chart({ title: 'Seconds until dead vs foes touching', yl: 'seconds', xl: 'foes touching', series: foes.map((k, i) => ({ name: CFG.enemies[k].name, color: PAL[i], pts: range(1, 12, 1).map(n => [n, ttd(k, n)]) })) }, 230),
        chart({ title: 'Max HP and speed by upgrade tier', xl: 'tier', series: [{ name: 'Max HP (Hearty)', color: COL.bad, pts: range(0, 8, 1).map(t => [t, hp(t)]) }, { name: 'Speed x10 (Zoomies)', color: COL.water, pts: range(0, 8, 1).map(t => [t, sp(t) * 10]) }] }, 230)),
      table(['Foe', 'Touch dmg', 'Hits / sec each', 'Dmg / sec with ' + tn + ' touching', 'Seconds to die', 'Hits to die'], foes.map(k => { const d = V('enemies.' + k + '.dmg'); return [CFG.enemies[k].name, d, avgHit ? 1 / (V('world.touchCd') * avgHit) : 0, tn * d / (V('world.touchCd') * avgHit), ttd(k, tn), Math.ceil((hp(he) + ar) / d)]; }),
        'Touch hits average 1.075 x touchCd because each foe rolls 0.85-1.3. Rolling through a hit dodges it, so these are worst cases for a Wizard who never rolls.'));
  },
});

// ---------- shell ----------
const nav = h('div', { class: 'fnav' }), main = h('div', { class: 'fmain' }), head = h('div', { class: 'fhead' }), paramsEl = h('div', { class: 'fparams' }), outEl = h('div', { class: 'fout' });
main.append(head, h('div', { class: 'fbody' }, paramsEl, outEl));
view.append(nav, main);
let cur = null;

function refresh() { outEl.textContent = ''; try { cur.draw.call(cur, outEl); } catch (e) { outEl.append(h('div', { class: 'warn' }, 'This formula failed to draw: ' + e.message)); console.error(e); } }
function build() {
  head.textContent = '';
  head.append(h('h2', {}, cur.title), h('div', { class: 'hint' }, cur.blurb), h('div', { class: 'hint' }, 'Sliders marked with an orange edge change the real variable (same as the Variables tab, saved to overrides/tuning.json). Dashed "what-if" sliders only change this page.'),
    h('div', { style: 'display:flex;gap:8px;margin-top:6px' }, h('button', { class: 'danger', onclick: resetVars }, 'Reset this formula\'s variables')));
  paramsEl.textContent = '';
  for (const p of cur.params()) paramsEl.append(control(p, refresh, () => { build(); refresh(); }));
  refresh();
}
function resetVars() {
  for (const p of cur.params()) if (p.cfg && p.cfg in DEF) setValue(p.cfg, DEF[p.cfg]);
  build();
}
function open(id) {
  cur = sections.find(s => s.id === id) || sections[0];
  cur.refresh = refresh; ls.set('formula', cur.id);
  for (const b of nav.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === cur.id);
  build();
}
export function init() {
  nav.append(h('h3', {}, 'Formulas'), ...sections.map(s => h('button', { 'data-id': s.id, onclick: () => open(s.id) }, s.title)));
  open(ls.get('formula', sections[0].id));
}
export function activate() { if (cur) build(); }   // a Variables edit in between shows up
export function deactivate() {}
