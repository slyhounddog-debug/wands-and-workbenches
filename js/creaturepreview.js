'use strict';
// CPV: a looping scripted mini-scene for every creature in the Collection Book, in the spirit of the spell previews (SPV). Self-contained (no G.w, no real sim):
// each scene draws one loop as a pure function of its own clock, using the creature's real sprite and the real CFG numbers where numbers appear.
// The point is recognition: a player should know the creature and its threat on sight in the wild (the Wisp's dash, the Phoenix's dive and rebirth,
// the Lava Golem's trail and blast, the Titan's cracks...). A training "wizard" stands in as the target. Closed book = nothing runs (CPV.stop).
const CPV = {};
(function () {
  const BW = 240, BH = 130, OX = 120, OY = 78, TX = 10, TY = 5;
  const sx = x => Math.round(OX + x * TX), sy = y => Math.round(OY + y * TY);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
  const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);   // 0..1 across [a, b]
  const CAP = {
    zephyr: 'ERRATIC DRIFT, then a phase-dash straight through you', puddle: 'SLOW: bursts into a slowing splash zone when it dies',
    cinder: 'KITES AT RANGE: backs off and spits ember bolts', pebble: 'ARMORED: x0.55 from anything but its weakness, never knocked back',
    phoenix: 'FLASHES, then dives. Reborn once at 30% HP', thunderhead: 'HOVERS: marks you, then a chain zap',
    lavagolem: 'MAGMA TRAIL, and a telegraphed blast when it dies', shambler: 'MUD SNARES across your path; heals in bog',
    dragon: 'FLAME-BREATH FAN, then a wing gust that shoves you', leviathan: 'CHAIN ZAPS, then a steam-burst dive',
    titan: 'ARMOR CRACKS at 75 / 50 / 25%: each one vents steam',
  };
  CPV.caption = id => CAP[id] || '';

  // ---- shared drawing (buffer pixels; the canvas is blown up with nearest-neighbour) ----
  let ground = null;
  function mkGround() {
    const c = document.createElement('canvas'); c.width = BW; c.height = BH;
    const x = c.getContext('2d');
    x.fillStyle = '#2e6a3a'; x.fillRect(0, 0, BW, BH);
    let r = 11;
    for (let i = 0; i < 140; i++) {
      r = (r * 1103515245 + 12345) & 0x7fffffff;
      x.fillStyle = i % 3 ? '#265a31' : '#3a7c45';
      x.fillRect(r % BW, (r >> 8) % BH, 2, 1);
    }
    return c;
  }
  function ell(x, cx, cy, rx, ry, c, a) { x.globalAlpha = a; x.fillStyle = c; x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, 6.283); x.fill(); x.globalAlpha = 1; }
  function dots(x, wx, wy, r, c, a, skip, spin) {   // a pixel-stepped ring on the ground (tile radius r)
    const cx = sx(wx), cy = sy(wy), rx = r * TX, ry = r * TY, n = Math.max(24, Math.round(rx * 1.5));
    x.globalAlpha = a; x.fillStyle = c;
    for (let i = 0; i < n; i++) { if (skip && i % 2) continue; const an = (i / n) * 6.283 + (spin || 0); x.fillRect(Math.round(cx + Math.cos(an) * rx), Math.round(cy + Math.sin(an) * ry), 2, 2); }
    x.globalAlpha = 1;
  }
  function spr(x, key, px, py, o) {
    const s = SP[key]; if (!s) return;
    o = o || {};
    x.globalAlpha = o.a === undefined ? 1 : o.a;
    x.save(); x.translate(Math.round(px), Math.round(py));
    if (o.flip) x.scale(-1, 1);
    x.scale((o.sx || 1) * (o.s || 1), (o.sy || 1) * (o.s || 1));
    x.drawImage(o.white ? s.white : s.c, -s.ax, -s.ay);
    x.restore(); x.globalAlpha = 1;
  }
  function bolt(x, x0, y0, x1, y1, c, seed) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let w = 0; w < 2; w++) for (let i = 0; i <= n; i++) {
      const k = i / n, j = Math.sin(k * 14 + seed) * 4 * Math.sin(k * Math.PI);
      x.fillStyle = w ? '#fff' : c;
      x.fillRect(Math.round(x0 + (x1 - x0) * k + j * 0.4), Math.round(y0 + (y1 - y0) * k + j), w ? 1 : 3, w ? 1 : 3);
    }
  }
  function hp(x, px, py, f, w, notches) {
    x.fillStyle = '#2a0a0a'; x.fillRect(px - w / 2, py, w, 3);
    x.fillStyle = f > 0.5 ? '#46e0c8' : f > 0.25 ? '#e0c040' : '#e05050'; x.fillRect(px - w / 2 + 1, py + 1, Math.max(0, Math.round((w - 2) * f)), 1);
    if (notches) { x.fillStyle = '#ffffff'; for (const n of notches) x.fillRect(Math.round(px - w / 2 + 1 + (w - 2) * n), py - 1, 1, 5); }
  }
  // the scene's toolkit, bound to this frame
  function kit(x, u) {
    const g = { x, u, pops: [] };
    g.shadow = (wx, wy, w) => ell(x, sx(wx), sy(wy), w || 6, (w || 6) * 0.42, '#000', 0.3);
    g.wiz = (wx, wy, o) => {
      o = o || {};
      g.shadow(wx, wy);
      if (o.slow) dots(x, wx, wy, 0.9, '#9fe4ff', 0.9);
      spr(x, 'wizard', sx(wx), sy(wy), { white: o.flash > 0, flip: o.flip });
    };
    g.crt = (id, wx, wy, o) => {
      o = o || {};
      g.shadow(wx, wy, o.sh || 7);
      spr(x, id, sx(wx), sy(wy) - (o.z || 0), o);
    };
    g.pop = (wx, wy, txt, t0, col) => { const k = (u - t0) / 0.8; if (k >= 0 && k < 1) g.pops.push({ x: sx(wx), y: sy(wy) - 24 - k * 14, txt, a: 1 - k, col: col || '#ffe36b' }); };
    g.flash = (t0, len) => (u >= t0 && u < t0 + (len || 0.18) ? 1 : 0);
    g.shot = (x0, y0, x1, y1, t0, dur, col, size) => {   // a small projectile in flight between two tile spots
      const k = (u - t0) / dur; if (k < 0 || k > 1) return;
      const px = lerp(sx(x0), sx(x1), k), py = lerp(sy(y0), sy(y1), k) - 8;
      for (let i = 3; i >= 0; i--) { x.globalAlpha = 0.5 - i * 0.1; x.fillStyle = col; x.fillRect(Math.round(px - (sx(x1) - sx(x0)) * 0.03 * i) - 1, Math.round(py - (sy(y1) - sy(y0)) * 0.03 * i) - 1, size, size); }
      x.globalAlpha = 1; x.fillStyle = col; x.fillRect(Math.round(px) - 1, Math.round(py) - 1, size, size);
    };
    g.burst = (wx, wy, r, col, t0, dur, ringOnly) => {   // an expanding ring (and a wash) at t0
      const k = (u - t0) / dur; if (k < 0 || k > 1) return;
      if (!ringOnly) ell(x, sx(wx), sy(wy), r * TX * k, r * TY * k, col, 0.4 * (1 - k));
      dots(x, wx, wy, r * k, col, 1 - k * 0.6);
    };
    g.tele = (wx, wy, r, t0, t1, col) => {   // a flashing warning ring that closes in before something lands
      if (u < t0 || u > t1) return;
      const k = (u - t0) / (t1 - t0);
      ell(x, sx(wx), sy(wy), r * TX, r * TY, col || '#ff4a3a', 0.12 + (Math.sin(u * 20) > 0 ? 0.12 : 0));
      dots(x, wx, wy, r * (1 - k * 0.25), col || '#ff4a3a', 1, k < 0.6, 0);
    };
    return g;
  }

  // ---- the scenes: len = loop length (s), f(g, u) draws one frame ----
  const SC = {
    zephyr: { len: 5.2, f(g, u) {
      let cx = 3.6 + Math.sin(u * 1.6) * 1.5, cy = -1.6 + Math.sin(u * 2.6 + 1) * 1.1, a = 1, flick = u > 2.0 && u < 2.6 && Math.floor(u * 14) % 2;
      const trail = [];
      if (u >= 2.6 && u < 3.0) {   // the phase-dash: it blurs and shoots straight through the Wizard
        const k = (u - 2.6) / 0.4;
        cx = lerp(5, -4.5, k); cy = lerp(-1.4, 1.2, k); a = 0.55;
        for (let i = 1; i <= 3; i++) { const kk = k - i * 0.08; trail.push([lerp(5, -4.5, kk), lerp(-1.4, 1.2, kk), 0.35 - i * 0.08]); }
      } else if (u >= 3.0) { const k = seg(u, 3.0, 4.6); cx = lerp(-4.5, 3.6 + Math.sin(4.6 * 1.6) * 1.5, k); cy = lerp(1.2, -1.6 + Math.sin(4.6 * 2.6 + 1) * 1.1, k); }
      g.wiz(0, 0, { flash: g.flash(2.78) });
      trail.forEach(t => spr(g.x, 'zephyr', sx(t[0]), sy(t[1]) - 12, { a: Math.max(0.05, t[2]) }));
      g.crt('zephyr', cx, cy, { z: 12 + Math.sin(u * 8) * 2, a, white: flick });
      g.pop(0, 0, '-' + Math.round(CFG.creatures.zephyr.dmg), 2.78);
    } },
    puddle: { len: 6, f(g, u) {
      const cx = lerp(5.4, 1.8, seg(u, 0, 3.0)), dead = u >= 3.25;
      const slowed = u > 3.9 && u < 5.5;
      const wx = slowed ? lerp(0, 1.2, seg(u, 3.9, 5.5)) : 0;
      if (dead && u < 5.8) { const k = seg(u, 3.25, 5.8); ell(g.x, sx(1.8), sy(0), 2.3 * TX, 2.3 * TY, '#4aa8ff', 0.34 * (1 - Math.max(0, k - 0.75) * 4)); dots(g.x, 1.8, 0, 2.3, '#9fe4ff', 0.8, true, u); }
      g.wiz(wx, 0, { slow: slowed });
      g.shot(0, 0, 1.8, 0, 3.0, 0.25, '#ffffff', 4);
      if (!dead) { const sq = 1 + Math.sin(u * 5) * 0.07; g.crt('puddle', cx, 0, { sy: sq, sx: 2 - sq, white: g.flash(3.0, 0.2) > 0 }); hp(g.x, sx(cx), sy(0) - 20, 1, 14); }
      else if (u < 3.6) g.burst(1.8, 0, 1.6, '#4aa8ff', 3.25, 0.35);
      g.pop(1.8, 0, '-' + 12, 3.25);
    } },
    cinder: { len: 5, f(g, u) {
      const wx = lerp(-2, 0.4, seg(u, 0, 4.4)), ix = wx + 5.2, iy = Math.sin(u * 1.7) * 1.4;
      g.wiz(wx, 0, { flash: g.flash(0.6 + 0.5) || g.flash(1.9 + 0.5) || g.flash(3.2 + 0.5) || g.flash(4.5 + 0.5) });
      g.crt('cinder', ix, iy, { z: 0 });
      for (const t0 of [0.6, 1.9, 3.2, 4.5]) { g.shot(ix, iy, wx, 0, t0, 0.5, '#ff7a30', 5); g.pop(wx, 0, '-' + Math.round(CFG.creatures.cinder.dmg), t0 + 0.5); }
    } },
    pebble: { len: 6.4, f(g, u) {
      const cx = lerp(5.6, 1.5, seg(u, 0, 4.8));
      const w1 = g.flash(1.2, 0.2) || g.flash(2.6, 0.2), weak = u >= 4.4 && u < 4.9;
      g.wiz(0, 0, { flash: 0 });
      const sh = (u > 1.2 && u < 1.5) || (u > 2.6 && u < 2.9) ? 1 : 0;
      g.crt('pebble', cx, 0, { white: weak && Math.floor(u * 16) % 2 });
      if (sh) dots(g.x, cx, 0, 1.0, '#c0c8d0', 1, true, u * 4);   // the armor shrugging the hit off
      g.shot(0, 0, cx, 0, 1.2 - 0.25, 0.25, '#b0b8c0', 4); g.shot(0, 0, cx, 0, 2.6 - 0.25, 0.25, '#b0b8c0', 4);
      g.pop(cx, 0, 'x0.55', 1.2); g.pop(cx, 0, 'x0.55', 2.6);
      g.burst(0, 0, 3.2, '#e6f8ff', 4.4, 0.5, true); if (weak) { g.pop(cx, 0, 'x2', 4.5, '#ffffff'); }
      if (u > 3.6 && u < 4.2) { g.x.fillStyle = '#fff'; g.x.fillRect(sx(cx) + 8, sy(0) - 12, 1, 1); }
      hp(g.x, sx(cx), sy(0) - 30, u < 4.5 ? 1 : 0.6, 18);
      g.x.globalAlpha = 1;
    } },
    phoenix: { len: 7, f(g, u) {
      const orb = (t) => [3.4 + Math.cos(t * 1.3) * 1.8, -1.8 + Math.sin(t * 1.3) * 0.9];
      let [cx, cy] = orb(u), z = 16, white = 0, a = 1, trail = null;
      if (u >= 1.6 && u < 2.6) { white = Math.floor(u * 16) % 2; }
      if (u >= 2.6 && u < 3.2) { const k = (u - 2.6) / 0.6, o = orb(2.6); cx = lerp(o[0], 0, k); cy = lerp(o[1], 0, k); z = lerp(16, 2, k); trail = [o[0], o[1]]; }
      else if (u >= 3.2 && u < 4.4) { const k = seg(u, 3.2, 4.4), o = orb(4.4); cx = lerp(0, o[0], k); cy = lerp(0, o[1], k); z = lerp(2, 16, k); }
      let frac = 1, show = true;
      if (u >= 4.5) frac = 0.3;
      if (u >= 4.5 && u < 5.2) { a = Math.max(0, 1 - (u - 4.5) / 0.6); frac = 0; }
      if (u >= 5.2) { const o = orb(u); cx = o[0]; cy = o[1]; a = 1; frac = 0.3; }
      g.wiz(0, 0, { flash: g.flash(3.15) });
      if (trail) for (let i = 1; i <= 4; i++) { const k = ((u - 2.6) / 0.6) - i * 0.12; if (k > 0) spr(g.x, 'phoenix', sx(lerp(trail[0], 0, k)), sy(lerp(trail[1], 0, k)) - lerp(16, 2, k), { a: 0.4 - i * 0.08 }); }
      if (u >= 5.2 && u < 5.9) { g.burst(cx, cy, 2.4, '#ff9a2b', 5.2, 0.7); ell(g.x, sx(cx), sy(cy) - 14, 18 * (1 - (u - 5.2) / 0.7), 14 * (1 - (u - 5.2) / 0.7), '#ffe36b', 0.45); }
      g.crt('phoenix', cx, cy, { z, a, white: white || (u >= 4.5 && u < 4.65), sh: 8 });
      if (a > 0.1) hp(g.x, sx(cx), sy(cy) - z - 22, frac || 0.05, 16);
      g.shot(0, 0, orb(4.4)[0], orb(4.4)[1], 4.2, 0.3, '#ffffff', 4);
      g.pop(0, 0, '-' + Math.round(CFG.creatures.phoenix.dmg), 3.15); g.pop(cx, cy, 'REBORN', 5.3, '#ffd23a');
    } },
    thunderhead: { len: 5.6, f(g, u) {
      const cx = 3.6, cy = -1.5 + Math.sin(u * 1.4) * 0.5, z = 24 + Math.sin(u * 3) * 2;
      const marks = [[-2.6, 1.2], [-3.6, -1.4]];
      const tgt = u < 3.2 ? [0, 0] : [-0.6, 0.6];
      g.wiz(tgt[0], tgt[1], { flash: g.flash(2.3) || g.flash(4.5) });
      for (const m of marks) { g.shadow(m[0], m[1]); spr(g.x, 'slime', sx(m[0]), sy(m[1]), { a: 0.9 }); }
      g.crt('thunderhead', cx, cy, { z, white: (u > 2.0 && u < 2.3) || (u > 4.2 && u < 4.5) });
      g.tele(tgt[0], tgt[1], 1.2, 1.2, 2.2, '#ffe36b'); g.tele(-0.6, 0.6, 1.2, 3.4, 4.4, '#ffe36b');
      for (const t0 of [2.2, 4.4]) if (u >= t0 && u < t0 + 0.5) {
        const k = (u - t0) / 0.5, tp = u < 3.2 ? [0, 0] : [-0.6, 0.6];
        bolt(g.x, sx(cx), sy(cy) - z, sx(tp[0]), sy(tp[1]) - 8, '#ffe36b', t0 * 9);
        if (k > 0.3) bolt(g.x, sx(tp[0]), sy(tp[1]) - 8, sx(marks[0][0]), sy(marks[0][1]) - 6, '#ffe36b', t0 * 9 + 3);
        if (k > 0.6) bolt(g.x, sx(marks[0][0]), sy(marks[0][1]) - 6, sx(marks[1][0]), sy(marks[1][1]) - 6, '#ffe36b', t0 * 9 + 5);
      }
      g.pop(tgt[0], tgt[1], '-' + CFG.creatures.thunderhead.dmg, 2.3); g.pop(-0.6, 0.6, '-' + CFG.creatures.thunderhead.dmg, 4.5);
    } },
    lavagolem: { len: 8, f(g, u) {
      const walk = seg(u, 0, 5), cx = lerp(5.2, 1.0, walk), dead = u >= 5.0;
      // the magma trail: a pool left every half tile, fading after a few seconds
      for (let i = 0; i < 9; i++) {
        const px = 5.2 - i * 0.5, born = (5.2 - px) / 4.2 * 5;
        if (u < born || (px < cx - 0.2 && !dead && false)) continue;
        if (px < cx - 0.1 || dead) { const age = u - born; if (age < 3.2) { ell(g.x, sx(px), sy(0), 0.8 * TX, 0.8 * TY, '#ff5a1a', 0.45 * Math.min(1, (3.2 - age) / 1)); ell(g.x, sx(px), sy(0), 0.4 * TX, 0.4 * TY, '#ffd23a', 0.35 * Math.min(1, (3.2 - age) / 1)); } }
      }
      g.wiz(-0.8, 0, { flash: g.flash(6.05) });
      g.shot(-0.8, 0, 1.0, 0, 4.7, 0.3, '#ffffff', 4);
      if (!dead || u < 6.0) g.crt('lavagolem', cx, 0, { white: (dead && u < 5.2) || (u > 5.6 && Math.floor(u * 14) % 2), a: 1 });
      g.tele(1.0, 0, 3, 5.0, 6.0, '#ff4a3a'); g.burst(1.0, 0, 3.2, '#ff7a30', 6.0, 0.6);
      if (u < 4.6 || u >= 5.0) hp(g.x, sx(cx), sy(0) - 38, dead ? 0.05 : 1 - seg(u, 4.7, 5.0), 20);
      g.pop(-0.8, 0, '-' + CFG.creatures.lavagolem.dmg, 6.05);
    } },
    shambler: { len: 7.5, f(g, u) {
      // he walks at 1.8 tiles/s, 0.7 while he is in the mud
      const wx = u < 0.3 ? -4 : u < 1.74 ? -4 + (u - 0.3) * 1.8 : u < 4.6 ? -1.4 + (u - 1.74) * 0.7 : Math.min(3.4, 0.6 + (u - 4.6) * 1.8);
      const inMud = u > 2.2 && u < 5.9 && wx > -1.4 && wx < 0.6;
      ell(g.x, sx(3.6), sy(-1), 3 * TX, 1.6 * TY, '#3a4a22', 0.55);   // the bog it stands in
      if (u > 1.0 && u < 6.4) { const k = u < 1.8 ? 1 : 1 - seg(u, 5.9, 6.4); ell(g.x, sx(-0.4), sy(0), 1.0 * TX * 1.6, 1.0 * TY * 1.6, '#7a5a2a', 0.5 * (u < 1.8 ? seg(u, 1.0, 1.8) : k)); dots(g.x, -0.4, 0, 1.6, '#a07a3a', 0.8 * (u < 1.8 ? seg(u, 1.0, 1.8) : k), true, u); }
      g.tele(-0.4, 0, 1.6, 0.4, 1.0, '#a07a3a');
      g.wiz(wx, 0, { slow: inMud });
      const frac = 0.4 + 0.5 * seg(u, 0.4, 5.5);
      g.crt('shambler', 3.6, -1, {});
      hp(g.x, sx(3.6), sy(-1) - 30, frac, 18);
      g.x.fillStyle = '#7aff9a';
      for (let i = 0; i < 4; i++) { const k = ((u * 0.8 + i / 4) % 1); g.x.globalAlpha = 1 - k; g.x.fillRect(sx(3.6) - 12 + i * 8, Math.round(sy(-1) - 8 - k * 18), 2, 2); g.x.fillRect(sx(3.6) - 13 + i * 8, Math.round(sy(-1) - 7 - k * 18), 4, 1); }
      g.x.globalAlpha = 1;
    } },
    dragon: { len: 7, f(g, u) {
      const dx = 4.6, dy = -0.6, z = 16, flap = u > 3.8 && u < 4.4;
      const push = u < 4.0 ? 0 : u < 4.6 ? seg(u, 4.0, 4.6) * 2.4 : 2.4 - seg(u, 4.6, 6.2) * 2.4;
      g.wiz(-push, 0, { flash: g.flash(2.3) || g.flash(4.05) });
      // the telegraphed fan, then the flames in it
      const ang0 = Math.atan2(0 - dy, -(dx));   // from the dragon toward the Wizard (tile space)
      const cone = (len, a) => {
        const ox = sx(dx), oy = sy(dy) - 4;
        g.x.fillStyle = a; g.x.beginPath(); g.x.moveTo(ox, oy);
        for (const s of [-0.5, 0.5]) { const an = ang0 + s; g.x.lineTo(ox + Math.cos(an) * len * TX, oy + Math.sin(an) * len * TY); }
        g.x.closePath(); g.x.fill();
      };
      if (u >= 1.0 && u < 2.0) cone(5.6, Math.sin(u * 20) > 0 ? 'rgba(255,74,58,0.35)' : 'rgba(255,74,58,0.18)');
      if (u >= 2.0 && u < 2.9) {
        cone(5.6, 'rgba(255,154,43,0.22)');
        for (let i = 0; i < 26; i++) {
          const k = ((u * 2.2 + i * 0.137) % 1), an = ang0 + (((i * 0.61) % 1) - 0.5) * 0.9, r = k * 5.6;
          g.x.fillStyle = i % 3 ? '#ff7a30' : i % 2 ? '#ffd23a' : '#ff3a1a';
          const s = 3 + Math.round((1 - k) * 3);
          g.x.fillRect(Math.round(sx(dx) + Math.cos(an) * r * TX), Math.round(sy(dy) - 4 + Math.sin(an) * r * TY - 6 * k), s, s);
        }
      }
      if (flap) { g.burst(dx, dy, 5, '#ffffff', 3.8, 0.6, true); g.burst(dx, dy, 4, '#ffffff', 3.95, 0.6, true); }
      g.crt('dragon', dx, dy, { z: z + (flap ? Math.sin(u * 30) * 3 : Math.sin(u * 3) * 2), sy: flap ? 1.08 : 1, sh: 10 });
      g.pop(-push, 0, '-' + CFG.creatures.dragon.dmg, 2.3); g.pop(-push, 0, 'PUSH', 4.1, '#ffffff');
    } },
    leviathan: { len: 6.6, f(g, u) {
      const orb = t => [2.6 + Math.cos(t * 2.2) * 3, -1.2 + Math.sin(t * 2.2) * 1.6];
      let [cx, cy] = orb(u), z = 18, white = 0;
      const marks = [[-2.6, 1.6], [2.6, 2.4]];
      if (u >= 3.6 && u < 4.4) { const k = (u - 3.6) / 0.8, o = orb(3.6); cx = lerp(o[0], 0.6, k); cy = lerp(o[1], 0, k); z = lerp(18, 0, k * k); }
      else if (u >= 4.4 && u < 5.6) { const k = seg(u, 4.4, 5.6), o = orb(5.6); cx = lerp(0.6, o[0], k); cy = lerp(0, o[1], k); z = lerp(0, 18, k); }
      g.wiz(0, 0, { flash: g.flash(2.1) || g.flash(4.42) });
      for (const m of marks) { g.shadow(m[0], m[1]); spr(g.x, 'slime', sx(m[0]), sy(m[1]), { a: 0.9 }); }
      g.crt('leviathan', cx, cy, { z, sh: 9, flip: Math.cos(u * 2.2) > 0 });
      if (u >= 2.0 && u < 2.7) {
        const k = (u - 2.0) / 0.7, o = orb(2.0);
        bolt(g.x, sx(o[0]), sy(o[1]) - 18, sx(0), sy(0) - 8, '#9fe4ff', 7);
        if (k > 0.3) bolt(g.x, sx(0), sy(0) - 8, sx(marks[0][0]), sy(marks[0][1]) - 6, '#9fe4ff', 11);
        if (k > 0.6) bolt(g.x, sx(marks[0][0]), sy(marks[0][1]) - 6, sx(marks[1][0]), sy(marks[1][1]) - 6, '#9fe4ff', 13);
      }
      g.burst(0.6, 0, 3.2, '#f4f4f8', 4.4, 0.8);
      for (let i = 0; i < 8; i++) { const k = (u - 4.4) / 0.8; if (k > 0 && k < 1) { g.x.globalAlpha = 1 - k; g.x.fillStyle = '#f4f4f8'; g.x.fillRect(sx(0.6) + Math.round(Math.cos(i * 0.785) * 30 * k), sy(0) - Math.round(6 + k * 14) + Math.round(Math.sin(i * 0.785) * 8 * k), 4, 4); g.x.globalAlpha = 1; } }
      g.pop(0, 0, '-' + CFG.creatures.leviathan.dmg, 2.1); g.pop(0, 0, '-' + CFG.creatures.leviathan.dmg, 4.42);
    } },
    titan: { len: 9.5, f(g, u) {
      const cx = 3.2, marks = [0.75, 0.5, 0.25], ts = [1.4, 3.8, 6.2];
      const frac = u < ts[0] ? 1 - 0.25 * seg(u, 0.4, ts[0]) : u < ts[1] ? 0.75 - 0.25 * seg(u, ts[0] + 0.3, ts[1]) : u < ts[2] ? 0.5 - 0.25 * seg(u, ts[1] + 0.3, ts[2]) : 0.25 - 0.05 * seg(u, ts[2] + 0.3, 8.5);
      const cracks = ts.filter(t => u >= t).length;
      g.wiz(0, 0, { flash: ts.some(t => g.flash(t + 0.9)) });
      g.crt('titan', cx, 0, { white: ts.some(t => u >= t && u < t + 0.15), sh: 12 });
      const top = sy(0) - (SP.titan ? SP.titan.c.height : 30);
      g.x.fillStyle = '#2a1410';
      for (let i = 0; i < cracks; i++) { const bx = sx(cx) - 10 + i * 9; for (let j = 0; j < 10; j++) g.x.fillRect(bx + (j % 3 === 1 ? 1 : 0) + (i % 2 ? 1 : 0), top + 6 + j * 2 + i * 3, 1, 2); }
      hp(g.x, sx(cx), top - 6, frac, 26, marks);
      ts.forEach((t0, i) => {
        g.shot(0, 0, cx, 0, t0 - 0.3, 0.3, '#ffffff', 4);
        g.tele(cx, 0, 2.8, t0 + 0.1, t0 + 0.9, '#ff4a3a'); g.burst(cx, 0, 3, '#f4f4f8', t0 + 0.9, 0.7);
        if (u >= t0 + 0.9 && u < t0 + 1.6) for (let k = 0; k < 8; k++) { const kk = (u - t0 - 0.9) / 0.7; g.x.globalAlpha = 1 - kk; g.x.fillStyle = '#f4f4f8'; g.x.fillRect(sx(cx) + Math.round(Math.cos(k * 0.785) * 36 * kk), sy(0) - Math.round(4 + kk * 16) + Math.round(Math.sin(k * 0.785) * 10 * kk), 4, 4); g.x.globalAlpha = 1; }
        g.pop(0, 0, '-' + CFG.creatures.titan.dmg, t0 + 1.0);
      });
    } },
  };
  CPV.ids = Object.keys(SC);

  function draw(id, u, x) {
    x.imageSmoothingEnabled = false;
    if (!ground) ground = mkGround();
    x.drawImage(ground, 0, 0);
    const g = kit(x, u);
    SC[id].f(g, u);
    x.font = '8px DigitsB, monospace'; x.textAlign = 'center';
    g.pops.forEach(p => { x.globalAlpha = p.a; x.fillStyle = '#000'; x.fillText(p.txt, p.x + 1, p.y + 1); x.fillStyle = p.col; x.fillText(p.txt, p.x, p.y); });
    x.globalAlpha = 1;
  }

  // ---- lifecycle: one running demo at a time (the open book) ----
  let run = null;
  CPV.stop = function () { if (run) run.dead = true; run = null; };
  CPV.mount = function (canvas, id) {
    CPV.stop();
    if (!SC[id]) return;
    const x = canvas.getContext('2d'), me = run = { dead: false }, t0 = performance.now();
    const frame = now => {
      if (me.dead || !canvas.isConnected) return;
      draw(id, ((now - t0) / 1000) % SC[id].len, x);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  // test hook: draw the scene at time t (headless screenshots)
  CPV.snap = (canvas, id, t) => draw(id, t % SC[id].len, canvas.getContext('2d'));
  CPV.len = id => SC[id] ? SC[id].len : 0;
  CPV.W = BW; CPV.H = BH;
})();
