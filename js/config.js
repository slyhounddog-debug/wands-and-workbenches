'use strict';
const mixHex = (a, b, k) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); };   // blend two #rrggbb colours
// ===== All tuning numbers live here =====
const CFG = {
  W: 1600, H: 900, HALF: 800,
  WW: 200, WH: 200,          // wizard world
  // Everything is drawn into a low-res buffer and scaled up by P, so the whole game shares one pixel grid.
  FT: { TW: 80, TH: 40, S: 4, P: 4 },   // factory iso tile (in screen px) + sprite scale + pixel size
  WT: { TW: 60, TH: 30, S: 3, P: 3 },   // wizard world
  // the factory grid is fixed (w x h tiles); the floor starts as the base rectangle (12x9) and grows one placed Floor Tile at a time. The Stockpile starts as the
  // base rectangle's south-west pile.w x pile.h Stockpile tiles and grows by placed Stockpile Tiles. The first freeIron floor tiles cost wood + stone only, later ones add 1 Iron.
  factory: { w: 48, h: 36, base: { x0: 18, y0: 14, w: 12, h: 9 }, pile: { w: 3, h: 2 }, freeIron: 28 },
  stockCap: 50,               // items of ONE kind a Stockpile tile holds (a kind with more spreads over more tiles)
  rotFlash: 0.7,              // seconds a belt / machine flashes (and shows a big arrow) after R turned it
  carry: { holdT: 0.6 },      // hold the carry key this long on a finished building to pick it up and move it
  stockShow: 4,               // items drawn in a Stockpile tile's stack (the number under it keeps counting past that)
  floorCap: 3,                // loose items a plain floor tile holds (more bounce on to the next tile with room)
  stockReject: 2.5,           // seconds a drop the Stockpile had no room for lies still before the Wizard can try to pick it up again
  start: { wood: 10, stone: 6, iron: 0 },
  satchel: 5,
  autosave: 9,
  beltTime: 0.9,              // seconds per tile before Swift Belts
  manual: { taps: 8 },        // hand-harnessing: taps of E to fill the meter and get one packet (the meter never fills by itself); Quick Hands adds upgrade.manual per tier to each tap
  buffer: 3,
  fuelPerPacket: 15, fuelCap: 120,
  starterSplit: 25,           // the starting Splitter: % of the Air packets that go straight to the Spell Portal (the rest, 75%, feed the Spawner)
  chargeBonus: 0.10,          // every packet burns this much longer in a Battery (+10% charge)
  chargeThrowBonus: 0.20,     // ...and a packet thrown in by hand adds this much on top (+20%)
  batteryMax: 90, stationGen: 10,   // a Battery building holds batteryMax charge and gives stationGen power while it has any
  treeNudge: { every: 18, time: 2.4 },   // while something in the skill tree is affordable its two buttons flash for `time` s, then rest until `every` s have passed since the last flash began
  qShow: 6,                   // seconds the ? station's note about the last thing thrown at it stays up
  batteryLife: 60,            // seconds a Battery lasts at a full 10 power of draw; it drains in proportion to the load it carries
  chargeTipAt: 0.5,           // the first time a Battery falls below this fraction, hint that it can be fed packets, Wood or Stone
  chargeBase: 60, chargeBoost: 1.33,
  swapHold: 1.5, swapCooldown: 5,
  builder: { speed: 5.5, accel: 42, friction: 34, radius: 0.24, roll: { time: 0.4, speed: 2.2, cd: 1.4 } },   // roll = the Tumble track's dodge roll: seconds, speed multiple, cooldown (the Wizard's own is wizard.rollTime / rollSpeed / rollCd)
  reach: 1.75, pickRepeat: 0.2,
  autoPick: { r: 1.0, delay: 0.7, gap: 0.12 },   // a slight pickup range: loose items that have settled within r tiles hop into the hands, one every gap seconds (r 0 = off); delay = seconds after landing
  tipRadius: 3.5,            // building info panels only show within this many tiles of the Builder (or when hovered)
  portalAlpha: 0.25,         // how solid the Spell / Skill Portals are drawn (they are see-through)
  stockFlight: { gap: 0.12, baseT: 0.6, perTile: 0.05, maxT: 1.6 },   // what the Wizard sends to the Stockpile flies out of the Spell Portal: seconds between items, flight time = baseT + perTile x distance (capped)
  inputBuffer: 0.1,         // pick / use / place / roll presses that can't happen yet keep trying this long
  sweepRepeat: 0.07,         // holding pick sweeps up identical nearby items this fast
  throwStackGap: 0.05,       // seconds between items when throwing a whole stack (Shift + right-click / LT + B)
  graceTime: 1,              // after the skill tree closes, the game waits this long ("And...") before resuming
  bankUndoMax: 200,          // how many Skill Portal deposits the tree's undo remembers
  stateSoundR: 7,            // machines within this many tiles of the Builder chirp when their state changes
  hitstop: { elite: 0.02, warden: 0.06 },   // seconds the Wizard's side freezes when an elite / the Warden dies (offline only)
  edgeFlag: { after: 4, max: 5, merge: 96 },   // off-screen machines that stay jammed / starved / unpowered for `after` s get a bubble on the factory's edge pointing at them (at most `max`; same-state ones closer than `merge` px share one bubble with a count)
  throwRange: 6.5, throwRepeat: 0.15,
  portalGap: 0.22,
  portalCatch: 1.35,         // a throw that lands within this many tiles of a portal that takes it is pulled in, so nothing piles up on the floor beside it
  catchR: 0.7,               // the same grace for every building and blueprint that is taking the item: a throw that lands within this many tiles of its tile goes in instead of onto the floor
  suck: { baseT: 0.3 },       // Spell Portal intake animation: seconds the item spends being slurped in (then it arcs out of the factory: arc.outT)
  arc: { outT: 0.24, inT: 0.42, h: 90 },   // deliveries cross the split: seconds rising out of the factory's top-right corner, seconds sailing in from the wilds' top-left onto the Wizard, extra arc height (px)
  thump: 0.36,                // a Forge / Cauldron that finishes a craft thumps (squash and stretch) this long and puffs exhaust in its elements' colours
  boing: { T: 0.55, h: 2.6, back: 0.55, min: 1.2, max: 2.8 },   // a rejected throw springs back toward the Builder: flight time, arc height, share of the way back (clamped to min..max tiles)
  // throwing a combo spell (2 / 3 / 4 elements) or an Elixir into a Battery overcharges it: it fills by this share of a full
  // Battery (up to max x a full one) and gives +power for that many seconds
  overcharge: { fill: [0, 0, 0.35, 0.6, 1], time: [0, 0, 12, 20, 30], elixir: 0.45, elixirT: 15, max: 1.5, power: 5 },
  // A hit that costs the Wizard HEALTH can shake things loose in the factory (items land on the floor, like thrown ones). Chance per hit grows as his HP falls: lo at full health, hi near
  // zero. belt = one item riding a belt; stock = one item out of the Stockpile (super rare, it bounces onto the floor from its tile); the chosen belt / pile rattles for warn s first. rumble = the factory's camera shake on ANY hit: lo px for a scratch up to hi when the hit is `full` of his max HP
  shake: { belt: { lo: 0.04, hi: 0.3 }, stock: { lo: 0.002, hi: 0.03 }, warn: 0.7, rumble: { lo: 4, hi: 20, full: 0.3 } },
  pressure: { hit: 0.18, speed: 10, life: 1.4, range: 11, amp: 6 },   // Spell Portal shockwaves: the Wizard losing this share of max HP in one hit (also events, Wardens, the Chimera), front speed (tiles/s), seconds, reach (tiles), most jitter (px)
  // layered soundtrack (audio/music/music_<element>.js, built by tools/musicbuild): one looping layer per element, volume follows
  // G.fac.weather[el]. gain = layer volume at full; fade = seconds a layer takes to swell (time constant); curve < 1 lifts quiet
  // activity so a trickle is still audible; airFloor = Air never drops below this (it is the "song", the others build on it);
  // menu = every layer's level on the title / player screens (all four play). muffleHz / muffleT = the low-pass the music wears on
  // those screens, in the pause menu and while a skill tree is open (cutoff in Hz, seconds to glide there and back)
  music: { fadeIn: 0.5, fadeOut: 1, gain: 0.63, fade: 1.2, curve: 0.5, airFloor: 0.3, menu: 0.8, muffleHz: 2200, muffleT: 0.25 },
  weather: { tau: 30, min: 6, full: 30, ease: 0.035, shrine: 0.5 },   // wilds weather from the factory: packets/min of an element below min = clear, at full = full weather; ease = how fast it turns (per s); a claimed shrine / Portal Storm adds this much of its element
  decalMax: 140,              // spell scorch / crack / frost marks on the ground at once (each spell's dec in CFG.spells)
  bend: { r: 0.45, hold: 0.1, spring: 10, damp: 3.4, amp: 0.6, life: 1.5, bigRad: 0.45, tufts: 24000, shrubs: 1100 },   // grass and flowers lean away from the Wizard and big foes, then spring back; tufts = extra grass tufts sown over the wilds
  wizard: {
    hp: 100, speed: 6.5, accel: 48, friction: 40, radius: 0.3,
    rollTime: 0.45, rollSpeed: 2.3, rollCd: 1.1, armorMax: 100, dodgeCd: 0.3,
    kickT: 0.16,              // a shove (w.kick: the Altar's shockwaves) pushes him over this many seconds
  },
  wandNames: { air: 'Vanishing Puff', water: 'Riding Wave', fire: 'Flame Trail', earth: 'Statue' },
  // THE WAND (js/wand.js): the staff holds four attacks, one per element, charged by the spells the Builder sends. Every delivered spell adds one tick to each element it carries
  // (a Gust ticks Air, a Flamethrower Air + Fire, the Nova all four); a slot is READY when its meter holds `need` ticks, and a full slot holds exactly one attack (ticks for it are
  // lost). Damage is about HALF of the matching basic spell wherever a verb damages (the Book's "most it can deal": Gust 13.2, Seeker Fireball 22.5, Tidal Wave 10, Boulder 96).
  wand: {
    half: 0.5,   // every wand attack that damages is about this fraction of the matching basic spell (the numbers below are worked out from CFG.spells after the overrides: see the end of this file)
    need: { air: 10, water: 9, fire: 8, earth: 7 },   // spells it takes to fill each slot
    // Flame Trail: +speed for t s while he leaves a trail of fire (a segment every gap tiles, each lives life s, r wide). The damage is a BUDGET: an enemy that stands in the trail for
    // a segment's whole life takes `total` once (= half of a Seeker Fireball's 22.5), spread over that life (total / life per second), never stacked by overlapping segments
    fire: { speed: 0.2, t: 3.7, life: 5, gap: 0.4, r: 0.95, total: 13.5, mul: 1.2 },   // (mul: +20% on the half-a-Fireball budget)
    // Vanishing Puff: a burst of air r tiles round him (dmg once, push shove: half of Cyclone Gust's 13.2) and he is unseen for t s (nothing hostile targets him; his own actions end it)
    air: { r: 5, dmg: 6.6, push: 6.5, t: 4.3 },   // (the numbers here are the stock values; dmg / push are worked out from Cyclone Gust)
    // Riding Wave: he rides a wave in a straight line along his aim for dist tiles in t s (a Tidal Wave's speed 10 x life 0.85 = 8.5 tiles). w = its width (a V / U smaller than the
    // spell's 3.4), dmg = half of Tidal Wave's 10, once per foe; foes are parted to the SIDES (push), not carried. Stops dead at a wall or a water edge
    water: { dist: 18.7, t: 1.8, w: 2.2, dmg: 5, push: 8, distMul: 2.2 },   // (the ride eases in and out: slow start, fastest in the middle, slow stop; distMul x a Tidal Wave's reach)
    // Statue: stone for t s: speed x speedMul, damage taken x take; every hit taken charges the ending burst by perHit (of its base), capped at cap (+100%). The burst: dmg (half of a
    // Bouncing Boulder's 96) in r tiles, push shove (grows with the charge too)
    // Heavy boulder handling: top speed x speedMul, but accel / friction are low (he slides on and turns lazily). While it lasts he rams every foe he touches: ram damage and ramPush
    // are per tile/s of his speed (a foe at most once per ramGap s, only above ramMin tiles/s, within ramReach of his body).
    earth: { t: 6, speedMul: 0.5, take: 0.3, perHit: 0.2, cap: 1, r: 3.4, dmg: 48, push: 9, accel: 5, friction: 2.2, ram: 2.6, ramPush: 1.8, ramGap: 0.6, ramMin: 1, ramReach: 0.45 },
  },
  world: {
    respawn: 120, vacuum: 2, minSpawnDist: 8,
    spawnStart: 21, spawnMul: 0.96, spawnFloor: 5.5, cap: 160,   // wild spawns are a trickle: the factory's creatures are the real fight
    wildHp: 0.6, wildDmg: 0.6, wildGem: 0.35, wildElite: 0.2,    // wild foes are weaker, pay less XP and rarely come as elites
    ringMin: 19, ringMax: 26, hpPerMin: 0.12, touchCd: 0.9,
    sepPad: 0.12, sepForce: 4,  // monsters keep (rad + rad + sepPad) apart so packs stay readable
    slowTerrain: 0.55,        // speed multiplier on bog tiles (wizard + monsters); water can't be entered at all
  },
  harvest: {      // node counts are 50% up on the original 60/35/25, then +10% (broken nodes grow back after world.respawn seconds)
    tree: { hp: 20, drop: 'wood', n: 3, count: 99 },
    rock: { hp: 30, drop: 'stone', n: 3, count: 58 },
    ore:  { hp: 40, drop: 'iron', n: 2, count: 41 },
  },
  enemies: {      // gem = [guaranteed XP gems, chance of one more] (1 gem = 1 XP, never fractional). w = spawn weight anywhere; biome foes (w: 0) spawn by terrain
    slime:  { name: 'Slime',        hp: 14, speed: 2.2, dmg: 7, gem: [0, 0.30], w: 50, col: '#6fd36b' },
    shroom: { name: 'Shroom Grump', hp: 22, speed: 1.7, dmg: 9, gem: [0, 0.45], w: 30, col: '#d8403a' },
    sprite: { name: 'Spark Sprite', hp: 10, speed: 3.4, dmg: 6, gem: [0, 0.40], w: 20, col: '#ffd93b' },
    imp:    { name: 'Ember Imp',    hp: 18, speed: 2.6, dmg: 8,  gem: [0, 0.50], w: 0, col: '#ff7a30', weak: 'water', resist: 'fire' },
    lurker: { name: 'Bog Lurker',   hp: 30, speed: 1.5, dmg: 10, gem: [0, 0.60], w: 0, col: '#6a8a3a', weak: 'fire',  resist: 'water' },
    wisp:   { name: 'Gale Wisp',    hp: 14, speed: 3.6, dmg: 7,  gem: [0, 0.55], w: 0, col: '#c8efff', weak: 'earth', resist: 'air' },
    golem:  { name: 'Stone Golem',  hp: 60, speed: 1.2, dmg: 14, gem: [0, 0.65], w: 0, col: '#a9b0b8', weak: 'air',   resist: 'earth' },
    boss:   { name: 'Primal Chimera', hp: 4200, speed: 1.6, dmg: 20, gem: [25, 0], w: 0, col: '#ff4a8a', rad: 1.2 },
  },
  // spell damage vs a foe's weak / resisted element (combo spells count every element they contain)
  weakMul: 2, resistMul: 0.5,
  // pity: after this many elites in a row without the bonus shard, the next one has it
  elite: { hp: 5, speed: 0.85, dmg: 1.5, gems: 3, shardBonus: 0.35, pity: 3, minTime: 90, base: 0.015, perMin: 0.004, perDist: 0.02, max: 0.08 },
  boss: {
    weakMul: 1.6, otherMul: 0.4,            // the Chimera shrugs off everything except its current weakness
    slamEvery: 4.5, slamDelay: 1.0, slamR: 2.4, slamDmg: 24,
    volleyEvery: 6, volleyN: 10, volleyDmg: 10, volleySpeed: 6,
    summonEvery: 11, summonN: 3, shards: 6,
    weakFlash: 1.4,                         // seconds the boss + Spell Portal flash the new weakness
  },
  marks: {        // landmarks in the wilds: the only source of Aether Shards besides elites
    camps: 9, shrines: 8, crypts: 4, spacing: 16,
    campWake: 8, campFoes: 6, campShards: 3,
    shrineR: 2.6, shrineBoost: 0.25,   // an ACTIVATED shrine speeds up that element's harnessers (shrineBoost) for buffT seconds, wherever the Wizard goes; then it recharges for cdT s
    // claiming a shrine: the Builder sends that element's Core (dropped by its creatures) through the Spell Portal while the Wizard is within CFG.unlockR of it; the Core flies down onto the shrine.
    // shrineShards = Aether Shards paid out when it is claimed (unchanged from the mini-game days)
    shrineShards: 1,
    // activating a claimed, ready shrine (the Wizard's Mash button within shrineR): a ring closes toward the target zone, press Mash with the ring inside it; rings good ones in a row
    // activate it. A miss restarts that ring (no other penalty); walking off cancels it, nothing is consumed. ring[i] = seconds one ring takes to close; the zone is the stretch of it
    // (fractions) that counts; netLag = seconds a guest's press is treated as earlier (he sees the ring that much late)
    buffT: 30, cdT: 120, rings: 3, ring: [1.3, 1.15, 1.0], zone: [0.72, 0.88], lead: 0.5, netLag: 0.25,
    cryptHold: 1.5, cryptShards: 5, cryptMinions: 7, xpBonus: 6,
  },
  // forage spots in the wilds: the Wizard stands still at one and mashes the roll button to dig / search it.
  // drop = resources always found, bonus = chance of one more of that kind; a bush gives one pickup (potion or armor)
  forage: {
    mound:  { count: 50, taps: 10, drop: { stone: 2 }, bonus: { iron: 0.35 } },
    sticks: { count: 55, taps: 8,  drop: { wood: 3 },  bonus: { wood: 0.5 } },
    bush:   { count: 40, taps: 4,  potion: 0.6 },   // otherwise Armor Plate
    // buried caches are invisible until the Wizard wears the Kilnsight Mask (they glint through the grass); dug like a mound
    cache:  { count: 28, taps: 10, drop: { iron: 2, stone: 2 }, bonus: { iron: 0.5 }, pickup: 0.5 },   // pickup = chance of an Elixir (else a Heavy Plate) on top
    reach: 2.3, decay: 2.5, respawn: 150, bushRespawn: 240,
  },
  // DEV ONLY: the solo-testing Wizard bot (js/devbot.js, toggled with F4 on the F3 overlay or __wands.bot('wizard')). Distances are tiles.
  devBot: {
    tick: 0.15,                // it decides this often and holds its last input in between
    retreatHp: 0.35,           // below this share of max HP it runs from foes and heads for potions / armor
    bandMin: 4, bandMax: 6,    // the distance it tries to keep from the nearest foe
    engageR: 12,               // foes farther than this are ignored (it forages instead)
    collectEnemyR: 2.5,        // it won't walk toward loot while a foe is this close (unless the loot is nearer)
    rollR: 1.5, rollChance: 0.85,   // a foe this close makes it roll (when the real cooldown allows), most of the time
    seekR: 8,                  // loot (gems, drops, pickups) farther than this is left alone
    forageR: 30, harvestR: 20, // how far it walks to a forage spot / resource node
    harvestDwell: 3,           // seconds it stands by a resource node before moving on
    mashGap: 0.16,             // seconds between roll-button presses while digging a forage spot
    strafeMin: 2, strafeMax: 4, strafeOn: 3, strafeOff: 2,   // strafe direction flips every strafeMin..Max s; moves strafeOn ticks, rests strafeOff
    wanderStep: 14, wanderLeash: 50, wanderCell: 8, wanderOn: 4, wanderOff: 1,   // wander hop length, max distance from spawn, memory cell size, move / rest ticks
    idleMax: 3,                // seconds it may stand still (outside digging) before forcing a wander
    stuckT: 1, stuckMove: 0.35, stuckBack: 1,   // moved less than stuckMove tiles in stuckT s while pushing: sidestep for stuckBack s
    skipT: 60,                 // how long a spot it gave up on is ignored
    steerProbe: 1.6,           // look-ahead for water when steering
  },
  overdrive: 0.15,           // a charged Battery right beside a Forge or Cauldron: +15% crafting speed
  heavyBattery: 0.5,          // a Heavy Battery drains this much slower than a Battery, so it lasts 50% longer
  pickups: {
    potion: { heal: 35 }, elixir: { heal: 80 },
    armor: { armor: 35 }, plate: { armor: 70 },
  },
  // costs were 50% up on the original, then cut ~30% (belts stay 1 Wood; the Splitter is 2 Wood + 1 Stone)
  buildings: {
    harness:  { name: 'Harnesser', kind: 'harness', cost: { wood: 6, stone: 4 }, unlock: null,
                desc: 'Makes element packets: Air, Water, Fire or Earth, whichever crystal it carries. F (LT + X on a pad) switches the element at any time: the old crystal bursts and the new one takes 7.5 seconds to grow, and nothing is made meanwhile. Draws 2 power (hand-gathering is free, so the factory can always restart). Stand beside it and press E to hand-gather.' },
    cauldron: { name: 'Alchemy Cauldron', kind: 'crafter', cost: { wood: 9, stone: 9 }, unlock: null,
                desc: 'Brews Health Potions and Shield Potions from element spells only (no raw resources). No power. Send them through the Spell Portal: they land beside the Wizard.' },
    forge:    { name: 'Elemental Forge', kind: 'crafter', cost: { wood: 20, stone: 15, iron: 6 }, unlock: null,
                desc: 'Fuses element spells into combo spells. Press E at it to switch recipe.' },
    anvil:    { name: 'Armory', kind: 'crafter', cost: { wood: 10, stone: 12, iron: 6 }, unlock: null,
                desc: 'Forges the Wizard\'s garments (augments) and the Warden Key that opens the Stronghold, from the Cores he hunts, plus Iron Ore and Aether Shards: throw them in, E picks the recipe. Send the finished garment through the Spell Portal: it lands in the wilds and he wears it by walking onto it. Each garment is made once; the one he takes off flies home to the Stockpile.' },
    battery:  { name: 'Battery', kind: 'cell', cost: { wood: 8, stone: 6, iron: 4 }, unlock: null,
                desc: 'Gives +10 power to the whole factory while it has charge, and drains while anything needs power. Feed it element spells, Wood or Stone (belt or throw) and it burns them to charge itself (16.5s each, 19.5s when thrown in by hand; more kinds at once = faster). Charged and right beside a Forge or Cauldron, it overdrives it: +15% crafting speed. Throw a combo spell or an Elixir in to overcharge it (extra charge, +5 power for a while).' },
    heavybat: { name: 'Heavy Battery', kind: 'cell', cost: { wood: 20, stone: 15, iron: 12 }, unlock: null,
                desc: 'A Battery with a heavy core: the same power and the same charging, but it drains 33% slower, so a charge lasts 50% longer.' },
    expand:   { name: 'Floor Tile', kind: 'expand', cost: { wood: 1, stone: 1 }, unlock: null,
                desc: 'Place it on the edge of the floor and throw its Wood and Stone at it (from the 29th tile on, 1 Iron too): when it is finished the tile becomes factory floor. A floor tile holds 3 loose items. Demolish an empty tile to take it back.' },
    stockpile: { name: 'Stockpile Tile', kind: 'expand', cost: { wood: 4, stone: 2, iron: 1 }, unlock: null,
                desc: 'Place it on an empty floor tile and throw its Wood, Stone and Iron at it: it becomes a Stockpile tile that holds 50 of ONE kind (resources, Cores, spells, garments). The Wizard can only send home what the Stockpile has room for. Demolish it to turn it back into floor (what it held bounces to the next tile).' },
    splitter: { name: 'Splitter', kind: 'splitter', cost: { wood: 3, stone: 2 }, unlock: null,
                desc: 'Routes what comes in to up to 3 outputs: every side that has something to feed (the side items arrive from is the input). Share them out by %, or give an output element filters (Fire + Earth left, Water + Air right). Click it to set it up.' },
    crate:    { name: 'Storage Crate', kind: 'crate', cost: { wood: 12, stone: 6 }, unlock: null,
                desc: 'Holds any number of ONE kind of element spell or Egg. Belt them in (or throw them) and it feeds them out of its arrow side, one at a time; point it at nothing and it just stores.' },
    spawner:  { name: 'Creature Spawner', kind: 'crafter', cost: { wood: 10, stone: 8, iron: 3, shard: 1 }, unlock: null,
                desc: 'Hatches a creature Egg from ONE thing fed into it: an element spell = that element\'s basic creature; a Flamethrower, Tempest Tear, Magma Bomb, Mud Shield, Meteor Shower, Thunderstorm or Geyser Eruption spell = the pair or triple creature of its elements. Steam Burst, Sandstorm and Blizzard are not seeds: they bounce back. Send the Egg through the Spell Portal and the creature drops in beside the Wizard, to be fought for XP. Costs an Aether Shard to build (the starting one is free).' },
  },
  // the one Harnesser carries any of the four elements (a crystal grows growT seconds after every switch, then shakes shakeT seconds before it starts making packets)
  harness: { growT: 7.5, shakeT: 1.2, order: ['air', 'water', 'fire', 'earth'], air: { cycle: 3.41, power: 2 }, water: { cycle: 5.11, power: 2 }, fire: { cycle: 5.11, power: 2 }, earth: { cycle: 6.25, power: 2 } },
  // hotbar slots: 'hand', 'belt' or a family (members cycle with Q / the wheel over the slot / pad right-trigger)
  families: {
    craft:   { name: 'Crafters',   members: ['cauldron', 'forge', 'anvil'] },
    power:   { name: 'Power',      members: ['battery', 'heavybat'] },
    logi:    { name: 'Logistics',  members: ['splitter', 'crate'] },
    spawn:   { name: 'Creature Spawner', members: ['spawner'] },
    tiles:   { name: 'Tiles',      members: ['expand', 'stockpile'] },
  },
  hotbar: ['hand', 'belt', 'harness', 'craft', 'power', 'logi', 'spawn', 'tiles'],
  hotkeys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'],
  recipes: {
    // machine, inputs (any mix of belt / hand / thrown), output, craft time, power draw, skill-tree node(s) that unlock it
    potion:       { machine: 'cauldron', in: { water: 2, air: 1 },              out: 'potion',  time: 6,  power: 0, use: 'Heals the Wizard 35 HP' },
    elixir:       { machine: 'cauldron', in: { water: 2, earth: 1, air: 1 },    out: 'elixir',  time: 9,  power: 0, use: 'Heals the Wizard 80 HP' },
    armor:        { machine: 'cauldron', in: { earth: 2, fire: 1 },             out: 'armor',   time: 7,  power: 0, use: '+35 armor for the Wizard' },
    plate:        { machine: 'cauldron', in: { earth: 3, fire: 1, water: 1 },   out: 'plate',   time: 11, power: 0, use: '+70 armor for the Wizard' },
    flamethrower: { machine: 'forge', in: { air: 1, fire: 1 },       out: 'flamethrower', time: 8,  power: 5 },
    steam:        { machine: 'forge', in: { fire: 1, water: 1 },     out: 'steam',        time: 8,  power: 5 },
    sandstorm:    { machine: 'forge', in: { air: 1, earth: 1 },      out: 'sandstorm',    time: 8,  power: 5 },
    magma:        { machine: 'forge', in: { fire: 1, earth: 1 },     out: 'magma',        time: 9,  power: 5 },
    tempest:      { machine: 'forge', in: { air: 1, water: 1 },      out: 'tempest',      time: 8,  power: 5 },
    mud:          { machine: 'forge', in: { water: 1, earth: 1 },    out: 'mud',          time: 8,  power: 5 },
    meteor:       { machine: 'forge', in: { air: 1, fire: 1, earth: 1 },   out: 'meteor',   time: 14, power: 6, parents: ['flamethrower', 'magma'] },
    thunder:      { machine: 'forge', in: { air: 1, fire: 1, water: 1 },   out: 'thunder',  time: 14, power: 6, parents: ['flamethrower', 'tempest'] },
    blizzard:     { machine: 'forge', in: { air: 1, water: 1, earth: 1 },  out: 'blizzard', time: 14, power: 6, parents: ['tempest', 'mud'] },
    geyser:       { machine: 'forge', in: { fire: 1, water: 1, earth: 1 }, out: 'geyser',   time: 14, power: 6, parents: ['steam', 'magma'] },
    nova:         { machine: 'forge', in: { air: 1, fire: 1, water: 1, earth: 1 }, out: 'nova', time: 20, power: 8, parents: ['meteor', 'thunder', 'blizzard', 'geyser'] },
  },
  // ===== Skill tree =====
  // Every node costs XP *and* spells. Spells are banked by sending them through the Skill Portal in the factory.
  // Unlocks: { xp, pay: {kind: n} }. Upgrades: { tiers: [xp per tier], kinds: [[kinds paid that tier]], combos: {tierIndex: {spell: n}} }
  // — an upgrade tier asks for about as many element packets as XP, split across that tier's kinds.
  tree: [
    // col 0: Factory unlocks
    { id: 'alchemy',   col: 0, br: 'bld', icon: 'b:cauldron', name: 'Alchemy',         xp: 45, req: [], pay: { air: 10, water: 13 }, desc: 'Unlock the Alchemy Cauldron: Health Potions for the Wizard.' },
    { id: 'forge',     col: 0, br: 'bld', icon: 'b:forge',    name: 'Elemental Forge', xp: 90, req: [], pay: { air: 15, water: 15, fire: 15 }, desc: 'Unlock the Elemental Forge. Each combo spell is then unlocked on its own.' },
    { id: 'armory',    col: 0, br: 'bld', icon: 'b:anvil',    name: 'Armory',          xp: 34, req: [], pay: { air: 9, fire: 15, earth: 10, flamethrower: 2 }, desc: 'Unlock the Armory: it forges the Wizard\'s garments (augments) and the Warden Key that opens the Stronghold, from Cores, Iron and Shards.' },
    { id: 'logistics', col: 0, br: 'bld', icon: 'b:splitter', name: 'Logistics',       xp: 60, req: [], pay: { air: 20, water: 20, fire: 20, tempest: 2 }, desc: 'Unlock the Splitter and the Storage Crate.' },
    { id: 'heavy',     col: 0, br: 'bld', icon: 'battery',    name: 'Heavy Batteries', xp: 120, req: [], pay: { air: 25, water: 25, fire: 30, earth: 30, magma: 2 }, desc: 'Unlock the Heavy Battery: a Battery building that drains 33% slower, so each charge lasts 50% longer.' },
    { id: 'summon',   col: 0, br: 'bld', icon: 'b:altar',    name: 'Summoning',       xp: 150, req: [], pay: { air: 40, water: 40, fire: 40, earth: 40 }, desc: 'The Summoning Altar falls from the sky into the wilds beside the Wizard. Once the Warden is dead, hit it with a Single, a Pair, a Triple and the Nova and the Primal Chimera rises. Costs 6 Aether Shards (send them into the Skill Portal).' },
    // col 2: Upgrades — many small tiers, cheap first, steep last
    { id: 'swift',   col: 2, br: 'bld', icon: 'ic_fast', name: 'Swift Harnessing', per: '+12.5% harnesser speed',
      tiers: [12, 18, 25, 33, 43, 54, 65, 80],
      kinds: [['air'], ['fire', 'earth'], ['air', 'fire'], ['water', 'earth'], ['air', 'earth'], ['water', 'fire'], ['water', 'fire', 'earth'], ['air', 'water', 'fire', 'earth']],
      combos: {} },
    { id: 'manual',  col: 2, br: 'bldr', icon: 'ic_hand', name: 'Quick Hands', per: '+30% hand-harnessing speed',
      tiers: [4, 14, 28],
      kinds: [['air'], ['water', 'fire'], ['air', 'earth']],
      combos: {} },
    { id: 'belts',   col: 2, br: 'bld', icon: 'belt', name: 'Swift Belts', per: '+15% belt speed',
      tiers: [15, 24, 35, 48, 62, 76],
      kinds: [['water'], ['air', 'earth'], ['water', 'fire'], ['air', 'water'], ['fire', 'earth'], ['air', 'water', 'fire', 'earth']],
      combos: {} },
    { id: 'satchel', col: 2, br: 'bldr', icon: 'ic_bag', name: 'Bigger Satchel', per: '+1 carry space',
      tiers: [16, 26, 38, 52, 68],
      kinds: [['earth'], ['air', 'water'], ['fire', 'earth'], ['air', 'fire'], ['air', 'water', 'fire', 'earth']],
      combos: {} },
    { id: 'zoomies', col: 2, br: 'wiz', icon: 'ic_boot', name: 'Wizard Zoomies', per: '+6% Wizard speed',
      tiers: [12, 18, 26, 36, 48, 60],
      kinds: [['air'], ['water', 'earth'], ['air', 'fire'], ['fire', 'earth'], ['air', 'water'], ['water', 'fire', 'earth']],
      combos: {} },
    { id: 'hearty',  col: 2, br: 'wiz', icon: 'ic_heart', name: 'Hearty Hat', per: '+12 max HP (and heal 12)',
      tiers: [12, 17, 23, 30, 38, 47, 60, 73],
      kinds: [['air'], ['water', 'fire'], ['air', 'earth'], ['water', 'earth'], ['air', 'fire'], ['water', 'fire', 'earth'], ['air', 'water', 'earth'], ['air', 'water', 'fire', 'earth']],
      combos: {} },
    { id: 'gems',    col: 2, br: 'wiz', icon: 'ic_xp', name: 'Gem Wisdom', per: 'x1.125 on every XP gem drop chance',
      tiers: [14, 20, 27, 35, 44, 54, 62, 74],
      kinds: [['fire'], ['air', 'water'], ['fire', 'earth'], ['water', 'earth'], ['air', 'water'], ['air', 'earth'], ['air', 'water', 'fire'], ['air', 'water', 'fire', 'earth']],
      combos: {} },
  ],
  // every number a delivered spell uses (WZ.cast; the skill-tree hover card reads them too).
  // dmg per hit, r radius (tiles), speed (tiles/s), life (s), splash + sr = splash damage + radius,
  // n = projectiles / targets / blasts, slow = speed taken away (0..1) for slowT seconds, t = zone time, dps in zones
  // drop = seconds of the spell's own drop-in over the Wizard before it casts (the telegraph: he sees it coming)
  // dec = the mark it leaves on the ground: k kind, r x the blast radius, t seconds, a strength
  // terrain spells: Mud raises an Earth Wall (len tiles, dist tiles toward the target, t s), the Blizzard freezes bog and water into ice
  // (t s, re-freezing every s while it rages), the Geyser launches the Wizard (up to dist tiles, at least min, T s in the air, h tiles high)
  // trail = the smaller mark a moving spell leaves behind it every trailGap s (same fields as dec)
  spells: {
    // Cyclone Gust: three spinning pulses grow out of him (r x 1/3, 2/3, 1, gap s apart); foes thrown into each other bonk for bonk dmg
    gust:         { drop: 0.45, r: 6, dmg: 1.4, push: 6.5, pulses: 3, gap: 0.12, bonk: 9, dec: { k: 'swirl', r: 0.5, t: 3.2, a: 0.45 } },
    // Seeker Fireball: twice as fast as the old one, half the damage, and it homes: turns up to turn rad/s toward the nearest foe within seek tiles
    fireball:     { drop: 0.55, speed: 25.6, life: 1.1, dmg: 15, splash: 7.5, sr: 1.3, turn: 18, seek: 14, behind: -0.94, nearBias: 0.04, dec: { k: 'burn', r: 0.6, t: 3, a: 0.55 }, trail: { k: 'ember', r: 0.25, t: 1.4, a: 0.6 }, trailGap: 0.05 },
    // Tidal Wave: a crescent of water w tiles wide rolls out; it carries every foe it catches (push), slows them and heals the Wizard a little
    spray:        { drop: 0.5, speed: 10, life: 0.85, w: 3.4, dmg: 10, push: 10, slow: 0.45, slowT: 2.2, heal: 3, dec: { k: 'wet', r: 0.5, t: 3, a: 0.4 }, trail: { k: 'wet', r: 0.6, t: 2.6, a: 0.35 }, trailGap: 0.08 },
    // Bouncing Boulder: hops hops times along the aim (hop s per hop, a little shorter each time), crushing everything around each landing
    boulder:      { drop: 0.6, speed: 7.5, hops: 4, hop: 0.42, dmg: 24, sr: 1.6, push: 7, dec: { k: 'crack', r: 0.8, t: 4.5, a: 0.8 } },
    // Flamethrower: a stream of fire blown out in front of him for t s (it follows his aim): dps to everything in a cone range tiles long, half rad wide
    flamethrower: { drop: 0.5, t: 2.2, range: 5.5, half: 0.42, dps: 30, dec: { k: 'scorch', r: 0.45, t: 3.2, a: 0.5 }, trailGap: 0.09 },
    // Gale Boomerang (Air + Earth; the recipe id stays 'sandstorm'): a heavy stone-edged boomerang thrown along the aim. It curves out (reach tiles ahead, curve tiles to the side, out s),
    // then comes back (back s) to where he STANDS (it follows him until the last (1 - lock) of the return, then the catch spot is fixed). It pierces: every foe / node it crosses takes dmg
    // (+ a push shove) once per leg. If he is within catchR of the catch spot when it lands he catches it and it flies again as a smaller, one-way boomerang (second: scale of size,
    // dmg x, reach tiles straight along his aim at speed tiles/s); otherwise it fizzles
    sandstorm:    { drop: 0.65, reach: 6.4, curve: 2.8, out: 0.95, back: 1.05, lock: 0.78, r: 0.9, dmg: 28, push: 5, catchR: 1.2, second: { scale: 0.6, dmg: 0.6, reach: 5.5, speed: 12 }, dec: { k: 'swirl', c: '#d9b46a', r: 0.5, t: 2.5, a: 0.4 } },
    // Magma Bomb: lobbed high onto the thickest crowd within range (flight s), a big blast, a lava pool, and blobs of magma that splatter out and burst
    magma:        { drop: 0.7, flight: 0.75, range: 12, dmg: 48, sr: 2.8, pool: { r: 2.3, t: 4, dps: 12 }, blobs: 5, blobDmg: 14, blobR: 1.2, blobDist: [2, 3.6], dec: { k: 'lava', r: 0.9, t: 6, a: 1 } },
    // Steam Mine (Fire + Water; the recipe id stays 'steam'): lobbed throw tiles along the aim (flight s, h high), it sits dormant for up to life s. A foe within wake tiles wakes it
    // (wakeT s of fast pulsing, a hop of hopH), then it flies at that foe (speed tiles/s, gives up after fly s) and bursts within hit tiles of it: dmg in r tiles (+ push), then a
    // steam cloud (cloud.r, cloud.t s) that slows foes in it by cloud.slow. At most max mines live; a newer one replaces the oldest
    steam:        { drop: 0.6, throw: 4, flight: 0.45, h: 1.8, life: 45, wake: 2.5, wakeT: 0.35, hopH: 1.4, speed: 15, fly: 1.2, hit: 0.7, r: 2, dmg: 44, push: 9, max: 5, cloud: { r: 2.4, t: 3, slow: 0.5 }, dec: { k: 'wet', r: 0.8, t: 4, a: 0.6 } },
    // Tempest Tear (Air + Water; the recipe id stays 'tempest'): a controllable water droplet for life s (every delivery has its own clock). It flies at speedMul x his speed toward a point
    // reach tiles out along his aim (right stick, else the way he faces; the stick's tilt shortens it, never under minReach), hurting (dps) and slowing all it passes through. Live droplets
    // fan out spread degrees apart, the oldest on the left
    tempest:      { drop: 0.5, life: 5, reach: 6, minReach: 1.5, speedMul: 3.5, speedMin: 3, speedMax: 4, gapPref: 0.1, gapMin: 0.05, manyTears: 10, spread: 10, r: 0.95, dps: 30, slow: 0.45, slowT: 0.9, dec: { k: 'wet', r: 0.5, t: 2.5, a: 0.35 }, trailGap: 0.12 },
    // Mud Shield: orbs blue / brown orbs circle him (orbitR tiles out, spin rad/s) for t s; the first foe an orb touches (orbR) sets it off: a blast of sr tiles, dmg, a shove and a slow
    mud:          { drop: 0.6, t: 12, orbs: 3, orbitR: 1.7, spin: 3.4, orbR: 0.6, sr: 2.5, dmg: 42, push: 13, slow: 0.7, slowT: 2.2, dec: { k: 'mud', r: 1, t: 4.5, a: 0.7 } },
    // Meteor Strike: ONE huge meteor on the thickest crowd within range (fall s, its shadow grows), then it shatters into frags burning, bouncing boulders that fly out at fragSpeed tiles/s,
    // hop fragHops times (fragHop s each) and crush fragR tiles round every landing for fragDmg. They hunt: they steer toward the nearest foe within fragSeek tiles at up to fragTurn rad/s
    // (a lazy turn: boulders, not missiles) and pick a new foe when theirs dies
    meteor:       { drop: 0.8, range: 16, fall: 1.0, r: 3.4, dmg: 85, push: 14, frags: 6, fragR: 1.4, fragDmg: 22, fragSpeed: 6.5, fragHops: 4, fragHop: 0.36, fragSeek: 10, fragTurn: 2.6, dec: { k: 'crater', r: 0.9, t: 6, a: 1 } },
    // Thunderstorm: a storm cloud hangs over him for t s and calls a bolt every every s on a foe within range (warn s ahead), each bolt forking to chain more
    thunder:      { drop: 0.6, t: 4, every: 0.32, range: 9, warn: 0.22, r: 1.3, dmg: 24, chain: 2, chainR: 4.5, chainDmg: 12, dec: { k: 'glass', r: 0.85, t: 4, a: 0.8 } },
    // Blizzard: a storm round him for t s (dps, slow) raining icicles every icicle s; a foe hit chill times freezes solid for freeze s. Flash Frost turns bog / water to ice
    blizzard:     { drop: 0.7, r: 7, t: 4, dps: 6, slow: 0.6, icicle: 0.09, iceDmg: 12, iceR: 1.1, chill: 3, freeze: 1.6, dec: { k: 'frost', r: 0.8, t: 5, a: 0.85 }, frost: { t: 14, every: 0.1 } },
    // Geyser Eruption: waves of eruptions: wave 1 under the n nearest foes, each later wave (waveGap s on) under n random ones within range. Each throws its foes up for toss s
    // (land dmg coming down), then slows them slow for slowT s. The Wizard stays on the ground
    geyser:       { drop: 0.55, n: 6, waves: 2, waveGap: 1.2, range: 16, delay: 0.45, gap: 0.1, r: 1.8, dmg: 26, toss: 0.85, land: 20, slow: 0.6, slowT: 5, dec: { k: 'wet', r: 0.9, t: 4.5, a: 0.85 } },
    // Elemental Nova: for pullT s every foe within pullR is hauled in (pull) while every foe within r is zapped (zapDmg every zapEvery s, up to zapN bolts drawn); then magma balls,
    // water drops, air wisps and rock chunks (bits of each) burst out of him to r: dmg, a big shove (push), slow, stagger; each bit also hits for bitDmg as it flies
    nova:         { drop: 0.9, r: 8, pullR: 12, pullT: 1.4, pull: 14, zapEvery: 0.16, zapDmg: 6, zapN: 9, dmg: 50, push: 30, slow: 0.5, slowT: 2.4, stagger: 0.7, bits: 5, bitSpeed: 18, bitDmg: 8, dec: { k: 'nova', r: 0.7, t: 6, a: 1 } },
  },
  // what each upgrade tier is worth
  upgrade: { swift: 0.125, manual: 0.3, belts: 0.15, satchel: 1, zoomies: 0.06, hearty: 12, gems: 0.125, magnet: 0.35,   // gems: x(1+0.125) per tier on every gem drop chance (cap gemCap); magnet: tiles of extra pickup radius per tier
    crafting: 0.06,    // Swift Crafting: every crafter's cycle takes this much less per tier (Forge, Cauldron, Armory, Spawner growth)
    remedies: 0.12,    // Health Potions and Elixirs heal this much more per tier
    wardwoven: 0.10,   // Shield Potions grant this much more armor per tier
    slippery: 0.07,    // the Wizard's roll cooldown is this much shorter per tier
    mighty: 0.08,      // the four basic spells: damage, knockback and (through the damage) harvest strength, per tier
    harvest: 0.20,     // every spell: this much more damage to trees, rocks and ore, per tier
    forager: 0.12,     // foraging is this much faster per tier, and every dug spot has this chance (per tier) of a double yield
    longarm: 0.10,     // the Builder's throw distance, per tier
    tumble: 0.10,      // tier 1 gives the Builder a roll; each later tier shortens its cooldown by this much
    hustle: 0.07,      // the Builder's move speed, per tier
    rapid: 0.08,       // the Builder's throw cooldown (and the gap between a stack's throws), shorter per tier
  },
  firstTierPay: 0.5,          // tier 1 of every upgrade track asks for half the usual spells
  costScale: { xp: 0.7, pay: 0.5, unlock: 0.9 },   // the skill-tree rebalance: XP costs x0.7, banked spell costs x0.5 (applied once below, after the dev-tool overrides); unlock: the Factory unlock nodes are a further 10% cheaper now that spells and creatures left the tree
  gemCap: 0.95,               // no gem chance ever goes above this, whatever Gem Wisdom says
  bigGem: { r: 0.7, tiers: [1, 3, 8, 20] },   // resting gems within r tiles merge into one Big Gem; the sprite grows at these totals
  // ---- Creature production: Eggs are crafted at a Creature Spawner and sent through the Spell Portal ----
  // order = the elements as listed: the creature is weak to what the FIRST one is weak to (Fire<Water<Earth<Air<Fire) and resists the LAST
  // gem = [guaranteed XP gems, chance of one more]; fly = floats over everything; ai = behaviour in creatures.js
  creatures: {
    zephyr:      { name: 'Zephyr Wisp',     tier: 1, order: ['air'],                  hp: 8,   speed: 3.1, dmg: 4,  rad: 0.30, gem: [0, 0.25], fly: true, ai: 'wisp',   col: '#d6f4ff', n: 3, cost: { air: 1 },                       time: 10, power: 1, dash: { every: 2.6, time: 0.28, mul: 3.6 } },
    puddle:      { name: 'Puddle Slime',    tier: 1, order: ['water'],                hp: 18,  speed: 1.5, dmg: 6,  rad: 0.36, gem: [0, 0.40], ai: 'slime',  col: '#4aa8ff', n: 2, cost: { water: 1 },                     time: 12, power: 1, splash: { r: 2.1, t: 4, slow: 0.45 } },
    cinder:      { name: 'Cinder Imp',      tier: 1, order: ['fire'],                 hp: 14,  speed: 2.2, dmg: 5,  rad: 0.32, gem: [0, 0.50], ai: 'imp',    col: '#ff7a30', n: 2, cost: { fire: 1 },                      time: 14, power: 1, shot: { every: 2.1, dmg: 6, speed: 7, near: 4.2, far: 7.2 } },
    pebble:      { name: 'Pebble Golem',    tier: 1, order: ['earth'],                hp: 42,  speed: 1.1, dmg: 9,  rad: 0.42, gem: [0, 0.65], ai: 'golem',  col: '#b58a4c', n: 1, cost: { earth: 1 },                     time: 16, power: 1, dr: 0.55, kb: 0.1 },
    phoenix:     { name: 'Cinder Phoenix',  tier: 2, order: ['fire', 'air'],          hp: 30,  speed: 2.8, dmg: 9,  rad: 0.40, gem: [1, 0.25], fly: true, ai: 'phoenix', col: '#ff9a3a', n: 2, cost: { flamethrower: 1 },          time: 22, power: 4, dive: { every: 4.2, wind: 0.55, time: 0.6, mul: 4, dmg: 14 }, reborn: 0.3 },
    thunderhead: { name: 'Thunderhead',     tier: 2, order: ['air', 'water'],         hp: 34,  speed: 1.0, dmg: 6,  rad: 0.45, gem: [1, 0.25], fly: true, ai: 'storm',  col: '#9aa8d8', n: 2, cost: { tempest: 1 },             time: 22, power: 4, zap: { every: 4.5, n: 3, delay: 0.9, r: 1.3, dmg: 12 } },
    lavagolem:   { name: 'Lava Golem',      tier: 2, order: ['fire', 'earth'],        hp: 90,  speed: 0.8, dmg: 14, rad: 0.55, gem: [1, 0.25], ai: 'lava',   col: '#ff5a2a', n: 1, cost: { magma: 1 },            time: 26, power: 4, trail: { every: 0.7, r: 1.0, t: 3, dps: 9 }, blast: { r: 3.2, delay: 0.9, dmg: 24 } },
    shambler:    { name: 'Swamp Shambler',  tier: 2, order: ['earth', 'water'],       hp: 70,  speed: 1.1, dmg: 11, rad: 0.50, gem: [1, 0.25], ai: 'shambler', col: '#6a8a4a', n: 1, cost: { mud: 1 },         time: 26, power: 4, snare: { every: 3.4, r: 1.7, t: 5, slow: 0.5 }, regen: 0.04 },
    dragon:      { name: 'Ember Dragon',    tier: 3, order: ['fire', 'air', 'earth'], hp: 220, speed: 1.6, dmg: 18, rad: 0.70, gem: [2, 0.50], ai: 'dragon', col: '#e0482a', n: 1, cost: { meteor: 1 },    time: 40, power: 6, breath: { every: 5.5, delay: 0.8, range: 6.5, half: 0.6, n: 9, dmg: 8, speed: 11 }, gust: { every: 8, r: 3.6, push: 10, dmg: 8 } },
    leviathan:   { name: 'Storm Leviathan', tier: 3, order: ['water', 'fire', 'air'], hp: 130, speed: 3.0, dmg: 12, rad: 0.55, gem: [2, 0.50], fly: true, ai: 'serpent', col: '#6ad0e8', n: 1, cost: { thunder: 1 }, time: 36, power: 6, zap: { every: 4, n: 4, delay: 0.8, r: 1.3, dmg: 12 }, dive: { every: 6, wind: 0.6, time: 0.7, mul: 3.4, dmg: 12, burst: { r: 2.4, dmg: 12, slow: 0.45, slowT: 2 } } },
    titan:       { name: 'Kiln Titan',      tier: 3, order: ['fire', 'water', 'earth'], hp: 280, speed: 0.9, dmg: 20, rad: 0.75, gem: [2, 0.50], ai: 'titan', col: '#c8704a', n: 1, cost: { geyser: 1 },  time: 42, power: 6, cracks: [0.75, 0.5, 0.25], dr: [0.35, 0.5, 0.7, 0.9], vent: { r: 3, delay: 1.0, dmg: 18 } },
  },
  crafted: {
    cap: 25,                  // crafted creatures alive at once (inside world.cap); extra Eggs wait in the portal queue
    queue: 12,                // Eggs the Spell Portal holds back while the cap is full (more than that and it stops taking Eggs)
    dropGap: 0.7,             // seconds between any two creatures dropping in (even from the same Egg)
    daze: 0.6, fall: 0.55,    // seconds dazed after landing / seconds of the drop-in
    spawnMin: 6, spawnMax: 11,   // tiles from the Wizard, always inside the camera
    jitter: 0.15,             // hp / speed / damage each rolled within +-15%
    size: 0.15,               // body size +-15% (basics also get a palette variant)
    variants: 3,
    eliteChance: 0.05, eliteHp: 3, eliteDmg: 1.5, eliteShards: true,   // elites keep the usual elite rewards (3 gems + shard rules)
    mutChance: 0.08,
    recycle: 0.3,             // chance a crafted BASIC creature drops one packet of its element on death
    recycleSpell: { 2: 0.25, 3: 0.2 },   // chance a crafted double / triple drops the combo spell it was hatched from (it flies home to the Stockpile like a packet)
  },
  // ---- Allies: Element Cores thrown at a Creature Spawner grow FRIENDLY versions of the same 11 creatures ----
  // double HP, half damage (on every attack and ability), never elite, never mutated. They hatch 2-4 tiles from the Wizard and fight what comes within engage tiles of him
  // (drifting back toward him outside that, and past leash tiles of him they ignore foes); every hostile goes for an ally within aggro tiles before the Wizard.
  // At most cap alive; queue = eggs the Spell Portal holds back behind them (then it boings the next one back). Their deaths pay nothing.
  // window: every absorbed Core leaves at least this many seconds of growth to go (it extends the timer), so a quick Builder can always feed it up to a triple
  ally: {
    cap: 10, queue: 3, hpMul: 4, dmgMul: 0.5,
    aggro: 9, engage: 10, leash: 16, follow: 3.2, teleport: 30,
    spawnMin: 2, spawnMax: 4,
    window: 12,
  },
  // at most one per creature; ic is the icon popped on both halves at spawn
  mutations: {
    swift:    { name: 'Swift',        ic: 'ic_fast',   spd: 1.45 },
    armored:  { name: 'Armored',      ic: 'ic_shield', dr: 0.6 },
    volatile: { name: 'Volatile',     ic: 'ic_bomb',   r: 2.2, dmg: 14, delay: 0.8 },
    splitter: { name: 'Splitter',     ic: 'ic_expand', n: 2, hp: 0.35 },
    regen:    { name: 'Regenerating', ic: 'ic_heart',  rate: 0.03 },
  },
  // ---- Scheduled events: one every gapMin..gapMax seconds of play time, a fixed rotation of 6, then Cycle 2, 3, ... ----
  events: {
    gapMin: 600, gapMax: 900,
    warn: [300, 120, 30],     // toasts on both halves this many seconds out (the card shows from the first)
    defer: 60,                // after a blocker (the Chimera) clears, wait this long before an event may start
    scale: 0.25,              // per cycle past the first: event foes' hp and damage x(1 + scale*(cycle-1))
    eliteAdd: 0.03, mutAdd: 0.04, waveAdd: 0.25,   // per cycle: elite chance, mutation chance, wave size (fraction)
    reward: { gems: 12, perCycle: 4 },   // XP gems showered on the Wizard when an event is cleared (+1 shard from cycle 2)
    rotation: ['migration', 'stampede', 'hunt', 'bloom', 'storm', 'brood'],
    migration: { name: 'Migration',        waves: 6, gap: 9,  n: 6, speed: 1.1 },
    stampede:  { name: 'Stampede',         bursts: 5, gap: 8, n: 7, speed: 1.55, safe: 14 },
    hunt:      { name: 'Elite Hunt',       elites: [2, 3], escorts: 4 },
    bloom:     { name: 'Mutation Bloom',   dur: 150, mut: 0.5 },
    storm:     { name: 'Portal Storm',     dur: 90, gap: 9, n: 6, boost: 0.25, surge: 1.25 },
    brood:     { name: "Chimera's Brood",  size: 1.9, hp: 9, dmg: 1.6, slamEvery: 4.5, slamR: 2.4, slamDmg: 20, minions: 3 },
  },
  // ---- the Stronghold: one far-off keep (its element is picked by the world seed), guarded by crafted creatures and THE Warden. The Warden must fall
  // before the Summoning Altar takes spells ----
  strong: {
    minDist: 70, reveal: 30, wake: 9, warnT: 10, shards: 8, gems: 12,   // warnT: seconds the Wizard must stand inside the wake radius before the guards and the Warden spawn (leaving resets it)
    arenaR: 6.5,              // the door: the arena inside this radius only opens to a Wizard who has had the Warden Key sent in through the portal (the key is shown at the door)
    // the approach terrain around each keep (tiles from its centre), world-gen carves it: water = a lake moat (an island keep), fire = a scorched field,
    // earth = a ring of cracked rock, air = a chasm ring with a broken bridge. Each needs the augment of the element this keep's element is weak to
    gate: {
      water: { kind: 'moat',   r0: 8.5, r1: 17 },
      fire:  { kind: 'scorch', r0: 8,   r1: 19 },
      earth: { kind: 'rocks',  r0: 9,   r1: 11.5 },
      air:   { kind: 'chasm',  r0: 9,   r1: 12.5 },
    },
    guards: {   // creature types per element (crafted-creature types of that element, plus the Warden)
      air:   { zephyr: 4, thunderhead: 2 },
      water: { puddle: 4, shambler: 2 },
      fire:  { cinder: 4, phoenix: 1, lavagolem: 1 },
      earth: { pebble: 4, lavagolem: 1, shambler: 1 },
    },
    warden: { name: 'Warden', hp: 700, speed: 1.5, dmg: 18, rad: 0.85, slamEvery: 5, slamR: 2.2, slamDmg: 20, volleyEvery: 6.5, volleyN: 8, volleyDmg: 9 },
  },
  // ---- Cores: the components of the Wizard's garments, and the keys to shrines and keeps. A kill by a creature of an element can drop that element's Core
  // (a rare chance for normals, more for pairs and triples, a guaranteed chunk [min, max] from elites); Cores fly home to the Stockpile like shards.
  cores: { wild: 0.022, basic: 0.033, pair: 0.055, triple: 0.085, elite: [1, 1], warden: 2, boss: 4 },   // chances per normal kill / elite chunk / Warden (of each element) / Chimera (of each)
  keyCost: { cores: 3, iron: 3, shard: 3, time: 24 },   // the Warden Key at the Armory: this many Cores of EACH element, Iron Ore and Aether Shards
  altar: {   // the Summoning Altar (js/altar.js): bought in the tree, it falls out of the sky beside the Wizard and stands in the wilds from then on
    shards: 6,                  // Aether Shards the Summoning node costs (sent into the Skill Portal)
    r: 1.7, solid: 1.1,         // its body: spells that reach this far hit it; the Wizard cannot walk closer than this (+ his own radius)
    spotMin: 5, spotMax: 8.5,   // tiles from the Wizard where it lands (on screen, dry, clear of landmarks and trees)
    clear: 9,                   // landmarks keep this far from it
    form: 3.8, hang: 1.2, fall: 0.8, height: 4.8,   // the cinematic: seconds the particles gather, hang whole in the air, fall; tiles up it hangs
    waves: [0, 0.55, 1.15], quake: 3.2,   // shockwave ring times after the impact; seconds the world shakes
    ring: 16, speed: 11, push: 7, daze: 0.8,   // how far a shockwave runs (tiles), how fast it runs (tiles/s), the shove foes get and how long they stagger
    wakeR: 9, ritual: 3.2,      // the Wizard must stand this close for the Chimera to rise; seconds the Altar gathers its power before it steps out
    sockets: ['Single', 'Pair', 'Triple', 'Nova'],   // one per spell tier (elements in the spell)
    cols: ['#e6f8ff', '#7be0ff', '#ffd23a', '#ff6ae0'],   // each socket's colour
    keys: ['air', 'steam', 'meteor', 'nova'],   // each socket's icon (an item sprite)
  },
  bshr: {   // Battery Shrines (js/bshrine.js): each finished Battery has a numbered shrine in the wilds; damage to it is charge for that Battery
    perDmg: 1.2,                // charge (of batteryMax 90) per point of damage a spell or wand attack does to it (a Seeker Fireball, 22 damage, is about a third of a Battery)
    r: 0.9,                     // its body: spells that reach this far hit it (it is not solid)
    spotMin: 4, spotMax: 8,     // tiles from the Wizard where a new one appears (on screen, dry, clear of landmarks, trees and other shrines)
    gap: 5, clear: 6,           // shrines keep this far from each other; landmarks keep this far from them
    ring: 14, speed: 11,        // the shockwave a new shrine sends out: how far it runs (tiles) and how fast (tiles/s)
    popGap: 0.35,               // seconds between the charge tallies that float up while it is being hit
    col: '#ffe36b',             // its colour
  },
  unlockR: 9,                 // a Core or Ward Key the Builder sends only goes through the portal when the Wizard is within this many tiles of the shrine / keep it opens
  // ---- Wizard augments (js/augments.js; the table of augments is AUGS below): garments the Builder forges at the Armory. They change what he can DO, never his numbers ----
  aug: {
    phoenix: { cd: 900, hp: 0.5 },   // Phoenix Feather: seconds to recharge after it saves him (15 minutes of play), the share of max HP he comes back with
    blink: { dist: 5.5, min: 2, T: 0.16 },   // Gale Circlet: how far the roll jumps (tiles), the shortest jump it will make, seconds it takes
    stat: { r: 2.8, push: 12, cd: 0.9 },   // Static Cloak: radius of the burst, knockback, seconds between bursts
    scorch: { dps: 45, ramp: 1.2, slow: 0.6 },   // scorched ground hurts and slows anyone who is not wearing the Emberward Cloak; the burn grows by ramp x its base every second he stays on it, so the keep's field is lethal to cross without the Cloak
    boulder: { r: 0.7, push: 9, friction: 3.2 },   // loose boulders: body radius, how hard a Gust shoves one, how fast it slows down
    mask: { glintR: 16, hintR: 60 },   // Kilnsight Mask: how far buried caches glint, how far landmark hints reach
    glow: { dur: 3.2 },   // seconds of the one-time glow-up when the first Warden falls
    // free-standing hazards sown over the wilds (their own RNG), so the verbs have uses beyond the Strongholds: counts
    fields: { scorch: 5, chasm: 5, rocks: 8, vines: 12, boulders: 36 },
  },
};
// the dev tool's Variables tab (overrides/tuning.js) lands here, before anything below derives from CFG
if (window.OV) OV.tune(CFG, window.TUNING);
// The wand's numbers are HALF of the matching basic spell's (CFG.wand.half), read here AFTER the dev-tool overrides so a Gust (or Fireball, Tidal Wave, Boulder) you tuned keeps its
// wand attack in step. A wand number tuned on purpose in the Variables tab (it is in window.TUNING) wins. Gust's total counts its pulses and the bonk, like the Book's "most it can deal".
(function () {
  const W = CFG.wand, S = CFG.spells, h = W.half, T = window.TUNING || {}, r2 = v => Math.round(v * 100) / 100;
  const set = (path, o, k, v) => { if (T[path] === undefined) o[k] = r2(v); };
  set('wand.air.dmg', W.air, 'dmg', h * (S.gust.pulses * S.gust.dmg + S.gust.bonk));
  set('wand.air.push', W.air, 'push', h * S.gust.pulses * S.gust.push);   // half of the shove its three pulses give
  set('wand.fire.total', W.fire, 'total', W.fire.mul * h * (S.fireball.dmg + S.fireball.splash));
  set('wand.water.dmg', W.water, 'dmg', h * S.spray.dmg);
  set('wand.water.dist', W.water, 'dist', W.water.distMul * S.spray.speed * S.spray.life);   // as far as a Tidal Wave flies
  set('wand.earth.dmg', W.earth, 'dmg', h * S.boulder.hops * S.boulder.dmg);
})();

