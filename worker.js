// ==========================================
// PEMBUKUAN API - Cloudflare Worker
// Authentication, Authorization & Transactions
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

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    try {
      if (path === '/api/health' && method === 'GET') return jsonResponse({ status: 'ok', message: 'Pembukuan API is running ⚡', timestamp: new Date().toISOString() }, 200, corsHeaders);
      if (path === '/api/auth/register' && method === 'POST') return await handleRegister(request, env, corsHeaders);
      if (path === '/api/auth/login' && method === 'POST') return await handleLogin(request, env, corsHeaders);
      if (path === '/api/auth/logout' && method === 'POST') return await handleLogout(request, env, corsHeaders);
      if (path === '/api/auth/profile' && method === 'GET') return await handleGetProfile(request, env, corsHeaders);
      if (path === '/api/admin/users' && method === 'GET') return await handleGetUsers(request, env, corsHeaders);
      if (path === '/api/transactions' && method === 'POST') return await handleSaveTransactions(request, env, corsHeaders);
      if (path.match(/^\/api\/transactions\/[^/]+$/) && method === 'GET') return await handleGetTransactions(path.split('/')[3], request, env, corsHeaders);
      if (path.match(/^\/api\/transactions\/[^/]+\/[^/]+$/) && method === 'DELETE') { const parts = path.split('/'); return await handleDeleteTransaction(parts[3], parts[4], request, env, corsHeaders); }
      if (path.match(/^\/api\/stats\/[^/]+$/) && method === 'GET') return await handleGetStats(path.split('/')[3], request, env, corsHeaders);
      if (path.match(/^\/api\/export\/[^/]+$/) && method === 'GET') return await handleExport(path.split('/')[3], request, env, corsHeaders);
      return jsonResponse({ error: 'Endpoint not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('API Error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
    }
  }
};

