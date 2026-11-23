import { lookupQr } from "@/lib/services/visits";
import { E, AppError } from "@/lib/errors";
import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `QR lokasi ${code}` };
}

export default async function QrPosterPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let qr: Awaited<ReturnType<typeof lookupQr>> | null = null;
  let error: string | null = null;
  try {
    qr = await lookupQr(code);
  } catch (e) {
    error = e instanceof AppError ? e.message : E.notFound().message;
  }

  return (
    <div className="frame">
      <div className="page">
        <style>{`
          .qr-poster{max-width:560px;margin:0 auto;background:#fff;border:1px solid var(--color-edge);
            border-radius:20px;padding:clamp(24px,5vw,48px);text-align:center}
          .qr-poster .eyebrow{font-family:var(--font-mono);font-size:11px;letter-spacing:.16em;
            text-transform:uppercase;color:var(--color-muted)}
          .qr-poster h1{font-size:clamp(24px,4vw,34px);margin:10px 0 6px;letter-spacing:-.02em}
          .qr-poster .sub{color:var(--color-body);margin:0 0 24px}
          .qr-poster .plate{display:inline-block;padding:18px;background:#fff;border:1px solid var(--color-edge);
            border-radius:16px}
          .qr-poster .plate img{display:block;width:min(300px,68vw);height:auto}
          .qr-poster .code{font-family:var(--font-mono);font-size:13px;color:var(--color-muted);margin-top:12px}
          .qr-poster ol{text-align:left;margin:26px auto 0;max-width:380px;padding-left:22px;color:var(--color-body)}
          .qr-poster ol li{margin:8px 0;line-height:1.5}
          .qr-poster .cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:26px}
          @media print{
            .no-print,.site-nav,.site-footer{display:none!important}
            body{background:#fff}
            .qr-poster{border:0;max-width:none;padding:0}
            .qr-poster .plate img{width:320px}
          }
        `}</style>

        {error ? (
          <div className="qr-poster">
            <p className="eyebrow">QR lokasi</p>
            <h1>QR tidak aktif</h1>
            <p className="sub">{error}</p>
            <div className="cta no-print">
              <Link className="btn btn--primary" href="/daftar">Daftar tanpa QR</Link>
              <Link className="btn btn--secondary" href="/">Kembali ke beranda</Link>
            </div>
          </div>
        ) : (
          <div className="qr-poster">
            <p className="eyebrow">{qr!.hospital.name}</p>
            <h1>Ambil tiket antrean</h1>
            <p className="sub">
              Pindai kode ini dengan kamera ponsel untuk membuka formulir pendaftaran
              {qr!.service_unit ? ` ${qr!.service_unit.name}` : ""}.
            </p>
            <div className="plate">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/v1/qr/${encodeURIComponent(code)}`} alt={`Kode QR ${code}`} width={300} height={300} />
            </div>
            <p className="code">{code}</p>
            <ol>
              <li>Buka kamera ponsel, arahkan ke kode QR.</li>
              <li>Ketuk tautan yang muncul, lalu isi identitas pasien.</li>
              <li>Simpan tiket digital yang terbit; statusnya bisa dipantau dari tautan itu.</li>
            </ol>
            <div className="cta no-print">
              <Link className="btn btn--primary" href={`/daftar?qr=${encodeURIComponent(code)}`}>
                Buka formulir pendaftaran
              </Link>
              <PrintButton />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
