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
  document.getElementById(tabName).classList.add('active');
  event.target.classList.add('active');

  // Refresh data when switching tabs
  if (tabName === 'history') {
    renderHistory();
  } else if (tabName === 'recap') {
    renderRecap();
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
// ADD TRANSACTION
// ==========================================

function addTransaction() {
  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const date = document.getElementById('date').value;
  const description = document.getElementById('description').value;

  // Validation
  if (!amount || amount <= 0) {
    alert('Masukkan jumlah yang valid');
    return;
  }
  if (!date) {
    alert('Pilih tanggal');
    return;
  }

  // Create transaction object
  const transaction = {
    id: Date.now(),
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

  alert('✅ Transaksi berhasil disimpan!');
  renderHistory();
}

// ==========================================
// DELETE TRANSACTION
// ==========================================

function deleteTransaction(id) {
  if (!confirm('Yakin hapus transaksi ini?')) return;
  
  let transactions = getTransactions();
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions(transactions);
  
  renderHistory();
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
          <button class="btn btn-danger btn-small" onclick="deleteTransaction(${t.id})">Hapus</button>
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
    const [year, month] = monthKey.split('-');
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
// INIT ON PAGE LOAD
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
  setTodayDate();
  updateCategories();
  renderHistory();
});