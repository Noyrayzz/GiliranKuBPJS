import type { PoolClient } from "pg";
import { config } from "../config";
import { query, tx } from "../db";
import { E } from "../errors";
import { hashPassword, hashToken } from "../security";
import { todayLocal } from "../time";
import { audit, nextCounter } from "./audit";
import type { StaffContext } from "./auth";
import { formatTicketNumber } from "../domain";

// Semua data di sini fiktif (PRD §13.15). NIK/KK/MR di bawah bukan milik orang sungguhan.
export const DEMO_HOSPITAL = "RSU Giliranku Demo";
export const DEMO_PASSWORD = "demo12345";
export const DEMO_ACCOUNTS = [
  { username: "admin", role: "admin", unit: null, label: "Admin rumah sakit" },
  { username: "daftar", role: "staff_registration", unit: "Pendaftaran Rawat Jalan", label: "Petugas pendaftaran" },
  { username: "poli", role: "staff_clinic", unit: "Poli Penyakit Dalam", label: "Petugas poli" },
  { username: "farmasi", role: "staff_pharmacy", unit: "Farmasi Rawat Jalan", label: "Petugas farmasi" },
] as const;
export const DEMO_QR_CODE = "poli-dalam";

const DEMO_PATIENTS = [
  { name: "Siti Rahmawati", nik: "3515010101900001", mrn: "RM-004120" },
  { name: "Budi Hartono", nik: "3515010202850002", mrn: "RM-003877" },
  { name: "Dewi Lestari", nik: "3515010303920003", mrn: "RM-005031" },
  { name: "Agus Prasetyo", nik: "3515010404780004", mrn: "RM-002265" },
  { name: "Ratna Wulandari", nik: "3515010505880005", mrn: "RM-004902" },
  { name: "Hendra Gunawan", nik: "3515010606700006", mrn: "RM-001348" },
] as const;

/** Pasien contoh pada baseline: lokasi tiap pasien di alur supaya dasbor langsung terlihat hidup. */
const DEMO_LAYOUT = ["farmasi_diproses", "poli_dilayani", "poli_dipanggil", "poli_menunggu", "poli_menunggu", "daftar_menunggu"] as const;

export function isDemoEnv(): boolean {
  return config.demoMode;
}

export function assertDemoEnv(): void {
  if (!config.demoMode) throw E.forbidden("Fitur demo dimatikan di lingkungan ini.");
}

async function ensureStructure(c: PoolClient) {
  let h = (await c.query(`select id from hospitals where name = $1`, [DEMO_HOSPITAL])).rows[0];
  if (!h) h = (await c.query(`insert into hospitals (name) values ($1) returning id`, [DEMO_HOSPITAL])).rows[0];

  const units: Record<string, { id: string; stageId: string }> = {};
  const defs = [
    { name: "Pendaftaran Rawat Jalan", type: "registration", stage: "Verifikasi pendaftaran", minutes: 5, thr: 3 },
    { name: "Poli Penyakit Dalam", type: "clinic", stage: "Pemeriksaan poli", minutes: 12, thr: 3 },
    { name: "Farmasi Rawat Jalan", type: "pharmacy", stage: "Penyiapan obat", minutes: 8, thr: 2 },
  ];
  for (const d of defs) {
    let u = (await c.query(`select id from service_units where hospital_id = $1 and lower(name) = lower($2)`, [h.id, d.name])).rows[0];
    if (!u) u = (await c.query(`insert into service_units (hospital_id, name, type) values ($1,$2,$3) returning id`, [h.id, d.name, d.type])).rows[0];
    let s = (await c.query(`select id from service_stages where service_unit_id = $1 and sequence = 1`, [u.id])).rows[0];
    if (!s)
      s = (
        await c.query(
          `insert into service_stages (service_unit_id, name, sequence, estimated_service_minutes, near_turn_threshold) values ($1,$2,1,$3,$4) returning id`,
          [u.id, d.stage, d.minutes, d.thr],
        )
      ).rows[0];
    units[d.type] = { id: u.id, stageId: s.id };
  }

  const hash = await hashPassword(DEMO_PASSWORD);
  for (const a of DEMO_ACCOUNTS) {
    const unitId = a.unit ? (await c.query(`select id from service_units where hospital_id = $1 and name = $2`, [h.id, a.unit])).rows[0]?.id : null;
    await c.query(
      `insert into staff_users (username, password_hash, role, service_unit_id) values ($1,$2,$3,$4)
       on conflict (lower(username)) do nothing`,
      [a.username, hash, a.role, unitId],
    );
  }

  await c.query(
    `insert into location_qr_codes (hospital_id, service_unit_id, code) values ($1,$2,$3) on conflict (code) do nothing`,
    [h.id, units.clinic.id, DEMO_QR_CODE],
  );
  await c.query(
    `insert into location_qr_codes (hospital_id, service_unit_id, code, status) values ($1,$2,$3,'inactive') on conflict (code) do nothing`,
    [h.id, units.clinic.id, "poli-dalam-lama"],
  );
  return { hospitalId: h.id as string, units };
}

