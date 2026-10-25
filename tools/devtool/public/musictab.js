// Audio tab > "Game music": hear the layered soundtrack the way the game plays it and trim where the loop starts and ends.
// The page decodes the song's stems (the same ones tools/musicbuild/build.js cuts the four element layers from), mixes them
// into those four layers and plays the loop with the game's own wrap: the tail that rings on past the end is laid under
// the start and the loop fades in / out by CFG.music.fadeIn / fadeOut on every pass. "Save & rebuild" writes
// overrides/music.json and re-encodes audio/music/music_<element>.js through the build script.
import { $, h, say, api, postJson } from './common.js';

const BAR = 1.5198, BEAT = BAR / 3, ANCHOR = 1.218;   // the song's grid: a 118.4 BPM waltz, downbeat at 1.218 s (see build.js)
const LAYERS = ['air', 'water', 'fire', 'earth'];
const LCOL = { air: '#dff3ff', water: '#5ab4ff', fire: '#ff8a4c', earth: '#9fd36a' };
const fmt = s => s.toFixed(3) + 's';

let info = null;            // /api/music
let cfg = null;             // working copy { startSample, lengthSamples, xfade }
let ctx = null, bufs = null, norm = null, mono = null, dur = 0, loadP = null;
let play = null;            // the running preview
let fade = { in: 0.5, out: 1 };   // the game's loop fades (CFG.music, with the Variables tab's saved values on top)
let mark = 0;               // song time the "from marker" play starts at
const lit = { air: true, water: true, fire: true, earth: true };
let views = [], fields = [], snapSel = null, logEl = null, statEl = null, dirtyEl = null, buildBtns = [];
const sr = () => info.sr;
const S = () => cfg.startSample / sr();
const L = () => cfg.lengthSamples / sr();
const X = () => Math.max(0, Math.min(cfg.xfade, dur - S() - L()));
const dirty = () => ['startSample', 'lengthSamples', 'xfade'].some(k => cfg[k] !== info.config[k]);

// ---------- loading + mixing the stems ----------
function load() {
  if (loadP) return loadP;
  loadP = (async () => {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: sr() });
    const where = {};
    for (const el of LAYERS) for (const [n, db] of Object.entries(info.layers[el].stems)) where[n] = { el, g: Math.pow(10, db / 20) };
    const mix = {};
    for (const s of info.stems) {
      const w = where[s.name]; if (!w) continue;
      statEl.textContent = 'Loading stems ' + (s.i + 1) + '/' + info.stems.length + ': ' + s.name + '...';
      const r = await fetch('/api/music/stem/' + s.i);
      if (!r.ok) throw new Error('could not read the "' + s.name + '" stem (is audio/Breath of the Waltz Stems still there?)');
      const dec = await ctx.decodeAudioData(await r.arrayBuffer());
      const b = mix[w.el] || (mix[w.el] = ctx.createBuffer(2, dec.length, sr()));
      const n = Math.min(b.length, dec.length);
      for (let c = 0; c < 2; c++) {
        const src = dec.getChannelData(Math.min(c, dec.numberOfChannels - 1)), d = b.getChannelData(c);
        for (let i = 0; i < n; i++) d[i] += src[i] * w.g;
      }
    }
    // the build normalises each layer to the same loudness; approximate that with one RMS gain per layer
    norm = {}; bufs = mix;
    let len = Infinity;
    for (const el of LAYERS) {
      const b = mix[el], d = b.getChannelData(0); let e = 0, n = 0;
      for (let i = 0; i < d.length; i += 7) { e += d[i] * d[i]; n++; }
      norm[el] = 0.07 / Math.max(1e-4, Math.sqrt(e / n));
      len = Math.min(len, b.length);
    }
    mono = new Float32Array(len);
    for (const el of LAYERS) {
      const a = mix[el].getChannelData(0), b = mix[el].getChannelData(1), g = norm[el] * 0.5;
      for (let i = 0; i < len; i++) mono[i] += (a[i] + b[i]) * g;
    }
    dur = len / sr();
    statEl.textContent = 'Stems ready · song is ' + fmt(dur) + ' · layer balance here is approximate, the loop and its wrap are exact.';
  })();
  loadP.catch(e => { loadP = null; statEl.textContent = ''; say(e.message, true); });
  return loadP;
}

