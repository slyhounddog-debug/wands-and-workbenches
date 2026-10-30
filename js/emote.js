'use strict';
// The Wizard's EMOTES (plain WZ extensions, loaded after bshrine.js). A hotkey (N on the keyboard, RB on his pad) toggles a radial wheel of four element dances; the stick / movement keys
// pick one, the hotkey again (or Mash) confirms, Cast / Dodge / Esc-less cancel. Air = a floating dance, Water = a rain dance, Fire = a fire dance, Earth = a stomp dance. The dance repeats
// forever until he moves (or acts). Starting one pops a sticker (a die-cut picture of him doing it) on the Builder's side for a few seconds.
// All plain data in G.w (run state, snapshot-safe): w.wheel = { sel: element | null } while the wheel is up, w.emote = { el, t, b } while he dances, w.stk = { el, t, dur } the sticker.
const EMOTE_DIR = { air: [0, -1], fire: [1, 0], water: [0, 1], earth: [-1, 0] };   // where each sits on the wheel (up / right / down / left, on screen)
WZ.emoteOrder = ['air', 'fire', 'water', 'earth'];
WZ.emoteName = { air: 'FLOAT', water: 'RAIN', fire: 'BLAZE', earth: 'STOMP' };
// can he emote right now?
WZ.emoteOk = function () {
  const w = G.w;
  return !G.menu && !w.dead && !w.ride && !(w.statT > 0) && !w.jump && !w.blink && !(w.roll > 0) && !w.sg;
};
WZ.emoteEnd = function () { const w = G.w; w.emote = null; };
WZ.emoteStart = function (el) {
  const w = G.w, C = CFG.emote;
  w.emote = { el, t: 0, b: -1 };
  w.stk = { el, t: 0, dur: C.sticker };
  w.vx = 0; w.vy = 0; w.target = null;
  WZ.ring(w.x, w.y, 1.5, ELEM[el].color, 0.4); WZ.epuff(w.x, w.y, el, 10);
  AU.sfx('el_' + el); UI.changed();
};
// before the movement / buttons are read: the wheel and the dance eat or end the input. Returns the (possibly cleared) { ix, iy, roll, act }
WZ.emoteInput = function (ix, iy, roll, A) {
  const w = G.w, out = { ix, iy, roll, act: A };
  if (G.menu) return out;
  if (!WZ.emoteOk()) { w.wheel = null; if (w.emote && (w.ride || w.statT > 0 || w.jump || w.blink)) w.emote = null; return out; }
  if (w.wheel) {
    const m = Math.hypot(ix, iy);
    if (m > 0.5) w.wheel.sel = Math.abs(ix) > Math.abs(iy) ? (ix > 0 ? 'fire' : 'earth') : (iy < 0 ? 'air' : 'water');   // (ix, iy) are on-screen directions
    if (A.emote || A.mash) { const sel = w.wheel.sel; w.wheel = null; AU.sfx('blip'); if (sel) WZ.emoteStart(sel); }
    else if (roll || A.cast) { w.wheel = null; AU.sfx('blip'); }
    return { ix: 0, iy: 0, roll: false, act: { mash: false, cast: false, cycle: false, emote: false } };   // the wheel has the controls: he stands still
  }
  if (A.emote) { w.wheel = { sel: w.emote ? w.emote.el : null }; AU.sfx('blip'); return { ix: 0, iy: 0, roll: false, act: Object.assign({}, A, { emote: false, mash: false, cast: false }) }; }
  if (w.emote && (ix || iy || roll || A.mash || A.cast)) WZ.emoteEnd();   // moving (or any action) ends the dance
  return out;
};
// every step: the dance beat (dust, ripples, sparks, stomps) and the sticker's clock
WZ.emoteTick = function (dt) {
  const w = G.w, C = CFG.emote;
  if (w.stk) { w.stk.t += dt; if (w.stk.t >= w.stk.dur) w.stk = null; }
  const e = w.emote;
  if (!e) return;
  if (w.dead) { w.emote = null; return; }
  e.t += dt;
  w.vx = 0; w.vy = 0;
  const b = Math.floor(e.t / C.beat);
  if (b !== e.b) {
    e.b = b;
    const x = w.x, y = w.y;
    if (e.el === 'earth') {   // the stomp: dust, a ring, a little shake and a thud on every beat
      WZ.puff(x, y, '#a98a5c', 8); WZ.ring(x, y, 1.8, '#b58a4c', 0.35); w.shake = Math.max(w.shake, 0.1); AU.sfx('thud');
    } else if (e.el === 'water') { WZ.ring(x, y, 1.4, '#4aa8ff', 0.5); AU.sfx('el_water'); }
    else if (e.el === 'fire') { WZ.ring(x, y, 1.3, '#ff7a30', 0.3); WZ.epuff(x, y, 'fire', 5); }
    else { WZ.ring(x, y, 1.5, '#e6f8ff', 0.5); WZ.epuff(x, y, 'air', 4); }
  }
};
