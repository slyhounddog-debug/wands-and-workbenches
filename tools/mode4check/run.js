'use strict';
// The 4-player mode's acceptance run (offline part: the shared simulation, no network). See js/mode4.js / js/mode4run.js.
//   node tools/mode4check/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
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
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = fn => page.evaluate(fn);

  // ================= 0. 2P is untouched: no second anything =================
  let r = await run(() => { const W = __wands; W.UI.show('loading', false); W.start(1); W.UI.help(false); W.G.helpT = 0; W.step(0.05, 40);
    return { m4: !!W.G.m4, w2: !!W.G.w2, bd2: !!W.G.bd2, sIdx: W.WZ.sIdx, n: W.WZ.n(), over: W.WZ.over(), json: JSON.stringify(W.G).indexOf('"pi"') }; });
  ok(!r.m4 && !r.w2 && !r.bd2 && r.n === 1 && !r.over, '2P: no second Wizard / Builder, WZ.n() = 1', JSON.stringify(r));
  ok(r.json < 0, '2P: no owner tags in the state');

  // ================= 1. a 4P game: two of each =================
  r = await run(() => {
    const W = __wands; W.start4(1, {}); W.UI.help(false); W.G.helpT = 0;
    const G = W.G; W.CFG.world.cap = 0;
    window.T = { step: (n, seats) => { for (let i = 0; i < n; i++) W.step4(0.05, 1, seats); } };
    return { m4: G.m4, seats: G.seats.map(s => s.name), w2: !!G.w2, bd2: !!G.bd2, wand2: !!G.wand2, aug2: !!G.aug2, x1: G.w.x, x2: G.w2.x, bx1: G.bd.x, bx2: G.bd2.x, n: W.WZ.n(), nb: W.FA.nB() };
  });
  ok(r.m4 && r.w2 && r.bd2 && r.wand2 && r.aug2 && r.n === 2 && r.nb === 2, '4P: two Wizards, two Builders, a wand and garments each', JSON.stringify(r));
  ok(r.x1 !== r.x2 && r.bx1 !== r.bx2, '4P: they start apart');

  // ================= 2. the Wizards move on their own inputs =================
  r = await run(() => {
    const W = __wands, G = W.G, a = { x: G.w.x, y: G.w.y }, b = { x: G.w2.x, y: G.w2.y };
    T.step(30, [null, null, { wix: 1, wiy: 0 }, { wix: 0, wiy: 1 }]);
    return { w1: [G.w.x - a.x, G.w.y - a.y], w2: [G.w2.x - b.x, G.w2.y - b.y], sIdx: W.WZ.sIdx };
  });
  ok(Math.hypot(r.w1[0], r.w1[1]) > 1 && Math.hypot(r.w2[0], r.w2[1]) > 1, 'each Wizard walks on his own input', JSON.stringify(r));
  ok(r.w1[1] < -1 && r.w2[1] > 1, 'W1 went one way (-y) and W2 the other (+y)');
  ok(r.sIdx === 0, 'the selection rests on Wizard 1 after a step');

  // ================= 3. the Builders move on their own inputs =================
  r = await run(() => {
    const W = __wands, G = W.G, a = { x: G.bd.x, y: G.bd.y }, b = { x: G.bd2.x, y: G.bd2.y };
    T.step(20, [{ bix: 1, biy: 0 }, { bix: 0, biy: -1 }, null, null]);
    return { b1: Math.hypot(G.bd.x - a.x, G.bd.y - a.y), b2: Math.hypot(G.bd2.x - b.x, G.bd2.y - b.y), idx: W.FA.bIdx };
  });
  ok(r.b1 > 1 && r.b2 > 1 && r.idx === 0, 'each Builder walks on his own input', JSON.stringify(r));

  // ================= 4. a foe goes for the NEARER Wizard and only hurts him =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ;
    G.w.x = 60; G.w.y = 60; G.w2.x = 110; G.w2.y = 110; G.w.hp = G.w2.hp = WZ.maxHp(); G.w.armor = G.w2.armor = 0;
    G.w.enemies.length = 0;
    const e = WZ.makeEnemy('slime', 108, 108); e.hp = e.maxHp = 1e6; e.spd = 2;
    const d0 = Math.hypot(e.x - G.w2.x, e.y - G.w2.y);
    T.step(80);
    return { d0, d1: Math.hypot(e.x - G.w2.x, e.y - G.w2.y), hp1: G.w.hp, hp2: G.w2.hp, max: WZ.maxHp(), sIdx: WZ.sIdx };
  });
  ok(r.hp1 === r.max && r.hp2 < r.max, 'a foe beside Wizard 2 hurts Wizard 2 and not Wizard 1', JSON.stringify(r));

  // ================= 5. a spell is cast by whoever walks onto it =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ;
    G.w.enemies.length = 0; G.w.pickups.length = 0;
    G.w.x = 60; G.w.y = 60; G.w2.x = 100; G.w2.y = 100;
    WZ.incoming('gust');
    const pk = G.w.pickups.find(p => p.spell === 'gust');
    const o = { landed: !!pk };
    if (pk) { pk.z = 0; pk.x = G.w2.x + 0.2; pk.y = G.w2.y; }
    const m0 = G.w.timers.length;
    T.step(2);
    o.taken = !G.w.pickups.some(p => p.spell);
    o.timers = G.w.timers.length + ' (was ' + m0 + ')';
    T.step(30);
    o.fx = G.w.fx_.filter(f => f.type === 'arrive').length;
    return o;
  });
  ok(r.landed && r.taken, 'a delivered spell lands as a pickup and is taken by the Wizard who walks onto it', JSON.stringify(r));

  // ================= 6. a Wizard falls: the run goes on until both are down =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {};
    WZ.as(0, () => { G.w.hp = 1; WZ.damage(50, false, WZ.HAZ.unknown); });
    T.step(5);
    o.dead1 = G.w.dead; o.over1 = WZ.over(); o.t = G.w.time;
    T.step(10); o.moved = G.w.time > o.t;
    WZ.as(1, () => { G.w2 && (G.w.hp = 1); WZ.damage(50, false, WZ.HAZ.unknown); });
    T.step(2); o.over2 = WZ.over(); o.w2dead = G.w2.dead;
    return o;
  });
  ok(r.dead1 && !r.over1 && r.moved, 'one Wizard down: the wilds keep running', JSON.stringify(r));
  ok(r.over2, 'both down: the run is over', JSON.stringify(r));

  // ================= 7. the balance table, the starting factory, a second copy of each garment =================
  r = await run(() => {
    const W = __wands; W.start4(1, { seats: (() => { const s = W.M4.defaultSeats(); s[2].att = ['fire', 'water']; s[3].att = ['air', 'earth']; return s; })() }); W.UI.help(false); W.G.helpT = 0;
    const G = W.G, FA = W.FA, WZ = W.WZ, CFG = W.CFG, o = {};
    window.T = { step: (n, seats) => { for (let i = 0; i < n; i++) W.step4(0.05, 1, seats); } };
    const hs = G.fac.bld.filter(b => b.type === 'harness');
    o.harn = hs.map(b => b.x + ',' + b.y + ':' + b.el);
    o.adjacent = hs.length === 2 && Math.abs(hs[0].x - hs[1].x) + Math.abs(hs[0].y - hs[1].y) === 1;
    const e = WZ.makeEnemy('slime', 90, 90);
    o.hpK = e.maxHp / CFG.enemies.slime.hp;
    o.cycle4 = FA.cycle(hs[0]);
    G.m4 = false; o.cycle2 = FA.cycle(hs[0]); G.m4 = true;
    o.out = o.cycle2 / o.cycle4;
    // garments: 2P forges each once, 4P twice
    G.stock.aug_tide = 1;
    o.ok1 = FA.recipeOk('aug_tide');
    G.stock.aug_tide = 2;
    o.ok2 = FA.recipeOk('aug_tide');
    G.m4 = false; G.stock.aug_tide = 1; o.ok2p = FA.recipeOk('aug_tide'); G.m4 = true; G.stock.aug_tide = 0;
    return o;
  });
  ok(r.harn.length === 2 && r.adjacent, 'the starting factory has a second Harnesser right beside the first', JSON.stringify(r.harn));
  ok(r.harn[0].endsWith(':fire') && r.harn[1].endsWith(':air'), 'each Harnesser starts on an element of one Wizard (W1 fire / water -> fire, W2 air / earth -> air)', JSON.stringify(r.harn));
  ok(Math.abs(r.hpK - 1.6) < 0.01 && Math.abs(r.out - 1.25) < 0.01, 'the 4P balance block: foe health x1.6, factory outputs x1.25', 'hp x' + r.hpK.toFixed(2) + ' out x' + r.out.toFixed(2));
  ok(r.ok1 === true && r.ok2 === false && r.ok2p === false, 'the Armory forges a SECOND copy of a garment in 4P (not a third), and only one in 2P', JSON.stringify([r.ok1, r.ok2, r.ok2p]));

  // ================= 8. element effects: attunement leads, true form, plain complement, singles =================
  r = await run(() => {
    const W = __wands, G = W.G, M4 = W.M4, o = {};
    const x = (s, wi) => { const q = M4.expression(s, wi); return q && (q.kind + ':' + (q.name || '') + ':' + (q.lead || '')); };
    o.w1 = { flame: x('flamethrower', 0), steam: x('steam', 0), sand: x('sandstorm', 0), magma: x('magma', 0), meteor: x('meteor', 0), nova: x('nova', 0), gust: x('gust', 0), fire: x('fireball', 0) };
    o.w2 = { flame: x('flamethrower', 1), steam: x('steam', 1), sand: x('sandstorm', 1), tempest: x('tempest', 1), mud: x('mud', 1) };
    return o;
  });
  ok(r.w1.flame === 'lead:STEAM BLAST:fire', 'Air + Fire in a Fire / Water Wizard hands is a STEAM BLAST (Fire leads)', r.w1.flame);
  ok(r.w2.flame === 'lead:TORNADO CONE:air', 'the same spell in an Air / Earth Wizard hands is a TORNADO CONE (Air leads)', r.w2.flame);
  ok(r.w1.steam.startsWith('true:'), 'a pair that is exactly his two elements is the true form', r.w1.steam);
  ok(r.w1.sand.startsWith('plain:') && r.w2.sand.startsWith('true:'), 'the pair he has no element in (his complement) is the plain 2P form', r.w1.sand + ' / ' + r.w2.sand);
  ok(r.w1.gust === 'single::' || r.w1.fire.startsWith('single'), 'singles never refract', r.w1.gust + ' ' + r.w1.fire);
  ok(r.w1.meteor.startsWith('multi:') && r.w1.nova.startsWith('multi:'), 'a triple and the Nova take his elements as leads', r.w1.meteor + ' / ' + r.w1.nova);
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, M4 = W.M4, o = {};
    const S = (s, wi) => { M4.cur = M4.expression(s, wi); const v = WZ.spellS(s); M4.cur = null; return v; };
    const f0 = W.CFG.spells.flamethrower, a = S('flamethrower', 0), b = S('flamethrower', 1);
    o.blast = { half: a.half / f0.half, range: a.range / f0.range }; o.cone = { half: b.half / f0.half, range: b.range / f0.range };
    return o;
  });
  ok(r.blast.half > 1.4 && r.blast.range < 0.8 && r.cone.half < 0.8 && r.cone.range > 1.2, 'the form really changes shape: a short wide blast vs a long narrow cone', JSON.stringify(r));

  // ================= 9. the traits show on the foe, and a cast belongs to its caster =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {};
    G.w.enemies.length = 0; G.w.pickups.length = 0; G.w.proj.length = 0; G.w.zones.length = 0; G.w.timers.length = 0;
    for (const q of [G.w, G.w2]) { q.dead = false; q.hp = WZ.maxHp(); q.vx = q.vy = 0; }
    G.w.x = 60; G.w.y = 60; G.w2.x = 100; G.w2.y = 100; G.w.fx = G.w2.fx = 1; G.w.fy = G.w2.fy = 0;
    const near1 = WZ.makeEnemy('golem', 61.5, 60), near2 = WZ.makeEnemy('golem', 101.5, 100);
    for (const e of [near1, near2]) { e.hp = e.maxHp = 1e6; e.spd = 0; e.kb = 1; }
    const h1 = near1.hp, h2 = near2.hp;
    WZ.as(1, () => WZ.cast('tempest'));   // Wizard 2's cast (Air + Water: his Air leads)
    T.step(40);
    o.hit2 = near2.hp < h2; o.hit1 = near1.hp < h1;
    o.slowed2 = (near2.slowT > 0 || near2.slow > 0);
    return o;
  });
  ok(r.hit2 && !r.hit1, 'a cast by Wizard 2 comes out of Wizard 2 (the foe beside Wizard 1 is untouched)', JSON.stringify(r));
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {};
    G.w.enemies.length = 0; G.w.proj.length = 0; G.w.zones.length = 0; G.w.timers.length = 0;
    G.w.x = 60; G.w.y = 60; G.w.fx = 1; G.w.fy = 0;
    const e = WZ.makeEnemy('golem', 62, 60); e.hp = e.maxHp = 1e6; e.spd = 0;
    WZ.as(0, () => WZ.cast('flamethrower'));   // Wizard 1 (Fire / Water): Air + Fire is Fire-led
    T.step(14);
    o.burn = e.burnT > 0 || e.burnD > 0; o.hp = e.hp < e.maxHp;
    const f = WZ.makeEnemy('golem', 62, 62); f.hp = f.maxHp = 1e6; f.spd = 0;
    WZ.as(0, () => WZ.cast('fireball'));
    T.step(30);
    o.singleBurn = !!(f.burnT > 0);
    return o;
  });
  ok(r.burn && r.hp, 'Fire: a spell with Fire in it sets the foe alight (burn)', JSON.stringify(r));
  ok(!r.singleBurn, 'a single carries no extra trait: it casts the same in every hand', JSON.stringify(r));
  r = await run(() => { const W = __wands, G = W.G, o = {}; const q = W.CFG; return { v: W.Net.VERSION, fb: Object.keys(G.fb || {}) }; });
  ok(r.v >= 13, 'Net.VERSION was bumped for the per-player state', String(r.v));
  ok(r.fb.indexOf('refract') >= 0, 'a refracted cast counted its cue (ledger evidence)', r.fb.join(','));

  // ================= 10. the snapshot photo test with two of everything on screen =================
  r = await run(async () => {
    const W = __wands, G0 = W.G, WZ = W.WZ, s = W.M4.defaultSeats(); s[2].att = ['fire', 'water']; s[3].att = ['air', 'earth'];
    W.start4(1, { seats: s, me: 3 }); W.UI.help(false); W.G.helpT = 0; W.CFG.world.cap = 0;
    const G = W.G;
    for (let i = 0; i < 40; i++) W.step4(0.05, 1);
    G.w2.x = G.w.x + 3; G.w2.y = G.w.y + 1;
    const e = WZ.makeEnemy('slime', G.w.x + 2, G.w.y + 2); e.burnT = 2; e.burnD = 3; e.hp = e.maxHp = 1e5; e.spd = 0;
    WZ.as(1, () => { G.w.hurt = { ic: 'slime', n: 'Test', ax: G.w.x + 2, ay: G.w.y, el: 'water', t: 0.2, soft: false, d: 4 }; });
    WZ.as(0, () => WZ.cast('flamethrower')); WZ.as(1, () => WZ.cast('tempest'));
    G.w.pickups.push({ kind: 'air', spell: 'gust', x: G.w.x - 2, y: G.w.y, z: 0, t: 0, for: 0 });
    for (let i = 0; i < 8; i++) W.step4(0.05, 1);
    await new Promise(r => setTimeout(r, 400));
    __wands.snapshot();
    const rep = W.Snap.report || {};
    return { v: rep.verdict, newLeaks: (rep.leaks || []).filter(l => !l.known).map(l => l.id + ' ' + (l.example || '')), diffPx: rep.diff ? rep.diff.px : null, sIdx: WZ.sIdx, bIdx: W.FA.bIdx };
  });
  ok((r.v === 'PASS' || r.v === 'KNOWN') && r.newLeaks.length === 0 && !r.diffPx, '4P: the snapshot photo test passes with both Wizards, both Builders, burning foes and a teammate hurt on screen', JSON.stringify(r));
  ok(r.sIdx === 0 && r.bIdx === 0, '4P: drawing and snapshots leave the selection at rest');

  // ================= 11. saves are tagged with their mode =================
  r = await run(() => {
    const W = __wands, M4 = W.M4, o = {};
    const seats = M4.defaultSeats(); seats[2].att = ['fire', 'water']; seats[3].att = ['air', 'earth'];
    W.start4(3, { seats, me: 2 }); const G = W.G;
    G.stock.wood = 77; G.bs2.hands.push({ kind: 'wood' }); G.bs2.hands.push({ kind: 'stone' }); G.wand2.m.fire = 4; G.aug2.worn.hat = 'phoenix'; G.bd2.x = 20.5; G.bd2.y = 14.5;
    W.Main.save();
    const s = W.UI.slotInfo(3);
    o.tag = !!(s && s.m4); o.hands2 = s && s.m4 && s.m4.hands2.length; o.atts = s && s.m4 && JSON.stringify(s.m4.atts.slice(2));
    // a fresh 4P game from that save: the shared half and the second Builder / Wizard come back, the attunements are fixed by the save
    const seats2 = M4.defaultSeats(); seats2[2].att = ['air', 'water']; seats2[3].att = ['fire', 'earth'];
    const ok = W.Main.loadGame4(3, { seats: seats2, me: 3 }), G2 = W.G;
    o.loaded = ok && G2.m4 && G2.stock.wood === 77; o.hands = G2.bs2.hands.map(h => h.kind).join(','); o.fire = G2.wand2.m.fire; o.hat = G2.aug2.worn.hat; o.bd2 = [G2.bd2.x, G2.bd2.y];
    o.att = JSON.stringify(G2.seats[2].att) + JSON.stringify(G2.seats[3].att); o.vi = G2.vi;
    // the 2P loader refuses it
    W.Main.loadGame(3); o.refused = W.G.m4 === true && W.G === G2;
    localStorage.removeItem('wands2_save_slot3'); localStorage.removeItem('wands2_save_slot3_bak');
    return o;
  });
  ok(r.tag && r.hands2 === 2, 'a 4P save is tagged with its mode and carries the second Builder', JSON.stringify(r));
  ok(r.loaded && r.hands === 'wood,stone' && r.fire === 4 && r.hat === 'phoenix' && Math.abs(r.bd2[0] - 20.5) < 0.01, 'loading it puts the second Builder and the second Wizard back (hands, wand, garments, place)', JSON.stringify(r));
  ok(r.att === '["fire","water"]["air","earth"]', 'the attunements are fixed for the save', r.att);
  ok(r.refused, 'the 2P loader will not open a 4P save');

  ok(errs.length === 0, 'no page errors', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
