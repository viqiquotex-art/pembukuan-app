// ==========================================
// PEMBUKUAN CLOUD - COOKIE SESSION
// ==========================================

const API_BASE_URL = 'https://pembukuan-app.viqiquotex.workers.dev';
const API_ENDPOINTS = {
  register: `${API_BASE_URL}/api/auth/register`,
  login: `${API_BASE_URL}/api/auth/login`,
  logout: `${API_BASE_URL}/api/auth/logout`,
  profile: `${API_BASE_URL}/api/auth/profile`,
  saveTransactions: `${API_BASE_URL}/api/transactions`,
  getTransactions: userId => `${API_BASE_URL}/api/transactions/${encodeURIComponent(userId)}`,
  getStats: userId => `${API_BASE_URL}/api/stats/${encodeURIComponent(userId)}`,
  export: userId => `${API_BASE_URL}/api/export/${encodeURIComponent(userId)}`
};

function getCloudCredentials() {
  const userId = localStorage.getItem('cloud_userId');
  const email = localStorage.getItem('cloud_email');
  const name = localStorage.getItem('cloud_name');
  return userId ? { userId, email, name } : null;
}

function saveCloudCredentials(credentials) {
  if (!credentials || !credentials.userId) throw new Error('Invalid cloud identity');
  localStorage.setItem('cloud_userId', credentials.userId);
  localStorage.setItem('cloud_email', credentials.email || '');
  localStorage.setItem('cloud_name', credentials.name || '');
  localStorage.removeItem('cloud_credentials');
  localStorage.removeItem('cloud_token');
}

function clearCloudCredentials() {
  localStorage.removeItem('cloud_credentials');
  localStorage.removeItem('cloud_token');
  localStorage.removeItem('cloud_userId');
  localStorage.removeItem('cloud_email');
  localStorage.removeItem('cloud_name');
}

function isCloudConnected() { return !!localStorage.getItem('cloud_userId'); }

function authFetch(url, options = {}) {
  return fetch(url, { ...options, credentials: 'include' });
}

function parseLocalTransactions() {
  try {
    const raw = localStorage.getItem('transactions');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Transaction storage error:', error);
    return [];
  }
}

function getLocalDeletedTransactionIds() {
  try {
    const raw = localStorage.getItem('deletedTransactionIds');
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  } catch (error) {
    console.warn('Deleted transaction storage error:', error);
    return new Set();
  }
}
function saveLocalDeletedTransactionIds(ids) { localStorage.setItem('deletedTransactionIds', JSON.stringify(Array.from(ids))); }
function addLocalDeletedTransactionId(id) { if (!id) return; const ids = getLocalDeletedTransactionIds(); ids.add(id); saveLocalDeletedTransactionIds(ids); }
function removeLocalDeletedTransactionIds(idsToRemove) { if (!Array.isArray(idsToRemove) || !idsToRemove.length) return; const ids = getLocalDeletedTransactionIds(); idsToRemove.forEach(id => ids.delete(id)); saveLocalDeletedTransactionIds(ids); }

