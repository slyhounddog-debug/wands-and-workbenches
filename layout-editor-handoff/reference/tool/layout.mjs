// Layout tab, server side: serves the game under /game/ (same origin as the tool, so the editor can reach into
// the preview iframe), and reads/writes the overrides the game applies: css/layout.json (source of truth) and
// css/layout.css (generated from it; the game links it). The game's own files are never edited.
import fs from 'fs';
import path from 'path';
import { sanitizeModel, modelToCss, emptyModel, CSS_FILE_HEADER } from './layout-model.js';

export function mount(app, express, ROOT, TOOL_DIR) {
  const JSON_FILE = path.join(ROOT, 'css', 'layout.json');
  const CSS_FILE = path.join(ROOT, 'css', 'layout.css');
  const PRESETS_FILE = path.join(TOOL_DIR, 'layout-presets.json');

  // Read per request so presets/fixtures can be edited without restarting the tool.
  const readPresets = () => JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
  const readModel = () => {
    try { return sanitizeModel(JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'))); } catch { return emptyModel(); }
  };
  const writeAtomic = (file, text) => { fs.writeFileSync(file + '.tmp', text); fs.renameSync(file + '.tmp', file); };

  // ---- the game, served from the tool's own origin ----
  const noStore = (res) => res.set('Cache-Control', 'no-store');
  app.use('/game/js', express.static(path.join(ROOT, 'js')));
  app.use('/game/css', express.static(path.join(ROOT, 'css')));
  app.use('/game/audio', express.static(path.join(ROOT, 'audio')));
  app.get('/game/lighting%20effect.mp4', (req, res) => res.sendFile(path.join(ROOT, 'lighting effect.mp4')));
  app.get('/game/', (req, res) => {              // always linked with the trailing slash (the page's relative js/ css/ urls depend on it)
    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    // The same page the player gets, plus: (1) a save seeded into localStorage BEFORE the game's modules run, with
    // the Layout tab's mode flag and muted music; (2) the editor script that makes the page pickable/draggable.
    let save = null;
    const fixture = readPresets().fixtures.find((f) => f.id === String(req.query.fixture || ''));
    if (fixture) { try { save = fs.readFileSync(path.join(ROOT, fixture.file), 'utf8'); } catch { /* fixture file missing: boot without a save */ } }
    const seed = `
window.__layoutEditor = true;
try {
  for (const k of Object.keys(localStorage)) if (k.indexOf('finsanity_') === 0) localStorage.removeItem(k);
  localStorage.setItem('finsanity_prefs_v1', JSON.stringify({ guidedTutorials: false, guidedTutorialsUserSet: true, tutorialsSeen: [] }));
  ${save ? `localStorage.setItem('finsanity_save_v1', ${JSON.stringify(save).replace(/</g, '\\u003c')});` : ''}
} catch (e) {}
// Silent preview: music/video elements never start, and nothing is ever connected to the speakers.
HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
(function () {
  var connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest) { return dest instanceof AudioDestinationNode ? dest : connect.apply(this, arguments); };
})();`;
    html = html.replace(/<head>/i, `<head>\n<script>${seed}</script>\n<script type="module" src="/app/layout-host.js"></script>`);
    noStore(res);
    res.type('html').send(html);
  });

  // ---- API ----
  app.get('/api/layout', (req, res) => {
    try { noStore(res); res.json({ model: readModel(), ...readPresets() }); }
    catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });
  app.post('/api/layout', express.json({ limit: '2mb' }), (req, res) => {
    try {
      const model = sanitizeModel(req.body);
      writeAtomic(JSON_FILE, JSON.stringify(model, null, 2) + '\n');
      writeAtomic(CSS_FILE, CSS_FILE_HEADER + modelToCss(model) + (model.rules.length ? '\n' : ''));
      res.json({ ok: true, rules: model.rules.length });
    } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
  });
}
