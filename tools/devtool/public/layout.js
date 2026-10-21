// Layout tab: a visual editor for the game's DOM UI (menus, HUD cards, panels, buttons, text).
// layout-host.js (inside the preview) picks elements and turns drags into CSS patches; this file owns the model
// (overrides/layout.json), the side panel, undo/redo and autosave. The game's own files are never edited: it applies
// overrides/layout.css + the text half (js/overrides.js) on top of its normal styles, so deleting a rule here always
// gets the original look back.
import { $, h, say, autosaver } from './common.js';
import { preview, applyMode } from './preview.js';

const panel = $('#panel-layout');
const savedEl = h('span', { class: 'saved' });
const undoBtn = h('button', { title: 'Undo (Ctrl+Z)', onclick: () => undo() }, 'Undo');
const redoBtn = h('button', { title: 'Redo (Ctrl+Y)', onclick: () => redo() }, 'Redo');
export const tools = h('span', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'seg' }, undoBtn, redoBtn), savedEl);

let model = LayoutModel.emptyModel();
let cur = null;        // description of the selected element ({selector, choices, textNodes, computed, ...})
let target = null;     // the rule selector edits go to (cur.selector, or a broader choice)
let updaters = [];     // refresh the panel's fields from model + cur
const host = () => preview.host;
const focusGame = () => preview.focus();

// ---------- model, undo, save ----------
const undoStack = [], redoStack = [];
let coalesceKey = null, coalesceAt = 0;
const saver = autosaver('/api/layout', () => model, savedEl, j => j.rules + ' rule' + (j.rules === 1 ? '' : 's'));
const snapshot = () => JSON.stringify(model);
function pushUndo(key) {
  const now = performance.now();
  if (key && key === coalesceKey && now - coalesceAt < 1500) { coalesceAt = now; return; }   // one step per drag / typing burst
  undoStack.push(snapshot());
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  coalesceKey = key || null; coalesceAt = now;
}
const endCoalesce = () => { coalesceKey = null; };
function commit() {
  if (host()) host().setModel(model);
  saver.schedule();
  if (host() && cur) host().refresh(); else syncPanel();
  renderRules();
  undoBtn.disabled = !undoStack.length; redoBtn.disabled = !redoStack.length;
}
function mutate(fn, key) {
  pushUndo(key);
  fn();
  model.rules = model.rules.filter(r => (r.css && Object.keys(r.css).length) || (r.text && Object.keys(r.text).length));
  commit();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); model = JSON.parse(undoStack.pop()); endCoalesce(); commit(); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); model = JSON.parse(redoStack.pop()); endCoalesce(); commit(); }
