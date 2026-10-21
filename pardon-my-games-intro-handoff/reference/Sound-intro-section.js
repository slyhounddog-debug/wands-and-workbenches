// ---- Studio intro splash (StudioIntro.js) ----
// A bubbly "bloop", one per title letter, on their own clock in StudioIntro.js (starting before the first
// landing and ~150ms apart, per direct request). The cooldown is shorter than the usual 50ms default, and
// each letter is a little higher than the last (the recording is pitched through playbackRate, the synth
// fallback through its note) so the cascade climbs instead of repeating one blip.
export function playIntroLetterBump(index = 0) {
  if (sfxOnCooldown('playIntroLetterBump', 30)) return;
  const step = Math.min(index, 12);
  if (playSample('playIntroLetterBump', 0, 1, 0.92 + step * 0.025)) return;
  const f = 300 * Math.pow(2, step / 12);
  playSweep(f * 0.7, f * 1.45, 0.09, { type: 'sine', gain: 0.17 });
  playTone(f * 2, 0.05, { type: 'sine', gain: 0.06, when: 0.03 });
}

// The one-shot bed under the whole intro. Kept as module state (unlike the other effects) so a skip can
// cut it short: stopStudioIntro fades it out in ~0.12s. If the recording hasn't finished decoding when the
// splash opens, loadSampleSfx starts it the moment it has; if the manifest has no recording for it the
// synth pad below plays instead.
let studioIntroWanted = false;
let studioIntroDurationS = 7;
let studioIntroGain = null;
let studioIntroStops = null; // [() => stop the sources]
export function playStudioIntro(durationS = 7) {
  studioIntroWanted = true;
  studioIntroDurationS = durationS;
  const audioCtx = ensureContext();
  if (!audioCtx) return;
  if (audioCtx.state === 'running') startStudioIntro();
  else audioCtx.resume().then(startStudioIntro).catch(() => {}); // the gesture that opened the splash may not have finished resuming it yet
}
function startStudioIntro() {
  if (!studioIntroWanted || studioIntroGain || !ctx || ctx.state !== 'running') return;
  const list = sampleBuffers.playStudioIntro;
  if (list && list.length) {
    studioIntroGain = ctx.createGain();
    studioIntroGain.gain.value = sampleGains.playStudioIntro ?? 1;
    const src = ctx.createBufferSource();
    src.buffer = list[0];
    src.connect(studioIntroGain).connect(sfxGain);
    src.start();
    studioIntroStops = [() => src.stop()];
  } else if (sampleManifestLoaded) {
    // Synth fallback: a soft rising pad (A major triad, a little detuned) that swells in, holds, and fades out over the intro's length.
    const end = ctx.currentTime + studioIntroDurationS;
    studioIntroGain = ctx.createGain();
    studioIntroGain.gain.setValueAtTime(0, ctx.currentTime);
    studioIntroGain.gain.linearRampToValueAtTime(0.13, ctx.currentTime + 1.4);
    studioIntroGain.gain.setValueAtTime(0.13, end - 1.2);
    studioIntroGain.gain.linearRampToValueAtTime(0, end);
    studioIntroGain.connect(sfxGain);
    const oscs = [220, 277.18, 329.63, 440.7].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 0.75, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 2.2);
      osc.connect(studioIntroGain);
      osc.start();
      osc.stop(end + 0.05);
      return osc;
    });
    studioIntroStops = [() => oscs.forEach((osc) => osc.stop())];
  }
}
export function stopStudioIntro() {
  studioIntroWanted = false;
  if (!studioIntroGain) return;
  const gain = studioIntroGain;
  const stops = studioIntroStops;
  studioIntroGain = null;
  studioIntroStops = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
  setTimeout(() => { for (const stop of stops) { try { stop(); } catch { /* already stopped */ } } }, 160);
}

function playSample(name, index = 0, gainMultiplier = 1, playbackRate = 1) {
  const list = sampleBuffers[name];
  if (!list || !list.length) return false;
  const audioCtx = ensureContext();
  if (!audioCtx || audioCtx.state !== 'running') return true;
  const src = audioCtx.createBufferSource();
  src.buffer = list[index % list.length];
  if (playbackRate !== 1) src.playbackRate.value = playbackRate;
  const gain = audioCtx.createGain();
  gain.gain.value = (sampleGains[name] ?? 1) * gainMultiplier;
  src.connect(gain).connect(sfxGain);
  src.start();
  return true;
}
