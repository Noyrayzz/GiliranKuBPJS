import type { PoolClient } from "pg";
import { isUniqueViolation, query, tx } from "../db";
import { E, isUuid } from "../errors";
import { hashPassword } from "../security";
import { ROLE_UNIT_TYPE, buildFlow, nextAfter, type StaffRole } from "../domain";
import { audit, nextCounter } from "./audit";
import type { StaffContext } from "./auth";
import { loadFlowCandidates } from "./flow";

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const unitDto = (r: any) => ({
  id: r.id,
  hospital_id: r.hospital_id,
  name: r.name,
  type: r.type,
  status: r.status,
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
});
const stageDto = (r: any) => ({
  id: r.id,
  service_unit_id: r.service_unit_id,
  name: r.name,
  sequence: r.sequence,
  estimated_service_minutes: r.estimated_service_minutes,
  near_turn_threshold: r.near_turn_threshold,
  status: r.status,
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
});
const staffDto = (r: any) => ({
  id: r.id,
  username: r.username,
  role: r.role,
  service_unit_id: r.service_unit_id,
  service_unit_name: r.unit_name ?? null,
  status: r.status,
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
});

function assertOwnHospital(admin: StaffContext, hospitalId: string) {
  // Admin terikat pada satu rumah sakit (MVP). Tanpa unit, admin dianggap admin satu-satunya rumah sakit.
  if (admin.hospitalId && admin.hospitalId !== hospitalId) throw E.forbidden("Anda tidak mengelola rumah sakit ini.");
}

/**
 * Tiket yang berhenti karena tahap berikutnya belum dikonfigurasi (PRD §14) dilanjutkan otomatis begitu admin
 * mengaktifkan unit/tahap yang kurang. Dipanggil di transaksi yang sama dengan perubahan konfigurasinya.
 */
export async function resumeStalledFlows(c: PoolClient, hospitalId: string, actorId: string | null): Promise<number> {
  const stalled = await c.query(
    `select v.id as visit_id, v.clinic_unit_id, t.id as ticket_id
       from visits v join tickets t on t.visit_id = v.id
      where v.hospital_id = $1 and v.status = 'active' and v.needs_admin_action is not null
      for update of v`,
    [hospitalId],
  );
  if (stalled.rows.length === 0) return 0;
  const candidates = await loadFlowCandidates(c, hospitalId);
  let advanced = 0;
  for (const v of stalled.rows) {
    const { flow, missing } = buildFlow(candidates, v.clinic_unit_id);
    const last = (
      await c.query(
        `select ts.queue_date, ss.sequence, su.id as unit_id, su.type as unit_type
           from ticket_stages ts
           join service_stages ss on ss.id = ts.service_stage_id
           join service_units su on su.id = ss.service_unit_id
          where ts.ticket_id = $1
          order by ts.completed_at desc nulls last, ts.created_at desc limit 1`,
        [v.ticket_id],
      )
    ).rows[0];
    if (!last) continue;
    const next = nextAfter(flow, missing, { unitId: last.unit_id, unitType: last.unit_type, sequence: last.sequence });
    if (next.kind === "next") {
      const seq = await nextCounter(c, `stage:${next.stage.id}`, last.queue_date);
      const ins = await c.query(
        `insert into ticket_stages (ticket_id, service_stage_id, queue_date, status, queue_sequence)
         values ($1,$2,$3,'menunggu',$4) on conflict (ticket_id, service_stage_id) do nothing returning id`,
        [v.ticket_id, next.stage.id, last.queue_date, seq],
      );
      await c.query(`update visits set needs_admin_action = null, updated_at = now() where id = $1`, [v.visit_id]);
      if (ins.rows[0]) {
        advanced++;
        await audit(c, {
          actorStaffUserId: actorId,
          ticketId: v.ticket_id,
          ticketStageId: ins.rows[0].id,
          action: "stage_advanced",
          newStatus: "menunggu",
          metadata: { stage: next.stage.name, unit: next.stage.unitName, reason: "config_fixed" },
        });
      }
    } else if (next.kind === "done") {
      await c.query(`update visits set status = 'completed', needs_admin_action = null, updated_at = now() where id = $1`, [v.visit_id]);
      await audit(c, { actorStaffUserId: actorId, ticketId: v.ticket_id, action: "visit_completed", newStatus: "completed" });
    }
  }
  return advanced;
}

