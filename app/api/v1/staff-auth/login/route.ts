import { assertSameOrigin, clientIp, ok, readJson, route } from "@/lib/http";
import { loginSchema, parse } from "@/lib/validation";
import { login, publicStaff, sessionCookie } from "@/lib/services/auth";

export const dynamic = "force-dynamic";

// POST /staff-auth/login — Public (rate limited). Cookie sesi HttpOnly; token mentah tidak ada di body.
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { username, password } = parse(loginSchema, await readJson(req));
  const { token, staff } = await login(username, password, clientIp(req));
  return ok({ staff_user: publicStaff(staff) }, {}, { headers: { "Set-Cookie": sessionCookie(token) } });
});
