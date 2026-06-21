# E-Konseling Kampus Final
**Sistem Informasi Layanan Konseling Mahasiswa Politeknik Negeri Lampung (POLINELA)**

E-Konseling Kampus Final adalah aplikasi berbasis web yang dirancang untuk membantu pengelolaan layanan bimbingan dan konseling mahasiswa di lingkungan Politeknik Negeri Lampung. Aplikasi ini menghubungkan mahasiswa, psikolog/konselor, dan administrator dalam satu platform terintegrasi dengan penyimpanan database online aman menggunakan Supabase.

---

## Fitur Utama

Aplikasi ini memiliki 3 level hak akses (role):

### 1. Mahasiswa (Student)
*   **Registrasi & Login**: Registrasi akun menggunakan data akademik seperti nama lengkap, NIM, program studi, semester, jenis kelamin, dan nomor telepon.
*   **Konseling Offline**: Melakukan booking jadwal bimbingan tatap muka dengan psikolog sesuai slot kuota yang tersedia, lengkap dengan nomor antrean otomatis.
*   **Konseling Online**: Konsultasi berbasis chat interaktif langsung dengan psikolog serta asisten berbasis kecerdasan buatan (Gemini API) sebagai respon awal bimbingan.
*   **Tes Kesehatan Mental**: Pengisian kuisioner mandiri PHQ-9 (Patient Health Questionnaire) untuk mendeteksi tingkat kecenderungan depresi atau kecemasan awal beserta rekomendasi tindakannya.
*   **Profil Pengguna**: Manajemen profil mandiri termasuk pengunggahan gambar profil (avatar) bauran Base64 dengan batas maksimal ukuran file 2 MB.
*   **Riwayat Konseling**: Melihat riwayat lengkap konsultasi online/offline serta catatan hasil bimbingan yang telah diselesaikan oleh psikolog.

### 2. Psikolog / Konselor
*   **Manajemen Antrean Offline**: Melakukan pembaruan status bimbingan mahasiswa (`Diterima`, `CHECK_IN`, `Sedang Berlangsung`, `Selesai`, `Dibatalkan`) secara berurutan.
*   **Pencatatan Klinis**: Mengisi lembar hasil bimbingan yang terdiri dari `Catatan Konsultasi`, `Hasil Observasi`, dan `Rencana Tindak Lanjut / Rekomendasi` sesaat setelah mengakhiri sesi.
*   **Konseling Online via Chat**: Membalas pesan konsultasi dari mahasiswa di ruang obrolan terdedikasi.
*   **Riwayat Kasus**: Mengakses data riwayat rekam bimbingan konsultasi masa lalu dari mahasiswa yang ditangani untuk mengevaluasi perkembangan kondisi.

### 3. Administrator
*   **Dashboard Statistik**: Memantau ringkasan statistik harian, jumlah pendaftaran antrean, dan distribusi hasil rata-rata tes PHQ-9 mahasiswa di kampus.
*   **Manajemen Akun**: Menambah, mengedit, atau menonaktifkan akun mahasiswa, psikolog, maupun admin lainnya.
*   **Manajemen Sesi & Slot**: Mengatur jadwal ketersediaan sesi konsultasi offline psikolog dan batas kuota harian.
*   **Manajemen Konten**: Mempublikasikan dan mengelola artikel edukatif seputar kesehatan mental di platform.

---

## Teknologi yang Digunakan

*   **Frontend**: React (Vite), TypeScript, Framer Motion (untuk animasi transisi), Tailwind CSS, Lucide React (untuk ikon).
*   **Backend**: Express.js (Node.js) untuk server API.
*   **Database**: Supabase PostgreSQL dengan driver `pg` (Koneksi aman).
*   **AI SDK**: `@google/genai` (integrasi Gemini).

---

## Struktur Folder Proyek

```text
├── server.ts                 # Entrypoint server Express & integrasi dev server Vite
├── package.json              # File manifest dependensi NPM dan script eksekusi
├── vite.config.ts            # Konfigurasi bundling aset frontend menggunakan Vite
├── offline_db_tables.json    # File fallback database lokal dalam format JSON
│
└── src/
    ├── main.tsx              # Titik masuk utama React frontend
    ├── App.tsx               # Root component, routing, dan pengelolaan session user
    ├── types.ts              # Definisi interface TypeScript global
    │
    ├── components/           # Kumpulan komponen antarmuka dasbor pengguna
    │   ├── AuthPage.tsx             # Halaman login dan register akun
    │   ├── AdminDashboard.tsx       # Dasbor pengelolaan data administrator
    │   ├── StudentDashboard.tsx     # Dasbor layanan mahasiswa (PHQ-9 & Booking)
    │   ├── PsychologistDashboard.tsx# Dasbor kelola antrean fisik & catatan psikolog
    │   └── ChatDashboardMenu.tsx    # Modul perpesanan obrolan konseling online
    │
    ├── db/                   # Folder driver koneksi basis data MySQL
    │   ├── mysqlConn.ts             # Pengaturan pool koneksi database
    │   └── mysqlDb.ts               # Kumpulan query pemrosesan data SQL (tabel users dan antrean)
    │
    └── data/                 # Penyedia data awal dan fallback
        ├── mockData.ts              # Dataset artikel statis awal
        ├── serverDb.ts              # Manajer penyimpanan data fallback lokal
        └── offlineDb.ts             # Manajemen proxy pertukaran API lokal
```

---

## 💡 Penjelasan Masalah Supabase & Solusi Penting

