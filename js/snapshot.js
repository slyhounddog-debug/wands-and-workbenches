'use strict';
// DEV ONLY: the snapshot photo test. It proves the architecture guardrails (see CLAUDE.md) are holding:
// write down everything the game knows, redraw the screen from that list alone, and catch anything the list missed.
//
//   capture   Snap.capture() walks G and builds a plain-JSON copy (the snapshot) of it. Everything that cannot survive
//             JSON.parse(JSON.stringify(G)) is listed as an ISSUE: functions, DOM nodes / canvases / class instances, cycles,
//             NaN / Infinity, and shared references (the same object reachable from two places, which JSON turns into two copies).
//   photo     Snap.photo() draws one live frame, then swaps the global G for a read-only proxy of the snapshot and draws the
//             frame again with the real renderers (R.drawFactory / R.drawWorld). While that frame draws:
//               - reading a G field that the snapshot lost                      -> LEAK missing
//               - writing to G (the renderer must never mutate state)           -> LEAK write
//               - reading or writing live state outside G (R.fcam, UI.treeOpen, WZ.bucket, ...)  -> LEAK read / write
//             Every leak logs a console warning (the leak alarm) and the read still returns the live value, so the two frames can
//             be compared pixel for pixel. Math.random and the clocks are pinned for both frames (rendering-only sparkle is fine).
//   view      LIVE / SNAPSHOT / BLINK / DIFF of the two cached frames; the simulation is frozen while one is on.
//
// Entry points: __wands.snapshot() and the SNAPSHOT bar under the F3 overlay (nothing shows without the overlay).
// The snapshot format is its own thing: the save format is untouched. The DOM HUD is not part of the photo (canvas frame only).
const Snap = { snap: null, mode: 'off', img: null, report: null, MODES: ['live', 'snap', 'blink', 'diff'], bar: null };

