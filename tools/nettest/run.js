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
const URL = 'file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/');
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
  await stepOn(hp, 'B', 'go:online'); await stepOn(hp, 'B', 'go:create'); await stepOn(hp, 'B', 'slot:1', 500);
  await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.online && __wands.G.menu.online.code, null, { timeout: 30000 });
  return hp.evaluate(() => __wands.G.menu.online.code);
};
const typeCode = async (gp, code) => {   // the keyboard prop: walk up, E, type, Enter
  await press(gp, 'KeyD');
  await stepOn(gp, 'B', 'go:online'); await stepOn(gp, 'B', 'go:join', 1500);
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
  // Space = roll
  await hp.evaluate(() => { __wands.G.w.rollCd = 0; });
  await gp.keyboard.down('KeyA'); await gp.keyboard.press('Space'); await gp.keyboard.up('KeyA');
  await sleep(500);
  const rolled = await hp.evaluate(() => __wands.G.w.rollCd > 0 || __wands.G.w.roll > 0);
  ok(rolled, 'guest Space rolls the Wizard (edge latched through the 30 Hz packets)');
  // E = fire the held spell (needs the slot: set it up on the host)
  await hp.evaluate(() => { const W = __wands; W.G.flags.glow = true; W.G.hold.on = true; W.G.hold.spell = 'flamethrower'; });
  await sleep(300);
  await gp.keyboard.press('KeyE'); await sleep(600);
  const held = await hp.evaluate(() => __wands.G.hold.spell);
  ok(held === null, 'guest E fires the held spell', 'slot now ' + held);

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
  await hp.evaluate(() => __wands.Main.pause(true)); await sleep(800);
  const h3 = await hp.evaluate(() => __wands.G.stats.time);
  ok(h3 - h2 > 0.9 && !(await hp.evaluate(() => __wands.G.paused)), 'host pause menu up: sim not frozen, G.paused stays false');
  await hp.evaluate(() => __wands.Main.pause(false));

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
  await hp.evaluate(() => { const W = __wands; W.G.stock.wood = 99; W.G.stock.stone = 99; W.step(0.05, 400); W.egg('egg_zephyr'); W.egg('egg_puddle'); W.egg('egg_cinder'); W.event(1); });
  await sleep(6000);
  const st = await hp.evaluate(() => { const s = __wands.Net.stats; return { raw: s.rawKB, zip: s.zipKB, max: s.maxZip, kbps: s.kbps, fps: s.fps, total: s.total, snaps: s.snapsOut }; });
  console.log('SNAPSHOT: ' + st.raw.toFixed(0) + ' KB raw JSON, ' + st.zip.toFixed(1) + ' KB deflated (max ' + st.max.toFixed(1) + '), ' + st.fps + ' snapshots/s, ' + st.kbps + ' KB/s out');
  ok(st.fps >= 15, 'snapshot stream near 20 Hz', st.fps + '/s');

  // ---- the architecture guardrails with a session live: the wire format is the audit serializer's clone, and the photo test passes on the host AND on the guest
  ok(await hp.evaluate(() => JSON.stringify(__wands.Snap.capture().G) === __wands.Snap.wire()), 'Snap.wire() equals Snap.capture().G (the same clone the photo test audits)');
  for (const [name, pg] of [['host', hp], ['guest', gp]]) {
    const r = await pg.evaluate(() => { __wands.snapshot(); const R = __wands.Snap.report; return { v: R.verdict, newLeaks: R.leaks.filter(l => !l.known).map(l => l.id), newIssues: R.issues.filter(i => !i.known).map(i => i.id), px: R.diff.px }; });
    ok(r.v !== 'FAIL' && !r.newLeaks.length && !r.newIssues.length && r.px === 0, 'snapshot photo test on the ' + name + ' with the session live: ' + r.v, r.newLeaks.concat(r.newIssues).join(','));
  }
  await sleep(500);

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

  // ---- soak
  if (SOAK) {
    console.log('soak ' + SOAK + 's ...');
    // fresh session
    await sleep(1500);
    const c2 = await hostCreate(hp);
    await gp.evaluate(() => { __wands.Main.toTitle(true); });
    await gp.waitForFunction(() => __wands.G && __wands.G.menu, null, { timeout: 30000 }); await sleep(1500);
    await typeCode(gp, c2);
    await hp.waitForFunction(() => __wands.G.menu && __wands.G.menu.page === 'cs' && __wands.Net.state === 'live', null, { timeout: 60000 });
    await readyUp(hp);
    await hp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && !__wands.G.intro, null, { timeout: 60000 });
    await gp.waitForFunction(() => __wands.Net.on && __wands.G && !__wands.G.menu && __wands.G.w, null, { timeout: 40000 });
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'], end = Date.now() + SOAK * 1000;
    let down = null, n = 0;
    while (Date.now() < end) {
      if (down) await gp.keyboard.up(down);
      down = keys[Math.floor(Math.random() * 4)]; await gp.keyboard.down(down);
      if (Math.random() < 0.5) await gp.keyboard.press('Space');
      if (n++ % 12 === 0) await hp.evaluate(() => { const W = __wands; for (const k of ['fire', 'air', 'water', 'earth']) W.deliver(k); if (W.G.w.dead) W.WZ.reenter(); });
      if (n % 40 === 0) await hp.evaluate(() => { const W = __wands; W.G.w.hp = W.WZ.maxHp(); });
      await sleep(700);
    }
    if (down) await gp.keyboard.up(down);
    const rep = await hp.evaluate(() => { const s = __wands.Net.stats; return { total: s.total / 1048576, raw: s.rawKB, zip: s.zipKB, max: s.maxZip, kbps: s.kbps, time: __wands.G.stats.time }; });
    console.log('SOAK: ' + rep.time.toFixed(0) + 's of play, ' + rep.total.toFixed(1) + ' MB sent, last snapshot ' + rep.raw.toFixed(0) + ' KB -> ' + rep.zip.toFixed(1) + ' KB (max ' + rep.max.toFixed(1) + '), ' + rep.kbps + ' KB/s');
  }

  const all = H.errs.concat(Gu.errs);
  ok(all.length === 0, 'no page errors on either side', all.slice(0, 5).join(' // '));
  await browser.close();
  console.log(fails ? 'NET TEST: ' + fails + ' FAILED' : 'NET TEST: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
