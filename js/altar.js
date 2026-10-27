'use strict';
// The Summoning Altar (plain WZ extensions, loaded after augments.js). All of it is plain data: G.altar (saved) and G.w.cine / G.w.rit (this expedition only).
//  - BOUGHT in the skill tree (Summoning), it is placed automatically: particles stream in from the Spell Portal's side of the wilds, gather into the Altar in
//    mid-air, hold, and it drops onto a spot beside the Wizard. The impact sends shockwave rings through the wilds (everything shakes, grass bends, foes stagger)
//    and through the Spell Portal into the factory (FA.pressure / FA.thump). Once it has landed it stands in that spot for good (G.altar.x / y).
//  - LIT by spells: it has one socket per spell tier (a Single, a Pair, a Triple, the Nova). A player spell whose reach touches it lights the socket of its tier,
//    for good (G.altar.lit, saved; no cooldown, no reset).
//  - It only answers spells once THE Warden is dead (G.flags.warden): before that a spell that reaches it just makes words rise off it ("THE WARDEN STILL LIVES").
//  - The Primal Chimera rises from it once all four sockets are lit and the Wizard is standing at the Altar.
WZ.altarFresh = () => ({ placed: false, x: 0, y: 0, lit: [false, false, false, false] });
WZ.altarFix = function (a) {
  const f = WZ.altarFresh();
  if (!a || typeof a !== 'object') return f;
  f.placed = !!a.placed; f.x = +a.x || 0; f.y = +a.y || 0;
  for (let i = 0; i < 4; i++) f.lit[i] = !!(a.lit && a.lit[i]);
  if (f.placed && !(f.x > 1 && f.y > 1)) f.placed = false;
  return f;
};
WZ.altarLitN = () => (G.altar ? G.altar.lit.filter(Boolean).length : 0);
WZ.altarOn = () => !!(G.altar && G.altar.placed);
WZ.keepsOpen = () => !!G.flags.warden;   // the Warden has been killed (set the first time it falls, and kept)

// ---------- where it lands ----------
WZ.altarSpot = function () {
  const w = G.w, A = CFG.altar, cam = (typeof R !== 'undefined' && R.wcam) || w;
  const clear = (x, y) => {
    if (x < 6 || y < 6 || x > CFG.WW - 6 || y > CFG.WH - 6) return false;
    for (let i = 0; i < 9; i++) { const a = i * 0.785, rr = i ? A.r : 0; if (WZ.blocked(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.3)) return false; }
    const t = WZ.tile(x, y);
    if (t === T_BOG || t === T_SCORCH || t === T_ICE) return false;
    if (WZ.marks.some(m => Math.hypot(m.x - x, m.y - y) < A.clear)) return false;
    if (WZ.harv.some(h => !h.broken && Math.hypot(h.x - x, h.y - y) < A.r + 1.3)) return false;
    if (WZ.forage.some(f => Math.hypot(f.x - x, f.y - y) < A.r + 1)) return false;
    return true;
  };
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * 6.283, d = A.spotMin + Math.random() * (A.spotMax - A.spotMin);
    const x = Math.floor(clampN(w.x + Math.cos(a) * d, 1, CFG.WW - 1)) + 0.5, y = Math.floor(clampN(w.y + Math.sin(a) * d, 1, CFG.WH - 1)) + 0.5;
    if (!clear(x, y)) continue;
    const dx = x - cam.x, dy = y - cam.y, sx = (dx - dy) * CFG.WT.TW / 2, sy = (dx + dy) * CFG.WT.TH / 2;
    if (Math.abs(sx) > 230 || sy < 110 || sy > 330) continue;   // well inside the camera and below the HUD cards, with room above it for the fall
    return [x, y];
  }
  for (let r = A.spotMin; r < 40; r += 2) for (let i = 0; i < 24; i++) {   // nothing on screen suits it: the nearest clear spot
    const x = Math.floor(clampN(w.x + Math.cos(i * 0.2618) * r, 1, CFG.WW - 1)) + 0.5, y = Math.floor(clampN(w.y + Math.sin(i * 0.2618) * r, 1, CFG.WH - 1)) + 0.5;
    if (clear(x, y)) return [x, y];
  }
  return [w.x + A.spotMin, w.y];
};

