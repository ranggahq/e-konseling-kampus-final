import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, LogOut, User as UserIcon, Heart, Sparkles, Activity, Landmark, MapPin, Key, Eye, EyeOff, AlertCircle, CheckCircle2, Lock
} from 'lucide-react';
import { User, Consultation, Psychologist } from './types';
import { INITIAL_USERS, INITIAL_CONSULTATIONS } from './data/mockData';
import AuthPage from './components/AuthPage';
import StudentDashboard from './components/StudentDashboard';
import PsychologistDashboard from './components/PsychologistDashboard';
import AdminDashboard from './components/AdminDashboard';
import NotificationCenter from './components/NotificationCenter';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);

  // Force Change Password form states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Load user session & consultations from localStorage on mount
  useEffect(() => {
    // 1. Authenticate user from cache if exists
    const cachedUser = localStorage.getItem('logged_in_user');
    if (cachedUser) {
      try {
        const parsedUser = JSON.parse(cachedUser);
        const usersStore = localStorage.getItem('app_users');
        // If the user's status is nonaktif or inactive, forcibly log them out
        if (usersStore) {
          try {
            const dbUsers: User[] = JSON.parse(usersStore);
            const latestUserDb = dbUsers.find(u => u.id === parsedUser.id);
            if (parsedUser.id === 'student_1' || parsedUser.id === 'student_random') {
              localStorage.removeItem('logged_in_user');
              setCurrentUser(null);
            } else if (latestUserDb && (latestUserDb.status === 'nonaktif' || latestUserDb.status === 'inactive')) {
              localStorage.removeItem('logged_in_user');
              setCurrentUser(null);
            } else if (latestUserDb) {
              // Keep currentUser synchronized with the database!
              setCurrentUser(latestUserDb);
            } else {
              if (parsedUser.role === 'mahasiswa') {
                localStorage.removeItem('logged_in_user');
                setCurrentUser(null);
              } else {
                setCurrentUser(parsedUser);
              }
            }
          } catch (e) {
            setCurrentUser(parsedUser);
          }
        } else {
          setCurrentUser(parsedUser);
        }
      } catch (e) {
        localStorage.removeItem('logged_in_user');
        setCurrentUser(null);
      }
    }

    // 2. Hydrate consultations from localStorage or use defaults
    const storedConsultations = localStorage.getItem('all_consultations');
    if (storedConsultations) {
      try {
        const parsed = JSON.parse(storedConsultations);
        // Filter out any default dummy bookings like booking_1, booking_2, booking_3
        const filtered = parsed.filter((c: any) => c.id !== 'booking_1' && c.id !== 'booking_2' && c.id !== 'booking_3' && c.studentId !== 'student_1');
        localStorage.setItem('all_consultations', JSON.stringify(filtered));
        setConsultations(filtered);
      } catch (e) {
        localStorage.setItem('all_consultations', JSON.stringify(INITIAL_CONSULTATIONS));
        setConsultations(INITIAL_CONSULTATIONS);
      }
    } else {
      localStorage.setItem('all_consultations', JSON.stringify(INITIAL_CONSULTATIONS));
      setConsultations(INITIAL_CONSULTATIONS);
    }
    
    // 3. Populate default users list for login DB if empty OR clean old dummy Budi Santoso
    const cachedUsers = localStorage.getItem('app_users');
    if (!cachedUsers) {
      localStorage.setItem('app_users', JSON.stringify(INITIAL_USERS));
    } else {
      try {
        let dbUsers: User[] = JSON.parse(cachedUsers);
        // Remove Budi Santoso and other dummy entries
        dbUsers = dbUsers.filter(u => u.id !== 'student_1' && u.id !== 'student_random');
        // Ensure all psychologists and admin from INITIAL_USERS exist in DB
        INITIAL_USERS.forEach(initUser => {
          if (!dbUsers.some(u => u.id === initUser.id)) {
            dbUsers.push(initUser);
          }
        });
        localStorage.setItem('app_users', JSON.stringify(dbUsers));
      } catch (error) {
        localStorage.setItem('app_users', JSON.stringify(INITIAL_USERS));
      }
    }

    // Live MySQL Users collection sync: pull active users on start
    fetch('/api/users')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not connected');
      })
      .then((serverUsers: User[]) => {
        if (Array.isArray(serverUsers) && serverUsers.length > 0) {
          localStorage.setItem('app_users', JSON.stringify(serverUsers));
          
          // Force synchronization of logged-in user session as well
          const cachedUser = localStorage.getItem('logged_in_user');
          if (cachedUser) {
            try {
              const parsedUser = JSON.parse(cachedUser);
              const latest = serverUsers.find(u => u.id === parsedUser.id);
              if (latest) {
                if (latest.status === 'nonaktif' || latest.status === 'inactive') {
                  localStorage.removeItem('logged_in_user');
                  setCurrentUser(null);
                } else {
                  setCurrentUser(latest);
                  localStorage.setItem('logged_in_user', JSON.stringify(latest));
                }
              }
            } catch (e) {
              console.error("Error keeping user session synced on startup:", e);
            }
          }
        }
      })
      .catch(err => {
        console.log('[Fallback Cache] Menggunakan database lokal:', err.message);
      });
  }, []);

  // Set brand title in the index.html head
  useEffect(() => {
    document.title = "e-Counseling POLINELA - Politeknik Negeri Lampung";
  }, []);

  // Login handler
  const handleLoginSuccess = (user: User) => {
    const usersStore = localStorage.getItem('app_users');
    let latestUser = user;
    if (usersStore) {
      const dbUsers: User[] = JSON.parse(usersStore);
      const found = dbUsers.find(u => u.id === user.id);
      if (found) latestUser = found;
    }
    
    // Reset change password view states
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess(false);

    setCurrentUser(latestUser);
    localStorage.setItem('logged_in_user', JSON.stringify(latestUser));
  };

  // Logout handler
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('logged_in_user');
    localStorage.removeItem('active_chat_id');
  };

  // Save diagnostic clinical notes & feedback (Shared updater)
  const handleChangeResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('Password baru harus minimal 8 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password tidak cocok dengan password baru.');
      return;
    }

    // Success! Update password in DB
    const usersStore = localStorage.getItem('app_users');
    if (usersStore && currentUser) {
      const dbUsers: User[] = JSON.parse(usersStore);
      const updatedList = dbUsers.map(u => {
        if (u.id === currentUser.id) {
          return {
            ...u,
            password: newPassword,
            mustResetPassword: false
          };
        }
        return u;
      });

      localStorage.setItem('app_users', JSON.stringify(updatedList));

      // Update logged_in_user cache
      const updatedUser = {
        ...currentUser,
        password: newPassword,
        mustResetPassword: false
      };
      localStorage.setItem('logged_in_user', JSON.stringify(updatedUser));
      
      // Live DB Sync: synchronize password change live to MySQL users table
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      }).catch(err => console.log('MySQL offline fallback:', err.message));

      setPasswordSuccess(true);
      
      // Update state
      setCurrentUser(updatedUser);
      alert('Password Anda berhasil diperbarui! Silakan klik OK untuk masuk ke dashboard.');
    }
  };

  const handleSaveNotes = (consultationId: string, notes: string, recommendations: string[]) => {
    const updated = consultations.map(c => {
      if (c.id === consultationId) {
        return {
          ...c,
          diagnosisNotes: notes,
          recommendations: recommendations,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });

    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));
  };

  // Profile fields updater (Persistent)
  const handleUpdateProfile = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('logged_in_user', JSON.stringify(updatedUser));
    
    // 1. Update app_users
    const usersStore = localStorage.getItem('app_users');
    if (usersStore) {
      const dbUsers: User[] = JSON.parse(usersStore);
      const updatedList = dbUsers.map(u => u.id === updatedUser.id ? updatedUser : u);
      localStorage.setItem('app_users', JSON.stringify(updatedList));

      // Live DB Sync: synchronize profile settings changes to MySQL users table
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      }).catch(err => console.log('MySQL offline fallback:', err.message));
    }

    // 2. Update app_psychologists if the user is a psychologist
    if (updatedUser.role === 'psikolog') {
      const psychKey = 'app_psychologists';
      const psychStore = localStorage.getItem(psychKey);
      if (psychStore) {
        try {
          const dbPsychs: Psychologist[] = JSON.parse(psychStore);
          const updatedPsychs = dbPsychs.map(p => {
            if (p.id === updatedUser.id) {
              return {
                ...p,
                name: updatedUser.name,
                email: updatedUser.email,
                avatarUrl: updatedUser.avatarUrl || '',
                bio: updatedUser.bio || p.bio
              };
            }
            return p;
          });
          localStorage.setItem(psychKey, JSON.stringify(updatedPsychs));
        } catch (e) {
          console.error("Error updating app_psychologists store", e);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-[#f4f7ff] via-[#eef2ff] to-[#f8fafc] text-slate-800 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* GLOBAL HIGH-CONTRAST HEADER */}
      <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-100/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3.5">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-100">
              <Heart className="w-5 h-5 md:w-5.5 md:h-5.5 text-white fill-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-sm md:text-lg leading-tight tracking-tight font-display flex items-center gap-1.5">
                e-Counseling POLINELA
              </h1>
              <p className="text-[10px] md:text-xs text-slate-405 font-extrabold uppercase tracking-widest mt-0.5 hidden sm:block">
                Politeknik Negeri Lampung
              </p>
            </div>
          </div>
          
          {currentUser ? (
            /* NAV ACTION LOGGED IN USER CARD */
            <div className="flex items-center gap-3 md:gap-4">
              <div className="hidden md:block text-right">
                <span className="font-bold text-slate-850 text-xs md:text-sm block font-display">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-indigo-600 font-bold tracking-wide uppercase flex items-center justify-end gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  Role: {currentUser.role}
                </span>
              </div>
              
              <NotificationCenter currentUser={currentUser} />

              <div className="w-9 h-9 md:w-10 md:h-10 bg-indigo-50 text-indigo-700 rounded-full overflow-hidden border border-indigo-150 flex items-center justify-center shrink-0 font-extrabold uppercase font-display text-sm md:text-base">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  currentUser.name.charAt(0)
                )}
              </div>

              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

              <button 
                onClick={handleLogout}
                className="p-2 md:px-3 md:py-2 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-150 rounded-xl text-slate-500 hover:text-rose-600 transition-all font-bold text-xs flex items-center gap-1 cursor-pointer"
                title="Keluar Akun"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          ) : (
            /* VISUAL EMBELLISHMENT */
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-indigo-500" /> Layanan Konseling Resmi Politeknik Negeri Lampung
            </div>
          )}
        </div>
      </header>

      {/* DETAILED ROOT MAIN BODY */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        {currentUser ? (
          /* FORCED PASSWORD RESET SCREEN FOR STUDENT */
          currentUser.role === 'mahasiswa' && currentUser.mustResetPassword ? (
            <div className="max-w-md mx-auto my-8 bg-white border border-slate-100 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
              <div className="text-center space-y-3.5">
                <div className="w-14 h-14 bg-amber-50 text-amber-650 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                  <Key className="w-7 h-7 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-850 font-display">Buat Password Baru</h2>
                  <p className="text-xs text-slate-500 font-semibold mt-1">Keamanan Akun Layanan e-Counseling POLINELA</p>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl text-left border border-slate-100 text-[11px] text-slate-600 font-semibold space-y-1">
                  <p className="text-slate-400 font-bold uppercase tracking-wider text-[9px] mb-1">Identitas Pengguna</p>
                  <p><span className="text-slate-400">Nama:</span> <span className="text-slate-800 font-bold">{currentUser.name}</span></p>
                  <p><span className="text-slate-400">NIM:</span> <span className="font-mono text-slate-800 font-bold">{currentUser.nimOrNip}</span></p>
                </div>
              </div>

              <form onSubmit={handleChangeResetPassword} className="space-y-4 font-semibold text-slate-700">
                {passwordError && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-655 text-xs p-3.5 rounded-xl flex items-start gap-2.5 leading-relaxed font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-550 mt-0.5" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 flex items-center gap-1">Kamu harus mengubah password bawaan</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      required
                      placeholder="Masukkan Password Baru"
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordError('');
                      }}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:border-indigo-500 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      required
                      placeholder="Ulangi Password Baru"
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setPasswordError('');
                      }}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:border-indigo-500 rounded-xl px-4 py-3 text-xs md:text-sm font-semibold focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50/50 p-3 rounded-xl border border-dashed border-slate-200 space-y-1.5 text-[11px] text-slate-500">
                  <p className="font-extrabold uppercase tracking-wider text-[9px] text-slate-450">Kriteria Keamanan Password:</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                    <span>Minimal 8 karakter</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${(newPassword && newPassword === confirmPassword) ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                    <span>Password baru dan konfirmasi harus cocok</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 py-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold rounded-xl text-xs md:text-sm transition-colors text-center cursor-pointer"
                  >
                    Keluar Sesi
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs md:text-sm shadow-md shadow-indigo-100 hover:shadow-indigo-200 transition-all text-center cursor-pointer"
                  >
                    Resmikan Password
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ROLE-BASED DASHBOARD SWITCHER router */
            currentUser.role === 'mahasiswa' ? (
              <StudentDashboard 
                currentUser={currentUser}
                consultations={consultations}
                setConsultations={setConsultations}
                onSaveNotes={handleSaveNotes}
                onUpdateProfile={handleUpdateProfile}
              />
            ) : currentUser.role === 'psikolog' ? (
              <PsychologistDashboard 
                currentUser={currentUser}
                consultations={consultations}
                setConsultations={setConsultations}
                onSaveNotes={handleSaveNotes}
                onUpdateProfile={handleUpdateProfile}
              />
            ) : (
              <AdminDashboard 
                currentUser={currentUser}
                consultations={consultations}
                setConsultations={setConsultations}
                onUpdateProfile={handleUpdateProfile}
              />
            )
          )
        ) : (
          <AuthPage onLoginSuccess={handleLoginSuccess} />
        )}
      </main>

      {/* TRADEMARK LEVEL COMPASS FOOTER */}
      <footer className="w-full bg-white border-t border-slate-100 mt-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-semibold uppercase tracking-wider">
          <p>© 2026 e-Counseling POLINELA. Politeknik Negeri Lampung.</p>
          <p className="flex items-center gap-1 text-indigo-600 shrink-0">
            <Landmark className="w-3.5 h-3.5" /> Politeknik Negeri Lampung • Layanan Konseling Digital Mahasiswa
          </p>
        </div>
      </footer>
    </div>
  );
}
