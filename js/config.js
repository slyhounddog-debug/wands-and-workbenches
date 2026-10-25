'use strict';
// ===== All tuning numbers live here =====
const CFG = {
  W: 1600, H: 900, HALF: 800,
  WW: 200, WH: 200,          // wizard world
  // Everything is drawn into a low-res buffer and scaled up by P, so the whole game shares one pixel grid.
  FT: { TW: 80, TH: 40, S: 4, P: 4 },   // factory iso tile (in screen px) + sprite scale + pixel size
  WT: { TW: 60, TH: 30, S: 3, P: 3 },   // wizard world
  // the factory grid is fixed (w x h tiles); the floor starts as the base rectangle (12x8) and grows one placed Floor Tile at a time. The Stockpile Zone is the
  // south-west 5x5 of the base rectangle and never moves. The first freeIron tiles cost wood + stone only, later ones add 1 Iron.
  factory: { w: 48, h: 36, base: { x0: 18, y0: 14, w: 12, h: 8 }, freeIron: 28 },
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
  spawnSettle: 1.5,           // a Creature Spawner waits this long after the last packet before hatching a creature that a bigger one could still grow out of
  qShow: 6,                   // seconds the ? station's note about the last thing thrown at it stays up
  batteryLife: 60,            // seconds a Battery lasts at a full 10 power of draw; it drains in proportion to the load it carries
  chargeTipAt: 0.5,           // the first time a Battery falls below this fraction, hint that it can be fed packets, Wood or Stone
  chargeBase: 60, chargeBoost: 1.33,
  swapHold: 1.5, swapCooldown: 5,
  builder: { speed: 5.5, accel: 42, friction: 34, radius: 0.24 },
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
  pressure: { hit: 0.18, speed: 10, life: 1.4, range: 11, amp: 6 },   // Spell Portal shockwaves: the Wizard losing this share of max HP in one hit (also events, Wardens, the Chimera), front speed (tiles/s), seconds, reach (tiles), most jitter (px)
  // layered soundtrack (audio/music/music_<element>.js, built by tools/musicbuild): one looping layer per element, volume follows
  // G.fac.weather[el]. gain = layer volume at full; fade = seconds a layer takes to swell (time constant); curve < 1 lifts quiet
  // activity so a trickle is still audible; airFloor = Air never drops below this (it is the "song", the others build on it);
  // menu = every layer's level on the title / player screens (all four play). muffleHz / muffleT = the low-pass the music wears on
  // those screens, in the pause menu and while a skill tree is open (cutoff in Hz, seconds to glide there and back)
  music: { fadeIn: 0.5, fadeOut: 1, gain: 0.63, fade: 1.2, curve: 0.5, airFloor: 0.3, menu: 0.8, muffleHz: 2200, muffleT: 0.25 },
  weather: { tau: 30, min: 6, full: 30, ease: 0.035, shrine: 0.5 },   // wilds weather from the factory: packets/min of an element below min = clear, at full = full weather; ease = how fast it turns (per s); a claimed shrine / Portal Storm adds this much of its element
  decalMax: 70,               // spell scorch / crack / frost marks on the ground at once (each spell's dec in CFG.spells)
  bend: { r: 0.45, hold: 0.1, spring: 10, damp: 3.4, amp: 0.6, life: 1.5, bigRad: 0.45, tufts: 24000, shrubs: 1100 },   // grass and flowers lean away from the Wizard and big foes, then spring back; tufts = extra grass tufts sown over the wilds
  wizard: {
    hp: 100, speed: 6.5, accel: 48, friction: 40, radius: 0.3,
    rollTime: 0.45, rollSpeed: 2.3, rollCd: 1.1, armorMax: 100, dodgeCd: 0.3,
    kickT: 0.16,              // aimed spells push him back over this many seconds (each spell's recoil in CFG.spells = tiles)
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
    shrineR: 2.6, shrineBoost: 0.25,   // standing at a claimed shrine speeds up that element's harnessers
    // claiming a shrine: the Builder sends that element's Core (dropped by its creatures) through the Spell Portal while the Wizard is within CFG.unlockR of it; the Core flies down onto the shrine.
    // shrineShards = Aether Shards paid out when it is claimed (unchanged from the mini-game days)
    shrineShards: 1,
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
    reach: 1.15, decay: 2.5, respawn: 150, bushRespawn: 240,
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
  crateCap: 30,
  pickups: {
    potion: { heal: 35 }, elixir: { heal: 80 },
    armor: { armor: 35 }, plate: { armor: 70 },
  },
  // costs were 50% up on the original, then cut ~30% (belts stay 1 Wood; the Splitter is 2 Wood + 1 Stone)
  buildings: {
    harness:  { name: 'Harnesser', kind: 'harness', cost: { wood: 6, stone: 4 }, unlock: null,
                desc: 'Makes element packets: Air, Water, Fire or Earth, whichever crystal it carries. F (LT + X on a pad) switches the element at any time: the old crystal bursts and the new one takes 15 seconds to grow, and nothing is made meanwhile. Draws 2 power (hand-gathering is free, so the factory can always restart). Stand beside it and press E to hand-gather.' },
    cauldron: { name: 'Alchemy Cauldron', kind: 'crafter', cost: { wood: 6, stone: 6 }, unlock: 'alchemy',
                desc: 'Brews Health Potions and Shield Potions from element packets only (no raw resources). No power. Send them through the Spell Portal: they land beside the Wizard.' },
    forge:    { name: 'Elemental Forge', kind: 'crafter', cost: { wood: 13, stone: 10, iron: 4 }, unlock: 'forge',
                desc: 'Fuses element packets into combo spells (each spell is unlocked separately). Press E at it to switch recipe.' },
    anvil:    { name: 'Armory', kind: 'crafter', cost: { wood: 6, stone: 8, iron: 4 }, unlock: 'armory',
                desc: 'Forges the Wizard\'s garments (augments) from the Cores he hunts, plus Iron Ore and an Aether Shard: throw them in, E picks the garment. Send the finished garment through the Spell Portal: it lands in the wilds and he wears it by walking onto it. Each garment is made once; swapping puts the old one on the Wardrobe Shelf by the portal.' },
    battery:  { name: 'Battery', kind: 'cell', cost: { wood: 8, stone: 6, iron: 4 }, unlock: null,
                desc: 'Gives +10 power to the whole factory while it has charge, and drains while anything needs power. Feed it element packets, Wood or Stone (belt or throw) and it burns them to charge itself (16.5s each, 19.5s when thrown in by hand; more kinds at once = faster). Charged and right beside a Forge or Cauldron, it overdrives it: +15% crafting speed. Throw a combo spell or an Elixir in to overcharge it (extra charge, +5 power for a while).' },
    heavybat: { name: 'Heavy Battery', kind: 'cell', cost: { wood: 14, stone: 10, iron: 8 }, unlock: 'heavy',
                desc: 'A Battery with a heavy core: the same power and the same charging, but it drains 33% slower, so a charge lasts 50% longer. Unlocked by Heavy Batteries in the Skill Tree.' },
    expand:   { name: 'Floor Tile', kind: 'expand', cost: { wood: 1, stone: 1 }, unlock: null,
                desc: 'Place it on the edge of the floor and throw its Wood and Stone at it (from the 29th tile on, 1 Iron too): when it is finished the tile becomes factory floor. The Stockpile never moves.' },
    splitter: { name: 'Splitter', kind: 'splitter', cost: { wood: 2, stone: 1 }, unlock: 'logistics',
                desc: 'Routes what comes in to up to 3 outputs: every side that has something to feed (the side items arrive from is the input). Share them out by %, or give an output element filters (Fire + Earth left, Water + Air right). Click it to set it up.' },
    crate:    { name: 'Storage Crate', kind: 'crate', cost: { wood: 8, stone: 4 }, unlock: 'logistics',
                desc: 'Holds up to 30 packets, spells or pickups (never raw resources) and feeds them out of its arrow side, one at a time.' },
    spawner:  { name: 'Creature Spawner', kind: 'crafter', cost: { wood: 10, stone: 8, iron: 3, shard: 1 }, unlock: null,
                desc: 'Hatches a creature Egg from the element packets fed into it: one element = a basic creature, two = a pair, three = a triple. E switches recipe. Send the Egg through the Spell Portal and the creature drops in beside the Wizard, to be fought for XP. Costs an Aether Shard to build (the starting one is free).' },
    altar:    { name: 'Summoning Altar', kind: 'crafter', cost: { stone: 14, iron: 7, shard: 6 }, unlock: 'summon',
                desc: 'Binds an Elemental Nova and Aether Shards into a Boss Sigil. Send the Sigil through the Spell Portal to summon the Primal Chimera.' },
  },
  // the one Harnesser carries any of the four elements (a crystal grows growT seconds after every switch, then shakes shakeT seconds before it starts making packets)
  harness: { growT: 15, shakeT: 1.2, order: ['air', 'water', 'fire', 'earth'], air: { cycle: 3.41, power: 2 }, water: { cycle: 5.11, power: 2 }, fire: { cycle: 5.11, power: 2 }, earth: { cycle: 6.25, power: 2 } },
  // hotbar slots: 'hand', 'belt' or a family (members cycle with Q / the wheel over the slot / pad right-trigger)
  families: {
    craft:   { name: 'Crafters',   members: ['cauldron', 'forge', 'anvil', 'altar'] },
    power:   { name: 'Power',      members: ['battery', 'heavybat'] },
    logi:    { name: 'Logistics',  members: ['splitter', 'crate'] },
    spawn:   { name: 'Creature Spawner', members: ['spawner'] },
  },
  hotbar: ['hand', 'belt', 'harness', 'craft', 'power', 'logi', 'spawn', 'expand'],
  hotkeys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'],
  recipes: {
    // machine, inputs (any mix of belt / hand / thrown), output, craft time, power draw, skill-tree node(s) that unlock it
    potion:       { machine: 'cauldron', in: { water: 2, air: 1 },              out: 'potion',  time: 6,  power: 0, tier: 'alchemy', use: 'Heals the Wizard 35 HP' },
    elixir:       { machine: 'cauldron', in: { water: 2, earth: 1, air: 1 },    out: 'elixir',  time: 9,  power: 0, tier: 'alchemy', use: 'Heals the Wizard 80 HP' },
    armor:        { machine: 'cauldron', in: { earth: 2, fire: 1 },             out: 'armor',   time: 7,  power: 0, tier: 'alchemy', use: '+35 armor for the Wizard' },
    plate:        { machine: 'cauldron', in: { earth: 3, fire: 1, water: 1 },   out: 'plate',   time: 11, power: 0, tier: 'alchemy', use: '+70 armor for the Wizard' },
    sigil:        { machine: 'altar',    in: { nova: 1, shard: 5 },             out: 'sigil',   time: 12, power: 6, tier: 'summon', use: 'Summons the Primal Chimera beside the Wizard' },
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
    { id: 'alchemy',   col: 0, icon: 'b:cauldron', name: 'Alchemy',         xp: 45, req: [], pay: { air: 10, water: 13 }, desc: 'Unlock the Alchemy Cauldron: Health Potions for the Wizard.' },
    { id: 'forge',     col: 0, icon: 'b:forge',    name: 'Elemental Forge', xp: 90, req: [], pay: { air: 15, water: 15, fire: 15 }, desc: 'Unlock the Elemental Forge. Each combo spell is then unlocked on its own.' },
    { id: 'armory',    col: 0, icon: 'b:anvil',    name: 'Armory',          xp: 68, req: [], pay: { air: 18, fire: 30, earth: 20 }, desc: 'Unlock the Armory: it forges the Wizard\'s garments (augments) from Cores, Iron and a Shard.' },
    { id: 'logistics', col: 0, icon: 'b:splitter', name: 'Logistics',       xp: 60, req: [], pay: { air: 20, water: 20, fire: 20 }, desc: 'Unlock the Splitter and the Storage Crate.' },
    { id: 'heavy',     col: 0, icon: 'battery',    name: 'Heavy Batteries', xp: 120, req: [], pay: { air: 25, water: 25, fire: 30, earth: 30, magma: 2 }, desc: 'Unlock the Heavy Battery: a Battery building that drains 33% slower, so each charge lasts 50% longer.' },
    { id: 'summon',   col: 0, icon: 'b:altar',    name: 'Summoning',       xp: 150, req: [], pay: { air: 40, water: 40, fire: 40, earth: 40 }, core: 1, desc: 'Unlock the Summoning Altar: craft a Boss Sigil and face the Primal Chimera. Needs a Warden Core from a Stronghold. Beat it to win.' },
    // col 2: Upgrades — many small tiers, cheap first, steep last
    { id: 'swift',   col: 2, icon: 'ic_fast', name: 'Swift Harnessing', per: '+12.5% harnesser speed',
      tiers: [12, 18, 25, 33, 43, 54, 65, 80],
      kinds: [['air'], ['air'], ['air', 'water'], ['air', 'water'], ['water', 'fire'], ['water', 'fire'], ['fire', 'earth'], ['air', 'water', 'fire', 'earth']],
      combos: { 6: { steam: 1 }, 7: { steam: 1, sandstorm: 1 } } },
    { id: 'manual',  col: 2, icon: 'ic_hand', name: 'Quick Hands', per: '+30% hand-harnessing speed',
      tiers: [4, 14, 28],
      kinds: [['air'], ['air'], ['air', 'water']],
      combos: {} },
    { id: 'belts',   col: 2, icon: 'belt', name: 'Swift Belts', per: '+15% belt speed',
      tiers: [15, 24, 35, 48, 62, 76],
      kinds: [['air'], ['air'], ['air', 'water'], ['water', 'fire'], ['fire', 'earth'], ['air', 'fire', 'earth']],
      combos: { 5: { flamethrower: 2 } } },
    { id: 'satchel', col: 2, icon: 'ic_bag', name: 'Bigger Satchel', per: '+1 carry space',
      tiers: [16, 26, 38, 52, 68],
      kinds: [['air'], ['air', 'water'], ['water', 'earth'], ['earth', 'fire'], ['air', 'water', 'fire', 'earth']],
      combos: { 4: { mud: 1, magma: 1 } } },
    { id: 'zoomies', col: 2, icon: 'ic_boot', name: 'Wizard Zoomies', per: '+6% Wizard speed',
      tiers: [12, 18, 26, 36, 48, 60],
      kinds: [['air'], ['air'], ['air', 'water'], ['air', 'fire'], ['air', 'earth'], ['air', 'water', 'fire']],
      combos: { 4: { tempest: 1 }, 5: { tempest: 2, thunder: 1 } } },
    { id: 'hearty',  col: 2, icon: 'ic_heart', name: 'Hearty Hat', per: '+12 max HP (and heal 12)',
      tiers: [12, 17, 23, 30, 38, 47, 60, 73],
      kinds: [['air'], ['air', 'water'], ['water'], ['water', 'earth'], ['water', 'earth'], ['water', 'fire', 'earth'], ['water', 'earth', 'fire'], ['air', 'water', 'fire', 'earth']],
      combos: { 5: { steam: 1 }, 6: { mud: 2 }, 7: { geyser: 1, blizzard: 1 } } },
    { id: 'gems',    col: 2, icon: 'ic_xp', name: 'Gem Wisdom', per: 'x1.125 on every XP gem drop chance',
      tiers: [14, 20, 27, 35, 44, 54, 62, 74],
      kinds: [['air'], ['air'], ['air', 'water'], ['water', 'fire'], ['fire'], ['fire', 'earth'], ['air', 'fire', 'earth'], ['air', 'water', 'fire', 'earth']],
      combos: { 5: { flamethrower: 1 }, 6: { magma: 2 }, 7: { meteor: 1 } } },
  ],
  // every number a delivered spell uses (WZ.cast; the skill-tree hover card reads them too).
  // dmg per hit, r radius (tiles), speed (tiles/s), life (s), splash + sr = splash damage + radius,
  // n = projectiles / targets / blasts, slow = speed taken away (0..1) for slowT seconds, t = zone time, dps in zones
  // drop = seconds of the spell's own drop-in over the Wizard before it casts (the telegraph: he sees it coming)
  // recoil = tiles an aimed spell pushes the Wizard back. dec = the mark it leaves on the ground: k kind, r x the blast radius, t seconds, a strength
  // terrain spells: Mud raises an Earth Wall (len tiles, dist tiles toward the target, t s), the Blizzard freezes bog and water into ice
  // (t s, re-freezing every s while it rages), the Geyser launches the Wizard (up to dist tiles, at least min, T s in the air, h tiles high)
  spells: {
    gust:         { drop: 0.45, r: 6, dmg: 3.6, push: 12.6, dec: { k: 'scuff', r: 0.45, t: 3, a: 0.35 } },
    fireball:     { drop: 0.55, speed: 16, life: 1.6, dmg: 30, splash: 15, sr: 1.6, recoil: 0.22, dec: { k: 'burn', r: 0.7, t: 3.2, a: 0.55 } },
    spray:        { drop: 0.5, n: 5, spread: 0.8, speed: 12, life: 0.9, dmg: 8, slow: 0.4, slowT: 2, heal: 2, recoil: 0.12, dec: { k: 'wet', r: 0.5, t: 3, a: 0.4 } },
    boulder:      { drop: 0.6, speed: 7, life: 2.5, dmg: 45, splash: 22, sr: 2.1, recoil: 0.38, dec: { k: 'crack', r: 0.75, t: 4.5, a: 0.8 } },
    flamethrower: { drop: 0.5, n: 8, spread: 0.9, speed: 14, life: 0.75, dmg: 11, recoil: 0.3, dec: { k: 'burn', r: 0.55, t: 3, a: 0.4 } },
    steam:        { drop: 0.6, r: 5.5, dmg: 25, slow: 0.5, slowT: 2.5, dec: { k: 'wet', r: 0.55, t: 4, a: 0.55 } },
    sandstorm:    { drop: 0.65, r: 5, t: 3, dps: 14, slow: 0.3, dec: { k: 'sand', r: 0.8, t: 4, a: 0.55 } },
    magma:        { drop: 0.7, speed: 10, life: 1.2, dmg: 50, splash: 50, sr: 3, recoil: 0.55, dec: { k: 'burn', r: 0.8, t: 5, a: 0.95 } },
    tempest:      { drop: 0.65, n: 5, dmg: 20, range: 12, slowR: 4, slow: 0.3, slowT: 2, dec: { k: 'scorch', r: 0.7, t: 3.5, a: 0.5 } },
    mud:          { drop: 0.55, range: 30, r: 4, t: 3, dps: 6, slow: 0.8, dec: { k: 'mud', r: 1, t: 4.5, a: 0.7 }, wall: { len: 9, dist: 3, t: 10 } },
    meteor:       { drop: 0.8, n: 8, gap: 0.22, range: 16, fall: 0.5, r: 2.2, dmg: 40, dec: { k: 'crater', r: 0.85, t: 5, a: 1 } },
    thunder:      { drop: 0.6, n: 10, dmg: 30, range: 14, dec: { k: 'scorch', r: 0.9, t: 4, a: 0.75 } },
    blizzard:     { drop: 0.7, r: 7, t: 4, dps: 16, slow: 0.6, dec: { k: 'frost', r: 0.8, t: 5, a: 0.85 }, frost: { t: 14, every: 0.1 } },
    geyser:       { drop: 0.55, n: 6, delay: 0.55, gap: 0.08, r: 1.8, dmg: 45, dec: { k: 'wet', r: 0.9, t: 4.5, a: 0.85 }, jump: { dist: 8, min: 2.5, T: 0.8, h: 2.6 } },
    nova:         { drop: 0.9, r: 8, dmg: 80, push: 30, slow: 0.5, slowT: 2, dec: { k: 'crack', r: 0.6, t: 5, a: 1 } },
  },
  // what each upgrade tier is worth
  upgrade: { swift: 0.125, manual: 0.3, belts: 0.15, satchel: 1, zoomies: 0.06, hearty: 12, gems: 0.125, magnet: 0.35 },   // gems: x(1+0.125) per tier on every gem drop chance (cap gemCap); magnet: tiles of extra pickup radius per tier
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
    phoenix:     { name: 'Cinder Phoenix',  tier: 2, order: ['fire', 'air'],          hp: 30,  speed: 2.8, dmg: 9,  rad: 0.40, gem: [1, 0.25], fly: true, ai: 'phoenix', col: '#ff9a3a', n: 2, cost: { fire: 1, air: 1 },          time: 22, power: 4, dive: { every: 4.2, wind: 0.55, time: 0.6, mul: 4, dmg: 14 }, reborn: 0.3 },
    thunderhead: { name: 'Thunderhead',     tier: 2, order: ['air', 'water'],         hp: 34,  speed: 1.0, dmg: 6,  rad: 0.45, gem: [1, 0.25], fly: true, ai: 'storm',  col: '#9aa8d8', n: 2, cost: { air: 1, water: 1 },             time: 22, power: 4, zap: { every: 4.5, n: 3, delay: 0.9, r: 1.3, dmg: 12 } },
    lavagolem:   { name: 'Lava Golem',      tier: 2, order: ['fire', 'earth'],        hp: 90,  speed: 0.8, dmg: 14, rad: 0.55, gem: [1, 0.25], ai: 'lava',   col: '#ff5a2a', n: 1, cost: { fire: 1, earth: 1 },            time: 26, power: 4, trail: { every: 0.7, r: 1.0, t: 3, dps: 9 }, blast: { r: 3.2, delay: 0.9, dmg: 24 } },
    shambler:    { name: 'Swamp Shambler',  tier: 2, order: ['earth', 'water'],       hp: 70,  speed: 1.1, dmg: 11, rad: 0.50, gem: [1, 0.25], ai: 'shambler', col: '#6a8a4a', n: 1, cost: { water: 1, earth: 1 },         time: 26, power: 4, snare: { every: 3.4, r: 1.7, t: 5, slow: 0.5 }, regen: 0.04 },
    dragon:      { name: 'Ember Dragon',    tier: 3, order: ['fire', 'air', 'earth'], hp: 220, speed: 1.6, dmg: 18, rad: 0.70, gem: [2, 0.50], ai: 'dragon', col: '#e0482a', n: 1, cost: { air: 1, fire: 1, earth: 1 },    time: 40, power: 6, breath: { every: 5.5, delay: 0.8, range: 6.5, half: 0.6, n: 9, dmg: 8, speed: 11 }, gust: { every: 8, r: 3.6, push: 10, dmg: 8 } },
    leviathan:   { name: 'Storm Leviathan', tier: 3, order: ['water', 'fire', 'air'], hp: 130, speed: 3.0, dmg: 12, rad: 0.55, gem: [2, 0.50], fly: true, ai: 'serpent', col: '#6ad0e8', n: 1, cost: { air: 1, fire: 1, water: 1 }, time: 36, power: 6, zap: { every: 4, n: 4, delay: 0.8, r: 1.3, dmg: 12 }, dive: { every: 6, wind: 0.6, time: 0.7, mul: 3.4, dmg: 12, burst: { r: 2.4, dmg: 12, slow: 0.45, slowT: 2 } } },
    titan:       { name: 'Kiln Titan',      tier: 3, order: ['fire', 'water', 'earth'], hp: 280, speed: 0.9, dmg: 20, rad: 0.75, gem: [2, 0.50], ai: 'titan', col: '#c8704a', n: 1, cost: { fire: 1, water: 1, earth: 1 },  time: 42, power: 6, cracks: [0.75, 0.5, 0.25], dr: [0.35, 0.5, 0.7, 0.9], vent: { r: 3, delay: 1.0, dmg: 18 } },
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
    recycle: 0.3,             // chance a crafted creature drops one packet of its primary element on death
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
  // ---- Strongholds: four far-off keeps, one per element, each guarded by crafted creatures and a Warden ----
  strong: {
    minDist: 70, reveal: 30, wake: 9, warnT: 10, shards: 8, gems: 12,   // warnT: seconds the Wizard must stand inside the wake radius before the guards and the Warden spawn (leaving resets it)
    arenaR: 6.5,              // the door: the arena inside this radius only opens to a Wizard who has had the keep's Ward Key sent in through the portal (the key is shown at the door)
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
  cores: { wild: 0.022, basic: 0.033, pair: 0.055, triple: 0.085, elite: [1, 1], warden: 5, boss: 4 },   // chances per normal kill / elite chunk / Warden (of its element) / Chimera (of each)
  unlockR: 9,                 // a Core or Ward Key the Builder sends only goes through the portal when the Wizard is within this many tiles of the shrine / keep it opens
  // ---- Wizard augments (js/augments.js; the table of augments is AUGS below): garments the Builder forges at the Armory. They change what he can DO, never his numbers ----
  aug: {
    wardrobeMax: 8,   // the Wardrobe Shelf by the Spell Portal grows one slot per stored garment (there are only this many garments)
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
  CFG.tree.push({ id: 'magnet', col: 2, icon: 'ic_magnet', name: 'Loot Magnet', per: '+0.35 tiles of pickup range',
    tiers: [8, 12, 18, 25, 34], pk: [6, 9, 13, 18, 24],
    kinds: [['air'], ['air', 'water'], ['water', 'earth'], ['fire', 'earth'], ['air', 'water', 'fire', 'earth']], combos: {} });
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
const KEY_NAME = el => ELEM_WORD[el] + ' Ward Key';
const isCoreKind = k => /^core_(air|water|fire|earth)$/.test(k), isKeyKind = k => /^key_(air|water|fire|earth)$/.test(k);
const RES = {
  wood:  { name: 'Wood',     color: '#a8683a' },
  stone: { name: 'Stone',    color: '#a9b0b8' },
  iron:  { name: 'Iron Ore', color: '#c4703c' },
  shard: { name: 'Aether Shard', short: 'Shard', color: '#c890ff' },   // only from landmarks and elites
  core:  { name: 'Warden Core', short: 'Core', color: '#ffd23a' },       // once per Stronghold per save; gates Spawner III and Summoning
};
// the element Cores and Ward Keys are Stockpile resources too: they fly home through the portal like shards, the Builder takes them from their piles
for (const el in ELEM) {
  RES['core_' + el] = { name: CORE_NAME[el], short: CORE_NAME[el].split(' ')[0], color: ELEM[el].color };
  RES['key_' + el] = { name: KEY_NAME(el), short: ELEM_WORD[el] + ' Key', color: ELEM[el].dark };
}
const BASIC_SPELL = { air: 'gust', fire: 'fireball', water: 'spray', earth: 'boulder' };
const SPELLS = {
  gust: 'Air Gust', fireball: 'Fireball', spray: 'Water Spray', boulder: 'Boulder',
  flamethrower: 'Flamethrower', steam: 'Steam Burst', sandstorm: 'Sandstorm', magma: 'Magma Bomb',
  tempest: 'Tempest Chain', mud: 'Mud Snare', meteor: 'Meteor Shower', thunder: 'Thunderstorm',
  blizzard: 'Blizzard', geyser: 'Geyser Eruption', nova: 'Elemental Nova',
};
// the Collection Book's text for every spell (these used to be the skill-tree node descriptions)
const SPELL_INFO = {
  gust: { desc: 'Air: a push of wind that knocks foes back and chops trees and rocks.' },
  fireball: { desc: 'Fire: a fast fireball that bursts on the first foe and burns what is near.' },
  spray: { desc: 'Water: a fan of droplets that slow foes and patch the Wizard up a little.' },
  boulder: { desc: 'Earth: a slow, heavy boulder with a big crushing burst.' },
  flamethrower: { desc: 'Air + Fire: 8 fire bolts in a cone.' },
  tempest: { desc: 'Air + Water: chain lightning to 5 foes, slows nearby.' },
  steam: { desc: 'Fire + Water: scalding burst that slows.' },
  sandstorm: { desc: 'Air + Earth: a grinding storm that follows the Wizard.' },
  magma: { desc: 'Fire + Earth: big blast that leaves burning ground.' },
  mud: { desc: 'Water + Earth: a sticky zone that nearly stops foes, behind an Earth Wall that channels them.' },
  meteor: { desc: 'Air + Fire + Earth: 8 meteors on random foes.' },
  thunder: { desc: 'Air + Fire + Water: chain lightning to 10 foes.' },
  blizzard: { desc: 'Air + Water + Earth: a freezing storm around the Wizard. Freezes bog and water into ice he can run on.' },
  geyser: { desc: 'Fire + Water + Earth: blasts under the 6 nearest foes and launches the Wizard over water and bog.' },
  nova: { desc: 'All four: a huge radial blast.' },
};
const SPELL_COL = {
  gust: '#e6f8ff', fireball: '#ff7a30', spray: '#4aa8ff', boulder: '#b58a4c',
  flamethrower: '#ff9a2b', steam: '#f4f4f8', sandstorm: '#d9b46a', magma: '#ff4a1a', tempest: '#bfe9ff', mud: '#8a5a2a',
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
    CFG.recipes['aug_' + id] = { machine: 'anvil', in: a.make.in, out: 'aug_' + id, time: a.make.time, power: 2, tier: 'armory', aug: id, use: a.verb };
  }
  ITEMS.sigil = { name: 'Boss Sigil', sigil: true, color: '#ff4a8a' };
  for (const id in CFG.creatures) ITEMS['egg_' + id] = { name: CFG.creatures[id].name + ' Egg', egg: true, creature: id, color: CFG.creatures[id].col };
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
const SPELL_KINDS = Object.keys(ITEMS).filter(k => ITEMS[k].elem || ITEMS[k].spell);   // what the Skill Portal banks
// the elements each spell carries (for weaknesses, and its tier: how hard it lands back at the Spell Portal)
const SPELL_EL = { gust: ['air'], fireball: ['fire'], spray: ['water'], boulder: ['earth'] };
for (const k in CFG.recipes) { const r = CFG.recipes[k]; if (ITEMS[r.out] && ITEMS[r.out].spell) SPELL_EL[r.out] = Object.keys(r.in); }

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
    { from: 3,  v5: 2,  icon: 'ic_portal', text: 'Throw (right-click / pad B) a packet into the Spell Portal', xp: 3, done: g => g.flags.portalHand, hint: { portal: 'spell' } },
    { from: 5,  v5: 3,  icon: 'ic_skill', text: 'Send 5 Air Pockets into the Skill Portal: spells are skill-tree currency', xp: 3, gift: { bank: { air: 4 } }, done: g => (g.bankTotal || 0) >= 5, prog: g => [g.bankTotal || 0, 5], hint: { portal: 'skill' } },
    { from: 6,  v5: 4,  icon: 'b:air', text: 'Build a second Harnesser: press 3, click a tile, then throw Wood & Stone at it', xp: 8, done: g => FA.count('harness') >= 2, hint: { build: 'harness' } },
    { from: 7,  v5: 5,  icon: 'battery', text: 'Feed the Battery: throw Air packets (or Wood or Stone) at it so it never runs flat', xp: 10, done: g => !!g.flags.fed, hint: { make: 'battery' } },
    { icon: 'egg_zephyr', text: 'Hatch Air creatures: send 3 Zephyr Wisp Eggs through the Spell Portal', xp: 8, stat: g => (g.stats.sent || {}).egg_zephyr || 0, n: 3, hint: { make: 'spawner' } },
    { v5: 6,  icon: 'b:water', text: 'Switch a Harnesser to Water: press F beside it. The new crystal grows for 15 seconds', xp: 8, gift: { bank: { water: 4 } }, done: g => G.fac.bld.some(b => b.type === 'harness' && b.done && b.el === 'water' && !FA.growing(b)), hint: { use: 'harness' } },
    { from: 11, v5: 8,  icon: 'potion', text: 'Unlock Alchemy (T), brew a Health Potion from Water and send it through the Spell Portal', xp: 12, done: g => g.flags.sent_potion, hint: { make: 'cauldron' } },
    { v5: 9,  icon: 'elixir', text: 'Keep the Wizard healthy: send 3 more Potions or Elixirs', xp: 10, gift: { stock: { wood: 12, stone: 9, iron: 6 } }, stat: g => sentN(g, 'potion', 'elixir'), n: 3, hint: { make: 'cauldron' } },
    { icon: 'egg_puddle', text: 'Hatch a Puddle Slime: feed Water to a Spawner, then send the Egg', xp: 10, stat: g => (g.stats.sent || {}).egg_puddle || 0, n: 1, hint: { make: 'spawner' } },
    { icon: 'egg_cinder', text: 'Hatch a Cinder Imp: set a Harnesser to Fire, feed a Spawner, send the Egg', xp: 10, gift: { bank: { fire: 4 } }, stat: g => (g.stats.sent || {}).egg_cinder || 0, n: 1, hint: { make: 'spawner' } },
    { from: 12, v5: 10, icon: 'b:forge', text: 'Unlock the Forge (T) and build it: it fuses element packets into combo spells', xp: 12, done: g => FA.count('forge') >= 1, hint: { make: 'forge' } },
    { v5: 11, icon: 'battery', text: 'Build a second Battery: press 5, click a tile, then throw Wood, Stone & Iron at it', xp: 8, done: g => FA.count('battery') + FA.count('heavybat') >= 2, hint: { build: 'battery' } },
    { v5: 12, icon: 'ic_bolt', text: 'Keep the power on: top a Battery up to full 3 times with packets, Wood or Stone', xp: 15, gift: { credit: { battery: 1 } }, stat: g => g.stats.charged || 0, n: 3, hint: { make: 'battery' } },
    { from: 13, v5: 13, icon: 'flamethrower', text: 'Craft a combo spell at the Forge (press E to pick Air + Fire, Air + Water...) and deliver it', xp: 15, gift: { bank: { air: 3, fire: 3 } }, done: g => g.flags.combo, hint: { combo: 2 } },
    { v5: 14, icon: 'ic_fast', text: 'Overdrive: put a charged Battery right beside a Forge or Cauldron', xp: 12, done: g => G.fac.bld.some(b => b.done && b.od), hint: { make: 'battery' } },
    { v5: 15, icon: 'steam', text: 'Deliver 6 combo spells to the Wizard (two or more elements each)', xp: 15, gift: { stock: { shard: 1 } }, stat: g => g.stats.combos || 0, n: 6, hint: { combo: 2 } },
    { from: 15, v5: 16, icon: 'b:splitter', text: 'Unlock Logistics, then build a Splitter to route packets', xp: 15, done: g => !!g.tree.logistics && G.fac.bld.some(b => b.done && !b.free && b.type === 'splitter'), hint: { make: 'splitter' } },
    { from: 16, v5: 17, icon: 'armor', text: 'Brew a Shield Potion at the Cauldron (Earth + Fire packets) and send it to the Wizard', xp: 15, done: g => g.flags.sent_armor || g.flags.sent_plate, hint: { make: 'cauldron' } },
    { v5: 18, icon: 'plate', text: 'Unlock the Armory: forge a garment from the Wizard\'s Cores and send it through the portal', xp: 20, gift: { stock: { iron: 6 } }, done: g => !!g.flags.sent_aug, hint: { make: 'anvil' } },
    { icon: 'egg_pebble', text: 'Hatch a Pebble Golem: set a Harnesser to Earth, feed a Spawner, send the Egg', xp: 12, stat: g => (g.stats.sent || {}).egg_pebble || 0, n: 1, hint: { make: 'spawner' } },
    { from: 17, v5: 19, icon: 'b:expand', text: 'Add floor: place a Floor Tile (slot 8) and throw 1 Wood + 1 Stone at it', xp: 15, done: g => (g.stats.tiles || 0) >= 1, hint: { make: 'expand' } },
    { v5: 20, icon: 'egg_zephyr', text: 'Hatch a horde: send 8 Eggs through the Spell Portal', xp: 15, gift: { bank: { air: 5, water: 5 } }, stat: g => g.stats.eggs || 0, n: 8, hint: { make: 'spawner' } },
    { from: 19, v5: 21, icon: 'meteor', text: 'Deliver a Triple spell', xp: 40, gift: { stock: { shard: 1 } }, done: g => g.flags.triple, hint: { combo: 3 } },
    { from: 20, v5: 22, icon: 'nova', text: 'Unleash the Elemental Nova', xp: 80, done: g => g.flags.sent_nova, hint: { combo: 4 } },
    { from: 23, v5: 23, icon: 'b:altar', text: 'Unlock Summoning (it costs a Warden Core) and build the Summoning Altar (it needs Aether Shards)', xp: 40, done: g => FA.count('altar') >= 1, hint: { make: 'altar' } },
    { from: 24, v5: 24, icon: 'ic_crown', text: 'Craft a Boss Sigil and send it through the Spell Portal. Then keep the right element flowing!', xp: 60, done: g => g.flags.sent_sigil, hint: { make: 'altar' } },
  ],
  W: [
    { from: 1,  icon: 'ic_hat', text: 'Stand right next to a tree. The factory\'s Air Gusts will chop it down', xp: 4, done: g => g.stats.harvested >= 1, hint: { harv: 1 } },
    { icon: 'stone', text: 'Gather 10 more Wood or Stone: stand by trees and rocks while spells land', xp: 4, stat: g => g.stats.harvested || 0, n: 10, hint: { harv: 1 } },
    { icon: 'ic_boot', text: 'Forage 3 spots: stand still next to a mound, sticks or bush and mash the roll button', xp: 6, stat: g => g.stats.foraged || 0, n: 3, hint: { forage: 1 } },
    { from: 4,  icon: 'egg_zephyr', text: 'Defeat a creature the factory made (the Spawner\'s Eggs arrive through the Spell Portal)', xp: 6, done: g => (g.stats.craftedKills || 0) >= 1, hint: { crafted: 1 } },
    { from: 8,  icon: 'ic_skull', text: 'Defeat 15 monsters', xp: 8, done: g => g.stats.kills >= 15, prog: g => [g.stats.kills, 15] },
    { icon: 'ic_shield', text: 'Dodge 3 hits: roll into an attack (you can\'t be hurt mid-roll)', xp: 8, stat: g => g.stats.dodges || 0, n: 3 },
    { icon: 'ic_tree', text: 'Open your Skill Tree (Y) and buy a Wizard upgrade: Hearty Hat or Wizard Zoomies', xp: 8, gift: { bank: { air: 3 } }, done: g => lvl('hearty') >= 1 || lvl('zoomies') >= 1, hint: { tree: 1 } },
    { icon: 'potion', text: 'Walk over 2 Potions or Shield Potions the Builder sends you', xp: 8, stat: g => g.stats.used || 0, n: 2 },
    { icon: 'ic_bolt', text: 'Hit weaknesses: finish off 10 monsters with a yellow ! hit (match the element)', xp: 12, gift: { pickup: ['potion'], stock: { core_air: 1, core_water: 1, core_fire: 1, core_earth: 1 } }, stat: g => g.stats.weakKills || 0, n: 10 },   // the Cores are for the next goal: any Shrine will take its own element's
    { icon: 'ic_flag', text: 'Claim a Shrine: stand by it and have the Builder send its element\'s Core through the portal', xp: 12, gift: { pickup: ['plate'] }, stat: g => g.stats.shrines || 0, n: 1, hint: { mark: 'shrine' } },
    { icon: 'ic_fast', text: 'Stand on a claimed Shrine for 20 seconds: that element\'s Harnessers run faster', xp: 10, stat: g => g.stats.shrineT || 0, n: 20, hint: { mark: 'myshrine' } },
    { from: 14, icon: 'ic_flag', text: 'Clear a Monster Camp or an Ancient Crypt (see the map) for Aether Shards', xp: 15, gift: { pickup: ['potion', 'plate'] }, stat: g => g.stats.clears || 0, n: 1, hint: { mark: 'camp' } },
    { icon: 'ic_skull', text: 'Defeat 60 monsters', xp: 12, done: g => g.stats.kills >= 60, prog: g => [g.stats.kills, 60] },
    { icon: 'flamethrower', text: 'Finish off 10 monsters with combo spells (two elements). Ask the Builder!', xp: 20, gift: { pickup: ['elixir'] }, stat: g => g.stats.k2 || 0, n: 10 },
    { icon: 'ic_crown', text: 'Take down an Elite (a gold ring): it drops Aether Shards and a chunk of Cores', xp: 15, gift: { pickup: ['plate'] }, stat: g => g.stats.elites || 0, n: 1 },
    { from: 18, icon: 'ic_skull', text: 'Defeat 300 monsters', xp: 40, done: g => g.stats.kills >= 300, prog: g => [g.stats.kills, 300] },
    { icon: 'ic_trophy', text: 'Survive a Wilds Event: check the card under the goals, then clear it', xp: 30, gift: { stock: { shard: 1 } }, stat: g => g.stats.events || 0, n: 1 },
    { icon: 'meteor', text: 'Wipe out 15 monsters with Triple spells (three elements)', xp: 30, gift: { pickup: ['elixir', 'plate'] }, stat: g => g.stats.k3 || 0, n: 15 },
    { from: 21, icon: 'ic_keep', text: 'Scout a Stronghold, far out in the wilds (see the map): get near to reveal its guards', xp: 20, done: g => !!g.flags.scouted, hint: { keep: 'scout' } },
    { from: 22, icon: 'core', text: 'Open a Stronghold: wear its terrain garment, have its Ward Key sent in, beat its Warden', xp: 40, done: g => (g.stats.keeps || 0) >= 1, hint: { keep: 'claim' } },
    { icon: 'nova', text: 'Blast 10 monsters with the Elemental Nova', xp: 40, gift: { pickup: ['elixir', 'plate'] }, stat: g => g.stats.k4 || 0, n: 10 },
    { from: 24, icon: 'ic_crown', text: 'Defeat the Primal Chimera! The Builder\'s Boss Sigil calls it out', xp: 150, done: g => g.flags.won, hint: { boss: 1 } },
  ],
};

