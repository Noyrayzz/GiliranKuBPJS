import { ok, route } from "@/lib/http";
import { staffForWrite } from "@/lib/api";
import { transition } from "@/lib/services/queue";

export const dynamic = "force-dynamic";

// POST /ticket-stages/{id}/start
export const POST = route<{ ticket_stage_id: string }>(async (req, { ticket_stage_id }) => {
  const staff = await staffForWrite(req);
  const r = await transition(staff, ticket_stage_id, "start");
  return ok({
    ticket_stage: r.ticket_stage,
    ticket: r.ticket,
    advanced_to: r.advanced_to,
    visit_status: r.visit_status,
    needs_admin: r.needs_admin,
  });
});
