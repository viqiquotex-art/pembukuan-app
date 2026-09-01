// ==========================================
// PEMBUKUAN API - Cloudflare Worker
// Authentication, Authorization & Transactions
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

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    };

    try {
      // ==========================================
      // HEALTH CHECK
      // ==========================================

      if (path === '/api/health' && method === 'GET') {
        return jsonResponse({
          status: 'ok',
          message: 'Pembukuan API is running ⚡',
          timestamp: new Date().toISOString(),
        }, 200, corsHeaders);
      }

      // ==========================================
      // AUTH
      // ==========================================

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
      // TRANSACTIONS
      // ==========================================

      if (path === '/api/transactions' && method === 'POST') {
        return await handleSaveTransactions(request, env, corsHeaders);
      }

      if (
        path.match(/^\/api\/transactions\/[^/]+$/) &&
        method === 'GET'
      ) {
        const userId = path.split('/')[3];

        return await handleGetTransactions(
          userId,
          request,
          env,
          corsHeaders
        );
      }

      if (
        path.match(/^\/api\/transactions\/[^/]+\/[^/]+$/) &&
        method === 'DELETE'
      ) {
        const parts = path.split('/');
        const userId = parts[3];
        const transactionId = parts[4];

        return await handleDeleteTransaction(
          userId,
          transactionId,
          request,
          env,
          corsHeaders
        );
      }

      // ==========================================
      // STATS
      // ==========================================

      if (
        path.match(/^\/api\/stats\/[^/]+$/) &&
        method === 'GET'
      ) {
        const userId = path.split('/')[3];

        return await handleGetStats(
          userId,
          request,
          env,
          corsHeaders
        );
      }

      // ==========================================
      // EXPORT
      // ==========================================

      if (
        path.match(/^\/api\/export\/[^/]+$/) &&
        method === 'GET'
      ) {
        const userId = path.split('/')[3];

        return await handleExport(
          userId,
          request,
          env,
          corsHeaders
        );
      }

      return jsonResponse({
        error: 'Endpoint not found',
      }, 404, corsHeaders);

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
      return jsonResponse({
        error: 'Missing required fields: email, password, name',
      }, 400, corsHeaders);
    }

    if (!isValidEmail(email)) {
      return jsonResponse({
        error: 'Invalid email format',
      }, 400, corsHeaders);
    }

    if (password.length < 6) {
      return jsonResponse({
        error: 'Password must be at least 6 characters',
      }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    if (!kv) {
      throw new Error('PEMBUKUAN_KV binding is not configured');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check existing user
    const existingUser = await kv.get(
      `user:${normalizedEmail}`
    );

    if (existingUser) {
      return jsonResponse({
        error: 'Email already registered',
      }, 409, corsHeaders);
    }

    const userId = generateId();
    const token = generateToken();
    const hashedPassword = encodePassword(password);

    const user = {
      userId,
      email: normalizedEmail,
      name: name.trim(),
      password: hashedPassword,
      token,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    // Save user indexes
    await kv.put(
      `user:${normalizedEmail}`,
      JSON.stringify(user)
    );

    await kv.put(
      `user:${userId}`,
      JSON.stringify(user)
    );

    // Token → User ID index
    await kv.put(
      `token:${token}`,
      userId
    );

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

    return jsonResponse({
      error: 'Registration failed',
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// LOGIN
// ==========================================

async function handleLogin(request, env, corsHeaders) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return jsonResponse({
        error: 'Missing email or password',
      }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    if (!kv) {
      throw new Error('PEMBUKUAN_KV binding is not configured');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const userData = await kv.get(
      `user:${normalizedEmail}`
    );

    if (!userData) {
      return jsonResponse({
        error: 'Invalid email or password',
      }, 401, corsHeaders);
    }

    const user = JSON.parse(userData);

    if (user.password !== encodePassword(password)) {
      return jsonResponse({
        error: 'Invalid email or password',
      }, 401, corsHeaders);
    }

    // Remove old token index
    if (user.token) {
      await kv.delete(`token:${user.token}`);
    }

    // Generate new token
    const token = generateToken();

    user.token = token;
    user.lastLogin = new Date().toISOString();

    // Update user
    await kv.put(
      `user:${normalizedEmail}`,
      JSON.stringify(user)
    );

    await kv.put(
      `user:${user.userId}`,
      JSON.stringify(user)
    );

    // New token index
    await kv.put(
      `token:${token}`,
      user.userId
    );

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
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// PROFILE
// ==========================================

async function handleGetProfile(request, env, corsHeaders) {
  try {
    const token = getAuthToken(request);

    if (!token) {
      return jsonResponse({
        error: 'Missing authorization token',
      }, 401, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;
    const userId = await getTokenOwner(token, kv);

    if (!userId) {
      return jsonResponse({
        error: 'Invalid token',
      }, 401, corsHeaders);
    }

    const userData = await kv.get(
      `user:${userId}`
    );

    if (!userData) {
      return jsonResponse({
        error: 'User not found',
      }, 404, corsHeaders);
    }

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

    return jsonResponse({
      error: 'Failed to get profile',
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// SAVE TRANSACTIONS
// ==========================================

async function handleSaveTransactions(request, env, corsHeaders) {
  try {
    const {
      userId,
      token,
      transactions,
    } = await request.json();

    if (!userId || !token || !transactions) {
      return jsonResponse({
        error: 'Missing required fields: userId, token, transactions',
      }, 400, corsHeaders);
    }

    if (!Array.isArray(transactions)) {
      return jsonResponse({
        error: 'Transactions must be an array',
      }, 400, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    const tokenOwner = await getTokenOwner(
      token,
      kv
    );

    if (!tokenOwner) {
      return jsonResponse({
        error: 'Invalid token',
      }, 401, corsHeaders);
    }

    if (tokenOwner !== userId) {
      return jsonResponse({
        error: 'Unauthorized: token does not match user',
      }, 403, corsHeaders);
    }

    for (const transaction of transactions) {
      if (
        !transaction.id ||
        !transaction.type ||
        transaction.amount === undefined ||
        !transaction.date
      ) {
        return jsonResponse({
          error: 'Invalid transaction format',
        }, 400, corsHeaders);
      }

      if (
        transaction.type !== 'income' &&
        transaction.type !== 'expense'
      ) {
        return jsonResponse({
          error: 'Transaction type must be income or expense',
        }, 400, corsHeaders);
      }

      if (
        typeof transaction.amount !== 'number' ||
        transaction.amount < 0
      ) {
        return jsonResponse({
          error: 'Transaction amount must be a valid positive number',
        }, 400, corsHeaders);
      }
    }

    // IMPORTANT:
    // No automatic expiration.
    // Financial data should not disappear after one year.
    await kv.put(
      `transactions:${userId}`,
      JSON.stringify(transactions)
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
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// GET TRANSACTIONS
// ==========================================

async function handleGetTransactions(
  userId,
  request,
  env,
  corsHeaders
) {
  try {
    const token = getAuthToken(request);

    if (!token) {
      return jsonResponse({
        error: 'Missing authorization token',
      }, 401, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    const tokenOwner = await getTokenOwner(
      token,
      kv
    );

    if (!tokenOwner) {
      return jsonResponse({
        error: 'Invalid token',
      }, 401, corsHeaders);
    }

    if (tokenOwner !== userId) {
      return jsonResponse({
        error: 'Unauthorized: cannot access other user data',
      }, 403, corsHeaders);
    }

    const data = await kv.get(
      `transactions:${userId}`
    );

    const transactions = data
      ? JSON.parse(data)
      : [];

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
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// DELETE TRANSACTION
// ==========================================

async function handleDeleteTransaction(
  userId,
  transactionId,
  request,
  env,
  corsHeaders
) {
  try {
    const token = getAuthToken(request);

    if (!token) {
      return jsonResponse({
        error: 'Missing authorization token',
      }, 401, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    const tokenOwner = await getTokenOwner(
      token,
      kv
    );

    if (!tokenOwner) {
      return jsonResponse({
        error: 'Invalid token',
      }, 401, corsHeaders);
    }

    if (tokenOwner !== userId) {
      return jsonResponse({
        error: 'Unauthorized',
      }, 403, corsHeaders);
    }

    const data = await kv.get(
      `transactions:${userId}`
    );

    let transactions = data
      ? JSON.parse(data)
      : [];

    const originalCount = transactions.length;

    transactions = transactions.filter(
      transaction => transaction.id !== transactionId
    );

    if (transactions.length === originalCount) {
      return jsonResponse({
        error: 'Transaction not found',
      }, 404, corsHeaders);
    }

    await kv.put(
      `transactions:${userId}`,
      JSON.stringify(transactions)
    );

    return jsonResponse({
      success: true,
      message: 'Transaction deleted',
      transactionId,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Delete transaction error:', error);

    return jsonResponse({
      error: 'Failed to delete transaction',
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// STATS
// ==========================================

async function handleGetStats(
  userId,
  request,
  env,
  corsHeaders
) {
  try {
    const token = getAuthToken(request);

    if (!token) {
      return jsonResponse({
        error: 'Missing authorization token',
      }, 401, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    const tokenOwner = await getTokenOwner(
      token,
      kv
    );

    if (!tokenOwner) {
      return jsonResponse({
        error: 'Invalid token',
      }, 401, corsHeaders);
    }

    if (tokenOwner !== userId) {
      return jsonResponse({
        error: 'Unauthorized',
      }, 403, corsHeaders);
    }

    const data = await kv.get(
      `transactions:${userId}`
    );

    const transactions = data
      ? JSON.parse(data)
      : [];

    const stats = calculateStats(
      transactions
    );

    return jsonResponse({
      success: true,
      userId,
      stats,
    }, 200, corsHeaders);

  } catch (error) {
    console.error('Stats error:', error);

    return jsonResponse({
      error: 'Failed to get stats',
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// EXPORT
// ==========================================

async function handleExport(
  userId,
  request,
  env,
  corsHeaders
) {
  try {
    const token = getAuthToken(request);

    if (!token) {
      return jsonResponse({
        error: 'Missing authorization token',
      }, 401, corsHeaders);
    }

    const kv = env.PEMBUKUAN_KV;

    const tokenOwner = await getTokenOwner(
      token,
      kv
    );

    if (!tokenOwner) {
      return jsonResponse({
        error: 'Invalid token',
      }, 401, corsHeaders);
    }

    if (tokenOwner !== userId) {
      return jsonResponse({
        error: 'Unauthorized',
      }, 403, corsHeaders);
    }

    const userData = await kv.get(
      `user:${userId}`
    );

    const transData = await kv.get(
      `transactions:${userId}`
    );

    if (!userData) {
      return jsonResponse({
        error: 'User not found',
      }, 404, corsHeaders);
    }

    const user = JSON.parse(userData);

    const transactions = transData
      ? JSON.parse(transData)
      : [];

    const exportData = {
      exportedAt: new Date().toISOString(),

      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
      },

      transactions,

      summary: calculateStats(
        transactions
      ),
    };

    return new Response(
      JSON.stringify(exportData, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Disposition':
            `attachment; filename="pembukuan-export-${userId}-${Date.now()}.json"`,
        },
      }
    );

  } catch (error) {
    console.error('Export error:', error);

    return jsonResponse({
      error: 'Failed to export data',
      message: error.message,
    }, 500, corsHeaders);
  }
}

// ==========================================
// TOKEN LOOKUP
// ==========================================

async function getTokenOwner(token, kv) {
  if (!token || !kv) {
    return null;
  }

  const userId = await kv.get(
    `token:${token}`
  );

  return userId || null;
}

// ==========================================
// AUTH TOKEN
// ==========================================

function getAuthToken(request) {
  const authHeader =
    request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  const parts =
    authHeader.trim().split(/\s+/);

  if (
    parts.length !== 2 ||
    parts[0] !== 'Bearer'
  ) {
    return null;
  }

  return parts[1];
}

// ==========================================
// ID & TOKEN
// ==========================================

function generateId() {
  return `user_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 11)}`;
}

function generateToken() {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  const randomValues =
    new Uint8Array(64);

  crypto.getRandomValues(
    randomValues
  );

  let token = '';

  for (let i = 0; i < randomValues.length; i++) {
    token += chars[
      randomValues[i] % chars.length
    ];
  }

  return token;
}

// ==========================================
// PASSWORD
// ==========================================

// TEMPORARY ONLY.
// This will be replaced with proper password hashing
// in the Security phase.
function encodePassword(password) {
  return btoa(
    password + ':pembukuan-salt-2026'
  );
}

// ==========================================
// VALIDATION
// ==========================================

function isValidEmail(email) {
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return emailRegex.test(email);
}

// ==========================================
// JSON RESPONSE
// ==========================================

function jsonResponse(
  data,
  status = 200,
  headers = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'Content-Type':
          'application/json',
        ...headers,
      },
    }
  );
}

// ==========================================
// STATISTICS
// ==========================================

function calculateStats(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;

  const byCategory = {};
  const byMonth = {};

  for (const transaction of transactions) {
    const type = transaction.type;
    const amount =
      Number(transaction.amount) || 0;

    if (type === 'income') {
      totalIncome += amount;
    }

    if (type === 'expense') {
      totalExpense += amount;
    }

    // Category
    const category =
      transaction.category || 'Lainnya';

    if (!byCategory[category]) {
      byCategory[category] = {
        income: 0,
        expense: 0,
      };
    }

    if (
      type === 'income' ||
      type === 'expense'
    ) {
      byCategory[category][type] += amount;
    }

    // Month
    if (transaction.date) {
      const month =
        transaction.date.substring(0, 7);

      if (!byMonth[month]) {
        byMonth[month] = {
          income: 0,
          expense: 0,
        };
      }

      if (
        type === 'income' ||
        type === 'expense'
      ) {
        byMonth[month][type] += amount;
      }
    }
  }

  return {
    totalIncome,
    totalExpense,
    balance:
      totalIncome - totalExpense,
    transactionCount:
      transactions.length,
    byCategory,
    byMonth,
  };
}