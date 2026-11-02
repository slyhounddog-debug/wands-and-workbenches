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

### The Rootkeeper's rows (3-player mode)

He answers the same three questions in HIS world, with his own meters: the sound goes through `M3.sfx` (his machine plays it; a Rootkeeper guest hears it from the host's sound log, `G.snd` entries with `k: 1`; the Builder and the Wizard never hear the underworld), the burst is an underworld effect (`M3.fx`), the kick is his camera shake (`G.u.shake`, `M3.kick`, drawn by `R.drawUnder`; what he grows or springs is felt in the wilds too: `M3.feel`) or his squash (`rk.squash`). What he shares with the other roles (pick, throw) is the SAME function: `FA.pickJuice` / `FA.throwJuice`, handed his burst and his sound.

| id | Verb | SOUND | BURST | KICK | Where |
|---|---|---|---|---|---|
| `rk-roll` | Root Roll | `roll` | a puff of dust off the ground + the afterimages | squash + a small camera kick | `M3.moveRk` |
| `rk-pick` | He picks up remains, or takes the last one out of a pylon | `pickup` | sparks of the item's colour | his squash | `M3.takeItem`, `M3.pullPylon` -> `FA.pickJuice` |
| `rk-throw` | He throws remains | `throw` | sparks off his hands | his squash | `M3.throwOne` -> `FA.throwJuice` |
| `rk-land` | A throw comes down: into a pylon, a burner, or on the ground | `bank` / `drop` / `thud` | a ring in the element's colour (dust on the ground) | camera kick, the building hops | `M3.flyTick` |
| `rk-plant` | He plants a seed or a trap | `dig` / `place` | dust where it goes in | squash + camera kick | `M3.throwOne` |
| `rk-build` | He places a building (every entry of `CFG.mode3.bld` that is a building) | `place` | dust + a ring where it lands | squash + camera kick | `M3.place` |
| `rk-hose` | He starts a hose, lays it, takes it off | `blip` / `place` / `menu_close` | sparks (a stream along a new hose, a puff when it comes off) | squash (+ camera kick on a new hose) | `M3.hoseAt` |
| `rk-remove` | He takes a building down | `drop` | a puff where it stood | squash + camera kick | `M3.removeAt` |
| `rk-craft` | A crafter starts, and finishes, a seed or a trap | `craft` / `complete` | gold sparks | squash + camera kick | `M3.craft`, `M3.craftTick` |
| `rk-mash` | He taps a node or a mirror Harvester | `crank` | sparks in its colour | his squash | `M3.mash` |
| `rk-burner` | He sets what a Burner burns | `el_<element>` | a ring in the element's colour | squash + the Burner hops | `M3.setBurner` |
| `rk-grow` | A node is charged and grows up in the wilds | `powerup` | rings below and above | camera kick (and the Wizard's, if he is near) | `M3.manifest` |
| `rk-trap` | A trap fires on foes in the wilds | `slam` / `freeze` | rings and a puff in both worlds | camera kick (and the Wizard's, if he is near) | `M3.trapTick` |
| `rk-send` | A mirror Harvester sends a packet up | `el_<element>` | motes rising out of the factory floor + a lift below | the factory nudges, his camera kicks | `M3.mirrorSend` |
| `rk-ash` | A Collector lifts ash into the skill bank | `bank` | a column of the Ash's colour | camera kick | `M3.collectorTick` |

Audio variation and position are proved by the same section: repeated `hit`, `throw`, `pickup`, `roll`... never play the same way twice in a row (`AU.variation`), and a sound at a position pans to its side of the Wizard (`AU.panK`) and falls off with distance (`AU.farK`).
