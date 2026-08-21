# 📊 Pembukuan App - Aplikasi Pencatat Keuangan

Aplikasi web sederhana untuk mencatat pemasukan dan pengeluaran dengan fitur rekap bulanan.

## ✨ Fitur

- ✅ **Input Transaksi** - Catat pemasukan & pengeluaran dengan kategori
- 📋 **Riwayat Transaksi** - Lihat semua transaksi yang sudah dicatat
- 📊 **Rekap Bulanan** - Lihat ringkasan pemasukan, pengeluaran & saldo per bulan
- 💾 **Penyimpanan Lokal** - Data disimpan di browser (localStorage)
- 📱 **Responsive** - Bisa diakses dari desktop, tablet, & smartphone
- 🎨 **UI Modern** - Interface yang clean dan user-friendly

## 🚀 Cara Akses

### Online (GitHub Pages)
```
https://viqiquotex-art.github.io/pembukuan-app/
```

### Lokal
1. Clone repository:
```bash
git clone https://github.com/viqiquotex-art/pembukuan-app.git
cd pembukuan-app
```

2. Buka file `index.html` di browser:
```bash
# Bisa langsung double-click index.html
# Atau gunakan live server
```

## 📝 Cara Penggunaan

### Tab 1: Input Transaksi
1. Pilih tipe: **Pemasukan** atau **Pengeluaran**
2. Pilih kategori sesuai jenis transaksi
3. Masukkan jumlah (dalam Rupiah)
4. Pilih tanggal transaksi
5. (Opsional) Tambahkan keterangan
6. Klik **Simpan Transaksi**

### Tab 2: Riwayat
- Lihat ringkasan hari ini (total pemasukan, pengeluaran, saldo)
- Lihat daftar semua transaksi (terbaru di atas)
- Hapus transaksi jika ada kesalahan

### Tab 3: Rekap Bulanan
- Lihat ringkasan setiap bulan
- Menampilkan total pemasukan, pengeluaran, dan saldo
- Bulan terbaru ditampilkan paling atas

## 🔧 Teknologi

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Storage:** Browser LocalStorage
- **Format:** Single Page Application (SPA)

## 💡 Fitur yang Bisa Ditambahkan (Future)

- [ ] Export data ke Excel/PDF
- [ ] Backup & restore data
- [ ] Filter transaksi berdasarkan kategori
- [ ] Statistik grafik per bulan
- [ ] Dark mode
- [ ] Cloud sync (Firebase, dll)
- [ ] Budgeting & financial goals
- [ ] Multiple users/accounts

## ⚠️ Catatan Penting

**Data disimpan di localStorage browser lokal Anda.** Artinya:
- Data hanya tersimpan di device yang Anda gunakan
- Jika menghapus cache/history browser, data akan hilang
- Tidak ada backup otomatis ke server

**Solusi:**
- Gunakan fitur export (ketika ditambahkan)
- Atau gunakan cloud storage integration (akan ditambahkan soon)

## 📱 Kategori Transaksi

### Pemasukan 💰
- Gaji/Upah
- Freelance
- Investasi
- Bonus
- Penjualan
- Lainnya

### Pengeluaran 💸
- Makanan
- Transportasi
- Belanja
- Hiburan
- Kesehatan
- Listrik/Internet
- Sewa
- Lainnya

## 📞 Feedback & Saran

Punya saran atau menemukan bug? Buat issue di repository ini! 🙌

---

**Dibuat dengan ❤️ by Viqi**