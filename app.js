// ==========================================
// DATA & CONSTANTS
// ==========================================

const INCOME_CATEGORIES = [
  'Gaji/Upah',
  'Freelance',
  'Investasi',
  'Bonus',
  'Penjualan',
  'Lainnya'
];

const EXPENSE_CATEGORIES = [
  'Makanan',
  'Transportasi',
  'Belanja',
  'Hiburan',
  'Kesehatan',
  'Listrik/Internet',
  'Sewa',
  'Lainnya'
];

// Cloud API configuration
const API_BASE_URL = 'https://pembukuan-api.your-domain.workers.dev';

// ==========================================
// LOCALSTORAGE MANAGEMENT
// ==========================================

function getTransactions() {
  const data = localStorage.getItem('transactions');
  return data ? JSON.parse(data) : [];
}

function saveTransactions(transactions) {
  localStorage.setItem('transactions', JSON.stringify(transactions));
}

function getCloudCredentials() {
  const credentials = localStorage.getItem('cloud_credentials');
  return credentials ? JSON.parse(credentials) : null;
}

function isCloudConnected() {
  return getCloudCredentials() !== null;
}

function updateCloudStatus() {
  const badge = document.getElementById('cloudStatusBadge');
  if (!badge) return;

  if (isCloudConnected()) {
    const creds = getCloudCredentials();
    badge.textContent = `✅ Cloud: ${creds.name}`;
    badge.classList.add('connected');
  } else {
    badge.textContent = '⚫ Offline Mode';
    badge.classList.remove('connected');
  }
}

// ==========================================
// FORMAT RUPIAH
// ==========================================

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==========================================
// TAB SWITCHING
// ==========================================

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  const tabContent = document.getElementById(tabName);
  if (tabContent) {
    tabContent.classList.add('active');
  }
  
  event.target.classList.add('active');

  // Refresh data when switching tabs
  if (tabName === 'history') {
    renderHistory();
  } else if (tabName === 'recap') {
    renderRecap();
  } else if (tabName === 'cloud') {
    renderCloudPanel();
  }
}

// ==========================================
// UPDATE CATEGORIES
// ==========================================

function updateCategories() {
  const type = document.getElementById('type').value;
  const categorySelect = document.getElementById('category');
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  
  categorySelect.innerHTML = '';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });
}

// ==========================================
// SET TODAY'S DATE
// ==========================================

function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value = today;
}

// ==========================================
// EDIT MODE MANAGEMENT
// ==========================================

