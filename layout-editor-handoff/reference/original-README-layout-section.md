## Layout tab

Visual editing of the **DOM UI** (everything in `index.html` + `style.css`/`nautical.css`: title planks, save-slot / new-game / World Settings / pause / Settings / Controls windows, Shop, Tank, Science Lab, Base Stats, HUD, minimap buttons, toolbar). Not the canvas art (fish, tiles, decor are drawn by code; they are not editable here).

**How it works.** The tool server also serves the game under `/game/` (same origin as the tool, so the tab can reach into the preview iframe; the real game on 8080 is unaffected). The preview page is the real `index.html` plus an inline script that (1) seeds a fixture save into the preview's own localStorage (never your real saves), (2) silences all audio, and (3) loads `layout-host.js`, the in-iframe half of the editor. Pick a **Screen** from the dropdown (presets in `layout-presets.json`: title, save slots, New Game flow, World Settings, HUD, Shop, Tank, Lab, Stats, Pause menu...) and the preview boots, loads the fixture and walks to that screen. Press **Play** to use the game normally (open another panel yourself), **Edit** to select things.

**Editing.** In Edit mode clicks select instead of playing: drag to move, drag a handle to resize, arrow keys nudge 1px (Shift 10px), Alt+click digs through whatever is stacked under the cursor, Esc deselects. The side panel has the element's selector (and chips to apply the edit to *every* element sharing a class, e.g. all `.plank-btn`), Position, Size, font size / color / opacity / Hide, any other CSS property, the element's own text (each text node), the breadcrumb + parent/child/sibling buttons (for click-through layers), an "Elements on screen" id list, and **All changes**. Undo/Redo (Ctrl+Z / Ctrl+Y, also inside the preview) and autosave (500 ms) are built in.

**Where edits are saved** (the game's own source is never edited):

| File | What |
|---|---|
| `css/layout.json` | The source of truth: `{ rules: [ { sel, css: {prop: value}, text: {childNodeIndex: "string"} } ] }`. |
| `css/layout.css` | Generated from the JSON on every save (`sel { prop: value !important; }`). Linked in `index.html` after `nautical.css`, so it wins over both sheets and over inline styles set by code. Empty (just a comment) when there are no overrides. |
| `js/LayoutOverrides.js` | Applies the `text` overrides at game start (fetches `css/layout.json` once). Static `index.html` text only: text the game rebuilds from code is rewritten by the game, so use the Text tab for that. |

Moves use the CSS `translate` property (composes with the element's existing `transform`, works on anything, doesn't disturb the layout around it). Deleting a rule (or Undo) restores the original look; "Reset this rule" / the ✕ in All changes do it per element. Both files show up in the Commit dialog like any other change.

| File | What |
|---|---|
| `tools/sfx/layout.mjs` | Server: `/game/` (the game, with the seed + editor script injected), `GET/POST /api/layout`. Saves are sanitised (`layout-model.js`): unsafe selectors/properties/values (`url(`, `{ } ; < @`, ...) are dropped. |
| `tools/sfx/layout-model.js` | Shared (server, tab, iframe): model shape, sanitiser, JSON -> CSS. |
| `tools/sfx/layout-host.js` | Runs inside the preview: picking, hover/selection overlay, drag/resize/nudge -> CSS patches, live CSS + text, scripted steps. |
| `tools/sfx/layout.js` | The tab: panel, undo/redo, autosave, presets, preview sizing. |
| `tools/sfx/layout-presets.json` | Fixtures + screens. Read on every request (no restart). A screen is `{id, label, fixture?, hold?, steps}`; steps: `{waitFor: sel}`, `{click: sel}`, `{key: 'KeyE'}` (a game hotkey), `{show/hide: sel}`, `{wait: ms}`, `{include: 'otherId'}`. |

**Adding a screen:** add an entry to `layout-presets.json` (copy the "hud" steps via `include` for anything in game, then a hotkey or `click`). The fixture is any save file (`tools/bench/fixtures/stress_raw.json` by default).

**Limits.** Selectors for elements the game builds from code (shop cards, save-slot rows, achievement cards) are positional (`nth-child`), so they can drift if the game's content changes; prefer a class chip ("all N matching .x") for those. Elements the game repositions every frame with inline `left/top` are fine (the override is `translate`, not `left/top`). `!important` rules also beat anything the game sets inline for the same property. Restart the tool server after pulling in `layout.mjs`/`server.mjs`; the rest loads fresh.
