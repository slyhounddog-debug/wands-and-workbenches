'use strict';
// The 3-player online run (headless): a host page and TWO guest pages through the PeerJS cloud (plus a third that is turned away). Online > 3 PLAYER > Create / Join with a role,
// the join rule (a taken role is REJECTED), the lobby (the statues, READY), the start, the game from every seat, the shared pause, a guest dropping and coming back, the game over.
//   node tools/mode3check/net.js     (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>, and internet for the signaling server)  SHOTS=<dir> saves pictures
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.env.SHOTS || '';
const URL = 'file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/');
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + extra : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = (p, t0, dt) => p.waitForFunction(([t0, dt]) => { const m = __wands.G.menu; return !m || m.t > t0 + dt; }, [t0, dt], { timeout: 20000 });
const press = async (p, k) => { await p.keyboard.down(k); await sleep(80); await p.keyboard.up(k); };
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
// a guest: Online > 3 PLAYER > JOIN, its role plate, then the code at the keyboard prop; resolves with the join window's message
async function join(gp, code, role) {
  await press(gp, 'KeyD');
  await stepOn(gp, 'go:online'); await stepOn(gp, 'mode:3'); await stepOn(gp, 'go:join', 1500);
  await stepOn(gp, 'jrole:' + role, 900);
  await gp.evaluate(() => { const G = __wands.G, k = G.menu.kb; G.bd.x = k.x - 80 + 1.2; G.bd.y = k.y - 80 + 0.2; });
  await sleep(400); await press(gp, 'KeyE'); await sleep(300);
  for (const ch of code) await gp.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
  await gp.keyboard.press('Enter');
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const P = [await boot(browser, 'host')];
  const hp = P[0].page;
  await press(hp, 'KeyD');
  await stepOn(hp, 'go:online');
  let r = await hp.evaluate(() => { const m = __wands.G.menu; return { page: m.page, acts: m.plates.map(p => p.act) }; });
  ok(r.page === 'mode' && ['mode:2', 'mode:3', 'mode:4'].every(a => r.acts.indexOf(a) >= 0), 'Online leads to the 2 / 3 / 4 PLAYER plates', JSON.stringify(r.acts));
  await stepOn(hp, 'mode:3');
  r = await hp.evaluate(() => ({ page: __wands.G.menu.page, mode: __wands.G.menu.mode }));
  ok(r.page === 'online' && r.mode === 3, 'then HOST / JOIN', JSON.stringify(r));
  await stepOn(hp, 'go:create'); await stepOn(hp, 'slot:1', 500);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.online && __wands.G.menu.online.code, null, { timeout: 30000 });
  const code = await hp.evaluate(() => __wands.G.menu.online.code);
  ok(/^[A-Z2-9]{6}$/.test(code) && await hp.evaluate(() => __wands.Net.mode === 3), 'a 3P room opens with a room code', code);
  // ---- guest 1 joins as the BUILDER, guest 2 as the ROOTKEEPER; guest 3 asks for the BUILDER too and is turned away
  const roles = ['B', 'K'];
  for (let g = 1; g <= 2; g++) {
    const G_ = await boot(browser, 'guest' + g); P.push(G_);
    await join(G_.page, code, roles[g - 1]);
    await hp.waitForFunction(n => __wands.Net.liveSlots().length >= n, g, { timeout: 60000 });
    ok(true, 'guest ' + g + ' joined as ' + roles[g - 1]);
  }
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs3' && __wands.G.menu.l3.chars.length === 3, null, { timeout: 20000 });
  r = await hp.evaluate(() => { const L = __wands.G.menu.l3; return L.seats.map(s => s.who); });
  ok(r[0] === 'g1' && r[2] === 'g2' && !r[1], 'each guest holds the role he joined with; the host has none yet', JSON.stringify(r));
  const x3 = await boot(browser, 'guest3');
  await join(x3.page, code, 'B');
  await x3.page.waitForFunction(() => { const t = __wands.G && __wands.G.menu && __wands.G.menu.typing; return t && !t.busy && /already taken/.test(t.msg || ''); }, null, { timeout: 60000 }).catch(() => {});
  const msg3 = await x3.page.evaluate(() => { const t = __wands.G.menu.typing; return t ? t.msg : ''; });
  ok(/already taken/.test(msg3), 'a third player asking for a role already in the room is REJECTED and told so', msg3);
  await x3.ctx.close();
  for (const G_ of P.slice(1)) await G_.page.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs3', null, { timeout: 30000 });
  ok(true, 'the host and both guests are in the 3P lobby');
  // ---- the host takes the Wizard at its statue (the use key next to it); a guest trying the Rootkeeper's statue (taken) is rejected
  await hp.evaluate(() => { const L = __wands.G.menu.l3, c = L.chars.find(q => q.who === 'host'), s = Lobby3.STATUE[1]; c.x = s.x + 1.2; c.y = s.y + 0.4; c.vx = c.vy = 0; });
  await sleep(300); await press(hp, 'KeyE'); await sleep(500);
  await hp.evaluate(() => { const L = __wands.G.menu.l3, c = L.chars.find(q => q.who === 'g1'), s = Lobby3.STATUE[2]; c.x = s.x + 1.2; c.y = s.y + 0.4; c.vx = c.vy = 0; });
  await sleep(300); await press(P[1].page, 'KeyE'); await sleep(700);
  r = await hp.evaluate(() => { const L = __wands.G.menu.l3; return { seats: L.seats.map(s => s.who), rej: (__wands.G.fb || {})['lobby-taken'] || 0 }; });
  ok(r.seats.join(',') === 'g1,host,g2', 'the host is the Wizard; the Builder guest could not take the Rootkeeper\'s statue', JSON.stringify(r));
  ok(r.rej > 0, 'the rejection shows (lobby-taken)');
  if (SHOTS) await hp.screenshot({ path: path.join(SHOTS, 'lobby3.png') });
  // ---- everybody on his READY plate: the countdown, the game
  await hp.evaluate(() => { const m = __wands.G.menu, L = m.l3; for (let s = 0; s < 3; s++) { const c = L.chars.find(q => q.who === L.seats[s].who), p = m.plates.find(q => q.kind === 'ready' && q.seat === s); c.x = p.x; c.y = p.y; } });
  await hp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m3, null, { timeout: 60000 });
  for (const G_ of P.slice(1)) await G_.page.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m3, null, { timeout: 40000 });
  ok(true, 'all three ready: the countdown ran and all three machines are in the 3P game');
  for (const G_ of P) await G_.page.evaluate(() => { __wands.UI.help(false); __wands.G.helpT = 0; });
  await sleep(1500);
  const seen = await Promise.all(P.map(G_ => G_.page.evaluate(() => ({ vi: __wands.G.vi, role: __wands.Net.role, n: __wands.G.u.bld.length, t: __wands.G.stats.time, hud: !document.getElementById('rootHud').classList.contains('hidden'), root: document.getElementById('game').classList.contains('onRoot') }))));
  ok(seen[0].vi === 1 && seen[1].vi === 0 && seen[2].vi === 2, 'host = Wizard, guest 1 = Builder, guest 2 = Rootkeeper', seen.map(s => s.vi).join(','));
  ok(seen.every(s => s.n === seen[0].n) && seen.every(s => Math.abs(s.t - seen[0].t) < 1.5), 'every machine holds the underworld and sees the game running', JSON.stringify(seen.map(s => [s.n, s.t.toFixed(1)])));
  ok(seen[2].hud && seen[2].root && !seen[0].hud && !seen[1].hud, 'only the Rootkeeper\'s screen has his card');
  if (SHOTS) for (let i = 0; i < 3; i++) await P[i].page.screenshot({ path: path.join(SHOTS, 'game3_' + i + '.png') });
  // ---- every seat plays its own character
  const pos = () => hp.evaluate(() => { const G = __wands.G; return { w: [G.w.x, G.w.y], b: [G.bd.x, G.bd.y], k: [G.u.rk.x, G.u.rk.y] }; });
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const hold = async (page, k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
  await hp.evaluate(() => { __wands.G.w.enemies.length = 0; __wands.CFG.world.cap = 0; });
  let p0 = await pos(); await hold(hp, 'KeyD', 700); let p1 = await pos();
  ok(d2(p0.w, p1.w) > 1 && d2(p0.k, p1.k) < 0.5, 'the host key moves the Wizard', d2(p0.w, p1.w).toFixed(1));
  p0 = p1; await hold(P[1].page, 'KeyS', 800); p1 = await pos();
  ok(d2(p0.b, p1.b) > 1 && d2(p0.k, p1.k) < 0.5, 'guest 1 moves the Builder', d2(p0.b, p1.b).toFixed(1));
  await sleep(800); p0 = await pos(); await hold(P[2].page, 'KeyA', 800); p1 = await pos();
  ok(d2(p0.k, p1.k) > 1 && d2(p0.b, p1.b) < 0.5, 'guest 2 moves the Rootkeeper', d2(p0.k, p1.k).toFixed(1));
  // the Rootkeeper's keys reach the host: E mashes the node beside him; G toggles his ghost view; 1 picks the hose tool
  await hp.evaluate(() => { const u = __wands.G.u, n = u.bld.find(b => b.type === 'node' && !b.up); n.ch = 0; u.rk.x = n.x + 0.6; u.rk.y = n.y; u.rk.vx = u.rk.vy = 0; window.__node = n.id; });
  await sleep(500);
  for (let i = 0; i < 3; i++) { await press(P[2].page, 'KeyE'); await sleep(120); }
  await press(P[2].page, 'KeyG'); await sleep(200); await press(P[2].page, 'Digit1'); await sleep(800);
  r = await hp.evaluate(() => { const u = __wands.G.u; return { ch: u.bld.find(b => b.id === window.__node).ch, ghost: u.ghost.K, tool: u.rk.tool }; });
  ok(r.ch > 0.05 && r.ghost && r.tool === 'hose', 'the Rootkeeper guest mashes, toggles his ghost view and picks a tool (through his pad)', JSON.stringify(r));
  await press(P[2].page, 'KeyQ'); await sleep(400);
  // the Wizard (host) ghost key
  await press(hp, 'KeyG'); await sleep(300);
  ok(await hp.evaluate(() => __wands.G.u.ghost.W), 'the Wizard\'s ghost key turns his ghost view on');
  // ---- a kill above drops remains below, and the Rootkeeper guest sees them
  const n0 = await P[2].page.evaluate(() => __wands.G.u.items.length);
  await hp.evaluate(() => { const W = __wands, G = W.G; W.WZ.kill(W.WZ.makeEnemy('imp', G.u.rk.x + 2, G.u.rk.y)); });
  await sleep(1500);
  ok(await P[2].page.evaluate(n => __wands.G.u.items.length > n, n0), 'a kill above drops remains the Rootkeeper\'s screen shows');
  // ---- the shared pause
  await P[2].page.evaluate(() => __wands.Main.pause(true)); await sleep(700);
  const t0 = await hp.evaluate(() => __wands.G.stats.time); await sleep(1200);
  const t1 = await hp.evaluate(() => ({ t: __wands.G.stats.time, p: __wands.G.paused }));
  ok(t1.p && Math.abs(t1.t - t0) < 0.2, 'the Rootkeeper pausing stops the game for everybody');
  const ban = await P[1].page.evaluate(() => { const e = document.getElementById('pausedBy'); return e && !e.classList.contains('hidden') ? e.textContent : ''; });
  ok(/ROOTKEEPER PAUSED/.test(ban), 'and the others are told who paused', ban);
  await P[2].page.evaluate(() => __wands.Main.pause(false)); await sleep(900);
  // ---- a guest drops; the same code inside the window hands control back
  await P[1].page.evaluate(() => __wands.Net.conn.close()); await sleep(1500);
  r = await hp.evaluate(() => ({ conn: __wands.G.seats[0].conn, live: __wands.Net.liveSlots().length }));
  ok(r.conn === false && r.live === 1, 'a guest who drops leaves his character standing and the game goes on', JSON.stringify(r));
  await P[1].page.evaluate(() => { __wands.Net.rejoin(); }); await sleep(3500);
  r = await hp.evaluate(() => ({ conn: __wands.G.seats[0].conn, live: __wands.Net.liveSlots().length }));
  ok(r.conn !== false && r.live === 2, 'rejoining with the same code hands control back', JSON.stringify(r));
  // ---- the Wizard down: each screen its own game over, all three ready restarts
  await hp.evaluate(() => { const W = __wands; W.G.w.hp = 1; W.WZ.damage(500, false, W.WZ.HAZ.unknown); });
  await hp.waitForFunction(() => __wands.G.w.dead && __wands.G.w.deadT > 1.2, null, { timeout: 15000 });
  await sleep(1500);
  const rs = await Promise.all(P.map(G_ => G_.page.evaluate(() => { const e = document.getElementById('results'); return e && !e.classList.contains('hidden') ? (e.querySelector('h2') || {}).textContent : ''; })));
  ok(/WIZARD/.test(rs[0]) && /BUILDER/.test(rs[1]) && /ROOTKEEPER/.test(rs[2]), 'each screen shows its own role\'s game over', JSON.stringify(rs));
  for (const i of [1, 2]) await P[i].page.evaluate(() => document.getElementById('rRe3').click());
  await sleep(1200);
  ok(await hp.evaluate(() => __wands.G.w.dead), 'it waits for every connected player');
  await hp.evaluate(() => document.getElementById('rRe3').click()); await sleep(1500);
  ok(await hp.evaluate(() => !__wands.G.w.dead), 'all three ready: the run starts again');
  if (SHOTS) for (let i = 0; i < 3; i++) await P[i].page.screenshot({ path: path.join(SHOTS, 'end3_' + i + '.png') });
  // ---- role-scoped pictures (CFG.mode3.net.otherEvery): most pictures leave the worlds a guest does not play in out; every guest still holds all three worlds
  await sleep(1500);
  const sc0 = await Promise.all(P.slice(1).map(G_ => G_.page.evaluate(() => ({ p: __wands.Net.stats.pics || 0, s: __wands.Net.stats.scoped || 0 }))));
  await sleep(3000);
  const sc1 = await Promise.all(P.slice(1).map(G_ => G_.page.evaluate(() => { const G = __wands.G; return { p: __wands.Net.stats.pics || 0, s: __wands.Net.stats.scoped || 0, all: Array.isArray(G.w.enemies) && Array.isArray(G.w.fx_) && Array.isArray(G.fac.bld) && Array.isArray(G.u.items) && Array.isArray(G.u.bld) && Array.isArray(G.u.pulses) }; })));
  const fr = sc1.map((a, i) => (a.s - sc0[i].s) / Math.max(1, a.p - sc0[i].p));
  ok(fr.every(f => f > 0.5 && f < 0.8), 'about two pictures in three leave the other worlds out (role-scoped)', fr.map(f => f.toFixed(2)).join(','));
  ok(sc1.every(a => a.all), 'and every guest still holds all three worlds (the last copy is put back)', JSON.stringify(sc1));
  const errs = P.flatMap(p => p.errs).concat(x3.errs);
  ok(errs.length === 0, 'no page errors on any machine', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
