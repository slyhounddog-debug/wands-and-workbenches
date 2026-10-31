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
  ok(r.y4 && r.crypt && r.shards.join() === '1,2,4,0.1,0.1', 'a crypt needs 5 s; camps pay 1 shard, crypts 2, the Warden 4, elites 10%', JSON.stringify(r));
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
  ok(Math.abs(r.common - 0.15) < 0.03 && Math.abs(r.iron - 0.075) < 0.025 && Math.abs(r.eShard - 0.1) < 0.03, 'foes drop Wood / Stone about 15% and Iron about 7.5%; an elite drops a shard 10% of the time', JSON.stringify(r));
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

  // ================= errors + the snapshot photo test =================
  r = await run(() => { const S = __wands.Snap; __wands.snapshot(); return S.report ? { v: S.report.verdict, leaks: JSON.stringify(S.report.leaks.filter(l => !l.known).concat(S.report.issues || [], S.report.diff ? [S.report.diff] : [])).slice(0, 1500) } : null; });
  ok(r && (r.v === 'PASS' || r.v === 'KNOWN'), 'the photo test passes with the new state on screen', JSON.stringify(r));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? 'FEATCHECK FAILED: ' + fails : 'FEATCHECK PASSED');
  process.exit(fails ? 1 : 0);
})();
