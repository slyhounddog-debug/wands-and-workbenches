# Wands & Workbenches dev tool

A local editor for the game with four tabs: **Layout** (move, resize, restyle and re-word the DOM UI),
**Variables** (every number in `CFG` on a slider), **Formulas** (the game's maths as charts and tables) and **Audio** (replace any sound with an uploaded clip, then trim and edit it).

```
node tools/devtool/server.mjs          # http://localhost:8090/   (PORT=8097 node ... for a second copy)
```

or double-click `tools/devtool/start.cmd`. Node only, no `npm install`. The game itself still runs by opening
`index.html` directly. The tool never edits the game's source: everything it saves lands in `overrides/`, which the
game loads on top of its own files. Delete or empty an override and the game is back to how the code says.

## How it works

The server serves the tool at `/` and the game under `/game/` from the same origin, so the tool page can reach into
the preview iframe. A cross-origin iframe can't be inspected, so keep the trailing slash: the game's relative URLs
depend on it. The preview is the real `index.html` with a script injected at the top of `<head>` that:

- sets `window.__layoutEditor = true`,
- deletes only the game's own `wands*` storage keys and seeds the preset's fixture save into slot 1 (the preview has
  its own origin, so your real `file://` saves are never touched),
- skips the studio intro, and mutes everything (`HTMLMediaElement.play` is stubbed, and no `AudioNode` ever connects
  to the speakers),
- loads `public/layout-model.js` + `public/layout-host.js` before any game script, so the editor's capture listeners
  come first. The host also swallows `blur` / `visibilitychange`, so clicking the tool panel doesn't pause the preview.

The preview is not for playing seriously: it is muted, starts from a fixture, and **Freeze time** (the game's own
`G.paused`) holds the screen still. Untick it in **Play** mode to let the game run.

| File | What |
|---|---|
| `server.mjs` | HTTP server: `/`, `/app/*` (this folder's `public/`), `/game/` (+ injection), `/game/{js,fonts,audio,overrides}/*`, and the APIs below. Sanitises every save and writes atomically. |
| `presets.json` | Fixtures + screens. Read on every request (no restart). |
| `fixtures/midgame.json` | A mid-game save (10 unlocks, built factory, goal 16) seeded by the in-game presets. |
| `public/index.html`, `tool.css`, `shell.js`, `common.js`, `preview.js` | The page, tabs, helpers and the shared preview (screen, size, Edit/Play, Freeze, Reload). |
| `public/layout.js`, `layout-host.js`, `layout-model.js` | Layout tab: side panel / undo / autosave, the in-preview picker + overlay + steps, and the shared model, sanitiser and CSS generator. |
| `public/variables.js` | Variables tab. |
| `public/var-help.js` | Plain-language explanation shown under every Variables row (regex rules over the CFG path). Add a rule when you add a CFG number. |
| `public/formulas.js`, `fcharts.js` | Formulas tab (nine sections) and its canvas chart / table helpers. |
| `public/audiotab.js` | Audio tab. |

| API | |
|---|---|
| `GET/POST /api/layout` | `{model, fixtures, presets}` / save the model -> `overrides/layout.{json,css,js}` |
| `GET/POST /api/tuning` | `{values: {path: number}}` -> `overrides/tuning.{json,js}` |
| `GET/POST /api/audio` | `{clips: {name: params}}` -> `overrides/audio.{json,js}` |
| `PUT /api/audio/<name>` | raw audio bytes (Content-Type = the file's audio type) -> `overrides/audio/<name>.js` |
| `GET` / `DELETE /api/audio/<name>` | the stored clip's bytes / remove it (back to the synth) |

## What the game loads (`overrides/`)

All of these are classic scripts or a stylesheet, so they still work from `file://` (no fetch). `js/overrides.js`
(`OV`) applies them. With empty overrides the game is byte-for-byte its normal self.

| File | Written by | Applied |
|---|---|---|
| `layout.json` | Layout | Source of truth: `{rules: [{sel, css: {prop: value}, text: {childNodeIndex: "string"}}]}` |
| `layout.css` | Layout | Generated `sel { prop: value !important; }`, linked last in `index.html`, so it beats `style.css` and inline styles. |
| `layout.js` | Layout | `window.LAYOUT` (the model); `OV.applyText` sets static text nodes on `DOMContentLoaded`, remembering the originals. |
| `tuning.json` / `tuning.js` | Variables | `window.TUNING = {"world.spawnStart": 1.8, "tree.#water.xp": 40}`; `config.js` calls `OV.tune(CFG, TUNING)` right after `CFG` is defined, before anything derives from it. `#id` picks the array element with that `id`, so tree edits survive reordering the tree. |
| `audio.json` / `audio.js` | Audio | `window.AUDIO_OV = {name: {file, start, end, gain, fadeIn, fadeOut, rate, reverse, loop}}`. |
| `audio/<name>.js` | Audio | The clip as a base64 data URL (`window.AUDIO_DATA[name]`). `js/audio.js` adds a `<script>` per clip, decodes it once the AudioContext exists, and plays it with `OV.playClip` instead of the synth. |

## Layout tab

Pick a **Screen** (preset). In **Edit** mode clicks select instead of playing: drag to move (CSS `translate`, which
composes with the element's own transform), drag a handle to resize (lifts any `max-`/`min-` size in the way), arrow
keys nudge 1px (Shift = 10px), Alt+click digs through whatever is stacked under the cursor, Esc deselects, Ctrl+Z /
Ctrl+Y work in the preview too. Most of the HUD is `pointer-events: none`; the picker switches that off while it
hit-tests, so cards and labels are clickable anyway. The panel has the selector (and chips like "all 5 matching
.ghost" to restyle a whole family; the selector text is editable and shows how many elements it matches), position,
size, font size, colour, background, opacity, Hide, any other CSS property, the element's own text nodes, the
breadcrumb + parent / child / prev / next, "Elements on screen" (every id, for things clicks can't reach) and
**All changes** (click to select, x to delete). Autosave is 500 ms after the last edit, plus a beacon if the page closes.

**Limits.** Text edits only stick on static `index.html` markup; text the game writes from code (HUD numbers, menus,
the skill tree, toasts) is rewritten by the game, and the panel says so per text node. Selectors for code-built lists
(hotbar slots, tree nodes, save slots) are positional (`nth-child`) and can drift: prefer a class chip there. Canvas
art (the factory, the wilds, sprites, canvas labels) is not DOM and is not editable here.

## Variables tab

Every number in `CFG` (`js/config.js`), grouped by its top-level key, with a slider + exact number + reset per row,
a filter, "changed only" and Reset all. The tool page loads `config.js` without overrides, so the defaults shown are
the shipped ones. Edits apply live to the preview's `CFG` (the game reads most values every frame) and save to
`overrides/tuning.json`. Rows marked **reload** are read when the world or a game starts (start resources, harvest
and landmark counts, factory sizes): press Reload screen. Skipped on purpose: `W`, `H`, `HALF`, `FT`, `WT` (the 8-bit
renderer's layout constants). Spell numbers live in `CFG.spells`, so they are here too. Saved paths that no longer
exist in `CFG` are reported and ignored.

## Formulas tab

Nine sections (spawn pressure, spells vs foes and the Chimera, harnessers / belts / machine planner, power and chargers, XP gems,
skill-tree cost and time to afford, creature Eggs, scheduled events, Wizard survival). Each one copies the game's real formula
(named in its blurb) and plots it with hover tooltips plus a table, so a mechanic can be tested without building the situation in game.
Sliders with a solid orange edge when changed are real `CFG` variables: they are the same store as the Variables tab (same
autosave to `overrides/tuning.json`, same live push into the preview), and each section has **Reset this formula's variables**.
Dashed **what-if** sliders (run minute, tier, load, income...) only exist on this page and are remembered in the browser.
The Eggs table has inline inputs for each creature's `n`, craft time and packet costs. A new section = one `add({ id, title, blurb,
params, draw })` in `formulas.js`; keep its maths in step with the game code it mirrors. The tree section's scale boxes are what-ifs:
`costScale` is applied when the game starts, so it is not live on this page.

## Audio tab

Lists the music, the boss music, the factory hum and every `AU.sfx` name (read off the game's own `switch`, so the list
can't go stale). For each one: play the synth original; upload or drop a file (wav, mp3, ogg, m4a, flac: anything
the browser can decode, up to 55 MB); then edit it non-destructively: trim by dragging across the waveform or the
handles, volume (with Normalize), fade in / out, speed + pitch, reverse and loop. "Play edited clip" uses the game's
own `OV.playClip`, so it sounds exactly like the game. Music and the hum always loop in game; the music clip replaces
the synth loop and its reactive layers, `music_boss` plays while the Chimera is out, and the hum clip's volume follows
the factory's activity. Remove a clip to go back to the synth. The studio intro's `audio/playStudioIntro.wav` is not
handled here (`js/intro.js` is generated from the handoff).

## Adding a screen preset

Add an entry to `presets.json` (the order there is the dropdown order):

```json
{ "id": "tree-r-tip", "label": "In game: Wizard tree hover card", "steps": [
  { "include": "tree-r" }, { "eval": "UI.showNodeTip('R', 'hearty')" }, { "waitFor": "#nodeTip" } ] }
```

Fields: `fixture` (a `fixtures` id; inherited through the first `include`), `hold: true` (stay on the loading
screen), `freeze: false` (leave game time running). Steps: `{waitFor: sel, timeout?}`, `{click: sel}`,
`{key: 'KeyT'}` (a hotkey by `e.code`, dispatched on `window` like the game expects), `{show: sel}` / `{hide: sel}`
(the `hidden` class), `{wait: ms}`, `{include: 'presetId'}`, `{eval: 'js'}` (with `W` = `window.__wands`, `G` = the
game state, `UI`) and `{freeze: true|false}`. A step can run without the screen actually opening, so look at the
preview after adding one. To make a new fixture, save a game in the preview (or the real game) and copy the
`wands2_save_slot1` value from localStorage into `fixtures/`.
