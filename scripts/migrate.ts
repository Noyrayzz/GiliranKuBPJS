import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../lib/db";

// Menerapkan db/schema.sql (idempotent). Dipakai `pnpm db:migrate` dan oleh skrip seed/acceptance.
export async function migrate(): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool.query(sql);
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  migrate()
    .then(async () => {
      const r = await pool.query(
        "select count(*)::int as n from information_schema.tables where table_schema='public'",
      );
      console.log(`migrasi selesai: ${r.rows[0].n} tabel di schema public`);
      await pool.end();
    })
    .catch(async (e) => {
      console.error("migrasi gagal:", e.message);
      await pool.end();
      process.exit(1);
    });
}
