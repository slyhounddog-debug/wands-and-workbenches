'use strict';
// The 2026-11-01 request pass (headless, offline): remappable keys (Keys, js/keys.js), the Q pipette, moving a building by holding right-click, the Wizard's big map, the Builder's own game over
// screen, the Book's per-part spell damage and the separate elite Shard line, the bolt icon in the building note, the new building prices / resource yields / drop rates, the starter factory's
// egg route.   node tools/keycheck/run.js        (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.env.SHOTS || '';
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + extra : '')); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  await page.goto('file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/'));
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  await page.waitForTimeout(800); await page.mouse.click(400, 300); await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu, null, { timeout: 20000 });
  await page.evaluate(() => { __wands.UI.show('loading', false); __wands.start(1); __wands.UI.help(false); __wands.G.helpT = 0; if (__wands.G.paused) __wands.Main.pause(false); Keys.resetAll(); });
  const ev = fn => page.evaluate(fn);
  await ev(() => { const G = __wands.G; G.w.hp = 1e5; __wands.step(0.05, 30); });

  // ================= 1. prices, yields, drop rates =================
  let r = await ev(() => { const B = __wands.CFG.buildings, c = k => JSON.stringify(B[k].cost); return ['harness', 'cauldron', 'forge', 'anvil', 'battery', 'heavybat', 'splitter', 'crate', 'spawner', 'stockpile', 'robot'].map(c); });
  ok(r.join('|') === '{"wood":4,"stone":3}|{"wood":6,"stone":4}|{"wood":10,"stone":8,"iron":2}|{"wood":10,"stone":12,"iron":6}|{"wood":2,"stone":4,"iron":4}|{"wood":4,"stone":10,"iron":8}|{"wood":2,"stone":2}|{"wood":6,"stone":2}|{"wood":6,"stone":6,"iron":4,"shard":1}|{"stone":2,"iron":1}|{"wood":6,"stone":8,"iron":4,"shard":1}',
    'building prices: Harvester 4/3, Cauldron 6/4, Forge 10/8/2, Armory unchanged, Battery 2/4/4, Heavy Battery 4/10/8, Splitter 2/2, Crate 6/2, Spawner 6/6/4+1 shard, Stockpile 2 stone + 1 iron', r.join('|'));
  r = await ev(() => { const H = __wands.CFG.harvest, F = __wands.CFG.forage, D = __wands.CFG.drops; return { tree: H.tree.n, rock: H.rock.n, iron: H.rock.bonus.iron, sticks: F.sticks.drop.wood, sb: Object.keys(F.sticks.bonus).length, mound: JSON.stringify(F.mound.drop), mb: Object.keys(F.mound.bonus).length, d: [D.wood, D.stone, D.iron, D.resMutMul, D.resEliteMul] }; });
  ok(r.tree === 4 && r.rock === 2 && r.iron === 0.25, 'a tree gives 1 less than your tuned 5 (4) and a rock 1 less than 3 (2); a rock holds an Iron 25% of the time', JSON.stringify(r));
  ok(r.sticks === 2 && r.sb === 0 && r.mound === '{"stone":1,"iron":1}' && r.mb === 0, 'stick piles give 1 less Wood with no extra roll; dirt mounds give exactly 1 Stone and 1 Iron', JSON.stringify(r));
  ok(r.d.join() === '0.1,0.07,0.05,1.5,2', 'kill drops: Wood 10%, Stone 7%, Iron 5%; mutants x1.5, elites x2', r.d.join());
  r = await ev(() => { const FA = __wands.FA; return [0, 1, 2].map(n => FA.robotCost(n)).map(c => JSON.stringify(c)).join('|'); });
  ok(r === '{"wood":6,"stone":8,"iron":4,"shard":1}|{"wood":6,"stone":8,"iron":8,"shard":4}|{"wood":6,"stone":8,"iron":12,"shard":8}', 'robots: 6 Wood + 8 Stone each, Iron 4 / 8 / 12, Shards 1 / 4 / 8', r);

  // ================= 2. the starter factory's egg route =================
  r = await ev(() => { const G = __wands.G, f = G.fac, sp = f.bld.find(b => b.type === 'splitter'), sw = f.bld.find(b => b.type === 'spawner'), cell = (x, y) => f.grid[y * f.w + x];
    const feed = cell(sp.x, sp.y + 1), side = cell(sp.x + 1, sp.y + 1);
    return { feed: feed && feed.type === 'belt' && feed.dir === 1, into: sw.x === sp.x && sw.y === sp.y + 2, beside: !!side }; });
  ok(r.feed && r.into && !r.beside, 'the Splitter feeds the Spawner through ONE belt straight down its south side, and no egg belt runs beside it', JSON.stringify(r));
  r = await ev(() => { const W = __wands, G = W.G, e0 = G.stats.eggs || 0; W.step(0.05, 1200); return (G.stats.eggs || 0) - e0; });
  ok(r >= 3, 'the starter Spawner\'s Eggs still reach the Spell Portal', 'eggs sent ' + r);

  // ================= 3. keys: defaults, remaps, swaps, reserved keys =================
  r = await ev(() => ({ use: Keys.codes('use'), dodge: Keys.codes('wDodge'), sch: Keys.scheme(), pip: Keys.codes('pipette'), fam: Keys.codes('family') }));
  ok(r.pip[0] === 'KeyQ' && r.fam[0] === 'KeyO', 'defaults: Q is the pipette, the family cycle moved to O', JSON.stringify(r));
  await ev(() => { Keys.set('wDodge', 'KeyJ'); Keys.set('treeB', 'KeyU'); Keys.set('slot3', 'KeyK'); __wands.UI.keyChips(true); });
  await ev(() => { const w = __wands.G.w; w.rollCd = 0; w.roll = 0; });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(150); await page.keyboard.press('KeyJ'); await page.waitForTimeout(80);
  r = await ev(() => __wands.G.w.roll);
  ok(r > 0, 'a remapped Wizard dodge (J) rolls', 'roll ' + r);
  await page.keyboard.up('ArrowRight'); await page.waitForTimeout(1600);
  await ev(() => { const w = __wands.G.w; w.rollCd = 0; w.roll = 0; });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(150); await page.keyboard.press('Period'); await page.waitForTimeout(80);
  r = await ev(() => __wands.G.w.roll);
  ok(r === 0, 'the old dodge key does nothing once it is remapped', 'roll ' + r);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('KeyK'); await page.waitForTimeout(200);
  r = await ev(() => [__wands.G.selected, document.querySelector('#hotbar .slot:nth-child(3) kbd').textContent, document.querySelector('#btnTree kbd').textContent]);
  ok(r[0] === 'harness' && r[1] === 'K' && r[2] === 'U', 'a remapped hotbar slot key selects it and the chips show the new keys', JSON.stringify(r));
  await page.keyboard.press('KeyU'); await page.waitForTimeout(250);
  r = await ev(() => !!__wands.UI.treeOpen.L); ok(r, 'a remapped skill-tree key opens the Builder tree'); await page.keyboard.press('KeyU'); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  r = await ev(() => { const o = Keys.set('use', Keys.codes('rotate')[0]); return { use: Keys.codes('use'), rot: Keys.codes('rotate'), other: o && o.id }; });
  ok(r.use[0] === 'KeyR' && r.rot[0] === 'KeyE' && r.other === 'rotate', 'binding a key another Builder action had swaps the two', JSON.stringify(r));
  r = await ev(() => { const was = Keys.codes('pin')[0], o = Keys.set('pin', 'Enter'); return Keys.codes('pin')[0] === was && o === null; });
  ok(r, 'reserved keys (Enter, Esc, F-keys) cannot be bound');
  // the remap page itself
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.evaluate(() => { [...document.querySelectorAll('#pause button')].find(b => /SETTINGS/.test(b.textContent)).click(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { [...document.querySelectorAll('#pause button')].find(b => /KEYS/.test(b.textContent)).click(); });
  await page.waitForTimeout(200);
  r = await ev(() => document.querySelectorAll('.keyBtn').length);
  ok(r === await ev(() => Keys.list.length), 'Settings > KEYS lists every action', '' + r);
  await page.click('.keyBtn[data-id="wMap"]'); await page.waitForTimeout(100); await page.keyboard.press('KeyZ'); await page.waitForTimeout(200);
  r = await ev(() => Keys.codes('wMap')[0]); ok(r === 'KeyZ', 'clicking a key and pressing another binds it', r);
  await shot('keys');
  await page.click('#pause button.back'); await page.waitForTimeout(150);
  await page.evaluate(() => { [...document.querySelectorAll('#pause button')].find(b => /RESUME/.test(b.textContent)).click(); });
  await page.waitForTimeout(300);
  await ev(() => { Keys.resetAll(); __wands.UI.keyChips(true); });

  // ================= 4. the pipette =================
  const harnessPos = () => page.evaluate(() => { const W = __wands, R = W.R, h = W.G.fac.bld.find(b => b.type === 'harness'), s = R.toScreen(R.fv, h.x + 0.5, h.y + 0.5), cv = document.getElementById('cv').getBoundingClientRect(); return { x: cv.left + s[0] * cv.width / 1600, y: cv.top + (s[1] - 20) * cv.height / 900 }; });
  const sel = () => ev(() => [__wands.G.selected, __wands.G.demolish]);
  await ev(() => { __wands.UI.select('hand'); __wands.G.demolish = false; __wands.G.hands.length = 0; });
  let hp = await harnessPos();
  await page.mouse.move(hp.x, hp.y); await page.waitForTimeout(200);
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  r = await sel(); ok(r[0] === 'harness' && !r[1], 'Q over a building takes it as the active tool', JSON.stringify(r));
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  r = await sel(); ok(r[0] === 'hand', 'Q with a tool active clears it', JSON.stringify(r));
  await page.mouse.move(150, 650); await page.waitForTimeout(150);
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  r = await sel(); ok(r[0] === 'harness', 'Q over nothing brings back the last tool', JSON.stringify(r));
  await page.keyboard.press('KeyB'); await page.waitForTimeout(100);
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  r = await sel(); ok(r[0] === 'hand' && !r[1], 'Q clears demolish mode too', JSON.stringify(r));
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  r = await sel(); ok(r[1] === true, 'and Q with nothing under the cursor brings demolish back', JSON.stringify(r));
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(100);
  await ev(() => { const FA = __wands.FA, G = __wands.G, b = G.fac.grid.find(c => c && c.type === 'belt'); window.__bx = [b.x === undefined ? null : b.x]; });
  r = await ev(() => { const G = __wands.G, f = G.fac, i = f.grid.findIndex(c => c && c.type === 'belt'), x = i % f.w, y = Math.floor(i / f.w), R = __wands.R, s = R.toScreen(R.fv, x + 0.5, y + 0.5), cv = document.getElementById('cv').getBoundingClientRect(); return { x: cv.left + s[0] * cv.width / 1600, y: cv.top + s[1] * cv.height / 900, dir: f.grid[i].dir }; });
  await page.mouse.move(r.x, r.y); await page.waitForTimeout(200); await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  const bs = await ev(() => [__wands.G.selected, __wands.G.placeDir]);
  ok(bs[0] === 'belt' && bs[1] === r.dir, 'Q over a belt takes the belt tool and its direction', JSON.stringify([bs, r.dir]));
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(100);

  // ================= 5. hold right-click on a building to move it =================
  await ev(() => { __wands.UI.select('hand'); __wands.G.hands.length = 0; });
  hp = await harnessPos(); await page.mouse.move(hp.x, hp.y); await page.waitForTimeout(250);
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => !!__wands.G.carryHold || !!__wands.G.carry, null, { timeout: 8000 }).catch(() => {});
  r = await ev(() => !!__wands.G.carryHold || !!__wands.G.carry); ok(r, 'holding right-click on a building starts the lift (the ring fills)');
  await page.waitForFunction(() => !!__wands.G.carry, null, { timeout: 20000 }).catch(() => {});
  r = await ev(() => !!__wands.G.carry); ok(r, 'after the hold the building is lifted');
  const before = await ev(() => { const b = __wands.G.fac.bld.find(b => b.type === 'harness'); return [b.x, b.y]; });
  const spot = await ev(() => { const G = __wands.G, f = G.fac, FA = __wands.FA, R = __wands.R; for (let y = 8; y < 30; y++) for (let x = 4; x < 40; x++) if (FA.owned(x, y) && !f.grid[y * f.w + x] && !FA.isPile(x, y) && Math.hypot(x - 21, y - 15) > 3) { const s = R.toScreen(R.fv, x + 0.5, y + 0.5), cv = document.getElementById('cv').getBoundingClientRect(); return { x: cv.left + s[0] * cv.width / 1600, y: cv.top + s[1] * cv.height / 900, t: [x, y] }; } return null; });
  await page.mouse.move(spot.x, spot.y, { steps: 6 }); await page.waitForTimeout(200);
  await page.mouse.up({ button: 'right' }); await page.waitForTimeout(250);
  const after = await ev(() => { const b = __wands.G.fac.bld.find(b => b.type === 'harness'); return [b.x, b.y, !!__wands.G.carry]; });
  ok(!after[2] && (after[0] !== before[0] || after[1] !== before[1]), 'letting go sets it down where the ghost was', JSON.stringify([before, spot.t, after]));
  r = await ev(() => { const G = __wands.G; G.hands.length = 0; G.hands.push({ kind: 'wood' }); return 1; });
  hp = await harnessPos(); await page.mouse.move(hp.x, hp.y); await page.waitForTimeout(200);
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(900);
  r = await ev(() => !!__wands.G.carry); await page.mouse.up({ button: 'right' });
  ok(!r, 'with something in hand right-click throws and never lifts a building');
  await ev(() => { __wands.G.hands.length = 0; });

  // ================= 6. the building note shows a bolt, not "PWR" =================
  await ev(() => { const G = __wands.G, h = G.fac.bld.find(b => b.type === 'harness'); G.bd.x = h.x + 1.5; G.bd.y = h.y + 0.5; __wands.step(0.05, 10); });
  await page.waitForTimeout(500);
  r = await ev(() => document.getElementById('inspect').innerHTML);
  ok(!/PWR/.test(r) && /<img/.test(r) && !/\{pwr\}/.test(r), 'the building note ends with the bolt icon instead of PWR', r.slice(0, 60));

  // ================= 7. the Wizard's big map =================
  await ev(() => { __wands.G.w.mapBig = false; __wands.G.w.mapK = 0; });
  await page.keyboard.press('KeyL'); await page.waitForTimeout(600);
  r = await ev(() => [__wands.G.w.mapBig, __wands.G.w.mapK]); ok(r[0] === true && r[1] === 1, 'the map key blows the map up (G.w.mapBig, the flight finishes)', JSON.stringify(r));
  await shot('bigmap');
  r = await ev(() => { const s = __wands.Snap; return null; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  r = await ev(() => [__wands.G.w.mapBig, __wands.G.w.mapK, __wands.G.paused]); ok(r[0] === false && r[1] === 0 && !r[2], 'Esc closes it again before it pauses the game', JSON.stringify(r));
  await page.click('#btnMap'); await page.waitForTimeout(500);
  r = await ev(() => __wands.G.w.mapBig); ok(r === true, 'the HUD map button opens it too');
  await page.click('#btnMap'); await page.waitForTimeout(500);
  const snap = await ev(() => { const W = __wands; W.G.w.mapBig = true; W.step(0.05, 30); const o = W.snapshot(); return W.Snap.report && { v: W.Snap.report.verdict, leaks: (W.Snap.report.newLeaks || []).length, px: W.Snap.report.diff && W.Snap.report.diff.px }; });
  ok(snap && snap.v !== 'FAIL' && snap.px === 0, 'the photo test passes with the big map open', JSON.stringify(snap));
  await ev(() => { __wands.G.w.mapBig = false; __wands.step(0.05, 30); });

  // ================= 8. the Book: one part's damage, and the total as a note =================
  r = await ev(() => { Book.open(); Book.setPage('spells'); Book.pick('nova'); return null; });
  await page.waitForTimeout(400);
  r = await ev(() => ({ n: document.querySelector('.bkb.dmg b').textContent, u: document.querySelector('.bkb.dmg i').textContent, t: (document.querySelector('.bkTot') || {}).textContent }));
  const S = await ev(() => __wands.CFG.spells.nova);
  ok(r.n === '' + S.dmg && r.u === 'BURST' && /TOTAL IF EVERYTHING HITS/.test(r.t), 'the Nova shows ONE part (its burst) as the number and the total as a separate note', JSON.stringify(r));
  r = await ev(() => { const t = {}; for (const id of ['meteor', 'thunder', 'blizzard', 'geyser', 'magma', 'nova', 'gust']) { Book.pick(id); t[id] = document.querySelector('.bkb.dmg b').textContent + ' ' + document.querySelector('.bkb.dmg i').textContent; } return t; });
  ok(Object.keys(r).length === 7 && Object.values(r).every(v => /^[\d.]+ [A-Z ]+$/.test(v)), 'every spell shows a per-part number with its unit', JSON.stringify(r));
  await shot('book');
  r = await ev(() => { Book.setPage('creatures'); Book.pick('slime'); return null; });
  await page.waitForTimeout(300);
  r = await ev(() => { const h = [...document.querySelectorAll('.bkdc')].find(d => /ELITE DROPS/.test(d.textContent)); return h ? [...h.querySelectorAll('.bkd')].map(d => ({ txt: d.textContent, img: (d.querySelector('img') || {}).src ? 1 : 0 })) : null; });
  ok(r && r.length >= 2 && /XP Gems/.test(r[0].txt) && !/Shard/.test(r[0].txt) && /Shard/.test(r[1].txt), 'elite drops: the XP Gems and the Aether Shard are separate lines', JSON.stringify(r && r.map(x => x.txt)));
  await ev(() => Book.close());

  // ================= 9. the Builder's game over screen =================
  await ev(() => { const W = __wands, G = W.G; G.stats.spent = (G.stats.spent || 0) + 7; G.stats.charged = (G.stats.charged || 0) + 2; G.stats.made.flamethrower = (G.stats.made.flamethrower || 0) + 3; G.w.hp = 0; W.WZ.damage(1e6, false, { ic: 'ic_skull', n: 'Test' }); });
  await page.waitForTimeout(2200);
  r = await ev(() => ({ w: !document.getElementById('results').classList.contains('hidden'), b: !document.getElementById('resultsB').classList.contains('hidden'), t: document.getElementById('resultsB').innerText.replace(/\n/g, ' | ') }));
  ok(r.w && r.b && /BUILDER: GAME OVER/.test(r.t) && /Spells crafted \| 3/.test(r.t) && /Batteries charged \| 2/.test(r.t) && /Resources spent \| 7/.test(r.t), 'the Builder gets his own game over screen with his own numbers', r.t.slice(0, 190));
  await shot('gameover');
  r = await ev(() => ({ b: !!document.getElementById('rReB') && document.getElementById('resultsB').contains(document.getElementById('rReB')), w: document.getElementById('results').contains(document.getElementById('rReW')), wb: document.getElementById('results').contains(document.getElementById('rReB')) }));
  ok(r.b && r.w && !r.wb, 'each screen holds its own player\'s RESTART button');
  await page.click('#rReB'); await page.waitForTimeout(250);
  r = await ev(() => JSON.stringify(__wands.G.w.ready)); ok(r === '{"B":true,"W":false}', 'the Builder readies from his own screen', r);
  await page.click('#rReW'); await page.waitForTimeout(600);
  r = await ev(() => [__wands.G.w.dead, document.getElementById('results').classList.contains('hidden'), document.getElementById('resultsB').classList.contains('hidden')]);
  ok(r[0] === false && r[1] && r[2], 'both ready: the run restarts and both screens close', JSON.stringify(r));

  ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' / '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
