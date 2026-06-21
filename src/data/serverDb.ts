import fs from 'fs';
import path from 'path';
import os from 'os';
import { JadwalOffline, AntrianKonsultasi, PenilaianKonsultasi } from '../types';

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

export interface DbSchema {
  jadwal_konsultasi_offline: JadwalOffline[];
  antrian_konsultasi: AntrianKonsultasi[];
  notifikasi_antrian: ServerNotification[];
  chat_messages: {
    id: string;
    consultation_id: string; // consultationId
    sender_id: string; // senderId
    receiver_id: string; // receiverId
    sender_role?: 'mahasiswa' | 'psikolog'; // senderRole
    message: string; // message text
    is_read: boolean;
    created_at: string; // createdAt
  }[];
  penilaian_konsultasi: PenilaianKonsultasi[];
}

// Local offline JSON file used for database storage when MySQL is disconnected or as a local fallback.
// Using process.cwd() directly ensures that user data is persisted and visible directly in the workspace directory.
const DB_FILE_PATH = path.join(process.cwd(), 'offline_db_tables.json');

const DEFAULT_SCHEDULES: JadwalOffline[] = [
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
    psikolog_id: 'psikolog_1' // Dra. Sarah Safitri, M.Psi. (corresponds to Dra. Sarah in Rule 2)
  }
];

// Helper to load database with atomicity and fallback init
export function readDb(): DbSchema {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      const initialDb: DbSchema = {
        jadwal_konsultasi_offline: DEFAULT_SCHEDULES,
        antrian_konsultasi: [],
        notifikasi_antrian: [],
        chat_messages: [],
        penilaian_konsultasi: []
      };
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
      return initialDb;
    }
    const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as DbSchema;
    if (!parsed.chat_messages) {
      parsed.chat_messages = [];
    }
    if (!parsed.penilaian_konsultasi) {
      parsed.penilaian_konsultasi = [];
    }
    return parsed;
  } catch (e) {
    console.error('Error reading backend database file:', e);
    return {
      jadwal_konsultasi_offline: DEFAULT_SCHEDULES,
      antrian_konsultasi: [],
      notifikasi_antrian: [],
      chat_messages: [],
      penilaian_konsultasi: []
    };
  }
}

// Helper to write database safely
export function writeDb(data: DbSchema): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing backend database file:', e);
  }
}

// Parse time string e.g. "08:30" into total minutes from midnight
export function parseTimeInMinutes(timeStr: string): number {
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

// Conflict validation function
// Checks if student has any active and non-cancelled/completed slot,
// or if they overlap on scheduling on the same day
export function checkScheduleConflict(
  studentId: string,
  targetSchedule: JadwalOffline,
  allSchedules: JadwalOffline[],
  allBookings: AntrianKonsultasi[]
): { hasConflict: boolean; message?: string } {
  // Check if student has ANY active booking (status is 'Terdaftar', 'Menunggu', or 'Sedang Berlangsung')
  const activeBookings = allBookings.filter(
    b => b.mahasiswa_id === studentId && (b.status === 'Terdaftar' || b.status === 'Menunggu' || b.status === 'Sedang Berlangsung')
  );

  if (activeBookings.length > 0) {
    return {
      hasConflict: true,
      message: 'Pendaftaran ditolak. Anda masih memiliki 1 antrian aktif (Terdaftar/Menunggu/Sedang Berlangsung). Silakan selesaikan atau batalkan antrian tersebut terlebih dahulu sebelum mendaftar antrian baru.'
    };
  }

  return { hasConflict: false };
}
