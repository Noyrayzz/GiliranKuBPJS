import { ok, readJson, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { parse, patchUnitSchema } from "@/lib/validation";
import { patchUnit } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const PATCH = route<{ service_unit_id: string }>(async (req, { service_unit_id }) => {
  const admin = await adminForWrite(req);
  return ok(await patchUnit(admin, service_unit_id, parse(patchUnitSchema, await readJson(req))));
});
