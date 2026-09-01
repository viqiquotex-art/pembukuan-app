// ==========================================
// PEMBUKUAN APP - CLOUD SYNC
// ==========================================

const API_BASE_URL = 'ISI_URL_WORKER_KAMU_DI_SINI';

const API_ENDPOINTS = {
  register: `${API_BASE_URL}/api/auth/register`,
  login: `${API_BASE_URL}/api/auth/login`,
  saveTransactions: `${API_BASE_URL}/api/transactions`,
  getTransactions: (userId) => `${API_BASE_URL}/api/transactions/${userId}`,
  getStats: (userId) => `${API_BASE_URL}/api/stats/${userId}`,
  export: (userId) => `${API_BASE_URL}/api/export/${userId}`,
};

// ==========================================
// LOCAL STORAGE
// ==========================================

function getCloudCredentials() {
  const credentials = localStorage.getItem('cloud_credentials');

  if (credentials) {
    return JSON.parse(credentials);
  }

  // Support format lama
  const userId = localStorage.getItem('cloud_userId');
  const token = localStorage.getItem('cloud_token');
  const email = localStorage.getItem('cloud_email');
  const name = localStorage.getItem('cloud_name');

  if (userId && token) {
    const credentials = {
      userId,
      token,
      email,
      name
    };

    // Simpan juga ke format baru
    localStorage.setItem(
      'cloud_credentials',
      JSON.stringify(credentials)
    );

    return credentials;
  }

  return null;
}

function saveCloudCredentials(credentials) {
  localStorage.setItem(
    'cloud_credentials',
    JSON.stringify(credentials)
  );

  // Simpan juga format lama supaya kompatibel
  localStorage.setItem('cloud_userId', credentials.userId);
  localStorage.setItem('cloud_token', credentials.token);
  localStorage.setItem('cloud_email', credentials.email);
  localStorage.setItem('cloud_name', credentials.name);
}

function clearCloudCredentials() {
  localStorage.removeItem('cloud_credentials');
  localStorage.removeItem('cloud_userId');
  localStorage.removeItem('cloud_token');
  localStorage.removeItem('cloud_email');
  localStorage.removeItem('cloud_name');
}

function isCloudConnected() {
  return getCloudCredentials() !== null;
}

// ==========================================
// AUTH
// ==========================================

