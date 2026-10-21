'use strict';
// Applies what the dev tool (tools/devtool) saved in overrides/ on top of the game. Those files are classic scripts and
// one stylesheet, so this still works from file://. With empty overrides nothing here changes the game.
//   overrides/tuning.js  window.TUNING = { "world.spawnStart": 1.8, "tree#water.xp": 30, ... }   -> OV.tune(CFG)
//   overrides/layout.js  window.LAYOUT = { rules: [{ sel, css, text }] }   (css lives in overrides/layout.css)
//   overrides/audio.js   window.AUDIO_OV = { hit: { file, start, end, gain, ... } }, data in overrides/audio/<name>.js
// The dev tool runs this same file inside its preview and its audio editor, so what you preview is what the game does.
const OV = {};
window.OV = OV;   // a const isn't a window property: config.js and the dev tool's preview look it up there

// ---------- tuning: "a.b.0.c" paths into CFG; "#id" picks the array element with that id (skill-tree nodes) ----------
OV.step = (o, seg) => (seg[0] === '#' && Array.isArray(o) ? o.find(x => x && x.id === seg.slice(1)) : o[seg]);
OV.resolve = function (root, path) {
  const segs = path.split('.');
  let o = root;
  for (let i = 0; i < segs.length - 1; i++) { o = OV.step(o, segs[i]); if (!o || typeof o !== 'object') return null; }
  const k = segs[segs.length - 1];
  return k in o ? { o, k } : null;
};
OV.tune = function (cfg, values) {
  for (const p in values || {}) {
    const r = OV.resolve(cfg, p), v = values[p];
    if (r && typeof r.o[r.k] === 'number' && typeof v === 'number' && isFinite(v)) r.o[r.k] = v;
  }
};

// ---------- layout text (positions and styles are plain CSS in overrides/layout.css) ----------
// rule.text = { childNodeIndex: "string" }. Static index.html text only: text the game builds from code is rewritten
// by the game. Idempotent, and remembers the originals so removing an override restores the text.
const ovOriginals = new Map();
OV.applyText = function (model, root) {
  const want = new Map();
  for (const rule of (model && model.rules) || []) {
    if (!rule.text) continue;
    let els;
    try { els = (root || document).querySelectorAll(rule.sel); } catch (e) { continue; }
    for (const el of els) for (const i in rule.text) {
      const node = el.childNodes[+i];
      if (node && node.nodeType === 3) want.set(node, rule.text[i]);
    }
  }
  for (const [node, orig] of ovOriginals) if (!want.has(node)) { node.nodeValue = orig; ovOriginals.delete(node); }
  for (const [node, s] of want) {
    if (!ovOriginals.has(node)) ovOriginals.set(node, node.nodeValue);
    if (node.nodeValue !== s) node.nodeValue = s;
  }
};
OV.originalText = node => (ovOriginals.has(node) ? ovOriginals.get(node) : node.nodeValue);

// ---------- custom audio clips: non-destructive edits applied at playback ----------
// p = { start, end (s, null = to the end), gain (x), fadeIn, fadeOut (s), rate (speed + pitch), reverse, loop }
OV.dataToBuffer = function (dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1), bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
};
OV.reversed = function (ctx, buf) {
  const r = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = r.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; }
  return r;
};
OV.window = function (buf, p) {   // the trimmed span, in seconds of the original
  const s0 = Math.max(0, Math.min(buf.duration - 0.01, +p.start || 0));
  const s1 = Math.max(s0 + 0.01, Math.min(buf.duration, p.end == null ? buf.duration : +p.end));
  return [s0, s1];
};
// plays clip (the decoded buffer, plus clip.rev = its reversed copy when needed) into dest; returns {src, gain}
OV.playClip = function (ctx, clip, p, dest) {
  const buf = clip.buf, [s0, s1] = OV.window(buf, p), rate = Math.max(0.1, +p.rate || 1), vol = p.gain == null ? 1 : +p.gain;
  let src0 = s0, src1 = s1, b = buf;
  if (p.reverse) { b = clip.rev || (clip.rev = OV.reversed(ctx, buf)); src0 = buf.duration - s1; src1 = buf.duration - s0; }
  const src = ctx.createBufferSource(), g = ctx.createGain(), t0 = ctx.currentTime, len = (src1 - src0) / rate;
  src.buffer = b; src.playbackRate.value = rate;
  src.connect(g); g.connect(dest);
  const fi = Math.min(+p.fadeIn || 0, len / 2), fo = Math.min(+p.fadeOut || 0, len / 2);
  g.gain.setValueAtTime(fi ? 0 : vol, t0);
  if (fi) g.gain.linearRampToValueAtTime(vol, t0 + fi);
  if (p.loop) {
    src.loop = true; src.loopStart = src0; src.loopEnd = src1;
    src.start(t0, src0);
  } else {
    if (fo) { g.gain.setValueAtTime(vol, t0 + len - fo); g.gain.linearRampToValueAtTime(0, t0 + len); }
    src.start(t0, src0, src1 - src0);
  }
  return { src, gain: g };
};

// ---------- boot (config.js calls OV.tune(CFG, window.TUNING) right after CFG exists) ----------
if (!window.__layoutEditor) document.addEventListener('DOMContentLoaded', () => OV.applyText(window.LAYOUT));
