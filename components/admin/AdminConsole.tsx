"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
import { useToast } from "../Toast";
import { api, ApiError, fmtDateTime } from "@/lib/client";
import { ROLE_LABEL, UNIT_TYPE_LABEL, type StaffRole, type UnitType } from "@/lib/domain";

type Tab = "unit" | "staf" | "qr" | "audit" | "demo";
interface Stage { id: string; name: string; sequence: number; estimated_service_minutes: number | null; near_turn_threshold: number; status: string }
interface Unit { id: string; name: string; type: UnitType; status: string; stages: Stage[] }
interface Staff { id: string; username: string; role: StaffRole; service_unit_id: string | null; service_unit_name: string | null; status: string }
interface Qr { id: string; code: string; status: string; unit_name: string | null; url: string; image_url: string }
interface Log { id: string; actor_username: string | null; ticket_number: string | null; action: string; previous_status: string | null; new_status: string | null; created_at: string; metadata: any }

const TABS: { id: Tab; label: string }[] = [
  { id: "unit", label: "Unit dan tahap" },
  { id: "staf", label: "Akun staf" },
  { id: "qr", label: "QR lokasi" },
  { id: "audit", label: "Audit log" },
  { id: "demo", label: "Data demo" },
];

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Terjadi gangguan. Coba lagi.");

