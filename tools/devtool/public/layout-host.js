// Runs INSIDE the preview iframe (the game under /game/), loaded in <head> before any game script so its capture
// listeners come first. The tool page talks to it through window.__layoutHost. Nothing here runs in the real game.
//
//  - "edit" mode swallows every real mouse/keyboard event so clicks select instead of playing;
//    "play" mode lets everything through so you can walk the game to the screen you want.
//  - Picks the element under the cursor, draws the hover/selection overlay with resize handles, and turns drag /
//    handle-drag / arrow keys into CSS patches ({translate, width, height}) handed back to the tab.
//  - Applies the layout model live (a <style> with the generated CSS + js/overrides.js's text overrides).
//  - Runs preset steps and keeps the preview from pausing itself when focus moves to the tool's panel.
(function () {
  const D = document, W = window;
  const esc = s => CSS.escape(s);
  const NO_PICK = new Set(['HTML', 'BODY']);
  const NO_PICK_ID = new Set(['cv', 'stage', 'game', '__layout_overlay']);   // the canvas and full-screen containers
  // classes that only describe a state: never used to build selectors
  const STATE_CLASSES = /^(hidden|on|off|sel|locked|credit|hint|can|cant|reqd|owned|low|full|ready|gain|bump|out|done|short|warn|leaving|active|open|selected|disabled|up|max|req|bossOn)$/;

  const S = { mode: 'play', sel: null, selSelector: null, scale: 1, hover: null, drag: null, model: { version: 1, rules: [] } };
  const host = { cb: {} };
  W.__layoutHost = host;

  // ---------- the preview never pauses itself: focus moving to the tool panel is not the player leaving ----------
  const swallow = e => e.stopImmediatePropagation();
  W.addEventListener('blur', swallow, true);
  D.addEventListener('visibilitychange', swallow, true);

  // ---------- live model ----------
  const liveStyle = D.createElement('style');
  liveStyle.id = '__layout_live';
  host.setModel = model => {
    S.model = model;
    if (!liveStyle.isConnected) (D.head || D.documentElement).append(liveStyle);
    // the game links overrides/layout.css itself; the live <style> replaces it so removed rules vanish at once
    for (const l of D.querySelectorAll('link[href*="layout.css"]')) l.disabled = true;
    liveStyle.textContent = LayoutModel.modelToCss(model);
    if (W.OV) W.OV.applyText(model);
  };
  const originalText = n => (W.OV ? W.OV.originalText(n) : n.nodeValue);

  // ---------- overlay ----------
  const ov = D.createElement('div');
  ov.id = '__layout_overlay';
  ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:none;';
  ov.innerHTML = `
<style>
  #__layout_overlay .box{position:fixed;display:none;box-sizing:border-box}
  #__layout_overlay .hov{outline:1px dashed #5ac8ff;background:rgba(90,200,255,.08)}
  #__layout_overlay .sel{outline:2px solid #ffb347;background:rgba(255,179,71,.07)}
  #__layout_overlay .tag{position:absolute;left:-2px;top:-20px;font:11px/16px system-ui,sans-serif;color:#1b1206;background:#ffb347;padding:0 6px;white-space:nowrap;border-radius:3px 3px 0 0}
  #__layout_overlay .tag.below{top:auto;bottom:-20px;border-radius:0 0 3px 3px}
  #__layout_overlay .h{position:absolute;width:var(--hs);height:var(--hs);background:#fff;border:1.5px solid #c46a00;box-sizing:border-box;pointer-events:auto;border-radius:2px}
</style>
<div class="box hov"></div>
<div class="box sel"><div class="tag"></div>
  <div class="h" data-h="nw" style="left:calc(var(--hs)/-2);top:calc(var(--hs)/-2);cursor:nwse-resize"></div>
  <div class="h" data-h="n"  style="left:calc(50% - var(--hs)/2);top:calc(var(--hs)/-2);cursor:ns-resize"></div>
  <div class="h" data-h="ne" style="right:calc(var(--hs)/-2);top:calc(var(--hs)/-2);cursor:nesw-resize"></div>
  <div class="h" data-h="e"  style="right:calc(var(--hs)/-2);top:calc(50% - var(--hs)/2);cursor:ew-resize"></div>
  <div class="h" data-h="se" style="right:calc(var(--hs)/-2);bottom:calc(var(--hs)/-2);cursor:nwse-resize"></div>
  <div class="h" data-h="s"  style="left:calc(50% - var(--hs)/2);bottom:calc(var(--hs)/-2);cursor:ns-resize"></div>
  <div class="h" data-h="sw" style="left:calc(var(--hs)/-2);bottom:calc(var(--hs)/-2);cursor:nesw-resize"></div>
  <div class="h" data-h="w"  style="left:calc(var(--hs)/-2);top:calc(50% - var(--hs)/2);cursor:ew-resize"></div>
</div>`;
  D.documentElement.append(ov);
  const hovBox = ov.querySelector('.hov'), selBox = ov.querySelector('.sel'), selTag = selBox.querySelector('.tag');
  const isOverlay = el => el && (el === ov || ov.contains(el));

  function place(box, el) {
    if (!el || !el.isConnected) { box.style.display = 'none'; return null; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { box.style.display = 'none'; return null; }
    box.style.display = 'block';
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    return r;
  }
  let raf = 0;
  function frame() {
    raf = 0;
    if (S.mode !== 'edit') return;
    ov.style.setProperty('--hs', Math.round(9 / S.scale) + 'px');
    if (S.sel && !S.sel.isConnected && S.selSelector) {   // the game rebuilt its DOM: find the element again
      try { const again = D.querySelector(S.selSelector); if (again) S.sel = again; } catch (e) { /* ignore */ }
    }
    const r = place(selBox, S.sel);
    if (r) {
      selTag.textContent = labelOf(S.sel) + '  ' + Math.round(r.width) + 'x' + Math.round(r.height);
      selTag.classList.toggle('below', r.top < 24);
      selTag.style.fontSize = Math.round(11 / S.scale) + 'px';
      selTag.style.lineHeight = Math.round(16 / S.scale) + 'px';
    }
    place(hovBox, S.hover && S.hover !== S.sel ? S.hover : null);
    raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && S.mode === 'edit') raf = requestAnimationFrame(frame); };
  function labelOf(el) {
    let s = el.localName;
    if (el.id) s += '#' + el.id;
    else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    return s;
  }

  // ---------- selectors ----------
  function segment(el) {
    const parent = el.parentElement, tag = el.localName;
    if (!parent) return tag;
    for (const c of el.classList) {
      if (STATE_CLASSES.test(c) || /^\d/.test(c)) continue;
      const s = tag + '.' + esc(c);
      if (parent.querySelectorAll(':scope > ' + s).length === 1) return s;
    }
    return tag + ':nth-child(' + ([...parent.children].indexOf(el) + 1) + ')';
  }
  const idIsUnique = el => !!el.id && D.querySelectorAll('#' + esc(el.id)).length === 1;
  function uniqueSelector(el) {
    if (idIsUnique(el)) return '#' + esc(el.id);
    const parts = [];
    for (let cur = el; cur && !NO_PICK.has(cur.tagName); cur = cur.parentElement) {
      if (idIsUnique(cur)) { parts.unshift('#' + esc(cur.id)); break; }
      parts.unshift(segment(cur));
    }
    for (let i = parts.length - 1; i >= 0; i--) {   // the shortest tail that still finds exactly this element
      const sel = parts.slice(i).join(' > ');
      try { const found = D.querySelectorAll(sel); if (found.length === 1 && found[0] === el) return sel; } catch (e) { /* try longer */ }
    }
    return parts.join(' > ');
  }
  function selectorChoices(el) {
    const out = [{ sel: uniqueSelector(el), label: 'this element only' }], tag = el.localName;
    for (const c of el.classList) {
      if (STATE_CLASSES.test(c)) continue;
      for (const sel of ['.' + esc(c), tag + '.' + esc(c)]) {
        let n = 0; try { n = D.querySelectorAll(sel).length; } catch (e) { continue; }
        if (n > 1 && !out.some(o => o.sel === sel)) out.push({ sel, label: 'all ' + n + ' matching ' + sel, count: n });
      }
    }
    return out;
  }

  // ---------- describing an element for the panel ----------
  const rgbToHex = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (a === 0) return null;
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  };
  function parseTranslate(cs) {
    const t = (cs.translate || 'none').trim();
    if (t === 'none') return [0, 0];
    const p = t.split(/\s+/).map(v => parseFloat(v) || 0);
    return [p[0] || 0, p[1] || 0];
  }
  function describe(el, reuse) {
    if (!el || !el.isConnected) return null;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect(), textNodes = [];
    el.childNodes.forEach((n, index) => {
      if (n.nodeType === 3 && n.nodeValue.trim()) textNodes.push({ index, text: n.nodeValue, original: originalText(n), static: isStatic(originalText(n)) });
    });
    let crumbs, selector, choices;
    if (reuse) ({ crumbs, selector, choices } = reuse);
    else {
      crumbs = [];
      for (let cur = el; cur && !NO_PICK.has(cur.tagName); cur = cur.parentElement) crumbs.unshift({ label: labelOf(cur), selector: uniqueSelector(cur) });
      selector = uniqueSelector(el); choices = selectorChoices(el);
    }
    return {
      tag: el.localName, id: el.id || '', classes: [...el.classList], selector, choices, crumbs, textNodes,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      computed: {
        translate: parseTranslate(cs), width: parseFloat(cs.width) || 0, height: parseFloat(cs.height) || 0,
        fontSize: parseFloat(cs.fontSize) || 0, color: rgbToHex(cs.color), background: rgbToHex(cs.backgroundColor),
        opacity: parseFloat(cs.opacity), display: cs.display,
      },
    };
  }
  // text the game writes from code (HUD numbers, menus, the skill tree...) gets rewritten by the game, so the panel
  // warns about it: a text node is "static" when the same text is a text node of index.html as written
  const staticText = new Set();
  fetch(location.pathname).then(r => r.text()).then(t => {
    const doc = new DOMParser().parseFromString(t, 'text/html'), it = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) if (n.nodeValue.trim()) staticText.add(n.nodeValue.trim());
  }, () => {});
  const isStatic = s => staticText.has(String(s).trim());
  host.describe = describe;
  host.count = sel => { try { return D.querySelectorAll(sel).length; } catch (e) { return -1; } };
  host.selMatches = sel => { try { return !!S.sel && S.sel.matches(sel); } catch (e) { return false; } };

  // ---------- selection ----------
  let lastDesc = null;
  function setSelected(el, notify) {
    S.sel = el && el.isConnected ? el : null;
    S.selSelector = S.sel ? uniqueSelector(S.sel) : null;
    if (S.sel) kick(); else selBox.style.display = 'none';
    lastDesc = S.sel ? describe(S.sel) : null;
    if (notify !== false && host.cb.onSelect) host.cb.onSelect(lastDesc);
  }
  host.select = selector => {
    if (!selector) return setSelected(null);
    let el = null; try { el = D.querySelector(selector); } catch (e) { /* ignore */ }
    setSelected(el);
  };
  host.selectRelative = dir => {
    const el = S.sel; if (!el) return;
    const next = dir === 'parent' ? el.parentElement : dir === 'child' ? el.firstElementChild : dir === 'next' ? el.nextElementSibling : el.previousElementSibling;
    if (next && !NO_PICK.has(next.tagName) && !isOverlay(next)) setSelected(next);
  };
  host.refresh = () => { if (!S.sel) return; lastDesc = describe(S.sel, lastDesc); if (host.cb.onSelect) host.cb.onSelect(lastDesc); };
  host.setMode = mode => {
    S.mode = mode;
    ov.style.display = mode === 'edit' ? 'block' : 'none';
    if (mode === 'edit') kick(); else { S.hover = null; S.drag = null; }
  };
  host.setScale = s => { S.scale = s || 1; };
  host.preview = (selector, on) => { let el = null; try { el = selector && D.querySelector(selector); } catch (e) { /* ignore */ } S.hover = on ? el : null; kick(); };
  host.listIds = () => {   // everything with an id on screen right now, for things clicks can't reach
    const out = [];
    for (const el of D.querySelectorAll('[id]')) {
      if (isOverlay(el) || !idIsUnique(el) || el.id === '__layout_live') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || getComputedStyle(el).visibility === 'hidden') continue;
      let depth = 0; for (let p = el.parentElement; p; p = p.parentElement) if (p.id) depth++;
      out.push({ id: el.id, depth, tag: el.localName, w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  };

  // ---------- picking: most of the HUD is pointer-events:none, so switch that off while hit-testing ----------
  const pickAll = D.createElement('style');
  pickAll.textContent = '#stage *:not(#__layout_overlay *) { pointer-events: auto !important; }';
  function stackAt(x, y) {
    D.documentElement.append(pickAll);
    const list = D.elementsFromPoint(x, y);
    pickAll.remove();
    return list.filter(el => !isOverlay(el) && !NO_PICK.has(el.tagName) && !NO_PICK_ID.has(el.id) && !(el.closest('#studio-intro')));
  }

  // ---------- gestures ----------
  function scaleOf(el) {   // ancestors (the game's stage fit) scale the element: keep drags 1:1 with the cursor
    const r = el.getBoundingClientRect();
    return el.offsetWidth > 0 && r.width > 0 ? r.width / el.offsetWidth : 1;
  }
  const patchTranslate = (x, y) => ({ translate: Math.round(x) + 'px ' + Math.round(y) + 'px' });
  function startMove(el, e) { S.drag = { kind: 'move', el, x0: e.clientX, y0: e.clientY, t0: parseTranslate(getComputedStyle(el)), k: scaleOf(el) || 1, moved: false }; }
  function startResize(el, handle, e) {
    const cs = getComputedStyle(el);
    S.drag = { kind: 'resize', handle, el, x0: e.clientX, y0: e.clientY, t0: parseTranslate(cs), k: scaleOf(el) || 1,
      w0: parseFloat(cs.width) || el.offsetWidth, h0: parseFloat(cs.height) || el.offsetHeight,
      maxW: cs.maxWidth, minW: cs.minWidth, maxH: cs.maxHeight, minH: cs.minHeight, moved: false };
  }
  function dragMove(e) {
    const d = S.drag; if (!d) return;
    let dx = (e.clientX - d.x0) / d.k, dy = (e.clientY - d.y0) / d.k;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 3) return;
    d.moved = true;
    if (d.kind === 'move') {
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      return emitPatch(patchTranslate(d.t0[0] + dx, d.t0[1] + dy));
    }
    const h = d.handle, p = {};
    let tx = d.t0[0], ty = d.t0[1];
    if (h.includes('e')) p.width = Math.max(4, Math.round(d.w0 + dx)) + 'px';
    if (h.includes('w')) { const w = Math.max(4, Math.round(d.w0 - dx)); p.width = w + 'px'; tx += d.w0 - w; }
    if (h.includes('s')) p.height = Math.max(4, Math.round(d.h0 + dy)) + 'px';
    if (h.includes('n')) { const hh = Math.max(4, Math.round(d.h0 - dy)); p.height = hh + 'px'; ty += d.h0 - hh; }
    if (h.includes('w') || h.includes('n')) Object.assign(p, patchTranslate(tx, ty));
    // a stylesheet max-/min- size would silently cap the new size, so lift whichever one is in the way
    const nw = parseFloat(p.width), nh = parseFloat(p.height);
    if (!isNaN(nw)) { if (d.maxW !== 'none' && nw > parseFloat(d.maxW)) p['max-width'] = 'none'; if (parseFloat(d.minW) > nw) p['min-width'] = '0'; }
    if (!isNaN(nh)) { if (d.maxH !== 'none' && nh > parseFloat(d.maxH)) p['max-height'] = 'none'; if (parseFloat(d.minH) > nh) p['min-height'] = '0'; }
    emitPatch(p);
  }
  function emitPatch(css) { if (host.cb.onPatch && S.sel) host.cb.onPatch(css, S.selSelector); }
  function endDrag() { const d = S.drag; S.drag = null; if (d && d.moved && host.cb.onGestureEnd) host.cb.onGestureEnd(); }

  // ---------- event blocking + editing input (real events only: scripted steps are isTrusted === false) ----------
  const BLOCK = ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'auxclick', 'wheel', 'keyup',
    'dragstart', 'touchstart', 'touchend', 'pointerover', 'pointerout', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave'];
  const stop = e => e.stopImmediatePropagation();
  W.addEventListener('pointerdown', e => {
    if (S.mode !== 'edit' || !e.isTrusted) return;
    stop(e); e.preventDefault();
    W.focus();   // keep arrow keys / Ctrl+Z coming to this document
    if (e.button !== 0) return;
    const handle = e.target && e.target.dataset && e.target.dataset.h;
    if (handle && S.sel) { startResize(S.sel, handle, e); return; }
    const stack = stackAt(e.clientX, e.clientY);
    let pick = stack[0] || null;
    if (e.altKey && S.sel) { const i = stack.indexOf(S.sel); if (i >= 0) pick = stack[(i + 1) % stack.length]; }   // dig through the stack
    if (!pick) { setSelected(null); return; }
    if (pick !== S.sel) setSelected(pick);
    startMove(pick, e);
  }, true);
  W.addEventListener('pointermove', e => {
    if (S.mode !== 'edit' || !e.isTrusted) return;
    stop(e);
    if (S.drag) { dragMove(e); return; }
    S.hover = e.target && e.target.dataset && e.target.dataset.h ? null : (stackAt(e.clientX, e.clientY)[0] || null);
    kick();
  }, true);
  W.addEventListener('pointerup', e => { if (S.mode === 'edit' && e.isTrusted) { stop(e); endDrag(); } }, true);
  W.addEventListener('pointercancel', () => { if (S.mode === 'edit') endDrag(); }, true);
  for (const type of BLOCK) {
    W.addEventListener(type, e => {
      if (S.mode !== 'edit' || !e.isTrusted) return;
      stop(e);
      if (/^(click|contextmenu|mousedown|dragstart|auxclick)$/.test(type)) e.preventDefault();
    }, true);
  }
  W.addEventListener('keydown', e => {
    if (S.mode !== 'edit' || !e.isTrusted) return;
    stop(e);
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === 'z') { e.preventDefault(); if (host.cb.onUndo) host.cb.onUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); if (host.cb.onRedo) host.cb.onRedo(); return; }
    if (k === 'Escape') { setSelected(null); return; }
    if (k.startsWith('Arrow') && S.sel) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1, t = parseTranslate(getComputedStyle(S.sel)), k2 = scaleOf(S.sel);
      const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
      emitPatch(patchTranslate(t[0] + dx / k2, t[1] + dy / k2));
      if (host.cb.onGestureEnd) host.cb.onGestureEnd(true);
    }
  }, true);

  // ---------- game time ----------
  host.setFrozen = on => { const w = W.__wands; if (w && w.G) w.G.paused = !!on; };
  host.isFrozen = () => { const w = W.__wands; return !!(w && w.G && w.G.paused); };
  host.inGame = () => { const w = W.__wands; return !!(w && w.G); };

  // ---------- scripted steps (presets) ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  host.run = async steps => {
    const problems = [];
    for (const step of steps || []) {
      try {
        if (step.wait) await sleep(step.wait);
        else if (step.waitFor) {
          const end = performance.now() + (step.timeout || 8000);
          while (performance.now() < end && !visible(D.querySelector(step.waitFor))) await sleep(100);
          if (!visible(D.querySelector(step.waitFor))) problems.push('never appeared: ' + step.waitFor);
        } else if (step.click) {
          const el = D.querySelector(step.click);
          if (el) el.click(); else problems.push('not found to click: ' + step.click);
        } else if (step.key) {   // the game reads hotkeys from window keydown (e.code)
          const code = step.key;
          for (const type of ['keydown', 'keyup']) W.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
        } else if (step.show) {
          for (const el of D.querySelectorAll(step.show)) el.classList.remove('hidden');
        } else if (step.hide) {
          for (const el of D.querySelectorAll(step.hide)) el.classList.add('hidden');
        } else if (step.eval) {   // W = window.__wands (the game's test hook), G = the live game state
          const T = W.__wands;
          new Function('W', 'G', 'UI', step.eval)(T, T && T.G, T && T.UI);
        } else if ('freeze' in step) host.setFrozen(step.freeze);
      } catch (err) { problems.push(String((err && err.message) || err)); }
      await sleep(step.pause == null ? 150 : step.pause);
    }
    return problems;
  };

  // ---------- boot: the loading screen waits for a click or key; give it one unless the preset holds it (?hold=1) ----------
  const params = new URLSearchParams(location.search);
  host.loadingDone = (async () => {
    if (params.get('hold')) return;
    for (let i = 0; i < 300; i++) {
      const st = D.getElementById('loadMsg');
      if (st && st.classList.contains('ready')) {
        await sleep(200);   // the game starts listening 100 ms after "ready"
        W.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));
        W.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter' }));
        for (let j = 0; j < 50 && !visible(D.getElementById('menuMain')); j++) await sleep(100);
        return;
      }
      await sleep(100);
    }
  })();
})();
