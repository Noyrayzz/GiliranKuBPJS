import { ok, readJson, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { parse, patchQrSchema } from "@/lib/validation";
import { patchQr } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const PATCH = route<{ qr_id: string }>(async (req, { qr_id }) => {
  const admin = await adminForWrite(req);
  const { status } = parse(patchQrSchema, await readJson(req));
  return ok(await patchQr(admin, qr_id, status));
});
