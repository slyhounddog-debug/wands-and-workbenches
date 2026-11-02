'use strict';
// The OFFLINE frame cost run (headless, one page, no network): a 4-player game with the stress scene (60 foes, 5 allies, 20 spells re-cast every 1.5 s, nobody can die), or CALM=1.
// One page means no other browser competes for the CPU, so the numbers are steady enough to compare two builds. It prints, per frame: the main-thread milliseconds of each phase,
// the drawImage calls per frame and who made them (the innermost R.draw* function), the snapshot cost (build + stringify), and optionally a CPU profile.
//   node tools/perf/frame.js                 the stress scene, 8 s
//   CALM=1 node tools/perf/frame.js          the quiet game
//   SECS=12 PROFILE=1 node tools/perf/frame.js   a CPU profile (self time by function, inclusive time of the main phases, children of drawWorld)
//   ROOT=<worktree of an older commit> ...   measure another build with the same tool
//   MODE2=1 ...                              a 2-player game instead (the stress scene without the second Wizard)
//   MODE3=1 [ROLE=W|B|K] ...                 a 3-player game drawn from that seat (default the Wizard); the stress scene adds a busy underworld (remains, burners, traps)
// Needs playwright-core + Edge (PLAYWRIGHT_CORE=<path>).
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = process.env.ROOT || path.resolve(__dirname, '../..');
const URL = 'file:///' + path.join(ROOT, 'index.html').split(path.sep).join('/');
const SECS = +process.env.SECS || 8, sleep = ms => new Promise(r => setTimeout(r, ms));