async function ensureDemoVisits(c: PoolClient, hospitalId: string, units: Record<string, { id: string; stageId: string }>) {
  const date = todayLocal();
  const existing = (await c.query(`select count(*)::int as n from visits where hospital_id = $1 and visit_date = $2`, [hospitalId, date])).rows[0].n;
  if (existing > 0) return 0; // idempoten: seed kedua tidak menggandakan data (FR-024 AC2)

  const staff = Object.fromEntries(
    (await c.query(`select id, username from staff_users where username in ('daftar','poli','farmasi')`)).rows.map((r: any) => [r.username, r.id]),
  );

  let made = 0;
  for (let i = 0; i < DEMO_PATIENTS.length; i++) {
    const p = DEMO_PATIENTS[i];
    const layout = DEMO_LAYOUT[i];
    const pat = (
      await c.query(
        `insert into patients (national_identity_number, medical_record_number, display_name) values ($1,$2,$3)
         on conflict (national_identity_number, medical_record_number) do update set display_name = excluded.display_name returning id`,
        [p.nik, p.mrn, p.name],
      )
    ).rows[0];
    // Token demo acak sekali pakai: hasilnya tidak diketahui siapa pun, tautan tiket baru dibuat lewat pendaftaran sungguhan.
    const v = (
      await c.query(
        `insert into visits (patient_id, hospital_id, clinic_unit_id, visit_date, access_token_hash) values ($1,$2,$3,$4,$5) returning id`,
        [pat.id, hospitalId, units.clinic.id, date, hashToken(`demo-${i}-${Math.random()}`)],
      )
    ).rows[0];
    const number = formatTicketNumber(await nextCounter(c, `ticket:${hospitalId}`, date));
    const t = (await c.query(`insert into tickets (visit_id, hospital_id, ticket_date, ticket_number) values ($1,$2,$3,$4) returning id`, [v.id, hospitalId, date, number])).rows[0];
    made++;

    const stageRow = async (unitType: "registration" | "clinic" | "pharmacy", status: string, actor: string | null) => {
      const seq = await nextCounter(c, `stage:${units[unitType].stageId}`, date);
      const r = (
        await c.query(
          `insert into ticket_stages (ticket_id, service_stage_id, queue_date, status, queue_sequence, called_at, started_at, completed_at)
           values ($1,$2,$3,$4,$5,
             case when $4 in ('dipanggil','sedang_dilayani','selesai','siap_diambil','diserahkan') then now() end,
             case when $4 in ('sedang_dilayani','selesai','siap_diambil','diserahkan') then now() end,
             case when $4 in ('selesai','diserahkan') then now() end) returning id`,
          [t.id, units[unitType].stageId, date, status, seq],
        )
      ).rows[0];
      await audit(c, { actorStaffUserId: actor, ticketId: t.id, ticketStageId: r.id, action: "demo_seed", newStatus: status, metadata: { unit_type: unitType, ticket_number: number } });
    };

    switch (layout) {
      case "farmasi_diproses":
        await stageRow("registration", "selesai", staff.daftar);
        await stageRow("clinic", "selesai", staff.poli);
        await stageRow("pharmacy", "sedang_dilayani", staff.farmasi);
        break;
      case "poli_dilayani":
        await stageRow("registration", "selesai", staff.daftar);
        await stageRow("clinic", "sedang_dilayani", staff.poli);
        break;
      case "poli_dipanggil":
        await stageRow("registration", "selesai", staff.daftar);
        await stageRow("clinic", "dipanggil", staff.poli);
        break;
      case "poli_menunggu":
        await stageRow("registration", "selesai", staff.daftar);
        await stageRow("clinic", "menunggu", null);
        break;
      case "daftar_menunggu":
        await stageRow("registration", "menunggu", null);
        break;
    }
  }
  return made;
}

