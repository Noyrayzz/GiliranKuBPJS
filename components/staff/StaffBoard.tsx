"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { useToast } from "../Toast";
import { api, ApiError, fmtTime } from "@/lib/client";
import { STAFF_POLL_MS } from "@/lib/poll";
import { availableActions, UNIT_TYPE_LABEL, type StageAction, type UnitType } from "@/lib/domain";
import type { StageDto } from "@/lib/services/flow";

type Item = StageDto & { ticket: { id: string; ticket_number: string }; patient: { display_name: string; medical_record_number: string } };
interface Meta {
  date: string;
  stages: { id: string; name: string; sequence: number; status: string }[];
  counts: { waiting: number; in_progress: number; done: number };
}

type Act = Exclude<StageAction, "call_next">;
const PATH: Record<Act, string> = { start: "start", complete: "complete", ready_for_pickup: "ready-for-pickup", hand_over: "hand-over" };
const LABEL: Record<Act, string> = { start: "Mulai layanan", complete: "Selesai", ready_for_pickup: "Siap diambil", hand_over: "Serahkan obat" };
const ICON: Record<Act, Parameters<typeof Icon>[0]["name"]> = { start: "play", complete: "check", ready_for_pickup: "pill", hand_over: "box" };
const WORKING = ["dipanggil", "sedang_dilayani", "siap_diambil"];
const FINISHED = ["selesai", "diserahkan", "dilewati", "dibatalkan"];

function Chip({ s, label }: { s: string; label: string }) {
  return (
    <span className={`chip chip--${s}`}>
      <span className="chip__dot" />
      {label}
    </span>
  );
}

