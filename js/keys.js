'use strict';
// Keys: every keyboard hotkey of the Builder and the Wizard as a named ACTION, so the pause menu's Settings > Keys page can remap any of them and the game code asks
// "was the `use` action pressed?" instead of "was KeyE pressed?" (Keys.hit('use'), Keys.down('use'), Keys.move('B')).
// An action has a default list of keys per SCHEME (solo = the player has the keyboard to themself, duo = both players share it with the Builder on WASD, swap = shared and
// swapped: the Builder on the arrows), because the old three layouts are just different defaults. A remapped action takes ONE key and uses it in every scheme.
// The mouse buttons and the pad are not remappable; Esc / Enter and the F-keys are reserved. The map is the player's own setting (localStorage['wands_keys']), never part of a save.
const Keys = { map: {}, list: [], by: {} };
(function () {
  const K = 'wands_keys';
  const S = (...a) => ({ solo: a, duo: a, swap: a });   // the same in every scheme
  const act = (id, role, group, label, def) => { const a = { id, role, group, label, def: Array.isArray(def) ? S(...def) : def }; Keys.list.push(a); Keys.by[id] = a; return a; };
  const MV = (r, dirs) => dirs.forEach(([n, wasd, arrow, lab]) => act(r + n, r, r === 'B' ? 'BUILDER: WALK' : 'WIZARD: WALK', lab,
    { solo: [wasd, arrow], duo: [r === 'B' ? wasd : arrow], swap: [r === 'B' ? arrow : wasd] }));
  const D = [['Up', 'KeyW', 'ArrowUp', 'Up'], ['Down', 'KeyS', 'ArrowDown', 'Down'], ['Left', 'KeyA', 'ArrowLeft', 'Left'], ['Right', 'KeyD', 'ArrowRight', 'Right']];
  MV('B', D);
  const BG = 'BUILDER: ACTIONS';
  act('use', 'B', BG, 'Use / hand-gather / turn / recipe', { solo: ['KeyE', 'Slash'], duo: ['KeyE'], swap: ['Slash'] });
  act('pick', 'B', BG, 'Pick up (keyboard-only builder)', { solo: ['Period'], duo: [], swap: ['Period'] });
  act('throw', 'B', BG, 'Throw (keyboard-only builder)', { solo: ['Comma'], duo: [], swap: ['Comma'] });
  act('tumble', 'B', BG, 'Tumble roll', { solo: ['Space'], duo: ['Space'], swap: ['ShiftRight'] });
  act('element', 'B', BG, 'Switch the Harvester / Cauldron mode (+Shift = back)', ['KeyF']);
  act('pipette', 'B', BG, 'Pipette: clear the tool / copy the building under the cursor / last tool', ['KeyQ']);
  act('family', 'B', BG, 'Next building in the slot (+Shift = back)', ['KeyO']);
  act('demolish', 'B', BG, 'Demolish mode', ['KeyB', 'Delete']);
  act('rotate', 'B', BG, 'Rotate', ['KeyR']);
  act('autopick', 'B', BG, 'Auto-pickup on / off', ['KeyG']);
  act('pin', 'B', BG, 'Pin blueprint needs', ['KeyP']);
  act('lock', 'B', BG, 'Lock the next target (+Shift = back)', ['Tab']);
  act('hotPrev', 'B', BG, 'Previous hotbar slot', ['BracketLeft']);
  act('hotNext', 'B', BG, 'Next hotbar slot', ['BracketRight']);
  act('treeB', 'B', BG, 'Builder skill tree', ['KeyT']);
  for (let i = 1; i <= 9; i++) act('slot' + i, 'B', 'BUILDER: HOTBAR', 'Hotbar slot ' + i, ['Digit' + i]);
  MV('W', D);
  const WG = 'WIZARD: ACTIONS';
  act('wCycle', 'W', WG, 'Cycle the wand', { solo: ['KeyQ', 'KeyM'], duo: ['KeyM'], swap: ['KeyV'] });
  act('wCast', 'W', WG, 'Cast the wand', { solo: ['Comma'], duo: ['Comma'], swap: ['KeyZ'] });
  act('wDodge', 'W', WG, 'Dodge roll', { solo: ['Space', 'Period'], duo: ['Period'], swap: ['Space'] });
  act('wMash', 'W', WG, 'Mash: dig, wake shrines', { solo: ['Slash'], duo: ['Slash'], swap: ['KeyE'] });
  act('wEmote', 'W', WG, 'Emote wheel', ['KeyN']);
  act('wMap', 'W', WG, 'Big map', ['KeyL']);
  act('treeW', 'W', WG, 'Wizard skill tree', ['KeyY']);
  // the ROOTKEEPER (3-player mode only: the Settings > KEYS page lists these, and the two view keys below, only in a 3P game; m3 marks them)
  const KG = 'ROOTKEEPER', m3 = a => { a.m3 = true; return a; };
  D.forEach(([n, wasd, arrow, lab]) => m3(act('K' + n, 'K', 'ROOTKEEPER: WALK', lab, [wasd, arrow])));
  m3(act('kPick', 'K', KG, 'Pick up / take from a pylon / craft / place the tool (also left click)', ['Period']));
  m3(act('kThrow', 'K', KG, 'Throw remains / plant a seed or a trap (also right click)', ['Comma']));
  m3(act('kUse', 'K', KG, 'Use: mash a node or mirror Harvester, set a Burner, switch a crafter', ['KeyE', 'Slash']));
  m3(act('kRoll', 'K', KG, 'Root Roll (once the skill is bought)', ['Space']));
  m3(act('kTool', 'K', KG, 'Put the tool away', ['KeyQ']));
  m3(act('kPrev', 'K', KG, 'Previous tool', ['BracketLeft']));
  m3(act('kNext', 'K', KG, 'Next tool', ['BracketRight']));
  for (let i = 1; i <= 9; i++) m3(act('kSlot' + i, 'K', 'ROOTKEEPER: TOOLBAR', 'Tool ' + i, ['Digit' + i]));
  m3(act('kGhost', 'K', KG, 'Ghost view: the wilds above (foes, the Wizard)', ['KeyG']));
  m3(act('treeK', 'K', KG, 'Rootkeeper skill tree', ['KeyT']));
  m3(act('wGhost', 'W', WG, 'Ghost view: the underworld below (3-player)', ['KeyG']));
  m3(act('pip3', 'S', 'BOTH PLAYERS', 'Corner picture: the next teammate (3-player)', ['KeyJ']));
  act('swapHold', 'S', 'BOTH PLAYERS', 'Swap jobs (hold)', ['KeyX']);
  act('help', 'S', 'BOTH PLAYERS', 'Controls card', ['KeyH']);
  act('book', 'S', 'BOTH PLAYERS', 'Collection Book', ['KeyC']);

  Keys.RESERVED = new Set(['Escape', 'Enter', 'NumpadEnter', 'F1', 'F2', 'F3', 'F4', 'F5', 'F8', 'F9', 'F11', 'F12', 'Backquote', 'ShiftLeft', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'ContextMenu', 'CapsLock']);
  try { const o = JSON.parse(localStorage.getItem(K) || '{}'); for (const id in o) if (Keys.by[id] && (o[id] === null || typeof o[id] === 'string')) Keys.map[id] = o[id]; } catch (e) { /* no saved keys */ }
  Keys.save = () => { try { localStorage.setItem(K, JSON.stringify(Keys.map)); } catch (e) { /* storage full / blocked */ } };

  // which defaults apply: a guest's keyboard is always his own (solo); offline it follows the shared / swapped keyboard
  Keys.scheme = () => {
    if (typeof G === 'undefined' || !G || !G.ctl || (typeof Net !== 'undefined' && Net.role === 'guest') || typeof Main === 'undefined' || !Main.kbShared) return 'solo';
    return Main.kbShared() ? (G.swapped ? 'swap' : 'duo') : 'solo';
  };
  Keys.codes = (id, scheme) => {
    const o = Keys.map[id];
    if (o !== undefined) return o ? [o] : [];
    return Keys.by[id].def[scheme || Keys.scheme()];
  };
  Keys.hit = (id, hit) => { const h = hit || IN.hit; return Keys.codes(id).some(c => h(c)); };
  Keys.down = id => Keys.codes(id).some(c => IN.down(c));
  // the walking direction of a role ('B' | 'W') as [x, y] in -1..1 (screen axes, like the old KV)
  Keys.move = (role, scheme) => { const d = n => Keys.codes(role + n, scheme).some(c => IN.down(c)) ? 1 : 0; return [d('Right') - d('Left'), d('Down') - d('Up')]; };
  Keys.custom = id => Keys.map[id] !== undefined;

  const NAMES = { Space: 'SPACE', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', Tab: 'TAB', Backspace: 'BKSP', Delete: 'DEL', Insert: 'INS', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
    ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', NumpadAdd: 'NUM+', NumpadSubtract: 'NUM-', NumpadMultiply: 'NUM*', NumpadDivide: 'NUM/', NumpadDecimal: 'NUM.' };
  Keys.name = code => {
    if (!code) return '--';
    if (NAMES[code]) return NAMES[code];
    let m = /^Key(.)$/.exec(code); if (m) return m[1];
    m = /^Digit(\d)$/.exec(code); if (m) return m[1];
    m = /^Numpad(\d)$/.exec(code); if (m) return 'NUM' + m[1];
    return code.toUpperCase();
  };
  // what an action is called on a chip: the first of its keys ("E", "SPACE")
  Keys.label = id => Keys.name(Keys.codes(id)[0]);
  Keys.labels = id => { const c = Keys.codes(id); return c.length ? c.map(Keys.name).join(' / ') : '--'; };
  Keys.bindable = code => !!code && !Keys.RESERVED.has(code);
  // two actions clash when one player could press both at once: the same role, or either one shared by both
  const clash = (a, b) => a.role === b.role || a.role === 'S' || b.role === 'S';
  // bind `code` to an action; whoever else had it (a clashing action) gets this action's old key instead (a swap), so nothing is left without a key by accident. Returns the swapped action or null.
  Keys.set = (id, code) => {
    const a = Keys.by[id], prev = Keys.codes(id)[0] || null;
    if (!a || !Keys.bindable(code)) return null;
    let other = null;
    for (const o of Keys.list) if (o.id !== id && clash(a, o) && Keys.codes(o.id).indexOf(code) >= 0) { other = o; Keys.map[o.id] = prev; }
    Keys.map[id] = code; Keys.save();
    return other;
  };
  Keys.reset = id => { delete Keys.map[id]; Keys.save(); };
  Keys.resetAll = () => { Keys.map = {}; Keys.save(); };
})();
