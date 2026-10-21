I want you to build a visual UI layout editor dev tool for this game. I already built one for a different game, so this brief describes what it does, the design decisions that made it work, and the traps I hit. Your job is to work out how THIS game renders and adapt the design to it, not copy it blindly.

REFERENCE MATERIAL (read this first)
The folder `layout-editor-handoff/` (next to this prompt; if it is not at the project root, find it) contains the working implementation from the other game:
- `reference/INTEGRATION-NOTES.md`  <- start here: file map, the exact touch points, and every game-specific assumption baked into the reference code
- `reference/tool/`   layout.mjs (server side), layout-model.js (shared model/sanitiser/CSS generator), layout-host.js (runs inside the preview iframe), layout.js (the tab UI), layout-presets.json (screens)
- `reference/game/`   LayoutOverrides.js (the tiny module the game itself loads), plus an empty layout.json / layout.css
- `reference/integration-diff.patch`  how it was wired into the other game's server, tool page and index.html
- `reference/original-README-layout-section.md`  the tool's documentation
- `reference/screenshots/`  what the finished tool looks like
The reference was written for a DOM-based game (HTML/CSS UI over a canvas world) that already had a dev-tool server on port 8081 with several tabs. Treat it as a working example of the design below, not as drop-in code. It will not run unchanged here; expect to rewrite the game-specific parts and possibly the shell around it.

GOAL
A dev tool, on its own port, where I see the real game in a preview, click/drag/resize UI elements, edit their text and styles, and the changes are saved as OVERRIDES that the real game applies on top of its normal styles. Scope for v1: layout and text of the screen UI (menus, panels, HUD, buttons, modals). Not painting sprites or editing procedural art.

PHASE 0 - INVESTIGATE FIRST, THEN REPORT BEFORE BUILDING
Find out and tell me:
1. How is the UI rendered: plain DOM/CSS, a framework (React/Vue/Svelte/etc.), canvas drawn by hand, or a game engine (Phaser/Pixi/Godot web export/Unity WebGL/etc.)? Is it a mix (DOM UI over a canvas world)?
2. Dev server, build tooling, how assets are loaded (relative or absolute URLs), how the page boots, any loading screen waiting for a user gesture.
3. How screens/panels are shown (class toggles, routes, state), and what hotkeys or buttons open each one.
4. How state is saved (localStorage keys, format), so I can seed a mock/fixture state.
5. How audio plays, and any existing dev tools or tool server in the repo.
Then propose an adaptation plan and ask me about anything genuinely ambiguous. Wait for my go-ahead before building.

If the UI is DOM-based, build it the way described below. If it is a framework, the same approach works with caveats: CSS overrides survive re-renders, but text and inline-style changes may be clobbered, so say how you'll handle that. If the UI is canvas- or engine-drawn, the design does NOT transfer directly: propose an alternative (a registry of named UI elements with positions, or a display-list hit-test) and let me choose before building.

THE DESIGN (what worked)

