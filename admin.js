const API_URL = 'https://pembukuan-app.viqiquotex.workers.dev';

function getCredentials() {
  try {
    return JSON.parse(localStorage.getItem('cloud_credentials') || 'null');
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return 'Belum pernah';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function loadUsers() {
  const message = document.getElementById('message');
  const body = document.getElementById('usersBody');
  message.className = 'status';
  message.textContent = 'Memuat data pengguna…';
  body.innerHTML = '';

  const credentials = getCredentials();
  const token = credentials?.token;

  if (!token) {
    message.className = 'error';
    message.textContent = 'Belum login. Silakan login ke NEXA terlebih dahulu dengan akun admin.';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || (response.status === 403 ? 'Akun ini bukan admin.' : 'Gagal mengambil data pengguna.'));
    }

    const users = Array.isArray(data.users) ? data.users : [];
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('latestUser').textContent = users[0]?.name || '—';

    if (!users.length) {
      message.textContent = 'Belum ada pengguna terdaftar.';
      body.innerHTML = '<tr><td colspan="5" class="empty">Belum ada data pengguna.</td></tr>';
      return;
    }

    message.textContent = `${users.length} pengguna terdaftar`;
    body.innerHTML = users.map(user => `
      <tr>
        <td><div class="name">${escapeHtml(user.name || 'Tanpa nama')}</div></td>
        <td><div class="email">${escapeHtml(user.email)}</div></td>
        <td>${escapeHtml(formatDate(user.createdAt))}</td>
        <td>${escapeHtml(formatDate(user.lastLogin))}</td>
        <td><span class="badge">Aktif</span></td>
      </tr>
    `).join('');
  } catch (error) {
    document.getElementById('totalUsers').textContent = '—';
    document.getElementById('latestUser').textContent = '—';
    message.className = 'error';
    message.textContent = error.message || 'Terjadi kesalahan saat memuat data.';
  }
}

loadUsers();
