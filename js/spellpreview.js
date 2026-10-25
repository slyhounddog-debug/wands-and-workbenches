'use strict';
// SPV: a looping mini-simulation of each spell for the skill-tree hover card. Self-contained (no G.w): training dummies
// stand in a little clearing and the spell is cast with the real numbers from CFG.spells, so aoe / chains / cones read at a glance.
const SPV = {};
(function () {
  const TX = 9, TY = 4.5, OX = 93, OY = 62, BW = 186, BH = 100, HP = 100, CAST = 0.5;
  const BASIC_NODE = { air: 'gust', water: 'spray', fire: 'fireball', earth: 'boulder' };
  const CAP = {
    gust: 'CYCLONE: three pulses fling foes into each other', fireball: 'SEEKER: very fast, homes in on a foe',
    spray: 'WAVE: rolls out and carries foes with it', boulder: 'BOUNCER: crushes round every landing',
    flamethrower: 'STREAM: a cone of fire for two seconds', steam: 'PRESSURE: swells, then blows them away',
    sandstorm: 'TWISTER: hunts foes and drags them in', magma: 'LOB: blast, lava pool, splattering blobs',
    tempest: 'STORM ORB: drifts out zapping the nearest', mud: 'MUDSLIDE: roots its path, snare + wall at the end',
    meteor: 'ONE BIG ROCK: then burning fragments', thunder: 'STORM CLOUD: bolts rain down and fork',
    blizzard: 'ICICLES: three hits freeze a foe solid', geyser: 'TARGETED: throws the 6 nearest foes up',
    nova: 'FOUR RINGS: shove, slow, burn, crush',
  };
  const col = k => SPELL_COL[k] || '#fff';

  // ---- scenes: wizard spot, dummies, the cast, and how long the loop runs (tiles; x right, y down) ----
  const proj = (s, S, o) => s.proj(Object.assign({ vx: S.speed, vy: 0, life: S.life, dmg: S.dmg }, o));
  const burst = (s, S, c, dur, boom) => {
    s.ring(s.W.x, s.W.y, S.r, c, dur);
    if (boom) s.boom(s.W.x, s.W.y, S.r, c);
    s.each(s.W.x, s.W.y, S.r, (e, d) => {
      const m = d || 1;
      s.hurt(e, S.dmg, S.push ? (e.x - s.W.x) / m : 0, S.push ? (e.y - s.W.y) / m : 0, S.push);
      if (S.slow) e.slowT = S.slowT;
    });
  };
  const walk = (s, vx, secs) => { s.W.vx = vx; s.later(secs, () => { s.W.vx = 0; }); };
  // the crowd centre within range (the Magma Bomb and the Meteor aim there)
  const crowd = (s, range, r) => {
    const list = s.en.filter(e => !e.dead && Math.hypot(e.x - s.W.x, e.y - s.W.y) < range);
    let best = null, bn = 0;
    for (const e of list) { const near = list.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < r * 1.2); if (near.length > bn) { bn = near.length; best = [near.reduce((a, o) => a + o.x, 0) / bn, near.reduce((a, o) => a + o.y, 0) / bn]; } }
    return best || [s.W.x + 6, s.W.y];
  };
  const lob = (s, x0, y0, x1, y1, T, h, size, c, land, fall) => s.proj({ kind: 'lob', x: x0, y: y0, sx: x0, sy: y0, tx: x1, ty: y1, t: 0, T, h, size, col: c, land, fall: !!fall, life: T + 1 });
  const splat = (s, x, y, n, dist, f) => { for (let i = 0; i < n; i++) { const a = i / n * 6.283 + 0.4, d = dist[0] + (i % 3) / 2 * (dist[1] - dist[0]); f(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8); } };
  const SC = {
    gust: { len: 2.8, W: [0, 0], en: [[-2.5, 1], [-2, -0.5], [3, -2], [2, 3], [2.6, 2.2], [-1, -4], [5, 2], [9, -1]],
      cast: (s, S) => { for (let i = 0; i < S.pulses; i++) s.later(i * S.gap, () => burst(s, Object.assign({}, S, { r: S.r * (i + 1) / S.pulses }), col('gust'), 0.35)); } },
    steam: { len: 3.6, W: [0, 0], en: [[-3, 2], [3, -1], [1, 4], [-4, -2], [4, 3], [8, 0]],
      cast: (s, S) => s.zone({ r: S.r, t: S.t, dps: S.dps, slow: S.slow, follow: true, col: col('steam'), kind: 'steam',
        end: z => { s.boom(z.x, z.y, S.r, '#ffffff'); burst(s, { r: S.r, dmg: S.blast, push: S.push, slow: S.slow, slowT: S.slowT }, '#ffffff', 0.5); } }) },
    nova: { len: 3.6, W: [0, 0], en: [[-6, 1], [5, -3], [2, 6], [-3, -5], [7, 3], [-1, 2], [9.4, -1]],
      cast: (s, S) => ['air', 'water', 'fire', 'earth'].forEach((el, i) => s.later(i * S.gap, () => burst(s, { r: S.r, dmg: S.dmg / 4, push: el === 'air' ? S.push : 0, slow: el === 'water' ? S.slow : 0, slowT: S.slowT }, ELEM[el].color, 0.55, i === 3))) },
    fireball: { len: 3, W: [-8.5, 0], en: [[3, -2.5], [2.6, -3.3], [5, 2.5], [6.8, -1]],
      cast: (s, S) => proj(s, S, { vx: S.speed * 0.4, vy: S.speed * 0.2, splash: S.splash, sr: S.sr, col: '#ff7a30', kind: 'fire', size: 5, r: 0.5, home: S.turn, seek: S.seek * 2 }) },
    boulder: { len: 4, W: [-8.5, 0], en: [[-5, 0.4], [-2, -0.6], [1, 0.3], [4, -0.4], [7, 2.5]],
      cast: (s, S) => proj(s, S, { col: '#8a6a3c', kind: 'boulder', size: 9, life: 30, hops: S.hops, hop: S.hop, ht: 0, n: 0, sr: S.sr }) },
    magma: { len: 4.6, W: [-8.5, 0], en: [[3, 0], [1.5, -2.2], [2, 2.3], [4.5, -1.2], [7.5, 0]],
      cast: (s, S) => { const c = crowd(s, S.range * 2, S.sr); lob(s, s.W.x, s.W.y, c[0], c[1], S.flight, 3.4, 8, '#ff4a1a', (x, y) => {
        s.explode(x, y, S.sr, S.dmg, '#ff4a1a'); s.zone({ x, y, r: S.pool.r, t: S.pool.t, dps: S.pool.dps, col: '#ff6a1a', kind: 'lava' });
        splat(s, x, y, S.blobs, S.blobDist, (bx, by) => lob(s, x, y, bx, by, 0.45, 1.6, 4, '#ff7a30', (qx, qy) => s.explode(qx, qy, S.blobR, S.blobDmg, '#ff7a30')));
      }); } },
    spray: { len: 3, W: [-8.5, 0], en: [[-4, -1], [-3.5, 1.2], [-2, 0.1], [-2, 5]],
      cast: (s, S) => { s.heal(S.heal); s.proj({ vx: S.speed, vy: 0, life: S.life * 1.4, dmg: S.dmg, kind: 'wave', w: S.w, col: '#4aa8ff', size: 6, hit: [], slow: S.slow, slowT: S.slowT }); } },
    flamethrower: { len: 3.4, W: [-8.5, 0], en: [[-3.5, -1.2], [-3.5, 1.2], [-2.3, 0], [-3, 5]],
      cast: (s, S) => s.zone({ r: S.range, t: S.t, dps: S.dps, follow: true, col: '#ff9a2b', kind: 'flame', half: S.half }) },
    sandstorm: { len: 5, W: [-8, 0], en: [[-1, -2.5], [2, 2.5], [4, -1], [-3, 3.5], [7, 1]],
      cast: (s, S) => s.zone({ x: s.W.x + 1.5, y: s.W.y, vx: S.speed, vy: 0, r: S.r, t: S.t, dps: S.dps, slow: S.slow, col: col('sandstorm'), kind: 'twister', pull: S.pull, seek: S.seek, sp: S.speed }) },
    blizzard: { len: 5.6, W: [-4, 0], en: [[-2, -3], [1, 2.5], [4, -1.5], [6, 3], [-5, 3], [9, -2]],
      cast: (s, S) => { s.zone({ r: S.r, t: S.t, dps: S.dps, slow: S.slow, follow: true, col: col('blizzard'), kind: 'snow', ice: S }); walk(s, 2, S.t); } },
    mud: { len: 4.8, W: [-8.5, 0], en: [[-4, 0.3], [-1, -0.4], [2, 0], [3.6, -2], [1.2, 2.3], [7, 0]],
      cast: (s, S) => { const e = s.nearest(s.W.x + 9, s.W.y, 99) || { x: 2, y: 0 }; const d = Math.hypot(e.x - s.W.x, e.y - s.W.y), U = S.surge;
        s.proj({ vx: (e.x - s.W.x) / d * U.speed * 0.5, vy: (e.y - s.W.y) / d * U.speed * 0.5, life: d / U.speed * 2, dmg: U.dmg, kind: 'surge', w: U.w, col: '#6e4a2a', size: 6, hit: [], slow: 1, slowT: U.root,
          end: () => { s.zone({ x: e.x, y: e.y, r: S.r, t: S.t, dps: S.dps, slow: S.slow, col: col('mud'), kind: 'mud' }); s.fx.push({ type: 'wall', x: e.x - 2.2, y: e.y, t: 0, dur: S.t }); } }); } },
    tempest: { len: 4, W: [-8.5, 0], en: [[-6, 1.5], [-2.5, -3], [0.5, 2], [3.5, -2], [6.5, 2], [9, -3]],
      cast: (s, S) => s.zone({ x: s.W.x + 1, y: s.W.y, vx: S.speed * 1.6, vy: 0, r: S.range, t: S.t, col: '#bfe9ff', kind: 'orb', zap: S.zap, zt: 0.05, dmg: S.dmg, slowT: S.slowT }) },
    thunder: { len: 4.8, W: [-6, 0], en: [[-5.5, -1], [-4, 2.5], [-2.2, -2.5], [-0.8, 1.5], [0.8, -3], [2.4, 2], [4, -1.5], [5.6, 3], [7, -2.5]],
      cast: (s, S) => s.zone({ r: S.range * 1.5, t: S.t, follow: true, col: '#fff27a', kind: 'storm', every: S.every, zt: 0.05, S }) },
    meteor: { len: 4.6, W: [-7, 0], en: [[1, -1], [2.2, 0.6], [0.4, 1.2], [3, -1.8], [6.5, 3], [7, -3.5]],
      cast: (s, S) => { const c = crowd(s, S.range, S.r); lob(s, c[0] + 1.2, c[1] - 1.2, c[0], c[1], S.fall, 14, 12, '#ff7a30', (x, y) => {
        s.explode(x, y, S.r, S.dmg, '#ff7a30'); s.ring(x, y, S.r * 1.5, '#ffb030', 0.5);
        splat(s, x, y, S.frags, S.fragDist, (bx, by) => lob(s, x, y, bx, by, 0.55, 2.2, 4, '#ffb030', (qx, qy) => s.explode(qx, qy, S.fragR, S.fragDmg, '#ffb030')));
      }, true); } },
    geyser: { len: 3.8, W: [-6, 0], en: [[-1, -2], [-0.2, -1.2], [3, 2], [3.8, 2.8], [1, 4.5], [5, -3], [9, 0]],
      cast: (s, S) => {
        s.en.filter(e => !e.dead).sort((a, b) => Math.hypot(a.x - s.W.x, a.y - s.W.y) - Math.hypot(b.x - s.W.x, b.y - s.W.y)).slice(0, S.n).forEach((e, i) => {
          const x = e.x, y = e.y, at = S.delay + i * S.gap;
          s.fx.push({ type: 'warn', x, y, r: S.r, t: 0, dur: at, col: '#4aa8ff' });
          s.later(at, () => { s.fx.push({ type: 'column', x, y, r: S.r, t: 0, dur: 0.5 }); s.explode(x, y, S.r, S.dmg, '#7ad0ff'); s.each(x, y, S.r, q => { q.air = q.airT = S.toss; }); s.later(S.toss, () => s.each(x, y, S.r + 1, q => { if (q.airT) { q.airT = 0; s.hurt(q, S.land, 0, 0, 0); } })); });
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
      if (p.kind === 'lob') {   // flies along an arc (or drops from the sky), touches nothing until it lands
        p.t += dt; const k = Math.min(1, p.t / p.T);
        p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.z = p.fall ? (1 - k) * p.h : Math.sin(k * Math.PI) * p.h;
        if (k >= 1) { s.pj.splice(i, 1); p.land(p.tx, p.ty); }
        continue;
      }
      if (p.kind === 'boulder') {   // hops: each landing crushes the ring round it
        p.x += p.vx * dt; p.ht += dt; p.z = Math.sin(Math.min(1, p.ht / p.hop) * Math.PI) * (1.8 - p.n * 0.3);
        if (p.ht >= p.hop) { p.ht = 0; p.n++; p.hops--; p.hop *= 0.85; p.vx *= 0.9; s.explode(p.x, p.y, p.sr, CFG.spells.boulder.dmg, '#a98a5c'); if (p.hops <= 0) s.pj.splice(i, 1); }
        continue;
      }
      if (p.kind === 'wave' || p.kind === 'surge') {   // pierces: hits each dummy once; the wave carries them along, the mud roots them
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        for (const e of s.en) if (!e.dead && Math.abs(e.x - p.x) < 0.9 && Math.abs(e.y - p.y) < p.w / 2 + 0.4) {
          if (p.hit.indexOf(e) < 0) { p.hit.push(e); s.hurt(e, p.dmg, 0, 0, 0); e.slowT = p.slowT; }
          if (p.kind === 'wave') { e.kx = p.vx * 1.1; e.ky = 0; }
        }
        if (p.life <= 0) { s.pj.splice(i, 1); if (p.end) p.end(); }
        continue;
      }
      if (p.home) {   // a seeker: turns toward the nearest dummy
        const e = s.nearest(p.x, p.y, p.seek), sp = Math.hypot(p.vx, p.vy);
        if (e) { const want = Math.atan2(e.y - p.y, e.x - p.x), cur = Math.atan2(p.vy, p.vx); let da = want - cur; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; const na = cur + Math.max(-p.home * dt, Math.min(p.home * dt, da)); p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp; }
      }
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
      if (z.vx !== undefined) {   // a twister hunts, an orb drifts
        if (z.kind === 'twister') { const e = s.nearest(z.x, z.y, z.seek); if (e) { const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, dt * 2.5); z.vx += (dx / d * z.sp - z.vx) * k; z.vy += (dy / d * z.sp - z.vy) * k; }
          s.each(z.x, z.y, z.r * 1.6, e => { const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy) || 1; if (d > 0.3) { e.kx += dx / d * z.pull * dt * 4; e.ky += dy / d * z.pull * dt * 4; } }); }
        z.x += z.vx * dt; z.y += z.vy * dt;
      }
      const r = z.kind === 'steam' ? z.r * (0.35 + 0.65 * (1 - z.t / z.dur)) : z.r;
      z.rr = r;
      const inZ = (e, d) => z.kind !== 'flame' || (d < 0.6 || ((e.x - z.x) / d > Math.cos(z.half) && e.x > z.x));   // a flame stream only burns its cone
      if (z.kind === 'orb' || z.kind === 'storm') {   // zaps: the orb hits the nearest dummy, the cloud drops a bolt on one that forks
        if ((z.zt -= dt) <= 0) {
          z.zt = z.kind === 'orb' ? z.zap : z.every;
          const live = s.en.filter(e => !e.dead && Math.hypot(e.x - z.x, e.y - z.y) < r), e = z.kind === 'orb' ? s.nearest(z.x, z.y, r) : live[Math.floor(Math.random() * live.length)];
          if (e && z.kind === 'orb') { s.fx.push({ type: 'bolt', pts: [[z.x, z.y - 0.6], [e.x, e.y]], gap: 0.05, t: 0, dur: 0.18, col: z.col }); s.hurt(e, z.dmg, 0, 0, 0); e.slowT = z.slowT; }
          if (e && z.kind === 'storm') { const S = z.S, x = e.x, y = e.y; s.fx.push({ type: 'warn', x, y, r: S.r, t: 0, dur: S.warn, col: '#fff27a' }); s.later(S.warn, () => { s.fx.push({ type: 'sky', x, y, t: 0, dur: 0.25 }); s.explode(x, y, S.r, S.dmg, '#fff27a'); const n = s.nearest(x, y, S.chainR, s.en.filter(q => Math.hypot(q.x - x, q.y - y) < S.r + 0.5)); if (n) { s.fx.push({ type: 'bolt', pts: [[x, y], [n.x, n.y]], gap: 0.06, t: 0, dur: 0.25, col: '#fff27a' }); s.hurt(n, S.chainDmg, 0, 0, 0); } }); }
        }
      } else {
        s.each(z.x, z.y, r, (e, d) => { if (inZ(e, d)) e.slowT = Math.max(e.slowT, 0.3); });
        if (z.tick <= 0) { z.tick += 0.5; s.each(z.x, z.y, r, (e, d) => { if (inZ(e, d)) s.hurt(e, z.dps * 0.5, 0, 0, 0); }); }
      }
      if (z.ice && (z.it = (z.it || 0) - dt) <= 0) {   // icicles: three hits freeze a dummy
        z.it = z.ice.icicle * 2;
        const live = s.en.filter(e => !e.dead && Math.hypot(e.x - z.x, e.y - z.y) < r), e = live[Math.floor(Math.random() * live.length)];
        if (e) { s.fx.push({ type: 'ice', x: e.x, y: e.y, t: 0, dur: 0.3 }); s.later(0.3, () => { s.hurt(e, z.ice.iceDmg, 0, 0, 0); e.chill = (e.chill || 0) + 1; if (e.chill >= z.ice.chill) { e.chill = 0; e.frozen = z.ice.freeze; } }); }
      }
      if (z.t <= 0) { s.zn.splice(i, 1); if (z.end) z.end(z); }
    }
    s.en.forEach(e => {
      e.x += e.kx * dt; e.y += e.ky * dt;
      const f = Math.exp(-4 * dt); e.kx *= f; e.ky *= f;
      e.flash = Math.max(0, e.flash - dt); e.slowT = Math.max(0, e.slowT - dt); e.frozen = Math.max(0, (e.frozen || 0) - dt); e.air = Math.max(0, (e.air || 0) - dt);
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
      const cx = sx(z.x), cy = sy(z.y), rx = (z.rr || z.r) * TX, ry = (z.rr || z.r) * TY, fade = Math.min(1, z.t / 0.4);
      if (z.kind === 'flame') {   // tongues of fire fanning out in front of him
        for (let k = 0; k < 30; k++) { const q = (k * 0.091 + s.t * 2.6) % 1, a = Math.sin(k * 7.3 + s.t * 9) * z.half * q, d = 0.4 + q * z.r;
          x.globalAlpha = fade * (1 - q * 0.6); x.fillStyle = q < 0.25 ? '#fff0a0' : q < 0.55 ? '#ffb030' : '#ff5a1a'; const w = 2 + Math.round(q * 4);
          x.fillRect(Math.round(sx(z.x + Math.cos(a) * d) - w / 2), Math.round(sy(z.y + Math.sin(a) * d) - 5 - q * 4), w, w); }
        x.globalAlpha = 1; return;
      }
      if (z.kind === 'twister') {   // stacked spinning rings
        for (let k = 0; k < 7; k++) { const q = k / 6; dots(x, 2 + q * 8, 1 + q * 2, cx + Math.sin(s.t * 5 + k) * (1 + q * 2), cy - 2 - k * 4, k % 2 ? '#d9b46a' : '#a8844a', 1, s.t * 6, s.t * 6 + 6.283, true); }
        return;
      }
      if (z.kind === 'orb') { x.fillStyle = '#2a4a8a'; x.fillRect(cx - 4, cy - 12, 8, 8); x.fillStyle = '#e6f8ff'; x.fillRect(cx - 2, cy - 10, 4, 4); dots(x, rx, ry, cx, cy, z.col, 1, 0, 6.283, true); return; }
      if (z.kind === 'storm') { x.globalAlpha = fade; x.fillStyle = '#3a3a5a'; for (let k = 0; k < 5; k++) x.fillRect(sx(s.W.x) - 22 + k * 9, OY - 50 + (k % 2) * 3, 12, 8); x.globalAlpha = 1; return; }
      if (z.kind === 'lava') { ell(x, cx, cy, rx, ry, '#ff6a1a', 0.7 * fade); ell(x, cx, cy, rx * 0.5, ry * 0.5, '#ffd23a', 0.7 * fade); return; }
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
      } else if (f.type === 'wall') {   // the Earth Wall at the end of a mudslide
        x.fillStyle = '#6e4a2a'; for (let k = -3; k <= 3; k++) x.fillRect(sx(f.x) - 3, sy(f.y + k * 0.9) - 8, 6, 8);
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
      const e = o.e, px = sx(e.x), lift = e.air > 0 ? Math.sin((1 - e.air / (e.airT || 1)) * Math.PI) * 26 : 0, py = sy(e.y);
      ell(x, px, py, 6, 2.5, '#000', 0.3 * e.fade);
      if (e.slowT > 0) dots(x, 8, 3.5, px, py, '#9fe4ff', 1, 0, 6.283);
      spr(x, 'slime', px, py - lift, e.flash > 0, e.fade);
      if (e.frozen > 0) { x.globalAlpha = 0.55; x.fillStyle = '#bfe9ff'; x.fillRect(px - 7, py - 12, 14, 13); x.globalAlpha = 1; }
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
      } else if (f.type === 'sky' || f.type === 'ice') {   // a bolt from the cloud, an icicle dropping
        x.globalAlpha = 1 - k; x.fillStyle = f.type === 'sky' ? '#fff27a' : '#e6f8ff';
        if (f.type === 'sky') pline(x, sx(f.x) + 4, 0, sx(f.x), sy(f.y) - 4, '#fff27a', 2, f.t * 40, 4); else x.fillRect(sx(f.x) - 1, Math.round(sy(f.y) - 40 * (1 - k)) - 8, 2, 6);
        x.globalAlpha = 1;
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
      if (p.kind === 'lob' || p.kind === 'boulder') {   // a shadow on the ground, the thing up in the air
        ell(x, sx(p.x), sy(p.y), p.size * 0.6, p.size * 0.25, '#000', 0.3);
        const by = Math.round(sy(p.y) - 6 - (p.z || 0) * 9);
        x.fillStyle = p.kind === 'boulder' ? '#5a4428' : '#3a1408'; x.fillRect(Math.round(sx(p.x) - p.size / 2), by - p.size / 2, p.size, p.size);
        x.fillStyle = p.col; x.fillRect(Math.round(sx(p.x) - p.size / 2) + 1, by - p.size / 2 + 1, p.size - 2, p.size - 3);
        return;
      }
      if (p.kind === 'wave' || p.kind === 'surge') {   // a crescent of water / a wall of mud
        for (let k = -3; k <= 3; k++) { const yy = sy(p.y + k * p.w / 6), xx = sx(p.x) - Math.abs(k) * 1.2, h = 8 - Math.abs(k); x.fillStyle = p.kind === 'wave' ? '#2a72c8' : '#4a3018'; x.fillRect(Math.round(xx) - 2, yy - h, 4, h); x.fillStyle = p.kind === 'wave' ? '#ffffff' : '#8a6a3c'; x.fillRect(Math.round(xx) - 2, yy - h - 1, 4, 2); }
        return;
      }
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
