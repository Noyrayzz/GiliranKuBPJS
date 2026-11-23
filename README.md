# GiliranKuBPJS — tiket antrean digital untuk kunjungan BPJS

Aplikasi web untuk kunjungan rawat jalan BPJS: satu tiket mengikuti pasien melalui
**pendaftaran → poli → farmasi**, dan pasien memantau status, posisi antrean, serta
kesiapan obat dari satu tautan tanpa memasang aplikasi.

PRD dan rencana proyek: `/home/kelvin/planning/giliranku-bpjs/.planning/PRD.md`.

## Menjalankan

Prasyarat: Node 22 (`/home/kelvin/.local/opt/node22/bin`), pnpm, Docker.

```bash
cd /home/kelvin/code/GiliranKuBPJS
docker compose up -d db        # PostgreSQL 16 di 127.0.0.1:55432 (kontainer giliranku-db)
pnpm install
pnpm db:migrate                # idempoten: aman dijalankan berulang
pnpm db:seed                   # data demo tiruan; juga idempoten
pnpm build
pnpm start                     # http://127.0.0.1:8090
```

Bila `node` di PATH bukan v22, jalankan lewat pembungkus yang menyiapkan PATH:
`./start.sh pnpm build && ./start.sh pnpm start`. Untuk diakses dari perangkat lain
di jaringan lokal: `pnpm start:lan` (mengikat 0.0.0.0:8090).

Menghentikan: `Ctrl+C`. Menyetel ulang data demo ke kondisi awal: `pnpm db:reset`.
Konfigurasi opsional ada di `.env.example` (semua nilai di sana adalah default kode).

## Akun demo dan QR

| Peran | Akun | Kata sandi |
|---|---|---|
| Admin rumah sakit | `admin` | `demo12345` |
| Petugas pendaftaran | `daftar` | `demo12345` |
| Petugas poli | `poli` | `demo12345` |
| Petugas farmasi | `farmasi` | `demo12345` |

QR lokasi demo yang aktif: `poli-dalam` → membuka `/daftar?qr=poli-dalam`.
`poli-dalam-lama` sengaja berstatus nonaktif untuk menguji penolakan QR kedaluwarsa.
Poster siap cetak ada di `/qr/poli-dalam` (tombol **Cetak poster**, atau `Ctrl+P`);
gambar QR-nya sendiri dilayani `/api/v1/qr/poli-dalam` sebagai SVG. Admin juga punya
tombol **Poster QR** di tab *QR lokasi*.
Semua data adalah tiruan; tidak ada data pasien sungguhan.

## Menampilkan ke publik

Cara tercepat (tanpa akun, alamat sementara):

```bash
cloudflared tunnel --url http://127.0.0.1:8090 --no-autoupdate
```

Alamat `https://…trycloudflare.com` yang muncul dipakai otomatis oleh QR, karena
`/api/v1/qr/[code]` membangun URL dari origin permintaan. Selama tunnel hidup, QR
yang sama bisa dipindai dari ponsel mana pun. Untuk alamat tetap, buat named tunnel
di akun Cloudflare atau pasang aplikasi di belakang reverse proxy HTTPS.


## Halaman

| Rute | Isi |
|---|---|
| `/` | Beranda publik: cara kerja, batas privasi, status pengembangan |
| `/daftar` | Pendaftaran pasien (NIK/KTP atau KK, nomor rekam medis, poli tujuan) |
| `/tiket/<id>#<token>` | Tiket pasien: status tiap tahap, posisi antrean, perkiraan tunggu, notifikasi giliran dekat dan obat siap |
| `/masuk` | Masuk petugas (tombol akun demo saat `DEMO_MODE=true`) |
| `/petugas` | Papan kerja sesuai unit petugas: panggil berikutnya, mulai, selesai, obat siap diambil, serahkan |
| `/admin` | Unit dan tahap, akun staf, QR lokasi, audit log, dan seed/reset data demo |

## Keputusan teknis yang perlu diketahui

- **Polling 8 detik untuk pasien, 5 detik untuk petugas** (`lib/poll.ts`). PRD meminta
  perubahan status tercermin ≤10 detik; jajak 10 detik ditambah waktu respons melewati
  batas itu, jadi dipilih 8 detik. Diukur di browser: aksi petugas → DOM pasien maksimum 8,0 detik.
- **Token tiket ada di fragmen URL** (`#…`) sehingga tidak pernah terkirim ke server atau
  tercatat di log akses. Basis data hanya menyimpan hash SHA-256; tautan berlaku sampai
  tanggal kunjungan + 1 hari (`TICKET_VALID_DAYS_AFTER_VISIT`), dan membuat tautan baru
  mencabut tautan lama.
