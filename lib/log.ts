// Log terstruktur satu baris JSON. Nilai sensitif (password, token, identitas) tidak pernah ditulis (PRD §13.4, §13.11).
const SENSITIVE = /pass(word)?|token|authorization|cookie|secret|national_identity|family_card|nik|session/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[dalam]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[disamarkan]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(fields ? (redact(fields) as object) : {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};
