import { ok, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { assertDemoEnv, seedDemo } from "@/lib/services/demo";

export const dynamic = "force-dynamic";

// POST /demo/seed — Admin, hanya lingkungan demo. Idempoten.
export const POST = route(async (req) => {
  const admin = await adminForWrite(req);
  assertDemoEnv();
  return ok(await seedDemo(admin));
});