- **Audit log tidak dapat diubah**: trigger basis data menolak UPDATE/DELETE, dan TRUNCATE
  hanya lolos bila `giliranku.allow_reset = 'on'` (dipakai seed/reset demo).
- **Nomor tiket atomik** lewat tabel `daily_counters` (`INSERT … ON CONFLICT DO UPDATE … RETURNING`),
  jadi dua pendaftaran bersamaan tidak mungkin mendapat nomor sama.
- **Alur tertahan**: bila unit tujuan berikutnya belum dikonfigurasi, tiket ditandai
  `needs_admin_action` dan dilanjutkan otomatis begitu admin mengaktifkan unit/tahap itu.
- **Zod 4 dengan locale Indonesia** (`z.config(z.locales.id())`), sehingga pesan validasi bawaan
  berbahasa Indonesia. Pesan aplikasi seluruhnya Bahasa Indonesia.
- Penyimpangan kecil dari panduan desain: teks `muted`/`subtle` memakai varian sedikit lebih
  gelap (`#627180`/`#62717f`) hanya di atas permukaan berwarna, karena warna spesifikasi
  (#687887 / #657482) tidak mencapai 4,5:1 di atas panel `#f5f6f7` (4,20) dan wash bukti
  `#fcffeb` (4,46). Token merek di `:root` tidak diubah.

## Verifikasi

```bash
pnpm typecheck       # bersih
pnpm test            # 51/51 lulus
pnpm test:coverage   # cakupan lib inti
pnpm acceptance      # 215/215 lulus
```

`pnpm acceptance` menjalankan pemeriksaan berbasis kriteria PRD terhadap server sungguhan:
ia membuat basis data sementara `giliranku_acc_*` dan menyalakan aplikasi di port **8091**,
lalu menghapus keduanya setelah selesai — basis data demo `giliranku` di 8090 tidak tersentuh.

Hasil terakhir (18 Nov 2026):

- acceptance **215/215 lulus**, tidak ada basis data `giliranku_acc_%` maupun port 8091/8092 tertinggal;
- unit test **51/51**; `tsc --noEmit` bersih; `next build` berhasil (34 rute);
- cakupan modul inti (`lib/domain.ts`, `validation.ts`, `security.ts`, `time.ts`, `log.ts`):
  pernyataan **85,4%**, cabang **76,3%**, fungsi **73,5%**, baris **86,4%**;
- uji browser (Chromium) pada 360/390/768/1024/1440 px: tidak ada gulir mendatar di halaman
  pasien, papan petugas, maupun konsol admin; tidak ada teks terpotong atau bertumpuk; semua
  teks yang terlihat lolos kontras WCAG AA (audit terhitung dari warna efektif DOM);
- alur pasien ujung-ke-ujung lewat klik sungguhan: daftar → tiket → panggil → mulai → selesai →
  obat siap diambil, dengan latensi sinkronisasi terukur ≤8,0 detik;
- QR terdekode benar (`zbarimg`: `http://127.0.0.1:8090/daftar?qr=poli-dalam`).

## Yang belum ada

- Belum ada uji end-to-end Playwright di repo; verifikasi browser di atas dilakukan manual
  lewat protokol DevTools, bukan suite yang dapat diulang dengan satu perintah.
- Hanya diuji di Chromium. Firefox dan Safari belum.
- QR belum dipindai dengan kamera ponsel sungguhan; yang diverifikasi adalah hasil dekode berkasnya.
- HTTPS/HSTS belum diaktifkan: aplikasi berjalan di HTTP lokal dan mengandalkan proxy TLS di
  depan. Setel `COOKIE_SECURE=true` setelah berada di balik HTTPS.
- Backup harian belum diotomatiskan (volume Docker `giliranku-pgdata`); belum ada penjadwalan `pg_dump`.
- Pelacakan galat (Sentry dan sejenisnya) belum ada; yang tersedia hanya log JSON satu baris
  dan `/api/health`.
- Target cakupan 80% pada PRD baru terpenuhi untuk pernyataan/baris modul inti, belum untuk
  cabang dan fungsi; lapisan layanan diuji lewat acceptance, bukan unit test.

## Struktur

```
app/(public)/          beranda, pendaftaran, tiket pasien, masuk
app/(staff)/           papan petugas dan konsol admin
app/api/v1/**/         REST API (pasien, petugas, admin, QR, demo)
components/            Brand (pita folded-spectrum), home, patient, staff, admin
lib/                   config, db, domain, validation, security, ratelimit, poll, services/*
db/schema.sql          skema + trigger audit append-only
scripts/               migrate, seed, reset-demo, acceptance + harness
tests/                 unit test domain dan validasi
public/fonts/          Inter dan IBM Plex Mono (lokal, tanpa CDN)
```