// ---------- playback (the game's wrap) ----------
function stop() {
  if (!play) return;
  clearInterval(play.timer);
  for (const s of play.srcs) { try { s.stop(); } catch (e) { /* done */ } }
  try { play.out.disconnect(); } catch (e) { /* gone */ }
  play = null;
}
function seg(P, T, a, b) {   // loop time [a, b) starting at audio time T
  const s = S(), l = L(), x = X(), fi = Math.min(fade.in, l / 2) || 1e-3, fo = Math.min(fade.out, l / 2) || 1e-3;
  const g = u => (u < fi ? u / fi : u > l - fo ? (l - u) / fo : 1);
  P.env.gain.setValueAtTime(g(a), T);
  for (const u of [fi, l - fo, b]) if (u > a && u <= b) P.env.gain.linearRampToValueAtTime(g(u), T + u - a);
  for (const el of LAYERS) {
    const src = ctx.createBufferSource(); src.buffer = bufs[el]; src.connect(P.lg[el]); src.start(T, s + a, b - a);
    P.srcs.push(src); src.onended = () => { const i = P.srcs.indexOf(src); if (i >= 0) P.srcs.splice(i, 1); };
    if (x > 0 && a < x) {   // the song after the loop end rings on, fading out under the start
      const tb = Math.min(b, x), n = 48, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = Math.cos(Math.PI / 2 * (a + (tb - a) * i / (n - 1)) / x);
      const ts = ctx.createBufferSource(), tg = ctx.createGain();
      ts.buffer = bufs[el]; ts.connect(tg); tg.connect(P.lg[el]);
      tg.gain.setValueCurveAtTime(curve, T, tb - a); ts.start(T, s + l + a, tb - a);
      P.srcs.push(ts); ts.onended = () => { const i = P.srcs.indexOf(ts); if (i >= 0) P.srcs.splice(i, 1); try { tg.disconnect(); } catch (e) { /* gone */ } };
    }
  }
  P.segs.push({ T, a, b });
  if (P.segs.length > 6) P.segs.shift();
}
async function start(mode) {
  stop();
  try { await load(); } catch (e) { return; }
  if (ctx.state === 'suspended') await ctx.resume();
  const out = ctx.createGain(), env = ctx.createGain(), lg = {};
  out.gain.value = 0.85; env.connect(out); out.connect(ctx.destination);
  for (const el of LAYERS) { lg[el] = ctx.createGain(); lg[el].gain.value = lit[el] ? norm[el] : 0; lg[el].connect(mode === 'song' ? out : env); }
  const P = play = { mode, out, env, lg, srcs: [], segs: [], nextT: ctx.currentTime + 0.12, qi: 0, timer: 0, song: null };
  if (mode === 'song') {
    const T = ctx.currentTime + 0.12, m = Math.min(mark, dur - 0.5);
    for (const el of LAYERS) { const s = ctx.createBufferSource(); s.buffer = bufs[el]; s.connect(lg[el]); s.start(T, m); P.srcs.push(s); }
    P.song = { T, m };
    return;
  }
  const l = L(), q = mode === 'seam' ? [[Math.max(0, l - 6), l], [0, Math.min(l, 6)]] : [[0, l]];
  const pump = () => {
    while (play === P && P.nextT < ctx.currentTime + 1.5) { const [a, b] = q[P.qi++ % q.length]; seg(P, P.nextT, a, b); P.nextT += b - a; }
  };
  P.timer = setInterval(pump, 200); pump();
}
function playhead() {   // song time of the playhead, or null
  if (!play || !ctx) return null;
  const now = ctx.currentTime;
  if (play.song) return now >= play.song.T ? play.song.m + now - play.song.T : null;
  for (let i = play.segs.length - 1; i >= 0; i--) { const s = play.segs[i]; if (now >= s.T) return S() + Math.min(s.b, s.a + now - s.T); }
  return null;
}

