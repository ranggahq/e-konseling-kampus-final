import { JadwalOffline, AntrianKonsultasi, User, PenilaianKonsultasi } from '../types';

export interface ServerNotification {
  id: string;
  psikolog_id?: string;
  user_id?: string;
  role?: 'mahasiswa' | 'psikolog' | 'admin';
  title: string;
  text: string;
  created_at: string;
  is_read: boolean;
}

const DEFAULT_JADWAL: JadwalOffline[] = [
  {
    id: 'jo_1',
    hari: 'Senin',
    jam_mulai: '09:00',
    jam_selesai: '11:00',
    kuota: 5,
    psikolog_id: 'psikolog_1' // Dra. Sarah Safitri, M.Psi.
  },
  {
    id: 'jo_2',
    hari: 'Rabu',
    jam_mulai: '13:00',
    jam_selesai: '15:00',
    kuota: 3,
    psikolog_id: 'psikolog_1' // Dra. Sarah Safitri, M.Psi.
  },
  {
    id: 'jo_3',
    hari: 'Selasa',
    jam_mulai: '10:00',
    jam_selesai: '12:00',
    kuota: 4,
    psikolog_id: 'psikolog_2' // Rahmat Hidayat, S.Psi., M.Si.
  },
  {
    id: 'jo_4',
    hari: 'Kamis',
    jam_mulai: '14:00',
    jam_selesai: '16:00',
    kuota: 5,
    psikolog_id: 'psikolog_2' // Rahmat Hidayat, S.Psi., M.Si.
  },
  {
    id: 'jo_5',
    hari: 'Jumat',
    jam_mulai: '12:30',
    jam_selesai: '15:00',
    kuota: 5,
    psikolog_id: 'psikolog_1' // Dra. Sarah Safitri, M.Psi.
  }
];

// Helper to resolve psychologist names from existing user credentials
function getPsychologistName(psikologId: string): string {
  try {
    const usersStr = localStorage.getItem('app_users');
    if (usersStr) {
      const users = JSON.parse(usersStr) as User[];
      const p = users.find(u => u.id === psikologId);
      if (p) return p.name;
    }
  } catch (e) {
    console.error('Error fetching psychologist name:', e);
  }
  
  if (psikologId === 'psikolog_1') return 'Dra. Sarah Safitri, M.Psi.';
  if (psikologId === 'psikolog_2') return 'Rahmat Hidayat, S.Psi., M.Si.';
  return 'Psikolog Kampus POLINELA';
}

// ---------------------------------------------
// BACKEND SYNC AND CACHE UTILITIES
// ---------------------------------------------

// Asynchronously pull latest tables from database and refresh client-side cache
export async function syncWithBackend(): Promise<{ schedules: JadwalOffline[]; bookings: AntrianKonsultasi[] }> {
  try {
    const [schedRes, bookRes] = await Promise.all([
      fetch('/api/offline/schedules'),
      fetch('/api/offline/bookings')
    ]);

    if (schedRes.ok && bookRes.ok) {
      const schedules = await schedRes.json() as JadwalOffline[];
      const bookings = await bookRes.json() as AntrianKonsultasi[];

      // Cache locally
      localStorage.setItem('jadwal_offline', JSON.stringify(schedules));
      localStorage.setItem('antrian_konsultasi', JSON.stringify(bookings));

      return { schedules, bookings };
    }
  } catch (e) {
    console.warn('Sync failed, using offline localStorage/cache mechanism:', e);
  }

  return {
    schedules: getJadwalOfflineList(),
    bookings: getAntrianKonsultasiList()
  };
}

// Client-side getters (reading from sync'd local storage cache, instant replies)
export function getJadwalOfflineList(): JadwalOffline[] {
  const store = localStorage.getItem('jadwal_offline');
  if (!store) {
    localStorage.setItem('jadwal_offline', JSON.stringify(DEFAULT_JADWAL));
    return DEFAULT_JADWAL.map(item => ({
      ...item,
      psikolog_name: getPsychologistName(item.psikolog_id)
    }));
  }
  try {
    const list = JSON.parse(store) as JadwalOffline[];
    return list.map(item => ({
      ...item,
      psikolog_name: getPsychologistName(item.psikolog_id)
    }));
  } catch (e) {
    console.error(e);
    return DEFAULT_JADWAL;
  }
}

export function saveJadwalOfflineList(list: JadwalOffline[]): void {
  const cleaned = list.map(({ id, hari, jam_mulai, jam_selesai, kuota, psikolog_id }) => ({
    id, hari, jam_mulai, jam_selesai, kuota, psikolog_id
  }));
  localStorage.setItem('jadwal_offline', JSON.stringify(cleaned));

  // Push to server database asynchronously
  for (const sch of cleaned) {
    fetch('/api/offline/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sch)
    }).then(r => {
      if (!r.ok) console.error('Failed pushing schedule to backend');
    }).catch(err => console.error(err));
  }
}