(function () {
  // Live state outside G that the renderers may read without it being a leak: scratch the renderer owns, and the world that is
  // generated once from a fixed seed (terrain, palette, landmark positions). Everything else on these modules is a leak.
  const ALLOW = new Set([
    'R.defer', 'R.px', 'R.org', 'R.bufs', 'R.fv', 'R.wv', 'R.mapC', 'R.rect',   // (R.rect: the rectangle the draw call was given)
    'WZ.terrain', 'WZ.palette', 'WZ.marks', 'WZ.bucket',   // (WZ.bucket is the static layout of nodes; their changing state is G.w.hv / G.w.fg)
    'FA.splitCol',   // constant colour table
  ]);
  // The audit of 2026-10-22: what is already known to leak or break the rules. The photo test reports these as KNOWN; the standing
  // check fails only for something that is NOT in here. Delete a line when its cause is fixed.
  // Leaks are matched by id, state issues by id prefix.
  Snap.KNOWN = {
    leaks: new Set([
      'read R.fcam', 'read R.wcam',                                  // smoothed cameras live on R
      'read R.focus', 'read R.hoverB', 'read R.ghost', 'read R.demo', 'read R.aim', 'read R.hint', 'read R.whint', 'read R.padMode',   // prompts, pointers, placement ghost: computed in Main.updateFocus, stored on R
      'read UI.treeOpen',                                            // the skill tree being open lives in UI (and it freezes the sim)
    ]),
    issues: [
      'alias G.fac.bld[]', 'alias G.fac.belts[]', 'alias G.bd.then', 'alias G.bd.gather', 'alias G.lock',   // grid cells ARE the bld / belts objects, and targets point into them
      'alias G.w.enemies[]._c', 'alias G.w.proj[].ctx', 'alias G.w.zones[].ctx',                            // the spell context (WZ.ctx) is shared by reference
      'alias G.w.boss', 'alias G.ev.active.plan',                    // G.w.boss is also in G.w.enemies; the active event's plan is also G.ev.plan
      'function G.w.timers[].fn',                                    // WZ.later / WZ.telegraph store closures in G
    ],
    has: (list, id) => (list instanceof Set ? list.has(id) : list.some(p => id.startsWith(p))),
  };

  const norm = p => p.replace(/\[\d+\]/g, '[]');
  const preview = v => { try { const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s === undefined ? typeof v : s.length > 90 ? s.slice(0, 90) + '...' : s; } catch (e) { return '[' + (v && v.constructor ? v.constructor.name : typeof v) + ']'; } };

  // ---------- capture ----------
  Snap.capture = function () {
    if (typeof G === 'undefined' || !G) return null;
    const issues = new Map(), twin = new WeakMap(), seen = new Map(), stack = new Set();
    const note = (kind, path, info) => {
      const id = kind + ' ' + norm(path), i = issues.get(id);
      if (i) i.n++; else issues.set(id, { id, kind, path: norm(path), example: path, n: 1, info: info || '' });
    };
    const walk = (v, path) => {
      const t = typeof v;
      if (v === null || t === 'undefined') return v;
      if (t === 'number') { if (!isFinite(v)) { note('number', path, String(v)); return null; } return v; }
      if (t === 'string' || t === 'boolean') return v;
      if (t === 'function') { note('function', path, v.name || 'anonymous'); return undefined; }
      if (t !== 'object') { note(t, path); return undefined; }
      if (stack.has(v)) { note('cycle', path); return undefined; }
      const isArr = Array.isArray(v), proto = Object.getPrototypeOf(v);
      if (!isArr && proto !== Object.prototype && proto !== null) { note('instance', path, v.constructor ? v.constructor.name : '?'); return undefined; }
      if (seen.has(v)) note('alias', path, 'same object as ' + norm(seen.get(v))); else seen.set(v, path);
      stack.add(v);
      let out;
      if (isArr) {
        out = [];
        for (let i = 0; i < v.length; i++) { const r = walk(v[i], path + '[' + i + ']'); out.push(r === undefined ? null : r); }
      } else {
        out = {};
        for (const k of Object.keys(v)) { const r = walk(v[k], path + '.' + k); if (r !== undefined) out[k] = r; }
      }
      stack.delete(v);
      twin.set(out, v);
      return out;
    };
    const clone = walk(G, 'G');
    // the literal rule: JSON.parse(JSON.stringify(G)) must work
    try { JSON.parse(JSON.stringify(G)); } catch (e) { note('json', 'G', 'JSON.stringify(G) throws: ' + e.message); }
    const snap = {
      format: 'wands-snapshot', v: 1,
      taken: { playSeconds: G.stats ? G.stats.time : 0, factoryT: G.fac ? G.fac.t : 0, wildsT: G.w ? G.w.t : 0, wallClock: new Date().toISOString() },
      world: 'fixed seed (WZ.generate): terrain, palette and landmark positions are regenerated, not stored',
      issues: [...issues.values()], leaks: null, G: clone,
    };
    Object.defineProperty(snap, 'twin', { value: twin, enumerable: false });   // clone -> live twin, for the missing-field check only
    Snap.snap = snap;
    Snap.report = null;
    return snap;
  };

  // The wire snapshot (online co-op, js/net.js): G as one JSON string. This is the literal rule of the guardrails (JSON.parse(JSON.stringify(G)) must work) taken at face
  // value: the native serializer drops functions and turns NaN / Infinity into null, exactly the cases capture() reports as issues, and it is far cheaper than capture's
  // audit walk (no alias or cycle bookkeeping), which matters 20 times a second. tools/snapcheck compares it with capture().G on every run. Duplicated identity (a grid
  // cell that IS a building) simply becomes two equal copies: the guest never mutates its copy.
  Snap.wire = function () { return JSON.stringify(G); };

  // ---------- the leak alarm ----------
  let leaks = new Map();
  const where = () => {
    const lines = (new Error()).stack.split('\n').slice(1);
    for (const ln of lines) {
      if (/snapshot\.js/.test(ln)) continue;
      const m = ln.match(/at (?:(\S+) \()?[^()\s]*?([\w-]+\.js):(\d+):\d+/);
      if (m) return (m[1] ? m[1] + ' ' : '') + m[2] + ':' + m[3];
    }
    return '?';
  };
  const leak = (kind, key, val) => {
    const id = kind + ' ' + key;
    let e = leaks.get(id);
    if (!e) {
      e = { id, kind, key, n: 0, at: where(), value: val === undefined ? '' : preview(val) };
      leaks.set(id, e);
      console.warn('[snapshot] LEAK ' + id + ' (first at ' + e.at + ')');
    }
    e.n++;
  };

  // a read-only proxy of the snapshot: this is the only G the renderers may see during the snapshot frame
  const guard = snap => {
    const cache = new WeakMap();
    const wrap = (obj, path) => {
      let p = cache.get(obj);
      if (p) return p;
      p = new Proxy(obj, {
        get(t, k, r) {
          if (typeof k === 'symbol') return Reflect.get(t, k, r);
          if (!(k in t)) {
            const live = snap.twin.get(t);
            if (live && live[k] !== undefined && typeof live[k] !== 'function') leak('missing', norm(path + '.' + k), live[k]);
            else if (live && typeof live[k] === 'function') leak('missing', norm(path + '.' + k) + ' (function)');
            return undefined;
          }
          const v = t[k];
          return v && typeof v === 'object' ? wrap(v, path + '.' + k) : v;
        },
        set(t, k) { leak('write', norm(path + '.' + String(k))); return true; },
        deleteProperty(t, k) { leak('write', norm(path + '.' + String(k)) + ' (delete)'); return true; },
        defineProperty(t, k) { leak('write', norm(path + '.' + String(k))); return true; },
      });
      cache.set(obj, p);
      return p;
    };
    return wrap(snap.G, 'G');
  };

  // while the snapshot frame draws, the live state on every module becomes a trip wire (functions are fine: the ones that read
  // state read the proxy)
  const arm = () => {
    const ns = { R, FA, WZ, UI, Main, IN, AU, Players, DevBot }, recs = [];
    for (const name in ns) {
      const o = ns[name];
      for (const key of Object.getOwnPropertyNames(o)) {
        const d = Object.getOwnPropertyDescriptor(o, key);
        if (!d || !d.configurable || !('value' in d) || typeof d.value === 'function' || ALLOW.has(name + '.' + key)) continue;
        const rec = { o, key, enumerable: d.enumerable, cur: d.value, id: name + '.' + key };
        Object.defineProperty(o, key, {
          configurable: true, enumerable: d.enumerable,
          get() { leak('read', rec.id, rec.cur); return rec.cur; },
          set(x) { leak('write', rec.id, x); rec.cur = x; },
        });
        recs.push(rec);
      }
    }
    return recs;
  };
  const disarm = recs => { for (const r of recs) Object.defineProperty(r.o, r.key, { value: r.cur, writable: true, configurable: true, enumerable: r.enumerable }); };

  // rendering-only randomness and clocks are pinned, so two draws of the same state are pixel-identical
  const pinned = fn => {
    const mr = Math.random, dn = Date.now, pn = performance.now;
    let s = 12345; const t0 = 1000000;
    Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    Date.now = () => t0; performance.now = () => t0;
    try { return fn(); } finally { Math.random = mr; Date.now = dn; performance.now = pn; }
  };
  const drawFrame = c => { c.clearRect(0, 0, CFG.W, CFG.H); R.drawFactory(c, 0); R.drawWorld(c, 0); };

  // ---------- the photo test ----------
  Snap.photo = function () {
    const snap = Snap.snap;
    if (!snap) return null;
    const cv = document.getElementById('cv'), c = cv.getContext('2d'), W = CFG.W, H = CFG.H;
    const rd = document.createElement('canvas'); rd.width = W; rd.height = H;
    const rc = rd.getContext('2d', { willReadFrequently: true }), grab = () => { rc.clearRect(0, 0, W, H); rc.drawImage(cv, 0, 0); return rc.getImageData(0, 0, W, H); };
    pinned(() => drawFrame(c));
    const live = grab();
    leaks = new Map();
    const liveG = G, recs = arm();
    try { G = guard(snap); pinned(() => drawFrame(c)); }
    catch (e) { leak('error', 'the snapshot frame threw: ' + (e && e.message)); }
    finally { G = liveG; disarm(recs); R.defer = null; }
    const shot = grab();
    // pixel diff
    const a = live.data, b = shot.data, d = new ImageData(W, H);
    let px = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0, n = W * H; i < n; i++) {
      const j = i * 4;
      if (a[j] !== b[j] || a[j + 1] !== b[j + 1] || a[j + 2] !== b[j + 2]) {
        px++; d.data[j] = 255; d.data[j + 1] = 0; d.data[j + 2] = 60; d.data[j + 3] = 255;
        const x = i % W, y = (i / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      } else { d.data[j] = a[j] >> 2; d.data[j + 1] = a[j + 1] >> 2; d.data[j + 2] = a[j + 2] >> 2; d.data[j + 3] = 255; }
    }
    Snap.img = { live, snap: shot, diff: d };
    const list = [...leaks.values()].map(l => Object.assign({ known: Snap.KNOWN.has(Snap.KNOWN.leaks, l.id) }, l));
    const issues = snap.issues.map(i => Object.assign({ known: Snap.KNOWN.has(Snap.KNOWN.issues, i.id) }, i));
    const fresh = list.filter(l => !l.known).length + issues.filter(i => !i.known).length;
    const clean = !list.length && !issues.length && px === 0;
    snap.leaks = list;
    Snap.report = {
      verdict: clean ? 'PASS' : fresh || px ? 'FAIL' : 'KNOWN',
      leaks: list, issues, diff: { px, pct: +(px * 100 / (W * H)).toFixed(3), bbox: px ? [x0, y0, x1, y1] : null },
    };
    const r = Snap.report;
    console.log('[snapshot] photo test ' + r.verdict + ': ' + list.length + ' leaks, ' + issues.length + ' state issues, ' + px + ' px differ (' + r.diff.pct + '%)');
    return r;
  };

  Snap.run = function () {
    const s = Snap.capture();
    if (!s) return null;
    Snap.photo();
    Snap.ui();
    return s;
  };

  // ---------- view ----------
  Snap.show = function (mode) {
    if (mode === 'off' || !mode) { Snap.mode = 'off'; Snap.ui(); return; }
    if (!Snap.img) return;
    Snap.mode = mode;
    Snap.ui();
  };
  Snap.cycle = function () {
    if (!Snap.snap) { Snap.run(); }
    const i = Snap.MODES.indexOf(Snap.mode);
    Snap.show(Snap.MODES[(i + 1) % Snap.MODES.length]);
  };
  // drawn instead of the live frame while a view is on (the main loop skips the simulation then)
  Snap.draw = function (ctx, ts) {
    const im = Snap.img;
    if (!im) return;
    const which = Snap.mode === 'blink' ? (Math.floor(ts / 600) % 2 ? 'snap' : 'live') : Snap.mode;
    ctx.putImageData(im[which], 0, 0);
    const r = Snap.report, label = (which === 'snap' ? 'SNAPSHOT FRAME' : which === 'live' ? 'LIVE FRAME' : 'DIFF (red = differs)') + '  ' + r.verdict + '  leaks ' + r.leaks.length + '  diff ' + r.diff.pct + '%';
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(CFG.W / 2 - 330, 850, 660, 32);
    ctx.fillStyle = which === 'snap' ? '#ffe36b' : which === 'live' ? '#7be0ff' : '#ff6a8a';
    ctx.font = '20px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, CFG.W / 2, 873);
  };
  Snap.download = function () {
    if (!Snap.snap) Snap.run();
    const s = Snap.snap;
    if (!s) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }));
    a.download = 'wands-snapshot-' + Math.round(s.taken.playSeconds) + 's.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ---------- the bar under the F3 overlay (and the F2 key while it is open) ----------
  Snap.ui = function () {
    const b = Snap.bar;
    if (!b) return;
    const r = Snap.report;
    b.querySelector('.st').textContent = !r ? 'no snapshot yet' : r.verdict + '  leaks ' + r.leaks.length + '  issues ' + r.issues.length + '  diff ' + r.diff.pct + '%' + (Snap.mode !== 'off' ? '  [' + Snap.mode.toUpperCase() + ']' : '');
    b.querySelector('.st').style.color = !r ? '#c8b8e8' : r.verdict === 'PASS' ? '#7be07b' : r.verdict === 'KNOWN' ? '#ffe36b' : '#ff6a8a';
  };
  Snap.init = function () {
    const stage = document.getElementById('stage');
    if (!stage || Snap.bar) return;
    const bar = document.createElement('div');
    bar.id = 'snapBar'; bar.className = 'px';
    bar.style.cssText = 'position:absolute;right:16px;bottom:130px;width:360px;padding:6px 8px;z-index:37;display:none;font:12px monospace;color:#f0e8ff;flex-wrap:wrap;gap:6px;align-items:center';
    bar.innerHTML = '<b style="font:10px var(--display);color:var(--gold)">SNAPSHOT</b>' +
      ['shot:SNAP', 'view:VIEW', 'save:SAVE', 'off:EXIT'].map(s => '<button class="px" data-k="' + s.split(':')[0] + '" style="font:10px var(--display);padding:4px 6px;color:#f0e8ff;border:0;cursor:pointer">' + s.split(':')[1] + '</button>').join('') +
      '<span class="st" style="flex-basis:100%;font:12px monospace"></span>';
    stage.appendChild(bar);
    Snap.bar = bar;
    bar.addEventListener('click', e => {
      const k = e.target && e.target.dataset && e.target.dataset.k;
      if (k === 'shot') { Snap.run(); Snap.show('blink'); }
      else if (k === 'view') Snap.cycle();
      else if (k === 'save') Snap.download();
      else if (k === 'off') Snap.show('off');
    });
    Snap.ui();
  };
  // called every frame while playing: the bar follows the F3 overlay, F2 takes a snapshot, Esc leaves the view
  Snap.tick = function () {
    if (!Snap.bar) return;
    const on = (typeof UI !== 'undefined' && UI.debugOn) || Snap.mode !== 'off';
    Snap.bar.style.display = on ? 'flex' : 'none';
    if (!on) return;
    if (IN.hit('F2')) { if (Snap.mode === 'off') { Snap.run(); Snap.show('blink'); } else Snap.cycle(); }
    if (Snap.mode !== 'off' && IN.hit('Escape')) { Snap.show('off'); IN.pressed.delete('Escape'); }   // leave the view without also pausing the game
  };
  window.addEventListener('DOMContentLoaded', Snap.init);
})();
