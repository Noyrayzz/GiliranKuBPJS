// Logika domain murni (tanpa I/O) sehingga bisa diuji tanpa database. Sumber: PRD FR-007..FR-019.

export const STAGE_STATUSES = [
  "menunggu",
  "dipanggil",
  "sedang_dilayani",
  "selesai",
  "dilewati",
  "dibatalkan",
  "siap_diambil",
  "diserahkan",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export type UnitType = "registration" | "clinic" | "pharmacy";
export type StaffRole = "staff_registration" | "staff_clinic" | "staff_pharmacy" | "admin";

export const UNIT_TYPE_ORDER: Record<UnitType, number> = { registration: 0, clinic: 1, pharmacy: 2 };
export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  registration: "Pendaftaran",
  clinic: "Poli",
  pharmacy: "Farmasi",
};
export const ROLE_UNIT_TYPE: Record<Exclude<StaffRole, "admin">, UnitType> = {
  staff_registration: "registration",
  staff_clinic: "clinic",
  staff_pharmacy: "pharmacy",
};
export const ROLE_LABEL: Record<StaffRole, string> = {
  staff_registration: "Petugas pendaftaran",
  staff_clinic: "Petugas poli",
  staff_pharmacy: "Petugas farmasi",
  admin: "Admin",
};

/** Status yang masih menempati antrean (dihitung pada posisi, FR-008). */
export const QUEUED_STATUSES: StageStatus[] = ["menunggu", "dipanggil"];
/** Status akhir sebuah tahap: tidak ada aksi lanjutan. */
export const TERMINAL_STATUSES: StageStatus[] = ["selesai", "dilewati", "dibatalkan", "diserahkan"];

export type StageAction = "call_next" | "start" | "complete" | "ready_for_pickup" | "hand_over";

interface Rule {
  from: StageStatus[];
  to: StageStatus;
  unitTypes: UnitType[];
  hint: string;
}

const ALL: UnitType[] = ["registration", "clinic", "pharmacy"];

/** Tabel transisi tunggal. Semua endpoint aksi petugas membaca dari sini. */
export const TRANSITIONS: Record<StageAction, Rule> = {
  call_next: { from: ["menunggu"], to: "dipanggil", unitTypes: ALL, hint: "Hanya tiket yang menunggu yang dapat dipanggil." },
  start: { from: ["dipanggil"], to: "sedang_dilayani", unitTypes: ALL, hint: "Layanan hanya dapat dimulai setelah tiket dipanggil." },
  complete: {
    from: ["sedang_dilayani"],
    to: "selesai",
    unitTypes: ["registration", "clinic"],
    hint: "Tiket harus berstatus sedang dilayani sebelum diselesaikan.",
  },
  ready_for_pickup: {
    from: ["sedang_dilayani"],
    to: "siap_diambil",
    unitTypes: ["pharmacy"],
    hint: "Obat hanya dapat ditandai siap diambil saat sedang diproses.",
  },
  hand_over: {
    from: ["siap_diambil"],
    to: "diserahkan",
    unitTypes: ["pharmacy"],
    hint: "Obat hanya dapat diserahkan setelah ditandai siap diambil.",
  },
};

export type TransitionCheck =
  | { ok: true; to: StageStatus }
  | { ok: false; reason: "wrong_unit_type" | "already_applied" | "invalid_sequence"; message: string };

export function checkTransition(action: StageAction, current: StageStatus, unitType: UnitType): TransitionCheck {
  const rule = TRANSITIONS[action];
  if (!rule.unitTypes.includes(unitType)) {
    return {
      ok: false,
      reason: "wrong_unit_type",
      message:
        unitType === "pharmacy"
          ? "Tahap farmasi diselesaikan lewat “Siap diambil” lalu “Diserahkan”."
          : "Aksi ini hanya tersedia untuk petugas farmasi.",
    };
  }
  if (rule.from.includes(current)) return { ok: true, to: rule.to };
  if (current === rule.to) {
    return { ok: false, reason: "already_applied", message: "Tiket ini sudah diproses oleh petugas lain. Muat ulang antrean." };
  }
  return { ok: false, reason: "invalid_sequence", message: rule.hint };
}

/** Aksi yang boleh ditawarkan UI untuk status tertentu (UI hanya menampilkan yang valid). */
export function availableActions(status: StageStatus, unitType: UnitType): StageAction[] {
  return (["start", "complete", "ready_for_pickup", "hand_over"] as StageAction[]).filter(
    (a) => checkTransition(a, status, unitType).ok,
  );
}

// ---------------------------------------------------------------- posisi & estimasi

/** FR-008: posisi = jumlah tiket menunggu/dipanggil di depan pada tahap yang sama + 1. */
export const queuePosition = (aheadCount: number): number => aheadCount + 1;

