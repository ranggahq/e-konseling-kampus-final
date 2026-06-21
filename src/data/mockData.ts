import { User, Psychologist, Article, Consultation, AssessmentQuestion } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'psikolog_1',
    name: 'Dra. Sarah Safitri, M.Psi.',
    email: 'sarah.safitri@konseling.ac.id',
    role: 'psikolog',
    nimOrNip: '198804122015042001',
    password: 'password123',
    prodiOrUnit: 'Layanan Konseling POLINELA',
    phoneNumber: '081987654321',
    gender: 'Perempuan',
    bio: 'Psikolog klinis spesialis kecemasan akademik dan pengembangan diri remaja.'
  },
  {
    id: 'psikolog_2',
    name: 'Rahmat Hidayat, S.Psi., M.Si.',
    email: 'rahmat.hidayat@konseling.ac.id',
    role: 'psikolog',
    nimOrNip: '198501232012011002',
    password: 'password123',
    prodiOrUnit: 'Layanan Konseling POLINELA',
    phoneNumber: '085222333444',
    gender: 'Laki-laki',
    bio: 'Spesialis penanganan stres, depresi ringan, dan manajemen konflik hubungan interpersonal.'
  },
  {
    id: 'psikolog_3',
    name: 'Nisa Amalia, M.Psi., Psikolog',
    email: 'nisa.amalia@konseling.ac.id',
    role: 'psikolog',
    nimOrNip: '199105302020032001',
    password: 'password123',
    prodiOrUnit: 'Layanan Konseling POLINELA',
    phoneNumber: '081233445566',
    gender: 'Perempuan',
    bio: 'Menjalani kehidupan kampus tidak selalu mudah. Saya di sini sebagai telinga yang tulus mendengarkan masalah keluarga, luka masa lalu, dan tuntutan perkuliahan guna merajut kembali rasa damai dalam diri Anda.'
  },
  {
    id: 'admin_1',
    name: 'Admin e-Counseling POLINELA',
    email: 'admin.konseling@polinela.ac.id',
    role: 'admin',
    nimOrNip: '197902152003121001',
    password: 'password123',
    prodiOrUnit: 'Hubungan Kemahasiswaan & Konseling',
    phoneNumber: '082111222333',
    gender: 'Laki-laki'
  }
];

export const INITIAL_PSYCHOLOGISTS: Psychologist[] = [
  {
    id: 'psikolog_1',
    name: 'Dra. Sarah Safitri, M.Psi.',
    email: 'sarah.safitri@konseling.ac.id',
    nip: '198804122015042001',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
    specialties: ['Kecemasan Akademik', 'Self-Esteem', 'Manajemen Stres', 'Quarter-Life Crisis'],
    experienceYears: 8,
    rating: 0,
    reviewsCount: 0,
    availableDays: ['Senin', 'Rabu', 'Kamis'],
    availableHours: ['09:00 - 10:30', '11:00 - 12:30', '14:00 - 15:30'],
    bio: 'Saya Dra. Sarah Safitri, psikolog klinis yang siap mendampingi mahasiswa dalam menghadapi tantangan akademik, masalah kepercayaan diri, dan kebingungan karir/arah hidup di era perkuliahan.'
  },
  {
    id: 'psikolog_2',
    name: 'Rahmat Hidayat, S.Psi., M.Si.',
    email: 'rahmat.hidayat@konseling.ac.id',
    nip: '198501232012011002',
    avatarUrl: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=300&q=80',
    specialties: ['Hubungan Interpersonal', 'Depresi Ringan', 'Adiksi Gawai', 'Insomnia'],
    experienceYears: 11,
    rating: 0,
    reviewsCount: 0,
    availableDays: ['Selasa', 'Kamis', 'Jumat'],
    availableHours: ['08:30 - 10:00', '10:30 - 12:00', '13:30 - 15:00'],
    bio: 'Halo, saya Rahmat Hidayat. Dengan pengalaman lebih dari 10 tahun, saya focus membantu rekan-rekan mahasiswa yang mengalami hambatan dalam relasi sosial, stres adaptasi, serta penurunan kualitas tidur akibat kecemasan berlebih.'
  },
  {
    id: 'psikolog_3',
    name: 'Nisa Amalia, M.Psi., Psikolog',
    email: 'nisa.amalia@konseling.ac.id',
    nip: '199105302020032001',
    avatarUrl: 'https://images.unsplash.com/photo-1594744803329-e58b31de215f?auto=format&fit=crop&w=300&q=80',
    specialties: ['Seni Pengendalian Stres', 'Penerimaan Diri', 'Trauma', 'Masalah Keluarga'],
    experienceYears: 5,
    rating: 0,
    reviewsCount: 0,
    availableDays: ['Senin', 'Selasa', 'Jumat'],
    availableHours: ['09:00 - 10:30', '13:00 - 14:30', '15:00 - 16:30'],
    bio: 'Menjalani kehidupan kampus tidak selalu mudah. Saya di sini sebagai telinga yang tulus mendengarkan masalah keluarga, luka masa lalu, dan tuntutan perkuliahan guna merajut kembali rasa damai dalam diri Anda.'
  }
];

