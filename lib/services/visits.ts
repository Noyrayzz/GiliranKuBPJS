import { config } from "../config";
import { isUniqueViolation, query, tx } from "../db";
import { E, isUuid } from "../errors";
import { limitOrThrow } from "../ratelimit";
import { hashToken, newToken } from "../security";
import { addDays, isValidIsoDate, todayLocal } from "../time";
import { buildFlow, formatTicketNumber, maskMedicalRecord, type FlowStage } from "../domain";
import type { PatientVisitInput } from "../validation";
import { audit, nextCounter } from "./audit";
import { loadFlowCandidates, stageViewSql, toStageDto } from "./flow";

const INVALID_LINK = "Tautan tiket tidak valid atau sudah berakhir. Minta tautan baru di loket pendaftaran.";

export const accessUrl = (origin: string, visitId: string, token: string): string =>
  `${origin}/tiket/${visitId}#${token}`;

const validUntil = (visitDate: string): string => addDays(visitDate, config.ticketValidDaysAfterVisit);

// ------------------------------------------------------------------ pembuatan tiket (FR-001..FR-004)

export async function createPatientVisit(input: PatientVisitInput, origin: string) {
  const today = todayLocal();
  const bad = (message: string) => E.validation(message, [{ field: "visit_date", message }]);
  if (!isValidIsoDate(input.visit_date)) throw bad("Tanggal kunjungan tidak valid.");
  if (input.visit_date < today) throw bad("Tanggal kunjungan tidak boleh sebelum hari ini.");
  if (input.visit_date > addDays(today, config.maxAdvanceDays))
    throw bad(`Tanggal kunjungan paling jauh ${config.maxAdvanceDays} hari dari hari ini.`);

  const ctx = await query(
    `select h.id as hospital_id, u.id as unit_id
       from hospitals h join service_units u on u.hospital_id = h.id
      where h.id = $1 and u.id = $2 and h.status = 'active' and u.status = 'active' and u.type = 'clinic'`,
    [input.hospital_id, input.service_unit_id],
  );
  if (!ctx.rows[0])
    throw E.validation("Rumah sakit atau poli yang dipilih tidak tersedia.", [
      { field: "service_unit_id", message: "Rumah sakit atau poli yang dipilih tidak tersedia." },
    ]);

  const token = newToken();
  let visitId: string;
  try {
    visitId = await tx(async (c) => {
      const p = await c.query(
        `insert into patients (national_identity_number, family_card_number, medical_record_number, display_name)
         values ($1,$2,$3,$4)
         on conflict (national_identity_number, medical_record_number) do update
           set display_name = excluded.display_name,
               family_card_number = coalesce(excluded.family_card_number, patients.family_card_number),
               updated_at = now()
         returning id`,
        [input.national_identity_number, input.family_card_number, input.medical_record_number, input.display_name],
      );
      const v = await c.query(
        `insert into visits (patient_id, hospital_id, clinic_unit_id, visit_date, access_token_hash)
         values ($1,$2,$3,$4,$5) returning id`,
        [p.rows[0].id, input.hospital_id, input.service_unit_id, input.visit_date, hashToken(token)],
      );
      const id: string = v.rows[0].id;

      const number = formatTicketNumber(await nextCounter(c, `ticket:${input.hospital_id}`, input.visit_date));
      const t = await c.query(
        `insert into tickets (visit_id, hospital_id, ticket_date, ticket_number) values ($1,$2,$3,$4) returning id`,
        [id, input.hospital_id, input.visit_date, number],
      );

      const { flow } = buildFlow(await loadFlowCandidates(c, input.hospital_id), input.service_unit_id);
      if (flow.length === 0) throw E.conflict("Layanan poli ini belum dikonfigurasi. Hubungi petugas pendaftaran rumah sakit.");
      const first = flow[0];
      const seq = await nextCounter(c, `stage:${first.id}`, input.visit_date);
      const ts = await c.query(
        `insert into ticket_stages (ticket_id, service_stage_id, queue_date, status, queue_sequence)
         values ($1,$2,$3,'menunggu',$4) returning id`,
        [t.rows[0].id, first.id, input.visit_date, seq],
      );
      await c.query(`insert into visit_tokens (visit_id, token_hash) values ($1,$2)`, [id, hashToken(token)]);
      await audit(c, {
        actorStaffUserId: null,
        ticketId: t.rows[0].id,
        ticketStageId: ts.rows[0].id,
        action: "ticket_created",
        newStatus: "menunggu",
        metadata: { ticket_number: number, visit_id: id, stage: first.name },
      });
      return id;
    });
  } catch (e) {
    // Pasien sudah punya tiket aktif pada kunjungan yang sama (indeks unik parsial) — juga menahan permintaan bersamaan (§14).
    if (isUniqueViolation(e, "visits_one_active_uq")) {
      const existing = await query(
        `select v.id, t.ticket_number from visits v
           join patients p on p.id = v.patient_id join tickets t on t.visit_id = v.id
          where p.national_identity_number = $1 and p.medical_record_number = $2
            and v.hospital_id = $3 and v.visit_date = $4 and v.status = 'active'`,
        [input.national_identity_number, input.medical_record_number, input.hospital_id, input.visit_date],
      );
      const row = existing.rows[0];
      if (row) {
        const fresh = newToken();
        await query(`insert into visit_tokens (visit_id, token_hash) values ($1,$2)`, [row.id, hashToken(fresh)]);
        throw E.conflict("Anda sudah memiliki tiket aktif untuk kunjungan ini. Buka tiket yang sudah ada.", [
          { code: "ACTIVE_TICKET_EXISTS", visit_id: row.id, ticket_number: row.ticket_number, access_url: accessUrl(origin, row.id, fresh) },
        ]);
      }
    }
    throw e;
  }

  const view = await loadVisitView(visitId);
  return { ...view, access_url: accessUrl(origin, visitId, token) };
}

