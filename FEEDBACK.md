# Feedback ledger: what / why / what next

The rule (also in CLAUDE.md > "What / why / what next"): **anything that changes the player's resources, goal, danger or power must answer three questions without guessing**:

1. **What happened?** A cue where the affected player is already looking.
2. **Why did it happen?** A cause tag: an icon, a line to the source, or a name.
3. **What should I focus on next?** One "next" emphasis (the weakness pip, the pointer, the reason icon).

Cue priority when several fire together: **danger > goal > resource loss > ambient** (`CFG.cue`). A higher cue holds lower toasts back (they queue and come out a beat apart: `UI.toast`), drops the ambient sounds (`AU.setAttn`) and dims the edge bubbles (`FA.attention`).

Every row below has an `id`. Code that fires the cue counts it with `FA.fb(id)` (`G.fb`, plain data); **`tools/featcheck` parses this table and fails if an id has no evidence**, so a new row without a cue (or a cue that stops firing) shows up as a FAIL. Add a row here for every new feature that changes resources, goal, danger or power, and exercise it in `tools/featcheck/run.js` (section "the feedback ledger").

| id | Change | WHAT (cue) | WHY (cause tag) | NEXT (focus) | Where it shows |
|---|---|---|---|---|---|
| `hurt` | The Wizard loses health | red band on the screen edge the hit came from, a chevron round his body pointing at the attacker | the attacker's picture and name (`G.w.hurt`, source = `WZ.src`, captured by orbs, zones and delayed strikes) | the weakness pip beside the picture (what to dodge, what the Builder should send) | Wizard half: `R.drawHurt` (`feedbackdraw.js`) |
| `killer` | The Wizard dies | the GAME OVER panel names the killer | its picture and name (`G.w.killer`) | "weak to X: Builder, send X spells" | both screens: `UI.killerHtml` |
| `threat` | A new danger appears: an event starts, an elite / biome foe is first seen, a foe mutates, the Warden wakes | a panel floats over the Spell Portal | the source's picture and a label (ELITE, MUTANT, THE WARDEN, the event's name) | the element(s) it is weak to, as packets | Builder half: `R.drawThreat`; `FA.threat` |
| `factory-full` | The factory has no room (Stockpile full, floor full) | the pickup comes out of the Spell Portal, bounces off it (red flash and ring, a "full" icon), goes back up into the sky | the item + the "full" icon where the Builder is looking | build Stockpile Tiles (toast, rate limited) | Builder half: `FA.outTick`, `R.drawRej` |
| `reject-wild` | The Wizard picks up something the Stockpile can't take | it goes up his portal like any pickup, bounces in the factory, returns beside him | toast with the item and "The factory is full" | tell the Builder: build Stockpile Tiles | Wizard half toast + the Builder's `factory-full` cue; `WZ.rejectToWild` |
| `bounce` | A throw is turned away (portal, Spawner, machine, belt, edge, pile) | the item boings back toward the Builder | ONE icon row where it landed: item + `ic_x` wrong item, `ic_full` full, `ic_clock` busy, `ic_lock` locked / parents not made, `ic_skull`/`ic_heart` + `n/cap` and `ic_clock` + `n/queue` for the creature caps | fix that one thing | Builder half: `FA.why` |
| `boost` | A Wizard action boosts the factory: a Battery Shrine charges a Battery, an awake shrine / Portal Storm speeds a Harnesser | the building pulses gently | a small bouncing "+" in the boost's colour (element colour, gold for a Battery) | keep hitting the shrine / keep the buff up | Builder half: `R.drawBoost` |
| `tether` | A kill produces a rare drop (Iron, Shard, Core, a recycled packet or spell) | the item's icon floats up over the corpse | a dotted tether from the corpse to the drop | pick it up (it swirls into the Stockpile) | Wizard half: `R.drawTether`, `WZ.drop` |
| `status` | Something slows, snares or burns the Wizard | chips on his health bar | the effect's icon + the picture of whatever does it (`G.w.zSrc`, `slowSrc`, `statBurn`) | step out of it | Wizard HUD: `UI.updateStatus` |
| `foe-status` | A foe is slowed, frozen or dazed | a small icon beside its health bar | the icon itself (blue = slow, white = frozen, yellow = dazed) | hit it now / leave it | Wizard half: `R.drawFoeStatus` |
| `wand-ready` | A wand slot fills | the element's particles are sucked into the staff and swirl in, the slot under his health bar grows and pulses, a toast; only then does the slot start to blink | the element colour | Cycle to arm it, Cast | Wizard half + HUD: `WZ.readyCue`, `R.drawWandFill`, `UI.updateWand` |
| `shrine-ready` | A shrine finishes recharging | the same swirl in the shrine's element colour, a ring on the shrine, a toast | the element | Mash at the shrine | Wizard half: `WZ.readyCue` |
| `goal-focus` | A goal is completed | the card grows, glows and drifts (`UI.celebrate`) | the card itself ("GOAL COMPLETE", XP, gift) | for `CFG.goalFocus` seconds after it the NEW goal's pointer is the only blinking thing (tree-nudge, wand and no-power blinks hold still, edge bubbles dim) | both halves: `FA.attention`, `#game.goalFocus` |
| `priority` | Several cues at once | lower toasts wait in a queue and come out a beat apart; ambient sounds drop; edge bubbles dim | n/a (this is the order, `CFG.cue`) | the highest cue is the one seen and heard | `UI.toast`, `AU.setAttn`, `R.drawFlags` |
| `starve-icon` | A machine is starved | its icon and the edge bubble show the first ingredient it is waiting for | the ingredient | send that | Builder half: `R.drawState`, `R.drawFlags` |
| `jam-icon` | A machine's output is blocked | an orange PAUSE badge (two bars) | the badge, plus the outline colour and dash pattern | clear its output | Builder half: `ic_jam` |

## Already in the game before this layer (kept)

The boss's weakness rim and element at the Spell Portal (`weakFlash`), the first-sighting toasts, the goal pointers and the blinking hotbar slot / tree button, the out-of-power chip, the shake cue, the landing thump and pressure waves, the machine state outlines, the edge bubbles, the Battery Shrine tallies, the drop-in telegraphs over the Wizard, and the hit report at the Spell Portal.
