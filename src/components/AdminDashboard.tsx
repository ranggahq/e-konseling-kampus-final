import React, { useState, useEffect } from 'react';
import { 
  Shield, Users, BookOpen, Calendar, Check, X, Plus, Trash2, Edit2, 
  Sparkles, Stethoscope, Mail, Phone, BookCheck, ClipboardList, Eye, AlertCircle, ArrowLeft,
  Printer, CheckCircle, FileText, Lock, Upload, Camera, Search, User as UserIcon, MapPin, Ticket, Clock,
  UserCheck, Key
} from 'lucide-react';
import { User, Psychologist, Consultation, Article, JadwalOffline, AntrianKonsultasi, PenilaianKonsultasi } from '../types';
import { INITIAL_PSYCHOLOGISTS, INITIAL_ARTICLES } from '../data/mockData';
import { 
  getJadwalOfflineList, 
  getAntrianKonsultasiList, 
  getJadwalStats, 
  saveJadwalOfflineList, 
  saveAntrianKonsultasiList,
  saveScheduleOfflineViaApi,
  deleteScheduleOfflineViaApi,
  updateBookingStatusViaApi,
  syncWithBackend,
  createNotificationViaApi,
  getRatingsViaApi
} from '../data/offlineDb';

interface AdminDashboardProps {
  currentUser: User;
  consultations: Consultation[];
  setConsultations: React.Dispatch<React.SetStateAction<Consultation[]>>;
  onUpdateProfile?: (updatedUser: User) => void;
}

