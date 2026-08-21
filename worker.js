// ==========================================
// PEMBUKUAN APP - CLOUDFLARE WORKER
// ==========================================
// Backend untuk menyimpan & sync data ke cloud
// Database: Cloudflare KV Store

export default {
  async fetch(request, env) {
    
    // ==========================================
    // CORS HEADERS
    // ==========================================
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ==========================================
      // ROUTES
      // ==========================================

      // GET /api/health - Test endpoint
      if (path === '/api/health' && method === 'GET') {
        return jsonResponse({
          status: 'ok',
          message: 'Pembukuan API is running ⚡',
          timestamp: new Date().toISOString()
        }, 200, corsHeaders);
      }

      // POST /api/auth/register - Register user
      if (path === '/api/auth/register' && method === 'POST') {
        return handleRegister(request, env, corsHeaders);
      }

      // POST /api/auth/login - Login user
      if (path === '/api/auth/login' && method === 'POST') {
        return handleLogin(request, env, corsHeaders);
      }

      // POST /api/transactions - Save transactions
      if (path === '/api/transactions' && method === 'POST') {
        return handleSaveTransactions(request, env, corsHeaders);
      }

      // GET /api/transactions/:userId - Get transactions
      if (path.startsWith('/api/transactions/') && method === 'GET') {
        const userId = path.split('/')[3];
        return handleGetTransactions(userId, env, corsHeaders);
      }

      // DELETE /api/transactions/:userId/:transactionId
      if (path.startsWith('/api/transactions/') && method === 'DELETE') {
        const parts = path.split('/');
        const userId = parts[3];
        const transactionId = parts[4];
        return handleDeleteTransaction(userId, transactionId, env, corsHeaders);
      }

      // GET /api/stats/:userId - Get summary stats
      if (path.startsWith('/api/stats/') && method === 'GET') {
        const userId = path.split('/')[3];
        return handleGetStats(userId, env, corsHeaders);
      }

      // Export data
      if (path === '/api/export' && method === 'POST') {
        return handleExport(request, env, corsHeaders);
      }

      // Not found
      return jsonResponse({
        error: 'Endpoint tidak ditemukan',
        path: path,
        method: method
      }, 404, corsHeaders);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({
        error: 'Server error',
        message: error.message
      }, 500, corsHeaders);
    }
  }
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

// Simple JWT-like token (in production, use proper JWT)
function generateToken(userId) {
  return `token_${userId}_${Date.now()}`;
}

function verifyToken(token, userId) {
  return token.startsWith(`token_${userId}`);
}

// ==========================================
// AUTH HANDLERS
// ==========================================

async function handleRegister(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return jsonResponse({
        error: 'Email, password, dan name diperlukan'
      }, 400, corsHeaders);
    }

    const userId = `user_${Date.now()}`;
    const userKey = `user:${email}`;
    
    // Check if user already exists
    const existingUser = await env.PEMBUKUAN_KV.get(userKey);
    if (existingUser) {
      return jsonResponse({
        error: 'Email sudah terdaftar'
      }, 409, corsHeaders);
    }

    // Save user (simple password - in production use bcrypt)
    const userData = {
      userId,
      email,
      name,
      password: btoa(password), // Simple base64 encoding
      createdAt: new Date().toISOString()
    };

    await env.PEMBUKUAN_KV.put(userKey, JSON.stringify(userData));
    await env.PEMBUKUAN_KV.put(`userId:${userId}`, email);

    const token = generateToken(userId);

    return jsonResponse({
      success: true,
      userId,
      token,
      message: '✅ Registrasi berhasil!'
    }, 201, corsHeaders);

  } catch (error) {
    return jsonResponse({
      error: 'Registrasi gagal',
      message: error.message
    }, 400, corsHeaders);
  }
}

async function handleLogin(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return jsonResponse({
        error: 'Email dan password diperlukan'
      }, 400, corsHeaders);
    }

    const userKey = `user:${email}`;
    const userData = await env.PEMBUKUAN_KV.get(userKey);

    if (!userData) {
      return jsonResponse({
        error: 'Email atau password salah'
      }, 401, corsHeaders);
    }

    const user = JSON.parse(userData);
    
    // Verify password
    if (atob(user.password) !== password) {
      return jsonResponse({
        error: 'Email atau password salah'
      }, 401, corsHeaders);
    }

    const token = generateToken(user.userId);

    return jsonResponse({
      success: true,
      userId: user.userId,
      token,
      name: user.name,
      email: user.email,
      message: '✅ Login berhasil!'
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({
      error: 'Login gagal',
      message: error.message
    }, 400, corsHeaders);
  }
}

