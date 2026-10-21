// The dev tool page: three tabs over one server (server.mjs). Layout and Variables share the game preview.
import { $, say, api, ls } from './common.js';
import { preview, applyMode, applySize, loadPresets, boot } from './preview.js';
import * as layout from './layout.js';
import * as vars from './variables.js';
import * as audio from './audiotab.js';

const TABS = { layout, vars, audio };
let current = null;

function show(tab) {
  if (!TABS[tab]) tab = 'layout';
  if (current && current !== tab) TABS[current].deactivate();
  current = tab; preview.tab = tab; ls.set('tab', tab);
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  $('#previewArea').hidden = tab === 'audio';   // a hidden iframe also stops the game's rAF loop
  $('#view-audio').hidden = tab !== 'audio';
  $('#panel-layout').hidden = tab !== 'layout';
  $('#panel-vars').hidden = tab !== 'vars';
  $('#tabTools').replaceChildren(TABS[tab].tools);
  TABS[tab].activate();
  if (tab !== 'audio') { applyMode(); setTimeout(applySize, 0); }
}
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => show(b.dataset.tab));

(async () => {
  try {
    const [lay, tun, aud] = await Promise.all([api('/api/layout'), api('/api/tuning'), api('/api/audio')]);
    layout.init(lay.model);
    vars.init(tun);
    audio.init(aud);
    loadPresets(lay.presets, lay.fixtures);
    show(ls.get('tab', 'layout'));
    await boot();
  } catch (e) {
    say('The dev tool could not start: ' + e.message, true);
    console.error(e);
  }
})();
