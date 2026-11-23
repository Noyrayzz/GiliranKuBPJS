import QRCode from "qrcode";
import { originOf, route } from "@/lib/http";
import { E } from "@/lib/errors";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Gambar SVG QR untuk dicetak di lokasi. QR nonaktif tetap dapat digambar (admin mungkin mencetak ulang) tetapi saat dipindai ditolak.
export const GET = route<{ code: string }>(async (req, { code }) => {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(code)) throw E.notFound("QR tidak ditemukan.");
  const r = await query(`select 1 from location_qr_codes where code = $1`, [code]);
  if (!r.rows[0]) throw E.notFound("QR tidak ditemukan.");
  const svg = await QRCode.toString(`${originOf(req)}/daftar?qr=${code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
});