// the stress scene (same as tools/mode4check/stress.js, run in this page)
const SETUP = (two) => {
  const W = __wands, G = W.G, WZ = W.WZ, CFG = W.CFG;
  const spells = ['nova', 'blizzard', 'thunder', 'meteor', 'tempest', 'mud', 'magma', 'geyser', 'flamethrower', 'steam'];
  const wild = ['slime', 'shroom', 'sprite', 'imp', 'lurker', 'wisp', 'golem'], crafted = Object.keys(CFG.creatures);
  CFG.world.cap = 0; CFG.crafted.cap = 0;
  const ws = two ? [0] : [0, 1];
  const top = () => {
    const w = G.w;
    for (const q of (two ? [G.w] : WZ.allW())) { q.dead = false; q.hp = 1e6; q.armor = 100; }
    G.w.maxHp = 1e6;
    const alive = w.enemies.filter(e => !e.dead);
    for (const e of alive) e.hp = e.maxHp = 1e6;
    let n = 0, guard = 0;
    while (alive.length + n < 60 && guard++ < 120) {
      const q = two ? G.w : WZ.pw(n % 2), a = Math.random() * 6.28, d = 4 + Math.random() * 8, x = q.x + Math.cos(a) * d, y = q.y + Math.sin(a) * d;
      if (WZ.blocked(x, y, 0.4)) continue;
      const e = n % 2 ? WZ.makeEnemy(wild[n % wild.length], x, y, false) : WZ.makeCreature(crafted[(n >> 1) % crafted.length], x, y, { plain: true });
      e.hp = e.maxHp = 1e6; n++;
    }
    for (let i = w.allies.length; i < 5; i++) { const a = WZ.spawnAlly(crafted[(i * 2) % crafted.length]); if (a) a.hp = a.maxHp = 1e6; }
    for (const a of w.allies) a.hp = Math.max(a.hp, 1e6);
  };
  const cast = () => { for (const i of ws) for (const s of spells) { try { WZ.as(i, () => WZ.cast(s)); } catch (e) { console.error('cast ' + s + ' ' + e.message); } } };
  top(); cast();
  setInterval(top, 200); setInterval(cast, 1500);
};
const INSTRUMENT = (lean) => {
  const W = window.__wands, P = {}, D = { calls: 0, ms: 0, by: {} }, tags = [];
  const wrap = (o, k, tag) => { if (!o || !o[k]) return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; (P[tag] || (P[tag] = [])).push(d); } }; };
  for (const [o, k, tag] of lean ? [] : [[W.R, 'drawWorld', 'drawWorld'], [W.R, 'drawFactory', 'drawFactory'], [W.R, 'drawPip', 'drawPip'], [W.UI, 'updateHud', 'updateHud'], [W.Main, 'step', 'Main.step'], [W.R, 'drawUnder', 'drawUnder'], [window.M3D, 'drawPip', 'drawPip3'], [W.M3, 'update', 'M3.update'], [W.WZ, 'update', 'WZ.update'], [W.FA, 'update', 'FA.update'], [W.R, 'flush', 'R.flush'], [W.Main, 'hintFor', 'hintFor'], [W.Net, 'wirePacket', 'snapshot build']]) wrap(o, k, tag);
  // who makes the drawImage calls: tag the innermost R.draw* function
  const tag = (o, k) => { const f = o[k]; o[k] = function (...a) { tags.push(k); try { return f.apply(this, a); } finally { tags.pop(); } }; };
  if (!lean) for (const k of Object.keys(W.R)) if (/^draw[A-Z]/.test(k) && typeof W.R[k] === 'function' && !/^draw(World|Factory|Pip)$/.test(k)) tag(W.R, k);
  const di = CanvasRenderingContext2D.prototype.drawImage;
  if (!lean) CanvasRenderingContext2D.prototype.drawImage = function (...a) {
    const t = performance.now(); try { return di.apply(this, a); } finally {
      const d = performance.now() - t, k = tags.length ? tags[tags.length - 1] : '(sprites / blit)';
      D.calls++; D.ms += d; const e = D.by[k] || (D.by[k] = { n: 0, ms: 0 }); e.n++; e.ms += d;
    }
  };
  let defers = 0; if (!lean) { const fl = W.R.flush; W.R.flush = function () { defers += W.R.defer ? W.R.defer.length : 0; return fl.apply(this, arguments); }; }
  let swaps = 0; if (W.WZ.swapP) { const sp = W.WZ.swapP; W.WZ.swapP = function () { swaps++; if (window.__swapWho) { const m = new Error().stack.split(String.fromCharCode(10)).slice(3, 6).map(l => l.trim().split(' ')[1]).join(' < '); window.__swapWho[m] = (window.__swapWho[m] || 0) + 1; } return sp.apply(this, arguments); }; }
  const gaps = []; let last = performance.now(), on = true, frames = 0;
  (function loop(now) { if (!on) return; gaps.push(now - last); last = now; frames++; requestAnimationFrame(loop); })(last);
  const t0 = performance.now();
  window.__rep = () => {
    on = false; CanvasRenderingContext2D.prototype.drawImage = di;
    const secs = (performance.now() - t0) / 1000, avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, out = { secs: +secs.toFixed(1), frames, fps: +(frames / secs).toFixed(1), ms: {}, sum: 0 };
    for (const k in P) { const per = P[k].length ? P[k].reduce((x, y) => x + y, 0) / frames : 0; out.ms[k] = +per.toFixed(2); }
    out.sum = +(['Main.step', 'drawWorld', 'drawFactory', 'drawPip', 'drawUnder', 'drawPip3', 'updateHud'].reduce((a, k) => a + (out.ms[k] || 0), 0)).toFixed(2);   // (what one frame costs on the main thread)
    out.defers = +(defers / frames).toFixed(0);
    if (window.__swapWho) out.swapWho = Object.entries(window.__swapWho).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (v / frames).toFixed(1) + '/f ' + k);
    out.swaps = +(swaps / frames).toFixed(0);
    out.drawImage = { perFrame: +(D.calls / frames).toFixed(0), msPerFrame: +(D.ms / frames).toFixed(2), by: Object.entries(D.by).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, v]) => k + ' ' + (v.n / frames).toFixed(0) + '/f ' + (v.ms / frames).toFixed(2) + 'ms') };
    return out;
  };
};
(async () => {
  const errs = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  await page.mouse.click(300, 300);
  await sleep(300); await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu && __wands.G.menu.plates.length > 5, null, { timeout: 30000 });
  await sleep(800);
  const m3 = !!process.env.MODE3, two = !!process.env.MODE2 || m3, role = ['B', 'W', 'K'].indexOf(process.env.ROLE || 'W');
  await page.evaluate(([two, m3, role]) => {
    const W = __wands;
    if (m3) W.start3(1, { me: role }); else if (two) W.start(1); else { const s = W.M4.defaultSeats(); s[2].att = ['fire', 'water']; s[3].att = ['air', 'earth']; W.start4(1, { seats: s, me: 2 }); }
    W.UI.help(false); W.G.helpT = 0;
  }, [two, m3, role]);
  await sleep(1500);
  await page.evaluate(() => { if (__wands.Main.pause) { /* a blurred headless page opens the pause menu */ } });
  if (!process.env.CALM) {
    await page.evaluate(SETUP, two);
    if (m3) await page.evaluate(() => {   // the underworld busy too (as in tools/mode3check/stress.js)
      const W = __wands, u = W.G.u, M3 = W.M3, E = ['air', 'water', 'fire', 'earth'];
      for (const el of E) u.bank[el] = 400;
      for (let i = 0; i < 40; i++) M3.addItem('rem_' + E[i % 4], u.rk.x + Math.random() * 16 - 8, u.rk.y + Math.random() * 16 - 8);
      const b0 = u.bld.find(b => b.type === 'burner');
      for (let i = 0; i < 6; i++) { const p = M3.dryU(b0.x + Math.random() * 8 - 4, b0.y + Math.random() * 8 - 4, 40, [1, 4]); if (p) M3.link(b0, M3.make('trap', p[0], p[1], { tk: i % 2 ? 'slow' : 'dmg' })); }
      for (let i = 0; i < 5; i++) { const p = M3.dryU(b0.x + Math.random() * 10 - 5, b0.y + Math.random() * 10 - 5, 40, [1, 5]); if (!p) continue; const b = M3.make('burner', p[0], p[1], { el: E[i % 4] }); for (const c of u.bld) if (c !== b && (c.type === 'node' || c.type === 'mirror' || c.type === 'trap')) M3.link(b, c); }
      for (const b of u.bld) if (b.type === 'burner') for (const el in b.hop) b.hop[el] = 100;   // (burners only burn what is thrown in)
      u.ghost.W = u.ghost.K = true;   // (the ghost views on: the most each seat draws)
    });
    await sleep(3000);
  }
  await page.keyboard.down('KeyD');
  if (process.env.SWAPWHO) await page.evaluate(() => { window.__swapWho = {}; });
  await page.evaluate(INSTRUMENT, !!process.env.PROFILE);   // (a profile wants the real function names, not the counting wrappers)
  await sleep(SECS * 1000);
  await page.keyboard.up('KeyD');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const res = await page.evaluate(() => window.__rep());
  const scene = await page.evaluate(() => { const w = __wands.G.w; return { foes: w.enemies.filter(e => !e.dead).length, allies: w.allies.length, zones: w.zones.length, proj: w.proj.length, fx: w.fx_.length, decals: w.decals.length }; });
  console.log((process.env.CALM ? 'CALM' : 'STRESS') + (m3 ? ' 3P seat ' + (process.env.ROLE || 'W') : two ? ' 2P' : ' 4P') + ' scene ' + JSON.stringify(scene));
  console.log('frame  ' + res.fps + ' fps, ' + res.sum + ' ms of main-thread work per frame  ' + JSON.stringify(res.ms));
  console.log('swaps (Wizard field swaps) per frame: ' + res.swaps + ', deferred text/icon draws per frame: ' + res.defers);
  if (res.swapWho) for (const l of res.swapWho) console.log('   swap ' + l);
  console.log('drawImage ' + res.drawImage.perFrame + ' calls, ' + res.drawImage.msPerFrame + ' ms per frame:');
  for (const l of res.drawImage.by) console.log('   ' + l);
  if (process.env.PROFILE) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
    await sleep(5000);
    const { profile } = await cdp.send('Profiler.stop');
    const nodes = new Map(profile.nodes.map(n => [n.id, n])), par = new Map();
    for (const n of profile.nodes) for (const c of (n.children || [])) par.set(c, n.id);
    const nm = n => (n.callFrame.functionName || '(anon)') + ' ' + (n.callFrame.url.split('/').pop() || '') + ':' + (n.callFrame.lineNumber + 1);
    const self = {}, kids = {}, incl = {}; let tot = 0;
    const PH = /^(R\.drawWorld|R\.drawFactory|R\.drawPip|Main\.step|UI\.updateHud|WZ\.update|WZ\.update2|FA\.update|WZ\.buildFlow|WZ\.aiTick|WZ\.each|WZ\.hurtE|WZ\.zoneSpecial|WZ\.projSpecial|WZ\.sel|\(garbage collector\)|\(idle\))$/;
    profile.samples.forEach((id, i) => {
      const d = (profile.timeDeltas[i] || 0) / 1000; tot += d; const k = nm(nodes.get(id)); self[k] = (self[k] || 0) + d;
      const chain = []; for (let x = id; x !== undefined; x = par.get(x)) chain.push(x);
      const pi = chain.findIndex(x => /^(R\.drawWorld|R\.drawFactory)$/.test(nodes.get(x).callFrame.functionName));
      if (pi > 0) { const kk = nm(nodes.get(chain[pi - 1])); kids[kk] = (kids[kk] || 0) + d; }
      const seen = new Set();
      for (const x of chain) { const fn = nodes.get(x).callFrame.functionName; if (PH.test(fn) && !seen.has(fn)) { seen.add(fn); incl[fn] = (incl[fn] || 0) + d; } }
    });
    const NL = String.fromCharCode(10), top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => '  ' + v.toFixed(0).padStart(6) + 'ms  ' + k).join(NL);
    console.log('PROFILE (self ms of ' + tot.toFixed(0) + '):' + NL + top(self, 26) + NL + ' inclusive:' + NL + top(incl, 16) + NL + ' children of drawWorld / drawFactory:' + NL + top(kids, 22));
  }
  console.log(errs.length ? 'FAIL page errors: ' + errs.slice(0, 4).join(' | ') : 'PASS no page errors');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