/** FR-009: durasi tahap × jumlah tiket di depan. Null bila durasi belum dikonfigurasi. */
export function estimateWaitMinutes(aheadCount: number, minutesPerTicket: number | null | undefined): number | null {
  if (minutesPerTicket == null || !Number.isFinite(minutesPerTicket) || minutesPerTicket <= 0) return null;
  return aheadCount * minutesPerTicket;
}

/** FR-012: giliran dekat bila posisi <= ambang. Hanya bermakna untuk tiket yang masih di antrean. */
export function isNearTurn(position: number | null, threshold: number, status: StageStatus): boolean {
  if (position == null || !QUEUED_STATUSES.includes(status)) return false;
  return position <= threshold;
}

// ---------------------------------------------------------------- alur tahap (FR-011)

export interface FlowStage {
  id: string;
  name: string;
  sequence: number;
  unitId: string;
  unitName: string;
  unitType: UnitType;
  minutes: number | null;
  threshold: number;
}

/**
 * Menyusun alur satu kunjungan: pendaftaran → poli terpilih → farmasi.
 * `candidates` harus sudah terurut (unit tertua dulu, lalu sequence) dan hanya berisi tahap/unit aktif.
 * Satu unit per jenis: pendaftaran & farmasi memakai unit aktif pertama (MVP, PRD §4.3).
 */
export function buildFlow(candidates: FlowStage[], clinicUnitId: string): { flow: FlowStage[]; missing: UnitType[] } {
  const firstUnitOf = (t: UnitType) => candidates.find((c) => c.unitType === t)?.unitId;
  const picks: Array<[UnitType, string | undefined]> = [
    ["registration", firstUnitOf("registration")],
    ["clinic", candidates.some((c) => c.unitId === clinicUnitId && c.unitType === "clinic") ? clinicUnitId : undefined],
    ["pharmacy", firstUnitOf("pharmacy")],
  ];
  const flow: FlowStage[] = [];
  const missing: UnitType[] = [];
  for (const [type, unitId] of picks) {
    const stages = unitId ? candidates.filter((c) => c.unitId === unitId).sort((a, b) => a.sequence - b.sequence) : [];
    if (stages.length === 0) missing.push(type);
    flow.push(...stages);
  }
  return { flow, missing };
}

export type NextStep =
  | { kind: "next"; stage: FlowStage }
  | { kind: "needs_admin"; missing: UnitType }
  | { kind: "done" };

export interface StageRef {
  unitId: string;
  unitType: UnitType;
  sequence: number;
}

/**
 * Setelah sebuah tahap selesai: tahap berikutnya di unit yang sama, lalu jenis unit berikutnya menurut urutan alur
 * (pendaftaran -> poli -> farmasi). Bila jenis berikutnya belum dikonfigurasi => "butuh tindakan admin" (tidak melompat
 * ke jenis sesudahnya dan tidak membuat tahap fiktif — PRD §14). Tidak ada lagi => selesai (FR-011 AC2).
 */
export function nextAfter(flow: FlowStage[], missing: UnitType[], current: StageRef): NextStep {
  const bySeq = (a: FlowStage, b: FlowStage) => a.sequence - b.sequence;
  const sameUnit = flow.filter((s) => s.unitId === current.unitId && s.sequence > current.sequence).sort(bySeq)[0];
  if (sameUnit) return { kind: "next", stage: sameUnit };

  const order: UnitType[] = ["registration", "clinic", "pharmacy"];
  for (const t of order.slice(UNIT_TYPE_ORDER[current.unitType] + 1)) {
    const first = flow.filter((s) => s.unitType === t).sort(bySeq)[0];
    if (first) return { kind: "next", stage: first };
    if (missing.includes(t)) return { kind: "needs_admin", missing: t };
  }
  return { kind: "done" };
}

// ---------------------------------------------------------------- tampilan

export function statusLabel(status: StageStatus, unitType?: UnitType): string {
  if (unitType === "pharmacy" && status === "sedang_dilayani") return "Obat diproses";
  switch (status) {
    case "menunggu":
      return "Menunggu";
    case "dipanggil":
      return "Dipanggil";
    case "sedang_dilayani":
      return "Sedang dilayani";
    case "selesai":
      return "Selesai";
    case "dilewati":
      return "Dilewati";
    case "dibatalkan":
      return "Dibatalkan";
    case "siap_diambil":
      return "Siap diambil";
    case "diserahkan":
      return "Diserahkan";
  }
}

export function maskMedicalRecord(mrn: string): string {
  if (mrn.length <= 3) return "•".repeat(mrn.length);
  return "•".repeat(mrn.length - 3) + mrn.slice(-3);
}

export const formatTicketNumber = (n: number): string => `A-${String(n).padStart(3, "0")}`;
