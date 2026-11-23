import { clientIp, ok, route } from "@/lib/http";
import { resolveQr } from "@/lib/services/visits";

export const dynamic = "force-dynamic";

// POST /location-qr-codes/{code}/resolve — Public.
export const POST = route<{ code: string }>(async (req, { code }) => ok(await resolveQr(code, clientIp(req))));
