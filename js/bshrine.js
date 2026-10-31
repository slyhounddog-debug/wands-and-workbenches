'use strict';
// Battery Shrines (plain WZ extensions, loaded after wand.js). All of it is plain data: G.bshr (saved) and G.w.bsw (the shockwaves of this expedition).
//  - EVERY finished Battery (Battery or Heavy Battery) has ONE shrine in the wilds, numbered; the number is also shown on its Battery in the factory. The world starts with the
//    starter Battery's shrine. A Battery finished on the Builder's side drops its shrine in beside the Wizard with a shockwave and a toast on both halves.
//  - A shrine is a TARGET: it stands in the hit lists next to trees and rocks (WZ.hitH), so every spell and wand attack that can hurt a tree hurts it, and the damage is turned
//    into charge for ITS Battery (WZ.bshrHurt: CFG.bshr.perDmg charge per point of damage). A full Battery makes its shrine idle (a check mark), so there is nothing to farm.
//  - Demolishing the Battery makes its shrine crumble. A shrine is not solid (the Wizard walks through it) and foes ignore it.
//  - Saved with the position of its Battery (building ids are not saved): WZ.bshrSave / WZ.bshrFix, resolved to a live Battery in WZ.bshrTick.
WZ.bshrV = 0;   // bumps whenever the list changes (WZ.hitH rebuilds its cache)
WZ.bshrMake = (id, x, y, n) => ({ id, n, x, y, bshr: true, kind: 'bshr', hp: 1, maxHp: 1, rad: CFG.bshr.r, flash: 0, surf: -1, acc: 0, popAt: -9, fullAt: -9 });
WZ.bshrFix = function (a) {
  const out = [];
  for (const s of Array.isArray(a) ? a : []) {
    if (!s || !(s.x > 1 && s.y > 1) || !(s.bx >= 0 && s.by >= 0)) continue;
    const e = WZ.bshrMake(null, +s.x, +s.y, (s.n | 0) || out.length + 1);
    e.at = [s.bx | 0, s.by | 0];   // which Battery it belongs to, until the factory is built and WZ.bshrTick can find it
    out.push(e);
  }
  return out;
};
WZ.bshrSave = function () {
  const out = [];
  for (const s of G.bshr || []) {
    const b = s.id != null ? G.fac.bld.find(o => o.id === s.id) : null, at = b ? [b.x, b.y] : s.at;
    if (at) out.push({ n: s.n, x: s.x, y: s.y, bx: at[0], by: at[1] });
  }
  return out;
};
WZ.bshrBat = s => (s.id == null ? null : G.fac.bld.find(b => b.id === s.id) || null);
// the hit list: the harvestables and the shrines (cached; harvestables never change, so only a change of shrines rebuilds it)
let hhList = null, hhFor = null, hhV = -1, hhBase = null;
WZ.hitH = function () {
  const L = G.bshr;
  if (!L || !L.length) return WZ.harv;
  if (hhFor !== L || hhV !== WZ.bshrV || hhBase !== WZ.harv) { hhList = WZ.harv.concat(L); hhFor = L; hhV = WZ.bshrV; hhBase = WZ.harv; }
  return hhList;
};

// ---------- where it stands ----------
WZ.bshrSpot = function (near) {
  const w = G.w, B = CFG.bshr, cam = (typeof R !== 'undefined' && R.wcam) || w;
  const clear = (x, y) => {
    if (x < 6 || y < 6 || x > CFG.WW - 6 || y > CFG.WH - 6) return false;
    for (let i = 0; i < 9; i++) { const a = i * 0.785, rr = i ? B.r + 0.3 : 0; if (WZ.blocked(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.3)) return false; }
    const t = WZ.tile(x, y);
    if (t === T_BOG || t === T_SCORCH || t === T_ICE) return false;
    if (WZ.marks.some(m => Math.hypot(m.x - x, m.y - y) < B.clear)) return false;
    if (WZ.harv.some(h => !h.broken && Math.hypot(h.x - x, h.y - y) < B.r + 1.2)) return false;
    if (WZ.forage.some(f => Math.hypot(f.x - x, f.y - y) < B.r + 1)) return false;
    if (G.altar && G.altar.placed && Math.hypot(G.altar.x - x, G.altar.y - y) < CFG.altar.r + B.r + 2) return false;
    if (G.bshr.some(s => Math.hypot(s.x - x, s.y - y) < B.gap)) return false;
    return true;
  };
  const px = w.x, py = w.y;
  for (let i = 0; i < 200; i++) {
    const a = Math.random() * 6.283, d = B.spotMin + Math.random() * (B.spotMax - B.spotMin);
    const x = Math.floor(clampN(px + Math.cos(a) * d, 1, CFG.WW - 1)) + 0.5, y = Math.floor(clampN(py + Math.sin(a) * d, 1, CFG.WH - 1)) + 0.5;
    if (!clear(x, y)) continue;
    if (near) {   // a new one arrives where the Wizard can see it: well inside the camera and below the HUD cards
      const dx = x - cam.x, dy = y - cam.y, sx = (dx - dy) * CFG.WT.TW / 2, sy = (dx + dy) * CFG.WT.TH / 2;
      if (Math.abs(sx) > 230 || sy < 90 || sy > 330) continue;
    }
    return [x, y];
  }
  for (let r = B.spotMin; r < 45; r += 2) for (let i = 0; i < 24; i++) {   // nothing on screen suits it: the nearest clear spot
    const x = Math.floor(clampN(px + Math.cos(i * 0.2618) * r, 1, CFG.WW - 1)) + 0.5, y = Math.floor(clampN(py + Math.sin(i * 0.2618) * r, 1, CFG.WH - 1)) + 0.5;
    if (clear(x, y)) return [x, y];
  }
  return [px + B.spotMin, py];
};

