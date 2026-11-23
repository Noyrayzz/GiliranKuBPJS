import { ok, route } from "@/lib/http";
import { publicStaff, requireStaff } from "@/lib/services/auth";
import { isDemoEnv } from "@/lib/services/demo";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const s = await requireStaff(req);
  const p = publicStaff(s);
  return ok({ staff_user: p, service_unit: p.service_unit }, { demo_mode: isDemoEnv() });
});
