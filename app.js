// ==========================================
// PEMBUKUAN APP - MAIN APP
// Single source of truth for UI + transaction logic
// Cloud/auth logic lives in cloud.js
// Delete sync logic lives in sync.js
// ==========================================

const INCOME_CATEGORIES = ['Gaji/Upah', 'Freelance', 'Investasi', 'Bonus', 'Penjualan', 'Lainnya'];
const EXPENSE_CATEGORIES = ['Makanan', 'Transportasi', 'Belanja', 'Hiburan', 'Kesehatan', 'Listrik/Internet', 'Sewa', 'Lainnya'];

const MAX_CATEGORY_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TRANSACTION_AMOUNT = 1_000_000_000_000_000;

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
  localStorage.setItem('transactions', JSON.stringify(Array.isArray(transactions) ? transactions : []));
}

function updateCloudStatus() {
  const badge = document.getElementById('cloudStatusBadge');
  if (!badge) return;
  const credentials = typeof getCloudCredentials === 'function' ? getCloudCredentials() : null;
  if (credentials) {
    badge.textContent = `☁️ Cloud: ${credentials.name || credentials.email || 'Connected'}`;
    badge.classList.add('connected');
  } else {
    badge.textContent = '⚫ Offline Mode';
    badge.classList.remove('connected');
  }
}

function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(amount) || 0);
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
  const allowedTabs = ['input', 'history', 'recap', 'cloud', 'admin'];
  if (!allowedTabs.includes(tabName)) return;
  if (tabName === 'admin' && typeof window.isAdminAuthorized === 'function' && !window.isAdminAuthorized()) {
    if (typeof showToast === 'function') showToast('🔒 Akses Admin ditolak. Gunakan akun administrator.', 'error');
    return;
  }
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const tabContent = document.getElementById(tabName);
  if (tabContent) tabContent.classList.add('active');
  const activeButton = document.querySelector(`.tab-btn[data-tab="${CSS.escape(tabName)}"]`);
  if (activeButton) activeButton.classList.add('active');
  if (tabName === 'history') renderHistory();
  if (tabName === 'recap') renderRecap();
  if (tabName === 'cloud' && typeof renderCloudPanel === 'function') renderCloudPanel();
  if (tabName === 'admin' && typeof window.loadAdminPanel === 'function') window.loadAdminPanel();
}

function updateCategories() {
  const typeEl = document.getElementById('type');
  const categorySelect = document.getElementById('category');
  if (!typeEl || !categorySelect) return;
  const categories = typeEl.value === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  categorySelect.replaceChildren();
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

function setTodayDate() {
  const dateEl = document.getElementById('date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
}

function validateTransactionInput(type, category, amount, date, description) {
  if (type !== 'income' && type !== 'expense') return '❌ Jenis transaksi tidak valid.';
  if (typeof category !== 'string' || !category.trim() || category.trim().length > MAX_CATEGORY_LENGTH) return '❌ Kategori tidak valid.';
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TRANSACTION_AMOUNT) return '❌ Jumlah transaksi tidak valid.';
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '❌ Format tanggal tidak valid.';
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return '❌ Tanggal tidak valid.';
  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) return '❌ Deskripsi terlalu panjang (maksimal 500 karakter).';
  return null;
}

function getFormTransaction() {
  const typeEl = document.getElementById('type');
  const categoryEl = document.getElementById('category');
  const amountEl = document.getElementById('amount');
  const dateEl = document.getElementById('date');
  const descriptionEl = document.getElementById('description');
  if (!typeEl || !categoryEl || !amountEl || !dateEl || !descriptionEl) return { error: '❌ Form transaksi tidak lengkap.' };
  const type = typeEl.value;
  const category = categoryEl.value.trim();
  const amount = Number(String(amountEl.value).replace(/\D/g, '')) || 0;
  const date = dateEl.value;
  const description = descriptionEl.value.trim();
  const error = validateTransactionInput(type, category, amount, date, description);
  return error ? { error } : { value: { type, category, amount, date, description } };
}

