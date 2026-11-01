'use strict';
// The 2026-11-01 request pass (headless, offline): remappable keys (Keys, js/keys.js), the Q pipette, moving a building by holding right-click, the Wizard's big map, the Builder's own game over
// screen, the Book's per-part spell damage and the separate elite Shard line, the bolt icon in the building note, the new building prices / resource yields / drop rates, the starter factory's
// egg route; and the second batch of that day: hotbar (no Hand slot, Forge on its own, the slot key toggles), the random starting Harvester + its goals, what the Wizard has met surviving a death,
// right-click cancelling a tool before throwing, the ? station stepping aside, the Stockpile tag, the goal arrow's distance and its way round the threat panel, the wand HUD.   node tools/keycheck/run.js        (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
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
  await ev(() => { Keys.set('wDodge', 'KeyJ'); Keys.set('treeB', 'KeyU'); Keys.set('slot2', 'KeyK'); __wands.UI.keyChips(true); });
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
  r = await ev(() => [__wands.G.selected, document.querySelector('#hotbar .slot:nth-child(2) kbd').textContent, document.querySelector('#btnTree kbd').textContent]);
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
  ok(r === await ev(() => Keys.list.filter(a => !a.m3).length), 'Settings > KEYS lists every action (the 3-player ones only in a 3P game)', '' + r);
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

  // ================= 10. the hotbar =================
  r = await ev(() => ({ bar: __wands.CFG.hotbar.join(), craft: __wands.CFG.families.craft.members.join(), dom: [...document.querySelectorAll('#hotbar .slot')].map(s => s.dataset.id).join() }));
  ok(r.bar === 'belt,harness,tiles,forge,craft,power,logi,spawn,bots' && r.craft === 'cauldron,anvil' && r.dom === r.bar, 'the hotbar has no Hand slot, the Forge on its own and Floor Tiles right after the Harvester', r.dom);
  await ev(() => { __wands.UI.select('hand'); });
  await page.keyboard.press('Digit5'); await page.waitForTimeout(120); const s1 = await ev(() => __wands.G.selected);
  await page.keyboard.press('Digit5'); await page.waitForTimeout(120); const s2 = await ev(() => __wands.G.selected);
  await page.keyboard.press('Digit4'); await page.waitForTimeout(120); const s3 = await ev(() => __wands.G.selected);
  await page.keyboard.press('Digit4'); await page.waitForTimeout(120); const s4 = await ev(() => __wands.G.selected);
  ok(s1 === 'cauldron' && s2 === 'anvil' && s3 === 'forge' && s4 === 'forge', 'pressing the key of the slot you are on switches the building inside it (a single building stays)', [s1, s2, s3, s4].join());
  await ev(() => __wands.UI.select('hand'));

  // ================= 11. right-click puts the tool away before it throws =================
  await ev(() => { const G = __wands.G; G.hands.length = 0; G.hands.push({ kind: 'wood' }, { kind: 'wood' }); __wands.UI.select('battery'); });
  await page.mouse.move(150, 500); await page.waitForTimeout(150);
  const handsBefore = await ev(() => __wands.G.hands.length);
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(250);
  r = await ev(() => ({ sel: __wands.G.selected, hands: __wands.G.hands.length }));
  await page.mouse.up({ button: 'right' }); await page.waitForTimeout(100);
  ok(r.sel === 'hand' && r.hands === handsBefore, 'right-click with a tool active and items in hand puts the tool away and throws nothing', JSON.stringify(r));
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(250); r = await ev(() => __wands.G.hands.length); await page.mouse.up({ button: 'right' });
  ok(r < handsBefore, 'the next right-click throws', 'hands ' + handsBefore + ' -> ' + r);
  await ev(() => { __wands.G.hands.length = 0; });

  // ================= 12. what the Wizard has met survives his death and a save =================
  r = await ev(() => { const W = __wands, G = W.G; G.flags.seen = G.flags.seen || {}; G.flags.seen.imp = true; G.w.hp = 0; G.w.dead = true; W.WZ.reenter(); return { still: !!G.flags.seen.imp, w: G.w.seen === undefined || !G.w.seen.imp }; });
  ok(r.still && r.w, 'a foe type he has met stays met after he dies (no first-sighting panel again)', JSON.stringify(r));
  r = await ev(() => { const W = __wands; W.Main.save(); const s = JSON.parse(localStorage.getItem('wands2_save_slot1')); return !!(s.flags.seen && s.flags.seen.imp); });
  ok(r, 'and the save keeps it');

  // ================= 13. a random starting Harvester, and goals that follow it =================
  const goals = {};
  for (const el of ['air', 'water', 'fire', 'earth']) {
    goals[el] = await page.evaluate(el0 => { const W = __wands; W.start(1, el0); W.step(0.05, 5); W.UI.updateHud(0.05); const G = W.G, hs = G.fac.bld.filter(b => b.type === 'harness'); return { flag: G.flags.startEl, hs: hs.map(b => b.el).join(), gather: QUESTS.B.find(q => q.id === 'gather').text, h0: QUESTS.B.find(q => q.id === 'hatch0').text, sw: QUESTS.B.find(q => q.id === 'swEl').text }; }, el);
  }
  ok(['air', 'water', 'fire', 'earth'].every(el => goals[el].flag === el && goals[el].hs === el && goals[el].gather.indexOf(el[0].toUpperCase() + el.slice(1)) > 0), 'a new world starts with the Harvester on the chosen element and the hand-gather goal names it', JSON.stringify(goals.fire));
  ok(!/Air/.test(goals.water.gather + goals.water.h0) && /Switch a Harvester to Air/.test(goals.water.sw) && /Switch a Harvester to Water/.test(goals.air.sw), 'the goals say Water for a Water start and walk through the other elements', goals.water.sw);
  r = await ev(() => { const n = {}, M = __wands.Main; for (let i = 0; i < 80; i++) { M.newGame(1); n[__wands.G.flags.startEl] = 1; } return Object.keys(n).length; });
  ok(r >= 3, 'with no element asked for, a new world rolls the element at random', r + ' of 4 seen in 80 worlds');
  await ev(() => { __wands.start(1, 'air'); __wands.step(0.05, 30); __wands.G.w.hp = 1e5; });

  // ================= 14. the ? station steps aside for a Floor Tile =================
  r = await ev(() => { const W = __wands, FA = W.FA, G = W.G, q = FA.qTile(); G.stock.wood = 50; G.stock.stone = 50; const a = FA.tileAnchor(q.x, q.y); const b = a ? FA.place('expand', a[0], a[1], 0) : null; const q2 = FA.qTile(); return { placed: !!b, moved: q2.x !== q.x || q2.y !== q.y, free: !FA.owned(q2.x, q2.y) && !G.fac.grid[q2.y * G.fac.w + q2.x] }; });
  ok(r.placed && r.moved && r.free, 'a Floor Tile can be placed over the ? block and the block moves to a free tile beside the floor', JSON.stringify(r));

  // ================= 15. the Stockpile tag and three items =================
  r = await ev(() => __wands.CFG.stockShow);
  ok(r === 3, 'a Stockpile pile draws 3 items', '' + r);

  // ================= 16. the goal arrow hangs close and gets out of the threat panel's way =================
  r = await ev(() => { const W = __wands, G = W.G; G.quest.B = 2; W.step(0.05, 5); const h = W.R.hint; return h && { lift: h.lift }; });
  ok(r && r.lift <= 160, 'the Builder goal arrow hangs close to its target (lift)', JSON.stringify(r));
  r = await ev(() => { const W = __wands; W.FA.threat(['water'], 'ic_skull', 'ELITE SPAWNED'); W.step(0.05, 6); const t = W.R.threatRect(W.R.fv); return !!t && t.w > 0; });
  ok(r, 'the threat panel has a rectangle the arrow can avoid (R.threatRect)');
  await page.waitForTimeout(500); await shot('goalarrow');

  // ================= 17. the wand HUD: Cycle on both sides, Cast only on the charged selection =================
  r = await ev(() => { const G = __wands.G; for (const e of ['air', 'water', 'fire', 'earth']) { G.wand.m[e] = 0; G.wand.full[e] = false; } G.wand.armed = null; __wands.UI.updateWand(); const row = document.getElementById('wandRow'); return { cyc: row.querySelectorAll('.wc').length, cast: row.querySelectorAll('em.cast').length, dim: row.querySelectorAll('.wc.off').length }; });
  ok(r.cyc === 2 && r.cast === 0 && r.dim === 2, 'nothing charged: Cycle shows on both sides (dimmed) and there is no Cast button', JSON.stringify(r));
  r = await ev(() => { const G = __wands.G; G.wand.m.fire = 8; G.wand.full.fire = true; G.wand.m.water = 9; G.wand.full.water = true; G.wand.armed = 'water'; G.wand.fx = null; __wands.UI.updateWand(); const row = document.getElementById('wandRow'), em = row.querySelector('em.cast'); return { cast: row.querySelectorAll('em.cast').length, over: em && em.parentElement.querySelector('.ws.armed') ? 1 : 0, dim: row.querySelectorAll('.wc.off').length }; });
  ok(r.cast === 1 && r.over === 1 && r.dim === 0, 'with a charged selection the Cast button floats over exactly that slot, which pulses', JSON.stringify(r));
  r = await ev(() => { const W = __wands, G = W.G, a = G.wand.armed; W.WZ.wandCycle(1); const b = G.wand.armed; W.WZ.wandCycle(-1); return [a, b, G.wand.armed]; });
  ok(r[0] === 'water' && r[1] === 'fire' && r[2] === 'water', 'Cycle goes forward and back through the charged attacks', r.join());
  await shot('wandhud');

  ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' / '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
