// ==========================================
// NEXA ADMIN PANEL - INTEGRATED MODULE
// Runs inside index.html. Backend remains the security boundary.
// ==========================================

const ADMIN_API_URL = 'https://pembukuan-app.viqiquotex.workers.dev';
let adminUsers = [];
let adminLoaded = false;
let adminLoading = false;

function adminCredentials() {
  try {
    const userId = localStorage.getItem('cloud_userId');
    const token = localStorage.getItem('cloud_token');
    return userId && token ? { userId, token, name: localStorage.getItem('cloud_name') || '', email: localStorage.getItem('cloud_email') || '' } : null;
  } catch { return null; }
}

function adminAuthFetch(url, options = {}) {
  const credentials = adminCredentials();
  const headers = new Headers(options.headers || {});
  if (credentials?.token) headers.set('Authorization', `Bearer ${credentials.token}`);
  headers.set('Accept', 'application/json');
  return fetch(url, { ...options, headers, credentials: 'include' });
}

function adminEscape(value) {
  return String(value ?? '').replace(/[&<>\'\"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function adminDate(value) {
  if (!value) return 'Belum pernah';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak valid';
  return new Intl.DateTimeFormat('id-ID', { dateStyle:'medium', timeStyle:'short' }).format(date);
}

function adminIsRecentlyActive(value) {
  const t = Date.parse(value || '');
  return Number.isFinite(t) && t >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}

function adminSetPanel(html) {
  const panel = document.getElementById('adminPanel');
  if (panel) panel.innerHTML = html;
}

function adminSetTabVisible(visible) {
  const button = document.getElementById('adminTabBtn');
  if (button) button.style.display = visible ? '' : 'none';
}

function adminIsAuthorized() { return Boolean(adminCredentials()); }
window.isAdminAuthorized = adminIsAuthorized;

async function adminCheckConfig() {
  const credentials = adminCredentials();
  if (!credentials) { alert('Sesi login belum tersedia. Silakan login terlebih dahulu.'); return; }
  const button = document.getElementById('adminConfigCheck');
  if (button) { button.disabled = true; button.textContent = '⏳ Mengecek...'; }
  try {
    const response = await adminAuthFetch(`${ADMIN_API_URL}/api/admin/config-status`);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Sesi login tidak valid atau sudah kedaluwarsa.');
    if (!response.ok) throw new Error(data.error || `Worker mengembalikan HTTP ${response.status}.`);
    const adminState = data.adminConfigured ? '✅ TERSEDIA' : '❌ TIDAK TERSEDIA';
    const kvState = data.kvConfigured ? '✅ TERSEDIA' : '❌ TIDAK TERSEDIA';
    adminSetPanel(`<div class="content-card admin-diagnostic-card"><div class="admin-toolbar"><div><span class="admin-kicker">SYSTEM CHECK</span><h3>🔎 Diagnostik Worker</h3><p>Pengecekan aman konfigurasi runtime. Nilai rahasia tidak ditampilkan.</p></div><button class="btn btn-secondary" id="adminConfigBack" type="button">← Kembali</button></div><div class="admin-status ${data.adminConfigured && data.kvConfigured ? 'success' : 'error'}" style="margin-top:14px"><strong>ADMIN_EMAIL: ${adminState}</strong><br><strong>PEMBUKUAN_KV: ${kvState}</strong><p style="margin:8px 0 0">Sesi login: ✅ terautentikasi</p></div><div style="margin-top:14px;opacity:.7;font-size:.9rem">Pengecekan: ${adminEscape(data.checkedAt || new Date().toISOString())}</div></div>`);
    document.getElementById('adminConfigBack')?.addEventListener('click', () => { adminLoaded = false; loadAdminPanel(true); });
  } catch (error) {
    adminSetPanel(`<div class="admin-status error"><strong>❌ Diagnostik gagal</strong><p style="margin:8px 0 0">${adminEscape(error.message || 'Tidak dapat memeriksa Worker.')}</p><button class="btn btn-primary" type="button" style="margin-top:12px" id="adminConfigRetry">Coba Lagi</button></div>`);
    document.getElementById('adminConfigRetry')?.addEventListener('click', adminCheckConfig);
  } finally {
    const currentButton = document.getElementById('adminConfigCheck');
    if (currentButton) { currentButton.disabled = false; currentButton.textContent = '🔎 Cek Konfigurasi'; }
  }
}
window.adminCheckConfig = adminCheckConfig;

function adminRender() {
  const panel = document.getElementById('adminPanel');
  if (!panel) return;
  const credentials = adminCredentials();
  if (!credentials) {
    adminSetTabVisible(false);
    panel.innerHTML = '<div class="admin-lock"><h3>🔒 Admin Panel Terkunci</h3><p>Login menggunakan akun administrator untuk mengakses panel ini.</p><button class="btn btn-primary" type="button" onclick="switchTab(\'cloud\')">☁️ Buka Cloud / Login</button></div>';
    return;
  }
  adminSetTabVisible(true);
  const queryEl = document.getElementById('adminUserSearch');
  const query = queryEl ? queryEl.value.trim().toLowerCase() : '';
  const filtered = adminUsers.filter(user => `${user.name || ''} ${user.email || ''} ${user.userId || ''}`.toLowerCase().includes(query));
  const total = adminUsers.length;
  const active = adminUsers.filter(user => adminIsRecentlyActive(user.lastLogin)).length;
  const recent = adminUsers.filter(user => { const t = Date.parse(user.createdAt || ''); return Number.isFinite(t) && t >= Date.now() - 7 * 24 * 60 * 60 * 1000; }).length;

  const cards = filtered.length ? filtered.map(user => {
    const isAdmin = Boolean(user.isAdmin);
    const activeNow = adminIsRecentlyActive(user.lastLogin);
    return `<article class="admin-user-card"><div class="admin-user-main"><div class="admin-avatar">${adminEscape((user.name || 'U').trim().charAt(0).toUpperCase())}</div><div class="admin-user-identity"><div class="name">${adminEscape(user.name || 'Tanpa nama')}</div><div class="sub">${adminEscape(user.email || 'Email tidak tersedia')}</div></div><span class="admin-badge ${isAdmin ? 'admin' : ''}">${isAdmin ? 'Admin' : 'User'}</span></div><div class="admin-user-meta"><div><span>Terdaftar</span><strong>${adminEscape(adminDate(user.createdAt))}</strong></div><div><span>Login terakhir</span><strong>${adminEscape(adminDate(user.lastLogin))}</strong></div><div><span>Status</span><strong class="${activeNow ? 'is-active' : 'is-idle'}">${activeNow ? '● Aktif' : '○ Tidak aktif'}</strong></div></div><div class="admin-user-footer"><span class="admin-id">ID: ${adminEscape(user.userId || '—')}</span><button class="btn btn-small" type="button" data-admin-detail="${adminEscape(user.userId)}">Lihat detail →</button></div></article>`;
  }).join('') : `<div class="admin-empty"><div class="admin-empty-icon">${query ? '⌕' : '👥'}</div><strong>${query ? 'Pengguna tidak ditemukan' : 'Belum ada pengguna'}</strong><p>${query ? 'Coba kata kunci lain.' : 'Belum ada akun pengguna yang tersedia.'}</p></div>`;

  panel.innerHTML = `<div class="admin-hero"><div><span class="admin-kicker">ADMIN CONTROL CENTER</span><h2>Monitoring Pengguna</h2><p>Kelola dan pantau aktivitas pengguna NEXA dari satu dashboard.</p></div><div class="admin-live"><span class="admin-live-dot"></span><div><strong>System Online</strong><small>Worker API terhubung</small></div></div></div><div class="admin-summary"><div class="admin-stat"><div class="label">Total Pengguna</div><div class="value">${total}</div><div class="stat-foot">Semua akun</div></div><div class="admin-stat"><div class="label">Aktif 30 Hari</div><div class="value">${active}</div><div class="stat-foot">Aktivitas terakhir</div></div><div class="admin-stat"><div class="label">User Baru 7 Hari</div><div class="value">${recent}</div><div class="stat-foot">Registrasi terbaru</div></div><div class="admin-stat admin-stat-online"><div class="label">API Status</div><div class="value">ONLINE</div><div class="stat-foot">Operational</div></div></div><div class="content-card admin-users-card"><div class="admin-toolbar"><div><span class="admin-kicker">USER MANAGEMENT</span><h3>👥 Pengguna NEXA</h3><p>${filtered.length} dari ${total} pengguna ditampilkan</p></div><div class="admin-search"><input id="adminUserSearch" type="search" placeholder="Cari nama, email, atau ID..." value="${adminEscape(query)}"><button class="btn btn-secondary" id="adminClearSearch" type="button">Reset</button><button class="btn btn-secondary" id="adminConfigCheck" type="button">🔎 Cek Konfigurasi</button><button class="btn btn-primary" id="adminRefresh" type="button">↻ Refresh</button></div></div><div id="adminStatus" class="admin-status success" style="margin:14px 0">Admin terverifikasi • ${adminEscape(credentials.email || 'akun administrator')}</div><div class="admin-user-list">${cards}</div></div>`;

  document.getElementById('adminUserSearch')?.addEventListener('input', adminRender);
  document.getElementById('adminClearSearch')?.addEventListener('click', () => { const el = document.getElementById('adminUserSearch'); if (el) el.value = ''; adminRender(); });
  document.getElementById('adminConfigCheck')?.addEventListener('click', adminCheckConfig);
  document.getElementById('adminRefresh')?.addEventListener('click', () => window.loadAdminPanel(true));
  panel.querySelectorAll('[data-admin-detail]').forEach(button => button.addEventListener('click', () => adminShowDetail(button.dataset.adminDetail)));
}

function adminRenderAccessError(title, message) {
  adminSetPanel(`<div class="admin-status error"><strong>❌ ${adminEscape(title)}</strong><p style="margin:8px 0 0">${adminEscape(message)}</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-secondary" type="button" id="adminConfigCheck" onclick="adminCheckConfig()">🔎 Cek Konfigurasi</button><button class="btn btn-primary" type="button" onclick="loadAdminPanel(true)">↻ Coba Lagi</button></div></div>`);
}

function adminShowDetail(userId) {
  const user = adminUsers.find(item => item.userId === userId);
  if (!user) return;
  const active = adminIsRecentlyActive(user.lastLogin);
  adminSetPanel(`<div class="admin-detail-view"><div class="admin-detail-head"><button class="btn btn-secondary" id="adminDetailBack" type="button">← Kembali</button><span class="admin-kicker">USER PROFILE</span><h2>${adminEscape(user.name || 'Tanpa nama')}</h2><p>${adminEscape(user.email || 'Email tidak tersedia')}</p></div><div class="admin-detail-grid"><div class="admin-detail-item"><small>Role</small><strong>${user.isAdmin ? 'Administrator' : 'User'}</strong></div><div class="admin-detail-item"><small>Status aktivitas</small><strong class="${active ? 'is-active' : 'is-idle'}">${active ? '● Aktif 30 hari terakhir' : '○ Tidak login 30 hari terakhir'}</strong></div><div class="admin-detail-item"><small>User ID</small><strong class="break-anywhere">${adminEscape(user.userId || '—')}</strong></div><div class="admin-detail-item"><small>Terdaftar</small><strong>${adminEscape(adminDate(user.createdAt))}</strong></div><div class="admin-detail-item"><small>Login terakhir</small><strong>${adminEscape(adminDate(user.lastLogin))}</strong></div><div class="admin-detail-item"><small>Email</small><strong class="break-anywhere">${adminEscape(user.email || '—')}</strong></div></div></div>`);
  document.getElementById('adminDetailBack')?.addEventListener('click', () => { adminLoaded = false; loadAdminPanel(true); });
}

async function loadAdminPanel(force = false) {
  if (adminLoading) return;
  if (!force && adminLoaded) { adminRender(); return; }
  const credentials = adminCredentials();
  if (!credentials) { adminLoaded = false; adminSetTabVisible(false); adminRender(); return; }
  adminLoading = true;
  adminSetTabVisible(true);
  adminSetPanel('<div class="admin-loading"><div class="admin-loading-ring"></div><strong>Memuat dashboard administrator...</strong><span>Mengambil data pengguna secara aman</span></div>');
  try {
    const response = await adminAuthFetch(`${ADMIN_API_URL}/api/admin/users`);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.');
    if (response.status === 403) { adminRenderAccessError('Akses ditolak', 'Email akun login tidak terdaftar sebagai ADMIN_EMAIL.'); return; }
    if (response.status === 503) { adminRenderAccessError('ADMIN_EMAIL belum tersedia pada Worker yang aktif', 'Periksa Variables & Secrets Cloudflare. Klik Cek Konfigurasi untuk melihat status runtime tanpa menampilkan nilai rahasia.'); return; }
    if (!response.ok) throw new Error(data.error || 'Gagal mengambil data pengguna.');
    adminUsers = Array.isArray(data.users) ? data.users : [];
    adminLoaded = true;
    adminRender();
  } catch (error) {
    adminUsers = [];
    adminLoaded = false;
    adminRenderAccessError('Gagal memuat Admin Panel', error.message || 'Backend tetap melindungi data admin.');
  } finally { adminLoading = false; }
}
window.loadAdminPanel = loadAdminPanel;

function initializeAdminModule() {
  const credentials = adminCredentials();
  adminSetTabVisible(Boolean(credentials));
  if (credentials && document.getElementById('admin')?.classList.contains('active')) loadAdminPanel();
}
window.addEventListener('DOMContentLoaded', initializeAdminModule);
window.addEventListener('storage', initializeAdminModule);