// ----- skill-tree rebalance: the literal above is the pre-rebalance price list; XP x0.7, banked spells x0.5, rounded, never below 1 -----
(function () {
  const S = CFG.costScale, sx = v => Math.max(1, Math.round(v * S.xp)), sp = v => (v >= 1 ? Math.max(1, Math.round(v * S.pay)) : 0);
  for (const n of CFG.tree) {
    if (n.tiers) {
      n.pk = n.tiers.map(v => v * S.pay);   // the packets of a tier are worked out from this (the old XP basis, halved)
      n.tiers = n.tiers.map(sx);
      for (const i in n.combos || {}) for (const k in n.combos[i]) n.combos[i][k] = sp(n.combos[i][k]);
    } else {
      n.xp = sx(n.xp * S.unlock);
      for (const k in n.pay) n.pay[k] = sp(n.pay[k] * S.unlock);
    }
  }
  CFG.tree.find(n => n.id === 'summon').pay.shard = CFG.altar.shards;   // the Altar's Aether Shards are not scaled
})();

// Fire is weak to Water, Water to Earth, Earth to Air, Air to Fire
const WEAK_TO = { fire: 'water', water: 'earth', earth: 'air', air: 'fire' };
// crafted creatures become enemy defs + Spawner recipes (priced straight in the rebalanced scale: they are new, not scaled)
(function () {
  for (const id in CFG.creatures) {
    const c = CFG.creatures[id];
    c.weak = WEAK_TO[c.order[0]]; c.resist = c.order[c.order.length - 1];
    if (c.weak === c.resist) console.warn('creature ' + id + ' resists what it is weak to');
    CFG.enemies[id] = { name: c.name, hp: c.hp, speed: c.speed, dmg: c.dmg, gem: c.gem, w: 0, col: c.col, weak: c.weak, resist: c.resist, rad: c.rad, crafted: true, creature: id };
    CFG.recipes['egg_' + id] = { machine: 'spawner', in: c.cost, out: 'egg_' + id, time: c.time, power: c.power,
      use: 'Hatches a ' + c.name + ' beside the Wizard' };
    // the friendly version: one Core of each of its elements (a Gale Core is Air, Tide Water, Ember Fire, Stone Earth); a triple needs the same parent pairs MADE as the hostile seed spell
    const seed = Object.keys(c.cost)[0], par = c.order.length > 1 && CFG.recipes[seed] ? CFG.recipes[seed].parents : null, cin = {};
    c.order.forEach(el => { cin['core_' + el] = 1; });
    CFG.recipes['aegg_' + id] = { machine: 'spawner', in: cin, out: 'aegg_' + id, time: c.time, power: c.power, ally: true, use: 'Hatches a FRIENDLY ' + c.name + ' beside the Wizard' };
    if (par) CFG.recipes['aegg_' + id].parents = par;
  }
  const NOTE = {
    zephyr: 'Drifts erratically and phase-dashes through you.', puddle: 'Slow. Bursts into a slowing splash zone when it dies.', cinder: 'Keeps its distance and spits ember bolts.',
    pebble: 'Armored: x0.55 damage from anything but its weakness, and it cannot be knocked back.', phoenix: 'Flashes, then swoops in a dive. Reborn once at 30% HP.',
    thunderhead: 'Hovers and fires telegraphed chain zaps.', lavagolem: 'Slow. Leaves magma trails and blasts when it dies (telegraphed).',
    shambler: 'Lays mud-snare zones across your path. Regenerates in bog and at the shore.', dragon: 'A telegraphed flame-breath fan; wing gusts knock you back.',
    leviathan: 'A fast flyer: chain zaps and steam-burst dives.', titan: 'Its armor cracks at 75 / 50 / 25% HP, and every crack vents a telegraphed steam burst.',
  };
  for (const id in NOTE) CFG.creatures[id].note = NOTE[id];
  const W = CFG.strong.warden;
  CFG.enemies.warden = { name: W.name, hp: W.hp, speed: W.speed, dmg: W.dmg, gem: [3, 0], w: 0, col: '#ffd23a', rad: W.rad };
  // the Loot Magnet track (spells and creatures are not in the tree: the Collection Book lists them and production gates them)
  CFG.tree.push({ id: 'magnet', col: 2, br: 'wiz', icon: 'ic_magnet', name: 'Loot Magnet', per: '+0.35 tiles of pickup range',
    tiers: [8, 12, 18, 25, 34], pk: [6, 9, 13, 18, 24],
    kinds: [['water'], ['air', 'earth'], ['water', 'fire'], ['air', 'fire', 'earth'], ['air', 'water', 'fire', 'earth']], combos: {} });
// the new tracks are priced straight in the rebalanced scale (they are not scaled again); xpFirst = tier 1 costs XP only; fullFirst = tier 1 pays full packets (no half-price first tier)
  CFG.tree.push({ id: 'crafting', col: 2, br: 'bld', icon: 'b:forge', name: 'Swift Crafting', per: '-6% craft time: Forge, Cauldron, Armory, Spawner growth',
    tiers: [10,16,23,31,40,50], pk: [7.5,12,17.5,24,31,39],
    kinds: [['fire'], ['water', 'earth'], ['air', 'fire'], ['air', 'water'], ['air', 'earth'], ['air', 'water', 'fire', 'earth']], combos: {} });
  CFG.tree.push({ id: 'remedies', col: 2, br: 'wiz', icon: 'potion', name: 'Remedies', per: '+12% healing from Potions and Elixirs',
    tiers: [9,15,22,30,40], pk: [0,11,17,23.5,31],
    kinds: [[], ['water'], ['air', 'earth'], ['water', 'fire'], ['air', 'water', 'earth']], xpFirst: true, combos: {} });
  CFG.tree.push({ id: 'wardwoven', col: 2, br: 'wiz', icon: 'armor', name: 'Wardwoven', per: '+10% armor from Shield Potions',
    tiers: [9,16,25,36], pk: [0,12,19.5,28],
    kinds: [[], ['earth'], ['fire', 'water'], ['air', 'fire', 'earth']], xpFirst: true, combos: {} });
  CFG.tree.push({ id: 'slippery', col: 2, br: 'wiz', icon: 'ic_rotate', name: 'Slippery', per: '-7% roll cooldown',
    tiers: [10,16,23,31,41], pk: [0,12,18,24,32],
    kinds: [[], ['air'], ['water', 'earth'], ['air', 'fire'], ['water', 'fire', 'earth']], xpFirst: true, combos: {} });
  CFG.tree.push({ id: 'mighty', col: 2, br: 'wiz', icon: 'ic_bolt', name: 'Mighty Elements', per: '+8% damage, knockback and harvest strength for the four basic spells',
    tiers: [11,18,26,36,48], pk: [0,14,20,28,37],
    kinds: [[], ['fire'], ['air', 'earth'], ['water', 'fire'], ['air', 'water', 'fire', 'earth']], xpFirst: true, combos: {} });
  CFG.tree.push({ id: 'harvest', col: 2, br: 'wiz', icon: 'ic_tree', name: 'Harvest Strength', per: '+20% spell damage to trees, rocks and ore',
    tiers: [8,14,21,30], pk: [0,11,16.5,23],
    kinds: [[], ['earth'], ['air', 'fire'], ['water', 'earth']], xpFirst: true, combos: {} });
  CFG.tree.push({ id: 'forager', col: 2, br: 'wiz', icon: 'ic_flag', name: 'Keen Forager', per: '+12% faster foraging and +12% chance of a double yield',
    tiers: [8,14,22,31], pk: [0,11,17,24],
    kinds: [[], ['air'], ['water', 'fire'], ['air', 'earth']], xpFirst: true, combos: {} });
  CFG.tree.push({ id: 'longarm', col: 2, br: 'bldr', icon: 'ic_target', name: 'Long Arm', per: '+10% throw distance',
    tiers: [9,15,22,30,40], pk: [7,11.5,17,23,31],
    kinds: [['earth'], ['air', 'water'], ['fire', 'earth'], ['water', 'fire'], ['air', 'water', 'fire', 'earth']], combos: {} });
  CFG.tree.push({ id: 'tumble', col: 2, br: 'bldr', icon: 'ic_swap', name: 'Tumble', per: 'tier 1 gives the Builder a dodge roll; then -10% roll cooldown',
    tiers: [32,14,21,30], pk: [24,11,16.5,23],
    kinds: [['air', 'water', 'fire', 'earth'], ['air', 'earth'], ['water', 'fire'], ['air', 'water', 'earth']], fullFirst: true, combos: {} });
  CFG.tree.push({ id: 'hustle', col: 2, br: 'bldr', icon: 'ic_fast', name: 'Hustle', per: '+7% Builder move speed',
    tiers: [9,15,22,30,40], pk: [7,11.5,17,23,31],
    kinds: [['water'], ['air', 'fire'], ['water', 'earth'], ['air', 'earth'], ['air', 'water', 'fire']], combos: {} });
  CFG.tree.push({ id: 'rapid', col: 2, br: 'bldr', icon: 'ic_hand', name: 'Rapid Throws', per: '-8% throw cooldown',
    tiers: [8,14,21,30], pk: [6,11,16.5,23],
    kinds: [['air'], ['water', 'fire'], ['air', 'earth'], ['water', 'fire', 'earth']], combos: {} });
  // The tier pattern for EVERY track (old and new): combo spells price the top end. Mid-to-late tiers add a double spell, the last tier of a 6+ tier track a triple too
  // (3 tiers: the last; 4: the last two; 5: the last two; 6: tiers 4-6; 8: tiers 5-8). Nova is never a tree cost. Final numbers (not scaled again).
  CFG.trackCombos = {
crafting: { 3: { flamethrower: 1 }, 4: { steam: 1 }, 5: { sandstorm: 1, meteor: 1 } },
    swift: { 4: { magma: 1 }, 5: { tempest: 1 }, 6: { mud: 1 }, 7: { flamethrower: 1, thunder: 1 } },
    belts: { 3: { steam: 1 }, 4: { sandstorm: 1 }, 5: { magma: 1, blizzard: 1 } },
    zoomies: { 3: { tempest: 1 }, 4: { mud: 1 }, 5: { flamethrower: 1, geyser: 1 } },
    hearty: { 4: { steam: 1 }, 5: { sandstorm: 1 }, 6: { magma: 1 }, 7: { tempest: 1, meteor: 1 } },
    gems: { 4: { mud: 1 }, 5: { flamethrower: 1 }, 6: { steam: 1 }, 7: { sandstorm: 1, thunder: 1 } },
    magnet: { 3: { magma: 1 }, 4: { tempest: 1 } },
    remedies: { 3: { mud: 1 }, 4: { flamethrower: 1 } },
    wardwoven: { 2: { steam: 1 }, 3: { sandstorm: 1 } },
    slippery: { 3: { magma: 1 }, 4: { tempest: 1 } },
    mighty: { 3: { mud: 1 }, 4: { flamethrower: 1 } },
    harvest: { 2: { steam: 1 }, 3: { sandstorm: 1 } },
    forager: { 2: { magma: 1 }, 3: { tempest: 1 } },
    manual: { 2: { mud: 1 } },
    satchel: { 3: { flamethrower: 1 }, 4: { steam: 1 } },
    longarm: { 3: { sandstorm: 1 }, 4: { magma: 1 } },
    tumble: { 0: { tempest: 1 }, 2: { tempest: 1 }, 3: { mud: 1 } },
    hustle: { 3: { flamethrower: 1 }, 4: { steam: 1 } },
    rapid: { 2: { sandstorm: 1 }, 3: { magma: 1 } },
  };
  for (const n of CFG.tree) if (n.tiers) n.combos = CFG.trackCombos[n.id] || {};
  // the three branches of the tree, with every node in the order it is shown (the machine tracks first, so they stay put as the unlocks below them change)
  CFG.freeNodes = {};   // the building unlocks are gone (every building is available from the start): what each cost, for the refund a save that bought one gets
  for (const id of ['alchemy', 'forge', 'armory', 'logistics', 'heavy']) { const i = CFG.tree.findIndex(n => n.id === id); CFG.freeNodes[id] = { xp: CFG.tree[i].xp, pay: CFG.tree[i].pay }; CFG.tree.splice(i, 1); }
  CFG.branches = [
    { id: 'bldr', name: 'BUILDER', icon: 'ic_wrench', nodes: ['manual', 'satchel', 'longarm', 'tumble', 'hustle', 'rapid'] },
    { id: 'bld', name: 'BUILDINGS', icon: 'ic_factory', nodes: ['crafting', 'swift', 'belts', 'summon'] },
    { id: 'wiz', name: 'WIZARD', icon: 'ic_hat', nodes: ['zoomies', 'hearty', 'remedies', 'wardwoven', 'slippery', 'mighty', 'harvest', 'forager', 'gems', 'magnet'] },
  ];
})();

