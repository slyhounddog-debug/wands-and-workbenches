'use strict';
// ===== All tuning numbers live here =====
const CFG = {
  W: 1600, H: 900, HALF: 800,
  WW: 200, WH: 200,          // wizard world
  // Everything is drawn into a low-res buffer and scaled up by P, so the whole game shares one pixel grid.
  FT: { TW: 80, TH: 40, S: 4, P: 4 },   // factory iso tile (in screen px) + sprite scale + pixel size
  WT: { TW: 60, TH: 30, S: 3, P: 3 },   // wizard world
  // factory grows through the Expansion upgrade: index = tier owned (starts at 60% of the original 26x18 area)
  factorySizes: [[20, 14], [22, 15], [23, 16], [25, 17], [26, 19], [28, 20]],
  start: { wood: 10, stone: 6, iron: 0 },
  satchel: 5,
  autosave: 9,
  beltTime: 0.9,              // seconds per tile before Swift Belts
  manual: { taps: 8 },        // hand-harnessing: taps of E to fill the meter and get one packet (the meter never fills by itself); Quick Hands adds upgrade.manual per tier to each tap
  buffer: 3,
  fuelPerPacket: 15, fuelCap: 120,
  starterSplit: 70,           // the starting Splitter: % of the Air packets that go straight to the Spell Portal (the rest feed the Spawner)
  chargeBonus: 0.10,          // every packet burns this much longer in a Charger (+10% charge)
  chargeThrowBonus: 0.20,     // ...and a packet thrown in by hand adds this much on top (+20%)
  batteryMax: 90, stationGen: 10,
  batteryLife: 60,            // seconds a Battery lasts at a full 10 power of draw; it drains in proportion to the load it carries
  chargeTipAt: 0.5,           // the first time a Battery falls below this fraction, hint at the Charger
  chargeBase: 60, chargeBoost: 1.33,
  swapHold: 1.5, swapCooldown: 5,
  builder: { speed: 5.5, accel: 42, friction: 34, radius: 0.24 },
  reach: 1.75, pickRepeat: 0.2,
  tipRadius: 3.5,            // building info panels only show within this many tiles of the Builder (or when hovered)
  portalAlpha: 0.5,          // how solid the Spell / Skill Portals are drawn (they are see-through)
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
  suck: { baseT: 0.3 },       // Spell Portal intake animation: seconds the item spends being slurped in (then it arcs out of the factory: arc.outT)
  arc: { outT: 0.24, inT: 0.42, h: 90 },   // deliveries cross the split: seconds rising out of the factory's top-right corner, seconds sailing in from the wilds' top-left onto the Wizard, extra arc height (px)
  thump: 0.36,                // a Forge / Cauldron that finishes a craft thumps (squash and stretch) this long and puffs exhaust in its elements' colours
  boing: { T: 0.55, h: 2.6, back: 0.55, min: 1.2, max: 2.8 },   // a rejected throw springs back toward the Builder: flight time, arc height, share of the way back (clamped to min..max tiles)
  // throwing a combo spell (2 / 3 / 4 elements) or an Elixir into a Battery Station that holds a Battery overcharges it: it fills by this share of a
  // Battery (up to max x a full one) and gives +power for that many seconds
  overcharge: { fill: [0, 0, 0.35, 0.6, 1], time: [0, 0, 12, 20, 30], elixir: 0.45, elixirT: 15, max: 1.5, power: 5 },
  pressure: { hit: 0.18, speed: 10, life: 1.4, range: 11, amp: 6 },   // Spell Portal shockwaves: the Wizard losing this share of max HP in one hit (also events, Wardens, the Chimera), front speed (tiles/s), seconds, reach (tiles), most jitter (px)
  // layered soundtrack (audio/music/music_<element>.js, built by tools/musicbuild): one looping layer per element, volume follows
  // G.fac.weather[el]. gain = layer volume at full; fade = seconds a layer takes to swell (time constant); curve < 1 lifts quiet
  // activity so a trickle is still audible; airFloor = Air never drops below this (it is the "song", the others build on it);
  // menu = every layer's level on the title / player screens (all four play). muffleHz / muffleT = the low-pass the music wears on
  // those screens, in the pause menu and while a skill tree is open (cutoff in Hz, seconds to glide there and back)
  music: { gain: 0.63, fade: 1.2, curve: 0.5, airFloor: 0.3, menu: 0.8, muffleHz: 2200, muffleT: 0.25 },
  weather: { tau: 30, min: 6, full: 30, ease: 0.035, shrine: 0.5 },   // wilds weather from the factory: packets/min of an element below min = clear, at full = full weather; ease = how fast it turns (per s); a claimed shrine / Portal Storm adds this much of its element
  decalMax: 70,               // spell scorch / crack / frost marks on the ground at once (each spell's dec in CFG.spells)
  bend: { r: 0.45, hold: 0.1, spring: 10, damp: 3.4, amp: 0.6, life: 1.5, bigRad: 0.45, tufts: 15000 },   // grass and flowers lean away from the Wizard and big foes, then spring back; tufts = extra grass tufts sown over the wilds
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
    // claiming a shrine: a ring shrinks onto the crystal; press when it lines up. A miss just restarts the ring
    shrineHits: 3, shrineCycle: 1.3, shrineTarget: 0.35, shrineTol: 0.11, shrineShards: 1,
    cryptHold: 1.5, cryptShards: 5, cryptMinions: 7, xpBonus: 6,
  },
  // forage spots in the wilds: the Wizard stands still at one and mashes the roll button to dig / search it.
  // drop = resources always found, bonus = chance of one more of that kind; a bush gives one pickup (potion or armor)
  forage: {
    mound:  { count: 50, taps: 10, drop: { stone: 2 }, bonus: { iron: 0.35 } },
    sticks: { count: 55, taps: 8,  drop: { wood: 3 },  bonus: { wood: 0.5 } },
    bush:   { count: 29, taps: 4,  potion: 0.6 },   // otherwise Armor Plate
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
  overdrive: 0.15,           // a charged Battery Station right beside a Forge or Cauldron: +15% crafting speed
  heavyBattery: 0.5,          // Heavy Batteries node: a Station's Battery lasts 50% longer
  crateCap: 30,
  pickups: {
    potion: { heal: 35 }, elixir: { heal: 80 },
    armor: { armor: 35 }, plate: { armor: 70 },
  },
  // costs were 50% up on the original, then cut ~30% (belts stay 1 Wood; Splitter and Sorter are 2 Wood + 1 Stone, the Sorter still wants its Shard)
  buildings: {
    air:      { name: 'Air Harnesser',   kind: 'harness', elem: 'air',   cost: { wood: 6, stone: 4 },            cycle: 3.41, power: 2, unlock: null,
                desc: 'Makes Air Pockets every 3.4s. Draws 2 power (hand-gathering is free, so the factory can always restart). Stand beside it and press E to hand-gather.' },
    water:    { name: 'Water Harnesser', kind: 'harness', elem: 'water', cost: { wood: 8, stone: 6 },           cycle: 5.11, power: 2, unlock: 'water',
                desc: 'Makes Water Drops every 5.1s. Draws 2 power (hand-gathering is free).' },
    fire:     { name: 'Fire Harnesser',  kind: 'harness', elem: 'fire',  cost: { wood: 8, stone: 4, iron: 2 },  cycle: 5.11, power: 2, unlock: 'fire',
                desc: 'Makes Fire Embers every 5.1s. Draws 2 power.' },
    earth:    { name: 'Earth Harnesser', kind: 'harness', elem: 'earth', cost: { wood: 10, stone: 8 },          cycle: 6.25, power: 2, unlock: 'earth',
                desc: 'Makes Earth Chunks every 6.25s. Draws 2 power.' },
    cauldron: { name: 'Alchemy Cauldron', kind: 'crafter', cost: { wood: 6, stone: 6 }, unlock: 'alchemy',
                desc: 'Brews Health Potions (2 Water + 1 Wood). Wood-fired, no power. Send potions through the Spell Portal: they land beside the Wizard.' },
    forge:    { name: 'Elemental Forge', kind: 'crafter', cost: { wood: 13, stone: 10, iron: 4 }, unlock: 'forge',
                desc: 'Fuses element packets into combo spells (each spell is unlocked separately) and crafts Batteries from 2 Iron Ore. Press E at it to switch recipe.' },
    anvil:    { name: 'Armor Anvil', kind: 'crafter', cost: { wood: 6, stone: 8, iron: 4 }, unlock: 'armory',
                desc: 'Hammers Iron Ore + Stone, heated by a Fire Ember, into Armor for the Wizard.' },
    station:  { name: 'Battery Station', kind: 'station', cost: { wood: 8, stone: 6, iron: 4 }, unlock: null,
                desc: 'A charged Battery here generates +10 power for the whole factory. Drains while anything needs power. Charged and right beside a Forge or Cauldron, it overdrives it: +15% crafting speed. Throw a combo spell or an Elixir in to overcharge it (extra charge, +5 power for a while).' },
    charger:  { name: 'Battery Charger', kind: 'charger', cost: { wood: 8, stone: 4, iron: 4 }, unlock: null,
                desc: 'Recharges a Battery by burning element packets as fuel (16.5s each, 19.5s when thrown in by hand). More element types = faster. Uses no electricity.' },
    splitter: { name: 'Splitter', kind: 'splitter', cost: { wood: 2, stone: 1 }, unlock: 'logistics',
                desc: 'Routes what comes in to up to 3 outputs: every side that has something to feed (the side items arrive from is the input). Share them out by %, or give an output element filters (Fire + Earth left, Water + Air right). Click it to set it up.' },
    sorter:   { name: 'Sorter', kind: 'sorter', cost: { wood: 2, stone: 1, shard: 1 }, unlock: 'logistics',
                desc: 'E while holding an item sets the filter: matching items go out the front, everything else out the sides. E with empty hands clears it.' },
    crate:    { name: 'Storage Crate', kind: 'crate', cost: { wood: 8, stone: 4 }, unlock: 'logistics',
                desc: 'Holds up to 30 packets, spells or pickups (never raw resources) and feeds them out of its arrow side, one at a time.' },
    spawner1: { name: 'Creature Spawner I', kind: 'crafter', tier: 1, cost: { wood: 10, stone: 8, iron: 3 }, unlock: null,
                desc: 'Hatches single-element creature Eggs from element packets. Send the Egg through the Spell Portal and the creature drops in beside the Wizard, to be fought for XP. E switches recipe.' },
    spawner2: { name: 'Creature Spawner II', kind: 'crafter', tier: 2, cost: { wood: 13, stone: 10, iron: 6 }, unlock: 'spawn2',
                desc: 'Hatches two-element creature Eggs: phoenix, storm cloud, lava golem, swamp shambler. Each recipe is unlocked on its own.' },
    spawner3: { name: 'Creature Spawner III', kind: 'crafter', tier: 3, cost: { wood: 17, stone: 14, iron: 8 }, unlock: 'spawn3',
                desc: 'Hatches three-element creature Eggs: dragon, storm leviathan, kiln titan. Each recipe is unlocked on its own.' },
    altar:    { name: 'Summoning Altar', kind: 'crafter', cost: { stone: 14, iron: 7, shard: 6 }, unlock: 'summon',
                desc: 'Binds an Elemental Nova and Aether Shards into a Boss Sigil. Send the Sigil through the Spell Portal to summon the Primal Chimera.' },
  },
  // hotbar slots: 'hand', 'belt' or a family (members cycle with Q / the wheel over the slot / pad right-trigger)
  families: {
    harness: { name: 'Harnessers', members: ['air', 'water', 'fire', 'earth'] },
    craft:   { name: 'Crafters',   members: ['cauldron', 'forge', 'anvil', 'altar'] },
    power:   { name: 'Power',      members: ['station', 'charger'] },
    logi:    { name: 'Logistics',  members: ['splitter', 'sorter', 'crate'] },
    spawn:   { name: 'Creature Spawners', members: ['spawner1', 'spawner2', 'spawner3'] },
  },
  hotbar: ['hand', 'belt', 'harness', 'craft', 'power', 'logi', 'spawn'],
  hotkeys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'],
  recipes: {
    // machine, inputs (any mix of belt / hand / thrown), output, craft time, power draw, skill-tree node(s) that unlock it
    potion:       { machine: 'cauldron', in: { water: 2, wood: 1 },            out: 'potion',  time: 6,  power: 0, tier: 'alchemy', use: 'Heals the Wizard 35 HP' },
    elixir:       { machine: 'cauldron', in: { water: 2, earth: 1, wood: 1 },  out: 'elixir',  time: 9,  power: 0, tier: 'alchemy', req: 'earth', use: 'Heals the Wizard 80 HP' },
    armor:        { machine: 'anvil',    in: { iron: 2, stone: 1, fire: 1 },   out: 'armor',   time: 7,  power: 0, tier: 'armory', use: '+35 armor for the Wizard' },
    plate:        { machine: 'anvil',    in: { iron: 3, stone: 2, fire: 1, earth: 1 }, out: 'plate', time: 11, power: 2, tier: 'armory', req: 'earth', use: '+70 armor for the Wizard' },
    sigil:        { machine: 'altar',    in: { nova: 1, shard: 5 },             out: 'sigil',   time: 12, power: 6, tier: 'summon', use: 'Summons the Primal Chimera beside the Wizard' },
    battery:      { machine: 'forge', in: { iron: 2 },               out: 'battery',      time: 8,  power: 3, tier: 'forge', use: 'Charge it, then slot it into a Station for power' },
    flamethrower: { machine: 'forge', in: { air: 1, fire: 1 },       out: 'flamethrower', time: 8,  power: 5, tier: 'flamethrower' },
    steam:        { machine: 'forge', in: { fire: 1, water: 1 },     out: 'steam',        time: 8,  power: 5, tier: 'steam' },
    sandstorm:    { machine: 'forge', in: { air: 1, earth: 1 },      out: 'sandstorm',    time: 8,  power: 5, tier: 'sandstorm' },
    magma:        { machine: 'forge', in: { fire: 1, earth: 1 },     out: 'magma',        time: 9,  power: 5, tier: 'magma' },
    tempest:      { machine: 'forge', in: { air: 1, water: 1 },      out: 'tempest',      time: 8,  power: 5, tier: 'tempest' },
    mud:          { machine: 'forge', in: { water: 1, earth: 1 },    out: 'mud',          time: 8,  power: 5, tier: 'mud' },
    meteor:       { machine: 'forge', in: { air: 1, fire: 1, earth: 1 },   out: 'meteor',   time: 14, power: 6, tier: 'meteor' },
    thunder:      { machine: 'forge', in: { air: 1, fire: 1, water: 1 },   out: 'thunder',  time: 14, power: 6, tier: 'thunder' },
    blizzard:     { machine: 'forge', in: { air: 1, water: 1, earth: 1 },  out: 'blizzard', time: 14, power: 6, tier: 'blizzard' },
    geyser:       { machine: 'forge', in: { fire: 1, water: 1, earth: 1 }, out: 'geyser',   time: 14, power: 6, tier: 'geyser' },
    nova:         { machine: 'forge', in: { air: 1, fire: 1, water: 1, earth: 1 }, out: 'nova', time: 20, power: 8, tier: 'nova' },
  },
  // ===== Skill tree =====
  // Every node costs XP *and* spells. Spells are banked by sending them through the Skill Portal in the factory.
  // Unlocks: { xp, pay: {kind: n} }. Upgrades: { tiers: [xp per tier], kinds: [[kinds paid that tier]], combos: {tierIndex: {spell: n}} }
  // — an upgrade tier asks for about as many element packets as XP, split across that tier's kinds.
  tree: [
    // col 0: Factory unlocks
    { id: 'water',     col: 0, icon: 'b:water',    name: 'Water Harnesser', xp: 38, pay: { air: 19 }, desc: 'Unlock the Water Harnesser.' },
    { id: 'alchemy',   col: 0, icon: 'b:cauldron', name: 'Alchemy',         xp: 45, req: ['water'], pay: { air: 10, water: 13 }, desc: 'Unlock the Alchemy Cauldron: Health Potions for the Wizard.' },
    { id: 'fire',      col: 0, icon: 'b:fire',     name: 'Fire Harnesser',  xp: 60, req: ['water'], pay: { air: 15, water: 15 }, desc: 'Unlock the Fire Harnesser.' },
    { id: 'earth',     col: 0, icon: 'b:earth',    name: 'Earth Harnesser', xp: 60, req: ['fire'], pay: { air: 10, water: 10, fire: 10 }, desc: 'Unlock the Earth Harnesser (and the Elixir / Heavy Plate recipes).' },
    { id: 'forge',     col: 0, icon: 'b:forge',    name: 'Elemental Forge', xp: 90, req: ['fire'], pay: { air: 15, water: 15, fire: 15 }, desc: 'Unlock the Elemental Forge. Each combo spell is then unlocked on its own.' },
    { id: 'armory',    col: 0, icon: 'b:anvil',    name: 'Armory',          xp: 68, req: ['earth'], pay: { air: 18, fire: 30, earth: 20 }, desc: 'Unlock the Armor Anvil: armor pickups for the Wizard.' },
    { id: 'logistics', col: 0, icon: 'b:splitter', name: 'Logistics',       xp: 60, req: ['fire'], pay: { air: 20, water: 20, fire: 20 }, desc: 'Unlock the Splitter, the Sorter (needs an Aether Shard) and the Storage Crate.' },
    { id: 'heavy',     col: 0, icon: 'battery',    name: 'Heavy Batteries', xp: 120, req: ['armory'], pay: { air: 25, water: 25, fire: 30, earth: 30, magma: 2 }, desc: 'Batteries in a Station last 50% longer before they run flat. You still haul them by hand.' },
    { id: 'summon',   col: 0, icon: 'b:altar',    name: 'Summoning',       xp: 150, req: ['nova'], pay: { air: 40, water: 40, fire: 40, earth: 40 }, core: 1, desc: 'Unlock the Summoning Altar: craft a Boss Sigil and face the Primal Chimera. Needs a Warden Core from a Stronghold. Beat it to win.' },
    // col 1: Spells (each Forge recipe on its own).
    { id: 'flamethrower', col: 1, icon: 'flamethrower', name: 'Flamethrower',  xp: 45, req: ['forge'], pay: { air: 22, fire: 23 }, desc: 'Air + Fire: 8 fire bolts in a cone.' },
    { id: 'tempest',      col: 1, icon: 'tempest',      name: 'Tempest Chain', xp: 45, req: ['forge'], pay: { air: 22, water: 23 }, desc: 'Air + Water: chain lightning to 5 foes, slows nearby.' },
    { id: 'steam',        col: 1, icon: 'steam',        name: 'Steam Burst',   xp: 45, req: ['forge'], pay: { fire: 22, water: 23 }, desc: 'Fire + Water: scalding burst that slows.' },
    { id: 'sandstorm',    col: 1, icon: 'sandstorm',    name: 'Sandstorm',     xp: 45, req: ['forge', 'earth'], pay: { air: 22, earth: 23 }, desc: 'Air + Earth: a grinding storm that follows the Wizard.' },
    { id: 'magma',        col: 1, icon: 'magma',        name: 'Magma Bomb',    xp: 45, req: ['forge', 'earth'], pay: { fire: 22, earth: 23 }, desc: 'Fire + Earth: big blast that leaves burning ground.' },
    { id: 'mud',          col: 1, icon: 'mud',          name: 'Mud Snare',     xp: 45, req: ['forge', 'earth'], pay: { water: 22, earth: 23 }, desc: 'Water + Earth: a sticky zone that nearly stops foes, behind an Earth Wall that channels them.' },
    { id: 'meteor',       col: 1, icon: 'meteor',       name: 'Meteor Shower', xp: 90, req: ['flamethrower', 'magma'], pay: { air: 20, fire: 20, earth: 20, flamethrower: 2, magma: 1 }, desc: 'Air + Fire + Earth: 8 meteors on random foes.' },
    { id: 'thunder',      col: 1, icon: 'thunder',      name: 'Thunderstorm',  xp: 90, req: ['flamethrower', 'tempest'], pay: { air: 20, fire: 20, water: 20, tempest: 2, flamethrower: 1 }, desc: 'Air + Fire + Water: chain lightning to 10 foes.' },
    { id: 'blizzard',     col: 1, icon: 'blizzard',     name: 'Blizzard',      xp: 90, req: ['tempest', 'mud'], pay: { air: 20, water: 20, earth: 20, mud: 2, tempest: 1 }, desc: 'Air + Water + Earth: a freezing storm around the Wizard. Freezes bog and water into ice he can run on.' },
    { id: 'geyser',       col: 1, icon: 'geyser',       name: 'Geyser Eruption', xp: 90, req: ['steam', 'magma'], pay: { fire: 20, water: 20, earth: 20, steam: 2, magma: 1 }, desc: 'Fire + Water + Earth: blasts under the 6 nearest foes and launches the Wizard over water and bog.' },
    { id: 'nova',         col: 1, icon: 'nova',         name: 'Elemental Nova', xp: 210, req: ['meteor', 'thunder', 'blizzard', 'geyser'], pay: { air: 50, fire: 50, water: 50, earth: 60, meteor: 1, thunder: 1, blizzard: 1, geyser: 1 }, desc: 'All four: a huge radial blast.' },
    // col 2: Upgrades — many small tiers, cheap first, steep last
    { id: 'expand',  col: 2, icon: 'ic_expand', name: 'Factory Expansion', per: 'Bigger factory floor (stockpile moves back)',
      tiers: [30, 45, 65, 85, 105],
      kinds: [['air'], ['air', 'water'], ['air', 'water', 'fire'], ['air', 'fire', 'earth'], ['air', 'water', 'fire', 'earth']],
      combos: { 3: { sandstorm: 2 }, 4: { blizzard: 1, thunder: 1 } } },
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
  costScale: { xp: 0.7, pay: 0.5 },   // the skill-tree rebalance: XP costs x0.7, banked spell costs x0.5 (applied once below, after the dev-tool overrides)
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
    minDist: 70, reveal: 30, wake: 9, shards: 8, gems: 12,
    guards: {   // creature types per element (crafted-creature types of that element, plus the Warden)
      air:   { zephyr: 4, thunderhead: 2 },
      water: { puddle: 4, shambler: 2 },
      fire:  { cinder: 4, phoenix: 1, lavagolem: 1 },
      earth: { pebble: 4, lavagolem: 1, shambler: 1 },
    },
    warden: { name: 'Warden', hp: 700, speed: 1.5, dmg: 18, rad: 0.85, slamEvery: 5, slamR: 2.2, slamDmg: 20, volleyEvery: 6.5, volleyN: 8, volleyDmg: 9 },
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
      n.xp = sx(n.xp);
      for (const k in n.pay) n.pay[k] = sp(n.pay[k]);
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
    CFG.recipes['egg_' + id] = { machine: 'spawner' + c.tier, in: c.cost, out: 'egg_' + id, time: c.time, power: c.power,
      tier: c.tier === 1 ? (c.order[0] === 'air' ? null : c.order[0]) : 'cr_' + id, use: 'Hatches a ' + c.name + ' beside the Wizard' };
  }
  const W = CFG.strong.warden;
  CFG.enemies.warden = { name: W.name, hp: W.hp, speed: W.speed, dmg: W.dmg, gem: [3, 0], w: 0, col: '#ffd23a', rad: W.rad };
  // new tree nodes: the Spawner tiers (Tier 3 costs a Warden Core), one node per pair / triple creature, and the Loot Magnet track
  const at = CFG.tree.findIndex(n => n.id === 'heavy');
  CFG.tree.splice(at, 0,
    { id: 'spawn2', col: 3, icon: 'b:spawner2', name: 'Spawner II', xp: 50, req: ['forge'], pay: { air: 8, water: 8, fire: 8 }, desc: 'Unlock the Tier 2 Creature Spawner: two-element creatures (each its own spell-style node).' },
    { id: 'spawn3', col: 3, icon: 'b:spawner3', name: 'Spawner III', xp: 105, req: ['spawn2'], pay: { air: 10, water: 10, fire: 10, earth: 10 }, core: 1, desc: 'Unlock the Tier 3 Creature Spawner: three-element creatures. Needs a Warden Core from a Stronghold.' });
  const spellOf = { phoenix: 'flamethrower', thunderhead: 'tempest', lavagolem: 'magma', shambler: 'mud', dragon: 'meteor', leviathan: 'thunder', titan: 'geyser' };
  for (const id in spellOf) {
    const c = CFG.creatures[id], pay = {};
    for (const k in c.cost) pay[k] = c.tier === 2 ? 6 : 8;
    CFG.tree.push({ id: 'cr_' + id, col: 3, icon: 'egg_' + id, name: c.name, xp: c.tier === 2 ? 30 : 60, req: [spellOf[id], 'spawn' + c.tier], pay,
      desc: 'Hatch the ' + c.name + ' (' + c.order.map(k => k[0].toUpperCase() + k.slice(1)).join(' + ') + '): needs its spell and Spawner tier.' });
  }
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
const RES = {
  wood:  { name: 'Wood',     color: '#a8683a' },
  stone: { name: 'Stone',    color: '#a9b0b8' },
  iron:  { name: 'Iron Ore', color: '#c4703c' },
  shard: { name: 'Aether Shard', short: 'Shard', color: '#c890ff' },   // only from landmarks and elites
  core:  { name: 'Warden Core', short: 'Core', color: '#ffd23a' },       // once per Stronghold per save; gates Spawner III and Summoning
};
const BASIC_SPELL = { air: 'gust', fire: 'fireball', water: 'spray', earth: 'boulder' };
const SPELLS = {
  gust: 'Air Gust', fireball: 'Fireball', spray: 'Water Spray', boulder: 'Boulder',
  flamethrower: 'Flamethrower', steam: 'Steam Burst', sandstorm: 'Sandstorm', magma: 'Magma Bomb',
  tempest: 'Tempest Chain', mud: 'Mud Snare', meteor: 'Meteor Shower', thunder: 'Thunderstorm',
  blizzard: 'Blizzard', geyser: 'Geyser Eruption', nova: 'Elemental Nova',
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
  ITEMS.battery = { name: 'Battery', color: '#3ad06b', stack: 1 };
  ITEMS.potion = { name: 'Health Potion', pickup: true, color: '#ff4a6a' };
  ITEMS.elixir = { name: 'Greater Elixir', pickup: true, color: '#ff8ad8' };
  ITEMS.armor = { name: 'Armor Plate', pickup: true, color: '#b8c8e0' };
  ITEMS.plate = { name: 'Heavy Plate', pickup: true, color: '#7aa0ff' };
  ITEMS.sigil = { name: 'Boss Sigil', sigil: true, color: '#ff4a8a' };
  for (const id in CFG.creatures) ITEMS['egg_' + id] = { name: CFG.creatures[id].name + ' Egg', egg: true, creature: id, color: CFG.creatures[id].col };
  for (const k in CFG.recipes) {
    const r = CFG.recipes[k];
    if (r.machine === 'forge' && r.out !== 'battery') ITEMS[r.out] = { name: SPELLS[r.out], spell: true, color: SPELL_COL[r.out] };
  }
})();
const itemName = k => (ITEMS[k] ? ITEMS[k].name : k);
const recipeName = id => itemName(CFG.recipes[id].out);
// what a recipe's product is for (spells reuse their skill-tree blurb minus the "Air + Fire:" prefix)
const recipeUse = id => {
  const r = CFG.recipes[id];
  if (r.use) return r.use;
  const n = CFG.tree.find(t => t.id === id);
  return n ? n.desc.replace(/^[^:]*:\s*/, '') : '';
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
//    practice goals ("charge 3 Batteries") really ask for fresh work. The bar is automatic.
//  - `hint` tells main.js what to point at: a pile, a portal, a building to use or build (`make`), the skill tree, the nearest
//    tree / landmark / forage spot in the wilds, or the boss.
//  - `from` = the index of the goal in the old single chain (v4) this one continues, so older saves land in the right place
//    (Main.splitQuest, QUEST_VERSION in main.js). New goals carry no `from`.
const QUEST_SIDES = ['B', 'W'];
const QUEST_NAME = { B: 'BUILDER', W: 'WIZARD' };
const sentN = (g, ...ks) => ks.reduce((a, k) => a + ((g.stats.sent || {})[k] || 0), 0);
const QUESTS = {
  B: [
    { from: 0,  icon: 'wood',  text: 'Walk to the Stockpile and left-click (pad A) to grab some Wood', xp: 2, done: g => g.flags.tookPile, hint: { pile: 'wood' } },
    { from: 2,  icon: 'air',   text: 'Stand by the Air Harnesser: press E to hand-gather, then keep tapping E to fill the meter', xp: 3, done: g => g.flags.gathered, hint: { use: 'air' } },
    { from: 3,  icon: 'ic_portal', text: 'Throw (right-click / pad B) a packet into the Spell Portal', xp: 3, done: g => g.flags.portalHand, hint: { portal: 'spell' } },
    { from: 5,  icon: 'ic_skill', text: 'Send 5 Air Pockets into the Skill Portal: spells are skill-tree currency', xp: 3, gift: { bank: { air: 4 } }, done: g => (g.bankTotal || 0) >= 5, prog: g => [g.bankTotal || 0, 5], hint: { portal: 'skill' } },
    { from: 6,  icon: 'b:air', text: 'Build a second Air Harnesser: press 3, click a tile, then throw Wood & Stone at it', xp: 8, done: g => FA.count('air') >= 2, hint: { build: 'air' } },
    { from: 7,  icon: 'battery', text: 'Recharge the spare Battery: throw element packets at the Charger', xp: 10, done: g => !!g.flags.recharged, hint: { make: 'charger' } },
    { from: 9,  icon: 'ic_tree', text: 'Unlock the Water Harnesser in the Skill Tree (T). It costs XP + Air Pockets', xp: 5, done: g => !!g.tree.water, hint: { tree: 1 } },
    { from: 10, icon: 'b:water', text: 'Build a Water Harnesser', xp: 8, gift: { bank: { water: 4 } }, done: g => FA.count('water') >= 1, hint: { make: 'water' } },
    { from: 11, icon: 'potion', text: 'Unlock Alchemy, brew a Health Potion and send it through the Spell Portal', xp: 12, done: g => g.flags.sent_potion, hint: { make: 'cauldron' } },
    { icon: 'elixir', text: 'Keep the Wizard healthy: send 3 more Potions or Elixirs', xp: 10, gift: { stock: { wood: 12, stone: 9, iron: 6 } }, stat: g => sentN(g, 'potion', 'elixir'), n: 3, hint: { make: 'cauldron' } },
    { from: 12, icon: 'b:forge', text: 'Build the Elemental Forge', xp: 12, done: g => FA.count('forge') >= 1, hint: { make: 'forge' } },
    { icon: 'battery', text: 'Craft a Battery at the Forge (press E at it to pick the recipe)', xp: 8, stat: g => (g.stats.made || {}).battery || 0, n: 1, hint: { make: 'forge' } },
    { icon: 'ic_bolt', text: 'Charge 3 Batteries: swap flat ones into the Charger and feed it packets', xp: 15, gift: { credit: { station: 1 } }, stat: g => g.stats.charged || 0, n: 3, hint: { make: 'charger' } },
    { from: 13, icon: 'flamethrower', text: 'Unlock a combo spell and deliver it from the Forge', xp: 15, gift: { bank: { air: 3, fire: 3 } }, done: g => g.flags.combo, hint: { combo: 2 } },
    { icon: 'ic_fast', text: 'Overdrive: put a charged Battery Station right beside a Forge or Cauldron', xp: 12, done: g => G.fac.bld.some(b => b.done && b.od), hint: { make: 'station' } },
    { icon: 'steam', text: 'Deliver 6 combo spells to the Wizard (two or more elements each)', xp: 15, gift: { stock: { shard: 1 } }, stat: g => g.stats.combos || 0, n: 6, hint: { combo: 2 } },
    { from: 15, icon: 'b:splitter', text: 'Unlock Logistics, then build a Splitter or Sorter to route packets', xp: 15, done: g => !!g.tree.logistics && G.fac.bld.some(b => b.done && !b.free && (b.type === 'splitter' || b.type === 'sorter')), hint: { make: 'splitter' } },
    { from: 16, icon: 'armor', text: 'Unlock the Armory and send Armor to the Wizard', xp: 15, done: g => g.flags.sent_armor || g.flags.sent_plate, hint: { make: 'anvil' } },
    { icon: 'plate', text: 'Plate up the Wizard: send 4 more Armor or Heavy Plates', xp: 12, gift: { stock: { iron: 6 } }, stat: g => sentN(g, 'armor', 'plate'), n: 4, hint: { make: 'anvil' } },
    { from: 17, icon: 'ic_expand', text: 'Expand the factory floor once', xp: 15, done: g => (g.tree.expand || 0) >= 1, hint: { tree: 1 } },
    { icon: 'egg_zephyr', text: 'Hatch a horde: send 8 Eggs through the Spell Portal', xp: 15, gift: { bank: { air: 5, water: 5 } }, stat: g => g.stats.eggs || 0, n: 8, hint: { make: 'spawner1' } },
    { from: 19, icon: 'meteor', text: 'Deliver a Triple spell', xp: 40, gift: { stock: { shard: 1 } }, done: g => g.flags.triple, hint: { combo: 3 } },
    { from: 20, icon: 'nova', text: 'Unleash the Elemental Nova', xp: 80, done: g => g.flags.sent_nova, hint: { combo: 4 } },
    { from: 23, icon: 'b:altar', text: 'Unlock Summoning (it costs a Warden Core) and build the Summoning Altar (it needs Aether Shards)', xp: 40, done: g => FA.count('altar') >= 1, hint: { make: 'altar' } },
    { from: 24, icon: 'ic_crown', text: 'Craft a Boss Sigil and send it through the Spell Portal. Then keep the right element flowing!', xp: 60, done: g => g.flags.sent_sigil, hint: { make: 'altar' } },
  ],
  W: [
    { from: 1,  icon: 'ic_hat', text: 'Stand right next to a tree. The factory\'s Air Gusts will chop it down', xp: 4, done: g => g.stats.harvested >= 1, hint: { harv: 1 } },
    { icon: 'stone', text: 'Gather 10 more Wood or Stone: stand by trees and rocks while spells land', xp: 4, stat: g => g.stats.harvested || 0, n: 10, hint: { harv: 1 } },
    { icon: 'ic_boot', text: 'Forage 3 spots: stand still next to a mound, sticks or bush and mash the roll button', xp: 6, stat: g => g.stats.foraged || 0, n: 3, hint: { forage: 1 } },
    { from: 4,  icon: 'egg_zephyr', text: 'Defeat a creature the factory made (the Spawner\'s Eggs arrive through the Spell Portal)', xp: 6, done: g => (g.stats.craftedKills || 0) >= 1, hint: { crafted: 1 } },
    { from: 8,  icon: 'ic_skull', text: 'Defeat 15 monsters', xp: 8, done: g => g.stats.kills >= 15, prog: g => [g.stats.kills, 15] },
    { icon: 'ic_shield', text: 'Dodge 3 hits: roll into an attack (you can\'t be hurt mid-roll)', xp: 8, stat: g => g.stats.dodges || 0, n: 3 },
    { icon: 'ic_tree', text: 'Open your Skill Tree (Y) and buy a Wizard upgrade: Hearty Hat or Wizard Zoomies', xp: 8, gift: { bank: { air: 3 } }, done: g => lvl('hearty') >= 1 || lvl('zoomies') >= 1, hint: { tree: 1 } },
    { icon: 'potion', text: 'Walk over 2 Potions or Armor Plates the Builder sends you', xp: 8, stat: g => g.stats.used || 0, n: 2 },
    { icon: 'ic_bolt', text: 'Hit weaknesses: finish off 10 monsters with a yellow ! hit (match the element)', xp: 12, gift: { pickup: ['potion'] }, stat: g => g.stats.weakKills || 0, n: 10 },
    { icon: 'ic_flag', text: 'Claim a Shrine: stand in its ring and press roll when the shrinking ring meets the target', xp: 12, gift: { pickup: ['plate'] }, stat: g => g.stats.shrines || 0, n: 1, hint: { mark: 'shrine' } },
    { icon: 'ic_fast', text: 'Stand on a claimed Shrine for 20 seconds: that element\'s Harnessers run faster', xp: 10, stat: g => g.stats.shrineT || 0, n: 20, hint: { mark: 'myshrine' } },
    { from: 14, icon: 'ic_flag', text: 'Clear a Monster Camp or an Ancient Crypt (see the map) for Aether Shards', xp: 15, gift: { pickup: ['potion', 'plate'] }, stat: g => g.stats.clears || 0, n: 1, hint: { mark: 'camp' } },
    { icon: 'ic_skull', text: 'Defeat 60 monsters', xp: 12, done: g => g.stats.kills >= 60, prog: g => [g.stats.kills, 60] },
    { icon: 'flamethrower', text: 'Finish off 10 monsters with combo spells (two elements). Ask the Builder!', xp: 20, gift: { pickup: ['elixir'] }, stat: g => g.stats.k2 || 0, n: 10 },
    { icon: 'ic_crown', text: 'Take down an Elite (the ones with a gold ring). They drop extra Aether Shards', xp: 15, gift: { pickup: ['plate'] }, stat: g => g.stats.elites || 0, n: 1 },
    { from: 18, icon: 'ic_skull', text: 'Defeat 300 monsters', xp: 40, done: g => g.stats.kills >= 300, prog: g => [g.stats.kills, 300] },
    { icon: 'ic_trophy', text: 'Survive a Wilds Event: check the card under the goals, then clear it', xp: 30, gift: { stock: { shard: 1 } }, stat: g => g.stats.events || 0, n: 1 },
    { icon: 'meteor', text: 'Wipe out 15 monsters with Triple spells (three elements)', xp: 30, gift: { pickup: ['elixir', 'plate'] }, stat: g => g.stats.k3 || 0, n: 15 },
    { from: 21, icon: 'ic_keep', text: 'Scout a Stronghold, far out in the wilds (see the map): get near to reveal its guards', xp: 20, done: g => !!g.flags.scouted, hint: { keep: 'scout' } },
    { from: 22, icon: 'core', text: 'Defeat a Stronghold\'s Warden and guards to claim it: Aether Shards and a Warden Core', xp: 40, done: g => (g.stats.keeps || 0) >= 1, hint: { keep: 'claim' } },
    { icon: 'nova', text: 'Blast 10 monsters with the Elemental Nova', xp: 40, gift: { pickup: ['elixir', 'plate'] }, stat: g => g.stats.k4 || 0, n: 10 },
    { from: 24, icon: 'ic_crown', text: 'Defeat the Primal Chimera! The Builder\'s Boss Sigil calls it out', xp: 150, done: g => g.flags.won, hint: { boss: 1 } },
  ],
};