Architecture:
- A separate dev-tool server (it has file-writing endpoints, so keep it apart from the game's own server and never restart or kill the game's server). It serves the game under /game/ from its own origin, so the editor page can reach into the preview iframe (cross-port iframes can't be inspected). Always link it with the trailing slash, since the game's relative URLs depend on it.
- The server serves the game's index.html with a script injected at the top of <head>. A classic inline script (not a module, so it runs before any game code) does: set window.__layoutEditor = true; wipe ONLY the game's own storage keys by prefix (the tool shares that origin's localStorage, so never clear everything); seed a fixture save so screens show realistic data; mute audio by stubbing HTMLMediaElement.prototype.play to a resolved promise and AudioNode.prototype.connect so nothing ever connects to an AudioDestinationNode. Then a module script loads the in-iframe editor.
- The preview is NOT for playing. It is muted, runs from a seeded save, and is separate from the real game's storage.
- One tab or page in the tool: top bar (screen dropdown, preview size, Edit/Play toggle, Undo/Redo, Reload), the preview iframe scaled to fit (transform: scale, so scale the handle sizes by 1/scale), and a right-hand side panel.

Screens (presets):
- A JSON file of presets, read per request so edits need no restart: {id, label, fixture?, hold?, steps}. Steps run inside the preview after boot: waitFor selector, click selector, key (dispatch a keydown/keyup with code on window to trigger a game hotkey), show/hide a class, wait ms, include another preset's steps. Verify every preset with real screenshots, because a step can run without the panel actually opening.
- If the game waits for a first click or keypress to start, dispatch a synthetic event for it automatically (and let a preset opt out, to edit the loading screen itself).
- Ignore events with isTrusted === false in the editor's blockers so scripted steps still work in Edit mode.
- Pausing game time in preset steps (if the game has it) keeps screens stable. A hidden (display:none) tab stops requestAnimationFrame, so the preview idles when you leave the tab.

Edit mode vs Play mode:
- Play mode passes everything through so I can navigate to a screen myself. Edit mode registers capture-phase listeners on the iframe window FIRST (before game scripts) and calls stopImmediatePropagation on real mouse/pointer/keyboard/wheel events so the game never reacts. Call window.focus() on pointerdown so arrow keys and Ctrl+Z reach the iframe; refocus it after clicking panel buttons.
- Picking: document.elementsFromPoint, skipping html/body/the main canvas and the editor's own overlay. Alt+click cycles to the next element underneath. Panel buttons for parent/child/prev/next sibling, plus a filterable list of visible elements with ids, for layers that have pointer-events:none or are tiny.
- Overlay drawn INSIDE the iframe (fixed-position div, pointer-events none, handles pointer-events auto): hover box, selection box with a label (tag#id WxH) and 8 resize handles, updated in a rAF loop only while editing. Re-find the selected element by selector if the game rebuilds its DOM.
- Drag threshold of 3px; Shift constrains an axis; arrows nudge 1px, Shift+arrow 10px; Escape deselects; Ctrl+Z/Ctrl+Y work from the iframe too.
- Correct drag distance for an ancestor scale (rect.width / offsetWidth).

How edits are stored (overrides; the game's source is never edited):
- A JSON model is the source of truth: { version, rules: [ { sel, css: {prop: value}, text: {childNodeIndex: "string"} } ] }.
- On every save the server also generates a CSS file: sel { prop: value !important; }. The game links it LAST. Moves use the CSS translate property (it composes with an existing transform, works on anything, and doesn't disturb the layout). Resizing sets width/height and also lifts a stylesheet max-/min- size that would cap it. !important beats inline styles the game sets in code.
- Text can't be done in CSS, so a tiny module in the game fetches the JSON once at startup and sets text nodes by child-node index. It must be idempotent and remember original strings so removing an override restores the text. Static markup only; text the game rebuilds from code gets overwritten, so say so in the UI and docs (and point at any existing text-editing tool).
- The editor and the real game must run the SAME apply code for live preview (the editor imports the game's module). In the preview, disable the game's own link to the generated CSS and drive a live <style> from the in-memory model instead, so removed rules vanish immediately.
- The server sanitises every save: drop selectors containing { } ; < @ or comment markers, properties not matching ^-?[a-z][a-z0-9-]*$, values containing { } ; < @ \ url( expression( !important or comment markers, de-duplicate selectors, drop empty rules. Write both files atomically.
- Autosave with a ~500ms debounce, plus a beacon on page unload. Undo/redo by whole-model snapshots with coalescing (one undo step per drag or typing burst).

Selectors:
- Unique selector: #id if unique; otherwise the shortest tail of a parent > child chain (segments are tag.class when that class is unique among siblings, else tag:nth-child(n)) that matches exactly that element. Ignore state classes (hidden, active, open, selected, disabled, collapsed, ...). Verify with querySelectorAll.
- Offer chips for "all N elements matching .class" so one edit can restyle a whole family, and let me edit the selector text directly (showing how many elements it matches). Show other existing rules that already match the selected element.
- Warn that selectors for code-built lists are positional and can drift.

Side panel: breadcrumb, selector + chips, Move X/Y, Width, Height, Font size, Color, Opacity, Hide (display:none), free-form "other CSS" property/value rows, each of the element's text nodes in textareas (showing the original), Reset this rule, and an "All changes" list (click to select, x to delete). Fields show the current computed value as a placeholder and highlight when overridden.

PROCESS RULES
- The game must pay nothing per frame: one extra small stylesheet and one small startup fetch at most, no hooks in hot loops. Do not restructure the game's code for the tool.
- Never edit the game's source from the tool. Everything goes through the overrides files.
- Follow this repo's existing conventions (check for CLAUDE.md, README, existing tools, commit style) and document the tool the same way, including how to add a screen preset.
- Test with a real browser (Playwright or similar) driving the tool: boot every preset and look at screenshots, test drag/resize/text/undo/class-chip/Alt+click/Edit-vs-Play, then load the REAL game and confirm it applies the saved overrides, then clean the overrides files back to empty. Run your own test copy of the tool on a different port, and never kill or restart my running dev servers without asking.
- Don't commit or push until I ask.

Start with Phase 0 and report back.
