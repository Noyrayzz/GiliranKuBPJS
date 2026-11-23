import { query, tx } from "../db";
import { E, isUuid } from "../errors";
import {
  buildFlow,
  checkTransition,
  nextAfter,
  type StageAction,
  type StageStatus,
  type UnitType,
} from "../domain";
import { isValidIsoDate, todayLocal } from "../time";
import { audit, nextCounter } from "./audit";
import { assertUnitOperate, assertUnitRead, type StaffContext } from "./auth";
import { loadFlowCandidates, stageViewSql, toStageDto } from "./flow";

const PATIENT_COLS = ", t.ticket_number, p.display_name, p.medical_record_number";
const PATIENT_JOINS = " join tickets t on t.id = ts.ticket_id join visits v on v.id = t.visit_id join patients p on p.id = v.patient_id";

function withTicket(r: any) {
  return {
    ...toStageDto(r),
    ticket: { id: r.ticket_id, ticket_number: r.ticket_number },
    // NFR-008: dasbor petugas hanya menampilkan nama tampilan + nomor rekam medis, tidak pernah NIK/KK.
    patient: { display_name: r.display_name, medical_record_number: r.medical_record_number },
  };
}

// ------------------------------------------------------------------ antrean unit (FR-015)

export async function getUnitQueue(staff: StaffContext, unitId: string, opts: { date?: string; serviceStageId?: string }) {
  assertUnitRead(staff, unitId); // 403 dulu: respons tidak membedakan unit yang ada/tidak ada untuk unit lain
  if (!isUuid(unitId)) throw E.notFound("Unit tidak ditemukan.");
  const date = opts.date ?? todayLocal();
  if (!isValidIsoDate(date)) throw E.validation("Tanggal tidak valid.", [{ field: "date", message: "Tanggal tidak valid." }]);

  const unit = await query(`select id, name, type, status, hospital_id from service_units where id = $1`, [unitId]);
  if (!unit.rows[0]) throw E.notFound("Unit tidak ditemukan.");

  const stages = await query(
    `select id, name, sequence, estimated_service_minutes, near_turn_threshold, status
       from service_stages where service_unit_id = $1 order by sequence`,
    [unitId],
  );
  if (opts.serviceStageId && !stages.rows.some((s: any) => s.id === opts.serviceStageId))
    throw E.validation("Tahap layanan bukan milik unit ini.", [{ field: "service_stage_id", message: "Tahap layanan bukan milik unit ini." }]);

  const params: unknown[] = [unitId, date];
  let extra = "";
  if (opts.serviceStageId) {
    params.push(opts.serviceStageId);
    extra = " and ts.service_stage_id = $3";
  }
  const rows = await query(
    `${stageViewSql(PATIENT_COLS, PATIENT_JOINS)} where su.id = $1 and ts.queue_date = $2${extra} order by ts.queue_sequence limit 300`,
    params,
  );
  const items = rows.rows.map(withTicket);
  const count = (f: (s: StageStatus) => boolean) => items.filter((i) => f(i.status)).length;
  return {
    data: { ticket_stages: items },
    meta: {
      date,
      unit: { id: unit.rows[0].id, name: unit.rows[0].name, type: unit.rows[0].type as UnitType, status: unit.rows[0].status },
      stages: stages.rows,
      counts: {
        waiting: count((s) => s === "menunggu"),
        in_progress: count((s) => ["dipanggil", "sedang_dilayani", "siap_diambil"].includes(s)),
        done: count((s) => ["selesai", "diserahkan", "dilewati", "dibatalkan"].includes(s)),
      },
    },
  };
}

// ------------------------------------------------------------------ panggil berikutnya (FR-016, NFR-003)

async function loadStage(stageId: string) {
  if (!isUuid(stageId)) throw E.notFound("Tahap layanan tidak ditemukan.");
  const r = await query(
    `select ss.id, ss.name, ss.status, su.id as unit_id, su.type as unit_type
       from service_stages ss join service_units su on su.id = ss.service_unit_id where ss.id = $1`,
    [stageId],
  );
  if (!r.rows[0]) throw E.notFound("Tahap layanan tidak ditemukan.");
  return r.rows[0] as { id: string; name: string; status: string; unit_id: string; unit_type: UnitType };
}

export async function callNext(staff: StaffContext, stageId: string) {
  const stage = await loadStage(stageId);
  assertUnitOperate(staff, stage.unit_id);
  if (stage.status !== "active") throw E.conflict("Tahap layanan ini sedang dinonaktifkan.");
  const date = todayLocal();

  return tx(async (c) => {
    // SKIP LOCKED: dua petugas yang menekan bersamaan mendapat tiket berbeda, tidak ada yang menunggu atau menimpa (§14).
    const pick = await c.query(
      `select id, ticket_id from ticket_stages
        where service_stage_id = $1 and queue_date = $2 and status = 'menunggu'
        order by queue_sequence limit 1 for update skip locked`,
      [stageId, date],
    );
    const row = pick.rows[0];
    if (!row) return { empty: true as const };

    await c.query(`update ticket_stages set status = 'dipanggil', called_at = now(), updated_at = now() where id = $1`, [row.id]);
    await audit(c, {
      actorStaffUserId: staff.id,
      ticketId: row.ticket_id,
      ticketStageId: row.id,
      action: "call_next",
      previousStatus: "menunggu",
      newStatus: "dipanggil",
      metadata: { stage: stage.name, unit_id: stage.unit_id },
    });
    return { empty: false as const, ...(await fetchStageWithTicket(c, row.id)) };
  });
}