function handleAuthFailure(message = 'Sesi cloud sudah berakhir. Silakan login kembali.') {
  clearCloudCredentials();
  showAlert(`🔐 ${message}`, 'error');
  setTimeout(() => { if (typeof updateCloudStatus === 'function') updateCloudStatus(); }, 100);
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
  if (!name || !email || !password || !passwordConfirm) return showAlert('❌ Semua field harus diisi!', 'error');
  if (password.length < 8) return showAlert('❌ Password minimal 8 karakter!', 'error');
  if (password !== passwordConfirm) return showAlert('❌ Password tidak cocok!', 'error');
  try {
    setLoading(true, 'Registering...');
    const response = await authFetch(API_ENDPOINTS.register, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
    const data = await safeJson(response);
    if (!response.ok) { showAlert(`❌ ${data.error || 'Register gagal'}`, 'error'); return; }
    saveCloudCredentials({ userId: data.userId, name: data.name, email: data.email });
    showAlert('✅ Register berhasil!', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  } catch (error) { console.error('Register error:', error); showAlert(`❌ Error: ${error.message}`, 'error'); }
  finally { setLoading(false); }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showAlert('❌ Email dan password harus diisi!', 'error');
  try {
    setLoading(true, 'Logging in...');
    const response = await authFetch(API_ENDPOINTS.login, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await safeJson(response);
    if (!response.ok) { showAlert(`❌ ${data.error || 'Login gagal'}`, 'error'); return; }
    saveCloudCredentials({ userId: data.userId, name: data.name, email: data.email });
    showAlert(`✅ Login berhasil! Selamat datang, ${data.name}`, 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  } catch (error) { console.error('Login error:', error); showAlert(`❌ Login gagal: ${error.message}`, 'error'); }
  finally { setLoading(false); }
}

async function handleLogout() {
  if (!confirm('Yakin logout? Data lokal tetap aman.')) return;
  try { await authFetch(API_ENDPOINTS.logout, { method: 'POST', headers: { 'Content-Type': 'application/json' } }); }
  catch (error) { console.warn('Server logout failed; clearing local identity:', error); }
  finally { clearCloudCredentials(); location.reload(); }
}

async function syncToCloud() {
  const credentials = getCloudCredentials();
  if (!credentials) return showAlert('❌ Anda harus login terlebih dahulu', 'error');
  try {
    setLoading(true, 'Syncing ke cloud...');
    const deletedIds = getLocalDeletedTransactionIds();
    const allTransactions = parseLocalTransactions();
    const transactions = allTransactions.filter(t => t?.id && !deletedIds.has(t.id));
    const response = await authFetch(API_ENDPOINTS.saveTransactions, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: credentials.userId, transactions }) });
    const data = await safeJson(response);
    if (response.status === 401) return handleAuthFailure(data.error);
    if (!response.ok) return showAlert(`❌ ${data.error || 'Sync gagal'}`, 'error');
    if (Array.isArray(data.deletedIds)) { data.deletedIds.forEach(id => deletedIds.add(id)); saveLocalDeletedTransactionIds(deletedIds); }
    showAlert(`✅ Synced! ${data.count} transaksi tersimpan di cloud`, 'success');
    loadStats();
  } catch (error) { console.error('Sync error:', error); showAlert(`❌ Sync gagal: ${error.message}`, 'error'); }
  finally { setLoading(false); }
}

async function loadFromCloud() {
  const credentials = getCloudCredentials();
  if (!credentials) return showAlert('❌ Anda harus login terlebih dahulu', 'error');
  try {
    setLoading(true, 'Memuat dari cloud...');
    const response = await authFetch(API_ENDPOINTS.getTransactions(credentials.userId), { method: 'GET' });
    const data = await safeJson(response);
    if (response.status === 401) return handleAuthFailure(data.error);
    if (!response.ok) return showAlert(`❌ ${data.error || 'Load gagal'}`, 'error');
    const cloudTransactions = Array.isArray(data.transactions) ? data.transactions : [];
    const cloudDeletedIds = Array.isArray(data.deletedIds) ? data.deletedIds.filter(Boolean) : [];
    const localDeletedIds = getLocalDeletedTransactionIds();
    cloudDeletedIds.forEach(id => localDeletedIds.add(id));
    saveLocalDeletedTransactionIds(localDeletedIds);
    const localTransactions = parseLocalTransactions();
    const cleanLocal = localTransactions.filter(t => t?.id && !localDeletedIds.has(t.id));
    const cleanCloud = cloudTransactions.filter(t => t?.id && !localDeletedIds.has(t.id));
    const merged = mergeTransactions(cleanLocal, cleanCloud, localDeletedIds);
    localStorage.setItem('transactions', JSON.stringify(merged));
    showAlert(`✅ Loaded! ${merged.length} transaksi`, 'success');
    loadStats();
  } catch (error) { console.error('Load error:', error); showAlert(`❌ Load gagal: ${error.message}`, 'error'); }
  finally { setLoading(false); }
}

async function loadStats() {
  const credentials = getCloudCredentials();
  if (!credentials) return;
  try {
    const response = await authFetch(API_ENDPOINTS.getStats(credentials.userId), { method: 'GET' });
    const data = await safeJson(response);
    if (response.status === 401) return handleAuthFailure(data.error);
    if (!response.ok) return;
    const stats = data.stats || data;
    const userName = document.getElementById('userName');
    if (userName) userName.textContent = credentials.name || '';
    const container = document.getElementById('statsContainer');
    if (!container) return;
    const values = [
      ['💰 Total Pemasukan', formatRupiah(stats.totalIncome)],
      ['💸 Total Pengeluaran', formatRupiah(stats.totalExpense)],
      ['📊 Saldo', formatRupiah(stats.balance)],
      ['📝 Transaksi', Number(stats.transactionCount) || 0]
    ];
    const fragment = document.createDocumentFragment();
    values.forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const labelEl = document.createElement('div');
      labelEl.className = 'label';
      labelEl.textContent = label;
      const valueEl = document.createElement('div');
      valueEl.className = 'value';
      valueEl.textContent = value;
      card.append(labelEl, valueEl);
      fragment.appendChild(card);
    });
    container.replaceChildren(fragment);
  } catch (error) { console.error('Failed to load stats:', error); }
}

