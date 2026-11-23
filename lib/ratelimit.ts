import { E } from "./errors";

const g = globalThis as unknown as { __gkRate?: Map<string, number[]>; __gkRateHits?: number };
const store = (g.__gkRate ??= new Map<string, number[]>());

/** Jendela geser di memori. Cukup untuk satu instance demo; produksi multi-instance butuh penyimpanan bersama. */
function recent(key: string, now: number, windowMs: number): number[] {
  return (store.get(key) ?? []).filter((t) => now - t < windowMs);
}

const retryAfterOf = (arr: number[], now: number, windowMs: number) =>
  Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));

/** Hanya memeriksa (tidak menambah hitungan). Dipakai untuk batas yang hanya menghitung kejadian tertentu, mis. login gagal. */
export function rateBlocked(key: string, limit: number, windowMs = 60_000): { blocked: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = recent(key, now, windowMs);
  return arr.length >= limit ? { blocked: true, retryAfter: retryAfterOf(arr, now, windowMs) } : { blocked: false, retryAfter: 0 };
}

export function rateRecord(key: string, windowMs = 60_000): void {
  const now = Date.now();
  const arr = recent(key, now, windowMs);
  arr.push(now);
  store.set(key, arr);
  g.__gkRateHits = (g.__gkRateHits ?? 0) + 1;
  if (g.__gkRateHits % 500 === 0) {
    for (const [k, v] of store) if (v.every((t) => now - t >= windowMs)) store.delete(k);
  }
}

/** Periksa lalu hitung satu permintaan. */
export function rateHit(key: string, limit: number, windowMs = 60_000): { ok: boolean; retryAfter: number } {
  const b = rateBlocked(key, limit, windowMs);
  if (b.blocked) return { ok: false, retryAfter: b.retryAfter };
  rateRecord(key, windowMs);
  return { ok: true, retryAfter: 0 };
}

export function limitOrThrow(key: string, limit: number, windowMs = 60_000): void {
  const r = rateHit(key, limit, windowMs);
  if (!r.ok) throw E.rateLimited(r.retryAfter);
}

export function resetRateLimits(): void {
  store.clear();
}