// ---------- the landing cinematic ----------
WZ.cineStart = function () {
  const w = G.w, A = CFG.altar, s = WZ.altarSpot();
  G.altar.x = s[0]; G.altar.y = s[1]; G.altar.placed = false;
  w.cine = { t: 0, landed: false, wave: 0, front: [] };   // front: the shockwaves rolling out, { t, r } each
  AU.sfx('whoosh');
  UI.toast('The Summoning Altar is coming through the Spell Portal!', 'R', 'b:altar'); UI.toast('The Summoning Altar is being sent into the wilds!', 'L', 'b:altar');
};
WZ.cineEnd = () => CFG.altar.form + CFG.altar.hang + CFG.altar.fall;   // the moment of impact
WZ.cineTick = function (dt) {
  const w = G.w, c = w.cine, A = CFG.altar, A_ = G.altar;
  if (!c) return;
  c.t += dt;
  const tH = A.form + A.hang, tI = WZ.cineEnd();
  if (!c.landed) {
    const rumble = c.t < A.form ? 0.04 + 0.12 * (c.t / A.form) : c.t < tH ? 0.18 : 0.22 + 0.2 * ((c.t - tH) / A.fall);
    w.shake = Math.max(w.shake, rumble);
    if (!c.hung && c.t >= A.form) { c.hung = true; AU.sfx('warn'); }
    if (!c.fell && c.t >= tH) { c.fell = true; AU.sfx('whoosh'); AU.sfx('launch'); }
    if (c.t >= tI) {   // impact
      c.landed = true; A_.placed = true; w.quake = A.quake;
      const col = '#ffe36b';
      WZ.boom(A_.x, A_.y, 4.5, '#ffffff'); WZ.ring(A_.x, A_.y, 5, col, 0.7); WZ.puff(A_.x, A_.y, '#d8c8a8', 30); WZ.puff(A_.x, A_.y, col, 20);
      AU.sfx('slam'); AU.sfx('thud');
      FA.thump(4, col);
      UI.changed();
    }
    return;
  }
  const since = c.t - tI;
  if (w.quake > 0) { w.quake -= dt; w.shake = Math.max(w.shake, 0.85 * Math.max(0, w.quake) / A.quake); }
  if (c.wave < A.waves.length && since >= A.waves[c.wave]) {   // the next shockwave leaves the Altar, and the Spell Portal feels it
    c.front.push({ t: 0, r: 0 });
    FA.pressure(1.5 - c.wave * 0.35, c.wave % 2 ? '#ffe36b' : '#ffffff');
    AU.sfx(c.wave ? 'pressure' : 'slam');
    w.fx_.push({ type: 'shock', x: A_.x, y: A_.y, r: A.ring, t: 0, dur: A.ring / A.speed, col: c.wave % 2 ? '#ffe36b' : '#ffffff' });
    c.wave++;
  }
  for (const f of c.front) {
    const r0 = f.r;
    f.t += dt; f.r = f.t * A.speed;
    // grass, flowers and bushes along the front are flattened and spring back
    const n = Math.max(6, Math.ceil(6.283 * f.r / 0.9));
    for (let i = 0; i < n; i++) { const a = i / n * 6.283, ca = Math.cos(a), sa = Math.sin(a); WZ.bendAt(A_.x + ca * f.r, A_.y + sa * f.r, ca * 6, sa * 6, 0.7); }
    for (const e of w.enemies) {   // foes the front runs through are shoved away and stagger
      if (e.dead || e.fall > 0 || e.boss) continue;
      const dx = e.x - A_.x, dy = e.y - A_.y, d = Math.hypot(dx, dy);
      if (d >= r0 - 0.3 && d < f.r + 0.3) {
        const kb = e.kb !== undefined ? e.kb : e.elite ? 0.4 : 1, m = d || 1;
        e.kx += dx / m * A.push * kb; e.ky += dy / m * A.push * kb; e.dazeT = Math.max(e.dazeT || 0, A.daze); e.cd = Math.max(e.cd || 0, A.daze);
      }
    }
    if (!w.dead && !w.jump && !(w.roll > 0)) {   // the Wizard is rocked by the front as it passes him
      const dx = w.x - A_.x, dy = w.y - A_.y, d = Math.hypot(dx, dy);
      if (d >= r0 - 0.4 && d < f.r + 0.4) { const m = d || 1; w.kick = { x: dx / m, y: dy / m, t: CFG.wizard.kickT, d: 0.5 }; }
    }
  }
  c.front = c.front.filter(f => f.r < A.ring + 2);
  if (c.wave >= A.waves.length && !c.front.length && !(w.quake > 0)) {
    w.cine = null;
    const ok = WZ.keepsOpen();
    UI.toast(ok ? 'The Altar stands! Hit it with a Single, a Pair, a Triple and the Nova' : 'The Altar stands, but it will not answer while the Warden lives', 'R', 'b:altar');
    UI.toast(ok ? 'The Altar has landed: send the Wizard one spell of each tier' : 'The Altar has landed: the Warden must die before it takes spells', 'L', 'b:altar');
    if (!ok) WZ.altarSay('THE WARDEN STILL LIVES');
  }
};

