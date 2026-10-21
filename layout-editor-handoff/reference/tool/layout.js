// The Layout tab of the dev tool: a visual editor for the game's DOM UI (menus, panels, buttons, HUD, text).
//
// The real game runs in an iframe served from this tool's own origin (/game/, see layout.mjs) so this page can
// reach into it. layout-host.js (inside the iframe) picks elements and turns drags into CSS patches; this file
// owns the model (css/layout.json), the side panel, undo/redo and autosave. Nothing here edits the game's own
// source: the game applies css/layout.css (+ the text half of layout.json, js/LayoutOverrides.js) on top of its
// normal styles, so deleting a rule here always gets the original look back.
import { sanitizeModel, emptyModel } from '/app/layout-model.js';

const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const view = $('#view-layout');
const statusEl = $('#status');
let statusTimer = null;
function say(msg, bad) {
  statusEl.textContent = msg;
  statusEl.style.color = bad ? 'var(--bad)' : 'var(--mute)';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ''), 3500);
}

document.head.append(h('style', { html: `
  #view-layout { max-width:none; padding:10px 14px 14px; }
  .lay-top { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin-bottom:10px; }
  .lay-top select, .lay-top input { font:inherit; color:var(--ink); background:#16273a; border:1px solid var(--line); border-radius:6px; padding:4px 8px; }
  .lay-seg { display:flex; } .lay-seg button { border-radius:0; } .lay-seg button:first-child { border-radius:8px 0 0 8px; } .lay-seg button:last-child { border-radius:0 8px 8px 0; }
  .lay-seg button.on { background:#b8741a; border-color:#e0952f; color:#fff; font-weight:600; }
  .lay-body { display:grid; grid-template-columns: minmax(0,1fr) 340px; gap:12px; height:calc(100vh - 128px); min-height:420px; }
  .lay-stage { background:#0b1218; border:1px solid var(--line); border-radius:10px; overflow:auto; position:relative; padding:8px; }
  .lay-wrap { position:relative; box-shadow:0 0 0 1px #2f4a60; background:#000; }
  .lay-wrap iframe { position:absolute; left:0; top:0; border:0; transform-origin:0 0; background:#000; }
  .lay-note { position:absolute; left:12px; bottom:10px; background:rgba(14,23,32,.88); color:var(--mute); border:1px solid var(--line); border-radius:6px; padding:3px 9px; font-size:12px; pointer-events:none; }
  .lay-panel { background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:auto; padding:10px 12px; font-size:13px; }
  .lay-panel h3 { margin:12px 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--mute); }
  .lay-panel h3:first-child { margin-top:0; }
  .lay-panel .empty { color:var(--mute); line-height:1.5; }
  .lay-panel .empty li { margin:3px 0; }
  .lay-row { display:grid; grid-template-columns: 74px 1fr 1fr 22px; gap:6px; align-items:center; margin:4px 0; }
  .lay-row > label { color:var(--mute); }
  .lay-row input[type=number], .lay-row input[type=text], .lay-row select { width:100%; min-width:0; font:inherit; color:var(--ink); background:#16273a; border:1px solid var(--line); border-radius:6px; padding:3px 6px; }
  .lay-row input.set { border-color:var(--acc); background:#2a2415; }
  .lay-row input[type=color] { width:100%; height:26px; padding:1px; background:#16273a; border:1px solid var(--line); border-radius:6px; }
  .lay-row .x { padding:0 5px; background:transparent; border:0; color:var(--mute); }
  .lay-row .x:hover { color:var(--bad); }
  .lay-sel { width:100%; font:12px ui-monospace, Consolas, monospace; color:var(--ink); background:#16273a; border:1px solid var(--line); border-radius:6px; padding:4px 6px; }
  .lay-chips { display:flex; flex-wrap:wrap; gap:4px; margin:6px 0; }
  .lay-chips button { font-size:11.5px; padding:1px 8px; border-radius:99px; background:#243b50; border-color:#35566f; }
  .lay-chips button.on { background:#b8741a; border-color:#e0952f; color:#fff; }
  .lay-crumbs { display:flex; flex-wrap:wrap; gap:2px; font-size:11.5px; color:var(--mute); margin-bottom:6px; }
  .lay-crumbs a { color:var(--acc); cursor:pointer; text-decoration:none; } .lay-crumbs a:hover { text-decoration:underline; }
  .lay-nav { display:flex; gap:4px; margin:6px 0; } .lay-nav button { padding:2px 9px; font-size:12px; }
  .lay-text { width:100%; font:inherit; color:var(--ink); background:#16273a; border:1px solid var(--line); border-radius:6px; padding:4px 6px; min-height:34px; resize:vertical; field-sizing:content; }
  .lay-text.set { border-color:var(--acc); background:#2a2415; }
  .lay-hint { color:var(--mute); font-size:11.5px; margin:3px 0; line-height:1.4; }
  .lay-rules .r { display:flex; gap:6px; align-items:center; padding:3px 0; border-bottom:1px solid #1d2f3f; cursor:pointer; }
  .lay-rules .r:hover { background:#22384a; }
  .lay-rules .r code { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11.5px; }
  .lay-rules .r span { color:var(--mute); font-size:11.5px; white-space:nowrap; }
  .lay-ids { max-height:220px; overflow:auto; border:1px solid var(--line); border-radius:6px; background:#16273a; margin-top:4px; }
  .lay-ids div { padding:2px 8px; cursor:pointer; font:11.5px ui-monospace, Consolas, monospace; white-space:nowrap; }
  .lay-ids div:hover { background:#22384a; } .lay-ids small { color:var(--mute); }
  .lay-mini { padding:2px 9px; font-size:12px; }
  details.lay-d > summary { cursor:pointer; color:var(--mute); font-size:12px; text-transform:uppercase; letter-spacing:.06em; margin:12px 0 4px; }
` }));

