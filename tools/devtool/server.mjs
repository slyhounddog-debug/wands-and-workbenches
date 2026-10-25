// Wands & Workbenches dev tool: Layout / Variables / Formulas / Audio tabs + git buttons.   node tools/devtool/server.mjs   (PORT=8090 by default)
//
// No dependencies. It serves the tool at / and the game under /game/ from this same origin, so the tool page can
// reach into the preview iframe (a cross-origin iframe can't be inspected). The preview is the real index.html plus an
// inline script that seeds a fixture save into the preview's own storage, mutes all audio, skips the studio intro and
// loads the in-preview editor before any game script runs.
//
// The game's own files are never written. Every save lands in overrides/ (JSON source of truth + the generated
// .css / .js the game loads, written atomically):
//   overrides/layout.json -> layout.css + layout.js     overrides/tuning.json -> tuning.js
//   overrides/audio.json  -> audio.js, clips in overrides/audio/<name>.js
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execFile } from 'child_process';
import { createHash } from 'crypto';

const TOOL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL, '..', '..');
const PUB = path.join(TOOL, 'public');
const OVR = path.join(ROOT, 'overrides');
const PORT = +process.env.PORT || 8090;
createRequire(import.meta.url)('./public/layout-model.js');   // classic script: sets globalThis.LayoutModel
const LM = globalThis.LayoutModel;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const AUDIO_MIME = /^audio\/(wav|wave|x-wav|mpeg|mp3|ogg|webm|mp4|x-m4a|aac|flac|x-flac)$/;
const GAME_PATHS = /^(js|fonts|audio|overrides)\/|^style\.css$/;   // what /game/ may serve (mirrors what index.html loads)

// ---------- helpers ----------
const writeAtomic = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', text); fs.renameSync(file + '.tmp', file); };
const readJson = (file, dflt) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return dflt; } };
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJsonBody = async (req, limit) => JSON.parse((await readBody(req, limit || 4e6)).toString('utf8') || 'null');
function serveFile(res, file, type) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}
const inside = (base, rel) => { const f = path.resolve(base, rel); return f.startsWith(base + path.sep) ? f : null; };

// ---------- presets (read per request, so edits need no restart) ----------
const readPresets = () => JSON.parse(fs.readFileSync(path.join(TOOL, 'presets.json'), 'utf8'));

// ---------- the game, with the seed + editor injected ----------
function gamePage(query) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  let save = null;
  const fx = readPresets().fixtures.find(f => f.id === query.get('fixture'));
  if (fx) { try { save = fs.readFileSync(path.join(ROOT, fx.file), 'utf8'); } catch (e) { /* missing fixture: boot without a save */ } }
  const seed = `
window.__layoutEditor = true;
try {
  // the preview shares this origin's storage with the tool: only the game's own keys go
  for (const k of Object.keys(localStorage)) if (k.indexOf('wands') === 0) localStorage.removeItem(k);
  ${save ? `localStorage.setItem('wands2_save_slot1', ${JSON.stringify(save.trim()).replace(/</g, '\\u003c')});` : ''}
  sessionStorage.setItem('wands_skip_studio_intro', '1');
} catch (e) {}
// silent preview: media never starts and nothing is ever connected to the speakers
HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
(function () {
  var connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest) { return dest instanceof AudioDestinationNode ? dest : connect.apply(this, arguments); };
})();`;
  return html.replace(/<head>/i, `<head>\n<script>${seed}</script>\n<script src="/app/layout-model.js"></script>\n<script src="/app/layout-host.js"></script>`);
}

// ---------- layout ----------
function saveLayout(body) {
  const model = LM.sanitizeModel(body);
  writeAtomic(path.join(OVR, 'layout.json'), JSON.stringify(model, null, 2) + '\n');
  writeAtomic(path.join(OVR, 'layout.css'), LM.CSS_HEADER + LM.modelToCss(model) + (model.rules.length ? '\n' : ''));
  writeAtomic(path.join(OVR, 'layout.js'), '// GENERATED by the dev tool\'s Layout tab from overrides/layout.json (text overrides, applied by js/overrides.js).\nwindow.LAYOUT = ' + JSON.stringify(model) + ';\n');
  return { ok: true, rules: model.rules.length };
}

