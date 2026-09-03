// ==========================================
// NEXA - CLIENT SECURITY HARDENING
// Validation helpers only
// ==========================================

(function () {
  const MAX_CATEGORY_LENGTH = 80;
  const MAX_DESCRIPTION_LENGTH = 500;
  const MAX_TRANSACTION_AMOUNT = 1_000_000_000_000_000;

  function validateTransactionInput(type, category, amount, date, description) {
    if (type !== 'income' && type !== 'expense') return '❌ Jenis transaksi tidak valid.';
    if (typeof category !== 'string' || !category.trim() || category.trim().length > MAX_CATEGORY_LENGTH) {
      return '❌ Kategori tidak valid.';
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TRANSACTION_AMOUNT) {
      return '❌ Jumlah transaksi tidak valid.';
    }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return '❌ Format tanggal tidak valid.';
    }

    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return '❌ Tanggal tidak valid.';
    }

    if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
      return '❌ Deskripsi terlalu panjang (maksimal 500 karakter).';
    }

    return null;
  }

  // Expose only the validation helper. Transaction CRUD and rendering
  // are owned by app.js, preventing duplicate/override implementations.
  window.validateTransactionInput = validateTransactionInput;
})();
