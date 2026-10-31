'use strict';
// The 4-player online run (headless): a host page and THREE guest pages through the PeerJS cloud. Online > 4 PLAYER > Create / Join, the lobby (first come first served roles,
// the bump, the elements, the READY plates in the middle), the start, the game from every seat, the shared pause, a guest dropping and coming back, the game over.
//   node tools/mode4check/net.js     (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>, and internet for the signaling server)  SHOTS=<dir> saves pictures
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.env.SHOTS || '';
const URL = 'file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/');
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + extra : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = (p, t0, dt) => p.waitForFunction(([t0, dt]) => { const m = __wands.G.menu; return !m || m.t > t0 + dt; }, [t0, dt], { timeout: 20000 });
const press = async (p, k) => { await p.keyboard.down(k); await sleep(80); await p.keyboard.up(k); };
// the 2P menu world's plates: park the Builder off them, wait, put him on the plate (a step-on)
const stepOn = async (p, act, wait) => {
  const t0 = await p.evaluate(() => { const G = __wands.G, c = G.menu.tc; G.bd.x = c.x + 0.5 - 80; G.bd.y = c.y + 1.0 - 80; G.bd.vx = G.bd.vy = 0; return G.menu.t; });
  await frames(p, t0, 0.3);
  const r = await p.evaluate(act => { const G = __wands.G, q = G.menu.plates.find(x => x.act === act || x.key === act); if (!q) return 'noplate ' + act; G.bd.x = q.x - 80; G.bd.y = q.y - 80; return 'ok'; }, act);
  if (r !== 'ok') throw new Error(r);
  await sleep(wait || 1300);
};
async function boot(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  await page.mouse.click(300, 300);
  await sleep(300); await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu && __wands.G.menu.plates.length > 5, null, { timeout: 30000 });
  await sleep(1200);
  return { ctx, page, errs };
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const P = [await boot(browser, 'host')];
  const hp = P[0].page;
  // ---- the mode choice sits right after the Online plate
  await press(hp, 'KeyD');
  await stepOn(hp, 'go:online');
  let r = await hp.evaluate(() => { const m = __wands.G.menu; return { page: m.page, acts: m.plates.map(p => p.act) }; });
  ok(r.page === 'mode' && r.acts.indexOf('mode:2') >= 0 && r.acts.indexOf('mode:4') >= 0, 'Online leads to the 2 PLAYER / 4 PLAYER plates', JSON.stringify(r));
  await stepOn(hp, 'mode:4');
  r = await hp.evaluate(() => { const m = __wands.G.menu; return { page: m.page, mode: m.mode, acts: m.plates.map(p => p.act) }; });
  ok(r.page === 'online' && r.mode === 4 && r.acts.indexOf('go:create') >= 0 && r.acts.indexOf('go:join') >= 0, 'then HOST / JOIN', JSON.stringify(r));
  await stepOn(hp, 'go:create'); await stepOn(hp, 'slot:1', 500);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.online && __wands.G.menu.online.code, null, { timeout: 30000 });
  const code = await hp.evaluate(() => __wands.G.menu.online.code);
  ok(/^[A-Z2-9]{6}$/.test(code), 'a 4P room opens with a room code', code);
  ok(await hp.evaluate(() => __wands.Net.mode === 4), 'the room is a 4-player room');
  // ---- three guests join with the same code
  for (let g = 1; g <= 3; g++) {
    const G_ = await boot(browser, 'guest' + g); P.push(G_);
    const gp = G_.page;
    await press(gp, 'KeyD');
    await stepOn(gp, 'go:online'); await stepOn(gp, 'mode:4'); await stepOn(gp, 'go:join', 1500);
    await gp.evaluate(() => { const G = __wands.G, k = G.menu.kb; G.bd.x = k.x - 80 + 1.2; G.bd.y = k.y - 80 + 0.2; });
    await sleep(400); await press(gp, 'KeyE'); await sleep(300);
    for (const ch of code) await gp.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
    await gp.keyboard.press('Enter');
    await hp.waitForFunction(n => __wands.Net.liveSlots().length >= n, g, { timeout: 60000 });
    ok(true, 'guest ' + g + ' joined', 'players ' + (g + 1));
  }
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs4' && __wands.G.menu.l4.chars.length === 4, null, { timeout: 20000 });
  for (const G_ of P.slice(1)) await G_.page.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs4', null, { timeout: 30000 });
  ok(true, 'the host and all three guests are in the 4P lobby');
  ok(await P[2].page.evaluate(() => __wands.Net.me === 'g2' && __wands.G.menu.l4.me === 'g2'), 'a guest knows which player it is (the camera follows its own character)');
  if (SHOTS) await P[0].page.screenshot({ path: path.join(SHOTS, 'lobby_host.png') });

  // ---- roles: first come first served; a full role bumps to the other (and says so)
  const step = async (who, key) => {
    await hp.evaluate(w => { const L = __wands.G.menu.l4, c = L.chars.find(q => q.who === w); c.x = 71; c.y = 79; c.vx = c.vy = 0; }, who);   // (parked off every plate)
    await sleep(500);
    await hp.evaluate(([w, key]) => { const m = __wands.G.menu, L = m.l4, c = L.chars.find(q => q.who === w), q = m.plates.find(p => p.key === key); c.x = q.x; c.y = q.y; }, [who, key]);
    await sleep(600);
  };
  await step('host', 'roleW'); await step('g1', 'roleW'); await step('g2', 'roleW'); await step('g3', 'roleB');
  r = await hp.evaluate(() => { const L = __wands.G.menu.l4; return { seats: L.seats.map(s => s.who), bumps: L.bumps.length, chars: L.chars.map(c => c.who + ':' + c.seat) }; });
  ok(r.seats[2] === 'host' && r.seats[3] === 'g1' && r.seats[0] === 'g2' && r.seats[1] === 'g3', 'first come first served: host W1, g1 W2, the third Wizard is bumped to B1, then B2', JSON.stringify(r));
  ok(r.bumps >= 1 || await hp.evaluate(() => !!(__wands.G.fb && __wands.G.fb['lobby-bump'])), 'the bump shows (a cue over his head, a line at the bottom)');
  // ---- the Wizards pick their two elements, everybody stands on READY in the middle
  await hp.evaluate(() => { const L = __wands.G.menu.l4; L.seats[2].att = ['fire', 'water']; L.seats[3].att = ['air', 'earth']; });
  await hp.evaluate(() => { const m = __wands.G.menu, L = m.l4; for (let s = 0; s < 4; s++) { const c = L.chars.find(q => q.who === L.seats[s].who), p = m.plates.find(q => q.kind === 'ready' && q.seat === s); c.x = p.x; c.y = p.y; } });
  if (SHOTS) { await sleep(500); await P[0].page.screenshot({ path: path.join(SHOTS, 'lobby_ready.png') }); }
  await hp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m4, null, { timeout: 60000 });
  for (const G_ of P.slice(1)) await G_.page.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m4, null, { timeout: 40000 });
  ok(true, 'all four seats ready: the countdown ran and all four machines are in the 4P game');
  for (const G_ of P) await G_.page.evaluate(() => { __wands.UI.help(false); __wands.G.helpT = 0; });
  await sleep(1500);
  const seen = await Promise.all(P.map(G_ => G_.page.evaluate(() => ({ vi: __wands.G.vi, me: __wands.Net.me, role: __wands.Net.role, seats: __wands.G.seats.map(s => s.name + ':' + s.who), t: __wands.G.stats.time }))));
  ok(seen[0].vi === 2 && seen[0].seats.length === 4, 'the host plays Wizard 1 (seat 2)', JSON.stringify(seen[0]));
  ok(seen.slice(1).every(s => s.vi >= 0 && s.role === 'guest'), 'each guest knows its seat', seen.map(s => s.vi).join(','));
  ok(Math.abs(seen[0].t - seen[3].t) < 1.5, 'the guests see the host game running (snapshots)', seen.map(s => s.t.toFixed(1)).join(' '));
  if (SHOTS) for (let i = 0; i < 4; i++) await P[i].page.screenshot({ path: path.join(SHOTS, 'game_' + i + '.png') });
  // ---- every seat plays: keys on the guests' machines move THEIR characters on the host
  const pos = () => hp.evaluate(() => { const G = __wands.G; return { w1: [G.w.x, G.w.y], w2: [G.w2.x, G.w2.y], b1: [G.bd.x, G.bd.y], b2: [G.bd2.x, G.bd2.y] }; });
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const hold = async (page, k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
  await hp.evaluate(() => { __wands.G.w.enemies.length = 0; __wands.CFG.world.cap = 0; });
  let p0 = await pos();
  await hold(hp, 'KeyD', 700);          // the host plays Wizard 1 (seat 2) with his keyboard
  let p1 = await pos(); ok(d2(p0.w1, p1.w1) > 1 && d2(p0.w2, p1.w2) < 0.5, 'the host key moves Wizard 1 (and nobody else)', d2(p0.w1, p1.w1).toFixed(1));
  p0 = p1; await hold(P[1].page, 'KeyW', 800);   // guest 1 is Wizard 2
  p1 = await pos(); ok(d2(p0.w2, p1.w2) > 1 && d2(p0.w1, p1.w1) < 0.5, 'guest 1 moves Wizard 2', d2(p0.w2, p1.w2).toFixed(1));
  p0 = p1; await hold(P[2].page, 'KeyS', 800);   // guest 2 is Builder 1
  p1 = await pos(); ok(d2(p0.b1, p1.b1) > 1 && d2(p0.b2, p1.b2) < 0.5, 'guest 2 moves Builder 1', d2(p0.b1, p1.b1).toFixed(1));
  p0 = p1; await hold(P[3].page, 'KeyA', 800);   // guest 3 is Builder 2
  p1 = await pos(); ok(d2(p0.b2, p1.b2) > 1 && d2(p0.b1, p1.b1) < 0.5, 'guest 3 moves Builder 2', d2(p0.b2, p1.b2).toFixed(1));
  await sleep(400);
  const gv = await Promise.all(P.slice(1).map(G_ => G_.page.evaluate(() => { const G = __wands.G; return { vi: G.vi, w2: [G.w2.x, G.w2.y], b2: [G.bd2.x, G.bd2.y] }; })));
  ok(gv.every(v => Math.abs(v.w2[0] - p1.w2[0]) < 3 && Math.abs(v.b2[0] - p1.b2[0]) < 3), 'every guest sees the others where the host has them', JSON.stringify(gv.map(v => v.vi)));

  // ---- the shared pause: any player pauses everybody
  await P[1].page.evaluate(() => __wands.Main.pause(true)); await sleep(700);
  const t0 = await hp.evaluate(() => __wands.G.stats.time); await sleep(1200);
  const t1 = await hp.evaluate(() => ({ t: __wands.G.stats.time, p: __wands.G.paused, by: JSON.stringify(__wands.G.pauseBy) }));
  ok(t1.p && Math.abs(t1.t - t0) < 0.2, 'a guest pausing stops the game for everybody', t1.by);
  const ban = await P[2].page.evaluate(() => { const e = document.getElementById('pausedBy'); return e && !e.classList.contains('hidden') ? e.textContent : ''; });
  ok(/ROSE PAUSED/.test(ban), 'and the others are told WHO paused', ban);
  await P[1].page.evaluate(() => __wands.Main.pause(false)); await sleep(900);
  ok(await hp.evaluate(() => !__wands.G.paused), 'unpausing resumes it');

  // ---- a guest drops: his character stands idle and the game goes on; the same code inside the window hands control back
  await P[3].page.evaluate(() => __wands.Net.conn.close()); await sleep(1500);
  r = await hp.evaluate(() => { const G = __wands.G, q = G.seats[1]; return { conn: q.conn, who: q.who, live: __wands.Net.liveSlots().length, t: G.stats.time }; });
  ok(r.conn === false && r.live === 2, 'a guest who drops leaves his seat standing (AWAY) and the game goes on', JSON.stringify(r));
  await P[3].page.evaluate(() => { __wands.Net.rejoin(); }); await sleep(3500);
  r = await hp.evaluate(() => { const G = __wands.G; return { conn: G.seats[1].conn, live: __wands.Net.liveSlots().length }; });
  ok(r.conn !== false && r.live === 3, 'rejoining with the same code inside the window hands control back', JSON.stringify(r));
  p0 = await pos(); await hold(P[3].page, 'KeyD', 800); p1 = await pos();
  ok(d2(p0.b2, p1.b2) > 1, 'and he drives his Builder again', d2(p0.b2, p1.b2).toFixed(1));

  // ---- both Wizards down: the game over, everyone READY restarts it
  await hp.evaluate(() => { const W = __wands, G = W.G, WZ = W.WZ; for (const i of [0, 1]) WZ.as(i, () => { G.w.hp = 1; WZ.damage(500, false, WZ.HAZ.unknown); }); });
  await hp.waitForFunction(() => __wands.G.over && __wands.G.overT > 1.2, null, { timeout: 15000 });
  await sleep(1500);
  const rs = await Promise.all(P.map(G_ => G_.page.evaluate(() => { const e = document.getElementById('results'); return !!e && !e.classList.contains('hidden') && /READY/.test(e.textContent); })));
  ok(rs.every(Boolean), 'the game over screen shows on all four machines', rs.join(','));
  for (const i of [1, 2, 3]) await P[i].page.evaluate(() => document.getElementById('rReMe').click());
  await sleep(1200);
  ok(await hp.evaluate(() => __wands.G.over), 'not everybody is ready yet: it waits for every connected player');
  await hp.evaluate(() => document.getElementById('rReMe').click()); await sleep(1500);
  r = await hp.evaluate(() => { const G = __wands.G; return { over: G.over, d1: G.w.dead, d2: G.w2.dead }; });
  ok(!r.over && !r.d1 && !r.d2, 'every connected player ready: the run starts again', JSON.stringify(r));

  // ---- the skill tree belongs to the team: a guest asks to buy, the host decides, both Wizards and both Builders get it
  await hp.evaluate(() => { const G = __wands.G; G.xp = 500; G.tree = G.tree || {}; for (const el of ['air', 'water', 'fire', 'earth']) G.bank[el] = 40; });
  await P[1].page.evaluate(() => __wands.UI.buy('hearty')); await sleep(1200);
  const bt = await Promise.all(P.map(G_ => G_.page.evaluate(() => __wands.G.tree.hearty || 0)));
  ok(bt.every(v => v >= 1), 'a guest buys a node for the whole team (shared tree)', bt.join(','));
  const hud = await Promise.all([P[0], P[2]].map(G_ => G_.page.evaluate(() => { const t = document.getElementById('seatTag'); return t && !t.classList.contains('hidden') ? t.textContent.replace(/\s+/g, ' ').trim() : ''; })));
  ok(/VIOLET/.test(hud[0]) && /COPPER/.test(hud[1]), 'every screen says whose it is (a coloured seat chip)', hud.join(' | '));
  if (SHOTS) for (let i = 0; i < 4; i++) await P[i].page.screenshot({ path: path.join(SHOTS, 'play_' + i + '.png') });

  const errs = P.flatMap(p => p.errs);
  ok(errs.length === 0, 'no page errors on any of the four machines', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