const ELEM = {
  air:   { name: 'Air Pocket',  color: '#c8efff', dark: '#7ec3e8' },
  water: { name: 'Water Drop',  color: '#4aa8ff', dark: '#2a72c8' },
  fire:  { name: 'Fire Ember',  color: '#ff7a30', dark: '#c8431a' },
  earth: { name: 'Earth Chunk', color: '#b58a4c', dark: '#7a5a2c' },
};
const ELEM_WORD = { air: 'Air', water: 'Water', fire: 'Fire', earth: 'Earth' };
// ---- the Wizard's augments: garments that give him a new VERB (never a stat). slot = where it is worn; make = what the Armory forges it from (Cores of the
// element line it belongs to, Iron Ore, an Aether Shard: all thrown in by hand) and how long it takes. Each is made once.
// gate = the Stronghold element whose approach it opens: the terrain augment of a keep comes from the line of the element that keep is weak to ----
const AUG_SLOTS = [['hat', 'Hat'], ['robe', 'Robe'], ['boots', 'Boots'], ['charm', 'Charm']];
const AUGS = {
  tide:    { name: 'Tide-Walking Boots', slot: 'boots', col: '#4aa8ff', gate: 'water', verb: 'Walk on water',
             make: { in: { core_earth: 5, iron: 2, shard: 1 }, time: 16 } },
  ember:   { name: 'Emberward Cloak',    slot: 'robe',  col: '#ff7a30', gate: 'fire',  verb: 'Cross scorched and lava ground unharmed',
             make: { in: { core_water: 5, iron: 2, shard: 1 }, time: 16 } },
  stone:   { name: 'Stonefist Charm',    slot: 'charm', col: '#a9b0b8', gate: 'earth', verb: 'Gust shoves boulders and cracks cracked rocks open',
             make: { in: { core_air: 5, iron: 2, shard: 1 }, time: 16 } },
  gale:    { name: 'Gale Circlet',       slot: 'hat',   col: '#e6f8ff', gate: 'air',   verb: 'Roll becomes a short blink: crosses gaps and chasms, passes through foes',
             make: { in: { core_fire: 5, iron: 2, shard: 1 }, time: 16 } },
  bog:     { name: 'Bogwalker Shroud',   slot: 'robe',  col: '#6a8a4a', verb: 'Bog no longer slows you; pass through vine tangles',
             make: { in: { core_earth: 3, core_water: 3, iron: 2, shard: 1 }, time: 20 } },
  phoenix: { name: 'Phoenix Feather',    slot: 'charm', col: '#ff9a3a', verb: 'Cheat death: revive on the spot at half HP (recharges over 15 minutes)',
             make: { in: { core_fire: 3, core_air: 3, iron: 2, shard: 2 }, time: 24 } },
  static:  { name: 'Static Cloak',       slot: 'robe',  col: '#fff27a', verb: 'Foes that strike you are knocked back by a static burst (it does no damage)',
             make: { in: { core_air: 3, core_water: 3, iron: 2, shard: 1 }, time: 20 } },
  kiln:    { name: 'Kilnsight Mask',     slot: 'hat',   col: '#ffb030', verb: 'Hidden glints show through the wilds: buried caches and landmark hints',
             make: { in: { core_fire: 3, core_water: 3, core_earth: 3, iron: 3, shard: 2 }, time: 28 } },
};
const AUG_ORDER = Object.keys(AUGS);
// the element Cores (components): one per element, named for what the creatures of that line are made of
const CORE_NAME = { earth: 'Stone Core', water: 'Tide Core', fire: 'Ember Core', air: 'Gale Core' };
const CORE_FROM = { earth: 'golems', water: 'slimes and lurkers', fire: 'imps', air: 'wisps' };   // flavour for the Collection Book
const KEY_NAME = () => 'Warden Key';
const isCoreKind = k => /^core_(air|water|fire|earth)$/.test(k), isKeyKind = k => k === 'wardkey';
const RES = {
  wood:  { name: 'Wood',     color: '#a8683a' },
  stone: { name: 'Stone',    color: '#a9b0b8' },
  iron:  { name: 'Iron Ore', color: '#c4703c' },
  shard: { name: 'Aether Shard', short: 'Shard', color: '#c890ff' },   // only from landmarks and elites
  wardkey: { name: 'Warden Key', short: 'Key', color: '#ffd23a' },     // forged at the Armory; sent through the portal at the Stronghold it opens the door
};
// the element Cores are Stockpile resources too: they fly home through the portal like shards, the Builder takes them from their piles
for (const el in ELEM) RES['core_' + el] = { name: CORE_NAME[el], short: CORE_NAME[el].split(' ')[0], color: ELEM[el].color };
const BASIC_SPELL = { air: 'gust', fire: 'fireball', water: 'spray', earth: 'boulder' };
const SPELLS = {
  gust: 'Cyclone Gust', fireball: 'Seeker Fireball', spray: 'Tidal Wave', boulder: 'Bouncing Boulder',
  flamethrower: 'Flamethrower', steam: 'Steam Mine', sandstorm: 'Gale Boomerang', magma: 'Magma Bomb',
  tempest: 'Tempest Tear', mud: 'Mud Shield', meteor: 'Meteor Strike', thunder: 'Thunderstorm',
  blizzard: 'Blizzard', geyser: 'Geyser Eruption', nova: 'Elemental Nova',
};
// the Collection Book's text for every spell (these used to be the skill-tree node descriptions)
const SPELL_INFO = {
  gust: { desc: 'Air: a cyclone spins out of the Wizard in three pulses, flinging foes into each other (they bonk) and chopping trees and rocks.' },
  fireball: { desc: 'Fire: a small, fast fireball that curves toward the foe it has to turn least for and bursts, leaving a trail of embers.' },
  spray: { desc: 'Water: a crescent wave rolls out and carries every foe it catches along with it, slowing them; it splashes the Wizard back to health a little.' },
  boulder: { desc: 'Earth: a boulder that bounces along the ground, crushing everything around each landing.' },
  flamethrower: { desc: 'Air + Fire: a roaring stream of fire blown out in front of the Wizard for two seconds, scorching the ground.' },
  tempest: { desc: 'Air + Water: a controllable water droplet for five seconds, flying three to four times as fast as the Wizard along his aim (right stick, or the way he faces) up to six tiles out, hurting and slowing everything it passes through. Every delivery is its own droplet on its own clock and at its own speed (at least 5% apart, 10% when it can), and live droplets fan out ten degrees apart.' },
  steam: { desc: 'Fire + Water: lobs a mine a few tiles ahead that sits and pulses. When a foe comes close it wakes, hops up and flies at that foe, bursting in scalding steam that leaves a cloud which slows. Up to five mines at once.' },
  sandstorm: { desc: 'Air + Earth: a heavy boomerang curves out and pierces everything on the way, then comes back to where the Wizard stands. Be at the catch spot to catch it and it flies again as a smaller one-way boomerang; miss it and it fizzles.' },
  magma: { desc: 'Fire + Earth: lobbed onto the thickest crowd: a big blast, a lava pool and magma blobs splattering out.' },
  mud: { desc: 'Water + Earth: blue and brown orbs circle the Wizard like a shield; the first foe an orb touches sets it off in a muddy blast that shoves and slows.' },
  meteor: { desc: 'Air + Fire + Earth: one huge meteor crashes onto the thickest crowd and shatters into burning, bouncing boulders that hunt down the nearest foes and crush everything they land on.' },
  thunder: { desc: 'Air + Fire + Water: a storm cloud over the Wizard calls lightning down on foes for four seconds, each bolt forking on.' },
  blizzard: { desc: 'Air + Water + Earth: a freezing storm rains icicles round the Wizard; foes hit three times freeze solid. Freezes bog and water into ice he can run on.' },
  geyser: { desc: 'Fire + Water + Earth: two waves of geysers, 1.2 seconds apart: the 6 nearest foes, then 6 random ones, are thrown into the air and slowed for five seconds after they land.' },
  nova: { desc: 'All four: foes within 12 tiles are hauled in and everyone within 8 is zapped, then magma balls, water drops, air wisps and rock chunks explode out of the Wizard and shove everything away.' },
};
const SPELL_COL = {
  gust: '#e6f8ff', fireball: '#ff7a30', spray: '#4aa8ff', boulder: '#b58a4c',
  flamethrower: '#ff9a2b', steam: '#bfe9ff', sandstorm: '#d9b46a', magma: '#ff4a1a', tempest: '#4fc3ff', mud: '#8a5a2a',
  meteor: '#ff7a30', thunder: '#fff27a', blizzard: '#dff4ff', geyser: '#4aa8ff', nova: '#ffe36b',
};

