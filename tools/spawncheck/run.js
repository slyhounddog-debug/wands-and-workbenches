'use strict';
// The F3 overlay's SPAWN tab (js/devspawn.js): real mouse clicks on the real buttons.
// Four sub-tabs with the right buttons, one click = one enemy / ally / spell / resource, spells really go through the Spell Portal and cast,
// resources fly in from the Spell Portal and land on the Stockpile, the elite switch, the ally cap, a full Stockpile, no keyboard focus left on a button,
// hidden online, no page errors, and the snapshot photo test with the panel open.
//   node tools/spawncheck/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const OUT = process.env.SHOTS || '';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/'));
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  // (the boot screen's click / key listener is armed until the studio intro has been started and skipped: a real mouse press later would otherwise start it mid-test)
  await page.waitForTimeout(800); await page.mouse.click(400, 300); await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu, null, { timeout: 20000 });
  await page.evaluate(() => { __wands.UI.show('loading', false); __wands.start(1); if (__wands.G.paused) __wands.Main.pause(false); __wands.UI.help(false); __wands.G.helpT = 0; __wands.CFG.world.cap = 0; __wands.UI.debugOn = true; });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
  const steps = n => run(n => { const W = __wands; for (let i = 0; i < n; i++) W.Main.step(0.05, { bix: 0, biy: 0, wix: 0, wiy: 0, wrx: 0, wry: 0, roll: false, act: {}, broll: false }); }, n);
  const sub = async (name) => { await page.click('#debug .dsTabs [data-st=' + name + ']'); await page.waitForTimeout(150); };
  const btn = (kind, id) => '#debug .dsGrid button[data-k=' + kind + '][data-id=' + id + ']';
  await page.waitForTimeout(700);

  // ---- the shell ----
  let r = await run(() => ({ tabs: [...document.querySelectorAll('#debug .dbgTabs button')].map(b => b.textContent), stats: document.getElementById('dbgStats').textContent.length }));
  ok(r.tabs.join() === 'STATS,SPAWN' && r.stats > 20, 'the overlay has STATS and SPAWN tabs and the stats still fill in', JSON.stringify(r));
  await page.click('#debug .dbgTabs [data-t=spawn]');
  await page.waitForTimeout(300);
  const counts = {};
  for (const t of ['enemies', 'allies', 'spells', 'resources']) { await sub(t); counts[t] = await run(() => document.querySelectorAll('#debug .dsGrid button').length); }
  ok(counts.enemies === 18 && counts.allies === 11 && counts.spells === 15 && counts.resources === 32, 'four sub-tabs with a button for each entity', JSON.stringify(counts));
  await page.waitForTimeout(600);   // (the stats pane is hidden; the spawn pane must not be rebuilt under the mouse)
  ok(await run(() => document.querySelectorAll('#debug .dsGrid button').length) === 32, 'the buttons survive the overlay refresh');

  // ---- enemies ----
  await sub('enemies');
  await run(() => { const w = __wands.G.w; w.enemies.length = 0; });
  await page.click(btn('foe', 'golem'));
  r = await run(() => { const e = __wands.G.w.enemies; return { n: e.length, t: e[0] && e[0].type, el: !!(e[0] && e[0].elite), fall: e[0] && e[0].fall > 0 }; });
  ok(r.n === 1 && r.t === 'golem' && !r.el && r.fall, 'one click = one Stone Golem, dropping in through a portal', JSON.stringify(r));
  await page.check('#debug .dsElite input');
  await page.click(btn('foe', 'slime'));
  await page.click(btn('crafted', 'phoenix'));
  r = await run(() => { const e = __wands.G.w.enemies; return { n: e.length, slimeElite: !!e[1].elite, cr: e[2].type, crafted: !!e[2].crafted, crElite: !!e[2].elite }; });
  ok(r.n === 3 && r.slimeElite && r.cr === 'phoenix' && r.crafted && r.crElite, 'ELITE makes the next foes elites, crafted creatures included', JSON.stringify(r));
  await page.uncheck('#debug .dsElite input');
  await page.click(btn('boss', 'boss'));
  ok(await run(() => !!__wands.G.w.boss), 'the Chimera rises');
  await page.click(btn('boss', 'boss'));
  ok(await run(() => __wands.G.w.enemies.filter(e => e.type === 'boss').length) === 1, 'a second click does not raise a second Chimera');
  await shot('spawn-enemies');

  // ---- allies ----
  await sub('allies');
  await run(() => { __wands.G.w.allies.length = 0; });
  await page.click(btn('ally', 'cinder'));
  r = await run(() => { const a = __wands.G.w.allies; return { n: a.length, ally: !!(a[0] && a[0].ally), host: __wands.G.w.enemies.some(e => e.ally) }; });
  ok(r.n === 1 && r.ally && !r.host, 'one click = one friendly Cinder Imp (an ally, not in the hostile list)', JSON.stringify(r));
  for (let i = 0; i < 12; i++) await page.click(btn('ally', 'zephyr'));
  r = await run(() => ({ n: __wands.G.w.allies.length, cap: __wands.CFG.ally.cap }));
  ok(r.n === r.cap, 'allies stop at the ally cap', JSON.stringify(r));
  await shot('spawn-allies');

  // ---- spells ----
  await sub('spells');
  await run(() => { const W = __wands, G = W.G; G.w.enemies.length = 0; G.w.boss = null; G.wand.m.air = 0; G.wand.full.air = false; window.__d0 = G.stats.deliveries; window.__s0 = (G.stats.sent.air || 0); });
  await page.click(btn('spell', 'air'));
  r = await run(() => { const G = __wands.G; return { d: G.stats.deliveries - window.__d0, sent: (G.stats.sent.air || 0) - window.__s0, sucks: G.fac.sucks.length }; });
  ok(r.d === 1 && r.sent === 1 && r.sucks === 1, 'a spell button sends it into the Spell Portal (suck animation, delivery counted)', JSON.stringify(r));
  await steps(160);
  r = await run(() => { const G = __wands.G; return { m: G.wand.m.air, full: G.wand.full.air }; });
  ok(r.m > 0 || r.full, 'it arcs over, drops in and casts like a delivered spell (the wand charged)', JSON.stringify(r));
  await page.click(btn('spell', 'nova'));
  await page.click(btn('spell', 'thunder'));
  r = await run(() => __wands.G.stats.sent.nova === 1 && __wands.G.stats.sent.thunder === 1);
  ok(r, 'combo spells and the Nova too');
  await steps(160);
  await shot('spawn-spells');

  // ---- resources ----
  await sub('resources');
  await run(() => { const G = __wands.G; G.stock.wood = 0; G.stock.core_fire = 0; window.__w0 = G.stock.wood; });
  await page.click(btn('res', 'wood'));
  r = await run(() => { const f = __wands.G.fac.flying.filter(o => o.stock && o.kind === 'wood'); return { n: f.length, fromPortal: f.length ? Math.abs(f[0].sx - (__wands.FA.portal('spell').x + 0.5)) < 0.01 : false, wood: __wands.G.stock.wood }; });
  ok(r.n === 1 && r.fromPortal && r.wood === 0, 'a resource leaves the Spell Portal in a flight; the count is not added yet', JSON.stringify(r));
  await steps(60);
  ok(await run(() => __wands.G.stock.wood) === 1, 'it lands on the Stockpile: +1 Wood');
  await page.click(btn('res', 'stone'), { modifiers: ['Shift'] });
  await steps(80);
  ok(await run(() => __wands.G.stock.stone) >= 10, 'Shift + click sends 10');
  await page.click(btn('res', 'core_fire'));
  await page.click(btn('res', 'fire'));
  await page.click(btn('res', 'steam'));
  await page.click(btn('res', 'aug_tide'));
  await steps(80);
  r = await run(() => { const s = __wands.G.stock; return { core: s.core_fire, fire: s.fire, steam: s.steam, boots: s.aug_tide }; });
  ok(r.core === 1 && r.fire >= 1 && r.steam === 1 && r.boots === 1, 'Cores, packets, combo spells and garments all arrive as stock', JSON.stringify(r));
  await run(() => { const W = __wands, G = W.G; G.stock.wood = W.FA.room('wood') + G.stock.wood; });   // a full wood pile
  const flights = await run(() => __wands.G.fac.flying.length);
  await page.click(btn('res', 'wood'));
  ok((await run(() => __wands.G.fac.flying.length)) === flights, 'a full Stockpile sends nothing (a toast says so)');
  await shot('spawn-resources');

  // ---- focus, wheel, online ----
  ok(await run(() => document.activeElement && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'INPUT'), 'a clicked button does not keep the keyboard (Space stays the roll)');
  await run(() => { __wands.Net.role = 'host'; __wands.UI.updateDebug(0.3); });
  await page.waitForTimeout(400);
  r = await run(() => ({ tabs: getComputedStyle(document.querySelector('#debug .dbgTabs')).display, spawnHidden: document.getElementById('dbgSpawn').classList.contains('hidden') }));
  await run(() => { __wands.Net.role = null; });
  ok(r.tabs === 'none' && r.spawnHidden, 'online the SPAWN tab is gone', JSON.stringify(r));

  // ---- the photo test with the panel open ----
  await page.click('#debug .dbgTabs [data-t=spawn]').catch(() => {});
  await page.waitForTimeout(300);
  const snap = await run(() => { __wands.snapshot(); const rep = __wands.Snap.report; return { v: rep && rep.verdict, leaks: rep && rep.leaks.length, diff: rep && rep.diff.pct }; });
  ok(snap.v !== 'FAIL' && snap.diff === 0, 'the snapshot photo test still passes', JSON.stringify(snap));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
