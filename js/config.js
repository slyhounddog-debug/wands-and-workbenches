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
  gatherExtra: 2.5, crankBoost: 0.4,
  buffer: 3,
  fuelPerPacket: 15, fuelCap: 120,
  batteryMax: 90, stationGen: 10, stationDrain: 1,
  chargeBase: 60, chargeBoost: 1.33,
  swapHold: 1.5, swapCooldown: 5,
  builder: { speed: 5.5, accel: 42, friction: 34, radius: 0.24 },
  reach: 1.75, pickRepeat: 0.2,
  tipRadius: 3.5,            // building info panels only show within this many tiles of the Builder (or when hovered)
  inputBuffer: 0.1,          // pick / use / place / roll presses that can't happen yet keep trying this long
  sweepRepeat: 0.07,         // holding pick sweeps up identical nearby items this fast
  throwStackGap: 0.05,       // seconds between items when throwing a whole stack (Shift + right-click / LT + B)
  graceTime: 1,              // after the skill tree closes, the game waits this long ("And...") before resuming
  bankUndoMax: 200,          // how many Skill Portal deposits the tree's undo remembers
  stateSoundR: 7,            // machines within this many tiles of the Builder chirp when their state changes
  throwRange: 6.5, throwRepeat: 0.15,
  portalGap: 0.22,
  wizard: {
    hp: 100, speed: 6.5, accel: 48, friction: 40, radius: 0.3,
    rollTime: 0.45, rollSpeed: 2.3, rollCd: 1.1, armorMax: 100, dodgeCd: 0.3,
  },
  world: {
    respawn: 120, vacuum: 2, minSpawnDist: 8,
    spawnStart: 2.1, spawnMul: 0.96, spawnFloor: 0.55, cap: 160,
    ringMin: 19, ringMax: 26, hpPerMin: 0.12, touchCd: 0.9,
    sepPad: 0.12, sepForce: 4,  // monsters keep (rad + rad + sepPad) apart so packs stay readable
    slowTerrain: 0.55,        // speed multiplier on bog tiles (wizard + monsters); water can't be entered at all
  },
  harvest: {      // node counts are 50% up on the original 60/35/25
    tree: { hp: 20, drop: 'wood', n: 3, count: 90 },
    rock: { hp: 30, drop: 'stone', n: 3, count: 53 },
    ore:  { hp: 40, drop: 'iron', n: 2, count: 37 },
  },
  enemies: {      // XP is a third of the original 3/4/5. w = spawn weight anywhere; biome foes (w: 0) spawn by terrain
    slime:  { name: 'Slime',        hp: 14, speed: 2.2, dmg: 7, xp: 1,    w: 50, col: '#6fd36b' },
    shroom: { name: 'Shroom Grump', hp: 22, speed: 1.7, dmg: 9, xp: 4 / 3, w: 30, col: '#d8403a' },
    sprite: { name: 'Spark Sprite', hp: 10, speed: 3.4, dmg: 6, xp: 5 / 3, w: 20, col: '#ffd93b' },
    imp:    { name: 'Ember Imp',    hp: 18, speed: 2.6, dmg: 8,  xp: 5 / 3,  w: 0, col: '#ff7a30', weak: 'water', resist: 'fire' },
    lurker: { name: 'Bog Lurker',   hp: 30, speed: 1.5, dmg: 10, xp: 2,      w: 0, col: '#6a8a3a', weak: 'fire',  resist: 'water' },
    wisp:   { name: 'Gale Wisp',    hp: 14, speed: 3.6, dmg: 7,  xp: 2,      w: 0, col: '#c8efff', weak: 'earth', resist: 'air' },
    golem:  { name: 'Stone Golem',  hp: 60, speed: 1.2, dmg: 14, xp: 10 / 3, w: 0, col: '#a9b0b8', weak: 'air',   resist: 'earth' },
    boss:   { name: 'Primal Chimera', hp: 4200, speed: 1.6, dmg: 20, xp: 150, w: 0, col: '#ff4a8a', rad: 1.2 },
  },
  // spell damage vs a foe's weak / resisted element (combo spells count every element they contain)
  weakMul: 2, resistMul: 0.5,
  // pity: after this many elites in a row without the bonus shard, the next one has it
  elite: { hp: 5, speed: 0.85, dmg: 1.5, xp: 6, shardBonus: 0.35, pity: 3, minTime: 90, base: 0.015, perMin: 0.004, perDist: 0.02, max: 0.08 },
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
    mound:  { count: 45, taps: 10, drop: { stone: 2 }, bonus: { iron: 0.35 } },
    sticks: { count: 50, taps: 8,  drop: { wood: 3 },  bonus: { wood: 0.5 } },
    bush:   { count: 26, taps: 4,  potion: 0.6 },   // otherwise Armor Plate
    reach: 1.15, decay: 2.5, respawn: 150, bushRespawn: 240,
  },
  overdrive: 0.15,            // a charged Battery Station right beside a Forge or Cauldron: +15% crafting speed
  heavyBattery: 0.5,          // Heavy Batteries node: a Station's Battery lasts 50% longer
  crateCap: 30,
  pickups: {
    potion: { heal: 35 }, elixir: { heal: 80 },
    armor: { armor: 35 }, plate: { armor: 70 },
  },
  // costs are 50% up on the original (belts stay 1 Wood)
  buildings: {
    air:      { name: 'Air Harnesser',   kind: 'harness', elem: 'air',   cost: { wood: 9, stone: 6 },            cycle: 3.75, power: 2, unlock: null,
                desc: 'Makes Air Pockets every 3.75s. Draws 2 power (hand-gathering is free, so the factory can always restart). Stand beside it and press E to hand-gather.' },
    water:    { name: 'Water Harnesser', kind: 'harness', elem: 'water', cost: { wood: 12, stone: 9 },           cycle: 5.625, power: 2, unlock: 'water',
                desc: 'Makes Water Drops every 5.6s. Draws 2 power (hand-gathering is free).' },
    fire:     { name: 'Fire Harnesser',  kind: 'harness', elem: 'fire',  cost: { wood: 12, stone: 6, iron: 3 },  cycle: 5.625, power: 2, unlock: 'fire',
                desc: 'Makes Fire Embers every 5.6s. Draws 2 power.' },
    earth:    { name: 'Earth Harnesser', kind: 'harness', elem: 'earth', cost: { wood: 15, stone: 12 },          cycle: 6.875, power: 2, unlock: 'earth',
                desc: 'Makes Earth Chunks every 6.9s. Draws 2 power.' },
    cauldron: { name: 'Alchemy Cauldron', kind: 'crafter', cost: { wood: 9, stone: 9 }, unlock: 'alchemy',
                desc: 'Brews Health Potions (2 Water + 1 Wood). Wood-fired, no power. Send potions through the Spell Portal: they land beside the Wizard.' },
    forge:    { name: 'Elemental Forge', kind: 'crafter', cost: { wood: 18, stone: 15, iron: 6 }, unlock: 'forge',
                desc: 'Fuses element packets into combo spells (each spell is unlocked separately) and crafts Batteries from 2 Iron Ore. Press E at it to switch recipe.' },
    anvil:    { name: 'Armor Anvil', kind: 'crafter', cost: { wood: 9, stone: 12, iron: 6 }, unlock: 'armory',
                desc: 'Hammers Iron Ore + Stone, heated by a Fire Ember, into Armor for the Wizard.' },
    station:  { name: 'Battery Station', kind: 'station', cost: { wood: 12, stone: 9, iron: 5 }, unlock: null,
                desc: 'A charged Battery here generates +10 power for the whole factory. Drains while anything needs power. Charged and right beside a Forge or Cauldron, it overdrives it: +15% crafting speed.' },
    charger:  { name: 'Battery Charger', kind: 'charger', cost: { wood: 12, stone: 6, iron: 5 }, unlock: null,
                desc: 'Recharges a Battery by burning element packets as fuel (15s each). More element types = faster. Uses no electricity.' },
    splitter: { name: 'Splitter', kind: 'splitter', cost: { wood: 6, stone: 3 }, unlock: 'logistics',
                desc: 'Takes items from behind and deals them out of its front, left and right sides in turn. Blocked sides are skipped. Press E at it to turn it.' },
    sorter:   { name: 'Sorter', kind: 'sorter', cost: { wood: 6, stone: 4, iron: 2, shard: 1 }, unlock: 'logistics',
                desc: 'E while holding an item sets the filter: matching items go out the front, everything else out the sides. E with empty hands clears it.' },
    crate:    { name: 'Storage Crate', kind: 'crate', cost: { wood: 12, stone: 6 }, unlock: 'logistics',
                desc: 'Holds up to 30 packets, spells or pickups (never raw resources) and feeds them out of its arrow side, one at a time.' },
    altar:    { name: 'Summoning Altar', kind: 'crafter', cost: { stone: 20, iron: 10, shard: 6 }, unlock: 'summon',
                desc: 'Binds an Elemental Nova and Aether Shards into a Boss Sigil. Send the Sigil through the Spell Portal to summon the Primal Chimera.' },
  },
  hotbar: ['hand', 'belt', 'air', 'water', 'fire', 'earth', 'cauldron', 'forge', 'anvil', 'station', 'charger', 'splitter', 'sorter', 'crate', 'altar'],
  hotkeys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'KeyZ', 'KeyC', 'KeyV'],
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
    { id: 'summon',   col: 0, icon: 'b:altar',    name: 'Summoning',       xp: 150, req: ['nova'], pay: { air: 40, water: 40, fire: 40, earth: 40 }, desc: 'Unlock the Summoning Altar: craft a Boss Sigil and face the Primal Chimera. Beat it to win.' },
    // col 1: Spells (each Forge recipe on its own).
    { id: 'flamethrower', col: 1, icon: 'flamethrower', name: 'Flamethrower',  xp: 45, req: ['forge'], pay: { air: 22, fire: 23 }, desc: 'Air + Fire: 8 fire bolts in a cone.' },
    { id: 'tempest',      col: 1, icon: 'tempest',      name: 'Tempest Chain', xp: 45, req: ['forge'], pay: { air: 22, water: 23 }, desc: 'Air + Water: chain lightning to 5 foes, slows nearby.' },
    { id: 'steam',        col: 1, icon: 'steam',        name: 'Steam Burst',   xp: 45, req: ['forge'], pay: { fire: 22, water: 23 }, desc: 'Fire + Water: scalding burst that slows.' },
    { id: 'sandstorm',    col: 1, icon: 'sandstorm',    name: 'Sandstorm',     xp: 45, req: ['forge', 'earth'], pay: { air: 22, earth: 23 }, desc: 'Air + Earth: a grinding storm that follows the Wizard.' },
    { id: 'magma',        col: 1, icon: 'magma',        name: 'Magma Bomb',    xp: 45, req: ['forge', 'earth'], pay: { fire: 22, earth: 23 }, desc: 'Fire + Earth: big blast that leaves burning ground.' },
    { id: 'mud',          col: 1, icon: 'mud',          name: 'Mud Snare',     xp: 45, req: ['forge', 'earth'], pay: { water: 22, earth: 23 }, desc: 'Water + Earth: a sticky zone that nearly stops foes.' },
    { id: 'meteor',       col: 1, icon: 'meteor',       name: 'Meteor Shower', xp: 90, req: ['flamethrower', 'magma'], pay: { air: 20, fire: 20, earth: 20, flamethrower: 2, magma: 1 }, desc: 'Air + Fire + Earth: 8 meteors on random foes.' },
    { id: 'thunder',      col: 1, icon: 'thunder',      name: 'Thunderstorm',  xp: 90, req: ['flamethrower', 'tempest'], pay: { air: 20, fire: 20, water: 20, tempest: 2, flamethrower: 1 }, desc: 'Air + Fire + Water: chain lightning to 10 foes.' },
    { id: 'blizzard',     col: 1, icon: 'blizzard',     name: 'Blizzard',      xp: 90, req: ['tempest', 'mud'], pay: { air: 20, water: 20, earth: 20, mud: 2, tempest: 1 }, desc: 'Air + Water + Earth: a freezing storm around the Wizard.' },
    { id: 'geyser',       col: 1, icon: 'geyser',       name: 'Geyser Eruption', xp: 90, req: ['steam', 'magma'], pay: { fire: 20, water: 20, earth: 20, steam: 2, magma: 1 }, desc: 'Fire + Water + Earth: blasts under the 6 nearest foes.' },
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
    { id: 'gems',    col: 2, icon: 'ic_xp', name: 'Gem Wisdom', per: '+12.5% XP from kills',
      tiers: [14, 20, 27, 35, 44, 54, 62, 74],
      kinds: [['air'], ['air'], ['air', 'water'], ['water', 'fire'], ['fire'], ['fire', 'earth'], ['air', 'fire', 'earth'], ['air', 'water', 'fire', 'earth']],
      combos: { 5: { flamethrower: 1 }, 6: { magma: 2 }, 7: { meteor: 1 } } },
  ],
  // every number a delivered spell uses (WZ.cast; the skill-tree hover card reads them too).
  // dmg per hit, r radius (tiles), speed (tiles/s), life (s), splash + sr = splash damage + radius,
  // n = projectiles / targets / blasts, slow = speed taken away (0..1) for slowT seconds, t = zone time, dps in zones
  spells: {
    gust:         { r: 6, dmg: 3.6, push: 12.6 },
    fireball:     { speed: 16, life: 1.6, dmg: 30, splash: 15, sr: 1.6 },
    spray:        { n: 5, spread: 0.8, speed: 12, life: 0.9, dmg: 8, slow: 0.4, slowT: 2, heal: 2 },
    boulder:      { speed: 7, life: 2.5, dmg: 45, splash: 22, sr: 2.1 },
    flamethrower: { n: 8, spread: 0.9, speed: 14, life: 0.75, dmg: 11 },
    steam:        { r: 5.5, dmg: 25, slow: 0.5, slowT: 2.5 },
    sandstorm:    { r: 5, t: 3, dps: 14, slow: 0.3 },
    magma:        { speed: 10, life: 1.2, dmg: 50, splash: 50, sr: 3 },
    tempest:      { n: 5, dmg: 20, range: 12, slowR: 4, slow: 0.3, slowT: 2 },
    mud:          { range: 30, r: 4, t: 3, dps: 6, slow: 0.8 },
    meteor:       { n: 8, gap: 0.22, range: 16, fall: 0.5, r: 2.2, dmg: 40 },
    thunder:      { n: 10, dmg: 30, range: 14 },
    blizzard:     { r: 7, t: 4, dps: 16, slow: 0.6 },
    geyser:       { n: 6, delay: 0.55, gap: 0.08, r: 1.8, dmg: 45 },
    nova:         { r: 8, dmg: 80, push: 30, slow: 0.5, slowT: 2 },
  },
  // what each upgrade tier is worth
  upgrade: { swift: 0.125, belts: 0.15, satchel: 1, zoomies: 0.06, hearty: 12, gems: 0.125 },
  firstTierPay: 0.5,          // tier 1 of every upgrade track asks for half the usual spells
};
// the dev tool's Variables tab (overrides/tuning.js) lands here, before anything below derives from CFG
if (window.OV) OV.tune(CFG, window.TUNING);

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

