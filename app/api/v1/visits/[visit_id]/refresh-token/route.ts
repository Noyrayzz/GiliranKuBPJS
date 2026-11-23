import { assertSameOrigin, ok, originOf, route } from "@/lib/http";
import { bearer, refreshToken } from "@/lib/services/visits";

export const dynamic = "force-dynamic";

// POST /visits/{visit_id}/refresh-token — mencabut tautan lama, menerbitkan access_url baru.
export const POST = route<{ visit_id: string }>(async (req, { visit_id }) => {
  assertSameOrigin(req);
  return ok(await refreshToken(visit_id, bearer(req), originOf(req)));
});
