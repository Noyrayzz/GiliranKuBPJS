import { assertSameOrigin, ok, route } from "@/lib/http";
import { assertDemoEnv, resetDemo } from "@/lib/services/demo";
import { requireAdmin, clearSessionCookie } from "@/lib/services/auth";

export const dynamic = "force-dynamic";

// POST /demo/reset — Admin, hanya lingkungan demo. Data kembali ke baseline; sesi & token tiket lama tidak berlaku lagi.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  assertDemoEnv();
  const r = await resetDemo(admin);
  return ok({ status: "reset", ...r }, {}, { headers: { "Set-Cookie": clearSessionCookie() } });
});