export function StaffBoard({ unitId, unitName, unitType }: { unitId: string; unitName: string; unitType: UnitType }) {
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const { data, meta: m } = await api<{ ticket_stages: Item[] }>(`/service-units/${unitId}/queue`);
      setItems(data.ticket_stages);
      setMeta(m);
      setErr(null);
      setLast(new Date());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return window.location.assign("/masuk");
      setErr(e instanceof ApiError ? e.message : "Gagal memuat antrean.");
    } finally {
      inFlight.current = false;
    }
  }, [unitId]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), STAFF_POLL_MS);
    const v = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", v);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", v);
    };
  }, [load]);

  async function callNext(stageId: string) {
    setBusy(`call:${stageId}`);
    try {
      const { data } = await api<any>(`/service-stages/${stageId}/call-next`, { method: "POST", body: {} });
      if (data.empty) toast(data.message ?? "Antrean kosong.");
      else toast(`Memanggil ${data.ticket.ticket_number} · ${data.ticket_stage.patient.display_name}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Gagal memanggil.", "error");
    } finally {
      setBusy(null);
      load();
    }
  }

  async function act(item: Item, action: Act) {
    setBusy(item.id);
    try {
      const { data } = await api<any>(`/ticket-stages/${item.id}/${PATH[action]}`, { method: "POST", body: {} });
      const next = data.advanced_to ? ` → ${data.advanced_to.unit}` : data.visit_status === "completed" ? " · kunjungan selesai" : data.needs_admin ? " · tahap berikutnya belum dikonfigurasi" : "";
      toast(`${item.ticket.ticket_number}: ${data.ticket_stage.status_label}${next}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Aksi gagal. Status tidak berubah.", "error");
    } finally {
      setBusy(null);
      load();
    }
  }

  const activeStages = (meta?.stages ?? []).filter((s) => s.status === "active");
  const waiting = (items ?? []).filter((i) => i.status === "menunggu");
  const working = (items ?? []).filter((i) => WORKING.includes(i.status));
  const finished = (items ?? []).filter((i) => FINISHED.includes(i.status)).reverse();

  return (
    <>
      <header className="row row--between" style={{ marginBottom: 24, alignItems: "flex-end" }}>
        <div>
          <p className="t-eyebrow">{UNIT_TYPE_LABEL[unitType]} · {meta?.date ?? "hari ini"}</p>
          <h1 className="t-heading" style={{ fontSize: 28 }}>{unitName}</h1>
        </div>
        <div className="live" role="status">
          <span className={`live-dot ${err ? "live-dot--stale" : ""}`} aria-hidden="true" />
          <span className="t-date">{err ? `Terakhir ${fmtTime(last, true)}` : `Diperbarui ${fmtTime(last, true)}`}</span>
        </div>
      </header>

      {err ? (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 16 }}>
          <Icon name="wifiOff" />
          <div><strong>{err}</strong> Daftar di bawah mungkin tidak terbaru. Mencoba lagi otomatis.</div>
        </div>
      ) : null}

      <div className="board">
        <div className="board__side">
          <div className="counts" aria-label="Ringkasan antrean">
            <div><b data-testid="count-waiting">{meta?.counts.waiting ?? "–"}</b><span>menunggu</span></div>
            <div><b data-testid="count-working">{meta?.counts.in_progress ?? "–"}</b><span>diproses</span></div>
            <div><b data-testid="count-done">{meta?.counts.done ?? "–"}</b><span>selesai</span></div>
          </div>

          <div className="panel">
            <h2 className="t-label">Panggil pasien</h2>
            <p className="t-small muted" style={{ marginTop: 4 }}>
              {waiting.length > 0 ? `Berikutnya: ${waiting[0].ticket.ticket_number} · ${waiting[0].patient.display_name}` : "Tidak ada tiket yang menunggu."}
            </p>
            <div className="stack-8" style={{ marginTop: 12 }}>
              {activeStages.length === 0 && meta ? <p className="hint">Tidak ada tahap aktif di unit ini. Hubungi admin.</p> : null}
              {activeStages.map((s) => (
                <button key={s.id} type="button" className="btn btn--primary btn--block" disabled={busy !== null} onClick={() => callNext(s.id)} data-testid="call-next">
                  {busy === `call:${s.id}` ? <span className="spinner" aria-hidden="true" /> : <Icon name="megaphone" />}
                  Panggil berikutnya{activeStages.length > 1 ? ` · ${s.name}` : ""}
                </button>
              ))}
            </div>
          </div>

          {working.length > 0 ? (
            <section aria-label="Sedang ditangani" className="stack-12">
              <h2 className="t-label">Sedang ditangani</h2>
              {working.map((i) => (
                <div key={i.id} className="work-card" data-testid="work-card">
                  <div className="row row--between">
                    <span className="work-card__no">{i.ticket.ticket_number}</span>
                    <Chip s={i.status} label={i.status_label} />
                  </div>
                  <div>
                    <p className="t-label">{i.patient.display_name}</p>
                    <p className="t-small muted mono">{i.patient.medical_record_number}</p>
                  </div>
                  <div className="row row--tight">
                    {availableActions(i.status, unitType).map((a) => (
                      <button key={a} type="button" className={`btn ${a === "complete" || a === "hand_over" || a === "ready_for_pickup" ? "btn--primary" : "btn--secondary"} btn--sm`} disabled={busy !== null} onClick={() => act(i, a as Act)} data-action={a}>
                        {busy === i.id ? <span className="spinner" aria-hidden="true" /> : <Icon name={ICON[a as Act]} />}
                        {LABEL[a as Act]}
                      </button>
                    ))}
                  </div>
                  {i.called_at ? <p className="t-date muted">Dipanggil {fmtTime(i.called_at)}</p> : null}
                </div>
              ))}
            </section>
          ) : null}
        </div>

        <div className="stack-24">
          <section aria-labelledby="menunggu">
            <h2 id="menunggu" className="t-label" style={{ marginBottom: 12 }}>Antrean menunggu</h2>
            {items === null ? (
              <div className="sk" style={{ height: 160 }} aria-busy="true" />
            ) : waiting.length === 0 ? (
              <div className="empty" data-testid="empty-queue">
                <span className="icon-chip icon-chip--32"><Icon name="check" /></span>
                <p className="t-label">Antrean kosong</p>
                <p className="t-small muted">Tiket baru muncul di sini otomatis. Tidak perlu muat ulang.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table" data-testid="queue-table">
                  <thead><tr><th>Tiket</th><th>Pasien</th><th>No. RM</th><th>Posisi</th><th>Perkiraan</th></tr></thead>
                  <tbody>
                    {waiting.map((i) => (
                      <tr key={i.id}>
                        <td className="num"><strong>{i.ticket.ticket_number}</strong></td>
                        <td>{i.patient.display_name}</td>
                        <td className="num">{i.patient.medical_record_number}</td>
                        <td className="num">{i.queue_position}</td>
                        <td className="num">{i.wait_estimate_available ? (i.estimated_wait_minutes === 0 ? "berikutnya" : `${i.estimated_wait_minutes} mnt`) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {finished.length > 0 ? (
            <details>
              <summary className="t-label" style={{ cursor: "pointer", padding: "8px 0" }}>Selesai hari ini ({finished.length})</summary>
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead><tr><th>Tiket</th><th>Pasien</th><th>Status</th><th>Selesai</th></tr></thead>
                  <tbody>
                    {finished.map((i) => (
                      <tr key={i.id}>
                        <td className="num"><strong>{i.ticket.ticket_number}</strong></td>
                        <td>{i.patient.display_name}</td>
                        <td><Chip s={i.status} label={i.status_label} /></td>
                        <td className="num">{fmtTime(i.completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </>
  );
}