// ---------- tuning ----------
const PATH_OK = /^[A-Za-z_][A-Za-z0-9_]*(\.#?[A-Za-z0-9_]+){0,6}$/;
function saveTuning(body) {
  const values = {};
  for (const [k, v] of Object.entries((body && body.values) || {})) if (PATH_OK.test(k) && typeof v === 'number' && isFinite(v)) values[k] = v;
  writeAtomic(path.join(OVR, 'tuning.json'), JSON.stringify({ version: 1, values }, null, 2) + '\n');
  writeAtomic(path.join(OVR, 'tuning.js'), '// GENERATED by the dev tool\'s Variables tab from overrides/tuning.json: CFG paths -> values (applied in config.js).\nwindow.TUNING = ' + JSON.stringify(values, null, 1) + ';\n');
  return { ok: true, values: Object.keys(values).length };
}

// ---------- audio ----------
const NAME_OK = /^[a-z][a-z0-9_]{0,40}$/;
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
function cleanClip(name, c) {
  return {
    file: name + '.js', mime: AUDIO_MIME.test(c.mime || '') ? c.mime : 'audio/wav', label: String(c.label || '').slice(0, 120),
    start: num(c.start, 0, 3600, 0), end: c.end == null ? null : num(c.end, 0, 3600, null),
    gain: num(c.gain, 0, 8, 1), fadeIn: num(c.fadeIn, 0, 60, 0), fadeOut: num(c.fadeOut, 0, 60, 0),
    rate: num(c.rate, 0.1, 4, 1), reverse: !!c.reverse, loop: !!c.loop,
  };
}
const readAudio = () => readJson(path.join(OVR, 'audio.json'), { version: 1, clips: {} });
function writeAudio(clips) {
  const out = {};
  for (const name of Object.keys(clips).sort()) if (NAME_OK.test(name) && fs.existsSync(path.join(OVR, 'audio', name + '.js'))) out[name] = cleanClip(name, clips[name]);
  writeAtomic(path.join(OVR, 'audio.json'), JSON.stringify({ version: 1, clips: out }, null, 2) + '\n');
  writeAtomic(path.join(OVR, 'audio.js'), '// GENERATED by the dev tool\'s Audio tab from overrides/audio.json: sound name -> clip file + edit params (js/audio.js).\nwindow.AUDIO_OV = ' + JSON.stringify(out, null, 1) + ';\n');
  return out;
}
function clipData(name) {   // the stored data: URL inside overrides/audio/<name>.js
  const js = fs.readFileSync(path.join(OVR, 'audio', name + '.js'), 'utf8');
  const m = /"(data:[^"]+)"/.exec(js);
  return m ? m[1] : null;
}

// ---------- game music (the layered soundtrack: trim the loop, rebuild the four layer files from the stems) ----------
// The loop span lives in overrides/music.json; tools/musicbuild/build.js merges it over its defaults and re-encodes
// audio/music/music_<element>.js (an ffmpeg job of a minute or so). The tab previews the loop from the stems themselves.
const MB = createRequire(import.meta.url)('../musicbuild/build.js');
let musicBusy = false;
const stemFiles = () => { try { return fs.readdirSync(MB.STEMS).filter(f => /\.mp3$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b)); } catch (e) { return []; } };
function musicInfo() {
  const D = MB.CONFIG, saved = MB.loopOverride();
  const cfg = Object.assign({ startSample: D.startSample, lengthSamples: D.lengthSamples, xfade: D.xfade }, saved);
  return { sr: MB.SR, defaults: { startSample: D.startSample, lengthSamples: D.lengthSamples, xfade: D.xfade }, config: cfg, custom: Object.keys(saved).length > 0,
    layers: D.layers, stems: stemFiles().map((f, i) => ({ i, name: f.replace(/^\d+ /, '').replace(/\.mp3$/i, '') })), limit: D.limit };
}
function musicBuild() {
  return new Promise(resolve => execFile(process.execPath, [path.join(ROOT, 'tools', 'musicbuild', 'build.js')], { cwd: ROOT, maxBuffer: 32e6, timeout: 600000, windowsHide: true },
    (err, out, errOut) => resolve({ ok: !err, log: String(out || '').trim().split('\n').filter(Boolean), error: err ? String(errOut || err.message).trim().split('\n').slice(-6).join('\n') : null })));
}
async function saveMusic(body) {
  if (musicBusy) throw new Error('A music build is already running.');
  const b = body || {}, SR = MB.SR;
  const loop = {
    startSample: Math.round(num(b.startSample, 0, SR * 3600, 0)), lengthSamples: Math.round(num(b.lengthSamples, SR * 2, SR * 3600, 0)),
    xfade: num(b.xfade, 0, 9, 0.5),
  };
  if (!loop.lengthSamples) throw new Error('The loop needs a length.');
  const file = path.join(OVR, 'music.json'), before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  musicBusy = true;
  try {
    writeAtomic(file, JSON.stringify(loop, null, 2) + '\n');
    const r = await musicBuild();
    if (!r.ok) { if (before == null) fs.rmSync(file, { force: true }); else writeAtomic(file, before); return { ok: false, error: 'The build failed (is ffmpeg on the PATH?): ' + r.error, log: r.log }; }
    return { ok: true, log: r.log, info: musicInfo() };
  } finally { musicBusy = false; }
}
async function resetMusic() {
  if (musicBusy) throw new Error('A music build is already running.');
  musicBusy = true;
  try {
    const file = path.join(OVR, 'music.json'), before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    fs.rmSync(file, { force: true });
    const r = await musicBuild();
    if (!r.ok) { if (before != null) writeAtomic(file, before); return { ok: false, error: 'The build failed: ' + r.error, log: r.log }; }
    return { ok: true, log: r.log, info: musicInfo() };
  } finally { musicBusy = false; }
}

