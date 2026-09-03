// ==========================================
// NEXA - CLIENT DATA ISOLATION
// ==========================================
// User-scoped local transaction storage.
// Authenticated: transactions:user:<userId>
// Offline:       transactions:offline
//
// Only the legacy "transactions" key is remapped. Other localStorage
// keys remain untouched.

(function () {
  'use strict';

  // Prevent duplicate interception if this script is accidentally loaded twice.
  if (window.__NEXA_DATA_ISOLATION_INSTALLED__) return;
  window.__NEXA_DATA_ISOLATION_INSTALLED__ = true;

  const LEGACY_KEY = 'transactions';
  const OFFLINE_KEY = 'transactions:offline';
  const USER_PREFIX = 'transactions:user:';
  const MIGRATION_VERSION = 'transactions_user_scope_migrated_v2';

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

  // Migrate a pre-isolation global transaction bucket once. Prefer an existing
  // scoped bucket so an already-isolated user's data can never be overwritten.
  try {
    const storage = window.localStorage;
    const userId = currentUserId();
    const migrated = nativeGetItem.call(storage, MIGRATION_VERSION);

    if (userId && !migrated) {
      const userKey = USER_PREFIX + userId;
      const scopedData = nativeGetItem.call(storage, userKey);
      const legacyData = nativeGetItem.call(storage, LEGACY_KEY);

      if (!scopedData && legacyData) {
        nativeSetItem.call(storage, userKey, legacyData);
      }

      // Remove the legacy global bucket after migration. It must never remain
      // available for accidental cross-user reads.
      nativeRemoveItem.call(storage, LEGACY_KEY);
      nativeSetItem.call(storage, MIGRATION_VERSION, '1');
    }
  } catch (error) {
    console.warn('Transaction storage migration skipped:', error);
  }

  window.NEXA_DATA_ISOLATION = Object.freeze({
    version: 2,
    getCurrentUserId: currentUserId,
    getTransactionStorageKey: scopedTransactionKey
  });
})();
