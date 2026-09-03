// ==========================================
// NEXA AUTH - SHARED AUTHENTICATION LAYER
// Single source of truth for cloud authentication.
// Loaded before cloud.js on every page that uses Cloud.
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
  if (!userId) return null;
  return {
    userId,
    email: localStorage.getItem('cloud_email') || '',
    name: localStorage.getItem('cloud_name') || '',
    token: localStorage.getItem('cloud_token') || ''
  };
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

function isCloudConnected() {
  const credentials = getCloudCredentials();
  return !!credentials?.userId && !!credentials?.token;
}

function authFetch(url, options = {}) {
  const token = localStorage.getItem('cloud_token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(url, { ...options, headers, credentials: 'include' });
}

async function safeJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function handleAuthFailure(message = 'Sesi cloud sudah berakhir. Silakan login kembali.') {
  clearCloudCredentials();
  if (typeof showAlert === 'function') showAlert(`🔐 ${message}`, 'error');
  if (typeof updateCloudStatus === 'function') setTimeout(() => updateCloudStatus(), 100);
}

async function validateCloudSession() {
  const credentials = getCloudCredentials();
  if (!credentials?.userId || !credentials?.token) return false;
  try {
    const response = await authFetch(API_ENDPOINTS.profile, { method: 'GET' });
    const data = await safeJson(response);
    if (response.status === 401) {
      handleAuthFailure(data.error);
      return false;
    }
    if (!response.ok || !data.userId || data.userId !== credentials.userId) return false;
    saveCloudCredentials({
      userId: data.userId,
      name: data.name,
      email: data.email,
      token: credentials.token
    });
    return true;
  } catch {
    return false;
  }
}
