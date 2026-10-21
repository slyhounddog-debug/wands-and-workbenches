'use strict';
// Synthesized audio (Web Audio): SFX blips, the studio jingle and a cozy arpeggio loop. Any sound can be replaced by a
// clip from the dev tool's Audio tab (overrides/audio.js + overrides/audio/<name>.js); until a clip is decoded, or
// without one, the synth plays.
const AU = (() => {
  let ctx = null, sfxG = null, musG = null, musicOn = false, nextT = 0, step = 0, timer = null;
  const settings = { sfx: 0.7, music: 0.5 };
  const lastPlay = {};

  // ----- custom clips (the dev tool's Audio tab) -----
  const custom = {};   // name -> { p: edit params, buf: decoded AudioBuffer once ready }
  function loadCustom() {
    const ov = window.AUDIO_OV || {};
    for (const name in ov) {
      if (!/^[\w-]+\.js$/.test(ov[name].file || '')) continue;
      custom[name] = { p: ov[name], buf: null };
      const s = document.createElement('script');   // a script tag, not fetch, so it also works from file://
      s.src = 'overrides/audio/' + ov[name].file;
      s.onload = decodeCustom;
      document.head.appendChild(s);
    }
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
      }, () => { /* unreadable file: the synth keeps playing */ });
    }
  }
  const clip = name => (custom[name] && custom[name].buf ? custom[name] : null);

  try {
    const s = JSON.parse(localStorage.getItem('wands_settings'));
    if (s) { settings.sfx = clamp01(s.sfx, 0.7); settings.music = clamp01(s.music, 0.5); }
  } catch (e) { /* ignore */ }
  function clamp01(v, d) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d; }

  let held = false;   // the pause menu holds the music (no new notes, gain at 0)
  function applyVol() {
    if (!ctx) return;
    sfxG.gain.value = settings.sfx;
    musG.gain.value = held ? 0 : settings.music * 0.6;
  }
  function hold(on) {
    held = on;
    if (ctx) musG.gain.setTargetAtTime(on ? 0 : settings.music * 0.6, ctx.currentTime, 0.05);
  }
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
    sfxG.connect(ctx.destination); musG.connect(ctx.destination);
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
    o.connect(g); g.connect(dest || sfxG);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, hp, delay, dest) {
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = ctx.createGain(); g.gain.value = vol || 0.1;
    s.connect(f); f.connect(g); g.connect(dest || sfxG); s.start(ctx.currentTime + (delay || 0));
  }
  const N = s => 261.63 * Math.pow(2, s / 12);

  function sfx(name) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.05) return;
    lastPlay[name] = now;
    const c = clip(name);
    if (c) { OV.playClip(ctx, c, c.p, sfxG); return; }
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
      case 'kill': tone(400, 0.1, 'triangle', 0.07, 1.8); break;
      case 'hurt': tone(140, 0.25, 'sawtooth', 0.14, 0.5); break;
      case 'roll': noise(0.22, 0.06, 2000); break;
      case 'gem': tone(1000 + Math.random() * 300, 0.07, 'sine', 0.05); break;
      case 'charge': tone(880, 0.1, 'sine', 0.08); tone(1320, 0.14, 'sine', 0.08, 0, 0.08); break;
      case 'throw': noise(0.12, 0.05, 2500); tone(500, 0.12, 'sine', 0.06, 1.6); break;
      case 'thud': tone(140, 0.1, 'triangle', 0.1, 0.6); break;
      case 'crank': tone(300 + Math.random() * 80, 0.06, 'square', 0.05, 1.3); break;
      case 'craft': tone(660, 0.08, 'triangle', 0.09); tone(990, 0.12, 'triangle', 0.08, 0, 0.07); break;
      case 'clank': tone(1200, 0.12, 'square', 0.05, 0.5); tone(800, 0.15, 'triangle', 0.06, 0.7); break;
      case 'powerup': [0, 4, 7, 12, 16].forEach((s, i) => tone(N(s + 12), 0.12, 'sine', 0.1, 0, i * 0.04)); break;
      case 'bank': tone(990, 0.06, 'square', 0.05); tone(1320, 0.1, 'square', 0.05, 0, 0.05); break;
      case 'portalDrop': tone(1400, 0.4, 'sine', 0.07, 0.4); break;
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
      const g = ctx.createGain(); g.gain.value = 0; g.connect(sfxG);
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
      o1.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(g); g.connect(sfxG);
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
    if (track) { try { track.node.src.stop(); } catch (e) { /* already stopped */ } track = null; }
    if (name) track = { name, node: OV.playClip(ctx, clip(name), Object.assign({}, clip(name).p, { loop: true }), musG) };
  }
  function schedule() {
    if (!ctx || !musicOn) return;
    const want = bossOn && clip('music_boss') ? 'music_boss' : clip('music') ? 'music' : null;
    setTrack(want);
    if (want || held) { nextT = ctx.currentTime + 0.1; return; }
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
    if (!on && timer) { clearInterval(timer); timer = null; setTrack(null); }
  }
  loadCustom();
  // every sfx() name, read off its switch so the dev tool's list can never miss one
  const SFX_NAMES = (sfx + '').match(/case '\w+'/g).map(s => s.slice(6, -1));
  return {
    settings, init, sfx, music, jingleNote, jingleEnd, hum: setHum, mix, hold, sleep,
    names: { sfx: SFX_NAMES, loops: ['music', 'music_boss', 'hum'] },
    setSfx(v) { settings.sfx = v; applyVol(); saveSettings(); },
    setMusic(v) { settings.music = v; applyVol(); saveSettings(); },
  };
})();
