// ==========================================
// PEMBUKUAN CLOUD
// ==========================================

const API_BASE_URL =
  'https://pembukuan-app.viqiquotex.workers.dev';

const API_ENDPOINTS = {
  register: `${API_BASE_URL}/api/auth/register`,
  login: `${API_BASE_URL}/api/auth/login`,
  logout: `${API_BASE_URL}/api/auth/logout`,
  profile: `${API_BASE_URL}/api/auth/profile`,
  saveTransactions: `${API_BASE_URL}/api/transactions`,
  getTransactions: userId => `${API_BASE_URL}/api/transactions/${userId}`,
  getStats: userId => `${API_BASE_URL}/api/stats/${userId}`,
  export: userId => `${API_BASE_URL}/api/export/${userId}`
};

// ==========================================
// STORAGE
// ==========================================

function getCloudCredentials() {
  try {
    const saved = localStorage.getItem('cloud_credentials');
    if (saved) {
      const credentials = JSON.parse(saved);
      if (credentials && credentials.userId && credentials.token) {
        return credentials;
      }
    }

    const userId = localStorage.getItem('cloud_userId');
    const token = localStorage.getItem('cloud_token');
    const email = localStorage.getItem('cloud_email');
    const name = localStorage.getItem('cloud_name');

    if (userId && token) {
      const credentials = { userId, token, email, name };
      localStorage.setItem('cloud_credentials', JSON.stringify(credentials));
      return credentials;
    }

    return null;
  } catch (error) {
    console.error('Credential storage error:', error);
    clearCloudCredentials();
    return null;
  }
}

function saveCloudCredentials(credentials) {
  if (!credentials || !credentials.userId || !credentials.token) {
    throw new Error('Invalid cloud credentials');
  }

  localStorage.setItem('cloud_credentials', JSON.stringify(credentials));
  localStorage.setItem('cloud_userId', credentials.userId);
  localStorage.setItem('cloud_token', credentials.token);
  localStorage.setItem('cloud_email', credentials.email || '');
  localStorage.setItem('cloud_name', credentials.name || '');
}

function clearCloudCredentials() {
  localStorage.removeItem('cloud_credentials');
  localStorage.removeItem('cloud_userId');
  localStorage.removeItem('cloud_token');
  localStorage.removeItem('cloud_email');
  localStorage.removeItem('cloud_name');
}

function isCloudConnected() {
  const credentials = getCloudCredentials();
  return !!(credentials && credentials.userId && credentials.token);
}

function handleAuthFailure(message = 'Sesi cloud sudah berakhir. Silakan login kembali.') {
  clearCloudCredentials();
  showAlert(`🔐 ${message}`, 'error');
  setTimeout(() => {
    if (typeof updateCloudStatus === 'function') updateCloudStatus();
  }, 100);
}

// ==========================================
// REGISTER
// ==========================================

