// Audio tab: replace any of the game's synthesized sounds (every AU.sfx name, the music, the boss music, the factory
// hum) with an uploaded clip, then trim and edit it. Edits are non-destructive parameters (start / end, volume, fades,
// speed, reverse, loop) that the game applies at playback with the same OV.playClip this page previews with.
// Saved to overrides/audio/<name>.js (the file, base64, so the game can load it from file://) + overrides/audio.json.
import { $, h, say, api, autosaver } from './common.js';
import * as music from './musictab.js';

const view = $('#view-audio');
const savedEl = h('span', { class: 'saved' });
export const tools = h('span', {});
const MUSIC = 'game_music';   // not an AU sound name: the layered soundtrack, trimmed in musictab.js
const LOOPS = AU.names.loops, SFX = AU.names.sfx.slice().sort();
const ABOUT = {
  music: 'The background music (replaces the synth loop and its reactive layers).',
  music_boss: 'Music while the Primal Chimera is out. Without it the normal music keeps playing.',
  hum: 'The factory hum: loops, its volume follows how many machines are working.',
};
const DEFAULTS = { start: 0, end: null, gain: 1, fadeIn: 0, fadeOut: 0, rate: 1, reverse: false, loop: false };

let clips = {};       // name -> saved params (overrides/audio.json)
let sel = null;
const cache = {};     // name -> { buf, rev } decoded in this page
let ctx = null, playing = null, synthStop = null;
const saver = autosaver('/api/audio', () => ({ clips }), savedEl, j => Object.keys(j.clips).length + ' custom');

const ensureCtx = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
const fmtT = s => (s == null ? '-' : s.toFixed(3) + 's');

// ---------- list ----------
const search = h('input', { type: 'search', placeholder: 'filter sounds...' });
const list = h('div', {});
const editor = h('div', { class: 'aedit' });
view.append(h('div', { class: 'alist' }, search, list), editor);
search.addEventListener('input', drawList);
function drawList() {
  const q = search.value.trim().toLowerCase();
  list.textContent = '';
  const row = name => {
    if (q && !name.includes(q)) return null;
    return h('div', { class: 'arow' + (name === sel ? ' sel' : ''), onclick: () => select(name) },
      h('code', {}, name), h('span', { class: 'badge' + (clips[name] || name === MUSIC ? ' custom' : '') }, name === MUSIC ? 'in game' : clips[name] ? 'custom' : 'synth'),
      h('button', { title: 'Play what the game plays now', onclick: e => { e.stopPropagation(); playCurrent(name); } }, 'play'));
  };
  list.append(h('h3', {}, 'Music & loops'), row(MUSIC), ...LOOPS.map(row), h('h3', {}, 'Sound effects (' + SFX.length + ')'), ...SFX.map(row));
}

// ---------- playback ----------
function stopAll() {
  music.stopMusic();
  if (playing) { try { playing.node.src.stop(); } catch (e) { /* done */ } playing = null; }
  if (synthStop) { synthStop(); synthStop = null; }
}
function playSynth(name) {
  stopAll();
  AU.init();
  if (name === 'music' || name === 'music_boss') { AU.mix(0, 0, name === 'music_boss'); AU.music(true); synthStop = () => AU.music(false); say('Synth ' + name + ' playing: Stop ends it.'); }
  else if (name === 'hum') { AU.hum(0.9); synthStop = () => AU.hum(0); }
  else AU.sfx(name);
}
async function playEdited(name) {
  stopAll();
  const c = await loadClip(name);
  if (!c) return;
  const p = clips[name];
  playing = { name, node: OV.playClip(ensureCtx(), c, p, ctx.destination), t0: ctx.currentTime, p: Object.assign({}, p), dur: c.buf.duration };
  playing.node.src.onended = () => { if (playing && playing.name === name) playing = null; };
}
const playCurrent = name => (name === MUSIC ? (stopAll(), music.playLoop()) : clips[name] ? playEdited(name) : playSynth(name));
async function loadClip(name) {
  if (cache[name]) return cache[name];
  try {
    const r = await fetch('/api/audio/' + name);
    if (!r.ok) throw new Error('no stored file');
    cache[name] = { buf: await ensureCtx().decodeAudioData(await r.arrayBuffer()) };
    return cache[name];
  } catch (e) { say('Could not load the ' + name + ' clip: ' + e.message, true); return null; }
}

