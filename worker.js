// ==========================================
// PEMBUKUAN API - Cloudflare Worker
// Authentication, Authorization, Transactions & Admin Audit
// ==========================================

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 100000;
const LEGACY_PASSWORD_SUFFIX = ':pembukuan-salt-2026';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 60 * 15;
const REGISTER_MAX_ATTEMPTS = 5;
const REGISTER_WINDOW_SECONDS = 60 * 60;
const RATE_LIMIT_PREFIX = 'rate:';
const SESSION_COOKIE = 'session';
const MAX_TRANSACTIONS_PER_SYNC = 1000;
const MAX_TRANSACTION_ID_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TRANSACTION_AMOUNT = 1_000_000_000_000_000;
const MAX_USER_ID_LENGTH = 100;
const TX_PREFIX = 'tx:';
const DELETED_PREFIX = 'deleted:';
const LEGACY_TRANSACTIONS_PREFIX = 'transactions:';
const AUDIT_PREFIX = 'audit:';
const AUDIT_RETENTION_SECONDS = 60 * 60 * 24 * 180;
const MAX_AUDIT_PAGE_SIZE = 100;
const MAX_CLIENT_FUTURE_SKEW_MS = 5 * 60 * 1000;

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (!isAllowedStateChangingOrigin(request, env)) return jsonResponse({ error: 'Forbidden origin' }, 403, corsHeaders);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    try {
      if (path === '/api/health' && method === 'GET') return jsonResponse({ status: 'ok', message: 'Pembukuan API is running ⚡', timestamp: new Date().toISOString() }, 200, corsHeaders);
      if (path === '/api/auth/register' && method === 'POST') return await handleRegister(request, env, corsHeaders);
      if (path === '/api/auth/login' && method === 'POST') return await handleLogin(request, env, corsHeaders);
      if (path === '/api/auth/logout' && method === 'POST') return await handleLogout(request, env, corsHeaders);
      if (path === '/api/auth/profile' && method === 'GET') return await handleGetProfile(request, env, corsHeaders);
      if (path === '/api/admin/config-status' && method === 'GET') return await handleAdminConfigStatus(request, env, corsHeaders);
      if (path === '/api/admin/users' && method === 'GET') return await handleGetUsers(request, env, corsHeaders);
      if (path === '/api/admin/overview' && method === 'GET') return await handleAdminOverview(request, env, corsHeaders);
      if (path === '/api/admin/audit' && method === 'GET') return await handleAdminAudit(request, env, corsHeaders);
      if (path === '/api/transactions' && method === 'POST') return await handleSaveTransactions(request, env, corsHeaders);
      if (path.match(/^\/api\/transactions\/[^/]+$/) && method === 'GET') return await handleGetTransactions(decodeURIComponent(path.split('/')[3]), request, env, corsHeaders);
      if (path.match(/^\/api\/transactions\/[^/]+\/[^/]+$/) && method === 'DELETE') { const parts = path.split('/'); return await handleDeleteTransaction(decodeURIComponent(parts[3]), decodeURIComponent(parts[4]), request, env, corsHeaders); }
      if (path.match(/^\/api\/stats\/[^/]+$/) && method === 'GET') return await handleGetStats(decodeURIComponent(path.split('/')[3]), request, env, corsHeaders);
      if (path.match(/^\/api\/export\/[^/]+$/) && method === 'GET') return await handleExport(decodeURIComponent(path.split('/')[3]), request, env, corsHeaders);
      return jsonResponse({ error: 'Endpoint not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('API Error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
    }
  }
};

function getAllowedOrigins(env) {
  const configuredOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean) : [];
  return configuredOrigins.length ? configuredOrigins : ['https://viqiquotex-art.github.io', 'https://vixora.my.id', 'https://www.vixora.my.id', 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
}
function isAllowedStateChangingOrigin(request, env) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true;
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return getAllowedOrigins(env).includes(origin);
}

