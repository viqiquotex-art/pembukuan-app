// ==========================================
// NEXA KASIR - CLOUD INVENTORY BRIDGE
// Keeps the existing POS UI while making cloud inventory authoritative.
// ==========================================
(function () {
  'use strict';
  if (window.__NEXA_KASIR_CLOUD_BRIDGE__) return;
  window.__NEXA_KASIR_CLOUD_BRIDGE__ = true;

  const API = 'https://pembukuan-app.viqiquotex.workers.dev';
  const PRODUCT_KEY_PREFIX = 'nexa_products:';
  let refreshing = false;
  let replayingCheckout = false;

  const userId = () => localStorage.getItem('cloud_userId') || '';
  const connected = () => !!userId() && typeof isCloudConnected === 'function' && isCloudConnected();
  const localKey = () => PRODUCT_KEY_PREFIX + (userId() || 'offline');

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = typeof getCloudToken === 'function' ? getCloudToken() : '';
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(API + path, { ...options, headers, credentials: 'include' });
  }

  async function json(response) {
    try { return await response.json(); } catch { return {}; }
  }

  function writeLocal(products) {
    try { localStorage.setItem(localKey(), JSON.stringify(Array.isArray(products) ? products : [])); } catch {}
  }

  async function pullProducts(silent = true) {
    if (!connected() || refreshing) return false;
    refreshing = true;
    try {
      const r = await request('/api/products');
      const d = await json(r);
      if (r.status === 401) {
        if (typeof handleAuthFailure === 'function') handleAuthFailure(d.error);
        return false;
      }
      if (!r.ok || !Array.isArray(d.products)) {
        if (!silent && typeof showToast === 'function') showToast('❌ Gagal memuat stok cloud', 'error');
        return false;
      }
      writeLocal(d.products);
      if (typeof renderProducts === 'function') renderProducts();
      if (typeof renderCart === 'function') renderCart();
      return true;
    } catch (e) {
      if (!silent && typeof showToast === 'function') showToast('⚠️ Cloud inventory tidak tersedia', 'error');
      return false;
    } finally { refreshing = false; }
  }

  async function putProduct(product) {
    const r = await request('/api/products', { method: 'PUT', body: JSON.stringify({ product }) });
    const d = await json(r);
    if (r.status === 401 && typeof handleAuthFailure === 'function') handleAuthFailure(d.error);
    if (!r.ok) throw new Error(d.error || 'Gagal menyimpan produk');
    return d.product;
  }

  async function deleteProduct(id) {
    const r = await request('/api/products/' + encodeURIComponent(id), { method: 'DELETE' });
    const d = await json(r);
    if (r.status === 401 && typeof handleAuthFailure === 'function') handleAuthFailure(d.error);
    if (!r.ok) throw new Error(d.error || 'Gagal menghapus produk');
    return true;
  }

  async function checkout(items) {
    const payload = { items: items.map(i => ({ productId: String(i.id), qty: Number(i.qty) })) };
    const r = await request('/api/products/checkout', { method: 'POST', body: JSON.stringify(payload) });
    const d = await json(r);
    if (r.status === 401 && typeof handleAuthFailure === 'function') handleAuthFailure(d.error);
    if (!r.ok) throw new Error(d.error || (r.status === 409 ? 'Stok berubah. Muat ulang stok.' : 'Checkout cloud gagal'));
    return d;
  }

  function refreshCartFromProducts() {
    try {
      const raw = sessionStorage.getItem('nexa_kasir_cart');
      const cart = raw ? JSON.parse(raw) : [];
      const rawProducts = localStorage.getItem(localKey());
      const products = rawProducts ? JSON.parse(rawProducts) : [];
      const map = new Map(products.map(p => [p.id, p]));
      const next = Array.isArray(cart) ? cart.map(i => {
        const p = map.get(i.id);
        return p ? { ...i, name: p.name, price: Number(p.price), qty: Math.min(Number(i.qty) || 0, Number(p.stock) || 0) } : i;
      }).filter(i => Number(i.qty) > 0) : [];
      sessionStorage.setItem('nexa_kasir_cart', JSON.stringify(next));
    } catch {}
  }

  async function onProductSubmit(event) {
    if (!connected() || event.__nexaCloudHandled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.__nexaCloudHandled = true;
    const form = event.currentTarget;
    const name = document.getElementById('kasirProductName')?.value.trim();
    const price = Number((document.getElementById('kasirProductPrice')?.value || '').replace(/\D/g, ''));
    const stock = Number((document.getElementById('kasirProductStock')?.value || '').replace(/\D/g, ''));
    const editId = form.dataset.editId || '';
    if (!name || !Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(stock) || stock < 0) return;
    try {
      const existing = JSON.parse(localStorage.getItem(localKey()) || '[]');
      const old = Array.isArray(existing) ? existing.find(p => p.id === editId) : null;
      const product = { id: editId || (Date.now() + '_' + Math.random().toString(36).slice(2, 9)), name, price, stock, createdAt: old?.createdAt || new Date().toISOString() };
      await putProduct(product);
      await pullProducts();
      document.getElementById('kasirProductModal')?.classList.remove('open');
      if (typeof showToast === 'function') showToast('✅ Produk tersimpan di cloud', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('❌ ' + e.message, 'error');
    }
  }

  async function onManageClick(event) {
    if (!connected()) return;
    const button = event.target.closest('[data-manage="delete"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = button.dataset.id;
    const products = JSON.parse(localStorage.getItem(localKey()) || '[]');
    const product = Array.isArray(products) ? products.find(p => p.id === id) : null;
    if (!product || !confirm(`Hapus produk "${product.name}"?`)) return;
    try {
      await deleteProduct(id);
      await pullProducts();
      if (typeof manage === 'function') manage();
      if (typeof showToast === 'function') showToast('✅ Produk dihapus dari cloud', 'success');
    } catch (e) { if (typeof showToast === 'function') showToast('❌ ' + e.message, 'error'); }
  }

  async function onCheckout(event) {
    if (!connected() || replayingCheckout) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const raw = sessionStorage.getItem('nexa_kasir_cart') || '[]';
    let cart;
    try { cart = JSON.parse(raw); } catch { cart = []; }
    if (!Array.isArray(cart) || !cart.length) return;
    try {
      const result = await checkout(cart);
      // Pull the authoritative post-checkout inventory.
      await pullProducts();
      refreshCartFromProducts();
      // The existing POS flow also creates the bookkeeping transaction and receipt.
      // Replay it against the server-confirmed stock so stock is decremented only once in UI.
      const products = JSON.parse(localStorage.getItem(localKey()) || '[]');
      const byId = new Map(products.map(p => [p.id, p]));
      const adjusted = products.map(p => {
        const item = cart.find(i => i.id === p.id);
        return item ? { ...p, stock: Number(p.stock) + Number(item.qty) } : p;
      });
      localStorage.setItem(localKey(), JSON.stringify(adjusted));
      replayingCheckout = true;
      document.getElementById('kasirCheckout')?.click();
      replayingCheckout = false;
      // Restore the authoritative server values after the local POS flow finishes.
      writeLocal(products);
      if (typeof renderProducts === 'function') renderProducts();
      if (result?.updated && typeof showToast === 'function') showToast('☁️ Stok cloud diperbarui', 'success');
    } catch (e) {
      replayingCheckout = false;
      await pullProducts(false);
      if (typeof showToast === 'function') showToast('❌ ' + e.message, 'error');
    }
  }

  function install() {
    document.addEventListener('submit', e => {
      if (e.target?.id === 'kasirProductForm') onProductSubmit(e);
    }, true);
    document.addEventListener('click', e => {
      if (e.target?.closest?.('#kasirCheckout')) {
        if (replayingCheckout) return;
        onCheckout(e);
        return;
      }
      if (e.target?.closest?.('[data-manage="delete"]')) onManageClick(e);
    }, true);
    window.addEventListener('focus', () => pullProducts(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pullProducts(true); });
    setTimeout(() => pullProducts(true), 500);
    setInterval(() => pullProducts(true), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
