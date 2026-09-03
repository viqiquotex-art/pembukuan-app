// ==========================================
// PEMBUKUAN API - Cloudflare Worker
// Authentication, Authorization & Transactions
// ==========================================

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const PASSWORD_ITERATIONS = 100000;
const LEGACY_PASSWORD_SUFFIX = ':pembukuan-salt-2026';

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders();

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/api/health' && method === 'GET') {
        return jsonResponse({
          status: 'ok',
          message: 'Pembukuan API is running ⚡',
          timestamp: new Date().toISOString(),
        }, 200, corsHeaders);
      }

      if (path === '/api/auth/register' && method === 'POST') {
        return await handleRegister(request, env, corsHeaders);
      }

      if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(request, env, corsHeaders);
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        return await handleLogout(request, env, corsHeaders);
      }

      if (path === '/api/auth/profile' && method === 'GET') {
        return await handleGetProfile(request, env, corsHeaders);
      }

      if (path === '/api/admin/users' && method === 'GET') {
        return await handleGetUsers(request, env, corsHeaders);
      }

      if (path === '/api/transactions' && method === 'POST') {
        return await handleSaveTransactions(request, env, corsHeaders);
      }

      if (path.match(/^\/api\/transactions\/[^/]+$/) && method === 'GET') {
        const userId = path.split('/')[3];
        return await handleGetTransactions(userId, request, env, corsHeaders);
      }

      if (path.match(/^\/api\/transactions\/[^/]+\/[^/]+$/) && method === 'DELETE') {
        const parts = path.split('/');
        return await handleDeleteTransaction(parts[3], parts[4], request, env, corsHeaders);
      }

      if (path.match(/^\/api\/stats\/[^/]+$/) && method === 'GET') {
        const userId = path.split('/')[3];
        return await handleGetStats(userId, request, env, corsHeaders);
      }

      if (path.match(/^\/api\/export\/[^/]+$/) && method === 'GET') {
        const userId = path.split('/')[3];
        return await handleExport(userId, request, env, corsHeaders);
      }

      return jsonResponse({ error: 'Endpoint not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('API Error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders);
    }
  },
};

// ==========================================
// REGISTER
// ==========================================
async function handleRegister(request, env, corsHeaders) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return jsonResponse({ error: 'Missing required fields: email, password, name' }, 400, corsHeaders);
    }
    if (!isValidEmail(email)) {
      return jsonResponse({ error: 'Invalid email format' }, 400, corsHeaders);
    }
    if (password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters' }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;
    if (!kv) throw new Error('PEMBUAN_KV binding is not configured');

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await kv.get(`user:${normalizedEmail}`);
    if (existingUser) {
      return jsonResponse({ error: 'Email already registered' }, 409, corsHeaders);
    }

    const userId = generateId();
    const passwordData = await hashPassword(password);
    const now = new Date().toISOString();
    const token = generateToken();

    const user = {
      userId,
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      passwordVersion: 1,
      createdAt: now,
      lastLogin: now,
    };

    await kv.put(`user:${normalizedEmail}`, JSON.stringify(user));
    await kv.put(`user:${userId}`, JSON.stringify(user));
    await createSession(kv, token, userId);

    return jsonResponse({
      success: true,
      message: 'Registration successful',
      userId,
      name: user.name,
      email: user.email,
      token,
    }, 201, corsHeaders);
  } catch (error) {
    console.error('Register error:', error);
    return jsonResponse({ error: 'Registration failed' }, 500, corsHeaders);
  }
}

// ==========================================
// LOGIN
// ==========================================
async function handleLogin(request, env, corsHeaders) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return jsonResponse({ error: 'Missing email or password' }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;
    if (!kv) throw new Error('PEMBUAN_KV binding is not configured');

    const normalizedEmail = email.trim().toLowerCase();
    const userData = await kv.get(`user:${normalizedEmail}`);
    if (!userData) return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders);

    const user = JSON.parse(userData);
    let passwordValid = false;
    let needsUpgrade = false;

    if (user.passwordHash && user.passwordSalt) {
      passwordValid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    } else if (user.password) {
      // Backward compatibility for accounts created before PBKDF2 migration.
      passwordValid = user.password === encodeLegacyPassword(password);
      needsUpgrade = passwordValid;
    }

    if (!passwordValid) {
      return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders);
    }

    if (needsUpgrade) {
      const passwordData = await hashPassword(password);
      user.passwordHash = passwordData.hash;
      user.passwordSalt = passwordData.salt;
      user.passwordVersion = 1;
      delete user.password;
    }

    const token = generateToken();
    user.lastLogin = new Date().toISOString();

    await kv.put(`user:${normalizedEmail}`, JSON.stringify(user));
    await kv.put(`user:${user.userId}`, JSON.stringify(user));
    await createSession(kv, token, user.userId);

    return jsonResponse({
      success: true,
      message: 'Login successful',
      userId: user.userId,
      name: user.name,
      email: user.email,
      token,
      expiresIn: SESSION_TTL_SECONDS,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({ error: 'Login failed' }, 500, corsHeaders);
  }
}

