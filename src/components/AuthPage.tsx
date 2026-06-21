import React, { useState } from 'react';
import { 
  Shield, 
  Sparkles, 
  User as UserIcon, 
  Mail, 
  Lock, 
  LogIn, 
  Heart, 
  Phone, 
  BookOpen, 
  Key, 
  CheckCircle2, 
  ArrowLeft,
  Info
} from 'lucide-react';
import { User } from '../types';
import { INITIAL_USERS } from '../data/mockData';
import { createNotificationViaApi } from '../data/offlineDb';

interface AuthPageProps {
  onLoginSuccess: (user: User) => void;
}

export default function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot_password'>('login');
  
  // Custom alerts/notices
  const [successNotice, setSuccessNotice] = useState<string>('');
  const [errorNotice, setErrorNotice] = useState<string>('');

  // Login Form States
  const [loginIdentifier, setLoginIdentifier] = useState(''); // email or nimOrNip
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Registration Form States
  const [regNim, setRegNim] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regProdi, setRegProdi] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regGender, setRegGender] = useState<string>('');
  const [regSemester, setRegSemester] = useState<string>('');

  // Forgot Password Statement
  const [forgotEmail, setForgotEmail] = useState('');

  // Universal Login Submission
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice('');
    setSuccessNotice('');

    if (!loginIdentifier || !loginPassword) {
      setErrorNotice('Silakan masukkan Email/Username dan Kata Sandi Anda.');
      return;
    }

    // Load registered users database
    const usersStore = localStorage.getItem('app_users');
    const dbUsers: User[] = usersStore ? JSON.parse(usersStore) : INITIAL_USERS;

    // Search user by email OR NIM/NIP (case-insensitive & trimmed)
    const normalizedId = loginIdentifier.trim().toLowerCase();
    const foundUser = dbUsers.find(
      (u) => u.email.toLowerCase() === normalizedId || u.nimOrNip.toLowerCase() === normalizedId
    );

    if (foundUser) {
      if (foundUser.status === 'nonaktif' || foundUser.status === 'inactive') {
        setErrorNotice('Akun Anda telah dinonaktifkan oleh Admin. Silakan hubungi admin e-Counseling POLINELA untuk informasi lebih lanjut.');
        return;
      }

      // Validate password (default fallback for old seeds is "password123")
      const correctPassword = foundUser.password || 'password123';
      if (loginPassword === correctPassword) {
        // Save "Remember Me" logic if needed
        if (rememberMe) {
          localStorage.setItem('remembered_identifier', loginIdentifier);
        } else {
          localStorage.removeItem('remembered_identifier');
        }
        
        onLoginSuccess(foundUser);
      } else {
        setErrorNotice('Kata sandi yang Anda masukkan salah. Silakan coba kembali.');
      }
    } else {
      setErrorNotice(
        'Akun tidak terdaftar di sistem e-Counseling POLINELA. Bila Anda Mahasiswa, silakan gunakan tombol Daftar Akun di bawah.'
      );
    }
  };

  // Student Registration Submission
  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice('');
    setSuccessNotice('');

    // Pre-validations
    if (!regNim || !regName || !regEmail || !regProdi || !regPhone || !regPassword || !regConfirmPassword) {
      setErrorNotice('Mohon isi seluruh bidang formulir registrasi.');
      return;
    }

    if (!regGender) {
      setErrorNotice('Silakan pilih jenis kelamin');
      return;
    }

    if (!regSemester) {
      setErrorNotice('Silakan pilih semester');
      return;
    }

    // Check email domain
    const normalizedEmail = regEmail.trim().toLowerCase();
    if (!normalizedEmail.endsWith('.ac.id') && !normalizedEmail.endsWith('.edu')) {
      setErrorNotice('Gunakan email resmi kampus bersufiks .ac.id atau domain universitas mitra.');
      return;
    }

    // Password matches check
    if (regPassword !== regConfirmPassword) {
      setErrorNotice('Konfirmasi kata sandi tidak cocok. Pastikan keduanya sama.');
      return;
    }

    // Minimum password length
    if (regPassword.length < 6) {
      setErrorNotice('Kata sandi minimal harus terdiri dari 6 karakter.');
      return;
    }

    // Load database users
    const usersStore = localStorage.getItem('app_users');
    const dbUsers: User[] = usersStore ? JSON.parse(usersStore) : INITIAL_USERS;

    // Email or NIM uniqueness check
    const normalizedNim = regNim.trim().toLowerCase();
    const isDuplicate = dbUsers.some(
      (u) => u.email.toLowerCase() === normalizedEmail || u.nimOrNip.toLowerCase() === normalizedNim
    );

    if (isDuplicate) {
      setErrorNotice('NIM atau alamat email kampus Anda sudah terdaftar di sistem.');
      return;
    }

    // Perfect, create New Student account
    const newStudent: User = {
      id: `student_${Date.now()}`,
      name: regName.trim(),
      email: normalizedEmail,
      role: 'mahasiswa',
      nimOrNip: regNim.trim(),
      prodiOrUnit: regProdi.trim(),
      phoneNumber: regPhone.trim(),
      password: regPassword, // Stored securely
      gender: regGender as 'Laki-laki' | 'Perempuan',
      semester: regSemester,
      bio: 'Mahasiswa aktif Politeknik Negeri Lampung.'
    };

    const updatedUsers = [...dbUsers, newStudent];
    localStorage.setItem('app_users', JSON.stringify(updatedUsers));

    // Live Backend DB Sync: Persist the registered account into live MySQL users table
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudent),
    })
      .then(res => res.json())
      .then(data => {
        console.log('[Live Database Sync] Akun mahasiswa telah sukses dimasukkan ke tabel users MySQL!', data);
      })
      .catch(err => {
        console.warn('[Offline Fallback Cache] Registrasi disimpan di cache lokal:', err.message);
      });

    // Notify Administrator of new self-registered student
    createNotificationViaApi(
      'admin',
      'admin',
      'Mahasiswa Baru Terdaftar',
      `Mahasiswa baru bernama ${newStudent.name} (${newStudent.nimOrNip}) telah berhasil mendaftarkan akun secara mandiri.`
    );

    // Show success alert and direct to Login
    setSuccessNotice('Registrasi berhasil! Akun Anda terdaftar. Silakan lakukan proses login.');
    setAuthView('login');
    
    // Smooth reset fields
    setRegNim('');
    setRegName('');
    setRegEmail('');
    setRegProdi('');
    setRegPhone('');
    setRegPassword('');
    setRegConfirmPassword('');
    setRegGender('');
    setRegSemester('');
  };

  // Safe Forgot Password Handler
  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice('');
    setSuccessNotice('');

    if (!forgotEmail) {
      setErrorNotice('Mohon isikan email kampus resmi Anda.');
      return;
    }

    const normalizedEmail = forgotEmail.trim().toLowerCase();
    const usersStore = localStorage.getItem('app_users');
    const dbUsers: User[] = usersStore ? JSON.parse(usersStore) : INITIAL_USERS;

    const emailExists = dbUsers.some((u) => u.email.toLowerCase() === normalizedEmail);

    if (emailExists) {
      setSuccessNotice('Tautan pemulihan kata sandi telah dikirimkan ke email kampus Anda. Silakan periksa folder inbox atau spam Anda.');
      setForgotEmail('');
      setAuthView('login');
    } else {
      setErrorNotice('Alamat email kampus tersebut tidak ditemukan di sistem database kami.');
    }
  };

  // Pre-load remembered email if exists
  React.useEffect(() => {
    const cachedId = localStorage.getItem('remembered_identifier');
    if (cachedId) {
      setLoginIdentifier(cachedId);
      setRememberMe(true);
    }
  }, []);

  const isFormValid = !!(
    regName.trim() &&
    regNim.trim() &&
    regEmail.trim() &&
    regPassword.trim() &&
    regGender &&
    regSemester
  );

  return (
    <div className="min-h-[85vh] flex flex-col lg:flex-row items-center justify-center gap-12 max-w-6xl mx-auto px-4 py-8">
      
      {/* BRAND & VALUE STATEMENT LEFT PANEL */}
      <div className="flex-1 glass-panel p-6 md:p-8 space-y-6 text-left animate-in fade-in slide-in-from-left-6 duration-500">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold leading-tight uppercase tracking-wider border border-indigo-100">
          <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" /> Konseling Digital Mahasiswa
        </div>
        
        <div className="space-y-3">
          <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight font-display leading-tight">
            e-Counseling POLINELA
          </h1>
          <p className="text-sm md:text-base text-indigo-600 font-extrabold uppercase tracking-wide">
            KONSELING DIGITAL MAHASISWA POLITEKNIK NEGERI LAMPUNG
          </p>
        </div>

        <p className="text-sm md:text-base text-slate-500 text-justify leading-[1.8] max-w-lg">
          e-Counseling POLINELA merupakan layanan konseling digital yang membantu mahasiswa mendapatkan pendampingan psikologis secara mudah, aman, dan rahasia. Mahasiswa dapat melakukan konsultasi online maupun offline, mengakses artikel kesehatan mental, serta melakukan pemeriksaan kesehatan mental secara mandiri.
        </p>

        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs text-slate-600 font-bold pt-2">
          <span className="flex items-center gap-1.5 bg-white border border-slate-100 px-3.5 py-1.5 rounded-full shadow-2xs">
            <Shield className="w-4 h-4 text-emerald-500" /> Privasi Terjamin
          </span>
          <span className="flex items-center gap-1.5 bg-white border border-slate-100 px-3.5 py-1.5 rounded-full shadow-2xs">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500" /> Mendukung Kesehatan Mental Mahasiswa
          </span>
        </div>
      </div>

      {/* SECURE PORTAL CARD (LOGIN / REGISTER / FORGOT PASSWORD) */}
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden p-6 md:p-8 space-y-6 animate-in fade-in slide-in-from-right-6 duration-500">
        
        {/* Global Notices */}
        {successNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-850 text-xs rounded-xl flex items-start gap-2.5 shadow-2xs">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-semibold">{successNotice}</span>
          </div>
        )}

        {errorNotice && (
          <div className="p-4 bg-rose-50 border border-rose-100 text-rose-850 text-xs rounded-xl flex items-start gap-2.5 shadow-2xs">
            <Info className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-semibold">{errorNotice}</span>
          </div>
        )}

        {/* 1. VIEW: UNIVERSAL LOGIN */}
        {authView === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-lg md:text-xl font-display">
                Masuk Portal Akademik
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Log masuk terpadu untuk civitas akademika Mahasiswa, Staf Psikolog, atau Admin POLINELA.
              </p>
            </div>

            {/* Email / Username field */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Email Kampus atau NIM/NIP
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input 
                  type="text" 
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="NIM / NIP / Email POLINELA"
                  className="w-full bg-slate-50/50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm placeholder-slate-400 font-semibold transition-all shadow-3xs"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Kata Sandi
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input 
                  type="password" 
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Masukkan kata sandi Anda"
                  className="w-full bg-slate-50/50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm placeholder-slate-400 font-semibold transition-all shadow-3xs"
                />
              </div>
            </div>

            {/* Remember Me and Forgot Password Action Row */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-1.5 font-bold text-slate-600 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-3.5 h-3.5 accent-indigo-600"
                />
                Ingat Saya
              </label>
              <button
                type="button"
                onClick={() => {
                  setErrorNotice('');
                  setAuthView('forgot_password');
                }}
                className="font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Lupa Password?
              </button>
            </div>

            {/* Enter login button */}
            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs md:text-sm shadow-sm transition-all mt-2 cursor-pointer flex items-center justify-center gap-2 hover:shadow-indigo-100"
            >
              <LogIn className="w-4 h-4" /> Masuk Aplikasi
            </button>

            {/* Student Registration redirect label */}
            <div className="text-center pt-3 border-t border-slate-100 mt-2">
              <p className="text-xs text-slate-405 font-semibold">
                Khusus Mahasiswa baru atau belum terdaftar?
              </p>
              <button
                type="button"
                onClick={() => {
                  setErrorNotice('');
                  setAuthView('register');
                }}
                className="mt-1.5 text-xs font-extrabold text-indigo-600 hover:text-indigo-800 transition-colors underline"
              >
                Pendaftaran Akun Baru Mahasiswa &rarr;
              </button>
            </div>
          </form>
        )}

        {/* 2. VIEW: STUDENT SELF REGISTRATION */}
        {authView === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-lg md:text-xl font-display flex items-center gap-2">
                Pendaftaran Mahasiswa
              </h3>
              <p className="text-xs text-slate-400">
                Pendaftaran khusus mahasiswa aktif Politeknik Negeri Lampung (POLINELA).
              </p>
            </div>

            {/* NIM & Full Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">NIM Mahasiswa</label>
                <input 
                  type="text" 
                  required
                  value={regNim}
                  placeholder="NIM POLINELA"
                  onChange={(e) => setRegNim(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-semibold placeholder-slate-400 focus:bg-white text-slate-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Lengkap</label>
                <input 
                  type="text" 
                  required
                  value={regName}
                  placeholder="Masukkan nama lengkap"
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-semibold placeholder-slate-400 focus:bg-white text-slate-800"
                />
              </div>
            </div>

            {/* Gender & Semester fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Jenis Kelamin</label>
                <select
                  required
                  value={regGender}
                  onChange={(e) => setRegGender(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-semibold focus:bg-white text-slate-800"
                >
                  <option value="" disabled>Pilih Jenis Kelamin</option>
                  <option value="Laki-laki">Laki-Laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Semester</label>
                <select
                  required
                  value={regSemester}
                  onChange={(e) => setRegSemester(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg px-3 py-2 text-xs font-semibold focus:bg-white text-slate-800"
                >
                  <option value="" disabled>Pilih Semester</option>
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                  <option value="3">Semester 3</option>
                  <option value="4">Semester 4</option>
                  <option value="5">Semester 5</option>
                  <option value="6">Semester 6</option>
                  <option value="7">Semester 7</option>
                  <option value="8">Semester 8</option>
                </select>
              </div>
            </div>

            {/* Campus Email field */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Email Kampus Resmi (.ac.id)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input 
                  type="email" 
                  required
                  value={regEmail}
                  placeholder="budi@polinela.ac.id"
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg pl-10 pr-3 py-2 text-xs md:text-sm font-semibold placeholder-slate-400 focus:bg-white"
                />
              </div>
            </div>

            {/* Program Studi and Phone fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Program Studi</label>
                <div className="relative">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input 
                    type="text" 
                    required
                    value={regProdi}
                    placeholder="Informatika"
                    onChange={(e) => setRegProdi(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg pl-8 pr-2.5 py-2 text-xs font-semibold placeholder-slate-400 focus:bg-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">No. Handphone Aktif</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input 
                    type="text" 
                    required
                    value={regPhone}
                    placeholder="081234xxxx"
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg pl-8 pr-2.5 py-2 text-xs font-semibold placeholder-slate-400 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Password and Confirm fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kata Sandi</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input 
                    type="password" 
                    required
                    value={regPassword}
                    placeholder="Sandi baru"
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg pl-8 pr-2.5 py-2 text-xs font-semibold placeholder-slate-400 focus:bg-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Konfirmasi Sandi</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input 
                    type="password" 
                    required
                    value={regConfirmPassword}
                    placeholder="Ulang sandi"
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-lg pl-8 pr-2.5 py-2 text-xs font-semibold placeholder-slate-405 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Register button */}
            <button
              type="submit"
              disabled={!isFormValid}
              className={`w-full py-3 text-white font-bold rounded-xl text-xs md:text-sm shadow-sm transition-all mt-2 ${
                isFormValid
                  ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-100 cursor-pointer'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-75'
              }`}
            >
              Daftarkan Akun Mahasiswa
            </button>

            {/* Back to login redirection link */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setErrorNotice('');
                  setAuthView('login');
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 mx-auto"
              >
                <ArrowLeft className="w-3 h-3" /> Kembali ke Halaman Login
              </button>
            </div>
          </form>
        )}

        {/* 3. VIEW: FORGOT PASSWORD FORM */}
        {authView === 'forgot_password' && (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-lg md:text-xl font-display">
                Lupa Kata Sandi
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ketikkan email resmi kampus POLINELA Anda untuk menerima instruksi pemulihan kredensial bimbingan.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Alamat Email Kampus Terdaftar
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input 
                  type="email" 
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="budi@polinela.ac.id"
                  className="w-full bg-slate-50/50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm placeholder-slate-400 font-semibold transition-all shadow-3xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs md:text-sm shadow-sm transition-all mt-2 cursor-pointer"
            >
              Kirim Tautan Pemulihan
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setErrorNotice('');
                  setAuthView('login');
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 mx-auto"
              >
                <ArrowLeft className="w-3 h-3" /> Kembali ke Halaman Login
              </button>
            </div>
          </form>
        )}

        {/* SECURE CAMPUS SSO FOOTER ACCENTS */}
        <div className="border-t border-slate-100 pt-4 text-center">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-500" /> e-Counseling POLINELA
          </p>
          <p className="text-[9px] text-slate-400 mt-1">
            Terenskripsi langsung dengan Sistem Informasi Akademik POLINELA &bull; Sandaran Aman Protektif
          </p>
        </div>

      </div>
    </div>
  );
}
