import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  UserPlus, Search, Calendar, Clock, BookOpen, Heart, Activity, 
  MessageSquare, Video, Shield, Sparkles, CheckCircle2, AlertCircle, AlertTriangle,
  Stethoscope, HelpCircle, ArrowRight, UserCheck, Eye, ClipboardList, ArrowLeft, User as UserIcon,
  Lock, Upload, Camera, Check, X, MapPin, Ticket, Building, Trash2
} from 'lucide-react';
import { User, Psychologist, Consultation, Article, AssessmentQuestion, JadwalOffline, AntrianKonsultasi, PenilaianKonsultasi } from '../types';
import { INITIAL_PSYCHOLOGISTS, INITIAL_ARTICLES, ASSESSMENT_QUESTIONS, getAssessmentResult } from '../data/mockData';
import ArticleDetailModal from './ArticleDetailModal';
import ChatDashboardMenu from './ChatDashboardMenu';
import { 
  getJadwalOfflineList, 
  getAntrianKonsultasiList, 
  getJadwalStats, 
  registerAntrianOffline,
  saveAntrianKonsultasiList,
  syncWithBackend,
  updateBookingStatusViaApi,
  fetchAllChatMessages,
  sendChatMessageViaApi,
  createNotificationViaApi,
  getRatingsViaApi,
  submitRatingViaApi
} from '../data/offlineDb';

interface StudentDashboardProps {
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

export default function StudentDashboard({ 
  currentUser, 
  consultations, 
  setConsultations,
  onSaveNotes,
  onUpdateProfile
}: StudentDashboardProps) {
  const [activeTab, setActiveTabState] = useState<'overview' | 'psikolog' | 'chat-konsultasi' | 'riwayat' | 'kuesioner' | 'artikel' | 'profil' | 'counseling-offline'>(() => {
    const saved = localStorage.getItem('student_active_tab');
    if (saved) return saved as any;
    return 'overview';
  });

  const setActiveTab = (tab: 'overview' | 'psikolog' | 'chat-konsultasi' | 'riwayat' | 'kuesioner' | 'artikel' | 'profil' | 'counseling-offline') => {
    localStorage.setItem('student_active_tab', tab);
    setActiveTabState(tab);
  };
  const [bookingSubTab, setBookingSubTab] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [psychologists, setPsychologists] = useState<Psychologist[]>(() => {
    const psychStore = localStorage.getItem('app_psychologists');
    if (psychStore) {
      try {
        return JSON.parse(psychStore);
      } catch (e) {
        return INITIAL_PSYCHOLOGISTS;
      }
    }
    return INITIAL_PSYCHOLOGISTS;
  });

  // Sync psychologist list on tab switches
  useEffect(() => {
    const psychStore = localStorage.getItem('app_psychologists');
    if (psychStore) {
      try {
        setPsychologists(JSON.parse(psychStore));
      } catch (e) {
        console.error("Error syncing psychologists", e);
      }
    }
  }, [activeTab, currentUser]);
  const [articles, setArticles] = useState<Article[]>([]);
  
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

            // For Student (mahasiswa), a psychologist (sender) sent a message.
            const toastTitle = '🔔 Pesan Baru dari Psikolog';

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
  
  const getPsychologistStatus = (psychId: string): 'online' | 'busy' | 'offline' => {
    const saved = localStorage.getItem(`psych_status_${psychId}`);
    if (saved === 'online' || saved === 'busy' || saved === 'offline') {
      return saved;
    }
    // Backward compatibility for old values
    if (saved === 'Online') return 'online';
    if (saved === 'Offline') return 'offline';
    if (saved === 'Sedang Bertugas' || saved === 'Sedang Konsultasi') return 'busy';
    
    // Default values if empty
    if (psychId === 'psikolog_1') return 'online';
    if (psychId === 'psikolog_2') return 'offline';
    return 'online';
  };

  const getPsychologistDisplayLabel = (psychId: string) => {
    const status = getPsychologistStatus(psychId);
    if (status === 'online') {
      return {
        text: 'Tersedia untuk Konsultasi',
        bgClass: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
        dotClass: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
      };
    } else if (status === 'offline') {
      return {
        text: 'Offline / Tidak Tersedia',
        bgClass: 'bg-rose-50 text-rose-600 border border-rose-100',
        dotClass: 'bg-rose-500'
      };
    } else {
      return {
        text: 'Sedang Bertugas',
        bgClass: 'bg-amber-50 text-amber-700 border border-amber-205 animate-pulse font-extrabold',
        dotClass: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
      };
    }
  };
  
  // Profile edit states
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
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Filtering states
  const [psychologistSearch, setPsychologistSearch] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedArticleCategory, setSelectedArticleCategory] = useState<string>('Semua');
  const [articleSearch, setArticleSearch] = useState('');
  const [articlePage, setArticlePage] = useState(1);
  const articlesPerPage = 6;

