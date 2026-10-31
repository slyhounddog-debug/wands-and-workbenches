'use strict';
// The quality-of-life acceptance run (headless, offline): a short playthrough with no page errors, then
//   - the edge bubbles for jammed / starved / unpowered machines off screen (R.flagList / R.drawFlags),
//   - hit-stop on elite / Warden kills and the heavier weakness-hit sound,
//   - the click-drag belt line (FA.beltPath; a REAL mouse drag with the preview, the auto-turn, cancel with right-click),
//   - the no-power chip on the Wizard's card,
//   - the wilds' sound effects the host logs for the online guest (Main.tapSfx / Main.playSnd),
//   - the snapshot photo test with the new drawing on screen.
//   node tools/qolcheck/run.js        (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
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
  // (the boot screen's click / key listener is armed until the studio intro has been started and skipped: a real mouse press later would otherwise start it mid-test)
  await page.waitForTimeout(800); await page.mouse.click(400, 300); await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu, null, { timeout: 20000 });
  await page.evaluate(() => { __wands.UI.show('loading', false); __wands.start(1); __wands.UI.help(false); __wands.G.helpT = 0; if (__wands.G.paused) __wands.Main.pause(false); });

  // ---- a short playthrough: the dev bot plays the Wizard while things are delivered, an event and the boss come
  await page.evaluate(() => {
    const W = __wands;
    W.bot('wizard');
    for (const k of ['air', 'water', 'fire', 'earth', 'flamethrower', 'tempest', 'meteor']) { W.deliver(k); W.step(0.05, 12); }
    W.egg('egg_zephyr'); W.egg('egg_cinder'); W.step(0.05, 80);
    W.event(1); W.step(0.05, 130);
    W.boss(); W.step(0.05, 80);
    W.bot(null);
  });
  ok(errs.length === 0, 'playthrough: no page errors', errs.slice(0, 3).join(' / '));
  await page.evaluate(() => { const W = __wands; W.G.w.hp = 1e5; W.G.w.dead = false; W.G.w.boss = null; for (const k of ['enemies', 'allies', 'aq', 'proj', 'eproj', 'aproj', 'zones', 'timers', 'fx_', 'drops', 'arcs', 'pickups', 'mines', 'booms']) if (Array.isArray(W.G.w[k])) W.G.w[k].length = 0; });   // (a calm wilds: the photo tests below compare two frames pixel for pixel)

  // ---- the no-power chip (Wizard's card) + edge bubbles: drain every Battery, run a few seconds, walk the Builder to the far corner
  await page.evaluate(() => {
    const W = __wands, f = W.G.fac;
    window.__bats = f.bld.filter(b => b.type === 'battery' || b.type === 'heavybat').map(b => [b, b.bat, b.fuel]);
    for (const b of f.bld) if (b.type === 'battery' || b.type === 'heavybat') { b.bat = 0; b.fuel = {}; }
    W.CFG.harness.air.cycle = 1e9;
    W.step(0.05, 130);   // 6.5 s dark
  });
  const dark = await page.evaluate(() => ({ darkT: __wands.G.fac.darkT, shown: !document.getElementById('noPow').classList.contains('hidden'), gen: __wands.G.fac.gen, demand: __wands.G.fac.demand }));
  ok(dark.darkT >= 1.5 && dark.shown, 'out of power: the bolt chip shows on the Wizard card', JSON.stringify(dark));
  await page.evaluate(() => {   // the Builder as far from every finished machine as the floor allows
    const W = __wands, f = W.G.fac, FA = W.FA, ms = f.bld.filter(b => b.done && b.type !== 'battery');
    let best = null;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (!FA.owned(x, y) || FA.cell(x, y)) continue;
      const d = Math.min(...ms.map(b => Math.hypot(b.x - x, b.y - y)));
      if (!best || d > best.d) best = { x, y, d };
    }
    W.G.bd.x = best.x + 0.5; W.G.bd.y = best.y + 0.5; W.G.bd.vx = W.G.bd.vy = 0;
    window.__far = best;
  });
  await page.waitForTimeout(1500);
  const fl = await page.evaluate(() => {
    const W = __wands, offs = W.G.fac.bld.filter(b => b.st === 'off' && b.stT >= W.CFG.edgeFlag.after);
    return { offs: offs.length, flags: W.R.flagList(W.R.fv), far: window.__far };
  });
  console.log('   far corner', JSON.stringify(fl.far), 'unpowered machines', fl.offs, 'bubbles', JSON.stringify(fl.flags.map(o => ({ st: o.st, n: o.n, x: Math.round(o.x), y: Math.round(o.y) }))));
  ok(fl.flags.length > 0 && fl.flags.every(o => o.st === 'off'), 'unpowered machines off screen get an edge bubble', fl.flags.length + ' bubble(s)');
  ok(fl.flags.length <= 5, 'at most CFG.edgeFlag.max bubbles');
  const inside = await page.evaluate(() => { const R = __wands.R; return __wands.R.flagList(R.fv).every(o => o.x >= 90 && o.x <= R.rect.w - 90 && o.y >= 170 && o.y <= 900 - 150); });
  ok(inside, 'bubbles sit inside the factory half, clear of the top bar and the hotbar');
  await shot('edge-bubbles');
  // a machine that has only just changed state, or one in view, gets none
  const quiet = await page.evaluate(() => {
    const W = __wands, bs = W.G.fac.bld.filter(b => b.st === 'off'), saved = bs.map(b => b.stT);
    bs.forEach(b => { b.stT = 0.5; });
    const none = W.R.flagList(W.R.fv).length;
    bs.forEach((b, i) => { b.stT = saved[i]; });
    return none;
  });
  ok(quiet === 0, 'a fresh state change (under CFG.edgeFlag.after s) gets no bubble');
  // snapshot photo test with the bubbles on screen
  const snap1 = await page.evaluate(() => { __wands.snapshot(); const r = __wands.Snap.report; return { verdict: r.verdict, px: r.diff.px, bbox: r.diff.bbox, bad: [...r.leaks, ...r.issues].filter(x => !x.known).map(x => x.id) }; });
  ok(snap1.verdict !== 'FAIL', 'snapshot photo test with edge bubbles on screen: ' + snap1.verdict, JSON.stringify(snap1));
  // charge a Battery again: the chip goes away
  await page.evaluate(() => { for (const [b, bat, fuel] of window.__bats) { b.bat = Math.max(bat, 100); b.fuel = fuel; } __wands.CFG.harness.air.cycle = 3.41; __wands.step(0.05, 10); });
  ok(await page.evaluate(() => document.getElementById('noPow').classList.contains('hidden')), 'power back: the chip is gone');

  // ---- hit-stop and the weakness sound (offline): a single synchronous run, so the live loop cannot step in between
  const hs = await page.evaluate(() => {
    const W = __wands, WZ = W.WZ, w = W.G.w, ctl = o => Object.assign({ bix: 0, biy: 0, wix: 0, wiy: 0, wrx: 0, wry: 0, roll: false, act: {}, broll: false }, o || {});
    W.CFG.world.cap = 0; w.enemies.length = 0; w.hp = 1e5; w.dead = false;
    const log = [], orig = AU.sfx; AU.sfx = n => { log.push(n); };
    const frames = (dt, n, o) => { const ts = []; for (let i = 0; i < n; i++) { ts.push(w.t); W.Main.step(dt, ctl(o)); } ts.push(w.t); return ts; };
    const res = {};
    const adv = ts => ts.filter((t, i) => i && t > ts[i - 1] + 1e-9).length;   // how many of the steps moved the Wizard's clock
    // a plain foe: no stop
    const plain = WZ.makeEnemy('slime', w.x + 6, w.y, false); WZ.hurtE(plain, 1e9);
    res.plainStop = w.hitstop || 0; frames(0.016, 2); w.hitstop = 0;
    // an elite: 20 ms = one frozen frame at 16 ms
    const el = WZ.makeEnemy('slime', w.x + 6, w.y, true); WZ.hurtE(el, 1e9);
    res.eliteStop = w.hitstop; const te = frames(0.016, 4); res.eliteMoved = adv(te);
    // the Warden: 60 ms
    const wd = WZ.makeEnemy('slime', w.x + 6, w.y, true); wd.warden = true; WZ.hurtE(wd, 1e9);
    res.wardenStop = w.hitstop; const tw = frames(0.016, 8); res.wardenMoved = adv(tw);
    // a press made during a frozen frame is kept
    const e3 = WZ.makeEnemy('slime', w.x + 6, w.y, true); e3.warden = true; WZ.hurtE(e3, 1e9);
    W.Main.step(0.016, ctl({ roll: true })); res.carry = !!W.Main.hsCarry.roll; frames(0.016, 8); res.carryGone = !W.Main.hsCarry.roll;
    // weakness hit: the heavier sound, once per 80 ms; a plain hit does not
    w.hitstop = 0; log.length = 0;
    const wk = WZ.makeEnemy('slime', w.x + 8, w.y, false); wk.weak = 'air'; wk.hp = wk.maxHp = 1e6;
    WZ.ctx = { spell: 'gust', el: ['air'], hits: 0, kills: 0, weak: 0 }; WZ.hurtE(wk, 1); WZ.hurtE(wk, 1);
    res.weakSfx = log.filter(n => n === 'hitw').length;
    log.length = 0; WZ.ctx = { spell: 'gust', el: ['fire'], hits: 0, kills: 0, weak: 0 }; w.t += 1; const nw = WZ.makeEnemy('slime', w.x + 8, w.y, false); nw.weak = 'air'; nw.hp = 1e6; WZ.hurtE(nw, 1);
    res.plainSfx = log.filter(n => n === 'hitw').length;
    WZ.ctx = null; AU.sfx = orig; w.enemies.length = 0;
    return res;
  });
  console.log('   hit-stop', JSON.stringify(hs));
  ok(hs.plainStop === 0, 'a plain kill has no hit-stop');
  ok(Math.abs(hs.eliteStop - 0.02) < 1e-9 && hs.eliteMoved === 3, 'elite kill: 20 ms hold, the next frame runs (1 of 4 frames frozen)');
  ok(Math.abs(hs.wardenStop - 0.06) < 1e-9 && hs.wardenMoved >= 3 && hs.wardenMoved <= 5, 'Warden kill: 60 ms hold (3-4 of 8 frames frozen)');
  ok(hs.carry && hs.carryGone, 'a press made during hit-stop is kept for the next frame');
  ok(hs.weakSfx === 1 && hs.plainSfx === 0, 'weakness hits play the heavier sound (once per burst); ordinary hits do not');

  // ---- belt lines: the path maker
  const bp = await page.evaluate(() => {
    const W = __wands, FA = W.FA, f = W.G.fac, res = {};
    let blk = null;   // a free 6 x 4 block
    for (let y = 0; y < f.h - 4 && !blk; y++) for (let x = 0; x < f.w - 6 && !blk; x++) {
      let all = true;
      for (let j = 0; j < 4 && all; j++) for (let i = 0; i < 6 && all; i++) all = FA.owned(x + i, y + j) && !FA.cell(x + i, y + j) && FA.canPlace(x + i, y + j);
      if (all) blk = { x, y };
    }
    window.__blk = blk; res.blk = blk;
    if (!blk) return res;
    W.G.stock.wood = 50;
    const p = FA.beltPath(blk.x, blk.y, blk.x + 4, blk.y + 2, 0);
    res.len = p.length; res.dirs = p.map(s => s.dir).join(''); res.corners = p.filter(s => s.corner).length; res.cornerAt = p.findIndex(s => s.corner); res.sts = p.map(s => s.st).join(',');
    const q = FA.beltPath(blk.x, blk.y, blk.x + 1, blk.y + 3, 0);   // the long way is south
    res.south = q.map(s => s.dir).join('');
    const one = FA.beltPath(blk.x, blk.y, blk.x, blk.y, 2); res.one = one.length + ':' + one[0].dir;
    // an obstacle on the first leg: the other order is taken
    const obs = FA.place('battery', blk.x + 2, blk.y, 0);
    const r = FA.beltPath(blk.x, blk.y, blk.x + 4, blk.y + 2, 0);
    res.around = r.map(s => s.x + ',' + s.y).join(' '); res.aroundSt = r.every(s => s.st === 'new');
    // the end tile taken: stop short, the last belt points into it
    const into = FA.beltPath(blk.x, blk.y + 3, blk.x + 2, blk.y, 0);   // (x+2, y) is the battery: the line goes (x, y+3) -> ... -> (x+2, y+1) and points north into it
    res.into = into.length + ':' + into[into.length - 1].dir + ':' + into[into.length - 1].x + ',' + into[into.length - 1].y;
    // no Wood: tiles are marked
    W.G.stock.wood = 2; const lw = FA.beltPath(blk.x, blk.y + 3, blk.x + 5, blk.y + 3, 0); res.woodSt = lw.map(s => s.st).join(','); W.G.stock.wood = 50;
    FA.demolish(blk.x + 2, blk.y, true); W.G.stock.wood = 50;
    return res;
  });
  console.log('   beltPath', JSON.stringify(bp));
  ok(!!bp.blk, 'found room for belt tests');
  ok(bp.len === 7 && bp.dirs === '0000111' && bp.corners === 1 && bp.cornerAt === 4 && /^(new,)*new$/.test(bp.sts), 'a line to (+4, +2): east 4, then south; ONE corner, where it turns', bp.dirs);
  ok(bp.south === '11100', 'the longer side goes first (south 3, then east 1)', bp.south);
  ok(bp.one === '1:2', 'a click is a line of one belt, facing the placement direction', bp.one);
  ok(bp.aroundSt && bp.around.split(' ').length === 7 && bp.around.split(' ').indexOf((bp.blk.x + 2) + ',' + bp.blk.y) < 0, 'a blocked first leg turns the other way round (same length, round the block)', bp.around);
  ok(bp.into === '5:0:' + (bp.blk.x + 1) + ',' + bp.blk.y, 'a taken end tile: the line stops one short and its last belt points into it', bp.into);
  ok(bp.woodSt === 'new,new,wood,wood,wood,wood', 'tiles beyond the Stockpile\'s Wood are marked', bp.woodSt);

  // ---- the real thing: a mouse drag with the preview, the release, and a cancel
  const geo = await page.evaluate(() => {
    const W = __wands, R = W.R, b = window.__blk;
    W.G.bd.x = b.x + 2.5; W.G.bd.y = b.y + 1.5; W.G.bd.vx = W.G.bd.vy = 0; W.G.stock.wood = 50;
    W.UI.select('belt'); W.G.placeDir = 0;
    return { b };
  });
  await page.waitForFunction(() => { const c = __wands.R.fcam, b = __wands.G.bd; return Math.hypot(c.x - b.x - b.vx * 0.18, c.y - b.y - b.vy * 0.18) < 0.01; }, null, { timeout: 10000 });   // (the camera has caught up: tile positions on screen hold still)
  await page.waitForTimeout(300);
  const pt = async (dx, dy) => page.evaluate(([bx, by, dx, dy]) => { const R = __wands.R, s = R.toScreen(R.fv, bx + dx + 0.5, by + dy + 0.5), c = document.getElementById('cv').getBoundingClientRect(); return [c.left + s[0] * c.width / 1600, c.top + s[1] * c.height / 900]; }, [geo.b.x, geo.b.y, dx, dy]);
  const over = (dx, dy) => page.evaluate(([bx, by, dx, dy]) => { const t = hoverTile(__wands.R.fv); return t[0] === bx + dx && t[1] === by + dy; }, [geo.b.x, geo.b.y, dx, dy]);
  const aim = async (dx, dy, steps) => {   // the real mouse onto a tile, checked against what the game thinks is under it (the camera may still be settling on a loaded machine)
    for (let i = 0; i < 12; i++) { const q = await pt(dx, dy); await page.mouse.move(q[0], q[1], steps ? { steps } : undefined); await page.waitForTimeout(110); if (await over(dx, dy)) return; }
    throw new Error('could not put the mouse over tile +' + dx + ',+' + dy);
  };
  const woodBefore = await page.evaluate(() => { const D = __wands.CFG.drops; D.common = 0; D.iron = 0; return __wands.G.stock.wood; });   // (a kill's Wood drop must not fly in and hide the belts' cost)
  await aim(0, 0);
  await page.mouse.down();
  await aim(3, 0, 6);
  const m1 = await page.evaluate(() => ({ n: __wands.G.drag && __wands.G.drag.path.length, cells: window.__wands.G.fac.belts.length }));
  await aim(4, 2, 6); await page.waitForTimeout(150);
  const m2 = await page.evaluate(() => ({ path: __wands.G.drag && __wands.G.drag.path.map(s => s.dir).join(''), ghost: !!__wands.R.ghost }));
  await shot('belt-line-preview');
  ok(m1.n === 4, 'dragging: the preview follows the cursor (4 tiles at +3, 0)', JSON.stringify(m1));
  ok(m2.path === '0000111' && !m2.ghost, 'dragging: the full line with its auto-turn, in place of the single ghost', JSON.stringify(m2));
  const beltsBefore = await page.evaluate(() => __wands.G.fac.belts.length);
  ok(beltsBefore === m1.cells, 'nothing is laid while the button is held');
  await page.mouse.up(); await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const W = __wands, b = window.__blk, ds = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2]]) { const c = W.FA.cell(b.x + dx, b.y + dy); ds.push(c && c.type === 'belt' ? c.dir : '-'); }
    return { dirs: ds.join(''), wood: W.G.stock.wood, drag: W.G.drag };
  });
  ok(after.dirs === '0000111', 'releasing lays the whole line, turned at the corner', after.dirs);
  ok(woodBefore - after.wood === 7, 'it cost 1 Wood a belt (7)', woodBefore + ' -> ' + after.wood);
  ok(after.drag === null, 'the drag is over');
  // cancel with the right button
  await page.evaluate(() => { __wands.G.stock.wood = 50; });
  await aim(0, 3); await page.mouse.down();
  await aim(3, 3, 5);
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(150); await page.mouse.up({ button: 'right' });
  await page.mouse.up(); await page.waitForTimeout(250);
  const canc = await page.evaluate(() => { const W = __wands, b = window.__blk; let n = 0; for (let i = 0; i < 4; i++) { const c = W.FA.cell(b.x + i, b.y + 3); if (c && c.type === 'belt') n++; } return { n, sel: W.G.selected }; });
  ok(canc.n === 0 && canc.sel === 'belt', 'right-click while dragging cancels just the line (the tool stays)', JSON.stringify(canc));
  // a plain click still lays one belt
  await aim(0, 3); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(250);
  ok(await page.evaluate(() => { const b = window.__blk, c = __wands.FA.cell(b.x, b.y + 3); return !!c && c.type === 'belt'; }), 'a plain click still lays one belt');
  // snapshot photo test during a drag
  await page.mouse.down(); await aim(3, 3, 5); await page.waitForTimeout(150);
  const snap2 = await page.evaluate(() => { __wands.snapshot(); const r = __wands.Snap.report; return { verdict: r.verdict, px: r.diff.px, bbox: r.diff.bbox, bad: [...r.leaks, ...r.issues].filter(x => !x.known).map(x => x.id) }; });
  ok(snap2.verdict !== 'FAIL', 'snapshot photo test with a belt line being dragged: ' + snap2.verdict, JSON.stringify(snap2));
  await page.mouse.up(); await page.waitForTimeout(200);
  await page.evaluate(() => { __wands.UI.select('hand'); });

  // ---- the wilds' sounds for the online guest
  const sn = await page.evaluate(() => {
    const W = __wands, Net = W.Net, M = W.Main, res = {};
    const saved = [Net.on, Net.role];
    Net.on = true; Net.role = 'host';
    delete W.G.snd;
    M.stepN++; M.tapSfx('hit'); M.tapSfx('hit'); M.tapSfx('kill'); M.tapSfx('place'); M.tapSfx('craft'); M.tapSfx('step_b');
    res.hostList = W.G.snd.list.map(e => e.s).join(',');
    M.stepN++; M.tapSfx('hit');
    res.n = W.G.snd.n;
    for (let i = 0; i < 40; i++) { M.stepN++; M.tapSfx('hit'); }
    res.cap = W.G.snd.list.length;
    // the guest side: the first picture only sets the count; later ones play only the new events
    const played = [], orig = AU.sfx; AU.sfx = n => { played.push(n); };
    M.sndN = -1;
    const mk = (n, names) => ({ n, list: names.map((s, i) => ({ n: n - names.length + 1 + i, s, f: 0 })) });
    M.playSnd({ snd: mk(10, ['hit', 'kill']) }); res.first = played.length;
    M.playSnd({ snd: mk(12, ['hit', 'kill', 'zap_fire', 'hurt']) }); res.second = played.join(',');
    M.playSnd({ snd: mk(12, ['hit', 'kill', 'zap_fire', 'hurt']) }); res.again = played.length;
    M.playSnd({}); res.none = played.length;
    AU.sfx = orig; M.sndN = -1; delete W.G.snd; Net.on = saved[0]; Net.role = saved[1];
    return res;
  });
  console.log('   guest sounds', JSON.stringify(sn));
  ok(sn.hostList === 'hit,kill', 'host logs only wilds sounds, one of each per step (no belts / machines / Builder footsteps)', sn.hostList);
  ok(sn.n === 3 && sn.cap === 24, 'the log counts every event and keeps the last 24', JSON.stringify([sn.n, sn.cap]));
  ok(sn.first === 0 && sn.second === 'zap_fire,hurt' && sn.again === 2 && sn.none === 2, 'guest: the first picture is silent, later ones play only what is new, none twice', JSON.stringify(sn));
  ok(await page.evaluate(() => !__wands.G.snd), 'offline play records nothing');

  ok(errs.length === 0, 'no page errors in the whole run', errs.slice(0, 4).join(' / '));
  await browser.close();
  console.log(fails ? fails + ' CHECK(S) FAILED' : 'ALL QOL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL qolcheck crashed: ' + (e && e.stack || e)); process.exit(1); });
