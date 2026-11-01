# Juice ledger: every verb gets a sound, a burst and a kick

The rule (also in CLAUDE.md > "Juice"): **a verb the player performs, or the game performs for them, is never flat.** Each one answers three things at the moment it happens:

1. **Sound**: an `AU.sfx(...)` call (the busy ones drift in pitch and volume, `VARY` in audio.js; a sound made in the wilds carries its position).
2. **Burst**: a particle burst, ring or puff where it happened (`FA.burst` / `FA.eburst` / `FA.landPuff` on the Builder's side, `WZ.puff` / `WZ.epuff` / `WZ.ring` in the wilds).
3. **Kick**: something moves: the camera shake (`w.shake` in the wilds, `FA.nudge` / `FA.thump` / `FA.rumble` in the factory) or, for the small hand verbs, the Builder's squash (`bd.squash`).

This is the sibling of `FEEDBACK.md` (what / why / what next). That one is about information, this one is about feel. **`tools/featcheck` (section "the juice ledger") parses the table below, runs each row's verb for real and FAILS when one of the three is missing**, or when a row has no probe. Rows that cover a whole data list (`build` = every entry of `CFG.buildings`, `wand` = every element of `CFG.wand.need`) loop over the list themselves, so a NEW building or a new wand element is caught without touching the test. To add a verb: add a row here and a probe in `tools/featcheck/run.js`.

| id | Verb | SOUND | BURST | KICK | Where |
|---|---|---|---|---|---|
| `wand` | Cast any wand attack (Flame Trail, Vanishing Puff, Riding Wave, Statue: every element in `CFG.wand.need`) | `zap_<element>` (+ `slam` / `thud` as the attack lands) | a ring and an element puff round him | camera shake (`w.shake`) | `WZ.wandFire` / `wandAir` / `wandWater` / `wandEarth`, js/wand.js |
| `throw` | The Builder throws an item | `throw` (pitch / volume drift) | three sparks of the item's colour off his hands | his squash (`bd.squash`) | `FA.throwOne` |
| `pick` | The Builder picks something up: a Stockpile tile, a loose floor item, a machine's output, a crate | `pickup` (pitch / volume drift) | four sparks of the item's colour where it was | his squash | `FA.pickJuice` (`takePile`, `pickFloor`, `takeOut`) |
| `build` | A building (any entry of `CFG.buildings`, tiles included) is finished | `complete` | gold sparks + the landing puff of dust (Floor / Stockpile Tiles: green / sand sparks) | a camera nudge of the factory (`FA.nudge`) | `FA.onComplete`, `FA.finishTile` |
| `deliver` | A spell / item hits the Spell Portal | `smack` (soft thwap) | a small burst of the item's colour (its element's pattern) out of the portal | a 2.5 px camera nudge | `FA.suck` -> `FA.smack`, `R.drawSuck` |
| `hit` | A spell hits a foe (the plain tick, a weakness hit, a BIG one) | `hit` / `hitw` / `thump` (layered: sub boom + body knock + noise crack + tail), position carried | the spell's own | the spell's own | `WZ.hurtE` |

Audio variation and position are proved by the same section: repeated `hit`, `throw`, `pickup`, `roll`... never play the same way twice in a row (`AU.variation`), and a sound at a position pans to its side of the Wizard (`AU.panK`) and falls off with distance (`AU.farK`).
