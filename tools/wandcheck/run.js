'use strict';
// The Wand acceptance run: the trickle charge, the four buttons on every scheme, the four wand verbs (Flame Trail, Vanishing Puff, Riding Wave, Statue), shrines (claimed once,
// woken by a ring game, a timed buff, a cooldown, no wand charge), the held-spell slot's removal, old saves, the snapshot.
//   node tools/wandcheck/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const OUT = process.env.SHOTS || '';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/'));
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  await page.evaluate(() => { __wands.UI.show('loading', false); __wands.start(1); __wands.UI.help(false); __wands.G.helpT = 0; });
  await page.evaluate(() => {
    const W = __wands, w = () => W.G.w;
    W.CFG.world.cap = 0;
    for (const el of ['air', 'water', 'fire', 'earth']) W.CFG.harness[el].cycle = 1e9;
    window.T = {
      // one simulation step with the Wizard's whole input: ix, iy (stick), roll, act = { mash, cast, cycle }
      step: (n, o) => { o = o || {}; for (let i = 0; i < n; i++) W.Main.step(0.05, { bix: 0, biy: 0, wix: o.ix || 0, wiy: o.iy || 0, wrx: o.rx || 0, wry: o.ry || 0, roll: !!o.roll, act: o.act || {}, broll: false }); },
      clear: () => { const q = w(); q.enemies.length = 0; q.allies.length = 0; q.aq.length = 0; q.proj.length = 0; q.eproj.length = 0; q.aproj.length = 0; q.zones.length = 0; q.timers.length = 0; q.fx_.length = 0; q.drops.length = 0; q.mines.length = 0; q.booms.length = 0; q.hp = 1e6; q.armor = 0; q.vx = q.vy = 0; q.fireT = q.invisT = q.statT = q.statHits = 0; q.ride = null; q.sg = null; q.rollCd = 0; q.roll = 0; q.hurtT = 0; W.G.fac.eggQ.length = 0; },
      // a still, harmless dummy foe with no weakness and a lot of health
      foe: (dx, dy, hp = 1e6) => { const q = w(), e = W.WZ.makeEnemy('slime', q.x + dx, q.y + dy); e.hp = e.maxHp = hp; e.spd = 0; e.weak = null; e.resist = null; e.dr = 1; e.dmg = 0; e.ai = null; return e; },
      fill: el => { const g = W.G.wand; g.m[el] = W.CFG.wand.need[el]; g.full[el] = true; g.ord = g.ord.filter(k => k !== el); g.ord.push(el); g.armed = el; },
      reset: () => { W.G.wand = W.WZ.wandFresh(); },
      // the Wizard on open grass with a clear lane in direction (dx, dy) of len tiles (world coordinates)
      lane: (dx, dy, len) => {
        const q = w(), WZ = W.WZ;
        for (let r = 0; r < 60; r++) for (let a = 0; a < 12; a++) {
          const x = q.x + Math.cos(a * 0.52) * r * 3, y = q.y + Math.sin(a * 0.52) * r * 3;
          let ok = true;
          for (let s = -3; s <= len + 3 && ok; s += 0.5) for (let l = -3; l <= 3 && ok; l += 1) { const px = x + dx * s - dy * l, py = y + dy * s + dx * l; if (WZ.blocked(px, py, 0.5) || WZ.harv.some(h => !h.broken && Math.hypot(h.x - px, h.y - py) < 1.6) || WZ.forage.some(o => Math.hypot(o.x - px, o.y - py) < 2)) ok = false; }
          if (ok) { q.x = x; q.y = y; q.vx = q.vy = 0; q.fx = dx; q.fy = dy; return true; }
        }
        return false;
      },
    };
    W.G.fac.floor.length = 0;
  });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };

  // ================= 1. the trickle =================
  let r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {}; T.clear(); T.reset();
    const need = W.CFG.wand.need;
    o.need = JSON.stringify(need);
    for (let i = 0; i < 7; i++) WZ.cast('gust');
    o.air7 = [G.wand.m.air, G.wand.full.air, G.wand.armed];
    WZ.cast('gust');
    o.air8 = [G.wand.m.air, G.wand.full.air, G.wand.armed];
    // a Flamethrower ticks Air (full: lost) and Fire once each
    WZ.cast('flamethrower');
    o.flame = [G.wand.m.air, G.wand.m.fire, G.wand.full.air];
    // earth fills at 5
    for (let i = 0; i < 4; i++) WZ.cast('boulder');
    o.earth4 = [G.wand.m.earth, G.wand.full.earth];
    WZ.cast('boulder');
    o.earth5 = [G.wand.m.earth, G.wand.full.earth, G.wand.armed];
    // ticks on a full slot are lost
    WZ.cast('boulder'); WZ.cast('boulder');
    o.earthLost = [G.wand.m.earth, G.wand.full.earth];
    // the Nova ticks all four, once each
    T.reset(); WZ.cast('nova'); o.nova = JSON.stringify(G.wand.m);
    // a Triple ticks its three
    T.reset(); WZ.cast('thunder'); o.thunder = JSON.stringify(G.wand.m);
    // water fills at 7 and fire at 6
    T.reset(); for (let i = 0; i < 6; i++) WZ.cast('spray'); o.w6 = G.wand.full.water; WZ.cast('spray'); o.w7 = [G.wand.full.water, G.wand.m.water];
    T.reset(); for (let i = 0; i < 5; i++) WZ.cast('fireball'); o.f5 = G.wand.full.fire; WZ.cast('fireball'); o.f6 = G.wand.full.fire;
    // casting resets that meter to 0
    T.reset(); T.fill('air'); T.step(1, { act: { cast: true } });
    o.afterCast = [G.wand.m.air, G.wand.full.air, G.wand.armed];
    // a delivered spell (the real path: the drop-in, then the cast) charges it too
    T.reset(); WZ.incoming('gust'); T.step(30); o.viaDelivery = G.wand.m.air;
    return o;
  });
  ok(r.air7[0] === 7 && !r.air7[1] && r.air8[0] === 8 && r.air8[1] && r.air8[2] === 'air', '8 Gusts fill Air exactly on the 8th', JSON.stringify([r.air7, r.air8]));
  ok(r.flame[0] === 8 && r.flame[1] === 1 && r.flame[2], 'a Flamethrower ticks Air (slot full: lost) and Fire once each', JSON.stringify(r.flame));
  ok(r.earth4[0] === 4 && !r.earth4[1] && r.earth5[0] === 5 && r.earth5[1] && r.earth5[2] === 'earth', 'Earth fills at 5 (and arms itself)', JSON.stringify([r.earth4, r.earth5]));
  ok(r.earthLost[0] === 5 && r.earthLost[1], 'ticks landing on a full slot are lost', JSON.stringify(r.earthLost));
  ok(r.nova === '{"air":1,"water":1,"fire":1,"earth":1}', 'the Nova ticks all four, once each', r.nova);
  ok(r.thunder === '{"air":1,"water":1,"fire":1,"earth":0}', 'a Thunderstorm ticks its three elements', r.thunder);
  ok(!r.w6 && r.w7[0] && r.w7[1] === 7 && !r.f5 && r.f6, 'Water fills at 7, Fire at 6');
  ok(r.afterCast[0] === 0 && !r.afterCast[1] && r.afterCast[2] === null, 'casting spends the slot and resets that meter to 0', JSON.stringify(r.afterCast));
  ok(r.viaDelivery === 1, 'a spell used on delivery (drop-in, then cast) adds its tick', r.viaDelivery);

  // ================= 2. the four buttons on every scheme =================
  r = await run(() => {
    const W = __wands, G = W.G, Main = W.Main, o = {};
    const schemes = {
      solo: { ctl: { kbB: false, kbW: true, pb: -1, pw: -1 }, swapped: false, keys: { cycle: 'KeyQ', cast: 'MouseR', dodge: 'Space', mash: 'MouseL' } },
      soloAlt: { ctl: { kbB: false, kbW: true, pb: -1, pw: -1 }, swapped: false, keys: { cycle: 'KeyM', cast: 'Comma', dodge: 'Period', mash: 'Slash' } },
      duo: { ctl: { kbB: true, kbW: true, pb: -1, pw: -1 }, swapped: false, keys: { cycle: 'KeyM', cast: 'Comma', dodge: 'Period', mash: 'Slash' } },
      swap: { ctl: { kbB: true, kbW: true, pb: -1, pw: -1 }, swapped: true, keys: { cycle: 'KeyV', cast: 'KeyZ', dodge: 'Space', mash: 'KeyE' } },
      swapMouse: { ctl: { kbB: true, kbW: true, pb: -1, pw: -1 }, swapped: true, keys: { cycle: 'KeyV', cast: 'MouseR', dodge: 'Space', mash: 'MouseL' } },
      pad: { ctl: { kbB: true, kbW: false, pb: -1, pw: 1 }, swapped: false, keys: { cycle: 'padY', cast: 'padB', dodge: 'padA', mash: 'padX' } },
    };
    const keep = Object.assign({}, G.ctl), ks = G.swapped, pad = IN.pad[1];
    for (const name in schemes) {
      const S = schemes[name];
      o[name] = {};
      for (const act in S.keys) {
        G.ctl = Object.assign({}, S.ctl); G.swapped = S.swapped;
        IN.pressed.clear(); IN.mouse.lp = IN.mouse.rp = false; IN.pad[1] = name === 'pad' ? { ix: 0, iy: 0, rx: 0, ry: 0, cyc: 0, a: false, b: false, x: false, y: false, lb: false, rb: false, rt: false, l3: false, back: false } : null;
        const k = S.keys[act];
        if (k === 'MouseL') IN.mouse.lp = true; else if (k === 'MouseR') IN.mouse.rp = true;
        else if (k.startsWith('pad')) IN.pad[1][k.slice(3).toLowerCase()] = true;
        else IN.pressed.add(k);
        const c = Main.controls(0.016);
        o[name][act] = { roll: !!c.roll, mash: !!c.act.mash, cast: !!c.act.cast, cycle: !!c.act.cycle };
        IN.pressed.clear(); IN.mouse.lp = IN.mouse.rp = false;
      }
    }
    G.ctl = keep; G.swapped = ks; IN.pad[1] = pad;
    return o;
  });
  for (const name in r) {
    const exp = { cycle: 'cycle', cast: 'cast', dodge: 'roll', mash: 'mash' };
    let good = true; const bad = [];
    for (const act in r[name]) for (const f of ['roll', 'mash', 'cast', 'cycle']) { const want = exp[act] === f; if (r[name][act][f] !== want) { good = false; bad.push(act + '->' + f + '=' + r[name][act][f]); } }
    ok(good, 'buttons, scheme ' + name + ': each key does exactly its own action (Mash never dodges, Dodge never mashes)', bad.join(' '));
  }
  // the Builder keeps Q (family cycle) only when the keyboard has the Builder
  r = await run(() => {
    const W = __wands, G = W.G, Main = W.Main, o = {};
    const keep = Object.assign({}, G.ctl), sel = G.fam ? JSON.stringify(G.fam) : '';
    G.ctl = { kbB: false, kbW: true, pb: -1, pw: -1 }; G.swapped = false; IN.pressed.clear(); IN.pressed.add('KeyQ'); const a = JSON.stringify(G.fam); Main.controls(0.016); o.soloQ = JSON.stringify(G.fam) === a;
    G.ctl = keep; IN.pressed.clear();
    return o;
  });
  ok(r.soloQ, 'alone on the keyboard Q is the wand Cycle, not the Builder\'s family cycle');
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {}; T.clear(); T.reset();
    const act = a => { WZ.update(0.05, 0, 0, false, 0, 0, a); };
    act({ cast: true }); o.nothing = [G.wand.armed, G.w.fireT, G.w.invisT, G.w.statT, !!G.w.ride];   // nothing armed / full: Cast does nothing
    T.fill('air'); T.fill('earth'); o.armed1 = G.wand.armed;                                           // the freshly filled slot becomes armed
    act({ cycle: true }); o.armed2 = G.wand.armed;                                                       // cycle visits only the filled slots: earth -> air
    act({ cycle: true }); o.armed3 = G.wand.armed;
    act({ cycle: true }); o.armed4 = G.wand.armed;
    T.fill('fire'); o.armed5 = G.wand.armed;
    G.wand.armed = 'water'; act({ cast: true }); o.waterNotFull = [G.wand.full.air, G.wand.full.earth, G.wand.full.fire, G.w.invisT, G.w.fireT];   // armed but not full: nothing
    G.wand.armed = 'fire'; act({ cast: true }); o.fired = [G.wand.full.fire, G.wand.m.fire, G.w.fireT > 0, G.wand.armed];    // fire spent; the most recently filled one left (earth then air: air was filled first => earth)
    return o;
  });
  ok(r.nothing[0] === null && !r.nothing[1] && !r.nothing[2] && !r.nothing[3] && !r.nothing[4], 'Cast with nothing armed / full does nothing', JSON.stringify(r.nothing));
  ok(r.armed1 === 'earth', 'a freshly filled slot becomes armed', r.armed1);
  ok(r.armed2 === 'air' && r.armed3 === 'earth' && r.armed4 === 'air', 'Cycle only visits filled slots (air, earth, air, earth...)', [r.armed2, r.armed3, r.armed4].join(','));
  ok(r.waterNotFull[0] && r.waterNotFull[1] && r.waterNotFull[2] && !r.waterNotFull[3] && !r.waterNotFull[4], 'Cast fires only an armed, FULL slot (an armed empty slot does nothing)', JSON.stringify(r.waterNotFull));
  ok(!r.fired[0] && r.fired[1] === 0 && r.fired[2] && r.fired[3] === 'earth', 'Cast fires the armed slot; the most recently filled slot left is armed next', JSON.stringify(r.fired));

  // ================= 3. Flame Trail =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    o.laneOk = T.lane(1, 0, 24);
    const F = W.CFG.wand.fire, base = WZ.speed();
    T.fill('fire'); const x0 = w.x, y0 = w.y;
    const e = T.foe(0.6, 0);   // standing on the first segment, a little ahead of where he starts
    T.step(1, { act: { cast: true } });
    o.speedRatio = WZ.speed() / base; o.fireT0 = w.fireT;
    // run along +x for the rest of the 3 s (the stick (1, -1) is the world direction +x)
    for (let i = 0; i < 59; i++) T.step(1, { ix: 1, iy: 1 });   // the stick (1, 1) is the world direction +x
    const z = w.zones.find(q => q.kind === 'ftrail');
    o.zone = !!z; o.pts = z ? z.pts.length : 0; o.fireT1 = w.fireT; o.speedAfter = WZ.speed() / base;
    o.maxLife = z ? Math.max(...z.pts.map(p => p.a)) : 0;
    const zt = z;
    // an enemy that stood in the first segment for its whole life: how much has it lost by the time the trail has burnt out?
    let steps = 0; while (w.zones.some(q => q.kind === 'ftrail') && steps < 400) { T.step(1); steps++; }
    o.dealt = e.maxHp - e.hp; o.burnedOut = !w.zones.some(q => q.kind === 'ftrail'); o.lifeSecs = steps * 0.05;
    o.fireball = W.CFG.spells.fireball.dmg + W.CFG.spells.fireball.splash;
    return o;
  });
  ok(r.laneOk, 'test lane found');
  ok(Math.abs(r.speedRatio - 1.15) < 1e-6 && Math.abs(r.fireT0 - 2.95) < 0.06 && r.speedAfter === 1, 'Flame Trail: +15% speed for ~3 s', r.speedRatio.toFixed(3) + ' fireT after 1 step ' + r.fireT0.toFixed(2) + ', after 3 s ' + r.fireT1 + ', then x' + r.speedAfter);
  ok(r.zone && r.pts > 10 && r.maxLife <= 5.01, 'trail segments are laid while he runs and each lives at most ~5 s', 'segments live ' + r.pts + ', oldest ' + r.maxLife.toFixed(2) + ' s');
  ok(Math.abs(r.dealt - r.fireball / 2) / (r.fireball / 2) < 0.2, 'an enemy standing in a full trail takes about HALF a Fireball in total (a budget, not per second)', r.dealt.toFixed(2) + ' vs half of ' + r.fireball + ' = ' + (r.fireball / 2));
  ok(r.burnedOut && r.lifeSecs < 5.2, 'the trail is gone ~5 s after its last segment', 'trail left ' + r.lifeSecs.toFixed(1) + ' s after the run');

  // ================= 4. Vanishing Puff =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    o.laneOk = T.lane(1, 0, 12);
    const near = T.foe(2, 0), far = T.foe(-2.5, 1), out = T.foe(9, 0);
    const gust = W.CFG.spells.gust, gustTotal = gust.pulses * gust.dmg + gust.bonk;
    T.fill('air'); T.step(1, { act: { cast: true } });
    o.dmg = [near.maxHp - near.hp, far.maxHp - far.hp, out.maxHp - out.hp]; o.gustTotal = gustTotal;
    T.step(6);
    o.pushed = [Math.hypot(near.x - (w.x + 2), near.y - w.y), Math.hypot(far.x - (w.x - 2.5), far.y - (w.y + 1))];
    o.moved = [near.x - w.x, far.x - w.x];
    o.invis = w.invisT; o.inv0 = WZ.invisible();
    return o;
  });
  ok(Math.abs(r.dmg[0] - r.gustTotal / 2) / (r.gustTotal / 2) < 0.1 && r.dmg[1] > 0 && r.dmg[2] === 0, 'the puff hurts for ~half of Cyclone Gust and only inside its radius', 'dealt ' + r.dmg.map(x => x.toFixed(2)) + ' vs half of ' + r.gustTotal);
  ok(r.moved[0] > 2.6 && r.moved[1] < -3.1, 'the puff pushes foes away from him', 'now ' + r.moved.map(x => x.toFixed(1)) + ' tiles out (were 2 / -2.5)');
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    const e = T.foe(3, 0); e.spd = 3; e.dmg = 15; e.cd = 0; e.rad = 0.4;
    o.visible = WZ.foeTarget(e).mill === undefined;
    T.fill('air'); T.step(1, { act: { cast: true } });
    const t0 = w.invisT; o.t0 = t0;
    o.mill = !!WZ.foeTarget(e).mill;
    // 4 s unseen: nothing hostile targets him (no touch damage, even standing on him); an ally comes first
    e.x = w.x + 0.1; e.y = w.y; const hp0 = w.hp;
    T.step(20); o.touchLoss = hp0 - w.hp; o.stillInvis = w.invisT > 0;
    const a = WZ.spawnAlly('zephyr'); a.fall = 0; a.dazeT = 0; a.x = w.x + 3; a.y = w.y; e.x = w.x + 5; e.y = w.y;
    const tg = WZ.foeTarget(e); o.ally = !!(tg.a && tg.a === a); w.allies.length = 0;
    // a delivery during it does not break it
    const before = w.invisT; WZ.incoming('gust'); T.step(14); o.afterDelivery = [before > 0, w.invisT > 0];
    // area damage still hurts him
    const h = w.hp; WZ.strike(w.x, w.y, 3, 10, false); o.area = h - w.hp;
    // ...and mashing ends it at once
    T.step(1, { act: { mash: true } }); o.afterMash = w.invisT;
    // it also ends on its own after ~4 s
    T.fill('air'); T.step(1, { act: { cast: true } }); const s0 = w.invisT; let n = 0; while (w.invisT > 0 && n < 200) { T.step(1); n++; } o.secs = (n + 1) * 0.05; o.s0 = s0;
    // casting another wand attack ends it too
    T.fill('air'); T.step(1, { act: { cast: true } }); o.on = w.invisT > 0; T.fill('earth'); T.step(1, { act: { cast: true } }); o.afterCast = w.invisT; w.statT = 0;
    return o;
  });
  ok(r.visible && r.mill, 'while unseen a hostile with no ally near has no target (it mills about)', 'visible before: ' + r.visible + ', unseen: mill=' + r.mill);
  ok(r.touchLoss === 0 && r.stillInvis, 'a foe standing on him for 1 s does him no harm while he is unseen', 'lost ' + r.touchLoss);
  ok(r.ally, 'hostiles retarget to an ally if one exists');
  ok(r.afterDelivery[1], 'a delivery during invisibility does not break it');
  ok(r.area >= 9.9, 'area damage still hurts him', 'lost ' + r.area);
  ok(r.afterMash === 0, 'mashing ends it at once');
  ok(Math.abs(r.secs - 4) < 0.15, 'it lasts 4 seconds on its own', r.secs.toFixed(2) + ' s');
  ok(r.afterCast === 0, 'casting another wand attack ends it');

  // ================= 5. Riding Wave =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    o.laneOk = T.lane(1, 0, 14);
    const sp = W.CFG.spells.spray, tidal = sp.speed * sp.life;
    const x0 = w.x, y0 = w.y;
    const left = T.foe(3, 0.5), right = T.foe(5, -0.7), wide = T.foe(4, 3.2);
    T.fill('water'); T.step(1, { act: { cast: true }, rx: 0.7071, ry: 0.7071 });   // (the right stick pointing along +x: no auto-aim toward the nearest foe)
    o.rideOn = !!w.ride;
    let t = 0; while (w.ride && t < 40) { T.step(1); t++; }
    o.secs = (t + 1) * 0.05; o.dist = Math.hypot(w.x - x0, w.y - y0); o.tidal = tidal;
    o.left = [left.y - y0, left.maxHp - left.hp, left.x - x0]; o.right = [right.y - y0, right.maxHp - right.hp]; o.wide = [wide.y - y0, wide.maxHp - wide.hp];
    o.half = sp.dmg / 2;
    o.vx = w.vx;
    return o;
  });
  ok(r.laneOk && Math.abs(r.dist - r.tidal) < 0.8 && Math.abs(r.secs - 1) < 0.15, 'the ride covers about a Tidal Wave\'s distance in ~1 s', r.dist.toFixed(2) + ' tiles in ' + r.secs.toFixed(2) + ' s (Tidal Wave: ' + r.tidal + ')');
  ok(r.left[0] > 0.5 + 0.8 && r.right[0] < -0.7 - 0.8 && r.left[1] > 0 && r.left[1] <= r.half + 0.01 && r.right[1] <= r.half + 0.01 && r.wide[1] === 0, 'it parts foes to the SIDES (not carried along) for up to half of Tidal Wave\'s damage', 'sideways ' + r.left[0].toFixed(2) + ' / ' + r.right[0].toFixed(2) + ', dealt ' + r.left[1].toFixed(1) + ' / ' + r.right[1].toFixed(1) + ' (cap ' + r.half + '), the wide one untouched: ' + r.wide[1]);
  ok(r.left[2] < 4.5 && r.vx === 0, 'a foe is not carried forward with him; he stops when it ends', 'foe x ' + r.left[2].toFixed(2));
  r = await run(() => {   // a wall: stops dead
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    T.lane(1, 0, 14);
    const x0 = w.x, y0 = w.y, WW = W.CFG.WW;
    const wx = Math.floor(x0 + 5), i0 = Math.floor(y0) * WW + wx;
    for (let dy = -2; dy <= 2; dy++) { w.tmod[(Math.floor(y0) + dy) * WW + wx] = { k: 'wall', t: 1e9, dur: 1e9 }; w.tmodN++; }
    WZ.flowDirty();
    T.fill('water'); T.step(1, { act: { cast: true }, rx: 0.7071, ry: 0.7071 });
    let t = 0; while (w.ride && t < 40) { T.step(1); t++; }
    o.stop = w.x - x0; o.wall = wx - x0; o.stopped = !w.ride; o.v = [w.vx, w.vy]; o.t = (t + 1) * 0.05;
    return o;
  });
  ok(r.stopped && r.stop < r.wall && r.stop > r.wall - 1.2 && r.v[0] === 0, 'it stops dead at a wall', 'stopped ' + r.stop.toFixed(2) + ' tiles out, the wall face is at ' + r.wall.toFixed(2) + ', velocity ' + r.v + ', after ' + r.t.toFixed(2) + ' s');
  r = await run(() => {   // a water edge
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    // a pond edge with 8 dry tiles before it along +x
    let spot = null;
    for (let y = 20; y < 180 && !spot; y += 1) for (let x = 20; x < 190 && !spot; x += 1) {
      if (WZ.tile(x + 0.5, y + 0.5) !== T_POND) continue;
      let dry = true; for (let k = 1; k <= 10 && dry; k++) for (let l = -1; l <= 1; l++) if (WZ.blocked(x - k + 0.5, y + l + 0.5, 0.3) || WZ.harv.some(h => !h.broken && Math.hypot(h.x - (x - k), h.y - (y + l)) < 1.6)) dry = false;
      if (dry && WZ.wet(x + 0.5, y + 0.5)) spot = [x, y];
    }
    if (!spot) { o.noPond = true; return o; }
    w.x = spot[0] - 7; w.y = spot[1] + 0.5; w.vx = w.vy = 0; w.fx = 1; w.fy = 0;
    const x0 = w.x;
    T.fill('water'); T.step(1, { act: { cast: true }, rx: 0.7071, ry: 0.7071 });
    let t = 0; while (w.ride && t < 40) { T.step(1); t++; }
    o.stop = w.x - x0; o.edge = spot[0] - x0; o.stopped = !w.ride; o.wet = WZ.blocked(w.x, w.y, 0.3);
    return o;
  });
  ok(!r.noPond && r.stopped && r.stop < r.edge && r.stop > r.edge - 1.2 && !r.wet, 'it stops dead at a water edge', r.noPond ? 'no pond found' : 'stopped ' + r.stop.toFixed(2) + ' tiles out, the water starts at ' + r.edge.toFixed(2));

  // ================= 6. Statue =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    T.lane(1, 0, 10);
    const E = W.CFG.wand.earth, base = WZ.speed();
    const foes = [T.foe(2, 0), T.foe(-2, 0.5), T.foe(0, 2.2), T.foe(8, 0)];
    T.fill('earth'); T.step(1, { act: { cast: true } });
    o.speedRatio = WZ.speed() / base; o.statT = w.statT;
    o.rolls = (() => { w.rollCd = 0; T.step(1, { roll: true }); return w.roll > 0; })();
    // damage taken: 30%
    const hp0 = w.hp; WZ.damage(100); o.taken = (hp0 - w.hp) / 100;
    o.hits1 = w.statHits;
    // bursts: base (no more hits taken) vs after N hits
    return o;
  });
  ok(Math.abs(r.speedRatio - 0.8) < 1e-6 && Math.abs(r.statT - 3.95) < 0.06, 'Statue: -20% movement speed for 4 s', 'x' + r.speedRatio + ', ' + r.statT.toFixed(2) + ' s left after a step');
  ok(Math.abs(r.taken - 0.3) < 1e-6 && r.hits1 === 1, 'Statue: takes 30% of incoming damage and counts the hit', r.taken + ', hits ' + r.hits1);
  ok(!r.rolls, 'a statue does not roll');
  const burst = async hits => run((hits) => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    T.lane(1, 0, 10);
    const E = W.CFG.wand.earth;
    const near = T.foe(1.5, 0), far = T.foe(2.8, 0), out = T.foe(7, 0);
    T.fill('earth'); T.step(1, { act: { cast: true } });
    for (let i = 0; i < hits; i++) { w.hurtT = 0; WZ.damage(1); }
    const boulder = W.CFG.spells.boulder, total = boulder.hops * boulder.dmg;
    let t = 0; while (w.statT > 0 && t < 200) { T.step(1); t++; }
    T.step(1);
    o.hits = w.statHits; o.dealt = [near.maxHp - near.hp, far.maxHp - far.hp, out.maxHp - out.hp]; o.total = total; o.secs = (t + 1) * 0.05;
    o.push = [near.x - w.x, out.x - w.x]; o.k = 1 + Math.min(E.cap, hits * E.perHit);
    return o;
  }, hits);
  const b0 = await burst(0), b3 = await burst(3), b9 = await burst(9);
  ok(Math.abs(b0.secs - 4) < 0.2 && Math.abs(b0.dealt[0] - b0.total / 2) / (b0.total / 2) < 0.05 && b0.dealt[2] === 0 && b0.push[0] > 1.6, 'the burst deals its base (~half a Bouncing Boulder) with a pushback, after 4 s', 'base ' + b0.dealt[0].toFixed(1) + ' (half of ' + b0.total + '), foe pushed to ' + b0.push[0].toFixed(2) + ', ' + b0.secs.toFixed(2) + ' s');
  ok(b3.dealt[0] > b0.dealt[0] * 1.5 && Math.abs(b3.dealt[0] - b0.dealt[0] * b3.k) < 0.5, 'hits taken visibly grow the burst', '0 hits ' + b0.dealt[0].toFixed(1) + ', 3 hits ' + b3.dealt[0].toFixed(1));
  ok(Math.abs(b9.dealt[0] - b0.dealt[0] * 2) < 0.5 && b9.hits === 9, 'the charge is capped at +100% (double)', '9 hits: ' + b9.dealt[0].toFixed(1) + ' = ' + (b9.dealt[0] / b0.dealt[0]).toFixed(2) + 'x');
  await shot('wand-statue');

  // ================= 7. shrines =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    const m = WZ.marks.find(q => q.type === 'shrine');
    o.shrine = m ? m.el : null; if (!m) return o;
    const s = w.lm[m.id], M = W.CFG.marks, el = m.el;
    // claim it the old way: the Builder sends the three other Cores through the Spell Portal while the Wizard stands near it
    w.x = m.x + 1.2; w.y = m.y; w.vx = w.vy = 0;
    const others = ['air', 'water', 'fire', 'earth'].filter(e => e !== el);
    for (const e of others) { G.stock['core_' + e] = (G.stock['core_' + e] || 0) + 1; }
    T.step(2);
    for (const e of others) { W.FA.deliver('core_' + e); }
    T.step(120);
    o.claimed = s.state; o.wandAfterClaim = JSON.stringify(G.wand);
    // standing on a claimed shrine grants nothing
    const h = G.fac.bld.find(b => b.type === 'harness'); h.el = el;
    o.boost0 = W.FA.shrineBoost(h);
    T.step(100, {}); o.boostStand = W.FA.shrineBoost(h); o.shrinesStand = JSON.stringify(w.shrines);
    // wake it: press Mash (starts the game), then press when the ring is in the zone, three times
    const hit = () => { const sg = w.sg; if (!sg) return false; const dur = M.ring[Math.min(sg.n, M.ring.length - 1)], f = sg.k / dur; return sg.k >= 0 && f > (M.zone[0] + M.zone[1]) / 2 - 0.02 && f < (M.zone[0] + M.zone[1]) / 2 + 0.04; };
    T.step(1, { act: { mash: true } }); o.started = !!w.sg;
    // a miss first (too early), which restarts that ring only
    let guard = 0; while (w.sg && w.sg.k < 0.1 && guard++ < 100) T.step(1);
    const n0 = w.sg.n; T.step(1, { act: { mash: true } }); o.missRestarts = [w.sg.n === n0, w.sg.k < 0];
    guard = 0;
    while (w.sg && guard++ < 600) { if (hit()) T.step(1, { act: { mash: true } }); else T.step(1); }
    o.active = [s.buff > 0, w.sg === null, G.stats.shrineAct];
    o.boostOn = W.FA.shrineBoost(h);
    o.buffLeft = s.buff;
    // the buff applies wherever he goes
    w.x = m.x + 60; w.y = m.y + 10; T.step(2); o.boostFar = W.FA.shrineBoost(h);
    // 30 s later it ends, then a 120 s cooldown
    let t = 0; while (s.buff > 0 && t < 900) { T.step(1); t++; }
    o.buffSecs = s.buffSecsMeasured = (t + 2) * 0.05 + 0; o.cdAfter = s.cd; o.boostEnd = W.FA.shrineBoost(h);
    // back at the shrine: refused for 120 s while the refill climbs
    w.x = m.x + 1.2; w.y = m.y; w.vx = w.vy = 0;
    T.step(1, { act: { mash: true } }); o.refused = !w.sg;
    const cd0 = s.cd; T.step(200); o.cdFalls = cd0 - s.cd;
    const frac = 1 - s.cd / M.cdT; o.refill = frac;
    // zero wand charge from all of it
    o.wandEnd = JSON.stringify(G.wand);
    return o;
  });
  ok(r.shrine && r.claimed === 'done', 'claiming by 3 portal-sent Cores works as before', r.shrine + ' shrine -> ' + r.claimed);
  ok(r.boost0 === 1 && r.boostStand === 1 && r.shrinesStand === '{}', 'standing on a claimed shrine grants nothing', 'boost ' + r.boostStand);
  ok(r.started && r.missRestarts[0] && r.missRestarts[1], 'Mash at a ready shrine starts the ring game; a miss restarts that ring only', JSON.stringify(r.missRestarts));
  ok(r.active[0] && r.active[1] && r.active[2] === 1, '3 good rings activate the shrine', JSON.stringify(r.active));
  ok(Math.abs(r.boostOn - 1.25) < 1e-6 && Math.abs(r.boostFar - 1.25) < 1e-6, 'the +25% harnesser buff runs, and persists after he leaves', 'at the shrine x' + r.boostOn + ', 60 tiles away x' + r.boostFar);
  ok(r.buffLeft > 29.5 && Math.abs(r.buffSecs - 30) < 3.2 && r.boostEnd === 1 && r.cdAfter > 119, 'the buff lasts 30 s, then a 120 s cooldown starts', 'buff ' + r.buffLeft.toFixed(1) + ' at wake, ended after ~' + r.buffSecs.toFixed(1) + ' s, cooldown ' + r.cdAfter.toFixed(1));
  ok(r.refused && r.cdFalls > 9.5 && r.refill > 0.07 && r.refill < 0.12, 'reactivation is refused during the cooldown while the refill climbs', 'cooldown fell ' + r.cdFalls.toFixed(1) + ' s, refill ' + (r.refill * 100).toFixed(0) + '%');
  ok(r.wandAfterClaim === r.wandEnd && JSON.parse(r.wandEnd).m.air + JSON.parse(r.wandEnd).m.water + JSON.parse(r.wandEnd).m.fire + JSON.parse(r.wandEnd).m.earth === 0, 'a shrine grants zero wand charge (claim, wake, buff, cooldown)', r.wandEnd);
  r = await run(() => {   // the cooldown ends: ready again
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {};
    const m = WZ.marks.find(q => q.type === 'shrine' && w.lm[q.id].cd > 0), s = w.lm[m.id];
    s.cd = 0.4; T.step(20); o.ready = WZ.shrineReady(s);
    w.x = m.x + 1; w.y = m.y; T.step(1, { act: { mash: true } }); o.again = !!w.sg;
    // walking away cancels the game and consumes nothing
    w.x = m.x + 8; T.step(2); o.cancelled = [!w.sg, WZ.shrineReady(s)];
    return o;
  });
  ok(r.ready && r.again, 'when the cooldown is over the shrine is ready again');
  ok(r.cancelled[0] && r.cancelled[1], 'walking away mid-game cancels it and nothing is consumed');

  // ================= 8. the held-spell slot is gone =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear(); T.reset();
    G.flags.glow = true; G.flags.warden = true;
    o.hasHold = G.hold !== undefined; o.fns = [typeof WZ.hold, typeof WZ.fireHeld, typeof W.Main.holdKeyName];
    WZ.incoming('gust'); T.step(1); o.firedNow = w.fx_.some(f => f.type === 'drop');
    T.step(14); o.charged = G.wand.m.air;
    return o;
  });
  ok(!r.hasHold && r.fns.every(f => f === 'undefined') && r.firedNow && r.charged === 1, 'no spell can be held: a delivery always fires on arrival (even after the glow-up)', JSON.stringify(r));
  r = await run(() => {   // an old save with a held spell loads without error, and the spell is not lost
    const W = __wands, G = W.G, Main = W.Main, o = {};
    G.flags.glow = true;
    G.stock.magma = 0; G.stock.air = 0;
    Main.save();
    const key = 'wands2_save_slot' + G.slot, s = JSON.parse(localStorage.getItem(key));
    delete s.wand; s.hold = { on: true, spell: 'magma' };
    localStorage.setItem(key, JSON.stringify(s));
    try { Main.loadGame(1); o.load = 'loaded'; } catch (e) { o.load = 'ERR ' + e.message; }
    o.hold = W.G.hold; o.stockMagma = W.G.stock.magma; o.wand = JSON.stringify(W.G.wand); o.glow = !!W.G.flags.glow;
    // a held basic spell comes back as its packet; garbage is dropped
    s.hold = { on: true, spell: 'gust' }; localStorage.setItem(key, JSON.stringify(s)); const a0 = W.G.stock.air; Main.loadGame(1); o.air = W.G.stock.air - 0;
    s.hold = { on: true, spell: 'nonsense' }; s.wand = { m: { air: 99, water: -3, fire: 'x' }, full: { earth: true }, ord: ['earth', 'zzz'], armed: 'water' }; localStorage.setItem(key, JSON.stringify(s));
    try { Main.loadGame(1); o.garbage = JSON.stringify(W.G.wand); } catch (e) { o.garbage = 'ERR ' + e.message; }
    return o;
  });
  ok(r.load === 'loaded' && r.hold === undefined && r.stockMagma >= 1 && r.glow && JSON.parse(r.wand).armed === null, 'an old save holding a spell loads clean: the spell returns to the Stockpile, the glow-up stays', JSON.stringify([r.load, r.stockMagma, r.glow]));
  ok(!/ERR/.test(r.garbage) && JSON.parse(r.garbage).m.air === 8 && JSON.parse(r.garbage).full.earth && JSON.parse(r.garbage).full[JSON.parse(r.garbage).armed] && JSON.parse(r.garbage).m.water === 0 && JSON.parse(r.garbage).m.fire === 0, 'a damaged wand in a save is repaired on load', r.garbage);
  r = await run(() => {   // a wand in a save round-trips
    const W = __wands, G = W.G, o = {}; T.reset(); T.fill('fire'); G.wand.m.air = 3; W.Main.save(); const before = JSON.stringify(G.wand); W.G.wand = W.WZ.wandFresh(); W.Main.loadGame(1); o.same = JSON.stringify(W.G.wand) === before; o.wand = JSON.stringify(W.G.wand);
    return o;
  });
  ok(r.same, 'the wand (meters, ready slots, armed) survives a save and a load', r.wand);

  // ================= 9. a long session: the dev bot plays the Wizard through the real pad path, and the wand's buttons are pressed at random, spells arrive, events run =================
  // SOAK = seconds of game time (default 600 = the 10-minute session; SOAK=0 skips it). Every 100 steps the wand's invariants are checked; any page error fails the run.
  const soakSecs = process.env.SOAK === undefined ? 600 : +process.env.SOAK;
  if (soakSecs > 0) {
    const t0 = Date.now();
    r = await run(secs => {
      const W = __wands, WZ = W.WZ, o = { bad: [], deaths: 0, casts: 0, rings: 0, steps: 0 };
      W.CFG.world.cap = 25; for (const el of ['air', 'water', 'fire', 'earth']) W.CFG.harness[el].cycle = 3.5;
      T.clear(); T.reset(); W.G.w.hp = WZ.maxHp();
      W.bot('wizard');
      const drive = W.DevBot.drive; let n = 0, deadSteps = 0;
      W.DevBot.drive = function (dt) {   // the bot's own pad, plus random presses of the wand's buttons (y cycle, b cast, x mash, a dodge)
        drive.call(this, dt);
        const pad = IN.pad[W.G.ctl.pw];
        if (pad && ++n % 6 === 0) { const q = Math.random(); if (q < 0.18) pad.y = true; else if (q < 0.45) pad.b = true; else if (q < 0.6) pad.x = true; else if (q < 0.66) pad.a = true; if (pad.y || pad.b || pad.x || pad.a) pad.any = true; }
      };
      const spells = ['gust', 'fireball', 'spray', 'boulder', 'flamethrower', 'tempest', 'steam', 'sandstorm', 'magma', 'mud', 'meteor', 'thunder', 'blizzard', 'geyser', 'nova'];
      const shrines = WZ.marks.filter(q => q.type === 'shrine');
      const total = Math.round(secs / 0.05);
      for (let i = 0; i < total; i++) {
        const G = W.G, w = G.w;
        if (i % 30 === 0) { const sp = spells[Math.floor(Math.random() * spells.length)]; if (!w.dead) WZ.incoming(sp); }
        if (i % 1200 === 600) W.event(1 + Math.floor(i / 1200) % 6);
        if (i % 2400 === 1500 && !w.dead) { const m = shrines[Math.floor(i / 2400) % shrines.length]; w.lm[m.id].state = 'done'; w.lm[m.id].buff = 0; w.lm[m.id].cd = 0; w.x = m.x + 1.2; w.y = m.y + 0.4; }
        if (i % 3000 === 2000) { W.boss(); }
        W.step(0.05, 1);
        if (G.w.dead) { deadSteps++; if (deadSteps === 1) o.deaths++; if (deadSteps > 40) { deadSteps = 0; const b = document.getElementById('rRe'); if (b) b.click(); else WZ.reenter(); G.paused = false; if (G.w.dead) WZ.reenter(); G.w.hp = WZ.maxHp(); } } else deadSteps = 0;
        if (i % 100 === 0) {
          const g = G.wand, need = W.CFG.wand.need;
          for (const el of ['air', 'water', 'fire', 'earth']) { if (!(g.m[el] >= 0 && g.m[el] <= need[el]) || (g.full[el] && g.m[el] !== need[el]) || (!g.full[el] && g.m[el] >= need[el])) o.bad.push(['meter', i, el, g.m[el], g.full[el]]); }
          if (g.armed !== null && !g.full[g.armed]) o.bad.push(['armed', i, g.armed]);
          if (g.ord.some(e => !g.full[e]) || g.ord.length !== ['air', 'water', 'fire', 'earth'].filter(e => g.full[e]).length) o.bad.push(['ord', i, JSON.stringify(g)]);
          if (w.statT < 0 || w.invisT < 0 || w.fireT < 0 || !isFinite(w.x) || !isFinite(w.y) || !isFinite(w.hp)) o.bad.push(['clock', i]);
          if (w.ride && !(w.ride.t >= 0 && w.ride.t <= 1.2)) o.bad.push(['ride', i, w.ride.t]);
          if (w.sg && !(w.sg.n >= 0 && w.sg.n < 3)) o.bad.push(['sg', i]);
          if (i % 1000 === 0) W.Main.save();
        }
      }
      W.bot(null); W.DevBot.drive = drive;
      o.casts = W.G.stats.wands || 0; o.used = JSON.stringify(W.G.stats.wandUsed || {}); o.shrineAct = W.G.stats.shrineAct || 0; o.kills = W.G.stats.kills; o.time = W.G.stats.time;
      return o;
    }, soakSecs);
    ok(r.bad.length === 0, 'a ' + (soakSecs / 60).toFixed(0) + '-minute session with the bot, random wand presses, all 15 spells, events and bosses: the wand state stays legal', r.bad.slice(0, 5).map(x => x.join(':')).join(' | '));
    console.log('   soak: ' + r.casts + ' wand casts ' + r.used + ', ' + r.shrineAct + ' shrine wakes, ' + r.kills + ' kills, ' + r.deaths + ' deaths, ' + Math.round((Date.now() - t0) / 1000) + ' s wall clock');
    ok(r.casts > 20, 'the soak really used the wand', r.casts + ' casts');
  }

  // ================= 10. snapshot, errors =================
  r = await run(() => { const W = __wands, G = W.G; T.clear(); T.reset(); T.fill('earth'); G.w.statT = 2; G.w.statHits = 3; G.w.fireT = 1; G.w.invisT = 2; return W.snapshot ? 'ok' : 'none'; });
  await shot('wand-hud');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  if (errs.length) fails++;
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