async function handleRegister(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, password, name } = body || {};
    if (!email || !password || !name) return jsonResponse({ error: 'Missing required fields: email, password, name' }, 400, corsHeaders);
    if (typeof email !== 'string' || email.length > 254 || !isValidEmail(email)) return jsonResponse({ error: 'Invalid email format' }, 400, corsHeaders);
    if (typeof password !== 'string' || password.length < 8 || password.length > 1000) return jsonResponse({ error: 'Password must be between 8 and 1000 characters' }, 400, corsHeaders);
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) return jsonResponse({ error: 'Name must be between 2 and 100 characters' }, 400, corsHeaders);
    const kv = env.PEMBUKUAN_KV;
    if (!kv) throw new Error('PEMBUKUAN_KV binding is not configured');
    const normalizedEmail = email.trim().toLowerCase();
    const rate = await checkRateLimit(kv, `register:${normalizedEmail}`, REGISTER_MAX_ATTEMPTS, REGISTER_WINDOW_SECONDS);
    if (!rate.allowed) return rateLimitResponse(rate, corsHeaders);
    if (await kv.get(`user:${normalizedEmail}`)) return jsonResponse({ error: 'Email already registered' }, 409, corsHeaders);
    const userId = generateId();
    const passwordData = await hashPassword(password);
    const now = new Date().toISOString();
    const user = { userId, email: normalizedEmail, name: name.trim(), passwordHash: passwordData.hash, passwordSalt: passwordData.salt, passwordVersion: 1, createdAt: now, lastLogin: now };
    const token = generateToken();
    await kv.put(`user:${normalizedEmail}`, JSON.stringify(user));
    await kv.put(`user:${userId}`, JSON.stringify(user));
    await createSession(kv, token, userId);
    await recordAudit(env, { action: 'REGISTER', status: 'SUCCESS', userId, email: normalizedEmail, metadata: { source: 'auth' } });
    return jsonResponse({ success: true, message: 'Registration successful', userId, name: user.name, email: user.email, token, expiresIn: SESSION_TTL_SECONDS }, 201, withCookie(corsHeaders, buildSessionCookie(token)));
  } catch (error) { console.error('Register error:', error); return jsonResponse({ error: 'Registration failed' }, 500, corsHeaders); }
}

