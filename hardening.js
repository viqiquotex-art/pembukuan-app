// ==========================================
// NEXA - CLIENT SECURITY HARDENING
// XSS-safe transaction rendering + input validation
// ==========================================

(function () {
  const MAX_CATEGORY_LENGTH = 80;
  const MAX_DESCRIPTION_LENGTH = 500;
  const MAX_TRANSACTION_AMOUNT = 1000000000000000;

  function getFieldValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function validateTransactionInput(type, category, amount, date, description) {
    if (type !== 'income' && type !== 'expense') return '❌ Jenis transaksi tidak valid.';
    if (typeof category !== 'string' || !category.trim() || category.length > MAX_CATEGORY_LENGTH) return '❌ Kategori tidak valid.';
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TRANSACTION_AMOUNT) return '❌ Jumlah transaksi tidak valid.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '❌ Format tanggal tidak valid.';
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return '❌ Tanggal tidak valid.';
    if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) return '❌ Deskripsi terlalu panjang (maksimal 500 karakter).';
    return null;
  }

  function buildTransactionFromForm() {
    const type = getFieldValue('type');
    const category = getFieldValue('category');
    const amount = Number.parseFloat(getFieldValue('amount'));
    const date = getFieldValue('date');
    const description = getFieldValue('description').trim();
    const error = validateTransactionInput(type, category, amount, date, description);
    if (error) {
      if (typeof showToast === 'function') showToast(error, 'error');
      return null;
    }
    return { type, category: category.trim(), amount, date, description };
  }

  window.addTransaction = function () {
    if (window.editingTransactionId) return window.updateTransaction();
    const form = buildTransactionFromForm();
    if (!form) return;
    const now = new Date().toISOString();
    const transaction = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      ...form,
      createdAt: now,
      updatedAt: now
    };
    const transactions = typeof getTransactions === 'function' ? getTransactions() : [];
    transactions.push(transaction);
    saveTransactions(transactions);
    const typeEl = document.getElementById('type');
    if (typeEl) typeEl.value = 'income';
    if (typeof updateCategories === 'function') updateCategories();
    const amountEl = document.getElementById('amount');
    const descriptionEl = document.getElementById('description');
    if (amountEl) amountEl.value = '';
    if (descriptionEl) descriptionEl.value = '';
    if (typeof setTodayDate === 'function') setTodayDate();
    if (typeof showToast === 'function') showToast('✅ Transaksi berhasil disimpan!', 'success');
    renderHistory();
    if (typeof isCloudConnected === 'function' && isCloudConnected() && typeof autoSyncToCloud === 'function') autoSyncToCloud();
  };

  window.updateTransaction = function () {
    const id = window.editingTransactionId;
    if (!id) return;
    const form = buildTransactionFromForm();
    if (!form) return;
    const transactions = typeof getTransactions === 'function' ? getTransactions() : [];
    const transaction = transactions.find(t => t && t.id === id);
    if (!transaction) {
      if (typeof showToast === 'function') showToast('❌ Transaksi tidak ditemukan', 'error');
      return;
    }
    Object.assign(transaction, form, { updatedAt: new Date().toISOString() });
    saveTransactions(transactions);
    if (typeof cancelEdit === 'function') cancelEdit();
    if (typeof showToast === 'function') showToast('✅ Transaksi berhasil diupdate!', 'success');
    renderHistory();
    if (typeof isCloudConnected === 'function' && isCloudConnected() && typeof autoSyncToCloud === 'function') autoSyncToCloud();
  };

  function makeText(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = String(text ?? '');
    return el;
  }

  window.renderHistory = function () {
    const transactions = typeof getTransactions === 'function' ? getTransactions() : [];
    const today = new Date().toISOString().split('T')[0];
    const todayTransactions = transactions.filter(t => t && t.date === today);
    const todayIncome = todayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const todayExpense = todayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const todayBalance = todayIncome - todayExpense;

    const statsEl = document.getElementById('todayStats');
    if (statsEl) {
      statsEl.replaceChildren();
      const cards = [
        ['income', 'Pemasukan Hari Ini', formatRupiah(todayIncome), `${todayTransactions.filter(t => t.type === 'income').length} transaksi`],
        ['expense', 'Pengeluaran Hari Ini', formatRupiah(todayExpense), `${todayTransactions.filter(t => t.type === 'expense').length} transaksi`],
        ['balance', 'Saldo Hari Ini', formatRupiah(todayBalance), 'Pemasukan - Pengeluaran']
      ];
      cards.forEach(([kind, title, amount, detail]) => {
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
      const timeText = transaction.createdAt && typeof formatTime === 'function' ? ` · ${formatTime(transaction.createdAt)}` : '';
      info.appendChild(makeText('div', 'transaction-date', `${dateText}${timeText}`));
      item.appendChild(info);

      item.appendChild(makeText('div', `transaction-amount ${isIncome ? 'income' : 'expense'}`, `${isIncome ? '+' : '-'}${formatRupiah(transaction.amount)}`));

      const actions = makeText('div', 'transaction-actions', '');
      const editButton = makeText('button', 'btn btn-info btn-small', '✏️ Edit');
      editButton.type = 'button';
      editButton.dataset.action = 'edit';
      editButton.dataset.transactionId = String(transaction.id || '');
      const deleteButton = makeText('button', 'btn btn-danger btn-small', '🗑️ Hapus');
      deleteButton.type = 'button';
      deleteButton.dataset.action = 'delete';
      deleteButton.dataset.transactionId = String(transaction.id || '');
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      item.appendChild(actions);
      listEl.appendChild(item);
    });

    listEl.onclick = function (event) {
      const button = event.target.closest('button[data-action][data-transaction-id]');
      if (!button || !listEl.contains(button)) return;
      const id = button.dataset.transactionId;
      if (!id) return;
      if (button.dataset.action === 'edit' && typeof enterEditMode === 'function') enterEditMode(id);
      if (button.dataset.action === 'delete' && typeof window.deleteTransaction === 'function') window.deleteTransaction(id);
    };
  };
})();
