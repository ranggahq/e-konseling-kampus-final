import { query } from './mysqlConn';
import { JadwalOffline, AntrianKonsultasi, PenilaianKonsultasi } from '../types';
import { ServerNotification } from '../data/serverDb';

/**
 * Checks if the MySQL database configuration is set and the connection works.
 */
export async function isMysqlConnected(): Promise<boolean> {
  const host = process.env.DB_HOST || process.env.DATABASE_URL;
  if (!host) {
    console.log("[PostgreSQL Configuration] Menunggu konfigurasi database... Alamat host atau DATABASE_URL belum diatur di file .env.");
    return false;
  }
  try {
    // Attempt raw query to verify database connection is successful
    await query('SELECT 1');
    
    console.log("[PostgreSQL] Sukses terhubung ke database Supabase. Memulai auto-migration...");

    // 1. Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(150) NOT NULL,
        role VARCHAR(50) NOT NULL,
        nim VARCHAR(50) DEFAULT NULL,
        prodi VARCHAR(100) DEFAULT NULL,
        phone VARCHAR(20) DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        avatar_url TEXT DEFAULT NULL,
        gender VARCHAR(50) DEFAULT NULL,
        semester VARCHAR(50) DEFAULT NULL,
        bio TEXT DEFAULT NULL,
        PRIMARY KEY (id)
      )
    `);

    // Ensure avatar_url column exists and is of text type if table was already created in earlier runs
    try {
      await query(`ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT`);
    } catch (migErr: any) {
      try {
        // Fallback for different dialects just in case
        await query(`ALTER TABLE users MODIFY COLUMN avatar_url LONGTEXT`);
      } catch (e2) {
        console.log("[PostgreSQL Migration Warning] Gagal alter column avatar_url (abaikan jika sudah sesuai):", migErr.message);
      }
    }

    // Verify if we need to seed the default users
    const userCountResult: any[] = await query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(userCountResult[0]?.count || '0', 10);
    if (userCount === 0) {
      console.log("[PostgreSQL Seed] Seeding default users to Supabase...");
      await query(`
        INSERT INTO users (id, email, password, name, role, nim, prodi, phone, is_active) VALUES
        ('usr_student_1', 'mahasiswa1@polinela.ac.id', 'password123', 'Budi Santoso', 'mahasiswa', '18051020', 'Manajemen Informatika', '08123456789', TRUE),
        ('usr_student_2', 'mahasiswa2@polinela.ac.id', 'password123', 'Siti Rahma', 'mahasiswa', '18051021', 'Akuntansi Perpajakan', '08572345678', TRUE),
        ('psikolog_1', 'sarah.safitri@konseling.ac.id', 'password123', 'Dra. Sarah Safitri, M.Psi.', 'psikolog', NULL, NULL, '081987654321', TRUE),
        ('psikolog_2', 'rahmat.hidayat@konseling.ac.id', 'password123', 'Rahmat Hidayat, S.Psi., M.Si.', 'psikolog', NULL, NULL, '085222333444', TRUE),
        ('psikolog_3', 'nisa.amalia@konseling.ac.id', 'password123', 'Nisa Amalia, M.Psi., Psikolog', 'psikolog', NULL, NULL, '081233445566', TRUE),
        ('admin_1', 'admin.konseling@polinela.ac.id', 'password123', 'Admin e-Counseling POLINELA', 'admin', NULL, NULL, '082111222333', TRUE)
      `);
    }

    // 2. Create jadwal_konsultasi_offline table
    await query(`
      CREATE TABLE IF NOT EXISTS jadwal_konsultasi_offline (
        id VARCHAR(150) NOT NULL,
        hari VARCHAR(50) NOT NULL,
        jam_mulai VARCHAR(10) NOT NULL,
        jam_selesai VARCHAR(10) NOT NULL,
        kuota INT NOT NULL,
        psikolog_id VARCHAR(150) NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (psikolog_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Verify if we need to seed the offline schedule
    const schCountResult: any[] = await query('SELECT COUNT(*) as count FROM jadwal_konsultasi_offline');
    const schCount = parseInt(schCountResult[0]?.count || '0', 10);
    if (schCount === 0) {
      console.log("[PostgreSQL Seed] Seeding offline schedules...");
      await query(`
        INSERT INTO jadwal_konsultasi_offline (id, hari, jam_mulai, jam_selesai, kuota, psikolog_id) VALUES
        ('sch_1', 'Senin', '09:00', '12:00', 5, 'psikolog_1'),
        ('sch_2', 'Rabu', '13:00', '15:30', 3, 'psikolog_1'),
        ('sch_3', 'Kamis', '10:00', '12:00', 4, 'psikolog_2')
      `);
    }

    // 3. Create antrian_konsultasi table
    await query(`
      CREATE TABLE IF NOT EXISTS antrian_konsultasi (
        id VARCHAR(150) NOT NULL,
        mahasiswa_id VARCHAR(150) NOT NULL,
        jadwal_id VARCHAR(150) NOT NULL,
        nomor_antrian VARCHAR(20) NOT NULL,
        keluhan TEXT NOT NULL,
        status VARCHAR(100) DEFAULT 'Terdaftar',
        created_at VARCHAR(50) NOT NULL,
        mahasiswa_name VARCHAR(150) NOT NULL,
        mahasiswa_nim VARCHAR(50) NOT NULL,
        mahasiswa_prodi VARCHAR(100) NOT NULL,
        mahasiswa_phone VARCHAR(20) NOT NULL,
        catatan_konsultasi TEXT DEFAULT NULL,
        hasil_observasi TEXT DEFAULT NULL,
        rekomendasi TEXT DEFAULT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (mahasiswa_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (jadwal_id) REFERENCES jadwal_konsultasi_offline(id) ON DELETE CASCADE
      )
    `);

    // 4. Create notifikasi_antrian table
    await query(`
      CREATE TABLE IF NOT EXISTS notifikasi_antrian (
        id VARCHAR(150) NOT NULL,
        psikolog_id VARCHAR(150) DEFAULT NULL,
        user_id VARCHAR(150) NOT NULL,
        role VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        text TEXT NOT NULL,
        created_at VARCHAR(50) NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 5. Create chat_messages table
    await query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(150) NOT NULL,
        consultation_id VARCHAR(150) NOT NULL,
        sender_id VARCHAR(150) NOT NULL,
        receiver_id VARCHAR(150) NOT NULL,
        sender_role VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at VARCHAR(50) NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Verify if we need to seed the chat messages
    const msgCountResult: any[] = await query('SELECT COUNT(*) as count FROM chat_messages');
    const msgCount = parseInt(msgCountResult[0]?.count || '0', 10);
    if (msgCount === 0) {
      console.log("[PostgreSQL Seed] Seeding initial chat message...");
      await query(`
        INSERT INTO chat_messages (id, consultation_id, sender_id, receiver_id, sender_role, message, is_read, created_at) VALUES
        ('msg_1', 'sch_1_demo', 'psikolog_1', 'usr_student_1', 'psikolog', 'Halo Budi, ada yang bisa saya bantu hari ini terkait bimbingan akademik maupun kendala pribadi?', TRUE, '2026-06-20T00:01:00.000Z')
      `);
    }

    // 6. Create penilaian_konsultasi table
    await query(`
      CREATE TABLE IF NOT EXISTS penilaian_konsultasi (
        id_penilaian VARCHAR(150) NOT NULL,
        id_sesi_konsultasi VARCHAR(150) NOT NULL,
        id_mahasiswa VARCHAR(150) NOT NULL,
        id_psikolog VARCHAR(150) NOT NULL,
        rating INT NOT NULL,
        komentar TEXT,
        tanggal_penilaian VARCHAR(50) NOT NULL,
        PRIMARY KEY (id_penilaian),
        FOREIGN KEY (id_mahasiswa) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (id_psikolog) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log("[PostgreSQL] Sukses: Auto-migration diselesaikan tanpa ada kendala.");
    return true;
  } catch (error: any) {
    console.warn('[PostgreSQL] Koneksi atau pembuatan tabel database Supabase gagal. Pastikan konfigurasi DATABASE_URL benar.', error.message || error);
    return false;
  }
}

// Map database column conversions if necessary
function mapBoolean(val: any): boolean {
  if (val === true || val === 1 || val === '1' || val === 'true') return true;
  return false;
}

// 1. GET ALL SCHEDULES
export async function getSchedules(): Promise<JadwalOffline[]> {
  const rows = await query('SELECT * FROM jadwal_konsultasi_offline');
  return rows.map((r: any) => ({
    id: r.id,
    hari: r.hari,
    jam_mulai: r.jam_mulai,
    jam_selesai: r.jam_selesai,
    kuota: Number(r.kuota),
    psikolog_id: r.psikolog_id
  }));
}

// 2. CREATE OR UPDATE SCHEDULE
export async function createOrUpdateSchedule(data: {
  id?: string;
  hari: string;
  jam_mulai: string;
  jam_selesai: string;
  kuota: number;
  psikolog_id: string;
}): Promise<JadwalOffline[]> {
  if (data.id) {
    const sql = `
      UPDATE jadwal_konsultasi_offline 
      SET hari = ?, jam_mulai = ?, jam_selesai = ?, kuota = ?, psikolog_id = ?
      WHERE id = ?
    `;
    await query(sql, [data.hari, data.jam_mulai, data.jam_selesai, data.kuota, data.psikolog_id, data.id]);
  } else {
    const generatedId = `offline_sch_${Date.now()}`;
    const sql = `
      INSERT INTO jadwal_konsultasi_offline (id, hari, jam_mulai, jam_selesai, kuota, psikolog_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await query(sql, [generatedId, data.hari, data.jam_mulai, data.jam_selesai, data.kuota, data.psikolog_id]);
  }
  return getSchedules();
}

// 3. DELETE SCHEDULE
export async function deleteSchedule(id: string): Promise<JadwalOffline[]> {
  // Cascading handles bookings & notifications, but we perform safe deletions
  await query('DELETE FROM antrian_konsultasi WHERE jadwal_id = ?', [id]);
  await query('DELETE FROM jadwal_konsultasi_offline WHERE id = ?', [id]);
  return getSchedules();
}

// 4. GET ALL BOOKINGS
export async function getBookings(): Promise<AntrianKonsultasi[]> {
  const rows = await query('SELECT * FROM antrian_konsultasi ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    mahasiswa_id: r.mahasiswa_id,
    jadwal_id: r.jadwal_id,
    nomor_antrian: r.nomor_antrian,
    keluhan: r.keluhan,
    status: r.status,
    created_at: r.created_at,
    mahasiswa_name: r.mahasiswa_name,
    mahasiswa_nim: r.mahasiswa_nim,
    mahasiswa_prodi: r.mahasiswa_prodi,
    mahasiswa_phone: r.mahasiswa_phone,
    catatan_konsultasi: r.catatan_konsultasi || '',
    hasil_observasi: r.hasil_observasi || '',
    rekomendasi: (() => {
      if (!r.rekomendasi) return [];
      try {
        if (typeof r.rekomendasi === 'string') {
          const parsed = JSON.parse(r.rekomendasi);
          return Array.isArray(parsed) ? parsed : [r.rekomendasi];
        }
        return Array.isArray(r.rekomendasi) ? r.rekomendasi : [r.rekomendasi];
      } catch (e) {
        return [r.rekomendasi];
      }
    })()
  }));
}

// 5. UPDATE BOOKING STATUS
export async function updateBooking(id: string, updateData: Partial<AntrianKonsultasi>): Promise<AntrianKonsultasi[]> {
  const fields: string[] = [];
  const params: any[] = [];

  if (updateData.status) {
    fields.push('status = ?');
    params.push(updateData.status);
  }
  if (updateData.keluhan) {
    fields.push('keluhan = ?');
    params.push(updateData.keluhan);
  }
  if (updateData.nomor_antrian) {
    fields.push('nomor_antrian = ?');
    params.push(updateData.nomor_antrian);
  }
  if (updateData.catatan_konsultasi !== undefined) {
    fields.push('catatan_konsultasi = ?');
    params.push(updateData.catatan_konsultasi);
  }
  if (updateData.hasil_observasi !== undefined) {
    fields.push('hasil_observasi = ?');
    params.push(updateData.hasil_observasi);
  }
  if (updateData.rekomendasi !== undefined) {
    fields.push('rekomendasi = ?');
    params.push(Array.isArray(updateData.rekomendasi) ? JSON.stringify(updateData.rekomendasi) : JSON.stringify([]));
  }

  if (fields.length > 0) {
    params.push(id);
    const sql = `UPDATE antrian_konsultasi SET ${fields.join(', ')} WHERE id = ?`;
    await query(sql, params);
  }

  // Handle addition of notification if booking got cancelled
  if (updateData.status === 'Dibatalkan') {
    const bookingRows = await query('SELECT * FROM antrian_konsultasi WHERE id = ?', [id]);
    if (bookingRows.length > 0) {
      const bk = bookingRows[0];
      const scheduleRows = await query('SELECT * FROM jadwal_konsultasi_offline WHERE id = ?', [bk.jadwal_id]);
      if (scheduleRows.length > 0) {
        const sch = scheduleRows[0];
        const notifId = `notif_${Date.now()}`;
        const insertNotifSql = `
          INSERT INTO notifikasi_antrian (id, psikolog_id, user_id, role, title, text, created_at, is_read)
          VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
        `;
        await query(insertNotifSql, [
          notifId,
          sch.psikolog_id,
          bk.mahasiswa_id,
          'psikolog',
          '🔔 Mahasiswa membatalkan antrian konsultasi.',
          `Nama Mahasiswa: ${bk.mahasiswa_name}\nNIM: ${bk.mahasiswa_nim}\nNomor Antrian: ${bk.nomor_antrian}\nStatus: Telah dibatalkan oleh Mahasiswa`,
          new Date().toISOString()
        ]);
      }
    }
  }

  return getBookings();
}

// 6. CREATE OFFLINE BOOKING WITH VALIDATION
export async function createBooking(data: {
  studentId: string;
  studentName: string;
  studentNim: string;
  studentProdi: string;
  studentPhone: string;
  keluhan: string;
  jadwalId: string;
}): Promise<{ success: boolean; message: string; booking?: AntrianKonsultasi; notification?: ServerNotification }> {
  // A. Check student conflict (Rule 5+6) -> Active bookings cannot exceed 1
  const activeBookings: any[] = await query(`
    SELECT * FROM antrian_konsultasi 
    WHERE mahasiswa_id = ? AND status IN ('Terdaftar', 'Menunggu', 'Sedang Berlangsung')
  `, [data.studentId]);

  if (activeBookings.length > 0) {
    return {
      success: false,
      message: 'Pendaftaran ditolak. Anda masih memiliki 1 antrian aktif (Terdaftar/Menunggu/Sedang Berlangsung). Silakan selesaikan atau batalkan antrian tersebut terlebih dahulu sebelum mendaftar antrian baru.'
    };
  }

  // B. Get target schedule details
  const scheduleRows: any[] = await query('SELECT * FROM jadwal_konsultasi_offline WHERE id = ?', [data.jadwalId]);
  if (scheduleRows.length === 0) {
    return { success: false, message: 'Jadwal yang dipilih tidak ditemukan di database.' };
  }
  const schedule = scheduleRows[0];

  // C. Calculate available slot quota (Rule 2+3)
  const bookingCountResult: any[] = await query(`
    SELECT COUNT(*) as count FROM antrian_konsultasi 
    WHERE jadwal_id = ? AND status != 'Dibatalkan'
  `, [data.jadwalId]);
  const currentCount = bookingCountResult[0].count;

  if (currentCount >= schedule.kuota) {
    return { success: false, message: 'Kuota konsultasi pada jadwal ini sudah penuh.' };
  }

  // D. Generate consecutive queue number (e.g. A-001)
  const maxQueueRows: any[] = await query(`
    SELECT nomor_antrian FROM antrian_konsultasi 
    WHERE jadwal_id = ? ORDER BY id DESC LIMIT 1
  `, [data.jadwalId]);
  let maxNum = 0;
  if (maxQueueRows.length > 0) {
    const match = maxQueueRows[0].nomor_antrian.match(/A-(\d+)/);
    if (match) {
      maxNum = parseInt(match[1], 10);
    }
  }
  const nextNum = maxNum + 1;
  const nomorAntrian = `A-${String(nextNum).padStart(3, '0')}`;

  const bookingId = `ak_${Date.now()}`;
  const nowStr = new Date().toISOString();

  // E. Insert booking
  const insertBookingSql = `
    INSERT INTO antrian_konsultasi (
      id, mahasiswa_id, jadwal_id, nomor_antrian, keluhan, status, created_at,
      mahasiswa_name, mahasiswa_nim, mahasiswa_prodi, mahasiswa_phone
    ) VALUES (?, ?, ?, ?, ?, 'Terdaftar', ?, ?, ?, ?, ?)
  `;
  await query(insertBookingSql, [
    bookingId, data.studentId, data.jadwalId, nomorAntrian, data.keluhan, nowStr,
    data.studentName, data.studentNim, data.studentProdi, data.studentPhone
  ]);

  // F. Insert psychologist notification (Rule 10)
  const notifId = `notif_${Date.now()}`;
  const formattedJadwalText = `${schedule.hari} ${schedule.jam_mulai} - ${schedule.jam_selesai}`;
  const insertNotifSql = `
    INSERT INTO notifikasi_antrian (id, psikolog_id, user_id, role, title, text, created_at, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
  `;
  await query(insertNotifSql, [
    notifId,
    schedule.psikolog_id,
    data.studentId, // sender/user id
    'psikolog',
    '🔔 Pendaftaran Konsultasi Baru',
    `Nama Mahasiswa: ${data.studentName}\nNIM: ${data.studentNim}\nNomor Antrian: ${nomorAntrian}\nJadwal: ${formattedJadwalText}`,
    nowStr
  ]);

  const newBooking: AntrianKonsultasi = {
    id: bookingId,
    mahasiswa_id: data.studentId,
    jadwal_id: data.jadwalId,
    nomor_antrian: nomorAntrian,
    keluhan: data.keluhan,
    status: 'Terdaftar',
    created_at: nowStr,
    mahasiswa_name: data.studentName,
    mahasiswa_nim: data.studentNim,
    mahasiswa_prodi: data.studentProdi,
    mahasiswa_phone: data.studentPhone
  };

  const newNotification: ServerNotification = {
    id: notifId,
    psikolog_id: schedule.psikolog_id,
    user_id: data.studentId,
    role: 'psikolog',
    title: '🔔 Pendaftaran Konsultasi Baru',
    text: `Nama Mahasiswa: ${data.studentName}\nNIM: ${data.studentNim}\nNomor Antrian: ${nomorAntrian}\nJadwal: ${formattedJadwalText}`,
    created_at: nowStr,
    is_read: false
  };

  return {
    success: true,
    message: 'Antrian bimbingan offline berhasil didaftarkan!',
    booking: newBooking,
    notification: newNotification
  };
}

// 7. GET NOTIFICATIONS
export async function getNotifications(queryFilters: {
  psikolog_id?: string;
  user_id?: string;
  role?: string;
}): Promise<ServerNotification[]> {
  let sql = 'SELECT * FROM notifikasi_antrian';
  const conditions: string[] = [];
  const params: any[] = [];

  if (queryFilters.psikolog_id) {
    conditions.push('(psikolog_id = ? OR user_id = ?)');
    params.push(queryFilters.psikolog_id, queryFilters.psikolog_id);
  } else if (queryFilters.user_id) {
    conditions.push('user_id = ?');
    params.push(queryFilters.user_id);
  } else if (queryFilters.role) {
    conditions.push('role = ?');
    params.push(queryFilters.role);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at DESC';

  const rows = await query(sql, params);
  return rows.map((r: any) => ({
    id: r.id,
    psikolog_id: r.psikolog_id,
    user_id: r.user_id,
    role: r.role,
    title: r.title,
    text: r.text,
    created_at: r.created_at,
    is_read: mapBoolean(r.is_read)
  }));
}

// 8. CREATE MANUAL NOTIFICATION
export async function createNotification(data: {
  user_id: string;
  role: string;
  title: string;
  text: string;
}): Promise<ServerNotification> {
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const nowStr = new Date().toISOString();
  const isPsikolog = data.role === 'psikolog';

  const sql = `
    INSERT INTO notifikasi_antrian (id, psikolog_id, user_id, role, title, text, created_at, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
  `;
  await query(sql, [
    notifId,
    isPsikolog ? data.user_id : null,
    data.user_id,
    data.role,
    data.title,
    data.text,
    nowStr
  ]);

  return {
    id: notifId,
    psikolog_id: isPsikolog ? data.user_id : undefined,
    user_id: data.user_id,
    role: data.role as any,
    title: data.title,
    text: data.text,
    created_at: nowStr,
    is_read: false
  };
}

// 9. MARK NOTIFICATIONS AS READ
export async function markNotificationsAsRead(filters: {
  notification_id?: string;
  psikolog_id?: string;
  user_id?: string;
  role?: string;
}): Promise<void> {
  let sql = 'UPDATE notifikasi_antrian SET is_read = TRUE';
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.notification_id) {
    conditions.push('id = ?');
    params.push(filters.notification_id);
  } else if (filters.psikolog_id) {
    conditions.push('(psikolog_id = ? OR user_id = ?)');
    params.push(filters.psikolog_id, filters.psikolog_id);
  } else if (filters.user_id) {
    conditions.push('user_id = ?');
    params.push(filters.user_id);
  } else if (filters.role) {
    conditions.push('role = ?');
    params.push(filters.role);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
    await query(sql, params);
  }
}

// 10. GET RATINGS
export async function getRatings(): Promise<any[]> {
  const rows = await query('SELECT * FROM penilaian_konsultasi ORDER BY tanggal_penilaian DESC');
  return rows.map((r: any) => ({
    id_penilaian: r.id_penilaian,
    id_sesi_konsultasi: r.id_sesi_konsultasi,
    id_mahasiswa: r.id_mahasiswa,
    id_psikolog: r.id_psikolog,
    rating: Number(r.rating),
    komentar: r.komentar,
    tanggal_penilaian: r.tanggal_penilaian
  }));
}

// 11. SUBMIT RATING
export async function createRating(data: {
  id_sesi_konsultasi: string;
  id_mahasiswa: string;
  id_psikolog: string;
  rating: number;
  komentar?: string;
}): Promise<{ success: boolean; message: string; rating?: any }> {
  // Check duplicate rating (Rule 12 Check)
  const existingRecords: any[] = await query(
    'SELECT * FROM penilaian_konsultasi WHERE id_sesi_konsultasi = ?',
    [data.id_sesi_konsultasi]
  );
  if (existingRecords.length > 0) {
    return { success: false, message: 'Sesi ini sudah diberikan penilaian sebelumnya.' };
  }

  const generatedId = `rating_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowStr = new Date().toISOString();

  const sql = `
    INSERT INTO penilaian_konsultasi (id_penilaian, id_sesi_konsultasi, id_mahasiswa, id_psikolog, rating, komentar, tanggal_penilaian)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  await query(sql, [
    generatedId,
    data.id_sesi_konsultasi,
    data.id_mahasiswa,
    data.id_psikolog,
    data.rating,
    data.komentar || '',
    nowStr
  ]);

  return {
    success: true,
    message: 'Review rating submitted!',
    rating: {
      id_penilaian: generatedId,
      id_sesi_konsultasi: data.id_sesi_konsultasi,
      id_mahasiswa: data.id_mahasiswa,
      id_psikolog: data.id_psikolog,
      rating: data.rating,
      komentar: data.komentar || '',
      tanggal_penilaian: nowStr
    }
  };
}

// 12. GET CHAT MESSAGES
export async function getChatMessages(): Promise<any[]> {
  const rows = await query('SELECT * FROM chat_messages ORDER BY created_at ASC');
  return rows.map((r: any) => ({
    id: r.id,
    consultation_id: r.consultation_id,
    sender_id: r.sender_id,
    receiver_id: r.receiver_id,
    sender_role: r.sender_role,
    message: r.message,
    is_read: mapBoolean(r.is_read),
    created_at: r.created_at
  }));
}

// 13. SEND CHAT MESSAGE
export async function createChatMessage(data: {
  consultation_id: string;
  sender_id: string;
  receiver_id: string;
  sender_role: 'mahasiswa' | 'psikolog';
  message: string;
}): Promise<any> {
  const generatedId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowStr = new Date().toISOString();

  const sql = `
    INSERT INTO chat_messages (id, consultation_id, sender_id, receiver_id, sender_role, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, FALSE, ?)
  `;
  await query(sql, [
    generatedId,
    data.consultation_id,
    data.sender_id,
    data.receiver_id,
    data.sender_role,
    data.message,
    nowStr
  ]);

  // Insert notification for receiver
  const receiverRole = data.sender_role === 'psikolog' ? 'mahasiswa' : 'psikolog';
  const senderLabel = data.sender_role === 'psikolog' ? 'Psikolog' : 'Mahasiswa';
  const textBody = `Anda memiliki pesan baru dari ${senderLabel}: ${data.message.length > 50 ? data.message.substring(0, 50) + '...' : data.message}`;

  const notifId = `notif_chat_${Date.now()}`;
  const insertNotifSql = `
    INSERT INTO notifikasi_antrian (id, psikolog_id, user_id, role, title, text, created_at, is_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
  `;
  await query(insertNotifSql, [
    notifId,
    receiverRole === 'psikolog' ? data.receiver_id : null,
    data.receiver_id,
    receiverRole,
    'Pesan Baru',
    textBody,
    nowStr
  ]);

  return {
    id: generatedId,
    consultation_id: data.consultation_id,
    sender_id: data.sender_id,
    receiver_id: data.receiver_id,
    sender_role: data.sender_role,
    message: data.message,
    is_read: false,
    created_at: nowStr
  };
}

// 14. MARK CHAT MESSAGES AS READ
export async function markChatMessagesAsRead(consultationId: string, receiverId: string): Promise<void> {
  const sql = `
    UPDATE chat_messages 
    SET is_read = TRUE 
    WHERE consultation_id = ? AND receiver_id = ?
  `;
  await query(sql, [consultationId, receiverId]);
}

// 15. GET ALL USERS
export async function getUsers(): Promise<any[]> {
  try {
    const rows = await query('SELECT * FROM users');
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      nimOrNip: r.nim || '',
      password: r.password,
      phoneNumber: r.phone || '',
      prodiOrUnit: r.prodi || '',
      status: r.is_active === 1 || r.is_active === true || r.is_active === '1' ? 'aktif' : 'nonaktif',
      avatarUrl: r.avatar_url || '',
      gender: r.gender || 'Laki-laki',
      semester: r.semester || '1',
      bio: r.bio || (r.role === 'mahasiswa' ? 'Mahasiswa aktif Politeknik Negeri Lampung.' : 'Staff/Psikolog e-Counseling POLINELA.')
    }));
  } catch (error) {
    console.error('[MySQL Error] failed to get users:', error);
    return [];
  }
}

// 16. CREATE OR UPDATE USER
export async function createOrUpdateUser(user: any): Promise<any> {
  try {
    const isActive = !(user.status === 'nonaktif' || user.status === 'inactive');
    const nimVal = user.nimOrNip || null;
    const prodiVal = user.prodiOrUnit || null;
    const phoneVal = user.phoneNumber || null;
    const avatarVal = user.avatarUrl || null;
    const genderVal = user.gender || 'Laki-laki';
    const semesterVal = user.semester || '1';
    const bioVal = user.bio || (user.role === 'mahasiswa' ? 'Mahasiswa aktif Politeknik Negeri Lampung.' : 'Staff/Psikolog e-Counseling POLINELA.');
    
    // Check if user exists using id or email
    const existing = await query('SELECT id FROM users WHERE id = ? OR email = ?', [user.id, user.email]);
    if (existing && existing.length > 0) {
      // update
      const targetId = existing[0].id;
      const sql = `
        UPDATE users 
        SET email = ?, password = ?, name = ?, role = ?, nim = ?, prodi = ?, phone = ?, is_active = ?, avatar_url = ?, gender = ?, semester = ?, bio = ?
        WHERE id = ?
      `;
      await query(sql, [user.email, user.password || 'password123', user.name, user.role, nimVal, prodiVal, phoneVal, isActive, avatarVal, genderVal, semesterVal, bioVal, targetId]);
    } else {
      // insert
      const sql = `
        INSERT INTO users (id, email, password, name, role, nim, prodi, phone, is_active, avatar_url, gender, semester, bio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await query(sql, [user.id, user.email, user.password || 'password123', user.name, user.role, nimVal, prodiVal, phoneVal, isActive, avatarVal, genderVal, semesterVal, bioVal]);
    }
    return user;
  } catch (error) {
    console.error('[MySQL Error] failed to create/update user:', error);
    throw error;
  }
}