export const INITIAL_ARTICLES: Article[] = [
  {
    id: 'art_1',
    title: 'Seni Mengelola Anxiety dan Rasa Cemas Saat Ujian Semester',
    slug: 'seni-mengelola-anxiety-saat-ujian',
    category: 'Kecemasan',
    excerpt: 'Anxiety sebelum ujian adalah hal wajar. Namun, ketahui teknik pernapasan kotak dan kognitif untuk menenangkan pikiran Anda dalam 5 menit.',
    content: `Kecemasan saat menghadapi ujian (*test anxiety*) adalah fenomena psikologis yang sangat umum dialami oleh mahasiswa. Rasa cemas ini terkadang tidak hanya mengganggu konsentrasi, melainkan juga memicu gejala fisik seperti jantung berdebar-debar, telapak tangan berkeringat, hingga hilangnya memori sementara (*mind blank*).

Mengapa ini terjadi? Secara psikologis, kecemasan adalah respons alamiah tubuh ketika mendeteksi "ancaman"—dalam hal ini, ancaman kegagalan nilai akademik. Namun, jika kecemasan ini dibiarkan berlarut-larut, daya analisis otak depan kita justru akan menurun drastis.

Berikut adalah 3 langkah taktis mengendalikan rasa cemas dengan cepat sebelum masuk ruang ujian:

### 1. Teknik Pernapasan Kotak (Box Breathing)
Teknik ini digunakan oleh personel militer dan tenaga medis darurat untuk memulihkan kejernihan mental dengan cepat:
- Tarik napas dalam-dalam melalui hidung dalam hitungan **4 detik**.
- Tahan napas selama **4 detik**.
- Hembuskan seluruh napas perlahan melalui mulut selama **4 detik**.
- Biarkan paru-paru kosong selama **4 detik**.
- Ulangi siklus ini sebanyak **3-5 kali**. Teknik ini menurunkan hormon kortisol dan mengaktifkan sistem saraf parasimpatis untuk mendinginkan rasa panik.

### 2. Berdamai dengan Skenario Terburuk (Cognitive Reframing)
Ajukan pertanyaan pada diri sendiri: *"Jika skenario terburuk terjadi (misalnya mendapat nilai C), apakah hidup saya akan berakhir?"* Jawabannya tentu tidak. Anda masih bisa mengulang kelas, berkonsultasi dengan dosen, atau memperbaiki nilai di tugas lain. Menyadari bahwa kegagalan akademik bukanlah kiamat bagi eksistensi diri akan langsung memangkas 50% porsi kecemasan Anda.

### 3. Batasi Obrolan Detik-Detik Terakhir
Menjelang ujan, hindari berdiskusi dengan sesama mahasiswa yang sibuk mengulang materi secara panik di koridor. Kepanikan adalah zat psikologis yang sangat menular. Pilihlah pojok koridor yang sepi, pasang penyuara telinga (*earphone*), dengarkan musik yang menenangkan, dan fokuslah pada persiapan batin Anda sendiri.`,
    author: 'Dra. Sarah Safitri, M.Psi.',
    authorRole: 'Psikolog POLINELA',
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80',
    minutesToRead: 4,
    date: '12 Mei 2026',
    likes: 42,
    likedByCurrentUser: false
  },
  {
    id: 'art_2',
    title: 'Mengatasi Burnout Akademik: Ketika Lelah Mental Dikira Malas',
    slug: 'mengatasi-burnout-akademik-mahasiswa',
    category: 'Stres',
    excerpt: 'Tugas menumpuk, organisasi menyita waktu, hingga Anda merasa jemu sepenuhnya? Kenali perbedaan rasa malas biasa dengan burnout psikologis.',
    content: `Banyak mahasiswa merasa sangat bersalah ketika mereka kehilangan motivasi secara total menjelang akhir semester. Mereka sering melabeli dirinya sendiri sebagai "pemalas." Padahal, ada kemungkinan besar yang mereka alami sebenarnya adalah **academic burnout** (kelelahan akademik yang ekstrem).

Burnout bukanlah kemalasan. Kemalasan adalah keengganan untuk bertindak meskipun memiliki kapasitas energi. Sebaliknya, burnout adalah hilangnya kapasitas energi secara fisiologis dan emosional akibat eksploitasi beban stres yang berkepanjangan tanpa waktu pemulihan yang cukup.

### Gejala Utama Academic Burnout
1. **Physical & Emotional Exhaustion**: Merasa lelah sepanjang hari meskipun waktu tidur Anda sudah mencukupi. Bangun pagi dengan rasa enggan yang mendalam untuk pergi ke kampus.
2. **Cynicism & Depersonalization**: Mulai merasa apatis terhadap kegiatan kampus, membenci forum dosen, enggan mengobrol dengan rekan satu divisi organisasi, dan selalu merasa pesimis tentang masa depan perkuliahan.
3. **Reduced Efficacy**: Penurunan kualitas pengerjaan tugas secara drastis, hilangnya rasa bangga saat meraih pencapaian tertentu, dan merasa tidak kompeten.

### Strategi Pemulihan dari Burnout
Mengingat burnout adalah akumulasi kelelahan jangka panjang, menyembuhkannya tidak bisa hanya dengan "tidur siang sehari." Dibutuhkan intervensi hidup yang terstruktur:

- **Lakukan Digital Detox Sejenak**: Matikan notifikasi aplikasi chat kuliah (seperti grup koordinasi tugas) selama 24 jam penuh di akhir pekan. Sampaikan pada teman satu tim bahwa Anda akan *offline* dan baru aktif kembali di hari Senin.
- **Hukum Pareto Stres (Hukum 80-20)**: Tidak semua tugas memerlukan kesempurnaan penuh (100%). Identifikasi 20% tugas utama yang memerlukan dedikasi penuh Anda untuk membuahkan 80% hasil nilai terbesar. Sisanya, kerjakan dengan target standar yang cukup (*good enough*) agar menghemat cadangan energi mental Anda.
- **Sediakan Ruang Katarsis**: Temukan kawan tepercaya yang tidak kompetitif secara akademik untuk mencurahkan keluh kesah Anda tanpa dihakimi, atau buat sesi janji temu gratis dengan Unit Bimbingan Konseling kampus.`,
    author: 'Rahmat Hidayat, S.Psi., M.Si.',
    authorRole: 'Psikolog Pendamping',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
    minutesToRead: 5,
    date: '02 Jun 2026',
    likes: 58,
    likedByCurrentUser: false
  },
  {
    id: 'art_3',
    title: 'Menavigasi Quarter-Life Crisis Sebagai Mahasiswa Tingkat Akhir',
    slug: 'navigasi-quarter-life-crisis-kuliah',
    category: 'Akademik',
    excerpt: 'Pertanyaan "setelah lulus mau ke mana?" seringkali menakutkan. Mari definisikan ulang krisis identitas ini sebagai fase transformasi.',
    content: `Bagi mahasiswa tingkat akhir, kalimat sederhana seperti *"Kapan wisuda?"* atau *"Sudah dapat kerja di mana?"* bisa terasa seolah-olah denda pidana yang mendera kuping. Phase transisi dari bangku kuliah yang terstruktur menuju belantara dunia pasca-kampus yang dipenuhi ketidakpastian seringkali menjadi generator utama **Quarter-Life Crisis (QLC)**.

Pergolakan batin tentang identitas diri, arah masa depan, kelayakan profesional, hingga ketakutan akan tertinggal oleh kesuksesan kawan sealmamater di media sosial adalah karakteristik umum dari QLC ini.

### Mengapa QLC Terjadi di Akhir Perkuliahan?
Selama kurang lebih 16-18 tahun dalam hidup Anda (dari TK hingga kuliah), jalan Anda sudah dipetakan dengan rapi oleh kurikulum. Anda naik kelas setiap tahun, ada silabus jelas, dan targetnya konkrit.

Namun, pasca-kelulusan dari perguruan tinggi, peta tersebut tiba-tiba runtuh. Anda dibiarkan mengemudikan kapal tanpa kompas dan rute yang baku. Kebebasan absolut inilah yang memicu kecemasan eksistensial yang melumpuhkan.

### Tips Praktis Menghadapi QLC Tanpa Hancur
1. **Ganti 'Perbandingan Sosial' dengan 'Inspirasi Terarah'**: Ketika melihat storyLinkedIn teman yang diterima program management trainee di BUMN, hindari menjudge diri sendiri terlambat. Reframing pikiran tersebut: *"Baguslah jika dia bisa, itu berarti pasar kerja untuk prodi kami sedang hangat. Aku bisa mempelajari portofolionya untuk kuterapkan."*
2. **Definisikan Garis Batas Sukses Anda Sendiri**: Sukses tidak selalu harus masuk perusahaan multinasional top di usia 22 tahun. Definisikan sukses secara mikro: *"Sukses tahun ini adalah menyelesaikan bab 4 skripsi, menguasai satu skill digital marketing, dan menjaga kesehatan lambungku."*
3. **Mulai dari Langkah-Langkah Kecil (Micro-actions)**: Alih-alih tenggelam memikirkan karir 10 tahun ke depan yang buram, lakukan micro-action harian. Unduh CV, rapikan portofolio, ikuti webinar persiapan karir, atau jalin obrolan ringan dengan alumni tingkat akhir di platform jejaring kerja.`,
    author: 'Nisa Amalia, M.Psi., Psikolog',
    authorRole: 'Spesialis Karir POLINELA',
    imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80',
    minutesToRead: 6,
    date: '28 Mei 2026',
    likes: 81,
    likedByCurrentUser: false
  }
];