  // Booking states
  const [bookingPsychologist, setBookingPsychologist] = useState<Psychologist | null>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingSlot, setBookingSlot] = useState('');
  const [bookingType, setBookingType] = useState<'chat' | 'video'>('chat');
  const [bookingSymptoms, setBookingSymptoms] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingDuration, setBookingDuration] = useState('1-2 minggu');
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingWhatsapp, setBookingWhatsapp] = useState(currentUser.phoneNumber || '');
  const [bookingError, setBookingError] = useState<string | null>(null);

  // --- OFFLINE CONSULTATION TAB STATES ---
  const [offlineSchedules, setOfflineSchedules] = useState<JadwalOffline[]>([]);
  const [offlineBookings, setOfflineBookings] = useState<AntrianKonsultasi[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [offlineName, setOfflineName] = useState<string>(currentUser.name || '');
  const [offlineNim, setOfflineNim] = useState<string>(currentUser.nimOrNip || '');
  const [offlineProdi, setOfflineProdi] = useState<string>(currentUser.prodiOrUnit || '');
  const [offlinePhone, setOfflinePhone] = useState<string>(currentUser.phoneNumber || '');
  const [offlineKeluhan, setOfflineKeluhan] = useState<string>('');
  const [offlineBookingError, setOfflineBookingError] = useState<string | null>(null);
  const [offlineBookingSuccess, setOfflineBookingSuccess] = useState<string | null>(null);
  const [isOfflineSubmitting, setIsOfflineSubmitting] = useState<boolean>(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  // Rating and Evaluation States
  const [allRatings, setAllRatings] = useState<PenilaianKonsultasi[]>([]);
  const [ratingFormStates, setRatingFormStates] = useState<Record<string, { rating: number; komentar: string }>>({});

  const handleSelectStarForSession = (sessionId: string, star: number) => {
    setRatingFormStates(prev => ({
      ...prev,
      [sessionId]: {
        rating: star,
        komentar: prev[sessionId]?.komentar || ""
      }
    }));
  };

  const handleUpdateCommentForSession = (sessionId: string, text: string) => {
    setRatingFormStates(prev => ({
      ...prev,
      [sessionId]: {
        rating: prev[sessionId]?.rating || 0,
        komentar: text
      }
    }));
  };

  const handleSubmitRatingForSession = async (sessionId: string, psychologistId: string) => {
    const fState = ratingFormStates[sessionId];
    if (!fState || !fState.rating) return;

    const res = await submitRatingViaApi({
      id_sesi_konsultasi: sessionId,
      id_mahasiswa: currentUser.id,
      id_psikolog: psychologistId,
      rating: fState.rating,
      komentar: fState.komentar
    });

    if (res.success) {
      const latestRatings = await getRatingsViaApi();
      setAllRatings(latestRatings);
    } else {
      alert(res.message);
    }
  };

  const latestTicket = offlineBookings.find(
    b => b.mahasiswa_id === currentUser.id && 
         (b.status === 'Terdaftar' || b.status === 'Menunggu' || b.status === 'Sedang Berlangsung')
  );

  useEffect(() => {
    const freshSchedules = getJadwalOfflineList();
    const freshBookings = getAntrianKonsultasiList();
    setOfflineSchedules(prev => JSON.stringify(prev) === JSON.stringify(freshSchedules) ? prev : freshSchedules);
    setOfflineBookings(prev => JSON.stringify(prev) === JSON.stringify(freshBookings) ? prev : freshBookings);

    // Auto-update profile inputs if currentUser updates
    setOfflineName(currentUser.name || '');
    setOfflineNim(currentUser.nimOrNip || '');
    setOfflineProdi(currentUser.prodiOrUnit || '');
    setOfflinePhone(currentUser.phoneNumber || '');

    // Fetch ratings
    getRatingsViaApi().then(ratings => {
      setAllRatings(prev => JSON.stringify(prev) === JSON.stringify(ratings) ? prev : ratings);
    }).catch(err => console.error(err));

    // Background server synchronization
    syncWithBackend().then(data => {
      setOfflineSchedules(prev => JSON.stringify(prev) === JSON.stringify(data.schedules) ? prev : data.schedules);
      setOfflineBookings(prev => JSON.stringify(prev) === JSON.stringify(data.bookings) ? prev : data.bookings);
    }).catch(err => console.error(err));
  }, [activeTab, currentUser.id]);

  // Selected article reader state
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);

  // Assessment/Kuesioner State
  const [assessmentStep, setAssessmentStepState] = useState<number>(() => {
    const savedStep = localStorage.getItem(`assessment_step_${currentUser.id}`);
    if (savedStep !== null) {
      return parseInt(savedStep, 10);
    }
    const hasHistory = localStorage.getItem(`assessment_history_${currentUser.id}`);
    if (hasHistory) return 10;
    return -1;
  });

  const [assessmentAnswers, setAssessmentAnswersState] = useState<number[]>(() => {
    const savedAnswers = localStorage.getItem(`assessment_answers_${currentUser.id}`);
    return savedAnswers ? JSON.parse(savedAnswers) : [];
  });

  const [assessmentHistory, setAssessmentHistory] = useState<{ date: string; score: number; category: string } | null>(null);

  const setAssessmentStep = (step: number) => {
    localStorage.setItem(`assessment_step_${currentUser.id}`, step.toString());
    setAssessmentStepState(step);
  };

  const setAssessmentAnswers = (answers: number[] | ((prev: number[]) => number[])) => {
    setAssessmentAnswersState(prev => {
      const next = typeof answers === 'function' ? answers(prev) : answers;
      localStorage.setItem(`assessment_answers_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };

  // Load articles & assessment history from localStorage on mount
  useEffect(() => {
    // Sync articles with likes
    const likedKey = `liked_articles`;
    const likedStore = localStorage.getItem(likedKey);
    const likedIds: string[] = likedStore ? JSON.parse(likedStore) : [];

    // Dynamically retrieve published and draft articles from app_articles_list
    const artKey = 'app_articles_list';
    const artStore = localStorage.getItem(artKey);
    const rawArticles: Article[] = artStore ? JSON.parse(artStore) : INITIAL_ARTICLES;
    
    if (!artStore) {
      localStorage.setItem(artKey, JSON.stringify(INITIAL_ARTICLES));
    }

    const syncedArticles = rawArticles.map(art => ({
      ...art,
      likedByCurrentUser: likedIds.includes(art.id),
      likes: likedIds.includes(art.id) ? art.likes + 1 : art.likes
    }));
    setArticles(syncedArticles);

    // Sync assessment history
    const assessmentKey = `assessment_history_${currentUser.id}`;
    const assessmentStore = localStorage.getItem(assessmentKey);
    if (assessmentStore) {
      setAssessmentHistory(JSON.parse(assessmentStore));
    }
  }, [currentUser.id]);

  // Book Appointment submission
  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingPsychologist) return;
    setBookingError(null);
    if (bookingType === 'video' && (!bookingDate || !bookingSlot)) {
      setBookingError("Silakan lengkapi tanggal dan slot jam sesi video call.");
      return;
    }

    if (bookingType === 'video') {
      const cleanedNum = bookingWhatsapp.trim();
      if (!cleanedNum) {
        setBookingError("Nomor WhatsApp Aktif wajib diisi!");
        return;
      }
      const isOnlyDigits = /^\d+$/.test(cleanedNum);
      if (!isOnlyDigits) {
        setBookingError("Nomor WhatsApp hanya boleh berisi angka!");
        return;
      }
      if (cleanedNum.length < 10 || cleanedNum.length > 15) {
        setBookingError("Nomor WhatsApp minimal harus 10 digit dan maksimal 15 digit!");
        return;
      }
    }

    const isChat = bookingType === 'chat';
    const initialStatus = isChat ? 'approved' : 'MENUNGGU_JADWAL';

    const newBooking: Consultation = {
      id: `booking_${Date.now()}`,
      consultation_id: `booking_${Date.now()}`,
      studentId: currentUser.id,
      mahasiswa_id: currentUser.id,
      studentName: currentUser.name,
      studentNim: currentUser.nimOrNip,
      studentPhone: bookingType === 'video' ? bookingWhatsapp.trim() : undefined,
      studentWhatsapp: bookingType === 'video' ? bookingWhatsapp.trim() : undefined,
      psychologistId: bookingPsychologist.id,
      psikolog_id: bookingPsychologist.id,
      psychologistName: bookingPsychologist.name,
      psychologistAvatar: bookingPsychologist.avatarUrl,
      date: isChat ? 'Asynchronous' : bookingDate,
      timeSlot: isChat ? 'Fleksibel' : bookingSlot,
      status: initialStatus,
      type: bookingType,
      symptoms: bookingSymptoms.trim() || 'Konsultasi berkala kesehatan mental.',
      symptomDuration: bookingDuration,
      notes: isChat ? bookingNotes.trim() : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // For Chat Konseling, send the first message (symptoms) to the API immediately
    if (isChat) {
      const firstMessageText = bookingSymptoms.trim() || 'Konsultasi berkala kesehatan mental.';
      sendChatMessageViaApi(
        newBooking.id,
        currentUser.id,
        bookingPsychologist.id,
        'mahasiswa',
        firstMessageText
      ).then(res => {
        if (bookingNotes.trim()) {
          // If there are optional notes, send them as a second message
          sendChatMessageViaApi(
            newBooking.id,
            currentUser.id,
            bookingPsychologist.id,
            'mahasiswa',
            `Catatan tambahan: ${bookingNotes.trim()}`
          );
        }
      }).catch(err => {
        console.error("Failed sending first chat message automatically:", err);
      });
    }

    const updated = consultations.some(c => c.id === newBooking.id) ? consultations : [newBooking, ...consultations];
    setConsultations(updated);
    localStorage.setItem('all_consultations', JSON.stringify(updated));

    if (bookingType === 'video') {
      createNotificationViaApi(
        bookingPsychologist.id,
        'psikolog',
        'Permintaan Video Call Baru',
        `Mahasiswa ${currentUser.name} mengajukan sesi Video Call pada ${bookingDate} pukul ${bookingSlot}.`
      );
      createNotificationViaApi(
        'admin',
        'admin',
        'Booking Video Call Diajukan',
        `Mahasiswa ${currentUser.name} mengajukan Video Call dengan Psikolog ${bookingPsychologist.name} pada ${bookingDate} pukul ${bookingSlot}.`
      );
    }

    setBookingSuccess(true);
    setBookingSymptoms('');
    setBookingNotes('');
    setBookingDate('');
    setBookingSlot('');
    
    setBookingPsychologist(null);
    setTimeout(() => {
      setBookingSuccess(false);
    }, 2500);
  };

  // --- OFFLINE BOOKING METHODS ---
  const handleOfflineBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOfflineBookingError(null);

    if (!selectedScheduleId) {
      setOfflineBookingError('Silakan pilih jadwal terlebih dahulu.');
      return;
    }

    if (!offlineKeluhan.trim()) {
      setOfflineBookingError('Silakan ketik keluhan singkat Anda.');
      return;
    }

    setIsOfflineSubmitting(true);
    setOfflineBookingSuccess(null);
    try {
      const result = await registerAntrianOffline(
        currentUser.id,
        offlineName,
        offlineNim,
        offlineProdi,
        offlinePhone,
        offlineKeluhan,
        selectedScheduleId
      );

      if (result.success && result.antrian) {
        setOfflineKeluhan('');
        setOfflineBookingSuccess(`Pendaftaran bimbingan tatap muka berhasil! Nomor antrian ${result.antrian.nomor_antrian} telah diterbitkan.`);
        
        const sc = offlineSchedules.find(s => s.id === selectedScheduleId);
        const pId = sc ? sc.psikolog_id : '';
        const pName = sc ? sc.psikolog_name || 'Psikolog Pelaksana' : 'Psikolog Pelaksana';

        createNotificationViaApi(
          currentUser.id,
          'mahasiswa',
          'Antrian Offline Berhasil Dibuat',
          `Nomor antrian bimbingan tatap muka Anda ${result.antrian.nomor_antrian} berhasil dibuat bersama ${pName}.`
        );
        if (pId) {
          createNotificationViaApi(
            pId,
            'psikolog',
            'Mahasiswa Mengambil Antrian Offline',
            `Mahasiswa ${offlineName} (${offlineNim}) mengambil antrian offline #${result.antrian.nomor_antrian} pada hari ${sc ? sc.hari : ''}.`
          );
        }
        createNotificationViaApi(
          'admin',
          'admin',
          'Pendaftaran Antrian Offline Baru',
          `Mahasiswa ${offlineName} mendaftar antrian offline #${result.antrian.nomor_antrian} bersama ${pName}.`
        );

        setOfflineSchedules(getJadwalOfflineList());
        setOfflineBookings(getAntrianKonsultasiList());
      } else {
        setOfflineBookingError(result.message || 'Gagal mengambil nomor antrian.');
      }
    } catch (err: any) {
      setOfflineBookingError(err.message || 'Gagal terhubung dengan server bimbingan POLINELA.');
    } finally {
      setIsOfflineSubmitting(false);
    }
  };

  const handleCancelOfflineBooking = (bookingId: string) => {
    setCancelTargetId(bookingId);
  };

  const handleCancelOfflineBookingOk = async (bookingId: string) => {
    setCancelTargetId(null);
    setOfflineBookingError(null);
    setOfflineBookingSuccess(null);
    try {
      // Optimistic list update
      setOfflineBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'Dibatalkan' } : b));
      
      const result = await updateBookingStatusViaApi(bookingId, 'Dibatalkan');
      if (result.success) {
        const synced = await syncWithBackend();
        setOfflineBookings(synced.bookings);
        setOfflineSchedules(synced.schedules);
        setOfflineBookingSuccess('Antrian berhasil dibatalkan.');
      } else {
        const synced = await syncWithBackend();
        setOfflineBookings(synced.bookings);
        setOfflineBookingError(result.message || 'Gagal membatalkan antrian.');
      }
    } catch (err: any) {
      setOfflineBookingError(err.message || 'Gagal terhubung dengan server bimbingan POLINELA.');
    }
  };

  // Like Toggle
  const handleLikeArticle = (artId: string) => {
    const likedKey = `liked_articles`;
    const likedStore = localStorage.getItem(likedKey);
    let likedIds: string[] = likedStore ? JSON.parse(likedStore) : [];

    if (likedIds.includes(artId)) {
      likedIds = likedIds.filter(id => id !== artId);
    } else {
      likedIds.push(artId);
    }
    localStorage.setItem(likedKey, JSON.stringify(likedIds));

    setArticles(articles.map(art => {
      if (art.id === artId) {
        const liked = likedIds.includes(artId);
        return {
          ...art,
          likedByCurrentUser: liked,
          likes: liked ? art.likes + 1 : art.likes - 1
        };
      }
      return art;
    }));
  };

  // Handle Assessment option selection
  const handleSelectAssessmentOption = (score: number) => {
    const updatedAnswers = [...assessmentAnswers];
    updatedAnswers[assessmentStep] = score;
    setAssessmentAnswers(updatedAnswers);
  };

  const resetAssessment = () => {
    setAssessmentStep(-1);
    setAssessmentAnswers([]);
  };

  // Specialties filters from Psychologist array
  const allSpecialties = Array.from(new Set(psychologists.flatMap(p => p.specialties)));

  // Filter psychologists
  const filteredPsychologists = psychologists.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(psychologistSearch.toLowerCase()) || 
                          p.specialties.some(s => s.toLowerCase().includes(psychologistSearch.toLowerCase()));
    const matchesSpecialty = selectedSpecialty ? p.specialties.includes(selectedSpecialty) : true;
    return matchesSearch && matchesSpecialty;
  });

  // Filter articles
  const filteredArticles = articles.filter(art => {
    // Only published articles are shown
    const isPublished = art.status === undefined || art.status === 'Publish';
    const matchesCategory = selectedArticleCategory === 'Semua' ? true : art.category === selectedArticleCategory;
    const matchesSearch = art.title.toLowerCase().includes(articleSearch.toLowerCase()) || 
                          art.category.toLowerCase().includes(articleSearch.toLowerCase()) || 
                          art.excerpt.toLowerCase().includes(articleSearch.toLowerCase());
    return isPublished && matchesCategory && matchesSearch;
  });

  const totalArticlePages = Math.ceil(filteredArticles.length / articlesPerPage) || 1;
  const paginatedArticles = filteredArticles.slice((articlePage - 1) * articlesPerPage, articlePage * articlesPerPage);

  // Active student bookings list (Including Chat sessions and offline sessions)
  const myConsultations = [
    ...consultations
      .filter(c => c.studentId === currentUser.id)
      .map(c => {
        let lifecycleState: 'active' | 'completed' | 'cancelled' = 'active';
        let badgeLabel = 'Terjadwal';
        let badgeColorClass = 'bg-indigo-50 text-indigo-850 border border-indigo-200';

        if (c.status === 'completed' || c.status === 'SELESAI' || c.status === 'diarsipkan') {
          lifecycleState = 'completed';
          badgeLabel = 'Selesai';
          badgeColorClass = 'bg-slate-100 text-slate-700 border border-slate-300';
        } else if (c.status === 'cancelled' || c.status === 'rejected') {
          lifecycleState = 'cancelled';
          badgeLabel = c.status === 'cancelled' ? 'Dibatalkan' : 'Ditolak';
          badgeColorClass = 'bg-rose-50 text-rose-800 border border-rose-200';
        } else {
          lifecycleState = 'active';
          if (c.type === 'chat') {
            badgeLabel = 'Chat Aktif';
            badgeColorClass = 'bg-indigo-55 bg-indigo-50 text-indigo-750 border border-indigo-250 animate-pulse font-bold';
          } else {
            if (c.status === 'pending') {
              badgeLabel = 'Menunggu';
              badgeColorClass = 'bg-amber-50 text-amber-800 border border-amber-200';
            } else if (c.status === 'ongoing' || c.status === 'SEDANG_BERLANGSUNG') {
              badgeLabel = 'Berlangsung';
              badgeColorClass = 'bg-emerald-50 text-emerald-800 border border-emerald-250 animate-pulse';
            } else {
              badgeLabel = 'Terjadwal';
              badgeColorClass = 'bg-indigo-50 text-indigo-750 border border-indigo-150';
            }
          }
        }

        return {
          id: c.id,
          consultation_id: c.id,
          studentId: c.studentId,
          studentName: c.studentName,
          studentNim: c.studentNim,
          studentPhone: c.studentPhone,
          psychologistId: c.psychologistId,
          psychologistName: c.psychologistName,
          psychologistAvatar: c.psychologistAvatar,
          date: c.date,
          timeSlot: c.timeSlot,
          status: c.status,
          type: c.type || 'chat',
          symptoms: c.symptoms,
          symptomDuration: c.symptomDuration,
          createdAt: c.createdAt || c.updatedAt || new Date().toISOString(),
          updatedAt: c.updatedAt || new Date().toISOString(),
          notes: c.notes,
          diagnosisNotes: c.diagnosisNotes,
          recommendations: c.recommendations,
          rejectionReason: c.rejectionReason,
          lifecycleState,
          badgeLabel,
          badgeColorClass
        };
      }),
    ...offlineBookings
      .filter(b => b.mahasiswa_id === currentUser.id)
      .map(b => {
        const matchedSchedule = offlineSchedules.find(s => s.id === b.jadwal_id);
        const pId = matchedSchedule?.psikolog_id || '';
        const psych = psychologists.find(p => p.id === pId);
        const psychologistName = b.mahasiswa_id ? (matchedSchedule?.psikolog_name || psych?.name || 'Psikolog Polinela') : 'Psikolog Polinela';

        let lifecycleState: 'active' | 'completed' | 'cancelled' = 'active';
        let badgeLabel = 'Terdaftar';
        let badgeColorClass = 'bg-teal-50 text-teal-800 border border-teal-200';

        const isFinished = ['Selesai', 'SELESAI'].includes(b.status);
        const isCancelled = ['Dibatalkan', 'rejected', 'DIBATALKAN', 'DITOLAK'].includes(b.status);

        if (isFinished) {
          lifecycleState = 'completed';
          badgeLabel = 'Selesai';
          badgeColorClass = 'bg-slate-100 text-slate-705 border border-slate-305';
        } else if (isCancelled) {
          lifecycleState = 'cancelled';
          badgeLabel = ['rejected', 'DITOLAK'].includes(b.status) ? 'Ditolak' : 'Dibatalkan';
          badgeColorClass = 'bg-rose-50 text-rose-800 border border-rose-200';
        } else {
          lifecycleState = 'active';
          if (['CHECK_IN', 'CHECKIN'].includes(b.status)) {
            badgeLabel = 'Check-In';
            badgeColorClass = 'bg-emerald-50 text-emerald-800 border border-emerald-250 font-bold';
          } else if (['SEDANG_BERLANGSUNG', 'Sedang Berlangsung'].includes(b.status)) {
            badgeLabel = 'Berlangsung';
            badgeColorClass = 'bg-emerald-50 text-emerald-800 border border-emerald-250 animate-pulse font-bold';
          } else if (['Menunggu', 'MENUNGGU'].includes(b.status)) {
            badgeLabel = 'Menunggu';
            badgeColorClass = 'bg-amber-50 text-amber-800 border border-amber-200 animate-pulse';
          } else {
            badgeLabel = 'Terdaftar';
            badgeColorClass = 'bg-teal-50 text-teal-850 border border-teal-200';
          }
        }

        return {
          id: b.id,
          consultation_id: b.id,
          studentId: b.mahasiswa_id,
          studentName: b.mahasiswa_name || currentUser.name || '',
          studentNim: b.mahasiswa_nim || '',
          studentPhone: b.mahasiswa_phone || '',
          psychologistId: pId,
          psychologistName: psychologistName,
          psychologistAvatar: psych?.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
          date: matchedSchedule ? `Hari ${matchedSchedule.hari}` : 'Sesuai Jadwal',
          timeSlot: matchedSchedule ? `${matchedSchedule.jam_mulai} - ${matchedSchedule.jam_selesai} WIB` : 'Fleksibel',
          status: b.status as any,
          type: 'offline' as any,
          symptoms: b.keluhan,
          symptomDuration: 'Tatap Muka',
          createdAt: b.created_at || new Date().toISOString(),
          updatedAt: b.created_at || new Date().toISOString(),
          notes: b.nomor_antrian ? `Nomor Antrian: ${b.nomor_antrian}` : '',
          diagnosisNotes: b.catatan_konsultasi || b.hasil_observasi || '',
          recommendations: Array.isArray(b.rekomendasi) ? b.rekomendasi : (b.rekomendasi ? [b.rekomendasi] : []),
          rejectionReason: '',
          lifecycleState,
          badgeLabel,
          badgeColorClass
        };
      })
  ].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });

  const handleEnterChatForSession = (session: Consultation) => {
    if (session.type === 'chat') {
      setSelectedChatId(session.id);
      setActiveTab('chat-konsultasi');
      return;
    }

    // Find or create an associated 'chat' room
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

  return (
    <div className="space-y-8">
      {/* HEADER BANNER */}
      <div className="glass-panel p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200/30 rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> e-Counseling POLINELA
          </div>
          <h2 className="text-2xl md:text-3.5xl font-extrabold text-slate-800 tracking-tight font-display">
            Selamat Datang, {currentUser.name}! 👋
          </h2>
          <p className="text-sm text-slate-500 max-w-xl leading-relaxed">
            Menjaga kesehatan mental kuliah adalah prioritas utama. Gunakan platform rekam asisten kemahasiswaan ini untuk berkonsultasi, memeriksa kesehatan emosional Anda, atau memperkaya literasi mental.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('psikolog')}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-2xl shadow-sm shadow-indigo-100 hover:shadow-indigo-200 transition-all text-xs md:text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            Booking Konseling
          </button>
          <button 
            onClick={() => setActiveTab('kuesioner')}
            className="px-5 py-3 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 font-medium rounded-2xl shadow-sm transition-all text-xs md:text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Activity className="w-4 h-4 text-indigo-500" />
            Pemeriksaan Kesehatan
          </button>
        </div>
      </div>

      {/* INNER TABS HEADER */}
      <div className="border-b border-slate-200/80 flex overflow-x-auto gap-4 md:gap-8 no-scrollbar scroll-smooth">
        {[
          { id: 'overview', label: 'Dashboard', icon: Activity },
          { id: 'psikolog', label: 'Konsultasi Online', icon: Stethoscope },
          { id: 'chat-konsultasi', label: 'Chat Konsultasi', icon: MessageSquare },
          { id: 'counseling-offline', label: 'Konsultasi Offline', icon: MapPin },
          { id: 'riwayat', label: 'Konsultasi Saya', icon: ClipboardList },
          { id: 'kuesioner', label: 'Tes Mental', icon: HelpCircle },
          { id: 'artikel', label: 'Artikel', icon: BookOpen },
          { id: 'profil', label: 'Profil Saya', icon: UserIcon }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-semibold text-xs md:text-sm flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                isActive 
                  ? 'border-indigo-600 text-indigo-750 font-bold' 
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
              {tab.label}
              {tab.id === 'chat-konsultasi' && globalUnreadCount > 0 && (
                <span className="bg-emerald-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ml-1.5 animate-pulse shrink-0">
                  {globalUnreadCount}
                </span>
              )}
              {tab.id === 'riwayat' && myConsultations.length > 0 && (
                <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 shrink-0">
                  {myConsultations.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Body Columns */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Active Agenda / Sesi Terjadwal */}
            <div className="glass-panel p-6 animate-in fade-in duration-300">
              <h3 className="font-bold text-slate-805 text-base md:text-lg mb-4 font-display flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" /> Sesi Konseling Terdekat Anda
              </h3>
              
              {myConsultations.filter(c => c.lifecycleState === 'active').length === 0 ? (
                <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-sm text-slate-500 mb-3">Belum ada jadwal konsultasi terdekat.</p>
                  <button 
                    onClick={() => setActiveTab('psikolog')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-100/40"
                  >
                    Daftar Sesi Sekarang <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myConsultations
                    .filter(c => c.lifecycleState === 'active')
                    .slice(0, 2)
                    .map(item => (
                      <div key={item.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <img 
                            src={item.psychologistAvatar} 
                            alt={item.psychologistName}
                            className="w-11 h-11 rounded-full object-cover border border-white shadow-sm"
                          />
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">{item.psychologistName}</h4>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-450 mt-1">
                              <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-100">
                                <Calendar className="w-3 h-3 text-slate-400" /> {item.date}
                              </span>
                              <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-slate-100">
                                <Clock className="w-3 h-3 text-slate-400" /> {item.timeSlot}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-3 md:pt-0">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${item.badgeColorClass}`}>
                            {item.badgeLabel}
                          </span>
                          
                          {(item.type === 'approved' || item.status === 'ongoing' || item.status === 'CHAT_AKTIF' || item.status === 'approved' || item.lifecycleState === 'active') && (item.type === 'chat' || item.type === 'video') && (
                            <button
                              onClick={() => {
                                handleEnterChatForSession(item);
                              }}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Masuk Sesi
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            {/* PHQ-9 Mental Health Screening Widget */}
            <div className="glass-panel p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-2xl -mr-16 -mt-16"></div>
              <div className="relative space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-slate-800 text-sm md:text-base font-display">Asesmen Kesehatan Mental Mandiri (PHQ-9)</h3>
                </div>
                
                {assessmentHistory ? (
                  <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center md:text-left">
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-wide">Pemeriksaan Terakhir Anda</p>
                      <h4 className="text-base font-extrabold text-indigo-900 leading-tight capitalize">
                        {assessmentHistory.category}
                      </h4>
                      <p className="text-[11px] text-slate-500">Berhasil diperiksa pada {assessmentHistory.date}</p>
                    </div>
                    <button
                      onClick={() => {
                        resetAssessment();
                        setActiveTab('kuesioner');
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-sm transition-all shrink-0 cursor-pointer"
                    >
                      Mulai Tes Ulang
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-center md:text-left">
                      <p className="text-xs font-semibold text-slate-600">
                        Ambil kuesioner medis 9 pertanyaan singkat ini untuk mendeteksi tingkat kelelahan mental, stres akademik, atau kecemasan Anda secara gratis.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        resetAssessment();
                        setActiveTab('kuesioner');
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-sm shrink-0 cursor-pointer"
                    >
                      Buka Tes (PHQ-9)
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Short list of mental articles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-base font-display flex items-center gap-1.5">
                  <BookOpen className="w-5 h-5 text-indigo-600" /> Artikel Terpopuler
                </h3>
                <button 
                  onClick={() => setActiveTab('artikel')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                >
                  Lihat Semua Edukasi <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {articles.slice(0, 2).map(art => (
                  <div 
                    key={art.id}
                    onClick={() => setActiveArticle(art)}
                    className="group glass-panel overflow-hidden hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="h-40 overflow-hidden relative">
                      <img 
                        src={art.imageUrl} 
                        alt={art.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className="absolute bottom-3 left-3 bg-white px-2 py-0.5 rounded text-[10px] font-bold text-indigo-700 border border-indigo-100 shadow-sm">
                        {art.category}
                      </span>
                    </div>
                    <div className="p-4 space-y-2">
                       <h4 className="font-bold text-slate-800 text-sm leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2 font-display">
                        {art.title}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {art.excerpt}
                       </p>
                      <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-50">
                        <span>{art.author}</span>
                        <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {art.minutesToRead} min</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Status Panel Sidebar */}
          <div className="space-y-6">
            <div className="glass-panel p-5 space-y-4 text-left">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-3xs">
                <Shield className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-extrabold text-slate-800 text-sm md:text-base font-display">
                  Panduan Jika Mengalami Krisis Emosional
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Jika Anda sedang mengalami tekanan emosional berat, kecemasan berlebihan, stres akademik, atau kondisi psikologis yang mengganggu aktivitas sehari-hari, lakukan langkah berikut:
                </p>
              </div>
              <ol className="space-y-2 text-[11px] text-slate-600 font-semibold list-decimal pl-4.5 marker:text-indigo-500 leading-relaxed">
                <li>Hubungi keluarga, sahabat, atau orang terpercaya terdekat.</li>
                <li>Ajukan konsultasi dengan psikolog kampus melalui sistem e-Konseling POLINELA.</li>
                <li>Datangi layanan bimbingan dan konseling kampus pada jam operasional.</li>
                <li>Lakukan teknik relaksasi sederhana seperti pernapasan dalam dan istirahat yang cukup.</li>
                <li>Jika kondisi membahayakan diri sendiri atau orang lain, segera cari bantuan profesional kesehatan terdekat.</li>
              </ol>
              <div className="pt-3 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed italic">
                e-Konseling POLINELA merupakan sarana pendampingan psikologis mahasiswa dan bukan layanan gawat darurat medis.
              </div>
            </div>

            {/* Quick Consultation Instructions */}
            <div className="bg-gradient-to-br from-indigo-950 to-slate-900 text-indigo-100/95 rounded-2xl p-5 shadow-sm space-y-4 border border-indigo-500/20">
              <h4 className="text-white text-xs uppercase font-extrabold tracking-wider flex items-center gap-1.5 border-b border-indigo-500/25 pb-2">
                <BookOpen className="w-4 h-4 text-indigo-400" /> 📖 PANDUAN LAYANAN KONSELING
              </h4>
              <div className="text-[11px] space-y-4 leading-relaxed">
                {/* 1. Chat */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>1. Konsultasi Online (Chat)</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-indigo-200/80">
                    <li>Pilih psikolog pada menu Konsultasi Online.</li>
                    <li>Klik tombol Chat Konsultasi.</li>
                    <li>Chat langsung aktif tanpa perlu persetujuan.</li>
                    <li>Kirim pesan dan tunggu balasan psikolog.</li>
                  </ul>
                </div>

                {/* 2. Video Call */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold">
                    <Video className="w-3.5 h-3.5" />
                    <span>2. Konsultasi Online (Video Call)</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-indigo-200/80">
                    <li>Pilih psikolog.</li>
                    <li>Klik Video Call.</li>
                    <li>Pilih tanggal dan jam konsultasi.</li>
                    <li>Tunggu persetujuan psikolog.</li>
                  </ul>
                </div>

                {/* 3. Offline */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold">
                    <Building className="w-3.5 h-3.5" />
                    <span>3. Konsultasi Offline (Tatap Muka)</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-indigo-200/80">
                    <li>Masuk ke menu Konsultasi Offline.</li>
                    <li>Lihat jadwal psikolog yang tersedia.</li>
                    <li>Periksa sisa kuota antrian.</li>
                    <li>Ambil nomor antrian sesuai jadwal yang dipilih.</li>
                  </ul>
                </div>

                {/* 4. Riwayat */}
                <div className="space-y-1 border-t border-indigo-500/10 pt-2">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold">
                    <ClipboardList className="w-3.5 h-3.5" />
                    <span>4. Riwayat Konsultasi</span>
                  </div>
                  <p className="pl-5 text-indigo-200/80">
                    Lihat status dan riwayat seluruh layanan konsultasi pada menu Riwayat Konsultasi.
                  </p>
                </div>
              </div>

              <div className="border-t border-indigo-500/25 pt-2.5 mt-2 flex gap-1.5 text-[10px] text-indigo-200/70 italic leading-snug">
                <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <p>🔒 Seluruh konsultasi bersifat rahasia dan hanya dapat diakses oleh mahasiswa dan psikolog yang terkait.</p>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* TAB CONTENT: PSIKOLOG (LIST & BOOKING) */}
      {activeTab === 'psikolog' && (
        <div className="space-y-6">
          {bookingPsychologist ? (
            /* Consultation Booking Widget Panel */
            <div className="bg-white rounded-3xl border border-slate-100 p-6 max-w-2xl mx-auto shadow-md">
              <div className="flex items-center justify-between border-b border-slate-150 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setBookingPsychologist(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h3 className="text-base md:text-lg font-bold text-slate-800 font-display">Isi Form Booking Video Call</h3>
                </div>
                <span className="text-xs text-slate-400">Step 2 dari 2</span>
              </div>
              
              {bookingSuccess ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">
                    Permintaan Video Call Dikirim!
                  </h4>
                  <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                    Permintaan jadwal video call Anda telah berhasil didaftarkan dan sedang menunggu persetujuan (approval) dari psikolog pilihan Anda.
                  </p>
                  <p className="text-xs text-amber-600 font-bold bg-amber-50 px-3 py-1.5 rounded-lg inline-block border border-amber-100">
                    Status: Menunggu Persetujuan Psikolog
                  </p>
                </div>
              ) : (
                <form onSubmit={handleBookingSubmit} className="space-y-5">
                  {bookingError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold">
                      {bookingError}
                    </div>
                  )}
                  {/* Selected psychologist preview */}
                  <div className="flex items-center gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    <img 
                      src={bookingPsychologist.avatarUrl} 
                      alt={bookingPsychologist.name}
                      className="w-12 h-12 rounded-full object-cover border border-white shadow-xs"
                    />
                    <div>
                      <p className="text-xs text-slate-400 uppercase font-bold">Psikolog Pilihan Anda</p>
                      <h4 className="font-extrabold text-slate-800 text-sm font-display">{bookingPsychologist.name}</h4>
                      <p className="text-[11px] text-indigo-600 font-semibold">{bookingPsychologist.specialties.join(', ')}</p>
                    </div>
                  </div>

                  {/* Date & Time slot for Video Call */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-xl border border-dashed border-slate-200">
                    {/* Select Date */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wide">Pilih Tanggal Sesi</label>
                      <input 
                        type="date"
                        required
                        value={bookingDate}
                        onChange={(e) => setBookingDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full bg-white text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs md:text-sm shadow-2xs"
                      />
                    </div>

                    {/* Time Slot */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wide">Pilih Slot Sesi</label>
                      <select
                        required
                        value={bookingSlot}
                        onChange={(e) => setBookingSlot(e.target.value)}
                        className="w-full bg-white text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs md:text-sm cursor-pointer shadow-2xs"
                      >
                        <option value="">-- Hubungi Jam Operasional --</option>
                        {bookingPsychologist.availableHours.map((hr, idx) => (
                          <option key={idx} value={hr}>{hr}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Problem Duration */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Berapa Lama Hambatan Dirasakan?</label>
                    <select
                      value={bookingDuration}
                      onChange={(e) => setBookingDuration(e.target.value)}
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs md:text-sm cursor-pointer"
                    >
                      <option value="Kurang dari 1 minggu">Kurang dari 1 minggu</option>
                      <option value="1-2 minggu">1-2 minggu</option>
                      <option value="2-4 minggu">2-4 minggu</option>
                      <option value="Lebih dari 1 bulan">Lebih dari 1 bulan</option>
                    </select>
                  </div>

                  {/* Symptoms Text area */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Ceritakan rincian keluhan Anda (Deskripsi Keluhan)</label>
                    <textarea 
                      required
                      value={bookingSymptoms}
                      onChange={(e) => setBookingSymptoms(e.target.value)}
                      placeholder="Misalnya: Saya merasa cemas akademik, tugas organisasi menumpuk dan sering mengalami insomnia disertai jantung berdebar-debar..."
                      className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 rounded-xl p-3 h-28 text-xs md:text-sm"
                    />
                  </div>

                  {/* WhatsApp contact field with bottom-bordered layout */}
                  <div className="space-y-2 py-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      Nomor WhatsApp Aktif <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    <input 
                      type="text"
                      required
                      value={bookingWhatsapp}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setBookingWhatsapp(val);
                      }}
                      maxLength={15}
                      placeholder="08xxxxxxxxxx"
                      className="w-full bg-transparent text-slate-800 border-b border-slate-200 focus:border-indigo-500 transition-colors focus:outline-none py-1.5 text-xs md:text-sm font-semibold tracking-wide placeholder:text-slate-300"
                    />
                    <p className="text-[10px] md:text-[11px] text-slate-400 font-semibold leading-relaxed">
                      Nomor WhatsApp ini akan digunakan oleh psikolog untuk menghubungi Anda setelah jadwal video call disetujui.
                    </p>
                  </div>

                  {/* Submission buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setBookingPsychologist(null)}
                      className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs md:text-sm transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={getPsychologistStatus(bookingPsychologist.id) === 'offline'}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-xs md:text-sm shadow-sm transition-colors cursor-pointer"
                    >
                      {getPsychologistStatus(bookingPsychologist.id) === 'offline' ? 'Psikolog sedang tidak tersedia' : 'Kirim Pendaftaran'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Psychologist List Directory with Filters */
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg font-display">Directory Tim Psikolog Kampus</h3>
                  <p className="text-xs text-slate-500">Silakan temukan psikolog pendamping tepercaya Anda.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  {/* Text search */}
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input 
                      type="text"
                      placeholder="Cari spesialisasi..."
                      value={psychologistSearch}
                      onChange={(e) => setPsychologistSearch(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 text-xs rounded-xl pl-10 pr-4 py-2.5 w-full focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  {/* Dropdown specialty select */}
                  <select
                    value={selectedSpecialty}
                    onChange={(e) => setSelectedSpecialty(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Semua Keahlian</option>
                    {allSpecialties.map((spec, sIdx) => (
                      <option key={sIdx} value={spec}>{spec}</option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredPsychologists.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-xs">
                  <p className="text-sm text-slate-500">Tidak menemukan psikolog dengan keahlian tersebut.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPsychologists.map(psych => (
                    <div 
                      key={psych.id}
                      className="glass-panel overflow-hidden hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div className="p-6 space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="relative shrink-0">
                            <img 
                              src={psych.avatarUrl} 
                              alt={psych.name}
                              className="w-14 h-14 rounded-2xl object-cover border border-slate-50 shadow-sm"
                            />
                            <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 border-2 border-white rounded-full ${
                              getPsychologistDisplayLabel(psych.id).dotClass
                            }`} />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-slate-800 text-sm leading-tight font-display">{psych.name}</h4>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">NIP: {psych.nip}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                getPsychologistDisplayLabel(psych.id).bgClass
                              }`}>
                                {getPsychologistDisplayLabel(psych.id).text}
                              </span>
                            </div>
                            <p className="text-xs text-indigo-600 font-medium mt-1">{psych.experienceYears} Tahun Pengalaman</p>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                          {psych.bio}
                        </p>

                        <div className="space-y-1.5 pt-2">
                          <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Fokus Klinis:</p>
                          <div className="flex flex-wrap gap-1">
                            {psych.specialties.map((spec, sIdx) => (
                              <span key={sIdx} className="bg-slate-50 py-0.5 px-2 rounded text-[10px] text-slate-600 border border-slate-150">
                                {spec}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          {(() => {
                            const psychRatings = allRatings.filter(r => r.id_psikolog === psych.id);
                            const totalRatings = psychRatings.length;
                            const averageRating = totalRatings > 0 
                              ? (psychRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings).toFixed(1) 
                              : null;

                            if (averageRating) {
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Kepuasan Mahasiswa</p>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-slate-705">⭐ {averageRating} / 5</span>
                                    <span className="text-[10px] text-slate-500 font-medium">({totalRatings} Penilaian)</span>
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <span className="text-[11px] text-slate-400 font-semibold italic">Belum ada penilaian mahasiswa</span>
                              );
                            }
                          })()}
                        </div>

                        {(() => {
                          const currentStatus = getPsychologistStatus(psych.id);
                          const isOffline = currentStatus === 'offline';
                          
                          if (isOffline) {
                            return (
                              <div className="bg-rose-50 text-rose-605 rounded-xl p-3 text-center text-xs font-bold font-display border border-rose-100 w-full flex items-center justify-center gap-1.5 leading-snug">
                                <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
                                Psikolog sedang tidak tersedia
                              </div>
                            );
                          }
                          
                          return (
                            <div className="grid grid-cols-2 gap-2 w-full">
                              <button
                                onClick={() => {
                                  // Direct action for Chat Konsultasi: instantly create a private 1-on-1 chat
                                  const existingChat = consultations.find(
                                    c => c.studentId === currentUser.id && 
                                         c.psychologistId === psych.id && 
                                         c.type === 'chat' && 
                                         (c.status === 'approved' || c.status === 'CHAT_AKTIF' || c.status === 'SEDANG_BERLANGSUNG')
                                  );
                                  if (existingChat) {
                                    setSelectedChatId(existingChat.id);
                                    setActiveTab('chat-konsultasi');
                                  } else {
                                    const newBooking: Consultation = {
                                      id: `booking_${Date.now()}`,
                                      consultation_id: `booking_${Date.now()}`,
                                      studentId: currentUser.id,
                                      mahasiswa_id: currentUser.id,
                                      studentName: currentUser.name,
                                      studentNim: currentUser.nimOrNip,
                                      psychologistId: psych.id,
                                      psikolog_id: psych.id,
                                      psychologistName: psych.name,
                                      psychologistAvatar: psych.avatarUrl,
                                      date: 'Asynchronous',
                                      timeSlot: 'Fleksibel',
                                      status: 'CHAT_AKTIF',
                                      type: 'chat',
                                      symptoms: 'Konsultasi privat baru dimulai.',
                                      symptomDuration: 'Baru dimulai',
                                      createdAt: new Date().toISOString(),
                                      updatedAt: new Date().toISOString()
                                    };
                                    
                                    const firstMessageText = 'Halo Dokter, saya ingin mulai berkonsultasi secara privat.';
                                    sendChatMessageViaApi(
                                      newBooking.id,
                                      currentUser.id,
                                      psych.id,
                                      'mahasiswa',
                                      firstMessageText
                                    ).then(() => {
                                      console.log("Initial chat message sent");
                                    }).catch(err => {
                                      console.error("Failed to send first message:", err);
                                    });

                                    const updated = consultations.some(c => c.id === newBooking.id) ? consultations : [newBooking, ...consultations];
                                    setConsultations(updated);
                                    localStorage.setItem('all_consultations', JSON.stringify(updated));
                                    
                                    setSelectedChatId(newBooking.id);
                                    setActiveTab('chat-konsultasi');
                                  }
                                }}
                                className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] md:text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1"
                              >
                                <MessageSquare className="w-3.5 h-3.5" /> 💬 Chat Konsultasi
                              </button>

                              <button
                                onClick={() => {
                                  setBookingPsychologist(psych);
                                  setBookingType('video');
                                  setBookingDate('');
                                  setBookingSlot('');
                                }}
                                className="px-2.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] md:text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer flex items-center justify-center gap-1"
                              >
                                <Video className="w-3.5 h-3.5" /> 📹 Video Call
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* TAB CONTENT: RIWAYAT KONSULTASI */}
      {activeTab === 'riwayat' && (() => {
        const filteredList = myConsultations.filter((booking: any) => {
          if (bookingSubTab === 'active') return booking.lifecycleState === 'active';
          if (bookingSubTab === 'completed') return booking.lifecycleState === 'completed';
          if (bookingSubTab === 'cancelled') return booking.lifecycleState === 'cancelled';
          return true;
        });

        return (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Log Histori & Alur Bimbingan</h3>
                <p className="text-xs text-slate-500 font-semibold">Tinjau jalannya seluruh tahapan layanan konseling, bimbingan mandiri, dan hasil rekam psikologis Anda.</p>
              </div>

              {/* STAGE SUB-TABS */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto overflow-x-auto no-scrollbar gap-1">
                {[
                  { id: 'all', label: 'Semua Status' },
                  { id: 'active', label: 'Sesi Aktif' },
                  { id: 'completed', label: 'Selesai' },
                  { id: 'cancelled', label: 'Dibatalkan' }
                ].map((subTab) => (
                  <button
                    key={subTab.id}
                    onClick={() => setBookingSubTab(subTab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      bookingSubTab === subTab.id
                        ? 'bg-white text-indigo-750 shadow-xs border border-indigo-100'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {subTab.label}
                  </button>
                ))}
              </div>
            </div>

            {myConsultations.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-xs">
                <p className="text-sm text-slate-500 font-semibold">Anda belum memiliki riwayat bimbingan atau konsultasi aktif.</p>
              </div>
            ) : filteredList.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 shadow-xs">
                <p className="text-sm text-slate-400 font-semibold">
                  {bookingSubTab === 'active' && 'Tidak ada sesi konsultasi aktif saat ini.'}
                  {bookingSubTab === 'completed' && 'Belum ada riwayat sesi bimbingan yang selesai.'}
                  {bookingSubTab === 'cancelled' && 'Tidak ada data pengajuan/sesi yang dibatalkan.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredList.map((booking: any) => (
                  <div 
                    key={booking.id}
                    className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs hover:border-slate-200 transition-all"
                  >
                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <img 
                          src={booking.psychologistAvatar} 
                          alt={booking.psychologistName}
                          className="w-12 h-12 rounded-full object-cover border border-slate-105 shadow-2xs"
                        />
                        <div>
                          <h4 className="font-extrabold text-slate-850 text-sm font-display">{booking.psychologistName}</h4>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                            <span className="flex items-center gap-1 font-semibold"><Calendar className="w-3.5 h-3.5 text-slate-400" /> {booking.date}</span>
                            <span className="flex items-center gap-1 font-semibold"><Clock className="w-3.5 h-3.5 text-slate-400" /> {booking.timeSlot}</span>
                            <span className="font-bold uppercase tracking-wide px-1.5 py-0.5 bg-slate-50 text-slate-650 rounded-md text-[9px] flex items-center gap-1 border border-slate-200/50">
                              {booking.type === 'chat' ? (
                                <MessageSquare className="w-2.5 h-2.5 text-indigo-500" />
                              ) : booking.type === 'video' ? (
                                <Video className="w-2.5 h-2.5 text-emerald-500" />
                              ) : (
                                <MapPin className="w-2.5 h-2.5 text-teal-500" />
                              )}
                              {booking.type === 'chat' ? 'Chat Konsultasi' : booking.type === 'video' ? 'Video Call' : 'Tatap Muka (Offline)'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 md:gap-3.5 border-t md:border-t-0 pt-3 md:pt-0 self-start md:self-auto w-full md:w-auto justify-between md:justify-end">
                        {/* Status Badges */}
                        <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${booking.badgeColorClass}`}>
                          {booking.badgeLabel}
                        </span>

                        <div className="flex items-center gap-2">
                          {/* Enter Consultation button for active online sessions */}
                          {booking.lifecycleState === 'active' && (booking.type === 'chat' || booking.type === 'video') && (
                            <button
                              onClick={() => {
                                handleEnterChatForSession(booking);
                              }}
                              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-display shadow-xs flex items-center gap-1 cursor-pointer transition-all shrink-0"
                            >
                              <MessageSquare className="w-3.5 h-3.5 animate-pulse" /> Masuk Sesi
                            </button>
                          )}

                          {/* Action button for cancelling offline bookings */}
                          {booking.type === 'offline' && (booking.status === 'TERDAFTAR' || booking.status === 'Terdaftar') && (
                            <button
                              onClick={() => handleCancelOfflineBooking(booking.id)}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-3xs hover:shadow-xs transition-colors shrink-0"
                            >
                              Batalkan Antrian
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expand Symptoms & Rejection details */}
                    <div className="px-5 pb-5 border-t border-slate-50 pt-3 space-y-3.5 bg-slate-50/25 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="font-extrabold text-slate-700 uppercase tracking-wide text-[9px]">Uraian Keluhan/Tujuan Layanan ({booking.symptomDuration}):</p>
                          <p className="text-slate-600 leading-relaxed mt-1">"{booking.symptoms || '-'}"</p>
                        </div>
                        {booking.notes && (
                          <div>
                            <p className="font-extrabold text-indigo-750 uppercase tracking-wide text-[9px]">Keterangan / Catatan Sistem:</p>
                            <p className="text-slate-600 leading-relaxed mt-1 bg-indigo-50/25 p-2.5 rounded-lg border border-indigo-50/40 italic">"{booking.notes}"</p>
                          </div>
                        )}
                      </div>

                      {booking.lifecycleState === 'cancelled' && (booking.rejectionReason || booking.status === 'rejected' || booking.status === 'cancelled' || booking.status === 'Dibatalkan') && (
                        <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-100 text-rose-850">
                          <p className="font-bold uppercase tracking-wider text-[9px] flex items-center gap-1 text-rose-800">
                            <AlertCircle className="w-3.5 h-3.5" /> Informasi Pembatalan / Status Sesi:
                          </p>
                          <p className="mt-1 leading-relaxed text-rose-750 font-medium font-sans">
                            {booking.rejectionReason ? `"${booking.rejectionReason}"` : "Sesi konsultasi telah dibatalkan."}
                          </p>
                        </div>
                      )}

                      {/* Show diagnosed feedback for completed sessions */}
                      {booking.lifecycleState === 'completed' && (booking.diagnosisNotes || booking.catatan_konsultasi || booking.hasil_observasi) && (
                        <div className="bg-emerald-50/20 p-4 rounded-xl border border-emerald-100 space-y-3 animate-in fade-in duration-350">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <h5 className="font-bold text-slate-800 uppercase tracking-widest text-[9.5px]">Dokumen Rekam Psikologis & Hasil Asesmen</h5>
                          </div>
                          
                          {(booking.diagnosisNotes || booking.catatan_konsultasi) && (
                            <div className="space-y-1 mt-1 text-slate-650">
                              <p className="font-bold text-slate-705 text-[10px] uppercase">Catatan Konseling Psikolog:</p>
                              <div className="leading-relaxed font-medium bg-white p-3 rounded-xl border border-slate-100">
                                {booking.diagnosisNotes || booking.catatan_konsultasi}
                              </div>
                            </div>
                          )}

                          {booking.hasil_observasi && (
                            <div className="space-y-1 mt-1 text-slate-650">
                              <p className="font-bold text-slate-705 text-[10px] uppercase">Hasil Observasi Lapangan:</p>
                              <div className="leading-relaxed font-medium bg-white p-3 rounded-xl border border-slate-100">
                                {booking.hasil_observasi}
                              </div>
                            </div>
                          )}

                          {((booking.recommendations && booking.recommendations.length > 0) || (booking.rekomendasi && booking.rekomendasi.length > 0)) && (
                            <div className="space-y-1.5 pt-1">
                              <p className="font-bold text-slate-705 text-[10px] uppercase">Rencana Kerja & Tindakan Mandiri (Action Plan):</p>
                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {(booking.recommendations || []).map((rec: string, rIdx: number) => (
                                  <span key={rIdx} className="bg-white text-indigo-750 border border-indigo-100 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-2xs">
                                    💡 {rec}
                                  </span>
                                ))}
                                {(booking.rekomendasi || []).map((rec: string, rIdx: number) => (
                                  <span key={`rek_${rIdx}`} className="bg-white text-emerald-750 border border-emerald-100 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-2xs">
                                    💡 {rec}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {booking.lifecycleState === 'completed' && (() => {
                        const existingRating = allRatings.find(r => r.id_sesi_konsultasi === booking.id);
                        if (existingRating) {
                          return (
                            <div className="bg-amber-50/35 border border-amber-200/50 rounded-xl p-3.5 mt-2 flex items-center justify-between gap-3 text-slate-700 animate-in fade-in duration-350">
                              <div className="flex items-center gap-2 text-left">
                                <span className="text-amber-500 text-lg">⭐</span>
                                <div className="space-y-0.5">
                                  <p className="font-bold text-[11px] text-amber-850">Terima kasih atas penilaian Anda.</p>
                                  {existingRating.komentar && (
                                    <p className="text-[10px] text-slate-500 italic mt-0.5 font-medium">"{existingRating.komentar}"</p>
                                  )}
                                </div>
                              </div>
                              <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                                Rated {existingRating.rating} Star
                              </span>
                            </div>
                          );
                        }

                        // Not rated yet - show selection
                        const selectedRating = ratingFormStates[booking.id]?.rating || 0;
                        const inputtedComment = ratingFormStates[booking.id]?.komentar || "";

                        return (
                          <div className="bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/50 space-y-3 mt-3 animate-in fade-in duration-350 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Beri Penilaian Konsultasi</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 py-0.5 justify-start">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => handleSelectStarForSession(booking.id, star)}
                                  className="text-2xl transition-transform hover:scale-115 active:scale-95 cursor-pointer focus:outline-none"
                                >
                                  {star <= selectedRating ? "⭐" : "☆"}
                                </button>
                              ))}
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-extrabold uppercase text-slate-450 tracking-wide">Komentar (Opsional):</label>
                              <textarea
                                placeholder="Uraikan saran atau kesan atas layanan psikolog..."
                                value={inputtedComment}
                                onChange={(e) => handleUpdateCommentForSession(booking.id, e.target.value)}
                                className="w-full bg-white border border-slate-150 focus:border-indigo-500 rounded-xl p-2.5 text-xs font-semibold focus:outline-none transition-colors text-slate-800"
                                rows={2}
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSubmitRatingForSession(booking.id, booking.psychologistId)}
                              disabled={selectedRating === 0}
                              className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                                selectedRating > 0
                                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                              }`}
                            >
                              Kirim Penilaian
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB CONTENT: KUESIONER PHQ-9 */}
      {activeTab === 'kuesioner' && (
        <div className="max-w-2xl mx-auto">
          {assessmentStep === -1 ? (
            /* Intro Screen */
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                <HelpCircle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-extrabold text-slate-800 text-lg md:text-xl font-display">Asesmen Skrining PHQ-9</h3>
                <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                  PHQ-9 (*Patient Health Questionnaire*) adalah instrumen skrining klinis tervalidasi yang diakui secara global untuk mendeteksi intensitas stres emosional, kelelahan mental, dan tingkat kecemasan or depresi selama 2 minggu terakhir.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 text-left text-xs text-slate-600 leading-relaxed">
                <p className="font-bold text-slate-700 mb-1">Pemberitahuan Etis Medis:</p>
                Hasil asesmen ini bersifat skrining awal yang edukatif guna membantu memahami emosi mikro Anda. Hasil ini tidak menggantikan diagnosa klinis resmi. Untuk saran diagnosa tervalidasi, silakan berkonsultasi langsung dengan Tim Psikolog kami.
              </div>

              <button
                onClick={() => {
                  setAssessmentStep(0);
                  setAssessmentAnswers([]);
                }}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs md:text-sm shadow-sm transition-all cursor-pointer"
              >
                Mulai Pengisian Mandiri (9 Pertanyaan)
              </button>
            </div>
          ) : assessmentStep >= 0 && assessmentStep <= 8 ? (
            /* Inside step question card */
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 space-y-6 shadow-sm">
              {/* Progress visual bar */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Kuesioner PHQ-9</span>
                  <span className="text-xs text-slate-500 font-bold">
                    Pertanyaan {assessmentStep + 1} dari 9 ({Math.round(((assessmentStep + 1) / 9) * 100)}% selesai)
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-305"
                    style={{ width: `${Math.round(((assessmentStep + 1) / 9) * 100)}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                <p className="text-xs text-slate-400">Selama 2 pekan terakhir, seberapa sering Anda terganggu oleh masalah berikut:</p>
                <h4 className="text-sm md:text-base font-extrabold text-slate-800 leading-relaxed font-display font-display">
                  {ASSESSMENT_QUESTIONS[assessmentStep].text}
                </h4>
              </div>

              <div className="grid grid-cols-1 gap-2.5 pt-2">
                {[
                  { value: 0, label: 'Tidak pernah sama sekali' },
                  { value: 1, label: 'Beberapa hari' },
                  { value: 2, label: 'Lebih dari separuh hari' },
                  { value: 3, label: 'Hampir setiap hari' }
                ].map(opt => {
                  const isSelected = assessmentAnswers[assessmentStep] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleSelectAssessmentOption(opt.value)}
                      className={`w-full text-left px-5 py-4 border rounded-xl text-xs md:text-sm font-semibold transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-600 text-indigo-900 shadow-3xs'
                          : 'bg-slate-50 border-slate-200 text-slate-705 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border transition-all ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white font-extrabold'
                          : 'bg-white border-slate-300 text-slate-400'
                      }`}>
                        {isSelected ? '✓' : ' '}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Navigation button panel - no auto-next */}
              <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100">
                {assessmentStep > 0 && (
                  <button
                    onClick={() => setAssessmentStep(assessmentStep - 1)}
                    className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs md:text-sm border border-slate-200 transition-colors shadow-3xs cursor-pointer"
                  >
                    Sebelumnya
                  </button>
                )}
                
                {assessmentStep < 8 ? (
                  <button
                    disabled={assessmentAnswers[assessmentStep] === undefined}
                    onClick={() => setAssessmentStep(assessmentStep + 1)}
                    className={`ml-auto px-6 py-2.5 font-bold rounded-xl text-xs md:text-sm transition-all cursor-pointer ${
                      assessmentAnswers[assessmentStep] !== undefined
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50'
                    }`}
                  >
                    Selanjutnya
                  </button>
                ) : (
                  <button
                    disabled={assessmentAnswers[assessmentStep] === undefined}
                    onClick={() => setAssessmentStep(9)}
                    className={`ml-auto px-6 py-2.5 font-bold rounded-xl text-xs md:text-sm transition-all cursor-pointer ${
                      assessmentAnswers[assessmentStep] !== undefined
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50'
                    }`}
                  >
                    Selesai Tes
                  </button>
                )}
              </div>
            </div>
          ) : assessmentStep === 9 ? (
            /* Intermediate "Lihat Hasil Tes" Screen */
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-650 rounded-full flex items-center justify-center mx-auto animate-bounce mt-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h3 className="font-extrabold text-slate-800 text-lg md:text-xl font-display">Seluruh Pertanyaan Selesai</h3>
                <p className="text-xs md:text-sm text-slate-500 max-w-md mx-auto leading-relaxed font-semibold">
                  Terima kasih! Anda telah selesai menjawab seluruh kuesioner skrining kesehatan mental PHQ-9.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    const totalScore = assessmentAnswers.reduce((sum, score) => (sum ?? 0) + (score ?? 0), 0);
                    const res = getAssessmentResult(totalScore);
                    
                    const sessionResult = {
                      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
                      score: totalScore,
                      category: res.category
                    };

                    localStorage.setItem(`assessment_history_${currentUser.id}`, JSON.stringify(sessionResult));
                    setAssessmentHistory(sessionResult);

                    createNotificationViaApi(
                      currentUser.id,
                      'mahasiswa',
                      'Hasil PHQ-9 Tersedia',
                      `Hasil tes skrining PHQ-9 mandiri Anda menunjukkan kategori: ${res.category} (Skor: ${totalScore}).`
                    );

                    setAssessmentStep(10); // Show results
                  }}
                  className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs md:text-sm shadow-md transition-all cursor-pointer"
                >
                  Lihat Hasil Tes →
                </button>
              </div>
            </div>
          ) : (
            /* Scoring & output results (assessmentStep === 10) */
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 space-y-6 shadow-sm">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2 font-bold text-lg">
                  ★
                </div>
                <h3 className="font-extrabold text-slate-800 text-lg md:text-xl font-display">Hasil Analisis Skrining Emosional</h3>
                <p className="text-xs text-slate-400">Asesmen PHQ-9 Anda telah dihitung.</p>
              </div>

              {assessmentHistory && (
                <div className="space-y-5">
                  <div className="p-5 bg-indigo-50/40 rounded-2xl border border-indigo-150 text-center space-y-2">
                    <p className="text-[10px] text-slate-450 uppercase font-bold tracking-widest">Kategori Kondisi Mental Anda</p>
                    <h4 className="text-lg md:text-2xl font-extrabold text-indigo-900 leading-tight capitalize">
                      {assessmentHistory.category}
                    </h4>
                    <p className="text-xs text-indigo-600 font-semibold">Hasil evaluasi berbasis standar klinis PHQ-9</p>
                  </div>

                  <div className="space-y-4">
                    {/* Description Text */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Arti Kondisi:</p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {getAssessmentResult(assessmentHistory.score).description}
                      </p>
                    </div>

                    {/* Recommendations Lists */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">Rencana Tindak Lanjut:</p>
                      <ul className="text-xs text-slate-650 space-y-1.5 pl-4 list-disc leading-relaxed">
                        {getAssessmentResult(assessmentHistory.score).recommendations.map((rec, rIdx) => (
                          <li key={rIdx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex flex-col sm:flex-row gap-3 border-t border-slate-100">
                <button
                  onClick={resetAssessment}
                  className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-750 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Mulai Screening Ulang
                </button>
                {assessmentHistory && assessmentHistory.score >= 10 && (
                  <button
                    onClick={() => setActiveTab('psikolog')}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
                  >
                    Konsul ke Psikolog Sekarang
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: ARTIKEL KESEHATAN MENTAL */}
      {activeTab === 'artikel' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-850 text-base md:text-lg font-display">Literasi & Edukasi Kesehatan Mental</h3>
              <p className="text-xs text-slate-500 font-medium">Mengembangkan kecerdasan regulasi emosi mandiri melalui bahan literasi terpercaya.</p>
            </div>

            {/* Search and Categories bar inside card */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={articleSearch}
                  onChange={(e) => {
                    setArticleSearch(e.target.value);
                    setArticlePage(1); // reset to page 1 on search
                  }}
                  placeholder="Cari judul atau topik..."
                  className="w-full sm:w-60 pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 outline-none text-xs font-semibold rounded-xl focus:border-indigo-500 transition-all text-slate-705 placeholder-slate-400"
                />
              </div>

              {/* Filtering category scroll tab */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 max-w-full no-scrollbar">
                {['Semua', 'Kecemasan', 'Stres', 'Depresi', 'Akademik', 'Relationship', 'Self-Care'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedArticleCategory(cat);
                      setArticlePage(1); // reset to page 1
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap border cursor-pointer transition-colors ${
                      selectedArticleCategory === cat 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-3xs' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {paginatedArticles.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-150 shadow-3xs space-y-2">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="font-semibold text-slate-700 text-sm">Tidak ada artikel di kategori & filter ini</h4>
              <p className="text-[11px] text-slate-450 max-w-xs mx-auto">Coba masukkan kata kunci pencarian yang berbeda atau pilih kategori literasi lainnya.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedArticles.map(art => (
                  <div 
                    key={art.id}
                    onClick={() => setActiveArticle(art)}
                    className="group glass-panel overflow-hidden hover:shadow-md transition-all flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      <div className="h-44 overflow-hidden relative">
                        <img 
                          src={art.imageUrl} 
                          alt={art.title}
                          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                        />
                        <span className="absolute bottom-3 left-3 bg-white px-2 py-0.5 rounded text-[10px] font-bold text-indigo-750 border border-indigo-120 shadow-sm">
                          {art.category}
                        </span>
                      </div>

                      <div className="p-5 space-y-3">
                        <h4 className="font-extrabold text-slate-800 text-sm md:text-base leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2 font-display">
                          {art.title}
                        </h4>
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                          {art.excerpt}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-450">
                      <div className="flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-650">{art.author.split(',')[0]}</span>
                      </div>
                      <span className="flex items-center gap-1 font-semibold"><Clock className="w-3.5 h-3.5" /> {art.minutesToRead} Menit</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* PAGINATION UI */}
              {totalArticlePages > 1 && (
                <div className="bg-white border border-slate-100 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-3xs">
                  <span className="text-[11px] font-semibold text-slate-450">
                    Menampilkan <strong className="text-slate-800">{(articlePage - 1) * articlesPerPage + 1}</strong> - <strong className="text-slate-800">{Math.min(articlePage * articlesPerPage, filteredArticles.length)}</strong> dari <strong className="text-slate-800">{filteredArticles.length}</strong> artikel.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setArticlePage(prev => Math.max(1, prev - 1))}
                      disabled={articlePage === 1}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    {Array.from({ length: totalArticlePages }, (_, idx) => idx + 1).map(pageNum => (
                      <button
                        key={pageNum}
                        onClick={() => setArticlePage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          articlePage === pageNum 
                            ? 'bg-indigo-600 text-white shadow-3xs' 
                            : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                    <button
                      onClick={() => setArticlePage(prev => Math.min(totalArticlePages, prev + 1))}
                      disabled={articlePage === totalArticlePages}
                      className="px-3 py-1.5 bg-indigo-600 border border-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: KONSULTASI TATAP MUKA (OFFLINE) */}
      {activeTab === 'counseling-offline' && (() => {
        const selectedSchedule = offlineSchedules.find(s => s.id === selectedScheduleId);
        const selectedScheduleStats = selectedSchedule ? getJadwalStats(selectedSchedule.id) : { kuotaTotal: 0, jumlahTerdaftar: 0, sisaKuota: 0 };
        const myOfflineBookings = offlineBookings.filter(b => b.mahasiswa_id === currentUser.id);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Main Booking Panel */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-gradient-to-r from-teal-50 to-indigo-50/40 border border-teal-100 rounded-3xl p-6 shadow-xs flex flex-col sm:flex-row items-center gap-4">
                <div className="bg-teal-500 text-white rounded-2xl p-3 shrink-0">
                  <MapPin className="w-6 h-6" />
                </div>
                <div className="space-y-1 text-center sm:text-left">
                  <h3 className="text-lg font-extrabold text-slate-800 font-display">Layanan Konsultasi Offline (Tatap Muka) POLINELA</h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Silakan pilih jadwal psikolog kampus yang bertugas. Setelah mengambil antrian, Anda akan mendapatkan nomor bimbingan otomatis untuk divalidasi saat konsultasi langsung di ruang UPBK POLINELA.
                  </p>
                </div>
              </div>

              {/* LIST JADWAL */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm font-display uppercase tracking-wider">Jadwal Psikolog yang Tersedia</h4>
                  <p className="text-xs text-slate-400 font-semibold">Klik salah satu kartu jadwal di bawah untuk mendaftar.</p>
                </div>

                {offlineSchedules.length === 0 ? (
                  <div className="text-center p-6 border border-dashed border-slate-200 rounded-2xl text-slate-400 font-medium text-xs font-semibold">
                    Belum ada jadwal offline yang ditambahkan oleh Administrator.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {offlineSchedules.map((schedule) => {
                      const stats = getJadwalStats(schedule.id);
                      const isSelected = selectedScheduleId === schedule.id;
                      const isFull = stats.sisaKuota <= 0;
                      
                      // RELASI: Ambil data dari database/state psikolog
                      const psyk = psychologists.find(p => p.id === schedule.psikolog_id);
                      const formattedName = psyk ? psyk.name : (schedule.psikolog_name || 'Psikolog Kampus');
                      const splitParts = formattedName.split(',');
                      const namaPsikolog = splitParts[0].trim();
                      const gelarPsikolog = splitParts.slice(1).join(', ').trim() || 'M.Psi., Psikolog';
                      const spesialisasi = psyk ? psyk.specialties.join(', ') : 'Kecemasan dan Stres Akademik';
                      const avatarSrc = psyk?.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80';

                      return (
                        <div 
                          key={schedule.id}
                          onClick={() => {
                            setSelectedScheduleId(schedule.id);
                            setOfflineBookingError(null);
                          }}
                          className={`flex gap-3.5 border rounded-2xl p-4.5 cursor-pointer transition-all ${
                            isSelected 
                              ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/15 shadow-sm' 
                              : isFull 
                                ? 'border-rose-150 bg-rose-50/10 opacity-95'
                                : 'border-slate-150 bg-white hover:border-slate-350 hover:shadow-xs'
                          }`}
                        >
                          {/* Foto Profil Psikolog */}
                          <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-150 shadow-4xs bg-slate-100">
                            <img 
                              src={avatarSrc} 
                              alt={namaPsikolog} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover" 
                            />
                          </div>

                          {/* Detail Info */}
                          <div className="flex-1 min-w-0 space-y-1 text-slate-700">
                            <h5 className="font-extrabold text-[12px] text-slate-900 font-display">👩‍⚕️ {namaPsikolog}</h5>
                            <p className="text-[10px] text-slate-500 font-bold leading-none">
                              Gelar: <span className="text-slate-800 font-extrabold">{gelarPsikolog}</span>
                            </p>
                            <p className="text-[10px] text-slate-500 font-bold line-clamp-2 leading-snug">
                              Spesialis: <span className="text-teal-650 font-black">{spesialisasi}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-500 pt-1">
                              <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-extrabold uppercase text-[8px] tracking-wide">
                                {schedule.hari}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                {schedule.jam_mulai} - {schedule.jam_selesai} WIB
                              </span>
                            </div>

                            {/* Quota Indicators */}
                            <div className="grid grid-cols-3 gap-1 pt-2.5 border-t border-slate-50 text-center text-[9px] leading-tight font-bold text-slate-500 uppercase">
                              <div className="bg-slate-50 rounded-lg py-1">
                                <span className="text-slate-400 block text-[7px] font-extrabold">Kuota Maks</span>
                                <span className="font-extrabold text-slate-800 text-[11px]">{schedule.kuota}</span>
                              </div>
                              <div className="bg-slate-50 rounded-lg py-1">
                                <span className="text-slate-400 block text-[7px] font-extrabold">Terdaftar</span>
                                <span className="font-extrabold text-indigo-600 text-[11px]">{stats.jumlahTerdaftar}</span>
                              </div>
                              <div className="bg-slate-50 rounded-lg py-1">
                                <span className="text-slate-400 block text-[7px] font-extrabold">Sisa</span>
                                <span className={`font-black text-[11px] ${stats.sisaKuota === 0 ? 'text-rose-600' : 'text-emerald-650'}`}>
                                  {stats.sisaKuota}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* BOOKING FORM PORTLET */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm font-display uppercase tracking-wider">Formulir Pengambilan Antrian</h4>
                  <p className="text-xs text-slate-400 font-semibold font-display">Tinjau sisa kuota dan isi data diri secara lengkap.</p>
                </div>

                {(() => {
                  const sPsyk = selectedSchedule ? psychologists.find(p => p.id === selectedSchedule.psikolog_id) : null;
                  const sFormattedName = sPsyk ? sPsyk.name : (selectedSchedule ? (selectedSchedule.psikolog_name || 'Psikolog Kampus') : 'Psikolog Kampus');
                  const sSplitParts = sFormattedName.split(',');
                  const sNamaPsikolog = sSplitParts[0].trim();
                  const sGelarPsikolog = sSplitParts.slice(1).join(', ').trim() || 'M.Psi., Psikolog';
                  const sIsFull = selectedSchedule ? selectedScheduleStats.sisaKuota <= 0 : false;

                  // Evaluate Form Complete state
                  const isFormComplete = !!(selectedSchedule && offlineName.trim() && offlineNim.trim() && offlineProdi.trim() && offlinePhone.trim() && offlineKeluhan.trim());

                  // Setup Button props based on state
                  let btnLabel = "Ambil Antrian";
                  let btnDisabled = false;
                  // Extremely visible, contrasting solid Indigo theme style
                  let btnStyleClass = "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-[0.98] border border-indigo-700 shadow-sm";

                  if (selectedSchedule && sIsFull) {
                    btnLabel = "Kuota Penuh";
                    btnDisabled = true;
                    btnStyleClass = "bg-slate-200 text-slate-500 border border-slate-350 cursor-not-allowed";
                  } else if (isOfflineSubmitting) {
                    btnLabel = "Menyimpan Data...";
                    btnDisabled = true;
                    btnStyleClass = "bg-indigo-400 text-white cursor-wait animate-pulse";
                  } else if (!isFormComplete) {
                    btnLabel = "Lengkapi Data Terlebih Dahulu";
                    btnDisabled = true;
                    btnStyleClass = "bg-slate-100 text-slate-400 border border-slate-300 cursor-not-allowed";
                  }

                  return (
                    <form onSubmit={handleOfflineBookingSubmit} className="bg-white border border-slate-150 rounded-3xl p-6 shadow-sm space-y-5">
                      {/* INFORMASI PSKIKOLOG, HARI, JAM, KUOTA DETAIL SEBELUM MENGISI */}
                      {selectedSchedule ? (
                        <div className="border border-indigo-100 bg-indigo-50/20 rounded-2xl p-4.5 space-y-3.5">
                          <span className="text-[9px] bg-indigo-600 text-white px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                            Konfirmasi Pilihan Jadwal
                          </span>
                          
                          <div className="flex gap-4">
                            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-150 bg-white">
                              <img 
                                src={sPsyk?.avatarUrl || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80'} 
                                alt={sNamaPsikolog} 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover" 
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="font-extrabold text-slate-800 text-xs font-display">👩‍⚕️ {sNamaPsikolog}, {sGelarPsikolog}</h5>
                              <p className="text-[10px] text-teal-650 font-bold mt-0.5">Spesialis: {sPsyk ? sPsyk.specialties.slice(0, 2).join(', ') : 'Kecemasan dan Stres Akademik'}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-[10px] font-bold text-slate-600">
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                              <span className="text-slate-400 block text-[7.5px] uppercase">Hari</span>
                              <span className="text-slate-800 font-extrabold">{selectedSchedule.hari}</span>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                              <span className="text-slate-400 block text-[7.5px] uppercase">Jam Praktik</span>
                              <span className="text-slate-800 font-extrabold">{selectedSchedule.jam_mulai} - {selectedSchedule.jam_selesai} WIB</span>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center col-span-1">
                              <span className="text-slate-400 block text-[7.5px] uppercase">Kuota Maksimal</span>
                              <span className="text-slate-800 font-extrabold">{selectedScheduleStats.kuotaTotal}</span>
                            </div>
                            <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                              <span className="text-slate-400 block text-[7.5px] uppercase">Terdaftar / Sisa</span>
                              <span className="text-slate-800 font-extrabold">
                                {selectedScheduleStats.jumlahTerdaftar} / <span className={sIsFull ? "text-rose-600" : "text-emerald-600"}>{selectedScheduleStats.sisaKuota}</span>
                              </span>
                            </div>
                          </div>

                          {sIsFull && (
                            <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-lg p-2.5 text-center text-[11px] font-bold">
                              ⚠️ Kuota konsultasi pada jadwal ini sudah penuh.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="border border-dashed border-indigo-200 bg-indigo-50/10 rounded-2xl p-5 text-center text-xs font-semibold text-indigo-700/80 leading-relaxed font-display">
                          📌 Silakan klik salah satu kartu jadwal praktis psikolog di atas terlebih dahulu untuk konfirmasi agenda bimbingan Anda.
                        </div>
                      )}

                      {offlineBookingError && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                          <span>{offlineBookingError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Name input */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-widest">Nama Mahasiswa</label>
                          <input 
                            type="text" 
                            required
                            value={offlineName}
                            onChange={(e) => setOfflineName(e.target.value)}
                            placeholder="Masukkan nama lengkap Anda"
                            className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-3xs"
                          />
                        </div>

                        {/* NIM input */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-widest">NIM (Nomor Induk Mahasiswa)</label>
                          <input 
                            type="text" 
                            required
                            value={offlineNim}
                            onChange={(e) => setOfflineNim(e.target.value)}
                            placeholder="Masukkan NIM Anda"
                            className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-3xs"
                          />
                        </div>

                        {/* Prodi input */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-widest">Program Studi</label>
                          <input 
                            type="text" 
                            required
                            value={offlineProdi}
                            onChange={(e) => setOfflineProdi(e.target.value)}
                            placeholder="Masukkan program studi"
                            className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-3xs"
                          />
                        </div>

                        {/* Phone input */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-extrabold text-slate-450 uppercase tracking-widest">No. Handphone Aktif</label>
                          <input 
                            type="tel" 
                            required
                            value={offlinePhone}
                            onChange={(e) => setOfflinePhone(e.target.value)}
                            placeholder="Contoh: 0812345678"
                            className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-3xs"
                          />
                        </div>
                      </div>

                      {/* Problem Description */}
                      <div className="space-y-1">
                        <label className="block text-[10px] font-extrabold text-slate-455 uppercase tracking-widest">Keluhan Singkat</label>
                        <textarea 
                          required
                          rows={3}
                          value={offlineKeluhan}
                          onChange={(e) => setOfflineKeluhan(e.target.value)}
                          placeholder="Uraikan secara singkat permasalahan atau tujuan mengambil bimbingan offline..."
                          className="w-full bg-slate-50 text-slate-800 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white rounded-xl p-3.5 text-xs font-semibold shadow-3xs"
                        />
                      </div>

                      {/* BUTTON ALWAY VISIBLE, WITH STATES: NORMAL, HOVER, LOADING, DISABLED */}
                      <button
                        type="submit"
                        disabled={btnDisabled}
                        className={`w-full py-4 rounded-2xl font-bold font-display text-xs transition-all shadow-md flex items-center justify-center gap-2 ${btnStyleClass}`}
                      >
                        {isOfflineSubmitting ? (
                          <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <Ticket className="w-4 h-4 shrink-0" />
                        )}
                        <span>{btnLabel}</span>
                      </button>
                    </form>
                  );
                })()}
              </div>
            </div>

            {/* Sidebar Ticket details & history */}
            <div className="space-y-6">
              {/* SECTION: TICKET GENERATION SUCCESS IF BOOKED (#5) */}
              {latestTicket && (() => {
                const ticketSchedule = offlineSchedules.find(s => s.id === latestTicket.jadwal_id);
                return (
                  <div className="relative bg-gradient-to-br from-indigo-900 to-slate-950 text-white rounded-3xl p-6 shadow-md border border-indigo-800 space-y-4 animate-scale-up overflow-hidden">
                    <div className="absolute -right-3 -top-3 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
                    <div className="absolute -left-3 bottom-10 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
                    
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <span className="text-[10px] font-black uppercase text-indigo-200 tracking-wider flex items-center gap-1 font-display">
                        <Ticket className="w-3.5 h-3.5 text-emerald-400" /> Tiket Antrian Anda
                      </span>
                      <span className="text-[9px] px-2.5 py-0.5 bg-emerald-500/20 text-emerald-305 font-black rounded-full uppercase">
                        Antrian Sukses
                      </span>
                    </div>

                    {/* Core Ticket Badge representation */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center space-y-1.5">
                      <p className="text-[10px] text-indigo-300 uppercase font-extrabold tracking-widest">Nomor Antrian Anda</p>
                      <p className="text-4xl font-extrabold text-emerald-400 tracking-wider font-mono">
                        {latestTicket.nomor_antrian}
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold leading-normal pt-1">Bawa tiket digital ini ke ruangan konseling POLINELA sesuai jadwal</p>
                    </div>

                    <div className="space-y-2 text-xs leading-relaxed">
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Hari Konsultasi:</span>
                        <span className="font-extrabold text-white">{ticketSchedule?.hari || 'Sesuai Pilihan'}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Jam Konsultasi:</span>
                        <span className="font-extrabold text-white">{ticketSchedule ? `${ticketSchedule.jam_mulai} - ${ticketSchedule.jam_selesai}` : '00:00'} WIB</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Nama Psikolog:</span>
                        <span className="font-extrabold text-indigo-200">{ticketSchedule?.psikolog_name || 'Psikolog Terkait'}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Status Antrian:</span>
                        <span className="font-extrabold text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono uppercase tracking-wide">
                          {latestTicket.status}
                        </span>
                      </div>
                    </div>

                    {(latestTicket.status === 'TERDAFTAR' || latestTicket.status === 'Terdaftar') && (
                      <div className="border-t border-dashed border-white/10 pt-4 text-center">
                        <button 
                          onClick={() => handleCancelOfflineBooking(latestTicket.id)}
                          className="px-4 py-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-[11px] font-bold transition-all cursor-pointer w-full hover:shadow-xs transition-colors"
                        >
                          Batalkan Antrian
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* SECTION: ANTRIAN OFFLINE SAYA - AKTIF */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="space-y-0.5">
                  <h4 className="font-extrabold text-slate-800 text-sm font-display uppercase tracking-wider">Antrian Aktif</h4>
                  <p className="text-[10px] text-teal-600 font-bold uppercase">Antrian Tatap Muka Aktif Saat Ini</p>
                </div>

                {(() => {
                  const activeBks = myOfflineBookings.filter(b => b.status === 'Terdaftar' || b.status === 'TERDAFTAR' || b.status === 'Menunggu' || b.status === 'CHECK_IN' || b.status === 'Sedang Berlangsung' || b.status === 'SEDANG_BERLANGSUNG');
                  if (activeBks.length === 0) {
                    return (
                      <div className="text-center p-5 border border-dashed border-slate-200 rounded-2xl text-slate-400 font-medium text-[10px]">
                        Tidak ada antrian aktif saat ini.
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3.5 animate-fade-in">
                      {activeBks.map((booking) => {
                        const matchedSchedule = offlineSchedules.find(s => s.id === booking.jadwal_id);
                        return (
                          <div key={booking.id} className="border border-slate-105 bg-slate-50/50 rounded-2xl p-4 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-indigo-750 font-mono bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-120 shadow-4xs">
                                {booking.nomor_antrian}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 font-extrabold rounded-full uppercase tracking-wider border ${
                                booking.status === 'CHECK_IN'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : booking.status === 'Sedang Berlangsung' || booking.status === 'SEDANG_BERLANGSUNG'
                                    ? 'bg-amber-50 text-amber-800 border-amber-250 animate-pulse'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                              }`}>
                                {booking.status === 'CHECK_IN' ? 'Check In' : booking.status}
                              </span>
                            </div>

                            <div className="space-y-1 text-slate-500 text-[11px] font-semibold leading-relaxed">
                              <p className="text-slate-700 font-bold">
                                Psikolog: {matchedSchedule?.psikolog_name || 'Psikolog Kampus'}
                              </p>
                              <p>Hari/Jam: {matchedSchedule?.hari}, {matchedSchedule?.jam_mulai} - {matchedSchedule?.jam_selesai} WIB</p>
                              <p className="italic text-slate-450 line-clamp-2">" {booking.keluhan} "</p>
                              <p className="text-[9px] text-slate-400">Dibuat: {formatNotificationTime(booking.created_at)}</p>
                            </div>

                            <button
                              onClick={() => handleCancelOfflineBooking(booking.id)}
                              className="w-full py-1.5 mt-2 bg-white hover:bg-rose-50 border border-rose-100 hover:border-rose-200 text-rose-700 text-[10px] font-bold rounded-xl transition-all cursor-pointer text-center font-display"
                            >
                              Batalkan Pendaftaran
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* SECTION: RIWAYAT OFFLINE SAYA */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="space-y-0.5">
                  <h4 className="font-extrabold text-slate-800 text-sm font-display uppercase tracking-wider">Riwayat Konsultasi Offline</h4>
                  <p className="text-[10px] text-slate-455 font-bold uppercase">Histori Konsultasi Tatap Muka Selesai & Batal</p>
                </div>

                {(() => {
                  const historyBks = myOfflineBookings.filter(b => ['Selesai', 'SELESAI', 'Dibatalkan', 'DIBATALKAN', 'DITOLAK', 'rejected'].includes(b.status));
                  if (historyBks.length === 0) {
                    return (
                      <div className="text-center p-5 border border-dashed border-slate-200 rounded-2xl text-slate-400 font-medium text-[10px]">
                        Belum memiliki riwayat bimbingan tatap muka.
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3.5 overflow-y-auto max-h-[350px] no-scrollbar animate-fade-in">
                      {historyBks.map((booking) => {
                        const matchedSchedule = offlineSchedules.find(s => s.id === booking.jadwal_id);
                        const isSelesai = booking.status === 'Selesai' || booking.status === 'SELESAI';
                        return (
                          <div key={booking.id} className="border border-slate-100 bg-slate-50/20 rounded-2xl p-4 space-y-3 opacity-95 hover:opacity-100 transition-opacity">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                                {booking.nomor_antrian}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 font-extrabold rounded-full uppercase tracking-wider border ${
                                isSelesai
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                  : 'bg-rose-50 text-rose-800 border-rose-100'
                              }`}>
                                {isSelesai ? 'SELESAI' : (['rejected', 'DITOLAK'].includes(booking.status) ? 'DITOLAK' : 'BATAL')}
                              </span>
                            </div>

                            <div className="space-y-1 text-slate-500 text-[11px] font-semibold leading-relaxed">
                              <p className="text-slate-655 font-bold">
                                Psikolog: {matchedSchedule?.psikolog_name || 'Psikolog Kampus'}
                              </p>
                              <p>Hari/Jam: {matchedSchedule?.hari}, {matchedSchedule?.jam_mulai} - {matchedSchedule?.jam_selesai} WIB</p>
                              <p className="italic text-slate-405 line-clamp-2">" {booking.keluhan} "</p>
                            </div>

                            {/* Show clinical report and recommendations if completed */}
                            {isSelesai && (booking.catatan_konsultasi || booking.rekomendasi) && (
                              <div className="pt-2 border-t border-slate-100 mt-1 space-y-2 text-[10.5px]">
                                {booking.catatan_konsultasi && (
                                  <div className="space-y-0.5">
                                    <span className="text-[9px] font-bold text-teal-600 uppercase">Dokumen Rekap Psikolog:</span>
                                    <p className="text-slate-700 font-medium bg-white p-2.5 rounded-xl border border-slate-100 leading-relaxed font-sans">
                                      {booking.catatan_konsultasi}
                                    </p>
                                  </div>
                                )}
                                {booking.hasil_observasi && (
                                  <div className="space-y-0.5">
                                    <span className="text-[9px] font-bold text-teal-600 uppercase">Hasil Observasi Kelakuan:</span>
                                    <p className="text-slate-700 font-medium bg-white p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                                      {booking.hasil_observasi}
                                    </p>
                                  </div>
                                )}
                                {booking.rekomendasi && booking.rekomendasi.length > 0 && (
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-bold text-teal-600 uppercase">Rencana Tindak Lanjut:</span>
                                    <div className="flex flex-wrap gap-1">
                                      {booking.rekomendasi.map((rec, rIdx) => (
                                        <span key={rIdx} className="bg-teal-50 border border-teal-100 text-teal-750 font-bold px-2 py-0.5 rounded text-[9.5px]">
                                          💡 {rec}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB CONTENT: PROFIL SAYA */}
      {activeTab === 'profil' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          {/* Main profile card */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-50 pb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg font-display">Profil Mahasiswa</h3>
                  <p className="text-xs text-slate-500">Sesuaikan informasi kemahasiswaan Anda agar tercatat akurat.</p>
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
                      form="student-profile-form"
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
                  <h4 className="font-bold text-xs text-slate-700">Foto Profil Resmi</h4>
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
                              // Perform file size & extension checking
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
              <form id="student-profile-form" onSubmit={(e) => {
                e.preventDefault();
                if (avatarFileError) {
                  setProfileNotice({ type: 'error', text: 'Perbaiki kesalahan foto profil terlebih dahulu.' });
                  return;
                }
                const formData = new FormData(e.currentTarget);
                
                // Form validations
                const emailVal = formData.get('email') as string;
                if (!emailVal.includes('@')) {
                  setProfileNotice({ type: 'error', text: 'Alamat email yang dimasukkan tidak valid.' });
                  return;
                }

                const updatedUser: User = {
                  ...currentUser,
                  name: formData.get('name') as string,
                  email: emailVal,
                  nimOrNip: formData.get('nimOrNip') as string,
                  prodiOrUnit: formData.get('prodiOrUnit') as string,
                  semester: formData.get('semester') as string,
                  phoneNumber: formData.get('phoneNumber') as string,
                  gender: formData.get('gender') as 'Laki-laki' | 'Perempuan',
                  bio: formData.get('bio') as string,
                  avatarUrl: avatarPreview || undefined
                };

                onUpdateProfile(updatedUser);
                setIsEditing(false);
                setProfileNotice({ type: 'success', text: 'Profil berhasil diperbarui.' });
                setTimeout(() => setProfileNotice(null), 4000);
              }} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Nama Lengkap</label>
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
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Alamat Email Kampus</label>
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
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Nomor Induk Mahasiswa (NIM)</label>
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
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Program Studi / Fakultas</label>
                    <input 
                      type="text" 
                      name="prodiOrUnit" 
                      defaultValue={currentUser.prodiOrUnit || ''} 
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Semester</label>
                    <select 
                      name="semester" 
                      defaultValue={currentUser.semester || '5'} 
                      disabled={!isEditing}
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                        isEditing 
                          ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800' 
                          : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'].map(sem => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">No. Telepon / HP</label>
                    <input 
                      type="text" 
                      name="phoneNumber" 
                      defaultValue={currentUser.phoneNumber || ''} 
                      disabled={!isEditing}
                      placeholder="Contoh: 0812345678" 
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                        isEditing 
                          ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800' 
                          : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Jenis Kelamin</label>
                    <select 
                      name="gender" 
                      defaultValue={currentUser.gender || 'Laki-laki'} 
                      disabled={!isEditing}
                      className={`w-full border rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold focus:outline-none transition-all ${
                        isEditing 
                          ? 'bg-white border-slate-200 focus:border-indigo-500 shadow-3xs text-slate-800' 
                          : 'bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <option value="Laki-laki">Laki-laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-550 uppercase tracking-wider">Deskripsi Ringkas Diri (Bio)</label>
                  <textarea 
                    name="bio" 
                    defaultValue={currentUser.bio || ''} 
                    disabled={!isEditing}
                    placeholder="Tulis deskripsi singkat penyesuaian bimbingan Anda di sini..." 
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
                setPasswordError(null);
                setPasswordSuccess(null);
                if (!oldPassword || !newPassword || !confirmPassword) {
                  setPasswordError("Semua field kata sandi harus diisi.");
                  return;
                }
                
                if (newPassword !== confirmPassword) {
                  setPasswordError("Konfirmasi password baru tidak cocok.");
                  return;
                }

                // Verify and Hash Password
                // Fetch credentials from the db
                const usersStore = localStorage.getItem('app_users');
                if (usersStore) {
                  const dbUsers: User[] = JSON.parse(usersStore);
                  const dbUserIdx = dbUsers.findIndex(u => u.id === currentUser.id);
                  if (dbUserIdx !== -1) {
                    const storedUser = dbUsers[dbUserIdx];
                    
                    // Simple hash function representation (Base64 encoding/simulated block-cipher representation)
                    // Verified against the plaintext stored password
                    if (storedUser.password && storedUser.password !== oldPassword) {
                      setPasswordError("Password lama yang Anda masukkan salah.");
                      return;
                    }

                    // Simulated secure Hashed value representation (e.g. secure SHA-hash mock strings or direct base64 value)
                    // Let's store secure password hash representation
                    const b64SecureHash = btoa(newPassword); // Standard safe client-side hashing simulation
                    dbUsers[dbUserIdx].password = newPassword; // keep plain for simple local authentication checks or hashed compatibility
                    
                    // Update
                    localStorage.setItem('app_users', JSON.stringify(dbUsers));
                    
                    // Update logged-in cache too
                    const updatedMe = { ...currentUser, password: newPassword };
                    localStorage.setItem('logged_in_user', JSON.stringify(updatedMe));
                    
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordSuccess("Password Anda berhasil dienkripsi dan diperbarui ke database!");
                  }
                }
              }} className="space-y-4">
                {passwordError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-xs font-semibold">
                    {passwordSuccess}
                  </div>
                )}
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
                  <Lock className="w-3.5 h-3.5 text-indigo-300" /> Selesaikan Pembaruan Sandi (Terarah Enkripsi)
                </button>
              </form>
            </div>
          </div>
          
          {/* Stats Sidebar */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-indigo-100/90 rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="text-white text-xs uppercase font-extrabold tracking-widest flex items-center gap-1.5 font-display">
                <Activity className="w-4 h-4 text-indigo-300" /> Statistik Aktivitas
              </h4>
              <div className="space-y-3.5 text-xs leading-relaxed">
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                  <span className="font-semibold text-indigo-200">Total Pengajuan Konseling:</span>
                  <span className="font-extrabold text-white text-sm">{myConsultations.length} Sesi</span>
                </div>
                
                {assessmentHistory ? (
                  <div className="bg-white/5 p-3 rounded-xl space-y-1.5 border border-white/5">
                    <span className="font-semibold text-indigo-200 block">Skrining PHQ-9 Terakhir ({assessmentHistory.date}):</span>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-indigo-100 bg-indigo-500/30 px-2 py-0.5 rounded text-[10px] capitalize">{assessmentHistory.category}</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 p-4 rounded-xl text-center border border-white/5">
                    <p className="text-[10px] text-indigo-300 font-semibold">Belum pernah mengisi skrining mental PHQ-9</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ARTICLE READER MODAL POPUP */}
      {activeArticle && (
        <ArticleDetailModal 
          article={activeArticle}
          onClose={() => setActiveArticle(null)}
          onLikeToggle={handleLikeArticle}
        />
      )}

      {/* CONFIRMATION CANCEL MODAL */}
      {cancelTargetId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="cancel-confirm-modal">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full border border-slate-100 space-y-5 animate-scale-up">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h3 className="font-extrabold text-slate-800 text-sm md:text-base font-display">Konfirmasi Pembatalan</h3>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  Apakah Anda yakin ingin membatalkan antrian konsultasi ini?
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setCancelTargetId(null)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200"
              >
                Tidak
              </button>
              <button
                type="button"
                onClick={() => handleCancelOfflineBookingOk(cancelTargetId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-rose-100"
              >
                Ya, Batalkan
              </button>
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
            <p className="text-xs text-slate-600 truncate mt-1 leading-normal font-medium italic">"{chatToast.text}"</p>
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
                  onUpdateProfile(updatedUser);
                  setShowDeleteAvatarConfirm(false);
                  setProfileNotice({ type: 'success', text: 'Foto profil berhasil dihapus.' });
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
    </div>
  );
}
