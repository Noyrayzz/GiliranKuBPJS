import Link from "next/link";
import { FoldedSpectrum } from "@/components/Brand";
import { Icon } from "@/components/icons";
import { FlowDiagram, LockDiagram, PrivacyDiagram } from "@/components/home/Diagrams";
import {
  AuditFragment,
  CodeFragment,
  LedgerFragment,
  PickupFragment,
  TicketFragment,
  TokenFragment,
} from "@/components/home/Fragments";

export const metadata = { title: "Tiket digital untuk rawat jalan BPJS" };

export default function HomePage() {
  return (
    <>
      {/* 1. Janji: kalimat dua nada + pita lipat yang dipotong stage */}
      <section className="hero" aria-labelledby="judul">
        <div className="frame" style={{ height: "100%" }}>
          <div className="hero__copy">
            <Link className="badge" href="/daftar?qr=poli-dalam">
              Pindai QR di poli, tiket langsung terbit
              <Icon name="arrowUpRight" />
            </Link>
            <h1 id="judul" className="t-opening measure">
              Tiket antrean untuk pasien BPJS.{" "}
              <span className="cont">
                Satu tautan menunjukkan posisi di pendaftaran, poli, dan farmasi, sehingga Anda tidak perlu duduk terus di ruang tunggu.
              </span>
            </h1>
            <div className="row hero__actions">
              <Link className="btn btn--primary" href="/daftar">
                Ambil tiket
              </Link>
              <Link className="btn btn--secondary" href="/masuk">
                Masuk sebagai petugas
              </Link>
            </div>
          </div>
        </div>
        <div className="hero__art" aria-hidden="true">
          <FoldedSpectrum testId="spectrum" />
        </div>
      </section>

      <section className="strip" aria-label="Cakupan MVP">
        <div className="frame">
          <div className="strip__inner">
            <span className="strip__item">Tanpa memasang aplikasi</span>
            <span className="strip__item">Pendaftaran, poli, farmasi</span>
            <span className="strip__item">Audit log untuk setiap aksi petugas</span>
            <span className="strip__item">Data demo tiruan</span>
          </div>
        </div>
      </section>

      {/* 2. Peragaan kapabilitas */}
      <section className="section" id="kapabilitas" aria-labelledby="h-kap">
        <div className="frame">
          <div className="announce">
            <div>
              <h2>Satu tiket ikut Anda dari loket sampai obat.</h2>
              <p>Petugas menandai selesai, tahap berikutnya muncul sendiri di halaman Anda. Perubahan tampil dalam 10 detik.</p>
              <Link className="link-tech" href="/daftar">
                Ambil tiket <Icon name="arrowUpRight" />
              </Link>
            </div>
          </div>

          <h2 id="h-kap" className="t-heading measure lead-pair">
            Lihat antrean tanpa bertanya ke loket.{" "}
            <span className="cont">Tiap tahap menampilkan status, posisi, dan perkiraan waktu dari durasi yang dikonfigurasi rumah sakit.</span>
          </h2>

          <div className="mosaic">
            <article className="tile tile--12">
              <h3 className="tile__title">Satu halaman untuk seluruh kunjungan</h3>
              <p className="tile__text t-small muted">Status tiap tahap, posisi antrean, dan tanda ketika giliran dekat atau obat siap diambil.</p>
              <div className="tile__links">
                <Link href="/daftar">
                  <Icon name="chevronRight" /> Ambil tiket
                </Link>
                <Link href="/daftar?qr=poli-dalam">
                  <Icon name="chevronRight" /> Mulai dari QR poli
                </Link>
              </div>
              <div className="scene scene--code">
                <CodeFragment />
              </div>
              <div className="scene scene--ticket">
                <TicketFragment />
              </div>
            </article>

            <article className="tile tile--7">
              <h3 className="tile__title">Panggil berikutnya dari meja Anda</h3>
              <p className="tile__text t-small muted">Dua petugas menekan bersamaan? Basis data memberi tiket yang berbeda ke masing-masing.</p>
              <div className="scene scene--ledger">
                <LedgerFragment />
              </div>
            </article>

            <article className="tile tile--5">
              <h3 className="tile__title">Obat siap diambil, tanda langsung tampil</h3>
              <div className="scene scene--pickup">
                <PickupFragment />
              </div>
            </article>

            <article className="tile tile--5">
              <h3 className="tile__title">Tautan pribadi, tanpa akun</h3>
              <div className="scene scene--token">
                <TokenFragment />
              </div>
            </article>

            <article className="tile tile--7">
              <h3 className="tile__title">Setiap perubahan tercatat dan tidak bisa diubah</h3>
              <div className="scene scene--audit">
                <AuditFragment />
              </div>
            </article>
          </div>

          {/* 3. Bukti: pengamatan editorial yang dapat diverifikasi, bukan testimoni karangan */}
          <figure className="proof">
            <span className="icon-chip">
              <Icon name="shield" />
            </span>
            <blockquote className="t-quote proof__quote">
              Aksi “panggil berikutnya” dan “selesai” disimpan bersama identitas petugas dan waktunya. Basis data menolak UPDATE, DELETE, dan TRUNCATE pada audit log, bukan hanya antarmukanya.
            </blockquote>
            <div className="proof__foot">
              <figcaption className="proof__attr">Catatan teknis, bukan testimoni</figcaption>
              <p className="proof__note">Diuji langsung di basis data: tiga perintah ditolak dengan galat yang sama.</p>
            </div>
          </figure>

          <div className="stats" role="list">
            <div role="listitem">
              <div className="t-stat">≤ 10 detik</div>
              <p>Batas waktu perubahan dari petugas tampil di halaman pasien, tanpa muat ulang.</p>
            </div>
            <div role="listitem">
              <div className="t-stat">3 tahap</div>
              <p>Pendaftaran, poli, dan farmasi pada satu tiket.</p>
            </div>
            <div role="listitem">
              <div className="t-stat">0 aplikasi</div>
              <p>Cukup peramban di ponsel. Tidak ada yang perlu dipasang.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Mekanisme: bab gelap yang berkesinambungan */}
      <section className="dark on-dark" id="mekanisme" aria-labelledby="h-mek">
        <div className="frame">
          <div className="dark__head">
            <h2 id="h-mek" className="t-heading measure">
              Cara kerjanya dibuat sederhana dan dapat diperiksa.{" "}
              <span className="cont">Tiga keputusan teknis di bawah ini menentukan apakah antrean dapat dipercaya.</span>
            </h2>
            <div className="row" style={{ marginTop: 32 }}>
              <Link className="btn btn--primary" href="/masuk">
                Lihat dasbor petugas
              </Link>
            </div>
          </div>

          <div className="trow">
            <div>
              <h3>
                Tahap berikutnya dibuat saat tahap ini selesai. <span className="cont">Tidak ada tahap fiktif bila farmasi belum dikonfigurasi; tiket ditandai butuh tindakan admin.</span>
              </h3>
              <Link className="link-tech" href="/daftar">
                Coba dari awal <Icon name="arrowUpRight" />
              </Link>
            </div>
            <FlowDiagram />
          </div>

          <div className="trow">
            <div>
              <h3>
                Dua petugas, dua tiket berbeda. <span className="cont">Pemanggilan memakai penguncian baris sehingga tidak ada tiket yang dipanggil dua kali.</span>
              </h3>
              <Link className="link-tech" href="/masuk">
                Masuk sebagai petugas <Icon name="arrowUpRight" />
              </Link>
            </div>
            <LockDiagram />
          </div>

          <div className="trow">
            <div>
              <h3>
                Pasien melihat identitas minimum. <span className="cont">Token tiket di-hash di basis data; NIK dan KK tidak pernah dikirim kembali ke peramban.</span>
              </h3>
              <Link className="link-tech" href="/daftar">
                Buka formulir pendaftaran <Icon name="arrowUpRight" />
              </Link>
            </div>
            <PrivacyDiagram />
          </div>

          <div className="dark__quote">
            <p>
              Perkiraan waktu adalah durasi layanan yang dikonfigurasi dikali jumlah tiket di depan Anda. Jika durasi belum diisi, halaman menampilkan “perkiraan waktu belum tersedia”, bukan angka karangan.
            </p>
            <cite>Aturan FR-009</cite>
          </div>
        </div>
      </section>

      {/* 5. Relevansi per audiens */}
      <section className="section" id="untuk" aria-labelledby="h-aud">
        <div className="frame">
          <div className="section__inner">
            <h2 id="h-aud" className="t-heading measure">
              Tiap peran hanya melihat yang perlu.{" "}
              <span className="cont">Pasien, petugas, dan admin memakai satu sistem dengan batas akses yang berbeda.</span>
            </h2>
            <div className="aud">
              <div>
                <span className="icon-chip icon-chip--32">
                  <Icon name="user" />
                </span>
                <h3>Pasien dan keluarga</h3>
                <ul>
                  <li>Ambil tiket lewat web atau QR di lokasi, tanpa akun.</li>
                  <li>Status, posisi, dan perkiraan waktu per tahap.</li>
                  <li>Keluarga membuka tautan yang sama dari peramban; tidak dapat mengubah data.</li>
                </ul>
              </div>
              <div>
                <span className="icon-chip icon-chip--32">
                  <Icon name="megaphone" />
                </span>
                <h3>Petugas</h3>
                <ul>
                  <li>Antrean unit Anda saja; unit lain ditolak dengan 403.</li>
                  <li>Panggil, mulai, selesai. Farmasi menambah siap diambil dan diserahkan.</li>
                  <li>Urutan status dijaga: aksi yang tidak valid ditolak.</li>
                </ul>
              </div>
              <div>
                <span className="icon-chip icon-chip--32">
                  <Icon name="layers" />
                </span>
                <h3>Admin rumah sakit</h3>
                <ul>
                  <li>Atur unit, tahap, durasi estimasi, dan ambang giliran dekat.</li>
                  <li>Buat dan nonaktifkan akun staf, tetapkan unit.</li>
                  <li>Telusuri audit log per tiket; reset data demo.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Perkembangan: linimasa, dari TASKS PRD */}
      <section className="section" id="perkembangan" aria-labelledby="h-prog">
        <div className="frame">
          <div className="section__inner">
            <h2 id="h-prog" className="t-heading measure">
              Cakupan MVP satu rumah sakit, satu poli, satu farmasi.{" "}
              <span className="cont">Yang di luar cakupan dinyatakan terang, bukan disembunyikan.</span>
            </h2>
            <ul className="timeline">
              <li>
                <h3>Pembuatan tiket</h3>
                <p>Web dan QR memakai alur yang sama; pendaftaran ganda ditolak dan mengarah ke tiket yang ada.</p>
                <span className="t-date">M-002 · tersedia</span>
              </li>
              <li>
                <h3>Operasional petugas</h3>
                <p>Dasbor pendaftaran, poli, dan farmasi dengan transisi status tervalidasi.</p>
                <span className="t-date">M-004 · tersedia</span>
              </li>
              <li>
                <h3>Administrasi dan audit</h3>
                <p>Unit, tahap, akun staf, dan audit log yang hanya bisa ditambah.</p>
                <span className="t-date">M-005 · tersedia</span>
              </li>
              <li>
                <h3>Belum ada di MVP</h3>
                <p>Mobile JKN, SMS atau WhatsApp, integrasi sistem rumah sakit, dan verifikasi identitas ke layanan pemerintah.</p>
                <span className="t-date">fase berikutnya</span>
              </li>
            </ul>
            <div className="row" style={{ marginTop: 48 }}>
              <Link className="btn btn--secondary" href="/daftar">
                Ambil tiket demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
