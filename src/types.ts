export type UserRole = 'mahasiswa' | 'psikolog' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  nimOrNip: string; // NIM for Student, NIP for Psychologist/Admin
  password?: string; // Standard or custom password
  avatarUrl?: string;
  phoneNumber?: string;
  gender?: string;
  prodiOrUnit?: string; // Study program (Mahasiswa) or Unit/Department (Admin/Psychologist)
  bio?: string;
  semester?: string; // Semester for student (mahasiswa)
  specialties?: string[]; // Specialties for psychologist
  status?: string; // Active/Inactive/Nonaktif status
  mustResetPassword?: boolean; // Forced to change password on login
}

export interface Psychologist {
  id: string; // Maps to User.id
  name: string;
  email: string;
  nip: string;
  avatarUrl: string;
  specialties: string[];
  experienceYears: number;
  rating: number;
  reviewsCount: number;
  availableDays: string[]; // e.g. ["Senin", "Rabu", "Jumat"]
  availableHours: string[]; // e.g. ["09:00 - 10:30", "13:00 - 14:30"]
  bio: string;
}

export type ConsultationStatus = 'pending' | 'approved' | 'scheduled' | 'ongoing' | 'completed' | 'cancelled' | 'rejected' | 'CHAT_AKTIF' | 'SEDANG_BERLANGSUNG' | 'SELESAI' | 'MENUNGGU_JADWAL' | 'diarsipkan';
export type ConsultationType = 'chat' | 'video';

export interface Consultation {
  id: string;
  studentId: string;
  studentName: string;
  studentNim: string;
  studentPhone?: string;
  studentWhatsapp?: string;
  psychologistId: string;
  psychologistName: string;
  psychologistAvatar: string;
  
  // Database compatibility relational fields
  consultation_id?: string;
  mahasiswa_id?: string;
  psikolog_id?: string;
  date: string; // YYYY-MM-DD
  timeSlot: string;
  status: ConsultationStatus;
  type: ConsultationType;
  symptoms: string; // Keluhan utama
  symptomDuration: string; // Lama keluhan (e.g., "1-2 minggu")
  notes?: string; // Catatan tambahan (opsional)
  rejectionReason?: string; // If status is 'rejected'
  diagnosisNotes?: string; // Feedback/summary from Psychologist
  recommendations?: string[]; // Recommended steps/action plan
  updatedAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  consultationId: string;
  senderId: string;
  receiverId: string;
  senderRole: 'mahasiswa' | 'psikolog';
  text: string;
  createdAt: string; // created_at
  updatedAt: string; // updated_at
  isRead: boolean; // is_read
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: 'Stres' | 'Kecemasan' | 'Depresi' | 'Relationship' | 'Akademik' | 'Self-Care';
  author: string;
  authorRole: string;
  imageUrl: string;
  minutesToRead: number;
  date: string; // DD MMM YYYY
  likes: number;
  likedByCurrentUser?: boolean;
  status?: 'Draft' | 'Publish';
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Optional Self-Assessment / Wellness test (Kuesioner PHQ-9)
export interface AssessmentQuestion {
  id: number;
  text: string;
}

export interface AssessmentResult {
  score: number;
  category: 'Sangat Baik' | 'Ringan' | 'Sedang' | 'Berat';
  description: string;
  recommendations: string[];
}

export interface JadwalOffline {
  id: string;
  hari: string;
  jam_mulai: string;
  jam_selesai: string;
  kuota: number;
  psikolog_id: string;
  psikolog_name?: string;
}

export interface AntrianKonsultasi {
  id: string;
  mahasiswa_id: string;
  jadwal_id: string;
  nomor_antrian: string;
  keluhan: string;
  status: 'Terdaftar' | 'Menunggu' | 'Sedang Berlangsung' | 'Selesai' | 'Dibatalkan' | 'TERDAFTAR' | 'CHECK_IN' | 'SEDANG_BERLANGSUNG' | 'SELESAI' | 'DIBATALKAN' | 'DITOLAK' | 'rejected';
  created_at: string;
  mahasiswa_name?: string;
  mahasiswa_nim?: string;
  mahasiswa_prodi?: string;
  mahasiswa_phone?: string;
  psikolog_id?: string;
  psikolog_name?: string;
  catatan_konsultasi?: string;
  hasil_observasi?: string;
  rekomendasi?: string[];
}

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

export interface PenilaianKonsultasi {
  id_penilaian: string;
  id_sesi_konsultasi: string;
  id_mahasiswa: string;
  id_psikolog: string;
  rating: number;
  komentar?: string;
  tanggal_penilaian: string;
}


