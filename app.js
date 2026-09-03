// ==========================================
// PEMBUKUAN APP - MAIN APP
// ==========================================

const INCOME_CATEGORIES = [
  'Gaji/Upah', 'Freelance', 'Investasi', 'Bonus', 'Penjualan', 'Lainnya'
];
const EXPENSE_CATEGORIES = [
  'Makanan', 'Transportasi', 'Belanja', 'Hiburan', 'Kesehatan', 'Listrik/Internet', 'Sewa', 'Lainnya'
];

const API_BASE_URL = 'https://pembukuan-app.viqiquotex.workers.dev';

function getTransactions() {
  try {
    const data = localStorage.getItem('transactions');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to read transactions:', error);
    return [];
  }
}

function saveTransactions(transactions) {
  localStorage.setItem('transactions', JSON.stringify(transactions));
}

function getCloudCredentials() {
  try {
    const data = localStorage.getItem('cloud_credentials');
    if (data) return JSON.parse(data);

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
    console.error('Failed to read cloud credentials:', error);
    return null;
  }
}

function saveCloudCredentials(credentials) {
  localStorage.setItem('cloud_credentials', JSON.stringify(credentials));
  localStorage.setItem('cloud_userId', credentials.userId);
  localStorage.setItem('cloud_token', credentials.token);
  localStorage.setItem('cloud_email', credentials.email || '');
  localStorage.setItem('cloud_name', credentials.name || '');
}

function isCloudConnected() {
  const credentials = getCloudCredentials();
  return !!(credentials && credentials.userId && credentials.token);
}

function updateCloudStatus() {
  const badge = document.getElementById('cloudStatusBadge');
  if (!badge) return;
  const credentials = getCloudCredentials();
  if (credentials) {
    badge.textContent = `☁️ Cloud: ${credentials.name || credentials.email || 'Connected'}`;
    badge.classList.add('connected');
  } else {
    badge.textContent = '⚫ Offline Mode';
    badge.classList.remove('connected');
  }
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(Number(amount) || 0);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function formatTime(dateString) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const tabContent = document.getElementById(tabName);
  if (tabContent) tabContent.classList.add('active');
  if (typeof event !== 'undefined' && event && event.target) event.target.classList.add('active');
  if (tabName === 'history') renderHistory();
  if (tabName === 'recap') renderRecap();
  if (tabName === 'cloud') renderCloudPanel();
}

