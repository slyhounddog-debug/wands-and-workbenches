'use strict';
// The ally acceptance run (Core-grown friendly creatures): grammar, rejections, targeting, half damage, caps, nothing pays on death, saves, snapshot.
//   node tools/allycheck/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves a screenshot). Exits 1 on any FAIL.
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
    for (const el of ['air', 'water', 'fire', 'earth']) W.CFG.harness[el].cycle = 1e9;   // the starter line stops feeding the Spawner
    window.T = {
      step: n => { for (let i = 0; i < n; i++) W.step(0.05, 1); },
      sp: () => W.G.fac.bld.find(b => b.type === 'spawner'),
      idle: () => {   // a clean, powered Spawner with nothing in it or on its belts
        const b = T.sp(); b.inv = {}; b.prog = 0; b.recipe = null; b.out.length = 0;
        for (const c of W.G.fac.grid) if (c && c.type === 'belt') c.item = null;
        for (const c of W.G.fac.bld) if (c.out && c !== b && c.type !== 'spawner') c.out.length = 0;
        return b;
      },
      clear: () => { const q = w(); q.enemies.length = 0; q.allies.length = 0; q.aq.length = 0; q.proj.length = 0; q.eproj.length = 0; q.aproj.length = 0; q.zones.length = 0; q.timers.length = 0; q.fx_.length = 0; q.drops.length = 0; q.hp = 99999; q.armor = 0; q.vx = q.vy = 0; W.G.fac.eggQ.length = 0; },
      foe: (type, dx, dy, hp = 50000) => { const q = w(), e = W.WZ.makeEnemy(type, q.x + dx, q.y + dy); e.hp = e.maxHp = hp; e.spd = type === 'slime' ? 1.2 : e.spd; return e; },
      ally: (id, dx, dy) => { const q = w(), a = W.WZ.spawnAlly(id); a.fall = 0; a.dazeT = 0; a.x = q.x + dx; a.y = q.y + dy; return a; },
    };
  });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = fn => page.evaluate(fn);

  // ================= 1. one Core -> the basic ally grows, ships, hatches 2-4 tiles from the Wizard =================
  let r = await run(() => {
    const W = __wands, w = W.G.w, o = {}; T.clear(); const b = T.idle(); W.G.stats.met = W.G.stats.met || {};
    o.can = W.FA.canInsert(b, 'core_earth');
    W.FA.insert(b, 'core_earth', true);
    o.recipe = b.recipe; o.inv = Object.keys(b.inv).filter(k => b.inv[k]);
    o.eggR = CFG.recipes[b.recipe].time;
    // run until the egg is made, rides the belts and the portal, and the ally hatches
    let seenEgg = false, spawnD = null, hp = null, steps = 0;
    for (; steps < 1400 && !spawnD; steps++) {
      T.step(1);
      if (b.out.length && /^aegg_/.test(b.out[0].kind)) seenEgg = true;
      const a = w.allies[0]; if (a && spawnD === null) { spawnD = Math.hypot(a.x - w.x, a.y - w.y); hp = [a.hp, a.maxHp, a.dmg]; }
    }
    o.seenEgg = seenEgg; o.spawnD = spawnD; o.hp = hp; o.secs = steps * 0.05;
    o.hostileCrafted = w.enemies.filter(e => e.crafted).length;
    o.allies = w.allies.map(a => [a.type, !!a.ally, !!a.crafted, !!a.elite, !!a.mut]);
    T.step(30);
    o.flow = { stats_eggs: W.G.stats.eggs || 0 };
    return o;
  });
  ok(r.can && r.recipe === 'aegg_pebble' && r.inv.join() === 'core_earth', 'one Stone Core at an idle Spawner starts a Pebble Golem ally', r.recipe + ' from ' + r.inv);
  ok(r.seenEgg, 'the finished egg is the teal ally egg (aegg_pebble)', r.secs.toFixed(0) + 's of play to hatch');
  ok(r.spawnD !== null && r.spawnD >= 1.9 && r.spawnD <= 4.1, 'it hatches 2-4 tiles from the Wizard', r.spawnD && r.spawnD.toFixed(2));
  ok(r.hp && r.hp[1] >= 2 * 42 * 0.85 - 0.1 && r.hp[1] <= 2 * 42 * 1.15 + 0.1, 'with double the hostile Pebble Golem\'s health (42 x2 +-15%)', r.hp && r.hp[1].toFixed(1));
  ok(r.hp && r.hp[2] >= 9 * 0.5 * 0.85 - 0.01 && r.hp[2] <= 9 * 0.5 * 1.15 + 0.01, 'and half its damage (9 x0.5 +-15%)', r.hp && r.hp[2].toFixed(2));
  ok(r.allies.length === 1 && r.allies[0][1] === true && r.allies[0][2] === false && r.allies[0][3] === false && r.allies[0][4] === false && r.hostileCrafted === 0, 'it is an ally, not elite, not mutated, and no hostile was made', JSON.stringify(r.allies));

  // ================= 2. the grammar: upgrade to pair then triple, the timer extends, rejections boing back =================
  r = await run(() => {
    const W = __wands, w = W.G.w, o = {}; T.clear(); const b = T.idle(), FA = W.FA;
    const R = () => CFG.recipes[b.recipe], left = () => +(R().time - b.prog).toFixed(1);
    o.can = [FA.canInsert(b, 'core_air')]; FA.insert(b, 'core_air', true);
    o.rec1 = [b.recipe, R().time, left()];
    T.step(160);   // 8 s into a 10 s wisp
    o.mid = [+b.prog.toFixed(1), left()];
    o.dupAir = FA.canInsert(b, 'core_air');
    o.airEarth = FA.canInsert(b, 'core_earth');   // Air + Earth: no creature
    o.pkt = FA.canInsert(b, 'air'); o.seed = FA.canInsert(b, 'flamethrower');   // packets / seed spells during an ally grow
    const before = JSON.stringify([b.inv, b.recipe]);
    FA.insert(b, 'core_fire', true);   // pair: Air + Fire = Cinder Phoenix
    o.rec2 = [b.recipe, R().time, left(), +b.prog.toFixed(1)];
    W.G.stats.made = {};
    o.tripleNoParents = FA.canInsert(b, 'core_earth');   // the triple needs its parent pairs made, like the hostile one
    W.G.stats.made = { flamethrower: 1, magma: 1, tempest: 1 };
    o.tripleOk = FA.canInsert(b, 'core_earth') && FA.canInsert(b, 'core_water');
    T.step(100);
    o.leftBeforeTriple = left();
    FA.insert(b, 'core_earth', true);   // triple: Air + Fire + Earth = Ember Dragon
    o.rec3 = [b.recipe, R().time, left(), +b.prog.toFixed(1)];
    o.fourth = FA.canInsert(b, 'core_water') || FA.canInsert(b, 'core_fire') || FA.canInsert(b, 'core_air') || FA.canInsert(b, 'core_earth');
    o.inv = Object.keys(b.inv).filter(k => b.inv[k]).sort().join();
    // creatureless combos
    const combo = (a, c, d) => { T.idle(); FA.insert(b, 'core_' + a, true); let ok2 = FA.canInsert(b, 'core_' + c); if (d) { if (FA.canInsert(b, 'core_' + c)) { FA.insert(b, 'core_' + c, true); ok2 = FA.canInsert(b, 'core_' + d); } } return ok2; };
    o.fireWater = combo('fire', 'water'); o.airEarthB = combo('air', 'earth'); o.airWaterEarth = combo('air', 'water', 'earth');
    // a hostile grow never takes a Core
    T.idle(); FA.insert(b, 'air', true); o.hostileRec = b.recipe; o.coreDuringHostile = FA.canInsert(b, 'core_fire') || FA.canInsert(b, 'core_air');
    return o;
  });
  ok(r.rec1[0] === 'aegg_zephyr' && r.rec1[2] === 10, 'a Gale Core starts a Zephyr Wisp ally (10 s)', JSON.stringify(r.rec1));
  ok(r.dupAir === false && r.airEarth === false && r.pkt === false && r.seed === false, 'a duplicate element, Air+Earth, a packet and a seed spell are all refused mid-ally-grow', JSON.stringify([r.dupAir, r.airEarth, r.pkt, r.seed]));
  ok(r.rec2[0] === 'aegg_phoenix' && r.rec2[2] >= 12 && r.rec2[1] > r.rec1[1], 'a second Core makes it a Cinder Phoenix and the timer extends (>= 12 s left, was ' + r.mid[1] + ')', JSON.stringify(r.rec2));
  ok(r.tripleNoParents === false && r.tripleOk === true, 'the triple is refused until its parent pairs have been made, then both triples are allowed');
  ok(r.rec3[0] === 'aegg_dragon' && r.rec3[2] >= 12 && r.rec3[1] > r.rec2[1], 'a third Core makes it an Ember Dragon and the timer extends again', JSON.stringify(r.rec3) + ' (' + r.leftBeforeTriple + ' s were left before)');
  ok(r.fourth === false && r.inv === 'core_air,core_earth,core_fire', 'a fourth Core is refused; the three stay inside', r.inv);
  ok(r.fireWater === false && r.airEarthB === false && r.airWaterEarth === false, 'Fire+Water, Air+Earth and Air+Water+Earth are refused');
  ok(r.hostileRec === 'egg_zephyr' && r.coreDuringHostile === false, 'a Core thrown while a hostile grows is refused', r.hostileRec);
  // real throws: refused Cores bounce back with nothing consumed
  r = await run(() => {
    const W = __wands, w = W.G.w, o = {}; T.clear(); const b = T.idle(), FA = W.FA, G = W.G;
    FA.insert(b, 'core_air', true);
    const snap = JSON.stringify([b.inv, b.recipe, Math.round(b.prog)]);
    G.stock.core_air = 0; G.hands.length = 0; FA.addHands('core_air', 1);
    G.bd.x = b.x + 0.5 - 2.5; G.bd.y = b.y + 0.5;
    FA.throwOne(b.x + 0.5, b.y + 0.5, 0);
    T.step(30);
    o.same = JSON.stringify([b.inv, b.recipe]) === JSON.stringify([JSON.parse(snap)[0], JSON.parse(snap)[1]]);
    o.exists = FA.exists('core_air') ? 1 : 0;
    o.inFlightOrFloor = G.fac.floor.filter(f => f.kind === 'core_air').length + G.fac.flying.filter(f => f.kind === 'core_air').length + G.hands.filter(h => h.kind === 'core_air').length;
    // and a valid Core thrown is taken
    G.hands.length = 0; FA.addHands('core_fire', 1); FA.throwOne(b.x + 0.5, b.y + 0.5, 0); T.step(30);
    o.accepted = b.inv.core_fire === 1 && b.recipe === 'aegg_phoenix';
    return o;
  });
  ok(r.same && r.inFlightOrFloor === 1, 'a thrown duplicate Core boings back (item still exists, Spawner untouched)', JSON.stringify(r));
  ok(r.accepted, 'a thrown valid Core is absorbed (Phoenix ally)');

  // ================= 3. hostiles go for the ally first (Warden, Chimera too) =================
  r = await run(() => {
    const W = __wands, w = W.G.w, o = {}; T.clear();
    const a = T.ally('pebble', 7, 0); a.hp = a.maxHp = 5000;
    const f1 = T.foe('slime', 11, 1), f2 = T.foe('imp', 12, -1), f3 = T.foe('golem', 10, 2);
    o.targets = [f1, f2, f3].map(e => W.WZ.foeTarget(e).a === a);
    const wiz0 = w.hp; T.step(60);
    o.wizHp = [wiz0, w.hp]; o.allyHp = [5000, Math.round(a.hp)];
    // the Warden: slams and orbs go to the ally
    T.clear(); const a2 = T.ally('lavagolem', 24, 0); a2.hp = a2.maxHp = 5000;
    const wd = W.WZ.makeEnemy('warden', w.x + 28, w.y); const K = CFG.strong.warden;
    wd.elite = true; wd.guard = true; wd.warden = true; wd.ai = 'warden'; wd.sz = 1.05; wd.weak = 'water'; wd.resist = null; wd.weakCol = '#7ad0ff'; wd.hp = wd.maxHp = 90000;
    wd.slam = { every: K.slamEvery, r: K.slamR, dmg: K.slamDmg }; wd.slamT = 0.3; wd.vol = { t: 1, every: K.volleyEvery, n: K.volleyN, dmg: K.volleyDmg };
    const wh = w.hp, ah = a2.hp; o.wardenTarget = W.WZ.foeTarget(wd).a === a2; T.step(80);
    o.warden = { wiz: [wh, w.hp], ally: [Math.round(ah), Math.round(a2.hp)] };
    // the Chimera
    T.clear(); const a3 = T.ally('pebble', 24, 0); a3.hp = a3.maxHp = 5000;
    W.WZ.summonBoss(w.x + 28, w.y); const ch = w.boss; ch.hp = ch.maxHp = 400000; a3.x = ch.x - 4; a3.y = ch.y + 0.5; a3.spd = 0.001;
    const wh3 = w.hp, ah3 = a3.hp; o.bossTarget = W.WZ.foeTarget(ch).a === a3; T.step(120);
    o.boss = { wiz: [wh3, w.hp], ally: [Math.round(ah3), Math.round(a3.hp)] };
    // the ally falls: targeting returns to the Wizard
    W.WZ.hurtAlly(a3, 1e9, 0, 0); T.step(2);
    o.afterDeath = W.WZ.foeTarget(ch).a === null && w.allies.length === 0;
    w.enemies.forEach(e => { e.dead = true; }); w.proj.length = 0;
    return o;
  });
  ok(r.targets.every(Boolean), 'a Slime, an Imp and a Golem within aggro range all pick the ally over the Wizard', JSON.stringify(r.targets));
  ok(r.wizHp[0] === r.wizHp[1] && r.allyHp[1] < 5000, 'and only the ally takes damage (the Wizard is untouched)', JSON.stringify([r.wizHp, r.allyHp]));
  ok(r.wardenTarget && r.warden.wiz[0] === r.warden.wiz[1] && r.warden.ally[1] < r.warden.ally[0], 'the Warden attacks the ally first (slam + orbs), the Wizard untouched', JSON.stringify(r.warden));
  ok(r.bossTarget && r.boss.wiz[0] === r.boss.wiz[1] && r.boss.ally[1] < r.boss.ally[0], 'the Chimera attacks the ally first, the Wizard untouched', JSON.stringify(r.boss));
  ok(r.afterDeath, 'with the ally dead, the Chimera targets the Wizard again');

  // ================= 4. half damage, and the Wizard's spells pass through =================
  r = await run(() => {
    const W = __wands, w = W.G.w, o = {}; T.clear();
    // an allied Imp's ember vs a hostile Imp's ember
    const ai = T.ally('cinder', 3, 0); T.foe('slime', 9, 0);
    for (let i = 0; i < 40 && !w.aproj.length; i++) T.step(1);
    o.allyShot = w.aproj[0] ? w.aproj[0].dmg : null; o.allyFlag = w.aproj[0] ? w.aproj[0].ally : null;
    T.clear(); const hi = T.foe('cinder', 6, 0); hi.ai = 'imp'; hi.crafted = true;
    for (let i = 0; i < 60 && !w.eproj.length; i++) T.step(1);
    o.hostShot = w.eproj[0] ? w.eproj[0].dmg : null;
    o.def = CFG.creatures.cinder.shot.dmg;
    // the Wizard's spells: explosions, a Nova, a boulder
    T.clear(); const a = T.ally('pebble', 3, 0), a2 = T.ally('puddle', 3.5, 1); T.foe('slime', 4, 0).dmg = 0;
    const h = [a.hp, a2.hp];
    W.WZ.cast('nova'); W.WZ.cast('boulder'); W.WZ.cast('geyser'); W.WZ.cast('meteor'); W.WZ.cast('thunder'); T.step(100); W.WZ.ctx = { spell: 'x', el: ['fire'], hits: 0, kills: 0, weak: 0 }; W.WZ.explode(w.x + 3, w.y, 6, 9999, '#fff'); W.WZ.ctx = null;
    o.spellHp = [h, [a.hp, a2.hp]]; o.spellAlive = w.allies.length;
    // an ally never hurts the Wizard or another ally: its shots and strikes pass them
    T.clear(); const sh = T.ally('cinder', 3, 0); const ally2 = T.ally('pebble', 1.5, 0); T.foe('slime', 9, 0).dmg = 0;
    const wh = w.hp, ah2 = ally2.hp; T.step(100);
    o.friendly = { wiz: [wh, w.hp], other: [Math.round(ah2), Math.round(ally2.hp)], shooter: Math.round(sh.hp) };
    return o;
  });
  ok(r.allyShot !== null && Math.abs(r.allyShot - r.def * 0.5) < 1e-9 && r.allyFlag === true && r.hostShot !== null && Math.abs(r.hostShot - r.def) < 1e-9, 'an allied Imp\'s ember does exactly half a hostile Imp\'s', 'ally ' + r.allyShot + ' vs hostile ' + r.hostShot + ' (def ' + r.def + ')');
  ok(r.spellHp[0][0] === r.spellHp[1][0] && r.spellHp[0][1] === r.spellHp[1][1] && r.spellAlive === 2, 'a Nova, a Boulder, a Geyser, a Meteor, a Thunderstorm and a 9999 explosion pass through allies harmlessly', JSON.stringify(r.spellHp));
  ok(r.friendly.wiz[0] === r.friendly.wiz[1] && r.friendly.other[0] === r.friendly.other[1], 'allies never damage the Wizard or each other', JSON.stringify(r.friendly));

  // ================= 5. the cap: 10 alive + 3 queued, then the portal boings back =================
  r = await run(() => {
    const W = __wands, w = W.G.w, FA = W.FA, o = {}; T.clear();
    const portal = { which: 'spell' };
    // 10 alive
    for (let i = 0; i < 10; i++) T.ally('pebble', 1 + (i % 5), 1 + Math.floor(i / 5));
    o.alive = W.WZ.allyAlive();
    o.take = []; for (let i = 0; i < 4; i++) { o.take.push(FA.portalTakes(portal, 'aegg_pebble')); if (o.take[i]) FA.deliver('aegg_pebble'); }
    T.step(120);
    o.queued = w.aq.length; o.aliveAfter = W.WZ.allyAlive();
    o.takeFull = FA.portalTakes(portal, 'aegg_pebble') || FA.portalTakes(portal, 'aegg_zephyr');
    // a real throw at the portal is boinged back
    W.G.hands.length = 0; FA.addHands('aegg_zephyr', 1);
    const pt = FA.portal('spell'); W.G.bd.x = pt.x - 2; W.G.bd.y = pt.y + 0.5;
    FA.throwOne(pt.x + 0.5, pt.y + 0.5, 0); T.step(40);
    o.delivered = W.G.stats.sent.aegg_zephyr || 0; o.queuedAfterThrow = w.aq.length;
    o.exists = FA.exists('aegg_zephyr');
    // killing an ally lets a queued egg hatch
    const a = w.allies[0]; W.WZ.hurtAlly(a, 1e9, 0, 0); T.step(40);
    o.aliveAfterKill = W.WZ.allyAlive(); o.queuedAfterKill = w.aq.length;
    return o;
  });
  ok(r.alive === 10 && r.take.join() === 'true,true,true,false', '10 alive: the portal accepts 3 queued eggs and boings the 4th back', r.take.join());
  ok(r.queued === 3 && r.aliveAfter === 10, 'three eggs wait in the queue, still 10 alive', r.queued + ' queued, ' + r.aliveAfter + ' alive');
  ok(r.takeFull === false && r.delivered === 0 && r.exists && r.queuedAfterThrow === 3, 'a real throw of the next egg at the portal bounces: nothing entered, nothing deleted', JSON.stringify([r.delivered, r.exists, r.queuedAfterThrow]));
  ok(r.aliveAfterKill === 10 && r.queuedAfterKill === 2, 'killing one ally lets a queued egg hatch (10 alive again, 2 queued)', r.aliveAfterKill + ' / ' + r.queuedAfterKill);
  // a multi-creature egg hatches only what fits
  r = await run(() => {
    const W = __wands, w = W.G.w, FA = W.FA, o = {}; T.clear();
    for (let i = 0; i < 9; i++) T.ally('pebble', 1 + (i % 5), 1 + Math.floor(i / 5));
    FA.deliver('aegg_zephyr'); T.step(60);   // a Zephyr egg is 3 creatures: 1 fits
    o.alive = W.WZ.allyAlive(); o.left = w.aq.map(e => e.left);
    W.WZ.hurtAlly(w.allies[0], 1e9, 0, 0); T.step(40);
    o.alive2 = W.WZ.allyAlive(); o.left2 = w.aq.map(e => e.left);
    return o;
  });
  ok(r.alive === 10 && r.left[0] === 2, 'with 9 alive a 3-creature egg hatches only the one that fits; two wait', JSON.stringify(r));
  ok(r.alive2 === 10 && r.left2[0] === 1, 'room opens: the next of its creatures hatches', JSON.stringify([r.alive2, r.left2]));

  // ================= 6. nothing pays when an ally dies =================
  r = await run(() => {
    const W = __wands, w = W.G.w, FA = W.FA, G = W.G, o = {}; T.clear();
    const state = () => ({ drops: w.drops.length, xp: G.xp, kills: G.stats.kills, ck: G.stats.craftedKills || 0, fly: G.fac.flying.length, stock: Object.keys(G.stock).reduce((s, k) => s + G.stock[k], 0), ev: w.evKills || 0, k2: G.stats.k2 || 0, elites: G.stats.elites || 0, shards: G.stats.shards || 0, eventsDone: G.stats.events || 0 });
    const s0 = state(), outs = [];
    const mk = id => T.ally(id, 4, 0);
    // (a) a hostile touching it
    let a = mk('pebble'); a.hp = 1; const f = T.foe('slime', 4.2, 0, 99999); f.dmg = 9999; f.cd = 0; T.step(30); outs.push(['touch', a.dead || !w.allies.includes(a)]);
    // (b) a hostile projectile
    T.clear(); a = mk('puddle'); a.hp = 1; w.eproj.push({ x: a.x - 1, y: a.y, vx: 8, vy: 0, life: 2, dmg: 9999, col: '#fff', size: 5 }); T.step(20); outs.push(['orb', !w.allies.includes(a)]);
    // (c) a strike (volatile / slam)
    T.clear(); a = mk('cinder'); a.hp = 1; W.WZ.strike(a.x, a.y, 3, 9999); outs.push(['strike', a.dead]);
    // (d) a hostile zone (lava trail / mud / splash)
    T.clear(); a = mk('golem' in CFG.creatures ? 'pebble' : 'pebble'); a.hp = 5; W.WZ.zone({ x: a.x, y: a.y, r: 3, t: 2, dps: 9999, hostile: true, col: '#f00' }); T.step(30); outs.push(['zone', !w.allies.includes(a)]);
    // (e) a steam burst
    T.clear(); a = mk('puddle'); a.hp = 1; const h = T.foe('slime', 6, 0); W.WZ.steamBurst({ x: a.x, y: a.y, ally: false }, { r: 3, dmg: 9999, slow: 0.5, slowT: 1 }); outs.push(['steam', a.dead]);
    // (f) a phoenix ally is reborn once, then dies
    T.clear(); a = mk('phoenix'); a.hp = 1; W.WZ.hurtAlly(a, 5, 0, 0); outs.push(['rebirth', w.allies.includes(a) && a.reborn === true]); W.WZ.hurtAlly(a, 1e9, 0, 0); outs.push(['phoenix-dies', a.dead]);
    // (g) its own death effects stay on its side: a slime ally's splash slows hostiles only
    T.clear(); a = mk('puddle'); W.WZ.hurtAlly(a, 1e9, 0, 0); outs.push(['splash-is-ally', w.zones.some(z => z.ally && !z.hostile)]);
    T.step(10);
    o.outs = outs; o.s0 = s0; o.s1 = state();
    return o;
  });
  console.log('   ', JSON.stringify(r.outs));
  ok(r.outs.every(x => x[1]), 'an ally dies to every kind of hostile damage (touch, orb, strike, zone, steam burst); a Phoenix ally is reborn once; its splash is on its side');
  ok(JSON.stringify(r.s0) === JSON.stringify(r.s1), 'and none of it paid: no drops, XP, kills, crafted kills, Cores / packets / shards, event progress', JSON.stringify(r.s1));

  // ================= 7. hostile production unchanged; saves; snapshot =================
  r = await run(() => {
    const W = __wands, w = W.G.w, FA = W.FA, G = W.G, o = {}; T.clear();
    const b = T.idle();
    o.hostile = [FA.canInsert(b, 'air'), FA.canInsert(b, 'flamethrower'), FA.canInsert(b, 'steam'), FA.canInsert(b, 'sandstorm'), FA.canInsert(b, 'blizzard'), FA.canInsert(b, 'wood')];
    FA.insert(b, 'fire', true); o.rec = b.recipe; o.hostileNo = [FA.canInsert(b, 'air'), FA.canInsert(b, 'core_fire')];
    T.idle(); FA.insert(b, 'flamethrower', true); o.seedRec = b.recipe;
    // hostile eggs still hatch hostile crafted creatures with the usual numbers
    T.clear(); FA.deliver('egg_pebble'); T.step(80);
    const h = w.enemies.filter(e => e.crafted); o.hostileHatch = h.length; o.hostileHp = h[0] ? h[0].maxHp : null;
    o.eggStat = G.stats.eggs;
    // allies + a queue present, then a save and a load
    T.clear(); T.ally('pebble', 2, 2); w.aq.push({ k: 'aegg_zephyr', left: 2 });
    const Main = W.Main; Main.save();
    try { Main.loadGame(1); o.load = 'loaded'; } catch (e) { o.load = 'ERR ' + e.message; }
    o.afterLoad = { allies: W.G.w.allies.length, aq: W.G.w.aq.length };
    return o;
  });
  ok(JSON.stringify(r.hostile) === JSON.stringify([true, true, false, false, false, false]), 'hostile inputs unchanged: packets and seed spells in; steam, sandstorm, blizzard, wood refused', JSON.stringify(r.hostile));
  ok(r.rec === 'egg_cinder' && r.hostileNo[0] === false && r.hostileNo[1] === false && r.seedRec === 'egg_phoenix', 'a hostile grow takes nothing more (no packet, no Core); a seed spell still makes the pair egg');
  ok(r.hostileHatch >= 1 && r.hostileHp > 0 && r.hostileHp < 42 * 1.3 * 3.1,   // (x3.1: a crafted creature is an elite 5% of the time)
     'hostile eggs still hatch hostile crafted creatures with their normal health', JSON.stringify([r.hostileHatch, r.hostileHp]));
  ok(r.load === 'loaded' && r.afterLoad.allies === 0 && r.afterLoad.aq === 0, 'a save with allies and a queue loads fine; allies are run state and start fresh', JSON.stringify(r.afterLoad));
  await page.evaluate(() => { __wands.G.paused = false; });
  await page.evaluate(() => { T.clear(); const a = T.ally('lavagolem', 3, 1), b = T.ally('zephyr', -2, 2); T.ally('cinder', 4, -2); T.foe('slime', 7, 0, 5000); T.foe('imp', 8, 3, 5000); __wands.G.w.aq.push({ k: 'aegg_titan', left: 1 }); T.step(40); });
  const snap = await page.evaluate(() => { __wands.snapshot(); const R = __wands.Snap.report; return { v: R.verdict, newLeaks: R.leaks.filter(l => !l.known).map(l => l.id), issues: (R.issues || []).filter(l => !l.known).map(l => l.id || l), diff: R.diff }; });
  ok(snap.v === 'KNOWN' || snap.v === 'PASS', 'the snapshot photo test passes with allies, ally shots and a queue in the world', JSON.stringify(snap));
  if (OUT) await page.screenshot({ path: OUT + '/ally.png', clip: { x: 640, y: 80, width: 640, height: 500 } });
  console.log('ERRORS', errs.length ? errs.slice(0, 6) : 'none');
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exitCode = fails ? 1 : 0;
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
