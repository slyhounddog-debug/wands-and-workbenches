// Header buttons "Commit & push" and "Reset": each opens a window that lists exactly what it is about to do first.
import { $, h, say, api, postJson } from './common.js';

const ST = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', '?': 'new' };
let busy = false;

function close() { if (!busy) $('#gitModal').hidden = true; }

function fileList(files) {
  if (!files.length) return h('p', { class: 'hint' }, 'No file changes.');
  return h('div', { class: 'gfiles' }, files.map(f => h('div', { class: 'gf' },
    h('b', { class: 'gst ' + (f.st === '?' ? 'N' : f.st), title: ST[f.st] }, f.st),
    h('code', null, f.from ? f.from + ' -> ' + f.path : f.path),
    h('span', null, f.add != null || f.del != null ? [h('i', { class: 'a' }, '+' + (f.add ?? '?')), ' ', h('i', { class: 'd' }, '-' + (f.del ?? '?'))] : ST[f.st]))));
}
const commitList = c => h('div', { class: 'gfiles' }, c.map(x => h('div', { class: 'gf' }, h('code', { class: 'gh' }, x.hash), h('span', { class: 'gs' }, x.subject))));
// overrides/ is meant to stay empty in commits unless the edits were deliberate (CLAUDE.md)
const overrideWarn = files => files.some(f => f.path.startsWith('overrides/'))
  ? h('p', { class: 'warn' }, 'This includes edits in overrides/ (saved by the Layout / Variables / Audio tabs). They change how the game plays for everyone who pulls it; make sure you meant to.') : null;

function modal(title, body, foot) {
  const m = $('#gitModal');
  m.replaceChildren(h('div', { class: 'gcard', role: 'dialog', 'aria-label': title },
    h('div', { class: 'ghead' }, h('h2', null, title), h('button', { class: 'x', title: 'Close (Esc)', onclick: close }, 'x')),
    h('div', { class: 'gbody' }, body), h('div', { class: 'gfoot' }, foot)));
  m.hidden = false;
}
const spinner = title => modal(title, h('p', { class: 'hint' }, 'Reading the repository...'), []);

function result(title, j, err) {
  const ok = !err && j && j.ok !== false;
  modal(title, [h('p', { class: ok ? 'gok' : 'gbad' }, ok ? 'Done.' : (err || (j && j.error))), h('pre', { class: 'glog' }, ((j && j.log) || []).join('\n'))],
    [h('button', { class: 'primary', onclick: () => { $('#gitModal').hidden = true; if (ok && title === 'Reset') location.reload(); } }, ok && title === 'Reset' ? 'Reload tool' : 'Close')]);
  refresh();
}

// the tool autosaves 500 ms after an edit: let a pending save land so it is part of what is shown
const settle = () => new Promise(r => setTimeout(r, 700));

async function openCommit() {
  spinner('Commit & push'); await settle();
  let info; try { info = await api('/api/git'); } catch (e) { return result('Commit & push', null, e.message); }
  const n = info.files.length, up = info.upstream;
  const msg = h('textarea', { class: 'gmsg', rows: 3, placeholder: 'Commit message', 'aria-label': 'Commit message' });
  const go = h('button', { class: 'primary', onclick: async () => {
    if (n && !msg.value.trim()) { msg.focus(); return say('Write a commit message.', true); }
    busy = true; go.disabled = true; go.textContent = 'Working...';
    try { result('Commit & push', await postJson('/api/git/commit', { sig: info.sig, message: msg.value })); } catch (e) { result('Commit & push', null, e.message); } finally { busy = false; }
  } }, n ? 'Commit ' + n + ' file' + (n > 1 ? 's' : '') + ' and push' : 'Push ' + info.ahead.length + ' commit' + (info.ahead.length > 1 ? 's' : ''));
  if (!n && !info.ahead.length) return modal('Commit & push', h('p', { class: 'hint' }, 'Nothing to commit or push: the working tree is clean and ' + (up || 'origin') + ' is up to date.'), [h('button', { onclick: close }, 'Close')]);
  modal('Commit & push', [
    h('p', { class: 'gline' }, 'Branch ', h('b', null, info.branch), ' -> ', h('b', null, up || 'origin/' + info.branch + ' (new upstream)'), ' · ', info.remote),
    info.behind ? h('p', { class: 'warn' }, 'The remote is ' + info.behind + ' commit(s) ahead of your last fetch: the push will be rejected until you pull.') : null,
    n ? [h('h3', null, 'Will be committed (' + n + ')'), fileList(info.files), overrideWarn(info.files), msg] : null,
    info.ahead.length ? [h('h3', null, 'Already committed, will be pushed (' + info.ahead.length + ')'), commitList(info.ahead)] : null,
  ], [h('button', { onclick: close }, 'Cancel'), go]);
  if (n) msg.focus();
}

