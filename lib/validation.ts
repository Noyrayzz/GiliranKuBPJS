import { z } from "zod";
import { E, isUuid } from "./errors";

// Pesan galat bawaan Zod (tipe salah, enum salah, body bukan objek) diterjemahkan ke Bahasa Indonesia (NFR-010).
// Pesan khusus di bawah tetap menimpa locale ini.
z.config(z.locales.id());

// Pesan galat Bahasa Indonesia (NFR-010). Validasi server-side untuk semua endpoint yang menerima input (NFR-007).

const required = (label: string) => ({ error: `${label} wajib diisi.` });

const nik16 = (label: string) =>
  z
    .string(required(label))
    .trim()
    .min(1, `${label} wajib diisi.`)
    .transform((s) => s.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{16}$/, `${label} harus 16 digit angka.`));

export const patientVisitSchema = z.object({
  national_identity_number: nik16("NIK"),
  family_card_number: z
    .string()
    .nullish()
    .transform((v, ctx) => {
      const s = (v ?? "").trim().replace(/[\s-]/g, "");
      if (s === "") return null; // KK opsional
      if (!/^\d{16}$/.test(s)) {
        ctx.issues.push({ code: "custom", message: "Nomor KK harus 16 digit angka.", input: v });
        return z.NEVER;
      }
      return s;
    }),
  medical_record_number: z
    .string(required("Nomor rekam medis"))
    .trim()
    .min(1, "Nomor rekam medis wajib diisi.")
    .transform((s) => s.toUpperCase())
    .pipe(
      z
        .string()
        .regex(/^[A-Z0-9][A-Z0-9./-]{2,19}$/, "Nomor rekam medis 3–20 karakter: huruf, angka, titik, garis miring, atau strip."),
    ),
  display_name: z
    .string(required("Nama"))
    .trim()
    .min(2, "Nama minimal 2 karakter.")
    .max(80, "Nama maksimal 80 karakter.")
    .regex(/^[\p{L}][\p{L}\p{M}.'’ -]*$/u, "Nama hanya boleh berisi huruf, spasi, titik, apostrof, dan strip."),
  hospital_id: z.string(required("Rumah sakit")).refine(isUuid, "Rumah sakit tidak valid."),
  service_unit_id: z.string(required("Poli")).refine(isUuid, "Poli tidak valid."),
  visit_date: z
    .string(required("Tanggal kunjungan"))
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal kunjungan harus berformat TTTT-BB-HH."),
});
export type PatientVisitInput = z.infer<typeof patientVisitSchema>;

export const loginSchema = z.object({
  username: z.string(required("Nama pengguna")).trim().min(1, "Nama pengguna wajib diisi.").max(64),
  password: z.string(required("Kata sandi")).min(1, "Kata sandi wajib diisi.").max(256),
});

const unitName = z
  .string(required("Nama unit"))
  .trim()
  .min(2, "Nama unit minimal 2 karakter.")
  .max(80, "Nama unit maksimal 80 karakter.");
const unitType = z.enum(["registration", "clinic", "pharmacy"], { error: "Jenis unit harus registration, clinic, atau pharmacy." });
const activeStatus = z.enum(["active", "inactive"], { error: "Status harus active atau inactive." });

export const createUnitSchema = z.object({ name: unitName, type: unitType });
export const patchUnitSchema = z
  .object({ name: unitName.optional(), status: activeStatus.optional() })
  .refine((v) => v.name !== undefined || v.status !== undefined, "Tidak ada perubahan yang dikirim.");

const minutes = z
  .number({ error: "Durasi estimasi harus berupa angka." })
  .int("Durasi estimasi harus bilangan bulat (menit).")
  .positive("Durasi estimasi harus lebih besar dari 0.")
  .max(600, "Durasi estimasi maksimal 600 menit.");
const threshold = z
  .number({ error: "Ambang giliran dekat harus berupa angka." })
  .int("Ambang giliran dekat harus bilangan bulat.")
  .min(0, "Ambang giliran dekat tidak boleh negatif.")
  .max(50, "Ambang giliran dekat maksimal 50.");
const stageName = z.string(required("Nama tahap")).trim().min(2, "Nama tahap minimal 2 karakter.").max(80);
const sequence = z
  .number({ error: "Urutan tahap harus berupa angka." })
  .int("Urutan tahap harus bilangan bulat.")
  .positive("Urutan tahap harus lebih besar dari 0.");

export const createStageSchema = z.object({
  name: stageName,
  sequence,
  estimated_service_minutes: minutes.nullish(),
  near_turn_threshold: threshold,
});
export const patchStageSchema = z
  .object({
    name: stageName.optional(),
    sequence: sequence.optional(),
    estimated_service_minutes: minutes.optional(),
    near_turn_threshold: threshold.optional(),
    status: activeStatus.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Tidak ada perubahan yang dikirim.");

const role = z.enum(["staff_registration", "staff_clinic", "staff_pharmacy", "admin"], { error: "Peran tidak dikenal." });
export const createStaffSchema = z.object({
  username: z
    .string(required("Nama pengguna"))
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, "Nama pengguna 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau strip."),
  password: z.string(required("Kata sandi")).min(8, "Kata sandi minimal 8 karakter.").max(128, "Kata sandi maksimal 128 karakter."),
  role,
  service_unit_id: z.string().refine(isUuid, "Unit tidak valid.").nullish(),
});
export const patchStaffSchema = z
  .object({
    role: role.optional(),
    service_unit_id: z.string().refine(isUuid, "Unit tidak valid.").nullable().optional(),
    status: activeStatus.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Tidak ada perubahan yang dikirim.");

export const patchQrSchema = z.object({ status: activeStatus });

export const queueQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat TTTT-BB-HH.")
    .optional(),
  service_stage_id: z.string().refine(isUuid, "Tahap tidak valid.").optional(),
});

export const auditQuerySchema = z.object({
  ticket_id: z.string().refine(isUuid, "Tiket tidak valid.").optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_from harus berformat TTTT-BB-HH.").optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_to harus berformat TTTT-BB-HH.").optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Parse dengan Zod lalu ubah galat menjadi VALIDATION_ERROR berbahasa Indonesia dengan detail per field. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const details = r.error.issues.map((i) => ({ field: i.path.join(".") || "(body)", message: i.message }));
  throw E.validation(details[0]?.message ?? "Data yang dikirim belum valid.", details);
}