export function getAntrianKonsultasiList(): AntrianKonsultasi[] {
  const store = localStorage.getItem('antrian_konsultasi');
  if (!store) return [];
  try {
    return JSON.parse(store) as AntrianKonsultasi[];
  } catch (e) {
    console.error(e);
    return [];
  }
}

export function saveAntrianKonsultasiList(list: AntrianKonsultasi[]): void {
  localStorage.setItem('antrian_konsultasi', JSON.stringify(list));
}

// ---------------------------------------------
// STATS HELPERS
// ---------------------------------------------
export interface QuotaStats {
  kuotaTotal: number;
  jumlahTerdaftar: number;
  sisaKuota: number;
}

export function getJadwalStats(jadwalId: string): QuotaStats {
  const schedules = getJadwalOfflineList();
  const sched = schedules.find(s => s.id === jadwalId);
  const total = sched ? sched.kuota : 0;
  
  const bookings = getAntrianKonsultasiList();
  // Active means pending, approved, or completed; cancelled bookings do not count towards quota.
  const registered = bookings.filter(b => b.jadwal_id === jadwalId && b.status !== 'Dibatalkan').length;
  
  return {
    kuotaTotal: total,
    jumlahTerdaftar: registered,
    sisaKuota: Math.max(0, total - registered)
  };
}

// ---------------------------------------------
// SEAMLESS INTEGRATION MUTATIONS
// ---------------------------------------------

// Create/Update schedule via API
export async function saveScheduleOfflineViaApi(schedule: Partial<JadwalOffline>): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/offline/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        await syncWithBackend();
        return { success: true, message: 'Jadwal bimbingan offline berhasil disimpan!' };
      }
    }
  } catch (e) {
    console.error(e);
  }
  return { success: false, message: 'Gagal menghubungi server untuk menyimpan jadwal.' };
}

// Delete schedule via API
export async function deleteScheduleOfflineViaApi(scheduleId: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`/api/offline/schedules/${scheduleId}`, { method: 'DELETE' });
    if (res.ok) {
      await syncWithBackend();
      return { success: true, message: 'Jadwal offline berhasil dihapus.' };
    }
  } catch (e) {
    console.error(e);
  }
  return { success: false, message: 'Gagal menghubungi server untuk menghapus jadwal.' };
}

// Booking bimbingan offline with full database conflict, overlapping, and duplicate check
export async function registerAntrianOffline(
  studentId: string,
  studentName: string,
  studentNim: string,
  studentProdi: string,
  studentPhone: string,
  keluhan: string,
  jadwalId: string
): Promise<{ success: boolean; message: string; antrian?: AntrianKonsultasi }> {
  try {
    const res = await fetch('/api/offline/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId,
        studentName,
        studentNim,
        studentProdi,
        studentPhone,
        keluhan,
        jadwalId
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      // Sync cache on success
      await syncWithBackend();
      return {
        success: true,
        message: data.message,
        antrian: data.booking
      };
    } else {
      return {
        success: false,
        message: data.message || 'Pendaftaran bimbingan offline ditolak oleh sistem.'
      };
    }
  } catch (e) {
    console.error('Error booking via API:', e);
    return {
      success: false,
      message: 'Gagal terhubung dengan server bimbingan POLINELA.'
    };
  }
}

// Update booking status via API
export async function updateBookingStatusViaApi(bookingId: string, status: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/offline/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      // Refresh cache
      await syncWithBackend();
      return { success: true };
    } else {
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.message || 'Gagal mengubah status antrian.' };
    }
  } catch (e: any) {
    console.error(e);
    return { success: false, message: e.message || 'Gagal terhubung dengan server bimbingan POLINELA.' };
  }
}

// Update offline booking report and status via API
export async function updateOfflineBookingReportViaApi(
  bookingId: string, 
  data: { 
    status: string; 
    catatan_konsultasi: string; 
    hasil_observasi?: string; 
    rekomendasi: string[] 
  }
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/offline/bookings/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      await syncWithBackend();
      return { success: true };
    } else {
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.message || 'Gagal menyimpan laporan bimbingan.' };
    }
  } catch (e: any) {
    console.error(e);
    return { success: false, message: e.message || 'Gagal terhubung dengan server.' };
  }
}

// ---------------------------------------------
// NOTIFICATIONS UTILITIES
// ---------------------------------------------
export async function getNotificationsForUser(userId: string, role: string): Promise<ServerNotification[]> {
  try {
    let url = `/api/offline/notifications?user_id=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`;
    // Fallback for psychologists querying
    if (role === 'psikolog') {
      url = `/api/offline/notifications?psikolog_id=${encodeURIComponent(userId)}`;
    }
    const res = await fetch(url);
    if (res.ok) {
      return await res.json() as ServerNotification[];
    }
  } catch (e) {
    console.warn('Failed fetching notifications:', e);
  }
  return [];
}