export async function defaultHospitalId(): Promise<string | null> {
  const r = await query(`select id from hospitals where status = 'active' order by created_at limit 1`);
  return r.rows[0]?.id ?? null;
}

// ------------------------------------------------------------------ unit (FR-021)

export async function listUnits(hospitalId: string) {
  if (!isUuid(hospitalId)) throw E.notFound("Rumah sakit tidak ditemukan.");
  const u = await query(`select * from service_units where hospital_id = $1 order by created_at, name`, [hospitalId]);
  const s = await query(
    `select ss.* from service_stages ss join service_units su on su.id = ss.service_unit_id
      where su.hospital_id = $1 order by ss.service_unit_id, ss.sequence`,
    [hospitalId],
  );
  return u.rows.map((x: any) => ({
    ...unitDto(x),
    stages: s.rows.filter((st: any) => st.service_unit_id === x.id).map(stageDto),
  }));
}

export async function createUnit(admin: StaffContext, hospitalId: string, input: { name: string; type: string }) {
  if (!isUuid(hospitalId)) throw E.notFound("Rumah sakit tidak ditemukan.");
  assertOwnHospital(admin, hospitalId);
  const h = await query(`select id from hospitals where id = $1`, [hospitalId]);
  if (!h.rows[0]) throw E.notFound("Rumah sakit tidak ditemukan.");
  try {
    return await tx(async (c) => {
      const r = await c.query(`insert into service_units (hospital_id, name, type) values ($1,$2,$3) returning *`, [hospitalId, input.name, input.type]);
      await audit(c, { actorStaffUserId: admin.id, action: "unit_created", newStatus: "active", metadata: { unit_id: r.rows[0].id, name: input.name, type: input.type } });
      return unitDto(r.rows[0]);
    });
  } catch (e) {
    if (isUniqueViolation(e, "service_units_name_uq")) throw E.conflict(`Nama unit “${input.name}” sudah digunakan.`, [{ field: "name", message: "Nama unit sudah digunakan." }]);
    throw e;
  }
}

export async function patchUnit(admin: StaffContext, unitId: string, input: { name?: string; status?: string }) {
  if (!isUuid(unitId)) throw E.notFound("Unit tidak ditemukan.");
  try {
    return await tx(async (c) => {
      const cur = await c.query(`select * from service_units where id = $1 for update`, [unitId]);
      if (!cur.rows[0]) throw E.notFound("Unit tidak ditemukan.");
      assertOwnHospital(admin, cur.rows[0].hospital_id);
      const r = await c.query(
        `update service_units set name = coalesce($2, name), status = coalesce($3, status), updated_at = now() where id = $1 returning *`,
        [unitId, input.name ?? null, input.status ?? null],
      );
      await audit(c, {
        actorStaffUserId: admin.id,
        action: "unit_updated",
        previousStatus: cur.rows[0].status,
        newStatus: r.rows[0].status,
        metadata: { unit_id: unitId, name: r.rows[0].name },
      });
      if (r.rows[0].status === "active") await resumeStalledFlows(c, cur.rows[0].hospital_id, admin.id);
      return unitDto(r.rows[0]);
    });
  } catch (e) {
    if (isUniqueViolation(e, "service_units_name_uq")) throw E.conflict("Nama unit sudah digunakan.", [{ field: "name", message: "Nama unit sudah digunakan." }]);
    throw e;
  }
}

// ------------------------------------------------------------------ tahap (FR-022)

