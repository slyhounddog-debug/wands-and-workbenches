'use strict';
// Every acceptance check in one command, so none gets forgotten:
//   node tools/runall.js                 syntax gate, qolcheck, menucheck, snapcheck, allycheck, bshrcheck, wandcheck, nettest
//   node tools/runall.js --offline       the same without nettest (it needs the internet); the summary says it was SKIPPED
//   node tools/runall.js --only=snapcheck,wandcheck     just those        --list      what there is
//   node tools/runall.js -v              stream every check's own output (otherwise only a failing check's last lines are shown)
// The browser checks need playwright-core (1.56 works; 1.47 cannot launch current Edge) and Edge. Where playwright-core is looked for: PLAYWRIGHT_CORE (a path), a
// node_modules above this folder, the global npm folder. If it is nowhere the browser checks FAIL (they are never silently skipped); install one with
//   npm i playwright-core@1.56.1 --prefix <some folder outside the repo>      then      PLAYWRIGHT_CORE=<that folder>/node_modules/playwright-core
// Exit code: 0 = everything that ran passed, 1 = something failed. Nothing here is part of the game.
const path = require('path'), fs = require('fs'), cp = require('child_process'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), has = a => args.indexOf(a) >= 0;
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const verbose = has('-v') || has('--verbose'), offline = has('--offline');

const CHECKS = [
  { id: 'syntax', what: 'every script parses (js/, api/, tools/)', inline: true },
  { id: 'qolcheck', what: 'headless playthrough with no page errors + the edge bubbles, hit-stop, belt lines, no-power chip, guest sounds', file: 'tools/qolcheck/run.js', browser: true },
  { id: 'menucheck', what: 'the front door: the living menu world', file: 'tools/menucheck/run.js', browser: true },
  { id: 'snapcheck', what: 'the snapshot photo test (no leaks, frames match)', file: 'tools/snapcheck/run.js', browser: true },
  { id: 'allycheck', what: 'Core-grown allies', file: 'tools/allycheck/run.js', browser: true },
  { id: 'bshrcheck', what: 'Battery Shrines: one per Battery, damage becomes charge, saves, the look and health of allies', file: 'tools/bshrcheck/run.js', browser: true },
  { id: 'wandcheck', what: 'the wand, shrines, the four buttons', file: 'tools/wandcheck/run.js', browser: true },
  { id: 'featcheck', what: 'shake cue, allies feel the wand, belt-line chip + link, drag to delete, guest hearing, Altar crater, emotes', file: 'tools/featcheck/run.js', browser: true },
  { id: 'nettest', what: 'online co-op through the real PeerJS cloud (needs the internet)', file: 'tools/nettest/run.js', browser: true, net: true },
];
if (has('--list')) { for (const c of CHECKS) console.log(c.id.padEnd(10), c.what); process.exit(0); }

// ---- where is playwright-core?
function findPlaywright() {
  const tries = [];
  if (process.env.PLAYWRIGHT_CORE) tries.push(process.env.PLAYWRIGHT_CORE);
  for (let d = ROOT; ; d = path.dirname(d)) { tries.push(path.join(d, 'node_modules', 'playwright-core')); if (path.dirname(d) === d) break; }
  try { tries.push(path.join(cp.execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), 'playwright-core')); } catch (e) { /* no npm */ }
  for (const t of tries) if (fs.existsSync(path.join(t, 'package.json'))) return t;
  return null;
}

const SYNTAX_DIRS = ['js', 'api', 'tools'];
function syntaxGate() {
  const files = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'vendor' && e.name !== 'public' && e.name !== 'fixtures') walk(p); }
      else if (/\.(js|mjs|cjs)$/.test(e.name) && !/\.min\.js$/.test(e.name)) files.push(p);
    }
  };
  for (const d of SYNTAX_DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    try {
      if (/\.mjs$/.test(f) || /^\s*(import|export)\s/m.test(src)) cp.execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });   // modules: let node judge
      else new vm.Script(src, { filename: f });
    } catch (e) { bad.push(path.relative(ROOT, f) + ': ' + String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 4).join(' | ')); }
  }
  return { ok: !bad.length, out: bad.length ? bad.join('\n') : files.length + ' files parse' };
}

const results = [];
// a failing check: its FAIL lines first, then the last few lines of its output
function showFails(out) {
  const lines = out.split('\n'), bad = lines.filter(l => /^\s*FAIL\b/.test(l));
  console.log((bad.length ? bad.concat(['   ...']) : []).concat(lines.slice(-8)).map(l => '        ' + l).join('\n'));
}
const run = c => new Promise(resolve => {
  const t0 = Date.now();
  const done = (status, out) => { const r = { id: c.id, status, out, secs: ((Date.now() - t0) / 1000).toFixed(1) }; results.push(r); console.log((status === 'PASS' ? ' PASS ' : status === 'SKIP' ? ' SKIP ' : ' FAIL ') + c.id.padEnd(10) + r.secs.padStart(6) + 's  ' + (status === 'PASS' ? c.what : '')); if (status === 'FAIL') showFails(out); resolve(r); };
  if (c.inline) { const r = syntaxGate(); return done(r.ok ? 'PASS' : 'FAIL', r.out); }
  if (c.net && offline) return done('SKIP', '--offline');
  if (!fs.existsSync(path.join(ROOT, c.file))) return done('FAIL', c.file + ' does not exist');
  const env = Object.assign({}, process.env);
  if (c.browser) { if (!PW) return done('FAIL', 'playwright-core was not found (see the top of tools/runall.js for how to install it)'); env.PLAYWRIGHT_CORE = PW; }
  let out = '';
  const p = cp.spawn(process.execPath, [path.join(ROOT, c.file)], { cwd: ROOT, env });
  const timer = setTimeout(() => { out += '\nTIMED OUT after 15 minutes'; p.kill(); }, 15 * 60 * 1000);
  const take = d => { out += d; if (verbose) process.stdout.write(d); };
  p.stdout.on('data', take); p.stderr.on('data', take);
  p.on('error', e => { clearTimeout(timer); done('FAIL', String(e)); });
  p.on('close', code => {
    clearTimeout(timer);
    const fails = out.split('\n').filter(l => /^\s*FAIL\b/.test(l)).length;
    done(code === 0 && !fails && !/TIMED OUT/.test(out) ? 'PASS' : 'FAIL', out + (code !== 0 ? '\n(exit code ' + code + ')' : ''));
  });
});

const PW = findPlaywright();
(async () => {
  const list = CHECKS.filter(c => !only.length || only.indexOf(c.id) >= 0);
  if (!list.length) { console.log('nothing matches --only=' + only.join(',') + ' (try --list)'); process.exit(1); }
  console.log('runall: ' + list.map(c => c.id).join(', ') + (PW ? '\nplaywright-core: ' + PW : '') + '\n');
  for (const c of list) await run(c);
  const failed = results.filter(r => r.status === 'FAIL'), skipped = results.filter(r => r.status === 'SKIP');
  console.log('\n' + (failed.length ? 'FAILED: ' + failed.map(r => r.id).join(', ') : 'ALL PASSED') + (skipped.length ? '   (SKIPPED: ' + skipped.map(r => r.id).join(', ') + ' - ' + skipped[0].out + ')' : ''));
  process.exit(failed.length ? 1 : 0);
})();
