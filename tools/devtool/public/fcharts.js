// Formulas tab helpers: canvas line / bar charts (hover tooltips, no dependencies), tables and stat cards.
import { h } from './common.js';

export const COL = { air: '#8fd3ff', water: '#4a8dff', fire: '#ff7a30', earth: '#c49a52', acc: '#f0a640', ok: '#6ad48a', bad: '#ff6b6b', mute: '#8fa3ba' };
export const PAL = ['#f0a640', '#4a8dff', '#6ad48a', '#ff6b6b', '#b48cff', '#5fd6d6', '#ffd23a', '#ff8fc0', '#9aa8d8', '#c49a52', '#8fd3ff', '#ff7a30'];

export function fmt(v, d) {
  if (v == null || !isFinite(v)) return v === Infinity ? 'inf' : '-';
  const a = Math.abs(v);
  if (d != null) return String(Math.round(v * 10 ** d) / 10 ** d);
  if (a >= 1000) return Math.round(v).toLocaleString();
  if (a >= 100) return String(Math.round(v * 10) / 10);
  if (a >= 10) return String(Math.round(v * 100) / 100);
  return String(Math.round(v * 1000) / 1000);
}

function niceTicks(lo, hi, n) {
  const span = hi - lo || 1, raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p, out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// spec: { title, xl, yl, series: [{ name, color, pts: [[x, y]], dash? }], xmin?, ymin?, ymax?, yfmt? }   (line)
//       { title, yl, bars: true, labels: [...], series: [{ name, color, vals: [...] }], yfmt? }          (grouped bars)
export function chart(spec, height) {
  const box = h('div', { class: 'fchart' }), cv = h('canvas', {}), tip = h('div', { class: 'ftip', hidden: true });
  const legend = h('div', { class: 'flegend' }, spec.series.length > 1 || spec.legend ? spec.series.map((s, i) => h('span', {}, h('i', { style: 'background:' + (s.color || PAL[i % PAL.length]) }), s.name)) : null);
  box.append(h('div', { class: 'ftitle' }, spec.title, spec.yl ? h('small', {}, ' ' + spec.yl) : null), legend, cv, tip);
  cv.style.height = (height || 210) + 'px';
  let geo = null;
  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const P = { l: 52, r: 12, t: 8, b: spec.bars ? 40 : 28 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
    const yf = spec.yfmt || fmt;
    let ys = [];
    for (const s of spec.series) for (const v of (spec.bars ? s.vals : s.pts.map(p => p[1]))) if (v != null && isFinite(v)) ys.push(v);
    let y0 = spec.ymin != null ? spec.ymin : Math.min(0, ...ys), y1 = spec.ymax != null ? spec.ymax : Math.max(...ys, 1e-9) * 1.08;
    if (y1 <= y0) y1 = y0 + 1;
    const yt = niceTicks(y0, y1, 5);
    const Y = v => P.t + ih - (v - y0) / (y1 - y0) * ih;
    g.font = '11px system-ui'; g.textBaseline = 'middle'; g.textAlign = 'right';
    g.strokeStyle = '#243448'; g.fillStyle = COL.mute; g.lineWidth = 1;
    for (const v of yt) { const y = Math.round(Y(v)) + .5; g.beginPath(); g.moveTo(P.l, y); g.lineTo(W - P.r, y); g.stroke(); g.fillText(yf(v), P.l - 6, y); }
    g.textBaseline = 'top'; g.textAlign = 'center';
    if (spec.bars) {
      const n = spec.labels.length, gw = iw / Math.max(1, n), k = spec.series.length, bw = Math.min(46, gw * 0.8 / k);
      geo = { bars: true, n, gw, P, k };
      spec.labels.forEach((lb, i) => {
        const cx = P.l + gw * (i + .5);
        spec.series.forEach((s, j) => {
          const v = s.vals[i]; if (v == null || !isFinite(v)) return;
          const x = cx - bw * k / 2 + j * bw, yy = Y(Math.max(v, y0));
          g.fillStyle = s.color || PAL[j % PAL.length]; g.fillRect(x + 1, Math.min(yy, Y(0)), bw - 2, Math.abs(Y(Math.max(0, y0)) - yy));
          if (bw >= 14 && n <= 16) { g.fillStyle = '#c9d6e4'; g.font = '10px system-ui'; g.fillText(fmt(v), x + bw / 2, yy - 12); g.font = '11px system-ui'; }
        });
        g.fillStyle = COL.mute; g.save(); g.translate(cx, H - P.b + 6);
        if (n > 8) { g.rotate(-0.45); g.textAlign = 'right'; g.translate(6, 0); }
        g.fillText(lb, 0, 0); g.restore();
      });
    } else {
      let xs = []; for (const s of spec.series) for (const p of s.pts) xs.push(p[0]);
      const x0 = spec.xmin != null ? spec.xmin : Math.min(...xs), x1 = Math.max(...xs, x0 + 1e-9);
      const X = v => P.l + (v - x0) / (x1 - x0) * iw;
      for (const v of niceTicks(x0, x1, Math.max(3, Math.round(iw / 80)))) { const x = Math.round(X(v)) + .5; g.strokeStyle = '#1b2a3b'; g.beginPath(); g.moveTo(x, P.t); g.lineTo(x, P.t + ih); g.stroke(); g.fillStyle = COL.mute; g.fillText(fmt(v), x, P.t + ih + 6); }
      if (spec.xl) { g.textAlign = 'right'; g.fillText(spec.xl, W - P.r, P.t + ih + 15); }
      spec.series.forEach((s, i) => {
        g.strokeStyle = s.color || PAL[i % PAL.length]; g.lineWidth = 2; g.setLineDash(s.dash ? [5, 4] : []); g.beginPath();
        s.pts.forEach((p, j) => { const x = X(p[0]), y = Y(p[1]); j ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke(); g.setLineDash([]);
        if (s.pts.length <= 14) { g.fillStyle = g.strokeStyle; for (const p of s.pts) { g.beginPath(); g.arc(X(p[0]), Y(p[1]), 2.5, 0, 6.3); g.fill(); } }
      });
      geo = { X, x0, x1, P, iw, ih, Y };
    }
  }
  cv.addEventListener('mousemove', ev => {
    if (!geo) return;
    const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left;
    let head, rows;
    if (geo.bars) {
      const i = Math.floor((mx - geo.P.l) / geo.gw); if (i < 0 || i >= geo.n) { tip.hidden = true; return; }
      head = spec.labels[i]; rows = spec.series.map((s, j) => [s.name, s.vals[i], s.color || PAL[j % PAL.length]]);
    } else {
      const xv = geo.x0 + (mx - geo.P.l) / geo.iw * (geo.x1 - geo.x0);
      let best = null; for (const p of spec.series[0].pts) if (!best || Math.abs(p[0] - xv) < Math.abs(best - xv)) best = p[0];
      if (best == null || mx < geo.P.l - 4 || mx > geo.P.l + geo.iw + 4) { tip.hidden = true; return; }
      head = (spec.xl ? spec.xl.replace(/\s*\(.*\)/, '') + ' ' : 'x ') + fmt(best);
      rows = spec.series.map((s, j) => { const p = s.pts.find(q => q[0] === best) || s.pts.reduce((a, q) => !a || Math.abs(q[0] - best) < Math.abs(a[0] - best) ? q : a, null); return [s.name, p && p[1], s.color || PAL[j % PAL.length]]; });
    }
    tip.hidden = false; tip.textContent = '';
    tip.append(h('b', {}, head), ...rows.map(([n, v, c]) => h('div', {}, h('i', { style: 'background:' + c }), n + ': ', h('b', {}, (spec.yfmt || fmt)(v)))));
    const tw = tip.offsetWidth; tip.style.left = Math.min(Math.max(4, mx + 12), cv.clientWidth - tw - 4) + 'px'; tip.style.top = '30px';
  });
  cv.addEventListener('mouseleave', () => { tip.hidden = true; });
  new ResizeObserver(draw).observe(cv);
  requestAnimationFrame(draw);
  return box;
}

// headers: strings; rows: arrays of strings / numbers / DOM nodes. A row can be { cells, cls } to highlight it.
export function table(headers, rows, note) {
  const t = h('table', { class: 'ftable' }, h('thead', {}, h('tr', {}, headers.map(x => h('th', {}, x)))),
    h('tbody', {}, rows.map(r => { const cells = Array.isArray(r) ? r : r.cells; return h('tr', { class: r.cls || null }, cells.map(c => h('td', { class: typeof c === 'number' ? 'n' : null }, typeof c === 'number' ? fmt(c) : c))); })));
  return h('div', { class: 'fwrap' }, t, note ? h('div', { class: 'hint' }, note) : null);
}
export const stats = items => h('div', { class: 'fstats' }, items.map(([k, v, sub]) => h('div', { class: 'fstat' }, h('small', {}, k), h('b', {}, typeof v === 'number' ? fmt(v) : v), sub ? h('em', {}, sub) : null)));
export const note = text => h('div', { class: 'hint fnote' }, text);
export const grid = (...kids) => h('div', { class: 'fgrid' }, kids);
export const range = (a, b, step) => { const o = []; for (let v = a; v <= b + 1e-9; v += step) o.push(Math.round(v * 1e6) / 1e6); return o; };
