'use strict';
// All art is drawn procedurally onto small offscreen canvases (1 canvas px = 1 art pixel).
const SP = {};

function mk(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  fn(x, w, h);
  return c;
}
function reg(name, c, ax, ay) {
  const s = { c, ax: ax === undefined ? c.width / 2 : ax, ay: ay === undefined ? c.height : ay };
  s.white = mk(c.width, c.height, x => { x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); });
  SP[name] = s;
  return s;
}
function mapSprite(rows, pal, trailing) {
  const w = Math.max.apply(null, rows.map(r => r.length)), h = rows.length;
  return mk(w, h, x => {
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch !== '.' && pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); }
      }
    });
  });
}
function poly(x, pts, col) {
  x.fillStyle = col; x.beginPath();
  x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  x.closePath(); x.fill();
}
function circ(x, cx, cy, r, col) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
// isometric prism: base diamond centered (cx,cy), half-width hw, height h
function isoBox(x, cx, cy, hw, h, top, left, right) {
  const hh = hw / 2;
  poly(x, [[cx - hw, cy], [cx, cy + hh], [cx, cy + hh - h], [cx - hw, cy - h]], left);
  poly(x, [[cx, cy + hh], [cx + hw, cy], [cx + hw, cy - h], [cx, cy + hh - h]], right);
  poly(x, [[cx, cy - hh - h], [cx + hw, cy - h], [cx, cy + hh - h], [cx - hw, cy - h]], top);
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * k))); g = Math.max(0, Math.min(255, Math.round(g * k))); b = Math.max(0, Math.min(255, Math.round(b * k)));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function crystal(x, cx, cy, col) {
  poly(x, [[cx, cy - 12], [cx + 4, cy - 6], [cx, cy], [cx - 4, cy - 6]], col);
  poly(x, [[cx, cy - 12], [cx - 4, cy - 6], [cx, cy]], shade(col, 1.18));
  poly(x, [[cx, cy - 12], [cx + 4, cy - 6], [cx, cy]], shade(col, 0.82));
}

SP.tasks = [];
function task(fn) { SP.tasks.push(fn); }

// ---------- characters ----------
task(() => {
  const pal = { y: '#ffc928', Y: '#d99a00', k: '#f2c9a0', d: '#2b2230', r: '#e0562a', b: '#2f6fc6', n: '#5a3a22' };
  const rows = [
    '....yyyy....', '...yyyyyy...', '..YYYYYYYY..', '...kkkkkk...', '...kdkkdk...', '...kkkkkk...', '....kkkk....',
    '..rrbbbbrr..', '.rrrbbbbrrr.', '.kkrbbbbrkk.', '...bbbbbb...', '...bb..bb...', '...bb..bb...', '..nnn..nnn..', '..nnn..nnn..',
  ];
  reg('builder', mapSprite(rows, pal));
  const rows2 = rows.slice(); rows2[11] = '...bb...b...'; rows2[12] = '...bb..bb...';
  reg('builder2', mapSprite(rows2, pal));
  // arms-up carrying pose
  const rows3 = rows.slice();
  rows3[2] = '.kYYYYYYYYk.'; rows3[3] = '.r.kkkkkk.r.'; rows3[4] = '.r.kdkkdk.r.'; rows3[5] = '.r.kkkkkk.r.'; rows3[6] = '.rr.kkkk.rr.';
  rows3[7] = '..rrbbbbrr..'; rows3[8] = '...rbbbbr...'; rows3[9] = '...bbbbbb...';
  reg('builderC', mapSprite(rows3, pal));
  const rows4 = rows3.slice(); rows4[11] = '...bb...b...';
  reg('builderC2', mapSprite(rows4, pal));
});
task(() => {
  const pal = { p: '#7b3fc4', P: '#5a2a9a', k: '#f2c9a0', d: '#2b2230', w: '#f4f4f4', b: '#3b5bd0', B: '#2c46a8', n: '#7a4a22', g: '#ffe36b' };
  const body = [
    '....pp......', '...pppp.....', '...pppp.....', '..pppppp....', '..pppppp....', '.PPPPPPPPPP.', '...kkkkkk...', '...kdkkdk...',
    '...kwwwwk...', '..bbwwwwbb..', '.kbbbwwbbbk.', '.bbbbbbbbbb.', '..bBbbbbBb..', '..bbbbbbbb..', '...nn..nn...', '...nn..nn...',
  ];
  const staff = ['...', '...', '.g.', 'ggg', '.g.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.', '.n.'];
  const rows = body.map((r, i) => r + staff[i]);
  reg('wizard', mapSprite(rows, pal), 6, 16);
});
task(() => {
  const pal = { g: '#6fd36b', G: '#3c9e48', w: '#ffffff', d: '#2b2230' };
  reg('slime', mapSprite(['....gggg....', '..gggggggg..', '.gggggggggg.', '.ggwdgggwdg.', '.ggddgggddg.', 'gggggggggggg', 'gGgggggggggG', 'GGGGGGGGGGGG'], pal));
  const p2 = { r: '#d8403a', R: '#a82a2a', w: '#fff', s: '#f1e3c4', d: '#2b2230' };
  reg('shroom', mapSprite(['....rrrr....', '..rrrrrrrr..', '.rrwwrrrwwr.', 'rrrwwrrrrrrr', 'rrrrrrrwwrrr', '.RRRRRRRRRR.', '...ssssss...', '...sdssds...', '...ssssss...', '...ssssss...', '..ss....ss..'], p2));
  const p3 = { y: '#ffd93b', w: '#fff7c0', o: '#ff9a2b', d: '#2b2230' };
  reg('sprite', mapSprite(['....yy....', '....yy....', '..yyyyyy..', 'yyyywwyyyy', '..yydwdy..'.slice(0, 10), '..yyyyyy..', '....oo....', '...o..o...'], p3));
  // biome foes (each weak to one element, see CFG.enemies)
  reg('imp', mapSprite(['..o......o..', '..oo....oo..', '...rrrrrr...', '..rrrrrrrr..', '.rryyrryyrr.', '.rrydrrydrr.', '.rrrrrrrrrr.',
    '..rrwwwwrr..', '...RrrrrR...', '..oo.rr.oo..', '.oo..RR..oo.', '....R..R....'], { o: '#ffd23a', r: '#ff7a30', R: '#c8431a', y: '#fff27a', d: '#2b2230', w: '#ffd0a0' }));
  reg('lurker', mapSprite(['..d........d..', '.dwd......dwd.', '..g........g..', '..gg......gg..', '..gggggggggg..', '.gGggggggggGg.', 'gggggwwwwggggg',
    'ggGgwdwwdwgGgg', 'GgggggggggggGG', '.GGggGGGGggGG.', '..GG.GG.GG.GG.'], { g: '#6a8a3a', G: '#46602a', w: '#e8f0c0', d: '#2b2230' }));
  reg('wisp', mapSprite(['...cccc...', '.cwwwwwc..', 'cwwdwwdwc.', 'cwwwwwwwwc', '.cwwwwwwc.', '..cwwwc...', '...cwc....', '..cc......', '.c........'],
    { c: '#7ec3e8', w: '#e6f8ff', d: '#2b2230' }));
  reg('golem', mapSprite(['....aaaaaa....', '...aAAAAAAa...', '...aAyAAyAa...', '...aAAAAAAa...', '.aaaaaaaaaaaa.', 'aAAaAAAAAAaAAa', 'aAAaAAggAAaAAa',
    'aAAaAAAAAAaAAa', 'aaa.aAAAAa.aaa', 'aa..aAAAAa..aa', '....aAAAAa....', '...aaA..Aaa...', '...aa....aa...'], { a: '#a9b0b8', A: '#7d858f', y: '#ffd23a', g: '#5ad06a' }));
  // the Primal Chimera: three heads, bat wings, a belly glowing in its current weakness (drawn by render.js)
  reg('boss', mk(32, 28, x => {
    poly(x, [[9, 14], [0, 4], [2, 14], [0, 20], [9, 20]], '#4a1a4a');
    poly(x, [[23, 14], [32, 4], [30, 14], [32, 20], [23, 20]], '#4a1a4a');
    poly(x, [[9, 14], [3, 8], [4, 15]], '#7a2a6a'); poly(x, [[23, 14], [29, 8], [28, 15]], '#7a2a6a');
    x.fillStyle = '#5a1a4a'; x.fillRect(9, 23, 4, 5); x.fillRect(19, 23, 4, 5);
    circ(x, 16, 18, 9, '#8a2a6a'); circ(x, 15, 17, 7, '#b03a8a');
    circ(x, 16, 21, 4, '#ff9ad0');
    circ(x, 7, 11, 4, '#8a2a6a'); circ(x, 25, 11, 4, '#8a2a6a'); circ(x, 16, 7, 5, '#b03a8a');
    poly(x, [[12, 4], [10, 0], [14, 3]], '#fff0c0'); poly(x, [[20, 4], [22, 0], [18, 3]], '#fff0c0');
    x.fillStyle = '#ffe36b'; x.fillRect(14, 6, 2, 2); x.fillRect(18, 6, 2, 2); x.fillRect(5, 10, 2, 1); x.fillRect(25, 10, 2, 1);
    x.fillStyle = '#2b2230'; x.fillRect(14, 10, 5, 1); x.fillRect(5, 13, 3, 1); x.fillRect(24, 13, 3, 1);
  }), 16, 28);
});

