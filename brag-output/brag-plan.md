# brag-plan — GiliranKuBPJS

**Input:** proyek `/home/kelvin/code/GiliranKuBPJS` (aplikasi hidup di 127.0.0.1:8090, data demo).
**Format:** landscape 1920×1080, 30 fps, 22,0 detik. **Tone:** `polished` (produk layanan publik; serius, tenang, tidak bercanda).
**Bahasa di layar:** Indonesia, sama dengan produknya.

## Jawaban rubrik

1. **Apa ini?** Layanan web tiket digital untuk kunjungan rawat jalan BPJS.
2. **Untuk siapa?** Pasien BPJS dan petugas rumah sakit (pendaftaran, poli, farmasi).
3. **Apa yang dilakukannya?** Satu tiket mengikuti pasien melalui tiga meja, dan pasien melihat status serta posisi antreannya dari satu tautan.
4. **Pembeda:** tanpa memasang aplikasi; status tersinkron ≤8 detik; setiap aksi petugas masuk audit log.
5. **Klaim paling kuat:** "Satu tiket, tiga meja" — bukan motto, itu memang alur produknya.
6. **Kail visual:** pita folded-spectrum merek (lime → hijau → sian) dan kartu tiket di layar ponsel.
7. **UI asli yang ditampilkan:** beranda, form pendaftaran terisi, tiket pasien (giliran dekat dan obat siap diambil), papan petugas, audit log admin — semuanya tangkapan layar asli dari aplikasi yang berjalan.
8. **Tone:** polished.
9. **Kapsi satu baris:** "Satu tiket untuk pendaftaran, poli, dan farmasi — tanpa memasang aplikasi."

## Sudut kreatif

Video memperlihatkan produk yang benar-benar bekerja, bukan landing page yang menjelaskan produk.
Setiap adegan memakai tangkapan layar asli pada keadaan yang benar-benar dicapai lewat API
(tiket A-008 didorong melewati pendaftaran → poli → farmasi sampai "siap diambil").
Tidak ada angka, nama, atau testimoni yang dikarang: nama pasien adalah data demo tiruan yang
memang sudah ada di basis data.

## Papan cerita

| # | Waktu | Adegan | Teks di layar | Gerak |
|---|---|---|---|---|
| S1 | 0,0–2,6 | Kail | eyebrow `TIKET ANTREAN BPJS`; "Satu tiket." / "Tiga meja."; mono `PENDAFTARAN → POLI → FARMASI` | pita merek masuk berurutan dari kanan bawah, teks naik 24 px |
| S2 | 2,6–6,2 | Tiket pasien | eyebrow `01 — TIKET PASIEN`; "Pasien tahu posisinya."; isi; chip mono `SINKRON ≤ 8 DETIK` | ponsel naik dari bawah lalu berhenti; kartu tahap menyala berurutan |
| S3 | 6,2–10,2 | Pendaftaran | eyebrow `02 — PENDAFTARAN`; "Daftar dari web, atau pindai QR di poli."; isi; kartu QR `poli-dalam` | sorotan lime menyapu kolom yang terisi; kartu QR masuk dari kanan |
| S4 | 10,2–14,6 | Papan petugas | eyebrow `03 — PETUGAS`; "Petugas memanggil berikutnya."; isi; chip `A-008 · DIPANGGIL` | bingkai peramban masuk; kursor menuju tombol "Panggil berikutnya", riak klik, chip status muncul |
| S5 | 14,6–18,2 | Farmasi | eyebrow `04 — FARMASI`; "Obat siap diambil."; isi | ponsel membesar pelan ke bagian atas layar (banner notifikasi) |
| S6 | 18,2–22,0 | Penutup | wordmark "Giliranku"; "Tiket antrean BPJS, tanpa aplikasi."; mono `127.0.0.1:8090 · DATA DEMO TIRUAN` | pita merek kembali pelan; teks memudar masuk |

Total 22,0 detik. Tidak ada crossfade antara dua tata letak padat: tiap adegan keluar cepat
(0,35 detik, mengecil) sebelum adegan berikutnya masuk, dengan jeda beberapa bingkai.

## Musik dan efek

Bed disintesis dari nol (numpy, `work/make_audio.py`): 120 BPM, 11 birama = 22,0 detik, loop
Am7–Fmaj7–Cmaj7–G. Efek memakai kunci dan ruang yang sama: `tick` untuk teks yang muncul,
`click` untuk klik tombol, `chip` untuk chip status, `thump` untuk pergantian adegan gelap.
Campuran diukur, bukan dikira-kira: target ≈ −16 LUFS integrated, true peak ≤ −1 dBFS.

## Poster

Bingkai diam dari S5 (ponsel dengan banner "Obat siap diambil" sudah penuh, sesudah zoom selesai),
dibakar sebagai bingkai 0 `brag.mp4`.
