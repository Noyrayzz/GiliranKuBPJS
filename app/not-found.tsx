import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata = { title: "Halaman tidak ditemukan" };

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main id="konten" className="nav-offset">
        <div className="frame" style={{ minHeight: "70vh" }}>
          <div className="page measure stack-24">
            <p className="t-eyebrow">404</p>
            <h1 className="t-opening">Halaman tidak ditemukan.</h1>
            <p className="t-lead muted">Alamat yang Anda buka tidak ada atau sudah dipindahkan. Periksa kembali tautannya.</p>
            <div className="row">
              <Link className="btn btn--primary" href="/">
                Ke beranda
              </Link>
              <Link className="btn btn--secondary" href="/daftar">
                Ambil tiket
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
