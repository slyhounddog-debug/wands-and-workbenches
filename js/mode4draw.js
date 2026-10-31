'use strict';
// 4-PLAYER MODE, drawing helpers (loaded after feedbackdraw.js). Pure functions of G and the clock: they never write to G.
// Every character wears his seat's colour and name (identity), so a cue can say WHICH Wizard / Builder.

// the OTHER Wizard as a drawable wizard: the shared fields of G.w with his own fields (G.w2) laid over them, his garments and his wand
R.wizOther = function () {
  return Object.assign({}, G.w, G.w2, { other: true, augW: G.aug2.worn, augCd: G.aug2.cd.phoenix, wandX: G.wand2 });
};
// a coloured ring on the ground at his feet and his name under it: p = his screen position, s = the seat
R.seatTag = function (ctx, v, p, s) {
  const q = G.seats && G.seats[s];
  if (!q) return;
  const me = s === M4.me() || (G.vi != null && M4.pairSeat(G.vi) === s && false);
  ctx.strokeStyle = q.col; ctx.lineWidth = 3; ctx.globalAlpha = me ? 0.95 : 0.7;
  diamond(ctx, p[0], p[1] + 2, 22, 11); ctx.stroke();
  ctx.globalAlpha = 1;
  txt(ctx, q.name, Math.round(p[0]), Math.round(p[1]) + 30, 9, q.col, 'center', 'd');
};
// 4P: a fallen Wizard's screen says whose it is and when he gets up (the run only ends when both are down)
R.drawDown = function (ctx, left, right, w) {
  const s = M4.seatW(G.wi || 0), left_ = Math.max(0, Math.ceil(CFG.mode4.respawnT - (w.deadT || 0)));
  txt(ctx, M4.name(s) + ' IS DOWN', Math.round((left + right) / 2), 150, 28, '#ff8a8a', 'center', 'd');
  txt(ctx, 'back on his feet in ' + left_ + ' s  (his partner keeps going)', Math.round((left + right) / 2), 190, 14, '#ffffff', 'center', 'd');
};
// a small coloured badge (used by the HUD cards and cues): the seat's name in its colour
R.seatName = function (s) { return M4.name(s); };
