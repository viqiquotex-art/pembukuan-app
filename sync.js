// ==========================================
// NEXA - RELIABLE TRANSACTION DELETE SYNC
// ==========================================

(function () {
  window.deleteTransaction = async function (id) {
    if (!confirm('Yakin hapus transaksi ini?')) return;

    const credentials = typeof getCloudCredentials === 'function'
      ? getCloudCredentials()
      : null;

    const transactions = typeof getTransactions === 'function'
      ? getTransactions()
      : [];

    const exists = transactions.some(t => t.id === id);
    if (!exists) {
      if (typeof showToast === 'function') {
        showToast('❌ Transaksi tidak ditemukan', 'error');
      }
      return;
    }

    // Tandai sebagai terhapus SEBELUM request cloud.
    // Ini mencegah transaksi lama muncul kembali saat sync/load.
    if (typeof addLocalDeletedTransactionId === 'function') {
      addLocalDeletedTransactionId(id);
    }

    // Hapus lokal terlebih dahulu agar UI langsung responsif.
    const remaining = transactions.filter(t => t.id !== id);
    saveTransactions(remaining);
    renderHistory();
    renderRecap();

    if (!credentials) {
      showToast('✅ Transaksi dihapus dari perangkat', 'success');
      return;
    }

    try {
      showToast('☁️ Menghapus transaksi dari cloud...', 'info');

      const response = await fetch(
        `${API_BASE_URL}/api/transactions/${encodeURIComponent(credentials.userId)}/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${credentials.token}`
          }
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        showToast('⚠️ Session cloud sudah berakhir. Data tetap tersimpan lokal.', 'error');
        return;
      }

      // 404 berarti transaksi memang sudah tidak ada di cloud.
      if (!response.ok && response.status !== 404) {
        throw new Error(data.error || 'Cloud delete gagal');
      }

      showToast('✅ Transaksi berhasil dihapus & tersinkron ke cloud', 'success');
    } catch (error) {
      console.error('Reliable delete sync error:', error);
      showToast('⚠️ Terhapus lokal, tetapi cloud belum tersinkron. Coba Sync lagi.', 'error');
    }
  };
})();