// ==========================================
// TRANSACTION HANDLERS
// ==========================================

async function handleSaveTransactions(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { userId, token, transactions } = body;

    if (!userId || !token || !transactions) {
      return jsonResponse({
        error: 'userId, token, dan transactions diperlukan'
      }, 400, corsHeaders);
    }

    // Verify token
    if (!verifyToken(token, userId)) {
      return jsonResponse({
        error: 'Token tidak valid'
      }, 401, corsHeaders);
    }

    const key = `transactions:${userId}`;
    await env.PEMBUKUAN_KV.put(key, JSON.stringify({
      userId,
      transactions,
      lastSync: new Date().toISOString()
    }));

    return jsonResponse({
      success: true,
      message: '✅ Data tersimpan di cloud!',
      count: transactions.length
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({
      error: 'Gagal menyimpan data',
      message: error.message
    }, 400, corsHeaders);
  }
}

async function handleGetTransactions(userId, env, corsHeaders) {
  try {
    const key = `transactions:${userId}`;
    const data = await env.PEMBUKUAN_KV.get(key);

    if (!data) {
      return jsonResponse({
        transactions: [],
        message: 'Belum ada data'
      }, 200, corsHeaders);
    }

    const parsed = JSON.parse(data);
    return jsonResponse(parsed, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({
      error: 'Gagal mengambil data',
      message: error.message
    }, 400, corsHeaders);
  }
}

async function handleDeleteTransaction(userId, transactionId, env, corsHeaders) {
  try {
    const key = `transactions:${userId}`;
    const data = await env.PEMBUKUAN_KV.get(key);

    if (!data) {
      return jsonResponse({
        error: 'Data tidak ditemukan'
      }, 404, corsHeaders);
    }

    const parsed = JSON.parse(data);
    parsed.transactions = parsed.transactions.filter(t => t.id !== parseInt(transactionId));
    parsed.lastSync = new Date().toISOString();

    await env.PEMBUKUAN_KV.put(key, JSON.stringify(parsed));

    return jsonResponse({
      success: true,
      message: '✅ Transaksi dihapus!'
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({
      error: 'Gagal menghapus transaksi',
      message: error.message
    }, 400, corsHeaders);
  }
}

async function handleGetStats(userId, env, corsHeaders) {
  try {
    const key = `transactions:${userId}`;
    const data = await env.PEMBUKUAN_KV.get(key);

    if (!data) {
      return jsonResponse({
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        transactionCount: 0
      }, 200, corsHeaders);
    }

    const parsed = JSON.parse(data);
    const transactions = parsed.transactions || [];

    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = totalIncome - totalExpense;

    return jsonResponse({
      totalIncome,
      totalExpense,
      balance,
      transactionCount: transactions.length,
      lastSync: parsed.lastSync
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({
      error: 'Gagal mengambil stats',
      message: error.message
    }, 400, corsHeaders);
  }
}

async function handleExport(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { userId, token } = body;

    if (!userId || !token) {
      return jsonResponse({
        error: 'userId dan token diperlukan'
      }, 400, corsHeaders);
    }

    if (!verifyToken(token, userId)) {
      return jsonResponse({
        error: 'Token tidak valid'
      }, 401, corsHeaders);
    }

    const key = `transactions:${userId}`;
    const data = await env.PEMBUKUAN_KV.get(key);

    if (!data) {
      return jsonResponse({
        error: 'Tidak ada data untuk diekspor'
      }, 404, corsHeaders);
    }

    const parsed = JSON.parse(data);
    
    return jsonResponse({
      success: true,
      data: parsed,
      exportTime: new Date().toISOString()
    }, 200, corsHeaders);

  } catch (error) {
    return jsonResponse({
      error: 'Gagal mengekspor data',
      message: error.message
    }, 400, corsHeaders);
  }
}
