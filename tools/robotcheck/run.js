'use strict';
// The Helper Robot acceptance run: the price ladder and the cap of 3, building one like any building, its own charge (it adds no power), fetching materials from the Stockpile
// to blueprints one item at a time (nothing is lost or made up), the Builder still finishing a robot-fed building with E (Floor Tiles finish themselves), napping when flat,
// the demolish refund, saves, the snapshot photo test.
//   node tools/robotcheck/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
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
    const W = __wands;
    W.UI.giveGift = () => {};   // goal gifts would add Wood / Stone to the Stockpile mid-run and blur the item accounting
    W.CFG.world.cap = 0;   // no wild spawns: the Wizard stays out of it while the factory is tested
    window.T = {
      step: n => { for (let i = 0; i < n; i++) { W.G.w.hp = 99999; W.G.w.enemies.length = 0; W.G.fac.shk = null; W.step(0.05, 1); } },   // (no foes, so no hit can shake an item loose from the Stockpile mid-count)
      RK: ['wood', 'stone', 'iron'],
      // every Wood / Stone / Iron there is: the Stockpile, loose on the floor, in flight, in a robot's arms, inside unfinished blueprints (shards are left out: the Wizard side sends strays home)
      acct: () => { const G = W.G, RK = T.RK; return RK.reduce((n, k) => n + (G.stock[k] || 0) + G.fac.floor.filter(o => o.kind === k).length + G.fac.flying.filter(o => o.kind === k).reduce((m, o) => m + (o.n || 1), 0) + G.fac.bld.filter(b => b.carry === k).length + G.fac.bld.filter(x => !x.done).reduce((m, x) => m + (x.got[k] || 0), 0), 0); },
      // n free floor tiles, nearest to (x, y) first, at least `gap` apart from each other
      free: (n, x, y, gap) => {
        const FA = W.FA, out = [];
        const all = [];
        for (let j = 0; j < FA.H(); j++) for (let i = 0; i < FA.W(); i++) if (FA.owned(i, j) && FA.canPlace(i, j)) all.push([i, j, Math.hypot(i - x, j - y)]);
        all.sort((a, b) => a[2] - b[2]);
        for (const a of all) if (out.length < n && out.every(o => Math.hypot(o[0] - a[0], o[1] - a[1]) >= (gap || 1))) out.push(a);
        return out;
      },
      stockTotal: () => ['wood', 'stone', 'iron'].reduce((s, k) => s + (W.G.stock[k] || 0), 0),
    };
  });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = fn => page.evaluate(fn);

  // ================= 1. the price ladder and the cap =================
  let r = await run(() => {
    const FA = __wands.FA;
    return [0, 1, 2].map(n => FA.robotCost(n));
  });
  ok(JSON.stringify(r[0]) === '{"wood":12,"stone":8,"iron":4,"shard":1}', 'the first robot costs 12 Wood, 8 Stone, 4 Iron, 1 Shard', JSON.stringify(r[0]));
  ok(JSON.stringify(r[1]) === '{"wood":18,"stone":12,"iron":6,"shard":2}', 'the second costs 50% more Wood / Stone / Iron and double the Shards', JSON.stringify(r[1]));
  ok(JSON.stringify(r[2]) === '{"wood":27,"stone":18,"iron":9,"shard":4}', 'the third costs 50% more again and double again', JSON.stringify(r[2]));

  // ================= 2. build one like any building; it adds no power =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA;
    for (const k in G.stock) G.stock[k] = 0; G.fac.floor.length = 0; G.fac.outQ.length = 0; G.w.drops.length = 0; G.w.arcs.length = 0;   // a clean Stockpile: nothing else takes the tiles, so nothing spills or comes back
    G.stock.wood = 100; G.stock.stone = 100; G.stock.iron = 40; G.stock.shard = 10; T.step(2);
    const st = FA.pileTiles()[0], s = FA.tileXY(st), spot = T.free(1, s.x + 2, s.y, 1)[0];
    const hot = W.CFG.hotbar.indexOf('bots');
    const genBefore = (T.step(1), G.fac.gen);
    const b = FA.place('robot', spot[0], spot[1], 0);
    const o = { hot, keys: W.CFG.hotkeys[hot], bp: !!b && !b.done, cost: b && b.cost, famMember: W.UI.famMember('bots') };
    for (const k in b.cost) for (let i = 0; i < b.cost[k]; i++) FA.insert(b, k, true);   // thrown in by hand
    o.done = b.done; o.nap = b.nap; o.bat = b.bat; o.count = FA.robotCount();
    T.step(3);
    o.genAfter = G.fac.gen; o.genBefore = genBefore;
    b.bat = W.CFG.batteryMax; T.step(3); o.genCharged = G.fac.gen; o.nobld = FA.isCell(b);
    b.bat = 0;
    window.R1 = b; window.DOCK = [b.x, b.y];
    return o;
  });
  ok(r.hot === 8 && r.keys === 'Digit9' && r.famMember === 'robot', 'the robot is on the toolbar (slot 9)', JSON.stringify([r.hot, r.keys, r.famMember]));
  ok(r.bp && JSON.stringify(r.cost) === '{"wood":12,"stone":8,"iron":4,"shard":1}', 'placing it makes a blueprint at the first price', JSON.stringify(r.cost));
  ok(r.done && r.count === 1, 'throwing its materials in builds it (like any building)');
  ok(r.nap && r.bat === 0, 'a new robot starts flat and napping until it is charged');
  ok(r.genAfter === r.genBefore && r.genCharged === r.genBefore && !r.nobld, 'a robot adds nothing to the factory power, charged or not', JSON.stringify([r.genBefore, r.genAfter, r.genCharged]));

  // ================= 3. fuel: it takes spells, Wood and Stone for itself =================
  r = await run(() => {
    const W = __wands, FA = W.FA, b = R1, o = {};
    o.wood = FA.canInsert(b, 'wood'); o.air = FA.canInsert(b, 'air'); o.iron = FA.canInsert(b, 'iron'); o.spell = FA.canInsert(b, 'flamethrower'); o.over = FA.canOver(b, 'flamethrower');
    FA.insert(b, "air", true); T.step(200);
    o.bat = b.bat; o.nap = b.nap; o.state = b.st;
    return o;
  });
  ok(r.wood && r.air && !r.iron && !r.spell && !r.over, 'it accepts element spells, Wood and Stone as fuel (no Iron, no overcharge)', JSON.stringify(r));
  ok(r.bat > 0 && !r.nap, 'fuel burns into its own charge and wakes it', r.bat.toFixed(1));

  // ================= 4. it fetches materials to a blueprint; stock is conserved; the Builder finishes it =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, b = R1, o = {};
    b.bat = W.CFG.batteryMax;
    const far = T.free(1, b.x + 4, b.y - 2, 1)[0];
    const bp = FA.place('crate', far[0], far[1], 0);   // 12 Wood + 6 Stone
    const need = FA.costOf(bp), tot0 = T.acct();
    window.BP = bp; o.need = need; o.tot0 = tot0;
    const seen = { carry: false, away: false, maxCarry: 0 };
    let t = 0;
    while (t < 400 && !(bp.ready || bp.done)) {
      T.step(1); t += 0.05;
      if (b.carry) { seen.carry = true; seen.maxCarry = Math.max(seen.maxCarry, 1); }
      if (Math.hypot(b.rx - b.x - 0.5, b.ry - b.y - 0.5) > 1) seen.away = true;
      if (T.acct() !== tot0 && !bp.done) { o.leak = [T.acct(), tot0]; break; }
    }
    o.t = t; o.seen = seen; o.got = Object.assign({}, bp.got); o.ready = bp.ready; o.done = bp.done; o.needLeft = FA.needOf(bp);
    o.hand = G.hands.length; o.batLeft = b.bat;
    return o;
  });
  ok(!r.leak, 'items taken from the Stockpile are always accounted for (stock + in its arms + in the blueprint)', JSON.stringify(r.leak || ''));
  ok(r.seen.carry && r.seen.away, 'it left its dock, carried an item and walked to the blueprint', JSON.stringify(r.seen));
  ok(r.ready && !r.done && Object.keys(r.needLeft).length === 0, 'it paid for everything, but the building waits: ready, not done (the Builder presses E)', JSON.stringify({ ready: r.ready, done: r.done, got: r.got }));
  ok(r.batLeft < 90, 'working drains its own charge', r.batLeft.toFixed(2));
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, bp = BP, o = {};
    const t = { kind: 'bld', o: bp, x: bp.x + 0.5, y: bp.y + 0.5 };
    const a = FA.actionFor(t, 'use'); o.use = !!a.fn; o.pickNone = !FA.actionFor(t, 'pick').fn;
    T.step(20); o.stillNotDone = !bp.done;
    a.fn(); o.done = bp.done; o.ready = bp.ready; o.type = bp.type;
    return o;
  });
  ok(r.use && r.pickNone && r.stillNotDone, 'the use button offers "finish building"; it never finishes by itself', JSON.stringify(r));
  ok(r.done && !r.ready, 'E completes the robot-fed building');

  // ================= 5. Floor Tiles are the exception: they finish themselves =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {};
    let spot = null;
    for (let j = 0; j < FA.H() && !spot; j++) for (let i = 0; i < FA.W() && !spot; i++) if (FA.canExpand(i, j)) spot = [i, j];
    const bp = FA.place('expand', spot[0], spot[1], 0);
    R1.bat = W.CFG.batteryMax; const tiles0 = G.stats.tiles || 0;
    let t = 0; while (t < 60 && FA.owned(spot[0], spot[1]) === false) { T.step(1); t += 0.05; }
    o.owned = FA.owned(spot[0], spot[1]); o.tiles = (G.stats.tiles || 0) - tiles0; o.t = t; o.still = G.fac.bld.includes(bp);
    return o;
  });
  ok(r.owned && r.tiles === 1 && !r.still, 'a robot-fed Floor Tile finishes by itself and becomes floor', JSON.stringify(r));

  // ================= 6. napping: flat = it stops where it stands, with its load =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, b = R1, o = {};
    const far = T.free(1, b.x + 5, b.y + 1, 1)[0], bp = FA.place('crate', far[0], far[1], 0);
    b.bat = W.CFG.batteryMax; b.fuel = { air: 0, water: 0, fire: 0, earth: 0, wood: 0, stone: 0 }; b.types = [];
    let t = 0; while (t < 20 && !b.carry) { T.step(1); t += 0.05; }
    o.carried = b.carry;
    b.bat = 0.001; T.step(2);
    const x = b.rx, y = b.ry, c = b.carry;
    T.step(40);
    o.nap = b.nap; o.stayed = Math.hypot(b.rx - x, b.ry - y) < 0.001; o.held = b.carry === c; o.state = b.st; o.job = !!b.job;
    b.stT = 5; o.flag = null;
    FA.insert(b, 'stone', true); T.step(10);
    o.woke = !b.nap && (b.moving || b.job !== null || b.carry !== c || Math.hypot(b.rx - x, b.ry - y) > 0.01);
    window.BP2 = bp;
    return o;
  });
  ok(r.carried, 'it picked a load up for the new blueprint', r.carried);
  ok(r.nap && r.stayed && r.held && r.state === 'starve', 'out of charge it naps where it stands, load and all (state: starved)', JSON.stringify(r));
  ok(r.woke, 'fuel wakes it and it carries on');

  // ================= 7. several robots share the work and respect the cap =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {};
    G.stock.wood = 100; G.stock.stone = 100; G.stock.iron = 40; G.stock.shard = 10; G.w.drops.length = 0; G.w.arcs.length = 0;
    const mk = () => { const s = T.free(1, R1.x + 2, R1.y + 2, 1)[0]; const b = FA.place('robot', s[0], s[1], 0); if (b) { for (const k in b.cost) for (let i = 0; i < b.cost[k]; i++) FA.insert(b, k, true); } return b; };
    const b2 = mk(), b3 = mk();
    o.costs = [b2 && b2.cost, b3 && b3.cost];
    const free = T.free(1, 3, 3, 1)[0];
    o.fourth = FA.place('robot', free[0], free[1], 0); o.canPut = FA.canPut('robot', free[0], free[1]); o.count = FA.robotCount();
    o.refund = null;
    window.R2 = b2; window.R3 = b3;
    return o;
  });
  ok(JSON.stringify(r.costs) === '[{"wood":18,"stone":12,"iron":6,"shard":2},{"wood":27,"stone":18,"iron":9,"shard":4}]', 'the second and third robots cost 18/12/6/2 and 27/18/9/4', JSON.stringify(r.costs));
  ok(r.fourth === false && r.canPut === false && r.count === 3, 'a fourth robot cannot be placed (3 at most)', JSON.stringify([r.fourth, r.canPut, r.count]));
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {};
    for (const b of [R1, R2, R3]) { b.bat = W.CFG.batteryMax; b.look = 0; }
    // two blueprints: two robots should not both fetch the same unit of a material the blueprint no longer needs
    const a = T.free(2, R1.x + 3, R1.y - 1, 3), p1 = FA.place('forge', a[0][0], a[0][1], 0), p2 = FA.place('forge', a[1][0], a[1][1], 0);
    const RK = ['wood', 'stone', 'iron']   /* (the Wizard side now and then sends a stray Shard home: not the robots' doing) */, acct = () => T.stockTotal() + G.fac.floor.filter(o => RK.includes(o.kind)).length + G.fac.flying.filter(o => RK.includes(o.kind)).reduce((n, o) => n + (o.n || 1), 0) + [R1, R2, R3].filter(b => b.carry).length + G.fac.bld.filter(x => !x.done).reduce((n, x) => n + Object.values(x.got).reduce((a2, c) => a2 + c, 0), 0);
    const acctK = () => { const q = {}; for (const k of RK) q[k] = (G.stock[k] || 0) + G.fac.floor.filter(o => o.kind === k).length + G.fac.flying.filter(o => o.kind === k).reduce((n, o) => n + (o.n || 1), 0) + [R1, R2, R3].filter(b => b.carry === k).length + G.fac.bld.filter(x => !x.done).reduce((n, x) => n + (x.got[k] || 0), 0); return q; };
    const tot0 = acct(), k0 = acctK();
    let t = 0, bad = null;
    while (t < 600 && !(p1.ready && p2.ready)) {
      T.step(1); t += 0.05;
      for (const p of [p1, p2]) for (const k in p.got) if (p.got[k] > FA.costOf(p)[k]) bad = [p.type, k, p.got[k]];
      if (!bad && acct() !== tot0) bad = ['leak', acct(), tot0, JSON.stringify(k0), JSON.stringify(acctK()), G.fac.flying.map(o => o.kind + (o.stock ? ':s' : '') + (o.boing ? ':b' : '')).join()];
      if (bad) break;
    }
    o.t = t; o.bad = bad; o.r1 = p1.ready; o.r2 = p2.ready;
    window.BPS = [p1, p2];
    return o;
  });
  ok(!r.bad && r.r1 && r.r2, 'three robots fill two Forge blueprints with nothing over-delivered or lost', JSON.stringify(r));

  // ================= 8. demolish: the refund is what it cost, and its load goes back =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {};
    R3.carry = 'iron'; const before = Object.assign({}, G.stock), cost = Object.assign({}, R3.cost);
    FA.demolish(R3.x, R3.y, true);
    o.diff = {}; for (const k in cost) o.diff[k] = (G.stock[k] || 0) - (before[k] || 0);
    o.iron = (G.stock.iron || 0) - (before.iron || 0); o.cost = cost; o.count = FA.robotCount(); o.next = FA.robotCost();
    return o;
  });
  ok(r.iron === r.cost.iron + 1 && r.diff.wood === r.cost.wood && r.diff.shard === r.cost.shard, 'demolishing refunds the price it was paid at and its load goes back to the Stockpile', JSON.stringify(r.diff));
  ok(r.count === 2 && JSON.stringify(r.next) === '{"wood":27,"stone":18,"iron":9,"shard":4}', 'then the next one is priced as the third again', JSON.stringify(r.next));

  // ================= 9. save and load =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {};
    const b = R1; b.bat = 55; b.carry = 'stone'; b.rx = b.x + 1.5; b.ry = b.y + 0.5; b.job = null;
    const p = BPS[0]; p.ready = true;
    const json = JSON.parse(JSON.stringify(FA.toJSON()));
    FA.fromJSON(json); T.step(1);
    const rs = G.fac.bld.filter(x => x.type === 'robot'), r1 = rs.find(x => x.x === b.x && x.y === b.y);
    o.n = rs.length; o.bat = r1 && r1.bat; o.carry = r1 && r1.carry; o.pos = r1 && [r1.rx, r1.ry]; o.done = r1 && r1.done; o.nap = r1 && r1.nap;
    o.costs = rs.map(x => x.cost && x.cost.wood).sort();
    const fg = G.fac.bld.find(x => x.type === 'forge' && !x.done && x.x === p.x && x.y === p.y); o.ready = fg && fg.ready;
    return o;
  });
  ok(r.n === 2 && r.done && r.carry === 'stone' && Math.abs(r.bat - 55) < 6, 'a save keeps the robots, their charge and what they carry', JSON.stringify(r));
  ok(r.ready === true, 'a robot-paid blueprint is still waiting for E after a save');

  // ================= 10. a picture, and the photo test =================
  await page.evaluate(() => {
    const W = __wands, G = W.G, FA = W.FA, b = G.fac.bld.find(x => x.type === 'robot' && x.done);
    G.paused = false; b.bat = W.CFG.batteryMax; G.bd.x = b.x + 0.5; G.bd.y = b.y + 2.5;
    const nap = G.fac.bld.filter(x => x.type === 'robot' && x.done)[1]; if (nap) { nap.bat = 0; nap.fuel = { air: 0, water: 0, fire: 0, earth: 0, wood: 0, stone: 0 }; }
    T.step(4);
  });
  await page.waitForTimeout(1200);
  if (OUT) await page.screenshot({ path: OUT + '/robot.png' });
  const snap = await page.evaluate(() => { __wands.snapshot(); const R = __wands.Snap.report; return { v: R.verdict, newLeaks: R.leaks.filter(l => !l.known).map(l => l.id), issues: (R.issues || []).filter(l => !l.known).map(l => l.id || l), diff: R.diff }; });
  ok(snap.v === 'KNOWN' || snap.v === 'PASS', 'the snapshot photo test passes with robots working and napping', JSON.stringify(snap));
  console.log('ERRORS', errs.length ? errs.slice(0, 6) : 'none');
  ok(errs.length === 0, 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exitCode = fails ? 1 : 0;
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
