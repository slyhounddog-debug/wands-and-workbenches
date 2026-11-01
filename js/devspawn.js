'use strict';
// DEV ONLY (offline): the SPAWN tab of the F3 overlay. Four sub-tabs of buttons, one click = one of that thing:
//   ENEMIES   wild foes + the 11 crafted creatures (hostile) drop out of a portal on screen; the Chimera rises beside the Wizard. ELITE makes the next ones elites.
//   ALLIES    the 11 friendly creatures (WZ.spawnAlly, so the ally cap applies)
//   SPELLS    the 4 basics + 11 combos go through the REAL delivery (FA.deliver): slurped into the Spell Portal, arc into the wilds, drop in, cast
//   RESOURCES fly out of the Spell Portal to their Stockpile tile (FA.toStock), Shift = 10. Raw, Cores, packets, combo spells and garments.
// Everything goes through the game's own functions; this file only builds the buttons (UI.updateDebug owns the panel). Never saved, never online.
const DevSpawn = { tab: 'enemies', elite: false, built: false };

(function () {
  const WILD = ['slime', 'shroom', 'sprite', 'imp', 'lurker', 'golem'];
  const COMBO = Object.keys(SPELLS).slice(4);
  const entry = (id, key, name, kind) => ({ id, key, name, kind });
  const groups = {
    enemies: () => [
      ['WILD FOES', WILD.map(t => entry(t, t, CFG.enemies[t].name, 'foe'))],
      ['CRAFTED CREATURES', Object.keys(CFG.creatures).map(c => entry(c, c, CFG.creatures[c].name, 'crafted'))],
      ['BOSS', [entry('boss', 'boss', 'Primal Chimera', 'boss')]],
    ],
    allies: () => [['ALLY CREATURES (cap ' + CFG.ally.cap + ')', Object.keys(CFG.creatures).map(c => entry(c, c, CFG.creatures[c].name, 'ally'))]],
    spells: () => [
      ['BASIC SPELLS', ELEMS.map(el => entry(el, el, SPELLS[BASIC_SPELL[el]], 'spell'))],
      ['COMBO SPELLS', COMBO.map(s => entry(s, s, SPELLS[s], 'spell'))],
    ],
    resources: () => [
      ['RAW (Shift = 10)', ['wood', 'stone', 'iron', 'shard', 'wardkey'].map(k => entry(k, k, RES[k].short || RES[k].name, 'res'))],
      ['CORES', ELEMS.map(el => entry('core_' + el, 'core_' + el, CORE_NAME[el], 'res'))],
      ['ELEMENT PACKETS', ELEMS.map(el => entry(el, el, ELEM_WORD[el] + ' Spell', 'res'))],
      ['COMBO SPELLS', COMBO.map(s => entry(s, s, SPELLS[s], 'res'))],
      ['GARMENTS', AUG_ORDER.map(a => entry('aug_' + a, 'aug_' + a, AUGS[a].name, 'res'))],
    ],
  };
  const TABS = [['enemies', 'ENEMIES'], ['allies', 'ALLIES'], ['spells', 'SPELLS'], ['resources', 'RESOURCES']];

  DevSpawn.ok = () => !!(G && G.w && G.fac && !G.menu && !Net.role && !Net.on && !G.m4);
  const say = (t) => UI.toast(t, 'L', 'ic_warn');
  const alive = () => { if (WZ.anyAlive()) return true; say('The Wizard is down'); return false; };

  // an enemy dropped in through a portal (the hatch effect the Spawner's creatures use), so it is easy to see where it landed
  const dropIn = (e, col) => {
    const C = CFG.crafted;
    e.fallT0 = e.fall = C.fall + 0.25; e.dazeT = C.daze;
    G.w.fx_.push({ type: 'hatch', x: e.x, y: e.y, col: col || '#ffffff', t: 0, dur: C.fall + 0.25 + 0.35 });
    AU.sfx('portalDrop');
  };
  DevSpawn.foe = function (id) {
    if (!alive()) return null;
    const spot = WZ.spawnSpot(); if (!spot) return null;
    const e = WZ.makeEnemy(id, spot[0], spot[1], DevSpawn.elite);
    e.wild = true; e.hp = e.maxHp = e.maxHp * CFG.world.wildHp; e.dmg *= CFG.world.wildDmg;
    dropIn(e, CFG.enemies[id].col);
    return e;
  };
  DevSpawn.crafted = function (id) {
    if (!alive()) return null;
    const e = WZ.spawnCreature(id);   // (its own portal drop, counts as a crafted creature)
    if (e && DevSpawn.elite && !e.elite) { WZ.eliteUp(e, CFG.crafted.eliteHp, CFG.crafted.eliteDmg); e.sz *= 1.25; }
    return e;
  };
  DevSpawn.ally = function (id) {
    if (!alive()) return null;
    if (WZ.allyAlive() >= CFG.ally.cap) { say('Ally cap reached (' + CFG.ally.cap + ')'); return null; }
    return WZ.spawnAlly(id);
  };
  DevSpawn.boss = function () {
    if (!alive()) return false;
    if (G.w.boss) { say('The Chimera is already out'); return false; }
    return WZ.summonBoss();
  };
  DevSpawn.spell = function (kind) { if (alive()) FA.deliver(kind); };
  DevSpawn.res = function (kind, n) {
    const room = FA.room(kind);
    if (room <= 0) { UI.toast('No room in the Stockpile for ' + itemName(kind), 'L', 'ic_full'); return; }
    FA.toStock(kind, Math.min(n, room));
  };
  DevSpawn.click = function (kind, id, shift) {
    if (!DevSpawn.ok()) return;
    if (kind === 'foe') DevSpawn.foe(id);
    else if (kind === 'crafted') DevSpawn.crafted(id);
    else if (kind === 'ally') DevSpawn.ally(id);
    else if (kind === 'boss') DevSpawn.boss();
    else if (kind === 'spell') DevSpawn.spell(id);
    else if (kind === 'res') DevSpawn.res(id, shift ? 10 : 1);
  };

  // ---------- the panel (built into `root` once; a sub-tab only swaps the grid) ----------
  DevSpawn.build = function (root) {
    root.innerHTML = '<div class="dsTabs"></div><label class="dsElite"><input type="checkbox"> ELITE (enemies spawn as elites)</label><div class="dsGrid"></div>';
    DevSpawn.tabs = root.querySelector('.dsTabs'); DevSpawn.grid = root.querySelector('.dsGrid'); DevSpawn.eliteRow = root.querySelector('.dsElite');
    DevSpawn.tabs.innerHTML = TABS.map(t => '<button class="px" data-st="' + t[0] + '">' + t[1] + '</button>').join('');
    DevSpawn.tabs.addEventListener('click', e => { const s = e.target && e.target.dataset && e.target.dataset.st; if (s) { DevSpawn.tab = s; AU.sfx('tab'); DevSpawn.fill(); } });
    DevSpawn.eliteRow.querySelector('input').addEventListener('change', e => { DevSpawn.elite = e.target.checked; });
    DevSpawn.grid.addEventListener('click', e => {
      const b = e.target && e.target.closest && e.target.closest('button[data-k]');
      if (b) DevSpawn.click(b.dataset.k, b.dataset.id, e.shiftKey);
    });
    root.addEventListener('mousedown', e => e.preventDefault());   // a clicked button must not keep the keyboard (Space is the Wizard's roll)
    DevSpawn.built = true;
    DevSpawn.fill();
  };
  DevSpawn.fill = function () {
    for (const b of DevSpawn.tabs.children) b.classList.toggle('on', b.dataset.st === DevSpawn.tab);
    DevSpawn.eliteRow.style.display = DevSpawn.tab === 'enemies' ? '' : 'none';
    DevSpawn.grid.innerHTML = groups[DevSpawn.tab]().map(g => '<h4>' + g[0] + '</h4><div class="dsRow">' + g[1].map(c =>
      '<button class="px" data-k="' + c.kind + '" data-id="' + c.id + '" title="' + c.name + '">' + UI.img(c.key, 28) + '<span>' + c.name + '</span></button>').join('') + '</div>').join('');
  };
})();