async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

  if (!name || !email || !password || !passwordConfirm) {
    showAlert('❌ Semua field harus diisi!', 'error');
    return;
  }

  if (password.length < 6) {
    showAlert('❌ Password minimal 6 karakter!', 'error');
    return;
  }

  if (password !== passwordConfirm) {
    showAlert('❌ Password tidak cocok!', 'error');
    return;
  }

  try {
    setLoading(true, 'Registering...');

    const response = await fetch(API_ENDPOINTS.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    const data = await safeJson(response);

    if (!response.ok) {
      showAlert(`❌ ${data.error || 'Register gagal'}`, 'error');
      return;
    }

    saveCloudCredentials({
      userId: data.userId,
      token: data.token,
      name: data.name,
      email: data.email
    });

    showAlert('✅ Register berhasil!', 'success');

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);
  } catch (error) {
    console.error('Register error:', error);
    showAlert(`❌ Error: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

// ==========================================
// LOGIN
// ==========================================

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showAlert('❌ Email dan password harus diisi!', 'error');
    return;
  }

  try {
    setLoading(true, 'Logging in...');

    const response = await fetch(API_ENDPOINTS.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await safeJson(response);

    if (!response.ok) {
      showAlert(`❌ ${data.error || 'Login gagal'}`, 'error');
      return;
    }

    saveCloudCredentials({
      userId: data.userId,
      token: data.token,
      name: data.name,
      email: data.email
    });

    showAlert(`✅ Login berhasil! Selamat datang, ${data.name}`, 'success');

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);
  } catch (error) {
    console.error('Login error:', error);
    showAlert(`❌ Login gagal: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

// ==========================================
// LOGOUT
// ==========================================

async function handleLogout() {
  if (!confirm('Yakin logout? Data lokal tetap aman.')) return;

  const credentials = getCloudCredentials();

  try {
    if (credentials?.token) {
      await fetch(API_ENDPOINTS.logout, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.token}`,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    // Logout locally even when the network is unavailable.
    console.warn('Server logout failed; clearing local session:', error);
  } finally {
    clearCloudCredentials();
    location.reload();
  }
}

// ==========================================
// SYNC
// ==========================================

async function syncToCloud() {
  const credentials = getCloudCredentials();

  if (!credentials) {
    showAlert('❌ Anda harus login terlebih dahulu', 'error');
    return;
  }

  try {
    setLoading(true, 'Syncing ke cloud...');

    const transactions = JSON.parse(
      localStorage.getItem('transactions') || '[]'
    );

    const response = await fetch(API_ENDPOINTS.saveTransactions, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.token}`
      },
      body: JSON.stringify({
        userId: credentials.userId,
        transactions
      })
    });

    const data = await safeJson(response);

    if (response.status === 401) {
      handleAuthFailure(data.error);
      return;
    }

    if (!response.ok) {
      showAlert(`❌ ${data.error || 'Sync gagal'}`, 'error');
      return;
    }

    showAlert(`✅ Synced! ${data.count} transaksi tersimpan di cloud`, 'success');
    loadStats();
  } catch (error) {
    console.error('Sync error:', error);
    showAlert(`❌ Sync gagal: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

// ==========================================
// LOAD FROM CLOUD
// ==========================================

async function loadFromCloud() {
  const credentials = getCloudCredentials();

  if (!credentials) {
    showAlert('❌ Anda harus login terlebih dahulu', 'error');
    return;
  }

  try {
    setLoading(true, 'Memuat dari cloud...');

    const response = await fetch(
      API_ENDPOINTS.getTransactions(credentials.userId),
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.token}`
        }
      }
    );

    const data = await safeJson(response);

    if (response.status === 401) {
      handleAuthFailure(data.error);
      return;
    }

    if (!response.ok) {
      showAlert(`❌ ${data.error || 'Load gagal'}`, 'error');
      return;
    }

    const cloudTransactions = Array.isArray(data.transactions)
      ? data.transactions
      : [];

    const localTransactions = JSON.parse(
      localStorage.getItem('transactions') || '[]'
    );

    const merged = mergeTransactions(localTransactions, cloudTransactions);

    localStorage.setItem('transactions', JSON.stringify(merged));

    showAlert(`✅ Loaded! ${merged.length} transaksi`, 'success');
    loadStats();
  } catch (error) {
    console.error('Load error:', error);
    showAlert(`❌ Load gagal: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

// ==========================================
// STATS
// ==========================================

async function loadStats() {
  const credentials = getCloudCredentials();
  if (!credentials) return;

  try {
    const response = await fetch(
      API_ENDPOINTS.getStats(credentials.userId),
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.token}`
        }
      }
    );

    const data = await safeJson(response);

    if (response.status === 401) {
      handleAuthFailure(data.error);
      return;
    }

    if (!response.ok) {
      console.error('Stats error:', data);
      return;
    }

    // Supports both the new { stats: {...} } contract and old root fields.
    const stats = data.stats || data;
    if (!stats) return;

    const userName = document.getElementById('userName');
    if (userName) userName.textContent = credentials.name || '';

    const container = document.getElementById('statsContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="stat-card">
        <div class="label">💰 Total Pemasukan</div>
        <div class="value">${formatRupiah(stats.totalIncome)}</div>
      </div>
      <div class="stat-card">
        <div class="label">💸 Total Pengeluaran</div>
        <div class="value">${formatRupiah(stats.totalExpense)}</div>
      </div>
      <div class="stat-card">
        <div class="label">📊 Saldo</div>
        <div class="value">${formatRupiah(stats.balance)}</div>
      </div>
      <div class="stat-card">
        <div class="label">📝 Transaksi</div>
        <div class="value">${Number(stats.transactionCount) || 0}</div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// ==========================================
// PROFILE / SESSION CHECK
// ==========================================

async function validateCloudSession() {
  const credentials = getCloudCredentials();
  if (!credentials) return false;

  try {
    const response = await fetch(API_ENDPOINTS.profile, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials.token}`
      }
    });

    const data = await safeJson(response);

    if (response.status === 401) {
      handleAuthFailure(data.error);
      return false;
    }

    if (!response.ok) return false;

    if (data.name || data.email) {
      saveCloudCredentials({
        ...credentials,
        name: data.name || credentials.name,
        email: data.email || credentials.email
      });
    }

    return true;
  } catch (error) {
    console.warn('Session validation failed:', error);
    return false;
  }
}

// ==========================================
// UI
// ==========================================

function toggleForm() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (!loginForm || !registerForm) return;

  if (loginForm.style.display === 'none') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  }

  hideAlert();
}

function showAlert(message, type = 'info') {
  const alert = document.getElementById('alert');
  if (!alert) {
    console.log(message);
    return;
  }

  alert.className = `alert ${type} show`;
  alert.textContent = message;

  setTimeout(() => hideAlert(), 5000);
}

function hideAlert() {
  const alert = document.getElementById('alert');
  if (alert) alert.classList.remove('show');
}

function setLoading(isLoading, text = 'Loading...') {
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const loginLoading = document.getElementById('loginLoading');
  const registerLoading = document.getElementById('registerLoading');

  if (loginBtn) loginBtn.disabled = isLoading;
  if (registerBtn) registerBtn.disabled = isLoading;

  if (loginLoading) {
    loginLoading.style.display = isLoading ? 'block' : 'none';
    if (isLoading) loginLoading.innerHTML = `<span class="spinner"></span> ${text}`;
  }

  if (registerLoading) {
    registerLoading.style.display = isLoading ? 'block' : 'none';
    if (isLoading) registerLoading.innerHTML = `<span class="spinner"></span> ${text}`;
  }
}

function goToApp() {
  window.location.href = './index.html';
}

// ==========================================
// UTILITIES
// ==========================================

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
}

function mergeTransactions(local, cloud) {
  const merged = new Map();

  cloud.forEach(transaction => {
    if (transaction?.id) merged.set(transaction.id, transaction);
  });

  local.forEach(transaction => {
    if (transaction?.id) {
      const existing = merged.get(transaction.id);
      // Prefer the newest record when updatedAt exists.
      if (!existing || new Date(transaction.updatedAt || 0) >= new Date(existing.updatedAt || 0)) {
        merged.set(transaction.id, transaction);
      }
    }
  });

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
}

// ==========================================
// INIT
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  if (isCloudConnected()) {
    validateCloudSession().then(valid => {
      if (valid) loadStats();
    });
  }
});
