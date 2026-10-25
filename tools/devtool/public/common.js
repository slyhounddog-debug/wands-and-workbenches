// Small helpers shared by the dev tool's tabs.
export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

let statusTimer = null;
export function say(msg, bad) {
  const el = $('#status');
  el.textContent = msg;
  el.style.color = bad ? 'var(--bad)' : 'var(--mute)';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, bad ? 8000 : 3500);
}

// the tool's own settings; the 'devtool_' prefix keeps them clear of the game's 'wands*' keys the preview wipes
export const ls = {
  get(k, d) { try { const v = localStorage.getItem('devtool_' + k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('devtool_' + k, v); } catch (e) { /* ignore */ } },
};

export async function api(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status + ' ' + r.statusText);
  return j;
}
export const postJson = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// a debounced autosave with an "unsaved / saved / FAILED" label, plus a beacon if the page closes mid-wait
export function autosaver(url, getBody, label, describe) {
  let timer = null, pending = false;
  async function save() {
    clearTimeout(timer);
    if (!pending) return;
    pending = false;
    try {
      const j = await postJson(url, getBody());
      label.textContent = 'saved' + (describe ? ' · ' + describe(j) : '');
      label.classList.remove('bad');
    } catch (e) {
      pending = true;
      label.textContent = 'SAVE FAILED';
      label.classList.add('bad');
      say('Save failed: ' + e.message, true);
    }
  }
  window.addEventListener('beforeunload', () => { if (pending) navigator.sendBeacon(url, new Blob([JSON.stringify(getBody())], { type: 'application/json' })); });
  return {
    schedule() { pending = true; label.textContent = 'unsaved...'; label.classList.remove('bad'); clearTimeout(timer); timer = setTimeout(save, 500); },
    flush: save,
  };
}
