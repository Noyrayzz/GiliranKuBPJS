import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Giliranku: tiket digital rawat jalan BPJS", template: "%s · Giliranku" },
  description:
    "Tiket digital untuk kunjungan rawat jalan pasien BPJS. Satu tautan menampilkan status dan posisi antrean di pendaftaran, poli, dan farmasi, tanpa memasang aplikasi.",
  applicationName: "Giliranku",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <a className="skip-link" href="#konten">
          Lewati ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