// ---------- upload ----------
const GUESS = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac' };
async function upload(name, file) {
  const mime = (file.type && file.type.startsWith('audio/')) ? file.type : GUESS[(file.name.split('.').pop() || '').toLowerCase()];
  if (!mime) { say('That does not look like an audio file: ' + file.name, true); return; }
  if (file.size > 55e6) { say('Too big (' + Math.round(file.size / 1e6) + ' MB). Keep clips under 55 MB.', true); return; }
  const bytes = await file.arrayBuffer();
  let buf;
  try { buf = await ensureCtx().decodeAudioData(bytes.slice(0)); } catch (e) { say('The browser cannot decode ' + file.name + '.', true); return; }
  try {
    const j = await api('/api/audio/' + name + '?label=' + encodeURIComponent(file.name), { method: 'PUT', headers: { 'Content-Type': mime }, body: bytes });
    clips = j.clips;
    cache[name] = { buf };
    savedEl.textContent = 'saved';
    say(name + ' now plays ' + file.name + ' (' + buf.duration.toFixed(2) + 's).');
    drawList(); select(name);
  } catch (e) { say('Upload failed: ' + e.message, true); }
}
async function removeClip(name) {
  if (!confirm('Remove the custom clip for "' + name + '"? The game goes back to the synth sound.')) return;
  stopAll();
  try { const j = await api('/api/audio/' + name, { method: 'DELETE' }); clips = j.clips; delete cache[name]; drawList(); select(name); say(name + ' is back to the synth sound.'); }
  catch (e) { say('Remove failed: ' + e.message, true); }
}

// ---------- editor ----------
let wave = null;   // { canvas, peaks, ... } for the selected clip
function setParam(k, v) {
  const p = clips[sel];
  p[k] = v;
  if (k === 'start' || k === 'end') {
    const d = cache[sel].buf.duration;
    p.start = Math.max(0, Math.min(d - 0.01, +p.start || 0));
    if (p.end != null) p.end = Math.max(p.start + 0.01, Math.min(d, p.end));
    if (p.end != null && p.end >= d - 1e-4) p.end = null;
  }
  saver.schedule();
  syncFields();
  drawWave();
}
let fields = [];
function syncFields() { for (const f of fields) f(); }

