// Wands & Workbenches dev tool: Layout / Variables / Audio tabs.   node tools/devtool/server.mjs   (PORT=8090 by default)
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
function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
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
    send(res, 404, 'not found', 'text/plain');
  } catch (e) {
    send(res, 400, { error: String((e && e.message) || e) });
  }
});
server.listen(PORT, () => console.log('Wands & Workbenches dev tool: http://localhost:' + PORT + '/'));
