import { assertSameOrigin, getCookie, noContent, route } from "@/lib/http";
import { clearSessionCookie, logout, SESSION_COOKIE } from "@/lib/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  await logout(getCookie(req, SESSION_COOKIE));
  return noContent({ "Set-Cookie": clearSessionCookie() });
});