window.addEventListener('keydown', e => {
  if (preview.tab !== 'layout' || !(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

const ruleFor = (sel, create) => {
  let r = model.rules.find(x => x.sel === sel);
  if (!r && create) { r = { sel }; model.rules.push(r); }
  return r;
};
const getCss = prop => { const r = ruleFor(target); return r && r.css ? r.css[prop] : undefined; };
function setCss(props, key) {   // {prop: value | null}; null removes it
  mutate(() => {
    const r = ruleFor(target, true);
    r.css = r.css || {};
    for (const [p, v] of Object.entries(props)) { if (v == null || v === '') delete r.css[p]; else r.css[p] = String(v); }
    if (!Object.keys(r.css).length) delete r.css;
  }, key || ('css:' + target + Object.keys(props).join()));
}
function setText(index, value, original) {
  mutate(() => {
    const r = ruleFor(target, true);
    r.text = r.text || {};
    if (value == null || value === original) delete r.text[index]; else r.text[index] = value;
    if (!Object.keys(r.text).length) delete r.text;
  }, 'text:' + target + ':' + index);
}

// ---------- the preview ----------
preview.onReset.push(() => { cur = null; target = null; renderPanel(); });
preview.onBoot.push(h2 => {
  h2.cb = { onSelect, onPatch: css => { if (target) setCss(css, 'drag:' + target); }, onGestureEnd: nudge => { endCoalesce(); if (nudge) syncPanel(); }, onUndo: undo, onRedo: redo };
  h2.setModel(model);
});
function onSelect(desc) {
  const same = desc && cur && desc.selector === cur.selector;
  cur = desc;
  if (!desc) { target = null; renderPanel(); return; }
  if (!same) { target = desc.selector; renderPanel(); } else syncPanel();
}

// ---------- side panel ----------
function renderPanel() {
  updaters = [];
  panel.textContent = '';
  if (!cur) {
    panel.append(
      h('h3', {}, 'Nothing selected'),
      h('ul', { class: 'help' },
        h('li', {}, h('b', {}, 'Edit'), ' mode: click anything in the preview to select it, drag to move, drag a handle to resize, arrow keys nudge 1px (Shift = 10px), Esc deselects.'),
        h('li', {}, 'Alt+click digs through what is stacked under the cursor. The breadcrumb and parent / child / prev / next buttons walk the tree; "Elements on screen" lists everything with an id.'),
        h('li', {}, h('b', {}, 'Play'), ' mode: use the game normally (open the skill tree, the pause menu...) to reach a screen, then go back to Edit. Untick ', h('b', {}, 'Freeze time'), ' to let the game run.'),
        h('li', {}, 'Saved automatically to ', h('code', {}, 'overrides/layout.json'), ' (+ the generated ', h('code', {}, 'layout.css'), ' / ', h('code', {}, 'layout.js'), ' the game loads). The game\'s own files are never touched.')),
      rulesSection(), idsSection());
    renderRules();
    return;
  }
  const d = cur;
  panel.append(
    h('h3', {}, 'Selected'),
    h('div', { class: 'crumbs' }, d.crumbs.flatMap((c, i) => [i ? ' > ' : '', h('a', { onclick: () => { host().select(c.selector); focusGame(); } }, c.label)])),
    h('div', { class: 'nav' },
      h('button', { onclick: () => { host().selectRelative('parent'); focusGame(); }, title: 'Select the parent element' }, 'parent'),
      h('button', { onclick: () => { host().selectRelative('child'); focusGame(); }, title: 'Select the first child' }, 'child'),
      h('button', { onclick: () => { host().selectRelative('prev'); focusGame(); }, title: 'Previous sibling' }, 'prev'),
      h('button', { onclick: () => { host().selectRelative('next'); focusGame(); }, title: 'Next sibling' }, 'next')));

  // which rule the edits go to
  const selInput = h('input', { class: 'selbox', type: 'text', spellcheck: 'false' });
  const matchNote = h('div', { class: 'hint' }), chips = h('div', { class: 'chips' });
  const matching = model.rules.filter(r => r.sel !== d.selector && !d.choices.some(c => c.sel === r.sel) && host().selMatches(r.sel));
  function drawChips() {
    chips.textContent = '';
    for (const c of [...d.choices, ...matching.map(r => ({ sel: r.sel, label: 'rule ' + r.sel }))]) {
      chips.append(h('button', { class: c.sel === target ? 'on' : '', title: c.sel, onclick: () => { target = c.sel; drawChips(); syncPanel(); focusGame(); } }, c.label));
    }
  }
  drawChips();
  selInput.addEventListener('change', () => {
    const v = selInput.value.trim();
    if (!v || host().count(v) < 1 || !LayoutModel.isSafeSelector(v)) { selInput.value = target; say(v ? 'That selector matches nothing (or is not allowed)' : 'Selector is empty', true); return; }
    target = v; drawChips(); syncPanel();
  });
  updaters.push(() => {
    const n = host() ? host().count(target) : 0;
    matchNote.textContent = 'Edits go to the rule for ' + n + ' element' + (n === 1 ? '' : 's') + ': ' + (n > 1 ? 'every one of them changes.' : 'only this one.');
    if (document.activeElement !== selInput) selInput.value = target;
  });
  panel.append(selInput, chips, matchNote);
  if (/nth-child/.test(d.selector)) panel.append(h('div', { class: 'warn' }, 'This selector is positional (nth-child). If the game builds this part from code (hotbar slots, tree nodes, save slots...), it can point at a different element once the content changes. A class chip is sturdier.'));

  panel.append(h('h3', {}, 'Position'), translateRow(), h('div', { class: 'hint' }, 'Drag in the preview, or type. Uses CSS translate, so it works on anything and never disturbs the rest of the layout.'));
  panel.append(h('h3', {}, 'Size'), numberRow('Width', 'width', 'px'), numberRow('Height', 'height', 'px'));
  panel.append(h('h3', {}, 'Look'), numberRow('Font size', 'font-size', 'px'), colorRow('Color', 'color'), colorRow('Background', 'background-color'), numberRow('Opacity', 'opacity', '', 0.05, 0, 1), hideRow());

  if (d.textNodes.length) {
    panel.append(h('h3', {}, 'Text'));
    for (const t of d.textNodes) panel.append(textRow(t));
  }

  const other = h('div', {});
  panel.append(h('h3', {}, 'Other CSS'), other);
  const MANAGED = new Set(['translate', 'width', 'height', 'font-size', 'color', 'background-color', 'opacity']);
  function drawOther() {
    other.textContent = '';
    const r = ruleFor(target);
    for (const [p, v] of Object.entries((r && r.css) || {})) {
      if (MANAGED.has(p) || (p === 'display' && v === 'none')) continue;
      const vi = h('input', { type: 'text', spellcheck: 'false' }); vi.value = v;
      vi.addEventListener('change', () => setCss({ [p]: vi.value.trim() || null }));
      other.append(h('div', { class: 'row', style: 'grid-template-columns: 1fr 1.3fr 22px' }, h('label', {}, h('code', {}, p)), vi, h('button', { class: 'x', title: 'Remove', onclick: () => setCss({ [p]: null }) }, 'x')));
    }
    const pi = h('input', { type: 'text', placeholder: 'property', list: 'cssProps', spellcheck: 'false' });
    const vi = h('input', { type: 'text', placeholder: 'value', spellcheck: 'false' });
    const add = () => { const p = pi.value.trim().toLowerCase(), v = vi.value.trim(); if (p && v) { setCss({ [p]: v }); pi.value = vi.value = ''; } };
    vi.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    other.append(h('div', { class: 'row', style: 'grid-template-columns: 1fr 1.3fr 22px' }, pi, vi, h('button', { class: 'x', title: 'Add', onclick: add }, '+')));
  }
  if (!$('#cssProps')) document.body.append(h('datalist', { id: 'cssProps' }, ['border-radius', 'border', 'box-shadow', 'margin', 'padding', 'gap', 'letter-spacing', 'line-height', 'text-align', 'font-family', 'font-weight', 'text-shadow', 'z-index', 'rotate', 'scale', 'transform', 'filter', 'visibility', 'pointer-events', 'top', 'left', 'right', 'bottom', 'white-space'].map(p => h('option', { value: p }))));
  drawOther();
  let otherKey = '';
  updaters.push(() => { const r = ruleFor(target), k = JSON.stringify((r && r.css) || {}); if (k !== otherKey && !other.contains(document.activeElement)) { otherKey = k; drawOther(); } });

  panel.append(h('div', { style: 'margin-top:12px;display:flex;gap:6px' },
    h('button', { class: 'danger', title: 'Remove every override on the rule being edited', onclick: () => mutate(() => { model.rules = model.rules.filter(r => r.sel !== target); }) }, 'Reset this rule'),
    h('button', { onclick: () => host().select(null) }, 'Deselect')));
  panel.append(rulesSection(), idsSection());
  syncPanel();
  renderRules();
}
function syncPanel() { for (const u of updaters) u(); }
const rowShell = (label, ...cells) => h('div', { class: 'row' }, h('label', {}, label), ...cells);
function parseTranslate(v) {
  if (!v) return [null, null];
  const p = v.trim().split(/\s+/).map(parseFloat);
  return [isNaN(p[0]) ? null : p[0], isNaN(p[1]) ? (isNaN(p[0]) ? null : 0) : p[1]];
}
function translateRow() {
  const xi = h('input', { type: 'number', step: 1 }), yi = h('input', { type: 'number', step: 1 });
  const write = () => (xi.value === '' && yi.value === '' ? setCss({ translate: null }) : setCss({ translate: (+xi.value || 0) + 'px ' + (+yi.value || 0) + 'px' }));
  xi.addEventListener('input', write); yi.addEventListener('input', write);
  updaters.push(() => {
    const [x, y] = parseTranslate(getCss('translate')), set = x != null;
    for (const [inp, v, c] of [[xi, x, cur.computed.translate[0]], [yi, y, cur.computed.translate[1]]]) {
      inp.classList.toggle('set', set);
      if (document.activeElement !== inp) inp.value = set ? v : '';
      inp.placeholder = String(Math.round(c));
    }
  });
  return rowShell('Move X / Y', xi, yi, h('button', { class: 'x', title: 'Back to the original position', onclick: () => setCss({ translate: null }) }, 'x'));
}
function numberRow(label, prop, unit, step, min, max) {
  const inp = h('input', { type: 'number', step: step || 1, min, max });
  inp.addEventListener('input', () => setCss({ [prop]: inp.value === '' ? null : inp.value + unit }));
  updaters.push(() => {
    const v = getCss(prop);
    inp.classList.toggle('set', v != null);
    if (document.activeElement !== inp) inp.value = v != null ? parseFloat(v) : '';
    const c = { width: cur.computed.width, height: cur.computed.height, 'font-size': cur.computed.fontSize, opacity: cur.computed.opacity }[prop];
    inp.placeholder = c == null ? '' : String(Math.round(c * 100) / 100);
  });
  return rowShell(label, inp, h('span', {}), h('button', { class: 'x', title: 'Back to the original', onclick: () => setCss({ [prop]: null }) }, 'x'));
}
function colorRow(label, prop) {
  const inp = h('input', { type: 'color' });
  inp.addEventListener('input', () => setCss({ [prop]: inp.value }));
  updaters.push(() => {
    const v = getCss(prop), comp = prop === 'color' ? cur.computed.color : cur.computed.background;
    inp.style.outline = v != null ? '1px solid var(--acc)' : '';
    if (document.activeElement !== inp) inp.value = /^#[0-9a-f]{6}$/i.test(v || '') ? v : (comp || '#000000');
  });
  return rowShell(label, inp, h('span', {}), h('button', { class: 'x', title: 'Back to the original', onclick: () => setCss({ [prop]: null }) }, 'x'));
}
function hideRow() {
  const cb = h('input', { type: 'checkbox' });
  cb.addEventListener('change', () => setCss({ display: cb.checked ? 'none' : null }));
  updaters.push(() => { cb.checked = getCss('display') === 'none'; });
  return rowShell('Hide', h('label', { style: 'display:flex;gap:6px;align-items:center;white-space:nowrap' }, cb, 'always hidden'), h('span', {}), h('span', {}));
}
function textRow(t) {
  const ta = h('textarea', { class: 'txt', rows: 1, spellcheck: 'false' }), was = h('div', { class: 'hint' });
  ta.addEventListener('input', () => setText(t.index, ta.value, t.original));
  updaters.push(() => {
    const r = ruleFor(target), v = r && r.text ? r.text[t.index] : undefined;
    ta.classList.toggle('set', v != null);
    if (document.activeElement !== ta) ta.value = v != null ? v : t.text;
    was.textContent = v != null ? 'Original: ' + JSON.stringify(t.original) : '';
  });
  return h('div', {}, ta, was, t.static ? null : h('div', { class: 'warn' }, 'The game writes this text from code (it is not in index.html as written), so it will overwrite an override here. Text edits stick for static markup only.'));
}

// ---------- every override so far ----------
const rulesSection = () => h('div', {}, h('h3', {}, 'All changes'), h('div', { class: 'rules', id: 'layRules' }));
function renderRules() {
  const box = $('#layRules'); if (!box) return;
  box.textContent = '';
  if (!model.rules.length) { box.append(h('div', { class: 'hint' }, 'No overrides yet: everything looks as style.css says.')); return; }
  for (const r of model.rules) {
    const c = r.css || {}, bits = [];
    if (c.translate) bits.push('moved');
    if (c.width || c.height) bits.push('resized');
    if (c.display === 'none') bits.push('hidden');
    const nOther = Object.keys(c).filter(p => !['translate', 'width', 'height', 'display'].includes(p)).length;
    if (nOther) bits.push(nOther + ' style' + (nOther > 1 ? 's' : ''));
    if (r.text) bits.push('text');
    box.append(h('div', { class: 'r', onclick: () => { if (host()) { host().select(r.sel); target = r.sel; syncPanel(); } } },
      h('code', { title: r.sel }, r.sel), h('span', {}, bits.join(' · ')),
      h('button', { class: 'x', title: 'Delete this rule', onclick: e => { e.stopPropagation(); mutate(() => { model.rules = model.rules.filter(x => x !== r); }); } }, 'x')));
  }
}
function idsSection() {
  const list = h('div', { class: 'ids' }), filter = h('input', { type: 'search', placeholder: 'filter ids...', class: 'selbox', spellcheck: 'false' });
  const draw = () => {
    list.textContent = '';
    if (!host()) return;
    const q = filter.value.trim().toLowerCase(), items = host().listIds().filter(i => !q || i.id.toLowerCase().includes(q));
    for (const i of items.slice(0, 400)) list.append(h('div', { style: 'padding-left:' + (8 + Math.min(i.depth, 6) * 10) + 'px', onclick: () => { host().select('#' + CSS.escape(i.id)); focusGame(); } }, '#' + i.id + ' ', h('small', {}, i.tag + ' ' + i.w + 'x' + i.h)));
    if (!items.length) list.append(h('div', {}, 'nothing visible matches'));
  };
  filter.addEventListener('input', draw);
  const d = h('details', {}, h('summary', {}, 'Elements on screen'), filter, list);
  d.addEventListener('toggle', () => { if (d.open) draw(); });
  return d;
}

export function init(m) {
  model = LayoutModel.sanitizeModel(m);
  undoBtn.disabled = redoBtn.disabled = true;
  savedEl.textContent = model.rules.length + ' rule' + (model.rules.length === 1 ? '' : 's');
  renderPanel();
}
export function activate() { applyMode(); }
export function deactivate() { saver.flush(); if (host()) host().select(null); }