async function select(name) {
  sel = name;
  drawList();
  editor.textContent = '';
  fields = []; wave = null;
  stopAll();
  if (name === MUSIC) { const box = h('div', {}); editor.append(box); music.mount(box); return; }   // a fresh box per visit, so a slow load can't draw into a later page
  const isLoop = LOOPS.includes(name);
  const fileIn = h('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.ogg,.m4a,.flac,.webm', hidden: true });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) upload(name, fileIn.files[0]); });
  editor.append(
    h('h2', {}, name, h('small', {}, isLoop ? 'looping track' : 'sound effect')),
    h('div', { class: 'hint' }, ABOUT[name] || 'Plays wherever the game calls AU.sfx(\'' + name + '\').'),
    h('div', { class: 'abtns' },
      h('button', { onclick: () => playSynth(name) }, 'Play synth original'),
      clips[name] ? h('button', { class: 'primary', onclick: () => playEdited(name) }, 'Play edited clip') : null,
      h('button', { onclick: stopAll }, 'Stop'),
      h('span', { style: 'flex:1' }),
      h('button', { onclick: () => fileIn.click() }, clips[name] ? 'Replace file...' : 'Upload file...'),
      clips[name] ? h('button', { class: 'danger', onclick: () => removeClip(name) }, 'Remove (back to synth)') : null,
      fileIn, savedEl));
  const drop = h('div', { class: 'drop' }, clips[name] ? 'Drop another file here to replace ' + (clips[name].label || 'the clip') : 'Drop an audio file here (wav, mp3, ogg, m4a, flac) or use Upload. The game keeps its synth sound until you do.');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) upload(name, f); });
  editor.append(drop);
  if (!clips[name]) return;

  const c = await loadClip(name);
  if (!c || sel !== name) return;
  const p = clips[name], dur = c.buf.duration;
  editor.append(h('div', { class: 'hint' }, 'File: ', h('b', {}, p.label || name), ' · ' + dur.toFixed(3) + 's · ' + c.buf.numberOfChannels + ' ch · ' + c.buf.sampleRate + ' Hz. Drag across the waveform (or the orange handles) to trim.'));

  // waveform + trim handles
  const cv = h('canvas', {}), hs = h('div', { class: 'hdl' }, h('b', {})), he = h('div', { class: 'hdl end' }, h('b', {}));
  const box = h('div', { class: 'wave' }, cv, hs, he);
  const times = h('div', { class: 'times' }, h('span', {}, '0s'), h('span', {}), h('span', {}, dur.toFixed(2) + 's'));
  editor.append(box, times);
  wave = { cv, box, hs, he, times, dur, peaks: null };
  const tAt = e => { const r = box.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; };
  const drag = (which, e0) => {
    e0.preventDefault();
    const a0 = tAt(e0);
    const move = e => {
      const t = tAt(e);
      if (which === 'start') setParam('start', Math.min(t, (p.end == null ? dur : p.end) - 0.01));
      else if (which === 'end') setParam('end', Math.max(t, p.start + 0.01));
      else if (Math.abs(t - a0) > dur / 400) { p.start = Math.min(a0, t); p.end = Math.max(a0, t); setParam('start', p.start); }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  hs.addEventListener('pointerdown', e => { e.stopPropagation(); drag('start', e); });
  he.addEventListener('pointerdown', e => { e.stopPropagation(); drag('end', e); });
  box.addEventListener('pointerdown', e => drag('region', e));
  new ResizeObserver(() => { wave && (wave.peaks = null); drawWave(); }).observe(box);

  // parameter fields
  const grid = h('div', { class: 'agrid' });
  const numField = (label, k, min, max, step, toUi, fromUi, help) => {
    const rg = h('input', { type: 'range', min, max, step }), nb = h('input', { type: 'number', min, max, step });
    const get = () => (k === 'end' && p.end == null ? dur : p[k]);
    rg.addEventListener('input', () => setParam(k, fromUi(+rg.value)));
    nb.addEventListener('change', () => setParam(k, fromUi(+nb.value)));
    fields.push(() => { const v = toUi(get()); if (document.activeElement !== rg) rg.value = v; if (document.activeElement !== nb) nb.value = Math.round(v * 1000) / 1000; });
    grid.append(h('label', { title: help || '' }, label), rg, nb);
  };
  const id = v => v;
  numField('Start (s)', 'start', 0, dur, 0.001, id, id);
  numField('End (s)', 'end', 0, dur, 0.001, id, id);
  numField('Volume (%)', 'gain', 0, 400, 1, v => v * 100, v => v / 100, '100 = as uploaded');
  numField('Fade in (s)', 'fadeIn', 0, Math.min(10, dur), 0.01, id, id);
  numField('Fade out (s)', 'fadeOut', 0, Math.min(10, dur), 0.01, id, id, 'Ignored while looping');
  numField('Speed / pitch (x)', 'rate', 0.25, 4, 0.01, id, id, '1 = original. Changes pitch and length together, like a record');
  const check = (label, k, help) => {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => setParam(k, cb.checked));
    fields.push(() => { cb.checked = !!p[k]; });
    grid.append(h('label', { title: help }, label), h('label', { class: 'chk', style: 'display:flex;gap:6px;align-items:center;color:var(--ink)' }, cb, help), h('span'));
  };
  check('Reverse', 'reverse', 'play the trimmed part backwards');
  check('Loop', 'loop', isLoop ? 'always loops in game (music and hum)' : 'repeat until stopped (rarely wanted for an effect)');
  editor.append(grid, h('div', { class: 'abtns' },
    h('button', { onclick: () => normalize(name) }, 'Normalize volume'),
    h('button', { onclick: () => { Object.assign(p, DEFAULTS, { loop: isLoop }); setParam('start', 0); } }, 'Reset edits')));
  syncFields();
  drawWave();
}
function normalize(name) {
  const c = cache[name], p = clips[name], b = c.buf, [s0, s1] = OV.window(b, p);
  let peak = 0;
  for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = Math.floor(s0 * b.sampleRate), n = Math.floor(s1 * b.sampleRate); i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
  if (!peak) { say('That part is silent.', true); return; }
  setParam('gain', Math.min(8, 0.98 / peak));
  say('Volume set so the loudest sample peaks at 98%.');
}
function drawWave() {
  if (!wave || !sel || !cache[sel] || !clips[sel]) return;
  const { cv, box, hs, he, dur } = wave, p = clips[sel], b = cache[sel].buf;
  const W = Math.max(50, box.clientWidth), H = box.clientHeight, dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); wave.peaks = null; }
  if (!wave.peaks) {   // min/max per column across all channels
    const cols = cv.width, per = b.length / cols, pk = new Float32Array(cols * 2);
    for (let x = 0; x < cols; x++) {
      let lo = 1, hi = -1;
      const i0 = Math.floor(x * per), i1 = Math.min(b.length, Math.floor((x + 1) * per) + 1), stepI = Math.max(1, Math.floor((i1 - i0) / 400));
      for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = i0; i < i1; i += stepI) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; } }
      pk[x * 2] = lo; pk[x * 2 + 1] = hi;
    }
    wave.peaks = pk;
  }
  const g = cv.getContext('2d'), cw = cv.width, ch = cv.height, [s0, s1] = OV.window(b, p);
  const x0 = s0 / dur * cw, x1 = s1 / dur * cw, mid = ch / 2, gain = p.gain == null ? 1 : p.gain;
  g.clearRect(0, 0, cw, ch);
  g.fillStyle = 'rgba(240,166,64,0.08)'; g.fillRect(x0, 0, x1 - x0, ch);
  for (let x = 0; x < cw; x++) {
    const inside = x >= x0 && x <= x1;
    const lo = Math.max(-1, wave.peaks[x * 2] * (inside ? gain : 1)), hi = Math.min(1, wave.peaks[x * 2 + 1] * (inside ? gain : 1));
    g.fillStyle = inside ? '#7fc4ff' : '#33465c';
    g.fillRect(x, mid - hi * mid * 0.95, 1, Math.max(1, (hi - lo) * mid * 0.95));
  }
  // fade envelope
  const fi = Math.min(+p.fadeIn || 0, (s1 - s0) / 2) / dur * cw, fo = p.loop ? 0 : Math.min(+p.fadeOut || 0, (s1 - s0) / 2) / dur * cw;
  g.strokeStyle = '#ffd38a'; g.lineWidth = 1.5 * (window.devicePixelRatio || 1);
  g.beginPath(); g.moveTo(x0, ch - 2); g.lineTo(x0 + fi, 3); g.lineTo(x1 - fo, 3); g.lineTo(x1, ch - 2); g.stroke();
  // playhead
  if (playing && playing.name === sel) {
    const pp = playing.p, rate = Math.max(0.1, +pp.rate || 1), span = s1 - s0, el = (ctx.currentTime - playing.t0) * rate;
    const off = pp.loop ? el % span : Math.min(el, span), t = pp.reverse ? s1 - off : s0 + off;
    g.fillStyle = '#fff'; g.fillRect(t / dur * cw, 0, 2 * (window.devicePixelRatio || 1), ch);
  }
  hs.style.left = (s0 / dur * 100) + '%'; he.style.left = (s1 / dur * 100) + '%';
  hs.querySelector('b').textContent = fmtT(s0); he.querySelector('b').textContent = fmtT(s1);
  wave.times.children[1].textContent = 'clip ' + ((s1 - s0) / Math.max(0.1, +p.rate || 1)).toFixed(3) + 's' + (p.reverse ? ', reversed' : '') + (p.loop ? ', looping' : '');
}
(function tick() { if (playing && wave) drawWave(); requestAnimationFrame(tick); })();

export function init(saved) {
  clips = (saved && saved.clips) || {};
  savedEl.textContent = Object.keys(clips).length + ' custom';
  drawList();
  select(SFX.includes('pickup') ? 'pickup' : SFX[0]);
}
export function activate() {}
export function deactivate() { stopAll(); saver.flush(); }
