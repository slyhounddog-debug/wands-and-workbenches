// The preview the Layout and Variables tabs share: the real game in an iframe from this tool's origin (/game/),
// walked to a screen by a preset's steps (presets.json). layout-host.js runs inside it.
import { $, h, say, ls } from './common.js';

const frame = $('#frame'), wrap = $('#wrap'), stage = $('#stage'), note = $('#note');
const presetSel = $('#preset'), sizeSel = $('#size'), freezeCb = $('#freeze');

export const preview = {
  host: null,          // window.__layoutHost of the current load (null while booting)
  presets: [], fixtures: [],
  layoutMode: ls.get('mode', 'edit'),   // what the Layout tab wants; the Variables tab always plays
  tab: 'layout',
  scale: 1,
  onBoot: [],          // (host) => void, after each boot
  onReset: [],         // () => void, when a boot starts
  win: () => frame.contentWindow,
  focus() { try { frame.contentWindow.focus(); } catch (e) { /* not ready */ } },
};

const SIZES = [[1600, 900], [1920, 1080], [1366, 768], [1280, 720], [1024, 768]];
for (const [w, hh] of SIZES) sizeSel.append(h('option', { value: w + 'x' + hh }, w + ' x ' + hh));
sizeSel.value = ls.get('size', '1600x900');
if (!sizeSel.value) sizeSel.value = '1600x900';

export function applySize() {
  const [w, hh] = sizeSel.value.split('x').map(Number);
  const s = Math.max(0.2, Math.min(1, (stage.clientWidth - 16) / w, (stage.clientHeight - 16) / hh));
  wrap.style.width = Math.round(w * s) + 'px'; wrap.style.height = Math.round(hh * s) + 'px';
  frame.style.width = w + 'px'; frame.style.height = hh + 'px';
  frame.style.transform = 'scale(' + s + ')';
  preview.scale = s;
  if (preview.host) preview.host.setScale(s);
  note.textContent = w + 'x' + hh + ' at ' + Math.round(s * 100) + '%';
}
sizeSel.addEventListener('change', () => { ls.set('size', sizeSel.value); applySize(); });
new ResizeObserver(() => applySize()).observe(stage);

function expandSteps(steps, depth) {   // {include: 'presetId'} -> that preset's steps
  return steps.flatMap(s => {
    if (!s.include) return [s];
    const p = preview.presets.find(x => x.id === s.include);
    return p && (depth || 0) < 6 ? expandSteps(p.steps || [], (depth || 0) + 1) : [];
  });
}

function fixtureOf(preset, depth) {   // a preset without its own fixture uses the one of the preset it includes
  if (!preset || (depth || 0) > 6) return null;
  if (preset.fixture) return preset.fixture;
  const inc = (preset.steps || []).find(s => s.include);
  return inc ? fixtureOf(preview.presets.find(x => x.id === inc.include), (depth || 0) + 1) : null;
}

let token = 0;
export async function boot() {
  const preset = preview.presets.find(p => p.id === presetSel.value) || preview.presets[0];
  if (!preset) return;
  ls.set('preset', preset.id);
  const my = ++token;
  preview.host = null;
  preview.onReset.forEach(f => f());
  const params = new URLSearchParams(), fixture = fixtureOf(preset);
  if (fixture) params.set('fixture', fixture);
  if (preset.hold) params.set('hold', '1');
  params.set('t', Date.now());
  note.textContent = 'Loading ' + preset.label + '...';
  frame.src = '/game/?' + params;
  await new Promise(res => frame.addEventListener('load', res, { once: true }));
  if (my !== token) return;
  const host = frame.contentWindow.__layoutHost;
  if (!host) { note.textContent = 'The preview failed to load its editor script (see the console).'; return; }
  host.setScale(preview.scale);
  host.setMode('play');   // let the boot and the steps run unobstructed
  await host.loadingDone;
  const problems = await host.run(expandSteps(preset.steps || []));
  if (my !== token) return;
  if (preset.freeze !== false) host.setFrozen(true);
  preview.host = host;
  preview.onBoot.forEach(f => f(host));
  applyMode();
  applySize();
  if (problems.length) say('Screen steps: ' + problems.join('; '), true);
  preview.focus();
}
presetSel.addEventListener('change', boot);
$('#reload').addEventListener('click', boot);

// ---------- Edit / Play ----------
export function applyMode() {
  const m = preview.tab === 'layout' ? preview.layoutMode : 'play';
  $('#modeEdit').classList.toggle('on', m === 'edit');
  $('#modePlay').classList.toggle('on', m === 'play');
  $('#modeEdit').disabled = preview.tab !== 'layout';
  if (preview.host) { preview.host.setMode(m); if (m === 'play') preview.host.select(null); }
}
export function setLayoutMode(m) { preview.layoutMode = m; ls.set('mode', m); applyMode(); }
$('#modeEdit').addEventListener('click', () => setLayoutMode('edit'));
$('#modePlay').addEventListener('click', () => { setLayoutMode('play'); preview.focus(); });

// ---------- freeze (the game's own G.paused; the pause menu sets it too, so keep the box in sync) ----------
freezeCb.addEventListener('change', () => { if (preview.host) preview.host.setFrozen(freezeCb.checked); preview.focus(); });
setInterval(() => {
  const host = preview.host, inGame = !!(host && host.inGame());
  freezeCb.disabled = !inGame;
  freezeCb.checked = inGame && host.isFrozen();
}, 400);

export function loadPresets(presets, fixtures) {
  preview.presets = presets; preview.fixtures = fixtures;
  presetSel.textContent = '';
  for (const p of presets) presetSel.append(h('option', { value: p.id }, p.label));
  presetSel.value = ls.get('preset', presets[0] && presets[0].id);
  if (!presetSel.value && presets[0]) presetSel.value = presets[0].id;
}