function updateCategories() {
  const typeEl = document.getElementById('type');
  const categorySelect = document.getElementById('category');
  if (!typeEl || !categorySelect) return;
  const categories = typeEl.value === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  categorySelect.innerHTML = '';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

function setTodayDate() {
  const dateEl = document.getElementById('date');
  if (!dateEl) return;
  dateEl.value = new Date().toISOString().split('T')[0];
}

function enterEditMode(id) {
  const transactions = getTransactions();
  const transaction = transactions.find(t => t.id === id);
  if (!transaction) {
    showToast('❌ Transaksi tidak ditemukan', 'error');
    return;
  }
  document.getElementById('type').value = transaction.type;
  updateCategories();
  document.getElementById('category').value = transaction.category;
  document.getElementById('amount').value = transaction.amount;
  document.getElementById('date').value = transaction.date;
  document.getElementById('description').value = transaction.description || '';
  window.editingTransactionId = id;
  const banner = document.getElementById('editModeBanner');
  const formTitle = document.getElementById('formTitle');
  const submitBtn = document.getElementById('submitBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  if (banner) banner.style.display = 'flex';
  if (formTitle) formTitle.textContent = '✏️ Edit Transaksi';
  if (submitBtn) submitBtn.textContent = 'Update Transaksi';
  if (cancelBtn) cancelBtn.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const amountEl = document.getElementById('amount');
  if (amountEl) amountEl.focus();
  showToast('📝 Mode edit aktif', 'info');
}

function cancelEdit() {
  window.editingTransactionId = null;
  const typeEl = document.getElementById('type');
  if (typeEl) typeEl.value = 'income';
  updateCategories();
  const amountEl = document.getElementById('amount');
  const dateEl = document.getElementById('date');
  const descriptionEl = document.getElementById('description');
  if (amountEl) amountEl.value = '';
  if (descriptionEl) descriptionEl.value = '';
  if (dateEl) dateEl.value = '';
  setTodayDate();
  const banner = document.getElementById('editModeBanner');
  const formTitle = document.getElementById('formTitle');
  const submitBtn = document.getElementById('submitBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  if (banner) banner.style.display = 'none';
  if (formTitle) formTitle.textContent = 'Tambah Transaksi Baru';
  if (submitBtn) submitBtn.textContent = 'Simpan Transaksi';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function addTransaction() {
  if (window.editingTransactionId) {
    updateTransaction();
    return;
  }
  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value.trim();
  if (!amount || amount <= 0) {
    showToast('❌ Masukkan jumlah yang valid', 'error');
    return;
  }
  if (!date) {
    showToast('❌ Pilih tanggal', 'error');
    return;
  }
  const now = new Date().toISOString();
  const transaction = {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    type,
    category,
    amount,
    date,
    description,
    createdAt: now,
    updatedAt: now
  };
  const transactions = getTransactions();
  transactions.push(transaction);
  saveTransactions(transactions);
  document.getElementById('type').value = 'income';
  updateCategories();
  document.getElementById('amount').value = '';
  document.getElementById('description').value = '';
  setTodayDate();
  showToast('✅ Transaksi berhasil disimpan!', 'success');
  renderHistory();
  if (isCloudConnected()) autoSyncToCloud();
}

function updateTransaction() {
  const id = window.editingTransactionId;
  if (!id) return;
  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value.trim();
  if (!amount || amount <= 0) {
    showToast('❌ Masukkan jumlah yang valid', 'error');
    return;
  }
  if (!date) {
    showToast('❌ Pilih tanggal', 'error');
    return;
  }
  const transactions = getTransactions();
  const transaction = transactions.find(t => t.id === id);
  if (!transaction) {
    showToast('❌ Transaksi tidak ditemukan', 'error');
    return;
  }
  transaction.type = type;
  transaction.category = category;
  transaction.amount = amount;
  transaction.date = date;
  transaction.description = description;
  transaction.updatedAt = new Date().toISOString();
  saveTransactions(transactions);
  cancelEdit();
  showToast('✅ Transaksi berhasil diupdate!', 'success');
  renderHistory();
  if (isCloudConnected()) autoSyncToCloud();
}

function deleteTransaction(id) {
  if (!confirm('Yakin hapus transaksi ini?')) return;
  let transactions = getTransactions();
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions(transactions);
  showToast('✅ Transaksi dihapus!', 'success');
  renderHistory();
  if (isCloudConnected()) autoSyncToCloud();
}

function renderHistory() {
  const transactions = getTransactions();
  const today = new Date().toISOString().split('T')[0];
  const todayTransactions = transactions.filter(t => t.date === today);
  const todayIncome = todayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const todayExpense = todayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const todayBalance = todayIncome - todayExpense;
  const statsEl = document.getElementById('todayStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-card income"><h3>Pemasukan Hari Ini</h3><div class="amount">${formatRupiah(todayIncome)}</div><div class="detail">${todayTransactions.filter(t => t.type === 'income').length} transaksi</div></div>
      <div class="stat-card expense"><h3>Pengeluaran Hari Ini</h3><div class="amount">${formatRupiah(todayExpense)}</div><div class="detail">${todayTransactions.filter(t => t.type === 'expense').length} transaksi</div></div>
      <div class="stat-card balance"><h3>Saldo Hari Ini</h3><div class="amount">${formatRupiah(todayBalance)}</div><div class="detail">Pemasukan - Pengeluaran</div></div>
    `;
  }
  const listEl = document.getElementById('transactionList');
  if (!listEl) return;
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sorted.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><h3>Tidak ada transaksi</h3><p>Mulai tambahkan transaksi di tab "Input Transaksi"</p></div>`;
    return;
  }
  let html = '';
  sorted.forEach(transaction => {
    const icon = transaction.type === 'income' ? '📬' : '📭';
    const amountClass = transaction.type === 'income' ? 'income' : 'expense';
    const amountSign = transaction.type === 'income' ? '+' : '-';
    html += `
      <div class="transaction-item">
        <div class="transaction-info">
          <div class="transaction-category">${icon} ${transaction.category}</div>
          <div class="transaction-desc">${transaction.description || '-'}</div>
          <div class="transaction-date">${formatDate(transaction.date)}${transaction.createdAt ? ` · ${formatTime(transaction.createdAt)}` : ''}</div>
        </div>
        <div class="transaction-amount ${amountClass}">${amountSign}${formatRupiah(transaction.amount)}</div>
        <div class="transaction-actions">
          <button class="btn btn-info btn-small" onclick="enterEditMode('${transaction.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-small" onclick="deleteTransaction('${transaction.id}')">🗑️ Hapus</button>
        </div>
      </div>
    `;
  });
  listEl.innerHTML = html;
}

function renderRecap() {
  const transactions = getTransactions();
  const grid = document.getElementById('recapGrid');
  if (!grid) return;
  if (transactions.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>Tidak ada data untuk direkap</h3><p>Tambahkan transaksi terlebih dahulu</p></div>`;
    return;
  }
  const monthlyData = {};
  transactions.forEach(transaction => {
    const date = new Date(transaction.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0 };
    const amount = Number(transaction.amount || 0);
    if (transaction.type === 'income') monthlyData[monthKey].income += amount;
    if (transaction.type === 'expense') monthlyData[monthKey].expense += amount;
  });
  const sortedMonths = Object.keys(monthlyData).sort().reverse();
  let html = '';
  sortedMonths.forEach(monthKey => {
    const monthDate = new Date(`${monthKey}-01`);
    const monthName = monthDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    const data = monthlyData[monthKey];
    const balance = data.income - data.expense;
    html += `
      <div class="month-card">
        <h3>${monthName}</h3>
        <div class="recap-row income"><span class="label">💰 Pemasukan</span><span class="value">${formatRupiah(data.income)}</span></div>
        <div class="recap-row expense"><span class="label">💸 Pengeluaran</span><span class="value">${formatRupiah(data.expense)}</span></div>
        <div class="recap-row total"><span class="label">📊 Saldo</span><span class="value ${balance >= 0 ? 'income' : 'expense'}">${formatRupiah(balance)}</span></div>
      </div>
    `;
  });
  grid.innerHTML = html;
}

function renderCloudPanel() {
  const credentials = getCloudCredentials();
  const panel = document.getElementById('cloudPanel');
  if (!panel) return;
  if (!credentials) {
    panel.innerHTML = `
      <div class="cloud-info">
        <h3>☁️ Cloud Storage - Offline</h3>
        <p>Sinkronisasi data Anda ke cloud untuk akses di berbagai device dan backup data.</p>
        <button class="btn btn-primary" onclick="goToCloudPage()">🔑 Login / Daftar Cloud</button>
        <div class="cloud-tips" style="margin-top:20px;"><p><strong>Mengapa pakai cloud?</strong></p><ul><li>💾 Backup data</li><li>📱 Akses berbagai device</li><li>🔄 Sinkronisasi</li><li>🔒 Data tersimpan di cloud</li></ul></div>
      </div>
    `;
    return;
  }
  panel.innerHTML = `
    <div class="cloud-info">
      <h3>☁️ Cloud Storage - Terhubung ✅</h3>
      <p><strong>${credentials.name || '-'}</strong></p>
      <p style="font-size:12px;">${credentials.email || ''}</p>
      <div class="cloud-actions">
        <button class="btn btn-primary" onclick="syncToCloudFromApp()">📤 Sync ke Cloud</button>
        <button class="btn btn-primary" onclick="loadFromCloudToApp()">📥 Muat dari Cloud</button>
        <button class="btn btn-danger" onclick="logoutCloud()">🚪 Logout</button>
      </div>
      <div class="cloud-tips"><p><strong>💡 Tips</strong></p><ul><li>📤 Sync = kirim data lokal</li><li>📥 Muat = ambil data cloud</li><li>🔄 Auto Sync aktif</li></ul></div>
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
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${credentials.token}` },
      body: JSON.stringify({ userId: credentials.userId, token: credentials.token, transactions })
    });
    const data = await response.json();
    console.log('Sync response:', data);
    if (!response.ok) {
      showToast(`❌ ${data.error || 'Sync gagal'}`, 'error');
      return;
    }
    showToast(`✅ Synced! ${data.count} transaksi tersimpan`, 'success');
  } catch (error) {
    console.error(error);
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
      method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${credentials.token}` }
    });
    const data = await response.json();
    console.log('Load response:', data);
    if (!response.ok) {
      showToast(`❌ ${data.error || 'Load gagal'}`, 'error');
      return;
    }
    const cloudTransactions = Array.isArray(data.transactions) ? data.transactions : [];
    const localTransactions = getTransactions();
    const merged = mergeTransactions(localTransactions, cloudTransactions);
    saveTransactions(merged);
    showToast(`✅ Cloud berhasil dimuat! ${merged.length} transaksi`, 'success');
    renderHistory();
    renderRecap();
  } catch (error) {
    console.error('Load cloud error:', error);
    showToast(`❌ Load gagal: ${error.message}`, 'error');
  }
}

async function autoSyncToCloud() {
  const credentials = getCloudCredentials();
  if (!credentials) return;
  try {
    const transactions = getTransactions();
    await fetch(`${API_BASE_URL}/api/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${credentials.token}` },
      body: JSON.stringify({ userId: credentials.userId, token: credentials.token, transactions })
    });
  } catch (error) {
    console.log('Auto sync error:', error);
  }
}

