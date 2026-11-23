"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { api, ApiError, fmtDate, fmtTime } from "@/lib/client";
import { PATIENT_POLL_MS } from "@/lib/poll";
import type { StageDto } from "@/lib/services/flow";

interface Upcoming { service_stage_id: string; stage_name: string; unit_name: string; unit_type: string }
interface VisitView {
  visit: { id: string; visit_date: string; status: "active" | "completed" | "cancelled"; valid_until: string };
  hospital: { id: string; name: string };
  clinic: { id: string; name: string };
  patient: { display_name: string; medical_record_number: string };
  ticket: { id: string; ticket_number: string };
  ticket_stages: StageDto[];
  upcoming_stages: Upcoming[];
  flow_notice: string | null;
  notifications: { near_turn: boolean; ready_for_pickup: boolean };
}

const DONE = ["selesai", "diserahkan", "dilewati", "dibatalkan"];

function StatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span className={`chip chip--${status}`}>
      <span className="chip__dot" />
      {label}
    </span>
  );
}

function headlineOf(v: VisitView): { title: string; sub: string | null } {
  if (v.visit.status === "completed") return { title: "Kunjungan selesai", sub: "Seluruh tahap sudah dilalui. Terima kasih sudah menunggu." };
  if (v.visit.status === "cancelled") return { title: "Kunjungan dibatalkan", sub: "Hubungi loket pendaftaran bila ini tidak sesuai." };
  const ready = v.ticket_stages.find((s) => s.status === "siap_diambil");
  if (ready) return { title: "Obat Anda siap diambil", sub: `Tunjukkan tiket ${v.ticket.ticket_number} di ${ready.unit_name}.` };
  const cur = [...v.ticket_stages].reverse().find((s) => !DONE.includes(s.status));
  if (!cur) return { title: "Menunggu tahap berikutnya", sub: v.flow_notice };
  if (cur.status === "dipanggil") return { title: `Anda dipanggil ke ${cur.unit_name}`, sub: "Silakan menuju loket sekarang." };
  if (cur.status === "sedang_dilayani")
    return { title: cur.unit_type === "pharmacy" ? "Obat Anda sedang diproses" : `Sedang dilayani di ${cur.unit_name}`, sub: null };
  return { title: `Menunggu di ${cur.unit_name}`, sub: cur.queue_position ? `Posisi antrean ${cur.queue_position}.` : null };
}

