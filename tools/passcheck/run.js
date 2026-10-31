'use strict';
// The 2026-10-31 request pass: goals count from the moment they show, goal XP pours out as gems, what he picked up floats over his head, the Aether Shard moment, loose boulders
// moved by spells, ash and lava with the thermometer, water creatures on water, the Alchemy Cauldron (one spell in, a potion out, Health / Armor mode), the new armor rule,
// the drop rates, the removed tree tracks, forage progress that never fades, the emote button, walking through blueprints, the snapshot.
//   node tools/passcheck/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
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
      step: (n, o) => { o = o || {}; for (let i = 0; i < n; i++) W.Main.step(0.05, { bix: o.bix || 0, biy: o.biy || 0, wix: o.ix || 0, wiy: o.iy || 0, wrx: 0, wry: 0, roll: !!o.roll, act: o.act || {}, broll: false }); },
      clear: () => { const q = w(); q.enemies.length = 0; q.allies.length = 0; q.aq.length = 0; q.proj.length = 0; q.eproj.length = 0; q.aproj.length = 0; q.zones.length = 0; q.timers.length = 0; q.fx_.length = 0; q.drops.length = 0; q.mines.length = 0; q.booms.length = 0; q.pickups.length = 0; q.arcs.length = 0; },
    };
    W.G.fac.floor.length = 0;
  });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };

  // ================= 1. goals count from when they show =================
  let r = await run(() => {
    const W = __wands, G = W.G, UI = W.UI, o = {};
    const iK = QUESTS.W.findIndex(q => q.text === 'Defeat 15 monsters');
    G.quest.W = iK; G.qbase.W = null; G.stats.kills = 100; UI.qSince = {};
    UI.questSide('W');
    o.base = G.qbase.W; o.stay = G.quest.W === iK;
    G.stats.kills = 114; UI.qSince.W.t -= 5000; UI.questSide('W'); o.not14 = G.quest.W === iK;
    G.stats.kills = 115; UI.qSince.W.t -= 5000; UI.questSide('W'); o.done = G.quest.W === iK + 1;
    // a goal whose thing already happened before it showed still waits: the Builder's "feed the Battery"
    const iB = QUESTS.B.findIndex(q => /^Feed the Battery/.test(q.text));
    G.quest.B = iB; G.qbase.B = null; G.stats.fl = G.stats.fl || {}; G.stats.fl.fed = 50; UI.qSince = {};
    UI.questSide('B'); o.bStay = G.quest.B === iB;
    G.stats.fl.fed = 51; UI.qSince.B.t -= 5000; UI.questSide('B'); o.bDone = G.quest.B === iB + 1;
    // a plain done() goal never completes in its first moments either
    const iS = QUESTS.W.findIndex(q => /^Scout the Stronghold/.test(q.text));
    G.quest.W = iS; G.qbase.W = null; G.flags.scouted = true; UI.qSince = {};
    UI.questSide('W'); o.sStay = G.quest.W === iS; UI.qSince.W.t -= 5000; UI.questSide('W'); o.sDone = G.quest.W === iS + 1;
    G.flags.scouted = false;
    return o;
  });
  ok(r.base === 100 && r.stay && r.not14 && r.done, 'Defeat 15 monsters counts from when the goal showed (100 -> 115), not from the start of the game', JSON.stringify(r));
  ok(r.bStay && r.bDone, 'a Builder goal needs a NEW feeding after it shows', JSON.stringify([r.bStay, r.bDone]));
  ok(r.sStay && r.sDone, 'a plain done() goal waits a few seconds on its card first', JSON.stringify([r.sStay, r.sDone]));
  r = await run(() => {
    const q = QUESTS.W.find(q => /buy any upgrade/.test(q.text)), B = QUESTS.B;
    return { hint: !!q, noRecs: !/Hearty|Zoomies/.test(q ? q.text : ''), allStat: B.slice(0, 7).every(g => g.stat), bat: /Air spell/.test(B.find(g => /^Feed the Battery/.test(g.text)).text) };
  });
  ok(r.hint && r.noRecs && r.allStat && r.bat, 'the Wizard\'s tree goal names no upgrade; the first Builder goals are all fresh-count goals; the Battery goal recommends an Air spell', JSON.stringify(r));
  r = await run(() => { const G = __wands.G, UI = __wands.UI, o = {}; const b0 = G.stats.bought || 0; const id = __wands.CFG.tree.find(t => t.br === 'bld').id; G.xp = 1e6; G.bank = { air: 99, water: 99, fire: 99, earth: 99, shard: 9 }; UI.buy(id); o.n = (G.stats.bought || 0) - b0; return o; });
  ok(r.n === 1, 'buying anything in the skill tree counts for the Wizard\'s tree goal', JSON.stringify(r));

  // ================= 2. a finished goal pays its XP as gems =================
  r = await run(() => {
    const W = __wands, G = W.G, UI = W.UI, WZ = W.WZ, FA = W.FA, o = {}; T.clear(); G.quest.W = QUESTS.W.length; G.quest.B = QUESTS.B.length; G.fac.xpg.length = 0;   // (no goal of its own may complete meanwhile)
    const xp0 = G.xp, q = { xp: 20, text: 'x', icon: 'wood' };
    UI.questDone('W', q); o.drops = G.w.drops.filter(d => d.kind === 'xp').reduce((a, d) => a + d.val, 0); o.xpSame = G.xp === xp0;
    T.step(30); o.got = G.xp - xp0;
    const x1 = G.xp; UI.questDone('B', q); o.gems = FA.gemsPending(); o.bxpSame = G.xp === x1;
    T.step(200); o.bgot = G.xp - x1; o.left = FA.gemsPending();
    return o;
  });
  ok(r.drops === 20 && r.xpSame && r.got === 20, 'the Wizard\'s goal XP flies out as gems and he collects every point', JSON.stringify(r));
  ok(r.gems === 20 && r.bxpSame && r.bgot === 20 && r.left === 0, 'the Builder\'s goal XP pours out as gems on the factory floor and comes back to him', JSON.stringify([r.gems, r.bxpSame, r.bgot, r.left]));

  // ================= 3. what he picked up floats over his head =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}; T.clear();
    w.drops.push({ kind: 'wood', x: w.x, y: w.y, vx: 0, vy: 0, t: 1, val: 1 }); w.drops.push({ kind: 'wood', x: w.x, y: w.y, vx: 0, vy: 0, t: 1, val: 1 });
    T.step(3);
    const f = w.fx_.filter(q => q.type === 'ptext');
    o.n = f.length; o.txt = f[0] && ('+' + f[0].n + ' ' + f[0].name);
    return o;
  });
  ok(r.n === 1 && r.txt === '+2 Wood', 'two Wood picked up together make one floating "+2 Wood"', JSON.stringify(r));

  // ================= 4. the Aether Shard moment =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, w = G.w, o = {}; T.clear(); G.fac.shardPrev = null;
    w.drops.push({ kind: 'shard', x: w.x, y: w.y, vx: 0, vy: 0, t: 1, val: 1 });
    T.step(2); const d = w.drops.find(q => q.kind === 'shard');
    o.lifting = !!d && d.up !== undefined; o.prev = !!G.fac.shardPrev;
    T.step(10); o.still = !!w.drops.find(q => q.kind === 'shard');
    const s0 = G.stock.shard || 0;
    T.step(24); o.gone = !w.drops.some(q => q.kind === 'shard'); o.flying = G.fac.flying.some(q => q.kind === 'shard' && q.stock);
    T.step(60); o.stock = (G.stock.shard || 0) - s0;
    return o;
  });
  ok(r.lifting && r.prev && r.still, 'a picked-up shard rises and hovers first, and the Builder\'s portal shows a preview', JSON.stringify(r));
  ok(r.gone && r.stock === 1, 'then it flies home and lands in the Stockpile', JSON.stringify(r));

  // ================= 5. loose boulders =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG, w = G.w, o = {}; T.clear();
    // open grass with space on the east side
    let spot = null;
    for (let r = 4; r < 80 && !spot; r += 2) for (let a = 0; a < 16 && !spot; a++) {
      const x = w.x + Math.cos(a * 0.4) * r, y = w.y + Math.sin(a * 0.4) * r;
      let free = true; for (let dx = -2; dx <= 14 && free; dx++) for (let dy = -4; dy <= 4 && free; dy++) { const px = x + dx, py = y + dy; if (WZ.blocked(px, py, 1) || WZ.harv.some(h => !h.broken && Math.hypot(h.x - px, h.y - py) < 1.5) || WZ.tile(px, py) === 13) free = false; }
      if (free) spot = [x, y];
    }
    o.spot = !!spot; if (!spot) return o;
    w.x = spot[0]; w.y = spot[1]; w.vx = w.vy = 0;
    const b = { x: w.x + 2, y: w.y, vx: 0, vy: 0, rad: CFG.aug.boulder.r, bld: true, hp: 1e9, flash: 0 }; w.boulders.push(b);
    WZ.ctx = { spell: 'fireball', el: ['fire'], hits: 0, kills: 0, weak: 0 };
    WZ.hurtH(b, 27); WZ.ctx = null;
    o.v1 = Math.hypot(b.vx, b.vy); o.dir = b.vx > 0 && Math.abs(b.vy) < 0.2;
    WZ.ctx = { spell: 'fireball', el: ['fire'], hits: 0, kills: 0, weak: 0 }; WZ.hurtH(b, 27); WZ.hurtH(b, 27); WZ.ctx = null; o.v3 = Math.hypot(b.vx, b.vy);
    // a foe in its path
    const e = WZ.makeEnemy('slime', b.x + 3, b.y, false); e.hp = e.maxHp = 500; e.spd = 0; e.weak = null; e.resist = null; e.dr = 1; e.dmg = 0; e.ai = null;
    const hp0 = e.hp, sp0 = Math.hypot(b.vx, b.vy); let spMin = sp0;
    for (let i = 0; i < 30; i++) { T.step(1); spMin = Math.min(spMin, Math.hypot(b.vx, b.vy)); if (e.hp < hp0) break; }
    o.hit = hp0 - e.hp; o.shoved = Math.hypot(e.x - (b.x + 3), e.y - b.y) > 0.01 || e.hp < hp0;
    o.noSlowByFoe = true;
    // stops by itself
    T.step(200); o.stopped = Math.hypot(b.vx, b.vy) === 0;
    // bounce off water: a wall of pond tiles east of it
    b.x = w.x + 2; b.y = w.y; b.vx = 8; b.vy = 0;
    for (let dy = -3; dy <= 3; dy++) { const i = Math.floor(b.y + dy) * CFG.WW + Math.floor(b.x + 3); WZ.terrain[i] = 5 * 8; }
    T.step(30); o.bounced = b.vx <= 0.01 || b.x < w.x + 4;
    o.vxAfter = b.vx; o.x = b.x - w.x;
    return o;
  });
  ok(r.spot && r.dir && r.v1 > 1 && r.v3 > r.v1 * 2, 'a spell pushes a boulder away from the Wizard, slowly; three spells push it much faster', JSON.stringify([r.v1, r.v3, r.dir]));
  ok(r.hit >= 5 && r.hit <= 30 && r.shoved, 'a rolling boulder hurts a foe 5-30 and shoves it', JSON.stringify([r.hit, r.shoved]));
  ok(r.stopped, 'a boulder slows to a stop on its own');
  ok(r.bounced, 'a boulder bounces off the edge of the water', JSON.stringify([r.vxAfter, r.x]));

  // ================= 6. ash, lava and the thermometer =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG, w = G.w, o = {}; T.clear();
    const set = (dx, dy, t) => { WZ.terrain[Math.floor(w.y + dy) * CFG.WW + Math.floor(w.x + dx)] = t * 8; };
    w.hp = WZ.maxHp(); w.armor = 0; w.burn = 0; w.heat = 0; w.heatT = 0;
    set(3, 0, 10); T.step(10); o.nearAsh = w.heat;   // ash three tiles away: a thermometer
    set(3, 0, 0); set(0, 0, 10); const h0 = w.hp; T.step(6); o.ashLoss = h0 - w.hp; o.heatIn = w.heat;   // standing on ash
    w.hp = WZ.maxHp(); w.burn = 0; set(0, 0, 13); const h1 = w.hp; T.step(6); o.lavaLoss = h1 - w.hp;   // standing on lava
    set(0, 0, 0); w.burn = 0; w.heatT = 0; T.step(10); o.far = w.heat;
    G.aug.worn.robe = 'ember'; set(3, 0, 13); w.heatT = 0; T.step(10); o.cloak = w.heat; G.aug.worn.robe = ''; set(3, 0, 0);
    // the keep's burning field has lava in the middle and ash on both edges
    const K = CFG.strong.gate.fire, m = WZ.marks.find(q => q.type === 'stronghold');
    const cnt = { 10: 0, 13: 0 }; let midLava = 0, edgeAsh = 0;
    if (m && m.el === 'fire') for (let a = 0; a < 6.28; a += 0.05) for (let d = K.r0; d <= K.r1; d += 0.5) { const t = WZ.terrain[Math.floor(m.y + Math.sin(a) * d) * CFG.WW + Math.floor(m.x + Math.cos(a) * d)] >> 3; if (t === 10 || t === 13) cnt[t]++; }
    o.fireKeep = m && m.el === 'fire'; o.cnt = cnt;
    let lava = 0, ash = 0; for (let i = 0; i < WZ.terrain.length; i++) { const t = WZ.terrain[i] >> 3; if (t === 13) lava++; if (t === 10) ash++; }
    o.lava = lava; o.ash = ash;
    return o;
  });
  ok(r.nearAsh === 1 && r.far === 0 && r.cloak === 0, 'a thermometer appears within 4 tiles of ash (and not with the Emberward Cloak)', JSON.stringify([r.nearAsh, r.far, r.cloak]));
  ok(r.ashLoss > 0 && r.lavaLoss > r.ashLoss * 2.5, 'ash burns about a quarter as hard as lava', JSON.stringify([r.ashLoss, r.lavaLoss]));
  ok(r.lava > 0 && r.ash > 0 && r.lava >= r.ash * 0.4, 'the world has both lava and ash tiles', JSON.stringify([r.lava, r.ash, r.cnt]));

  // ================= 7. water creatures walk on water =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG, w = G.w, o = {}; T.clear();
    // a strip of pond between a creature and the Wizard
    let spot = null;
    for (let r = 4; r < 80 && !spot; r += 2) for (let a = 0; a < 16 && !spot; a++) {
      const x = w.x + Math.cos(a * 0.4) * r, y = w.y + Math.sin(a * 0.4) * r;
      let free = true; for (let dx = -2; dx <= 12 && free; dx++) for (let dy = -3; dy <= 3 && free; dy++) { if (WZ.blocked(x + dx, y + dy, 1)) free = false; }
      if (free) spot = [x, y];
    }
    w.x = spot[0]; w.y = spot[1]; w.vx = w.vy = 0;
    for (let dx = 3; dx <= 8; dx++) for (let dy = -3; dy <= 3; dy++) WZ.terrain[Math.floor(w.y + dy) * CFG.WW + Math.floor(w.x + dx)] = 5 * 8;
    const mk = id => { const e = WZ.makeCreature(id, w.x + 10, w.y, { plain: true }); e.hp = e.maxHp = 1e6; e.dmg = 0; return e; };
    const sl = mk('puddle'), im = mk('cinder'); im.y += 1;
    let slOnWater = false, imOnWater = false;
    for (let i = 0; i < 80; i++) { T.step(1); if (WZ.tile(sl.x, sl.y) === 5) slOnWater = true; if (WZ.tile(im.x, im.y) === 5) imOnWater = true; }
    o.sl = slOnWater; o.im = imOnWater; o.swim = [sl.swim, im.swim];
    return o;
  });
  ok(r.sl && r.swim[0] === true, 'a Puddle Slime (Water) walks onto and across water', JSON.stringify(r));
  ok(!r.im && r.swim[1] === false, 'a Cinder Imp (Fire) still stops at the water\'s edge', JSON.stringify(r));

  // ================= 8. the Alchemy Cauldron =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, CFG = W.CFG, o = {};
    // a free floor tile for it
    let spot = null; for (let y = 0; y < FA.H() && !spot; y++) for (let x = 0; x < FA.W() && !spot; x++) if (FA.canPlace(x, y)) spot = [x, y];
    const b = FA.makeBuilding('cauldron', spot[0], spot[1], true, true, 0); FA.setCell(spot[0], spot[1], b); b.done = true;
    o.mode0 = b.mode; o.grown = b.grow === CFG.harness.growT;
    o.takesSpell = FA.canInsert(b, 'water') && FA.canInsert(b, 'flamethrower') && FA.canInsert(b, 'nova'); o.refusesWood = !FA.canInsert(b, 'wood');
    FA.insert(b, 'water', true); o.recipe = b.recipe; o.busy = !FA.canInsert(b, 'air');
    for (let i = 0; i < 10; i++) FA.update(0.5);
    o.out = b.out.map(x => x.kind);
    b.out.length = 0;
    // the values
    o.vals = ['earth', 'fire', 'air', 'water', 'flamethrower', 'nova'].map(k => ITEMS['hp_' + k].val);
    o.avals = ['water', 'air', 'fire', 'earth'].map(k => ITEMS['ap_' + k].val);
    // switching the mode: the potion regrows for 7.5 s and nothing brews meanwhile
    FA.cycleElem(b, 1); o.mode1 = b.mode; o.regrow = b.grow === 0;
    FA.insert(b, 'earth', true); o.recipe2 = b.recipe;
    for (let i = 0; i < 4; i++) FA.update(0.5); o.waiting = b.out.length === 0;
    for (let i = 0; i < 40; i++) FA.update(0.5); o.out2 = b.out.map(x => x.kind);
    return o;
  });
  ok(r.mode0 === 'hp' && r.grown && r.takesSpell && r.refusesWood && r.recipe === 'hp_water' && r.busy && r.out.join() === 'hp_water', 'the Cauldron starts in Health mode, takes ONE spell at a time and brews the potion that spell makes', JSON.stringify(r));
  ok(r.vals.join() === '7,10,12,15,25,64' || (r.vals[0] === 7 && r.vals[3] === 15 && r.vals[4] > 22 && r.vals[5] > r.vals[4]), 'a single Earth spell heals 7, a Water 15, a pair adds up plus a little extra', JSON.stringify(r.vals));
  ok(r.avals[0] === 3 && r.avals[3] === 8, 'an Armor Potion gives 3 (Water) up to 8 (Earth)', JSON.stringify(r.avals));
  ok(r.mode1 === 'ap' && r.regrow && r.recipe2 === 'ap_earth' && r.waiting && r.out2.join() === 'ap_earth', 'F switches the Cauldron to Armor mode: its potion regrows, then it brews the Armor Potion', JSON.stringify([r.mode1, r.regrow, r.recipe2, r.waiting, r.out2]));

  // ================= 9. the armor rule =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG, w = G.w, o = {}; T.clear();
    const hit = (d) => { w.hp = WZ.maxHp(); w.armor = 50; w.hurtT = 0; WZ.damage(d, false, { ic: 'ic_skull', n: 'Test' }); return [Math.round((WZ.maxHp() - w.hp) * 100) / 100, 50 - w.armor]; };
    o.small = hit(5); o.medium = hit(10); o.big = hit(20);
    w.statT = 5; o.stone = hit(100); w.statT = 0;
    w.hp = WZ.maxHp(); w.armor = 0; WZ.damage(10, false, { ic: 'ic_skull', n: 'Test' }); o.none = WZ.maxHp() - w.hp;
    return o;
  });
  ok(r.small[0] === 1.5 && r.small[1] === 2 && r.medium[0] === 3 && r.medium[1] === 3 && r.big[0] === 6 && r.big[1] === 5, 'armor cuts every hit by 70% and loses 2 / 3 / 5 points for a small / medium / big hit', JSON.stringify([r.small, r.medium, r.big]));
  ok(Math.abs(r.stone[0] - 9) < 0.01 && r.none === 10, 'with the Statue on top it is 91%; no armor, no cut', JSON.stringify([r.stone, r.none]));

  // ================= 10. drop rates =================
  r = await run(() => {
    const W = __wands, WZ = W.WZ, w = W.G.w, o = {}; T.clear();
    const rate = mk => { w.drops = []; for (let i = 0; i < 3000; i++) { const e = mk(); WZ.onDeath(e); w.enemies.length = 0; } const cnt = {}; for (const d of w.drops) cnt[d.kind] = (cnt[d.kind] || 0) + 1; return { common: ((cnt.wood || 0) + (cnt.stone || 0)) / 3000, iron: (cnt.iron || 0) / 3000, pk: ((cnt.fire || 0) + (cnt.water || 0) + (cnt.air || 0) + (cnt.earth || 0)) / 3000 }; };
    const make = (mut, elite) => () => { const e = WZ.makeCreature('cinder', w.x + 3, w.y, { plain: true }); e.crafted = true; if (mut) e.mut = 'swift'; if (elite) e.elite = true; return e; };
    o.n = rate(make()); o.m = rate(make(true)); o.e = rate(make(false, true));
    return o;
  });
  ok(Math.abs(r.n.common - 0.2) < 0.03 && Math.abs(r.n.iron - 0.1) < 0.025 && Math.abs(r.n.pk - 0.25) < 0.035, 'a kill drops Wood / Stone 20%, Iron 10%, a spell 25%', JSON.stringify(r.n));
  ok(Math.abs(r.m.common - 0.4) < 0.04 && Math.abs(r.m.iron - 0.2) < 0.035 && Math.abs(r.e.common - 0.6) < 0.045 && Math.abs(r.e.iron - 0.3) < 0.04, 'mutants roll twice as often, elites three times', JSON.stringify([r.m, r.e]));

  // ================= 11. the tree, forage, the emote button, blueprints =================
  r = await run(() => {
    const W = __wands, G = W.G, CFG = W.CFG, WZ = W.WZ, FA = W.FA, o = {};
    o.tree = ['remedies', 'wardwoven', 'magnet'].some(id => CFG.tree.find(t => t.id === id));
    o.branch = CFG.branches.find(b => b.id === 'wiz').nodes.join();
    G.tree.remedies = 2; G.tree.magnet = 1; const xp0 = G.xp; const back = W.Main.refundTree(); o.refund = back && back.xp > 0; o.gone = !G.tree.remedies && !G.tree.magnet; o.xpUp = G.xp > xp0;
    const f = WZ.forage[0]; G.w.x = f.x; G.w.y = f.y; f.prog = 3; f.lastT = G.w.t - 10; T.step(100); o.prog = f.prog;
    o.btn = !!document.getElementById('btnEmote');
    document.getElementById('btnEmote').click(); o.wheel = !!(W.Main.emoteClick || G.w.wheel); T.step(2);
    let spot = null; for (let y = 0; y < FA.H() && !spot; y++) for (let x = 0; x < FA.W() && !spot; x++) if (FA.canPlace(x, y)) spot = [x, y];
    const bp = FA.makeBuilding('forge', spot[0], spot[1], false, false, 0); FA.setCell(spot[0], spot[1], bp);
    o.bpSolid = FA.solid(spot[0], spot[1]); bp.done = true; o.doneSolid = FA.solid(spot[0], spot[1]);
    return o;
  });
  ok(!r.tree && !/remedies|wardwoven|magnet/.test(r.branch), 'Remedies, Wardwoven and Loot Magnet are out of the tree', r.branch);
  ok(r.refund && r.gone && r.xpUp, 'a save that owned them gets its XP back and the keys are dropped');
  ok(r.prog === 3, 'a half-dug forage spot keeps its progress', String(r.prog));
  ok(r.btn && r.wheel, 'the emote wheel has its own button (click opens it)');
  ok(r.bpSolid === false && r.doneSolid === true, 'the Builder can walk through an unfinished building, not a finished one');

  // ================= 12. the threat panel and the hurt arrow, on screen =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, WZ = W.WZ, w = G.w; T.clear();
    FA.threat(['water', 'earth'], 'slime', 'MUTANT SPAWNED');
    w.hurt = { ic: 'slime', n: 'Slime', ax: w.x + 3, ay: w.y + 1, el: 'water', t: 0.2, soft: false, d: 3 };
    FA.shardPreview(); w.heat = 2; w.heatT = 5;
    w.drops.push({ kind: 'shard', x: w.x + 1, y: w.y, vx: 0, vy: 0, t: 1, val: 1, up: 1.3 });
    const b = { x: w.x - 3, y: w.y + 2, vx: 3, vy: 1, rad: 0.7, bld: true, hp: 1e9, flash: 0 }; w.boulders.push(b);
    FA.gemBurst(9);
    return true;
  });
  await page.waitForTimeout(500);
  await shot('pass-on-screen');
  r = await run(() => { const S = __wands.Snap; __wands.snapshot(); return S.report ? { v: S.report.verdict, leaks: JSON.stringify(S.report.leaks.filter(l => !l.known).concat((S.report.issues || []).filter(i => !i.known), S.report.diff && S.report.diff.px ? [S.report.diff] : [])).slice(0, 1200) } : null; });
  ok(r && (r.v === 'PASS' || r.v === 'KNOWN'), 'the photo test passes with the new state on screen', JSON.stringify(r));
  ok(errs.length === 0, 'no page errors in the whole run', errs.slice(0, 4).join(' | '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