view.append(
  h('div', { class: 'lay-top' },
    h('label', { class: 'lay-lbl' }, 'Screen ', h('select', { id: 'layPreset', title: 'Which screen of the game to load into the preview' })),
    h('label', { class: 'lay-lbl' }, 'Size ', h('select', { id: 'laySize', title: 'The window size the game thinks it has' })),
    h('span', { class: 'lay-seg' },
      h('button', { id: 'layModeEdit', title: 'Clicks select and drag elements (the game does not receive them)' }, '✎ Edit'),
      h('button', { id: 'layModePlay', title: 'Clicks go to the game, so you can open panels and navigate to the screen you want to edit' }, '▶ Play')),
    h('span', { class: 'lay-seg' },
      h('button', { id: 'layUndo', title: 'Undo (Ctrl+Z)' }, '↶ Undo'),
      h('button', { id: 'layRedo', title: 'Redo (Ctrl+Y)' }, '↷ Redo')),
    h('button', { id: 'layReload', title: 'Reload the preview and walk back to the selected screen' }, '⟳ Reload screen'),
    h('span', { id: 'laySaved', style: 'color:var(--mute);font-size:12px' }, ''),
  ),
  h('div', { class: 'lay-body' },
    h('div', { class: 'lay-stage', id: 'layStage' },
      h('div', { class: 'lay-wrap', id: 'layWrap' }, h('iframe', { id: 'layFrame', title: 'Game preview' })),
      h('div', { class: 'lay-note', id: 'layNote' }, '')),
    h('div', { class: 'lay-panel', id: 'layPanel' })),
);

const frame = $('#layFrame');
const wrap = $('#layWrap');
const stage = $('#layStage');
const panel = $('#layPanel');
const noteEl = $('#layNote');
const presetSel = $('#layPreset');
const sizeSel = $('#laySize');

// ---------- state ----------
let loaded = false, loadPromise = null;
let model = emptyModel();
let fixtures = [], presets = [];
let host = null;                 // window.__layoutHost of the current iframe load
let mode = 'edit';
let cur = null;                  // description of the selected element ({selector, choices, textNodes, computed, ...})
let target = null;               // the rule selector edits are written to (usually cur.selector, or a broader choice)
let updaters = [];               // functions that refresh the panel's fields from model + cur
const SIZES = [['1600 × 900', 1600, 900], ['1920 × 1080', 1920, 1080], ['1366 × 768', 1366, 768], ['1280 × 720', 1280, 720], ['1024 × 768', 1024, 768]];
for (const [label, w, hh] of SIZES) sizeSel.append(h('option', { value: `${w}x${hh}` }, label));
const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
sizeSel.value = lsGet('layout_size', '1600x900');
if (!sizeSel.value) sizeSel.value = '1600x900';