export const INITIAL_CONSULTATIONS: Consultation[] = [];

export const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  { id: 1, text: 'Kurang berminat atau bergairah dalam melakukan hal-hal yang biasanya Anda sukai.' },
  { id: 2, text: 'Merasa murung, sedih, depresi, atau putus asa selama beberapa hari berturut-turut.' },
  { id: 3, text: 'Mengalami kesulitan tidur, sering terbangun di malam hari, atau justru tidur berlebihan.' },
  { id: 4, text: 'Merasa lelah, letih, lesu, atau kekurangan energi hampir setiap hari.' },
  { id: 5, text: 'Nafsu makan menurun drastis, atau sebaliknya, makan berlebihan karena cemas/stres (comfort eating).' },
  { id: 6, text: 'Merasa buruk tentang diri Anda—merasa gagal, menyalahkan diri sendiri, atau mengecewakan keluarga.' },
  { id: 7, text: 'Kesulitan berkonsentrasi pada hal-hal biasa seperti kuliah, mengerjakan tugas, atau membaca buku.' },
  { id: 8, text: 'Bergerak atau berbicara sangat lambat sehingga diperhatikan orang lain, atau sebaliknya, sangat gelisah/tidak bisa tenang.' },
  { id: 9, text: 'Berpikir lebih baik mati atau ingin menyakiti diri dengan cara tertentu.' }
];

