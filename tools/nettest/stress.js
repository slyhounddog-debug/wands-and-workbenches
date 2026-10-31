'use strict';
// The online performance run (headless, needs internet for the PeerJS signaling): a host page and a guest page join, then the host's wilds are put under the stress scene
// (30 hostile foes, 5 allies, 10 spells kept alive) and both sides are measured for a while: frame times, the snapshot stream (bytes, pictures a second) and the guest's
// per-frame costs. It prints one line per side; no PASS / FAIL except the one on page errors.
//   node tools/nettest/stress.js                      the stress scene
//   CALM=1 node tools/nettest/stress.js               the quiet game instead (what a normal minute costs)
//   THROTTLE=3 ...                                    slow both pages' CPU 3 times (a weaker laptop)
//   LOSS=0.05 ...                                     lose that share of packets on the snapshot channel
//   ROOT=<folder> ...                                 measure another copy of the game (a git worktree of an older commit) to compare builds
//   SECS=10 ...                                       how long to measure
// Needs playwright-core + Edge (PLAYWRIGHT_CORE=<path>).
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = process.env.ROOT || path.resolve(__dirname, '../..');
const URL = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/');
const SECS = +process.env.SECS || 10, sleep = ms => new Promise(r => setTimeout(r, ms));
const frames = (p, t0, dt) => p.waitForFunction(([t0, dt]) => { const m = __wands.G.menu; return !m || m.t > t0 + dt; }, [t0, dt], { timeout: 20000 });
const stepOn = async (p, role, act, wait) => {
  const t0 = await p.evaluate(role => { const G = __wands.G, c = G.menu.tc, x = c.x + (role === 'B' ? 0.5 : -0.5), y = c.y + 1.0; if (role === 'B') { G.bd.x = x - 80; G.bd.y = y - 80; G.bd.vx = G.bd.vy = 0; } else { G.w.x = x; G.w.y = y; } return G.menu.t; }, role);
  await frames(p, t0, 0.3);
  const r = await p.evaluate(([role, act]) => { const G = __wands.G, q = G.menu.plates.find(x => x.act === act || x.key === act); if (!q) return 'noplate ' + act; if (role === 'B') { G.bd.x = q.x - 80; G.bd.y = q.y - 80; } else { G.w.x = q.x; G.w.y = q.y; } return 'ok'; }, [role, act]);
  if (r !== 'ok') throw new Error(r);
  await sleep(wait || 1300);
};
const press = async (p, k) => { await p.keyboard.down(k); await sleep(80); await p.keyboard.up(k); };
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

// the stress scene, run in the HOST page: 30 hostile foes (half wild, half creatures), 5 allies, ten spells cast again every 1.5 s, nobody can die
const SETUP = () => {
  const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG;
  const spells = ['nova', 'blizzard', 'thunder', 'meteor', 'tempest', 'mud', 'magma', 'geyser', 'flamethrower', 'steam'];
  const wild = ['slime', 'shroom', 'sprite', 'imp', 'lurker', 'wisp', 'golem'], crafted = Object.keys(CFG.creatures);
  CFG.world.cap = 0; CFG.crafted.cap = 0;   // (nothing else spawns: the scene is exactly the foes below)
  const top = () => {
    const w = G.w;
    w.dead = false; w.hp = w.maxHp = 1e6; w.armor = 100;
    const alive = w.enemies.filter(e => !e.dead);
    for (const e of alive) e.hp = e.maxHp = 1e6;
    let n = 0, guard = 0;
    while (alive.length + n < 30 && guard++ < 60) {
      const a = Math.random() * 6.28, d = 4 + Math.random() * 8, x = w.x + Math.cos(a) * d, y = w.y + Math.sin(a) * d;
      if (WZ.blocked(x, y, 0.4)) continue;
      const e = n % 2 ? WZ.makeEnemy(wild[n % wild.length], x, y, false) : WZ.makeCreature(crafted[(n >> 1) % crafted.length], x, y, { plain: true });
      e.hp = e.maxHp = 1e6; n++;
    }
    for (let i = w.allies.length; i < 5; i++) { const a = WZ.spawnAlly(crafted[(i * 2) % crafted.length]); if (a) a.hp = a.maxHp = 1e6; }
    for (const a of w.allies) a.hp = Math.max(a.hp, 1e6);
  };
  const cast = () => { for (const s of spells) { try { WZ.cast(s); } catch (e) { console.error('cast ' + s + ' ' + e.message); } } };
  top(); cast();
  setInterval(top, 200); setInterval(cast, 1500);
};
// per-page measuring: frame gaps and the time spent in the named functions, reported by window.__rep()
const INSTRUMENT = () => {
  const W = window.__wands, P = {}, orig = [];
  const wrap = (o, k, tag) => { if (!o || !o[k]) return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; (P[tag] || (P[tag] = [])).push(d); } }; };
  wrap(W.R, 'drawWorld', 'drawWorld'); wrap(W.R, 'drawFactory', 'drawFactory'); wrap(W.R, 'drawPip', 'drawPip'); wrap(W.UI, 'updateHud', 'updateHud'); wrap(W.Main, 'step', 'Main.step');
  wrap(W.Main, 'tween', 'tween'); wrap(W.Main, 'interpFrame', 'interpFrame'); wrap(W.Main, 'predSnap', 'predSnap'); wrap(W.Main, 'guestFrame', 'guestFrame'); wrap(W.Net, 'wirePacket', 'wirePacket'); wrap(W.Snap, 'wire', 'Snap.wire');
  wrap(JSON, 'parse', 'JSON.parse'); wrap(JSON, 'stringify', 'JSON.stringify');
  const gaps = []; let last = performance.now(), on = true;
  (function loop(now) { if (!on) return; gaps.push(now - last); last = now; requestAnimationFrame(loop); })(last);
  const st0 = Object.assign({}, W.Net.stats), t0 = performance.now();
  window.__rep = () => {
    on = false;
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : 0; };
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, secs = (performance.now() - t0) / 1000, st = W.Net.stats;
    const out = { secs: +secs.toFixed(1), fps: +(gaps.length / secs).toFixed(1), gap_p50: q(gaps, 0.5), gap_p95: q(gaps, 0.95), gap_p99: q(gaps, 0.99), gap_max: +Math.max(...gaps).toFixed(1), over16: Math.round(100 * gaps.filter(g => g > 16.8).length / gaps.length) + '%', ms: {} };
    for (const k in P) out.ms[k] = avg(P[k]).toFixed(2) + ' x' + (P[k].length / secs).toFixed(0) + '/s';
    out.net = { zipKB: +st.zipKB.toFixed(1), rawKB: +st.rawKB.toFixed(1), maxZipKB: +st.maxZip.toFixed(1), snaps: st.snapsOut - st0.snapsOut, bytesKB: Math.round(((st.bytesOut || 0) - (st0.bytesOut || 0)) / 1024), skipped: st.skipped - st0.skipped, kbps: st.kbps, picsPerSec: st.fps, loss: st.loss, rtt: st.rtt, predFix: +(W.Main.pr && W.Main.pr.fix || 0).toFixed(3) };
    return out;
  };
};

