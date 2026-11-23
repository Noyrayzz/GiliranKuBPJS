import { ok, route } from "@/lib/http";
import { staffForWrite } from "@/lib/api";
import { callNext } from "@/lib/services/queue";

export const dynamic = "force-dynamic";

// POST /service-stages/{id}/call-next — tiket menunggu paling awal => dipanggil. Antrean kosong => 200 {empty:true}, data tidak berubah.
export const POST = route<{ service_stage_id: string }>(async (req, { service_stage_id }) => {
  const staff = await staffForWrite(req);
  const r = await callNext(staff, service_stage_id);
  if (r.empty) return ok({ empty: true, message: "Antrean kosong. Belum ada tiket yang menunggu." });
  return ok({ empty: false, ticket_stage: r.ticket_stage, ticket: r.ticket });
});
