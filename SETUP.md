// ==========================================
// PEMBUKUAN APP - SETUP & DEPLOYMENT GUIDE
// ==========================================

# 🚀 Setup & Deployment Guide - Pembukuan App

## 📋 Daftar Isi
1. [Quick Start](#quick-start)
2. [Setup Cloud Sync (Cloudflare Workers)](#setup-cloud-sync-cloudflare-workers)
3. [Konfigurasi API](#konfigurasi-api)
4. [Deployment](#deployment)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Lokal (Offline Mode)
1. Clone repository:
```bash
git clone https://github.com/viqiquotex-art/pembukuan-app.git
cd pembukuan-app
```

2. Buka `index.html` di browser:
```bash
# Atau gunakan live server
npx http-server
# atau
python -m http.server 8000
```

3. Akses di: `http://localhost:8000`

### Mode Cloud (dengan Sync)
Ikuti langkah di bawah untuk setup Cloudflare Worker terlebih dahulu.

---

## Setup Cloud Sync (Cloudflare Workers)

### Prerequisites
- ✅ Cloudflare Account (gratis di https://dash.cloudflare.com)
- ✅ Node.js & npm installed
- ✅ Wrangler CLI

### Langkah 1: Install Wrangler CLI

```bash
npm install -g wrangler
```

Verifikasi:
```bash
wrangler --version
```

### Langkah 2: Login ke Cloudflare

```bash
wrangler login
```

Ini akan membuka browser untuk authentication.

### Langkah 3: Setup Project Wrangler

Buat folder project baru:
```bash
mkdir pembukuan-api
cd pembukuan-api
wrangler init
```

Pilih opsi saat diminta:
- `Would you like to use git to manage this project?` → Yes
- `Do you want to install wrangler into your project?` → Yes
- `Which template would you like to start with?` → Select "hello world"

### Langkah 4: Update `wrangler.toml`

Edit file `wrangler.toml`:

```toml
name = "pembukuan-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[env.production.kv_namespaces]]
binding = "PEMBUKUAN_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-namespace-id"

[env.production]
name = "pembukuan-api-prod"
```

### Langkah 5: Buat KV Namespace

```bash
wrangler kv:namespace create PEMBUKUAN_KV
```

Output akan berisi `id` dan `preview_id`. Copy dan paste ke `wrangler.toml` (Langkah 4).

Untuk production:
```bash
wrangler kv:namespace create PEMBUKUAN_KV --preview false
```

### Langkah 6: Copy Worker Code

Buat file `src/index.js` dan copy isi dari `worker.js` di repository ini:

```bash
cp ../pembukuan-app/worker.js src/index.js
```

Atau copy-paste manual kode dari `worker.js`.

### Langkah 7: Deploy Worker

```bash
wrangler deploy
```

Output akan menampilkan URL Worker Anda:
```
✅ Successfully published your Worker to
https://pembukuan-api.your-subdomain.workers.dev
```

**Simpan URL ini** - Anda akan membutuhkannya di langkah berikutnya.

---

## Konfigurasi API

### Update API Base URL di Frontend

Di `app.js` dan `cloud.js`, update URL API:

**File: `app.js` (Line 27)**
```javascript
const API_BASE_URL = 'https://pembukuan-api.your-subdomain.workers.dev';
```

**File: `cloud.js` (Line 8)**
```javascript
const API_BASE_URL = 'https://pembukuan-api.your-subdomain.workers.dev';
```

Ganti `your-subdomain` dengan subdomain Worker Anda.

### Testing API Endpoints

Sebelum deploy, test endpoint API:

```bash
# Test health endpoint
curl https://pembukuan-api.your-subdomain.workers.dev/api/health

# Response yang diharapkan:
# {"status":"ok","message":"Pembukuan API is running ⚡","timestamp":"..."}
```

---

## Deployment

### Deploy ke GitHub Pages (Frontend)

```bash
# 1. Build (jika perlu)
# Untuk app ini, tidak ada build step khusus

# 2. Push ke repository
git add .
git commit -m "Update API configuration"
git push origin main

# 3. Aktifkan GitHub Pages
# - Buka repository settings
# - Pilih "Pages"
# - Pilih branch "main" dan folder "/ (root)"
# - Save

# 4. Akses di:
# https://viqiquotex-art.github.io/pembukuan-app/
```

### Deploy Worker ke Production

```bash
# Dari folder pembukuan-api
wrangler deploy --env production
```

### Custom Domain (Optional)

Untuk menggunakan domain custom dengan Cloudflare Worker:

1. Beli domain atau gunakan yang sudah ada
2. Setup di Cloudflare (docs: https://developers.cloudflare.com/workers/platform/routing/routes/)
3. Update `wrangler.toml`:

```toml
[[routes]]
pattern = "api.your-domain.com/*"
zone_name = "your-domain.com"
```

4. Deploy ulang:
```bash
wrangler deploy
```

---

## Fitur Cloud Sync

### Login / Register

1. Buka tab "☁️ Cloud Storage"
2. Klik "🔑 Login / Daftar Cloud"
3. Register account baru atau login dengan existing account

### Manual Sync

**Sync ke Cloud:**
1. Buka tab "☁️ Cloud Storage"
2. Klik "📤 Sync ke Cloud"
3. Semua transaksi akan di-backup ke cloud

**Load dari Cloud:**
1. Buka tab "☁️ Cloud Storage"
2. Klik "📥 Muat dari Cloud"
3. Data akan dimuat dan di-merge dengan data lokal

### Auto Sync

Auto sync aktif otomatis ketika:
- Menambah transaksi baru
- Edit transaksi
- Delete transaksi

Jika cloud terhubung, semua perubahan akan otomatis di-sync ke cloud.

---

## Troubleshooting

### "API Request Failed" / "Cannot reach server"

**Problem:** App tidak bisa connect ke cloud API

**Solution:**
1. Cek apakah Worker sudah ter-deploy:
   ```bash
   wrangler deployments list
   ```

2. Test endpoint:
   ```bash
   curl https://pembukuan-api.your-subdomain.workers.dev/api/health
   ```

3. Jika error, cek logs:
   ```bash
   wrangler tail
   ```

4. Pastikan API URL di `app.js` dan `cloud.js` sudah benar

### "CORS Error"

**Problem:** Browser block API request karena CORS

**Solution:** 
CORS sudah dikonfigurasi di `worker.js`. Jika masih error:
1. Buka DevTools (F12)
2. Lihat Network tab
3. Check response headers harus ada:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
   ```

### Login / Register Gagal

**Problem:** Tidak bisa login atau register

**Solution:**
1. Cek apakah KV namespace sudah dibuat:
   ```bash
   wrangler kv:namespace list
   ```

2. Cek binding di `wrangler.toml` sesuai dengan KV namespace ID

3. Cek logs worker:
   ```bash
   wrangler tail
   ```

4. Pastikan database tidak ada issue dengan delete dan recreate:
   ```bash
   wrangler kv:namespace delete --binding PEMBUKUAN_KV
   wrangler kv:namespace create PEMBUKUAN_KV
   ```

### Data Tidak Sync

**Problem:** Data tidak sync ke cloud meskipun sudah login

**Solution:**
1. Cek apakah sudah login cloud di tab "☁️ Cloud Storage"
2. Klik "📤 Sync ke Cloud" manual
3. Cek browser console (F12) untuk error messages
4. Pastikan internet connection stabil

### Password Lupa

**Problem:** Lupa password cloud account

**Solution (Sementara):**
Saat ini tidak ada fitur reset password. Workaround:
1. Logout dari cloud
2. Register ulang dengan email berbeda
3. (Upcoming) Fitur reset password akan ditambahkan

---

## Advanced Configuration

### Environment Variables

Setup env variables di `wrangler.toml`:

```toml
[env.production]
vars = { 
  CORS_ORIGIN = "https://viqiquotex-art.github.io",
  API_VERSION = "v1"
}
```

Akses di `worker.js`:
```javascript
const corsOrigin = env.CORS_ORIGIN;
```

### Rate Limiting

Untuk menambah rate limiting (security), update `worker.js`:

```javascript
// Add this before handling requests
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const limit = 100; // requests per minute
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  const record = rateLimitMap.get(ip);
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + 60000;
    return true;
  }
  
  return ++record.count <= limit;
}
```

### Database Backup

Export data dari KV Store:

```bash
# Install kv-utils
npm install -g @cloudflare/kv-asset-handler

# Export
wrangler kv:key list --binding PEMBUKUAN_KV > backup.json
```

---

## Monitoring & Logs

### View Worker Logs

```bash
wrangler tail --env production
```

### Analytics

Cloudflare Workers memberikan analytics gratis:
1. Login ke https://dash.cloudflare.com
2. Pilih Workers → pembukuan-api
3. Lihat "Analytics" tab

---

## Security Best Practices

✅ Sudah diimplementasikan:
- CORS protection
- Input validation
- Token-based authentication

⚠️ Untuk Production (TODO):
- [ ] Ganti simple password encoding dengan bcrypt
- [ ] Implementasi rate limiting
- [ ] Setup proper JWT dengan secret key
- [ ] Enable HTTPS only
- [ ] Implement API key/secret untuk mobile apps
- [ ] Setup monitoring & alerting
- [ ] Regular security audit
- [ ] Data encryption at rest

---

## Update & Maintenance

### Pull Latest Changes

```bash
cd pembukuan-app
git pull origin main
```

### Update Worker

```bash
cd pembukuan-api
git pull origin main
wrangler deploy
```

### Database Maintenance

Clear old data (keep last 2 years):
```javascript
// Add maintenance script
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const cutoffDate = new Date(Date.now() - TWO_YEARS_MS).toISOString();

// Filter transactions older than 2 years
transactions = transactions.filter(t => t.date > cutoffDate);
```

---

## Support & Contribution

- 📝 Issues: https://github.com/viqiquotex-art/pembukuan-app/issues
- 🤝 Pull Requests: https://github.com/viqiquotex-art/pembukuan-app/pulls
- 💬 Discussions: https://github.com/viqiquotex-art/pembukuan-app/discussions

---

**Last Updated:** September 2026
**Version:** 1.0.0 with Cloud Sync
