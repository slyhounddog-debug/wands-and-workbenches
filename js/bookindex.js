'use strict';
// The Collection Book's INDEX page: everything the Spells / Creatures / Wardrobe / Wand pages do not cover (every building, resource, item, potion, landmark, kind of ground and
// the systems that tie them together). Each entry says WHAT it does, HOW to get it and WHY you need it. Built when the book opens (Book.indexEntries), so every number is read off CFG
// and cannot drift from the game. Plain text only (ASCII): pictures are sprite keys, drawn by the Book through UI.img.
const BOOK_CATS = [['build', 'BUILDINGS'], ['stuff', 'RESOURCES & ITEMS'], ['potion', 'POTIONS'], ['wild', 'THE WILDS'], ['sys', 'HOW THINGS WORK']];
function bookIndexEntries() {
  const B = CFG.buildings, P = CFG.potion, pc = v => Math.round(v * 100) + '%';
  const costRow = c => '<div class="bkRec">' + Object.keys(c).map(k => '<span>' + UI.img(k, 32) + (c[k] > 1 ? '<u>x' + c[k] + '</u>' : '') + '</span>').join('') + '</div>';
  const note = (a, b) => '<div class="bkr"><span>' + a + '</span><em>' + b + '</em></div>';
  const costText = c => Object.keys(c).map(k => c[k] + ' ' + itemName(k)).join(', ');
  const L = [];
  const E = (id, cat, name, icon, what, how, why, rows) => L.push({ id, cat, name, icon, what, how, why, rows: rows || '' });
  const bld = (id, cat, icon, what, how, why, extra) => E(id, cat, B[id].name, icon || 'b:' + id, what, how + ' Costs ' + costText(B[id].cost) + '.', why, costRow(B[id].cost) + (extra || ''));

  // ---------------- buildings ----------------
  bld('harness', 'build', 'b:harness', 'Makes element packets (spells): Air, Water, Fire or Earth, whichever crystal it carries. A packet is the basic spell and the raw ingredient of everything else.',
    'Pick it in the hotbar (3), click a floor tile and throw the materials at the blueprint. One stands ready at the start; stand beside any Harnesser and tap the use key to hand-gather a packet for free.',
    'Nothing runs without packets: they are the Wizard\'s attacks, the Battery\'s fuel, the input of every machine and the Skill Tree\'s money. F switches its element (the new crystal grows for 7.5 seconds).');
  E('belt', 'build', 'Belt', 'ic_fast', 'Carries spells, potions, Eggs and garments from machine to machine, one tile at a time, the way its chevrons point.',
    'Pick the Belt tool (2) and click-drag a line from one tile to another; it turns the corner by itself. R turns the piece you aim at. It costs 1 Wood a tile.',
    'It automates the loop (Harnesser -> Splitter -> Spell Portal) so the Builder is free to build. Belts never carry raw Wood, Stone, Iron, Shards or Cores: those are thrown or carried.', costRow({ wood: 1 }));
  bld('splitter', 'build', 'b:splitter', 'A router with up to three outputs: every side that has a belt, machine or portal beside it is an output. You set what share goes where and which element each output takes.',
    'Place it where belts meet (hotbar family 6, Q switches member); click it to set the shares and the element filters.',
    'It is how the Builder aims the factory: Fire to the Spell Portal, Water to the Skill Portal, spare Air to a Battery. In the Chimera fight it is how you change which element goes up when its weakness changes.');
  bld('crate', 'build', 'b:crate', 'Holds any number of ONE kind of element packet or Egg and feeds them out of its arrow side one at a time.',
    'Hotbar family 6. Belt packets in; point its arrow at a belt to release them, or at nothing to just store.',
    'A buffer: save Water spells for when an event needs them, or hold Eggs until you want a stampede of your own.');
  bld('forge', 'build', 'b:forge', 'Fuses element spells into combo spells: two elements make a pair spell, three a triple, all four the Elemental Nova.',
    'Hotbar family 4 (Crafters). Press the use key at it to choose a recipe. Draws 5 power; a charged Battery beside it makes it 15% faster (Overdrive).',
    'Combo spells are stronger, hit more weaknesses and are the seeds for the bigger creatures. Triples need their parent pairs made first. Browse them on the Spells page.');
  bld('cauldron', 'build', 'b:cauldron', 'Brews potions from ONE spell at a time, like the Creature Spawner: the better the spell, the stronger the potion. Health mode brews Health Potions, Armor mode brews Armor Potions.',
    'Hotbar family 4. Throw or belt in a single element spell or any combo spell; it absorbs it and brews. F (LT + X) switches the mode; the new potion regrows above it for 7.5 s. Needs no power.',
    'Health Potions keep the Wizard alive; Armor Potions give him a 70% cut on every hit. A Nova makes the strongest of either. Send them through the Spell Portal. See the POTIONS entries for the numbers.');
  bld('anvil', 'build', 'b:anvil', 'The Armory: forges the Wizard\'s garments (augments) and the Warden Key from Cores, Iron and Shards.',
    'Hotbar family 4. Throw the ingredients at it by hand (belts refuse resources), pick a recipe with the use key. Draws 2 power.',
    'Garments give the Wizard new verbs (walk on water, cross lava, blink, a second life...) and some are needed to reach the Stronghold. The Wardrobe page lists them all.');
  bld('spawner', 'build', 'b:spawner', 'Hatches Eggs. A spell packet makes its basic creature; a seed spell makes a pair or triple creature. Throw it Element Cores and it grows a FRIENDLY one instead.',
    'Hotbar slot 7. Throw in ONE spell at a time and send the Egg through the Spell Portal; the creature drops in beside the Wizard.',
    'Creatures are the Wizard\'s XP, drops and Cores, and a friendly one fights beside him. The Creatures page shows each one\'s Egg recipe.');
  bld('battery', 'build', 'b:battery', 'Stores power: a charged Battery gives ' + CFG.stationGen + ' power to the whole factory and runs flat in about a minute at that load. It is charged by throwing it packets, Wood or Stone.',
    'Hotbar family 5. Throw spells (or Wood / Stone) at it. A combo spell or a strong Health Potion overcharges it past full.',
    'Harnessers, the Forge and the Armory stop without power. Each finished Battery also raises a numbered Battery Shrine in the wilds: spells that hit it recharge it.');
  bld('heavybat', 'build', 'b:heavybat', 'A Battery that drains 50% slower, so a charge lasts half as long again. Charging takes the same time.',
    'Hotbar family 5, Q switches member. Charge it like a Battery.',
    'The same power for less feeding: good for a big factory the Builder cannot babysit.');
  bld('robot', 'build', 'b:robot', 'A wheeled helper that carries building materials from the Stockpile to blueprints (and nothing else). It runs on its own small charge and naps flat.',
    'Hotbar slot 9. You can own up to ' + CFG.robot.max + '; each costs more than the last. Throw it spells, Wood or Stone to wake it.',
    'It does the fetching while the Builder does the throwing. You still press E to finish a building it paid for.', costRow(CFG.robot.cost));
  bld('expand', 'build', 'b:expand', 'A Floor Tile: a 2 x 2 block of new factory floor, joined to the floor you have.',
    'Hotbar slot 8. Place it touching your floor and throw the materials at it; it turns into floor when paid for.',
    'Room to build. The factory starts small on purpose, so every machine has to earn its tile.');
  bld('stockpile', 'build', 'b:stockpile', 'A Stockpile Tile: one floor tile that stores up to ' + CFG.stockCap + ' of ONE kind of item.',
    'Hotbar slot 8, Q switches member. Place it on a plain floor tile and pay for it by throwing.',
    'Everything the Wizard brings home (Wood, Stone, Iron, Shards, Cores, spells) lives on these tiles. When there is no room he is told the factory is full, so build more.');
  E('spellportal', 'build', 'Spell Portal', 'ic_portal', 'The door between the two halves: whatever the Builder throws in sails out of the factory and lands in the wilds beside the Wizard (spells cast, potions wait to be walked over, Eggs hatch).',
    'It is always there, on the east edge of the floor. Throw an item at it, or belt it in.',
    'It is the Builder\'s only way to help the Wizard, and the Wizard\'s only way home: everything he picks up comes back out of it.');
  E('skillportal', 'build', 'Skill Portal', 'ic_skill', 'Banks element spells, combo spells and Aether Shards as skill-tree money instead of sending them to the Wizard.',
    'Right under the Spell Portal. Throw spells at it. Q (pad X) undoes the last deposit.',
    'Every upgrade costs XP AND banked spells. Spells that go in here are spells the Wizard does not get, so the Builder has to balance the two.');
  E('qstation', 'build', 'The ? Station', 'b:qstation', 'A little station off the Stockpile: throw anything at it and it tells you what it is and what it is for.',
    'It stands beside the starting Stockpile.', 'The quickest way to learn a new item: resources and packets are stored, everything else bounces back.');
  E('altar', 'build', 'Summoning Altar', 'lm_altar', 'The finale: it falls into the wilds when Summoning is bought. Hit it with a Single, a Pair, a Triple and the Nova (after the Warden is dead) to light its four sockets, then it calls the Primal Chimera.',
    'Buy Summoning in the Builder\'s Skill Tree (' + CFG.altar.shards + ' Aether Shards through the Skill Portal plus XP and spells).',
    'Beating the Chimera wins the game. The Builder must keep re-routing spells as its weakness rotates.');

  // ---------------- resources and items ----------------
  E('packet', 'stuff', 'Element Spells', 'fire', 'The four basic spells (Air, Water, Fire, Earth), also called packets. Each is an attack for the Wizard when it arrives, and the ingredient of nearly everything.',
    'A Harnesser makes them; creatures drop them 25% of the time; the Wizard recycles loose ones home.',
    'They are the Wizard\'s attacks, power for Batteries, input for Forge / Cauldron / Spawner, and Skill Tree money. Each element has its own wand attack too.');
  E('wood', 'stuff', 'Wood', 'wood', 'Building material. It also burns in a Battery like a packet.', 'Trees give it when spells hit them; kills drop it ' + pc(CFG.drops.common) + ' of the time (x2 mutants, x3 elites); dirt mounds and stick piles hold some.',
    'Every building, every belt (1 a tile) and every Floor Tile needs it.');
  E('stone', 'stuff', 'Stone', 'stone', 'Building material. It also burns in a Battery.', 'Rocks give it when spells hit them; kills drop it ' + pc(CFG.drops.common) + ' of the time; dirt mounds hold some.', 'Needed by almost every building and tile.');
  E('iron', 'stuff', 'Iron Ore', 'iron', 'A rarer metal for the bigger machines.', 'Rocks hold an Ore ' + pc(CFG.harvest.rock.bonus ? (CFG.harvest.rock.bonus.iron || 0.75) : 0.75) + ' of the time; kills drop it ' + pc(CFG.drops.iron) + ' of the time (x2 mutants, x3 elites).',
    'Batteries, Forges, the Armory, Spawners, garments and the Warden Key all need it.');
  E('shard', 'stuff', 'Aether Shard', 'shard', 'The rare resource. When the Wizard picks one up it rises, shakes with confetti and flies home; the Builder sees a preview over the Spell Portal first.',
    'Camps give ' + CFG.marks.campShards + ', crypts ' + CFG.marks.cryptShards + ', the Warden ' + CFG.strong.shards + ', the Chimera ' + CFG.boss.shards + '; an elite drops one ' + pc(CFG.elite.shard) + ' of the time.',
    'Spawners, Helper Robots, garments, the Warden Key and Summoning (' + CFG.altar.shards + ' through the Skill Portal) all cost Shards.');
  E('core', 'stuff', 'Element Cores', 'core_fire', 'Coloured orbs, one per element. They open Shrines, forge garments and the Warden Key, and grow FRIENDLY creatures at a Spawner.',
    'Creatures of that element drop them rarely (wild ' + pc(CFG.cores.wild) + ', basic ' + pc(CFG.cores.basic) + ', pair ' + pc(CFG.cores.pair) + ', triple ' + pc(CFG.cores.triple) + '); elites always drop their elements\' Cores.',
    'A Shrine takes one Core of each OTHER element, thrown through the Spell Portal while the Wizard stands near it. Garments need 3-5 of them each.');
  E('wardkey', 'stuff', 'Warden Key', 'wardkey', 'Opens the Stronghold\'s door for good.', 'Forged at the Armory from ' + CFG.keyCost.cores + ' Cores of EACH element, ' + CFG.keyCost.iron + ' Iron and ' + CFG.keyCost.shard + ' Shards, then thrown through the Spell Portal while the Wizard is near the keep.',
    'Without it the Warden never wakes, and without the Warden the Altar takes no spells.');
  E('gem', 'stuff', 'XP Gems', 'gem', 'Experience as little crystals: each is 1 XP, and gems lying together merge into Big Gems.', 'Kills drop them; finishing a goal makes them burst out of the player; landmarks and events shower them.',
    'XP buys every Skill Tree upgrade. Walk over them to collect (the Builder\'s goal gems come to him when he is near).');
  E('egg', 'stuff', 'Eggs', 'egg_zephyr', 'A creature in a shell: throw it through the Spell Portal and the creature drops in beside the Wizard, hostile, for him to fight.',
    'A Creature Spawner grows one from a spell. Up to ' + CFG.crafted.queue + ' wait at the portal and ' + CFG.crafted.cap + ' creatures can be out at once.', 'Hostile creatures are the Wizard\'s XP, drops and Cores; the Builder decides how many and which.');
  E('aegg', 'stuff', 'Allied Eggs', 'aegg_zephyr', 'A teal-shelled Egg: its creature fights FOR the Wizard (' + CFG.ally.hpMul + 'x health, half damage, never drops anything).',
    'Throw Element Cores at a Spawner (one per element of the creature); more Cores of different elements upgrade it.', 'A bodyguard. The Wizard\'s wand attacks also buff allies nearby.');

  // ---------------- potions ----------------
  const hpRows = [['earth'], ['fire'], ['air'], ['water'], ['air', 'fire'], ['fire', 'water'], ['air', 'water', 'fire'], ['air', 'water', 'fire', 'earth']];
  const val = (mode, els) => Math.max(1, Math.round(els.reduce((a, el) => a + P[mode][el], 0) * (1 + P.extra[els.length])));
  const table = mode => '<div class="bkr"><span>' + (mode === 'hp' ? 'Heals' : 'Armor') + '</span><em>' + hpRows.map(els => '<span class="bkp">' + els.map(e => UI.img(e, 16)).join('') + ' <b>' + val(mode, els) + '</b></span>').join('') + '</em></div>';
  E('hp', 'potion', 'Health Potions', 'hp_water', 'Heals the Wizard when he walks over it. The spell you feed the Cauldron sets the strength: Water is best (' + P.hp.water + '), then Air (' + P.hp.air + '), Fire (' + P.hp.fire + '), Earth (' + P.hp.earth + '); a pair, triple or Nova adds its elements up plus ' + pc(P.extra[2]) + ' / ' + pc(P.extra[3]) + ' / ' + pc(P.extra[4]) + ' extra. The flask grows bigger and richer the stronger it is.',
    'Alchemy Cauldron in Health mode (default). Feed it ONE spell, send the potion through the Spell Portal; it lands beside the Wizard and waits if he is already full.',
    'Healing without waiting. A strong one (' + P.overVal + '+) also overcharges a Battery. The table shows what a spell of each element mix heals.', table('hp'));
  E('ap', 'potion', 'Armor Potions', 'ap_earth', 'Gives the Wizard armor points. While he has any, EVERY hit is cut by ' + pc(CFG.armorRule.cut) + ' (with the Earth wand attack on top, ' + pc(1 - (1 - CFG.armorRule.cut) * CFG.wand.earth.take) + '), and each hit takes points off: ' + CFG.armorRule.small + ' for a small hit (up to ' + CFG.armorRule.smallMax + '), ' + CFG.armorRule.medium + ' for a medium one (up to ' + CFG.armorRule.mediumMax + '), ' + CFG.armorRule.big + ' for a big one. Earth makes the best (' + P.ap.earth + '), then Fire (' + P.ap.fire + '), Air (' + P.ap.air + '), Water (' + P.ap.water + ').',
    'Alchemy Cauldron in Armor mode: press F beside it, wait 7.5 s for the new flask to regrow, then feed it ONE spell and send the potion through the Spell Portal.',
    'Armor is not a second health bar: it is a shield that works for as many hits as it has points, so a big stack of points is a long stretch of 70% less damage.', table('ap'));

  // ---------------- the wilds ----------------
  E('trees', 'wild', 'Trees, Rocks and Ore', 'tree', 'Wood, Stone and Iron growing in the wilds. Any spell that reaches them chops or breaks them; they grow back after ' + CFG.world.respawn + ' seconds.',
    'Just stand near them while the Builder\'s spells land (the Wizard has no attack of his own). Harvest Strength in the Skill Tree makes spells hit them harder.', 'The factory runs on Wood, Stone and Iron, and this is where they come from.');
  E('forage', 'wild', 'Dig Spots', 'mound', 'Dirt mounds (Stone, sometimes Iron), stick piles (Wood), berry bushes (a potion) and, with the Kilnsight Mask, buried caches.',
    'Stand next to one and mash the Mash button (X, left click or /). Progress is never lost: leave and come back and the pile remembers.', 'A way to find building materials and potions without waiting for a spell to chop a tree.');
  E('camp', 'wild', 'Monster Camps and Crypts', 'lm_camp', 'Marked spots on the map guarded by foes (a crypt by one elite guard). Standing inside the ring for a few seconds wakes them; clearing them claims the spot.',
    'Walk into the ring and hold your ground (it fills while you stay and drains if you leave). Kill every guard.', 'The main source of Aether Shards (a camp pays ' + CFG.marks.campShards + ', a crypt ' + CFG.marks.cryptShards + ') and a pile of XP.');
  E('shrine', 'wild', 'Element Shrines', 'lm_shrine', 'Claimed by the Builder sending the three Cores of the OTHER elements through the Spell Portal while the Wizard stands near it. Then the Wizard can wake it with a ring-timing game for a 30 s boost to every Harnesser of its element.',
    'Find one on the map (Core drops come from creatures of the other elements).', 'A big production boost, and a goal on the Wizard\'s list.');
  E('keep', 'wild', 'The Stronghold', 'lm_keep', 'One far-off keep with a Warden inside. Its approach is hazardous ground (an island in a lake, a lava field, cracked rock, a chasm) that needs the right garment, and its door needs the Warden Key.',
    'Scout it by walking near; wear the garment that crosses its ground; have the Builder send the key; beat the Warden.', 'Killing the Warden opens the Summoning Altar to spells. Without it the game cannot be won.');
  E('bshr', 'wild', 'Battery Shrines', 'lm_bshr', 'Every finished Battery has its own numbered shrine somewhere near the Wizard. Damage a spell does to the shrine is charge for THAT Battery.',
    'It appears the moment the Battery is built. Hit it with any spell or wand attack.', 'A way for the Wizard to power the factory himself, so the Builder is not stuck feeding Batteries by hand.');
  E('boulder', 'wild', 'Loose Boulders', 'boulder', 'Rocks by the roadside that any spell can push. They roll away from the Wizard, faster the more spells hit them, shoving foes out of the way and hurting each for ' + CFG.aug.boulder.dmgLo + '-' + CFG.aug.boulder.dmgHi + ' by their speed. They never slow down for foes, bounce off water and walls and stop on their own.',
    'Cast anything at one. Stand behind it so the line from you through the boulder points at the foes.', 'A free weapon: line up a boulder and a crowd.');
  E('ash', 'wild', 'Ash and Lava', 'ic_flame', 'Burning fields. The grey ash round the edge burns a quarter as hard as the glowing lava in the middle; both slow you down. A blinking thermometer shows over your head within ' + CFG.aug.scorch.heatR + ' tiles.',
    'Fields lie around the wilds, and a wide one circles the fire Stronghold.', 'Step back when the thermometer blinks. The Emberward Cloak walks both unharmed.');
  E('ground', 'wild', 'Water, Bog, Ice and Chasms', 'ic_slow', 'Water and chasms cannot be entered (Tide-Walking Boots walk on water, the Gale Circlet blinks over chasms). Bog slows everyone. A Blizzard freezes bog and water into ice you can run on. Creatures made of Water walk on water.',
    'Read the ground ahead: the minimap shows it all.', 'Fighting at a lake shore, or luring a land foe into a bog, is half of staying alive.');
  E('events', 'wild', 'Wilds Events', 'ic_trophy', 'Every 10-15 minutes something big happens: a Migration, a Stampede, an Elite Hunt, a Mutation Bloom, a Portal Storm or the Chimera\'s Brood. The card under the goals counts down and names the weakness to stock.',
    'They start by themselves. Clear the foes to win the reward.', 'A shower of XP and (from cycle 2) a Shard, and a warning to the Builder about what to send.');
  E('elites', 'wild', 'Elites and Mutants', 'ic_crown', 'A gold-ringed elite (' + pc(CFG.elite.spawn) + ' of wild spawns) has ' + CFG.elite.hp + 'x health and drops ' + CFG.elite.gems + ' gems and its Cores; a mutant carries one twist (Swift, Armored, Volatile, Splitter, Regenerating). The Builder\'s Spell Portal shows "ELITE SPAWNED" or "MUTANT SPAWNED" with what it is weak to.',
    'They turn up on their own.', 'They pay x3 (elites) and x2 (mutants) on Wood, Stone, Iron and spell drops. Send the element on the panel.');
  E('weakness', 'wild', 'Weakness', 'ic_bolt', 'Every foe is weak to one element (double damage, a yellow !) and resists another (half). The Builder\'s Spell Portal shows "WEAK TO" with the element when a new danger appears.',
    'Read the panel at the Spell Portal or the weakness pip on the foe.', 'Matching the element is the fastest way to win a fight, and it is the Builder\'s main job.');

  // ---------------- systems ----------------
  E('tree', 'sys', 'The Skill Trees', 'ic_tree', 'Two panels (T for the Builder, Y / Back for the Wizard). Upgrades cost XP AND banked spells. It has three branches: BUILDER, BUILDINGS and WIZARD (speed, health, roll, spell power, foraging, gems).',
    'Open it with the tree button, buy with a click (or A on a pad). Deposit spells in the Skill Portal first.', 'Permanent upgrades. Summoning is the one unlock: it brings the Altar.');
  E('goals', 'sys', 'Goals', 'ic_target', 'Each player has their own goal card and the two run at once. A goal only counts what you do AFTER it appears, and pays XP (as gems that burst out of you) and sometimes a gift.',
    'Just play: the pointer arrows and the blinking hotbar slot tell you where to look.', 'They teach the game in order and end at the Chimera.');
  E('emotes', 'sys', 'Emotes', 'ic_emote', 'The Wizard can dance an element: Float (Air), Blaze (Fire), Rain (Water) or Stomp (Earth). A sticker of it pops up on the Builder\'s side.',
    'Press the emote button beside the Book (N, or RB on a pad), pick a direction, press again.', 'A way to talk without words.');
  E('power', 'sys', 'Power and Overdrive', 'ic_bolt', 'Machines need power; a charged Battery gives ' + CFG.stationGen + '. A charged Battery touching a Forge or Cauldron makes it ' + pc(CFG.overdrive) + ' faster (Overdrive).', 'Charge Batteries with packets, Wood or Stone.',
    'When no Battery has charge a red bolt blinks on the Wizard\'s card so he knows the factory stalled.');
  E('weather', 'sys', 'Weather', 'water', 'The wilds take on the colours and weather of the elements the factory is making: embers for Fire, rain for Water, wind for Air, dust for Earth.', 'It follows how many packets a minute you make of each.',
    'A free read-out: look at the sky to see what the factory is doing.');
  E('shake', 'sys', 'Shake Loose', 'ic_warn', 'When the Wizard loses health, the factory shakes and may drop something: an item off a belt (more likely the weaker he is) or, very rarely, out of the Stockpile.',
    'It happens by itself. Armor that absorbs the hit prevents it.', 'It makes the Wizard\'s danger felt in the factory.');
  return L;
}
