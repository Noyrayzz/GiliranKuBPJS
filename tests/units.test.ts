import { describe, expect, it } from "vitest";
import { AppError } from "../lib/errors";
import { redact } from "../lib/log";
import { hashPassword, hashToken, newToken, verifyPassword } from "../lib/security";
import { addDays, isValidIsoDate } from "../lib/time";
import { createStageSchema, createStaffSchema, parse, patchStageSchema, patientVisitSchema } from "../lib/validation";

const valid = {
  national_identity_number: "3515010101900001",
  medical_record_number: "rm-004120",
  display_name: "Siti Rahmawati",
  hospital_id: "73b7913f-f0ff-4091-9b6d-bee451224c80",
  service_unit_id: "73b7913f-f0ff-4091-9b6d-bee451224c81",
  visit_date: "2026-11-18",
};

const message = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.message;
    throw e;
  }
  return "(tidak ada error)";
};

describe("FR-001/FR-004 validasi formulir pasien", () => {
  it("data valid diterima; MRN dinormalkan ke huruf besar; NIK dibersihkan", () => {
    const r = parse(patientVisitSchema, { ...valid, national_identity_number: "3515 0101 0190 0001" });
    expect(r.medical_record_number).toBe("RM-004120");
    expect(r.national_identity_number).toBe("3515010101900001");
    expect(r.family_card_number).toBeNull();
  });
  it("nomor rekam medis kosong ditolak dengan pesan Indonesia (FR-001 AC2)", () => {
    expect(message(() => parse(patientVisitSchema, { ...valid, medical_record_number: "" }))).toBe("Nomor rekam medis wajib diisi.");
    expect(message(() => parse(patientVisitSchema, { ...valid, medical_record_number: "   " }))).toBe("Nomor rekam medis wajib diisi.");
  });
  it("NIK kosong / bukan 16 digit ditolak", () => {
    expect(message(() => parse(patientVisitSchema, { ...valid, national_identity_number: "" }))).toBe("NIK wajib diisi.");
    expect(message(() => parse(patientVisitSchema, { ...valid, national_identity_number: "12345" }))).toBe("NIK harus 16 digit angka.");
    expect(message(() => parse(patientVisitSchema, { ...valid, national_identity_number: "35150101019000AB" }))).toBe("NIK harus 16 digit angka.");
  });
  it("field hilang total ditolak, bukan error 500", () => {
    expect(message(() => parse(patientVisitSchema, {}))).toMatch(/wajib diisi/);
    expect(message(() => parse(patientVisitSchema, null))).not.toBe("(tidak ada error)");
  });
  it("KK opsional tetapi bila diisi harus 16 digit", () => {
    expect(parse(patientVisitSchema, { ...valid, family_card_number: "3515010101900009" }).family_card_number).toBe("3515010101900009");
    expect(message(() => parse(patientVisitSchema, { ...valid, family_card_number: "99" }))).toBe("Nomor KK harus 16 digit angka.");
  });
  it("hospital/unit bukan UUID ditolak", () => {
    expect(message(() => parse(patientVisitSchema, { ...valid, hospital_id: "abc" }))).toBe("Rumah sakit tidak valid.");
  });
  it("detail menyebut field yang salah", () => {
    try {
      parse(patientVisitSchema, { ...valid, medical_record_number: "" });
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.status).toBe(400);
      expect(JSON.stringify(err.details)).toContain("medical_record_number");
    }
  });
});

describe("FR-022 konfigurasi tahap", () => {
  const base = { name: "Pemeriksaan", sequence: 1, estimated_service_minutes: 10, near_turn_threshold: 2 };
  it("durasi positif dan ambang >= 0 diterima", () => {
    expect(parse(createStageSchema, base).estimated_service_minutes).toBe(10);
    expect(parse(createStageSchema, { ...base, near_turn_threshold: 0 }).near_turn_threshold).toBe(0);
  });
  it("durasi nol atau negatif ditolak (FR-022 AC2)", () => {
    expect(message(() => parse(createStageSchema, { ...base, estimated_service_minutes: 0 }))).toBe("Durasi estimasi harus lebih besar dari 0.");
    expect(message(() => parse(createStageSchema, { ...base, estimated_service_minutes: -5 }))).toBe("Durasi estimasi harus lebih besar dari 0.");
  });
  it("ambang negatif atau pecahan ditolak", () => {
    expect(message(() => parse(createStageSchema, { ...base, near_turn_threshold: -1 }))).toBe("Ambang giliran dekat tidak boleh negatif.");
    expect(message(() => parse(createStageSchema, { ...base, near_turn_threshold: 1.5 }))).toBe("Ambang giliran dekat harus bilangan bulat.");
  });
  it("PATCH kosong ditolak", () => expect(message(() => parse(patchStageSchema, {}))).toBe("Tidak ada perubahan yang dikirim."));
});

describe("FR-023 akun staf", () => {
  it("password minimal 8 karakter, role harus dikenal", () => {
    const ok = { username: "Petugas.Satu", password: "rahasia123", role: "staff_clinic", service_unit_id: "73b7913f-f0ff-4091-9b6d-bee451224c81" };
    expect(parse(createStaffSchema, ok).username).toBe("petugas.satu");
    expect(message(() => parse(createStaffSchema, { ...ok, password: "pendek" }))).toBe("Kata sandi minimal 8 karakter.");
    expect(message(() => parse(createStaffSchema, { ...ok, role: "superuser" }))).toBe("Peran tidak dikenal.");
  });
});

describe("keamanan", () => {
  it("token acak, panjang cukup, dan unik; hash deterministik dan bukan token mentah", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toContain(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("password di-hash adaptif (salt acak) dan diverifikasi benar/salah", async () => {
    const h1 = await hashPassword("demo12345");
    const h2 = await hashPassword("demo12345");
    expect(h1).not.toBe(h2);
    expect(h1.startsWith("scrypt$")).toBe(true);
    expect(h1).not.toContain("demo12345");
    expect(await verifyPassword("demo12345", h1)).toBe(true);
    expect(await verifyPassword("salah", h1)).toBe(false);
    expect(await verifyPassword("demo12345", "bukan-hash")).toBe(false);
  });
  it("log menyamarkan password/token/NIK (PRD §13.11)", () => {
    const out = redact({ username: "poli", password: "x", session_token: "y", national_identity_number: "123", nested: { authorization: "Bearer z", ok: 1 } }) as any;
    expect(out.username).toBe("poli");
    expect(out.password).toBe("[disamarkan]");
    expect(out.session_token).toBe("[disamarkan]");
    expect(out.national_identity_number).toBe("[disamarkan]");
    expect(out.nested.authorization).toBe("[disamarkan]");
    expect(out.nested.ok).toBe(1);
  });
});

describe("tanggal", () => {
  it("validasi tanggal ISO dan aritmetika hari", () => {
    expect(isValidIsoDate("2026-11-18")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("18-11-2026")).toBe(false);
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
