// ==========================================
// PEMBUKUAN API - ATOMIC INVENTORY ROUTER
// ==========================================
// Non-inventory routes continue to use worker.js. Inventory requests are
// routed to one Durable Object per user so concurrent checkouts are serialized.

import legacyWorker from './worker.js';
export { InventoryDO } from './inventory-do.js';

const SESSION_COOKIE = 'session';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/products')) return legacyWorker.fetch(request, env, ctx);

    const cors = getCorsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.get('Origin');
      if (origin && !getAllowedOrigins(env).includes(origin)) return json({ error: 'Forbidden origin' }, 403, cors);
    }

    const userId = await requireOwner(request, env);
    if (!userId) return json({ error: 'Invalid or expired session' }, 401, cors);

    const id = env.INVENTORY.idFromName(`user:${userId}`);
    const stub = env.INVENTORY.get(id);
    const target = new URL(url);
    target.pathname = url.pathname.replace(/^\/api/, '');
    const headers = new Headers(request.headers);
    // The DO uses this stable application-level ID for one-time KV migration.
    headers.set('X-Inventory-User', userId);
    const forwarded = new Request(target.toString(), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
    const response = await stub.fetch(forwarded);
    const out = new Response(response.body, response);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  }
};

async function requireOwner(request, env) {
  const token = getAuthToken(request);
  if (!token || !env.PEMBUKUAN_KV) return null;
  const raw = await env.PEMBUKUAN_KV.get(`session:${token}`);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    return typeof session.userId === 'string' && session.userId.length <= 100 ? session.userId : null;
  } catch {
    return null;
  }
}

function getAuthToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== SESSION_COOKIE) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
  }
  return null;
}

function getAllowedOrigins(env) {
  const configured = typeof env.ALLOWED_ORIGINS === 'string'
    ? env.ALLOWED_ORIGINS.split(',').map(v => v.trim()).filter(Boolean)
    : [];
  return configured.length ? configured : [
    'https://viqiquotex-art.github.io',
    'https://vixora.my.id',
    'https://www.vixora.my.id',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
  ];
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = getAllowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
