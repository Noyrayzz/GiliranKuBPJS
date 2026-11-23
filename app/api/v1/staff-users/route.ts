import { ok, readJson, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { createStaffSchema, parse } from "@/lib/validation";
import { requireAdmin } from "@/lib/services/auth";
import { createStaff, listStaff } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return ok(await listStaff());
});

// POST /staff-users — Admin. Respons tanpa password / password_hash.
export const POST = route(async (req) => {
  const admin = await adminForWrite(req);
  return ok(await createStaff(admin, parse(createStaffSchema, await readJson(req))), {}, { status: 201 });
});
