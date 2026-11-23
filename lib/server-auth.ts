import "server-only";
import { cookies } from "next/headers";
import { getStaffByToken, SESSION_COOKIE, type StaffContext } from "./services/auth";

/** Sesi staf untuk Server Component (halaman /petugas, /admin). */
export async function currentStaff(): Promise<StaffContext | null> {
  const store = await cookies();
  return getStaffByToken(store.get(SESSION_COOKIE)?.value);
}