// Every item that can sit in hands, on a belt, on the floor, inside a machine or in the skill bank.
const ITEMS = {};
(function () {
  for (const k in RES) ITEMS[k] = { name: RES[k].name, res: true, color: RES[k].color };
  for (const k in ELEM) ITEMS[k] = { name: ELEM[k].name, elem: true, color: ELEM[k].color };
  ITEMS.potion = { name: 'Health Potion', pickup: true, color: '#ff4a6a' };
  ITEMS.elixir = { name: 'Greater Elixir', pickup: true, color: '#ff8ad8' };
  ITEMS.armor = { name: 'Shield Potion', pickup: true, color: '#9fc4ff' };
  ITEMS.plate = { name: 'Greater Shield Potion', pickup: true, color: '#5a8aff' };
  for (const id of AUG_ORDER) {   // the garments: items too (the Armory makes them, hands carry them, the Spell Portal delivers them), and their Armory recipes
    const a = AUGS[id];
    ITEMS['aug_' + id] = { name: a.name, aug: true, id, color: a.col };
    CFG.recipes['aug_' + id] = { machine: 'anvil', in: a.make.in, out: 'aug_' + id, time: a.make.time, power: 2, aug: id, use: a.verb };
  }
  // the Warden Key is forged at the Armory too, from Cores of every element + Iron + Shards (the recipe hides once the door is open or a key exists)
  { const K = CFG.keyCost, inp = {}; for (const el in ELEM) inp['core_' + el] = K.cores; inp.iron = K.iron; inp.shard = K.shard;
    CFG.recipes.wardkey = { machine: 'anvil', in: inp, out: 'wardkey', time: K.time, power: 2, key: true, use: 'Opens the Stronghold door, where the Warden waits' }; }
  for (const id in CFG.creatures) ITEMS['egg_' + id] = { name: CFG.creatures[id].name + ' Egg', egg: true, creature: id, color: CFG.creatures[id].col };
  for (const id in CFG.creatures) ITEMS['aegg_' + id] = { name: 'Allied ' + CFG.creatures[id].name + ' Egg', egg: true, ally: true, creature: id, color: mixHex(CFG.creatures[id].col, '#2fe0d0', 0.45) };   // a teal-tinted shell: the friendly version
  for (const k in CFG.recipes) {
    const r = CFG.recipes[k];
    if (r.machine === 'forge') ITEMS[r.out] = { name: SPELLS[r.out], spell: true, color: SPELL_COL[r.out] };
  }
})();
const itemName = k => (ITEMS[k] ? ITEMS[k].name : k);
const recipeName = id => itemName(CFG.recipes[id].out);
// what a recipe's product is for (spells reuse their skill-tree blurb minus the "Air + Fire:" prefix)
const recipeUse = id => {
  const r = CFG.recipes[id];
  if (r.use) return r.use;
  return SPELL_INFO[id] ? SPELL_INFO[id].desc.replace(/^[^:]*:\s*/, '') : '';
};
const SPELL_KINDS = Object.keys(ITEMS).filter(k => ITEMS[k].elem || ITEMS[k].spell);   // the spells and packets the Skill Portal banks
const BANK_KINDS = SPELL_KINDS.concat(['shard']);   // ...and Aether Shards (the Summoning node costs them)
// the elements each spell carries (for weaknesses, and its tier: how hard it lands back at the Spell Portal)
const SPELL_EL = { gust: ['air'], fireball: ['fire'], spray: ['water'], boulder: ['earth'] };
for (const k in CFG.recipes) { const r = CFG.recipes[k]; if (ITEMS[r.out] && ITEMS[r.out].spell) SPELL_EL[r.out] = Object.keys(r.in); }
// the Creature Spawner's seeds: a combo spell -> the creature (pair or triple) it hatches. A spell with no creature (Steam Mine, Gale Boomerang, Blizzard) is no seed
const SEED_SPELL = {};
for (const id in CFG.creatures) { const ks = Object.keys(CFG.creatures[id].cost); if (ks.length === 1 && ITEMS[ks[0]] && ITEMS[ks[0]].spell) SEED_SPELL[ks[0]] = id; }

