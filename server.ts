import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { readDb, writeDb, checkScheduleConflict, ServerNotification } from "./src/data/serverDb";
import { JadwalOffline, AntrianKonsultasi } from "./src/types";
import * as mysqlDb from "./src/db/mysqlDb";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Dynamic Toggle: switch to MySQL when configured & running, else fall back gracefully
  let useMysql = false;
  mysqlDb.isMysqlConnected()
    .then(connected => {
      useMysql = connected;
      if (connected) {
        console.log("[MySQL] Connection successfully established to database 'e_counseling_polinela'. Using live MySQL engine.");
      } else {
        console.log("[Fallback DB] Local JSON file mechanism active (offline_db_tables.json). No MySQL connection detected.");
      }
    })
    .catch(err => {
      console.warn("[MySQL] Checking connection failed, using local JSON database fallback.", err);
    });

  // ==========================================
  // BACKEND API ENDPOINTS (DATABASE & VALIDATION)
  // ==========================================

  // --- GET ALL SCHEDULES ---
  app.get("/api/offline/schedules", async (req, res) => {
    try {
      if (useMysql) {
        const schedules = await mysqlDb.getSchedules();
        return res.json(schedules);
      }
      const db = readDb();
      res.json(db.jadwal_konsultasi_offline);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- CREATE OR UPDATE SCHEDULE (ADMIN ACTIONS) ---
  app.post("/api/offline/schedules", async (req, res) => {
    try {
      const { id, hari, jam_mulai, jam_selesai, kuota, psikolog_id } = req.body;

      if (!hari || !jam_mulai || !jam_selesai || !kuota || !psikolog_id) {
        return res.status(400).json({ success: false, message: "Semua kolom form harus diisi." });
      }

      if (useMysql) {
        const schedules = await mysqlDb.createOrUpdateSchedule({
          id,
          hari,
          jam_mulai,
          jam_selesai,
          kuota: Number(kuota),
          psikolog_id
        });
        return res.json({ success: true, schedules });
      }

      const db = readDb();
      if (id) {
        // Edit schedule
        db.jadwal_konsultasi_offline = db.jadwal_konsultasi_offline.map(sch => {
          if (sch.id === id) {
            return { ...sch, hari, jam_mulai, jam_selesai, kuota: Number(kuota), psikolog_id };
          }
          return sch;
        });
      } else {
        // Create schedule
        const newSch: JadwalOffline = {
          id: `offline_sch_${Date.now()}`,
          hari,
          jam_mulai,
          jam_selesai,
          kuota: Number(kuota),
          psikolog_id
        };
        db.jadwal_konsultasi_offline.push(newSch);
      }

      writeDb(db);
      res.json({ success: true, schedules: db.jadwal_konsultasi_offline });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- DELETE SCHEDULE ---
  app.delete("/api/offline/schedules/:id", async (req, res) => {
    try {
      const id = req.params.id;

      if (useMysql) {
        const schedules = await mysqlDb.deleteSchedule(id);
        return res.json({ success: true, schedules });
      }

      const db = readDb();
      db.jadwal_konsultasi_offline = db.jadwal_konsultasi_offline.filter(sch => sch.id !== id);
      // Auto cancel / cleanup bookings on deleted schedule
      db.antrian_konsultasi = db.antrian_konsultasi.filter(bk => bk.jadwal_id !== id);

      writeDb(db);
      res.json({ success: true, schedules: db.jadwal_konsultasi_offline });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- GET ALL BOOKINGS ---
  app.get("/api/offline/bookings", async (req, res) => {
    try {
      if (useMysql) {
        const bookings = await mysqlDb.getBookings();
        return res.json(bookings);
      }
      const db = readDb();
      res.json(db.antrian_konsultasi);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- SUBMIT BOOKING (WITH BACKEND & DATABASE-LEVEL RELATIONAL VALIDATION) ---
  app.post("/api/offline/bookings", async (req, res) => {
    try {
      const {
        studentId,
        studentName,
        studentNim,
        studentProdi,
        studentPhone,
        keluhan,
        jadwalId
      } = req.body;

      if (!studentId || !studentName || !studentNim || !studentProdi || !studentPhone || !keluhan || !jadwalId) {
        return res.status(400).json({ success: false, message: "Silakan isi semua data pendaftaran dengan lengkap." });
      }

      if (useMysql) {
        const resp = await mysqlDb.createBooking({
          studentId,
          studentName,
          studentNim,
          studentProdi,
          studentPhone,
          keluhan,
          jadwalId
        });
        if (!resp.success) {
          return res.status(400).json({ success: false, message: resp.message });
        }
        return res.json({
          success: true,
          message: resp.message,
          booking: resp.booking,
          notification: resp.notification
        });
      }

      const db = readDb();

      // 1. Fetch matching schedule
      const targetSchedule = db.jadwal_konsultasi_offline.find(s => s.id === jadwalId);
      if (!targetSchedule) {
        return res.status(404).json({ success: false, message: "Jadwal yang dipilih tidak ditemukan di database." });
      }

      // 2. Validate Quota (Rule 2 + Rule 3)
      const activeBookingsOnJadwal = db.antrian_konsultasi.filter(
        b => b.jadwal_id === jadwalId && b.status !== 'Dibatalkan'
      );
      const sisaKuota = targetSchedule.kuota - activeBookingsOnJadwal.length;

      if (sisaKuota <= 0) {
        return res.status(400).json({
          success: false,
          message: "Kuota konsultasi pada jadwal ini sudah penuh."
        });
      }

      // 3. Database-level Conflict Validation (Rules 5, 6, 7, 8, 9)
      const conflictResult = checkScheduleConflict(
        studentId,
        targetSchedule,
        db.jadwal_konsultasi_offline,
        db.antrian_konsultasi
      );

      if (conflictResult.hasConflict) {
        return res.status(400).json({
          success: false,
          message: conflictResult.message || "Anda sudah memiliki jadwal konsultasi yang bertabrakan dengan jadwal yang dipilih."
        });
      }

      // 4. If all validations pass, create the booking (Rule 4)
      // Generates robust and unique auto-incrementing queue number (no duplicates even after cancellation)
      let maxNum = 0;
      const existingOnJadwal = db.antrian_konsultasi.filter(b => b.jadwal_id === jadwalId);
      for (const b of existingOnJadwal) {
        const match = b.nomor_antrian.match(/A-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
      const nextNum = maxNum + 1;
      const nomorAntrian = `A-${String(nextNum).padStart(3, "0")}`;

      const nowStr = new Date().toISOString();

      const newBooking: AntrianKonsultasi = {
        id: `ak_${Date.now()}`,
        mahasiswa_id: studentId,
        jadwal_id: jadwalId,
        nomor_antrian: nomorAntrian,
        keluhan,
        status: "Terdaftar",
        created_at: nowStr,
        mahasiswa_name: studentName,
        mahasiswa_nim: studentNim,
        mahasiswa_prodi: studentProdi,
        mahasiswa_phone: studentPhone
      };

      db.antrian_konsultasi.push(newBooking);

      // RULE 10: Automatic psychologist notifications creation
      const formattedJadwalText = `${targetSchedule.hari} ${targetSchedule.jam_mulai} - ${targetSchedule.jam_selesai}`;
      const newNotification: ServerNotification = {
        id: `notif_${Date.now()}`,
        psikolog_id: targetSchedule.psikolog_id,
        user_id: studentId,
        role: "psikolog",
        title: "🔔 Pendaftaran Konsultasi Baru",
        text: `Nama Mahasiswa: ${studentName}\nNIM: ${studentNim}\nNomor Antrian: ${nomorAntrian}\nJadwal: ${formattedJadwalText}`,
        created_at: nowStr,
        is_read: false
      };

      db.notifikasi_antrian.push(newNotification);

      // Save database changes cleanly
      writeDb(db);

      res.json({
        success: true,
        message: "Antrian bimbingan offline berhasil didaftarkan!",
        booking: newBooking,
        notification: newNotification
      });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- UPDATE BOOKING STATUS ---
  app.put("/api/offline/bookings/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const { status } = req.body;

      if (useMysql) {
        const bookings = await mysqlDb.updateBooking(id, req.body);
        return res.json({ success: true, bookings });
      }

      const db = readDb();
      const existingBooking = db.antrian_konsultasi.find(bk => bk.id === id);
      
      db.antrian_konsultasi = db.antrian_konsultasi.map(bk => {
        if (bk.id === id) {
          return { ...bk, ...req.body };
        }
        return bk;
      });

      // Send cancelling notification to psychologist if student cancels
      if (status === 'Dibatalkan' && existingBooking) {
        const targetSchedule = db.jadwal_konsultasi_offline.find(s => s.id === existingBooking.jadwal_id);
        if (targetSchedule) {
          const nowStr = new Date().toISOString();
          const newNotification: ServerNotification = {
            id: `notif_${Date.now()}`,
            psikolog_id: targetSchedule.psikolog_id,
            user_id: existingBooking.mahasiswa_id,
            role: "psikolog",
            title: "🔔 Mahasiswa membatalkan antrian konsultasi.",
            text: `Nama Mahasiswa: ${existingBooking.mahasiswa_name}\nNIM: ${existingBooking.mahasiswa_nim}\nNomor Antrian: ${existingBooking.nomor_antrian}\nStatus: Telah dibatalkan oleh Mahasiswa`,
            created_at: nowStr,
            is_read: false
          };
          db.notifikasi_antrian.push(newNotification);
        }
      }

      writeDb(db);
      res.json({ success: true, bookings: db.antrian_konsultasi });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- GET PSYCHOLOGIST NOTIFICATIONS ---
  app.get("/api/offline/notifications", async (req, res) => {
    try {
      const { psikolog_id, user_id, role } = req.query;

      if (useMysql) {
        const list = await mysqlDb.getNotifications({
          psikolog_id: psikolog_id as string,
          user_id: user_id as string,
          role: role as string
        });
        return res.json(list);
      }

      const db = readDb();
      let list = db.notifikasi_antrian || [];
      if (psikolog_id) {
        list = list.filter(n => n.psikolog_id === psikolog_id || n.user_id === psikolog_id);
      } else if (user_id) {
        list = list.filter(n => n.user_id === user_id);
      } else if (role) {
        list = list.filter(n => n.role === role);
      }
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- POST NEW NOTIFICATION ---
  app.post("/api/offline/notifications", async (req, res) => {
    try {
      const { user_id, role, title, text } = req.body;
      if (!user_id || !role || !title || !text) {
        return res.status(400).json({ success: false, message: "Missing required fields: user_id, role, title, text." });
      }

      if (useMysql) {
        const notification = await mysqlDb.createNotification({ user_id, role, title, text });
        return res.json({ success: true, notification });
      }

      const db = readDb();
      const newNotif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id,
        psikolog_id: role === 'psikolog' ? user_id : undefined,
        role,
        title,
        text,
        created_at: new Date().toISOString(),
        is_read: false
      };

      if (!db.notifikasi_antrian) {
        db.notifikasi_antrian = [];
      }

      db.notifikasi_antrian.unshift(newNotif);
      writeDb(db);
      res.json({ success: true, notification: newNotif });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- MARK NOTIFICATIONS AS READ ---
  app.post("/api/offline/notifications/read", async (req, res) => {
    try {
      const { psikolog_id, user_id, role, notification_id } = req.body;

      if (useMysql) {
        await mysqlDb.markNotificationsAsRead({ psikolog_id, user_id, role, notification_id });
        return res.json({ success: true });
      }

      const db = readDb();
      db.notifikasi_antrian = (db.notifikasi_antrian || []).map(n => {
        let match = false;
        if (notification_id && n.id === notification_id) {
          match = true;
        } else if (psikolog_id && (n.psikolog_id === psikolog_id || n.user_id === psikolog_id)) {
          match = true;
        } else if (user_id && n.user_id === user_id) {
          match = true;
        } else if (role && n.role === role) {
          match = true;
        }
        if (match) {
          return { ...n, is_read: true };
        }
        return n;
      });

      writeDb(db);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- GET ALL RATINGS ---
  app.get("/api/offline/ratings", async (req, res) => {
    try {
      if (useMysql) {
        const ratings = await mysqlDb.getRatings();
        return res.json(ratings);
      }
      const db = readDb();
      res.json(db.penilaian_konsultasi || []);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- GET ALL USERS (live MySQL lookup) ---
  app.get("/api/users", async (req, res) => {
    try {
      if (useMysql) {
        const users = await mysqlDb.getUsers();
        return res.json(users);
      }
      res.json([]);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- CREATE OR REGISTER NEW USER ---
  app.post("/api/users", async (req, res) => {
    try {
      const user = req.body;
      if (!user || !user.id || !user.email) {
        return res.status(400).json({ success: false, message: "User ID and Email are required." });
      }
      if (useMysql) {
        await mysqlDb.createOrUpdateUser(user);
        return res.json({ success: true, user });
      }
      res.json({ success: true, message: "MySQL offline fallback." });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- POST NEW RATING/PENILAIAN ---
  app.post("/api/offline/ratings", async (req, res) => {
    try {
      const { id_sesi_konsultasi, id_mahasiswa, id_psikolog, rating, komentar } = req.body;

      if (!id_sesi_konsultasi || !id_mahasiswa || !id_psikolog || !rating) {
        return res.status(400).json({ success: false, message: "Missing required rating fields." });
      }

      if (useMysql) {
        const resp = await mysqlDb.createRating({
          id_sesi_konsultasi,
          id_mahasiswa,
          id_psikolog,
          rating,
          komentar
        });
        if (!resp.success) {
          return res.status(400).json({ success: false, message: resp.message });
        }
        return res.json({ success: true, rating: resp.rating });
      }

      const db = readDb();
      if (!db.penilaian_konsultasi) {
        db.penilaian_konsultasi = [];
      }

      const exists = db.penilaian_konsultasi.some(p => p.id_sesi_konsultasi === id_sesi_konsultasi);
      if (exists) {
        return res.status(400).json({ success: false, message: "Sesi ini sudah diberikan penilaian sebelumnya." });
      }

      const newPenilaian = {
        id_penilaian: `rating_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        id_sesi_konsultasi,
        id_mahasiswa,
        id_psikolog,
        rating: Number(rating),
        komentar: komentar || "",
        tanggal_penilaian: new Date().toISOString()
      };

      db.penilaian_konsultasi.push(newPenilaian);
      writeDb(db);

      res.json({ success: true, rating: newPenilaian });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- GET ALL CHAT MESSAGES ---
  app.get("/api/chat/messages", async (req, res) => {
    try {
      if (useMysql) {
        const messages = await mysqlDb.getChatMessages();
        return res.json(messages);
      }
      const db = readDb();
      res.json(db.chat_messages || []);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- POST NEW CHAT MESSAGE ---
  app.post("/api/chat/messages", async (req, res) => {
    try {
      const { consultation_id, sender_id, receiver_id, sender_role, message } = req.body;

      if (!consultation_id || !sender_id || !receiver_id || !message) {
        return res.status(400).json({ success: false, message: "Missing required chat fields." });
      }

      if (useMysql) {
        const msg = await mysqlDb.createChatMessage({
          consultation_id,
          sender_id,
          receiver_id,
          sender_role: sender_role as any,
          message
        });
        return res.json({ success: true, message: msg });
      }

      const db = readDb();
      const newMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        consultation_id,
        sender_id,
        receiver_id,
        sender_role,
        message,
        is_read: false,
        created_at: new Date().toISOString()
      };

      if (!db.chat_messages) {
        db.chat_messages = [];
      }

      db.chat_messages.push(newMessage);

      // Auto-trigger notification for peer
      const receiverRole = sender_role === 'psikolog' ? 'mahasiswa' : 'psikolog';
      const senderLabel = sender_role === 'psikolog' ? 'Psikolog' : 'Mahasiswa';
      
      const newNotif = {
        id: `notif_chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: receiver_id,
        psikolog_id: receiverRole === 'psikolog' ? receiver_id : undefined,
        role: receiverRole as 'mahasiswa' | 'psikolog',
        title: "Pesan Baru",
        text: `Anda memiliki pesan baru dari ${senderLabel}: ${message.length > 50 ? message.substring(0, 50) + '...' : message}`,
        created_at: new Date().toISOString(),
        is_read: false
      };

      if (!db.notifikasi_antrian) {
        db.notifikasi_antrian = [];
      }
      db.notifikasi_antrian.unshift(newNotif);

      writeDb(db);
      res.json({ success: true, message: newMessage });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- POST MARK MESSAGES AS READ ---
  app.post("/api/chat/messages/read", async (req, res) => {
    try {
      const { consultation_id, receiver_id } = req.body;

      if (!consultation_id || !receiver_id) {
        return res.status(400).json({ success: false, message: "Missing consultation_id or receiver_id." });
      }

      if (useMysql) {
        await mysqlDb.markChatMessagesAsRead(consultation_id, receiver_id);
        return res.json({ success: true });
      }

      const db = readDb();
      if (db.chat_messages) {
        db.chat_messages = db.chat_messages.map(msg => {
          if (msg.consultation_id === consultation_id && msg.receiver_id === receiver_id) {
            return { ...msg, is_read: true };
          }
          return msg;
        });
      }

      writeDb(db);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // ==========================================
  // VITE DEVELOPMENT MIDDLEWARE / PRODUCTION STATIC FILES serving
  // ==========================================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server runs on http://localhost:${PORT}`);
  });
}

startServer();

