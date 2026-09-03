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
    return userId && token ? {
      userId,
      token,
      name: localStorage.getItem('cloud_name') || '',
      email: localStorage.getItem('cloud_email') || ''
    } : null;
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

function adminIsAuthorized() {
  return Boolean(adminCredentials());
}
window.isAdminAuthorized = adminIsAuthorized;

async function adminCheckConfig() {
  const credentials = adminCredentials();
  if (!credentials) {
    alert('Sesi login belum tersedia. Silakan login terlebih dahulu.');
    return;
  }

  const button = document.getElementById('adminConfigCheck');
  if (button) {
    button.disabled = true;
    button.textContent = '⏳ Mengecek...';
  }

  try {
    const response = await adminAuthFetch(`${ADMIN_API_URL}/api/admin/config-status`);
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      throw new Error('Sesi login tidak valid atau sudah kedaluwarsa.');
    }
    if (!response.ok) {
      throw new Error(data.error || `Worker mengembalikan HTTP ${response.status}.`);
    }

    const adminState = data.adminConfigured ? '✅ TERSEDIA' : '❌ TIDAK TERSEDIA';
    const kvState = data.kvConfigured ? '✅ TERSEDIA' : '❌ TIDAK TERSEDIA';

    adminSetPanel(`
      <div class="content-card">
        <div class="admin-toolbar">
          <div>
            <h3>🔎 Diagnostik Worker</h3>
            <p>Pengecekan aman konfigurasi runtime. Nilai rahasia tidak ditampilkan.</p>
          </div>
          <button class="btn btn-secondary" id="adminConfigBack" type="button">← Kembali</button>
        </div>
        <div class="admin-status ${data.adminConfigured && data.kvConfigured ? 'success' : 'error'}" style="margin-top:14px">
          <strong>ADMIN_EMAIL: ${adminState}</strong><br>
          <strong>PEMBUKUAN_KV: ${kvState}</strong>
          <p style="margin:8px 0 0">Sesi login: ✅ terautentikasi</p>
        </div>
        <div style="margin-top:14px;opacity:.7;font-size:.9rem">Pengecekan: ${adminEscape(data.checkedAt || new Date().toISOString())}</div>
      </div>
    `);

    document.getElementById('adminConfigBack')?.addEventListener('click', () => {
      adminLoaded = false;
      loadAdminPanel(true);
    });
  } catch (error) {
    adminSetPanel(`
      <div class="admin-status error">
        <strong>❌ Diagnostik gagal</strong>
        <p style="margin:8px 0 0">${adminEscape(error.message || 'Tidak dapat memeriksa Worker.')}</p>
        <button class="btn btn-primary" type="button" style="margin-top:12px" id="adminConfigRetry">Coba Lagi</button>
      </div>
    `);
    document.getElementById('adminConfigRetry')?.addEventListener('click', adminCheckConfig);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '🔎 Cek Konfigurasi';
    }
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
  const rows = filtered.length ? filtered.map(user => {
    const isAdmin = Boolean(user.isAdmin);
    return `<tr><td><div class="name">${adminEscape(user.name || 'Tanpa nama')}</div><div class="sub">ID: ${adminEscape(user.userId || '—')}</div></td><td>${adminEscape(user.email || '—')}</td><td>${adminEscape(adminDate(user.createdAt))}</td><td>${adminEscape(adminDate(user.lastLogin))}</td><td><span class="admin-badge ${isAdmin ? 'admin' : ''}">${isAdmin ? 'Admin' : 'User'}</span></td><td><button class="btn btn-small" type="button" data-admin-detail="${adminEscape(user.userId)}">Detail</button></td></tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center;padding:25px;opacity:.65">${query ? 'Tidak ada pengguna yang cocok.' : 'Belum ada pengguna terdaftar.'}</td></tr>`;
  const total = adminUsers.length;
  const active = adminUsers.filter(user => adminIsRecentlyActive(user.lastLogin)).length;
  const recent = adminUsers.filter(user => { const t = Date.parse(user.createdAt || ''); return Number.isFinite(t) && t >= Date.now() - 7 * 24 * 60 * 60 * 1000; }).length;
  panel.innerHTML = `<div class="admin-summary"><div class="admin-stat"><div class="label">Total Pengguna</div><div class="value">${total}</div></div><div class="admin-stat"><div class="label">Aktif 30 Hari</div><div class="value">${active}</div></div><div class="admin-stat"><div class="label">User Baru 7 Hari</div><div class="value">${recent}</div></div><div class="admin-stat"><div class="label">API</div><div class="value" id="adminApiState">ONLINE</div></div></div><div class="content-card"><div class="admin-toolbar"><div><h3>👥 Pengguna NEXA</h3><p>${filtered.length} dari ${total} pengguna ditampilkan</p></div><div class="admin-search"><input id="adminUserSearch" type="search" placeholder="Cari nama, email, atau ID..." value="${adminEscape(query)}"><button class="btn btn-secondary" id="adminClearSearch" type="button">Reset</button><button class="btn btn-secondary" id="adminConfigCheck" type="button">🔎 Cek Konfigurasi</button><button class="btn btn-primary" id="adminRefresh" type="button">↻ Refresh</button></div></div><div id="adminStatus" class="admin-status success" style="margin:14px 0">Admin terverifikasi • ${adminEscape(credentials.email || 'akun administrator')}</div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Pengguna</th><th>Email</th><th>Terdaftar</th><th>Login Terakhir</th><th>Role</th><th>Aksi</th></tr></thead><tbody id="adminUsersBody">${rows}</tbody></table></div></div>`;
  document.getElementById('adminUserSearch')?.addEventListener('input', adminRender);
  document.getElementById('adminClearSearch')?.addEventListener('click', () => { const el = document.getElementById('adminUserSearch'); if (el) el.value = ''; adminRender(); });
  document.getElementById('adminConfigCheck')?.addEventListener('click', adminCheckConfig);
  document.getElementById('adminRefresh')?.addEventListener('click', () => window.loadAdminPanel(true));
  panel.querySelectorAll('[data-admin-detail]').forEach(button => button.addEventListener('click', () => adminShowDetail(button.dataset.adminDetail)));
}

function adminShowDetail(userId) {
  const user = adminUsers.find(item => item.userId === userId);
  if (!user) return;
  const message = `Nama: ${user.name || 'Tanpa nama'}\nEmail: ${user.email || '—'}\nID: ${user.userId || '—'}\nTerdaftar: ${adminDate(user.createdAt)}\nLogin terakhir: ${adminDate(user.lastLogin)}\nStatus: ${adminIsRecentlyActive(user.lastLogin) ? 'Aktif 30 hari terakhir' : 'Tidak login 30 hari terakhir'}`;
  alert(message);
}

async function loadAdminPanel(force = false) {
  if (adminLoading) return;
  if (!force && adminLoaded) { adminRender(); return; }
  const credentials = adminCredentials();
  if (!credentials) {
    adminLoaded = false;
    adminSetTabVisible(false);
    adminRender();
    return;
  }
  adminLoading = true;
  adminSetTabVisible(true);
  adminSetPanel('<div class="admin-loading">⏳ Memuat data administrator...</div>');
  try {
    const response = await adminAuthFetch(`${ADMIN_API_URL}/api/admin/users`);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Sesi login tidak valid atau sudah kedaluwarsa. Silakan login kembali.');
    if (response.status === 403) throw new Error('Akses ditolak. Email akun login tidak terdaftar sebagai ADMIN_EMAIL.');
    if (response.status === 503) throw new Error('ADMIN_EMAIL belum tersedia pada Worker yang aktif. Periksa Variables & Secrets Cloudflare.');
    if (!response.ok) throw new Error(data.error || 'Gagal mengambil data pengguna.');
    adminUsers = Array.isArray(data.users) ? data.users : [];
    adminLoaded = true;
    adminRender();
  } catch (error) {
    adminUsers = [];
    adminLoaded = false;
    adminSetPanel(`<div class="admin-status error"><strong>❌ ${adminEscape(error.message || 'Gagal memuat Admin Panel')}</strong><p style="margin:8px 0 0">Backend tetap melindungi data admin. Periksa sesi login dan konfigurasi ADMIN_EMAIL jika diperlukan.</p><button class="btn btn-primary" type="button" style="margin-top:12px" onclick="loadAdminPanel(true)">Coba Lagi</button></div>`);
  } finally {
    adminLoading = false;
  }
}
window.loadAdminPanel = loadAdminPanel;

function initializeAdminModule() {
  const credentials = adminCredentials();
  adminSetTabVisible(Boolean(credentials));
  if (credentials && document.getElementById('admin')?.classList.contains('active')) loadAdminPanel();
}

window.addEventListener('DOMContentLoaded', initializeAdminModule);
window.addEventListener('storage', initializeAdminModule);
