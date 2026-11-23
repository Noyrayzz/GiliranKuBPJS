import { ok, route } from "@/lib/http";
import { bearer, getVisitForToken } from "@/lib/services/visits";

export const dynamic = "force-dynamic";

// GET /visits/{visit_id} — Ticket token (Authorization: Bearer <token>).
export const GET = route<{ visit_id: string }>(async (req, { visit_id }) =>
  ok(await getVisitForToken(visit_id, bearer(req))),
);
