import { describe, expect, it } from "vitest";
import {
  availableActions,
  buildFlow,
  checkTransition,
  estimateWaitMinutes,
  formatTicketNumber,
  isNearTurn,
  maskMedicalRecord,
  nextAfter,
  queuePosition,
  statusLabel,
  type FlowStage,
  type StageAction,
  type StageStatus,
  type UnitType,
} from "../lib/domain";

const stage = (unitType: UnitType, unitId: string, id: string, sequence = 1, minutes: number | null = 10): FlowStage => ({
  id,
  name: `Tahap ${id}`,
  sequence,
  unitId,
  unitName: `Unit ${unitId}`,
  unitType,
  minutes,
  threshold: 2,
});

const REG = stage("registration", "u-reg", "s-reg");
const CLINIC = stage("clinic", "u-clinic", "s-clinic");
const OTHER_CLINIC = stage("clinic", "u-other", "s-other");
const PHARM = stage("pharmacy", "u-pharm", "s-pharm");

describe("FR-008 posisi antrean", () => {
  it("tiga tiket di depan => posisi 4", () => expect(queuePosition(3)).toBe(4));
  it("antrean kosong => posisi 1", () => expect(queuePosition(0)).toBe(1));
});

describe("FR-009 perkiraan waktu", () => {
  it("10 menit x 3 tiket di depan = 30 menit", () => expect(estimateWaitMinutes(3, 10)).toBe(30));
  it("tidak ada tiket di depan = 0 menit", () => expect(estimateWaitMinutes(0, 10)).toBe(0));
  it("durasi belum dikonfigurasi => null (perkiraan belum tersedia)", () => {
    expect(estimateWaitMinutes(3, null)).toBeNull();
    expect(estimateWaitMinutes(3, undefined)).toBeNull();
    expect(estimateWaitMinutes(3, 0)).toBeNull();
  });
});

describe("FR-012 giliran dekat", () => {
  it("posisi <= ambang => dekat", () => {
    expect(isNearTurn(2, 2, "menunggu")).toBe(true);
    expect(isNearTurn(1, 2, "dipanggil")).toBe(true);
  });
  it("posisi > ambang => tidak dekat", () => expect(isNearTurn(3, 2, "menunggu")).toBe(false));
  it("tiket yang tidak lagi di antrean tidak pernah dekat", () => {
    expect(isNearTurn(1, 2, "sedang_dilayani")).toBe(false);
    expect(isNearTurn(null, 2, "selesai")).toBe(false);
  });
  it("ambang 0 hanya menyala bila posisi 0 (tidak pernah, posisi mulai 1)", () => expect(isNearTurn(1, 0, "menunggu")).toBe(false));
});

describe("FR-016..FR-019 transisi status", () => {
  const ok = (a: StageAction, from: StageStatus, t: UnitType, to: StageStatus) => {
    const r = checkTransition(a, from, t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.to).toBe(to);
  };

  it("menunggu -> dipanggil (call_next)", () => ok("call_next", "menunggu", "clinic", "dipanggil"));
  it("dipanggil -> sedang_dilayani (start)", () => ok("start", "dipanggil", "registration", "sedang_dilayani"));
  it("sedang_dilayani -> selesai (complete) di pendaftaran & poli", () => {
    ok("complete", "sedang_dilayani", "registration", "selesai");
    ok("complete", "sedang_dilayani", "clinic", "selesai");
  });
  it("farmasi: sedang_dilayani -> siap_diambil -> diserahkan", () => {
    ok("ready_for_pickup", "sedang_dilayani", "pharmacy", "siap_diambil");
    ok("hand_over", "siap_diambil", "pharmacy", "diserahkan");
  });

  it("FR-017 AC2: 'selesai' pada tiket menunggu ditolak (urutan tidak valid)", () => {
    const r = checkTransition("complete", "menunggu", "clinic");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_sequence");
  });
  it("FR-018 AC2: 'diserahkan' pada tiket menunggu ditolak", () => {
    const r = checkTransition("hand_over", "menunggu", "pharmacy");
    expect(r.ok).toBe(false);
  });
  it("tidak bisa melompat: menunggu -> sedang_dilayani", () => expect(checkTransition("start", "menunggu", "clinic").ok).toBe(false));
  it("aksi yang sudah diterapkan petugas lain dikenali sebagai already_applied (=> 409)", () => {
    const r = checkTransition("complete", "selesai", "clinic");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("already_applied");
    const s = checkTransition("start", "sedang_dilayani", "clinic");
    if (!s.ok) expect(s.reason).toBe("already_applied");
  });
  it("aksi farmasi di unit non-farmasi ditolak", () => {
    const r = checkTransition("ready_for_pickup", "sedang_dilayani", "clinic");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("wrong_unit_type");
  });
  it("farmasi tidak memakai 'complete' (harus lewat siap_diambil/diserahkan)", () => {
    const r = checkTransition("complete", "sedang_dilayani", "pharmacy");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("wrong_unit_type");
  });
  it("status akhir tidak bisa diubah lagi", () => {
    for (const s of ["selesai", "dilewati", "dibatalkan", "diserahkan"] as StageStatus[])
      for (const a of ["start", "complete", "ready_for_pickup", "hand_over"] as StageAction[])
        expect(checkTransition(a, s, "pharmacy").ok && s !== "siap_diambil").toBe(false);
  });

  it("matriks lengkap: hanya transisi yang ditabelkan yang lolos", () => {
    const actions: StageAction[] = ["call_next", "start", "complete", "ready_for_pickup", "hand_over"];
    const statuses: StageStatus[] = ["menunggu", "dipanggil", "sedang_dilayani", "selesai", "dilewati", "dibatalkan", "siap_diambil", "diserahkan"];
    const types: UnitType[] = ["registration", "clinic", "pharmacy"];
    let allowed = 0;
    for (const a of actions) for (const s of statuses) for (const t of types) if (checkTransition(a, s, t).ok) allowed++;
    // call_next(3 jenis) + start(3) + complete(2) + ready_for_pickup(1) + hand_over(1) = 10
    expect(allowed).toBe(10);
  });

  it("availableActions menawarkan hanya aksi yang valid", () => {
    expect(availableActions("dipanggil", "clinic")).toEqual(["start"]);
    expect(availableActions("sedang_dilayani", "clinic")).toEqual(["complete"]);
    expect(availableActions("sedang_dilayani", "pharmacy")).toEqual(["ready_for_pickup"]);
    expect(availableActions("siap_diambil", "pharmacy")).toEqual(["hand_over"]);
    expect(availableActions("menunggu", "clinic")).toEqual([]);
    expect(availableActions("selesai", "clinic")).toEqual([]);
  });
});