export async function createStage(
  admin: StaffContext,
  unitId: string,
  input: { name: string; sequence: number; estimated_service_minutes?: number | null; near_turn_threshold: number },
) {
  if (!isUuid(unitId)) throw E.notFound("Unit tidak ditemukan.");
  try {
    return await tx(async (c) => {
      const u = await c.query(`select hospital_id from service_units where id = $1`, [unitId]);
      if (!u.rows[0]) throw E.notFound("Unit tidak ditemukan.");
      assertOwnHospital(admin, u.rows[0].hospital_id);
      const r = await c.query(
        `insert into service_stages (service_unit_id, name, sequence, estimated_service_minutes, near_turn_threshold)
         values ($1,$2,$3,$4,$5) returning *`,
        [unitId, input.name, input.sequence, input.estimated_service_minutes ?? null, input.near_turn_threshold],
      );
      await audit(c, { actorStaffUserId: admin.id, action: "stage_created", metadata: { stage_id: r.rows[0].id, unit_id: unitId, name: input.name } });
      await resumeStalledFlows(c, u.rows[0].hospital_id, admin.id);
      return stageDto(r.rows[0]);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw E.conflict("Urutan tahap itu sudah dipakai di unit ini.", [{ field: "sequence", message: "Urutan sudah dipakai." }]);
    throw e;
  }
}

export async function patchStage(
  admin: StaffContext,
  stageId: string,
  input: { name?: string; sequence?: number; estimated_service_minutes?: number; near_turn_threshold?: number; status?: string },
) {
  if (!isUuid(stageId)) throw E.notFound("Tahap layanan tidak ditemukan.");
  try {
    return await tx(async (c) => {
      const cur = await c.query(
        `select ss.*, su.hospital_id from service_stages ss join service_units su on su.id = ss.service_unit_id where ss.id = $1 for update of ss`,
        [stageId],
      );
      if (!cur.rows[0]) throw E.notFound("Tahap layanan tidak ditemukan.");
      assertOwnHospital(admin, cur.rows[0].hospital_id);
      const r = await c.query(
        `update service_stages set
           name = coalesce($2, name), sequence = coalesce($3, sequence),
           estimated_service_minutes = coalesce($4, estimated_service_minutes),
           near_turn_threshold = coalesce($5, near_turn_threshold), status = coalesce($6, status), updated_at = now()
         where id = $1 returning *`,
        [stageId, input.name ?? null, input.sequence ?? null, input.estimated_service_minutes ?? null, input.near_turn_threshold ?? null, input.status ?? null],
      );
      await audit(c, {
        actorStaffUserId: admin.id,
        action: "stage_updated",
        previousStatus: cur.rows[0].status,
        newStatus: r.rows[0].status,
        metadata: {
          stage_id: stageId,
          minutes: r.rows[0].estimated_service_minutes,
          near_turn_threshold: r.rows[0].near_turn_threshold,
        },
      });
      if (r.rows[0].status === "active") await resumeStalledFlows(c, cur.rows[0].hospital_id, admin.id);
      return stageDto(r.rows[0]);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw E.conflict("Urutan tahap itu sudah dipakai di unit ini.", [{ field: "sequence", message: "Urutan sudah dipakai." }]);
    throw e;
  }
}

// ------------------------------------------------------------------ staf (FR-023)

export async function listStaff() {
  const r = await query(
    `select s.*, u.name as unit_name from staff_users s left join service_units u on u.id = s.service_unit_id order by s.created_at, s.username`,
  );
  return r.rows.map(staffDto);
}

async function assertRoleUnit(role: StaffRole, unitId: string | null | undefined) {
  if (role === "admin") return;
  if (!unitId) throw E.validation("Petugas wajib ditetapkan ke satu unit.", [{ field: "service_unit_id", message: "Unit wajib dipilih untuk petugas." }]);
  const u = await query(`select type, status from service_units where id = $1`, [unitId]);
  if (!u.rows[0]) throw E.validation("Unit tidak ditemukan.", [{ field: "service_unit_id", message: "Unit tidak ditemukan." }]);
  if (u.rows[0].type !== ROLE_UNIT_TYPE[role as Exclude<StaffRole, "admin">])
    throw E.validation("Peran tidak sesuai dengan jenis unit yang dipilih.", [{ field: "role", message: "Peran tidak sesuai dengan jenis unit." }]);
}

export async function createStaff(admin: StaffContext, input: { username: string; password: string; role: StaffRole; service_unit_id?: string | null }) {
  await assertRoleUnit(input.role, input.service_unit_id);
  const hash = await hashPassword(input.password);
  try {
    return await tx(async (c) => {
      const r = await c.query(
        `insert into staff_users (username, password_hash, role, service_unit_id) values ($1,$2,$3,$4) returning *`,
        [input.username, hash, input.role, input.role === "admin" ? null : input.service_unit_id],
      );
      await audit(c, { actorStaffUserId: admin.id, action: "staff_created", metadata: { staff_user_id: r.rows[0].id, username: input.username, role: input.role } });
      return staffDto(r.rows[0]);
    });
  } catch (e) {
    if (isUniqueViolation(e, "staff_users_username_uq")) throw E.conflict(`Nama pengguna “${input.username}” sudah digunakan.`, [{ field: "username", message: "Nama pengguna sudah digunakan." }]);
    throw e;
  }
}

export async function patchStaff(admin: StaffContext, staffId: string, input: { role?: StaffRole; service_unit_id?: string | null; status?: string }) {
  if (!isUuid(staffId)) throw E.notFound("Akun tidak ditemukan.");
  const cur = await query(`select * from staff_users where id = $1`, [staffId]);
  if (!cur.rows[0]) throw E.notFound("Akun tidak ditemukan.");
  if (staffId === admin.id && (input.status === "inactive" || (input.role && input.role !== "admin")))
    throw E.conflict("Anda tidak dapat menonaktifkan atau menurunkan akun Anda sendiri.");

  const role = (input.role ?? cur.rows[0].role) as StaffRole;
  const unit = input.service_unit_id !== undefined ? input.service_unit_id : cur.rows[0].service_unit_id;
  await assertRoleUnit(role, unit);

  return tx(async (c) => {
    const r = await c.query(
      `update staff_users set role = $2, service_unit_id = $3, status = coalesce($4, status), updated_at = now() where id = $1 returning *`,
      [staffId, role, role === "admin" ? null : unit, input.status ?? null],
    );
    // Akun yang dinonaktifkan kehilangan semua sesi seketika (FR-014 AC2).
    if (input.status === "inactive") await c.query(`delete from staff_sessions where staff_user_id = $1`, [staffId]);
    await audit(c, {
      actorStaffUserId: admin.id,
      action: "staff_updated",
      previousStatus: cur.rows[0].status,
      newStatus: r.rows[0].status,
      metadata: { staff_user_id: staffId, role },
    });
    return staffDto(r.rows[0]);
  });
}

// ------------------------------------------------------------------ audit log (FR-020, US-015)

export async function listAuditLogs(f: { ticket_id?: string; date_from?: string; date_to?: string; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.ticket_id) {
    params.push(f.ticket_id);
    where.push(`a.ticket_id = $${params.length}`);
  }
  if (f.date_from) {
    params.push(f.date_from);
    where.push(`(a.created_at at time zone 'Asia/Jakarta')::date >= $${params.length}::date`);
  }
  if (f.date_to) {
    params.push(f.date_to);
    where.push(`(a.created_at at time zone 'Asia/Jakarta')::date <= $${params.length}::date`);
  }
  params.push(f.limit ?? 100);
  const r = await query(
    `select a.id, a.actor_staff_user_id, s.username as actor_username, a.ticket_id, t.ticket_number, a.ticket_stage_id,
            a.action, a.previous_status, a.new_status, a.metadata, a.created_at
       from audit_logs a
       left join staff_users s on s.id = a.actor_staff_user_id
       left join tickets t on t.id = a.ticket_id
      ${where.length ? "where " + where.join(" and ") : ""}
      order by a.created_at desc, a.id limit $${params.length}`,
    params,
  );
  return r.rows.map((x: any) => ({ ...x, created_at: iso(x.created_at) }));
}

// ------------------------------------------------------------------ QR lokasi (FR-003)

export async function listQrCodes(hospitalId: string) {
  const r = await query(
    `select q.id, q.code, q.status, q.service_unit_id, u.name as unit_name, q.created_at
       from location_qr_codes q left join service_units u on u.id = q.service_unit_id
      where q.hospital_id = $1 order by q.created_at`,
    [hospitalId],
  );
  return r.rows.map((x: any) => ({ ...x, created_at: iso(x.created_at) }));
}

export async function patchQr(admin: StaffContext, qrId: string, status: string) {
  if (!isUuid(qrId)) throw E.notFound("QR tidak ditemukan.");
  return tx(async (c) => {
    const cur = await c.query(`select * from location_qr_codes where id = $1 for update`, [qrId]);
    if (!cur.rows[0]) throw E.notFound("QR tidak ditemukan.");
    assertOwnHospital(admin, cur.rows[0].hospital_id);
    const r = await c.query(`update location_qr_codes set status = $2, updated_at = now() where id = $1 returning *`, [qrId, status]);
    await audit(c, { actorStaffUserId: admin.id, action: "qr_updated", previousStatus: cur.rows[0].status, newStatus: status, metadata: { qr_id: qrId, code: cur.rows[0].code } });
    return { id: r.rows[0].id, code: r.rows[0].code, status: r.rows[0].status };
  });
}
