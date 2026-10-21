// Text half of the dev tool's Layout tab. Positions/sizes/styles are plain CSS (css/layout.css, linked in
// index.html); text can't be done in CSS, so css/layout.json also carries `text` overrides that this module
// applies once at startup:  rule.text = { childNodeIndex: "replacement" }  on every element rule.sel matches.
//
// Static text (index.html markup) only: the game rebuilds many lists/labels from code every so often, and those
// would simply overwrite an override. Edit that kind of text with the Text tab instead (it edits the source).
//
// The Layout tab imports this same module inside its preview iframe to preview and undo overrides live
// (applyTextOverrides is idempotent and restores nodes whose override was removed).

const originals = new Map(); // Text node -> the string it had before any override

export function applyTextOverrides(model, root = document) {
  const want = new Map();
  for (const rule of (model && model.rules) || []) {
    if (!rule.text) continue;
    let els;
    try { els = root.querySelectorAll(rule.sel); } catch { continue; }
    for (const el of els) {
      for (const [i, s] of Object.entries(rule.text)) {
        const node = el.childNodes[+i];
        if (node && node.nodeType === 3) want.set(node, s);
      }
    }
  }
  for (const [node, orig] of originals) {
    if (!want.has(node)) { node.nodeValue = orig; originals.delete(node); }
  }
  for (const [node, s] of want) {
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    if (node.nodeValue !== s) node.nodeValue = s;
  }
}

// The text a node had before the Layout tab changed it (its current text if it was never changed).
export function originalText(node) {
  return originals.has(node) ? originals.get(node) : node.nodeValue;
}

async function applyFromFile() {
  try {
    const res = await fetch('css/layout.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const model = await res.json();
    if (model && Array.isArray(model.rules) && model.rules.some((r) => r.text)) applyTextOverrides(model);
  } catch {
    // no layout.json (or not JSON): nothing to apply
  }
}

// The Layout tab's preview iframe sets this before the game loads and drives overrides itself.
if (!window.__layoutEditor) applyFromFile();