async function handleLogin(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, password } = body || {};
    if (!email || !password) return jsonResponse({ error: 'Missing email or password' }, 400, corsHeaders);
    if (typeof email !== 'string' || email.length > 254 || !isValidEmail(email)) return jsonResponse({ error: 'Invalid email format' }, 400, corsHeaders);
    if (typeof password !== 'string' || password.length > 1000) return jsonResponse({ error: 'Invalid password' }, 400, corsHeaders);
    const kv = env.PEMBUKUAN_KV;
    if (!kv) throw new Error('PEMBUKUAN_KV binding is not configured');
    const normalizedEmail = email.trim().toLowerCase();
    const rate = await checkRateLimit(kv, `login:${normalizedEmail}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!rate.allowed) { await recordAudit(env, { action: 'LOGIN_FAILED', status: 'RATE_LIMITED', email: normalizedEmail, metadata: { reason: 'rate_limit' } }); return rateLimitResponse(rate, corsHeaders); }
    const raw = await kv.get(`user:${normalizedEmail}`);
    if (!raw) { await recordAudit(env, { action: 'LOGIN_FAILED', status: 'FAILURE', email: normalizedEmail, metadata: { reason: 'unknown_account' } }); return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders); }
    const user = JSON.parse(raw);
    let valid = false;
    if (user.passwordHash && user.passwordSalt) valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    else if (user.password) valid = user.password === encodeLegacyPassword(password);
    if (!valid) { await recordAudit(env, { action: 'LOGIN_FAILED', status: 'FAILURE', userId: user.userId, email: normalizedEmail, metadata: { reason: 'invalid_credentials' } }); return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders); }
    await clearRateLimit(kv, `login:${normalizedEmail}`);
    if (user.password) { const passwordData = await hashPassword(password); user.passwordHash = passwordData.hash; user.passwordSalt = passwordData.salt; user.passwordVersion = 1; delete user.password; }
    user.lastLogin = new Date().toISOString();
    const token = generateToken();
    await kv.put(`user:${normalizedEmail}`, JSON.stringify(user));
    await kv.put(`user:${user.userId}`, JSON.stringify(user));
    await createSession(kv, token, user.userId);
    await recordAudit(env, { action: 'LOGIN_SUCCESS', status: 'SUCCESS', userId: user.userId, email: normalizedEmail, metadata: { source: 'auth' } });
    return jsonResponse({ success: true, message: 'Login successful', userId: user.userId, name: user.name, email: user.email, token, expiresIn: SESSION_TTL_SECONDS }, 200, withCookie(corsHeaders, buildSessionCookie(token)));
  } catch (error) { console.error('Login error:', error); return jsonResponse({ error: 'Login failed' }, 500, corsHeaders); }
}

async function checkRateLimit(kv, identifier, maxAttempts, windowSeconds) {
  const key = `${RATE_LIMIT_PREFIX}${identifier}`; const now = Date.now(); const raw = await kv.get(key); let state = null;
  if (raw) { try { state = JSON.parse(raw); } catch { state = null; } }
  if (!state || !Number.isFinite(state.startedAt) || now - state.startedAt >= windowSeconds * 1000) state = { count: 0, startedAt: now };
  if (state.count >= maxAttempts) { const retryAfter = Math.max(1, Math.ceil((windowSeconds * 1000 - (now - state.startedAt)) / 1000)); return { allowed: false, retryAfter, limit: maxAttempts }; }
  state.count += 1; const remainingTtl = Math.max(1, Math.ceil((windowSeconds * 1000 - (now - state.startedAt)) / 1000));
  await kv.put(key, JSON.stringify(state), { expirationTtl: remainingTtl });
  return { allowed: true, retryAfter: remainingTtl, limit: maxAttempts, remaining: Math.max(0, maxAttempts - state.count) };
}
async function clearRateLimit(kv, identifier) { await kv.delete(`${RATE_LIMIT_PREFIX}${identifier}`); }
function rateLimitResponse(rate, corsHeaders) { return jsonResponse({ error: 'Too many authentication attempts. Please try again later.', retryAfter: rate.retryAfter }, 429, { ...corsHeaders, 'Retry-After': String(rate.retryAfter) }); }

async function handleLogout(request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    const userId = token ? await getTokenOwner(token, env.PEMBUKUAN_KV) : null;
    let email = '';
    if (userId && env.PEMBUKUAN_KV) { const raw = await env.PEMBUKUAN_KV.get(`user:${userId}`); if (raw) { try { email = JSON.parse(raw).email || ''; } catch {} } }
    if (token && env.PEMBUKUAN_KV) await env.PEMBUKUAN_KV.delete(`session:${token}`);
    if (userId) await recordAudit(env, { action: 'LOGOUT', status: 'SUCCESS', userId, email, metadata: { source: 'auth' } });
    return jsonResponse({ success: true, message: 'Logout successful' }, 200, withCookie(corsHeaders, clearSessionCookie()));
  } catch (error) { console.error('Logout error:', error); return jsonResponse({ error: 'Logout failed' }, 500, corsHeaders); }
}
async function handleGetProfile(request, env, corsHeaders) {
  try { const userId = await requireOwner(request, env); if (!userId) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); const data = await env.PEMBUKUAN_KV.get(`user:${userId}`); if (!data) return jsonResponse({ error: 'User not found' }, 404, corsHeaders); const user = JSON.parse(data); return jsonResponse({ success: true, userId: user.userId, name: user.name, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin }, 200, corsHeaders); }
  catch (error) { console.error('Profile error:', error); return jsonResponse({ error: 'Failed to get profile' }, 500, corsHeaders); }
}

async function requireAdmin(request, env) {
  const ownerId = await requireOwner(request, env);
  if (!ownerId) return { ok: false, status: 401, error: 'Invalid or expired token' };
  const adminEmail = typeof env.ADMIN_EMAIL === 'string' ? env.ADMIN_EMAIL.trim().toLowerCase() : '';
  if (!adminEmail) return { ok: false, status: 503, error: 'Admin configuration is missing' };
  const ownerData = await env.PEMBUKUAN_KV.get(`user:${ownerId}`);
  if (!ownerData) return { ok: false, status: 404, error: 'Admin user not found' };
  let owner;
  try { owner = JSON.parse(ownerData); } catch { return { ok: false, status: 404, error: 'Admin user data is invalid' }; }
  const ownerEmail = typeof owner.email === 'string' ? owner.email.trim().toLowerCase() : '';
  if (ownerEmail !== adminEmail) return { ok: false, status: 403, error: 'Forbidden: admin access required' };
  return { ok: true, userId: ownerId, email: ownerEmail };
}

async function handleAdminConfigStatus(request, env, corsHeaders) {
  try {
    const admin = await requireAdmin(request, env);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status, corsHeaders);
    await recordAudit(env, { action: 'ADMIN_CONFIG_CHECK', status: 'SUCCESS', userId: admin.userId, email: admin.email, metadata: { endpoint: '/api/admin/config-status' } });
    return jsonResponse({ success: true, adminConfigured: Boolean(env.ADMIN_EMAIL), kvConfigured: Boolean(env.PEMBUKUAN_KV), checkedAt: new Date().toISOString() }, 200, corsHeaders);
  } catch (error) { console.error('Admin config status error:', error); return jsonResponse({ error: 'Failed to check admin configuration' }, 500, corsHeaders); }
}

async function listUsers(env) {
  const users = [];
  let cursor;
  do {
    const page = await env.PEMBUKUAN_KV.list({ prefix: 'user:', cursor });
    for (const key of page.keys) {
      const value = await env.PEMBUKUAN_KV.get(key.name);
      if (!value) continue;
      try {
        const user = JSON.parse(value);
        if (key.name !== `user:${user.userId}`) continue;
        users.push({ userId: user.userId, name: user.name, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin });
      } catch {}
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return users;
}

async function handleGetUsers(request, env, corsHeaders) {
  try {
    const admin = await requireAdmin(request, env);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status, corsHeaders);
    const users = await listUsers(env);
    const usersWithRole = users.map(user => ({ ...user, isAdmin: String(user.email || '').trim().toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase() }));
    usersWithRole.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    await recordAudit(env, { action: 'ADMIN_USERS_VIEW', status: 'SUCCESS', userId: admin.userId, email: admin.email, metadata: { count: usersWithRole.length } });
    return jsonResponse({ success: true, count: usersWithRole.length, users: usersWithRole }, 200, corsHeaders);
  } catch (error) { console.error('Admin users error:', error); return jsonResponse({ error: 'Failed to get users' }, 500, corsHeaders); }
}

function parsePositiveInt(value, fallback, max) { const n = Number.parseInt(value, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback; }
function startOfUtcDay(date) { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); return d; }
function dayKey(date) { return new Date(date).toISOString().slice(0, 10); }
function buildDailyBuckets(days) { const buckets = []; const now = startOfUtcDay(new Date()); for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - i); buckets.push({ date: dayKey(d), registrations: 0, logins: 0, failedLogins: 0 }); } return buckets; }

async function getAuditEvents(env, options = {}) {
  const limit = options.limit || 1000;
  const events = [];
  let cursor;
  do {
    const page = await env.PEMBUKUAN_KV.list({ prefix: AUDIT_PREFIX, limit: 1000, cursor });
    for (const key of page.keys) {
      const raw = await env.PEMBUKUAN_KV.get(key.name);
      if (!raw) continue;
      try { events.push(JSON.parse(raw)); } catch {}
      if (events.length >= limit) break;
    }
    if (events.length >= limit) break;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  events.sort((a, b) => Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0));
  return events;
}

async function handleAdminOverview(request, env, corsHeaders) {
  try {
    const admin = await requireAdmin(request, env);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status, corsHeaders);
    const url = new URL(request.url);
    const days = parsePositiveInt(url.searchParams.get('days'), 30, 90);
    const users = await listUsers(env);
    const today = startOfUtcDay(new Date());
    const activeCutoff = Date.now() - 30 * 86400000;
    const new7Cutoff = Date.now() - 7 * 86400000;
    const totalUsers = users.length;
    const activeUsers30d = users.filter(u => Date.parse(u.lastLogin || '') >= activeCutoff).length;
    const newUsers7d = users.filter(u => Date.parse(u.createdAt || '') >= new7Cutoff).length;
    const registrationsToday = users.filter(u => Date.parse(u.createdAt || '') >= today.getTime()).length;
    const events = await getAuditEvents(env, 5000);
    const buckets = buildDailyBuckets(days);
    const map = new Map(buckets.map(bucket => [bucket.date, bucket]));
    for (const user of users) { const date = dayKey(user.createdAt); if (map.has(date)) map.get(date).registrations += 1; }
    for (const event of events) {
      const date = dayKey(event.timestamp); const bucket = map.get(date); if (!bucket) continue;
      if (event.action === 'LOGIN_SUCCESS') bucket.logins += 1;
      if (event.action === 'LOGIN_FAILED') bucket.failedLogins += 1;
    }
    const loginSuccess = events.filter(e => e.action === 'LOGIN_SUCCESS');
    const failedLogin = events.filter(e => e.action === 'LOGIN_FAILED');
    const login24h = loginSuccess.filter(e => Date.parse(e.timestamp) >= Date.now() - 86400000).length;
    const failed24h = failedLogin.filter(e => Date.parse(e.timestamp) >= Date.now() - 86400000).length;
    const role = { admin: users.filter(u => String(u.email || '').trim().toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase()).length, user: 0 };
    role.user = Math.max(0, totalUsers - role.admin);
    await recordAudit(env, { action: 'ADMIN_OVERVIEW_VIEW', status: 'SUCCESS', userId: admin.userId, email: admin.email, metadata: { days } });
    return jsonResponse({ success: true, generatedAt: new Date().toISOString(), rangeDays: days, summary: { totalUsers, activeUsers30d, newUsers7d, registrationsToday, login24h, failedLogin24h: failed24h, roles: role }, series: buckets, audit: { totalLoginSuccess: loginSuccess.length, totalLoginFailed: failedLogin.length } }, 200, corsHeaders);
  } catch (error) { console.error('Admin overview error:', error); return jsonResponse({ error: 'Failed to build admin overview' }, 500, corsHeaders); }
}

async function handleAdminAudit(request, env, corsHeaders) {
  try {
    const admin = await requireAdmin(request, env);
    if (!admin.ok) return jsonResponse({ error: admin.error }, admin.status, corsHeaders);
    const url = new URL(request.url);
    const page = parsePositiveInt(url.searchParams.get('page'), 1, 1000000);
    const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 25, MAX_AUDIT_PAGE_SIZE);
    const action = String(url.searchParams.get('action') || 'all').trim().toUpperCase();
    const status = String(url.searchParams.get('status') || 'all').trim().toUpperCase();
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
    const from = Date.parse(url.searchParams.get('from') || '') || 0;
    const toRaw = Date.parse(url.searchParams.get('to') || '');
    const to = toRaw ? toRaw + 86400000 - 1 : Number.POSITIVE_INFINITY;
    let events = await getAuditEvents(env, 5000);
    if (action !== 'ALL') events = events.filter(e => e.action === action);
    if (status !== 'ALL') events = events.filter(e => e.status === status);
    if (q) events = events.filter(e => `${e.email || ''} ${e.userId || ''} ${e.action || ''} ${e.metadata?.reason || ''}`.toLowerCase().includes(q));
    events = events.filter(e => { const t = Date.parse(e.timestamp || ''); return Number.isFinite(t) && t >= from && t <= to; });
    const total = events.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * pageSize;
    const items = events.slice(start, start + pageSize).map(e => ({ id: e.id, timestamp: e.timestamp, action: e.action, status: e.status, userId: e.userId || null, email: e.email || null, metadata: e.metadata || {} }));
    await recordAudit(env, { action: 'ADMIN_AUDIT_VIEW', status: 'SUCCESS', userId: admin.userId, email: admin.email, metadata: { page: safePage, pageSize, action, status } });
    return jsonResponse({ success: true, page: safePage, pageSize, total, totalPages: pages, events: items }, 200, corsHeaders);
  } catch (error) { console.error('Admin audit error:', error); return jsonResponse({ error: 'Failed to get audit log' }, 500, corsHeaders); }
}

async function recordAudit(env, event) {
  try {
    const kv = env.PEMBUKUAN_KV;
    if (!kv) return false;
    const timestamp = new Date().toISOString();
    const id = generateId();
    const safe = {
      id,
      timestamp,
      action: String(event.action || 'UNKNOWN').slice(0, 60),
      status: String(event.status || 'SUCCESS').slice(0, 40),
      userId: typeof event.userId === 'string' ? event.userId.slice(0, MAX_USER_ID_LENGTH) : undefined,
      email: typeof event.email === 'string' ? event.email.trim().toLowerCase().slice(0, 254) : undefined,
      metadata: sanitizeAuditMetadata(event.metadata)
    };
    Object.keys(safe).forEach(key => safe[key] === undefined && delete safe[key]);
    const reverseTime = String(9999999999999 - Date.now()).padStart(13, '0');
    await kv.put(`${AUDIT_PREFIX}${reverseTime}:${id}`, JSON.stringify(safe), { expirationTtl: AUDIT_RETENTION_SECONDS });
    return true;
  } catch (error) { console.error('Audit write error:', error); return false; }
}
function sanitizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 10)) {
    if (typeof value === 'string') safe[String(key).slice(0, 40)] = value.slice(0, 200);
    else if (typeof value === 'number' || typeof value === 'boolean') safe[String(key).slice(0, 40)] = value;
  }
  return safe;
}

async function handleSaveTransactions(request, env, corsHeaders) {
  try { const body = await request.json(); const { userId, transactions } = body || {};
    if (typeof userId !== 'string' || !userId.trim() || userId.length > MAX_USER_ID_LENGTH || !Array.isArray(transactions)) return jsonResponse({ error: 'Invalid userId or transactions' }, 400, corsHeaders);
    if (transactions.length > MAX_TRANSACTIONS_PER_SYNC) return jsonResponse({ error: `Maximum ${MAX_TRANSACTIONS_PER_SYNC} transactions per sync` }, 400, corsHeaders);
    const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: token does not match user' }, 403, corsHeaders);
    const now = new Date().toISOString(); const incomingIds = new Set();
    for (const transaction of transactions) { const validation = validateTransaction(transaction, now); if (!validation.valid) return jsonResponse({ error: validation.error }, 400, corsHeaders); if (incomingIds.has(transaction.id)) return jsonResponse({ error: `Duplicate transaction ID in sync: ${transaction.id}` }, 400, corsHeaders); incomingIds.add(transaction.id); }
    const deletedIds = new Set(await getDeletedIds(userId, env)); await migrateLegacyTransactions(userId, env, deletedIds); let saved = 0; let skippedDeleted = 0;
    for (const transaction of transactions) { if (deletedIds.has(transaction.id)) { skippedDeleted += 1; continue; } const key = transactionKey(userId, transaction.id); const existingRaw = await env.PEMBUKUAN_KV.get(key); let shouldWrite = true; if (existingRaw) { try { const existing = JSON.parse(existingRaw); shouldWrite = getTimestamp(transaction) > getTimestamp(existing); } catch { shouldWrite = false; } } if (!shouldWrite) continue; await env.PEMBUKUAN_KV.put(key, JSON.stringify(transaction)); saved += 1; const tombstone = await env.PEMBUKUAN_KV.get(`${DELETED_PREFIX}${userId}:${transaction.id}`); if (tombstone) { await env.PEMBUKUAN_KV.delete(key); skippedDeleted += 1; } }
    const result = await listTransactions(userId, env, deletedIds);
    if (saved > 0) { const raw = await env.PEMBUKUAN_KV.get(`user:${userId}`); let email = ''; try { email = raw ? JSON.parse(raw).email || '' : ''; } catch {} await recordAudit(env, { action: 'TRANSACTIONS_SYNC', status: 'SUCCESS', userId, email, metadata: { saved, skippedDeleted } }); }
    return jsonResponse({ success: true, message: 'Transactions synchronized successfully', count: result.length, saved, skippedDeleted, transactions: result, deletedIds: Array.from(deletedIds) }, 200, corsHeaders);
  } catch (error) { console.error('Save transactions error:', error); return jsonResponse({ error: 'Failed to save transactions' }, 500, corsHeaders); }
}

function validateTransaction(transaction, fallbackTimestamp) {
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) return { valid: false, error: 'Invalid transaction object' };
  if (typeof transaction.id !== 'string' || transaction.id.length < 1 || transaction.id.length > MAX_TRANSACTION_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(transaction.id)) return { valid: false, error: 'Invalid transaction ID' };
  if (transaction.type !== 'income' && transaction.type !== 'expense') return { valid: false, error: 'Transaction type must be income or expense' };
  if (typeof transaction.category !== 'string' || transaction.category.trim().length < 1 || transaction.category.length > MAX_CATEGORY_LENGTH) return { valid: false, error: 'Invalid transaction category' };
  if (typeof transaction.amount !== 'number' || !Number.isFinite(transaction.amount) || transaction.amount <= 0 || transaction.amount > MAX_TRANSACTION_AMOUNT) return { valid: false, error: 'Transaction amount must be a valid positive number' };
  if (typeof transaction.date !== 'string' || !isValidDateOnly(transaction.date)) return { valid: false, error: 'Transaction date must be a valid YYYY-MM-DD date' };
  if (transaction.description !== undefined && transaction.description !== null && (typeof transaction.description !== 'string' || transaction.description.length > MAX_DESCRIPTION_LENGTH)) return { valid: false, error: 'Invalid transaction description' };
  for (const field of ['createdAt', 'updatedAt']) { if (transaction[field] !== undefined) { if (typeof transaction[field] !== 'string') return { valid: false, error: `Invalid transaction ${field}` }; const parsed = Date.parse(transaction[field]); if (!Number.isFinite(parsed)) return { valid: false, error: `Invalid transaction ${field}` }; if (parsed > Date.now() + MAX_CLIENT_FUTURE_SKEW_MS) return { valid: false, error: `Transaction ${field} cannot be far in the future` }; } }
  return { valid: true };
}
function isValidDateOnly(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function transactionKey(userId, transactionId) { return `${TX_PREFIX}${userId}:${transactionId}`; }
async function listTransactions(userId, env, deletedIds = new Set()) { const transactions = []; let cursor; do { const page = await env.PEMBUKUAN_KV.list({ prefix: `${TX_PREFIX}${userId}:`, cursor }); for (const key of page.keys) { if (deletedIds.has(key.name.slice(`${TX_PREFIX}${userId}:`.length))) continue; const raw = await env.PEMBUKUAN_KV.get(key.name); if (!raw) continue; try { const transaction = JSON.parse(raw); if (validateTransaction(transaction, new Date().toISOString()).valid) transactions.push(transaction); } catch {} } cursor = page.list_complete ? undefined : page.cursor; } while (cursor); transactions.sort((a, b) => { const dateDiff = new Date(b.date) - new Date(a.date); return dateDiff || getTimestamp(b) - getTimestamp(a); }); return transactions; }
async function migrateLegacyTransactions(userId, env, deletedIds = new Set()) { const key = `${LEGACY_TRANSACTIONS_PREFIX}${userId}`; const raw = await env.PEMBUKUAN_KV.get(key); if (!raw) return; try { const legacy = JSON.parse(raw); if (!Array.isArray(legacy)) return; for (const transaction of legacy) { if (!validateTransaction(transaction, new Date().toISOString()).valid || deletedIds.has(transaction.id)) continue; const target = transactionKey(userId, transaction.id); if (!(await env.PEMBUKUAN_KV.get(target))) await env.PEMBUKUAN_KV.put(target, JSON.stringify(transaction)); } await env.PEMBUKUAN_KV.delete(key); } catch {} }
async function handleGetTransactions(userId, request, env, corsHeaders) { try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: cannot access other user data' }, 403, corsHeaders); const deletedIds = new Set(await getDeletedIds(userId, env)); await migrateLegacyTransactions(userId, env, deletedIds); const transactions = await listTransactions(userId, env, deletedIds); return jsonResponse({ success: true, userId, transactions, count: transactions.length, deletedIds: Array.from(deletedIds) }, 200, corsHeaders); } catch (error) { console.error('Get transactions error:', error); return jsonResponse({ error: 'Failed to get transactions' }, 500, corsHeaders); } }
async function handleDeleteTransaction(userId, transactionId, request, env, corsHeaders) { try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders); if (typeof transactionId !== 'string' || transactionId.length < 1 || transactionId.length > MAX_TRANSACTION_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(transactionId)) return jsonResponse({ error: 'Invalid transaction ID' }, 400, corsHeaders); const deletedAt = new Date().toISOString(); await env.PEMBUKUAN_KV.put(`${DELETED_PREFIX}${userId}:${transactionId}`, JSON.stringify({ transactionId, deletedAt })); await env.PEMBUKUAN_KV.delete(transactionKey(userId, transactionId)); await env.PEMBUKUAN_KV.delete(`${LEGACY_TRANSACTIONS_PREFIX}${userId}`); const raw = await env.PEMBUKUAN_KV.get(`user:${userId}`); let email = ''; try { email = raw ? JSON.parse(raw).email || '' : ''; } catch {} await recordAudit(env, { action: 'TRANSACTION_DELETE', status: 'SUCCESS', userId, email, metadata: { transactionId } }); return jsonResponse({ success: true, message: 'Transaction deleted', transactionId, deletedAt }, 200, corsHeaders); } catch (error) { console.error('Delete transaction error:', error); return jsonResponse({ error: 'Failed to delete transaction' }, 500, corsHeaders); } }
async function getDeletedIds(userId, env) { const ids = []; let cursor; do { const page = await env.PEMBUKUAN_KV.list({ prefix: `${DELETED_PREFIX}${userId}:`, cursor }); for (const key of page.keys) ids.push(key.name.slice(`${DELETED_PREFIX}${userId}:`.length)); cursor = page.list_complete ? undefined : page.cursor; } while (cursor); return ids; }
async function handleGetStats(userId, request, env, corsHeaders) { try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders); const deletedIds = new Set(await getDeletedIds(userId, env)); await migrateLegacyTransactions(userId, env, deletedIds); const transactions = await listTransactions(userId, env, deletedIds); const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0); const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0); const stats = { totalIncome: income, totalExpense: expense, balance: income - expense, transactionCount: transactions.length }; return jsonResponse({ success: true, userId, stats, ...stats }, 200, corsHeaders); } catch (error) { console.error('Stats error:', error); return jsonResponse({ error: 'Failed to get stats' }, 500, corsHeaders); } }
async function handleExport(userId, request, env, corsHeaders) { try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders); const deletedIds = new Set(await getDeletedIds(userId, env)); await migrateLegacyTransactions(userId, env, deletedIds); const transactions = await listTransactions(userId, env, deletedIds); return jsonResponse({ success: true, userId, transactions, count: transactions.length }, 200, corsHeaders); } catch (error) { console.error('Export error:', error); return jsonResponse({ error: 'Failed to export data' }, 500, corsHeaders); } }
async function createSession(kv, token, userId) { await kv.put(`session:${token}`, JSON.stringify({ userId, createdAt: new Date().toISOString() }), { expirationTtl: SESSION_TTL_SECONDS }); }
async function getTokenOwner(token, kv) { if (!token || !kv) return null; const raw = await kv.get(`session:${token}`); if (!raw) return null; try { const session = JSON.parse(raw); return typeof session.userId === 'string' ? session.userId : null; } catch { return null; } }
function requireOwner(request, env) { return getTokenOwner(getAuthToken(request), env.PEMBUKUAN_KV); }
function getAuthToken(request) { const authHeader = request.headers.get('Authorization') || ''; if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim(); return getCookie(request, SESSION_COOKIE); }
async function hashPassword(password) { const saltBytes = crypto.getRandomValues(new Uint8Array(16)); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256); return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(saltBytes) }; }
async function verifyPassword(password, encodedHash, encodedSalt) { try { const salt = base64ToBytes(encodedSalt); const expected = base64ToBytes(encodedHash); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256); return constantTimeEqual(new Uint8Array(bits), expected); } catch { return false; } }
function constantTimeEqual(a, b) { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i]; return result === 0; }
function encodeLegacyPassword(password) { return btoa(unescape(encodeURIComponent(password + LEGACY_PASSWORD_SUFFIX))); }
function bytesToBase64(bytes) { let binary = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk)); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
function getTimestamp(transaction) { const value = transaction && (transaction.updatedAt || transaction.createdAt); const timestamp = value ? Date.parse(value) : 0; return Number.isFinite(timestamp) ? timestamp : 0; }
function getCorsHeaders(request, env) { const requestOrigin = request.headers.get('Origin'); const allowedOrigins = getAllowedOrigins(env); const headers = { 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Max-Age': '86400', 'Content-Type': 'application/json', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://pembukuan-app.viqiquotex.workers.dev; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()' }; if (requestOrigin && allowedOrigins.includes(requestOrigin)) headers['Access-Control-Allow-Origin'] = requestOrigin; return headers; }
function withCookie(headers, cookie) { return cookie ? { ...headers, 'Set-Cookie': cookie } : headers; }
function buildSessionCookie(token) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`; }
function clearSessionCookie() { return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`; }
function getCookie(request, name) { const header = request.headers.get('Cookie') || ''; for (const part of header.split(';')) { const index = part.indexOf('='); if (index === -1) continue; const key = part.slice(0, index).trim(); const value = part.slice(index + 1).trim(); if (key === name) { try { return decodeURIComponent(value); } catch { return null; } } } return null; }
function generateId() { return crypto.randomUUID(); }
function generateToken() { return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }
function jsonResponse(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers }); }
