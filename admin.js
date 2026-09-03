// ==========================================
// NEXA ADMIN PANEL - INTEGRATED MODULE
// Runs inside index.html. Backend remains the security boundary.
// ==========================================

const ADMIN_API_URL = 'https://pembukuan-app.viqiquotex.workers.dev';
let adminUsers = [];
let adminLoaded = false;
let adminLoading = false;

function adminInjectStyles() {
  if (document.getElementById('nexaAdminProfessionalStyles')) return;
  const style = document.createElement('style');
  style.id = 'nexaAdminProfessionalStyles';
  style.textContent = `
    .admin-shell { min-width:0; width:100%; }
    .admin-hero { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:24px; border:1px solid rgba(225,226,235,.88); border-radius:20px; background:linear-gradient(135deg,#fff 0%,#f8f8ff 100%); box-shadow:0 12px 32px rgba(37,39,75,.065); }
    .admin-hero h2 { margin:5px 0 5px; letter-spacing:-.8px; }
    .admin-hero p { margin:0; color:#737789; font-size:12px; }
    .admin-kicker { display:inline-block; color:#5b5ce2; font-size:9px; font-weight:800; letter-spacing:1.35px; }
    .admin-live { display:flex; align-items:center; gap:10px; padding:10px 13px; border:1px solid rgba(69,168,107,.16); border-radius:14px; background:rgba(69,168,107,.07); white-space:nowrap; }
    .admin-live-dot { width:8px; height:8px; border-radius:50%; background:#45a86b; box-shadow:0 0 0 4px rgba(69,168,107,.10); }
    .admin-live strong,.admin-live small { display:block; }
    .admin-live strong { font-size:11px; }
    .admin-live small { margin-top:2px; color:#737789; font-size:9px; }
    .admin-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .admin-stat { min-width:0; padding:18px; border:1px solid rgba(225,226,235,.9); border-radius:17px; background:#fff; box-shadow:0 9px 25px rgba(37,39,75,.055); }
    .admin-stat .label { color:#737789; font-size:9px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .admin-stat .value { margin-top:6px; font-size:25px; font-weight:800; letter-spacing:-.7px; }
    .admin-stat .stat-foot { margin-top:4px; color:#9699a8; font-size:9px; }
    .admin-stat-online .value { color:#45a86b; font-size:18px; letter-spacing:0; }
    .admin-users-card { min-width:0; overflow:hidden; }
    .admin-users-card .admin-toolbar { align-items:flex-start; }
    .admin-search { min-width:0; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
    .admin-search input { min-width:220px; }
    .admin-user-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .admin-user-card { min-width:0; padding:16px; border:1px solid rgba(127,127,127,.13); border-radius:16px; background:linear-gradient(180deg,#fff 0%,#fafaff 100%); transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease; }
    .admin-user-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(37,39,75,.08); border-color:rgba(91,92,226,.18); }
    .admin-user-main { display:flex; align-items:center; gap:11px; min-width:0; }
    .admin-avatar { flex:0 0 40px; width:40px; height:40px; display:grid; place-items:center; border-radius:13px; background:linear-gradient(145deg,#8586ff,#5556dc); color:#fff; font-weight:800; box-shadow:0 7px 16px rgba(91,92,226,.18); }
    .admin-user-identity { min-width:0; flex:1; }
    .admin-user-identity .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:800; }
    .admin-user-identity .sub { margin-top:3px; overflow-wrap:anywhere; color:#737789; font-size:10px; }
    .admin-badge { flex:0 0 auto; display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(127,127,127,.10); font-size:9px; font-weight:800; }
    .admin-badge.admin { background:rgba(69,168,107,.13); color:#2d8a55; }
    .admin-user-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid rgba(127,127,127,.09); }
    .admin-user-meta div { min-width:0; }
    .admin-user-meta span,.admin-user-meta strong { display:block; }
    .admin-user-meta span { color:#9699a8; font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; }
    .admin-user-meta strong { margin-top:3px; overflow-wrap:anywhere; font-size:10px; }
    .is-active { color:#2d8a55 !important; }
    .is-idle { color:#8c8f9d !important; }
    .admin-user-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:13px; }
    .admin-id { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#9a9eac; font-size:8px; }
    .admin-user-footer .btn { flex:0 0 auto; }
    .admin-empty { padding:38px 15px; text-align:center; color:#737789; }
    .admin-empty-icon { margin-bottom:8px; font-size:27px; opacity:.55; }
    .admin-empty strong { display:block; color:#303243; font-size:13px; }
    .admin-empty p { margin:5px 0 0; font-size:10px; }
    .admin-loading { display:grid; justify-items:center; gap:7px; padding:45px 15px; color:#737789; font-size:11px; }
    .admin-loading strong { color:#303243; }
    .admin-loading-ring { width:25px; height:25px; border:3px solid rgba(91,92,226,.14); border-top-color:#5b5ce2; border-radius:50%; animation:adminSpin .8s linear infinite; }
    @keyframes adminSpin { to { transform:rotate(360deg); } }
    .admin-detail-view { min-width:0; }
    .admin-detail-head { padding:22px; border:1px solid rgba(225,226,235,.9); border-radius:20px; background:linear-gradient(135deg,#fff,#f8f8ff); box-shadow:0 12px 32px rgba(37,39,75,.065); }
    .admin-detail-head h2 { margin:8px 0 3px; overflow-wrap:anywhere; letter-spacing:-.7px; }
    .admin-detail-head p { margin:0; overflow-wrap:anywhere; color:#737789; font-size:11px; }
    .admin-detail-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:12px; }
    .admin-detail-item { min-width:0; padding:15px; border:1px solid rgba(225,226,235,.9); border-radius:14px; background:#fff; }
    .admin-detail-item small { display:block; color:#9699a8; font-size:8px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
    .admin-detail-item strong { display:block; margin-top:5px; overflow-wrap:anywhere; font-size:11px; }
    .break-anywhere { word-break:break-all; }
    @media (max-width:760px) {
      .admin-hero { align-items:flex-start; flex-direction:column; padding:18px; border-radius:18px; }
      .admin-live { width:100%; box-sizing:border-box; }
      .admin-summary { grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
      .admin-stat { padding:14px; border-radius:14px; }
      .admin-stat .value { font-size:21px; }
      .admin-stat-online .value { font-size:16px; }
      .admin-users-card { padding:16px !important; }
      .admin-search { width:100%; display:grid; grid-template-columns:1fr 1fr; }
      .admin-search input { width:100%; min-width:0; grid-column:1 / -1; box-sizing:border-box; }
      .admin-search .btn { width:100%; min-width:0; padding-left:8px; padding-right:8px; }
      .admin-user-list { grid-template-columns:1fr; gap:10px; }
      .admin-user-card { padding:14px; border-radius:15px; }
      .admin-user-meta { grid-template-columns:1fr; }
      .admin-user-footer { align-items:flex-end; }
      .admin-id { max-width:52%; }
      .admin-detail-head { padding:18px; }
      .admin-detail-grid { grid-template-columns:1fr; }
      .admin-status { overflow-wrap:anywhere; }
    }
    @media (max-width:420px) {
      .admin-summary { gap:7px; }
      .admin-stat { padding:12px; }
      .admin-stat .label { font-size:8px; }
      .admin-stat .value { font-size:19px; }
      .admin-search { grid-template-columns:1fr; }
      .admin-user-main { align-items:flex-start; }
      .admin-badge { font-size:8px; }
      .admin-user-footer { flex-direction:column; align-items:stretch; }
      .admin-id { max-width:100%; }
      .admin-user-footer .btn { width:100%; }
    }
  `;
  document.head.appendChild(style);
}

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

function adminSetPanel(html) { const panel = document.getElementById('adminPanel'); if (panel) panel.innerHTML = html; }
function adminSetTabVisible(visible) { const button = document.getElementById('adminTabBtn'); if (button) button.style.display = visible ? '' : 'none'; }
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
  adminInjectStyles();
  const credentials = adminCredentials();
  adminSetTabVisible(Boolean(credentials));
  if (credentials && document.getElementById('admin')?.classList.contains('active')) loadAdminPanel();
}
window.addEventListener('DOMContentLoaded', initializeAdminModule);
window.addEventListener('storage', initializeAdminModule);