// ---------- items ----------
task(() => {
  // every element has its own silhouette, so packets read without colour: air = ring, water = drop, fire = flame, earth = block
  const PK = {
    air:   ['..oooo..', '.occcco.', 'occoocco', 'oco..oco', 'oco..oco', 'occoocco', '.occwco.', '..oooo..'],
    water: ['...oo...', '..occo..', '..occo..', '.occcco.', 'occwccco', 'occwccco', '.occcco.', '..oooo..'],
    fire:  ['.o...o..', 'oco.oco.', 'occoocco', 'occcccco', 'occwccco', 'occwccco', '.occcco.', '..oooo..'],
    earth: ['oooooooo', 'owwccCCo', 'owcccCCo', 'occccCCo', 'occccCCo', 'oCCCCCCo', 'oCCCCCCo', 'oooooooo'],
  };
  Object.keys(ELEM).forEach(k => {
    const e = ELEM[k];
    reg('pk_' + k, mapSprite(PK[k], { o: '#1a0f28', c: e.color, C: e.dark, w: '#ffffff' }), 4, 4);
  });
  reg('it_wood', mk(8, 8, x => {
    x.fillStyle = '#6e3f1c'; x.fillRect(0, 2, 8, 5); x.fillStyle = '#a8683a'; x.fillRect(0, 2, 8, 3);
    circ(x, 6.5, 4.5, 1.8, '#d9a066'); circ(x, 6.5, 4.5, 0.8, '#8a5528');
  }), 4, 6);
  reg('it_stone', mk(8, 8, x => {
    poly(x, [[1, 7], [0, 4], [2, 1], [6, 1], [8, 4], [7, 7]], '#8a929b');
    poly(x, [[2, 1], [6, 1], [8, 4], [4, 4]], '#bfc6cc');
  }), 4, 6);
  reg('it_iron', mk(8, 8, x => {
    poly(x, [[1, 7], [0, 4], [2, 1], [6, 1], [8, 4], [7, 7]], '#5b5560');
    x.fillStyle = '#e8883c'; x.fillRect(2, 3, 1, 1); x.fillRect(5, 2, 1, 1); x.fillRect(4, 5, 2, 1);
  }), 4, 6);
  reg('it_battery', mk(8, 10, x => {
    x.fillStyle = '#2b2230'; x.fillRect(0, 1, 8, 9); x.fillStyle = '#3ad06b'; x.fillRect(1, 2, 6, 7);
    x.fillStyle = '#2b2230'; x.fillRect(2, 0, 4, 1); x.fillStyle = '#d8ffe0'; x.fillRect(2, 3, 1, 3);
    x.fillStyle = '#ffe36b'; x.fillRect(3, 4, 3, 1);
  }), 4, 9);
  const flask = (name, liquid, big) => reg(name, mk(10, 12, x => {
    x.fillStyle = '#c9a26a'; x.fillRect(4, 0, 2, 2);
    x.fillStyle = 'rgba(230,240,255,0.9)'; x.fillRect(3, 2, 4, 2);
    circ(x, 5, big ? 7.5 : 8, big ? 4.4 : 3.8, 'rgba(230,240,255,0.95)');
    circ(x, 5, big ? 7.8 : 8.3, big ? 3.6 : 3, liquid);
    x.fillStyle = '#fff'; x.fillRect(3, 6, 1, 2);
  }), 5, 11);
  flask('it_potion', '#ff3a5a', false);
  flask('it_elixir', '#ff8ad8', true);
  const chest = (name, c1, c2) => reg(name, mk(12, 11, x => {
    poly(x, [[1, 1], [4, 0], [6, 2], [8, 0], [11, 1], [10, 5], [9, 10], [3, 10], [2, 5]], c2);
    poly(x, [[2, 2], [4, 1], [6, 3], [8, 1], [10, 2], [9, 5], [8, 9], [4, 9], [3, 5]], c1);
    x.fillStyle = '#fff'; x.fillRect(4, 3, 1, 3);
    x.fillStyle = c2; x.fillRect(6, 3, 1, 6);
  }), 6, 10);
  flask('it_armor', '#6a9aff', false);   // the Shield Potion and the Greater Shield Potion: blue flasks
  flask('it_plate', '#3a5aff', true);
  reg('gem', mk(6, 6, x => { poly(x, [[3, 0], [6, 3], [3, 6], [0, 3]], '#7be0ff'); poly(x, [[3, 0], [0, 3], [3, 3]], '#d5f6ff'); }), 3, 3);
  reg('it_shard', mapSprite(['...o....', '..oco...', '..occo..', '.occwco.', '.occwco.', 'occcccco', '.occcco.', '..oCCo..', '...oo...'],
    { o: '#3a1a5a', c: '#c890ff', C: '#8a54d0', w: '#ffffff' }), 4, 9);
  reg('it_sigil', mapSprite(['..oooooo..', '.orrrrrro.', 'orrwrrwrro', 'orrrwwrrro', 'orrwwwwrro', 'orrrwwrrro', 'orrwrrwrro', '.orrrrrro.', '..oooooo..'],
    { o: '#3a0a2a', r: '#ff4a8a', w: '#ffe36b' }), 5, 9);
});

// ---------- landmarks (anchored bottom centre) ----------
task(() => {
  reg('lm_camp', mk(34, 22, x => {
    poly(x, [[2, 18], [10, 4], [18, 18]], '#b0502a'); poly(x, [[10, 4], [18, 18], [12, 18]], '#7a3418'); poly(x, [[8, 18], [10, 12], [12, 18]], '#3a1a0a');
    poly(x, [[18, 16], [25, 5], [32, 16]], '#c87a3a'); poly(x, [[25, 5], [32, 16], [27, 16]], '#8a5020'); poly(x, [[23, 16], [25, 11], [27, 16]], '#3a1a0a');
    x.fillStyle = '#6e4423'; x.fillRect(15, 3, 2, 17);
    x.fillStyle = '#f1e3c4'; x.fillRect(14, 1, 4, 3); x.fillStyle = '#2b2230'; x.fillRect(15, 2, 1, 1); x.fillRect(17, 2, 1, 1);
    circ(x, 13, 20, 1.4, '#8a929b'); circ(x, 17, 21, 1.4, '#a1a6ae'); circ(x, 21, 20, 1.4, '#8a929b');
    x.fillStyle = '#5a3a22'; x.fillRect(14, 19, 6, 1);
  }), 17, 22);
  reg('lm_shrine', mk(18, 22, x => {
    isoBox(x, 9, 20, 8, 4, '#c9ccd2', '#a1a6ae', '#868b95');
    isoBox(x, 9, 16, 5, 7, '#b4b0c0', '#8a8698', '#6e6a7c');
    isoBox(x, 9, 9, 7, 1, '#d8d2e4', '#aea8ba', '#8c869a');
    x.fillStyle = '#ffe36b'; x.fillRect(6, 12, 1, 3); x.fillRect(11, 11, 1, 3);
  }), 9, 21);
  reg('lm_crypt', mk(30, 30, x => {
    isoBox(x, 15, 28, 14, 3, '#7a7488', '#5a5468', '#48425a');
    x.fillStyle = '#8a8698'; x.fillRect(5, 6, 6, 20); x.fillRect(19, 6, 6, 20);
    x.fillStyle = '#6e6a7c'; x.fillRect(9, 6, 2, 20); x.fillRect(23, 6, 2, 20);
    x.fillStyle = '#a8a2b8'; x.fillRect(3, 2, 24, 5); x.fillStyle = '#7a7488'; x.fillRect(3, 6, 24, 1);
    x.fillStyle = '#140a20'; x.fillRect(11, 9, 8, 17); x.fillRect(12, 8, 6, 1);
    x.fillStyle = '#2a1840'; x.fillRect(11, 22, 8, 1); x.fillRect(11, 18, 8, 1);
    x.fillStyle = '#b07aff'; x.fillRect(14, 3, 2, 2); x.fillRect(7, 10, 2, 1); x.fillRect(21, 10, 2, 1);
    x.fillStyle = '#6a8a56'; x.fillRect(5, 22, 3, 2); x.fillRect(22, 14, 2, 3);
  }), 15, 29);
});