function mergeTransactions(local, cloud) {
  const merged = new Map();
  cloud.forEach(transaction => merged.set(transaction.id, transaction));
  local.forEach(transaction => merged.set(transaction.id, transaction));
  return Array.from(merged.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function logoutCloud() {
  if (!confirm('Logout dari cloud? Data lokal tetap aman.')) return;
  localStorage.removeItem('cloud_credentials');
  localStorage.removeItem('cloud_userId');
  localStorage.removeItem('cloud_token');
  localStorage.removeItem('cloud_email');
  localStorage.removeItem('cloud_name');
  updateCloudStatus();
  renderCloudPanel();
  showToast('✅ Logout cloud berhasil', 'success');
}

function goToCloudPage() {
  window.location.href = './cloud.html';
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

window.addEventListener('DOMContentLoaded', () => {
  setTodayDate();
  updateCategories();
  renderHistory();
  renderRecap();
  renderCloudPanel();
  updateCloudStatus();
  const style = document.createElement('style');
  style.textContent = `
    .toast { position: fixed; bottom: -100px; left: 50%; transform: translateX(-50%); background: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-size: 14px; z-index: 10000; transition: bottom .3s ease; max-width: 400px; text-align: center; }
    .toast.show { bottom: 20px; }
    .toast-success { border-left: 4px solid #45a86b; color: #45a86b; }
    .toast-error { border-left: 4px solid #ef4444; color: #ef4444; }
    .toast-info { border-left: 4px solid #6d5dfc; color: #6d5dfc; }
    @media(max-width:600px) { .toast { max-width: calc(100% - 40px); font-size: 12px; padding: 12px 16px; } }
  `;
  document.head.appendChild(style);
});
