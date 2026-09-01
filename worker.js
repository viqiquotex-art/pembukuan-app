// ==========================================
// PEMBUKUAN API - Cloudflare Worker
// Authentication & Authorization with Security
// ==========================================

export default {
  async fetch(request, env) {
    // CORS preflight
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

    // Add CORS headers to all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    };

    try {
      // Health check endpoint
      if (path === '/api/health' && method === 'GET') {
        return jsonResponse({ 
          status: 'ok', 
          message: 'Pembukuan API is running ⚡',
          timestamp: new Date().toISOString()
        }, 200, corsHeaders);
      }

      // ========== AUTH ENDPOINTS ==========

      // Register endpoint
      if (path === '/api/auth/register' && method === 'POST') {
        return await handleRegister(request, env, corsHeaders);
      }

      // Login endpoint
      if (path === '/api/auth/login' && method === 'POST') {
        return await handleLogin(request, env, corsHeaders);
      }

      // Get user profile
      if (path === '/api/auth/profile' && method === 'GET') {
        return await handleGetProfile(request, env, corsHeaders);
      }

      // ========== TRANSACTION ENDPOINTS ==========

      // Save/Update transactions
      if (path === '/api/transactions' && method === 'POST') {
        return await handleSaveTransactions(request, env, corsHeaders);
      }

      // Get user transactions
      if (path.match(/^\/api\/transactions\/[^/]+$/) && method === 'GET') {
        const userId = path.split('/')[3];
        return await handleGetTransactions(userId, request, env, corsHeaders);
      }

      // Delete transaction
      if (path.match(/^\/api\/transactions\/[^/]+\/[^/]+$/) && method === 'DELETE') {
        const parts = path.split('/');
        const userId = parts[3];
        const transactionId = parts[4];
        return await handleDeleteTransaction(userId, transactionId, request, env, corsHeaders);
      }

      // ========== STATS ENDPOINTS ==========

      // Get user stats
      if (path.match(/^\/api\/stats\/[^/]+$/) && method === 'GET') {
        const userId = path.split('/')[3];
        return await handleGetStats(userId, request, env, corsHeaders);
      }

      // ========== EXPORT ENDPOINTS ==========

      // Export data
      if (path.match(/^\/api\/export\/[^/]+$/) && method === 'GET') {
        const userId = path.split('/')[3];
        return await handleExport(userId, request, env, corsHeaders);
      }

      // Unknown endpoint
      return jsonResponse({ 
        error: 'Endpoint not found' 
      }, 404, corsHeaders);

    } catch (error) {
      console.error('API Error:', error);
      return jsonResponse({ 
        error: 'Internal server error',
        message: error.message 
      }, 500, corsHeaders);
    }
  },
};

// ==========================================
// AUTHENTICATION HANDLERS
// ==========================================

