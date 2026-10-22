// Variables tab: every number in the game's CFG (js/config.js) on a slider. The tool page loads config.js pristine, so
// these are the shipped defaults; changes are saved as overrides (overrides/tuning.json -> tuning.js, applied by
// config.js the moment CFG exists) and pushed live into the preview. js/config.js itself is never edited.
//
// Paths: "world.spawnStart", "factorySizes.0.1", "tree.#water.xp" (# = the array element with that id, so skill-tree
// edits survive reordering the tree).
import { $, h, say, autosaver } from './common.js';
import { preview } from './preview.js';
import { explain } from './var-help.js';

const panel = $('#panel-vars');
const savedEl = h('span', { class: 'saved' });
export const tools = h('span', { style: 'display:flex;gap:8px;align-items:center' }, savedEl);

// layout constants of the 8-bit pipeline: changing them breaks the renderer rather than tuning anything
const SKIP = new Set(['W', 'H', 'HALF', 'FT', 'WT']);
// read once when a game or the world starts: changing them needs a reload (or a new game for the factory size)
const ON_RELOAD = /^(start\.|harvest\.\w+\.count|forage\.\w+\.count|marks\.(camps|shrines|crypts|spacing)|factorySizes|WW|WH)/;
const NOTES = {
  world: 'Spawning, respawns and terrain speed in the wilds.', enemies: 'Per foe: hp, speed, dmg, xp and spawn weight w.',
  spells: 'Every number a delivered spell uses (damage, radius, projectiles, slows).', tree: 'Skill-tree costs: xp, pay (banked spells), tiers (XP per tier).',
  buildings: 'Costs, cycle time and power draw.', recipes: 'Inputs, craft time and power per recipe.', upgrade: 'What one tier of each upgrade track is worth.',
};

export const DEF = {};       // path -> default number
const entries = [];   // { path, group, label, value }
let values = {};      // path -> overridden number
const rows = new Map();

function walk(o, path, group, label) {
  if (typeof o === 'number') { DEF[path] = o; entries.push({ path, group, label, value: o }); return; }
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) {
    o.forEach((v, i) => {
      const key = v && typeof v === 'object' && v.id ? '#' + v.id : String(i);
      walk(v, path + '.' + key, group, label ? label + ' > ' + (v && v.name ? v.name : key) : (v && v.name ? v.name : key));
    });
    return;
  }
  for (const k of Object.keys(o)) walk(o[k], path ? path + '.' + k : k, group || k, label ? label + ' > ' + k : (group ? k : ''));
}
// lone top-level numbers (satchel, beltTime, reach...) share one "general" group instead of a group each
for (const k of Object.keys(CFG)) if (!SKIP.has(k)) walk(CFG[k], k, typeof CFG[k] === 'number' ? 'general' : k, typeof CFG[k] === 'number' ? k : '');

function rangeFor(v) {
  const a = Math.abs(v);
  if (a === 0) return { min: 0, max: 10, step: 0.1 };
  if (Number.isInteger(v)) return { min: Math.min(0, v * 4), max: Math.max(10, a * 4), step: 1 };
  if (a < 0.01) return { min: 0, max: Math.max(0.05, a * 5), step: 0.0005 };
  if (a < 0.1) return { min: 0, max: Math.max(0.5, a * 5), step: 0.005 };
  if (a < 1) return { min: 0, max: Math.max(1, Math.ceil(a * 4)), step: 0.01 };
  return { min: 0, max: Math.ceil(a * 4), step: a < 10 ? 0.05 : 0.5 };
}
const fmt = v => String(Math.round(v * 10000) / 10000);

const saver = autosaver('/api/tuning', () => ({ values }), savedEl, j => j.values + ' changed');

// live: write one value into the preview's CFG (the game reads most of them every frame)
function pushLive(path) {
  const w = preview.win(), W = w && w.__wands;
  if (!W || !w.OV) return;
  w.OV.tune(W.CFG, { [path]: path in values ? values[path] : DEF[path] });
}
preview.onBoot.push(() => { const w = preview.win(); if (w && w.OV && w.__wands) w.OV.tune(w.__wands.CFG, values); });

export function setValue(path, v) {
  if (!isFinite(v)) return;
  if (Math.abs(v - DEF[path]) < 1e-12) delete values[path]; else values[path] = v;
  pushLive(path);
  syncRow(path);
  updateCount();
  saver.schedule();
}
function syncRow(path) {
  const r = rows.get(path); if (!r) return;
  const v = path in values ? values[path] : DEF[path];
  r.el.classList.toggle('set', path in values);
  if (+r.range.max < v) r.range.max = v;
  if (+r.range.min > v) r.range.min = v;
  if (document.activeElement !== r.range) r.range.value = v;
  if (document.activeElement !== r.num) r.num.value = fmt(v);
}