async function validateCloudSession() {
  const credentials = getCloudCredentials();
  if (!credentials) return false;
  try {
    const response = await authFetch(API_ENDPOINTS.profile, { method: 'GET' });
    const data = await safeJson(response);
    if (response.status === 401) { handleAuthFailure(data.error); return false; }
    if (!response.ok) return false;
    saveCloudCredentials({ userId: data.userId, name: data.name, email: data.email });
    return true;
  } catch (error) { console.warn('Session validation failed:', error); return false; }
}

function toggleForm() {
  const loginForm = document.getElementById('loginForm'); const registerForm = document.getElementById('registerForm');
  if (!loginForm || !registerForm) return;
  if (loginForm.style.display === 'none') { loginForm.style.display = 'block'; registerForm.style.display = 'none'; } else { loginForm.style.display = 'none'; registerForm.style.display = 'block'; }
  hideAlert();
}
function showAlert(message, type = 'info') { const alert = document.getElementById('alert'); if (!alert) return console.log(message); alert.className = `alert ${type} show`; alert.textContent = message; setTimeout(() => hideAlert(), 5000); }
function hideAlert() { const alert = document.getElementById('alert'); if (alert) alert.classList.remove('show'); }
function setLoading(isLoading, text = 'Loading...') { const loginBtn = document.getElementById('loginBtn'); const registerBtn = document.getElementById('registerBtn'); const loginLoading = document.getElementById('loginLoading'); const registerLoading = document.getElementById('registerLoading'); if (loginBtn) loginBtn.disabled = isLoading; if (registerBtn) registerBtn.disabled = isLoading; if (loginLoading) { loginLoading.style.display = isLoading ? 'block' : 'none'; if (isLoading) loginLoading.innerHTML = `<span class="spinner"></span> ${text}`; } if (registerLoading) { registerLoading.style.display = isLoading ? 'block' : 'none'; if (isLoading) registerLoading.innerHTML = `<span class="spinner"></span> ${text}`; } }
function goToApp() { window.location.href = './index.html'; }
async function safeJson(response) { try { return await response.json(); } catch { return {}; } }
function mergeTransactions(local, cloud, deletedIds = new Set()) { const merged = new Map(); cloud.forEach(t => { if (t?.id && !deletedIds.has(t.id)) merged.set(t.id, t); }); local.forEach(t => { if (t?.id && !deletedIds.has(t.id)) { const old = merged.get(t.id); if (!old || getTimestamp(t) >= getTimestamp(old)) merged.set(t.id, t); } }); return Array.from(merged.values()).sort((a, b) => new Date(b.date) - new Date(a.date)); }
function getTimestamp(t) { const value = t && (t.updatedAt || t.createdAt); const ts = value ? Date.parse(value) : 0; return Number.isFinite(ts) ? ts : 0; }
function syncToCloudFromApp() { return syncToCloud(); }
function loadFromCloudToApp() { return loadFromCloud(); }
function logoutCloud() { return handleLogout(); }