// ------------------------------------------------------------------ akses tiket pasien (FR-005, §13)

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(h);
  return m ? m[1] : null;
}

/** Token valid untuk visit ini dan belum kedaluwarsa. Semua kegagalan memberi respons yang sama (tidak membocorkan keberadaan data). */
export async function authorizeVisit(visitId: string, token: string | null): Promise<{ id: string; status: string; visit_date: string }> {
  if (!token || !isUuid(visitId)) throw E.unauthenticated(INVALID_LINK);
  const r = await query(
    `select v.id, v.status, v.visit_date from visits v
       join visit_tokens t on t.visit_id = v.id where v.id = $1 and t.token_hash = $2`,
    [visitId, hashToken(token)],
  );
  const row = r.rows[0];
  if (!row || todayLocal() > validUntil(row.visit_date)) throw E.unauthenticated(INVALID_LINK);
  return row;
}

export async function refreshToken(visitId: string, token: string | null, origin: string) {
  const v = await authorizeVisit(visitId, token);
  if (v.status !== "active") throw E.conflict("Kunjungan ini sudah selesai atau dibatalkan, tautan tidak dapat diperbarui.");
  const fresh = newToken();
  await tx(async (c) => {
    await c.query(`delete from visit_tokens where visit_id = $1`, [visitId]);
    await c.query(`insert into visit_tokens (visit_id, token_hash) values ($1,$2)`, [visitId, hashToken(fresh)]);
    await c.query(`update visits set access_token_hash = $2, updated_at = now() where id = $1`, [visitId, hashToken(fresh)]);
  });
  return { access_url: accessUrl(origin, visitId, fresh) };
}

// ------------------------------------------------------------------ tampilan kunjungan (FR-006..FR-013)

export async function loadVisitView(visitId: string) {
  const r = await query(
    `select v.id, v.visit_date, v.status, v.needs_admin_action, v.created_at, v.updated_at, v.hospital_id,
            v.clinic_unit_id, h.name as hospital_name, cu.name as clinic_name,
            p.display_name, p.medical_record_number, t.id as ticket_id, t.ticket_number
       from visits v
       join hospitals h on h.id = v.hospital_id
       join service_units cu on cu.id = v.clinic_unit_id
       join patients p on p.id = v.patient_id
       join tickets t on t.visit_id = v.id
      where v.id = $1`,
    [visitId],
  );
  const v = r.rows[0];
  if (!v) throw E.notFound("Tiket tidak ditemukan.");

  const stageRows = await query(`${stageViewSql()} where ts.ticket_id = $1 order by ts.created_at, ts.queue_sequence`, [v.ticket_id]);
  const stages = stageRows.rows.map(toStageDto);

  // Tahap yang belum dimulai berasal dari konfigurasi alur, bukan baris tersimpan (tidak ada tahap fiktif).
  const { flow, missing } = buildFlow(await loadFlowCandidates({ query }, v.hospital_id), v.clinic_unit_id);
  const created = new Set(stages.map((s) => s.service_stage_id));
  const upcoming = v.status === "active" ? flow.filter((s: FlowStage) => !created.has(s.id)) : [];

  const [kind, missingType] = String(v.needs_admin_action ?? "").split(":");
  const noticeLabel: Record<string, string> = { registration: "Pendaftaran", clinic: "Poli", pharmacy: "Farmasi" };
  const flowNotice =
    kind === "needs_admin"
      ? `Tahap berikutnya (${noticeLabel[missingType] ?? "layanan"}) belum dikonfigurasi rumah sakit. Tiket Anda tetap tersimpan; petugas akan menindaklanjuti.`
      : null;

  return {
    visit: {
      id: v.id,
      visit_date: v.visit_date as string,
      status: v.status as string,
      valid_until: validUntil(v.visit_date),
      created_at: new Date(v.created_at).toISOString(),
      updated_at: new Date(v.updated_at).toISOString(),
    },
    hospital: { id: v.hospital_id, name: v.hospital_name },
    clinic: { id: v.clinic_unit_id, name: v.clinic_name },
    // Hanya identitas minimum; NIK/KK tidak pernah keluar dari server (PRD §13.13, NFR-008).
    patient: { display_name: v.display_name, medical_record_number: maskMedicalRecord(v.medical_record_number) },
    ticket: { id: v.ticket_id, ticket_number: v.ticket_number },
    ticket_stages: stages,
    upcoming_stages: upcoming.map((s: FlowStage) => ({
      service_stage_id: s.id,
      stage_name: s.name,
      unit_name: s.unitName,
      unit_type: s.unitType,
      estimated_service_minutes: s.minutes,
    })),
    flow_notice: flowNotice,
    missing_unit_types: missing,
    notifications: {
      near_turn: stages.some((s) => s.near_turn),
      ready_for_pickup: stages.some((s) => s.ready_for_pickup),
    },
  };
}