function enterEditMode(id) {
  const transactions = getTransactions();
  const transaction = transactions.find(t => t.id === id);
  
  if (!transaction) {
    showToast('❌ Transaksi tidak ditemukan', 'error');
    return;
  }

  // Populate form with transaction data
  document.getElementById('type').value = transaction.type;
  updateCategories();
  document.getElementById('category').value = transaction.category;
  document.getElementById('amount').value = transaction.amount;
  document.getElementById('date').value = transaction.date;
  document.getElementById('description').value = transaction.description;

  // Store the ID being edited
  window.editingTransactionId = id;

  // Show edit mode UI
  const bannerEl = document.getElementById('editModeBanner');
  const formTitleEl = document.getElementById('formTitle');
  const submitBtn = document.getElementById('submitBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  if (bannerEl) bannerEl.style.display = 'flex';
  if (formTitleEl) formTitleEl.textContent = '✏️ Edit Transaksi';
  if (submitBtn) submitBtn.textContent = 'Update Transaksi';
  if (cancelBtn) cancelBtn.style.display = 'block';

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('amount').focus();

  showToast('📝 Mode edit: ubah data dan klik Update', 'info');
}

function cancelEdit() {
  window.editingTransactionId = null;

  // Reset form
  document.getElementById('type').value = 'income';
  updateCategories();
  document.getElementById('amount').value = '';
  document.getElementById('date').value = '';
  document.getElementById('description').value = '';
  setTodayDate();

  // Reset UI
  const bannerEl = document.getElementById('editModeBanner');
  const formTitleEl = document.getElementById('formTitle');
  const submitBtn = document.getElementById('submitBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  if (bannerEl) bannerEl.style.display = 'none';
  if (formTitleEl) formTitleEl.textContent = 'Tambah Transaksi Baru';
  if (submitBtn) submitBtn.textContent = 'Simpan Transaksi';
  if (cancelBtn) cancelBtn.style.display = 'none';

  showToast('✅ Edit dibatalkan', 'info');
}

// ==========================================
// ADD / UPDATE TRANSACTION
// ==========================================

function addTransaction() {
  if (window.editingTransactionId) {
    updateTransaction();
    return;
  }

  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value;

  // Validation
  if (!amount || amount <= 0) {
    showToast('❌ Masukkan jumlah yang valid', 'error');
    return;
  }
  if (!date) {
    showToast('❌ Pilih tanggal', 'error');
    return;
  }

  // Create transaction object with unique ID
  const transaction = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    category,
    amount,
    date,
    description,
    createdAt: new Date().toISOString()
  };

  // Save to localStorage
  const transactions = getTransactions();
  transactions.push(transaction);
  saveTransactions(transactions);

  // Reset form
  document.getElementById('type').value = 'income';
  updateCategories();
  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  setTodayDate();

  showToast('✅ Transaksi berhasil disimpan!', 'success');
  renderHistory();

  // Auto sync if connected to cloud
  if (isCloudConnected()) {
    autoSyncToCloud();
  }
}

function updateTransaction() {
  const id = window.editingTransactionId;
  if (!id) return;

  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value;

  // Validation
  if (!amount || amount <= 0) {
    showToast('❌ Masukkan jumlah yang valid', 'error');
    return;
  }
  if (!date) {
    showToast('❌ Pilih tanggal', 'error');
    return;
  }

  // Update transaction
  let transactions = getTransactions();
  const transaction = transactions.find(t => t.id === id);
  
  if (transaction) {
    transaction.type = type;
    transaction.category = category;
    transaction.amount = amount;
    transaction.date = date;
    transaction.description = description;
    transaction.updatedAt = new Date().toISOString();

    saveTransactions(transactions);

    // Reset edit mode
    cancelEdit();

    showToast('✅ Transaksi berhasil diupdate!', 'success');
    renderHistory();

    // Auto sync if connected to cloud
    if (isCloudConnected()) {
      autoSyncToCloud();
    }
  }
}

// ==========================================
// DELETE TRANSACTION
// ==========================================

function deleteTransaction(id) {
  if (!confirm('Yakin hapus transaksi ini?')) return;
  
  let transactions = getTransactions();
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions(transactions);
  
  showToast('✅ Transaksi dihapus!', 'success');
  renderHistory();

  // Auto sync if connected to cloud
  if (isCloudConnected()) {
    autoSyncToCloud();
  }
}

// ==========================================
// RENDER HISTORY & TODAY'S STATS
// ==========================================

function renderHistory() {
  const transactions = getTransactions();
  const today = new Date().toISOString().split('T')[0];
  const todayTransactions = transactions.filter(t => t.date === today);

  // Calculate today's stats
  const todayIncome = todayTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const todayExpense = todayTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const todayBalance = todayIncome - todayExpense;

  // Render today's stats
  const statsHTML = `
    <div class="stat-card income">
      <h3>Pemasukan Hari Ini</h3>
      <div class="amount">${formatRupiah(todayIncome)}</div>
      <div class="detail">${todayTransactions.filter(t => t.type === 'income').length} transaksi</div>
    </div>
    <div class="stat-card expense">
      <h3>Pengeluaran Hari Ini</h3>
      <div class="amount">${formatRupiah(todayExpense)}</div>
      <div class="detail">${todayTransactions.filter(t => t.type === 'expense').length} transaksi</div>
    </div>
    <div class="stat-card balance">
      <h3>Saldo Hari Ini</h3>
      <div class="amount">${formatRupiah(todayBalance)}</div>
      <div class="detail">Pemasukan - Pengeluaran</div>
    </div>
  `;
  document.getElementById('todayStats').innerHTML = statsHTML;

  // Render transaction list (sorted by date descending)
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (sorted.length === 0) {
    document.getElementById('transactionList').innerHTML = `
      <div class="empty-state">
        <h3>Tidak ada transaksi</h3>
        <p>Mulai tambahkan transaksi di tab "Input Transaksi"</p>
      </div>
    `;
    return;
  }

  let html = '';
  sorted.forEach(t => {
    const icon = t.type === 'income' ? '📬' : '📭';
    const amountClass = t.type === 'income' ? 'income' : 'expense';
    const amountSign = t.type === 'income' ? '+' : '-';
    
    html += `
      <div class="transaction-item">
        <div class="transaction-info">
          <div class="transaction-category">${icon} ${t.category}</div>
          <div class="transaction-desc">${t.description || '-'}</div>
          <div class="transaction-date">${formatDate(t.date)} · ${formatTime(t.createdAt)}</div>
        </div>
        <div class="transaction-amount ${amountClass}">${amountSign}${formatRupiah(t.amount)}</div>
        <div class="transaction-actions">
          <button class="btn btn-info btn-small" onclick="enterEditMode('${t.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-small" onclick="deleteTransaction('${t.id}')">🗑️ Hapus</button>
        </div>
      </div>
    `;
  });

  document.getElementById('transactionList').innerHTML = html;
}

// ==========================================
// RENDER MONTHLY RECAP
// ==========================================

function renderRecap() {
  const transactions = getTransactions();
  
  if (transactions.length === 0) {
    document.getElementById('recapGrid').innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <h3>Tidak ada data untuk direkap</h3>
        <p>Tambahkan transaksi terlebih dahulu</p>
      </div>
    `;
    return;
  }

  // Group by month
  const monthlyData = {};

  transactions.forEach(t => {
    const date = new Date(t.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        income: 0,
        expense: 0
      };
    }

    if (t.type === 'income') {
      monthlyData[monthKey].income += t.amount;
    } else {
      monthlyData[monthKey].expense += t.amount;
    }
  });

  // Sort months in descending order
  const sortedMonths = Object.keys(monthlyData).sort().reverse();

  // Render month cards
  let html = '';
  sortedMonths.forEach(monthKey => {
    const monthName = new Date(`${monthKey}-01`).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    const data = monthlyData[monthKey];
    const balance = data.income - data.expense;
    const balanceClass = balance >= 0 ? 'income' : 'expense';

    html += `
      <div class="month-card">
        <h3>${monthName}</h3>
        <div class="recap-row income">
          <span class="label">💰 Pemasukan</span>
          <span class="value">${formatRupiah(data.income)}</span>
        </div>
        <div class="recap-row expense">
          <span class="label">💸 Pengeluaran</span>
          <span class="value">${formatRupiah(data.expense)}</span>
        </div>
        <div class="recap-row total">
          <span class="label">📊 Saldo</span>
          <span class="value ${balanceClass === 'income' ? 'income' : 'expense'}">${formatRupiah(balance)}</span>
        </div>
      </div>
    `;
  });

  document.getElementById('recapGrid').innerHTML = html;
}

// ==========================================
// CLOUD SYNC PANEL
// ==========================================

function renderCloudPanel() {
  const credentials = getCloudCredentials();
  const cloudPanelHTML = document.getElementById('cloudPanel');

  if (!credentials) {
    cloudPanelHTML.innerHTML = `
      <div class="cloud-info">
        <h3>☁️ Cloud Storage - Offline</h3>
        <p>Sinkronisasi data Anda ke cloud untuk akses di berbagai device dan backup data</p>
        <button class="btn btn-primary" onclick="goToCloudPage()">🔑 Login / Daftar Cloud</button>
        <div class="cloud-tips" style="margin-top: 20px;">
          <p style="font-weight: 600; margin-bottom: 10px;">Mengapa pakai cloud?</p>
          <ul>
            <li>💾 Backup data otomatis</li>
            <li>📱 Akses dari berbagai device</li>
            <li>🔄 Sinkronisasi real-time</li>
            <li>🔒 Data terenkripsi dan aman</li>
          </ul>
        </div>
      </div>
    `;
    return;
  }

  cloudPanelHTML.innerHTML = `
    <div class="cloud-info">
      <h3>☁️ Cloud Storage - Terhubung ✅</h3>
      <p><strong>${credentials.name}</strong></p>
      <p style="font-size: 12px; color: var(--muted);">${credentials.email}</p>
      
      <div class="cloud-actions">
        <button class="btn btn-primary" onclick="syncToCloudFromApp()">📤 Sync ke Cloud</button>
        <button class="btn btn-primary" style="background: var(--success);" onclick="loadFromCloudToApp()">📥 Muat dari Cloud</button>
        <button class="btn btn-danger" onclick="logoutCloud()">🚪 Logout</button>
      </div>

      <div class="cloud-tips">
        <p style="font-weight: 600; margin-bottom: 10px;">💡 Tips Penggunaan:</p>
        <ul>
          <li>📤 <strong>Sync ke Cloud:</strong> Backup data lokal Anda ke cloud</li>
          <li>📥 <strong>Muat dari Cloud:</strong> Ambil data terbaru dari cloud storage</li>
          <li>🔄 <strong>Auto Sync:</strong> Aktif otomatis setiap kali ada perubahan</li>
          <li>🔒 <strong>Aman:</strong> Data Anda terenkripsi di Cloudflare Workers</li>
        </ul>
      </div>
    </div>
  `;
}

async function syncToCloudFromApp() {
  const credentials = getCloudCredentials();
  if (!credentials) {
    showToast('❌ Silakan login cloud terlebih dahulu', 'error');
    return;
  }

  try {
    showToast('📤 Syncing ke cloud...', 'info');
    
    const transactions = getTransactions();
    const response = await fetch(`${API_BASE_URL}/api/transactions`, {
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
      showToast(`❌ ${data.error || 'Sync gagal'}`, 'error');
      return;
    }

    showToast(`✅ Synced! ${data.count} transaksi tersimpan`, 'success');
  } catch (error) {
    showToast(`❌ Sync gagal: ${error.message}`, 'error');
  }
}

async function loadFromCloudToApp() {
  const credentials = getCloudCredentials();
  if (!credentials) {
    showToast('❌ Silakan login cloud terlebih dahulu', 'error');
    return;
  }

  try {
    showToast('📥 Memuat dari cloud...', 'info');
    
    const response = await fetch(`${API_BASE_URL}/api/transactions/${credentials.userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(`❌ ${data.error || 'Load gagal'}`, 'error');
      return;
    }

    if (data.transactions && data.transactions.length > 0) {
      localStorage.setItem('transactions', JSON.stringify(data.transactions));
      showToast(`✅ Loaded! ${data.transactions.length} transaksi dimuat`, 'success');
      renderHistory();
      renderRecap();
    } else {
      showToast('✅ Tidak ada data baru di cloud', 'info');
    }
  } catch (error) {
    showToast(`❌ Load gagal: ${error.message}`, 'error');
  }
}

function logoutCloud() {
  if (confirm('Logout dari cloud? Data lokal tetap aman.')) {
    localStorage.removeItem('cloud_credentials');
    showToast('✅ Logout cloud berhasil', 'success');
    updateCloudStatus();
    renderCloudPanel();
  }
}

async function autoSyncToCloud() {
  const credentials = getCloudCredentials();
  if (!credentials) return;

  try {
    const transactions = getTransactions();
    await fetch(`${API_BASE_URL}/api/transactions`, {
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
  } catch (error) {
    console.log('Auto sync background error:', error);
  }
}

function goToCloudPage() {
  window.location.href = './cloud.html';
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================================
// INIT ON PAGE LOAD
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  setTodayDate();
  updateCategories();
  renderHistory();
  renderCloudPanel();
  updateCloudStatus();

  // Add toast styles
  const style = document.createElement('style');
  style.textContent = `
    .toast {
      position: fixed;
      bottom: -100px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 14px;
      z-index: 1000;
      transition: bottom 0.3s ease;
      max-width: 400px;
      text-align: center;
    }

    .toast.show {
      bottom: 20px;
    }

    .toast-success {
      border-left: 4px solid #45a86b;
      color: #45a86b;
    }

    .toast-error {
      border-left: 4px solid #ef4444;
      color: #ef4444;
    }

    .toast-info {
      border-left: 4px solid #6d5dfc;
      color: #6d5dfc;
    }

    @media (max-width: 600px) {
      .toast {
        max-width: calc(100% - 40px);
        font-size: 12px;
        padding: 12px 16px;
      }
    }
  `;
  document.head.appendChild(style);
});