async function fetchStageWithTicket(c: { query: (t: string, p?: any[]) => Promise<any> }, id: string) {
  const r = await c.query(`${stageViewSql(PATIENT_COLS, PATIENT_JOINS)} where ts.id = $1`, [id]);
  const dto = withTicket(r.rows[0]);
  return { ticket_stage: dto, ticket: dto.ticket };
}

// ------------------------------------------------------------------ mulai / selesai / farmasi (FR-017..FR-019)

const PHARMACY_ONLY: StageAction[] = ["ready_for_pickup", "hand_over"];

export async function transition(staff: StaffContext, ticketStageId: string, action: Exclude<StageAction, "call_next">) {
  if (!isUuid(ticketStageId)) throw E.notFound("Tahap tiket tidak ditemukan.");

  return tx(async (c) => {
    const r = await c.query(
      `select ts.id, ts.status, ts.ticket_id, ts.queue_date, ts.service_stage_id,
              ss.sequence, ss.name as stage_name, su.id as unit_id, su.type as unit_type, su.hospital_id,
              v.id as visit_id, v.clinic_unit_id
         from ticket_stages ts
         join service_stages ss on ss.id = ts.service_stage_id
         join service_units su on su.id = ss.service_unit_id
         join tickets t on t.id = ts.ticket_id
         join visits v on v.id = t.visit_id
        where ts.id = $1
        for update of ts`,
      [ticketStageId],
    );
    const row = r.rows[0];
    if (!row) throw E.notFound("Tahap tiket tidak ditemukan.");

    assertUnitOperate(staff, row.unit_id); // 403 bila bukan unitnya (FR-019)
    if (PHARMACY_ONLY.includes(action) && staff.role !== "staff_pharmacy")
      throw E.forbidden("Aksi ini hanya dapat dilakukan petugas farmasi.");

    const check = checkTransition(action, row.status as StageStatus, row.unit_type as UnitType);
    if (!check.ok) {
      // Status sudah berubah oleh petugas lain -> 409; urutan salah / aksi tak sesuai tahap -> 422. Status tidak ditimpa.
      if (check.reason === "already_applied") throw E.conflict(check.message);
      throw E.transition(check.message, [{ current_status: row.status, action }]);
    }

    const to = check.to;
    await c.query(
      `update ticket_stages
          set status = $2::text,
              started_at = case when $2::text = 'sedang_dilayani' then now() else started_at end,
              completed_at = case when $2::text in ('selesai','diserahkan') then now() else completed_at end,
              updated_at = now()
        where id = $1`,
      [ticketStageId, to],
    );
    await audit(c, {
      actorStaffUserId: staff.id,
      ticketId: row.ticket_id,
      ticketStageId,
      action,
      previousStatus: row.status,
      newStatus: to,
      metadata: { stage: row.stage_name, unit_id: row.unit_id },
    });

    let advanced: { stage: string; unit: string } | null = null;
    let visitStatus: "active" | "completed" = "active";
    let needsAdmin: UnitType | null = null;

    if (to === "selesai" || to === "diserahkan") {
      const { flow, missing } = buildFlow(await loadFlowCandidates(c, row.hospital_id), row.clinic_unit_id);
      const next = nextAfter(flow, missing, { unitId: row.unit_id, unitType: row.unit_type, sequence: row.sequence });
      if (next.kind === "next") {
        // FR-011: tahap berikutnya (mis. farmasi) menjadi tersedia
        const seq = await nextCounter(c, `stage:${next.stage.id}`, row.queue_date);
        const ins = await c.query(
          `insert into ticket_stages (ticket_id, service_stage_id, queue_date, status, queue_sequence)
           values ($1,$2,$3,'menunggu',$4) on conflict (ticket_id, service_stage_id) do nothing returning id`,
          [row.ticket_id, next.stage.id, row.queue_date, seq],
        );
        if (ins.rows[0]) {
          await audit(c, {
            actorStaffUserId: staff.id,
            ticketId: row.ticket_id,
            ticketStageId: ins.rows[0].id,
            action: "stage_advanced",
            newStatus: "menunggu",
            metadata: { stage: next.stage.name, unit: next.stage.unitName },
          });
        }
        await c.query(`update visits set needs_admin_action = null, updated_at = now() where id = $1`, [row.visit_id]);
        advanced = { stage: next.stage.name, unit: next.stage.unitName };
      } else if (next.kind === "needs_admin") {
        // Tahap berikutnya belum dikonfigurasi: tahap ini tetap tersimpan, tidak ada tahap fiktif (§14).
        await c.query(`update visits set needs_admin_action = $2, updated_at = now() where id = $1`, [row.visit_id, `needs_admin:${next.missing}`]);
        needsAdmin = next.missing;
        await audit(c, { actorStaffUserId: staff.id, ticketId: row.ticket_id, action: "flow_needs_admin", metadata: { missing: next.missing } });
      } else {
        await c.query(`update visits set status = 'completed', needs_admin_action = null, updated_at = now() where id = $1`, [row.visit_id]);
        visitStatus = "completed";
        await audit(c, { actorStaffUserId: staff.id, ticketId: row.ticket_id, action: "visit_completed", newStatus: "completed" });
      }
    }

    const { ticket_stage, ticket } = await fetchStageWithTicket(c, ticketStageId);
    return { ticket_stage, ticket, advanced_to: advanced, visit_status: visitStatus, needs_admin: needsAdmin };
  });
}
