'use strict';
// The 2026-10-29 feature pass: shake-loose cue, allies feel the wand, belt-line chip + auto-connect link, drag to delete, the guest's hearing, the Altar's crater and wisps, emotes.
//   node tools/featcheck/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
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
  // (the boot screen's click / key listener is armed until the studio intro has been started and skipped: a real mouse press later would otherwise start it mid-test)
  await page.waitForTimeout(800); await page.mouse.click(400, 300); await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu, null, { timeout: 20000 });
  await page.evaluate(() => { __wands.UI.show('loading', false); __wands.start(1); __wands.UI.help(false); __wands.G.helpT = 0; if (__wands.G.paused) __wands.Main.pause(false); });
  await page.evaluate(() => {
    const W = __wands, w = () => W.G.w;
    W.CFG.world.cap = 0;
    for (const el of ['air', 'water', 'fire', 'earth']) W.CFG.harness[el].cycle = 1e9;
    window.T = {
      step: (n, o) => { o = o || {}; for (let i = 0; i < n; i++) W.Main.step(0.05, { bix: 0, biy: 0, wix: o.ix || 0, wiy: o.iy || 0, wrx: 0, wry: 0, roll: !!o.roll, act: o.act || {}, broll: false }); },
      clear: () => { const q = w(); q.enemies.length = 0; q.allies.length = 0; q.aq.length = 0; q.proj.length = 0; q.eproj.length = 0; q.zones.length = 0; q.timers.length = 0; q.fx_.length = 0; },
      ally: (dx, dy, id = 'pebble') => { const q = w(), a = W.WZ.spawnAlly(id); a.x = q.x + dx; a.y = q.y + dy; a.fall = 0; a.dazeT = 0; a.hp = a.maxHp; return a; },
    };
  });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
  const wait = ms => page.waitForTimeout(ms);

  // ================= 1. emotes =================
  let r = await run(() => {
    const W = __wands, G = W.G, o = {}; T.clear();
    T.step(1, { act: { emote: true } });
    o.wheel = !!G.w.wheel;
    T.step(2, { ix: -1 });           // left = Earth
    o.sel = G.w.wheel && G.w.wheel.sel;
    T.step(1, { act: { emote: true } });
    o.emote = G.w.emote && G.w.emote.el; o.wheelGone = !G.w.wheel; o.stk = G.w.stk && G.w.stk.el;
    T.step(30);
    o.t = G.w.emote && G.w.emote.t > 1;
    o.stillHere = Math.hypot(G.w.vx, G.w.vy) < 1e-6;
    T.step(1, { ix: 1 });
    o.ended = G.w.emote === null;
    T.step(80);
    o.stkGone = G.w.stk === null;
    o.all = [];
    for (const [ix, iy, el] of [[0, -1, 'air'], [1, 0, 'fire'], [0, 1, 'water']]) { T.step(1, { act: { emote: true } }); T.step(1, { ix, iy }); T.step(1, { act: { mash: true } }); o.all.push(!!(G.w.emote && G.w.emote.el === el)); T.step(1, { ix: 1 }); }
    T.step(1, { act: { emote: true } }); T.step(1, { roll: true }); o.cancel = !G.w.wheel && !G.w.emote;
    return o;
  });
  ok(r.wheel, 'the emote key opens the wheel'); ok(r.sel === 'earth', 'left picks Earth', r.sel);
  ok(r.emote === 'earth' && r.wheelGone, 'the key again starts the dance and closes the wheel', r.emote);
  ok(r.stk === 'earth', 'a sticker for the Builder'); ok(r.t, 'the dance keeps running'); ok(r.stillHere, 'he stays put while dancing');
  ok(r.ended, 'moving ends the dance'); ok(r.stkGone, 'the sticker leaves after a few seconds');
  ok(r.all.every(Boolean), 'air / fire / water emotes all start from the wheel', JSON.stringify(r.all)); ok(r.cancel, 'roll cancels the wheel');
  for (const el of ['air', 'water', 'fire', 'earth']) {
    await run(e => { T.step(1, { ix: 1 }); __wands.WZ.emoteStart(e); }, el);
    await wait(900);
    await shot('emote_' + el);
  }
  await run(() => { T.step(1, { ix: 1 }); T.step(1, { act: { emote: true } }); });
  await wait(500); await shot('emote_wheel');
  await run(() => { T.step(1, { roll: true }); });

  // ================= 2. allies feel the wand =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {}; T.clear();
    const a = T.ally(2, 0), b = T.ally(-2, 1), far = T.ally(14, 0);
    WZ.wandAir(WZ.wandCtx('air'));
    o.inv = [a.invT, b.invT, far.invT]; o.invOk = a.invT > 0 && b.invT > 0 && !(far.invT > 0);
    a.invT = b.invT = 0;
    a.hp = a.maxHp * 0.2; const hp0 = a.hp;
    G.w.fx = 1; G.w.fy = 0; G.w.invisT = 0;
    WZ.wandWater(WZ.wandCtx('water'));
    T.step(40);
    o.heal = [hp0, a.hp, a.healT];
    T.clear(); const c = T.ally(1.5, 0); const c0 = c.hp;
    WZ.wandFire(WZ.wandCtx('fire'));
    G.w.zones[0].pts.push({ x: c.x, y: c.y, a: 0 });
    T.step(2);
    o.burn = [c.burnT > 0, c.hp === c0];
    T.step(8);
    o.trail = G.w.zones.some(z => z.kind === 'ftrail' && z.afire && z.pts.length > 0);
    T.clear(); const d = T.ally(1, 1), d0 = d.hp;
    WZ.wandEarth(WZ.wandCtx('earth')); G.w.statT = 0.01; T.step(2);
    o.stone = d.stoneT; WZ.hurtAlly(d, 10, 0, 0); o.halfDmg = d0 - d.hp;
    return o;
  });
  ok(r.invOk, 'Vanishing Puff hides the allies in its burst only', JSON.stringify(r.inv));
  ok(r.heal[1] > r.heal[0] * 2, 'Riding Wave heals an ally it passes', JSON.stringify(r.heal));
  ok(r.burn[0] && r.burn[1], 'the Flame Trail lights an ally without hurting it', JSON.stringify(r.burn)); ok(r.trail, 'a burning ally lays a fire trail');
  ok(r.stone > 3 && Math.abs(r.halfDmg - 5) < 0.01, 'the Statue burst turns allies to stone: half damage', r.stone + ' ' + r.halfDmg);
  await run(() => { T.clear(); const a = T.ally(2, 0), b = T.ally(-2, 1, 'zephyr'), c = T.ally(0, 2, 'puddle'), d = T.ally(3, 2, 'cinder'); a.invT = 2; b.burnT = 2; c.stoneT = 3; d.healT = 1; });
  await wait(300); await shot('ally_buffs');

  // ================= 3. belt line chip + the green link, drag to delete (a real mouse drag) =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {}; T.clear();
    let sx = -1, sy = -1;
    for (let y = 0; y < FA.H() && sx < 0; y++) for (let x = 0; x < FA.W() - 12; x++) { let f = true; for (let i = 0; i < 12; i++) if (!FA.canPlace(x + i, y)) { f = false; break; } if (f) { sx = x; sy = y; break; } }
    o.found = sx >= 0;
    if (!o.found) return o;
    G.stock.wood = 50; G.stock.stone = 50; G.stock.iron = 50;
    const sp = FA.place('splitter', sx + 8, sy, 0); sp.done = true; sp.got = {}; o.sp = !!sp;
    G.bd.x = sx + 4.5; G.bd.y = sy + 3.5; G.bd.target = null;
    o.sx = sx; o.sy = sy; o.w0 = G.stock.wood;
    __wands.UI.select('belt');
    return o;
  });
  ok(r.found && r.sp, 'a free row for the test line', JSON.stringify(r));
  await wait(1500);
  // where a tile's centre is on the page
  const tilePt = async (x, y) => page.evaluate(([x, y]) => {
    const R = __wands.R, p = R.toScreen(R.fv, x + 0.5, y + 0.5), b = document.getElementById('cv').getBoundingClientRect();
    return { x: b.left + p[0] * b.width / __wands.CFG.W, y: b.top + p[1] * b.height / __wands.CFG.H };
  }, [x, y]);
  const a0 = await tilePt(r.sx, r.sy), a1 = await tilePt(r.sx + 8, r.sy);
  await page.mouse.move(a0.x, a0.y); await wait(100);
  await page.mouse.down();
  await page.mouse.move((a0.x + a1.x) / 2, (a0.y + a1.y) / 2, { steps: 6 });
  await page.mouse.move(a1.x, a1.y, { steps: 6 });
  await wait(400);
  let d = await run(() => { const G = __wands.G; return G.drag ? { n: G.drag.path.length, into: !!G.drag.path[G.drag.path.length - 1].into, px: G.drag.px != null } : null; });
  ok(d && d.n >= 7 && d.into && d.px, 'dragging a belt line to a Splitter: the path, the tile it points into, the cursor point', JSON.stringify(d));
  await shot('belt_drag_link');
  await page.mouse.up(); await wait(300);
  r.after = await run(([sx, sy, w0]) => { const G = __wands.G, FA = __wands.FA; return { built: FA.cell(sx + 3, sy) && FA.cell(sx + 3, sy).type === 'belt', n: G.fac.belts.filter(b => b.y === sy && b.x >= sx && b.x < sx + 8).length, cost: w0 - G.stock.wood }; }, [r.sx, r.sy, r.w0]);
  ok(r.after.built && r.after.n >= 7 && r.after.cost === r.after.n, 'the line is laid when the button comes up', JSON.stringify(r.after));
  // a line that runs out of Wood shows the shortfall
  const sh = await run(([sx, sy]) => { const FA = __wands.FA, G = __wands.G; G.stock.wood = 3; const p = FA.beltPath(sx, sy + 2, sx + 7, sy + 2, 0); G.stock.wood = 50; return p.filter(s => s.st === 'wood').length; }, [r.sx, r.sy]);
  ok(sh >= 4, 'a line knows how much Wood it lacks', sh);

  // drag to delete
  await run(() => { __wands.G.demolish = true; });
  await page.mouse.move(a0.x, a0.y); await wait(100);
  await page.mouse.down();
  await page.mouse.move((a0.x + a1.x) / 2, (a0.y + a1.y) / 2, { steps: 6 });
  await wait(400);
  d = await run(() => { const G = __wands.G, FA = __wands.FA; return G.drag && G.drag.del ? { del: G.drag.path.filter(s => s.st === 'del').length, sum: JSON.stringify(FA.refundSum(G.drag.path)) } : null; });
  ok(d && d.del >= 4, 'the delete line marks every belt on it and totals the refund', JSON.stringify(d));
  await shot('delete_drag');
  const w1 = await run(() => __wands.G.stock.wood), n1 = await run(([sx, sy]) => __wands.G.fac.belts.filter(b => b.y === sy && b.x >= sx && b.x < sx + 8).length, [r.sx, r.sy]);
  await page.mouse.up(); await wait(300);
  const gone = await run(([sx, sy, w1, n]) => { const G = __wands.G; return { left: G.fac.belts.filter(b => b.y === sy && b.x >= sx && b.x < sx + 8).length, refund: G.stock.wood - w1, n }; }, [r.sx, r.sy, w1, d ? d.del : 0]);
  ok(gone.left === n1 - (d ? d.del : 0) && gone.refund === (d ? d.del : -1), 'releasing deletes the line and refunds every belt', JSON.stringify(gone));
  await run(() => { __wands.G.demolish = false; __wands.UI.select('hand'); });

  // ================= 4. shake cue =================
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {};
    const pile = FA.pileList().find(p => p.n > 0);
    G.fac.shk = [{ i: Math.floor(pile.y) * G.fac.w + Math.floor(pile.x), k: 'stock', kind: pile.kind, t: 0 }];
    for (let i = 0; i < 15; i++) FA.update(0.05);
    o.flash = G.fac.shkFlash > 0; o.ring = G.fac.rings.length > 0;
    return o;
  });
  await wait(250);
  r.card = await run(() => document.getElementById('powCard').classList.contains('shk') && document.getElementById('handCard').classList.contains('shk'));
  ok(r.flash && r.ring, 'a shaken-loose item thumps the floor and sets the flash', JSON.stringify(r)); ok(r.card, 'the POWER and HANDS cards flash');

  // ================= 5. the guest's hearing =================
  r = await run(() => {
    const W = __wands, o = {};
    AU.setEar(10, 10);
    o.near = AU.farK(12, 10); o.mid = AU.farK(30, 10); o.far = AU.farK(200, 10); o.none = AU.farK(null, null);
    AU.setEar(null); o.off = AU.farK(200, 10);
    const G = W.G; Net.on = true; Net.role = 'host';
    AU.sfx('kill', 5.123, 6.789);
    const q = G.snd && G.snd.list[G.snd.list.length - 1];
    o.log = !!q && q.s === 'kill' && q.x === 5.1 && q.y === 6.8;
    Net.on = false; Net.role = null; G.snd = undefined;
    return o;
  });
  ok(r.near === 1 && r.mid < 1 && r.mid > 0.12 && r.far === 0.12 && r.none === 1 && r.off === 1, 'distance scales a sound: full near, quieter far, floored, no ear = full', JSON.stringify(r));
  ok(r.log, 'the host logs where a sound was made');

  // ================= a pickable item at the Builder's feet: its focus ring must match in the photo (R.pickOf matches the copy by place and kind) =================
  await run(() => { const W = __wands, G = W.G; T.clear(); G.hands.length = 0; G.demolish = false; W.UI.select('hand'); G.bd.target = null; G.lastInput = 'kb'; G.fac.floor.length = 0; W.FA.dropAt('wood', G.bd.x + 0.7, G.bd.y); });
  await wait(700);
  r = await run(() => { const W = __wands, o = {}; o.ring = !!(W.R.focus && W.R.focus.list.some(e => e.key === 'pick')); W.snapshot(); const S = W.Snap.report; o.px = S.diff.px; return o; });
  ok(r.ring && r.px === 0, 'a focused floor item draws the same ring in the photo (no pixel difference)', JSON.stringify(r));

  // ================= 6. the Altar's crater and wisps =================
  r = await run(() => {
    const W = __wands, G = W.G, o = {};
    T.clear(); G.tree.summon = true;
    T.step(220);
    o.placed = G.altar.placed; o.decal = G.w.decals.filter(d => d.perm && d.k === 'altar').length;
    for (let i = 0; i < 200; i++) W.WZ.decal(G.w.x, G.w.y, 2, { k: 'burn', t: 3, a: 0.5, r: 1 });
    o.keeps = G.w.decals.some(d => d.perm);
    T.step(80);
    o.stays = G.w.decals.some(d => d.perm);
    G.altar.lit = [true, false, true, false];
    G.w.x = G.altar.x + 4; G.w.y = G.altar.y + 4;
    return o;
  });
  ok(r.placed && r.decal === 1, 'the Altar lands and leaves a permanent crater', JSON.stringify(r)); ok(r.keeps && r.stays, 'the crater survives the cap and the ageing');
  await wait(1200); await shot('altar_wisps');

  // ================= 7. the 2026-10-30 pass: emote centre, 2 x 2 Floor Tiles, need chips, drops, camps and crypts, goal celebration =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {};
    T.clear();
    const A = x => Object.assign({ mash: false, cast: false, cycle: false, emote: false }, x);
    WZ.emoteInput(0, 0, false, A({ emote: true }), 0.016); o.centre0 = w.wheel && w.wheel.sel === null;
    WZ.emoteInput(1, 0, false, A({}), 0.016); o.fire = w.wheel.sel === 'fire';
    WZ.emoteInput(0, 0, false, A({}), 0.3); o.back = w.wheel.sel === null;
    WZ.emoteInput(0, 0, false, A({ emote: true }), 0.016); o.cancelled = !w.wheel && !w.emote;
    return o;
  });
  ok(r.centre0 && r.fire && r.back && r.cancelled, 'the emote wheel opens on a centre spot; the stick picks, letting go returns to it, confirming it cancels', JSON.stringify(r));
  r = await run(() => {
    const W = __wands, G = W.G, FA = W.FA, o = {};
    const cells = (x, y) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
    o.base = G.fac.land.filter(v => v >= 1).length;   // 12 x 8
    const b = FA.place('expand', 30, 16);
    o.block = !!b && cells(30, 16).every(c => FA.cell(c[0], c[1]) === b);
    o.cost = JSON.stringify(b.cost); o.added = G.fac.added;
    FA.insert(b, 'wood', false, false); FA.insert(b, 'wood', false, false); FA.insert(b, 'stone', false, false); FA.insert(b, 'stone', false, false);
    o.owned = cells(30, 16).every(c => FA.owned(c[0], c[1])); o.land = G.fac.land.filter(v => v >= 1).length - o.base;
    G.fac.added = 12 * 4; o.iron = JSON.stringify(FA.tileCost());   // the 13th block asks for Iron
    G.fac.added = 4;
    const before = G.stock.wood + G.stock.stone;
    for (const c of cells(30, 16)) FA.liftTile(c[0], c[1]);
    o.lifted = G.stock.wood + G.stock.stone - before; o.gone = cells(30, 16).every(c => !FA.owned(c[0], c[1]));
    const b2 = FA.place('expand', 30, 16); b2.got = { wood: 1 };
    const j = JSON.parse(JSON.stringify(FA.toJSON())); FA.fromJSON(j);
    const nb = G.fac.bld.find(q => q.type === 'expand');
    o.saved = !!nb && nb.got.wood === 1 && cells(nb.x, nb.y).every(c => FA.cell(c[0], c[1]) === nb);
    G.bd.x = nb.x - 0.5; G.bd.y = nb.y + 0.5; o.chip = W.R.needPick() === nb;
    G.bd.x = 20; G.bd.y = 18; o.noChip = W.R.needPick() === null;
    return o;
  });
  ok(r.base === 96 && r.block && r.cost === '{"wood":2,"stone":2}' && r.added === 4, 'the factory starts 12 x 8 and a Floor Tile is a 2 x 2 block for 2 Wood + 2 Stone', JSON.stringify(r));
  ok(r.owned && r.land === 4 && r.iron === '{"wood":2,"stone":2,"iron":1}', 'paid, it becomes four floor tiles; from the 13th block it asks for 1 Iron', JSON.stringify(r));
  ok(r.lifted === 4 && r.gone && r.saved, 'lifting its four tiles refunds the block; a blueprint block survives a save', JSON.stringify(r));
  ok(r.chip && r.noChip, 'the need chips show only for the blueprint the Builder is touching', JSON.stringify(r));
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG, w = G.w, o = {};
    T.clear();
    const camp = WZ.marks.find(m => m.type === 'camp'), crypt = WZ.marks.find(m => m.type === 'crypt');
    w.x = camp.x + 2; w.y = camp.y; T.step(30); o.c15 = w.lm[camp.id].state === 'idle' && w.lm[camp.id].t > 1.4;
    w.x = camp.x + 20; T.step(10); o.cDrain = w.lm[camp.id].t < 0.6;
    w.x = camp.x + 2; T.step(64); o.camp = w.lm[camp.id].state === 'active';
    w.x = crypt.x + 4; w.y = crypt.y; T.step(80); o.y4 = w.lm[crypt.id].state === 'idle';
    T.step(26); o.crypt = w.lm[crypt.id].state === 'active';
    o.shards = [CFG.marks.campShards, CFG.marks.cryptShards, CFG.strong.shards, CFG.elite.shard, CFG.elite.max];
    return o;
  });
  ok(r.c15 && r.cDrain && r.camp, 'a camp wakes after 3 s inside its ring and the timer drains outside', JSON.stringify(r));
  ok(r.y4 && r.crypt && r.shards.join() === '1,2,4,0.2,0.1', 'a crypt needs 5 s; camps pay 1 shard, crypts 2, the Warden 4, elites 20%', JSON.stringify(r));
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, w = G.w, o = {}, cnt = {};
    w.drops = [];
    for (let i = 0; i < 4000; i++) { const e = WZ.makeEnemy('slime', w.x + 3, w.y + 3, false); WZ.onDeath(e); w.enemies.length = 0; }
    for (const d of w.drops) cnt[d.kind] = (cnt[d.kind] || 0) + 1;
    o.common = ((cnt.wood || 0) + (cnt.stone || 0)) / 4000; o.iron = (cnt.iron || 0) / 4000;
    w.drops = []; let sh = 0;
    for (let i = 0; i < 3000; i++) { const e = WZ.makeEnemy('slime', w.x + 3, w.y + 3, true); WZ.kill(e); w.enemies.length = 0; }
    o.eShard = w.drops.filter(d => d.kind === 'shard').length / 3000;
    return o;
  });
  ok(Math.abs(r.common - 0.17) < 0.025 && Math.abs(r.iron - 0.05) < 0.02 && Math.abs(r.eShard - 0.2) < 0.03, 'foes drop Wood 10% + Stone 7% (17% of a kill gives one of them) and Iron about 5%; an elite drops a shard 20% of the time', JSON.stringify(r));
  r = await run(() => {
    const W = __wands, G = W.G, UI = W.UI, o = {};
    UI.updateQuest(0); G.quest.B++; UI.updateQuest(0);
    o.held = !!UI.qHold.B && /celebrate/.test(document.getElementById('questB').className) && /COMPLETE/.test(document.getElementById('qHeadB').textContent);
    return o;
  });
  ok(r.held, 'a completed goal holds its card (it grows and glows) before the next goal appears', JSON.stringify(r));
  await wait(2800);
  r = await run(() => ({ cls: document.getElementById('questB').className, head: document.getElementById('qHeadB').textContent }));
  ok(!/celebrate/.test(r.cls) && /GOAL/.test(r.head) && !/COMPLETE/.test(r.head), 'then the next goal shows and the card settles back', JSON.stringify(r));

  // ================= the feedback ledger (FEEDBACK.md): every row's cue fires, and a row with no cue is a FAIL =================
  // (what / why / what next: a hit carries its source, a bounce its reason, the factory-full bounce is visible at the Spell Portal...)
  const fbText = require('fs').readFileSync(path.resolve(__dirname, '../../FEEDBACK.md'), 'utf8'), cut = fbText.indexOf('## 4-player mode'), cut3 = fbText.indexOf('## 3-player mode');
  const ids = t => t.split(/\r?\n/).map(l => (l.match(/^\| `([a-z-]+)` \|/) || [])[1]).filter(Boolean);
  const ledger = ids(cut < 0 ? fbText : fbText.slice(0, cut)), ledger4 = cut < 0 ? [] : ids(fbText.slice(cut, cut3 > cut ? cut3 : undefined));   // (the rows under "4-player mode" are proven by a 4P game, below)
  const ledger3 = cut3 < 0 ? [] : ids(fbText.slice(cut3));   // (and the rows under "3-player mode" by a 3P game, at the end)
  ok(ledger.length >= 14, 'FEEDBACK.md lists the ledger rows', ledger.join(' '));
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, FA = W.FA, CFG = W.CFG, UI = W.UI, w = G.w, o = {};
    window.__proof = {};
    G.fb = {}; const fb = id => G.fb[id] || 0;
    T.clear(); G.fac.outQ.length = 0; G.fac.rejs.length = 0; G.fac.threat = null; w.hurt = null; w.hp = WZ.maxHp(); w.armor = 0; w.hurtT = 0; w.arcs.length = 0; w.drops.length = 0;
    const kind = Object.keys(CFG.enemies).find(k => CFG.enemies[k].weak);
    // -- hurt: a foe's touch carries its picture, name and weakness
    const e = WZ.makeEnemy(kind, w.x + 0.3, w.y, false); e.cd = 0;
    T.step(3);
    o.touch = w.hurt && { n: w.hurt.n, ic: w.hurt.ic, el: w.hurt.el, ax: typeof w.hurt.ax };
    o.foe = { n: WZ.nameOf(e), weak: e.weak };
    o.untagged0 = fb('hurt-untagged');
    // -- an orb it shot, and a zone it left, still know whose they are
    T.clear(); w.hurt = null; w.hurtT = 0; w.hp = WZ.maxHp();
    const e2 = WZ.makeEnemy(kind, w.x + 5, w.y, false); e2.cd = 99; WZ.cur = e2;
    WZ.shoot(e2, { x: w.x + 0.1, y: w.y, vx: 0, vy: 0, life: 2, dmg: 1, col: '#f00', size: 5 });
    WZ.zone({ x: w.x, y: w.y, r: 3, t: 6, slow: 0.4, dps: 8, hostile: true, tag: 'snare', col: '#6e4a2a' });
    WZ.cur = null;
    o.orbSrc = w.eproj[0] && w.eproj[0].src && w.eproj[0].src.n; o.zoneSrc = w.zones[0] && w.zones[0].src && w.zones[0].src.n;
    T.step(2); o.orbHurt = !!w.hurt && w.hurt.n === o.orbSrc;
    w.hurt = null; w.hurtT = 0; T.step(12);
    o.zoneHurt = !!w.hurt && w.hurt.n === o.zoneSrc;
    o.zSrc = w.zSrc && { st: w.zSrc.st, n: w.zSrc.n }; o.chips = UI.statusList().map(s => s.st);
    UI.updateStatus(); o.chipHtml = document.getElementById('wStat').innerHTML.length > 20;
    // -- a hit with no source is flagged
    G.fb['hurt-untagged'] = 0; w.hurtT = 0; WZ.damage(1); o.untaggedSeen = fb('hurt-untagged') === 1; G.fb['hurt-untagged'] = 0;
    // -- threat: a mutation, an elite sighting, and it expires
    T.clear(); G.fac.threat = null; w.mutThreatT = 0;
    const e3 = WZ.makeEnemy(kind, w.x + 6, w.y, false); e3.cd = 99;
    WZ.mutate(e3, 'swift'); o.mutThreat = G.fac.threat && G.fac.threat.els.join() + ':' + G.fac.threat.n;
    G.fac.threat = null; WZ.announce(e3, 'elite'); o.eliteThreat = G.fac.threat && G.fac.threat.els.join() + ':' + G.fac.threat.n;
    T.clear(); T.step(200); o.threatGone = G.fac.threat === null;
    // -- the Stockpile has no room: a pickup goes up his portal, bounces off the Spell Portal, returns beside him; nothing is lost on the way
    const real = FA.room; FA.room = () => 0;
    w.drops.push({ kind: 'wood', x: w.x, y: w.y, vx: 0, vy: 0, t: 1, val: 1 });
    const total = () => w.drops.filter(d => d.kind === 'wood').length + G.fac.outQ.filter(k => k === 'wood').length + G.fac.rejs.length + w.arcs.filter(a => a.kind === 'wood').length;
    let mn = 9, mx = 0, sawRej = 0, sawArc = 0, home = false;
    for (let i = 0; i < 160 && !home; i++) { T.step(1); const t = total(); mn = Math.min(mn, t); mx = Math.max(mx, t); sawRej = Math.max(sawRej, G.fac.rejs.length); sawArc = Math.max(sawArc, w.arcs.filter(a => a.then === 'drop').length); home = w.drops.some(d => d.kind === 'wood' && d.home); }
    FA.room = real;
    o.rw = { reject: fb('reject-wild'), full: fb('factory-full'), rej: sawRej, arc: sawArc, home, mn, mx };
    w.drops.length = 0; G.fac.outQ.length = 0; G.fac.rejs.length = 0; w.arcs.length = 0; G.fac.pops.length = 0;
    // -- a throw is turned away: the reason is ONE icon row
    const pc = FA.portal('spell'), land = (k, x, y) => { G.fac.pops.length = 0; FA.land({ kind: k, x, y, sx: x, sy: y + 1, z: 0, t: 1, T: 1, fromBuilder: true }); return JSON.stringify(G.fac.pops[0] && G.fac.pops[0].ic); };
    o.b1 = land('wood', pc.x + 0.5, pc.y + 0.5);
    const cc = [CFG.crafted.cap, CFG.crafted.queue, CFG.ally.cap, CFG.ally.queue];
    CFG.crafted.cap = 0; CFG.crafted.queue = 0; CFG.ally.cap = 0; CFG.ally.queue = 0;
    const eggK = Object.keys(ITEMS).find(k => ITEMS[k].egg && !ITEMS[k].ally), aeggK = Object.keys(ITEMS).find(k => ITEMS[k].egg && ITEMS[k].ally);
    o.b2 = land(eggK, pc.x + 0.5, pc.y + 0.5); o.b3 = land(aeggK, pc.x + 0.5, pc.y + 0.5);
    [CFG.crafted.cap, CFG.crafted.queue, CFG.ally.cap, CFG.ally.queue] = cc;
    o.b4 = land('core_air', pc.x + 0.5, pc.y + 0.5);
    o.bounces = fb('bounce');
    // -- boost: a Battery Shrine charges a Battery (it pulses with a "+"), a surging element speeds a Harvester
    const bat = G.fac.bld.find(q => FA.isCell(q) && q.done); T.step(2);
    const sh = G.bshr.find(q => q.id === bat.id); bat.bat = 10;
    WZ.ctx = { spell: 'air', el: ['air'], hits: 0, kills: 0, weak: 0 }; WZ.bshrHurt(sh, 20); WZ.ctx = null;
    o.plus = bat.plusT > 0; const hz = G.fac.bld.find(q => q.type === 'harness'); w.surge = hz.el; o.hboost = FA.shrineBoost(hz) > 1; w.surge = null;
    // -- tether: a rare drop from a kill remembers the corpse
    w.drops.length = 0;
    for (let i = 0; i < 300; i++) { const el = WZ.makeEnemy(kind, w.x + 4, w.y + 4, true); WZ.kill(el); w.enemies.length = 0; }
    o.tether = w.drops.filter(d => d.kind === 'shard' && d.tet > 0 && d.fx !== undefined).length; o.tetherFb = fb('tether');
    w.drops.length = 0;
    // -- the wand: a slot fills (swirl, grow, THEN the blink), a shrine is ready
    G.wand.fx = null; G.wand.full.air = false; G.wand.m.air = CFG.wand.need.air - 1;
    const airSpell = Object.keys(SPELL_EL).find(k => SPELL_EL[k].length === 1 && SPELL_EL[k][0] === 'air');
    WZ.wandCharge(airSpell);
    o.wfx = G.wand.fx && G.wand.fx.el + ':' + G.wand.fx.kind;
    UI.updateWand(); const h1 = document.getElementById('wandRow').innerHTML;
    o.grow = /class="ws full grow"/.test(h1) && !/class="ws[^"]*armed/.test(h1);
    T.step(30); UI.updateWand(); const h2 = document.getElementById('wandRow').innerHTML;
    o.fxGone = G.wand.fx === null; o.armedLater = /ws full armed/.test(h2) && !/grow/.test(h2);
    WZ.readyCue('fire', 'shrine'); o.shrineFx = G.wand.fx && G.wand.fx.kind; G.wand.fx = null;
    // -- a goal is finished: the card celebrates, then ONLY the new goal's pointer blinks for a moment
    w.hurt = null; G.fac.threat = null;
    UI.questDone('B', { xp: 1, text: 'x' }); G.quest.B--;
    UI.updateHud(0.016);
    o.focus = { t: G.fac.focusT > 4, cls: document.getElementById('game').classList.contains('goalFocus'), att: FA.attention() };
    w.hurt = { ic: kind, n: 'x', ax: null, ay: null, el: null, t: 0, soft: false, d: 1 }; o.attDanger = FA.attention();
    UI.celebrate('B', { xp: 1, text: 'x' }); o.quiet = document.getElementById('questB').classList.contains('quiet'); delete UI.qHold.B; document.getElementById('questB').classList.remove('celebrate', 'quiet'); w.hurt = null;
    T.step(100); UI.updateHud(0.016);
    o.focusEnds = { t: G.fac.focusT <= 0, cls: !document.getElementById('game').classList.contains('goalFocus'), att: FA.attention() };
    // -- priority: a danger toast first, then an ambient one has to wait
    UI.toastQ.length = 0; UI.cueUntil = [0, 0, 0, 0];
    for (const c of Array.from(document.getElementById('toastL').children)) c.remove();
    UI.toast('Elite near the Wizard: send Water!', 'L', 'water');
    o.lvl = UI.cueLevel(); UI.toast('A quiet moss note', 'L', null);
    o.queued = UI.toastQ.length; o.shown = Array.from(document.getElementById('toastL').children).some(c => c.dataset.t === 'A quiet moss note');
    // -- machines: the pause badge, and starved of THIS
    const spot = (() => { for (let y = 0; y < FA.H(); y++) for (let x = 0; x < FA.W(); x++) if (FA.owned(x, y) && !FA.cell(x, y) && !FA.isPile(x, y) && !FA.isQ(x, y)) { if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(d => !FA.cell(x + d[0], y + d[1]))) return [x, y]; } return null; })();
    const f = FA.place('forge', spot[0], spot[1], 0); f.done = true; f.got = {}; FA.refreshRecipes(); T.step(2);
    o.starve = f.st; o.miss = FA.missingOf(f);
    f.out = [{ kind: 'air' }]; f.blocked = true; T.step(1); o.jam = f.st;
    const jc = SP.ic_jam.c, jx = jc.getContext('2d'), px = (x, y) => Array.from(jx.getImageData(x, y, 1, 1).data).join();
    o.jamIcon = { w: jc.width, h: jc.height, bar: px(3, 3), gap: px(5, 3) };
    FA.demolish(f.x, f.y, true);
    return o;
  });
  console.log('   ledger run', JSON.stringify(r));
  ok(r.touch && r.touch.n === r.foe.n && r.touch.ic && r.touch.el === r.foe.weak && r.touch.ax === 'number', 'a foe\'s touch carries its name, picture, weakness and place (G.w.hurt)', JSON.stringify(r.touch));
  ok(r.untagged0 === 0 && r.untaggedSeen, 'no hit goes untagged in play, and a source-less WZ.damage is counted (hurt-untagged)', r.untagged0);
  ok(r.orbSrc && r.orbHurt && r.zoneSrc && r.zoneHurt, 'an orb and a zone remember whose they are', JSON.stringify([r.orbSrc, r.zoneSrc]));
  ok(r.zSrc && r.zSrc.st === 'snare' && r.chips.indexOf('ic_snare') >= 0 && r.chipHtml, 'a snare shows as a chip over his health bar with its source', JSON.stringify([r.zSrc, r.chips]));
  ok(/^[a-z]+:MUTANT SPAWNED$/.test(r.mutThreat || '') && /^[a-z]+:ELITE SPAWNED$/.test(r.eliteThreat || '') && r.threatGone, 'a mutation and an elite sighting show their weakness over the Spell Portal, which clears by itself', JSON.stringify([r.mutThreat, r.eliteThreat, r.threatGone]));
  ok(r.rw.reject > 0 && r.rw.full > 0 && r.rw.rej === 1 && r.rw.arc >= 1 && r.rw.home && r.rw.mn === 1 && r.rw.mx === 1, 'a pickup the Stockpile refuses bounces off the Spell Portal (visible to the Builder), goes back up and lands beside him, and is never lost', JSON.stringify(r.rw));
  ok(r.b1 === '[["wood"],["ic_x"]]' && r.b2 === '[["ic_skull","0/0"],["ic_clock","0/0"]]' && r.b3 === '[["ic_heart","0/0"],["ic_clock","0/0"]]' && r.b4 === '[["core_air"],["ic_lock"]]' && r.bounces >= 4, 'every bounce shows one reason row: wrong item, creature cap / queue counters, ally caps, locked Core', JSON.stringify([r.b1, r.b2, r.b3, r.b4]));
  ok(r.plus && r.hboost, 'a Battery Shrine charge makes its Battery pulse with a "+" and a surging element boosts its Harvester', JSON.stringify([r.plus, r.hboost]));
  ok(r.tether > 0 && r.tetherFb > 0, 'a rare drop from a kill is tied to its corpse (fx / fy / tet)', JSON.stringify([r.tether, r.tetherFb]));
  ok(r.wfx === 'air:wand' && r.grow && r.fxGone && r.armedLater && r.shrineFx === 'shrine', 'a wand slot that fills grows and swirls first and only blinks after; a shrine ready cue exists', JSON.stringify([r.wfx, r.grow, r.fxGone, r.armedLater, r.shrineFx]));
  ok(r.focus.t && r.focus.cls && r.focus.att === 2 && r.attDanger === 3 && r.quiet && r.focusEnds.t && r.focusEnds.cls && r.focusEnds.att === 0, 'a finished goal gives its new pointer the stage for a moment; danger outranks it (the card only pulses); it ends', JSON.stringify([r.focus, r.attDanger, r.focusEnds]));
  ok(r.lvl === 3 && r.queued === 1 && !r.shown, 'a danger toast holds an ambient one back', JSON.stringify([r.lvl, r.queued, r.shown]));
  ok(r.starve === 'starve' && !!r.miss && r.jam === 'jam', 'a starved machine knows its missing ingredient; a blocked one is jammed', JSON.stringify([r.starve, r.miss, r.jam]));
  ok(r.jamIcon.w === 10 && r.jamIcon.h === 8 && /^255,255,255/.test(r.jamIcon.bar) && !/^255,255,255/.test(r.jamIcon.gap), 'the jam icon is a pause badge: two white bars', JSON.stringify(r.jamIcon));
  await wait(3600);
  r = await run(() => { const UI = __wands.UI; return { q: UI.toastQ.length, shown: Array.from(document.getElementById('toastL').children).some(c => c.dataset.t === 'A quiet moss note') }; });
  ok(r.q === 0 && r.shown, 'the held-back toast comes out once the danger cue has passed', JSON.stringify(r));
  // the killer comes last: it ends the run
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, UI = W.UI, CFG = W.CFG, w = G.w, o = {};
    T.clear(); w.hurtT = 0; w.hp = 1; w.armor = 0;
    const kind = Object.keys(CFG.enemies).find(k => CFG.enemies[k].weak);
    const e = WZ.makeEnemy(kind, w.x + 0.3, w.y, false); e.cd = 0;
    T.step(3);
    o.dead = w.dead; o.killer = w.killer && w.killer.n; o.html = /KILLED BY/.test(UI.killerHtml()) && (e.weak ? new RegExp('send ' + ELEM_WORD[e.weak] + ' spells').test(UI.killerHtml()) : true); o.fb = G.fb.killer;
    return o;
  });
  ok(r.dead && r.killer && r.html && r.fb === 1, 'the Wizard\'s death names its killer and what the Builder should have sent', JSON.stringify(r));
  r = await run(() => {   // bring him back and leave every cue on screen for the photo test below
    const W = __wands, G = W.G, WZ = W.WZ, FA = W.FA, CFG = W.CFG;
    WZ.reenter(); T.clear(); const w = G.w;
    const kind = Object.keys(CFG.enemies).find(k => CFG.enemies[k].weak);
    const f = WZ.makeEnemy(kind, w.x + 3, w.y + 1, false); f.cd = 999; f.slow = 0.5; f.slowT = 99; f.dazeT = 99;
    w.hurt = { ic: kind, n: 'Test', ax: w.x + 3, ay: w.y + 1, el: 'water', t: 0.2, soft: false, d: 3 };
    FA.threat(['water', 'fire'], kind, 'ELITE'); G.fac.rejs.push({ kind: 'wood', t: 0.3, dur: 0.7, seed: 1 });
    const b = G.fac.bld.find(q => FA.isCell(q) && q.done); b.plusT = 1;
    const d = { kind: 'shard', x: w.x - 2, y: w.y + 2, vx: 0, vy: 0, t: 1, val: 1, fx: w.x - 3, fy: w.y + 1, tet: 1 }; w.drops.push(d);
    G.wand.fx = { el: 'water', kind: 'wand', t: 0.5 };
    FA.shardPreview();   // the Builder's preview of an incoming shard
    { const i = Math.floor(w.y) * CFG.WW + Math.floor(w.x + 2); WZ.terrain[i] = 13 * 8; w.heatT = 0; T.step(1); }   // lava two tiles away: the thermometer
    const proof = window.__proof; proof['foe-status'] = f.slow > 0; proof['status'] = true; proof['priority'] = true; proof['starve-icon'] = true; proof['jam-icon'] = true;
    return { ids: Object.keys(G.fb) };
  });
  await wait(300);
  const have = await run(() => { const G = __wands.G; return Object.keys(G.fb).filter(k => G.fb[k] > 0).concat(Object.keys(window.__proof).filter(k => window.__proof[k])); });
  const missing = ledger.filter(id => have.indexOf(id) < 0);
  ok(missing.length === 0, 'every row of the feedback ledger has a cue that fires', 'missing: ' + missing.join(' '));
  await shot('feedback-cues');
  await run(() => { window.__p2 = Object.keys(__wands.G.fb).filter(k => __wands.G.fb[k] > 0); });

  // ================= errors + the snapshot photo test =================
  r = await run(() => { const S = __wands.Snap; __wands.snapshot(); return S.report ? { v: S.report.verdict, leaks: JSON.stringify(S.report.leaks.filter(l => !l.known).concat(S.report.issues || [], S.report.diff ? [S.report.diff] : [])).slice(0, 1500) } : null; });
  ok(r && (r.v === 'PASS' || r.v === 'KNOWN'), 'the photo test passes with the new state on screen', JSON.stringify(r));
  // ================= the 4-player ledger rows: a 4P game exercises each cue, names instead of "the Wizard" =================
  r = await run(() => {
    const W = __wands, M4 = W.M4, seats = M4.defaultSeats(); seats[2].att = ['fire', 'water']; seats[3].att = ['air', 'earth']; seats[3].who = 'g1'; seats[1].who = 'g3';
    W.start4(1, { seats, me: 2 }); W.UI.help(false); W.G.helpT = 0; W.CFG.world.cap = 0;
    const G = W.G, WZ = W.WZ, FA = W.FA, UI = W.UI, o = {}, step = n => { for (let i = 0; i < n; i++) W.step4(0.05, 1); };
    G.fb = {};
    // refract: Violet (Fire / Water) casts Air + Fire: a steam blast, named over his head
    G.w.x = 60; G.w.y = 60; WZ.as(0, () => WZ.cast('flamethrower'));
    o.title = G.w.fx_.filter(f => f.type === 'title').map(f => f.text).join('|');
    // the Builders' hit report carries the caster's name
    o.pop = (() => { try { FA.landed({ spell: 'flamethrower', hits: 1, kills: 0, weak: 0, x: { seat: 2 } }); return true; } catch (e) { return String(e); } })();
    // a delivered spell lands as a pickup and the Wizard who walks onto it casts it
    G.w.pickups.length = 0; WZ.incoming('gust'); const pk = G.w.pickups.find(p => p.spell); o.landed = !!pk;
    if (pk) { const q = WZ.pw(pk.for); pk.z = 0; pk.x = q.x + 0.2; pk.y = q.y; } step(3);
    // the names: a toast that says "the Wizard" says which
    o.words = M4.words('The Wizard meets Ember Imps: send Water!');
    // a fallen Wizard gets up
    WZ.as(1, () => { G.w.hp = 1; WZ.damage(50, false, WZ.HAZ.unknown); }); o.down = G.w2.dead;
    G.w2.deadT = W.CFG.mode4.respawnT; step(2); o.up = !G.w2.dead;
    // a player drops out and comes back
    W.Main.hostHooks4.lost({ id: 'g1' }, 'closed'); o.away = G.seats[3].conn === false;
    W.Main.hostHooks4.back({ id: 'g1' }); o.back = G.seats[3].conn !== false;
    // a shrine woken by one Wizard is named
    WZ.as(1, () => WZ.shrineActivate(WZ.marks.find(m => m.type === 'shrine'), G.w.lm[WZ.marks.find(m => m.type === 'shrine').id]));
    // both down: the game over names each killer
    for (const i of [0, 1]) WZ.as(i, () => { G.w.dead = false; G.w.hp = 1; WZ.damage(50, false, { ic: 'slime', n: 'Test Foe', el: 'water' }); });
    step(3); UI.showResults4(); o.html = document.getElementById('results').innerHTML;
    const txt = o.html.replace(/<[^>]*>/g, ''); o.killers = /VIOLET WAS KILLED BY TEST FOE/.test(txt) && /ROSE WAS KILLED BY TEST FOE/.test(txt);
    o.fb4 = Object.keys(G.fb).filter(k => G.fb[k] > 0);
    // the lobby (offline: the same code the network calls): first come first served, then a bump
    W.menu.make(); const m = W.G.menu; m.online = { code: 'TEST', state: 'live' }; Lobby4.open(); const L = m.l4;
    const cs = ['g1', 'g2', 'g3'].map(w => Lobby4.addChar(L, w)).concat([L.chars[0]]);
    Lobby4.pick(L.chars[0], 'W'); Lobby4.pick(cs[0], 'W'); Lobby4.pick(cs[1], 'W'); Lobby4.pick(cs[2], 'B');
    o.seats = L.seats.map(s => s.who).join(','); o.bumps = L.bumps.length;
    L.seats[2].att = ['fire', 'water']; L.seats[3].att = ['air', 'earth'];
    for (const q of m.plates) q.st = 'up';
    { const c = L.chars.find(q => q.who === 'host'), p = m.plates.find(q => q.kind === 'ready' && q.seat === 2); c.x = p.x; c.y = p.y; c.tele = 0; Lobby4.step(0.05); }   // the host's Wizard stands on his READY plate
    o.fb4 = o.fb4.concat(Object.keys(W.G.fb).filter(k => W.G.fb[k] > 0));
    return o;
  });
  ok(/VIOLET: STEAM BLAST/.test(r.title), '4P: a refracted cast names whose hands and the form (VIOLET: STEAM BLAST)', r.title);
  ok(r.pop === true, '4P: the Builders hit report carries the caster name');
  ok(r.landed && r.fb4.indexOf('spell-grab') >= 0, '4P: a delivered spell lies in the wilds and the Wizard who walks onto it casts it', JSON.stringify(r.fb4));
  ok(/VIOLET|ROSE/.test(r.words) && !/the Wizard\b/.test(r.words), '4P: no cue says "the Wizard"; it names which one', r.words);
  ok(r.down && r.up, '4P: a fallen Wizard gets up beside his partner', JSON.stringify([r.down, r.up]));
  ok(r.away && r.back, '4P: a player dropping out and coming back is shown and handed back', JSON.stringify([r.away, r.back]));
  ok(r.killers, '4P: the game over names each Wizard and what killed him');
  ok(r.seats === 'g2,g3,host,g1' && r.bumps === 1, '4P lobby: first come first served, the third Wizard is bumped with a cue', r.seats + ' bumps ' + r.bumps);
  const missing4 = ledger4.filter(id => r.fb4.indexOf(id) < 0);
  ok(missing4.length === 0, 'every 4-player row of the feedback ledger has a cue that fires', 'missing: ' + missing4.join(' ') + ' (have ' + r.fb4.join(' ') + ')');
  ok(ledger4.length >= 8, 'FEEDBACK.md lists the 4-player rows', ledger4.join(' '));

  // ================= the juice ledger (JUICE.md): every verb has a sound, a burst and a kick; a row with no probe is a FAIL =================
  // (a probe runs the verb for real and reads three things: the sounds it asked for, the particles / rings it added, and whether anything moved: camera shake, nudge or the Builder's squash)
  const juiceText = require('fs').readFileSync(path.resolve(__dirname, '../../JUICE.md'), 'utf8');
  const juiceIds = ids(juiceText), JUICE_ROWS = ['wand', 'throw', 'pick', 'build', 'deliver', 'hit'];   // (+ the Rootkeeper's rk-* rows, probed in his own 3P game below)
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, FA = W.FA, CFG = W.CFG, o = { probes: {}, flat: [] };
    T.clear(); G.hands.length = 0; G.fac.parts.length = 0;
    const w = () => G.w, f = () => G.fac;
    const sfxLog = [], orig = AU.sfx;
    AU.sfx = function (n) { sfxLog.push(n); return orig.apply(AU, arguments); };
    // one probe: reset the three meters, run the verb, read them
    const probe = (label, fn) => {
      sfxLog.length = 0; w().shake = 0; f().bumpAmp = 0; f().bump = 0; G.bd.squash = 0;
      const p0 = f().parts.length + f().rings.length + f().thumps.length + w().fx_.length;
      fn();
      const p1 = f().parts.length + f().rings.length + f().thumps.length + w().fx_.length;
      const res = { sfx: sfxLog.slice(), burst: p1 - p0, kick: w().shake > 0 || f().bumpAmp > 0 || G.bd.squash > 0 };
      const lack = [!res.sfx.length && 'sound', res.burst <= 0 && 'burst', !res.kick && 'kick'].filter(Boolean);
      if (lack.length) o.flat.push(label + ' (no ' + lack.join(', ') + ')');
      return res;
    };
    const free = type => { for (let y = 0; y < f().h; y++) for (let x = 0; x < f().w; x++) if (FA.canPut(type, x, y)) return [x, y]; return null; };
    // -- wand: every element in CFG.wand.need
    o.probes.wand = [];
    for (const el of Object.keys(CFG.wand.need)) {
      T.clear(); w().ride = null; w().statT = 0; w().blink = null; G.wand.full[el] = true; G.wand.ord = [el]; G.wand.armed = el; G.wand.m[el] = CFG.wand.need[el];
      probe('wand ' + el, () => { if (!WZ.wandCast()) throw new Error('wand ' + el + ' did not cast'); });
      o.probes.wand.push(el);
      T.clear(); w().ride = null; w().statT = 0; w().fireT = 0; w().invisT = 0; w().shake = 0;
    }
    // -- throw
    T.clear(); G.hands.length = 0; FA.addHands('wood', 1); G.bd.throwCd = 0;
    o.probes.throw = probe('throw', () => { FA.throwOne(G.bd.x + 2, G.bd.y); });
    // -- pick: a Stockpile tile, a floor item, a machine's output, a crate
    o.probes.pick = [];
    G.hands.length = 0; G.stock.wood = Math.max(5, G.stock.wood || 0);
    probe('pick pile', () => FA.takePile('wood')); o.probes.pick.push('pile');
    G.hands.length = 0; const it = { kind: 'stone', x: G.bd.x + 0.5, y: G.bd.y, z: 0, vz: 0, t: 1 }; f().floor.push(it);
    probe('pick floor', () => FA.pickFloor(it)); o.probes.pick.push('floor');
    G.hands.length = 0; const hs = free('harness'), hb = FA.makeBuilding('harness', hs[0], hs[1], true, true); hb.out.length = 0; hb.out.push({ kind: 'air' });
    probe('pick machine', () => FA.takeOut(hb)); o.probes.pick.push('machine');
    G.hands.length = 0; const sp = free('crate'), cr = FA.makeBuilding('crate', sp[0], sp[1], true, true); cr.ck = 'air'; cr.cn = 2;
    probe('pick crate', () => FA.takeOut(cr)); o.probes.pick.push('crate');
    G.hands.length = 0;
    // -- build: every building type, finished by the Builder (not quiet)
    o.probes.build = [];
    for (const type of Object.keys(CFG.buildings)) {
      const at = free(type);
      if (!at) { o.flat.push('build ' + type + ' (no free spot for the probe)'); continue; }
      const b = FA.makeBuilding(type, at[0], at[1], false, true);
      probe('build ' + type, () => FA.onComplete(b, false));
      o.probes.build.push(type);
    }
    // -- deliver: the item smacks the Spell Portal (CFG.suck.baseT s after the throw)
    T.clear(); f().sucks.length = 0;
    o.probes.deliver = probe('deliver', () => { FA.suck('air', FA.portal('spell').x + 0.5, FA.portal('spell').y + 1); f().sucks[0].t = CFG.suck.baseT - 0.01; FA.update(0.05); });
    // -- hit: a plain tick, a weakness hit, a big one, a scratch
    T.clear();
    const kind = Object.keys(CFG.enemies).find(k => CFG.enemies[k].weak);
    const hurt = (dmg, el) => {
      const e = WZ.makeEnemy(kind, w().x + 6, w().y, false); e.hp = e.maxHp = 9999; e.weak = 'fire'; e.resist = 'water'; e.dr = 1;
      w().hitSfxT = -9; w().weakSfxT = -9; w().thumpT = -9; WZ.ctx = { spell: 'x', el: [el], hits: 0, kills: 0, weak: 0 };
      sfxLog.length = 0; WZ.hurtE(e, dmg, 0, 0); WZ.ctx = null;
      return sfxLog.slice();
    };
    o.probes.hit = { plain: hurt(8, 'air'), weak: hurt(8, 'fire'), big: hurt(CFG.juice.bigHit + 5, 'air'), tiny: hurt(1, 'air') };
    // -- variation: the same sound twice never plays the same way (AU.variation holds the last drift of each name; audio may be asleep in a headless page)
    sfxLog.length = 0;
    const names = ['hit', 'throw', 'pickup', 'roll', 'dodge', 'thump'];
    for (const n of names) for (let i = 0; i < 4; i++) orig.call(AU, n);
    o.vary = names.map(n => !!AU.variation(n));
    // -- position: a sound to the right on screen pans right, to the left pans left, none at the ear; far is quieter
    AU.setEar(100, 100);
    o.pan = [AU.panK(107, 93), AU.panK(93, 107), AU.panK(100, 100), AU.panK(undefined, undefined)];
    o.far = [AU.farK(100, 105), AU.farK(100, 160)];
    AU.setEar(null);
    AU.sfx = orig;
    return o;
  });
  ok(r.flat.length === 0, 'every verb has a sound, a burst and a kick', r.flat.join('; '));
  // -- the Rootkeeper's rows (his own meters: the sounds he asks for, the effects below, his camera shake or his squash); a 3P game, he is the host
  const rkJ = await run(() => {
    const W = __wands, M3 = W.M3, seats = M3.defaultSeats(); seats[0].who = 'g1'; seats[1].who = 'g2'; seats[2].who = 'host';
    W.start3(1, { seats, me: 2 }); W.UI.help(false); W.G.helpT = 0; W.CFG.world.cap = 0;
    const G = W.G, u = G.u, WZ = W.WZ, FA = W.FA, C = W.CFG.mode3, rk = u.rk, o = { rows: [], flat: [], labels: {} };
    const sfxLog = [], orig = AU.sfx;
    AU.sfx = function (n) { sfxLog.push(n); return orig.apply(AU, arguments); };
    for (const k of ['air', 'water', 'fire', 'earth']) { u.bank[k] = 60; for (let i = 0; i < 60; i++) u.blog.push(k); }
    G.tree.rkroll = true; G.tree.rkpole = true;
    const bu = u.bld.find(b => b.type === 'burner'), py = u.bld.find(b => b.type === 'pylon'), col = u.bld.find(b => b.type === 'collector'), mir = u.bld.find(b => b.type === 'mirror'), tree = u.bld.find(b => b.type === 'node' && b.nk === 'tree');
    const stand = (x, y) => { rk.x = x; rk.y = y; rk.fx = 1; rk.fy = 0; rk.vx = rk.vy = 0; rk.roll = 0; rk.rollCd = 0; rk.throwCd = 0; };
    const openSpot = () => { for (let i = 0; i < 600; i++) { const a = Math.random() * 6.28, d = 8 + Math.random() * 14, x = bu.x + Math.cos(a) * d, y = bu.y + Math.sin(a) * d, f = [Math.floor(x + 1.4) + 0.5, Math.floor(y) + 0.5]; if (!M3.blockedU(x, y, 0.5) && M3.free(x, y, 1.6) && M3.free(f[0], f[1], 1.4) && M3.free(x + 3, y, 1.4)) return [x, y]; } throw new Error('no open spot'); };
    const probe = (row, label, fn) => {
      sfxLog.length = 0; u.fx.length = 0; u.pops.length = 0; u.shake = 0; rk.squash = 0;
      fn();
      const res = { sfx: sfxLog.slice(), burst: u.fx.length, kick: u.shake > 0 || rk.squash > 0 };
      const lack = [!res.sfx.length && 'sound', res.burst <= 0 && 'burst', !res.kick && 'kick'].filter(Boolean);
      if (lack.length) o.flat.push(label + ' (no ' + lack.join(', ') + ')');
      if (o.rows.indexOf(row) < 0) o.rows.push(row);
      (o.labels[row] = o.labels[row] || []).push(label);
      return res;
    };
    let s = openSpot(); stand(s[0], s[1]);
    probe('rk-roll', 'roll', () => M3.moveRk(0.05, { ix: 0, iy: 0, roll: true }));
    stand(s[0], s[1]); rk.hands.length = 0;
    { const it = M3.addItem('rem_air', rk.x + 0.4, rk.y); probe('rk-pick', 'pick item', () => M3.takeItem(it)); }
    u.blog.push('air'); u.bank.air++; rk.hands.length = 0; probe('rk-pick', 'pick pylon', () => M3.pullPylon(py));
    rk.hands = ['rem_air']; probe('rk-throw', 'throw', () => M3.throwOne());
    for (const [label, tgt] of [['pylon', py], ['burner', bu], ['ground', null]]) {
      const f = FA.flightOf('rem_air', rk.x, rk.y, tgt ? tgt.x : s[0] + 1.4, tgt ? tgt.y : s[1], { to: tgt ? tgt.id : null });
      f.t = f.T; u.fly.length = 0; u.fly.push(f); probe('rk-land', 'land ' + label, () => M3.flyTick(0.05));
    }
    s = openSpot(); stand(s[0], s[1]); rk.hands = ['n_tree']; probe('rk-plant', 'plant seed', () => M3.throwOne());
    s = openSpot(); stand(s[0], s[1]); rk.hands = ['t_dmg']; probe('rk-plant', 'plant trap', () => M3.throwOne());
    const tp = u.bld[u.bld.length - 1];
    for (const t of Object.keys(C.bld).filter(t => t !== 'hose' && t !== 'remove')) { s = openSpot(); stand(s[0], s[1]); rk.tool = t; probe('rk-build', 'build ' + t, () => { if (!M3.place(t)) throw new Error('could not place ' + t); }); }
    rk.tool = null;
    s = openSpot(); const pa = M3.make('pole', s[0], s[1]), pb = M3.make('pole', s[0] + 3, s[1]);
    stand(pa.x + 0.2, pa.y + 0.2); rk.tool = 'hose'; rk.hose = null; probe('rk-hose', 'hose start', () => M3.hoseAt());
    stand(pb.x - 0.2, pb.y + 0.2); rk.hose = pa.id; probe('rk-hose', 'hose lay', () => M3.hoseAt());
    stand(pb.x - 0.2, pb.y + 0.2); rk.hose = pa.id; probe('rk-hose', 'hose off', () => M3.hoseAt());
    stand(pb.x + 0.1, pb.y + 0.1); rk.tool = 'remove'; probe('rk-remove', 'remove', () => { if (!M3.removeAt()) throw new Error('nothing removed'); });
    rk.tool = null; rk.hose = null;
    s = openSpot(); const tc = M3.make('tcraft', s[0], s[1]); stand(tc.x - 0.8, tc.y);
    probe('rk-craft', 'craft start', () => M3.craft(tc)); tc.prog = C.craftT; probe('rk-craft', 'craft done', () => M3.craftTick(tc, 0.05));
    stand(tree.x + 0.6, tree.y); tree.ch = 0; probe('rk-mash', 'mash node', () => M3.mash(tree)); probe('rk-mash', 'mash mirror', () => M3.mash(mir));
    probe('rk-burner', 'set burner', () => M3.setBurner(bu));
    tree.ch = 0.99; probe('rk-grow', 'grow', () => M3.deliver(tree, 'water', 5));
    G.w.enemies.length = 0; tp.fuel = 12; tp.arm = 0; { const e = WZ.makeEnemy('golem', tp.x, tp.y); e.hp = e.maxHp = 1e5; e.spd = 0; e.dazeT = 100; }
    probe('rk-trap', 'trap fires', () => M3.trapTick(tp, 0.05)); G.w.enemies.length = 0;
    probe('rk-send', 'mirror send', () => M3.deliver(mir, mir.el, C.mirror.pack));
    { const p = M3.make('pole', (bu.x + col.x) / 2, (bu.y + col.y) / 2); M3.link(bu, p); M3.link(p, col); bu.ash.air = 3; col.ct = 0; }
    probe('rk-ash', 'ash lift', () => M3.collectorTick(col, 0.05));
    AU.sfx = orig;
    // his sounds are for him alone: a Builder or Wizard machine plays none of them (they are only logged for a Rootkeeper guest)
    o.others = [];
    for (const role of ['B', 'W']) { const sv = M3.myRole; M3.myRole = () => role; sfxLog.length = 0; AU.sfx = function (n) { sfxLog.push(n); return orig.apply(AU, arguments); }; M3.sfx('bank'); AU.sfx = orig; M3.myRole = sv; o.others.push(sfxLog.length); }
    return o;
  });
  ok(rkJ.flat.length === 0, 'the Rootkeeper: every verb has a sound, a burst and a kick', rkJ.flat.join('; '));
  ok(rkJ.labels['rk-build'] && rkJ.labels['rk-build'].length >= 7, 'the Rootkeeper: every building of his toolbar probed', JSON.stringify(rkJ.labels['rk-build']));
  ok(rkJ.others.every(n => n === 0), 'the Rootkeeper\'s underworld sounds are not played on a Builder or Wizard machine', JSON.stringify(rkJ.others));
  ok(r.probes.wand.length === 4, 'juice: all four wand attacks probed', r.probes.wand.join(' '));
  ok(r.probes.build.length >= 10, 'juice: every building type probed', r.probes.build.join(' '));
  ok(r.probes.pick.length === 4 && r.probes.throw.sfx.indexOf('throw') >= 0, 'juice: throw + four kinds of pick probed');
  ok(r.probes.deliver.sfx.indexOf('smack') >= 0, 'juice: the Spell Portal smack sounds when the item arrives', r.probes.deliver.sfx.join(' '));
  ok(r.probes.hit.plain.indexOf('hit') >= 0 && r.probes.hit.weak.indexOf('hitw') >= 0 && r.probes.hit.big.indexOf('thump') >= 0 && r.probes.hit.tiny.length === 0, 'juice: a plain hit ticks, a weakness hit is heavier, a big hit thumps, a scratch is silent', JSON.stringify(r.probes.hit));
  ok(r.vary.every(Boolean), 'juice: the busy sounds carry a pitch / volume drift', JSON.stringify(r.vary));
  ok(r.pan[0] > 0 && r.pan[1] < 0 && r.pan[2] === 0 && r.pan[3] === 0, 'juice: a sound pans to its side of the Wizard', JSON.stringify(r.pan));
  ok(r.far[0] === 1 && r.far[1] < 0.5, 'juice: a far sound is quieter', JSON.stringify(r.far));
  const ALLROWS = JUICE_ROWS.concat(rkJ.rows), noProbe = juiceIds.filter(id => ALLROWS.indexOf(id) < 0), noRow = ALLROWS.filter(id => juiceIds.indexOf(id) < 0);
  ok(noProbe.length === 0 && noRow.length === 0, 'JUICE.md and the probes list the same verbs (a new row needs a probe, a probe needs a row)', 'rows without a probe: ' + noProbe.join(' ') + ' / probes without a row: ' + noRow.join(' '));

  // ================= the 3-player ledger rows: a 3P game exercises each cue (the lobby and a dropped player through the same code the network calls) =================
  r = await run(() => {
    const W = __wands, M3 = W.M3, seats = M3.defaultSeats(); seats[0].who = 'g1'; seats[1].who = 'g2'; seats[2].who = 'host';
    W.start3(1, { seats, me: 2 }); W.UI.help(false); W.G.helpT = 0; W.CFG.world.cap = 0;
    const G = W.G, u = G.u, WZ = W.WZ, FA = W.FA, C = W.CFG.mode3, step = n => W.step3(0.05, n), o = {};
    G.fb = {};
    const bu = u.bld.find(b => b.type === 'burner'), py = u.bld.find(b => b.type === 'pylon'), col = u.bld.find(b => b.type === 'collector'), mir = u.bld.find(b => b.type === 'mirror');
    const tree = u.bld.find(b => b.type === 'node' && b.nk === 'tree'), rock = u.bld.find(b => b.type === 'node' && b.nk === 'rock');
    // remains: one lands, one fades, one is banked
    WZ.kill(WZ.makeEnemy('imp', G.w.x + 4, G.w.y)); step(30);
    u.items[0].t = C.remains.life - 1; step(10);
    bu.el = 'earth'; u.bank.earth = 0; u.rk.hands = ['rem_air']; u.rk.x = py.x + 0.8; u.rk.y = py.y; u.rk.fx = -1; u.rk.fy = 0; M3.throwOne(); step(30);
    step(40);   // (the burner, set to Earth with none banked, starves)
    bu.ash.air = C.burner.ashCap; bu.burn = 0; step(30);
    M3.deliver(rock, 'water', 1);
    tree.ch = 0.99; M3.deliver(tree, 'water', 5); let n = 0; while (!tree.broken && n++ < 40) WZ.hurtH(tree, 10); step(2);
    tree.ch = 0.4; G.w.x = tree.x + 1; G.w.y = tree.y; step(12);
    // a trap is planted and fires
    let spot = null; for (let d = 2; d < 8 && !spot; d += 0.5) for (let a = 0; a < 6.28 && !spot; a += 0.3) { const x = Math.floor(bu.x + Math.cos(a) * d) + 0.5, y = Math.floor(bu.y + Math.sin(a) * d) + 0.5; if (M3.free(x + 1.4, y, 1.3) && M3.free(x, y, 0.6)) spot = [x, y]; }
    u.rk.x = spot[0]; u.rk.y = spot[1]; u.rk.fx = 1; u.rk.fy = 0; u.rk.hands = ['t_dmg']; u.rk.throwCd = 0; M3.throwOne();
    const tp = u.bld[u.bld.length - 1]; tp.fuel = 12; const e = WZ.makeEnemy('golem', tp.x, tp.y); e.hp = e.maxHp = 1e5; e.spd = 0; e.dazeT = 100; step(4); G.w.enemies.length = 0;
    // a mirror Harvester: a packet up, a new one, gone with its Harvester
    M3.deliver(mir, mir.el, C.mirror.pack);
    let hs = null; for (let y = 0; y < G.fac.h && !hs; y++) for (let x = 0; x < G.fac.w && !hs; x++) if (FA.owned(x, y) && !FA.cell(x, y) && !FA.isPile(x, y)) hs = [x, y];
    const h2 = FA.makeBuilding('harness', hs[0], hs[1], false, false, 0); FA.onComplete(h2, false); step(2); FA.demolish(h2.x, h2.y, true); step(2);
    // a collector through a pole lifts ash
    const p = M3.make('pole', (bu.x + col.x) / 2, (bu.y + col.y) / 2); M3.link(bu, p); M3.link(p, col); step(40);
    // building and crafting
    for (const k of ['air', 'water', 'fire', 'earth']) { u.bank[k] = 20; for (let i = 0; i < 20; i++) u.blog.push(k); }
    u.rk.x = spot[0] - 4; u.rk.y = spot[1] + 4; u.rk.fx = 1; u.rk.fy = 0; let rc = null; for (let i = 0; i < 300 && !rc; i++) { const a = Math.random() * 6.28, d = 3 + Math.random() * 20; u.rk.x = bu.x + Math.cos(a) * d; u.rk.y = bu.y + Math.sin(a) * d; u.rk.fx = 1; u.rk.fy = 0; const f = M3.front(); if (M3.free(f[0], f[1], 1.0) && !M3.blockedU(u.rk.x, u.rk.y, 0.3)) rc = M3.place('rcraft'); } M3.craft(rc); step(Math.ceil(C.craftT / 0.05) + 2);
    // his world says NO: a wrong type at a busy burner, a throw at a pole and into water, a blocked placement, burning with no hose, a dry and a full trap, a blocked mirror, an idle collector, a full ash tray
    {
      const R = u.rk, spot2 = () => { for (let d = 3; d < 40; d += 0.7) for (let a = 0; a < 6.28; a += 0.4) { const x = Math.floor(bu.x + Math.cos(a) * d) + 0.5, y = Math.floor(bu.y + Math.sin(a) * d) + 0.5; if (!M3.blockedU(x, y, 0.5) && M3.free(x, y, 3.2) && M3.free(x - 3, y, 2)) return [x, y]; } return null; };
      const s2 = spot2(), nb = M3.make('burner', s2[0], s2[1], { el: 'air' });
      R.x = nb.x - 3; R.y = nb.y; R.fx = 1; R.fy = 0; R.vx = R.vy = 0; R.throwCd = 0; R.tool = null;
      nb.burn = 9; nb.bel = 'fire'; R.hands = ['rem_water']; M3.throwOne(undefined, { x: nb.x, y: nb.y, to: nb.id }); step(12);   // burner-busy
      const pl = M3.make('pole', nb.x, nb.y + 4), fl = FA.flightOf('rem_air', R.x, R.y, pl.x, pl.y, { to: null }); fl.t = fl.T; u.fly.push(fl); M3.flyTick(0.05);   // rk-bounce
      R.x = nb.x - 1.4; R.y = nb.y; R.tool = 'burner'; M3.place('burner'); R.tool = null;   // rk-nope
      step(40);   // burner-open (nb burns with no hose)
      nb.burn = 0; for (const e2 in nb.hop) nb.hop[e2] = 0; nb.ash.air = C.burner.ashCap; R.x = nb.x - 3; R.y = nb.y; R.throwCd = 0; R.hands = ['rem_water']; M3.throwOne(undefined, { x: nb.x, y: nb.y, to: nb.id }); step(12);   // burner-ash-throw
      const s3 = spot2(), tp2 = M3.make('trap', s3[0], s3[1], { tk: 'dmg' }); tp2.fuel = 0; const e3 = WZ.makeEnemy('golem', tp2.x, tp2.y); e3.hp = e3.maxHp = 1e5; e3.spd = 0; e3.dazeT = 100; step(10); G.w.enemies.length = 0;   // trap-dry
      tp2.fuel = C.traps.dmg.store; M3.deliver(tp2, 'earth', 1);   // trap-full
      const hv = FA.byId(mir.hid); hv.out.length = 0; while (hv.out.length < W.CFG.buffer) hv.out.push({ kind: mir.el }); mir.ch = 1; M3.mirrorSend(mir);   // mirror-blocked
      const s4 = spot2(), cl2 = M3.make('collector', s4[0], s4[1]); R.x = cl2.x + 1; R.y = cl2.y + 1; cl2.ct = 0; step(14);   // collector-idle
    }
    // dropping out and back (the host hooks), the game over
    W.Main.hostHooks3.lost({ id: 'g1' }); W.Main.hostHooks3.back({ id: 'g1' });
    G.w.hp = 1; WZ.damage(500, false, WZ.HAZ.unknown); step(30); W.UI.showResults();
    o.fb3 = Object.keys(G.fb).filter(k => G.fb[k] > 0);
    o.res = /ROOTKEEPER: GAME OVER/.test(document.getElementById('results').textContent);
    document.getElementById('results').classList.add('hidden');
    // the lobby: three statues, one seat per role, a taken role is rejected (no bump), READY
    W.menu.make(); const m = W.G.menu; m.online = { code: 'TEST', state: 'live' }; Lobby3.open(); const L = m.l3;
    const g1 = Lobby3.addChar(L, 'g1'), g2 = Lobby3.addChar(L, 'g2'), host = L.chars.find(c => c.who === 'host');
    o.c1 = Lobby3.claim(host, 'K'); o.c2 = Lobby3.claim(g1, 'K'); o.c3 = Lobby3.claim(g1, 'B'); o.c4 = Lobby3.claim(g2, 'W');
    o.seats = L.seats.map(s => s.who).join(','); o.join = W.Main.hostHooks3.canJoin({ mode: 3, role: 'W' });
    for (const q of m.plates) q.st = 'up';
    { const pl = m.plates.find(q => q.kind === 'ready' && q.seat === 2); host.x = pl.x; host.y = pl.y; host.tele = 0; Lobby3.step(0.05); }
    o.fb3 = o.fb3.concat(Object.keys(W.G.fb).filter(k => W.G.fb[k] > 0));
    return o;
  });
  ok(r.c1 && !r.c2 && r.c3 && r.c4 && r.seats === 'g1,g2,host', '3P lobby: a statue claims a free role; a taken one is REJECTED (no bump)', JSON.stringify(r));
  ok(r.join === 'role', '3P: a join asking for a role already in the room is refused', r.join);
  ok(r.res, '3P: the Rootkeeper has his own game over screen');
  const missing3 = ledger3.filter(id => r.fb3.indexOf(id) < 0);
  ok(missing3.length === 0, 'every 3-player row of the feedback ledger has a cue that fires', 'missing: ' + missing3.join(' ') + ' (have ' + r.fb3.join(' ') + ')');
  ok(ledger3.length >= 15, 'FEEDBACK.md lists the 3-player rows', ledger3.join(' '));

  ok(errs.length === 0, 'no page errors', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? 'FEATCHECK FAILED: ' + fails : 'FEATCHECK PASSED');
  process.exit(fails ? 1 : 0);
})();
