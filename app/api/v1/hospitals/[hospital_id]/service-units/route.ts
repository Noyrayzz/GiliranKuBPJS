import { ok, readJson, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { createUnitSchema, parse } from "@/lib/validation";
import { requireAdmin } from "@/lib/services/auth";
import { createUnit, listUnits } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const GET = route<{ hospital_id: string }>(async (req, { hospital_id }) => {
  await requireAdmin(req);
  return ok(await listUnits(hospital_id));
});

export const POST = route<{ hospital_id: string }>(async (req, { hospital_id }) => {
  const admin = await adminForWrite(req);
  const input = parse(createUnitSchema, await readJson(req));
  return ok(await createUnit(admin, hospital_id, input), {}, { status: 201 });
});
