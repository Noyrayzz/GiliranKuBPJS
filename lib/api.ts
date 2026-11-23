import { assertSameOrigin } from "./http";
import { requireAdmin, requireStaff, type StaffContext } from "./services/auth";

/** Staf untuk endpoint yang mengubah data: cek Origin (CSRF) lalu sesi. */
export async function staffForWrite(req: Request): Promise<StaffContext> {
  assertSameOrigin(req);
  return requireStaff(req);
}

export async function adminForWrite(req: Request): Promise<StaffContext> {
  assertSameOrigin(req);
  return requireAdmin(req);
}
