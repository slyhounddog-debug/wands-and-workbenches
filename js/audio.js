'use strict';
// Synthesized audio (Web Audio): SFX blips, the studio jingle and a cozy arpeggio loop. Any sound can be replaced by a
// clip from the dev tool's Audio tab (overrides/audio.js + overrides/audio/<name>.js); until a clip is decoded, or
// without one, the synth plays.
const AU = (() => {
  let ctx = null, sfxG = null, musG = null, musLP = null, musicOn = false, nextT = 0, step = 0, timer = null;
  // audio hierarchy: important cues go to hiG and duck everything on loG (hum, pickups, clicks) and the music;
  // midG is everything else. cur = where tone() / noise() send by default while a sfx is being built
  let hiG = null, midG = null, loG = null, duckG = null, cur = null;
  const HI = new Set(['deliver', 'portalDrop', 'incoming', 'incoming_big', 'zap_air', 'zap_fire', 'zap_water', 'zap_earth', 'zap_combo', 'weak', 'warn', 'heart', 'hurt', 'die', 'roar', 'slam', 'volley', 'alert', 'dodge', 'victory', 'evwarn']);
  const LO = new Set(['pickup', 'drop', 'blip', 'crank', 'gem', 'place', 'throw', 'thud', 'boing', 'whoosh', 'dig', 'rustle', 'step_b', 'step_w', 'menu_open', 'menu_close', 'tab', 'craft', 'bank', 'shard',
    'st_work', 'st_missing', 'st_starve', 'st_jam', 'st_full', 'st_off']);
  const reps = {};   // name -> { t, n }: rapid repeats of a low sound get quieter
  function duck(depth) {
    if (!ctx) return;
    const t = ctx.currentTime, g = duckG.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(depth, t + 0.03); g.linearRampToValueAtTime(1, t + 0.7);
  }
  const settings = { sfx: 0.7, music: 0.5, pip: 28, autoPick: false };   // pip: the online partner viewport, % of the screen width (0 = off, 45 = biggest); a per-player local preference, never synced
  const lastPlay = {};

  // ----- custom clips (the dev tool's Audio tab) -----
  const custom = {};   // name -> { p: edit params, buf: decoded AudioBuffer once ready }
  function loadScript(name, p, src, onFail) {
    custom[name] = { p, buf: null };
    const s = document.createElement('script');   // a script tag, not fetch, so it also works from file://
    s.src = src;
    s.onload = decodeCustom;
    s.onerror = () => { custom[name].failed = true; if (onFail) onFail(); };
    document.head.appendChild(s);
  }
  // the layered soundtrack: one looping file per element (built by tools/musicbuild), all the same length
  const LAYER_EL = ['air', 'water', 'fire', 'earth'], LAYER_NAME = el => 'music_' + el;
  function loadCustom() {
    const ov = window.AUDIO_OV || {};
    for (const el of LAYER_EL) loadScript(LAYER_NAME(el), {}, 'audio/music/' + LAYER_NAME(el) + '.js', loadLegacyMusic);
    for (const name in ov) {
      if (!/^[\w-]+\.js$/.test(ov[name].file || '')) continue;
      if (name === 'music') continue;   // the old single track only plays if the layers could not be loaded (loadLegacyMusic)
      loadScript(name, ov[name], 'overrides/audio/' + ov[name].file);
    }
  }
  let legacyAsked = false;
  function loadLegacyMusic() {
    const ov = (window.AUDIO_OV || {}).music;
    if (legacyAsked || !ov || !/^[\w-]+\.js$/.test(ov.file || '')) return;
    legacyAsked = true;
    loadScript('music', ov, 'overrides/audio/' + ov.file);
  }
  function decodeCustom() {
    if (!ctx) return;
    const data = window.AUDIO_DATA || {};
    for (const name in custom) {
      const c = custom[name];
      if (c.buf || c.busy || !data[name]) continue;
      c.busy = true;
      ctx.decodeAudioData(OV.dataToBuffer(data[name])).then(b => {
        c.buf = b;
        if (name === 'hum' && hum && !hum.clip) { hum.stop(); hum = null; humLvl = -1; }   // swap the synth drone for the clip
      }, () => { c.failed = true; if (LAYER_EL.some(el => LAYER_NAME(el) === name)) loadLegacyMusic(); });   // unreadable file: the synth (or the old track) keeps playing
    }
  }
  const clip = name => (custom[name] && custom[name].buf ? custom[name] : null);

  try {
    const s = JSON.parse(localStorage.getItem('wands_settings'));
    if (s) { settings.sfx = clamp01(s.sfx, 0.7); settings.music = clamp01(s.music, 0.5); settings.autoPick = s.autoPick === true; if (typeof s.pip === 'number' && isFinite(s.pip)) settings.pip = Math.max(0, Math.min(45, Math.round(s.pip))); }
  } catch (e) { /* ignore */ }
  function clamp01(v, d) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d; }

  let held = false;   // the pause menu holds the music (muffled, see hold())
  function applyVol() {
    if (!ctx) return;
    sfxG.gain.value = settings.sfx;
    if (loG) loG.gain.value = 0.75 * settings.sfx;
    musG.gain.value = settings.music * 0.6;
  }
  // the pause menu, an open skill tree and the title / player screens keep the music going but muffled (a low-pass on the music bus)
  let muffleExt = false;
  function applyMuffle() {
    if (ctx) musLP.frequency.setTargetAtTime(held || muffleExt ? CFG.music.muffleHz : 20000, ctx.currentTime, CFG.music.muffleT);
  }
  function hold(on) { held = on; applyMuffle(); }
  function muffle(on) { if (muffleExt !== on) { muffleExt = on; applyMuffle(); } }
  // focus lost / tab hidden: suspend the whole audio clock, so music and SFX resume exactly where they were
  function sleep(on) {
    if (!ctx) return;
    if (on && ctx.state === 'running') ctx.suspend();
    else if (!on && ctx.state === 'suspended') ctx.resume();
  }
  function saveSettings() {
    try { localStorage.setItem('wands_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    sfxG = ctx.createGain(); musG = ctx.createGain();
    sfxG.connect(ctx.destination);
    duckG = ctx.createGain(); duckG.connect(ctx.destination);   // music + low sounds pass through the ducker
    musLP = ctx.createBiquadFilter(); musLP.type = 'lowpass'; musLP.frequency.value = held || muffleExt ? CFG.music.muffleHz : 20000; musLP.Q.value = 0.7;
    musG.connect(musLP); musLP.connect(duckG);
    hiG = ctx.createGain(); hiG.gain.value = 1.15; hiG.connect(sfxG);
    midG = ctx.createGain(); midG.connect(sfxG);
    loG = ctx.createGain(); loG.gain.value = 0.75; loG.connect(duckG);
    cur = midG;
    applyVol();
    decodeCustom();
  }
  function tone(f, dur, type, vol, slide, delay, dest) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || cur || sfxG);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, hp, delay, dest) {
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = ctx.createGain(); g.gain.value = vol || 0.1;
    s.connect(f); f.connect(g); g.connect(dest || cur || sfxG); s.start(ctx.currentTime + (delay || 0));
  }
  const N = s => 261.63 * Math.pow(2, s / 12);

  let attn = () => 0;   // how much attention a cue is holding (UI.cueLevel: 3 danger, 2 goal, 1 loss): while one is up the ambient LO sounds drop so the important one is the one heard
  let tapFn = null;   // the online host listens to every sound (Main.tapSfx), so the guest can hear the wilds
  // The online guest hears the wilds from his Wizard (AU.ear = { x, y }, set each guest frame): a sound made at (x, y) tiles away from him gets quieter and duller with distance
  // (CFG.hear: full volume within full tiles, falling to floor at far). No ear (offline, the host) or no origin = full volume.
  let ear = null;
  function farK(x, y) {
    if (!ear || x == null || y == null) return 1;
    const H = CFG.hear, d = Math.hypot(x - ear.x, y - ear.y);
    return d <= H.full ? 1 : Math.max(H.floor, 1 - (d - H.full) / (H.far - H.full));
  }
  function sfx(name, x, y) {
    if (tapFn) tapFn(name, x, y);
    if (!ctx) return;
    const now = ctx.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.05) return;
    lastPlay[name] = now;
    // which bus: HI cuts through (and ducks the rest), LO sits under; repeats of a LO sound fade down
    let bus = HI.has(name) ? hiG : LO.has(name) ? loG : midG;
    if (bus === loG) {
      const r = reps[name] || (reps[name] = { t: 0, n: 0 });
      r.n = now - r.t < 0.35 ? Math.min(6, r.n + 1) : 0; r.t = now;
      if (r.n) { const g = ctx.createGain(); g.gain.value = Math.max(0.3, 1 - r.n * 0.13); g.connect(loG); bus = g; }
      const a = attn();
      if (a >= 2) { const g = ctx.createGain(); g.gain.value = a >= 3 ? 0.3 : 0.55; g.connect(bus); bus = g; }
    }
    const fk = farK(x, y);
    if (fk < 1) {   // far away: quieter and duller (a low-pass that closes with distance), and it no longer ducks the music
      const g = ctx.createGain(), lp = ctx.createBiquadFilter();
      g.gain.value = fk; lp.type = 'lowpass'; lp.frequency.value = CFG.hear.lp + (18000 - CFG.hear.lp) * fk * fk;
      g.connect(lp); lp.connect(bus); bus = g;
    } else if (HI.has(name)) duck(name === 'heart' || name === 'dodge' ? 0.6 : 0.35);
    const c = clip(name);
    if (c) { OV.playClip(ctx, c, c.p, bus); return; }
    cur = bus;
    try { play(name); } finally { cur = midG; }
  }
  function play(name) {
    switch (name) {
      case 'blip': tone(660, 0.07, 'square', 0.06); break;
      case 'pickup': tone(520, 0.08, 'triangle', 0.12); tone(780, 0.09, 'triangle', 0.1, 0, 0.06); break;
      case 'drop': tone(420, 0.08, 'triangle', 0.1, 0.7); break;
      case 'place': tone(240, 0.1, 'square', 0.08, 1.4); break;
      case 'complete': [0, 4, 7, 12].forEach((s, i) => tone(N(s + 12), 0.18, 'triangle', 0.12, 0, i * 0.07)); break;
      case 'deliver': tone(880, 0.06, 'sine', 0.08); break;
      case 'error': tone(160, 0.16, 'sawtooth', 0.07, 0.7); break;
      case 'buy': [0, 7, 12, 16].forEach((s, i) => tone(N(s + 12), 0.14, 'sine', 0.13, 0, i * 0.06)); break;
      case 'swap': tone(300, 0.2, 'sine', 0.12, 2); tone(600, 0.2, 'sine', 0.1, 0.5, 0.15); break;
      case 'zap_air': noise(0.25, 0.08, 1500); tone(500, 0.2, 'sine', 0.06, 1.8); break;
      case 'zap_fire': noise(0.2, 0.09, 600); tone(200, 0.2, 'sawtooth', 0.07, 0.5); break;
      case 'zap_water': tone(700, 0.18, 'sine', 0.1, 0.5); tone(900, 0.12, 'sine', 0.07, 0.6, 0.05); break;
      case 'zap_earth': tone(90, 0.35, 'square', 0.12, 0.6); noise(0.2, 0.08, 200); break;
      case 'zap_combo': tone(330, 0.3, 'sawtooth', 0.08, 2.5); tone(660, 0.3, 'sine', 0.08, 1.5, 0.05); break;
      case 'hit': tone(180, 0.06, 'square', 0.04, 0.6); break;
      case 'hitw': tone(110, 0.16, 'square', 0.09, 0.45); tone(58, 0.2, 'sine', 0.15, 0.5); noise(0.08, 0.07, 450); tone(N(19), 0.08, 'triangle', 0.05, 0, 0.03); break;   // a weakness hit: low thump + crunch + a bright ping
      case 'kill': tone(400, 0.1, 'triangle', 0.07, 1.8); break;
      case 'hurt': tone(140, 0.25, 'sawtooth', 0.14, 0.5); break;
      case 'roll': {   // a quick whoosh, pitch-shifted a little each time so repeated rolls don't drone
        const f = 480 + Math.random() * 240;
        tone(f, 0.15, 'triangle', 0.07, 2.6); tone(f * 1.5, 0.09, 'sine', 0.04, 2.2, 0.04); noise(0.16, 0.05, 2600);
        break;
      }
      // element motifs: one short phrase per element, so each is recognisable by ear
      case 'el_air': tone(N(19), 0.12, 'sine', 0.07, 1.25); tone(N(26), 0.14, 'sine', 0.05, 1.2, 0.07); break;
      case 'el_water': tone(N(24), 0.08, 'triangle', 0.08); tone(N(19), 0.08, 'triangle', 0.07, 0, 0.07); tone(N(16), 0.12, 'triangle', 0.06, 0.9, 0.14); break;
      case 'el_fire': noise(0.12, 0.06, 1800); tone(N(7), 0.1, 'sawtooth', 0.05, 1.6); tone(N(14), 0.08, 'sawtooth', 0.04, 1.4, 0.06); break;
      case 'el_earth': tone(N(-12), 0.14, 'square', 0.08, 0.8); tone(N(-5), 0.12, 'square', 0.06, 0.8, 0.09); noise(0.08, 0.05, 300, 0.02); break;
      // machine states (quiet chirps when a machine near the Builder changes state)
      case 'st_work': tone(N(19), 0.05, 'triangle', 0.035); tone(N(24), 0.06, 'triangle', 0.03, 0, 0.04); break;
      case 'st_missing': tone(N(12), 0.07, 'triangle', 0.04); tone(N(14), 0.07, 'triangle', 0.035, 0, 0.08); break;
      case 'st_starve': tone(N(7), 0.14, 'sine', 0.04, 0.8); break;
      case 'st_jam': tone(N(10), 0.05, 'square', 0.03); tone(N(10), 0.05, 'square', 0.03, 0, 0.08); break;
      case 'st_full': tone(N(4), 0.09, 'square', 0.035); tone(N(-1), 0.12, 'square', 0.035, 0, 0.09); break;
      case 'st_off': tone(N(0), 0.22, 'sawtooth', 0.03, 0.5); break;
      // danger / big moments (high bus)
      case 'heart': tone(70, 0.1, 'sine', 0.2, 0.7); tone(62, 0.12, 'sine', 0.16, 0.7, 0.16); break;
      case 'warn': tone(N(24), 0.07, 'square', 0.06); tone(N(24), 0.07, 'square', 0.06, 0, 0.12); tone(N(24), 0.07, 'square', 0.06, 0, 0.24); break;
      case 'weak': tone(110, 0.5, 'sawtooth', 0.1, 0.6); [0, 7, 12].forEach((s2, i) => tone(N(s2 + 12), 0.2, 'square', 0.06, 0, 0.12 + i * 0.07)); break;
      case 'dodge': tone(1500, 0.07, 'square', 0.04, 1.5); tone(2250, 0.1, 'sine', 0.05, 1.3, 0.05); break;
      // footsteps (quiet, alternating pitch) and menu sounds
      case 'step_b': tone(150 + Math.random() * 40, 0.05, 'triangle', 0.05, 0.7); noise(0.04, 0.012, 1800); break;
      case 'step_w': tone(260 + Math.random() * 60, 0.05, 'sine', 0.035, 0.8); noise(0.05, 0.01, 3000); break;
      case 'menu_open': tone(N(12), 0.06, 'triangle', 0.05); tone(N(19), 0.08, 'triangle', 0.045, 0, 0.05); break;
      case 'menu_close': tone(N(19), 0.06, 'triangle', 0.045); tone(N(12), 0.08, 'triangle', 0.04, 0, 0.05); break;
      case 'tab': tone(N(16), 0.04, 'sine', 0.04); break;
      case 'dig': tone(100 + Math.random() * 50, 0.07, 'square', 0.07, 0.6); noise(0.06, 0.06, 500); break;
      case 'rustle': noise(0.1, 0.07, 3200); tone(900 + Math.random() * 200, 0.04, 'triangle', 0.03); break;
      case 'shrine': [0, 7, 12, 19].forEach((s, i) => tone(N(s + 12), 0.22, 'sine', 0.08, 0, i * 0.06)); break;
      case 'gem': { const f = 1000 + Math.random() * 300; tone(f, 0.07, 'sine', 0.05); tone(f * 1.5, 0.09, 'triangle', 0.04, 0, 0.05); break; }
      case 'gemBig': [0, 4, 7, 12].forEach((s, i) => tone(N(s + 24), 0.14, 'triangle', 0.07, 0, i * 0.05)); break;   // a Big Gem: a rising arpeggio
      case 'evwarn': [12, 7, 12, 7].forEach((s, i) => tone(N(s), 0.2, 'square', 0.09, 0, i * 0.22)); tone(110, 0.8, 'sawtooth', 0.08, 0.5); break;   // 30 seconds to an event
      case 'charge': tone(880, 0.1, 'sine', 0.08); tone(1320, 0.14, 'sine', 0.08, 0, 0.08); break;
      case 'throw': noise(0.12, 0.05, 2500); tone(500, 0.12, 'sine', 0.06, 1.6); break;
      case 'thud': tone(140, 0.1, 'triangle', 0.1, 0.6); break;
      case 'boing': noise(0.02, 0.08, 4000); tone(1800, 0.03, 'square', 0.05); tone(220, 0.32, 'sine', 0.11, 3.2, 0.02); tone(330, 0.22, 'triangle', 0.05, 2.4, 0.06); break;   // a rejected throw: a click, then a spring
      case 'whoosh': noise(0.3, 0.05, 1200); tone(900, 0.28, 'sine', 0.04, 0.45); break;   // a delivery sails into the wilds
      case 'overcharge': tone(N(0), 0.25, 'sawtooth', 0.06, 2); [12, 19, 24].forEach((s, i) => tone(N(s), 0.12, 'square', 0.05, 0, 0.08 + i * 0.05)); noise(0.2, 0.05, 5000, 0.05); break;
      case 'pressure': tone(55, 0.5, 'sine', 0.16, 0.6); noise(0.35, 0.07, 120); break;   // a shockwave out of the Spell Portal
      case 'wall': tone(70, 0.45, 'square', 0.1, 1.5); noise(0.4, 0.1, 250); break;
      case 'freeze': [24, 31, 28, 36].forEach((s, i) => tone(N(s), 0.1, 'triangle', 0.05, 0, i * 0.04)); noise(0.3, 0.04, 6000); break;
      case 'launch': tone(160, 0.35, 'sine', 0.1, 4); noise(0.35, 0.08, 900); break;
      case 'crank': tone(300 + Math.random() * 80, 0.06, 'square', 0.05, 1.3); break;
      case 'craft': tone(660, 0.08, 'triangle', 0.09); tone(990, 0.12, 'triangle', 0.08, 0, 0.07); break;
      case 'clank': tone(1200, 0.12, 'square', 0.05, 0.5); tone(800, 0.15, 'triangle', 0.06, 0.7); break;
      case 'powerup': [0, 4, 7, 12, 16].forEach((s, i) => tone(N(s + 12), 0.12, 'sine', 0.1, 0, i * 0.04)); break;
      case 'bank': tone(990, 0.06, 'square', 0.05); tone(1320, 0.1, 'square', 0.05, 0, 0.05); break;
      case 'portalDrop': tone(1400, 0.4, 'sine', 0.07, 0.4); break;
      case 'incoming': tone(N(12), 0.32, 'triangle', 0.07, 2); tone(N(19), 0.2, 'sine', 0.05, 1.5, 0.08); break;   // a spell's drop-in starts over the Wizard
      case 'incoming_big': tone(N(0), 0.5, 'sawtooth', 0.05, 2.5); tone(N(12), 0.4, 'triangle', 0.07, 2, 0.1); noise(0.3, 0.04, 2000, 0.05); break;
      case 'die': [7, 3, 0, -5].forEach((s, i) => tone(N(s), 0.3, 'triangle', 0.14, 0, i * 0.16)); break;
      case 'alert': tone(880, 0.08, 'square', 0.06); tone(660, 0.12, 'square', 0.06, 0, 0.1); break;
      case 'chest': [0, 4, 7, 11, 14].forEach((s, i) => tone(N(s + 12), 0.16, 'square', 0.06, 0, i * 0.05)); break;
      case 'shard': tone(1320 + Math.random() * 200, 0.12, 'triangle', 0.08, 1.2); break;
      case 'roar': tone(110, 0.6, 'sawtooth', 0.12, 0.5); noise(0.5, 0.1, 300); break;
      case 'slam': tone(70, 0.4, 'square', 0.14, 0.5); noise(0.3, 0.12, 150); break;
      case 'volley': tone(500, 0.2, 'square', 0.05, 0.4); break;
      case 'victory': [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => tone(N(s + 12), 0.3, 'triangle', 0.12, 0, i * 0.11)); break;
    }
  }

  // ----- factory hum: a low drone that swells with how many machines are working -----
  let hum = null, humLvl = -1;
  function setHum(level) {
    if (!ctx) return;
    const v = Math.max(0, Math.min(1, level));
    if (Math.abs(v - humLvl) < 0.02) return;
    humLvl = v;
    if (!hum && clip('hum')) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(loG);
      const node = OV.playClip(ctx, clip('hum'), Object.assign({}, clip('hum').p, { loop: true }), g);
      hum = { g, clip: true, stop() { node.src.stop(); } };
    }
    if (!hum) {
      const g = ctx.createGain(); g.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 110.7;
      const o2g = ctx.createGain(); o2g.gain.value = 0.2;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 3; lg.gain.value = 70;
      lfo.connect(lg); lg.connect(lp.frequency);
      o1.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(g); g.connect(loG);
      o1.start(); o2.start(); lfo.start();
      hum = { g, lfo, stop() { o1.stop(); o2.stop(); lfo.stop(); g.disconnect(); } };
    }
    hum.g.gain.setTargetAtTime(v * (hum.clip ? 1 : 0.06), ctx.currentTime, 0.5);
    if (hum.lfo) hum.lfo.frequency.setTargetAtTime(2 + v * 5, ctx.currentTime, 0.5);
  }

  // ----- reactive mix: factory activity adds percussion, nearby fights add bass, the Chimera swaps the progression -----
  let mixF = 0, mixC = 0, bossOn = false;
  function mix(f, c, b) { mixF += (f - mixF) * 0.02; mixC += (c - mixC) * 0.04; bossOn = b; }

  // ----- studio jingle (synthesized; no audio files in this build) -----
  function jingleNote(i) { const sc = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19]; tone(N(sc[i % sc.length] + 12), 0.28, 'triangle', 0.14); tone(N(sc[i % sc.length] + 24), 0.2, 'sine', 0.05, 0, 0.02); }
  function jingleEnd() { [0, 4, 7, 12, 16].forEach((s, i) => tone(N(s + 12), 0.9, 'triangle', 0.1, 0, i * 0.05)); tone(N(36), 1.2, 'sine', 0.06, 0, 0.2); }

  // ----- music -----
  const CH = [{ r: 0, m: [0, 4, 7] }, { r: -3, m: [0, 3, 7] }, { r: -7, m: [0, 4, 7] }, { r: -5, m: [0, 4, 7] }];
  const CH_BOSS = [{ r: -3, m: [0, 3, 7] }, { r: -7, m: [0, 4, 7] }, { r: -5, m: [0, 4, 7] }, { r: -8, m: [0, 4, 7] }];
  const PAT = [0, 1, 2, 3, 2, 1, 0, 1];
  // a custom music clip (music_boss during the Chimera) loops instead of the synth
  let track = null;
  function setTrack(name) {
    if ((track && track.name) === name) return;
    if (track) { try { track.node.src.stop(); } catch (e) { /* already stopped */ } dropEnv(track.env); track = null; }
    if (name) {
      const node = OV.playClip(ctx, clip(name), Object.assign({}, clip(name).p, { loop: true }), musG);
      node.gain.disconnect();   // its level now goes through the loop envelope on the way to the music bus
      track = { name, node, env: loopEnv(node.t0, node.len, node.gain, musG) };
    }
  }
  // Every looping music file fades in over CFG.music.fadeIn and out over CFG.music.fadeOut on each pass (and when it first starts), so the seam
  // of a loop never spikes. The envelope is a gain node in front of the music bus, ramped a pass at a time, a little ahead of the clock (schedule()).
  const envs = [];
  function loopEnv(t0, D, from, dest) {
    const e = ctx.createGain(); e.gain.value = 0;
    from.connect(e); e.connect(dest);
    const en = { e, t0, D, n: 0 };
    envs.push(en); tickEnv(en);
    return en;
  }
  function tickEnv(en) {
    const M = CFG.music, fi = Math.min(M.fadeIn, en.D / 2), fo = Math.min(M.fadeOut, en.D / 2);
    while (en.t0 + en.n * en.D < ctx.currentTime + 40) {
      const s = en.t0 + en.n * en.D, g = en.e.gain;
      g.setValueAtTime(0, s);
      g.linearRampToValueAtTime(1, s + fi);
      g.setValueAtTime(1, s + en.D - fo);
      g.linearRampToValueAtTime(0, s + en.D);
      en.n++;
    }
  }
  function dropEnv(en) {
    const i = envs.indexOf(en);
    if (i >= 0) envs.splice(i, 1);
    if (en) setTimeout(() => { try { en.e.disconnect(); } catch (e) { /* already gone */ } }, 100);
  }
  // ----- layered soundtrack: the four element loops start on the same tick, so they stay locked, and each one swells with how
  // active its element is (the factory's weather). The Chimera brings the whole band in unless a music_boss clip takes over.
  let layers = null, layerAct = null;   // layers = { air: { src, gain }, ... } while playing; layerAct = AU.layers() input (null = menu mix)
  const layersReady = () => LAYER_EL.every(el => clip(LAYER_NAME(el)));
  const layersPending = () => LAYER_EL.every(el => !custom[LAYER_NAME(el)].failed) && !layersReady();
  function layerGoal(el, boss) {
    const M = CFG.music;
    if (boss === 'clip') return 0;
    if (!layerAct) return M.menu;   // title / player screens: all four at one level
    if (boss) return 1;
    const v = Math.pow(Math.max(0, Math.min(1, layerAct[el] || 0)), M.curve);
    return el === 'air' ? M.airFloor + (1 - M.airFloor) * v : v;
  }
  function stopLayers() {
    if (!layers) return;
    for (const el in layers) { try { layers[el].src.stop(); } catch (e) { /* already stopped */ } dropEnv(layers[el].env); }
    layers = null;
  }
  function tickLayers(boss) {
    const t = ctx.currentTime;
    if (!layers) {
      layers = {};
      for (const el of LAYER_EL) {
        const src = ctx.createBufferSource(), gain = ctx.createGain();
        src.buffer = clip(LAYER_NAME(el)).buf; src.loop = true;
        gain.gain.value = layerGoal(el, boss) * CFG.music.gain;
        src.connect(gain);
        layers[el] = { src, gain };
      }
      const t0 = t + 0.1;   // one start time for all four
      for (const el of LAYER_EL) { layers[el].env = loopEnv(t0, layers[el].src.buffer.duration, layers[el].gain, musG); layers[el].src.start(t0); }
    }
    for (const el of LAYER_EL) layers[el].gain.gain.setTargetAtTime(layerGoal(el, boss) * CFG.music.gain, t, CFG.music.fade);
  }
  function schedule() {
    if (!ctx || !musicOn) return;
    for (const en of envs) tickEnv(en);
    const bossClip = bossOn && clip('music_boss');
    if (layersReady()) { tickLayers(bossClip ? 'clip' : bossOn); } else stopLayers();
    // until the layers are decoded the synth stays quiet (it would only be cut off a second later); if they cannot load, the old single track / synth plays
    const want = bossClip ? 'music_boss' : !layersReady() && !layersPending() && clip('music') ? 'music' : null;
    setTrack(want);
    if (want || layersReady() || layersPending()) { nextT = ctx.currentTime + 0.1; return; }
    const STEP = bossOn ? 0.3 : 0.5 - mixC * 0.08;
    while (nextT < ctx.currentTime + 0.5) {
      const chord = (bossOn ? CH_BOSS : CH)[Math.floor(step / 8) % 4], k = step % 8, d = Math.max(0, nextT - ctx.currentTime);
      if (k === 0) {
        tone(N(chord.r - 12), STEP * 8, 'sine', 0.1, 0, d, musG);
        tone(N(chord.r), STEP * 8, 'sine', 0.035, 0, d, musG);
      }
      const i = PAT[k], semi = chord.r + (i === 3 ? 12 : chord.m[i]) + 12;
      tone(N(semi), STEP * 1.4, 'triangle', 0.07, 0, d, musG);
      // factory layer: hi-hat ticks and a little anvil clink, louder the busier the floor is
      if (mixF > 0.05) {
        noise(0.04, mixF * 0.05 * (k % 2 ? 0.6 : 1), 6000, d, musG);
        if (k % 4 === 2) tone(N(chord.r + 24 + chord.m[2]), 0.08, 'square', mixF * 0.025, 0, d, musG);
      }
      // combat layer: a pulsing bass and a kick when monsters crowd the Wizard
      if (mixC > 0.05 || bossOn) {
        const c = bossOn ? 1 : mixC;
        if (k % 2 === 0) tone(N(chord.r - 24), STEP * 0.9, 'square', c * 0.05, 0, d, musG);
        if (k % 4 === 0) tone(120, 0.14, 'sine', c * 0.16, 0.35, d, musG);
      }
      if (bossOn && (k === 0 || k === 3 || k === 6)) tone(N(semi + 12), STEP * 1.2, 'sawtooth', 0.03, 0, d, musG);
      nextT += STEP; step++;
    }
  }
  function music(on) {
    musicOn = on;
    if (!ctx) return;
    if (on && !timer) { nextT = ctx.currentTime + 0.1; timer = setInterval(schedule, 120); }
    if (!on && timer) { clearInterval(timer); timer = null; setTrack(null); stopLayers(); }
  }
  loadCustom();
  // every sfx() name, read off play()'s switch so the dev tool's list can never miss one
  const SFX_NAMES = (play + '').match(/case '\w+'/g).map(s => s.slice(6, -1));
  return {
    settings, init, sfx, setTap(fn) { tapFn = fn; }, setAttn(fn) { attn = fn; }, setEar(x, y) { ear = x == null ? null : { x, y }; }, farK, music, jingleNote, jingleEnd, hum: setHum, mix, hold, sleep, muffle,
    layerMix(act) { layerAct = act; },   // { air, water, fire, earth } 0..1 (G.fac.weather), or null for the title-screen mix
    layerInfo() { return { ready: layersReady(), playing: !!layers, lowpassHz: ctx ? Math.round(musLP.frequency.value) : null, goal: Object.fromEntries(LAYER_EL.map(el => [el, +layerGoal(el, bossOn).toFixed(3)])) }; },
    names: { sfx: SFX_NAMES, loops: ['music', 'music_boss', 'hum'] },
    setSfx(v) { settings.sfx = v; applyVol(); saveSettings(); },
    setMusic(v) { settings.music = v; applyVol(); saveSettings(); },
    setPip(v) { settings.pip = Math.max(0, Math.min(45, Math.round(v))); saveSettings(); },
    setAutoPick(v) { settings.autoPick = !!v; saveSettings(); },
  };
})();
