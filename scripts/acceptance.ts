import { readFileSync } from "node:fs";
import pg from "pg";
import {
  BASE, Client, S, Server, check, cookieSecrets, count, createTempDb, dropTempDb, eq, errorMessages, freshIp, newNik, q,
  register, renameDb, results, section,
} from "./acc/harness";

// Acceptance harness: instance sekali pakai di :8091 + database sementara. Tidak menyentuh demo di :8090 / database `giliranku`.
// Tiap blok memetakan satu kriteria penerimaan PRD §7 ke request nyata.

const STAGE_FIELDS = ["queue_position", "estimated_wait_minutes", "near_turn", "status"];
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function login(c: Client, username: string, password = "demo12345") {
  return c.post("/api/v1/staff-auth/login", { username, password });
}
const stageOf = (j: any, unitType: string) => j.data.ticket_stages.find((s: any) => s.unit_type === unitType);

async function reloadIds() {
  S.hospitalId = (await q(`select id from hospitals order by created_at limit 1`))[0].id;
  const u = Object.fromEntries((await q(`select id, type from service_units`)).map((r: any) => [r.type, r.id]));
  const st = Object.fromEntries((await q(`select ss.id, su.type from service_stages ss join service_units su on su.id = ss.service_unit_id`)).map((r: any) => [r.type, r.id]));
  S.units = { registration: u.registration, clinic: u.clinic, pharmacy: u.pharmacy };
  S.stages = { registration: st.registration, clinic: st.clinic, pharmacy: st.pharmacy };
  S.clinicId = S.units.clinic;
}