// ---------- panel ----------
const search = h('input', { type: 'search', placeholder: 'filter (e.g. spawn, fireball, tree.#water)', spellcheck: 'false' });
const onlySet = h('input', { type: 'checkbox' });
const countEl = h('span', { class: 'hint' });
const list = h('div', {});
function updateCount() { const n = Object.keys(values).length; countEl.textContent = n + ' changed of ' + entries.length; }

function build() {
  panel.textContent = '';
  panel.append(
    h('div', { class: 'hint', style: 'margin-bottom:6px' }, 'Every number in CFG (js/config.js). Changes apply live to the preview and save to ', h('code', {}, 'overrides/tuning.json'), '. Rows marked ', h('em', { style: 'color:#7aa6d8;font-style:normal' }, 'reload'), ' are read when the world or a game starts: press Reload screen.'),
    h('div', { class: 'vtools' }, search, h('label', { class: 'chk', style: 'display:flex;gap:4px;align-items:center;color:var(--mute)' }, onlySet, 'changed only')),
    h('div', { class: 'vtools' }, countEl, h('span', { style: 'flex:1' }), h('button', { class: 'danger', onclick: resetAll }, 'Reset all')),
    list);
  const groups = new Map();
  for (const e of entries) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); }
  for (const [g, items] of groups) {
    const det = h('details', { class: 'vgroup', open: items.length <= 12 ? true : null },
      h('summary', {}, g + ' ', h('small', {}, '(' + items.length + ')' + (NOTES[g] ? '  ' + NOTES[g] : ''))));
    for (const e of items) {
      const rg = rangeFor(e.value);
      const range = h('input', { type: 'range', min: rg.min, max: rg.max, step: rg.step });
      const num = h('input', { type: 'number', step: rg.step });
      const el = h('div', { class: 'vrow', 'data-path': e.path },
        h('span', { class: 'k', title: e.path + '   (default ' + fmt(e.value) + ')' }, e.label || e.path, ON_RELOAD.test(e.path) ? h('em', {}, 'reload') : null),
        range, num, h('button', { class: 'x', title: 'Back to the default (' + fmt(e.value) + ')', onclick: () => setValue(e.path, DEF[e.path]) }, 'x'),
        explain(e.path) ? h('div', { class: 'd' }, explain(e.path)) : null);
      range.addEventListener('input', () => setValue(e.path, +range.value));
      num.addEventListener('change', () => setValue(e.path, +num.value));
      rows.set(e.path, { el, range, num, det });
      det.append(el);
    }
    list.append(det);
  }
  for (const p of rows.keys()) syncRow(p);
  updateCount();
  filter();
}
function filter() {
  const q = search.value.trim().toLowerCase();
  const dets = new Map();
  for (const [p, r] of rows) {
    const show = (!q || p.toLowerCase().includes(q) || r.el.textContent.toLowerCase().includes(q)) && (!onlySet.checked || p in values);
    r.el.hidden = !show;
    if (show) dets.set(r.det, true);
  }
  for (const det of list.children) { det.hidden = !dets.has(det); if (q || onlySet.checked) det.open = dets.has(det); }
}
search.addEventListener('input', filter);
onlySet.addEventListener('change', filter);
function resetAll() {
  if (!Object.keys(values).length || !confirm('Put all ' + Object.keys(values).length + ' changed variables back to their defaults?')) return;
  const old = Object.keys(values);
  values = {};
  for (const p of old) { pushLive(p); syncRow(p); }
  updateCount(); filter(); saver.schedule();
  say('All variables back to their defaults.');
}

// the value the preview / game will use for a CFG path: the saved override, else the shipped default
export const getV = path => path in values ? values[path] : DEF[path];

export function init(saved) {
  values = {};
  for (const [p, v] of Object.entries((saved && saved.values) || {})) if (p in DEF && typeof v === 'number') values[p] = v;
  const unknown = Object.keys((saved && saved.values) || {}).filter(p => !(p in DEF));
  if (unknown.length) say('Ignoring ' + unknown.length + ' saved variable(s) that no longer exist in CFG: ' + unknown.slice(0, 3).join(', '), true);
  build();
  savedEl.textContent = Object.keys(values).length + ' changed';
}
export function activate() {}
export function deactivate() { saver.flush(); }
