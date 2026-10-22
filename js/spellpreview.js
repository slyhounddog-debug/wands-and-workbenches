'use strict';
// SPV: a looping mini-simulation of each spell for the skill-tree hover card. Self-contained (no G.w): training dummies
// stand in a little clearing and the spell is cast with the real numbers from CFG.spells, so aoe / chains / cones read at a glance.
const SPV = {};
(function () {
  const TX = 9, TY = 4.5, OX = 93, OY = 62, BW = 186, BH = 100, HP = 100, CAST = 0.5;
  const BASIC_NODE = { air: 'gust', water: 'spray', fire: 'fireball', earth: 'boulder' };
  const CAP = {
    gust: 'AREA BURST: pushes everything around you', fireball: 'ONE SHOT: direct hit plus a small splash',
    spray: 'CONE: five droplets in a fan', boulder: 'ONE SHOT: slow, big splash',
    flamethrower: 'CONE: eight flames in a fan', steam: 'AREA BURST: damages and slows the circle',
    sandstorm: 'FOLLOWING ZONE: sticks to you, ticks and slows', magma: 'ONE SHOT: huge splash',
    tempest: 'CHAIN: hops to the nearest foes, slows near you', mud: 'TARGET ZONE: drops on the nearest foe',
    meteor: 'BARRAGE: random foes get hit by meteors', thunder: 'CHAIN: hops through up to 10 foes',
    blizzard: 'FOLLOWING ZONE: wide, ticks and slows', geyser: 'TARGETED: erupts under the 6 nearest foes',
    nova: 'HUGE AREA BURST: damages, pushes and slows',
  };
  const col = k => SPELL_COL[k] || '#fff';

  // ---- scenes: wizard spot, dummies, the cast, and how long the loop runs (tiles; x right, y down) ----
  const proj = (s, S, o) => s.proj(Object.assign({ vx: S.speed, vy: 0, life: S.life, dmg: S.dmg }, o));
  const cone = (s, S, o) => {
    for (let i = 0; i < S.n; i++) {
      const a = (i / (S.n - 1) - 0.5) * S.spread;
      s.proj(Object.assign({ vx: Math.cos(a) * S.speed, vy: Math.sin(a) * S.speed, life: S.life, dmg: S.dmg, r: 0.55 }, o));
    }
  };
  const burst = (s, S, c, dur, boom) => {
    s.ring(s.W.x, s.W.y, S.r, c, dur);
    if (boom) s.boom(s.W.x, s.W.y, S.r, c);
    s.each(s.W.x, s.W.y, S.r, (e, d) => {
      const m = d || 1;
      s.hurt(e, S.dmg, S.push ? (e.x - s.W.x) / m : 0, S.push ? (e.y - s.W.y) / m : 0, S.push);
      if (S.slow) e.slowT = S.slowT;
    });
  };
  const chain = (s, S, c) => {
    const pts = [[s.W.x, s.W.y]], hit = [];
    let px = s.W.x, py = s.W.y;
    for (let i = 0; i < S.n; i++) {
      const e = s.nearest(px, py, S.range, hit);
      if (!e) break;
      hit.push(e); pts.push([e.x, e.y]); px = e.x; py = e.y;
      s.later(i * 0.12 + 0.08, () => s.hurt(e, S.dmg, 0, 0, 0, true));
    }
    s.fx.push({ type: 'bolt', pts, gap: 0.12, t: 0, dur: hit.length * 0.12 + 0.4, col: c });
  };
  const walk = (s, vx, secs) => { s.W.vx = vx; s.later(secs, () => { s.W.vx = 0; }); };
  const SC = {
    gust: { len: 2.8, W: [0, 0], en: [[-4, 1], [3, -2], [2, 3], [-1, -4], [5, 2], [9, -1]],
      cast: (s, S) => burst(s, S, col('gust'), 0.45) },
    steam: { len: 3.4, W: [0, 0], en: [[-3, 2], [3, -1], [1, 4], [-4, -2], [4, 3], [8, 0]],
      cast: (s, S) => burst(s, S, col('steam'), 0.5) },
    nova: { len: 3.4, W: [0, 0], en: [[-6, 1], [5, -3], [2, 6], [-3, -5], [7, 3], [-1, 2], [9.4, -1]],
      cast: (s, S) => burst(s, S, col('nova'), 0.6, true) },
    fireball: { len: 3.6, W: [-8.5, 0], en: [[3, 0], [2.6, -1.3], [2.4, 1.5], [4.8, 0.2]],
      cast: (s, S) => proj(s, S, { splash: S.splash, sr: S.sr, col: '#ff7a30', kind: 'fire', size: 7, r: 0.6 }) },
    boulder: { len: 4.4, W: [-8.5, 0], en: [[3, 0], [2.4, -1.6], [2.8, 1.7], [5.8, 0]],
      cast: (s, S) => proj(s, S, { splash: S.splash, sr: S.sr, col: '#8a6a3c', kind: 'rock', size: 9, r: 0.75 }) },
    magma: { len: 3.9, W: [-8.5, 0], en: [[3, 0], [1.5, -2.2], [2, 2.3], [4.5, -1.2], [7.5, 0]],
      cast: (s, S) => proj(s, S, { splash: S.splash, sr: S.sr, col: '#ff4a1a', kind: 'magma', size: 8, r: 0.7 }) },
    spray: { len: 3, W: [-8.5, 0], en: [[-3, -1], [-3, 1.2], [-1.8, 0.1], [-2, 5]],
      cast: (s, S) => { s.heal(S.heal); cone(s, S, { col: '#4aa8ff', size: 4, slow: S.slow, slowT: S.slowT }); } },
    flamethrower: { len: 3, W: [-8.5, 0], en: [[-3.5, -1.2], [-3.5, 1.2], [-2.3, 0], [-3, 5]],
      cast: (s, S) => cone(s, S, { col: '#ff9a2b', size: 6 }) },
    sandstorm: { len: 5.2, W: [-4, 0], en: [[-1, -2.5], [2, 2.5], [4, -1], [-3, 3.5], [7, 1]],
      cast: (s, S) => { s.zone({ r: S.r, t: S.t, dps: S.dps, slow: S.slow, follow: true, col: col('sandstorm'), kind: 'sand' }); walk(s, 2, S.t); } },
    blizzard: { len: 5.6, W: [-4, 0], en: [[-2, -3], [1, 2.5], [4, -1.5], [6, 3], [-5, 3], [9, -2]],
      cast: (s, S) => { s.zone({ r: S.r, t: S.t, dps: S.dps, slow: S.slow, follow: true, col: col('blizzard'), kind: 'snow' }); walk(s, 2, S.t); } },
    mud: { len: 4.8, W: [-8.5, 0], en: [[0, 0], [1.6, -2], [-0.8, 2.3], [5.5, 0]],
      cast: (s, S) => { const e = s.nearest(s.W.x, s.W.y, S.range); if (e) s.zone({ x: e.x, y: e.y, r: S.r, t: S.t, dps: S.dps, slow: S.slow, col: col('mud'), kind: 'mud' }); } },
    tempest: { len: 3.4, W: [-8.5, 0], en: [[-6, 1.5], [-2.5, -3], [0.5, 2], [3.5, -2], [6.5, 2], [9, -3]],
      cast: (s, S) => { s.ring(s.W.x, s.W.y, S.slowR, '#bfe9ff', 0.5); s.each(s.W.x, s.W.y, S.slowR, e => { e.slowT = S.slowT; }); chain(s, S, '#bfe9ff'); } },
    thunder: { len: 4.2, W: [-8.5, 0], en: [[-5.5, -1], [-4, 2.5], [-2.2, -2.5], [-0.8, 1.5], [0.8, -3], [2.4, 2], [4, -1.5], [5.6, 3], [7, -2.5], [8.4, 1], [9.2, 4]],
      cast: (s, S) => chain(s, S, '#fff27a') },
    meteor: { len: 4.6, W: [-6, 0], en: [[-3, -2.5], [0, 2], [3, -2], [6, 2], [1, -5]],
      cast: (s, S) => {
        for (let i = 0; i < S.n; i++) s.later(i * S.gap, () => {
          const alive = s.en.filter(e => !e.dead), e = alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
          const x = e ? e.x : s.W.x + 1 + Math.random() * 12, y = e ? e.y : (Math.random() - 0.5) * 9;
          s.fx.push({ type: 'meteor', x, y, t: 0, dur: S.fall, r: S.r });
          s.later(S.fall, () => { s.explode(x, y, S.r, S.dmg, '#ff7a30'); });
        });
      } },
    geyser: { len: 3.8, W: [-6, 0], en: [[-1, -2], [-0.2, -1.2], [3, 2], [3.8, 2.8], [1, 4.5], [5, -3], [9, 0]],
      cast: (s, S) => {
        s.en.filter(e => !e.dead).sort((a, b) => Math.hypot(a.x - s.W.x, a.y - s.W.y) - Math.hypot(b.x - s.W.x, b.y - s.W.y)).slice(0, S.n).forEach((e, i) => {
          const x = e.x, y = e.y, at = S.delay + i * S.gap;
          s.fx.push({ type: 'warn', x, y, r: S.r, t: 0, dur: at, col: '#4aa8ff' });
          s.later(at, () => { s.fx.push({ type: 'column', x, y, r: S.r, t: 0, dur: 0.5 }); s.explode(x, y, S.r, S.dmg, '#7ad0ff'); });
        });
      } },
  };
  SPV.spellFor = id => BASIC_NODE[id] || (typeof ITEMS !== 'undefined' && ITEMS[id] && ITEMS[id].spell && SC[id] ? id : null);
  SPV.caption = id => CAP[id] || '';

  // ---- the sim ----
  function make(id) {
    const sc = SC[id], s = {
      id, t: 0, cast: false, W: { x: sc.W[0], y: sc.W[1], vx: 0, flash: 0 }, en: [], pj: [], fx: [], zn: [], tm: [], pops: [],
    };
    sc.en.forEach((p, i) => s.en.push({ x: p[0], y: p[1], hp: HP, flash: 0, slowT: 0, kx: 0, ky: 0, dead: false, fade: 1, i }));
    s.later = (t, fn) => s.tm.push({ t, fn });
    s.ring = (x, y, r, c, dur) => s.fx.push({ type: 'ring', x, y, r, t: 0, dur, col: c });
    s.boom = (x, y, r, c) => s.fx.push({ type: 'boom', x, y, r, t: 0, dur: 0.35, col: c });
    s.proj = o => { const p = Object.assign({ x: s.W.x, y: s.W.y, vx: 0, vy: 0, life: 1, r: 0.6, dmg: 0, splash: 0, sr: 0, col: '#fff', kind: 'ball', size: 5, tr: [] }, o); s.pj.push(p); return p; };
    s.zone = o => { const z = Object.assign({ x: s.W.x, y: s.W.y, r: 4, t: 3, dps: 0, slow: 0, follow: false, col: '#fff', kind: 'mud', tick: 0.25 }, o); z.dur = z.t; s.zn.push(z); };
    s.heal = () => s.fx.push({ type: 'heal', x: s.W.x, y: s.W.y, t: 0, dur: 0.8 });
    s.each = (x, y, r, f) => s.en.forEach(e => { if (e.dead) return; const d = Math.hypot(e.x - x, e.y - y); if (d <= r) f(e, d); });
    s.nearest = (x, y, range, skip) => {
      let b = null, bd = range;
      s.en.forEach(e => { if (e.dead || (skip && skip.indexOf(e) >= 0)) return; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } });
      return b;
    };
    s.hurt = (e, dmg, dx, dy, push, bolt) => {
      if (e.dead) return;
      e.hp -= dmg; e.flash = 0.14;
      if (push) { e.kx += dx * push * 0.3; e.ky += dy * push * 0.3; }
      s.pops.push({ x: e.x, y: e.y, txt: '' + Math.max(1, Math.round(dmg)), t: 0 });
      if (bolt) s.fx.push({ type: 'boom', x: e.x, y: e.y, r: 1, t: 0, dur: 0.25, col: '#fff' });
      if (e.hp <= 0) { e.hp = 0; e.dead = true; }
    };
    s.explode = (x, y, r, dmg, c, skip) => { s.boom(x, y, r, c); s.each(x, y, r, e => { if (e !== skip) s.hurt(e, dmg, 0, 0, 0); }); };
    return s;
  }

  function step(s, dt) {
    s.t += dt;
    if (!s.cast && s.t >= CAST) { s.cast = true; s.W.flash = 0.25; SC[s.id].cast(s, CFG.spells[s.id]); }
    s.W.x += s.W.vx * dt;
    s.W.flash = Math.max(0, s.W.flash - dt);
    for (let i = s.tm.length - 1; i >= 0; i--) { const q = s.tm[i]; q.t -= dt; if (q.t <= 0) { s.tm.splice(i, 1); q.fn(); } }
    for (let i = s.pj.length - 1; i >= 0; i--) {
      const p = s.pj[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.tr.push([p.x, p.y]); if (p.tr.length > 5) p.tr.shift();
      let hit = null;
      for (const e of s.en) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < p.r + 0.45) { hit = e; break; }
      if (hit) {
        s.hurt(hit, p.dmg, 0, 0, 0);
        if (p.slow) hit.slowT = p.slowT;
        if (p.splash) s.explode(p.x, p.y, p.sr, p.splash, p.col, hit);
        else s.fx.push({ type: 'boom', x: p.x, y: p.y, r: 0.8, t: 0, dur: 0.2, col: p.col });
      }
      if (hit || p.life <= 0) s.pj.splice(i, 1);
    }
    for (let i = s.zn.length - 1; i >= 0; i--) {
      const z = s.zn[i];
      z.t -= dt; z.tick -= dt;
      if (z.follow) { z.x = s.W.x; z.y = s.W.y; }
      s.each(z.x, z.y, z.r, e => { e.slowT = Math.max(e.slowT, 0.3); });
      if (z.tick <= 0) { z.tick += 0.5; s.each(z.x, z.y, z.r, e => s.hurt(e, z.dps * 0.5, 0, 0, 0)); }
      if (z.t <= 0) s.zn.splice(i, 1);
    }
    s.en.forEach(e => {
      e.x += e.kx * dt; e.y += e.ky * dt;
      const f = Math.exp(-4 * dt); e.kx *= f; e.ky *= f;
      e.flash = Math.max(0, e.flash - dt); e.slowT = Math.max(0, e.slowT - dt);
      if (e.dead) e.fade = Math.max(0, e.fade - dt * 2.2);
    });
    s.fx.forEach(f => { f.t += dt; });
    s.fx = s.fx.filter(f => f.t < f.dur);
    s.pops.forEach(p => { p.t += dt; });
    s.pops = s.pops.filter(p => p.t < 0.8);
  }

  // ---- drawing (buffer pixels; the canvas is blown up with nearest-neighbour) ----
  let ground = null;
  function mkGround() {
    const c = document.createElement('canvas'); c.width = BW; c.height = BH;
    const x = c.getContext('2d');
    x.fillStyle = '#2e6a3a'; x.fillRect(0, 0, BW, BH);
    let r = 7;
    for (let i = 0; i < 90; i++) {
      r = (r * 1103515245 + 12345) & 0x7fffffff;
      const px = r % BW, py = (r >> 8) % BH;
      x.fillStyle = i % 3 ? '#265a31' : '#3a7c45';
      x.fillRect(px, py, 2, 1);
    }
    return c;
  }
  const sx = x => Math.round(OX + x * TX), sy = y => Math.round(OY + y * TY);
  function dots(x, rx, ry, cx, cy, c, w, from, to, skip) {   // pixel-stepped ellipse outline
    x.fillStyle = c;
    const n = Math.max(24, Math.round(rx * 1.4));
    for (let i = 0; i < n; i++) {
      if (skip && (i % 2)) continue;
      const a = from + (to - from) * i / n;
      x.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), w, w);
    }
  }
  function pline(x, x0, y0, x1, y1, c, w, seed, amp) {   // jagged pixel line
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const k = i / n, j = Math.sin(k * 14 + seed) * amp * Math.sin(k * Math.PI);
      x.fillStyle = c;
      x.fillRect(Math.round(x0 + (x1 - x0) * k + j * 0.4), Math.round(y0 + (y1 - y0) * k + j), w, w);
    }
  }
  function ell(x, cx, cy, rx, ry, c, a) { x.globalAlpha = a; x.fillStyle = c; x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, 6.283); x.fill(); x.globalAlpha = 1; }
  function spr(x, key, px, py, white, a) {
    const s = SP[key]; if (!s) return;
    if (a !== undefined) x.globalAlpha = a;
    x.drawImage(white ? s.white : s.c, Math.round(px - s.ax), Math.round(py - s.ay));
    x.globalAlpha = 1;
  }

  function draw(s, x) {
    x.imageSmoothingEnabled = false;
    if (!ground) ground = mkGround();
    x.drawImage(ground, 0, 0);
    // zones under everything
    s.zn.forEach(z => {
      const cx = sx(z.x), cy = sy(z.y), rx = z.r * TX, ry = z.r * TY, fade = Math.min(1, z.t / 0.4);
      ell(x, cx, cy, rx, ry, z.col, 0.22 * fade);
      dots(x, rx, ry, cx, cy, z.col, 2, s.t * (z.follow ? 1.5 : 0.6), s.t * (z.follow ? 1.5 : 0.6) + 6.283, true);
      x.fillStyle = z.col;
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4 + s.t * (z.kind === 'sand' ? 3 : 0.8), rr = ((k * 0.37 + s.t * (z.kind === 'snow' ? 0.3 : 0.15)) % 1);
        const fy = z.kind === 'snow' ? -rr * 14 + 7 : z.kind === 'mud' ? -Math.abs(Math.sin(s.t * 3 + k)) * 4 : -Math.abs(Math.sin(s.t * 2 + k)) * 6;
        x.globalAlpha = 0.9 * fade;
        x.fillRect(Math.round(cx + Math.cos(a) * rx * (0.3 + 0.65 * ((k * 0.61) % 1))), Math.round(cy + Math.sin(a) * ry * (0.3 + 0.65 * ((k * 0.61) % 1)) + fy), 2, 2);
      }
      x.globalAlpha = 1;
    });
    s.fx.forEach(f => {
      const k = f.t / f.dur;
      if (f.type === 'ring') { x.globalAlpha = 1 - k * 0.7; dots(x, f.r * TX * Math.min(1, k * 2.2), f.r * TY * Math.min(1, k * 2.2), sx(f.x), sy(f.y), f.col, 2, 0, 6.283); x.globalAlpha = 1; }
      else if (f.type === 'boom') ell(x, sx(f.x), sy(f.y), f.r * TX * (0.5 + k * 0.5), f.r * TY * (0.5 + k * 0.5), f.col, 0.55 * (1 - k));
      else if (f.type === 'warn') {
        ell(x, sx(f.x), sy(f.y), f.r * TX, f.r * TY, f.col, 0.18);
        dots(x, f.r * TX * (1 - k * 0.3), f.r * TY * (1 - k * 0.3), sx(f.x), sy(f.y), f.col, 1, 0, 6.283, k < 0.6);
      } else if (f.type === 'meteor') {
        ell(x, sx(f.x), sy(f.y), f.r * TX * (0.4 + k * 0.6), f.r * TY * (0.4 + k * 0.6), '#ff7a30', 0.2);
        const bx = sx(f.x) + 18 * (1 - k), by = sy(f.y) - 80 * (1 - k);
        for (let i = 4; i >= 0; i--) { x.fillStyle = i ? '#ffb347' : '#fff0a0'; x.globalAlpha = i ? 0.5 : 1; x.fillRect(Math.round(bx + i * 3.5) - 2, Math.round(by - i * 10) - 2, i ? 3 : 5, i ? 3 : 5); }
        x.globalAlpha = 1;
        x.fillStyle = '#ff5a1a'; x.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);
      }
    });
    // things standing up, back to front
    const list = [{ y: s.W.y, wiz: true }].concat(s.en.map(e => ({ y: e.y, e })));
    list.sort((a, b) => a.y - b.y);
    list.forEach(o => {
      if (o.wiz) {
        ell(x, sx(s.W.x), sy(s.W.y), 6, 2.5, '#000', 0.3);
        if (SP.wizard) spr(x, 'wizard', sx(s.W.x), sy(s.W.y), s.W.flash > 0.12);
        if (s.W.flash > 0) { x.fillStyle = col(s.id); x.globalAlpha = s.W.flash * 3; x.fillRect(sx(s.W.x) + 4, sy(s.W.y) - 14, 5, 5); x.globalAlpha = 1; }
        return;
      }
      const e = o.e, px = sx(e.x), py = sy(e.y);
      ell(x, px, py, 6, 2.5, '#000', 0.3 * e.fade);
      if (e.slowT > 0) dots(x, 8, 3.5, px, py, '#9fe4ff', 1, 0, 6.283);
      spr(x, 'slime', px, py, e.flash > 0, e.fade);
      if (!e.dead) {
        const top = py - (SP.slime ? SP.slime.c.height : 8) - 4;
        x.fillStyle = '#2a0a0a'; x.fillRect(px - 7, top, 14, 3);
        x.fillStyle = e.hp / HP > 0.5 ? '#6ad06a' : e.hp / HP > 0.25 ? '#e0c040' : '#e05050';
        x.fillRect(px - 6, top + 1, Math.max(0, Math.round(12 * e.hp / HP)), 1);
      }
    });
    // geyser columns, projectiles, bolts, numbers on top
    s.fx.forEach(f => {
      const k = f.t / f.dur;
      if (f.type === 'column') {
        const cx = sx(f.x), cy = sy(f.y), w = f.r * TX * 0.7, h = 34 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5);
        x.globalAlpha = 1 - k * 0.8; x.fillStyle = '#4aa8ff'; x.fillRect(Math.round(cx - w / 2), Math.round(cy - h), Math.round(w), Math.round(h));
        x.fillStyle = '#d8f2ff'; x.fillRect(Math.round(cx - w / 4), Math.round(cy - h), Math.round(w / 2), Math.round(h)); x.globalAlpha = 1;
      } else if (f.type === 'heal') {
        x.fillStyle = '#7aff9a'; x.globalAlpha = 1 - k;
        for (let i = 0; i < 3; i++) x.fillRect(sx(f.x) - 8 + i * 8, Math.round(sy(f.y) - 16 - k * 10 - i * 2), 2, 2);
        x.globalAlpha = 1;
      } else if (f.type === 'bolt') {
        const vis = Math.min(f.pts.length - 1, Math.floor(f.t / f.gap) + 1), a = Math.min(1, (f.dur - f.t) / 0.25);
        x.globalAlpha = a;
        for (let j = 0; j < vis; j++) {
          const p0 = f.pts[j], p1 = f.pts[j + 1], part = Math.min(1, (f.t - j * f.gap) / f.gap + 0.3);
          const x0 = sx(p0[0]), y0 = sy(p0[1]) - 6, x1 = x0 + (sx(p1[0]) - x0) * part, y1 = y0 + (sy(p1[1]) - 6 - y0) * part;
          pline(x, x0, y0, x1, y1, f.col, 3, j * 3 + Math.floor(f.t * 20), 5);
          pline(x, x0, y0, x1, y1, '#fff', 1, j * 3 + Math.floor(f.t * 20), 5);
        }
        x.globalAlpha = 1;
      }
    });
    s.pj.forEach(p => {
      p.tr.forEach((t, i) => { x.globalAlpha = (i + 1) / (p.tr.length + 2) * 0.6; x.fillStyle = p.col; const z = Math.max(2, p.size * 0.5); x.fillRect(sx(t[0]) - z / 2, sy(t[1]) - 6 - z / 2, z, z); });
      x.globalAlpha = 1;
      x.fillStyle = p.col; x.fillRect(Math.round(sx(p.x) - p.size / 2), Math.round(sy(p.y) - 6 - p.size / 2), p.size, p.size);
      x.fillStyle = '#fff'; x.fillRect(Math.round(sx(p.x) - 1), Math.round(sy(p.y) - 7), 2, 2);
    });
    x.font = '8px DigitsB, monospace'; x.textAlign = 'center';
    s.pops.forEach(p => {
      const px = sx(p.x), py = Math.round(sy(p.y) - 24 - p.t * 14);
      x.globalAlpha = 1 - p.t / 0.8; x.fillStyle = '#000'; x.fillText(p.txt, px + 1, py + 1); x.fillStyle = '#ffe36b'; x.fillText(p.txt, px, py);
    });
    x.globalAlpha = 1;
  }

  // ---- lifecycle: one preview at a time (the hover card) ----
  let run = null;
  SPV.stop = function () { if (run) run.dead = true; run = null; };
  SPV.mount = function (canvas, id) {
    SPV.stop();
    if (!SC[id]) return;
    const x = canvas.getContext('2d'), me = run = { dead: false };
    let s = make(id), last = performance.now();
    const frame = now => {
      if (me.dead || !canvas.isConnected) return;
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      for (let n = Math.ceil(dt / 0.02); n > 0; n--) step(s, dt / Math.ceil(dt / 0.02));
      if (s.t > SC[id].len) s = make(id);
      draw(s, x);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  // test hook: advance a fresh sim to time t and draw it (for headless screenshots)
  SPV.snap = function (canvas, id, t) {
    const s = make(id);
    while (s.t < t) step(s, 0.02);
    draw(s, canvas.getContext('2d'));
  };
})();
