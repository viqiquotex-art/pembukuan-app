// ==========================================
// PEMBUKUAN APP - CLOUD SYNC
// ==========================================
// Handles cloud storage integration with Cloudflare Worker
// Features: Login, Register, Sync, Load from Cloud

// ==========================================
// CONFIGURATION
// ==========================================

// Change this to your actual Cloudflare Worker URL
const API_BASE_URL = 'https://pembukuan-api.your-domain.workers.dev';
// For local testing: 'http://localhost:8787'

const API_ENDPOINTS = {
  register: `${API_BASE_URL}/api/auth/register`,
  login: `${API_BASE_URL}/api/auth/login`,
  saveTransactions: `${API_BASE_URL}/api/transactions`,
  getTransactions: (userId) => `${API_BASE_URL}/api/transactions/${userId}`,
  deleteTransaction: (userId, transactionId) => `${API_BASE_URL}/api/transactions/${userId}/${transactionId}`,
  getStats: (userId) => `${API_BASE_URL}/api/stats/${userId}`,
  export: `${API_BASE_URL}/api/export`,
};

// ==========================================
// LOCALSTORAGE MANAGEMENT
// ==========================================

function getCloudCredentials() {
  const credentials = localStorage.getItem('cloud_credentials');
  return credentials ? JSON.parse(credentials) : null;
}

function saveCloudCredentials(credentials) {
  localStorage.setItem('cloud_credentials', JSON.stringify(credentials));
}

function clearCloudCredentials() {
  localStorage.removeItem('cloud_credentials');
}

function isCloudConnected() {
  return getCloudCredentials() !== null;
}

// ==========================================
// AUTH HANDLERS
// ==========================================

async function handleRegister() {
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;

  // Validation
  if (!name || !email || !password) {
    showError('Semua field harus diisi');
    return;
  }

  if (password.length < 6) {
    showError('Password minimal 6 karakter');
    return;
  }

  if (!isValidEmail(email)) {
    showError('Email tidak valid');
    return;
  }

  try {
    setLoading(true, 'Mendaftarkan...');

    const response = await fetch(API_ENDPOINTS.register, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Registrasi gagal');
      return;
    }

    // Save credentials
    saveCloudCredentials({
      userId: data.userId,
      token: data.token,
      name: name,
      email: email,
    });

    showSuccess('✅ Registrasi berhasil! Sekarang sync data Anda.');
    setTimeout(() => {
      showDashboard();
    }, 1500);

  } catch (error) {
    showError(`Registrasi gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  // Validation
  if (!email || !password) {
    showError('Email dan password harus diisi');
    return;
  }

  try {
    setLoading(true, 'Sedang login...');

    const response = await fetch(API_ENDPOINTS.login, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Login gagal');
      return;
    }

    // Save credentials
    saveCloudCredentials({
      userId: data.userId,
      token: data.token,
      name: data.name,
      email: data.email,
    });

    showSuccess(`✅ Login berhasil! Halo ${data.name}`);
    setTimeout(() => {
      showDashboard();
    }, 1500);

  } catch (error) {
    showError(`Login gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function handleLogout() {
  if (confirm('Yakin logout? Data lokal Anda tetap aman.')) {
    clearCloudCredentials();
    location.reload();
  }
}

// ==========================================
// CLOUD SYNC HANDLERS
// ==========================================

async function syncToCloud() {
  const credentials = getCloudCredentials();
  if (!credentials) {
    showError('Anda harus login terlebih dahulu');
    return;
  }

  try {
    setLoading(true, 'Syncing ke cloud...');

    // Get transactions from localStorage
    const transactions = JSON.parse(localStorage.getItem('transactions') || '[]');

    const response = await fetch(API_ENDPOINTS.saveTransactions, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: credentials.userId,
        token: credentials.token,
        transactions: transactions,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Sync gagal');
      return;
    }

    showSuccess(`✅ Synced! ${data.count} transaksi tersimpan di cloud`);
    loadStats();

  } catch (error) {
    showError(`Sync gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function loadFromCloud() {
  const credentials = getCloudCredentials();
  if (!credentials) {
    showError('Anda harus login terlebih dahulu');
    return;
  }

  try {
    setLoading(true, 'Memuat dari cloud...');

    const response = await fetch(API_ENDPOINTS.getTransactions(credentials.userId), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Load gagal');
      return;
    }

    if (data.transactions && data.transactions.length > 0) {
      // Merge dengan data lokal
      const localTransactions = JSON.parse(localStorage.getItem('transactions') || '[]');
      const merged = mergeTransactions(localTransactions, data.transactions);
      localStorage.setItem('transactions', JSON.stringify(merged));

      showSuccess(`✅ Loaded! ${merged.length} transaksi (merged)`);
    } else {
      showSuccess('✅ Tidak ada data baru di cloud');
    }

    loadStats();

  } catch (error) {
    showError(`Load gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

// ==========================================
// STATS & DASHBOARD
// ==========================================

async function loadStats() {
  const credentials = getCloudCredentials();
  if (!credentials) return;

  try {
    const response = await fetch(API_ENDPOINTS.getStats(credentials.userId), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const stats = await response.json();

    if (response.ok) {
      document.getElementById('userName').textContent = credentials.name;

      const statsHTML = `
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
          <div class="value">${stats.transactionCount}</div>
        </div>
      `;
      document.getElementById('statsContainer').innerHTML = statsHTML;
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// ==========================================
// UI HANDLERS
// ==========================================

function toggleAuthForm() {
  document.getElementById('loginForm').classList.toggle('hidden');
  document.getElementById('registerForm').classList.toggle('hidden');
}

function showDashboard() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('dashboard').classList.add('show');
  loadStats();
}

function showAuth() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('dashboard').classList.remove('show');
}

function showError(message) {
  const errorEl = document.getElementById('errorMsg');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  errorEl.style.animation = 'none';
  setTimeout(() => {
    errorEl.style.animation = 'slideIn 0.3s ease';
  }, 10);
  setTimeout(() => {
    errorEl.style.display = 'none';
  }, 4000);
}

function showSuccess(message) {
  const successEl = document.getElementById('successMsg');
  successEl.textContent = message;
  successEl.style.display = 'block';
  successEl.style.animation = 'none';
  setTimeout(() => {
    successEl.style.animation = 'slideIn 0.3s ease';
  }, 10);
  setTimeout(() => {
    successEl.style.display = 'none';
  }, 4000);
}

function setLoading(isLoading, text = 'Loading...') {
  const buttons = document.querySelectorAll('.btn-primary, .btn-secondary');
  buttons.forEach(btn => {
    if (isLoading) {
      btn.classList.add('loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

function goToApp() {
  // Redirect to main app
  window.location.href = './index.html';
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function mergeTransactions(local, cloud) {
  // Create map by ID to avoid duplicates
  const merged = new Map();

  // Add cloud transactions first
  cloud.forEach(t => {
    merged.set(t.id, t);
  });

  // Add/override with local transactions (local takes priority)
  local.forEach(t => {
    merged.set(t.id, t);
  });

  // Return as array, sorted by date descending
  return Array.from(merged.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ==========================================
// INIT ON PAGE LOAD
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  // Check if already logged in
  if (isCloudConnected()) {
    showDashboard();
  } else {
    showAuth();
  }

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
});