### 1. Kenapa Registrasi Akun Lokal Tidak Masuk ke Supabase?
Jika saat menjalankan aplikasi di lokal laptop Anda ada pesan error merah:
`[PostgreSQL] Koneksi atau pembuatan tabel database Supabase gagal...`
Maka sistem secara cerdas akan menyalakan **Mekanisme Database Lokal (Offline Fallback ke `offline_db_tables.json`)** agar fitur web tetap berjalan normal.
*   **Efeknya**: Server lokal akan menyimpan pendaftaran & data bimbingan di berkas lokal `offline_db_tables.json` dan **TIDAK** menyinkronkan ke Supabase karena status koneksi ke internet dibatalkan demi keamanan.
*   **Kondisi di Railway**: Di server Railway Anda, koneksi database online ke Supabase berhasil (`Sukses terhubung ke database Supabase`), sehingga pendaftaran akun baru melalui link Railway **100% langsung masuk ke database Supabase**.

### 2. Solusi Error `ENOTFOUND` & Gagal Hubung Supabase di Lokal
Jika Anda mengalami error `getaddrinfo ENOTFOUND db.wcavpuymycjanitgngbr.supabase.co` di localhost:
*   **Penyebab**: Provider Internet Anda di Indonesia (terutama **IndiHome / Telkomsel / XL**) seringkali memblokir atau gagal menyelesaikan DNS IPv6 dari server hosting Supabase (`db.xxxxx.supabase.co`).
*   **Solusi Tercepat**: 
    1. Gunakan aplikasi **VPN** atau **Cloudflare WARP 1.1.1.1** di komputer Anda saat menjalankan `npm run dev` di lokal.
    2. Atau gunakan **Pooler Connection String** dari Supabase yang mendukung dual-stack IPv4/IPv6 (bisa dilihat di dasbor Supabase -> *Settings* -> *Database* -> *Connection String* -> pilih jenis *Pooler* / port `5432` atau `6543` dengan host berakhiran `.pooler.supabase.com`).

---

## Parameter Berkas Lingkungan (`.env`)

Buat berkas bernama `.env` di direktori root aplikasi (di laptop Anda), lalu sesuaikan isinya dengan kredensial sistem koneksi database Supabase Anda:

```env
# API Key untuk kecerdasan buatan konsultasi online (Gemini AI)
GEMINI_API_KEY="ISI_DENGAN_API_KEY_GEMINI_ANDA"

# Port & URL Akses Utama Aplikasi
APP_URL="http://localhost:3000"

# Koneksi Database PostgreSQL Supabase
# Ambil dari bagian host URI pada menu Settings -> Database di Supabase Anda
DATABASE_URL="postgresql://postgres:[PASSWORD_SUPABASE_ANDA]@[HOST_SUPABASE_ANDA]:5432/postgres"

# Parameter Individual (Fallback Tambahan)
DB_HOST="[HOST_SUPABASE_ANDA]"
DB_PORT=5432
DB_USER="postgres"
DB_PASSWORD="[PASSWORD_SUPABASE_ANDA]"
DB_NAME="postgres"
```

---

## 🚀 Panduan Alur Update Kode & Deployment (GitHub $\rightarrow$ Railway)

Setiap kali Anda merubah atau memperbaiki kode aplikasi di laptop Anda, ikuti langkah-langkah berikut untuk mengirimkannya ke **GitHub** agar **Railway** melakukan update otomatis:

### Langkah 1: Update Kode ke GitHub
Buka terminal/command prompt di folder proyek Anda di laptop, jalankan perintah berurutan berikut:
```bash
# 1. Tandai semua file yang berubah
git add .

# 2. Buat catatan perubahan (commit)
git commit -m "update: perbaikan integrasi database online"

# 3. Dorong perubahan ke GitHub Anda
git push origin main
```

### Langkah 2: Railway Melakukan Auto-Deploy
Setelah jalankan `git push`, platfrom **Railway** akan mendeteksi perubahan baru di cabang `main` GitHub Anda secara otomatis:
1. Railway mengunduh kode terbaru Anda.
2. Railway menjalankan perintah pembuatan build produksi (`npm run build`).
3. Railway mematikan container lama dan menyalakan container baru (`npm start`).

### Langkah 3: Mengatasi "502 Bad Gateway" saat Deployment Berlangsung
*   Jika Anda membuka link Railway dan mendapat halaman **"502 Bad Gateway - Application failed to respond"**:
    *   **Penyebab**: Proses deploying di Railway membutuhkan waktu sekitar 1 sampai 2 menit untuk melakukan inisialisasi server, menguji koneksi Supabase, dan menjalankan migrasi struktur tabel.
    *   **Solusi**: Harap tunggu sekitar **1-2 menit**, lalu muat ulang (*Refresh/F5*) browser Anda. Setelah server benar-benar menyala penuh, halaman e-Counseling akan tampil dengan lancar dan siap digunakan!

---

## Cara Instalasi dan Menjalankan Aplikasi secara Lokal

### 1. Instalasi Dependensi NPM
Unduh seluruh package dependency yang dibutuhkan aplikasi:
```bash
npm install
```

### 2. Jalankan Aplikasi dalam Mode Pengembangan (Development)
```bash
npm run dev
```
Setelah berjalan, akses alamat berikut lewat browser Anda:
**`http://localhost:3000`**

### 3. Kompilasi dan Jalankan Mode Produksi di Lokal
```bash
# Melakukan build aset statis frontend serta kompilasi file server backend ke folder /dist
npm run build

# Menjalankan aplikasi dari hasil build produksi
npm start
```

---

## Informasi Pengembang

Sistem ini dikembangkan oleh civitas akademika untuk memudahkan koordinasi konsultasi psikologis, pendokumentasian rekam bimbingan terstruktur, serta penyelenggaraan layanan konsultasi yang mudah diakses bagi seluruh mahasiswa **Politeknik Negeri Lampung**.