// ---------- buildings (20 x 34, base diamond centered at (10,26)) ----------
function bsprite(name, fn) {
  reg(name, mk(20, 34, x => fn(x, 10, 26)), 10, 26);
}
task(() => {
  const stoneT = '#c9ccd2', stoneL = '#a1a6ae', stoneR = '#868b95';
  Object.keys(ELEM).forEach(k => {
    const col = ELEM[k].color;
    bsprite('b_' + k, (x, cx, cy) => {
      isoBox(x, cx, cy, 9, 5, stoneT, stoneL, stoneR);
      isoBox(x, cx, cy - 5, 5, 2, shade(col, 0.75), shade(col, 0.5), shade(col, 0.4));
      x.fillStyle = shade(col, 0.6);
      x.fillRect(cx - 8, cy - 3, 1, 2); x.fillRect(cx + 7, cy - 3, 1, 2);
    });
    reg('cr_' + k, mk(10, 18, x => {
      crystal(x, 5, 16, col);
      if (k === 'air') { x.strokeStyle = '#fff'; x.lineWidth = 0.8; x.beginPath(); x.arc(5, 9, 4, 0.3, 4.2); x.stroke(); }
      if (k === 'fire') poly(x, [[3, 12], [5, 1], [7, 12]], '#ffd23a');
      if (k === 'water') circ(x, 5, 8, 1.4, '#fff');
      if (k === 'earth') { x.fillStyle = '#e8d0a0'; x.fillRect(3, 8, 2, 2); x.fillRect(6, 10, 2, 1); }
    }), 5, 17);
  });
  bsprite('b_harness', (x, cx, cy) => {   // the one Harnesser: a stone base with a neutral steel plate (the crystal on top is drawn per element)
    isoBox(x, cx, cy, 9, 5, stoneT, stoneL, stoneR);
    isoBox(x, cx, cy - 5, 5, 2, '#a8b0c0', '#7a8294', '#626a7c');
    x.fillStyle = '#626a7c'; x.fillRect(cx - 8, cy - 3, 1, 2); x.fillRect(cx + 7, cy - 3, 1, 2);
  });
  bsprite('b_cauldron', (x, cx, cy) => {
    isoBox(x, cx, cy, 9, 3, '#b0a89a', '#8a8274', '#6e675b');
    // fire under the pot
    poly(x, [[cx - 4, cy - 2], [cx - 2, cy - 7], [cx, cy - 3], [cx + 2, cy - 8], [cx + 4, cy - 2]], '#ff8a2b');
    // pot body
    x.fillStyle = '#2b2733'; x.beginPath(); x.ellipse(cx, cy - 9, 7.5, 6, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3e3848'; x.beginPath(); x.ellipse(cx - 2, cy - 10, 3, 3, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1a1720'; x.beginPath(); x.ellipse(cx, cy - 14, 7, 2.6, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ff5a7a'; x.beginPath(); x.ellipse(cx, cy - 14, 5.6, 1.8, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffb0c4'; x.fillRect(cx - 3, cy - 15, 2, 1);
  });
  bsprite('b_anvil', (x, cx, cy) => {
    isoBox(x, cx, cy, 9, 6, '#8a6a4a', '#6a4e34', '#523c28');
    isoBox(x, cx, cy - 6, 4, 4, '#5a5a66', '#3c3c46', '#2e2e38');
    poly(x, [[cx - 9, cy - 12], [cx + 8, cy - 13], [cx + 6, cy - 9], [cx - 5, cy - 9]], '#7a7a8a');
    poly(x, [[cx - 9, cy - 12], [cx + 8, cy - 13], [cx + 7, cy - 14], [cx - 6, cy - 14]], '#b8b8c8');
    x.fillStyle = '#ff9a3a'; x.fillRect(cx + 4, cy - 4, 2, 2);
  });
  bsprite('b_forge', (x, cx, cy) => {
    isoBox(x, cx, cy, 9, 12, '#6a5a63', '#4a3d46', '#3a2f38');
    isoBox(x, cx + 3, cy - 6, 3, 8, '#585058', '#3c353c', '#2e282e');
    poly(x, [[cx - 7, cy - 2], [cx - 2, cy + 0.5], [cx - 2, cy - 5], [cx - 7, cy - 7.5]], '#ff9a2b');
    poly(x, [[cx - 6, cy - 3], [cx - 3, cy - 1.5], [cx - 3, cy - 4], [cx - 6, cy - 6]], '#ffe36b');
    x.fillStyle = '#d1c7cf'; x.fillRect(cx - 2, cy - 15, 5, 1);
  });
  bsprite('b_battery', (x, cx, cy) => {   // a Battery: a green cell housing with a terminal plate and a white cap 
    isoBox(x, cx, cy, 9, 8, '#8ee0a6', '#3c9e5a', '#2e7a46');
    poly(x, [[cx + 2, cy - 1], [cx + 7, cy - 3.5], [cx + 7, cy - 7], [cx + 2, cy - 4.5]], '#1c2a20');
    poly(x, [[cx + 3, cy - 2.3], [cx + 6, cy - 3.8], [cx + 6, cy - 6], [cx + 3, cy - 4.5]], '#3ad06b');
    isoBox(x, cx, cy - 8, 3, 3, '#e8e8e8', '#b0b0b0', '#909090');
  });
  bsprite('b_heavybat', (x, cx, cy) => {   // a Heavy Battery: a steel housing with a thick bolted band, taller, a gold terminal
    isoBox(x, cx, cy, 9, 11, '#9aa4b8', '#5e6a84', '#485470');
    poly(x, [[cx - 8, cy - 3], [cx, cy + 1], [cx, cy - 1], [cx - 8, cy - 5]], '#2e3648');
    poly(x, [[cx, cy + 1], [cx + 8, cy - 3], [cx + 8, cy - 5], [cx, cy - 1]], '#232a3a');
    poly(x, [[cx + 2, cy - 4], [cx + 7, cy - 6.5], [cx + 7, cy - 9.5], [cx + 2, cy - 7]], '#1c2a20');
    poly(x, [[cx + 3, cy - 5.3], [cx + 6, cy - 6.8], [cx + 6, cy - 8.5], [cx + 3, cy - 7]], '#ffd23a');
    isoBox(x, cx, cy - 11, 4, 3, '#f0f0f0', '#b0b0b0', '#909090');
  });
  bsprite('b_splitter', (x, cx, cy) => {
    isoBox(x, cx, cy, 9, 4, '#8a8fb0', '#5e6280', '#4a4e68');
    isoBox(x, cx, cy - 4, 5, 3, '#b0b4d0', '#7a7ea0', '#5e6280');
    x.fillStyle = '#ffe36b';   // a "Y" fork on the lid
    x.fillRect(cx, cy - 10, 1, 3); x.fillRect(cx - 2, cy - 12, 2, 1); x.fillRect(cx + 1, cy - 12, 2, 1); x.fillRect(cx - 3, cy - 13, 1, 1); x.fillRect(cx + 3, cy - 13, 1, 1);
  });
  bsprite('b_expand', (x, cx, cy) => {   // a slab of floor: grass over a dirt rim
    isoBox(x, cx, cy + 2, 9, 4, '#9be880', '#8a5c34', '#6a4426');
    x.fillStyle = '#c4f4a8'; x.fillRect(cx - 3, cy - 3, 2, 1); x.fillRect(cx + 2, cy - 2, 2, 1);
  });
  bsprite('b_crate', (x, cx, cy) => {
    isoBox(x, cx, cy, 8, 10, '#d8a066', '#a8683a', '#8a5528');
    x.fillStyle = '#6e3f1c';
    x.fillRect(cx - 8, cy - 6, 8, 1); x.fillRect(cx, cy - 2, 8, 1); x.fillRect(cx - 5, cy - 9, 1, 9); x.fillRect(cx + 4, cy - 7, 1, 9);
    x.fillStyle = '#c9ccd2'; x.fillRect(cx - 1, cy - 10, 2, 2);
  });
  bsprite('b_altar', (x, cx, cy) => {
    isoBox(x, cx, cy, 9, 3, '#c9ccd2', '#a1a6ae', '#868b95');
    isoBox(x, cx, cy - 3, 7, 3, '#b4b0c0', '#8a8698', '#6e6a7c');
    isoBox(x, cx, cy - 6, 4, 6, '#5a4a6a', '#3e3050', '#30243e');
    x.fillStyle = '#ff4a8a'; x.fillRect(cx - 3, cy - 13, 6, 1); x.fillRect(cx - 1, cy - 14, 2, 3);
    crystal(x, cx, cy - 17, '#c890ff');
  });
  bsprite('b_qstation', (x, cx, cy) => {   // the ? station: a violet block with a gold question mark floating over it
    isoBox(x, cx, cy, 9, 8, '#a98cf0', '#6a4cc0', '#523a98');
    const Q = ['.XXXX.', 'XX..XX', '....XX', '...XX.', '..XX..', '..XX..', '......', '..XX..'];
    Q.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'X') { x.fillStyle = '#1a0f28'; x.fillRect(cx - 4 + i - 1 + 1, cy - 24 + j + 1, 1, 1); x.fillStyle = '#ffd23a'; x.fillRect(cx - 3 + i - 1, cy - 25 + j, 1, 1); } });
  });
  bsprite('b_ghost', () => {});
});

