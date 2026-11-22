// Cloudflare Worker: sends Web Push notifications for the Home Tutor app. 100% free tier, no dependencies.
//
// Required variables (Worker → Settings → Variables and Secrets):
//   VAPID_PRIVATE_JWK   (Secret)  private key JSON from push-setup.html
//   VAPID_PUBLIC        (Text)    public key from push-setup.html
//   VAPID_SUBJECT       (Text)    mailto:you@example.com
//   FIREBASE_PROJECT_ID (Text)    your Firebase project id
//   ADMIN_EMAIL         (Text)    the teacher's email (only this account may send)
//   ALLOWED_ORIGIN      (Text)    your site, e.g. https://yourname.web.app  (comma-separate several)

const te = new TextEncoder();
const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
};
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

// RFC 8291 (aes128gcm) payload encryption.
export async function encryptPayload(sub, payload) {
  const uaPub = b64u.dec(sub.p256dh), authSecret = b64u.dec(sub.auth);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  return concat(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([65]), asPub, ct);
}

// RFC 8292 VAPID header.
export async function vapidHeader(endpoint, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC}`;
}

// Only the teacher's Firebase login may call this worker.
let jwks = null, jwksAt = 0;
export async function verifyTeacher(idToken, env) {
  const [h, p, s] = String(idToken || '').split('.');
  if (!h || !p || !s) throw new Error('bad token');
  const head = JSON.parse(new TextDecoder().decode(b64u.dec(h))), pay = JSON.parse(new TextDecoder().decode(b64u.dec(p)));
  if (head.alg !== 'RS256') throw new Error('bad alg');
  if (!jwks || Date.now() - jwksAt > 3600e3) {
    jwks = (await (await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')).json()).keys;
    jwksAt = Date.now();
  }
  const jwk = jwks.find(k => k.kid === head.kid); if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u.dec(s), te.encode(`${h}.${p}`))) throw new Error('bad signature');
  const now = Math.floor(Date.now() / 1000);
  if (pay.aud !== env.FIREBASE_PROJECT_ID || pay.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error('wrong project');
  if (!(pay.exp > now) || !pay.sub) throw new Error('expired');
  if (pay.email_verified !== true || String(pay.email || '').toLowerCase() !== String(env.ADMIN_EMAIL).toLowerCase()) throw new Error('not the teacher');
  return pay;
}

const cors = (req, env) => {
  const origin = req.headers.get('Origin') || '';
  const ok = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean).includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null', 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
};
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...h } });
const clip = (v, n) => String(v ?? '').slice(0, n);

export async function handle(req, env) {
  const h = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, h);
  if (h['Access-Control-Allow-Origin'] === 'null') return json({ error: 'origin not allowed' }, 403, h);
  try { await verifyTeacher((req.headers.get('Authorization') || '').replace(/^Bearer /, ''), env); }
  catch (e) { return json({ error: 'unauthorized: ' + e.message }, 401, h); }

  let body; try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
  const msgs = Array.isArray(body.messages) ? body.messages.slice(0, 40) : [];
  const results = await Promise.all(msgs.map(async (m, i) => {
    try {
      const sub = m.sub || {};
      if (!/^https:\/\//.test(sub.endpoint || '') || !sub.p256dh || !sub.auth) return { i, status: 0, error: 'bad subscription' };
      const payload = te.encode(JSON.stringify({ title: clip(m.title, 100), body: clip(m.body, 300), url: clip(m.url, 500), tag: clip(m.tag, 60) || undefined }));
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { 'TTL': '86400', 'Urgency': 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Authorization': await vapidHeader(sub.endpoint, env) },
        body: await encryptPayload(sub, payload)
      });
      return { i, status: res.status };
    } catch (e) { return { i, status: 0, error: String(e.message || e) }; }
  }));
  return json({ results }, 200, h);
}

export default { fetch: (req, env) => handle(req, env) };
