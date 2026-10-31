'use strict';
// The 4-player performance run (headless, needs internet for the PeerJS signaling): a host and THREE guests join, the lobby is walked through, then the game is measured for a
// while, calm or under the stress scene (60 hostile foes round the two Wizards, 5 allies, 20 spells kept alive). It prints one line per machine: fps, frame gaps, the time in the
// main functions, and (host) the snapshot stream: size, KB per second, pictures per second. Same numbers as tools/nettest/stress.js so the two builds can be compared.
//   node tools/mode4check/stress.js                    the stress scene
//   CALM=1 node tools/mode4check/stress.js             the quiet game instead
//   THROTTLE=3 ...                                     slow every page's CPU 3 times (a weaker laptop)
//   SECS=10 ...                                        how long to measure
// Needs playwright-core + Edge (PLAYWRIGHT_CORE=<path>).
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = process.env.ROOT || path.resolve(__dirname, '../..');
const URL = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/');
const SECS = +process.env.SECS || 10, sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = (p, t0, dt) => p.waitForFunction(([t0, dt]) => { const m = __wands.G.menu; return !m || m.t > t0 + dt; }, [t0, dt], { timeout: 20000 });
const press = async (p, k) => { await p.keyboard.down(k); await sleep(80); await p.keyboard.up(k); };
const stepOn = async (p, act, wait) => {
  const t0 = await p.evaluate(() => { const G = __wands.G, c = G.menu.tc; G.bd.x = c.x + 0.5 - 80; G.bd.y = c.y + 1.0 - 80; G.bd.vx = G.bd.vy = 0; return G.menu.t; });
  await frames(p, t0, 0.3);
  const r = await p.evaluate(act => { const G = __wands.G, q = G.menu.plates.find(x => x.act === act || x.key === act); if (!q) return 'noplate ' + act; G.bd.x = q.x - 80; G.bd.y = q.y - 80; return 'ok'; }, act);
  if (r !== 'ok') throw new Error(r);
  await sleep(wait || 1300);
};
async function boot(browser, name, errs) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  await page.mouse.click(300, 300);
  await sleep(300); await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu && __wands.G.menu.plates.length > 5, null, { timeout: 30000 });
  await sleep(1200);
  return page;
}
// the stress scene, run in the HOST page: foes round each Wizard, 5 allies, spells cast again every 1.5 s, nobody can die
const SETUP = () => {
  const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG;
  const spells = ['nova', 'blizzard', 'thunder', 'meteor', 'tempest', 'mud', 'magma', 'geyser', 'flamethrower', 'steam'];
  const wild = ['slime', 'shroom', 'sprite', 'imp', 'lurker', 'wisp', 'golem'], crafted = Object.keys(CFG.creatures);
  CFG.world.cap = 0; CFG.crafted.cap = 0;
  const top = () => {
    const w = G.w;
    for (const q of WZ.allW()) { q.dead = false; q.hp = 1e6; q.armor = 100; }
    G.w.maxHp = 1e6;
    const alive = w.enemies.filter(e => !e.dead);
    for (const e of alive) e.hp = e.maxHp = 1e6;
    let n = 0, guard = 0;
    while (alive.length + n < 60 && guard++ < 120) {
      const q = WZ.pw(n % 2), a = Math.random() * 6.28, d = 4 + Math.random() * 8, x = q.x + Math.cos(a) * d, y = q.y + Math.sin(a) * d;
      if (WZ.blocked(x, y, 0.4)) continue;
      const e = n % 2 ? WZ.makeEnemy(wild[n % wild.length], x, y, false) : WZ.makeCreature(crafted[(n >> 1) % crafted.length], x, y, { plain: true });
      e.hp = e.maxHp = 1e6; n++;
    }
    for (let i = w.allies.length; i < 5; i++) { const a = WZ.spawnAlly(crafted[(i * 2) % crafted.length]); if (a) a.hp = a.maxHp = 1e6; }
    for (const a of w.allies) a.hp = Math.max(a.hp, 1e6);
  };
  const cast = () => { for (const i of [0, 1]) for (const s of spells) { try { WZ.as(i, () => WZ.cast(s)); } catch (e) { console.error('cast ' + s + ' ' + e.message); } } };
  top(); cast();
  setInterval(top, 200); setInterval(cast, 1500);
};
const INSTRUMENT = () => {
  const W = window.__wands, P = {};
  const wrap = (o, k, tag) => { if (!o || !o[k]) return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; (P[tag] || (P[tag] = [])).push(d); } }; };
  wrap(W.R, 'drawWorld', 'drawWorld'); wrap(W.R, 'drawFactory', 'drawFactory'); wrap(W.R, 'drawPip', 'drawPip'); wrap(W.UI, 'updateHud', 'updateHud'); wrap(W.Main, 'step', 'Main.step'); wrap(W.Main, 'guestFrame', 'guestFrame'); wrap(W.Net, 'wirePacket', 'wirePacket');
  wrap(W.WZ, 'update', 'WZ.update'); wrap(W.FA, 'update', 'FA.update'); wrap(W.M4, 'guestView', 'guestView');
  wrap(JSON, 'parse', 'JSON.parse'); wrap(JSON, 'stringify', 'JSON.stringify');
  const gaps = []; let last = performance.now(), on = true;
  (function loop(now) { if (!on) return; gaps.push(now - last); last = now; requestAnimationFrame(loop); })(last);
  const st0 = Object.assign({}, W.Net.stats), t0 = performance.now();
  window.__rep = () => {
    on = false;
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : 0; };
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, secs = (performance.now() - t0) / 1000, st = W.Net.stats;
    const out = { secs: +secs.toFixed(1), fps: +(gaps.length / secs).toFixed(1), gap_p50: q(gaps, 0.5), gap_p95: q(gaps, 0.95), gap_max: +Math.max(...gaps).toFixed(1), ms: {} };
    for (const k in P) out.ms[k] = avg(P[k]).toFixed(2) + ' x' + (P[k].length / secs).toFixed(0) + '/s';
    out.net = { zipKB: +st.zipKB.toFixed(1), rawKB: +st.rawKB.toFixed(1), maxZipKB: +st.maxZip.toFixed(1), snaps: st.snapsOut - st0.snapsOut, bytesKB: Math.round(((st.bytesOut || 0) - (st0.bytesOut || 0)) / 1024), skipped: st.skipped - st0.skipped, kbps: st.kbps };
    return out;
  };
};
(async () => {
  const errs = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const P = [await boot(browser, 'host', errs)];
  const hp = P[0];
  await press(hp, 'KeyD');
  await stepOn(hp, 'go:online'); await stepOn(hp, 'mode:4'); await stepOn(hp, 'go:create'); await stepOn(hp, 'slot:1', 500);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.online && __wands.G.menu.online.code, null, { timeout: 30000 });
  const code = await hp.evaluate(() => __wands.G.menu.online.code);
  for (let g = 1; g <= 3; g++) {
    const gp = await boot(browser, 'guest' + g, errs); P.push(gp);
    await press(gp, 'KeyD');
    await stepOn(gp, 'go:online'); await stepOn(gp, 'mode:4'); await stepOn(gp, 'go:join', 1500);
    await gp.evaluate(() => { const G = __wands.G, k = G.menu.kb; G.bd.x = k.x - 80 + 1.2; G.bd.y = k.y - 80 + 0.2; });
    await sleep(400); await press(gp, 'KeyE'); await sleep(300);
    for (const ch of code) await gp.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
    await gp.keyboard.press('Enter');
    await hp.waitForFunction(n => __wands.Net.liveSlots().length >= n, g, { timeout: 60000 });
  }
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs4' && __wands.G.menu.l4.chars.length === 4, null, { timeout: 20000 });
  const T = +process.env.THROTTLE || 1;
  const thr = async rate => { if (rate > 1) for (const p of P) { const c = await p.context().newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate }); } };
  // ---- the lobby, measured before the game starts
  await sleep(1500);
  await thr(T);
  await Promise.all(P.map(p => p.evaluate(INSTRUMENT)));
  await sleep(4000);
  const lobby = await Promise.all(P.map(p => p.evaluate(() => window.__rep())));
  console.log('LOBBY host   ' + JSON.stringify(lobby[0]));
  console.log('LOBBY guest1 ' + JSON.stringify(lobby[1]));
  await thr(1);
  // ---- seats, elements, READY: the game
  const roles = ['W', 'W', 'W', 'B'];   // host, g1, g2 want Wizard (the third is bumped), g3 Builder
  const who = ['host', 'g1', 'g2', 'g3'];
  for (let i = 0; i < 4; i++) {
    await hp.evaluate(w => { const L = __wands.G.menu.l4, c = L.chars.find(q => q.who === w); c.x = 71; c.y = 79; c.vx = c.vy = 0; }, who[i]); await sleep(400);
    await hp.evaluate(([w, key]) => { const m = __wands.G.menu, L = m.l4, c = L.chars.find(q => q.who === w), q = m.plates.find(p => p.key === key); c.x = q.x; c.y = q.y; }, [who[i], 'role' + roles[i]]); await sleep(500);
  }
  await hp.evaluate(() => { const L = __wands.G.menu.l4; L.seats[2].att = ['fire', 'water']; L.seats[3].att = ['air', 'earth']; });
  await hp.evaluate(() => { const m = __wands.G.menu, L = m.l4; for (let s = 0; s < 4; s++) { const c = L.chars.find(q => q.who === L.seats[s].who), p = m.plates.find(q => q.kind === 'ready' && q.seat === s); c.x = p.x; c.y = p.y; } });
  await hp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m4, null, { timeout: 60000 });
  for (const p of P.slice(1)) await p.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m4, null, { timeout: 40000 });
  for (const p of P) await p.evaluate(() => { __wands.UI.help(false); __wands.G.helpT = 0; });
  await sleep(1500);
  if (!process.env.CALM) { await hp.evaluate(SETUP); await sleep(3000); }
  await thr(T);
  await P[1].keyboard.down('KeyD'); await P[2].keyboard.down('KeyS');   // two guests walk, like players would
  await Promise.all(P.map(p => p.evaluate(INSTRUMENT)));
  await sleep(SECS * 1000);
  await P[1].keyboard.up('KeyD'); await P[2].keyboard.up('KeyS');
  const res = await Promise.all(P.map(p => p.evaluate(() => window.__rep())));
  const scene = await hp.evaluate(() => { const w = __wands.G.w; return { foes: w.enemies.filter(e => !e.dead).length, allies: w.allies.length, zones: w.zones.length, proj: w.proj.length, fx: w.fx_.length }; });
  console.log((process.env.CALM ? 'CALM' : 'STRESS') + ' scene ' + JSON.stringify(scene) + (T > 1 ? '  throttle x' + T : ''));
  console.log('host   ' + JSON.stringify(res[0]));
  for (let i = 1; i < 4; i++) console.log('guest' + i + ' ' + JSON.stringify(res[i]));
  console.log(errs.length ? 'FAIL page errors: ' + errs.slice(0, 4).join(' | ') : 'PASS no page errors');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
