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

  // ================= errors + the snapshot photo test =================
  r = await run(() => { const S = __wands.Snap; __wands.snapshot(); return S.report ? { v: S.report.verdict, leaks: JSON.stringify(S.report).slice(0, 400) } : null; });
  ok(r && (r.v === 'PASS' || r.v === 'KNOWN'), 'the photo test passes with the new state on screen', JSON.stringify(r));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? 'FEATCHECK FAILED: ' + fails : 'FEATCHECK PASSED');
  process.exit(fails ? 1 : 0);
})();
