import { config } from "./config";

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu rumah sakit (WIB), bukan zona server/container. */
export const todayLocal = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date());

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
