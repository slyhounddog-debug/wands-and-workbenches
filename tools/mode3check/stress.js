'use strict';
// The 3-player performance run (headless, needs internet for the PeerJS signaling; the tool for step 8 of the 3P brief): a host (the Wizard) and TWO guests (the Builder, the
// Rootkeeper) join with their roles, then the game is measured for a while, calm or under the stress scene (60 hostile foes round the Wizard, 5 allies, 10 spells kept alive; below:
// 40 remains lying about, 6 burners pulsing to every node, trap and mirror). It prints one line per machine: fps, frame gaps, the time in the main functions, and (host) the snapshot
// stream: size, KB per second, pictures per second. Same numbers as tools/mode4check/stress.js so the modes can be compared.
//   node tools/mode3check/stress.js                    the stress scene
//   CALM=1 node tools/mode3check/stress.js             the quiet game instead
//   THROTTLE=3 ...                                     slow every page's CPU 3 times (a weaker laptop)
//   AB=1 ...                                           alternating windows with role-scoped snapshots off (otherEvery 1) and on (3) in the same game
//   ROOT=<worktree of an older commit> ...             measure that build instead (before / after)
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
    G.w.dead = false; G.w.hp = 1e6; G.w.armor = 100;
    G.w.maxHp = 1e6;
    const alive = w.enemies.filter(e => !e.dead);
    for (const e of alive) e.hp = e.maxHp = 1e6;
    let n = 0, guard = 0;
    while (alive.length + n < 60 && guard++ < 120) {
      const q = G.w, a = Math.random() * 6.28, d = 4 + Math.random() * 8, x = q.x + Math.cos(a) * d, y = q.y + Math.sin(a) * d;
      if (WZ.blocked(x, y, 0.4)) continue;
      const e = n % 2 ? WZ.makeEnemy(wild[n % wild.length], x, y, false) : WZ.makeCreature(crafted[(n >> 1) % crafted.length], x, y, { plain: true });
      e.hp = e.maxHp = 1e6; n++;
    }
    for (let i = w.allies.length; i < 5; i++) { const a = WZ.spawnAlly(crafted[(i * 2) % crafted.length]); if (a) a.hp = a.maxHp = 1e6; }
    for (const a of w.allies) a.hp = Math.max(a.hp, 1e6);
  };
  const cast = () => { for (const s of spells) { try { WZ.cast(s); } catch (e) { console.error('cast ' + s + ' ' + e.message); } } };
  // the underworld busy too: remains lying about, five more burners (each hosed to every node / trap / mirror in reach), six traps, the bank full
  const u = G.u, M3 = W.M3;
  for (const el of ['air', 'water', 'fire', 'earth']) u.bank[el] = 400;
  const fill = () => { for (const b of u.bld) if (b.type === 'burner') for (const el in b.hop) b.hop[el] = 100; };   // (burners only burn what is thrown in: fill their hoppers)
  for (let i = 0; i < 40; i++) M3.addItem('rem_' + ['air', 'water', 'fire', 'earth'][i % 4], u.rk.x + Math.random() * 16 - 8, u.rk.y + Math.random() * 16 - 8);
  const b0 = u.bld.find(b => b.type === 'burner');
  for (let i = 0; i < 6; i++) { const s = M3.dryU(b0.x + Math.random() * 8 - 4, b0.y + Math.random() * 8 - 4, 40, [1, 4]); if (s) { const t = M3.make('trap', s[0], s[1], { tk: i % 2 ? 'slow' : 'dmg' }); M3.link(b0, t); } }
  for (let i = 0; i < 5; i++) { const s = M3.dryU(b0.x + Math.random() * 10 - 5, b0.y + Math.random() * 10 - 5, 40, [1, 5]); if (!s) continue; const b = M3.make('burner', s[0], s[1], { el: ['air', 'water', 'fire', 'earth'][i % 4] }); for (const c of u.bld) if (c !== b && (c.type === 'node' || c.type === 'mirror' || c.type === 'trap')) M3.link(b, c); }
  fill();
  top(); cast();
  setInterval(top, 200); setInterval(cast, 1500);
};
const INSTRUMENT = () => {
  const W = window.__wands, P = {};
  const wrap = (o, k, tag) => { if (!o || !o[k]) return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; (P[tag] || (P[tag] = [])).push(d); } }; };
  wrap(W.R, 'drawWorld', 'drawWorld'); wrap(W.R, 'drawFactory', 'drawFactory'); wrap(W.R, 'drawPip', 'drawPip'); wrap(W.UI, 'updateHud', 'updateHud'); wrap(W.Main, 'step', 'Main.step'); wrap(W.Main, 'guestFrame', 'guestFrame'); wrap(W.Net, 'wirePacket', 'wirePacket');
  wrap(W.WZ, 'update', 'WZ.update'); wrap(W.FA, 'update', 'FA.update'); wrap(W.M3, 'guestView', 'guestView'); wrap(W.M3, 'update', 'M3.update'); wrap(W.R, 'drawUnder', 'drawUnder'); wrap(window.M3D, 'drawPip', 'drawPip3');
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
  await stepOn(hp, 'go:online'); await stepOn(hp, 'mode:3'); await stepOn(hp, 'go:create'); await stepOn(hp, 'slot:1', 500);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.online && __wands.G.menu.online.code, null, { timeout: 30000 });
  const code = await hp.evaluate(() => __wands.G.menu.online.code);
  for (let g = 1; g <= 2; g++) {
    const gp = await boot(browser, 'guest' + g, errs); P.push(gp);
    await press(gp, 'KeyD');
    await stepOn(gp, 'go:online'); await stepOn(gp, 'mode:3'); await stepOn(gp, 'go:join', 1500); await stepOn(gp, g === 1 ? 'jrole:B' : 'jrole:K', 900);
    await gp.evaluate(() => { const G = __wands.G, k = G.menu.kb; G.bd.x = k.x - 80 + 1.2; G.bd.y = k.y - 80 + 0.2; });
    await sleep(400); await press(gp, 'KeyE'); await sleep(300);
    for (const ch of code) await gp.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
    await gp.keyboard.press('Enter');
    await hp.waitForFunction(n => __wands.Net.liveSlots().length >= n, g, { timeout: 60000 });
  }
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs3' && __wands.G.menu.l3.chars.length === 3, null, { timeout: 20000 });
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
  // ---- the host takes the Wizard, everybody on READY: the game
  await hp.evaluate(() => { const m = __wands.G.menu, L = m.l3, c = L.chars.find(q => q.who === 'host'); Lobby3.claim(c, 'W'); });
  await hp.evaluate(() => { const m = __wands.G.menu, L = m.l3; for (let s = 0; s < 3; s++) { const c = L.chars.find(q => q.who === L.seats[s].who), p = m.plates.find(q => q.kind === 'ready' && q.seat === s); c.x = p.x; c.y = p.y; } });
  await hp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m3, null, { timeout: 60000 });
  for (const p of P.slice(1)) await p.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.m3, null, { timeout: 40000 });
  for (const p of P) await p.evaluate(() => { __wands.UI.help(false); __wands.G.helpT = 0; });
  await sleep(1500);
  if (!process.env.CALM) { await hp.evaluate(SETUP); await sleep(3000); }
  if (process.env.AB) {   // AB=1: the same game measured with role-scoped snapshots off (otherEvery 1) and on (3), alternating, so the scene's own noise averages out
    await thr(T);
    await P[1].keyboard.down('KeyD'); await P[2].keyboard.down('KeyS');
    const rows = { 1: [], 3: [] };
    for (const every of [1, 3, 1, 3, 1, 3]) {
      await hp.evaluate(e => { const n = __wands.CFG.mode3.net; if (n) n.otherEvery = e; }, every);
      await sleep(1500);
      await Promise.all(P.map(p => p.evaluate(INSTRUMENT)));
      await sleep(SECS * 1000);
      const r = await Promise.all(P.map(p => p.evaluate(() => window.__rep())));
      const work = x => Object.entries(x.ms).filter(([k]) => /^(Main.step|drawWorld|drawFactory|drawPip|updateHud|guestFrame)$/.test(k)).reduce((a, [k, v]) => a + (k === 'Main.step' || k === 'guestFrame' ? parseFloat(v) : 0), 0);
      rows[every].push(r);
    }
    await P[1].keyboard.up('KeyD'); await P[2].keyboard.up('KeyS');
    const avg = (a, g) => a.reduce((x, y) => x + g(y), 0) / a.length;
    for (const every of [1, 3]) {
      const R = rows[every], one = i => g => g(R, i);
      const line = (name, i) => name + ' fps ' + avg(R, r => r[i].fps).toFixed(1) + ' p95gap ' + avg(R, r => r[i].gap_p95).toFixed(0) + ' kbps ' + avg(R, r => r[i].net.kbps).toFixed(0) + ' zipKB ' + avg(R, r => r[i].net.zipKB).toFixed(1) + ' rawKB ' + avg(R, r => r[i].net.rawKB).toFixed(1) + ' parse ' + avg(R, r => parseFloat(r[i].ms['JSON.parse'] || 0)).toFixed(2) + 'ms x' + avg(R, r => parseFloat((r[i].ms['JSON.parse'] || '0 x0').split(' x')[1])).toFixed(0) + ' out ' + avg(R, r => r[i].net.bytesKB / r[i].secs).toFixed(0) + 'KB/s';
      console.log('otherEvery=' + every + ' (' + R.length + ' windows of ' + SECS + ' s)');
      for (let i = 0; i < 3; i++) console.log('  ' + line(i ? (i === 1 ? 'Builder guest   ' : 'Rootkeeper guest') : 'host (Wizard)   ', i));
    }
    console.log(errs.length ? 'FAIL page errors: ' + errs.slice(0, 4).join(' | ') : 'PASS no page errors');
    await browser.close(); process.exit(errs.length ? 1 : 0);
  }
  await thr(T);
  await P[1].keyboard.down('KeyD'); await P[2].keyboard.down('KeyS');   // two guests walk, like players would
  if (process.env.DEBUGDEC) for (const p of P.slice(1)) await p.evaluate(() => { window.__dbg = []; setInterval(() => { const W = __wands, G = W.G; if (G && G.w && !Array.isArray(G.w.decals) && window.__dbg.length < 3) window.__dbg.push({ keys: Object.keys(G.w).length, hasDecKey: 'decals' in G.w, sv: Object.keys(W.Net.slowVal).join(','), next: !!W.Net.next, nextDec: W.Net.next && Array.isArray(W.Net.next.w && W.Net.next.w.decals), prevDec: W.Net.prev && Array.isArray(W.Net.prev.w && W.Net.prev.w.decals), vi: G.vi, menu: !!G.menu, m4: !!G.m4, lastN: W.Net.lastN }); }, 50); });
  await Promise.all(P.map(p => p.evaluate(INSTRUMENT)));
  await sleep(SECS * 1000);
  await P[1].keyboard.up('KeyD'); await P[2].keyboard.up('KeyS');
  const res = await Promise.all(P.map(p => p.evaluate(() => window.__rep())));
  if (process.env.DEBUGDEC) for (const p of P.slice(1)) console.log('DBG', JSON.stringify(await p.evaluate(() => window.__dbg)));
  const scene = await hp.evaluate(() => { const w = __wands.G.w, u = __wands.G.u; return { foes: w.enemies.filter(e => !e.dead).length, allies: w.allies.length, zones: w.zones.length, proj: w.proj.length, fx: w.fx_.length, below: u.bld.length, pulses: u.pulses.length, items: u.items.length }; });
  console.log((process.env.CALM ? 'CALM' : 'STRESS') + ' scene ' + JSON.stringify(scene) + (T > 1 ? '  throttle x' + T : ''));
  console.log('host   ' + JSON.stringify(res[0]));
  for (let i = 1; i < 3; i++) console.log('guest' + i + (i === 1 ? ' (Builder)    ' : ' (Rootkeeper) ') + JSON.stringify(res[i]));
  if (process.env.SIZES) {   // SIZES=1: what a snapshot is made of (raw characters and deflated bytes of each part of G, G.w and G.fac)
    const rows = await hp.evaluate(async () => {
      const G = __wands.G, out = [];
      const zip = async str => { const cs = new CompressionStream('deflate'), w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close(); return (await new Response(cs.readable).arrayBuffer()).byteLength; };
      for (const k in G) {
        const v = G[k];
        if ((k === 'w' || k === 'fac' || k === 'u') && v && typeof v === 'object') { for (const j in v) { const t = JSON.stringify(v[j]); if (t !== undefined) out.push([k + '.' + j, t.length, await zip(t)]); } }
        else { const t = JSON.stringify(v); if (t !== undefined) out.push([k, t.length, await zip(t)]); }
      }
      return out;
    });
    const kinds = await hp.evaluate(() => { const h = {}; for (const f of __wands.G.w.fx_) { const k = f.k || f.kind || f.type || '?'; h[k] = (h[k] || 0) + 1; } return Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e.join(':')).join(' '); });
    console.log('fx_ by kind: ' + kinds);
    rows.sort((a, b) => b[2] - a[2]);
    const sum = rows.reduce((a, r) => [a[0] + r[1], a[1] + r[2]], [0, 0]);
    console.log('SIZES (raw chars / deflated bytes; total ' + sum[0] + ' / ' + sum[1] + '):');
    for (const r of rows.slice(0, 26)) console.log('  ' + r[0].padEnd(16) + String(r[1]).padStart(8) + String(r[2]).padStart(8));
  }
  if (process.env.PROFILE) {   // PROFILE=host|guest: a CPU profile of that page for 5 s: self time by function, then inclusive time of the main phases
    const pg = process.env.PROFILE === 'host' ? hp : process.env.PROFILE === 'root' ? P[2] : P[1];   // (host, guest = the Builder, root = the Rootkeeper)
    await P[1].keyboard.down('KeyD');
    const cdp = await pg.context().newCDPSession(pg);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start');
    await sleep(5000);
    const { profile } = await cdp.send('Profiler.stop');
    await P[1].keyboard.up('KeyD');
    const nodes = new Map(profile.nodes.map(n => [n.id, n])), par = new Map();
    for (const n of profile.nodes) for (const c of (n.children || [])) par.set(c, n.id);
    const nm = n => (n.callFrame.functionName || '(anon)') + ' ' + (n.callFrame.url.split('/').pop() || '') + ':' + (n.callFrame.lineNumber + 1);
    const self = {}, incl = {}, kids = {}; let tot = 0;
    const PH = /^(R\.drawWorld|R\.drawFactory|R\.drawPip|Main\.step|Main\.guestFrame|M3\.guestView|R\.drawUnder|M3D\.drawPip|M3\.update|UI\.updateHud|wirePacket|wireParts|wireJoin|sendSnap4|Net\.stamp|WZ\.update|WZ\.update2|FA\.update|encode|Main\.hintFor|\(garbage collector\)|\(program\)|\(idle\))$/;
    profile.samples.forEach((id, i) => {
      const d = (profile.timeDeltas[i] || 0) / 1000; tot += d; const k = nm(nodes.get(id)); self[k] = (self[k] || 0) + d;
      const chain = []; for (let x = id; x !== undefined; x = par.get(x)) chain.push(x);
      const pi = chain.findIndex(x => /^(R.drawWorld|R.drawFactory)$/.test(nodes.get(x).callFrame.functionName));
      if (pi > 0) { const k = nm(nodes.get(chain[pi - 1])); kids[k] = (kids[k] || 0) + d; }
      const seen = new Set();
      for (let x = id; x !== undefined; x = par.get(x)) { const fn = nodes.get(x).callFrame.functionName; if (PH.test(fn) && !seen.has(fn)) { seen.add(fn); incl[fn] = (incl[fn] || 0) + d; } }
    });
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => '  ' + v.toFixed(0).padStart(6) + 'ms  ' + k).join(String.fromCharCode(10));
    console.log('PROFILE ' + process.env.PROFILE + ' (self ms of ' + tot.toFixed(0) + '):' + String.fromCharCode(10) + top(self, 24) + String.fromCharCode(10) + ' inclusive:' + String.fromCharCode(10) +  top(incl, 20) + String.fromCharCode(10) + ' children of drawWorld / drawFactory:' + String.fromCharCode(10) + top(kids, 18));
  }
  console.log(errs.length ? 'FAIL page errors: ' + errs.slice(0, 4).join(' | ') : 'PASS no page errors');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