describe("FR-011 alur tahap", () => {
  it("menyusun pendaftaran -> poli terpilih -> farmasi, mengabaikan poli lain", () => {
    const { flow, missing } = buildFlow([REG, CLINIC, OTHER_CLINIC, PHARM], "u-clinic");
    expect(flow.map((s) => s.id)).toEqual(["s-reg", "s-clinic", "s-pharm"]);
    expect(missing).toEqual([]);
  });
  it("poli lain terpilih => memakai tahap poli itu", () => {
    expect(buildFlow([REG, CLINIC, OTHER_CLINIC, PHARM], "u-other").flow.map((s) => s.id)).toEqual(["s-reg", "s-other", "s-pharm"]);
  });
  it("farmasi belum dikonfigurasi => dilaporkan di missing, tidak ada tahap fiktif", () => {
    const { flow, missing } = buildFlow([REG, CLINIC], "u-clinic");
    expect(flow.map((s) => s.id)).toEqual(["s-reg", "s-clinic"]);
    expect(missing).toEqual(["pharmacy"]);
  });
  it("poli tidak aktif/tidak ditemukan => missing clinic", () => {
    expect(buildFlow([REG, PHARM], "u-clinic").missing).toEqual(["clinic"]);
  });

  it("selesai di pendaftaran -> poli", () => {
    const { flow, missing } = buildFlow([REG, CLINIC, PHARM], "u-clinic");
    const n = nextAfter(flow, missing, { unitId: "u-reg", unitType: "registration", sequence: 1 });
    expect(n.kind === "next" && n.stage.id).toBe("s-clinic");
  });
  it("selesai di poli -> farmasi", () => {
    const { flow, missing } = buildFlow([REG, CLINIC, PHARM], "u-clinic");
    const n = nextAfter(flow, missing, { unitId: "u-clinic", unitType: "clinic", sequence: 1 });
    expect(n.kind === "next" && n.stage.id).toBe("s-pharm");
  });
  it("FR-011 AC2: tahap terakhir selesai => done, tidak membuat tahap baru", () => {
    const { flow, missing } = buildFlow([REG, CLINIC, PHARM], "u-clinic");
    expect(nextAfter(flow, missing, { unitId: "u-pharm", unitType: "pharmacy", sequence: 1 }).kind).toBe("done");
  });
  it("§14: farmasi belum dikonfigurasi => needs_admin(pharmacy), bukan done", () => {
    const { flow, missing } = buildFlow([REG, CLINIC], "u-clinic");
    const n = nextAfter(flow, missing, { unitId: "u-clinic", unitType: "clinic", sequence: 1 });
    expect(n).toEqual({ kind: "needs_admin", missing: "pharmacy" });
  });
  it("§14: poli hilang => needs_admin(clinic), tidak melompat ke farmasi", () => {
    const { flow, missing } = buildFlow([REG, PHARM], "u-clinic");
    const n = nextAfter(flow, missing, { unitId: "u-reg", unitType: "registration", sequence: 1 });
    expect(n).toEqual({ kind: "needs_admin", missing: "clinic" });
  });
  it("beberapa tahap dalam satu unit berjalan menurut sequence", () => {
    const c1 = stage("clinic", "u-clinic", "c1", 1);
    const c2 = stage("clinic", "u-clinic", "c2", 2);
    const { flow, missing } = buildFlow([REG, c2, c1, PHARM], "u-clinic");
    expect(flow.map((s) => s.id)).toEqual(["s-reg", "c1", "c2", "s-pharm"]);
    const n = nextAfter(flow, missing, { unitId: "u-clinic", unitType: "clinic", sequence: 1 });
    expect(n.kind === "next" && n.stage.id).toBe("c2");
  });
});

describe("tampilan", () => {
  it("label status; farmasi sedang_dilayani = 'Obat diproses' (PRD §4.1.10)", () => {
    expect(statusLabel("sedang_dilayani", "pharmacy")).toBe("Obat diproses");
    expect(statusLabel("sedang_dilayani", "clinic")).toBe("Sedang dilayani");
    expect(statusLabel("siap_diambil")).toBe("Siap diambil");
  });
  it("MRN disamarkan kecuali 3 karakter terakhir", () => {
    expect(maskMedicalRecord("RM-004120")).toBe("••••••120");
    expect(maskMedicalRecord("AB")).toBe("••");
  });
  it("format nomor tiket", () => {
    expect(formatTicketNumber(7)).toBe("A-007");
    expect(formatTicketNumber(123)).toBe("A-123");
  });
});