// ---------- hits ----------
// a player spell whose reach (centre x, y, radius r) touches the Altar lights the socket of its tier. No-op for anything that is not a player spell (WZ.ctx).
WZ.altarTouch = function (x, y, r) {
  if (!WZ.ctx || WZ.ctx.wand || !WZ.altarOn()) return false;   // (a wand attack is not a spell: it lights nothing)
  if (Math.hypot(G.altar.x - x, G.altar.y - y) > r + CFG.altar.r) return false;
  WZ.altarHit(WZ.ctx);
  return true;
};
// words rising off the Altar (a G.w.fx_ 'altarTxt'): what it says while it will not take a spell
WZ.altarSay = function (text, col) {
  const w = G.w, A = G.altar;
  if (w.t - (w.altarSaidAt || -99) < 1.4) return;
  w.altarSaidAt = w.t;
  w.fx_.push({ type: 'altarTxt', x: A.x, y: A.y, text, col: col || '#ff7a8a', t: 0, dur: 2.6 });
};
WZ.altarHit = function (c) {
  const A = G.altar, w = G.w, tier = Math.max(1, Math.min(4, (c.el || []).length)), i = tier - 1;
  if (!c || c.altar || !WZ.altarOn()) return;
  c.altar = true;   // one cast lights it once
  if (!WZ.keepsOpen()) {   // the Warden still lives: the spell splashes off and the Altar says so
    w.altarFlash = 0.3; WZ.ring(A.x, A.y, 2, '#ff5a6e', 0.35); AU.sfx('error');
    WZ.altarSay('THE WARDEN STILL LIVES');
    return;
  }
  const col = CFG.altar.cols[i];
  w.altarFlash = 0.45;
  if (A.lit[i]) { WZ.ring(A.x, A.y, 2.2, col, 0.3); AU.sfx('hit'); return; }   // this tier is already lit
  A.lit[i] = true;
  G.stats.altarLit = WZ.altarLitN();
  WZ.ring(A.x, A.y, 3.5, col, 0.6); WZ.puff(A.x, A.y, col, 18); WZ.icon(A.x, A.y - 0.5, CFG.altar.keys[i]);
  w.fx_.push({ type: 'beam', x: A.x, y: A.y, col, t: 0, dur: 0.9 });
  w.shake = Math.max(w.shake, 0.3);
  AU.sfx('shrine'); AU.sfx('chest');
  FA.pressure(0.5, col);
  const n = WZ.altarLitN(), nm = CFG.altar.sockets[i];
  UI.toast('The Altar\'s ' + nm + ' socket lights up! (' + n + '/4)', 'R', CFG.altar.keys[i]); UI.toast('The Altar\'s ' + nm + ' socket is lit (' + n + '/4)', 'L', CFG.altar.keys[i]);
  UI.changed();
};
WZ.altarBlocks = (x, y, r) => WZ.altarOn() && Math.hypot(G.altar.x - x, G.altar.y - y) < r + CFG.altar.r * 0.8;   // projectiles stop against it
// a chain of lightning arcs to the Altar too when it is in range and its tier is not lit yet (so Thunder / Tempest can light it)
WZ.altarChainTarget = function (px, py, range) {
  const c = WZ.ctx;
  if (!c || !WZ.altarOn() || c.altar || !WZ.keepsOpen()) return null;
  const A = G.altar, tier = Math.max(1, Math.min(4, (c.el || []).length));
  if (A.lit[tier - 1] || Math.hypot(A.x - px, A.y - py) > range) return null;
  return A;
};

// ---------- every frame ----------
WZ.altarTick = function (dt) {
  const w = G.w, A = G.altar, K = CFG.altar;
  if (w.altarFlash > 0) w.altarFlash -= dt;
  // bought but not landed yet: it comes as soon as the Wizard is alive to see it
  if (G.tree.summon && !A.placed && !w.cine && !w.dead) WZ.cineStart();
  if (!A.placed) return;
  // solid to the Wizard, like a boulder (foes walk through: they are not what the Altar is about)
  if (!w.dead && !w.blink && !w.jump) {
    const dx = w.x - A.x, dy = w.y - A.y, d = Math.hypot(dx, dy), min = K.solid + CFG.wizard.radius;
    if (d < min) { const k = d || 0.01; w.x = A.x + dx / k * min; w.y = A.y + dy / k * min; }
  }
  // all four sockets lit: it only wakes the Chimera when every Stronghold has fallen, and the Wizard stands at it
  const lit = WZ.altarLitN() >= 4, open = WZ.keepsOpen(), near = !w.dead && Math.hypot(w.x - A.x, w.y - A.y) < K.wakeR;
  if (w.rit > 0) {
    w.rit -= dt;
    w.shake = Math.max(w.shake, 0.12 + 0.3 * (1 - Math.max(0, w.rit) / K.ritual));
    if (w.rit <= 0) { w.rit = 0; if (!w.boss && !w.dead) WZ.summonBoss(A.x, A.y); }
    return;
  }
  if (!lit || w.boss || G.flags.won || w.time < 12) { w.sealedT = 0; return; }
  if (near && !open) { WZ.altarSay('THE WARDEN STILL LIVES'); return; }   // (an older save may have lit sockets before the Warden rule: it waits for the Warden too)
  if (near && open) {   // the ritual: the Altar gathers its power, then the Chimera steps out
    w.rit = K.ritual;
    AU.sfx('roar'); AU.sfx('warn'); FA.pressure(0.8, '#ff4a8a');
    WZ.ring(A.x, A.y, 6, '#ff4a8a', 0.9);
    UI.toast('The Altar hums... the Primal Chimera is coming!', 'R', 'ic_crown'); UI.toast('The Altar awakens! The Primal Chimera is coming!', 'L', 'ic_crown');
  }
};
