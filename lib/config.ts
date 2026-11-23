import { existsSync } from "node:fs";

// Skrip tsx (migrate/seed/accept) tidak melewati loader env milik Next, jadi muat .env sendiri.
if (!process.env.DATABASE_URL && existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* .env opsional */
  }
}

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://giliranku:giliranku@127.0.0.1:55432/giliranku",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8090").replace(/\/$/, ""),
  /** Lingkungan demo: seed/reset diizinkan (FR-025). Set DEMO_MODE=false untuk produksi. */
  demoMode: process.env.DEMO_MODE !== "false",
  /** Secure cookie hanya bila benar-benar lewat HTTPS; NODE_ENV=production di http://localhost akan membuang cookie. */
  cookieSecure: process.env.COOKIE_SECURE === "true",
  sessionIdleMinutes: int(process.env.SESSION_IDLE_MINUTES, 30), // NFR-006
  /** URL tiket berlaku sampai akhir hari (tanggal kunjungan + N hari). Pertanyaan terbuka #3 di PRD. */
  ticketValidDaysAfterVisit: int(process.env.TICKET_VALID_DAYS_AFTER_VISIT, 1),
  maxAdvanceDays: 14,
  timezone: "Asia/Jakarta",
  rate: {
    loginPerMin: int(process.env.RATE_LOGIN_PER_MIN, 10),
    visitPerMin: int(process.env.RATE_VISIT_PER_MIN, 20),
    resolvePerMin: int(process.env.RATE_RESOLVE_PER_MIN, 60),
  },
} as const;
