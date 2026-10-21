'use strict';
// Keyboard / mouse / gamepad collection. Gameplay reads this once per frame, then IN.endFrame() clears edges.
const IN = {
  keys: new Set(), pressed: new Set(),
  mouse: { x: 0, y: 0, l: false, r: false, lp: false, rp: false, inside: false },
  wheel: 0,
  pad: [null, null], prevBtn: [[], []],
  padList: [],
  anyKey: false,
};

(function () {
  const BLOCK = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Space', 'Period', 'Comma', 'Quote', 'F3']);
  window.addEventListener('keydown', e => {
    if (BLOCK.has(e.code) && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) e.preventDefault();
    if (!e.repeat) { IN.pressed.add(e.code); IN.anyKey = true; }
    IN.keys.add(e.code);
  });
  window.addEventListener('keyup', e => { IN.keys.delete(e.code); });
  window.addEventListener('blur', () => { IN.keys.clear(); });
  const cv = () => document.getElementById('cv');
  function pos(e) {
    const r = cv().getBoundingClientRect();
    IN.mouse.x = (e.clientX - r.left) * CFG.W / r.width;
    IN.mouse.y = (e.clientY - r.top) * CFG.H / r.height;
    IN.mouse.moved = true;
    IN.mouse.mv = true;
  }
  window.addEventListener('mousemove', e => { pos(e); });
  window.addEventListener('mousedown', e => {
    pos(e);
    if (e.target && e.target.id === 'cv') {
      if (e.button === 0) { IN.mouse.l = true; IN.mouse.lp = true; }
      if (e.button === 2) { IN.mouse.r = true; IN.mouse.rp = true; }
    }
    IN.anyKey = true;
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) IN.mouse.l = false;
    if (e.button === 2) IN.mouse.r = false;
  });
  window.addEventListener('wheel', e => {
    pos(e);
    if (e.target && e.target.closest && e.target.closest('.tree, #pause, #results, .sheet')) return;
    IN.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  window.addEventListener('contextmenu', e => { if (e.target && e.target.id === 'cv') e.preventDefault(); });
  window.addEventListener('gamepadconnected', e => {
    if (window.UI) UI.toast('Controller ' + (e.gamepad.index + 1) + ' connected: ' + (IN.padList.length <= 1 ? 'Builder' : 'Wizard') + ' side', 'L', 'ic_pad');
  });
})();

IN.down = code => IN.keys.has(code);
IN.hit = code => IN.pressed.has(code);

IN.pollPads = function () {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const list = [];
  for (let i = 0; i < gps.length; i++) if (gps[i] && gps[i].connected) list.push(gps[i]);
  IN.padList = list;
  for (let p = 0; p < 2; p++) {
    const g = list[p];
    if (!g) { IN.pad[p] = null; IN.prevBtn[p] = []; continue; }
    const b = g.buttons.map(x => x.pressed);
    const prev = IN.prevBtn[p];
    const edge = i => b[i] && !prev[i];
    let ix = g.axes[0] || 0, iy = g.axes[1] || 0;
    if (Math.hypot(ix, iy) < 0.25) { ix = 0; iy = 0; }
    if (b[14]) ix = -1; if (b[15]) ix = 1; if (b[12]) iy = -1; if (b[13]) iy = 1;
    IN.pad[p] = {
      ix, iy,
      a: edge(0), b: edge(1), x: edge(2), y: edge(3), lb: edge(4), rb: edge(5),
      xHeld: !!b[2], aHeld: !!b[0], bHeld: !!b[1], startHeld: !!b[9], back: edge(8),
      any: b.some(Boolean),
    };
    IN.prevBtn[p] = b;
  }
};

IN.endFrame = function () {
  IN.pressed.clear();
  IN.mouse.lp = false; IN.mouse.rp = false; IN.mouse.mv = false;
  IN.wheel = 0;
  IN.anyKey = false;
};