// Guided goals: TWO tracks that run at the same time, one for each player (`B` = the Builder, `W` = the Wizard). Each goal
// pays `xp` and, for the bigger steps, a `gift` ({ bank: {kind: n} spells for the skill tree, stock: {res: n} materials,
// credit: {building: n} free placements, pickup: [kinds] potions / armor that drop beside the Wizard }). `icon` is a sprite key.
//  - `done(g)` is a plain check; `prog(g)` -> [have, need] draws the bar.
//  - `stat(g)` + `n`: a lifetime counter that must grow by n SINCE the goal started (the baseline is stored in G.qbase), so
//    practice goals ("top a Battery up 3 times") really ask for fresh work. The bar is automatic.
//  - `hint` tells main.js what to point at: a pile, a portal, a building to use or build (`make`), the skill tree, the nearest
//    tree / landmark / forage spot in the wilds, or the boss.
//  - `from` = the index of the goal in the old single chain (v4) this one continues, so older saves land in the right place
//    (Main.splitQuest, QUEST_VERSION in main.js). New goals carry no `from`.
const QUEST_SIDES = ['B', 'W'];
const QUEST_NAME = { B: 'BUILDER', W: 'WIZARD' };
const sentN = (g, ...ks) => ks.reduce((a, k) => a + ((g.stats.sent || {})[k] || 0), 0);
const QUESTS = {
  B: [
    // v5: the goal's index in the previous list (saves from before QUEST_VERSION 6 resume at the first goal with v5 >= their old index)
    { from: 0,  v5: 0,  icon: 'wood',  text: 'Walk to the Stockpile and left-click (pad A) to grab some Wood', xp: 2, done: g => g.flags.tookPile, hint: { pile: 'wood' } },
    { from: 2,  v5: 1,  icon: 'air',   text: 'Stand by the Harnesser: press E to hand-gather Air, then keep tapping E to fill the meter', xp: 3, done: g => g.flags.gathered, hint: { use: 'harness' } },
    { from: 3,  v5: 2,  icon: 'ic_portal', text: 'Throw (right-click / pad B) a spell into the Spell Portal', xp: 3, done: g => g.flags.portalHand, hint: { portal: 'spell' } },
    { from: 5,  v5: 3,  icon: 'ic_skill', text: 'Send 5 Air Pockets into the Skill Portal: spells are skill-tree currency', xp: 3, gift: { bank: { air: 4 } }, done: g => (g.bankTotal || 0) >= 5, prog: g => [g.bankTotal || 0, 5], hint: { portal: 'skill' } },
    { icon: 'b:water', text: 'Switch the Harnesser to another element: press F beside it (the new crystal grows for 7.5 seconds)', xp: 4, done: g => !!g.flags.switched, hint: { use: 'harness' } },
    { from: 6,  v5: 4,  icon: 'b:air', text: 'Build a second Harnesser: press 3, click a tile, then throw Wood & Stone at it', xp: 8, done: g => FA.count('harness') >= 2, hint: { build: 'harness' } },
    { from: 7,  v5: 5,  icon: 'battery', text: 'Feed the Battery: throw Air spells (or Wood or Stone) at it so it never runs flat', xp: 10, done: g => !!g.flags.fed, hint: { make: 'battery' } },
    { icon: 'egg_zephyr', text: 'Hatch Air creatures: send 3 Zephyr Wisp Eggs through the Spell Portal', xp: 8, stat: g => (g.stats.sent || {}).egg_zephyr || 0, n: 3, hint: { make: 'spawner' } },
    { v5: 6,  icon: 'b:water', text: 'Switch a Harnesser to Water: press F beside it. The new crystal grows for 7.5 seconds', xp: 8, gift: { bank: { water: 4 } }, done: g => G.fac.bld.some(b => b.type === 'harness' && b.done && b.el === 'water' && !FA.growing(b)), hint: { use: 'harness' } },
    { from: 11, v5: 8,  icon: 'potion', text: 'Build an Alchemy Cauldron, brew a Health Potion from Water and send it through the Spell Portal', xp: 12, done: g => g.flags.sent_potion, hint: { make: 'cauldron' } },
    { v5: 9,  icon: 'elixir', text: 'Keep the Wizard healthy: send 3 more Potions or Elixirs', xp: 10, gift: { stock: { wood: 12, stone: 9, iron: 6 } }, stat: g => sentN(g, 'potion', 'elixir'), n: 3, hint: { make: 'cauldron' } },
    { icon: 'egg_puddle', text: 'Hatch a Puddle Slime: feed Water to a Spawner, then send the Egg', xp: 10, stat: g => (g.stats.sent || {}).egg_puddle || 0, n: 1, hint: { make: 'spawner' } },
    { icon: 'egg_cinder', text: 'Hatch a Cinder Imp: set a Harnesser to Fire, feed a Spawner, send the Egg', xp: 10, gift: { bank: { fire: 4 } }, stat: g => (g.stats.sent || {}).egg_cinder || 0, n: 1, hint: { make: 'spawner' } },
    { from: 12, v5: 10, icon: 'b:forge', text: 'Build the Elemental Forge: it fuses element spells into combo spells', xp: 12, done: g => FA.count('forge') >= 1, hint: { make: 'forge' } },
    { v5: 11, icon: 'battery', text: 'Build a second Battery: press 5, click a tile, then throw Wood, Stone & Iron at it', xp: 8, done: g => FA.count('battery') + FA.count('heavybat') >= 2, hint: { build: 'battery' } },
    { v5: 12, icon: 'ic_bolt', text: 'Keep the power on: top a Battery up to full 3 times with spells, Wood or Stone', xp: 15, gift: { credit: { battery: 1 } }, stat: g => g.stats.charged || 0, n: 3, hint: { make: 'battery' } },
    { from: 13, v5: 13, icon: 'flamethrower', text: 'Craft a combo spell at the Forge (press E to pick Air + Fire, Air + Water...) and deliver it', xp: 15, gift: { bank: { air: 3, fire: 3 } }, done: g => g.flags.combo, hint: { combo: 2 } },
    { v5: 14, icon: 'ic_fast', text: 'Overdrive: put a charged Battery right beside a Forge or Cauldron', xp: 12, done: g => G.fac.bld.some(b => b.done && b.od), hint: { make: 'battery' } },
    { v5: 15, icon: 'steam', text: 'Deliver 6 combo spells to the Wizard (two or more elements each)', xp: 15, gift: { stock: { shard: 1 } }, stat: g => g.stats.combos || 0, n: 6, hint: { combo: 2 } },
    { from: 15, v5: 16, icon: 'b:splitter', text: 'Build a Splitter (it routes spells to up to 3 outputs)', xp: 15, done: g => G.fac.bld.some(b => b.done && !b.free && b.type === 'splitter'), hint: { make: 'splitter' } },
    { from: 16, v5: 17, icon: 'armor', text: 'Brew a Shield Potion at the Cauldron (Earth + Fire spells) and send it to the Wizard', xp: 15, done: g => g.flags.sent_armor || g.flags.sent_plate, hint: { make: 'cauldron' } },
    { v5: 18, icon: 'plate', text: 'Build the Armory: forge a garment from Cores, send it', xp: 20, gift: { stock: { iron: 6 } }, done: g => !!g.flags.sent_aug, hint: { make: 'anvil' } },
    { icon: 'egg_pebble', text: 'Hatch a Pebble Golem: set a Harnesser to Earth, feed a Spawner, send the Egg', xp: 12, stat: g => (g.stats.sent || {}).egg_pebble || 0, n: 1, hint: { make: 'spawner' } },
    { from: 17, v5: 19, icon: 'b:expand', text: 'Add floor: place a Floor Tile (slot 8) and throw 1 Wood + 1 Stone at it', xp: 15, done: g => (g.stats.tiles || 0) >= 1, hint: { make: 'expand' } },
    { v5: 20, icon: 'egg_zephyr', text: 'Hatch a horde: send 8 Eggs through the Spell Portal', xp: 15, gift: { bank: { air: 5, water: 5 } }, stat: g => g.stats.eggs || 0, n: 8, hint: { make: 'spawner' } },
    { from: 19, v5: 21, icon: 'meteor', text: 'Deliver a Triple spell', xp: 40, gift: { stock: { shard: 1 } }, done: g => g.flags.triple, hint: { combo: 3 } },
    { from: 20, v5: 22, icon: 'nova', text: 'Unleash the Elemental Nova', xp: 80, done: g => g.flags.sent_nova, hint: { combo: 4 } },
    { from: 23, v5: 23, icon: 'b:altar', text: 'Buy Summoning (6 Shards into the Skill Portal first): the Altar falls into the wilds', xp: 40, done: g => !!g.tree.summon, hint: { tree: 1 } },
    { from: 24, v5: 24, icon: 'ic_crown', text: 'Light the Altar (the Warden must be dead): send a Single, a Pair, a Triple and the Nova', xp: 60, done: g => !!(g.altar && g.altar.placed && WZ.altarLitN() >= 4), hint: { altar: 1 } },
  ],
  W: [
    { from: 1,  icon: 'ic_hat', text: 'Stand right next to a tree. The factory\'s Air Gusts will chop it down', xp: 4, done: g => g.stats.harvested >= 1, hint: { harv: 1 } },
    { icon: 'stone', text: 'Gather 10 more Wood or Stone: stand by trees and rocks while spells land', xp: 4, stat: g => g.stats.harvested || 0, n: 10, hint: { harv: 1 } },
    { icon: 'ic_boot', text: 'Forage 3 spots: stand next to a mound, sticks or bush and mash Mash (X)', xp: 6, stat: g => g.stats.foraged || 0, n: 3, hint: { forage: 1 } },
    { from: 4,  icon: 'egg_zephyr', text: 'Defeat a creature the factory made (the Spawner\'s Eggs arrive through the Spell Portal)', xp: 6, done: g => (g.stats.craftedKills || 0) >= 1, hint: { crafted: 1 } },
    { from: 8,  icon: 'ic_skull', text: 'Defeat 15 monsters', xp: 8, done: g => g.stats.kills >= 15, prog: g => [g.stats.kills, 15] },
    { icon: 'ic_shield', text: 'Dodge 3 hits: roll into an attack (you can\'t be hurt mid-roll)', xp: 8, stat: g => g.stats.dodges || 0, n: 3 },
    { icon: 'ic_tree', text: 'Open your Skill Tree (Y) and buy a Wizard upgrade: Hearty Hat or Wizard Zoomies', xp: 8, gift: { bank: { air: 3 } }, done: g => lvl('hearty') >= 1 || lvl('zoomies') >= 1, hint: { tree: 1 } },
    { icon: 'potion', text: 'Walk over 2 Potions or Shield Potions the Builder sends you', xp: 8, stat: g => g.stats.used || 0, n: 2 },
    { icon: 'ic_bolt', text: 'Hit weaknesses: finish off 10 monsters with a yellow ! hit (match the element)', xp: 12, gift: { pickup: ['potion'], stock: { core_air: 1, core_water: 1, core_fire: 1, core_earth: 1 } }, stat: g => g.stats.weakKills || 0, n: 10 },   // the Cores are for the next goal: any Shrine takes one of each of the three OTHER elements, so one of each is enough for the first
    { icon: 'ic_flag', text: 'Claim a Shrine: while the Wizard stands by it, send the Cores of the 3 other elements', xp: 12, gift: { pickup: ['plate'] }, stat: g => g.stats.shrines || 0, n: 1, hint: { mark: 'shrine' } },
    { icon: 'ic_fast', text: 'Activate a claimed Shrine: press Mash as the ring closes, 3 times', xp: 10, stat: g => g.stats.shrineAct || 0, n: 1, hint: { mark: 'myshrine' } },
    { from: 14, icon: 'ic_flag', text: 'Clear a Monster Camp or an Ancient Crypt (see the map) for Aether Shards', xp: 15, gift: { pickup: ['potion', 'plate'] }, stat: g => g.stats.clears || 0, n: 1, hint: { mark: 'camp' } },
    { icon: 'ic_skull', text: 'Defeat 60 monsters', xp: 12, done: g => g.stats.kills >= 60, prog: g => [g.stats.kills, 60] },
    { icon: 'flamethrower', text: 'Finish off 10 monsters with combo spells (two elements). Ask the Builder!', xp: 20, gift: { pickup: ['elixir'] }, stat: g => g.stats.k2 || 0, n: 10 },
    { icon: 'ic_crown', text: 'Take down an Elite (a gold ring): it drops Aether Shards and a chunk of Cores', xp: 15, gift: { pickup: ['plate'] }, stat: g => g.stats.elites || 0, n: 1 },
    { from: 18, icon: 'ic_skull', text: 'Defeat 300 monsters', xp: 40, done: g => g.stats.kills >= 300, prog: g => [g.stats.kills, 300] },
    { icon: 'ic_trophy', text: 'Survive a Wilds Event: check the card under the goals, then clear it', xp: 30, gift: { stock: { shard: 1 } }, stat: g => g.stats.events || 0, n: 1 },
    { icon: 'meteor', text: 'Wipe out 15 monsters with Triple spells (three elements)', xp: 30, gift: { pickup: ['elixir', 'plate'] }, stat: g => g.stats.k3 || 0, n: 15 },
    { from: 21, icon: 'ic_keep', text: 'Scout the Stronghold, far out in the wilds (see the map): get near to reveal its guards', xp: 20, done: g => !!g.flags.scouted, hint: { keep: 'scout' } },
    { from: 22, icon: 'wardkey', text: 'Storm the Stronghold: wear its garment, have the Warden Key sent in, beat the Warden', xp: 40, done: g => (g.stats.keeps || 0) >= 1, hint: { keep: 'claim' } },
    { icon: 'nova', text: 'Blast 10 monsters with the Elemental Nova', xp: 40, gift: { pickup: ['elixir', 'plate'] }, stat: g => g.stats.k4 || 0, n: 10 },
    { from: 24, icon: 'ic_crown', text: 'Light the Altar with the Warden dead, then defeat the Primal Chimera!', xp: 150, done: g => g.flags.won, hint: { boss: 1 } },
  ],
};

