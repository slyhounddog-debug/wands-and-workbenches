'use strict';
// Online co-op, phase 1: host-authoritative, one room code. The host (the Builder) runs the whole simulation exactly as offline play does; the guest (the Wizard) never
// simulates: it sends its input (a pad-shaped state, the same shape IN.pad[] has) and draws the state snapshots the host streams.
//
// ALL PeerJS code lives in this file (the library itself is js/vendor/peerjs.min.js, loaded the first time someone opens the Online menu, so offline play never touches it).
// The rest of the game talks to Net only, through Net.hooks (set in main.js) and the few calls below, so the transport can be swapped without touching gameplay.
//
// Wire format (bump Net.VERSION on ANY change to it):
//   guest -> host   { t: 'hello', v, tok }                       first message on a new connection (tok = this guest's random token: lets the SAME guest come back, nobody else)
//                   { t: 'pad', s: <IN.pad shape>, q }           PAD_HZ, and at once when the input changes: the Wizard's pad (edges latched between sends, held state every packet);
//                                                                q counts the packets up: the host answers with G.na = the last q it applied, G.nat = how long before the picture it
//                                                                arrived and G.nft = the picture's moment on the host's clock (the guest's prediction replays from there)
//                   { t: 'buy', id }                             skill tree purchase intent (the host validates it with the usual cost logic)
//                   { t: 'ping', at }  { t: 'bye' }
//   host -> guest   { t: 'welcome', v, seed, sig, runMeta }      handshake reply; the snapshot stream starts after it
//                   { t: 'refuse', why, v }                      version / room full
//                   { t: 'snap', n, z }                          20 Hz, z = the state G as JSON, deflated (Snap.wire); n counts up. Normally NOT sent like this: see the snapshot channel
//                   [4 bytes n][z]                               the same snapshot as raw bytes on the second, unreliable data channel (negotiated id 5, unordered, packets live 500 ms)
//                   { t: 'toast', text, icon }  { t: 'buyres', id, ok, toasts }  { t: 'pong', at }  { t: 'bye' }
// Transport: PeerJS cloud for signaling only. Two WebRTC data channels on the one connection: PeerJS's reliable ordered one for everything small (hello, pad, buy, ping,
// toasts) and a second UNRELIABLE, UNORDERED one for the 20 Hz snapshots (a late or lost picture is simply skipped: nothing waits behind it, so one bad packet on a phone
// hotspot costs one frame instead of stalling the whole stream). ICE servers: STUN plus the Cloudflare relay when the game can fetch a login (see CLAUDE.md).
const Net = {
  VERSION: 5,   // 5: the pad fields mean the Wizard's four wand buttons (y = cycle, b = cast, x = mash; the tree is Back), G carries the wand
  BUILD: 11,                      // bumped with every networking change that is not a wire change, so a screenshot says which build produced it
  SEED: 20261020,                // the wilds' seed (WZ.generate); the guest regenerates the same world from it
  REJOIN_MS: 60000,              // how long the host waits for the same guest to come back
  SNAP_HZ: 20, PAD_HZ: 60,
  ALPHA: 'ABCDFGHJKMNPQRSTUVWXYZ23456789',   // no 0 O 1 I L, and no E: E is the cancel key at the menu world's keyboard, so a room code never needs it
  PREFIX: 'ww-',
  role: null,                    // 'host' | 'guest' | null
  on: false,                     // an online game is running (host: the game started; guest: the first snapshot arrived)
  state: 'idle',                 // idle | opening | waiting (host: room open, nobody yet) | live | lost | ended
  code: null, error: '',
  peer: null, conn: null, tok: null, lastRx: 0, lostAt: 0,
  BACKLOG: 16000,                // bytes allowed to wait on the channel before snapshots are dropped (about two of them)
  hooks: {}, errs: [], diag: null, hdiag: null, nextAt: 0, takenAt: 0, snapGap: 0.05,
  stats: { rawKB: 0, zipKB: 0, maxZip: 0, snapsOut: 0, bytesOut: 0, kbps: 0, rtt: 0, skipped: 0, path: '', netRtt: 0, chan: '', loss: 0, draw: 0, _rx: 0, _hi: 0, _rx0: 0, _hi0: 0, _f: 0, fps: 0, _t: 0, _b: 0, _n: 0, total: 0 },
  // host
  snapN: 0, snapAcc: 0, busy: false, gpad: null, gedge: null, gseq: 0, aseq: 0, aseqAt: 0, frameAt: 0, gsig: '', padDirty: false, snapNow: false,
  // guest
  mute: false, lastN: 0, next: null, prev: null, latch: null, padAcc: 0, pingAcc: 0, pending: null, padSeq: 0, hist: [], padSig: '', simDelay: 0, simJitter: 0, frameTs: 0, prevTs: 0,
};
(function () {
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:global.stun.twilio.com:3478' }] };   // STUN only (PeerJS's own default adds a TURN relay: switched off on purpose)
  // OPT-IN TEST HOOK, off by default: open the game on BOTH computers with ?turn=<url>&tuser=<name>&tpass=<secret> (url like turn:relay.example.com:3478) to add a TURN relay
  // of your own choosing. It exists so a pair of networks that cannot connect directly (AP isolation, no hairpin NAT) can be tried with a relay before anyone decides to run
  // one. Which relay to use, and whether to ship one, is Josh's decision (CLAUDE.md): nothing turns this on by itself, nothing is built in (PeerJS's free community relay
  // no longer resolves in DNS), and a relay carries all of that session's traffic through a third party's server.
  const qp = k => { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : ''; };
  Net.relay = !!qp('turn');
  // THE RELAY: on a web address the game asks its own server (api/turn.js, a Vercel function holding the Cloudflare TURN key) for a short-lived relay login whenever a
  // room is created or joined. If that is not there (offline, file://, GitHub Pages, not set up, any error) the game just goes without: direct connections only, as before.
  // ?api=<url> points it at another address (testing). An explicit ?turn= (above) wins.
  Net.RELAY_API = (() => { const m = /[?&]api=([^&]*)/.exec(location.search); return m ? decodeURIComponent(m[1]) : /^https?:$/.test(location.protocol) ? '/api/turn' : ''; })();
  Net.cfIce = null;
  const getRelay = async () => {
    Net.cfIce = null;
    if (Net.relay || !Net.RELAY_API) return;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(Net.RELAY_API, { cache: 'no-store', signal: ctl.signal });
      if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.iceServers) && j.iceServers.length) Net.cfIce = j.iceServers; }
    } catch (e) { /* no relay: direct connections only */ }
    clearTimeout(timer);
    Net.log('relay login ' + (Net.cfIce ? 'received' : 'not available (direct connections only)'));
  };
  // which path the browser picked (direct / relayed over udp, tcp or tls) and the ICE-level round trip: the network's own delay, without our queueing
  Net.pathProbe = async function () {
    const pc = Net.conn && Net.conn.peerConnection;
    if (!pc) return;
    try {
      const st = await pc.getStats(), by = {};
      let sel = null;
      st.forEach(r => { by[r.id] = r; if (r.type === 'transport' && r.selectedCandidatePairId) sel = r.selectedCandidatePairId; });
      const pair = sel && by[sel];
      if (!pair) return;
      const l = by[pair.localCandidateId] || {}, rm = by[pair.remoteCandidateId] || {}, relay = l.candidateType === 'relay' || rm.candidateType === 'relay';
      Net.stats.path = relay ? 'relay ' + (l.relayProtocol || l.protocol || '?') : l.candidateType === 'srflx' || rm.candidateType === 'srflx' ? 'direct (public)' : 'direct';
      Net.stats.netRtt = Math.round((pair.currentRoundTripTime || 0) * 1000);
    } catch (e) { /* ignore */ }
  };
  Net.relayOn = () => Net.relay || !!Net.cfIce;
  const iceServers = () => (!Net.relay && Net.cfIce ? ICE.iceServers.concat(Net.cfIce) : Net.relay ? ICE.iceServers.concat([{ urls: qp('turn').split(','), username: qp('tuser'), credential: qp('tpass') }]) : ICE.iceServers);
  // PeerJS's own log (every signaling message it sends and receives, ICE events, errors) is kept in a small ring so a failed join can show what the handshake did
  Net.plog = [];
  Net.log = (...a) => {
    const s = a.map(x => { if (x instanceof Error) return x.message; if (x && typeof x === 'object') { try { return JSON.stringify(x); } catch (e) { return '[object]'; } } return String(x); }).join(' ').replace(/\s+/g, ' ');
    Net.plog.push(((now() - Net.t0) / 1000).toFixed(1) + 's ' + s.slice(0, s.indexOf('{') >= 0 ? 72 : 120));
    if (Net.plog.length > 60) Net.plog.shift();
    console.info('[peerjs]', s.slice(0, 300));
  };
  Net.t0 = performance.now();
  Net.logText = n => 'build ' + Net.VERSION + '.' + Net.BUILD + '\n' + Net.plog.filter(l => /clos|clean|error|ice |disconn|answer|offer|leave|expire|unavailable|webrtc|destroy|lost|conn\./i.test(l) && !/Received ICE candidates|handleCandidate|Added ICE/.test(l)).slice(-n).join('\n');
  const peerOpts = () => ({ config: { iceServers: iceServers() }, debug: 3, logFunction: (lvl, ...a) => Net.log(lvl >= 3 ? '' : 'L' + lvl, ...a) });
  const now = () => performance.now();
  const EDGES = ['a', 'b', 'x', 'y', 'lb', 'rb', 'rt', 'l3', 'back'];
  const HELD = ['xHeld', 'aHeld', 'bHeld', 'ltHeld', 'startHeld'];

  // ---------- helpers ----------
  Net.makeCode = () => Array.from({ length: 6 }, () => Net.ALPHA[Math.floor(Math.random() * Net.ALPHA.length)]).join('');
  Net.cleanCode = s => (s || '').toUpperCase().split('').filter(c => Net.ALPHA.indexOf(c) >= 0).join('').slice(0, 6);
  // a cheap fingerprint of the generated wilds: host and guest must have built the same world
  Net.sig = function () {
    const t = WZ.terrain; if (!t) return 0;
    let h = 2166136261;
    for (let i = 0; i < t.length; i += 7) h = Math.imul(h ^ t[i], 16777619);
    return (h ^ WZ.marks.length) >>> 0;
  };
  const loadLib = () => new Promise((res, rej) => {
    if (window.Peer) return res();
    const s = document.createElement('script');
    s.src = 'js/vendor/peerjs.min.js';
    s.onload = () => (window.Peer ? res() : rej(new Error('PeerJS did not start')));
    s.onerror = () => rej(new Error('Could not load the networking library (offline?)'));
    document.head.appendChild(s);
  });
  // THE SNAPSHOT CHANNEL. A reliable channel delivers everything in order, so on a lossy link (a phone hotspot) one lost packet holds back every picture behind it until it is
  // resent, and the pictures then arrive in a burst, late. Snapshots are whole pictures that go stale in 50 ms, so they go on a second channel that may lose them and
  // never waits (unordered, a packet is dropped after LIFE ms); the guest just uses the newest one that arrives (Net.lastN). Both sides open the channel themselves with the
  // same id ("negotiated"), so PeerJS never sees it. ?lossy=0 switches it off (everything on the reliable channel, as before); a snapshot over SNAP_BIG bytes, or a
  // channel that is not open, falls back to the reliable one.
  Net.LOSSY = !/[?&]lossy=0/.test(location.search);
  // LIFE: how long the network may keep trying to deliver one packet. It has to be a few ROUND TRIPS (a hotspot + relay is 150 ms or more): at 150 ms the first lost packet
  // could never be resent and killed the whole snapshot (about 10 packets), which showed as 5-20 snapshots a second. Unordered, so a packet being resent holds nothing else up.
  const SNAP_ID = 5, SNAP_BIG = 60000, LIFE = 500;
  function snapChannel(conn) {
    if (!Net.LOSSY || conn._snapCh) return;
    const pc = conn.peerConnection;
    if (!pc) return;
    try {
      const ch = pc.createDataChannel('snap', { negotiated: true, id: SNAP_ID, ordered: false, maxPacketLifeTime: LIFE });
      ch.binaryType = 'arraybuffer';
      ch.onmessage = e => {
        if (conn !== Net.conn || Net.role !== 'guest' || !(e.data instanceof ArrayBuffer) || e.data.byteLength < 5) return;
        Net.lastRx = now();
        snapIn(new DataView(e.data).getUint32(0), new Uint8Array(e.data, 4), 'lossy');
      };
      ch.onopen = () => Net.log('snapshot channel open');
      conn._snapCh = ch;
    } catch (e) { conn._snapCh = null; Net.log('snapshot channel failed: ' + (e && e.message)); }
  }
  const lossyOf = conn => { const c = conn && conn._snapCh; return c && c.readyState === 'open' ? c : null; };
  const send = (conn, m) => { try { if (conn && conn.open) { conn.send(m); return true; } } catch (e) { UI.err(e); } return false; };
  const encode = async str => {
    if (typeof CompressionStream === 'undefined') return str;
    const cs = new CompressionStream('deflate'), w = cs.writable.getWriter();
    w.write(new TextEncoder().encode(str)); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  };
  const decode = async z => {
    if (typeof z === 'string') return z;
    const bytes = z instanceof ArrayBuffer ? new Uint8Array(z) : z;
    const ds = new DecompressionStream('deflate'), w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return await new Response(ds.readable).text();
  };
  const token = () => {
    let t = null;
    try { t = sessionStorage.getItem('ww_tok'); } catch (e) { /* private window */ }
    if (!t) { t = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join(''); try { sessionStorage.setItem('ww_tok', t); } catch (e) { /* ignore */ } }
    return t;
  };

  Net.reset = function () {
    try { if (Net.conn) Net.conn.close(); } catch (e) { /* ignore */ }
    try { if (Net.peer) Net.peer.destroy(); } catch (e) { /* ignore */ }
    Net.errs = []; Net.diag = null; Net.hdiag = null;
    Net.role = null; Net.on = false; Net.state = 'idle'; Net.code = null; Net.error = '';
    Net.peer = null; Net.conn = null; Net.tok = null; Net.lastRx = 0; Net.lostAt = 0;
    Net.snapN = 0; Net.snapAcc = 0; Net.busy = false; Net.gpad = null; Net.gedge = null;
    Net.lastN = 0; Net.next = null; Net.latch = null; Net.padAcc = 0; Net.pingAcc = 0;
    Net.gseq = 0; Net.aseq = 0; Net.padSeq = 0; Net.hist = []; Net.padSig = '';
  };
  // TEST ONLY: Net.simDelay (ms) holds back what this side sends (pads on the guest, snapshots on the host), like a slow link
  const later = fn => { const d = Net.simDelay + (Net.simJitter ? Math.random() * Net.simJitter : 0); if (d) setTimeout(fn, d); else fn(); };   // (+ Net.simJitter: up to that many ms more, at random, like a real link)
  // leave the session for good (title screen, quitting, the host's timeout)
  Net.close = function (tell) {
    if (tell !== false && Net.conn) send(Net.conn, { t: 'bye' });
    const peer = Net.peer, conn = Net.conn;
    Net.reset();
    setTimeout(() => { try { if (conn) conn.close(); } catch (e) { /* ignore */ } try { if (peer) peer.destroy(); } catch (e) { /* ignore */ } }, 150);   // let the bye leave first
  };
  Net.rejoinLeft = () => Math.max(0, Net.REJOIN_MS - (now() - Net.lostAt));

  // ================= HOST =================
  // open a room: resolves with the code. The game itself starts when the guest has joined (hooks.guestJoined).
  Net.createRoom = function () {
    Net.reset(); Net.role = 'host'; Net.state = 'opening';
    return Promise.all([loadLib(), getRelay()]).then(() => new Promise((res, rej) => {
      let tries = 0;
      const attempt = () => {
        const code = Net.makeCode(), peer = new Peer(Net.PREFIX + code, peerOpts());
        let opened = false;
        peer.on('open', () => {
          opened = true; Net.peer = peer; Net.code = code; Net.state = 'waiting';
          peer.on('connection', hostConn);
          peer.on('close', () => Net.log('host peer CLOSED (destroyed)'));
          peer.on('disconnected', () => Net.log('host peer lost the matchmaking server'));
          peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });   // the signaling server dropped us: stay reachable for a rejoin
          res(code);
        });
        peer.on('error', e => {
          Net.errs.push(e.type);
          if (!opened && e.type === 'unavailable-id' && ++tries < 8) { try { peer.destroy(); } catch (x) { /* ignore */ } attempt(); return; }   // the id is taken: another code
          if (!opened) { Net.state = 'idle'; rej(new Error(e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server (is this machine online?)' : 'Could not open a room (' + e.type + ')')); return; }
          if (e.type !== 'peer-unavailable') UI.err('Net: ' + e.type);
        });
      };
      attempt();
    }));
  };
  function hostConn(conn) {
    if (!Net.conn) { Net.hdiag = watchIce(conn); traceClose(conn, 'host'); }
    if (Net.hooks.guestDialing && !Net.conn) Net.hooks.guestDialing(conn);
    const dropT = setTimeout(() => { if (conn !== Net.conn) { try { conn.close(); } catch (e) { /* ignore */ } } }, 50000);   // never said hello (ICE itself needs up to ~40 s to give up, so wait longer than that; closing earlier also hides the host's statistics)
    conn.on('data', m => hostMsg(conn, m));
    conn.on('close', () => { clearTimeout(dropT); if (conn === Net.conn) guestGone('closed'); });
    conn.on('error', () => { if (conn === Net.conn) guestGone('error'); });
  }
  const refuse = (conn, why) => { send(conn, { t: 'refuse', why, v: Net.VERSION }); setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 300); };
  function hostMsg(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (m.v !== Net.VERSION) { refuse(conn, 'version'); return; }
      if (Net.tok && m.tok !== Net.tok) { refuse(conn, 'full'); return; }   // the room locked to the first guest: anyone else is turned away
      if (!Net.tok && Net.state !== 'waiting') { refuse(conn, 'full'); return; }
      if (typeof m.tok !== 'string' || m.tok.length < 8) { refuse(conn, 'full'); return; }
      const first = !Net.tok;
      Net.tok = m.tok;
      if (Net.conn && Net.conn !== conn) { const old = Net.conn; Net.conn = null; try { old.close(); } catch (e) { /* ignore */ } }   // the same guest on a fresh connection
      Net.conn = conn; Net.lastRx = now(); Net.gseq = 0; Net.aseq = 0;
      snapChannel(conn);
      send(conn, { t: 'welcome', v: Net.VERSION, seed: Net.SEED, sig: Net.sig(), runMeta: { slot: G ? G.slot : (Net.pending ? Net.pending.slot : 0), time: G ? G.stats.time : 0 } });
      Net.snapAcc = 1; Net.busy = false;
      if (first) { Net.state = 'live'; if (Net.hooks.guestJoined) Net.hooks.guestJoined(); }
      else { Net.state = 'live'; if (Net.hooks.guestBack) Net.hooks.guestBack(); }
      return;
    }
    if (conn !== Net.conn) return;   // only the guest's own connection is listened to
    Net.lastRx = now();
    if (m.t === 'pad') { hostPad(m.s); if (m.q > Net.gseq) Net.gseq = m.q; }
    else if (m.t === 'buy') { if (Net.hooks.buy) Net.hooks.buy(String(m.id)); }
    else if (m.t === 'ping') send(conn, { t: 'pong', at: m.at });
    else if (m.t === 'bye') guestGone('left');
  }
  // the guest's pad: held state replaces, edges pile up until the host's next frame has used them
  function hostPad(s) {
    if (!s || typeof s !== 'object') return;
    const g = Net.gpad || (Net.gpad = {}), e = Net.gedge || (Net.gedge = {});
    g.ix = +s.ix || 0; g.iy = +s.iy || 0; g.rx = +s.rx || 0; g.ry = +s.ry || 0;
    for (const k of HELD) g[k] = !!s[k];
    for (const k of EDGES) if (s[k]) e[k] = true;
    if (s.cyc) e.cyc = s.cyc;
    g.any = !!s.any;
    const sig = g.ix.toFixed(1) + g.iy.toFixed(1) + HELD.map(k => (g[k] ? 1 : 0)).join('');
    if (sig !== Net.gsig || EDGES.some(k => s[k])) { Net.gsig = sig; Net.padDirty = true; }   // a press, a release or a new direction: the guest is waiting to see what it did
  }
  // called every host frame, right after IN.pollPads: the guest's pad becomes the Wizard's pad (the dev bot's seam)
  Net.drive = function (ts) {
    if (Net.role !== 'host' || !G || G.ctl.pw < 0) return;
    const g = Net.gpad || {}, e = Net.gedge || {};
    const pad = { ix: Math.max(-1, Math.min(1, g.ix || 0)), iy: Math.max(-1, Math.min(1, g.iy || 0)), rx: Math.max(-1, Math.min(1, g.rx || 0)), ry: Math.max(-1, Math.min(1, g.ry || 0)), cyc: e.cyc || 0, any: !!(g.any || Object.keys(e).length) };
    for (const k of EDGES) pad[k] = !!e[k];
    for (const k of HELD) pad[k] = !!g[k];
    pad.back = false;   // T / Back opens the guest's own tree on the guest's screen; it must not open anything here
    pad.startHeld = false;   // no job swap online
    IN.pad[G.ctl.pw] = Net.state === 'live' ? pad : null;
    Net.gedge = null;
    if (Net.padDirty) { Net.padDirty = false; Net.snapNow = true; }   // (hostTick, after this frame's sim, sends a snapshot without waiting for the next 20 Hz slot)
    // Times on the host's FRAME clock (the rAF timestamp the sim is stepped to): this frame's sim runs from the last frame's timestamp to ts with this pad, so a new packet
    // counts from the last frame's timestamp, and the picture taken after this frame shows the moment ts
    const t = ts || performance.now();
    if (Net.gseq !== Net.aseq) Net.aseqAt = Net.frameAt || t;
    Net.frameAt = t;
    Net.aseq = Net.gseq;   // every pad packet up to this number has now been used by the sim (the snapshot says so: G.na)
  };
  function guestGone(why) {
    if (Net.state !== 'live') return;
    Net.state = 'lost'; Net.lostAt = now(); Net.gpad = null; Net.gedge = null;
    if (Net.hooks.guestLost) Net.hooks.guestLost(why);
  }
  Net.hostTick = function (dt) {
    if (Net.role !== 'host') return;
    const st = Net.stats;
    st._t += dt;
    if (st._t >= 1) { st.kbps = Math.round(st._b / 1024 / st._t); st.fps = +(st._n / st._t).toFixed(1); st._t = 0; st._b = 0; st._n = 0; }
    if (Net.state === 'live') {
      if (now() - Net.lastRx > 8000) { guestGone('silent'); return; }   // 30 pad packets a second: 8 s of nothing is a dead connection
      Net.snapAcc += dt;
      if (Net.snapAcc >= 1 / Net.SNAP_HZ || (Net.snapNow && Net.snapAcc >= 0.025)) { Net.snapNow = false; Net.snapAcc = Math.max(0, Math.min(Net.snapAcc - 1 / Net.SNAP_HZ, 1 / Net.SNAP_HZ)); sendSnap(); }
    } else if (Net.state === 'lost' && Net.rejoinLeft() <= 0) {
      if (Net.hooks.timeout) Net.hooks.timeout();
    }
  };
  // Everything that moves gets a stable id the first time a snapshot is taken (Net.stamp; G.w.uidN is the counter), so the guest can match "the same foe" between two
  // snapshots and glide it from one place to the next (Main.tween in online.js). The id is a plain field on the object and rides along in every snapshot.
  const STAMP = [['w', 'enemies'], ['w', 'allies'], ['w', 'proj'], ['w', 'eproj'], ['w', 'aproj'], ['w', 'drops'], ['w', 'pickups'], ['w', 'boulders'], ['w', 'zones'], ['w', 'mines'], ['w', 'booms'], ['w', 'arcs'], ['fac', 'flying']];
  Net.stamp = function () {
    const w = G && G.w;
    if (!w) return;
    G.na = Net.aseq;   // the last guest pad packet the sim has used: the guest replays the newer ones on top of this picture (Main.predSnap)
    G.nat = Math.max(0, Math.round(Net.frameAt - Net.aseqAt)) / 1000;   // how long before this picture's moment the sim started using it
    G.nft = Math.round(Net.frameAt);   // and the moment itself, on the host's clock: the guest learns the steady offset between the two clocks from these (Main.predSnap)
    for (const [p, k] of STAMP) {
      const arr = G[p] && G[p][k];
      if (arr) for (const o of arr) if (o && typeof o === 'object' && o.uid === undefined) o.uid = w.uidN = (w.uidN || 0) + 1;
    }
  };
  // positions and timers carry 15 digits (12.345678901234); the guest only draws them, so three decimals are plenty and the snapshot is a third smaller
  const SHORT = /(\d+\.\d{3})\d+/g;
  // how much is already waiting to go out on the data channel (bytes). Every snapshot is a whole picture, so a late one is worth nothing: when the link is slower than the
  // stream, snapshots are DROPPED (the stream slows to what the link carries) instead of queued (which made every message, the ping included, arrive seconds late).
  const backlog = conn => (conn.dataChannel ? conn.dataChannel.bufferedAmount : 0) + (conn.bufferSize > 3 ? 1e6 : 0) + (lossyOf(conn) ? lossyOf(conn).bufferedAmount : 0);
  // one snapshot out: the lossy channel (4 byte number + the bytes) when it is there, else the reliable one
  function snapOut(conn, n, z) {
    const c = lossyOf(conn);
    if (Net.simLoss && c && Math.random() > Math.pow(1 - Net.simLoss, Math.ceil(z.byteLength / 1100))) return true;   // TEST ONLY: lose it like a network losing each packet with this chance
    if (c && typeof z !== 'string' && z.byteLength <= SNAP_BIG) {
      const buf = new Uint8Array(4 + z.byteLength);
      new DataView(buf.buffer).setUint32(0, n); buf.set(z, 4);
      try { later(() => { try { c.send(buf); } catch (e) { /* closing */ } }); Net.stats.chan = 'lossy'; return true; } catch (e) { /* fall back to the reliable channel */ }
    }
    Net.stats.chan = 'reliable';
    return send(conn, { t: 'snap', n, z });
  }
  function sendSnap() {
    const conn = Net.conn;
    if (Net.busy || !conn || !conn.open || !G) return;
    if (backlog(conn) > Net.BACKLOG) { Net.stats.skipped++; return; }   // the link cannot keep up: skip this one rather than queue stale state
    let str;
    try { Net.stamp(); str = Snap.wire().replace(SHORT, '$1'); } catch (e) { UI.err(e); return; }
    const n = ++Net.snapN;
    Net.busy = true;
    encode(str).then(z => {
      Net.busy = false;
      if (Net.conn !== conn || Net.state !== 'live') return;
      if (backlog(conn) > Net.BACKLOG) { Net.stats.skipped++; return; }   // (encoding took a moment: look again)
      if (snapOut(conn, n, z)) {
        const zk = typeof z === 'string' ? z.length : z.byteLength, st = Net.stats;
        st.rawKB = str.length / 1024; st.zipKB = zk / 1024; st.snapsOut++; st.bytesOut += zk; st._b += zk; st._n++; st.total += zk;
        if (st.zipKB > st.maxZip) st.maxZip = st.zipKB;
      }
    }).catch(e => { Net.busy = false; UI.err(e); });
  }
  Net.sendToast = (text, icon) => { if (Net.role === 'host' && Net.state === 'live') send(Net.conn, { t: 'toast', text, icon }); };
  Net.sendBuyRes = (id, ok, toasts) => { if (Net.role === 'host' && Net.state === 'live') send(Net.conn, { t: 'buyres', id, ok, toasts }); };

  // ================= GUEST =================
  // join a room; resolves once the host has said welcome
  Net.join = function (code) {
    Net.reset(); Net.role = 'guest'; Net.state = 'opening'; Net.code = code; Net.tok = token();
    return open(false);
  };
  // after a drop: dial the same code again with the same token (a fresh handshake, then a full snapshot)
  Net.rejoin = function () {
    if (Net.role !== 'guest' || !Net.code) return Promise.reject(new Error('No room to rejoin'));
    try { if (Net.conn) { const c = Net.conn; Net.conn = null; c.close(); } } catch (e) { /* ignore */ }
    try { if (Net.peer) Net.peer.destroy(); } catch (e) { /* ignore */ }
    Net.peer = null; Net.conn = null; Net.state = 'opening'; Net.lastN = 0; Net.next = null;
    return open(true);
  };
  function open(again) {
    return Promise.all([loadLib(), getRelay()]).then(() => new Promise((res, rej) => {
      const fail = msg => { if (Net.state === 'opening') { Net.state = again ? 'lost' : 'idle'; if (again) Net.lostAt = now(); rej(new Error(msg)); } };
      const peer = new Peer(peerOpts());
      Net.peer = peer;
      peer.on('error', e => {
        Net.errs.push(e.type);
        const msg = e.type === 'peer-unavailable' ? (again ? 'The room is gone: the host has left, or its 60 seconds ran out.' : 'No room with that code. Check the letters, and that the host is still waiting.') :
          e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server (is this machine online?)' : 'Connection problem (' + e.type + ')';
        if (Net.state === 'opening') fail(msg); else UI.err('Net: ' + e.type);
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      peer.on('open', () => {
        const conn = peer.connect(Net.PREFIX + Net.code, { reliable: true, serialization: 'binary' });
        Net.conn = conn;
        Net.diag = watchIce(conn); traceClose(conn, 'guest');
        conn.on('open', () => { snapChannel(conn); send(conn, { t: 'hello', v: Net.VERSION, tok: Net.tok }); });
        conn.on('data', m => guestMsg(conn, m, res, fail, again));
        conn.on('close', () => { if (conn === Net.conn) connLost('closed'); });
        conn.on('error', () => { if (conn === Net.conn) connLost('error'); });
      });
      setTimeout(() => { if (Net.state === 'opening') why().then(fail); }, 45000);
    }));
  }
  // What the browser saw while it tried to connect: the ICE state and which kinds of candidate showed up (host = a local address, srflx = our public address as STUN
  // sees it; "mdns" = the local address was hidden behind a .local name, which only works if both computers can find each other by multicast).
  // log WHO closes a connection (the callers' names survive minification) and every PeerJS-level event, so an early teardown can be traced
  function traceClose(conn, tag) {
    const orig = conn.close.bind(conn);
    conn.close = function (...a) {
      const st = (new Error().stack || '').split('\n').slice(2, 7).map(l => (/at (\S+)/.exec(l) || [])[1] || '?').join(' < ');
      Net.log(tag + ' conn.close() by ' + st);
      return orig(...a);
    };
  }
  function watchIce(conn) {
    const t0 = now(), d = { ice: 'new', open: false, host: 0, mdns: 0, srflx: 0, relay: 0, log: [], nopc: false };
    const note = s => d.log.push(s + ' ' + ((now() - t0) / 1000).toFixed(1) + 's');
    note('start');
    conn.on('open', () => { d.open = true; note('channel open'); });
    conn.on('close', () => note('closed'));
    conn.on('error', e => note('error ' + (e && (e.type || e.message) || e)));
    const pc = conn.peerConnection;
    if (!pc) { d.nopc = true; note('NO PEER CONNECTION'); return d; }
    pc.addEventListener('iceconnectionstatechange', () => { d.ice = pc.iceConnectionState; note('ice ' + d.ice); console.info('[net] ice ' + d.ice); });
    pc.addEventListener('icegatheringstatechange', () => note('gathering ' + pc.iceGatheringState));
    pc.addEventListener('icecandidateerror', e => note('stun/turn error ' + e.errorCode));
    pc.addEventListener('icecandidate', e => {
      if (!e.candidate) return;
      const m = / typ (\w+)/.exec(e.candidate.candidate), t = m ? m[1] : '?';
      if (t === 'host' && /\.local /.test(e.candidate.candidate)) d.mdns++; else if (d[t] !== undefined) d[t]++;
    });
    return d;
  }
  // What the browser's own statistics say about the connection attempt (either side): which addresses each side gathered, how many connectivity checks went out and how
  // many were answered. 0 answers with addresses on both sides = the networks in between blocked every direct path (symmetric / carrier NAT, AP isolation): only a relay helps.
  Net.probe = async function (conn) {
    const pc = conn && conn.peerConnection;
    if (!pc) return null;
    const out = { ice: pc.iceConnectionState, local: {}, remote: {}, pairs: {}, sent: 0, recv: 0, open: !!conn.open, lip: '', rip: '' };
    try {
      const st = await pc.getStats();
      const kind = c => (c.candidateType === 'host' && /\.local$/.test(c.address || c.ip || '') ? 'hidden-local' : c.candidateType);
      st.forEach(r => {
        if (r.type === 'local-candidate') { out.local[kind(r)] = (out.local[kind(r)] || 0) + 1; if (r.candidateType === 'srflx') out.lip = r.address || r.ip || ''; }
        else if (r.type === 'remote-candidate') { out.remote[kind(r)] = (out.remote[kind(r)] || 0) + 1; if (r.candidateType === 'srflx') out.rip = r.address || r.ip || ''; }
        else if (r.type === 'candidate-pair') { out.pairs[r.state] = (out.pairs[r.state] || 0) + 1; out.sent += r.requestsSent || 0; out.recv += r.responsesReceived || 0; }
      });
    } catch (e) { /* no stats: the numbers stay 0 */ }
    return out;
  };
  // "Check this computer": what THIS browser can do on its own, with no partner. It gathers connection addresses from three STUN servers for a few seconds and says what
  // that means: no addresses at all = the browser hides them (a privacy setting, extension or Brave shield); no public address = STUN is unreachable (UDP blocked); public
  // addresses with DIFFERENT ports per server = the router / phone network gives every destination its own port (symmetric NAT: direct connections cannot work, a relay is needed).
  Net.selfTest = function () {
    return new Promise(res => {
      let pc;
      const c = { host: 0, hidden: 0, srflx: [], relay: 0, stunErr: 0 };
      try { pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:global.stun.twilio.com:3478' }] }); } catch (e) { res({ ok: false, text: 'This browser would not even start a WebRTC connection (' + e.message + '). WebRTC is turned off or blocked here (a privacy extension, a browser setting or Brave shields).' }); return; }
      let done = false;
      const finish = () => {
        if (done) return; done = true; try { pc.close(); } catch (e) { /* ignore */ }
        const ports = new Set(c.srflx.map(s => s.split('|')[1])), ips = new Set(c.srflx.map(s => s.split('|')[0]));
        const sum = 'Local addresses ' + (c.host + c.hidden) + (c.hidden ? ' (hidden)' : '') + ', public addresses ' + ips.size + ', public ports ' + ports.size + ', STUN errors ' + c.stunErr + '.';
        let text, ok = false;
        if (!c.host && !c.hidden && !c.srflx.length) text = 'This browser is hiding ALL network addresses, so it cannot connect to anyone. Check Brave Shields / WebRTC privacy settings, a "WebRTC leak" extension or VPN extension, and try another browser (Edge or Chrome). ' + sum;
        else if (!c.srflx.length) text = 'No public address could be found: the STUN servers are unreachable (UDP blocked by a firewall, a security program, or this network). ' + sum;
        else if (ports.size > 1) text = 'Looks like a symmetric NAT (the same computer gets a different public port for each server): direct connections cannot work from this network, a relay server is needed. Phone hotspots do this. ' + sum;
        else { ok = true; text = 'Fine: this computer can find its public address and the network keeps one port for it. YOUR PUBLIC ADDRESS: ' + [...ips].join(', ') + ' (two computers on the same network show the same one). ' + sum; }
        res({ ok, text, c });
      };
      pc.createDataChannel('t');
      pc.onicecandidateerror = () => { c.stunErr++; };
      pc.onicecandidate = e => {
        if (!e.candidate) { finish(); return; }
        const s = e.candidate.candidate, parts = s.split(' '), m = / typ (\w+)/.exec(s), t = m ? m[1] : '?';
        if (t === 'host') { if (/\.local$/.test(parts[4])) c.hidden++; else c.host++; }
        else if (t === 'srflx') c.srflx.push(parts[4] + '|' + parts[5]);
        else if (t === 'relay') c.relay++;
      };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e => res({ ok: false, text: 'WebRTC failed to start: ' + e.message }));
      setTimeout(finish, 7000);
    });
  };
  const list = o => Object.keys(o).map(k => o[k] + ' ' + k).join(', ') || 'none';
  Net.probeText = (p, d) => (p ? 'ICE ' + p.ice + '. Our addresses: ' + list(p.local) + '. Theirs: ' + list(p.remote) + '. Public addresses: ours ' + (p.lip || '?') + ', theirs ' + (p.rip || '?') + '. Connection checks sent ' + p.sent + ', answered ' + p.recv + '.' : 'The connection object is already gone.') +
    (d && d.log.length ? ' History: ' + d.log.join(', ') + '.' : '') + (Net.errs.length ? ' Errors: ' + Net.errs.slice(-3).join('; ') + '.' : '');
  async function why() {
    const p = await Net.probe(Net.conn), d = Net.diag || {};
    console.info('[net] gave up', JSON.stringify(p), JSON.stringify(d));
    if (d.open) return 'Connected to the host, but it never answered the handshake. Ask them to restart the game and try again.';
    const t = Net.probeText(p, d);
    if (!d.ice || d.ice === 'new') return 'Reached the room, but the two computers never even started trying to connect. Try again; if it keeps happening, restart the game on both sides. ' + t;
    if (p && !Object.keys(p.remote).length) return 'Found the host, but their connection details never arrived. Try again; if it keeps happening, ask the host to restart the game. ' + t;
    if (p && !p.recv) return 'Both computers found each other, but nothing got through between the two networks (every connection check went unanswered). Phone hotspots and some routers do this: they only allow traffic that went out first, and this version has no relay server to get around it. ' + t;
    return 'The connection started but did not hold (' + d.ice + '). ' + t;
  }
  function guestMsg(conn, m, res, fail, again) {
    if (!m || typeof m !== 'object' || conn !== Net.conn) return;
    Net.lastRx = now();
    switch (m.t) {
      case 'welcome':
        if (m.v !== Net.VERSION || m.seed !== Net.SEED || m.sig !== Net.sig()) { fail('Game version differs from the host. Reload the page (Ctrl+F5) so both of you run the same build.'); return; }
        Net.runMeta = m.runMeta; Net.state = 'live';
        if (again && Net.hooks.resumed) Net.hooks.resumed();
        res(m);
        break;
      case 'refuse':
        if (Net.state === 'opening') fail(m.why === 'version' ? 'Game version differs from the host (theirs ' + m.v + ', yours ' + Net.VERSION + '). Reload the page (Ctrl+F5) so both of you run the same build.' : 'That room already has its second player.');
        else endSession('Could not rejoin.');
        break;
      case 'snap': snapIn(m.n, m.z, 'reliable'); break;
      case 'toast': if (Net.hooks.toast) Net.hooks.toast(m); break;
      case 'buyres': if (Net.hooks.buyres) Net.hooks.buyres(m); break;
      case 'pong': Net.stats.rtt = Math.round(performance.now() - m.at); break;
      case 'bye': endSession('The host ended the game.'); break;
    }
  }
  // a snapshot arrived (either channel): unpack it, and keep it if it is newer than the one before
  function snapIn(n, z, via) {
    const st0 = Net.stats; st0._rx++; if (n > st0._hi) st0._hi = n;   // (every arrival counts, before the unpacking)
    if (n <= Net.lastN) return;   // an older picture (the unordered channel can deliver them out of turn): not worth unpacking
    decode(z).then(txt => {
      if (n <= Net.lastN) return;   // an older one finished unpacking after a newer one
      Net.lastN = n;
      const st = Net.stats; st.chan = via; st.zipKB = (typeof z === 'string' ? z.length : z.byteLength) / 1024; st.rawKB = txt.length / 1024; st._n++; st._b += st.zipKB * 1024;
      Net.prev = Net.next; Net.next = JSON.parse(txt);   // the newest two are kept; the frame loop takes the newest whole one
      const t = performance.now();
      if (Net.nextAt) Net.snapGap = Net.snapGap * 0.9 + Math.min(0.3, (t - Net.nextAt) / 1000) * 0.1;   // seconds between snapshots, smoothed (how long a glide should take)
      Net.nextAt = t;
      if (Net.hooks.snap) Net.hooks.snap();
    }).catch(e => UI.err(e));
  }
  function connLost(why) {
    if (Net.state !== 'live') return;
    Net.state = 'lost'; Net.lostAt = now();
    if (Net.hooks.lost) Net.hooks.lost(why);
  }
  function endSession(msg) { Net.state = 'ended'; Net.error = msg; if (Net.hooks.ended) Net.hooks.ended(msg); }

  // The guest's input as an IN.pad-shaped object. Keyboard (built here: the host never sees physical keys): WASD move, Space = a (dodge), left click = x (mash), right click = b (cast the wand),
  // Q = y (cycle the wand), T = back (skill tree); a real gamepad's state is used as it is. Presses are latched every frame (Net.collect) and ride in the next packet's edge fields; held state goes in
  // every packet.
  Net.collect = function () {
    if (Net.role !== 'guest') return;
    if (Net.mute) { Net.latch = {}; return; }   // the guest's own tree / menu / book is up: his presses belong to it, not to the Wizard
    const L = Net.latch || (Net.latch = {}), gp = IN.pad[0] || null;
    // the Wizard's four buttons (see Main.wizBtns): Space / . dodge = a, left click / / mash = x, right click / , cast = b, Q / M cycle = y; T (the tree) goes as Back
    if (IN.hit('Space') || IN.hit('Period') || (gp && gp.a)) L.a = true;
    if (IN.mouse.lp || IN.hit('Slash') || (gp && gp.x)) L.x = true;
    if (IN.mouse.rp || IN.hit('Comma') || (gp && gp.b)) L.b = true;
    if (IN.hit('KeyQ') || IN.hit('KeyM') || (gp && gp.y)) L.y = true;
    if (IN.hit('KeyT') || (gp && gp.back)) L.back = true;
    if (gp) { if (gp.lb) L.lb = true; if (gp.rb) L.rb = true; if (gp.rt) L.rt = true; if (gp.l3) L.l3 = true; if (gp.back) L.back = true; if (gp.cyc) L.cyc = gp.cyc; }
  };
  // a press made on the guest's own UI that has to reach the host as a button (the re-enter button on the results screen is the roll button)
  Net.latchPress = k => { (Net.latch || (Net.latch = {}))[k] = true; };
  Net.padNow = function () {
    if (Net.mute) return { ix: 0, iy: 0, rx: 0, ry: 0, cyc: 0, a: false, b: false, x: false, y: false, lb: false, rb: false, rt: false, l3: false, back: false, xHeld: false, aHeld: false, bHeld: false, ltHeld: false, startHeld: false, any: false };
    const L = Net.latch || (Net.latch = {}), gp = IN.pad[0] || null;
    let ix = (IN.down('KeyD') ? 1 : 0) - (IN.down('KeyA') ? 1 : 0), iy = (IN.down('KeyS') ? 1 : 0) - (IN.down('KeyW') ? 1 : 0);
    if (!ix && gp) ix = gp.ix;
    if (!iy && gp) iy = gp.iy;
    const out = {
      ix, iy, rx: gp ? gp.rx || 0 : 0, ry: gp ? gp.ry || 0 : 0, cyc: L.cyc || 0,
      xHeld: IN.mouse.l || IN.down('Slash') || !!(gp && gp.xHeld), aHeld: IN.down('Space') || IN.down('Period') || !!(gp && gp.aHeld), bHeld: !!(gp && gp.bHeld), ltHeld: !!(gp && gp.ltHeld), startHeld: false,
    };
    for (const k of EDGES) out[k] = !!L[k];
    out.any = ix !== 0 || iy !== 0 || out.aHeld || out.xHeld || EDGES.some(k => out[k]);
    return out;
  };
  // the input of this very frame (the same sources padNow reads): what the prediction steps with
  Net.liveInput = function () {
    if (Net.mute) return { ix: 0, iy: 0, a: false };
    const gp = IN.pad[0] || null;
    let ix = (IN.down('KeyD') ? 1 : 0) - (IN.down('KeyA') ? 1 : 0), iy = (IN.down('KeyS') ? 1 : 0) - (IN.down('KeyW') ? 1 : 0);
    if (!ix && gp) ix = gp.ix;
    if (!iy && gp) iy = gp.iy;
    return { ix, iy, a: IN.hit('Space') || IN.hit('Period') || !!(gp && gp.a) };
  };
  // every guest frame: collect presses, and send the pad at PAD_HZ (also the heartbeat the host watches), and AT ONCE when the held input changes or a button is pressed
  // (waiting for the next tick would add up to 1 / PAD_HZ of delay to every key press)
  Net.guestTick = function (dt) {
    if (Net.role !== 'guest') return;
    Net.collect();
    const st = Net.stats;
    st._t += dt; st._f++; st._mx = Math.max(st._mx || 0, (Net.frameTs - Net.prevTs) || 0);   // (the slowest frame of the second: a dip the average hides)
    if (st._t >= 1) {
      st.kbps = Math.round(st._b / 1024 / st._t); st.fps = +(st._n / st._t).toFixed(1); st.draw = Math.round(st._f / st._t); st._f = 0; st.worst = Math.round(st._mx); st._mx = 0;
      const want = st._hi - st._hi0, got = st._rx - st._rx0;   // numbers the host sent this second vs. pictures that arrived (the host never skips a number)
      st.loss = want > 0 ? Math.max(0, Math.round(100 * (1 - got / want))) : 0; st._hi0 = st._hi; st._rx0 = st._rx;
      st._t = 0; st._b = 0; st._n = 0;
    }
    if (Net.state !== 'live') return;
    if (now() - Net.lastRx > 6000) { connLost('silent'); return; }
    Net.padAcc += dt;
    const L = Net.latch || {}, sig = Net.liveInput(), key = sig.ix + ',' + sig.iy + (Net.latch && Object.keys(L).length ? '!' : '');
    if (Net.padAcc >= 1 / Net.PAD_HZ || (key !== Net.padSig && Net.padAcc >= 0.008)) {
      Net.padAcc = Math.min(Net.padAcc - 1 / Net.PAD_HZ, 1 / Net.PAD_HZ); if (Net.padAcc < 0) Net.padAcc = 0;
      const s = Net.padNow(), q = ++Net.padSeq, msg = { t: 'pad', s, q };
      Net.padSig = s.ix + ',' + s.iy;
      Net.hist.push({ q, t: Net.prevTs || performance.now(), ix: s.ix, iy: s.iy, a: !!s.a });   // (from the start of this frame's interval: Main.predictFrame applies it from there) if (Net.hist.length > 80) Net.hist.shift();
      later(() => send(Net.conn, msg));
      Net.latch = {};
    }
    Net.pingAcc += dt;
    if (Net.pingAcc >= 2) { Net.pingAcc = 0; send(Net.conn, { t: 'ping', at: performance.now() }); Net.pathProbe(); }
  };
  Net.sendBuy = id => { if (Net.role === 'guest' && Net.state === 'live') send(Net.conn, { t: 'buy', id }); };
  // the newest whole snapshot, once (the frame loop swaps G for it atomically)
  Net.takeSnap = function () { const s = Net.next; Net.next = null; if (s) Net.takenAt = Net.nextAt; return s; };
})();
