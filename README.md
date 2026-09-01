````markdown
1| # 📊 Pembukuan App - Aplikasi Pencatat Keuangan
2| 
3| Aplikasi web sederhana untuk mencatat pemasukan dan pengeluaran dengan fitur rekap bulanan dan cloud sync.
4| 
5| ![Version](https://img.shields.io/badge/version-1.0.0-blue)
6| ![License](https://img.shields.io/badge/license-MIT-green)
7| ![Status](https://img.shields.io/badge/status-Active-brightgreen)
8| 
9| ## ✨ Fitur Utama
10| 
11| ### 📱 Fitur Lokal (Offline)
12| - ✅ **Input Transaksi** - Catat pemasukan & pengeluaran dengan kategori
13| - 📋 **Riwayat Transaksi** - Lihat semua transaksi yang sudah dicatat
14| - ✏️ **Edit Transaksi** - Ubah transaksi yang sudah disimpan
15| - 🗑️ **Hapus Transaksi** - Hapus transaksi yang tidak perlu
16| - 📊 **Rekap Bulanan** - Lihat ringkasan pemasukan, pengeluaran & saldo per bulan
17| - 💾 **Penyimpanan Lokal** - Data disimpan di browser (localStorage)
18| - 📱 **Responsive** - Bisa diakses dari desktop, tablet, & smartphone
19| - 🎨 **UI Modern** - Interface yang clean dan user-friendly
20| 
21| ### ☁️ Fitur Cloud Sync (NEW!)
22| - 🔐 **Login & Register** - Buat akun cloud untuk sinkronisasi data
23| - ☁️ **Cloud Backup** - Backup data otomatis ke cloud
24| - 🔄 **Sync Manual** - Sync data ke cloud atau load dari cloud kapan saja
25| - 📥 **Auto Sync** - Sinkronisasi otomatis setiap kali ada perubahan
26| - 🔒 **Secure Storage** - Data terenkripsi di Cloudflare Workers
27| - 📱 **Cross Device** - Akses data dari berbagai device
28| - 🚀 **Real-time** - Sync real-time dengan KV Store
29| 
30| ## 🚀 Cara Akses
31| 
32| ### 🌐 Online (GitHub Pages)
33| ```
34| https://viqiquotex-art.github.io/pembukuan-app/
35| ```
36| 
37| ### 💻 Lokal
38| 1. Clone repository:
39| ```bash
40| git clone https://github.com/viqiquotex-art/pembukuan-app.git
41| cd pembukuan-app
42| ```
43| 
44| 2. Buka file `index.html` di browser:
45| ```bash
46| # Bisa langsung double-click index.html
47| # Atau gunakan live server
48| npx http-server
49| # atau
50| python -m http.server 8000
51| ```
52| 
53| 3. Akses di: `http://localhost:8000`
54| 
55| ### ☁️ Setup Cloud Sync
56| Lihat [SETUP.md](./SETUP.md) untuk panduan lengkap setup cloud sync dengan Cloudflare Workers.
57| 
58| ## 📝 Cara Penggunaan
59| 
60| ### Tab 1️⃣: Input Transaksi
61| 1. Pilih tipe: **Pemasukan** atau **Pengeluaran**
62| 2. Pilih kategori sesuai jenis transaksi
63| 3. Masukkan jumlah (dalam Rupiah)
64| 4. Pilih tanggal transaksi
65| 5. (Opsional) Tambahkan keterangan
66| 6. Klik **Simpan Transaksi**
67| 
68| ### Tab 2️⃣: Riwayat
69| - Lihat ringkasan hari ini (total pemasukan, pengeluaran, saldo)
70| - Lihat daftar semua transaksi (terbaru di atas)
71| - **Edit** transaksi dengan mengklik tombol ✏️
72| - **Hapus** transaksi jika ada kesalahan
73| 
74| ### Tab 3️⃣: Rekap Bulanan
75| - Lihat ringkasan setiap bulan
76| - Menampilkan total pemasukan, pengeluaran, dan saldo
77| - Bulan terbaru ditampilkan paling atas
78| 
79| ### Tab 4️⃣: Cloud Storage (NEW!)
80| - **Login Cloud** - Buat akun atau login ke cloud
81| - **Sync ke Cloud** - Backup data lokal ke cloud
82| - **Muat dari Cloud** - Load data dari cloud storage
83| - **Auto Sync** - Data otomatis tersinkronisasi saat ada perubahan
84| - **Logout** - Keluar dari akun cloud (data lokal tetap aman)
85| 
86| ## 🔧 Teknologi
87| 
88| - **Frontend:** HTML5, CSS3, Vanilla JavaScript
89| - **Storage:** Browser LocalStorage + Cloudflare KV Store
90| - **Backend:** Cloudflare Workers
91| - **Format:** Single Page Application (SPA)
92| 
93| ## 📋 Kategori Transaksi
94| 
95| ### Pemasukan 💰
96| - Gaji/Upah
97| - Freelance
98| - Investasi
99| - Bonus
100| - Penjualan
101| - Lainnya
102| 
103| ### Pengeluaran 💸
104| - Makanan
105| - Transportasi
106| - Belanja
107| - Hiburan
108| - Kesehatan
109| - Listrik/Internet
110| - Sewa
111| - Lainnya
112| 
113| ## 🎯 Fitur Mendatang
114| 
115| ### Tier 1 (In Progress)
116| - [x] Cloud Sync dengan Cloudflare Workers
117| - [x] Login & Register
118| - [x] Edit Transaksi
119| - [ ] Reset Password
120| - [ ] Rate Limiting & Security
121| 
122| ### Tier 2 (Planned)
123| - [ ] Export data ke Excel/CSV
124| - [ ] Export data ke PDF
125| - [ ] Filter transaksi berdasarkan kategori
126| - [ ] Search transaksi
127| - [ ] Statistik grafik per bulan (Chart.js)
128| - [ ] Dark mode
129| 
130| ### Tier 3 (Future)
131| - [ ] Budgeting & financial goals
132| - [ ] Multiple users/accounts
133| - [ ] Mobile app (React Native)
134| - [ ] Recurring transactions
135| - [ ] Expense forecasting
136| - [ ] Multi-currency support
137| 
138| ## ⚠️ Catatan Penting
139| 
140| ### Data Lokal (Offline Mode)
141| **Data disimpan di localStorage browser lokal Anda.** Artinya:
142| - Data hanya tersimpan di device yang Anda gunakan
143| - Jika menghapus cache/history browser, data akan hilang
144| - Tidak ada backup otomatis ke server
145| 
146| ### Cloud Sync (Online Mode)
147| **Dengan cloud sync, data Anda aman di cloud!**
147| - Data di-backup ke Cloudflare KV Store
148| - Bisa diakses dari berbagai device
149| - Terenkripsi dan aman
150| - Auto sync setiap ada perubahan
151| 
152| ### Solusi untuk Backup
153| - ✅ Gunakan cloud sync (setup di [SETUP.md](./SETUP.md))
154| - ✅ Backup manual dengan Export (soon)
154| - ✅ Browser sync jika menggunakan multiple device
155| 
156| ## 🔒 Keamanan & Privacy
157| 
158| ✅ **Implementasi saat ini:**
159| - CORS protection di API
160| - Input validation untuk mencegah XSS
161| - Token-based authentication
162| - Data encrypted di transit (HTTPS)
163| 
164| ⚠️ **Roadmap Security:**
165| - Implementasi bcrypt untuk password hashing
166| - JWT proper implementation
167| - Rate limiting untuk API
168| - Data encryption at rest
169| - Security audit regular
170| 
171| ## 📊 Contoh Data
172| 
172| ```json
173| {
174|   "id": "1693480800000_a1b2c3d4e",
175|   "type": "income",
175|   "category": "Gaji/Upah",
176|   "amount": 5000000,
177|   "date": "2024-08-31",
178|   "description": "Gaji bulanan",
179|   "createdAt": "2024-08-31T10:00:00.000Z"
180| }
181| ```
182| 
183| ## 💡 Tips & Tricks
184| 
184| 1. **Edit Transaksi**: Klik tombol ✏️ di riwayat untuk mengubah transaksi
185| 2. **Quick Delete**: Jika ada kesalahan input, langsung hapus
186| 3. **Cloud Backup**: Selalu sync ke cloud minimal sebulan sekali
187| 4. **Multi Device**: Login ke cloud dan load data di device lain
188| 5. **Rekap Rutin**: Cek rekap bulanan untuk monitoring keuangan
189| 
190| ## 🐛 Lapor Bug / Saran
191| 
191| Punya saran atau menemukan bug? Buat issue di repository ini! 🙌
192| 
193| - 📝 **Issues**: https://github.com/viqiquotex-art/pembukuan-app/issues
194| - 💬 **Discussions**: https://github.com/viqiquotex-art/pembukuan-app/discussions
195| - 🤝 **Pull Requests**: Contribution sangat diterima!
196| 
197| ## 📖 Dokumentasi
198| 
198| - [SETUP.md](./SETUP.md) - Panduan setup cloud sync & deployment
199| - [API.md](./API.md) - Dokumentasi API endpoints (coming soon)
199| - [CHANGELOG.md](./CHANGELOG.md) - Riwayat perubahan versi
200| 
201| ## 📜 License
202| 
202| MIT License - Bebas digunakan untuk keperluan pribadi & komersial
203| 
204| ## 👨‍💻 Author
205| 
205| **Viqi** - [@viqiquotex-art](https://github.com/viqiquotex-art)
206| 
207| ---
208| 
209| ### 🌟 Jika App Ini Berguna
210| Silakan beri ⭐ star di repository ini!
211| 
212| **Dibuat dengan ❤️ untuk kemudahan pencatatan keuangan**
````
