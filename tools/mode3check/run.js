'use strict';
// The 3-player mode's acceptance run (offline part: the shared simulation, no network). See js/mode3.js / js/mode3run.js / js/mode3draw.js / js/online3.js.
//   node tools/mode3check/run.js   (needs playwright-core + Edge: PLAYWRIGHT_CORE=<path>; SHOTS=<dir> saves screenshots). Exits 1 on any FAIL.
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const OUT = process.env.SHOTS || '';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto('file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/'));
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  await page.waitForTimeout(800); await page.mouse.click(400, 300); await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !StudioIntro.isActive(), null, { timeout: 30000 });
  await page.waitForFunction(() => __wands.G && __wands.G.menu, null, { timeout: 20000 });
  let fails = 0;
  const ok = (c, m, x) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };
  const run = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (OUT) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(OUT, name + '.png') }); } };

  // ================= 0. 2P is untouched: no underworld, no Rootkeeper nodes, no Ash costs, the 2P balance =================
  let r = await run(() => {
    const W = __wands; W.UI.show('loading', false); W.start(1); W.UI.help(false); W.G.helpT = 0; W.step(0.05, 30);
    const G = W.G, UI = W.UI, CFG = W.CFG, o = {};
    o.m3 = !!G.m3; o.u = !!G.u;
    o.rkCost = UI.nodeCost(CFG.tree.find(n => n.id === 'rkroll'));
    const c = UI.nodeCost(CFG.tree.find(n => n.id === 'zoomies')); o.ash = Object.keys(c.pay).filter(k => /^ash_/.test(k));
    o.k = W.M4.k('spawn');
    const e = W.WZ.makeEnemy('slime', G.w.x + 30, G.w.y); o.hp = e.maxHp; o.base = CFG.enemies.slime.hp * (e.hpMul || 1); G.w.enemies.splice(G.w.enemies.indexOf(e), 1);
    UI.openTree('L', true); o.cols = document.querySelectorAll('#treeL .cols .col').length; o.root = /ROOTKEEPER/.test(document.getElementById('treeL').textContent); UI.openTree('L', false); W.Main.graceT = 0; UI.and(false); W.Main.graceT = 0; UI.and(false);
    o.keys = (() => { const box = document.createElement('div'); document.body.appendChild(box); UI.keysPage(box, () => {}); const t = box.textContent; box.remove(); return /ROOTKEEPER/.test(t); })();
    o.json = JSON.stringify(G).indexOf('"u":') < 0;
    o.hud = document.getElementById('rootHud').classList.contains('hidden');
    return o;
  });
  ok(!r.m3 && !r.u && r.json, '2P: no underworld in the state', JSON.stringify([r.m3, r.u, r.json]));
  ok(r.rkCost === null && r.ash.length === 0, '2P: the Rootkeeper nodes cost nothing (do not exist) and no node costs Ash', JSON.stringify([r.rkCost, r.ash]));
  ok(r.cols === 3 && !r.root, '2P: the tree has its three columns, no Rootkeeper branch', r.cols);
  ok(r.k === 1, '2P: the foe count factor is 1', r.k);
  ok(!r.keys, '2P: the Keys page lists no Rootkeeper keys');
  ok(r.hud, '2P: no Rootkeeper card');

  // ================= 1. a 3P game: the seats, the underworld and the starter kit =================
  r = await run(() => {
    const W = __wands; W.start3(1, { me: 2 }); W.UI.help(false); W.G.helpT = 0; W.CFG.world.cap = 0;
    const G = W.G, u = G.u, M3 = W.M3, o = {};
    window.T = { step: (n, k, w, b) => W.step3(0.05, n, k, w, b), K: o => W.step3(0.05, 1, o), near: (x, y) => { u.rk.x = x; u.rk.y = y; u.rk.vx = u.rk.vy = 0; } };
    o.m3 = G.m3; o.seats = G.seats.map(s => s.role + ':' + s.name).join(',');
    const cnt = t => u.bld.filter(b => b.type === t).length, nk = k => u.bld.filter(b => b.type === 'node' && b.nk === k).length;
    o.kit = { pylon: cnt('pylon'), burner: cnt('burner'), tree: nk('tree'), rock: nk('rock'), iron: nk('iron'), mirror: cnt('mirror'), collector: cnt('collector') };
    const bu = u.bld.find(b => b.type === 'burner'), col = u.bld.find(b => b.type === 'collector'), mir = u.bld.find(b => b.type === 'mirror');
    o.wired = M3.netOf(bu).map(c => c.b.type === 'node' ? c.b.nk : c.b.type).sort().join(',');
    o.colLinked = u.hoses.some(h => h[0] === col.id || h[1] === col.id);
    o.rem = {}; for (const it of u.items) o.rem[it.k] = (o.rem[it.k] || 0) + 1;
    const h = G.fac.bld.find(b => b.type === 'harness'); o.mirLink = mir.hid === h.id && mir.el === h.el;
    o.areaOk = u.bld.every(b => b.type === 'mirror' || Math.hypot(b.x - u.rk.x, b.y - u.rk.y) < 20);
    T.step(1); o.hud = !document.getElementById('rootHud').classList.contains('hidden'); o.onRoot = document.getElementById('game').classList.contains('onRoot');
    return o;
  });
  ok(r.m3 && r.seats === 'B:BUILDER,W:WIZARD,K:ROOTKEEPER', '3P: three seats, one per role', r.seats);
  ok(JSON.stringify(r.kit) === JSON.stringify({ pylon: 1, burner: 1, tree: 3, rock: 2, iron: 1, mirror: 1, collector: 1 }), 'the starter kit: 1 pylon, 1 burner, 3 trees, 2 rocks, 1 iron node, 1 mirror Harvester, 1 collector', JSON.stringify(r.kit));
  ok(r.wired === 'iron,mirror,rock,rock,tree,tree,tree' && !r.colLinked, 'the burner is hosed to the 3 trees, 2 rocks, iron node and the mirror; the collector is NOT', r.wired);
  ok(['air', 'water', 'fire', 'earth'].every(e => r.rem['rem_' + e] === 2), 'two remains of each element lie round him', JSON.stringify(r.rem));
  ok(r.mirLink, 'the first mirror Harvester belongs to the starting Harvester (same element)');
  ok(r.areaOk, 'the kit stands in his starting area');
  ok(r.hud && r.onRoot, 'his own card shows on his screen');
  await shot('k_start');

  // ================= 2. the Rootkeeper walks at the Wizard's speed; no roll before the skill =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, o = {};
    T.near(SPAWN.x - 12, SPAWN.y - 12); { const s = W.M3.dryU(SPAWN.x - 12, SPAWN.y - 12, 200, [0, 12]); for (let i = 0; i < 400; i++) { const a = Math.random() * 6.28, d = Math.random() * 30, x = SPAWN.x - 10 + Math.cos(a) * d, y = SPAWN.y - 10 + Math.sin(a) * d; let free = true; for (let k = 0; k <= 7; k += 0.5) if (W.M3.blockedU(x + k, y - k, 0.5) || (WZ.terrain[Math.floor(y - k) * W.CFG.WW + Math.floor(x + k)] >> 3) === T_BOG) free = false; if (free) { T.near(x, y); break; } } }   // (open dry ground to the east-north-east: screen right)
    const x0 = u.rk.x, y0 = u.rk.y; T.step(20, { ix: 1 }); o.v = Math.hypot(u.rk.vx, u.rk.vy); o.ws = W.WZ.speed(); o.moved = Math.hypot(u.rk.x - x0, u.rk.y - y0);
    T.step(10); T.K({ roll: true }); o.roll0 = u.rk.roll > 0;
    G.tree.rkroll = true; T.step(30); T.K({ roll: true, ix: 1 }); o.roll1 = u.rk.roll > 0;
    return o;
  });
  ok(Math.abs(r.v - r.ws) < 0.05 && r.moved > 2, 'he runs at the Wizard\'s speed', r.v.toFixed(2) + ' vs ' + r.ws.toFixed(2));
  ok(!r.roll0 && r.roll1, 'no roll until Root Roll is bought, then a roll', JSON.stringify([r.roll0, r.roll1]));

  // ================= 3. remains: pick up, throw into the pylon (banked, last in first out), pull back out =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, o = {};
    T.step(20);   // (the roll of section 2 is over)
    const it = u.items.find(i => i.k === 'rem_water'), py = u.bld.find(b => b.type === 'pylon');
    T.near(it.x + 0.3, it.y); u.rk.fx = -1; u.rk.fy = 0; T.step(2); T.K({ pick: true }); o.hand = u.rk.hands.slice();   // (facing it: the shared resolver, like the Builder's, prefers what he faces)
    const it2 = u.items.find(i => i.k === 'rem_fire'); T.near(it2.x + 0.3, it2.y); u.rk.fx = -1; u.rk.fy = 0; T.step(2); T.K({ pick: true }); o.hand2 = u.rk.hands.length;
    const bu0 = u.bld.find(b => b.type === 'burner'), dx = py.x - bu0.x, dy = py.y - bu0.y, dm = Math.hypot(dx, dy) || 1;
    const at = () => { T.near(py.x + dx / dm * 1.5, py.y + dy / dm * 1.5); u.rk.fx = -dx / dm; u.rk.fy = -dy / dm; };   // (beside the pylon, on the far side from the burner, facing it)
    o.held = u.rk.hands.slice();   // (what he actually picked: the shared resolver weighs the way he faces, not only the distance)
    at(); T.step(2); at();
    T.K({ throw: true }); T.step(4); at(); T.K({ throw: true }); T.step(30);
    o.bank = Object.assign({}, u.bank); o.blog = u.blog.slice(); o.empty = u.rk.hands.length;
    u.items = u.items.filter(i => Math.hypot(i.x - py.x, i.y - py.y) > 3);   // (nothing loose right by the pylon: the nearest thing gets the press)
    T.near(py.x + 0.4, py.y); T.step(2); T.near(py.x + 0.4, py.y); T.K({ pick: true }); o.pulled = u.rk.hands.slice(); o.bank2 = Object.assign({}, u.bank);
    at(); T.K({ throw: true }); T.step(30);
    o.fb = ['remain-bank'].map(k => G.fb && G.fb[k] || 0);
    return o;
  });
  ok(r.hand[0] === 'rem_water' && r.hand2 === 2, 'he picks remains up into his hands', JSON.stringify(r.hand));
  ok(r.held.length === 2 && r.held.every(k => r.bank[k.slice(4)] === r.held.filter(q => q === k).length) && Object.values(r.bank).reduce((x, y) => x + y, 0) === 2 && r.empty === 0, 'thrown at the Storage Pylon they are banked by type', JSON.stringify([r.held, r.bank]));
  ok(r.pulled[0] === 'rem_' + r.blog[r.blog.length - 1] && r.bank2[r.blog[r.blog.length - 1]] === 0, 'picking at a pylon pulls the LAST banked one back out (last in, first out)', JSON.stringify([r.blog, r.pulled]));
  ok(r.fb[0] > 0, 'banking is a ledger cue (remain-bank)');

  // ================= 4. the burner: only what is thrown in (never the bank), pulses split evenly, wrong fuel at half rate =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, C = W.CFG.mode3, o = {};
    const bu = u.bld.find(b => b.type === 'burner'); bu.el = 'water'; u.bank.water = 3; u.blog.push('water', 'water'); bu.burn = 0; for (const e in bu.hop) bu.hop[e] = 0; bu.hop.water = 6;
    const tr = u.bld.find(b => b.type === 'node' && b.nk === 'tree'), rk_ = u.bld.find(b => b.type === 'node' && b.nk === 'rock');
    tr.ch = 0; rk_.ch = 0; u.pulses.length = 0;
    T.near(bu.x + 12, bu.y + 12);
    T.step(1); o.loaded = bu.st === 'burn' && bu.bel === 'water' && bu.hop.water === 5 && u.bank.water === 3;
    o.pulses = u.pulses.length; o.amt = u.pulses.length ? u.pulses[0].a : 0; o.want = M3.out() * C.burner.pulse / 7;
    T.step(60);
    o.tree = tr.ch; o.rock = rk_.ch; o.ratio = (rk_.ch * C.nodes.rock.charge) / (tr.ch * C.nodes.tree.charge);
    o.wrong = G.fb && G.fb['wrong-fuel'] || 0;
    // its set type not in the hopper: it burns whatever else was thrown in
    for (const e in bu.hop) bu.hop[e] = 0; bu.hop.fire = 1; bu.el = 'earth'; bu.burn = 0; T.step(1); o.other = bu.st === 'burn' && bu.bel === 'fire' && bu.hop.fire === 0;
    // an empty hopper: starved even with plenty banked (and it says which)
    for (const e in bu.hop) bu.hop[e] = 0; u.bank.earth = 5; bu.burn = 0; T.step(50); o.starve = bu.st; o.bankKept = u.bank.earth === 5; o.sfb = G.fb && G.fb['burner-starve'] || 0;
    return o;
  });
  ok(r.loaded, 'a burner burns a remain thrown into its hopper and never takes from the shared bank', JSON.stringify(r));
  ok(r.pulses >= 7 && Math.abs(r.amt - r.want) < 1e-6, 'its output goes out as pulses, split evenly over the 7 things on its hoses', r.amt.toFixed(3) + ' each');
  ok(r.tree > 0 && Math.abs(r.ratio - 0.5) < 0.05, 'a tree (prefers Water) charges at full rate, a rock at half (wrong fuel)', 'ratio ' + r.ratio.toFixed(3));
  ok(r.wrong > 0, 'running on the wrong fuel is a ledger cue (wrong-fuel)');
  ok(r.other, 'with none of its set type thrown in it burns another type that was', JSON.stringify(r));
  ok(r.starve === 'starve' && r.bankKept && r.sfb > 0, 'an empty hopper is starved even with remains in the bank (burner-starve)', r.starve);
  await shot('k_burn');

  // ================= 5. a node manifests in the wilds, the Wizard harvests it, it is a stump again =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, WZ = W.WZ, o = {};
    const tr = u.bld.find(b => b.type === 'node' && b.nk === 'tree');
    tr.ch = 0.99; M3.deliver(tr, 'water', 5); o.up = tr.up;
    o.inList = WZ.harvBox(tr.x - 1, tr.y - 1, tr.x + 1, tr.y + 1).indexOf(tr) >= 0;
    let n = 0; G.w.drops.length = 0;
    while (!tr.broken && n++ < 40) WZ.hurtH(tr, 10);
    o.drops = G.w.drops.filter(d => d.kind === 'wood').length;
    T.step(1); o.back = !tr.up && tr.ch === 0 && !tr.broken;
    // mashing charges a stump slowly
    T.near(tr.x + 0.6, tr.y); T.step(2); const c0 = tr.ch; T.K({ use: true }); o.mash = tr.ch - c0;
    // the Wizard sees the % near a charging node
    G.w.x = tr.x + 1; G.w.y = tr.y + 1; T.step(12); o.seen = G.fb['node-charge'] || 0;
    o.fb = ['node-up', 'node-down'].map(k => G.fb[k] || 0);
    return o;
  });
  ok(r.up && r.inList, 'charged, a node manifests in the wilds and is in the hit lists like any tree', JSON.stringify(r));
  ok(r.drops >= 1, 'the Wizard harvests it (Wood drops)', r.drops);
  ok(r.back, 'harvested, it is a stump again in both worlds, to be recharged');
  ok(r.mash > 0 && r.mash < 0.1, 'mashing a stump charges it slowly', r.mash.toFixed(3));
  ok(r.seen > 0, 'the Wizard near a charging node sees its charge (node-charge)');
  ok(r.fb.every(v => v > 0), 'node-up / node-down are ledger cues');

  // ================= 6. building: tools, costs, crafters, a trap that fires on foes in the wilds =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, WZ = W.WZ, C = W.CFG.mode3, o = {};
    for (const e of ['air', 'water', 'fire', 'earth']) { u.bank[e] = 20; for (let i = 0; i < 20; i++) u.blog.push(e); }
    const bu = u.bld.find(b => b.type === 'burner');
    // walk to an open spot next to the burner, face east: the Trap Crafter goes in front of him
    let spot = null;
    for (let d = 2; d < 6 && !spot; d += 0.5) for (let a = 0; a < 6.28 && !spot; a += 0.4) { const x = Math.floor(bu.x + Math.cos(a) * d) + 0.5, y = Math.floor(bu.y + Math.sin(a) * d) + 0.5; if (M3.free(x + 1, y, 1.2) && !M3.blockedU(x, y, 0.4)) spot = [x, y]; }
    T.near(spot[0], spot[1]); u.rk.fx = 1; u.rk.fy = 0; T.step(1);
    const b0 = u.bld.length; T.K({ tool: 2 }); o.tool = u.rk.tool; T.K({ pick: true }); o.built = u.bld.length - b0;
    const tc = u.bld[u.bld.length - 1]; o.tc = tc.type; o.paid = 20 - u.bank.air;
    T.K({ tool: 'clear' });
    u.items = u.items.filter(i => Math.hypot(i.x - tc.x, i.y - tc.y) > 3.5);   // (no loose remains right by the crafter: the nearest thing gets the press)
    T.near(tc.x - 0.8, tc.y); u.rk.fx = -1; u.rk.fy = 0; T.step(1); u.rk.fx = -1; u.rk.fy = 0;
    T.K({ pick: true }); o.busy = tc.busy; T.step(Math.ceil(C.craftT / 0.05) + 2); o.hands = u.rk.hands.slice();
    // plant it in front of him (throw = plant), then hose it to the burner
    const before = u.bld.length; u.rk.fx = -1; u.rk.fy = 0; T.K({ throw: true }); o.trap = u.bld.length - before === 1 && u.bld[u.bld.length - 1].type === 'trap';
    const tp = u.bld[u.bld.length - 1];
    o.linkable = M3.canLink(bu, tp);
    T.K({ tool: 0 }); T.near(bu.x + 0.5, bu.y); T.K({ pick: true }); T.near(tp.x + 0.5, tp.y); T.K({ pick: true }); T.K({ tool: 'clear' });
    o.hosed = M3.linked(bu.id, tp.id);
    // unfueled: inert; fueled: fires on a foe standing on it in the wilds and re-arms
    G.w.enemies.length = 0; tp.fuel = 0;
    const e = WZ.makeEnemy('golem', tp.x, tp.y); e.hp = e.maxHp = 1e5; e.spd = 0; e.dazeT = 100;
    T.step(10); o.inert = e.hp === e.maxHp;
    tp.fuel = 12; T.step(4); o.hit = e.hp < e.maxHp; o.fuel = tp.fuel; o.armed = tp.arm > 0;
    G.w.enemies.length = 0;
    o.fb = ['trap-set', 'trap-fire', 'rk-craft', 'rk-build', 'rk-hose'].map(k => G.fb[k] || 0);
    return o;
  });
  ok(r.tool === 'tcraft' && r.built === 1 && r.tc === 'tcraft' && r.paid === 2, 'a toolbar building is placed in front of him and paid from banked remains', JSON.stringify(r));
  ok(/^t_/.test(r.busy || '') && r.hands.some(k => /^t_/.test(k)), 'the Trap Crafter crafts a trap into his hands', JSON.stringify(r.hands));
  ok(r.trap, 'thrown, the trap is planted in front of him');
  ok(r.hosed, 'the hose tool links the burner to it', JSON.stringify([r.linkable, r.hosed]));
  ok(r.inert, 'an unfueled trap is inert');
  ok(r.hit && r.armed, 'a fueled trap fires on a foe in the wilds and re-arms', JSON.stringify([r.hit, r.fuel, r.armed]));
  ok(r.fb.every(v => v > 0), 'trap-set / trap-fire / rk-craft / rk-build / rk-hose cues fire', JSON.stringify(r.fb));

  // ================= 7. hose reach: a building alone R, one standard pole 2R, one heavy pole 3R (unlocked by the skill) =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, C = W.CFG.mode3, o = {}, R = C.reach;
    const mk = (t, x, y) => M3.make(t, x, y, t === 'node' ? { nk: 'tree' } : {});
    const x0 = 40.5, y0 = 150.5;
    const a = mk('burner', x0, y0), b = mk('pylon', x0 + R + 0.5, y0);   // just past R
    o.direct = M3.canLink(a, b);
    const c = mk('pylon', x0 + R - 1, y0 + 3); o.near = M3.canLink(a, c);
    const p = mk('pole', x0 + R, y0 + 6), far = mk('collector', x0 + 2 * R - 0.5, y0 + 6);
    o.viaPole = M3.canLink(a, p) || Math.hypot(p.x - a.x, p.y - a.y) <= R; o.poleFar = Math.hypot(far.x - a.x, far.y - a.y) > R && M3.canLink(p, far) && !M3.canLink(a, far);
    const hp = mk('hpole', x0 + 1.5 * R - 0.5, y0 - 8), far3 = mk('collector', x0 + 3 * R - 1.5, y0 - 8);
    o.heavy = M3.canLink(mk('pylon', x0 + 0.5, y0 - 8), hp) && M3.canLink(hp, far3) && Math.hypot(far3.x - x0, 0) > 2 * R;
    G.tree.rkpole = false; u.rk.tool = 'hpole'; const n0 = u.bld.length; M3.place('hpole'); o.locked = u.bld.length === n0;
    for (const q of u.bld.slice()) if (q.y > 140) M3.unbuild(q);
    u.rk.tool = null;
    return o;
  });
  ok(!r.direct && r.near, 'two buildings link within one reach, not past it', JSON.stringify(r));
  ok(r.poleFar, 'a standard pole between them doubles the reach');
  ok(r.heavy, 'a heavy pole triples it');
  ok(r.locked, 'the heavy pole needs the Heavy Hose Poles skill');

  // ================= 8. collectors lift the ash into the skill bank; the 3P tree costs Ash =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, UI = W.UI, CFG = W.CFG, o = {};
    const bu = u.bld.find(b => b.type === 'burner'), col = u.bld.find(b => b.type === 'collector');
    bu.ash.water = 3; const a0 = G.bank.ash_water || 0;
    T.step(60); o.noLink = (G.bank.ash_water || 0) - a0;
    // a pole between them, both hosed
    const mx = (bu.x + col.x) / 2, my = (bu.y + col.y) / 2, p = M3.make('pole', mx, my);
    o.l1 = M3.link(bu, p); o.l2 = M3.link(p, col);
    T.step(100); o.lifted = (G.bank.ash_water || 0) - a0; o.left = bu.ash.water;
    // the tree: every node costs Ash in 3P, spread over the four Ashes
    const tot = { ash_air: 0, ash_water: 0, ash_fire: 0, ash_earth: 0 };
    for (const n of CFG.tree) { if (!n.tiers) { const c = M3.ashOf(n, 0); for (const k in c) tot[k] += c[k]; continue; } for (let L = 0; L < n.tiers.length; L++) { const c = M3.ashOf(n, L); for (const k in c) tot[k] += c[k]; } }
    o.tot = tot;
    const z = CFG.tree.find(n => n.id === 'zoomies'), cz = UI.nodeCost(z); o.zAsh = Object.keys(cz.pay).filter(k => /^ash_/.test(k)).map(k => k + ':' + cz.pay[k]);
    o.sum = Object.keys(UI.nodeCost(CFG.tree.find(n => n.id === 'summon')).pay).filter(k => /^ash_/.test(k)).length;
    // buying pays the Ash
    G.xp = 1000; for (const k of ['air', 'water', 'fire', 'earth']) { G.bank[k] = 50; G.bank['ash_' + k] = 10; }
    const before = Object.assign({}, G.bank); UI.buy('zoomies'); o.bought = G.tree.zoomies === 1; o.paidAsh = Object.keys(before).filter(k => /^ash_/.test(k) && G.bank[k] < before[k]).length;
    UI.buy('rkspeed'); o.rk = G.tree.rkspeed === 1;
    UI.openTree('R', true); o.cols = document.querySelectorAll('#treeR .cols .col').length; o.root = /ROOTKEEPER/.test(document.getElementById('treeR').textContent); o.ashRow = !!document.querySelector('#treeR .bankRow img'); UI.openTree('R', false); W.Main.graceT = 0; UI.and(false);
    o.fb = G.fb['ash-up'] || 0;
    return o;
  });
  ok(r.noLink === 0, 'a collector with no hose to the burner lifts nothing (the starter one is not hosed)', JSON.stringify(r));
  ok(r.l1 && r.l2 && r.lifted === 3 && r.left === 0 && r.fb > 0, 'hosed through a pole, it lifts the burner\'s ash into the skill bank (ash-up)', r.lifted);
  const t = r.tot, vals = Object.values(t), spread = Math.max(...vals) - Math.min(...vals);
  ok(vals.every(v => v > 20) && spread <= Math.max(...vals) * 0.15, 'Ash costs are spread evenly over the four Ashes across the whole tree', JSON.stringify(t));
  ok(r.zAsh.length === 1 && r.sum === 4, 'a track tier costs one Ash, Summoning all four', JSON.stringify(r.zAsh));
  ok(r.bought && r.paidAsh === 1 && r.rk, 'buying pays the Ash; the Rootkeeper branch can be bought', JSON.stringify([r.bought, r.paidAsh, r.rk]));
  ok(r.cols === 4 && r.root, 'the 3P tree has a fourth column: the ROOTKEEPER branch', r.cols);

  // ================= 9. mirror Harvesters: packets up to the Builder, a new one per Harvester, gone with it =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, FA = W.FA, C = W.CFG.mode3, o = {};
    const mir = u.bld.find(b => b.type === 'mirror'), h = FA.byId(mir.hid);
    h.out.length = 0; mir.ch = 0;
    M3.deliver(mir, mir.el, C.mirror.pack); o.sent = h.out.filter(q => q.kind === mir.el).length; o.fb = G.fb['below-packet'] || 0;
    o.pops = G.fac.pops.some(p => p.ic && p.ic.some(e => e[0] === 'ic_root'));
    h.out.length = 0; mir.ch = 0; T.near(mir.x, mir.y + 0.1); T.step(2); let n = 0; while (!h.out.length && n++ < 40) { T.near(mir.x, mir.y + 0.1); T.K({ use: true }); T.step(1); } o.mashN = n;
    // the Builder finishes a second Harvester: a mirror drops in below, >= 8 tiles from every other building, further out than the first
    const cx = W.CFG.WW / 2, cy = W.CFG.WH / 2, d1 = Math.hypot(mir.x - cx, mir.y - cy);
    let spot = null; for (let y = 0; y < G.fac.h && !spot; y++) for (let x = 0; x < G.fac.w && !spot; x++) if (FA.owned(x, y) && !FA.cell(x, y) && !FA.isPile(x, y)) spot = [x, y];
    const h2 = FA.makeBuilding('harness', spot[0], spot[1], false, false, 0); FA.onComplete(h2, false); h2.el = 'fire';
    T.step(2);
    const m2 = u.bld.find(b => b.type === 'mirror' && b.hid === h2.id);
    o.m2 = !!m2; o.el2 = m2 && m2.el;
    o.gap = m2 ? Math.min(...u.bld.filter(b => b !== m2).map(b => Math.hypot(b.x - m2.x, b.y - m2.y))) : 0;
    o.d2 = m2 ? Math.hypot(m2.x - cx, m2.y - cy) - d1 : 0;
    o.newFb = G.fb['mirror-new'] || 0;
    // the Builder takes it down: the mirror crumbles, its invested fuel falls out as remains
    m2.got = { fire: C.mirror.perRemain * 2 }; const it0 = u.items.length;
    FA.demolish(h2.x, h2.y, true); T.step(2);
    o.gone = !u.bld.some(b => b.type === 'mirror' && b.hid === h2.id); o.dropped = u.items.length - it0; o.goneFb = G.fb['mirror-gone'] || 0;
    return o;
  });
  ok(r.sent === 1 && r.fb > 0 && r.pops, 'a charged mirror sends a packet up into its Harvester in the factory, with its own cue (below-packet)', JSON.stringify(r));
  ok(r.mashN > 3 && r.mashN < 40, 'mashing a mirror charges a packet too', r.mashN);
  ok(r.m2 && r.el2 === 'fire' && r.newFb > 0, 'a new Harvester topside drops a matching mirror below, and he is told', JSON.stringify([r.m2, r.el2]));
  ok(r.gap >= 7.5 && r.d2 > 5, 'it lands >= 8 tiles from any other building, further out than the one before', r.gap.toFixed(1) + ' / +' + r.d2.toFixed(1));
  ok(r.gone && r.dropped === 2 && r.goneFb > 0, 'demolished topside, its mirror vanishes and its invested fuel drops as remains', JSON.stringify([r.gone, r.dropped]));

  // ================= 10. remains from kills; they decay; the 3P balance =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, WZ = W.WZ, C = W.CFG.mode3, o = {};
    const n = () => u.items.filter(i => /^rem_/.test(i.k)).length;
    let k0; o.normal = [];
    for (let i = 0; i < 60; i++) { k0 = n(); WZ.kill(WZ.makeEnemy('imp', 60, 60)); o.normal.push(n() - k0); }
    o.egg = [];   // a Zephyr Wisp Egg hatches 3: one remain each
    for (let i = 0; i < 20; i++) { k0 = n(); const e = WZ.makeCreature('zephyr', 60, 60, { plain: true }); e.crafted = true; WZ.kill(e); o.egg.push(n() - k0); }
    k0 = n(); const e2 = WZ.makeEnemy('imp', 60, 60); e2.mut = 'swift'; WZ.kill(e2); o.mutant = n() - k0;
    k0 = n(); const e3 = WZ.makeEnemy('imp', 60, 60, true); WZ.kill(e3); o.elite = n() - k0;
    const last = u.items[u.items.length - 1]; o.at = [Math.round(last.x), Math.round(last.y)]; o.el = last.k;
    T.step(30);
    const old = u.items.filter(i => /^rem_/.test(i.k)); for (const it of old) it.t = C.remains.life - 1;
    T.step(30); o.left = old.filter(i => u.items.indexOf(i) >= 0).length; o.fade = G.fb['remain-fade'] || 0; o.land = G.fb['remain-land'] || 0;
    const e = WZ.makeEnemy('slime', 70, 70); o.hp = e.maxHp; o.base = W.CFG.enemies.slime.hp; G.w.enemies.splice(G.w.enemies.indexOf(e), 1);
    o.k = W.M4.k('spawn');
    return o;
  });
  const two = r.normal.filter(v => v === 2).length;
  ok(r.normal.every(v => v === 1 || v === 2) && two >= 15 && two <= 45 && r.mutant === 2 && r.elite === 3, 'a kill drops remains below: normal 1 + 50% a second, mutant 2, elite 3', two + '/60 normal kills dropped two, ' + JSON.stringify([r.mutant, r.elite]));
  ok(r.egg.every(v => v === 1), 'a creature from an Egg that hatches several drops exactly one', JSON.stringify(r.egg));
  ok(Math.abs(r.at[0] - 60) <= 2 && Math.abs(r.at[1] - 60) <= 2 && r.el === 'rem_fire', 'at the kill\'s spot, of the foe\'s element', JSON.stringify([r.at, r.el]));
  ok(r.left === 0 && r.fade > 0 && r.land > 0, 'unbanked remains fade out and decay after their life (remain-fade, remain-land)', JSON.stringify(r));
  ok(Math.abs(r.hp / r.base - 1.2) < 0.25 && r.k === 1.25, '3P balance: foe health x1.2, counts x1.25', JSON.stringify([r.hp, r.base, r.k]));

  // ================= 11. presence bleed, ghost views, the corner picture =================
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, o = {};
    G.w.x = 100; G.w.y = 100; G.w.vx = G.w.vy = 0; u.rk.x = 70; u.rk.y = 85;
    for (const k in G.w.bend) delete G.w.bend[k]; for (const k in u.bend) delete u.bend[k];
    T.step(15, { ix: 1, iy: 1 });
    const near = (bend, x, y) => Object.keys(bend).some(k => { const i = Math.floor(+k / 32), tx = i % W.CFG.WW, ty = Math.floor(i / W.CFG.WW); return Math.hypot(tx - x, ty - y) < 3; });
    o.wilds = near(G.w.bend, u.rk.x, u.rk.y);
    T.step(1); T.step(15, null, { wix: 1, wiy: 0 });
    o.under = near(u.bend, G.w.x, G.w.y);
    o.g0 = [u.ghost.W, u.ghost.K]; T.K({ ghost: true }); W.M3.ghostW(); o.g1 = [u.ghost.W, u.ghost.K];
    o.pip0 = M3D.pipRole(); M3D.cyclePip(); o.pip1 = M3D.pipRole();
    return o;
  });
  ok(r.wilds, 'the Rootkeeper bends the wilds\' grass at the mirror of where he walks (always on)');
  ok(r.under, 'and the Wizard bends the underworld\'s grass');
  ok(!r.g0[0] && !r.g0[1] && r.g1[0] && r.g1[1], 'the Wizard and the Rootkeeper each toggle a ghost view', JSON.stringify([r.g0, r.g1]));
  ok(r.pip0 !== r.pip1 && ['B', 'W'].indexOf(r.pip0) >= 0 && ['B', 'W'].indexOf(r.pip1) >= 0, 'the corner picture cycles between his two teammates', r.pip0 + ' -> ' + r.pip1);
  await shot('k_ghost');

  // ================= 12. the photo test with everything on screen (ghosts on, pulses running) =================
  const photo = async label => {
    const p = await run(() => { __wands.snapshot(); const R = __wands.Snap.report; return R ? { v: R.verdict, leaks: R.leaks.filter(l => !l.known).map(l => l.id).concat(R.issues.filter(i => !i.known).map(i => i.id)), px: R.diff.px } : null; });
    ok(p && (p.v === 'PASS' || p.v === 'KNOWN'), 'the photo test passes in 3P (' + label + ')', JSON.stringify(p));
  };
  await run(() => { const W = __wands, G = W.G, u = G.u; const bu = u.bld.find(b => b.type === 'burner'); bu.el = 'water'; u.bank.water = 10; G.w.enemies.length = 0; W.WZ.makeEnemy('slime', G.w.x + 3, G.w.y + 1); u.rk.x = bu.x + 2; u.rk.y = bu.y + 1; G.w.x = bu.x + 1; G.w.y = bu.y - 1; T.step(30); });
  await photo('the wilds + the underworld');
  await run(() => { __wands.Snap.v3 = 'fu'; });
  await photo('the factory + the underworld');
  await run(() => { __wands.Snap.v3 = 'wu'; });

  // ================= 13. saves: tagged m3, the underworld comes back; a 2P load refuses it =================
  r = await run(() => {
    const W = __wands, Main = W.Main, UI = W.UI, o = {};
    let G = W.G;
    const sig = g => ({ n: g.u.bld.length, h: g.u.hoses.length, bank: JSON.stringify(g.u.bank), mir: g.u.bld.filter(b => b.type === 'mirror').length, ash: g.bank.ash_water || 0 });
    o.a = sig(G); Main.save();
    const s = UI.slotInfo(1); o.tag = !!s.m3 && !s.m4;
    Main.loadGame(1); o.refused = W.G === G;
    Main.loadGame3(1, { me: 2 }); G = W.G; o.b = sig(G); o.m3 = G.m3;
    W.step3(0.05, 3); o.relink = G.u.bld.filter(b => b.type === 'mirror').every(m => W.FA.byId(m.hid));
    return o;
  });
  ok(r.tag, 'a 3P save is tagged m3');
  ok(r.refused, 'a 2P load refuses a 3P save');
  ok(r.m3 && JSON.stringify(r.a) === JSON.stringify(r.b), 'loading it brings the underworld back as it was', JSON.stringify([r.a, r.b]));
  ok(r.relink, 'its mirror Harvesters find their Harvesters again');

  // ================= 14. the game over: the Wizard down ends the run; each screen has its own panel and RESTART =================
  r = await run(() => {
    const W = __wands, G = W.G, WZ = W.WZ, o = {};
    G.w.hp = 1; WZ.damage(500, false, WZ.HAZ.unknown); T.step(30);
    const el = document.getElementById('results'); W.UI.showResults();
    o.shown = !el.classList.contains('hidden'); o.root = /ROOTKEEPER: GAME OVER/.test(el.textContent) && /Remains collected/.test(el.textContent) && /Traps placed/.test(el.textContent);
    o.btn = !!document.getElementById('rRe3');
    G.w.ready.B = true; G.w.ready.W = true; T.step(3); o.waitK = G.w.dead;
    document.getElementById('rRe3').click(); T.step(3); o.restarted = !G.w.dead;
    return o;
  });
  ok(r.shown && r.root && r.btn, 'the Rootkeeper gets his own game over screen with his stats and his own RESTART', JSON.stringify(r));
  ok(r.waitK && r.restarted, 'the run restarts only when the Rootkeeper is ready too', JSON.stringify([r.waitK, r.restarted]));
  await shot('k_end');

  // ================= 15. the solo test (Online > 3 PLAYER > SOLO): one person plays every seat in turn, nothing is saved =================
  r = await run(() => {
    const W = __wands, o = {};
    localStorage.removeItem('wands2_save_slot0');
    W.M3.soloStart(); W.UI.help(false); W.G.helpT = 0;
    o.solo = !!W.G.solo3 && W.G.m3 && W.G.vi === 0;
    return o;
  });
  await page.waitForTimeout(300); r.chip = await run(() => !document.getElementById('solo3').classList.contains('hidden'));   // (the chip follows the HUD's next frame)
  await page.keyboard.press('F8'); await page.waitForTimeout(400);
  const s1 = await run(() => [__wands.M3.myRole(), document.getElementById('game').classList.contains('onGuest')]);
  await page.keyboard.press('F8'); await page.waitForTimeout(400);
  const s2 = await run(() => [__wands.M3.myRole(), document.getElementById('game').classList.contains('onRoot'), !document.getElementById('rootHud').classList.contains('hidden')]);
  await page.keyboard.press('F9'); await page.waitForTimeout(300);
  const b0 = await run(() => [__wands.G.w.x, __wands.G.w.y, __wands.DevBot.on]);
  await page.waitForTimeout(3000);
  const b1 = await run(() => { const G = __wands.G; __wands.DevBot.set(null); return [G.w.x, G.w.y, G.u.rk.x, G.u.rk.y]; });
  await page.keyboard.press('F8'); await page.waitForTimeout(400);
  const s3 = await run(() => {
    const W = __wands, G = W.G, o = { role: W.M3.myRole() };
    G.w.hp = 1; W.WZ.damage(500, false, W.WZ.HAZ.unknown); W.step3(0.05, 30);
    W.UI.showResults(); document.getElementById('rRe3').click(); W.step3(0.05, 3); o.restarted = !G.w.dead;
    W.Main.save(); o.saved = !!localStorage.getItem('wands2_save_slot0');
    W.Main.toTitle(true); o.chipGone = document.getElementById('solo3').classList.contains('hidden') || !W.G.solo3;
    return o;
  });
  ok(r.solo && r.chip, 'solo test: a 3P game on this machine, starting as the Builder, with its chip', JSON.stringify(r));
  ok(s1[0] === 'W' && s1[1] && s2[0] === 'K' && s2[1] && s2[2] && s3.role === 'B', 'solo test: F8 walks the seats Builder > Wizard > Rootkeeper > Builder, each with its own view and HUD', JSON.stringify([s1, s2, s3.role]));
  ok(b0[2] && Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) > 0.5, 'solo test: F9 lets the dev bot play the Wizard while you are the Rootkeeper', Math.hypot(b1[0] - b0[0], b1[1] - b0[1]).toFixed(2));
  ok(s3.restarted && !s3.saved, 'solo test: your RESTART is everybody\'s, and nothing is saved', JSON.stringify(s3));

  // ================= 16. his toolbar is the Builder's hotbar; his throws fly the Builder's flight; the mouse aims; the camera kicks =================
  r = await run(() => {
    const W = __wands; W.start3(1, { me: 2 }); W.UI.help(false); W.G.helpT = 0; W.CFG.world.cap = 0;
    const G = W.G, u = G.u, M3 = W.M3, FA = W.FA, rk = u.rk, o = {};
    W.step3(0.05, 3);
    const hb = document.getElementById('hotbar');
    o.slots = hb.children.length; o.shown = getComputedStyle(hb).display !== 'none' && hb.getBoundingClientRect().top > innerHeight / 2; o.old = !!document.querySelector('#rootHud .ktools');
    o.keys = [...hb.querySelectorAll('kbd')].map(k => k.textContent).join('');
    hb.children[1].click(); W.step3(0.05, 2); o.t1 = rk.tool; o.sel1 = [...hb.children].map(s => (s.classList.contains('sel') ? 1 : 0)).join('');
    hb.children[5].click(); o.t2 = rk.tool; hb.children[5].click(); o.t2b = rk.tool;
    G.tree.rkpole = true; hb.children[5].click(); o.t3 = rk.tool; W.step3(0.05, 2); o.pips = hb.children[5].querySelectorAll('.pips b').length; o.sel5 = hb.children[5].classList.contains('sel');
    o.icon = !!hb.children[5].querySelector('.ic img'); o.tip = !document.getElementById('hotTip').classList.contains('hidden') && /Heavy Hose Pole/.test(document.getElementById('hotTip').textContent);
    rk.tool = null; W.step3(0.05, 2); o.none = [...hb.children].every(s => !s.classList.contains('sel'));
    // his throw is the Builder's flight (same line, lob and time) and is in the air for a moment
    const py = u.bld.find(b => b.type === 'pylon'); rk.x = py.x - 3; rk.y = py.y; rk.vx = rk.vy = 0; rk.fx = 1; rk.fy = 0; rk.hands = ['rem_air']; rk.throwCd = 0; u.fly.length = 0; W.step3(0.05, 1);
    M3.throwOne(); const f = u.fly[0], d = f ? Math.hypot(f.tx - f.sx, f.ty - f.sy) : 0;
    o.fly = !!f && Math.abs(f.T - (0.28 + d * 0.045)) < 1e-9 && Math.abs(f.h - (0.9 + d * 0.22)) < 1e-9 && f.z === 0.8;
    W.step3(0.05, 4); o.air = u.fly[0] ? u.fly[0].z : null;
    // the mouse aims: a host's k.at, a guest's pad ax / ay (padK), the throw lands there; no cursor = auto-aim
    rk.x = py.x - 6; rk.y = py.y + 4; rk.vx = rk.vy = 0; rk.fx = 1; rk.fy = 0; u.fly.length = 0; rk.hands = ['rem_air']; rk.throwCd = 0; W.step3(0.05, 1);
    const kk = M3.padK({ ix: 0, iy: 0, ax: rk.x + 2, ay: rk.y - 1.5 }); o.padAt = kk.at; o.padWant = [rk.x + 2, rk.y - 1.5]; o.padNone = M3.padK({ ix: 0, iy: 0, ax: null, ay: null }).at;
    W.step3(0.05, 1, { throw: true, at: [rk.x + 2, rk.y - 1.5] }); const g = u.fly[0]; o.aim = g ? [g.tx - rk.x, g.ty - rk.y] : null;
    // a remote Builder aims with his cursor too
    const bd = G.bd; G.hands.length = 0; FA.addHands('wood', 1); bd.throwCd = 0; G.noThrow = false;
    const thr = [], o0 = FA.throwOne; FA.throwOne = function (ax, ay) { thr.push([ax, ay]); return o0.apply(this, arguments); };
    W.Main.remoteB(0.05, { ix: 0, iy: 0, bHeld: true, b: true, ax: bd.x + 2.5, ay: bd.y + 1, any: true }); FA.throwOne = o0; o.bAim = thr[0]; o.bWant = [bd.x + 2.5, bd.y + 1];
    // the camera kick decays; he feels what he builds
    u.shake = 0; M3.kick(0.2); o.k1 = u.shake; W.step3(0.05, 3); o.k2 = u.shake;
    return o;
  });
  ok(r.slots === 8 && r.shown && !r.old, 'his toolbar is the Builder\'s hotbar along the bottom (8 slots), not a strip on his card', JSON.stringify([r.slots, r.shown, r.old]));
  ok(r.keys === '12345678', 'its key caps are his tool keys', r.keys);
  ok(r.t1 === 'burner' && r.sel1 === '01000000' && r.none, 'a click picks the slot, the picked slot lifts, an empty hand lifts none', JSON.stringify([r.t1, r.sel1, r.none]));
  ok(r.t2 === 'pole' && r.t2b === 'pole' && r.t3 === 'hpole' && r.pips === 2 && r.sel5 && r.icon, 'the pole slot is a family: the heavy pole joins it once bought, with pips', JSON.stringify([r.t2, r.t2b, r.t3, r.pips, r.sel5]));
  ok(r.tip, 'picking a tool shows its tip card (the Builder\'s #hotTip)');
  ok(r.fly && r.air > 0.8, 'his throw is the Builder\'s flight: the same line, lob and time, in the air for a moment', JSON.stringify([r.fly, r.air]));
  ok(r.padAt && Math.hypot(r.padAt[0] - r.padWant[0], r.padAt[1] - r.padWant[1]) < 1e-9 && r.padNone === null, 'a guest\'s pad cursor becomes his aim point (none: auto-aim)', JSON.stringify([r.padAt, r.padNone]));
  ok(r.aim && Math.abs(r.aim[0] - 2) < 0.05 && Math.abs(r.aim[1] + 1.5) < 0.05, 'the Rootkeeper\'s throw lands where the mouse points', JSON.stringify(r.aim));
  ok(r.bAim && Math.hypot(r.bAim[0] - r.bWant[0], r.bAim[1] - r.bWant[1]) < 1e-9, 'a remote Builder\'s throw aims at his own cursor (not the host\'s)', JSON.stringify(r.bAim));
  ok(Math.abs(r.k1 - 0.2) < 1e-9 && r.k2 < r.k1, 'his camera kick decays', JSON.stringify([r.k1, r.k2]));
  await shot('k_hotbar');

  // ================= 17. when his world says NO: every refusal has a voice (FEEDBACK.md "3-player mode": burner-busy, rk-bounce, rk-nope, burner-open, trap-dry, trap-full, mirror-blocked, collector-idle, burner-ash-throw) =================
  r = await run(() => {
    const W = __wands; W.start3(1, { me: 2 }); W.UI.help(false); W.G.helpT = 0; W.CFG.world.cap = 0;
    const G = W.G, u = G.u, M3 = W.M3, FA = W.FA, WZ = W.WZ, CFG = W.CFG, rk = u.rk, C = CFG.mode3, o = {};
    const T = { step: n => W.step3(0.05, n) };
    const ELSum = h => h.air + h.water + h.fire + h.earth;
    G.fb = {};
    const bu = u.bld.find(b => b.type === 'burner'), py = u.bld.find(b => b.type === 'pylon'), tree = u.bld.find(b => b.type === 'node' && b.nk === 'tree');
    const farPy = { x: bu.x, y: bu.y + 40 };
    const pyHome = [py.x, py.y]; py.x = farPy.x; py.y = farPy.y;   // (out of the way: only the burner is a receiver in reach)
    const stand = (x, y) => { rk.x = x; rk.y = y; rk.fx = 1; rk.fy = 0; rk.vx = rk.vy = 0; rk.roll = 0; rk.throwCd = 0; rk.tool = null; rk.at = null; };
    const clearHop = b => { for (const e in b.hop) b.hop[e] = 0; };
    const total = () => u.items.length + rk.hands.length + u.fly.length + ['air', 'water', 'fire', 'earth'].reduce((a, e) => a + u.bank[e] + bu.hop[e], 0);
    const icons = p => p.ic.map(i => i[0]).join('+');
    // ---- the calibration case: a Burner burns ONE type at a time
    clearHop(bu); bu.el = 'water'; bu.burn = 9; bu.bel = 'fire';
    o.type1 = M3.burnerType(bu); o.acc = [M3.accepts(bu, 'rem_water'), M3.accepts(bu, 'rem_fire'), M3.accepts(py, 'rem_water'), M3.accepts(tree, 'rem_water'), M3.accepts(bu, 'n_tree')];
    clearHop(bu); bu.burn = 0; o.idle = [M3.burnerType(bu), M3.accepts(bu, 'rem_earth')];
    bu.hop.fire = 2; o.hopper = [M3.burnerType(bu), M3.accepts(bu, 'rem_water'), M3.accepts(bu, 'rem_fire')];
    bu.hop.air = 1; bu.el = 'fire'; o.mixed = M3.burnerType(bu); clearHop(bu);
    stand(bu.x - 3, bu.y); bu.burn = 9; bu.bel = 'fire'; rk.hands = ['rem_water'];
    T.step(1); o.lead = rk.aim ? { to: rk.aim.to === bu.id, ok: rk.aim.ok } : null;
    o.list = M3.throwList('rem_water').map(c => [c.obj.type, c.prio]);
    u.items.length = 0;   // (so every remain counted below is one of ours)
    const before = total(), fb0 = G.fb['burner-busy'] || 0;
    W.UI.cueUntil = [0, 0, 0, 0];
    M3.throwOne(undefined, { x: bu.x, y: bu.y, to: bu.id });
    T.step(10);   // (it lands)
    o.hop1 = ELSum(bu.hop); o.boing = u.fly.some(f => f.boing); o.no = bu.no ? { cur: bu.no.cur, k: bu.no.k, t: bu.no.t > 0 } : null;
    o.pops = u.pops.map(icons);
    o.fbBusy = (G.fb['burner-busy'] || 0) - fb0;
    o.cueLevel = W.UI.cueLevel();
    T.step(16);
    const back = u.items.filter(i => i.k === 'rem_water' && Math.hypot(i.x - rk.x, i.y - rk.y) < 4);
    o.back = back.length; o.conserved = total() === before; o.onBurner = u.items.some(i => Math.hypot(i.x - bu.x, i.y - bu.y) < 0.6);
    // the type it burns is taken as before
    rk.hands = ['rem_fire']; rk.throwCd = 0; M3.throwOne(undefined, { x: bu.x, y: bu.y, to: bu.id }); T.step(14);
    o.fireIn = bu.hop.fire;
    // an idle, empty Burner takes whatever comes
    clearHop(bu); bu.burn = 0; bu.no = null; rk.hands = ['rem_earth']; rk.throwCd = 0; M3.throwOne(undefined, { x: bu.x, y: bu.y, to: bu.id }); T.step(14);
    o.idleTook = bu.hop.earth + (bu.bel === 'earth' && bu.burn > 0 ? 1 : 0);
    // ---- a throw at a building that takes no remains, and at water
    const pole = M3.make('pole', bu.x - 6, bu.y + 3); stand(pole.x - 3, pole.y);
    let f = FA.flightOf('rem_air', rk.x, rk.y, pole.x, pole.y, { to: null }); f.t = f.T; u.fly.push(f); const b0 = total(); const fbb = G.fb['rk-bounce'] || 0; M3.flyTick(0.05);
    o.poleBounce = u.fly.some(q => q.boing) && (G.fb['rk-bounce'] || 0) === fbb + 1; o.poleIcons = icons(u.pops[u.pops.length - 1]);
    T.step(16); o.poleBack = !u.items.some(i => Math.hypot(i.x - pole.x, i.y - pole.y) < 0.6) && total() === b0;
    let wet = null; for (let y = 20; y < 180 && !wet; y += 1) for (let x = 20; x < 180 && !wet; x += 1) if (M3.wetU(x + 0.5, y + 0.5) && !M3.blockedU(x - 2.5, y + 0.5, 0.4) && !M3.blockedU(x - 3.5, y + 0.5, 0.4) && M3.free(x - 3, y + 0.5, 3)) wet = [x + 0.5, y + 0.5];
    o.wet = !!wet;
    if (wet) { stand(wet[0] - 3, wet[1]); f = FA.flightOf('rem_air', rk.x, rk.y, wet[0], wet[1], { to: null }); f.t = f.T; u.fly.push(f); const b1 = total(); const fb1 = G.fb['rk-bounce'] || 0; M3.flyTick(0.05); o.wetBounce = u.fly.some(q => q.boing) && (G.fb['rk-bounce'] || 0) === fb1 + 1; T.step(16); o.wetBack = total() === b1 && !u.items.some(i => M3.blockedU(i.x, i.y, 0.1)); }
    // ---- presses and placements that cannot happen say why (and what is in the way)
    for (const k of ['air', 'water', 'fire', 'earth']) u.bank[k] = 20;
    py.x = pyHome[0]; py.y = pyHome[1];
    stand(py.x - 1.4, py.y); rk.tool = 'burner'; const n0 = G.fb['rk-nope'] || 0; u.pops.length = 0;
    o.placed = !!M3.place('burner'); o.nopeIc = u.pops.length ? icons(u.pops[u.pops.length - 1]) : null; o.nope1 = (G.fb['rk-nope'] || 0) - n0;
    if (wet) { stand(wet[0] - 1.4, wet[1]); rk.tool = 'burner'; u.pops.length = 0; o.placedWet = !!M3.place('burner'); o.wetIc = u.pops.length ? icons(u.pops[u.pops.length - 1]) : null; }
    rk.tool = null;
    // a grown node: the use button says so
    tree.up = true; o.grown = (a => ({ label: /Grown/.test(a.label), fn: !!a.fn, ic: (a.ic || []).join('+') }))(M3.actionFor({ kind: 'bld', o: tree }, 'use')); o.grownPick = !!M3.actionFor({ kind: 'bld', o: tree }, 'pick').label; tree.up = false;
    return o;
  });
  ok(r.type1 === 'fire' && r.acc[0] === false && r.acc[1] === true && r.acc[2] === true && r.acc[3] === false && r.acc[4] === false, 'a Burner burns ONE type: burning fire it turns water away, takes fire; a pylon takes any; nothing else takes remains', JSON.stringify([r.type1, r.acc]));
  ok(r.idle[0] === null && r.idle[1] === true && r.hopper[0] === 'fire' && r.hopper[1] === false && r.hopper[2] === true && r.mixed === 'fire', 'idle and empty it takes any type; a waiting hopper commits it to that type (its set type first)', JSON.stringify([r.idle, r.hopper, r.mixed]));
  ok(r.lead && r.lead.to && r.lead.ok === false, 'the lead line shows the busy Burner as a receiver that will bounce (red)', JSON.stringify(r.lead));
  ok(r.list.length === 1 && r.list[0][0] === 'burner' && r.list[0][1] === 3, 'a Burner that would turn it away is still a target but a poorer one (auto-aim prefers receivers that take it)', JSON.stringify(r.list));
  ok(r.hop1 === 0 && r.boing && r.fbBusy === 1, 'a wrong-type remain thrown at an active Burner is REJECTED: not in the hopper, it springs back (the Builder\'s boing flight)', JSON.stringify([r.hop1, r.boing, r.fbBusy]));
  ok(r.no && r.no.cur === 'fire' && r.no.k === 'water' && r.no.t, 'the Burner says what it IS burning (its tag: fire) and what was refused', JSON.stringify(r.no));
  ok(r.pops.some(p => p === 'rem_water+ic_x'), 'an icon row where it came down: the refused remain + x', JSON.stringify(r.pops));
  ok(r.cueLevel >= 1, 'the refusal raises the resource-loss cue tier (on the Rootkeeper\'s machine)', r.cueLevel);
  ok(r.back === 1 && r.conserved && !r.onBurner, 'the bounced remain lands back by him and nothing is consumed or lost', JSON.stringify([r.back, r.conserved, r.onBurner]));
  ok(r.fireIn >= 1, 'the type it burns is taken as before', r.fireIn);
  ok(r.idleTook >= 1, 'an idle empty Burner takes any type', r.idleTook);
  ok(r.poleBounce && r.poleIcons === 'rem_air+u_pole+ic_x' && r.poleBack, 'a remain thrown at a building that takes none bounces back, with that building\'s picture and x', JSON.stringify([r.poleBounce, r.poleIcons, r.poleBack]));
  ok(r.wet && r.wetBounce && r.wetBack, 'a remain thrown into water or a chasm bounces back (no ground to lie on) instead of being moved silently', JSON.stringify([r.wet, r.wetBounce, r.wetBack]));
  ok(!r.placed && r.nopeIc === 'u_pylon+ic_x' && r.nope1 === 1, 'a placement blocked by a building names it (its picture + x) and counts rk-nope', JSON.stringify([r.placed, r.nopeIc, r.nope1]));
  ok(!r.placedWet && r.wetIc === 'ic_x', 'a placement on water is a bare x', r.wetIc);
  ok(r.grown.label && !r.grown.fn && /ic_check/.test(r.grown.ic) && !r.grownPick, 'the use button on a grown node says it is grown (instead of doing nothing)', JSON.stringify([r.grown, r.grownPick]));

  // ---- state cues: burning with no hose, a dry trap, a full trap, a blocked mirror, an idle collector, a full ash tray
  r = await run(() => {
    const W = __wands, G = W.G, u = G.u, M3 = W.M3, FA = W.FA, WZ = W.WZ, CFG = W.CFG, rk = u.rk, C = CFG.mode3, o = {};
    const T = { step: n => W.step3(0.05, n) };
    const icons = p => p.ic.map(i => i[0]).join('+');
    const bu = u.bld.find(b => b.type === 'burner'), col = u.bld.find(b => b.type === 'collector'), mir = u.bld.find(b => b.type === 'mirror');
    const spot = (x0, y0) => { for (let d = 3; d < 30; d += 0.7) for (let a = 0; a < 6.28; a += 0.4) { const x = Math.floor(x0 + Math.cos(a) * d) + 0.5, y = Math.floor(y0 + Math.sin(a) * d) + 0.5; if (!M3.blockedU(x, y, 0.5) && M3.free(x, y, 3.2)) return [x, y]; } return null; };
    G.fb = {}; rk.x = bu.x; rk.y = bu.y + 3; rk.vx = rk.vy = 0;
    // burner-open
    let s = spot(bu.x, bu.y); const nb = M3.make('burner', s[0], s[1], { el: 'air' }); nb.hop.air = 3; u.pops.length = 0;
    T.step(44);
    o.open = [nb.open, nb.openT > 1.5, G.fb['burner-open'] || 0, u.pops.some(p => icons(p) === 'ic_hose+ic_x')];
    const node = M3.make('node', nb.x + 2, nb.y + 1, { nk: 'tree' }); M3.link(nb, node); T.step(30); o.openGone = [nb.open, nb.openSeen];
    // a Burner that feeds only a Collector is connected
    const cl = M3.make('collector', nb.x - 2, nb.y - 1); M3.unlink(nb.id, node.id); M3.link(nb, cl); T.step(30); o.openCol = nb.open;
    // a dry trap: a foe walks through it
    s = spot(bu.x, bu.y); const tp = M3.make('trap', s[0], s[1], { tk: 'dmg' }); tp.fuel = 0; G.w.enemies.length = 0; u.pops.length = 0;
    const e = WZ.makeEnemy('golem', tp.x, tp.y); e.hp = e.maxHp = 1e6; e.spd = 0; e.dazeT = 1e6;
    T.step(12); o.dry = [tp.dryT > 0, G.fb['trap-dry'] || 0, u.pops.some(p => icons(p) === 'earth+ic_starve')];
    const dry1 = G.fb['trap-dry']; T.step(6); o.dryThrottle = (G.fb['trap-dry'] || 0) <= dry1 + 1;
    tp.fuel = 12; tp.arm = 0; tp.dryT = 0; const dry2 = G.fb['trap-dry']; T.step(6); o.fires = tp.fuel < 12 && (G.fb['trap-dry'] || 0) === dry2; G.w.enemies.length = 0;
    // a full trap wastes a pulse
    tp.fuel = C.traps.dmg.store; tp.fullT = 0; u.pops.length = 0; M3.deliver(tp, 'earth', 1); const nPop = u.pops.length; M3.deliver(tp, 'earth', 1);
    o.full = [tp.fullT > 0, G.fb['trap-full'] || 0, nPop, u.pops.length];
    // a mirror whose Harvester has no room
    const h = FA.byId(mir.hid); h.out.length = 0; while (h.out.length < CFG.buffer) h.out.push({ kind: mir.el }); mir.ch = 1; u.pops.length = 0; const fl = G.fac.floor.length + G.fac.flying.length;
    M3.mirrorSend(mir);
    o.blocked = [G.fb['mirror-blocked'] || 0, u.pops.some(p => icons(p) === mir.el + '+ic_jam'), G.fac.floor.length + G.fac.flying.length > fl, G.fb['below-packet'] > 0];
    // an idle Collector (hosed to no Burner) says so, near him; hosing it fixes it
    col.ct = 0; T.step(2); o.idle0 = col.idle; rk.x = col.x + 1; rk.y = col.y + 1; G.fb['collector-idle'] = 0; T.step(14); o.idleFb = G.fb['collector-idle'] || 0;
    const p = M3.make('pole', (bu.x + col.x) / 2, (bu.y + col.y) / 2); M3.link(bu, p); M3.link(p, col); col.ct = 0; T.step(2); o.idle1 = col.idle;
    // a Burner whose ash tray is full takes a thrown remain but says it cannot burn it
    for (const k in bu.hop) bu.hop[k] = 0; bu.burn = 0; bu.no = null; bu.ash.air = C.burner.ashCap; rk.x = bu.x - 3; rk.y = bu.y; rk.fx = 1; rk.fy = 0; rk.throwCd = 0; rk.hands = ['rem_water']; u.pops.length = 0;
    M3.throwOne(undefined, { x: bu.x, y: bu.y, to: bu.id }); T.step(14);
    o.ash = [bu.hop.water, G.fb['burner-ash-throw'] || 0, u.pops.some(p => /^ash_.*\+ic_full$/.test(icons(p)))];
    // the tiers: a loss-tier cue holds ambient toasts back on HIS machine only
    W.UI.cueUntil = [0, 0, 0, 0]; const role0 = M3.myRole; M3.myRole = () => 'W'; M3.fb('rk-bounce'); o.tierW = W.UI.cueLevel(); M3.myRole = () => 'K'; M3.fb('rk-bounce'); o.tierK = W.UI.cueLevel(); M3.myRole = role0;
    // his error sound is his alone
    const log = [], orig = AU.sfx; AU.sfx = function (n) { log.push(n); return orig.apply(AU, arguments); };
    rk.hands = []; while (rk.hands.length < M3.cap()) rk.hands.push('rem_air'); M3.addItem('rem_fire', rk.x + 0.4, rk.y); rk.fx = 1; rk.fy = 0;
    const play = role => { M3.myRole = () => role; log.length = 0; M3.interact('pick', false); return log.filter(n => n === 'error').length; };
    o.errK = play('K'); o.errW = play('W'); o.errB = play('B'); M3.myRole = role0; AU.sfx = orig;
    return o;
  });
  ok(r.open[0] === 1 && r.open[1] && r.open[2] === 1 && r.open[3], 'a Burner burning with nothing on its hoses says so (a coil of hose, crossed out)', JSON.stringify(r.open));
  ok(r.openGone[0] === 0 && r.openGone[1] === 0 && r.openCol === 0, 'hosing it to a consumer (or a Collector) clears the cue', JSON.stringify([r.openGone, r.openCol]));
  ok(r.dry[0] && r.dry[1] >= 1 && r.dry[2] && r.dryThrottle, 'a foe walking through an unfueled trap shows what it wants (its element, starved), rate limited', JSON.stringify([r.dry, r.dryThrottle]));
  ok(r.fires, 'a fueled trap fires as before and does not complain');
  ok(r.full[0] && r.full[1] === 1 && r.full[2] === 1 && r.full[3] === 1, 'a pulse reaching a FULL trap pops the full icon once (rate limited)', JSON.stringify(r.full));
  ok(r.blocked[0] === 1 && r.blocked[1] && r.blocked[2] && r.blocked[3], 'a mirror packet that finds its Harvester\'s output full says so (jam), the packet falls on the floor, the Builder\'s cue still fires', JSON.stringify(r.blocked));
  ok(r.idle0 === 1 && r.idleFb >= 1 && r.idle1 === 0, 'a Collector hosed to no Burner says so near him; hosing it clears it', JSON.stringify([r.idle0, r.idleFb, r.idle1]));
  ok(r.ash[0] === 1 && r.ash[1] === 1 && r.ash[2], 'a remain thrown into a Burner with a full ash tray is taken but the ash + full icon pop at once', JSON.stringify(r.ash));
  ok(r.tierW === 0 && r.tierK >= 1, 'cue tiers apply on the Rootkeeper\'s machine only (a Wizard host is not held back by what happens below)', JSON.stringify([r.tierW, r.tierK]));
  ok(r.errK === 1 && r.errW === 0 && r.errB === 0, 'the error sound of a press that cannot happen is his alone', JSON.stringify([r.errK, r.errW, r.errB]));
  await run(() => { const W = __wands, u = W.G.u, bu = u.bld.find(b => b.type === 'burner'); bu.no = { k: 'water', cur: 'fire', t: 2 }; bu.burn = 5; bu.bel = 'fire'; W.G.u.rk.x = bu.x - 2; W.G.u.rk.y = bu.y; });
  await photo('the Rootkeeper\'s refusals on screen');
  await shot('k_refusals');

  ok(errs.length === 0, 'no page errors', errs.slice(0, 5).join(' | '));
  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
