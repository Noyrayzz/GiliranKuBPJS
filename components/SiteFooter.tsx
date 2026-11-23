import Link from "next/link";
import { Wordmark } from "./Brand";

const COLUMNS = [
  {
    title: "Pasien",
    links: [
      { href: "/daftar", label: "Ambil tiket" },
      { href: "/daftar?qr=poli-dalam", label: "Contoh QR di lokasi" },
      { href: "/#mekanisme", label: "Cara kerja tiket" },
    ],
  },
  {
    title: "Petugas",
    links: [
      { href: "/masuk", label: "Masuk" },
      { href: "/#untuk", label: "Pendaftaran, poli, farmasi" },
      { href: "/#mekanisme", label: "Antrean dan penguncian" },
    ],
  },
  {
    title: "Admin rumah sakit",
    links: [
      { href: "/masuk", label: "Unit dan tahap" },
      { href: "/masuk", label: "Akun staf" },
      { href: "/masuk", label: "Audit log" },
    ],
  },
  {
    title: "Proyek",
    links: [
      { href: "/#perkembangan", label: "Perkembangan MVP" },
      { href: "/api/health", label: "Status layanan" },
      { href: "/masuk", label: "Reset data demo" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="footer on-dark">
      <div className="footer__inner">
        <Link href="/" aria-label="Giliranku, beranda">
          <Wordmark light />
        </Link>
        <div className="footer__cols">
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2 className="footer__title">{c.title}</h2>
              <ul>
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="footer__fine">
          Giliranku adalah MVP dengan data tiruan; tidak ada data pasien nyata di lingkungan ini. Perkiraan waktu dihitung
          dari durasi layanan yang dikonfigurasi rumah sakit dan bukan janji layanan. Giliranku tidak mengurangi durasi
          antrean, tidak terhubung ke Mobile JKN, BPJS, atau sistem rumah sakit, dan tidak memverifikasi identitas ke
          layanan pemerintah. Nama “Giliranku” belum diperiksa ketersediaannya sebagai merek atau domain.
        </p>
      </div>
    </footer>
  );
}