// ---------- world: harvestables & decor (anchored bottom center) ----------
const SHRUB_SHAPES = ['hedge', 'fern', 'tall'], SHRUB_SIZES = [0.7, 1, 1.4];
const SHRUB_PALS = [['#2a7a36', '#3c9a44', '#6cc85a'], ['#1f6a5a', '#2f8f7a', '#62d0b0'], ['#6a7a2a', '#93a83a', '#cfe070'], ['#7a4422', '#b0682c', '#eaa24e'], ['#4a3a7a', '#6a58aa', '#a592e0']];
const SHRUB_NAMES = [];   // 'sh_<shape><size><colour>'
SHRUB_SHAPES.forEach((s, si) => SHRUB_SIZES.forEach((k, zi) => SHRUB_PALS.forEach((p, pi) => SHRUB_NAMES.push('sh_' + si + zi + pi))));
task(() => {
  reg('tree', mk(26, 36, x => {
    x.fillStyle = '#6e4423'; x.fillRect(11, 22, 4, 13); x.fillStyle = '#8a5a30'; x.fillRect(11, 22, 2, 13);
    circ(x, 13, 16, 9, '#2e8a3e'); circ(x, 8, 20, 6, '#2e8a3e'); circ(x, 18, 20, 6, '#2e8a3e');
    circ(x, 12, 12, 7, '#46b452'); circ(x, 9, 18, 4.5, '#46b452'); circ(x, 16, 9, 3.5, '#7bd462');
    circ(x, 15, 17, 1, '#e84a4a');
  }), 13, 35);
  reg('rock', mk(18, 14, x => {
    poly(x, [[1, 13], [0, 8], [4, 2], [11, 1], [17, 7], [17, 13]], '#7d858f');
    poly(x, [[4, 2], [11, 1], [17, 7], [9, 7]], '#b4bcc4');
    poly(x, [[1, 13], [0, 8], [4, 8], [5, 13]], '#646b74');
  }), 9, 13);
  reg('ore', mk(18, 15, x => {
    poly(x, [[1, 14], [0, 8], [4, 2], [11, 1], [17, 7], [17, 14]], '#4e4a58');
    poly(x, [[4, 2], [11, 1], [17, 7], [9, 7]], '#76707f');
    x.fillStyle = '#ff9d4a'; x.fillRect(5, 6, 2, 2); x.fillRect(11, 4, 2, 2); x.fillRect(9, 10, 3, 2); x.fillRect(3, 11, 2, 1);
    x.fillStyle = '#ffd9a8'; x.fillRect(5, 6, 1, 1); x.fillRect(11, 4, 1, 1);
  }), 9, 14);
  ['#ff6b8b', '#ffd93b', '#ffffff', '#b58cff'].forEach((col, i) => {
    reg('flower' + i, mk(7, 8, x => {
      x.fillStyle = '#3c9e48'; x.fillRect(3, 4, 1, 4); x.fillRect(1, 6, 2, 1); x.fillRect(4, 5, 2, 1);
      x.fillStyle = col; x.fillRect(2, 1, 3, 3); x.fillRect(3, 0, 1, 5); x.fillRect(1, 2, 5, 1);
      x.fillStyle = '#ffb02e'; x.fillRect(3, 2, 1, 1);
    }), 3, 7);
  });
  reg('tuft', mk(8, 6, x => {
    x.fillStyle = '#4aa84a'; x.fillRect(1, 2, 1, 4); x.fillRect(3, 0, 1, 6); x.fillRect(5, 1, 1, 5); x.fillRect(7, 3, 1, 3);
    x.fillStyle = '#7bd462'; x.fillRect(2, 3, 1, 3); x.fillRect(4, 2, 1, 4);
  }), 4, 5);
  reg('tuft2', mk(5, 4, x => {   // a little sprig
    x.fillStyle = '#3c9a44'; x.fillRect(0, 2, 1, 2); x.fillRect(2, 0, 1, 4); x.fillRect(4, 1, 1, 3);
    x.fillStyle = '#86dc6a'; x.fillRect(1, 1, 1, 3); x.fillRect(3, 2, 1, 2);
  }), 2, 3);
  reg('tuft3', mk(7, 9, x => {   // tall dark grass
    x.fillStyle = '#2e7a3a'; x.fillRect(1, 3, 1, 6); x.fillRect(3, 0, 1, 9); x.fillRect(5, 2, 1, 7);
    x.fillStyle = '#58b850'; x.fillRect(2, 4, 1, 5); x.fillRect(4, 1, 1, 8); x.fillRect(6, 5, 1, 4); x.fillRect(0, 6, 1, 3);
  }), 3, 8);
  // plain shrubs (decor you cannot search): 3 shapes x 3 sizes x 5 colours, no berries and no shine, so they never read as the berry bushes
  SHRUB_SHAPES.forEach((shape, si) => SHRUB_SIZES.forEach((k, zi) => SHRUB_PALS.forEach((p, pi) => {
    let c, ay;
    if (shape === 'hedge') {   // low and wide: a row of rounded humps
      const w = Math.round(20 * k), h = Math.round(9 * k) + 2, n = Math.max(3, Math.round(w / 5));
      c = mk(w, h, x => {
        for (let i = 0; i < n; i++) { const r = (h - 2) * (0.42 + 0.06 * ((i * 5) % 3)); circ(x, 3 + i * (w - 6) / (n - 1), h - 1 - r, r, p[0]); }
        for (let i = 0; i < n; i++) circ(x, 2 + i * (w - 6) / (n - 1), h * 0.45, (h - 2) * 0.28, p[1]);
        for (let i = 1; i < n; i += 2) { x.fillStyle = p[2]; x.fillRect(Math.round(1 + i * (w - 6) / (n - 1)), Math.round(h * 0.3), 2, 1); }
      });
      ay = h - 1;
    } else if (shape === 'fern') {   // blades fanning out of one spot
      const w = Math.round(16 * k), h = Math.round(12 * k);
      c = mk(w, h, x => {
        const cx = w / 2, by = h - 1;
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (i - 4) * 0.34, L = (h - 2) * (0.7 + 0.15 * ((i * 7) % 3));
          x.strokeStyle = i % 2 ? p[1] : p[0]; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, by); x.lineTo(cx + Math.cos(a) * L, by + Math.sin(a) * L); x.stroke();
          x.fillStyle = p[2]; x.fillRect(Math.round(cx + Math.cos(a) * L), Math.round(by + Math.sin(a) * L), 1, 1);
        }
        circ(x, cx, by - 1, 2, p[0]);
      });
      ay = h - 1;
    } else {   // tall: a narrow stack of leafy lumps
      const w = Math.round(10 * k), h = Math.round(17 * k);
      c = mk(w, h, x => {
        circ(x, w / 2, h - w * 0.5 - 1, w * 0.5, p[0]); circ(x, w / 2, h * 0.5, w * 0.42, p[0]); circ(x, w / 2, h * 0.3, w * 0.32, p[1]); circ(x, w / 2 - 1, h * 0.28, Math.max(1, w * 0.14), p[2]);
      });
      ay = h - 1;
    }
    reg('sh_' + si + zi + pi, c, c.width / 2, ay);
  })));
  reg('shrooms', mk(24, 12, x => {
    const spots = [[3, 6], [8, 3], [15, 3], [20, 6], [12, 9]];
    spots.forEach((p, i) => {
      x.fillStyle = '#f1e3c4'; x.fillRect(p[0], p[1] + 1, 2, 2);
      x.fillStyle = i % 2 ? '#e8503c' : '#c27cff'; x.fillRect(p[0] - 1, p[1] - 1, 4, 2);
      x.fillStyle = '#fff'; x.fillRect(p[0], p[1] - 1, 1, 1);
    });
  }), 12, 11);
  reg('fence', mk(16, 14, x => {
    x.fillStyle = '#a8683a'; x.fillRect(1, 4, 3, 10); x.fillRect(12, 4, 3, 10);
    x.fillStyle = '#c98a52'; x.fillRect(1, 4, 1, 10); x.fillRect(12, 4, 1, 10);
    x.fillStyle = '#8a5528'; x.fillRect(0, 6, 16, 2); x.fillRect(0, 10, 16, 2);
  }), 8, 13);
  reg('sign', mk(14, 20, x => {
    x.fillStyle = '#6e4423'; x.fillRect(6, 7, 2, 13);
    x.fillStyle = '#c98a52'; x.fillRect(1, 1, 12, 7); x.fillStyle = '#8a5528'; x.fillRect(1, 7, 12, 1);
    x.fillStyle = '#4a2a10'; x.fillRect(3, 3, 6, 1); x.fillRect(3, 5, 8, 1);
  }), 7, 19);
  reg('lantern', mk(10, 24, x => {
    x.fillStyle = '#4a3a30'; x.fillRect(4, 8, 2, 16);
    x.fillStyle = '#2b2230'; x.fillRect(1, 3, 8, 6);
    x.fillStyle = '#ffd96a'; x.fillRect(2, 4, 6, 4); x.fillStyle = '#fff6c0'; x.fillRect(4, 5, 2, 2);
    x.fillStyle = '#2b2230'; x.fillRect(2, 1, 6, 2);
  }), 5, 23);
  reg('pillar', mk(14, 30, x => {
    isoBox(x, 7, 26, 6, 22, '#d8d2c4', '#aea89a', '#8c867a');
    x.fillStyle = '#6a8a56'; x.fillRect(2, 14, 3, 2); x.fillRect(9, 8, 2, 3);
    poly(x, [[1, 3], [5, 0], [7, 4], [4, 6]], '#00000000');
  }), 7, 26);
  reg('crystals', mk(18, 20, x => {
    poly(x, [[9, 0], [13, 8], [11, 19], [7, 19], [5, 8]], '#b178f0');
    poly(x, [[9, 0], [5, 8], [7, 19], [9, 19]], '#d8b0ff');
    poly(x, [[3, 9], [6, 14], [5, 19], [1, 19]], '#8a54d0');
    poly(x, [[14, 10], [17, 19], [12, 19]], '#8a54d0');
  }), 9, 19);
  // forage spots: the Wizard mashes the roll button at these
  reg('mound', mk(20, 10, x => {
    poly(x, [[0, 9], [3, 4], [7, 1], [13, 1], [17, 4], [20, 9]], '#7a5a2c');
    poly(x, [[3, 4], [7, 1], [13, 1], [11, 4]], '#a8804a');
    poly(x, [[0, 9], [3, 4], [6, 9]], '#5a4020');
    x.fillStyle = '#c9a06a'; x.fillRect(8, 2, 2, 1); x.fillRect(13, 5, 2, 1);
    x.fillStyle = '#9aa0a8'; x.fillRect(5, 6, 2, 2); x.fillRect(14, 7, 2, 1);
    x.fillStyle = '#3c9e48'; x.fillRect(16, 2, 1, 2); x.fillRect(17, 3, 1, 1);
  }), 10, 9);
  reg('sticks', mk(20, 11, x => {
    const stick = (x0, y0, x1, y1, col) => { x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
    stick(1, 9, 15, 4, '#6e4423'); stick(4, 4, 19, 9, '#8a5a30'); stick(2, 7, 17, 7, '#a8683a');
    stick(6, 2, 12, 10, '#c98a52'); stick(9, 3, 16, 5, '#8a5a30');
    x.fillStyle = '#e4c08a'; x.fillRect(15, 3, 1, 1); x.fillRect(18, 8, 1, 1); x.fillRect(1, 8, 1, 1);
    x.fillStyle = '#46b452'; x.fillRect(12, 1, 2, 1);
  }), 10, 10);
  const bushBody = x => {
    circ(x, 11, 10, 7.5, '#2a7a36'); circ(x, 5, 12, 5, '#2a7a36'); circ(x, 17, 12, 5, '#2a7a36');
    circ(x, 10, 7, 5, '#46b452'); circ(x, 15, 9, 3, '#46b452'); circ(x, 8, 5, 2, '#7bd462');
  };
  reg('fbush', mk(22, 17, x => {
    bushBody(x);
    x.fillStyle = '#ff4a6a'; [[6, 9], [13, 6], [16, 12], [9, 13], [3, 13], [18, 9]].forEach(p => x.fillRect(p[0], p[1], 2, 2));
    x.fillStyle = '#ffd0dc'; x.fillRect(13, 6, 1, 1); x.fillRect(6, 9, 1, 1);
    x.fillStyle = '#b8c8e0'; x.fillRect(11, 11, 2, 2);   // something shiny inside
  }), 11, 16);
  reg('fbush_bare', mk(22, 17, x => {
    bushBody(x);
    x.fillStyle = '#1e5a28'; x.fillRect(7, 9, 2, 2); x.fillRect(14, 11, 2, 2);
  }), 11, 16);
  reg('pebbles', mk(10, 5, x => {
    circ(x, 3, 3, 2, '#9aa0a8'); circ(x, 7, 3.5, 1.5, '#b4bcc4'); circ(x, 5, 2, 1, '#c4ccd4');
  }), 5, 4);
});

