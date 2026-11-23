import { ok, route } from "@/lib/http";
import { bearer, getQueueForToken } from "@/lib/services/visits";

export const dynamic = "force-dynamic";

// GET /visits/{visit_id}/queue — TicketStage[] dengan queue_position, estimated_wait_minutes, near_turn.
export const GET = route<{ visit_id: string }>(async (req, { visit_id }) =>
  ok(await getQueueForToken(visit_id, bearer(req))),
);