async function handleRegister(request, env, corsHeaders) {
  try {
    const { email, password, name } = await request.json();

    // Validation
    if (!email || !password || !name) {
      return jsonResponse({ 
        error: 'Missing required fields: email, password, name' 
      }, 400, corsHeaders);
    }

    // Email validation
    if (!isValidEmail(email)) {
      return jsonResponse({ 
        error: 'Invalid email format' 
      }, 400, corsHeaders);
    }

    // Password validation
    if (password.length < 6) {
      return jsonResponse({ 
        error: 'Password must be at least 6 characters' 
      }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    // Check if user exists
    const existingUser = await kv.get(`user:${email}`);
    if (existingUser) {
      return jsonResponse({ 
        error: 'Email already registered' 
      }, 409, corsHeaders);
    }

    // Generate user ID & token
    const userId = generateId();
    const token = generateToken();
    const hashedPassword = encodePassword(password);

    // Create user object
    const user = {
      userId,
      email,
      name,
      password: hashedPassword,
      token,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    // Save user
    await kv.put(`user:${email}`, JSON.stringify(user));
    await kv.put(`user:${userId}`, JSON.stringify(user));

    // Return success with token
    return jsonResponse({
      success: true,
      message: 'Registration successful',
      userId,
      name,
      email,
      token,
    }, 201, corsHeaders);

  } catch (error) {
    console.error('Register error:', error);
    return jsonResponse({ 
      error: 'Registration failed',
      message: error.message 
    }, 500, corsHeaders);
  }
}

async function handleLogin(request, env, corsHeaders) {
  try {
    const { email, password } = await request.json();

    // Validation
    if (!email || !password) {
      return jsonResponse({ 
        error: 'Missing email or password' 
      }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    // Get user
    const userData = await kv.get(`user:${email}`);
    if (!userData) {
      return jsonResponse({ 
        error: 'Invalid email or password' 
      }, 401, corsHeaders);
    }

    const user = JSON.parse(userData);

    // Verify password
    if (user.password !== encodePassword(password)) {
      return jsonResponse({ 
        error: 'Invalid email or password' 
      }, 401, corsHeaders);
    }

    // Generate new token
    const token = generateToken();
    user.token = token;
    user.lastLogin = new Date().toISOString();

    // Update user
    await kv.put(`user:${email}`, JSON.stringify(user));
    await kv.put(`user:${user.userId}`, JSON.stringify(user));

    // Return success
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
    return jsonResponse({ 
      error: 'Login failed',
      message: error.message 
    }, 500, corsHeaders);
  }
}

async function handleGetProfile(request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return jsonResponse({ 
        error: 'Missing authorization token' 
      }, 401, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;
    const userId = await getTokenOwner(token, kv);

    if (!userId) {
      return jsonResponse({ 
        error: 'Invalid token' 
      }, 401, corsHeaders);
    }

    const userData = await kv.get(`user:${userId}`);
    if (!userData) {
      return jsonResponse({ 
        error: 'User not found' 
      }, 404, corsHeaders);
    }

    const user = JSON.parse(userData);
    
    // Don't return password
    delete user.password;

    return jsonResponse(user, 200, corsHeaders);

  } catch (error) {
    console.error('Get profile error:', error);
    return jsonResponse({ 
      error: 'Failed to get profile',
      message: error.message 
    }, 500, corsHeaders);
  }
}

// ==========================================
// TRANSACTION HANDLERS
// ==========================================

async function handleSaveTransactions(request, env, corsHeaders) {
  try {
    const { userId, token, transactions } = await request.json();

    // Validation
    if (!userId || !token || !transactions) {
      return jsonResponse({ 
        error: 'Missing required fields: userId, token, transactions' 
      }, 400, corsHeaders);
    }

    if (!Array.isArray(transactions)) {
      return jsonResponse({ 
        error: 'Transactions must be an array' 
      }, 400, corsHeaders);
    }

    // Verify token
    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);

    if (tokenOwner !== userId) {
      return jsonResponse({ 
        error: 'Unauthorized: token does not match userId' 
      }, 403, corsHeaders);
    }

    // Validate transactions
    for (const t of transactions) {
      if (!t.id || !t.type || !t.amount || !t.date) {
        return jsonResponse({ 
          error: 'Invalid transaction format' 
        }, 400, corsHeaders);
      }
    }

    // Save transactions
    await kv.put(
      `transactions:${userId}`,
      JSON.stringify(transactions),
      { expirationTtl: 365 * 24 * 60 * 60 } // 1 year expiry
    );

    return jsonResponse({
      success: true,
      message: 'Transactions saved successfully',
      count: transactions.length,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Save transactions error:', error);
    return jsonResponse({ 
      error: 'Failed to save transactions',
      message: error.message 
    }, 500, corsHeaders);
  }
}

async function handleGetTransactions(userId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return jsonResponse({ 
        error: 'Missing authorization token' 
      }, 401, corsHeaders);
    }

    // Verify token
    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);

    if (tokenOwner !== userId) {
      return jsonResponse({ 
        error: 'Unauthorized: cannot access other user data' 
      }, 403, corsHeaders);
    }

    // Get transactions
    const data = await kv.get(`transactions:${userId}`);
    const transactions = data ? JSON.parse(data) : [];

    return jsonResponse({
      success: true,
      userId,
      transactions,
      count: transactions.length,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Get transactions error:', error);
    return jsonResponse({ 
      error: 'Failed to get transactions',
      message: error.message 
    }, 500, corsHeaders);
  }
}

async function handleDeleteTransaction(userId, transactionId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return jsonResponse({ 
        error: 'Missing authorization token' 
      }, 401, corsHeaders);
    }

    // Verify token
    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);

    if (tokenOwner !== userId) {
      return jsonResponse({ 
        error: 'Unauthorized' 
      }, 403, corsHeaders);
    }

    // Get transactions
    const data = await kv.get(`transactions:${userId}`);
    let transactions = data ? JSON.parse(data) : [];

    // Remove transaction
    const originalCount = transactions.length;
    transactions = transactions.filter(t => t.id !== transactionId);

    if (transactions.length === originalCount) {
      return jsonResponse({ 
        error: 'Transaction not found' 
      }, 404, corsHeaders);
    }

    // Save updated transactions
    await kv.put(`transactions:${userId}`, JSON.stringify(transactions));

    return jsonResponse({
      success: true,
      message: 'Transaction deleted',
      transactionId,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Delete transaction error:', error);
    return jsonResponse({ 
      error: 'Failed to delete transaction',
      message: error.message 
    }, 500, corsHeaders);
  }
}

// ==========================================
// STATS HANDLERS
// ==========================================

async function handleGetStats(userId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return jsonResponse({ 
        error: 'Missing authorization token' 
      }, 401, corsHeaders);
    }

    // Verify token
    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);

    if (tokenOwner !== userId) {
      return jsonResponse({ 
        error: 'Unauthorized' 
      }, 403, corsHeaders);
    }

    // Get transactions
    const data = await kv.get(`transactions:${userId}`);
    const transactions = data ? JSON.parse(data) : [];

    // Calculate stats
    const stats = calculateStats(transactions);

    return jsonResponse({
      success: true,
      userId,
      stats,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Get stats error:', error);
    return jsonResponse({ 
      error: 'Failed to get stats',
      message: error.message 
    }, 500, corsHeaders);
  }
}

// ==========================================
// EXPORT HANDLERS
// ==========================================

async function handleExport(userId, request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);
    if (!token) {
      return jsonResponse({ 
        error: 'Missing authorization token' 
      }, 401, corsHeaders);
    }

    // Verify token
    const kv = env.PEMBUKUAN_KV;
    const tokenOwner = await getTokenOwner(token, kv);

    if (tokenOwner !== userId) {
      return jsonResponse({ 
        error: 'Unauthorized' 
      }, 403, corsHeaders);
    }

    // Get user & transactions
    const userData = await kv.get(`user:${userId}`);
    const transData = await kv.get(`transactions:${userId}`);

    if (!userData) {
      return jsonResponse({ 
        error: 'User not found' 
      }, 404, corsHeaders);
    }

    const user = JSON.parse(userData);
    const transactions = transData ? JSON.parse(transData) : [];

    // Create export object
    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
      },
      transactions,
      summary: calculateStats(transactions),
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Disposition': `attachment; filename="pembukuan-export-${userId}-${Date.now()}.json"`,
      },
    });

  } catch (error) {
    console.error('Export error:', error);
    return jsonResponse({ 
      error: 'Failed to export data',
      message: error.message 
    }, 500, corsHeaders);
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function generateId() {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function encodePassword(password) {
  // WARNING: This is basic encoding, NOT encryption
  // For production, use proper bcrypt or argon2
  return btoa(password + ':pembukuan-salt-2026');
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function getAuthToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  
  return parts[1];
}

async function getTokenOwner(token, kv) {
  // Scan users to find matching token (inefficient - should use separate index)
  // For production, maintain a token -> userId mapping
  const users = await kv.list({ prefix: 'user:' });
  
  for (const user of users.keys) {
    if (user.name.includes('user:user_')) continue; // Skip userId keys
    const userData = await kv.get(user.name);
    if (userData) {
      const parsed = JSON.parse(userData);
      if (parsed.token === token) {
        return parsed.userId;
      }
    }
  }
  
  return null;
}

function calculateStats(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory = {};
  const byMonth = {};

  for (const t of transactions) {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else if (t.type === 'expense') {
      totalExpense += t.amount;
    }

    // By category
    if (!byCategory[t.category]) {
      byCategory[t.category] = { income: 0, expense: 0 };
    }
    byCategory[t.category][t.type] = (byCategory[t.category][t.type] || 0) + t.amount;

    // By month
    const month = t.date.substring(0, 7);
    if (!byMonth[month]) {
      byMonth[month] = { income: 0, expense: 0 };
    }
    byMonth[month][t.type] = (byMonth[month][t.type] || 0) + t.amount;
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    transactionCount: transactions.length,
    byCategory,
    byMonth,
  };
}
