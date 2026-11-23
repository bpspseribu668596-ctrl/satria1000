# PANDUAN DEPLOYMENT & PENGEMBANGAN SATRIA
### Sistem ATK Terintegrasi & Akurat (SATRIA) - BPS

Dokumen ini merupakan panduan bagi Tim IT / Pengembang Satker BPS untuk menjalankan dan mengembangkan aplikasi SATRIA di lingkungan lokal (Local Development) maupun Server Produksi (cPanel / VPS).

---

## 1. Arsitektur & Teknologi

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, SheetJS (XLSX), jsPDF.
- **Backend API**: Node.js, Express.js, MySQL2 (Connection Pooling), JWT Authentication, CORS.
- **Database**: MySQL / MariaDB (Database tables di-generate otomatis saat backend pertama kali dijalankan).

---

## 2. Kebutuhan Sistem (Prerequisites)

1. **Node.js**: Versi 18.x atau 20.x LTS ke atas.
2. **NPM**: Bawaan Node.js (v9+ atau v10+).
3. **Database**: MySQL Server (v5.7 / v8.0) atau MariaDB (v10.3+). Bisa menggunakan XAMPP, Laragon, MySQL lokal, atau Cloud Database.

---

## 3. Langkah Instalasi & Menjalankan

### A. Persiapan Database & Backend API

1. Buka MySQL client (phpMyAdmin, DBeaver, HeidiSQL, atau Terminal) dan buat satu database baru kosong:
   ```sql
   CREATE DATABASE satria_atk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Buka terminal, masuk ke folder `server`:
   ```bash
   cd server
   ```
3. Salin file template konfigurasi `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
4. Buka file `.env` di text editor, sesuaikan kredensial database Anda:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=password_db_anda
   DB_NAME=satria_atk
   JWT_SECRET=rahasia_satria_bps_ganti_dengan_kunci_acak
   ```
5. Install dependensi backend:
   ```bash
   npm install
   ```
6. Jalankan backend:
   ```bash
   node index.js
   ```
   *Catatan: Backend akan otomatis mengeksekusi `CREATE TABLE IF NOT EXISTS` untuk 12 tabel SATRIA saat pertama kali dijalankan.*

---

### B. Persiapan Frontend

1. Buka tab terminal baru di root folder proyek (di luar folder `server`):
   ```bash
   npm install
   ```
2. Jalankan aplikasi dalam mode pengembangan (Local Dev):
   ```bash
   npm run dev
   ```
3. Akses melalui browser di URL:
   `http://localhost:5173` (atau port yang ditampilkan di terminal).

---

### C. Build untuk Produksi (Hosting / cPanel)

1. Jalankan perintah build:
   ```bash
   npm run build
   ```
2. Hasil kompilasi siap saji akan berada di folder `dist/`.
3. Upload seluruh isi folder `dist/` ke direktori web server (misal: `public_html` pada cPanel).
4. Untuk backend di cPanel, gunakan fitur **Setup Node.js App** dan arahkan startup file ke `server/index.js`.

---

## 4. Fitur Utama SATRIA

1. **Permohonan & Persetujuan Berjenjang**: Pengajuan ATK oleh pegawai, verifikasi operator, hingga persetujuan PPK/KPA secara digital.
2. **Sinkronisasi SAKTI**:
   - Format penomoran dokumen otomatis.
   - Modul Cetak Rekap Permintaan (PDF & Excel) sesuai format SAKTI.
   - Modul Bahan Opname Fisik (PDF & Excel UC_PER014) persis format SAKTI.
3. **Kartu Kendali FIFO & Valuasi Persediaan**:
   - Menghitung mutasi persediaan dengan metode FIFO murni.
   - Mencegah anomali saldo minus dan sinkron dengan Berita Acara Rekonsiliasi.
4. **Verifikasi Publik & QR Code**: Validasi keabsahan dokumen persetujuan dan kartu kendali via scan QR code.

---
*Dikembangkan untuk efisiensi dan akuntabilitas pengelolaan ATK di lingkungan Badan Pusat Statistik.*
