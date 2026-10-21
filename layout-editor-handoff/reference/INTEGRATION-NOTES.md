# Reference implementation: integration notes

This is the Layout tab as built for Finsanity (a DOM-UI + canvas-world browser game, plain ES modules, no build step, Express game server on :8080, dev-tool server on :8081 with several tabs). Read this before the code: it says which parts are generic and which are assumptions about that one game.

## File map

| File | Role | Generic? |
|---|---|---|
| `tool/layout-model.js` | Model shape, sanitiser, JSON -> CSS. No DOM, no Node APIs; imported by the server, the tab and the iframe script. | Fully generic |
| `tool/layout-host.js` | Runs INSIDE the preview iframe: picking, overlay, drag/resize/nudge -> CSS patches, live CSS/text, scripted steps. Exposes `window.__layoutHost`. | Mostly generic (see below) |
| `tool/layout.js` | The tab UI in the tool page: side panel, undo/redo, autosave, presets, preview sizing. | Generic logic, but it assumes the host page's shell (see below) |
| `tool/layout.mjs` | Server: serves the game under `/game/` with the seed/editor script injected; `GET/POST /api/layout`; writes the two override files. | Generic structure, game-specific constants |
| `tool/layout-presets.json` | Fixtures + screens (steps that walk the preview to each screen). | Entirely game-specific content |
| `game/LayoutOverrides.js` | The only code the real game loads: applies the `text` overrides at startup, idempotently. | Generic |
| `game/layout.json`, `game/layout.css` | Empty starting overrides. JSON is the source of truth; CSS is generated from it. | Generic |
| `integration-diff.patch` | The edits made to the other game's `index.html`, the tool's `server.mjs`, tool page `index.html` and `tuning.js` to wire it in. | Illustrative |
| `original-README-layout-section.md` | Documentation as written for the other game. | Illustrative |

## Touch points in the other game (all small)

1. Game `index.html`: `<link rel="stylesheet" href="css/layout.css">` AFTER the game's own stylesheets, and `<script type="module" src="js/LayoutOverrides.js"></script>` BEFORE the main script (separate module so a failure there can never stop the game from starting).
2. Game server: must serve `css/layout.css` and `css/layout.json` (it already served `/css`).
3. Tool server: `layout.mount(app, express, ROOT, TOOL_DIR)` from `layout.mjs`, plus a static route (`/app/`) that serves the tool's own browser scripts (`layout-host.js`, `layout-model.js`, `layout.js` are fetched from `/app/...`).
4. Tool page: a nav button, a `<main id="view-layout">`, and `<script type="module" src="/app/layout.js">`.
5. Tab switching: the other tool's `tuning.js` owned the tab switcher; adding a tab meant adding `layout: $('#view-layout')` to its `VIEWS` map. The tab UI listens for a `devtools:tab` window event (detail = tab name) to lazy-load.

## Game-specific assumptions baked into the reference (CHANGE THESE)

In `layout.mjs`:
- Storage keys: wipes keys starting with `finsanity_`, seeds `finsanity_prefs_v1` (turns off guided tutorials) and `finsanity_save_v1` (the fixture save). Replace with the new game's keys and save format.
- `ROOT` layout: game files at `ROOT/index.html`, `ROOT/js`, `ROOT/css`, `ROOT/audio`, plus one video file. Replace with the new game's asset folders (the `/game/...` static routes must mirror whatever paths the game's HTML references).
- Override files live in `ROOT/css/`. Put them wherever the new game serves stylesheets from.
- Fixture files are read from paths listed in `layout-presets.json` (`tools/bench/fixtures/stress_raw.json` in the other game).

In `layout-host.js`:
- Imports `/game/js/LayoutOverrides.js` and `/app/layout-model.js`; adjust to the real URLs.
- The "boot gate": the other game shows a loading screen that waits for a first click/keypress, so the host polls for `#loading-status.ready` and dispatches a synthetic `pointerdown`. Replace with whatever (if anything) the new game waits for. A preset can set `hold: true` to skip this.
- `STATE_CLASSES` regex (classes ignored when building selectors: hidden, active, open, ...). Extend for the new game's state classes.
- `'#game-canvas'` is excluded from picking. Change to the new game's main canvas id.
- `host.run` step vocabulary (`waitFor`, `click`, `key`, `show`, `hide`, `wait`) is generic; `key` dispatches on `window` because that game listens there.

In `layout.js`:
- Assumes the tool page provides: `#view-layout`, a `#status` element for toast text, CSS variables (`--bg --card --line --ink --mute --acc --ok --bad`) and a `button` base style, and dispatches `devtools:changed` after saves (so a "Commit" badge can refresh). If the new tool page has no such shell, build a small standalone page instead and adapt these.
- Preview sizes (1600x900 etc.), the `layout_*` localStorage keys.

In `layout-presets.json`: every selector, hotkey and flow (Load Game -> slot list -> pick slot, `KeyE` = shop, ...) is specific to the other game.

## Things that are NOT obvious (learned the hard way)

- A cross-origin iframe can't be inspected, so the game must be served from the tool's own origin. The tool and the preview then share localStorage: only remove the game's own keys, never `localStorage.clear()`.
- The seed script must be a CLASSIC inline script in `<head>` (runs before any module). Module scripts run in document order, but don't rely on that for seeding storage or stubbing audio.
- Edit-mode blockers must be registered on the iframe `window` in the capture phase before the game's own listeners. They must skip `!event.isTrusted` events, otherwise the synthetic clicks/keys used by preset steps (and the boot gate) get swallowed.
- Use the CSS `translate` property for moving, not `left/top` or `transform`: it composes with the element's existing `transform` (e.g. a `translate(-50%,-50%)` centring trick) and with positions the game sets in JS every frame.
- `!important` in the generated stylesheet beats inline styles set by game code.
- When resizing, a stylesheet `max-width`/`min-width` silently caps the new size; the reference lifts them in the same patch.
- Drag distances must be divided by the element's own ancestor scale (`getBoundingClientRect().width / offsetWidth`), and handle sizes by the preview's zoom.
- Text edits only work on static markup; the game overwrites text it builds from code. Tell the user in the UI.
- After a click on a side-panel button, give focus back to the iframe (`contentWindow.focus()`), or arrow keys and Ctrl+Z go to the panel.
- A `display:none` ancestor stops `requestAnimationFrame` in the iframe, so the preview idles when its tab is hidden.
- Selectors for code-built lists are positional (`nth-child`) and can drift; class-based chips ("all N matching .x") are sturdier.
- Playwright (headless) was enough to test everything. A preset step can "succeed" while the panel never opened, so look at screenshots of every preset.
- Run a scratch copy of the tool on another port (the reference server honours a `PORT` env var) and never kill the user's own running servers.

## Verified behaviours of the reference (so you know what "done" looks like)

Boots all 18 presets with no errors; select/drag/resize/arrow-nudge write the expected rules; class-chip edits move every matching element; Ctrl+Z/Ctrl+Y work inside the iframe; Alt+click selects what is underneath; Hide writes `display:none`; Play mode lets clicks reach the game while Edit mode does not; unsafe rules are dropped by the server; and the REAL game applies the saved CSS and text overrides with no console errors.
