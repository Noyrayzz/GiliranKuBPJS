import { ok, route } from "@/lib/http";
import { parse, queueQuerySchema } from "@/lib/validation";
import { requireStaff } from "@/lib/services/auth";
import { getUnitQueue } from "@/lib/services/queue";

export const dynamic = "force-dynamic";

// GET /service-units/{id}/queue?date=&service_stage_id= — Staff unit. Unit lain => 403.
export const GET = route<{ service_unit_id: string }>(async (req, { service_unit_id }) => {
  const staff = await requireStaff(req);
  const url = new URL(req.url);
  const q = parse(queueQuerySchema, {
    date: url.searchParams.get("date") ?? undefined,
    service_stage_id: url.searchParams.get("service_stage_id") ?? undefined,
  });
  const r = await getUnitQueue(staff, service_unit_id, { date: q.date, serviceStageId: q.service_stage_id });
  return ok(r.data, r.meta);
});
