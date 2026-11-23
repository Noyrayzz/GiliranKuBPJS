# demo.mp4 — rekaman pemakaian, ringkas dan tanpa suara

**32,3 detik**, tanpa narasi, tanpa adegan ganti akun. Yang ditampilkan hanya yang penting:
pasien mengisi formulir → tiket terbit → petugas memanggil dan menyelesaikan →
status pasien ikut berubah → poli memproses tiket yang sama → obat siap diambil.
Login dan pergantian petugas dilakukan **di luar rekaman**, jadi videonya melompat langsung
dari tiket pasien ke papan petugas.

Kursor, ketikan, dan perubahan status berasal dari event masukan sungguhan
(CDP `Input.dispatch*`) yang direkam dengan `Page.startScreencast` — bukan animasi.
Jeda diam dipangkas (maks. 0,8 detik) dan keseluruhan dipercepat 1,3× agar tidak bertele-tele.

## Isi folder

| Berkas | Keterangan |
|---|---|
| `demo.mp4` | 1920×1080, 30 fps, h264, 32,3 detik, tanpa audio, 1,4 MB |
| `demo.jpg` | poster (bingkai "Obat siap diambil"), dibakar sebagai bingkai 0 (SSIM 0,998) |
| `share-copy.txt` | kapsi siap unggah |
| `work/record.py` | perekaman: screencast + interaksi, plus penanda fase |
| `work/build.py` | bingkai per 1/30 detik, pemangkasan jeda, percepatan, `captions.json` |
| `work/caption.py` | membakar takarir + poster |
| `work/timeline.json` | stempel waktu bingkai, klik, dan fase |
| `work/captions.json` | waktu dan teks takarir |
| `work/qa/` | bingkai pemeriksaan |

## Cara merekam ulang

```bash
cd /home/kelvin/code/GiliranKuBPJS && PATH="/home/kelvin/.local/opt/node22/bin:$PATH" pnpm db:reset
cd brag-demo
uv run --with websocket-client python work/record.py   # ~60 detik
python3 work/build.py                                  # bingkai 30 fps, potong jeda, percepat 1,3x
python3 work/caption.py                                # bakar takarir + poster
```

## Takarir

| Waktu | Teks |
|---|---|
| 0,1–6,9 | Pasien mendaftar dari web |
| 7,0–10,7 | Tiket terbit: posisi antrean dan status terbaca |
| 10,9–16,1 | Petugas memanggil lalu menyelesaikan |
| 16,3–18,6 | Status pasien ikut berubah |
| 18,7–24,7 | Poli memproses tiket yang sama |
| 24,9–30,0 | Farmasi menandai obat siap diambil |
| 30,2–32,3 | Obat siap diambil |

Waktu takarir diturunkan dari penanda fase di `timeline.json`, bukan ditebak.

## Catatan teknis

- Sebelum merekam, `record.py` menutup seluruh tahap hari ini lewat SQL (persiapan di luar
  rekaman) supaya klik "Panggil berikutnya" memanggil tiket pasien yang baru dibuat, bukan
  tiket demo lain.
- Tiap langkah menunggu elemen benar-benar muncul (`wait_for`/`wait_path`), bukan jeda tetap —
  hasilnya lebih cepat dan tidak pernah memotret halaman yang belum siap.
- Kursor di-inject ulang tiap dokumen (`Page.addScriptToEvaluateOnNewDocument`) dan posisinya
  dipulihkan setelah setiap pemuatan; tanpa itu penunjuk menghilang setelah navigasi.
- Klik aksi ditargetkan pada kartu milik nomor tiket kita (`[data-testid=work-card]`), bukan
  tombol pertama di halaman.
- Tiap adegan diberi tahan 1,0 detik setelah aksinya selesai (`END_HOLD`), jadi tidak ada potongan
  yang jatuh tepat saat tombol baru selesai diproses.
- Potongan disambung fade 0,16 detik ke hitam lalu naik lagi (`fade` per adegan sebelum concat),
  bukan cut mendadak. Diukur pada berkas jadi: di tiap sambungan kecerahan turun 253 → ~0 → 253
  dalam ±0,3 detik.
- Adegan ganti akun tidak direkam: `screencast(False)` menghentikan rekaman, login dilakukan
  lewat `login_as()`, lalu rekaman dilanjutkan — jedanya dipangkas jadi satu lompatan.
- Tanpa audio: tidak ada narasi, tidak ada musik. Waktu klik asli masih tersimpan di
  `work/timeline.json` bila nanti ingin menambahkan efek ketikan/klik lagi.
- Nama pasien, NIK, dan nomor rekam medis adalah data demo tiruan yang sudah ada di basis data.
