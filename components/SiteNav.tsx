import Link from "next/link";
import { Wordmark } from "./Brand";

/** Navigasi publik. Satu-satunya navigasi di halaman publik; dasbor staf punya StaffNav sendiri (tidak bertumpuk). */
export function SiteNav({ current }: { current?: "home" | "daftar" | "masuk" }) {
  return (
    <header className="nav">
      <div className="nav__inner">
        <Link href="/" aria-label="Giliranku, beranda">
          <Wordmark />
        </Link>
        <nav className="nav__links" aria-label="Utama">
          <Link className="nav__link" href="/#mekanisme">
            Cara kerja
          </Link>
          <Link className="nav__link" href="/#untuk">
            Untuk siapa
          </Link>
          <Link className="nav__link" href="/#perkembangan">
            Perkembangan
          </Link>
        </nav>
        <div className="nav__right">
          <Link className="nav__link" href="/masuk" aria-current={current === "masuk" ? "page" : undefined}>
            Masuk petugas
          </Link>
          <Link className="btn btn--dark" href="/daftar" aria-current={current === "daftar" ? "page" : undefined}>
            Ambil tiket
          </Link>
        </div>
      </div>
    </header>
  );
}
