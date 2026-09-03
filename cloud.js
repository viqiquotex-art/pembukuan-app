// ==========================================
// PEMBUKUAN CLOUD - TOKEN + COOKIE SESSION
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
const SYNC_SNAPSHOT_KEY = 'cloud_sync_snapshot';

function getCloudCredentials() {
  const userId = localStorage.getItem('cloud_userId');
  const email = localStorage.getItem('cloud_email');
  const name = localStorage.getItem('cloud_name');
  const token = localStorage.getItem('cloud_token');
  return userId ? { userId, email, name, token } : null;
}
function saveCloudCredentials(credentials) {
  if (!credentials || !credentials.userId) throw new Error('Invalid cloud identity');
  localStorage.setItem('cloud_userId', credentials.userId);
  localStorage.setItem('cloud_email', credentials.email || '');
  localStorage.setItem('cloud_name', credentials.name || '');
  if (credentials.token) localStorage.setItem('cloud_token', credentials.token);
  localStorage.removeItem('cloud_credentials');
}
function clearCloudCredentials() {
  localStorage.removeItem('cloud_credentials');
  localStorage.removeItem('cloud_token');
  localStorage.removeItem('cloud_userId');
  localStorage.removeItem('cloud_email');
  localStorage.removeItem('cloud_name');
  localStorage.removeItem(SYNC_SNAPSHOT_KEY);
}
function isCloudConnected() { return !!localStorage.getItem('cloud_userId') && !!localStorage.getItem('cloud_token'); }
function authFetch(url, options = {}) {
  const token = localStorage.getItem('cloud_token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers, credentials: 'include' });
}
function parseLocalTransactions() { try { const raw = localStorage.getItem('transactions'); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function getDeletedTransactionStorageKey() { const userId = localStorage.getItem('cloud_userId'); return userId ? `deletedTransactionIds:${userId}` : 'deletedTransactionIds'; }
function getLocalDeletedTransactionIds() { try { const raw = localStorage.getItem(getDeletedTransactionStorageKey()); const ids = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []); } catch { return new Set(); } }
function saveLocalDeletedTransactionIds(ids) { localStorage.setItem(getDeletedTransactionStorageKey(), JSON.stringify(Array.from(ids))); }
function addLocalDeletedTransactionId(id) { if (!id) return; const ids = getLocalDeletedTransactionIds(); ids.add(id); saveLocalDeletedTransactionIds(ids); }
function removeLocalDeletedTransactionIds(idsToRemove) { if (!Array.isArray(idsToRemove) || !idsToRemove.length) return; const ids = getLocalDeletedTransactionIds(); idsToRemove.forEach(id => ids.delete(id)); saveLocalDeletedTransactionIds(ids); }
function readSyncSnapshot(userId) { try { const raw = localStorage.getItem(SYNC_SNAPSHOT_KEY); const snapshot = raw ? JSON.parse(raw) : null; return snapshot && snapshot.userId === userId && Array.isArray(snapshot.transactions) ? snapshot.transactions : []; } catch { return []; } }
function writeSyncSnapshot(userId, transactions) { try { localStorage.setItem(SYNC_SNAPSHOT_KEY, JSON.stringify({ userId, transactions: Array.isArray(transactions) ? transactions : [], savedAt: new Date().toISOString() })); } catch {} }
function transactionSignature(transaction) { if (!transaction || typeof transaction !== 'object') return ''; return JSON.stringify({ id: transaction.id || '', type: transaction.type || '', category: transaction.category || '', amount: Number(transaction.amount) || 0, date: transaction.date || '', description: transaction.description || '', createdAt: transaction.createdAt || '', updatedAt: transaction.updatedAt || '' }); }
function getDeltaTransactions(localTransactions, snapshotTransactions, deletedIds) { const snapshot = new Map(snapshotTransactions.filter(t => t?.id).map(t => [t.id, transactionSignature(t)])); return localTransactions.filter(transaction => transaction?.id && !deletedIds.has(transaction.id) && snapshot.get(transaction.id) !== transactionSignature(transaction)); }
function handleAuthFailure(message = 'Sesi cloud sudah berakhir. Silakan login kembali.') { clearCloudCredentials(); if (typeof showAlert === 'function') showAlert(`🔐 ${message}`, 'error'); setTimeout(() => { if (typeof updateCloudStatus === 'function') updateCloudStatus(); }, 100); }

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('registerName').value.trim(); const email = document.getElementById('registerEmail').value.trim().toLowerCase(); const password = document.getElementById('registerPassword').value; const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
  if (!name || !email || !password || !passwordConfirm) return showAlert('❌ Semua field harus diisi!', 'error');
  if (password.length < 8) return showAlert('❌ Password minimal 8 karakter!', 'error');
  if (password !== passwordConfirm) return showAlert('❌ Password tidak cocok!', 'error');
  try { setLoading(true, 'Registering...'); const response = await authFetch(API_ENDPOINTS.register, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ name, email, password }) }); const data = await safeJson(response); if (!response.ok) { showAlert(`❌ ${data.error || 'Register gagal'}`, 'error'); return; } saveCloudCredentials({ userId: data.userId, name: data.name, email: data.email, token: data.token }); showAlert('✅ Register berhasil!', 'success'); setTimeout(() => { window.location.href = './index.html'; }, 800); } catch (error) { console.error('Register error:', error); showAlert(`❌ Tidak dapat terhubung ke server: ${error.message}`, 'error'); } finally { setLoading(false); }
}
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase(); const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showAlert('❌ Email dan password harus diisi!', 'error');
  try { setLoading(true, 'Logging in...'); const response = await authFetch(API_ENDPOINTS.login, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ email, password }) }); const data = await safeJson(response); if (!response.ok) { showAlert(`❌ ${data.error || 'Login gagal'}`, 'error'); return; } saveCloudCredentials({ userId: data.userId, name: data.name, email: data.email, token: data.token }); showAlert(`✅ Login berhasil! Selamat datang, ${data.name}`, 'success'); setTimeout(() => { window.location.href = './index.html'; }, 800); } catch (error) { console.error('Login error:', error); showAlert(`❌ Login gagal: ${error.message}`, 'error'); } finally { setLoading(false); }
}
async function handleLogout() { if (!confirm('Yakin logout? Data lokal tetap aman.')) return; try { await authFetch(API_ENDPOINTS.logout, { method: 'POST' }); } catch {} finally { clearCloudCredentials(); location.reload(); } }
let cloudSyncInFlight = null;
async function syncToCloud() {
  if (!isCloudConnected()) return showAlert('❌ Anda harus login terlebih dahulu', 'error');
  const credentials = getCloudCredentials();
  if (!credentials?.token) return showAlert('❌ Sesi cloud tidak valid. Silakan login kembali.', 'error');
  if (cloudSyncInFlight) return cloudSyncInFlight;
  cloudSyncInFlight = (async () => {
    try {
      setLoading(true, 'Syncing ke cloud...');
      const deletedIds = getLocalDeletedTransactionIds();
      const localBefore = parseLocalTransactions();
      const snapshot = readSyncSnapshot(credentials.userId);
      const transactions = getDeltaTransactions(localBefore, snapshot, deletedIds);
      const response = await authFetch(API_ENDPOINTS.saveTransactions, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: credentials.userId, transactions }) });
      const data = await safeJson(response);
      if (response.status === 401) { handleAuthFailure(data.error); return false; }
      if (response.status === 403) { showAlert('❌ Akses cloud ditolak.', 'error'); return false; }
      if (!response.ok) { showAlert(`❌ ${data.error || 'Sync gagal'}`, 'error'); return false; }
      if (Array.isArray(data.deletedIds)) data.deletedIds.forEach(id => deletedIds.add(id));
      saveLocalDeletedTransactionIds(deletedIds);
      const serverTransactions = Array.isArray(data.transactions) ? data.transactions : [];
      // The Worker has already resolved timestamp conflicts. Its response is
      // therefore authoritative for records returned by the server. Local-only
      // records that were not part of the response are preserved only if they
      // were created after the request snapshot.
      const sentIds = new Set(transactions.map(t => t.id));
      const serverById = new Map(serverTransactions.filter(t => t?.id && !deletedIds.has(t.id)).map(t => [t.id, t]));
      const merged = new Map();
      serverById.forEach((t, id) => merged.set(id, t));
      localBefore.forEach(t => {
        if (!t?.id || deletedIds.has(t.id)) return;
        if (serverById.has(t.id)) return;
        // If this record was sent but the server omitted it, it lost a conflict
        // (or was deleted). Do not resurrect it. Unsynced local-only records are safe.
        if (sentIds.has(t.id)) return;
        merged.set(t.id, t);
      });
      const finalTransactions = Array.from(merged.values()).sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        return dateDiff || getTimestamp(b) - getTimestamp(a);
      });
      localStorage.setItem('transactions', JSON.stringify(finalTransactions));
      writeSyncSnapshot(credentials.userId, serverTransactions);
      if (typeof renderHistory === 'function') renderHistory();
      if (typeof renderRecap === 'function') renderRecap();
      showAlert(`✅ Sync selesai! ${finalTransactions.length} transaksi (${transactions.length} perubahan dikirim)`, 'success');
      loadStats();
      return true;
    } catch (error) {
      console.error('Sync error:', error);
      showAlert(`❌ Sync gagal: ${error.message}`, 'error');
      return false;
    } finally { setLoading(false); cloudSyncInFlight = null; }
  })();
  return cloudSyncInFlight;
}
async function loadFromCloud() {
  if (!isCloudConnected()) return showAlert('❌ Anda harus login terlebih dahulu', 'error');
  const credentials = getCloudCredentials();
  try {
    setLoading(true, 'Memuat dari cloud...');
    const response = await authFetch(API_ENDPOINTS.getTransactions(credentials.userId), { method: 'GET' });
    const data = await safeJson(response);
    if (response.status === 401) { handleAuthFailure(data.error); return false; }
    if (response.status === 403) { showAlert('❌ Akses cloud ditolak.', 'error'); return false; }
    if (!response.ok) { showAlert(`❌ ${data.error || 'Load gagal'}`, 'error'); return false; }
    const cloudTransactions = Array.isArray(data.transactions) ? data.transactions : [];
    const cloudDeletedIds = Array.isArray(data.deletedIds) ? data.deletedIds.filter(Boolean) : [];
    const localDeletedIds = getLocalDeletedTransactionIds();
    cloudDeletedIds.forEach(id => localDeletedIds.add(id));
    saveLocalDeletedTransactionIds(localDeletedIds);
    const local = parseLocalTransactions().filter(t => t?.id && !localDeletedIds.has(t.id));
    const cloud = cloudTransactions.filter(t => t?.id && !localDeletedIds.has(t.id));
    // Load is intentionally a merge, not a blind replace: unsynced local
    // changes are retained when their timestamps are newer than cloud data.
    const merged = mergeTransactions(local, cloud, localDeletedIds);
    localStorage.setItem('transactions', JSON.stringify(merged));
    writeSyncSnapshot(credentials.userId, cloudTransactions);
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof renderRecap === 'function') renderRecap();
    showAlert(`✅ Loaded! ${merged.length} transaksi`, 'success');
    loadStats();
    return true;
  } catch (error) { console.error('Load error:', error); showAlert(`❌ Load gagal: ${error.message}`, 'error'); return false; }
  finally { setLoading(false); }
}
async function loadStats() { const credentials = getCloudCredentials(); if (!isCloudConnected() || !credentials) return; try { const response = await authFetch(API_ENDPOINTS.getStats(credentials.userId)); const data = await safeJson(response); if (response.status === 401) return handleAuthFailure(data.error); if (!response.ok) return; const stats = data.stats || data; const userName = document.getElementById('userName'); if (userName) userName.textContent = credentials.name || ''; const container = document.getElementById('statsContainer'); if (!container) return; const values = [['💰 Total Pemasukan', formatRupiah(stats.totalIncome)], ['💸 Total Pengeluaran', formatRupiah(stats.totalExpense)], ['📊 Saldo', formatRupiah(stats.balance)], ['📝 Transaksi', Number(stats.transactionCount) || 0]]; const fragment = document.createDocumentFragment(); values.forEach(([label, value]) => { const card = document.createElement('div'); card.className = 'stat-card'; const labelEl = document.createElement('div'); labelEl.className = 'label'; labelEl.textContent = label; const valueEl = document.createElement('div'); valueEl.className = 'value'; valueEl.textContent = value; card.append(labelEl, valueEl); fragment.appendChild(card); }); container.replaceChildren(fragment); } catch (error) { console.error('Failed to load stats:', error); } }
async function validateCloudSession() { const credentials = getCloudCredentials(); if (!credentials || !credentials.token) return false; try { const response = await authFetch(API_ENDPOINTS.profile); const data = await safeJson(response); if (response.status === 401) { handleAuthFailure(data.error); return false; } if (!response.ok || !data.userId) return false; saveCloudCredentials({ userId: data.userId, name: data.name, email: data.email, token: credentials.token }); return true; } catch { return false; } }
function toggleForm() { const loginForm = document.getElementById('loginForm'); const registerForm = document.getElementById('registerForm'); if (!loginForm || !registerForm) return; const showRegister = loginForm.style.display !== 'none'; loginForm.style.display = showRegister ? 'none' : 'block'; registerForm.style.display = showRegister ? 'block' : 'none'; hideAlert(); }
function showAlert(message, type = 'info') { const alert = document.getElementById('alert'); if (!alert) return console.log(message); alert.className = `alert ${type} show`; alert.textContent = message; setTimeout(() => hideAlert(), 5000); }
function hideAlert() { const alert = document.getElementById('alert'); if (alert) alert.classList.remove('show'); }
function setLoading(isLoading, text = 'Loading...') { const loginBtn = document.getElementById('loginBtn'); const registerBtn = document.getElementById('registerBtn'); const loginLoading = document.getElementById('loginLoading'); const registerLoading = document.getElementById('registerLoading'); if (loginBtn) loginBtn.disabled = isLoading; if (registerBtn) registerBtn.disabled = isLoading; if (loginLoading) { loginLoading.style.display = isLoading ? 'block' : 'none'; if (isLoading) loginLoading.innerHTML = `<span class="spinner"></span> ${text}`; } if (registerLoading) { registerLoading.style.display = isLoading ? 'block' : 'none'; if (isLoading) registerLoading.innerHTML = `<span class="spinner"></span> ${text}`; } }
function goToCloudPage() { window.location.href = './cloud.html'; }
function goToApp() { window.location.href = './index.html'; }
async function safeJson(response) { try { return await response.json(); } catch { return {}; } }
function mergeTransactions(local, cloud, deletedIds = new Set()) { const merged = new Map(); cloud.forEach(t => { if (t?.id && !deletedIds.has(t.id)) merged.set(t.id, t); }); local.forEach(t => { if (t?.id && !deletedIds.has(t.id)) { const old = merged.get(t.id); if (!old || getTimestamp(t) >= getTimestamp(old)) merged.set(t.id, t); } }); return Array.from(merged.values()).sort((a, b) => { const dateDiff = new Date(b.date) - new Date(a.date); return dateDiff || getTimestamp(b) - getTimestamp(a); }); }
function getTimestamp(t) { const value = t && (t.updatedAt || t.createdAt); const ts = value ? Date.parse(value) : 0; return Number.isFinite(ts) ? ts : 0; }
function syncToCloudFromApp() { return syncToCloud(); }
function loadFromCloudToApp() { return loadFromCloud(); }
function logoutCloud() { return handleLogout(); }
