const API_URL = 'https://pembukuan-app.viqiquotex.workers.dev';
let allUsers = [];

function getCredentials() {
  try {
    const userId = localStorage.getItem('cloud_userId');
    const token = localStorage.getItem('cloud_token');
    return userId && token ? { userId, token, name: localStorage.getItem('cloud_name'), email: localStorage.getItem('cloud_email') } : null;
  } catch { return null; }
}
function authFetch(url, options = {}) {
  const credentials = getCredentials();
  const headers = new Headers(options.headers || {});
  if (credentials?.token) headers.set('Authorization', `Bearer ${credentials.token}`);
  headers.set('Accept', 'application/json');
  return fetch(url, { ...options, headers, credentials: 'include' });
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function formatDate(value) {
  if (!value) return 'Belum pernah';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak valid';
  return new Intl.DateTimeFormat('id-ID', { dateStyle:'medium', timeStyle:'short' }).format(date);
}
function showStatus(message, type = 'info') { const el = document.getElementById('statusbar'); el.textContent = message; el.className = `statusbar show ${type}`; }
function clearStatus() { document.getElementById('statusbar').className = 'statusbar'; }
function isRecentlyActive(value) { const t = Date.parse(value || ''); return Number.isFinite(t) && t >= Date.now() - 30 * 24 * 60 * 60 * 1000; }
function renderUsers() {
  const body = document.getElementById('usersBody');
  const query = document.getElementById('userSearch').value.trim().toLowerCase();
  const filtered = allUsers.filter(user => `${user.name || ''} ${user.email || ''}`.toLowerCase().includes(query));
  document.getElementById('userCountLabel').textContent = `${filtered.length} dari ${allUsers.length} pengguna ditampilkan`;
  if (!filtered.length) { body.innerHTML = `<tr><td colspan="6" class="empty">${query ? 'Tidak ada pengguna yang cocok.' : 'Belum ada pengguna terdaftar.'}</td></tr>`; return; }
  body.innerHTML = filtered.map(user => {
    const isAdmin = Boolean(user.isAdmin);
    return `<tr><td><div class="name">${escapeHtml(user.name || 'Tanpa nama')}</div><div class="stat-sub">ID: ${escapeHtml(user.userId || '—')}</div></td><td><div class="email">${escapeHtml(user.email || '—')}</div></td><td>${escapeHtml(formatDate(user.createdAt))}</td><td>${escapeHtml(formatDate(user.lastLogin))}</td><td><span class="badge ${isAdmin ? 'admin' : ''}">${isAdmin ? 'Admin' : 'User'}</span></td><td><button class="btn" type="button" data-user-id="${escapeHtml(user.userId)}">Detail</button></td></tr>`;
  }).join('');
  body.querySelectorAll('[data-user-id]').forEach(button => button.addEventListener('click', () => openUserDetail(button.dataset.userId)));
}
function calculateStats(users) {
  const now = Date.now(); const activeCutoff = now - 30 * 24 * 60 * 60 * 1000; const newCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const active = users.filter(user => { const t = Date.parse(user.lastLogin || ''); return Number.isFinite(t) && t >= activeCutoff; }).length;
  const recent = users.filter(user => { const t = Date.parse(user.createdAt || ''); return Number.isFinite(t) && t >= newCutoff; }).length;
  document.getElementById('totalUsers').textContent = users.length; document.getElementById('activeUsers').textContent = active; document.getElementById('newUsers').textContent = recent;
}
function openUserDetail(userId) {
  const user = allUsers.find(item => item.userId === userId); if (!user) return;
  document.getElementById('detailName').textContent = user.name || 'Tanpa nama';
  document.getElementById('detailEmail').textContent = user.email || '—';
  document.getElementById('detailId').textContent = user.userId || '—';
  document.getElementById('detailCreated').textContent = formatDate(user.createdAt);
  document.getElementById('detailLogin').textContent = formatDate(user.lastLogin);
  document.getElementById('detailActivity').textContent = isRecentlyActive(user.lastLogin) ? 'Aktif 30 hari terakhir' : 'Tidak login dalam 30 hari terakhir';
  document.getElementById('userModal').classList.add('open');
  document.getElementById('userModal').setAttribute('aria-hidden','false');
}
function closeUserDetail() { document.getElementById('userModal').classList.remove('open'); document.getElementById('userModal').setAttribute('aria-hidden','true'); }
async function loadUsers() {
  const loading = document.getElementById('tableLoading'); const body = document.getElementById('usersBody');
  loading.style.display = 'block'; body.innerHTML = ''; clearStatus(); document.getElementById('apiStatus').textContent = '…';
  const credentials = getCredentials();
  if (!credentials) { document.getElementById('apiStatus').textContent = 'LOCKED'; document.getElementById('adminIdentity').textContent = 'Login admin diperlukan'; showStatus('Sesi admin tidak ditemukan. Login menggunakan akun yang terdaftar sebagai ADMIN_EMAIL.', 'error'); loading.style.display = 'none'; return; }
  document.getElementById('adminIdentity').textContent = credentials.email || 'Admin';
  try {
    const response = await authFetch(`${API_URL}/api/admin/users`); const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Sesi admin tidak valid atau sudah kedaluwarsa. Silakan login kembali.');
    if (response.status === 403) throw new Error('Akses ditolak. Akun ini bukan administrator.');
    if (!response.ok) throw new Error(data.error || 'Gagal mengambil data pengguna.');
    allUsers = Array.isArray(data.users) ? data.users : [];
    calculateStats(allUsers); renderUsers(); document.getElementById('apiStatus').textContent = 'ONLINE'; document.getElementById('adminIdentity').textContent = credentials.email || 'Admin terverifikasi'; showStatus(`Admin terverifikasi • ${allUsers.length} pengguna berhasil dimuat.`, 'success');
  } catch (error) { allUsers = []; calculateStats([]); renderUsers(); document.getElementById('apiStatus').textContent = 'ERROR'; showStatus(error.message || 'Terjadi kesalahan saat memuat data.', 'error'); }
  finally { loading.style.display = 'none'; }
}
async function logout() {
  const credentials = getCredentials(); if (!credentials) { window.location.href = './cloud.html'; return; } if (!confirm('Keluar dari sesi admin?')) return;
  try { await authFetch(`${API_URL}/api/auth/logout`, { method:'POST' }); } catch {}
  ['cloud_token','cloud_userId','cloud_email','cloud_name'].forEach(key => localStorage.removeItem(key)); window.location.href = './cloud.html';
}
document.getElementById('refreshBtn').addEventListener('click', loadUsers);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('userSearch').addEventListener('input', renderUsers);
document.getElementById('clearSearch').addEventListener('click', () => { document.getElementById('userSearch').value = ''; renderUsers(); });
document.getElementById('closeModal').addEventListener('click', closeUserDetail);
document.getElementById('userModal').addEventListener('click', event => { if (event.target.id === 'userModal') closeUserDetail(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeUserDetail(); });
loadUsers();
