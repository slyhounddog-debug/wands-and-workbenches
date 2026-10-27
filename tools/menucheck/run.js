'use strict';
// The front door's acceptance run (headless): the living menu world (js/menu.js), offline. It walks the real game through boot > every menu > a new game's start sequence >
// a finished building's puff > the way back to the menu, with real key presses and mouse clicks where the game reads them, and the characters put on plates through the
// __wands hooks where walking there would only make the run slow.
//   node tools/menucheck/run.js            (needs playwright-core and Edge: PLAYWRIGHT_CORE=<path to playwright-core> if it is not resolvable)
//   SHOTS=<dir> node ...                   also saves a screenshot of every stage
// The online half (typing a room code at the keyboard prop, the lobby, the fade) is tools/nettest/run.js (it needs the internet).
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.env.SHOTS || '';
const URL = 'file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/');
let fails = 0;
const ok = (c, msg, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra !== undefined ? '  ' + extra : '')); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  const ev = f => page.evaluate(f);
  const key = async k => { await page.keyboard.down(k); await sleep(80); await page.keyboard.up(k); };
  const frames = (t0, dt) => page.waitForFunction(([t0, dt]) => { const m = __wands.G.menu; return !m || m.t > t0 + dt; }, [t0, dt], { timeout: 20000 });
  // park a character off the plates, wait for frames, put it on the plate: that is a step-on
  const stepOn = async (role, act, wait) => {
    const t0 = await page.evaluate(role => { const G = __wands.G, c = G.menu.tc, x = c.x + (role === 'B' ? 0.5 : -0.5), y = c.y + 1.0; if (role === 'B') { G.bd.x = x - 80; G.bd.y = y - 80; G.bd.vx = G.bd.vy = 0; } else { G.w.x = x; G.w.y = y; } return G.menu.t; }, role);
    await frames(t0, 0.3);
    const r = await page.evaluate(([role, act]) => { const G = __wands.G, q = G.menu.plates.find(x => x.act === act || x.key === act); if (!q) return 'noplate ' + act; if (role === 'B') { G.bd.x = q.x - 80; G.bd.y = q.y - 80; } else { G.w.x = q.x; G.w.y = q.y; } return 'ok'; }, [role, act]);
    if (r !== 'ok') throw new Error(r);
    await sleep(wait || 1300);
  };
  const pageOf = () => ev(() => __wands.G.menu && __wands.G.menu.page);
  const plates = () => ev(() => __wands.G.menu.plates.map(p => p.act).join(','));

  // ---- 1. boot: loading -> intro -> the menu world
  await page.goto(URL);
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  ok(await ev(() => !document.getElementById('menu') && !document.getElementById('players')), 'no DOM menu or player-select exists any more');
  await sleep(800); await page.mouse.click(400, 300); await sleep(300);
  ok(await page.waitForFunction(() => !document.getElementById('studio-intro').classList.contains('hidden'), null, { timeout: 8000 }).then(() => true, () => false), 'a click on the loading screen starts the studio intro (unchanged)');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu && __wands.G.menu.plates.length >= 5, null, { timeout: 20000 });
  await sleep(1500); await shot('01_menu');
  ok(await ev(() => __wands.G.menu.page === 'main' && !!__wands.G.bd && !!__wands.G.w), 'after the intro: the menu world, both characters in it');
  ok((await plates()) === 'go:new,go:load,go:online,doc:howto,go:ach,go:settings', 'the main set: New, Load, Online, How to Play, Achievements, Settings beside them (no Controls: that lives in the pause menu; nothing in the right corner)', await plates());
  const b0 = await ev(() => { const m = __wands.G.menu, a = __wands.menu.idleBob('B'), b = __wands.menu.idleBob('W'); return { conn: m.conn, a: a && a.rot, b: b && b.rot }; });
  await sleep(400);
  const b1 = await ev(() => { const a = __wands.menu.idleBob('B'), b = __wands.menu.idleBob('W'); return { a: a && a.rot, b: b && b.rot }; });
  ok(!b0.conn.B && !b0.conn.W && b0.a !== null && b0.b !== null && b0.a !== b1.a && b0.b !== b1.b, 'with nobody connected both characters idle, bobbing back and forth on the spot', JSON.stringify([b0.a, b1.a]));
  await key('KeyD');
  ok(await ev(() => __wands.G.menu.conn.B && !__wands.G.menu.conn.W && __wands.menu.idleBob('B') === null && __wands.menu.idleBob('W') !== null), 'a key press connects only that player: the other keeps bobbing');
  await key('ArrowRight');
  ok(await ev(() => __wands.G.menu.conn.W && __wands.menu.idleBob('W') === null), 'and the arrows connect the Wizard');
  // the belt delivers, the Builder picks and throws with the real mouse, the spell fires on the Wizard with its name toasted and no damage
  await page.waitForFunction(() => { const e = __wands.G.fac.belts.find(b => b.y === 17); return e && e.item && e.item.prog >= 1; }, null, { timeout: 30000 });
  const st = await ev(() => { const W = __wands, G = W.G, e = G.fac.belts.find(b => b.y === 17), v = Object.assign({}, W.R.wv), s = W.R.toScreen(v, e.x + 80 + 0.5, e.y + 80 + 0.5), p = G.fac.pp, sp = W.R.toScreen(v, p.x + 80 + 0.5, p.y + 80 + 1); return { kind: e.item.kind, bx: s[0], by: s[1], px: sp[0], py: sp[1] }; });
  ok(true, 'the spell belt line has brought in a spell', st.kind);
  await ev(() => { const G = __wands.G; G.bd.x = 16.4; G.bd.y = 17.4; G.w.x = 98.5; G.w.y = 100.5; G.w.fx = -1; G.w.fy = 1; });   // (the Wizard waits down at the bottom: a spell's reach would press the safe plates near him)
  await sleep(400);
  await page.mouse.move(st.bx * 0.8, (st.by - 6) * 0.8); await sleep(100);
  await page.mouse.click(st.bx * 0.8, (st.by - 6) * 0.8); await sleep(600);
  ok(await ev(() => __wands.G.hands.length === 1), 'the Builder picks the spell off the belt (left click)');
  await page.mouse.move(st.px * 0.8, (st.py - 12) * 0.8); await sleep(100);
  await page.mouse.down({ button: 'right' }); await sleep(100); await page.mouse.up({ button: 'right' });
  let named = '', hpMin = 100;
  for (let i = 0; i < 24 && !named; i++) { await sleep(250); const r = await ev(() => ({ t: __wands.G.menu.toasts.map(x => x.text).join('|'), hp: __wands.G.w.hp })); named = r.t; hpMin = Math.min(hpMin, r.hp); }
  ok(!!named, 'the thrown spell fires on the Wizard and its name is toasted', named);
  ok(hpMin === 100 && await ev(() => !__wands.G.w.dead), 'nobody takes damage in the menu world');
  await shot('02_spell');
  await sleep(2500);
  await ev(() => { const m = __wands.G.menu; m.stack.length = 0; if (m.page !== 'main') __wands.menu.show('main'); });   // (a spell that flew over a safe plate may have pressed it: that is allowed, go home)
  await sleep(1500);
  // the Builder can throw a spell straight at the Wizard (a tile of grace): it fires on him with its lead-in, without the Spell Portal's flight; further off it is just thrown on the floor
  const throwAt = async (dx, dy) => {
    await ev(() => { const W = __wands, G = W.G; G.bd.x = 21.0; G.bd.y = 17.0; G.bd.vx = G.bd.vy = 0; G.bd.target = null; G.w.x = 103.6; G.w.y = 99.0; G.w.fx = -1; G.w.fy = 1; G.hands.length = 0; G.fac.floor.length = 0; G.menu.toasts.length = 0; G.bd.throwCd = 0; W.FA.addHands('water', 1); });
    await sleep(300);
    const p = await page.evaluate(([dx, dy]) => { const W = __wands, G = W.G, s = W.R.toScreen(Object.assign({}, W.R.wv), G.w.x + dx, G.w.y + dy); return [s[0], s[1]]; }, [dx, dy]);
    await page.mouse.move(p[0] * 0.8, p[1] * 0.8); await sleep(150);
    await page.mouse.down({ button: 'right' }); await sleep(100); await page.mouse.up({ button: 'right' });
    let seen = { drop: 0 };
    for (let i = 0; i < 10; i++) { await sleep(60); seen = await ev(() => { const G = __wands.G; return { drop: G.w.fx_.filter(f => f.type === 'drop').length, sucks: G.fac.sucks.length, arcs: G.w.arcs.length, hands: G.hands.length }; }); if (seen.drop) break; }
    await sleep(1500);
    seen.toast = await ev(() => __wands.G.menu.toasts.map(t => t.text).join('|'));
    seen.floor = await ev(() => __wands.G.fac.floor.length + __wands.G.fac.flying.length);
    return seen;
  };
  const hit1 = await throwAt(0.6, 0.4);
  ok(hit1.drop > 0 && hit1.hands === 0 && hit1.sucks === 0 && hit1.arcs === 0 && !!hit1.toast, 'a spell thrown within a tile of the Wizard fires on him: the drop-in lead, the name toasted, no Spell Portal flight', JSON.stringify(hit1));
  const hit2 = await throwAt(2.6, 2.0);
  ok(hit2.drop === 0 && !hit2.toast && hit2.floor > 0, 'thrown further than a tile off him, it is just a spell on the floor (the Wizard picks nothing up)', JSON.stringify(hit2));
  await ev(() => { const G = __wands.G; G.fac.floor.length = 0; G.hands.length = 0; });

  // ---- 2. walk every menu
  await stepOn('B', 'go:new'); await shot('03_new');
  ok((await pageOf()) === 'slots' && (await plates()).split(',').filter(a => /^slot:/.test(a)).length === 3, 'New Game: three slot plates pop in (and the main set popped out)');
  ok(await ev(() => __wands.G.menu.modals.filter(m => m.kind === 'slot').length === 3), 'each slot plate has its hovering summary window');
  await stepOn('B', 'slot:1', 4500); await shot('04_charselect');
  ok((await pageOf()) === 'cs', 'an empty slot goes straight to the character select');
  await stepOn('B', 'back', 1500);
  ok((await pageOf()) === 'slots', 'its Back plate goes back to the slot plates');
  await stepOn('B', 'back', 1500);
  ok((await pageOf()) === 'main', 'and Back again to the main set');
  // a plate that pops in under a character does not trigger until that character steps off and on
  const dorm = await ev(async () => {
    const W = __wands, m = W.G.menu, G = W.G;
    m.flow = 'new'; W.menu.go('slots');
    const q = m.plates.find(p => p.key === 'slot2' && p.st === 'wait');   // the slot-2 plate is about to pop in: put the Builder exactly there
    G.bd.x = q.x - 80; G.bd.y = q.y - 80; G.bd.vx = G.bd.vy = 0;
    await new Promise(r => setTimeout(r, 1400));
    const stayed = m.page;
    G.bd.x = q.x - 80 + 3; await new Promise(r => setTimeout(r, 500));
    G.bd.x = q.x - 80; G.bd.y = q.y - 80; await new Promise(r => setTimeout(r, 900));
    return { stayed, after: m.page };
  });
  ok(dorm.stayed === 'slots' && dorm.after === 'cs', 'a plate that popped in under a character stays dormant until they step off and on again', dorm.stayed + ' -> ' + dorm.after);
  await stepOn('B', 'back', 1500); await stepOn('B', 'back', 1500);
  // a spell's reach presses no plate, safe or not: only a character standing on one does
  const sp1 = await ev(() => { const m = __wands.G.menu, p = m.plates.find(q => q.act === 'go:new'); __wands.menu.touch(p.x, p.y, 2.5); return m.page; });
  ok(sp1 === 'main', 'a spell landing on the New Game plate does not press it');
  const sp2 = await ev(() => { const m = __wands.G.menu, p = m.plates.find(q => q.act === 'doc:howto'); __wands.menu.touch(p.x, p.y, 0.5); return m.page + '/' + m.modals.length; });
  ok(sp2 === 'main/0', 'a spell landing on the How to Play plate does not press it either', sp2);
  await stepOn('W', 'doc:howto', 1600); await shot('05_howto');
  ok(await ev(() => __wands.G.menu.modals.some(m => m.kind === 'doc' && m.t > 0.9)), 'the How to Play text is a window hovering over its plate');
  await stepOn('W', 'pg:1', 700); ok(await ev(() => __wands.G.menu.doc.pg === 1), 'the NEXT plate turns the page');
  await stepOn('W', 'back', 1300);
  ok((await pageOf()) === 'main' && await ev(() => !__wands.G.menu.modals.length), 'stepping on the Back plate: the window is gone and the main set is back');
  ok(!(await plates()).includes('doc:controls'), 'there is no Controls plate in the start menu (the controls are in the pause menu)');
  await stepOn('W', 'go:ach', 1300); await stepOn('W', 'ach:0', 1200); await shot('07_ach');
  ok(await ev(() => __wands.G.menu.modals.some(m => m.kind === 'ach' && m.page === 0)), 'Achievements: the first page is a window above its plate');
  await stepOn('W', 'ach:1', 1200);
  ok(await ev(() => __wands.G.menu.modals.some(m => m.kind === 'ach' && m.page === 1 && !m.out)), 'and the second plate shows the second page');
  await stepOn('W', 'back', 1300);
  await stepOn('W', 'go:online', 1300); ok((await plates()).includes('go:create') && (await plates()).includes('go:join'), 'Online: Create and Join plates');
  await stepOn('B', 'go:join', 1500); await shot('08_join');
  ok(await ev(() => !!__wands.G.menu.kb), 'Join Game: a keyboard building pops up in the world');
  await ev(() => { const G = __wands.G, k = G.menu.kb; G.bd.x = k.x - 80 + 1.2; G.bd.y = k.y - 80 + 0.2; });
  await sleep(500); await key('KeyE'); await sleep(300);
  ok(await ev(() => !!__wands.G.menu.typing), 'walking up to it and pressing E starts typing');
  for (const ch of 'KVPB6X') await page.keyboard.press(/[0-9]/.test(ch) ? 'Digit' + ch : 'Key' + ch);
  await sleep(300);
  ok(await ev(() => __wands.G.menu.typing.code === 'KVPB6X'), 'the real keyboard types the room code into its window');
  await page.keyboard.press('Backspace'); await sleep(200);
  ok(await ev(() => __wands.G.menu.typing.code === 'KVPB6'), 'Backspace edits it');
  await key('KeyE'); await sleep(300);
  ok(await ev(() => !__wands.G.menu.typing), 'E cancels cleanly mid-typing');
  ok(await ev(() => { const N = __wands.Net; for (let i = 0; i < 200; i++) if (/[E0O1IL]/.test(N.makeCode())) return false; return true; }), '200 generated room codes never contain E (nor 0 O 1 I L)');
  await stepOn('B', 'back', 1500); await stepOn('B', 'back', 1500);

  // ---- 3. settings: the volume staircases
  await stepOn('W', 'go:settings', 1500); await shot('09_settings');
  ok((await plates()).split(',').filter(a => /^vol:sfx:/.test(a)).length === 8 && (await plates()).split(',').filter(a => /^vol:music:/.test(a)).length === 8, 'Settings: two rows of 8 steppable slots');
  await stepOn('B', 'vol:sfx:3', 700); await stepOn('B', 'vol:music:5', 700);
  const set = await ev(() => JSON.parse(localStorage.getItem('wands_settings')));
  ok(Math.abs(set.sfx - 3 / 7) < 1e-6 && Math.abs(set.music - 5 / 7) < 1e-6, 'stepping a slot sets that volume (3/7 sound, 5/7 music)', JSON.stringify(set));
  await stepOn('B', 'vol:sfx:0', 700);
  ok(await ev(() => __wands.G.menu && JSON.parse(localStorage.getItem('wands_settings')).sfx === 0), 'the leftmost slot is mute');
  await stepOn('B', 'vol:sfx:7', 700);
  ok(await ev(() => JSON.parse(localStorage.getItem('wands_settings')).sfx === 1), 'the rightmost slot is full');
  await stepOn('B', 'vol:sfx:3', 700);
  await page.reload(); await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  ok(await ev(() => { const s = JSON.parse(localStorage.getItem('wands_settings')); return Math.abs(s.sfx - 3 / 7) < 1e-6 && Math.abs(AU.settings.sfx - 3 / 7) < 1e-6; }), 'the settings persist across a reload', await ev(() => localStorage.getItem('wands_settings')));
  await page.mouse.click(400, 300); await sleep(300); await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu && __wands.G.menu.plates.length >= 5, null, { timeout: 20000 });
  await sleep(1200);

  // ---- 4. a save to overwrite / load: slot 3
  await ev(() => { __wands.start(3); __wands.UI.help(false); __wands.G.helpT = 0; __wands.step(0.05, 60); __wands.G.xp = 77; __wands.Main.save(); __wands.Main.toTitle(true); });
  await sleep(2200); await key('KeyD'); await key('ArrowRight');
  await stepOn('B', 'go:load', 1500);
  const lines = await ev(() => __wands.G.menu.modals.filter(m => m.kind === 'slot').map(m => m.empty ? 'empty' : m.lines.join('/')));
  ok(lines[0] === 'empty' && lines[2] !== 'empty' && /77 XP/.test(lines[2]), 'Load: the slot windows say empty / the slot\'s summary', lines.join(' | '));
  await stepOn('B', 'slot:1', 700);
  ok((await pageOf()) === 'slots', 'Load on an empty slot does nothing');
  await stepOn('B', 'back', 1500); await stepOn('B', 'go:new', 1500);
  await stepOn('B', 'slot:3', 1800); await shot('10_confirm');
  ok((await pageOf()) === 'confirm' && (await plates()) === 'ok,back', 'New Game on a filled slot raises a confirmation with Overwrite / Cancel plates');
  await stepOn('B', 'back', 1500);
  ok((await pageOf()) === 'slots' && await ev(() => JSON.parse(localStorage.getItem('wands2_save_slot3')).xp === 77), 'Cancel goes back and the save is untouched');
  await stepOn('B', 'back', 1500);

  // ---- 5. character select: no demo, cosmetics on the plates, the statue swap
  await stepOn('B', 'go:new'); await stepOn('B', 'slot:1', 4500);
  ok(await ev(() => !document.getElementById('players') && !document.querySelector('canvas.pv') && __wands.G.menu.page === 'cs'), 'the character select has no demo / sim preview: the characters in the world are the preview');
  const before = await ev(() => JSON.stringify(JSON.parse(localStorage.getItem('wands_profile') || '{"look":{"builder":{}}}').look.builder));
  await ev(() => { const m = __wands.G.menu, q = m.plates.find(p => p.role === 'B' && p.data.cat === 'skin' && p.data.opt === 'tan'); const G = __wands.G; G.bd.x = q.x - 80 + 3; G.bd.y = q.y - 80; });
  await sleep(500);
  const spr0 = await ev(() => __wands.G && document.createElement('canvas') && SP.builder.c.toDataURL().length);
  const h0 = await ev(() => SP.builder.c.toDataURL());
  await ev(() => { const m = __wands.G.menu, q = m.plates.find(p => p.role === 'B' && p.data.cat === 'skin' && p.data.opt === 'tan'); const G = __wands.G; G.bd.x = q.x - 80; G.bd.y = q.y - 80; });
  await sleep(900);
  const h1 = await ev(() => SP.builder.c.toDataURL());
  ok(h0 !== h1 && await ev(() => JSON.parse(localStorage.getItem('wands_profile')).look.builder.skin === 'tan'), 'stepping on a cosmetic plate puts it on the character standing in the world at once (and in the profile)');
  await ev(() => { const m = __wands.G.menu, q = m.plates.find(p => p.role === 'B' && p.data.cat === 'hat' && p.data.opt === 'crown'); const G = __wands.G; G.bd.x = q.x - 80 + 3; G.bd.y = q.y - 80; });
  await sleep(500);
  await ev(() => { const m = __wands.G.menu, q = m.plates.find(p => p.role === 'B' && p.data.cat === 'hat' && p.data.opt === 'crown'); const G = __wands.G; G.bd.x = q.x - 80; G.bd.y = q.y - 80; });
  await sleep(700);
  ok(await ev(() => JSON.parse(localStorage.getItem('wands_profile')).look.builder.hat !== 'crown'), 'a locked cosmetic stays off (its plate shows the achievement that unlocks it)');
  await ev(() => { const m = __wands.G.menu, s = m.statues.W, G = __wands.G; G.bd.x = s.x - 80 + 1; G.bd.y = s.y - 80; });
  await sleep(400); const sw0 = await ev(() => __wands.G.swapped); await key('KeyE'); await sleep(400);
  ok(sw0 !== await ev(() => __wands.G.swapped), 'interacting with the Wizard statue swaps the local player to the Wizard (the job swap)');
  await key('KeyE'); await sleep(200);
  await shot('11_cs_swapped');

  // ---- 6. the start sequence (local)
  await ev(() => { const m = __wands.G.menu; if (m.swap) { /* swap back so WASD is the Builder again */ m.swap = false; } });
  await stepOn('B', 'readyB', 100);
  await ev(() => { const q = __wands.G.menu.plates.find(x => x.key === 'readyW'); __wands.G.w.x = q.x; __wands.G.w.y = q.y; });
  const log = [], t0 = Date.now();
  let last = '';
  for (let i = 0; i < 400; i++) {
    const s = await ev(() => { const G = __wands.G, m = G.menu; if (m) return 'm:' + (m.count > 0 ? 'count' + Math.ceil(m.count) : '') + (m.seq ? ':seq' + m.seq.ph : '') + (m.hideB ? ':builderGone' : ''); return G.intro ? 'i:' + (G.intro.t < G.intro.lead ? 'slide' : G.intro.t < G.intro.lead + G.intro.empty ? 'empty' : 'drop') : 'game'; });
    if (s !== last) { log.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + s); last = s; if (/slide|empty|drop/.test(s)) await shot('12_' + s.replace(/\W/g, '')); }
    if (s === 'game') break;
    await sleep(60);
  }
  console.log('   ' + log.join('  >  '));
  ok(/count3/.test(log.join()) && /count1/.test(log.join()), 'both ready: a 3-2-1 countdown');
  ok(log.findIndex(l => /builderGone/.test(l)) > 0, 'the Builder is sucked up into a portal, then the belt line is sucked away', 'belts: seq phase 2');
  ok(/i:slide.*i:empty.*i:drop.*game/.test(log.join(' ')), 'the factory slides in, stands empty, the buildings drop, then the game plays');
  const intro = await ev(() => null);
  const gap = await ev(() => { const G = __wands.G; return G && G.intro ? 0 : -1; });
  // the drop timing is data: re-run the sequence's maths on a fresh game
  const timing = await ev(() => { const W = __wands; W.Main.introPending = true; W.start(2); const I = W.G.intro, f = W.G.fac, ts = f.bld.concat(f.belts).map(o => o.fallAt).sort((a, b) => a - b); const r = { lead: I.lead, empty: I.empty, first: ts[0], gaps: ts.slice(1).map((t, i) => +(t - ts[i]).toFixed(3)), n: ts.length }; W.Main.introEnd(); return r; });
  ok(Math.abs(timing.first - timing.lead - timing.empty) < 1e-6 && timing.empty === 1, 'the factory is empty for one second after the slide before anything falls', 'first drop at ' + timing.first.toFixed(2) + 's');
  ok(timing.gaps.every(g => Math.abs(g - 0.2) < 0.01) && timing.n === 15, 'the starting buildings and belts fall 200 ms apart', timing.n + ' pieces, gaps ' + timing.gaps.slice(0, 3).join(','));
  await page.waitForFunction(() => __wands.G && !__wands.G.intro && !__wands.G.menu, null, { timeout: 20000 });
  ok(await ev(() => !!document.getElementById('hotbar') && !document.getElementById('game').classList.contains('hidden')), 'the HUD is up and the game plays normally');
  await sleep(1000);
  ok(await ev(() => __wands.G.stats.time > 0.5), 'the simulation runs', await ev(() => __wands.G.stats.time.toFixed(1) + 's'));
  await shot('13_game');

  // ---- 7. a finished building plays the landing puff
  const puff = await ev(() => { const W = __wands, f = W.G.fac; f.parts.length = 0; const b = W.FA.makeBuilding('battery', 4, 2, false, false, 0); W.FA.onComplete(b, false); return f.parts.filter(p => p.dust).length; });
  ok(puff >= 10, 'finishing a building in game plays the same small landing puff', puff + ' dust particles');

  // ---- 8. the way back to the menu: the Builder is sucked up, he drops into the Wizard's world, the Wizard is teleported to the start, the plates pop
  await ev(() => { const w = __wands.G.w; w.x += 7; w.y -= 4; __wands.Main.toTitle(); });
  const back = []; last = '';
  for (let i = 0; i < 300; i++) {
    const s = await ev(() => { const G = __wands.G, m = G.menu; return m ? (m.ret ? 'ret' + m.ret.ph : m.page + ':' + m.plates.length) : 'exit' + __wands.Main.xs.t.toFixed(0); });
    if (s !== last) { back.push(s); last = s; }
    if (/^main:6/.test(s)) break;
    await sleep(80);
  }
  console.log('   ' + back.join(' > '));
  ok(/exit0.*ret0.*ret1.*ret2.*ret3.*main:6/.test(back.join(' ')), 'back at the title: sucked up, dropped beside the Wizard, both teleported to the start, then the plates popped up');
  await sleep(500);
  const wp = await ev(() => [__wands.G.w.x, __wands.G.w.y]);
  ok(Math.hypot(wp[0] - 100.5, wp[1] - 100.5) < 8, 'the Wizard is back at the start of the world', wp.map(v => v.toFixed(1)).join(','));
  await shot('14_back');

  ok(errs.length === 0, 'no page errors', errs.slice(0, 4).join(' // '));
  ok(await ev(() => __wands.UI.errs.length === 0), 'nothing in the error badge');
  await browser.close();
  console.log(fails ? 'MENU CHECK: ' + fails + ' FAILED' : 'MENU CHECK: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
