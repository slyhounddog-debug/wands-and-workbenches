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
// 4P, a Builder seat: the Wizard who is NOT in the corner picture, as a headshot card just above it (his face, name, health and armour; DOWN + his seconds while he is
// down), so the Builder keeps an eye on both Wizards. i = that Wizard. Drawn at full res on the stage, after the picture (R.drawPip); a pure function of G and the clock.
R.drawPipHead = function (ctx, i) {
  const q = R.pipRect;
  if (!q) return;
  const w = WZ.pw(i), s = M4.seatW(i), col = M4.col(s), mh = WZ.maxHp(), fr = Math.max(0, Math.min(1, w.hp / mh));
  const CW = 248, CH = 58, x = q.x + q.w - CW, y = q.y - CH - 6, low = !w.dead && fr < 0.3 && Math.sin(G.w.t * 9) > 0;
  R.pipRect = { x: q.x, y, w: q.w, h: q.y + q.h - y };   // (the mouse ignores the card like the picture: it never aims a throw into the factory under it)
  ctx.save();
  ctx.fillStyle = low ? '#ff5a6a' : col; ctx.fillRect(x, y, CW, CH);
  ctx.fillStyle = '#1a0f28'; ctx.fillRect(x + 3, y + 3, CW - 6, CH - 6);
  // the face: the top of his sprite (hat, face, beard, shoulders; not the staff), scaled up in a framed box
  const B = 46, bx = x + 6, by = y + 6, spr = SP.wizard, sw = 12, sh = Math.max(1, spr.c.height - 6), k = Math.max(1, Math.floor((B - 4) / Math.max(sw, sh)));
  ctx.fillStyle = col; ctx.fillRect(bx, by, B, B);
  ctx.fillStyle = '#2a1a3a'; ctx.fillRect(bx + 2, by + 2, B - 4, B - 4);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = w.dead ? 0.35 : 1;
  ctx.drawImage(spr.c, 0, 0, sw, sh, Math.round(bx + (B - sw * k) / 2), by + B - 2 - sh * k, sw * k, sh * k);
  ctx.globalAlpha = 1;
  ctx.restore();
  const tx = bx + B + 8, bw = x + CW - 9 - tx;
  drawText(ctx, M4.name(s), tx, y + 19, 10, col, 'left', 'd');
  drawText(ctx, '[' + Keys.label('pip3') + '] SWAP', x + CW - 9, y + 19, 8, '#ffe36b', 'right', 'd');
  if (w.dead) {
    const left = Math.max(0, Math.ceil(CFG.mode4.respawnT - (w.deadT || 0)));
    drawText(ctx, 'DOWN  ' + left + 's', tx, y + 44, 12, '#ff9ab0', 'left', 'd');
    return;
  }
  ctx.fillStyle = '#3a2a4a'; ctx.fillRect(tx, y + 27, bw, 10);
  ctx.fillStyle = '#ff5a6a'; ctx.fillRect(tx, y + 27, Math.round(bw * fr), 10);
  ctx.fillStyle = '#3a2a4a'; ctx.fillRect(tx, y + 41, bw, 6);
  if (w.armor > 0) { ctx.fillStyle = '#7bb8ff'; ctx.fillRect(tx, y + 41, Math.round(bw * Math.min(1, w.armor / CFG.wizard.armorMax)), 6); }
};
// a small coloured badge (used by the HUD cards and cues): the seat's name in its colour
R.seatName = function (s) { return M4.name(s); };
