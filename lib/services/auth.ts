import { query } from "../db";
import { config } from "../config";
import { E } from "../errors";
import { getCookie } from "../http";
import { limitOrThrow, rateBlocked, rateRecord } from "../ratelimit";
import { burnPasswordCheck, hashToken, newToken, verifyPassword } from "../security";
import type { StaffRole, UnitType } from "../domain";

export const SESSION_COOKIE = "gk_session";
const COOKIE_MAX_AGE_SEC = 12 * 3600; // batas atas cookie; kedaluwarsa idle 30 menit dipaksa di server (NFR-006)

export interface StaffContext {
  id: string;
  sessionId: string;
  username: string;
  role: StaffRole;
  serviceUnitId: string | null;
  unitName: string | null;
  unitType: UnitType | null;
  hospitalId: string | null;
}

export function sessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE_SEC}`,
  ];
  if (config.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (config.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

/** Bidang StaffUser yang aman dikirim ke client: tidak pernah password_hash (PRD §10.5). */
export function publicStaff(s: StaffContext) {
  return {
    id: s.id,
    username: s.username,
    role: s.role,
    service_unit_id: s.serviceUnitId,
    service_unit: s.serviceUnitId
      ? { id: s.serviceUnitId, name: s.unitName, type: s.unitType, hospital_id: s.hospitalId }
      : null,
  };
}

const BAD_CREDENTIALS = "Nama pengguna atau kata sandi salah.";

export async function login(username: string, password: string, ip: string) {
  // Per IP: semua percobaan. Per nama pengguna: hanya percobaan GAGAL, supaya login sah staf tidak menghabiskan batasnya.
  limitOrThrow(`login:ip:${ip}`, config.rate.loginPerMin);
  const failKey = `login:fail:${username.toLowerCase()}`;
  const gate = rateBlocked(failKey, config.rate.loginPerMin);
  if (gate.blocked) throw E.rateLimited(gate.retryAfter);

  const r = await query(
    `select s.id, s.username, s.password_hash, s.role, s.status, s.service_unit_id,
            u.name as unit_name, u.type as unit_type, u.hospital_id
       from staff_users s left join service_units u on u.id = s.service_unit_id
      where lower(s.username) = lower($1)`,
    [username],
  );
  const row = r.rows[0];
  if (!row) {
    await burnPasswordCheck(password); // samakan waktu respons agar username tidak bisa ditebak
    rateRecord(failKey); // nama tak dikenal ikut dihitung: batas tidak membocorkan keberadaan akun
    throw E.unauthenticated(BAD_CREDENTIALS);
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    rateRecord(failKey);
    throw E.unauthenticated(BAD_CREDENTIALS);
  }
  if (row.status !== "active") throw E.unauthenticated("Akun ini dinonaktifkan. Hubungi admin rumah sakit.");

  const token = newToken();
  const s = await query(`insert into staff_sessions (token_hash, staff_user_id) values ($1,$2) returning id`, [
    hashToken(token),
    row.id,
  ]);
  await query(`delete from staff_sessions where last_seen_at < now() - interval '1 day'`); // sapu sesi lama
  const staff: StaffContext = {
    id: row.id,
    sessionId: s.rows[0].id,
    username: row.username,
    role: row.role,
    serviceUnitId: row.service_unit_id,
    unitName: row.unit_name,
    unitType: row.unit_type,
    hospitalId: row.hospital_id,
  };
  return { token, staff };
}

export async function logout(token: string | null): Promise<void> {
  if (token) await query(`delete from staff_sessions where token_hash = $1`, [hashToken(token)]);
}

/** Sesi aktif dari cookie, atau null. Idle > SESSION_IDLE_MINUTES => sesi dihapus (NFR-006); akun nonaktif => ditolak. */
export async function getStaff(req: Request): Promise<StaffContext | null> {
  return getStaffByToken(getCookie(req, SESSION_COOKIE));
}

export async function getStaffByToken(token: string | null | undefined): Promise<StaffContext | null> {
  if (!token) return null;
  const r = await query(
    `select ss.id as session_id, extract(epoch from (now() - ss.last_seen_at)) as idle_sec,
            s.id, s.username, s.role, s.status, s.service_unit_id,
            u.name as unit_name, u.type as unit_type, u.hospital_id
       from staff_sessions ss
       join staff_users s on s.id = ss.staff_user_id
       left join service_units u on u.id = s.service_unit_id
      where ss.token_hash = $1`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  if (!row) return null;
  const idleSec = Number(row.idle_sec);
  if (row.status !== "active" || idleSec > config.sessionIdleMinutes * 60) {
    await query(`delete from staff_sessions where id = $1`, [row.session_id]);
    return null;
  }
  if (idleSec > 15) await query(`update staff_sessions set last_seen_at = now() where id = $1`, [row.session_id]);
  return {
    id: row.id,
    sessionId: row.session_id,
    username: row.username,
    role: row.role,
    serviceUnitId: row.service_unit_id,
    unitName: row.unit_name,
    unitType: row.unit_type,
    hospitalId: row.hospital_id,
  };
}

export async function requireStaff(req: Request): Promise<StaffContext> {
  const s = await getStaff(req);
  if (!s) throw E.unauthenticated();
  return s;
}

export async function requireAdmin(req: Request): Promise<StaffContext> {
  const s = await requireStaff(req);
  if (s.role !== "admin") throw E.forbidden("Fungsi ini hanya untuk admin rumah sakit.");
  return s;
}

/** Membaca antrean: petugas hanya unitnya sendiri; admin boleh memantau semua unit (hanya baca). */
export function assertUnitRead(s: StaffContext, unitId: string): void {
  if (s.role === "admin") return;
  if (s.serviceUnitId !== unitId) throw E.forbidden("Anda hanya dapat melihat antrean unit Anda sendiri.");
}

/** Mengubah status tiket: hanya petugas unit tersebut. Admin tidak mengoperasikan antrean. */
export function assertUnitOperate(s: StaffContext, unitId: string): void {
  if (s.role === "admin") throw E.forbidden("Akun admin tidak dapat mengubah antrean. Gunakan akun petugas unit.");
  if (s.serviceUnitId !== unitId) throw E.forbidden("Anda tidak memiliki akses ke unit ini.");
}