function enterEditMode(id) {
  const transaction = getTransactions().find(t => t && t.id === id);
  if (!transaction) return showToast('❌ Transaksi tidak ditemukan', 'error');
  document.getElementById('type').value = transaction.type;
  updateCategories();
  document.getElementById('category').value = transaction.category;
  document.getElementById('amount').value = Number(transaction.amount || 0).toLocaleString('id-ID');
  document.getElementById('date').value = transaction.date;
  document.getElementById('description').value = transaction.description || '';
  window.editingTransactionId = id;
  const banner = document.getElementById('editModeBanner');
  const formTitle = document.getElementById('formTitle');
  const submitBtn = document.getElementById('submitBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  if (banner) banner.style.display = 'flex';
  if (formTitle) formTitle.textContent = '✏️ Edit Transaksi';
  if (submitBtn) submitBtn.innerHTML = '<span>✓</span><span>Update Transaksi</span>';
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
  if (formTitle) formTitle.textContent = 'Tambah Transaksi';
  if (submitBtn) submitBtn.innerHTML = '<span>✓</span><span>Simpan Transaksi</span>';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function addTransaction() {
  if (window.editingTransactionId) return updateTransaction();
  const form = getFormTransaction();
  if (form.error) return showToast(form.error, 'error');
  const now = new Date().toISOString();
  const transaction = { id: `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`, ...form.value, createdAt: now, updatedAt: now };
  const transactions = getTransactions();
  transactions.push(transaction);
  saveTransactions(transactions);
  cancelEdit();
  showToast('✅ Transaksi berhasil disimpan!', 'success');
  renderHistory();
  if (typeof isCloudConnected === 'function' && isCloudConnected() && typeof autoSyncToCloud === 'function') autoSyncToCloud();
}

function updateTransaction() {
  const id = window.editingTransactionId;
  if (!id) return;
  const form = getFormTransaction();
  if (form.error) return showToast(form.error, 'error');
  const transactions = getTransactions();
  const transaction = transactions.find(t => t && t.id === id);
  if (!transaction) return showToast('❌ Transaksi tidak ditemukan', 'error');
  Object.assign(transaction, form.value, { updatedAt: new Date().toISOString() });
  saveTransactions(transactions);
  cancelEdit();
  showToast('✅ Transaksi berhasil diupdate!', 'success');
  renderHistory();
  if (typeof isCloudConnected === 'function' && isCloudConnected() && typeof autoSyncToCloud === 'function') autoSyncToCloud();
}

function makeText(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = String(text ?? '');
  return el;
}

function renderHistory() {
  const transactions = getTransactions();
  const today = new Date().toISOString().split('T')[0];
  const todayTransactions = transactions.filter(t => t && t.date === today);
  const todayIncome = todayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const todayExpense = todayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const todayBalance = todayIncome - todayExpense;
  const statsEl = document.getElementById('todayStats');
  if (statsEl) {
    statsEl.replaceChildren();
    [['income', 'Pemasukan Hari Ini', formatRupiah(todayIncome), `${todayTransactions.filter(t => t.type === 'income').length} transaksi`], ['expense', 'Pengeluaran Hari Ini', formatRupiah(todayExpense), `${todayTransactions.filter(t => t.type === 'expense').length} transaksi`], ['balance', 'Saldo Hari Ini', formatRupiah(todayBalance), 'Pemasukan - Pengeluaran']].forEach(([kind, title, amount, detail]) => {
      const card = makeText('div', `stat-card ${kind}`, '');
      card.appendChild(makeText('h3', '', title));
      card.appendChild(makeText('div', 'amount', amount));
      card.appendChild(makeText('div', 'detail', detail));
      statsEl.appendChild(card);
    });
  }
  const listEl = document.getElementById('transactionList');
  if (!listEl) return;
  listEl.replaceChildren();
  const sorted = transactions.filter(t => t && typeof t === 'object').slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!sorted.length) {
    const empty = makeText('div', 'empty-state', '');
    empty.appendChild(makeText('h3', '', 'Tidak ada transaksi'));
    empty.appendChild(makeText('p', '', 'Mulai tambahkan transaksi di tab "Input Transaksi"'));
    listEl.appendChild(empty);
    listEl.onclick = null;
    return;
  }
  sorted.forEach(transaction => {
    const isIncome = transaction.type === 'income';
    const item = makeText('div', 'transaction-item', '');
    const info = makeText('div', 'transaction-info', '');
    info.appendChild(makeText('div', 'transaction-category', `${isIncome ? '📬' : '📭'} ${transaction.category || '-'}`));
    info.appendChild(makeText('div', 'transaction-desc', transaction.description || '-'));
    const dateText = typeof formatDate === 'function' ? formatDate(transaction.date) : transaction.date;
    const timeText = transaction.createdAt ? ` · ${formatTime(transaction.createdAt)}` : '';
    info.appendChild(makeText('div', 'transaction-date', `${dateText}${timeText}`));
    item.appendChild(info);
    item.appendChild(makeText('div', `transaction-amount ${isIncome ? 'income' : 'expense'}`, `${isIncome ? '+' : '-'}${formatRupiah(transaction.amount)}`));
    const actions = makeText('div', 'transaction-actions', '');
    const editButton = makeText('button', 'btn btn-info btn-small', '✏️ Edit');
    editButton.type = 'button'; editButton.dataset.action = 'edit'; editButton.dataset.transactionId = String(transaction.id || '');
    const deleteButton = makeText('button', 'btn btn-danger btn-small', '🗑️ Hapus');
    deleteButton.type = 'button'; deleteButton.dataset.action = 'delete'; deleteButton.dataset.transactionId = String(transaction.id || '');
    actions.appendChild(editButton); actions.appendChild(deleteButton); item.appendChild(actions); listEl.appendChild(item);
  });
  listEl.onclick = function (event) {
    const button = event.target.closest('button[data-action][data-transaction-id]');
    if (!button || !listEl.contains(button)) return;
    const id = button.dataset.transactionId; if (!id) return;
    if (button.dataset.action === 'edit') enterEditMode(id);
    else if (button.dataset.action === 'delete' && typeof window.deleteTransaction === 'function') window.deleteTransaction(id);
  };
}

function renderRecap() {
  const transactions = getTransactions();
  const grid = document.getElementById('recapGrid');
  if (!grid) return;
  if (!transactions.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h3>Tidak ada data untuk direkap</h3><p>Tambahkan transaksi terlebih dahulu</p></div>'; return; }
  const monthlyData = {};
  transactions.forEach(transaction => {
    const date = new Date(transaction.date); if (isNaN(date.getTime())) return;
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0 };
    const amount = Number(transaction.amount || 0);
    if (transaction.type === 'income') monthlyData[monthKey].income += amount;
    if (transaction.type === 'expense') monthlyData[monthKey].expense += amount;
  });
  const sortedMonths = Object.keys(monthlyData).sort().reverse(); grid.replaceChildren();
  sortedMonths.forEach(monthKey => {
    const monthDate = new Date(`${monthKey}-01T00:00:00`); const monthName = monthDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    const data = monthlyData[monthKey]; const balance = data.income - data.expense;
    const card = makeText('div', 'month-card', ''); card.appendChild(makeText('h3', '', monthName));
    const incomeRow = makeText('div', 'recap-row income', ''); incomeRow.appendChild(makeText('span', 'label', '💰 Pemasukan')); incomeRow.appendChild(makeText('span', 'value', formatRupiah(data.income))); card.appendChild(incomeRow);
    const expenseRow = makeText('div', 'recap-row expense', ''); expenseRow.appendChild(makeText('span', 'label', '💸 Pengeluaran')); expenseRow.appendChild(makeText('span', 'value', formatRupiah(data.expense))); card.appendChild(expenseRow);
    const totalRow = makeText('div', 'recap-row total', ''); totalRow.appendChild(makeText('span', 'label', '📊 Saldo')); totalRow.appendChild(makeText('span', `value ${balance >= 0 ? 'income' : 'expense'}`, formatRupiah(balance))); card.appendChild(totalRow); grid.appendChild(card);
  });
}

function goToCloudPage() { window.location.assign('./cloud.html'); }

function renderCloudPanel() {
  const credentials = typeof getCloudCredentials === 'function' ? getCloudCredentials() : null;
  const panel = document.getElementById('cloudPanel'); if (!panel) return;
  if (!credentials) {
    panel.innerHTML = `<div class="cloud-info"><h3>☁️ Cloud Storage - Offline</h3><p>Sinkronisasi data Anda ke cloud untuk akses di berbagai device dan backup data.</p><a class="btn btn-primary" href="./cloud.html">🔑 Login / Daftar Cloud</a><div class="cloud-tips" style="margin-top:20px;"><p><strong>Mengapa pakai cloud?</strong></p><ul><li>💾 Backup data</li><li>📱 Akses berbagai device</li><li>🔄 Sinkronisasi</li><li>🔒 Data tersimpan di cloud</li></ul></div></div>`; return;
  }
  const safeName = escapeHtml(credentials.name || '-'); const safeEmail = escapeHtml(credentials.email || '');
  panel.innerHTML = `<div class="cloud-info"><h3>☁️ Cloud Storage - Terhubung ✅</h3><p><strong>${safeName}</strong></p><p style="font-size:12px;">${safeEmail}</p><div class="cloud-actions"><button class="btn btn-primary" onclick="syncToCloudFromApp()">📤 Sync ke Cloud</button><button class="btn btn-primary" onclick="loadFromCloudToApp()">📥 Muat dari Cloud</button><button class="btn btn-danger" onclick="logoutCloud()">🚪 Logout</button></div><div class="cloud-tips"><p><strong>💡 Tips</strong></p><ul><li>📤 Sync = kirim data lokal</li><li>📥 Muat = ambil data cloud</li><li>🔄 Auto Sync aktif</li></ul></div></div>`;
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>\'\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast'); if (existing) existing.remove();
  const toast = document.createElement('div'); toast.className = `toast toast-${type}`; toast.textContent = message; document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

window.addEventListener('DOMContentLoaded', () => {
  setTodayDate(); updateCategories(); renderHistory(); renderRecap(); renderCloudPanel(); updateCloudStatus();
  const style = document.createElement('style');
  style.textContent = `.toast { position: fixed; bottom: -100px; left: 50%; transform: translateX(-50%); background: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.15); font-size: 14px; z-index: 10000; transition: bottom .3s ease; max-width: 400px; text-align: center; } .toast.show { bottom: 20px; } .toast-success { border-left: 4px solid #45a86b; color: #45a86b; } .toast-error { border-left: 4px solid #ef4444; color: #ef4444; } .toast-info { border-left: 4px solid #6d5dfc; color: #6d5dfc; } @media(max-width:600px) { .toast { max-width: calc(100% - 40px); font-size: 12px; padding: 12px 16px; } }`;
  document.head.appendChild(style);
});