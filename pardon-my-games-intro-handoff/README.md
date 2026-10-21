# "Pardon My Games" studio intro — handoff

The animated "PARDON MY GAMES / STUDIO PRESENTS..." splash from Finsanity, pulled out so it can be dropped into another game. Plain ES modules, no build step, no dependencies.

## What it is
13 chunky bubble letters (PARDON, MY, GAMES) fly in one after another with a bouncy overshoot and a landing squash, each word then hovers on its own wave, "STUDIO PRESENTS..." slides up character by character with a sparkle burst, bubbles/stars/hearts drift, it holds ~2.5 s and fades out (~6 s total). Click, any key, or the corner "skip >>" button ends it at any point. Everything is canvas-drawn (letters, stars and particles are baked into sprites once), so a frame is about one `drawImage` per letter.

## Files
| File | Purpose |
|---|---|
| `index.html` | Working demo, and the minimal markup to copy (the `#studio-intro` block). |
| `js/StudioIntro.js` | The whole animation. Exports `runStudioIntro(onDone)`, `loadStudioIntroFonts()`, `studioIntroIsActive()`, `skipStudioIntroOnNextLoad()`. |
| `js/IntroConfig.js` | All tunable timings/counts (`STUDIO_INTRO_*`). |
| `js/IntroSound.js` | Standalone audio: per-letter bloops + the background bed. Replace with your engine if you have one (needs `playIntroLetterBump(index)`, `playStudioIntro(durationS)`, `stopStudioIntro()`). |
| `css/studio-intro.css` | Overlay backdrop, fade-out, skip button. |
| `audio/playStudioIntro.wav` | The background bed recording (optional; a synth pad plays if it is missing). |
| `reference/` | Excerpts from the original game: `main-js-wiring-excerpt.js` (how the loading screen hands off to the intro), `Sound-intro-section.js` + `Sound.js.original` (the original audio code), `font-links.html`. |

## Using it in another game
1. Copy `js/`, `css/studio-intro.css`, `audio/playStudioIntro.wav` into the project (keep the relative paths, or edit `BED_URL` in `IntroSound.js`).
2. Add the font `<link>` from `index.html` (Fredoka 700 + Press Start 2P) and the stylesheet.
3. Add the overlay markup (hidden by default):
   ```html
   <div id="studio-intro" class="hidden">
     <canvas id="studio-intro-canvas"></canvas>
     <button id="studio-intro-skip" type="button">skip &gt;&gt;</button>
   </div>
   ```
4. From a user gesture (browsers keep audio locked until one):
   ```js
   import { loadStudioIntroFonts, runStudioIntro } from './js/StudioIntro.js';
   await loadStudioIntroFonts();          // letters are baked once, fonts must be ready
   runStudioIntro(() => { /* show your title screen */ });
   ```
   The callback fires exactly once, whether it finished or was skipped.
5. The overlay is `z-index: 800`; adjust in the CSS to sit above your UI. If your game has its own render loop, you can pause world rendering while `studioIntroIsActive()` is true (the intro runs its own `requestAnimationFrame` loop).

## Tuning
Edit `js/IntroConfig.js`: start delay, letter stagger, blip start/interval (sound leads the picture), fly time, hover amplitude/speed, presents delay, hold time, burst and ambient particle counts. Look constants (outline, colours, extrusion) are at the top of `StudioIntro.js`.

## Notes
- `skipStudioIntroOnNextLoad()` uses a `sessionStorage` key so the intro can be skipped on one deliberate reload (the game used it for "Main Menu"). Rename the key (`SKIP_NEXT_KEY`) for your game or ignore it.
- Run the demo with any static server (ES modules don't load from `file://`), e.g. `npx serve .` or `python -m http.server`.
- Original context: the intro is described in the "Studio Intro Splash" section of the Finsanity `CLAUDE.md`.