async function main() {
  const tmp = await createTempDb();
  S.db = tmp.name;
  S.dbUrl = tmp.url;
  S.secrets = [];
  S.pool = new pg.Pool({ connectionString: tmp.url, max: 4 });
  S.pool.on("error", () => {}); // skenario DB-mati memutus koneksi idle dengan sengaja
  const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  S.addDays = addDays;
  S.today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  S.tomorrow = addDays(S.today, 1);

  // Migrasi + struktur (tanpa tiket contoh: antrean mulai kosong) langsung lewat modul yang sama dengan produksi.
  process.env.DATABASE_URL = tmp.url;
  const { migrate } = await import("../scripts/migrate");
  const { seedStructure } = await import("../lib/services/demo");
  await migrate();
  const st = await seedStructure();
  S.hospitalId = st.hospitalId;
  S.units = { registration: st.units.registration.id, clinic: st.units.clinic.id, pharmacy: st.units.pharmacy.id };
  S.stages = { registration: st.units.registration.stageId, clinic: st.units.clinic.stageId, pharmacy: st.units.pharmacy.stageId };
  S.clinicId = S.units.clinic;

  S.server = new Server();
  S.server.start({ DATABASE_URL: tmp.url, DEMO_MODE: "true", COOKIE_SECURE: "false", NODE_ENV: "production", RATE_LOGIN_PER_MIN: "10", RATE_VISIT_PER_MIN: "30" });
  const up = await S.server.healthy();
  if (!check("BOOT instance acceptance sehat di :8091", up)) throw new Error("server tidak naik\n" + S.server.log.slice(-2000));

  S.pub = new Client("publik", freshIp());
  S.admin = new Client("admin", freshIp());
  S.daftar = new Client("daftar", freshIp());
  S.poli = new Client("poli", freshIp());
  S.farmasi = new Client("farmasi", freshIp());

  try {
    // ================================================================== FR-014 login
    section("FR-014 login staf");
    const bad = await login(new Client("x", freshIp()), "poli", "salah-total");
    eq("FR-014 kredensial salah -> 401 UNAUTHENTICATED", [bad.status, bad.json?.error?.code], [401, "UNAUTHENTICATED"]);
    const noUser = await login(new Client("x", freshIp()), "tidak-ada");
    eq("FR-014 username tak dikenal -> pesan identik (tidak membocorkan keberadaan akun)", noUser.json?.error?.message, bad.json?.error?.message);
    for (const [c, u] of [[S.admin, "admin"], [S.daftar, "daftar"], [S.poli, "poli"], [S.farmasi, "farmasi"]] as const) {
      const r = await login(c, u);
      eq(`FR-014 login ${u} -> 200 + cookie sesi`, [r.status, Boolean(c.cookie)], [200, true]);
      if (u === "poli") {
        const sc = r.headers.get("set-cookie") ?? "";
        check("FR-014 cookie HttpOnly + SameSite", /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), sc.replace(/=[^;]+/, "=…"));
        check("FR-014 body login tidak memuat password/hash/token mentah", !/password|hash|token/i.test(r.text), "body: " + r.text.slice(0, 120));
      }
    }
    const me = await S.poli.get("/api/v1/staff-auth/me");
    eq("FR-014 /me -> peran + unit", [me.status, me.json?.data?.staff_user?.role, me.json?.data?.service_unit?.type], [200, "staff_clinic", "clinic"]);
    eq("FR-014 /me tanpa sesi -> 401", (await new Client("x", freshIp()).get("/api/v1/staff-auth/me")).status, 401);

    // ================================================================== FR-001 / FR-002 / FR-004
    section("FR-001 / FR-002 / FR-004 pembuatan tiket");
    const base = { national_identity_number: newNik(), medical_record_number: "RM-777001", display_name: "Rina Uji", hospital_id: S.hospitalId, service_unit_id: S.clinicId, visit_date: S.today };
    const emptyMrn = await S.pub.post("/api/v1/patient-visits", { ...base, medical_record_number: "" });
    eq("FR-001 AC2 MRN kosong -> 400 VALIDATION_ERROR", [emptyMrn.status, emptyMrn.json?.error?.code], [400, "VALIDATION_ERROR"]);
    eq("FR-001 AC2 pesan validasi Indonesia", emptyMrn.json?.error?.message, "Nomor rekam medis wajib diisi.");
    eq("FR-001 AC2 tidak ada tiket dibuat", await count(`select count(*)::int as n from tickets`), 0);
    const badNik = await S.pub.post("/api/v1/patient-visits", { ...base, national_identity_number: "123" });
    eq("FR-004 NIK tidak valid -> 400", [badNik.status, badNik.json?.error?.message], [400, "NIK harus 16 digit angka."]);
    const noBody = await S.pub.req("POST", "/api/v1/patient-visits", { raw: "{bukan json" });
    eq("NFR-007 JSON rusak -> 400 (bukan 500)", [noBody.status, noBody.json?.error?.code], [400, "VALIDATION_ERROR"]);
    const past = await S.pub.post("/api/v1/patient-visits", { ...base, visit_date: S.addDays(S.today, -1) });
    eq("FR-004 tanggal lampau ditolak", past.status, 400);

    const first = await S.pub.post("/api/v1/patient-visits", base);
    eq("FR-002 AC1 data valid -> 201", first.status, 201);
    const fd = first.json?.data;
    check("FR-002 AC1 tiket bernomor unik + tahap awal 'menunggu'", /^A-\d{3}$/.test(fd?.ticket?.ticket_number) && fd?.ticket_stages?.[0]?.status === "menunggu", `${fd?.ticket?.ticket_number} / ${fd?.ticket_stages?.[0]?.status} / ${fd?.ticket_stages?.[0]?.unit_type}`);
    eq("FR-002 tahap awal = pendaftaran", fd?.ticket_stages?.[0]?.unit_type, "registration");
    const token1 = new URL(fd.access_url).hash.slice(1);
    S.secrets.push(token1);
    const visit1 = fd.visit.id as string;
    check("FR-005 access_url berbentuk /tiket/{id}#token", new RegExp(`/tiket/${visit1}#[A-Za-z0-9_-]{40,}$`).test(fd.access_url), fd.access_url.replace(token1, "<token>"));
    check("PRIVASI respons pembuatan tidak memuat NIK/KK/hash", !JSON.stringify(fd).includes(base.national_identity_number) && !/access_token_hash|national_identity|family_card/.test(JSON.stringify(fd)));

    const dup = await S.pub.post("/api/v1/patient-visits", base);
    eq("FR-004 AC2 tiket aktif sudah ada -> 409", [dup.status, dup.json?.error?.code], [409, "CONFLICT"]);
    eq("FR-004 AC2 respons menunjuk ke tiket yang ada", [dup.json?.error?.details?.[0]?.code, dup.json?.error?.details?.[0]?.visit_id], ["ACTIVE_TICKET_EXISTS", visit1]);
    const dupUrl = dup.json?.error?.details?.[0]?.access_url as string | undefined;
    if (dupUrl) S.secrets.push(new URL(dupUrl).hash.slice(1));
    const viaDup = await S.pub.get(`/api/v1/visits/${visit1}`, { token: dupUrl ? new URL(dupUrl).hash.slice(1) : "" });
    eq("FR-004 AC2 tautan dari respons 409 membuka tiket yang ada", viaDup.status, 200);
    eq("FR-002 AC2 pengiriman kedua tidak menggandakan tiket aktif", await count(`select count(*)::int as n from visits where status='active'`), 1);

    // NFR-003 pendaftaran bersamaan: 8 request identik -> tepat satu 201
    const race = { ...base, national_identity_number: newNik(), medical_record_number: "RM-777002", display_name: "Balapan Uji" };
    const raced = await Promise.all(Array.from({ length: 8 }, () => new Client("r", freshIp()).post("/api/v1/patient-visits", race)));
    const codes = raced.map((r) => r.status).sort();
    eq("§14 8 pendaftaran identik bersamaan -> tepat satu 201, sisanya 409", [codes.filter((c) => c === 201).length, codes.filter((c) => c === 409).length], [1, 7]);
    eq("§14 hanya satu tiket aktif untuk pasien itu", await count(`select count(*)::int as n from visits v join patients p on p.id=v.patient_id where p.medical_record_number='RM-777002' and v.status='active'`), 1);
    eq("§14 nomor tiket unik (tidak ada duplikat)", await count(`select count(*)::int - count(distinct ticket_number)::int as n from tickets`), 0);

    // ================================================================== FR-003 QR
    section("FR-003 QR lokasi");
    const okQr = await S.pub.post("/api/v1/location-qr-codes/poli-dalam/resolve");
    eq("FR-003 AC1 QR aktif -> 200 + konteks RS/poli", [okQr.status, okQr.json?.data?.hospital?.name, okQr.json?.data?.service_unit?.name], [200, "RSU Giliranku Demo", "Poli Penyakit Dalam"]);
    eq("FR-003 AC1 tanggal konteks = hari ini", okQr.json?.data?.registration?.visit_date, S.today);
    const offQr = await S.pub.post("/api/v1/location-qr-codes/poli-dalam-lama/resolve");
    eq("FR-003 AC2 QR dinonaktifkan -> 404 tanpa konteks", [offQr.status, offQr.json?.error?.code, offQr.json?.data], [404, "NOT_FOUND", undefined]);
    eq("FR-003 AC2 QR tak dikenal -> 404", (await S.pub.post("/api/v1/location-qr-codes/tidak-ada/resolve")).status, 404);
    const qrPage = await fetch(`${BASE}/daftar?qr=poli-dalam-lama`).then((r) => r.text());
    check("FR-003 AC2 halaman /daftar menolak QR nonaktif & tanpa formulir", /QR ini tidak berlaku/.test(qrPage) && !/id="nik"/.test(qrPage));
    const qrOk = await fetch(`${BASE}/daftar?qr=poli-dalam`).then((r) => r.text());
    check("FR-003 AC1 halaman /daftar?qr= memuat formulir dengan RS terisi", /id="nik"/.test(qrOk) && /Poli Penyakit Dalam/.test(qrOk));
    const svg = await fetch(`${BASE}/api/v1/qr/poli-dalam`);
    eq("FR-003 gambar QR SVG", [svg.status, svg.headers.get("content-type")], [200, "image/svg+xml"]);

    // ================================================================== FR-005 / FR-006 / FR-007
    section("FR-005..FR-007 akses & halaman tiket");
    const v = await S.pub.get(`/api/v1/visits/${visit1}`, { token: token1 });
    eq("FR-005 token valid -> 200", v.status, 200);
    const vd = v.json.data;
    check("FR-006 memuat tiket, tahap, status, identitas minimum", Boolean(vd.ticket.ticket_number && vd.ticket_stages.length && vd.patient.display_name && vd.patient.medical_record_number));
    check("PRIVASI GET /visits tanpa NIK/KK/hash", !/national_identity|family_card|access_token|password/.test(v.text) && !v.text.includes(base.national_identity_number));
    check("PRIVASI MRN disamarkan", /^•+\d{3}$/.test(vd.patient.medical_record_number), vd.patient.medical_record_number);
    check("FR-006 tahap berikutnya (poli, farmasi) tampil sebagai 'belum dimulai' tanpa baris tersimpan", vd.upcoming_stages.length === 2 && vd.upcoming_stages[0].unit_type === "clinic" && vd.upcoming_stages[1].unit_type === "pharmacy", vd.upcoming_stages.map((u: any) => u.unit_type).join(","));
    eq("FR-005 AC2 tanpa token -> 401", (await S.pub.get(`/api/v1/visits/${visit1}`)).status, 401);
    const wrong = await S.pub.get(`/api/v1/visits/${visit1}`, { token: "x".repeat(43) });
    eq("FR-005 AC2 token salah -> 401 UNAUTHENTICATED", [wrong.status, wrong.json?.error?.code], [401, "UNAUTHENTICATED"]);
    const ghost = await S.pub.get(`/api/v1/visits/00000000-0000-4000-8000-000000000000`, { token: token1 });
    eq("§14 visit tidak ada -> 401 identik (tidak membocorkan keberadaan)", [ghost.status, ghost.json?.error?.message], [401, wrong.json?.error?.message]);
    eq("§14 visit_id bukan UUID -> 401 (bukan 500)", (await S.pub.get(`/api/v1/visits/abc`, { token: token1 })).status, 401);
    const other = await register();
    const cross = await S.pub.get(`/api/v1/visits/${other.visitId}`, { token: token1 });
    eq("§13.5 token milik tiket lain tidak membuka visit ini -> 401", cross.status, 401);
    const html = await fetch(`${BASE}/tiket/${visit1}`).then((r) => r.text());
    check("FR-005 halaman /tiket/{id} dilayani tanpa token di server (token hanya di fragmen)", !html.includes(token1));
    const page401 = await fetch(`${BASE}/tiket/${visit1}`).then((r) => r.status);
    eq("FR-005 halaman tiket merespons 200 (validasi token dilakukan klien lewat API)", page401, 200);

    // ================================================================== FR-015 / FR-016 queue
    section("FR-008 / FR-009 / FR-012 posisi, estimasi, giliran dekat");
    // Antrean pendaftaran saat ini: pasien 'Rina' (visit1) + 'Balapan' + 'other'. Tambah pasien agar posisi 4 terjadi.
    const regs = [visit1];
    const tokens = [token1];
    const raceVisit = raced.find((r) => r.status === 201)!.json.data;
    regs.push(raceVisit.visit.id); tokens.push(new URL(raceVisit.access_url).hash.slice(1)); S.secrets.push(tokens[1]);
    regs.push(other.visitId); tokens.push(other.token);
    const p4 = await register({ name: "Keempat Uji" });
    regs.push(p4.visitId); tokens.push(p4.token);
    const queue = await S.pub.get(`/api/v1/visits/${regs[3]}/queue`, { token: tokens[3] });
    const s4 = stageOf(queue.json, "registration");
    check("FR-008 AC1 tiga tiket di depan -> posisi 4", s4.queue_position === 4, `posisi=${s4.queue_position}`);
    eq("FR-009 AC1 5 menit x 3 di depan = 15 menit", s4.estimated_wait_minutes, 15);
    eq("FR-012 AC2 posisi 4 > ambang 3 -> near_turn=false", s4.near_turn, false);
    check("kontrak /queue memuat bidang yang dijanjikan", STAGE_FIELDS.every((f) => f in s4), Object.keys(s4).join(","));
    const q1 = stageOf(await S.pub.get(`/api/v1/visits/${regs[0]}/queue`, { token: tokens[0] }).then((r) => r.json), "registration");
    eq("FR-008 posisi pertama = 1, estimasi 0", [q1.queue_position, q1.estimated_wait_minutes], [1, 0]);
    eq("FR-012 AC1 posisi 1 <= ambang -> near_turn=true", q1.near_turn, true);
    const q3 = stageOf(await S.pub.get(`/api/v1/visits/${regs[2]}/queue`, { token: tokens[2] }).then((r) => r.json), "registration");
    eq("FR-012 AC1 posisi 3 == ambang -> near_turn=true (batas inklusif)", [q3.queue_position, q3.near_turn], [3, true]);
    const view = await S.pub.get(`/api/v1/visits/${regs[0]}`, { token: tokens[0] });
    eq("FR-012 halaman tiket: notifications.near_turn", view.json.data.notifications.near_turn, true);
    const viewFar = await S.pub.get(`/api/v1/visits/${regs[3]}`, { token: tokens[3] });
    eq("FR-012 AC2 posisi jauh: notifications.near_turn=false", viewFar.json.data.notifications.near_turn, false);

    // FR-009 AC2: durasi belum dikonfigurasi -> "belum tersedia"
    await S.pool.query(`update service_stages set estimated_service_minutes = null where id = $1`, [S.stages.registration]);
    const noEst = stageOf(await S.pub.get(`/api/v1/visits/${regs[3]}/queue`, { token: tokens[3] }).then((r) => r.json), "registration");
    eq("FR-009 AC2 durasi kosong -> estimated_wait_minutes null + wait_estimate_available=false", [noEst.estimated_wait_minutes, noEst.wait_estimate_available], [null, false]);
    await S.pool.query(`update service_stages set estimated_service_minutes = 5 where id = $1`, [S.stages.registration]);

    // ================================================================== FR-015 batas unit
    section("FR-015 batas unit & FR-019 otorisasi");
    eq("FR-015 tanpa sesi -> 401", (await new Client("x", freshIp()).get(`/api/v1/service-units/${S.units.registration}/queue`)).status, 401);
    const own = await S.daftar.get(`/api/v1/service-units/${S.units.registration}/queue`);
    eq("FR-015 AC1 petugas pendaftaran melihat unitnya", own.status, 200);
    check("FR-015 AC1 hanya tahap unit itu", own.json.data.ticket_stages.every((s: any) => s.unit_type === "registration"), `${own.json.data.ticket_stages.length} baris`);
    check("NFR-008 dasbor petugas tanpa NIK/KK", !/national_identity|family_card/.test(own.text) && own.json.data.ticket_stages.every((s: any) => s.patient.display_name && s.patient.medical_record_number));
    const crossRead = await S.daftar.get(`/api/v1/service-units/${S.units.clinic}/queue`);
    eq("FR-015 AC2 antrean unit lain -> 403 FORBIDDEN", [crossRead.status, crossRead.json?.error?.code], [403, "FORBIDDEN"]);
    check("FR-015 AC2 403 tidak memuat data unit itu", crossRead.json?.data === undefined && !/ticket_number/.test(crossRead.text));
    eq("FR-015 admin boleh memantau (hanya baca)", (await S.admin.get(`/api/v1/service-units/${S.units.clinic}/queue`)).status, 200);
    eq("FR-015 query date tidak valid -> 400", (await S.daftar.get(`/api/v1/service-units/${S.units.registration}/queue?date=31-12-2026`)).status, 400);
    eq("FR-015 service_stage_id bukan milik unit -> 400", (await S.daftar.get(`/api/v1/service-units/${S.units.registration}/queue?service_stage_id=${S.stages.clinic}`)).status, 400);
    const crossCall = await S.daftar.post(`/api/v1/service-stages/${S.stages.clinic}/call-next`);
    eq("FR-019 AC1 call-next di tahap unit lain -> 403", crossCall.status, 403);
    const adminCall = await S.admin.post(`/api/v1/service-stages/${S.stages.registration}/call-next`);
    eq("FR-019 admin tidak mengoperasikan antrean -> 403", adminCall.status, 403);
    eq("FR-019 tanpa sesi -> 401", (await new Client("x", freshIp()).post(`/api/v1/service-stages/${S.stages.registration}/call-next`)).status, 401);
    const csrf = await S.daftar.req("POST", `/api/v1/service-stages/${S.stages.registration}/call-next`, { body: {}, headers: { origin: "https://evil.example" } });
    eq("§13 CSRF: Origin asing pada aksi ubah -> 403", csrf.status, 403);

    // ================================================================== FR-016 panggil berikutnya
    section("FR-016 / FR-017 panggil berikutnya, mulai, selesai");
    eq("FR-016 data belum berubah setelah penolakan (semua masih menunggu)", await count(`select count(*)::int as n from ticket_stages where status <> 'menunggu'`), 0);
    const c1 = await S.daftar.post(`/api/v1/service-stages/${S.stages.registration}/call-next`);
    eq("FR-016 AC1 call-next -> 200", c1.status, 200);
    eq("FR-016 AC1 tiket paling awal (Rina) -> dipanggil", [c1.json.data.ticket.ticket_number, c1.json.data.ticket_stage.status], [fd.ticket.ticket_number, "dipanggil"]);
    const tsId1 = c1.json.data.ticket_stage.id as string;
    const pos2 = stageOf(await S.pub.get(`/api/v1/visits/${regs[1]}/queue`, { token: tokens[1] }).then((r) => r.json), "registration");
    eq("FR-008 posisi pasien kedua tetap menghitung tiket 'dipanggil' di depan", pos2.queue_position, 2);

    const earlyDone = await S.daftar.post(`/api/v1/ticket-stages/${(await q(`select id from ticket_stages where status='menunggu' order by queue_sequence limit 1`))[0].id}/complete`);
    eq("FR-017 AC2 'selesai' pada tiket menunggu -> 422 INVALID_STATUS_TRANSITION", [earlyDone.status, earlyDone.json?.error?.code], [422, "INVALID_STATUS_TRANSITION"]);
    const skipStart = await S.daftar.post(`/api/v1/ticket-stages/${tsId1}/complete`);
    eq("FR-017 tidak bisa melompat dipanggil -> selesai (422)", skipStart.status, 422);
    const farmAction = await S.daftar.post(`/api/v1/ticket-stages/${tsId1}/ready-for-pickup`);
    eq("FR-019 aksi farmasi oleh petugas pendaftaran -> 403", farmAction.status, 403);
    const start1 = await S.daftar.post(`/api/v1/ticket-stages/${tsId1}/start`);
    eq("FR-017 AC1 mulai layanan -> sedang_dilayani", [start1.status, start1.json?.data?.ticket_stage?.status], [200, "sedang_dilayani"]);
    const startAgain = await S.daftar.post(`/api/v1/ticket-stages/${tsId1}/start`);
    eq("§14 aksi yang sudah diterapkan -> 409, status tidak ditimpa", [startAgain.status, startAgain.json?.error?.code], [409, "CONFLICT"]);

    // FR-011 pendaftaran selesai -> poli
    const done1 = await S.daftar.post(`/api/v1/ticket-stages/${tsId1}/complete`);
    eq("FR-017 selesai -> 200", [done1.status, done1.json?.data?.ticket_stage?.status], [200, "selesai"]);
    eq("FR-011 AC1 tahap poli dibuat otomatis", done1.json?.data?.advanced_to?.stage, "Pemeriksaan poli");
    const after1 = await S.pub.get(`/api/v1/visits/${regs[0]}`, { token: tokens[0] });
    check("FR-011 halaman pasien menampilkan tahap poli 'menunggu' dan farmasi 'belum dimulai'", after1.json.data.ticket_stages.length === 2 && after1.json.data.ticket_stages[1].unit_type === "clinic" && after1.json.data.ticket_stages[1].status === "menunggu" && after1.json.data.upcoming_stages.length === 1, after1.json.data.ticket_stages.map((s: any) => s.unit_type + ":" + s.status).join(" "));
    eq("FR-013 AC2 obat belum siap -> notifications.ready_for_pickup=false", after1.json.data.notifications.ready_for_pickup, false);

    // ================================================================== NFR-003 balapan call-next
    section("NFR-003 dua petugas bersamaan (call-next)");
    const poliBefore = await S.poli.get(`/api/v1/service-units/${S.units.clinic}/queue`);
    eq("FR-015 petugas poli melihat Rina menunggu", poliBefore.json.data.ticket_stages.length, 1);
    // tambah 3 tiket ke poli dengan menyelesaikan pendaftaran mereka
    async function pushThroughRegistration(n: number) {
      for (let i = 0; i < n; i++) {
        const c = await S.daftar.post(`/api/v1/service-stages/${S.stages.registration}/call-next`);
        if (c.status !== 200 || c.json.data.empty) throw new Error("antrean pendaftaran kosong sebelum waktunya");
        const id = c.json.data.ticket_stage.id;
        await S.daftar.post(`/api/v1/ticket-stages/${id}/start`);
        await S.daftar.post(`/api/v1/ticket-stages/${id}/complete`);
      }
    }
    await pushThroughRegistration(3);
    eq("NFR-003 poli kini memiliki 4 tiket menunggu", await count(`select count(*)::int as n from ticket_stages ts join service_stages ss on ss.id=ts.service_stage_id where ss.id=$1 and ts.status='menunggu'`, [S.stages.clinic]), 4);
    const poli2 = new Client("poli2", freshIp());
    await login(poli2, "poli");
    const [rA, rB] = await Promise.all([S.poli.post(`/api/v1/service-stages/${S.stages.clinic}/call-next`), poli2.post(`/api/v1/service-stages/${S.stages.clinic}/call-next`)]);
    const na = rA.json?.data?.ticket?.ticket_number, nb = rB.json?.data?.ticket?.ticket_number;
    check("NFR-003 dua call-next bersamaan -> dua tiket BERBEDA", rA.status === 200 && rB.status === 200 && na && nb && na !== nb, `${na} vs ${nb}`);
    eq("NFR-003 tepat dua tiket berstatus dipanggil", await count(`select count(*)::int as n from ticket_stages where service_stage_id=$1 and status='dipanggil'`, [S.stages.clinic]), 2);
    // 6 pemanggil bersamaan pada 2 tiket tersisa -> 2 sukses berbeda + 4 'antrean kosong'
    const many = await Promise.all(Array.from({ length: 6 }, () => S.poli.post(`/api/v1/service-stages/${S.stages.clinic}/call-next`)));
    const called = many.filter((r) => r.json?.data?.empty === false).map((r) => r.json.data.ticket.ticket_number);
    const empties = many.filter((r) => r.json?.data?.empty === true).length;
    check("NFR-003 6 pemanggil bersamaan pada 2 tiket tersisa -> 2 unik + 4 antrean kosong", new Set(called).size === 2 && called.length === 2 && empties === 4, `dipanggil=${called.join(",")} kosong=${empties}`);
    const emptyCall = await S.poli.post(`/api/v1/service-stages/${S.stages.clinic}/call-next`);
    eq("FR-016 AC2 antrean kosong -> 200 {empty:true}, tidak ada perubahan", [emptyCall.status, emptyCall.json?.data?.empty], [200, true]);
    check("FR-016 AC2 pesan antrean kosong berbahasa Indonesia", /Antrean kosong/.test(emptyCall.json?.data?.message ?? ""));

    // dua petugas menyelesaikan tiket yang sama bersamaan
    const calledRow = (await q(`select id from ticket_stages where service_stage_id=$1 and status='dipanggil' order by queue_sequence limit 1`, [S.stages.clinic]))[0].id;
    await S.poli.post(`/api/v1/ticket-stages/${calledRow}/start`);
    const [cA, cB] = await Promise.all([S.poli.post(`/api/v1/ticket-stages/${calledRow}/complete`), poli2.post(`/api/v1/ticket-stages/${calledRow}/complete`)]);
    const outs = [cA.status, cB.status].sort();
    eq("§14 dua petugas menyelesaikan tiket yang sama -> satu 200 + satu 409", outs, [200, 409]);
    eq("§14 audit 'complete' untuk tiket itu tepat satu", await count(`select count(*)::int as n from audit_logs where ticket_stage_id=$1 and action='complete'`, [calledRow]), 1);

    // ================================================================== FR-018 farmasi, FR-013
    section("FR-011 / FR-013 / FR-018 farmasi & obat siap diambil");
    // Tiket poli pertama (calledRow) milik Rina; penyelesaian bersamaan di atas sekaligus memajukannya ke farmasi.
    const calledInfo = (await q(`select t.visit_id from ticket_stages ts join tickets t on t.id = ts.ticket_id where ts.id = $1`, [calledRow]))[0];
    eq("persiapan: tiket yang diselesaikan bersamaan adalah milik Rina (antrean poli pertama)", calledInfo.visit_id, visit1);
    const winner = cA.status === 200 ? cA : cB;
    eq("FR-011 AC1 poli selesai -> tahap farmasi tersedia (dari respons pemenang)", winner.json?.data?.advanced_to?.unit, "Farmasi Rawat Jalan");
    const viewPh = await S.pub.get(`/api/v1/visits/${visit1}`, { token: token1 });
    const phStage = viewPh.json.data.ticket_stages.find((s: any) => s.unit_type === "pharmacy");
    eq("FR-011 halaman pasien: farmasi 'menunggu'", phStage?.status, "menunggu");
    eq("FR-013 AC2 status farmasi belum siap -> tidak ada tanda obat siap", viewPh.json.data.notifications.ready_for_pickup, false);

    const handEarly = await S.farmasi.post(`/api/v1/ticket-stages/${phStage.id}/hand-over`);
    eq("FR-018 AC2 'diserahkan' pada tiket menunggu -> 422, status tetap", [handEarly.status, (await q(`select status from ticket_stages where id=$1`, [phStage.id]))[0].status], [422, "menunggu"]);
    const readyEarly = await S.farmasi.post(`/api/v1/ticket-stages/${phStage.id}/ready-for-pickup`);
    eq("FR-018 'siap diambil' sebelum diproses -> 422", readyEarly.status, 422);
    const callPh = await S.farmasi.post(`/api/v1/service-stages/${S.stages.pharmacy}/call-next`);
    eq("FR-016 farmasi memanggil berikutnya", [callPh.status, callPh.json?.data?.ticket_stage?.status], [200, "dipanggil"]);
    const phId = callPh.json.data.ticket_stage.id as string;
    eq("FR-017 farmasi mulai (obat diproses)", (await S.farmasi.post(`/api/v1/ticket-stages/${phId}/start`)).json?.data?.ticket_stage?.status_label, "Obat diproses");
    const phComplete = await S.farmasi.post(`/api/v1/ticket-stages/${phId}/complete`);
    eq("FR-018 farmasi tidak memakai 'selesai' -> 422/403 (harus siap diambil)", [phComplete.status === 403 || phComplete.status === 422], [true]);
    const ready = await S.farmasi.post(`/api/v1/ticket-stages/${phId}/ready-for-pickup`);
    eq("FR-018 AC1 sedang_dilayani -> siap_diambil", [ready.status, ready.json?.data?.ticket_stage?.status], [200, "siap_diambil"]);
    const viewReady = await S.pub.get(`/api/v1/visits/${visit1}`, { token: token1 });
    eq("FR-013 AC1 halaman pasien menampilkan tanda obat siap diambil", viewReady.json.data.notifications.ready_for_pickup, true);
    const roPoli = await S.poli.post(`/api/v1/ticket-stages/${phId}/hand-over`);
    eq("FR-019 petugas poli tidak dapat menyerahkan obat -> 403", roPoli.status, 403);
    const hand = await S.farmasi.post(`/api/v1/ticket-stages/${phId}/hand-over`);
    eq("FR-018 diserahkan -> 200 + kunjungan selesai (FR-011 AC2)", [hand.status, hand.json?.data?.ticket_stage?.status, hand.json?.data?.visit_status], [200, "diserahkan", "completed"]);
    const viewDone = await S.pub.get(`/api/v1/visits/${visit1}`, { token: token1 });
    eq("FR-011 AC2 tidak ada tahap baru setelah tahap terakhir", [viewDone.json.data.visit.status, viewDone.json.data.upcoming_stages.length, viewDone.json.data.ticket_stages.length], ["completed", 0, 3]);
    eq("§9.1 alur lengkap: 3 tahap tercatat untuk Rina", await count(`select count(*)::int as n from ticket_stages where ticket_id=(select id from tickets where visit_id=$1)`, [visit1]), 3);

    // ================================================================== FR-007 status di luar daftar
    section("FR-007 status di luar daftar");
    const patchBad = await S.daftar.post(`/api/v1/ticket-stages/${phId}/nonsense`);
    eq("FR-007 aksi status di luar daftar -> 404 format galat kontrak, data tidak berubah", [patchBad.status, patchBad.json?.error?.code], [404, "NOT_FOUND"]);
    const noEnum = await q(`select count(*)::int as n from ticket_stages where status not in ('menunggu','dipanggil','sedang_dilayani','selesai','dilewati','dibatalkan','siap_diambil','diserahkan')`);
    eq("FR-007 basis data menolak nilai status liar (CHECK)", noEnum[0].n, 0);
    let dbRejected = false;
    try { await S.pool.query(`update ticket_stages set status='ngawur' where id=$1`, [phId]); } catch { dbRejected = true; }
    check("FR-007 CHECK constraint menolak UPDATE status liar", dbRejected);

    // ================================================================== FR-010 gagal simpan
    section("FR-010 / NFR gagal simpan & DB mati");
    // simulasi kegagalan simpan: transaksi dibatalkan di tengah -> status lama tetap, audit tidak dibuat
    const p5 = await register({ name: "Rollback Uji" });
    const cx = await S.daftar.post(`/api/v1/service-stages/${S.stages.registration}/call-next`);
    const beforeAudit = await count(`select count(*)::int as n from audit_logs`);
    await S.pool.query(`create or replace function gk_fail() returns trigger language plpgsql as $$ begin raise exception 'simulasi gagal simpan'; end $$`);
    await S.pool.query(`create trigger gk_fail_audit before insert on audit_logs for each row when (new.action = 'start') execute function gk_fail()`);
    const failStart = await S.daftar.post(`/api/v1/ticket-stages/${cx.json.data.ticket_stage.id}/start`);
    await S.pool.query(`drop trigger gk_fail_audit on audit_logs`);
    const stNow = (await q(`select status from ticket_stages where id=$1`, [cx.json.data.ticket_stage.id]))[0].status;
    eq("FR-010 AC2 / FR-020 AC2 simpan gagal -> 500 INTERNAL_ERROR", [failStart.status, failStart.json?.error?.code], [500, "INTERNAL_ERROR"]);
    eq("FR-010 AC2 status lama dipertahankan", stNow, "dipanggil");
    eq("FR-020 AC2 audit perubahan yang gagal tidak dibuat", await count(`select count(*)::int as n from audit_logs where action='start' and ticket_stage_id=$1`, [cx.json.data.ticket_stage.id]), 0);
    check("NFR-010 pesan 500 berbahasa Indonesia tanpa detail internal", /gangguan pada server/.test(failStart.json?.error?.message) && !/simulasi|trigger|plpgsql/.test(failStart.text));
    eq("pasca-gagal: audit total tidak bertambah", await count(`select count(*)::int as n from audit_logs`), beforeAudit);
    // lanjutkan alur normal untuk tiket ini
    await S.daftar.post(`/api/v1/ticket-stages/${cx.json.data.ticket_stage.id}/start`);

    // ================================================================== FR-020 audit
    section("FR-020 audit log & NFR-012 append-only");
    const rinaTicketId = (await q(`select id from tickets where visit_id=$1`, [visit1]))[0].id as string;
    const logs = await S.admin.get(`/api/v1/audit-logs?ticket_id=${rinaTicketId}`);
    eq("FR-020 admin membaca audit per tiket", logs.status, 200);
    const acts = logs.json.data.map((l: any) => l.action);
    check("FR-020 AC1 aksi petugas tercatat (call_next, start, complete, ready_for_pickup, hand_over)", ["call_next", "start", "complete", "ready_for_pickup", "hand_over"].every((a) => acts.includes(a)), [...new Set(acts)].join(","));
    const sample = logs.json.data.find((l: any) => l.action === "ready_for_pickup");
    check("FR-020 AC1 memuat aktor, tiket, status sebelum/sesudah, waktu", sample.actor_username === "farmasi" && sample.ticket_number === fd.ticket.ticket_number && sample.previous_status === "sedang_dilayani" && sample.new_status === "siap_diambil" && Boolean(sample.created_at), JSON.stringify({ a: sample.actor_username, p: sample.previous_status, n: sample.new_status }));
    eq("G-004 tiap aksi petugas tepat satu audit: pendaftaran 3 + poli 3 + farmasi 4 = 10 (aksi yang ditolak tidak mencatat)", await count(`select count(*)::int as n from audit_logs where ticket_id=$1 and action in ('call_next','start','complete','ready_for_pickup','hand_over')`, [rinaTicketId]), 10);
    eq("FR-020 petugas non-admin -> /audit-logs 403", (await S.poli.get(`/api/v1/audit-logs`)).status, 403);
    eq("FR-020 filter tanggal dalam WIB", (await S.admin.get(`/api/v1/audit-logs?date_from=${S.today}&date_to=${S.today}`)).json.data.length > 0, true);
    eq("FR-020 filter tanggal tidak valid -> 400", (await S.admin.get(`/api/v1/audit-logs?date_from=kemarin`)).status, 400);
    check("PRD §13.11 audit tidak menyimpan password/token", (await count(`select count(*)::int as n from audit_logs where metadata::text ~* '(password|token|secret|nik|national_identity)'`)) === 0);
    for (const sql of [`update audit_logs set action='x'`, `delete from audit_logs`, `truncate audit_logs`]) {
      let rejected = false; try { await S.pool.query(sql); } catch (e: any) { rejected = /append-only/.test(e.message); }
      check(`NFR-012 basis data menolak: ${sql}`, rejected);
    }
    for (const m of ["PATCH", "DELETE", "PUT"]) eq(`NFR-012 tidak ada antarmuka ${m} /audit-logs`, (await S.admin.req(m, `/api/v1/audit-logs`, { body: {} })).status === 404 || (await S.admin.req(m, `/api/v1/audit-logs`, { body: {} })).status === 405, true);

    // ================================================================== FR-021 / FR-022 / FR-023 admin
    section("FR-021..FR-023 administrasi");
    const nonAdmin = await S.poli.post(`/api/v1/hospitals/${S.hospitalId}/service-units`, { name: "Poli Gigi", type: "clinic" });
    eq("FR-021 non-admin -> 403", nonAdmin.status, 403);
    const mk = await S.admin.post(`/api/v1/hospitals/${S.hospitalId}/service-units`, { name: "Poli Gigi", type: "clinic" });
    eq("FR-021 AC1 nama unik -> unit aktif dibuat", [mk.status, mk.json?.data?.status], [201, "active"]);
    const dupUnit = await S.admin.post(`/api/v1/hospitals/${S.hospitalId}/service-units`, { name: "poli gigi", type: "clinic" });
    eq("FR-021 AC2 nama sudah dipakai (tidak peka huruf besar) -> 409", [dupUnit.status, dupUnit.json?.error?.code], [409, "CONFLICT"]);
    eq("FR-021 jenis unit tidak dikenal -> 400", (await S.admin.post(`/api/v1/hospitals/${S.hospitalId}/service-units`, { name: "X Unit", type: "bank" })).status, 400);
    const gigiId = mk.json.data.id as string;
    const gigiNoStage = await fetch(`${BASE}/api/v1/registration-options`).then((r) => r.json());
    check("FR-021 unit tanpa tahap aktif tidak muncul di pilihan pasien", !JSON.stringify(gigiNoStage).includes("Poli Gigi"));
    const stBad0 = await S.admin.post(`/api/v1/service-units/${gigiId}/stages`, { name: "Periksa gigi", sequence: 1, estimated_service_minutes: 0, near_turn_threshold: 2 });
    eq("FR-022 AC2 durasi nol -> 400 + pesan Indonesia", [stBad0.status, stBad0.json?.error?.message], [400, "Durasi estimasi harus lebih besar dari 0."]);
    eq("FR-022 AC2 durasi negatif -> 400", (await S.admin.post(`/api/v1/service-units/${gigiId}/stages`, { name: "Periksa gigi", sequence: 1, estimated_service_minutes: -3, near_turn_threshold: 2 })).status, 400);
    eq("FR-022 ambang negatif -> 400", (await S.admin.post(`/api/v1/service-units/${gigiId}/stages`, { name: "Periksa gigi", sequence: 1, estimated_service_minutes: 5, near_turn_threshold: -1 })).status, 400);
    const stOk = await S.admin.post(`/api/v1/service-units/${gigiId}/stages`, { name: "Periksa gigi", sequence: 1, estimated_service_minutes: 20, near_turn_threshold: 1 });
    eq("FR-022 AC1 durasi positif + ambang valid -> 201", [stOk.status, stOk.json?.data?.estimated_service_minutes, stOk.json?.data?.near_turn_threshold], [201, 20, 1]);
    const opt2 = await fetch(`${BASE}/api/v1/registration-options`).then((r) => r.json());
    check("FR-021 setelah tahap aktif, Poli Gigi muncul di pilihan pasien", JSON.stringify(opt2).includes("Poli Gigi"));
    // konfigurasi baru dipakai pada perhitungan berikutnya
    await S.pool.query(`update service_stages set estimated_service_minutes = 7 where id=$1`, [S.stages.registration]);
    const gg = await register({ name: "Gigi Uji", clinicId: gigiId });
    check("FR-002 pasien Poli Gigi masuk ke pendaftaran lalu poli pilihannya", gg.res.status === 201);
    const patchStage = await S.admin.patch(`/api/v1/service-stages/${stOk.json.data.id}`, { estimated_service_minutes: 25 });
    eq("FR-022 AC1 PATCH konfigurasi diterapkan", patchStage.json?.data?.estimated_service_minutes, 25);
    eq("FR-022 PATCH durasi 0 -> 400", (await S.admin.patch(`/api/v1/service-stages/${stOk.json.data.id}`, { estimated_service_minutes: 0 })).status, 400);
    const offUnit = await S.admin.patch(`/api/v1/service-units/${gigiId}`, { status: "inactive" });
    eq("FR-021 nonaktifkan unit", offUnit.json?.data?.status, "inactive");
    const regOff = await register({ name: "Gigi Nonaktif", clinicId: gigiId, expect: 400 });
    eq("FR-021 unit nonaktif tidak bisa dipilih pasien -> 400", regOff.res.status, 400);

    const roleBad = await S.admin.post(`/api/v1/staff-users`, { username: "petugas.baru", password: "rahasia123", role: "staff_clinic", service_unit_id: S.units.pharmacy });
    eq("FR-023 peran tidak sesuai jenis unit -> 400", roleBad.status, 400);
    const nonAdminStaff = await S.poli.post(`/api/v1/staff-users`, { username: "petugas.baru", password: "rahasia123", role: "staff_clinic", service_unit_id: S.units.clinic });
    eq("FR-023 AC2 non-admin -> 403", nonAdminStaff.status, 403);
    const mkStaff = await S.admin.post(`/api/v1/staff-users`, { username: "petugas.baru", password: "rahasia123", role: "staff_clinic", service_unit_id: S.units.clinic });
    eq("FR-023 AC1 akun dibuat aktif sesuai unit", [mkStaff.status, mkStaff.json?.data?.status, mkStaff.json?.data?.service_unit_id], [201, "active", S.units.clinic]);
    check("FR-023 respons tanpa password / password_hash", !/password/.test(mkStaff.text));
    check("FR-023 password tersimpan sebagai hash adaptif (bukan plaintext)", (await q(`select password_hash from staff_users where username='petugas.baru'`))[0].password_hash.startsWith("scrypt$"));
    eq("FR-023 username sama -> 409", (await S.admin.post(`/api/v1/staff-users`, { username: "Petugas.Baru", password: "rahasia123", role: "admin" })).status, 409);
    eq("FR-023 password pendek -> 400", (await S.admin.post(`/api/v1/staff-users`, { username: "pendek.uji", password: "123", role: "admin" })).status, 400);
    const baru = new Client("baru", freshIp());
    eq("FR-023 akun baru dapat login", (await login(baru, "petugas.baru", "rahasia123")).status, 200);
    const deact = await S.admin.patch(`/api/v1/staff-users/${mkStaff.json.data.id}`, { status: "inactive" });
    eq("FR-023 nonaktifkan akun", deact.json?.data?.status, "inactive");
    eq("FR-014 AC2 sesi akun yang dinonaktifkan langsung tidak berlaku -> 401", (await baru.get(`/api/v1/staff-auth/me`)).status, 401);
    const relog = await login(new Client("x", freshIp()), "petugas.baru", "rahasia123");
    eq("FR-014 AC2 akun nonaktif tidak bisa login -> 401", relog.status, 401);
    const adminId = (await q(`select id from staff_users where username='admin'`))[0].id;
    eq("FR-023 admin tidak dapat menonaktifkan dirinya sendiri -> 409", (await S.admin.patch(`/api/v1/staff-users/${adminId}`, { status: "inactive" })).status, 409);

    // ================================================================== NFR-006 idle
    section("NFR-006 sesi idle 30 menit");
    await S.pool.query(`update staff_sessions set last_seen_at = now() - interval '29 minutes' where staff_user_id = (select id from staff_users where username='farmasi')`);
    eq("NFR-006 idle 29 menit -> masih berlaku", (await S.farmasi.get(`/api/v1/staff-auth/me`)).status, 200);
    await S.pool.query(`update staff_sessions set last_seen_at = now() - interval '31 minutes' where staff_user_id = (select id from staff_users where username='farmasi')`);
    eq("NFR-006 idle 31 menit -> 401", (await S.farmasi.get(`/api/v1/staff-auth/me`)).status, 401);
    eq("NFR-006 sesi kedaluwarsa dihapus dari basis data", await count(`select count(*)::int as n from staff_sessions ss join staff_users s on s.id=ss.staff_user_id where s.username='farmasi'`), 0);
    await login(S.farmasi, "farmasi");
    const lo = await S.farmasi.post(`/api/v1/staff-auth/logout`);
    eq("FR-014 logout -> 204", lo.status, 204);
    eq("FR-014 setelah logout -> 401", (await S.farmasi.get(`/api/v1/staff-auth/me`)).status, 401);
    await login(S.farmasi, "farmasi");

    // ================================================================== §14 tahap berikutnya belum dikonfigurasi
    section("§14 tahap berikutnya belum dikonfigurasi");
    await S.pool.query(`update service_units set status='inactive' where id=$1`, [S.units.pharmacy]);
    const nf = await register({ name: "Tanpa Farmasi" });
    // loloskan melalui pendaftaran dan poli
    const cA2 = await S.daftar.post(`/api/v1/service-stages/${S.stages.registration}/call-next`);
    // antrean pendaftaran mungkin berisi tiket lain; selesaikan semua sampai tiket target dilayani
    let target = cA2;
    const nfTicketId = (await q(`select id from tickets where visit_id=$1`, [nf.visitId]))[0].id;
    while (target.json?.data?.ticket?.id !== nfTicketId) {
      const id = target.json.data.ticket_stage.id;
      await S.daftar.post(`/api/v1/ticket-stages/${id}/start`); await S.daftar.post(`/api/v1/ticket-stages/${id}/complete`);
      target = await S.daftar.post(`/api/v1/service-stages/${S.stages.registration}/call-next`);
    }
    await S.daftar.post(`/api/v1/ticket-stages/${target.json.data.ticket_stage.id}/start`);
    await S.daftar.post(`/api/v1/ticket-stages/${target.json.data.ticket_stage.id}/complete`);
    // poli: selesaikan semua yang mengantre sampai tiket target
    let tp = await S.poli.post(`/api/v1/service-stages/${S.stages.clinic}/call-next`);
    while (tp.json?.data?.ticket?.id !== nfTicketId) {
      if (tp.json?.data?.empty) throw new Error("tiket target tidak ditemukan di poli");
      const id = tp.json.data.ticket_stage.id;
      await S.poli.post(`/api/v1/ticket-stages/${id}/start`); await S.poli.post(`/api/v1/ticket-stages/${id}/complete`);
      tp = await S.poli.post(`/api/v1/service-stages/${S.stages.clinic}/call-next`);
    }
    const tpId = tp.json.data.ticket_stage.id as string;
    await S.poli.post(`/api/v1/ticket-stages/${tpId}/start`);
    const fin = await S.poli.post(`/api/v1/ticket-stages/${tpId}/complete`);
    eq("§14 poli selesai walau farmasi nonaktif -> 200, tahap poli tersimpan 'selesai'", [fin.status, fin.json?.data?.ticket_stage?.status], [200, "selesai"]);
    eq("§14 alur ditandai butuh tindakan admin", fin.json?.data?.needs_admin, "pharmacy");
    eq("§14 tidak ada tahap fiktif untuk farmasi", await count(`select count(*)::int as n from ticket_stages ts join service_stages ss on ss.id=ts.service_stage_id where ts.ticket_id=$1 and ss.id=$2`, [nfTicketId, S.stages.pharmacy]), 0);
    const nfView = await S.pub.get(`/api/v1/visits/${nf.visitId}`, { token: nf.token });
    check("§14 halaman pasien menjelaskan tahap belum dikonfigurasi", /belum dikonfigurasi/.test(nfView.json.data.flow_notice ?? "") && nfView.json.data.visit.status === "active", nfView.json.data.flow_notice);
    // admin mengaktifkan farmasi -> alur dilanjutkan otomatis
    await S.admin.patch(`/api/v1/service-units/${S.units.pharmacy}`, { status: "active" });
    const nfAfter = await S.pub.get(`/api/v1/visits/${nf.visitId}`, { token: nf.token });
    const nfPh = nfAfter.json.data.ticket_stages.find((s: any) => s.unit_type === "pharmacy");
    check("§14 setelah admin mengaktifkan farmasi, tahap farmasi dibuat 'menunggu' dan pemberitahuan hilang", nfPh?.status === "menunggu" && nfAfter.json.data.flow_notice === null, `farmasi=${nfPh?.status} notice=${nfAfter.json.data.flow_notice}`);

    // ================================================================== FR-024 / FR-025 demo
    section("FR-024 / FR-025 seed & reset demo");
    const seedNon = await S.poli.post(`/api/v1/demo/seed`);
    eq("FR-025 AC2 non-admin seed -> 403", seedNon.status, 403);
    const resetNon = await S.poli.post(`/api/v1/demo/reset`);
    eq("FR-025 AC2 non-admin reset -> 403", resetNon.status, 403);
    const visitsBefore = await count(`select count(*)::int as n from visits`);
    eq("FR-025 AC2 data tidak berubah setelah penolakan", await count(`select count(*)::int as n from visits`), visitsBefore);
    eq("FR-025 tanpa sesi -> 401", (await new Client("x", freshIp()).post(`/api/v1/demo/reset`)).status, 401);
    const reset = await S.admin.post(`/api/v1/demo/reset`);
    eq("FR-025 AC1 admin reset -> 200 status reset", [reset.status, reset.json?.data?.status], [200, "reset"]);
    check("FR-025 AC1 data kembali ke baseline (6 kunjungan contoh, 3 unit, 3 tahap)", reset.json.data.counts.visits === 6 && reset.json.data.counts.tickets === 6 && reset.json.data.counts.service_units === 3 && reset.json.data.counts.service_stages === 3, JSON.stringify(reset.json.data.counts));
    eq("FR-025 token lama tidak berlaku setelah reset (§14)", (await S.pub.get(`/api/v1/visits/${visit1}`, { token: token1 })).status, 401);
    eq("FR-025 sesi lama tidak berlaku setelah reset", (await S.poli.get(`/api/v1/staff-auth/me`)).status, 401);
    eq("FR-025 cookie dihapus oleh respons reset", S.admin.cookie, "");
    eq("§14 reset: audit lama terhapus, baseline berisi catatan seed saja", await count(`select count(*)::int as n from audit_logs where action <> 'demo_seed'`), 0);
    // reset membuat UUID baru untuk rumah sakit/unit/tahap: muat ulang agar langkah berikutnya tidak memakai id basi
    await reloadIds();
    // sesi sudah dihapus oleh reset -> login ulang
    for (const [c, u] of [[S.admin, "admin"], [S.daftar, "daftar"], [S.poli, "poli"], [S.farmasi, "farmasi"]] as const) await login(c, u);
    const seed1 = await S.admin.post(`/api/v1/demo/seed`);
    eq("FR-024 AC2 seed kedua tidak menggandakan data", [seed1.status, seed1.json?.data?.created_visits], [200, 0]);
    check("FR-024 seed idempoten: 6 pasien, 6 tiket", seed1.json.data.counts.patients === 6 && seed1.json.data.counts.tickets === 6, JSON.stringify(seed1.json.data.counts));
    const baselineStatuses = (await q(`select su.type, ts.status, count(*)::int as n from ticket_stages ts join service_stages ss on ss.id=ts.service_stage_id join service_units su on su.id=ss.service_unit_id group by su.type, ts.status order by su.type, ts.status`)).map((r: any) => `${r.type}:${r.status}=${r.n}`).join(" ");
    check("FR-024 AC1 baseline memuat status beragam (menunggu, dipanggil, dilayani, selesai)", /clinic:dipanggil=1/.test(baselineStatuses) && /clinic:menunggu=2/.test(baselineStatuses) && /pharmacy:sedang_dilayani=1/.test(baselineStatuses), baselineStatuses);
    eq("G-005 baseline: satu poli + satu farmasi + akun petugas", await count(`select count(*)::int as n from staff_users where status='active'`), 4);

    // lingkungan non-demo: seed/reset ditolak
    section("FR-025 lingkungan non-demo");
    const prod = new Server(8092);
    prod.start({ DATABASE_URL: tmp.url, DEMO_MODE: "false", COOKIE_SECURE: "false", NODE_ENV: "production" });
    if (check("BOOT instance non-demo :8092 sehat", await prod.healthy())) {
      const pc = new Client("prod-admin", freshIp()); pc.base = prod.base;
      await pc.post("/api/v1/staff-auth/login", { username: "admin", password: "demo12345" });
      const pr = await pc.post(`/api/v1/demo/reset`);
      eq("FR-025 DEMO_MODE=false -> reset 403", [pr.status, pr.json?.error?.code], [403, "FORBIDDEN"]);
      eq("FR-025 DEMO_MODE=false -> seed 403", (await pc.post(`/api/v1/demo/seed`)).status, 403);
      const mp = await fetch(`${prod.base}/masuk`).then((r) => r.text());
      check("DEMO_MODE=false menyembunyikan kredensial demo di /masuk", !/demo12345/.test(mp));
    }
    prod.stop();

    // ================================================================== NFR-001 latensi, keamanan header
    section("FR-005 refresh-token & kedaluwarsa tautan");
    const rt = await register({ name: "Token Uji" });
    const rf = await S.pub.post(`/api/v1/visits/${rt.visitId}/refresh-token`, {}, { token: rt.token });
    eq("FR-005 refresh-token -> 200 + access_url baru", [rf.status, typeof rf.json?.data?.access_url], [200, "string"]);
    const newTok = new URL(rf.json.data.access_url).hash.slice(1);
    S.secrets.push(newTok);
    check("FR-005 token baru berbeda dari yang lama dan cukup panjang", newTok !== rt.token && newTok.length >= 40, `${newTok.length} karakter`);
    eq("FR-005 token lama dicabut -> 401", (await S.pub.get(`/api/v1/visits/${rt.visitId}`, { token: rt.token })).status, 401);
    eq("FR-005 token baru -> 200", (await S.pub.get(`/api/v1/visits/${rt.visitId}`, { token: newTok })).status, 200);
    eq("FR-005 refresh tanpa token -> 401", (await S.pub.post(`/api/v1/visits/${rt.visitId}/refresh-token`)).status, 401);
    const rfCsrf = await S.pub.req("POST", `/api/v1/visits/${rt.visitId}/refresh-token`, { body: {}, token: newTok, headers: { origin: "https://evil.example" } });
    eq("§13 CSRF: refresh-token dengan Origin asing -> 403", rfCsrf.status, 403);
    eq("FR-005 token hanya berupa hash di basis data (tidak ada token mentah)", await count(`select count(*)::int as n from visit_tokens where token_hash = $1 or token_hash = $2`, [newTok, rt.token]), 0);
    // kedaluwarsa: tanggal kunjungan 3 hari lalu, tautan berlaku sampai tanggal kunjungan + 1 hari
    await S.pool.query(`update visits set visit_date = (current_date - 3) where id = $1`, [rt.visitId]);
    const expired = await S.pub.get(`/api/v1/visits/${rt.visitId}`, { token: newTok });
    eq("FR-005 URL kedaluwarsa -> 401 dengan pesan sama seperti token salah (tidak membocorkan)", [expired.status, expired.json?.error?.message], [401, wrong.json?.error?.message]);

    section("NFR-001 / §13 latensi & header");
    const t0 = performance.now();
    const lat: number[] = [];
    const vv = await register({ name: "Latensi Uji" });
    for (let i = 0; i < 60; i++) { const s = performance.now(); await S.pub.get(`/api/v1/visits/${vv.visitId}/queue`, { token: vv.token }); lat.push(performance.now() - s); }
    lat.sort((a, b) => a - b);
    const p95 = lat[Math.floor(lat.length * 0.95) - 1];
    check("NFR-001 p95 GET /queue <= 2000 ms", p95 <= 2000, `p95=${p95.toFixed(0)}ms median=${lat[30].toFixed(0)}ms n=60 (${(performance.now() - t0).toFixed(0)}ms total)`);
    const hdr = await fetch(`${BASE}/`);
    check("§13 header keamanan (nosniff, frame DENY, CSP, no-referrer)", hdr.headers.get("x-content-type-options") === "nosniff" && hdr.headers.get("x-frame-options") === "DENY" && /default-src 'self'/.test(hdr.headers.get("content-security-policy") ?? "") && hdr.headers.get("referrer-policy") === "no-referrer", [...hdr.headers.keys()].filter((k) => /^(x-|content-security|referrer|permissions)/.test(k)).join(","));
    check("§13 X-Powered-By dimatikan", !hdr.headers.has("x-powered-by"));
    check("API tidak di-cache (no-store)", (await S.pub.get(`/api/v1/registration-options`)).headers.get("cache-control") === "no-store");
    const unknown = await S.pub.get(`/api/v1/tidak-ada`);
    eq("API jalur tak dikenal -> 404 format galat kontrak", [unknown.status, unknown.json?.error?.code], [404, "NOT_FOUND"]);

    // ================================================================== rate limiting
    section("§13.10 rate limiting");
    // (a) per IP: tiap percobaan memakai nama pengguna berbeda, jadi hanya penghitung IP yang bekerja
    const rl = new Client("rl", "203.0.113.77");
    const attempts: number[] = [];
    for (let i = 0; i < 14; i++) attempts.push((await rl.post(`/api/v1/staff-auth/login`, { username: `tebak.${i}`, password: "salah" })).status);
    check("§13.10 login per IP: 10 pertama 401, lalu 429", attempts.slice(0, 10).every((s) => s === 401) && attempts.slice(10).every((s) => s === 429), attempts.join(","));
    const lim = await rl.post(`/api/v1/staff-auth/login`, { username: "tebak.99", password: "x" });
    check("§13.10 429 RATE_LIMITED + Retry-After + pesan Indonesia", lim.json?.error?.code === "RATE_LIMITED" && Number(lim.headers.get("retry-after")) > 0 && /Terlalu banyak/.test(lim.json.error.message), `retry-after=${lim.headers.get("retry-after")}`);
    // (b) per nama pengguna, lintas IP: tiap percobaan dari IP segar; hanya kegagalan yang dihitung
    const perUser: number[] = [];
    for (let i = 0; i < 12; i++) perUser.push((await new Client("pu", freshIp()).post(`/api/v1/staff-auth/login`, { username: "korban.uji", password: "salah" + i })).status);
    check("§13.10 login per nama pengguna lintas IP: 10 kegagalan pertama 401, lalu 429", perUser.slice(0, 10).every((s) => s === 401) && perUser.slice(10).every((s) => s === 429), perUser.join(","));
    const locked = await new Client("pu", freshIp()).post(`/api/v1/staff-auth/login`, { username: "korban.uji", password: "salah" });
    check("§13.10 nama pengguna terkunci memberi 429 yang sama dengan batas IP (tidak membocorkan keberadaan akun)", locked.json?.error?.code === "RATE_LIMITED" && Number(locked.headers.get("retry-after")) > 0);
    // (c) login SAH tidak menghabiskan batas per nama pengguna: 12 login berhasil dari IP berbeda semuanya 200
    const okCodes: number[] = [];
    for (let i = 0; i < 12; i++) okCodes.push((await login(new Client("ok", freshIp()), "farmasi")).status);
    check("§13.10 login sah 12x (IP berbeda) semuanya 200: hanya kegagalan yang dihitung per nama pengguna", okCodes.every((s) => s === 200), okCodes.join(","));
    const vrl = new Client("vrl", "203.0.113.88");
    const vcodes: number[] = [];
    for (let i = 0; i < 34; i++) vcodes.push((await vrl.post(`/api/v1/patient-visits`, { national_identity_number: "" })).status);
    check("§13.10 pembuatan tiket: dibatasi 429 setelah 30 permintaan/menit", vcodes.slice(0, 30).every((s) => s === 400) && vcodes.slice(30).every((s) => s === 429), `${vcodes.filter((s) => s === 400).length}x400 ${vcodes.filter((s) => s === 429).length}x429`);

    // ================================================================== log bersih
    section("§13 log tidak memuat rahasia");
    const log = S.server.log;
    const leaks = [...S.secrets, ...cookieSecrets].filter((s) => s && s.length > 20 && log.includes(s));
    check("§13.4 token tiket & sesi tidak ada di log server", leaks.length === 0, `${S.secrets.length + cookieSecrets.size} rahasia diperiksa terhadap ${log.length} byte log`);
    check("§13.11 NIK/password tidak ada di log", !/3515\d{12}/.test(log) && !/rahasia123|demo12345/.test(log));
    check("structured logging: baris JSON dengan method/path/status/ms", /"msg":"req".*"status":\d+.*"ms":\d+/.test(log));
    check("log tidak memuat query string/UUID mentah (path dinormalisasi ke :id)", !/\/visits\/[0-9a-f]{8}-/.test(log));
    const allMsgs = [...errorMessages];
    const english = allMsgs.filter((m) => /\b(the|invalid|error|failed|required|not found)\b/i.test(m) && !/Giliranku/.test(m));
    check("NFR-010 semua pesan galat API berbahasa Indonesia", english.length === 0, `${allMsgs.length} pesan unik diperiksa${english.length ? "; Inggris: " + english.join(" | ") : ""}`);

    // ================================================================== DB tidak tersedia
    section("§14 database tidak tersedia");
    await renameDb(S.db, S.db + "_down");
    const down = await S.pub.get(`/api/v1/registration-options`);
    eq("§14 DB mati -> 500 INTERNAL_ERROR (bukan crash)", [down.status, down.json?.error?.code], [500, "INTERNAL_ERROR"]);
    check("§14 pesan coba lagi berbahasa Indonesia, tanpa detail internal", /Coba lagi/.test(down.json?.error?.message ?? "") && !/ECONN|database|postgres/i.test(down.text));
    const hh = await fetch(`${BASE}/api/health`);
    eq("health check melaporkan dependency database down -> 503", [hh.status, (await hh.json()).dependencies.database], [503, "down"]);
    const ui = await fetch(`${BASE}/daftar`);
    check("§14 halaman /daftar saat DB mati tidak menampilkan tumpukan galat", ui.status >= 200 && !/at Object|node_modules|ECONN/.test(await ui.text()));
    await renameDb(S.db + "_down", S.db);
    for (let i = 0; i < 20; i++) { if ((await fetch(`${BASE}/api/health`)).status === 200) break; await new Promise((r) => setTimeout(r, 500)); }
    eq("pemulihan: DB kembali -> health 200", (await fetch(`${BASE}/api/health`)).status, 200);
    eq("pemulihan: API pulih tanpa restart", (await S.pub.get(`/api/v1/registration-options`)).status, 200);
  } finally {
    S.server.stop();
    await new Promise((r) => setTimeout(r, 500));
    await S.pool.end().catch(() => {});
    const { pool } = await import("../lib/db");
    await pool.end().catch(() => {});
    await dropTempDb(S.db + "_down").catch(() => {});
    await dropTempDb(S.db).catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== HASIL: ${results.length - failed.length}/${results.length} lulus, ${failed.length} gagal ====`);
  for (const f of failed) console.log(`  GAGAL: ${f.id}  | ${f.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("\nACCEPTANCE ERROR:", e?.stack ?? e);
  process.exit(2);
});
