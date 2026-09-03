// ==========================================
// NEXA - RELIABLE TRANSACTION SYNC
// Single owner of delete + auto-sync orchestration
// ==========================================

(function () {
  let autoSyncTimer = null;
  let autoSyncRunning = false;
  let autoSyncQueued = false;
  const DELETE_QUEUE_PREFIX = 'pendingCloudDeletes:';
  const initialCloudUserId = localStorage.getItem('cloud_userId');
  let sessionWasAuthenticated = !!initialCloudUserId;
  let sessionReloaded = false;

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
    if (!credentials?.userId) return { completed: 0, pending: 0, authFailed: false };
    const queue = getPendingCloudDeletes(credentials.userId);
    if (!queue.size) return { completed: 0, pending: 0, authFailed: false };

    let completed = 0;
    let authFailed = false;
    for (const id of Array.from(queue)) {
      try {
        const success = await deleteFromCloud(credentials.userId, id);
        if (success) {
          removeQueuedCloudDelete(credentials.userId, id);
          completed += 1;
        } else if (!isCloudConnected()) {
          authFailed = true;
          break;
        }
      } catch (error) {
        console.error('Pending cloud delete retry error:', error);
      }
    }
    return {
      completed,
      pending: getPendingCloudDeletes(credentials.userId).size,
      authFailed
    };
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

    // Tombstone is written before local removal so a later cloud load cannot
    // resurrect the transaction while the delete is waiting for cloud retry.
    if (typeof addLocalDeletedTransactionId === 'function') addLocalDeletedTransactionId(id);
    if (typeof saveTransactions === 'function') saveTransactions(transactions.filter(t => t && t.id !== id));
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof renderRecap === 'function') renderRecap();

    if (!credentials) {
      if (typeof showToast === 'function') showToast('✅ Transaksi dihapus dari perangkat', 'success');
      return;
    }

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

  // Wrap the original cloud sync so the pending-delete queue is flushed on
  // BOTH manual Sync and automatic Sync. This closes the previous gap where
  // only autoSync retried deletions.
  const originalSyncToCloud = window.syncToCloud;
  if (typeof originalSyncToCloud === 'function') {
    window.syncToCloud = async function (...args) {
      const retryResult = await retryPendingCloudDeletes();
      if (retryResult.authFailed) return false;
      return originalSyncToCloud.apply(this, args);
    };
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
        if (typeof window.syncToCloud === 'function' && getActiveCredentials()) {
          await window.syncToCloud();
        }
      } finally {
        autoSyncRunning = false;
        if (autoSyncQueued) {
          autoSyncQueued = false;
          autoSyncToCloud();
        }
      }
    }, 700);
  }

  // If an authenticated session is invalidated by a 401 inside cloud.js,
  // cloud.js clears the credentials but previously left the old user's data
  // rendered in memory. Reloading switches hardening.js back to the offline
  // bucket and prevents the stale authenticated UI from remaining visible.
  if (sessionWasAuthenticated) {
    const sessionGuard = setInterval(() => {
      if (sessionReloaded) {
        clearInterval(sessionGuard);
        return;
      }
      const currentUserId = localStorage.getItem('cloud_userId');
      if (!currentUserId && sessionWasAuthenticated) {
        sessionReloaded = true;
        clearInterval(sessionGuard);
        location.reload();
        return;
      }
      if (currentUserId && currentUserId !== initialCloudUserId) {
        sessionWasAuthenticated = true;
      }
    }, 1000);
  }

  window.deleteTransaction = deleteTransaction;
  window.autoSyncToCloud = autoSyncToCloud;
  window.retryPendingCloudDeletes = retryPendingCloudDeletes;
})();