// ---------- combo spell orbs (pixel stars in the spell colour) ----------
task(() => {
  const star = ['....o....', '...oco...', '...oco...', 'ooocccooo', 'occcwccco', '.occccco.', '..occco..', '.occocco.', '.oco.oco.', '.oo...oo.'];
  for (const k in SPELL_COL) {
    if (['gust', 'fireball', 'spray', 'boulder'].indexOf(k) >= 0) continue;
    reg('it_' + k, mapSprite(star, { o: '#2b1d3e', c: SPELL_COL[k], w: '#ffffff' }), 4.5, 10);
  }
});

// ---------- UI icons (pixel art, replace every emoji) ----------
task(() => {
  const pal = { o: '#2b1d3e', w: '#ffffff', r: '#e8384a', R: '#a82a3a', y: '#ffd23a', Y: '#d99a00', g: '#5ad06a', G: '#2e8a3e', b: '#4a8aff', B: '#2a5ac8',
    c: '#7be0ff', k: '#f2c9a0', p: '#9a5ad0', P: '#6a3aa0', n: '#8a5a30', N: '#5a3a1a', a: '#a8b0b8', A: '#6a7280', m: '#ff9ad0',
    O: '#ff8a2b', q: '#8a84a0' };
  const icon = (name, rows) => reg('ic_' + name, mapSprite(rows, pal), Math.max.apply(null, rows.map(r => r.length)) / 2, rows.length);
  icon('heart', ['.oo.oo.', 'orrorro', 'orwrrro', 'orrrrro', '.orrro.', '..oro..', '...o...']);
  icon('shield', ['ooooooo', 'obbwbbo', 'obbwbbo', 'obbwbbo', '.obwbo.', '.obbbo.', '..obo..', '...o...']);
  icon('clock', ['.ooooo.', 'owwowwo', 'owwowwo', 'owwooow', 'owwwwwo', 'owwwwwo', '.ooooo.']);
  icon('skull', ['.wwwww.', 'wwwwwww', 'woowoow', 'woowoow', 'wwwowww', '.wwwww.', '.w.w.w.']);
  icon('xp', ['...c...', '...c...', 'ccccccc', '.ccwcc.', '..ccc..', '.cc.cc.', 'c.....c']);
  icon('bolt', ['...yyo', '..yyo.', '.yyo..', 'yyyyyo', '..yyo.', '.yyo..', 'yyo...', 'yo....']);
  icon('target', ['.rrrrr.', 'rwwwwwr', 'rwrrrwr', 'rwrwrwr', 'rwrrrwr', 'rwwwwwr', '.rrrrr.']);
  icon('hand', ['.k.k.k.', '.k.k.k.', '.kkkkk.', 'kkkkkk.', 'kkkkkk.', '.kkkk..', '.kkkk..']);
  icon('lock', ['..ooo..', '.o...o.', '.o...o.', 'yyyyyyy', 'yyyoyyy', 'yyyoyyy', 'yyyyyyy']);
  icon('check', ['......g', '.....gg', 'g...gg.', 'gg.gg..', '.ggg...', '..g....']);
  icon('gift', ['.r...r.', '..r.r..', 'yyyryyy', 'yyyryyy', 'bbbrbbb', 'bbbrbbb', 'bbbrbbb']);
  icon('gear', ['..a.a..', '.aaaaa.', 'aaaAaaa', '.aAoAa.', 'aaaAaaa', '.aaaaa.', '..a.a..']);
  icon('book', ['.bbbbbb.', 'bwwbbwwb', 'bwwbbwwb', 'bwwbbwwb', 'bwwbbwwb', 'bbbbbbbb', 'B......B']);
  icon('play', ['g.....', 'ggg...', 'ggggg.', 'gggggg', 'ggggg.', 'ggg...', 'g.....']);
  icon('folder', ['yyy.....', 'yyyyyyyy', 'yYYYYYYy', 'yYYYYYYy', 'yYYYYYYy', 'yyyyyyyy']);
  icon('new', ['...y...', '...y...', '..yyy..', 'yyywyyy', '..yyy..', '...y...', '...y...']);
  icon('sound', ['...o...', '..oo.o.', 'oooo..o', 'oooo..o', 'oooo..o', '..oo.o.', '...o...']);
  icon('music', ['..oooo', '..o..o', '..o..o', '..o..o', 'ooo.oo', 'ooo.oo']);
  icon('warn', ['...y...', '..yoy..', '..yoy..', '.yyoyy.', '.yyyyy.', 'yyyoyyy', 'yyyyyyy']);
  icon('trophy', ['yyyyyyy', 'yYyyyYy', '.yyyyy.', '..yyy..', '...y...', '..yyy..', '.yyyyy.']);
  icon('wrench', ['aa...aa', 'aaa.aaa', '.aaaaa.', '..aAa..', '..aAa..', '..aAa..', '..aaa..']);
  icon('hat', ['...p...', '...pp..', '..ppp..', '..pyp..', '.ppppp.', 'PPPPPPP']);
  icon('factory', ['A..A....', 'A..A....', 'aa.aa...', 'aa.aa.aa', 'aaaaaaaa', 'ayayayaa', 'aaaaaaaa']);
  icon('up', ['...g...', '..ggg..', '.ggggg.', 'ggggggg', '..ggg..', '..ggg..', '..ggg..']);
  icon('boot', ['..nn...', '..nn...', '..nn...', '..nnnn.', 'nnnnnnn', 'wwwwwww']);
  icon('bag', ['..nnn..', '.n...n.', 'nnnnnnn', 'nnnynnn', 'nnnnnnn', 'nnnnnnn', '.nnnnn.']);
  icon('fast', ['g...g...', 'gg..gg..', 'ggg.ggg.', 'gggggggg', 'ggg.ggg.', 'gg..gg..', 'g...g...']);
  icon('expand', ['ooo.ooo', 'oo...oo', 'o.....o', '.......', 'o.....o', 'oo...oo', 'ooo.ooo'].map(r => r.replace(/o/g, 'y')));
  icon('swap', ['..y....', '.yyyyyy', '..y....', '.......', '....c..', 'cccccc.', '....c..']);
  icon('bomb', ['....yr.', '...n...', '..aaa..', '.aAAAa.', '.awAAa.', '.aAAAa.', '..aaa..']);
  icon('help', ['.www.', 'w...w', '....w', '..ww.', '..w..', '.....', '..w..']);
  icon('tree', ['..ggg..', '.ggggg.', 'gGggggg', '.ggggG.', 'ggGgggg', '...n...', '...n...', '..nnn..']);
  icon('pad', ['.oooooo.', 'oaaaaaao', 'aoaaaaya', 'oooaaroa', 'aoaaagaa', 'aaaaaaaa', '.aa..aa.']);
  icon('portal', ['..ppp..', '.pmmmp.', 'pmcwcmp', 'pmwcwmp', 'pmcwcmp', '.pmmmp.', '..ppp..']);
  icon('skill', ['..yyy..', '.ygggy.', 'yggwggy', 'ygwgwgy', 'yggwggy', '.ygggy.', '..yyy..']);
  icon('mouse', ['.ooo.', 'owowo', 'owowo', 'ooooo', 'owwwo', 'owwwo', '.ooo.']);
  icon('x', ['w.....w', '.w...w.', '..w.w..', '...w...', '..w.w..', '.w...w.', 'w.....w']);
  icon('flag', ['nrrrr..', 'nrrrrrr', 'nrrrr..', 'n......', 'n......', 'n......', 'nn.....']);
  icon('crown', ['y..y..y', 'yy.y.yy', 'yyyyyyy', 'yryyyby', 'yyyyyyy']);
  icon('jam', ['ooooooo', 'oOOOOOo', 'oOOwOOo', 'oOOwOOo', 'oOOOOOo', 'oOOwOOo', 'ooooooo']);         // output blocked
  icon('starve', ['ooooooo', 'oqwwwqo', 'oqqqwqo', 'oqqwwqo', 'oqqwqqo', 'oqqqqqo', 'oqqwqqo', 'ooooooo']);  // waiting on inputs
  icon('pause', ['ooo.ooo', 'owo.owo', 'owo.owo', 'owo.owo', 'owo.owo', 'ooo.ooo']);
  icon('rotate', ['..www.w', '.w...ww', 'w...www', 'w......', 'w.....w', '.w...w.', '..www..']);
  icon('chart', ['o......', 'o....g.', 'o...gg.', 'o.g.gg.', 'o.gggg.', 'ogggggg', 'ooooooo']);
  // tiny element-weakness pips shown over foes
  // (same shapes as the packets: ring / drop / flame / block)
  const WK = { air: ['.ooo.', 'oc.co', 'o...o', 'oc.co', '.ooo.'], water: ['..o..', '.oco.', 'occco', 'occco', '.ooo.'],
    fire: ['o.o.o', 'ococo', 'occco', 'occco', '.ooo.'], earth: ['ooooo', 'occco', 'occco', 'occco', 'ooooo'] };
  for (const k in ELEM) reg('wk_' + k, mapSprite(WK[k], { o: '#1a0f28', c: ELEM[k].color }), 2.5, 5);
  icon('full', ['ooooooo', 'orrrrro', 'owwwwwo', 'orrrrro', 'owwwwwo', 'orrrrro', 'ooooooo']);   // output buffer full
  icon('pin', ['..rrr..', '.rRrrr.', '.rrrrr.', '..rrr..', '...o...', '...o...', '...o...']);
  // reeds for bog tiles
  reg('reeds', mapSprite(['.g...g.', '.g.g.g.', 'gg.g.gg', '.g.gg.g', '.gg.g.g', '..g.gg.', 'GGGGGGG'], pal), 3.5, 7);
  // a conveyor icon for the hotbar / tree
  reg('belt', mapSprite(['oooooooooo', 'onnnnnnnno', 'oyNyNyNyNo', 'onnnnnnnno', 'oooooooooo', '.oa.oa.oa.'], pal), 5, 6);
});

