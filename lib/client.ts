"use client";

// Pemanggil API untuk komponen klien. Kontrak: { data, meta } atau { error: { code, message, details } }.
export class ApiError extends Error {
  code: string;
  status: number;
  details: any[];
  constructor(status: number, code: string, message: string, details: any[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ data: T; meta: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15000);
  opts.signal?.addEventListener("abort", () => ctl.abort());
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      signal: ctl.signal,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return { data: undefined as T, meta: {} };
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* badan kosong atau bukan JSON */
  }
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "INTERNAL_ERROR", e?.message ?? "Terjadi gangguan pada server. Coba lagi beberapa saat lagi.", e?.details ?? []);
  }
  return { data: json.data as T, meta: json.meta ?? {} };
}

export const fmtTime = (iso: string | Date | null | undefined, withSeconds = false): string =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        ...(withSeconds ? { second: "2-digit" } : {}),
        hour12: false,
      }).format(new Date(iso))
    : "—";

export const fmtDate = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(
        new Date(iso.length === 10 ? `${iso}T00:00:00+07:00` : iso),
      )
    : "—";

export const fmtDateTime = (iso: string | null | undefined): string =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "—";
