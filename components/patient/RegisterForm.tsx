"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { api, ApiError } from "@/lib/client";

interface Clinic { id: string; name: string }
interface Hospital { id: string; name: string; clinics: Clinic[] }
type Errors = Record<string, string>;

const FIELD_LABEL: Record<string, string> = {
  national_identity_number: "nik",
  medical_record_number: "mrn",
  display_name: "nama",
  service_unit_id: "poli",
  visit_date: "tanggal",
  family_card_number: "kk",
  hospital_id: "poli",
};

export function RegisterForm({
  options,
  bounds,
  fromQr,
  preselectClinicId,
  qrError,
}: {
  options: Hospital[];
  bounds: { today: string; max: string };
  fromQr: boolean;
  preselectClinicId: string | null;
  qrError: string | null;
}) {
  const hospital = options[0] ?? null;
  const [clinicId, setClinicId] = useState(preselectClinicId ?? "");
  const [date, setDate] = useState(bounds.today);
  const [nik, setNik] = useState("");
  const [mrn, setMrn] = useState("");
  const [name, setName] = useState("");
  const [kk, setKk] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ url: string; number: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const refs = {
    nik: useRef<HTMLInputElement>(null),
    mrn: useRef<HTMLInputElement>(null),
    nama: useRef<HTMLInputElement>(null),
    kk: useRef<HTMLInputElement>(null),
    poli: useRef<HTMLSelectElement>(null),
    tanggal: useRef<HTMLInputElement>(null),
  };

  const clinics = useMemo(() => hospital?.clinics ?? [], [hospital]);

  function validate(): Errors {
    const e: Errors = {};
    const digits = nik.replace(/[\s-]/g, "");
    if (!digits) e.nik = "NIK wajib diisi.";
    else if (!/^\d{16}$/.test(digits)) e.nik = "NIK harus 16 digit angka.";
    if (!mrn.trim()) e.mrn = "Nomor rekam medis wajib diisi.";
    else if (!/^[A-Za-z0-9][A-Za-z0-9./-]{2,19}$/.test(mrn.trim())) e.mrn = "Nomor rekam medis 3–20 karakter: huruf, angka, titik, garis miring, atau strip.";
    if (name.trim().length < 2) e.nama = "Nama minimal 2 karakter.";
    const k = kk.replace(/[\s-]/g, "");
    if (k && !/^\d{16}$/.test(k)) e.kk = "Nomor KK harus 16 digit angka.";
    if (!clinicId) e.poli = "Pilih poli tujuan.";
    if (!date) e.tanggal = "Tanggal kunjungan wajib diisi.";
    else if (date < bounds.today || date > bounds.max) e.tanggal = "Pilih tanggal dari hari ini sampai 14 hari ke depan.";
    return e;
  }

  function focusFirst(e: Errors) {
    for (const key of ["nik", "mrn", "nama", "kk", "poli", "tanggal"] as const) {
      if (e[key]) {
        refs[key].current?.focus();
        return;
      }
    }
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (inFlight.current || !hospital) return;
    setFormError(null);
    setExisting(null);
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return focusFirst(v);

    inFlight.current = true;
    setBusy(true);
    try {
      const { data } = await api<{ access_url: string }>("/patient-visits", {
        body: {
          national_identity_number: nik,
          family_card_number: kk || null,
          medical_record_number: mrn,
          display_name: name,
          hospital_id: hospital.id,
          service_unit_id: clinicId,
          visit_date: date,
        },
      });
      const u = new URL(data.access_url);
      window.location.assign(u.pathname + u.hash);
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      if (err instanceof ApiError) {
        if (err.code === "CONFLICT" && err.details?.[0]?.code === "ACTIVE_TICKET_EXISTS") {
          const d = err.details[0];
          const u = new URL(d.access_url);
          setExisting({ url: u.pathname + u.hash, number: d.ticket_number });
          return;
        }
        if (err.code === "VALIDATION_ERROR" && err.details?.length) {
          const next: Errors = {};
          for (const d of err.details) {
            const key = FIELD_LABEL[d.field];
            if (key && !next[key]) next[key] = d.message;
          }
          if (Object.keys(next).length) {
            setErrors(next);
            return focusFirst(next);
          }
        }
        setFormError(err.message);
      } else setFormError("Terjadi gangguan. Coba lagi.");
    }
  }

  if (qrError) {
    return (
      <div className="measure stack-24" role="alert">
        <p className="t-eyebrow">QR lokasi</p>
        <h1 className="t-opening">QR ini tidak berlaku.</h1>
        <p className="t-lead muted">{qrError}</p>
        <div className="row">
          <Link className="btn btn--primary" href="/daftar">
            Isi pendaftaran tanpa QR
          </Link>
          <Link className="btn btn--secondary" href="/">
            Kembali ke beranda
          </Link>
        </div>
      </div>
    );
  }

  if (!hospital || clinics.length === 0) {
    return (
      <div className="measure stack-24">
        <p className="t-eyebrow">Pendaftaran</p>
        <h1 className="t-opening">Pendaftaran belum dibuka.</h1>
        <p className="t-lead muted">Belum ada poli aktif yang dikonfigurasi. Hubungi petugas pendaftaran rumah sakit.</p>
      </div>
    );
  }

  const err = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-err` } : {});
  const errText = (k: string) => (errors[k] ? <span id={`${k}-err`} className="error-text" role="alert">{errors[k]}</span> : null);

  return (
    <div className="split">
      <div>
        <header className="page__head">
          <p className="t-eyebrow">{fromQr ? "Dari QR di lokasi" : "Pendaftaran"}</p>
          <h1 className="t-opening measure">
            Ambil tiket kunjungan.{" "}
            <span className="cont">Isi identitas dan nomor rekam medis, lalu pantau antrean dari ponsel Anda.</span>
          </h1>
        </header>

        {existing ? (
          <div className="alert alert--lime" role="status" style={{ marginBottom: 24 }}>
            <Icon name="alert" />
            <div>
              <strong>Anda sudah memiliki tiket aktif untuk kunjungan ini ({existing.number}).</strong>
              <div style={{ marginTop: 12 }}>
                <a className="btn btn--primary" href={existing.url}>
                  Buka tiket {existing.number}
                </a>
              </div>
            </div>
          </div>
        ) : null}
        {formError ? (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 24 }}>
            <Icon name="alert" />
            <div>{formError}</div>
          </div>
        ) : null}

        <form onSubmit={submit} noValidate className="stack-24" aria-label="Formulir pendaftaran tiket">
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="nik">NIK (KTP)</label>
              <input
                id="nik" ref={refs.nik} className="input input--mono" inputMode="numeric" autoComplete="off" maxLength={19}
                placeholder="16 digit angka" value={nik} onChange={(e) => setNik(e.target.value)} {...err("nik")}
              />
              {errors.nik ? errText("nik") : <span className="hint">Dipakai untuk menghubungkan tiket ke identitas Anda. Tidak ditampilkan di halaman tiket.</span>}
            </div>
            <div className="field">
              <label htmlFor="mrn">Nomor rekam medis</label>
              <input
                id="mrn" ref={refs.mrn} className="input input--mono" autoComplete="off" maxLength={20} placeholder="mis. RM-004120"
                value={mrn} onChange={(e) => setMrn(e.target.value)} {...err("mrn")}
              />
              {errors.mrn ? errText("mrn") : <span className="hint">Tertera di kartu berobat.</span>}
            </div>
            <div className="field">
              <label htmlFor="nama">Nama lengkap</label>
              <input
                id="nama" ref={refs.nama} className="input" autoComplete="name" maxLength={80} value={name}
                onChange={(e) => setName(e.target.value)} {...err("nama")}
              />
              {errText("nama")}
            </div>
            <div className="field span-2">
              <label htmlFor="kk">
                Nomor KK <span className="opt">(opsional)</span>
              </label>
              <input
                id="kk" ref={refs.kk} className="input input--mono" inputMode="numeric" autoComplete="off" maxLength={19}
                placeholder="16 digit angka" value={kk} onChange={(e) => setKk(e.target.value)} {...err("kk")}
              />
              {errText("kk")}
            </div>
            <div className="field">
              <label htmlFor="poli">Poli tujuan</label>
              <select
                id="poli" ref={refs.poli} className="select" value={clinicId} onChange={(e) => setClinicId(e.target.value)} {...err("poli")}
              >
                {clinics.length > 1 || !clinicId ? <option value="">Pilih poli</option> : null}
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errText("poli")}
            </div>
            <div className="field">
              <label htmlFor="tanggal">Tanggal kunjungan</label>
              <input
                id="tanggal" ref={refs.tanggal} type="date" className="input" min={bounds.today} max={bounds.max} value={date}
                onChange={(e) => setDate(e.target.value)} {...err("tanggal")}
              />
              {errText("tanggal")}
            </div>
          </div>
          <div className="row">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {busy ? "Membuat tiket…" : "Buat tiket"}
            </button>
            <span className="hint">Rumah sakit: {hospital.name}</span>
          </div>
        </form>
      </div>

      <aside className="aside-note panel panel--flat" aria-label="Yang terjadi setelah ini">
        <h2 className="t-card" style={{ fontSize: 20 }}>Setelah tiket terbit</h2>
        <ol className="steps" style={{ marginTop: 12 }}>
          <li className="steps__item">
            <span className="steps__no">1</span>
            <p className="t-small">Anda diarahkan ke halaman tiket. Simpan tautannya atau tambahkan ke layar utama.</p>
          </li>
          <li className="steps__item">
            <span className="steps__no">2</span>
            <p className="t-small">Halaman menyegarkan status sendiri; perubahan dari petugas tampil paling lambat 10 detik kemudian. Tidak perlu muat ulang.</p>
          </li>
          <li className="steps__item">
            <span className="steps__no">3</span>
            <p className="t-small">Tanda muncul saat giliran dekat dan saat obat siap diambil.</p>
          </li>
        </ol>
        <p className="hint" style={{ marginTop: 16 }}>
          Perkiraan waktu dihitung dari durasi layanan yang diatur rumah sakit, bukan janji layanan.
        </p>
      </aside>
    </div>
  );
}
