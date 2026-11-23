export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATUS_TRANSITION"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATUS_TRANSITION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown[];
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, message: string, details: unknown[] = [], headers: Record<string, string> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.headers = headers;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export const E = {
  validation: (message = "Data yang dikirim belum valid. Periksa kembali isian Anda.", details: unknown[] = []) =>
    new AppError("VALIDATION_ERROR", message, details),
  unauthenticated: (message = "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.") =>
    new AppError("UNAUTHENTICATED", message),
  forbidden: (message = "Anda tidak memiliki akses untuk tindakan ini.") => new AppError("FORBIDDEN", message),
  notFound: (message = "Data tidak ditemukan.") => new AppError("NOT_FOUND", message),
  conflict: (message: string, details: unknown[] = []) => new AppError("CONFLICT", message, details),
  transition: (message: string, details: unknown[] = []) => new AppError("INVALID_STATUS_TRANSITION", message, details),
  rateLimited: (retryAfterSec: number) =>
    new AppError(
      "RATE_LIMITED",
      "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
      [{ retry_after_seconds: retryAfterSec }],
      { "Retry-After": String(retryAfterSec) },
    ),
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
