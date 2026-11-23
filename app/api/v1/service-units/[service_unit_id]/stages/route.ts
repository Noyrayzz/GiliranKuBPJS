import { ok, readJson, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { createStageSchema, parse } from "@/lib/validation";
import { createStage } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

// POST /service-units/{id}/stages — Admin.
export const POST = route<{ service_unit_id: string }>(async (req, { service_unit_id }) => {
  const admin = await adminForWrite(req);
  const input = parse(createStageSchema, await readJson(req));
  return ok(await createStage(admin, service_unit_id, input), {}, { status: 201 });
});