async function handleRegister(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, password, name } = body || {};
    if (!email || !password || !name) return jsonResponse({ error: 'Missing required fields: email, password, name' }, 400, corsHeaders);
    if (!isValidEmail(email)) return jsonResponse({ error: 'Invalid email format' }, 400, corsHeaders);
    if (typeof password !== 'string' || password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400, corsHeaders);
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
    return jsonResponse({ success: true, message: 'Registration successful', userId, name: user.name, email: user.email, expiresIn: SESSION_TTL_SECONDS }, 201, withCookie(corsHeaders, buildSessionCookie(token)));
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
    if (!kv) throw new Error('PEMBUCUAN_KV binding is not configured');
    const normalizedEmail = email.trim().toLowerCase();
    const rate = await checkRateLimit(kv, `login:${normalizedEmail}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!rate.allowed) return rateLimitResponse(rate, corsHeaders);
    const raw = await kv.get(`user:${normalizedEmail}`);
    if (!raw) return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders);
    const user = JSON.parse(raw);
    let valid = false;
    if (user.passwordHash && user.passwordSalt) valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    else if (user.password) valid = user.password === encodeLegacyPassword(password);
    if (!valid) return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders);
    await clearRateLimit(kv, `login:${normalizedEmail}`);
    if (user.password) {
      const passwordData = await hashPassword(password);
      user.passwordHash = passwordData.hash; user.passwordSalt = passwordData.salt; user.passwordVersion = 1; delete user.password;
    }
    user.lastLogin = new Date().toISOString();
    const token = generateToken();
    await kv.put(`user:${normalizedEmail}`, JSON.stringify(user));
    await kv.put(`user:${user.userId}`, JSON.stringify(user));
    await createSession(kv, token, user.userId);
    return jsonResponse({ success: true, message: 'Login successful', userId: user.userId, name: user.name, email: user.email, expiresIn: SESSION_TTL_SECONDS }, 200, withCookie(corsHeaders, buildSessionCookie(token)));
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
    if (token && env.PEMBUKUAN_KV) { await env.PEMBUKUAN_KV.delete(`session:${token}`); await env.PEMBUKUAN_KV.delete(`token:${token}`); }
    return jsonResponse({ success: true, message: 'Logout successful' }, 200, withCookie(corsHeaders, clearSessionCookie()));
  } catch (error) { console.error('Logout error:', error); return jsonResponse({ error: 'Logout failed' }, 500, corsHeaders); }
}
async function handleGetProfile(request, env, corsHeaders) {
  try { const userId = await requireOwner(request, env); if (!userId) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); const data = await env.PEMBUKUAN_KV.get(`user:${userId}`); if (!data) return jsonResponse({ error: 'User not found' }, 404, corsHeaders); const user = JSON.parse(data); return jsonResponse({ success: true, userId: user.userId, name: user.name, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin }, 200, corsHeaders); }
  catch (error) { console.error('Profile error:', error); return jsonResponse({ error: 'Failed to get profile' }, 500, corsHeaders); }
}
async function handleGetUsers(request, env, corsHeaders) {
  try { const ownerId = await requireOwner(request, env); if (!ownerId) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); const adminEmail = env.ADMIN_EMAIL ? env.ADMIN_EMAIL.trim().toLowerCase() : ''; const ownerData = await env.PEMBUKUAN_KV.get(`user:${ownerId}`); if (!ownerData) return jsonResponse({ error: 'Admin user not found' }, 404, corsHeaders); const owner = JSON.parse(ownerData); if (!adminEmail || owner.email !== adminEmail) return jsonResponse({ error: 'Forbidden: admin access required' }, 403, corsHeaders); const users = []; let cursor; do { const page = await env.PEMBUKUAN_KV.list({ prefix: 'user:', cursor }); for (const key of page.keys) { const value = await env.PEMBUKUAN_KV.get(key.name); if (!value) continue; try { const user = JSON.parse(value); if (key.name === `user:${user.userId}`) users.push({ userId: user.userId, name: user.name, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin }); } catch {} } cursor = page.list_complete ? undefined : page.cursor; } while (cursor); users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); return jsonResponse({ success: true, count: users.length, users }, 200, corsHeaders); }
  catch (error) { console.error('Admin users error:', error); return jsonResponse({ error: 'Failed to get users' }, 500, corsHeaders); }
}

async function handleSaveTransactions(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { userId, transactions } = body || {};
    if (typeof userId !== 'string' || !userId.trim() || userId.length > MAX_USER_ID_LENGTH || !Array.isArray(transactions)) return jsonResponse({ error: 'Invalid userId or transactions' }, 400, corsHeaders);
    if (transactions.length > MAX_TRANSACTIONS_PER_SYNC) return jsonResponse({ error: `Maximum ${MAX_TRANSACTIONS_PER_SYNC} transactions per sync` }, 400, corsHeaders);
    const tokenOwner = await requireOwner(request, env);
    if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: token does not match user' }, 403, corsHeaders);
    const now = new Date().toISOString();
    for (const transaction of transactions) {
      const validation = validateTransaction(transaction, now);
      if (!validation.valid) return jsonResponse({ error: validation.error }, 400, corsHeaders);
    }
    const deletedIds = new Set(await getDeletedIds(userId, env));
    const key = `transactions:${userId}`;
    const existingRaw = await env.PEMBUKUAN_KV.get(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const merged = new Map();
    for (const oldTx of existing) { if (oldTx && oldTx.id && !deletedIds.has(oldTx.id)) merged.set(oldTx.id, oldTx); }
    for (const newTx of transactions) { if (deletedIds.has(newTx.id)) continue; const oldTx = merged.get(newTx.id); if (!oldTx || getTimestamp(newTx) >= getTimestamp(oldTx)) merged.set(newTx.id, newTx); }
    const result = Array.from(merged.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
    await env.PEMBUKUAN_KV.put(key, JSON.stringify(result));
    return jsonResponse({ success: true, message: 'Transactions synchronized successfully', count: result.length, transactions: result, deletedIds: Array.from(deletedIds) }, 200, corsHeaders);
  } catch (error) { console.error('Save transactions error:', error); return jsonResponse({ error: 'Failed to save transactions' }, 500, corsHeaders); }
}

function validateTransaction(transaction, fallbackTimestamp) {
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) return { valid: false, error: 'Invalid transaction object' };
  if (typeof transaction.id !== 'string' || transaction.id.length < 1 || transaction.id.length > MAX_TRANSACTION_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(transaction.id)) return { valid: false, error: 'Invalid transaction ID' };
  if (transaction.type !== 'income' && transaction.type !== 'expense') return { valid: false, error: 'Transaction type must be income or expense' };
  if (typeof transaction.category !== 'string' || transaction.category.trim().length < 1 || transaction.category.length > MAX_CATEGORY_LENGTH) return { valid: false, error: 'Invalid transaction category' };
  if (typeof transaction.amount !== 'number' || !Number.isFinite(transaction.amount) || transaction.amount <= 0 || transaction.amount > MAX_TRANSACTION_AMOUNT) return { valid: false, error: 'Transaction amount must be a valid positive number' };
  if (typeof transaction.date !== 'string' || !isValidDateOnly(transaction.date)) return { valid: false, error: 'Transaction date must be a valid YYYY-MM-DD date' };
  if (transaction.description !== undefined && transaction.description !== null && (typeof transaction.description !== 'string' || transaction.description.length > MAX_DESCRIPTION_LENGTH)) return { valid: false, error: 'Transaction description is invalid or too long' };
  if (transaction.createdAt !== undefined && (typeof transaction.createdAt !== 'string' || transaction.createdAt.length > 40 || Number.isNaN(Date.parse(transaction.createdAt)))) return { valid: false, error: 'Invalid createdAt timestamp' };
  if (transaction.updatedAt !== undefined && (typeof transaction.updatedAt !== 'string' || transaction.updatedAt.length > 40 || Number.isNaN(Date.parse(transaction.updatedAt)))) return { valid: false, error: 'Invalid updatedAt timestamp' };
  if (!transaction.updatedAt) transaction.updatedAt = transaction.createdAt || fallbackTimestamp;
  if (!transaction.createdAt) transaction.createdAt = transaction.updatedAt || fallbackTimestamp;
  return { valid: true };
}

function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function handleGetTransactions(userId, request, env, corsHeaders) {
  try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: cannot access other user data' }, 403, corsHeaders); const deletedIds = await getDeletedIds(userId, env); const deletedSet = new Set(deletedIds); const data = await env.PEMBUKUAN_KV.get(`transactions:${userId}`); const rawTransactions = data ? JSON.parse(data) : []; const transactions = rawTransactions.filter(t => t && t.id && !deletedSet.has(t.id)); if (transactions.length !== rawTransactions.length) await env.PEMBUKUAN_KV.put(`transactions:${userId}`, JSON.stringify(transactions)); return jsonResponse({ success: true, userId, transactions, count: transactions.length, deletedIds }, 200, corsHeaders); }
  catch (error) { console.error('Get transactions error:', error); return jsonResponse({ error: 'Failed to get transactions' }, 500, corsHeaders); }
}
async function handleDeleteTransaction(userId, transactionId, request, env, corsHeaders) {
  try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders); if (typeof transactionId !== 'string' || transactionId.length < 1 || transactionId.length > MAX_TRANSACTION_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(transactionId)) return jsonResponse({ error: 'Invalid transaction ID' }, 400, corsHeaders); const deletedAt = new Date().toISOString(); await env.PEMBUKUAN_KV.put(`deleted:${userId}:${transactionId}`, JSON.stringify({ transactionId, deletedAt })); const key = `transactions:${userId}`; const data = await env.PEMBUKUAN_KV.get(key); const transactions = data ? JSON.parse(data) : []; const filtered = transactions.filter(t => t.id !== transactionId); if (filtered.length !== transactions.length) await env.PEMBUKUAN_KV.put(key, JSON.stringify(filtered)); return jsonResponse({ success: true, message: 'Transaction deleted', transactionId, deletedAt }, 200, corsHeaders); }
  catch (error) { console.error('Delete transaction error:', error); return jsonResponse({ error: 'Failed to delete transaction' }, 500, corsHeaders); }
}
async function getDeletedIds(userId, env) { const ids = []; let cursor; do { const page = await env.PEMBUKUAN_KV.list({ prefix: `deleted:${userId}:`, cursor }); for (const key of page.keys) ids.push(key.name.slice(`deleted:${userId}:`.length)); cursor = page.list_complete ? undefined : page.cursor; } while (cursor); return ids; }
async function handleGetStats(userId, request, env, corsHeaders) {
  try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders); const deletedIds = new Set(await getDeletedIds(userId, env)); const data = await env.PEMBUKUAN_KV.get(`transactions:${userId}`); const transactions = (data ? JSON.parse(data) : []).filter(t => t && !deletedIds.has(t.id)); const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0); const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0); const stats = { totalIncome: income, totalExpense: expense, balance: income - expense, transactionCount: transactions.length }; return jsonResponse({ success: true, userId, stats, ...stats }, 200, corsHeaders); }
  catch (error) { console.error('Stats error:', error); return jsonResponse({ error: 'Failed to get stats' }, 500, corsHeaders); }
}
async function handleExport(userId, request, env, corsHeaders) {
  try { const tokenOwner = await requireOwner(request, env); if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders); if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders); const deletedIds = new Set(await getDeletedIds(userId, env)); const data = await env.PEMBUKUAN_KV.get(`transactions:${userId}`); const transactions = (data ? JSON.parse(data) : []).filter(t => t && !deletedIds.has(t.id)); return jsonResponse({ success: true, userId, transactions, count: transactions.length }, 200, corsHeaders); }
  catch (error) { console.error('Export error:', error); return jsonResponse({ error: 'Failed to export data' }, 500, corsHeaders); }
}
function requireOwner(request, env) { return getTokenOwner(getAuthToken(request), env.PEMBUKUAN_KV); }
function getTimestamp(transaction) { const value = transaction && (transaction.updatedAt || transaction.createdAt); const timestamp = value ? Date.parse(value) : 0; return Number.isFinite(timestamp) ? timestamp : 0; }
function getCorsHeaders(request, env) {
  const requestOrigin = request.headers.get('Origin');
  const configuredOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean) : [];
  const defaultOrigins = ['https://viqiquotex-art.github.io', 'https://vixora.my.id', 'https://www.vixora.my.id', 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
  const allowedOrigins = configuredOrigins.length ? configuredOrigins : defaultOrigins;
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Max-Age': '86400', 'Content-Type': 'application/json', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://pembukuan-app.viqiquotex.workers.dev; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()' };
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) headers['Access-Control-Allow-Origin'] = requestOrigin;
  return headers;
}
function withCookie(headers, cookie) { return cookie ? { ...headers, 'Set-Cookie': cookie } : headers; }
function buildSessionCookie(token) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_TTL_SECONDS}`; }
function clearSessionCookie() { return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`; }
function getCookie(request, name) { const header = request.headers.get('Cookie') || ''; for (const part of header.split(';')) { const index = part.indexOf('='); if (index < 0) continue; const key = part.slice(0, index).trim(); if (key === name) return decodeURIComponent(part.slice(index + 1).trim()); } return null; }
function jsonResponse(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers }); }
function generateId() { return crypto.randomUUID(); }
function generateToken() { return crypto.randomUUID() + '-' + crypto.randomUUID(); }
function encodeLegacyPassword(password) { return btoa(password + LEGACY_PASSWORD_SUFFIX); }
async function hashPassword(password) { const saltBytes = crypto.getRandomValues(new Uint8Array(16)); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256); return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(saltBytes) }; }
async function verifyPassword(password, storedHash, storedSalt) { try { const salt = base64ToBytes(storedSalt); const expected = base64ToBytes(storedHash); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256); return constantTimeEqual(new Uint8Array(bits), expected); } catch { return false; } }
function bytesToBase64(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
function constantTimeEqual(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
async function createSession(kv, token, userId) { const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(); await kv.put(`session:${token}`, JSON.stringify({ userId, expiresAt, createdAt: new Date().toISOString() }), { expirationTtl: SESSION_TTL_SECONDS }); }
function isValidEmail(email) { return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function getAuthToken(request) { const cookieToken = getCookie(request, SESSION_COOKIE); if (cookieToken) return cookieToken; const header = request.headers.get('Authorization') || ''; if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null; return null; }
async function getTokenOwner(token, kv) { if (!token || !kv) return null; const sessionData = await kv.get(`session:${token}`); if (sessionData) { try { const session = JSON.parse(sessionData); if (!session.userId || !session.expiresAt) return null; if (Date.now() >= Date.parse(session.expiresAt)) { await kv.delete(`session:${token}`); return null; } return session.userId; } catch { await kv.delete(`session:${token}`); return null; } } return await kv.get(`token:${token}`) || null; }