export async function getVisitForToken(visitId: string, token: string | null) {
  await authorizeVisit(visitId, token);
  return loadVisitView(visitId);
}

export async function getQueueForToken(visitId: string, token: string | null) {
  await authorizeVisit(visitId, token);
  const t = await query(`select id from tickets where visit_id = $1`, [visitId]);
  const r = await query(`${stageViewSql()} where ts.ticket_id = $1 order by ts.created_at, ts.queue_sequence`, [t.rows[0]?.id]);
  return { ticket_stages: r.rows.map(toStageDto) };
}

// ------------------------------------------------------------------ QR & opsi pendaftaran (FR-003)

export interface ClinicOption {
  id: string;
  name: string;
}
export interface HospitalOption {
  id: string;
  name: string;
  clinics: ClinicOption[];
}

export async function registrationOptions(): Promise<HospitalOption[]> {
  const r = await query(
    `select h.id as hospital_id, h.name as hospital_name, u.id as unit_id, u.name as unit_name
       from hospitals h join service_units u on u.hospital_id = h.id
      where h.status = 'active' and u.status = 'active' and u.type = 'clinic'
        and exists (select 1 from service_stages s where s.service_unit_id = u.id and s.status = 'active')
      order by h.created_at, u.created_at, u.name`,
  );
  const map = new Map<string, HospitalOption>();
  for (const x of r.rows) {
    const h: HospitalOption = map.get(x.hospital_id) ?? { id: x.hospital_id, name: x.hospital_name, clinics: [] };
    h.clinics.push({ id: x.unit_id, name: x.unit_name });
    map.set(x.hospital_id, h);
  }
  return [...map.values()];
}

/** Pencarian QR tanpa rate limit: dipakai render server halaman /daftar. Endpoint publik memakai resolveQr (dengan rate limit). */
export async function lookupQr(code: string) {
  const notValid = () => E.notFound("QR ini tidak berlaku atau sudah dinonaktifkan. Minta bantuan petugas pendaftaran.");
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(code)) throw notValid();
  const r = await query(
    `select q.code, h.id as hospital_id, h.name as hospital_name, u.id as unit_id, u.name as unit_name, u.type as unit_type
       from location_qr_codes q
       join hospitals h on h.id = q.hospital_id
       left join service_units u on u.id = q.service_unit_id
      where q.code = $1 and q.status = 'active' and h.status = 'active'
        and (q.service_unit_id is null or u.status = 'active')`,
    [code],
  );
  const row = r.rows[0];
  if (!row) throw notValid();

  const hospital = (await registrationOptions()).find((h) => h.id === row.hospital_id);
  const clinics = hospital?.clinics ?? [];
  const scoped = row.unit_id && row.unit_type === "clinic" ? clinics.filter((c) => c.id === row.unit_id) : clinics;
  if (scoped.length === 0) throw notValid();
  return {
    hospital: { id: row.hospital_id, name: row.hospital_name },
    service_unit: row.unit_id && row.unit_type === "clinic" ? { id: row.unit_id, name: row.unit_name } : null,
    registration: {
      hospital_id: row.hospital_id,
      service_unit_id: scoped.length === 1 ? scoped[0].id : null,
      visit_date: todayLocal(),
      clinics: scoped,
    },
  };
}

export async function resolveQr(code: string, ip: string) {
  limitOrThrow(`resolve:ip:${ip}`, config.rate.resolvePerMin);
  return lookupQr(code);
}
