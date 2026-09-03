// ==========================================
// NEXA - CLIENT DATA ISOLATION
// ==========================================
// Keeps the existing app/cloud code compatible while making the
// local transaction store user-scoped. The app may continue to use
// localStorage.getItem('transactions'), but the physical key is:
//   transactions:user:<userId>  -> authenticated user
//   transactions:offline        -> unauthenticated/offline bucket
//
// IMPORTANT: Only the exact legacy key "transactions" is remapped.
// Credentials, sync snapshots, tombstones, and other localStorage
// keys keep their existing behavior.

(function () {
  'use strict';

  const LEGACY_KEY = 'transactions';
  const OFFLINE_KEY = 'transactions:offline';
  const USER_PREFIX = 'transactions:user:';
  const MIGRATION_KEY = 'transactions_user_scope_migrated_v1';

  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  function isLocalStorage(storage) {
    try {
      return storage === window.localStorage;
    } catch (_) {
      return false;
    }
  }

  function currentUserId() {
    try {
      return nativeGetItem.call(window.localStorage, 'cloud_userId') || '';
    } catch (_) {
      return '';
    }
  }

  function scopedTransactionKey() {
    const userId = currentUserId();
    return userId ? USER_PREFIX + userId : OFFLINE_KEY;
  }

  // Intercept only the transaction key so existing application code does not
  // need to be rewritten throughout app.js, cloud.js, and sync.js.
  Storage.prototype.getItem = function (key) {
    if (isLocalStorage(this) && key === LEGACY_KEY) {
      return nativeGetItem.call(this, scopedTransactionKey());
    }
    return nativeGetItem.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (isLocalStorage(this) && key === LEGACY_KEY) {
      return nativeSetItem.call(this, scopedTransactionKey(), value);
    }
    return nativeSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key) {
    if (isLocalStorage(this) && key === LEGACY_KEY) {
      return nativeRemoveItem.call(this, scopedTransactionKey());
    }
    return nativeRemoveItem.call(this, key);
  };

  // One-time migration of an old global transaction bucket.
  // It is imported only for the currently authenticated user, and only when
  // that user's scoped bucket does not already exist.
  try {
    const storage = window.localStorage;
    const userId = currentUserId();
    const migrated = nativeGetItem.call(storage, MIGRATION_KEY);

    if (userId && !migrated) {
      const userKey = USER_PREFIX + userId;
      const scopedData = nativeGetItem.call(storage, userKey);
      const legacyData = nativeGetItem.call(storage, LEGACY_KEY);

      if (!scopedData && legacyData) {
        nativeSetItem.call(storage, userKey, legacyData);
      }

      nativeRemoveItem.call(storage, LEGACY_KEY);
      nativeSetItem.call(storage, MIGRATION_KEY, '1');
    }
  } catch (error) {
    console.warn('Transaction storage migration skipped:', error);
  }

  window.NEXA_DATA_ISOLATION = Object.freeze({
    version: 1,
    getCurrentUserId: currentUserId,
    getTransactionStorageKey: scopedTransactionKey
  });
})();