export function AdminConsole({ hospitalId, demoMode, selfId }: { hospitalId: string | null; demoMode: boolean; selfId: string }) {
  const [tab, setTab] = useState<Tab>("unit");
  if (!hospitalId)
    return (
      <div className="measure stack-16">
        <h1 className="t-heading">Belum ada rumah sakit.</h1>
        <p className="t-lead muted">Jalankan seed demo dari tab Data demo, atau <span className="mono">pnpm db:seed</span>.</p>
        {demoMode ? <DemoTab /> : null}
      </div>
    );
  return (
    <>
      <header className="page__head" style={{ marginBottom: 24 }}>
        <p className="t-eyebrow">Administrasi rumah sakit</p>
        <h1 className="t-heading" style={{ fontSize: 28 }}>Konfigurasi operasional</h1>
      </header>
      <div className="tabs" role="tablist" aria-label="Bagian administrasi">
        {TABS.filter((t) => t.id !== "demo" || demoMode).map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" className="tab" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "unit" ? <UnitsTab hospitalId={hospitalId} /> : null}
        {tab === "staf" ? <StaffTab hospitalId={hospitalId} selfId={selfId} /> : null}
        {tab === "qr" ? <QrTab hospitalId={hospitalId} /> : null}
        {tab === "audit" ? <AuditTab /> : null}
        {tab === "demo" ? <DemoTab /> : null}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ unit + tahap */
function UnitsTab({ hospitalId }: { hospitalId: string }) {
  const toast = useToast();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<UnitType>("clinic");
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUnits((await api<Unit[]>(`/hospitals/${hospitalId}/service-units`)).data);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [hospitalId]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    try {
      await api(`/hospitals/${hospitalId}/service-units`, { body: { name, type } });
      setName("");
      toast("Unit dibuat.");
      load();
    } catch (er) {
      setFormErr(errMsg(er));
    }
  }

  async function toggle(u: Unit) {
    try {
      await api(`/service-units/${u.id}`, { method: "PATCH", body: { status: u.status === "active" ? "inactive" : "active" } });
      toast(u.status === "active" ? "Unit dinonaktifkan." : "Unit diaktifkan.");
      load();
    } catch (er) {
      toast(errMsg(er), "error");
    }
  }

  return (
    <div className="stack-24">
      {err ? <div className="alert alert--error" role="alert"><Icon name="alert" /><div>{err}</div></div> : null}
      <form onSubmit={create} className="panel panel--flat stack-12" aria-label="Tambah unit" noValidate>
        <h2 className="t-label">Tambah unit</h2>
        <div className="inline-form">
          <div className="field" style={{ flex: "2 1 220px" }}>
            <label htmlFor="un">Nama unit</label>
            <input id="un" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={formErr ? true : undefined} aria-describedby={formErr ? "un-err" : undefined} />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="ut">Jenis</label>
            <select id="ut" className="select" value={type} onChange={(e) => setType(e.target.value as UnitType)}>
              {(Object.keys(UNIT_TYPE_LABEL) as UnitType[]).map((t) => <option key={t} value={t}>{UNIT_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn--primary"><Icon name="plus" />Tambah</button>
        </div>
        {formErr ? <p id="un-err" className="error-text" role="alert">{formErr}</p> : null}
      </form>

      {units === null ? <div className="sk" style={{ height: 160 }} aria-busy="true" /> : units.length === 0 ? (
        <div className="empty"><p className="t-label">Belum ada unit</p><p className="t-small muted">Tambahkan pendaftaran, poli, dan farmasi.</p></div>
      ) : units.map((u) => (
        <article key={u.id} className="unit-card" data-testid="unit-card">
          <div className="unit-card__head">
            <div>
              <h3 className="t-label" style={{ fontSize: 16 }}>{u.name}</h3>
              <p className="t-date muted">{UNIT_TYPE_LABEL[u.type]}</p>
            </div>
            <div className="row row--tight">
              <span className={`chip ${u.status === "active" ? "chip--ok" : "chip--off"}`}><span className="chip__dot" />{u.status === "active" ? "Aktif" : "Nonaktif"}</span>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => toggle(u)}>{u.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button>
            </div>
          </div>
          <div className="unit-card__body">
            {u.stages.length === 0 ? <p className="hint">Belum ada tahap. Tanpa tahap aktif, unit ini tidak bisa dipilih pasien.</p> : u.stages.map((s) => <StageRow key={s.id} s={s} onSaved={load} />)}
            <AddStage unitId={u.id} nextSeq={(u.stages.at(-1)?.sequence ?? 0) + 1} onSaved={load} />
          </div>
        </article>
      ))}
    </div>
  );
}

function StageRow({ s, onSaved }: { s: Stage; onSaved: () => void }) {
  const toast = useToast();
  const [minutes, setMinutes] = useState(String(s.estimated_service_minutes ?? ""));
  const [thr, setThr] = useState(String(s.near_turn_threshold));
  const [err, setErr] = useState<string | null>(null);
  const dirty = minutes !== String(s.estimated_service_minutes ?? "") || thr !== String(s.near_turn_threshold);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const body: Record<string, number> = {};
    if (minutes !== "") body.estimated_service_minutes = Number(minutes);
    body.near_turn_threshold = Number(thr);
    try {
      await api(`/service-stages/${s.id}`, { method: "PATCH", body });
      toast(`Tahap “${s.name}” disimpan.`);
      onSaved();
    } catch (er) {
      setErr(errMsg(er));
    }
  }
  async function toggle() {
    try {
      await api(`/service-stages/${s.id}`, { method: "PATCH", body: { status: s.status === "active" ? "inactive" : "active" } });
      onSaved();
    } catch (er) {
      toast(errMsg(er), "error");
    }
  }
  return (
    <form onSubmit={save} className="inline-form" aria-label={`Tahap ${s.name}`} noValidate>
      <div className="field" style={{ flex: "2 1 200px" }}>
        <span className="label">Tahap {s.sequence}</span>
        <strong className="t-label" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{s.name}</strong>
      </div>
      <div className="field" style={{ flex: "1 1 130px" }}>
        <label htmlFor={`m-${s.id}`}>Durasi (menit)</label>
        <input id={`m-${s.id}`} className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={err ? true : undefined} />
      </div>
      <div className="field" style={{ flex: "1 1 130px" }}>
        <label htmlFor={`t-${s.id}`}>Ambang giliran dekat</label>
        <input id={`t-${s.id}`} className="input" inputMode="numeric" value={thr} onChange={(e) => setThr(e.target.value)} aria-invalid={err ? true : undefined} />
      </div>
      <button type="submit" className="btn btn--primary btn--sm" disabled={!dirty}>Simpan</button>
      <button type="button" className="btn btn--secondary btn--sm" onClick={toggle}>{s.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button>
      {err ? <p className="error-text" role="alert" style={{ flexBasis: "100%" }}>{err}</p> : null}
    </form>
  );
}

function AddStage({ unitId, nextSeq, onSaved }: { unitId: string; nextSeq: number; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("10");
  const [thr, setThr] = useState("2");
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <div><button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(true)}><Icon name="plus" />Tambah tahap</button></div>;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/service-units/${unitId}/stages`, { body: { name, sequence: nextSeq, estimated_service_minutes: minutes === "" ? null : Number(minutes), near_turn_threshold: Number(thr) } });
      toast("Tahap ditambahkan.");
      setOpen(false);
      setName("");
      onSaved();
    } catch (er) {
      setErr(errMsg(er));
    }
  }
  return (
    <form onSubmit={save} className="inline-form" aria-label="Tambah tahap" noValidate>
      <div className="field" style={{ flex: "2 1 200px" }}><label htmlFor={`an-${unitId}`}>Nama tahap</label><input id={`an-${unitId}`} className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field" style={{ flex: "1 1 120px" }}><label htmlFor={`am-${unitId}`}>Durasi (menit)</label><input id={`am-${unitId}`} className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
      <div className="field" style={{ flex: "1 1 120px" }}><label htmlFor={`at-${unitId}`}>Ambang</label><input id={`at-${unitId}`} className="input" inputMode="numeric" value={thr} onChange={(e) => setThr(e.target.value)} /></div>
      <button type="submit" className="btn btn--primary btn--sm">Simpan tahap</button>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(false)}>Batal</button>
      {err ? <p className="error-text" role="alert" style={{ flexBasis: "100%" }}>{err}</p> : null}
    </form>
  );
}

/* ------------------------------------------------------------------ staf */
function StaffTab({ hospitalId, selfId }: { hospitalId: string; selfId: string }) {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ username: "", password: "", role: "staff_clinic" as StaffRole, unit: "" });
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([api<Staff[]>("/staff-users"), api<Unit[]>(`/hospitals/${hospitalId}/service-units`)]);
      setStaff(s.data);
      setUnits(u.data);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [hospitalId]);
  useEffect(() => { load(); }, [load]);

  const typeFor = (r: StaffRole): UnitType | null => (r === "staff_registration" ? "registration" : r === "staff_clinic" ? "clinic" : r === "staff_pharmacy" ? "pharmacy" : null);
  const unitOptions = units.filter((u) => u.status === "active" && u.type === typeFor(f.role));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    try {
      await api("/staff-users", { body: { username: f.username, password: f.password, role: f.role, service_unit_id: f.role === "admin" ? null : f.unit || null } });
      setF({ ...f, username: "", password: "" });
      toast("Akun dibuat.");
      load();
    } catch (er) {
      setFormErr(errMsg(er));
    }
  }
  async function toggle(s: Staff) {
    try {
      await api(`/staff-users/${s.id}`, { method: "PATCH", body: { status: s.status === "active" ? "inactive" : "active" } });
      toast(s.status === "active" ? "Akun dinonaktifkan; sesinya langsung berakhir." : "Akun diaktifkan.");
      load();
    } catch (er) {
      toast(errMsg(er), "error");
    }
  }

  return (
    <div className="stack-24">
      {err ? <div className="alert alert--error" role="alert"><Icon name="alert" /><div>{err}</div></div> : null}
      <form onSubmit={create} className="panel panel--flat stack-12" aria-label="Buat akun staf" noValidate>
        <h2 className="t-label">Buat akun staf</h2>
        <div className="inline-form">
          <div className="field" style={{ flex: "1 1 160px" }}><label htmlFor="su">Nama pengguna</label><input id="su" className="input" autoComplete="off" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div className="field" style={{ flex: "1 1 160px" }}><label htmlFor="sp">Kata sandi (min. 8)</label><input id="sp" className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="sr">Peran</label>
            <select id="sr" className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as StaffRole, unit: "" })}>
              {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          {f.role !== "admin" ? (
            <div className="field" style={{ flex: "1 1 180px" }}>
              <label htmlFor="sun">Unit</label>
              <select id="sun" className="select" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
                <option value="">Pilih unit</option>
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          ) : null}
          <button type="submit" className="btn btn--primary"><Icon name="plus" />Buat akun</button>
        </div>
        {formErr ? <p className="error-text" role="alert">{formErr}</p> : null}
      </form>

      {staff === null ? <div className="sk" style={{ height: 160 }} aria-busy="true" /> : (
        <div className="table-wrap">
          <table className="table" data-testid="staff-table">
            <thead><tr><th>Pengguna</th><th>Peran</th><th>Unit</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="num">{s.username}{s.id === selfId ? <span className="t-date muted"> (Anda)</span> : null}</td>
                  <td>{ROLE_LABEL[s.role]}</td>
                  <td>{s.service_unit_name ?? "—"}</td>
                  <td><span className={`chip ${s.status === "active" ? "chip--ok" : "chip--off"}`}><span className="chip__dot" />{s.status === "active" ? "Aktif" : "Nonaktif"}</span></td>
                  <td style={{ textAlign: "right" }}>{s.id === selfId ? null : <button type="button" className="btn btn--secondary btn--sm" onClick={() => toggle(s)}>{s.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ QR */
function QrTab({ hospitalId }: { hospitalId: string }) {
  const toast = useToast();
  const [qrs, setQrs] = useState<Qr[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setQrs((await api<Qr[]>(`/hospitals/${hospitalId}/qr-codes`)).data); setErr(null); } catch (e) { setErr(errMsg(e)); }
  }, [hospitalId]);
  useEffect(() => { load(); }, [load]);
  async function toggle(q: Qr) {
    try {
      await api(`/location-qr-codes-admin/${q.id}`, { method: "PATCH", body: { status: q.status === "active" ? "inactive" : "active" } });
      toast(q.status === "active" ? "QR dinonaktifkan. Pemindaian berikutnya ditolak." : "QR diaktifkan.");
      load();
    } catch (er) { toast(errMsg(er), "error"); }
  }
  return (
    <div className="stack-16">
      {err ? <div className="alert alert--error" role="alert"><Icon name="alert" /><div>{err}</div></div> : null}
      <p className="t-small muted measure">Cetak QR dan tempel di lokasi poli. Pasien yang memindai langsung mendapat formulir dengan rumah sakit dan poli terisi.</p>
      {qrs === null ? <div className="sk" style={{ height: 140 }} aria-busy="true" /> : qrs.length === 0 ? <div className="empty"><p className="t-label">Belum ada QR</p></div> : (
        <div className="stack-12">
          {qrs.map((q) => (
            <div key={q.id} className="qr-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.image_url} alt={`Kode QR ${q.code}`} width={112} height={112} />
              <div className="stack-8">
                <div className="row row--tight">
                  <strong className="t-label mono">{q.code}</strong>
                  <span className={`chip ${q.status === "active" ? "chip--ok" : "chip--off"}`}><span className="chip__dot" />{q.status === "active" ? "Aktif" : "Nonaktif"}</span>
                </div>
                <p className="t-small muted">{q.unit_name ?? "Semua poli"}</p>
                <p className="t-date mono muted" style={{ overflowWrap: "anywhere" }}>{q.url}</p>
                <div className="row row--tight">
                  <a className="btn btn--primary btn--sm" href={`/qr/${encodeURIComponent(q.code)}`} target="_blank" rel="noreferrer">Poster QR</a>
                  <a className="btn btn--secondary btn--sm" href={q.url} target="_blank" rel="noreferrer">Uji pemindaian</a>
                  <a className="btn btn--secondary btn--sm" href={q.image_url} download={`qr-${q.code}.svg`}><Icon name="download" />Unduh</a>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => toggle(q)}>{q.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ audit log (hanya baca) */
function AuditTab() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (ticket.trim()) q.set("ticket_id", ticket.trim());
    if (from) q.set("date_from", from);
    if (to) q.set("date_to", to);
    try { setLogs((await api<Log[]>(`/audit-logs?${q}`)).data); setErr(null); } catch (e) { setErr(errMsg(e)); setLogs([]); }
  }, [ticket, from, to]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="stack-16">
      <div className="inline-form panel panel--flat">
        <div className="field" style={{ flex: "2 1 260px" }}><label htmlFor="at">ID tiket (opsional)</label><input id="at" className="input input--mono" value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="UUID tiket" /></div>
        <div className="field" style={{ flex: "1 1 150px" }}><label htmlFor="af">Dari tanggal</label><input id="af" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field" style={{ flex: "1 1 150px" }}><label htmlFor="ato">Sampai tanggal</label><input id="ato" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {err ? <div className="alert alert--error" role="alert"><Icon name="alert" /><div>{err}</div></div> : null}
      {logs === null ? <div className="sk" style={{ height: 160 }} aria-busy="true" /> : logs.length === 0 ? <div className="empty"><p className="t-label">Tidak ada catatan</p><p className="t-small muted">Ubah filter atau jalankan aksi petugas.</p></div> : (
        <div className="table-wrap">
          <table className="table" data-testid="audit-table">
            <thead><tr><th>Waktu</th><th>Aktor</th><th>Tiket</th><th>Aksi</th><th>Status</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="num">{fmtDateTime(l.created_at)}</td>
                  <td className="num">{l.actor_username ?? "sistem"}</td>
                  <td className="num">{l.ticket_number ?? "—"}</td>
                  <td className="num">{l.action}</td>
                  <td className="num">{l.previous_status || l.new_status ? `${l.previous_status ?? "·"} → ${l.new_status ?? "·"}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">Hanya baca. Basis data menolak perubahan dan penghapusan catatan audit.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ demo */
function DemoTab() {
  const toast = useToast();
  const [busy, setBusy] = useState<"seed" | "reset" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  async function run(kind: "seed" | "reset") {
    if (kind === "reset" && !window.confirm("Reset data demo? Semua tiket, token tiket, dan akun akan dikembalikan ke kondisi awal, dan Anda akan keluar.")) return;
    setBusy(kind);
    setResult(null);
    try {
      const { data } = await api<any>(`/demo/${kind}`, { body: {} });
      const c = data.counts;
      setResult(`${kind === "reset" ? "Data dikembalikan ke kondisi awal" : "Seed selesai"}: ${c.visits} kunjungan, ${c.tickets} tiket, ${c.patients} pasien.${data.created_visits === 0 && kind === "seed" ? " Tidak ada duplikasi dibuat." : ""}`);
      toast(kind === "reset" ? "Data demo direset." : "Seed demo dijalankan.");
      if (kind === "reset") setTimeout(() => window.location.assign("/masuk"), 1200);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="stack-16 measure">
      <p className="t-body">Seluruh data di lingkungan ini tiruan. Seed aman dijalankan berulang kali; reset menghapus data operasional lalu memuat ulang baseline.</p>
      <div className="row">
        <button type="button" className="btn btn--secondary" disabled={busy !== null} onClick={() => run("seed")}>{busy === "seed" ? <span className="spinner" /> : null}Jalankan seed</button>
        <button type="button" className="btn btn--danger" disabled={busy !== null} onClick={() => run("reset")}>{busy === "reset" ? <span className="spinner" /> : <Icon name="refresh" />}Reset data demo</button>
      </div>
      {result ? <div className="alert alert--ok" role="status"><Icon name="check" /><div>{result}</div></div> : null}
    </div>
  );
}
