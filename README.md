# E-Konseling Kampus Final
**Sistem Informasi Layanan Konseling Mahasiswa Politeknik Negeri Lampung (POLINELA)**

E-Konseling Kampus Final adalah aplikasi berbasis web yang dirancang untuk membantu pengelolaan layanan bimbingan dan konseling mahasiswa di lingkungan Politeknik Negeri Lampung. Aplikasi ini menghubungkan mahasiswa, psikolog/konselor, dan administrator dalam satu platform terintegrasi.

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
*   **Database**: MySQL dengan driver `mysql2`.
*   **AI SDK**: `@google/genai` (integrasi Gemini).

---

## Struktur Folder Proyek

```text
├── schema.sql                # Skema pembuatan tabel database MySQL
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

## Konfigurasi Database

Aplikasi memerlukan database MySQL untuk mengelola autentikasi dan pencatatan bimbingan.
Ikuti instruksi di bawah ini untuk pemasangan awal database:

1.  Aktifkan server basis data MySQL melalui **XAMPP** atau **Laragon**.
2.  Buka aplikasi phpMyAdmin atau DBMS klien Anda, lalu buat database baru dengan nama `e_counseling_polinela`.
3.  Impor struktur tabel yang berada di dalam berkas **`schema.sql`** ke dalam database baru tersebut.

### Kolom Khusus Penyimpanan Profil & Catatan Konseling:
Apabila Anda merevisi skema secara manual pada phpMyAdmin, pastikan aturan-aturan tipe data kolom berikut telah disesuaikan:
*   Kolom `avatar_url` pada tabel `users` bertipe data `LONGTEXT` untuk mengakomodasi string Base64 foto profil hasil upload.
*   Kolom `catatan_konsultasi`, `hasil_observasi`, dan `rekomendasi` bertipe data `TEXT` pada tabel `antrian_konsultasi` untuk mencatat diagnosis dari psikolog.

*(Sistem ini dilengkapi fungsi modifikasi kolom otomatis yang akan dijalankan oleh backend server saat pertama kali terkoneksi ke database MySQL).*

---

## Parameter Berkas Lingkungan (`.env`)

Buat berkas bernama `.env` di direktori root aplikasi, lalu sesuaikan isinya dengan kredensial sistem database Anda:

```env
# API Key untuk kecerdasan buatan konsultasi online (Gemini AI)
GEMINI_API_KEY="ISI_DENGAN_API_KEY_GEMINI_ANDA"

# Port & URL Akses Utama Aplikasi
APP_URL="http://localhost:3000"

# Pengaturan Koneksi Database MySQL Instansi
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=""
DB_NAME=e_counseling_polinela
```

---

## Cara Instalasi dan Menjalankan Aplikasi

Pastikan Node.js (versi 18+) sudah terpasang pada sistem komputer Anda sebelum memulai langkah berikut:

### 1. Instalasi Dependensi NPM
Unduh seluruh package dependency yang dibutuhkan aplikasi:
```bash
npm install
```

### 2. Jalankan Aplikasi dalam Mode Pengembangan (Development)
Gunakan perintah ini untuk memicu kompilasi dev dan menjalankan backend Express serta frontend Vite secara simultan pada port `3000`:
```bash
npm run dev
```
Setelah berjalan, akses alamat berikut lewat peramban internet Anda:
**`http://localhost:3000`**

### 3. Kompilasi dan Jalankan Mode Produksi (Production)
Untuk melakukan kompilasi build yang dioptimalkan untuk lingkungan produksi:
```bash
# Melakukan build aset statis frontend serta kompilasi file server backend ke folder /dist
npm run build

# Menjalankan aplikasi dari hasil build produksi
npm start
```

---

## Tangkapan Layar Aplikasi (Screenshots)

*   `[Screenshot 1 - Halaman Login Mahasiswa & Staff]`
    *(Berisi tampilan autentikasi masuk multi-level pengguna)*
*   `[Screenshot 2 - Dashboard Pengajuan Jadwal Tatap Muka Mahasiswa]`
    *(Berisi panel pendaftaran slot bimbingan offline, artikel kesehatan, dan pengisian tes PHQ-9)*
*   `[Screenshot 3 - Panel Pencatatan Lembar Hasil Sesi oleh Psikolog]`
    *(Berisi lembar isian catatan konsultasi, hasil observasi, dan daftar rekomendasi pasca-konseling)*

---

## Informasi Pengembang

Sistem ini dikembangkan oleh civitas akademika untuk memudahkan koordinasi konsultasi psikologis, pendokumentasian rekam bimbingan terstruktur, serta penyelenggaraan layanan konsultasi yang mudah diakses bagi seluruh mahasiswa **Politeknik Negeri Lampung**.
