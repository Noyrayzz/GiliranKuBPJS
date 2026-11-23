import { ok, originOf, route } from "@/lib/http";
import { requireAdmin } from "@/lib/services/auth";
import { listQrCodes } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const GET = route<{ hospital_id: string }>(async (req, { hospital_id }) => {
  await requireAdmin(req);
  const origin = originOf(req);
  const rows = await listQrCodes(hospital_id);
  return ok(rows.map((q) => ({ ...q, url: `${origin}/daftar?qr=${q.code}`, image_url: `${origin}/api/v1/qr/${q.code}` })));
});
