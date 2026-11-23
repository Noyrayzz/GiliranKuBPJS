"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/icons";

// Batas galat untuk seluruh halaman (T-030). Pesan Indonesia, tanpa detail internal; "Coba lagi" merender ulang segmen.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route error", error.digest ?? "");
  }, [error]);
  return (
    <main id="konten" className="frame" style={{ minHeight: "70vh" }}>
      <div className="page measure stack-24" role="alert">
        <span className="icon-chip icon-chip--32">
          <Icon name="alert" />
        </span>
        <p className="t-eyebrow">Terjadi gangguan</p>
        <h1 className="t-opening">Halaman ini belum bisa dimuat.</h1>
        <p className="t-lead muted">
          Server sedang bermasalah. Tidak ada perubahan yang tersimpan dari tindakan terakhir Anda. Coba lagi beberapa saat lagi.
        </p>
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => reset()}>
            Coba lagi
          </button>
          <Link className="btn btn--secondary" href="/">
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </main>
  );
}
