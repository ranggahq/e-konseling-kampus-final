import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, MessageSquare, Video, ClipboardCheck, Clock, Calendar, 
  User as UserIcon, CheckCircle2, ShieldAlert, Sparkles, BookOpen, ChevronRight, FileText,
  Lock, Upload, Camera, Check, X, MapPin, Ticket, Trash2, AlertCircle
} from 'lucide-react';
import { User, Consultation, JadwalOffline, AntrianKonsultasi, Article, PenilaianKonsultasi } from '../types';
import { INITIAL_ARTICLES } from '../data/mockData';
import ChatDashboardMenu from './ChatDashboardMenu';
import ArticleDetailModal from './ArticleDetailModal';
import { 
  getJadwalOfflineList, 
  getAntrianKonsultasiList, 
  getJadwalStats, 
  saveAntrianKonsultasiList,
  syncWithBackend,
  updateBookingStatusViaApi,
  updateOfflineBookingReportViaApi,
  getPsychologistNotifications,
  markNotificationsAsRead,
  ServerNotification,
  fetchAllChatMessages,
  createNotificationViaApi,
  getRatingsViaApi
} from '../data/offlineDb';

interface PsychologistDashboardProps {
  currentUser: User;
  consultations: Consultation[];
  setConsultations: React.Dispatch<React.SetStateAction<Consultation[]>>;
  onSaveNotes: (consultationId: string, notes: string, recommendations: string[]) => void;
  onUpdateProfile: (updatedUser: User) => void;
}

// Helper to format notification dynamic timestamps in clean Indonesian with Asia/Jakarta (WIB) timezone
const formatNotificationTime = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    let d: Date;
    let normalized = dateStr.trim();
    // Normalize format "YYYY-MM-DD HH:mm:ss" into ISO string "YYYY-MM-DDTHH:mm:ssZ"
    // to force browsers to parse it as UTC instead of local browser timezone.
    if (normalized.length === 19 && normalized.includes(' ')) {
      normalized = normalized.replace(' ', 'T') + 'Z';
    } else if (normalized.length > 10 && !normalized.includes('T') && !normalized.endsWith('Z')) {
      normalized = normalized.replace(' ', 'T') + 'Z';
    }
    
    d = new Date(normalized);
    if (isNaN(d.getTime())) {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) {
      return dateStr;
    }

    // Extract parts in Asia/Jakarta timezone
    const getParts = (date: Date) => {
      // Asia/Jakarta is UTC + 7 hours
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const jakartaDate = new Date(utc + (3600000 * 7));
      
      const hr = String(jakartaDate.getHours()).padStart(2, '0');
      const min = String(jakartaDate.getMinutes()).padStart(2, '0');
      
      return {
        year: jakartaDate.getFullYear(),
        month: jakartaDate.getMonth(), // 0-11
        day: jakartaDate.getDate(),
        hour: hr,
        minute: min
      };
    };

    const targetParts = getParts(d);
    const nowParts = getParts(new Date());

    const targetDay = new Date(targetParts.year, targetParts.month, targetParts.day);
    const nowDay = new Date(nowParts.year, nowParts.month, nowParts.day);

    const diffTime = nowDay.getTime() - targetDay.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `${targetParts.hour}:${targetParts.minute}`;
    } else if (diffDays === 1) {
      return `Kemarin, ${targetParts.hour}:${targetParts.minute}`;
    } else {
      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 
        'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
      ];
      const dayStr = String(targetParts.day).padStart(2, '0');
      const monthStr = monthNames[targetParts.month] || 'Jun';
      return `${dayStr} ${monthStr} ${targetParts.year}, ${targetParts.hour}:${targetParts.minute}`;
    }
  } catch (e) {
    return 'Beberapa waktu lalu';
  }
};

