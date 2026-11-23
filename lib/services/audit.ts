import type { Db } from "../db";

export interface AuditEntry {
  actorStaffUserId: string | null;
  ticketId?: string | null;
  ticketStageId?: string | null;
  action: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  /** Tidak boleh berisi password/token (PRD §13.11); pemanggil hanya mengirim id/nama/angka. */
  metadata?: Record<string, unknown> | null;
}

/** Selalu dipanggil di transaksi yang sama dengan perubahannya: transaksi batal -> audit ikut batal (FR-020 AC2). */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs (actor_staff_user_id, ticket_id, ticket_stage_id, action, previous_status, new_status, metadata)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      e.actorStaffUserId,
      e.ticketId ?? null,
      e.ticketStageId ?? null,
      e.action,
      e.previousStatus ?? null,
      e.newStatus ?? null,
      e.metadata ? JSON.stringify(e.metadata) : null,
    ],
  );
}

/** Nomor berikutnya yang atomik untuk (scope, tanggal). Baris counter terkunci sampai transaksi selesai. */
export async function nextCounter(db: Db, scope: string, date: string): Promise<number> {
  const r = await db.query(
    `insert into daily_counters (scope, scope_date, last_value) values ($1,$2,1)
     on conflict (scope, scope_date) do update set last_value = daily_counters.last_value + 1
     returning last_value`,
    [scope, date],
  );
  return r.rows[0].last_value as number;
}
