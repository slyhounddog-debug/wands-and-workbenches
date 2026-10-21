# Layout editor handoff

A self-contained package for building the Layout tab (visual UI editor) for a different game.

## How to use

1. Copy this whole folder (`layout-editor-handoff/`) to the other computer, into the root of the new game's project.
2. Open Claude Code in that project.
3. Open `PROMPT.md`, copy its entire contents, and paste it as your first message.
4. Claude starts with an investigation of how the new game renders and comes back with findings and a plan. Answer its questions and say go.
5. When it is done, delete this folder from the project (or keep it out of the commit); the finished tool is documented in the new project's own README.

## What is in here

- `PROMPT.md`  the brief to paste (goal, phased process, the full design, the rules)
- `reference/INTEGRATION-NOTES.md`  file map, the touch points, and every game-specific assumption in the reference code
- `reference/tool/`  server, shared model, in-iframe editor, tab UI, example presets (from the original game)
- `reference/game/`  the tiny game-side module + empty override files
- `reference/integration-diff.patch`, `reference/original-README-layout-section.md`, `reference/screenshots/`

The reference code was written for a DOM-based game and will not run unchanged elsewhere. It is a worked example for Claude to adapt, not a drop-in package.
