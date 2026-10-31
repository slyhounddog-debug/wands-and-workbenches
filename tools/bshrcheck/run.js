'use strict';
// The Battery Shrine acceptance run: one shrine per Battery, damage becomes that Battery's charge, a full Battery makes it idle, a new Battery brings a new shrine with a
// shockwave and a toast, demolishing removes it, saves find their Battery again, a death keeps them, the snapshot photo test, and the allies' new look / health.
//   node tools/bshrcheck/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
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
    window.T = {
      step: n => { for (let i = 0; i < n; i++) W.step(0.05, 1); },
      clear: () => { const q = w(); q.enemies.length = 0; q.allies.length = 0; q.proj.length = 0; q.eproj.length = 0; q.zones.length = 0; q.timers.length = 0; q.fx_.length = 0; q.hp = 99999; q.armor = 0; },
      bats: () => W.G.fac.bld.filter(b => W.FA.def(b).kind === 'cell'),
      ctx: el => ({ spell: 'test', el: [el || 'fire'], hits: 0, kills: 0, weak: 0 }),
    };
  });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = fn => page.evaluate(fn);

  // ================= 1. the world starts with one shrine, for the starter Battery =================
  let r = await run(() => {
    const W = __wands, G = W.G; T.step(3);
    const bs = T.bats(), s = G.bshr[0];
    return { n: G.bshr.length, bats: bs.length, num: s && s.n, pair: s && bs[0] && s.id === bs[0].id, d: s && Math.hypot(s.x - G.w.x, s.y - G.w.y), wet: s && W.WZ.wet(s.x, s.y), full: bs[0].bat, max: W.CFG.batteryMax };
  });
  ok(r.n === 1 && r.bats === 1 && r.num === 1 && r.pair, 'the world starts with exactly one Battery Shrine, #1, paired with the starter Battery', JSON.stringify(r));
  ok(r.d > 2 && r.d < 16 && !r.wet, 'it stands on dry land within sight of the spawn', r.d && r.d.toFixed(1));

  // ================= 2. damage becomes charge for ITS Battery =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {}; T.clear();
    const s = G.bshr[0], b = T.bats()[0]; b.bat = 0; G.fac.perBat = 0;
    WZ.ctx = T.ctx('fire'); WZ.explode(s.x, s.y, 1.5, 10, '#ff9a2b'); WZ.ctx = null; o.a = b.bat;
    b.bat = 0; WZ.ctx = T.ctx('fire'); WZ.explode(s.x, s.y, 1.5, 20, '#ff9a2b'); WZ.ctx = null; o.b = b.bat;
    b.bat = 0; WZ.explode(s.x, s.y, 1.5, 20, '#ff9a2b'); o.noCtx = b.bat;   // not a player spell: nothing
    o.perDmg = W.CFG.bshr.perDmg;
    o.max = W.CFG.batteryMax; b.bat = 0; WZ.ctx = T.ctx('fire'); WZ.explode(s.x, s.y, 1.5, 5000, '#ff9a2b'); WZ.ctx = null; o.capped = b.bat;   // never past full
    return o;
  });
  ok(Math.abs(r.a - 10 * r.perDmg) < 0.01 && Math.abs(r.b - 20 * r.perDmg) < 0.01, 'a blast does charge in proportion to its damage (10 -> ' + 10 * r.perDmg + ', 20 -> ' + 20 * r.perDmg + ')', r.a.toFixed(2) + ' / ' + r.b.toFixed(2));
  ok(r.noCtx === 0, 'damage that is not from a player spell charges nothing');
  ok(r.capped === r.max, 'a Battery is never charged past full', r.capped);

  // ================= 3. real spells: a thrown fireball, a flame stream =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear();
    const s = G.bshr[0], b = T.bats()[0];
    const face = () => { const dx = s.x - w.x, dy = s.y - w.y, m = Math.hypot(dx, dy) || 1; w.fx = dx / m; w.fy = dy / m; };
    w.x = s.x - 5; w.y = s.y - 1; w.vx = w.vy = 0;
    b.bat = 0; face(); WZ.cast('fireball'); T.step(30); o.fire = b.bat;
    T.clear(); w.x = s.x - 3; w.y = s.y - 0.5; b.bat = 0; face(); WZ.cast('flamethrower'); T.step(50); o.flame = b.bat;
    T.clear(); b.bat = 0; w.x = s.x - 3; w.y = s.y - 0.5; face(); WZ.cast('gust'); T.step(20); o.gust = b.bat;
    T.clear(); b.bat = 0; w.x = s.x - 3; w.y = s.y - 0.5; face(); WZ.cast('boulder'); T.step(40); o.boulder = b.bat;
    return o;
  });
  ok(r.fire > 5, 'a Seeker Fireball that hits the shrine charges its Battery', r.fire.toFixed(1));
  ok(r.flame > 5, 'a Flamethrower stream held on it charges continuously', r.flame.toFixed(1));
  ok(r.gust > 0, 'a Cyclone Gust charges it too (a little)', r.gust.toFixed(1));
  ok(r.boulder > 5, 'a Bouncing Boulder landing on it charges its Battery', r.boulder.toFixed(1));

  // ================= 4. a full Battery: the shrine is idle =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ; T.clear();
    const s = G.bshr[0], b = T.bats()[0], before = G.stats.bshrCharge || 0;
    b.bat = W.CFG.batteryMax; G.fac.perBat = 0;
    WZ.ctx = T.ctx('fire'); WZ.explode(s.x, s.y, 1.5, 40, '#ff9a2b'); WZ.ctx = null;
    return { max: W.CFG.batteryMax, bat: b.bat, gained: (G.stats.bshrCharge || 0) - before, icon: G.w.fx_.some(f => f.type === 'icon') };
  });
  ok(r.bat === r.max && r.gained === 0 && r.icon, 'with its Battery full the shrine gives nothing and shows a check mark', JSON.stringify(r));

  // ================= 5. a Battery finished on the Builder's side: a new shrine, a shockwave, toasts =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA; T.clear();
    const toasts = []; const t0 = W.UI.toast; W.UI.toast = function (txt, side, ic) { toasts.push(side + ':' + txt); return t0.call(W.UI, txt, side, ic); };
    let x = 0, y = 0; out: for (let j = 0; j < FA.H(); j++) for (let i = 0; i < FA.W(); i++) if (FA.owned(i, j) && FA.canPlace(i, j) && !FA.cell(i, j)) { x = i; y = j; break out; }
    const b = FA.makeBuilding('battery', x, y, false); b.got = {};
    FA.onComplete(b, false);
    W.UI.toast = t0;
    const s = G.bshr.find(q => q.id === b.id);
    return { n: G.bshr.length, num: s && s.n, shock: G.w.fx_.some(f => f.type === 'shock'), bsw: G.w.bsw.length, toasts, d: s && Math.hypot(s.x - G.w.x, s.y - G.w.y), other: G.bshr.map(q => q.n).join() };
  });
  ok(r.n === 2 && r.num === 2, 'a finished Battery brings shrine #2', r.other);
  ok(r.shock && r.bsw === 1, 'with a shockwave in the wilds');
  ok(r.toasts.some(t => /^R:.*Shrine #2/.test(t)) && r.toasts.some(t => /^L:.*Battery #2/.test(t)), 'and a toast on both halves', JSON.stringify(r.toasts));
  ok(r.d >= 3 && r.d < 14, 'it lands near the Wizard, where he can see it', r.d && r.d.toFixed(1));
  r = await run(() => {   // the new shrine charges only its own Battery
    const W = __wands, G = W.G, WZ = W.WZ; T.step(5);
    const [s1, s2] = G.bshr, bs = T.bats(), b1 = bs.find(b => b.id === s1.id), b2 = bs.find(b => b.id === s2.id);
    b1.bat = 0; b2.bat = 0; G.fac.perBat = 0;
    WZ.ctx = T.ctx('fire'); WZ.explode(s2.x, s2.y, 1.5, 10, '#ff9a2b'); WZ.ctx = null;
    return { b1: b1.bat, b2: b2.bat, apart: Math.hypot(s1.x - s2.x, s1.y - s2.y) };
  });
  ok(r.b1 === 0 && r.b2 > 0, 'each shrine charges only its own Battery', JSON.stringify(r));
  ok(r.apart >= 4.9, 'shrines keep their distance from each other', r.apart.toFixed(1));

  // ================= 6. saves find their Battery again; a death keeps the shrines =================
  r = await run(() => {
    const W = __wands, G = W.G, o = {}; T.clear();
    o.before = G.bshr.map(s => [s.n, s.x, s.y]);
    o.pos = G.bshr.map(s => { const b = T.bats().find(b => b.id === s.id); return [b.x, b.y]; });
    W.Main.save();
    W.WZ.reenter();
    T.step(3);
    o.afterDeath = G.bshr.map(s => [s.n, s.x, s.y]);
    W.Main.loadGame(1); T.step(5);
    o.after = W.G.bshr.map(s => [s.n, s.x, s.y]);
    o.pos2 = W.G.bshr.map(s => { const b = W.G.fac.bld.find(b => b.id === s.id); return b ? [b.x, b.y] : null; });
    return o;
  });
  ok(JSON.stringify(r.afterDeath) === JSON.stringify(r.before), 'a death (a new expedition) keeps the shrines where they were', JSON.stringify(r.afterDeath));
  ok(JSON.stringify(r.after) === JSON.stringify(r.before) && JSON.stringify(r.pos2) === JSON.stringify(r.pos), 'a save and load gives each shrine its own Battery back (same numbers, same places)', JSON.stringify(r.pos2));

  // ================= 7. demolishing the Battery makes its shrine crumble =================
  r = await run(() => {
    const W = __wands, G = W.G; T.clear(); G.paused = false;
    const s2 = G.bshr.find(s => s.n === 2), b = G.fac.bld.find(b => b.id === s2.id);
    W.FA.demolish(b.x, b.y, true); T.step(3);
    return { n: G.bshr.length, nums: G.bshr.map(s => s.n).join(), hit: W.WZ.hitH().filter(h => h.bshr).length };
  });
  ok(r.n === 1 && r.nums === '1' && r.hit === 1, 'demolishing a Battery removes its shrine from the world and from the hit list', JSON.stringify(r));
  r = await run(() => {   // the freed number is used by the next one
    const W = __wands, G = W.G, FA = W.FA; T.clear();
    let x = 0, y = 0; out: for (let j = 0; j < FA.H(); j++) for (let i = 0; i < FA.W(); i++) if (FA.owned(i, j) && FA.canPlace(i, j) && !FA.cell(i, j)) { x = i; y = j; break out; }
    const b = FA.makeBuilding('heavybat', x, y, false); FA.onComplete(b, false); T.step(2);
    return G.bshr.map(s => s.n).join();
  });
  ok(r === '1,2', 'a Heavy Battery gets a shrine too, with the smallest free number', r);

  // ================= 8. the photo test, and a picture =================
  await page.evaluate(() => { const G = __wands.G, w = G.w; T.clear(); const s = G.bshr[0]; w.x = s.x - 3; w.y = s.y + 1; w.vx = w.vy = 0; T.bats()[0].bat = 40; G.paused = false; __wands.WZ.ctx = T.ctx('fire'); __wands.WZ.explode(s.x, s.y, 1.5, 3, '#ff9a2b'); __wands.WZ.ctx = null; });
  await page.waitForTimeout(1200);
  if (OUT) await page.screenshot({ path: OUT + '/bshr.png' });

  // ================= 9. allies: four times the health, a look nobody can miss =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ; G.paused = false; try { __wands.Snap.show && __wands.Snap.show('LIVE'); } catch (e) { /* not showing */ }
    T.clear();
    const h = WZ.makeCreature('pebble', G.w.x + 3, G.w.y, { plain: true }), a = WZ.spawnAlly('pebble');
    return { hostile: h.maxHp, ally: a.maxHp, mul: W.CFG.ally.hpMul };
  });
  ok(r.mul === 4 && Math.abs(r.ally / r.hostile - 4) < 1.5, 'an ally has four times the health of the hostile version (x' + r.mul + ')', r.ally.toFixed(0) + ' vs ' + r.hostile.toFixed(0));
  if (OUT) {
    await page.evaluate(() => { const W = __wands, G = W.G, w = G.w; T.clear(); for (const [id, dx, dy] of [['pebble', 2.5, 0.5], ['cinder', 0, 2.5], ['zephyr', -2.5, 0.5]]) { const a = W.WZ.spawnAlly(id); a.fall = 0; a.dazeT = 0; a.x = w.x + dx; a.y = w.y + dy; a.hp = a.maxHp * 0.7; const h = W.WZ.makeCreature(id, w.x + dx + 0.5, w.y + dy - 4.5, { plain: true }); h.fall = 0; h.dazeT = 99; } });
    await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + '/allies.png' });
  }
  const snap = await page.evaluate(() => { __wands.snapshot(); const R = __wands.Snap.report; return { v: R.verdict, newLeaks: R.leaks.filter(l => !l.known).map(l => l.id), issues: (R.issues || []).filter(l => !l.known).map(l => l.id || l), diff: R.diff }; });
  ok(snap.v === 'KNOWN' || snap.v === 'PASS', 'the snapshot photo test passes with shrines in the world', JSON.stringify(snap));
  console.log('ERRORS', errs.length ? errs.slice(0, 6) : 'none');
  ok(errs.length === 0, 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exitCode = fails ? 1 : 0;
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
