import { ok, readJson, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { parse, patchStageSchema } from "@/lib/validation";
import { patchStage } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const PATCH = route<{ service_stage_id: string }>(async (req, { service_stage_id }) => {
  const admin = await adminForWrite(req);
  return ok(await patchStage(admin, service_stage_id, parse(patchStageSchema, await readJson(req))));
});