// ---------- a new Battery, a new shrine ----------
WZ.bshrAdd = function (b, announce) {
  if (!G.bshr || G.menu || !G.w || G.bshr.some(s => s.id === b.id)) return null;
  let n = 1; while (G.bshr.some(s => s.n === n)) n++;   // the smallest number not in use
  const sp = WZ.bshrSpot(announce), s = WZ.bshrMake(b.id, sp[0], sp[1], n);
  G.bshr.push(s); WZ.bshrV++;
  if (announce) WZ.bshrAnnounce(s);
  return s;
};
WZ.bshrAnnounce = function (s) {
  const w = G.w, B = CFG.bshr, col = B.col;
  w.shake = Math.max(w.shake, 0.4);
  WZ.boom(s.x, s.y, 3.2, '#ffffff'); WZ.ring(s.x, s.y, 4.5, col, 0.6); WZ.puff(s.x, s.y, col, 22); WZ.puff(s.x, s.y, '#ffffff', 10);
  w.fx_.push({ type: 'shock', x: s.x, y: s.y, r: B.ring, t: 0, dur: B.ring / B.speed, col });
  w.bsw.push({ x: s.x, y: s.y, t: 0, r: 0 });
  AU.sfx('slam', s.x, s.y); AU.sfx('shrine', s.x, s.y);
  FA.pressure(0.5, col);
  UI.toast('A Battery Shrine #' + s.n + ' has appeared! Hit it with spells to charge its Battery', 'R', 'b:battery');
  UI.toast('Battery #' + s.n + ' has a shrine in the wilds: the Wizard charges it by hitting it', 'L', 'b:battery');
  UI.changed();
};
WZ.bshrCrumble = function (s) {
  WZ.boom(s.x, s.y, 1.8, '#ffffff'); WZ.puff(s.x, s.y, '#9a9aa8', 16); WZ.puff(s.x, s.y, CFG.bshr.col, 8);
  AU.sfx('kill', s.x, s.y);
  UI.toast('Battery Shrine #' + s.n + ' crumbled: its Battery is gone', 'R', 'b:battery');
};

// ---------- damage becomes charge ----------
// d = damage done to the shrine by a player spell or wand attack (WZ.ctx set); it goes into ITS Battery, up to full
WZ.bshrHurt = function (s, d) {
  const w = G.w, B = CFG.bshr, b = WZ.bshrBat(s);
  if (!WZ.ctx || G.menu || !b || !b.done) return;
  s.flash = 0.1;
  const M = CFG.batteryMax;
  if (b.bat >= M - 0.01) {   // full: nothing to give (a check mark, now and then)
    if (w.t - s.fullAt > 1.5) { s.fullAt = w.t; WZ.icon(s.x, s.y - 1.2, 'ic_check'); }
    return;
  }
  const add = Math.min(M - b.bat, d * B.perDmg);
  b.bat += add; s.acc += add; b.plusT = CFG.boost.plusT; FA.fb('boost');
  G.stats.bshrCharge = (G.stats.bshrCharge || 0) + add;
  if (w.t - s.popAt >= B.popGap) {   // a tally floats up now and then instead of a number for every tick of a flame
    s.popAt = w.t;
    WZ.num(s.x, s.y - 0.6, '+' + Math.max(1, Math.round(s.acc)), B.col); s.acc = 0;
    WZ.puff(s.x, s.y, B.col, 3);
    FA.ipop(b.x + 0.5, b.y + 0.5, [['ic_bolt']]); b.pop = 0.3; b.plusT = CFG.boost.plusT;   // (the Battery pulses with a bouncing "+": the shrine did this)
    AU.sfx('charge');
  }
};

// ---------- every frame (WZ.update) ----------
WZ.bshrTick = function (dt) {
  const w = G.w, L = G.bshr, f = G.fac, B = CFG.bshr;
  if (!L || G.menu) return;
  for (let i = L.length - 1; i >= 0; i--) {
    const s = L[i];
    if (s.at) {   // from a save: find the Battery that stood there
      const c = FA.cell(s.at[0], s.at[1]);
      if (c && c.done && FA.def(c).kind === 'cell' && !L.some(o => o !== s && o.id === c.id)) s.id = c.id;
      delete s.at;
    }
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt);
    const b = WZ.bshrBat(s);
    if (!b || !b.done) { if (s.id != null) WZ.bshrCrumble(s); L.splice(i, 1); WZ.bshrV++; }
  }
  for (const b of f.bld) if (b.done && FA.def(b).kind === 'cell' && !L.some(s => s.id === b.id)) WZ.bshrAdd(b, false);   // the starter Battery, an old save's Batteries: no fuss
  if (w.bsw.length) {   // the shockwaves of a shrine arriving: the grass along the front is flattened and springs back
    for (const sw of w.bsw) {
      sw.t += dt; sw.r = sw.t * B.speed;
      const n = Math.max(6, Math.ceil(6.283 * sw.r / 0.9));
      for (let i = 0; i < n; i++) { const a = i / n * 6.283, ca = Math.cos(a), sa = Math.sin(a); WZ.bendAt(sw.x + ca * sw.r, sw.y + sa * sw.r, ca * 6, sa * 6, 0.7); }
    }
    w.bsw = w.bsw.filter(sw => sw.r < B.ring + 2);
  }
};
