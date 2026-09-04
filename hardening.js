// ==========================================
// NEXA - CLIENT DATA + SECURITY HARDENING
// ==========================================
// User-scoped local transaction storage plus runtime compatibility fixes.
// Authentication still uses the Worker's HttpOnly session cookie as the
// preferred transport. Any legacy cloud token is migrated out of persistent
// localStorage into sessionStorage for the lifetime of the browser tab.

(function () {
  'use strict';

  if (window.__NEXA_DATA_ISOLATION_INSTALLED__) return;
  window.__NEXA_DATA_ISOLATION_INSTALLED__ = true;

  const LEGACY_KEY = 'transactions';
  const OFFLINE_KEY = 'transactions:offline';
  const USER_PREFIX = 'transactions:user:';
  const MIGRATION_VERSION = 'transactions_user_scope_migrated_v3';
  const TOKEN_KEY = 'cloud_token';
  const PROTECTED_TABS = new Set(['kasir', 'input', 'history', 'recap']);
  const AUTH_PAGE = './cloud.html';

  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  function isLocalStorage(storage) { try { return storage === window.localStorage; } catch (_) { return false; } }
  function currentUserId() { try { return nativeGetItem.call(window.localStorage, 'cloud_userId') || ''; } catch (_) { return ''; } }
  function scopedTransactionKey() { const userId = currentUserId(); return userId ? USER_PREFIX + userId : OFFLINE_KEY; }

  Storage.prototype.getItem = function (key) {
    if (isLocalStorage(this) && key === LEGACY_KEY) return nativeGetItem.call(this, scopedTransactionKey());
    if (isLocalStorage(this) && key === TOKEN_KEY) { try { return nativeGetItem.call(window.sessionStorage, TOKEN_KEY); } catch (_) { return null; } }
    return nativeGetItem.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    if (isLocalStorage(this) && key === LEGACY_KEY) return nativeSetItem.call(this, scopedTransactionKey(), value);
    if (isLocalStorage(this) && key === TOKEN_KEY) { try { return nativeSetItem.call(window.sessionStorage, TOKEN_KEY, String(value)); } catch (_) { return; } }
    return nativeSetItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    if (isLocalStorage(this) && key === LEGACY_KEY) return nativeRemoveItem.call(this, scopedTransactionKey());
    if (isLocalStorage(this) && key === TOKEN_KEY) { try { nativeRemoveItem.call(window.sessionStorage, TOKEN_KEY); } catch (_) {} try { nativeRemoveItem.call(window.localStorage, TOKEN_KEY); } catch (_) {} return; }
    return nativeRemoveItem.call(this, key);
  };

  try {
    const storage = window.localStorage, userId = currentUserId(), migrated = nativeGetItem.call(storage, MIGRATION_VERSION);
    if (userId && !migrated) {
      const userKey = USER_PREFIX + userId, scopedData = nativeGetItem.call(storage, userKey), legacyData = nativeGetItem.call(storage, LEGACY_KEY);
      if (!scopedData && legacyData) nativeSetItem.call(storage, userKey, legacyData);
      nativeRemoveItem.call(storage, LEGACY_KEY); nativeSetItem.call(storage, MIGRATION_VERSION, '1');
    }
    const legacyToken = nativeGetItem.call(storage, TOKEN_KEY);
    if (legacyToken) { try { nativeSetItem.call(window.sessionStorage, TOKEN_KEY, legacyToken); } catch (_) {} nativeRemoveItem.call(storage, TOKEN_KEY); }
  } catch (error) { console.warn('Client hardening migration skipped:', error); }

  function isAuthenticated() {
    try {
      if (typeof window.isCloudConnected === 'function') return window.isCloudConnected();
      return !!currentUserId();
    } catch (_) { return !!currentUserId(); }
  }

  function redirectToAuth(tabName) {
    const target = String(tabName || '').toLowerCase();
    try { sessionStorage.setItem('nexa_auth_return_tab', target); } catch (_) {}
    if (typeof window.showToast === 'function') {
      window.showToast('🔒 Login/Register diperlukan untuk membuka fitur ini.', 'error');
      setTimeout(() => { window.location.href = AUTH_PAGE; }, 350);
    } else {
      window.location.href = AUTH_PAGE;
    }
  }

  function updateProtectedNavigation() {
    const locked = !isAuthenticated();
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      const tab = btn.dataset.tab;
      if (!PROTECTED_TABS.has(tab)) return;
      const label = btn.querySelector('span:last-child');
      if (!label) return;
      const original = label.dataset.originalLabel || label.textContent;
      label.dataset.originalLabel = original;
      label.textContent = locked ? `🔒 ${original.replace(/^🔒\s*/, '')}` : original.replace(/^🔒\s*/, '');
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
      btn.title = locked ? 'Login/Register untuk membuka' : '';
    });

    document.querySelectorAll('.hub-card').forEach(card => {
      const onclick = card.getAttribute('onclick') || '';
      const match = onclick.match(/switchTab\(['"](kasir|recap)['"]\)/);
      if (!match) return;
      const target = match[1];
      const arrow = card.querySelector('.hub-arrow');
      if (arrow) arrow.textContent = locked ? '🔒 Login / Register untuk membuka →' : (target === 'kasir' ? 'Buka Kasir →' : 'Buka Pembukuan →');
      card.setAttribute('aria-disabled', locked ? 'true' : 'false');
    });
  }

  function installNavigationCompatibility() {
    const originalSwitchTab = window.switchTab;
    if (typeof originalSwitchTab !== 'function' || window.__NEXA_NAV_HARDENED__) return;
    window.__NEXA_NAV_HARDENED__ = true;
    window.switchTab = function (tabName) {
      if (tabName === 'home') {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const content = document.getElementById(tabName), button = document.querySelector(`.tab-btn[data-tab="${CSS.escape(tabName)}"]`);
        if (content) content.classList.add('active'); if (button) button.classList.add('active');
        updateProtectedNavigation();
        return;
      }
      if (PROTECTED_TABS.has(tabName) && !isAuthenticated()) {
        redirectToAuth(tabName);
        return;
      }
      if (tabName === 'kasir') {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const content = document.getElementById(tabName), button = document.querySelector(`.tab-btn[data-tab="${CSS.escape(tabName)}"]`);
        if (content) content.classList.add('active'); if (button) button.classList.add('active');
        if (typeof window.renderKasir === 'function') window.renderKasir();
        return;
      }
      return originalSwitchTab.apply(this, arguments);
    };
  }

  function clearStaleCartOnUserChange() {
    const current = currentUserId() || 'offline', previous = sessionStorage.getItem('nexa_active_user_scope');
    if (previous && previous !== current) sessionStorage.removeItem('nexa_kasir_cart');
    sessionStorage.setItem('nexa_active_user_scope', current);
  }

  function injectHomePolish() {
    if (document.getElementById('nexaHomePolish')) return;
    const link = document.createElement('link');
    link.id = 'nexaHomePolish';
    link.rel = 'stylesheet';
    link.href = './home-polish.css?v=20260904';
    document.head.appendChild(link);
  }

  function installRuntimeHardening() {
    installNavigationCompatibility();
    clearStaleCartOnUserChange();
    updateProtectedNavigation();
    injectHomePolish();
    if (typeof window.updateCloudStatus === 'function') window.updateCloudStatus();
    // index.html loads kasir.js immediately after this file. Load the bridge
    // on the next task so the bridge can safely wrap the already-installed POS.
    setTimeout(() => {
      if (window.__NEXA_KASIR_CLOUD_BRIDGE__) return;
      const script = document.createElement('script');
      script.src = './kasir-cloud.js?v=20260904';
      script.async = false;
      document.head.appendChild(script);
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(installRuntimeHardening, 0), { once: true });
  } else {
    setTimeout(installRuntimeHardening, 0);
  }

  window.NEXA_DATA_ISOLATION = Object.freeze({ version: 3, getCurrentUserId: currentUserId, getTransactionStorageKey: scopedTransactionKey });
})();
