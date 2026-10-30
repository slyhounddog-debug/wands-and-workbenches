// Builds the four element music layers from the "Breath of the Waltz" Suno stems.
//   node tools/musicbuild/build.js            (needs ffmpeg + ffprobe on PATH)
// Writes audio/music/music_<element>.js (base64 Ogg Vorbis in window.AUDIO_DATA, loaded by js/audio.js).
// All four layers are cut from the SAME span (sample-exact), so they stay locked when started together.
// Tweak CONFIG below and re-run; nothing else needs touching. The dev tool's Audio tab > "Game music" trims the loop
// (start / length / crossfade tail) and saves it to overrides/music.json, which is merged over CONFIG here before the build.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
// The 10 source stems (37 MB) are not part of the game or the repo: they live in a folder beside it. MUSIC_STEMS (a folder) overrides.
const SIDE_STEMS = path.join(ROOT, '..', 'Wands&Workbenches-music-stems', 'Breath of the Waltz Stems');
const STEMS = [process.env.MUSIC_STEMS, SIDE_STEMS, path.join(ROOT, 'audio', 'Breath of the Waltz Stems')].find(d => d && fs.existsSync(d)) || SIDE_STEMS;
const OUT = path.join(ROOT, 'audio', 'music');
const SR = 48000;

const CONFIG = {
  // The loop starts just before the song's first note (the 2-beat pickup at 0.2s; downbeats are at 1.218s + n x 1.5198s, 118.4 BPM waltz)
  // and is a whole number of bars: 68 bars = 103.35s. It ends inside the song's own break (drums + bass out, drums return at 104.57s),
  // so the wrap lands on a sparse moment and back on the same beat of the bar it started on.
  startSample: 8000,
  lengthSamples: 4960627,
  // the `xfade` seconds of song AFTER the loop end ring on underneath the start (fading out), so the wrap is continuous and the
  // opening notes still play at full level
  xfade: 0.5,
  // loudness every layer file is normalised to (LUFS) and the true-peak ceiling (dB)
  limit: 0.5,   // gentle limiter on the summed layer (linear, 0.5 = -6 dB) so drum peaks don't cap the whole layer's loudness
  targetLufs: -22,
  ceiling: -1,
  // stem -> layer, with a makeup gain in dB. The Suno stems are very unevenly loud (Woodwinds -18 LUFS, Synth -46),
  // so these gains set the balance INSIDE a layer; each layer is then normalised as a whole.
  layers: {
    air:   { stems: { 'Woodwinds': -5 } },
    water: { stems: { 'Strings': -2.4, 'Keyboard': 9.3 } },
    fire:  { stems: { 'Drums': 6.5, 'Percussion': 6.3, 'Synth': 12, 'Other': 4.7 } },
    earth: { stems: { 'Bass': 1.4, 'Guitar': 10, 'Brass': 5.7 } },
  },
};

// overrides/music.json (saved by the dev tool): { startSample, lengthSamples, xfade } on top of the defaults above
const LOOP_FILE = path.join(ROOT, 'overrides', 'music.json');
function loopOverride() {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(LOOP_FILE, 'utf8')); } catch (e) { /* none saved */ }
  const out = {};
  if (j && Number.isInteger(j.startSample) && j.startSample >= 0) out.startSample = j.startSample;
  if (j && Number.isInteger(j.lengthSamples) && j.lengthSamples > SR) out.lengthSamples = j.lengthSamples;
  if (j && typeof j.xfade === 'number' && j.xfade >= 0 && j.xfade < 10) out.xfade = j.xfade;
  return out;
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ maxBuffer: 1 << 28, encoding: 'utf8' }, opts));
  if (r.status !== 0) throw new Error(cmd + ' failed:\n' + (r.stderr || '').split('\n').slice(-12).join('\n'));
  return r;
}
function stemFile(name) {
  const f = fs.readdirSync(STEMS).find(x => x.replace(/^\d+ /, '').replace(/\.mp3$/i, '') === name);
  if (!f) throw new Error('stem not found: ' + name);
  return path.join(STEMS, f);
}

function build(el, tmp) {
  const C = CONFIG, S = C.startSample, E = S + C.lengthSamples, X = Math.round(C.xfade * SR);
  const stems = Object.entries(C.layers[el].stems);
  const args = ['-y', '-v', 'error'];
  stems.forEach(([n]) => args.push('-i', stemFile(n)));
  const parts = [], tags = [];
  stems.forEach(([n, db], i) => {
    // body = [S, E) at full level + tail = [E, E+X) fading out underneath its start: exactly lengthSamples long, first note untouched
    parts.push(`[${i}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${db}dB,asplit[b${i}][t${i}]`);
    parts.push(`[b${i}]atrim=start_sample=${S}:end_sample=${E},asetpts=PTS-STARTPTS[bo${i}]`);
    parts.push(`[t${i}]atrim=start_sample=${E}:end_sample=${E + X},asetpts=PTS-STARTPTS[ta${i}]`);
    parts.push(`[ta${i}]afade=t=out:st=0:d=${X / SR}:curve=qsin[tf${i}]`);
    parts.push(`[bo${i}][tf${i}]amix=inputs=2:normalize=0:duration=longest[x${i}]`);
    tags.push(`[x${i}]`);
  });
  parts.push(tags.join('') + `amix=inputs=${stems.length}:normalize=0:duration=longest,atrim=end_sample=${C.lengthSamples},alimiter=limit=${C.limit}:level=0[mix]`);
  const wav = path.join(tmp, el + '.wav');
  run('ffmpeg', [...args, '-filter_complex', parts.join(';'), '-map', '[mix]', '-c:a', 'pcm_f32le', wav]);

  // measure, then one linear gain to the target loudness (capped so the true peak stays under the ceiling)
  const m = run('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr;
  const sum = m.slice(m.lastIndexOf('Summary:'));
  const I = parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec(sum)[1]), P = parseFloat(/Peak:\s+(-?[\d.]+) dBFS/.exec(sum)[1]);
  const gain = Math.min(C.targetLufs - I, C.ceiling - P);
  const ogg = path.join(tmp, el + '.ogg');
  run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', `volume=${gain}dB`, '-c:a', 'libvorbis', '-q:a', '4', ogg]);
  const bytes = fs.readFileSync(ogg);
  console.log(`${el.padEnd(6)} stems=${stems.map(s => s[0]).join('+')}  raw ${I.toFixed(1)} LUFS peak ${P.toFixed(1)}  gain ${gain.toFixed(1)} dB  ${(bytes.length / 1048576).toFixed(2)} MB ogg`);
  return `// GENERATED by tools/musicbuild/build.js (layer: ${el}). Do not hand-edit.\n(window.AUDIO_DATA = window.AUDIO_DATA || {}).music_${el} = 'data:audio/ogg;base64,${bytes.toString('base64')}';\n`;
}

function main() {
  Object.assign(CONFIG, loopOverride());
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wands-music-'));
  try {
    // all four are built before any file is written, so a failure half way never leaves layers of different lengths
    const files = Object.keys(CONFIG.layers).map(el => [el, build(el, tmp)]);
    for (const [el, text] of files) fs.writeFileSync(path.join(OUT, `music_${el}.js`), text);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(`loop = ${(CONFIG.lengthSamples / SR).toFixed(3)}s (${CONFIG.lengthSamples} samples, start ${CONFIG.startSample}) -> ${OUT}`);
}
if (require.main === module) main();
module.exports = { CONFIG, SR, STEMS, LOOP_FILE, loopOverride };
