// ==========================================
// PEMBUKUAN APP - CLOUD SYNC
// ==========================================
// Cloudflare Worker API Integration
// ==========================================

// ==========================================
// CONFIGURATION
// ==========================================

const API_BASE_URL = 'https://pembukuan-app.viqiquotex.workers.dev';

const API_ENDPOINTS = {
  register: `${API_BASE_URL}/api/auth/register`,
  login: `${API_BASE_URL}/api/auth/login`,
  saveTransactions: `${API_BASE_URL}/api/transactions`,
  getTransactions: (userId) =>
    `${API_BASE_URL}/api/transactions/${userId}`,
  deleteTransaction: (userId, transactionId) =>
    `${API_BASE_URL}/api/transactions/${userId}/${transactionId}`,
  getStats: (userId) =>
    `${API_BASE_URL}/api/stats/${userId}`,
  export: (userId) =>
    `${API_BASE_URL}/api/export/${userId}`,
};

// ==========================================
// LOCALSTORAGE MANAGEMENT
// ==========================================

function getCloudCredentials() {
  const credentials = localStorage.getItem('cloud_credentials');
  return credentials ? JSON.parse(credentials) : null;
}

function saveCloudCredentials(credentials) {
  localStorage.setItem(
    'cloud_credentials',
    JSON.stringify(credentials)
  );
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
    setLoading(true);

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

    saveCloudCredentials({
      userId: data.userId,
      token: data.token,
      name: data.name,
      email: data.email,
    });

    showSuccess('✅ Registrasi berhasil!');

    setTimeout(() => {
      showDashboard();
    }, 1000);

  } catch (error) {
    showError(`Registrasi gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showError('Email dan password harus diisi');
    return;
  }

  try {
    setLoading(true);

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

    saveCloudCredentials({
      userId: data.userId,
      token: data.token,
      name: data.name,
      email: data.email,
    });

    showSuccess(`✅ Login berhasil! Halo ${data.name}`);

    setTimeout(() => {
      showDashboard();
    }, 1000);

  } catch (error) {
    showError(`Login gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function handleLogout() {
  if (!confirm('Yakin logout? Data lokal Anda tetap aman.')) {
    return;
  }

  clearCloudCredentials();
  location.reload();
}

// ==========================================
// CLOUD SYNC
// ==========================================

async function syncToCloud() {
  const credentials = getCloudCredentials();

  if (!credentials) {
    showError('Anda harus login terlebih dahulu');
    return;
  }

  try {
    setLoading(true);

    const transactions = JSON.parse(
      localStorage.getItem('transactions') || '[]'
    );

    const response = await fetch(
      API_ENDPOINTS.saveTransactions,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.token}`,
        },
        body: JSON.stringify({
          userId: credentials.userId,
          token: credentials.token,
          transactions,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Sync gagal');
      return;
    }

    showSuccess(
      `✅ ${data.count} transaksi tersimpan di cloud`
    );

    await loadStats();

  } catch (error) {
    showError(`Sync gagal: ${error.message}`);
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
    showError('Anda harus login terlebih dahulu');
    return;
  }

  try {
    setLoading(true);

    const response = await fetch(
      API_ENDPOINTS.getTransactions(credentials.userId),
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Load gagal');
      return;
    }

    if (Array.isArray(data.transactions)) {
      const localTransactions = JSON.parse(
        localStorage.getItem('transactions') || '[]'
      );

      const merged = mergeTransactions(
        localTransactions,
        data.transactions
      );

      localStorage.setItem(
        'transactions',
        JSON.stringify(merged)
      );

      showSuccess(
        `✅ ${merged.length} transaksi tersedia`
      );

      // Refresh main app if available
      if (typeof renderHistory === 'function') {
        renderHistory();
      }

      if (typeof renderRecap === 'function') {
        renderRecap();
      }

    } else {
      showSuccess('✅ Tidak ada transaksi di cloud');
    }

    await loadStats();

  } catch (error) {
    showError(`Load gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

// ==========================================
// LOAD CLOUD STATS
// ==========================================

async function loadStats() {
  const credentials = getCloudCredentials();

  if (!credentials) {
    return;
  }

  try {
    const response = await fetch(
      API_ENDPOINTS.getStats(credentials.userId),
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Stats error:', data);
      return;
    }

    // Worker response:
    // {
    //   success: true,
    //   userId: "...",
    //   stats: {...}
    // }

    const stats = data.stats;

    if (!stats) {
      return;
    }

    const userName = document.getElementById('userName');
    const statsContainer =
      document.getElementById('statsContainer');

    if (userName) {
      userName.textContent = credentials.name;
    }

    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="stat-card">
          <div class="label">💰 Total Pemasukan</div>
          <div class="value">
            ${formatRupiah(stats.totalIncome)}
          </div>
        </div>

        <div class="stat-card">
          <div class="label">💸 Total Pengeluaran</div>
          <div class="value">
            ${formatRupiah(stats.totalExpense)}
          </div>
        </div>

        <div class="stat-card">
          <div class="label">📊 Saldo</div>
          <div class="value">
            ${formatRupiah(stats.balance)}
          </div>
        </div>

        <div class="stat-card">
          <div class="label">📝 Transaksi</div>
          <div class="value">
            ${stats.transactionCount}
          </div>
        </div>
      `;
    }

  } catch (error) {
    console.error(
      'Failed to load stats:',
      error
    );
  }
}

// ==========================================
// UI HANDLERS
// ==========================================

function toggleAuthForm() {
  document
    .getElementById('loginForm')
    .classList.toggle('hidden');

  document
    .getElementById('registerForm')
    .classList.toggle('hidden');
}

function showDashboard() {
  const authSection =
    document.getElementById('authSection');

  const dashboard =
    document.getElementById('dashboard');

  if (authSection) {
    authSection.style.display = 'none';
  }

  if (dashboard) {
    dashboard.classList.add('show');
  }

  loadStats();
}

function showAuth() {
  const authSection =
    document.getElementById('authSection');

  const dashboard =
    document.getElementById('dashboard');

  if (authSection) {
    authSection.style.display = 'block';
  }

  if (dashboard) {
    dashboard.classList.remove('show');
  }
}

function showError(message) {
  const errorEl =
    document.getElementById('errorMsg');

  if (!errorEl) {
    alert(message);
    return;
  }

  errorEl.textContent = message;
  errorEl.style.display = 'block';

  setTimeout(() => {
    errorEl.style.display = 'none';
  }, 4000);
}

function showSuccess(message) {
  const successEl =
    document.getElementById('successMsg');

  if (!successEl) {
    alert(message);
    return;
  }

  successEl.textContent = message;
  successEl.style.display = 'block';

  setTimeout(() => {
    successEl.style.display = 'none';
  }, 4000);
}

function setLoading(isLoading) {
  const buttons =
    document.querySelectorAll(
      '.btn-primary, .btn-secondary'
    );

  buttons.forEach(btn => {
    btn.disabled = isLoading;

    if (isLoading) {
      btn.classList.add('loading');
    } else {
      btn.classList.remove('loading');
    }
  });
}

// ==========================================
// NAVIGATION
// ==========================================

function goToApp() {
  window.location.href = './index.html';
}

// ==========================================
// UTILITY
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
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return emailRegex.test(email);
}

function mergeTransactions(local, cloud) {
  const merged = new Map();

  cloud.forEach(transaction => {
    merged.set(transaction.id, transaction);
  });

  local.forEach(transaction => {
    merged.set(transaction.id, transaction);
  });

  return Array.from(merged.values()).sort(
    (a, b) =>
      new Date(b.date) - new Date(a.date)
  );
}

// ==========================================
// INIT
// ==========================================

window.addEventListener(
  'DOMContentLoaded',
  () => {

    if (isCloudConnected()) {
      showDashboard();
    } else {
      showAuth();
    }

    const style =
      document.createElement('style');

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
  }
);