// ---------- git (Commit & push / Reset buttons) ----------
// Both actions are two-step: GET /api/git shows exactly what would happen and carries a signature (HEAD + status +
// unpushed commits); the POST must send that signature back, and is refused if the repo changed in between.
const sha1 = s => createHash('sha1').update(s).digest('hex');
function git(args, input) {
  return new Promise(resolve => {
    const p = execFile('git', ['-c', 'core.quotepath=false'].concat(args), { cwd: ROOT, maxBuffer: 32e6, timeout: 180000, windowsHide: true, env: Object.assign({}, process.env, { LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' }) },
      (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), err: String(errOut || (err && err.message) || '').trim() }));
    if (input != null) p.stdin.end(input);
  });
}
let gitBusy = false;
// A commit message written from the file list, so the Commit window never needs one typed: "Update dev tool, audio" plus a line per file.
const AREAS = [[/^tools\/devtool\//, 'dev tool'], [/^tools\/musicbuild\//, 'music build'], [/^tools\//, 'tools'], [/^overrides\//, 'dev tool overrides'], [/^audio\//, 'audio'],
  [/^fonts\//, 'fonts'], [/^js\/([^/]+)\.js$/, null], [/^js\//, 'game code'], [/^style\.css$/, 'styles'], [/^index\.html$/, 'page'], [/^CLAUDE\.md$/, 'notes'], [/\.md$/, 'docs']];
function suggestMessage(files) {
  if (!files.length) return '';
  const areas = [];
  for (const f of files) {
    let a = 'project files';
    for (const [re, name] of AREAS) { const m = re.exec(f.path); if (m) { a = name || 'js/' + m[1]; break; } }
    if (!areas.includes(a)) areas.push(a);
  }
  const code = areas.filter(a => a.startsWith('js/')).map(a => a.slice(3)), rest = areas.filter(a => !a.startsWith('js/'));
  const parts = (code.length ? ['game code (' + (code.length > 4 ? code.slice(0, 4).join(', ') + ' +' + (code.length - 4) : code.join(', ')) + ')'] : []).concat(rest);
  const kinds = new Set(files.map(f => f.st)), verb = kinds.size === 1 && kinds.has('D') ? 'Remove' : kinds.size === 1 && (kinds.has('?') || kinds.has('A')) ? 'Add' : 'Update';
  let subject = verb + ' ' + parts.join(', ');
  if (subject.length > 72) { const cut = parts.slice(0, 3).join(', '); subject = verb + ' ' + cut + ' and more'; }
  const lines = files.slice(0, 30).map(f => '- ' + ({ M: 'modified', A: 'added', D: 'deleted', R: 'renamed', '?': 'added' }[f.st] || 'changed') + ' ' + (f.from ? f.from + ' -> ' : '') + f.path
    + (f.add != null || f.del != null ? ' (+' + (f.add ?? '?') + ' -' + (f.del ?? '?') + ')' : ''));
  if (files.length > 30) lines.push('- ...and ' + (files.length - 30) + ' more files');
  return subject + '\n\n' + lines.join('\n');
}
async function gitInfo() {
  const [branch, head, up, stat, nums] = await Promise.all([git(['rev-parse', '--abbrev-ref', 'HEAD']), git(['rev-parse', 'HEAD']), git(['rev-parse', '--abbrev-ref', '@{u}']),
    git(['status', '--porcelain', '-z', '-uall']), git(['diff', 'HEAD', '--numstat'])]);
  if (!branch.ok) throw new Error('not a git repository: ' + branch.err);
  const upstream = up.ok ? up.out.trim() : null;
  const files = [], parts = stat.out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i]; if (e.length < 4) continue;
    const xy = e.slice(0, 2); let file = e.slice(3), from = null;
    if (xy[0] === 'R' || xy[0] === 'C') from = parts[++i];
    const st = xy === '??' ? '?' : (xy.includes('D') ? 'D' : xy.includes('A') ? 'A' : xy[0] === 'R' ? 'R' : 'M');
    files.push({ path: file, from, st });
  }
  const counts = {};
  for (const l of nums.out.split('\n')) { const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l); if (m) counts[m[3]] = { add: m[1] === '-' ? null : +m[1], del: m[2] === '-' ? null : +m[2] }; }
  for (const f of files) Object.assign(f, counts[f.path] || {});
  let ahead = [], behind = 0;
  if (upstream) {
    const a = await git(['log', '@{u}..HEAD', '--format=%h%x09%s']);
    ahead = a.out.split('\n').filter(Boolean).map(l => { const t = l.split('\t'); return { hash: t[0], subject: t.slice(1).join('\t') }; });
    const b = await git(['rev-list', '--count', 'HEAD..@{u}']); behind = +b.out.trim() || 0;
  }
  const last = await git(['log', '-1', '--format=%h%x09%s']);
  const info = { branch: branch.out.trim(), head: head.out.trim(), upstream, remote: (await git(['remote', 'get-url', 'origin'])).out.trim(), files, ahead, behind, last: last.out.trim() };
  info.suggest = suggestMessage(files);
  info.sig = sha1(JSON.stringify([info.head, stat.out, ahead.map(c => c.hash)]));
  return info;
}
async function gitCommit(body) {
  const info = await gitInfo();
  if (!body || body.sig !== info.sig) throw new Error('The repository changed since the window opened. Close it and try again.');
  const msg = String(body.message || '').trim() || info.suggest;   // an empty box commits with the generated summary
  const log = [];
  if (info.files.length) {
    const add = await git(['add', '-A']); if (!add.ok) throw new Error('git add failed: ' + add.err);
    const c = await git(['commit', '-F', '-'], msg + '\n');
    if (!c.ok) throw new Error('git commit failed: ' + (c.err || c.out));
    log.push(c.out.trim().split('\n')[0]);
  } else if (!info.ahead.length) throw new Error('Nothing to commit or push.');
  const push = await git(info.upstream ? ['push'] : ['push', '-u', 'origin', info.branch]);
  if (!push.ok) return { ok: false, committed: !!info.files.length, log, error: 'Push failed (the commit is saved locally): ' + push.err };
  log.push('Pushed to ' + (info.upstream || 'origin/' + info.branch));
  return { ok: true, log };
}
async function gitReset(body) {
  const info = await gitInfo();
  if (!body || body.sig !== info.sig) throw new Error('The repository changed since the window opened. Close it and try again.');
  const mode = body.mode === 'unpushed' ? 'unpushed' : 'changes';
  if (mode === 'unpushed' && !info.upstream) throw new Error('This branch has no upstream to reset to.');
  const r = await git(['reset', '--hard', mode === 'unpushed' ? '@{u}' : 'HEAD']); if (!r.ok) throw new Error('git reset failed: ' + r.err);
  const c = await git(['clean', '-fd']); if (!c.ok) throw new Error('git clean failed: ' + c.err);
  return { ok: true, log: [r.out.trim(), c.out.trim().split('\n').filter(Boolean).length + ' untracked file(s) removed'].filter(Boolean) };
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
  try {
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(PUB, 'index.html'));
    if (p.endsWith('/favicon.ico')) { res.writeHead(204); return res.end(); }   // neither the tool nor the game has one
    if (p.startsWith('/app/')) { const f = inside(PUB, p.slice(5)); return f ? serveFile(res, f) : send(res, 404, 'nope', 'text/plain'); }
    if (p === '/game') { res.writeHead(302, { Location: '/game/' + url.search }); return res.end(); }   // relative urls need the slash
    if (p === '/game/' || p === '/game/index.html') return send(res, 200, gamePage(url.searchParams), MIME['.html']);
    if (p.startsWith('/game/')) {
      const rel = p.slice(6);
      const f = GAME_PATHS.test(rel) && inside(ROOT, rel);
      return f ? serveFile(res, f) : send(res, 404, 'not part of the game', 'text/plain');
    }

    if (p === '/api/layout' && req.method === 'GET') {
      let model; try { model = LM.sanitizeModel(readJson(path.join(OVR, 'layout.json'))); } catch (e) { model = LM.emptyModel(); }
      return send(res, 200, Object.assign({ model }, readPresets()));
    }
    if (p === '/api/layout' && req.method === 'POST') return send(res, 200, saveLayout(await readJsonBody(req)));

    if (p === '/api/tuning' && req.method === 'GET') return send(res, 200, readJson(path.join(OVR, 'tuning.json'), { version: 1, values: {} }));
    if (p === '/api/tuning' && req.method === 'POST') return send(res, 200, saveTuning(await readJsonBody(req)));

    if (p === '/api/audio' && req.method === 'GET') return send(res, 200, readAudio());
    if (p === '/api/audio' && req.method === 'POST') { const b = await readJsonBody(req); return send(res, 200, { ok: true, clips: writeAudio((b && b.clips) || {}) }); }
    const am = /^\/api\/audio\/([a-z0-9_]+)$/.exec(p);
    if (am) {
      const name = am[1];
      if (!NAME_OK.test(name)) return send(res, 400, { error: 'bad sound name' });
      const all = readAudio().clips;
      if (req.method === 'PUT') {   // upload: raw bytes in the body, Content-Type = the file's audio type
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
        if (!AUDIO_MIME.test(mime)) return send(res, 400, { error: 'not an audio file the browser can decode (' + mime + ')' });
        const bytes = await readBody(req, 60e6);
        if (!bytes.length) return send(res, 400, { error: 'empty file' });
        const dataUrl = 'data:' + mime + ';base64,' + bytes.toString('base64');
        writeAtomic(path.join(OVR, 'audio', name + '.js'), '// GENERATED by the dev tool\'s Audio tab: the "' + name + '" clip.\n(window.AUDIO_DATA = window.AUDIO_DATA || {})["' + name + '"] = "' + dataUrl + '";\n');
        const loop = ['music', 'music_boss', 'hum'].includes(name);
        all[name] = Object.assign({ start: 0, end: null, gain: 1, fadeIn: 0, fadeOut: 0, rate: 1, reverse: false, loop }, { mime, label: String(url.searchParams.get('label') || '') });
        return send(res, 200, { ok: true, clips: writeAudio(all) });
      }
      if (req.method === 'GET') {
        const d = clipData(name);
        if (!d) return send(res, 404, { error: 'no clip' });
        const comma = d.indexOf(',');
        return send(res, 200, Buffer.from(d.slice(comma + 1), 'base64'), d.slice(5, d.indexOf(';')));
      }
      if (req.method === 'DELETE') {
        delete all[name];
        try { fs.unlinkSync(path.join(OVR, 'audio', name + '.js')); } catch (e) { /* already gone */ }
        return send(res, 200, { ok: true, clips: writeAudio(all) });
      }
    }
    if (p === '/api/music' && req.method === 'GET') return send(res, 200, musicInfo());
    if (p === '/api/music' && req.method === 'POST') return send(res, 200, await saveMusic(await readJsonBody(req)));
    if (p === '/api/music' && req.method === 'DELETE') return send(res, 200, await resetMusic());
    const sm = /^\/api\/music\/stem\/(\d+)$/.exec(p);
    if (sm && req.method === 'GET') {
      const f = stemFiles()[+sm[1]];
      return f ? serveFile(res, path.join(MB.STEMS, f), 'audio/mpeg') : send(res, 404, { error: 'no such stem' });
    }
    if (p === '/api/git' && req.method === 'GET') return send(res, 200, await gitInfo());
    if ((p === '/api/git/commit' || p === '/api/git/reset') && req.method === 'POST') {
      if (gitBusy) return send(res, 409, { error: 'Another git action is still running.' });
      gitBusy = true;
      try { const b = await readJsonBody(req); return send(res, 200, await (p.endsWith('commit') ? gitCommit(b) : gitReset(b))); } finally { gitBusy = false; }
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    send(res, 400, { error: String((e && e.message) || e) });
  }
});
server.listen(PORT, () => console.log('Wands & Workbenches dev tool: http://localhost:' + PORT + '/'));
