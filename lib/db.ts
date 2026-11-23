import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { config } from "./config";

// Kolom DATE dikembalikan apa adanya ('YYYY-MM-DD'); default pg membuat Date lokal dan menggeser tanggal.
types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { __gkPool?: Pool };

function makePool(): Pool {
  const p = new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
  p.on("error", (e) => console.error(JSON.stringify({ level: "error", msg: "pg idle client error", err: e.message })));
  return p;
}

export const pool: Pool = g.__gkPool ?? (g.__gkPool = makePool());

/** Eksekutor query minimal: dipenuhi oleh `pool`, `PoolClient`, maupun objek `{ query }` dari helper ini. */
export interface Db {
  query: (text: string, params?: any[]) => Promise<QueryResult<any>>;
}

export function query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as unknown[] as any[]);
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {
      /* koneksi sudah putus */
    }
    throw e;
  } finally {
    c.release();
  }
}

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = e as { code?: string; constraint?: string };
  return err?.code === "23505" && (!constraint || err.constraint === constraint);
}