(async () => {
  const errs = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const hp = await boot(browser, 'host', errs), gp = await boot(browser, 'guest', errs);
  // host: Online > Create; guest: the keyboard prop
  await press(hp, 'KeyD');
  await stepOn(hp, 'B', 'go:online'); await stepOn(hp, 'B', 'mode:2'); await stepOn(hp, 'B', 'go:create'); await stepOn(hp, 'B', 'slot:1', 500);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.online && __wands.G.menu.online.code, null, { timeout: 30000 });
  const code = await hp.evaluate(() => __wands.G.menu.online.code);
  await press(gp, 'KeyD');
  await stepOn(gp, 'B', 'go:online'); await stepOn(gp, 'B', 'mode:2'); await stepOn(gp, 'B', 'go:join', 1500);
  await gp.evaluate(() => { const G = __wands.G, k = G.menu.kb; G.bd.x = k.x - 80 + 1.2; G.bd.y = k.y - 80 + 0.2; });
  await sleep(400); await press(gp, 'KeyE'); await sleep(300);
  for (const ch of code) await gp.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
  await gp.keyboard.press('Enter');
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs' && __wands.Net.state === 'live', null, { timeout: 60000 });
  await gp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs' && __wands.Net.state === 'live', null, { timeout: 30000 });
  const thr = async rate => { if (rate > 1 || process.env.THROTTLE) for (const p of [hp, gp]) { const c = await p.context().newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate }); } };
  const T = +process.env.THROTTLE || 1;
  // ---- the character select, online: measure it before the game starts
  await sleep(1500);
  await thr(T);
  await Promise.all([hp, gp].map(p => p.evaluate(INSTRUMENT)));
  await sleep(4000);
  const lobby = await Promise.all([hp, gp].map(p => p.evaluate(() => window.__rep())));
  console.log('LOBBY host  ' + JSON.stringify(lobby[0]));
  console.log('LOBBY guest ' + JSON.stringify(lobby[1]));
  await thr(1);
  // ---- both ready: the game
  await stepOn(hp, 'B', 'readyB', 100);
  await hp.evaluate(() => { const q = __wands.G.menu.plates.find(x => x.key === 'readyW'); __wands.G.w.x = q.x; __wands.G.w.y = q.y; });
  await hp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && !__wands.G.intro, null, { timeout: 60000 });
  await gp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && !__wands.G.intro && __wands.G.w, null, { timeout: 40000 });
  await hp.evaluate(() => { __wands.UI.help(false); __wands.G.helpT = 0; });
  await gp.evaluate(() => __wands.UI.help(false));
  await sleep(1500);
  if (process.env.LOSS) await hp.evaluate(l => { __wands.Net.simLoss = +l; }, process.env.LOSS);
  if (!process.env.CALM) { await hp.evaluate(SETUP); await sleep(3000); }
  await thr(T);
  await gp.keyboard.down('KeyD');   // the guest walks, like a player would
  await Promise.all([hp, gp].map(p => p.evaluate(INSTRUMENT)));
  await sleep(SECS * 1000);
  await gp.keyboard.up('KeyD');
  const res = await Promise.all([hp, gp].map(p => p.evaluate(() => window.__rep())));
  const scene = await hp.evaluate(() => { const w = __wands.G.w; return { foes: w.enemies.filter(e => !e.dead).length, allies: w.allies.length, zones: w.zones.length, proj: w.proj.length, fx: w.fx_.length, dead: w.dead }; });
  console.log((process.env.CALM ? 'CALM' : 'STRESS') + ' scene ' + JSON.stringify(scene) + (T > 1 ? '  throttle x' + T : '') + (process.env.LOSS ? '  loss ' + process.env.LOSS : ''));
  console.log('host  ' + JSON.stringify(res[0]));
  console.log('guest ' + JSON.stringify(res[1]));
  if (process.env.LAG) {   // LAG=75: the guest's key press -> his own Wizard moving on his screen, with that many ms each way on both sides
    for (const p of [hp, gp]) await p.evaluate(d => { __wands.Net.simDelay = d; }, +process.env.LAG);
    await sleep(1500);
    console.log('pad channel', await gp.evaluate(() => { const c = __wands.Net.conn; return c && c._padCh ? c._padCh.readyState : 'none'; }), await hp.evaluate(() => { const c = __wands.Net.conn; return c && c._padCh ? c._padCh.readyState : 'none'; }));
    const out = [];
    for (let i = 0; i < 6; i++) {
      await sleep(1100);
      const pr = gp.evaluate(() => new Promise(res => {
        const w = __wands.G.w, x0 = w.x, y0 = w.y; let t0 = 0;
        addEventListener('keydown', () => { t0 = performance.now(); }, { once: true });
        const born = performance.now(), tick = () => { const w2 = __wands.G.w; if (t0 && Math.hypot(w2.x - x0, w2.y - y0) > 0.04) res(performance.now() - t0); else if (performance.now() - born > 5000) res(-1); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      await sleep(50); await gp.keyboard.down(i % 2 ? 'KeyA' : 'KeyD');
      out.push(Math.round(await pr)); await sleep(250); await gp.keyboard.up(i % 2 ? 'KeyA' : 'KeyD');
    }
    console.log('LAG ' + process.env.LAG + ' ms each way: key -> own Wizard moves (ms) ' + out.join(' '));
    console.log('plog', JSON.stringify((await hp.evaluate(() => __wands.Net.plog)).filter(l => /channel/.test(l))), JSON.stringify((await gp.evaluate(() => __wands.Net.plog)).filter(l => /channel/.test(l))));
    console.log('host Wizard moved? gpad', JSON.stringify(await hp.evaluate(() => __wands.Net.gpad)));
  }
  if (process.env.PROFILE) {   // PROFILE=guest|host: a CPU profile of that page for 4 s (self time by function, then the direct children of drawWorld)
    const pg = process.env.PROFILE === 'host' ? hp : gp;
    await gp.keyboard.down('KeyD');
    const cdp = await pg.context().newCDPSession(pg);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start');
    await sleep(4000);
    const { profile } = await cdp.send('Profiler.stop');
    await gp.keyboard.up('KeyD');
    const nodes = new Map(profile.nodes.map(n => [n.id, n])), par = new Map();
    for (const n of profile.nodes) for (const c of (n.children || [])) par.set(c, n.id);
    const nm = n => (n.callFrame.functionName || '(anon)') + ' ' + (n.callFrame.url.split('/').pop() || '') + ':' + (n.callFrame.lineNumber + 1);
    const self = {}, kids = {}; let tot = 0;
    profile.samples.forEach((id, i) => {
      const d = (profile.timeDeltas[i] || 0) / 1000; tot += d; self[nm(nodes.get(id))] = (self[nm(nodes.get(id))] || 0) + d;
      const chain = []; for (let x = id; x !== undefined; x = par.get(x)) chain.push(x);
      const pi = chain.findIndex(x => /^(R.drawWorld|R.drawFactory)$/.test(nodes.get(x).callFrame.functionName));
      if (pi > 0) { const k = nm(nodes.get(chain[pi - 1])); kids[k] = (kids[k] || 0) + d; }
    });
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => '  ' + v.toFixed(0).padStart(6) + 'ms  ' + k).join('\n');
    console.log('PROFILE ' + process.env.PROFILE + ' (self ms of ' + tot.toFixed(0) + '):\n' + top(self, 22) + '\n children of drawWorld / drawFactory:\n' + top(kids, 18));
  }
  console.log(errs.length ? 'FAIL page errors: ' + errs.slice(0, 4).join(' | ') : 'PASS no page errors');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
