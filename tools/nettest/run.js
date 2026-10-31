'use strict';
// Online co-op acceptance run (headless): a host page and a guest page (two isolated browser profiles) talk through the PeerJS cloud + a WebRTC data channel.
// The front door is the living menu world: the host walks onto the Online > Create plates, the guest types the code at the keyboard prop (real key presses), both are
// readied on their plates (the characters are put on them through the hooks) and the start sequence hands over to the game.
//   node tools/nettest/run.js              the functional checks (join by code, input, tree purchase intent, PIP, disconnect / rejoin / timeout)
//   SOAK=600 node tools/nettest/run.js     also a soak of that many seconds (guest walks / rolls at random, the host keeps delivering), then the report
//   SHOTS=<dir> ...                        save screenshots of both sides
// Needs playwright-core + Edge (PLAYWRIGHT_CORE=<path>) and internet (the signaling server). Both pages are on THIS machine, so it proves the protocol and the game, not NAT
// traversal between two networks (tools/netspike is for that).
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SOAK = +process.env.SOAK || 0, SHOTS = process.env.SHOTS || '';
const URL = 'file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/') + (process.env.LOSSY0 ? '?lossy=0' : '');
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + extra : '')); if (!c) fails++; };
const jc = async (p, sel) => { await p.waitForSelector(sel, { state: 'attached', timeout: 20000 }); await p.evaluate(s => document.querySelector(s).click(), sel); };   // (in-game DOM buttons: the banners)
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ---- walking the menu world's plates: park a character off the plates, wait for frames, put it on the plate (that is a step-on)
const frames = (p, t0, dt) => p.waitForFunction(([t0, dt]) => { const m = __wands.G.menu; return !m || m.t > t0 + dt; }, [t0, dt], { timeout: 20000 });
const stepOn = async (p, role, act, wait) => {
  const t0 = await p.evaluate(role => { const G = __wands.G, c = G.menu.tc, x = c.x + (role === 'B' ? 0.5 : -0.5), y = c.y + 1.0; if (role === 'B') { G.bd.x = x - 80; G.bd.y = y - 80; G.bd.vx = G.bd.vy = 0; } else { G.w.x = x; G.w.y = y; } return G.menu.t; }, role);
  await frames(p, t0, 0.3);
  const r = await p.evaluate(([role, act]) => { const G = __wands.G, q = G.menu.plates.find(x => x.act === act || x.key === act); if (!q) return 'noplate ' + act; if (role === 'B') { G.bd.x = q.x - 80; G.bd.y = q.y - 80; } else { G.w.x = q.x; G.w.y = q.y; } return 'ok'; }, [role, act]);
  if (r !== 'ok') throw new Error(r);
  await sleep(wait || 1300);
};
const press = async (p, k) => { await p.keyboard.down(k); await sleep(80); await p.keyboard.up(k); };
const hostCreate = async hp => {   // Online > Create > slot 1: resolves with the room code
  await press(hp, 'KeyD');
  await stepOn(hp, 'B', 'go:online'); await stepOn(hp, 'B', 'mode:2'); await stepOn(hp, 'B', 'go:create'); await stepOn(hp, 'B', 'slot:1', 500);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.online && __wands.G.menu.online.code, null, { timeout: 30000 });
  return hp.evaluate(() => __wands.G.menu.online.code);
};
const typeCode = async (gp, code) => {   // the keyboard prop: walk up, E, type, Enter
  await press(gp, 'KeyD');
  await stepOn(gp, 'B', 'go:online'); await stepOn(gp, 'B', 'mode:2'); await stepOn(gp, 'B', 'go:join', 1500);
  await gp.evaluate(() => { const G = __wands.G, k = G.menu.kb; G.bd.x = k.x - 80 + 1.2; G.bd.y = k.y - 80 + 0.2; });
  await sleep(400); await press(gp, 'KeyE'); await sleep(300);
  for (const ch of code) await gp.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
  await gp.keyboard.press('Enter');
};
const readyUp = async (hp) => {   // both are on their Ready plates: the countdown, the start sequence, the game
  await stepOn(hp, 'B', 'readyB', 100);
  await hp.evaluate(() => { const q = __wands.G.menu.plates.find(x => x.key === 'readyW'); __wands.G.w.x = q.x; __wands.G.w.y = q.y; });
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
  const H = await boot(browser, 'host'), Gu = await boot(browser, 'guest'), hp = H.page, gp = Gu.page;
  const t0 = Date.now();

  // ---- the Crystal test: open page -> Online -> Join -> type the code -> playing
  const code = await hostCreate(hp);
  ok(/^[ABCDFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(code), 'room code is 6 unambiguous characters (no E: it is the keyboard prop cancel key)', code);
  ok(await hp.evaluate(() => { const N = __wands.Net; for (let i = 0; i < 200; i++) if (/[E0O1IL]/.test(N.makeCode())) return false; return true; }), '200 generated codes never contain E (or 0 O 1 I L)');
  await typeCode(gp, code);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs' && __wands.Net.state === 'live', null, { timeout: 60000 });
  await gp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs' && __wands.Net.state === 'live', null, { timeout: 30000 });
  console.log('joined in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's (both pages loaded, incl. signaling + ICE)');
  ok(true, 'guest joined by typing the code at the keyboard prop: both are in the character select');
  ok(await gp.evaluate(() => __wands.G.menu.conn.W && __wands.G.menu.conn.B), 'the guest sees the host menu world with both players connected (snapshots, no wire change)');
  // the guest walks his Wizard with the keyboard in the lobby: it moves on the host
  const lw0 = await hp.evaluate(() => [__wands.G.w.x, __wands.G.w.y]);
  await gp.keyboard.down('KeyD'); await sleep(800); await gp.keyboard.up('KeyD');
  const lw1 = await hp.evaluate(() => [__wands.G.w.x, __wands.G.w.y]);
  ok(Math.hypot(lw1[0] - lw0[0], lw1[1] - lw0[1]) > 1, 'the guest WASD walks the Wizard in the host menu world', 'moved ' + Math.hypot(lw1[0] - lw0[0], lw1[1] - lw0[1]).toFixed(1));
  // both ready: the host screen fades, the start sequence runs, then it is a game
  await readyUp(hp);
  await hp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && !__wands.G.intro, null, { timeout: 60000 });
  await gp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && !__wands.G.intro && __wands.G.w, null, { timeout: 40000 });
  ok(true, 'both ready: the countdown, the host fade and the building drop-in ran, and both are playing');
  await hp.evaluate(() => { __wands.UI.help(false); __wands.G.helpT = 0; });
  await gp.evaluate(() => __wands.UI.help(false));
  await sleep(1500);

  // ---- the guest renders the host's state
  const hs = await hp.evaluate(() => ({ t: __wands.G.stats.time, x: __wands.G.w.x, y: __wands.G.w.y, role: __wands.Net.role, ctl: __wands.G.ctl }));
  const gs = await gp.evaluate(() => ({ t: __wands.G.stats.time, x: __wands.G.w.x, y: __wands.G.w.y, role: __wands.Net.role }));
  ok(hs.role === 'host' && gs.role === 'guest', 'roles: host / guest');
  ok(Math.abs(hs.t - gs.t) < 1.0, 'guest state is current', 'host ' + hs.t.toFixed(2) + 's, guest ' + gs.t.toFixed(2) + 's');
  ok(hs.ctl.kbB && !hs.ctl.kbW && hs.ctl.pw === 1, 'host plays the Builder, the Wizard is the virtual pad in slot 1');

  // ---- the guest's keyboard: WASD walks the host's Wizard
  const p0 = await hp.evaluate(() => [__wands.G.w.x, __wands.G.w.y]);
  await gp.keyboard.down('KeyD'); await sleep(1200); await gp.keyboard.up('KeyD');
  await sleep(300);
  const p1 = await hp.evaluate(() => [__wands.G.w.x, __wands.G.w.y]);
  ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1.0, 'guest WASD moves the Wizard on the host', 'moved ' + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1) + ' tiles');
  const gx = await gp.evaluate(() => [__wands.G.w.x, __wands.G.w.y]);
  ok(Math.hypot(gx[0] - p1[0], gx[1] - p1[1]) < 1.5, 'and the guest sees him there');
  // how long from the guest's key press to HIS OWN Wizard moving on HIS screen? (delay = a simulated slow link: that many ms each way, so 75 ms is a 150 ms ping)
  const latency = async delay => {
    for (const p of [hp, gp]) await p.evaluate(d => { __wands.Net.simDelay = d; }, delay);
    await sleep(1800);
    const out = [];
    for (let i = 0; i < 6; i++) {
      const key = i % 2 ? 'KeyA' : 'KeyD';
      await sleep(1100);
      const pr = gp.evaluate(() => new Promise(res => {
        const w = __wands.G.w, x0 = w.x, y0 = w.y; let t0 = 0;
        addEventListener('keydown', () => { t0 = performance.now(); }, { once: true });
        const born = performance.now(), tick = () => { const w2 = __wands.G.w; if (t0 && Math.hypot(w2.x - x0, w2.y - y0) > 0.04) res(performance.now() - t0); else if ((t0 && performance.now() - t0 > 3000) || performance.now() - born > 6000) res(3000); else requestAnimationFrame(tick); };   // (never waits forever: a lost key event used to hang the run)
        requestAnimationFrame(tick);
      }));
      await sleep(50); await gp.keyboard.down(key);
      out.push(await pr);
      await sleep(250); await gp.keyboard.up(key);
    }
    for (const p of [hp, gp]) await p.evaluate(() => { __wands.Net.simDelay = 0; });
    out.sort((a, b) => a - b);
    return Math.round((out[2] + out[3]) / 2);
  };
  const predOf = on => gp.evaluate(on => { if (typeof Main.PREDICT !== 'undefined') Main.PREDICT = on; return typeof Main.PREDICT !== 'undefined'; }, on);
  // (no wild monsters while these measure: walking back and forth for half a minute among them sometimes got him killed, and a dead Wizard is neither predicted nor rolls)
  await hp.evaluate(() => { const W = __wands; W.CFG.world._cap = W.CFG.world.cap; W.CFG.world.cap = 0; W.G.w.enemies.length = 0; W.G.w.hp = W.WZ.maxHp();
    // (nor hatchlings: the starter Spawner's Eggs keep dropping hostile creatures beside him, which are not wild monsters and ignore world.cap; they killed him at random and everything after read a dead Wizard)
    W.CFG.crafted._cap = W.CFG.crafted.cap; W.CFG.crafted.cap = 0; W.G.fac.eggQ.length = 0; });
  await predOf(false);
  const latOff0 = await latency(0), latOff75 = await latency(75);
  const hasPred = await predOf(true);
  const latOn0 = await latency(0), latOn75 = await latency(75);
  console.log('INPUT LAG (key press -> own Wizard moves on his screen, median): no delay ' + latOff0 + ' ms, 150 ms ping ' + latOff75 + ' ms' + (hasPred ? ' | with prediction: no delay ' + latOn0 + ' ms, 150 ms ping ' + latOn75 + ' ms' : ''));
  if (hasPred) ok(latOn75 < 90, 'with prediction the guest\'s own Wizard answers a key press at once even on a 150 ms ping', latOn75 + ' ms');
  if (hasPred) {   // is the prediction RIGHT: a zig-zag and a roll on a 150 ms ping end where the host says he is, and the corrections along the way stay small
    for (const p of [hp, gp]) await p.evaluate(() => { __wands.Net.simDelay = 75; }); await sleep(1500);
    await hp.evaluate(() => { const W = __wands; W.G.w.hp = W.WZ.maxHp(); W.G.w.enemies.length = 0; W.G.w.rollCd = 0; });   // (alive and alone: the long walks meet wild monsters, and a dead Wizard cannot roll)
    let maxFix = 0;
    for (const k of ['KeyD', 'KeyS', 'KeyA', 'KeyW', 'KeyD', 'KeyS']) { await gp.keyboard.down(k); await sleep(380); maxFix = Math.max(maxFix, await gp.evaluate(() => __wands.Main.pr.fix)); await gp.keyboard.up(k); await sleep(140); }
    await hp.evaluate(() => { const W = __wands; W.G.w.hp = W.WZ.maxHp(); W.G.w.enemies.length = 0; W.G.w.rollCd = 0; });
    await gp.keyboard.down('KeyS'); await sleep(1600);   // a steady walk: the misses at each new picture (no turns in it)
    const misses = await gp.evaluate(() => new Promise(res => { const m = []; let last = __wands.Net.lastN; const f = () => { if (__wands.Net.lastN !== last) { last = __wands.Net.lastN; m.push(__wands.Main.pr.fix); (window.__tr = window.__tr || []).push(__wands.Main.pr.last); } if (m.length < 15 && performance.now() - t0 < 5000) requestAnimationFrame(f); else res(m); }; const t0 = performance.now(); f(); }));
    await gp.keyboard.up('KeyS');
    if (process.env.TRACE) console.log((await gp.evaluate(() => window.__tr)).map(x => JSON.stringify(x)).join('\n'));
    const med = misses.slice().sort((x, y) => x - y)[misses.length >> 1];
    ok(med < 0.02 && Math.max(...misses) < 0.3, 'walking straight on a 150 ms ping the prediction needs (almost) no correction: no rubber banding', 'median ' + med.toFixed(3) + ', worst ' + Math.max(...misses).toFixed(3) + ' tiles (the worst: reaching a shore / a foe bumping him)');
    await sleep(600); await gp.keyboard.down('KeyD'); await sleep(100); await gp.keyboard.down('Space'); await sleep(120);   // (the host's answer cannot be back before ~200 ms at this ping: rolling by then is the prediction)
    const rolling = await gp.evaluate(() => __wands.G.w.roll > 0);
    if (process.env.TRACE) console.log('ROLL', JSON.stringify(await gp.evaluate(() => { const p = __wands.Main.pr, w = __wands.G.w; return { ok: p.ok, s: p.s && { roll: p.s.roll, rollCd: p.s.rollCd, vx: p.s.vx }, wroll: w.roll, kick: !!w.kick, dead: w.dead, hurt: w.hurtT, mute: __wands.Net.mute }; })));
    await gp.keyboard.up('Space'); await sleep(300); await gp.keyboard.up('KeyD');
    await sleep(2500);
    const hpos = await hp.evaluate(() => [__wands.G.w.x, __wands.G.w.y]), gpos = await gp.evaluate(() => [__wands.G.w.x, __wands.G.w.y]);
    for (const p of [hp, gp]) await p.evaluate(() => { __wands.Net.simDelay = 0; });
    ok(rolling, 'the roll starts on the guest\'s screen at once (150 ms ping)');
    ok(Math.hypot(hpos[0] - gpos[0], hpos[1] - gpos[1]) < 0.15, 'after a zig-zag and a roll the predicted Wizard rests where the host has him', Math.hypot(hpos[0] - gpos[0], hpos[1] - gpos[1]).toFixed(3) + ' tiles');
    ok(maxFix < 0.4, 'and the corrections along the way stayed small (average miss at each new picture)', maxFix.toFixed(2) + ' tiles');
  }
  ok(await hp.evaluate(() => !__wands.G.w.dead), 'the Wizard is alive after the input checks (they measured the netcode, not a fight)');
  await hp.evaluate(() => { const W = __wands; W.CFG.world.cap = W.CFG.world._cap; });
  await sleep(500);
  // smoothness on the guest: while the Wizard walks, how many screen frames actually show him in a new place? (snapshots arrive at 20 Hz; without gliding it is about a third)
  if (process.env.NOTWEEN) await gp.evaluate(() => { Main.tween = () => { Main.tw = []; }; });   // (to see the numbers without the gliding)
  await gp.evaluate(() => { window.__fr = { n: 0, moved: 0, last: null }; const tick = () => { const f = window.__fr, w = __wands.G && __wands.G.w; if (w) { const k = w.x.toFixed(4) + ',' + w.y.toFixed(4); f.n++; if (f.last !== null && k !== f.last) f.moved++; f.last = k; } if (!f.stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await gp.keyboard.down('KeyS'); await sleep(1500); await gp.keyboard.up('KeyS');
  const fr = await gp.evaluate(() => { window.__fr.stop = true; return { n: window.__fr.n, moved: window.__fr.moved }; });
  console.log('GUEST SMOOTHNESS: ' + fr.moved + ' of ' + fr.n + ' screen frames showed the walking Wizard in a new place');
  ok(fr.n > 20 && fr.moved / fr.n > 0.75, 'the guest sees the walking Wizard move on (nearly) every screen frame, not in 20 Hz steps', Math.round(fr.moved / fr.n * 100) + '%');
  await sleep(300);
  // Space = roll
  await hp.evaluate(() => { const W = __wands; W.G.w.hp = W.WZ.maxHp(); W.G.w.enemies.length = 0; W.G.w.rollCd = 0; });   // (alive and alone: the long walks meet wild monsters, and a dead Wizard cannot roll)
  await gp.keyboard.down('KeyA'); await gp.keyboard.press('Space'); await gp.keyboard.up('KeyA');
  await sleep(500);
  const rolled = await hp.evaluate(() => __wands.G.w.rollCd > 0 || __wands.G.w.roll > 0);
  ok(rolled, 'guest Space rolls the Wizard (edge latched through the 30 Hz packets)');
  // ---- the Wizard's four buttons on the guest's keyboard: Q = Cycle, right click = Cast, left click = Mash, Space = Dodge (each its own field on the pad, no new wire field)
  await hp.evaluate(() => { const W = __wands, G = W.G, g = G.wand; G.w.hp = 1e5; G.w.enemies.length = 0; G.w.invisT = G.w.fireT = G.w.statT = 0; for (const el of ['air', 'water', 'fire', 'earth']) { g.m[el] = 0; g.full[el] = false; } g.ord = []; g.armed = null; for (const el of ['fire', 'air']) { g.m[el] = W.CFG.wand[el] ? W.CFG.wand.need[el] : 1; g.full[el] = true; g.ord.push(el); } g.armed = 'air'; });
  await sleep(500);
  const gh = await gp.evaluate(() => ({ full: Array.from(document.querySelectorAll('#wandRow .ws.full')).length, armed: Array.from(document.querySelectorAll('#wandRow .ws.armed')).length, w: JSON.stringify(__wands.G.wand.full) }));
  ok(gh.full === 2 && gh.armed === 1, "the guest's HUD shows the two ready wand slots and the armed one", JSON.stringify(gh));
  await gp.keyboard.press('KeyQ'); await sleep(500);
  const cyc = await hp.evaluate(() => __wands.G.wand.armed);
  ok(cyc === 'fire', 'guest Q cycles the wand on the host (air -> fire, only filled slots)', cyc);
  await gp.mouse.click(760, 440, { button: 'right' }); await sleep(500);
  const cast = await hp.evaluate(() => ({ fireT: __wands.G.w.fireT, full: __wands.G.wand.full.fire, armed: __wands.G.wand.armed, z: __wands.G.w.zones.some(z => z.kind === 'ftrail') }));
  ok(cast.fireT > 0 && !cast.full && cast.armed === 'air' && cast.z, 'guest right click casts the armed wand attack (Flame Trail) and arms the next slot', JSON.stringify(cast));
  const gcast = await gp.evaluate(() => ({ fireT: __wands.G.w.fireT > 0, trail: __wands.G.w.zones.some(z => z.kind === 'ftrail'), full: Array.from(document.querySelectorAll('#wandRow .ws.full')).length }));
  ok(gcast.fireT && gcast.trail && gcast.full === 1, 'and the guest sees the trail, his speed buff and the spent slot in the snapshot', JSON.stringify(gcast));
  // Mash (left click) is NOT the roll: it digs a forage spot, and ends Vanishing Puff
  await hp.evaluate(() => { const W = __wands, o = W.WZ.forage.find(q => !q.broken && q.kind !== 'cache'); W.G.w.x = o.x; W.G.w.y = o.y + 0.4; W.G.w.vx = W.G.w.vy = 0; W.G.w.invisT = 3; W.G.w.rollCd = 0; window.__f = o; o.prog = 0; });
  await sleep(500);
  const roll0 = await hp.evaluate(() => __wands.G.stats.dodges + '|' + __wands.G.w.rollCd);
  await gp.mouse.click(760, 440, { button: 'left' }); await sleep(500);
  const mash = await hp.evaluate(() => ({ prog: window.__f.prog, invis: __wands.G.w.invisT, rolling: __wands.G.w.roll > 0, rollCd: __wands.G.w.rollCd }));
  ok(mash.prog > 0 && mash.invis === 0 && !mash.rolling && mash.rollCd === 0, 'guest left click mashes (digs a spot, ends the puff) and never rolls', JSON.stringify(mash));
  await gp.keyboard.press('Space'); await sleep(400);
  const dodged = await hp.evaluate(() => ({ cd: __wands.G.w.rollCd, prog: window.__f.prog }));
  ok(dodged.cd > 0 && dodged.prog <= mash.prog, 'guest Space dodges and never mashes (no dig progress added)', JSON.stringify(dodged));
  await hp.evaluate(() => { __wands.G.w.zones.length = 0; __wands.G.w.fireT = 0; });

  // ---- the guest's right stick aims the Tempest Tear on the host, and the guest sees the fan of droplets
  await gp.evaluate(() => { navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0.9, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }]; });
  await sleep(500);
  const stick = await hp.evaluate(() => [__wands.G.w.sx, __wands.G.w.sy]);
  ok(Math.hypot(stick[0], stick[1]) > 0.5, "the guest's right stick reaches the host's Wizard (aim)", stick.map(v => v.toFixed(2)).join(','));
  await hp.evaluate(() => { const W = __wands; W.G.w.enemies.length = 0; for (let i = 0; i < 3; i++) W.WZ.cast('tempest'); });
  await sleep(700);
  const fan = await gp.evaluate(() => { const w = __wands.G.w, t = w.zones.filter(z => z.kind === 'tear'); return { n: t.length, d: t.map(z => Math.hypot(z.x - w.x, z.y - w.y)) }; });
  ok(fan.n === 3 && fan.d.every(d => d <= 6.05), 'the guest sees three Tempest Tears, each within 6 tiles of him', fan.n + ' tears, ' + fan.d.map(d => d.toFixed(1)).join(','));
  await gp.evaluate(() => { delete navigator.getGamepads; });
  await hp.evaluate(() => { __wands.G.w.zones.length = 0; });
  // ---- the wilds' sound effects reach the guest (G.snd rides in every snapshot): the host makes a zap, a kill and a belt click; the guest hears the first two, once each
  await gp.evaluate(() => { window.__heard = []; const o = AU.sfx; AU.sfx = n => { window.__heard.push(n); return o(n); }; });
  await sleep(300);
  await hp.evaluate(() => { AU.sfx('zap_fire'); AU.sfx('kill'); AU.sfx('place'); });
  await sleep(900);
  const heard = await gp.evaluate(() => { const h = window.__heard; return { zap: h.filter(n => n === 'zap_fire').length, kill: h.filter(n => n === 'kill').length, place: h.filter(n => n === 'place').length }; });
  ok(heard.zap === 1 && heard.kill === 1 && heard.place === 0, "the guest hears the wilds' sounds the host makes (once each) and not the factory's", JSON.stringify(heard));
  // ---- allies are host-sim state: the guest sees them through the snapshot (and they carry the heart marker)
  await hp.evaluate(() => { const W = __wands, a = W.WZ.spawnAlly('pebble'); a.fall = 0; });
  await sleep(700);
  const gal = await gp.evaluate(() => __wands.G.w.allies.map(a => a.type + ':' + a.ally + ':' + Math.round(a.hp)));
  ok(gal.length === 1 && /^pebble:true:/.test(gal[0]), "the guest sees the host's ally (G.w.allies rides the snapshot)", gal.join());
  await hp.evaluate(() => { __wands.G.w.allies.length = 0; });

  // ---- the tree: T opens it on the guest; a purchase is an intent the host validates
  await hp.evaluate(() => { __wands.G.xp = 500; __wands.G.bank.air = 40; __wands.G.bank.water = 40; });
  await sleep(300);
  await gp.keyboard.press('KeyT'); await sleep(300);
  ok(await gp.evaluate(() => __wands.UI.treeOpen.R), 'T opens the Wizard tree on the guest');
  const gtime = await gp.evaluate(() => __wands.G.stats.time); await sleep(1000);
  const gtime2 = await gp.evaluate(() => __wands.G.stats.time);
  ok(gtime2 - gtime > 0.7, 'the game keeps running while the guest has his tree open', (gtime2 - gtime).toFixed(2) + 's passed');
  const hosttree = await hp.evaluate(() => __wands.UI.treeOpen.L);
  const before = await hp.evaluate(() => ({ lv: __wands.G.tree.hearty || 0, xp: __wands.G.xp }));
  await gp.evaluate(() => __wands.UI.buy('hearty'));
  await sleep(700);
  const after = await hp.evaluate(() => ({ lv: __wands.G.tree.hearty || 0, xp: __wands.G.xp }));
  ok(after.lv === before.lv + 1 && after.xp < before.xp, 'a guest purchase is applied by the host', 'Hearty Hat ' + before.lv + ' -> ' + after.lv);
  const glv = await gp.evaluate(() => __wands.G.tree.hearty || 0);
  ok(glv === after.lv, 'and the result reaches the guest in the next snapshot');
  await hp.evaluate(() => { __wands.G.xp = 0; });
  await sleep(300);
  const bad0 = await hp.evaluate(() => __wands.G.tree.hearty);
  await gp.evaluate(() => __wands.UI.buy('hearty')); await sleep(600);
  ok(await hp.evaluate(b => (__wands.G.tree.hearty || 0) === b, bad0), 'an unaffordable purchase is refused by the host');
  const toastTxt = await gp.evaluate(() => Array.from(document.querySelectorAll('#toastR .toast')).map(e => e.textContent).join('|'));
  ok(/Still need/.test(toastTxt), 'and the refusal shows on the guest', toastTxt);
  await gp.keyboard.press('Escape'); await sleep(200);
  ok(!(await gp.evaluate(() => __wands.UI.treeOpen.R)), 'Esc closes it');

  // ---- host: Builder tree open does not freeze the sim; the pause menu neither
  await hp.keyboard.press('KeyT'); await sleep(200);
  const h1 = await hp.evaluate(() => __wands.G.stats.time); await sleep(800);
  const h2 = await hp.evaluate(() => __wands.G.stats.time);
  ok(h2 - h1 > 0.5, 'host tree open: the sim keeps running', (h2 - h1).toFixed(2) + 's');
  await hp.keyboard.press('Escape'); await sleep(200);
  // (since Net v6 either player's pause menu stops the game for both: G.paused = G.pauseBy.host || G.pauseBy.guest, the other screen says who paused)
  await hp.evaluate(() => __wands.Main.pause(true)); await sleep(800);
  const h3 = await hp.evaluate(() => __wands.G.stats.time); await sleep(800);
  const h3b = await hp.evaluate(() => __wands.G.stats.time);
  ok(h3b - h3 < 0.05 && await hp.evaluate(() => __wands.G.paused === true && __wands.G.pauseBy.host === true), 'host pause menu up: the sim is frozen for both (shared pause)', (h3b - h3).toFixed(2) + 's, paused=' + (await hp.evaluate(() => __wands.G.paused)));
  ok(await gp.evaluate(() => !!__wands.G.pauseBy && __wands.G.pauseBy.host === true), 'and the guest sees that the host paused');
  await hp.evaluate(() => __wands.Main.pause(false)); await sleep(800);
  ok(await hp.evaluate(t => __wands.G.stats.time - t > 0.4 && !__wands.G.paused, h3b), 'resuming starts the sim again for both');

  // ---- PIP slider: default 28%, 0 hides it, 45 is the max, local per player
  ok(await hp.evaluate(() => __wands.R.pipRect && Math.abs(__wands.R.pipRect.w - 12 - 1600 * 0.28) < 3), 'host PIP at the default 28% of the width');
  ok(await gp.evaluate(() => __wands.R.pipRect && Math.abs(__wands.R.pipRect.w - 12 - 1600 * 0.28) < 3), 'guest PIP at the default 28% of the width');
  await gp.evaluate(() => { AU.setPip(45); }); await sleep(200);
  ok(await gp.evaluate(() => Math.abs(__wands.R.pipRect.w - 12 - 1600 * 0.45) < 3) && await hp.evaluate(() => Math.abs(__wands.R.pipRect.w - 12 - 1600 * 0.28) < 3), 'guest slider at 45% leaves the host at 28% (not synced)');
  await hp.evaluate(() => AU.setPip(0)); await sleep(200);
  ok(await hp.evaluate(() => __wands.R.pipRect === null), 'host slider at 0% hides his PIP');
  await gp.evaluate(() => AU.setPip(28)); await hp.evaluate(() => AU.setPip(28));
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(800); await hp.screenshot({ path: path.join(SHOTS, 'host.png') }); await gp.screenshot({ path: path.join(SHOTS, 'guest.png') }); }

  // ---- bandwidth in a mid-game factory
  await hp.evaluate(() => { const W = __wands; W.CFG.crafted.cap = W.CFG.crafted._cap; W.G.stock.wood = 99; W.G.stock.stone = 99; W.step(0.05, 400); W.egg('egg_zephyr'); W.egg('egg_puddle'); W.egg('egg_cinder'); W.event(1); W.G.w.hp = 1e6; });   // (the stress is for the snapshot size, not a fight: he cannot die in it)
  await sleep(6000);
  const st = await hp.evaluate(() => { const s = __wands.Net.stats; return { raw: s.rawKB, zip: s.zipKB, max: s.maxZip, kbps: s.kbps, fps: s.fps, total: s.total, snaps: s.snapsOut }; });
  console.log('SNAPSHOT: ' + st.raw.toFixed(0) + ' KB raw JSON, ' + st.zip.toFixed(1) + ' KB deflated (max ' + st.max.toFixed(1) + '), ' + st.fps + ' snapshots/s, ' + st.kbps + ' KB/s out');
  ok(st.fps >= 15, 'snapshot stream near 20 Hz', st.fps + '/s');
  await hp.evaluate(() => { const W = __wands, G = W.G; W.CFG.crafted.cap = 0; if (G.ev && G.ev.active) W.WZ.evFail(); G.w.enemies.length = 0; G.w.allies.length = 0; G.fac.eggQ.length = 0; G.w.hp = W.WZ.maxHp(); });   // (the stress is over: alone again for everything after)
  const ch = await Promise.all([hp, gp].map(p => p.evaluate(() => __wands.Net.stats.chan)));
  ok(process.env.LOSSY0 ? ch.every(c => c === 'reliable') : ch.every(c => c === 'lossy'), 'snapshots travel on the ' + (process.env.LOSSY0 ? 'reliable' : 'unreliable') + ' channel', ch.join(' / '));

  // ---- MOTION=1: how evenly do the things the guest does NOT predict (foes) move on his screen, frame by frame? With a realistic link (JITTER=<ms>, default 30 on top of 20 ms)
  // and without. A "stall" is a frame where a walking foe moved under a third of its usual step (it reads as a dropped frame), a "jump" over twice it.
  if (process.env.MOTION) {
    const motion = async (delay, jitter) => {
      for (const p of [hp, gp]) await p.evaluate(([d, j]) => { __wands.Net.simDelay = d; __wands.Net.simJitter = j; }, [delay, jitter]);
      await hp.evaluate(() => { const W = __wands, w = W.G.w; w.enemies.length = 0; W.CFG.world._cap = W.CFG.world.cap; W.CFG.world.cap = 0; w.hp = 9999;
        for (let i = 0; i < 5; i++) { const a = i * 1.25, e = W.WZ.makeEnemy('slime', w.x + Math.cos(a) * 11, w.y + Math.sin(a) * 11); if (!w.enemies.includes(e)) w.enemies.push(e); } });
      await sleep(900);
      const rec = p => p.evaluate(() => new Promise(res => {
        const gaps = [], steps = []; let last = performance.now(), prev = {}; const t0 = last;
        const f = now => {
          gaps.push(now - last); last = now;
          for (const e of __wands.G.w.enemies) { const p = prev[e.uid]; if (p) steps.push(Math.hypot(e.x - p[0], e.y - p[1]) / Math.max(1, gaps[gaps.length - 1]) * 16.7); prev[e.uid] = [e.x, e.y]; }
          if (now - t0 < 2500) requestAnimationFrame(f); else res({ gaps, steps });
        };
        requestAnimationFrame(f);
      }));
      const [r, rh] = await Promise.all([rec(gp), rec(hp)]);
      await hp.evaluate(() => { const W = __wands; W.CFG.world.cap = W.CFG.world._cap; W.G.w.enemies.length = 0; W.G.w.hp = W.WZ.maxHp(); });
      for (const p of [hp, gp]) await p.evaluate(() => { __wands.Net.simDelay = 0; __wands.Net.simJitter = 0; });
      const stall = x => { const mv = x.steps.filter(v => v > 0.005), md = mv.slice().sort((a, b) => a - b)[mv.length >> 1] || 0; return Math.round(100 * x.steps.filter(v => v < md / 3).length / x.steps.length) + '%'; };
      const g = r.gaps.slice().sort((a, b) => a - b), q = x => +g[Math.min(g.length - 1, Math.floor(g.length * x))].toFixed(1);
      const mv = r.steps.filter(x => x > 0.005), med = mv.slice().sort((a, b) => a - b)[mv.length >> 1] || 0;
      return { frames: g.length, gap_p50: q(0.5), gap_p95: q(0.95), gap_p99: q(0.99), gap_max: +g[g.length - 1].toFixed(1), stalls: Math.round(100 * r.steps.filter(x => x < med / 3).length / r.steps.length) + '%', jumps: Math.round(100 * r.steps.filter(x => x > med * 2).length / r.steps.length) + '%', host_stalls: stall(rh) };
    };
    if (+process.env.THROTTLE > 1) for (const p of [hp, gp]) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.THROTTLE }); }
    console.log('MOTION clean link     ' + JSON.stringify(await motion(0, 0)));
    console.log('MOTION 20 + ' + (+process.env.JITTER || 30) + ' ms jitter ' + JSON.stringify(await motion(20, +process.env.JITTER || 30)));
    if (+process.env.THROTTLE > 1) for (const p of [hp, gp]) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); }
  }

  // ---- PROFILE=1 (THROTTLE=<n> slows both pages' CPU n times, like a weaker laptop): where each side's frame time goes, mid-game
  if (process.env.PROFILE) {
    if (+process.env.THROTTLE > 1) for (const p of [hp, gp]) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.THROTTLE }); }
    const prof = async p => p.evaluate(() => new Promise(res => {
      const P = {}, W = window.__wands, orig = [];
      const wrap = (o, k, tag) => { const f = o[k]; orig.push([o, k, f]); o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { P[tag] = (P[tag] || 0) + performance.now() - t; } }; };
      wrap(W.R, 'drawWorld', 'drawWorld (incl. a pip)'); wrap(W.R, 'drawFactory', 'drawFactory (incl. a pip)'); wrap(W.R, 'drawPip', 'drawPip'); wrap(W.UI, 'updateHud', 'updateHud');
      wrap(W.Snap, 'wire', 'Snap.wire'); wrap(JSON, 'parse', 'JSON.parse'); wrap(W.Main, 'tween', 'tween');
      if (W.Main.predSnap) { wrap(W.Main, 'predSnap', 'predSnap'); wrap(W.Main, 'predictFrame', 'predictFrame'); }
      if (W.Main.step) wrap(W.Main, 'step', 'Main.step (sim)');
      let n = 0, last = performance.now(), gaps = [];
      const t0 = performance.now(), tick = now => { n++; gaps.push(now - last); last = now; if (now - t0 < 4000) requestAnimationFrame(tick); else { for (const [o, k, f] of orig) o[k] = f; gaps.sort((a, b) => a - b); const out = { fps: +(n / ((now - t0) / 1000)).toFixed(1), frameMs_median: +gaps[gaps.length >> 1].toFixed(1), frameMs_p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1) }; for (const k in P) out[k + ' ms/frame'] = +(P[k] / n).toFixed(2); res(out); } };
      requestAnimationFrame(tick);
    }));
    await gp.keyboard.down('KeyD');
    const cpu = await gp.context().newCDPSession(gp);
    await cpu.send('Profiler.enable'); await cpu.send('Profiler.start');
    const [ph, pg] = await Promise.all([prof(hp), prof(gp)]);
    const { profile } = await cpu.send('Profiler.stop');
    await gp.keyboard.up('KeyD');
    // the guest's CPU time by function (self time, top 22)
    const self = {}, byId = {}, dt = {};
    for (const nd of profile.nodes) byId[nd.id] = nd;
    for (let i = 0; i < profile.samples.length; i++) dt[profile.samples[i]] = (dt[profile.samples[i]] || 0) + (profile.timeDeltas[i] || 0);
    for (const id in dt) { const cf = byId[id].callFrame, k = (cf.functionName || '(anon)') + ' ' + (cf.url.split('/').pop() || '') + ':' + (cf.lineNumber + 1); self[k] = (self[k] || 0) + dt[id] / 1000; }
    const tot = Object.values(self).reduce((a, b) => a + b, 0);
    console.log('GUEST CPU (self ms of ' + tot.toFixed(0) + '):\n' + Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => '  ' + v.toFixed(0).padStart(6) + '  ' + k).join('\n'));
    console.log('PROFILE host  ' + JSON.stringify(ph));
    console.log('PROFILE guest ' + JSON.stringify(pg));
    if (+process.env.THROTTLE > 1) for (const p of [hp, gp]) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); }
  }

  // ---- a lossy link (simulated: each packet lost with 10% chance, a snapshot is several packets): the guest keeps getting pictures, reports the loss, and recovers
  if (!process.env.LOSSY0) {
    await hp.evaluate(() => { __wands.Net.simLoss = 0.1; }); await sleep(4500);
    const ls = await gp.evaluate(() => { const s = __wands.Net.stats; return { loss: s.loss, pics: s.fps, draw: s.draw }; });
    await hp.evaluate(() => { __wands.Net.simLoss = 0; }); await sleep(2500);
    const ok2 = await gp.evaluate(() => { const s = __wands.Net.stats; return { loss: s.loss, pics: s.fps }; });
    ok(ls.loss > 15 && ls.pics >= 3 && ls.draw >= 20, 'on a simulated lossy link the guest keeps drawing, gets some pictures and reports the loss', JSON.stringify(ls));
    ok(ok2.loss < 15 && ok2.pics >= 15, 'and recovers when the link does', JSON.stringify(ok2));
  }

  // ---- the architecture guardrails with a session live: the wire format is the audit serializer's clone, and the photo test passes on the host AND on the guest
  ok(await hp.evaluate(() => JSON.stringify(__wands.Snap.capture().G) === __wands.Snap.wire()), 'Snap.wire() equals Snap.capture().G (the same clone the photo test audits)');
  for (const [name, pg] of [['host', hp], ['guest', gp]]) {   // (repeated: a pixel difference that only shows now and then is still a leak)
    let worst = null;
    for (let i = 0; i < (+process.env.SNAPS || 12); i++) {
      const r = await pg.evaluate(() => { __wands.snapshot(); const R = __wands.Snap.report; return { v: R.verdict, newLeaks: R.leaks.filter(l => !l.known).map(l => l.id), newIssues: R.issues.filter(i => !i.known).map(i => i.id), px: R.diff.px, bbox: R.diff.bbox }; });
      if (!worst || r.px > worst.px || r.newLeaks.length || r.newIssues.length) worst = r;
      if (r.px > 0 && SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); for (const m of ['diff', 'snap', 'live']) { await pg.evaluate(m => __wands.snapView(m), m); await sleep(300); await pg.screenshot({ path: path.join(SHOTS, 'photo_' + name + '_' + m + '.png') }); } }
      await sleep(120);
    }
    const r = worst;
    ok(r.v !== 'FAIL' && !r.newLeaks.length && !r.newIssues.length && r.px === 0, 'snapshot photo test on the ' + name + ' with the session live: ' + r.v, r.newLeaks.concat(r.newIssues).join(',') + (r.px ? ' px=' + r.px + ' bbox=' + JSON.stringify(r.bbox) : ''));
  }
  await sleep(500);

  // ---- soak
  if (SOAK) {
    console.log('soak ' + SOAK + 's ...');
    await hp.evaluate(() => { const W = __wands; W.G.w.hp = W.WZ.maxHp(); W.G.w.enemies.length = 0; });   // (the live session: the functional checks above left it running)
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'], end = Date.now() + SOAK * 1000;
    let down = null, n = 0;
    while (Date.now() < end) {
      if (down) await gp.keyboard.up(down);
      down = keys[Math.floor(Math.random() * 4)]; await gp.keyboard.down(down);
      if (Math.random() < 0.5) await gp.keyboard.press('Space');
      const wq = Math.random();   // the wand's buttons on the guest's keyboard: Q cycle, right click cast, left click mash
      if (wq < 0.2) await gp.keyboard.press('KeyQ'); else if (wq < 0.5) await gp.mouse.click(760, 440, { button: 'right' }); else if (wq < 0.62) await gp.mouse.click(760, 440, { button: 'left' });
      if (n++ % 12 === 0) await hp.evaluate(() => { const W = __wands; for (const k of ['fire', 'air', 'water', 'earth', 'flamethrower', 'tempest', 'nova', 'thunder']) W.deliver(k); if (W.G.w.dead) W.WZ.reenter(); });
      if (n % 40 === 0) await hp.evaluate(() => { const W = __wands; W.G.w.hp = W.WZ.maxHp(); });
      await sleep(700);
    }
    if (down) await gp.keyboard.up(down);
    const rep = await hp.evaluate(() => { const s = __wands.Net.stats; return { total: s.total / 1048576, raw: s.rawKB, zip: s.zipKB, max: s.maxZip, kbps: s.kbps, time: __wands.G.stats.time }; });
    const wandOk = await Promise.all([hp, gp].map(p => p.evaluate(() => { const g = __wands.G.wand, need = __wands.CFG.wand.need; return ['air', 'water', 'fire', 'earth'].every(e => g.m[e] >= 0 && g.m[e] <= need[e] && (!g.full[e] || g.m[e] === need[e])) && (g.armed === null || g.full[g.armed]) ? __wands.G.stats.wands || 0 : -1; })));
    ok(wandOk[0] >= 0 && wandOk[1] >= 0, 'the wand stayed legal on both sides through the soak (' + wandOk[0] + ' casts)');
    console.log('SOAK: ' + rep.time.toFixed(0) + 's of play, ' + rep.total.toFixed(1) + ' MB sent, last snapshot ' + rep.raw.toFixed(0) + ' KB -> ' + rep.zip.toFixed(1) + ' KB (max ' + rep.max.toFixed(1) + '), ' + rep.kbps + ' KB/s');
  }


  // ---- disconnect: freeze + rejoin inside the window
  await gp.evaluate(() => __wands.Net.conn.close());
  await hp.waitForFunction(() => __wands.Net.state === 'lost', null, { timeout: 15000 });
  ok(await hp.evaluate(() => !document.getElementById('netBanner').classList.contains('hidden')), 'host shows the waiting-for-rejoin banner');
  const f1 = await hp.evaluate(() => __wands.G.stats.time); await sleep(1500);
  const f2 = await hp.evaluate(() => __wands.G.stats.time);
  ok(Math.abs(f2 - f1) < 0.05, 'host sim is frozen while the guest is away');
  ok(await gp.evaluate(() => !document.getElementById('netBanner').classList.contains('hidden') && /CONNECTION LOST/.test(document.getElementById('netBanner').textContent)), 'guest shows CONNECTION LOST with a Rejoin button');
  await jc(gp, '#nbRejoin');
  await gp.waitForFunction(() => __wands.Net.state === 'live', null, { timeout: 30000 });
  await sleep(1500);
  const f3 = await hp.evaluate(() => __wands.G.stats.time);
  ok(f3 - f2 > 0.8, 'the same code rejoins: the host resumes', (f3 - f2).toFixed(2) + 's');
  const gt = await gp.evaluate(() => __wands.G.stats.time);
  ok(Math.abs(gt - f3) < 1.5, 'and the guest has a fresh full snapshot');
  // a stranger is turned away once the room is locked
  const X = await boot(browser, 'stranger');
  await typeCode(X.page, code);
  await X.page.waitForFunction(() => { const t = __wands.G.menu && __wands.G.menu.typing; return t && /second player|version/.test(t.msg); }, null, { timeout: 30000 }).catch(() => {});
  ok(await X.page.evaluate(() => /second player/.test(__wands.G.menu.typing.msg)), 'a third page with the same code is refused (room locked to the first guest)');
  await X.ctx.close();

  // ---- the timeout: after the window the host is at the title with the save intact
  await hp.evaluate(() => { __wands.Net.REJOIN_MS = 4000; });
  await gp.evaluate(() => __wands.Net.conn.close());
  await hp.waitForFunction(() => __wands.Net.state === 'lost', null, { timeout: 15000 });
  await hp.waitForFunction(() => __wands.G && __wands.G.menu, null, { timeout: 30000 });
  ok(true, 'after the window the host is back at the title screen (the menu world)');
  ok(await hp.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('wands2_save_slot1')); return !!s && s.v >= 4 && s.stats.time > 5; } catch (e) { return false; } }), 'and the run\'s save is intact');
  ok(await hp.evaluate(() => __wands.Net.role === null && !__wands.Net.on), 'host Net state reset');

  const all = H.errs.concat(Gu.errs);
  ok(all.length === 0, 'no page errors on either side', all.slice(0, 5).join(' // '));
  await browser.close();
  console.log(fails ? 'NET TEST: ' + fails + ' FAILED' : 'NET TEST: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
