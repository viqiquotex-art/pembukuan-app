// ==========================================
// NEXA - RELIABLE TRANSACTION SYNC
// Single owner of delete + auto-sync orchestration
// ==========================================

(function () {
  let autoSyncTimer = null;
  let autoSyncRunning = false;
  let autoSyncQueued = false;
  const DELETE_QUEUE_PREFIX = 'pendingCloudDeletes:';

  function getActiveCredentials() {
    if (typeof isCloudConnected !== 'function' || !isCloudConnected()) return null;
    return typeof getCloudCredentials === 'function' ? getCloudCredentials() : null;
  }

  function getDeleteQueueKey(userId) {
    return `${DELETE_QUEUE_PREFIX}${userId}`;
  }

  function getPendingCloudDeletes(userId) {
    if (!userId) return new Set();
    try {
      const raw = localStorage.getItem(getDeleteQueueKey(userId));
      const ids = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function savePendingCloudDeletes(userId, ids) {
    if (!userId) return;
    localStorage.setItem(getDeleteQueueKey(userId), JSON.stringify(Array.from(ids)));
  }

  function queueCloudDelete(userId, id) {
    if (!userId || !id) return;
    const queue = getPendingCloudDeletes(userId);
    queue.add(id);
    savePendingCloudDeletes(userId, queue);
  }

  function removeQueuedCloudDelete(userId, id) {
    if (!userId || !id) return;
    const queue = getPendingCloudDeletes(userId);
    queue.delete(id);
    savePendingCloudDeletes(userId, queue);
  }

  async function deleteFromCloud(userId, id) {
    const url = `${API_BASE_URL}/api/transactions/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`;
    const response = typeof authFetch === 'function'
      ? await authFetch(url, { method: 'DELETE' })
      : await fetch(url, { method: 'DELETE', credentials: 'include' });
    const data = typeof safeJson === 'function' ? await safeJson(response) : await response.json().catch(() => ({}));

    if (response.status === 401) {
      if (typeof handleAuthFailure === 'function') handleAuthFailure(data.error);
      return false;
    }
    if (response.status === 403) {
      if (typeof showToast === 'function') showToast('❌ Akses cloud ditolak. Data lokal tetap aman.', 'error');
      return false;
    }
    if (!response.ok && response.status !== 404) throw new Error(data.error || 'Cloud delete gagal');
    return true;
  }

  async function retryPendingCloudDeletes() {
    const credentials = getActiveCredentials();
    if (!credentials?.userId) return 0;
    const queue = getPendingCloudDeletes(credentials.userId);
    if (!queue.size) return 0;

    let completed = 0;
    for (const id of Array.from(queue)) {
      try {
        const success = await deleteFromCloud(credentials.userId, id);
        if (success) {
          removeQueuedCloudDelete(credentials.userId, id);
          completed += 1;
        } else if (!isCloudConnected()) {
          break;
        }
      } catch (error) {
        console.error('Pending cloud delete retry error:', error);
      }
    }
    return completed;
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

    // Queue first. A successful request removes the queue entry; a network
    // failure leaves it pending for the next sync, so cloud deletion is retryable.
    queueCloudDelete(credentials.userId, id);

    try {
      if (typeof showToast === 'function') showToast('☁️ Menghapus transaksi dari cloud...', 'info');
      const success = await deleteFromCloud(credentials.userId, id);
      if (success) {
        removeQueuedCloudDelete(credentials.userId, id);
        if (typeof showToast === 'function') showToast('✅ Transaksi berhasil dihapus & tersinkron ke cloud', 'success');
      } else if (isCloudConnected()) {
        if (typeof showToast === 'function') showToast('⚠️ Penghapusan cloud tertunda. Akan dicoba lagi saat Sync.', 'error');
      }
    } catch (error) {
      console.error('Reliable delete sync error:', error);
      if (typeof showToast === 'function') showToast('⚠️ Terhapus lokal, cloud tertunda. Akan dicoba lagi saat Sync.', 'error');
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
        await retryPendingCloudDeletes();
        if (typeof syncToCloud === 'function' && getActiveCredentials()) await syncToCloud();
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
  window.retryPendingCloudDeletes = retryPendingCloudDeletes;
})();