export const getAssessmentResult = (score: number): { category: string; description: string; recommendations: string[] } => {
  if (score <= 4) {
    return {
      category: 'Tingkat minimal',
      description: 'Kondisi kesehatan mental Anda tergolong stabil dan sehat. Hambatan emosional yang Anda rasakan kemungkinan besar adalah respon stres wajar sehari-hari.',
      recommendations: [
        'Tetap lakukan aktivitas fisik teratur (misalnya jalan pagi 15 menit).',
        'Pertahankan pola tidur konsisten 7-8 jam per hari.',
        'Sediakan waktu luang harian untuk hobi yang menenangkan diri.'
      ]
    };
  } else if (score <= 9) {
    return {
      category: 'Tingkat ringan',
      description: 'Anda menunjukkan tanda-tanda stres atau kesedihan ringan. Ini adalah sinyal dari tubuh Anda untuk segera beristirahat atau melakukan koping stres.',
      recommendations: [
        'Baca artikel kesadaran diri (self-care) untuk memahami pemicu suasana hati Anda.',
        'Saling berbagi cerita dengan teman dekat tepercaya.',
        'Latih pernapasan relaksasi (box breathing) ketika cemas mulai memuncak.'
      ]
    };
  } else if (score <= 14) {
    return {
      category: 'Tingkat sedang',
      description: 'Suasana hati Anda yang tertekan mulai memengaruhi fungsi produktivitas kuliah dan interaksi sosial Anda. Disarankan untuk mulai waspada dan meluangkan waktu khusus untuk berbenah mental.',
      recommendations: [
        'Sangat disarankan menjadwalkan sesi e-Konseling online dengan praktisi atau psikolog profesional kami.',
        'Batasi perbandingan sosial media dan kurangi tekanan tugas akademis sementara waktu.',
        'Tulis kekhawatiran Anda dalam media jurnal tertulis untuk meredakan kepenuhan pikiran.'
      ]
    };
  } else if (score <= 19) {
    return {
      category: 'Tingkat cukup berat',
      description: 'Anda mengalami tekanan psikologis yang cukup berat. Hal ini dapat menghambat berbagai aktivitas harian dan perkuliahan Anda secara signifikan.',
      recommendations: [
        'Segera buat janji konsultasi (chat atau video) dengan Psikolog klinis di e-Counseling.',
        'Diskusikan dengan orang terdekat yang paling Anda percayai untuk mengurangi ketegangan batin Anda.',
        'Lakukan latihan mindfulness secara rutin untuk membantu menstabilkan emosi.'
      ]
    };
  } else {
    return {
      category: 'Tingkat berat',
      description: 'Tingkat kesedihan, putus asa, dan beban mental Anda berada pada taraf yang berat. Kondisi ini sangat membutuhkan bantuan eksternal secepatnya agar Anda tidak menanggung beban ini sendirian.',
      recommendations: [
        'Segera hubungi Psikolog profesional hari ini melalui e-Counseling POLINELA.',
        'Hubungi kerabat terdekat atau pihak kampus jika terdapat perasaan mendesak untuk menyakiti diri sendiri.',
        'Kami di e-Counseling POLINELA selalu siap mendampingi Anda melewati masa-masa sulit ini.'
      ]
    };
  }
};
