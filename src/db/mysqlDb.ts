import { query } from './mysqlConn';
import { JadwalOffline, AntrianKonsultasi, PenilaianKonsultasi } from '../types';
import { ServerNotification } from '../data/serverDb';

/**
 * Checks if the MySQL database configuration is set and the connection works.
 */
export async function isMysqlConnected(): Promise<boolean> {
  const host = process.env.DB_HOST;
  if (!host) {
    console.log("[MySQL Configuration] Menunggu konfigurasi MySQL... Variabel DB_HOST belum diatur di file .env.");
    return false;
  }
  try {
    // Attempt raw query to verify users table exists and connection is successful
    await query('SELECT 1');
    
    // Dynamically upgrade status column in antrian_konsultasi to VARCHAR(100) to support CHECK_IN, SEDANG_BERLANGSUNG, etc.
    try {
      await query("ALTER TABLE antrian_konsultasi MODIFY COLUMN status VARCHAR(100) DEFAULT 'Terdaftar'");
      console.log("[MySQL Upgrade] Success: antrian_konsultasi status column altered to VARCHAR(100)");
    } catch (e: any) {
      console.warn("[MySQL Upgrade] Could not alter antrian_konsultasi status column:", e.message);
    }

    // Dynamically add columns for consultations (clinical notes, observasi, rekomendasi) if they don't exist
    try {
      await query("ALTER TABLE antrian_konsultasi ADD COLUMN catatan_konsultasi TEXT NULL");
      console.log("[MySQL Upgrade] Success: added catatan_konsultasi column.");
    } catch (e: any) {
      // column may already exist
    }

    try {
      await query("ALTER TABLE antrian_konsultasi ADD COLUMN hasil_observasi TEXT NULL");
      console.log("[MySQL Upgrade] Success: added hasil_observasi column.");
    } catch (e: any) {
      // column may already exist
    }

    try {
      await query("ALTER TABLE antrian_konsultasi ADD COLUMN rekomendasi TEXT NULL");
      console.log("[MySQL Upgrade] Success: added rekomendasi column.");
    } catch (e: any) {
      // column may already exist
    }

    // Dynamically add columns for user profile customization (avatar_url, gender, semester, bio) if they don't exist
    try {
      await query("ALTER TABLE users ADD COLUMN avatar_url LONGTEXT NULL");
      console.log("[MySQL Upgrade] Success: added users.avatar_url column.");
    } catch (e: any) {
      // already exists
    }

    // Ensure it is LONGTEXT if it was previously created as VARCHAR
    try {
      await query("ALTER TABLE users MODIFY COLUMN avatar_url LONGTEXT NULL");
      console.log("[MySQL Upgrade] Success: modified users.avatar_url to LONGTEXT.");
    } catch (e: any) {
      console.warn("[MySQL Upgrade] Could not modify users.avatar_url to LONGTEXT:", e.message);
    }

    try {
      await query("ALTER TABLE users ADD COLUMN gender VARCHAR(50) NULL");
      console.log("[MySQL Upgrade] Success: added users.gender column.");
    } catch (e: any) {
      // already exists
    }

    try {
      await query("ALTER TABLE users ADD COLUMN semester VARCHAR(50) NULL");
      console.log("[MySQL Upgrade] Success: added users.semester column.");
    } catch (e: any) {
      // already exists
    }

    try {
      await query("ALTER TABLE users ADD COLUMN bio TEXT NULL");
      console.log("[MySQL Upgrade] Success: added users.bio column.");
    } catch (e: any) {
      // already exists
    }

    return true;
  } catch (error: any) {
    console.warn('[MySQL] Koneksi atau verifikasi database gagal. Silakan jalankan MySQL di XAMPP/Laragon dan buat database serta tabelnya.', error.message || error);
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
    const isActive = user.status === 'nonaktif' || user.status === 'inactive' ? 0 : 1;
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