// Guided goals: shared by both players, each pays XP. `icon` is a sprite key.
// `hint` tells main.js what to point at: a pile, a portal, a building to use or build (`make`), the skill tree,
// the nearest tree / landmark in the wilds, or the boss. Saves made before goals 14-15 existed have quest
// indexes shifted on load (QUEST_VERSION in main.js).
const QUESTS = [
  { icon: 'wood',  text: 'Builder: walk to the Stockpile and left-click (pad A) to grab some Wood', xp: 2, done: g => g.flags.tookPile, hint: { pile: 'wood' } },
  { icon: 'ic_hat', text: 'Wizard: stand right next to a tree. The factory\'s Air Gusts will chop it down', xp: 4, done: g => g.stats.harvested >= 1, hint: { harv: 1 } },
  { icon: 'air',   text: 'Builder: stand by the Air Harnesser, press E to hand-gather, then tap E to crank it faster', xp: 3, done: g => g.flags.gathered, hint: { use: 'air' } },
  { icon: 'ic_portal', text: 'Builder: throw (right-click / pad B) a packet into the Spell Portal', xp: 3, done: g => g.flags.portalHand, hint: { portal: 'spell' } },
  { icon: 'ic_skill', text: 'Send Air Pockets into the Skill Portal: spells are skill-tree currency', xp: 3, done: g => (g.bankTotal || 0) >= 5, prog: g => [g.bankTotal || 0, 5], hint: { portal: 'skill' } },
  { icon: 'b:air', text: 'Build a second Air Harnesser (press 3, click a tile, then throw Wood & Stone at it)', xp: 8, done: g => FA.count('air') >= 2, hint: { build: 'air' } },
  { icon: 'battery', text: 'Recharge the Battery: carry it from the Station to the Charger, then throw element packets at the Charger', xp: 10, done: g => !!g.flags.recharged, hint: { make: 'charger' } },
  { icon: 'ic_skull', text: 'Defeat 15 monsters', xp: 8, done: g => g.stats.kills >= 15, prog: g => [g.stats.kills, 15] },
  { icon: 'ic_tree', text: 'Unlock the Water Harnesser in the Skill Tree (T or Y). It costs XP + Air Pockets', xp: 5, done: g => !!g.tree.water, hint: { tree: 1 } },
  { icon: 'b:water', text: 'Build a Water Harnesser', xp: 8, done: g => FA.count('water') >= 1, hint: { make: 'water' } },
  { icon: 'potion', text: 'Unlock Alchemy, brew a Health Potion and send it through the Spell Portal', xp: 12, done: g => g.flags.sent_potion, hint: { make: 'cauldron' } },
  { icon: 'b:forge', text: 'Build the Elemental Forge', xp: 12, done: g => FA.count('forge') >= 1, hint: { make: 'forge' } },
  { icon: 'flamethrower', text: 'Unlock a combo spell and deliver it from the Forge', xp: 15, done: g => g.flags.combo, hint: { combo: 2 } },
  { icon: 'ic_flag', text: 'Wizard: claim a landmark (camp, shrine or crypt, see the map) for Aether Shards', xp: 15, done: g => (g.stats.landmarks || 0) >= 1, hint: { mark: 1 } },
  { icon: 'b:splitter', text: 'Unlock Logistics, then build a Splitter or Sorter to route packets', xp: 15, done: g => FA.count('splitter') + FA.count('sorter') >= 1, hint: { make: 'splitter' } },
  { icon: 'armor', text: 'Unlock the Armory and send Armor to the Wizard', xp: 15, done: g => g.flags.sent_armor || g.flags.sent_plate, hint: { make: 'anvil' } },
  { icon: 'ic_expand', text: 'Expand the factory floor once', xp: 15, done: g => (g.tree.expand || 0) >= 1, hint: { tree: 1 } },
  { icon: 'ic_skull', text: 'Defeat 300 monsters', xp: 40, done: g => g.stats.kills >= 300, prog: g => [g.stats.kills, 300] },
  { icon: 'meteor', text: 'Deliver a Triple spell', xp: 40, done: g => g.flags.triple, hint: { combo: 3 } },
  { icon: 'nova', text: 'Unleash the Elemental Nova', xp: 80, done: g => g.flags.sent_nova, hint: { combo: 4 } },
  { icon: 'b:altar', text: 'Unlock Summoning and build the Summoning Altar (it needs Aether Shards)', xp: 40, done: g => FA.count('altar') >= 1, hint: { make: 'altar' } },
  { icon: 'ic_crown', text: 'Craft a Boss Sigil, send it through the Spell Portal and defeat the Primal Chimera!', xp: 150, done: g => g.flags.won, hint: { boss: 1 } },
];
