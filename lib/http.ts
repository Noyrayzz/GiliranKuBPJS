import { ZodError } from "zod";
import { AppError, E } from "./errors";
import { log } from "./log";

const BASE_HEADERS = { "Cache-Control": "no-store" } as const;
const MAX_BODY_BYTES = 32 * 1024;

export function ok<T>(data: T, meta: Record<string, unknown> = {}, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
  return Response.json({ data, meta }, { status: init.status ?? 200, headers });
}

export function fail(e: AppError): Response {
  const headers = new Headers(BASE_HEADERS);
  for (const [k, v] of Object.entries(e.headers)) headers.set(k, v);
  return Response.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status, headers });
}

export function noContent(headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) h.set(k, v);
  return new Response(null, { status: 204, headers: h });
}

/** Kegagalan tak terduga -> 500 INTERNAL_ERROR tanpa membocorkan detail internal (NFR-010). */
function toAppError(e: unknown, req: Request): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof ZodError) {
    return E.validation(
      e.issues[0]?.message,
      e.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    );
  }
  const err = e as { code?: string; message?: string };
  log.error("unhandled", { method: req.method, path: new URL(req.url).pathname, code: err?.code, err: err?.message });
  return new AppError("INTERNAL_ERROR", "Terjadi gangguan pada server. Coba lagi beberapa saat lagi.");
}

type Ctx<P> = { params: Promise<P> };

/** Pembungkus route handler: semua error menjadi {error:{code,message,details}} dan setiap request dicatat tanpa query/token. */
export function route<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx?: Ctx<P>): Promise<Response> => {
    const started = performance.now();
    let res: Response;
    try {
      res = await fn(req, (await ctx?.params) ?? ({} as P));
    } catch (e) {
      res = fail(toAppError(e, req));
    }
    log.info("req", {
      method: req.method,
      path: new URL(req.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id"),
      status: res.status,
      ms: Math.round(performance.now() - started),
    });
    return res;
  };
}

export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw E.validation("Isi permintaan terlalu besar.");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw E.validation("Isi permintaan terlalu besar.");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw E.validation("Isi permintaan harus berupa JSON yang valid.");
  }
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  return (xf?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local").slice(0, 64);
}

/** Perlindungan CSRF untuk request yang mengubah data dengan cookie sesi: Origin harus sama dengan Host. */
export function assertSameOrigin(req: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw E.forbidden("Asal permintaan tidak dikenali.");
  }
  if (originHost !== host) throw E.forbidden("Asal permintaan tidak diizinkan.");
}

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Origin yang dilihat pengguna (menghormati proxy), dipakai membentuk access_url dan URL QR. */
export function originOf(req: Request): string {
  const u = new URL(req.url);
  const proto = (req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "")).split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host).split(",")[0].trim();
  return `${proto}://${host}`;
}
