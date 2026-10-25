'use strict';
// The standing acceptance check: the snapshot photo test (js/snapshot.js) at a few representative moments of a headless run.
// Exits 1 on FAIL (a leak or state issue that is not in Snap.KNOWN, or any pixel difference), 0 on PASS / KNOWN.
//   node tools/snapcheck/run.js            (needs playwright-core and Edge: PLAYWRIGHT_CORE=<path to playwright-core> if it is not resolvable)
// Not part of the game; nothing in the repo depends on it. See CLAUDE.md "Architecture guardrails".
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file:///' + path.resolve(__dirname, '../../index.html').split(path.sep).join('/'));
  await page.waitForSelector('#loadMsg.ready', { timeout: 60000 });
  await page.evaluate(() => { __wands.UI.show('loading', false); __wands.start(1); __wands.UI.help(false); __wands.G.helpT = 0; });

  const moments = [
    ['fresh run', () => {}],
    ['factory running', W => { W.step(0.05, 200); }],
    ['mid-combat', W => { W.egg('egg_zephyr'); W.egg('egg_puddle'); W.egg('egg_cinder'); W.step(0.05, 120); W.deliver('fire'); W.deliver('water'); W.step(0.05, 20); W.event(1); W.step(0.05, 130); }],
    ['spells raging', W => { for (const k of ['flamethrower', 'sandstorm', 'tempest', 'thunder', 'magma', 'earth', 'water']) W.deliver(k); W.step(0.05, 45); }],   // a flame stream, a twister, a storm orb and cloud, a lob, a bouncing boulder, a wave all at once
    ['builder tumbling', W => { W.G.tree.tumble = 2; W.G.hands.push({ kind: 'air' }); W.FA.builderRoll(1, 0); W.step(0.05, 4); }],   // the Builder's roll: somersault, afterimages, the cooldown bar
    ['altar arriving', W => { W.G.tree.summon = true; W.step(0.05, 70); }],   // the Summoning Altar's particles gathering it in mid-air
    ['altar shockwaves', W => { W.step(0.05, 50); }],   // landed, rings running out across the wilds and the factory
    ['altar lit, ritual', W => { W.step(0.05, 80); const A = W.G.altar, w = W.G.w; A.lit = [true, true, true, true]; W.G.flags.warden = true; w.x = A.x - 3; w.y = A.y; w.time = 50; W.step(0.05, 20); }],   // all sockets lit, the Chimera ritual building
    ['boss out', W => { W.boss(); W.step(0.05, 60); }],
    ['skill tree open', W => { W.UI.openTree('L', true); }],
  ];
  let bad = 0;
  const seen = new Map();
  for (const [name, setup] of moments) {
    await page.evaluate(`(${setup.toString()})(__wands)`);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { __wands.snapshot(); const R = __wands.Snap.report; return { verdict: R.verdict, diff: R.diff, leaks: R.leaks, issues: R.issues }; });
    console.log(name.padEnd(18) + r.verdict.padEnd(6) + ' leaks ' + r.leaks.length + ' (new ' + r.leaks.filter(l => !l.known).length + ')  issues ' + r.issues.length + ' (new ' + r.issues.filter(i => !i.known).length + ')  diff ' + r.diff.px + ' px');
    if (r.verdict === 'FAIL') bad++;
    for (const l of r.leaks) if (!seen.has(l.id)) seen.set(l.id, l);
    for (const i of r.issues) if (!seen.has(i.id)) seen.set(i.id, i);
    for (const x of [...r.leaks, ...r.issues].filter(x => !x.known)) console.log('   NEW ' + x.id + (x.at ? ' @ ' + x.at : ''));
    if (r.diff.px) console.log('   frames differ in ' + JSON.stringify(r.diff.bbox));
  }
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); bad++; }
  console.log(bad ? 'SNAPSHOT PHOTO TEST: FAIL' : 'SNAPSHOT PHOTO TEST: ok (known baseline only: ' + seen.size + ' distinct entries)');
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
