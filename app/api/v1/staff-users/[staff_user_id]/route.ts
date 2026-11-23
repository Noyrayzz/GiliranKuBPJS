import { ok, readJson, route } from "@/lib/http";
import { adminForWrite } from "@/lib/api";
import { parse, patchStaffSchema } from "@/lib/validation";
import { patchStaff } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export const PATCH = route<{ staff_user_id: string }>(async (req, { staff_user_id }) => {
  const admin = await adminForWrite(req);
  return ok(await patchStaff(admin, staff_user_id, parse(patchStaffSchema, await readJson(req))));
});