export function TicketView({ visitId }: { visitId: string }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<VisitView | null>(null);
  const [fatal, setFatal] = useState<ApiError | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<Date | null>(null);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotateErr, setRotateErr] = useState<string | null>(null);
  const status = useRef<string>("active");
  const hadData = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    setToken(window.location.hash.replace(/^#/, "") || null);
  }, []);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    try {
      const { data: d } = await api<VisitView>(`/visits/${visitId}`, { token });
      status.current = d.visit.status;
      hadData.current = true;
      setData(d);
      setStale(null);
      setFatal(null);
      setLastOk(new Date());
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 404)) setFatal(e);
      else setStale(e instanceof ApiError ? e.message : "Gagal menyegarkan status.");
    } finally {
      inFlight.current = false;
    }
  }, [token, visitId]);

  useEffect(() => {
    if (!token) return;
    load();
    const tick = () => {
      if (document.visibilityState === "visible" && status.current === "active") load();
    };
    const id = setInterval(tick, PATIENT_POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token, load]);

  const headline = useMemo(() => (data ? headlineOf(data) : null), [data]);
  useEffect(() => {
    if (data && headline) document.title = `${data.ticket.ticket_number} · ${headline.title} · Giliranku`;
  }, [data, headline]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 3000);
  }

  async function rotate() {
    if (!token) return;
    if (!window.confirm("Terbitkan tautan baru? Tautan lama, termasuk yang sudah dibagikan ke keluarga, akan berhenti berlaku.")) return;
    setRotating(true);
    setRotateErr(null);
    try {
      const { data: r } = await api<{ access_url: string }>(`/visits/${visitId}/refresh-token`, { method: "POST", token, body: {} });
      const next = new URL(r.access_url).hash.replace(/^#/, "");
      window.history.replaceState(null, "", `${window.location.pathname}#${next}`);
      setToken(next);
    } catch (e) {
      setRotateErr(e instanceof ApiError ? e.message : "Gagal menerbitkan tautan baru.");
    } finally {
      setRotating(false);
    }
  }

  if (token === undefined) {
    return (
      <div className="stack-16" aria-busy="true">
        <div className="sk sk--t" /> <div className="sk sk--b" /> <div className="sk sk--b" />
      </div>
    );
  }

  if (token === null || fatal) {
    return (
      <div className="measure stack-24" role="alert">
        <p className="t-eyebrow">Tiket tidak dapat dibuka</p>
        <h1 className="t-opening">
          {hadData.current ? "Tiket ini tidak lagi dapat dibuka." : "Tautan tiket tidak valid atau sudah berakhir."}
        </h1>
        <p className="t-lead muted">
          {token === null
            ? "Tautan ini tidak memuat kunci akses. Buka tautan lengkap yang diberikan saat tiket dibuat."
            : hadData.current
              ? "Tautan sudah diganti, kedaluwarsa, atau data demo baru saja direset. Buat tiket demo baru untuk mencoba lagi."
              : "Minta tautan baru di loket pendaftaran, atau buat tiket baru bila kunjungan Anda belum berlangsung."}
        </p>
        <div className="row">
          <Link className="btn btn--primary" href="/daftar">Buat tiket baru</Link>
          <Link className="btn btn--secondary" href="/">Kembali ke beranda</Link>
        </div>
      </div>
    );
  }

  if (!data || !headline) {
    return (
      <div className="stack-16" aria-busy="true" aria-label="Memuat tiket">
        <div className="sk sk--t" /> <div className="sk sk--b" /> <div className="sk sk--b" />
        {stale ? <div className="alert alert--error" role="alert"><Icon name="wifiOff" /><div>{stale}</div></div> : null}
      </div>
    );
  }

  const stages = data.ticket_stages;
  const currentId = [...stages].reverse().find((s) => !DONE.includes(s.status))?.id;
  const active = data.visit.status === "active";

  return (
    <div className="split">
      <div className="stack-24">
        <header className="ticket-hero">
          <div>
            <p className="t-eyebrow">
              {data.hospital.name} · {fmtDate(data.visit.visit_date)}
            </p>
            <h1 className="ticket-no" aria-label={`Nomor tiket ${data.ticket.ticket_number}`}>{data.ticket.ticket_number}</h1>
          </div>
          <div className="live" role="status">
            <span className={`live-dot ${stale || !active ? "live-dot--stale" : ""}`} aria-hidden="true" />
            <span className="t-date">
              {!active ? "Kunjungan ditutup" : stale ? `Data terakhir ${fmtTime(lastOk, true)}` : `Diperbarui ${fmtTime(lastOk, true)}`}
            </span>
          </div>
        </header>

        {stale ? (
          <div className="alert alert--error" role="alert">
            <Icon name="wifiOff" />
            <div>
              <strong>Gagal menyegarkan status.</strong> Angka di bawah mungkin sudah berubah. Mencoba lagi otomatis tiap {PATIENT_POLL_MS / 1000} detik.
            </div>
          </div>
        ) : null}

        <div aria-live="polite" className="stack-12">
          {data.notifications.ready_for_pickup ? (
            <div className="banner banner--pickup" data-testid="banner-pickup">
              <span className="icon-chip icon-chip--32 icon-chip--mint"><Icon name="pill" /></span>
              <div>
                <p className="banner__title">Obat siap diambil</p>
                <p className="t-small">Tunjukkan tiket {data.ticket.ticket_number} di loket farmasi.</p>
              </div>
            </div>
          ) : null}
          {data.notifications.near_turn && !data.notifications.ready_for_pickup ? (
            <div className="banner banner--near" data-testid="banner-near">
              <span className="icon-chip icon-chip--32"><Icon name="bell" /></span>
              <div>
                <p className="banner__title">Giliran Anda sudah dekat</p>
                <p className="t-small">Bersiap menuju loket. Tetap di sekitar ruang tunggu.</p>
              </div>
            </div>
          ) : null}
        </div>

        <section aria-labelledby="ringkas" className="stack-8">
          <h2 id="ringkas" className="t-heading" style={{ fontSize: 28 }}>{headline.title}</h2>
          {headline.sub ? <p className="t-lead muted">{headline.sub}</p> : null}
        </section>

        {data.flow_notice ? (
          <div className="alert alert--lime" role="status">
            <Icon name="alert" />
            <div>{data.flow_notice}</div>
          </div>
        ) : null}

        <ol className={`stage-list ${stale ? "is-stale" : ""}`} aria-label="Tahap kunjungan">
          {stages.map((s) => {
            const done = DONE.includes(s.status);
            const cls = done ? "stage--done" : s.id === currentId ? "stage--current" : "";
            return (
              <li key={s.id} className={`stage ${cls}`} aria-current={s.id === currentId ? "step" : undefined}>
                <span className="stage__marker" aria-hidden="true">{done ? <Icon name="check" /> : null}</span>
                <div>
                  <p className="stage__name">{s.stage_name}</p>
                  <p className="stage__meta">
                    <span>{s.unit_name}</span>
                    {s.completed_at ? <span>selesai {fmtTime(s.completed_at)}</span> : null}
                    {s.queue_position !== null && s.wait_estimate_available === true ? (
                      <span>perkiraan {s.estimated_wait_minutes === 0 ? "giliran berikutnya" : `${s.estimated_wait_minutes} menit`}</span>
                    ) : null}
                    {s.queue_position !== null && s.wait_estimate_available === false ? <span>perkiraan waktu belum tersedia</span> : null}
                  </p>
                  <div style={{ marginTop: 10 }}><StatusChip status={s.status} label={s.status_label} /></div>
                </div>
                {s.queue_position !== null ? (
                  <div className="stage__nums">
                    <span className="stage__pos" data-testid="position">{s.queue_position}</span>
                    <small className="stage__pos-label">posisi antrean</small>
                  </div>
                ) : null}
              </li>
            );
          })}
          {active
            ? data.upcoming_stages.map((u) => (
                <li key={u.service_stage_id} className="stage stage--future">
                  <span className="stage__marker" aria-hidden="true" />
                  <div>
                    <p className="stage__name">{u.stage_name}</p>
                    <p className="stage__meta"><span>{u.unit_name}</span><span>dibuka setelah tahap sebelumnya selesai</span></p>
                    <div style={{ marginTop: 10 }}>
                      <span className="chip chip--off"><span className="chip__dot" />Belum dimulai</span>
                    </div>
                  </div>
                </li>
              ))
            : null}
        </ol>
      </div>

      <aside className="aside-note stack-16" aria-label="Detail tiket">
        <div className="panel panel--flat">
          <h2 className="t-label" style={{ marginBottom: 12 }}>Data kunjungan</h2>
          <dl className="kv">
            <div><dt>Nama</dt><dd>{data.patient.display_name}</dd></div>
            <div><dt>No. rekam medis</dt><dd className="mono">{data.patient.medical_record_number}</dd></div>
            <div><dt>Poli</dt><dd>{data.clinic.name}</dd></div>
            <div><dt>Tiket berlaku sampai</dt><dd>{fmtDate(data.visit.valid_until)}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <h2 className="t-label">Bagikan ke keluarga</h2>
          <p className="t-small muted" style={{ marginTop: 6 }}>
            Siapa pun yang memegang tautan ini dapat melihat status tiket. Tautan tidak dapat dipakai untuk mengubah data.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--secondary btn--sm" onClick={copyLink}>
              <Icon name="copy" />
              {copied === "ok" ? "Tautan disalin" : copied === "fail" ? "Salin manual dari bilah alamat" : "Salin tautan"}
            </button>
            {active ? (
              <button type="button" className="btn btn--secondary btn--sm" onClick={rotate} disabled={rotating}>
                <Icon name="refresh" />
                Terbitkan tautan baru
              </button>
            ) : null}
          </div>
          {rotateErr ? <p className="error-text" role="alert" style={{ marginTop: 8 }}>{rotateErr}</p> : null}
        </div>
        <p className="hint">Perkiraan waktu dihitung dari durasi layanan yang diatur rumah sakit, bukan janji layanan.</p>
      </aside>
    </div>
  );
}