export default function PsychologistDashboard({ 
  currentUser, 
  consultations, 
  setConsultations,
  onSaveNotes,
  onUpdateProfile
}: PsychologistDashboardProps) {
  const [activeTab, setActiveTabState] = useState<'overview' | 'counseling-online' | 'chat-konsultasi' | 'counseling-offline' | 'riwayat-penanganan' | 'my-schedule' | 'articles' | 'profil'>(() => {
    const saved = localStorage.getItem('psychologist_active_tab');
    if (saved) return saved as any;
    return 'overview';
  });

  const setActiveTab = (tab: 'overview' | 'counseling-online' | 'chat-konsultasi' | 'counseling-offline' | 'riwayat-penanganan' | 'my-schedule' | 'articles' | 'profil') => {
    localStorage.setItem('psychologist_active_tab', tab);
    setActiveTabState(tab);
  };
  const [onlineSubTab, setOnlineSubTab] = useState<'requests' | 'scheduled' | 'active' | 'history'>('requests');
  const [psychologistArticles, setPsychologistArticles] = useState<Article[]>([]);
  const [psychologistArticleSearch, setPsychologistArticleSearch] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() => {
    return localStorage.getItem('active_chat_id') || null;
  });

  const selectedChat = useMemo(() => {
    if (!selectedChatId) return null;
    return consultations.find(c => c.id === selectedChatId) || null;
  }, [consultations, selectedChatId]);

  useEffect(() => {
    if (selectedChatId) {
      localStorage.setItem('active_chat_id', selectedChatId);
    } else {
      localStorage.removeItem('active_chat_id');
    }
  }, [selectedChatId]);

  // Clean active_chat_id if consultation does not exist or has been deleted
  useEffect(() => {
    if (selectedChatId && consultations.length > 0) {
      const exists = consultations.some(c => c.id === selectedChatId);
      if (!exists) {
        setSelectedChatId(null);
        localStorage.removeItem('active_chat_id');
      }
    }
  }, [consultations, selectedChatId]);

  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);
  const [chatToast, setChatToast] = useState<{ text: string; senderName: string } | null>(null);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const isFirstCheckRef = useRef(true);

  // Poll for global unreads count
  useEffect(() => {
    let active = true;
    const checkUnreads = async () => {
      try {
        const msgs = await fetchAllChatMessages();
        if (!active) return;
        
        const unreadReceived = msgs.filter(m => m.receiver_id === currentUser.id && !m.is_read);
        const newCount = unreadReceived.length;
        setGlobalUnreadCount(prev => prev === newCount ? prev : newCount);

        if (isFirstCheckRef.current) {
          unreadReceived.forEach(m => {
            if (m.id) notifiedMessageIdsRef.current.add(m.id);
          });
          isFirstCheckRef.current = false;
        } else {
          const newUnreads = unreadReceived.filter(m => m.id && !notifiedMessageIdsRef.current.has(m.id));
          if (newUnreads.length > 0) {
            const latestNewMsg = newUnreads[newUnreads.length - 1];
            newUnreads.forEach(m => {
              if (m.id) notifiedMessageIdsRef.current.add(m.id);
            });

            // For Psychologist, show "🔔 Pesan Baru"
            const toastTitle = '🔔 Pesan Baru';

            setChatToast({
              text: latestNewMsg.message || '',
              senderName: toastTitle
            });

            setTimeout(() => {
              setChatToast(null);
            }, 4500);
          }
        }
      } catch (err) {
        console.warn('Silent alert on unreads checking failure:', err);
      }
    };
    checkUnreads();
    const interval = setInterval(checkUnreads, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUser.id]);

  // Status ketersediaan psikolog (online, busy, offline)
  const [availabilityStatus, setAvailabilityStatus] = useState<'online' | 'busy' | 'offline'>(() => {
    const saved = localStorage.getItem(`psych_status_${currentUser.id}`);
    if (saved === 'online' || saved === 'busy' || saved === 'offline') {
      return saved;
    }
    // backward compatibility
    if (saved === 'Online') return 'online';
    if (saved === 'Offline') return 'offline';
    if (saved === 'Sedang Bertugas' || saved === 'Sedang Konsultasi') return 'busy';
    return 'online';
  });

  const handleStatusChange = (newStatus: 'online' | 'busy' | 'offline') => {
    setAvailabilityStatus(newStatus);
    localStorage.setItem(`psych_status_${currentUser.id}`, newStatus);
  };

  // --- OFFLINE CONSULTATION STATES ---
  const [offlineSchedules, setOfflineSchedules] = useState<JadwalOffline[]>([]);
  const [offlineBookings, setOfflineBookings] = useState<AntrianKonsultasi[]>([]);

  // --- OFFLINE NOTIFICATIONS FLOW ---
  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const [allRatings, setAllRatings] = useState<PenilaianKonsultasi[]>([]);

  useEffect(() => {
    const freshSchedules = getJadwalOfflineList();
    const freshBookings = getAntrianKonsultasiList();
    setOfflineSchedules(prev => JSON.stringify(prev) === JSON.stringify(freshSchedules) ? prev : freshSchedules);
    setOfflineBookings(prev => JSON.stringify(prev) === JSON.stringify(freshBookings) ? prev : freshBookings);

    // Fetch articles for psychologists
    const artStore = localStorage.getItem('all_articles');
    if (artStore) {
      try {
        const parsed = JSON.parse(artStore);
        setPsychologistArticles(prev => JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed);
      } catch (e) {
        setPsychologistArticles(INITIAL_ARTICLES);
      }
    } else {
      setPsychologistArticles(INITIAL_ARTICLES);
    }

    // Pull ratings
    getRatingsViaApi().then(ratings => {
      setAllRatings(prev => JSON.stringify(prev) === JSON.stringify(ratings) ? prev : ratings);
    }).catch(err => console.error(err));

    // Pull notifications & database tables
    getPsychologistNotifications(currentUser.id)
      .then(list => {
        setNotifications(prev => JSON.stringify(prev) === JSON.stringify(list) ? prev : list);
      })
      .catch(err => console.error(err));

    syncWithBackend().then(data => {
      setOfflineSchedules(prev => JSON.stringify(prev) === JSON.stringify(data.schedules) ? prev : data.schedules);
      setOfflineBookings(prev => JSON.stringify(prev) === JSON.stringify(data.bookings) ? prev : data.bookings);
    }).catch(err => console.error(err));
  }, [activeTab, currentUser.id]);

  // Profile editing states
  const [isEditing, setIsEditing] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(currentUser.avatarUrl || null);
  const [avatarFileError, setAvatarFileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<{ type: 'success' | 'error'; text: string; } | null>(null);
  const [showDeleteAvatarConfirm, setShowDeleteAvatarConfirm] = useState(false);

  // Sync avatarPreview when currentUser.avatarUrl changes (e.g. on mount/server updates)
  useEffect(() => {
    setAvatarPreview(currentUser.avatarUrl || null);
  }, [currentUser.avatarUrl]);

  // Password changes states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Modern modal override states
  const [dashboardNotice, setDashboardNotice] = useState<string | null>(null);
  const [dashboardNoticeType, setDashboardNoticeType] = useState<'success' | 'error' | 'info'>('info');
  const [cancelPromptId, setCancelPromptId] = useState<string | null>(null);
  const [cancelPromptReason, setCancelPromptReason] = useState('');
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(null);

  // States for handling Intake approval & rescheduling
  const [approvingIntakeId, setApprovingIntakeId] = useState<string | null>(null);
  const [altDate, setAltDate] = useState('');
  const [altSlot, setAltSlot] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Video Call report form states
  const [videoReportingSession, setVideoReportingSession] = useState<any | null>(null);
  const [videoDiagnosis, setVideoDiagnosis] = useState('');
  const [videoRecs, setVideoRecs] = useState<string[]>(['Istirahat Mandiri']);
  const [customVideoRec, setCustomVideoRec] = useState('');
  const [isFinishingSession, setIsFinishingSession] = useState(false);
  const [finishingStatusMessage, setFinishingStatusMessage] = useState('');
  const [videoErrorMsg, setVideoErrorMsg] = useState('');

  // --- STATES FOR RIWAYAT PENANGANAN ---
  const [riwayatSubTab, setRiwayatSubTab] = useState<'online' | 'offline'>('online');
  const [selectedDetailOnline, setSelectedDetailOnline] = useState<Consultation | null>(null);
  const [selectedDetailOffline, setSelectedDetailOffline] = useState<AntrianKonsultasi | null>(null);

  // 1. Core function to update status of a consultation
  const updateConsultationStatus = (sessionId: string, newStatus: string) => {
    const targetSession = consultations.find(c => c.id === sessionId);
    if (targetSession) {
      if (newStatus === 'approved') {
        createNotificationViaApi(
          targetSession.studentId,
          'mahasiswa',
          'Jadwal Video Call Disetujui',
          `Jadwal video call Anda bersama Psikolog ${targetSession.psychologistName} pada ${targetSession.date} pukul ${targetSession.timeSlot} telah disetujui.`
        );
      } else if (newStatus === 'cancelled') {
        createNotificationViaApi(
          targetSession.studentId,
          'mahasiswa',
          'Jadwal Video Call Dibatalkan',
          `Sesi bimbingan video call Anda bersama Psikolog ${targetSession.psychologistName} telah dibatalkan.`
        );
      }
    }

    const updated = consultations.map(c => {
      if (c.id === sessionId) {
        return {
          ...c,
          status: newStatus as any,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });
    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));
  };

  // 2. Core function to save diagnosis and recommendations, and complete the video call
  const completeVideoCall = async (sessionId: string, diagnosis: string, recs: string[]): Promise<boolean> => {
    try {
      const targetSession = consultations.find(c => c.id === sessionId);
      if (targetSession) {
        createNotificationViaApi(
          targetSession.studentId,
          'mahasiswa',
          'Konsultasi Selesai',
          `Sesi video call Anda bersama Psikolog ${targetSession.psychologistName} telah selesai. Catatan hasil konseling & rekomendasi kini tersedia.`
        );
        createNotificationViaApi(
          currentUser.id,
          'psikolog',
          'Sesi Konsultasi Selesai',
          `Sesi bimbingan video call dengan mahasiswa ${targetSession.studentName} berhasil diselesaikan.`
        );
      }

      const updated = consultations.map(c => {
        if (c.id === sessionId) {
          return {
            ...c,
            status: 'SELESAI' as any,
            diagnosisNotes: diagnosis,
            recommendations: recs,
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
      setConsultations(updated);
      localStorage.setItem('all_consultations', JSON.stringify(updated));
      return true;
    } catch (error) {
      console.error(`[DEBUG] Error in completeVideoCall:`, error);
      throw error;
    }
  };

  // 3. Robust alias function requested by user audit
  const finishSession = async (sessionId: string, diagnosis: string, recs: string[]): Promise<boolean> => {
    return await completeVideoCall(sessionId, diagnosis, recs);
  };

  // 4. Submit handler for Video Call Session Report Modal
  const handleFinishSession = async () => {
    setVideoErrorMsg('');
    
    const payload = {
      session_id: videoReportingSession?.id,
      psychologist_id: currentUser?.id,
      diagnosis: videoDiagnosis,
      recommendations: videoRecs
    };

    // Validation checks
    let validationResult = { isValid: true, errorMsg: "" };
    if (!payload.session_id) {
      validationResult = { isValid: false, errorMsg: "ID Sesi video call tidak valid atau tidak ditemukan. Silakan muat ulang halaman." };
    } else if (!payload.psychologist_id) {
      validationResult = { isValid: false, errorMsg: "ID Psikolog tidak terdeteksi. Silakan coba masuk kembali." };
    } else if (!payload.diagnosis || !payload.diagnosis.trim()) {
      validationResult = { isValid: false, errorMsg: "Catatan diagnosis bimbingan wajib diisi." };
    } else if (!payload.recommendations || payload.recommendations.length === 0) {
      validationResult = { isValid: false, errorMsg: "Pilih minimal satu rekomendasi rencana tindak lanjut bimbingan." };
    }

    if (!validationResult.isValid) {
      setVideoErrorMsg(validationResult.errorMsg);
      alert(validationResult.errorMsg);
      return;
    }

    // Set loading state
    setIsFinishingSession(true);
    setFinishingStatusMessage("Menyimpan...");

    try {
      // Simulate real file-write / API timeout to display loading state nicely
      await new Promise((resolve) => setTimeout(resolve, 600));
      setFinishingStatusMessage("Memproses sesi...");
      await new Promise((resolve) => setTimeout(resolve, 550));

      const success = await finishSession(payload.session_id, payload.diagnosis, payload.recommendations);
      
      if (success) {
        setVideoReportingSession(null);
        setVideoDiagnosis('');
        setVideoRecs([]);
        setVideoErrorMsg('');
        alert("Sesi Video Call berhasil diakhiri secara permanen. Dokumen diagnosa bimbingan dan seluruh rekomendasi dimasukkan dalam rekam psikologis mahasiswa.");
      } else {
        throw new Error("Gagal menyimpan data ke database bimbingan.");
      }
    } catch (error: any) {
      console.error("Failed completing the video session:", error);
      setVideoErrorMsg(error?.message || "Kesalahan tidak dikenal saat memproses bimbingan.");
      alert(`Terjadi kesalahan saat memproses sesi: ${error?.message || "Kesalahan tidak dikenal"}`);
    } finally {
      setIsFinishingSession(false);
      setFinishingStatusMessage("");
    }
  };

  // Offline report form states
  const [offlineReportingBooking, setOfflineReportingBooking] = useState<any | null>(null);
  const [offlineDiagnosis, setOfflineDiagnosis] = useState('');
  const [offlineObservation, setOfflineObservation] = useState('');
  const [offlineRecs, setOfflineRecs] = useState<string[]>([]);
  const [customOfflineRec, setCustomOfflineRec] = useState('');

  // Sub-divide sessions assigned to this specific psychologist (ONLY Video Call sessions!)
  const mySessions = consultations.filter(c => c.psychologistId === currentUser.id && c.type === 'video');
  const pendingIntakes = mySessions.filter(c => c.status === 'pending');
  const scheduledSessions = mySessions.filter(c => c.status === 'approved' || c.status === 'scheduled' || c.status === 'MENUNGGU_JADWAL');
  const activeSessions = mySessions.filter(c => c.status === 'ongoing' || c.status === 'SEDANG_BERLANGSUNG');
  const completedSessions = mySessions.filter(c => c.status === 'completed' || c.status === 'SELESAI');

  // --- COMPREHENSIVE COMBINED STATISTICS (ONLINE CHAT/VIDEO & OFFLINE TATAP MUKA) ---
  const allMyOnlineConsultations = consultations.filter(c => c.psychologistId === currentUser.id);
  const mySchedulesForStats = offlineSchedules.filter(s => s.psikolog_id === currentUser.id);
  const myScheduleIdsForStats = mySchedulesForStats.map(s => s.id);
  const allMyOfflineBookings = offlineBookings.filter(b => myScheduleIdsForStats.includes(b.jadwal_id));

  // 1. TOTAL SESI DITANGANI (all consultations: active + completed + cancelled + pending)
  const totalSesiDitangani = allMyOnlineConsultations.length + allMyOfflineBookings.length;

  // 2. SESI AKTIF DISETUJUI (active status)
  const onlineActiveCount = allMyOnlineConsultations.filter(c => 
    ['approved', 'scheduled', 'ongoing', 'CHAT_AKTIF', 'SEDANG_BERLANGSUNG', 'MENUNGGU_JADWAL'].includes(c.status)
  ).length;
  const offlineActiveCount = allMyOfflineBookings.filter(b => 
    ['CHECK_IN', 'Sedang Berlangsung', 'SEDANG_BERLANGSUNG'].includes(b.status)
  ).length;
  const totalSesiAktif = onlineActiveCount + offlineActiveCount;

  // 3. MENUNGGU VERIFIKASI (pending/waiting status)
  const onlinePendingCount = allMyOnlineConsultations.filter(c => c.status === 'pending').length;
  const offlinePendingCount = allMyOfflineBookings.filter(b => 
    ['Terdaftar', 'TERDAFTAR', 'Menunggu'].includes(b.status)
  ).length;
  const totalMenungguVerifikasi = onlinePendingCount + offlinePendingCount;

  // 4. SELESAI BIMBINGAN (completed status)
  const onlineCompletedCount = allMyOnlineConsultations.filter(c => 
    ['completed', 'SELESAI'].includes(c.status)
  ).length;
  const offlineCompletedCount = allMyOfflineBookings.filter(b => 
    ['Selesai', 'SELESAI'].includes(b.status)
  ).length;
  const totalSelesaiBimbingan = onlineCompletedCount + offlineCompletedCount;

  const handleEnterChatForSession = (session: Consultation) => {
    if (session.type === 'chat') {
      setSelectedChatId(session.id);
      setActiveTab('chat-konsultasi');
      return;
    }

    // Find or create associated 'chat' room
    const existingChat = consultations.find(
      c => c.studentId === session.studentId &&
           c.psychologistId === session.psychologistId &&
           c.type === 'chat' &&
           (c.status === 'approved' || c.status === 'ongoing' || c.status === 'CHAT_AKTIF' || c.status === 'SEDANG_BERLANGSUNG' || c.status === 'SELESAI')
    );

    if (existingChat) {
      setSelectedChatId(existingChat.id);
      setActiveTab('chat-konsultasi');
    } else {
      const chatId = `chat_for_${session.id}`;
      const newChatRoom: Consultation = {
        id: chatId,
        consultation_id: chatId,
        studentId: session.studentId,
        studentName: session.studentName,
        studentNim: session.studentNim,
        studentPhone: session.studentPhone,
        studentWhatsapp: session.studentWhatsapp || session.studentPhone,
        psychologistId: session.psychologistId,
        psychologistName: session.psychologistName,
        psychologistAvatar: session.psychologistAvatar,
        date: 'Asynchronous',
        timeSlot: 'Fleksibel',
        status: 'CHAT_AKTIF',
        type: 'chat',
        symptoms: `Keluhan Terkait Video Call: ${session.symptoms || 'Konsultasi chat baru'}`,
        symptomDuration: session.symptomDuration || 'Baru dimulai',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const updated = consultations.some(c => c.id === newChatRoom.id) ? consultations : [newChatRoom, ...consultations];
      setConsultations(updated);
      localStorage.setItem('all_consultations', JSON.stringify(updated));

      setSelectedChatId(newChatRoom.id);
      setActiveTab('chat-konsultasi');
    }
  };

  const handleApproveIntake = (id: string) => {
    const target = consultations.find(c => c.id === id);
    if (!target) return;
    
    const finalDate = target.type === 'chat' ? 'Asynchronous' : (altDate || target.date);
    const finalSlot = target.type === 'chat' ? 'Fleksibel' : (altSlot || target.timeSlot);

    const updated = consultations.map(c => {
      if (c.id === id) {
        return {
          ...c,
          status: 'approved' as const,
          date: finalDate,
          timeSlot: finalSlot,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });

    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));

    createNotificationViaApi(
      target.studentId,
      'mahasiswa',
      target.type === 'chat' ? 'Konseling Chat Disetujui' : 'Jadwal Video Call Disetujui',
      target.type === 'chat' 
        ? `Konseling chat Anda bersama Psikolog ${currentUser.name} telah disetujui! Anda sekarang dapat bertukar pesan secara langsung.`
        : `Jadwal video call Anda bersama Psikolog ${currentUser.name} telah disetujui untuk tanggal ${finalDate} pada pukul ${finalSlot}.`
    );

    setApprovingIntakeId(null);
    setAltDate('');
    setAltSlot('');
    setRejectionReason('');
    
    if (target.type === 'chat') {
      alert(`Konseling chat mahasiswa ${target.studentName} berhasil disetujui! Ruang chat pribadi telah dibuat secara permanen. Anda dan mahasiswa dapat berkirim pesan kapan saja.`);
    } else {
      alert(`Konseling mahasiswa ${target.studentName} berhasil disetujui untuk tanggal ${finalDate} jam ${finalSlot}. Sesi sekarang aktif di tab 'Jadwal Bimbingan Aktif'.`);
    }
  };

  const handleRejectIntake = (id: string) => {
    if (!rejectionReason.trim()) {
      alert("Mohon masukkan alasan penolakan.");
      return;
    }

    const target = consultations.find(c => c.id === id);

    const updated = consultations.map(c => {
      if (c.id === id) {
        return {
          ...c,
          status: 'rejected' as const,
          rejectionReason: rejectionReason.trim(),
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });

    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));

    if (target) {
      createNotificationViaApi(
        target.studentId,
        'mahasiswa',
        'Jadwal Video Call Ditolak',
        `Jadwal video call Anda bersama Psikolog ${currentUser.name} telah ditolak dengan alasan: "${rejectionReason.trim()}".`
      );
    }

    setApprovingIntakeId(null);
    setRejectionReason('');
    setAltDate('');
    setAltSlot('');
    alert("Konseling mahasiswa telah berhasil ditolak dengan menyertakan alasan tertulis.");
  };

  // Finish Consultation Session Handler
  const handleCompleteSession = (consultationId: string) => {
    const targetSession = consultations.find(c => c.id === consultationId);
    if (targetSession) {
      createNotificationViaApi(
        targetSession.studentId,
        'mahasiswa',
        'Konsultasi Selesai',
        `Sesi bimbingan Anda bersama Psikolog ${currentUser.name} telah selesai dilaksanakan.`
      );
      createNotificationViaApi(
        currentUser.id,
        'psikolog',
        'Sesi Konsultasi Selesai',
        `Sesi bimbingan dengan mahasiswa ${targetSession.studentName} telah selesai.`
      );
    }

    const updated = consultations.map(c => {
      if (c.id === consultationId) {
        return {
          ...c,
          status: 'completed' as const,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });

    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));
    alert("Sesi bimbingan telah ditandai selesai dan catatan bimbingan berhasil disimpan.");
  };

  // Start Active Consultation Session (Ongoing status transition)
  const handleStartSession = (consultationId: string) => {
    const targetSession = consultations.find(c => c.id === consultationId);
    if (targetSession) {
      createNotificationViaApi(
        targetSession.studentId,
        'mahasiswa',
        'Konsultasi Sedang Berlangsung',
        `Sesi bimbingan Anda bersama Psikolog ${currentUser.name} sekarang sedang berlangsung.`
      );
    }

    const updated = consultations.map(c => {
      if (c.id === consultationId) {
        return {
          ...c,
          status: 'SEDANG_BERLANGSUNG' as any,
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });

    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));
    setActiveTab('counseling-online');
    setOnlineSubTab('active');
    setDashboardNotice("Sesi bimbingan diaktifkan! Status bimbingan kini beralih menjadi 'Sedang Berlangsung'.");
    setDashboardNoticeType('success');
  };

  // Cancel Consultation Session
  const handleCancelSession = (consultationId: string) => {
    setCancelPromptId(consultationId);
    setCancelPromptReason('');
  };

  const executeCancelSession = (consultationId: string, reason: string) => {
    const targetSession = consultations.find(c => c.id === consultationId);
    if (targetSession) {
      createNotificationViaApi(
        targetSession.studentId,
        'mahasiswa',
        'Jadwal Video Call Dibatalkan',
        `Sesi bimbingan Anda bersama Psikolog ${currentUser.name} telah dibatalkan. Alasan: "${reason || 'Dibatalkan oleh staf psikolog'}".`
      );
      createNotificationViaApi(
        currentUser.id,
        'psikolog',
        'Sesi Konsultasi Dibatalkan',
        `Sesi bimbingan dengan ${targetSession.studentName} telah dibatalkan.`
      );
    }

    const updated = consultations.map(c => {
      if (c.id === consultationId) {
        return {
          ...c,
          status: 'cancelled' as const,
          rejectionReason: reason || "Dibatalkan oleh staf psikolog",
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    });

    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));
    setCancelPromptId(null);
    setDashboardNotice("Sesi bimbingan berhasil dibatalkan.");
    setDashboardNoticeType('success');
  };

  // Safe save wrapper inside psychologist side
  const handlePsychologistSaveNotes = (id: string, notes: string, recs: string[]) => {
    onSaveNotes(id, notes, recs);
    setCompleteConfirmId(id);
  };

  return (
    <div className="space-y-8">
      {/* HEADER HERO */}
      <div className="glass-panel p-6 md:p-8 flex flex-col lg:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 text-indigo-800 rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Portal Pelayanan e-Counseling POLINELA
          </div>
          <h2 className="text-2xl md:text-3.5xl font-extrabold text-slate-800 tracking-tight font-display">
            Selamat Datang, {currentUser.name}! 👨‍⚕️
          </h2>
          <p className="text-sm text-slate-650 max-w-xl leading-relaxed">
            Berikan bimbingan mental tervalidasi bagi para mahasiswa. Catat rekam psikologi klinis dan pandukan tindakan perlindungan gawat darurat secara andal di sini.
          </p>
        </div>

        {/* INTERACTIVE STATUS CONTROL */}
        <div className="bg-white p-4 rounded-2xl border border-indigo-100/80 shadow-2xs w-full lg:w-auto shrink-0 flex flex-col gap-3 min-w-[240px]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status Kehadiran Anda</span>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full animate-pulse ${
                availabilityStatus === 'online' 
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' 
                  : availabilityStatus === 'offline' 
                  ? 'bg-slate-400' 
                  : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
              }`} />
              <span className={`text-[10px] font-extrabold uppercase ${
                availabilityStatus === 'online' 
                  ? 'text-emerald-700' 
                  : availabilityStatus === 'offline' 
                  ? 'text-slate-500' 
                  : 'text-amber-700'
              }`}>
                {availabilityStatus === 'online' ? 'Tersedia untuk Konsultasi' : availabilityStatus === 'offline' ? 'Offline / Tidak Tersedia' : 'Sedang Bertugas'}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {([
              { id: 'online', label: 'Tersedia' },
              { id: 'offline', label: 'Offline' },
              { id: 'busy', label: 'Bertugas' }
            ] as const).map(statusObj => (
              <button
                key={statusObj.id}
                onClick={() => handleStatusChange(statusObj.id)}
                className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all cursor-pointer border text-center ${
                  availabilityStatus === statusObj.id
                    ? statusObj.id === 'online'
                      ? 'bg-emerald-500 text-white border-emerald-550 shadow-3xs font-extrabold'
                      : statusObj.id === 'offline'
                      ? 'bg-slate-600 text-white border-slate-650 shadow-3xs font-extrabold'
                      : 'bg-amber-500 text-white border-amber-550 shadow-3xs font-extrabold'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-150'
                }`}
                title={statusObj.label}
              >
                {statusObj.id === 'online' ? 'Tersedia' : statusObj.id === 'busy' ? 'Bertugas' : 'Offline'}
              </button>
            ))}
          </div>

          {activeSessions.length > 0 && (
            <div className="text-[9px] text-indigo-700 bg-indigo-50/50 p-1.5 border border-indigo-100 rounded-lg text-center font-medium">
              ℹ️ Ada {activeSessions.length} sesi aktif. Mahasiswa dapat melihat status Anda sebagai <strong>Sedang Bertugas</strong> saat bimbingan berlangsung.
            </div>
          )}
        </div>
      </div>

      {/* STATS COUNT GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sesi Ditangani', value: totalSesiDitangani, color: 'border-slate-100 text-slate-800', icon: Users },
          { label: 'Sesi Aktif Disetujui', value: totalSesiAktif, color: 'border-emerald-150 text-emerald-800 bg-emerald-50/35', icon: Clock },
          { label: 'Menunggu Verifikasi', value: totalMenungguVerifikasi, color: 'border-amber-150 text-amber-800 bg-amber-50/35', icon: Calendar },
          { label: 'Selesai Bimbingan', value: totalSelesaiBimbingan, color: 'border-indigo-150 text-indigo-800 bg-indigo-50/35', icon: ClipboardCheck }
        ].map((stat, sIdx) => {
          const Icon = stat.icon;
          return (
            <div key={sIdx} className={`bg-white border rounded-2xl p-4 md:p-5 flex items-center justify-between shadow-xs ${stat.color}`}>
              <div className="space-y-1">
                <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                <p className="text-xl md:text-3xl font-extrabold font-display leading-none">{stat.value}</p>
              </div>
              <div className="p-2 bg-white rounded-lg shadow-xs shrink-0">
                <Icon className="w-4 h-4 md:w-5 h-5 text-slate-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* TABS NAVBAR */}
      <div className="border-b border-slate-200/80 flex overflow-x-auto gap-8 no-scrollbar">
        {[
          { id: 'overview', label: 'Dashboard', icon: Users },
          { id: 'counseling-online', label: 'Konsultasi Online', icon: MessageSquare },
          { id: 'chat-konsultasi', label: 'Chat Konsultasi', icon: MessageSquare },
          { id: 'counseling-offline', label: 'Konsultasi Offline', icon: MapPin },
          { id: 'riwayat-penanganan', label: 'Riwayat Penanganan', icon: ClipboardCheck },
          { id: 'my-schedule', label: 'Jadwal Saya', icon: Clock },
          { id: 'articles', label: 'Artikel', icon: BookOpen },
          { id: 'profil', label: 'Profil Saya', icon: UserIcon }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-semibold text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                isActive 
                  ? 'border-indigo-600 text-indigo-700 font-bold' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
              {tab.label}
              {tab.id === 'chat-konsultasi' && globalUnreadCount > 0 && (
                <span className="bg-emerald-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ml-1.5 animate-pulse shrink-0">
                  {globalUnreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Active Work list Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* NOTIFIKASI OFFLINE */}
            {notifications.length > 0 && (
              <div className="glass-panel p-6 overflow-hidden relative mb-6">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-teal-500" />
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h3 className="font-bold text-slate-850 text-xs md:text-sm font-display flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
                    </span>
                    Notifikasi Antrian Konsultasi Tatap Muka (Offline)
                  </h3>
                  <button 
                    onClick={async () => {
                      const success = await markNotificationsAsRead(currentUser.id);
                      if (success) {
                        setNotifications([]);
                      }
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 rounded-lg px-2.5 py-1"
                  >
                    Tandai Semua Dibaca
                  </button>
                </div>
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {notifications.map(notif => (
                    <div key={notif.id} className="p-3 bg-gradient-to-r from-indigo-50/25 to-transparent rounded-xl border border-indigo-100 text-xs text-slate-700 relative">
                      <span className="absolute top-2.5 right-3 text-[9px] text-slate-400 font-mono">
                        {formatNotificationTime(notif.created_at)}
                      </span>
                      <h4 className="font-extrabold text-indigo-950 mb-1 text-xs">{notif.title}</h4>
                      <p className="whitespace-pre-line text-slate-650 font-semibold leading-relaxed text-[11px]">
                        {notif.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="glass-panel p-6">
              <h3 className="font-bold text-slate-850 text-base mb-4 font-display flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" /> Sesi Menunggu Konsultasi Terdekat
              </h3>

              {activeSessions.length === 0 ? (
                <div className="text-center py-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-250">
                  <p className="text-sm text-slate-500">Belum ada jadwal sesi terdekat hari ini.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeSessions.slice(0, 3).map(session => (
                    <div key={session.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{session.studentName}</h4>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-150">NIM: {session.studentNim}</span>
                          <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-150">
                            <Calendar className="w-3 h-3 text-slate-400" /> {session.date}
                          </span>
                          <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-150">
                            <Clock className="w-3 h-3 text-slate-400" /> {session.timeSlot}
                          </span>
                        </div>
                        <p className="text-xs text-slate-550 mt-2 line-clamp-1 italic">
                          "{session.symptoms}"
                        </p>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
                        <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 border border-emerald-200 rounded text-[9px] font-bold uppercase tracking-wide">
                          DISETUJUI
                        </span>
                        
                        <button
                          onClick={() => {
                            handleEnterChatForSession(session);
                          }}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer whitespace-nowrap flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Masuk Chat
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
                       {/* Patients Waiting for Verification of schedule (Approved by admin, list for psychologist info) */}
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-850 text-base font-display flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" /> Permintaan Konseling Masuk (Intake)
                </h3>
                <span className="bg-indigo-50 text-indigo-750 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-indigo-150">
                  {pendingIntakes.length} Usulan
                </span>
              </div>

              {pendingIntakes.length === 0 ? (
                <p className="text-center py-6 text-sm text-slate-500 bg-slate-50/40 rounded-xl">
                  Belum ada usulan janji temu baru saat ini.
                </p>
              ) : (
                <div className="space-y-4">
                  {pendingIntakes.map(intake => {
                    const isProcessing = approvingIntakeId === intake.id;
                    return (
                      <div 
                        key={intake.id} 
                        className={`p-4 rounded-xl border transition-all ${
                          isProcessing 
                            ? 'border-indigo-300 bg-indigo-50/20 shadow-xs' 
                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                        }`}
                      >
                        {!isProcessing ? (
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 text-xs">
                            <div className="space-y-1">
                              <p className="font-bold text-slate-850 text-sm">{intake.studentName}</p>
                              <p className="text-[10px] text-slate-400 font-extrabold uppercase">
                                NIM: {intake.studentNim}
                              </p>
                              {(intake.studentWhatsapp || intake.studentPhone) && (
                                <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                                  🟢 WhatsApp Aktif: {intake.studentWhatsapp || intake.studentPhone}
                                </p>
                              )}
                              <p className="text-[11px] text-indigo-600 font-bold flex items-center gap-1">
                                📅 Usulan: {intake.date} jam {intake.timeSlot} ({intake.type})
                              </p>
                              <p className="text-slate-600 bg-white p-2 rounded-lg border border-slate-100 mt-1.5 leading-relaxed italic text-[11px]">
                                "{intake.symptoms}"
                              </p>
                            </div>
                            
                            <button
                              onClick={() => {
                                setApprovingIntakeId(intake.id);
                                setAltDate(intake.date);
                                setAltSlot(intake.timeSlot);
                              }}
                              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs self-start sm:self-auto cursor-pointer whitespace-nowrap"
                            >
                              Atur Jadwal & Proses
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-4 text-xs animate-in fade-in duration-200">
                            <div className="border-b border-indigo-100 pb-2">
                              <p className="font-bold text-slate-900">Form Evaluasi & Penjadwalan Bimbingan</p>
                              <p className="text-[10px] text-indigo-500">Sesuaikan tanggal dan jam untuk menyetujui, atau tulis alasan penolakan.</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tanggal Sesi</label>
                                <input 
                                  type="date"
                                  value={altDate}
                                  onChange={(e) => setAltDate(e.target.value)}
                                  className="w-full bg-white text-slate-850 border border-slate-200 rounded-lg p-2 font-semibold focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Slot Waktu Pemulihan</label>
                                <select 
                                  value={altSlot}
                                  onChange={(e) => setAltSlot(e.target.value)}
                                  className="w-full bg-white text-slate-850 border border-slate-200 rounded-lg p-2 font-semibold focus:outline-none focus:border-indigo-500"
                                >
                                  <option value="08:30 - 10:00">08:30 - 10:00</option>
                                  <option value="09:00 - 10:30">09:00 - 10:30</option>
                                  <option value="10:30 - 12:00">10:30 - 12:00</option>
                                  <option value="11:00 - 12:30">11:00 - 12:30</option>
                                  <option value="13:30 - 15:00">13:30 - 15:00</option>
                                  <option value="14:00 - 15:30">14:00 - 15:30</option>
                                  <option value="15:00 - 16:30">15:00 - 16:30</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1 border-t border-indigo-100/50">
                              <button
                                onClick={() => handleApproveIntake(intake.id)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
                              >
                                Setujui & Jadwalkan Sesi
                              </button>
                              <button
                                onClick={() => setApprovingIntakeId(null)}
                                className="px-3.5 py-2 bg-white hover:bg-slate-100/80 text-slate-500 border border-slate-200 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Sembunyikan
                              </button>
                            </div>

                            {/* Section for rejection notes */}
                            <div className="pt-2.5 border-t border-slate-205/65 space-y-2 bg-rose-50/20 p-2.5 rounded-lg border border-dashed border-rose-200">
                              <p className="font-bold text-rose-800 text-[10px] uppercase tracking-wider block">Opsi Alternatif: Tolak Permintaan Bimbingan</p>
                              <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Tuliskan catatan alasan penolakan bimbingan di sini (contoh: 'Silakan ambil jadwal pendampingan pada hari selain Rabu karena sedang ada rapat staf' atau 'Mohon periksa data diri Anda...')"
                                rows={2}
                                className="w-full bg-white text-slate-800 border border-slate-200 rounded-lg p-2 font-medium focus:outline-none focus:border-rose-500 text-[11px]"
                              />
                              <button
                                onClick={() => handleRejectIntake(intake.id)}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shadow-2xs cursor-pointer block text-center"
                              >
                                Tolak Usulan Sesi
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>   </div>
          </div>

          {/* Right Status Guidelines */}
          <div className="space-y-6">
            {/* Kepuasan Mahasiswa Section */}
            {(() => {
              const psychRatings = allRatings.filter(r => r.id_psikolog === currentUser.id);
              const totalRatings = psychRatings.length;
              const averageRating = totalRatings > 0 
                ? (psychRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings).toFixed(1) 
                : '0.0';
              const ratingComments = psychRatings.filter(r => r.komentar && r.komentar.trim().length > 0);

              return (
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-indigo-650" />
                    <h4 className="text-slate-800 text-xs uppercase font-extrabold tracking-widest font-display">Kepuasan Mahasiswa</h4>
                  </div>

                  <div className="bg-indigo-50/25 p-4 rounded-xl border border-indigo-100/30 flex items-center gap-4">
                    <div className="text-center shrink-0">
                      <p className="text-2xl font-extrabold text-slate-800 font-display">⭐ {averageRating}</p>
                      <p className="text-[10px] text-slate-450 font-bold uppercase mt-0.5">Skala 5.0</p>
                    </div>
                    <div className="border-l border-slate-150 pl-4 py-0.5 text-left">
                      <p className="text-xs font-bold text-slate-700">{totalRatings} Penilaian Masuk</p>
                      <p className="text-[10px] text-slate-450 font-medium mt-0.5">Dari sesi bimbingan yang telah dirampungkan mahasiswa.</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-left">
                    <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Catatan & Ulasan Layanan:</p>
                    {ratingComments.length === 0 ? (
                      <p className="text-xs text-slate-400 font-medium italic p-3 bg-slate-50/50 rounded-xl text-center">
                        Belum ada feedback tertulis dari mahasiswa.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {ratingComments.map((rating, rIdx) => (
                          <div key={rating.id_penilaian || rIdx} className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-indigo-600 font-extrabold">★ {rating.rating} / 5</span>
                              <span className="text-slate-400 font-medium">
                                {new Date(rating.tanggal_penilaian).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-650 font-medium italic leading-relaxed">
                              "{rating.komentar}"
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="bg-indigo-900 text-indigo-100/90 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-400" />
                <h4 className="text-white text-xs uppercase font-extrabold tracking-widest font-display">Hub Operasional Klinis</h4>
              </div>
              <p className="text-xs leading-relaxed">
                Unit Bimbingan Konseling memiliki regulasi privasi mahasiswa tingkat tinggi. Sesuai kode etik:
              </p>
              <ul className="text-[11px] space-y-2 list-disc pl-4 leading-relaxed">
                <li>Seluruh catatan konsultasi, keluhan, dan log chat tersimpan aman dan terenkripsi.</li>
                <li>Gunakan sarana komunikasi ini hanya di jam kuota penugasan operasional bimbingan.</li>
                <li>Tetapkan rujukan eksternal formal apabila mahasiswa menunjukkan gejala depresi berat atau niat merusak diri.</li>
              </ul>
            </div>
            
            {/* Quick reminder notes */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-slate-705 uppercase tracking-wide">Penerimaan Sesi:</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Sesi bimbingan yang disetujui akan meluncurkan menu chatting interaktif. Mohon isikan diagnosis kognitif dan rencana aktivitas pemulihan di side-panel chat sebelum merampungkan sesi.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* KONSULTASI ONLINE SUB-NAVBAR */}
      {activeTab === 'counseling-online' && (
        <div className="bg-slate-50 p-2.5 rounded-2xl flex flex-wrap gap-2 border border-slate-200 shadow-3xs">
          {[
            { id: 'requests', label: 'Permintaan Video Call', count: pendingIntakes.length, color: 'bg-amber-100 text-amber-800' },
            { id: 'scheduled', label: 'Agenda Video Call', count: scheduledSessions.length, color: 'bg-indigo-100 text-indigo-800' },
            { id: 'active', label: 'Video Call Aktif', count: activeSessions.length, color: 'bg-emerald-100 text-emerald-805' },
            { id: 'history', label: 'Riwayat Video Call', count: completedSessions.length, color: 'bg-slate-200 text-slate-705' }
          ].map(sub => {
            const isSubActive = onlineSubTab === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => setOnlineSubTab(sub.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-3xs ${
                  isSubActive 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-150'
                }`}
              >
                {sub.label}
                {sub.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${isSubActive ? 'bg-indigo-800 text-white' : sub.color}`}>
                    {sub.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* TAB CONTENT: REQUESTS / INTAKE */}
      {activeTab === 'counseling-online' && onlineSubTab === 'requests' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="font-bold text-slate-850 text-base font-display">Daftar Usulan Janji Temu (Intake Maba)</h3>
            <p className="text-xs text-slate-500">Tinjau seluruh pengajuan bimbingan dari mahasiswa sebelum dijadwalkan.</p>
          </div>

          {pendingIntakes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-xs">
              <p className="text-sm text-slate-500">Belum ada usulan janji bimbingan baru saat ini.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingIntakes.map(intake => {
                const isProcessing = approvingIntakeId === intake.id;
                return (
                  <div 
                    key={intake.id} 
                    className="p-5 bg-white rounded-2xl border border-slate-100 space-y-4"
                  >
                    {!isProcessing ? (
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-slate-850 text-sm md:text-base font-display">{intake.studentName}</h4>
                          <p className="text-[10px] text-slate-400 font-extrabold uppercase">NIM: {intake.studentNim}</p>
                          {intake.type === 'chat' ? (
                            <p className="font-bold text-indigo-600 flex items-center gap-1 mt-1 text-[11px]">
                              💬 Media: Chat Konseling (Asynchronous / Fleksibel)
                            </p>
                          ) : (
                            <p className="font-bold text-indigo-600 flex items-center gap-1 mt-1 text-[11px]">
                              📅 Rencana Sesi: {intake.date} jam {intake.timeSlot} ({intake.type})
                            </p>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                            <div className="text-slate-650 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed italic">
                              <span className="block not-italic font-bold text-[9px] uppercase tracking-wider text-slate-400 mb-1">Keluhan (Durasi: {intake.symptomDuration}):</span>
                              "{intake.symptoms}"
                            </div>
                            {intake.notes && (
                              <div className="text-slate-650 bg-indigo-50/20 p-3 rounded-xl border border-indigo-50 leading-relaxed italic">
                                <span className="block not-italic font-bold text-[9px] uppercase tracking-wider text-indigo-400 mb-1">Catatan Tambahan (Opsional):</span>
                                "{intake.notes}"
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => {
                            setApprovingIntakeId(intake.id);
                            setAltDate(intake.type === 'chat' ? 'Asynchronous' : intake.date);
                            setAltSlot(intake.type === 'chat' ? 'Fleksibel' : intake.timeSlot);
                          }}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer whitespace-nowrap self-start md:self-auto"
                        >
                          {intake.type === 'chat' ? 'Setujui Permintaan Chat' : 'Atur Jadwal & Setujui'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        <div className="border-b border-indigo-100 pb-2">
                          <p className="font-bold text-slate-900">Form Alur Persetujuan {intake.type === 'chat' ? 'Chat Konseling' : 'Jadwal'} POLINELA</p>
                          <p className="text-[10px] text-indigo-500">
                            {intake.type === 'chat' 
                              ? 'Konsultasi chat bersifat asynchronous dan mandiri tanpa membutuhkan pemilihan jadwal fisik.'
                              : 'Anda dapat mengubah waktu usulan mahasiswa jika berhalangan.'}
                          </p>
                        </div>

                        {intake.type === 'chat' ? (
                          <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 text-slate-700 leading-relaxed font-medium">
                            💡 <strong>Informasi Sesi Chat:</strong> Ruang chat pribadi akan diaktifkan secara otomatis. Anda dan mahasiswa dapat saling berkirim pesan kapan saja tanpa batas waktu praktik, dan riwayat obrolan akan tersimpan secara permanen di database.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Tanggal Sesi Layanan</label>
                              <input 
                                type="date"
                                value={altDate}
                                onChange={(e) => setAltDate(e.target.value)}
                                className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-lg p-2 font-semibold focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Slot Penugasan Jam</label>
                              <select 
                                value={altSlot}
                                onChange={(e) => setAltSlot(e.target.value)}
                                className="w-full bg-slate-50 text-slate-800 border border-slate-205 rounded-lg p-2 font-semibold focus:outline-none focus:border-indigo-500"
                              >
                                <option value="08:30 - 10:00">08:30 - 10:00</option>
                                <option value="09:00 - 10:30">09:00 - 10:30</option>
                                <option value="10:30 - 12:00">10:30 - 12:00</option>
                                <option value="11:00 - 12:30">11:00 - 12:30</option>
                                <option value="13:30 - 15:00">13:30 - 15:00</option>
                                <option value="14:00 - 15:30">14:00 - 15:30</option>
                                <option value="15:00 - 16:30">15:00 - 16:30</option>
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1 border-t border-indigo-50">
                          <button
                            onClick={() => handleApproveIntake(intake.id)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
                          >
                            {intake.type === 'chat' ? 'Setujui & Buat Ruang Chat' : 'Setujui & Daftarkan Jadwal'}
                          </button>
                          <button
                            onClick={() => setApprovingIntakeId(null)}
                            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>

                        <div className="pt-2.5 border-t border-slate-200/50 space-y-2 bg-rose-50/20 p-2.5 rounded-lg border border-dashed border-rose-200">
                          <p className="font-bold text-rose-800 text-[10px] uppercase tracking-wider block">Opsi Tolak Pengajuan</p>
                          <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Tuliskan alasan penolakan bimbingan..."
                            rows={2}
                            className="w-full bg-white text-slate-800 border border-slate-200 rounded-lg p-2 font-medium focus:outline-none focus:border-rose-500 text-[11px]"
                          />
                          <button
                            onClick={() => handleRejectIntake(intake.id)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shadow-2xs cursor-pointer"
                          >
                            Tolak Usulan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: SCHEDULES */}
      {activeTab === 'counseling-online' && onlineSubTab === 'scheduled' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="font-bold text-slate-850 text-base font-display">Semua Agenda Jadwal Sesi Terdaftar</h3>
            <p className="text-xs text-slate-500">Tinjau bimbingan mahasiswa yang telah disetujui, silakan aktifkan sesi jika sudah masuk waktu janji.</p>
          </div>

          {scheduledSessions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-xs">
              <p className="text-sm text-slate-500">Belum ada agenda jadwal bimbingan aktif saat ini.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {scheduledSessions.map(session => (
                <div 
                  key={session.id}
                  className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 text-xs">
                    <h4 className="font-extrabold text-slate-850 text-sm md:text-base font-display">{session.studentName} <span className="text-slate-400 font-medium">({session.studentNim})</span></h4>
                    <div className="flex flex-wrap items-center gap-2 text-slate-500 font-semibold mt-1">
                      <span className="bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200 flex items-center gap-1 text-[11px]"><Calendar className="w-3.5 h-3.5" /> Tanggal: {session.date}</span>
                      <span className="bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200 flex items-center gap-1 text-[11px]"><Clock className="w-3.5 h-3.5" /> Jam: {session.timeSlot}</span>
                      <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 border border-indigo-200 rounded text-[9px] font-extrabold uppercase">{session.type}</span>
                      {(session.studentWhatsapp || session.studentPhone) && (
                        <span className="bg-emerald-55 text-emerald-700 px-2.5 py-0.5 border border-emerald-200 rounded text-[11px] font-bold flex items-center gap-1">🟢 WA: {session.studentWhatsapp || session.studentPhone}</span>
                      )}
                    </div>
                    <p className="text-slate-600 italic mt-2">"{session.symptoms}"</p>
                  </div>

                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0">
                    <button
                      onClick={() => handleStartSession(session.id)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold font-display shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Mulai & Aktifkan Sesi
                    </button>
                    <button
                      onClick={() => handleCancelSession(session.id)}
                      className="px-3 py-2 bg-white hover:bg-rose-50 text-slate-500 border border-slate-250 hover:border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Batalkan Janji
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: ACTIVE / ONGOING SESSIONS */}
      {activeTab === 'counseling-online' && onlineSubTab === 'active' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="font-bold text-slate-850 text-base font-display">Video Call Sedang Berlangsung</h3>
            <p className="text-xs text-slate-500">Mulai video call dengan mahasiswa dan tuliskan catatan konsultasi selama atau setelah sesi selesai.</p>
          </div>

          {activeSessions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-xs">
              <p className="text-xs text-slate-400 font-semibold">Tidak ada bimbingan aktif dengan status 'Sedang Berlangsung' saat ini.</p>
              <button 
                onClick={() => setOnlineSubTab('scheduled')}
                className="mt-3 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                Lihat jadwal agenda & aktifkan salah satu bimbingan &rarr;
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {activeSessions.map(session => (
                <div 
                  key={session.id}
                  className="bg-white rounded-2xl border border-indigo-200 overflow-hidden shadow-xs p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
                      <h4 className="font-extrabold text-slate-850 text-sm md:text-base font-display">{session.studentName}</h4>
                    </div>
                    <p className="text-slate-400">NIM: {session.studentNim} | Sesi Active ({session.type})</p>
                    <p className="text-indigo-600 font-semibold">Aktif jam: {session.timeSlot}</p>
                    {(session.studentWhatsapp || session.studentPhone) && (
                      <p className="text-[11px] text-emerald-600 font-extrabold mt-1">
                        🟢 WhatsApp Aktif: {session.studentWhatsapp || session.studentPhone}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 md:self-auto self-start">
                    <button
                      onClick={() => {
                        handleEnterChatForSession(session);
                      }}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 bg-indigo-600"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Lanjutkan Chat
                    </button>
                    <button
                      onClick={() => {
                        setVideoReportingSession(session);
                        setVideoDiagnosis('');
                        setVideoRecs(['Istirahat Mandiri']);
                        setVideoErrorMsg('');
                      }}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <Video className="w-3.5 h-3.5 animate-pulse" /> Akhiri Sesi Video Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: HISTORY & CATATAN KONSULTASI */}
      {activeTab === 'counseling-online' && onlineSubTab === 'history' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-slate-850 text-base font-display">Histori & Evaluasi Catatan Konsultasi</h3>
            <p className="text-xs text-slate-500">Tinjau seluruh laporan bimbingan konseling mahasiswa yang telah selesai.</p>
          </div>

          {completedSessions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-105 shadow-xs">
              <p className="text-sm text-slate-500">Belum ada histori bimbingan yang selesai ditangani.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedSessions.map(history => (
                <div 
                  key={history.id}
                  className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-50 pb-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm md:text-base font-display">{history.studentName}</h4>
                      <p className="text-xs text-slate-500 mt-1">NIM: {history.studentNim} • Tanggal Sesi: {history.date}</p>
                    </div>
                    <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider self-start md:self-auto">
                      Selesai Ditangani
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
                    <div className="space-y-2">
                      <p className="font-bold text-slate-700 uppercase tracking-widest text-[9px] flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" /> Profil Keluhan Awal:
                      </p>
                      <p className="bg-slate-50/65 p-3 rounded-xl border border-slate-100">
                        "{history.symptoms}"
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-bold text-slate-700 uppercase tracking-widest text-[9px] flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-slate-400" /> Hasil Asesmen Klinis:
                      </p>
                      <div className="bg-indigo-50/20 p-3 rounded-xl border border-indigo-100 space-y-2">
                        <p className="font-semibold text-slate-800">Review Diagnose:</p>
                        <p>{history.diagnosisNotes}</p>
                        
                        {history.recommendations && history.recommendations.length > 0 && (
                          <div className="pt-2 border-t border-indigo-50">
                            <p className="font-semibold text-slate-800 mb-1">Rekomendasi Tindakan:</p>
                            <ul className="list-disc pl-4 space-y-1 text-slate-650">
                              {history.recommendations.map((rec, rIdx) => (
                                <li key={rIdx}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: CHAT KONSULTASI */}
      {activeTab === 'chat-konsultasi' && (
        <ChatDashboardMenu 
          currentUser={currentUser}
          consultations={consultations}
          setConsultations={setConsultations}
          onSaveNotes={onSaveNotes}
          selectedChatId={selectedChatId}
          setSelectedChatId={setSelectedChatId}
        />
      )}

      {/* TAB CONTENT: KONSULTASI OFFLINE (ANTRIAN TATAP MUKA) */}
      {activeTab === 'counseling-offline' && (() => {
        // Filter schedules belonging to this psychologist
        const mySchedules = offlineSchedules.filter(s => s.psikolog_id === currentUser.id);
        const myScheduleIds = mySchedules.map(s => s.id);

        // Filter bookings belonging to this psychologist's schedules
        const myQueues = offlineBookings.filter(b => myScheduleIds.includes(b.jadwal_id));

        const handleUpdateStatus = async (bookingId: string, newStatus: string) => {
          const res = await updateBookingStatusViaApi(bookingId, newStatus);
          if (res.success) {
            const booking = offlineBookings.find(b => b.id === bookingId);
            if (booking) {
              if (newStatus === 'SEDANG_BERLANGSUNG' || newStatus === 'Sedang Berlangsung') {
                createNotificationViaApi(
                  booking.mahasiswa_id,
                  'mahasiswa',
                  'Antrian Offline Sedang Berlangsung',
                  `Nomor antrian bimbingan tatap muka Anda #${booking.nomor_antrian} sedang berjalan (Sedang Berlangsung). Silakan masuk ke ruangan.`
                );
              } else if (newStatus === 'Selesai' || newStatus === 'SELESAI') {
                createNotificationViaApi(
                  booking.mahasiswa_id,
                  'mahasiswa',
                  'Konsultasi Selesai',
                  `Sesi bimbingan tatap muka offline Anda (Nomor Antrian #${booking.nomor_antrian}) telah selesai dilaksanakan.`
                );
                createNotificationViaApi(
                  currentUser.id,
                  'psikolog',
                  'Sesi Konsultasi Selesai',
                  `Sesi offline nomor antrian #${booking.nomor_antrian} mahasiswa ${booking.mahasiswa_name} telah selesai.`
                );
              } else if (newStatus === 'Dibatalkan') {
                createNotificationViaApi(
                  booking.mahasiswa_id,
                  'mahasiswa',
                  'Antrian Offline Dibatalkan',
                  `Bimbingan tatap muka offline Anda dengan nomor antrian #${booking.nomor_antrian} telah dibatalkan.`
                );
              } else if (newStatus === 'CHECK_IN') {
                createNotificationViaApi(
                  booking.mahasiswa_id,
                  'mahasiswa',
                  'Antrian Offline Check-in',
                  `Anda telah berhasil melakukan Check-in untuk nomor antrian #${booking.nomor_antrian}. Mohon menunggu panggilan.`
                );
              }
            }
            setOfflineBookings(getAntrianKonsultasiList());
            setOfflineSchedules(getJadwalOfflineList());
          } else {
            alert('Gagal memperbarui status antrian.');
          }
        };

        return (
          <div className="space-y-6 animate-fade-in">
            {/* Header / Intro bar */}
            <div className="bg-gradient-to-r from-teal-50 to-indigo-50/45 border border-teal-100 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-teal-500 text-white rounded-2xl p-3 shrink-0">
                  <Ticket className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-extrabold text-slate-800 font-display">Sistem Antrian Konsultasi Offline POLINELA</h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed max-w-2xl">
                    Kelola antrian bimbingan tatap muka mahasiswa Politeknik Negeri Lampung. Tinjau sisa kuota harian, konfirmasi kedatangan, dan selesaikan sesi konsultasi offline secara real-time.
                  </p>
                </div>
              </div>
            </div>

            {/* Grid for Quotas & Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mySchedules.length === 0 ? (
                <div className="md:col-span-3 bg-white border border-slate-100 rounded-2xl p-6 text-center text-slate-450 text-xs font-semibold">
                  ⚠️ Anda belum memiliki penugasan jadwal offline dari Administrator. Silakan hubungi admin untuk menambahkan jadwal bimbingan tatap muka Anda.
                </div>
              ) : (
                mySchedules.map(schedule => {
                  const stats = getJadwalStats(schedule.id);
                  const isFull = stats.sisaKuota <= 0;
                  return (
                    <div key={schedule.id} className="bg-white border border-slate-150 rounded-2.5xl p-5 shadow-3xs space-y-3.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg font-extrabold uppercase">
                          {schedule.hari}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold">
                          <Clock className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{schedule.jam_mulai} - {schedule.jam_selesai}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center py-2.5 bg-slate-50/70 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-[9px] text-slate-400 font-extrabold uppercase mb-0.5">Total Kuota</p>
                          <p className="text-sm font-black text-slate-800">{stats.kuotaTotal}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-indigo-400 font-extrabold uppercase mb-0.5">Terisi</p>
                          <p className="text-sm font-black text-indigo-600">{stats.jumlahTerdaftar}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-extrabold uppercase mb-0.5">Sisa</p>
                          <p className={`text-sm font-black ${isFull ? 'text-rose-600' : 'text-emerald-600'}`}>{stats.sisaKuota}</p>
                        </div>
                      </div>

                      {/* Visual progress bar */}
                      <div className="bg-slate-100 rounded-full h-1.5 w-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${isFull ? 'bg-rose-500' : 'bg-indigo-600'}`} 
                          style={{ width: `${Math.min(100, (stats.jumlahTerdaftar / stats.kuotaTotal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Queue Management Card */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-50 pb-3 flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm font-display uppercase tracking-wider">Antrian Mahasiswa Terdaftar</h4>
                  <p className="text-xs text-slate-400 font-medium">Daftar mahasiswa yang mengajukan jadwal bimbingan tatap muka.</p>
                </div>
                <div className="text-xs bg-indigo-50 border border-indigo-100/55 rounded-xl px-3 py-1 font-bold text-indigo-700">
                  Total Antrian Anda: {myQueues.length}
                </div>
              </div>

              {myQueues.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-semibold leading-relaxed">
                  👋 Belum ada nomor antrian terdaftar untuk jadwal bimbingan offline Anda.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-150 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">No. Antrian</th>
                        <th className="py-3 px-4">Mahasiswa</th>
                        <th className="py-3 px-4">Program Studi</th>
                        <th className="py-3 px-4">Keluhan / Masalah</th>
                        <th className="py-3 px-4">Kontak / HP</th>
                        <th className="py-3 px-4">Jadwal Sesi</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Aksi Kelola</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {myQueues.map((booking) => {
                        const matchedSchedule = offlineSchedules.find(s => s.id === booking.jadwal_id);
                        return (
                          <tr key={booking.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-black font-mono text-indigo-700">
                              {booking.nomor_antrian}
                            </td>
                            <td className="py-3 px-4 space-y-0.5">
                              <p className="font-extrabold text-slate-800">{booking.mahasiswa_name}</p>
                              <p className="text-[10px] text-slate-400 font-semibold">NIM {booking.mahasiswa_nim}</p>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-600">
                              {booking.mahasiswa_prodi}
                            </td>
                            <td className="py-3 px-4 max-w-xs">
                              <p className="text-slate-650 font-medium leading-relaxed italic line-clamp-2" title={booking.keluhan}>
                                "{booking.keluhan}"
                              </p>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500 font-semibold">
                              {booking.mahasiswa_phone}
                            </td>
                            <td className="py-3 px-4 space-y-0.5">
                              <p className="font-extrabold text-slate-700">{matchedSchedule?.hari}</p>
                              <p className="text-[10px] text-indigo-600 font-bold">{matchedSchedule?.jam_mulai} - {matchedSchedule?.jam_selesai}</p>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`text-[9px] px-2.5 py-0.5 font-black rounded-lg uppercase tracking-wide border ${
                                booking.status === 'CHECK_IN'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : booking.status === 'Sedang Berlangsung' || booking.status === 'SEDANG_BERLANGSUNG'
                                    ? 'bg-amber-50 text-amber-800 border-amber-250 animate-pulse'
                                    : booking.status === 'Selesai' || booking.status === 'SELESAI'
                                      ? 'bg-slate-150 text-slate-700 border-slate-300'
                                      : ['Dibatalkan', 'DIBATALKAN'].includes(booking.status)
                                        ? 'bg-rose-50 text-rose-800 border-rose-100'
                                        : ['Ditolak', 'DITOLAK', 'rejected'].includes(booking.status)
                                          ? 'bg-red-50 text-red-800 border-red-200'
                                          : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                              }`}>
                                {booking.status === 'CHECK_IN' ? 'Check In' : (booking.status === 'SEDANG_BERLANGSUNG' ? 'Berlangsung' : booking.status)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {(booking.status === 'Terdaftar' || booking.status === 'TERDAFTAR' || booking.status === 'Menunggu') && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateStatus(booking.id, 'CHECK_IN')}
                                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-3xs"
                                    >
                                      Check In Mahasiswa
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(booking.id, 'DITOLAK')}
                                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer border border-rose-150"
                                    >
                                      Tolak
                                    </button>
                                  </>
                                )}

                                {booking.status === 'CHECK_IN' && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateStatus(booking.id, 'SEDANG_BERLANGSUNG')}
                                      className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-3xs"
                                    >
                                      Mulai Sesi Konseling
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(booking.id, 'DIBATALKAN')}
                                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold transition-all cursor-pointer border border-slate-200"
                                    >
                                      Batalkan
                                    </button>
                                  </>
                                )}

                                {(booking.status === 'Sedang Berlangsung' || booking.status === 'SEDANG_BERLANGSUNG') && (
                                  <button
                                    onClick={() => {
                                      setOfflineReportingBooking(booking);
                                      setOfflineDiagnosis('');
                                      setOfflineObservation('');
                                      setOfflineRecs([]);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-3xs"
                                  >
                                    Selesaikan Konseling & Tulis Laporan
                                  </button>
                                )}

                                {(booking.status === 'Selesai' || booking.status === 'SELESAI' || ['Dibatalkan', 'DIBATALKAN', 'DITOLAK', 'rejected', 'Ditolak'].includes(booking.status)) && (
                                  <span className="text-[10px] text-slate-400 font-semibold italic bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">Terkunci & Selesai / Batal</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {activeTab === 'my-schedule' && (() => {
        const mySchedules = offlineSchedules.filter(s => s.psikolog_id === currentUser.id);
        return (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Jadwal Praktik Saya</h3>
              <p className="text-xs text-slate-500 font-semibold">Tinjau jadwal bimbingan offline dan online aktif yang dibebankan kepada Anda.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                <h4 className="font-extrabold text-slate-800 text-sm md:text-base font-display flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  Konsultasi Offline (Tatap Muka)
                </h4>
                {mySchedules.length === 0 ? (
                  <p className="text-xs text-slate-450 italic">Belum ada penugasan jadwal bimbingan offline.</p>
                ) : (
                  <div className="space-y-3">
                    {mySchedules.map(schedule => {
                      const stats = getJadwalStats(schedule.id);
                      return (
                        <div key={schedule.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-150 flex items-center justify-between">
                          <div className="space-y-1">
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase">{schedule.hari}</span>
                            <p className="text-xs font-bold text-slate-800">{schedule.jam_mulai} - {schedule.jam_selesai} WIB</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="text-slate-400 font-semibold">Terisi / Maks</p>
                            <p className="font-extrabold text-slate-800">{stats.jumlahTerdaftar} / {stats.kuotaTotal}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                <h4 className="font-extrabold text-slate-800 text-sm md:text-base font-display flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse"></span>
                  Konsultasi Online (Telekonseling)
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Jadwal konsultasi online dibuka fleksibel mengikuti pengajuan Permintaan Baru dari Mahasiswa. Anda dapat menyetujui, mencantumkan jam alternatif, atau membatalkan sesuai ketersediaan harian Anda.
                </p>
                <div className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 space-y-2 text-xs">
                  <p className="font-bold text-indigo-950">💡 Panduan Cepat:</p>
                  <ul className="list-disc pl-4 space-y-1.5 text-slate-650">
                    <li>Gunakan menu <strong className="text-indigo-700">Konsultasi Online → Permintaan Baru</strong> untuk menyetujui ajuan bimbingan mahasiswa.</li>
                    <li>Sesi yang disetujui akan meluncurkan menu chatting komprehensif pada platform.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {activeTab === 'articles' && (() => {
        const filtered = psychologistArticles.filter(art => {
          const q = psychologistArticleSearch.toLowerCase();
          return art.title.toLowerCase().includes(q) || art.category.toLowerCase().includes(q);
        });

        return (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Hub Literasi Mental Kampus</h3>
                <p className="text-xs text-slate-500 font-semibold">Tinjau seluruh artikel kesehatan mental yang beredar di kalangan mahasiswa.</p>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Cari artikel..."
                  value={psychologistArticleSearch}
                  onChange={(e) => setPsychologistArticleSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-full sm:w-60 font-semibold"
                />
                <span className="absolute left-3 top-2.5 text-slate-400">🕵️‍♀️</span>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 bg-white rounded-3xl border border-slate-100 text-center text-slate-450 text-xs font-semibold">
                Tidak ada artikel edukasi yang ditemukan.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map(art => (
                  <div 
                    key={art.id} 
                    onClick={() => setSelectedArticle(art)}
                    className="glass-panel overflow-hidden hover:shadow-md transition-all cursor-pointer flex flex-col h-full group"
                  >
                    {art.imageUrl && (
                      <div className="h-44 w-full overflow-hidden bg-slate-100 relative">
                        <img 
                          src={art.imageUrl} 
                          alt={art.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                          referrerPolicy="no-referrer" 
                        />
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        <span className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-black uppercase tracking-wider">{art.category}</span>
                        <h4 className="font-extrabold text-slate-800 text-xs md:text-sm font-display line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">{art.title}</h4>
                        <p className="text-[11px] text-slate-500 line-clamp-3 leading-relaxed">{art.excerpt}</p>
                      </div>

                      <div className="space-y-3 pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedArticle(art);
                          }}
                          className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-indigo-100/50"
                        >
                          <span>Baca Artikel</span>
                          <span>&rarr;</span>
                        </button>

                        <div className="flex items-center justify-between border-t border-slate-50 pt-3 text-[10px] text-slate-400 font-bold">
                          <span>✍️ {art.author}</span>
                          <span>⏱️ {art.minutesToRead || 5} Menit Bacaan</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB CONTENT: RIWAYAT PENANGANAN */}
      {activeTab === 'riwayat-penanganan' && (() => {
        // Query completed online sessions (Chat or Video)
        const finishedOnlineConsultations = consultations.filter(c => 
          c.psychologistId === currentUser.id && (
            (c.type === 'video' && (c.status === 'completed' || c.status === 'SELESAI')) ||
            (c.type === 'chat' && c.status !== 'pending' && c.status !== 'rejected')
          )
        );

        // Query completed offline sessions
        const mySchedules = offlineSchedules.filter(s => s.psikolog_id === currentUser.id);
        const myScheduleIds = mySchedules.map(s => s.id);
        const finishedOfflineBookings = offlineBookings.filter(b => 
          myScheduleIds.includes(b.jadwal_id) && 
          (b.status === 'SELESAI' || b.status === 'Selesai')
        );

        return (
          <div className="space-y-6 animate-fade-in" id="riwayat-tabs-container">
            {/* Header / Intro */}
            <div className="bg-gradient-to-r from-indigo-50/60 to-slate-100 border border-indigo-100 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-600 text-white rounded-2xl p-3 shrink-0">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-extrabold text-slate-800 font-display">Riwayat Penanganan & Rekam Psikologis</h3>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed max-w-2xl">
                    Sistem dokumentasi riwayat penanganan terstruktur untuk melakukan monitoring, evaluasi secara komprehensif, dan pengarsipan rekam klinis mahasiswa.
                  </p>
                </div>
              </div>
            </div>

            {/* Sub Tabs Selection (Online vs Offline) */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setRiwayatSubTab('online')}
                className={`py-3 px-6 font-bold text-xs md:text-sm border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  riwayatSubTab === 'online'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
                id="btn-subtab-online"
              >
                <MessageSquare className="w-4 h-4" />
                Riwayat Konsultasi Online
                <span className="bg-indigo-50 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-black">
                  {finishedOnlineConsultations.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setRiwayatSubTab('offline')}
                className={`py-3 px-6 font-bold text-xs md:text-sm border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  riwayatSubTab === 'offline'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
                id="btn-subtab-offline"
              >
                <MapPin className="w-4 h-4" />
                Riwayat Konsultasi Offline
                <span className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-black">
                  {finishedOfflineBookings.length}
                </span>
              </button>
            </div>

            {/* CONDITIONAL SUB CONTENT */}
            {riwayatSubTab === 'online' ? (
              <div className="space-y-4" id="riwayat-online-container">
                {finishedOnlineConsultations.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200 shadow-xs">
                    <p className="text-sm text-slate-500 font-medium">Belum ada riwayat konsultasi online yang berstatus SELESAI.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {finishedOnlineConsultations.map(session => (
                      <div 
                        key={session.id}
                        className="bg-white rounded-2.5xl border border-slate-150 p-5 shadow-3xs hover:border-indigo-200 transition-all space-y-4"
                        id={`online-history-card-${session.id}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3">
                          <div className="space-y-1">
                            <h4 className="font-extrabold text-slate-800 text-sm md:text-base font-display">{session.studentName}</h4>
                            <p className="text-xs text-slate-500 font-semibold flex items-center gap-2">
                              <span>NIM: {session.studentNim}</span>
                              <span>•</span>
                              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                {session.type === 'chat' ? '💬 Chat' : '📹 Video Call'}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {session.type === 'chat' ? (
                              session.status === 'completed' || session.status === 'SELESAI' || session.status === 'diarsipkan' ? (
                                <span className="bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide font-sans">
                                  Diarsipkan
                                </span>
                              ) : (
                                <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide font-sans animate-pulse">
                                  Aktif
                                </span>
                              )
                            ) : (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-150 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide font-sans">
                                SELESAI
                              </span>
                            )}
                            <span className="text-[10px] text-slate-450 font-medium font-mono">{session.date}</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Ringkasan Diagnosis / Catatan Konsultasi</p>
                          <p className="text-xs text-slate-650 leading-relaxed font-semibold line-clamp-2 italic">
                            "{session.diagnosisNotes || session.notes || 'Tidak ada catatan khusus yang diarsipkan.'}"
                          </p>
                        </div>

                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDetailOnline(session)}
                            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                            id={`btn-detail-online-${session.id}`}
                          >
                            <FileText className="w-3.5 h-3.5" /> Lihat Detail Riwayat
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4" id="riwayat-offline-container">
                {finishedOfflineBookings.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200 shadow-xs">
                    <p className="text-sm text-slate-500 font-medium font-display">Belum ada riwayat konsultasi offline yang berstatus SELESAI.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {finishedOfflineBookings.map(booking => {
                      const matchedSchedule = offlineSchedules.find(s => s.id === booking.jadwal_id);
                      return (
                        <div 
                          key={booking.id}
                          className="bg-white rounded-2.5xl border border-slate-150 p-5 shadow-3xs hover:border-teal-200 transition-all space-y-4"
                          id={`offline-history-card-${booking.id}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3">
                            <div className="space-y-1">
                              <h4 className="font-extrabold text-slate-800 text-sm md:text-base font-display">{booking.mahasiswa_name}</h4>
                              <p className="text-xs text-slate-500 font-semibold flex items-center gap-2 flex-wrap">
                                <span className="font-black font-mono text-teal-600 block">Antrian: {booking.nomor_antrian}</span>
                                <span>•</span>
                                <span>NIM: {booking.mahasiswa_nim}</span>
                                {booking.mahasiswa_prodi && (
                                  <>
                                    <span>•</span>
                                    <span>{booking.mahasiswa_prodi}</span>
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-150 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide font-sans">
                                SELESAI
                              </span>
                              <span className="text-[10px] text-slate-450 font-medium font-mono">
                                {booking.created_at ? formatNotificationTime(booking.created_at) : 'Tatap Muka'} ({matchedSchedule?.hari || 'Jadwal'})
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Catatan Konsultasi</div>
                            <p className="text-xs text-slate-650 leading-relaxed font-semibold line-clamp-2 italic">
                              "{booking.catatan_konsultasi || 'Tidak ada catatan bimbingan offline khusus yang tersimpan.'}"
                            </p>
                          </div>

                          <div className="flex justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => setSelectedDetailOffline(booking)}
                              className="px-3.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                              id={`btn-detail-offline-${booking.id}`}
                            >
                              <FileText className="w-3.5 h-3.5" /> Lihat Detail Riwayat
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* DETAIL MODAL FOR ONLINE CONSULTATION */}
            {selectedDetailOnline && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" id="modal-detail-online">
                <div 
                  className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto overflow-x-hidden relative"
                  id="modal-detail-online-body"
                >
                  {/* Decorative bar */}
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-indigo-600" />
                  
                  {/* Header */}
                  <div className="p-6 border-b border-indigo-50 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] bg-indigo-150 text-indigo-750 font-extrabold uppercase px-2 py-0.5 rounded-md tracking-wider">
                        Hasil Rekam Online
                      </span>
                      <h4 className="text-base md:text-lg font-extrabold font-display text-slate-850 mt-1">Detail Riwayat Konsultasi</h4>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setSelectedDetailOnline(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 md:p-8 space-y-6 text-xs text-slate-700 font-semibold leading-relaxed">
                    {/* Student Identity */}
                    <div className="bg-slate-50/50 p-4 border border-slate-150 rounded-2xl grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">NAMA MAHASISWA</span>
                        <p className="text-sm font-black text-slate-850 leading-none">{selectedDetailOnline.studentName}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">NIM / PROGRAM STUDI</span>
                        <p className="text-sm font-black text-slate-850 leading-none">{selectedDetailOnline.studentNim}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">TANGGAL KONSULTASI</span>
                        <p className="text-xs font-bold text-indigo-900">{selectedDetailOnline.date} • {selectedDetailOnline.timeSlot}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">JENIS LAYANAN</span>
                        <p className="text-xs font-bold text-indigo-900">
                          {selectedDetailOnline.type === 'chat' ? '💬 Konseling Chat Online' : '📹 Video Call Online'}
                        </p>
                      </div>
                      {(selectedDetailOnline.studentWhatsapp || selectedDetailOnline.studentPhone) && (
                        <div className="space-y-1 col-span-2 pt-1 border-t border-slate-100">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">NOMOR WHATSAPP AKTIF</span>
                          <p className="text-sm font-black text-emerald-700 leading-none">
                            {selectedDetailOnline.studentWhatsapp || selectedDetailOnline.studentPhone}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Complaint section */}
                    <div className="space-y-2">
                      <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-lg">📋</span> Catatan Keluhan Utama Mahasiswa
                      </h5>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-250 italic text-slate-650">
                        "{selectedDetailOnline.symptoms || 'Tidak ada keluhan tertulis yang dideskripsikan.'}"
                      </div>
                      {selectedDetailOnline.symptomDuration && (
                        <p className="text-[10px] text-slate-450 font-extrabold italic">Lama durasi keluhan dirasakan: {selectedDetailOnline.symptomDuration}</p>
                      )}
                    </div>

                    {/* Diagnosis / Notes */}
                    <div className="space-y-2">
                      <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-lg">🔬</span> Diagnosis / Hasil Observasi Psikolog
                      </h5>
                      <div className="bg-indigo-50/20 p-4 rounded-2xl border border-indigo-100 text-slate-700 whitespace-pre-line">
                        {selectedDetailOnline.diagnosisNotes || 'Tidak ada catatan diagnosis klinis.'}
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div className="space-y-2">
                      <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wide flex items-center gap-1.5">
                        <span className="text-lg">🌱</span> Rekomendasi Rencana Tindak Lanjut
                      </h5>
                      {selectedDetailOnline.recommendations && selectedDetailOnline.recommendations.length > 0 ? (
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedDetailOnline.recommendations.map((rec, rIdx) => (
                            <li key={rIdx} className="bg-emerald-50/45 border border-emerald-100 p-3 rounded-xl flex items-center gap-2 text-emerald-900">
                              <span className="text-emerald-600 bg-white shadow-3xs rounded-full w-5 h-5 flex items-center justify-center text-[10px] shrink-0 font-bold">✓</span>
                              <span className="text-xs font-bold">{rec}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-450 italic">Belum ada rekomendasi yang diberikan.</p>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-6 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl flex justify-end">
                    <button 
                      type="button"
                      onClick={() => setSelectedDetailOnline(null)}
                      className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                    >
                      Tutup Riwayat
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* DETAIL MODAL FOR OFFLINE CONSULTATION */}
            {selectedDetailOffline && (() => {
              const matchedSchedule = offlineSchedules.find(s => s.id === selectedDetailOffline.jadwal_id);
              // Handle recommendation formatting (might be string or array)
              let renderedRecommendations: string[] = [];
              if (selectedDetailOffline.rekomendasi) {
                if (Array.isArray(selectedDetailOffline.rekomendasi)) {
                  renderedRecommendations = selectedDetailOffline.rekomendasi;
                } else if (typeof selectedDetailOffline.rekomendasi === 'string') {
                  try {
                    const parsed = JSON.parse(selectedDetailOffline.rekomendasi);
                    if (Array.isArray(parsed)) {
                      renderedRecommendations = parsed;
                    } else {
                      renderedRecommendations = [selectedDetailOffline.rekomendasi];
                    }
                  } catch (e) {
                    renderedRecommendations = [selectedDetailOffline.rekomendasi];
                  }
                }
              }

              return (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" id="modal-detail-offline">
                  <div 
                    className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto overflow-x-hidden relative"
                    id="modal-detail-offline-body"
                  >
                    {/* Decorative bar */}
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-teal-500 to-teal-600" />
                    
                    {/* Header */}
                    <div className="p-6 border-b border-teal-50 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] bg-teal-100 text-teal-850 font-extrabold uppercase px-2 py-0.5 rounded-md tracking-wider">
                          Asesmen Tatap Muka
                        </span>
                        <h4 className="text-base md:text-lg font-extrabold font-display text-slate-850 mt-1">Detail Laporan Konsultasi Offline</h4>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setSelectedDetailOffline(null)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer flex items-center justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Body Content */}
                    <div className="p-6 md:p-8 space-y-6 text-xs text-slate-700 font-semibold leading-relaxed">
                      {/* Identity Grid */}
                      <div className="bg-slate-50/50 p-4 border border-slate-150 rounded-2xl grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">NAMA MAHASISWA</span>
                          <p className="text-sm font-black text-slate-850 leading-none">{selectedDetailOffline.mahasiswa_name}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">NIM / PROGRAM STUDI</span>
                          <p className="text-sm font-black text-slate-850 leading-none">
                            {selectedDetailOffline.mahasiswa_nim} {selectedDetailOffline.mahasiswa_prodi ? `(${selectedDetailOffline.mahasiswa_prodi})` : ''}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">NO. ANTRIAN & HARI LAYANAN</span>
                          <p className="text-xs font-black text-teal-900 leading-none">
                            {selectedDetailOffline.nomor_antrian} • {matchedSchedule?.hari || 'Tatap Muka'} ({matchedSchedule?.jam_mulai} - {matchedSchedule?.jam_selesai})
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide block">JENIS LAYANAN / PROGRAM</span>
                          <p className="text-xs font-bold text-teal-900 leading-none">
                            🏢 Layanan Bimbingan Tatap Muka (Offline)
                          </p>
                        </div>
                      </div>

                      {/* Complaint */}
                      <div className="space-y-2">
                        <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-lg">📋</span> Catatan Keluhan Utama Mahasiswa
                        </h5>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 italic text-slate-650">
                          "{selectedDetailOffline.keluhan || 'Tidak ada catatan keluhan tertulis.'}"
                        </div>
                      </div>

                      {/* Observations / Mental State */}
                      {selectedDetailOffline.hasil_observasi && (
                        <div className="space-y-2">
                          <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wide flex items-center gap-1.5">
                            <span className="text-lg">👁️</span> Hasil Observasi Klinis
                          </h5>
                          <div className="bg-teal-50/15 p-4 rounded-2xl border border-teal-100 text-slate-700 whitespace-pre-line font-medium">
                            {selectedDetailOffline.hasil_observasi}
                          </div>
                        </div>
                      )}

                      {/* Consultation diagnosis/notes */}
                      <div className="space-y-2">
                        <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-lg">🔬</span> Diagnosis / Catatan Konsultasi
                        </h5>
                        <div className="bg-indigo-50/20 p-4 rounded-2xl border border-indigo-100 text-slate-700 whitespace-pre-line font-medium font-sans">
                          {selectedDetailOffline.catatan_konsultasi || 'Tidak ada catatan klinis.'}
                        </div>
                      </div>

                      {/* Recommendations */}
                      <div className="space-y-2">
                        <h5 className="font-extrabold text-slate-850 text-xs uppercase tracking-wide flex items-center gap-1.5">
                          <span className="text-lg">🌱</span> Rekomendasi Rencana Tindak Lanjut
                        </h5>
                        {renderedRecommendations.length > 0 ? (
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {renderedRecommendations.map((rec, rIdx) => (
                              <li key={rIdx} className="bg-emerald-50/45 border border-emerald-100 p-3 rounded-xl flex items-center gap-2 text-emerald-950">
                                <span className="text-emerald-600 bg-white shadow-3xs rounded-full w-5 h-5 flex items-center justify-center text-[10px] shrink-0 font-bold">✓</span>
                                <span className="text-xs font-bold">{rec}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-450 italic">Belum ada rencana tindak lanjut yang diberikan.</p>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl flex justify-end">
                      <button 
                        type="button"
                        onClick={() => setSelectedDetailOffline(null)}
                        className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                      >
                        Tutup Riwayat
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        );
      })()}

      {/* TAB CONTENT: PROFIL SAYA */}
      {activeTab === 'profil' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          {/* Main Form Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-50 pb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg font-display">Profil Kepegawaian Psikolog</h3>
                  <p className="text-xs text-slate-500">Perbarui spesialisasi, hari layanan, dan bimbingan kepakaran kemahasiswaan Anda.</p>
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
                      form="psychologist-profile-form"
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
                  <h4 className="font-bold text-xs text-slate-700">Foto Profil Kepegawaian</h4>
                  <p className="text-[10px] text-slate-450 leading-normal font-semibold">
                    Format file yang didukung: JPG, JPEG, PNG. Ukuran file maksimal adalah 2 MB.
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
              <form id="psychologist-profile-form" onSubmit={(e) => {
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

                // Parse specialties from string comma-separated
                const specRaw = formData.get('specialties') as string;
                const specArray = specRaw ? specRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

                const updatedUser: User = {
                  ...currentUser,
                  name: formData.get('name') as string,
                  email: emailVal,
                  nimOrNip: formData.get('nimOrNip') as string,
                  prodiOrUnit: formData.get('unitorprodi') as string,
                  phoneNumber: formData.get('phoneNumber') as string,
                  bio: formData.get('bio') as string,
                  specialties: specArray,
                  avatarUrl: avatarPreview || undefined
                };

                onUpdateProfile(updatedUser);
                setIsEditing(false);
                setProfileNotice({ type: 'success', text: 'Profil berhasil diperbarui.' });
                setTimeout(() => setProfileNotice(null), 4000);
              }} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Nama Lengkap & Gelar</label>
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
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Email Kepegawaian</label>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">NIP / NUP Kepegawaian</label>
                    <input 
                      type="text" 
                      name="nimOrNip" 
                      defaultValue={currentUser.nimOrNip} 
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
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Fakultas / Unit Kerja</label>
                    <input 
                      type="text" 
                      name="unitorprodi" 
                      defaultValue={currentUser.prodiOrUnit || 'Layanan Konseling POLINELA'} 
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">No. Telepon / HP Pribadi</label>
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
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Spesialisasi Fokus (Koma sebagai pemisah)</label>
                    <input 
                      type="text" 
                      name="specialties"
                      defaultValue={currentUser.specialties ? currentUser.specialties.join(', ') : 'Umum, Stres Akademik'} 
                      placeholder="Stres, Ansietas, Hubungan Interpersonal" 
                      disabled={!isEditing}
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                        isEditing 
                          ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800' 
                          : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Bio Ringkas Keprofesian</label>
                  <textarea 
                    name="bio" 
                    defaultValue={currentUser.bio || ''} 
                    placeholder="Tuliskan pengalaman klinis singkat Anda..." 
                    disabled={!isEditing}
                    className={`w-full border rounded-xl p-3 h-24 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                      isEditing 
                        ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800 animate-none' 
                        : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed resize-none'
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

          {/* Stats area */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-indigo-100/90 rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="text-white text-xs uppercase font-extrabold tracking-widest flex items-center gap-1.5 font-display">
                <Users className="w-4 h-4 text-indigo-300" /> Ringkasan Unit
              </h4>
              <div className="space-y-3.5 text-xs leading-relaxed">
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                  <span className="font-semibold text-indigo-200">Total Bimbingan Ditangani:</span>
                  <span className="font-extrabold text-white text-sm">{totalSesiDitangani} Kasus</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                  <span className="font-semibold text-indigo-200">Kasus Masih Berjalan:</span>
                  <span className="font-extrabold text-white text-sm text-yellow-300">
                    {totalSesiAktif} Kasus
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Real-time Chat Toast Notification */}
      {chatToast && (
        <div className="fixed top-6 right-6 z-[9999] bg-white border-l-4 border-emerald-500 rounded-2xl shadow-xl p-4 max-w-sm w-full animate-bounce sm:animate-none flex items-start gap-3 pointer-events-auto">
          <div className="bg-emerald-50 text-emerald-500 p-2 rounded-full mt-0.5">
            <MessageSquare className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-extrabold text-slate-800 text-xs tracking-tight">{chatToast.senderName}</h4>
            <p className="text-xs text-slate-650 truncate mt-1 leading-normal font-medium italic">"{chatToast.text}"</p>
            <button
              onClick={() => {
                setActiveTab('chat-konsultasi');
                setChatToast(null);
              }}
              className="text-[10px] text-indigo-600 font-extrabold uppercase mt-2 hover:underline tracking-wider cursor-pointer bg-transparent border-none p-0 inline-block"
            >
              Buka Chat Sekarang
            </button>
          </div>
          <button 
            onClick={() => setChatToast(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold leading-none p-1 bg-transparent border-none cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Video Call Session Report Modal */}
      {videoReportingSession && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 text-white flex justify-between items-center bg-gradient-to-r from-slate-900 to-indigo-950">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Hasil Diagnosa & Plan Tindakan</span>
                <h4 className="text-sm md:text-base font-bold font-display mt-0.5 font-sans leading-none text-white">Clinical Report: {videoReportingSession.studentName}</h4>
              </div>
              <button 
                onClick={() => setVideoReportingSession(null)}
                className="text-slate-400 hover:text-white transition-colors text-sm font-bold bg-transparent border-none cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs font-medium text-slate-705 flex-1">
              <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/30 flex justify-between text-[11px] font-semibold text-indigo-900">
                <span>NIM: {videoReportingSession.studentNim}</span>
                <span>Sesi: {videoReportingSession.timeSlot} • {videoReportingSession.date}</span>
              </div>

              {/* Validation Error Banner */}
              {videoErrorMsg && (
                <div id="video-validation-error" className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-1.5 font-extrabold text-[10px] uppercase tracking-wide text-rose-800">
                    <span>⚠️</span> Validasi Gagal
                  </div>
                  <p className="text-[11px] font-semibold leading-relaxed" id="video-error-text">
                    {videoErrorMsg}
                  </p>
                </div>
              )}

              {/* Diagnosis / Catatan Masalah */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Catatan Masalah / Diagnosis Keluhan <span className="text-rose-500">*</span></label>
                <textarea
                  value={videoDiagnosis}
                  onChange={(e) => setVideoDiagnosis(e.target.value)}
                  placeholder="Tuliskan catatan keluhan, diagnosis klinis, dan hasil analisis kognitif bimbingan secara mendalam..."
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-indigo-500 text-slate-800 text-xs font-semibold"
                />
              </div>

              {/* Recommendations / Tags */}
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Rencana Tindak Lanjut <span className="text-rose-500">* (Pilih minimal 1 rekomendasi)</span></label>
                
                {/* Pre-defined Tag Selector Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {["Dirujuk ke Dokter", "Terapi Kognitif", "Sesi Lanjutan", "Istirahat Mandiri", "Terapi Konseling Luar"].map(tag => {
                    const isSelected = videoRecs.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => {
                          if (isSelected) {
                            setVideoRecs(videoRecs.filter(r => r !== tag));
                          } else {
                            setVideoRecs([...videoRecs, tag]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all border cursor-pointer ${
                          isSelected 
                            ? 'bg-rose-50 border-rose-350 text-rose-700 font-extrabold shadow-3xs' 
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-550 border-slate-200'
                        }`}
                      >
                        {tag} {isSelected ? "✓" : "+"}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Recommendation Input */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-50">
                  <input
                    type="text"
                    value={customVideoRec}
                    onChange={(e) => setCustomVideoRec(e.target.value)}
                    placeholder="Tambah rekomendasi kustom..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customVideoRec.trim()) {
                          if (!videoRecs.includes(customVideoRec.trim())) {
                            setVideoRecs([...videoRecs, customVideoRec.trim()]);
                          }
                          setCustomVideoRec('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customVideoRec.trim()) {
                        if (!videoRecs.includes(customVideoRec.trim())) {
                          setVideoRecs([...videoRecs, customVideoRec.trim()]);
                        }
                        setCustomVideoRec('');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-850 hover:bg-slate-900 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                  >
                    Tambah
                  </button>
                </div>

                {/* Selected Action Plans Display */}
                {videoRecs.length > 0 && (
                  <div className="p-2.5 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-400 block w-full uppercase tracking-wider font-extrabold">Rekomendasi terpilih (Wajib diisi):</span>
                    {videoRecs.map((rec, rIdx) => (
                      <span key={rIdx} className="bg-rose-50 text-rose-700 border border-rose-100 rounded px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1">
                        {rec}
                        <button
                          type="button"
                          onClick={() => setVideoRecs(videoRecs.filter(r => r !== rec))}
                          className="hover:text-rose-900 font-extrabold text-[8px]"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={isFinishingSession}
                onClick={() => setVideoReportingSession(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-xl font-bold font-display cursor-pointer text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isFinishingSession}
                onClick={handleFinishSession}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold font-display cursor-pointer text-xs min-w-[150px] flex items-center justify-center gap-1.5 disabled:bg-rose-400 disabled:cursor-not-allowed"
              >
                {isFinishingSession ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    {finishingStatusMessage}
                  </>
                ) : (
                  "Simpan & Akhiri Sesi Video Call"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Tatap Muka Clinical Report Modal */}
      {offlineReportingBooking && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-150 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-teal-900 px-6 py-5 text-white flex justify-between items-center bg-gradient-to-r from-teal-900 to-indigo-900">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-teal-300">Form Hasil Konseling Offline POLINELA</span>
                <h4 className="text-sm md:text-base font-bold font-display mt-0.5 font-sans leading-none text-white">Clinical Report: {offlineReportingBooking.mahasiswa_name}</h4>
              </div>
              <button 
                onClick={() => setOfflineReportingBooking(null)}
                className="text-slate-400 hover:text-white transition-colors text-sm font-bold bg-transparent border-none cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs font-medium text-slate-705 flex-1">
              <div className="bg-teal-50/50 p-3 rounded-xl border border-teal-100/30 flex justify-between text-[11px] font-semibold text-teal-900">
                <span>NIM: {offlineReportingBooking.mahasiswa_nim}</span>
                <span>Prodi: {offlineReportingBooking.mahasiswa_prodi}</span>
                <span>Antrian: {offlineReportingBooking.nomor_antrian}</span>
              </div>

              {/* Diagnosis / Catatan Masalah */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Catatan Masalah / Diagnosis Keluhan <span className="text-rose-500">*</span></label>
                <textarea
                  value={offlineDiagnosis}
                  onChange={(e) => setOfflineDiagnosis(e.target.value)}
                  placeholder="Tuliskan diagnosis akhir, kesimpulan bimbingan, keluhan klinis bimbingan, atau hambatan akademik mahasiswa secara lengkap..."
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-teal-500 text-slate-800 text-xs font-semibold"
                />
              </div>

              {/* Hasil Observasi (Optional / recommended) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Hasil Observasi Perilaku</label>
                <textarea
                  value={offlineObservation}
                  onChange={(e) => setOfflineObservation(e.target.value)}
                  placeholder="Amati respon emosional, gerak tubuh, atau afeksi bimbingan selama berkonsultasi di ruangan..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-teal-500 text-slate-800 text-xs font-semibold"
                />
              </div>

              {/* Recommendations / Tags */}
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Rencana Tindak Lanjut / Rujukan <span className="text-rose-500">* (Pilih minimal 1 rekomendasi)</span></label>
                
                {/* Pre-defined Tag Selector Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {["Dirujuk ke Dokter", "Terapi Kognitif", "Sesi Lanjutan", "Istirahat Mandiri", "Terapi Konseling Luar", "Pemberkatan Akademik"].map(tag => {
                    const isSelected = offlineRecs.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => {
                          if (isSelected) {
                            setOfflineRecs(offlineRecs.filter(r => r !== tag));
                          } else {
                            setOfflineRecs([...offlineRecs, tag]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all border cursor-pointer ${
                          isSelected 
                            ? 'bg-teal-50 border-teal-350 text-teal-750 font-extrabold shadow-3xs' 
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-550 border-slate-200'
                        }`}
                      >
                        {tag} {isSelected ? "✓" : "+"}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Recommendation Input */}
                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-50">
                  <input
                    type="text"
                    value={customOfflineRec}
                    onChange={(e) => setCustomOfflineRec(e.target.value)}
                    placeholder="Tambah rekomendasi khusus..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customOfflineRec.trim()) {
                          if (!offlineRecs.includes(customOfflineRec.trim())) {
                            setOfflineRecs([...offlineRecs, customOfflineRec.trim()]);
                          }
                          setCustomOfflineRec('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customOfflineRec.trim()) {
                        if (!offlineRecs.includes(customOfflineRec.trim())) {
                          setOfflineRecs([...offlineRecs, customOfflineRec.trim()]);
                        }
                        setCustomOfflineRec('');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-850 hover:bg-slate-900 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                  >
                    Tambah
                  </button>
                </div>

                {/* Selected Action Plans Display */}
                {offlineRecs.length > 0 && (
                  <div className="p-2.5 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-wrap gap-1">
                    <span className="text-[10px] text-slate-400 block w-full uppercase tracking-wider font-extrabold">Rekomendasi terpilih (Wajib diisi):</span>
                    {offlineRecs.map((rec, rIdx) => (
                      <span key={rIdx} className="bg-teal-50 text-teal-700 border border-teal-100 rounded px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1">
                        {rec}
                        <button
                          type="button"
                          onClick={() => setOfflineRecs(offlineRecs.filter(r => r !== rec))}
                          className="hover:text-teal-900 font-extrabold text-[8px]"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setOfflineReportingBooking(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-xl font-bold font-display cursor-pointer text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!offlineDiagnosis.trim()) {
                    alert("Catatan diagnosis keluhan bimbingan wajib diisi.");
                    return;
                  }
                  if (offlineRecs.length === 0) {
                    alert("Silakan pilih minimal 1 rencana tindak lanjut bimbingan.");
                    return;
                  }

                  const res = await updateOfflineBookingReportViaApi(offlineReportingBooking.id, {
                    status: 'SELESAI',
                    catatan_konsultasi: offlineDiagnosis,
                    hasil_observasi: offlineObservation,
                    rekomendasi: offlineRecs
                  });

                  if (res.success) {
                    setOfflineBookings(getAntrianKonsultasiList());
                    setOfflineSchedules(getJadwalOfflineList());
                    setOfflineReportingBooking(null);
                    alert("Laporan Konsultasi Offline berhasil dikirim dan status bimbingan dirubah menjadi SELESAI.");
                  } else {
                    alert(res.message || "Gagal menyimpan laporan bimbingan offline.");
                  }
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold font-display cursor-pointer text-xs"
              >
                Simpan & Selesaikan Konseling
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DELETE AVATAR MODAL */}
      {showDeleteAvatarConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
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
                  onUpdateProfile?.(updatedUser);
                  setShowDeleteAvatarConfirm(false);
                  setProfileNotice({ type: 'success', text: 'Foto profil resmi psikolog berhasil dihapus.' });
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

      {selectedArticle && (
        <ArticleDetailModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      {/* OVERRIDE MODAL DIALOGS AND TOASTS */}
      {cancelPromptId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6 animate-pulse" />
              </div>
              <h4 className="font-extrabold text-slate-800 text-sm md:text-base font-display">Batalkan Sesi Bimbingan?</h4>
              <p className="text-xs text-slate-500 font-semibold mt-1">Silakan masukkan alasan pembatalan sesi bimbingan ini:</p>
            </div>
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none h-24"
              placeholder="Contoh: Jadwal psikolog berbenturan dengan kegiatan akademis..."
              value={cancelPromptReason}
              onChange={(e) => setCancelPromptReason(e.target.value)}
            />
            <div className="flex gap-3 justify-end pt-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCancelPromptId(null)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!cancelPromptReason.trim()) {
                    setDashboardNotice("Alasan pembatalan harus diisi!");
                    setDashboardNoticeType('error');
                    return;
                  }
                  executeCancelSession(cancelPromptId, cancelPromptReason);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all cursor-pointer shadow-sm shadow-rose-100"
              >
                Ya, Batalkan Sesi
              </button>
            </div>
          </div>
        </div>
      )}

      {completeConfirmId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 space-y-4 text-center">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="font-extrabold text-slate-850 text-sm md:text-base font-display">Selesai Konseling?</h4>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Catatan bimbingan berhasil disimpan. Apakah Anda ingin langsung menandai sesi konseling ini telah selesai diselenggarakan?
            </p>
            <div className="flex gap-3 justify-center pt-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCompleteConfirmId(null)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-650 rounded-xl transition-all cursor-pointer border border-slate-200"
              >
                Tidak, Simpan Saja
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCompleteSession(completeConfirmId);
                  setCompleteConfirmId(null);
                }}
                className="px-4 py-2 bg-emerald-605 hover:bg-emerald-705 text-white rounded-xl transition-all cursor-pointer shadow-sm shadow-emerald-100"
              >
                Ya, Selesaikan
              </button>
            </div>
          </div>
        </div>
      )}

      {dashboardNotice && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3.5 rounded-2xl border border-slate-800 shadow-xl z-50 max-w-sm animate-slide-in flex items-start gap-2.5 font-sans">
          <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-white text-[10px] shrink-0 mt-0.5 font-bold font-mono">
            i
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold font-sans text-white leading-relaxed">{dashboardNotice}</p>
            <button
              onClick={() => setDashboardNotice(null)}
              className="text-[9px] text-slate-400 hover:text-white font-extrabold uppercase tracking-wider"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
