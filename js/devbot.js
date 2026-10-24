'use strict';
// DEV ONLY: a deliberately mediocre Wizard so one person can run the Builder-side iteration loop solo.
// Toggle: F4 while the F3 overlay is open, or __wands.bot('wizard') / __wands.bot(null). Off on every load, never saved.
// It plays through the real input layer: each frame it writes a gamepad-shaped state into IN.pad[slot] (the Wizard's pad; see DevBot.plug),
// and Main.controls / WZ.update handle it exactly like a human's stick and roll button (water slide, bog slow, i-frames,
// forage mashing). It only READS game state to decide; it never calls anything that moves, rolls or picks up. Neutral while
// paused, dead or with a skill tree open; it never presses the tree buttons.
const DevBot = { on: null, st: null, stats: null };

(function () {
  const C = () => CFG.devBot, rnd = (a, b) => a + Math.random() * (b - a);
  const norm = (x, y) => { const m = Math.hypot(x, y); return m > 1e-6 ? [x / m, y / m] : [0, 0]; };
  const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const NEUTRAL = () => ({ ix: 0, iy: 0, cyc: 0, a: false, b: false, x: false, y: false, lb: false, rb: false, rt: false, xHeld: false, aHeld: false, bHeld: false, ltHeld: false, startHeld: false, back: false, any: false });

  DevBot.reset = function () {
    DevBot.st = {
      g: G, now: 0, acc: 0, dir: [0, 0], mash: false, mashT: 0, rollReq: false, mode: 'idle',
      strafe: 1, strafeT: 0, duty: 0, side: 1, goal: null, wander: null, wanderT: 0, skip: new Map(), visited: {},
      pos: [0, 0], posT: 0, tryTicks: 0, stuckUntil: 0, stuckSide: 1, stuckN: 0, still: 0, lastPos: null, deadSeen: false, dwell: 0,
    };
    const s = G && G.stats;
    DevBot.stats = { t: 0, deaths: 0, firstDeath: null, lifetimes: [], xp0: s ? s.xpEarned : 0, kills0: s ? s.kills : 0 };
    DevBot.st.deadSeen = !!(G && G.w && G.w.dead);   // already down when switched on: not the bot's death
  };

  DevBot.set = function (who) {
    const was = DevBot.on;
    DevBot.on = who === 'wizard' ? 'wizard' : null;
    if (DevBot.on && !was) DevBot.reset();
    if (!DevBot.on && was) DevBot.unplug();
    DevBot.chip();
    return DevBot.info();
  };
  // The player screen decides which pad slot is the Wizard's (G.ctl.pw, -1 when the Wizard is on the keyboard). The bot plugs a
  // virtual controller into that slot, or a free one it claims as the Wizard's, and gives the claim back when it is switched off.
  DevBot.plug = function () {
    const st = DevBot.st, c = G.ctl;
    if (st.slot === undefined || st.g !== G) { st.pwOrig = c.pw; st.slot = c.pw >= 0 ? c.pw : (c.pb === 1 ? 0 : 1); }
    if (c.pw !== st.slot) c.pw = st.slot;
    return st.slot;
  };
  DevBot.unplug = function () {
    const st = DevBot.st;
    if (!st || st.slot === undefined) return;
    if (G && G.ctl && st.g === G && G.ctl.pw === st.slot) G.ctl.pw = st.pwOrig;
    IN.pad[st.slot] = null; IN.prevBtn[st.slot] = [];
    st.slot = undefined;
  };
  DevBot.toggle = function () { DevBot.set(DevBot.on ? null : 'wizard'); if (window.AU) AU.sfx('blip'); };

  // the BOT: WIZARD chip over the Wizard half
  DevBot.chip = function () {
    let el = document.getElementById('botChip');
    if (!DevBot.on) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = 'botChip'; el.className = 'px';
    el.textContent = 'BOT: WIZARD';
    el.style.cssText = 'position:absolute;left:820px;top:172px;z-index:45;padding:8px 12px;font:10px var(--display);color:#ffd23a;background:#33235a;pointer-events:none;letter-spacing:1px';
    (document.getElementById('game') || document.getElementById('stage') || document.body).appendChild(el);
  };

  DevBot.info = function () {
    const s = DevBot.stats, st = DevBot.st;
    return DevBot.on ? { on: DevBot.on, mode: st.mode, t: s.t, deaths: s.deaths, firstDeath: s.firstDeath, lifetimes: s.lifetimes.slice(), xp: (G ? G.stats.xpEarned : 0) - s.xp0, kills: (G ? G.stats.kills : 0) - s.kills0 } : { on: null };
  };
  // the lines the F3 overlay shows
  DevBot.html = function () {
    if (!DevBot.on) return '<div class="dim">F4: dev bot (off)</div>';
    const i = DevBot.info(), s = DevBot.stats, tm = v => fmtTime(v);
    return '<div>BOT: <b>WIZARD</b> ' + i.mode + '  deaths <b>' + i.deaths + '</b>  first death <b>' + (s.firstDeath === null ? 'none yet' : tm(s.firstDeath)) +
      '</b>  driven ' + tm(s.t) + '</div><div class="dim">bot XP +' + i.xp + '  kills +' + i.kills + (s.lifetimes.length ? '  lives ' + s.lifetimes.map(tm).join(' ') : '') + '  (F4 = off)</div>';
  };

  // ---------- perception (read-only) ----------
  const foesOf = w => w.enemies.filter(e => !e.dead && !(e.fall > 0));
  const skipped = (st, o) => (st.skip.get(o) || 0) > st.now;
  const cellOf = (x, y) => { const c = C().wanderCell; return Math.floor(x / c) + ',' + Math.floor(y / c); };

  // plain steering: if the straight line runs into water, try turning a bit either way (the real slide does the rest)
  function steer(st, w, v) {
    if (!v[0] && !v[1]) return v;
    const P = C().steerProbe, r = CFG.wizard.radius + 0.1;
    const free = u => !WZ.blocked(w.x + u[0] * P, w.y + u[1] * P, r) && !WZ.blocked(w.x + u[0] * P * 0.5, w.y + u[1] * P * 0.5, r);
    if (free(v)) return v;
    for (const a of [0.7, 1.4, 2.1]) for (const sg of [st.side, -st.side]) { const u = rot(v, a * sg); if (free(u)) { st.side = sg; return u; } }
    return v;
  }

  // ---------- the decision (every C.tick) ----------
  function think(st, w) {
    const c = C(), maxHp = WZ.maxHp(), hpF = w.hp / maxHp;
    const foes = foesOf(w).map(e => ({ e, d: Math.hypot(e.x - w.x, e.y - w.y) })).sort((a, b) => a.d - b.d);
    const near = foes[0] && foes[0].d <= c.engageR ? foes[0] : null;
    let cx = 0, cy = 0, cn = 0;
    for (const f of foes) if (f.d <= 10) { cx += f.e.x; cy += f.e.y; cn++; }
    const away = (px, py) => norm(w.x - px, w.y - py);
    const toward = (px, py) => norm(px - w.x, py - w.y);
    const perp = v => [-v[1] * st.strafe, v[0] * st.strafe];
    let dir = [0, 0], mode = 'idle', mash = false;

    st.visited[cellOf(w.x, w.y)] = (st.visited[cellOf(w.x, w.y)] || 0) + c.tick;
    st.duty++;
    st.strafeT -= c.tick;
    if (st.strafeT <= 0) { st.strafe = -st.strafe; st.strafeT = rnd(c.strafeMin, c.strafeMax); }

    // pickups worth walking to: heals while hurt, armor while not full
    const usable = p => p.z === 0 && !!CFG.pickups[p.kind] && (CFG.pickups[p.kind].heal ? w.hp < maxHp - 5 : w.armor < CFG.wizard.armorMax - 5);
    const nearestPickup = rad => {
      let b = null, bd = rad;
      for (const p of w.pickups) { if (!usable(p)) continue; const d = Math.hypot(p.x - w.x, p.y - w.y); if (d < bd) { bd = d; b = p; } }
      return b;
    };

    // 1. survive
    if (hpF < c.retreatHp) {
      const p = nearestPickup(c.seekR * 1.5);
      if (p) { mode = 'heal'; dir = toward(p.x, p.y); }
      else if (near) { mode = 'flee'; dir = away(cn ? cx / cn : near.e.x, cn ? cy / cn : near.e.y); const pp = perp(dir); dir = norm(dir[0] + pp[0] * 0.35, dir[1] + pp[1] * 0.35); }
    }

    // 2. collect
    if (mode === 'idle') {
      let best = null, bt = 9, bd = c.seekR;
      const tier = k => (k === 'xp' ? 0 : k === 'shard' || k === 'core' ? 2 : 1);
      for (const dr of w.drops) {
        const d = Math.hypot(dr.x - w.x, dr.y - w.y), t = tier(dr.kind);
        if (d > c.seekR || (near && near.d < c.collectEnemyR && d > near.d)) continue;
        if (t < bt || (t === bt && d < bd)) { bt = t; bd = d; best = dr; }
      }
      const pk = hpF < 0.8 || w.armor < CFG.wizard.armorMax * 0.5 ? nearestPickup(c.seekR) : null;
      if (pk && (!best || bt > 0)) { mode = 'pickup'; dir = toward(pk.x, pk.y); }
      else if (best) { mode = 'collect'; dir = toward(best.x, best.y); if (bd < 0.3) dir = [0, 0]; }
    }

    // 3. fight position
    if (mode === 'idle' && near) {
      const d = near.d, ex = near.e.x, ey = near.e.y, rad = toward(ex, ey);
      mode = 'fight';
      if (d < c.bandMin) { const aw = [-rad[0], -rad[1]], pp = perp(rad); dir = norm(aw[0] + pp[0] * 0.5, aw[1] + pp[1] * 0.5); }
      else if (d > c.bandMax) { const pp = perp(rad); dir = norm(rad[0] + pp[0] * 0.5, rad[1] + pp[1] * 0.5); }
      else { dir = perp(rad); if (st.duty % (c.strafeOn + c.strafeOff) >= c.strafeOn) { dir = [0, 0]; } }
    }

    // 4. forage / harvest / wander
    if (mode === 'idle') {
      let g = st.goal;
      if (g && (g.o.broken || skipped(st, g.o) || st.now - g.t0 > g.max)) { if (st.now - g.t0 > g.max) st.skip.set(g.o, st.now + c.skipT); g = st.goal = null; }
      if (!g) {
        let best = null, bd = c.forageR;
        for (const o of WZ.forage) { if (o.broken || !WZ.forageSeen(o) || skipped(st, o)) continue; const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < bd) { bd = d; best = { o, kind: 'forage' }; } }
        if (!best) { bd = c.harvestR; for (const o of WZ.harv) { if (o.broken || skipped(st, o)) continue; const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < bd) { bd = d; best = { o, kind: 'harvest' }; } } }
        if (best) g = st.goal = { o: best.o, kind: best.kind, t0: st.now, max: bd / (CFG.wizard.speed * 0.5) + 8, dwell: 0, dug: 0 };
      }
      if (g) {
        const d = Math.hypot(g.o.x - w.x, g.o.y - w.y);
        if (g.kind === 'forage') {
          if (d < CFG.forage.reach * 0.75 && WZ.forageAt(w.x, w.y) === g.o) { mode = 'forage'; mash = true; g.dug += c.tick; if (g.dug > 7) { st.skip.set(g.o, st.now + c.skipT); st.goal = null; } }
          else { mode = 'to-forage'; dir = toward(g.o.x, g.o.y); }
        } else if (d < 1.4) {
          mode = 'harvest'; g.dwell += c.tick;
          if (g.dwell > c.harvestDwell) { st.skip.set(g.o, st.now + c.skipT * 0.7); st.goal = null; }
        } else { mode = 'to-harvest'; dir = toward(g.o.x, g.o.y); }
      }
    }
    if (mode === 'idle') {
      let tgt = st.wander;
      if (tgt && (Math.hypot(tgt[0] - w.x, tgt[1] - w.y) < 2 || st.now - st.wanderT > 14)) tgt = st.wander = null;
      if (!tgt) {
        let best = null, bs = 1e9;
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * 6.283, px = w.x + Math.cos(a) * c.wanderStep, py = w.y + Math.sin(a) * c.wanderStep;
          if (px < 4 || py < 4 || px > CFG.WW - 4 || py > CFG.WH - 4 || WZ.blocked(px, py, 0.5) || Math.hypot(px - SPAWN.x, py - SPAWN.y) > c.wanderLeash) continue;
          const s = (st.visited[cellOf(px, py)] || 0) + Math.random() * 2;
          if (s < bs) { bs = s; best = [px, py]; }
        }
        if (!best) best = [SPAWN.x + rnd(-8, 8), SPAWN.y + rnd(-8, 8)];   // boxed in or too far out: head back toward the start
        tgt = st.wander = best; st.wanderT = st.now;
      }
      mode = 'wander'; dir = toward(tgt[0], tgt[1]);
      if (st.duty % (c.wanderOn + c.wanderOff) >= c.wanderOn) { dir = [0, 0]; }
    }

    // never stand idle: still for idleMax seconds (digging excepted) forces a fresh wander and drops the current goal
    const lp = st.lastPos, moved = lp ? Math.hypot(w.x - lp[0], w.y - lp[1]) : 1;
    st.lastPos = [w.x, w.y];
    if (moved < 0.02 && !mash && mode !== 'fight' && mode !== 'harvest') st.still += c.tick; else st.still = 0;
    if (st.still > c.idleMax) { st.still = 0; if (st.goal) st.skip.set(st.goal.o, st.now + c.skipT); st.goal = null; st.wander = null; }

    // stuck backstop: pushing for a second and hardly moved -> sidestep for a moment
    if (dir[0] || dir[1]) st.tryTicks++;
    if (st.now - st.posT >= c.stuckT) {
      const mv = Math.hypot(w.x - st.pos[0], w.y - st.pos[1]);
      if (st.tryTicks >= 4 && mv < c.stuckMove && !(w.roll > 0)) {
        st.stuckUntil = st.now + c.stuckBack; st.stuckSide = -st.stuckSide; st.stuckN++;
        if (st.stuckN >= 2) { if (st.goal) st.skip.set(st.goal.o, st.now + c.skipT); st.goal = null; st.wander = null; st.stuckN = 0; }
      } else if (mv >= c.stuckMove) st.stuckN = 0;
      st.pos = [w.x, w.y]; st.posT = st.now; st.tryTicks = 0;
    }
    if (st.now < st.stuckUntil && (dir[0] || dir[1])) { const p = [-dir[1] * st.stuckSide, dir[0] * st.stuckSide]; dir = norm(dir[0] + p[0], dir[1] + p[1]); }
    else dir = steer(st, w, dir);

    // 5. roll when a foe is right on top of us (the real cooldown decides if it can)
    st.rollReq = false;
    if (near && near.d < c.rollR && w.rollCd <= 0 && !(w.roll > 0) && Math.random() < c.rollChance) {
      st.rollReq = true;
      const aw = away(near.e.x, near.e.y), pp = perp(aw);
      dir = steer(st, w, norm(aw[0] + pp[0] * 0.4, aw[1] + pp[1] * 0.4));
      mash = false;
    }
    st.dir = dir; st.mash = mash; st.mode = mode;
  }

  // ---------- called once per frame, after IN.pollPads(), before Main.step ----------
  DevBot.drive = function (dt) {
    if (!DevBot.on || STATE !== 'play' || !G) return;
    if (!DevBot.st || DevBot.st.g !== G) DevBot.reset();
    const st = DevBot.st, w = G.w, s = DevBot.stats, c = C();
    if (w.dead && !st.deadSeen) {   // the headline measurement
      st.deadSeen = true; s.deaths++; s.lifetimes.push(Math.round(w.time));
      if (s.firstDeath === null) s.firstDeath = s.t;
    } else if (!w.dead) st.deadSeen = false;
    const pad = NEUTRAL();
    const idle = G.paused || w.dead || UI.treeOpen.L || UI.treeOpen.R || Main.graceT > 0;
    if (idle) { st.dir = [0, 0]; st.mash = false; st.rollReq = false; st.mode = w.dead ? 'dead' : 'waiting'; IN.pad[DevBot.plug()] = pad; return; }
    st.now += dt; s.t += dt;
    st.acc -= dt;
    if (st.acc <= 0) { st.acc = c.tick; think(st, w); }
    // world direction -> the stick: WZ.update turns (ix, iy) into world (ix + iy, iy - ix)
    let ix = (st.dir[0] - st.dir[1]) / 2, iy = (st.dir[0] + st.dir[1]) / 2;
    const mx = Math.max(Math.abs(ix), Math.abs(iy));
    if (mx > 0) { ix /= mx; iy /= mx; }
    pad.ix = ix; pad.iy = iy;
    if (st.mash) { st.mashT -= dt; if (st.mashT <= 0) { st.mashT = c.mashGap; pad.a = true; } } else st.mashT = 0;
    if (st.rollReq) { pad.a = true; st.rollReq = false; }
    pad.any = pad.a;
    IN.pad[DevBot.plug()] = pad;
  };
})();
