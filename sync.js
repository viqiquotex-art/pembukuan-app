// ==========================================
// NEXA - RELIABLE TRANSACTION SYNC
// Single owner of delete + auto-sync orchestration
// ==========================================

(function () {
  let autoSyncTimer = null;
  let autoSyncRunning = false;
  let autoSyncQueued = false;

  function getActiveCredentials() {
    if (typeof isCloudConnected !== 'function' || !isCloudConnected()) return null;
    return typeof getCloudCredentials === 'function' ? getCloudCredentials() : null;
  }

  async function deleteTransaction(id) {
    if (!confirm('Yakin hapus transaksi ini?')) return;

    const credentials = getActiveCredentials();
    const transactions = typeof getTransactions === 'function' ? getTransactions() : [];
    const exists = transactions.some(t => t && t.id === id);

    if (!exists) {
      if (typeof showToast === 'function') showToast('❌ Transaksi tidak ditemukan', 'error');
      return;
    }

    // Tombstone is written before the local record is removed. This prevents a
    // later sync/load from resurrecting the transaction.
    if (typeof addLocalDeletedTransactionId === 'function') addLocalDeletedTransactionId(id);
    if (typeof saveTransactions === 'function') saveTransactions(transactions.filter(t => t && t.id !== id));
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof renderRecap === 'function') renderRecap();

    if (!credentials) {
      if (typeof showToast === 'function') showToast('✅ Transaksi dihapus dari perangkat', 'success');
      return;
    }

    try {
      if (typeof showToast === 'function') showToast('☁️ Menghapus transaksi dari cloud...', 'info');
      const url = `${API_BASE_URL}/api/transactions/${encodeURIComponent(credentials.userId)}/${encodeURIComponent(id)}`;
      const response = typeof authFetch === 'function'
        ? await authFetch(url, { method: 'DELETE' })
        : await fetch(url, { method: 'DELETE', credentials: 'include' });
      const data = typeof safeJson === 'function' ? await safeJson(response) : await response.json().catch(() => ({}));

      if (response.status === 401) {
        if (typeof handleAuthFailure === 'function') handleAuthFailure(data.error);
        else if (typeof showToast === 'function') showToast('⚠️ Session cloud sudah berakhir. Data tetap tersimpan lokal.', 'error');
        return;
      }
      if (response.status === 403) {
        if (typeof showToast === 'function') showToast('❌ Akses cloud ditolak. Data lokal tetap aman.', 'error');
        return;
      }
      if (!response.ok && response.status !== 404) throw new Error(data.error || 'Cloud delete gagal');
      if (typeof showToast === 'function') showToast('✅ Transaksi berhasil dihapus & tersinkron ke cloud', 'success');
    } catch (error) {
      console.error('Reliable delete sync error:', error);
      if (typeof showToast === 'function') showToast('⚠️ Terhapus lokal, tetapi cloud belum tersinkron. Coba Sync lagi.', 'error');
    }
  }

  function autoSyncToCloud() {
    if (!getActiveCredentials()) return;
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(async () => {
      if (autoSyncRunning) {
        autoSyncQueued = true;
        return;
      }
      autoSyncRunning = true;
      try {
        if (typeof syncToCloud === 'function') await syncToCloud();
      } finally {
        autoSyncRunning = false;
        if (autoSyncQueued) {
          autoSyncQueued = false;
          autoSyncToCloud();
        }
      }
    }, 700);
  }

  window.deleteTransaction = deleteTransaction;
  window.autoSyncToCloud = autoSyncToCloud;
})();