// ==========================================
// LOGOUT / SESSION REVOCATION
// ==========================================
async function handleLogout(request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) return jsonResponse({ success: true, message: 'Already logged out' }, 200, corsHeaders);

    const kv = env.PEMBUKUAN_KV;
    if (kv) {
      await kv.delete(`session:${token}`);
      // Delete legacy session key too, if one exists.
      await kv.delete(`token:${token}`);
    }

    return jsonResponse({ success: true, message: 'Logout successful' }, 200, corsHeaders);
  } catch (error) {
    console.error('Logout error:', error);
    return jsonResponse({ error: 'Logout failed' }, 500, corsHeaders);
  }
}

// ==========================================
// PROFILE
// ==========================================
async function handleGetProfile(request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) return jsonResponse({ error: 'Missing authorization token' }, 401, corsHeaders);

    const kv = env.PEMBUKUAN_KV;
    const userId = await getTokenOwner(token, kv);
    if (!userId) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);

    const userData = await kv.get(`user:${userId}`);
    if (!userData) return jsonResponse({ error: 'User not found' }, 404, corsHeaders);

    const user = JSON.parse(userData);
    return jsonResponse({
      success: true,
      userId: user.userId,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('Profile error:', error);
    return jsonResponse({ error: 'Failed to get profile' }, 500, corsHeaders);
  }
}

// ==========================================
// ADMIN - GET USERS
// ==========================================
async function handleGetUsers(request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) return jsonResponse({ error: 'Missing authorization token' }, 401, corsHeaders);

    const kv = env.PEMBUKUAN_KV;
    if (!kv) throw new Error('PEMBUAN_KV binding is not configured');

    const ownerId = await getTokenOwner(token, kv);
    if (!ownerId) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);

    const adminEmail = env.ADMIN_EMAIL ? env.ADMIN_EMAIL.trim().toLowerCase() : '';
    const ownerData = await kv.get(`user:${ownerId}`);
    if (!ownerData) return jsonResponse({ error: 'Admin user not found' }, 404, corsHeaders);

    const owner = JSON.parse(ownerData);
    if (!adminEmail || owner.email !== adminEmail) {
      return jsonResponse({ error: 'Forbidden: admin access required' }, 403, corsHeaders);
    }

    const users = [];
    let cursor;

    do {
      const page = await kv.list({ prefix: 'user:', cursor });
      for (const key of page.keys) {
        const value = await kv.get(key.name);
        if (!value) continue;
        try {
          const user = JSON.parse(value);
          if (key.name === `user:${user.userId}`) {
            users.push({
              userId: user.userId,
              name: user.name,
              email: user.email,
              createdAt: user.createdAt,
              lastLogin: user.lastLogin,
            });
          }
        } catch {
          console.warn('Skipping invalid user record:', key.name);
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return jsonResponse({ success: true, count: users.length, users }, 200, corsHeaders);
  } catch (error) {
    console.error('Admin users error:', error);
    return jsonResponse({ error: 'Failed to get users' }, 500, corsHeaders);
  }
}

// ==========================================
// SAVE TRANSACTIONS
// ==========================================
async function handleSaveTransactions(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { userId, transactions } = body;

    if (!userId || !transactions) {
      return jsonResponse({ error: 'Missing required fields: userId, transactions' }, 400, corsHeaders);
    }
    if (!Array.isArray(transactions)) {
      return jsonResponse({ error: 'Transactions must be an array' }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(getAuthToken(request), kv);
    if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: token does not match user' }, 403, corsHeaders);

    for (const transaction of transactions) {
      if (!transaction.id || !transaction.type || transaction.amount === undefined || !transaction.date) {
        return jsonResponse({ error: 'Invalid transaction format' }, 400, corsHeaders);
      }
      if (transaction.type !== 'income' && transaction.type !== 'expense') {
        return jsonResponse({ error: 'Transaction type must be income or expense' }, 400, corsHeaders);
      }
      if (typeof transaction.amount !== 'number' || !Number.isFinite(transaction.amount) || transaction.amount <= 0) {
        return jsonResponse({ error: 'Transaction amount must be a valid positive number' }, 400, corsHeaders);
      }
    }

    await kv.put(`transactions:${userId}`, JSON.stringify(transactions));
    return jsonResponse({ success: true, message: 'Transactions saved successfully', count: transactions.length }, 200, corsHeaders);
  } catch (error) {
    console.error('Save transactions error:', error);
    return jsonResponse({ error: 'Failed to save transactions' }, 500, corsHeaders);
  }
}

// ==========================================
// GET TRANSACTIONS
// ==========================================
async function handleGetTransactions(userId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) return jsonResponse({ error: 'Missing authorization token' }, 401, corsHeaders);

    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);
    if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: cannot access other user data' }, 403, corsHeaders);

    const data = await kv.get(`transactions:${userId}`);
    const transactions = data ? JSON.parse(data) : [];
    return jsonResponse({ success: true, userId, transactions, count: transactions.length }, 200, corsHeaders);
  } catch (error) {
    console.error('Get transactions error:', error);
    return jsonResponse({ error: 'Failed to get transactions' }, 500, corsHeaders);
  }
}