// ---------- crafted creatures, eggs, Cores, Strongholds, Spawners ----------
task(() => {
  // basics come in three palettes each (the creature rolls one); the bigger ones are drawn with shapes
  const variants = (name, rows, pals) => pals.forEach((p, i) => reg(i ? name + '_' + i : name, mapSprite(rows, p)));
  variants('zephyr', ['....cccc....', '..cccwwccc..', '.ccwwwwwwcc.', '.cwwdwwdwwc.', '.cwwdwwdwwc.', '.cwwwwwwwwc.', '.cbwwwwwwbc.', '..cwwwwwwc..', '..bcwwwwcb..', '...bcwwcb...', '....bccb....', '.....bb.....'],
    [{ c: '#d6f4ff', w: '#ffffff', b: '#9cd4f0', d: '#2b2230' }, { c: '#f2d6ff', w: '#fff4ff', b: '#cf9cf0', d: '#2b2230' }, { c: '#d6ffe6', w: '#f4fff8', b: '#9cf0bf', d: '#2b2230' }]);
  variants('puddle', ['.....gg.....', '....gggg....', '..gggggggg..', '.ggwdgggwdg.', '.ggddgggddg.', 'gggggggggggg', 'gGgggggggggG', 'GGGGGGGGGGGG', '.GG.GGGG.GG.'],
    [{ g: '#4aa8ff', G: '#2a72c8', w: '#ffffff', d: '#2b2230' }, { g: '#4ad8c8', G: '#2a9a98', w: '#ffffff', d: '#2b2230' }, { g: '#9a8aff', G: '#6a56d0', w: '#ffffff', d: '#2b2230' }]);
  variants('cinder', ['.y........y.', '.yy......yy.', '..dddddddd..', '.dddddddddd.', '.dyydddyydd.', '.dyodddyodd.', '.dddddddddd.', '..dddwwddd..', '...dddddd...', '..dodddddod.', '.dd.dddd.dd.', '....dDDd..o.', '...DD..DD.oo'],
    [{ d: '#3a2a30', D: '#241a20', o: '#ff7a30', y: '#ffd23a', w: '#fff0d0' }, { d: '#4a2a3a', D: '#2e1a26', o: '#ff4a6a', y: '#ffb04a', w: '#fff0d0' }, { d: '#2a3a3a', D: '#1a2626', o: '#ffb030', y: '#fff27a', w: '#fff0d0' }]);
  variants('pebble', ['....aaaa....', '...aAAAAa...', '..aAyAAyAa..', '..aAAAAAAa..', 'aaaaAAAAaaaa', 'aAAaAggAaAAa', 'aAAaAAAAaAAa', '.aa.aAAAAa..', '....aAAAAa..', '...aaA..Aaa.', '...aa....aa.'],
    [{ a: '#b58a4c', A: '#8a6a3c', y: '#ffe36b', g: '#7be07a' }, { a: '#a8a4b0', A: '#7a7686', y: '#ff9a6b', g: '#7bd0ff' }, { a: '#c8a070', A: '#9a7248', y: '#fff27a', g: '#ff7ad0' }]);
  reg('phoenix', mk(24, 22, x => {
    poly(x, [[12, 10], [1, 2], [3, 10], [0, 16], [10, 15]], '#e8381a'); poly(x, [[12, 10], [23, 2], [21, 10], [24, 16], [14, 15]], '#e8381a');
    poly(x, [[12, 10], [4, 5], [5, 11]], '#ff9a3a'); poly(x, [[12, 10], [20, 5], [19, 11]], '#ff9a3a');
    poly(x, [[9, 16], [12, 22], [15, 16]], '#ff9a3a'); poly(x, [[11, 17], [12, 22], [13, 17]], '#ffe36b');
    circ(x, 12, 12, 5, '#ff7a30'); circ(x, 12, 13, 3, '#ffd23a'); circ(x, 12, 6, 3.5, '#ff9a3a');
    poly(x, [[10, 3], [12, 0], [14, 3]], '#ffe36b'); poly(x, [[12, 6], [15, 7], [12, 9]], '#ffd23a');
    x.fillStyle = '#2b2230'; x.fillRect(10, 5, 2, 2);
  }), 12, 22);
  reg('thunderhead', mk(26, 22, x => {
    circ(x, 7, 9, 5, '#6a748f'); circ(x, 13, 7, 6, '#7d88a8'); circ(x, 19, 10, 5, '#6a748f'); circ(x, 13, 11, 5, '#8c98b8');
    x.fillStyle = '#5a6380'; x.fillRect(4, 12, 18, 3); circ(x, 13, 7, 3.5, '#a8b4dc');
    x.fillStyle = '#ffe36b'; x.fillRect(10, 6, 2, 2); x.fillRect(15, 6, 2, 2);
    poly(x, [[14, 14], [10, 14], [12, 18], [9, 18], [12, 22], [12, 19], [15, 19]], '#fff27a');
  }), 13, 22);
  reg('lavagolem', mk(24, 24, x => {
    x.fillStyle = '#3a2420'; x.fillRect(6, 3, 12, 8); x.fillRect(1, 9, 22, 7); x.fillRect(5, 15, 5, 8); x.fillRect(14, 15, 5, 8);
    x.fillStyle = '#5a3830'; x.fillRect(6, 3, 12, 2); x.fillRect(1, 9, 22, 2);
    x.fillStyle = '#ff7a30'; x.fillRect(11, 8, 2, 9); x.fillRect(4, 12, 6, 1); x.fillRect(15, 11, 6, 1); x.fillRect(7, 18, 1, 4); x.fillRect(16, 18, 1, 4);
    x.fillStyle = '#ffe36b'; x.fillRect(8, 6, 3, 2); x.fillRect(14, 6, 3, 2); circ(x, 12, 13, 2, '#ffd23a');
    x.fillStyle = '#ff4a1a'; x.fillRect(0, 12, 3, 3); x.fillRect(21, 12, 3, 3);
  }), 12, 24);
  reg('shambler', mk(22, 24, x => {
    x.fillStyle = '#4a6a38'; x.fillRect(5, 1, 1, 6); x.fillRect(9, 0, 1, 7); x.fillRect(14, 1, 1, 6); x.fillRect(17, 2, 1, 5);
    circ(x, 11, 12, 8, '#5a4228'); circ(x, 11, 14, 7, '#6e5232'); circ(x, 8, 10, 3, '#7e6240');
    x.fillStyle = '#6a8a4a'; x.fillRect(4, 6, 3, 2); x.fillRect(15, 7, 3, 2); x.fillRect(10, 18, 3, 2);
    x.fillStyle = '#5a4228'; x.fillRect(0, 14, 5, 5); x.fillRect(17, 14, 5, 5); x.fillRect(4, 20, 5, 4); x.fillRect(13, 20, 5, 4);
    x.fillStyle = '#ffe36b'; x.fillRect(7, 10, 2, 2); x.fillRect(13, 10, 2, 2); x.fillStyle = '#2b2230'; x.fillRect(8, 15, 6, 1);
  }), 11, 24);
  reg('dragon', mk(34, 28, x => {
    poly(x, [[14, 12], [2, 0], [4, 10], [0, 16], [12, 17]], '#8a2a1a'); poly(x, [[20, 12], [32, 0], [30, 10], [34, 16], [22, 17]], '#8a2a1a');
    poly(x, [[14, 12], [5, 3], [6, 11]], '#c8402a'); poly(x, [[20, 12], [29, 3], [28, 11]], '#c8402a');
    poly(x, [[12, 22], [3, 26], [8, 28], [14, 25]], '#c8402a'); x.fillStyle = '#ffd23a'; x.fillRect(2, 25, 2, 2);
    x.fillStyle = '#6a2418'; x.fillRect(11, 22, 4, 6); x.fillRect(19, 22, 4, 6);
    circ(x, 17, 17, 8, '#e0482a'); circ(x, 17, 19, 5, '#ffc070');
    circ(x, 17, 8, 5, '#e0482a'); poly(x, [[14, 8], [17, 10], [20, 8], [19, 14], [15, 14]], '#c8402a');
    poly(x, [[13, 4], [11, 0], [15, 3]], '#fff0c0'); poly(x, [[21, 4], [23, 0], [19, 3]], '#fff0c0');
    x.fillStyle = '#ffe36b'; x.fillRect(14, 6, 2, 2); x.fillRect(19, 6, 2, 2); x.fillStyle = '#2b2230'; x.fillRect(15, 12, 5, 1);
    x.fillStyle = '#ff9a2b'; x.fillRect(16, 14, 3, 2);
  }), 17, 28);
  reg('leviathan', mk(34, 22, x => {
    for (let i = 0; i < 8; i++) { const t = i / 7, cx = 28 - i * 3.4, cy = 14 + Math.sin(t * 6) * 4.5, r = 4.2 - t * 1.6; circ(x, cx, cy, r, i % 2 ? '#3aa8c8' : '#6ad0e8'); }
    poly(x, [[28, 11], [26, 4], [31, 9]], '#9af0ff'); poly(x, [[24, 11], [23, 5], [27, 10]], '#9af0ff');
    circ(x, 30, 12, 4.5, '#6ad0e8'); poly(x, [[32, 12], [34, 14], [31, 15]], '#3aa8c8');
    x.fillStyle = '#fff27a'; x.fillRect(29, 10, 2, 2); x.fillStyle = '#2b2230'; x.fillRect(30, 10, 1, 1);
    x.fillStyle = '#fff27a'; x.fillRect(12, 8, 1, 4); x.fillRect(13, 11, 2, 1); x.fillRect(20, 15, 1, 4);
  }), 17, 22);
  reg('titan', mk(30, 30, x => {
    x.fillStyle = '#7a4a34'; x.fillRect(8, 3, 14, 9); x.fillRect(2, 10, 26, 9); x.fillRect(6, 18, 7, 11); x.fillRect(17, 18, 7, 11);
    x.fillStyle = '#c8704a'; x.fillRect(8, 3, 14, 3); x.fillRect(2, 10, 26, 3); x.fillRect(0, 9, 5, 5); x.fillRect(25, 9, 5, 5);
    x.fillStyle = '#a05a3a'; x.fillRect(9, 13, 12, 5); x.fillRect(6, 18, 7, 2); x.fillRect(17, 18, 7, 2);
    x.fillStyle = '#ffe36b'; x.fillRect(10, 7, 3, 2); x.fillRect(17, 7, 3, 2); x.fillStyle = '#ff7a30'; x.fillRect(13, 14, 4, 2);
    x.fillStyle = '#4a2418'; x.fillRect(14, 3, 1, 3); x.fillRect(5, 12, 3, 1); x.fillRect(22, 14, 3, 1);
  }), 15, 30);
  reg('warden', mk(30, 32, x => {
    x.fillStyle = '#6a5418'; x.fillRect(8, 20, 5, 11); x.fillRect(17, 20, 5, 11);
    poly(x, [[6, 10], [24, 10], [27, 22], [3, 22]], '#d8a82a'); poly(x, [[8, 10], [22, 10], [24, 14], [6, 14]], '#ffe36b');
    x.fillStyle = '#9a7418'; x.fillRect(0, 9, 6, 6); x.fillRect(24, 9, 6, 6);
    poly(x, [[9, 11], [21, 11], [20, 4], [10, 4]], '#d8a82a'); x.fillStyle = '#2b2230'; x.fillRect(11, 7, 8, 2);
    x.fillStyle = '#ff4a4a'; x.fillRect(12, 7, 2, 2); x.fillRect(16, 7, 2, 2);
    poly(x, [[9, 4], [10, 0], [12, 3], [15, 0], [18, 3], [20, 0], [21, 4]], '#ffe36b');
    x.fillStyle = '#fff'; x.fillRect(13, 15, 4, 4); x.fillStyle = '#2b2230'; x.fillRect(14, 16, 2, 2);
  }), 15, 32);
  // eggs: one per creature, a pip band or crown shows the tier
  for (const id in CFG.creatures) {
    const c = CFG.creatures[id];
    reg('it_egg_' + id, mk(10, 12, x => {
      x.fillStyle = '#1a0f28'; x.beginPath(); x.ellipse(5, 7, 5, 5.5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = c.col; x.beginPath(); x.ellipse(5, 7, 4, 4.5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = shade(c.col, 0.7); x.fillRect(5, 5, 3, 6);
      x.fillStyle = '#ffffff'; x.fillRect(3, 4, 1, 2);
      x.fillStyle = '#1a0f28'; for (let i = 0; i < c.tier; i++) x.fillRect(2 + i * 3 - (c.tier - 1), 8, 1, 1);
      if (c.tier === 3) { x.fillStyle = '#ffe36b'; x.fillRect(3, 1, 4, 1); x.fillRect(4, 0, 2, 1); }
    }), 5, 11);
  }
  reg('it_core', mapSprite(['...oooo...', '..oyyyyo..', '.oywwyyyo.', 'oywyyyyyyo', 'oyyyYYyyyo', 'oyyyYYyyyo', 'oyyyyyyyYo', '.oyyyyyYo.', '..oYYYYo..', '...oooo...'], { o: '#4a3408', y: '#ffd23a', Y: '#c8921a', w: '#ffffff' }), 5, 10);
  reg('lm_keep', mk(40, 36, x => {
    isoBox(x, 20, 33, 18, 3, '#9a9484', '#76705e', '#5e5a4c');
    x.fillStyle = '#8a8474'; x.fillRect(4, 8, 9, 22); x.fillRect(27, 8, 9, 22); x.fillRect(12, 14, 16, 16);
    x.fillStyle = '#a8a292'; x.fillRect(4, 8, 9, 2); x.fillRect(27, 8, 9, 2); x.fillRect(12, 14, 16, 2);
    x.fillStyle = '#6a6454'; x.fillRect(11, 8, 2, 22); x.fillRect(34, 8, 2, 22);
    x.fillStyle = '#8a8474'; for (let i = 0; i < 3; i++) { x.fillRect(4 + i * 4, 4, 2, 4); x.fillRect(27 + i * 4, 4, 2, 4); }
    x.fillStyle = '#140a20'; x.fillRect(16, 20, 8, 10); x.fillRect(17, 19, 6, 1);
    x.fillStyle = '#2a1840'; x.fillRect(16, 24, 8, 1);
    x.fillStyle = '#140a20'; x.fillRect(7, 14, 2, 4); x.fillRect(30, 14, 2, 4);
    x.fillStyle = '#6e4423'; x.fillRect(19, 2, 2, 12);
  }), 20, 35);
  // the Creature Spawner: a hatchery base and a clutch of eggs, three coloured pips on the front (one, two or three elements per Egg)
  bsprite('b_spawner', (x, cx, cy) => {
    isoBox(x, cx, cy, 9, 5, '#d8c6a0', '#a8956a', '#867552');
    isoBox(x, cx, cy - 5, 6, 3, '#c8b88c', '#988660', '#76684a');
    x.fillStyle = '#fff5d8'; x.beginPath(); x.ellipse(cx, cy - 13, 4, 5.2, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#d8c6a0'; x.fillRect(cx - 1, cy - 12, 3, 6); x.fillStyle = '#ffffff'; x.fillRect(cx - 3, cy - 16, 1, 2);
    ['#7bff9a', '#ffe36b', '#ff6a4a'].forEach((pip, i) => { x.fillStyle = pip; x.fillRect(cx - 8 + i * 3, cy - 3, 2, 2); });
    x.fillStyle = '#fff5d8'; x.beginPath(); x.ellipse(cx - 6, cy - 9, 2, 2.6, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(cx + 6, cy - 9, 2, 2.6, 0, 0, Math.PI * 2); x.fill();
  });
  const ipal = { o: '#2b1d3e', w: '#ffffff', r: '#e8384a', R: '#a82a3a', y: '#ffd23a', b: '#4a8aff', B: '#2a5ac8', a: '#a8b0b8', A: '#6a7280' };
  const icn = (name, rows) => reg('ic_' + name, mapSprite(rows, ipal), Math.max.apply(null, rows.map(r => r.length)) / 2, rows.length);
  icn('keep', ['a.a.a.a', 'aaaaaaa', 'aAaaaAa', 'aAaoaAa', 'aAaoaAa', 'aaaoaaa', 'aaaaaaa']);
  icn('magnet', ['wr...bw', 'rr...bb', 'rr...bb', 'rr...bb', 'rrr.bbb', '.rrrbb.', '..rrb..']);
});

// ---------- the Wizard's garments, Cores and Ward Keys (js/augments.js) ----------
// it_aug_<id> / it_core_<el> / it_key_<el> are the icons (they are drops in the wilds, pile items in the Stockpile and rows in the Collection Book); ao_<id> are the worn overlays: 12 wide x 16 tall,
// anchored at the Wizard's feet like his own sprite (head rows 6-8, shoulders 9, feet 14-15), drawn over him by R.drawWizard
task(() => {
  const P = { o: '#2b1d3e', w: '#ffffff', y: '#ffd23a', b: '#4aa8ff', B: '#2a72c8', r: '#e8501a', R: '#a82a1a', O: '#ffb030', a: '#a9b0b8', A: '#6a7280',
    g: '#6a8a4a', G: '#46602a', s: '#dfe8f0', c: '#7be0ff', d: '#4a3438', D: '#2a1c20', p: '#ff7a30', q: '#ffe36b' };
  const ic = (name, rows) => reg('it_' + name, mapSprite(rows, P), Math.max.apply(null, rows.map(r => r.length)) / 2, rows.length);
  ic('aug_tide', ['..ooo....', '.owwwo...', '.obbbo...', '.obbbo...', '.obbbooo.', '.obbbbbbo', 'oobbBBBbo', 'owwwwwwwo', '.ooooooo.']);
  ic('aug_ember', ['..oooooo..', '.ooyyyyoo.', '.orrrrrro.', 'orrrRRrrro', 'orrrRRrrro', 'orrrRRrrro', 'oOrrRRrrOo', 'oOOrrrrOOo', 'oyOOrrOOyo', '.oo.oo.oo.']);
  ic('aug_stone', ['..ooooo..', '.oyyyyyo.', '.y.....y.', '..ooooo..', '.oaaaaao.', 'oaaAAAaao', 'oaAaaaAao', 'oaaAAAaao', '.oaaaaao.', '..ooooo..']);
  ic('aug_gale', ['w.......w', 'ww.....ww', 'wwoooooww', '.wscccsw.', '..ocyco..', '...ooo...']);
  ic('aug_bog', ['..oooooo..', '.oggggggo.', 'ogGggGgggo', 'ogggGgggGo', 'oGgggggggo', 'ogggGggGgo', 'ogGgggggGo', 'oggGggGggo', '.og.gG.go.', '..o....o..']);
  ic('aug_phoenix', ['......oo.', '.....orRo', '....orROo', '...orRryo', '..orRrryo', '.orRrryyo', 'orRrryyo.', 'oyrryoo..', 'oyyoo....', 'oyo......', 'oo.......']);
  ic('aug_static', ['..oooooo..', '.obbbbbbo.', 'obbbbqqbbo', 'obbbqqbbbo', 'obbqqbbbbo', 'obbbqqbbbo', 'obbbbqqbbo', 'obbbqqbbbo', 'obBbbbbbBo', '.oo.oo.oo.']);
  ic('aug_kiln', ['..oooooo..', '.oddddddo.', 'oddDddDddo', 'odOOddOOdo', 'odOOddOOdo', 'oddddddddo', '.oddppddo.', '..oddddo..', '...oooo...']);
  for (const el of ELEMS) {   // a Core: a faceted orb in the element's colours; a Ward Key: a key with the element's gem for a bow
    const E = { o: '#2b1d3e', c: ELEM[el].color, C: ELEM[el].dark, w: '#ffffff', y: '#ffd23a', Y: '#c8921a' };
    reg('it_core_' + el, mapSprite(['..ooooo..', '.occccco.', 'ocwwcccCo', 'ocwcccCCo', 'occcccCCo', 'occcCCCCo', '.occCCCo.', '..ooooo..'], E), 4.5, 8);
    reg('it_key_' + el, mapSprite(['.ooo........', 'occco.......', 'ocwcoyyyyyyy', 'occcoYYYYYYY', '.ooo...y.y.y', '.......Y.Y.Y'], E), 6, 6);
  }
  // worn overlays
  const OV = { s: '#dfe8f0', w: '#ffffff', c: '#7be0ff', M: '#3a2a30', e: '#ffb030', b: '#3a7ad0', h: '#bfe9ff', y: '#ffd23a', a: '#a9b0b8', A: '#6a7280',
    r: '#d83a1a', O: '#ffb030', g: '#4a6a38', l: '#8ab05a', u: '#3a4a9a', z: '#fff27a', f: '#ff7a30', F: '#e8381a' };
  const ov = (name, rows) => reg('ao_' + name, mapSprite(rows.concat(Array(16 - rows.length).fill('............')), OV), 6, 16);
  const at = rows => { const a = Array(16).fill('............'); rows.forEach(([i, s]) => { a[i] = s; }); return a; };   // 16 empty rows with a few filled in
  ov('gale', at([[5, 'w..........w'], [6, 'wwsscccsswww'], [7, '.w........w.']]));
  ov('kiln', at([[7, '...MeMMeM...'], [8, '....MMMM....']]));
  ov('tide', at([[14, '..hbb..bbh..'], [15, '.bbbb..bbbb.']]));
  ov('ember', at([[9, '.rr......rr.'], [10, 'r..........r'], [11, 'rr........rr'], [12, 'rrr......rrr'], [13, 'rOfOfOfOfOfr']]));
  ov('bog', at([[9, '.gg......gg.'], [10, 'g..........g'], [11, 'gl........lg'], [12, 'ggl......lgg'], [13, 'g.l.g..g.l.g']]));
  ov('static', at([[9, '.uu......uu.'], [10, 'u..........u'], [11, 'uz........zu'], [12, 'uuz......zuu'], [13, 'uzuzuuuuzuzu']]));
  ov('stone', at([[12, '.........y..'], [13, '.........aA.']]));
  ov('phoenix', at([[2, '........ry..'], [3, '........Fyr.'], [4, '.........Fy.'], [5, '..........y.']]));
  // loose boulders (a Gust shoves them with the Stonefist Charm) and the stump of a broken bridge at the lip of a chasm
  reg('boulder', mk(22, 18, x => {
    circ(x, 11, 10, 7.5, '#5e646c'); circ(x, 11, 9, 7, '#767d86'); circ(x, 9, 7, 5, '#8d949c'); circ(x, 8, 6, 2.6, '#b4bcc4');
    x.fillStyle = '#4a5058'; x.fillRect(4, 13, 5, 1); x.fillRect(12, 14, 5, 1); x.fillRect(10, 9, 1, 3);
  }), 11, 17);
  reg('bridge_end', mk(26, 12, x => {
    x.fillStyle = '#5a3a1a'; x.fillRect(0, 5, 24, 6); x.fillStyle = '#9a6a38'; x.fillRect(0, 4, 24, 3); x.fillStyle = '#c08a50'; x.fillRect(0, 4, 24, 1);
    x.fillStyle = '#4a2c12'; for (let i = 0; i < 5; i++) x.fillRect(3 + i * 5, 4, 1, 7);
    x.fillStyle = '#2a1608'; x.fillRect(24, 5, 1, 2); x.fillRect(23, 8, 2, 1); x.fillRect(25, 6, 1, 3);
  }), 13, 11);
});

SP.build = function (progress, done) {
  const tasks = SP.tasks.slice(); let i = 0;
  (function step() {
    if (i >= tasks.length) { done(); return; }
    tasks[i++](); progress(i / tasks.length);
    setTimeout(step, 30);
  })();
};
