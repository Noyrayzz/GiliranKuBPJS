#!/usr/bin/env python3
"""Dek presentasi GiliranKuBPJS — 10 slide, identitas folded-spectrum.

Jalankan:  /usr/bin/python3 presentasi/build_deck.py
Hasil:     presentasi/GiliranKuBPJS.pptx (+ PDF lewat soffice)
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

ROOT = os.path.dirname(os.path.abspath(__file__))
A = lambda n: os.path.join(ROOT, "assets", n)

SW, SH = 13.333, 7.5
SANS, MONO = "Inter", "IBM Plex Mono"
INK, BODY, MUTED, SUBTLE = "1d2a36", "314352", "687887", "657482"
DARK, DARK2, DARK_COPY, FINE = "151e29", "1c2833", "c0c9d1", "8995a1"
MINT, LIME, CYAN, JADE = "31f2bf", "e4ff33", "02b7f1", "12f0aa"
PANEL, EDGE, OFFWHITE, PROOF, WASH = "f5f6f7", "e1e5e9", "fcfcfc", "fcffeb", "effff9"
RIBBON = ["deff34", "8cf97c", "65f75f", "12f0aa", "45f4bc", "33dfdf", "01d3d8", "02b7f1", "34c8f4", "02a7ff"]
TITLES = [
    "Giliranku", "Masalah: menunggu tanpa kepastian", "Solusi: satu tiket, tiga meja",
    "Cara kerja", "Pengalaman pasien", "Papan petugas", "Administrasi, QR, dan audit",
    "Keamanan dan privasi", "Bukti bahwa aplikasinya berjalan", "Langkah berikutnya",
]

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(SW), Inches(SH)
BLANK = prs.slide_layouts[6]


# ----------------------------------------------------------------- bantu
def slide(bg=OFFWHITE):
    s = prs.slides.add_slide(BLANK)
    rect(s, 0, 0, SW, SH, fill=bg)
    return s


def rect(s, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, adj=None, lw=0.75):
    sh = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.shadow.inherit = False
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = RGBColor.from_string(fill)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = RGBColor.from_string(line)
        sh.line.width = Pt(lw)
    else:
        sh.line.fill.background()
    if adj is not None:
        try:
            sh.adjustments[0] = adj
        except Exception:
            pass
    return sh


def P(t, size=16, color=INK, bold=False, font=SANS, after=4, before=0, ls=1.10, align=None, spc=None, italic=False):
    return {"runs": [{"t": t, "size": size, "color": color, "bold": bold, "font": font, "spc": spc, "italic": italic}],
            "after": after, "before": before, "ls": ls, "align": align}


def txt(s, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.space_after = Pt(p.get("after", 4))
        para.space_before = Pt(p.get("before", 0))
        para.line_spacing = p.get("ls", 1.10)
        if p.get("align"):
            para.alignment = p["align"]
        for r in p["runs"]:
            run = para.add_run()
            run.text = r["t"]
            f = run.font
            f.size = Pt(r.get("size", 16))
            f.bold = r.get("bold", False)
            f.italic = r.get("italic", False)
            f.name = r.get("font", SANS)
            f.color.rgb = RGBColor.from_string(r.get("color", INK))
            if r.get("spc"):
                run.font._rPr.set("spc", str(int(r["spc"] * 100)))
    return tb


def notes(s, text):
    s.notes_slide.notes_text_frame.text = text


def ribbon(s, ox=9.25, oy=3.0, w=1.45, h=2.7, step=0.60, skew=0.42, colors=RIBBON[:7]):
    for i, c in enumerate(colors):
        rect(s, ox + i * step, oy - i * 0.34, w, h, fill=c, shape=MSO_SHAPE.PARALLELOGRAM, adj=skew)


def chrome(s, n, kicker, dark=False):
    ink = DARK_COPY if dark else MUTED
    txt(s, 0.9, 0.52, 9.0, 0.32, [P(kicker, 10.5, MINT if dark else "0f6b53", font=MONO, spc=1.6)])
    txt(s, 11.0, 0.42, 1.5, 0.6, [P(f"{n:02d}", 26, "334352" if dark else EDGE, bold=True, font=MONO, align=PP_ALIGN.RIGHT)])
    txt(s, 0.9, 6.86, 8.0, 0.3, [P("Giliranku · tiket antrean BPJS rawat jalan", 9.5, FINE if dark else SUBTLE, font=MONO)])
    txt(s, 11.0, 6.86, 1.45, 0.3, [P(f"{n:02d} / 10", 9.5, FINE if dark else SUBTLE, font=MONO, align=PP_ALIGN.RIGHT)])
    rect(s, 0.9, 6.70, 11.53, 0.008, fill="33414f" if dark else EDGE)


def title(s, t, dark=False, size=32, y=1.05):
    txt(s, 0.9, y, 11.0, 1.1, [P(t, size, "ffffff" if dark else INK, bold=True, ls=1.05)])


def bullet(s, x, y, w, lead, body, accent=MINT, dark=False, lead_size=16, body_size=12.5):
    rect(s, x, y + 0.10, 0.16, 0.16, fill=accent)
    txt(s, x + 0.36, y - 0.03, w - 0.36, 0.9,
        [P(lead, lead_size, "ffffff" if dark else INK, bold=True, after=3),
         P(body, body_size, DARK_COPY if dark else BODY, ls=1.16)])


def card(s, x, y, w, h, fill="ffffff", line=EDGE):
    return rect(s, x, y, w, h, fill=fill, line=line, shape=MSO_SHAPE.ROUNDED_RECTANGLE, adj=0.06)


def pic(s, name, x, y, w, h=None):
    if h:
        return s.shapes.add_picture(A(name), Inches(x), Inches(y), Inches(w), Inches(h))
    return s.shapes.add_picture(A(name), Inches(x), Inches(y), Inches(w))


# ================================================================= 1. SAMPUL
s = slide(DARK)
ribbon(s, ox=9.15, oy=3.05)
rect(s, 0.0, 0.0, 7.9, SH, fill=DARK)  # bidang kiri bersih untuk teks
txt(s, 0.95, 1.05, 6.6, 0.4, [P("MVP · LINGKUNGAN DEMO", 11, LIME, font=MONO, spc=2.0)])
txt(s, 0.95, 1.75, 7.0, 1.9, [P("Giliranku", 60, "ffffff", bold=True, ls=1.0)])
txt(s, 0.95, 3.25, 6.9, 1.3,
    [P("Tiket antrean untuk kunjungan BPJS rawat jalan.", 25, MINT, bold=True, ls=1.12)])
txt(s, 0.95, 4.35, 6.9, 0.9,
    [P("Satu tiket untuk pendaftaran, poli, dan farmasi — pasien memantau status dari satu tautan, tanpa memasang aplikasi.",
       15.5, DARK_COPY, ls=1.28)])
rect(s, 0.95, 5.55, 3.35, 0.52, fill=MINT, shape=MSO_SHAPE.ROUNDED_RECTANGLE, adj=0.22)
txt(s, 0.95, 5.68, 3.35, 0.3, [P("PENDAFTARAN → POLI → FARMASI", 11, DARK, bold=True, font=MONO, align=PP_ALIGN.CENTER)])
txt(s, 0.95, 6.35, 8.0, 0.35, [P("10 slide · data demo tiruan · November 2026", 11, FINE, font=MONO)])
notes(s, "Giliranku adalah layanan web tiket digital untuk kunjungan rawat jalan pasien BPJS. "
         "Satu tiket mengikuti pasien melalui pendaftaran, poli, dan farmasi, sehingga pasien tidak "
         "perlu duduk terus di ruang tunggu hanya untuk menunggu namanya dipanggil. Yang dipakai di "
         "sini sepenuhnya data tiruan: RSU Giliranku Demo, satu poli penyakit dalam, dan satu farmasi. "
         "Dek ini merangkum masalah, alur, tampilan, keamanan, dan bukti pengujiannya.")

# ================================================================= 2. MASALAH
s = slide()
chrome(s, 2, "01 · KENAPA PERLU")
title(s, "Menunggu tanpa kepastian", size=33)
items = [
    ("Satu kunjungan, tiga antrean", "Pendaftaran, poli, dan farmasi masing-masing punya antrean sendiri. Pasien mengulang proses yang sama di tiga meja.", LIME),
    ("Posisi tidak terlihat", "Dari ruang tunggu, pasien tidak tahu tinggal berapa orang lagi, apakah perlu terus duduk, atau boleh pergi sebentar.", MINT),
    ("Obat siap tidak sampai ke pasien", "Pasien menunggu di dekat loket farmasi karena tidak ada cara mengetahui kapan obatnya benar-benar siap diambil.", CYAN),
]
for i, (lead, body, col) in enumerate(items):
    x = 0.9 + i * 3.9
    card(s, x, 2.25, 3.72, 3.30, fill="ffffff")
    rect(s, x, 2.25, 3.72, 0.10, fill=col)
    txt(s, x + 0.32, 2.62, 3.1, 0.5, [P(f"0{i+1}", 20, SUBTLE, font=MONO)])
    txt(s, x + 0.32, 3.18, 3.1, 2.2, [P(lead, 18, INK, bold=True, after=9, ls=1.10), P(body, 12.5, BODY, ls=1.22)])
txt(s, 0.9, 5.92, 11.4, 0.6,
    [P("Yang hilang bukan waktu layanan, melainkan kepastian status: pasien tidak tahu di mana ia berada dan kapan harus kembali.",
       15, MUTED, italic=True)])
notes(s, "Masalahnya bukan antreannya — antrean pasti ada di rumah sakit. Masalahnya pasien tidak punya "
         "informasi. Ia menunggu di pendaftaran, lalu pindah menunggu di poli, lalu menunggu lagi di farmasi, "
         "tanpa tahu posisinya. Konsekuensinya pasien tidak berani meninggalkan ruang tunggu. Giliranku tidak "
         "mengklaim mempercepat layanan; yang diberikan adalah visibilitas, supaya waktu menunggu bisa dipakai "
         "untuk hal lain.")

# ================================================================= 3. SOLUSI
s = slide(WASH)
chrome(s, 3, "02 · PENDEKATAN")
title(s, "Satu tiket, tiga meja", size=36)
pts = [
    ("Tanpa aplikasi", "Tiket dibuka di peramban ponsel lewat tautan atau QR di lokasi. Tidak ada unduhan, tidak ada pemasangan."),
    ("Tiket bergerak mengikuti pasien", "Saat petugas menyelesaikan satu tahap, tahap berikutnya terbuka otomatis — pasien tidak mendaftar ulang."),
    ("Setiap aksi tercatat", "Panggil, mulai, dan selesai disimpan dengan identitas petugas dan waktunya di audit log."),
]
for i, (lead, body) in enumerate(pts):
    bullet(s, 0.95, 2.55 + i * 1.16, 6.5, lead, body, accent=[LIME, MINT, CYAN][i], lead_size=19, body_size=13.5)
# mini diagram tiga meja
for i, (label, sub, col) in enumerate([("Pendaftaran", "verifikasi", LIME), ("Poli", "pemeriksaan", MINT), ("Farmasi", "penyiapan obat", CYAN)]):
    y = 2.45 + i * 1.28
    card(s, 8.35, y, 3.7, 0.95, fill="ffffff")
    rect(s, 8.35, y, 0.14, 0.95, fill=col)
    txt(s, 8.72, y + 0.16, 3.1, 0.65, [P(label, 17, INK, bold=True, after=2), P(sub, 11.5, MUTED)])
    if i < 2:
        txt(s, 10.0, y + 0.92, 1.0, 0.35, [P("↓", 20, SUBTLE, align=PP_ALIGN.CENTER)])
notes(s, "Inti desainnya sederhana: satu objek tiket, bukan tiga tiket terpisah. Tiket itu punya tiga tahap "
         "dan pasien melihat ketiganya di satu halaman. Petugas di tiap unit melihat antrean unitnya saja. "
         "Ketika petugas pendaftaran menekan selesai, sistem membuat tahap poli untuk tiket yang sama, dan "
         "halaman pasien langsung menampilkannya. Ini yang membuat pengalaman terasa seperti satu kunjungan, "
         "bukan tiga proses terpisah.")

# ================================================================= 4. CARA KERJA
s = slide(DARK)
chrome(s, 4, "03 · ALUR", dark=True)
title(s, "Dari pendaftaran sampai obat siap diambil", dark=True, size=30)
steps = [
    ("01", "Pasien", "Daftar dari web atau pindai QR di lokasi. Identitas dari KTP atau KK, plus nomor rekam medis.", LIME),
    ("02", "Pendaftaran", "Petugas memanggil berikutnya, memulai layanan, lalu menandai selesai.", MINT),
    ("03", "Poli", "Tahap poli terbuka otomatis. Petugas memanggil dan menyelesaikan pemeriksaan.", JADE),
    ("04", "Farmasi", "Obat diproses, lalu ditandai siap diambil. Pasien mendapat notifikasi di tiketnya.", CYAN),
]
for i, (no, who, body, col) in enumerate(steps):
    x = 0.9 + i * 2.94
    card(s, x, 2.30, 2.76, 3.15, fill=DARK2, line="2b3a48")
    rect(s, x + 0.26, 2.62, 0.52, 0.09, fill=col)
    txt(s, x + 0.26, 2.95, 2.2, 0.5, [P(no, 22, col, bold=True, font=MONO)])
    txt(s, x + 0.26, 3.52, 2.25, 0.6, [P(who, 21, "ffffff", bold=True)])
    txt(s, x + 0.26, 4.20, 2.25, 1.1, [P(body, 12, DARK_COPY, ls=1.22)])
txt(s, 0.9, 5.80, 11.5, 0.5,
    [P("Pasien hanya melihat satu halaman; tiga meja memperbarui tiket yang sama. Status aktif saat ini selalu terlihat.",
       14, DARK_COPY)])
notes(s, "Alurnya sengaja memakai alur yang sudah ada di rumah sakit, bukan membuat proses baru. Pasien mendaftar, "
         "diverifikasi di pendaftaran, diperiksa di poli, lalu obatnya disiapkan farmasi. Yang berubah adalah "
         "penghubungnya: satu tiket digital yang statusnya diperbarui petugas di tiap meja. Untuk farmasi ada "
         "status tambahan 'siap diambil' dan 'diserahkan', supaya pasien datang ketika obat benar-benar siap.")

# ================================================================= 5. PASIEN
s = slide()
chrome(s, 5, "04 · SISI PASIEN")
title(s, "Tiket pasien: semua yang perlu diketahui", size=29)
card(s, 0.95, 2.10, 3.35, 4.30, fill=PANEL, line=EDGE)
pic(s, "tiket_crop.png", 1.25, 2.28, 2.75)
feats = [
    ("Posisi dan perkiraan waktu", "Nomor tiket, posisi antrean, serta estimasi yang dihitung dari durasi layanan yang diatur rumah sakit — bukan janji layanan."),
    ("Penanda pada momen penting", "Giliran dekat dan obat siap diambil muncul sebagai banner di halaman yang sama."),
    ("Tiga tahap terlihat sekaligus", "Pendaftaran, poli, dan farmasi terbaca berurutan, termasuk tahap yang belum dimulai."),
    ("Bisa dibagikan ke keluarga", "Tautan tiket dapat diteruskan ke pengantar. Mereka melihat status, tetapi tidak bisa mengubah data."),
]
for i, (lead, body) in enumerate(feats):
    bullet(s, 4.85, 2.15 + i * 1.12, 7.6, lead, body, accent=[LIME, MINT, JADE, CYAN][i], lead_size=17, body_size=12.5)
notes(s, "Ini halaman yang dilihat pasien setelah mendaftar. Yang tampil adalah tiket A-007 milik Nadia Puspita, "
         "pasien demo. Nomor rekam medis disamarkan, NIK tidak ditampilkan sama sekali. Halaman memperbarui "
         "dirinya setiap 8 detik, sehingga perubahan status dari petugas terlihat tanpa memuat ulang. Ada juga "
         "tombol 'terbitkan tautan baru' kalau tautan lama bocor; tautan lama langsung dicabut.")

# ================================================================= 6. PETUGAS
s = slide()
chrome(s, 6, "05 · SISI PETUGAS")
title(s, "Papan petugas: satu layar untuk antrean unit", size=29)
bullet(s, 0.95, 2.20, 4.2, "Panggil berikutnya", "Selalu mengambil tiket tertua yang masih menunggu di unit itu.", accent=MINT)
bullet(s, 0.95, 3.35, 4.2, "Mulai dan selesaikan", "Kartu 'sedang ditangani' menampilkan tiket yang dipanggil beserta aksinya.", accent=JADE)
bullet(s, 0.95, 4.50, 4.2, "Angka yang selalu segar", "Ringkasan menunggu, diproses, dan selesai diperbarui otomatis setiap 5 detik.", accent=CYAN)
bullet(s, 0.95, 5.65, 4.2, "Unit sesuai penugasan", "Petugas hanya melihat unitnya; admin melihat konfigurasi dan audit.", accent=LIME)
card(s, 5.45, 2.05, 7.05, 4.45, fill="ffffff", line=EDGE)
pic(s, "board_poli.png", 5.60, 2.20, 6.75)
notes(s, "Di sisi petugas tidak ada aplikasi kasir yang rumit. Satu tombol untuk memanggil berikutnya, lalu kartu "
         "tiket yang sedang ditangani dengan aksi mulai dan selesai. Setiap aksi menulis audit log dengan nama "
         "petugas dan waktu, jadi riwayat antrean bisa ditelusuri. Papan ini juga punya jeda maksimum satu layar: "
         "kolom kiri bergulir sendiri bila isinya panjang, sehingga tombol paling bawah tetap terjangkau.")

# ================================================================= 7. ADMIN
s = slide()
chrome(s, 7, "06 · ADMINISTRASI")
title(s, "Unit, QR lokasi, dan audit dalam satu konsol", size=29)
bullet(s, 0.95, 2.20, 4.4, "Unit dan tahap", "Nama unit, durasi layanan estimasi, dan ambang 'giliran dekat' diatur per tahap.", accent=LIME)
bullet(s, 0.95, 3.30, 4.4, "Akun staf", "Admin membuat akun dengan peran pendaftaran, poli, farmasi, atau admin, terikat ke unit.", accent=MINT)
bullet(s, 0.95, 4.40, 4.4, "QR lokasi", "Kode QR bisa dinonaktifkan tanpa menghapus riwayatnya; QR kedaluwarsa ditolak dengan pesan jelas.", accent=CYAN)
bullet(s, 0.95, 5.50, 4.4, "Audit log", "Daftar aksi petugas dan perubahan status dapat dibaca dari tab tersendiri.", accent=JADE)
card(s, 5.55, 2.05, 6.95, 3.55, fill="ffffff", line=EDGE)
pic(s, "admin_audit.png", 5.70, 2.20, 6.65)
card(s, 10.05, 5.55, 1.55, 0.85, fill=PANEL, line=EDGE)
pic(s, "qr.png", 10.22, 5.61, 0.62)
txt(s, 10.92, 5.73, 1.5, 0.5, [P("QR poli-dalam", 9.5, INK, font=MONO)])
notes(s, "Admin mengatur struktur layanan: unit, tahap, durasi estimasi, dan ambang notifikasi. QR di lokasi "
         "membuka formulir dengan poli yang sudah dipilih, sehingga pasien yang datang langsung ke poli tidak "
         "perlu memilih lagi. Kalau QR dicetak ulang, kode lama bisa dinonaktifkan. Di belakang semua ini ada "
         "audit log yang sengaja dibuat tidak bisa diubah, supaya catatan operasional tetap bisa dipercaya.")

# ================================================================= 8. KEAMANAN
s = slide(DARK)
chrome(s, 8, "07 · KEPERCAYAAN", dark=True)
title(s, "Dirancang agar tautan tiket tidak membocorkan data", dark=True, size=28)
secs = [
    ("Token tidak pernah masuk log", "Token tiket ada di fragmen URL (#…), jadi tidak terkirim ke server atau tercatat di log akses. Basis data hanya menyimpan hash SHA-256.", MINT),
    ("Identitas disamarkan", "NIK tidak tampil di halaman tiket; nomor rekam medis ditampilkan tersamarkan. Daftar halaman pasien tidak memuat nama pasien lain.", LIME),
    ("Audit log append-only", "Trigger basis data menolak UPDATE dan DELETE pada audit log; TRUNCATE hanya lolos saat mode reset demo.", JADE),
    ("Sesi dan permintaan dijaga", "Cookie sesi HttpOnly dan SameSite, kedaluwarsa 30 menit, pemeriksaan Origin untuk mutasi, serta pembatasan percobaan masuk.", CYAN),
]
for i, (lead, body, col) in enumerate(secs):
    x = 0.9 + (i % 2) * 5.95
    y = 2.25 + (i // 2) * 2.15
    card(s, x, y, 5.65, 1.95, fill=DARK2, line="2b3a48")
    rect(s, x, y, 0.12, 1.95, fill=col)
    txt(s, x + 0.35, y + 0.28, 5.0, 0.4, [P(lead, 18, "ffffff", bold=True)])
    txt(s, x + 0.35, y + 0.82, 5.05, 1.0, [P(body, 12.5, DARK_COPY, ls=1.20)])
notes(s, "Tautan tiket adalah kunci akses, jadi perlakuannya seperti kredensial: token tinggal di fragmen URL "
         "dan tidak dikirim ke server. Server hanya menyimpan hash-nya. Tautan kedaluwarsa setelah tanggal "
         "kunjungan plus satu hari, dan pasien bisa menerbitkan tautan baru yang mencabut yang lama. Untuk staf, "
         "sesi dibatasi 30 menit tanpa aktivitas, dan permintaan perubahan data diperiksa asalnya.")

# ================================================================= 9. BUKTI
s = slide(PROOF)
chrome(s, 9, "08 · VERIFIKASI")
title(s, "Yang sudah diuji pada aplikasi yang berjalan", size=30)
stats = [
    ("215 / 215", "pemeriksaan acceptance berbasis PRD, terhadap server sungguhan di port terpisah"),
    ("51 / 51", "unit test untuk logika domain dan validasi"),
    ("≤ 8,0 detik", "latensi terukur dari aksi petugas sampai halaman pasien berubah"),
    ("85,4 %", "cakupan pernyataan pada modul inti (domain, validasi, keamanan)"),
]
for i, (num, body) in enumerate(stats):
    x = 0.9 + (i % 2) * 5.95
    y = 2.20 + (i // 2) * 1.55
    card(s, x, y, 5.65, 1.35, fill="ffffff", line=EDGE)
    txt(s, x + 0.32, y + 0.22, 5.0, 0.5, [P(num, 27, INK, bold=True)])
    txt(s, x + 0.32, y + 0.80, 5.05, 0.5, [P(body, 12.5, BODY, ls=1.16)])
txt(s, 0.9, 5.55, 11.5, 0.8,
    [P("Diuji pada 360–1440 px tanpa gulir mendatar; kontras teks lolos WCAG AA pada halaman yang diperiksa; QR terdekode ke alamat yang benar.",
       13.5, BODY, after=10),
     {"runs": [{"t": "Video demo (32 detik, tanpa narasi): ", "size": 13, "color": INK, "bold": True},
               {"t": "brag-demo/demo.mp4", "size": 13, "color": INK, "font": MONO}], "after": 0, "ls": 1.1}])
notes(s, "Angka-angka ini hasil pengukuran, bukan target. Acceptance suite membuat basis data sementara dan "
         "menyalakan server di port 8091, jadi basis data demo tidak tersentuh. Sinkronisasi sengaja memakai "
         "jajak 8 detik, karena jajak 10 detik ditambah waktu respons melewati batas sepuluh detik yang diminta "
         "PRD. Latensi itu diukur di browser: aksi petugas ke perubahan DOM pasien maksimum delapan detik.")

# ================================================================= 10. LANJUT
s = slide(DARK)
ribbon(s, ox=10.55, oy=3.30, w=1.15, h=2.2, step=0.44, skew=0.42, colors=RIBBON[:6])
chrome(s, 10, "09 · SETELAH MVP", dark=True)
title(s, "Yang masih perlu dikerjakan", dark=True, size=32)
nxt = [
    "Uji end-to-end Playwright di repo, menggantikan verifikasi browser manual",
    "Uji di Firefox dan Safari, serta pindai QR dengan kamera ponsel sungguhan",
    "HTTPS di depan aplikasi dan COOKIE_SECURE=true sebelum dipakai di luar localhost",
    "Backup pg_dump terjadwal dan pelacakan galat; target cakupan cabang/fungsi belum 80%",
]
for i, t in enumerate(nxt):
    bullet(s, 0.95, 2.30 + i * 0.85, 8.6, f"{i+1:02d}", t, accent=[LIME, MINT, JADE, CYAN][i],
           dark=True, lead_size=15, body_size=13)
txt(s, 0.95, 6.05, 9.5, 0.5, [P("Giliranku · satu tiket untuk pendaftaran, poli, dan farmasi", 16, MINT, bold=True)])
notes(s, "Yang disajikan hari ini adalah MVP yang benar-benar berjalan, bukan mockup. Langkah berikutnya adalah "
         "membuat verifikasi yang bisa diulang: Playwright, lalu menguji peramban lain dan pemindaian QR dengan "
         "kamera nyata. Sebelum dipakai di lingkungan nyata perlu HTTPS, cookie secure, backup, dan pemantauan "
         "galat. Skala berikutnya yang belum dikerjakan adalah beberapa rumah sakit dan lebih dari satu poli.")

out = os.path.join(ROOT, "GiliranKuBPJS.pptx")
prs.save(out)
print("tersimpan:", out, "| slide:", len(prs.slides._sldIdLst))
