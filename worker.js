// ==========================================
// PEMBUKUAN API - Cloudflare Worker
// Authentication, Authorization & Transactions
// ==========================================

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    };

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

      if (path === '/api/auth/profile' && method === 'GET') {
        return await handleGetProfile(request, env, corsHeaders);
      }

      // ==========================================
      // ADMIN - USERS
      // ==========================================
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
      return jsonResponse({
        error: 'Internal server error',
        message: error.message,
      }, 500, corsHeaders);
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
    if (!kv) throw new Error('PEMBUKUAN_KV binding is not configured');

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await kv.get(`user:${normalizedEmail}`);
    if (existingUser) {
      return jsonResponse({ error: 'Email already registered' }, 409, corsHeaders);
    }

    const userId = generateId();
    const token = generateToken();
    const hashedPassword = encodePassword(password);
    const now = new Date().toISOString();

    const user = {
      userId,
      email: normalizedEmail,
      name: name.trim(),
      password: hashedPassword,
      token,
      createdAt: now,
      lastLogin: now,
    };

    await kv.put(`user:${normalizedEmail}`, JSON.stringify(user));
    await kv.put(`user:${userId}`, JSON.stringify(user));
    await kv.put(`token:${token}`, userId);

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
    return jsonResponse({ error: 'Registration failed', message: error.message }, 500, corsHeaders);
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
    if (!kv) throw new Error('PEMBUKUAN_KV binding is not configured');

    const normalizedEmail = email.trim().toLowerCase();
    const userData = await kv.get(`user:${normalizedEmail}`);
    if (!userData) return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders);

    const user = JSON.parse(userData);
    if (user.password !== encodePassword(password)) {
      return jsonResponse({ error: 'Invalid email or password' }, 401, corsHeaders);
    }

    if (user.token) await kv.delete(`token:${user.token}`);

    const token = generateToken();
    user.token = token;
    user.lastLogin = new Date().toISOString();

    await kv.put(`user:${normalizedEmail}`, JSON.stringify(user));
    await kv.put(`user:${user.userId}`, JSON.stringify(user));
    await kv.put(`token:${token}`, user.userId);

    return jsonResponse({
      success: true,
      message: 'Login successful',
      userId: user.userId,
      name: user.name,
      email: user.email,
      token,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({ error: 'Login failed', message: error.message }, 500, corsHeaders);
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
    if (!userId) return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);

    const userData = await kv.get(`user:${userId}`);
    if (!userData) return jsonResponse({ error: 'User not found' }, 404, corsHeaders);

    const user = JSON.parse(userData);
    return jsonResponse({
      userId: user.userId,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('Profile error:', error);
    return jsonResponse({ error: 'Failed to get profile', message: error.message }, 500, corsHeaders);
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
    if (!kv) throw new Error('PEMBUKUAN_KV binding is not configured');

    const ownerId = await getTokenOwner(token, kv);
    if (!ownerId) return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);

    // Admin identity is intentionally controlled by an environment variable,
    // not by a public endpoint or a hard-coded email.
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
          // Only include the user index by userId to avoid duplicates.
          if (key.name === `user:${user.userId}`) {
            users.push({
              userId: user.userId,
              name: user.name,
              email: user.email,
              createdAt: user.createdAt,
              lastLogin: user.lastLogin,
            });
          }
        } catch (parseError) {
          console.warn('Skipping invalid user record:', key.name);
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return jsonResponse({
      success: true,
      count: users.length,
      users,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('Admin users error:', error);
    return jsonResponse({ error: 'Failed to get users', message: error.message }, 500, corsHeaders);
  }
}

// ==========================================
// SAVE TRANSACTIONS
// ==========================================
async function handleSaveTransactions(request, env, corsHeaders) {
  try {
    const { userId, token, transactions } = await request.json();
    if (!userId || !token || !transactions) {
      return jsonResponse({ error: 'Missing required fields: userId, token, transactions' }, 400, corsHeaders);
    }
    if (!Array.isArray(transactions)) {
      return jsonResponse({ error: 'Transactions must be an array' }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);
    if (!tokenOwner) return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: token does not match user' }, 403, corsHeaders);

    for (const transaction of transactions) {
      if (!transaction.id || !transaction.type || transaction.amount === undefined || !transaction.date) {
        return jsonResponse({ error: 'Invalid transaction format' }, 400, corsHeaders);
      }
      if (transaction.type !== 'income' && transaction.type !== 'expense') {
        return jsonResponse({ error: 'Transaction type must be income or expense' }, 400, corsHeaders);
      }
      if (typeof transaction.amount !== 'number' || transaction.amount < 0) {
        return jsonResponse({ error: 'Transaction amount must be a valid positive number' }, 400, corsHeaders);
      }
    }

    await kv.put(`transactions:${userId}`, JSON.stringify(transactions));
    return jsonResponse({ success: true, message: 'Transactions saved successfully', count: transactions.length }, 200, corsHeaders);
  } catch (error) {
    console.error('Save transactions error:', error);
    return jsonResponse({ error: 'Failed to save transactions', message: error.message }, 500, corsHeaders);
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
    if (!tokenOwner) return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized: cannot access other user data' }, 403, corsHeaders);

    const data = await kv.get(`transactions:${userId}`);
    const transactions = data ? JSON.parse(data) : [];
    return jsonResponse({ success: true, userId, transactions, count: transactions.length }, 200, corsHeaders);
  } catch (error) {
    console.error('Get transactions error:', error);
    return jsonResponse({ error: 'Failed to get transactions', message: error.message }, 500, corsHeaders);
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
    if (!tokenOwner) return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
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
    return jsonResponse({ error: 'Failed to delete transaction', message: error.message }, 500, corsHeaders);
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
    if (!tokenOwner) return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
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
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
      transactionCount: transactions.length,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('Stats error:', error);
    return jsonResponse({ error: 'Failed to get stats', message: error.message }, 500, corsHeaders);
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
    if (!tokenOwner) return jsonResponse({ error: 'Invalid token' }, 401, corsHeaders);
    if (tokenOwner !== userId) return jsonResponse({ error: 'Unauthorized' }, 403, corsHeaders);

    const data = await kv.get(`transactions:${userId}`);
    const transactions = data ? JSON.parse(data) : [];
    return jsonResponse({ success: true, userId, transactions, count: transactions.length }, 200, corsHeaders);
  } catch (error) {
    console.error('Export error:', error);
    return jsonResponse({ error: 'Failed to export data', message: error.message }, 500, corsHeaders);
  }
}

// ==========================================
// HELPERS
// ==========================================
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}

function generateId() {
  return crypto.randomUUID();
}

function generateToken() {
  return crypto.randomUUID() + '-' + crypto.randomUUID();
}

function encodePassword(password) {
  return btoa(password + ':pembukuan-salt-2026');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAuthToken(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

async function getTokenOwner(token, kv) {
  if (!token || !kv) return null;
  return await kv.get(`token:${token}`);
}