// ---------- waveform views ----------
function viewRange(v) { return v.fix || v.range(); }
function drawView(v) {
  const cv = v.cv, box = cv.parentElement, dpr = window.devicePixelRatio || 1;
  const W = Math.max(50, box.clientWidth), H = box.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'), cw = cv.width, ch = cv.height, mid = ch / 2;
  g.clearRect(0, 0, cw, ch);
  if (!mono) return;
  const [t0, t1] = viewRange(v), span = t1 - t0, xOf = t => (t - t0) / span * cw;
  const s = S(), e = s + L(), x = X();
  g.fillStyle = 'rgba(240,166,64,0.10)'; g.fillRect(xOf(s), 0, xOf(e) - xOf(s), ch);
  g.fillStyle = 'rgba(255,120,90,0.22)'; g.fillRect(xOf(e), 0, xOf(e + x) - xOf(e), ch);
  // peaks
  const rate = sr();
  for (let px = 0; px < cw; px++) {
    const i0 = Math.max(0, Math.floor((t0 + px / cw * span) * rate)), i1 = Math.min(mono.length, Math.floor((t0 + (px + 1) / cw * span) * rate) + 1);
    if (i1 <= i0) continue;
    let lo = 1, hi = -1; const st = Math.max(1, Math.floor((i1 - i0) / 300));
    for (let i = i0; i < i1; i += st) { const m = mono[i]; if (m < lo) lo = m; if (m > hi) hi = m; }
    const t = t0 + px / cw * span, inside = t >= s && t <= e + x;
    g.fillStyle = inside ? '#7fc4ff' : '#33465c';
    g.fillRect(px, mid - Math.min(1, hi * 2.4) * mid * 0.95, 1, Math.max(1, (Math.min(1, hi * 2.4) - Math.max(-1, lo * 2.4)) * mid * 0.95));
  }
  // the song's grid, once the bars are far enough apart to read
  const barPx = BAR / span * cw;
  if (barPx > 8 * dpr) {
    const k0 = Math.ceil((t0 - ANCHOR) / BEAT), k1 = Math.floor((t1 - ANCHOR) / BEAT);
    for (let k = k0; k <= k1; k++) {
      const bar = ((k % 3) + 3) % 3 === 0;
      if (!bar && BEAT / span * cw < 10 * dpr) continue;
      g.fillStyle = bar ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.10)';
      g.fillRect(Math.round(xOf(ANCHOR + k * BEAT)), 0, Math.max(1, dpr), bar ? ch : ch * 0.35);
    }
  }
  // the fade the game puts on each pass (in over the first fade-in seconds, out over the last fade-out seconds)
  { const l = L(), fi = Math.min(fade.in, l / 2), fo = Math.min(fade.out, l / 2), yOf = v => ch - 4 * dpr - v * (ch - 14 * dpr);
    g.strokeStyle = 'rgba(255,230,140,0.75)'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(xOf(s), yOf(0)); g.lineTo(xOf(s + fi), yOf(1)); g.lineTo(xOf(e - fo), yOf(1)); g.lineTo(xOf(e), yOf(0)); g.stroke(); }
  const line = (t, col, label, right) => {
    const px = xOf(t); if (px < -2 || px > cw + 2) return;
    g.fillStyle = col; g.fillRect(px - dpr, 0, 2 * dpr, ch);
    g.font = (11 * dpr) + 'px system-ui'; g.textAlign = right ? 'right' : 'left';
    g.fillText(label, px + (right ? -6 : 6) * dpr, 13 * dpr);
  };
  line(s, '#f0a640', 'START ' + fmt(s), false);
  line(e, '#f0a640', 'END ' + fmt(e), true);
  if (x > 0.02) line(e + x, 'rgba(255,120,90,0.8)', 'tail', false);
  if (mark > t0 && mark < t1) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(xOf(mark), ch * 0.3, dpr, ch * 0.7); }
  const ph = playhead();
  if (ph != null && ph >= t0 && ph <= t1) { g.fillStyle = '#fff'; g.fillRect(xOf(ph) - dpr, 0, 2 * dpr, ch); }
}
function makeView(title, hintText, range, tall) {
  const cv = h('canvas', {}), box = h('div', { class: 'wave', style: 'height:' + (tall ? 150 : 110) + 'px' }, cv);
  const v = { cv, range, fix: null };
  const tAt = e => { const r = box.getBoundingClientRect(), [t0, t1] = viewRange(v); return t0 + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (t1 - t0); };
  box.addEventListener('pointerdown', e => {
    if (!mono) return;
    e.preventDefault();
    const [t0, t1] = viewRange(v), r = box.getBoundingClientRect(), pxOf = t => (t - t0) / (t1 - t0) * r.width + r.left;
    const dS = Math.abs(e.clientX - pxOf(S())), dE = Math.abs(e.clientX - pxOf(S() + L()));
    const which = Math.min(dS, dE) < 10 ? (dS < dE ? 'start' : 'end') : null;
    if (!which) { mark = tAt(e); redraw(); return; }
    v.fix = [t0, t1];
    const move = ev => { (which === 'start' ? setStart : setEnd)(tAt(ev)); };
    const up = () => { v.fix = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); redraw(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  new ResizeObserver(() => drawView(v)).observe(box);
  views.push(v);
  return h('div', {}, h('div', { class: 'hint', style: 'margin:8px 0 0' }, h('b', {}, title), ' ', hintText), box);
}
function redraw() { for (const v of views) drawView(v); for (const f of fields) f(); }

// ---------- edits ----------
const snap = () => snapSel.value;
function commit(s, e, x) {
  const r = sr(), minLen = 2;
  s = Math.max(0, Math.min(s, dur - minLen - 0.05));
  e = Math.max(s + minLen, Math.min(e, dur - (x == null ? cfg.xfade : x)));
  cfg.startSample = Math.round(s * r);
  cfg.lengthSamples = Math.max(r * minLen, Math.round((e - s) * r));
  if (x != null) cfg.xfade = Math.max(0, Math.min(9, Math.round(x * 1000) / 1000));
  redraw();
}
function setStart(t) {
  const e = S() + L();
  if (snap() === 'beats') t = ANCHOR + Math.round((t - ANCHOR) / BEAT) * BEAT;
  else if (snap() === 'bars') t = S() + Math.round((t - S()) / BAR) * BAR;   // whole bars, so the loop keeps its rhythm
  commit(t, e);
}
function setEnd(t) {
  if (snap() === 'beats') t = ANCHOR + Math.round((t - ANCHOR) / BEAT) * BEAT;
  else if (snap() === 'bars') t = S() + Math.max(1, Math.round((t - S()) / BAR)) * BAR;
  commit(S(), t);
}
const nudgeStart = d => commit(S() + d, S() + L());
const nudgeEnd = d => commit(S(), S() + L() + d);

// ---------- save / reset ----------
async function build(reset) {
  stop();
  if (reset ? !confirm('Go back to the original loop and rebuild the four music files?') : false) return;
  buildBtns.forEach(b => { b.disabled = true; });
  statEl.textContent = 'Building the four music layers with ffmpeg (about a minute)...';
  logEl.textContent = '';
  try {
    const j = reset ? await api('/api/music', { method: 'DELETE' }) : await postJson('/api/music', cfg);
    logEl.textContent = (j.log || []).join('\n') + (j.error ? '\n' + j.error : '');
    if (!j.ok) { say(j.error, true); return; }
    info = j.info; cfg = Object.assign({}, info.config);
    say('Game music rebuilt. Reload the game (or the preview) to hear it.');
    statEl.textContent = 'Rebuilt: audio/music/music_<element>.js now loop ' + fmt(L()) + '.';
    redraw();
  } catch (e) { say('Build failed: ' + e.message, true); logEl.textContent = e.message; }
  finally { buildBtns.forEach(b => { b.disabled = false; }); }
}

// ---------- the panel ----------
export async function mount(editor) {
  views = []; fields = []; buildBtns = [];
  editor.append(h('h2', {}, 'Game music', h('small', {}, 'the layered soundtrack')));
  try { info = await api('/api/music'); } catch (e) { editor.append(h('p', { class: 'hint' }, 'Could not read the music setup: ' + e.message)); return; }
  if (!info.stems.length) { editor.append(h('p', { class: 'hint' }, 'The stems in audio/Breath of the Waltz Stems are missing, so the loop cannot be trimmed or rebuilt.')); return; }
  cfg = Object.assign({}, info.config);
  try { const tv = (await api('/api/tuning')).values || {}; fade = { in: tv['music.fadeIn'] ?? CFG.music.fadeIn, out: tv['music.fadeOut'] ?? CFG.music.fadeOut }; } catch (e) { fade = { in: CFG.music.fadeIn, out: CFG.music.fadeOut }; }
  statEl = h('div', { class: 'hint' }, 'Loading...');
  logEl = h('pre', { class: 'glog', style: 'max-height:140px;overflow:auto' });
  snapSel = h('select', {}, h('option', { value: 'bars' }, 'whole bars'), h('option', { value: 'beats' }, 'beats'), h('option', { value: 'free' }, 'free'));
  dirtyEl = h('span', { class: 'saved' });
  const play_ = (label, mode, primary) => h('button', { class: primary ? 'primary' : '', onclick: () => start(mode) }, label);
  const layerBox = el => {
    const cb = h('input', { type: 'checkbox' }); cb.checked = true;
    cb.addEventListener('change', () => { lit[el] = cb.checked; if (play) play.lg[el].gain.setTargetAtTime(cb.checked ? norm[el] : 0, ctx.currentTime, 0.02); });
    return h('label', { class: 'chk', style: 'display:inline-flex;gap:4px;align-items:center;color:' + LCOL[el] }, cb, el);
  };
  const saveBtn = h('button', { class: 'primary', onclick: () => build(false) }, 'Save & rebuild game music');
  const resetBtn = h('button', { class: 'danger', onclick: () => build(true) }, 'Reset to original loop');
  buildBtns = [saveBtn, resetBtn];

  editor.append(
    h('div', { class: 'hint' }, 'This is the music the game loops: the song cut between START and END (the loop), with the tail after END ringing on under the start (yellow line: the game' + String.fromCharCode(39) + 's fade on every pass, in over ' + fade.in + ' s and out over the last ' + fade.out + ' s; set them in the Variables tab as music.fadeIn / music.fadeOut). Drag the orange lines, or use the boxes and nudges below, and listen to the wrap. Nothing changes in the game until you press Save & rebuild.'),
    statEl,
    h('div', { class: 'abtns' }, play_('Play loop', 'loop', true), play_('Play the wrap', 'seam'), play_('Play song from marker', 'song'), h('button', { onclick: stop }, 'Stop'),
      h('span', { style: 'flex:1' }), h('span', { class: 'hint' }, 'Layers:'), LAYERS.map(layerBox)),
    makeView('Whole song', 'Click to set the marker; drag START / END.', () => [0, dur || 1], true),
    makeView('Around START', 'Dashes = beats, bright = bar lines.', () => [Math.max(0, S() - 1), S() + 9]),
    makeView('Around END', 'Orange = last part of the loop, red = the tail that rings under the start.', () => [Math.max(0, S() + L() - 8), S() + L() + 2]));

  const grid = h('div', { class: 'agrid', style: 'grid-template-columns:120px 110px minmax(0,1fr)' });
  const num = (label, get, set, step, help) => {
    const nb = h('input', { type: 'number', step, style: 'width:100px' });
    nb.addEventListener('change', () => set(+nb.value));
    fields.push(() => { if (document.activeElement !== nb) nb.value = Math.round(get() * 1000) / 1000; });
    return [h('label', { title: help || '' }, label), nb, help ? h('span', { class: 'hint', style: 'margin:0' }, help) : h('span')];
  };
  const nudges = (fn, items) => h('div', { class: 'abtns', style: 'margin:0;grid-column:2 / 4' }, items.map(([t, d]) => h('button', { onclick: () => fn(d) }, t)));
  grid.append(...num('Start (s)', S, t => commit(t, S() + L()), 0.001, 'where the loop begins'),
    h('label', {}, 'Nudge start'), nudges(nudgeStart, [['-1 bar', -BAR], ['-1 beat', -BEAT], ['-10 ms', -0.01], ['+10 ms', 0.01], ['+1 beat', BEAT], ['+1 bar', BAR]]),
    ...num('End (s)', () => S() + L(), t => commit(S(), t), 0.001, 'where the loop wraps back to the start'),
    h('label', {}, 'Nudge end'), nudges(nudgeEnd, [['-1 bar', -BAR], ['-1 beat', -BEAT], ['-10 ms', -0.01], ['+10 ms', 0.01], ['+1 beat', BEAT], ['+1 bar', BAR]]),
    ...num('Tail (s)', () => cfg.xfade, t => commit(S(), S() + L(), t), 0.05, 'song after END that rings on under the start'),
    h('label', {}, 'Snap drags to'), snapSel, h('span', { class: 'hint', style: 'margin:0' }, 'whole bars keeps the loop in rhythm'),
    h('label', {}, 'Length'), h('b', { id: 'mlen' }), h('span'));
  fields.push(() => {
    const l = L(), bars = l / BAR;
    $('#mlen', grid).textContent = fmt(l) + ' = ' + (Math.abs(bars - Math.round(bars)) < 0.005 ? Math.round(bars) + ' bars' : bars.toFixed(2) + ' bars') + (cfg.lengthSamples === info.defaults.lengthSamples ? ' (original)' : '');
    dirtyEl.textContent = dirty() ? 'unsaved changes' : (info.custom ? 'saved (custom loop)' : 'original loop');
    dirtyEl.classList.toggle('bad', dirty());
  });
  editor.append(grid, h('div', { class: 'abtns' }, saveBtn, resetBtn, dirtyEl), logEl);

  try { await load(); redraw(); } catch (e) { /* load() already told the user */ }
}
export function stopMusic() { stop(); }
export function playLoop() { start('loop'); }
export function resize() { redraw(); }
(function tick() { if (play && views.length) for (const v of views) drawView(v); requestAnimationFrame(tick); })();