export async function createNotificationViaApi(
  userId: string,
  role: 'mahasiswa' | 'psikolog' | 'admin',
  title: string,
  text: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/offline/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role, title, text })
    });
    return res.ok;
  } catch (e) {
    console.warn('Failed creating notification:', e);
    return false;
  }
}

export async function markNotificationAsReadViaApi(notificationId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/offline/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: notificationId })
    });
    return res.ok;
  } catch (e) {
    console.warn('Failed to mark notification as read:', e);
    return false;
  }
}

export async function markAllNotificationsAsReadViaApi(userId: string, role: string): Promise<boolean> {
  try {
    const res = await fetch('/api/offline/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role })
    });
    return res.ok;
  } catch (e) {
    console.warn('Failed to mark all notifications as read:', e);
    return false;
  }
}

export async function getPsychologistNotifications(psikologId: string): Promise<ServerNotification[]> {
  try {
    const res = await fetch(`/api/offline/notifications?psikolog_id=${psikologId}`);
    if (res.ok) {
      return await res.json() as ServerNotification[];
    }
  } catch (e) {
    console.warn('Failed fetching notifications (network issues or server starting up):', e);
  }
  return [];
}

export async function markNotificationsAsRead(psikologId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/offline/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ psikolog_id: psikologId })
    });
    return res.ok;
  } catch (e) {
    console.warn('Failed to mark notifications as read:', e);
    return false;
  }
}

// ---------------------------------------------
// CHAT SERVICES (persistence sync with server json database)
// ---------------------------------------------
export interface ChatMessageApi {
  id: string;
  consultation_id: string;
  sender_id: string;
  receiver_id: string;
  sender_role?: 'mahasiswa' | 'psikolog';
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function fetchAllChatMessages(): Promise<ChatMessageApi[]> {
  try {
    const res = await fetch('/api/chat/messages');
    if (res.ok) {
      return await res.json() as ChatMessageApi[];
    }
  } catch (e) {
    console.warn('Failed fetching chat messages (network may be offline or starting up):', e);
  }
  return [];
}

export async function sendChatMessageViaApi(
  consultationId: string,
  senderId: string,
  receiverId: string,
  senderRole: 'mahasiswa' | 'psikolog',
  message: string
): Promise<{ success: boolean; data?: ChatMessageApi; error?: string }> {
  try {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consultation_id: consultationId,
        sender_id: senderId,
        receiver_id: receiverId,
        sender_role: senderRole,
        message
      })
    });
    if (res.ok) {
      const respJson = await res.json();
      return { success: true, data: respJson.message };
    }
    return { success: false, error: 'Failed to send message.' };
  } catch (e: any) {
    console.error('Failed to send message via API:', e);
    return { success: false, error: e.message || 'Error occurred.' };
  }
}

export async function markChatMessagesAsReadViaApi(
  consultationId: string,
  receiverId: string
): Promise<boolean> {
  try {
    const res = await fetch('/api/chat/messages/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consultation_id: consultationId,
        receiver_id: receiverId
      })
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to mark chat messages as read:', e);
    return false;
  }
}

export async function getRatingsViaApi(): Promise<PenilaianKonsultasi[]> {
  try {
    const res = await fetch('/api/offline/ratings');
    if (res.ok) {
      const list = await res.json() as PenilaianKonsultasi[];
      localStorage.setItem('app_ratings_cache', JSON.stringify(list));
      return list;
    }
  } catch (e) {
    console.warn('Failed to fetch ratings from server, using local storage cache:', e);
  }
  const store = localStorage.getItem('app_ratings_cache');
  if (store) {
    try {
      return JSON.parse(store) as PenilaianKonsultasi[];
    } catch {
      return [];
    }
  }
  return [];
}

export async function submitRatingViaApi(data: {
  id_sesi_konsultasi: string;
  id_mahasiswa: string;
  id_psikolog: string;
  rating: number;
  komentar?: string;
}): Promise<{ success: boolean; message: string; rating?: PenilaianKonsultasi }> {
  try {
    const res = await fetch('/api/offline/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (res.ok && result.success) {
      // Refresh cache
      await getRatingsViaApi();
      return { success: true, message: 'Penilaian berhasil dikirim!', rating: result.rating };
    } else {
      return { success: false, message: result.message || 'Gagal mengirim penilaian.' };
    }
  } catch (e) {
    console.error('Error submitting rating:', e);
    return { success: false, message: 'Gagal terhubung ke server untuk mengirim penilaian.' };
  }
}