async function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm =
    document.getElementById('registerPasswordConfirm').value;

  if (!name || !email || !password || !passwordConfirm) {
    showError('Semua field harus diisi');
    return;
  }

  if (password.length < 6) {
    showError('Password minimal 6 karakter');
    return;
  }

  if (password !== passwordConfirm) {
    showError('Password tidak cocok');
    return;
  }

  try {
    setLoading(true, 'Mendaftarkan...');

    const response = await fetch(API_ENDPOINTS.register, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        email,
        password
      })
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
      email: data.email
    });

    showSuccess('✅ Registrasi berhasil!');

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);

  } catch (error) {
    console.error(error);
    showError(`Registrasi gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showError('Email dan password harus diisi');
    return;
  }

  try {
    setLoading(true, 'Sedang login...');

    const response = await fetch(API_ENDPOINTS.login, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password
      })
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
      email: data.email
    });

    showSuccess(`✅ Login berhasil! Halo ${data.name}`);

    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);

  } catch (error) {
    console.error(error);
    showError(`Login gagal: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function handleLogout() {
  if (confirm('Yakin logout? Data lokal tetap aman.')) {
    clearCloudCredentials();
    location.reload();
  }
}

// ==========================================
// SYNC TO CLOUD
// ==========================================

async function syncToCloud() {
  const credentials = getCloudCredentials();

  if (!credentials) {
    showError('Anda harus login terlebih dahulu');
    return;
  }

  try {
    setLoading(true, 'Syncing ke cloud...');

    const transactions =
      JSON.parse(localStorage.getItem('transactions') || '[]');

    const response = await fetch(
      API_ENDPOINTS.saveTransactions,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.token}`
        },
        body: JSON.stringify({
          userId: credentials.userId,
          token: credentials.token,
          transactions
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      showError(data.error || 'Sync gagal');
      return;
    }

    showSuccess(
      `✅ Synced! ${data.count} transaksi tersimpan di cloud`
    );

    loadStats();

  } catch (error) {
    console.error(error);
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
    setLoading(true, 'Memuat dari cloud...');

    const response = await fetch(
      API_ENDPOINTS.getTransactions(credentials.userId),
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',

          // INI YANG SEBELUMNYA HILANG
          'Authorization': `Bearer ${credentials.token}`
        }
      }
    );

    const data = await response.json();

    console.log('Cloud response:', data);

    if (!response.ok) {
      showError(data.error || 'Load gagal');
      return;
    }

    if (
      Array.isArray(data.transactions) &&
      data.transactions.length > 0
    ) {
      const localTransactions =
        JSON.parse(
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
        `✅ Loaded! ${merged.length} transaksi`
      );

      // Refresh halaman utama jika fungsi tersedia
      if (typeof renderHistory === 'function') {
        renderHistory();
      }

      if (typeof renderRecap === 'function') {
        renderRecap();
      }

    } else {
      showSuccess('☁️ Cloud masih kosong');
    }

    loadStats();

  } catch (error) {
    console.error('Load cloud error:', error);
    showError(`Load gagal: ${error.message}`);
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
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.token}`
        }
      }
    );

    const data = await response.json();

    console.log('Stats response:', data);

    if (!response.ok) {
      console.error('Stats error:', data);
      return;
    }

    // Worker mengirim:
    // {
    //   success: true,
    //   userId: "...",
    //   stats: {
    //      totalIncome,
    //      totalExpense,
    //      balance,
    //      transactionCount
    //   }
    // }

    const stats = data.stats;

    if (!stats) {
      console.error('Stats object tidak ditemukan');
      return;
    }

    const userName = document.getElementById('userName');
    const statsContainer =
      document.getElementById('statsContainer');

    if (userName) {
      userName.textContent = credentials.name || '';
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
    console.error('Failed to load stats:', error);
  }
}

// ==========================================
// UI
// ==========================================

function toggleForm() {
  const loginForm =
    document.getElementById('loginForm');

  const registerForm =
    document.getElementById('registerForm');

  if (!loginForm || !registerForm) return;

  const loginVisible =
    loginForm.style.display !== 'none';

  loginForm.style.display =
    loginVisible ? 'none' : 'block';

  registerForm.style.display =
    loginVisible ? 'block' : 'none';

  hideAlert();
}

function showError(message) {
  const alert =
    document.getElementById('alert');

  if (!alert) {
    console.error(message);
    return;
  }

  alert.className = 'alert error show';
  alert.textContent = message;
}

function showSuccess(message) {
  const alert =
    document.getElementById('alert');

  if (!alert) {
    console.log(message);
    return;
  }

  alert.className = 'alert success show';
  alert.textContent = message;
}

function hideAlert() {
  const alert =
    document.getElementById('alert');

  if (alert) {
    alert.classList.remove('show');
  }
}

function setLoading(isLoading) {
  const loginBtn =
    document.getElementById('loginBtn');

  const registerBtn =
    document.getElementById('registerBtn');

  const loginLoading =
    document.getElementById('loginLoading');

  const registerLoading =
    document.getElementById('registerLoading');

  if (loginBtn) {
    loginBtn.disabled = isLoading;
  }

  if (registerBtn) {
    registerBtn.disabled = isLoading;
  }

  if (loginLoading) {
    loginLoading.style.display =
      isLoading ? 'block' : 'none';
  }

  if (registerLoading) {
    registerLoading.style.display =
      isLoading ? 'block' : 'none';
  }
}

function goToApp() {
  window.location.href = './index.html';
}

// ==========================================
// UTILITIES
// ==========================================

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

window.addEventListener('DOMContentLoaded', () => {
  if (isCloudConnected()) {
    loadStats();
  }
});