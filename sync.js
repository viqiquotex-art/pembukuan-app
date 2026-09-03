// ==========================================
// NEXA - RELIABLE TRANSACTION DELETE SYNC
// Single owner of transaction deletion
// ==========================================

(function () {
  async function deleteTransaction(id) {
    if (!confirm('Yakin hapus transaksi ini?')) return;

    const credentials = typeof getCloudCredentials === 'function' ? getCloudCredentials() : null;
    const transactions = typeof getTransactions === 'function' ? getTransactions() : [];
    const exists = transactions.some(t => t && t.id === id);

    if (!exists) {
      if (typeof showToast === 'function') showToast('❌ Transaksi tidak ditemukan', 'error');
      return;
    }

    if (typeof addLocalDeletedTransactionId === 'function') {
      addLocalDeletedTransactionId(id);
    }

    saveTransactions(transactions.filter(t => t && t.id !== id));
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof renderRecap === 'function') renderRecap();

    if (!credentials) {
      showToast('✅ Transaksi dihapus dari perangkat', 'success');
      return;
    }

    try {
      showToast('☁️ Menghapus transaksi dari cloud...', 'info');
      const response = await fetch(
        `${API_BASE_URL}/api/transactions/${encodeURIComponent(credentials.userId)}/${encodeURIComponent(id)}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        showToast('⚠️ Session cloud sudah berakhir. Data tetap tersimpan lokal.', 'error');
        return;
      }

      if (!response.ok && response.status !== 404) {
        throw new Error(data.error || 'Cloud delete gagal');
      }

      showToast('✅ Transaksi berhasil dihapus & tersinkron ke cloud', 'success');
    } catch (error) {
      console.error('Reliable delete sync error:', error);
      showToast('⚠️ Terhapus lokal, tetapi cloud belum tersinkron. Coba Sync lagi.', 'error');
    }
  }

  // Delete is intentionally owned by sync.js because local deletion must
  // always register a tombstone before attempting the cloud deletion.
  window.deleteTransaction = deleteTransaction;
})();