async function openReset() {
  spinner('Reset'); await settle();
  let info; try { info = await api('/api/git'); } catch (e) { return result('Reset', null, e.message); }
  const n = info.files.length, a = info.ahead.length;
  if (!n && !a) return modal('Reset', h('p', { class: 'hint' }, 'Nothing to reset: no uncommitted changes and no unpushed commits.'), [h('button', { onclick: close }, 'Close')]);
  let mode = n ? 'changes' : 'unpushed';
  const ack = h('input', { type: 'checkbox', id: 'gack' });
  const go = h('button', { class: 'danger', disabled: true, onclick: async () => {
    busy = true; go.disabled = true; go.textContent = 'Working...';
    try { result('Reset', await postJson('/api/git/reset', { sig: info.sig, mode })); } catch (e) { result('Reset', null, e.message); } finally { busy = false; }
  } });
  const lose = h('div');
  const paint = () => {
    const un = mode === 'unpushed';
    lose.replaceChildren(
      n ? [h('h3', null, 'Uncommitted changes that will be lost (' + n + ')'), fileList(info.files), overrideWarn(info.files)] : null,
      un ? [h('h3', null, 'Commits that will be dropped (' + a + ')'), commitList(info.ahead)] : null,
      h('p', { class: 'gline' }, un ? ['Everything goes back to ', h('b', null, info.upstream), '.'] : ['Everything goes back to the last commit: ', h('b', null, info.last.replace('\t', ' ')), '.']));
    go.textContent = un ? 'Discard changes and ' + a + ' commit' + (a > 1 ? 's' : '') : 'Discard ' + n + ' file' + (n > 1 ? 's' : '');
  };
  const opt = (v, text, off) => h('label', { class: 'gopt' + (off ? ' off' : '') }, h('input', { type: 'radio', name: 'gmode', disabled: off, checked: mode === v, onchange: () => { mode = v; ack.checked = false; go.disabled = true; paint(); } }), text);
  ack.addEventListener('change', () => { go.disabled = !ack.checked; });
  modal('Reset', [
    h('p', { class: 'gline' }, 'Branch ', h('b', null, info.branch), info.upstream ? [' · tracking ', h('b', null, info.upstream)] : null),
    h('div', { class: 'gopts' },
      opt('changes', 'Discard uncommitted changes (back to the last commit; new files are deleted too)', !n),
      opt('unpushed', 'Also drop unpushed commits (back to ' + (info.upstream || 'the remote') + ')', !a || !info.upstream)),
    lose,
    h('p', { class: 'warn' }, 'This cannot be undone. Deleted files are not recoverable from the recycle bin. The tool reloads afterwards, because overrides/ may change.'),
    h('label', { class: 'gack' }, ack, ' I understand, discard them'),
  ], [h('button', { onclick: close }, 'Cancel'), go]);
  paint();
}

let badgeTimer = null;
async function refresh() {
  clearTimeout(badgeTimer);
  try {
    const i = await api('/api/git'), n = i.files.length, a = i.ahead.length;
    $('#gitCommit').dataset.n = n || '';
    $('#gitCommit').title = n || a ? [n && n + ' changed file(s)', a && a + ' unpushed commit(s)'].filter(Boolean).join(', ') : 'Everything is committed and pushed';
    $('#gitCommit').classList.toggle('dirty', !!(n || a));
  } catch (e) { /* no repo / git missing: the buttons will say so when clicked */ }
  badgeTimer = setTimeout(refresh, 60000);
}

export function init() {
  $('#gitCommit').addEventListener('click', openCommit);
  $('#gitReset').addEventListener('click', openReset);
  $('#gitModal').addEventListener('mousedown', e => { if (e.target === e.currentTarget) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#gitModal').hidden) close(); });
  addEventListener('focus', refresh);
  refresh();
}
