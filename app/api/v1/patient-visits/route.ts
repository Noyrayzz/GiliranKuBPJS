import { config } from "@/lib/config";
import { clientIp, ok, originOf, readJson, route } from "@/lib/http";
import { limitOrThrow } from "@/lib/ratelimit";
import { parse, patientVisitSchema } from "@/lib/validation";
import { createPatientVisit } from "@/lib/services/visits";

export const dynamic = "force-dynamic";

// POST /patient-visits — Public. 201 {Patient(terbatas), Visit, Ticket, TicketStage[], access_url}
export const POST = route(async (req) => {
  // Dibatasi di pintu masuk (sebelum validasi) agar permintaan tak valid pun ikut terhitung (PRD §13.10).
  limitOrThrow(`visit:ip:${clientIp(req)}`, config.rate.visitPerMin);
  const input = parse(patientVisitSchema, await readJson(req));
  const result = await createPatientVisit(input, originOf(req));
  return ok(result, {}, { status: 201 });
});
