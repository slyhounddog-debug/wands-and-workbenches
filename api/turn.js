// Vercel serverless function (Node): hands the game a short-lived Cloudflare Realtime TURN login, so two computers that cannot connect directly (phone hotspots,
// strict routers) can still play online through Cloudflare's relay. The secret TURN token never leaves this function; the browser only gets the temporary login.
//
// Settings (Vercel project > Settings > Environment Variables):
//   CF_TURN_KEY_ID        the TURN key's ID (Cloudflare dashboard > Realtime > TURN)
//   CF_TURN_API_TOKEN     that key's API token
//   TURN_ALLOWED_ORIGINS  optional, comma separated extra sites allowed to ask (e.g. the GitHub Pages copy of the game); the game's own address always is
//
// The game calls GET /api/turn when a room is created or joined (js/net.js). Without these settings (or on any failure) it answers an error and the game simply tries a
// direct connection, as before.
const TTL = 86400;                     // seconds a login lasts (a session that outlives it reconnects with a fresh one)
const LIMIT = 30, WINDOW = 10 * 60 * 1000;   // at most 30 logins per address per 10 minutes (kept per warm instance: a cheap brake, not a guarantee)
const hits = new Map();

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin || '', host = req.headers.host || '';
  const extra = (process.env.TURN_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  // who may ask: the game on this very address (browsers say so with Sec-Fetch-Site), or a site on the list. Anything else (a script, someone else's page) is refused.
  const ownSite = req.headers['sec-fetch-site'] === 'same-origin' || (origin !== '' && origin === 'https://' + host);
  const listed = origin !== '' && extra.includes(origin);
  if (listed) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  if (!ownSite && !listed) return send(res, 403, { error: 'not allowed from here' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown', now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (recent.length >= LIMIT) return send(res, 429, { error: 'too many requests' });
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW)) hits.delete(k);

  const id = process.env.CF_TURN_KEY_ID, token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return send(res, 503, { error: 'relay not configured' });
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/' + encodeURIComponent(id) + '/credentials/generate-ice-servers', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: TTL }), signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return send(res, 502, { error: 'relay provider said ' + r.status });
    const j = await r.json();
    // port 53 addresses time out in browsers (Cloudflare's own docs say to leave them out)
    const iceServers = (j.iceServers || []).map(s => Object.assign({}, s, { urls: [].concat(s.urls).filter(u => !/:53(\?|$)/.test(u)) })).filter(s => s.urls.length);
    return send(res, 200, { iceServers });
  } catch (e) {
    return send(res, 502, { error: 'relay provider unreachable' });
  }
};

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
