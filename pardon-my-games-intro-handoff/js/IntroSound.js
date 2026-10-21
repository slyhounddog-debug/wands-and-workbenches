// IntroSound.js — standalone replacement for the three functions StudioIntro.js needs from the game's Sound.js:
//   playIntroLetterBump(index)  one bubbly "bloop" per letter, each a little higher
//   playStudioIntro(durationS)  the one-shot bed under the whole intro
//   stopStudioIntro()           cut the bed with a quick fade (skip / finish)
// Uses its own AudioContext. The bed is audio/playStudioIntro.wav when it loads, else a synth pad.
// In another game, replace this file with calls into your own audio engine if you have one.

const BED_URL = 'audio/playStudioIntro.wav';
const BED_GAIN = 1;
const SFX_MASTER_GAIN = 0.35; // overall level; the game's SFX bus is ~0.35 at its default slider

let ctx = null;
let master = null;
let bedBuffer = null;
let bedLoading = false;
let bedSettled = false; // true once the wav has decoded or failed to load
let wanted = false;
let bedDurationS = 7;
let bedGain = null;
let bedStops = null;
const lastPlayed = {};

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = SFX_MASTER_GAIN;
  master.connect(ctx.destination);
  loadBed();
  return ctx;
}

function loadBed() {
  if (bedLoading) return;
  bedLoading = true;
  fetch(BED_URL)
    .then((r) => r.arrayBuffer())
    .then((buf) => ctx.decodeAudioData(buf))
    .then((decoded) => { bedBuffer = decoded; bedSettled = true; startBed(); })
    .catch(() => { bedBuffer = null; bedSettled = true; startBed(); }); // no file: the synth pad plays instead
}

function onCooldown(name, ms) {
  const now = performance.now();
  if (lastPlayed[name] != null && now - lastPlayed[name] < ms) return true;
  lastPlayed[name] = now;
  return false;
}

function sweep(from, to, dur, gainPeak) {
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Each letter is a semitone higher than the last (index 0..12).
export function playIntroLetterBump(index = 0) {
  if (!ensureContext() || ctx.state !== 'running') return;
  if (onCooldown('bump', 30)) return;
  const f = 300 * Math.pow(2, Math.min(index, 12) / 12);
  sweep(f * 0.7, f * 1.45, 0.09, 0.17);
  sweep(f * 2, f * 2, 0.05, 0.06);
}

export function playStudioIntro(durationS = 7) {
  wanted = true;
  bedDurationS = durationS;
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'running') startBed();
  else c.resume().then(startBed).catch(() => {});
}

function startBed() {
  if (!wanted || bedGain || !ctx || ctx.state !== 'running') return;
  if (bedBuffer) {
    bedGain = ctx.createGain();
    bedGain.gain.value = BED_GAIN;
    const src = ctx.createBufferSource();
    src.buffer = bedBuffer;
    src.connect(bedGain).connect(master);
    src.start();
    bedStops = [() => src.stop()];
  } else if (bedSettled) {
    // Synth fallback: a soft rising pad (A major triad, slightly detuned) that swells in, holds and fades out.
    const end = ctx.currentTime + bedDurationS;
    bedGain = ctx.createGain();
    bedGain.gain.setValueAtTime(0, ctx.currentTime);
    bedGain.gain.linearRampToValueAtTime(0.13, ctx.currentTime + 1.4);
    bedGain.gain.setValueAtTime(0.13, end - 1.2);
    bedGain.gain.linearRampToValueAtTime(0, end);
    bedGain.connect(master);
    const oscs = [220, 277.18, 329.63, 440.7].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 0.75, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 2.2);
      osc.connect(bedGain);
      osc.start();
      osc.stop(end + 0.05);
      return osc;
    });
    bedStops = [() => oscs.forEach((o) => o.stop())];
  }
}

export function stopStudioIntro() {
  wanted = false;
  if (!bedGain) return;
  const gain = bedGain;
  const stops = bedStops;
  bedGain = null;
  bedStops = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
  setTimeout(() => { for (const stop of stops) { try { stop(); } catch { /* already stopped */ } } }, 160);
}