/** Hanya struktur (rumah sakit, unit, tahap, akun, QR) tanpa tiket contoh. Dipakai harness acceptance agar antrean mulai kosong. */
export async function seedStructure() {
  return tx(async (c) => ensureStructure(c));
}

/** Idempoten: membuat struktur + akun + QR bila belum ada, dan tiket contoh hari ini bila belum ada. */
export async function seedDemo(admin: StaffContext | null) {
  const out = await tx(async (c) => {
    const { hospitalId, units } = await ensureStructure(c);
    const created = await ensureDemoVisits(c, hospitalId, units);
    if (admin) await audit(c, { actorStaffUserId: admin.id, action: "demo_seed", metadata: { created_visits: created } });
    return { hospitalId, created };
  });
  return summary(out.hospitalId, out.created);
}

/**
 * Reset ke kondisi awal (FR-025): menghapus data operasional + akun + token tiket, lalu seed ulang.
 * Token lama otomatis tidak berlaku karena visit_tokens ikut terhapus (§14). TRUNCATE audit_logs hanya
 * lolos karena flag lokal transaksi `giliranku.allow_reset` (lihat trigger di schema.sql).
 */
export async function resetDemo(admin: StaffContext | null) {
  assertDemoEnv();
  const out = await tx(async (c) => {
    await c.query(`select set_config('giliranku.allow_reset', 'on', true)`);
    await c.query(
      `truncate audit_logs, ticket_stages, tickets, visit_tokens, visits, patients, daily_counters,
                staff_sessions, staff_users, location_qr_codes, service_stages, service_units, hospitals restart identity cascade`,
    );
    const { hospitalId, units } = await ensureStructure(c);
    const created = await ensureDemoVisits(c, hospitalId, units);
    return { hospitalId, created };
  });
  return { ...(await summary(out.hospitalId, out.created)), reset: true, signed_out: Boolean(admin) };
}

async function summary(hospitalId: string, created: number) {
  const n = async (sql: string, p: unknown[] = []) => (await query(sql, p)).rows[0].n as number;
  return {
    hospital: (await query(`select id, name from hospitals where id = $1`, [hospitalId])).rows[0],
    created_visits: created,
    counts: {
      service_units: await n(`select count(*)::int as n from service_units where hospital_id = $1`, [hospitalId]),
      service_stages: await n(`select count(*)::int as n from service_stages ss join service_units su on su.id = ss.service_unit_id where su.hospital_id = $1`, [hospitalId]),
      patients: await n(`select count(*)::int as n from patients`),
      visits: await n(`select count(*)::int as n from visits where hospital_id = $1`, [hospitalId]),
      tickets: await n(`select count(*)::int as n from tickets where hospital_id = $1`, [hospitalId]),
    },
    demo_accounts: DEMO_ACCOUNTS.map((a) => ({ username: a.username, role: a.role })),
    demo_password: DEMO_PASSWORD,
    demo_qr_code: DEMO_QR_CODE,
  };
}
