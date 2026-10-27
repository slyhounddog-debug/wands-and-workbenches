'use strict';
// The Collection Book: a reference for every spell and every creature (they left the skill tree: production is their only gate).
// Four pages (spells, creatures, the wardrobe, the wand). Each entry shows what the tree's hover card used to (name, icon, description, recipe / production, stats) with a looping demo:
// SPV for spells (spellpreview.js), CPV for creatures (creaturepreview.js). It opens over the paused game from the button beside the
// skill-tree button (or C), or from the pause menu, and nothing runs while it is closed.
const PAGES = ['spells', 'creatures', 'wardrobe', 'wand'];
const Book = { isOpen: false, page: 'spells', sel: { spells: 'gust', creatures: 'zephyr', wardrobe: 'tide', wand: 'fire' }, from: 'play', navT: 0 };
(function () {
  const SPELL_ORDER = ['gust', 'fireball', 'spray', 'boulder', 'flamethrower', 'tempest', 'steam', 'sandstorm', 'magma', 'mud', 'meteor', 'thunder', 'blizzard', 'geyser', 'nova'];
  // the Creatures page lists every enemy type: the crafted creatures, then the wild foes, the Warden and the Chimera (each with its drop table)
  const WILD_ORDER = ['slime', 'shroom', 'sprite', 'imp', 'lurker', 'wisp', 'golem'];
  const CREATURE_ORDER = Object.keys(CFG.creatures).concat(WILD_ORDER, ['warden', 'boss']);
  const kindOf = id => (CFG.creatures[id] ? 'crafted' : id === 'warden' || id === 'boss' ? 'boss' : 'wild');
  const WILD_NOTE = {
    slime: 'Wanders in from anywhere. Slow and weak: a gem now and then.', shroom: 'Anywhere in the wilds. Slow, but tougher than a slime.', sprite: 'Anywhere in the wilds. Fast and fragile.',
    imp: 'Lives on sand and dirt. Weak to Water, resists Fire. Its element is Fire.', lurker: 'Lives in the bogs. Weak to Fire, resists Water. Its element is Water.',
    wisp: 'Drifts over the far meadows and flower fields. Weak to Earth, resists Air. Its element is Air.', golem: 'Walks the dark woods far from the start. Weak to Air, resists Earth. Its element is Earth.',
    warden: 'Guards the Stronghold: an elite with slams and orb volleys. It wakes only once the Warden Key has been sent in through the portal. Until it dies the Summoning Altar takes no spells.',
    boss: 'The Primal Chimera, called out of the Summoning Altar once the Warden is dead and all four sockets are lit. Only its current weakness hurts it, and the weakness changes every quarter of its health.',
  };
  const BASIC_EL = { gust: 'air', fireball: 'fire', spray: 'water', boulder: 'earth' };
  const spellIcon = id => BASIC_EL[id] || id;
  const spellEls = id => SPELL_EL[id] || [];
  const klass = n => (n <= 1 ? 'BASIC' : n === 2 ? 'PAIR' : n === 3 ? 'TRIPLE' : 'ALL FOUR');
  const pct = v => Math.round(v * 100) + '%';
  const row = (a, b) => '<div class="bkr"><span>' + a + '</span><em>' + b + '</em></div>';

  // ---- stat badges: one number set inside the icon of what it is (the same sprites the game uses) ----
  const fmt = n => '' + Math.round(n * 10) / 10;
  const badge = (ic, num, tip, size, sub, cls) => '<div class="bkb ' + (cls || '') + '" title="' + tip + '">' + UI.img(ic, size) + '<b' + (('' + num).length > 3 ? ' class="sm"' : '') + '>' + num + '</b>' + (sub ? '<i>' + sub + '</i>' : '') + '</div>';
  const main = list => '<div class="bkBad main">' + list.join('') + '</div>', sub = list => '<div class="bkBad">' + list.join('') + '</div>';
  // the elements it takes, big: one packet per element, joined by plus signs
  const elStrip = list => '<div class="bkEls">' + list.map(k => '<div class="bkel" style="--ec:' + ELEM[k].color + '">' + UI.img(k, 40) + '<small>' + k.toUpperCase() + '</small></div>').join('<u>+</u>') + '</div>';
  const bigRec = (id, sz) => { const R = CFG.recipes[id]; return '<div class="bkRec">' + Object.keys(R.in).map(k => '<span>' + UI.img(k, sz) + (R.in[k] > 1 ? '<u>x' + R.in[k] + '</u>' : '') + '</span>').join('') + UI.img('ic_play', sz * 0.6) + '<span>' + UI.img(R.out, sz) + '</span></div>'; };

  // Spell text: the old tree description minus its "Air + Fire:" prefix (the elements are icons now), then every damage number and the total
  // possible damage (the badge). Built from CFG.spells so it never drifts from WZ.cast.
  const SPELL_BOOK = {
    gust: s => ({ total: s.pulses * s.dmg + s.bonk, text: 'A cyclone spins out of the Wizard in ' + s.pulses + ' pulses, each hitting for ' + s.dmg + ' out to ' + s.r + ' tiles and shoving foes away. Foes flung into each other bonk for ' + s.bonk + ' more. Chops trees and rocks.' }),
    fireball: s => ({ total: s.dmg + s.splash, text: 'A very fast fireball that homes in on the nearest foe. It hits for ' + s.dmg + ' and splashes ' + s.splash + ' to everything within ' + s.sr + ' tiles, leaving a trail of embers.' }),
    spray: s => ({ total: s.dmg, text: 'A crescent wave ' + s.w + ' tiles wide rolls out and carries every foe it catches along, hitting each for ' + s.dmg + ' and slowing them ' + pct(s.slow) + ' for ' + s.slowT + 's. It heals the Wizard ' + s.heal + '.' }),
    boulder: s => ({ total: s.hops * s.dmg, text: 'A boulder that bounces ' + s.hops + ' times along the ground, crushing everything within ' + s.sr + ' tiles of each landing for ' + s.dmg + '.' }),
    flamethrower: s => ({ total: s.dps * s.t, text: 'A roaring stream of fire blown ' + s.range + ' tiles out in front of the Wizard for ' + s.t + ' seconds, burning everything in the cone for ' + s.dps + ' damage per second and scorching the ground.' }),
    tempest: s => ({ total: s.dps * s.life, text: 'A controllable water droplet that lives ' + s.life + ' seconds and flies at ' + s.speedMin + ' to ' + s.speedMax + 'x the Wizard\'s speed (each droplet its own speed) along his aim (right stick, or the way he faces), up to ' + s.reach + ' tiles out. Everything it passes through takes ' + s.dps + ' damage per second and is slowed ' + pct(s.slow) + '. Every delivery is its own droplet; live droplets fan out ' + s.spread + ' degrees apart. Total is per droplet.' }),
    steam: s => ({ total: s.dmg, text: 'Lobs a mine ' + s.throw + ' tiles ahead that waits for up to ' + s.life + 's. A foe within ' + s.wake + ' tiles wakes it; it hops up, flies at that foe and bursts for ' + s.dmg + ' in ' + s.r + ' tiles, leaving a steam cloud that slows foes ' + pct(s.cloud.slow) + ' for ' + s.cloud.t + 's. Up to ' + s.max + ' mines at once. Total is per mine.' }),
    sandstorm: s => ({ total: 2 * s.dmg + s.dmg * s.second.dmg, text: 'A heavy boomerang curves out ' + s.reach + ' tiles and back, piercing everything it crosses for ' + s.dmg + ' each way. Stand at the catch spot to catch it and it flies again as a smaller one-way throw for ' + fmt(s.dmg * s.second.dmg) + '. Miss it and it fizzles.' }),
    magma: s => ({ total: s.dmg + s.pool.dps * s.pool.t + s.blobs * s.blobDmg, text: 'Lobbed onto the thickest crowd: a blast for ' + s.dmg + ' in ' + s.sr + ' tiles, a lava pool that burns ' + s.pool.dps + ' per second for ' + s.pool.t + 's (' + s.pool.dps * s.pool.t + '), and ' + s.blobs + ' magma blobs splattering out for ' + s.blobDmg + ' each (' + s.blobs * s.blobDmg + ').' }),
    mud: s => ({ total: s.orbs * s.dmg, text: s.orbs + ' orbs circle the Wizard for ' + s.t + ' seconds. The first foe an orb touches sets it off in a muddy blast for ' + s.dmg + ' in ' + s.sr + ' tiles that shoves and slows ' + pct(s.slow) + '. One blast per orb.' }),
    meteor: s => ({ total: s.dmg + s.frags * s.fragHops * s.fragDmg, text: 'One huge meteor crashes onto the thickest crowd for ' + s.dmg + ' in ' + s.r + ' tiles, then shatters into ' + s.frags + ' burning boulders that hunt the nearest foes, bouncing ' + s.fragHops + ' times and crushing for ' + s.fragDmg + ' at every landing.' }),
    thunder: s => { const bolts = Math.floor(s.t / s.every); return { total: bolts * (s.dmg + s.chain * s.chainDmg), text: 'A storm cloud over the Wizard calls a lightning bolt every ' + s.every + 's for ' + s.t + ' seconds (' + bolts + ' bolts). Each bolt hits for ' + s.dmg + ' and forks to ' + s.chain + ' more foes for ' + s.chainDmg + ' each.' }; },
    blizzard: s => { const ice = Math.floor(s.t / s.icicle); return { total: s.dps * s.t + ice * s.iceDmg, text: 'A freezing storm rages round the Wizard for ' + s.t + ' seconds: ' + s.dps + ' damage per second to everything within ' + s.r + ' tiles, plus an icicle every ' + s.icicle + 's (' + ice + ') for ' + s.iceDmg + ' each. A foe hit ' + s.chill + ' times freezes solid for ' + s.freeze + 's. Turns bog and water into ice.' }; },
    geyser: s => ({ total: s.waves * s.n * (s.dmg + s.land), text: s.waves + ' waves of geysers, ' + s.waveGap + 's apart: the ' + s.n + ' nearest foes, then ' + s.n + ' random ones. Each is thrown up for ' + s.dmg + ', takes ' + s.land + ' more when it lands, then is slowed ' + pct(s.slow) + ' for ' + s.slowT + 's.' }),
    nova: s => { const zaps = Math.floor(s.pullT / s.zapEvery); return { total: zaps * s.zapDmg + s.dmg + s.bits * 4 * s.bitDmg, text: 'Foes within ' + s.pullR + ' tiles are hauled in for ' + s.pullT + 's while everyone within ' + s.r + ' tiles is zapped for ' + s.zapDmg + ' every ' + s.zapEvery + 's (' + zaps + ' zaps). Then ' + s.bits * 4 + ' bits of magma, water, air and rock burst out for ' + s.bitDmg + ' each, with a ' + s.dmg + ' damage burst that shoves everything away.' }; },
  };
  const spellBook = id => { const b = SPELL_BOOK[id](CFG.spells[id]), t = Math.round(b.total); return { total: t, text: b.text + ' Most it can deal: ' + t + '.' }; };
  function spellRows(id) {
    const r = CFG.recipes[id], rows = [elStrip(spellEls(id))];
    if (r && r.parents) rows.push('<div class="bkNeed">' + r.parents.map(p => { const ok = ((G.stats.made || {})[p] || 0) > 0; return '<span class="bkp ' + (ok ? 'ok' : '') + '" title="Make this first">' + UI.img(p, 24) + UI.img(ok ? 'ic_check' : 'ic_lock', 12) + '</span>'; }).join('') + '</div>');
    rows.push(main([badge('ic_flame', spellBook(id).total, 'Most damage it can deal', 96, '', 'dmg')]));
    if (r) rows.push(sub([badge('ic_clock', r.time + 's', 'Craft time at the Forge', 48), badge('ic_bolt', r.power, 'Power the Forge draws', 48)]));
    return rows.join('');
  }
  // gem value as one number: guaranteed gems count 100% each, so 1 guaranteed + 25% for one more = 125%
  const gemPct = (g, mul) => (g[0] >= 5 ? '' + g[0] : Math.round((g[0] + g[1] * (mul || 1)) * 100) + '%');   // a boss's pile of gems reads as a count
  function wildRows(id) {   // wild foes, the Warden and the Chimera: no Egg recipe, just the numbers
    const c = CFG.enemies[id], wild = kindOf(id) === 'wild', W = CFG.world, rows = [];
    if (BIOME_EL[id]) rows.push(elStrip([BIOME_EL[id]]));
    rows.push(main([badge('potion', Math.round(c.hp * (wild ? W.wildHp : 1)), 'Health', 72), badge('ic_flame', Math.round(c.dmg * (wild ? W.wildDmg : 1)), 'Touch damage', 72)]));
    const s = [badge('ic_fast', c.speed, 'Speed, tiles per second', 48), badge('gem', gemPct(c.gem, wild ? W.wildGem : 1), 'XP Gems', 48)];
    if (c.weak) s.push(badge(c.weak, 'x2', 'Weak to', 48, 'WEAK', 'weak'));
    if (c.resist) s.push(badge(c.resist, 'x.5', 'Resists', 48, 'RESIST', 'res'));
    rows.push(sub(s));
    if (id === 'warden') rows.push(row('Slams / orbs', 'a slam every ' + CFG.strong.warden.slamEvery + 's, a ring of ' + CFG.strong.warden.volleyN + ' orbs every ' + CFG.strong.warden.volleyEvery + 's'));
    if (id === 'boss') rows.push(row('Phases', 'four, one weakness each; it summons its brood, slams and fires orb rings'));
    return rows.join('');
  }
  // the Drops block: normal drops and elite drops, all read off the same tables the kills use (WZ.dropInfo, CFG)
  function dropsHtml(id) {
    const I = WZ.dropInfo(id), D = CFG.enemies[id], E = CFG.elite, C = CFG.cores, kind = kindOf(id);
    const line = (ic, text, state) => '<div class="bkd">' + ic + '<span>' + text + '</span>' + (state || '') + '</div>';
    const eliteShard = ' + a Shard (a bonus one ' + pct(E.shardBonus) + ' of the time)';
    const coreIcons = els => els.map(e => UI.img('core_' + e, 16)).join('');
    let s = '<div class="bkdc"><h4>NORMAL DROPS</h4>';
    if (id === 'boss') s += line(UI.img('gem', 16), D.gem[0] + ' XP Gems') + line(UI.img('shard', 16), CFG.boss.shards + ' Aether Shards') + line(coreIcons(ELEMS), C.boss + ' of every Core');
    else if (id === 'warden') s += line(UI.img('shard', 16), 'keep claimed: ' + CFG.strong.shards + ' Shards, ' + CFG.strong.gems + ' XP Gems') + line(coreIcons(ELEMS), C.warden + ' Cores of every element') + line(UI.img('b:altar', 16), 'its death opens the Summoning Altar to spells') + line(UI.img('ic_crown', 16), 'the glow-up (it leaves a faint aura round the Wizard for good)');
    else {
      s += line(UI.img('gem', 16), 'XP Gems: ' + gemPct(D.gem, kind === 'wild' ? CFG.world.wildGem : 1));
      if (I.els.length) s += line(coreIcons(I.els), pct(I.core) + ' chance of a ' + I.els.map(e => CORE_NAME[e]).join(' or ') + ' (rides home to the Stockpile)');
      else s += line(UI.img('ic_x', 16), 'no element: no Cores');
      if (kind === 'crafted') { const cd = CFG.creatures[id], tier = cd.order.length; s += tier === 1 ? line(UI.img(cd.order[0], 16), pct(CFG.crafted.recycle) + ' chance of a ' + ELEM_WORD[cd.order[0]] + ' spell (rides home)') : line(UI.img(Object.keys(cd.cost)[0], 16), pct(CFG.crafted.recycleSpell[tier]) + ' chance of a ' + itemName(Object.keys(cd.cost)[0]) + ' (the spell it hatched from; rides home)'); }
    }
    s += '</div>';
    if (id !== 'boss') {
      s += '<div class="bkdc"><h4>ELITE DROPS</h4>';
      if (id === 'warden') s += line(UI.img('ic_crown', 16), 'an elite: ' + E.gems + ' XP Gems' + eliteShard);
      else {
        s += line(UI.img('gem', 16), E.gems + ' XP Gems' + (kind === 'crafted' && !CFG.crafted.eliteShards ? '' : eliteShard));
        if (I.els.length) {
          s += line(coreIcons(I.els), 'always ' + (C.elite[0] === C.elite[1] ? C.elite[0] : C.elite[0] + '-' + C.elite[1]) + ' Core' + (C.elite[1] > 1 ? 's' : '') + (I.els.length > 1 ? ' of each element' : ''));
        } else s += line(UI.img('ic_x', 16), 'no element: no Cores');
      }
      s += '</div>';
    }
    return s;
  }
  // ---- the Wardrobe page: what each garment is made from and where those Cores come from (the Builder forges them, the Wizard walks onto them) ----
  const GATE_TEXT = { water: 'an island in the middle of a lake', fire: 'a field of scorched ground', earth: 'a ring of cracked rock', air: 'a chasm with a broken bridge' };
  const USES = { bog: 'Pass the vine tangles knotted over the bogs; no more slow walking in bog.', phoenix: 'A second life: the Feather recharges while you play.',
    static: 'Takes the sting out of being swarmed: every hit that lands throws the attackers back.', kiln: 'Buried caches glint through the grass; edge glints point at landmarks you have not claimed.' };
  const useText = id => (AUGS[id].gate ? 'Opens the way to the ' + ELEM_WORD[AUGS[id].gate] + ' Stronghold: ' + GATE_TEXT[AUGS[id].gate] + '. Works anywhere else in the wilds too.' : USES[id]);
  function garmentRows(id) {
    const R = CFG.recipes['aug_' + id];
    return bigRec('aug_' + id, 48) + sub([badge('ic_clock', R.time + 's', 'Craft time at the Armory', 48), badge('ic_bolt', R.power, 'Power the Armory draws', 48)]) + row('Uses', useText(id));
  }
  const augState = id => (FA.augMade(id) ? 'MADE' : '');
  function garmentDrops(id) {   // for each kind of Core in the recipe: who drops it, and how often
    const C = CFG.cores, make = AUGS[id].make.in, nm = c => CFG.creatures[c].name;
    const line = (ic, text) => '<div class="bkd">' + ic + '<span>' + text + '</span></div>';
    return Object.keys(make).filter(isCoreKind).map(k => {
      const el = k.slice(5), crafted = Object.keys(CFG.creatures).filter(c => CFG.creatures[c].order.indexOf(el) >= 0), by = n => crafted.filter(c => CFG.creatures[c].order.length === n);
      const wild = Object.keys(BIOME_EL).filter(t => BIOME_EL[t] === el).map(t => CFG.enemies[t].name);
      let h = '<div class="bkdc"><h4>' + make[k] + ' ' + CORE_NAME[el].toUpperCase() + '</h4>';
      if (wild.length) h += line(UI.img(Object.keys(BIOME_EL).find(t => BIOME_EL[t] === el), 16), wild.join(', ') + ' (wild): ' + pct(C.wild));
      if (by(1).length) h += line(UI.img(by(1)[0], 16), by(1).map(nm).join(', ') + ': ' + pct(C.basic));
      if (by(2).length) h += line(UI.img(by(2)[0], 16), by(2).map(nm).join(', ') + ': ' + pct(C.pair));
      if (by(3).length) h += line(UI.img(by(3)[0], 16), by(3).map(nm).join(', ') + ': ' + pct(C.triple));
      return h + line(UI.img('ic_crown', 16), 'any elite of it: ' + (C.elite[0] === C.elite[1] ? C.elite[0] : C.elite[0] + '-' + C.elite[1]) + ' for sure') + '</div>';
    }).join('');
  }
  function creatureRows(id) {
    const c = CFG.creatures[id], rows = [elStrip(c.order)];
    rows.push(main([badge('potion', c.hp, 'Health', 72), badge('ic_flame', c.dmg, 'Touch damage', 72)]));
    rows.push(sub([badge('ic_fast', c.speed, 'Speed, tiles per second' + (c.fly ? ' (flies)' : ''), 48), badge('gem', gemPct(c.gem), 'XP Gems', 48),
      badge('egg_' + id, c.time + 's', 'Hatch time at a Creature Spawner' + ((c.n || 1) > 1 ? ', ' + c.n + ' creatures per Egg' : ''), 48, (c.n || 1) > 1 ? 'x' + c.n : ''), badge('ic_bolt', c.power, 'Power the Spawner draws', 48),
      badge(c.weak, 'x2', 'Weak to', 48, 'WEAK', 'weak'), badge(c.resist, 'x.5', 'Resists', 48, 'RESIST', 'res')]));
    rows.push(bigRec('egg_' + id, 32));
    rows.push('<div class="bkAlly" title="Throw Cores at a Spawner for a FRIENDLY ' + c.name + ': ' + CFG.ally.hpMul + 'x health, half damage">' + bigRec('aegg_' + id, 24) + '<small>FRIENDLY</small></div>');
    return rows.join('');
  }

  // has the player made / met it yet? (the entry stays fully readable either way: unseen ones are just greyed out)
  const st = () => G.stats;
  const seenSpell = id => ((st().made || {})[id] || 0) > 0 || ((st().sent || {})[id] || 0) > 0 || (!!BASIC_EL[id] && ((st().sent || {})[BASIC_EL[id]] || 0) > 0);
  const seenCreature = id => ((st().met || {})[id] || 0) > 0 || ((st().sent || {})['egg_' + id] || 0) > 0;
  const seen = (pg, id) => (pg === 'spells' ? seenSpell(id) : pg === 'creatures' ? seenCreature(id) : pg === 'wand' ? ((st().wandUsed || {})[id] || 0) > 0 : FA.augMade(id));
  const idsOf = pg => (pg === 'spells' ? SPELL_ORDER : pg === 'creatures' ? CREATURE_ORDER : pg === 'wand' ? WAND_ORDER : AUG_ORDER);
  // ---- the Wand page: the four wand attacks, what charges them and what each does (every number read off CFG.wand, so it never drifts from js/wand.js) ----
  const WAND_ORDER = ['fire', 'air', 'water', 'earth'];
  const WAND_BOOK = {
    fire: s => ({ total: s.total, dur: s.t, text: 'The Wizard runs ' + pct(s.speed) + ' faster for ' + s.t + ' seconds and leaves a trail of fire behind him. Every piece of the trail burns for ' + s.life + ' seconds; an enemy that stands in it takes ' + s.total + ' damage in total over that time (half of a Seeker Fireball), however many pieces overlap. It burns trees and rocks too.' }),
    air: s => ({ total: s.dmg, dur: s.t, text: 'A burst of air ' + s.r + ' tiles round the Wizard shoves foes away and hurts them for ' + s.dmg + ' (half of Cyclone Gust). Then, for ' + s.t + ' seconds, he is invisible: no hostile targets him (allies are targeted instead; with none near they just mill about). A delivered spell does not break it. Mashing, or casting another wand attack, ends it at once. Area damage can still hit him.' }),
    water: s => ({ total: s.dmg, dur: s.t, text: 'The Wizard rides a wave in a straight line along his aim, ' + s.dist + ' tiles in about ' + s.t + ' second (as far as a Tidal Wave flies). The wave is a small ' + s.w + '-tile V that parts foes to the sides (it does not carry them) and hits each once for up to ' + s.dmg + ' (half of Tidal Wave). It stops dead at walls and water edges: a ride, never a crossing.' }),
    earth: s => ({ total: s.dmg * (1 + s.cap), dur: s.t, text: 'For ' + s.t + ' seconds the Wizard is stone: ' + pct(1 - s.speedMul) + ' slower, but he takes only ' + pct(s.take) + ' of all damage. Every hit he takes charges the burst that ends it (+' + pct(s.perHit) + ' of its base each, up to +' + pct(s.cap) + '). The statue then explodes for ' + s.dmg + ' damage (half of a Bouncing Boulder), up to ' + s.dmg * (1 + s.cap) + ' fully charged, in ' + s.r + ' tiles, shoving everything away.' }),
  };
  const WAND_CAP = { fire: 'RUN: the trail burns for 5 seconds behind him', air: 'PUFF, then unseen: foes mill about until he acts', water: 'RIDE: foes part to the sides, a wall stops him dead', earth: 'STONE: hits charge the burst that ends it' };
  const wandBook = el => { const b = WAND_BOOK[el](CFG.wand[el]); return { total: Math.round(b.total * 10) / 10, dur: b.dur, text: b.text }; };
  function wandRows(el) {
    const need = CFG.wand.need[el], b = wandBook(el), carriers = Object.keys(SPELL_EL).filter(sp => SPELL_EL[sp].indexOf(el) >= 0);
    const rows = [elStrip([el])];
    rows.push(main([badge('ic_flame', b.total, 'Most damage it can deal' + (el === 'fire' ? ' to one enemy over the trail\'s life' : ''), 96, '', 'dmg')]));
    rows.push(sub([badge('wand_' + el, need, 'Spells with ' + ELEM_WORD[el] + ' in them it takes to charge this slot', 48), badge('ic_clock', b.dur + 's', 'How long it lasts', 48)]));
    rows.push('<div class="bkr"><span>Charged by</span><em>' + carriers.map(sp => UI.img(sp, 24)).join('') + '</em></div>');
    rows.push(row('Slot', 'one attack at a time; spells that arrive while it is full add nothing'));
    return rows.join('');
  }

  // The shell (header, tabs, list, detail) is built once per open; picking an entry only swaps the text, the stats and the demo, so nothing
  // jumps and the list keeps its place. Both pages share one layout: the list tiles, the header, the demo box (same size) and the stats column.
  let ref = null;
  Book.build = function () {
    const el = $('book');
    el.innerHTML = '<div class="bookPanel px"><div class="treeHead"><h2>' + UI.img('ic_book', 32) + 'COLLECTION BOOK</h2><div class="tabs bkTabs">' +
      '<button class="tab" data-p="spells">SPELLS</button><button class="tab" data-p="creatures">CREATURES</button><button class="tab" data-p="wardrobe">WARDROBE</button><button class="tab" data-p="wand">WAND</button></div><div class="bkCount"></div><button class="x" data-close="1">' + UI.img('ic_x', 16) + '</button></div>' +
      '<div class="bookBody"><div class="bookList"></div><div class="bookDetail"><div class="tth bkh"></div>' +
      '<div class="bkLeft"><p class="bkDesc"></p><div class="bkDemoBox"><canvas class="bkDemo"></canvas></div><div class="spvc"></div></div><div class="bkRows"></div><div class="bkDrops"></div></div></div>' +
      '<p class="hint"></p></div>';
    const q = c => el.querySelector(c);
    ref = { el, hint: q('.hint'), list: q('.bookList'), head: q('.bkh'), desc: q('.bkDesc'), cv: q('canvas.bkDemo'), cap: q('.spvc'), drops: q('.bkDrops'), rows: q('.bkRows'), detail: q('.bookDetail'), count: q('.bkCount'), page: null };
    q('[data-close]').onclick = () => Book.close();
    el.querySelectorAll('.tab').forEach(bt => { bt.onclick = () => Book.setPage(bt.dataset.p); });
    el.onmousedown = e => { if (e.target === el) Book.close(); };
  };
  const hintHtml = pg => '<kbd>C</kbd> / Esc closes. <kbd>W</kbd><kbd>S</kbd> or <kbd>UP</kbd><kbd>DOWN</kbd> pick an entry, <kbd>A</kbd><kbd>D</kbd> or <kbd>TAB</kbd> flip the page' + (IN.padList.length ? ' <kbd>STICK</kbd> pick <kbd>LB</kbd><kbd>RB</kbd> page <kbd>B</kbd> close' : '');
  Book.fillList = function () {   // the tiles of the current page (once per page flip)
    const pg = Book.page, sp = pg === 'spells', aug = pg === 'wardrobe', wd = pg === 'wand', ids = idsOf(pg);
    ref.hint.innerHTML = hintHtml(pg);
    ref.list.innerHTML = ids.map(i => {
      const nm = sp ? SPELLS[i] : aug ? AUGS[i].name : wd ? CFG.wandNames[i] : CFG.enemies[i].name, icon = sp ? spellIcon(i) : aug ? 'aug_' + i : wd ? 'wand_' + i : i;
      return '<div class="bkItem" data-id="' + i + '">' + UI.img(icon, 32) + '<b>' + nm + '</b><u></u></div>';
    }).join('');
    ref.list.querySelectorAll('.bkItem').forEach(b => { b.onclick = () => Book.pick(b.dataset.id); });
    ref.list.querySelectorAll('.bkItem').forEach(b => { const ok = seen(pg, b.dataset.id); b.classList.toggle('unseen', !ok); b.querySelector('u').textContent = ok ? '' : '?'; });
    ref.el.querySelectorAll('.tab').forEach(bt => bt.classList.toggle('on', bt.dataset.p === pg));
    const n = ids.filter(i => seen(pg, i)).length;
    ref.count.textContent = (wd ? 'CAST ' : sp || aug ? 'MADE ' : 'MET ') + n + ' / ' + ids.length;
  };
  Book.fillDetail = function () {   // the selected entry: text, stats and demo, swapped in place
    if (Book.page === 'wardrobe') return Book.fillGarment();
    if (Book.page === 'wand') return Book.fillWand();
    const pg = Book.page, sp = pg === 'spells', id = Book.sel[pg], ok = seen(pg, id);
    ref.list.querySelectorAll('.bkItem').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    const crafted = !sp && kindOf(id) === 'crafted';
    const nm = sp ? SPELLS[id] : CFG.enemies[id].name, desc = sp ? spellBook(id).text : crafted ? CFG.creatures[id].note : WILD_NOTE[id];
    const tag = sp ? klass(spellEls(id).length) + ' SPELL' : crafted ? klass(CFG.creatures[id].order.length) + ' CREATURE' : kindOf(id) === 'wild' ? 'WILD FOE' : id === 'warden' ? 'STRONGHOLD BOSS' : 'FINAL BOSS';
    ref.head.innerHTML = UI.img(sp ? spellIcon(id) : id, 48) + '<div><b>' + nm + '</b><small>' + tag + '</small></div>' +
      '<span class="bkSt' + (ok ? ' on' : '') + '">' + (ok ? UI.img('ic_check', 12) + (sp ? 'MADE' : 'MET') : UI.img('ic_lock', 12) + (sp ? 'NOT MADE YET' : 'NOT MET YET')) + '</span>';
    ref.desc.textContent = desc;
    ref.cap.textContent = sp ? SPV.caption(id) : crafted ? CPV.caption(id) : '';
    ref.rows.innerHTML = sp ? spellRows(id) : crafted ? creatureRows(id) : wildRows(id);
    ref.drops.innerHTML = sp ? '' : dropsHtml(id);
    ref.drops.className = 'bkDrops two';
    ref.detail.classList.toggle('unseen', !ok);
    if (ref.page !== pg) { ref.page = pg; ref.cv.width = sp ? 186 : CPV.W; ref.cv.height = sp ? 100 : CPV.H; }   // both fill the same box on screen
    SPV.stop(); CPV.stop();
    if (sp || crafted) (sp ? SPV : CPV).mount(ref.cv, id); else Book.stillLife(ref.cv, id);
    ref.list.querySelector('.bkItem.on').scrollIntoView({ block: 'nearest' });
  };
  Book.fillWand = function () {   // the Wand page's selected attack: what it does, what charges it, a looping demo
    const el = Book.sel.wand, W = G.wand, ok = seen('wand', el), full = W && W.full[el], m = W ? W.m[el] : 0, need = CFG.wand.need[el];
    ref.list.querySelectorAll('.bkItem').forEach(b => b.classList.toggle('on', b.dataset.id === el));
    ref.head.innerHTML = UI.img('wand_' + el, 48) + '<div><b>' + CFG.wandNames[el] + '</b><small>' + ELEM_WORD[el].toUpperCase() + ' WAND ATTACK</small></div>' +
      '<span class="bkSt' + (full ? ' on' : '') + '">' + (full ? UI.img('ic_check', 12) + 'READY' : UI.img('ic_bolt', 12) + 'CHARGING ' + m + ' / ' + need) + '</span>';
    ref.desc.textContent = wandBook(el).text;
    ref.cap.textContent = WAND_CAP[el];
    ref.rows.innerHTML = wandRows(el);
    ref.drops.innerHTML = '<div class="bkdc"><h4>HOW THE WAND WORKS</h4><div class="bkd"><span>Every spell the Builder sends adds one tick to each element in it. Cycle picks which ready slot is armed, Cast fires it. Shrines never charge it.</span></div></div>';
    ref.drops.className = 'bkDrops';
    ref.detail.classList.toggle('unseen', !ok);
    if (ref.page !== 'wand') { ref.page = 'wand'; ref.cv.width = CPV.W; ref.cv.height = CPV.H; }
    SPV.stop(); CPV.stop();
    CPV.mount(ref.cv, 'wand_' + el);
    ref.list.querySelector('.bkItem.on').scrollIntoView({ block: 'nearest' });
  };
  Book.fillGarment = function () {   // the Wardrobe page's selected garment: the Wizard wearing it, what it does, its recipe and where the Cores come from
    const id = Book.sel.wardrobe, a = AUGS[id], st = augState(id), ok = !!st;
    ref.list.querySelectorAll('.bkItem').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    ref.head.innerHTML = UI.img('aug_' + id, 48) + '<div><b>' + a.name + '</b><small>' + a.slot.toUpperCase() + ' GARMENT</small></div>' +
      '<span class="bkSt' + (ok ? ' on' : '') + '">' + (ok ? UI.img('ic_check', 12) + st : UI.img('ic_lock', 12) + 'NOT MADE YET') + '</span>';
    ref.desc.textContent = a.verb + '.';
    ref.cap.textContent = 'FORGED AT THE ARMORY';
    ref.rows.innerHTML = garmentRows(id);
    ref.drops.innerHTML = garmentDrops(id);
    ref.drops.className = 'bkDrops';
    ref.detail.classList.toggle('unseen', !ok);
    if (ref.page !== 'wardrobe') { ref.page = 'wardrobe'; ref.cv.width = CPV.W; ref.cv.height = CPV.H; }
    SPV.stop(); CPV.stop();
    Book.stillGarment(ref.cv, id);
    ref.list.querySelector('.bkItem.on').scrollIntoView({ block: 'nearest' });
  };
  Book.stillGarment = function (cv, id) {   // the Wizard on the meadow in the garment, large
    const c = cv.getContext('2d'), s = SP.wizard, o = SP['ao_' + id];
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2e6a3a'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#3a7e46'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % cv.width, (i * 37) % cv.height, 6, 3);
    const k = Math.max(1, Math.floor(Math.min(cv.width * 0.7 / s.c.width, cv.height * 0.8 / s.c.height))), x = Math.round(cv.width / 2), y = Math.round(cv.height * 0.9);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x - Math.round(s.c.width * k / 2), y - 4, s.c.width * k, 8);
    c.drawImage(s.c, x - s.ax * k, y - s.ay * k, s.c.width * k, s.c.height * k);
    if (o) c.drawImage(o.c, x - o.ax * k, y - o.ay * k, o.c.width * k, o.c.height * k);
  };
  // wild foes, the Warden and the Chimera have no scripted demo: just the sprite, large, on the meadow
  Book.stillLife = function (cv, id) {
    const c = cv.getContext('2d'), s = SP[id];
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2e6a3a'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#3a7e46'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % cv.width, (i * 37) % cv.height, 6, 3);
    if (!s) return;
    const k = Math.max(1, Math.floor(Math.min(cv.width * 0.7 / s.c.width, cv.height * 0.8 / s.c.height)));
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(Math.round(cv.width / 2 - s.c.width * k / 2), Math.round(cv.height * 0.9 - 4), s.c.width * k, 8);
    c.drawImage(s.c, Math.round(cv.width / 2 - s.ax * k), Math.round(cv.height * 0.9 - s.ay * k), s.c.width * k, s.c.height * k);
  };
  Book.render = function () { Book.build(); Book.fillList(); Book.fillDetail(); };
  Book.setPage = function (p) { if (p === Book.page) return; Book.page = p; AU.sfx('tab'); Book.fillList(); Book.fillDetail(); };
  Book.pick = function (id) { if (id === Book.sel[Book.page]) return; Book.sel[Book.page] = id; AU.sfx('blip'); Book.fillDetail(); };
  Book.step = function (d) {
    const ids = idsOf(Book.page), i = ids.indexOf(Book.sel[Book.page]);
    Book.pick(ids[(i + d + ids.length) % ids.length]);
  };
  // open over the (paused) game: from play it pauses the game itself; from the pause menu it hides the menu and brings it back on close
  Book.open = function (fromPause) {
    if (Book.isOpen || !G) return;
    Book.from = fromPause || Main.isPaused() ? 'pause' : 'play';
    if (!Main.isPaused()) Main.pause(true);
    UI.show('pause', false);
    Book.isOpen = true; UI.show('book', true); Book.render(); AU.sfx('menu_open');
  };
  Book.close = function (quiet) {
    if (!Book.isOpen) return;
    SPV.stop(); CPV.stop();
    Book.isOpen = false; UI.show('book', false);
    if (quiet) return;
    AU.sfx('menu_close');
    if (Book.from === 'pause') UI.show('pause', true); else Main.pause(false);
  };
  // called every frame while the game is up: keys / pad for the open book
  Book.tick = function (dt) {
    if (!Book.isOpen) return;
    const p0 = IN.pad[0], p1 = Net.on ? null : IN.pad[1], pad = (f) => (p0 && p0[f]) || (p1 && p1[f]);
    if (IN.hit('Escape') || IN.hit('KeyC') || pad('b') || pad('back')) {
      Book.close();
      IN.pressed.delete('Escape'); IN.pressed.delete('KeyC');   // the same press must not also pause (Esc) or reopen (C) in this frame's controls
      for (const q of [p0, p1]) if (q) { q.b = false; q.back = false; }
      return;
    }
    const flip = d => Book.setPage(PAGES[(PAGES.indexOf(Book.page) + d + PAGES.length) % PAGES.length]);
    if (pad('lb')) flip(-1);
    if (pad('rb')) flip(1);
    if (IN.hit('Tab')) flip(IN.shift() ? -1 : 1);
    if (IN.hit('ArrowLeft') || IN.hit('KeyA')) Book.setPage(PAGES[Math.max(0, PAGES.indexOf(Book.page) - 1)]);
    if (IN.hit('ArrowRight') || IN.hit('KeyD')) Book.setPage(PAGES[Math.min(PAGES.length - 1, PAGES.indexOf(Book.page) + 1)]);
    if (IN.hit('ArrowUp') || IN.hit('KeyW')) Book.step(-1);
    if (IN.hit('ArrowDown') || IN.hit('KeyS')) Book.step(1);
    const iy = (p0 && p0.iy) || (p1 && p1.iy) || 0;   // the stick: one step per push, then a repeat
    if (Math.abs(iy) > 0.6) {
      if (!Book.navHeld) { Book.navHeld = true; Book.navT = 0.35; Book.step(iy > 0 ? 1 : -1); }
      else if ((Book.navT -= dt) <= 0) { Book.navT = 0.15; Book.step(iy > 0 ? 1 : -1); }
    } else Book.navHeld = false;
  };
})();