// ---------- model + undo + save ----------
const undoStack = [], redoStack = [];
let coalesceKey = null, coalesceAt = 0;
let saveTimer = null, savePending = false;

const snapshot = () => JSON.stringify(model);
function pushUndo(key) {
  const now = performance.now();
  if (key && key === coalesceKey && now - coalesceAt < 1500) { coalesceAt = now; return; }   // keep one undo step per drag / typing burst
  undoStack.push(snapshot());
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
  coalesceKey = key || null; coalesceAt = now;
}
const endCoalesce = () => { coalesceKey = null; };

function commit() {                       // model changed: show it in the preview, refresh the panel, queue a save
  if (host) host.setModel(model);
  scheduleSave();
  if (host && cur) host.refresh(); else syncPanel();   // refresh -> onSelect -> syncPanel with up-to-date measurements
  renderRules();
  updateButtons();
}
function mutate(fn, key) {
  pushUndo(key);
  fn();
  model.rules = model.rules.filter((r) => (r.css && Object.keys(r.css).length) || (r.text && Object.keys(r.text).length));
  commit();
}
function restore(json) {
  model = JSON.parse(json);
  commit();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); endCoalesce(); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); endCoalesce(); }

function scheduleSave() {
  savePending = true;
  $('#laySaved').textContent = 'unsaved…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}
async function save() {
  clearTimeout(saveTimer);
  if (!savePending) return;
  savePending = false;
  try {
    const r = await fetch('/api/layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(model) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    $('#laySaved').textContent = `saved · ${j.rules} rule${j.rules === 1 ? '' : 's'}`;
    window.dispatchEvent(new Event('devtools:changed'));
  } catch (e) {
    savePending = true;
    $('#laySaved').textContent = 'SAVE FAILED';
    say('Layout save failed: ' + e.message, true);
  }
}
window.addEventListener('beforeunload', () => { if (savePending) navigator.sendBeacon('/api/layout', new Blob([JSON.stringify(model)], { type: 'application/json' })); });

const ruleFor = (sel, create) => {
  let r = model.rules.find((x) => x.sel === sel);
  if (!r && create) { r = { sel }; model.rules.push(r); }
  return r;
};
const getCss = (prop) => { const r = ruleFor(target); return r && r.css ? r.css[prop] : undefined; };
function setCss(props, key) {              // props: {prop: value|null}; null removes it
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

// ---------- the iframe ----------
function applySize() {
  const [w, hh] = sizeSel.value.split('x').map(Number);
  const availW = stage.clientWidth - 16, availH = stage.clientHeight - 16;
  const s = Math.max(0.2, Math.min(1, availW / w, availH / hh));
  wrap.style.width = Math.round(w * s) + 'px';
  wrap.style.height = Math.round(hh * s) + 'px';
  frame.style.width = w + 'px'; frame.style.height = hh + 'px';
  frame.style.transform = `scale(${s})`;
  noteEl.dataset.scale = s;
  if (host) host.setScale(s);
  noteEl.textContent = `${w}×${hh} at ${Math.round(s * 100)}%`;
}
sizeSel.addEventListener('change', () => { lsSet('layout_size', sizeSel.value); applySize(); });
new ResizeObserver(() => { if (!view.hidden) applySize(); }).observe(stage);

function expandSteps(steps, depth = 0) {            // {include: 'presetId'} -> that preset's steps
  return steps.flatMap((s) => {
    if (!s.include) return [s];
    const p = presets.find((x) => x.id === s.include);
    return p && depth < 5 ? expandSteps(p.steps || [], depth + 1) : [];
  });
}

let bootToken = 0;
async function bootScreen() {
  const preset = presets.find((p) => p.id === presetSel.value) || presets[0];
  if (!preset) return;
  lsSet('layout_preset', preset.id);
  const token = ++bootToken;
  host = null; cur = null; target = null; renderPanel();
  const params = new URLSearchParams();
  if (preset.fixture) params.set('fixture', preset.fixture);
  if (preset.hold) params.set('hold', '1');
  params.set('t', Date.now());
  noteEl.textContent = 'Loading ' + preset.label + '…';
  frame.src = '/game/?' + params;
  await new Promise((res) => frame.addEventListener('load', res, { once: true }));
  if (token !== bootToken) return;
  host = frame.contentWindow.__layoutHost;
  if (!host) { noteEl.textContent = 'The preview failed to load the editor script (see the browser console).'; return; }
  host.cb = { onSelect, onPatch, onGestureEnd: (nudge) => { endCoalesce(); if (nudge) syncPanel(); }, onUndo: undo, onRedo: redo };
  host.setModel(model);
  host.setScale(+noteEl.dataset.scale || 1);
  host.setMode('play');                                   // let the boot sequence / steps run unobstructed
  await host.loadingDone;
  const problems = await host.run(expandSteps(preset.steps || []));
  if (token !== bootToken) return;
  host.setModel(model);                                    // text overrides again, for markup the steps just created
  setMode(mode);
  applySize();
  if (problems.length) say('Screen steps: ' + problems.join('; '), true);
  frame.contentWindow.focus();
}
presetSel.addEventListener('change', bootScreen);
$('#layReload').addEventListener('click', bootScreen);

const focusGame = () => { try { frame.contentWindow.focus(); } catch { /* preview not ready */ } };   // so arrow keys / Ctrl+Z reach the preview after a panel click

function setMode(m) {
  mode = m;
  $('#layModeEdit').classList.toggle('on', m === 'edit');
  $('#layModePlay').classList.toggle('on', m === 'play');
  if (host) host.setMode(m);
  if (m === 'play' && host) host.select(null);
}
$('#layModeEdit').addEventListener('click', () => setMode('edit'));
$('#layModePlay').addEventListener('click', () => setMode('play'));
$('#layUndo').addEventListener('click', undo);
$('#layRedo').addEventListener('click', redo);
function updateButtons() {
  $('#layUndo').disabled = !undoStack.length;
  $('#layRedo').disabled = !redoStack.length;
}
window.addEventListener('keydown', (e) => {
  if (view.hidden || !(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

// ---------- callbacks from the iframe ----------
function onSelect(desc) {
  const same = desc && cur && desc.selector === cur.selector;
  cur = desc;
  if (!desc) { target = null; renderPanel(); return; }
  if (!same) {
    // keep editing whichever existing rule already targets exactly this element, else a fresh rule for it alone
    target = desc.selector;
    renderPanel();
  } else syncPanel();
}
function onPatch(css) {
  if (!target) return;
  setCss(css, 'drag:' + target);
}

// ---------- the side panel ----------
function renderPanel() {
  updaters = [];
  panel.textContent = '';
  if (!cur) {
    panel.append(
      h('div', { class: 'empty' },
        h('h3', {}, 'Nothing selected'),
        h('ul', {},
          h('li', {}, h('b', {}, 'Edit'), ' mode: click anything in the preview to select it, drag to move it, drag a handle to resize it, arrow keys nudge 1px (Shift = 10px).'),
          h('li', {}, 'Alt+click digs through what is stacked under the cursor. The breadcrumb and arrows below move to the parent / child / neighbours.'),
          h('li', {}, h('b', {}, 'Play'), ' mode: use the game normally (open the shop, click Load Game, ...) to reach a screen, then go back to Edit.'),
          h('li', {}, 'Everything is saved automatically to ', h('code', {}, 'css/layout.json'), ' + ', h('code', {}, 'css/layout.css'), '; the game\'s own files are never touched.'))),
      rulesSection(), idsSection());
    renderRules();
    return;
  }
  const d = cur;
  panel.append(
    h('h3', {}, 'Selected'),
    h('div', { class: 'lay-crumbs' }, d.crumbs.flatMap((c, i) => [i ? ' › ' : '', h('a', { onclick: () => host.select(c.selector) }, c.label)])),
    h('div', { class: 'lay-nav' },
      h('button', { onclick: () => { host.selectRelative('parent'); focusGame(); }, title: 'Select the parent element' }, '↑ parent'),
      h('button', { onclick: () => { host.selectRelative('child'); focusGame(); }, title: 'Select the first child' }, '↓ child'),
      h('button', { onclick: () => { host.selectRelative('prev'); focusGame(); }, title: 'Previous sibling' }, '← prev'),
      h('button', { onclick: () => { host.selectRelative('next'); focusGame(); }, title: 'Next sibling' }, '→ next')),
  );

  // which rule the edits go to
  const selInput = h('input', { class: 'lay-sel', type: 'text', spellcheck: 'false' });
  selInput.value = target;
  const matchNote = h('div', { class: 'lay-hint' });
  const chips = h('div', { class: 'lay-chips' });
  const matching = model.rules.filter((r) => r.sel !== d.selector && !d.choices.some((c) => c.sel === r.sel) && host.selMatches(r.sel));
  function drawChips() {
    chips.textContent = '';
    const all = [...d.choices.map((c) => ({ sel: c.sel, label: c.label })), ...matching.map((r) => ({ sel: r.sel, label: 'rule ' + r.sel }))];
    for (const c of all) chips.append(h('button', { class: c.sel === target ? 'on' : '', title: c.sel, onclick: () => { target = c.sel; selInput.value = target; drawChips(); syncPanel(); focusGame(); } }, c.label));
  }
  drawChips();
  selInput.addEventListener('change', () => {
    const v = selInput.value.trim();
    if (!v || host.count(v) < 1) { selInput.value = target; say(v ? 'That selector matches nothing' : 'Selector is empty', true); return; }
    target = v; drawChips(); syncPanel();
  });
  updaters.push(() => {
    const n = host.count(target);
    matchNote.textContent = `Edits go to the rule for ${n} element${n === 1 ? '' : 's'}: ` + (n > 1 ? 'every one of them changes.' : 'only this one.');
    selInput.value = target;
  });
  panel.append(selInput, chips, matchNote);

  // Move
  panel.append(h('h3', {}, 'Position'));
  panel.append(translateRow(), h('div', { class: 'lay-hint' }, 'Drag in the preview, or type. Uses CSS translate, so it works on anything and never disturbs the rest of the layout.'));
  panel.append(h('h3', {}, 'Size'));
  panel.append(numberRow('Width', 'width', 'px'), numberRow('Height', 'height', 'px'));
  panel.append(h('h3', {}, 'Look'));
  panel.append(numberRow('Font size', 'font-size', 'px'), colorRow('Color', 'color'), numberRow('Opacity', 'opacity', '', 0.05, 0, 1), hideRow());

  // Text
  if (d.textNodes.length) {
    panel.append(h('h3', {}, 'Text'));
    for (const t of d.textNodes) panel.append(textRow(t));
    panel.append(h('div', { class: 'lay-hint' }, 'Applies to text written in index.html. Text the game builds from code (lists, counters, tooltips) is rewritten by the game, so use the Text tab for those.'));
  }

  // Other css
  const other = h('div', {});
  panel.append(h('h3', {}, 'Other CSS'), other);
  const MANAGED = new Set(['translate', 'width', 'height', 'font-size', 'color', 'opacity']);
  function drawOther() {
    other.textContent = '';
    const r = ruleFor(target);
    for (const [p, v] of Object.entries((r && r.css) || {})) {
      if (MANAGED.has(p) || (p === 'display' && v === 'none')) continue;
      const vi = h('input', { type: 'text', spellcheck: 'false' }); vi.value = v;
      vi.addEventListener('change', () => setCss({ [p]: vi.value.trim() || null }));
      other.append(h('div', { class: 'lay-row', style: 'grid-template-columns: 1fr 1.3fr 22px' }, h('label', { style: 'font:11.5px ui-monospace,monospace' }, p), vi, h('button', { class: 'x', title: 'Remove', onclick: () => setCss({ [p]: null }) }, '×')));
    }
    const pi = h('input', { type: 'text', placeholder: 'property', list: 'layProps', spellcheck: 'false' });
    const vi = h('input', { type: 'text', placeholder: 'value', spellcheck: 'false' });
    const add = () => {
      const p = pi.value.trim().toLowerCase(), v = vi.value.trim();
      if (!p || !v) return;
      setCss({ [p]: v }); pi.value = vi.value = '';
    };
    vi.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    other.append(h('div', { class: 'lay-row', style: 'grid-template-columns: 1fr 1.3fr 22px' }, pi, vi, h('button', { class: 'x', title: 'Add', onclick: add }, '+')));
  }
  if (!$('#layProps')) document.body.append(h('datalist', { id: 'layProps' }, ['background-color', 'border-radius', 'border-width', 'border-color', 'box-shadow', 'margin', 'padding', 'gap', 'letter-spacing', 'line-height', 'text-align', 'font-family', 'font-weight', 'text-shadow', 'z-index', 'rotate', 'scale', 'transform', 'filter', 'visibility', 'pointer-events', 'top', 'left', 'right', 'bottom'].map((p) => h('option', { value: p }))));
  drawOther();
  let otherKey = '';
  updaters.push(() => { const r = ruleFor(target); const k = JSON.stringify((r && r.css) || {}); if (k !== otherKey && !other.contains(document.activeElement)) { otherKey = k; drawOther(); } });

  panel.append(h('div', { style: 'margin-top:12px;display:flex;gap:6px' },
    h('button', { onclick: () => { mutate(() => { model.rules = model.rules.filter((r) => r.sel !== target); }, null); }, title: 'Remove every override on the rule being edited' }, 'Reset this rule'),
    h('button', { onclick: () => host.select(null) }, 'Deselect')));
  panel.append(rulesSection(), idsSection());
  syncPanel();
  renderRules();
}

function syncPanel() { for (const u of updaters) u(); }

function rowShell(label, ...cells) { return h('div', { class: 'lay-row' }, h('label', {}, label), ...cells); }

function parseTranslate(v) {
  if (!v) return [null, null];
  const p = v.trim().split(/\s+/).map(parseFloat);
  return [isNaN(p[0]) ? null : p[0], isNaN(p[1]) ? (isNaN(p[0]) ? null : 0) : p[1]];
}
function translateRow() {
  const xi = h('input', { type: 'number', step: 1 }), yi = h('input', { type: 'number', step: 1 });
  const clear = h('button', { class: 'x', title: 'Back to the original position', onclick: () => setCss({ translate: null }) }, '×');
  const write = () => {
    if (xi.value === '' && yi.value === '') return setCss({ translate: null });
    setCss({ translate: `${+xi.value || 0}px ${+yi.value || 0}px` });
  };
  xi.addEventListener('input', write); yi.addEventListener('input', write);
  updaters.push(() => {
    const [x, y] = parseTranslate(getCss('translate'));
    const set = x != null;
    for (const [inp, v, c] of [[xi, x, cur.computed.translate[0]], [yi, y, cur.computed.translate[1]]]) {
      inp.classList.toggle('set', set);
      if (document.activeElement !== inp) inp.value = set ? v : '';
      inp.placeholder = String(Math.round(c));
    }
  });
  return rowShell('Move X / Y', xi, yi, clear);
}
function numberRow(label, prop, unit, step = 1, min, max) {
  const inp = h('input', { type: 'number', step, min, max });
  const clear = h('button', { class: 'x', title: 'Back to the original', onclick: () => setCss({ [prop]: null }) }, '×');
  inp.addEventListener('input', () => setCss({ [prop]: inp.value === '' ? null : inp.value + unit }));
  updaters.push(() => {
    const v = getCss(prop);
    inp.classList.toggle('set', v != null);
    if (document.activeElement !== inp) inp.value = v != null ? parseFloat(v) : '';
    const c = { width: cur.computed.width, height: cur.computed.height, 'font-size': cur.computed.fontSize, opacity: cur.computed.opacity }[prop];
    inp.placeholder = c == null ? '' : String(Math.round(c * 100) / 100);
  });
  return rowShell(label, inp, h('span', {}), clear);
}
function colorRow(label, prop) {
  const inp = h('input', { type: 'color' });
  const clear = h('button', { class: 'x', title: 'Back to the original color', onclick: () => setCss({ [prop]: null }) }, '×');
  inp.addEventListener('input', () => setCss({ [prop]: inp.value }));
  updaters.push(() => {
    const v = getCss(prop);
    inp.style.outline = v != null ? '1px solid var(--acc)' : '';
    if (document.activeElement !== inp) inp.value = /^#[0-9a-f]{6}$/i.test(v || '') ? v : (cur.computed.color || '#000000');
  });
  return rowShell(label, inp, h('span', {}), clear);
}
function hideRow() {
  const cb = h('input', { type: 'checkbox' });
  cb.addEventListener('change', () => setCss({ display: cb.checked ? 'none' : null }));
  updaters.push(() => { cb.checked = getCss('display') === 'none'; });
  return rowShell('Hide', h('label', { style: 'display:flex;gap:6px;align-items:center;color:var(--ink);white-space:nowrap' }, cb, 'always'), h('span', {}), h('span', {}));
}
function textRow(t) {
  const ta = h('textarea', { class: 'lay-text', rows: 1, spellcheck: 'false' });
  const was = h('div', { class: 'lay-hint' });
  ta.addEventListener('input', () => setText(t.index, ta.value, t.original));
  updaters.push(() => {
    const r = ruleFor(target);
    const v = r && r.text ? r.text[t.index] : undefined;
    ta.classList.toggle('set', v != null);
    if (document.activeElement !== ta) ta.value = v != null ? v : t.text;
    was.textContent = v != null ? 'Original: ' + JSON.stringify(t.original) : '';
  });
  return h('div', {}, ta, was);
}

// every override made so far
function rulesSection() {
  return h('div', {}, h('h3', {}, 'All changes'), h('div', { class: 'lay-rules', id: 'layRules' }));
}
function renderRules() {
  const box = $('#layRules'); if (!box) return;
  box.textContent = '';
  if (!model.rules.length) { box.append(h('div', { class: 'lay-hint' }, 'No overrides yet. Everything looks as the game\'s stylesheets say.')); return; }
  for (const r of model.rules) {
    const bits = [];
    const c = r.css || {};
    if (c.translate) bits.push('moved');
    if (c.width || c.height) bits.push('resized');
    if (c.display === 'none') bits.push('hidden');
    const nOther = Object.keys(c).filter((p) => !['translate', 'width', 'height', 'display'].includes(p)).length;
    if (nOther) bits.push(nOther + ' style' + (nOther > 1 ? 's' : ''));
    if (r.text) bits.push('text');
    box.append(h('div', { class: 'r', onclick: () => { if (host) { host.select(r.sel); target = r.sel; } } },
      h('code', { title: r.sel }, r.sel), h('span', {}, bits.join(' · ')),
      h('button', { class: 'x lay-mini', title: 'Delete this rule', onclick: (e) => { e.stopPropagation(); mutate(() => { model.rules = model.rules.filter((x) => x !== r); }); } }, '×')));
  }
}

// a list of what is on screen, for things clicks cannot reach (click-through layers, tiny elements)
function idsSection() {
  const list = h('div', { class: 'lay-ids' });
  const filter = h('input', { type: 'text', placeholder: 'filter ids…', class: 'lay-sel', spellcheck: 'false' });
  const draw = () => {
    list.textContent = '';
    if (!host) return;
    const q = filter.value.trim().toLowerCase();
    const items = host.listIds().filter((i) => !q || i.id.toLowerCase().includes(q));
    for (const i of items.slice(0, 400)) list.append(h('div', { style: `padding-left:${8 + Math.min(i.depth, 6) * 10}px`, onclick: () => host.select('#' + CSS.escape(i.id)) }, '#' + i.id + ' ', h('small', {}, `${i.tag} ${i.w}×${i.h}`)));
    if (!items.length) list.append(h('div', {}, 'nothing visible matches'));
  };
  filter.addEventListener('input', draw);
  const d = h('details', { class: 'lay-d' }, h('summary', {}, 'Elements on screen'), filter, list);
  d.addEventListener('toggle', () => { if (d.open) draw(); });
  return d;
}

// ---------- loading ----------
async function ensureLoaded() {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const r = await fetch('/api/layout');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      model = sanitizeModel(j.model);
      fixtures = j.fixtures; presets = j.presets;
      for (const p of presets) presetSel.append(h('option', { value: p.id }, p.label));
      presetSel.value = lsGet('layout_preset', presets[0] && presets[0].id);
      if (!presetSel.value && presets[0]) presetSel.value = presets[0].id;
      loaded = true;
      setMode('edit');
      renderPanel();
      updateButtons();
      applySize();
      await bootScreen();
    } catch (e) {
      loadPromise = null;
      panel.textContent = 'Could not load the Layout tab: ' + e.message;
      say('Layout tab: ' + e.message, true);
    }
  })();
  return loadPromise;
}
window.addEventListener('devtools:tab', (ev) => { if (ev.detail === 'layout') { ensureLoaded(); setTimeout(applySize, 0); } else if (savePending) save(); });
if (!view.hidden) ensureLoaded();