// ==========================================
// DELETE TRANSACTION
// ==========================================
async function handleDeleteTransaction(userId, transactionId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) return jsonResponse({ error: 'Missing authorization token' }, 401, corsHeaders);

    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);
    if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders);

    const data = await kv.get(`transactions:${userId}`);
    let transactions = data ? JSON.parse(data) : [];
    const originalCount = transactions.length;
    transactions = transactions.filter(transaction => transaction.id !== transactionId);

    if (transactions.length === originalCount) return jsonResponse({ error: 'Transaction not found' }, 404, corsHeaders);

    await kv.put(`transactions:${userId}`, JSON.stringify(transactions));
    return jsonResponse({ success: true, message: 'Transaction deleted', transactionId }, 200, corsHeaders);
  } catch (error) {
    console.error('Delete transaction error:', error);
    return jsonResponse({ error: 'Failed to delete transaction' }, 500, corsHeaders);
  }
}

// ==========================================
// STATS
// ==========================================
async function handleGetStats(userId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) return jsonResponse({ error: 'Missing authorization token' }, 401, corsHeaders);

    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);
    if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders);

    const data = await kv.get(`transactions:${userId}`);
    const transactions = data ? JSON.parse(data) : [];

    let income = 0;
    let expense = 0;
    for (const transaction of transactions) {
      if (transaction.type === 'income') income += Number(transaction.amount) || 0;
      if (transaction.type === 'expense') expense += Number(transaction.amount) || 0;
    }

    return jsonResponse({
      success: true,
      userId,
      stats: {
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense,
        transactionCount: transactions.length,
      },
      // Keep root-level fields for backward compatibility with older clients.
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      transactionCount: transactions.length,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('Stats error:', error);
    return jsonResponse({ error: 'Failed to get stats' }, 500, corsHeaders);
  }
}

// ==========================================
// EXPORT
// ==========================================
async function handleExport(userId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) return jsonResponse({ error: 'Missing authorization token' }, 401, corsHeaders);

    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);
    if (!tokenOwner) return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders);

    const data = await kv.get(`transactions:${userId}`);
    const transactions = data ? JSON.parse(data) : [];
    return jsonResponse({ success: true, userId, transactions, count: transactions.length }, 200, corsHeaders);
  } catch (error) {
    console.error('Export error:', error);
    return jsonResponse({ error: 'Failed to export data' }, 500, corsHeaders);
  }
}

// ==========================================
// SECURITY HELPERS
// ==========================================
function getCorsHeaders() {
  return {
    // Keep wildcard for current deployment compatibility.
    // Restrict this to the production frontend origin once configured in env.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}

function generateId() {
  return crypto.randomUUID();
}

function generateToken() {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}

function encodeLegacyPassword(password) {
  return btoa(password + LEGACY_PASSWORD_SUFFIX);
}

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  return {
    hash: bytesToBase64(new Uint8Array(derivedBits)),
    salt: bytesToBase64(saltBytes),
  };
}

async function verifyPassword(password, storedHash, storedSalt) {
  try {
    const saltBytes = base64ToBytes(storedSalt);
    const expectedHash = base64ToBytes(storedHash);
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PASSWORD_ITERATIONS,
        hash: 'SHA-256',
      },
      passwordKey,
      256
    );

    return constantTimeEqual(new Uint8Array(derivedBits), expectedHash);
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function createSession(kv, token, userId) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const session = { userId, expiresAt, createdAt: new Date().toISOString() };
  await kv.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAuthToken(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

async function getTokenOwner(token, kv) {
  if (!token || !kv) return null;

  const sessionData = await kv.get(`session:${token}`);
  if (sessionData) {
    try {
      const session = JSON.parse(sessionData);
      if (!session.userId || !session.expiresAt) return null;
      if (Date.now() >= new Date(session.expiresAt).getTime()) {
        await kv.delete(`session:${token}`);
        return null;
      }
      return session.userId;
    } catch {
      await kv.delete(`session:${token}`);
      return null;
    }
  }

  // Backward compatibility for tokens issued before the session migration.
  const legacyOwner = await kv.get(`token:${token}`);
  return legacyOwner || null;
}