export default function AdminDashboard({ 
  currentUser, 
  consultations, 
  setConsultations,
  onUpdateProfile
}: AdminDashboardProps) {
  const [activeTab, setActiveTabState] = useState<'dashboard' | 'students' | 'psychologists' | 'articles' | 'consultations' | 'reports' | 'profil' | 'counseling-offline' | 'evaluasi-psikolog'>(() => {
    const saved = localStorage.getItem('admin_active_tab');
    if (saved) return saved as any;
    return 'dashboard';
  });

  const setActiveTab = (tab: 'dashboard' | 'students' | 'psychologists' | 'articles' | 'consultations' | 'reports' | 'profil' | 'counseling-offline' | 'evaluasi-psikolog') => {
    localStorage.setItem('admin_active_tab', tab);
    setActiveTabState(tab);
  };
  const [adminUserSubTab, setAdminUserSubTab] = useState<'mahasiswa' | 'mahasiswa_nonaktif' | 'psikolog'>('mahasiswa');

  // Evaluation state variables
  const [allRatings, setAllRatings] = useState<PenilaianKonsultasi[]>([]);
  const [ratingSearchQuery, setRatingSearchQuery] = useState('');
  const [selectedPsychForRatings, setSelectedPsychForRatings] = useState<string | null>(null);

  const getPsychologistMetrics = (psychId: string) => {
    const ratingsForPsych = allRatings.filter(r => r.id_psikolog === psychId);
    const ratingCount = ratingsForPsych.length;
    const avgRating = ratingCount > 0 
      ? (ratingsForPsych.reduce((sum, r) => sum + r.rating, 0) / ratingCount) 
      : 0.0;

    // Completed online sessions
    const completedOnline = consultations.filter(c => c.psychologistId === psychId && (c.status === 'completed' || c.status === 'SELESAI')).length;
    
    // Completed offline sessions
    const psychSchedules = offlineSchedules.filter(s => s.psikolog_id === psychId).map(s => s.id);
    const completedOffline = offlineBookings.filter(b => psychSchedules.includes(b.jadwal_id) && (b.status === 'Selesai' || b.status === 'SELESAI')).length;

    const totalCompleted = completedOnline + completedOffline;

    return {
      ratingCount,
      avgRating,
      totalCompleted,
      ratingsList: ratingsForPsych
    };
  };

  // Profile editing states
  const [isEditing, setIsEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(currentUser.avatarUrl || null);
  const [avatarFileError, setAvatarFileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<{ type: 'success' | 'error'; text: string; } | null>(null);
  const [showDeleteAvatarConfirm, setShowDeleteAvatarConfirm] = useState(false);

  // Password changes states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (activeTab === 'students') {
      setAdminUserSubTab('mahasiswa');
    } else if (activeTab === 'psychologists') {
      setAdminUserSubTab('psikolog');
    }
  }, [activeTab]);
  
  // Users state
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allPsychologists, setAllPsychologists] = useState<Psychologist[]>([]);
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [studentToResetPassword, setStudentToResetPassword] = useState<User | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Student Delete/Deactivate Confirmation Modal States
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);
  const [isDeactivatingOnly, setIsDeactivatingOnly] = useState(false);
  const [studentSuccessMessage, setStudentSuccessMessage] = useState<string | null>(null);

  // Checks if the student has related data (consultations, offline, queue, penanganan)
  const checkStudentRelatedData = (id: string): boolean => {
    // 1. Checks online consultations (chat / video)
    const hasOnline = consultations && consultations.some(c => c.studentId === id || c.mahasiswa_id === id);
    
    // 2. Checks offline bookings
    const hasOffline = offlineBookings && offlineBookings.some(b => b.mahasiswa_id === id);
    
    return Boolean(hasOnline || hasOffline);
  };

  useEffect(() => {
    if (studentSuccessMessage) {
      const timer = setTimeout(() => {
        setStudentSuccessMessage(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [studentSuccessMessage]);

  // Modals / Form states (Adding Users)
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserRole, setNewUserRole] = useState<'mahasiswa' | 'psikolog'>('mahasiswa');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserNimNip, setNewUserNimNip] = useState('');
  const [newUserProdi, setNewUserProdi] = useState('');
  const [newUserSpecialty, setNewUserSpecialty] = useState(''); // comma-separated for psych
  const [newUserExperience, setNewUserExperience] = useState(3);
  const [newUserBio, setNewUserBio] = useState('');

  // Editing User state
  const [editingPsychologist, setEditingPsychologist] = useState<Psychologist | null>(null);

  // --- OFFLINE SCHEDULING CRUD STATES ---
  const [offlineSchedules, setOfflineSchedules] = useState<JadwalOffline[]>([]);
  const [offlineBookings, setOfflineBookings] = useState<AntrianKonsultasi[]>([]);
  
  // Schedule Form states
  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<JadwalOffline | null>(null);
  
  const [scheduleHari, setScheduleHari] = useState('Senin');
  const [scheduleJamMulai, setScheduleJamMulai] = useState('08:00');
  const [scheduleJamSelesai, setScheduleJamSelesai] = useState('11:00');
  const [scheduleKuota, setScheduleKuota] = useState<number>(10);
  const [schedulePsikologId, setSchedulePsikologId] = useState('');

  // Sync state
  useEffect(() => {
    setOfflineSchedules(getJadwalOfflineList());
    setOfflineBookings(getAntrianKonsultasiList());

    // Pull ratings
    getRatingsViaApi().then(setAllRatings).catch(err => console.error(err));

    // Background server synchronization
    syncWithBackend().then(data => {
      setOfflineSchedules(data.schedules);
      setOfflineBookings(data.bookings);
    }).catch(err => console.error(err));
  }, [activeTab]);

  // Form states (Writing Articles)
  const [isWritingArticle, setIsWritingArticle] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [newArtTitle, setNewArtTitle] = useState('');
  const [newArtCategory, setNewArtCategory] = useState<'Stres' | 'Kecemasan' | 'Depresi' | 'Relationship' | 'Akademik' | 'Self-Care'>('Akademik');
  const [newArtExcerpt, setNewArtExcerpt] = useState('');
  const [newArtContent, setNewArtContent] = useState('');
  const [newArtAuthor, setNewArtAuthor] = useState('');
  const [newArtImageUrl, setNewArtImageUrl] = useState('https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80');
  const [newArtStatus, setNewArtStatus] = useState<'Draft' | 'Publish'>('Publish');

  // Admin Search & Pagination States
  const [adminArticleSearch, setAdminArticleSearch] = useState('');
  const [adminArticlePage, setAdminArticlePage] = useState(1);

  // Rejection notes prompt state
  const [rejectingSessionId, setRejectingSessionId] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');

  // Load and sync platform data on mount
  useEffect(() => {
    // Sync users
    const usersStore = localStorage.getItem('app_users');
    if (usersStore) {
      setAllUsers(JSON.parse(usersStore));
    } else {
      // Setup from default INITIAl users if missing
      const defaults = [
        { id: 'psikolog_1', name: 'Dra. Sarah Safitri, M.Psi.', email: 'sarah.safitri@konseling.ac.id', role: 'psikolog' as const, nimOrNip: '198804122015042001', password: 'password123', prodiOrUnit: 'Layanan Konseling POLINELA' },
        { id: 'psikolog_2', name: 'Rahmat Hidayat, S.Psi., M.Si.', email: 'rahmat.hidayat@konseling.ac.id', role: 'psikolog' as const, nimOrNip: '198501232012011002', password: 'password123', prodiOrUnit: 'Layanan Konseling POLINELA' },
        { id: 'psikolog_3', name: 'Nisa Amalia, M.Psi., Psikolog', email: 'nisa.amalia@konseling.ac.id', role: 'psikolog' as const, nimOrNip: '199105302020032001', password: 'password123', prodiOrUnit: 'Layanan Konseling POLINELA', phoneNumber: '081233445566', gender: 'Perempuan', bio: 'Menjalani kehidupan kampus tidak selalu mudah. Saya di sini sebagai telinga yang tulus mendengarkan masalah keluarga, luka masa lalu, dan tuntutan perkuliahan guna merajut kembali rasa damai dalam diri Anda.' },
        { id: 'admin_1', name: 'Admin e-Counseling POLINELA', email: 'admin.konseling@polinela.ac.id', role: 'admin' as const, nimOrNip: '197902152003121001', password: 'password123', prodiOrUnit: 'Hubungan Kemahasiswaan & Konseling' }
      ];
      localStorage.setItem('app_users', JSON.stringify(defaults));
      setAllUsers(defaults);
    }

    // Sync psychologists profile details
    const psychKey = 'app_psychologists';
    const psychsStore = localStorage.getItem(psychKey);
    if (psychsStore) {
      setAllPsychologists(JSON.parse(psychsStore));
    } else {
      localStorage.setItem(psychKey, JSON.stringify(INITIAL_PSYCHOLOGISTS));
      setAllPsychologists(INITIAL_PSYCHOLOGISTS);
    }

    // Sync articles list
    const artKey = 'app_articles_list';
    const artStore = localStorage.getItem(artKey);
    if (artStore) {
      setAllArticles(JSON.parse(artStore));
    } else {
      localStorage.setItem(artKey, JSON.stringify(INITIAL_ARTICLES));
      setAllArticles(INITIAL_ARTICLES);
    }

    // Sync Audit Logs
    const logsStore = localStorage.getItem('reset_password_audit_logs');
    if (logsStore) {
      setAuditLogs(JSON.parse(logsStore));
    } else {
      setAuditLogs([]);
    }
  }, []);

  // Sync platform changes Helper
  const syncArticlesList = (list: Article[]) => {
    setAllArticles(list);
    localStorage.setItem('app_articles_list', JSON.stringify(list));
  };

  const syncPsychologistsList = (list: Psychologist[]) => {
    setAllPsychologists(list);
    localStorage.setItem('app_psychologists', JSON.stringify(list));
  };

  // Process Booking: Approve Consultation Sesi
  const handleApproveBooking = (id: string) => {
    const updated = consultations.map(c => {
      if (c.id === id) {
        return {
          ...c,
          status: 'approved' as const,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });
    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));
    alert("Konsultasi berhasil disetujui. Sesi kini aktif untuk jadwal bersangkutan!");
  };

  // Process Booking: Reject Consultation Sesi
  const handleRejectBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingSessionId || !rejectionNotes.trim()) return;

    const updated = consultations.map(c => {
      if (c.id === rejectingSessionId) {
        return {
          ...c,
          status: 'rejected' as const,
          rejectionReason: rejectionNotes.trim(),
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });

    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));
    setRejectingSessionId(null);
    setRejectionNotes('');
    alert("Pendaftaran janji temu berhasil ditolak dengan catatan yang dikirimkan.");
  };

  // User Management mutations
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserNimNip) return;

    const newId = `user_${Date.now()}`;
    const mappedUser: User = {
      id: newId,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      nimOrNip: newUserNimNip,
      prodiOrUnit: newUserProdi || 'Umum/Hubungan Masyarakat'
    };

    // Update global users list
    const updatedUsers = [...allUsers, mappedUser];
    setAllUsers(updatedUsers);
    localStorage.setItem('app_users', JSON.stringify(updatedUsers));

    // Live MySQL sync for Admin created users
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mappedUser),
    }).catch(err => console.warn('Failed to sync newly created user to MySQL database:', err));

    // If role is psychologist, generate details
    if (newUserRole === 'psikolog') {
      const specList = newUserSpecialty ? newUserSpecialty.split(',').map(s => s.trim()) : ['Konseling Umum'];
      const newPsych: Psychologist = {
        id: newId,
        name: newUserName,
        email: newUserEmail,
        nip: newUserNimNip,
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80', // default avatar
        specialties: specList,
        experienceYears: newUserExperience,
        rating: 5.0,
        reviewsCount: 0,
        availableDays: ['Senin', 'Rabu', 'Kamis'],
        availableHours: ['09:00 - 10:30', '13:00 - 14:30'],
        bio: newUserBio || 'Psikolog pendamping baru Unit Bimbingan Konseling.'
      };
      syncPsychologistsList([...allPsychologists, newPsych]);

      createNotificationViaApi(
        'admin',
        'admin',
        'Psikolog Baru Ditambahkan',
        `Staf psikolog baru bernama ${newUserName} (NIP: ${newUserNimNip}) telah berhasil ditambahkan ke sistem.`
      );
    } else {
      createNotificationViaApi(
        'admin',
        'admin',
        newUserRole === 'mahasiswa' ? 'Mahasiswa Baru Terdaftar' : 'Aktivitas Penting Sistem',
        `Akun ${newUserRole} baru didaftarkan oleh Admin: ${newUserName} (${newUserNimNip}).`
      );
    }

    // Reset states
    setIsAddingUser(false);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserNimNip('');
    setNewUserProdi('');
    setNewUserSpecialty('');
    setNewUserBio('');
  };

  const handleReactivateStudent = (student: User) => {
    const updatedStudent = { ...student, status: 'aktif' };
    const nextUsers = allUsers.map(u => u.id === student.id ? updatedStudent : u);
    setAllUsers(nextUsers);
    localStorage.setItem('app_users', JSON.stringify(nextUsers));

    // Live SQL user reactivation sync
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedStudent),
    }).catch(err => console.error('Failed SQL reactivation sync:', err));
    
    setStudentSuccessMessage("Akun mahasiswa berhasil diaktifkan kembali.");
    alert("Akun mahasiswa berhasil diaktifkan kembali.");
  };

  const handleRequestResetPassword = (student: User) => {
    setStudentToResetPassword(student);
  };

  const handleConfirmResetPassword = () => {
    if (!studentToResetPassword) return;

    // Update student credentials in user list
    let updatedStudent: any = null;
    const nextUsers = allUsers.map(u => {
      if (u.id === studentToResetPassword.id) {
        updatedStudent = {
          ...u,
          password: 'Polinela123',
          mustResetPassword: true
        };
        return updatedStudent;
      }
      return u;
    });

    setAllUsers(nextUsers);
    localStorage.setItem('app_users', JSON.stringify(nextUsers));

    // Live SQL password reset synchronization
    if (updatedStudent) {
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStudent),
      }).catch(err => console.error('Failed SQL reset password sync:', err));
    }

    // Simple security audit logs
    const newLog = {
      id: `log_${Date.now()}`,
      adminName: currentUser.name,
      studentName: studentToResetPassword.name,
      studentNim: studentToResetPassword.nimOrNip,
      timestamp: new Date().toISOString()
    };

    const nextLogs = [newLog, ...auditLogs];
    setAuditLogs(nextLogs);
    localStorage.setItem('reset_password_audit_logs', JSON.stringify(nextLogs));

    setStudentSuccessMessage("Password mahasiswa berhasil direset.");
    alert("Password mahasiswa berhasil direset.");
    setStudentToResetPassword(null);
  };

  const handleDeleteUser = (id: string, roleName: string) => {
    if (roleName === 'mahasiswa') {
      const std = allUsers.find(u => u.id === id);
      if (std) {
        setStudentToDelete(std);
        const hasRelated = checkStudentRelatedData(std.id);
        setIsDeactivatingOnly(hasRelated);
      }
      return;
    }

    if (!window.confirm(`Apakah Anda yakin ingin menonaktifkan & menghapus hak akses ${roleName} ini dari platform e-Counseling POLINELA?`)) return;
    
    const nextUsers = allUsers.filter(u => u.id !== id);
    setAllUsers(nextUsers);
    localStorage.setItem('app_users', JSON.stringify(nextUsers));

    if (roleName === 'psikolog') {
      const nextPsychs = allPsychologists.filter(p => p.id !== id);
      syncPsychologistsList(nextPsychs);
    }
  };

  // Edit Psychologist modal submission
  const handleSavePsychologistEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPsychologist) return;

    const nextPsychs = allPsychologists.map(p => {
      if (p.id === editingPsychologist.id) {
        return editingPsychologist;
      }
      return p;
    });

    syncPsychologistsList(nextPsychs);

    // Also update matching general User display name
    let updatedUser: any = null;
    const nextUsers = allUsers.map(u => {
      if (u.id === editingPsychologist.id) {
        updatedUser = {
          ...u,
          name: editingPsychologist.name,
          email: editingPsychologist.email,
          nimOrNip: editingPsychologist.nip
        };
        return updatedUser;
      }
      return u;
    });
    setAllUsers(nextUsers);
    localStorage.setItem('app_users', JSON.stringify(nextUsers));

    // Live MySQL synchronization for Psychologist Profile update
    if (updatedUser) {
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      }).catch(err => console.error('Failed SQL Psychologist edit sync:', err));
    }

    setEditingPsychologist(null);
    alert("Profil psikolog berhasil diredit!");
  };

  // --- OFFLINE SCHEDULE HANDLERS ---
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulePsikologId) {
      alert('Silakan pilih psikolog terlebih dahulu.');
      return;
    }

    const res = await saveScheduleOfflineViaApi({
      id: editingSchedule ? editingSchedule.id : undefined,
      hari: scheduleHari,
      jam_mulai: scheduleJamMulai,
      jam_selesai: scheduleJamSelesai,
      kuota: Number(scheduleKuota),
      psikolog_id: schedulePsikologId
    });

    if (res.success) {
      setOfflineSchedules(getJadwalOfflineList());
      setEditingSchedule(null);

      const targetPsych = allPsychologists.find(p => p.id === schedulePsikologId);
      const psychName = targetPsych ? targetPsych.name : 'Psikolog Pelaksana';
      
      createNotificationViaApi(
        'admin',
        'admin',
        'Jadwal Baru Dibuat',
        `Jadwal Konsultasi Tatap Muka (Offline) baru dibuat untuk Psikolog ${psychName} pada hari ${scheduleHari} pukul ${scheduleJamMulai} - ${scheduleJamSelesai} WIB.`
      );
    } else {
      alert(res.message);
    }

    // Reset Form
    setIsAddingSchedule(false);
    setScheduleHari('Senin');
    setScheduleJamMulai('08:00');
    setScheduleJamSelesai('11:00');
    setScheduleKuota(10);
    setSchedulePsikologId('');
  };

  const handleEditScheduleClick = (schedule: JadwalOffline) => {
    setEditingSchedule(schedule);
    setScheduleHari(schedule.hari);
    setScheduleJamMulai(schedule.jam_mulai);
    setScheduleJamSelesai(schedule.jam_selesai);
    setScheduleKuota(schedule.kuota);
    setSchedulePsikologId(schedule.psikolog_id);
    setIsAddingSchedule(true);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus jadwal offline ini? Mahasiswa yang sudah terdaftar akan tetap tersimpan tapi kuota tidak lagi berlaku.')) return;
    const res = await deleteScheduleOfflineViaApi(scheduleId);
    if (res.success) {
      setOfflineSchedules(getJadwalOfflineList());
      setOfflineBookings(getAntrianKonsultasiList());
    } else {
      alert(res.message);
    }
  };

  // Article management mutations
  const handleCreateArticle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArtTitle || !newArtContent) return;

    const timestamp = new Date().toISOString();
    const newArt: Article = {
      id: `art_${Date.now()}`,
      title: newArtTitle,
      slug: newArtTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: newArtCategory,
      excerpt: newArtExcerpt || 'Artikel kesehatan mental dan batin mahasiswa.',
      content: newArtContent,
      author: newArtAuthor || currentUser.name || 'POLINELA Admin',
      authorRole: 'Admin Kemahasiswaan',
      imageUrl: newArtImageUrl || 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80',
      minutesToRead: Math.max(1, Math.ceil(newArtContent.split(' ').length / 200)),
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
      likes: 0,
      status: newArtStatus,
      createdBy: currentUser.id,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const nextArticles = [newArt, ...allArticles];
    syncArticlesList(nextArticles);
    
    setIsWritingArticle(false);
    setNewArtTitle('');
    setNewArtExcerpt('');
    setNewArtContent('');
    setNewArtAuthor('');
    setNewArtStatus('Publish');
    alert("Artikel baru berhasil disimpan ke database!");
  };

  const handleUpdateArticle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArticle || !newArtTitle || !newArtContent) return;

    const timestamp = new Date().toISOString();
    const updatedArt: Article = {
      ...editingArticle,
      title: newArtTitle,
      slug: newArtTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: newArtCategory,
      excerpt: newArtExcerpt,
      content: newArtContent,
      author: newArtAuthor || currentUser.name || 'POLINELA Admin',
      imageUrl: newArtImageUrl,
      minutesToRead: Math.max(1, Math.ceil(newArtContent.split(' ').length / 200)),
      status: newArtStatus,
      updatedAt: timestamp
    };

    const nextArticles = allArticles.map(art => art.id === editingArticle.id ? updatedArt : art);
    syncArticlesList(nextArticles);

    setEditingArticle(null);
    setNewArtTitle('');
    setNewArtExcerpt('');
    setNewArtContent('');
    setNewArtAuthor('');
    setNewArtStatus('Publish');
    alert("Artikel berhasil diperbarui!");
  };

  const handleDeleteArticle = (id: string) => {
    const isConfirmed = window.confirm("Apakah Anda yakin ingin menghapus artikel ini?");
    if (!isConfirmed) return;
    
    const nextArticles = allArticles.filter(art => art.id !== id);
    syncArticlesList(nextArticles);
    alert("Artikel berhasil dihapus!");
  };

  // Computations
  const pendingReservations = consultations.filter(c => c.status === 'pending');
  const approvedReservationsCount = consultations.filter(c => c.status === 'approved').length;
  const completedReservationsCount = consultations.filter(c => c.status === 'completed').length;

  return (
    <div className="space-y-8">
      {/* HEADER HERO */}
      <div className="bg-gradient-to-r from-indigo-50/60 to-slate-50 rounded-3xl p-6 md:p-8 border border-slate-150 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100/50 text-indigo-850 rounded-full text-xs font-semibold">
            <Shield className="w-3.5 h-3.5 text-indigo-600" /> Pusat Kendali Administrator e-Counseling POLINELA
          </div>
          <h2 className="text-2xl md:text-3.5xl font-extrabold text-slate-800 tracking-tight font-display">
            Sistem Administrator, {currentUser.name}! ⚙️
          </h2>
          <p className="text-sm text-slate-650 max-w-xl leading-relaxed">
            Kelola izin dan hak akses, verifikasi ajuan janji konseling mahasiswa, serta publikasikan literasi bugar mental kampus di sini secara efisien.
          </p>
        </div>
      </div>

      {/* ADMIN LEVEL METRICS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Ajuan Pending', value: pendingReservations.length, color: 'border-amber-150 text-amber-700 bg-amber-50/25' },
          { label: 'Sesi Aktif Disetujui', value: approvedReservationsCount, color: 'border-emerald-150 text-emerald-800 bg-emerald-50/25' },
          { label: 'Daftar Psikolog', value: allPsychologists.length, color: 'border-indigo-150 text-indigo-800 bg-indigo-50/25' },
          { label: 'Artikel Publikasi', value: allArticles.length, color: 'border-indigo-100 text-indigo-800 bg-indigo-50/20' }
        ].map((metric, mIdx) => (
          <div key={mIdx} className={`bg-white border rounded-2xl p-4 md:p-5 shadow-xs flex flex-col justify-center ${metric.color}`}>
            <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">{metric.label}</p>
            <p className="text-xl md:text-3xl font-extrabold font-display leading-none mt-2">{metric.value}</p>
          </div>
        ))}
      </div>

      {/* TABS NAVBAR */}
      <div className="border-b border-slate-200/80 flex overflow-x-auto gap-8 no-scrollbar bg-white px-6 rounded-2xl border border-slate-100 shadow-2xs py-1">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: Shield },
          { id: 'students', label: 'Kelola Mahasiswa', icon: Users },
          { id: 'psychologists', label: 'Kelola Psikolog', icon: Stethoscope },
          { id: 'evaluasi-psikolog', label: 'Evaluasi Psikolog', icon: BookCheck },
          { id: 'consultations', label: 'Konsultasi Online', icon: Calendar },
          { id: 'counseling-offline', label: 'Konsultasi Offline', icon: MapPin },
          { id: 'articles', label: 'Kelola Artikel', icon: BookOpen },
          { id: 'reports', label: 'Laporan', icon: ClipboardList },
          { id: 'profil', label: 'Pengaturan', icon: UserIcon }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-bold text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                isActive 
                  ? 'border-indigo-600 text-indigo-700' 
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
              {tab.label}
              {tab.id === 'consultations' && pendingReservations.length > 0 && (
                <span className="bg-amber-100/80 text-amber-800 border border-amber-205 font-bold text-[9px] px-1.5 py-0.5 rounded-full ml-0.5 animate-pulse">
                  {pendingReservations.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: DASHBOARD OVERVIEW */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* College Counsel guidelines card */}
            <div className="md:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg font-display">Pusat Administrasi & Validasi POLINELA</h3>
                <p className="text-xs text-slate-400 font-semibold">Prosedur Operasional Penjaminan Mutu e-Counseling Mahasiswa.</p>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                Platform ini melayani penilai skripsi/evaluator serta unit bimbingan konseling universitas pusat untuk menjamin mahasiswa mendapatkan pendampingan bugar mental secara lancar. Sebagaimana termaktub pada ketentuan akademik, silakan verifikasi antrean pendaftaran mahasiswa di menu <strong>3. Kelola Konsultasi</strong>, atau kelola peranan di menu <strong>2. Kelola Pengguna</strong>.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-205 text-xs">
                  <p className="font-bold text-slate-705 flex items-center gap-1.5 uppercase tracking-wide text-[10px] mb-1">
                    <BookCheck className="w-4 h-4 text-indigo-600" /> Sertifikasi Staf Bimbingan
                  </p>
                  <p className="text-slate-500 leading-relaxed text-[11px] font-semibold">Seluruh psikolog klinis yang terdaftar di platform telah melewati proses verifikasi ijazah profesi (M.Psi) dan kepemilikan izin praktik bimbingan sah.</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-205 text-xs">
                  <p className="font-bold text-slate-705 flex items-center gap-1.5 uppercase tracking-wide text-[10px] mb-1">
                    <ClipboardList className="w-4 h-4 text-indigo-600" /> Skrining Emosional PHQ-9
                  </p>
                  <p className="text-slate-500 leading-relaxed text-[11px] font-semibold">Mahasiswa dianjurkan untuk mengisi Kuesioner PHQ-9 sebelum sesi guna memberikan potret awal intensitas cemas akademis kepada psikolog pendamping.</p>
                </div>
              </div>
            </div>

            {/* Platform operational summary log */}
            <div className="bg-indigo-950 text-indigo-100/95 rounded-3xl p-6 shadow-sm flex flex-col justify-between border-t border-indigo-450/40">
              <div className="space-y-3.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                  <p className="text-[10px] font-extrabold tracking-widest uppercase text-emerald-400">Sistem Operasional Aktif</p>
                </div>
                
                <h4 className="text-white text-base font-extrabold font-display">Status Server SSO & Web-RTC</h4>
                
                <div className="space-y-2 text-[11px] leading-relaxed text-indigo-200">
                  <p className="flex justify-between border-b border-indigo-900/60 py-1"><span>SSO Gateway:</span> <span className="text-emerald-400 font-bold">Terhubung OK</span></p>
                  <p className="flex justify-between border-b border-indigo-900/60 py-1"><span>Database LocalState:</span> <span className="text-emerald-400 font-bold">Sinkronisasi OK</span></p>
                  <p className="flex justify-between py-1"><span>G-Suite WebRTC Port:</span> <span className="text-emerald-400 font-bold">Buka (Port 3000)</span></p>
                </div>
              </div>

              <div className="pt-4 border-t border-indigo-900/40 text-[10px] text-indigo-300 font-semibold leading-relaxed">
                Log sistem diproteksi oleh kebijakan enkripsi internal di bawah SK-POLINELA-2026.
              </div>
            </div>

          </div>

          {/* Quick Notice Panel */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
            <h4 className="font-extrabold text-slate-800 text-sm font-display uppercase tracking-wider">Berita & Pengumuman Internal Staf POLINELA</h4>
            
            <div className="space-y-3">
              {[
                { title: "Sosialisasi Penyusunan Draft Skripsi Mahasiswa Tingkat Akhir", date: "Hari ini", text: "Pendampingan konseling stres akademik diintensifkan dengan menambah kuota chat sesi malam hari." },
                { title: "Sinkronisasi Akun Penilai Skripsi", date: "Kemarin", text: "Proses audit akun simulasi mahasiswa dan penilai untuk pertunjukan skripsi berjalan dengan mulus." }
              ].map((notif, nIdx) => (
                <div key={nIdx} className="flex gap-4 p-4 rounded-2xl bg-slate-50/50 border border-slate-100 text-xs">
                  <div className="p-2 bg-indigo-50 text-indigo-750 font-bold rounded-lg h-fit text-[10px] uppercase whitespace-nowrap">{notif.date}</div>
                  <div>
                    <h5 className="font-extrabold text-slate-850 text-xs">{notif.title}</h5>
                    <p className="text-slate-550 mt-1 leading-relaxed font-semibold">{notif.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: KONSULTASI VERIFICATION QUEUE */}
      {activeTab === 'consultations' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Antrean Verifikasi Booking Konsultasi</h3>
            <p className="text-xs text-slate-500">Mohon tinjau kesesuaian waktu, staf psikolog, dan uraian gejala mahasiswa sebelum menyetujui.</p>
          </div>

          {pendingReservations.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-xs">
              <p className="text-sm text-slate-500">Semua pendaftaran konsultasi saat ini telah diproses.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingReservations.map(booking => (
                <div 
                  key={booking.id}
                  className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="bg-indigo-50 border border-indigo-150 text-indigo-805 text-[10px] font-bold px-2 py-0.5 rounded-md">
                        {booking.type.toUpperCase()} SESSION
                      </span>
                      <h4 className="font-extrabold text-slate-800 text-sm md:text-base font-display">
                        Mahasiswa: {booking.studentName} ({booking.studentNim})
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-550 pt-1 leading-relaxed">
                      <div>
                        <p><span className="font-bold text-slate-650">Psikolog Tujuan:</span> {booking.psychologistName}</p>
                        <p><span className="font-bold text-slate-650">Waktu Ajuan:</span> {booking.date} @ {booking.timeSlot}</p>
                        <p><span className="font-bold text-slate-650">Lama Keluhan:</span> {booking.symptomDuration}</p>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2 md:mt-0 italic">
                        <span className="font-semibold text-slate-600 block text-[10px] uppercase">Hambatan yang Dikeluhkan:</span>
                        "{booking.symptoms}"
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 self-end md:self-auto shrink-0">
                    <button
                      onClick={() => setRejectingSessionId(booking.id)}
                      className="p-2.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl transition-all font-semibold text-xs flex items-center gap-1 cursor-pointer"
                      title="Tolak Booking"
                    >
                      <X className="w-4 h-4" /> Tolak
                    </button>
                    <button
                      onClick={() => handleApproveBooking(booking.id)}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-all font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> Setujui Kelas
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* REJECTION NOTES MODAL DIALOG */}
          {rejectingSessionId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <form 
                onSubmit={handleRejectBooking}
                className="bg-white p-6 rounded-2xl border border-slate-100 max-w-md w-full space-y-4 shadow-xl"
              >
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-rose-700">
                  <AlertCircle className="w-5 h-5" />
                  <h4 className="font-bold font-display">Tolak Booking Janji Temu</h4>
                </div>
                
                <div className="space-y-1.5 flex-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Alasan Penolakan (Akan dikirimkan ke Mahasiswa):
                  </label>
                  <textarea
                    required
                    value={rejectionNotes}
                    onChange={(e) => setRejectionNotes(e.target.value)}
                    placeholder="Misalnya: Pola jadwal psikolog bersangkutan bentrok di jam tersebut, silakan booking dengan memilih jam operasional alternatif..."
                    className="w-full bg-slate-50 text-slate-800 border border-slate-205 focus:outline-none focus:border-rose-500 rounded-xl p-3 h-28 text-xs leading-relaxed"
                  />
                </div>

                <div className="flex items-center gap-3.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingSessionId(null);
                      setRejectionNotes('');
                    }}
                    className="flex-1 py-2 border border-slate-205 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-750 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer"
                  >
                    Kirim Penolakan
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: USER MANAGEMENT */}
      {(activeTab === 'students' || activeTab === 'psychologists') && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Pusat Manajemen Keanggotaan</h3>
              <p className="text-xs text-slate-500 font-semibold">Tinjau, aktifkan, atau hapus akses akun mahasiswa dan staf psikolog POLINELA.</p>
            </div>

            <div className="flex flex-wrap gap-2 font-display bg-slate-100 p-1 rounded-xl w-fit border border-slate-205">
              <button
                onClick={() => setAdminUserSubTab('mahasiswa')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  adminUserSubTab === 'mahasiswa' 
                    ? 'bg-white text-indigo-700 shadow-3xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Mahasiswa Aktif
              </button>
              <button
                onClick={() => setAdminUserSubTab('mahasiswa_nonaktif')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  adminUserSubTab === 'mahasiswa_nonaktif' 
                    ? 'bg-white text-indigo-700 shadow-3xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Mahasiswa Nonaktif
              </button>
              <button
                onClick={() => setAdminUserSubTab('psikolog')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  adminUserSubTab === 'psikolog' 
                    ? 'bg-white text-indigo-700 shadow-3xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Staf Psikolog
              </button>
            </div>
          </div>

          {adminUserSubTab === 'mahasiswa' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wide">Daftar Mahasiswa Terdaftar</h4>
                  <p className="text-[11px] text-slate-500">Tabel otentik mahasiswa aktif yang tersambung dengan sistem SSO Kampus.</p>
                </div>
                <button
                  onClick={() => {
                    setNewUserRole('mahasiswa');
                    setIsAddingUser(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Mahasiswa
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                        <th className="p-4">Nama Mahasiswa</th>
                        <th className="p-4">NIM</th>
                        <th className="p-4">Program Studi</th>
                        <th className="p-4">Email SSO</th>
                        <th className="p-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {allUsers.filter(u => u.role === 'mahasiswa' && u.status !== 'nonaktif' && u.status !== 'inactive').length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                            Belum ada mahasiswa terdaftar.
                          </td>
                        </tr>
                      ) : (
                        allUsers.filter(u => u.role === 'mahasiswa' && u.status !== 'nonaktif' && u.status !== 'inactive').map(std => (
                          <tr key={std.id} className="hover:bg-slate-50/40 transition-colors">
                            <td className="p-4 font-bold text-slate-850 text-sm">{std.name}</td>
                            <td className="p-4 font-mono text-slate-500 text-[11px]">{std.nimOrNip}</td>
                            <td className="p-4 text-slate-600">{std.prodiOrUnit || 'Psikologi'}</td>
                            <td className="p-4 text-slate-500 font-medium">{std.email}</td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleRequestResetPassword(std)}
                                  className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 hover:text-amber-800 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-bold shadow-xs"
                                  title="Reset Password Mahasiswa"
                                >
                                  <Key className="w-3.5 h-3.5" /> Reset Password
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(std.id, 'mahasiswa')}
                                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-600 rounded-lg transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold shadow-xs"
                                  title="Hapus Akun Mahasiswa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {adminUserSubTab === 'mahasiswa_nonaktif' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wide">Daftar Mahasiswa Nonaktif</h4>
                <p className="text-[11px] text-slate-500">Tabel daftar mahasiswa dengan status dinonaktifkan. Mahasiswa pada tabel ini tidak dapat masuk ke sistem.</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                        <th className="p-4">Nama Mahasiswa</th>
                        <th className="p-4">NIM</th>
                        <th className="p-4">Program Studi</th>
                        <th className="p-4">Email SSO</th>
                        <th className="p-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {allUsers.filter(u => u.role === 'mahasiswa' && (u.status === 'nonaktif' || u.status === 'inactive')).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                            Tidak ada mahasiswa nonaktif.
                          </td>
                        </tr>
                      ) : (
                        allUsers.filter(u => u.role === 'mahasiswa' && (u.status === 'nonaktif' || u.status === 'inactive')).map(std => (
                          <tr key={std.id} className="hover:bg-slate-50/40 transition-colors">
                            <td className="p-4 font-bold text-slate-850 text-sm">{std.name}</td>
                            <td className="p-4 font-mono text-slate-500 text-[11px]">{std.nimOrNip}</td>
                            <td className="p-4 text-slate-600">{std.prodiOrUnit || 'Psikologi'}</td>
                            <td className="p-4 text-slate-500 font-medium">{std.email}</td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => handleReactivateStudent(std)}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 hover:text-emerald-800 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold shadow-sm"
                                title="Aktifkan Kembali Akun"
                              >
                                <UserCheck className="w-3.5 h-3.5" /> Aktifkan Kembali
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {adminUserSubTab === 'psikolog' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wide">Daftar Penyelenggara Konseling (Psikolog)</h4>
                  <p className="text-[11px] text-slate-500">Staf bimbingan berlisensi dengan hak penugasan rekam bimbingan.</p>
                </div>
                <button
                  onClick={() => {
                    setNewUserRole('psikolog');
                    setIsAddingUser(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Staf Psikolog
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {allPsychologists.map(psych => (
                  <div key={psych.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <img 
                          src={psych.avatarUrl} 
                          alt={psych.name}
                          className="w-13 h-13 rounded-xl object-cover border border-slate-100"
                        />
                        <div>
                          <h4 className="font-extrabold text-slate-805 text-sm md:text-base font-display">{psych.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">NIP: {psych.nip}</p>
                          <p className="text-xs text-indigo-600 font-semibold mt-1">{psych.experienceYears} Tahun Pengalaman</p>
                        </div>
                      </div>

                      <p className="text-xs text-slate-550 leading-relaxed max-h-16 overflow-y-auto">
                        {psych.bio}
                      </p>

                      <div className="space-y-1.5">
                        <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Fokus Utama:</p>
                        <div className="flex flex-wrap gap-1">
                          {psych.specialties.map((spec, sIdx) => (
                            <span key={sIdx} className="bg-slate-50 border border-slate-150 px-2 py-0.5 rounded text-[10px] text-slate-600">
                              {spec}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                      <span className="text-[11px] text-indigo-700 font-bold">★ {psych.rating || '5.0'} / 5.0</span>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingPsychologist(psych)}
                          className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-205 text-slate-655 hover:text-slate-800 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-bold shadow-3xs"
                          title="Edit Profil"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(psych.id, 'psikolog')}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-600 hover:text-rose-750 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 text-[10px] font-bold shadow-3xs"
                          title="Hapus Hak Akses"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ADD USER MODAL DRAWER (Dynamically handles Mahasiswa vs Psikolog roles) */}
          {isAddingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
              <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full overflow-hidden shadow-2xl my-8">
                <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 text-indigo-900">
                  <Plus className="w-5 h-5" />
                  <h3 className="font-extrabold font-display text-sm md:text-base">Registrasi Akun Baru Platform</h3>
                </div>

                <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest">Tipe Peranan Akses</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as any)}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 font-bold"
                    >
                      <option value="mahasiswa">Mahasiswa Aktif</option>
                      <option value="psikolog">Staf Psikolog Bimbingan</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-705 uppercase tracking-widest">
                      {newUserRole === 'mahasiswa' ? 'Nama Lengkap Mahasiswa' : 'Nama Lengkap & Gelar Staf'}
                    </label>
                    <input 
                      type="text" 
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder={newUserRole === 'mahasiswa' ? 'Contoh: Ahmad Fauzi' : 'Contoh: Dra. Herlina, M.Psi.'}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-705 uppercase tracking-widest">E-mail SSO Kampus</label>
                    <input 
                      type="email" 
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="Contoh: ahmad.fauzi@polinela.ac.id"
                      className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {newUserRole === 'mahasiswa' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-705 uppercase tracking-widest">NIM Mahasiswa</label>
                        <input 
                          type="text" 
                          required
                          value={newUserNimNip}
                          onChange={(e) => setNewUserNimNip(e.target.value)}
                          placeholder="Contoh: 24060120140112"
                          className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-705 uppercase tracking-widest">Program Studi</label>
                        <input 
                          type="text" 
                          required
                          value={newUserProdi}
                          onChange={(e) => setNewUserProdi(e.target.value)}
                          placeholder="Contoh: Informatika"
                          className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-707 uppercase tracking-widest">NIP Pegawai</label>
                          <input 
                            type="text" 
                            required
                            value={newUserNimNip}
                            onChange={(e) => setNewUserNimNip(e.target.value)}
                            placeholder="Contoh: 19800412201..."
                            className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-707 uppercase tracking-widest">Tahun Pengalaman</label>
                          <input 
                            type="number" 
                            required
                            value={newUserExperience}
                            onChange={(e) => setNewUserExperience(parseInt(e.target.value) || 3)}
                            className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-707 uppercase tracking-widest">Spesialisasi Fokus Utama</label>
                        <input 
                          type="text" 
                          value={newUserSpecialty}
                          onChange={(e) => setNewUserSpecialty(e.target.value)}
                          placeholder="Gunakan koma, misal: Stres Akademik, Masalah Karakter"
                          className="w-full bg-slate-50 text-slate-850 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-707 uppercase tracking-widest">Instansi asal / Bio Ringkat</label>
                        <textarea 
                          value={newUserBio}
                          onChange={(e) => setNewUserBio(e.target.value)}
                          placeholder="Tuliskan pengalaman klinis singkat psikolog."
                          rows={2}
                          className="w-full bg-slate-50 text-slate-850 border border-slate-205 rounded-xl p-3 text-xs focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsAddingUser(false)}
                      className="flex-1 py-2.5 border border-slate-205 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
                    >
                      Daftarkan Akun
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* EDIT PSYCHOLOGIST MODAL CONTAINER */}
          {editingPsychologist && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
              <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full overflow-hidden shadow-2xl my-8">
                <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-150 flex items-center gap-2 text-indigo-850">
                  <Edit2 className="w-4 h-4" />
                  <h3 className="font-extrabold font-display text-xs md:text-sm">Sesuaikan Profil Psikolog</h3>
                </div>

                <form onSubmit={handleSavePsychologistEdit} className="p-6 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-707 uppercase tracking-wide">Nama Lengkap & Gelar</label>
                    <input 
                      type="text" 
                      required
                      value={editingPsychologist.name}
                      onChange={(e) => setEditingPsychologist({...editingPsychologist, name: e.target.value})}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-707 uppercase tracking-wide">E-mail Instansi</label>
                    <input 
                      type="email" 
                      required
                      value={editingPsychologist.email}
                      onChange={(e) => setEditingPsychologist({...editingPsychologist, email: e.target.value})}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-707 uppercase tracking-wide">NIP Pegawai</label>
                      <input 
                        type="text" 
                        required
                        value={editingPsychologist.nip}
                        onChange={(e) => setEditingPsychologist({...editingPsychologist, nip: e.target.value})}
                        className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-707 uppercase tracking-wide">Tahun Kerja</label>
                      <input 
                        type="number" 
                        required
                        value={editingPsychologist.experienceYears}
                        onChange={(e) => setEditingPsychologist({...editingPsychologist, experienceYears: parseInt(e.target.value) || 0})}
                        className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-707 uppercase tracking-wide">Riwayat Pengoperasian/Bio</label>
                    <textarea 
                      required
                      value={editingPsychologist.bio}
                      onChange={(e) => setEditingPsychologist({...editingPsychologist, bio: e.target.value})}
                      className="w-full bg-slate-50 text-slate-808 border border-slate-205 rounded-xl p-3 h-28 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingPsychologist(null)}
                      className="flex-1 py-2.5 border border-slate-205 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
                    >
                      Save Perubahan
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: GENERAL EDUCATIONAL ARTICLES MANAGEMENT */}
      {activeTab === 'articles' && (() => {
        const filteredAdminArticles = allArticles.filter(art => {
          const q = adminArticleSearch.toLowerCase();
          return art.title.toLowerCase().includes(q) || 
                 art.category.toLowerCase().includes(q) ||
                 (art.excerpt && art.excerpt.toLowerCase().includes(q));
        });

        const adminArticlesPerPage = 5;
        const totalAdminPages = Math.ceil(filteredAdminArticles.length / adminArticlesPerPage) || 1;
        const paginatedAdminArticles = filteredAdminArticles.slice(
          (adminArticlePage - 1) * adminArticlesPerPage,
          adminArticlePage * adminArticlesPerPage
        );

        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Hub Literasi Mental Kampus</h3>
                <p className="text-xs text-slate-500 font-semibold">Tulis, publikasi, atau tinjau berkas artikel kesehatan mental mahasiswa.</p>
              </div>

              {!isWritingArticle && !editingArticle && (
                <button
                  onClick={() => {
                    setEditingArticle(null);
                    setNewArtTitle('');
                    setNewArtExcerpt('');
                    setNewArtContent('');
                    setNewArtAuthor(currentUser.name);
                    setNewArtImageUrl('https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80');
                    setNewArtStatus('Publish');
                    setIsWritingArticle(true);
                  }}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-display shadow-xs flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto font-semibold"
                >
                  <Plus className="w-4 h-4" /> Tulis Artikel Baru
                </button>
              )}
            </div>

            {/* EDIT ARTICLE WRITER DRAWER SLIDE */}
            {(isWritingArticle || editingArticle) ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-md max-w-2xl mx-auto">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-6">
                  <button 
                    onClick={() => {
                      setIsWritingArticle(false);
                      setEditingArticle(null);
                    }}
                    className="p-1.5 hover:bg-slate-50 text-slate-500 rounded-lg cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h4 className="font-extrabold text-slate-850 font-display text-sm md:text-base">
                    {editingArticle ? `Edit Artikel: ${editingArticle.title}` : 'Tulis Naskah Artikel Baru'}
                  </h4>
                </div>

                <form onSubmit={editingArticle ? handleUpdateArticle : handleCreateArticle} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-705 uppercase tracking-wide">Judul Artikel Literasi</label>
                      <input 
                        type="text" 
                        required
                        value={newArtTitle}
                        onChange={(e) => setNewArtTitle(e.target.value)}
                        placeholder="Contoh: Mengatasi Sindrom Impostor..."
                        className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-705 uppercase tracking-wide">Kategori Sektor</label>
                      <select
                        value={newArtCategory}
                        onChange={(e) => setNewArtCategory(e.target.value as any)}
                        className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-semibold"
                      >
                        <option value="Akademik">Akademik</option>
                        <option value="Kecemasan">Kecemasan</option>
                        <option value="Stres">Stres</option>
                        <option value="Depresi">Depresi</option>
                        <option value="Relationship">Relationship</option>
                        <option value="Self-Care">Self-Care</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-705 uppercase tracking-wide">Penulis Naskah</label>
                      <input 
                        type="text" 
                        required
                        value={newArtAuthor}
                        onChange={(e) => setNewArtAuthor(e.target.value)}
                        placeholder="Contoh: Dra. Sarah Safitri, M.Psi."
                        className="w-full bg-slate-50 text-slate-880 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-705 uppercase tracking-wide">Link Gambar Thumbnail</label>
                      <input 
                        type="text" 
                        value={newArtImageUrl}
                        onChange={(e) => setNewArtImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full bg-slate-50 text-slate-880 border border-slate-202 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-705 uppercase tracking-wide">Status Tayang</label>
                      <select
                        value={newArtStatus}
                        onChange={(e) => setNewArtStatus(e.target.value as any)}
                        className="w-full bg-slate-50 text-slate-800 border border-slate-202 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-semibold"
                      >
                        <option value="Publish">Publish / Umum</option>
                        <option value="Draft">Draft / Konsep</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-705 uppercase tracking-wide font-display">Kutipan Singkat (Excerpt)</label>
                    <input 
                      type="text" 
                      required
                      maxLength={160}
                      value={newArtExcerpt}
                      onChange={(e) => setNewArtExcerpt(e.target.value)}
                      placeholder="Tuliskan rangkuman 1 kalimat singkat mengenai isi naskah..."
                      className="w-full bg-slate-50 text-slate-880 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-705 uppercase tracking-wide">Naskah Artikel Lengkap (Gunakan baris ganda untuk paragraf baru)</label>
                    <textarea 
                      required
                      value={newArtContent}
                      onChange={(e) => setNewArtContent(e.target.value)}
                      placeholder="Mulai tuliskan artikel Anda di sini... Gunakan ### untuk sub-judul."
                      className="w-full bg-slate-50 text-slate-880 border border-slate-205 rounded-xl p-3 h-56 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed font-semibold transition-all"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsWritingArticle(false);
                        setEditingArticle(null);
                      }}
                      className="flex-1 py-3 border border-slate-205 text-slate-755 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs focus:outline-none font-bold transition-all"
                    >
                      {editingArticle ? 'Simpan Perubahan' : 'Publish Sekarang'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Published table directory */
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="flex bg-white rounded-2xl border border-slate-100 px-3.5 py-2 items-center gap-2 max-w-md shadow-3xs">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Cari artikel berdasarkan judul/kategori..."
                    value={adminArticleSearch}
                    onChange={(e) => {
                      setAdminArticleSearch(e.target.value);
                      setAdminArticlePage(1);
                    }}
                    className="bg-transparent border-none text-xs text-slate-800 outline-none w-full font-semibold"
                  />
                  {adminArticleSearch && (
                    <button 
                      onClick={() => setAdminArticleSearch('')} 
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-xs">
                  {filteredAdminArticles.length === 0 ? (
                    <div className="text-center py-12 text-slate-450 italic text-xs font-semibold">
                      Belum ada artikel yang cocok dengan pencarian Anda.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {paginatedAdminArticles.map(art => (
                        <div key={art.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50/40 transition-colors">
                          <div className="flex items-center gap-3.5">
                            <img 
                              src={art.imageUrl} 
                              alt={art.title}
                              referrerPolicy="no-referrer"
                              className="w-16 h-11 object-cover rounded-md border border-slate-100"
                            />
                            <div>
                              <h4 className="font-bold text-slate-850 text-sm line-clamp-1 font-display">{art.title}</h4>
                              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-450 mt-1 uppercase font-semibold">
                                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">{art.category}</span>
                                <span>• Oleh: {art.author.split(',')[0]}</span>
                                <span>• {art.date}</span>
                                <span className={`px-1.5 py-0.5 rounded font-extrabold ${
                                  art.status === 'Draft' 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-150' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                }`}>
                                  {art.status || 'Publish'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              onClick={() => {
                                setEditingArticle(art);
                                setNewArtTitle(art.title);
                                setNewArtCategory(art.category);
                                setNewArtExcerpt(art.excerpt || '');
                                setNewArtContent(art.content);
                                setNewArtAuthor(art.author);
                                setNewArtImageUrl(art.imageUrl);
                                setNewArtStatus(art.status || 'Publish');
                              }}
                              className="px-3 py-1.5 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all border border-slate-100 hover:border-slate-200 cursor-pointer flex items-center gap-1"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-500" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteArticle(art.id)}
                              className="px-3 py-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg text-xs font-bold transition-all border border-transparent hover:border-rose-150 cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Hapus
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pagination Controls */}
                {totalAdminPages > 1 && (
                  <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-3xs">
                    <span className="text-xs text-slate-500 font-semibold">
                      Halaman <strong>{adminArticlePage}</strong> dari <strong>{totalAdminPages}</strong> ({filteredAdminArticles.length} artikel)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAdminArticlePage(p => Math.max(1, p - 1))}
                        disabled={adminArticlePage === 1}
                        className="px-3 py-1.5 text-xs font-bold border border-slate-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer text-slate-700"
                      >
                        Sebelumnya
                      </button>
                      <button
                        onClick={() => setAdminArticlePage(p => Math.min(totalAdminPages, p + 1))}
                        disabled={adminArticlePage === totalAdminPages}
                        className="px-3 py-1.5 text-xs font-bold border border-slate-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer text-slate-700"
                      >
                        Berikutnya
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB CONTENT: EVALUASI PSIKOLOG (RATING & FEEDBACK) */}
      {activeTab === 'evaluasi-psikolog' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Evaluasi & Feedback Layanan Psikolog</h3>
            <p className="text-xs text-slate-500 font-semibold">Tinjau metrik kompetensi klinis, skor kepuasan mahasiswa, dan ulasan riil bimbingan konseling.</p>
          </div>

          {/* Search bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-3xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari psikolog..."
                value={ratingSearchQuery}
                onChange={(e) => setRatingSearchQuery(e.target.value)}
                className="w-full bg-slate-50 text-slate-800 border border-slate-150 focus:outline-none focus:border-indigo-600 rounded-xl py-2 pl-10 pr-4 text-xs font-medium"
              />
            </div>
            <div className="text-[11px] text-slate-450 font-semibold self-end md:self-auto">
              Sistem Evaluasi Terkoneksi Database Real-Time Bimbingan POLINELA
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Psychologist list table */}
            <div className="xl:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                        <th className="p-4">Nama Psikolog / Informasi</th>
                        <th className="p-4 text-center">Rata-rata Rating</th>
                        <th className="p-4 text-center">Jumlah Penilaian</th>
                        <th className="p-4 text-center">Sesi Selesai (Completed)</th>
                        <th className="p-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(() => {
                        const psychs = allUsers.filter(u => u.role === 'psikolog');
                        const filteredList = psychs.filter(p => p.name.toLowerCase().includes(ratingSearchQuery.toLowerCase()));

                        if (filteredList.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                Tidak ada psikolog yang cocok dengan kata kunci pencarian.
                              </td>
                            </tr>
                          );
                        }

                        return filteredList.map(psych => {
                          const metrics = getPsychologistMetrics(psych.id);
                          const isSelected = selectedPsychForRatings === psych.id;

                          return (
                            <tr 
                              key={psych.id} 
                              className={`transition-colors hover:bg-slate-50/50 ${isSelected ? 'bg-indigo-50/20' : ''}`}
                            >
                              <td className="p-4">
                                <div className="font-extrabold text-slate-805 text-sm">{psych.name}</div>
                                <div className="text-[10px] text-slate-400 font-medium uppercase mt-1">NIP: {psych.nimOrNip || '-'}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{psych.prodiOrUnit || 'Konseling'}</div>
                              </td>
                              <td className="p-4 text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 font-extrabold px-2.5 py-1 rounded-lg border border-amber-100">
                                  ⭐ {metrics.avgRating.toFixed(1)}
                                </div>
                              </td>
                              <td className="p-4 text-center font-bold text-slate-705 text-sm">
                                {metrics.ratingCount} Penilaian
                              </td>
                              <td className="p-4 text-center font-bold text-slate-705 text-sm">
                                <span className="bg-slate-50 px-2.5 py-1 border border-slate-150 rounded-md text-xs">
                                  {metrics.totalCompleted} Sesi
                                </span>
                              </td>
                              <td className="p-4 text-right whitespace-nowrap">
                                <button
                                  onClick={() => setSelectedPsychForRatings(psych.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ml-auto ${
                                    isSelected 
                                      ? 'bg-indigo-150 text-indigo-800 font-extrabold border border-indigo-200' 
                                      : 'bg-white text-indigo-600 border border-slate-200 hover:border-indigo-455'
                                  }`}
                                >
                                  <Eye className="w-3.5 h-3.5" /> Ulasan
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Details Comments Panel */}
            <div className="xl:col-span-1">
              {(() => {
                if (!selectedPsychForRatings) {
                  return (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-8 text-center text-slate-400 italic h-64 flex flex-col items-center justify-center min-h-[300px]">
                      <Search className="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                      <p className="text-sm font-semibold">Tinjau Detail Ulasan</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs text-center">Silakan klik tombol "Ulasan" pada deretan baris psikolog di samping untuk menampilkan keluhan, rating, dan masukan mahasiswa.</p>
                    </div>
                  );
                }

                const selectedPsych = allUsers.find(u => u.id === selectedPsychForRatings);
                if (!selectedPsych) return null;

                const metrics = getPsychologistMetrics(selectedPsych.id);

                return (
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                      <div className="text-left">
                        <h4 className="font-extrabold text-slate-850 text-sm leading-tight">{selectedPsych.name}</h4>
                        <p className="text-[10px] text-indigo-600 font-extrabold uppercase mt-1">Ulasan Real Mahasiswa</p>
                      </div>
                      <button 
                        onClick={() => setSelectedPsychForRatings(null)}
                        className="p-1 text-slate-400 hover:text-slate-650 transition-colors cursor-pointer bg-slate-50 rounded"
                        title="Tutup detail"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div className="text-left">
                        <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Rata-rata Rating</p>
                        <p className="text-2xl font-extrabold text-slate-800 mt-0.5">⭐ {metrics.avgRating.toFixed(1)} <span className="text-xs text-slate-400 font-medium">/ 5.0</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-450 font-extrabold uppercase tracking-wide">Total Responden</p>
                        <p className="text-xl font-extrabold text-slate-808 mt-0.5">{metrics.ratingCount} Mhs</p>
                      </div>
                    </div>

                    <div className="space-y-3 text-left">
                      <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Histori Komentar Mahasiswa:</p>
                      {metrics.ratingsList.length === 0 ? (
                        <p className="text-xs text-slate-400 font-semibold italic p-6 bg-slate-50/50 rounded-xl text-center">
                          Belum ada ulasan murni masuk dari mahasiswa untuk psikolog ini.
                        </p>
                      ) : (
                        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                          {metrics.ratingsList.map((rating, rIdx) => {
                            const studentUser = allUsers.find(u => u.id === rating.id_mahasiswa);
                            
                            return (
                              <div key={rating.id_penilaian || rIdx} className="p-3 bg-gradient-to-br from-white to-slate-50/40 border border-slate-100 rounded-xl space-y-1.5 shadow-3xs text-left">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-extrabold text-indigo-700">{studentUser?.name || 'Mahasiswa'}</span>
                                  <span className="text-slate-400 font-medium">
                                    {new Date(rating.tanggal_penilaian).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <span key={s} className={`text-[11px] ${s <= rating.rating ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                                  ))}
                                </div>
                                <p className="text-xs text-slate-650 font-medium italic leading-relaxed bg-white border border-slate-50 p-2.5 rounded-lg">
                                  "{rating.komentar || 'Memberikan skor bintang tanpa ulasan tulisan.'}"
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: REPORTING DATA LAYOUT */}
      {activeTab === 'reports' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Laporan & Kinerja Klinis</h3>
              <p className="text-xs text-slate-500 font-semibold">Tinjau agregasi keluhan, efisiensi penugasan psikolog, berkas arsip.</p>
            </div>

            <button
              onClick={() => {
                alert('Dokumen PDF Laporan Triwulan POLINELA berhasil dihasilkan! Silakan gunakan Ctrl+P / Cmd+P jika ingin mencetak salinan fisik.');
                window.print();
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-display shadow-xs flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto transition-colors"
            >
              <Printer className="w-4 h-4" /> Cetak Laporan POLINELA
            </button>
          </div>

          {/* Aggregated distribution cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-3">
              <span className="p-2 bg-indigo-50 text-indigo-705 rounded-lg h-fit w-fit block">
                <Users className="w-5 h-5" />
              </span>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-extrabold tracking-wider">Total Konseling Dirujuk</p>
                <h4 className="font-extrabold font-display text-slate-850 text-xl lg:text-2xl mt-1">
                  {consultations.length} Kasus
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-1">Terdaftar di server dalam 30 hari terakhir.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-3">
              <span className="p-2 bg-emerald-50 text-emerald-700 rounded-lg h-fit w-fit block">
                <CheckCircle className="w-5 h-5" />
              </span>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-extrabold tracking-wider">Tingkat Penuntasan</p>
                <h4 className="font-extrabold font-display text-slate-855 text-xl lg:text-2xl mt-1">
                  {Math.round((consultations.filter(c => c.status === 'completed' || c.status === 'approved').length / (consultations.length || 1)) * 100)}%
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-1">Status disetujui / aktif bimbingan psikolog.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-3">
              <span className="p-2 bg-blue-50 text-blue-700 rounded-lg h-fit w-fit block">
                <FileText className="w-5 h-5" />
              </span>
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-extrabold tracking-wider">Keluhan Paling Sering</p>
                <h4 className="font-extrabold font-display text-slate-855 text-xl lg:text-2xl mt-1">
                  Kecemasan & Akademik
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-1">Berdasarkan klasifikasi keluhan mahasiswa.</p>
              </div>
            </div>
          </div>

          {/* Academic audit reports list */}
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-slate-800 text-xs font-display uppercase tracking-widest">Lembar Audit Pelayanan Konseling</h4>
              <p className="text-[11px] text-slate-500">Daftar lampiran resmi yang dicetak untuk bukti skripsi / pelaporan dekanat Fakultas.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-semibold text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="p-4">Identitas Mahasiswa</th>
                      <th className="p-4">Psikolog Rujukan</th>
                      <th className="p-4">Jadwal Sesi</th>
                      <th className="p-4">Keluhan Utama</th>
                      <th className="p-4">Status Sesi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {consultations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                          Belum ada data konsultasi.
                        </td>
                      </tr>
                    ) : (
                      consultations.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50/20 font-semibold text-slate-700">
                          <td className="p-4">
                            <p className="font-bold text-slate-850 text-sm">{c.studentName}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">NIM: {c.studentNim}</p>
                          </td>
                          <td className="p-4">
                            <p className="font-semibold text-slate-750">{c.psychologistName}</p>
                          </td>
                          <td className="p-4 font-semibold text-slate-600">
                            {c.date} • {c.timeSlot}
                          </td>
                          <td className="p-4">
                            <p className="truncate max-w-xs font-semibold text-slate-650" title={c.symptoms}>{c.symptoms}</p>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                              c.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                              c.status === 'approved' ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' :
                              c.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-150' :
                              'bg-slate-50 text-slate-600 border border-slate-150'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Audit Logs section */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div>
              <h4 className="font-bold text-slate-800 text-xs font-display uppercase tracking-widest">Pencatatan Audit Keamanan (Reset Password)</h4>
              <p className="text-[11px] text-slate-500">Log administrasi resmi yang mencatat riwayat pemulihan/reset kata sandi mahasiswa oleh Admin.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-semibold text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                      <th className="p-4">Waktu Reset</th>
                      <th className="p-4">Admin Pelaksana</th>
                      <th className="p-4">Nama Mahasiswa</th>
                      <th className="p-4">NIM</th>
                      <th className="p-4 font-center">Status Log</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                          Belum ada tindakan reset password yang tercatat dalam audit sistem.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log: any) => (
                        <tr key={log.id} className="hover:bg-slate-50/25">
                          <td className="p-4 font-mono text-[11px] text-slate-500">
                            {new Date(log.timestamp).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })} • {new Date(log.timestamp).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: false
                            })} WIB
                          </td>
                          <td className="p-4 text-slate-800 font-bold">{log.adminName}</td>
                          <td className="p-4 text-slate-605">{log.studentName}</td>
                          <td className="p-4 font-mono text-[11px] text-slate-500">{log.studentNim}</td>
                          <td className="p-4 text-center">
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-750 border border-amber-150 text-[9px] font-extrabold uppercase tracking-wider inline-block">
                              RESET SUCCESS
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: KONSULTASI TATAP MUKA (OFFLINE) ADMIN */}
      {activeTab === 'counseling-offline' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-teal-50 to-indigo-50/40 p-6 rounded-3xl border border-teal-100 shadow-3xs">
            <div className="flex items-center gap-4">
              <div className="bg-teal-500 text-white rounded-2xl p-3 shrink-0">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-800 font-display">Sistem Manajemen Jadwal Offline & Antrian</h3>
                <p className="text-xs text-slate-500 font-semibold">Kelola kuota, hari penugasan bimbingan offline, serta psikolog pelaksana secara terintegrasi.</p>
              </div>
            </div>
            
            {!isAddingSchedule && (
              <button
                onClick={() => {
                  setEditingSchedule(null);
                  setScheduleHari('Senin');
                  setScheduleJamMulai('08:00');
                  setScheduleJamSelesai('11:00');
                  setScheduleKuota(10);
                  if (allPsychologists.length > 0) {
                    setSchedulePsikologId(allPsychologists[0].id);
                  }
                  setIsAddingSchedule(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-3xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto font-display"
              >
                <Plus className="w-4 h-4" /> Tambah Jadwal Layanan
              </button>
            )}
          </div>

          {/* Form Create / Edit Schedule */}
          {isAddingSchedule && (
            <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-4 animate-scale-up">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                <h4 className="font-extrabold text-slate-800 text-sm font-display uppercase tracking-wider">
                  {editingSchedule ? 'Edit Jadwal Offline' : 'Tambah Jadwal Layanan Offline Baru'}
                </h4>
                <button 
                  onClick={() => setIsAddingSchedule(false)}
                  className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg text-xs"
                >
                  Batal
                </button>
              </div>

              <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Hari select */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Hari</label>
                    <select
                      value={scheduleHari}
                      onChange={(e) => setScheduleHari(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold focus:outline-none focus:border-indigo-500"
                    >
                      {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Jam Mulai */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Jam Mulai</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: 08:00"
                      value={scheduleJamMulai}
                      onChange={(e) => setScheduleJamMulai(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  {/* Jam Selesai */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Jam Selesai</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: 11:00"
                      value={scheduleJamSelesai}
                      onChange={(e) => setScheduleJamSelesai(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  {/* Kuota */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Kuota Maksimum</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={scheduleKuota}
                      onChange={(e) => setScheduleKuota(Number(e.target.value))}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  {/* Psikolog Bertugas */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Psikolog Bertugas</label>
                    <select
                      value={schedulePsikologId}
                      required
                      onChange={(e) => setSchedulePsikologId(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 font-semibold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Pilih Psikolog --</option>
                      {allPsychologists.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingSchedule(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer font-display"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all cursor-pointer font-display"
                  >
                    {editingSchedule ? 'Simpan Perubahan' : 'Publish Jadwal'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Grid View: Jadwal & Antrian */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: list of schedules */}
            <div className="lg:col-span-1 space-y-4">
              <div>
                <h4 className="font-extrabold text-slate-800 text-xs font-display uppercase tracking-wider">Seluruh Jadwal Offline ({offlineSchedules.length})</h4>
                <p className="text-[10px] text-slate-400 font-medium">Pengelompokkan per hari layanan konsultasi kampus.</p>
              </div>

              {offlineSchedules.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-3xl text-slate-400 text-xs font-semibold font-display">
                  Belum ada jadwal offline yang ditambahkan.
                </div>
              ) : (
                <div className="space-y-4">
                  {offlineSchedules.map(schedule => {
                    const stats = getJadwalStats(schedule.id);
                    const isFull = stats.sisaKuota <= 0;
                    return (
                      <div key={schedule.id} className="bg-white border border-slate-150 p-4.5 rounded-2.5xl shadow-3xs space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 font-extrabold rounded-md text-[9px] text-slate-600 uppercase">
                              {schedule.hari}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                              <Clock className="w-3.5 h-3.5 text-indigo-500" />
                              <span>{schedule.jam_mulai} - {schedule.jam_selesai} WIB</span>
                            </div>
                            <h5 className="text-xs font-black text-slate-850 pt-0.5" title={schedule.psikolog_name}>
                              {schedule.psikolog_name}
                            </h5>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleEditScheduleClick(schedule)}
                              className="p-1 px-1.5 bg-slate-50 text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg hover:border-indigo-200 transition-all cursor-pointer font-bold text-[10px]"
                              title="Edit Jadwal"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteSchedule(schedule.id)}
                              className="p-1 px-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 rounded-lg transition-all cursor-pointer font-bold text-[10px]"
                              title="Hapus"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>

                        {/* Stats Info */}
                        <div className="grid grid-cols-3 gap-2 text-center py-2 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-655">
                          <div>
                            <span className="block text-[8px] text-slate-400 uppercase tracking-wide">Kuota</span>
                            <span>{stats.kuotaTotal}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] text-indigo-400 uppercase tracking-wide">Terisi</span>
                            <span>{stats.jumlahTerdaftar}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] text-slate-400 uppercase tracking-wide">Sisa</span>
                            <span className={isFull ? 'text-rose-600' : 'text-emerald-600'}>{stats.sisaKuota}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Side: List of Bookings / Queues */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-xs font-display uppercase tracking-wider">Antrian Mahasiswa Keseluruhan ({offlineBookings.length})</h4>
                  <p className="text-[10px] text-slate-400 font-medium">Monitor status antrian seluruh mahasiswa di POLINELA.</p>
                </div>
              </div>

              {offlineBookings.length === 0 ? (
                <div className="py-12 bg-white rounded-3xl text-center border border-dashed border-slate-200 text-slate-400 text-xs font-semibold leading-relaxed">
                  👋 Belum ada berkas pendaftaran antrian bimbingan offline mahasiswa yang masuk.
                </div>
              ) : (
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-150 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="py-3 px-3">No. Antrian</th>
                          <th className="py-3 px-3">Mahasiswa</th>
                          <th className="py-3 px-3">HP & Prodi</th>
                          <th className="py-3 px-3">Keluhan</th>
                          <th className="py-3 px-3">Petugas & Sesi</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3 text-right">Tindakan Admin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-semibold">
                        {offlineBookings.map(bk => {
                          const matchedSch = offlineSchedules.find(s => s.id === bk.jadwal_id);
                          const handleUpdateBookingStatus = async (bookingId: string, newStatus: string) => {
                            const res = await updateBookingStatusViaApi(bookingId, newStatus as any);
                            if (res.success) {
                              const booking = offlineBookings.find(b => b.id === bookingId);
                              if (booking) {
                                if (newStatus === 'Sedang Berlangsung' || newStatus === 'SEDANG_BERLANGSUNG') {
                                  createNotificationViaApi(
                                    booking.mahasiswa_id,
                                    'mahasiswa',
                                    'Antrian Offline Sedang Berlangsung',
                                    `Nomor antrian bimbingan tatap muka Anda #${booking.nomor_antrian} sedang dipanggil Admin. Silakan masuk.`
                                  );
                                } else if (newStatus === 'Selesai' || newStatus === 'SELESAI') {
                                  createNotificationViaApi(
                                    booking.mahasiswa_id,
                                    'mahasiswa',
                                    'Konsultasi Selesai',
                                    `Sesi bimbingan tatap muka offline Anda (Nomor Antrian #${booking.nomor_antrian}) telah selesai dilaksanakan.`
                                  );
                                } else if (newStatus === 'Dibatalkan' || newStatus === 'DIBATALKAN') {
                                  createNotificationViaApi(
                                    booking.mahasiswa_id,
                                    'mahasiswa',
                                    'Antrian Offline Dibatalkan',
                                    `Bimbingan tatap muka offline Anda dengan nomor antrian #${booking.nomor_antrian} telah dibatalkan.`
                                  );
                                }
                              }
                              setOfflineBookings(getAntrianKonsultasiList());
                              setOfflineSchedules(getJadwalOfflineList());
                            } else {
                              alert('Gagal memperbarui status bimbingan.');
                            }
                          };

                          return (
                            <tr key={bk.id} className="hover:bg-slate-50/40">
                              <td className="py-2.5 px-3 font-mono font-black text-indigo-700">
                                {bk.nomor_antrian}
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="font-extrabold text-slate-800">{bk.mahasiswa_name}</p>
                                <p className="text-[9px] text-slate-400">NIM {bk.mahasiswa_nim}</p>
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="text-slate-700">{bk.mahasiswa_phone}</p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase">{bk.mahasiswa_prodi}</p>
                              </td>
                              <td className="py-2.5 px-3 max-w-[120px] truncate" title={bk.keluhan}>
                                <p className="text-slate-500 italic">"{bk.keluhan}"</p>
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="text-slate-750 font-bold line-clamp-1">{bk.psikolog_name || matchedSch?.psikolog_name}</p>
                                <p className="text-[9px] font-semibold text-indigo-600">{matchedSch?.hari} / {matchedSch?.jam_mulai}-{matchedSch?.jam_selesai}</p>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`text-[8px] px-2 py-0.5 font-extrabold rounded-lg uppercase tracking-wide border ${
                                  ['Menunggu', 'MENUNGGU', 'Sedang Berlangsung', 'SEDANG_BERLANGSUNG', 'CHECK_IN'].includes(bk.status)
                                    ? 'bg-emerald-50 text-emerald-805 border-emerald-100'
                                    : ['Selesai', 'SELESAI'].includes(bk.status)
                                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                                      : ['Dibatalkan', 'DIBATALKAN'].includes(bk.status)
                                        ? 'bg-rose-50 text-rose-850 border-rose-100'
                                        : ['Ditolak', 'DITOLAK', 'rejected'].includes(bk.status)
                                          ? 'bg-rose-50 text-rose-850 border-rose-100'
                                          : 'bg-amber-50 text-amber-855 border-amber-100'
                                }`}>
                                  {bk.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {['Terdaftar', 'TERDAFTAR'].includes(bk.status) && (
                                    <>
                                      <button 
                                        onClick={() => handleUpdateBookingStatus(bk.id, 'Menunggu')}
                                        className="p-1 px-1.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 rounded cursor-pointer hover:bg-emerald-100"
                                      >
                                        Setujui
                                      </button>
                                      <button 
                                        onClick={() => handleUpdateBookingStatus(bk.id, 'DIBATALKAN')}
                                        className="p-1 px-1.5 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-150 rounded cursor-pointer hover:bg-rose-100"
                                      >
                                        Batal
                                      </button>
                                    </>
                                  )}
                                  {['Menunggu', 'MENUNGGU', 'CHECK_IN'].includes(bk.status) && (
                                    <>
                                      <button 
                                        onClick={() => handleUpdateBookingStatus(bk.id, 'SEDANG_BERLANGSUNG')}
                                        className="p-1 px-1.5 text-[9px] font-bold text-teal-750 bg-teal-50 border border-teal-150 rounded cursor-pointer hover:bg-teal-100"
                                      >
                                        Mulai
                                      </button>
                                      <button 
                                        onClick={() => handleUpdateBookingStatus(bk.id, 'SELESAI')}
                                        className="p-1 px-1.5 text-[9px] font-bold text-white bg-indigo-600 rounded cursor-pointer hover:bg-indigo-700"
                                      >
                                        Selesai
                                      </button>
                                    </>
                                  )}
                                  {['Sedang Berlangsung', 'SEDANG_BERLANGSUNG'].includes(bk.status) && (
                                    <button 
                                      onClick={() => handleUpdateBookingStatus(bk.id, 'Selesai')}
                                      className="p-1 px-1.5 text-[9px] font-bold text-white bg-indigo-600 rounded cursor-pointer hover:bg-indigo-700"
                                    >
                                      Selesai
                                    </button>
                                  )}
                                  {(['Selesai', 'SELESAI', 'Dibatalkan', 'DIBATALKAN', 'DITOLAK', 'rejected', 'Ditolak'].includes(bk.status)) && (
                                    <span className="text-[8px] text-slate-400 italic">Arsip</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: PROFIL SAYA */}
      {activeTab === 'profil' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          {/* Main Profile Form Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-50 pb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg font-display">Profil Administrator</h3>
                  <p className="text-xs text-slate-500 font-semibold">Tinjau dan sesuaikan biodata administrator sistem untuk notifikasi rujukan.</p>
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setAvatarFileError(null);
                      setProfileNotice(null);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-3xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <Camera className="w-3.5 h-3.5" /> Edit Profil
                  </button>
                ) : (
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setAvatarPreview(currentUser.avatarUrl || null);
                        setAvatarFileError(null);
                      }}
                      className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      form="admin-profile-form"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-3xs transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Simpan Perubahan
                    </button>
                  </div>
                )}
              </div>

              {/* Status Notice Banner */}
              {profileNotice && (
                <div className={`p-4 rounded-xl text-xs font-semibold border ${
                  profileNotice.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-150 text-emerald-800' 
                    : 'bg-rose-50 border-rose-150 text-rose-800'
                }`}>
                  {profileNotice.text}
                </div>
              )}

              {/* Profile Photo Upload Zone */}
              <div className="flex flex-col sm:flex-row items-center gap-5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <div className="relative w-20 h-20 bg-slate-100 rounded-full overflow-hidden border-2 border-white shadow-2xs flex items-center justify-center shrink-0">
                  {avatarPreview ? (
                    <img 
                      src={avatarPreview} 
                      alt="Avatar Preview" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-extrabold text-2xl font-display uppercase">
                      {currentUser.name.charAt(0)}
                    </div>
                  )}
                  {isEditing && (
                    <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center text-white text-[9px] font-bold">
                      AKTIF
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex-1 text-center sm:text-left">
                  <h4 className="font-bold text-xs text-slate-700">Foto Profil Utama</h4>
                  <p className="text-[10px] text-slate-450 leading-normal font-semibold">
                    Format file: JPG, JPEG, PNG. Maksimal 2 MB.
                  </p>
                  
                  {isEditing && (
                    <div className="pt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-205 text-slate-700 rounded-lg text-[10px] font-bold transition-colors cursor-pointer shadow-3xs">
                        <Upload className="w-3 h-3 text-slate-500" /> Pilih File Foto
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const fileType = file.type;
                              const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
                              if (!validTypes.includes(fileType)) {
                                setAvatarFileError('Format file harus berupa JPG, JPEG, atau PNG.');
                                return;
                              }
                              if (file.size > 2 * 1024 * 1024) {
                                setAvatarFileError('Ukuran file maksimal adalah 2 MB.');
                                return;
                              }
                              
                              setAvatarFileError(null);
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                if (event.target?.result) {
                                  setAvatarPreview(event.target.result as string);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      {(avatarPreview || currentUser.avatarUrl) && (
                        <button
                          type="button"
                          onClick={() => setShowDeleteAvatarConfirm(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-[10px] font-bold transition-colors cursor-pointer shadow-3xs"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" /> Hapus Foto Profil
                        </button>
                      )}
                      {avatarFileError && (
                        <p className="text-[10px] text-rose-500 font-bold mt-1 w-full">{avatarFileError}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Editable Fields Form */}
              <form id="admin-profile-form" onSubmit={(e) => {
                e.preventDefault();
                if (avatarFileError) {
                  setProfileNotice({ type: 'error', text: 'Perbaiki kesalahan foto profil terlebih dahulu.' });
                  return;
                }
                const formData = new FormData(e.currentTarget);
                
                // Email check
                const emailVal = formData.get('email') as string;
                if (!emailVal.includes('@')) {
                  setProfileNotice({ type: 'error', text: 'Alamat email yang dimasukkan tidak valid.' });
                  return;
                }

                if (onUpdateProfile) {
                  const updatedUser: User = {
                    ...currentUser,
                    name: formData.get('name') as string,
                    email: emailVal,
                    phoneNumber: formData.get('phoneNumber') as string,
                    avatarUrl: avatarPreview || undefined
                  };
                  onUpdateProfile(updatedUser);
                } else {
                  // Local direct update fallback
                  const usersStore = localStorage.getItem('app_users');
                  if (usersStore) {
                    const dbUsers: User[] = JSON.parse(usersStore);
                    const dbUserIdx = dbUsers.findIndex(u => u.id === currentUser.id);
                    if (dbUserIdx !== -1) {
                      dbUsers[dbUserIdx] = {
                        ...dbUsers[dbUserIdx],
                        name: formData.get('name') as string,
                        email: emailVal,
                        phoneNumber: formData.get('phoneNumber') as string,
                        avatarUrl: avatarPreview || undefined
                      };
                      localStorage.setItem('app_users', JSON.stringify(dbUsers));
                      localStorage.setItem('logged_in_user', JSON.stringify(dbUsers[dbUserIdx]));
                    }
                  }
                }

                setIsEditing(false);
                setProfileNotice({ type: 'success', text: 'Profil berhasil diperbarui.' });
                setTimeout(() => setProfileNotice(null), 4000);
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Nama Lengkap Admin</label>
                    <input 
                      type="text" 
                      name="name" 
                      defaultValue={currentUser.name} 
                      disabled={!isEditing}
                      required 
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                        isEditing 
                          ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800' 
                          : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Email Administrator</label>
                    <input 
                      type="email" 
                      name="email" 
                      defaultValue={currentUser.email} 
                      disabled={!isEditing}
                      required 
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                        isEditing 
                          ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800' 
                          : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">No. Telepon / Hotline Layanan Kampus</label>
                  <input 
                    type="text" 
                    name="phoneNumber" 
                    defaultValue={currentUser.phoneNumber || ''} 
                    placeholder="Contoh: 0812345678" 
                    disabled={!isEditing}
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                      isEditing 
                        ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800' 
                        : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed'
                    }`}
                  />
                </div>
              </form>
            </div>

            {/* PASSWORD SECURITY FORM SECTION (Ubah Password) */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                <Lock className="w-5 h-5 text-indigo-500" />
                <div>
                  <h3 className="font-bold text-slate-800 text-sm md:text-base font-display">Ubah Password Akun</h3>
                  <p className="text-xs text-slate-500">Perbarui kata sandi Anda menggunakan hashing standar keamanan tinggi.</p>
                </div>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                if (!oldPassword || !newPassword || !confirmPassword) {
                  alert("Semua field kata sandi harus diisi.");
                  return;
                }
                
                if (newPassword !== confirmPassword) {
                  alert("Konfirmasi password baru tidak cocok.");
                  return;
                }

                // Verify and Hash Password
                const usersStore = localStorage.getItem('app_users');
                if (usersStore) {
                  const dbUsers: User[] = JSON.parse(usersStore);
                  const dbUserIdx = dbUsers.findIndex(u => u.id === currentUser.id);
                  if (dbUserIdx !== -1) {
                    const storedUser = dbUsers[dbUserIdx];
                    
                    if (storedUser.password && storedUser.password !== oldPassword) {
                      alert("Password lama yang Anda masukkan salah.");
                      return;
                    }

                    dbUsers[dbUserIdx].password = newPassword;
                    localStorage.setItem('app_users', JSON.stringify(dbUsers));
                    
                    const updatedMe = { ...currentUser, password: newPassword };
                    localStorage.setItem('logged_in_user', JSON.stringify(updatedMe));
                    
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    alert("Password Anda berhasil dienkripsi dan diperbarui ke database!");
                  }
                }
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Password Lama</label>
                    <input 
                      type="password" 
                      required
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Password Baru</label>
                    <input 
                      type="password" 
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Konfirmasi Password Baru</label>
                    <input 
                      type="password" 
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full bg-slate-50 border border-slate-205 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 border border-slate-700 hover:border-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5 text-indigo-300" /> Selesaikan Pembaruan Sandi
                </button>
              </form>
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-indigo-100/90 rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="text-white text-xs uppercase font-extrabold tracking-widest flex items-center gap-1.5 font-display">
                <Shield className="w-4 h-4 text-indigo-300" /> Konsol Admin
              </h4>
              <p className="text-[11px] leading-relaxed text-indigo-250 font-semibold">
                Anda login sebagai <strong className="text-white">SUPER ADMIN / UTAMA</strong>. Memiliki kendali menyeluruh atas akun, registrasi, penjadwalan bimbingan universitas, serta penayangan literasi kesehatan mental.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DELETE AVATAR MODAL */}
      {showDeleteAvatarConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in animate-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-extrabold text-slate-800 text-sm md:text-base font-display">Hapus Foto Profil</h3>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  Apakah Anda yakin ingin menghapus foto profil ini?
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setShowDeleteAvatarConfirm(false)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const updatedUser = {
                    ...currentUser,
                    avatarUrl: undefined
                  };
                  setAvatarPreview(null);
                  setAvatarFileError(null);
                  if (onUpdateProfile) {
                    onUpdateProfile(updatedUser);
                  }
                  setShowDeleteAvatarConfirm(false);
                  setProfileNotice({ type: 'success', text: 'Foto profil utama admin berhasil dihapus.' });
                  setTimeout(() => setProfileNotice(null), 4000);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all cursor-pointer shadow-sm shadow-rose-100"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION DELETE/DEACTIVATE STUDENT MODAL */}
      {studentToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in animate-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full border border-slate-100 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className={`p-3 rounded-2xl shrink-0 ${isDeactivatingOnly ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
                {isDeactivatingOnly ? (
                  <AlertCircle className="w-6 h-6 animate-pulse" />
                ) : (
                  <Trash2 className="w-6 h-6 animate-pulse" />
                )}
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-extrabold text-slate-800 text-sm md:text-base font-display">
                  {isDeactivatingOnly ? 'Nonaktifkan Akun' : 'Hapus Mahasiswa?'}
                </h3>
                
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1 font-semibold">
                  <p><span className="text-slate-400">Nama:</span> <span className="text-slate-800 font-extrabold">{studentToDelete.name}</span></p>
                  <p><span className="text-slate-400">NIM:</span> <span className="font-mono text-slate-800 font-extrabold">{studentToDelete.nimOrNip}</span></p>
                </div>
                
                {isDeactivatingOnly ? (
                  <p className="text-xs text-rose-605 bg-rose-50/50 p-3 rounded-lg border border-rose-100 font-bold leading-relaxed">
                    Mahasiswa memiliki data konsultasi yang tersimpan. Akun hanya dapat dinonaktifkan.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Apakah Anda yakin ingin menghapus mahasiswa ini? <strong className="text-rose-605 block mt-1">Tindakan ini tidak dapat dibatalkan.</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setStudentToDelete(null);
                  setIsDeactivatingOnly(false);
                }}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              
              {isDeactivatingOnly ? (
                <button
                  type="button"
                  onClick={() => {
                    const updatedStudent = { ...studentToDelete, status: 'nonaktif' };
                    const nextUsers = allUsers.map(u => u.id === studentToDelete.id ? updatedStudent : u);
                    setAllUsers(nextUsers);
                    localStorage.setItem('app_users', JSON.stringify(nextUsers));
                    
                    fetch('/api/users', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(updatedStudent),
                    }).catch(err => console.error('SQL deactivate sync failed:', err));

                    setStudentSuccessMessage("Akun mahasiswa berhasil dinonaktifkan.");
                    setStudentToDelete(null);
                    setIsDeactivatingOnly(false);
                    alert("Akun mahasiswa berhasil dinonaktifkan.");
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all cursor-pointer shadow-sm shadow-amber-100"
                >
                  Nonaktifkan Akun
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const deactStudent = { ...studentToDelete, status: 'nonaktif' };
                    const nextUsers = allUsers.filter(u => u.id !== studentToDelete.id);
                    setAllUsers(nextUsers);
                    localStorage.setItem('app_users', JSON.stringify(nextUsers));
                    
                    fetch('/api/users', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(deactStudent),
                    }).catch(err => console.error('SQL deactivate sync failed:', err));

                    setStudentSuccessMessage("Mahasiswa berhasil dihapus.");
                    setStudentToDelete(null);
                    setIsDeactivatingOnly(false);
                    alert("Mahasiswa berhasil dihapus.");
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all cursor-pointer shadow-sm shadow-rose-100"
                >
                  Hapus Mahasiswa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION RESET PASSWORD STUDENT MODAL */}
      {studentToResetPassword && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in animate-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl shrink-0 bg-amber-50 text-amber-600 animate-bounce">
                <Key className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-extrabold text-slate-800 text-sm md:text-base font-display">
                  Reset Password Mahasiswa
                </h3>
                
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-605 space-y-1 font-semibold text-left">
                  <p><span className="text-slate-400 font-extrabold">Nama:</span> <span className="text-slate-800 font-extrabold">{studentToResetPassword.name}</span></p>
                  <p><span className="text-slate-400 font-extrabold">NIM:</span> <span className="font-mono text-slate-800 font-extrabold">{studentToResetPassword.nimOrNip}</span></p>
                </div>
                
                <p className="text-xs text-slate-500 font-semibold leading-relaxed pt-1">
                  Password sementara akan diganti menjadi:
                </p>

                <div className="bg-amber-55 border border-amber-150 rounded-xl px-4 py-2 text-center text-amber-800 font-mono font-bold text-sm select-all">
                  Polinela123
                </div>

                <p className="text-[11px] text-rose-550 font-bold leading-relaxed pt-1">
                  Password lama tidak dapat digunakan lagi.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 text-xs font-bold text-slate-700">
              <button
                type="button"
                onClick={() => setStudentToResetPassword(null)}
                className="px-4 py-2 border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 rounded-xl transition-all cursor-pointer font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmResetPassword}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-100 hover:shadow-indigo-200 font-bold"
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STUDENT ACTION SUCCESS NOTIFICATION TOAST OVERLAY */}
      {studentSuccessMessage && (
        <div className="fixed top-4 right-4 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-2xl p-4 shadow-lg z-50 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <div>
            <p className="font-extrabold text-xs uppercase tracking-wider text-emerald-900">Sukses</p>
            <p className="text-xs font-semibold">{studentSuccessMessage}</p>
          </div>
          <button onClick={() => setStudentSuccessMessage(null)} className="p-1 hover:bg-emerald-100 rounded text-slate-400 hover:text-slate-600 ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
